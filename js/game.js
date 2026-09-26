'use strict';

(function (WG) {
  const { Hex, TERRAIN, UNIT_TYPES } = WG;
  const BRIDGE = { name: 'Bridge', cost: { foot: 1, tracked: 1, wheeled: 1 }, def: 0.8 };
  const SAVE_KEY = 'hexcommand.save.v1';
  const other = (s) => (s === 'blue' ? 'red' : 'blue');
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  // Round randomly so that e.g. 1.3 becomes 1 (70%) or 2 (30%).
  const sround = (x) => Math.floor(x) + (Math.random() < x - Math.floor(x) ? 1 : 0);

  const Game = {
    map: null,
    state: null,
    undo: null,
    other,
    cap,

    newGame({ seed, cols, rows, maxTurns, players, fog }) {
      this.map = WG.generateMap({ seed, cols, rows });
      this.state = {
        seed, cols, rows, maxTurns, players, fog,
        turn: 1, side: 'blue', vp: { blue: 0, red: 0 },
        units: [], nextId: 1, log: [], over: false, winner: null, reason: null,
      };
      this.undo = null;
      this.deploy('blue');
      this.deploy('red');
      this.addLog(null, `Operation begins: ${maxTurns} turns. Hold towns to score victory points each turn.`);
      this.startTurn();
    },

    deploy(side) {
      const m = this.map;
      const capital = m.cities.find((c) => c.city.capital && c.city.owner === side);
      const dir = side === 'blue' ? 1 : -1;
      const inZone = (t) => (side === 'blue' ? t.col <= m.cols * 0.28 : t.col >= m.cols * 0.72 - 1);
      const rng = WG.rng(this.state.seed * 7 + (side === 'blue' ? 1 : 2));
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
          if (this.unitAt(t.q, t.r)) continue;
          const s = Hex.distance(t.q, t.r, anchor.q, anchor.r) + rng() * 2.5;
          if (s < bestScore) { bestScore = s; best = t; }
        }
        if (!best) continue;
        count[type] = (count[type] || 0) + 1;
        this.state.units.push({
          id: this.state.nextId++, side, type,
          name: type === 'hq' ? `${brigade} BDE HQ` : `${count[type]}/${brigade} ${ut.short}`,
          q: best.q, r: best.r, steps: ut.steps, mpLeft: 0, moved: false, attacked: false, entrenched: false,
        });
      }
    },

    // ---------- queries
    type(u) { return UNIT_TYPES[u.type]; },
    tile(q, r) { return this.map.tiles.get(Hex.key(q, r)); },
    terr(t) { return t.terrain === 'river' && t.road ? BRIDGE : TERRAIN[t.terrain]; },
    unitAt(q, r, exclude) {
      for (const u of this.state.units) if (u.q === q && u.r === r && u !== exclude) return u;
      return null;
    },
    unitsOf(side) { return this.state.units.filter((u) => u.side === side); },
    alive(u) { return this.state.units.includes(u); },
    strength(u) { return 0.3 + (0.7 * u.steps) / this.type(u).steps; },
    isRoad(a, b) { return this.map.roadEdges.has(a.key < b.key ? a.key + '|' + b.key : b.key + '|' + a.key); },
    classCost(cls, from, to) { return this.isRoad(from, to) ? 0.5 : this.terr(to).cost[cls]; },
    moveCost(u, from, to) { return this.classCost(this.type(u).move, from, to); },

    enemyAdjacent(side, q, r, known) {
      for (const n of Hex.neighbors(q, r)) {
        const e = this.unitAt(n.q, n.r);
        if (e && e.side !== side && (!known || known.has(e.id))) return true;
      }
      return false;
    },

    hqNear(side, q, r, self) {
      return this.state.units.some((h) => h.side === side && h.type === 'hq' && h !== self &&
        Hex.distance(h.q, h.r, q, r) <= UNIT_TYPES.hq.command);
    },

    income() {
      const inc = { blue: 0, red: 0 };
      for (const c of this.map.cities) if (c.city.owner) inc[c.city.owner] += c.city.vp;
      return inc;
    },

    // ---------- vision / fog of war
    visionRange(u) {
      const t = this.tile(u.q, u.r);
      return this.type(u).vision + (TERRAIN[t.terrain].high ? 1 : 0);
    },

    visibleTiles(side) {
      const set = new Set();
      const add = (q, r, n) => {
        for (const h of Hex.within(q, r, n)) {
          const k = Hex.key(h.q, h.r);
          if (this.map.tiles.has(k)) set.add(k);
        }
      };
      for (const u of this.unitsOf(side)) add(u.q, u.r, this.visionRange(u));
      for (const c of this.map.cities) if (c.city.owner === side) add(c.q, c.r, 1);
      return set;
    },

    // Enemy units currently spotted by `side`. Forests and towns hide units at longer range.
    visibleEnemies(side) {
      const set = new Set();
      const own = this.unitsOf(side);
      const towns = this.map.cities.filter((c) => c.city.owner === side);
      for (const e of this.state.units) {
        if (e.side === side) continue;
        if (!this.state.fog) { set.add(e.id); continue; }
        const conceal = TERRAIN[this.tile(e.q, e.r).terrain].conceal ? 1 : 0;
        let seen = towns.some((c) => Hex.distance(c.q, c.r, e.q, e.r) <= 1);
        for (let i = 0; !seen && i < own.length; i++) {
          const u = own[i];
          if (Hex.distance(u.q, u.r, e.q, e.r) <= Math.max(1, this.visionRange(u) - conceal)) seen = true;
        }
        if (seen) set.add(e.id);
      }
      return set;
    },

    // ---------- movement
    // Dijkstra over movement points. Entering a (known) enemy zone of control ends movement.
    // A unit that has not moved yet may always move one hex, whatever the cost.
    reachable(u, known) {
      if (known === undefined) known = this.visibleEnemies(u.side);
      const start = this.tile(u.q, u.r);
      const res = new Map([[start.key, { cost: 0, prev: null, stop: false, zoc: false }]]);
      if (u.mpLeft <= 0) return res;
      const fresh = !u.moved;
      const pq = new WG.PQ();
      pq.push(start.key, 0);
      while (pq.size) {
        const { item: k, pri: c } = pq.pop();
        const cur = res.get(k);
        if (c > cur.cost || cur.stop) continue;
        const t = this.map.tiles.get(k);
        for (const n of Hex.neighbors(t.q, t.r)) {
          const nt = this.tile(n.q, n.r);
          if (!nt) continue;
          const occ = this.unitAt(nt.q, nt.r, u);
          if (occ && occ.side !== u.side && (!known || known.has(occ.id))) continue;
          const step = this.moveCost(u, t, nt);
          if (!isFinite(step)) continue;
          let nc = c + step;
          if (nc > u.mpLeft + 1e-9) {
            if (fresh && k === start.key) nc = u.mpLeft;
            else continue;
          }
          const old = res.get(nt.key);
          if (old && old.cost <= nc) continue;
          const zoc = this.enemyAdjacent(u.side, nt.q, nt.r, known);
          res.set(nt.key, { cost: nc, prev: k, stop: zoc || nc >= u.mpLeft - 1e-9, zoc });
          pq.push(nt.key, nc);
        }
      }
      return res;
    },

    destinations(u, reach, known) {
      const out = [];
      const startKey = Hex.key(u.q, u.r);
      for (const k of reach.keys()) {
        if (k === startKey) continue;
        const p = Hex.parse(k);
        const occ = this.unitAt(p.q, p.r, u);
        if (occ && (occ.side === u.side || !known || known.has(occ.id))) continue;
        out.push(k);
      }
      return out;
    },

    pathTo(reach, key) {
      const path = [];
      let k = key;
      while (k && reach.has(k) && reach.get(k).prev !== null) {
        path.push(k);
        k = reach.get(k).prev;
      }
      return path.reverse();
    },

    // Moves a unit hex by hex. Stops early on contact with previously unseen enemies.
    // onStep(u, fromTile, toTile) is awaited after each step (used for animation).
    async executeMove(u, destKey, onStep) {
      const known = this.visibleEnemies(u.side);
      const reach = this.reachable(u, known);
      if (!reach.has(destKey) || destKey === Hex.key(u.q, u.r)) return null;
      const path = this.pathTo(reach, destKey);
      const snap = this.snapshot(u);
      const trail = [this.tile(u.q, u.r)];
      let contact = false;
      for (const k of path) {
        const to = this.map.tiles.get(k);
        const from = this.tile(u.q, u.r);
        const occ = this.unitAt(to.q, to.r, u);
        if (occ && occ.side !== u.side) { contact = true; break; }
        const cost = this.moveCost(u, from, to);
        u.q = to.q; u.r = to.r;
        u.mpLeft = Math.max(0, u.mpLeft - cost);
        u.moved = true;
        u.entrenched = false;
        trail.push(to);
        if (onStep) await onStep(u, from, to);
        if (!this.alive(u)) return null; // game was replaced mid-move
        for (const id of this.visibleEnemies(u.side)) {
          if (!known.has(id)) { contact = true; known.add(id); }
        }
        if (this.enemyAdjacent(u.side, to.q, to.r, null)) u.mpLeft = 0;
        if (contact || u.mpLeft <= 0) break;
      }
      // Never end stacked on a friendly unit we were passing through.
      while (trail.length > 1 && this.unitAt(u.q, u.r, u)) {
        const from = trail.pop();
        const to = trail[trail.length - 1];
        u.q = to.q; u.r = to.r;
        if (onStep) await onStep(u, from, to);
        if (!this.alive(u)) return null;
      }
      this.captureCity(u);
      const halted = Hex.key(u.q, u.r) !== destKey;
      this.undo = contact ? null : snap;
      if (contact && halted) this.addLog(u.side, `${u.name}: contact! Movement halted.`);
      return { contact, halted };
    },

    captureCity(u) {
      const t = this.tile(u.q, u.r);
      if (t.city && t.city.owner !== u.side) {
        t.city.owner = u.side;
        this.addLog(u.side, `${u.name} captures ${t.city.name}${t.city.capital ? ' (capital)' : ''}`);
      }
    },

    snapshot(u) {
      return {
        id: u.id, q: u.q, r: u.r, mpLeft: u.mpLeft, moved: u.moved, entrenched: u.entrenched,
        owners: this.map.cities.map((c) => c.city.owner), logLen: this.state.log.length,
      };
    },

    applyUndo() {
      const s = this.undo;
      this.undo = null;
      if (!s) return null;
      const u = this.state.units.find((x) => x.id === s.id);
      if (!u || this.unitAt(s.q, s.r, u)) return null;
      Object.assign(u, { q: s.q, r: s.r, mpLeft: s.mpLeft, moved: s.moved, entrenched: s.entrenched });
      this.map.cities.forEach((c, i) => { c.city.owner = s.owners[i]; });
      this.state.log.length = s.logLen;
      return u;
    },

    // ---------- combat
    canAttack(u) {
      const ut = this.type(u);
      return !u.attacked && !(ut.indirect && u.moved);
    },

    targets(u, known, from = u) {
      const ut = this.type(u);
      return this.state.units.filter((e) => {
        if (e.side === u.side || (known && !known.has(e.id))) return false;
        const d = Hex.distance(from.q, from.r, e.q, e.r);
        return d >= 1 && d <= ut.range;
      });
    },

    // Odds for `att` attacking `def`, optionally as if the attacker stood at `from`.
    combatOdds(att, def, from = att) {
      const at = this.type(att), dt = this.type(def);
      const aTile = this.tile(from.q, from.r), dTile = this.tile(def.q, def.r);
      const dist = Hex.distance(from.q, from.r, def.q, def.r);
      const ranged = !!at.indirect && dist > 1;
      const mods = [];
      let A = at.atk * this.strength(att);
      let D = dt.def * this.strength(def);
      const terr = this.terr(dTile);
      if (terr.def !== 1) { D *= terr.def; mods.push({ text: `${terr.name}: defense ×${terr.def}`, good: terr.def < 1 }); }
      if (def.entrenched) { D *= 1.3; mods.push({ text: 'Defender dug in ×1.3', good: false }); }
      if (at.armored && terr.rough && !ranged) { A *= 0.7; mods.push({ text: 'Armor in close terrain ×0.7', good: false }); }
      if (at.antiArmor && dt.armored) { A *= 1.5; mods.push({ text: 'Anti-armor vs armored ×1.5', good: true }); }
      if (dt.antiArmor && at.armored && !ranged) { D *= 1.5; mods.push({ text: 'Assaulting anti-armor ×1.5', good: false }); }
      if (!ranged && aTile.terrain === 'river' && !aTile.road) { A *= 0.6; mods.push({ text: 'Attacking out of river ×0.6', good: false }); }
      if (!ranged) {
        let n = 0;
        for (const nb of Hex.neighbors(def.q, def.r)) {
          const f = this.unitAt(nb.q, nb.r, att);
          if (f && f.side === att.side && !this.type(f).indirect && f.type !== 'hq') n++;
        }
        n = Math.min(n, 3);
        if (n) { A *= 1 + 0.15 * n; mods.push({ text: `Flanking support +${15 * n}%`, good: true }); }
      }
      if (this.hqNear(att.side, from.q, from.r, att)) { A *= 1.2; mods.push({ text: 'Attacker in command +20%', good: true }); }
      if (this.hqNear(def.side, def.q, def.r, def)) { D *= 1.2; mods.push({ text: 'Defender in command +20%', good: false }); }
      const ratio = A / D;
      return {
        A, D, ratio, ranged, mods,
        expDef: Math.min(3, ratio * 0.81 * (ranged ? 0.8 : 1)),
        expAtt: ranged ? 0 : Math.min(2, 0.585 / ratio),
      };
    },

    resolveCombat(att, def) {
      const o = this.combatOdds(att, def);
      const at = this.type(att);
      const defFrom = this.tile(def.q, def.r);
      const res = {
        att, def, odds: o, defFrom, attFrom: this.tile(att.q, att.r),
        defLoss: Math.min(3, sround(o.ratio * (0.4 + Math.random()) * 0.9 * (o.ranged ? 0.8 : 1))),
        attLoss: o.ranged ? 0 : Math.min(2, sround(((0.2 + Math.random() * 0.9) * 0.9) / o.ratio)),
        retreat: null, advance: null, cutOff: false, defKilled: false, attKilled: false,
      };
      def.steps -= res.defLoss;
      att.steps -= res.attLoss;
      att.attacked = true;
      att.mpLeft = 0;
      this.undo = null;

      if (def.steps > 0 && !o.ranged && res.defLoss >= 1 && res.defLoss > res.attLoss &&
          Math.random() < Math.min(0.9, 0.2 + 0.25 * o.ratio)) {
        const to = this.retreatHex(def, att);
        if (to) {
          res.retreat = { from: defFrom, to };
          def.q = to.q; def.r = to.r;
          def.entrenched = false;
        } else {
          def.steps -= 1;
          res.defLoss += 1;
          res.cutOff = true;
        }
      }
      res.defKilled = def.steps <= 0;
      res.attKilled = att.steps <= 0;
      if (res.defKilled || res.attKilled) this.state.units = this.state.units.filter((u) => u.steps > 0);

      if (!o.ranged && !res.attKilled && (res.defKilled || res.retreat) && !at.indirect && att.type !== 'hq' &&
          !this.unitAt(defFrom.q, defFrom.r) && isFinite(this.terr(defFrom).cost[at.move])) {
        res.advance = { from: res.attFrom, to: defFrom };
        att.q = defFrom.q; att.r = defFrom.r;
        att.moved = true;
        att.entrenched = false;
      }

      const r = o.ratio >= 1 ? `${o.ratio.toFixed(1)}:1` : `1:${(1 / o.ratio).toFixed(1)}`;
      let txt = `${att.name} ${o.ranged ? 'shells' : 'attacks'} ${def.name} (${r}): `;
      txt += res.defKilled ? `${def.name} destroyed` : `enemy −${res.defLoss}`;
      if (!o.ranged) txt += res.attKilled ? `, ${att.name} destroyed` : `, own −${res.attLoss}`;
      if (res.retreat) txt += '. Defender retreats';
      if (res.cutOff) txt += '. Defender cut off, extra loss';
      if (res.advance) txt += '. Attacker advances';
      this.addLog(att.side, txt);
      if (res.advance) this.captureCity(att);
      this.checkVictory();
      return res;
    },

    retreatHex(def, att) {
      let best = null, bestScore = -Infinity;
      for (const n of Hex.neighbors(def.q, def.r)) {
        const t = this.tile(n.q, n.r);
        if (!t || this.unitAt(t.q, t.r)) continue;
        if (!isFinite(this.terr(t).cost[this.type(def).move])) continue;
        if (this.enemyAdjacent(def.side, t.q, t.r, null)) continue;
        const s = Hex.distance(t.q, t.r, att.q, att.r) * 2 + this.terr(t).def;
        if (s > bestScore) { bestScore = s; best = t; }
      }
      return best;
    },

    checkVictory() {
      const s = this.state;
      const b = this.unitsOf('blue').length, r = this.unitsOf('red').length;
      if (!b || !r) {
        s.over = true;
        s.winner = !b && !r ? 'draw' : !b ? 'red' : 'blue';
        s.reason = 'annihilation';
      }
    },

    // ---------- turns
    startTurn() {
      for (const u of this.unitsOf(this.state.side)) {
        u.mpLeft = this.type(u).mp;
        u.moved = false;
        u.attacked = false;
      }
      this.undo = null;
    },

    endTurn() {
      const s = this.state;
      for (const u of this.unitsOf(s.side)) if (!u.moved) u.entrenched = true;
      this.undo = null;
      if (s.side === 'red') {
        const inc = this.income();
        s.vp.blue += inc.blue;
        s.vp.red += inc.red;
        this.addLog(null, `End of turn ${s.turn}: Blue +${inc.blue} VP, Red +${inc.red} VP`);
        if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
        if (s.turn >= s.maxTurns) {
          s.over = true;
          s.winner = s.vp.blue > s.vp.red ? 'blue' : s.vp.red > s.vp.blue ? 'red' : 'draw';
          s.reason = 'time';
          return;
        }
        s.turn++;
      }
      s.side = other(s.side);
      this.startTurn();
    },

    addLog(side, text) {
      this.state.log.push({ t: this.state.turn, side, text });
    },

    // ---------- persistence (map is regenerated from its seed)
    save() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, state: this.state, owners: this.map.cities.map((c) => c.city.owner) }));
      } catch (e) { /* storage unavailable */ }
    },
    hasSave() {
      try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    },
    load() {
      try {
        const d = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (!d || d.v !== 1) return false;
        const s = d.state;
        this.map = WG.generateMap({ seed: s.seed, cols: s.cols, rows: s.rows });
        this.map.cities.forEach((c, i) => { c.city.owner = d.owners[i]; });
        this.state = s;
        this.undo = null;
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  WG.Game = Game;
})(window.WG);
