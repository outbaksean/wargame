'use strict';

// Heuristic AI for ground units. It only knows about enemy units its side has spotted.
// Scenario-specific or domain-specific planners (naval, air) register in WG.AI.planners.
(function (WG) {
  const { Hex, UNIT_TYPES } = WG;
  const ORDER = ['recon', 'armor', 'amphmech', 'mech', 'marine', 'inf', 'airborne', 'at', 'lm', 'hq', 'sam', 'ew'];
  const FIRE_FIRST = (t) => t.indirect || t.sea;

  const AI = {
    fields: new Map(),
    mapRef: null,
    planners: [],

    // Movement-cost distance from every hex to `goalKey` for a mobility class (ignores units).
    field(goalKey, cls, side) {
      const G = WG.Game;
      if (this.mapRef !== G.map) { this.fields.clear(); this.mapRef = G.map; }
      const id = goalKey + '#' + cls + (cls === 'naval' ? '#' + side : '');
      if (this.fields.has(id)) return this.fields.get(id);
      const dist = new Map([[goalKey, 0]]);
      const pq = new WG.PQ();
      pq.push(goalKey, 0);
      while (pq.size) {
        const { item: k, pri: d } = pq.pop();
        if (d > dist.get(k)) continue;
        const t = G.map.tiles.get(k);
        for (const n of Hex.neighbors(t.q, t.r)) {
          const nt = G.tile(n.q, n.r);
          if (!nt) continue;
          const c = G.classCost(cls, nt, t, side);
          if (!isFinite(c)) continue;
          const nd = d + c;
          if (nd < (dist.has(nt.key) ? dist.get(nt.key) : Infinity)) {
            dist.set(nt.key, nd);
            pq.push(nt.key, nd);
          }
        }
      }
      this.fields.set(id, dist);
      return dist;
    },

    // Rough measure of enemy ground firepower that could hit hex (q, r) next turn.
    threat(q, r, enemies) {
      let t = 0;
      for (const e of enemies) {
        const et = UNIT_TYPES[e.type];
        if (et.domain !== 'land' || !et.atk) continue;
        const d = Hex.distance(q, r, e.q, e.r);
        const reach = et.indirect ? et.range : 2;
        if (d <= reach) t += (et.atk * WG.Game.strength(e)) / Math.max(1, d);
      }
      return t;
    },

    knownEnemies(side) {
      const G = WG.Game;
      const known = G.intel(side);
      return G.state.units.filter((e) => e.side !== side && !e.carrier && known.has(e.id));
    },

    async takeTurn(side, factions, ctx) {
      const G = WG.Game;
      factions = factions.filter((f) => G.factionActive(f));
      if (!factions.length) return;
      const mine = (u) => u.side === side && factions.includes(u.faction) && !u.carrier;
      const claimed = new Map();
      const plan = { side, factions, claimed, mine };
      for (const p of this.planners) if (p.before) await p.before(plan, ctx);
      if (!ctx.alive()) return;
      // 1. Fire support with targets fires first to soften the enemy.
      for (const u of G.state.units.filter((x) => mine(x) && UNIT_TYPES[x.type].domain === 'land' && FIRE_FIRST(UNIT_TYPES[x.type]))) {
        if (!ctx.alive()) return;
        await this.tryAttack(u, side, ctx, true);
      }
      // 2. Planners for other domains (ships, air...).
      for (const p of this.planners) if (p.act) { await p.act(plan, ctx); if (!ctx.alive()) return; }
      // 3. Manoeuvre units.
      const movers = G.state.units.filter((x) => mine(x) && UNIT_TYPES[x.type].domain === 'land' && !FIRE_FIRST(UNIT_TYPES[x.type]))
        .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
      for (const u of movers) {
        if (!ctx.alive()) return;
        if (!G.alive(u) || u.carrier) continue;
        if (await this.tryAttack(u, side, ctx, false)) continue;
        await this.moveUnit(u, side, ctx, claimed);
      }
      // 4. Remaining fire units: shoot at anything newly spotted, else reposition.
      for (const u of G.state.units.filter((x) => mine(x) && UNIT_TYPES[x.type].domain === 'land' && FIRE_FIRST(UNIT_TYPES[x.type]))) {
        if (!ctx.alive()) return;
        if (!G.alive(u) || u.attacked) continue;
        if (await this.tryAttack(u, side, ctx, true)) continue;
        await this.moveUnit(u, side, ctx, claimed);
      }
      for (const p of this.planners) if (p.after) { await p.after(plan, ctx); if (!ctx.alive()) return; }
    },

    scoreAttack(u, e, from, enemies) {
      const G = WG.Game;
      const ut = UNIT_TYPES[u.type];
      const o = G.odds(u, e, from);
      const et = UNIT_TYPES[e.type];
      const bonus = G.scenario.aiTargetBonus ? G.scenario.aiTargetBonus(G, u.side, e) : 1;
      let s = o.expDef * et.value * bonus - o.expAtt * ut.value * 1.3;
      if (o.expDef >= e.steps) s += 1.5 * et.value;
      const t = G.tile(e.q, e.r);
      if (t.city && t.city.vp) s += t.city.vp * 0.4;
      if (o.mode === 'land' && !o.ranged && o.ratio < 0.9) s -= 2;
      if (ut.expendable) s -= ut.value * 0.3;
      if (!o.ranged) s -= this.threat(from.q, from.r, enemies) * 0.04;
      return s;
    },

    async tryAttack(u, side, ctx, stayOnly) {
      const G = WG.Game;
      if (!G.alive(u) || !G.canAttack(u)) return false;
      const ut = UNIT_TYPES[u.type];
      const known = G.intel(side);
      const enemies = this.knownEnemies(side);
      if (!enemies.length) return false;
      const here = Hex.key(u.q, u.r);
      let options = [here];
      if (!stayOnly && !FIRE_FIRST(ut) && u.mpLeft > 0) {
        options = options.concat(G.destinations(u, G.reachable(u, known), known));
      }
      let best = null;
      for (const k of options) {
        const p = Hex.parse(k);
        for (const e of G.targets(u, known, p)) {
          let s = this.scoreAttack(u, e, p, enemies);
          if (k === here) s += 0.1;
          if (!best || s > best.s) best = { s, k, e };
        }
      }
      if (!best || best.s <= 0.25) return false;
      if (best.k !== here) {
        await ctx.move(u, best.k);
        if (!ctx.alive() || !G.alive(u)) return true;
      }
      const e = best.e;
      if (G.alive(e) && G.canAttack(u) && G.targets(u, G.intel(side)).includes(e)) await ctx.attack(u, e);
      return true;
    },

    centroidKey(list, move, side) {
      const G = WG.Game;
      const x = list.reduce((s, m) => s + m.q, 0) / list.length;
      const y = list.reduce((s, m) => s + m.r, 0) / list.length;
      const h = Hex.round(x, y);
      let best = null;
      for (const t of G.map.list) {
        if ((move === 'naval') !== G.isSea(t)) continue;
        if (move !== 'naval' && !isFinite(G.terr(t).cost[move])) continue;
        const d = Hex.distance(t.q, t.r, h.q, h.r);
        if (!best || d < best.d) best = { d, key: t.key };
      }
      return best && best.key;
    },

    chooseGoal(u, side, enemies, claimed) {
      const G = WG.Game;
      const ut = UNIT_TYPES[u.type];
      const here = Hex.key(u.q, u.r);
      const near = (list) => list.reduce((b, e) => {
        const d = Hex.distance(u.q, u.r, e.q, e.r);
        return !b || d < b.d ? { e, d } : b;
      }, null);
      const landEnemies = enemies.filter((e) => UNIT_TYPES[e.type].domain === 'land');
      const front = G.unitsOf(side).filter((m) => m !== u && UNIT_TYPES[m.type].domain === 'land' && !FIRE_FIRST(UNIT_TYPES[m.type]) && m.type !== 'hq');
      const sameIsland = (k) => { const a = G.tile(u.q, u.r), b = G.map.tiles.get(k); return !a.island || a.island === b.island; };

      if (u.type === 'hq' || u.type === 'sam' || u.type === 'ew') {
        const f = front.filter((m) => sameIsland(Hex.key(m.q, m.r)));
        return f.length ? { mode: 'follow', key: this.centroidKey(f, ut.move, side) } : { mode: 'hold' };
      }
      if (FIRE_FIRST(ut)) {
        const reachable = landEnemies.filter((e) => sameIsland(Hex.key(e.q, e.r)));
        if (reachable.length) { const n = near(reachable); return { mode: 'standoff', key: Hex.key(n.e.q, n.e.r), range: Math.max(2, ut.range - 0.5) }; }
        const f = front.filter((m) => sameIsland(Hex.key(m.q, m.r)));
        return f.length ? { mode: 'follow', key: this.centroidKey(f, ut.move, side) } : { mode: 'hold' };
      }

      // Never leave the capital empty; garrison a threatened town we are standing in.
      const t = G.tile(u.q, u.r);
      if (t.city && t.city.capital && t.city.owner === side) return { mode: 'hold' };
      if (t.city && t.city.owner === side && landEnemies.some((e) => Hex.distance(e.q, e.r, u.q, u.r) <= 4)) {
        return { mode: 'hold' };
      }

      const sc = G.scenario;
      const react = sc.aiReactRange ? sc.aiReactRange(G, u) : Infinity;
      let best = null;
      for (const c of G.map.cities) {
        const d = this.field(c.key, ut.move, side).get(here);
        if (d === undefined) continue;
        if (c.city.owner === side && d > react) continue;
        const vp = c.city.vp || (sc.cityValue ? sc.cityValue(c, side) : 0);
        if (!vp) continue;
        let v;
        if (c.city.owner !== side) {
          v = vp * 4 + (c.city.capital ? 3 : 0);
        } else {
          const threatened = landEnemies.some((e) => Hex.distance(e.q, e.r, c.q, c.r) <= 3);
          const g = G.unitAt(c.q, c.r, u, 'land');
          if (!threatened || (g && g.side === side)) continue;
          v = vp * 4 + 3;
        }
        const s = v - d * 0.6 - (claimed.get(c.key) || 0) * 3;
        if (!best || s > best.s) best = { s, key: c.key };
      }
      if (landEnemies.length && u.type !== 'recon') {
        let n = null;
        for (const e of landEnemies) {
          const d = this.field(Hex.key(e.q, e.r), ut.move, side).get(here);
          if (d !== undefined && d <= react && (!n || d < n.d)) n = { e, d };
        }
        if (n) {
          const key = Hex.key(n.e.q, n.e.r);
          const bonus = sc.enemyPriority ? sc.enemyPriority(n.e, side) : 0;
          const s = 5 + bonus + (1 - G.strength(n.e)) * 3 - n.d * 0.6 - (claimed.get(key) || 0) * 2;
          if (!best || s > best.s) best = { s, key };
        }
      }
      if (!best && AI.Naval) {
        const lg = AI.Naval.landGoal(u, side);
        if (lg) return lg;
      }
      if (!best) {
        const cap = G.map.cities.find((c) => c.city.capital && c.city.owner !== side && this.field(c.key, ut.move, side).has(here));
        if (!cap) return { mode: 'hold' };
        best = { key: cap.key };
      }
      claimed.set(best.key, (claimed.get(best.key) || 0) + 1);
      return { mode: u.type === 'recon' ? 'scout' : 'advance', key: best.key };
    },

    evalPos(u, k, goal, enemies, side) {
      const G = WG.Game;
      const ut = UNIT_TYPES[u.type];
      const p = Hex.parse(k);
      const t = G.map.tiles.get(k);
      let minE = 99;
      for (const e of enemies) if (UNIT_TYPES[e.type].domain === 'land') minE = Math.min(minE, Hex.distance(p.q, p.r, e.q, e.r));
      let s = 0;
      if (goal.mode === 'standoff') {
        const g = Hex.parse(goal.key);
        const d = Hex.distance(p.q, p.r, g.q, g.r);
        s -= Math.abs(d - goal.range) * 3;
        if (minE < 2) s -= 6;
      } else {
        const d = this.field(goal.key, ut.move, side).get(k);
        s -= d === undefined ? 99 : d;
        if ((goal.mode === 'scout' || goal.mode === 'follow') && minE < 3) s -= (3 - minE) * 3;
      }
      s += (G.terr(t).def - 1) * 1.2;
      const fragile = FIRE_FIRST(ut) || u.type === 'hq' || u.type === 'recon' || u.type === 'sam' || u.type === 'ew';
      s -= this.threat(p.q, p.r, enemies) * (fragile ? 0.25 : 0.05);
      if (t.city && t.city.owner !== side) s += 3 + (t.city.vp || 0);
      if (t.terrain === 'river' && !t.road) s -= 1.5;
      return s;
    },

    async moveUnit(u, side, ctx, claimed) {
      const G = WG.Game;
      if (!G.alive(u) || u.mpLeft <= 0 || u.carrier) return;
      const known = G.intel(side);
      const enemies = this.knownEnemies(side);
      const goal = this.chooseGoal(u, side, enemies, claimed);
      if (goal.mode === 'hold' || !goal.key) return;
      const here = Hex.key(u.q, u.r);
      const dests = G.destinations(u, G.reachable(u, known), known);
      let bestK = here;
      let bestS = this.evalPos(u, here, goal, enemies, side) + 0.3;
      for (const k of dests) {
        const s = this.evalPos(u, k, goal, enemies, side);
        if (s > bestS) { bestS = s; bestK = k; }
      }
      if (bestK !== here) {
        const res = await ctx.move(u, bestK);
        // Contact halted us early: re-plan once with what we can now see.
        if (res && res.halted && res.contact && G.alive(u) && u.mpLeft > 0 && ctx.alive()) {
          const k2 = Hex.key(u.q, u.r);
          const known2 = G.intel(side);
          const en2 = this.knownEnemies(side);
          let bk = k2, bs = this.evalPos(u, k2, goal, en2, side) + 0.3;
          for (const k of G.destinations(u, G.reachable(u, known2), known2)) {
            const s2 = this.evalPos(u, k, goal, en2, side);
            if (s2 > bs) { bs = s2; bk = k; }
          }
          if (bk !== k2) await ctx.move(u, bk);
        }
      }
      // Moving may have revealed a juicy target.
      if (ctx.alive() && G.alive(u) && !FIRE_FIRST(UNIT_TYPES[u.type])) await this.tryAttack(u, side, ctx, true);
    },
  };

  WG.AI = AI;
})(window.WG);
