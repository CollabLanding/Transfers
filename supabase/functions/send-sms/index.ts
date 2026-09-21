import { createClient } from "npm:@supabase/supabase-js@^2";
import { corsHeaders } from "npm:@supabase/supabase-js@^2/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function envKey(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return String(parsed.default);
      const first = Object.values(parsed || {})[0];
      if (first) return String(first);
    } catch {
      // Fall through to the legacy environment variable.
    }
  }
  return Deno.env.get(legacyName) || "";
}

function normalizePhone(raw: string) {
  const original = String(raw || "").trim();
  const digits = original.replace(/\D/g, "");
  if (original.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return "+" + digits;
  }
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  throw new Error("Enter a valid US cell number or an international number in E.164 format.");
}

function maskedPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? "ending " + digits.slice(-4) : "driver number";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json({ error: "Supabase function environment is incomplete." }, 500);
  }

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization) return json({ error: "Authentication required." }, 401);

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return json({ error: "Authentication required." }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON request." }, 400);
  }

  const transferId = String(payload.transfer_id || "").trim();
  const rawPhone = String(payload.phone || "").trim();
  const message = String(payload.message || "").trim();
  const requestedType = String(payload.message_type || "custom").toLowerCase();
  const messageType = ["assignment", "update", "delay"].includes(requestedType)
    ? requestedType
    : "custom";

  if (!transferId) return json({ error: "Transfer ID is required." }, 400);
  if (!message) return json({ error: "Message cannot be empty." }, 400);
  if (message.length > 1600) return json({ error: "Message must be 1,600 characters or less." }, 400);

  let to: string;
  try {
    to = normalizePhone(rawPhone);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Invalid phone number." }, 400);
  }

  const { data: transfer, error: transferError } = await admin
    .from("transfers")
    .select("id,move_number,driver,job_number,scheduled_date,scheduled_time,origin,destination,order_status")
    .eq("id", transferId)
    .single();

  if (transferError || !transfer) return json({ error: "Transfer not found." }, 404);

  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER") || "";
  const messagingServiceSid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") || "";

  if (!twilioSid || !twilioToken || (!twilioFrom && !messagingServiceSid)) {
    return json({
      error: "Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER to Supabase Edge Function secrets.",
    }, 503);
  }

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("Body", message);
  if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
  else form.set("From", twilioFrom);

  let twilioResponse: Response;
  try {
    twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(twilioSid + ":" + twilioToken),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      },
    );
  } catch {
    return json({ error: "Could not reach Twilio." }, 502);
  }

  let twilioData: Record<string, unknown> = {};
  try {
    twilioData = await twilioResponse.json();
  } catch {
    // Keep an empty object if Twilio did not return JSON.
  }

  if (!twilioResponse.ok) {
    return json({
      error: String(twilioData.message || "Twilio rejected the message."),
      code: twilioData.code || null,
    }, 502);
  }

  const providerSid = String(twilioData.sid || "");
  const providerStatus = String(twilioData.status || "queued");

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const actorName = profile?.display_name || user.user_metadata?.display_name || user.email?.split("@")[0] || "User";

  await admin
    .from("transfer_drivers")
    .update({ phone_number: to })
    .eq("name", transfer.driver);

  const { error: logError } = await admin.from("transfer_sms_log").insert({
    transfer_id: transfer.id,
    driver: transfer.driver,
    to_number: to,
    message,
    message_type: messageType,
    provider_message_sid: providerSid || null,
    provider_status: providerStatus,
    actor_id: user.id,
    actor_name: actorName,
  });

  // Best-effort activity entry. This integrates with the existing Recent Activity feed
  // when migration-v4.sql has created transfer_activity.
  await admin.from("transfer_activity").insert({
    transfer_id: transfer.id,
    action: "SMS sent",
    actor_id: user.id,
    actor_name: actorName,
    job_number: transfer.job_number,
    driver: transfer.driver,
    details: messageType.charAt(0).toUpperCase() + messageType.slice(1) + " text sent to " + maskedPhone(to),
  });

  return json({
    ok: true,
    sid: providerSid,
    status: providerStatus,
    to,
    log_warning: logError ? logError.message : null,
  });
});
