(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const live=!!(C.supabaseUrl&&C.supabaseAnonKey&&window.supabase);
  const sb=live?window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey):null;
  const $=id=>document.getElementById(id);
  const E={
    form:$("form"),
    editId:$("editId"),
    status:$("status"),
    urgent:$(".urgent-toggle"),
    screen:$("statusHistoryScreen"),
    title:$("statusHistoryTitle"),
    graph:$("statusHistoryGraph"),
    button:$("statusHistory"),
    back:$("statusHistoryBack")
  };

  const STATUS_ORDER=["Planned","Waiting","On Site","Loading","Loaded","In Transit","Delivered"];
  const COLORS={
    "Planned":"#64748b",
    "Waiting":"#ea580c",
    "On Site":"#eab308",
    "Loading":"#eab308",
    "Loaded":"#84cc16",
    "In Transit":"#3b82f6",
    "Delivered":"#16a34a"
  };

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
      if(change.at<=start) {
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

  function statusRank(status,present){
    const idx=STATUS_ORDER.indexOf(status);
    if(idx>=0)return idx;
    const existing=present.indexOf(status);
    return existing>=0?existing:0;
  }

  function graph(intervals,transfer){
    if(!intervals.length){
      E.graph.innerHTML='<div class="status-history-empty">No status history recorded.</div>';
      return;
    }

    const knownStatuses=[...STATUS_ORDER];
    intervals.forEach(x=>{if(!knownStatuses.includes(x.status))knownStatuses.push(x.status)});
    const width=760;
    const left=118;
    const right=24;
    const top=34;
    const bottom=58;
    const rowGap=38;
    const height=top+((knownStatuses.length-1)*rowGap)+bottom;
    const plotLeft=left;
    const plotRight=width-right;
    const plotTop=top;
    const plotBottom=top+((knownStatuses.length-1)*rowGap);
    const startTime=intervals[0].start.getTime();
    const endTime=Math.max(startTime+60000,intervals[intervals.length-1].end.getTime());
    const span=endTime-startTime;
    const x=t=>plotLeft+((t-startTime)/span)*(plotRight-plotLeft);
    const y=status=>plotTop+statusRank(status,knownStatuses)*rowGap;
    const color=status=>COLORS[status]||"#7c3aed";
    const labelTimes=[];
    const tickCount=4;
    for(let i=0;i<tickCount;i++)labelTimes.push(startTime+(span*i/(tickCount-1)));

    let svg='<svg class="status-history-svg" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+esc("Status history for "+(transfer.job_number||"transfer"))+'">';
    svg+='<line class="history-axis" x1="'+plotLeft+'" y1="'+plotTop+'" x2="'+plotLeft+'" y2="'+plotBottom+'"/>';
    svg+='<line class="history-axis" x1="'+plotLeft+'" y1="'+plotBottom+'" x2="'+plotRight+'" y2="'+plotBottom+'"/>';

    knownStatuses.forEach(status=>{
      const yy=y(status);
      svg+='<line class="history-grid" x1="'+plotLeft+'" y1="'+yy+'" x2="'+plotRight+'" y2="'+yy+'"/>';
      svg+='<text class="history-y-label" x="'+(plotLeft-12)+'" y="'+(yy+4)+'" text-anchor="end">'+esc(status)+'</text>';
    });

    tickCount && labelTimes.forEach((time,index)=>{
      const xx=x(time);
      svg+='<line class="history-tick" x1="'+xx+'" y1="'+plotBottom+'" x2="'+xx+'" y2="'+(plotBottom+5)+'"/>';
      svg+='<text class="history-x-label" x="'+xx+'" y="'+(plotBottom+19)+'" text-anchor="'+(index===0?"start":index===tickCount-1?"end":"middle")+'">'+esc(formatTime(time))+'</text>';
    });

    intervals.forEach((interval,index)=>{
      const x1=x(interval.start.getTime());
      const x2=x(interval.end.getTime());
      const yy=y(interval.status);
      const next=intervals[index+1];
      svg+='<line class="history-segment" x1="'+x1+'" y1="'+yy+'" x2="'+x2+'" y2="'+yy+'" stroke="'+color(interval.status)+'"/>';
      const duration=durationLabel(interval.end.getTime()-interval.start.getTime());
      const mid=(x1+x2)/2;
      if(x2-x1>=42){
        svg+='<text class="history-duration" x="'+mid+'" y="'+(yy-9)+'" text-anchor="middle">'+esc(duration)+'</text>';
      }
      svg+='<circle class="history-point" cx="'+x1+'" cy="'+yy+'" r="4" fill="'+color(interval.status)+'"/>';
      if(next){
        const nextY=y(next.status);
        svg+='<line class="history-transition" x1="'+x2+'" y1="'+yy+'" x2="'+x2+'" y2="'+nextY+'"/>';
      }
    });

    const last=intervals[intervals.length-1];
    const lastX=x(last.end.getTime());
    svg+='<circle class="history-point history-current" cx="'+lastX+'" cy="'+y(last.status)+'" r="5" fill="'+color(last.status)+'"/>';
    svg+='</svg>';
    E.graph.innerHTML=svg;
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
    const intervals=buildIntervals(transfer,activityResult.data||[]);
    E.title.textContent=(transfer.job_number?"Job "+transfer.job_number:"Status History");
    graph(intervals,transfer);
  }

  function open(){
    if(!E.screen)return;
    E.form?.classList.add("hidden");
    E.urgent?.classList.add("hidden");
    E.screen.classList.remove("hidden");
    E.button?.classList.add("hidden");
    load();
  }

  function close(){
    E.screen?.classList.add("hidden");
    E.form?.classList.remove("hidden");
    E.urgent?.classList.remove("hidden");
    if(E.editId?.value)E.button?.classList.remove("hidden");
  }

  window.closeStatusHistory=close;

  E.button?.addEventListener("click",open);
  E.back?.addEventListener("click",close);
})();
