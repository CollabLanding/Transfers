(()=>{
  const toggle=document.getElementById("themeToggle");
  const track=document.querySelector(".theme-switch .switch-track");
  const wrap=document.querySelector(".theme-switch");
  if(!toggle||!track||!wrap)return;

  const root=document.documentElement;
  const body=document.body;
  let dragging=false;
  let pointerId=null;
  let progress=0;

  function savedTheme(){
    try{return localStorage.getItem("transfers-theme")==="dark"?"dark":"light"}catch(_err){
      return root.dataset.theme==="dark"?"dark":"light";
    }
  }

  function savedProgress(){
    try{
      const raw=Number(localStorage.getItem("transfers-theme-progress"));
      return Number.isFinite(raw)?Math.max(0,Math.min(1,raw)):(savedTheme()==="dark"?1:0);
    }catch(_err){
      return savedTheme()==="dark"?1:0;
    }
  }

  function persistProgress(){
    try{
      localStorage.setItem("transfers-theme-progress",String(progress));
      localStorage.setItem("transfers-theme",progress>=1?"dark":"light");
    }catch(_err){}
  }

  function setPreviewVars(){
    root.style.setProperty("--theme-progress",String(progress));
    root.style.setProperty("--theme-light-p",((1-progress)*100)+"%");
    root.style.setProperty("--theme-dark-p",(progress*100)+"%");
    track.style.setProperty("--theme-drag-progress",String(progress));
  }

  function setThumbProgress(value,preview=true){
    progress=Math.max(0,Math.min(1,value));
    setPreviewVars();

    if(preview&&progress>0&&progress<1){
      root.removeAttribute("data-theme");
      body.removeAttribute("data-theme");
      body.classList.remove("dark-theme");
      body.classList.add("theme-preview");
      toggle.checked=progress>=0.5;
      toggle.setAttribute("aria-checked",String(toggle.checked));
      toggle.title="Drag to adjust theme";
      wrap.classList.add("theme-dragging");
      const lightLabel=wrap.querySelector(".light-label");
      const darkLabel=wrap.querySelector(".dark-label");
      if(lightLabel)lightLabel.style.opacity=String(1-(progress*.28));
      if(darkLabel)darkLabel.style.opacity=String(.72+(progress*.28));
      return;
    }

    body.classList.remove("theme-preview","theme-dragging");
    const dark=progress>=1;
    root.dataset.theme=dark?"dark":"light";
    body.dataset.theme=dark?"dark":"light";
    body.classList.toggle("dark-theme",dark);
    toggle.checked=dark;
    toggle.setAttribute("aria-checked",String(dark));
    toggle.title=dark?"Switch to light theme":"Switch to dark theme";
    const lightLabel=wrap.querySelector(".light-label");
    const darkLabel=wrap.querySelector(".dark-label");
    if(lightLabel)lightLabel.style.removeProperty("opacity");
    if(darkLabel)darkLabel.style.removeProperty("opacity");
  }

  function apply(theme,persist=true){
    setThumbProgress(theme==="dark"?1:0,false);
    if(persist)persistProgress();
  }

  function finishDrag(event){
    if(!dragging||event.pointerId!==pointerId)return;
    dragging=false;
    try{track.releasePointerCapture?.(pointerId)}catch(_err){}
    pointerId=null;
    wrap.classList.remove("theme-dragging");
    setThumbProgress(progress,true);
    if(progress<=0||progress>=1)apply(progress>=1?"dark":"light",true);
    else persistProgress();
  }

  function beginDrag(event){
    if(event.button!==undefined&&event.button!==0)return;
    const rect=track.getBoundingClientRect();
    const local=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
    dragging=true;
    pointerId=event.pointerId;
    try{track.setPointerCapture?.(pointerId)}catch(_err){}
    setThumbProgress(local,true);
    event.preventDefault();
    event.stopPropagation();
  }

  function moveDrag(event){
    if(!dragging||event.pointerId!==pointerId)return;
    const rect=track.getBoundingClientRect();
    const local=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
    setThumbProgress(local,true);
    event.preventDefault();
  }

  track.addEventListener("pointerdown",beginDrag);
  track.addEventListener("pointermove",moveDrag);
  track.addEventListener("pointerup",finishDrag);
  track.addEventListener("pointercancel",finishDrag);
  track.addEventListener("lostpointercapture",event=>{
    if(dragging)finishDrag(event);
  });
  track.addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();
  });

  toggle.addEventListener("change",()=>{
    apply(toggle.checked?"dark":"light",true);
  });

  const initial=savedProgress();
  setThumbProgress(initial,initial>0&&initial<1);
  if(initial===0||initial===1){
    apply(initial===1?"dark":"light",false);
  }else{
    persistProgress();
  }
})();