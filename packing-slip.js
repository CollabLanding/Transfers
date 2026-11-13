(()=>{
 const $=id=>document.getElementById(id),modal=$("packingSlip"),list=$("packingLines"),error=$("packingError");
 let saved=null,legacy=0,locationAddresses=[];
 const addressClient=window.supabase&&window.TRANSFERS_CONFIG?.supabaseUrl?window.supabase.createClient(window.TRANSFERS_CONFIG.supabaseUrl,window.TRANSFERS_CONFIG.supabaseAnonKey):null;
 const copy=v=>JSON.parse(JSON.stringify(v));
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const total=lines=>lines.reduce((sum,line)=>sum+Number(line.pallets||0),0);
 const partNotes=lines=>lines.flatMap(line=>(line.parts||[]).map(part=>part.un||part.number)).filter(Boolean).join(" | ");
 const stopLocation=stop=>$(["origin","additionalStop","additionalStop2"][stop])?.value||"";
 const stopTitle=stop=>(stop?"Additional Stop "+stop:"Load Origin")+(stopLocation(stop)?" — "+stopLocation(stop):"");
 const route=()=>["origin","additionalStop","additionalStop2","destination"].map(id=>$(id)?.value).filter(x=>x&&!x.startsWith("__")).join(" → ");
 function updateButton(){const n=saved?.length?total(saved):legacy;$("pallet").value=String(n);$("packingTotal").textContent=n+" pallets"}
 window.PackingSlip={load(lines,count=0){saved=Array.isArray(lines)&&lines.length?copy(lines):null;legacy=Number(count)||0;updateButton()},value:()=>saved?copy(saved):null};
 const printFooter="<footer class=\"packing-slip-footer\">\n <div class=\"packing-declared\"><div>Note: Where the rate is dependent on value, shippers are required to state specifically in writing the agreed or declared value of the property. The agreed or declared value of the property is hereby specifically stated by the shipper to be not exceeding: $ <span class=\"packing-blank packing-value\"></span></div><div>Per: <span class=\"packing-blank\"></span></div></div>\n <div class=\"packing-signatures\">\n  <div><div class=\"packing-sign-row\"><span>SHIPPER:</span><span class=\"packing-blank\"></span></div><div class=\"packing-sign-row\"><span>PER:</span><span class=\"packing-blank\"></span></div><div class=\"packing-sign-row\"><span>EMERGENCY RESPONSE TELEPHONE NUMBER:</span><span class=\"packing-blank\"></span></div></div>\n  <div><div class=\"packing-sign-row\"><span>CARRIER:</span><span class=\"packing-blank\"></span></div><div class=\"packing-sign-row\"><span>PER:</span><span class=\"packing-blank\"></span></div><div class=\"packing-sign-row\"><span>DATE:</span><span class=\"packing-blank\"></span></div></div>\n </div>\n <div class=\"packing-hazmat\">* Mark with “X” to designate Hazardous Material as defined in Title 49 of the Code of Federal Regulations. Monitored at all times the Hazardous Material is in transportation including storage incidental to transportation (1 72 604).</div>\n</footer>";

 function printFreightLines(lines){
  const rows=lines.flatMap(line=>line.parts.map((part,i)=>'<tr><td>'+(i===0?esc(line.pallets):'')+'</td><td><span class="freight-hm-box"></span></td><td>'+esc(part.number)+(part.pieces!=null?' — '+esc(part.pieces)+' pieces per pallet':'')+(i===0&&line.notes?'<br>'+esc(line.notes):'')+'</td><td></td><td></td><td></td></tr>'));
  while(rows.length<14)rows.push('<tr class="freight-empty"><td></td><td><span class="freight-hm-box"></span></td><td></td><td></td><td></td><td></td></tr>');
  return '<div class="packing-freight-layout"><table class="packing-freight-table"><colgroup><col style="width:8%"><col style="width:6%"><col style="width:50%"><col style="width:12%"><col style="width:14%"><col style="width:10%"></colgroup><thead><tr><th>No.<br>Pallets</th><th>*<br>HM</th><th>Description of Articles, Special Marks and Exceptions</th><th>UN<br>Number</th><th>Weight<br>(* Sub. to correction)</th><th>Class or Rate</th></tr></thead><tbody>'+rows.join('')+'</tbody><tfoot><tr><td>'+total(lines)+'</td><td></td><td colspan="4">Total pallets</td></tr></tfoot></table><aside class="packing-freight-terms"><p>Subject to Section 7 of conditions of applicable bill of lading, if this shipment is to be delivered to the consignee without recourse on the consignor, the consignor shall sign the following statement.</p><p>The carrier shall not make delivery of this shipment without payment of freight and all other lawful charges.</p><div class="freight-signature-line"></div><small>(Signature of Consignor)</small><p>FREIGHT PREPAID, except when box below is checked.</p><p><span class="freight-check"></span> Check box if charges are to be collect</p><div>Received $<span class="freight-write-line"></span></div><p>To apply in prepayment of the charges on the property described hereon.</p><div class="freight-signature-line"></div><small>Agent or Cashier</small><p class="freight-cod"><strong>COD Amt: $</strong><span class="freight-write-line"></span></p><strong>COD Remit to Address:</strong><div class="freight-address-lines"></div></aside></div>';
 }


 function printBolHeader(stop,route){
  const from=stopLocation(stop),to=$("destination")?.value||"";
  return '<header class="bol-header"><div class="bol-title">STRAIGHT BILL OF LADING – ORIGINAL – NOT NEGOTIABLE</div><div class="bol-received"><span>RECEIVED, subject to the classifications and tariffs in effect on the date of issue of this Original Bill of Lading.</span><strong>DATE:</strong><span class="bol-field bol-date">'+esc($("date").value)+'</span></div><div class="bol-carrier"><strong>AT:</strong><span class="bol-field">'+esc(from)+'</span><strong>Name of Carrier:</strong><span class="bol-field"></span></div><p class="bol-contract">The property described below, in apparent good order, except as noted (contents and condition of contents of packages unknown), marked, consigned, and destined as indicated below, which said carrier (the word carrier being understood throughout this contract as meaning any person or corporation in possession of the property under the contract) agrees to carry to its usual place of delivery at said destination, if on its route, otherwise to deliver to another carrier on the route to said destination. It is mutually agreed, as to each carrier of all or any of said property over all or any portion of said route to destination, and as to each party at any time interested in all or any of said property, that every service to be performed hereunder shall be subject to all the terms and conditions of the Uniform Domestic Straight Bill of Lading set forth (1) in the Uniform Freight Classification in effect on the date hereof, if this is a rail, or a rail-water shipment, or (2) in the applicable motor carrier classification or tariff if this is a motor carrier shipment. Shipper hereby certifies that he is familiar with all the terms and conditions of the said bill of lading, including those on the back thereof, set forth in the classification or tariff which governs the transportation of this shipment, and the said terms and conditions are hereby agreed to by the shipper and accepted for himself and his assigns.</p><div class="bol-addresses"><div class="bol-address"><div><strong>Consigned to:</strong><span class="bol-field">'+esc(to)+'</span></div><div><span>Street</span><span class="bol-field"></span></div><div><span>Destination</span><span class="bol-field"></span></div></div><div class="bol-address"><div><strong>From:</strong><span class="bol-field">'+esc(from)+'</span></div><div><span>Street</span><span class="bol-field"></span></div><div><span>Origin</span><span class="bol-field"></span></div></div></div><div class="bol-reference-row"><strong>Shippers Number:</strong><span class="bol-field"></span><strong>Customer Order #:</strong><span class="bol-field"></span><strong>ATC Booking #:</strong><span class="bol-field"></span></div><div class="bol-instructions"><strong>Special Instructions:</strong><span class="bol-field">'+esc($("job").value)+'</span></div><div class="bol-route"><strong>Route via:</strong><span class="bol-field">'+esc(route)+'</span></div></header>';
 }


 function valueInput(className,value,label,extra=""){
  return '<input class="'+className+'" aria-label="'+esc(label)+'" value="'+esc(value)+'" '+extra+'>';
 }
 function lineDescription(line){
  return (line.parts||[]).map(part=>part.description??(part.number+(part.pieces!=null?" — "+part.pieces+" pieces per pallet":""))).join("\n")+(line.notes?"\n"+line.notes:"");
 }
 function addLine(line={},table){
  const group=document.createElement("tbody");group.className="packing-line";
  const description=lineDescription(line);
  group.dataset.original=JSON.stringify(line);group.dataset.description=description;
  const part=line.parts?.[0]||{};
  group.innerHTML='<tr class="packing-part"><td>'+valueInput("packing-count",line.pallets||"","Number of pallets",'type="number" min="1" max="999" step="1"')+'</td>'+
   '<td><input type="checkbox" class="packing-hm" aria-label="Hazardous material" '+(line.parts?.some(p=>p.hm)?'checked':'')+'></td>'+
   '<td><textarea class="packing-number" aria-label="Description of Articles, Special Marks and Exceptions" maxlength="2000" rows="1">'+esc(description)+'</textarea></td>'+
   '<td>'+valueInput("packing-un",part.un,"UN Number",'maxlength="80"')+'</td>'+
   '<td>'+valueInput("packing-weight",part.weight,"Weight",'maxlength="80"')+'</td>'+
   '<td>'+valueInput("packing-rate",part.rate,"Class or Rate",'maxlength="80"')+'</td></tr>';
  table.insertBefore(group,table.querySelector("tfoot"));
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
 function defaultPalletCounts(){
  for(const group of list.querySelectorAll(".packing-line")){
   const description=group.querySelector(".packing-number").value.trim(),count=group.querySelector(".packing-count");
   if(description&&!count.value){count.value="1";count.dataset.autoPallet="true"}
   else if(!description&&count.dataset.autoPallet==="true"&&count.value==="1"){count.value="";delete count.dataset.autoPallet}
  }
 }
 function refresh(){
  defaultPalletCounts();
  let sum=0;
  for(const section of list.querySelectorAll(".packing-stop")){
   let n=0;
   for(const group of section.querySelectorAll(".packing-line")){
    if([...group.querySelectorAll(".packing-number")].some(input=>input.value.trim()))n+=Number(group.querySelector(".packing-count")?.value)||0;
   }
   sum+=n;if(section.querySelector(".packing-stop-total"))section.querySelector(".packing-stop-total").textContent=n+" pallets";
   section.querySelector(".bol-total").textContent=String(n);
  }
  $("packingDraftTotal").textContent="Total: "+(sum||(!saved?legacy:0))+" pallets";error.textContent="";
 }
 function read(){
  defaultPalletCounts();
  const lines=[];
  for(const section of list.querySelectorAll(".packing-stop")){
   const stop=Number(section.dataset.stop),bol=readBol(section),stopLines=[];
   if(Object.values(bol).some(value=>typeof value==="string"&&value.length>2000))throw Error("Keep each BOL field under 2,000 characters.");
   for(const group of section.querySelectorAll(".packing-line")){
    const description=group.querySelector(".packing-number").value.trim();
    const count=group.querySelector(".packing-count"),hm=group.querySelector(".packing-hm").checked;
    const un=group.querySelector(".packing-un").value.trim(),weight=group.querySelector(".packing-weight").value.trim(),rate=group.querySelector(".packing-rate").value.trim();
    if(!description&&!count.value&&!hm&&!un&&!weight&&!rate)continue;
    if(!description&&!un)throw Error("Enter a description or part number for each filled BOL row.");
    if(!count.value||!count.checkValidity())throw Error("Enter 1 to 999 pallets for each filled BOL row.");
    const original=JSON.parse(group.dataset.original),unchanged=description===group.dataset.description;
    const parts=unchanged&&original.parts?.length?copy(original.parts):[{number:description.slice(0,120),pieces:null,description}];
    Object.assign(parts[0],{hm,un,weight,rate,...(un?{number:un}:{})});
    stopLines.push({pallets:Number(count.value),parts,notes:unchanged?(original.notes||""):"",stop});
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

 function parsePastedLoad(text){
  if(text.length>20000)throw Error("Paste no more than 20,000 characters at a time.");
  const rows=[],warnings=[];let current=null,headings=0,pendingPallets=null;
  const checkedCount=value=>{
   const count=Number(value.replace(/,/g,""));
   if(!Number.isInteger(count)||count<1||count>999)throw Error("Pallet/skid counts must be whole numbers from 1 to 999.");
   return count;
  };
  const flush=()=>{if(current){rows.push(current);current=null}};
  const attach=(row,count)=>{
   if(count==null)return;
   if(row.pallets!=null&&row.pallets!==count)throw Error("More than one pallet/skid count was found for "+row.un+". Review that row before importing.");
   row.pallets=count;
  };
  for(let raw of text.replace(/\s+and\s+(?=\d[\d,]*(?:\.\d+)?\s*(?:pallets?|skids?)\b)/gi,"\n").split(/\r?\n/)){
   let line=raw.trim();if(!line||/^\++$/.test(line))continue;
   if(/^(?:\d+(?:st|nd|rd|th)?\s+load|load\s*#?\s*\d+)\s*:?$/i.test(line)){
    headings++;if(headings>1)throw Error("Paste one load at a time into its matching stop.");continue;
   }
   let pallets=null;
   line=line.replace(/\b(\d[\d,]*(?:\.\d+)?)\s*(?:pallets?|skids?)\b|\b(?:pallets?|skids?)\b\s*[:=#]?\s*(\d[\d,]*(?:\.\d+)?)\b/gi,(_match,after,before)=>{
    const count=checkedCount(after||before);
    if(pallets!=null&&pallets!==count)throw Error("Conflicting pallet/skid counts were found on one line.");
    pallets=count;return "";
   }).replace(/^[\s,;:|+–—-]+|[\s,;:|+–—-]+$/g,"").trim();
   if(pallets!=null)line=line.replace(/^of\s+(?=[A-Z0-9]+(?:-[A-Z0-9]+)+\b)/i,"").replace(/\s+and\s*$/i,"").trim();
   if(!line){
    if(current)attach(current,pallets);
    else if(pallets!=null){if(pendingPallets!=null&&pendingPallets!==pallets)throw Error("Conflicting pallet/skid counts before a part number.");pendingPallets=pallets}
    continue;
   }
   const fill=line.match(/^fill\s+(?:remaining\s+space\s+)?with\s+([A-Z0-9]+(?:-[A-Z0-9]+)+)\s*$/i);
   if(fill){flush();const row={un:fill[1],description:"Fill remaining space"};attach(row,pendingPallets);attach(row,pallets);pendingPallets=null;rows.push(row);continue}
   if(current&&/^[\d,.]+(?:\s*[-–]\s*[\d,.]+)?\s+(?:sheets?|pieces?|pcs|units?|cases?)$/i.test(line)){
    current.description+=(current.description?"\n":"")+line;attach(current,pallets);continue;
   }
   const part=line.match(/^([A-Z0-9]+(?:-[A-Z0-9]+)+)(?:\s*[:|,\t]\s*|\s+)?(.*)$/i);
   if(part){flush();current={un:part[1],description:part[2].trim()};attach(current,pendingPallets);attach(current,pallets);pendingPallets=null;continue}
   if(current){current.description+=(current.description?"\n":"")+line;attach(current,pallets)}
   else{warnings.push(raw.trim());if(pallets!=null)pendingPallets=pallets}
  }
  flush();
  if(pendingPallets!=null)warnings.push(pendingPallets+" pallets without a part number");
  if(!rows.length)throw Error("No part numbers were found. Paste part numbers with their quantities below or beside them.");
  if(rows.length>100)throw Error("Import no more than 100 rows at a time.");
  for(const row of rows)if(row.un.length>80||row.description.length>2000)throw Error("A pasted row is too long for the BOL.");
  return {rows,warnings};
 }
 const rowHasData=group=>[...group.querySelectorAll("input,textarea")].some(input=>input.type==="checkbox"?input.checked:Boolean(input.value.trim()));
 function addPasteImporter(section,table,head){
  const toggle=document.createElement("button");toggle.type="button";toggle.textContent="Paste Data";
  const panel=document.createElement("div");panel.className="bol-import-panel";panel.hidden=true;
  panel.innerHTML='<label>Paste load details<textarea class="bol-import-source" rows="7" maxlength="20000" placeholder="Paste here"></textarea></label><div class="bol-import-actions"><button type="button" class="bol-import-preview">Preview Rows</button><label>Import mode<select class="bol-import-mode"><option value="append">Add to existing rows</option><option value="replace">Replace rows</option></select></label><button type="button" class="bol-import-apply" disabled>Use These Rows</button><button type="button" class="bol-import-cancel">Cancel</button></div><p class="bol-import-message" role="status"></p><div class="bol-import-results"></div>';
  let parsed=null;
  toggle.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)panel.querySelector("textarea").focus()};
  panel.querySelector(".bol-import-cancel").onclick=()=>{panel.hidden=true};
  const source=panel.querySelector(".bol-import-source"),message=panel.querySelector(".bol-import-message"),results=panel.querySelector(".bol-import-results"),applyButton=panel.querySelector(".bol-import-apply");
  source.addEventListener("input",()=>{parsed=null;applyButton.disabled=true;results.replaceChildren();message.textContent=""});
  panel.querySelector(".bol-import-preview").onclick=()=>{
   try{
    parsed=parsePastedLoad(source.value);
    results.innerHTML='<table><thead><tr><th>UN Number / Part number</th><th>Description</th><th>No. Pallets</th></tr></thead><tbody>'+parsed.rows.map(row=>'<tr><td>'+esc(row.un)+'</td><td>'+esc(row.description).replace(/\n/g,"<br>")+'</td><td>'+esc(row.pallets??(row.description?1:""))+'</td></tr>').join("")+'</tbody></table>';
    message.textContent=parsed.rows.length+" rows found. Pallet and skid counts are recognized. Described rows without a count default to 1 pallet; all counts remain editable."+(parsed.warnings.length?" Unmatched text: "+parsed.warnings.join(" | "):"");
    applyButton.disabled=false;
   }catch(e){parsed=null;applyButton.disabled=true;results.replaceChildren();message.textContent=e.message}
  };
  applyButton.onclick=()=>{
   if(!parsed)return;
   const groups=[...table.querySelectorAll(".packing-line")],replace=panel.querySelector(".bol-import-mode").value==="replace";
   const existing=groups.filter(rowHasData),newRows=parsed.rows;
   const otherFilled=[...list.querySelectorAll(".packing-line")].filter(group=>!table.contains(group)&&rowHasData(group)).length;
   if(otherFilled+(replace?0:existing.length)+newRows.length>100){message.textContent="Use no more than 100 filled BOL rows across all stops.";return}
   if(replace&&existing.length&&!confirm("Replace the line items for this stop? Header and signature fields will be kept."))return;
   for(const group of groups)if(replace||!rowHasData(group))group.remove();
   for(const row of newRows)addLine({pallets:row.pallets??0,parts:[{number:row.un,un:row.un,description:row.description,pieces:null}]},table);
   while(table.querySelectorAll(".packing-line").length<14)addLine({},table);
   if(table.querySelectorAll(".packing-line").length<100)addLine({},table);
   panel.hidden=true;refresh();
   const inputs=table.querySelectorAll(".packing-count");inputs[replace?0:existing.length]?.focus();
  };
  head.append(toggle);section.insertBefore(panel,section.querySelector(".bol-paper"));
 }

 function populateAddresses(section,stop){
  const names=[$("destination")?.value||"",stopLocation(stop)];
  section.querySelectorAll(".bol-address").forEach((block,i)=>{
   const name=String(names[i]).trim().toLowerCase();
   const location=locationAddresses.find(row=>String(row.name).trim().toLowerCase()===name);
   if(!location)return;
   const street=block.children[1].querySelector(".bol-field"),city=block.children[2].querySelector(".bol-field");
   if(!street.textContent.trim())street.textContent=location.address||"";
   if(!city.textContent.trim())city.textContent=[location.city,location.state].filter(Boolean).join(", ");
  });
  section.dataset.baseline=JSON.stringify(readBol(section));
 }
 $("openPackingSlip").onclick=async()=>{
  const button=$("openPackingSlip");if(button.disabled)return;button.disabled=true;
  let addressError="";
  try{
   if(addressClient){
    const result=await addressClient.from("transfer_locations").select("name,address,city,state");
    if(result.error){locationAddresses=[];addressError="Location addresses could not load. You can enter them in the BOL."}
    else locationAddresses=result.data||[];
   }
  }catch(e){locationAddresses=[];addressError="Location addresses could not load. You can enter them in the BOL."}
  finally{button.disabled=false}
  list.replaceChildren();
  for(let stop=0;stop<=2;stop++){
   const existing=saved?.filter(line=>(line.stop||0)===stop)||[];
   if(stop&&!stopLocation(stop)&&!existing.length)continue;
   const section=document.createElement("section");section.className="packing-stop";section.dataset.stop=String(stop);
   const head=document.createElement("div");head.className="packing-line-head";
   const print=document.createElement("button");print.type="button";print.textContent="Print / Save PDF";print.onclick=()=>printSlip(stop);

   const paper=document.createElement("div");paper.className="bol-paper";
   paper.innerHTML=printBolHeader(stop,route())+printFreightLines([])+printFooter;
   const table=paper.querySelector(".packing-freight-table");table.querySelector("tbody").remove();
   table.querySelector("tfoot td").className="bol-total";
   section.append(head,paper);list.append(section);
   const form=existing.find(line=>line.bol)?.bol;
   section.dataset.hasBol=String(Boolean(form));prepareFields(section,form);populateAddresses(section,stop);
   const content=existing.filter(line=>line.parts?.length);
   for(const line of content)addLine(line,table);
   while(table.querySelectorAll(".packing-line").length<14)addLine({},table);
   addPasteImporter(section,table,head);
   const actions=document.createElement("div");actions.className="bol-form-actions";
   const clear=document.createElement("button");clear.type="button";clear.textContent="Clear Form";
   clear.onclick=()=>{
    table.querySelectorAll(".packing-line").forEach(group=>group.remove());
    for(let i=0;i<14;i++)addLine({},table);
    refresh();resizeDescriptions();
   };
   actions.append(clear,print);section.append(actions);

  }
  refresh();modal.showModal();resizeDescriptions();if(addressError)error.textContent=addressError;
 };
 function apply(lines){
  const previous=partNotes(saved||[]),notes=$("job"),next=partNotes(lines);
  if(next||(previous&&notes.value===previous)){notes.value=next;notes.dispatchEvent(new Event("input",{bubbles:true}))}
  if(!lines.length&&saved)legacy=0;saved=lines.length?copy(lines):null;updateButton();
 }
 function finish(saveTransfer=false){
  try{apply(read());modal.close();if(saveTransfer&&$("editId").value)$("form").requestSubmit($("save"))}catch(e){error.textContent=e.message}
 }
 $("packingDone").onclick=()=>finish(true);$("packingDoneTop").onclick=()=>finish(true);$("packingClose").onclick=()=>finish();
 $("packingCancel").onclick=()=>modal.close();modal.addEventListener("cancel",e=>{e.preventDefault();finish()});
 function resizeDescription(field){
  field.style.setProperty("height","0px","important");field.style.setProperty("height",Math.max(20,field.scrollHeight)+"px","important");
 }
 function resizeDescriptions(){for(const field of list.querySelectorAll("textarea.packing-number"))resizeDescription(field)}
 window.addEventListener("resize",()=>{if(modal.open)resizeDescriptions()});
 list.addEventListener("input",event=>{
  if(event.target.matches(".packing-count"))delete event.target.dataset.autoPallet;
  if(event.target.matches("textarea.packing-number"))resizeDescription(event.target);
  const table=event.target.closest(".packing-freight-table");
  if(table&&event.target.closest(".packing-line")===table.querySelector(".packing-line:last-of-type")){
   if(table.querySelectorAll(".packing-line").length<100)addLine({},table);
  }else if(table){
   const groups=[...table.querySelectorAll(".packing-line")];
   if(event.target.closest(".packing-line")===groups.at(-1)&&groups.length<100)addLine({},table);
  }
  refresh();
 });
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

   }
   const table=paper.querySelector(".packing-freight-table");
   const blanks=document.createElement("tbody");
   for(let i=paper.querySelectorAll(".packing-part").length;i<14;i++){const row=document.createElement("tr");row.className="freight-empty";row.innerHTML="<td></td><td></td><td></td><td></td><td></td><td></td>";blanks.append(row)}
   table.insertBefore(blanks,table.querySelector("tfoot"));
   paper.querySelectorAll(".bol-editor-control").forEach(el=>el.remove());
   for(const input of paper.querySelectorAll("input,textarea")){
    const span=document.createElement("span");span.className="bol-printed-value";span.textContent=input.type==="checkbox"?(input.checked?"X":""):input.value;input.replaceWith(span);
   }
   paper.querySelectorAll("[contenteditable]").forEach(el=>{el.removeAttribute("contenteditable");el.removeAttribute("role")});
   // Blank freight entry rows and empty line-note labels are editing aids.

   $("packingPrintSheet").replaceChildren(...paper.childNodes);
   document.body.classList.add("printing-packing-slip");
   try{window.print()}finally{document.body.classList.remove("printing-packing-slip")}
  }catch(e){error.textContent=e.message}
 }
 updateButton();
})();
