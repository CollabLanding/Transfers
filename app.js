(()=>{
const C=window.TRANSFERS_CONFIG||{},live=!!(C.supabaseUrl&&C.supabaseAnonKey),sb=live?window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey):null;
let linkDragId=null,linkBusy=false,moveBusy=false;
let user=null,profile=null,items=[],drivers=[],locations=[],driverSchedule=[],presence=null,dataChannel=null,optionContext=null,ignoreClickUntil=0,draggedDriver=null,draggedTransferId=null,dragGrabOffsetPx=0,audioCtx=null,lastPlanningDing=0;
const $=id=>document.getElementById(id),E={form:$("form"),edit:$("editId"),date:$("date"),time:$("time"),duration:$("duration"),pickupByDate:$("pickupByDate"),pickupByTime:$("pickupByTime"),deliverByDate:$("deliverByDate"),deliverByTime:$("deliverByTime"),driver:$("driver"),origin:$("origin"),destination:$("destination"),pallet:$("pallet"),job:$("job"),status:$("status"),urgent:$("urgent"),save:$("save"),del:$("delete"),cancel:$("cancel"),textDriver:$("textDriver"),msg:$("msg"),boardDate:$("boardDate"),grid:$("grid"),title:$("title"),currentTime:$("scheduleCurrentTime"),mode:$("mode"),me:$("me"),email:$("email"),active:$("active"),login:$("login"),loginForm:$("loginForm"),loginEmail:$("loginEmail"),loginPassword:$("loginPassword"),loginMsg:$("loginMsg"),signout:$("signout"),formTitle:$("formTitle"),optionModal:$("optionModal"),optionForm:$("optionForm"),optionTitle:$("optionTitle"),optionLabel:$("optionLabel"),optionName:$("optionName"),optionMsg:$("optionMsg"),optionClose:$("optionClose"),optionCancel:$("optionCancel")};
const key="transfers-demo-v2",driverKey="transfers-demo-drivers-v1",locationKey="transfers-demo-locations-v1",PX15=20,GRID_START=210,GRID_END=1320,GRID_HEIGHT=((GRID_END-GRID_START)/15)*PX15;
const today=()=>{let d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)},add=(iso,n)=>{let d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)},fmt=t=>{let [h,m]=String(t).slice(0,5).split(":").map(Number);return (h%12||12)+":"+String(m).padStart(2,"0")+" "+(h>=12?"PM":"AM")};
const minToTime=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0"),timeToMin=t=>{let [h,m]=String(t).slice(0,5).split(":").map(Number);return h*60+m};
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
function candidateVisualTop(x,driver,date,minutes){
  const candidate={...x,driver,scheduled_date:date,scheduled_time:minToTime(minutes),updated_at:new Date().toISOString()};
  const siblings=items.filter(other=>String(other.id)!==String(x.id)&&other.driver===driver&&other.scheduled_date===date&&timeToMin(other.scheduled_time)>=GRID_START&&timeToMin(other.scheduled_time)<GRID_END);
  const layout=layoutLaneCards([...siblings,candidate],candidate.id);
  return layout.find(entry=>String(entry.x.id)===String(candidate.id))?.top??cardBaseTopPx(candidate)
}
function name(){return profile?.display_name||user?.user_metadata?.display_name||user?.email?.split("@")[0]||"User"}
function msg(s,c){E.msg.textContent=s||"";E.msg.style.color=c==="error"?"#a43c3c":c==="ok"?"#2f6f49":""}
function createdByMessage(x){
  E.msg.innerHTML='Created by <button type="button" class="created-by-link" data-transfer-id="'+esc(x.id)+'">'+esc(x.created_by_name||"Unknown")+'</button>';
  E.msg.style.color="";
  const link=E.msg.querySelector(".created-by-link");
  link?.addEventListener("click",()=>window.focusTransferActivity?.(x.id,"Created"));
}
function optionMsg(s,c){E.optionMsg.textContent=s||"";E.optionMsg.style.color=c==="error"?"#a43c3c":c==="ok"?"#2f6f49":""}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function unlockAudio(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    if(!audioCtx)audioCtx=new AC();
    if(audioCtx.state==="suspended")audioCtx.resume();
  }catch(_err){}
}
function planningDing(){
  const now=Date.now();
  if(now-lastPlanningDing<900)return;
  lastPlanningDing=now;
  try{
    unlockAudio();
    if(!audioCtx||audioCtx.state!=="running")return;

    const start=audioCtx.currentTime;
    const master=audioCtx.createGain();
    const compressor=audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-12,start);
    compressor.knee.setValueAtTime(18,start);
    compressor.ratio.setValueAtTime(4,start);
    compressor.attack.setValueAtTime(0.003,start);
    compressor.release.setValueAtTime(0.35,start);

    master.gain.setValueAtTime(0.9,start);
    master.gain.exponentialRampToValueAtTime(0.0001,start+1.25);
    master.connect(compressor);
    compressor.connect(audioCtx.destination);

    const partials=[
      {freq:784,level:0.34,type:"sine",decay:1.15},
      {freq:1176,level:0.24,type:"sine",decay:0.95},
      {freq:1568,level:0.14,type:"triangle",decay:0.72}
    ];

    partials.forEach(p=>{
      const osc=audioCtx.createOscillator();
      const gain=audioCtx.createGain();
      osc.type=p.type;
      osc.frequency.setValueAtTime(p.freq,start);
      gain.gain.setValueAtTime(p.level,start);
      gain.gain.exponentialRampToValueAtTime(0.0001,start+p.decay);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start+p.decay+0.05);
    });

    const echo=audioCtx.createOscillator();
    const echoGain=audioCtx.createGain();
    echo.type="sine";
    echo.frequency.setValueAtTime(1176,start+0.13);
    echoGain.gain.setValueAtTime(0.0001,start);
    echoGain.gain.setValueAtTime(0.16,start+0.13);
    echoGain.gain.exponentialRampToValueAtTime(0.0001,start+0.82);
    echo.connect(echoGain);
    echoGain.connect(master);
    echo.start(start+0.13);
    echo.stop(start+0.84);
  }catch(_err){}
}
function handleNewTransfer(payload){
  if(String(payload?.new?.driver||"").trim().toLowerCase()==="planning")planningDing();
}
function normalize(x){return{linked_next_id:x.linked_next_id?String(x.linked_next_id):null,pickup_by_date:x.pickup_by_date||"",pickup_by_time:String(x.pickup_by_time||"").slice(0,5),deliver_by_date:x.deliver_by_date||"",deliver_by_time:String(x.deliver_by_time||"").slice(0,5),id:String(x.id),scheduled_date:x.scheduled_date,scheduled_time:String(x.scheduled_time||"00:00").slice(0,5),duration_minutes:Number(x.duration_minutes||60),driver:x.driver||"Unassigned",origin:x.origin||"",destination:x.destination||"",pallet_count:Number(x.pallet_count||0),job_number:x.job_number||"",order_status:x.order_status||"Planned",urgent:Boolean(x.urgent),move_number:x.move_number==null?null:Number(x.move_number),created_by:x.created_by,created_by_name:x.created_by_name||"Unknown",created_at:x.created_at||"",updated_at:x.updated_at||x.created_at||""}}
function uniq(values){return [...new Set(values.filter(Boolean).map(v=>String(v).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b))}
function orderedUniq(values){const out=[],seen=new Set();for(const raw of values){const v=String(raw||"").trim();if(v&&!seen.has(v)){seen.add(v);out.push(v)}}return out}
function saveLocal(){localStorage.setItem(key,JSON.stringify(items));localStorage.setItem(driverKey,JSON.stringify(drivers));localStorage.setItem(locationKey,JSON.stringify(locations))}
function loadLocal(){try{items=(JSON.parse(localStorage.getItem(key)||"[]")||[]).map(normalize)}catch{items=[]}try{drivers=JSON.parse(localStorage.getItem(driverKey)||"[]")||[]}catch{drivers=[]}try{locations=JSON.parse(localStorage.getItem(locationKey)||'["Building 100","Building 200"]')||[]}catch{locations=["Building 100","Building 200"]}drivers=orderedUniq(["Planning",...drivers,...items.map(x=>x.driver)]);locations=uniq([...locations,...items.flatMap(x=>[x.origin,x.destination]),"Building 100","Building 200"])}
function fillSelect(select,values,placeholder,addText,sentinel,preserve){let current=preserve??select.value;select.innerHTML='<option value="" disabled>'+esc(placeholder)+'</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("")+'<option value="'+sentinel+'">＋ '+esc(addText)+'</option>';if(values.includes(current))select.value=current;else select.value=""}
function renderOptions(){let dv=E.driver.value||"Planning",ov=E.origin.value,tv=E.destination.value;fillSelect(E.driver,drivers,"Select driver","Add a Driver…","__add_driver__",dv);fillSelect(E.origin,locations,"Select origin","Add a Location…","__add_location__",ov);fillSelect(E.destination,locations,"Select destination","Add a Location…","__add_location__",tv)}
function renderUsers(list){E.active.innerHTML="";(list||[]).forEach(u=>{let d=document.createElement("div");d.className="activeRow";d.textContent=u.display_name||u.email||"User";E.active.appendChild(d)})}
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
  const row=driverSchedule.find(r=>String(r.driver_name)===String(driver)&&String(r.schedule_date)===String(date));
  if(!row){
    lane.classList.add("driver-off-lane");
    scheduleOverlay(lane,0,GRID_HEIGHT,"driver-off-overlay","OFF");
    return;
  }

  const start=timeToMin(String(row.start_time||"00:00").slice(0,5));
  const end=timeToMin(String(row.end_time||"00:00").slice(0,5));
  const px=m=>((m-GRID_START)/15)*PX15;

  // Shift starts outside/after the visible board: unavailable for the full visible day.
  if(start>=GRID_END){
    scheduleOverlay(lane,0,GRID_HEIGHT,"driver-unavailable-overlay","NOT SCHEDULED");
    return;
  }

  if(start>GRID_START){
    scheduleOverlay(lane,0,Math.min(GRID_HEIGHT,px(start)),"driver-unavailable-overlay");
  }

  // Normal same-day shift: black out everything after clock-out.
  if(end>start){
    if(end<=GRID_START){
      scheduleOverlay(lane,0,GRID_HEIGHT,"driver-unavailable-overlay","NOT SCHEDULED");
    }else if(end<GRID_END){
      const top=Math.max(0,px(end));
      scheduleOverlay(lane,top,GRID_HEIGHT-top,"driver-unavailable-overlay");
    }
  }
  // Overnight shifts (end <= start) remain available from start through the end of this board day.
}
function updateScheduleClock(){
  if(!E.currentTime)return;
  const now=new Date();
  E.currentTime.textContent=now.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
}
function updateCurrentTimeLine(){
  const line=E.grid?.querySelector(".current-time-line");
  if(!line)return;
  const now=new Date();
  const minutes=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
  const visible=E.boardDate.value===today()&&minutes>=GRID_START&&minutes<=GRID_END;
  line.classList.toggle("hidden",!visible);
  if(!visible)return;
  line.style.top=(((minutes-GRID_START)/15)*PX15)+"px";
}
function renderBoard(){
 const date=E.boardDate.value,day=items.filter(x=>x.scheduled_date===date),laneDrivers=orderedUniq([...drivers,...day.map(x=>x.driver)]);
 E.title.textContent=new Date(date+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
 const planningStart=today(),planningEnd=add(planningStart,6);
 const planningTotal=items.filter(x=>{const d=String(x.scheduled_date||"");return String(x.driver||"").trim().toLowerCase()==="planning"&&d>=planningStart&&d<=planningEnd}).length;
 const planningTotalEl=document.getElementById("planningMonthTotal");if(planningTotalEl)planningTotalEl.innerHTML='Orders in Planning: <strong>'+planningTotal+'</strong>';
 E.grid.innerHTML="";
 const hr=document.createElement("div");hr.className="headrow";const c=document.createElement("div");c.className="corner";c.textContent="";hr.appendChild(c);
 if(!laneDrivers.length){let d=document.createElement("div");d.className="driverhead";d.textContent="Add a driver to begin";hr.appendChild(d)}
 laneDrivers.forEach(d=>{let h=document.createElement("div");h.className="driverhead";h.textContent=d;h.draggable=true;h.dataset.driver=d;h.title="Drag to reorder driver columns";h.addEventListener("dragstart",driverHeaderDragStart);h.addEventListener("dragend",driverHeaderDragEnd);h.addEventListener("dragover",driverHeaderDragOver);h.addEventListener("dragleave",()=>h.classList.remove("driver-dragover"));h.addEventListener("drop",driverHeaderDrop);hr.appendChild(h)});E.grid.appendChild(hr);
 const br=document.createElement("div");br.className="bodyrow";
 const addGridLines=container=>{
   for(let m=GRID_START;m<=GRID_END;m+=15){
     const line=document.createElement("div");
     line.className="schedule-grid-line"+(m%60===0?" hour":m%30===0?" half":" quarter");
     line.style.top=(((m-GRID_START)/15)*PX15)+"px";
     line.dataset.minute=String(m);
     container.appendChild(line)
   }
 };
 const times=document.createElement("div");times.className="times";times.style.height=GRID_HEIGHT+"px";
 addGridLines(times);
 const marks=[];for(let m=240;m<=GRID_END;m+=60)marks.push(m);
 marks.forEach(m=>{let t=document.createElement("div");t.className="tick";t.dataset.minute=String(m);t.style.top=(((m-GRID_START)/15)*PX15)+"px";t.textContent=fmt(minToTime(m));times.appendChild(t)});
 br.appendChild(times);
 if(!laneDrivers.length){let empty=document.createElement("div");empty.className="emptylane";empty.style.height=GRID_HEIGHT+"px";addGridLines(empty);empty.textContent="Use the Driver dropdown to add your first driver.";br.appendChild(empty)}
 laneDrivers.forEach(d=>{
   let lane=document.createElement("div");lane.className="lane";lane.style.height=GRID_HEIGHT+"px";lane.dataset.driver=d;
   addGridLines(lane);
   lane.addEventListener("dragover",transferLaneDragOver);lane.addEventListener("dragleave",transferLaneDragLeave);lane.addEventListener("drop",dropCard);
   applyDriverScheduleOverlay(lane,d,date);
   const laneItems=day.filter(x=>x.driver===d&&timeToMin(x.scheduled_time)>=GRID_START&&timeToMin(x.scheduled_time)<GRID_END);
   layoutLaneCards(laneItems).forEach(entry=>lane.appendChild(makeCard(entry.x,entry.top,entry.height,entry.stacked)));
   br.appendChild(lane)
 });
 const nowLine=document.createElement("div");nowLine.className="current-time-line hidden";nowLine.setAttribute("aria-hidden","true");br.appendChild(nowLine);
 E.grid.appendChild(br);updateScheduleClock();updateCurrentTimeLine();slotStatuses.render()
}
function driverHeaderDragStart(e){draggedDriver=e.currentTarget.dataset.driver;e.currentTarget.classList.add("dragging-driver");e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("application/x-transfer-driver",draggedDriver)}
function driverHeaderDragEnd(e){draggedDriver=null;e.currentTarget.classList.remove("dragging-driver");document.querySelectorAll(".driverhead.driver-dragover").forEach(x=>x.classList.remove("driver-dragover"))}
function driverHeaderDragOver(e){if(!draggedDriver||draggedDriver===e.currentTarget.dataset.driver)return;e.preventDefault();e.dataTransfer.dropEffect="move";e.currentTarget.classList.add("driver-dragover")}
async function driverHeaderDrop(e){e.preventDefault();const target=e.currentTarget.dataset.driver,source=draggedDriver||e.dataTransfer.getData("application/x-transfer-driver");e.currentTarget.classList.remove("driver-dragover");if(!source||!target||source===target)return;const old=drivers.slice(),next=drivers.filter(d=>d!==source),rect=e.currentTarget.getBoundingClientRect(),after=e.clientX>rect.left+rect.width/2;let index=next.indexOf(target);if(index<0)return;if(after)index++;next.splice(index,0,source);drivers=orderedUniq(next);renderOptions();renderBoard();if(!live){saveLocal();return}const r=await sb.rpc("reorder_transfer_drivers",{p_names:drivers});if(r.error){drivers=old;renderOptions();renderBoard();msg("Could not reorder drivers: "+r.error.message,"error");return}msg("Driver column order updated.","ok")}
function clearDropPreviews(){document.querySelectorAll(".drop-preview").forEach(x=>x.remove());document.querySelectorAll(".lane.dragover").forEach(x=>x.classList.remove("dragover"))}
function landingMinutes(e,lane,x){const rect=lane.getBoundingClientRect(),raw=GRID_START+Math.round((e.clientY-rect.top-dragGrabOffsetPx)/PX15)*15,anchor=timeToMin(x.scheduled_time),group=linkedGroup(x),earliest=Math.min(...group.map(row=>timeToMin(row.scheduled_time)-anchor)),latest=Math.max(...group.map(row=>timeToMin(row.scheduled_time)-anchor+row.duration_minutes));return Math.max(GRID_START-earliest,Math.min(GRID_END-latest,raw))}
function transferLaneDragOver(e){
 if(!draggedTransferId)return;e.preventDefault();const lane=e.currentTarget,x=items.find(i=>i.id===draggedTransferId);if(!x)return;
 clearDropPreviews();lane.classList.add("dragover");
 const minutes=landingMinutes(e,lane,x),delta=minutes-timeToMin(x.scheduled_time),group=linkedGroup(x),ids=new Set(group.map(row=>row.id));
 const moved=group.map(row=>({...row,driver:lane.dataset.driver,scheduled_date:E.boardDate.value,scheduled_time:minToTime(timeToMin(row.scheduled_time)+delta)}));
 const neighbors=items.filter(row=>!ids.has(row.id)&&row.driver===lane.dataset.driver&&row.scheduled_date===E.boardDate.value);
 for(const entry of layoutLaneCards([...neighbors,...moved])){if(!ids.has(entry.x.id))continue;const p=document.createElement("div");p.className="drop-preview";p.style.top=entry.top+"px";p.style.height=entry.height+"px";p.innerHTML='<span class="drop-preview-time">'+fmt(entry.x.scheduled_time)+'</span><span class="drop-preview-label">'+(group.length>1?'Linked load':'Drop here')+'</span>';lane.appendChild(p)}
}
function transferLaneDragLeave(e){const lane=e.currentTarget;if(e.relatedTarget&&lane.contains(e.relatedTarget))return;lane.classList.remove("dragover");lane.querySelectorAll(".drop-preview").forEach(p=>p.remove())}
function statusClass(s){return "status-"+String(s||"Planned").toLowerCase().replace(/\s+/g,"-")}
function deadlineText(date,time){
 const day=date?new Date(date+"T12:00:00").toLocaleDateString("en-US",{month:"numeric",day:"numeric"}):"";
 return [day,time?fmt(time):""].filter(Boolean).join(" ");
}
function makeCard(x,visualTop=null,visualHeight=null,stacked=false){
 const deadlines=[["PU",deadlineText(x.pickup_by_date,x.pickup_by_time)],["DL",deadlineText(x.deliver_by_date,x.deliver_by_time)]].filter(([,value])=>value);
 let b=document.createElement("div");b.setAttribute("role","button");b.tabIndex=0;
 b.className="card "+statusClass(x.order_status)+(x.urgent?" urgent":"")+(stacked?" visually-stacked":"");b.draggable=true;b.dataset.id=x.id;if(deadlines.length)b.classList.add("has-deadlines");
 b.style.top=(Number.isFinite(visualTop)?visualTop:cardBaseTopPx(x))+"px";
 b.style.height=(Number.isFinite(visualHeight)?visualHeight:cardHeightPx(x))+"px";
 b.innerHTML=(x.urgent?'<span class="urgent-tape" aria-hidden="true"></span>':'')+
   '<span class="draghint">↕</span>'+
   '<span class="card-topline"><span class="card-status">'+esc(x.order_status||"Planned")+'</span><span class="card-move">Move #'+esc(x.move_number??"—")+'</span></span>'+
   '<small class="card-route">'+esc(x.origin)+' → '+esc(x.destination)+'</small>'+
   '<b class="card-job">'+esc(x.job_number)+'</b>'+
   '<small class="card-creator">'+esc(x.created_by_name)+'</small>'+
   (deadlines.length?'<span class="card-deadlines">'+deadlines.map(([label,value])=>'<span>'+label+': '+esc(value)+'</span>').join('')+'</span>':'');
 b.title=[x.origin+' → '+x.destination,x.job_number,...deadlines.map(([label,value])=>label+': '+value)].join('\n');
 ["top","bottom"].forEach(edge=>{const h=document.createElement("span");h.className="resize-handle resize-"+edge;h.dataset.edge=edge;h.title=edge==="top"?"Drag to change start time and duration":"Drag to change duration";h.addEventListener("pointerdown",e=>beginTransferResize(e,x,b,edge));b.appendChild(h)});
 attachChainHandle(b,x);
 b.addEventListener("keydown",e=>{if(e.target===b&&(e.key==="Enter"||e.key===" ")){e.preventDefault();edit(x.id)}});
 b.addEventListener("dragstart",e=>{if(e.target.closest?.(".resize-handle,.load-chain")){e.preventDefault();return}ignoreClickUntil=Date.now()+500;draggedTransferId=x.id;const rect=b.getBoundingClientRect();dragGrabOffsetPx=Math.max(0,Math.min(rect.height,e.clientY-rect.top));linkedGroup(x).forEach(row=>E.grid.querySelectorAll(".card").forEach(card=>{if(card.dataset.id===row.id)card.classList.add("dragging")}));e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",x.id)});
 b.addEventListener("dragend",()=>{draggedTransferId=null;dragGrabOffsetPx=0;E.grid.querySelectorAll(".card.dragging").forEach(card=>card.classList.remove("dragging"));clearDropPreviews()});
 b.onclick=()=>{if(Date.now()<ignoreClickUntil)return;edit(x.id)};
 return b
}
function beginTransferResize(e,x,b,edge){
 if(e.button!==0)return;
 e.preventDefault();e.stopPropagation();
 ignoreClickUntil=Date.now()+900;
 const handle=e.currentTarget,lane=b.parentElement;
 if(!lane?.classList.contains("lane"))return;
 const originalStart=timeToMin(x.scheduled_time),originalDuration=Number(x.duration_minutes),originalEnd=originalStart+originalDuration;
 let nextStart=originalStart,nextDuration=originalDuration,finished=false;
 b.draggable=false;b.classList.add("resizing");
 handle.setPointerCapture?.(e.pointerId);

 const pointerMinutes=clientY=>{
   const rect=lane.getBoundingClientRect();
   const raw=GRID_START+((clientY-rect.top)/PX15)*15;
   return Math.round(raw/15)*15
 };
 const paint=()=>{
   b.style.top=(((nextStart-GRID_START)/15)*PX15)+"px";
   b.style.height=Math.max(22,(nextDuration/15)*PX15)+"px";
   b.dataset.resizeLabel=fmt(minToTime(nextStart))+" · "+durationLabel(nextDuration)
 };
 const move=ev=>{
   ev.preventDefault();
   const point=pointerMinutes(ev.clientY);
   if(edge==="top"){
     const minStart=Math.max(GRID_START,originalEnd-720);
     nextStart=Math.max(minStart,Math.min(originalEnd-15,point));
     nextDuration=originalEnd-nextStart
   }else{
     const maxEnd=Math.min(GRID_END,originalStart+720);
     const nextEnd=Math.max(originalStart+15,Math.min(maxEnd,point));
     nextStart=originalStart;nextDuration=nextEnd-originalStart
   }
   paint()
 };
 const cleanup=()=>{
   handle.removeEventListener("pointermove",move);
   handle.removeEventListener("pointerup",finish);
   handle.removeEventListener("pointercancel",cancel);
   try{handle.releasePointerCapture?.(e.pointerId)}catch(_err){}
   b.draggable=true;b.classList.remove("resizing");delete b.dataset.resizeLabel
 };
 const finish=ev=>{
   if(finished)return;finished=true;ev.preventDefault();ev.stopPropagation();cleanup();
   if(nextStart===originalStart&&nextDuration===originalDuration){renderBoard();return}
   resizeTransfer(x,nextStart,nextDuration)
 };
 const cancel=ev=>{
   if(finished)return;finished=true;ev.preventDefault();cleanup();renderBoard()
 };
 handle.addEventListener("pointermove",move);
 handle.addEventListener("pointerup",finish);
 handle.addEventListener("pointercancel",cancel)
}
async function resizeTransfer(x,newStartMinutes,newDuration){
 const old={scheduled_time:x.scheduled_time,duration_minutes:x.duration_minutes};
 const newTime=minToTime(newStartMinutes);
 x.scheduled_time=newTime;x.duration_minutes=newDuration;x.updated_at=new Date().toISOString();renderBoard();
 if(live){
   const r=await sb.from("transfers").update({scheduled_time:newTime,duration_minutes:newDuration,updated_at:new Date().toISOString()}).eq("id",x.id).select("*").single();
   if(r.error){
     x.scheduled_time=old.scheduled_time;x.duration_minutes=old.duration_minutes;renderBoard();
     msg("Could not resize transfer: "+r.error.message,"error");return
   }
   replaceItem(r.data);renderBoard()
 }else saveLocal();
 msg("Transfer resized to "+fmt(newTime)+" · "+durationLabel(newDuration)+".","ok")
}
function durationLabel(n){if(n<60)return n+" min";let h=Math.floor(n/60),m=n%60;return h+" hr"+(h!==1?"s":"")+(m?" "+m+" min":"")}
async function dropCard(e){e.preventDefault();const lane=e.currentTarget,id=e.dataTransfer.getData("text/plain")||draggedTransferId,x=items.find(i=>i.id===id);if(!x){clearDropPreviews();return}const minutes=landingMinutes(e,lane,x),newTime=minToTime(minutes),newDriver=lane.dataset.driver;draggedTransferId=null;dragGrabOffsetPx=0;clearDropPreviews();await moveTransfer(x,newDriver,newTime)}
function linkedGroup(x){
 const ids=new Set([x.id]);let changed=true;
 while(changed){changed=false;for(const row of items){if(row.linked_next_id&&(ids.has(row.id)||ids.has(row.linked_next_id))){for(const id of [row.id,row.linked_next_id])if(!ids.has(id)){ids.add(id);changed=true}}}}
 return items.filter(row=>ids.has(row.id));
}
function nextLoad(x){const lane=layoutLaneCards(items.filter(row=>row.driver===x.driver&&row.scheduled_date===x.scheduled_date));return lane[lane.findIndex(entry=>entry.x.id===x.id)+1]?.x}
async function changeLink(source,target){
 if(linkBusy)return;linkBusy=true;
 try{
   if(live){const r=await sb.rpc("set_transfer_link",{p_source:source.id,p_target:target?.id||null});if(r.error)throw r.error;(r.data||[]).forEach(replaceItem)}
   else{source.linked_next_id=target?.id||null;saveLocal()}
   renderBoard();msg(target?"Loads linked. Drag either load to move them together.":"Link removed.","ok");
 }catch(error){msg("Could not change link: "+error.message,"error")}
 finally{linkBusy=false}
}
function attachChainHandle(card,x){
 const incoming=items.find(row=>row.linked_next_id===x.id),linked=!!(x.linked_next_id||incoming);
 const handle=document.createElement("button");handle.type="button";handle.className="load-chain"+(linked?" is-linked":"");handle.draggable=true;
 handle.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
 handle.title=linked?"Linked — click to unlink; drag to link the next load":"Drag chain to the next load below";handle.setAttribute("aria-label",handle.title);handle.setAttribute("aria-pressed",String(linked));
 handle.addEventListener("pointerdown",e=>e.stopPropagation());
 handle.addEventListener("click",e=>{e.stopPropagation();if(Date.now()<ignoreClickUntil)return;const source=x.linked_next_id?x:incoming;if(source)changeLink(source,null)});
 handle.addEventListener("dragstart",e=>{e.stopPropagation();if(linkBusy||moveBusy||x.linked_next_id){e.preventDefault();return}linkDragId=x.id;ignoreClickUntil=Date.now()+600;e.dataTransfer.effectAllowed="link";e.dataTransfer.setData("application/x-transfer-link",x.id);handle.classList.add("link-dragging")});
 handle.addEventListener("dragend",e=>{e.stopPropagation();linkDragId=null;ignoreClickUntil=Date.now()+300;handle.classList.remove("link-dragging");E.grid.querySelectorAll(".link-target").forEach(n=>n.classList.remove("link-target"))});
 card.addEventListener("dragover",e=>{if(!linkDragId)return;e.stopPropagation();const source=items.find(row=>row.id===linkDragId);if(source&&nextLoad(source)?.id===x.id&&!incoming){e.preventDefault();e.dataTransfer.dropEffect="link";card.classList.add("link-target")}});
 card.addEventListener("dragleave",e=>{if(!card.contains(e.relatedTarget))card.classList.remove("link-target")});
 card.addEventListener("drop",e=>{if(!linkDragId)return;e.preventDefault();e.stopPropagation();const source=items.find(row=>row.id===linkDragId);linkDragId=null;ignoreClickUntil=Date.now()+300;card.classList.remove("link-target");if(source&&nextLoad(source)?.id===x.id&&!incoming)changeLink(source,x);else msg("Drop the chain on the next unlinked load below in the same driver column.","error")});
 card.append(handle);if(linked)card.classList.add("linked-load");
}
async function moveTransfer(x,newDriver,newTime){
 if(moveBusy||linkBusy)return;
 const group=linkedGroup(x),delta=timeToMin(newTime)-timeToMin(x.scheduled_time);
 if(group.some(row=>timeToMin(row.scheduled_time)+delta<GRID_START||timeToMin(row.scheduled_time)+delta+row.duration_minutes>GRID_END)){msg("The linked loads must all fit within the board hours.","error");return}
 moveBusy=true;
 try{
   if(live){const r=await sb.rpc("move_linked_transfers",{p_anchor:x.id,p_driver:newDriver,p_time:newTime});if(r.error)throw r.error;(r.data||[]).forEach(replaceItem)}
   else{group.forEach(row=>{row.driver=newDriver;row.scheduled_date=x.scheduled_date;row.scheduled_time=minToTime(timeToMin(row.scheduled_time)+delta);row.updated_at=new Date().toISOString()});saveLocal()}
   renderBoard();msg((group.length>1?"Linked loads":"Transfer")+" moved to "+fmt(newTime)+" with "+newDriver+".","ok");
 }catch(error){msg("Could not move loads: "+error.message,"error")}
 finally{moveBusy=false}
}
function replaceItem(row){const n=normalize(row),i=items.findIndex(x=>x.id===n.id);if(i>=0)items[i]=n;else items.push(n)}
async function loadDriversWithFallback(){
  let r=await sb.from("transfer_drivers").select("name,sort_order").order("sort_order",{ascending:true}).order("name",{ascending:true});
  if(r.error){
    r=await sb.from("transfer_drivers").select("name").order("name",{ascending:true});
  }
  return r;
}
async function loadLocationsWithFallback(){
  let r=await sb.from("transfer_locations").select("name").order("name");
  return r;
}
async function loadBoardSchedule(){
  if(!live){driverSchedule=[];renderBoard();return}
  const r=await sb.from("driver_schedules")
    .select("driver_name,schedule_date,start_time,end_time")
    .eq("schedule_date",E.boardDate.value);
  driverSchedule=r.error?[]:(r.data||[]);
  renderBoard();
}
async function loadData(){if(!live){loadLocal();driverSchedule=[];renderOptions();renderBoard();return}const [tr,dr,lr,sc]=await Promise.all([sb.from("transfers").select("*").order("scheduled_date").order("scheduled_time"),loadDriversWithFallback(),loadLocationsWithFallback(),sb.from("driver_schedules").select("driver_name,schedule_date,start_time,end_time").eq("schedule_date",E.boardDate.value)]);if(tr.error){msg("Transfers could not load: "+tr.error.message,"error");items=[]}else items=(tr.data||[]).map(normalize);drivers=orderedUniq(["Planning",...(dr.error?[]:(dr.data||[]).map(x=>x.name)),...items.map(x=>x.driver)]);locations=uniq([...(lr.error?["Building 100","Building 200"]:(lr.data||[]).map(x=>x.name)),...items.flatMap(x=>[x.origin,x.destination]),"Building 100","Building 200"]);driverSchedule=sc.error?[]:(sc.data||[]);if(dr.error||lr.error){const details=[dr.error?"Drivers: "+dr.error.message:"",lr.error?"Locations: "+lr.error.message:""].filter(Boolean).join(" · ");msg("Could not load driver/location lists. "+details,"error")}renderOptions();renderBoard()}
async function subscribe(){if(!live)return;if(dataChannel)await sb.removeChannel(dataChannel);if(presence)await sb.removeChannel(presence);dataChannel=sb.channel("transfers-data").on("postgres_changes",{event:"INSERT",schema:"public",table:"transfers"},handleNewTransfer).on("postgres_changes",{event:"*",schema:"public",table:"transfers"},loadData).on("postgres_changes",{event:"*",schema:"public",table:"transfer_drivers"},loadData).on("postgres_changes",{event:"*",schema:"public",table:"transfer_locations"},loadData).on("postgres_changes",{event:"*",schema:"public",table:"driver_schedules"},loadBoardSchedule).on("postgres_changes",{event:"*",schema:"public",table:"transfer_slot_statuses"},()=>slotStatuses.refresh()).subscribe();presence=sb.channel("transfers-active",{config:{presence:{key:user.id}}}).on("presence",{event:"sync"},()=>{const unique=new Map();Object.values(presence.presenceState()).forEach(v=>v.forEach(x=>{const id=x.user_id||x.email;if(id&&!unique.has(id))unique.set(id,x)}));renderUsers([...unique.values()])}).subscribe(async s=>{if(s==="SUBSCRIBED")await presence.track({user_id:user.id,display_name:name(),email:user.email})})}
function reset(){E.form.reset();E.edit.value="";E.date.value=E.boardDate.value;E.time.value="08:00";E.duration.value="60";if(E.status)E.status.value="Planned";if(E.urgent)E.urgent.checked=false;E.formTitle.textContent="Build Transfer Load";E.save.textContent="Add Transfer";E.del.classList.add("hidden");E.cancel.classList.add("hidden");E.textDriver?.classList.add("hidden");renderOptions();msg("")}
function edit(id){let x=items.find(i=>i.id===String(id));if(!x)return;E.edit.value=x.id;E.date.value=x.scheduled_date;E.time.value=x.scheduled_time;if(![...E.duration.options].some(o=>Number(o.value)===Number(x.duration_minutes))){const o=document.createElement("option");o.value=String(x.duration_minutes);o.textContent=durationLabel(x.duration_minutes);E.duration.appendChild(o)}E.duration.value=String(x.duration_minutes);E.pickupByDate.value=x.pickup_by_date||"";E.pickupByTime.value=x.pickup_by_time||"";E.deliverByDate.value=x.deliver_by_date||"";E.deliverByTime.value=x.deliver_by_time||"";renderOptions();E.driver.value=x.driver;E.origin.value=x.origin;E.destination.value=x.destination;E.pallet.value=x.pallet_count;E.job.value=x.job_number;E.status.value=x.order_status||"Planned";if(E.urgent)E.urgent.checked=Boolean(x.urgent);E.formTitle.textContent="Edit Transfer Load";E.save.textContent="Update";E.del.classList.remove("hidden");E.cancel.classList.remove("hidden");E.textDriver?.classList.remove("hidden");createdByMessage(x)}
async function openTransferEditor(id){
  let x=items.find(i=>String(i.id)===String(id));
  if(!x&&live){
    const result=await sb.from("transfers").select("*").eq("id",id).maybeSingle();
    if(!result.error&&result.data){
      x=normalize(result.data);
      items.push(x);
      drivers=orderedUniq([...drivers,x.driver]);
      locations=uniq([...locations,x.origin,x.destination]);
    }
  }
  if(!x)return;
  E.boardDate.value=x.scheduled_date;
  renderOptions();
  renderBoard();
  edit(x.id);
}
window.openTransferEditor=openTransferEditor;
function urgentColumnMissing(error){
  const code=String(error?.code||"");
  const message=String(error?.message||"").toLowerCase();
  return (code==="PGRST204"||code==="42703")&&message.includes("urgent");
}
async function submit(ev){
  ev.preventDefault();
  let p={
    scheduled_date:E.date.value,
    scheduled_time:E.time.value,
    duration_minutes:Number(E.duration.value),
    pickup_by_date:E.pickupByDate.value||null,
    pickup_by_time:E.pickupByTime.value||null,
    deliver_by_date:E.deliverByDate.value||null,
    deliver_by_time:E.deliverByTime.value||null,

    driver:E.driver.value,
    origin:E.origin.value,
    destination:E.destination.value,
    pallet_count:Number(E.pallet.value),
    job_number:E.job.value.trim(),
    order_status:E.status?.value||"Planned",
    urgent:Boolean(E.urgent?.checked),
    created_by:user?.id||"demo-user",
    created_by_name:name()
  };
  if(!p.scheduled_date||!p.scheduled_time||!p.duration_minutes||!p.driver||p.driver.startsWith("__")||!p.origin||p.origin.startsWith("__")||!p.destination||p.destination.startsWith("__")||!p.job_number||Number.isNaN(p.pallet_count)){
    msg("Complete all fields.","error");return
  }
  const scheduledMinutes=timeToMin(p.scheduled_time);
  if(scheduledMinutes<240||scheduledMinutes>1200){
    msg("Scheduled time must be between 4:00 AM and 8:00 PM.","error");return
  }
  if(p.origin.toLowerCase()===p.destination.toLowerCase()){
    msg("Origination and destination must be different.","error");return
  }

  let id=E.edit.value,urgentFallback=false;
  if(live){
    let r;
    if(id){
      const updatePayload={
        scheduled_date:p.scheduled_date,
        scheduled_time:p.scheduled_time,
        duration_minutes:p.duration_minutes,
        pickup_by_date:p.pickup_by_date,
        pickup_by_time:p.pickup_by_time,
        deliver_by_date:p.deliver_by_date,
        deliver_by_time:p.deliver_by_time,

        driver:p.driver,
        origin:p.origin,
        destination:p.destination,
        pallet_count:p.pallet_count,
        job_number:p.job_number,
        order_status:p.order_status,
        urgent:p.urgent,
        updated_at:new Date().toISOString()
      };
      r=await sb.from("transfers").update(updatePayload).eq("id",id).select("*").single();
      if(r.error&&urgentColumnMissing(r.error)){
        urgentFallback=true;
        delete updatePayload.urgent;
        r=await sb.from("transfers").update(updatePayload).eq("id",id).select("*").single()
      }
    }else{
      const insertPayload={...p};
      r=await sb.from("transfers").insert(insertPayload).select("*").single();
      if(r.error&&urgentColumnMissing(r.error)){
        urgentFallback=true;
        delete insertPayload.urgent;
        r=await sb.from("transfers").insert(insertPayload).select("*").single()
      }
    }
    if(r.error){msg("Could not save transfer: "+r.error.message,"error");return}
    replaceItem(r.data)
  }else{
    if(id){
      let i=items.findIndex(x=>x.id===id);
      if(i>=0)items[i]={...items[i],...p}
    }else{
      items.push(normalize({...p,id:crypto.randomUUID?crypto.randomUUID():String(Date.now())}))
    }
    drivers=uniq([...drivers,p.driver]);
    locations=uniq([...locations,p.origin,p.destination]);
    saveLocal()
  }

  E.boardDate.value=p.scheduled_date;
  renderOptions();
  renderBoard();
  reset();
  if(urgentFallback)msg("Transfer saved. Run migration-v12.sql to enable the Urgent flag.","error");
  else msg(id?"Transfer updated.":"Transfer added.","ok")
}
async function remove(){let id=E.edit.value;if(!id||!confirm("Delete this transfer load?"))return;if(live){let r=await sb.from("transfers").delete().eq("id",id);if(r.error){msg(r.error.message,"error");return}}items=items.filter(x=>x.id!==id);if(!live)saveLocal();renderBoard();reset();msg("Transfer deleted.","ok")}
function managedChange(kind,select){if(select.value==="__add_driver__")openOption("driver",select);else if(select.value==="__add_location__")openOption("location",select)}
function openOption(kind,select){optionContext={kind,select};E.optionTitle.textContent=kind==="driver"?"Add a Driver":"Add a Location";E.optionLabel.firstChild.textContent=kind==="driver"?"Driver Name":"Building / Location Name";E.optionName.value="";optionMsg("");E.optionModal.classList.remove("hidden");setTimeout(()=>E.optionName.focus(),0)}
function closeOption(){if(optionContext?.select&&optionContext.select.value.startsWith("__"))optionContext.select.value="";optionContext=null;E.optionModal.classList.add("hidden");optionMsg("")}
async function addOption(ev){ev.preventDefault();if(!optionContext)return;const value=E.optionName.value.trim(),kind=optionContext.kind,list=kind==="driver"?drivers:locations;if(!value){optionMsg("Enter a name.","error");return}const existing=list.find(x=>x.toLowerCase()===value.toLowerCase());if(existing){renderOptions();optionContext.select.value=existing;closeOption();return}if(live){const table=kind==="driver"?"transfer_drivers":"transfer_locations",payload={name:value,created_by:user.id,created_by_name:name()};if(kind==="driver")payload.sort_order=drivers.length;const r=await sb.from(table).insert(payload).select("name").single();if(r.error){optionMsg("Could not add option: "+r.error.message,"error");return}}if(kind==="driver")drivers=orderedUniq([...drivers,value]);else locations=uniq([...locations,value]);if(!live)saveLocal();const target=optionContext.select;renderOptions();target.value=value;closeOption();renderBoard()}
async function session(s){if(!s?.user){slotStatuses.reset();user=null;E.login.classList.remove("hidden");return}user=s.user;E.login.classList.add("hidden");E.signout.classList.remove("hidden");let r=await sb.from("profiles").select("display_name").eq("id",user.id).maybeSingle();profile=r.data||{display_name:user.email?.split("@")[0]||"User"};E.me.textContent=name();E.email.textContent=user.email||"";await loadData();await slotStatuses.refresh();await subscribe()}
const slotStatuses=window.createSlotStatuses({sb,grid:E.grid,getDate:()=>E.boardDate.value,getUser:()=>user,report:msg,start:GRID_START,end:GRID_END,px:PX15});
E.form.onsubmit=submit;E.del.onclick=remove;E.cancel.onclick=reset;E.driver.onchange=()=>managedChange("driver",E.driver);E.origin.onchange=()=>managedChange("location",E.origin);E.destination.onchange=()=>managedChange("location",E.destination);E.optionForm.onsubmit=addOption;E.optionClose.onclick=closeOption;E.optionCancel.onclick=closeOption;E.optionModal.addEventListener("click",e=>{if(e.target===E.optionModal)closeOption()});
$("prev").onclick=()=>{E.boardDate.value=add(E.boardDate.value,-1);E.date.value=E.boardDate.value;loadBoardSchedule()};$("next").onclick=()=>{E.boardDate.value=add(E.boardDate.value,1);E.date.value=E.boardDate.value;loadBoardSchedule()};$("today").onclick=()=>{E.boardDate.value=today();E.date.value=E.boardDate.value;loadBoardSchedule()};E.boardDate.onchange=()=>{E.date.value=E.boardDate.value;loadBoardSchedule()};E.signout.onclick=()=>sb?.auth.signOut();
document.addEventListener("pointerdown",unlockAudio,{once:true});
document.addEventListener("keydown",unlockAudio,{once:true});
updateScheduleClock();
setInterval(updateScheduleClock,1000);
setInterval(updateCurrentTimeLine,30000);
E.loginForm.onsubmit=async e=>{e.preventDefault();E.loginMsg.textContent="Signing in…";let r=await sb.auth.signInWithPassword({email:E.loginEmail.value.trim(),password:E.loginPassword.value});E.loginMsg.textContent=r.error?r.error.message:""};
(async()=>{E.boardDate.value=today();E.date.value=today();E.time.value="08:00";E.duration.value="60";if(!live){user={id:"demo-user",email:"Local preview mode",user_metadata:{display_name:"Demo User"}};profile={display_name:"Demo User"};renderUsers([{display_name:"Demo User"}]);loadLocal();renderOptions();renderBoard();return}E.mode.textContent="Live";let s=await sb.auth.getSession();await session(s.data.session);sb.auth.onAuthStateChange((_e,s)=>session(s))})();
})();