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
    if(!intervals.length){E.graph.innerHTML='<div class="status-history-empty">No status history recorded.</div>';return;}
    const start=intervals[0].start.getTime();
    const delivered=intervals.find(x=>x.status==="Delivered");
    const end=delivered?delivered.start.getTime():Math.max(start+60000,intervals[intervals.length-1].end.getTime());
    const span=Math.max(60000,end-start);
    const seen=[...new Set(intervals.map(x=>x.status))];
    const levels=[...STATUS_ORDER,...seen.filter(x=>!STATUS_ORDER.includes(x))];
    const level=new Map(levels.map((x,i)=>[x,i]));
    const pct=t=>Math.max(0,Math.min(100,(t-start)/span*100));
    const height=Math.max(260,levels.length*46);
    const y=status=>18+(height-42)-(level.get(status)??0)*((height-42)/Math.max(1,levels.length-1));
    const ticks=Array.from({length:6},(_,i)=>start+span*i/5);
    const rel=ms=>{const m=Math.round(ms/60000);if(m<1)return "Start";if(m<60)return "+"+m+"m";const h=Math.floor(m/60),mm=m%60;return "+"+h+"h"+(mm?" "+mm+"m":"");};
    const axis=ticks.map((t,i)=>'<div class="history-axis-label" style="left:'+pct(t)+'%;text-align:'+(i===0?'start':i===5?'end':'center')+'"><strong>'+esc(rel(t-start))+'</strong><small>'+esc(formatTime(t))+'</small></div>').join("");
    let lastX=null,lastY=null,segments="";
    for(const interval of intervals){
      const s=Math.max(start,interval.start.getTime()),e=Math.min(end,interval.end.getTime());
      if(e<=s)continue;
      const x1=pct(s),x2=pct(e),yy=y(interval.status);
      if(lastX!==null&&x1===lastX)segments+='<span class="history-v-segment" style="left:'+x1+'%;top:'+Math.min(lastY,yy)+'px;height:'+Math.abs(lastY-yy)+'px"></span>';
      segments+='<span class="history-h-segment" style="left:'+x1+'%;top:'+yy+'px;width:'+(x2-x1)+'%;background:'+esc(COLORS[interval.status]||"#7c3aed")+'"></span>';
      if(x2-x1>8)segments+='<span class="history-segment-label" style="left:'+((x1+x2)/2)+'%;top:'+yy+'px">'+esc(durationLabel(e-s))+'</span>';
      lastX=x2;lastY=yy;
    }
    if(delivered&&lastX!==null){
      const deliveredY=y("Delivered");
      if(lastY!==deliveredY)segments+='<span class="history-v-segment" style="left:100%;top:'+Math.min(lastY,deliveredY)+'px;height:'+Math.abs(lastY-deliveredY)+'px"></span>';
    }
    const labels=levels.map(status=>'<div class="history-y-label" style="top:'+y(status)+'px"><span class="history-status-dot" style="background:'+esc(COLORS[status]||"#7c3aed")+'"></span>'+esc(status)+'</div>').join("");
    const grids=levels.map(status=>'<span class="history-horizontal-line" style="top:'+y(status)+'px"></span>').join("")+ticks.map(t=>'<span class="history-vertical-line" style="left:'+pct(t)+'%"></span>').join("");
    const current=delivered?"Delivered":intervals[intervals.length-1].status;
    E.title.textContent=transfer.job_number?("Job "+transfer.job_number):"Status History";
    E.graph.innerHTML='<div class="status-history-summary"><div class="status-history-summary-copy"><small>STATUS TIMELINE</small><p>Time moves left to right. Each upward step is a status change.</p></div><div class="status-history-current"><span>Current Status</span><strong style="color:'+esc(COLORS[current]||"#7c3aed")+'">'+esc(current)+'</strong></div></div><div class="history-chart"><div class="history-axis-row"><div></div><div class="history-axis-track">'+axis+'</div></div><div class="history-line-layout"><div class="history-y-axis">'+labels+'</div><div class="history-plot" style="height:'+height+'px"><div class="history-grid">'+grids+'</div>'+segments+'</div></div><div class="history-axis-bottom"><div></div><div class="history-axis-caption">Elapsed time</div></div></div>';
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