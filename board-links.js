/* One shared link graph for job and status boxes. */
window.createBoardLinks=function({sb,grid,getDate,getUser,getJobs,getStatuses,applyMove,report,start,end,px}){
 const storageKey='transfers-board-links-v1';let edges=[],busy=false,ready=!sb,loadToken=0,cancelDrag=null;
 const mins=t=>{const [h,m]=t.split(':').map(Number);return h*60+m};
 function nodes(){return [...getJobs().map(r=>({key:'job:'+r.id,kind:'job',id:r.id,driver:r.driver,date:r.scheduled_date,start:mins(r.scheduled_time),end:mins(r.scheduled_time)+r.duration_minutes,row:r})),...getStatuses().map(r=>({key:'status:'+r.id,kind:'status',id:r.id,driver:r.driver,date:r.scheduled_date,start:r.start_minutes,end:r.end_minutes,row:r}))]}
 function keysFor(key){const ids=new Set([key]);let changed=true;while(changed){changed=false;for(const e of edges){if(ids.has(e.source_key)||ids.has(e.target_key)){for(const k of [e.source_key,e.target_key])if(!ids.has(k)){ids.add(k);changed=true}}}}return ids}
 function group(key){const ids=keysFor(key);return nodes().filter(n=>ids.has(n.key))}
 function landing(key,raw){const all=nodes(),anchor=all.find(n=>n.key===key),members=group(key);if(!anchor)return raw;return Math.max(start-Math.min(...members.map(n=>n.start-anchor.start)),Math.min(end-Math.max(...members.map(n=>n.end-anchor.start)),raw))}
 function localEdges(){try{return JSON.parse(localStorage.getItem(storageKey)||'null')}catch{return null}}
 async function refresh(){const token=++loadToken;try{if(sb){const r=await sb.from('board_box_links').select('id,source_key,target_key');if(r.error)throw r.error;if(token!==loadToken)return;edges=r.data||[]}else{edges=localEdges()||getJobs().filter(r=>r.linked_next_id).map(r=>({source_key:'job:'+r.id,target_key:'job:'+r.linked_next_id}));localStorage.setItem(storageKey,JSON.stringify(edges))}ready=true;render()}catch(e){report('Could not load box links: '+e.message,'error')}}
 async function link(source,target){
  if(busy||!ready)return;busy=true;
  try{if(sb){const r=await sb.rpc('set_board_box_link',{p_source:source,p_target:target});if(r.error)throw r.error}
   else{edges=target?[...edges,{source_key:source,target_key:target}]:edges.filter(e=>e.source_key!==source&&e.target_key!==source);localStorage.setItem(storageKey,JSON.stringify(edges))}
   await refresh();report(target?'Boxes linked. Drag either box to move the group.':'Box unlinked.','ok');
  }catch(e){report('Could not change link: '+e.message,'error')}finally{busy=false}
 }
 function canLink(source,target){if(!ready||source===target||keysFor(source).has(target))return false;const all=nodes(),s=all.find(n=>n.key===source),t=all.find(n=>n.key===target);return !!(s&&t&&s.driver===t.driver&&s.date===t.date)}
 async function move(key,driver,minute){
  if(busy)return false;if(!ready){report('Links are still loading. Try again in a moment.','error');return false}
  const all=nodes(),anchor=all.find(n=>n.key===key),members=group(key),ids=keysFor(key);if(!anchor)return false;
  if(members.length!==ids.size){report('A linked box is on another day. Refresh or unlink this box before moving.','error');return false}
  const delta=minute-anchor.start;
  if(members.some(n=>n.start+delta<start||n.end+delta>end)){report('All linked boxes must fit within the board hours.','error');return false}
  if(members.some(n=>n.kind==='status'&&all.some(o=>o.kind==='status'&&!ids.has(o.key)&&o.driver===driver&&o.date===anchor.date&&n.start+delta<o.end&&n.end+delta>o.start))){report('A linked status would overlap another status.','error');return false}
  busy=true;
  try{let result;if(sb){const r=await sb.rpc('move_board_link_group',{p_anchor:key,p_driver:driver,p_start:minute});if(r.error)throw r.error;result=r.data}
   else{const jobs=[],statuses=[];for(const n of members){const row={...n.row,driver,scheduled_date:anchor.date};if(n.kind==='job'){row.scheduled_time=String(Math.floor((n.start+delta)/60)).padStart(2,'0')+':'+String((n.start+delta)%60).padStart(2,'0');jobs.push(row)}else{row.start_minutes=n.start+delta;row.end_minutes=n.end+delta;statuses.push(row)}}result={jobs,statuses}}
   applyMove(result);report(members.length>1?'Linked boxes moved.':'Box moved.','ok');return true;
  }catch(e){report('Could not move boxes: '+e.message,'error');return false}finally{busy=false}
 }
 function clearPreview(){grid.querySelectorAll('.linked-box-preview').forEach(n=>n.remove());grid.querySelectorAll('.linked-box-dragging').forEach(n=>n.classList.remove('linked-box-dragging'))}
 function preview(key,lane,minute){clearPreview();const anchor=nodes().find(n=>n.key===key);if(!anchor)return;const delta=minute-anchor.start;for(const n of group(key)){const p=document.createElement('div');p.className='linked-box-preview';p.style.top=((n.start+delta-start)/15*px)+'px';p.style.height=((n.end-n.start)/15*px)+'px';p.textContent=n.kind==='status'?n.row.status:'Linked load';lane.append(p);for(const el of grid.querySelectorAll('[data-box-key]'))if(el.dataset.boxKey===n.key)el.classList.add('linked-box-dragging')}}
 function attach(box,key){
  box.dataset.boxKey=key;let handle=box.querySelector('.load-chain');if(handle)return;
  handle=document.createElement('button');handle.type='button';handle.className='load-chain';handle.draggable=false;
  handle.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  let suppressClick=0;
  handle.addEventListener('click',e=>{e.stopPropagation();if(Date.now()<suppressClick||busy)return;if(edges.some(l=>l.source_key===key||l.target_key===key))link(key,null)});
  handle.addEventListener('dragstart',e=>{e.preventDefault();e.stopPropagation()});
  handle.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;e.preventDefault();e.stopPropagation();if(busy||!ready||!getUser())return;
   cancelDrag?.();const pointer=e.pointerId,x=e.clientX,y=e.clientY;let dragging=false,target=null;
   handle.setPointerCapture(pointer);
   const find=ev=>{const el=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('[data-box-key]');return el&&canLink(key,el.dataset.boxKey)?el:null};
   const update=ev=>{if(ev.pointerId!==pointer)return;if(!dragging&&Math.hypot(ev.clientX-x,ev.clientY-y)<5)return;if(!dragging){dragging=true;window.TransferChainVisual.start(handle);handle.classList.add('link-dragging')}suppressClick=Date.now()+500;target?.classList.remove('link-target');target=find(ev);target?.classList.add('link-target');window.TransferChainVisual.move(ev.clientX,ev.clientY,target)};
   const cleanup=()=>{handle.removeEventListener('pointermove',update);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',cancel);handle.removeEventListener('lostpointercapture',cancel);window.removeEventListener('blur',cancel);document.removeEventListener('keydown',escape);if(handle.hasPointerCapture(pointer))handle.releasePointerCapture(pointer);target?.classList.remove('link-target');handle.classList.remove('link-dragging');cancelDrag=null;window.TransferChainVisual.stop()};
   const up=ev=>{if(ev.pointerId!==pointer)return;ev.preventDefault();ev.stopPropagation();const destination=dragging?find(ev):null;cleanup();if(dragging){suppressClick=Date.now()+500;if(destination)link(key,destination.dataset.boxKey)}};
   const cancel=()=>{if(dragging)suppressClick=Date.now()+500;cleanup()};const escape=ev=>{if(ev.key==='Escape')cancel()};cancelDrag=cancel;
   handle.addEventListener('pointermove',update);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',cancel);handle.addEventListener('lostpointercapture',cancel);window.addEventListener('blur',cancel);document.addEventListener('keydown',escape);
  });box.append(handle);
 }
 function render(){cancelDrag?.();for(const box of grid.querySelectorAll('.card,.slot-status-block')){const key=box.classList.contains('card')?'job:'+box.dataset.id:'status:'+box.dataset.statusId;attach(box,key);const h=box.querySelector('.load-chain'),linked=edges.some(e=>e.source_key===key||e.target_key===key);h.classList.toggle('is-linked',linked);h.setAttribute('aria-pressed',String(linked));h.title=linked?'Click to unlink this box; drag to link a box above or below':'Drag to link a box above or below';h.setAttribute('aria-label',h.title)}window.TransferChainVisual.renderLinks(grid,edges)}
 return {refresh,render,group,landing,move,preview,clearPreview,forget(key){edges=edges.filter(e=>e.source_key!==key&&e.target_key!==key);if(!sb)localStorage.setItem(storageKey,JSON.stringify(edges));else refresh();render()},reset(){cancelDrag?.();loadToken++;edges=[];ready=!sb;clearPreview();render()}};
};
