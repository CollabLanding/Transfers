/* Carrier invoice review. Recognition and file contents stay in the browser. */
(()=>{
'use strict';
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
function dates(text){
 const out=[];const rx=/\b(?:(\d{4})[-/](\d{1,2})[-/](\d{1,2})|(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4}))\b/g;let m;
 while((m=rx.exec(text))){let y=+(m[1]||m[6]),mo=+(m[2]||m[4]),d=+(m[3]||m[5]);if(y<100)y+=2000;const dt=new Date(Date.UTC(y,mo-1,d));if(y>=2000&&y<=2100&&dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d)out.push({date:`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`,index:m.index,length:m[0].length});}
 return out;
}
function matchDriver(text,drivers){
 const par=String(text).match(/\(([^)]+)\)/);const query=norm(par?par[1]:text);const has=(q,n)=>n&&(' '+q+' ').includes(' '+n+' ');
 const exact=drivers.filter(d=>[d.name,d.full_name].some(n=>norm(n)===query));if(exact.length===1)return exact[0].name;
 const candidates=drivers.filter(d=>[d.name,d.full_name].some(n=>has(query,norm(n))||has(query,norm(n).split(' ')[0])));
 return candidates.length===1?candidates[0].name:'';
}
function parse(text,drivers){
 const lines=String(text).replace(/\r/g,'').split('\n');const rows=[];let current=null;
 for(const raw of lines){const line=raw.trim();if(!line)continue;const ds=dates(line);
  if(ds.length){for(let i=0;i<ds.length;i++){const source=line.slice(ds[i].index,i+1<ds.length?ds[i+1].index:undefined);current={date:ds[i].date,driver:'',source};rows.push(current);}}
  else if(current&&!/^(?:subtotal|total|balance|amount due|invoice|page \d|terms|payment)/i.test(line)&&current.source.length<1500){current.source+=' '+line;}
 }
 for(const r of rows)r.driver=matchDriver(r.source,drivers);
 // Keep dated headers visible for review instead of silently discarding them.
 if(!rows.length&&String(text).trim())rows.push({date:'',driver:matchDriver(text,drivers),source:String(text).slice(0,1500)});
 return rows;
}
const minutes=s=>{if(!s)return null;const [h,m]=s.split(':').map(Number);return h*60+m;};
function hours(shift,gaps){
 if(!shift)return {scheduled:0,down:0,billable:0};const start=minutes(shift.start_time),end=minutes(shift.end_time);if(start===null||end===null)return {scheduled:0,down:0,billable:0};const span=(end-start+1440)%1440,b=start+span;
 const ranges=gaps.map(g=>[Math.max(start,g.start_minute),Math.min(b,g.end_minute)]).filter(r=>r[1]>r[0]).sort((a,b)=>a[0]-b[0]);let last=start,down=0;for(const [a,z] of ranges){down+=Math.max(0,z-Math.max(a,last));last=Math.max(last,z);}return {scheduled:span/60,down:down/60,billable:(span-down)/60};
}
function compare(rows,schedules,gaps,selected,start,end){
 const seen=new Map();rows.forEach(r=>{if(r.driver&&r.date)seen.set(r.driver+'|'+r.date,(seen.get(r.driver+'|'+r.date)||0)+1);});
 const billed=rows.map(r=>{const key=r.driver+'|'+r.date,s=schedules.find(x=>x.driver_name===r.driver&&x.schedule_date===r.date),h=hours(s,gaps.filter(x=>x.driver_name===r.driver&&x.schedule_date===r.date));let status='Verified',reason='Working shift found';
 if(!r.driver||!dates(r.date).length){status='Needs review';reason=!r.driver?'Driver not recognized':'Date not recognized';}
 else if(r.date<start||r.date>end){status='Needs review';reason='Outside selected date range';}
 else if(seen.get(key)>1){status='Needs review';reason='Duplicate driver/date charge';}
 else if(!h.billable){status='Unverified';reason=h.scheduled?'Entire shift is downtime':'No working shift recorded';}
 else if(h.down){status='Verified';reason='Shift found; review downtime deduction';}
 return {...r,...h,status,reason};});
 const missing=schedules.filter(s=>selected.includes(s.driver_name)&&s.schedule_date>=start&&s.schedule_date<=end&&!seen.has(s.driver_name+'|'+s.schedule_date)&&hours(s,[]).scheduled>0).map(s=>({...hours(s,gaps.filter(g=>g.driver_name===s.driver_name&&g.schedule_date===s.schedule_date)),date:s.schedule_date,driver:s.driver_name,status:'Not billed',reason:'Scheduled date missing from invoice',source:''}));
 return {billed,missing};
}
const core={dates,parse,matchDriver,hours,compare};if(typeof module!=='undefined'&&module.exports)module.exports=core;
if(typeof document==='undefined')return;
(async()=>{
 await window.TransfersAccess.ready;if(!window.TransfersAccess.can('driver_reports'))return;
 const $=id=>document.getElementById(id),button=$('invoicing');if(!button)return;
 const C=window.TRANSFERS_CONFIG||{};if(!C.supabaseUrl||!window.supabase)return;
 const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);
 let drivers=[],rows=[],result=null,busy=false,revision=0;
 const message=s=>{$('invoiceMsg').textContent=s;};
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function invalidate(){revision++;result=null;$('invoiceResults').replaceChildren();$('invoiceExport').disabled=true;}
 function setBusy(v){busy=v;['invoiceRead','invoiceCheck','invoiceParse','invoiceAdd','invoiceFile','invoiceText','invoiceStart','invoiceEnd'].forEach(id=>$(id).disabled=v);$('invoiceRows').querySelectorAll('input,select,button').forEach(n=>n.disabled=v);$('invoiceDrivers').querySelectorAll('input').forEach(n=>n.disabled=v);}
 function renderRows(){
 $('invoiceRows').innerHTML=rows.map((r,i)=>`<tr><td><input type="date" aria-label="Billed date ${i+1}" data-row="${i}" data-field="date" value="${escape(r.date)}"></td><td><select aria-label="Driver ${i+1}" data-row="${i}" data-field="driver"><option value="">Select driver</option>${drivers.map(d=>`<option value="${escape(d.name)}" ${d.name===r.driver?'selected':''}>${escape(d.name)}</option>`).join('')}</select></td><td class="invoice-source">${escape(r.source)}</td><td><button type="button" data-remove="${i}" aria-label="Remove billed row ${i+1}">×</button></td></tr>`).join('');
 }
 $('invoiceRows').onchange=e=>{const {row,field}=e.target.dataset;if(row!==undefined){rows[+row][field]=e.target.value;invalidate();}};
 $('invoiceRows').onclick=e=>{const b=e.target.closest('[data-remove]');if(b){rows.splice(+b.dataset.remove,1);invalidate();renderRows();}};
 function acceptText(text){$('invoiceText').value=text;rows=parse(text,drivers);invalidate();renderRows();const ds=rows.map(r=>r.date).filter(Boolean).sort();if(ds.length){$('invoiceStart').value=ds[0];$('invoiceEnd').value=ds.at(-1);}const matched=new Set(rows.map(r=>r.driver).filter(Boolean));$('invoiceDrivers').querySelectorAll('input').forEach(el=>el.checked=matched.has(el.value));message(`${rows.length} dated rows found. Review names, dates, and the invoice period, then Check Invoice.`);}
 $('invoiceParse').onclick=()=>acceptText($('invoiceText').value);
 $('invoiceAdd').onclick=()=>{rows.push({date:'',driver:'',source:'Manual entry'});invalidate();renderRows();};
 ['invoiceStart','invoiceEnd','invoiceDrivers','invoiceText','invoiceFile'].forEach(id=>$(id).addEventListener('input',invalidate));
 button.onclick=async()=>{
 $('invoiceModal').classList.remove('hidden');if(busy)return;message('Loading drivers…');
 try{const r=await sb.from('transfer_drivers').select('name,full_name').neq('name','Planning').order('name');if(r.error)throw r.error;drivers=r.data||[];if(!rows.length)$('invoiceDrivers').innerHTML=drivers.map(d=>`<label><input type="checkbox" value="${escape(d.name)}">${escape(d.name)}</label>`).join('');renderRows();message('Upload an invoice to begin.');}catch(e){message('Could not load drivers: '+e.message);}
 };
 const close=()=>{if(!busy)$('invoiceModal').classList.add('hidden');};$('invoiceClose').onclick=close;$('invoiceModal').addEventListener('click',e=>{if(e.target===$('invoiceModal'))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 const scriptPromises=new Map();function script(url,test){if(test())return Promise.resolve();if(!scriptPromises.has(url)){scriptPromises.set(url,new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=()=>test()?resolve():reject(new Error('Reader did not load'));s.onerror=()=>reject(new Error('Could not download the invoice reader. Check your connection and retry.'));document.head.append(s);}).catch(e=>{scriptPromises.delete(url);throw e;}));}return scriptPromises.get(url);}
 async function readerPdf(){if(!window.invoicePdf)window.invoicePdf=import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs').catch(e=>{window.invoicePdf=null;throw e;});const p=await window.invoicePdf;p.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';return p;}
 function pageText(items){const lines=[];for(const item of items){if(!item.str?.trim())continue;const y=item.transform[5];let line=lines.find(l=>Math.abs(l.y-y)<3);if(!line){line={y,items:[]};lines.push(line);}line.items.push(item);}return lines.sort((a,b)=>b.y-a.y).map(l=>l.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ')).join('\n');}
 $('invoiceRead').onclick=async()=>{
 const file=$('invoiceFile').files[0];if(!file){message('Choose a PDF or image first.');return;}if(file.size>25*1024*1024){message('Choose a file smaller than 25 MB.');return;}
 setBusy(true);invalidate();message('Reading invoice…');let worker=null,pdf=null;
 try{
 const ocr=async image=>{if(!worker){await script('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',()=>!!window.Tesseract);worker=await Tesseract.createWorker('eng',1,{logger:m=>{if(m.status)message('Reading invoice: '+m.status+(m.progress?' '+Math.round(m.progress*100)+'%':''));}});}return (await worker.recognize(image)).data.text;};
 let text='';if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
 const lib=await readerPdf();pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
 if(pdf.numPages>30)throw new Error('Please split invoices longer than 30 pages.');
 for(let n=1;n<=pdf.numPages;n++){message(`Reading page ${n} of ${pdf.numPages}…`);const page=await pdf.getPage(n);let txt=pageText((await page.getTextContent()).items);
 if(!dates(txt).length||!parse(txt,drivers).some(r=>r.driver)){const v=page.getViewport({scale:2}),canvas=document.createElement('canvas');if(v.width*v.height>20000000)throw new Error('PDF page is too large. Upload a smaller copy.');canvas.width=v.width;canvas.height=v.height;await page.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;txt=await ocr(canvas);canvas.width=canvas.height=0;}
 text+=txt+'\n';page.cleanup();}
 }else if(file.type.startsWith('image/'))text=await ocr(file);else throw new Error('Upload a PDF, PNG, JPEG, or WebP image.');
 if(!text.trim())throw new Error('No text was recognized. Try a clearer image or paste invoice text below.');acceptText(text);
 }catch(e){message('Could not read invoice: '+e.message);}finally{if(worker)await worker.terminate().catch(()=>{});if(pdf)await pdf.destroy().catch(()=>{});setBusy(false);}
 };
 async function allRows(table,columns,start,end){let out=[];for(let offset=0;;offset+=1000){const r=await sb.from(table).select(columns).gte('schedule_date',start).lte('schedule_date',end).order('schedule_date').order('driver_name').range(offset,offset+999);if(r.error)throw r.error;out.push(...r.data);if(r.data.length<1000)return out;}}
 function resultTable(title,list){return `<h3>${escape(title)} (${list.length})</h3>`+(list.length?`<div class="invoice-scroll"><table class="invoice-table"><thead><tr><th>Date</th><th>Driver</th><th>Scheduled hrs</th><th>Downtime hrs</th><th>Billable hrs</th><th>Result</th></tr></thead><tbody>${list.map(r=>`<tr><td>${escape(r.date||'Unknown')}</td><td>${escape(r.driver||'Unknown')}</td><td>${r.scheduled.toFixed(2)}</td><td>${r.down.toFixed(2)}</td><td>${r.billable.toFixed(2)}</td><td>${escape(r.reason)}</td></tr>`).join('')}</tbody></table></div>`:'<p>None</p>');}
 $('invoiceCheck').onclick=async()=>{
 const start=$('invoiceStart').value,end=$('invoiceEnd').value,selected=[...$('invoiceDrivers').querySelectorAll('input:checked')].map(el=>el.value);
 if(!rows.length){message('Read an invoice or add billed dates first.');return;}if(!start||!end||end<start){message('Choose a valid invoice period.');return;}if((new Date(end)-new Date(start))/86400000>366){message('Check up to one year at a time.');return;}
 invalidate();const token=revision;setBusy(true);message('Checking saved schedules and downtime…');
 try{const [schedules,gaps]=await Promise.all([allRows('driver_schedules','driver_name,schedule_date,start_time,end_time',start,end),allRows('driver_downtime','driver_name,schedule_date,start_minute,end_minute',start,end)]);if(token!==revision)return;result=compare(rows,schedules,gaps,selected,start,end);$('invoiceResults').innerHTML=resultTable('Verified dates',result.billed.filter(r=>r.status==='Verified'))+resultTable('Unverified dates',result.billed.filter(r=>r.status==='Unverified'))+resultTable('Needs review',result.billed.filter(r=>r.status==='Needs review'))+resultTable('Scheduled dates not billed',result.missing);$('invoiceExport').disabled=false;message('Comparison complete. Verified means a saved working shift exists; review downtime before approving payment.');}catch(e){message('Could not verify invoice: '+e.message);}finally{setBusy(false);}
 };
 $('invoiceExport').onclick=()=>{if(!result)return;const cell=v=>'"'+String(v??'').replace(/^[=+@\-]/,"'"+'$&').replace(/"/g,'""')+'"';const header=['Result','Date','Driver','Scheduled hours','Downtime hours','Billable hours','Details'];const lines=[header,...[...result.billed,...result.missing].map(r=>[r.status,r.date,r.driver,r.scheduled.toFixed(2),r.down.toFixed(2),r.billable.toFixed(2),r.reason])];const url=URL.createObjectURL(new Blob(['\ufeff'+lines.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='invoice-review.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 sb.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){rows=[];result=null;invalidate();$('invoiceText').value='';$('invoiceFile').value='';renderRows();$('invoiceModal').classList.add('hidden');}});
})();
})();
