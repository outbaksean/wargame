'use strict';

(function (WG) {
  const { Hex } = WG;
  const edgeKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  function valueNoise(rng, w, h, cell) {
    const gw = Math.ceil(w / cell) + 3, gh = Math.ceil(h / cell) + 3;
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    const ox = rng() * cell, oy = rng() * cell;
    const s = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const fx = (x + ox) / cell, fy = (y + oy) / cell;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = s(fx - x0), ty = s(fy - y0);
      const v = (i, j) => g[j * gw + i];
      const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
      const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
      return a + (b - a) * ty;
    };
  }

  function fractal(rng, w, h, octaves) {
    const layers = octaves.map(([cell, weight]) => ({ n: valueNoise(rng, w, h, cell), weight }));
    return (x, y) => layers.reduce((sum, l) => sum + l.n(x, y) * l.weight, 0);
  }

  // Rank-normalise a property to 0..1 so terrain thresholds are percentages.
  function percentile(list, prop) {
    const sorted = list.slice().sort((a, b) => a[prop] - b[prop]);
    sorted.forEach((t, i) => { t[prop] = i / (sorted.length - 1); });
  }

  const ROAD_COST = { clear: 1, forest: 2, hills: 2.5, mountain: 7, urban: 1, marsh: 4, river: 6, water: Infinity };

  function roadPath(tiles, a, b, roadEdges) {
    const g = new Map([[a.key, 0]]);
    const prev = new Map();
    const closed = new Set();
    const pq = new WG.PQ();
    pq.push(a.key, 0);
    while (pq.size) {
      const k = pq.pop().item;
      if (k === b.key) break;
      if (closed.has(k)) continue;
      closed.add(k);
      const t = tiles.get(k);
      const gk = g.get(k);
      for (const n of Hex.neighbors(t.q, t.r)) {
        const nt = tiles.get(Hex.key(n.q, n.r));
        if (!nt || closed.has(nt.key)) continue;
        const c = roadEdges.has(edgeKey(k, nt.key)) ? 0.3 : ROAD_COST[nt.terrain];
        if (!isFinite(c)) continue;
        const ng = gk + c;
        if (ng < (g.has(nt.key) ? g.get(nt.key) : Infinity)) {
          g.set(nt.key, ng);
          prev.set(nt.key, k);
          pq.push(nt.key, ng + Hex.distance(nt.q, nt.r, b.q, b.r) * 0.3);
        }
      }
    }
    if (!prev.has(b.key)) return null;
    const path = [b.key];
    let k = b.key;
    while (prev.has(k)) { k = prev.get(k); path.push(k); }
    return path.reverse();
  }

  WG.generateMap = function ({ seed, cols, rows }) {
    const rng = WG.rng(seed);
    const tiles = new Map();
    const list = [];
    const elevN = fractal(rng, cols + 1, rows + 1, [[7, 0.55], [3.5, 0.3], [1.7, 0.15]]);
    const moistN = fractal(rng, cols + 1, rows + 1, [[6, 0.6], [3, 0.3], [1.5, 0.1]]);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const { q, r } = Hex.offsetToAxial(col, row);
        const x = col + (row & 1) * 0.5, y = row * 0.866;
        const t = { q, r, col, row, key: Hex.key(q, r), terrain: 'clear', city: null, road: false, elev: elevN(x, y), moist: moistN(x, y) };
        Object.assign(t, Hex.toPixel(q, r));
        tiles.set(t.key, t);
        list.push(t);
      }
    }
    percentile(list, 'elev');
    percentile(list, 'moist');
    for (const t of list) {
      if (t.elev < 0.035) t.terrain = 'water';
      else if (t.elev > 0.95) t.terrain = 'mountain';
      else if (t.elev > 0.8) t.terrain = 'hills';
      else if (t.elev < 0.22 && t.moist > 0.6) t.terrain = 'marsh';
      else if (t.moist > 0.66) t.terrain = 'forest';
    }

    // A river meandering north to south across the middle of the map.
    const at = (col, row) => tiles.get(Hex.key(Hex.offsetToAxial(col, row).q, row));
    const river = [];
    const center = Math.round(cols / 2);
    let col = center + Math.round((rng() - 0.5) * cols * 0.2);
    const lo = Math.round(cols * 0.3), hi = Math.round(cols * 0.7);
    for (let row = 0; row < rows; row++) {
      river.push(at(col, row).key);
      if (row > 0 && row < rows - 1 && rng() < 0.22) {
        const dc = col < center ? 1 : col > center ? -1 : (rng() < 0.5 ? 1 : -1);
        const nc = Math.max(lo, Math.min(hi, col + (rng() < 0.7 ? dc : -dc)));
        if (nc !== col) { col = nc; river.push(at(col, row).key); }
      }
      // Step to one of the two hexes below (odd-r layout).
      const pull = (center - col) * 0.06;
      const goRight = rng() < 0.5 + pull;
      if (row & 1) { if (goRight) col++; } else if (!goRight) col--;
      col = Math.max(lo, Math.min(hi, col));
    }
    for (const k of river) {
      const t = tiles.get(k);
      if (t.terrain !== 'water') t.terrain = 'river';
    }

    // Towns.
    const names = rng.shuffle(WG.TOWN_NAMES.slice());
    const cities = [];
    const ok = (t) => t.terrain !== 'water' && t.terrain !== 'river';
    const place = (t, owner, capital, vp) => {
      t.terrain = 'urban';
      t.city = { name: names[cities.length % names.length], owner, capital, vp };
      cities.push(t);
    };
    const capitalIn = (c0, c1, owner) => {
      const cands = list.filter((t) => ok(t) && t.col >= c0 && t.col <= c1 && t.row >= rows * 0.25 && t.row <= rows * 0.75);
      const good = cands.filter((t) => t.terrain === 'clear' || t.terrain === 'forest');
      place(rng.pick(good.length ? good : cands), owner, true, 5);
    };
    capitalIn(1, Math.max(2, Math.floor(cols * 0.12)), 'blue');
    capitalIn(Math.ceil(cols * 0.88) - 1, cols - 2, 'red');
    const wanted = Math.round((cols * rows) / 55);
    for (let tries = 0; tries < 3000 && cities.length < wanted; tries++) {
      const t = list[rng.int(list.length)];
      if (!ok(t) || t.col < 2 || t.col > cols - 3 || t.row < 1 || t.row > rows - 2) continue;
      if (cities.some((c) => Hex.distance(c.q, c.r, t.q, t.r) < 4)) continue;
      const f = t.col / (cols - 1);
      const owner = f < 0.3 ? 'blue' : f > 0.7 ? 'red' : null;
      place(t, owner, false, owner ? 1 : 2);
    }

    // Roads: link each town to its two nearest, then make sure everything is connected.
    const pairs = new Map();
    const addPair = (a, b) => pairs.set(edgeKey(a.key, b.key), [a, b]);
    for (const c of cities) {
      cities.filter((o) => o !== c)
        .sort((a, b) => Hex.distance(c.q, c.r, a.q, a.r) - Hex.distance(c.q, c.r, b.q, b.r))
        .slice(0, 2)
        .forEach((o) => addPair(c, o));
    }
    const parent = new Map(cities.map((c) => [c.key, c.key]));
    const find = (k) => (parent.get(k) === k ? k : find(parent.get(k)));
    for (const [a, b] of pairs.values()) parent.set(find(a.key), find(b.key));
    for (;;) {
      const roots = new Set(cities.map((c) => find(c.key)));
      if (roots.size <= 1) break;
      let best = null;
      for (const a of cities) {
        for (const b of cities) {
          if (find(a.key) === find(b.key)) continue;
          const d = Hex.distance(a.q, a.r, b.q, b.r);
          if (!best || d < best.d) best = { a, b, d };
        }
      }
      addPair(best.a, best.b);
      parent.set(find(best.a.key), find(best.b.key));
    }
    const roadEdges = new Set();
    const sortedPairs = [...pairs.values()].sort((p1, p2) =>
      Hex.distance(p1[0].q, p1[0].r, p1[1].q, p1[1].r) - Hex.distance(p2[0].q, p2[0].r, p2[1].q, p2[1].r));
    for (const [a, b] of sortedPairs) {
      const path = roadPath(tiles, a, b, roadEdges);
      if (!path) continue;
      for (let i = 0; i < path.length; i++) {
        tiles.get(path[i]).road = true;
        if (i) roadEdges.add(edgeKey(path[i - 1], path[i]));
      }
    }

    return { seed, cols, rows, tiles, list, cities, rivers: [river], roadEdges };
  };
})(window.WG);
