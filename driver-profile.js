(async()=>{await window.TransfersAccess.ready;if(!window.TransfersAccess.can("driver_profiles"))return;
(()=>{
  "use strict";
  const $=id=>document.getElementById(id),C=window.TRANSFERS_CONFIG||{};
  const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  let sb=null,user=null,original=new URLSearchParams(location.search).get("driver"),baseline="",working=false,loadedUser=null,version=0;
  const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  const monthNow=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).slice(0,7);
  function message(text,type=""){$("profileMessage").textContent=text;$("profileMessage").className=type;}
  function week(){return days.map((_,i)=>({start:$("start"+i).value||null,end:$("end"+i).value||null}));}
  function snapshot(){return JSON.stringify({name:$("driverSlotName").value,full:$("driverFullName").value,phone:$("driverPhone").value,email:$("driverEmail").value,notes:$("driverNotes").value,repeat:$("autoRepeat").checked,week:week()});}
  function dirty(){return !!baseline&&baseline!==snapshot();}
  function mark(){$("unsavedNotice").textContent=dirty()?"Unsaved changes":"";}
  function setWeek(w){days.forEach((_,i)=>{$("start"+i).value=w?.[i]?.start||"";$("end"+i).value=w?.[i]?.end||"";});mark();}
  function phone(raw){
    const s=raw.trim(),digits=s.replace(/\D/g,"");
    if(!s)return null;
    if(!/^[+\d\s().-]+$/.test(s))throw Error("Enter a valid phone number.");
    if(digits.length===10&&!s.startsWith("+"))return "+1"+digits;
    if(digits.length===11&&digits.startsWith("1"))return "+"+digits;
    if(s.startsWith("+")&&/^[1-9][0-9]{7,14}$/.test(digits))return "+"+digits;
    throw Error("Use a 10-digit US phone number or an international number starting with +.");
  }
  function lock(value){working=value;$("saveDriver").disabled=value;$("applySchedule").disabled=value;$("loadTemplateWeek").disabled=value||!original;document.querySelectorAll("#driverProfileForm input,#driverProfileForm textarea,#weeklyTemplate button").forEach(e=>e.disabled=value);window.TransfersAccess.apply();}
  function scheduleLink(){const m=$("applyMonth").value||monthNow();$("viewSchedule").href="drivers.html?week="+encodeURIComponent(m+"-01");}
  function savedState(row){
    $("profileTitle").textContent="Driver Information · "+row.name;
    $("driverSlotName").value=row.name;$("driverSlotName").readOnly=true;
    $("slotNameHelp").textContent="The slot name stays fixed to preserve schedule and job history. Edit the driver's full name below.";
    $("driverFullName").value=row.full_name||"";$("driverPhone").value=row.phone_number||"";
    $("driverEmail").value=row.email||"";$("driverNotes").value=row.notes||"";$("autoRepeat").checked=!!row.auto_repeat;
    setWeek(row.weekly_schedule);
    $("repeatStatus").textContent=row.auto_repeat&&row.auto_generated_month?"Schedule prepared through "+new Date(row.auto_generated_month+"T12:00:00").toLocaleDateString(undefined,{month:"long",year:"numeric"})+".":"Automatic monthly repeat is off.";
    $("applySchedulePanel").classList.remove("hidden");$("loadTemplateWeek").disabled=false;
    baseline=snapshot();mark();
  }
  async function load(){
    const token=++version;lock(true);message(original?"Loading driver…":"");
    try{
      if(original){
        const {data,error}=await sb.from("transfer_drivers").select("name,full_name,phone_number,email,notes,weekly_schedule,auto_repeat,auto_generated_month").eq("name",original).single();
        if(token!==version)return;if(error)throw error;savedState(data);
      }else{baseline=snapshot();$("loadTemplateWeek").disabled=true;}
      $("driverProfileForm").classList.remove("hidden");message("");
    }catch(e){message("Could not load driver: "+e.message,"error");}
    finally{if(token===version)lock(false);}
  }
  async function save(){
    if(!user||working)return false;
    if(!$("driverProfileForm").reportValidity())return false;
    let number;
    try{
      number=phone($("driverPhone").value);
      week().forEach((d,i)=>{if(Boolean(d.start)!==Boolean(d.end))throw Error("Enter both times for "+days[i]+", or clear both for OFF.");if(d.start&&d.start===d.end)throw Error("Start and end must differ on "+days[i]+".");});
    }catch(e){message(e.message,"error");return false;}
    const token=version;lock(true);message("Saving driver…");
    try{
      const {data,error}=await sb.rpc("save_driver_profile",{p_original:original,p_name:$("driverSlotName").value.trim(),p_full_name:$("driverFullName").value.trim(),p_phone:number,p_email:$("driverEmail").value.trim(),p_notes:$("driverNotes").value.trim(),p_week:week(),p_repeat:$("autoRepeat").checked});
      if(token!==version)return false;if(error)throw error;
      original=data.name;history.replaceState(null,"","driver-profile.html?driver="+encodeURIComponent(original));
      $("driverSlotName").readOnly=true;$("driverPhone").value=number||"";$("profileTitle").textContent="Driver Information · "+original;
      $("slotNameHelp").textContent="The slot name stays fixed to preserve schedule and job history. Edit the driver's full name below.";
      $("applySchedulePanel").classList.remove("hidden");baseline=snapshot();mark();
      $("repeatStatus").textContent=data.generated_month?"Schedule prepared through "+new Date(data.generated_month+"T12:00:00").toLocaleDateString(undefined,{month:"long",year:"numeric"})+".":"Automatic monthly repeat is off.";
      message("Driver saved."+(data.generated_days?" "+data.generated_days+" dates prepared for next month.":""),"ok");return true;
    }catch(e){message("Could not save driver: "+e.message,"error");return false;}
    finally{if(token===version)lock(false);}
  }
  $("weeklyTemplate").innerHTML=[1,2,3,4,5,6,0].map(i=>'<tr><th scope="row">'+days[i]+'</th><td><input id="start'+i+'" type="time" step="900" aria-label="'+days[i]+' start"></td><td><input id="end'+i+'" type="time" step="900" aria-label="'+days[i]+' end"></td><td><button type="button" data-off="'+i+'">Off</button></td></tr>').join("");
  $("weeklyTemplate").addEventListener("click",e=>{const b=e.target.closest("[data-off]");if(!b)return;const i=b.dataset.off;$("start"+i).value="";$("end"+i).value="";mark();});
  $("driverProfileForm").addEventListener("input",mark);
  $("driverProfileForm").addEventListener("change",mark);
  $("driverProfileForm").addEventListener("submit",e=>{e.preventDefault();save();});
  $("applyMonth").value=monthNow();$("templateWeek").value=iso(new Date());scheduleLink();
  $("applyMonth").addEventListener("change",scheduleLink);
  $("loadTemplateWeek").addEventListener("click",async()=>{
    if(!original||working||!$("templateWeek").value)return;
    const d=new Date($("templateWeek").value+"T12:00:00");d.setDate(d.getDate()-(d.getDay()+6)%7);const start=iso(d);d.setDate(d.getDate()+6);
    const token=version;lock(true);message("Loading weekly template…");
    try{
      const {data,error}=await sb.from("driver_schedules").select("schedule_date,start_time,end_time").eq("driver_name",original).gte("schedule_date",start).lte("schedule_date",iso(d));
      if(token!==version)return;if(error)throw error;
      const w=days.map(()=>({start:null,end:null}));
      for(const r of data||[])w[new Date(r.schedule_date+"T12:00:00").getDay()]={start:r.start_time?.slice(0,5),end:r.end_time?.slice(0,5)};
      setWeek(w);message("Week loaded into the template. Save Driver to keep it.");
    }catch(e){message(e.message,"error");}finally{if(token===version)lock(false);}
  });
  $("applySchedule").addEventListener("click",async()=>{if(!window.TransfersAccess.can("repeat_schedules"))return;
    if(!original||working)return;
    if(!$("applyMonth").value){message("Choose a month first.","error");return;}
    if(dirty()&&!(await save()))return;
    const token=version;lock(true);message("Applying saved schedule…");
    try{
      const {data,error}=await sb.rpc("replace_driver_schedule_month",{p_driver:original,p_month:$("applyMonth").value+"-01"});
      if(token!==version)return;if(error)throw error;
      message(data+" dates updated to the weekly schedule, including OFF days.","ok");scheduleLink();
    }catch(e){message("Could not apply schedule: "+e.message,"error");}finally{if(token===version)lock(false);}
  });
  window.addEventListener("beforeunload",e=>{if(dirty()||working){e.preventDefault();e.returnValue="";}});
  document.querySelectorAll('a[href]').forEach(a=>a.addEventListener("click",e=>{if(working||(dirty()&&!confirm("Leave without saving driver changes?")))e.preventDefault();}));
  async function session(s){
    const id=s?.user?.id||null;$("login").classList.toggle("hidden",!!id);$("signout").classList.toggle("hidden",!id);
    $("me").textContent=s?.user?.email?.split("@")[0]||"";$("email").textContent=s?.user?.email||"";
    user=s?.user||null;if(id===loadedUser)return;loadedUser=id;
    if(!id){version++;baseline="";$("driverProfileForm").classList.add("hidden");return;}
    await load();
  }
  $("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();if(!sb)return;
    const {error}=await sb.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});$("loginMsg").textContent=error?.message||"";$("loginPassword").value="";
  });
  $("signout").addEventListener("click",async()=>{
    if(working||(dirty()&&!confirm("Sign out without saving changes?")))return;
    const {error}=await sb.auth.signOut();if(error)message(error.message,"error");
  });
  if(!C.supabaseUrl||!C.supabaseAnonKey||!window.supabase){message("Live connection is not configured.","error");return;}
  sb=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);
  sb.auth.onAuthStateChange((_event,s)=>setTimeout(()=>session(s),0));
  sb.auth.getSession().then(({data,error})=>error?message(error.message,"error"):session(data.session));
})();

})();
