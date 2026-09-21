(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const live=!!(C.supabaseUrl&&C.supabaseAnonKey&&window.supabase);
  const sb=live?window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey):null;
  const $=id=>document.getElementById(id);
  const E={
    week:$("weekStart"),prev:$("prevWeek"),next:$("nextWeek"),thisWeek:$("thisWeek"),
    title:$("weekTitle"),body:$("scheduleBody"),save:$("saveSchedule"),msg:$("scheduleMsg"),
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

    if(!confirm("Copy "+driver+"\'s "+period+" schedule "+label+"? Existing schedule in the destination will be replaced."))return;

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