/* Shared status ranges; independent of transfer loading and drag/drop. */
window.createSlotStatuses = function ({sb, grid, getDate, getUser, report, start, end, px}) {
  const table = 'transfer_slot_statuses', key = 'transfers-slot-statuses-v1';
  const statuses = ['Driving', 'Yard Moves', 'Loading'];
  let rows = [], date = null, generation = 0, selection = null, busy = false, moving = null;
  const dialog = document.createElement('dialog');
  dialog.className = 'slot-status-dialog';
  dialog.setAttribute('aria-labelledby', 'slot-status-title');
  dialog.innerHTML = '<h2 id="slot-status-title">Assign a status</h2><p class="slot-status-range"></p><div class="slot-status-options"></div><p class="slot-status-error" role="alert"></p><button type="button" class="slot-status-cancel">Cancel</button>';
  document.body.append(dialog);
  const time = m => (Math.floor(m / 60) % 12 || 12) + ':' + String(m % 60).padStart(2, '0') + (m >= 720 ? ' PM' : ' AM');
  function clear() {
    selection = null;
    grid.querySelectorAll('.slot-selection').forEach(n => n.remove());
  }
  function close() { if (busy) return; dialog.close(); clear(); }
  dialog.querySelector('.slot-status-cancel').onclick = close;
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  function localRows() { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
  function paint() {
    grid.querySelectorAll('.slot-status-block,.slot-status-delete').forEach(n => n.remove());
    for (const lane of grid.querySelectorAll('.lane')) {
      for (const row of rows.filter(r => r.driver === lane.dataset.driver && r.scheduled_date === getDate())) {
        const block = document.createElement('div');
        block.className = 'slot-status-block slot-status-' + statuses.indexOf(row.status);
        block.draggable = true; block.dataset.statusId = row.id;
        block.addEventListener('dragstart', e => {
          if (busy || dialog.open || !getUser()) { e.preventDefault(); return; }
          e.stopPropagation(); clear();
          moving = {row, date:getDate(), offset:Math.max(0,e.clientY-block.getBoundingClientRect().top)};
          e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('application/x-slot-status',row.id);
          block.classList.add('slot-status-dragging');
        });
        block.addEventListener('dragend', endMove);
        block.style.top = ((row.start_minutes - start) / 15 * px) + 'px';
        block.style.height = ((row.end_minutes - row.start_minutes) / 15 * px) + 'px';
        block.title = row.status + ': ' + time(row.start_minutes) + ' – ' + time(row.end_minutes);
        const label = document.createElement('span'); label.textContent = row.status;
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'slot-status-delete'; remove.textContent = '×';
        remove.setAttribute('aria-label', 'Delete ' + block.title);
        remove.style.top = ((row.start_minutes - start) / 15 * px + 1) + 'px';
        remove.onclick = async e => {
          e.stopPropagation(); remove.disabled = true; block.remove(); remove.remove();
          try {
            if (sb) { const r = await sb.from(table).delete().eq('id', row.id); if (r.error) throw r.error; }
            else localStorage.setItem(key, JSON.stringify(localRows().filter(r => r.id !== row.id)));
            rows = rows.filter(r => r.id !== row.id);
          } catch (error) { report('Could not delete status: ' + error.message, 'error'); }
          paint();
        };
        block.append(label); lane.append(block, remove);
      }
    }
  }
  function clearMovePreview() { grid.querySelectorAll('.slot-status-move-preview').forEach(n=>n.remove()); }
  function endMove() { moving=null; clearMovePreview(); grid.querySelectorAll('.slot-status-dragging').forEach(n=>n.classList.remove('slot-status-dragging')); }
  function movePosition(e,lane) {
    const duration=moving.row.end_minutes-moving.row.start_minutes;
    const raw=start+Math.round((e.clientY-lane.getBoundingClientRect().top-moving.offset)/px)*15;
    const begin=Math.max(start,Math.min(end-duration,raw));
    return {driver:lane.dataset.driver,scheduled_date:getDate(),start_minutes:begin,end_minutes:begin+duration};
  }
  function overlap(payload,id) { return rows.some(r=>r.id!==id&&r.driver===payload.driver&&r.scheduled_date===payload.scheduled_date&&r.start_minutes<payload.end_minutes&&r.end_minutes>payload.start_minutes); }
  grid.addEventListener('dragover',e=>{
    if(!moving)return; e.preventDefault();e.stopPropagation();clearMovePreview();
    const lane=e.target.closest('.lane');if(!lane||moving.date!==getDate())return;
    const payload=movePosition(e,lane),blocked=overlap(payload,moving.row.id);
    e.dataTransfer.dropEffect=blocked?'none':'move';
    const preview=document.createElement('div');preview.className='slot-status-move-preview'+(blocked?' is-blocked':'');
    preview.style.top=((payload.start_minutes-start)/15*px)+'px';preview.style.height=((payload.end_minutes-payload.start_minutes)/15*px)+'px';
    preview.textContent=moving.row.status+' · '+time(payload.start_minutes)+' – '+time(payload.end_minutes);lane.append(preview);
  },true);
  grid.addEventListener('dragleave',e=>{if(moving&&!grid.contains(e.relatedTarget))clearMovePreview();});
  grid.addEventListener('drop',async e=>{
    if(!moving)return;e.preventDefault();e.stopPropagation();
    const lane=e.target.closest('.lane');if(!lane||moving.date!==getDate()){endMove();return;}
    const row=moving.row,payload=movePosition(e,lane);endMove();
    if(overlap(payload,row.id)){report('That time overlaps another status. Choose an open range.','error');return;}
    if(payload.driver===row.driver&&payload.start_minutes===row.start_minutes)return;
    busy=true;
    try{
      if(sb){const r=await sb.from(table).update(payload).eq('id',row.id).select('id').single();if(r.error)throw r.error;}
      else localStorage.setItem(key,JSON.stringify(localRows().map(r=>r.id===row.id?{...r,...payload}:r)));
      await refresh();report('Status moved.','ok');
    }catch(error){report('Could not move status: '+error.message,'error');paint();}
    finally{busy=false;}
  },true);
  async function refresh() {
    const requestedDate = getDate(), token = ++generation;
    date = requestedDate;
    try {
      const r = sb ? await sb.from(table).select('*').eq('scheduled_date', requestedDate) : {data: localRows().filter(r => r.scheduled_date === requestedDate)};
      if (token !== generation || requestedDate !== getDate()) return;
      if (r.error) throw r.error;
      rows = r.data || []; paint();
    } catch (error) { if (token === generation) report('Could not load slot statuses: ' + error.message, 'error'); }
  }
  function bounds(s) { return {start_minutes: Math.min(s.anchor, s.last), end_minutes: Math.max(s.anchor, s.last) + 15}; }
  function preview() {
    grid.querySelectorAll('.slot-selection').forEach(n => n.remove());
    if (!selection) return;
    const b = bounds(selection), node = document.createElement('div');
    node.className = 'slot-selection'; node.style.top = ((b.start_minutes - start) / 15 * px) + 'px';
    node.style.height = ((b.end_minutes - b.start_minutes) / 15 * px) + 'px';
    node.textContent = time(b.start_minutes) + ' – ' + time(b.end_minutes);
    selection.lane.append(node);
  }
  function minute(e, lane) { return Math.max(start, Math.min(end - 15, start + Math.floor((e.clientY - lane.getBoundingClientRect().top) / px) * 15)); }
  grid.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.isPrimary === false || dialog.open || busy || !getUser()) return;
    const lane = e.target.closest('.lane');
    if (!lane || e.target.closest('.card,.slot-status-block,button,input,select')) return;
    clear(); const anchor = minute(e, lane);
    selection = {lane, driver: lane.dataset.driver, date: getDate(), anchor, last: anchor, pointer: e.pointerId};
    grid.setPointerCapture(e.pointerId); e.preventDefault(); preview();
  });
  grid.addEventListener('pointermove', e => {
    if (!selection || selection.pointer !== e.pointerId || dialog.open) return;
    selection.last = minute(e, selection.lane); preview();
  });
  grid.addEventListener('pointerup', e => {
    if (!selection || selection.pointer !== e.pointerId) return;
    selection.last = minute(e, selection.lane);
    if (grid.hasPointerCapture(e.pointerId)) grid.releasePointerCapture(e.pointerId);
    const b = bounds(selection);
    if (b.end_minutes - b.start_minutes < 30) { clear(); return; }
    preview();
    dialog.querySelector('.slot-status-range').textContent = selection.driver + ' · ' + time(b.start_minutes) + ' – ' + time(b.end_minutes);
    dialog.querySelector('.slot-status-error').textContent = '';
    dialog.showModal();
  });
  grid.addEventListener('pointercancel', clear);
  window.addEventListener('blur', () => { if (!dialog.open) clear(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dialog.open) clear(); });
  for (const status of statuses) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = status;
    button.onclick = async () => {
      if (!selection || busy) return;
      const b = bounds(selection), payload = {driver: selection.driver, scheduled_date: selection.date, ...b, status, created_by: getUser()?.id};
      if (rows.some(r => r.driver === payload.driver && r.scheduled_date === payload.scheduled_date && r.start_minutes < b.end_minutes && r.end_minutes > b.start_minutes)) {
        dialog.querySelector('.slot-status-error').textContent = 'This selection overlaps an existing status. Delete that status first.'; return;
      }
      busy = true; dialog.querySelectorAll('button').forEach(n => n.disabled = true);
      try {
        if (sb) { const r = await sb.from(table).insert(payload); if (r.error) throw r.error; }
        else localStorage.setItem(key, JSON.stringify([...localRows(), {...payload, id: crypto.randomUUID()}]));
        busy = false; close(); await refresh();
      } catch (error) { dialog.querySelector('.slot-status-error').textContent = 'Could not save status: ' + error.message; }
      finally { busy = false; dialog.querySelectorAll('button').forEach(n => n.disabled = false); }
    };
    dialog.querySelector('.slot-status-options').append(button);
  }
  return {
    render() {
      if (selection && (!selection.lane.isConnected || selection.date !== getDate())) { if (!busy) close(); }
      if (date !== getDate()) { rows = []; refresh(); }
      paint();
    },
    refresh,
    reset() { endMove(); generation++; rows = []; date = null; close(); paint(); }
  };
};
