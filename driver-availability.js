/* A shift belongs to its starting date; end before start means next day. */
window.TransferScheduleCoverage=(()=>{
 const minute=t=>{if(!t)return null;const [h,m]=String(t).slice(0,5).split(":").map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null};
 const add=(date,n)=>{const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 function intervals(rows,driver,date){
  const ranges=[];
  for(const offset of [-1,0,1])for(const row of rows.filter(r=>String(r.driver_name)===String(driver)&&String(r.schedule_date)===add(date,offset))){
   const s=minute(row.start_time),e=minute(row.end_time);if(s===null||e===null||s===e)continue;
   const from=s+offset*1440,to=e+offset*1440+(e<s?1440:0);
   if(to>0)ranges.push([Math.max(0,from),to]);
  }
  ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
  for(const range of ranges){const last=merged[merged.length-1];if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push(range.slice())}
  return merged;
 }
 const covers=(ranges,start,end)=>ranges.some(([a,b])=>start>=a&&end<=b);
 return {minute,add,intervals,covers};
})();
