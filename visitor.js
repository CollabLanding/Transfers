(()=>{
"use strict";
const C=window.TRANSFERS_CONFIG,sb=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const $=id=>document.getElementById(id),grid=$("grid"),wrap=$("gridWrap"),day=$("visitorDay"),status=$("visitorStatus");
const token=new URLSearchParams(location.hash.slice(1)).get("key")||"";
const PX15=20,GRID_START=210,GRID_END=1320,GRID_HEIGHT=(GRID_END-GRID_START)/15*PX15;
let driverSchedule=[],generation=0,renderedData=null,loading=false;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const timeToMin=t=>{const [h,m]=String(t||"00:00").split(":").map(Number);return h*60+m};
const minToTime=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
const fmt=t=>{const m=timeToMin(t);return (Math.floor(m/60)%12||12)+":"+String(m%60).padStart(2,"0")+(m>=720?" PM":" AM")};
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const add=(s,n)=>{const d=new Date(s+"T12:00:00");d.setDate(d.getDate()+n);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
function cardBaseTopPx(x){return ((timeToMin(x.scheduled_time)-GRID_START)/15)*PX15}
function cardHeightPx(x){return Math.max(22,(Number(x.duration_minutes||60)/15)*PX15)}
function cardSortStamp(x){
  const stamp=Date.parse(x.updated_at||x.created_at||"");
  return Number.isFinite(stamp)?stamp:0
}
function layoutLaneCards(laneItems,activeLastId=null){
  const ordered=[...laneItems].sort((a,b)=>{
    const am=timeToMin(a.scheduled_time),bm=timeToMin(b.scheduled_time);
    if(am!==bm)return am-bm;
    if(activeLastId&&String(a.id)!==String(b.id)){
      if(String(a.id)===String(activeLastId))return 1;
      if(String(b.id)===String(activeLastId))return -1
    }
    const at=cardSortStamp(a),bt=cardSortStamp(b);
    if(at!==bt)return at-bt;
    const an=Number(a.move_number||0),bn=Number(b.move_number||0);
    if(an!==bn)return an-bn;
    return String(a.id||"").localeCompare(String(b.id||""))
  });
  const placed=[];
  return ordered.map(x=>{
    const base=cardBaseTopPx(x),height=cardHeightPx(x);
    let top=base;
    for(const prior of placed){
      const overlap=Math.max(0,Math.min(top+height,prior.top+prior.height)-Math.max(top,prior.top));
      const maxOverlap=height*0.5;
      if(overlap>maxOverlap)top=prior.top+prior.height-maxOverlap
    }
    const entry={x,top,height,stacked:top>base+0.1};
    placed.push(entry);
    return entry
  })
}

function scheduleOverlay(lane,top,height,kind,label=""){
  if(height<=0)return;
  const block=document.createElement("div");
  block.className="driver-schedule-overlay "+kind;
  block.style.top=Math.max(0,top)+"px";
  block.style.height=Math.max(0,height)+"px";
  if(label)block.innerHTML='<span>'+esc(label)+'</span>';
  lane.appendChild(block);
}
function applyDriverScheduleOverlay(lane,driver,date){
 if(String(driver).trim().toLowerCase()==="planning")return;
 const ranges=window.TransferScheduleCoverage.intervals(driverSchedule,driver,date).map(([a,b])=>[Math.max(GRID_START,a),Math.min(GRID_END,b)]).filter(([a,b])=>b>a);
 const px=m=>(m-GRID_START)/15*PX15;
 if(!ranges.length){lane.classList.add("driver-off-lane");scheduleOverlay(lane,0,GRID_HEIGHT,"driver-off-overlay","OFF");return}
 let cursor=GRID_START;
 for(const [a,b]of ranges){if(a>cursor)scheduleOverlay(lane,px(cursor),px(a)-px(cursor),"driver-unavailable-overlay");cursor=Math.max(cursor,b)}
 if(cursor<GRID_END)scheduleOverlay(lane,px(cursor),GRID_HEIGHT-px(cursor),"driver-unavailable-overlay");
}

function makeCard(x,top,height,stacked){
 const b=document.createElement("article");b.className="card status-"+String(x.order_status||"Planned").toLowerCase().replace(/\s+/g,"-")+(x.urgent?" urgent":"")+(stacked?" visually-stacked":"")+(x.dock_number!=null?" has-dock":"");
 b.style.top=top+"px";b.style.height=height+"px";
 const deadlineText=(d,t)=>[d?new Date(d+"T12:00:00").toLocaleDateString(undefined,{month:"numeric",day:"numeric"}):"",t?fmt(t):""].filter(Boolean).join(" ");
 const deadlines=[["PU",deadlineText(x.pickup_by_date,x.pickup_by_time)],["DL",deadlineText(x.deliver_by_date,x.deliver_by_time)]].filter(([,s])=>s);
 if(deadlines.length)b.classList.add("has-deadlines");
 b.innerHTML=(x.urgent?'<span class="urgent-tape" aria-hidden="true"></span>':'')+'<span class="card-topline"><span class="card-status">'+esc(x.order_status||"Planned")+'</span>'+(x.dock_number!=null?'<span class="card-dock">Dock '+esc(x.dock_number)+'</span>':'')+'<span class="card-move">Move #'+esc(x.move_number??"—")+'</span></span><small class="card-route">'+[x.origin,x.additional_stop,x.destination].filter(Boolean).map(esc).join(' → ')+'</small><b class="card-job">'+esc(x.job_number)+'</b><span class="card-pallet"><span class="card-pallet-count">'+esc(x.pallet_count)+'</span></span>'+(deadlines.length?'<span class="card-deadlines">'+deadlines.map(([k,v])=>'<span>'+k+': '+esc(v)+'</span>').join("")+'</span>':"");
 b.title=[x.order_status,"Move #"+x.move_number,[x.origin,x.additional_stop,x.destination].filter(Boolean).join(" → "),x.job_number,x.pallet_count+" Pallets",x.dock_number!=null?"Dock "+x.dock_number:""].filter(Boolean).join("\n");return b;
}
function render(data){
 const scroll={x:wrap.scrollLeft,y:wrap.scrollTop};driverSchedule=data.schedules||[];grid.replaceChildren();
 $("visitorDate").textContent=new Date(data.date+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
 const drivers=[...new Set(["Planning",...(data.drivers||[]),...(data.transfers||[]).map(x=>x.driver),...(data.statuses||[]).map(x=>x.driver)])];
 const hr=document.createElement("div");hr.className="headrow";const corner=document.createElement("div");corner.className="corner";hr.append(corner);
 drivers.forEach(driver=>{const h=document.createElement("div");h.className="driverhead";h.textContent=driver;hr.append(h)});grid.append(hr);
 const br=document.createElement("div");br.className="bodyrow";const rail=document.createElement("div");rail.className="times";rail.style.height=GRID_HEIGHT+"px";
 for(let m=240;m<=GRID_END;m+=60){const t=document.createElement("div");t.className="tick";t.style.top=(m-GRID_START)/15*PX15+"px";t.textContent=fmt(minToTime(m));rail.append(t)}br.append(rail);
 const types=["Driving","Yard Moves","Loading","Standby","Job Pushed","Custom"];
 for(const driver of drivers){
 const lane=document.createElement("div");lane.className="lane";lane.style.height=GRID_HEIGHT+"px";applyDriverScheduleOverlay(lane,driver,data.date);
 for(let m=GRID_START;m<=GRID_END;m+=15){const line=document.createElement("div");line.className="schedule-grid-line"+(m%60===0?" hour":m%30===0?" half":" quarter");line.style.top=(m-GRID_START)/15*PX15+"px";lane.append(line)}
 for(const s of (data.statuses||[]).filter(s=>s.driver===driver)){const b=document.createElement("div");b.className="slot-status-block slot-status-"+types.indexOf(s.status)+(s.notes?" has-notes":"");b.style.top=(s.start_minutes-GRID_START)/15*PX15+"px";b.style.height=(s.end_minutes-s.start_minutes)/15*PX15+"px";b.innerHTML='<span class="slot-status-label">'+esc(s.status==="Custom"?s.custom_title||"Custom":s.status)+'</span>'+(s.notes?'<span class="slot-status-note">'+esc(s.notes)+'</span>':"");b.title=[s.status,fmt(minToTime(s.start_minutes))+" – "+fmt(minToTime(s.end_minutes)),s.notes].filter(Boolean).join("\n");lane.append(b)}
 layoutLaneCards((data.transfers||[]).filter(x=>x.driver===driver&&timeToMin(x.scheduled_time)>=GRID_START&&timeToMin(x.scheduled_time)<GRID_END)).forEach(e=>lane.append(makeCard(e.x,e.top,e.height,e.stacked)));br.append(lane);
 }grid.append(br);wrap.scrollLeft=scroll.x;wrap.scrollTop=scroll.y;
}
async function load(){
 const date=day.value;if(!date)return;
 if(!token){status.textContent="This visitor link is missing its access key.";status.className="visitor-error";return}
 const request=++generation;loading=true;status.textContent="Updating board…";status.className="";
 try{const r=await sb.rpc("get_visitor_transfer_board",{p_token:token,p_date:date});if(request!==generation||date!==day.value)return;if(r.error)throw r.error;
 const signature=JSON.stringify(r.data);if(signature!==renderedData){render(r.data);renderedData=signature}
 status.textContent="Updated "+new Date().toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})+" · Read only";
 }catch(e){if(request!==generation)return;status.textContent=e.message||"Could not load board. Use Refresh to try again.";status.className="visitor-error"}finally{if(request===generation)loading=false}
}
function navigate(date){day.value=date;load()}
$("prevDay").onclick=()=>navigate(add(day.value,-1));$("nextDay").onclick=()=>navigate(add(day.value,1));$("todayDay").onclick=()=>navigate(today());day.onchange=()=>load();$("refreshBoard").onclick=()=>load();
$("theme").checked=document.documentElement.dataset.theme==="dark";$("theme").onchange=e=>{const value=e.target.checked?"dark":"light";document.documentElement.dataset.theme=value;try{localStorage.setItem("transfers-theme",value)}catch{}};
day.value=today();load();setInterval(()=>{if(!document.hidden&&!loading)load()},15000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)load()});
})();
