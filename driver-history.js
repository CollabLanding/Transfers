(async()=>{await window.TransfersAccess.ready;if(!window.TransfersAccess.can("driver_activity"))return;
(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const list=document.getElementById("driverHistoryList");
  if(!list)return;

  if(!C.supabaseUrl||!C.supabaseAnonKey||!window.supabase){
    list.innerHTML='<div class="activity-empty">Driver History is available in Live mode.</div>';
    return;
  }

  const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);
  let channel=null,sessionUserId=null,rows=[],reconnectTimer=null,fallbackTimer=null;

  function esc(s){
    return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  }
  function render(){
    if(!rows.length){
      list.innerHTML='<div class="activity-empty">No recent driver changes yet.</div>';
      return;
    }
    list.innerHTML=rows.map(row=>{
      const when=new Date(row.created_at);
      const stamp=Number.isFinite(when.getTime())?when.toLocaleString():"";
      const driver=row.driver_name?'<strong>'+esc(row.driver_name)+'</strong>: ':"";
      const action=esc(row.action||"Updated");
      const details=row.details?": "+esc(row.details):"";
      return '<div class="activity-item"><div class="activity-title">'+driver+action+details+'</div><div class="activity-time">'+esc(stamp)+' · '+esc(row.actor_name||"User")+'</div></div>';
    }).join("");
  }
  function mergeRow(row){
    if(!row||row.id==null)return;
    const i=rows.findIndex(x=>String(x.id)===String(row.id));
    if(i>=0)rows[i]=row;else rows.push(row);
    rows.sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
    rows=rows.slice(0,50);
    render();
  }
  function removeRow(row){
    if(!row||row.id==null)return;
    rows=rows.filter(x=>String(x.id)!==String(row.id));
    render();
  }
  async function load(){
    if(!sessionUserId)return;
    const {data,error}=await sb.from("driver_activity")
      .select("id,driver_name,action,details,actor_name,created_at")
      .order("created_at",{ascending:false})
      .limit(50);
    if(error){
      console.error("Driver History load failed",error);
      list.innerHTML='<div class="activity-empty">Could not load Driver History.</div>';
      return;
    }
    rows=data||[];
    render();
  }
  function scheduleReconnect(){
    if(!sessionUserId||reconnectTimer)return;
    reconnectTimer=setTimeout(()=>{reconnectTimer=null;subscribe()},1500);
  }
  async function subscribe(){
    if(!sessionUserId)return;
    if(channel){
      try{await sb.removeChannel(channel)}catch(_err){}
      channel=null;
    }
    channel=sb.channel("driver-activity-feed")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"driver_activity"},payload=>mergeRow(payload.new))
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"driver_activity"},payload=>mergeRow(payload.new))
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"driver_activity"},payload=>removeRow(payload.old))
      .subscribe(status=>{
        if(status==="SUBSCRIBED")load();
        if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED")scheduleReconnect();
      });
  }
  async function start(session){
    const nextId=session?.user?.id||null;
    sessionUserId=nextId;
    if(!nextId){
      rows=[];
      render();
      list.innerHTML='<div class="activity-empty">Sign in to view Driver History.</div>';
      if(channel){try{await sb.removeChannel(channel)}catch(_err){}channel=null}
      return;
    }
    await load();
    await subscribe();
    if(!fallbackTimer)fallbackTimer=setInterval(()=>{if(sessionUserId&&!document.hidden)load()},60000);
  }

  window.recordDriverActivity=async function(entries){
    if(!sessionUserId||!Array.isArray(entries)||!entries.length)return;
    const payload=entries.map(entry=>({
      driver_name:entry.driver_name||null,
      action:entry.action||"Updated",
      details:entry.details||null,
      actor_id:sessionUserId,
      actor_name:entry.actor_name||"User"
    }));
    const {error}=await sb.from("driver_activity").insert(payload);
    if(error)console.error("Driver History record failed",error);
  };

  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&sessionUserId)load()});
  window.addEventListener("focus",()=>{if(sessionUserId)load()});
  window.addEventListener("online",()=>{if(sessionUserId){load();subscribe()}});

  sb.auth.getSession().then(({data})=>start(data?.session||null));
  sb.auth.onAuthStateChange((_event,session)=>start(session));
})();
})();