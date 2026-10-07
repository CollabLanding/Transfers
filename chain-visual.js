/* Artwork only: board-links.js owns all linking and group movement. */
window.TransferChainVisual = (() => {
  const ns = 'http://www.w3.org/2000/svg';
  // Complete the hidden side of one original icon link, preserving its arcs.
  const ring = 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-3 3a5 5 0 0 0 0 7Z';
  const pitch = 10;
  let drag = null, serial = 0;
  const turned = new Map();
  function node(tag, attrs = {}) {
    const n = document.createElementNS(ns, tag);
    for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,v);
    return n;
  }
  function path(x, stroke = 'currentColor', width = 2.5) {
    return node('path', {d:ring, fill:'none', stroke, 'stroke-width':width,
      'stroke-linecap':'round', 'stroke-linejoin':'round',
      transform:`translate(${x} 0) rotate(45) translate(-15 -8)`});
  }
  function orient(handle, b) {
    const icon = handle.querySelector('svg');
    const r = handle.getBoundingClientRect();
    const c = {x:r.left+r.width/2, y:r.top+r.height/2};
    const angle = Math.atan2(b.y-c.y,b.x-c.x);
    const rotation = angle - Math.atan2(4,-3);
    const scale = (icon?.clientWidth || 16)/24;
    if (icon) {
      if (!turned.has(icon)) turned.set(icon,{transform:icon.style.transform,transition:icon.style.transition});
      icon.style.transition='none';
      icon.style.transform=`rotate(${rotation}rad)`;
    }
    // The lower-left link center rotates with the actual icon.
    return {x:c.x+(-3*Math.cos(rotation)-4*Math.sin(rotation))*scale,
      y:c.y+(-3*Math.sin(rotation)+4*Math.cos(rotation))*scale, scale};
  }
  function restore(icon) {
    const old=turned.get(icon);
    if (!old) return;
    icon.style.transform=old.transform;
    icon.style.transition=old.transition;
    turned.delete(icon);
  }
  function draw(svg,a,b,hooked) {
    svg.replaceChildren();
    svg.classList.toggle('chain-hooked',hooked);
    const length=Math.hypot(b.x-a.x,b.y-a.y);
    const count=Math.floor(length/(pitch*a.scale));
    if (!count) return;
    const id=`transfer-chain-${++serial}`;
    const defs=node('defs');
    const top=node('clipPath',{id:id+'-top',clipPathUnits:'userSpaceOnUse'});
    top.append(node('rect',{x:-30,y:-20,width:count*pitch+60,height:20}));
    const bottom=node('clipPath',{id:id+'-bottom',clipPathUnits:'userSpaceOnUse'});
    bottom.append(node('rect',{x:-30,y:0,width:count*pitch+60,height:20}));
    defs.append(top,bottom);svg.append(defs);
    const group=node('g',{transform:`translate(${a.x} ${a.y}) rotate(${Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI}) scale(${a.scale})`});
    svg.append(group);
    for(let i=1;i<=count;i++) {
      const x=i*pitch;
      const mask=node('mask',{id:`${id}-${i}`,maskUnits:'userSpaceOnUse',x:x-12,y:-12,width:24,height:24,'mask-type':'luminance'});
      mask.append(node('rect',{x:x-12,y:-12,width:24,height:24,fill:'white'}));
      // Each joint goes over at one crossing and under at the other.
      // Masks expose the actual background, including on translucent cards.
      const previous=node('g',{'clip-path':`url(#${id}-bottom)`});
      previous.append(path(x-pitch,'black',4.5));mask.append(previous);
      if(i<count) {
        const next=node('g',{'clip-path':`url(#${id}-top)`});
        next.append(path(x+pitch,'black',4.5));mask.append(next);
      }
      defs.append(mask);
      const link=node('g',{mask:`url(#${id}-${i})`});link.append(path(x));
      link.setAttribute('data-chain-link',String(i));group.append(link);
    }
  }
  function endpoint(target,from) {
    const r=target.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2<from.y?r.bottom-5:r.top+5};
  }
  function start(handle) {
    stop();
    const svg=node('svg',{'aria-hidden':'true',class:'chain-drag-art'});
    svg.style.color=getComputedStyle(handle).color;
    document.body.append(svg);drag={svg,handle};
  }
  function move(x,y,target) {
    if(!drag)return;
    const r=drag.handle.getBoundingClientRect();
    const b=target?endpoint(target,{y:r.top+r.height/2}):{x,y};
    const a=orient(drag.handle,b);
    draw(drag.svg,a,b,!!target);
  }
  function stop() {
    if(!drag)return;
    restore(drag.handle.querySelector('svg'));
    drag.svg.remove();drag=null;
  }
  function renderLinks(grid,links) {
    stop();
    for(const icon of [...turned.keys()])restore(icon);
    grid.querySelectorAll('.chain-connected').forEach(n=>n.classList.remove('chain-connected'));
    grid.querySelectorAll('.chain-saved-art').forEach(n=>n.remove());
    const body=grid.querySelector('.bodyrow');if(!body)return;
    const cards=new Map([...body.querySelectorAll('[data-box-key]')].map(n=>[n.dataset.boxKey,n]));
    const origin=body.getBoundingClientRect();
    for(const row of links) {
      const from=cards.get(row.source_key),to=cards.get(row.target_key);
      const handle=from?.querySelector('.load-chain');if(!handle||!to)continue;
      handle.classList.add('chain-connected');
      const r=handle.getBoundingClientRect();
      const b=endpoint(to,{y:r.top+r.height/2}),a=orient(handle,b);
      const svg=node('svg',{'aria-hidden':'true',class:'chain-saved-art',width:body.scrollWidth,height:body.scrollHeight});
      svg.style.color=getComputedStyle(handle).color;body.append(svg);
      draw(svg,{x:a.x-origin.left,y:a.y-origin.top,scale:a.scale},
        {x:b.x-origin.left,y:b.y-origin.top},true);
    }
  }
  return {start,move,stop,renderLinks};
})();
