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

 const permissionFeatures=[["Transfers","View Transfers board",["User"]],["Transfers","Change day and view the clock / planning count",["User"]],["Transfers","Build a new transfer load",["User","Vendor"]],["Transfers","Set urgent flag and pickup / delivery deadlines",["User","Vendor"]],["Transfers","Edit load details and order status",["User"]],["Transfers","Delete loads",["User"]],["Transfers","Drag loads between drivers and times",["User"]],["Transfers","Resize load duration",["User"]],["Transfers","Duplicate a load",["User"]],["Transfers","Duplicate a day's loads",["User"]],["Transfers","Assign time-slot statuses",["User"]],["Transfers","Edit time-slot notes and custom titles",["User"]],["Transfers","Move, resize, and delete time-slot boxes",["User"]],["Transfers","Link and unlink job / status boxes",["User"]],["Transfers","Reorder driver columns",[]],["Transfers","View status history",[]],["Transfers","Edit status change times",[]],["Transfers","Text drivers",[]],["Drivers","View and edit driver schedules",[]],["Drivers","Copy schedules by day, week, or month",[]],["Drivers","Add drivers and edit driver information",[]],["Drivers","Manage driver phone numbers",[]],["Drivers","Set weekly schedules and automatic monthly repeats",[]],["Drivers","Run driver reports and export PDF",[]],["Drivers","View driver activity and overtime indicators",[]],["Locations","View, add, edit, and delete locations",[]],["Summary","Run past-job and status reports",[]],["Summary","Filter by date, driver, type, status, location, and search",[]],["Summary","Export CSV and print reports",[]],["Summary","View deleted records",[]],["Summary","Edit record dates and statuses",[]],["Summary","Restore deleted jobs and time-slot statuses",[]],["Communication and access","Use Team Chat and emojis",[]],["Communication and access","Clear Team Chat",[]],["Communication and access","View, search, and open Recent Activity records",[]],["Communication and access","View Active Users",[]],["Communication and access","Open User Access and assign roles",[]],["Communication and access","View this Permissions grid",[]],["Communication and access","Show Live Trailer Board link",[]],["Communication and access","Switch light / dark theme",["User"]],["Communication and access","Sign out",["User","Vendor"]]];
 const roles=["Owner","Admin","User","Vendor"];
 const permissionRows=document.getElementById("permissionsRows");
 let previousGroup="";
 permissionRows.innerHTML=permissionFeatures.map(([group,feature,additional])=>{
  let heading="";
  if(group!==previousGroup){heading='<tr class="permission-group"><th colspan="5" scope="colgroup">'+esc(group)+'</th></tr>';previousGroup=group}
  return heading+'<tr><th scope="row">'+esc(feature)+'</th>'+roles.map(role=>{
   const allowed=role==="Owner"||role==="Admin"||additional.includes(role);
   return '<td><input class="permission-check" type="checkbox" disabled'+(allowed?' checked':'')+' aria-label="'+esc(role+": "+feature)+'"></td>';
  }).join("")+'</tr>';
 }).join("");
 const permissionsDialog=document.getElementById("permissionsDialog");
 document.getElementById("permissionsButton").onclick=()=>{if(window.TransfersAccess.isAdmin())permissionsDialog.showModal()};
 document.getElementById("closePermissions").onclick=()=>permissionsDialog.close();
 permissionsDialog.addEventListener("click",event=>{
  const rect=permissionsDialog.getBoundingClientRect();
  if(event.target===permissionsDialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))permissionsDialog.close();
 });

 async function load(){
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
 await load();
})();
