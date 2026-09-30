/* Pointer-transparent chain artwork; load/link state remains in app.js. */
window.TransferChainVisual = (() => {
  const ns='http://www.w3.org/2000/svg';
  let drag=null;
  function node(tag,attrs={}){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n}
  function draw(svg,a,b,hooked){
    svg.replaceChildren();svg.classList.toggle('chain-hooked',hooked);

    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(length<2)return;

    // The extension starts from the bottom-left of the existing icon.
    // Every 5px of mouse travel reveals the next portion of the link.
    const direction=Math.atan2(dy,dx)*180/Math.PI;
    const ux=dx/length,uy=dy/length;
    const first=5;
    const step=5;
    const drawn=Math.floor(length/step)*step;
    if(drawn<step)return;

    // One closed link, sized to match the existing chain icon visually.
    // It is revealed progressively along the direction of travel.
    const linkPath="M 0 -8 a 5 5 0 1 0 10 0 v 16 a 5 5 0 1 0 -10 0 Z";
    const linkWidth=10;
    const linkLength=26;
    const startX=a.x;
    const startY=a.y;

    const group=node('g',{
      transform:`translate(${startX} ${startY}) rotate(${direction})`
    });

    const outline=node('path',{
      d:linkPath,
      fill:'none',
      stroke:'currentColor',
      'stroke-width':'2.5',
      'stroke-linecap':'round',
      'stroke-linejoin':'round',
      'stroke-dasharray':String(2*Math.PI*5+2*(linkLength-10)),
      'stroke-dashoffset':String(Math.max(0,2*Math.PI*5+2*(linkLength-10)-Math.min(linkLength,drawn)))
    });
    group.append(outline);
    svg.append(group);

    // Once a full link has been drawn, begin the next link immediately
    // from its bottom-left connection point, repeating the same five-pixel
    // reveal behavior.
    const fullLinkDistance=linkLength-1;
    const fullCount=Math.floor(drawn/fullLinkDistance);
    for(let i=1;i<fullCount;i++){
      const d=i*fullLinkDistance;
      const x=startX+ux*d,y=startY+uy*d;
      const g=node('g',{
        transform:`translate(${x} ${y}) rotate(${direction})`
      });
      g.append(node('path',{
        d:linkPath,
        fill:'none',
        stroke:'currentColor',
        'stroke-width':'2.5',
        'stroke-linecap':'round',
        'stroke-linejoin':'round'
      }));
      svg.append(g);
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
