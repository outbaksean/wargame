'use strict';
window.WG = window.WG || {};

(function (WG) {
  // Seeded PRNG (mulberry32) so a seed always produces the same map.
  WG.rng = function (seed) {
    let a = seed >>> 0;
    const f = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (n) => Math.floor(f() * n);
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(f() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    return f;
  };

  // Binary min-heap priority queue.
  WG.PQ = class {
    constructor() { this.h = []; }
    get size() { return this.h.length; }
    push(item, pri) {
      const h = this.h;
      h.push({ item, pri });
      let i = h.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (h[p].pri <= h[i].pri) break;
        [h[p], h[i]] = [h[i], h[p]];
        i = p;
      }
    }
    pop() {
      const h = this.h;
      const top = h[0];
      const last = h.pop();
      if (h.length) {
        h[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < h.length && h[l].pri < h[m].pri) m = l;
          if (r < h.length && h[r].pri < h[m].pri) m = r;
          if (m === i) break;
          [h[m], h[i]] = [h[i], h[m]];
          i = m;
        }
      }
      return top;
    }
  };

  // Pointy-top hexes, axial coordinates (q, r); map stored as "odd-r" offset rectangle.
  const SQRT3 = Math.sqrt(3);
  const SIZE = 40;
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  WG.Hex = {
    SIZE,
    DIRS,
    key: (q, r) => q + ',' + r,
    parse(k) {
      const i = k.indexOf(',');
      return { q: +k.slice(0, i), r: +k.slice(i + 1) };
    },
    neighbors: (q, r) => DIRS.map((d) => ({ q: q + d[0], r: r + d[1] })),
    distance: (aq, ar, bq, br) => (Math.abs(aq - bq) + Math.abs(aq + ar - bq - br) + Math.abs(ar - br)) / 2,
    toPixel: (q, r) => ({ x: SIZE * SQRT3 * (q + r / 2), y: SIZE * 1.5 * r }),
    fromPixel(x, y) {
      const q = (SQRT3 / 3 * x - y / 3) / SIZE;
      const r = (2 / 3 * y) / SIZE;
      return this.round(q, r);
    },
    round(q, r) {
      const s = -q - r;
      let rq = Math.round(q), rr = Math.round(r);
      const rs = Math.round(s);
      const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
      if (dq > dr && dq > ds) rq = -rr - rs;
      else if (dr > ds) rr = -rq - rs;
      return { q: rq, r: rr };
    },
    offsetToAxial: (col, row) => ({ q: col - (row - (row & 1)) / 2, r: row }),
    points(size, cx = 0, cy = 0) {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i - 30);
        pts.push((cx + size * Math.cos(a)).toFixed(1) + ',' + (cy + size * Math.sin(a)).toFixed(1));
      }
      return pts.join(' ');
    },
    within(q, r, n) {
      const out = [];
      for (let dq = -n; dq <= n; dq++) {
        for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, -dq + n); dr++) out.push({ q: q + dq, r: r + dr });
      }
      return out;
    },
  };
})(window.WG);
