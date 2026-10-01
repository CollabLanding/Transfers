/* Pointer-transparent chain artwork; load/link state remains in app.js. */
window.TransferChainVisual = (() => {
  const ns='http://www.w3.org/2000/svg';
  const LINK_PATH='M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2Q7 9 10 13Z';
  let drag=null;

  function node(tag,attrs={}){
    const n=document.createElementNS(ns,tag);
    for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);
    return n;
  }

  function addLink(svg,x,y,angle,scale=1){
    // One link = one continuous closed loop based on the existing icon geometry.
    // Do not stack/mirror a second copy of the link.
    const path=node('path',{
      d:LINK_PATH+' Z',
      fill:'none',
      stroke:'currentColor',
      'stroke-width':'2.5',
      'stroke-linecap':'round',
      'stroke-linejoin':'round',
      transform:`translate(${x-12*scale} ${y-12*scale}) scale(${scale}) rotate(${angle} 12 12)`,
      class:'chain-link'
    });
    svg.append(path);
  }

  function draw(svg,a,b,hooked){
    svg.replaceChildren();
    svg.classList.toggle('chain-hooked',hooked);

    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(length<6)return;

    const ux=dx/length,uy=dy/length;
    const angle=Math.atan2(dy,dx)*180/Math.PI;
    const spacing=16;
    const first=8;
    const last=length-8;
    const count=Math.max(0,Math.floor((last-first)/spacing)+1);

    for(let i=0;i<count;i++){
      const d=first+i*spacing;
      if(d>last+0.5)break;
      const x=a.x+ux*d,y=a.y+uy*d;
      // Every piece is a complete link, then alternate its orientation so the
      // individual links loop through one another like the original icon.
      addLink(svg,x,y,angle+(i%2?90:0),0.82);
    }
  }

  function start(handle){
    stop();
    const r=handle.getBoundingClientRect();
    const svg=node('svg',{'aria-hidden':'true',class:'chain-drag-art'});
    svg.style.color=getComputedStyle(handle).color;
    document.body.append(svg);
    drag={svg,a:{x:r.left+r.width/2,y:r.bottom-3}};
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
    drag?.svg.remove();
    drag=null;
  }

  function renderLinks(grid,links){
    stop();
    grid.querySelectorAll('.chain-connected').forEach(n=>n.classList.remove('chain-connected'));
    grid.querySelectorAll('.chain-saved-art').forEach(n=>n.remove());
    const body=grid.querySelector('.bodyrow');
    if(!body)return;
    const cards=new Map([...body.querySelectorAll('[data-box-key]')].map(n=>[n.dataset.boxKey,n]));
    const origin=body.getBoundingClientRect();

    for(const row of links){
      const from=cards.get(row.source_key),to=cards.get(row.target_key);
      if(!from||!to)continue;
      const handle=from.querySelector('.load-chain');
      handle.classList.add('chain-connected');
      const r=handle.getBoundingClientRect(),t=to.getBoundingClientRect();
      const svg=node('svg',{
        'aria-hidden':'true',
        class:'chain-saved-art',
        width:body.scrollWidth,
        height:body.scrollHeight
      });
      body.append(svg);
      draw(
        svg,
        {x:r.left+2-origin.left,y:r.bottom-3-origin.top},
        {x:t.left+t.width/2-origin.left,y:(t.top+t.height/2<r.bottom?t.bottom-5:t.top+5)-origin.top},
        true
      );
    }
  }

  return {start,move,stop,renderLinks};
})();
