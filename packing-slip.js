(()=>{
 const $=id=>document.getElementById(id), modal=$("packingSlip"), list=$("packingLines"), error=$("packingError");
 let saved=null, legacy=0;
 const copy=value=>JSON.parse(JSON.stringify(value));
 const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const total=lines=>lines.reduce((sum,line)=>sum+line.pallets,0);
 function updateButton(){
  const n=saved?.length?total(saved):legacy;
  $("pallet").value=String(n);$("packingTotal").textContent=n+" pallets";
 }
 window.PackingSlip={load(lines,count=0){saved=Array.isArray(lines)&&lines.length?copy(lines):null;legacy=Number(count)||0;updateButton()},value:()=>saved?copy(saved):null};
 function addPart(group,part={}){
  const row=document.createElement("div");row.className="packing-part";
  row.innerHTML='<label>Part number<input class="packing-number" maxlength="120" value="'+esc(part.number)+'"></label><label>Pieces per pallet<input class="packing-pieces" type="text" maxlength="20" value="'+esc(part.pieces)+'"></label><button type="button" aria-label="Remove part">×</button>';
  if(!group.children.length){
   const label=document.createElement("label");label.className="packing-pallets";
   label.innerHTML='Pallets<input class="packing-count" type="number" min="1" max="999" step="1" required value="'+esc(group.closest(".packing-line").dataset.pallets)+'">';
   row.insertBefore(label,row.querySelector("button"));
  }
  row.querySelector("button").onclick=()=>{
   if(group.children.length>1){
    const count=row.querySelector(".packing-pallets"),next=row.nextElementSibling;
    if(count&&next)next.insertBefore(count,next.querySelector("button"));
    row.remove();
   }else row.querySelectorAll(".packing-number,.packing-pieces").forEach(i=>i.value="");
   refresh();
  };
  group.append(row);
 }
 function addLine(line={},target=list.querySelector(".packing-stop-lines")){
  const block=document.createElement("section");block.className="packing-line";block.dataset.pallets=String(line.pallets??1);block.dataset.stop=target.dataset.stop;
  block.innerHTML='<div class="packing-line-head"><strong class="packing-line-title"></strong><button type="button" class="packing-remove">Remove line</button></div><div class="packing-parts"></div><button type="button" class="packing-add-part">Add Part</button><label>Line notes<input class="packing-notes" maxlength="500" value="'+esc(line.notes)+'"></label>';
  const parts=block.querySelector(".packing-parts");
  for(const part of line.parts?.length?line.parts:[{}])addPart(parts,part);
  block.querySelector(".packing-add-part").onclick=()=>{if(parts.children.length<30){addPart(parts);parts.lastElementChild.querySelector("input").focus()}};
  block.querySelector(".packing-remove").onclick=()=>{block.remove();refresh()};
  target.append(block);refresh();
 }
 function refresh(){
  let n=0;[...list.querySelectorAll(".packing-line")].forEach((line)=>{line.querySelector(".packing-line-title").textContent="Line "+([...line.parentElement.children].indexOf(line)+1);if([...line.querySelectorAll(".packing-number")].some(input=>input.value.trim()))n+=Number(line.querySelector(".packing-count").value)||0});
  for(const section of list.querySelectorAll(".packing-stop")){
   const n=[...section.querySelectorAll(".packing-line")].reduce((sum,line)=>sum+([...line.querySelectorAll(".packing-number")].some(input=>input.value.trim())?Number(line.querySelector(".packing-count").value)||0:0),0);
   section.querySelector(".packing-stop-total").textContent=n+" pallets";
  }
  $("packingDraftTotal").textContent="Total: "+(n||(!saved?legacy:0))+" pallets";
  error.textContent="";
 }
 function read(){
  const lines=[];
  for(const block of list.querySelectorAll(".packing-line")){
   const parts=[];
   for(const row of block.querySelectorAll(".packing-part")){
    const number=row.querySelector(".packing-number").value.trim(),field=row.querySelector(".packing-pieces");
    if(!number&&!field.value)continue;
    const pieces=field.value.trim().replace(/[–—]/g,"-").replace(/\s*-\s*/g,"-");
    if(!number)throw Error("Enter a part number on each filled part row.");
    if(pieces&&(!/^[1-9][0-9]{0,5}(-[1-9][0-9]{0,5})?$/.test(pieces)||(pieces.includes("-")&&Number(pieces.split("-")[0])>Number(pieces.split("-")[1]))))throw Error("Pieces per pallet must be a count or a range, such as 2000 or 10-20.");
    parts.push({number,pieces:pieces?(pieces.includes("-")?pieces:Number(pieces)):null});
   }
   const notes=block.querySelector(".packing-notes").value.trim();
   if(!parts.length){if(notes)throw Error("Enter a part number for the line with notes.");continue;}
   const count=block.querySelector(".packing-count");
   if(!count.checkValidity())throw Error("Enter 1 to 999 pallets for each filled line.");
   lines.push({pallets:Number(count.value),parts,notes,stop:Number(block.dataset.stop||0)});
  }
  if(lines.length>100)throw Error("Use no more than 100 pallet lines across all stops.");
  if(total(lines)>999)throw Error("The packing slip cannot exceed 999 pallets.");
  return lines;
 }
 const stopLocation=stop=>$(["origin","additionalStop","additionalStop2"][stop])?.value||"";
 const stopTitle=stop=>(stop?"Additional Stop "+stop:"Load Origin")+(stopLocation(stop)?" — "+stopLocation(stop):"");
 $("openPackingSlip").onclick=()=>{
  list.replaceChildren();
  for(let stop=0;stop<=2;stop++){
   if(stop&&!stopLocation(stop)&&!saved?.some(line=>(line.stop||0)===stop))continue;
   const section=document.createElement("section");section.className="packing-stop";
   const head=document.createElement("div");head.className="packing-line-head";
   const title=document.createElement("h3");title.textContent=stopTitle(stop);
   const print=document.createElement("button");print.type="button";print.textContent="Print / Save PDF";print.onclick=()=>printSlip(stop);
   const subtotal=document.createElement("strong");subtotal.className="packing-stop-total";
   head.append(title,subtotal,print);
   const lines=document.createElement("div");lines.className="packing-stop-lines";lines.dataset.stop=String(stop);
   const add=document.createElement("button");add.type="button";add.textContent="Add Line";
   add.onclick=()=>{if(list.querySelectorAll(".packing-line").length<100){addLine({},lines);lines.lastElementChild.querySelector(".packing-number").focus()}};
   section.append(head,lines,add);list.append(section);
   const existing=saved?.filter(line=>(line.stop||0)===stop)||[];
   if(existing.length)for(const line of existing)addLine(line,lines);else addLine({},lines);
  }
  refresh();modal.showModal();
 };
 $("packingCancel").onclick=()=>modal.close();

 list.addEventListener("input",refresh);
 function apply(lines){
  if(!lines.length&&saved)legacy=0;
  saved=lines.length?copy(lines):null;
  updateButton();
 }
 function finish(){
  try{apply(read());modal.close()}catch(e){error.textContent=e.message}
 }
 $("packingDone").onclick=()=>{
  try{
   apply(read());
   modal.close();
   if($("editId").value)$("form").requestSubmit($("save"));
  }catch(e){error.textContent=e.message}
 };
 $("packingClose").onclick=finish;
 modal.addEventListener("cancel",event=>{event.preventDefault();finish()});
 function printSlip(stop){
  try{
   const allLines=read(),lines=allLines.filter(line=>line.stop===stop);
   if(!lines.length)throw Error("Add a part number before printing the packing slip.");
   apply(allLines);
   const print=$("packingPrintSheet");
   const route=["origin","additionalStop","additionalStop2","destination"].map(id=>$(id)?.value).filter(x=>x&&!x.startsWith("__")).join(" → ");
   print.innerHTML='<h1>Packing Slip</h1><h2>'+esc(stopTitle(stop))+'</h2><p><strong>Schedule:</strong> '+esc($("date").value)+' '+esc($("time").value)+'</p><p><strong>Route:</strong> '+esc(route)+'</p><p><strong>Driver:</strong> '+esc($("driver").value)+'</p><p><strong>Notes:</strong> '+esc($("job").value)+'</p><p><strong>Total pallets:</strong> '+total(lines)+'</p>'+lines.map((line,i)=>'<section><h2>Line '+(i+1)+' — '+line.pallets+' pallet'+(line.pallets===1?'':'s')+'</h2><table><thead><tr><th>Part number</th><th>Pieces per pallet</th></tr></thead><tbody>'+line.parts.map(part=>'<tr><td>'+esc(part.number)+'</td><td>'+esc(part.pieces??'—')+'</td></tr>').join("")+'</tbody></table>'+(line.notes?'<p><strong>Notes:</strong> '+esc(line.notes)+'</p>':'')+'</section>').join("");
   document.body.classList.add("printing-packing-slip");
   try{window.print()}finally{document.body.classList.remove("printing-packing-slip")}
  }catch(e){error.textContent=e.message}
 };
 updateButton();
})();
