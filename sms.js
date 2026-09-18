(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const openBtn=document.getElementById("textDriver");
  const modal=document.getElementById("smsModal");
  const form=document.getElementById("smsForm");
  const closeBtn=document.getElementById("smsClose");
  const cancelBtn=document.getElementById("smsCancel");
  const title=document.getElementById("smsTitle");
  const summary=document.getElementById("smsTransferSummary");
  const phone=document.getElementById("smsPhone");
  const message=document.getElementById("smsMessage");
  const chars=document.getElementById("smsChars");
  const send=document.getElementById("smsSend");
  const msg=document.getElementById("smsMsg");
  const history=document.getElementById("smsHistory");
  const editId=document.getElementById("editId");
  if(!openBtn||!modal||!form||!phone||!message||!send||!editId)return;

  const live=!!(C.supabaseUrl&&C.supabaseAnonKey&&window.supabase);
  const sb=live?window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey):null;
  let transfer=null,currentTemplate="assignment";

  function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
  function setMsg(text,type=""){msg.textContent=text||"";msg.className=type?"sms-msg "+type:"sms-msg"}
  function fmtTime(t){
    const [h0,m0]=String(t||"00:00").slice(0,5).split(":").map(Number);
    const h=h0%12||12;
    return h+":"+String(m0).padStart(2,"0")+" "+(h0>=12?"PM":"AM");
  }
  function fmtDate(d){
    const x=new Date(String(d)+"T12:00:00");
    return Number.isFinite(x.getTime())?x.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}):String(d||"");
  }
  function displayPhone(v){
    const digits=String(v||"").replace(/\D/g,"");
    const d=digits.length===11&&digits.startsWith("1")?digits.slice(1):digits;
    return d.length===10?"("+d.slice(0,3)+") "+d.slice(3,6)+"-"+d.slice(6):String(v||"");
  }
  function maskPhone(v){
    const digits=String(v||"").replace(/\D/g,"");
    return digits.length>=4?"•••-•••-"+digits.slice(-4):String(v||"");
  }
  function transferLabel(){
    if(!transfer)return "";
    return "Move #"+(transfer.move_number??"—")+" · "+transfer.driver+" · "+fmtDate(transfer.scheduled_date)+" "+fmtTime(transfer.scheduled_time);
  }
  function templateText(kind){
    if(!transfer)return "";
    const move="Move #"+(transfer.move_number??"—");
    const route=transfer.origin+" → "+transfer.destination;
    const schedule=fmtDate(transfer.scheduled_date)+" at "+fmtTime(transfer.scheduled_time);
    const job=transfer.job_number?" Job/Notes: "+transfer.job_number+".":"";
    if(kind==="update"){
      return "Transfers Dispatch: "+move+" update. "+route+". Scheduled "+schedule+". Status: "+(transfer.order_status||"Loading")+"."+job;
    }
    if(kind==="delay"){
      return "Transfers Dispatch: "+move+" delay/update. "+route+". Current scheduled time is "+schedule+"."+job+" Please contact dispatch if you need updated timing.";
    }
    return "Transfers Dispatch: "+move+" assignment. "+route+", "+schedule+". "+transfer.pallet_count+" pallets."+job+" Please reply to dispatch with any questions.";
  }
  function updateChars(){
    chars.textContent=message.value.length+" / 1600";
    chars.classList.toggle("near-limit",message.value.length>1450);
  }
  function applyTemplate(kind){
    currentTemplate=kind;
    document.querySelectorAll("[data-sms-template]").forEach(b=>b.classList.toggle("active",b.dataset.smsTemplate===kind));
    message.value=templateText(kind);
    updateChars();
  }
  function renderHistory(rows){
    if(!rows||!rows.length){
      history.innerHTML='<div class="sms-history-empty">No texts sent yet.</div>';
      return;
    }
    history.innerHTML=rows.map(row=>{
      const when=new Date(row.created_at);
      const stamp=Number.isFinite(when.getTime())?when.toLocaleString():"";
      return '<div class="sms-history-item"><div><strong>'+esc(row.message_type||"SMS")+'</strong> · '+esc(maskPhone(row.to_number))+'</div><small>'+esc(stamp)+' · '+esc(row.actor_name||"User")+' · '+esc(row.provider_status||"queued")+'</small></div>';
    }).join("");
  }
  async function loadHistory(){
    if(!sb||!transfer){renderHistory([]);return}
    const {data,error}=await sb.from("transfer_sms_log")
      .select("id,message_type,to_number,provider_status,actor_name,created_at")
      .eq("transfer_id",transfer.id)
      .order("created_at",{ascending:false})
      .limit(5);
    if(error){
      history.innerHTML='<div class="sms-history-empty">SMS history needs migration-v9.sql.</div>';
      return;
    }
    renderHistory(data||[]);
  }
  async function open(){
    if(!live){
      setMsg("SMS is available in Live mode.","error");
      modal.classList.remove("hidden");
      return;
    }
    const id=editId.value;
    if(!id)return;
    setMsg("Loading…");
    phone.value="";
    message.value="";
    updateChars();
    modal.classList.remove("hidden");

    const {data,error}=await sb.from("transfers")
      .select("id,move_number,scheduled_date,scheduled_time,duration_minutes,driver,origin,destination,pallet_count,job_number,order_status")
      .eq("id",id)
      .single();
    if(error){
      setMsg("Could not load transfer: "+error.message,"error");
      return;
    }
    transfer=data;
    title.textContent="Text "+(transfer.driver||"Driver");
    summary.textContent=transferLabel();

    const driverResult=await sb.from("transfer_drivers").select("phone_number").eq("name",transfer.driver).maybeSingle();
    if(driverResult.error){
      setMsg("Driver phone storage needs migration-v9.sql.","error");
    }else{
      phone.value=displayPhone(driverResult.data?.phone_number||"");
      setMsg("");
    }
    applyTemplate("assignment");
    await loadHistory();
    setTimeout(()=>phone.value?message.focus():phone.focus(),0);
  }
  function close(){
    modal.classList.add("hidden");
    transfer=null;
    setMsg("");
  }

  document.querySelectorAll("[data-sms-template]").forEach(btn=>{
    btn.addEventListener("click",()=>applyTemplate(btn.dataset.smsTemplate));
  });
  openBtn.addEventListener("click",open);
  closeBtn?.addEventListener("click",close);
  cancelBtn?.addEventListener("click",close);
  modal.addEventListener("click",e=>{if(e.target===modal)close()});
  message.addEventListener("input",updateChars);

  form.addEventListener("submit",async e=>{
    e.preventDefault();
    if(!sb||!transfer)return;
    const rawPhone=phone.value.trim();
    const body=message.value.trim();
    if(!rawPhone){setMsg("Enter the driver's cell phone number.","error");phone.focus();return}
    if(!body){setMsg("Enter a message.","error");message.focus();return}
    if(body.length>1600){setMsg("SMS message must be 1,600 characters or less.","error");return}

    send.disabled=true;
    phone.disabled=true;
    message.disabled=true;
    setMsg("Sending…");

    const {data,error}=await sb.functions.invoke("send-sms",{
      body:{
        transfer_id:transfer.id,
        phone:rawPhone,
        message:body,
        message_type:currentTemplate
      }
    });

    send.disabled=false;
    phone.disabled=false;
    message.disabled=false;

    if(error){
      setMsg("Could not send SMS: "+error.message,"error");
      return;
    }
    if(!data?.ok){
      setMsg(data?.error||"Could not send SMS.","error");
      return;
    }

    phone.value=displayPhone(data.to||rawPhone);
    setMsg("Text queued to "+displayPhone(data.to||rawPhone)+".","ok");
    await loadHistory();
  });

  updateChars();
})();