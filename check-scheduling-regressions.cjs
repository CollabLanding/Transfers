const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
function section(source,from,to){assert(source.includes(from)&&source.includes(to));return source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));}
function context(extra={}){return vm.createContext({console,Date,Math,Number,String,Object,...extra});}
function load(c,from,to,source=app){vm.runInContext(section(source,from,to),c);}
function field(value){return {value};}
{
 const E={edit:field('a'),date:field('2026-11-17'),time:field('08:00'),duration:field('60'),driver:field('A'),job:field('draft notes')};
 const baseline={date:'2026-11-17',time:'08:00',duration:'60',driver:'A',job:'old notes'};
 const c=context({E,transferInfoBaseline:baseline,transferInfoValues:()=>Object.fromEntries(Object.entries(E).map(([k,v])=>[k,v.value]))});
 load(c,'function syncBoardActionForm','function beginTransferResize');
 c.row={id:'a',scheduled_date:'2026-11-18',scheduled_time:'09:15:00',duration_minutes:75,driver:'B'};
 vm.runInContext('syncBoardActionForm(row)',c);
 assert.equal(E.driver.value,'B');assert.equal(E.date.value,'2026-11-18');assert.equal(E.time.value,'09:15');assert.equal(E.duration.value,'75');assert.equal(E.job.value,'draft notes');
 const patch=vm.runInContext("changedTransferPayload({driver:'B',scheduled_date:'2026-11-18',scheduled_time:'09:15',duration_minutes:75,job_number:'draft notes'})",c);
 assert.deepEqual(JSON.parse(JSON.stringify(patch)),{job_number:'draft notes'});
 E.driver.value='C';assert.equal(vm.runInContext("changedTransferPayload({driver:'C'}).driver",c),'C');
 console.log('PASS 1: board actions reconcile schedule fields, preserve notes, and saves omit unchanged fields.');
}
{
 let answers=[],prompts=0;const E={edit:field('a'),save:{disabled:false},slotStatusSave:{disabled:false},slotStatusNotes:field('draft status')};
 const c=context({E,statusNotesBaseline:'saved status',transferInfoBaseline:{job:'old'},transferInfoValues:()=>({job:'draft'}),confirm:()=>{prompts++;return answers.shift();},window:{}});
 load(c,'function transferInfoChanged','document.addEventListener("click",e=>{\n  const statusOpen');
 answers=[false];assert.equal(vm.runInContext('confirmEditorTransition()',c),false);assert.equal(prompts,1);
 answers=[true,false];assert.equal(vm.runInContext('confirmEditorTransition()',c),false);
 answers=[true,true];assert.equal(vm.runInContext('confirmEditorTransition()',c),true);
 E.save.disabled=true;assert.equal(vm.runInContext('confirmEditorTransition()',c),false);
 console.log('PASS 2: switching editors respects canceled discard decisions and pending saves.');
}
{
 const c=context({PX15:20,GRID_START:210,timeToMin:t=>Number(t.slice(0,2))*60+Number(t.slice(3,5)),dragGrabOffsetPx:0,boxLinks:{landing:(_key,raw)=>raw}});
 load(c,'function cardBaseTopPx','function candidateVisualTop');load(c,'function transferDragOffset','function transferLaneDragOver');
 c.jobs=[{id:'a',scheduled_time:'08:00',duration_minutes:60},{id:'b',scheduled_time:'08:00',duration_minutes:60}];
 const layout=vm.runInContext('layoutLaneCards(jobs)',c),stacked=layout[1];
 c.card={style:{top:String(stacked.top)},getBoundingClientRect:()=>({top:stacked.top,height:stacked.height})};c.job=c.jobs[1];c.y=stacked.top+20;
 vm.runInContext('dragGrabOffsetPx=transferDragOffset(job,card,y)',c);
 c.lane={getBoundingClientRect:()=>({top:0})};
 assert.equal(vm.runInContext('landingMinutes({clientY:y},lane,job)',c),480);
 assert.equal(vm.runInContext('landingMinutes({clientY:y+20},lane,job)',c),495);
 console.log('PASS 3: stacked drag preserves time at rest and changes exactly one slot after 20px.');
}
async function checkLinkedTies(){
 let jobs=[{id:'a',driver:'D',scheduled_date:'2026-11-17',scheduled_time:'08:00',duration_minutes:60},{id:'b',driver:'D',scheduled_date:'2026-11-17',scheduled_time:'08:00',duration_minutes:60},{id:'c',driver:'D',scheduled_date:'2026-11-17',scheduled_time:'09:30',duration_minutes:60}];
 let saved=JSON.stringify([{source_key:'job:a',target_key:'job:b'},{source_key:'job:b',target_key:'job:c'}]);
 const window={TransfersAccess:{can:()=>true},TransferChainVisual:{renderLinks(){}}};
 const c=context({window,localStorage:{getItem:()=>saved,setItem:(_k,v)=>saved=v},document:{}});
 vm.runInContext(fs.readFileSync(__dirname+'/board-links.js','utf8'),c);
 const links=window.createBoardLinks({sb:null,grid:{querySelectorAll:()=>[]},getDate:()=> '2026-11-17',getUser:()=>({id:'u'}),getJobs:()=>jobs,getStatuses:()=>[],start:210,end:1320,px:20,report(){},applyMove:r=>{jobs=jobs.map(j=>r.jobs.find(n=>n.id===j.id)||j)}});
 await links.refresh();assert(await links.resize('job:a',480,570));assert.equal(jobs[1].scheduled_time,'08:30');assert.equal(jobs[2].scheduled_time,'10:00');
 assert(await links.resize('job:a',480,540));assert.equal(jobs[1].scheduled_time,'08:00');assert.equal(jobs[2].scheduled_time,'09:30');
 console.log('PASS 4: same-start links and their downstream jobs follow grow/shrink.');
}
checkLinkedTies().catch(error=>{console.error(error);process.exitCode=1});
{
 const window={addEventListener(){}},document={addEventListener(){}};const queue=[];
 const c=context({window,document,queueMicrotask:fn=>queue.push(fn)});
 vm.runInContext(fs.readFileSync(__dirname+'/board-interaction.js','utf8'),c);
 const api=window.TransferBoardInteraction;let renders=0,cancels=0;
 api.begin('resize',()=>{cancels++;api.end('resize')});
 assert(api.defer('board',()=>renders++));assert(api.defer('board',()=>renders++));
 assert.equal(renders,0);api.cancel();while(queue.length)queue.shift()();
 assert.equal(cancels,1);assert.equal(renders,1);assert.equal(api.active,false);
 assert.equal(api.defer('board',()=>renders++),false);
 console.log('PASS 5: captured gestures defer and coalesce refreshes, then cancel and flush cleanly.');
}
{
 function target(){const events=new Map();return {addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name)=>events.delete(name),fire:(name,event)=>events.get(name)?.(event),setPointerCapture(){},releasePointerCapture(){},events};}
 const handle=target(),classes=new Set(),card={parentElement:{classList:{contains:()=>true},getBoundingClientRect:()=>({top:0})},classList:{add:n=>classes.add(n),remove:n=>classes.delete(n)},style:{},dataset:{}};
 const E={edit:field('a'),time:field('08:15'),duration:field('75')};let cancelGesture,released=0,renders=0;
 const window={TransfersAccess:{can:()=>true},TransferBoardInteraction:{begin:(_k,fn)=>cancelGesture=fn,end:()=>released++}};
 const c=context({E,window,transferInfoBaseline:{time:'08:00',duration:'60'},GRID_START:210,GRID_END:1320,PX15:20,ignoreClickUntil:0,timeToMin:t=>Number(t.slice(0,2))*60+Number(t.slice(3)),minToTime:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),fmt:t=>t,durationLabel:String,stopTransferAutoScroll(){},renderBoard:()=>renders++,boxLinks:{clearResizePreview(){},previewResize(){},resizeBounds:()=>({minEnd:210,maxEnd:1320})}});
 load(c,'function syncResizeForm','function syncBoardActionForm');load(c,'function beginTransferResize','async function resizeTransfer');
 c.ev={button:0,pointerId:1,currentTarget:handle,clientY:440,preventDefault(){},stopPropagation(){}};c.job={id:'a',scheduled_time:'08:00',duration_minutes:60};c.card=card;
 vm.runInContext("beginTransferResize(ev,job,card,'bottom')",c);
 handle.fire('pointermove',{pointerId:1,clientY:460,preventDefault(){}});assert.equal(E.duration.value,'75');
 cancelGesture();assert.equal(E.time.value,'08:15');assert.equal(E.duration.value,'75');assert.equal(c.transferInfoBaseline.time,'08:00');assert.equal(classes.has('resizing'),false);assert.equal(handle.events.size,0);assert.equal(released,1);assert.equal(renders,1);
 console.log('PASS 5b: interrupted job resize restores the prior draft without advancing its saved baseline.');
}
{
 const source=fs.readFileSync(__dirname+'/status-history.js','utf8'),c=context();
 load(c,'  function parseChange','  function graph(',source);
 const rows=[['Planned','Loading','13:00'],['Loading','Delivered','14:00'],['Delivered','Loading','15:00'],['Loading','Planned','15:30'],['Planned','Loading','16:00']].map(([from,to,time],i)=>({id:i+1,action:'Status changed',details:from+' → '+to,created_at:'2026-11-16T'+time+':00Z'}));
 c.rows=rows;c.transfer={created_at:'2026-11-16T12:00:00Z',order_status:'Loading'};
 const open=vm.runInContext('buildIntervals(transfer,rows)',c);
 assert.equal(open.markers.deliveredAt,null);assert.equal(open.markers.plannedAt.toISOString(),'2026-11-16T12:00:00.000Z');assert.equal(open.intervals.length,3);assert.equal(open.boundaryEvents.length,3);
 c.rows=[...rows,{id:6,action:'Status changed',details:'Loading → Delivered',created_at:'2026-11-16T17:00:00Z'}];c.transfer.order_status='Delivered';
 const done=vm.runInContext('buildIntervals(transfer,rows)',c);assert.equal(done.markers.deliveredAt.toISOString(),'2026-11-16T17:00:00.000Z');assert.equal(done.intervals.length,3);assert.equal(done.intervals[2].end.toISOString(),'2026-11-16T17:00:00.000Z');
 c.rows=[];c.transfer.order_status='Planned';assert.equal(vm.runInContext('buildIntervals(transfer,rows).intervals.length',c),0);
 console.log('PASS 6: reopened/replanned jobs retain all intervals; only the final delivery closes the timeline.');
}
