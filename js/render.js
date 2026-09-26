'use strict';

(function (WG) {
  const { Hex, TERRAIN, UNIT_TYPES, Symbols } = WG;
  const NS = 'http://www.w3.org/2000/svg';
  const S = Hex.SIZE;
  const LAYERS = ['terrain', 'river', 'roads', 'cities', 'fog', 'overlay', 'hover', 'path', 'units', 'fx'];
  const GLYPH = { forest: 'forest', hills: 'hills', mountain: 'mountain', marsh: 'marsh', urban: 'urban', water: 'water' };
  const OWNER = { blue: WG.SIDES.blue.color, red: WG.SIDES.red.color };

  const GLYPHS = `
    <g id="g-forest" stroke="#5f8445" stroke-width="1" fill="#86ad66">
      <circle cx="-13" cy="7" r="6.5"/><circle cx="1" cy="10" r="7"/><circle cx="14" cy="5" r="6"/>
      <circle cx="-6" cy="-6" r="6.5"/><circle cx="9" cy="-9" r="6"/><circle cx="-17" cy="-6" r="4.5"/>
    </g>
    <g id="g-hills" fill="none" stroke="#b39456" stroke-width="2.2" stroke-linecap="round">
      <path d="M-24 9q9-14 18 0"/><path d="M-2 13q10-16 20 0"/><path d="M-9-6q8-12 16 0"/>
    </g>
    <g id="g-mountain" stroke-linejoin="round">
      <path d="M-25 15L-9-12L-1 0L7-16L25 15Z" fill="#a6937a" stroke="#6d5d48" stroke-width="1.2"/>
      <path d="M-9-12L-13.5-4.2L-10-6L-7.5-5L-6.6-8.4ZM7-16L4.6-11.2L7.5-12.5L9.5-10L11.3-8.5Z" fill="#f7f4ee"/>
    </g>
    <g id="g-marsh" stroke="#5f7d55" stroke-width="1.4" stroke-linecap="round" fill="none">
      <path d="M-20-4h12M-14-4v-7M-17-4l-2-5M-11-4l2-5M2-10h12M8-10v-7M5-10l-2-5M11-10l2-5M-8 12h12M-2 12v-7M-5 12l-2-5M1 12l2-5"/>
      <path d="M8 5h12M-24 7h9" stroke="#7aa0b8"/>
    </g>
    <g id="g-urban" fill="#908a80" stroke="#5e5a54" stroke-width="0.8">
      <rect x="-16" y="-12" width="10" height="9"/><rect x="-3" y="-15" width="8" height="12"/><rect x="8" y="-10" width="9" height="8"/>
      <rect x="-14" y="2" width="8" height="8"/><rect x="-3" y="1" width="11" height="10"/><rect x="11" y="3" width="6" height="8"/>
    </g>
    <g id="g-water" stroke="#5f98c4" stroke-width="1.5" fill="none" stroke-linecap="round">
      <path d="M-15-5q3.5-4 7 0t7 0M-3 8q3.5-4 7 0t7 0"/>
    </g>
    <g id="g-star"><polygon points="0,-7 2,-2.2 7,-2.2 3,1 4.5,6 0,3 -4.5,6 -3,1 -7,-2.2 -2,-2.2"/></g>`;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function tween(ms, fn) {
    return new Promise((resolve) => {
      if (ms <= 0) { fn(1); resolve(); return; }
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        fn(k);
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  const Render = {
    init(svg) {
      this.svg = svg;
      svg.querySelector('defs').innerHTML = GLYPHS;
      this.layers = {};
      for (const n of LAYERS) this.layers[n] = el('g', { id: 'layer-' + n }, svg);
      this.unitEls = new Map();
      this.fogEls = new Map();
      this.hoverEl = null;
    },

    drawMap(map) {
      this.map = map;
      for (const n of LAYERS) this.layers[n].replaceChildren();
      this.unitEls.clear();
      this.fogEls.clear();
      this.hoverEl = null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const T = this.layers.terrain;
      for (const t of map.list) {
        x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y);
        el('polygon', { points: Hex.points(S, t.x, t.y), fill: TERRAIN[t.terrain].color, class: 'hex' }, T);
        const g = GLYPH[t.terrain];
        if (g) {
          const flip = (t.q * 7 + t.r * 13) & 1 ? -1 : 1;
          el('use', { href: '#g-' + g, transform: `translate(${t.x},${t.y}) scale(${flip},1)` }, T);
        }
        this.fogEls.set(t.key, el('polygon', { points: Hex.points(S + 0.5, t.x, t.y), class: 'fog', visibility: 'hidden' }, this.layers.fog));
      }
      this.bounds = { x: x0 - S, y: y0 - S, w: x1 - x0 + 2 * S, h: y1 - y0 + 2 * S };
      this.drawRivers(map);
      this.drawRoads(map);
      this.drawCities(map);
    },

    drawRivers(map) {
      for (const riv of map.rivers) {
        const pts = riv.map((k) => map.tiles.get(k)).map((t) => [t.x, t.y]);
        pts.unshift([pts[0][0], pts[0][1] - S * 1.5]);
        pts.push([pts[pts.length - 1][0], pts[pts.length - 1][1] + S * 1.5]);
        let d = `M${pts[0][0]} ${pts[0][1]}`;
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
          d += `Q${pts[i][0]} ${pts[i][1]} ${mx} ${my}`;
        }
        d += `L${pts[pts.length - 1][0]} ${pts[pts.length - 1][1]}`;
        el('path', { d, class: 'river-bank' }, this.layers.river);
        el('path', { d, class: 'river' }, this.layers.river);
      }
    },

    drawRoads(map) {
      let d = '';
      for (const e of map.roadEdges) {
        const [a, b] = e.split('|').map((k) => map.tiles.get(k));
        d += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      }
      el('path', { d, class: 'road-case' }, this.layers.roads);
      el('path', { d, class: 'road' }, this.layers.roads);
    },

    drawCities(map) {
      const L = this.layers.cities;
      L.replaceChildren();
      for (const c of map.cities) {
        const color = OWNER[c.city.owner] || '#6b6b6b';
        el('polygon', { points: Hex.points(S - 3, c.x, c.y), class: 'city-ring' + (c.city.owner ? '' : ' neutral'), stroke: color }, L);
        const lbl = el('text', { x: c.x, y: c.y + 33, class: 'city-label' }, L);
        lbl.textContent = c.city.name;
        el('circle', { cx: c.x + 21, cy: c.y - 22, r: 7.5, fill: color, class: 'vp-badge' }, L);
        const vp = el('text', { x: c.x + 21, y: c.y - 18.6, class: 'vp-text' }, L);
        vp.textContent = c.city.vp;
        if (c.city.capital) el('use', { href: '#g-star', x: c.x - 21, y: c.y - 22, class: 'capital-star' }, L);
      }
    },

    updateFog(visible) {
      for (const [k, p] of this.fogEls) {
        const v = !visible || visible.has(k) ? 'hidden' : 'visible';
        if (p.getAttribute('visibility') !== v) p.setAttribute('visibility', v);
      }
    },

    unitMarkup(u) {
      const ut = UNIT_TYPES[u.type];
      const f = Symbols.FRAMES[u.side];
      let s = '';
      if (u.entrenched) s += `<path class="dug" d="M${-f.hw - 4} -3V${f.bottom + 3}H${f.hw + 4}V-3"/>`;
      s += Symbols.build(u.type, u.side);
      const n = ut.steps, w = 6, gap = 2, tot = n * w + (n - 1) * gap;
      for (let i = 0; i < n; i++) {
        s += `<rect class="pip${i < u.steps ? ' on' : ''}" x="${-tot / 2 + i * (w + gap)}" y="${f.bottom + 6}" width="${w}" height="4"/>`;
      }
      return s;
    },

    syncUnits(units, { isVisible, isSpent, selectedId }) {
      const seen = new Set();
      for (const u of units) {
        seen.add(u.id);
        let g = this.unitEls.get(u.id);
        if (!g) {
          g = el('g', { class: 'unit ' + u.side }, this.layers.units);
          g._sig = '';
          this.unitEls.set(u.id, g);
        }
        const sig = u.steps + '|' + u.entrenched;
        if (g._sig !== sig) { g.innerHTML = this.unitMarkup(u); g._sig = sig; }
        const p = Hex.toPixel(u.q, u.r);
        g.setAttribute('transform', `translate(${p.x},${p.y})`);
        g.style.display = isVisible(u) ? '' : 'none';
        g.classList.toggle('spent', !!isSpent(u));
        g.classList.toggle('selected', u.id === selectedId);
      }
      for (const [id, g] of this.unitEls) {
        if (!seen.has(id)) { g.remove(); this.unitEls.delete(id); }
      }
    },

    showUnit(u) {
      const g = this.unitEls.get(u.id);
      if (g) g.style.display = '';
    },

    drawOverlay({ sel, dests, zoc, targets }) {
      const L = this.layers.overlay;
      L.replaceChildren();
      if (!sel) return;
      for (const k of dests) {
        const t = this.map.tiles.get(k);
        el('polygon', { points: Hex.points(S - 1.5, t.x, t.y), class: 'reach' + (zoc.has(k) ? ' zoc' : '') }, L);
      }
      for (const e of targets) {
        const p = Hex.toPixel(e.q, e.r);
        el('polygon', { points: Hex.points(S - 3, p.x, p.y), class: 'target' }, L);
      }
      const p = Hex.toPixel(sel.q, sel.r);
      el('polygon', { points: Hex.points(S - 2.5, p.x, p.y), class: 'selhex' }, L);
    },

    setHover(t) {
      if (!t) { if (this.hoverEl) this.hoverEl.setAttribute('visibility', 'hidden'); return; }
      if (!this.hoverEl) this.hoverEl = el('polygon', { points: Hex.points(S - 1.5), class: 'hoverhex' }, this.layers.hover);
      this.hoverEl.setAttribute('transform', `translate(${t.x},${t.y})`);
      this.hoverEl.setAttribute('visibility', 'visible');
    },

    drawPath(tiles, cost) {
      const L = this.layers.path;
      L.replaceChildren();
      if (!tiles || tiles.length < 2) return;
      el('polyline', { points: tiles.map((t) => `${t.x},${t.y}`).join(' '), class: 'movepath' }, L);
      const end = tiles[tiles.length - 1];
      el('circle', { cx: end.x, cy: end.y, r: 11, class: 'movepath-end' }, L);
      const tx = el('text', { x: end.x, y: end.y + 4, class: 'movepath-cost' }, L);
      tx.textContent = +cost.toFixed(1);
    },

    // ---------- animation & effects
    animateMove(u, from, to, ms) {
      const g = this.unitEls.get(u.id);
      if (!g) return Promise.resolve();
      return tween(ms, (k) => {
        const e = ease(k);
        g.setAttribute('transform', `translate(${from.x + (to.x - from.x) * e},${from.y + (to.y - from.y) * e})`);
      });
    },

    lunge(u, from, to, ms = 260) {
      const g = this.unitEls.get(u.id);
      if (!g) return Promise.resolve();
      return tween(ms, (k) => {
        const e = Math.sin(k * Math.PI) * 0.38;
        g.setAttribute('transform', `translate(${from.x + (to.x - from.x) * e},${from.y + (to.y - from.y) * e})`);
      });
    },

    tracer(from, to, ms = 380) {
      const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2 - Math.hypot(to.x - from.x, to.y - from.y) * 0.35;
      const p = el('path', { d: `M${from.x} ${from.y}Q${mx} ${my} ${to.x} ${to.y}`, class: 'tracer' }, this.layers.fx);
      const len = p.getTotalLength ? p.getTotalLength() : 300;
      p.setAttribute('stroke-dasharray', `14 ${len}`);
      return tween(ms, (k) => p.setAttribute('stroke-dashoffset', String(-k * len))).then(() => p.remove());
    },

    flash(t) {
      const c = el('circle', { cx: t.x, cy: t.y, r: 4, class: 'blast' }, this.layers.fx);
      tween(480, (k) => {
        c.setAttribute('r', 4 + k * 30);
        c.setAttribute('opacity', 1 - k);
      }).then(() => c.remove());
    },

    floatText(t, text, color) {
      const tx = el('text', { x: t.x, y: t.y - 12, class: 'float', fill: color }, this.layers.fx);
      tx.textContent = text;
      tween(1400, (k) => {
        tx.setAttribute('y', t.y - 12 - k * 30);
        tx.setAttribute('opacity', k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
      }).then(() => tx.remove());
    },
  };

  WG.Render = Render;
})(window.WG);
