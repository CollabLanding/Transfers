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
 const partNotes=lines=>lines.flatMap(line=>(line.parts||[]).map(part=>String(part.number||"").trim())).filter(Boolean).join(" | ");
 function apply(lines){
  const previous=partNotes(saved||[]);
  const notes=$("job");
  if(lines.length||(previous&&notes.value===previous)){
   notes.value=partNotes(lines);
   notes.dispatchEvent(new Event("input",{bubbles:true}));
  }
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
 const printFooter="<footer class=\"packing-slip-footer\">\n <div class=\"packing-declared\"><div>Note: Where the rate is dependent on value, shippers are required to state specifically in writing the agreed or declared value of the property. The agreed or declared value of the property is hereby specifically stated by the shipper to be not exceeding: $ <span class=\"packing-blank packing-value\"></span></div><div>Per: <span class=\"packing-blank\"></span></div></div>\n <div class=\"packing-signatures\">\n  <div><div class=\"packing-sign-row\"><span>SHIPPER:</span><span class=\"packing-blank\"></span></div><div class=\"packing-sign-row\"><span>PER:</span><span class=\"packing-blank\"></span></div><div class=\"packing-sign-row\"><span>EMERGENCY RESPONSE TELEPHONE NUMBER:</span><span class=\"packing-blank\"></span></div></div>\n  <div><div class=\"packing-sign-row\"><span>CARRIER:</span><span class=\"packing-blank\"></span></div><div class=\"packing-sign-row\"><span>PER:</span><span class=\"packing-blank\"></span></div><div class=\"packing-sign-row\"><span>DATE:</span><span class=\"packing-blank\"></span></div></div>\n </div>\n <div class=\"packing-hazmat\">* Mark with “X” to designate Hazardous Material as defined in Title 49 of the Code of Federal Regulations. Monitored at all times the Hazardous Material is in transportation including storage incidental to transportation (1 72 604).</div>\n</footer>";

 function printFreightLines(lines){
  const rows=lines.flatMap(line=>line.parts.map((part,i)=>'<tr><td>'+(i===0?esc(line.pallets):'')+'</td><td><span class="freight-hm-box"></span></td><td>'+esc(part.number)+(part.pieces!=null?' — '+esc(part.pieces)+' pieces per pallet':'')+(i===0&&line.notes?'<br>'+esc(line.notes):'')+'</td><td></td><td></td><td></td></tr>'));
  while(rows.length<14)rows.push('<tr class="freight-empty"><td></td><td><span class="freight-hm-box"></span></td><td></td><td></td><td></td><td></td></tr>');
  return '<div class="packing-freight-layout"><table class="packing-freight-table"><colgroup><col style="width:8%"><col style="width:6%"><col style="width:50%"><col style="width:12%"><col style="width:14%"><col style="width:10%"></colgroup><thead><tr><th>No.<br>Pkgs.</th><th>*<br>HM</th><th>Description of Articles, Special Marks and Exceptions</th><th>UN<br>Number</th><th>Weight<br>(* Sub. to correction)</th><th>Class or Rate</th></tr></thead><tbody>'+rows.join('')+'</tbody><tfoot><tr><td>'+total(lines)+'</td><td></td><td colspan="4">Total pallets</td></tr></tfoot></table><aside class="packing-freight-terms"><p>Subject to Section 7 of conditions of applicable bill of lading, if this shipment is to be delivered to the consignee without recourse on the consignor, the consignor shall sign the following statement.</p><p>The carrier shall not make delivery of this shipment without payment of freight and all other lawful charges.</p><div class="freight-signature-line"></div><small>(Signature of Consignor)</small><p>FREIGHT PREPAID, except when box below is checked.</p><p><span class="freight-check"></span> Check box if charges are to be collect</p><div>Received $<span class="freight-write-line"></span></div><p>To apply in prepayment of the charges on the property described hereon.</p><div class="freight-signature-line"></div><small>Agent or Cashier</small><p class="freight-cod"><strong>COD Amt: $</strong><span class="freight-write-line"></span></p><strong>COD Remit to Address:</strong><div class="freight-address-lines"></div></aside></div>';
 }


 function printBolHeader(stop,route){
  const from=stopLocation(stop),to=$("destination")?.value||"";
  return '<header class="bol-header"><div class="bol-title">STRAIGHT BILL OF LADING – ORIGINAL – NOT NEGOTIABLE</div><div class="bol-received"><span>RECEIVED, subject to the classifications and tariffs in effect on the date of issue of this Original Bill of Lading.</span><strong>DATE:</strong><span class="bol-field bol-date">'+esc($("date").value)+'</span></div><div class="bol-carrier"><strong>AT:</strong><span class="bol-field">'+esc(from)+'</span><strong>Name of Carrier:</strong><span class="bol-field"></span></div><p class="bol-contract">The property described below, in apparent good order, except as noted (contents and condition of contents of packages unknown), marked, consigned, and destined as indicated below, which said carrier (the word carrier being understood throughout this contract as meaning any person or corporation in possession of the property under the contract) agrees to carry to its usual place of delivery at said destination, if on its route, otherwise to deliver to another carrier on the route to said destination. It is mutually agreed, as to each carrier of all or any of said property over all or any portion of said route to destination, and as to each party at any time interested in all or any of said property, that every service to be performed hereunder shall be subject to all the terms and conditions of the Uniform Domestic Straight Bill of Lading set forth (1) in the Uniform Freight Classification in effect on the date hereof, if this is a rail, or a rail-water shipment, or (2) in the applicable motor carrier classification or tariff if this is a motor carrier shipment. Shipper hereby certifies that he is familiar with all the terms and conditions of the said bill of lading, including those on the back thereof, set forth in the classification or tariff which governs the transportation of this shipment, and the said terms and conditions are hereby agreed to by the shipper and accepted for himself and his assigns.</p><div class="bol-addresses"><div class="bol-address"><div><strong>Consigned to:</strong><span class="bol-field">'+esc(to)+'</span></div><div><span>Street</span><span class="bol-field"></span></div><div><span>Destination</span><span class="bol-field"></span></div></div><div class="bol-address"><div><strong>From:</strong><span class="bol-field">'+esc(from)+'</span></div><div><span>Street</span><span class="bol-field"></span></div><div><span>Origin</span><span class="bol-field"></span></div></div></div><div class="bol-reference-row"><strong>Shippers Number:</strong><span class="bol-field"></span><strong>Customer Order #:</strong><span class="bol-field"></span><strong>ATC Booking #:</strong><span class="bol-field"></span></div><div class="bol-instructions"><strong>Special Instructions:</strong><span class="bol-field">'+esc($("job").value)+'</span></div><div class="bol-route"><strong>Route via:</strong><span class="bol-field">'+esc(route)+'</span></div></header>';
 }

 function printSlip(stop){
  try{
   const allLines=read(),lines=allLines.filter(line=>line.stop===stop);
   if(!lines.length)throw Error("Add a part number before printing the packing slip.");
   apply(allLines);
   const print=$("packingPrintSheet");
   const route=["origin","additionalStop","additionalStop2","destination"].map(id=>$(id)?.value).filter(x=>x&&!x.startsWith("__")).join(" → ");
   print.innerHTML=printBolHeader(stop,route)+printFreightLines(lines)+printFooter;
   document.body.classList.add("printing-packing-slip");
   try{window.print()}finally{document.body.classList.remove("printing-packing-slip")}
  }catch(e){error.textContent=e.message}
 };
 updateButton();
})();
