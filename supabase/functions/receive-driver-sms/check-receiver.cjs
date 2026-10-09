const fs=require('fs'),vm=require('vm'),assert=require('assert'),{webcrypto}=require('crypto');
const source=fs.readFileSync(__dirname+'/index.ts','utf8');
const secret='test-only-webhook-secret-at-least-32-characters';
async function token(event,alg='HS256',key=secret){
 const h=Buffer.from(JSON.stringify({alg,typ:'JWT'})).toString('base64url');
 const p=Buffer.from(JSON.stringify(event)).toString('base64url');
 const k=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await webcrypto.subtle.sign('HMAC',k,new TextEncoder().encode(h+'.'+p));
 return h+'.'+p+'.'+Buffer.from(signature).toString('base64url');
}
async function run(body,overrides={},dbStatus=200){
 let handler;const calls=[];
 const env={INBOUND_SMS_ENABLED:'true',DIALPAD_WEBHOOK_SECRET:secret,DIALPAD_FROM_NUMBER:'+15550101000',SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'mock-service-key',...overrides};
 vm.runInNewContext(source,{Deno:{env:{get:k=>env[k]},serve:f=>handler=f},TextEncoder,TextDecoder,Uint8Array,atob,crypto:webcrypto,Request,Response,AbortSignal,fetch:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return new Response(JSON.stringify({outcome:'updated',transfer_id:'mock'}),{status:dbStatus})}});
 const r=await handler(new Request('https://example.invalid',{method:'POST',body}),{remoteAddr:{hostname:'127.0.0.1',port:1234}});return {status:r.status,data:await r.json(),calls};
}
(async()=>{
 const event={id:12345,direction:'inbound',created_date:Date.now(),from_number:'+15550101999',to_number:['+15550101000'],text:'Loaded',mms:false};
 let r=await run(await token(event));assert.equal(r.status,200);assert.equal(r.calls.length,1);assert.equal(r.calls[0].body.p_from,event.from_number);assert.equal(r.calls[0].body.p_message_id,'12345');assert.equal(r.calls[0].body.p_text,'Loaded');
 for(const body of [JSON.stringify(event),await token(event,'none'),await token(event,'HS256','wrong-secret')]){r=await run(body);assert.equal(r.status,401);assert.equal(r.calls.length,0)}
 r=await run(await token(event),{INBOUND_SMS_ENABLED:''});assert.equal(r.status,503);assert.equal(r.calls.length,0);
 r=await run(await token({...event,direction:'outbound'}));assert.equal(r.data.outcome,'ignored_event');assert.equal(r.calls.length,0);
 r=await run(await token({...event,mms:true}));assert.equal(r.calls.length,0);
 r=await run(await token({...event,to_number:['+15550102000']}));assert.equal(r.data.outcome,'wrong_recipient');assert.equal(r.calls.length,0);
 r=await run(await token({...event,text:undefined}));assert.equal(r.status,422);assert.equal(r.calls.length,0);
 r=await run(await token({...event,exp:1}));assert.equal(r.status,401);assert.equal(r.calls.length,0);
 r=await run('x'.repeat(16385));assert.equal(r.status,413);assert.equal(r.calls.length,0);
 r=await run(await token(event),{},500);assert.equal(r.status,503);
 console.log('PASS: signed inbound request, invalid signatures, disabled setup, outbound/MMS/other recipients, missing content, expiry, payload limit, retryable DB errors. No real SMS sent.');
})().catch(e=>{console.error(e);process.exitCode=1});
