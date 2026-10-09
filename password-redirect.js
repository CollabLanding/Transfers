(()=>{
 const hash=new URLSearchParams(location.hash.slice(1)),query=new URLSearchParams(location.search);
 if(hash.get("type")==="recovery"||query.get("type")==="recovery"){
  location.replace("password.html"+location.search+location.hash);
 }
})();