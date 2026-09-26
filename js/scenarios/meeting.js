'use strict';

// The original game: a procedurally generated map with two symmetric land brigades.
(function (WG) {
  const { Hex, TERRAIN, UNIT_TYPES } = WG;
  const SIZES = { s: [24, 16], m: [32, 22], l: [40, 26] };

  function deploy(G, side) {
    const m = G.map;
    const capital = m.cities.find((c) => c.city.capital && c.city.owner === side);
    const dir = side === 'blue' ? 1 : -1;
    const inZone = (t) => (side === 'blue' ? t.col <= m.cols * 0.28 : t.col >= m.cols * 0.72 - 1);
    const rng = WG.rng(G.state.mapOpts.seed * 7 + (side === 'blue' ? 1 : 2));
    const fcol = Math.max(0, Math.min(m.cols - 1, capital.col + dir * 4));
    const fwd = Hex.offsetToAxial(fcol, capital.row);
    const brigade = side === 'blue' ? 3 : 7;
    const count = {};
    for (const type of WG.ORBAT) {
      const ut = UNIT_TYPES[type];
      const anchor = type === 'hq' || type === 'arty' ? capital : fwd;
      let best = null, bestScore = Infinity;
      for (const t of m.list) {
        if (!inZone(t) || t.terrain === 'river' || !isFinite(TERRAIN[t.terrain].cost[ut.move])) continue;
        if (G.unitAt(t.q, t.r)) continue;
        const s = Hex.distance(t.q, t.r, anchor.q, anchor.r) + rng() * 2.5;
        if (s < bestScore) { bestScore = s; best = t; }
      }
      if (!best) continue;
      count[type] = (count[type] || 0) + 1;
      G.addUnit({
        type, side, faction: side, q: best.q, r: best.r, echelon: type === 'hq' ? 'X' : 'II',
        name: type === 'hq' ? `${brigade} BDE HQ` : `${count[type]}/${brigade} ${ut.short}`,
      });
    }
  }

  WG.registerScenario({
    id: 'meeting',
    name: 'Meeting Engagement',
    description: 'Two mechanized brigades clash over a randomly generated countryside. Land units only.',
    sides: { blue: { name: 'Blue' }, red: { name: 'Red' } },
    factions: {
      blue: { side: 'blue', name: 'Blue' },
      red: { side: 'red', name: 'Red' },
    },
    roles: [
      { id: 'blue', label: 'Play Blue vs AI', controllers: { blue: 'human', red: 'ai' } },
      { id: 'red', label: 'Play Red vs AI', controllers: { blue: 'ai', red: 'human' } },
      { id: 'hotseat', label: 'Hotseat (2 players)', controllers: { blue: 'human', red: 'human' } },
      { id: 'watch', label: 'AI vs AI (watch)', controllers: { blue: 'ai', red: 'ai' } },
    ],
    options: [
      { id: 'size', label: 'Map size', choices: [['s', 'Small (24×16)'], ['m', 'Medium (32×22)'], ['l', 'Large (40×26)']], value: 'm' },
      { id: 'turns', label: 'Turns', choices: [['10', '10'], ['15', '15'], ['20', '20']], value: '15' },
      { id: 'seed', label: 'Map seed', type: 'seed' },
    ],
    firstSide: 'blue',
    maxTurns: 15,

    mapOptions(opts) {
      const [cols, rows] = SIZES[opts.options.size] || SIZES.m;
      return { seed: opts.options.seed, cols, rows };
    },
    buildMap(mo) { return WG.generateMap(mo); },

    setup(G, opts) {
      G.state.maxTurns = parseInt(opts.options.turns, 10) || 15;
      deploy(G, 'blue');
      deploy(G, 'red');
    },

    intro(G) { return `Operation begins: ${G.state.maxTurns} turns. Hold towns to score victory points each turn.`; },
  });
})(window.WG);
