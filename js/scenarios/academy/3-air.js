'use strict';

// Academy mission 3: air power and missiles. US air wings strike a PLA task group in the central strait.
(function (WG) {
  const { mission, squadrons, mines, base, M, U, ship } = WG.Academy;

  const ships = (G) => M.count(G, (u) => u.side === 'red' && M.domain(G, u) === 'sea');
  const sunk = (G) => G.state.tutorial.base.ships - ships(G);
  const ashore = (G) => M.count(G, (u) => u.side === 'red' && M.domain(G, u) === 'land' && M.onTaiwan(G, u));
  const B = (id) => base.air.bases.find((b) => b.id === id);

  const AIR = {
    bases: ['kadena', 'naha', 'iwakuni', 'misawa', 'csg5', 'guam', 'zhejiang', 'guangdong', 'inland'].map(B),
    hexBaseInfo: base.air.hexBaseInfo,
    accessOk: base.air.accessOk,
    squadrons: [
      ['roc', 'ftr', 'ROCAF 4 TFW F-16V', 'chiayi'], ['roc', 'ftr', 'ROCAF 3 TFW IDF', 'cck'], ['roc', 'aew', 'ROCAF E-2K', 'pingtung'],
      ['us', 'ftr', '18 Wing F-15EX', 'kadena'], ['us', 'ftr5', 'F-22 Det (Kadena)', 'kadena'], ['us', 'aew', 'E-3 AWACS (Kadena)', 'kadena'],
      ['us', 'tanker', 'KC-135 (Kadena)', 'kadena'], ['us', 'ftr', '35 FW F-16 (SEAD)', 'misawa'],
      ['us', 'bomber', 'B-1B (Guam)', 'guam'], ['us', 'tanker', 'KC-46 (Guam)', 'guam'],
      ['us', 'ftr5', 'CVW-5 F-35C', 'csg5'], ['us', 'ftr', 'CVW-5 F/A-18E/F', 'csg5'], ['us', 'aew', 'CVW-5 E-2D', 'csg5'], ['us', 'ewac', 'CVW-5 EA-18G', 'csg5'],
      ['prc', 'ftr', 'J-16 Bde (Longtian)', 'longtian'], ['prc', 'ftr', 'J-10C Bde (Hui\'an)', 'huian'], ['prc', 'ftr', 'J-16 Bde (Jinjiang)', 'jinjiang'],
      ['prc', 'ftr5', 'J-20 Bde (East)', 'zhejiang'], ['prc', 'aew', 'KJ-500 (Changle)', 'changle'], ['prc', 'ewac', 'J-16D EW Regt', 'zhejiang'],
    ],
    missiles: {
      red: {
        srbm: { faction: 'prc', name: 'SRBM (DF-11/15/16)', stock: 12, perTurn: 4, power: 6, ballistic: true, reach: ['map'] },
        mrbm: { faction: 'prc', name: 'MRBM (DF-17/21D)', stock: 6, perTurn: 2, power: 7, ballistic: true, antiShip: true, reach: ['map', 'close', 'medium'] },
        lacm: { faction: 'prc', name: 'Cruise missiles (CJ-10/20)', stock: 6, perTurn: 2, power: 5, reach: ['map', 'close', 'medium'] },
      },
      blue: { tlam: base.air.missiles.blue.tlam, mst: base.air.missiles.blue.mst },
    },
  };

  mission({
    id: 'academy-3',
    name: 'Air Superiority',
    topic: 'Air power and missiles',
    description: 'Fly US air wings from Okinawa, Guam and a carrier against a PLA task group crossing the strait. Air control, early warning, jamming, tankers, strikes and Tomahawks.',
    player: 'us',
    factions: ['prc', 'roc', 'us'],
    maxTurns: 7,
    focus: [120.6, 24.3, 0.5],
    goal: 'Sink three PLA ships before three brigades get ashore.',
    unitTypes: ['ddg', 'ffg', 'amph', 'ssn', 'asm', 'inf', 'mech', 'armor', 'marine', 'amphmech'],
    aiPlan: { areas: ['central'], strikeJapan: true },
    air: AIR,
    briefing: `<p>D-Day. A PLA task group is leaving Meizhou Bay to cross the strait toward Taichung under cover of the Eastern Theater's fighters.
      US air wings at Kadena, Guam and aboard USS <i>George Washington</i> in the Philippine Sea are ready to fly.</p>
      <p><b>Your orders:</b> sink <b>three PLA ships</b> within 7 turns. You lose if all <b>three PLA brigades</b> get ashore first.</p>
      <p>Your aircraft and missiles are off the map: you command them from the <b>Air</b> and <b>Missiles</b> tabs. Expect PLA missiles to hit Kadena.
      Follow the <b>Tutorial</b> tab.</p>`,

    setup(G) {
      ship(G, 'prc', 'amph', 'ATF Center 1', 119.10, 25.15, [['amphmech', '73 GA 14 Amph Bde (2)']]);
      ship(G, 'prc', 'amph', 'ATF Center 2', 119.00, 25.05, [['marine', '3 Marine Bde']]);
      ship(G, 'prc', 'amph', 'ATF Center 3', 119.20, 25.05, [['amphmech', '74 GA 125 Amph Bde']]);
      U(G, 'prc', 'ddg', '052D SAG Center', 119.25, 25.20);
      U(G, 'prc', 'ffg', '054B Escort Center', 119.10, 24.95);
      U(G, 'prc', 'ffg', '054A Escort Center 2', 119.35, 25.05);
      U(G, 'us', 'ddg', 'DESRON 15', 122.95, 23.35);
      U(G, 'roc', 'mech', '234 Mech Bde', 120.62, 24.22, { entrenched: true });
      U(G, 'roc', 'inf', '104 Inf Bde', 120.45, 23.75, { entrenched: true });
      U(G, 'roc', 'armor', '586 Armor Bde', 120.58, 24.06, { entrenched: true });
      U(G, 'roc', 'asm', 'HF-3 CDCM Bn C', 120.55, 24.32, { echelon: 'II', entrenched: true });
      mines(G, ['central'], 0.5);
      squadrons(G, AIR.squadrons);
      WG.Air.setMissiles('red', AIR.missiles.red);
      WG.Air.setMissiles('blue', AIR.missiles.blue);
    },
    baseline(G) { return { ships: ships(G), missiles: M.missilesLeft(G, 'blue') }; },

    status(G) {
      return `<span class="vp blue" title="PLA ships sunk (3 to win)">Sunk <b>${sunk(G)}</b>/3</span>` +
        `<span class="vp red" title="PLA brigades ashore (3 and you lose)">Ashore <b>${ashore(G)}</b>/3</span>`;
    },
    victory(G) {
      if (ashore(G) >= 3) return { winner: 'red', text: 'The whole landing force is ashore near Taichung. Try again: win the air first, then mass your strikes on one ship at a time.' };
      if (sunk(G) >= 3) return { winner: 'blue', text: 'Three PLA ships are sunk and the central task group turns back. Mission complete.' };
      return null;
    },
    timeUp() { return { winner: 'red', text: 'The task group survives the week. Try again: win the air first, then mass your strikes on one ship at a time.' }; },

    steps: [
      {
        id: 'cap', title: 'Fly combat air patrol', focus: [119.90, 24.55],
        text: `Open the <b>Air</b> tab. Squadrons are listed by base; each flies <b>one mission per turn</b>. Give a fighter a <b>CAP</b> order
          and pick <b>Strait Central</b>. The map overlay shows who controls each air zone: 1.5 times the enemy's fighter strength wins it,
          and air superiority adds 20% to attacks in that zone.`,
        check: (G) => M.flying(G, 'blue', ['cap']),
      },
      {
        id: 'aew', title: 'Early warning', focus: [119.90, 24.55],
        text: `Fly the <b>E-3 AWACS</b> or <b>E-2D</b> on an <b>AEW</b> mission over Strait Central. Ships in that zone and its neighbours become
          <b>targetable</b>, and your fighters there fight 25% better. Keep CAP overhead: support aircraft are easy prey.`,
        check: (G) => M.flying(G, 'blue', ['aew']),
      },
      {
        id: 'jam', title: 'Jam their defenses', focus: [119.90, 24.55],
        text: `The <b>EA-18G Growlers</b> can <b>jam</b> a zone: enemy air defense there loses 30%, and their sensors drop to rough tracks. Jam the zone your strikes are going into.`,
        check: (G) => M.flying(G, 'blue', ['jam']),
      },
      {
        id: 'strike', title: 'Strike a ship', focus: [119.50, 24.70],
        text: `Give a fighter or the F-35Cs a <b>Strike</b> order and pick a PLA ship from the list (hover for the expected damage). Enemy fighters over the
          target intercept strikes, and the ships' air defense shoots back, so fly after your CAP has won the zone.`,
        check: (G) => M.flying(G, 'blue', ['strike'], (q) => q.mission.target),
      },
      {
        id: 'bomber', title: 'Long-range bombers', focus: [119.50, 24.70],
        text: `The <b>B-1B</b> at Guam fires standoff missiles from beyond the enemy's fighters, but Guam is far: the sortie draws on your
          <b>tanker</b> pool (KC-135, KC-46), and the bombers rest a turn afterwards. Bases close to the fight need no tankers but are easier to hit.`,
        check: (G) => M.flying(G, 'blue', ['strike'], (q) => q.base === 'guam'),
      },
      {
        id: 'tomahawk', title: 'Fire Tomahawks', focus: [122.95, 23.35],
        text: `Open the <b>Missiles</b> tab. While DESRON 15 is afloat you can fire <b>Maritime Strike Tomahawks</b> at ships you can target,
          or land-attack Tomahawks at airbases and batteries. Stocks are small and there is a limit per turn.`,
        check: (G) => M.missilesLeft(G, 'blue') < G.state.tutorial.base.missiles,
      },
      {
        id: 'airbase', title: 'Hit an enemy airbase', focus: [119.44, 25.66],
        text: `PLA fighters fly from airbases in Fujian. A strike or Tomahawk on an <b>airbase</b> damages its runway (a damaged runway allows one sortie a turn,
          a closed one none) and can destroy aircraft caught on the ground. In the full game, hitting the mainland raises the <b>escalation</b> track,
          so weigh it carefully there.`,
        check: (G) => Object.entries(WG.Air.st().bases).some(([id, b]) => WG.Air.baseDef(id) && WG.Air.baseDef(id).side === 'red' && b.runway > 0),
      },
      {
        id: 'sink', title: 'Sink three ships', focus: [119.50, 24.70],
        text: `Mass your strikes and missiles on one ship at a time: each hit on a hex saturates its defenses for the rest of the turn.
          Check your bases in the Air tab after PLA missile raids; a closed runway grounds everything there.`,
        check: (G) => sunk(G) >= 3,
      },
    ],
  });
})(window.WG);
