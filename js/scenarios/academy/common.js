'use strict';

// Strait Crisis Academy: a tutorial campaign of short missions, each a slice of the Strait Crisis scenario.
// mission(def) borrows the map, sensors, supply and AI hooks from Strait Crisis, so a mission only declares
// its forces, objectives and tutorial steps.
(function (WG) {
  const base = WG.SCENARIOS.taiwan;
  const { Hex } = WG;
  const { U, ship, SIDE, COUNTRY } = WG.TaiwanKit;
  const MISSIONS = [];

  const city = (G, name) => G.map.cities.find((c) => c.city.name === name);

  // Places a unit on an exact hex ("q,r"): the coast is only a few hexes deep, too tight for lon/lat placement.
  function at(G, faction, type, name, key, extra = {}) {
    const { q, r } = Hex.parse(key);
    const ut = WG.UNIT_TYPES[type];
    return G.addUnit(Object.assign({
      type, side: SIDE[faction], faction, name, q, r, country: COUNTRY[faction], echelon: ut.domain === 'land' ? 'X' : undefined,
    }, extra));
  }
  function shipAt(G, faction, type, name, key, cargo = []) {
    const s = at(G, faction, type, name, key);
    for (const [ct, cn, extra] of cargo) G.embark(at(G, faction, ct, cn, key, extra), s);
    return s;
  }

  // Marks a hex ("q,r") as a beachhead held by `side`.
  function beachhead(G, key, side = 'red') {
    const t = G.map.tiles.get(key);
    if (t) G.state.beachheads[t.key] = side;
    return t;
  }

  function squadrons(G, list) {
    for (const [faction, type, name, b] of list) {
      WG.Air.addSquadron({ side: SIDE[faction], faction, type, name, base: b, country: COUNTRY[faction] });
    }
  }

  // Lays known blue minefields next to the given landing areas.
  function mines(G, areas, chance = 0.55, seed = 4411) {
    const rng = WG.rng(seed);
    for (const area of areas) {
      for (const k of G.map.landingAreas[area]) {
        const t = G.map.tiles.get(k);
        for (const n of Hex.neighbors(t.q, t.r)) {
          const nt = G.tile(n.q, n.r);
          if (nt && G.isSea(nt) && !G.state.mines[nt.key] && rng() < chance) {
            G.state.mines[nt.key] = 'blue';
            G.state.minesKnown.blue[nt.key] = true;
            G.state.minesKnown.red[nt.key] = true; // charted by reconnaissance before the mission
          }
        }
      }
    }
  }

  // Measures used by tutorial steps and objectives.
  const M = {
    city,
    owner: (G, name) => city(G, name).city.owner,
    units: (G, pred) => G.state.units.filter(pred),
    count: (G, pred) => G.state.units.filter(pred).length,
    steps: (G, pred) => G.state.units.filter(pred).reduce((n, u) => n + u.steps, 0),
    named: (G, name) => G.state.units.find((u) => u.name === name) || null,
    domain: (G, u) => G.type(u).domain,
    onTaiwan: (G, u) => !u.carrier && G.tile(u.q, u.r).mass === 'taiwan',
    flying(G, side, kinds, pred) {
      return WG.Air.active() && WG.Air.squadronsOf(side).some((q) => q.mission && kinds.includes(q.mission.kind) && (!pred || pred(q)));
    },
    missilesLeft(G, side, ids) {
      if (!WG.Air.active()) return 0;
      const m = WG.Air.st().missiles[side];
      return Object.keys(m).filter((id) => !ids || ids.includes(id)).reduce((n, id) => n + m[id].left, 0);
    },
    // Enemy units of `domain` that `side` can currently target.
    targetable(G, side, domain) {
      const known = G.intel(side);
      return G.state.units.some((e) => e.side !== side && !e.carrier && G.type(e).domain === domain && known.get(e.id) >= 2);
    },
    // A land unit of `side` attacks across from at least two friendly neighbours of an enemy.
    surrounded(G, side, n = 2) {
      return G.state.units.some((e) => e.side !== side && !e.carrier && G.type(e).domain === 'land' &&
        Hex.neighbors(e.q, e.r).filter((h) => {
          const f = G.unitAt(h.q, h.r, null, 'land');
          return f && f.side === side && !G.type(f).indirect;
        }).length >= n);
    },
  };

  function mission(def) {
    const player = def.player;
    const side = SIDE[player];
    const factions = {};
    const controllers = {};
    for (const f of def.factions) {
      factions[f] = base.factions[f];
      controllers[f] = f === player ? 'human' : 'ai';
    }
    const steps = def.steps;
    const doneCount = (G) => steps.filter((s) => G.state.tutorial.done[s.id] !== undefined).length;
    MISSIONS.push(def.id);

    const sc = {
      id: def.id,
      campaign: 'academy',
      name: def.name,
      topic: def.topic,
      description: def.description,
      briefing: def.briefing,
      sides: base.sides,
      factions,
      roles: [{ id: player, label: `${base.factions[player].name} vs AI`, controllers }],
      options: [],
      firstSide: 'red',
      maxTurns: def.maxTurns,
      supplyRange: base.supplyRange,
      unitTypes: def.unitTypes || base.unitTypes,
      tutorial: { steps },

      mapOptions: base.mapOptions,
      buildMap: base.buildMap,
      supplySources: base.supplySources,
      intelLevel: base.intelLevel,
      sensorSites: base.sensorSites,
      strikeSite: base.strikeSite,
      ai: base.ai,
      aiZoneBonus: base.aiZoneBonus,
      aiTargetBonus: base.aiTargetBonus,
      aiReactRange: base.aiReactRange,
      aiIsrZones: base.aiIsrZones,
      aiMayStrikeBase: base.aiMayStrikeBase,
      aiMayStrikeTile: base.aiMayStrikeTile,
      aiLandingOk: base.aiLandingOk,
      aiReinforcePorts: base.aiReinforcePorts,
      cityValue: base.cityValue,
      income() { return { blue: 0, red: 0 }; },

      setup(G) {
        G.state.maxTurns = def.maxTurns;
        G.state.access = 'full';
        G.state.force = 'estimate';
        def.setup(G);
        G.state.aiPlan = Object.assign({ areas: [], penghu: false, strikeJapan: false }, def.aiPlan);
        G.state.tutorial = { done: {}, base: def.baseline ? def.baseline(G) : {} };
      },

      intro(G) { return `${def.name}: ${def.goal} ${G.state.maxTurns} turns. Follow the steps in the Tutorial tab.`; },

      initialFocus(G) {
        const [lon, lat, scale] = def.focus;
        const p = G.map.toXY(lon, lat);
        const h = Hex.fromPixel(p.x, p.y);
        return { q: h.q, r: h.r, scale: scale || 0.7 };
      },

      vpHtml(G) {
        return `<span class="vp ${side}" title="Tutorial steps completed">Steps <b>${doneCount(G)}</b>/${steps.length}</span>` + (def.status ? def.status(G) : '');
      },

      checkVictory(G, when) {
        const s = G.state;
        const r = def.victory(G, when);
        if (!r && when !== 'end') return false;
        const res = r || def.timeUp(G);
        s.over = true;
        s.winner = res.winner;
        s.reason = res.winner === side ? 'objective' : 'failed';
        s.reasonText = res.text;
        return true;
      },

      helpHtml(G) {
        return `<p><b>${def.name}</b> (Strait Crisis Academy). ${def.goal}
          The <b>Tutorial</b> tab lists each step and checks it off as you go; steps can be done in any order.</p>` +
          base.helpHtml().replace(/^<p>[\s\S]*?<\/p>/, '');
      },
    };
    for (const k of ['air', 'space', 'bargeTurn', 'factionActive', 'onStrike', 'onHostile', 'onCapture', 'onBaseLost', 'onEscalation',
      'onTurnStart', 'statusText', 'confirmStrike', 'spaceFaction', 'ai']) {
      if (def[k] !== undefined) sc[k] = def[k];
    }
    WG.registerScenario(sc);
    return sc;
  }

  WG.registerCampaign({
    id: 'academy',
    name: 'Strait Crisis Academy',
    description: 'A tutorial campaign: six short guided missions, each one a slice of Strait Crisis, from ground combat to carrier strikes and escalation.',
    missions: MISSIONS,
    graduate: 'taiwan',
  });

  WG.Academy = { base, mission, at, shipAt, beachhead, squadrons, mines, M, U, ship, SIDE, COUNTRY, MISSIONS };
})(window.WG);
