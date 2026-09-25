/* Pointer-transparent chain artwork; load/link state remains in app.js. */
window.TransferChainVisual = (() => {
  const ns='http://www.w3.org/2000/svg';
  let drag=null;
  function node(tag,attrs={}){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n}
  function draw(svg,a,b,hooked){
    svg.replaceChildren();svg.classList.toggle('chain-hooked',hooked);
    // The handle is the first link; draw exactly one extending link to the target.
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(length<3)return;
    const angle=Math.atan2(dy,dx)*180/Math.PI-90;
    svg.append(node('rect',{x:a.x-4,y:a.y-4,width:8,height:length+8,rx:4,transform:`rotate(${angle} ${a.x} ${a.y})`,class:'chain-metal'}));
  }

  function start(handle){stop();const r=handle.getBoundingClientRect(),svg=node('svg',{'aria-hidden':'true',class:'chain-drag-art'});svg.style.color=getComputedStyle(handle).color;document.body.append(svg);drag={svg,a:{x:r.left+r.width/2,y:r.bottom-3}};draw(svg,drag.a,drag.a,false)}
  function move(x,y,target){if(!drag)return;let b={x,y};if(target){const r=target.getBoundingClientRect();b={x:r.left+r.width/2,y:r.top+r.height/2<drag.a.y?r.bottom-5:r.top+5}}draw(drag.svg,drag.a,b,!!target)}
  function stop(){drag?.svg.remove();drag=null}
  function renderLinks(grid,links){
    stop();grid.querySelectorAll('.chain-connected').forEach(n=>n.classList.remove('chain-connected'));grid.querySelectorAll('.chain-saved-art').forEach(n=>n.remove());
    const body=grid.querySelector('.bodyrow');if(!body)return;
    const cards=new Map([...body.querySelectorAll('[data-box-key]')].map(n=>[n.dataset.boxKey,n]));
    const origin=body.getBoundingClientRect();
    for(const row of links){const from=cards.get(row.source_key),to=cards.get(row.target_key);if(!from||!to)continue;
      const handle=from.querySelector('.load-chain');handle.classList.add('chain-connected');
      const r=handle.getBoundingClientRect(),t=to.getBoundingClientRect();
      const svg=node('svg',{'aria-hidden':'true',class:'chain-saved-art',width:body.scrollWidth,height:body.scrollHeight});
      body.append(svg);draw(svg,{x:r.left+r.width/2-origin.left,y:r.bottom-3-origin.top},{x:t.left+t.width/2-origin.left,y:(t.top+t.height/2<r.bottom?t.bottom-5:t.top+5)-origin.top},true);
    }
  }
  return {start,move,stop,renderLinks};
})();
