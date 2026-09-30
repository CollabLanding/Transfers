/* Pointer-transparent chain artwork; load/link state remains in app.js. */
window.TransferChainVisual = (() => {
  const ns='http://www.w3.org/2000/svg';
  let drag=null;
  function node(tag,attrs={}){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n}
  function draw(svg,a,b,hooked){
    svg.replaceChildren();svg.classList.toggle('chain-hooked',hooked);

    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(length<8)return;

    const ux=dx/length,uy=dy/length;
    const direction=Math.atan2(dy,dx)*180/Math.PI;

    // Each added link is a complete closed loop. The loops overlap slightly
    // so the first one grows directly out of the original icon.
    const linkLength=17;
    const linkWidth=9;
    const spacing=9;
    const first=5;
    const available=Math.max(0,length-4);
    const count=Math.max(1,Math.floor((available-first)/spacing)+1);

    for(let i=0;i<count;i++){
      const d=first+i*spacing;
      if(d>length-3)break;

      const x=a.x+ux*d;
      const y=a.y+uy*d;

      // Alternate the plane of each link like a real chain, while keeping
      // the visual treatment clean at small screen sizes.
      const rotation=direction+(i%2===0?0:90);

      svg.append(node('rect',{
        x:x-linkWidth/2,
        y:y-linkLength/2,
        width:linkWidth,
        height:linkLength,
        rx:linkWidth/2,
        ry:linkWidth/2,
        transform:`rotate(${rotation} ${x} ${y})`,
        fill:'none',
        stroke:'currentColor',
        'stroke-width':'2.5',
        'stroke-linejoin':'round'
      }));
    }
  }

  function start(handle){
    stop();
    const r=handle.getBoundingClientRect();
    const svg=node('svg',{'aria-hidden':'true',class:'chain-drag-art'});
    svg.style.color=getComputedStyle(handle).color;
    document.body.append(svg);
    drag={
      svg,
      handle,
      a:{x:r.left+r.width/2,y:r.top+r.height/2}
    };
    draw(svg,drag.a,drag.a,false);
  }
  function move(x,y,target){
    if(!drag)return;
    let b={x,y};
    if(target){
      const r=target.getBoundingClientRect();
      b={x:r.left+r.width/2,y:r.top+r.height/2<drag.a.y?r.bottom-5:r.top+5};
    }
    const angle=Math.atan2(b.y-drag.a.y,b.x-drag.a.x)*180/Math.PI+90;
    drag.handle.style.transform=`translateX(-50%) rotate(${angle}deg)`;
    draw(drag.svg,drag.a,b,!!target);
  }
  function stop(){
    if(drag?.handle)drag.handle.style.transform='';
    drag?.svg.remove();
    drag=null;
  }
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
