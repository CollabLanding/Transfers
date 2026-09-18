(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const list=document.getElementById("recentActivity");
  const active=document.getElementById("active");
  const count=document.getElementById("activeUsersCount");
  if(!list)return;

  function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
  function updateActiveCount(){
    if(!count||!active)return;
    count.textContent=String(active.querySelectorAll(".activeRow").length);
  }
  if(active){
    new MutationObserver(updateActiveCount).observe(active,{childList:true,subtree:true});
    updateActiveCount();
  }

  if(!C.supabaseUrl||!C.supabaseAnonKey||!window.supabase){
    list.innerHTML='<div class="activity-empty">Recent Activity is available in Live mode.</div>';
    return;
  }

  const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);
  let channel=null;

  function actionText(row){
    const job=row.job_number?("Job "+row.job_number):"Transfer";
    const driver=row.driver?(" · "+row.driver):"";
    const details=row.details?(" · "+row.details):"";
    return "<strong>"+esc(job)+"</strong>: "+esc(row.action||"Updated")+esc(driver)+esc(details);
  }

  function render(rows){
    if(!rows||!rows.length){
      list.innerHTML='<div class="activity-empty">No recent activity yet.</div>';
      return;
    }
    list.innerHTML=rows.map(row=>{
      const when=new Date(row.created_at);
      const stamp=Number.isFinite(when.getTime())?when.toLocaleString():"";
      return '<div class="activity-item"><div class="activity-title">'+actionText(row)+'</div><div class="activity-time">'+esc(stamp)+' · '+esc(row.actor_name||"User")+'</div></div>';
    }).join("");
  }

  async function load(){
    const {data,error}=await sb.from("transfer_activity")
      .select("id,transfer_id,action,actor_name,job_number,driver,details,created_at")
      .order("created_at",{ascending:false})
      .limit(40);
    if(error){
      list.innerHTML='<div class="activity-empty">Recent Activity needs the latest Supabase migration.</div>';
      return false;
    }
    render(data||[]);
    return true;
  }

  async function start(){
    const ok=await load();
    if(!ok)return;
    if(channel)await sb.removeChannel(channel);
    channel=sb.channel("transfer-activity-feed")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"transfer_activity"},()=>load())
      .subscribe();
  }

  sb.auth.getSession().then(({data})=>{
    if(data&&data.session)start();
    else list.innerHTML='<div class="activity-empty">Sign in to view recent activity.</div>';
  });
  sb.auth.onAuthStateChange((_event,session)=>{
    if(session)start();
    else list.innerHTML='<div class="activity-empty">Sign in to view recent activity.</div>';
  });
})();