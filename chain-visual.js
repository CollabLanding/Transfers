/* Pointer-transparent chain artwork; load/link state remains in app.js. */
window.TransferChainVisual = (() => {
  const ns = 'http://www.w3.org/2000/svg';
  const LINK_PATH='M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2Q7 9 10 13Z';
  let drag = null;

  function node(tag, attrs = {}) {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }

  // These are the two exact strokes that make up the original link icon.
  // They are the immutable interlace template for every added link.
  const LINK_A_PATH='M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2Q7 9 10 13Z';
  const LINK_B_PATH='M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2';
  const LINK_SCALE=0.82;

  function addSingleLink(svg,path,cx,cy,x,y,angle,scale=LINK_SCALE){
    const el=node('path',{
      d:path,
      fill:'none',
      stroke:'currentColor',
      'stroke-width':'2.5',
      'stroke-linecap':'round',
      'stroke-linejoin':'round',
      transform:`translate(${x} ${y}) rotate(${angle}) scale(${scale}) translate(${-cx} ${-cy})`,
      class:'chain-link'
    });
    svg.append(el);
  }

  // The original icon's lower-left link is the starting link.
  // Every added link repeats the same interlace: B -> flipped A -> B -> flipped A.
  const LINK_B_CENTER={x:9,y:15};
  const LINK_A_CENTER={x:14,y:9};
  const LINK_STEP_X=LINK_A_CENTER.x-LINK_B_CENTER.x;
  const LINK_STEP_Y=LINK_A_CENTER.y-LINK_B_CENTER.y;
  const LINK_SCALE=0.82;
  const LINK_STEP=Math.hypot(LINK_STEP_X,LINK_STEP_Y)*LINK_SCALE;
  const LINK_STEP_ANGLE=Math.atan2(LINK_STEP_Y,LINK_STEP_X)*180/Math.PI;

  function draw(svg,a,b,hooked){
    svg.replaceChildren();
    svg.classList.toggle('chain-hooked',hooked);

    const dx=b.x-a.x;
    const dy=b.y-a.y;
    const length=Math.hypot(dx,dy);
    if(length<4)return;

    const chainAngle=Math.atan2(dy,dx)*180/Math.PI;
    const baseRotation=chainAngle-LINK_STEP_ANGLE;
    const usable=Math.max(0,length-1);
    const count=Math.floor(usable/LINK_STEP);

    for(let i=1;i<=count;i++){
      const x=a.x+(dx/length)*LINK_STEP*i;
      const y=a.y+(dy/length)*LINK_STEP*i;
      const isA=i%2===1;

      // The A link is flipped relative to its original position so it hooks
      // the preceding B from the opposite side, exactly like a real chain.
      addSingleLink(
        svg,
        isA?LINK_A_PATH:LINK_B_PATH,
        isA?LINK_A_CENTER.x:LINK_B_CENTER.x,
        isA?LINK_A_CENTER.y:LINK_B_CENTER.y,
        x,
        y,
        baseRotation+(isA?180:0),
        LINK_SCALE
      );
    }
  }


  function start(handle) {
    stop();
    const r = handle.getBoundingClientRect();
    const svg = node('svg', { 'aria-hidden': 'true', class: 'chain-drag-art' });
    svg.style.color = getComputedStyle(handle).color;
    document.body.append(svg);

    const icon = handle.querySelector('svg');
    if (icon) {
      icon.style.transition = 'none';
      icon.style.transformOrigin = '50% 50%';
    }

    drag = {
      svg,
      a: { x: r.left + 2, y: r.bottom - 3 },
      handle,
      icon
    };
    draw(svg, drag.a, drag.a, false);
  }

  function move(x, y, target) {
    if (!drag) return;

    const angle = Math.atan2(y - drag.a.y, x - drag.a.x) * 180 / Math.PI;
    if (drag.icon) drag.icon.style.transform = `rotate(${angle}deg)`;

    let b = { x, y };
    if (target) {
      const r = target.getBoundingClientRect();
      b = {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2 < drag.a.y ? r.bottom - 5 : r.top + 5
      };
    }

    draw(drag.svg, drag.a, b, !!target);
  }

  function stop() {
    if (drag?.icon) {
      drag.icon.style.transform = '';
      drag.icon.style.transition = 'transform .15s ease';
    }
    drag?.svg.remove();
    drag = null;
  }

  function renderLinks(grid, links) {
    stop();
    grid.querySelectorAll('.chain-connected').forEach(n => n.classList.remove('chain-connected'));
    grid.querySelectorAll('.chain-saved-art').forEach(n => n.remove());

    const body = grid.querySelector('.bodyrow');
    if (!body) return;

    const cards = new Map(
      [...body.querySelectorAll('[data-box-key]')].map(n => [n.dataset.boxKey, n])
    );
    const origin = body.getBoundingClientRect();

    for (const row of links) {
      const from = cards.get(row.source_key);
      const to = cards.get(row.target_key);
      if (!from || !to) continue;

      const handle = from.querySelector('.load-chain');
      if (!handle) continue;
      handle.classList.add('chain-connected');

      const r = handle.getBoundingClientRect();
      const t = to.getBoundingClientRect();
      const svg = node('svg', {
        'aria-hidden': 'true',
        class: 'chain-saved-art',
        width: body.scrollWidth,
        height: body.scrollHeight
      });
      body.append(svg);

      draw(
        svg,
        { x: r.left + 2 - origin.left, y: r.bottom - 3 - origin.top },
        {
          x: t.left + t.width / 2 - origin.left,
          y: (t.top + t.height / 2 < r.bottom ? t.bottom - 5 : t.top + 5) - origin.top
        },
        true
      );
    }
  }

  return { start, move, stop, renderLinks };
})();
