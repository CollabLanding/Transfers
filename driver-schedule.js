(async()=>{await window.TransfersAccess.ready;if(!window.TransfersAccess.any(["driver_schedules","copy_schedules","driver_profiles","driver_phones","repeat_schedules","driver_reports","driver_activity"]))return;
(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const live=!!(C.supabaseUrl&&C.supabaseAnonKey&&window.supabase);
  const sb=live?window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey):null;
  const $=id=>document.getElementById(id);
  const E={
    week:$("weekStart"),prev:$("prevWeek"),next:$("nextWeek"),thisWeek:$("thisWeek"),
    title:$("weekTitle"),body:$("scheduleBody"),save:$("saveSchedule"),msg:$("scheduleMsg"),
    reports:$("runReports"),reportModal:$("reportModal"),reportForm:$("reportForm"),reportClose:$("reportClose"),reportCancel:$("reportCancel"),
    reportDriverList:$("reportDriverList"),reportSelectAll:$("reportSelectAll"),reportClearAll:$("reportClearAll"),reportPeriod:$("reportPeriod"),reportSort:$("reportSort"),reportSeparate:$("reportSeparate"),
    reportWeekFields:$("reportWeekFields"),reportMonthFields:$("reportMonthFields"),reportQuarterFields:$("reportQuarterFields"),reportCustomFields:$("reportCustomFields"),
    reportWeekDate:$("reportWeekDate"),reportMonth:$("reportMonth"),reportQuarterYear:$("reportQuarterYear"),reportQuarter:$("reportQuarter"),
    reportStartDate:$("reportStartDate"),reportEndDate:$("reportEndDate"),reportRun:$("reportRun"),reportMsg:$("reportMsg"),
    me:$("me"),email:$("email"),signout:$("signout"),login:$("login"),loginForm:$("loginForm"),
    loginEmail:$("loginEmail"),loginPassword:$("loginPassword"),loginMsg:$("loginMsg")
  };
  let user=null,profile=null,drivers=[],scheduleRows=[],weekTransfers=[],channel=null,dirty=false,lastWeekValue="";

  let downtimeRows=[],downtimeContext=null,downtimeEditing=null;
  let loadVersion=0,editVersion=0,refreshPending=false,refreshTimer=null;
  function scheduleFocused(){return E.body.contains(document.activeElement)&&document.activeElement?.matches('input[type="time"]')}
  function requestScheduleRefresh(){
    refreshPending=true;
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(()=>{
      if(!refreshPending||dirty||scheduleFocused())return;
      loadWeek({background:true});
    },100);
  }
  E.body.addEventListener("focusout",()=>{if(refreshPending)requestScheduleRefresh()});
  E.body.addEventListener("input",event=>{
    if(event.target.matches('input[type="time"]'))setDirty(true);
  });

  function localISO(d){
    const x=new Date(d);
    x.setMinutes(x.getMinutes()-x.getTimezoneOffset());
    return x.toISOString().slice(0,10);
  }
  function parseISO(iso){return new Date(String(iso)+"T12:00:00")}
  function mondayOf(value){
    const d=value instanceof Date?new Date(value):parseISO(value);
    const day=d.getDay();
    const delta=day===0?-6:1-day;
    d.setDate(d.getDate()+delta);
    return localISO(d);
  }
  function addDays(iso,n){const d=parseISO(iso);d.setDate(d.getDate()+n);return localISO(d)}
  function monthStart(iso){const d=parseISO(iso);d.setDate(1);return localISO(d)}
  function addMonths(iso,n){const d=parseISO(iso);d.setDate(1);d.setMonth(d.getMonth()+n);return localISO(d)}
  function friendly(iso,opts={weekday:"short",month:"short",day:"numeric"}){return parseISO(iso).toLocaleDateString(undefined,opts)}
  function userName(){return profile?.display_name||user?.user_metadata?.display_name||user?.email?.split("@")[0]||"User"}
  function show(text,type=""){
    E.msg.textContent=text||"";
    E.msg.className="schedule-message"+(type?" "+type:"");
  }
  function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
  function minutes(t){
    if(!t)return null;
    const [h,m]=String(t).slice(0,5).split(":").map(Number);
    return h*60+m;
  }
  function hoursBetween(start,end){
    const a=minutes(start),b=minutes(end);
    if(a==null||b==null)return 0;
    let diff=b-a;
    if(diff<0)diff+=1440;
    return diff/60;
  }
  function fmtHours(n){
    const rounded=Math.round(n*100)/100;
    return Number.isInteger(rounded)?String(rounded):rounded.toFixed(2).replace(/0$/,"");
  }


  function dayHours(start,end,driver,date,rows=downtimeRows){
    const scheduled=hoursBetween(start,end),a=minutes(start);
    if(a==null||!scheduled)return {scheduled,down:0,billable:scheduled};
    const b=a+scheduled*60,ranges=rows.filter(r=>r.driver_name===driver&&String(r.schedule_date)===date).map(r=>[Math.max(a,r.start_minute),Math.min(b,r.end_minute)]).filter(r=>r[1]>r[0]).sort((x,y)=>x[0]-y[0]);
    let down=0,last=a;
    for(const [from,to] of ranges){down+=Math.max(0,to-Math.max(from,last));last=Math.max(last,to)}
    return {scheduled,down:down/60,billable:scheduled-down/60};
  }
  const dtTime=n=>time12(String(Math.floor(n%1440/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0"))+(n>=1440?" (+1 day)":"");
  function dtReset(){
    downtimeEditing=null;
    $("downtimeStart").value="";$("downtimeEnd").value="";
    $("downtimeStartDay").value="0";$("downtimeEndDay").value="0";
    $("downtimeReason").value="Equipment failure";$("downtimeNotes").value="";
    $("downtimeSave").textContent="Add Gap";$("downtimeMsg").textContent="";
  }
  function dtRender(){
    const {driver,date}=downtimeContext;
    $("downtimeList").replaceChildren();
    const rows=downtimeRows.filter(r=>r.driver_name===driver&&String(r.schedule_date)===date).sort((a,b)=>a.start_minute-b.start_minute);
    for(const r of rows){
      const div=document.createElement("div");div.className="downtime-entry";
      div.innerHTML='<strong>'+esc(dtTime(r.start_minute)+" – "+dtTime(r.end_minute))+'</strong><div>'+esc(r.reason)+(r.notes?" · "+esc(r.notes):"")+'</div><small>'+esc(r.updated_by_name)+" · "+esc(new Date(r.updated_at).toLocaleString())+'</small>';
      for(const [title,action] of [["Edit",()=>{downtimeEditing=r.id;$("downtimeStart").value=String(Math.floor(r.start_minute%1440/60)).padStart(2,"0")+":"+String(r.start_minute%60).padStart(2,"0");$("downtimeEnd").value=String(Math.floor(r.end_minute%1440/60)).padStart(2,"0")+":"+String(r.end_minute%60).padStart(2,"0");$("downtimeStartDay").value=String(Math.floor(r.start_minute/1440));$("downtimeEndDay").value=String(Math.floor(r.end_minute/1440));$("downtimeReason").value=r.reason;$("downtimeNotes").value=r.notes;$("downtimeSave").textContent="Save Gap"}],["Remove",async()=>{
        if(!confirm("Remove this downtime entry? The removal will remain in Driver Changes."))return;
        const result=await sb.from("driver_downtime").delete().eq("id",r.id).eq("updated_at",r.updated_at).select("id");
        if(result.error||!result.data?.length){$("downtimeMsg").textContent=result.error?.message||"This entry changed. Close and reopen Downtime.";return}
        downtimeRows=downtimeRows.filter(x=>x.id!==r.id);dtReset();dtRender();render();
      }]]){
        const btn=document.createElement("button");btn.type="button";btn.textContent=title;btn.onclick=action;btn.disabled=!window.TransfersAccess.can("driver_schedules");div.append(btn);
      }
      $("downtimeList").append(div);
    }
    if(!rows.length)$("downtimeList").textContent="No downtime recorded.";
  }
  async function dtOpen(driver,date){
    if(dirty){if(!await save(true)||dirty)return}
    downtimeContext={driver,date};dtReset();
    const allowed=window.TransfersAccess.can("driver_schedules");
    $("downtimeForm").querySelectorAll("input,select,textarea,button[type=submit]").forEach(el=>el.disabled=!allowed);
    $("downtimeTitle").textContent=driver+" · "+friendly(date);
    dtRender();$("downtimeModal").classList.remove("hidden");
  }
  $("downtimeClose").onclick=()=>$("downtimeModal").classList.add("hidden");
  $("downtimeCancel").onclick=dtReset;
  $("downtimeModal").addEventListener("click",e=>{if(e.target===$("downtimeModal"))$("downtimeModal").classList.add("hidden")});
  $("downtimeForm").onsubmit=async e=>{
    e.preventDefault();if(!window.TransfersAccess.can("driver_schedules")||!downtimeContext)return;
    const start=minutes($("downtimeStart").value)+Number($("downtimeStartDay").value)*1440,end=minutes($("downtimeEnd").value)+Number($("downtimeEndDay").value)*1440;
    if(end<=start){$("downtimeMsg").textContent="End must be after start. For an overnight gap, select Next day.";return}
    const {driver,date}=downtimeContext;
    const payload={driver_name:driver,schedule_date:date,start_minute:start,end_minute:end,reason:$("downtimeReason").value,notes:$("downtimeNotes").value.trim(),updated_by:user.id};
    $("downtimeSave").disabled=true;
    try{
      let query;
      if(downtimeEditing){
        const old=downtimeRows.find(r=>r.id===downtimeEditing);
        query=sb.from("driver_downtime").update(payload).eq("id",old.id).eq("updated_at",old.updated_at);
      }else query=sb.from("driver_downtime").insert(payload);
      const result=await query.select("*").single();
      if(result.error){$("downtimeMsg").textContent=result.error.message;return}
      downtimeRows=downtimeRows.filter(r=>r.id!==result.data.id).concat(result.data);
      dtReset();dtRender();render();
    }catch(err){$("downtimeMsg").textContent=err.message}finally{$("downtimeSave").disabled=false}
  };

  function updateOverrunWarnings(){
    const map=new Map(scheduleRows.map(r=>[r.driver_name+"|"+r.schedule_date,r]));
    E.body.querySelectorAll("tr[data-driver]").forEach(tr=>tr.querySelectorAll(".schedule-day-cell").forEach(cell=>{
      map.set(tr.dataset.driver+"|"+cell.dataset.date,{driver_name:tr.dataset.driver,schedule_date:cell.dataset.date,start_time:cell.querySelector(".shift-start")?.value||"",end_time:cell.querySelector(".shift-end")?.value||""});
    }));
    const rows=[...map.values()],coverage=window.TransferScheduleCoverage;
    E.body.querySelectorAll("tr[data-driver]").forEach(tr=>{
      const driver=tr.dataset.driver;
      tr.querySelectorAll(".schedule-day-cell").forEach(cell=>{
        cell.querySelector(".schedule-overrun-warning")?.remove();cell.querySelector(".shift-overnight-note")?.remove();
        cell.classList.remove("has-schedule-overrun");cell.removeAttribute("title");
        const date=cell.dataset.date,own=map.get(driver+"|"+date),previous=map.get(driver+"|"+addDays(date,-1)),notes=[];
        if(own?.start_time&&own?.end_time&&minutes(own.end_time)<minutes(own.start_time))notes.push("Ends next day at "+time12(own.end_time));
        if(previous?.start_time&&previous?.end_time&&minutes(previous.end_time)<minutes(previous.start_time)&&minutes(previous.end_time)>0)notes.push("From previous day: midnight–"+time12(previous.end_time));
        if(notes.length){const note=document.createElement("div");note.className="shift-overnight-note";note.style.fontSize="11px";note.style.marginTop="4px";note.textContent=notes.join(" · ");cell.appendChild(note)}
        const ranges=coverage.intervals(rows,driver,date);
        const spill=weekTransfers.some(t=>String(t.driver||"")===driver&&String(t.scheduled_date||"")===date&&!coverage.covers(ranges,minutes(t.scheduled_time),minutes(t.scheduled_time)+Number(t.duration_minutes||0)));
        if(!spill)return;
        cell.classList.add("has-schedule-overrun");cell.title="One or more transfers extend outside this driver's scheduled hours.";
        const warning=document.createElement("span");warning.className="schedule-overrun-warning";warning.setAttribute("aria-hidden","true");cell.appendChild(warning);
      });
    });
  }

  function time12(t){
    if(!t)return "";
    const [h,m]=String(t).slice(0,5).split(":").map(Number);
    return (h%12||12)+":"+String(m).padStart(2,"0")+" "+(h>=12?"PM":"AM");
  }
  function reportShow(text,type=""){
    E.reportMsg.textContent=text||"";
    E.reportMsg.className="report-msg"+(type?" "+type:"");
  }
  function reportQuarterRange(year,quarter){
    const y=Number(year),q=Number(quarter);
    const start=localISO(new Date(y,(q-1)*3,1,12,0,0));
    const next=localISO(new Date(y,q*3,1,12,0,0));
    return {start,end:addDays(next,-1)};
  }
  function activityTime(t){return time12(t)||"Off"}
  function scheduleEntries(rows){
    const map=new Map();
    (rows||[]).forEach(r=>map.set(String(r.driver_name)+"|"+String(r.schedule_date),{start:String(r.start_time||"").slice(0,5),end:String(r.end_time||"").slice(0,5)}));
    return map;
  }
  function recordScheduleChanges(beforeRows,afterRows){
    const before=scheduleEntries(beforeRows),after=scheduleEntries(afterRows),entries=[];
    for(const driver of drivers){
      for(const date of weekDates()){
        const key=driver+"|"+date;
        const b=before.get(key)||{start:"",end:""};
        const a=after.get(key)||{start:"",end:""};
        if(b.start===a.start&&b.end===a.end)continue;
        const from=b.start&&b.end?activityTime(b.start)+"–"+activityTime(b.end):"Off";
        const to=a.start&&a.end?activityTime(a.start)+"–"+activityTime(a.end):"Off";
        entries.push({driver_name:driver,action:"Schedule changed",details:friendly(date,{weekday:"long",month:"short",day:"numeric"})+" · "+from+" → "+to,actor_name:userName()});
      }
    }
    if(entries.length)window.recordDriverActivity?.(entries);
  }
  function setDirty(value=true){
    if(value)editVersion++;
    dirty=value;
    E.save.textContent=dirty?"Save Schedule *":"Save Schedule";
  }
  function weekDates(){return Array.from({length:7},(_,i)=>addDays(E.week.value,i))}
  function scheduleMap(){
    const map=new Map();
    scheduleRows.forEach(r=>map.set(String(r.driver_name)+"|"+String(r.schedule_date),r));
    return map;
  }
  function updateHeaders(){
    const dates=weekDates();
    dates.forEach((date,i)=>{
      $("dayHead"+i).innerHTML='<span class="schedule-day-name">'+friendly(date,{weekday:"short"})+'</span><span class="schedule-day-date">'+friendly(date,{month:"short",day:"numeric"})+'</span>';
    });
    const end=dates[6];
    E.title.textContent=friendly(E.week.value,{month:"long",day:"numeric",year:"numeric"})+" – "+friendly(end,{month:"long",day:"numeric",year:"numeric"});
  }
  function recalcRow(tr){
    let total=0,scheduledTotal=0,downTotal=0;
    tr.querySelectorAll(".schedule-day-cell").forEach(cell=>{
      const start=cell.querySelector(".shift-start")?.value||"";
      const end=cell.querySelector(".shift-end")?.value||"";
      const h=dayHours(start,end,tr.dataset.driver,cell.dataset.date);
      total+=h.billable;scheduledTotal+=h.scheduled;downTotal+=h.down;
      const summary=cell.querySelector(".downtime-summary");
      if(summary)summary.textContent=fmtHours(h.down)+" hrs downtime · "+fmtHours(h.billable)+" hrs billable";
      cell.classList.toggle("scheduled",!!(start&&end));
    });
    const totalEl=tr.querySelector(".driver-week-total");
    if(totalEl)totalEl.textContent=fmtHours(total)+" hrs billable · "+fmtHours(scheduledTotal)+" scheduled · "+fmtHours(downTotal)+" downtime";
  }
  function render(){
    updateHeaders();
    const map=scheduleMap();
    E.body.innerHTML="";
    if(!drivers.length){
      E.body.innerHTML='<tr><td colspan="9" class="schedule-empty">No drivers have been added yet. Use Add Driver above to set up a driver.</td></tr>';
      return;
    }
    const dates=weekDates();
    drivers.forEach(driver=>{
      const tr=document.createElement("tr");
      tr.dataset.driver=driver;
      const name=document.createElement("th");
      name.scope="row";
      name.className="driver-name-cell";
      name.innerHTML='<a class="driver-name-text" href="driver-profile.html?driver='+encodeURIComponent(driver)+'">'+esc(driver)+'</a><div class="driver-period-copy"><button type="button" class="copy-week" title="Copy this driver\'s current week to next week">Week →</button><button type="button" class="copy-month" title="Copy this driver\'s current month to next month">Month →</button></div>';
      tr.appendChild(name);

      dates.forEach(date=>{
        const row=map.get(driver+"|"+date);
        const td=document.createElement("td");
        td.className="schedule-day-cell";
        td.dataset.date=date;
        td.innerHTML=
          '<label><span>Start</span><input class="shift-start" type="time" step="900" value="'+esc(row?.start_time?String(row.start_time).slice(0,5):"")+'" aria-label="'+esc(driver)+" "+esc(date)+' start"></label>'+
          '<label><span>End</span><input class="shift-end" type="time" step="900" value="'+esc(row?.end_time?String(row.end_time).slice(0,5):"")+'" aria-label="'+esc(driver)+" "+esc(date)+' end"></label>'+
          '<div class="downtime-summary"></div><div class="shift-actions"><button class="clear-shift" type="button" title="Clear shift">Off</button><button class="copy-day" type="button" title="Copy this day to the next day">Day →</button><button type="button" class="open-downtime">Downtime</button></div>';
        tr.appendChild(td);
      });

      const total=document.createElement("td");
      total.className="driver-week-total";
      tr.appendChild(total);
      E.body.appendChild(tr);
      recalcRow(tr);
    });

    E.body.querySelectorAll('input[type="time"]').forEach(input=>{
      input.addEventListener("change",()=>{
        recalcRow(input.closest("tr"));
        updateOverrunWarnings();
        setDirty(true);
      });
    });
    E.body.querySelectorAll(".clear-shift").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const cell=btn.closest(".schedule-day-cell");
        cell.querySelector(".shift-start").value="";
        cell.querySelector(".shift-end").value="";
        recalcRow(btn.closest("tr"));
        updateOverrunWarnings();
        setDirty(true);
      });
    });
    E.body.querySelectorAll(".copy-day").forEach(btn=>{
      btn.addEventListener("click",()=>copyPeriod(btn.closest("tr").dataset.driver,"day",btn.closest(".schedule-day-cell").dataset.date));
    });
    E.body.querySelectorAll(".copy-week").forEach(btn=>{
      btn.addEventListener("click",()=>copyPeriod(btn.closest("tr").dataset.driver,"week",E.week.value));
    });
    E.body.querySelectorAll(".copy-month").forEach(btn=>{
      btn.addEventListener("click",()=>copyPeriod(btn.closest("tr").dataset.driver,"month",E.week.value));
    });
    E.body.querySelectorAll(".open-downtime").forEach(btn=>btn.onclick=()=>dtOpen(btn.closest("tr").dataset.driver,btn.closest("td").dataset.date));
    updateOverrunWarnings();
  }
  async function loadDriverList(){
    let r=await sb.from("transfer_drivers").select("name,sort_order").neq("name","Planning").order("sort_order",{ascending:true}).order("name",{ascending:true});
    if(r.error){
      r=await sb.from("transfer_drivers").select("name").neq("name","Planning").order("name",{ascending:true});
    }
    return r;
  }
  async function loadWeek({background=false}={}){
    if(!live||!user)return;
    if(background&&(dirty||scheduleFocused())){refreshPending=true;return}
    const request=++loadVersion,revision=editVersion,account=user.id;
    if(!background)setDirty(false);
    if(!background)show("Loading schedule…");
    updateHeaders();
    const start=E.week.value,end=addDays(start,6);
    const [dr,sc,tr,dt]=await Promise.all([
      loadDriverList(),
      sb.from("driver_schedules").select("*").gte("schedule_date",addDays(start,-1)).lte("schedule_date",addDays(end,1)),
      sb.from("transfers").select("driver,scheduled_date,scheduled_time,duration_minutes").gte("scheduled_date",start).lte("scheduled_date",end),
      sb.from("driver_downtime").select("*").gte("schedule_date",start).lte("schedule_date",end)
    ]);
    if(request!==loadVersion||start!==E.week.value||user?.id!==account)return;
    if(editVersion!==revision||dirty||scheduleFocused()){
      refreshPending=true;
      if(!dirty)show("");
      return;
    }
    refreshPending=false;
    if(dr.error){
      show("Could not load drivers: "+dr.error.message,"error");
      drivers=[];
    }else{
      drivers=(dr.data||[]).map(x=>x.name).filter(Boolean);
    }
    if(sc.error){
      scheduleRows=[];
      render();
      if(/driver_schedules/i.test(sc.error.message||"")){
        show("Driver scheduling needs migration-v11.sql to be run in Supabase.","error");
      }else{
        show("Could not load driver schedules: "+sc.error.message,"error");
      }
      return;
    }
    if(dt.error){show("Could not load downtime: "+dt.error.message,"error");return}
    downtimeRows=dt.data||[];
    scheduleRows=sc.data||[];
    if(tr.error){
      weekTransfers=[];
      render();
      show("Schedule loaded, but transfer overrun warnings could not load: "+tr.error.message,"error");
      return;
    }
    weekTransfers=tr.data||[];
    render();
    show("");
  }
  async function refreshTransferWarnings(){
    if(!live||!user)return;
    const start=E.week.value,end=addDays(start,6);
    const r=await sb.from("transfers")
      .select("driver,scheduled_date,scheduled_time,duration_minutes")
      .gte("scheduled_date",start)
      .lte("scheduled_date",end);
    if(r.error)return;
    weekTransfers=r.data||[];
    updateOverrunWarnings();
  }
  function collect(){
    const rows=[];
    let invalid=null;
    E.body.querySelectorAll("tr[data-driver]").forEach(tr=>{
      const driver=tr.dataset.driver;
      tr.querySelectorAll(".schedule-day-cell").forEach(cell=>{
        const start=cell.querySelector(".shift-start").value;
        const end=cell.querySelector(".shift-end").value;
        if((start&&!end)||(!start&&end)){
          invalid=invalid||driver+" on "+friendly(cell.dataset.date,{weekday:"long",month:"short",day:"numeric"});
          return;
        }
        {
          rows.push({
            driver_name:driver,
            schedule_date:cell.dataset.date,
            start_time:start||null,
            end_time:end||null,
            updated_by:user.id,
            updated_by_name:userName(),
            updated_at:new Date().toISOString()
          });
        }
      });
    });
    return {rows,invalid};
  }
  async function save(quiet=false){if(!window.TransfersAccess.can("driver_schedules"))return;
    if(!live||!user)return false;
    const savedRevision=editVersion;
    const beforeRows=scheduleRows.map(r=>({...r}));
    const {rows,invalid}=collect();
    if(invalid){
      show("Enter both a start and end time for "+invalid+", or clear both fields.","error");
      return false;
    }
    E.save.disabled=true;
    if(!quiet)show("Saving driver schedule…");
    const start=E.week.value,end=addDays(start,6);
    try{
      if(rows.length){
        const ins=await sb.from("driver_schedules").upsert(rows,{onConflict:"driver_name,schedule_date"});
        if(ins.error){show("Could not save schedule: "+ins.error.message,"error");return false}
      }
      // A user may keep typing while the save is in flight.
      scheduleRows=rows;
      if(editVersion===savedRevision)setDirty(false);
      recordScheduleChanges(beforeRows,rows);
      requestScheduleRefresh();
      if(!quiet)show(dirty?"Schedule saved. Newer edits still need saving.":"Driver schedule saved.","ok");
      return true;
    }finally{
      E.save.disabled=false;
    }
  }

  function copiedDates(sourceRows,period,sourceStart,sourceEnd,targetStart,targetEnd){
    const sourceMap=new Map(sourceRows.map(r=>[r.schedule_date,r]));
    const weekdays=Array.from({length:7},()=>[]);
    for(let date=sourceStart;date<=sourceEnd;date=addDays(date,1))weekdays[parseISO(date).getDay()].push(date);
    const seen=Array(7).fill(0),result=[];
    for(let date=targetStart,offset=0;date<=targetEnd;date=addDays(date,1),offset++){
      let sourceDate=addDays(sourceStart,offset);
      if(period==="month"){
        const day=parseISO(date).getDay(),choices=weekdays[day];
        sourceDate=choices[Math.min(seen[day]++,choices.length-1)];
      }
      const row=sourceMap.get(sourceDate);
      result.push({schedule_date:date,start_time:row?.start_time?String(row.start_time).slice(0,5):null,end_time:row?.end_time?String(row.end_time).slice(0,5):null});
    }
    return result;
  }

  let copyingSchedule=false;
  async function copyPeriod(driver,period,sourceDate){if(!window.TransfersAccess.can("copy_schedules"))return;
    if(!live||!user||copyingSchedule)return;
    copyingSchedule=true;
    try{
    if(dirty){
      const saved=await save(true);
      if(!saved)return;
      if(dirty){show("New schedule edits need saving before copying. Please save and try again.","error");return}
    }

    let sourceStart,sourceEnd,targetStart,targetEnd,label;
    if(period==="day"){
      sourceStart=sourceEnd=sourceDate;
      targetStart=targetEnd=addDays(sourceDate,1);
      label=friendly(sourceDate,{weekday:"long",month:"short",day:"numeric"})+" to "+friendly(targetStart,{weekday:"long",month:"short",day:"numeric"});
    }else if(period==="week"){
      sourceStart=mondayOf(sourceDate);
      sourceEnd=addDays(sourceStart,6);
      targetStart=addDays(sourceStart,7);
      targetEnd=addDays(targetStart,6);
      label="this week to next week";
    }else{
      sourceStart=monthStart(sourceDate);
      targetStart=addMonths(sourceStart,1);
      sourceEnd=addDays(targetStart,-1);
      targetEnd=addDays(addMonths(targetStart,1),-1);
      label=friendly(sourceStart,{month:"long",year:"numeric"})+" to "+friendly(targetStart,{month:"long",year:"numeric"});
    }

    show("Copying "+driver+"\'s "+period+" schedule…");
    const src=await sb.from("driver_schedules")
      .select("schedule_date,start_time,end_time")
      .eq("driver_name",driver)
      .gte("schedule_date",sourceStart)
      .lte("schedule_date",sourceEnd);
    if(src.error){show("Could not read source schedule: "+src.error.message,"error");return}

    const copies=copiedDates(src.data||[],period,sourceStart,sourceEnd,targetStart,targetEnd).map(row=>({
      ...row,driver_name:driver,updated_by:user.id,updated_by_name:userName(),updated_at:new Date().toISOString()
    }));
    const ins=await sb.from("driver_schedules").upsert(copies,{onConflict:"driver_name,schedule_date"}).select("driver_name,schedule_date,start_time,end_time");
    if(ins.error){show("Could not copy schedule: "+ins.error.message,"error");return}

    const persisted=scheduleEntries(ins.data||[]);
    const verified=copies.every(row=>{
      const saved=persisted.get(row.driver_name+"|"+row.schedule_date);
      return saved&&saved.start===String(row.start_time||"").slice(0,5)&&saved.end===String(row.end_time||"").slice(0,5);
    });
    if(!verified){show("The copied schedule could not be confirmed. Refresh and check the destination dates before trying again.","error");return}
    await loadWeek({background:true});
    window.recordDriverActivity?.([{
      driver_name:driver,
      action:"Schedule copied",
      details:label+" · "+(period==="day"?"day":period)+" schedule copied forward",
      actor_name:userName()
    }]);
    const destination=targetStart===targetEnd?friendly(targetStart,{month:"short",day:"numeric",year:"numeric"}):friendly(targetStart,{month:"short",day:"numeric"})+" – "+friendly(targetEnd,{month:"short",day:"numeric",year:"numeric"});
    show(driver+" "+period+" schedule copied to "+destination+(dirty?". Newer edits still need saving.":"."),"ok");
    }catch(error){show("Could not copy schedule: "+(error.message||String(error)),"error")}
    finally{copyingSchedule=false}
  }



  let driverListRows=[],driverListVersion=0;
  function regularShift(week){
    if(!Array.isArray(week))return "Not set";
    const order=[1,2,3,4,5,6,0],labels=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],groups=new Map();
    order.forEach((day,index)=>{
      const shift=week[day],start=String(shift?.start||"").slice(0,5),end=String(shift?.end||"").slice(0,5);
      if(!start||!end||start===end)return;
      const key=start+"|"+end;
      if(!groups.has(key))groups.set(key,{start,end,indices:[]});
      groups.get(key).indices.push(index);
    });
    if(!groups.size)return "No regular shift set";
    return [...groups.values()].map(({start,end,indices})=>{
      const runs=[];let first=indices[0],last=first;
      for(const index of indices.slice(1)){if(index===last+1)last=index;else{runs.push(first===last?labels[first]:labels[first]+"–"+labels[last]);first=last=index}}
      runs.push(first===last?labels[first]:labels[first]+"–"+labels[last]);
      return runs.join(", ")+" · "+time12(start)+"–"+time12(end)+(minutes(end)<minutes(start)?" (+1 day)":"");
    }).join("\n");
  }
  function renderDriverList(){
    const body=$("driverListRows");body.replaceChildren();
    if(!driverListRows.length){body.innerHTML='<tr><td colspan="3">No drivers added yet.</td></tr>';return}
    for(const row of driverListRows){
      const tr=document.createElement("tr");tr.classList.toggle("is-inactive",!row.is_active);
      const driver=document.createElement("td");
      if(window.TransfersAccess.can("driver_profiles")){
        const link=document.createElement("a");link.href="driver-profile.html?driver="+encodeURIComponent(row.name);link.textContent=row.name;driver.append(link);
      }else driver.textContent=row.name;
      if(row.full_name&&row.full_name!==row.name){const name=document.createElement("small");name.textContent=row.full_name;driver.append(name)}
      const status=document.createElement("td"),select=document.createElement("select");select.setAttribute("aria-label","Status for "+row.name);
      select.innerHTML='<option value="true">Active</option><option value="false">Inactive</option>';select.value=String(row.is_active);
      select.disabled=!window.TransfersAccess.can("driver_profiles");
      select.onchange=async()=>{
        const active=select.value==="true",previous=row.is_active;
        if(active===previous)return;select.disabled=true;$("driverListMessage").textContent="Saving "+row.name+"…";
        try{
          const result=await sb.from("transfer_drivers").update({is_active:active}).eq("name",row.name).eq("is_active",previous).select("name,is_active").single();
          if(result.error)throw result.error;
          row.is_active=result.data.is_active;tr.classList.toggle("is-inactive",!row.is_active);
          $("driverListMessage").textContent=row.name+" marked "+(row.is_active?"active":"inactive")+".";
        }catch(error){select.value=String(previous);$("driverListMessage").textContent="Could not update driver: "+error.message}
        finally{select.disabled=!window.TransfersAccess.can("driver_profiles")}
      };
      status.append(select);
      const shift=document.createElement("td");shift.className="driver-list-shift";
      regularShift(row.weekly_schedule).split("\n").forEach(text=>{const line=document.createElement("div");line.textContent=text;shift.append(line)});
      tr.append(driver,status,shift);body.append(tr);
    }
  }
  async function openDriverList(){
    if(!live||!user)return;
    $("driverListModal").classList.remove("hidden");$("driverListMessage").textContent="Loading drivers…";
    $("driverListRows").replaceChildren();
    const version=++driverListVersion,account=user.id;
    const result=await sb.from("transfer_drivers").select("name,full_name,is_active,weekly_schedule").neq("name","Planning").order("name");
    if(version!==driverListVersion||user?.id!==account)return;
    if(result.error){$("driverListMessage").textContent="Could not load drivers: "+result.error.message;return}
    driverListRows=(result.data||[]).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:"base"}));
    renderDriverList();$("driverListMessage").textContent="";
  }
  function closeDriverList(){driverListVersion++;$("driverListModal").classList.add("hidden")}
  $("driverList").onclick=openDriverList;$("driverListClose").onclick=closeDriverList;
  $("driverListModal").addEventListener("click",event=>{if(event.target===$("driverListModal"))closeDriverList()});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closeDriverList()});

  function renderReportDrivers(){
    E.reportDriverList.innerHTML="";
    drivers.forEach((driver,index)=>{
      const label=document.createElement("label");
      label.className="report-driver-option";
      label.innerHTML='<input type="checkbox" value="'+esc(driver)+'" checked><span>'+esc(driver)+'</span>';
      E.reportDriverList.appendChild(label);
    });
    if(!drivers.length)E.reportDriverList.innerHTML='<div class="report-driver-empty">No drivers available.</div>';
  }

  function toggleReportPeriod(){
    const type=E.reportPeriod.value;
    [E.reportWeekFields,E.reportMonthFields,E.reportQuarterFields,E.reportCustomFields].forEach(x=>x.classList.add("hidden"));
    if(type==="week")E.reportWeekFields.classList.remove("hidden");
    else if(type==="month")E.reportMonthFields.classList.remove("hidden");
    else if(type==="quarter")E.reportQuarterFields.classList.remove("hidden");
    else E.reportCustomFields.classList.remove("hidden");
  }

  function openReports(){if(!window.TransfersAccess.can("driver_reports"))return;
    renderReportDrivers();
    const current=E.week.value||mondayOf(new Date());
    const currentDate=parseISO(current);
    E.reportPeriod.value="week";
    E.reportWeekDate.value=current;
    E.reportMonth.value=current.slice(0,7);
    E.reportQuarterYear.value=String(currentDate.getFullYear());
    E.reportQuarter.value=String(Math.floor(currentDate.getMonth()/3)+1);
    E.reportStartDate.value=current;
    E.reportEndDate.value=addDays(current,6);
    toggleReportPeriod();
    reportShow("");
    E.reportModal.classList.remove("hidden");
  }

  function closeReports(){
    if(E.reportRun.disabled)return;
    E.reportModal.classList.add("hidden");
    reportShow("");
  }

  function selectedReportDrivers(){
    return [...E.reportDriverList.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
  }

  function getReportRange(){
    const type=E.reportPeriod.value;
    if(type==="week"){
      if(!E.reportWeekDate.value)return null;
      const start=mondayOf(E.reportWeekDate.value);
      return {start,end:addDays(start,6),label:"Week of "+friendly(start,{month:"long",day:"numeric",year:"numeric"})};
    }
    if(type==="month"){
      if(!E.reportMonth.value)return null;
      const start=E.reportMonth.value+"-01";
      const end=addDays(addMonths(start,1),-1);
      return {start,end,label:friendly(start,{month:"long",year:"numeric"})};
    }
    if(type==="quarter"){
      if(!E.reportQuarterYear.value||!E.reportQuarter.value)return null;
      const range=reportQuarterRange(E.reportQuarterYear.value,E.reportQuarter.value);
      return {...range,label:"Q"+E.reportQuarter.value+" "+E.reportQuarterYear.value};
    }
    if(!E.reportStartDate.value||!E.reportEndDate.value)return null;
    if(parseISO(E.reportEndDate.value)<parseISO(E.reportStartDate.value))return {error:"End date must be on or after the start date."};
    return {
      start:E.reportStartDate.value,
      end:E.reportEndDate.value,
      label:friendly(E.reportStartDate.value,{month:"short",day:"numeric",year:"numeric"})+" – "+friendly(E.reportEndDate.value,{month:"short",day:"numeric",year:"numeric"})
    };
  }

  function buildDriverPdf(selected,range,rows,sortBy="driver",reportDowntime=[],separateDrivers=false){
    const JsPdf=window.jspdf?.jsPDF;
    if(!JsPdf)throw new Error("PDF library did not load. Refresh the page and try again.");
    const doc=new JsPdf({orientation:"portrait",unit:"pt",format:"letter"});
    const pageW=doc.internal.pageSize.getWidth(),pageH=doc.internal.pageSize.getHeight();
    const margin=42,rowH=18;
    let y=44;

    function pageHeader(first=false){
      if(!first)doc.addPage();
      y=44;
      doc.setTextColor(20,30,40);
      doc.setFont("helvetica","bold");
      doc.setFontSize(18);
      doc.text("Driver Hours Report",margin,y);
      y+=18;
      doc.setFont("helvetica","normal");
      doc.setFontSize(10);
      doc.setTextColor(90,100,110);
      doc.text(range.label+"  |  "+friendly(range.start,{month:"short",day:"numeric",year:"numeric"})+" to "+friendly(range.end,{month:"short",day:"numeric",year:"numeric"}),margin,y);
      y+=14;
      doc.text("Generated "+new Date().toLocaleString()+"  |  Daily overtime threshold: over 10 hours",margin,y);
      y+=24;
      doc.setDrawColor(210,216,222);
      doc.line(margin,y-10,pageW-margin,y-10);
    }

    function ensure(space){
      if(y+space>pageH-42)pageHeader(false);
    }

    function tableHeader(driver,continued=false){
      ensure(58);
      doc.setTextColor(20,30,40);
      doc.setFont("helvetica","bold");
      doc.setFontSize(13);
      doc.text(driver+(continued?" (continued)":""),margin,y);
      y+=18;
      doc.setFillColor(239,243,246);
      doc.rect(margin,y-12,pageW-margin*2,rowH,"F");
      doc.setFontSize(9);
      doc.text(sortBy==="day"?"Driver":"Date",margin+5,y);
      if(sortBy!=="day")doc.text("Day",margin+100,y);
      doc.text("Start",margin+220,y);
      doc.text("End",margin+300,y);
      doc.text("Billable",margin+380,y);
      y+=rowH;
    }

    pageHeader(true);

    const reportRows=rows.filter(r=>selected.includes(r.driver_name));
    const groups=sortBy==="day"
      ? [...new Set(reportRows.map(r=>String(r.schedule_date)))].sort().map(date=>({title:friendly(date,{weekday:"long",month:"short",day:"numeric",year:"numeric"}),list:reportRows.filter(r=>String(r.schedule_date)===date).sort((a,b)=>a.driver_name.localeCompare(b.driver_name,undefined,{numeric:true,sensitivity:"base"}))}))
      : [...selected].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"})).map(driver=>({title:driver,list:reportRows.filter(r=>r.driver_name===driver).sort((a,b)=>String(a.schedule_date).localeCompare(String(b.schedule_date)))}));
    if(!groups.length){doc.setFontSize(10);doc.text("No scheduled days in this date range.",margin,y)}
    groups.forEach(({title:driver,list},driverIndex)=>{
      const hours=r=>dayHours(r.start_time,r.end_time,r.driver_name,String(r.schedule_date),reportDowntime);
      const total=list.reduce((sum,r)=>sum+hours(r).billable,0);
      const scheduled=list.reduce((sum,r)=>sum+hours(r).scheduled,0);
      const down=list.reduce((sum,r)=>sum+hours(r).down,0);
      const overtimeDays=list.filter(r=>hours(r).billable>10).length;
      const overtimeHours=list.reduce((sum,r)=>sum+Math.max(0,hours(r).billable-10),0);

      if(driverIndex>0){if(separateDrivers)pageHeader(false);else y+=12;}
      tableHeader(driver,false);

      if(!list.length){
        ensure(rowH+34);
        doc.setFont("helvetica","italic");
        doc.setFontSize(9);
        doc.setTextColor(110,120,130);
        doc.text("No scheduled days in this date range.",margin+5,y);
        y+=rowH+4;
      }else{
        list.forEach((r,index)=>{
          if(y+rowH>pageH-72){
            pageHeader(false);
            tableHeader(driver,true);
          }
          const hrs=hours(r).billable;
          const day=friendly(r.schedule_date,{weekday:"long"});
          doc.setFont("helvetica","normal");
          doc.setFontSize(9);
          doc.setTextColor(25,35,45);
          if(sortBy==="day"){
            const name=String(r.driver_name);
            doc.setFontSize(Math.min(9,9*200/Math.max(1,doc.getTextWidth(name))));
            doc.text(name,margin+5,y);doc.setFontSize(9);
          }else{
            doc.text(friendly(r.schedule_date,{month:"short",day:"numeric",year:"numeric"}),margin+5,y);
            doc.text(day,margin+100,y);
          }
          if(hrs>10){
            const dayWidth=doc.getTextWidth(day);
            doc.setTextColor(200,35,35);
            doc.setFont("helvetica","bold");
            doc.text("!",sortBy==="day"?margin+365:margin+104+dayWidth,y);
            doc.setTextColor(25,35,45);
            doc.setFont("helvetica","normal");
          }
          doc.text(time12(r.start_time)||"OFF",margin+220,y);
          doc.text(time12(r.end_time)+(minutes(r.end_time)<minutes(r.start_time)?" (+1 day)":""),margin+300,y);
          doc.text(fmtHours(hrs),margin+380,y);
          doc.setDrawColor(232,236,240);
          doc.line(margin,y+5,pageW-margin,y+5);
          y+=rowH;
          const gaps=reportDowntime.filter(d=>d.driver_name===r.driver_name&&String(d.schedule_date)===String(r.schedule_date));
          if(gaps.length){
            const detail=["Scheduled: "+fmtHours(hours(r).scheduled)+" hrs · Downtime deducted: "+fmtHours(hours(r).down)+" hrs",
              ...gaps.map(d=>dtTime(d.start_minute)+" – "+dtTime(d.end_minute)+" · "+d.reason+(d.notes?" · "+d.notes:""))];
            doc.setFontSize(8);
            for(const text of detail)for(const line of doc.splitTextToSize(text,pageW-margin*2-10)){
              ensure(14);doc.text(line,margin+5,y);y+=12;
            }
          }
        });
      }

      ensure(42);
      doc.setFont("helvetica","bold");
      doc.setFontSize(10);
      doc.setTextColor(20,30,40);
      doc.text("Billable: "+fmtHours(total)+" hrs · Scheduled: "+fmtHours(scheduled)+" hrs · Downtime: "+fmtHours(down)+" hrs",margin+5,y+5);
      y+=16;
      doc.setFont("helvetica","normal");
      doc.setTextColor(90,100,110);
      doc.text("Overtime Days: "+overtimeDays+"   Overtime Hours: "+fmtHours(overtimeHours),margin+150,y+5);
      y+=28;
    });

    const pages=doc.getNumberOfPages();
    for(let p=1;p<=pages;p++){
      doc.setPage(p);
      doc.setFont("helvetica","normal");
      doc.setFontSize(8);
      doc.setTextColor(120,128,136);
      doc.text("Page "+p+" of "+pages,pageW-margin, pageH-20,{align:"right"});
    }

    const safeStart=range.start.replace(/-/g,"");
    const safeEnd=range.end.replace(/-/g,"");
    doc.save("driver-hours_"+safeStart+"_to_"+safeEnd+".pdf");
  }

  async function runReport(e){if(!window.TransfersAccess.can("driver_reports")){e.preventDefault();return;}
    e.preventDefault();
    if(!live||!user)return;
    const selected=selectedReportDrivers();
    if(!selected.length){reportShow("Select at least one driver.","error");return}
    const separateDrivers=Boolean(E.reportSeparate?.checked);
    const sortBy=!separateDrivers&&E.reportSort?.value==="day"?"day":"driver";
    const range=getReportRange();
    if(!range){reportShow("Choose a report period.","error");return}
    if(range.error){reportShow(range.error,"error");return}

    if(dirty){
      reportShow("Saving current schedule first…");
      const saved=await save(true);
      if(!saved){reportShow("Could not save the current schedule before running the report.","error");return}
    }

    E.reportRun.disabled=true;
    reportShow("Building PDF report…");
    try{
      const result=await sb.from("driver_schedules")
        .select("driver_name,schedule_date,start_time,end_time")
        .in("driver_name",selected)
        .gte("schedule_date",range.start)
        .lte("schedule_date",range.end)
        .order("driver_name",{ascending:true})
        .order("schedule_date",{ascending:true});

      if(result.error){reportShow("Could not load report data: "+result.error.message,"error");return}
      const dt=await sb.from("driver_downtime").select("*").in("driver_name",selected).gte("schedule_date",range.start).lte("schedule_date",range.end);
      if(dt.error)throw new Error("Could not load downtime: "+dt.error.message);
      buildDriverPdf(selected,range,result.data||[],sortBy,dt.data||[],separateDrivers);
      reportShow("PDF report generated.","ok");
    }catch(err){
      reportShow("Could not generate PDF: "+(err?.message||String(err)),"error");
    }finally{
      E.reportRun.disabled=false;
    }
  }

  async function subscribe(){
    if(!live)return;
    if(channel)await sb.removeChannel(channel);
    channel=sb.channel("driver-schedule-data")
      .on("postgres_changes",{event:"*",schema:"public",table:"driver_schedules"},()=>requestScheduleRefresh())
      .on("postgres_changes",{event:"*",schema:"public",table:"driver_downtime"},()=>requestScheduleRefresh())
      .on("postgres_changes",{event:"*",schema:"public",table:"transfer_drivers"},()=>requestScheduleRefresh())
      .on("postgres_changes",{event:"*",schema:"public",table:"transfers"},()=>refreshTransferWarnings())
      .subscribe();
  }
  async function session(s){
    if(!s?.user){
      closeDriverList();driverListRows=[];$("driverListRows").replaceChildren();user=null;loadVersion++;refreshPending=false;clearTimeout(refreshTimer);
      E.login.classList.remove("hidden");
      return;
    }
    const sameUser=user?.id===s.user.id;
    user=s.user;
    if(sameUser)return;
    E.login.classList.add("hidden");
    E.signout.classList.remove("hidden");
    const r=await sb.from("profiles").select("display_name").eq("id",user.id).maybeSingle();
    if(user?.id!==s.user.id)return;
    profile=r.data||{display_name:user.email?.split("@")[0]||"User"};
    E.me.textContent=String(userName()).split("@")[0];
    E.email.textContent=user.email||"";
    await loadWeek();
    await subscribe();
  }

  E.prev.onclick=()=>{if(dirty&&!confirm("Discard unsaved schedule changes?"))return;E.week.value=addDays(E.week.value,-7);lastWeekValue=E.week.value;loadWeek()};
  E.next.onclick=()=>{if(dirty&&!confirm("Discard unsaved schedule changes?"))return;E.week.value=addDays(E.week.value,7);lastWeekValue=E.week.value;loadWeek()};
  E.thisWeek.onclick=()=>{if(dirty&&!confirm("Discard unsaved schedule changes?"))return;E.week.value=mondayOf(new Date());lastWeekValue=E.week.value;loadWeek()};
  E.week.onchange=()=>{const next=mondayOf(E.week.value);if(dirty&&!confirm("Discard unsaved schedule changes?")){E.week.value=lastWeekValue;return}E.week.value=next;lastWeekValue=next;loadWeek()};
  $("addDriver").onclick=()=>{location.href="driver-profile.html";};
  E.save.onclick=save;
  E.reports.onclick=openReports;
  E.reportClose.onclick=closeReports;
  E.reportCancel.onclick=closeReports;
  E.reportSeparate.onchange=()=>{
    if(E.reportSeparate.checked)E.reportSort.value="driver";
    E.reportSort.disabled=E.reportSeparate.checked;
  };
  E.reportPeriod.onchange=toggleReportPeriod;
  document.getElementById("reportCustomRange").onclick=()=>{E.reportPeriod.value="custom";toggleReportPeriod();E.reportStartDate.focus()};
  E.reportSelectAll.onclick=()=>E.reportDriverList.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=true);
  E.reportClearAll.onclick=()=>E.reportDriverList.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=false);
  E.reportModal.addEventListener("click",e=>{if(e.target===E.reportModal)closeReports()});
  E.reportForm.addEventListener("submit",runReport);
  E.signout.onclick=()=>sb?.auth.signOut();
  E.loginForm.onsubmit=async e=>{
    e.preventDefault();
    E.loginMsg.textContent="Signing in…";
    const r=await sb.auth.signInWithPassword({email:E.loginEmail.value.trim(),password:E.loginPassword.value});
    E.loginMsg.textContent=r.error?r.error.message:"";
  };
  window.addEventListener("beforeunload",e=>{if(!dirty)return;e.preventDefault();e.returnValue=""});

  const requestedWeek=new URLSearchParams(location.search).get("week");
  E.week.value=mondayOf(requestedWeek&&/^\d{4}-\d{2}-\d{2}$/.test(requestedWeek)?requestedWeek:new Date());
  lastWeekValue=E.week.value;
  if(!live){
    E.body.innerHTML='<tr><td colspan="9" class="schedule-empty">Supabase is not configured.</td></tr>';
    show("Supabase is not configured.","error");
    return;
  }
  sb.auth.getSession().then(r=>session(r.data.session));
  sb.auth.onAuthStateChange((_event,s)=>{setTimeout(()=>session(s),0)});
})();
})();

