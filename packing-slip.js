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
  row.innerHTML='<label>Part number<input class="packing-number" maxlength="120" value="'+esc(part.number)+'"></label><label>Pieces per pallet<input class="packing-pieces" type="number" min="1" max="999999" step="1" value="'+esc(part.pieces)+'"></label><button type="button" aria-label="Remove part">×</button>';
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
 function addLine(line={}){
  const block=document.createElement("section");block.className="packing-line";block.dataset.pallets=String(line.pallets??1);
  block.innerHTML='<div class="packing-line-head"><strong class="packing-line-title"></strong><button type="button" class="packing-remove">Remove line</button></div><div class="packing-parts"></div><button type="button" class="packing-add-part">Add Part</button><label>Line notes<input class="packing-notes" maxlength="500" value="'+esc(line.notes)+'"></label>';
  const parts=block.querySelector(".packing-parts");
  for(const part of line.parts?.length?line.parts:[{}])addPart(parts,part);
  block.querySelector(".packing-add-part").onclick=()=>{if(parts.children.length<30){addPart(parts);parts.lastElementChild.querySelector("input").focus()}};
  block.querySelector(".packing-remove").onclick=()=>{block.remove();refresh()};
  list.append(block);refresh();
 }
 function refresh(){
  let n=0;[...list.children].forEach((line,i)=>{line.querySelector(".packing-line-title").textContent="Line "+(i+1);if([...line.querySelectorAll(".packing-number")].some(input=>input.value.trim()))n+=Number(line.querySelector(".packing-count").value)||0});
  $("packingDraftTotal").textContent="Total: "+(n||(!saved?legacy:0))+" pallets";
  error.textContent="";
 }
 function read(){
  const lines=[];
  for(const block of list.children){
   const parts=[];
   for(const row of block.querySelectorAll(".packing-part")){
    const number=row.querySelector(".packing-number").value.trim(),field=row.querySelector(".packing-pieces");
    if(!number&&!field.value)continue;
    if(!number||!field.checkValidity())throw Error("Enter a part number and a valid pieces count on each filled part row.");
    parts.push({number,pieces:field.value?Number(field.value):null});
   }
   const notes=block.querySelector(".packing-notes").value.trim();
   if(!parts.length){if(notes)throw Error("Enter a part number for the line with notes.");continue;}
   const count=block.querySelector(".packing-count");
   if(!count.checkValidity())throw Error("Enter 1 to 999 pallets for each filled line.");
   lines.push({pallets:Number(count.value),parts,notes});
  }
  if(total(lines)>999)throw Error("The packing slip cannot exceed 999 pallets.");
  return lines;
 }
 $("openPackingSlip").onclick=()=>{list.replaceChildren();if(saved)for(const line of saved)addLine(line);else addLine();refresh();modal.showModal()};
 $("packingAddLine").onclick=()=>{if(list.children.length<100){addLine();list.lastElementChild.querySelector(".packing-number").focus()}};
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
 $("packingPrint").onclick=()=>{
  try{
   const lines=read();
   if(!lines.length)throw Error("Add a part number before printing the packing slip.");
   apply(lines);
   const print=$("packingPrintSheet");
   const route=["origin","additionalStop","additionalStop2","destination"].map(id=>$(id)?.value).filter(x=>x&&!x.startsWith("__")).join(" → ");
   print.innerHTML='<h1>Packing Slip</h1><p><strong>Schedule:</strong> '+esc($("date").value)+' '+esc($("time").value)+'</p><p><strong>Route:</strong> '+esc(route)+'</p><p><strong>Driver:</strong> '+esc($("driver").value)+'</p><p><strong>Notes:</strong> '+esc($("job").value)+'</p><p><strong>Total pallets:</strong> '+total(lines)+'</p>'+lines.map((line,i)=>'<section><h2>Line '+(i+1)+' — '+line.pallets+' pallet'+(line.pallets===1?'':'s')+'</h2><table><thead><tr><th>Part number</th><th>Pieces per pallet</th></tr></thead><tbody>'+line.parts.map(part=>'<tr><td>'+esc(part.number)+'</td><td>'+esc(part.pieces??'—')+'</td></tr>').join("")+'</tbody></table>'+(line.notes?'<p><strong>Notes:</strong> '+esc(line.notes)+'</p>':'')+'</section>').join("");
   document.body.classList.add("printing-packing-slip");
   try{window.print()}finally{document.body.classList.remove("printing-packing-slip")}
  }catch(e){error.textContent=e.message}
 };
 updateButton();
})();
