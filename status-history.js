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
    "Waiting":"#f97316",
    "Loading":"#f59e0b",
    "Loaded":"#eab308",
    "In Transit":"#d9e34f",
    "On Site":"#bef264",
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
    const deliveredInterval=intervals.find(interval=>interval.status==="Delivered");
    const startTime=intervals[0].start.getTime();
    const deliveredTime=deliveredInterval?deliveredInterval.start.getTime():null;
    const endTime=deliveredTime??Math.max(startTime+60000,intervals[intervals.length-1].end.getTime());
    const span=Math.max(60000,endTime-startTime);
    const tickCount=6;
    const currentStatus=intervals[intervals.length-1].status;
    const currentColor=COLORS[currentStatus]||"#7c3aed";

    const pct=time=>
      Math.max(0,Math.min(100,((time-startTime)/span)*100));

    const ticks=Array.from({length:tickCount},(_,index)=>startTime+(span*index/(tickCount-1)));

    const durationStatuses=[...new Set(present)]
      .filter(status=>status!=="Planned"&&status!=="Delivered");

    const renderMarkerRow=(status,time,label,position)=>{
      const markerColor=COLORS[status]||"#64748b";
      const left=pct(time);
      const transform=position==="end"?"translate(-100%,-50%)":"translateY(-50%)";
      const textAlign=position==="end"?"right":"left";
      return '<div class="history-row history-marker-row">'+
        '<div class="history-status-label history-marker-label">'+
          '<span class="history-status-dot" style="background:'+esc(markerColor)+'"></span>'+
          '<span>'+esc(status)+'</span>'+
          '<strong>'+esc(label)+'</strong>'+
        '</div>'+
        '<div class="history-track history-marker-track">'+
          '<span class="history-grid-line" style="left:'+left+'%"></span>'+
          '<span class="history-marker-line" style="left:'+left+'%;background:'+esc(markerColor)+'"></span>'+
          '<span class="history-marker-dot" style="left:'+left+'%;background:'+esc(markerColor)+'"></span>'+
          '<span class="history-marker-time" style="left:'+left+'%;transform:'+transform+';text-align:'+textAlign+'">'+esc(formatTime(time))+'</span>'+
        '</div>'+
      '</div>';
    };

    const rows=[
      durationStatuses.map(status=>{
        const statusIntervals=intervals
          .filter(interval=>interval.status===status)
          .filter(interval=>interval.start.getTime()<endTime)
          .map(interval=>({
            start:interval.start,
            end:new Date(Math.min(interval.end.getTime(),endTime))
          }))
          .filter(interval=>interval.end.getTime()>interval.start.getTime());

        const total=statusIntervals.reduce((sum,interval)=>sum+Math.max(0,interval.end-interval.start),0);
        const share=span?Math.round(total/span*100):0;

        const bars=statusIntervals.map(interval=>{
          const left=pct(interval.start.getTime());
          const right=pct(interval.end.getTime());
          const width=Math.max(0.8,right-left);
          const duration=durationLabel(interval.end.getTime()-interval.start.getTime());
          return '<div class="history-bar" style="left:'+left+'%;width:'+Math.min(100-left,width)+'%;background:'+esc(COLORS[status]||"#7c3aed")+'" title="'+esc(status+" • "+duration+" • "+formatTime(interval.start)+" – "+formatTime(interval.end))+'"><span>'+esc(duration)+'</span></div>';
        }).join("");

        return '<div class="history-row"><div class="history-status-label"><span class="history-status-dot" style="background:'+esc(COLORS[status]||"#7c3aed")+'"></span><span>'+esc(status)+'</span><strong>'+esc(durationLabel(total))+'</strong><em>'+share+'%</em></div><div class="history-track">'+ticks.map(time=>'<span class="history-grid-line" style="left:'+pct(time)+'%"></span>').join("")+bars+'</div></div>';
      }).join("")
    ].join("");

    const relativeLabel=ms=>{
      const minutes=Math.round(ms/60000);
      if(minutes<1)return "Start";
      if(minutes<60)return "+"+minutes+"m";
      const hours=Math.floor(minutes/60),mins=minutes%60;
      return "+"+hours+"h"+(mins?" "+mins+"m":"");
    };
    const axis=ticks.map((time,index)=>{
      const align=index===0?"start":index===tickCount-1?"end":"center";
      return '<div class="history-axis-label" style="left:'+pct(time)+'%;text-align:'+align+'"><strong>'+esc(relativeLabel(time-startTime))+'</strong><small>'+esc(formatTime(time))+'</small></div>';
    }).join("");

    E.title.textContent=transfer.job_number?("Job "+transfer.job_number):"Status History";
    E.graph.innerHTML=
      '<div class="status-history-summary">'+
        '<div class="status-history-summary-copy"><small>STATUS TIMELINE</small><p>Elapsed time from the start of the recorded history. Bar widths are proportional to the actual time spent in each status.</p></div>'+
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