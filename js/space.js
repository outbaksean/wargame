'use strict';

// Space layer (reconnaissance satellites, SATCOM, counterspace) and the escalation track.
// Neither lives on the hex map: satellites sweep air zones on a published schedule; escalation is a shared meter.
(function (WG) {
  const { TERRAIN } = WG;
  const other = (s) => (s === 'blue' ? 'red' : 'blue');

  const Space = {
    get G() { return WG.Game; },
    active() { return !!(this.G && this.G.state && this.G.state.space); },
    st(side) { return this.G.state.space[side]; },

    init(G) {
      const cfg = G.scenario.space;
      if (!cfg) { G.state.space = null; G.state.escalation = null; return; }
      G.state.space = {};
      for (const side of ['blue', 'red']) {
        const c = cfg[side];
        G.state.space[side] = {
          isr: c.isr, isrMax: c.isr, satcom: c.satcom, satcomMax: c.satcom,
          dazzle: c.dazzle, asat: c.asat, blinded: 0, passes: [], usedAction: false,
        };
      }
      G.state.escalation = { level: cfg.escalationStart || 3, by: { blue: 0, red: 0 }, flags: {}, events: [] };
    },

    // ---------- satellites
    effectiveIsr(side) {
      const s = this.st(side);
      return Math.max(0, s.isr - (s.blinded > 0 ? 2 : 0));
    },
    // Zones swept on `side`'s turn number `turn`: a rotating, predictable schedule.
    passesFor(side, turn, n = this.effectiveIsr(side)) {
      const zones = Object.keys(this.G.map.zones || {}).sort();
      if (!zones.length || n <= 0) return [];
      const off = (turn * 5 + (side === 'red' ? 3 : 0)) % zones.length;
      const out = [];
      for (let i = 0; i < Math.min(n, zones.length); i++) out.push(zones[(off + i * 2) % zones.length]);
      return [...new Set(out)];
    },

    startTurn(G, side) {
      if (!this.active()) return;
      const s = this.st(side);
      if (s.blinded > 0) s.blinded -= 1;
      s.passes = this.passesFor(side, G.state.turn);
      s.usedAction = false;
      G.touch();
    },

    intelLevel(side, e) {
      if (!this.active()) return 0;
      const G = this.G;
      const et = G.type(e);
      if (et.domain === 'sub') return 0;
      const t = G.tile(e.q, e.r);
      if (!this.st(side).passes.includes(t.zone)) return 0;
      const jam = G.jamFactor(e.side, e.q, e.r) < 1;
      if (et.domain === 'sea') return jam ? 1 : 2;
      return TERRAIN[t.terrain].conceal ? 0 : 1;
    },

    // Degraded SATCOM shortens command reach.
    commandRange(side, range) {
      if (!this.active()) return range;
      return this.st(side).satcom <= 1 ? range - 1 : range;
    },

    satcomOk(side) { return !this.active() || this.st(side).satcom >= 1; },

    // ---------- counterspace
    canAct(side) { return this.active() && !this.st(side).usedAction; },
    dazzle(side) {
      const G = this.G;
      const s = this.st(side);
      if (!this.canAct(side) || s.dazzle <= 0) return false;
      s.dazzle -= 1;
      s.usedAction = true;
      const t = this.st(other(side));
      t.blinded = 2;
      t.passes = this.passesFor(other(side), G.state.turn, this.effectiveIsr(other(side)));
      G.addLog(side, `${G.sideName(side)} dazzles and jams ${G.sideName(other(side))} reconnaissance satellites (their coverage halved for two turns)`);
      G.touch();
      return true;
    },
    asat(side, what) {
      const G = this.G;
      const s = this.st(side);
      if (!this.canAct(side) || s.asat <= 0) return false;
      s.asat -= 1;
      s.usedAction = true;
      const t = this.st(other(side));
      if (what === 'satcom') t.satcom = Math.max(0, t.satcom - 1);
      else t.isr = Math.max(0, t.isr - 1);
      G.addLog(side, `${G.sideName(side)} destroys a ${G.sideName(other(side))} ${what === 'satcom' ? 'communications' : 'reconnaissance'} satellite with a kinetic ASAT. Debris spreads through low orbit.`);
      this.escalate(side, 2, 'kinetic anti-satellite strike');
      G.touch();
      return true;
    },

    // ---------- escalation
    esc() { return this.G.state.escalation; },
    escalate(side, amount, why, onceKey) {
      const e = this.esc();
      if (!e || this.G.state.over) return;
      if (onceKey) {
        if (e.flags[onceKey]) return;
        e.flags[onceKey] = true;
      }
      const before = e.level;
      e.level = Math.min(10, e.level + amount);
      e.by[side] = (e.by[side] || 0) + amount;
      e.events.push({ t: this.G.state.turn, side, amount, why });
      this.G.addLog(null, `Escalation ${before} → ${e.level}: ${why} (${this.G.sideName(side)})`);
      const sc = this.G.scenario;
      if (sc.onEscalation) sc.onEscalation(this.G, before, e.level, side);
      if (e.level >= 10) {
        const s = this.G.state;
        s.over = true;
        s.winner = 'draw';
        s.reason = 'escalation';
        const worse = e.by.red > e.by.blue ? 'red' : e.by.blue > e.by.red ? 'blue' : null;
        s.reasonText = 'Catastrophic escalation: the crisis spirals toward nuclear use and the war is halted in disaster. Nobody wins.' +
          (worse ? ` ${this.G.sideName(worse)} drove most of the escalation.` : '');
      }
    },
  };

  WG.Space = Space;
  WG.Game.modules.push(Space);
})(window.WG);
