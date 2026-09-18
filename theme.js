(()=>{
  const button=document.getElementById("themeToggle");
  if(!button)return;

  const root=document.documentElement;

  function currentTheme(){
    return root.dataset.theme==="dark"?"dark":"light";
  }

  function updateButton(){
    const dark=currentTheme()==="dark";
    button.textContent=dark?"☀ Light":"☾ Dark";
    button.setAttribute("aria-pressed",String(dark));
    button.title=dark?"Switch to light theme":"Switch to dark theme";
  }

  function apply(theme){
    root.dataset.theme=theme;
    try{localStorage.setItem("transfers-theme",theme)}catch(_err){}
    updateButton();
  }

  button.addEventListener("click",()=>{
    apply(currentTheme()==="dark"?"light":"dark");
  });

  updateButton();
})();