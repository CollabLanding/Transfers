/* Pointer-transparent chain artwork; load/link state remains in app.js. */
window.TransferChainVisual = (() => {
  const ns='http://www.w3.org/2000/svg';
  let drag=null;
  function node(tag,attrs={}){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n}
  function draw(svg,a,b,hooked){
    svg.replaceChildren();
    svg.classList.toggle('chain-hooked',hooked);

    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(length<2)return;

    const ux=dx/length,uy=dy/length;
    const px=-uy,py=ux;

    // One closed chain link matching the proportions of the existing icon.
    // Its top center is the attachment point to the previous link.
    const linkWidth=10;
    const linkHeight=26;
    const pitch=16;
    const step=5;

    const travel=Math.floor(length/step)*step;
    if(travel<step)return;

    const completed=Math.floor(travel/pitch);
    const remainder=travel-completed*pitch;

    // Every completed link overlaps the next one slightly. The small
    // alternating perpendicular offset gives the links an interlocked
    // appearance without turning them horizontal.
    const addLink=(index,topDistance,progress=1)=>{
      const side=index%2===0?-1:1;
      const x=a.x+ux*topDistance+px*side*1.5;
      const y=a.y+uy*topDistance+py*side*1.5;
      const group=node('g',{transform:`translate(${x} ${y}) rotate(${Math.atan2(dy,dx)*180/Math.PI-90}) translate(-5 0)`});
      const path=node('rect',{
        x:0,
        y:0,
        width:linkWidth,
        height:linkHeight,
        rx:linkWidth/2,
        ry:linkWidth/2,
        fill:'none',
        stroke:'currentColor',
        'stroke-width':'2.5',
        'vector-effect':'non-scaling-stroke',
        pathLength:'1'
      });
      if(progress<1){
        path.setAttribute('stroke-dasharray',`${progress} 1`);
        path.setAttribute('stroke-dashoffset','0');
      }
      group.append(path);
      svg.append(group);
    };

    for(let i=0;i<completed;i++)addLink(i,i*pitch,1);

    if(remainder>0){
      addLink(completed,completed*pitch,remainder/linkHeight);
    }
  }

  function start(handle){
    stop();
    const r=handle.getBoundingClientRect();
    const svg=node('svg',{'aria-hidden':'true',class:'chain-drag-art'});
    svg.style.color=getComputedStyle(handle).color;
    document.body.append(svg);

    const centerX=r.left+r.width/2;
    const centerY=r.top+r.height/2;

    // Bottom-left edge of the existing icon is the chain's attachment point.
    const localX=-6;
    const localY=6;
    const anchorX=centerX+localX;
    const anchorY=centerY+localY;

    drag={
      svg,
      handle,
      center:{x:centerX,y:centerY},
      localAnchor:{x:localX,y:localY},
      a:{x:anchorX,y:anchorY}
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

    const angle=Math.atan2(b.y-drag.center.y,b.x-drag.center.x);
    const lx=drag.localAnchor.x,ly=drag.localAnchor.y;
    const anchor={
      x:drag.center.x+lx*Math.cos(angle)-ly*Math.sin(angle),
      y:drag.center.y+lx*Math.sin(angle)+ly*Math.cos(angle)
    };

    drag.handle.style.transform=`translateX(-50%) rotate(${angle*180/Math.PI}rad)`;
    draw(drag.svg,anchor,b,!!target);
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
