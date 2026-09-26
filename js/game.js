'use strict';

(function (WG) {
  const { Hex, TERRAIN, UNIT_TYPES } = WG;
  const BRIDGE = { name: 'Bridge', cost: { foot: 1, tracked: 1, wheeled: 1, naval: Infinity }, def: 0.8 };
  const SAVE_KEY = 'hexcommand.save.v2';
  const other = (s) => (s === 'blue' ? 'red' : 'blue');
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  // Round randomly so that e.g. 1.3 becomes 1 (70%) or 2 (30%).
  const sround = (x) => Math.floor(x) + (Math.random() < x - Math.floor(x) ? 1 : 0);
  const fmtRatio = (r) => (r >= 1 ? `${r.toFixed(1)}:1` : `1:${(1 / r).toFixed(1)}`);

  const Game = {
    map: null,
    state: null,
    scenario: null,
    undo: null,
    ver: 0,
    modules: [], // optional subsystems (air, space...) with hook functions
    other,
    cap,
    sround,

    // ---------- lifecycle
    newGame(opts) {
      const sc = WG.SCENARIOS[opts.scenario];
      this.scenario = sc;
      const mapOpts = sc.mapOptions ? sc.mapOptions(opts) : {};
      this.map = this.prepareMap(sc.buildMap(mapOpts));
      this.state = {
        scenario: sc.id, mapOpts, options: opts.options || {}, controllers: opts.controllers, fog: opts.fog,
        maxTurns: opts.maxTurns || sc.maxTurns, turn: 1, side: sc.firstSide || 'blue', vp: { blue: 0, red: 0 },
        units: [], nextId: 1, log: [], over: false, winner: null, reason: null,
        mines: {}, minesKnown: { blue: {}, red: {} }, beachheads: {}, saturation: {}, revealed: {},
        lost: { blue: 0, red: 0 },
      };
      this.undo = null;
      this.touch();
      for (const m of this.modules) if (m.init) m.init(this, opts);
      sc.setup(this, opts);
      this.addLog(null, sc.intro ? sc.intro(this) : `Operation begins: ${this.state.maxTurns} turns.`);
      this.computeSupply('blue');
      this.computeSupply('red');
      this.startTurn();
    },

    touch() { this.ver++; },

    // Label connected landmasses so planners can tell islands apart.
    prepareMap(map) {
      let id = 0;
      for (const t of map.list) {
        if (t.island !== undefined || TERRAIN[t.terrain].sea) continue;
        id++;
        const stack = [t];
        t.island = id;
        while (stack.length) {
          const c = stack.pop();
          for (const n of Hex.neighbors(c.q, c.r)) {
            const nt = map.tiles.get(Hex.key(n.q, n.r));
            if (nt && nt.island === undefined && !TERRAIN[nt.terrain].sea && nt.mass === c.mass) { nt.island = id; stack.push(nt); }
          }
        }
      }
      return map;
    },

    faction(u) { return this.scenario.factions[u.faction] || { name: cap(u.side), side: u.side }; },
    controller(faction) { return this.state.controllers[faction] || 'ai'; },
    factionActive(faction) { return !this.scenario.factionActive || this.scenario.factionActive(this, faction); },
    factionsOf(side) { return Object.keys(this.scenario.factions).filter((f) => this.scenario.factions[f].side === side); },
    humanFactions(side) { return this.factionsOf(side).filter((f) => this.controller(f) === 'human'); },
    isHuman(u) { return this.controller(u.faction) === 'human'; },

    addUnit(spec) {
      const ut = UNIT_TYPES[spec.type];
      const u = {
        id: this.state.nextId++, side: spec.side, faction: spec.faction || spec.side, type: spec.type,
        name: spec.name || ut.short, q: spec.q, r: spec.r, steps: spec.steps || ut.steps,
        mpLeft: 0, moved: false, attacked: false, entrenched: !!spec.entrenched, carrier: null,
        supplied: true, oos: 0,
      };
      if (ut.capacity) u.cargo = [];
      if (ut.sea && ut.sea.ammo) u.ammo = ut.sea.ammo;
      if (ut.emitter) u.emitting = true;
      if (spec.echelon) u.echelon = spec.echelon;
      if (spec.country) u.country = spec.country;
      this.state.units.push(u);
      this.touch();
      return u;
    },

    embark(u, ship) {
      u.carrier = ship.id;
      ship.cargo.push(u.id);
      u.q = ship.q; u.r = ship.r;
      u.entrenched = false;
      this.touch();
    },

    // ---------- queries
    type(u) { return UNIT_TYPES[u.type]; },
    layer(u) { return UNIT_TYPES[u.type].domain === 'land' ? 'land' : 'sea'; },
    tile(q, r) { return this.map.tiles.get(Hex.key(q, r)); },
    terr(t) { return t.terrain === 'river' && t.road ? BRIDGE : TERRAIN[t.terrain]; },
    isSea(t) { return !!TERRAIN[t.terrain].sea; },
    byId(id) { return this.state.units.find((u) => u.id === id) || null; },
    alive(u) { return this.state.units.includes(u); },
    unitsOf(side) { return this.state.units.filter((u) => u.side === side && !u.carrier); },
    allUnitsOf(side) { return this.state.units.filter((u) => u.side === side); },
    strength(u) { return 0.3 + (0.7 * u.steps) / this.type(u).steps; },

    index() {
      if (this._idx && this._idxVer === this.ver) return this._idx;
      const idx = new Map();
      for (const u of this.state.units) {
        if (u.carrier) continue;
        const k = Hex.key(u.q, u.r);
        let e = idx.get(k);
        if (!e) idx.set(k, (e = { land: [], sea: [] }));
        e[this.layer(u)].push(u);
      }
      this._idx = idx;
      this._idxVer = this.ver;
      return idx;
    },

    // First unit at (q, r) in the given layer ('land' | 'sea'; any if omitted), ignoring `exclude`.
    unitAt(q, r, exclude, layer) {
      const e = this.index().get(Hex.key(q, r));
      if (!e) return null;
      for (const l of layer ? [layer] : ['land', 'sea']) {
        for (const u of e[l]) if (u !== exclude) return u;
      }
      return null;
    },

    isRoad(a, b) { return this.map.roadEdges.has(a.key < b.key ? a.key + '|' + b.key : b.key + '|' + a.key); },

    classCost(cls, from, to, side) {
      if (cls === 'naval') {
        if (TERRAIN[to.terrain].sea) return 1;
        if (to.city && to.city.port && (!side || to.city.owner === side)) return 1;
        return Infinity;
      }
      if (TERRAIN[to.terrain].sea) return Infinity;
      if (this.isRoad(from, to)) return 0.5;
      if (from.mass !== to.mass) return Infinity; // separate landmasses (no bridge)
      return this.terr(to).cost[cls];
    },
    moveCost(u, from, to) { return this.classCost(this.type(u).move, from, to, u.side); },

    // Does an enemy unit that exerts a zone of control on `layer` sit next to (q, r)?
    // Land units control land; surface combatants control the sea. Submarines are ignored.
    // Land hexes on different landmasses with no bridge between them.
    acrossWater(a, b) { return a.mass !== b.mass && !this.isRoad(a, b); },

    enemyAdjacent(side, q, r, known, layer = 'land') {
      const here = this.tile(q, r);
      for (const n of Hex.neighbors(q, r)) {
        const e = this.unitAt(n.q, n.r, null, layer);
        if (!e || e.side === side || (known && !known.has(e.id))) continue;
        if (layer === 'land' && this.acrossWater(here, this.tile(n.q, n.r))) continue;
        const et = this.type(e);
        if (layer === 'land' && et.domain === 'land') return true;
        if (layer === 'sea' && et.domain === 'sea' && et.sea && !et.expendable) return true;
      }
      return false;
    },

    // Enemy electronic warfare at (q, r): 1 = none, <1 = jammed.
    jamFactor(jammerSide, q, r) {
      let f = 1;
      for (const u of this.state.units) {
        if (u.side !== jammerSide || u.carrier || !u.emitting) continue;
        const j = this.type(u).jam;
        if (j && Hex.distance(u.q, u.r, q, r) <= j) { f = 0.7; break; }
      }
      for (const m of this.modules) if (m.jamFactor) f = Math.min(f, m.jamFactor(jammerSide, q, r));
      return f;
    },

    hqNear(side, q, r, self) {
      if (this.jamFactor(other(side), q, r) < 1) return false;
      let range = UNIT_TYPES.hq.command;
      for (const m of this.modules) if (m.commandRange) range = m.commandRange(side, range);
      return this.state.units.some((h) => h.side === side && h.type === 'hq' && h !== self && !h.carrier &&
        Hex.distance(h.q, h.r, q, r) <= range);
    },

    income() {
      if (this.scenario.income) return this.scenario.income(this);
      const inc = { blue: 0, red: 0 };
      for (const c of this.map.cities) if (c.city.owner && c.city.vp) inc[c.city.owner] += c.city.vp;
      return inc;
    },

    // ---------- intelligence: 0 unknown, 1 detected, 2 targetable
    visionRange(u) {
      const ut = this.type(u);
      const t = this.tile(u.q, u.r);
      let v = ut.vision + (ut.domain === 'land' && TERRAIN[t.terrain].high ? 1 : 0);
      if (this.jamFactor(other(u.side), u.q, u.r) < 1) v -= 1;
      return Math.max(1, v);
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
      for (const m of this.modules) if (m.visibleTiles) m.visibleTiles(side, set);
      return set;
    },

    // Map of enemy unit id -> intel level for `side`.
    intel(side) {
      const c = this._intel;
      if (c && c.ver === this.ver && c[side]) return c[side];
      if (!c || c.ver !== this.ver) this._intel = { ver: this.ver };
      const res = new Map();
      const own = this.unitsOf(side);
      const towns = this.map.cities.filter((t) => t.city.owner === side);
      const vr = new Map(own.map((u) => [u, this.visionRange(u)]));
      for (const e of this.state.units) {
        if (e.side === side || e.carrier) continue;
        let lvl = 0;
        if (!this.state.fog) {
          lvl = 2;
        } else {
          const et = this.type(e);
          if (et.domain === 'sub') {
            for (const u of own) {
              const ut = this.type(u);
              if (ut.domain === 'land') continue;
              const d = Hex.distance(u.q, u.r, e.q, e.r);
              if (d <= (ut.asw ? ut.asw.range : 0) || (d <= 1 && ut.domain === 'sub')) { lvl = 2; break; }
            }
            const rv = this.state.revealed[e.id];
            if (rv && rv[side] >= this.state.turn) lvl = 2;
          } else {
            const t = this.tile(e.q, e.r);
            const conceal = et.domain === 'land' && TERRAIN[t.terrain].conceal ? 1 : 0;
            if (towns.some((tc) => Hex.distance(tc.q, tc.r, e.q, e.r) <= 1)) lvl = 2;
            for (let i = 0; lvl < 2 && i < own.length; i++) {
              const u = own[i];
              if (this.type(u).domain === 'sub' && et.domain === 'land') continue;
              if (Hex.distance(u.q, u.r, e.q, e.r) <= Math.max(1, vr.get(u) - conceal)) lvl = 2;
            }
            if (lvl < 1 && et.emitter && e.emitting) lvl = 1;
          }
          for (const m of this.modules) if (lvl < 2 && m.intelLevel) lvl = Math.max(lvl, m.intelLevel(side, e));
          if (lvl < 2 && this.scenario.intelLevel) lvl = Math.max(lvl, this.scenario.intelLevel(this, side, e));
        }
        if (lvl) res.set(e.id, lvl);
      }
      this._intel[side] = res;
      return res;
    },
    visibleEnemies(side) { return this.intel(side); },

    reveal(e, side, turns = 1) {
      this.state.revealed[e.id] = this.state.revealed[e.id] || {};
      this.state.revealed[e.id][side] = this.state.turn + turns;
      this.touch();
    },

    // ---------- movement
    // Dijkstra over movement points. Entering a (known) enemy zone of control ends movement.
    // A unit that has not moved yet may always move one hex, whatever the cost.
    reachable(u, known) {
      if (known === undefined) known = this.intel(u.side);
      const start = this.tile(u.q, u.r);
      const res = new Map([[start.key, { cost: 0, prev: null, stop: false, zoc: false }]]);
      if (u.mpLeft <= 0 || u.carrier) return res;
      const layer = this.layer(u);
      const ut = this.type(u);
      const naval = ut.move === 'naval';
      const minesKnown = this.state.minesKnown[u.side];
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
          const occ = this.unitAt(nt.q, nt.r, u, layer);
          if (occ && occ.side !== u.side && (!known || known.has(occ.id))) continue;
          if (naval && !ut.sweep && minesKnown[nt.key] && this.state.mines[nt.key] === other(u.side)) continue;
          const step = this.moveCost(u, t, nt);
          if (!isFinite(step)) continue;
          let nc = c + step;
          if (nc > u.mpLeft + 1e-9) {
            if (fresh && k === start.key) nc = u.mpLeft;
            else continue;
          }
          const old = res.get(nt.key);
          if (old && old.cost <= nc) continue;
          const zoc = ut.domain !== 'sub' && this.enemyAdjacent(u.side, nt.q, nt.r, known, layer);
          res.set(nt.key, { cost: nc, prev: k, stop: zoc || nc >= u.mpLeft - 1e-9, zoc });
          pq.push(nt.key, nc);
        }
      }
      return res;
    },

    destinations(u, reach, known) {
      const out = [];
      const startKey = Hex.key(u.q, u.r);
      const layer = this.layer(u);
      for (const k of reach.keys()) {
        if (k === startKey) continue;
        const p = Hex.parse(k);
        const occ = this.unitAt(p.q, p.r, u, layer);
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

    placeUnit(u, t) {
      u.q = t.q; u.r = t.r;
      if (u.cargo) for (const id of u.cargo) { const c = this.byId(id); if (c) { c.q = t.q; c.r = t.r; } }
      this.touch();
    },

    // Moves a unit hex by hex. Stops early on contact with previously unseen enemies or mines.
    // onStep(u, fromTile, toTile) is awaited after each step (used for animation).
    async executeMove(u, destKey, onStep) {
      const known = new Map(this.intel(u.side));
      const reach = this.reachable(u, known);
      if (!reach.has(destKey) || destKey === Hex.key(u.q, u.r)) return null;
      const path = this.pathTo(reach, destKey);
      const snap = this.snapshot(u);
      const layer = this.layer(u);
      const ut = this.type(u);
      const trail = [this.tile(u.q, u.r)];
      let contact = false, mined = false;
      for (const k of path) {
        const to = this.map.tiles.get(k);
        const from = this.tile(u.q, u.r);
        const occ = this.unitAt(to.q, to.r, u, layer);
        if (occ && occ.side !== u.side) { contact = true; this.reveal(occ, u.side); break; }
        const cost = this.moveCost(u, from, to);
        this.placeUnit(u, to);
        u.mpLeft = Math.max(0, u.mpLeft - cost);
        u.moved = true;
        u.entrenched = false;
        trail.push(to);
        if (onStep) await onStep(u, from, to);
        if (!this.alive(u)) return null; // game was replaced or unit lost mid-move
        if (ut.move === 'naval' && this.state.mines[k] === other(u.side)) {
          mined = true;
          this.state.minesKnown[u.side][k] = true;
          if (!ut.sweep && Math.random() < 0.5) {
            u.steps -= 1;
            this.addLog(u.side, `${u.name} strikes a mine (−1)`);
          } else {
            this.addLog(u.side, `${u.name} detects a minefield`);
          }
          u.mpLeft = 0;
          this.removeDead();
          if (!this.alive(u)) return { contact: true, halted: true };
        }
        for (const id of this.intel(u.side).keys()) {
          if (!known.has(id)) { contact = true; known.set(id, 1); }
        }
        if (ut.domain !== 'sub' && this.enemyAdjacent(u.side, to.q, to.r, null, layer)) u.mpLeft = 0;
        if (contact || u.mpLeft <= 0) break;
      }
      // Never end stacked on a friendly unit we were passing through.
      while (trail.length > 1 && this.unitAt(u.q, u.r, u, layer)) {
        const from = trail.pop();
        const to = trail[trail.length - 1];
        this.placeUnit(u, to);
        if (onStep) await onStep(u, from, to);
        if (!this.alive(u)) return null;
      }
      if (layer === 'land') this.captureCity(u);
      const halted = Hex.key(u.q, u.r) !== destKey;
      this.undo = contact || mined ? null : snap;
      if (contact && halted) this.addLog(u.side, `${u.name}: contact! Movement halted.`);
      this.touch();
      return { contact, halted };
    },

    captureCity(u) {
      const t = this.tile(u.q, u.r);
      if (t.city && t.city.owner !== u.side) {
        t.city.owner = u.side;
        this.state.capturedAt = this.state.capturedAt || {};
        this.state.capturedAt[t.key] = this.state.turn;
        this.addLog(u.side, `${u.name} captures ${t.city.name}${t.city.capital ? ' (capital)' : ''}`);
        if (this.scenario.onCapture) this.scenario.onCapture(this, u, t);
        // Enemy ships caught in a captured port are lost.
        const ship = this.unitAt(t.q, t.r, null, 'sea');
        if (ship && ship.side !== u.side) {
          ship.steps = 0;
          this.addLog(u.side, `${ship.name} is lost in the fall of ${t.city.name}`);
          this.removeDead();
        }
      }
      const bh = this.state.beachheads[t.key];
      if (bh && bh !== u.side) delete this.state.beachheads[t.key];
      this.touch();
    },

    snapshot(u) {
      return {
        id: u.id, q: u.q, r: u.r, mpLeft: u.mpLeft, moved: u.moved, entrenched: u.entrenched,
        owners: this.map.cities.map((c) => c.city.owner), logLen: this.state.log.length,
        beachheads: Object.assign({}, this.state.beachheads),
      };
    },

    applyUndo() {
      const s = this.undo;
      this.undo = null;
      if (!s) return null;
      const u = this.byId(s.id);
      if (!u || this.unitAt(s.q, s.r, u, this.layer(u))) return null;
      this.placeUnit(u, this.tile(s.q, s.r));
      Object.assign(u, { mpLeft: s.mpLeft, moved: s.moved, entrenched: s.entrenched });
      this.map.cities.forEach((c, i) => { c.city.owner = s.owners[i]; });
      this.state.beachheads = s.beachheads;
      this.state.log.length = s.logLen;
      this.touch();
      return u;
    },

    // ---------- amphibious operations
    // Beaches, ports, home coast, and coast next to one of our beachheads (lodgments expand along the shore).
    isCoastalLanding(t, side) {
      if (t.beach || (t.city && t.city.port) || t.home === side || this.state.beachheads[t.key] === side) return true;
      return Hex.neighbors(t.q, t.r).some((n) => {
        const k = Hex.key(n.q, n.r);
        const nt = this.map.tiles.get(k);
        return this.state.beachheads[k] === side && nt && nt.mass === t.mass;
      });
    },

    embarkOptions(u) {
      const ut = this.type(u);
      if (ut.domain !== 'land' || u.carrier || u.attacked || u.mpLeft <= 0) return [];
      const out = [];
      for (const s of this.state.units) {
        if (s.side !== u.side || s.carrier || !s.cargo) continue;
        const st = this.type(s);
        if (s.cargo.length >= st.capacity) continue;
        const d = Hex.distance(u.q, u.r, s.q, s.r);
        if (d > 1) continue;
        out.push(s);
      }
      return out;
    },

    doEmbark(u, ship) {
      this.embark(u, ship);
      u.mpLeft = 0;
      u.moved = true;
      this.undo = null;
      this.addLog(u.side, `${u.name} embarks on ${ship.name}`);
    },

    // Hexes the cargo unit can land on from `ship`. assault = an enemy unit holds the hex.
    landingOptions(ship, u, known) {
      if (!ship.cargo || !ship.cargo.includes(u.id) || u.moved || u.attacked || ship.carrier) return [];
      const st = this.type(ship), ut = this.type(u);
      const out = [];
      const here = this.tile(ship.q, ship.r);
      const cands = [here, ...Hex.neighbors(ship.q, ship.r).map((n) => this.tile(n.q, n.r))];
      for (const t of cands) {
        if (!t || this.isSea(t)) continue;
        if (!isFinite(this.terr(t).cost[ut.move]) && !t.road) continue;
        if (st.portOnly) {
          const port = t.city && t.city.port && t.city.owner === u.side;
          const barge = this.scenario.bargeTurn && this.state.turn >= this.scenario.bargeTurn &&
            t.home !== u.side && this.isCoastalLanding(t, u.side) && !t.beach;
          if (!port && !barge) continue;
        } else if (!this.isCoastalLanding(t, u.side)) continue;
        const occ = this.unitAt(t.q, t.r, null, 'land');
        if (occ && occ.side === u.side) continue;
        const seen = occ && (!known || known.has(occ.id));
        if (seen && (st.portOnly || !(t.beach || (t.city && t.city.port)))) continue;
        out.push({ key: t.key, assault: !!seen, def: seen ? occ : null });
      }
      return out;
    },

    // Unloads without a fight. Returns false if an unseen enemy holds the hex (becomes an assault).
    disembark(u, ship, t) {
      ship.cargo = ship.cargo.filter((id) => id !== u.id);
      u.carrier = null;
      this.placeUnit(u, t);
      u.mpLeft = 0;
      u.moved = true;
      u.attacked = true;
      this.undo = null;
      if (t.home !== u.side && !(t.city && t.city.owner === u.side) && this.state.beachheads[t.key] !== u.side && (t.beach || !t.city)) {
        this.state.beachheads[t.key] = u.side;
        this.addLog(u.side, `${u.name} lands ${this.placeName(t)} and establishes a beachhead`);
      } else {
        this.addLog(u.side, `${u.name} comes ashore`);
      }
      this.captureCity(u);
      this.touch();
    },

    // ---------- air defense and strikes (shared with air/missile modules)
    adCover(side, q, r, ballistic) {
      let D = 0;
      for (const u of this.state.units) {
        if (u.side !== side || u.carrier) continue;
        const ad = this.type(u).ad;
        if (!ad) continue;
        const on = !this.type(u).emitter || u.emitting;
        if (Hex.distance(u.q, u.r, q, r) > (on ? ad.range : 0)) continue;
        let v = (ballistic ? ad.bmd : ad.ad) * this.strength(u);
        if (!on) v *= 0.3;
        D += v * this.jamFactor(other(side), u.q, u.r);
      }
      for (const m of this.modules) if (m.adBonus) D += m.adBonus(side, q, r, ballistic);
      const sat = this.state.saturation[Hex.key(q, r)] || 0;
      return D / (1 + 0.25 * sat);
    },

    // Generic strike against a unit: power P, leak through air defense, damage vs hardness.
    strikeResult(P, def, { ballistic = false, noAD = false, adMult = 1, lethality = 0.3 } = {}) {
      const dt = this.type(def);
      const D = noAD ? 0 : this.adCover(def.side, def.q, def.r, ballistic) * adMult;
      const intercept = D > 0 ? Math.min(0.85, D / (D + P)) : 0;
      const eff = P * (1 - intercept);
      let hard = dt.def / 4;
      if (dt.domain === 'land') {
        // Dispersed, camouflaged ground units are poor targets for missiles and bombs.
        const terr = this.terr(this.tile(def.q, def.r));
        hard = Math.max(0.8, (dt.def / 5) * terr.def * (def.entrenched ? 1.3 : 1)) * 2;
      }
      const exp = (eff * lethality) / hard;
      return { D, intercept, eff, exp };
    },

    // ---------- combat
    canAttack(u) {
      const ut = this.type(u);
      if (u.attacked || u.carrier) return false;
      if (ut.domain === 'land' && (ut.indirect || ut.sea) && u.moved) return false;
      return ut.atk > 0 || !!ut.sea || !!ut.asw;
    },

    // How `att` (standing at `from`) can engage `def`, or null.
    attackMode(att, def, from = att) {
      const at = this.type(att), dt = this.type(def);
      const d = Hex.distance(from.q, from.r, def.q, def.r);
      if (d < 1 && dt.domain === 'land') return null;
      if (dt.domain === 'land') {
        if (d === 1 && at.domain === 'land' && !at.indirect && !att.carrier &&
            this.acrossWater(this.tile(from.q, from.r), this.tile(def.q, def.r))) return null;
        if (at.atk > 0 && d <= at.range && d >= 1) return 'land';
      } else if (dt.domain === 'sea') {
        if (at.sea && d <= at.sea.range && !(at.sea.ammo && !att.ammo)) return 'sea';
      } else if (dt.domain === 'sub') {
        if (at.asw && d <= at.asw.range) return 'asw';
      }
      return null;
    },

    targets(u, known, from = u) {
      return this.state.units.filter((e) => {
        if (e.side === u.side || e.carrier) return false;
        const lvl = known ? known.get(e.id) || 0 : 2;
        if (!lvl) return false;
        const mode = this.attackMode(u, e, from);
        if (!mode) return false;
        const d = Hex.distance(from.q, from.r, e.q, e.r);
        return lvl >= 2 || d <= 1;
      });
    },

    odds(att, def, from = att) {
      const mode = this.attackMode(att, def, from) || 'land';
      return mode === 'land' ? this.combatOdds(att, def, from) : this.strikeOdds(att, def, mode, from);
    },

    // Land combat: attack vs defense factors.
    combatOdds(att, def, from = att, opts = {}) {
      const at = this.type(att), dt = this.type(def);
      const aTile = this.tile(from.q, from.r), dTile = this.tile(def.q, def.r);
      const dist = Hex.distance(from.q, from.r, def.q, def.r);
      const ranged = (!!at.indirect && (dist > 1 || (!opts.landing && this.acrossWater(aTile, dTile)))) || at.domain !== 'land';
      const mods = [];
      let A = at.atk * this.strength(att);
      let D = dt.def * this.strength(def);
      const terr = this.terr(dTile);
      if (terr.def !== 1) { D *= terr.def; mods.push({ text: `${terr.name}: defense ×${terr.def}`, good: terr.def < 1 }); }
      if (def.entrenched) { D *= 1.3; mods.push({ text: 'Defender dug in ×1.3', good: false }); }
      if (at.armored && terr.rough && !ranged) { A *= 0.7; mods.push({ text: 'Armor in close terrain ×0.7', good: false }); }
      if (at.antiArmor && dt.armored) { A *= 1.5; mods.push({ text: 'Anti-armor vs armored ×1.5', good: true }); }
      if (dt.antiArmor && at.armored && !ranged) { D *= 1.5; mods.push({ text: 'Assaulting anti-armor ×1.5', good: false }); }
      if (!ranged && !opts.landing && aTile.terrain === 'river' && !aTile.road) { A *= 0.6; mods.push({ text: 'Attacking out of river ×0.6', good: false }); }
      if (opts.landing) {
        const m = at.amphib || 0.5;
        A *= m;
        mods.push({ text: `Amphibious assault ×${m}`, good: false });
      }
      if (!att.supplied && !opts.landing) { A *= 0.5; mods.push({ text: 'Attacker out of supply ×0.5', good: false }); }
      if (!def.supplied) { D *= 0.8; mods.push({ text: 'Defender out of supply ×0.8', good: true }); }
      if (at.drone) {
        const j = this.jamFactor(def.side, def.q, def.r);
        if (j < 1) { A *= 0.6; mods.push({ text: 'Drones jammed ×0.6', good: false }); }
      }
      if (!ranged) {
        let n = 0;
        for (const nb of Hex.neighbors(def.q, def.r)) {
          const f = this.unitAt(nb.q, nb.r, att, 'land');
          if (f && f.side === att.side && !this.type(f).indirect && this.type(f).atk >= 2 &&
              !this.acrossWater(this.tile(f.q, f.r), dTile)) n++;
        }
        n = Math.min(n, 3);
        if (n) { A *= 1 + 0.15 * n; mods.push({ text: `Flanking support +${15 * n}%`, good: true }); }
      }
      if (at.domain === 'land' && this.hqNear(att.side, from.q, from.r, att)) { A *= 1.2; mods.push({ text: 'Attacker in command +20%', good: true }); }
      if (this.hqNear(def.side, def.q, def.r, def)) { D *= 1.2; mods.push({ text: 'Defender in command +20%', good: false }); }
      for (const m of this.modules) {
        if (!m.combatMods) continue;
        const r = m.combatMods(att, def, from, ranged, mods);
        if (r) { A *= r.A || 1; D *= r.D || 1; }
      }
      const ratio = A / D;
      return {
        mode: 'land', A, D, ratio, ranged, mods,
        expDef: Math.min(3, ratio * 0.81 * (ranged ? 0.8 : 1)),
        expAtt: ranged ? 0 : Math.min(2, 0.585 / ratio),
      };
    },

    // Anti-ship and anti-submarine fire.
    strikeOdds(att, def, mode, from = att) {
      const at = this.type(att), dt = this.type(def);
      const w = mode === 'asw' ? at.asw : at.sea;
      const mods = [];
      let P = w.atk * this.strength(att);
      const kind = mode === 'asw' ? 'asw' : w.kind;
      let adMult = 1, noAD = false;
      if (kind === 'torpedo' || kind === 'asw') noAD = true;
      if (kind === 'kamikaze') { adMult = 0.5; mods.push({ text: 'Only close-in defenses engage', good: true }); }
      if (kind === 'drone' || kind === 'kamikaze') {
        if (this.jamFactor(def.side, def.q, def.r) < 1) { P *= 0.6; mods.push({ text: 'Drones jammed ×0.6', good: false }); }
      }
      if (kind === 'asw' && TERRAIN[this.tile(def.q, def.r).terrain].deep) { P *= 0.7; mods.push({ text: 'Deep water ×0.7', good: false }); }
      if (kind === 'torpedo' && Hex.within(def.q, def.r, 1).some((h) => {
        const x = this.unitAt(h.q, h.r, null, 'sea');
        return x && x.side === def.side && this.type(x).asw;
      })) { P *= 0.6; mods.push({ text: 'Target screened by ASW escorts ×0.6', good: false }); }
      if (!att.supplied && at.domain === 'land') { P *= 0.5; mods.push({ text: 'Out of supply ×0.5', good: false }); }
      for (const m of this.modules) {
        if (!m.strikeMods) continue;
        const r = m.strikeMods(att, def, kind, mods);
        if (r) P *= r;
      }
      const s = this.strikeResult(P, def, { noAD, adMult, lethality: kind === 'torpedo' ? 0.3 : 0.25 });
      if (!noAD && s.D > 0) mods.push({ text: `Air defense intercepts ${Math.round(s.intercept * 100)}%`, good: false });
      return { mode, kind, P, ratio: s.eff / Math.max(0.5, dt.def), ranged: true, mods, expDef: Math.min(3, s.exp), expAtt: 0, strike: s };
    },

    resolveAttack(att, def) {
      if (this.scenario.onHostile) this.scenario.onHostile(this, att.side, def);
      const mode = this.attackMode(att, def);
      return mode === 'land' ? this.resolveCombat(att, def) : this.resolveStrike(att, def, mode);
    },

    resolveStrike(att, def, mode) {
      const o = this.strikeOdds(att, def, mode);
      const at = this.type(att);
      const loss = Math.min(3, sround(o.expDef * (0.5 + Math.random())));
      const res = { att, def, odds: o, defLoss: loss, attLoss: 0, attFrom: this.tile(att.q, att.r), defFrom: this.tile(def.q, def.r), ranged: true };
      def.steps -= loss;
      att.attacked = true;
      if (this.type(att).domain !== 'land') att.mpLeft = Math.min(att.mpLeft, 0);
      else att.mpLeft = 0;
      this.undo = null;
      this.state.saturation[Hex.key(def.q, def.r)] = (this.state.saturation[Hex.key(def.q, def.r)] || 0) + 1;
      if (at.expendable) { att.steps -= 1; res.expended = true; }
      if (mode === 'sea' && at.sea.ammo) att.ammo = Math.max(0, (att.ammo || 0) - 1);
      // Firing a torpedo gives the submarine's position away to the victim.
      if (at.domain === 'sub') this.reveal(att, def.side);
      // Warships with ASW gear hit back at an attacking submarine.
      const dtt = this.type(def);
      if (o.kind === 'torpedo' && def.steps > 0 && dtt.asw && Math.random() < 0.5) {
        const back = sround(dtt.asw.atk * this.strength(def) * 0.15 * (0.5 + Math.random()));
        if (back) { att.steps -= back; res.attLoss = back; }
      }
      res.defKilled = def.steps <= 0;
      res.attKilled = att.steps <= 0 && !at.expendable;
      const verb = { missile: 'fires missiles at', torpedo: 'torpedoes', drone: 'sends drones at', kamikaze: 'rams drone boats into', asw: 'hunts' }[o.kind] || 'attacks';
      let txt = `${att.name} ${verb} ${def.name}: `;
      txt += res.defKilled ? `${def.name} ${dtt.domain === 'land' ? 'destroyed' : 'sunk'}` : loss ? `hits (−${loss})` : 'no effect';
      if (res.attLoss) txt += `; counterattack −${res.attLoss}`;
      this.addLog(att.side, txt);
      this.removeDead();
      this.checkVictory();
      return res;
    },

    resolveCombat(att, def, opts = {}) {
      const from = opts.from || att;
      const o = this.combatOdds(att, def, from, opts);
      const at = this.type(att);
      const defFrom = this.tile(def.q, def.r);
      const res = {
        att, def, odds: o, defFrom, attFrom: this.tile(from.q, from.r),
        defLoss: Math.min(3, sround(o.ratio * (0.4 + Math.random()) * 0.9 * (o.ranged ? 0.8 : 1))),
        attLoss: o.ranged ? 0 : Math.min(2, sround(((0.2 + Math.random() * 0.9) * 0.9) / o.ratio)),
        retreat: null, advance: null, cutOff: false, defKilled: false, attKilled: false, ranged: o.ranged,
      };
      def.steps -= res.defLoss;
      att.steps -= res.attLoss;
      att.attacked = true;
      if (at.domain === 'land') att.mpLeft = 0;
      this.undo = null;
      if (at.expendable) { att.steps -= 1; res.expended = true; }

      if (def.steps > 0 && !o.ranged && res.defLoss >= 1 && res.defLoss > res.attLoss &&
          Math.random() < Math.min(0.9, 0.2 + 0.25 * o.ratio)) {
        const to = this.retreatHex(def, from);
        if (to) {
          res.retreat = { from: defFrom, to };
          this.placeUnit(def, to);
          def.entrenched = false;
        } else {
          def.steps -= 1;
          res.defLoss += 1;
          res.cutOff = true;
        }
      }
      res.defKilled = def.steps <= 0;
      res.attKilled = att.steps <= 0 && !at.expendable;
      this.removeDead();

      const canAdvance = !o.ranged && !res.attKilled && this.alive(att) && (res.defKilled || res.retreat) &&
        !at.indirect && att.type !== 'hq' && !this.unitAt(defFrom.q, defFrom.r, null, 'land') &&
        (isFinite(this.terr(defFrom).cost[at.move]) || defFrom.road);
      if (canAdvance) {
        if (opts.landing) {
          const ship = this.byId(att.carrier);
          this.disembark(att, ship, defFrom);
          res.advance = { from: res.attFrom, to: defFrom, landing: true };
        } else {
          res.advance = { from: res.attFrom, to: defFrom };
          this.placeUnit(att, defFrom);
          att.moved = true;
          att.entrenched = false;
        }
      }

      let txt = `${att.name} ${o.ranged ? 'shells' : opts.landing ? 'storms the beach' : 'attacks'} ${opts.landing ? this.placeName(defFrom) : def.name} (${fmtRatio(o.ratio)}): `;
      txt += res.defKilled ? `${def.name} destroyed` : `enemy −${res.defLoss}`;
      if (!o.ranged) txt += res.attKilled ? `, ${att.name} destroyed` : `, own −${res.attLoss}`;
      if (res.retreat) txt += '. Defender retreats';
      if (res.cutOff) txt += '. Defender cut off, extra loss';
      if (res.advance) txt += res.advance.landing ? '. Landing succeeds' : '. Attacker advances';
      else if (opts.landing && !res.attKilled) txt += '. Landing repulsed';
      this.addLog(att.side, txt);
      if (res.advance && !res.advance.landing) this.captureCity(att);
      this.checkVictory();
      this.touch();
      return res;
    },

    // Assault landing from a ship onto an enemy-held beach or port.
    resolveLanding(u, ship, def) {
      return this.resolveCombat(u, def, { landing: true, from: { q: ship.q, r: ship.r } });
    },

    retreatHex(def, from) {
      let best = null, bestScore = -Infinity;
      for (const n of Hex.neighbors(def.q, def.r)) {
        const t = this.tile(n.q, n.r);
        if (!t || this.unitAt(t.q, t.r, null, 'land')) continue;
        if (!isFinite(this.moveCost(def, this.tile(def.q, def.r), t))) continue;
        if (this.enemyAdjacent(def.side, t.q, t.r, null, 'land')) continue;
        const s = Hex.distance(t.q, t.r, from.q, from.r) * 2 + this.terr(t).def;
        if (s > bestScore) { bestScore = s; best = t; }
      }
      return best;
    },

    removeDead() {
      const dead = this.state.units.filter((u) => u.steps <= 0);
      if (!dead.length) return;
      for (const u of dead) {
        if (!this.type(u).expendable) this.state.lost[u.side] = (this.state.lost[u.side] || 0) + 1;
        if (u.cargo && u.cargo.length) {
          for (const id of u.cargo) {
            const c = this.byId(id);
            if (c) { c.steps = 0; this.state.lost[c.side]++; this.addLog(c.side, `${c.name} goes down with ${u.name}`); }
          }
        }
        if (u.carrier) {
          const ship = this.byId(u.carrier);
          if (ship) ship.cargo = ship.cargo.filter((id) => id !== u.id);
        }
      }
      this.state.units = this.state.units.filter((u) => u.steps > 0);
      for (const m of this.modules) if (m.unitsRemoved) m.unitsRemoved(dead);
      if (this.scenario.onUnitsLost) this.scenario.onUnitsLost(this, dead);
      this.touch();
    },

    checkVictory() {
      const s = this.state;
      if (s.over) return;
      if (this.scenario.checkVictory && this.scenario.checkVictory(this, 'instant')) return;
      const b = this.allUnitsOf('blue').length, r = this.allUnitsOf('red').length;
      if (!b || !r) {
        s.over = true;
        s.winner = !b && !r ? 'draw' : !b ? 'red' : 'blue';
        s.reason = 'annihilation';
      }
    },

    // ---------- supply
    defaultSupplySources(side) {
      return this.map.cities.filter((c) => c.city.owner === side).map((c) => ({ key: c.key, cap: Infinity }));
    },

    supplyBfs(side, key, range) {
      const dist = new Map([[key, 0]]);
      const queue = [key];
      while (queue.length) {
        const k = queue.shift();
        const d = dist.get(k);
        if (d >= range) continue;
        const t = this.map.tiles.get(k);
        // Supply cannot be traced onward out of an enemy zone of control unless friendly troops hold it.
        if (d > 0 && this.enemyAdjacent(side, t.q, t.r, null, 'land') && !this.unitAt(t.q, t.r, null, 'land')) continue;
        for (const n of Hex.neighbors(t.q, t.r)) {
          const nt = this.tile(n.q, n.r);
          if (!nt || dist.has(nt.key) || this.isSea(nt) || nt.terrain === 'water') continue;
          if (nt.mass !== t.mass && !this.isRoad(t, nt)) continue;
          const occ = this.unitAt(nt.q, nt.r, null, 'land');
          if (occ && occ.side !== side) continue;
          dist.set(nt.key, d + 1);
          queue.push(nt.key);
        }
      }
      return dist;
    },

    computeSupply(side) {
      const sc = this.scenario;
      const sources = sc.supplySources ? sc.supplySources(this, side) : this.defaultSupplySources(side);
      const range = sc.supplyRange || 8;
      const units = this.unitsOf(side).filter((u) => this.type(u).domain === 'land');
      for (const u of units) u.supplied = false;
      const limited = [];
      for (const s of sources) {
        const dist = this.supplyBfs(side, s.key, range);
        if (!isFinite(s.cap)) {
          for (const u of units) if (dist.has(Hex.key(u.q, u.r))) u.supplied = true;
        } else {
          limited.push({ s, dist });
        }
      }
      for (const { s, dist } of limited) {
        let capLeft = s.cap;
        const cands = units.filter((u) => !u.supplied && dist.has(Hex.key(u.q, u.r)))
          .sort((a, b) => dist.get(Hex.key(a.q, a.r)) - dist.get(Hex.key(b.q, b.r)));
        for (const u of cands) {
          if (capLeft <= 0) break;
          u.supplied = true;
          capLeft--;
        }
      }
      for (const u of this.allUnitsOf(side)) if (u.carrier || this.type(u).domain !== 'land') u.supplied = true;
      this.touch();
    },

    // ---------- turns
    startTurn() {
      const side = this.state.side;
      this.state.saturation = {};
      for (const u of this.allUnitsOf(side)) {
        const ut = this.type(u);
        u.mpLeft = ut.mp;
        u.moved = false;
        u.attacked = false;
        if (ut.sea && ut.sea.ammo && !u.carrier) {
          const t = this.tile(u.q, u.r);
          if (t.city && t.city.port && t.city.owner === side && ut.domain !== 'land') u.ammo = ut.sea.ammo;
          else if (ut.domain === 'land' && u.supplied && this.state.turn % 2 === 0) u.ammo = Math.min(ut.sea.ammo, (u.ammo || 0) + 1);
        }
      }
      this.undo = null;
      if (this.scenario.onTurnStart) this.scenario.onTurnStart(this, side);
      for (const m of this.modules) if (m.startTurn) m.startTurn(this, side);
      this.computeSupply(side);
      this.computeSupply(other(side));
      this.touch();
    },

    endTurn() {
      const s = this.state;
      const side = s.side;
      for (const u of this.unitsOf(side)) {
        const ut = this.type(u);
        if (ut.domain === 'land' && !u.moved && u.supplied) u.entrenched = true;
        if (ut.sweep && !u.moved) this.sweepMines(u);
      }
      this.computeSupply(side);
      for (const u of this.unitsOf(side)) {
        if (this.type(u).domain !== 'land') continue;
        if (u.supplied) { u.oos = 0; continue; }
        u.oos++;
        if (u.oos >= 3) {
          u.steps -= 1;
          this.addLog(side, `${u.name} suffers attrition, out of supply (−1)`);
        }
      }
      this.removeDead();
      for (const m of this.modules) if (m.endTurn) m.endTurn(this, side);
      if (this.scenario.onTurnEnd) this.scenario.onTurnEnd(this, side);
      this.undo = null;
      this.checkVictory();
      if (s.over) return;
      const first = this.scenario.firstSide || 'blue';
      if (side !== first) {
        const inc = this.income();
        s.vp.blue += inc.blue;
        s.vp.red += inc.red;
        this.addLog(null, `End of turn ${s.turn}: ${this.sideName('blue')} +${inc.blue} VP, ${this.sideName('red')} +${inc.red} VP`);
        if (s.log.length > 500) s.log.splice(0, s.log.length - 500);
        if (s.turn >= s.maxTurns) {
          if (!(this.scenario.checkVictory && this.scenario.checkVictory(this, 'end'))) {
            s.over = true;
            s.winner = s.vp.blue > s.vp.red ? 'blue' : s.vp.red > s.vp.blue ? 'red' : 'draw';
            s.reason = 'time';
          }
          return;
        }
        s.turn++;
      }
      s.side = other(side);
      this.startTurn();
    },

    sweepMines(u) {
      let n = 0;
      for (const h of Hex.within(u.q, u.r, 1)) {
        const k = Hex.key(h.q, h.r);
        if (this.state.mines[k] && this.state.mines[k] !== u.side) { delete this.state.mines[k]; n++; }
      }
      if (n) this.addLog(u.side, `${u.name} clears ${n} minefield${n > 1 ? 's' : ''}`);
    },

    // "at Tainan" / "near Tainan" / region name for log messages.
    placeName(t) {
      if (t.city) return 'at ' + t.city.name;
      let best = null;
      for (const c of this.map.cities) {
        const d = Hex.distance(c.q, c.r, t.q, t.r);
        if (d <= 4 && (!best || d < best.d)) best = { d, c };
      }
      return best ? 'near ' + best.c.city.name : t.region ? 'on ' + t.region : 'on the coast';
    },

    sideName(side) {
      const sc = this.scenario;
      return (sc && sc.sides && sc.sides[side] && sc.sides[side].name) || cap(side);
    },

    addLog(side, text) {
      this.state.log.push({ t: this.state.turn, side, text });
    },

    // ---------- persistence (maps are rebuilt from scenario + options)
    save() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, state: this.state, owners: this.map.cities.map((c) => c.city.owner) }));
      } catch (e) { /* storage unavailable */ }
    },
    hasSave() {
      try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    },
    load() {
      try {
        const d = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (!d || d.v !== 2) return false;
        const s = d.state;
        const sc = WG.SCENARIOS[s.scenario];
        if (!sc) return false;
        this.scenario = sc;
        this.map = this.prepareMap(sc.buildMap(s.mapOpts));
        this.map.cities.forEach((c, i) => { c.city.owner = d.owners[i]; });
        this.state = s;
        this.undo = null;
        this.touch();
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  WG.Game = Game;
})(window.WG);
