'use strict';

// Academy mission 2: naval warfare. US warships hunt a PLA amphibious group bound for southern Taiwan.
(function (WG) {
  const { mission, mines, M, U, ship } = WG.Academy;

  const isAmph = (G, u) => u.side === 'red' && u.type === 'amph';
  const ashore = (G) => M.count(G, (u) => u.side === 'red' && M.domain(G, u) === 'land' && M.onTaiwan(G, u));
  const sunk = (G) => G.state.tutorial.base.amph - M.count(G, (u) => isAmph(G, u));

  mission({
    id: 'academy-2',
    name: 'Sea Denial',
    topic: 'Naval warfare',
    description: 'Command US warships against a PLA amphibious group heading for Tainan. Targeting, missile salvos, air defense, emissions, submarines and torpedoes.',
    player: 'us',
    factions: ['prc', 'roc', 'us'],
    maxTurns: 7,
    focus: [120.0, 22.9, 0.65],
    goal: 'Sink three amphibious squadrons before three PLA brigades get ashore.',
    unitTypes: ['ddg', 'ffg', 'fac', 'amph', 'mcm', 'ssk', 'ssn', 'asm', 'mech', 'marine', 'amphmech'],
    aiPlan: { areas: ['south'] },
    briefing: `<p>D-Day. A PLA amphibious task group is sailing from Xiamen for the beaches around Tainan. Two US destroyer squadrons and an attack submarine
      are in the Bashi Channel; Taiwan's navy and coastal missiles will fight alongside you under computer control.</p>
      <p><b>Your orders:</b> sink <b>three amphibious squadrons</b>. You lose if <b>three PLA brigades</b> get ashore on Taiwan.
      Survive 7 turns without that and the landing window closes.</p>
      <p>This mission covers the war at sea: finding targets, missile salvos against air defense, radar emissions, submarines and torpedoes.
      Follow the <b>Tutorial</b> tab.</p>`,

    setup(G) {
      // PLA Southern Amphibious Task Group.
      ship(G, 'prc', 'amph', 'ATF South 1', 118.75, 24.45, [['amphmech', '14 Amph CA Bde']]);
      ship(G, 'prc', 'amph', 'ATF South 2', 118.65, 24.35, [['marine', '2 Marine Bde']]);
      ship(G, 'prc', 'amph', 'ATF South 3', 118.85, 24.35, [['amphmech', '91 Amph CA Bde']]);
      ship(G, 'prc', 'amph', 'ATF South 4', 118.75, 24.25, [['marine', '5 Marine Bde']]);
      U(G, 'prc', 'ddg', '052D SAG South', 118.90, 24.20);
      U(G, 'prc', 'ffg', '054A Escort South', 118.60, 24.20);
      U(G, 'prc', 'mcm', 'MCM Group South', 118.95, 24.45);
      U(G, 'prc', 'ssk', '039B Sub Grp', 119.90, 22.75);
      // US Navy.
      U(G, 'us', 'ddg', 'DESRON 15', 120.10, 22.15);
      U(G, 'us', 'ddg', 'DESRON 7', 119.85, 22.30);
      U(G, 'us', 'ssn', 'SSN Group West', 119.60, 22.50);
      // Taiwan.
      U(G, 'roc', 'ffg', '124 Fleet FFG', 120.15, 22.50);
      U(G, 'roc', 'fac', 'Kuang Hua VI Boats', 120.05, 23.15);
      U(G, 'roc', 'asm', 'Harpoon CDCM Bn S', 120.22, 22.90, { echelon: 'II', entrenched: true });
      U(G, 'roc', 'mech', '333 Mech Bde', 120.28, 23.02, { entrenched: true });
      U(G, 'roc', 'marine', '77 Marine Bde', 120.30, 22.62, { entrenched: true });
      mines(G, ['south'], 0.4);
    },
    baseline(G) {
      return { amph: M.count(G, (u) => isAmph(G, u)), subs: M.count(G, (u) => u.side === 'red' && M.domain(G, u) === 'sub') };
    },

    status(G) {
      return `<span class="vp blue" title="Amphibious squadrons sunk (3 to win)">Sunk <b>${sunk(G)}</b>/3</span>` +
        `<span class="vp red" title="PLA brigades ashore (3 and you lose)">Ashore <b>${ashore(G)}</b>/3</span>`;
    },
    victory(G) {
      if (ashore(G) >= 3) return { winner: 'red', text: 'Three PLA brigades are ashore near Tainan and the lodgment is established. Try again: engage earlier and concentrate your salvos.' };
      if (sunk(G) >= 3) return { winner: 'blue', text: 'Three amphibious squadrons are on the bottom of the strait and the southern landing is broken. Mission complete.' };
      return null;
    },
    timeUp() { return { winner: 'blue', text: 'The landing window closes with the task group still at sea. Mission complete.' }; },

    steps: [
      {
        id: 'sail', title: 'Get under way', focus: [120.0, 22.3],
        text: `The PLA moves first each turn. <b>Click a US destroyer group</b> (DDG) to select it and click a highlighted hex to sail.
          Ships move up to 10 hexes. The orange ring shows its anti-ship missile range (14 hexes); the blue ring, its air defense umbrella.
          Avoid the minefields off the beaches.`,
        check: (G) => M.count(G, (u) => u.faction === 'us' && M.domain(G, u) !== 'land' && u.moved) > 0,
      },
      {
        id: 'track', title: 'Get a firing solution', focus: [120.18, 23.20],
        text: `Missiles need a <b>targetable</b> contact, not just a detected one. Your own ships see 3 hexes; Taiwan's <b>coastal radars</b>
          track ships within about 5 hexes of the coast. Sail north until a PLA ship that the radars or your ships can see is within your missile range: it will be outlined in red
          when you select the destroyer. Hover an enemy contact to check what you know about it.`,
        check: (G) => {
          const known = G.intel('blue');
          return M.count(G, (u) => u.faction === 'us' && !u.carrier && G.type(u).sea && G.targets(u, known).some((e) => M.domain(G, e) === 'sea')) > 0;
        },
      },
      {
        id: 'fire', title: 'Fire a missile salvo', focus: [119.40, 23.80],
        text: `With a destroyer selected, enemy ships in range are outlined in red. <b>Hover one</b> for the expected damage after its air defense
          (escorts' blue rings cover their neighbours), then click to fire. Each salvo lowers the target's defenses for the rest of the turn,
          so <b>several salvos at one target</b> saturate it. Destroyers carry 4 salvos.`,
        check: (G) => M.count(G, (u) => u.faction === 'us' && u.type === 'ddg' && u.ammo < G.type(u).sea.ammo) > 0,
      },
      {
        id: 'emcon', title: 'Go silent', focus: [120.0, 22.5],
        text: `A ship with its radar on can always be detected. Select a ship and press <b>Radar off (EMCON)</b> on its card to hide it from enemy sensors,
          at the cost of most of its air defense. Turn it back on before you need to defend against missiles.`,
        check: (G) => M.count(G, (u) => u.faction === 'us' && M.domain(G, u) === 'sea' && !u.emitting) > 0,
      },
      {
        id: 'sub', title: 'Find the submarine', focus: [119.90, 22.75],
        text: `A PLA diesel submarine is lurking in the southern strait. Submarines are invisible until a ship with <b>sonar</b> comes within its ASW range
          (destroyers 1 hex, frigates 2), or until they fire. Sweep ahead of your force with a destroyer; once it's found, attack it.`,
        check: (G) => M.targetable(G, 'blue', 'sub') || M.count(G, (u) => u.side === 'red' && M.domain(G, u) === 'sub') < G.state.tutorial.base.subs,
      },
      {
        id: 'torpedo', title: 'Torpedo attack', focus: [119.60, 22.50],
        text: `Your <b>SSN</b> is hidden from the enemy and its torpedoes ignore air defense, but it must close to 1 hex.
          Escorts with sonar next to the target weaken the attack, and firing gives your position away for a turn. Pick off a straggler.`,
        check: (G) => M.count(G, (u) => u.type === 'ssn' && u.faction === 'us' && u.attacked) > 0,
      },
      {
        id: 'rearm', title: 'Rearm in port', focus: [120.30, 22.62],
        text: `Ships that run out of salvos <b>rearm fully</b> at the start of a turn in a friendly port. Sail a destroyer into <b>Kaohsiung</b> or <b>Tainan</b>.`,
        check: (G) => M.count(G, (u) => u.faction === 'us' && M.domain(G, u) === 'sea' && (() => { const t = G.tile(u.q, u.r); return t.city && t.city.port && t.city.owner === 'blue'; })()) > 0,
      },
      {
        id: 'amph', title: 'Sink three amphibious squadrons', focus: [119.40, 23.80],
        text: `The amphibious squadrons (AMPH) carry the brigades: each one sunk takes a brigade down with it. Strip the escorts' air defense first
          or saturate them, and strike before the transports reach the beaches.`,
        check: (G) => sunk(G) >= 3,
      },
    ],
  });
})(window.WG);
