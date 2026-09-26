'use strict';

// Air and missile planner for the AI.
(function (WG) {
  const { Hex, AIR_TYPES, UNIT_TYPES } = WG;
  const G = () => WG.Game;
  const A = () => WG.Air;
  const other = (s) => (s === 'blue' ? 'red' : 'blue');

  const AirAI = {
    unitValue(e, side) {
      const et = UNIT_TYPES[e.type];
      let v = et.value;
      const sc = G().scenario;
      if (side && sc.aiTargetBonus) v *= sc.aiTargetBonus(G(), side, e);
      if (e.cargo && e.cargo.length) v *= 2.2;
      if (et.emitter && e.emitting) v *= 1.4;
      if (et.sea && et.domain === 'land') v *= 1.4; // coastal missile batteries
      if (et.ad) v *= 1.3;
      return v;
    },

    zonePriorities(side) {
      const g = G();
      const known = g.intel(side);
      const w = {};
      const add = (z, v) => { if (z) w[z] = (w[z] || 0) + v; };
      for (const u of g.state.units) {
        if (u.carrier) continue;
        const z = g.tile(u.q, u.r).zone;
        if (u.side === side) add(z, this.unitValue(u) * 0.4);
        else if (known.has(u.id)) add(z, this.unitValue(u) * 0.7);
      }
      for (const k in g.state.beachheads) add(g.map.tiles.get(k).zone, 3);
      const sc = g.scenario;
      if (sc.aiZoneBonus) for (const z in g.map.zones) add(z, sc.aiZoneBonus(g, side, z) || 0);
      return Object.keys(w).sort((a, b) => w[b] - w[a]).map((z) => ({ z, w: w[z] }));
    },

    mine(plan) {
      return A().squadronsOf(plan.side).filter((q) => plan.factions.includes(q.faction) && q.steps > 0);
    },

    // Counterspace: blind enemy satellites periodically; the PRC may use a kinetic ASAT if it has chosen escalation.
    spaceAI(plan) {
      const S = WG.Space;
      if (!S || !S.active()) return;
      const g = G();
      const side = plan.side;
      const owner = g.scenario.spaceFaction && g.scenario.spaceFaction[side];
      if (owner && !plan.factions.includes(owner)) return;
      if (!S.canAct(side)) return;
      const st = S.st(side);
      const lvl = g.state.escalation ? g.state.escalation.level : 0;
      if (side === 'red') {
        if (st.asat > 0 && g.state.aiPlan && g.state.aiPlan.strikeJapan && g.state.turn >= 3 && lvl <= 6 && Math.random() < 0.35) {
          S.asat(side, Math.random() < 0.6 ? 'isr' : 'satcom');
          return;
        }
        if (st.dazzle > 0 && (g.state.turn === 1 || g.state.turn % 3 === 0)) S.dazzle(side);
      } else if (st.dazzle > 0 && (g.state.turn === 2 || g.state.turn % 4 === 1)) {
        S.dazzle(side);
      }
    },

    async before(plan, ctx) {
      this.spaceAI(plan);
      const air = A();
      if (!air.active()) return;
      const side = plan.side;
      const pri = this.zonePriorities(side);
      if (!pri.length) return;
      const sq = this.mine(plan);
      const can = (q) => air.canFly(q);
      const seaZones = pri.filter((p) => G().map.zones[p.z] && G().map.zones[p.z].kind === 'sea');
      const landZones = pri.filter((p) => G().map.zones[p.z] && G().map.zones[p.z].kind !== 'sea');

      // Early warning over the busiest zone, jamming over the next.
      for (const q of sq.filter((x) => x.type === 'aew' && can(x))) {
        const z = pri.find((p) => air.control(p.z).owner !== other(side)) || pri[0];
        air.flySupport(q, z.z, 'aew');
      }
      const enemyZone = this.targetZones(side)[0];
      for (const q of sq.filter((x) => x.type === 'ewac' && can(x))) {
        air.flySupport(q, (enemyZone || pri[0]).z || pri[0].z, 'jam');
      }
      // Drones look for targets where we expect to fight.
      const isrZones = this.isrZones(side, pri);
      let i = 0;
      for (const q of sq.filter((x) => x.type === 'uav' && can(x))) {
        const z = isrZones[i++ % Math.max(1, isrZones.length)];
        if (z) air.flySupport(q, z, 'isr');
      }
      for (const q of sq.filter((x) => x.type === 'mpa' && can(x))) {
        const z = (seaZones[0] || pri[0]).z;
        air.flySupport(q, z, 'asw');
      }
      // Fighters: win control over the top zones, the rest go striking.
      const fighters = sq.filter((x) => (x.type === 'ftr' || x.type === 'ftr5') && can(x))
        .sort((a, b) => AIR_TYPES[b.type].a2a - AIR_TYPES[a.type].a2a);
      const capZones = pri.slice(0, 3);
      const strikeShare = side === 'red' ? 0.45 : 0.35;
      const maxCap = Math.max(1, Math.round(fighters.length * (1 - strikeShare)));
      let capped = 0;
      for (const p of capZones) {
        while (capped < maxCap && fighters.length) {
          const mineP = air.a2a(side, p.z), theirs = air.a2a(other(side), p.z);
          if (mineP >= Math.max(theirs * 1.6, 5)) break;
          const q = fighters.shift();
          if (!can(q)) continue;
          air.flyCap(q, p.z);
          capped++;
        }
      }
      ctx.refresh();
      // Missiles, then strike aircraft.
      await this.missiles(plan, ctx);
      const strikers = sq.filter((x) => AIR_TYPES[x.type].strike > 0 && can(x));
      for (const q of strikers) {
        if (!ctx.alive()) return;
        await this.strike(q, plan, ctx);
      }
      ctx.refresh();
    },

    targetZones(side) {
      const g = G();
      const known = g.intel(side);
      const w = {};
      for (const e of g.state.units) {
        if (e.side === side || e.carrier || !known.has(e.id)) continue;
        const z = g.tile(e.q, e.r).zone;
        w[z] = (w[z] || 0) + this.unitValue(e, side);
      }
      return Object.keys(w).sort((a, b) => w[b] - w[a]).map((z) => ({ z, w: w[z] }));
    },

    isrZones(side, pri) {
      const g = G();
      const sc = g.scenario;
      const pref = sc.aiIsrZones ? sc.aiIsrZones(g, side) : [];
      const out = [...pref];
      for (const p of pri) if (!out.includes(p.z)) out.push(p.z);
      return out;
    },

    targetScoreBase(side, def) {
      const air = A();
      const st = air.status(def.id);
      if (st.runway >= 3) return 0;
      const ground = air.st().squadrons.filter((q) => q.base === def.id && !q.mission && q.steps > 0);
      const exposed = Math.max(0, ground.length - (def.shelters || 0));
      let s = exposed * 1.2 + (ground.length ? (st.runway < 2 ? 1.5 : 0.3) : 0.2);
      if (def.carrier) s = 2.5 + ground.length * 0.8;
      if (G().state.turn <= 2) s *= 1.5;
      return s;
    },

    allowedBase(side, def) {
      const sc = G().scenario;
      return !sc.aiMayStrikeBase || sc.aiMayStrikeBase(G(), side, def);
    },
    allowedTile(side, t) {
      const sc = G().scenario;
      return !t || !sc.aiMayStrikeTile || sc.aiMayStrikeTile(G(), side, t);
    },

    async missiles(plan, ctx) {
      const air = A();
      const g = G();
      const side = plan.side;
      const sc = g.scenario;
      for (const m of air.missileOptions(side)) {
        if (m.def.faction && !plan.factions.includes(m.def.faction)) continue;
        if (!m.canFire) continue;
        let shots = air.launchesLeft(side, m.id);
        while (shots > 0 && ctx.alive()) {
          const known = g.intel(side);
          let best = null;
          for (const e of g.state.units) {
            if (e.side === side || !air.missileCanHitUnit(side, m.id, e, known)) continue;
            if (!this.allowedTile(side, g.tile(e.q, e.r))) continue;
            const o = air.missileOdds(side, m.id, e);
            const s = o.exp * this.unitValue(e, side) + (o.exp >= e.steps ? this.unitValue(e, side) : 0);
            if (!best || s > best.s) best = { s, e };
          }
          for (const def of air.allBases()) {
            if (!air.missileCanHitBase(side, m.id, def) || !this.allowedBase(side, def)) continue;
            if (def.kind === 'hex' && !this.allowedTile(side, air.baseTile(def))) continue;
            const s = this.targetScoreBase(side, def) * (m.def.ballistic ? 1 : 0.8);
            if (!best || s > best.s) best = { s, base: def };
          }
          if (sc.sensorSites) {
            for (const site of sc.sensorSites(g)) {
              if (site.side === side || (g.state.sitesDown || {})[site.id] || !m.def.reach.includes('map')) continue;
              if (!this.allowedTile(side, site.t)) continue;
              const s = g.state.turn <= 3 ? 1.4 : 0.7;
              if (!best || s > best.s) best = { s, site };
            }
          }
          if (!best || best.s < 0.5) break;
          if (best.site) {
            if (ctx.fx) await ctx.fx(null, best.site.t, 'missile');
            sc.strikeSite(g, side, m.id, best.site);
          } else if (best.e) {
            if (ctx.fx) await ctx.fx(null, g.tile(best.e.q, best.e.r), 'missile');
            air.fireAtUnit(side, m.id, best.e);
          } else {
            const t = air.baseTile(best.base);
            if (ctx.fx && t) await ctx.fx(null, t, 'missile');
            air.fireAtBase(side, m.id, best.base.id);
          }
          shots--;
          ctx.refresh();
        }
      }
    },

    async strike(q, plan, ctx) {
      const air = A();
      const g = G();
      const side = plan.side;
      if (!air.canFly(q)) return;
      const known = g.intel(side);
      const at = AIR_TYPES[q.type];
      let best = null;
      for (const e of g.state.units) {
        if (e.side === side || !air.canStrikeUnit(q, e, known)) continue;
        if (!this.allowedTile(side, g.tile(e.q, e.r))) continue;
        const o = air.strikeOdds(q, e);
        let s = o.exp * this.unitValue(e, side) - o.risk * at.value * 1.2;
        if (o.exp >= e.steps) s += this.unitValue(e, side);
        if (!best || s > best.s) best = { s, e };
      }
      for (const def of air.allBases()) {
        if (def.kind === 'carrier' || air.owner(def.id) === side) continue;
        if (def.kind === 'offmap' && !at.standoff) continue;
        if (def.carrier && !air.carrierTracked(side, def)) continue;
        if (air.status(def.id).sunk || (def.arrives && g.state.turn < def.arrives)) continue;
        if (!this.allowedBase(side, def)) continue;
        if (def.kind === 'hex' && !this.allowedTile(side, air.baseTile(def))) continue;
        const t = air.baseTile(def);
        const cap = t ? air.a2a(other(side), t.zone) : 0;
        const s = this.targetScoreBase(side, def) * 0.8 - (at.standoff ? 0 : cap * 0.08 * at.value);
        if (!best || s > best.s) best = { s, base: def };
      }
      if (!best || best.s < 0.4) {
        // Nothing worth hitting: fighters fly patrol instead.
        if (at.a2a >= 5) {
          const p = this.zonePriorities(side)[0];
          if (p) air.flyCap(q, p.z);
        }
        return;
      }
      if (best.e) {
        const t = g.tile(best.e.q, best.e.r);
        if (ctx.fx) await ctx.fx(null, t, 'air');
        air.strikeUnit(q, best.e);
      } else {
        const t = air.baseTile(best.base);
        if (ctx.fx && t) await ctx.fx(null, t, 'air');
        air.strikeBaseWithAircraft(q, best.base.id);
      }
      ctx.refresh();
    },

    // Airborne brigades jump in once there is something to link up with.
    async after(plan, ctx) {
      const air = A();
      const g = G();
      if (!air.active()) return;
      const side = plan.side;
      const paras = g.state.units.filter((u) => plan.mine(u) && UNIT_TYPES[u.type].airAssault);
      for (const u of paras) {
        if (!ctx.alive()) return;
        const opts = air.airAssaultOptions(u);
        if (!opts.length) continue;
        const known = g.intel(side);
        const ashore = g.state.units.some((x) => x.side === side && !x.carrier && UNIT_TYPES[x.type].domain === 'land' &&
          g.tile(x.q, x.r).home !== side && g.tile(x.q, x.r).home);
        if (!ashore && g.state.turn < 3) continue;
        let best = null;
        for (const k of opts) {
          const t = g.map.tiles.get(k);
          let friends = 0, foes = 0;
          for (const n of Hex.neighbors(t.q, t.r)) {
            const x = g.unitAt(n.q, n.r, null, 'land');
            if (!x) continue;
            if (x.side === side) friends++;
            else if (known.has(x.id)) foes++;
          }
          const risk = air.airAssaultRisk(u, k);
          let s = Math.min(2, friends) * 3 - foes * 2.5 - risk.exp * 2.5;
          if (t.airbase && air.owner(t.airbase) !== side) s += 4;
          if (t.city && t.city.owner !== side) s += (t.city.vp || 0) * 1.2;
          if (!friends && !t.airbase && !(t.city && t.city.vp)) s -= 3;
          if (!best || s > best.s) best = { s, k };
        }
        if (!best || best.s < 2) continue;
        if (ctx.airAssault) await ctx.airAssault(u, best.k);
        else air.doAirAssault(u, best.k);
        ctx.refresh();
      }
    },
  };

  WG.AI.Air = AirAI;
  WG.AI.planners.unshift({ before: (plan, ctx) => AirAI.before(plan, ctx), after: (plan, ctx) => AirAI.after(plan, ctx) });
})(window.WG);
