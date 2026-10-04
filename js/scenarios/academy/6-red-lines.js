'use strict';

// Academy mission 6: space, counterspace and escalation. Sink a US carrier without bringing Japan into the war.
(function (WG) {
  const { mission, squadrons, base, M, U } = WG.Academy;

  // The carrier group's escorts are tougher here than in the full game, where many more threats split its defenses.
  const B = (id) => Object.assign({}, base.air.bases.find((b) => b.id === id), id === 'csg5' ? { ad: 12, bmd: 8 } : {});
  const AIR = {
    bases: ['kadena', 'naha', 'csg5', 'guam', 'zhejiang', 'guangdong', 'inland'].map(B),
    hexBaseInfo: base.air.hexBaseInfo,
    accessOk: base.air.accessOk,
    squadrons: [
      ['us', 'ftr5', 'CVW-5 F-35C', 'csg5'], ['us', 'ftr', 'CVW-5 F/A-18E/F', 'csg5'], ['us', 'aew', 'CVW-5 E-2D', 'csg5'], ['us', 'ewac', 'CVW-5 EA-18G', 'csg5'],
      ['us', 'ftr', '18 Wing F-15EX', 'kadena'], ['us', 'aew', 'E-3 AWACS (Kadena)', 'kadena'], ['us', 'tanker', 'KC-135 (Kadena)', 'kadena'],
      ['jp', 'ftr', 'JASDF 9 AW F-15J', 'naha'],
      ['prc', 'ftr5', 'J-20 Bde (East)', 'zhejiang'], ['prc', 'ftr5', 'J-20 Bde (East 2)', 'zhejiang'], ['prc', 'ftr', 'J-16 Bde (Longtian)', 'longtian'],
      ['prc', 'aew', 'KJ-500 (East)', 'zhejiang'], ['prc', 'ewac', 'J-16D EW Regt', 'zhejiang'], ['prc', 'tanker', 'Y-20U Tanker Regt', 'zhejiang'],
      ['prc', 'uav', 'WZ-7 / TB-001 UAV Bde', 'guangdong'], ['prc', 'bomber', 'H-6K Bomber Div', 'inland'],
    ],
    missiles: {
      red: {
        srbm: base.air.missiles.red.srbm,
        mrbm: Object.assign({}, base.air.missiles.red.mrbm, { stock: 8, perTurn: 2 }),
        irbm: Object.assign({}, base.air.missiles.red.irbm, { stock: 4, perTurn: 1 }),
        lacm: base.air.missiles.red.lacm,
      },
      blue: { tlam: base.air.missiles.blue.tlam, mst: base.air.missiles.blue.mst },
    },
  };

  const carrierSunk = () => WG.Air.active() && !!WG.Air.status('csg5').sunk;
  const esc = (G) => (G.state.escalation ? G.state.escalation.level : 0);
  const asbm = (G) => M.missilesLeft(G, 'red', ['mrbm', 'irbm']);

  mission({
    id: 'academy-6',
    name: 'Red Lines',
    topic: 'Space and escalation',
    description: 'Find and sink a US carrier with satellites, drones and anti-ship ballistic missiles, without striking Japan or escalating so far that Japan enters the war.',
    player: 'prc',
    factions: ['prc', 'roc', 'us', 'jp'],
    maxTurns: 8,
    focus: [121.6, 23.6, 0.45],
    goal: 'Sink the carrier group CSG-5 while keeping Japan out of the war.',
    unitTypes: ['ddg', 'ffg', 'ssn', 'sam', 'ew', 'inf'],
    aiPlan: { areas: [], strikeJapan: false },
    air: AIR,
    space: base.space,
    spaceFaction: base.spaceFaction,
    factionActive: base.factionActive,
    onStrike: base.onStrike,
    onHostile: base.onHostile,
    onCapture: base.onCapture,
    onBaseLost: base.onBaseLost,
    onEscalation: base.onEscalation,
    statusText: base.statusText,
    confirmStrike: base.confirmStrike,
    briefing: `<p>D+1. The carrier USS <i>Ronald Reagan</i> (CSG-5) is launching strikes from the Philippine Sea, east of Taiwan. Japan has
      let the United States use its bases but has not entered the war, and Beijing wants it kept that way.</p>
      <p><b>Your orders:</b> sink <b>CSG-5</b> within 8 turns. You fail if <b>Japan enters the war</b>: striking Japanese territory or forces does it at once,
      and so does pushing the <b>escalation</b> track to 5.</p>
      <p>This mission covers satellites, counterspace, carrier tracking and escalation, using the <b>Intel &amp; Space</b>, <b>Air</b> and <b>Missiles</b> tabs.
      Follow the <b>Tutorial</b> tab.</p>`,

    setup(G) {
      G.state.access = 'japan';
      U(G, 'prc', 'sam', 'HQ-9 Bde North', 119.40, 25.62);
      U(G, 'prc', 'ew', 'ISF EW Regt', 119.70, 25.50, { echelon: 'III' });
      U(G, 'prc', 'ddg', '055 SAG', 121.85, 26.10);
      U(G, 'prc', 'ffg', '054A Screen East', 121.35, 25.80);
      U(G, 'us', 'ddg', 'DESRON 15', 122.95, 23.35);
      U(G, 'us', 'ssn', 'SSN Group North', 122.65, 25.75);
      U(G, 'jp', 'ddg', 'JMSDF Escort Flotilla 4', 123.15, 25.40);
      U(G, 'roc', 'inf', 'Hualien Def Cmd', 121.60, 23.98, { entrenched: true });
      squadrons(G, AIR.squadrons);
      // The carrier keeps a standing patrol and an E-2D aloft when the mission opens.
      for (const q of WG.Air.st().squadrons) {
        if (q.name === 'CVW-5 F-35C' || q.name === 'CVW-5 F/A-18E/F') Object.assign(q, { flew: true, mission: { kind: 'cap', zone: 'eas' } });
        if (q.name === 'CVW-5 E-2D') Object.assign(q, { flew: true, mission: { kind: 'aew', zone: 'eas' } });
      }
      WG.Air.setMissiles('red', AIR.missiles.red);
      WG.Air.setMissiles('blue', AIR.missiles.blue);
    },
    baseline(G) { return { asbm: asbm(G), dazzle: G.state.space.red.dazzle }; },

    status(G) {
      return `<span class="vp ${carrierSunk() ? 'red' : 'blue'}" title="Sink CSG-5 to win">CSG-5: <b>${carrierSunk() ? 'sunk' : 'afloat'}</b></span>`;
    },
    victory(G) {
      if (G.state.japanAtWar) return { winner: 'blue', text: 'Japan has entered the war, and with it every base and warship in the Ryukyus. Try again: stay away from Japanese territory and forces, and watch the escalation track.' };
      if (carrierSunk()) return { winner: 'red', text: `CSG-5 is sunk and Japan stays out of the war (escalation ${esc(G)}). Mission complete: you have graduated from the Academy.` };
      return null;
    },
    timeUp() { return { winner: 'blue', text: 'CSG-5 is still launching strikes. Try again: track it every turn, escort your drones and fire full salvos.' }; },

    steps: [
      {
        id: 'sats', title: 'Read the satellite schedule', focus: [122.40, 23.30],
        text: `Open the <b>Intel &amp; Space</b> tab. Your reconnaissance satellites sweep a few air zones each turn on a fixed, predictable schedule;
          a pass makes ships in the zone targetable. You also see the <b>US passes</b> for next turn. <b>Dazzle</b> the US satellites to blind them for two turns.
          A <b>kinetic ASAT</b> kills one for good but raises escalation by 2.`,
        check: (G) => G.state.space.red.dazzle < G.state.tutorial.base.dazzle,
      },
      {
        id: 'escort', title: 'Contest the carrier’s air', focus: [122.40, 23.30],
        text: `The carrier keeps fighters and an E-2D over <b>East of Taiwan</b>. <b>Before</b> sending anything slow there, fly <b>CAP</b> over the zone with the J-20s.
          The carrier's own CAP is strong: bring the J-16D jammers or a second regiment if you lose the fight.`,
        check: (G) => M.flying(G, 'red', ['cap'], (q) => q.mission.zone === 'eas'),
      },
      {
        id: 'track', title: 'Track the carrier', focus: [122.40, 23.30],
        text: `A carrier can only be targeted while you track its zone: <b>East of Taiwan</b>. Without a satellite pass there, fly the
          <b>KJ-500 (AEW)</b> or the <b>WZ-7 drones (ISR)</b> over it once your fighters are there. AEW aircraft are harder to shoot down than drones.`,
        check: (G) => M.flying(G, 'red', ['isr', 'aew'], (q) => q.mission.zone === 'eas'),
      },
      {
        id: 'salvo', title: 'Fire anti-ship ballistic missiles', focus: [122.40, 23.30],
        text: `In the <b>Missiles</b> tab, fire a <b>DF-17/21D</b> or <b>DF-26</b> salvo at <b>CSG-5</b>. Each hit damages the flight deck;
          enough damage sinks the carrier and its air wing with it. Its escorts shoot down many missiles.`,
        check: (G) => asbm(G) < G.state.tutorial.base.asbm,
      },
      {
        id: 'saturate', title: 'Saturate its defenses', focus: [122.40, 23.30],
        text: `Each salvo at the same target in one turn weakens its defenses against the next. Fire <b>three or more salvos at CSG-5 in a single turn</b>;
          H-6K bomber strikes count too.`,
        check: () => WG.Air.active() && (WG.Air.status('csg5').sat || 0) >= 3,
      },
      {
        id: 'sink', title: 'Sink CSG-5, keep Japan out', focus: [122.40, 23.30],
        text: `Sinking a carrier raises escalation by 1; so does striking the Philippines. Striking <b>Kadena, Naha, Japanese ships or Yonaguni</b> brings Japan
          in at once. Watch the <b>Escalation</b> chip in the top bar: at 5, Japan joins the war and the mission fails.`,
        check: (G) => carrierSunk() && !G.state.japanAtWar,
      },
    ],
  });
})(window.WG);
