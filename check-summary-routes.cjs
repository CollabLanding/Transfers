const assert=require('assert/strict'),D=require('./summary-data.js');
const base={date:'2026-11-17',start:480,driver:'D',type:'Job',status:'Delivered',pallets:2,duration:60};
const jobs=[{...base,id:'ab',origin:'A',destination:'B',route:'A → B'}, {...base,id:'ba',origin:'B',destination:'A',route:'B → A'}, {...base,id:'acb',origin:'A',additional_stop:'C',destination:'B',route:'A → C → B'}, {...base,id:'ca',origin:'C',destination:'A',route:'C → A'}, {...base,id:'deleted-ab',origin:'A',destination:'B',deleted:true,route:'A → B'}, {...base,id:'slot',type:'Time-slot status',route:''}];
const ids=options=>D.filter(jobs,options).map(r=>r.id);
assert.deepEqual(ids({origin:'A',destination:'B'}),['ab','acb']);
assert.deepEqual(ids({origin:'B',destination:'A'}),['ba']);
assert.deepEqual(ids({origin:'A'}),['ab','acb']);assert.deepEqual(ids({destination:'A'}),['ba','ca']);
assert.deepEqual(ids({origin:'C',destination:'B'}),[]); // Intermediate stops are not origins.
assert.deepEqual(ids({origin:'A',destination:'B',location:'C'}),['acb']);
assert.deepEqual(ids({origin:'A',destination:'B',status:'Deleted'}),['deleted-ab']);
assert.deepEqual(ids({origin:'A',destination:'B',from:'2026-11-18'}),[]);
assert.deepEqual(ids({origin:'A',destination:'B',status:'Loading'}),[]);
assert.deepEqual(ids({origin:'A',destination:'B',type:'Time-slot status'}),[]);
assert(ids({}).includes('slot'));
assert.equal(D.csv(D.filter(jobs,{origin:'B',destination:'A'})).split('\r\n').length,2);
assert(!D.csv(D.filter(jobs,{origin:'B',destination:'A'})).includes('A → B'));
console.log('PASS: directional From/To routes, one-sided filters, intermediate stops, archived records, combined filters, and filtered CSV.');
