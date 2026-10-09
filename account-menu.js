(()=>{
 const toggle=document.getElementById("me"),menu=document.getElementById("accountMenu");
 if(!toggle||!menu)return;
 const close=()=>{menu.hidden=true;toggle.setAttribute("aria-expanded","false")};
 toggle.addEventListener("click",event=>{
  event.preventDefault();menu.hidden=!menu.hidden;toggle.setAttribute("aria-expanded",String(!menu.hidden));
  if(!menu.hidden)menu.querySelector("a")?.focus();
 });
 document.addEventListener("pointerdown",event=>{if(!menu.hidden&&!menu.contains(event.target)&&!toggle.contains(event.target))close()});
 document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!menu.hidden){close();toggle.focus()}});
 menu.addEventListener("click",event=>{if(event.target.closest("a"))close()});
})();