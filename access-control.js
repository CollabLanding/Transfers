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
  ".deadline-controls":"load_deadlines",".resize-handle":"resize_load",".load-chain":"link_boxes",".slot-status-delete,.slot-resize-handle":"manage_status",
  "#slotStatusEditor":"status_notes",".copy-day,.copy-week,.copy-month":"copy_schedules",".clear-shift,#saveSchedule":"driver_schedules",
  "#addDriver":"driver_profiles","#runReports":"driver_reports",".driver-history-panel":"driver_activity",
  "#driverPhone":"driver_phones",".template-import,.profile-week-wrap,.repeat-option,#repeatStatus,#applySchedulePanel":"repeat_schedules",
  "#exportCsv,#printReport":"summary_export",".record-edit-control,.record-save":"summary_edit",
  "#clearChat":"clear_chat","#signout,#vendorSignout":"sign_out","#permissionsButton":"view_permissions"
 };
 function apply(){
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