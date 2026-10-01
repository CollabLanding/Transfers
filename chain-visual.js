/* Pointer-transparent chain artwork; load/link state remains in app.js. */
window.TransferChainVisual = (() => {
  const ns = 'http://www.w3.org/2000/svg';
  const LINK_PATH = 'M-5 -7H5A7 7 0 0 1 5 7H-5A7 7 0 0 1-5-7Z';
  let drag = null;

  function node(tag, attrs = {}) {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }

  function addLink(svg, x, y, angle, scale = 1) {
    const path = node('path', {
      d: LINK_PATH,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2.5',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      transform: `translate(${x} ${y}) rotate(${angle}) scale(${scale})`,
      class: 'chain-link'
    });
    svg.append(path);
  }

  function draw(svg, a, b, hooked) {
    svg.replaceChildren();
    svg.classList.toggle('chain-hooked', hooked);

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 6) return;

    const ux = dx / length;
    const uy = dy / length;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const step = 10;
    const count = Math.floor(length / step);

    for (let i = 0; i < count; i++) {
      const d = i * step + step / 2;
      const x = a.x + ux * d;
      const y = a.y + uy * d;
      addLink(svg, x, y, angle + (i % 2 ? 90 : 0), 0.82);
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
