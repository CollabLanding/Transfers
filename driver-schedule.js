(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const live=!!(C.supabaseUrl&&C.supabaseAnonKey&&window.supabase);
  const sb=live?window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey):null;
  const $=id=>document.getElementById(id);
  const E={
    week:$("weekStart"),prev:$("prevWeek"),next:$("nextWeek"),thisWeek:$("thisWeek"),
    title:$("weekTitle"),body:$("scheduleBody"),save:$("saveSchedule"),msg:$("scheduleMsg"),
    reports:$("runReports"),reportModal:$("reportModal"),reportForm:$("reportForm"),reportClose:$("reportClose"),reportCancel:$("reportCancel"),
    reportDriverList:$("reportDriverList"),reportSelectAll:$("reportSelectAll"),reportClearAll:$("reportClearAll"),reportPeriod:$("reportPeriod"),
    reportWeekFields:$("reportWeekFields"),reportMonthFields:$("reportMonthFields"),reportQuarterFields:$("reportQuarterFields"),reportCustomFields:$("reportCustomFields"),
    reportWeekDate:$("reportWeekDate"),reportMonth:$("reportMonth"),reportQuarterYear:$("reportQuarterYear"),reportQuarter:$("reportQuarter"),
    reportStartDate:$("reportStartDate"),reportEndDate:$("reportEndDate"),reportRun:$("reportRun"),reportMsg:$("reportMsg"),
    me:$("me"),email:$("email"),signout:$("signout"),login:$("login"),loginForm:$("loginForm"),
    loginEmail:$("loginEmail"),loginPassword:$("loginPassword"),loginMsg:$("loginMsg")
  };
  let user=null,profile=null,drivers=[],scheduleRows=[],channel=null,dirty=false,lastWeekValue="";

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
    const rounded=Math.round(n*4)/4;
    return Number.isInteger(rounded)?String(rounded):rounded.toFixed(2).replace(/0$/,"");
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
  function setDirty(value=true){
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
    let total=0;
    tr.querySelectorAll(".schedule-day-cell").forEach(cell=>{
      const start=cell.querySelector(".shift-start")?.value||"";
      const end=cell.querySelector(".shift-end")?.value||"";
      total+=hoursBetween(start,end);
      cell.classList.toggle("scheduled",!!(start&&end));
    });
    const totalEl=tr.querySelector(".driver-week-total");
    if(totalEl)totalEl.textContent=fmtHours(total)+" hrs";
  }
  function render(){
    updateHeaders();
    const map=scheduleMap();
    E.body.innerHTML="";
    if(!drivers.length){
      E.body.innerHTML='<tr><td colspan="9" class="schedule-empty">No drivers have been added yet. Add drivers from the Transfers page.</td></tr>';
      return;
    }
    const dates=weekDates();
    drivers.forEach(driver=>{
      const tr=document.createElement("tr");
      tr.dataset.driver=driver;
      const name=document.createElement("th");
      name.scope="row";
      name.className="driver-name-cell";
      name.innerHTML='<span class="driver-name-text">'+esc(driver)+'</span><div class="driver-period-copy"><button type="button" class="copy-week" title="Copy this driver\'s current week to next week">Week →</button><button type="button" class="copy-month" title="Copy this driver\'s current month to next month">Month →</button></div>';
      tr.appendChild(name);

      dates.forEach(date=>{
        const row=map.get(driver+"|"+date);
        const td=document.createElement("td");
        td.className="schedule-day-cell";
        td.dataset.date=date;
        td.innerHTML=
          '<label><span>Start</span><input class="shift-start" type="time" step="900" value="'+esc(row?.start_time?String(row.start_time).slice(0,5):"")+'" aria-label="'+esc(driver)+" "+esc(date)+' start"></label>'+
          '<label><span>End</span><input class="shift-end" type="time" step="900" value="'+esc(row?.end_time?String(row.end_time).slice(0,5):"")+'" aria-label="'+esc(driver)+" "+esc(date)+' end"></label>'+
          '<div class="shift-actions"><button class="clear-shift" type="button" title="Clear shift">Off</button><button class="copy-day" type="button" title="Copy this day to the next day">Day →</button></div>';
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
        setDirty(true);
      });
    });
    E.body.querySelectorAll(".clear-shift").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const cell=btn.closest(".schedule-day-cell");
        cell.querySelector(".shift-start").value="";
        cell.querySelector(".shift-end").value="";
        recalcRow(btn.closest("tr"));
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
  }
  async function loadDriverList(){
    let r=await sb.from("transfer_drivers").select("name,sort_order").neq("name","Planning").order("sort_order",{ascending:true}).order("name",{ascending:true});
    if(r.error){
      r=await sb.from("transfer_drivers").select("name").neq("name","Planning").order("name",{ascending:true});
    }
    return r;
  }
  async function loadWeek(){
    if(!live||!user)return;
    setDirty(false);
    show("Loading schedule…");
    updateHeaders();
    const start=E.week.value,end=addDays(start,6);
    const [dr,sc]=await Promise.all([
      loadDriverList(),
      sb.from("driver_schedules").select("*").gte("schedule_date",start).lte("schedule_date",end)
    ]);
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
    scheduleRows=sc.data||[];
    render();
    show("");
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
        if(start&&end){
          rows.push({
            driver_name:driver,
            schedule_date:cell.dataset.date,
            start_time:start,
            end_time:end,
            updated_by:user.id,
            updated_by_name:userName(),
            updated_at:new Date().toISOString()
          });
        }
      });
    });
    return {rows,invalid};
  }
  async function save(quiet=false){
    if(!live||!user)return false;
    const {rows,invalid}=collect();
    if(invalid){
      show("Enter both a start and end time for "+invalid+", or clear both fields.","error");
      return false;
    }
    E.save.disabled=true;
    if(!quiet)show("Saving driver schedule…");
    const start=E.week.value,end=addDays(start,6);
    try{
      const del=await sb.from("driver_schedules").delete().gte("schedule_date",start).lte("schedule_date",end);
      if(del.error){show("Could not save schedule: "+del.error.message,"error");return false}
      if(rows.length){
        const ins=await sb.from("driver_schedules").insert(rows);
        if(ins.error){show("Could not save schedule: "+ins.error.message,"error");return false}
      }
      setDirty(false);
      await loadWeek();
      if(!quiet)show("Driver schedule saved.","ok");
      return true;
    }finally{
      E.save.disabled=false;
    }
  }

  async function copyPeriod(driver,period,sourceDate){
    if(!live||!user)return;
    if(dirty){
      const saved=await save(true);
      if(!saved)return;
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

    const del=await sb.from("driver_schedules")
      .delete()
      .eq("driver_name",driver)
      .gte("schedule_date",targetStart)
      .lte("schedule_date",targetEnd);
    if(del.error){show("Could not replace destination schedule: "+del.error.message,"error");return}

    const targetEndDate=parseISO(targetEnd);
    const copies=(src.data||[]).map(row=>{
      const offset=Math.round((parseISO(row.schedule_date)-parseISO(sourceStart))/86400000);
      const targetDate=addDays(targetStart,offset);
      if(parseISO(targetDate)>targetEndDate)return null;
      return {
        driver_name:driver,
        schedule_date:targetDate,
        start_time:String(row.start_time).slice(0,5),
        end_time:String(row.end_time).slice(0,5),
        updated_by:user.id,
        updated_by_name:userName(),
        updated_at:new Date().toISOString()
      };
    }).filter(Boolean);

    if(copies.length){
      const ins=await sb.from("driver_schedules").insert(copies);
      if(ins.error){show("Could not copy schedule: "+ins.error.message,"error");return}
    }

    await loadWeek();
    show(driver+" "+period+" schedule copied forward.","ok");
  }


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

  function openReports(){
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

  function buildDriverPdf(selected,range,rows){
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
      doc.text("Date",margin+5,y);
      doc.text("Day",margin+100,y);
      doc.text("Start",margin+220,y);
      doc.text("End",margin+300,y);
      doc.text("Hours",margin+380,y);
      y+=rowH;
    }

    pageHeader(true);

    selected.forEach((driver,driverIndex)=>{
      const list=rows.filter(r=>r.driver_name===driver).sort((a,b)=>String(a.schedule_date).localeCompare(String(b.schedule_date)));
      const total=list.reduce((sum,r)=>sum+hoursBetween(r.start_time,r.end_time),0);
      const overtimeDays=list.filter(r=>hoursBetween(r.start_time,r.end_time)>10).length;
      const overtimeHours=list.reduce((sum,r)=>sum+Math.max(0,hoursBetween(r.start_time,r.end_time)-10),0);

      if(driverIndex>0)y+=12;
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
          const hrs=hoursBetween(r.start_time,r.end_time);
          const day=friendly(r.schedule_date,{weekday:"long"});
          doc.setFont("helvetica","normal");
          doc.setFontSize(9);
          doc.setTextColor(25,35,45);
          doc.text(friendly(r.schedule_date,{month:"short",day:"numeric",year:"numeric"}),margin+5,y);
          doc.text(day,margin+100,y);
          if(hrs>10){
            const dayWidth=doc.getTextWidth(day);
            doc.setTextColor(200,35,35);
            doc.setFont("helvetica","bold");
            doc.text("!",margin+104+dayWidth,y);
            doc.setTextColor(25,35,45);
            doc.setFont("helvetica","normal");
          }
          doc.text(time12(r.start_time),margin+220,y);
          doc.text(time12(r.end_time),margin+300,y);
          doc.text(fmtHours(hrs),margin+380,y);
          doc.setDrawColor(232,236,240);
          doc.line(margin,y+5,pageW-margin,y+5);
          y+=rowH;
        });
      }

      ensure(42);
      doc.setFont("helvetica","bold");
      doc.setFontSize(10);
      doc.setTextColor(20,30,40);
      doc.text("Total Hours: "+fmtHours(total),margin+5,y+5);
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

  async function runReport(e){
    e.preventDefault();
    if(!live||!user)return;
    const selected=selectedReportDrivers();
    if(!selected.length){reportShow("Select at least one driver.","error");return}
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
      buildDriverPdf(selected,range,result.data||[]);
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
      .on("postgres_changes",{event:"*",schema:"public",table:"driver_schedules"},()=>{if(!dirty)loadWeek()})
      .on("postgres_changes",{event:"*",schema:"public",table:"transfer_drivers"},()=>{if(!dirty)loadWeek()})
      .subscribe();
  }
  async function session(s){
    if(!s?.user){
      user=null;
      E.login.classList.remove("hidden");
      return;
    }
    user=s.user;
    E.login.classList.add("hidden");
    E.signout.classList.remove("hidden");
    const r=await sb.from("profiles").select("display_name").eq("id",user.id).maybeSingle();
    profile=r.data||{display_name:user.email?.split("@")[0]||"User"};
    E.me.textContent=userName();
    E.email.textContent=user.email||"";
    await loadWeek();
    await subscribe();
  }

  E.prev.onclick=()=>{if(dirty&&!confirm("Discard unsaved schedule changes?"))return;E.week.value=addDays(E.week.value,-7);lastWeekValue=E.week.value;loadWeek()};
  E.next.onclick=()=>{if(dirty&&!confirm("Discard unsaved schedule changes?"))return;E.week.value=addDays(E.week.value,7);lastWeekValue=E.week.value;loadWeek()};
  E.thisWeek.onclick=()=>{if(dirty&&!confirm("Discard unsaved schedule changes?"))return;E.week.value=mondayOf(new Date());lastWeekValue=E.week.value;loadWeek()};
  E.week.onchange=()=>{const next=mondayOf(E.week.value);if(dirty&&!confirm("Discard unsaved schedule changes?")){E.week.value=lastWeekValue;return}E.week.value=next;lastWeekValue=next;loadWeek()};
  E.save.onclick=save;
  E.reports.onclick=openReports;
  E.reportClose.onclick=closeReports;
  E.reportCancel.onclick=closeReports;
  E.reportPeriod.onchange=toggleReportPeriod;
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

  E.week.value=mondayOf(new Date());
  lastWeekValue=E.week.value;
  if(!live){
    E.body.innerHTML='<tr><td colspan="9" class="schedule-empty">Supabase is not configured.</td></tr>';
    show("Supabase is not configured.","error");
    return;
  }
  sb.auth.getSession().then(r=>session(r.data.session));
  sb.auth.onAuthStateChange((_event,s)=>session(s));
})();