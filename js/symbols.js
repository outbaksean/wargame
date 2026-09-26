'use strict';

// NATO APP-6 / MIL-STD-2525 style unit symbols.
// Blue uses the friendly frame (light-blue rectangle), Red the hostile frame (red diamond).
(function (WG) {
  const FRAMES = {
    blue: { frame: '<rect x="-18" y="-12" width="36" height="24"/>', fill: '#80e0ff', box: [-18, -12, 18, 12], top: -12, bottom: 12, oval: [12, 6.5], hw: 18 },
    red: { frame: '<polygon points="0,-17 17,0 0,17 -17,0"/>', fill: '#ff8080', box: [-10, -7, 10, 7], top: -17, bottom: 17, oval: [8.5, 4.8], hw: 17 },
  };

  function icon(type, f) {
    const [x0, y0, x1, y1] = f.box;
    const cross = `<path d="M${x0} ${y0}L${x1} ${y1}M${x0} ${y1}L${x1} ${y0}"/>`;
    const oval = `<ellipse rx="${f.oval[0]}" ry="${f.oval[1]}"/>`;
    switch (type) {
      case 'inf': return cross;
      case 'armor': return oval;
      case 'mech': return cross + oval;
      case 'recon': return `<path d="M${x0} ${y1}L${x1} ${y0}"/>`;
      case 'arty': return '<circle r="3.6" fill="#000"/>';
      case 'at': return `<path d="M${x0} ${y1}L0 ${y0}L${x1} ${y1}"/>`;
      case 'hq': return '<text y="3.6" text-anchor="middle" font-size="10" font-weight="700" fill="#000" stroke="none" font-family="Arial,Helvetica,sans-serif">HQ</text>';
      default: return '';
    }
  }

  function echelon(e, top) {
    const y0 = top - 10, y1 = top - 3;
    if (e === 'II') return `<path d="M-2.5 ${y0}V${y1}M2.5 ${y0}V${y1}"/>`;
    if (e === 'III') return `<path d="M-5 ${y0}V${y1}M0 ${y0}V${y1}M5 ${y0}V${y1}"/>`;
    if (e === 'X') return `<path d="M-3.5 ${y0}L3.5 ${y1}M-3.5 ${y1}L3.5 ${y0}"/>`;
    return '';
  }

  const cache = new Map();
  WG.Symbols = {
    FRAMES,
    build(type, side) {
      const id = type + ':' + side;
      if (!cache.has(id)) {
        const f = FRAMES[side];
        const ut = WG.UNIT_TYPES[type];
        cache.set(id,
          '<g class="sym" stroke="#000" stroke-width="1.5" fill="none" stroke-linejoin="round">' +
          `<g fill="${f.fill}">${f.frame}</g>${icon(type, f)}${echelon(ut.echelon || 'II', f.top)}</g>`);
      }
      return cache.get(id);
    },
  };
})(window.WG);
