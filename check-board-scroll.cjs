const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const code=source.slice(source.indexOf('function scrollBoardQuarter'),source.indexOf('$("gridWrap").addEventListener("wheel"'));
const window={},storage=new Map();const c=vm.createContext({PX15:20,window,user:{id:"a"},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}});
vm.runInContext(fs.readFileSync(__dirname+"/board-scroll.js","utf8"),c);vm.runInContext(code,c);
const wrap={scrollTop:100,scrollHeight:1500,clientHeight:500};let blocked=0;
function wheel(overrides={}){c.event={deltaY:120,deltaX:0,currentTarget:wrap,target:{closest:()=>null},preventDefault(){blocked++},...overrides};vm.runInContext('scrollBoardQuarter(event)',c);}
for(const deltaY of [1,120,600]){const before=wrap.scrollTop;wheel({deltaY});assert.equal(wrap.scrollTop-before,40);}
wheel({deltaY:-120});assert.equal(wrap.scrollTop,180);
for(const overrides of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{deltaX:150,deltaY:10},{deltaY:0},{target:{closest:()=>({})}}]){const before=wrap.scrollTop,b=blocked;wheel(overrides);assert.equal(wrap.scrollTop,before);assert.equal(blocked,b);}
wrap.scrollTop=995;wheel();assert.equal(wrap.scrollTop,1000);wrap.scrollTop=5;wheel({deltaY:-120});assert.equal(wrap.scrollTop,0);
for(const minutes of [15,30,45,60,120]){
 assert(window.BoardScroll.set('a',minutes));wrap.scrollTop=100;wheel();assert.equal(wrap.scrollTop,100+minutes/15*20);
}
assert.equal(window.BoardScroll.get('b'),30);assert.equal(window.BoardScroll.get('a'),120);
assert.equal(window.BoardScroll.set('a',17),false);assert.equal(window.BoardScroll.get('a'),120);
storage.set('transfers-scroll-minutes:a','broken');assert.equal(window.BoardScroll.get('a'),30);
console.log('PASS: 30-minute default, all personal sizes, account isolation, invalid settings, modifiers, horizontal input, nested controls and bounds.');
