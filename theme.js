(()=>{
  const toggle=document.getElementById("themeToggle");
  if(!toggle)return;

  const root=document.documentElement;
  const body=document.body;

  function savedTheme(){
    try{return localStorage.getItem("transfers-theme")==="dark"?"dark":"light"}catch(_err){return root.dataset.theme==="dark"?"dark":"light"}
  }

  function apply(theme,persist=true){
    const dark=theme==="dark";
    root.dataset.theme=dark?"dark":"light";
    body.dataset.theme=dark?"dark":"light";
    body.classList.toggle("dark-theme",dark);
    toggle.checked=dark;
    toggle.setAttribute("aria-checked",String(dark));
    toggle.title=dark?"Switch to light theme":"Switch to dark theme";
    if(persist){
      try{localStorage.setItem("transfers-theme",dark?"dark":"light")}catch(_err){}
    }
  }

  toggle.addEventListener("change",()=>{
    apply(toggle.checked?"dark":"light");
  });

  apply(savedTheme(),false);
})();