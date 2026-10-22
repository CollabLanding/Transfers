(()=>{
 const config=window.TRANSFERS_CONFIG||{},sb=window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey);
 const driverFeatures=["driver_schedules","copy_schedules","driver_profiles","driver_phones","repeat_schedules","driver_reports","driver_activity"];
 const page=location.pathname.split("/").pop()||"index.html";
 let role=null,permissions={},userId=null,generation=0,signature=null;
 const can=key=>role==="Owner"||permissions[key]===true;
 const any=keys=>keys.some(can);
 const isAdmin=()=>role==="Owner"||role==="Admin";
 const pageAllowed=()=>page==="drivers.html"?any(driverFeatures):page==="driver-profile.html"?can("driver_profiles"):page==="locations.html"?can("locations"):page==="summary.html"?can("summary_reports"):page==="users.html"?isAdmin()&&any(["manage_users","view_permissions"]):true;
 const controlPermissions={
  "#duplicateDay":"duplicate_day","#textDriver":"send_sms","#statusHistory,#statusHistoryScreen":"status_history",
  ".created-by-link":"recent_activity","#delete":"delete_load","#duplicate":"duplicate_load",
  ".urgent-toggle":"load_deadlines",".resize-handle":"resize_load",".load-chain":"link_boxes",".slot-status-delete,.slot-resize-handle":"manage_status",
  "#slotStatusEditor":"status_notes",".copy-day,.copy-week,.copy-month":"copy_schedules",".clear-shift,#saveSchedule":"driver_schedules",
  "#addDriver":"driver_profiles","#runReports":"driver_reports",".driver-history-panel":"driver_activity",
  "#driverPhone":"driver_phones",".template-import,.profile-week-wrap,.repeat-option,#repeatStatus,#applySchedulePanel":"repeat_schedules",
  "#exportCsv,#printReport":"summary_export",".record-edit-control,.record-save":"summary_edit",
  "#clearChat":"clear_chat","#signout,#vendorSignout":"sign_out","#permissionsButton":"view_permissions"
 };
 let shareButton=null,shareBusy=false,shareReset=null,shareLink="",shareLinkUser=null,shareLinkPromise=null;
 const shareIcon='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/></svg>';
 function prepareShareLink(){
  const requestedUser=userId;
  if(shareLinkUser!==requestedUser){shareLink="";shareLinkPromise=null;shareLinkUser=requestedUser}
  if(shareLink)return Promise.resolve(shareLink);
  if(shareLinkPromise)return shareLinkPromise;
  shareLinkPromise=sb.rpc("get_visitor_board_share_link").then(r=>{
   if(r.error)throw r.error;
   if(typeof r.data!=="string"||!r.data.startsWith("https://collablanding.github.io/Transfers/visitor.html#key="))throw new Error("Visitor link unavailable.");
   if(isAdmin()&&userId===requestedUser)shareLink=r.data;
   return r.data;
  }).finally(()=>{if(shareLinkUser===requestedUser)shareLinkPromise=null});
  return shareLinkPromise;
 }
 async function copyShareLink(link){
  if(typeof link!=="string"||!link.trim())return "blocked";
  let sent=false;
  const supply=event=>{if(event.clipboardData){event.preventDefault();event.clipboardData.setData("text/plain",link);sent=true;}};
  document.addEventListener("copy",supply,true);
  try{document.execCommand("copy")}catch{}finally{document.removeEventListener("copy",supply,true)}
  if(navigator.clipboard){
   try{
    if(navigator.clipboard.write&&window.ClipboardItem){
     await navigator.clipboard.write([new ClipboardItem({"text/plain":new Blob([link],{type:"text/plain"})})]);sent=true;
    }else if(navigator.clipboard.writeText){await navigator.clipboard.writeText(link);sent=true;}
   }catch{}
   if(sent&&navigator.clipboard.readText){
    try{return await navigator.clipboard.readText()===link?"verified":"mismatch"}catch{}
   }
  }
  return sent?"requested":"blocked";
 }
 function showShareLink(link){
  const d=document.createElement("dialog"),h=document.createElement("h2"),input=document.createElement("textarea"),copy=document.createElement("button"),close=document.createElement("button"),open=document.createElement("a"),status=document.createElement("p");
  d.dataset.noTranslate="";h.textContent="Visitor board link";input.value=link;input.readOnly=true;input.rows=3;input.setAttribute("aria-label","Visitor board link");input.style.cssText="display:block;width:100%;font:13px/1.5 Arial,sans-serif;overflow-wrap:anywhere;white-space:pre-wrap;padding:10px;margin:12px 0";
  const report=result=>{status.textContent=result==="verified"?"Link copied and verified.":result==="mismatch"?"The clipboard did not retain the link. Select the link above and press Ctrl+C, or right-click it and choose Copy.":"Select the link above and press Ctrl+C, or right-click it and choose Copy.";};
  copy.type="button";copy.textContent="Copy link";copy.onclick=async()=>{input.focus();input.select();input.setSelectionRange(0,link.length);status.textContent="Copying…";report(await copyShareLink(link));};
  open.textContent="Open visitor view";open.href=link;open.target="_blank";open.rel="noopener";open.style.cssText="display:inline-block;margin:10px;color:var(--accent,#1d5c8f)";
  close.type="button";close.textContent="Close";close.onclick=()=>d.close();d.style.cssText="width:min(620px,94vw);padding:20px;border-radius:12px;background:var(--panel);color:var(--text)";status.setAttribute("role","status");d.append(h,input,copy,open,close,status);document.body.append(d);d.onclose=()=>d.remove();d.showModal();input.focus();input.select();report("requested");
  return {report,input};
 }
 function applyShareButton(){
  if(!shareButton){
   const host=document.querySelector("header .header-right")||document.querySelector("header .user-session");if(!host)return;
   shareButton=document.createElement("button");shareButton.type="button";shareButton.className="visitor-share-button hidden";shareButton.dataset.adminOnly="";shareButton.dataset.noTranslate="";
   shareButton.title="Copy visitor board link";shareButton.setAttribute("aria-label","Copy visitor board link");shareButton.innerHTML=shareIcon;
   shareButton.style.cssText="width:38px;height:36px;padding:7px;flex:0 0 auto;background:transparent;color:inherit;border:1px solid #53616e;border-radius:8px";
   host.prepend(shareButton);
   shareButton.onclick=async()=>{
    if(!isAdmin()||shareBusy)return;shareBusy=true;shareButton.disabled=true;
    try{
     const link=shareLink||await prepareShareLink();if(!isAdmin())return;
     const view=showShareLink(link);view.report(await copyShareLink(link));
    }catch(error){alert("Could not copy visitor link: "+error.message)}
    finally{shareBusy=false;shareButton.disabled=false}
   };
  }
  if(isAdmin())prepareShareLink().catch(()=>{});else{shareLink="";shareLinkUser=null;shareLinkPromise=null}
  shareButton.hidden=!isAdmin();shareButton.dataset.accessDenied=String(!isAdmin());shareButton.classList.toggle("hidden",!isAdmin());
 }
 function apply(){
  applyShareButton();
  const root=document.documentElement;
  root.dataset.boardAccess=String(can("view_board"));
  root.dataset.sidebarAccess=String(any(["recent_activity","active_users"]));
  root.dataset.chatAccess=String(can("chat"));
  root.dataset.buildOnly=String(!!role&&can("create_load")&&!any(["view_board","chat","recent_activity","active_users",...driverFeatures,"locations","summary_reports","trailer_link","theme","manage_users","view_permissions"]));
  root.dataset.createAccess=String(can("create_load"));root.dataset.editAccess=String(can("edit_load"));root.dataset.summaryEdit=String(can("summary_edit"));
  const editing=!!document.getElementById("editId")?.value;
  const notesOpen=document.getElementById("slotStatusEditor")&&!document.getElementById("slotStatusEditor").classList.contains("hidden");
  root.dataset.buildAccess=String(can("create_load")||(editing&&can("edit_load"))||(notesOpen&&can("status_notes")));
  root.dataset.pageAllowed=String(pageAllowed());
  const map={...controlPermissions,".chat-panel":"chat",".recent-activity-panel":"recent_activity",".active-users-panel":"active_users",".theme-switch":"theme",".live-board-link":"trailer_link"};
  if(page==="index.html")map[".header-right .nav,.schedule-current-time,.schedule-date,.planning-month-total"]="board_navigation";
  for(const [selector,key] of Object.entries(map))document.querySelectorAll(selector).forEach(node=>{node.dataset.accessDenied=String(!can(key))});
  document.querySelectorAll("[data-permission]").forEach(node=>{node.dataset.accessDenied=String(!any(node.dataset.permission.split(" ")))});
  document.querySelectorAll("[data-admin-only]").forEach(node=>{if(!isAdmin())node.dataset.accessDenied="true";node.hidden=!isAdmin()});
  document.querySelectorAll('a[href^="drivers.html"]').forEach(node=>{node.dataset.accessDenied=String(!any(driverFeatures))});
  document.querySelectorAll('a[href^="locations.html"]').forEach(node=>{node.dataset.accessDenied=String(!can("locations"))});
  document.querySelectorAll('a[href^="summary.html"]').forEach(node=>{node.dataset.accessDenied=String(!can("summary_reports"))});
  document.querySelectorAll('a[href="users.html"]').forEach(node=>{node.dataset.accessDenied=String(!isAdmin()||!any(["manage_users","view_permissions"]))});
  document.querySelectorAll(".driver-name-text").forEach(node=>{node.style.pointerEvents=can("driver_profiles")?"":"none";node.setAttribute("aria-disabled",String(!can("driver_profiles")))});
  document.querySelectorAll(".card").forEach(node=>{node.draggable=can("move_load")});
  document.querySelectorAll(".slot-status-block").forEach(node=>{node.draggable=can("manage_status")});
  document.querySelectorAll(".driverhead").forEach(node=>{node.draggable=can("reorder_drivers")});
  document.querySelectorAll("#driverPhone").forEach(node=>{if(!can("driver_phones"))node.disabled=true});
  document.querySelectorAll("#weeklyTemplate input,#weeklyTemplate button,#autoRepeat").forEach(node=>{if(!can("repeat_schedules"))node.disabled=true});
  document.querySelectorAll(".schedule-day-cell input").forEach(node=>{if(!can("driver_schedules"))node.disabled=true});
  document.querySelectorAll("#period,#dateFrom,#dateTo,#driverSlot,#recordType,#recordStatus,#recordLocation,#recordSearch").forEach(node=>{if(page==="summary.html"&&!can("summary_filters"))node.disabled=true});
  const driver=document.getElementById("driver");if(driver){driver.disabled=role==="Vendor";if(role==="Vendor")driver.value="Planning";}
  const save=document.getElementById("save");if(save)save.dataset.accessDenied=String(!(editing?can("edit_load"):can("create_load")));
  const roleLabel=document.getElementById("accessRoleLabel");if(roleLabel&&roleLabel.textContent!==(role||""))roleLabel.textContent=role||"";
 }
 async function refresh(session){
  const version=++generation;
  if(session===undefined){const r=await sb.auth.getSession();session=r.data?.session}
  userId=session?.user?.id||null;
  let access=null;if(userId){const r=await sb.rpc("get_transfer_access");access=r.error?{role:"Vendor",permissions:{sign_out:true}}:r.data}
  if(version!==generation)return role;
  role=access?.role||null;permissions=access?.permissions||{};
  const nextSignature=JSON.stringify([role,permissions]),previous=signature;signature=nextSignature;
  document.documentElement.dataset.accessRole=role||"signed-out";
  apply();
  if(!pageAllowed()){location.replace("index.html");return role}
  if(previous&&previous!==nextSignature){location.reload();return role}
  document.dispatchEvent(new CustomEvent("transfer-access-changed",{detail:{role,permissions}}));return role;
 }
 const api={isAdmin,can,any,apply,refresh,get role(){return role},get userId(){return userId},get permissions(){return {...permissions}},ready:null};
 window.TransfersAccess=api;api.ready=refresh();
 sb.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>api.ready.then(()=>refresh(session)),0)});
 api.ready.then(()=>{
  apply();
  new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});
  window.addEventListener("focus",()=>refresh());
  setInterval(()=>{if(!document.hidden)refresh()},30000);
 });
})();