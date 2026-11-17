const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/packing-slip.js','utf8');
const values={origin:'Origin warehouse',additionalStop:'Stop one',additionalStop2:'Stop two',destination:'Destination',date:'2026-11-17',job:'Order'};
const c=vm.createContext({$:id=>({value:values[id]}),esc:String,stopLocation:stop=>values[['origin','additionalStop','additionalStop2'][stop]],locationAddresses:[{name:'Origin warehouse',address:'100 Origin St',city:'Dallas',state:'TX'}],readBol:()=>({})});
vm.runInContext(source.slice(source.indexOf(' function printBolHeader'),source.indexOf(' function valueInput')),c);
vm.runInContext(source.slice(source.indexOf(' function populateAddresses'),source.indexOf(' $("openPackingSlip").onclick')),c);
for(let stop=0;stop<3;stop++){
 c.stop=stop;const html=vm.runInContext("printBolHeader(stop,'route')",c);
 assert(html.includes('<strong>From:</strong><span class="bol-field">Origin warehouse</span>'));
 assert(!html.includes('Stop one'));assert(!html.includes('Stop two'));
 const fields=[{textContent:'Stop two'},{textContent:'Old stop street'},{textContent:'Old stop city'}];
 const recipient=[{textContent:'Destination'},{textContent:'Custom destination street'},{textContent:'Custom destination city'}];
 const block=fields=>({children:fields.map(field=>({querySelector:()=>field}))});
 const blocks=[block(recipient),block(fields)],at={textContent:'Stop two'};
 c.section={dataset:{},querySelectorAll:()=>blocks,querySelector:()=>at};
 vm.runInContext('populateAddresses(section,stop)',c);
 assert.equal(fields[0].textContent,'Origin warehouse');assert.equal(fields[1].textContent,'100 Origin St');assert.equal(fields[2].textContent,'Dallas, TX');assert.equal(at.textContent,'Origin warehouse');
 assert.equal(recipient[1].textContent,'Custom destination street');
 // Reopening a correctly addressed slip retains its existing address edits.
 fields[1].textContent='Edited origin street';vm.runInContext('populateAddresses(section,stop)',c);assert.equal(fields[1].textContent,'Edited origin street');
}
console.log('PASS: all stop slips use Load Origin; saved stop senders/addresses corrected; destination and existing origin edits preserved.');
