const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
function section(source,from,to){assert(source.includes(from)&&source.includes(to));return source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));}
function context(extra={}){return vm.createContext({console,Date,Math,Number,String,Object,...extra});}
function load(c,from,to,source=app){vm.runInContext(section(source,from,to),c);}
function field(value){return {value};}
{
 const E={edit:field('a'),date:field('2026-11-17'),time:field('08:00'),duration:field('60'),driver:field('A'),job:field('draft notes')};
 const baseline={date:'2026-11-17',time:'08:00',duration:'60',driver:'A',job:'old notes'};
 const c=context({E,transferInfoBaseline:baseline,transferInfoValues:()=>Object.fromEntries(Object.entries(E).map(([k,v])=>[k,v.value]))});
 load(c,'function syncBoardActionForm','function beginTransferResize');
 c.row={id:'a',scheduled_date:'2026-11-18',scheduled_time:'09:15:00',duration_minutes:75,driver:'B'};
 vm.runInContext('syncBoardActionForm(row)',c);
 assert.equal(E.driver.value,'B');assert.equal(E.date.value,'2026-11-18');assert.equal(E.time.value,'09:15');assert.equal(E.duration.value,'75');assert.equal(E.job.value,'draft notes');
 const patch=vm.runInContext("changedTransferPayload({driver:'B',scheduled_date:'2026-11-18',scheduled_time:'09:15',duration_minutes:75,job_number:'draft notes'})",c);
 assert.deepEqual(JSON.parse(JSON.stringify(patch)),{job_number:'draft notes'});
 E.driver.value='C';assert.equal(vm.runInContext("changedTransferPayload({driver:'C'}).driver",c),'C');
 console.log('PASS 1: board actions reconcile schedule fields, preserve notes, and saves omit unchanged fields.');
}
