(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const openBtn=document.getElementById("duplicateDay");
  const modal=document.getElementById("duplicateDayModal");
  const form=document.getElementById("duplicateDayForm");
  const closeBtn=document.getElementById("duplicateDayClose");
  const cancelBtn=document.getElementById("duplicateDayCancel");
  const confirmBtn=document.getElementById("duplicateDayConfirm");
  const sourceLabel=document.getElementById("duplicateDaySourceLabel");
  const target=document.getElementById("duplicateDayTarget");
  const note=document.getElementById("duplicateDayMsg");
  const boardDate=document.getElementById("boardDate");

  if(!openBtn||!modal||!form||!target||!boardDate)return;

  const live=!!(C.supabaseUrl&&C.supabaseAnonKey&&window.supabase);
  const sb=live?window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey):null;
  let sourceDate="";

  function addDays(iso,n){
    const d=new Date(String(iso)+"T12:00:00");
    d.setDate(d.getDate()+n);
    return d.toISOString().slice(0,10);
  }

  function friendlyDate(iso){
    const d=new Date(String(iso)+"T12:00:00");
    return Number.isFinite(d.getTime())
      ? d.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})
      : String(iso||"");
  }

  function timeToMinutes(value){
    const parts=String(value||"00:00").slice(0,5).split(":").map(Number);
    return (parts[0]||0)*60+(parts[1]||0);
  }

  function show(text,type=""){
    note.textContent=text||"";
    note.style.color=type==="error"?"#a43c3c":type==="ok"?"#2f6f49":"";
  }

  function open(){
    sourceDate=boardDate.value;
    if(!sourceDate)return;
    sourceLabel.textContent=friendlyDate(sourceDate);
    target.value=addDays(sourceDate,1);
    show("");
    modal.classList.remove("hidden");
    setTimeout(()=>target.focus(),0);
  }

  function close(){
    if(confirmBtn.disabled)return;
    modal.classList.add("hidden");
    show("");
  }

  openBtn.addEventListener("click",open);
  closeBtn?.addEventListener("click",close);
  cancelBtn?.addEventListener("click",close);
  modal.addEventListener("click",e=>{if(e.target===modal)close()});

  form.addEventListener("submit",async e=>{
    e.preventDefault();
    if(!sourceDate)return;

    const destination=target.value;
    if(!destination){
      show("Choose the day you want to duplicate to.","error");
      return;
    }
    if(destination===sourceDate){
      show("Choose a different destination day.","error");
      return;
    }
    if(!live||!sb){
      show("Duplicate Day is available in Live mode.","error");
      return;
    }

    confirmBtn.disabled=true;
    target.disabled=true;
    show("Reading "+friendlyDate(sourceDate)+"…");

    try{
      const sessionResult=await sb.auth.getSession();
      const currentUser=sessionResult.data?.session?.user;
      if(!currentUser){
        show("Sign in again before duplicating a day.","error");
        return;
      }

      const sourceResult=await sb.from("transfers")
        .select("*")
        .eq("scheduled_date",sourceDate)
        .order("scheduled_time",{ascending:true});

      if(sourceResult.error){
        show("Could not read the source day: "+sourceResult.error.message,"error");
        return;
      }

      const rows=sourceResult.data||[];
      if(!rows.length){
        show("There are no transfers on "+friendlyDate(sourceDate)+" to duplicate.","error");
        return;
      }

      let creatorName=currentUser.email?currentUser.email.split("@")[0]:"User";
      const profileResult=await sb.from("profiles")
        .select("display_name")
        .eq("id",currentUser.id)
        .maybeSingle();
      if(!profileResult.error&&profileResult.data?.display_name){
        creatorName=profileResult.data.display_name;
      }

      const copies=rows.map(row=>{
        const copy={
          scheduled_date:destination,
          scheduled_time:row.scheduled_time,
          duration_minutes:Number(row.duration_minutes||60),
          driver:row.driver,
          origin:row.origin,
          destination:row.destination,
          pallet_count:Number(row.pallet_count||0),
          job_number:row.job_number,
          order_status:row.order_status||"Planned",
          created_by:currentUser.id,
          created_by_name:creatorName
        };
        if(Object.prototype.hasOwnProperty.call(row,"pickup_by_date"))copy.pickup_by_date=row.pickup_by_date?addDays(row.pickup_by_date,Math.round((Date.parse(destination)-Date.parse(sourceDate))/86400000)):null;
      if(Object.prototype.hasOwnProperty.call(row,"pickup_by_time"))copy.pickup_by_time=row.pickup_by_time;
      if(Object.prototype.hasOwnProperty.call(row,"deliver_by_date"))copy.deliver_by_date=row.deliver_by_date?addDays(row.deliver_by_date,Math.round((Date.parse(destination)-Date.parse(sourceDate))/86400000)):null;
      if(Object.prototype.hasOwnProperty.call(row,"deliver_by_time"))copy.deliver_by_time=row.deliver_by_time;
      if(Object.prototype.hasOwnProperty.call(row,"urgent"))copy.urgent=Boolean(row.urgent);
        return copy
      });

      show("Duplicating "+copies.length+" transfer"+(copies.length===1?"":"s")+"…");

      const insertResult=await sb.from("transfers").insert(copies).select("id,move_number");
      if(insertResult.error){
        show("Could not duplicate day: "+insertResult.error.message,"error");
        return;
      }

      boardDate.value=destination;
      boardDate.dispatchEvent(new Event("change",{bubbles:true}));

      show(
        copies.length+" transfer"+(copies.length===1?"":"s")+" duplicated to "+friendlyDate(destination)+".",
        "ok"
      );

      setTimeout(()=>{
        modal.classList.add("hidden");
        show("");
      },900);
    }catch(err){
      show("Could not duplicate day: "+(err?.message||String(err)),"error");
    }finally{
      confirmBtn.disabled=false;
      target.disabled=false;
    }
  });
})();
