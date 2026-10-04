'use strict';

// Academy mission 4: a combined amphibious assault. A small PLA task force seizes the Penghu Islands.
(function (WG) {
  const { mission, squadrons, mines, base, M, U, ship } = WG.Academy;

  const AIR = {
    bases: [base.air.bases.find((b) => b.id === 'inland')],
    hexBaseInfo: base.air.hexBaseInfo,
    squadrons: [
      ['roc', 'ftr', 'ROCAF 4 TFW F-16V', 'chiayi'], ['roc', 'ftr', 'ROCAF 1 TFW IDF', 'tainan'],
      ['prc', 'ftr', 'J-16 Bde (Jinjiang)', 'jinjiang'], ['prc', 'ftr', 'J-10C Bde (Xiamen)', 'xiamen'],
      ['prc', 'ftr5', 'J-20 Bde (Longtian)', 'longtian'], ['prc', 'aew', 'KJ-500 (Changle)', 'changle'],
      ['prc', 'uav', 'GJ-2 UAV Regt', 'jinjiang'], ['prc', 'bomber', 'H-6K Bomber Div', 'inland'],
    ],
    missiles: {
      red: {
        srbm: { faction: 'prc', name: 'SRBM (DF-11/15/16)', stock: 8, perTurn: 3, power: 6, ballistic: true, reach: ['map'] },
        lacm: { faction: 'prc', name: 'Cruise missiles (CJ-10/20)', stock: 4, perTurn: 2, power: 5, reach: ['map'] },
      },
      blue: {},
    },
  };

  const minesLeft = (G) => Object.values(G.state.mines).filter((s) => s === 'blue').length;
  const navySteps = (G) => M.steps(G, (u) => u.side === 'blue' && M.domain(G, u) !== 'land');
  const ashore = (G) => M.count(G, (u) => u.side === 'red' && !u.carrier && M.domain(G, u) === 'land' && G.tile(u.q, u.r).mass === 'Penghu') > 0;

  mission({
    id: 'academy-4',
    name: 'Seize Penghu',
    topic: 'Amphibious assault',
    description: 'Lead a small PLA task force against the Penghu Islands: air cover, missile strikes, mine clearance and an amphibious landing, all in one operation.',
    player: 'prc',
    factions: ['prc', 'roc'],
    maxTurns: 10,
    focus: [119.45, 23.85, 0.8],
    goal: 'Capture Magong.',
    unitTypes: ['inf', 'marine', 'amphmech', 'asm', 'ddg', 'ffg', 'fac', 'amph', 'mcm'],
    aiPlan: { areas: ['penghu'], penghu: true },
    air: AIR,
    briefing: `<p>H-Hour minus 12. Before the main landings, the PLA must take the Penghu Islands in the middle of the strait: their airbase,
      radar and anti-ship missiles cover the approaches to southern Taiwan.</p>
      <p><b>Your orders:</b> capture <b>Magong</b> within 10 turns with three amphibious squadrons, their escorts, two minesweeper groups,
      a few air regiments and a small missile allocation.</p>
      <p>This mission puts the earlier lessons together and adds mines and amphibious landings. Follow the <b>Tutorial</b> tab.</p>`,

    setup(G) {
      U(G, 'roc', 'inf', 'Penghu Def Cmd', 119.57, 23.57, { entrenched: true });
      U(G, 'roc', 'asm', 'HF-3 Btry Penghu', 119.62, 23.66, { entrenched: true, echelon: 'I' });
      U(G, 'roc', 'ffg', '146 Fleet FFG', 119.45, 23.62);
      U(G, 'roc', 'fac', 'Kuang Hua VI Boats', 119.75, 23.45);
      ship(G, 'prc', 'amph', 'ATF Penghu 1', 119.30, 24.15, [['marine', '3 Marine Bde']]);
      ship(G, 'prc', 'amph', 'ATF Penghu 2', 119.20, 24.10, [['amphmech', '1 Amph CA Bde']]);
      ship(G, 'prc', 'amph', 'ATF Penghu 3', 119.40, 24.20, [['marine', '2 Marine Bde']]);
      U(G, 'prc', 'ddg', '052D SAG', 119.35, 24.05);
      U(G, 'prc', 'ffg', '054A Escort', 119.15, 24.00);
      U(G, 'prc', 'mcm', 'MCM Group 1', 119.25, 24.00);
      U(G, 'prc', 'mcm', 'MCM Group 2', 119.10, 24.05);
      squadrons(G, AIR.squadrons);
      WG.Air.setMissiles('red', AIR.missiles.red);
      WG.Air.setMissiles('blue', AIR.missiles.blue);
      mines(G, ['penghu'], 0.6);
    },
    baseline(G) { return { missiles: M.missilesLeft(G, 'red'), mines: minesLeft(G), navy: navySteps(G) }; },

    status(G) {
      const own = M.owner(G, 'Magong') === 'red';
      return `<span class="vp ${own ? 'red' : 'blue'}" title="Capture Magong to win">Magong: <b>${own ? 'PRC' : 'Taiwan'}</b></span>`;
    },
    victory(G) {
      if (M.owner(G, 'Magong') === 'red') return { winner: 'red', text: 'Magong has fallen and the Penghu Islands are in PRC hands. Mission complete.' };
      return null;
    },
    timeUp() { return { winner: 'blue', text: 'Penghu holds. Try again: soften the defenders with missiles and bombers, then land with all three brigades.' }; },

    steps: [
      {
        id: 'sail', title: 'Sail for Penghu', focus: [119.30, 24.10],
        text: `Your task force is at sea north of Penghu. Lead with the destroyer and frigate and keep the amphibious squadrons (AMPH) behind them:
          the island's <b>HF-3 battery</b> can reach 10 hexes out to sea.`,
        check: (G) => M.count(G, (u) => u.side === 'red' && M.domain(G, u) === 'sea' && u.moved) > 0,
      },
      {
        id: 'cap', title: 'Win the air', focus: [119.70, 23.20],
        text: `In the <b>Air</b> tab, fly a fighter on <b>CAP</b> over the <b>Penghu Channel</b>. Taiwan's F-16s will contest it from Chiayi and Tainan.`,
        check: (G) => M.flying(G, 'red', ['cap']),
      },
      {
        id: 'isr', title: 'Find the enemy', focus: [119.50, 23.60],
        text: `Fly the <b>KJ-500 (AEW)</b> or the <b>GJ-2 drones (ISR)</b> over the Penghu Channel so the Taiwanese frigate and fast attack boats become targetable.
          Drones also spot ground units in the open.`,
        check: (G) => M.flying(G, 'red', ['aew', 'isr']),
      },
      {
        id: 'ship', title: 'Strike the defending navy', focus: [119.45, 23.62],
        text: `Fire on the Taiwanese warships with the <b>052D destroyer group</b> before they reach your transports. Concentrate salvos on one target.`,
        check: (G) => navySteps(G) < G.state.tutorial.base.navy,
      },
      {
        id: 'missile', title: 'Soften the beach', focus: [119.57, 23.57],
        text: `In the <b>Missiles</b> tab, fire an SRBM or cruise missile salvo at the <b>HF-3 battery</b> or the <b>coastal radar</b> on Penghu.
          Missiles only hit high-value ground targets (batteries, air defense, headquarters), and the garrison in Magong hides in the town
          until your troops or drones spot it.`,
        check: (G) => M.missilesLeft(G, 'red') < G.state.tutorial.base.missiles,
      },
      {
        id: 'strike', title: 'Bomb from the air', focus: [119.62, 23.66],
        text: `Send the <b>H-6K bombers</b> or a fighter on a <b>Strike</b> against a detected target on Penghu. The HF-3 battery threatens your transports.`,
        check: (G) => M.flying(G, 'red', ['strike']),
      },
      {
        id: 'mines', title: 'Clear the mines', focus: [119.50, 23.48],
        text: `Mine markers guard the beach approaches; ships entering a mined hex may be damaged. Minesweepers are fragile, so silence the
          HF-3 battery and the enemy ships first. Move an <b>MCM group</b> next to the mines, then <b>leave it in place for a whole turn</b>:
          a minesweeper that doesn't move clears its own and neighbouring hexes when you end the turn.`,
        check: (G) => minesLeft(G) < G.state.tutorial.base.mines,
      },
      {
        id: 'land', title: 'Storm ashore', focus: [119.50, 23.48],
        text: `Move an amphibious squadron next to Penghu, select it, pick the brigade aboard and click a <b>green hex</b> to land.
          Red dashed hexes mean an <b>assault landing</b> against defenders at reduced strength (marines and amphibious brigades fight better).
          If the defenders hold, your troops stay aboard. Keep the ships alongside the beachhead: they bring supply across the strait.`,
        check: ashore,
      },
      {
        id: 'magong', title: 'Take Magong', focus: [119.57, 23.57],
        text: `Attack the Penghu Defense Command in Magong from several sides, with air superiority overhead for +20%. Capture Magong to win.`,
        check: (G) => M.owner(G, 'Magong') === 'red',
      },
    ],
  });
})(window.WG);
