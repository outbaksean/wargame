'use strict';

// Air power, missile stockpiles and air bases.
// Squadrons live off the hex map at bases (on-map airbases, off-map base boxes, carriers) and fly one
// mission per turn into an air zone. Missions last until their side's next turn.
(function (WG) {
  const { Hex, AIR_TYPES, TERRAIN } = WG;
  const other = (s) => (s === 'blue' ? 'red' : 'blue');
  const TANKER_COST = { close: 0, medium: 1, far: 2 };
  const rnd = () => 0.5 + Math.random();

  const Air = {
    get G() { return WG.Game; },

    active() { return !!(this.G && this.G.state && this.G.state.air); },
    st() { return this.G.state.air; },
    sround(x) { return this.G.sround(x); },

    // ---------- lifecycle hooks
    init(G) {
      G.state.air = G.scenario.air ? {
        squadrons: [], bases: {}, missiles: { blue: {}, red: {} }, tankerUsed: { blue: 0, red: 0 },
        sorties: {}, nextId: 1, lostSq: { blue: 0, red: 0 },
      } : null;
    },

    startTurn(G, side) {
      if (!this.active()) return;
      const s = this.st();
      for (const q of s.squadrons) {
        if (q.side !== side) continue;
        // Aircraft from distant bases need a turn to recover after a sortie.
        const def = this.baseDef(q.base);
        q.resting = !!(q.flew && q.mission && def && def.tier === 'far');
        q.mission = null;
        q.flew = false;
      }
      s.tankerUsed[side] = 0;
      s.sorties = {};
      for (const id in s.bases) {
        const b = s.bases[id];
        b.sat = 0;
        if (this.baseDef(id) && this.owner(id) === side && b.runway > 0) b.runway -= 1;
      }
      for (const k in s.missiles[side]) s.missiles[side][k].used = 0;
      this.cleanup();
    },

    unitsRemoved(dead) {
      if (!this.active()) return;
      for (const u of dead) {
        if (u.type !== 'cv') continue;
        for (const q of this.st().squadrons) {
          if (q.base === 'cv:' + u.id && q.steps > 0) {
            q.steps = 0;
            this.G.addLog(q.side, `${q.name} is lost with ${u.name}`);
          }
        }
      }
      this.cleanup();
    },

    // A land unit entering an airbase hex takes it; squadrons caught on the ground are lost.
    onCapture(u, t) {
      if (!this.active() || !t.airbase) return;
      const b = this.status(t.airbase);
      if (b.owner === u.side) return;
      b.owner = u.side;
      b.runway = Math.max(b.runway, 1);
      for (const q of this.st().squadrons) {
        if (q.base === t.airbase && q.side !== u.side && q.steps > 0) {
          q.steps = 0;
          this.G.addLog(q.side, `${q.name} is destroyed on the ground as ${this.baseDef(t.airbase).name} falls`);
        }
      }
      this.G.addLog(u.side, `${u.name} seizes ${this.baseDef(t.airbase).name}`);
      this.cleanup();
    },

    cleanup() {
      const s = this.st();
      const dead = s.squadrons.filter((q) => q.steps <= 0);
      if (!dead.length) return;
      for (const q of dead) s.lostSq[q.side] = (s.lostSq[q.side] || 0) + 1;
      s.squadrons = s.squadrons.filter((q) => q.steps > 0);
      this.G.touch();
    },

    // ---------- setup helpers (called by scenarios)
    addSquadron(spec) {
      const at = AIR_TYPES[spec.type];
      const q = {
        id: this.st().nextId++, side: spec.side, faction: spec.faction || spec.side, type: spec.type,
        name: spec.name || at.short, base: spec.base, steps: spec.steps || at.steps, mission: null, flew: false,
        country: spec.country,
      };
      this.st().squadrons.push(q);
      return q;
    },
    setMissiles(side, stocks) {
      for (const id in stocks) this.st().missiles[side][id] = { left: stocks[id].stock, used: 0 };
    },
    missileDef(side, id) { return this.G.scenario.air.missiles[side][id]; },

    // ---------- bases
    baseDef(id) {
      const G = this.G;
      if (id.startsWith('cv:')) {
        const ship = G.byId(+id.slice(3));
        if (!ship) return null;
        return { id, name: ship.name, side: ship.side, kind: 'carrier', tier: 'close', shelters: 0, ad: 0, bmd: 0, ship };
      }
      const off = (G.scenario.air.bases || []).find((b) => b.id === id);
      if (off) return Object.assign({ kind: 'offmap' }, off);
      const hex = G.map.bases && G.map.bases[id];
      if (hex) return Object.assign({ shelters: 1, ad: 2, bmd: 0 }, (G.scenario.air.hexBaseInfo || {})[id] || {}, hex);
      return null;
    },
    allBases() {
      const G = this.G;
      const ids = new Set([...(G.scenario.air.bases || []).map((b) => b.id), ...Object.keys(G.map.bases || {})]);
      for (const u of G.state.units) if (u.type === 'cv') ids.add('cv:' + u.id);
      return [...ids].map((id) => this.baseDef(id)).filter(Boolean);
    },
    status(id) {
      const s = this.st();
      if (!s.bases[id]) { const d = this.baseDef(id); s.bases[id] = { runway: 0, owner: d ? d.side : null, sat: 0 }; }
      return s.bases[id];
    },
    owner(id) { return id.startsWith('cv:') ? (this.baseDef(id) || {}).side : this.status(id).owner; },
    baseTile(def) {
      if (def.kind === 'hex') return this.G.map.tiles.get(def.key);
      if (def.kind === 'carrier') return this.G.tile(def.ship.q, def.ship.r);
      return null;
    },
    accessOk(def, side) {
      const sc = this.G.scenario.air;
      return !sc.accessOk || sc.accessOk(this.G, def, side);
    },
    baseOpen(id, side) {
      const def = this.baseDef(id);
      if (!def || this.owner(id) !== side) return false;
      if (this.status(id).sunk || (def.arrives && this.G.state.turn < def.arrives)) return false;
      if (!this.accessOk(def, side)) return false;
      return (this.status(id).runway || 0) < 2;
    },
    baseState(id) {
      const def = this.baseDef(id);
      if (!def) return 'gone';
      if (this.status(id).sunk) return 'sunk';
      if (def.arrives && this.G.state.turn < def.arrives) return 'en route';
      const r = this.status(id).runway || 0;
      if (!this.accessOk(def, def.side)) return 'restricted';
      return r >= 2 ? 'closed' : r === 1 ? 'damaged' : 'open';
    },

    // ---------- squadrons
    squadronsOf(side) { return this.active() ? this.st().squadrons.filter((q) => q.side === side) : []; },
    strength(q) { return 0.3 + (0.7 * q.steps) / AIR_TYPES[q.type].steps; },
    factionActive(q) {
      const sc = this.G.scenario;
      return !sc.factionActive || sc.factionActive(this.G, q.faction);
    },
    tankerPool(side) {
      let n = 0;
      for (const q of this.squadronsOf(side)) {
        const at = AIR_TYPES[q.type];
        if (at.tanker && this.baseOpen(q.base, side) && this.factionActive(q)) n += Math.round(at.tanker * this.strength(q));
      }
      return n;
    },
    tankerCost(q) {
      const at = AIR_TYPES[q.type];
      const def = this.baseDef(q.base);
      if (!def) return Infinity;
      if (at.longRange) return def.tier === 'far' ? 1 : 0;
      if (def.organicTankers) return 0;
      return TANKER_COST[def.tier] || 0;
    },
    // Why a squadron cannot fly right now, or '' if it can.
    whyGrounded(q) {
      const at = AIR_TYPES[q.type];
      if (at.tanker) return 'Supports other sorties';
      if (!this.factionActive(q)) return 'Not at war';
      if (q.flew) return q.mission ? '' : 'Already flew';
      if (q.resting) return 'Recovering (long-range sortie)';
      const def = this.baseDef(q.base);
      if (!def) return 'No base';
      if (this.status(q.base).sunk) return 'Carrier sunk';
      if (def.arrives && this.G.state.turn < def.arrives) return 'Arrives turn ' + def.arrives;
      if (!this.accessOk(def, q.side)) return 'Basing access denied';
      const r = this.status(q.base).runway || 0;
      if (r >= 2) return 'Runway closed';
      if (at.drone && def.tier !== 'close' && WG.Space && !WG.Space.satcomOk(q.side)) return 'No SATCOM link for remote drone control';
      if (r === 1 && (this.st().sorties[q.base] || 0) >= 1) return 'Runway damaged (1 sortie/turn)';
      const cost = this.tankerCost(q);
      if (cost > this.tankerPool(q.side) - this.st().tankerUsed[q.side]) return `Needs ${cost} tanker support`;
      return '';
    },
    canFly(q) { return q.steps > 0 && !q.flew && !this.whyGrounded(q); },
    launch(q) {
      q.flew = true;
      this.st().tankerUsed[q.side] += this.tankerCost(q);
      this.st().sorties[q.base] = (this.st().sorties[q.base] || 0) + 1;
      this.G.touch();
    },

    // ---------- zones
    zoneOf(t) { return t && t.zone; },
    zoneName(z) { return this.G.map.zones && this.G.map.zones[z] ? this.G.map.zones[z].name : z; },
    zoneAdj(z) {
      const G = this.G;
      if (!G.map._zoneAdj) {
        const adj = {};
        for (const t of G.map.list) {
          for (const n of Hex.neighbors(t.q, t.r)) {
            const nt = G.map.tiles.get(Hex.key(n.q, n.r));
            if (nt && nt.zone !== t.zone) {
              (adj[t.zone] = adj[t.zone] || new Set()).add(nt.zone);
            }
          }
        }
        G.map._zoneAdj = adj;
      }
      return G.map._zoneAdj[z] || new Set();
    },
    missionsIn(side, zone, kind) {
      return this.squadronsOf(side).filter((q) => q.mission && q.mission.kind === kind &&
        (q.mission.zone === zone || (kind === 'aew' && this.zoneAdj(q.mission.zone).has(zone))));
    },
    jammed(jammerSide, zone) { return this.active() && this.missionsIn(jammerSide, zone, 'jam').length > 0; },
    a2a(side, zone) {
      let p = 0;
      for (const q of this.missionsIn(side, zone, 'cap')) p += AIR_TYPES[q.type].a2a * this.strength(q);
      if (p && this.missionsIn(side, zone, 'aew').length) p *= 1.25;
      if (p && this.jammed(other(side), zone)) p *= 0.85;
      return p;
    },
    control(zone) {
      const b = this.a2a('blue', zone), r = this.a2a('red', zone);
      let owner = null;
      if (b > 0 && r > 0) owner = b >= r * 1.5 ? 'blue' : r >= b * 1.5 ? 'red' : 'contested';
      else if (b > 0) owner = 'blue';
      else if (r > 0) owner = 'red';
      return { blue: b, red: r, owner };
    },
    coverage(side, zone) {
      return {
        isr: this.missionsIn(side, zone, 'isr').length > 0,
        aew: this.missionsIn(side, zone, 'aew').length > 0,
      };
    },

    // Damage applied to a list of squadrons, stealthy ones shrug off half the hits.
    hurt(list, hits, why) {
      const out = [];
      for (let i = 0; i < hits && list.some((q) => q.steps > 0); i++) {
        const alive = list.filter((q) => q.steps > 0);
        const q = alive[Math.floor(Math.random() * alive.length)];
        if (AIR_TYPES[q.type].stealth && Math.random() < 0.5) continue;
        q.steps -= 1;
        out.push(q);
      }
      if (out.length && why) {
        const names = [...new Set(out.map((q) => q.name))];
        this.G.addLog(out[0].side, `${why}: ${names.join(', ')} −${out.length}${out.some((q) => q.steps <= 0) ? ' (squadron lost)' : ''}`);
      }
      return out.length;
    },

    dogfight(zone, arriving) {
      const A = this.missionsIn(arriving, zone, 'cap'), D = this.missionsIn(other(arriving), zone, 'cap');
      if (!A.length || !D.length) return;
      const aP = this.a2a(arriving, zone), dP = this.a2a(other(arriving), zone);
      this.G.addLog(arriving, `Air battle over ${this.zoneName(zone)}`);
      const toD = this.sround((aP / (aP + dP)) * 1.3 * rnd());
      const toA = this.sround((dP / (aP + dP)) * 1.3 * rnd());
      this.hurt(D, toD, 'Air-to-air losses');
      this.hurt(A, toA, 'Air-to-air losses');
      this.cleanup();
    },

    // Enemy fighters over the zone engage an incoming aircraft; returns true if it survives.
    intercept(q, zone) {
      const enemy = other(q.side);
      const D = this.missionsIn(enemy, zone, 'cap');
      if (!D.length) return true;
      const dP = this.a2a(enemy, zone);
      const aP = AIR_TYPES[q.type].a2a * this.strength(q);
      const toQ = this.sround((dP / (dP + aP + 3)) * 1.2 * rnd());
      const toD = this.sround((aP / (dP + aP + 3)) * 0.8 * rnd());
      this.hurt([q], toQ, `Intercepted over ${this.zoneName(zone)}`);
      this.hurt(D, toD, 'Losses to escorts');
      this.cleanup();
      return q.steps > 0;
    },

    // ---------- missions
    flyCap(q, zone) {
      this.launch(q);
      q.mission = { kind: 'cap', zone };
      this.G.addLog(q.side, `${q.name} flies combat air patrol over ${this.zoneName(zone)}`);
      this.dogfight(zone, q.side);
      this.G.touch();
    },

    flySupport(q, zone, kind) {
      this.launch(q);
      q.mission = { kind, zone };
      const verb = { isr: 'surveils', aew: 'provides early warning over', jam: 'jams enemy sensors over', asw: 'hunts submarines in' }[kind];
      this.G.addLog(q.side, `${q.name} ${verb} ${this.zoneName(zone)}`);
      const enemy = other(q.side);
      // Slow support aircraft are easy prey for enemy fighters and SAMs.
      if (this.missionsIn(enemy, zone, 'cap').length) {
        const dP = this.a2a(enemy, zone);
        const hits = this.sround((kind === 'aew' ? 0.25 : 0.5) * Math.min(2, dP / 6) * rnd());
        this.hurt([q], hits, `${q.name} attacked by enemy fighters`);
      }
      if (kind === 'isr') {
        const sams = this.G.state.units.filter((u) => u.side === enemy && !u.carrier && u.emitting && this.G.type(u).ad &&
          this.G.tile(u.q, u.r).zone === zone);
        if (sams.length && Math.random() < 0.35) this.hurt([q], 1, `${q.name} shot down by SAMs`);
      }
      if (kind === 'asw' && q.steps > 0) this.aswPatrol(q, zone);
      this.cleanup();
      this.G.touch();
    },

    aswPatrol(q, zone) {
      const G = this.G;
      const at = AIR_TYPES[q.type];
      for (const e of G.state.units) {
        if (e.side === q.side || e.carrier || G.type(e).domain !== 'sub') continue;
        const t = G.tile(e.q, e.r);
        if (t.zone !== zone) continue;
        const deep = TERRAIN[t.terrain].deep;
        if (Math.random() > (deep ? 0.35 : 0.6)) continue;
        G.reveal(e, q.side, 1);
        const hits = Math.min(2, this.sround(at.asw * this.strength(q) * 0.2 * rnd() * (deep ? 0.7 : 1)));
        e.steps -= hits;
        G.addLog(q.side, `${q.name} finds ${e.name}${hits ? `: hits (−${hits})${e.steps <= 0 ? ', sunk' : ''}` : ', attack misses'}`);
      }
      G.removeDead();
    },

    // Valid strike targets for a squadron: detected enemy units and enemy airbases on the map.
    canStrikeUnit(q, e, known) {
      const at = AIR_TYPES[q.type];
      if (!at.strike || e.carrier) return false;
      const lvl = known.get(e.id) || 0;
      if (!lvl) return false;
      if (at.standoff && this.G.type(e).domain === 'sea' && lvl < 2) return false;
      if (this.G.type(e).domain === 'sub') return false;
      return true;
    },

    strikeOdds(q, e) {
      const G = this.G;
      const at = AIR_TYPES[q.type];
      const zone = G.tile(e.q, e.r).zone;
      const enemy = other(q.side);
      let P = at.strike * this.strength(q);
      const et = G.type(e);
      if (et.emitter && e.emitting) P *= 1.3; // anti-radiation weapons home on the radar
      const capP = at.standoff ? 0 : this.a2a(enemy, zone);
      const surviveFrac = capP ? Math.max(0.3, 1 - capP / (capP + at.a2a * this.strength(q) + 3) * 0.5) : 1;
      const s = G.strikeResult(P * surviveFrac, e, { adMult: at.standoff ? 1 : 0.6, lethality: 0.3 });
      const D = G.adCover(e.side, e.q, e.r, false);
      return { P, capP, D, exp: Math.min(3, s.exp), intercept: s.intercept, risk: (capP ? 0.6 : 0) + (at.standoff ? 0 : D * 0.05) };
    },

    strikeUnit(q, e) {
      const G = this.G;
      const at = AIR_TYPES[q.type];
      const zone = G.tile(e.q, e.r).zone;
      this.launch(q);
      q.mission = { kind: 'strike', zone, target: e.id };
      if (!at.standoff && !this.intercept(q, zone)) return { aborted: true };
      // Standoff bombers can still be caught on the way in if the defenders have early warning over the zone.
      if (at.standoff && this.missionsIn(e.side, zone, 'aew').length && this.missionsIn(e.side, zone, 'cap').length && Math.random() < 0.5) {
        if (!this.intercept(q, zone)) return { aborted: true };
      }
      if (!at.standoff) {
        const D = G.adCover(e.side, e.q, e.r, false);
        const hits = this.sround(D * 0.05 * rnd() * (at.stealth ? 0.4 : 1));
        this.hurt([q], hits, `${q.name} hit by air defenses`);
        this.cleanup();
        if (q.steps <= 0) return { aborted: true };
      }
      if (G.scenario.onHostile) G.scenario.onHostile(G, q.side, e);
      let P = at.strike * this.strength(q);
      if (G.type(e).emitter && e.emitting) P *= 1.3;
      const s = G.strikeResult(P, e, { adMult: at.standoff ? 1 : 0.6, lethality: 0.3 });
      const loss = Math.min(3, this.sround(s.exp * rnd()));
      e.steps -= loss;
      const k = Hex.key(e.q, e.r);
      G.state.saturation[k] = (G.state.saturation[k] || 0) + 1;
      const dom = G.type(e).domain;
      G.addLog(q.side, `${q.name} ${at.standoff ? 'launches standoff missiles at' : 'strikes'} ${e.name}: ${e.steps <= 0 ? (dom === 'land' ? 'destroyed' : 'sunk') : loss ? `hits (−${loss})` : 'no effect'}`);
      this.onStrikeHook(q.side, G.tile(e.q, e.r), null);
      G.removeDead();
      G.checkVictory();
      return { loss, killed: e.steps <= 0 };
    },

    // Strike a base with weapons of power P. Returns a short description.
    hitBase(side, baseId, P, ballistic) {
      const G = this.G;
      const def = this.baseDef(baseId);
      const st = this.status(baseId);
      let D = (ballistic ? def.bmd : def.ad) || 0;
      const t = this.baseTile(def);
      if (t) D += G.adCover(def.side, t.q, t.r, ballistic);
      D /= 1 + 0.25 * (st.sat || 0);
      st.sat = (st.sat || 0) + 1;
      const I = D > 0 ? Math.min(0.85, D / (D + P)) : 0;
      const eff = P * (1 - I);
      const cr = this.sround(eff * (def.carrier ? 0.1 : 0.14) * rnd());
      st.runway = Math.min(3, (st.runway || 0) + cr);
      if (def.carrier && st.runway >= 3 && !st.sunk) {
        st.sunk = true;
        for (const q of this.st().squadrons) if (q.base === baseId && q.steps > 0) q.steps = 0;
        this.cleanup();
        this.G.addLog(def.side, def.name + ' is sunk. Its air wing is lost.');
        if (this.G.scenario.onBaseLost) this.G.scenario.onBaseLost(this.G, def);
        return 'carrier sunk';
      }
      const ground = this.st().squadrons.filter((q) => q.base === baseId && !q.mission && q.steps > 0);
      const exposed = ground.slice(def.shelters || 0);
      let hitSq = 0;
      for (const q of exposed) {
        if (Math.random() < Math.min(0.7, eff * 0.08)) { q.steps -= 1 + (Math.random() < eff * 0.04 ? 1 : 0); hitSq++; }
      }
      this.cleanup();
      this.onStrikeHook(side, t, def);
      G.touch();
      const parts = [];
      if (I > 0) parts.push(`${Math.round(I * 100)}% intercepted`);
      parts.push(cr ? `runway damaged (${['open', 'damaged', 'closed', 'wrecked'][st.runway]})` : 'runway intact');
      if (hitSq) parts.push(`${hitSq} squadron${hitSq > 1 ? 's' : ''} hit on the ground`);
      return parts.join(', ');
    },

    strikeBaseWithAircraft(q, baseId) {
      const G = this.G;
      const def = this.baseDef(baseId);
      const at = AIR_TYPES[q.type];
      this.launch(q);
      const t = this.baseTile(def);
      const zone = t ? t.zone : null;
      q.mission = { kind: 'strike', zone, base: baseId };
      if (zone && !at.standoff && !this.intercept(q, zone)) return;
      const txt = this.hitBase(q.side, baseId, at.strike * this.strength(q) * 1.2, false);
      G.addLog(q.side, `${q.name} strikes ${def.name}: ${txt}`);
    },

    // Hook for the escalation system (strikes on sensitive territory).
    onStrikeHook(side, tile, baseDef) {
      const sc = this.G.scenario;
      if (sc.onStrike) sc.onStrike(this.G, side, tile, baseDef);
    },

    // ---------- missiles
    missileOptions(side) {
      if (!this.active()) return [];
      const s = this.st().missiles[side];
      return Object.keys(s).map((id) => {
        const d = this.missileDef(side, id);
        return { id, def: d, left: s[id].left, used: s[id].used, canFire: s[id].left > 0 && this.launchesLeft(side, id) > 0 && (!d.needs || d.needs(this.G)) };
      });
    },
    launchesLeft(side, id) {
      const s = this.st().missiles[side][id];
      return Math.min(s.left, this.missileDef(side, id).perTurn - s.used);
    },
    // Missiles hit ships (anti-ship types), and ground units that are high-value and slow to relocate:
    // headquarters, air defense, artillery/rocket/missile batteries and EW. Not dispersed manoeuvre brigades.
    missileCanHitUnit(side, id, e, known) {
      const d = this.missileDef(side, id);
      if (!d.reach.includes('map') || e.carrier) return false;
      const et = this.G.type(e);
      if (et.domain === 'sub') return false;
      if (et.domain === 'sea' && !d.antiShip) return false;
      if (et.domain === 'land' && !(et.indirect || et.sea || et.ad || et.jam || e.type === 'hq')) return false;
      return (known.get(e.id) || 0) >= 2;
    },
    // Carriers at sea can only be engaged while our satellites, drones or AEW aircraft track their zone.
    carrierTracked(side, def) {
      if (WG.Space && WG.Space.active() && WG.Space.st(side).passes.includes(def.zone)) return true;
      const cov = this.coverage(side, def.zone);
      return cov.isr || cov.aew;
    },
    missileCanHitBase(side, id, def) {
      const d = this.missileDef(side, id);
      if (!def || this.owner(def.id) === side || def.kind === 'carrier') return false;
      if (this.status(def.id).sunk || (def.arrives && this.G.state.turn < def.arrives)) return false;
      if (def.carrier) return !!d.antiShip && d.reach.includes(def.tier) && this.carrierTracked(side, def);
      if (def.kind === 'hex') return d.reach.includes('map');
      return d.reach.includes(def.tier);
    },
    missileOdds(side, id, e) {
      const d = this.missileDef(side, id);
      const s = this.G.strikeResult(d.power, e, { ballistic: !!d.ballistic, lethality: 0.3 });
      return { exp: Math.min(3, s.exp), intercept: s.intercept };
    },
    consume(side, id) {
      const s = this.st().missiles[side][id];
      s.left -= 1;
      s.used += 1;
    },
    fireAtUnit(side, id, e) {
      const G = this.G;
      const d = this.missileDef(side, id);
      this.consume(side, id);
      if (G.scenario.onHostile) G.scenario.onHostile(G, side, e);
      const s = G.strikeResult(d.power, e, { ballistic: !!d.ballistic, lethality: 0.3 });
      const loss = Math.min(3, this.sround(s.exp * rnd()));
      e.steps -= loss;
      const k = Hex.key(e.q, e.r);
      G.state.saturation[k] = (G.state.saturation[k] || 0) + 1;
      G.addLog(side, `${d.name} salvo at ${e.name}: ${s.intercept > 0.05 ? `${Math.round(s.intercept * 100)}% intercepted, ` : ''}${e.steps <= 0 ? (G.type(e).domain === 'land' ? 'destroyed' : 'sunk') : loss ? `hits (−${loss})` : 'no effect'}`);
      this.onStrikeHook(side, G.tile(e.q, e.r), null);
      G.removeDead();
      G.checkVictory();
      G.touch();
      return { loss };
    },
    fireAtBase(side, id, baseId) {
      const d = this.missileDef(side, id);
      this.consume(side, id);
      const txt = this.hitBase(side, baseId, d.power, !!d.ballistic);
      this.G.addLog(side, `${d.name} salvo at ${this.baseDef(baseId).name}: ${txt}`);
    },

    // ---------- airborne assault
    airAssaultOptions(u) {
      const G = this.G;
      const ut = G.type(u);
      if (!ut.airAssault || u.moved || u.attacked || u.carrier) return [];
      // Paratroopers board at a friendly, open airbase on or next to their hex.
      const base = WG.Hex.within(u.q, u.r, 1).map((h) => G.tile(h.q, h.r))
        .find((x) => x && x.airbase && this.owner(x.airbase) === u.side && this.baseOpen(x.airbase, u.side));
      if (!base) return [];
      const known = G.intel(u.side);
      const out = [];
      for (const h of Hex.within(u.q, u.r, ut.airAssault)) {
        const x = G.tile(h.q, h.r);
        if (!x || G.isSea(x) || x.home === u.side || !isFinite(G.terr(x).cost[ut.move])) continue;
        const occ = G.unitAt(x.q, x.r, null, 'land');
        if (occ && (occ.side === u.side || known.has(occ.id))) continue; // hidden defenders are a nasty surprise
        out.push(x.key);
      }
      return out;
    },
    airAssaultRisk(u, key) {
      const G = this.G;
      const t = G.map.tiles.get(key);
      const enemy = other(u.side);
      const D = G.adCover(enemy, t.q, t.r, false);
      const cap = this.a2a(enemy, t.zone);
      const own = this.a2a(u.side, t.zone);
      return { D, cap, own, exp: Math.min(u.steps, (D * 0.07 + Math.max(0, cap - own) * 0.08) * 1) };
    },
    doAirAssault(u, key) {
      const G = this.G;
      const t = G.map.tiles.get(key);
      const r = this.airAssaultRisk(u, key);
      const loss = Math.min(u.steps, this.sround(r.exp * rnd()));
      const base = G.tile(u.q, u.r);
      u.steps -= loss;
      if (u.steps <= 0) {
        G.addLog(u.side, `${u.name}'s air assault is shot down en route to ${G.placeName(t).replace(/^(at|near|on) /, '')}`);
        G.removeDead();
        return { lost: true, from: base, to: t };
      }
      let dz = t;
      const hidden = G.unitAt(t.q, t.r, null, 'land');
      if (hidden && hidden.side !== u.side) {
        // Dropped onto an unseen enemy position: heavy losses and scattered into a neighbouring hex.
        G.reveal(hidden, u.side);
        u.steps -= 1 + (Math.random() < 0.5 ? 1 : 0);
        const alt = Hex.neighbors(t.q, t.r).map((n) => G.tile(n.q, n.r))
          .find((x) => x && !G.isSea(x) && !G.unitAt(x.q, x.r, null, 'land') && isFinite(G.terr(x).cost[G.type(u).move]));
        if (u.steps <= 0 || !alt) {
          u.steps = 0;
          G.addLog(u.side, `${u.name} drops straight onto ${hidden.name} and is destroyed`);
          G.removeDead();
          return { lost: true, from: base, to: t };
        }
        G.addLog(u.side, `${u.name} drops onto ${hidden.name} and is scattered with heavy losses`);
        dz = alt;
      }
      G.placeUnit(u, dz);
      u.mpLeft = 0;
      u.moved = true;
      u.attacked = true;
      u.entrenched = false;
      G.state.beachheads[dz.key] = u.side;
      G.addLog(u.side, `${u.name} air-assaults ${G.placeName(dz)}${loss ? ` (−${loss} in transit)` : ''}`);
      G.captureCity(u);
      G.undo = null;
      G.touch();
      return { loss, from: base, to: dz };
    },

    // ---------- engine hooks
    intelLevel(side, e) {
      if (!this.active()) return 0;
      const G = this.G;
      const et = G.type(e);
      const t = G.tile(e.q, e.r);
      const cov = this.coverage(side, t.zone);
      const jam = this.jammed(e.side, t.zone);
      let lvl = 0;
      if (et.domain === 'sea' && (cov.isr || cov.aew)) lvl = jam ? 1 : 2;
      if (et.domain === 'land' && cov.isr) lvl = TERRAIN[t.terrain].conceal || jam ? 1 : 2;
      return lvl;
    },
    jamFactor(jammerSide, q, r) {
      if (!this.active()) return 1;
      const t = this.G.tile(q, r);
      return t && this.jammed(jammerSide, t.zone) ? 0.7 : 1;
    },
    combatMods(att, def, from, ranged, mods) {
      if (!this.active()) return null;
      const t = this.G.tile(def.q, def.r);
      const c = this.control(t.zone);
      if (c.owner === att.side) { mods.push({ text: 'Air superiority +20%', good: true }); return { A: 1.2 }; }
      if (c.owner === def.side) { mods.push({ text: 'Defender has air cover +10%', good: false }); return { D: 1.1 }; }
      return null;
    },
    visibleTiles(side, set) {
      if (!this.active()) return;
      for (const q of this.squadronsOf(side)) {
        if (!q.mission || !['isr', 'aew'].includes(q.mission.kind)) continue;
        const z = this.G.map.zones[q.mission.zone];
        if (z) for (const k of z.keys) if (q.mission.kind === 'isr' || this.G.isSea(this.G.map.tiles.get(k))) set.add(k);
      }
    },
  };

  WG.Air = Air;
  WG.Game.modules.push(Air);

  // Captures of airbase hexes: extend the engine's city capture.
  const capture = WG.Game.captureCity;
  WG.Game.captureCity = function (u) {
    capture.call(this, u);
    Air.onCapture(u, this.tile(u.q, u.r));
  };
})(window.WG);
