(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const list=document.getElementById("recentActivity");
  const active=document.getElementById("active");
  const count=document.getElementById("activeUsersCount");
  if(!list)return;

  function esc(s){
    return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  }

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
  let sessionUserId=null;
  let rows=[];
  let reconnectTimer=null;
  let fallbackTimer=null;
  let oldestCreatedAt=null;
  let loadingOlder=false;
  let hasMore=true;

  function actionText(row){
    const job=row.job_number?("Job "+row.job_number):"Transfer";
    const driver=row.driver?(" · "+row.driver):"";
    const details=row.details?(" · "+row.details):"";
    return "<strong>"+esc(job)+"</strong>: "+esc(row.action||"Updated")+esc(driver)+esc(details);
  }

  function render(){
    if(!rows.length){
      list.innerHTML='<div class="activity-empty">No recent activity yet.</div>';
      return;
    }
    list.innerHTML=rows.map(row=>{
      const when=new Date(row.created_at);
      const stamp=Number.isFinite(when.getTime())?when.toLocaleString():"";
      return '<div class="activity-item" data-transfer-id="'+esc(row.transfer_id||"")+'" data-activity-action="'+esc(row.action||"")+'"><div class="activity-title">'+actionText(row)+'</div><div class="activity-time">'+esc(stamp)+' · '+esc(row.actor_name||"User")+'</div></div>';
    }).join("");
  }

  function focusRenderedActivity(transferId,action="Created"){
    const target=Array.from(list.querySelectorAll(".activity-item")).find(item=>String(item.dataset.transferId)===String(transferId)&&String(item.dataset.activityAction).toLowerCase()===String(action).toLowerCase());
    if(!target)return false;
    target.scrollIntoView({behavior:"smooth",block:"center"});
    target.classList.remove("activity-focus");
    void target.offsetWidth;
    target.classList.add("activity-focus");
    setTimeout(()=>target.classList.remove("activity-focus"),1800);
    return true;
  }

  async function loadActivityForTransfer(transferId,action="Created"){
    if(!sessionUserId||!transferId)return false;
    if(focusRenderedActivity(transferId,action))return true;
    const {data,error}=await sb.from("transfer_activity")
      .select("id,transfer_id,action,actor_name,job_number,driver,details,created_at")
      .eq("transfer_id",transferId)
      .eq("action",action)
      .order("created_at",{ascending:true})
      .limit(1)
      .maybeSingle();
    if(error||!data)return false;
    const existing=rows.findIndex(x=>String(x.id)===String(data.id));
    if(existing>=0)rows[existing]=data;else rows.push(data);
    rows.sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
    oldestCreatedAt=rows[rows.length-1]?.created_at||oldestCreatedAt;
    render();
    return focusRenderedActivity(transferId,action);
  }

  window.focusTransferActivity=loadActivityForTransfer;

  function mergeRow(row){
    if(!row||row.id==null)return;
    const i=rows.findIndex(x=>String(x.id)===String(row.id));
    if(i>=0)rows[i]=row;else rows.push(row);
    rows.sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
    oldestCreatedAt=rows[rows.length-1]?.created_at||oldestCreatedAt;
    if(rows.length>40)rows=rows.slice(0,40);
    render();
  }

  async function loadOlder(){
    if(!sessionUserId||loadingOlder||!hasMore||!oldestCreatedAt)return;
    loadingOlder=true;
    const before=oldestCreatedAt;
    const twelveHours=new Date(Date.parse(before)-12*60*60*1000).toISOString();
    const {data,error}=await sb.from("transfer_activity")
      .select("id,transfer_id,action,actor_name,job_number,driver,details,created_at")
      .lt("created_at",before)
      .gte("created_at",twelveHours)
      .order("created_at",{ascending:false})
      .limit(40);
    if(!error&&data?.length){
      const existing=new Set(rows.map(x=>String(x.id)));
      rows=[...rows,...data.filter(x=>!existing.has(String(x.id)))];
      rows.sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
      oldestCreatedAt=rows[rows.length-1]?.created_at||oldestCreatedAt;
      hasMore=data.length>=40;
      render();
    }else if(!error){
      hasMore=false;
    }
    loadingOlder=false;
  }

  function removeRow(row){
    if(!row||row.id==null)return;
    rows=rows.filter(x=>String(x.id)!==String(row.id));
    render();
  }

  async function load(){
    if(!sessionUserId)return false;
    const {data,error}=await sb.from("transfer_activity")
      .select("id,transfer_id,action,actor_name,job_number,driver,details,created_at")
      .order("created_at",{ascending:false})
      .limit(40);

    if(error){
      console.error("Recent Activity load failed",error);
      list.innerHTML='<div class="activity-empty">Could not load Recent Activity.</div>';
      return false;
    }

    rows=data||[];
    oldestCreatedAt=rows.length?rows[rows.length-1].created_at:null;
    hasMore=rows.length>=40;
    render();
    return true;
  }

  function scheduleReconnect(){
    if(!sessionUserId||reconnectTimer)return;
    reconnectTimer=setTimeout(()=>{
      reconnectTimer=null;
      subscribe();
    },1500);
  }

  async function subscribe(){
    if(!sessionUserId)return;
    if(channel){
      try{await sb.removeChannel(channel)}catch(_err){}
      channel=null;
    }

    channel=sb.channel("transfer-activity-feed-global")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"transfer_activity"},payload=>mergeRow(payload.new))
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"transfer_activity"},payload=>mergeRow(payload.new))
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"transfer_activity"},payload=>removeRow(payload.old))
      .subscribe(status=>{
        if(status==="SUBSCRIBED")load();
        if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED")scheduleReconnect();
      });
  }

  async function start(session){
    const nextId=session?.user?.id||null;
    if(!nextId){
      sessionUserId=null;
      rows=[];
      render();
      list.innerHTML='<div class="activity-empty">Sign in to view recent activity.</div>';
      if(channel){
        try{await sb.removeChannel(channel)}catch(_err){}
        channel=null;
      }
      if(fallbackTimer){clearInterval(fallbackTimer);fallbackTimer=null}
      return;
    }

    const userChanged=sessionUserId!==nextId;
    sessionUserId=nextId;

    await load();
    if(userChanged||!channel)await subscribe();

    if(!fallbackTimer){
      fallbackTimer=setInterval(()=>{
        if(sessionUserId&&!document.hidden)load();
      },60000);
    }
  }

  list.addEventListener("scroll",()=>{
    if(list.scrollTop+list.clientHeight>=list.scrollHeight-40)loadOlder();
  });

  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden&&sessionUserId)load();
  });
  window.addEventListener("focus",()=>{if(sessionUserId)load()});
  window.addEventListener("online",()=>{if(sessionUserId){load();subscribe()}});

  sb.auth.getSession().then(({data})=>start(data?.session||null));
  sb.auth.onAuthStateChange((_event,session)=>start(session));
})();