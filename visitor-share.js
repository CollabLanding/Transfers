(()=>{
 "use strict";
 const access=window.TransfersAccess,config=window.TRANSFERS_CONFIG||{};
 if(!access)return;
 const client=window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey);
 const icon='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/></svg>';
 let button=null,link="",owner=null,loading=false,resetTimer=null;
 async function loadLink(){
  if(loading||!access.isAdmin())return;
  loading=true;button.disabled=true;const requestedUser=access.userId;
  try{
   const result=await client.rpc("get_visitor_board_share_link");
   if(result.error)throw result.error;
   if(typeof result.data!=="string"||!result.data.startsWith("https://collablanding.github.io/Transfers/visitor.html#key="))throw Error("Visitor link unavailable");
   if(access.userId===requestedUser&&access.isAdmin())link=result.data;
   if(button)button.title="Copy visitor link";
  }catch{if(button)button.title="Could not load visitor link. Click to retry."}
  finally{loading=false;if(button)button.disabled=false}
 }
 function sync(){
  if(!access.isAdmin()){button?.remove();button=null;link="";owner=null;return}
  if(owner!==access.userId){link="";owner=access.userId}
  if(!button){
   const host=document.querySelector("header .header-right");if(!host)return;
   button=document.createElement("button");button.type="button";button.className="visitor-share-button";button.dataset.noTranslate="";button.setAttribute("aria-label","Copy visitor link");button.title="Copy visitor link";button.innerHTML=icon;
   button.style.cssText="width:38px;height:36px;padding:7px;flex:0 0 auto;background:transparent;color:inherit;border:1px solid #53616e;border-radius:8px";
   button.addEventListener("click",()=>{
    if(!access.isAdmin())return;
    if(!link){loadLink();return}
    if(!navigator.clipboard?.writeText){button.title="Clipboard copying is unavailable in this browser.";return}
    button.disabled=true;
    navigator.clipboard.writeText(link).then(()=>{
     if(!button)return;button.textContent="✓";button.title="Visitor link copied";
     clearTimeout(resetTimer);resetTimer=setTimeout(()=>{if(button){button.innerHTML=icon;button.title="Copy visitor link"}},2000);
    }).catch(()=>{if(button)button.title="Could not copy visitor link. Check clipboard permission for this site."})
    .finally(()=>{if(button)button.disabled=false});
   });
   host.prepend(button);
  }
  if(!link)loadLink();
 }
 access.ready.then(sync);document.addEventListener("transfer-access-changed",sync);
})();
