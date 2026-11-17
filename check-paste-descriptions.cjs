const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/packing-slip.js','utf8'),start=source.indexOf(' function applySheetPalletCounts'),end=source.indexOf(' const rowHasData',start),c=vm.createContext({});
vm.runInContext(source.slice(start,end),c);
function parse(text){c.input=text;return JSON.parse(JSON.stringify(vm.runInContext('parsePastedLoad(input)',c)));}
function row(text,description,pallets=2){const result=parse(text);assert.equal(result.rows.length,1,text);assert.equal(result.rows[0].un,'09-765',text);assert.equal(result.rows[0].description,description,text);assert.equal(result.rows[0].pallets,pallets,text);}
row('09-765 so you can send me 2 skids','');
row('09-765 white gloss paper so you can send me 2 skids','white gloss paper');
row('09-765 white gloss paper\nPlease send me 2 skids\nThanks!','white gloss paper');
row('Please send 2 skids of 09-765 white gloss paper','white gloss paper');
row('Can you send 2 skids of 09-765?','');
row('09-765 I will need 2 skids','');
row('Please send 2 skids of 09-765, actually send 3 skids of 09-765','',3);
row('09-765 Send N Seal envelopes 2 skids','Send N Seal envelopes');
row('09-765 White paper with blue coating 2 skids','White paper with blue coating');
row('09-765\t24 x 36 white coated paper\t2 pallets','24 x 36 white coated paper');
row('09-765 4,500 sheets','4,500 sheets',3);
row('Please send 4,500 sheets of 09-765 white gloss paper','white gloss paper\n4,500 sheets',3);
const multiple=parse('Please send 2 skids of 09-765 and 3 skids of 10-100');
assert.equal(multiple.rows.length,2);assert.deepEqual(multiple.rows.map(r=>r.description),['','']);assert.deepEqual(multiple.rows.map(r=>r.pallets),[2,3]);
assert.throws(()=>parse('09-765 2 skids\n09-765 1.5 skids'),/whole/);
console.log('PASS: request sentences excluded; real descriptions, part numbers, pallet counts, sheet conversion, and multi-part requests preserved.');

vm.runInContext(source.slice(source.indexOf(' function packingRowHasProduct'),source.indexOf(' function refresh(){')),c);
c.group={querySelectorAll:()=>[{value:''},{value:'09-765'}]};assert(vm.runInContext('packingRowHasProduct(group)',c));
c.group={querySelectorAll:()=>[{value:''},{value:''}]};assert.equal(vm.runInContext('packingRowHasProduct(group)',c),false);
console.log('PASS: part-only rows remain included in pallet totals and printing.');
