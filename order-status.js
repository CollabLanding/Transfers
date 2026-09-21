(()=>{
  const form=document.getElementById("form");
  const status=document.getElementById("status");
  const editId=document.getElementById("editId");
  const msg=document.getElementById("msg");
  const C=window.TRANSFERS_CONFIG||{};
  if(!form||!status||!C.supabaseUrl||!C.supabaseAnonKey||!window.supabase)return;

  const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);
  const originalSubmit=form.onsubmit;

  form.onsubmit=async function(ev){
    const snapshot={
      id:editId.value,
      status:status.value||"Planned",
      date:document.getElementById("date").value,
      time:document.getElementById("time").value,
      driver:document.getElementById("driver").value,
      job:document.getElementById("job").value.trim()
    };

    if(originalSubmit) await originalSubmit.call(this,ev);

    if(msg && /could not save transfer/i.test(msg.textContent||"")) return;

    let id=snapshot.id;
    if(!id){
      const q=await sb.from("transfers")
        .select("id")
        .eq("scheduled_date",snapshot.date)
        .eq("driver",snapshot.driver)
        .eq("job_number",snapshot.job)
        .order("created_at",{ascending:false})
        .limit(1)
        .maybeSingle();
      if(q.error||!q.data?.id)return;
      id=q.data.id;
    }

    const r=await sb.from("transfers")
      .update({order_status:snapshot.status,updated_at:new Date().toISOString()})
      .eq("id",id);

    if(r.error && msg){
      msg.textContent="Transfer saved, but Order Status could not be updated: "+r.error.message;
      msg.style.color="#a43c3c";
    }
  };

  document.addEventListener("click",e=>{
    const card=e.target.closest?.(".card");
    if(!card?.dataset?.id)return;
    const id=card.dataset.id;
    setTimeout(async()=>{
      const r=await sb.from("transfers").select("order_status").eq("id",id).maybeSingle();
      if(!r.error && r.data && editId.value===id) status.value=r.data.order_status||"Planned";
    },0);
  });
})();