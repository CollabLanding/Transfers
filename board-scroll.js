/* Personal board wheel size, saved per account on this browser. */
(()=>{
 const sizes=[15,30,45,60,120],key=id=>'transfers-scroll-minutes:'+id;
 window.BoardScroll={
  sizes,
  get(id){try{const value=Number(localStorage.getItem(key(id)));if(id&&sizes.includes(value))return value}catch{}return 30},
  set(id,minutes){if(!id||!sizes.includes(Number(minutes)))return false;try{localStorage.setItem(key(id),String(minutes));return true}catch{return false}}
 };
})();
