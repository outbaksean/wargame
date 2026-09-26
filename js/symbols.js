'use strict';

// NATO APP-6 / MIL-STD-2525 style symbols.
// Blue side uses friendly frames (light blue), Red side hostile frames (red diamonds).
(function (WG) {
  const FILL = { blue: '#80e0ff', red: '#ff8080' };

  // Frame geometry per side and domain. box = icon area, top/bottom = frame extent, hw = half width.
  const FRAMES = {
    blue: {
      land: { frame: '<rect x="-18" y="-12" width="36" height="24"/>', box: [-18, -12, 18, 12], top: -12, bottom: 12, hw: 18, oval: [12, 6.5] },
      sea: { frame: '<circle r="14"/>', box: [-10, -10, 10, 10], top: -14, bottom: 14, hw: 14, oval: [8, 5] },
      sub: { frame: '<path d="M-16 -6H16A16 16 0 0 1 -16 -6Z"/>', box: [-10, -6, 10, 6], top: -6, bottom: 10, hw: 16, oval: [8, 4], textY: 0 },
      air: { frame: '<path d="M-16 9H16A16 16 0 0 0 -16 9Z"/>', box: [-10, -3, 10, 9], top: -7, bottom: 9, hw: 16, oval: [8, 4], textY: 3 },
    },
    red: {
      land: { frame: '<polygon points="0,-17 17,0 0,17 -17,0"/>', box: [-10, -7, 10, 7], top: -17, bottom: 17, hw: 17, oval: [8.5, 4.8] },
      sea: { frame: '<polygon points="0,-17 17,0 0,17 -17,0"/>', box: [-10, -7, 10, 7], top: -17, bottom: 17, hw: 17, oval: [8, 4.5] },
      sub: { frame: '<path d="M-18 -5H18L0 13Z"/>', box: [-9, -5, 9, 3], top: -5, bottom: 13, hw: 18, oval: [7, 3], textY: -0.5 },
      air: { frame: '<path d="M-18 7H18L0 -11Z"/>', box: [-9, -1, 9, 7], top: -11, bottom: 7, hw: 18, oval: [7, 3], textY: 4.5 },
    },
  };

  const text = (s, y = 3.4, size = 9) =>
    `<text y="${y}" text-anchor="middle" font-size="${size}" font-weight="700" fill="#000" stroke="none" font-family="Arial,Helvetica,sans-serif">${s}</text>`;

  function landIcon(icon, f) {
    const [x0, y0, x1, y1] = f.box;
    const cross = `<path d="M${x0} ${y0}L${x1} ${y1}M${x0} ${y1}L${x1} ${y0}"/>`;
    const oval = `<ellipse rx="${f.oval[0]}" ry="${f.oval[1]}"/>`;
    const w = x1 - x0, h = y1 - y0;
    switch (icon) {
      case 'inf': return cross;
      case 'armor': return oval;
      case 'mech': return cross + oval;
      case 'recon': return `<path d="M${x0} ${y1}L${x1} ${y0}"/>`;
      case 'arty': return '<circle r="3.6" fill="#000"/>';
      case 'at': return `<path d="M${x0} ${y1}L0 ${y0}L${x1} ${y1}"/>`;
      case 'hq': return text('HQ', 3.6, 10);
      case 'rocket': // rocket artillery: filled dot with a rocket chevron above
        return `<circle cy="${h * 0.12}" r="3.2" fill="#000"/><path d="M${-w * 0.14} ${-h * 0.12}L0 ${-h * 0.34}L${w * 0.14} ${-h * 0.12}"/>`;
      case 'asm': // coastal missile: upright missile over a wave
        return `<path d="M0 ${-h * 0.36}L${w * 0.05} ${-h * 0.2}V${h * 0.12}H${-w * 0.05}V${-h * 0.2}Z" fill="#000"/>` +
          `<path d="M${-w * 0.28} ${h * 0.3}q${w * 0.07} ${-h * 0.14} ${w * 0.14} 0t${w * 0.14} 0t${w * 0.14} 0"/>`;
      case 'sam': // air defense: dome along the bottom with a missile
        return `<path d="M${x0 + w * 0.12} ${y1}A${w * 0.38} ${h * 0.5} 0 0 1 ${x1 - w * 0.12} ${y1}"/>` +
          `<path d="M0 ${-h * 0.34}L${w * 0.05} ${-h * 0.2}V${h * 0.1}H${-w * 0.05}V${-h * 0.2}Z" fill="#000"/>`;
      case 'ew': return text('EW', 3.4, 9);
      case 'lm': // unmanned system chevron
        return `<path d="M${-w * 0.3} ${-h * 0.18}L0 ${h * 0.12}L${w * 0.3} ${-h * 0.18}L0 ${h * 0.3}Z" fill="#000"/>`;
      default: return '';
    }
  }

  // Modifier drawn along the bottom of the frame.
  function landMod(mod, f) {
    const [x0, , x1, y1] = f.box;
    const w = x1 - x0;
    if (mod === 'amphib') {
      const y = y1 - 3;
      return `<path d="M${-w * 0.3} ${y}q${w * 0.075} -3 ${w * 0.15} 0t${w * 0.15} 0t${w * 0.15} 0t${w * 0.15} 0" stroke-width="1.2"/>`;
    }
    if (mod === 'airborne') {
      const y = y1 - 2;
      return `<path d="M${-w * 0.22} ${y}q${w * 0.11} -5 ${w * 0.22} 0q${w * 0.11} -5 ${w * 0.22} 0" stroke-width="1.2"/>`;
    }
    return '';
  }

  function echelon(e, top) {
    if (!e) return '';
    const y0 = top - 10, y1 = top - 3;
    if (e[0] === 'I') {
      const n = e.length;
      let d = '';
      for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 5; d += `M${x} ${y0}V${y1}`; }
      return `<path d="${d}"/>`;
    }
    const n = e.length;
    let d = '';
    for (let i = 0; i < n; i++) {
      const cx = (i - (n - 1) / 2) * 8;
      d += `M${cx - 3.5} ${y0}L${cx + 3.5} ${y1}M${cx - 3.5} ${y1}L${cx + 3.5} ${y0}`;
    }
    return `<path d="${d}"/>`;
  }

  function country(c, f) {
    if (!c) return '';
    return `<text x="${-f.hw - 2}" y="${f.top + 1}" text-anchor="end" font-size="7.5" font-weight="700" fill="#1a1a1a" stroke="none" font-family="Arial,Helvetica,sans-serif">${c}</text>`;
  }

  const cache = new Map();
  WG.Symbols = {
    FILL,
    frame(side, domain) { return FRAMES[side][domain] || FRAMES[side].land; },

    // Ground and naval units.
    build(type, side, opts = {}) {
      const ut = WG.UNIT_TYPES[type];
      const ech = ut.domain === 'land' ? (opts.echelon || ut.echelon || 'II') : '';
      const id = `${type}:${side}:${ech}:${opts.country || ''}`;
      if (!cache.has(id)) {
        const f = FRAMES[side][ut.domain];
        let inner;
        if (ut.domain === 'land') inner = landIcon(ut.icon, f) + landMod(ut.mod, f);
        else inner = text(ut.icon, (f.textY !== undefined ? f.textY : 0) + 3.2, ut.icon.length > 2 ? 7.5 : 9);
        cache.set(id,
          '<g class="sym" stroke="#000" stroke-width="1.5" fill="none" stroke-linejoin="round">' +
          `<g fill="${FILL[side]}">${f.frame}</g>${inner}${echelon(ech, f.top)}${country(opts.country, f)}</g>`);
      }
      return cache.get(id);
    },

    // Air squadrons.
    buildAir(type, side, opts = {}) {
      const at = WG.AIR_TYPES[type];
      const id = `air:${type}:${side}:${opts.country || ''}`;
      if (!cache.has(id)) {
        const f = FRAMES[side].air;
        cache.set(id,
          '<g class="sym" stroke="#000" stroke-width="1.5" fill="none" stroke-linejoin="round">' +
          `<g fill="${FILL[side]}">${f.frame}</g>${text(at.icon, f.textY + 3, at.icon.length > 2 ? 6.5 : 8.5)}${country(opts.country, f)}</g>`);
      }
      return cache.get(id);
    },
  };
})(window.WG);
