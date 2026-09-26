'use strict';

// Taiwan Strait theater map built from approximate real geography.
// Hexes are ~12 km across. Coordinates are [longitude, latitude].
(function (WG) {
  const { Hex } = WG;
  const LON0 = 118.2, LAT0 = 26.45;       // top-left corner
  const KX = 101.7, KY = 110.9;           // km per degree at ~24°N
  const HEXKM = 12;
  const PX = (Math.sqrt(3) * Hex.SIZE) / HEXKM; // pixels per km
  const COLS = 44, ROWS = 66;

  const toLL = (x, y) => ({ lon: LON0 + x / PX / KX, lat: LAT0 - y / PX / KY });
  const toXY = (lon, lat) => ({ x: (lon - LON0) * KX * PX, y: (LAT0 - lat) * KY * PX });

  const TAIWAN = [[121.51, 25.30], [121.58, 25.29], [121.74, 25.16], [121.86, 25.12], [122.00, 25.01], [121.93, 24.93], [121.85, 24.83],
    [121.83, 24.70], [121.86, 24.58], [121.83, 24.44], [121.72, 24.28], [121.64, 24.10], [121.62, 23.97], [121.55, 23.75], [121.50, 23.52],
    [121.43, 23.30], [121.37, 23.10], [121.25, 22.90], [121.17, 22.75], [121.03, 22.62], [120.93, 22.45], [120.88, 22.30], [120.88, 22.10],
    [120.85, 21.90], [120.74, 21.93], [120.70, 22.02], [120.64, 22.25], [120.59, 22.36], [120.47, 22.45], [120.38, 22.52], [120.28, 22.60],
    [120.23, 22.73], [120.17, 22.90], [120.13, 23.03], [120.10, 23.20], [120.12, 23.38], [120.13, 23.52], [120.16, 23.70], [120.28, 23.90],
    [120.37, 24.05], [120.45, 24.17], [120.52, 24.30], [120.63, 24.48], [120.75, 24.62], [120.88, 24.75], [120.96, 24.87], [121.05, 25.00],
    [121.18, 25.10], [121.33, 25.15], [121.42, 25.20]];
  const MAINLAND = [[117.0, 27.5], [120.6, 27.5], [120.45, 27.1], [120.2, 26.85], [120.05, 26.65], [119.85, 26.5], [119.75, 26.35], [119.65, 26.15],
    [119.60, 26.00], [119.55, 25.85], [119.62, 25.72], [119.52, 25.58], [119.45, 25.47], [119.30, 25.40], [119.18, 25.35], [119.10, 25.22],
    [119.00, 25.10], [118.93, 25.02], [118.78, 24.93], [118.68, 24.82], [118.62, 24.65], [118.55, 24.57], [118.35, 24.60], [118.20, 24.60],
    [118.05, 24.47], [117.95, 24.35], [117.85, 24.20], [117.5, 23.9], [117.0, 23.6]];
  const MOUNTAINS = [[121.40, 24.75], [121.62, 24.55], [121.60, 24.30], [121.45, 24.05], [121.38, 23.75], [121.25, 23.45], [121.13, 23.15],
    [120.98, 22.80], [120.88, 22.50], [120.82, 22.30], [120.72, 22.40], [120.70, 22.70], [120.78, 23.05], [120.85, 23.40], [120.90, 23.75],
    [120.98, 24.05], [121.10, 24.35], [121.22, 24.60]];
  const HILLS = [[121.35, 24.95], [121.75, 24.70], [121.75, 24.35], [121.60, 23.95], [121.50, 23.55], [121.35, 23.05], [121.15, 22.70],
    [120.95, 22.35], [120.80, 22.05], [120.62, 22.35], [120.55, 22.75], [120.60, 23.10], [120.65, 23.45], [120.72, 23.80], [120.82, 24.15],
    [120.95, 24.45], [121.12, 24.75]];
  const YANGMINGSHAN = [[121.45, 25.22], [121.62, 25.25], [121.68, 25.15], [121.52, 25.12]];

  // Small islands forced onto the grid: [name, lon, lat, region, home, terrain]
  const ISLANDS = [
    ['Penghu', 119.57, 23.57, 'Penghu (Taiwan)', 'blue', 'clear'],
    ['Penghu', 119.62, 23.66, 'Penghu (Taiwan)', 'blue', 'clear'],
    ['Penghu', 119.50, 23.48, 'Penghu (Taiwan)', 'blue', 'clear'],
    ['Kinmen', 118.35, 24.44, 'Kinmen (Taiwan)', 'blue', 'clear'],
    ['Matsu', 119.93, 26.16, 'Matsu (Taiwan)', 'blue', 'hills'],
    ['Pingtan', 119.78, 25.52, 'Fujian (PRC)', 'red', 'clear'],
    ['Yonaguni', 123.00, 24.46, 'Yonaguni (Japan)', 'blue', 'hills'],
    ['Batanes', 121.95, 20.45, 'Batanes (Philippines)', 'blue', 'hills'],
  ];

  // [name, lon, lat, owner, vp, port, major, capital]
  const CITIES = [
    ['Taipei', 121.56, 25.04, 'blue', 8, false, true, true],
    ['Keelung', 121.74, 25.13, 'blue', 2, true],
    ['Tamsui', 121.42, 25.16, 'blue', 1, true],
    ['Taoyuan', 121.30, 24.99, 'blue', 3, false, true],
    ['Hsinchu', 120.97, 24.80, 'blue', 2],
    ['Miaoli', 120.82, 24.56, 'blue', 1],
    ['Taichung', 120.68, 24.15, 'blue', 4, false, true],
    ['Taichung Port', 120.51, 24.29, 'blue', 2, true],
    ['Changhua', 120.54, 24.02, 'blue', 1],
    ['Douliu', 120.54, 23.71, 'blue', 1],
    ['Chiayi', 120.45, 23.48, 'blue', 2],
    ['Tainan', 120.21, 22.99, 'blue', 3, true, true],
    ['Kaohsiung', 120.30, 22.62, 'blue', 5, true, true],
    ['Pingtung', 120.49, 22.67, 'blue', 1],
    ['Hengchun', 120.74, 22.00, 'blue', 1],
    ['Taitung', 121.14, 22.76, 'blue', 1, true],
    ['Hualien', 121.60, 23.99, 'blue', 2, true],
    ['Yilan', 121.75, 24.76, 'blue', 1],
    ["Su'ao", 121.86, 24.59, 'blue', 1, true],
    ['Magong', 119.57, 23.57, 'blue', 2, true],
    ['Kinmen', 118.35, 24.44, 'blue', 1, true],
    ['Matsu', 119.93, 26.16, 'blue', 1, true],
    ['Yonaguni', 123.00, 24.46, 'blue', 0, true],
    ['Basco', 121.95, 20.45, 'blue', 0, true],
    ['Fuzhou', 119.30, 26.08, 'red', 0, false, true],
    ['Mawei', 119.47, 25.99, 'red', 0, true],
    ['Fuqing', 119.38, 25.72, 'red', 0],
    ['Pingtan', 119.78, 25.52, 'red', 0, true],
    ['Putian', 119.02, 25.43, 'red', 0],
    ['Meizhou Bay', 119.12, 25.20, 'red', 0, true],
    ['Quanzhou', 118.68, 24.88, 'red', 0, true, true],
    ['Xiamen', 118.10, 24.48, 'red', 0, true, true],
  ];

  // Landing beaches by area: [lon, lat]
  const BEACHES = {
    north: [[121.10, 25.05], [121.02, 24.99], [121.18, 25.10], [120.92, 24.86], [121.37, 25.17]],
    central: [[120.57, 24.38], [120.50, 24.26], [120.36, 24.05]],
    south: [[120.13, 23.10], [120.15, 22.95], [120.25, 22.67], [120.36, 22.50], [120.57, 22.38]],
    east: [[121.84, 24.86], [121.63, 23.93]],
    penghu: [[119.50, 23.48], [119.62, 23.66]],
  };

  // [id, name, lon, lat, side]
  const AIRBASES = [
    ['hsinchu', 'Hsinchu AB', 120.94, 24.82, 'blue'],
    ['taoyuan', 'Taoyuan AB', 121.23, 25.06, 'blue'],
    ['cck', 'Ching Chuan Kang AB', 120.62, 24.26, 'blue'],
    ['chiayi', 'Chiayi AB', 120.39, 23.46, 'blue'],
    ['tainan', 'Tainan AB', 120.21, 22.95, 'blue'],
    ['pingtung', 'Pingtung AB', 120.46, 22.70, 'blue'],
    ['hualien', 'Hualien AB (Chiashan)', 121.62, 24.02, 'blue'],
    ['taitung', 'Chihhang AB', 121.10, 22.79, 'blue'],
    ['magong', 'Magong AB', 119.63, 23.57, 'blue'],
    ['longtian', 'Longtian AB', 119.44, 25.66, 'red'],
    ['huian', 'Hui\'an AB', 118.83, 25.03, 'red'],
    ['jinjiang', 'Jinjiang AB', 118.59, 24.80, 'red'],
    ['changle', 'Fuzhou Changle', 119.66, 25.93, 'red'],
    ['xiamen', 'Xiamen Gaoqi', 118.13, 24.54, 'red'],
  ];

  const RIVERS = [
    [[120.95, 23.80], [120.75, 23.82], [120.55, 23.84], [120.40, 23.85], [120.27, 23.83]], // Zhuoshui
    [[120.66, 22.98], [120.58, 22.82], [120.50, 22.65], [120.44, 22.50]],                   // Gaoping
    [[120.88, 24.28], [120.72, 24.30], [120.60, 24.32]],                                    // Dajia
  ];

  const ROADS = [
    ['Keelung', 'Taipei', 'Taoyuan', 'Hsinchu', 'Miaoli', 'Taichung', 'Changhua', 'Douliu', 'Chiayi', 'Tainan', 'Kaohsiung', 'Pingtung', 'Hengchun'],
    ['Hengchun', 'Taitung', 'Hualien', "Su'ao", 'Yilan', 'Taipei'],
    ['Tamsui', 'Taipei'], ['Taichung Port', 'Taichung'], ['Tamsui', 'Taoyuan'],
    ['Fuzhou', 'Mawei'], ['Fuzhou', 'Fuqing', 'Putian', 'Meizhou Bay', 'Quanzhou', 'Xiamen'], ['Fuqing', 'Pingtan'],
  ];

  // Air zones: [id, name, lon, lat, kind] - kind limits which tiles a zone may claim.
  const ZONES = [
    ['fjn', 'Fujian North', 119.45, 26.00, 'mainland'],
    ['fjs', 'Fujian South', 118.60, 24.90, 'mainland'],
    ['stn', 'Strait North', 120.35, 25.40, 'sea'],
    ['stc', 'Strait Central', 119.90, 24.55, 'sea'],
    ['sts', 'Penghu Channel', 119.70, 23.20, 'sea'],
    ['twn', 'North Taiwan', 121.35, 24.85, 'taiwan'],
    ['twc', 'Central Taiwan', 120.75, 23.85, 'taiwan'],
    ['tws', 'South Taiwan', 120.65, 22.60, 'taiwan'],
    ['eas', 'East of Taiwan', 122.40, 23.30, 'sea'],
    ['ryu', 'Ryukyu Approaches', 122.60, 25.40, 'sea'],
    ['bsh', 'Bashi Channel', 120.30, 21.30, 'sea'],
    ['lzn', 'Luzon Strait', 122.30, 20.90, 'sea'],
  ];

  const LABELS = [
    ['TAIWAN STRAIT', 119.95, 24.95, ''], ['PHILIPPINE SEA', 122.55, 22.45, ''], ['EAST CHINA SEA', 121.75, 26.05, ''],
    ['BASHI CHANNEL', 120.55, 21.15, ''], ['FUJIAN', 118.75, 25.75, 'land'], ['TAIWAN', 121.05, 23.30, 'land'],
  ];

  function inPoly(poly, lon, lat) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  const ROAD_COST = { clear: 1, urban: 1, city: 1, forest: 2, hills: 2.5, mountain: 6, marsh: 3, river: 4 };
  const edgeKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

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
      for (const n of Hex.neighbors(t.q, t.r)) {
        const nt = tiles.get(Hex.key(n.q, n.r));
        if (!nt || closed.has(nt.key)) continue;
        const base = ROAD_COST[nt.terrain];
        if (base === undefined) continue;
        const c = roadEdges.has(edgeKey(k, nt.key)) ? 0.3 : base;
        const ng = g.get(k) + c;
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

  WG.buildTaiwanMap = function () {
    const rng = WG.rng(20270917);
    const tiles = new Map();
    const list = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const { q, r } = Hex.offsetToAxial(col, row);
        const p = Hex.toPixel(q, r);
        const ll = toLL(p.x, p.y);
        const t = { q, r, col, row, key: Hex.key(q, r), x: p.x, y: p.y, lon: ll.lon, lat: ll.lat, terrain: 'sea', city: null, road: false };
        if (inPoly(TAIWAN, ll.lon, ll.lat)) { t.land = 'taiwan'; t.mass = 'taiwan'; t.region = 'Taiwan'; t.home = 'blue'; }
        else if (inPoly(MAINLAND, ll.lon, ll.lat)) { t.land = 'mainland'; t.mass = 'mainland'; t.region = 'Fujian (PRC)'; t.home = 'red'; }
        tiles.set(t.key, t);
        list.push(t);
      }
    }
    const at = (lon, lat) => {
      const p = toXY(lon, lat);
      const h = Hex.fromPixel(p.x, p.y);
      return tiles.get(Hex.key(h.q, h.r)) || null;
    };
    for (const [name, lon, lat, region, home, terrain] of ISLANDS) {
      const t = at(lon, lat);
      if (!t) continue;
      t.land = t.land || 'island';
      t.islandName = name;
      t.mass = name;
      t.region = region;
      t.home = home;
      t.terrain = terrain;
    }
    const isLand = (t) => !!t.land;
    const seaAdj = (t) => Hex.neighbors(t.q, t.r).some((n) => { const nt = tiles.get(Hex.key(n.q, n.r)); return nt && !isLand(nt); });

    // Terrain.
    const inland = new Map(); // distance from the sea for mainland tiles
    const queue = [];
    for (const t of list) if (t.land === 'mainland' && seaAdj(t)) { inland.set(t.key, 0); queue.push(t); }
    while (queue.length) {
      const t = queue.shift();
      for (const n of Hex.neighbors(t.q, t.r)) {
        const nt = tiles.get(Hex.key(n.q, n.r));
        if (nt && nt.land === 'mainland' && !inland.has(nt.key)) { inland.set(nt.key, inland.get(t.key) + 1); queue.push(nt); }
      }
    }
    for (const t of list) {
      if (t.land === 'taiwan') {
        if (inPoly(MOUNTAINS, t.lon, t.lat)) t.terrain = 'mountain';
        else if (inPoly(HILLS, t.lon, t.lat) || inPoly(YANGMINGSHAN, t.lon, t.lat)) t.terrain = rng() < 0.45 ? 'forest' : 'hills';
        else if (seaAdj(t) && t.lat > 23.6 && t.lat < 24.15 && t.lon < 120.45) t.terrain = 'marsh';
        else t.terrain = rng() < 0.1 ? 'forest' : 'clear';
      } else if (t.land === 'mainland') {
        const d = inland.has(t.key) ? inland.get(t.key) : 9;
        const x = rng();
        if (d <= 1) t.terrain = x < 0.15 ? 'hills' : 'clear';
        else if (d <= 3) t.terrain = x < 0.45 ? 'hills' : x < 0.7 ? 'forest' : 'clear';
        else t.terrain = x < 0.35 ? 'hills' : x < 0.65 ? 'forest' : 'mountain';
      } else if (!t.land) {
        const lon = t.lon, lat = t.lat;
        const deep = (lat < 21.9 && lon > 119.6) || lon > 121.3 + (lat - 23) * 0.25 + (lat > 24.9 ? 0.9 : 0);
        t.terrain = deep ? 'deep' : 'sea';
        const z = lat > 25.1 && lon > 121 ? 'East China Sea' : deep ? (lat < 22 ? 'Luzon Strait' : 'Philippine Sea') : 'Taiwan Strait';
        t.region = z;
      }
    }

    // Rivers.
    const rivers = [];
    for (const pts of RIVERS) {
      const path = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [a, b] = [pts[i], pts[i + 1]];
        const steps = 12;
        for (let s = 0; s <= steps; s++) {
          const t = at(a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps);
          if (t && t.land && path[path.length - 1] !== t.key) path.push(t.key);
        }
      }
      for (const k of path) { const t = tiles.get(k); if (t.terrain !== 'mountain') t.terrain = 'river'; }
      rivers.push(path);
    }

    // Towns and ports.
    const cities = [];
    for (const [name, lon, lat, owner, vp, port, major, capital] of CITIES) {
      let t = at(lon, lat);
      if (!t) continue;
      if (!t.land) {
        // Snap coastal towns that fall just offshore onto the nearest land hex.
        const n = Hex.neighbors(t.q, t.r).map((h) => tiles.get(Hex.key(h.q, h.r))).filter((x) => x && x.land && !x.city);
        if (!n.length) continue;
        t = n[0];
      }
      if (t.city) continue;
      if (port && !seaAdj(t)) {
        const n = Hex.neighbors(t.q, t.r).map((h) => tiles.get(Hex.key(h.q, h.r))).find((x) => x && x.land && !x.city && seaAdj(x));
        if (n) t = n;
      }
      t.terrain = major ? 'city' : 'urban';
      t.city = { name, owner, vp, port: !!port && seaAdj(t), major: !!major, capital: !!capital };
      cities.push(t);
    }

    // Beaches: nearest coastal land hex to each point.
    const landingAreas = {};
    for (const area in BEACHES) {
      landingAreas[area] = [];
      for (const [lon, lat] of BEACHES[area]) {
        let best = null;
        const c = at(lon, lat);
        if (!c) continue;
        for (const h of Hex.within(c.q, c.r, 2)) {
          const t = tiles.get(Hex.key(h.q, h.r));
          if (!t || !t.land || !seaAdj(t) || t.terrain === 'mountain') continue;
          const d = Hex.distance(t.q, t.r, c.q, c.r);
          if (!best || d < best.d) best = { t, d };
        }
        if (best && !best.t.beach) {
          best.t.beach = true;
          if (best.t.terrain === 'marsh' || best.t.terrain === 'river') best.t.terrain = 'clear';
          landingAreas[area].push(best.t.key);
        }
      }
    }

    // Airbases.
    const bases = {};
    for (const [id, name, lon, lat, side] of AIRBASES) {
      const c = at(lon, lat);
      if (!c) continue;
      let t = c;
      if (!t.land) t = Hex.neighbors(c.q, c.r).map((h) => tiles.get(Hex.key(h.q, h.r))).find((x) => x && x.land) || null;
      if (!t) continue;
      t.airbase = id;
      bases[id] = { id, name, side, key: t.key, kind: 'hex', tier: 'close' };
    }

    // Roads.
    const byName = new Map(cities.map((c) => [c.city.name, c]));
    const roadEdges = new Set();
    for (const chain of ROADS) {
      for (let i = 0; i < chain.length - 1; i++) {
        const a = byName.get(chain[i]), b = byName.get(chain[i + 1]);
        if (!a || !b) continue;
        const path = roadPath(tiles, a, b, roadEdges);
        if (!path) continue;
        for (let j = 0; j < path.length; j++) {
          tiles.get(path[j]).road = true;
          if (j) roadEdges.add(edgeKey(path[j - 1], path[j]));
        }
      }
    }

    // Air zones: nearest zone center of a compatible kind.
    const zones = {};
    for (const [id, name, lon, lat, kind] of ZONES) {
      const p = toXY(lon, lat);
      zones[id] = { id, name, x: p.x, y: p.y, kind, keys: [] };
    }
    for (const t of list) {
      const kind = t.land === 'taiwan' ? 'taiwan' : t.land === 'mainland' ? 'mainland' : 'sea';
      let best = null;
      for (const z of Object.values(zones)) {
        if (z.kind !== kind && !(t.land === 'island' && z.kind === 'sea') && !(t.land === 'island' && t.home === 'red' && z.kind === 'mainland')) continue;
        const d = Math.hypot(z.x - t.x, z.y - t.y);
        if (!best || d < best.d) best = { z, d };
      }
      t.zone = best.z.id;
      best.z.keys.push(t.key);
    }

    const labels = LABELS.map(([text, lon, lat, cls]) => { const p = toXY(lon, lat); return { text, x: p.x, y: p.y, cls }; });

    return {
      name: 'Taiwan Strait', cols: COLS, rows: ROWS, tiles, list, cities, rivers, riversInland: true, roadEdges,
      landingAreas, bases, zones, labels, at, toXY,
    };
  };
})(window.WG);
