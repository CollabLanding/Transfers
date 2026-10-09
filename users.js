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
 async function load(){
  message.textContent="Loading users…";
  const r=await sb.rpc("list_transfer_users");
  if(r.error){message.textContent=r.error.message;rows.innerHTML="";return}
  rows.innerHTML=(r.data||[]).map(u=>{
   const locked=u.role==="Owner"||u.id===window.TransfersAccess.userId;
   return '<tr data-user-id="'+esc(u.id)+'"><td>'+esc(u.email)+'</td><td class="user-display-name">'+esc(u.display_name)+'</td><td>'+(locked?esc(u.role)+(u.role==="Owner"?' · Protected':' · Your account'):'<select aria-label="Role for '+esc(u.email)+'"><option value="User"'+(u.role==="User"?' selected':'')+'>User</option><option value="Admin"'+(u.role==="Admin"?' selected':'')+'>Admin</option></select>')+'</td><td>'+(locked?'':'<button type="button">Save</button>')+'</td></tr>';
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
