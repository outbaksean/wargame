'use strict';

// Academy mission 1: ground combat. PLA brigades ashore near Taoyuan push inland.
(function (WG) {
  const { mission, at, shipAt, beachhead, M } = WG.Academy;

  mission({
    id: 'academy-1',
    name: 'Beachhead',
    topic: 'Ground combat',
    description: 'Break out of a PLA lodgment on the north coast and take Taoyuan. Movement, combat odds, flanking, artillery, digging in and supply.',
    player: 'prc',
    factions: ['prc', 'roc'],
    maxTurns: 8,
    focus: [121.15, 25.0, 0.9],
    goal: 'Capture Taoyuan.',
    unitTypes: ['amphmech', 'marine', 'armor', 'arty', 'hq', 'inf', 'resinf', 'mech', 'amph'],
    aiPlan: { areas: ['north'] },
    briefing: `<p>D+2. The first wave is ashore on the beaches west of Taoyuan, and causeway barges have brought a heavy brigade over the shore.
      Taiwan's 6th Army Corps is gathering to throw you back into the sea.</p>
      <p><b>Your orders:</b> break out of the beachhead and capture <b>Taoyuan</b> within 8 turns.</p>
      <p>This mission covers the land rules that decide every Strait Crisis game: moving, reading combat odds, flanking, artillery,
      digging in and supply. Follow the <b>Tutorial</b> tab on the right.</p>`,

    // The north coast is tight: Taoyuan (18,16) is one hex from the beaches at 16,16 and 18,15 (Taoyuan AB).
    setup(G) {
      beachhead(G, '16,16');
      beachhead(G, '18,15');
      at(G, 'prc', 'hq', 'ETC Forward HQ', '16,16', { echelon: 'XXX' });
      at(G, 'prc', 'arty', '73 GA Arty Bde', '16,17');
      at(G, 'prc', 'marine', '1 Marine Bde', '17,16');
      at(G, 'prc', 'armor', '72 GA Heavy CA Bde', '17,17');
      at(G, 'prc', 'amphmech', '5 Amph CA Bde', '18,15');
      shipAt(G, 'prc', 'amph', 'ATF North 1', '17,15');
      shipAt(G, 'prc', 'amph', 'ATF North 2', '16,15');
      at(G, 'roc', 'resinf', '1 Reserve Bde', '18,16'); // freshly mobilized, not yet dug in
      at(G, 'roc', 'arty', '21 Arty Cmd', '18,17', { echelon: 'III', entrenched: true });
      at(G, 'roc', 'inf', '153 Inf Bde', '19,16', { entrenched: true });
      at(G, 'roc', 'armor', '542 Armor Bde', '14,19');
    },

    // Record an attack made with flanking support (another brigade next to the target).
    onHostile(G, side, def) {
      if (side !== 'red' || G.type(def).domain !== 'land' || !G.state.tutorial) return;
      const n = WG.Hex.neighbors(def.q, def.r).filter((h) => {
        const f = G.unitAt(h.q, h.r, null, 'land');
        return f && f.side === 'red' && !G.type(f).indirect;
      }).length;
      if (n >= 2) G.state.tutorial.flanked = true;
    },

    status(G) {
      const own = M.owner(G, 'Taoyuan') === 'red';
      return `<span class="vp ${own ? 'red' : 'blue'}" title="Capture Taoyuan to win">Taoyuan: <b>${own ? 'PRC' : 'Taiwan'}</b></span>`;
    },
    victory(G) {
      if (M.owner(G, 'Taoyuan') === 'red') return { winner: 'red', text: 'Taoyuan has fallen and the lodgment is secure. Mission complete.' };
      return null;
    },
    timeUp() { return { winner: 'blue', text: 'Taoyuan still holds and the breakout has stalled. Try again: bombard first, then attack from several sides.' }; },

    steps: [
      {
        id: 'move', title: 'Advance inland', focus: [121.15, 25.05],
        text: `<b>Click one of your brigades</b> to select it. Highlighted hexes show where it can move; hover one to see the path and its cost.
          Click to move. Moving next to an enemy unit stops you (its <b>zone of control</b>), and <kbd>U</kbd> undoes a move that hasn't met the enemy.
          Hover any hex for its terrain: towns, forest and hills are slow to cross but strong to defend.`,
        check: (G) => M.count(G, (u) => u.side === 'red' && M.domain(G, u) === 'land' && u.moved) > 0,
      },
      {
        id: 'arty', title: 'Bombard with artillery', focus: [121.07, 25.07],
        text: `Select the <b>73 GA Arty Bde</b>. Enemies inside its range ring (3 hexes) that you can see are outlined in red.
          Hover one for the odds, then click to fire. Artillery takes no return fire, but <b>cannot fire after moving</b>, so fire first and move later.`,
        check: (G) => M.count(G, (u) => u.side === 'red' && u.type === 'arty' && u.attacked) > 0,
      },
      {
        id: 'attack', title: 'Attack', focus: [121.30, 24.99],
        text: `Select a brigade next to an enemy and <b>hover the enemy</b>: the panel shows the odds, the expected losses on both sides and every modifier
          (terrain, digging in, supply, command). Aim for 1.5 : 1 or better. Click to attack. Beaten defenders may retreat, and the winner advances.`,
        check: (G) => M.count(G, (u) => u.side === 'red' && M.domain(G, u) === 'land' && !G.type(u).indirect && u.attacked) > 0,
      },
      {
        id: 'flank', title: 'Attack with flanking support', focus: [121.30, 24.99],
        text: `Each other friendly brigade next to the target adds <b>+15%</b> to an attack (up to +45%). <b>Attack an enemy that two or more of your brigades are next to</b>
          and look for "Flanking support" in the odds. Keep them within 3 hexes of the <b>ETC Forward HQ</b> for another +20% ("in command").`,
        check: (G) => !!G.state.tutorial.flanked,
      },
      {
        id: 'dig', title: 'Dig in', focus: [121.10, 25.05],
        text: `Taiwan's 542nd Armor Brigade is coming up from the south. A unit that <b>doesn't move</b> for a turn digs in: +30% defense.
          Leave a brigade in place, then press <b>End turn</b> (or <kbd>E</kbd>).`,
        check: (G) => G.state.turn > 1 && M.count(G, (u) => u.side === 'red' && M.domain(G, u) === 'land' && u.entrenched) > 0,
      },
      {
        id: 'port', title: 'Open a port', focus: [121.42, 25.16],
        text: `Units must trace <b>supply</b> back to a source within 8 hexes, or they attack at half strength and wither after 3 turns.
          Across the strait, a beachhead supplies only 1 unit, plus 2 for each amphibious squadron alongside, so keep the ships close.
          A captured <b>port</b> supplies 3 more. March a brigade into undefended <b>Tamsui</b> to the north-east.`,
        check: (G) => M.owner(G, 'Tamsui') === 'red',
      },
      {
        id: 'taoyuan', title: 'Take Taoyuan', focus: [121.30, 24.99],
        text: `Cities double a defender's strength. Wear the garrison of <b>Taoyuan</b> down with artillery, surround it, then attack with your best odds.
          Moving any unit into the empty city captures it.`,
        check: (G) => M.owner(G, 'Taoyuan') === 'red',
      },
    ],
  });
})(window.WG);
