(()=>{
  "use strict";
  const D=window.SummaryData,C=window.TRANSFERS_CONFIG||{},el=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const hours=m=>(m/60).toLocaleString(undefined,{maximumFractionDigits:1});
  const count=n=>n.toLocaleString();
  const date=d=>new Date(d+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
  let sb=null,userId=null,generation=0,rows=[],visible=[],page=0,scope=null;
  const pageSize=50;
  function message(text,error=false){el("reportMessage").textContent=text;el("reportMessage").classList.toggle("error",error);}
  function preset(){
    const now=new Date(),end=new Date(now);end.setDate(end.getDate()-1);
    const p=el("period").value,begin=new Date(end);
    if(p==="custom")return;
    if(p==="all"){el("dateFrom").value="";el("dateTo").value=D.dateKey(now);return;}
    if(p==="month"){begin.setFullYear(now.getFullYear(),now.getMonth(),1);end.setTime(now.getTime());}
    else begin.setDate(begin.getDate()-(Number(p)-1));
    el("dateFrom").value=D.dateKey(begin);el("dateTo").value=D.dateKey(end);
  }
  function busy(value){
    el("runReport").disabled=value||!userId;el("runReport").textContent=value?"Running…":"Run report";
    el("exportCsv").disabled=value||!visible.length;el("printReport").disabled=value||!scope;
  }
  function clear(){
    generation++;rows=[];visible=[];scope=null;el("reportResults").classList.add("hidden");
    el("driverSlot").innerHTML='<option value="">All driver slots</option>';busy(false);
  }
  const jobStatuses=["Planned","Waiting","Loading","Loaded","In Transit","On Site","Delivered"];
  const slotStatuses=["Driving","Yard Moves","Loading","Standby","Job Pushed","Custom"];
  function recordMarkup(list){
    if(!list.length)return '<tr><td colspan="9" class="summary-empty">No records match these filters.</td></tr>';
    return list.map(r=>{
      const options=r.type==="Job"?jobStatuses:slotStatuses;
      const key=esc(r.type+":"+r.id);
      const statusOptions=(!options.includes(r.rawStatus)?'<option value="">Unknown (not recorded)</option>':"")+options.map(s=>'<option value="'+esc(s)+'"'+(s===r.rawStatus?' selected':"")+'>'+esc(s)+'</option>').join("");
      const dateText=esc(date(r.date));
      return '<tr data-record="'+key+'"><td><span class="record-print-value">'+dateText+'</span><input class="record-edit-control record-date" type="date" value="'+esc(r.date)+'" aria-label="Date for '+esc(r.job||r.type)+'"><small>'+(r.start==null?"Time unavailable":esc(D.clock(r.start)))+'</small>'+(r.inferredDate?'<small>Original date unavailable; using deletion date</small>':"")+'</td><td>'+esc(r.driver)+'</td><td>'+esc(r.type)+(r.deleted?'<small>Deleted'+(r.partial?' · partial history':"")+'</small>':"")+'</td><td>'+esc(r.job||"—")+(r.move!==""?'<small>Move #'+esc(r.move)+'</small>':"")+'</td><td>'+esc(r.route||r.notes||"—")+'</td><td><span class="record-print-value">'+esc(r.status)+'</span><select class="record-edit-control record-status" aria-label="Status for '+esc(r.job||r.type)+'">'+statusOptions+'</select>'+(r.type==="Time-slot status"?'<input class="record-edit-control record-custom'+(r.rawStatus==="Custom"?"":" hidden")+'" maxlength="80" value="'+esc(r.customTitle)+'" placeholder="Custom status title" aria-label="Custom status title">':"")+'</td><td>'+(r.type==="Job"&&r.pallets!=null?count(r.pallets):"—")+'</td><td>'+(r.duration==null?"—":count(r.duration)+' min')+'</td><td><button class="record-save record-edit-control" type="button">Save</button></td></tr>';
    }).join("");
  }
  async function saveRecord(button){
    const tr=button.closest("tr[data-record]"),record=rows.find(r=>r.type+":"+r.id===tr.dataset.record);
    if(!record||!userId)return;
    const newDate=tr.querySelector(".record-date").value,newStatus=tr.querySelector(".record-status").value,custom=tr.querySelector(".record-custom")?.value.trim()||null;
    if(!newDate||(!newStatus&&!record.deleted)){message("Choose both a date and a status.",true);return;}
    if(newStatus==="Custom"&&!custom){message("Enter a custom status title.",true);return;}
    const token=generation;
    button.disabled=true;button.textContent="Saving…";
    try{
      const {error}=await sb.rpc("edit_summary_record",{p_type:record.type,p_id:record.id,p_deleted:!!record.deleted,p_date:newDate,p_status:newStatus,p_custom_title:custom});
      if(error)throw error;if(token!==generation)return;
      const correctedDate=record.date!==newDate;record.date=newDate;record.rawStatus=newStatus;record.status=newStatus==="Custom"?custom:newStatus;record.customTitle=custom||"";record.inferredDate=record.inferredDate&&!correctedDate;
      const now=new Date(),today=D.dateKey(now),time=now.getHours()*60+now.getMinutes();
      rows=rows.filter(r=>(!scope.from||r.date>=scope.from)&&r.date<=scope.to&&(r.deleted||r.date<today||(r.date===today&&r.start<=time)));
      const selections={type:el("recordType").value,status:el("recordStatus").value,location:el("recordLocation").value,search:el("recordSearch").value};
      render();
      el("recordType").value=selections.type;el("recordStatus").value=selections.status;el("recordLocation").value=selections.location;el("recordSearch").value=selections.search;details();
      message(record.deleted?"Archived record updated. It remains deleted.":"Record updated.",false);
    }catch(error){if(token===generation)message("Could not save record: "+error.message,true);}
    finally{button.disabled=false;button.textContent="Save";}
  }
  function details(){
    page=0;visible=D.filter(rows,{type:el("recordType").value,status:el("recordStatus").value,location:el("recordLocation").value,search:el("recordSearch").value});renderPage();busy(false);
  }
  function renderPage(){
    const pages=Math.max(1,Math.ceil(visible.length/pageSize));page=Math.min(page,pages-1);
    el("recordRows").innerHTML=recordMarkup(visible.slice(page*pageSize,(page+1)*pageSize));
    el("recordCount").textContent=count(visible.length)+" records";
    el("pageLabel").textContent=visible.length?"Showing "+count(page*pageSize+1)+"–"+count(Math.min((page+1)*pageSize,visible.length))+" of "+count(visible.length):"0 records";
    el("previousPage").disabled=page===0;el("nextPage").disabled=page>=pages-1;
  }
  function render(){
    const t=D.totals(rows);
    el("jobTotal").textContent=count(t.jobs);el("deliveredTotal").textContent=count(t.delivered)+" delivered";
    el("palletTotal").textContent=count(t.pallets);el("jobHours").textContent=hours(t.jobMinutes);el("slotHours").textContent=hours(t.slotMinutes);el("slotTotal").textContent=count(t.slots)+" status records";
    el("driverTotals").innerHTML=[...t.drivers.values()].sort((a,b)=>a.driver.localeCompare(b.driver)).map(d=>'<tr><td>'+esc(d.driver)+'</td><td>'+count(d.jobs)+'</td><td>'+count(d.delivered)+'</td><td>'+count(d.pallets)+'</td><td>'+hours(d.jobMinutes)+'</td><td>'+hours(d.slotMinutes)+'</td></tr>').join("")||'<tr><td colspan="6" class="summary-empty">No past records in this report.</td></tr>';
    const group=(title,map,fn)=>'<h3 class="status-group-title">'+title+'</h3>'+([...map].sort((a,b)=>a[0].localeCompare(b[0])).map(([s,v])=>'<div class="status-total"><span>'+esc(s)+'</span><strong>'+fn(v)+'</strong></div>').join("")||'<p class="summary-help">No records</p>');
    el("statusTotals").innerHTML=group("Job statuses",t.jobStatuses,n=>count(n)+" jobs")+group("Time-slot statuses",t.slotStatuses,v=>hours(v.minutes)+" hrs · "+count(v.count)+" records");
    el("reportScope").textContent=(scope.from?date(scope.from):"All history")+" — "+date(scope.to)+" · "+(scope.driver||"All driver slots");
    el("reportUpdated").textContent="Run "+new Date().toLocaleString();
    const statuses=[...new Set(rows.filter(r=>!r.deleted).map(r=>r.status))].sort();statuses.push("Deleted");el("recordStatus").innerHTML='<option value="">All statuses</option>'+statuses.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("");
    const locations=[...new Set(rows.filter(r=>r.type==="Job").flatMap(r=>[r.origin,r.destination]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    el("recordLocation").innerHTML='<option value="">All locations</option>'+locations.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("");
    el("recordLocation").value="";
    el("recordType").value="";el("recordSearch").value="";el("reportResults").classList.remove("hidden");details();
  }
  async function run(){
    if(!userId)return;
    const from=el("dateFrom").value,to=el("dateTo").value,driver=el("driverSlot").value,today=D.dateKey(new Date());
    if(!to||(from&&from>to)||to>today){message("Choose a valid date range ending today or earlier.",true);return;}
    const token=++generation;busy(true);message("Loading past jobs and time-slot statuses…");
    el("reportResults").classList.add("hidden");scope=null;
    const query=(table,columns,timeColumn)=>()=>{
      let q=sb.from(table).select(columns).lte("scheduled_date",to);
      if(from)q=q.gte("scheduled_date",from);if(driver)q=q.eq("driver",driver);
      return q.order("scheduled_date").order(timeColumn).order("id");
    };
    try{
      const [jobs,slots,deleted]=await Promise.all([
        D.fetchAll(query("transfers","id,scheduled_date,scheduled_time,driver,job_number,move_number,origin,destination,order_status,pallet_count,duration_minutes","scheduled_time"),()=>token===generation),
        D.fetchAll(query("transfer_slot_statuses","id,scheduled_date,start_minutes,end_minutes,driver,status,custom_title,notes","start_minutes"),()=>token===generation),
        D.fetchAll(query("summary_deleted_records","*","deleted_at"),()=>token===generation)
      ]);
      if(token!==generation)return;
      rows=[...D.records(jobs,slots),...D.archivedRecords(deleted)].sort((a,b)=>b.date.localeCompare(a.date)||(b.start||0)-(a.start||0));scope={from,to,driver};render();message(rows.length?count(rows.length)+" past records loaded. Export uses the detailed-record filters.":"No past records found. Try another date range or driver slot.");
    }catch(error){
      if(token!==generation)return;
      rows=[];visible=[];scope=null;message("Could not run the report: "+(error.message||"Please try again."),true);
    }finally{if(token===generation)busy(false);}
  }
  async function session(s){
    const id=s?.user?.id||null;
    el("login").classList.toggle("hidden",!!id);el("signout").classList.toggle("hidden",!id);
    el("me").textContent=s?.user?.user_metadata?.display_name||s?.user?.email||"";el("email").textContent=s?.user?.email||"";
    if(id===userId)return;
    clear();userId=id;busy(false);
    if(!id){message("Sign in to run a report.");return;}
    const token=generation;busy(true);message("Loading driver slots…");
    try{
      const [current,jobs,slots,deleted]=await Promise.all([
        sb.from("transfer_drivers").select("name,sort_order").order("sort_order").order("name"),
        D.fetchAll(()=>sb.from("transfers").select("id,driver").order("id"),()=>token===generation),
        D.fetchAll(()=>sb.from("transfer_slot_statuses").select("id,driver").order("id"),()=>token===generation),
        D.fetchAll(()=>sb.from("summary_deleted_records").select("id,driver").order("id"),()=>token===generation)
      ]);
      if(token!==generation)return;if(current.error)throw current.error;
      const names=[...new Set(["Planning",...(current.data||[]).map(d=>d.name),...jobs.map(d=>d.driver),...slots.map(d=>d.driver),...deleted.map(d=>d.driver)].filter(Boolean))];
      el("driverSlot").innerHTML='<option value="">All driver slots</option>'+names.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join("");
    }catch(error){if(token!==generation)return;busy(false);message("Could not load driver slots: "+error.message+". You can still run a report for all driver slots.",true);return;}
    run();
  }
  preset();busy(false);el("dateFrom").max=el("dateTo").max=D.dateKey(new Date());
  el("period").addEventListener("change",preset);
  for(const id of ["dateFrom","dateTo"])el(id).addEventListener("change",()=>{el("period").value="custom";});
  el("reportFilters").addEventListener("submit",e=>{e.preventDefault();run();});
  for(const id of ["recordType","recordStatus","recordLocation"])el(id).addEventListener("change",details);
  el("recordRows").addEventListener("click",e=>{const b=e.target.closest(".record-save");if(b)saveRecord(b);});
  el("recordRows").addEventListener("change",e=>{if(e.target.matches(".record-status"))e.target.closest("tr").querySelector(".record-custom")?.classList.toggle("hidden",e.target.value!=="Custom");});
  el("recordSearch").addEventListener("input",details);
  el("previousPage").addEventListener("click",()=>{page--;renderPage();});el("nextPage").addEventListener("click",()=>{page++;renderPage();});
  el("exportCsv").addEventListener("click",()=>{
    if(!scope||!visible.length)return;
    const url=URL.createObjectURL(new Blob([D.csv(visible)],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");
    a.href=url;a.download="Transfers-Summary-"+(scope.from||"all")+"-to-"+scope.to+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  let printing=false;
  window.addEventListener("beforeprint",()=>{if(scope){printing=true;el("recordRows").innerHTML=recordMarkup(visible);}});
  window.addEventListener("afterprint",()=>{if(printing){printing=false;renderPage();}});
  el("printReport").addEventListener("click",()=>window.print());
  el("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();if(!sb)return;
    const button=e.submitter;button.disabled=true;el("loginMsg").textContent="Signing in…";
    try{const {error}=await sb.auth.signInWithPassword({email:el("loginEmail").value.trim(),password:el("loginPassword").value});if(error)throw error;el("loginMsg").textContent="";el("loginPassword").value="";}
    catch(error){el("loginMsg").textContent=error.message||"Could not sign in.";}
    finally{button.disabled=false;}
  });
  el("signout").addEventListener("click",async()=>{const {error}=await sb.auth.signOut();if(error)message("Could not sign out: "+error.message,true);});
  if(!C.supabaseUrl||!C.supabaseAnonKey||!window.supabase){message("Reports are unavailable: the live connection is not configured.",true);return;}
  sb=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);
  sb.auth.onAuthStateChange((_event,s)=>{setTimeout(()=>session(s),0);});
  sb.auth.getSession().then(({data,error})=>{if(error)message(error.message,true);else session(data.session);});
})();
