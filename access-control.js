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
 let shareButton=null,shareBusy=false,shareReset=null;
 const shareIcon='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/></svg>';
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
     const r=await sb.rpc("get_visitor_board_share_link");if(r.error)throw r.error;if(!isAdmin())return;
     let copied=false;
     try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(r.data);copied=true}}catch{}
     if(!copied){
      const field=document.createElement("textarea");field.value=r.data;field.readOnly=true;field.style.cssText="position:fixed;left:0;top:0;opacity:0";document.body.append(field);field.select();
      try{copied=document.execCommand("copy")}catch{}field.remove();shareButton.focus();
     }
     if(copied){shareButton.textContent="✓";shareButton.title="Copied";shareButton.setAttribute("aria-label","Visitor link copied");clearTimeout(shareReset);shareReset=setTimeout(()=>{shareButton.innerHTML=shareIcon;shareButton.title="Copy visitor board link";shareButton.setAttribute("aria-label",shareButton.title)},2000)}
     else{
      const d=document.createElement("dialog"),h=document.createElement("h2"),input=document.createElement("input"),close=document.createElement("button");h.textContent="Visitor board link";input.value=r.data;input.readOnly=true;input.setAttribute("aria-label","Visitor board link");input.style.width="100%";close.textContent="Close";close.onclick=()=>d.close();d.style.cssText="width:min(520px,90vw);padding:20px;border-radius:12px;background:var(--panel);color:var(--text)";d.append(h,input,close);document.body.append(d);d.onclose=()=>d.remove();d.showModal();input.select();
     }
    }catch(error){alert("Could not copy visitor link: "+error.message)}
    finally{shareBusy=false;shareButton.disabled=false}
   };
  }
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