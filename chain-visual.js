/* Pointer-transparent chain artwork; load/link state remains in app.js. */
window.TransferChainVisual = (() => {
  const ns='http://www.w3.org/2000/svg';
  let drag=null;
  function node(tag,attrs={}){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n}
  function draw(svg,a,b,hooked){
    svg.replaceChildren();svg.classList.toggle('chain-hooked',hooked);

    // Repeat the exact same two-link SVG artwork used by the clickable
    // chain button. The connection is simply more copies of that icon
    // tiled end-to-end between the two jobs.
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(length<8)return;

    const iconPath="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2";
    const ux=dx/length,uy=dy/length;
    const spacing=13;
    const first=8;
    const last=Math.max(first,length-8);
    const count=Math.max(1,Math.floor((last-first)/spacing)+1);

    for(let i=0;i<count;i++){
      const d=count===1?(first+last)/2:first+(i*(last-first))/(count-1);
      const x=a.x+ux*d,y=a.y+uy*d;
      const group=node('g',{transform:`translate(${x-12} ${y-12})`});
      group.append(node('path',{
        d:iconPath,
        fill:'none',
        stroke:'currentColor',
        'stroke-width':'2.5',
        'stroke-linecap':'round'
      }));
      svg.append(group);
    }
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
