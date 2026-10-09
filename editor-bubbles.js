(()=>{
 const color=value=>/^#[0-9a-f]{6}$/i.test(value||"")?value:"#1d5c8f";
 const initials=name=>Array.from(String(name||"User").trim()).slice(0,2).join("").toUpperCase();
 const foreground=hex=>{
  const channels=[1,3,5].map(i=>parseInt(color(hex).slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return .2126*channels[0]+.7152*channels[1]+.0722*channels[2]>.179?"#101820":"#ffffff";
 };
 let online=[],local=null;
 function groups(){
  const result=new Map();
  for(const user of [...online.filter(user=>!local||!local.editor_tab_id||user.editor_tab_id!==local.editor_tab_id),...(local?[local]:[])]){
   if(!user.user_id||!user.editing_transfer)continue;
   const id=String(user.editing_transfer),users=result.get(id)||new Map();
   users.set(String(user.user_id),user);result.set(id,users);
  }
  return result;
 }
 function bubble(user){
  const node=document.createElement("span"),name=String(user.display_name||"User");
  node.className="editor-bubble";node.textContent=initials(name);node.style.backgroundColor=color(user.bubble_color);node.style.color=foreground(user.bubble_color);
  node.title=name+" is editing this load";node.setAttribute("aria-label",node.title);return node;
 }
 function fill(container,users){
  container.replaceChildren(...users.map(bubble));container.hidden=!users.length;
 }
 function render(){
  const grouped=groups(),id=document.getElementById("editId")?.value,form=document.getElementById("form"),panel=document.getElementById("transferEditorBubbles");
  if(panel)fill(panel,form&&!form.classList.contains("hidden")&&id?[...(grouped.get(String(id))?.values()||[])]:[]);
  const grid=document.getElementById("grid");if(!grid)return;
  grid.querySelectorAll(".transfer-editor-marker").forEach(node=>node.remove());
  grid.querySelectorAll(".card[data-id]").forEach(card=>{
   const users=[...(grouped.get(String(card.dataset.id))?.values()||[])];card.classList.toggle("has-editor-bubbles",users.length>0);if(!users.length)return;
   const marker=document.createElement("div");marker.className="editor-bubbles transfer-editor-marker";marker.dataset.transferId=card.dataset.id;
   fill(marker,users);card.appendChild(marker);
  });
 }
 window.TransferEditors={initials,color,foreground,render,setLocal:user=>{local=user;render()},sync:users=>{online=users||[];render()}};
})();