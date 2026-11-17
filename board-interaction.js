/* Keep captured handles and drag sources attached while background data changes. */
(()=>{
 const gestures=new Map(),pending=new Map();let scheduled=false;
 function flush(){
  scheduled=false;if(gestures.size)return;
  const callbacks=[...pending.values()];pending.clear();
  for(const callback of callbacks)callback();
 }
 function schedule(){if(!scheduled){scheduled=true;queueMicrotask(flush)}}
 const api={
  get active(){return gestures.size>0},
  begin(key,cancel){gestures.set(key,cancel)},
  end(key){gestures.delete(key);if(!gestures.size)schedule()},
  defer(key,callback){if(!gestures.size)return false;pending.set(key,callback);return true},
  cancel(){for(const [key,cancel] of [...gestures]){cancel?.();gestures.delete(key)}schedule()}
 };
 window.TransferBoardInteraction=api;
 window.addEventListener('blur',()=>api.cancel());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)api.cancel()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')api.cancel()});
})();
