(()=>{
  const config=window.TRANSFERS_CONFIG||{};
  const sb=window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey);
  const protectedPages=new Set(["drivers.html","driver-profile.html","locations.html","summary.html","users.html"]);
  const page=location.pathname.split("/").pop()||"index.html";
  let role=null,userId=null,generation=0;
  function isAdmin(){return role==="Owner"||role==="Admin"}
  async function refresh(session){
    const version=++generation;
    if(session===undefined){const result=await sb.auth.getSession();session=result.data?.session}
    userId=session?.user?.id||null;
    let next=null;
    if(userId){const result=await sb.rpc("get_transfer_access_role");next=result.error?"Vendor":result.data}
    if(version!==generation)return role;
    const previousRole=role;
    role=next;
    document.documentElement.dataset.accessRole=role||"signed-out";
    document.querySelectorAll("[data-admin-only]").forEach(node=>{node.hidden=!isAdmin()});
    const roleLabel=document.getElementById("accessRoleLabel");
    if(roleLabel)roleLabel.textContent=role||"";
    if(protectedPages.has(page)&&!isAdmin()){location.replace("index.html");return role}
    if(previousRole&&previousRole!==role){location.reload();return role}
    document.dispatchEvent(new CustomEvent("transfer-access-changed",{detail:{role}}));
    return role;
  }
  const api={isAdmin,refresh,get role(){return role},get userId(){return userId},ready:null};
  window.TransfersAccess=api;
  api.ready=refresh();
  sb.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>api.ready.then(()=>refresh(session)),0)});
  window.addEventListener("focus",()=>refresh());
  setInterval(()=>{if(!document.hidden)refresh()},30000);
})();
