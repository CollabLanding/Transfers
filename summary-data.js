(function(root){
  "use strict";
  const number=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
  const dateKey=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  const minutes=t=>{const p=String(t||"00:00").split(":");return number(p[0])*60+number(p[1]);};
  const clock=m=>String(Math.floor(number(m)/60)).padStart(2,"0")+":"+String(Math.floor(number(m)%60)).padStart(2,"0");
  function records(jobs,slots,now=new Date()){
    const today=dateKey(now),time=now.getHours()*60+now.getMinutes();
    return [
      ...jobs.map(j=>({id:j.id,rawStatus:j.order_status||"Planned",date:j.scheduled_date,start:minutes(j.scheduled_time),driver:j.driver||"Unassigned",type:"Job",job:j.job_number||"",move:j.move_number??"",origin:j.origin||"",destination:j.destination||"",route:[j.origin,j.destination].filter(Boolean).join(" → "),notes:"",status:j.order_status||"Planned",pallets:number(j.pallet_count),duration:number(j.duration_minutes)})),
      ...slots.map(s=>({id:s.id,rawStatus:s.status||"Unknown",customTitle:s.custom_title||"",date:s.scheduled_date,start:number(s.start_minutes),driver:s.driver||"Unassigned",type:"Time-slot status",job:"",move:"",route:"",notes:s.notes||"",status:s.status==="Custom"?(s.custom_title||"Custom"):(s.status||"Unknown"),pallets:0,duration:Math.max(0,number(s.end_minutes)-number(s.start_minutes))}))
    ].filter(r=>r.date&&(r.date<today||(r.date===today&&r.start<=time)))
      .sort((a,b)=>b.date.localeCompare(a.date)||b.start-a.start||a.driver.localeCompare(b.driver)||String(a.id).localeCompare(String(b.id)));
  }

  function archivedRecords(entries){
    return entries.map(e=>{
      const x=e.record_data||{},job=e.record_type==="Job",status=e.recorded_status;
      return {id:e.record_id,date:e.scheduled_date,driver:e.driver||"Unassigned",type:e.record_type,
        deleted:true,partial:!!e.partial_history,inferredDate:!!x.schedule_date_inferred,deletedAt:e.deleted_at,
        start:job?(x.scheduled_time?minutes(x.scheduled_time):null):(x.start_minutes??null),
        job:x.job_number||"",move:x.move_number??"",origin:x.origin||"",destination:x.destination||"",
        route:[x.origin,x.destination].filter(Boolean).join(" → "),notes:x.notes||"",
        rawStatus:status,status:status==="Custom"?(x.custom_title||"Custom"):(status||"Unknown"),customTitle:x.custom_title||"",
        pallets:job?(x.pallet_count??null):0,duration:job?(x.duration_minutes??null):(x.end_minutes!=null&&x.start_minutes!=null?x.end_minutes-x.start_minutes:null)};
    });
  }
  function filter(rows,{from="",to="",driver="",type="",status="",location="",search=""}={}){
    const term=search.trim().toLowerCase();
    return rows.filter(r=>(!from||r.date>=from)&&(!to||r.date<=to)&&(!driver||r.driver===driver)&&(!type||r.type===type)&&(status==="Deleted"?!!r.deleted:(!r.deleted&&(!status||r.status===status)))&&(!location||(r.type==="Job"&&(r.origin===location||r.destination===location)))&&(!term||[r.driver,r.job,r.move,r.route,r.notes,r.status].join(" ").toLowerCase().includes(term)));
  }
  function totals(rows){
    const out={jobs:0,delivered:0,pallets:0,jobMinutes:0,slots:0,slotMinutes:0,drivers:new Map(),jobStatuses:new Map(),slotStatuses:new Map()};
    for(const r of rows){
      if(r.deleted)continue;
      if(!out.drivers.has(r.driver))out.drivers.set(r.driver,{driver:r.driver,jobs:0,delivered:0,pallets:0,jobMinutes:0,slotMinutes:0});
      const d=out.drivers.get(r.driver);
      if(r.type==="Job"){
        out.jobs++;d.jobs++;out.pallets+=r.pallets;d.pallets+=r.pallets;out.jobMinutes+=r.duration;d.jobMinutes+=r.duration;
        if(r.status==="Delivered"){out.delivered++;d.delivered++;}
        out.jobStatuses.set(r.status,(out.jobStatuses.get(r.status)||0)+1);
      }else{
        out.slots++;out.slotMinutes+=r.duration;d.slotMinutes+=r.duration;
        const v=out.slotStatuses.get(r.status)||{count:0,minutes:0};v.count++;v.minutes+=r.duration;out.slotStatuses.set(r.status,v);
      }
    }
    return out;
  }
  function csv(rows){
    const cell=v=>{let s=String(v??"");if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const values=[["Date","Time","Driver slot","Type","Job number","Move number","Route","Status","Pallets","Scheduled minutes","Notes"],...rows.map(r=>[r.date,r.start==null?"":clock(r.start),r.driver,r.type,r.job,r.move,r.route,r.deleted?"Deleted · "+(r.status||"Unknown"):r.status,r.type==="Job"?r.pallets:"",r.duration,r.notes])];
    return "\uFEFF"+values.map(r=>r.map(cell).join(",")).join("\r\n");
  }
  async function fetchAll(query,isCurrent=()=>true){
    const rows=[],size=500;
    for(let offset=0;;offset+=size){
      if(!isCurrent())throw new Error("Report superseded");
      const {data,error}=await query().range(offset,offset+size-1);
      if(error)throw error;
      if(!isCurrent())throw new Error("Report superseded");
      rows.push(...(data||[]));
      if(!data||data.length<size)return rows;
    }
  }
  const api={archivedRecords,dateKey,clock,records,filter,totals,csv,fetchAll};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.SummaryData=api;
})(typeof window!=="undefined"?window:globalThis);
