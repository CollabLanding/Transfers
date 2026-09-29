(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const live=!!(C.supabaseUrl&&C.supabaseAnonKey&&window.supabase);
  const sb=live?window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey):null;
  const $=id=>document.getElementById(id);
  const E={
    form:$("form"),
    editId:$("editId"),
    status:$("status"),
    screen:$("statusHistoryScreen"),
    title:$("statusHistoryTitle"),
    graph:$("statusHistoryGraph"),
    button:$("statusHistory"),
    back:$("statusHistoryBack")
  };

  const STATUS_ORDER=["Planned","Waiting","Loading","Loaded","In Transit","On Site","Delivered"];
  const COLORS={
    "Planned":"#64748b",
    "Waiting":"#ef4444",
    "Loading":"#f97316",
    "Loaded":"#eab308",
    "In Transit":"#84cc16",
    "On Site":"#22c55e",
    "Delivered":"#16a34a"
  };

  let restoreFocus=null;

  function esc(s){
    return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  }

  function durationLabel(ms){
    const totalMinutes=Math.max(0,Math.round(ms/60000));
    if(totalMinutes<1)return "<1m";
    const days=Math.floor(totalMinutes/1440);
    const hours=Math.floor((totalMinutes%1440)/60);
    const minutes=totalMinutes%60;
    const parts=[];
    if(days)parts.push(days+"d");
    if(hours||days)parts.push(hours+"h");
    if(minutes||(!days&&!hours))parts.push(minutes+"m");
    return parts.join(" ");
  }

  function formatTime(value){
    const d=new Date(value);
    if(!Number.isFinite(d.getTime()))return "";
    return d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  }

  function parseChange(row){
    const details=String(row?.details||"").trim();
    const match=details.match(/^(.+?)\s+→\s+(.+?)\s*$/);
    if(!match)return null;
    return {
      from:match[1].trim(),
      to:match[2].trim(),
      at:new Date(row.created_at)
    };
  }

  function buildIntervals(transfer,activityRows){
    const changes=activityRows
      .filter(row=>String(row.action||"")==="Status changed")
      .map(parseChange)
      .filter(change=>change&&Number.isFinite(change.at.getTime()))
      .sort((a,b)=>a.at-b.at);

    const created=new Date(transfer.created_at);
    const now=new Date();
    let start=Number.isFinite(created.getTime())?created:changes[0]?.at||now;
    let status=changes[0]?.from||transfer.order_status||"Planned";
    const intervals=[];

    for(const change of changes){
      if(change.at<=start){
        status=change.to||status;
        continue;
      }
      intervals.push({status,start,end:change.at});
      status=change.to||status;
      start=change.at;
    }

    if(now>start)intervals.push({status,start,end:now});
    if(!intervals.length){
      const fallbackStart=Number.isFinite(created.getTime())?created:now;
      intervals.push({
        status:transfer.order_status||"Planned",
        start:fallbackStart,
        end:now>fallbackStart?now:new Date(fallbackStart.getTime()+60000)
      });
    }

    const merged=[];
    for(const interval of intervals){
      const last=merged[merged.length-1];
      if(last&&last.status===interval.status&&last.end.getTime()>=interval.start.getTime()){
        last.end=new Date(Math.max(last.end.getTime(),interval.end.getTime()));
      }else{
        merged.push({...interval});
      }
    }
    return merged;
  }

  function graph(intervals,transfer){
    if(!intervals.length){
      E.graph.innerHTML='<div class="status-history-empty">No status history recorded.</div>';
      return;
    }

    const present=intervals.map(x=>x.status);
    const unknown=present.filter(status=>!STATUS_ORDER.includes(status));
    const statuses=[...new Set([...unknown,...STATUS_ORDER.slice().reverse()])];
    const startTime=intervals[0].start.getTime();
    const endTime=Math.max(startTime+60000,intervals[intervals.length-1].end.getTime());
    const span=Math.max(60000,endTime-startTime);
    const tickCount=5;
    const currentStatus=intervals[intervals.length-1].status;
    const currentColor=COLORS[currentStatus]||"#7c3aed";

    const pct=time=>
      Math.max(0,Math.min(100,((time-startTime)/span)*100));

    const ticks=Array.from({length:tickCount},(_,index)=>startTime+(span*index/(tickCount-1)));
    const rows=statuses.map(status=>{
      const statusIntervals=intervals.filter(interval=>interval.status===status);
      const total=statusIntervals.reduce((sum,interval)=>sum+Math.max(0,interval.end-interval.start),0);
      const bars=statusIntervals.map(interval=>{
        const left=pct(interval.start.getTime());
        const right=pct(interval.end.getTime());
        const width=Math.max(0.8,right-left);
        const duration=durationLabel(interval.end.getTime()-interval.start.getTime());
        return '<div class="history-bar" style="left:'+left+'%;width:'+Math.min(100-left,width)+'%;background:'+esc(COLORS[status]||"#7c3aed")+'" title="'+esc(status+" • "+duration+" • "+formatTime(interval.start)+" – "+formatTime(interval.end))+'"><span>'+esc(duration)+'</span></div>';
      }).join("");
      return '<div class="history-row"><div class="history-status-label"><span class="history-status-dot" style="background:'+esc(COLORS[status]||"#7c3aed")+'"></span><span>'+esc(status)+'</span><strong>'+esc(durationLabel(total))+'</strong></div><div class="history-track">'+ticks.map(time=>'<span class="history-grid-line" style="left:'+pct(time)+'%"></span>').join("")+bars+'</div></div>';
    }).join("");

    const axis=ticks.map((time,index)=>{
      const align=index===0?"start":index===tickCount-1?"end":"center";
      return '<div class="history-axis-label" style="left:'+pct(time)+'%;text-align:'+align+'">'+esc(formatTime(time))+'</div>';
    }).join("");

    E.title.textContent=transfer.job_number?("Job "+transfer.job_number):"Status History";
    E.graph.innerHTML=
      '<div class="status-history-summary">'+
        '<div class="status-history-summary-copy"><small>TIME IN EACH STATUS</small><p>Track each status change across the life of this transfer.</p></div>'+
        '<div class="status-history-current"><span>Current Status</span><strong style="color:'+esc(currentColor)+'">'+esc(currentStatus)+'</strong></div>'+
      '</div>'+
      '<div class="history-chart">'+
        '<div class="history-axis-row"><div></div><div class="history-axis-track">'+axis+'</div></div>'+
        '<div class="history-rows">'+rows+'</div>'+
      '</div>';
  }

  async function load(){
    const id=String(E.editId?.value||"").trim();
    if(!id){
      E.graph.innerHTML='<div class="status-history-empty">Select a transfer to view its status history.</div>';
      return;
    }

    if(!live){
      const status=E.status?.value||"Planned";
      const now=new Date();
      const start=new Date(now.getTime()-3600000);
      graph([{status,start,end:now}],{job_number:"Transfer",order_status:status,created_at:start.toISOString()});
      return;
    }

    E.graph.innerHTML='<div class="status-history-loading">Loading status history…</div>';
    const [transferResult,activityResult]=await Promise.all([
      sb.from("transfers").select("id,job_number,order_status,created_at").eq("id",id).maybeSingle(),
      sb.from("transfer_activity").select("action,details,created_at").eq("transfer_id",id).eq("action","Status changed").order("created_at",{ascending:true})
    ]);

    if(transferResult.error||activityResult.error){
      const error=transferResult.error||activityResult.error;
      E.graph.innerHTML='<div class="status-history-empty">Could not load status history: '+esc(error?.message||"Unknown error")+'</div>';
      return;
    }

    if(!transferResult.data){
      E.graph.innerHTML='<div class="status-history-empty">Transfer not found.</div>';
      return;
    }

    const transfer=transferResult.data;
    graph(buildIntervals(transfer,activityResult.data||[]),transfer);
  }

  function open(){
    if(!E.screen)return;
    restoreFocus=document.activeElement;
    document.body.classList.add("status-history-open");
    E.screen.classList.remove("hidden");
    E.back?.focus();
    load();
  }

  function close(){
    if(!E.screen)return;
    E.screen.classList.add("hidden");
    document.body.classList.remove("status-history-open");
    if(restoreFocus&&typeof restoreFocus.focus==="function")restoreFocus.focus();
    restoreFocus=null;
  }

  window.closeStatusHistory=close;

  E.button?.addEventListener("click",open);
  E.back?.addEventListener("click",close);
  E.screen?.addEventListener("click",event=>{
    if(event.target===E.screen)close();
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&!E.screen?.classList.contains("hidden"))close();
  });
})();