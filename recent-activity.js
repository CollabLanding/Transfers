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
  const transferMoves=new Map();
  let dayView=null,viewVersion=0,loadSequence=0,focusActivityId=null,focusUntil=0,focusTimer=null;
  const dayBar=document.createElement("div");dayBar.className="activity-day-view";dayBar.hidden=true;
  dayBar.style.cssText="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0;font-size:12px";
  const dayLabel=document.createElement("span"),recentButton=document.createElement("button");recentButton.type="button";recentButton.textContent="Recent";
  dayBar.append(dayLabel,recentButton);list.before(dayBar);
  function updateDayBar(){dayBar.hidden=!dayView;dayBar.style.display=dayView?"flex":"none";dayLabel.textContent=dayView?.label||"";}
  recentButton.onclick=()=>{dayView=null;viewVersion++;loadSequence++;focusActivityId=null;focusUntil=0;rows=[];oldestCreatedAt=null;hasMore=true;updateDayBar();list.scrollTop=0;load()};
  function inDay(row){return !dayView||(Date.parse(row.created_at)>=Date.parse(dayView.start)&&Date.parse(row.created_at)<Date.parse(dayView.end))}
  function sortRows(){rows.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||String(b.id).localeCompare(String(a.id)));oldestCreatedAt=rows.at(-1)?.created_at||null;}
  function itemById(id){return [...list.querySelectorAll(".activity-item")].find(item=>item.dataset.activityId===String(id));}
  function markFocus(){clearTimeout(focusTimer);const item=itemById(focusActivityId);if(!item||Date.now()>=focusUntil)return;item.classList.add("activity-focus");focusTimer=setTimeout(()=>{itemById(focusActivityId)?.classList.remove("activity-focus");focusUntil=0;},focusUntil-Date.now());}
  async function fetchDay(day){
    const all=[];for(let offset=0;;offset+=1000){const r=await sb.from("transfer_activity").select("id,transfer_id,action,actor_name,move_number,job_number,driver,details,created_at").gte("created_at",day.start).lt("created_at",day.end).order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+999);if(r.error)throw r.error;all.push(...(r.data||[]));if((r.data||[]).length<1000)return all;}
  }


  function actionText(row){
    const currentMove=transferMoves.get(String(row.transfer_id));
    const move=currentMove!=null?("Move #"+currentMove):(row.move_number!=null?("Move #"+row.move_number):"Move #—");
    if(String(row.action||"").toLowerCase()==="created")return "<strong>"+esc(move)+"</strong>";
    const driver=row.driver?(" · "+row.driver):"";
    const details=row.details?(" · "+row.details):"";
    return "<strong>"+esc(move)+"</strong>: "+esc(row.action||"Updated")+esc(driver)+esc(details);
  }

  function render(){
    const before=[...list.querySelectorAll(".activity-item")].find(item=>item.getBoundingClientRect().bottom>list.getBoundingClientRect().top);
    const anchor=before?{id:before.dataset.activityId,top:before.getBoundingClientRect().top}:null,scroll=list.scrollTop;

    if(!rows.length){
      list.innerHTML='<div class="activity-empty">No recent activity yet.</div>';
      return;
    }
    list.innerHTML=rows.map(row=>{
      const when=new Date(row.created_at);
      const stamp=Number.isFinite(when.getTime())?when.toLocaleString():"";
      return '<div class="activity-item" data-activity-id="'+esc(row.id)+'" data-transfer-id="'+esc(row.transfer_id||"")+'" data-activity-action="'+esc(row.action||"")+'"><div class="activity-title">'+actionText(row)+'</div><div class="activity-time">'+esc(stamp)+' · '+esc(row.actor_name||"User")+'</div></div>';
    }).join("");
    list.querySelectorAll(".activity-item[data-transfer-id]").forEach(item=>{
      item.tabIndex=0;
      item.setAttribute("role","button");
      item.addEventListener("click",()=>window.openTransferEditor?.(item.dataset.transferId));
      item.addEventListener("keydown",event=>{
        if(event.key==="Enter"||event.key===" "){
          event.preventDefault();
          window.openTransferEditor?.(item.dataset.transferId);
        }
      });
    });
    const restored=anchor&&itemById(anchor.id);
    if(restored)list.scrollTop=scroll+restored.getBoundingClientRect().top-anchor.top;else list.scrollTop=scroll;
    markFocus();
  }

  function focusRenderedActivity(id){
    const target=itemById(id);if(!target)return false;
    // Scroll only this panel; avoid moving the board or the entire page.
    list.scrollTop+=target.getBoundingClientRect().top-list.getBoundingClientRect().top-(list.clientHeight-target.getBoundingClientRect().height)/2;
    focusActivityId=String(id);focusUntil=Date.now()+2200;markFocus();return true;
  }

  async function hydrateMoveNumbers(sourceRows){
    const ids=[...new Set((sourceRows||[]).map(row=>String(row?.transfer_id||"")).filter(Boolean))];
    if(!ids.length)return;
    for(let offset=0;offset<ids.length;offset+=100){
      const {data,error}=await sb.from("transfers").select("id,move_number").in("id",ids.slice(offset,offset+100));
      if(error||!data)continue;
      data.forEach(row=>transferMoves.set(String(row.id),row.move_number));
    }
  }

  async function loadActivityForTransfer(transferId,action="Created"){
    if(!sessionUserId||!transferId)return false;
    const version=++viewVersion,account=sessionUserId;++loadSequence;
    try{
      const {data,error}=await sb.from("transfer_activity").select("id,transfer_id,action,actor_name,move_number,job_number,driver,details,created_at").eq("transfer_id",transferId).eq("action",action).order("created_at",{ascending:true}).limit(1).maybeSingle();
      if(version!==viewVersion||account!==sessionUserId)return false;
      if(error||!data)throw new Error(error?.message||"Creation entry not found");
      const start=new Date(data.created_at);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
      const day={start:start.toISOString(),end:end.toISOString(),label:start.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})};
      const entries=await fetchDay(day);await hydrateMoveNumbers(entries);
      if(version!==viewVersion||account!==sessionUserId)return false;
      ++loadSequence;dayView=day;rows=entries;sortRows();hasMore=false;updateDayBar();render();
      return focusRenderedActivity(data.id);
    }catch(error){if(version===viewVersion&&account===sessionUserId){dayLabel.textContent=error.message;dayBar.hidden=false;dayBar.style.display="flex";}return false;}
  }

  window.focusTransferActivity=loadActivityForTransfer;

  function mergeRow(row){
    if(!row||row.id==null)return;
    if(!inDay(row)){if(rows.some(r=>String(r.id)===String(row.id)))removeRow(row);return;}
    const i=rows.findIndex(x=>String(x.id)===String(row.id));if(i>=0)rows[i]=row;else rows.push(row);
    sortRows();render();const version=viewVersion;
    hydrateMoveNumbers([row]).then(()=>{if(version===viewVersion)render()});
  }

  async function loadOlder(){
    if(!sessionUserId||dayView||loadingOlder||!hasMore||!oldestCreatedAt)return;
    loadingOlder=true;
    const version=viewVersion,account=sessionUserId;
    const before=oldestCreatedAt;
    const twelveHours=new Date(Date.parse(before)-12*60*60*1000).toISOString();
    const {data,error}=await sb.from("transfer_activity")
      .select("id,transfer_id,action,actor_name,job_number,driver,details,created_at")
      .lt("created_at",before)
      .gte("created_at",twelveHours)
      .order("created_at",{ascending:false})
      .limit(40);
    if(version!==viewVersion||account!==sessionUserId){loadingOlder=false;return;}
    if(!error&&data?.length){
      const existing=new Set(rows.map(x=>String(x.id)));
      rows=[...rows,...data.filter(x=>!existing.has(String(x.id)))];
      rows.sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
      oldestCreatedAt=rows[rows.length-1]?.created_at||oldestCreatedAt;
      hasMore=data.length>=40;
      await hydrateMoveNumbers(data);
      if(version===viewVersion&&account===sessionUserId)render();
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
    const version=viewVersion,sequence=++loadSequence,account=sessionUserId,day=dayView;
    try{
      let data;
      if(day)data=await fetchDay(day);
      else{const r=await sb.from("transfer_activity").select("id,transfer_id,action,actor_name,job_number,driver,details,created_at").order("created_at",{ascending:false}).limit(40);if(r.error)throw r.error;data=r.data||[];}
      await hydrateMoveNumbers(data);
      if(version!==viewVersion||sequence!==loadSequence||account!==sessionUserId)return false;
      if(day)rows=data;else{const merged=new Map(rows.map(r=>[String(r.id),r]));data.forEach(r=>merged.set(String(r.id),r));rows=[...merged.values()];}
      sortRows();hasMore=day?false:data.length>=40;render();return true;
    }catch(error){if(version===viewVersion&&sequence===loadSequence&&!rows.length)list.innerHTML='<div class="activity-empty">Could not load Recent Activity.</div>';console.error("Recent Activity load failed",error);return false;}
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
    await window.TransfersAccess.ready;
    await window.TransfersAccess.refresh(session);
    if(!window.TransfersAccess.can("recent_activity"))session=null;
    const nextId=session?.user?.id||null;
    if(!nextId){
      sessionUserId=null;viewVersion++;loadSequence++;dayView=null;focusActivityId=null;updateDayBar();
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
    if(userChanged){viewVersion++;loadSequence++;dayView=null;rows=[];focusActivityId=null;updateDayBar();}

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

  document.addEventListener("transfer-access-changed",()=>{if(!window.TransfersAccess.can("recent_activity")){currentRoleLost()} });
  function currentRoleLost(){sessionUserId=null;viewVersion++;loadSequence++;dayView=null;focusActivityId=null;updateDayBar();rows=[];if(channel){sb.removeChannel(channel);channel=null}if(fallbackTimer){clearInterval(fallbackTimer);fallbackTimer=null}list.innerHTML="";}
  sb.auth.getSession().then(({data})=>start(data?.session||null));
  sb.auth.onAuthStateChange((_event,session)=>start(session));
})();
