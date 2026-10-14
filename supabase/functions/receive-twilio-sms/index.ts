import twilio from "npm:twilio@6.2.0";
// Public webhook, authenticated by Twilio's official signature validator.
function json(body, status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}})}
function accepted(){return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>',{status:200,headers:{"Content-Type":"text/xml"}})}
function normalizePhone(raw){const v=String(raw||"").trim(),d=v.replace(/\D/g,"");return v.startsWith("+")&&d.length>=8&&d.length<=15?"+"+d:null}
function serverKey(env){try{const keys=JSON.parse(env("SUPABASE_SECRET_KEYS")||"{}");if(keys.default||Object.values(keys)[0])return String(keys.default||Object.values(keys)[0])}catch{}return env("SUPABASE_SERVICE_ROLE_KEY")||""}
async function handle(req,env=name=>Deno.env.get(name)){
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const account=env("TWILIO_ACCOUNT_SID")||"",token=env("TWILIO_AUTH_TOKEN")||"",dispatch=normalizePhone(env("TWILIO_FROM_NUMBER")),base=(env("SUPABASE_URL")||"").replace(/\/$/,"");
 if(env("TWILIO_INBOUND_ENABLED")!=="true"||!/^AC[0-9a-f]{32}$/i.test(account)||!token||!dispatch||!base)return json({error:"Twilio incoming SMS is not configured yet"},503);
 if(!String(req.headers.get("content-type")||"").toLowerCase().startsWith("application/x-www-form-urlencoded"))return json({error:"Form encoded webhook required"},415);
 const reader=req.body?.getReader();if(!reader)return json({error:"Missing payload"},400);
 let size=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return json({error:"Payload too large"},413)}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 const form=new URLSearchParams(new TextDecoder().decode(bytes)),params={};
 for(const [key,value] of form){if(Object.hasOwn(params,key)){params[key]=Array.isArray(params[key])?[...params[key],value]:[params[key],value]}else params[key]=value}
 const callback=env("TWILIO_INBOUND_WEBHOOK_URL")||base+"/functions/v1/receive-twilio-sms";
 let valid=false;try{valid=twilio.validateRequest(token,req.headers.get("X-Twilio-Signature")||"",callback,params)}catch{}
 if(!valid||params.AccountSid!==account)return json({error:"Webhook authentication failed"},401);
 if(params.To!==dispatch)return accepted();
 if(params.NumMedia!=="0")return accepted();
 const id=typeof params.MessageSid==="string"?params.MessageSid:"",from=normalizePhone(params.From),text=params.Body;
 if(!/^SM[0-9a-f]{32}$/i.test(id)||!from||typeof text!=="string"||text.length>1600)return json({error:"Invalid SMS event"},400);
 // Obtain the original Twilio timestamp so delayed retries cannot act as new replies.
 let at;
 try{
  const response=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+account+"/Messages/"+id+".json",{headers:{Authorization:"Basic "+btoa(account+":"+token)},signal:AbortSignal.timeout(15000)});
  if(!response.ok)return json({error:"Could not verify message metadata; retry safely"},503);
  const message=await response.json();
  if(message.sid!==id||message.account_sid!==account||message.direction!=="inbound"||message.from!==from||message.to!==dispatch||message.body!==text)return json({error:"Message metadata mismatch"},401);
  at=new Date(message.date_created);if(!message.date_created||!Number.isFinite(at.getTime()))return json({error:"Invalid message timestamp"},503);
 }catch{return json({error:"Message verification unavailable; retry safely"},503)}
 const key=serverKey(env);if(!key)return json({error:"Server configuration incomplete"},503);
 try{
  const response=await fetch(base+"/rest/v1/rpc/process_twilio_driver_sms_reply",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({p_message_id:id,p_from:from,p_to:dispatch,p_text:text,p_message_at:at.toISOString()}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)return json({error:"Reply processing failed; retry safely"},503);
  return accepted();
 }catch{return json({error:"Reply processing unavailable; retry safely"},503)}
}
Deno.serve(req=>handle(req));
