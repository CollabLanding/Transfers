const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const frames=new Map();let frameId=0,created=0,writes=0,geometryReads=0;
function classes(){const values=new Set();return {add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x)}}
function lane(){return {isConnected:true,classList:classes(),children:[],append(el){if(el.parent)el.parent.children=el.parent.children.filter(x=>x!==el);this.children.push(el);el.parent=this}}}
const a=lane(),b=lane(),source={dataset:{boxKey:'job:a'},classList:classes()};
const grid={querySelectorAll:selector=>selector==='[data-box-key]'?[source]:selector==='.linked-box-dragging'&&source.classList.contains('linked-box-dragging')?[source]:[]};
const window={TransfersAccess:{can:()=>true},TransferChainVisual:{renderLinks(){}}};
const jobs=[{id:'a',driver:'D',scheduled_date:'2026-11-17',scheduled_time:'08:00',duration_minutes:60},{id:'b',driver:'D',scheduled_date:'2026-11-17',scheduled_time:'09:00',duration_minutes:60}];
const c={window,document:{createElement(){created++;return {style:{},remove(){if(this.parent)this.parent.children=this.parent.children.filter(el=>el!==this);this.parent=null}}}},localStorage:{getItem:()=>JSON.stringify([{source_key:'job:a',target_key:'job:b'}]),setItem(){}},requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId},cancelAnimationFrame:id=>frames.delete(id),Date};
vm.runInNewContext(fs.readFileSync(__dirname+'/board-links.js','utf8'),c);
const links=window.createBoardLinks({sb:null,grid,getDate:()=>jobs[0].scheduled_date,getUser:()=>({id:'u'}),getJobs:()=>jobs,getStatuses:()=>[],applyMove(){writes++},report(){},start:210,end:1320,px:20});
const flush=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn())};
(async()=>{
 await links.refresh();
 // Two fast circles: thousands of samples produce one current preview.
 for(let i=0;i<2000;i++)links.preview('job:a',i%2?a:b,()=>{geometryReads++;return 480+i%60});
 assert.equal(frames.size,1);assert.equal(created,0);flush();
 assert.equal(geometryReads,1);assert.equal(a.children.length,2);assert.equal(b.children.length,0);
 assert.equal(a.children[0].style.top,((480+1999%60-210)/15*20)+'px');
 assert.equal(writes,0);assert(source.classList.contains('linked-box-dragging'));
 const reused=a.children[0];links.preview('job:a',b,600);links.clearPreview(a);flush();
 assert.equal(created,2);assert.equal(b.children[0],reused);assert.equal(a.children.length,0);assert.equal(b.children.length,2);
 assert.equal(b.children[1].style.top,((660-210)/15*20)+'px');
 links.preview('job:a',a,700);links.clearPreview();flush();
 assert.equal(frames.size,0);assert.equal(a.children.length+b.children.length,0);assert.equal(source.classList.contains('linked-box-dragging'),false);assert.equal(writes,0);
 console.log('PASS: 2,000 drag samples collapse to one latest shadow; linked nodes reused across lanes; drop cancels pending paint; zero saves during preview.');
})().catch(error=>{console.error(error);process.exitCode=1});
