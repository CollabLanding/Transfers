(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const button=document.getElementById("duplicate");
  const deleteButton=document.getElementById("delete");
  const editId=document.getElementById("editId");
  const msg=document.getElementById("msg");
  const boardDate=document.getElementById("boardDate");

  if(!button||!deleteButton||!editId)return;

  function syncVisibility(){
    button.classList.toggle("hidden",deleteButton.classList.contains("hidden")||!editId.value);
  }

  new MutationObserver(syncVisibility).observe(deleteButton,{attributes:true,attributeFilter:["class"]});
  new MutationObserver(syncVisibility).observe(editId,{attributes:true,attributeFilter:["value"]});
  syncVisibility();

  if(!C.supabaseUrl||!C.supabaseAnonKey||!window.supabase)return;
  const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);

  function timeToMinutes(value){
    const parts=String(value||"00:00").slice(0,5).split(":").map(Number);
    return (parts[0]||0)*60+(parts[1]||0);
  }

  function minutesToTime(total){
    return String(Math.floor(total/60)).padStart(2,"0")+":"+String(total%60).padStart(2,"0");
  }

  function friendlyTime(value){
    const parts=value.split(":").map(Number),h=parts[0],m=parts[1];
    return (h%12||12)+":"+String(m).padStart(2,"0")+" "+(h>=12?"PM":"AM");
  }

  function show(text,type){
    if(!msg)return;
    msg.textContent=text;
    msg.style.color=type==="error"?"#a43c3c":"#2f6f49";
  }

  button.addEventListener("click",async()=>{
    const sourceId=editId.value;
    if(!sourceId)return;

    button.disabled=true;
    show("Duplicating transfer…");

    try{
      const sessionResult=await sb.auth.getSession();
      const currentUser=sessionResult.data&&sessionResult.data.session&&sessionResult.data.session.user;
      if(!currentUser){
        show("Sign in again before duplicating a transfer.","error");
        return;
      }

      const sourceResult=await sb.from("transfers").select("*").eq("id",sourceId).single();
      if(sourceResult.error||!sourceResult.data){
        show("Could not read the transfer to duplicate: "+(sourceResult.error?.message||"Transfer not found"),"error");
        return;
      }

      const source=sourceResult.data;
      const duration=Number(source.duration_minutes||60);
      const nextStart=timeToMinutes(source.scheduled_time)+duration;

      if(nextStart>=1440){
        show("This transfer cannot be duplicated directly underneath because the next start time would be after midnight.","error");
        return;
      }

      let creatorName=currentUser.email?currentUser.email.split("@")[0]:"User";
      const profileResult=await sb.from("profiles").select("display_name").eq("id",currentUser.id).maybeSingle();
      if(!profileResult.error&&profileResult.data?.display_name)creatorName=profileResult.data.display_name;

      const newTime=minutesToTime(nextStart);
      const copy={
        scheduled_date:source.scheduled_date,
        scheduled_time:newTime,
        duration_minutes:duration,
        driver:source.driver,
        origin:source.origin,
        destination:source.destination,
        pallet_count:source.pallet_count,
        job_number:source.job_number,
        order_status:source.order_status||"Loading",
        created_by:currentUser.id,
        created_by_name:creatorName
      };

      const insertResult=await sb.from("transfers").insert(copy).select("*").single();
      if(insertResult.error){
        show("Could not duplicate transfer: "+insertResult.error.message,"error");
        return;
      }

      if(boardDate)boardDate.value=source.scheduled_date;
      show("Transfer duplicated for "+friendlyTime(newTime)+".");
    }catch(err){
      show("Could not duplicate transfer: "+(err?.message||String(err)),"error");
    }finally{
      button.disabled=false;
    }
  });
})();