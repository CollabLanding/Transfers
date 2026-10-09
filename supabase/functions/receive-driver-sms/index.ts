// Dialpad signs the entire webhook body as an HS256 JWT. Never accept unsigned JSON.
const encoder = new TextEncoder();
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
async function verifyEvent(body, secret) {
  const token = body.trim().startsWith('"') ? JSON.parse(body) : body.trim();
  if (typeof token !== 'string') throw new Error('Signed JWT required');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Signed JWT required');
  const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
  if (header.alg !== 'HS256') throw new Error('HS256 required');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('HMAC', key, decode(parts[2]), encoder.encode(parts[0] + '.' + parts[1]))) throw new Error('Invalid signature');
  const event = JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Invalid event');
  const now = Date.now() / 1000;
  if (event.exp !== undefined && (typeof event.exp !== 'number' || event.exp <= now)) throw new Error('Expired JWT');
  if (event.nbf !== undefined && (typeof event.nbf !== 'number' || event.nbf > now + 60)) throw new Error('Premature JWT');
  return event;
}
function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim(), d = value.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.startsWith('1')) return '+' + d;
  if (value.startsWith('+') && d.length >= 8 && d.length <= 15) return '+' + d;
  return null;
}
function serverKey(env) {
  const raw = env('SUPABASE_SECRET_KEYS');
  if (raw) { try { const keys = JSON.parse(raw); return String(keys.default || Object.values(keys)[0] || ''); } catch { /* legacy fallback */ } }
  return env('SUPABASE_SERVICE_ROLE_KEY') || '';
}
async function handle(req, env = name => Deno.env.get(name)) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = env('DIALPAD_WEBHOOK_SECRET') || '';
  const dispatch = normalizePhone(env('DIALPAD_FROM_NUMBER') || '');
  if (env('INBOUND_SMS_ENABLED') !== 'true' || secret.length < 32 || !dispatch) return json({ error: 'Incoming SMS is not configured yet' }, 503);
  if (Number(req.headers.get('content-length') || 0) > 16384) return json({ error: 'Payload too large' }, 413);
  // Bound the streamed body even if Content-Length is omitted.
  const reader = req.body?.getReader();
  if (!reader) return json({ error: 'Missing payload' }, 400);
  let size = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); return json({ error: 'Payload too large' }, 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let event;
  try { event = await verifyEvent(new TextDecoder().decode(bytes), secret); }
  catch { return json({ error: 'Webhook authentication failed' }, 401); }
  if (event.direction !== 'inbound' || event.mms === true) return json({ ok: true, outcome: 'ignored_event' });
  const recipients = Array.isArray(event.to_number) ? event.to_number.map(normalizePhone) : [];
  if (recipients.length !== 1 || recipients[0] !== dispatch) return json({ ok: true, outcome: 'wrong_recipient' });
  const from = normalizePhone(event.from_number);
  const id = typeof event.id === 'string' ? event.id : Number.isSafeInteger(event.id) ? String(event.id) : '';
  const at = typeof event.created_date === 'number' && Number.isFinite(event.created_date) ? new Date(event.created_date) : null;
  if (!from || !id || id.length > 150 || !at || !Number.isFinite(at.getTime())) return json({ error: 'Invalid SMS event' }, 400);
  if (typeof event.text !== 'string') return json({ error: 'SMS text is missing; enable Dialpad message content export' }, 422);
  if (event.text.length > 1600) return json({ error: 'Message too long' }, 400);
  const url = env('SUPABASE_URL') || '', key = serverKey(env);
  if (!url || !key) return json({ error: 'Server configuration incomplete' }, 503);
  try {
    const response = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/process_driver_sms_reply', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_message_id: id, p_from: from, p_to: dispatch, p_text: event.text, p_message_at: at.toISOString() }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return json({ error: 'Reply processing failed; event may be retried safely' }, 503);
    return json({ ok: true, ...await response.json() });
  } catch { return json({ error: 'Reply processing unavailable; retry safely' }, 503); }
}
Deno.serve(req => handle(req));
