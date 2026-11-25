(async()=>{
  const {supabaseUrl,supabaseAnonKey}=window.TRANSFERS_CONFIG;
  const sb=window.supabase.createClient(supabaseUrl,supabaseAnonKey);
  const get=id=>document.getElementById(id);
  const jobs=get("driverJobs"), feedback=get("driverFeedback"), dateLabel=get("driverDate");
  const dialog=get("dispatchMessage"), message=get("driverMessageText");
  const messageFeedback=get("driverMessageFeedback"), messageForm=dialog.querySelector("form");
  const send=messageForm.querySelector('[type="submit"]'), cancel=get("driverMessageCancel");
  const stages=["Planned","Waiting","Loading","Loaded","In Transit","On Site","Delivered"];
  const driverStatuses=[
    ["At Pickup","Waiting"],["Loaded","Loaded"],["In Transit","In Transit"],
    ["At Delivery","On Site"],["Delivered","Delivered"]
  ];
  let selection=null, busy=false, request=0, previous=null;

  function element(tag,text,className){
    const result=document.createElement(tag);
    result.textContent=text;
    if(className)result.className=className;
    return result;
  }

  function timeLabel(value){
    const [hours,minutes]=value.split(":").map(Number);
    return (hours%12||12)+":"+String(minutes).padStart(2,"0")+(hours<12?" AM":" PM");
  }

  function button(label,handler,className){
    const node=element("button",label,className);
    node.type="button";
    node.onclick=handler;
    return node;
  }

  function render(data){
    const serialized=JSON.stringify(data);
    if(serialized===previous)return;
    previous=serialized;
    const date=new Date(data.date+"T12:00:00Z").toLocaleDateString("en-US",{
      weekday:"long",month:"long",day:"numeric",timeZone:"UTC"
    });
    dateLabel.textContent=[data.driver,date].filter(Boolean).join(" · ");
    jobs.replaceChildren();
    for(const job of data.jobs){
      const card=element("article","");
      const heading=element("div","","job-heading");
      heading.append(element("h2","Move #"+(job.move_number??"—")+" · "+timeLabel(job.time)),
        element("span",job.status,"job-status"));
      const route=[
        [job.origin,job.origin_dock],[job.stop1],[job.stop2],[job.destination,job.destination_dock]
      ].filter(([location])=>location).map(([location,dock])=>dock?location+" dock "+dock:location);
      card.append(heading,element("p",route.join(" → "),"route"),
        element("p",job.pallets+" pallets","detail"));
      if(job.urgent)card.append(element("p","Urgent","urgent"));
      if(job.notes)card.append(element("p",job.notes,"notes"));

      const actions=element("div","","actions");
      const current=stages.indexOf(job.status);
      for(const [label,status] of driverStatuses){
        if(current>=0&&stages.indexOf(status)>current){
          actions.append(button(label,()=>updateStatus(job,status),"primary"));
        }
      }
      actions.append(button("Message Dispatch",()=>{
        selection=job;
        get("driverMessageLabel").textContent="Message for Move #"+(job.move_number??"—")+" (posted to Team Chat)";
        message.value="";
        messageFeedback.textContent="";
        dialog.showModal();
      }));
      card.append(actions);
      jobs.append(card);
    }
    if(!data.driver)jobs.append(element("p","Ask dispatch to link your login to a driver column."));
    else if(!data.jobs.length)jobs.append(element("p","You have no dispatches scheduled today."));
  }

  function setBusy(value){
    busy=value;
    jobs.querySelectorAll("button").forEach(node=>{node.disabled=value});
    send.disabled=value;
    cancel.disabled=value;
  }

  async function refresh(clearFeedback=false){
    const generation=++request;
    const result=await sb.rpc("get_my_driver_dispatches");
    if(generation!==request)return;
    if(result.error){
      previous=null;
      jobs.replaceChildren();
      dateLabel.textContent="";
      feedback.textContent=result.error.message;
      if(result.error.code==="42501")location.replace("index.html");
      return;
    }
    render(result.data);
    if(clearFeedback||feedback.textContent==="Loading dispatches…")feedback.textContent="";
  }

  async function updateStatus(job,status){
    if(busy)return;
    setBusy(true);
    const result=await sb.rpc("update_my_driver_dispatch",{
      p_id:job.id,p_status:status,p_expected_status:job.status,p_message:null
    });
    feedback.textContent=result.error?.message||"Move #"+(job.move_number??"—")+" updated to "+status+".";
    await refresh();
    setBusy(false);
  }

  messageForm.onsubmit=async event=>{
    event.preventDefault();
    if(busy||!selection||!message.value.trim())return;
    setBusy(true);
    const result=await sb.rpc("update_my_driver_dispatch",{
      p_id:selection.id,p_status:null,p_expected_status:null,p_message:message.value.trim()
    });
    setBusy(false);
    if(result.error){messageFeedback.textContent=result.error.message;return}
    dialog.close();
    feedback.textContent="Message sent to dispatch in Team Chat.";
  };
  cancel.onclick=()=>dialog.close();
  dialog.addEventListener("cancel",event=>{if(busy)event.preventDefault()});
  get("driverSignout").onclick=async()=>{
    const {error}=await sb.auth.signOut();
    if(error)feedback.textContent=error.message;
    else location.replace("index.html");
  };

  const {data:{session}}=await sb.auth.getSession();
  if(!session){location.replace("index.html");return}
  sb.auth.onAuthStateChange((event)=>{
    if(event==="SIGNED_OUT"){jobs.replaceChildren();location.replace("index.html")}
  });
  await refresh(true);
  window.addEventListener("focus",()=>{if(!busy)refresh()});
  setInterval(()=>{if(!document.hidden&&!busy)refresh()},15000);
})();
