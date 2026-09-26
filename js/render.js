'use strict';

(function (WG) {
  const { Hex, TERRAIN, UNIT_TYPES, Symbols } = WG;
  const NS = 'http://www.w3.org/2000/svg';
  const S = Hex.SIZE;
  const LAYERS = ['terrain', 'coast', 'river', 'roads', 'zones', 'cities', 'labels', 'marks', 'fog', 'overlay', 'hover', 'path', 'units', 'fx'];
  const GLYPH = { forest: 'forest', hills: 'hills', mountain: 'mountain', marsh: 'marsh', urban: 'urban', city: 'city', water: 'water' };
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
    <g id="g-city" fill="#7d776d" stroke="#4e4a44" stroke-width="0.8">
      <rect x="-22" y="-10" width="9" height="12"/><rect x="-11" y="-20" width="8" height="22"/><rect x="-1" y="-15" width="9" height="17"/>
      <rect x="10" y="-9" width="10" height="11"/><rect x="-18" y="5" width="12" height="9"/><rect x="-3" y="5" width="9" height="11"/><rect x="9" y="5" width="11" height="8"/>
    </g>
    <g id="g-water" stroke="#5f98c4" stroke-width="1.5" fill="none" stroke-linecap="round">
      <path d="M-15-5q3.5-4 7 0t7 0M-3 8q3.5-4 7 0t7 0"/>
    </g>
    <g id="g-star"><polygon points="0,-7 2,-2.2 7,-2.2 3,1 4.5,6 0,3 -4.5,6 -3,1 -7,-2.2 -2,-2.2"/></g>
    <g id="g-anchor" fill="none" stroke="#1f3a52" stroke-width="1.6" stroke-linecap="round">
      <circle cy="-5" r="2"/><path d="M0-3V6M-4 0H4M-6 2Q-5 7 0 7Q5 7 6 2"/>
    </g>
    <g id="g-mine"><circle r="4.5" fill="#1b1b1b"/><path d="M0-7.5V7.5M-7.5 0H7.5M-5.3-5.3L5.3 5.3M-5.3 5.3L5.3-5.3" stroke="#1b1b1b" stroke-width="1.6"/></g>
    <g id="g-runway" stroke="#3a3a3a" stroke-linecap="round"><path d="M-12 6L12-6" stroke-width="5"/><path d="M-12 6L12-6" stroke="#eee" stroke-width="1" stroke-dasharray="3 3"/></g>`;

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
  // Corner indices shared with the neighbour in each Hex.DIRS direction.
  const EDGE = (d) => [(6 - d) % 6, (7 - d) % 6];
  const corner = (t, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return [t.x + S * Math.cos(a), t.y + S * Math.sin(a)];
  };

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
      let coast = '';
      for (const t of map.list) {
        x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y);
        const terr = TERRAIN[t.terrain];
        el('polygon', { points: Hex.points(S + 0.4, t.x, t.y), fill: terr.color, class: terr.sea ? 'hex sea' : 'hex' }, T);
        const g = GLYPH[t.terrain];
        if (g) {
          const flip = (t.q * 7 + t.r * 13) & 1 ? -1 : 1;
          el('use', { href: '#g-' + g, transform: `translate(${t.x},${t.y}) scale(${flip},1)` }, T);
        }
        if (!terr.sea) {
          Hex.DIRS.forEach((d, i) => {
            const n = map.tiles.get(Hex.key(t.q + d[0], t.r + d[1]));
            if (n && TERRAIN[n.terrain].sea) {
              const [a, b] = EDGE(i).map((c) => corner(t, c));
              coast += `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
            }
          });
        }
        this.fogEls.set(t.key, el('polygon', { points: Hex.points(S + 0.5, t.x, t.y), class: 'fog', visibility: 'hidden' }, this.layers.fog));
      }
      if (coast) el('path', { d: coast, class: 'coastline' }, this.layers.coast);
      this.bounds = { x: x0 - S, y: y0 - S, w: x1 - x0 + 2 * S, h: y1 - y0 + 2 * S };
      this.drawRivers(map);
      this.drawRoads(map);
      this.drawLabels(map);
      this.drawCities(map);
    },

    drawRivers(map) {
      for (const riv of map.rivers || []) {
        if (riv.length < 2) continue;
        const pts = riv.map((k) => map.tiles.get(k)).map((t) => [t.x, t.y]);
        if (!map.riversInland) {
          pts.unshift([pts[0][0], pts[0][1] - S * 1.5]);
          pts.push([pts[pts.length - 1][0], pts[pts.length - 1][1] + S * 1.5]);
        }
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
      if (!d) return;
      el('path', { d, class: 'road-case' }, this.layers.roads);
      el('path', { d, class: 'road' }, this.layers.roads);
    },

    drawLabels(map) {
      for (const l of map.labels || []) {
        const t = el('text', { x: l.x, y: l.y, class: 'map-label ' + (l.cls || '') }, this.layers.labels);
        t.textContent = l.text;
      }
    },

    drawCities(map) {
      const L = this.layers.cities;
      L.replaceChildren();
      for (const t of map.list) {
        if (t.airbase) el('use', { href: '#g-runway', x: t.x + (t.city ? -20 : 0), y: t.y + (t.city ? 18 : 0), class: 'runway' }, L);
      }
      for (const c of map.cities) {
        const color = OWNER[c.city.owner] || '#6b6b6b';
        el('polygon', { points: Hex.points(S - 3, c.x, c.y), class: 'city-ring' + (c.city.owner ? '' : ' neutral'), stroke: color }, L);
        const lbl = el('text', { x: c.x, y: c.y + 33, class: 'city-label' + (c.city.major ? ' major' : '') }, L);
        lbl.textContent = c.city.name;
        if (c.city.vp) {
          el('circle', { cx: c.x + 21, cy: c.y - 22, r: 7.5, fill: color, class: 'vp-badge' }, L);
          const vp = el('text', { x: c.x + 21, y: c.y - 18.6, class: 'vp-text' }, L);
          vp.textContent = c.city.vp;
        }
        if (c.city.capital) el('use', { href: '#g-star', x: c.x - 21, y: c.y - 22, class: 'capital-star' }, L);
        if (c.city.port) el('use', { href: '#g-anchor', x: c.x + 22, y: c.y + 14, class: 'anchor' }, L);
      }
    },

    // Mines known to the viewer and beachheads.
    drawMarks(state, viewer) {
      const L = this.layers.marks;
      L.replaceChildren();
      for (const k in state.mines) {
        const own = state.mines[k] === viewer;
        if (viewer && !own && !state.minesKnown[viewer][k]) continue;
        const t = this.map.tiles.get(k);
        el('use', { href: '#g-mine', x: t.x - 20, y: t.y - 16, class: 'mine ' + state.mines[k] }, L);
      }
      for (const k in state.beachheads) {
        const t = this.map.tiles.get(k);
        const side = state.beachheads[k];
        el('path', { d: `M${t.x - 24} ${t.y + 22}V${t.y + 4}l12 5l-12 5`, class: 'beachhead', fill: OWNER[side] }, L);
      }
    },

    // Zone outlines/tints (air control, satellite coverage) supplied as [{key, cls}] per tile.
    drawZones(cells) {
      const L = this.layers.zones;
      L.replaceChildren();
      for (const c of cells) {
        const t = this.map.tiles.get(c.key);
        el('polygon', { points: Hex.points(S + 0.4, t.x, t.y), class: 'zonecell ' + c.cls }, L);
      }
    },

    // Air picture overlay: tinted cells, zone borders and labels.
    // zones: [{ id, cls }] - each zone is filled as one compound path.
    drawAirPicture(zones, borders, labels) {
      const L = this.layers.zones;
      L.replaceChildren();
      for (const z of zones) el('path', { d: this.zonePath(this.map, z.id), class: 'zonecell ' + z.cls }, L);
      if (borders) el('path', { d: borders, class: 'zone-border' }, L);
      for (const lb of labels || []) {
        const g = el('g', { transform: `translate(${lb.x},${lb.y})`, class: 'zone-label' }, L);
        const t1 = el('text', { y: 0, class: 'zl-name' }, g);
        t1.textContent = lb.name;
        if (lb.sub) { const t2 = el('text', { y: 16, class: 'zl-sub ' + (lb.cls || '') }, g); t2.textContent = lb.sub; }
      }
    },

    zonePath(map, id) {
      map._zonePaths = map._zonePaths || {};
      if (!map._zonePaths[id]) {
        let d = '';
        for (const k of map.zones[id].keys) {
          const t = map.tiles.get(k);
          d += 'M' + Hex.points(S + 0.4, t.x, t.y).split(' ').join('L') + 'Z';
        }
        map._zonePaths[id] = d;
      }
      return map._zonePaths[id];
    },

    zoneBorders(map) {
      if (map._borders) return map._borders;
      let d = '';
      for (const t of map.list) {
        Hex.DIRS.forEach((dir, i) => {
          if (i > 2) return;
          const n = map.tiles.get(Hex.key(t.q + dir[0], t.r + dir[1]));
          if (n && n.zone !== t.zone) {
            const [a, b] = EDGE(i).map((c) => corner(t, c));
            d += `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
          }
        });
      }
      map._borders = d;
      return d;
    },

    updateFog(visible) {
      for (const [k, p] of this.fogEls) {
        const v = !visible || visible.has(k) ? 'hidden' : 'visible';
        if (p.getAttribute('visibility') !== v) p.setAttribute('visibility', v);
      }
    },

    unitMarkup(u) {
      const ut = UNIT_TYPES[u.type];
      const f = Symbols.frame(u.side, ut.domain);
      let s = '';
      if (u.entrenched && ut.domain === 'land') s += `<path class="dug" d="M${-f.hw - 4} -3V${f.bottom + 3}H${f.hw + 4}V-3"/>`;
      s += Symbols.build(u.type, u.side, { echelon: u.echelon, country: u.country });
      const n = ut.steps, w = 6, gap = 2, tot = n * w + (n - 1) * gap;
      for (let i = 0; i < n; i++) {
        s += `<rect class="pip${i < u.steps ? ' on' : ''}" x="${-tot / 2 + i * (w + gap)}" y="${f.bottom + 5}" width="${w}" height="4"/>`;
      }
      if (u.cargo && u.cargo.length) {
        s += `<circle class="cargo" cx="${f.hw + 1}" cy="${f.top + 3}" r="6"/><text class="cargo-t" x="${f.hw + 1}" y="${f.top + 6}">${u.cargo.length}</text>`;
      }
      if (ut.domain === 'land' && !u.supplied) {
        s += `<g class="oos"><circle cx="${f.hw + 2}" cy="${f.bottom - 2}" r="6"/><text x="${f.hw + 2}" y="${f.bottom + 1.5}">!</text></g>`;
      }
      if (ut.emitter && !u.emitting) {
        s += `<g class="emcon"><circle cx="${-f.hw - 1}" cy="${f.bottom - 2}" r="5.5"/><path d="M${-f.hw - 5} ${f.bottom + 2}l8 -8"/></g>`;
      }
      return s;
    },

    syncUnits(units, { isVisible, isSpent, selectedId }) {
      const seen = new Set();
      const layersAt = new Map();
      for (const u of units) {
        if (u.carrier || !isVisible(u)) continue;
        const k = u.q + ',' + u.r;
        layersAt.set(k, (layersAt.get(k) || 0) | (UNIT_TYPES[u.type].domain === 'land' ? 1 : 2));
      }
      for (const u of units) {
        if (u.carrier) continue;
        seen.add(u.id);
        let g = this.unitEls.get(u.id);
        if (!g) {
          g = el('g', { class: 'unit ' + u.side }, this.layers.units);
          g._sig = '';
          this.unitEls.set(u.id, g);
        }
        const sig = [u.steps, u.entrenched, u.cargo ? u.cargo.length : '', u.supplied, u.emitting].join('|');
        if (g._sig !== sig) { g.innerHTML = this.unitMarkup(u); g._sig = sig; }
        const land = UNIT_TYPES[u.type].domain === 'land';
        const both = layersAt.get(u.q + ',' + u.r) === 3;
        g._off = both ? (land ? [-10, -8] : [12, 11]) : [0, 0];
        g._scale = both ? (land ? 0.8 : 0.72) : land ? 1 : 0.92;
        const p = Hex.toPixel(u.q, u.r);
        this.place(g, p.x, p.y);
        g.style.display = isVisible(u) ? '' : 'none';
        g.classList.toggle('spent', !!isSpent(u));
        g.classList.toggle('selected', u.id === selectedId);
      }
      for (const [id, g] of this.unitEls) {
        if (!seen.has(id)) { g.remove(); this.unitEls.delete(id); }
      }
    },

    place(g, x, y) {
      const o = g._off || [0, 0];
      g.setAttribute('transform', `translate(${x + o[0]},${y + o[1]}) scale(${g._scale || 1})`);
    },

    showUnit(u) {
      const g = this.unitEls.get(u.id);
      if (g) g.style.display = '';
    },

    drawOverlay({ sel, dests, zoc, targets, landings, embarks, circles }) {
      const L = this.layers.overlay;
      L.replaceChildren();
      for (const c of circles || []) {
        const t = this.map.tiles.get(c.key);
        el('circle', { cx: t.x, cy: t.y, r: c.r * Hex.SIZE * 1.73 + S * 0.8, class: 'range ' + c.cls }, L);
      }
      if (!sel) return;
      for (const k of dests || []) {
        const t = this.map.tiles.get(k);
        el('polygon', { points: Hex.points(S - 1.5, t.x, t.y), class: 'reach' + (zoc && zoc.has(k) ? ' zoc' : '') }, L);
      }
      for (const l of landings || []) {
        const t = this.map.tiles.get(l.key);
        el('polygon', { points: Hex.points(S - 2.5, t.x, t.y), class: l.assault ? 'landing assault' : 'landing' }, L);
      }
      for (const s of embarks || []) {
        const p = Hex.toPixel(s.q, s.r);
        el('polygon', { points: Hex.points(S - 2.5, p.x, p.y), class: 'embark' }, L);
      }
      for (const e of targets || []) {
        const p = Hex.toPixel(e.q, e.r);
        el('polygon', { points: Hex.points(S - 3, p.x, p.y), class: 'target' }, L);
      }
      if (sel.q !== undefined) {
        const p = Hex.toPixel(sel.q, sel.r);
        el('polygon', { points: Hex.points(S - 2.5, p.x, p.y), class: 'selhex' }, L);
      }
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
        this.place(g, from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      });
    },

    // Glide along a sequence of tiles in one tween.
    animatePath(u, tiles, ms) {
      const g = this.unitEls.get(u.id);
      if (!g || tiles.length < 2) return Promise.resolve();
      const n = tiles.length - 1;
      return tween(ms, (k) => {
        const f = ease(k) * n;
        const i = Math.min(n - 1, Math.floor(f));
        const t = f - i;
        const a = tiles[i], b = tiles[i + 1];
        this.place(g, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      });
    },

    lunge(u, from, to, ms = 260) {
      const g = this.unitEls.get(u.id);
      if (!g) return Promise.resolve();
      return tween(ms, (k) => {
        const e = Math.sin(k * Math.PI) * 0.38;
        this.place(g, from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      });
    },

    tracer(from, to, ms = 380, cls = 'tracer') {
      const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2 - Math.hypot(to.x - from.x, to.y - from.y) * 0.35;
      const p = el('path', { d: `M${from.x} ${from.y}Q${mx} ${my} ${to.x} ${to.y}`, class: cls }, this.layers.fx);
      const len = p.getTotalLength ? p.getTotalLength() : 300;
      p.setAttribute('stroke-dasharray', `14 ${len}`);
      return tween(ms, (k) => p.setAttribute('stroke-dashoffset', String(-k * len))).then(() => p.remove());
    },

    flash(t, cls = 'blast') {
      const c = el('circle', { cx: t.x, cy: t.y, r: 4, class: cls }, this.layers.fx);
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
