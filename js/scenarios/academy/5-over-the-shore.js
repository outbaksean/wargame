'use strict';

// Academy mission 5: sealift and supply. Build a central lodgment up to an army with ferries, barges and paratroopers.
(function (WG) {
  const { mission, at, shipAt, beachhead, squadrons, base, M, U, ship } = WG.Academy;
  const { Hex } = WG;

  const AIR = {
    bases: [],
    hexBaseInfo: base.air.hexBaseInfo,
    squadrons: [
      ['roc', 'ftr', 'ROCAF 3 TFW IDF', 'cck'], ['roc', 'ftr', 'ROCAF 4 TFW F-16V', 'chiayi'],
      ['prc', 'ftr', 'J-16 Bde (Longtian)', 'longtian'], ['prc', 'ftr', 'J-10C Bde (Hui\'an)', 'huian'],
      ['prc', 'aew', 'KJ-500 (Changle)', 'changle'], ['prc', 'uav', 'GJ-2 UAV Regt', 'jinjiang'],
    ],
    missiles: {
      red: { srbm: { faction: 'prc', name: 'SRBM (DF-11/15/16)', stock: 6, perTurn: 2, power: 6, ballistic: true, reach: ['map'] } },
      blue: {},
    },
  };

  const brigades = (G) => M.count(G, (u) => u.side === 'red' && M.domain(G, u) === 'land' && u.type !== 'hq' && M.onTaiwan(G, u));
  const roroCargo = (G) => M.units(G, (u) => u.side === 'red' && u.type === 'roro').reduce((n, u) => n + u.cargo.length, 0);
  const portHeld = (G) => M.owner(G, 'Taichung Port') === 'red';
  const GOAL = 5;

  mission({
    id: 'academy-5',
    name: 'Over the Shore',
    topic: 'Sealift, airborne and supply',
    description: 'Grow a thin central lodgment into an army: capture a port, bring ro-ro ferries and causeway barges across, drop paratroopers and ship reinforcements.',
    player: 'prc',
    factions: ['prc', 'roc'],
    maxTurns: 10,
    focus: [120.2, 24.5, 0.6],
    goal: `Hold Taichung Port with ${GOAL} brigades ashore.`,
    unitTypes: ['amphmech', 'marine', 'armor', 'mech', 'airborne', 'inf', 'resinf', 'asm', 'hq', 'amph', 'roro', 'ddg', 'ffg'],
    aiPlan: { areas: ['central'] },
    air: AIR,
    bargeTurn: 3,
    briefing: `<p>D+1. Two brigades hold a thin beachhead north of Taichung Port. The heavy follow-on brigades are crossing in civilian
      ro-ro ferries, which can only unload in a port until the causeway barges are in place. Taiwan's 10th Army Corps is closing in.</p>
      <p><b>Your orders:</b> capture <b>Taichung Port</b> and build the lodgment up to <b>${GOAL} brigades ashore</b> within 10 turns.</p>
      <p>This mission covers moving an army across the strait: ports, ferries, barges, airborne assaults, supply and reinforcements.
      Follow the <b>Tutorial</b> tab.</p>`,

    // Taichung Port (9,23) sits between the beachheads at 10,22 and 8,24, with Taichung city (9,24) behind it.
    setup(G) {
      beachhead(G, '10,22');
      beachhead(G, '8,24');
      at(G, 'prc', 'amphmech', '14 Amph CA Bde', '10,22');
      at(G, 'prc', 'marine', '2 Marine Bde', '8,24');
      shipAt(G, 'prc', 'amph', 'ATF Center 1', '9,22');
      shipAt(G, 'prc', 'amph', 'ATF Center 2', '8,23');
      ship(G, 'prc', 'roro', 'Ro-Ro Flotilla 1', 119.95, 24.55, [['armor', '72 GA Heavy CA Bde']]);
      ship(G, 'prc', 'roro', 'Ro-Ro Flotilla 2', 119.85, 24.45, [['mech', '73 GA Medium CA Bde']]);
      U(G, 'prc', 'ffg', '054A Escort', 120.05, 24.45);
      U(G, 'prc', 'ddg', '052D SAG', 120.15, 24.55);
      U(G, 'prc', 'airborne', '127 Airborne Bde', 119.44, 25.66);
      at(G, 'roc', 'resinf', '2 Reserve Bde', '9,23', { entrenched: true });
      at(G, 'roc', 'mech', '234 Mech Bde', '9,24', { entrenched: true });
      at(G, 'roc', 'asm', 'HF-3 CDCM Bn C', '10,24', { echelon: 'II', entrenched: true });
      at(G, 'roc', 'armor', '586 Armor Bde', '8,26');
      squadrons(G, AIR.squadrons);
      WG.Air.setMissiles('red', AIR.missiles.red);
      WG.Air.setMissiles('blue', AIR.missiles.blue);
    },
    baseline(G) { return { maxId: G.state.nextId - 1, roro: roroCargo(G) }; },

    // Follow-on echelons reach the embarkation port; Taiwan mobilizes its reserves.
    onTurnStart(G, side) {
      const s = G.state;
      s.reinf = s.reinf || {};
      if (side === 'red' && s.turn >= 3 && !s.reinf.w2) {
        s.reinf.w2 = true;
        U(G, 'prc', 'mech', 'W2 Med CA Bde', 119.78, 25.52);
        ship(G, 'prc', 'amph', 'Follow-on Amph Sqn', 119.88, 25.48);
        G.addLog('red', 'Follow-on echelon: W2 Med CA Bde and an amphibious squadron reach Pingtan.');
      }
      if (side === 'blue' && s.turn >= 4 && !s.reinf.roc) {
        s.reinf.roc = true;
        const u = U(G, 'roc', 'resinf', '4 Reserve Bde (mobilized)', 120.68, 24.15);
        if (u) G.addLog('blue', `${u.name} mobilizes at Taichung`);
      }
    },

    status(G) {
      return `<span class="vp ${portHeld(G) ? 'red' : 'blue'}" title="Capture and hold Taichung Port">Port: <b>${portHeld(G) ? 'PRC' : 'Taiwan'}</b></span>` +
        `<span class="vp red" title="PLA brigades ashore on Taiwan (${GOAL} to win)">Ashore <b>${brigades(G)}</b>/${GOAL}</span>`;
    },
    victory(G) {
      if (portHeld(G) && brigades(G) >= GOAL) return { winner: 'red', text: `Taichung Port is open and ${brigades(G)} brigades are ashore: the lodgment can now grow into a front. Mission complete.` };
      return null;
    },
    timeUp(G) { return { winner: 'blue', text: `The lodgment is still too thin (${brigades(G)} brigades${portHeld(G) ? '' : ', no port'}). Try again: take the port early so the ferries can unload.` }; },

    steps: [
      {
        id: 'airborne', title: 'Air assault', focus: [119.44, 25.66],
        text: `The <b>127 Airborne Bde</b> waits at Longtian airbase. Select it and press <b>Air assault</b> on its card, then click a green hex up to
          30 hexes away. Hover for the expected losses in transit from air defense and enemy fighters. Never drop onto a hex you haven't scouted:
          hidden defenders scatter the drop. Landing behind Taichung Port cuts the garrison off.`,
        check: (G) => M.count(G, (u) => u.side === 'red' && u.type === 'airborne' && M.onTaiwan(G, u)) > 0,
      },
      {
        id: 'cap', title: 'Cover the lodgment', focus: [120.20, 24.50],
        text: `Fly <b>CAP</b> over <b>Central Taiwan</b> or <b>Strait Central</b>. Control of the zone gives your ground attacks there <b>+20%</b>,
          and Taiwan's IDF fighters at Ching Chuan Kang are only a few hexes from your beachhead.`,
        check: (G) => M.flying(G, 'red', ['cap']),
      },
      {
        id: 'port', title: 'Take Taichung Port', focus: [120.51, 24.29],
        text: `Ro-ro ferries can only unload in a <b>port you hold</b>. Attack the reserve brigade in <b>Taichung Port</b> from the beachhead,
          the paratroopers and the sea side. Silence the HF-3 battery nearby before your ferries come within its reach.`,
        check: portHeld,
      },
      {
        id: 'roro', title: 'Unload a ferry', focus: [120.51, 24.29],
        text: `Ferries unload <b>onto the port hex itself</b>, so move your troops on through Taichung Port and leave it empty.
          Then sail a <b>ro-ro flotilla</b> next to the port, select it and land the heavy brigade aboard on the green hex.
          From <b>turn 3</b>, causeway barges also let ferries unload on empty coast <b>beside a beachhead</b>, even without a port.`,
        check: (G) => roroCargo(G) < G.state.tutorial.base.roro,
      },
      {
        id: 'supply', title: 'Keep the supply line open', focus: [120.51, 24.29],
        text: `PLA troops on Taiwan are supplied only through what they hold on the coast: a captured port supplies <b>3 units, plus 2 per transport
          alongside</b>; a beachhead supplies 1 plus 2 per amphibious squadron alongside. Park an empty ferry or amphibious squadron next to Taichung Port.`,
        check: (G) => portHeld(G) && M.count(G, (u) => {
          const p = M.city(G, 'Taichung Port');
          return u.side === 'red' && G.type(u).capacity && Hex.distance(u.q, u.r, p.q, p.r) <= 1;
        }) > 0,
      },
      {
        id: 'reinforce', title: 'Ship the follow-on echelon', focus: [119.78, 25.52],
        text: `From turn 3 a new brigade and an empty amphibious squadron reach <b>Pingtan</b>. To <b>embark</b>, select the brigade and click the ship
          next to it (or use the button on its card). Then sail it across and land it.`,
        check: (G) => M.count(G, (u) => u.side === 'red' && u.id > G.state.tutorial.base.maxId && M.domain(G, u) === 'land' && (u.carrier || M.onTaiwan(G, u))) > 0,
      },
      {
        id: 'build', title: `Build up to ${GOAL} brigades`, focus: [120.51, 24.29],
        text: `Hold Taichung Port with <b>${GOAL} brigades ashore</b> at the same time. Keep your ships alongside so everyone stays in supply.`,
        check: (G) => portHeld(G) && brigades(G) >= GOAL,
      },
    ],
  });
})(window.WG);
