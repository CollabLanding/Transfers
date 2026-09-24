/* Pointer-transparent chain artwork; load/link state remains in app.js. */
window.TransferChainVisual = (() => {
  const ns='http://www.w3.org/2000/svg';
  let drag=null;
  function node(tag,attrs={}){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n}
  function draw(svg,a,b,hooked){
    svg.replaceChildren();svg.classList.toggle('chain-hooked',hooked);
    const bend=b.y<a.y+18?48:0;
    const c={x:a.x+bend,y:a.y+Math.max(20,Math.abs(b.y-a.y)*.4)},d={x:b.x+bend,y:b.y-20};
    const point=t=>{const u=1-t;return{x:u*u*u*a.x+3*u*u*t*c.x+3*u*t*t*d.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*c.y+3*u*t*t*d.y+t*t*t*b.y}};
    let previous=a,travel=0;
    for(let i=1;i<=160;i++){
      const p=point(i/160);travel+=Math.hypot(p.x-previous.x,p.y-previous.y);
      if(travel>=7){const angle=Math.atan2(p.y-previous.y,p.x-previous.x)*180/Math.PI-90;svg.append(node('ellipse',{cx:p.x,cy:p.y,rx:2.7,ry:4.6,transform:`rotate(${angle} ${p.x} ${p.y})`,class:'chain-metal'}));travel=0}
      previous=p;
    }
    svg.append(node('path',{d:`M ${b.x-4} ${b.y-7} v 6 a 4 4 0 0 0 8 0 v -3`,class:'chain-hook'}));
  }
  function start(handle){stop();const r=handle.getBoundingClientRect(),svg=node('svg',{'aria-hidden':'true',class:'chain-drag-art'});document.body.append(svg);drag={svg,a:{x:r.left+r.width/2,y:r.bottom-3}};draw(svg,drag.a,drag.a,false)}
  function move(x,y,target){if(!drag)return;let b={x,y};if(target){const r=target.getBoundingClientRect();b={x:r.left+r.width/2,y:r.top+5}}draw(drag.svg,drag.a,b,!!target)}
  function stop(){drag?.svg.remove();drag=null}
  function renderLinks(grid,items){
    stop();grid.querySelectorAll('.chain-saved-art').forEach(n=>n.remove());
    const body=grid.querySelector('.bodyrow');if(!body)return;
    const cards=new Map([...body.querySelectorAll('.card')].map(n=>[n.dataset.id,n]));
    const origin=body.getBoundingClientRect();
    for(const row of items){const from=cards.get(row.id),to=cards.get(row.linked_next_id);if(!from||!to)continue;
      const r=from.querySelector('.load-chain').getBoundingClientRect(),t=to.getBoundingClientRect();
      const svg=node('svg',{'aria-hidden':'true',class:'chain-saved-art',width:body.scrollWidth,height:body.scrollHeight});
      body.append(svg);draw(svg,{x:r.left+r.width/2-origin.left,y:r.bottom-3-origin.top},{x:t.left+t.width/2-origin.left,y:t.top+5-origin.top},true);
    }
  }
  return {start,move,stop,renderLinks};
})();
