const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const code=source.slice(source.indexOf('function scrollBoardQuarter'),source.indexOf('$("gridWrap").addEventListener("wheel"'));
const c=vm.createContext({PX15:20});vm.runInContext(code,c);
const wrap={scrollTop:100,scrollHeight:1500,clientHeight:500};let blocked=0;
function wheel(overrides={}){c.event={deltaY:120,deltaX:0,currentTarget:wrap,target:{closest:()=>null},preventDefault(){blocked++},...overrides};vm.runInContext('scrollBoardQuarter(event)',c);}
for(const deltaY of [1,120,600]){const before=wrap.scrollTop;wheel({deltaY});assert.equal(wrap.scrollTop-before,20);}
wheel({deltaY:-120});assert.equal(wrap.scrollTop,140);
for(const overrides of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{deltaX:150,deltaY:10},{deltaY:0},{target:{closest:()=>({})}}]){const before=wrap.scrollTop,b=blocked;wheel(overrides);assert.equal(wrap.scrollTop,before);assert.equal(blocked,b);}
wrap.scrollTop=995;wheel();assert.equal(wrap.scrollTop,1000);wrap.scrollTop=5;wheel({deltaY:-120});assert.equal(wrap.scrollTop,0);
console.log('PASS: one wheel event moves one 15-minute block; up/down, bounds, zoom, horizontal input and nested fields preserved.');
