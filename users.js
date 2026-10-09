(async()=>{
 await window.TransfersAccess.ready;
 if(!window.TransfersAccess.isAdmin())return;
 const c=window.TRANSFERS_CONFIG,sb=window.supabase.createClient(c.supabaseUrl,c.supabaseAnonKey);
 const rows=document.getElementById("userAccessRows"),message=document.getElementById("usersMessage");
 const signout=document.getElementById("signout");
 if(signout){signout.classList.remove("hidden");signout.onclick=async()=>{await sb.auth.signOut();location.replace("index.html")}}
 const session=(await sb.auth.getSession()).data.session;
 document.getElementById("me").textContent=session?.user?.email?.split("@")[0]||"";
 document.getElementById("email").textContent=session?.user?.email||"";
 const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));


 const roles=["Admin","User","Vendor"],owner=window.TransfersAccess.role==="Owner";
 const permissionRows=document.getElementById("permissionsRows"),permissionsDialog=document.getElementById("permissionsDialog"),permissionMessage=document.getElementById("permissionsMessage"),savePermissions=document.getElementById("savePermissions");
 let catalog=[],draft=null,revision=null,dirty=false,saving=false;
 function renderPermissions(){
  let group="";
  permissionRows.innerHTML=catalog.map(feature=>{
   const heading=feature.group!==group?'<tr class="permission-group"><th colspan="4" scope="colgroup">'+esc(feature.group)+'</th></tr>':"";group=feature.group;
   return heading+'<tr><th scope="row">'+esc(feature.label)+'</th>'+roles.map(role=>{
    const locked=!owner||feature.fixed||(feature.adminOnly&&role!=="Admin");
    return '<td><input class="permission-check" type="checkbox" data-role="'+role+'" data-feature="'+esc(feature.key)+'"'+(draft[role][feature.key]?' checked':'')+(locked?' disabled':'')+' aria-label="'+esc(role+": "+feature.label)+'"></td>';
   }).join("")+'</tr>';
  }).join("");
  savePermissions.hidden=!owner;savePermissions.disabled=!dirty||saving;
 }
 function setPermission(role,key,value,seen=new Set()){
  if(seen.has(key))return;seen.add(key);draft[role][key]=value;
  if(value){for(const parent of catalog.find(x=>x.key===key)?.dependencies||[])setPermission(role,parent,true,seen)}
  else{for(const child of catalog.filter(x=>x.dependencies?.includes(key)))setPermission(role,child.key,false,seen)}
 }
 permissionRows.addEventListener("change",event=>{
  if(!owner||saving||!event.target.matches(".permission-check"))return;
  setPermission(event.target.dataset.role,event.target.dataset.feature,event.target.checked);dirty=true;permissionMessage.textContent="Unsaved changes.";renderPermissions();
 });
 async function loadPermissions(){
  permissionMessage.textContent="Loading permissions…";savePermissions.disabled=true;
  const r=await sb.rpc("get_transfer_role_permissions");
  if(r.error){permissionMessage.textContent=r.error.message;return}
  catalog=r.data.catalog;draft=r.data.roles;revision=r.data.revision;dirty=false;renderPermissions();
  permissionMessage.textContent=owner?"Change checkboxes, then Save Permissions. Sign out is always available; user administration remains limited to Admins.":"Only the Owner can edit permissions.";
 }
 document.getElementById("permissionsButton").onclick=async()=>{if(!window.TransfersAccess.can("view_permissions"))return;permissionsDialog.showModal();await loadPermissions()};
 document.getElementById("closePermissions").onclick=()=>permissionsDialog.close();
 savePermissions.onclick=async()=>{
  if(!owner||!dirty||saving)return;saving=true;renderPermissions();
  const r=await sb.rpc("save_transfer_role_permissions",{p_roles:draft,p_revision:revision});
  saving=false;if(r.error){permissionMessage.textContent=r.error.message;renderPermissions();return}
  await loadPermissions();permissionMessage.textContent="Permissions saved.";await window.TransfersAccess.refresh();
 };
 permissionsDialog.addEventListener("click",event=>{
  const rect=permissionsDialog.getBoundingClientRect();
  if(event.target===permissionsDialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))permissionsDialog.close();
 });

 async function load(){
  if(!window.TransfersAccess.can("manage_users"))return;
  message.textContent="Loading users…";
  const r=await sb.rpc("list_transfer_users");
  if(r.error){message.textContent=r.error.message;rows.innerHTML="";return}
  rows.innerHTML=(r.data||[]).map(u=>{
   const locked=u.role==="Owner"||u.id===window.TransfersAccess.userId;
   return '<tr data-user-id="'+esc(u.id)+'"><td>'+esc(u.email)+'</td><td class="user-display-name">'+esc(u.display_name)+'</td><td>'+(locked?esc(u.role)+(u.role==="Owner"?' · Protected':' · Your account'):'<select aria-label="Role for '+esc(u.email)+'"><option value="Vendor"'+(u.role==="Vendor"?' selected':'')+'>Vendor</option><option value="User"'+(u.role==="User"?' selected':'')+'>User</option><option value="Admin"'+(u.role==="Admin"?' selected':'')+'>Admin</option></select>')+'</td><td>'+(locked?'':'<button type="button">Save</button>')+'</td></tr>';
  }).join("");
  rows.querySelectorAll("button").forEach(button=>button.onclick=async()=>{
   const row=button.closest("tr");button.disabled=true;
   const r=await sb.rpc("set_transfer_user_role",{p_user_id:row.dataset.userId,p_role:row.querySelector("select").value});
   button.disabled=false;
   if(r.error){message.textContent=r.error.message;return}
   await load();message.textContent="Role saved.";
  });
  message.textContent=(r.data||[]).length+" registered users";
 }
 document.getElementById("refreshUsers").onclick=load;
 if(window.TransfersAccess.can("manage_users"))await load();else{document.querySelector(".user-access-table")?.setAttribute("hidden","");message.textContent="User management is disabled for your role.";document.getElementById("refreshUsers").hidden=true}
})();
