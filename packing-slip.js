(()=>{
 const $=id=>document.getElementById(id),modal=$("packingSlip"),list=$("packingLines"),error=$("packingError");
 let saved=null,legacy=0;
 const copy=v=>JSON.parse(JSON.stringify(v));
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const total=lines=>lines.reduce((sum,line)=>sum+Number(line.pallets||0),0);
 const partNotes=lines=>lines.flatMap(line=>(line.parts||[]).map(part=>part.number)).filter(Boolean).join(" | ");
 const stopLocation=stop=>$(["origin","additionalStop","additionalStop2"][stop])?.value||"";
 const stopTitle=stop=>(stop?"Additional Stop "+stop:"Load Origin")+(stopLocation(stop)?" — "+stopLocation(stop):"");
 const route=()=>["origin","additionalStop","additionalStop2","destination"].map(id=>$(id)?.value).filter(x=>x&&!x.startsWith("__")).join(" → ");
 function updateButton(){const n=saved?.length?total(saved):legacy;$("pallet").value=String(n);$("packingTotal").textContent=n+" pallets"}
 window.PackingSlip={load(lines,count=0){saved=Array.isArray(lines)&&lines.length?copy(lines):null;legacy=Number(count)||0;updateButton()},value:()=>saved?copy(saved):null};
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


 function valueInput(className,value,label,extra=""){
  return '<input class="'+className+'" aria-label="'+esc(label)+'" value="'+esc(value)+'" '+extra+'>';
 }
 function addPart(group,part={}){
  const first=!group.querySelector(".packing-part");
  const row=document.createElement("tr");row.className="packing-part";
  row.innerHTML='<td>'+(first?valueInput("packing-count",group.dataset.pallets,"Pallets",'type="number" min="1" max="999" step="1" required'):'')+'</td>'+
   '<td><input type="checkbox" class="packing-hm" aria-label="Hazardous material" '+(part.hm?'checked':'')+'></td>'+
   '<td><div class="bol-description">'+valueInput("packing-number",part.number,"Part number",'maxlength="120" placeholder="Part number"')+
   '<div class="bol-pieces"><span>Pieces per pallet:</span>'+valueInput("packing-pieces",part.pieces,"Pieces per pallet",'maxlength="20" placeholder="Count or range"')+'</div></div><button type="button" class="bol-editor-control packing-remove-part" aria-label="Remove part">×</button></td>'+
   '<td>'+valueInput("packing-un",part.un,"UN Number",'maxlength="80"')+'</td>'+
   '<td>'+valueInput("packing-weight",part.weight,"Weight",'maxlength="80"')+'</td>'+
   '<td>'+valueInput("packing-rate",part.rate,"Class or Rate",'maxlength="80"')+'</td>';
  row.querySelector(".packing-remove-part").onclick=()=>{
   if(group.querySelectorAll(".packing-part").length>1){
    const count=row.querySelector(".packing-count");
    if(count){const next=row.nextElementSibling;if(next?.classList.contains("packing-part"))next.firstElementChild.append(count)}
    row.remove();
   }else{
    row.querySelectorAll("input:not(.packing-count)").forEach(input=>{if(input.type==="checkbox")input.checked=false;else input.value=""});
   }
   refresh();
  };
  group.insertBefore(row,group.querySelector(".bol-line-actions"));
 }
 function addLine(line={},table){
  const group=document.createElement("tbody");group.className="packing-line";group.dataset.pallets=String(line.pallets||1);
  group.innerHTML='<tr class="bol-line-actions"><td></td><td></td><td colspan="4"><label>Line notes '+valueInput("packing-notes",line.notes,"Line notes",'maxlength="500"')+'</label><div class="bol-editor-control bol-row-actions"><button type="button" class="packing-add-part">Add Part</button><button type="button" class="packing-remove">Remove Line</button></div></td></tr>';
  for(const part of line.parts?.length?line.parts:[{}])addPart(group,part);
  group.querySelector(".packing-add-part").onclick=()=>{if(group.querySelectorAll(".packing-part").length<30)addPart(group)};
  group.querySelector(".packing-remove").onclick=()=>{group.remove();refresh()};
  table.insertBefore(group,table.querySelector(".bol-pad")||table.querySelector("tfoot"));refresh();
 }
 const bolFields=section=>[...section.querySelectorAll("[data-bol-field]")];
 function readBol(section){
  return Object.fromEntries(bolFields(section).map(el=>[el.dataset.bolField,el.type==="checkbox"?el.checked:el.textContent.trim()]));
 }
 function prepareFields(section,values){
  const paper=section.querySelector(".bol-paper");
  paper.querySelectorAll(".bol-field,.packing-blank,.freight-signature-line,.freight-write-line,.freight-address-lines,.freight-check").forEach((original,i)=>{
   const key="f"+i;
   if(original.classList.contains("freight-check")){
    const check=document.createElement("input");check.type="checkbox";check.className="freight-check";check.dataset.bolField=key;check.setAttribute("aria-label","Freight charges collect");check.checked=Boolean(values?.[key]);original.replaceWith(check);
   }else{
    original.dataset.bolField=key;original.contentEditable="plaintext-only";original.setAttribute("role","textbox");
    original.setAttribute("aria-label",original.previousElementSibling?.textContent?.trim()||"BOL field "+(i+1));
    if(values&&Object.hasOwn(values,key))original.textContent=String(values[key]??"");
   }
  });
  section.dataset.baseline=JSON.stringify(readBol(section));
 }
 function refresh(){
  let sum=0;
  for(const section of list.querySelectorAll(".packing-stop")){
   let n=0;
   for(const group of section.querySelectorAll(".packing-line")){
    if([...group.querySelectorAll(".packing-number")].some(input=>input.value.trim()))n+=Number(group.querySelector(".packing-count")?.value)||0;
   }
   sum+=n;section.querySelector(".packing-stop-total").textContent=n+" pallets";
   section.querySelector(".bol-total").textContent=String(n);
   const table=section.querySelector(".packing-freight-table");
   table.querySelector(".bol-pad")?.remove();
   const pad=document.createElement("tbody");pad.className="bol-pad";
   for(let i=table.querySelectorAll(".packing-part").length;i<14;i++){
    const row=document.createElement("tr");row.innerHTML="<td></td><td></td><td></td><td></td><td></td><td></td>";
    row.title="Click to add a pallet line";row.onclick=()=>{if(list.querySelectorAll(".packing-line").length<100){addLine({},table);table.querySelectorAll(".packing-number").item(table.querySelectorAll(".packing-number").length-1)?.focus()}};
    pad.append(row);
   }
   table.insertBefore(pad,table.querySelector("tfoot"));
  }
  $("packingDraftTotal").textContent="Total: "+(sum||(!saved?legacy:0))+" pallets";error.textContent="";
 }
 function read(){
  const lines=[];
  for(const section of list.querySelectorAll(".packing-stop")){
   const stop=Number(section.dataset.stop),bol=readBol(section),stopLines=[];
   if(Object.values(bol).some(value=>typeof value==="string"&&value.length>2000))throw Error("Keep each BOL field under 2,000 characters.");
   for(const group of section.querySelectorAll(".packing-line")){
    const parts=[];
    for(const row of group.querySelectorAll(".packing-part")){
     const number=row.querySelector(".packing-number").value.trim(),raw=row.querySelector(".packing-pieces").value.trim();
     const pieces=raw.replace(/[–—]/g,"-").replace(/\s*-\s*/g,"-");
     const un=row.querySelector(".packing-un").value.trim(),weight=row.querySelector(".packing-weight").value.trim(),rate=row.querySelector(".packing-rate").value.trim(),hm=row.querySelector(".packing-hm").checked;
     if(!number&&!raw&&!un&&!weight&&!rate&&!hm)continue;
     if(!number)throw Error("Enter a part number on each filled freight row.");
     if(pieces&&(!/^[1-9][0-9]{0,5}(-[1-9][0-9]{0,5})?$/.test(pieces)||(pieces.includes("-")&&Number(pieces.split("-")[0])>Number(pieces.split("-")[1]))))throw Error("Pieces per pallet must be a count or range, such as 2000 or 10-20.");
     parts.push({number,pieces:pieces?(pieces.includes("-")?pieces:Number(pieces)):null,hm,un,weight,rate});
    }
    const notes=group.querySelector(".packing-notes").value.trim();
    if(!parts.length){if(notes)throw Error("Enter a part number for the line with notes.");continue}
    const count=group.querySelector(".packing-count");
    if(!count.checkValidity())throw Error("Enter 1 to 999 pallets for each filled line.");
    stopLines.push({pallets:Number(count.value),parts,notes,stop});
   }
   if(stopLines.length){stopLines[0].bol=bol;lines.push(...stopLines)}
   else if(section.dataset.hasBol==="true"||JSON.stringify(bol)!==section.dataset.baseline){
    if(legacy&&!saved)throw Error("Add the existing pallets to the freight rows before saving BOL details.");
    lines.push({pallets:0,parts:[],notes:"",stop,bol});
   }
  }
  if(lines.length>100)throw Error("Use no more than 100 pallet lines across all stops.");
  if(total(lines)>999)throw Error("The packing slips cannot exceed 999 pallets.");
  return lines;
 }
 $("openPackingSlip").onclick=()=>{
  list.replaceChildren();
  for(let stop=0;stop<=2;stop++){
   const existing=saved?.filter(line=>(line.stop||0)===stop)||[];
   if(stop&&!stopLocation(stop)&&!existing.length)continue;
   const section=document.createElement("section");section.className="packing-stop";section.dataset.stop=String(stop);
   const head=document.createElement("div");head.className="packing-line-head";
   const title=document.createElement("h3");title.textContent=stopTitle(stop);
   const subtotal=document.createElement("strong");subtotal.className="packing-stop-total";
   const print=document.createElement("button");print.type="button";print.textContent="Print / Save PDF";print.onclick=()=>printSlip(stop);
   head.append(title,subtotal,print);
   const paper=document.createElement("div");paper.className="bol-paper";
   paper.innerHTML=printBolHeader(stop,route())+printFreightLines([])+printFooter;
   const table=paper.querySelector(".packing-freight-table");table.querySelector("tbody").remove();
   table.querySelector("tfoot td").className="bol-total";
   section.append(head,paper);list.append(section);
   const form=existing.find(line=>line.bol)?.bol;
   section.dataset.hasBol=String(Boolean(form));prepareFields(section,form);
   const content=existing.filter(line=>line.parts?.length);
   if(content.length)for(const line of content)addLine(line,table);else addLine({},table);
   const add=document.createElement("button");add.type="button";add.className="bol-editor-control bol-add-line";add.textContent="Add Line";
   add.onclick=()=>{if(list.querySelectorAll(".packing-line").length<100)addLine({},table)};
   paper.querySelector(".packing-freight-layout").after(add);
  }
  refresh();modal.showModal();
 };
 function apply(lines){
  const previous=partNotes(saved||[]),notes=$("job"),next=partNotes(lines);
  if(next||(previous&&notes.value===previous)){notes.value=next;notes.dispatchEvent(new Event("input",{bubbles:true}))}
  if(!lines.length&&saved)legacy=0;saved=lines.length?copy(lines):null;updateButton();
 }
 function finish(saveTransfer=false){
  try{apply(read());modal.close();if(saveTransfer&&$("editId").value)$("form").requestSubmit($("save"))}catch(e){error.textContent=e.message}
 }
 $("packingDone").onclick=()=>finish(true);$("packingClose").onclick=()=>finish();
 $("packingCancel").onclick=()=>modal.close();modal.addEventListener("cancel",e=>{e.preventDefault();finish()});
 list.addEventListener("input",refresh);
 function printSlip(stop){
  try{
   const lines=read(),selected=lines.filter(line=>(line.stop||0)===stop);
   if(!selected.length)throw Error("Fill in the BOL before printing.");
   apply(lines);
   const original=[...list.querySelectorAll(".packing-stop")].find(section=>Number(section.dataset.stop)===stop).querySelector(".bol-paper");
   const paper=original.cloneNode(true);
   paper.querySelector(".bol-pad")?.remove();
   for(const group of paper.querySelectorAll(".packing-line")){
    if(![...group.querySelectorAll(".packing-number")].some(input=>input.value.trim())){group.remove();continue}
    const notes=group.querySelector(".packing-notes");
    if(!notes.value.trim())group.querySelector(".bol-line-actions").remove();
   }
   const table=paper.querySelector(".packing-freight-table");
   const blanks=document.createElement("tbody");
   for(let i=paper.querySelectorAll(".packing-part").length;i<14;i++){const row=document.createElement("tr");row.className="freight-empty";row.innerHTML="<td></td><td></td><td></td><td></td><td></td><td></td>";blanks.append(row)}
   table.insertBefore(blanks,table.querySelector("tfoot"));
   paper.querySelectorAll(".bol-editor-control").forEach(el=>el.remove());
   for(const input of paper.querySelectorAll("input")){
    const span=document.createElement("span");span.className="bol-printed-value";span.textContent=input.type==="checkbox"?(input.checked?"X":""):input.value;input.replaceWith(span);
   }
   paper.querySelectorAll("[contenteditable]").forEach(el=>{el.removeAttribute("contenteditable");el.removeAttribute("role")});
   // Blank freight entry rows and empty line-note labels are editing aids.
   paper.querySelectorAll(".packing-part").forEach(row=>{if(!row.querySelector(".bol-description")?.textContent.trim())row.remove()});
   $("packingPrintSheet").replaceChildren(...paper.childNodes);
   document.body.classList.add("printing-packing-slip");
   try{window.print()}finally{document.body.classList.remove("printing-packing-slip")}
  }catch(e){error.textContent=e.message}
 }
 updateButton();
})();
