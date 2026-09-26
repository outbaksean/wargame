'use strict';

// Heuristic AI. It only knows about enemy units its own side has spotted.
(function (WG) {
  const { Hex, UNIT_TYPES } = WG;
  const ORDER = ['recon', 'armor', 'mech', 'inf', 'at', 'hq'];

  const AI = {
    fields: new Map(),
    mapRef: null,

    // Movement-cost distance from every hex to `goalKey` for a mobility class (ignores units).
    field(goalKey, cls) {
      const G = WG.Game;
      if (this.mapRef !== G.map) { this.fields.clear(); this.mapRef = G.map; }
      const id = goalKey + '#' + cls;
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
          const c = G.classCost(cls, nt, t);
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

    // Rough measure of enemy firepower that could hit hex (q, r) next turn.
    threat(q, r, enemies) {
      let t = 0;
      for (const e of enemies) {
        const d = Hex.distance(q, r, e.q, e.r);
        const et = UNIT_TYPES[e.type];
        const reach = et.indirect ? et.range : 2;
        if (d <= reach) t += (et.atk * WG.Game.strength(e)) / Math.max(1, d);
      }
      return t;
    },

    async takeTurn(side, ctx) {
      const G = WG.Game;
      const claimed = new Map();
      const units = () => G.unitsOf(side);
      // 1. Artillery with targets fires first to soften the enemy.
      for (const u of units().filter((x) => x.type === 'arty')) {
        if (!ctx.alive()) return;
        await this.tryAttack(u, side, ctx, true);
      }
      // 2. Manoeuvre units.
      const movers = units().filter((x) => x.type !== 'arty')
        .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
      for (const u of movers) {
        if (!ctx.alive()) return;
        if (!G.alive(u)) continue;
        if (await this.tryAttack(u, side, ctx, false)) continue;
        await this.moveUnit(u, side, ctx, claimed);
      }
      // 3. Remaining artillery: fire at anything newly spotted, else reposition.
      for (const u of units().filter((x) => x.type === 'arty')) {
        if (!ctx.alive()) return;
        if (!G.alive(u) || u.attacked) continue;
        if (await this.tryAttack(u, side, ctx, true)) continue;
        await this.moveUnit(u, side, ctx, claimed);
      }
    },

    async tryAttack(u, side, ctx, stayOnly) {
      const G = WG.Game;
      if (!G.alive(u) || !G.canAttack(u)) return false;
      const ut = UNIT_TYPES[u.type];
      const known = G.visibleEnemies(side);
      const enemies = G.state.units.filter((e) => e.side !== side && known.has(e.id));
      if (!enemies.length) return false;
      const here = Hex.key(u.q, u.r);
      let options = [here];
      if (!stayOnly && !ut.indirect && u.mpLeft > 0) {
        options = options.concat(G.destinations(u, G.reachable(u, known), known));
      }
      let best = null;
      for (const k of options) {
        const p = Hex.parse(k);
        const th = ut.indirect ? 0 : this.threat(p.q, p.r, enemies);
        for (const e of enemies) {
          const d = Hex.distance(p.q, p.r, e.q, e.r);
          if (d < 1 || d > ut.range) continue;
          const o = G.combatOdds(u, e, p);
          const et = UNIT_TYPES[e.type];
          let s = o.expDef * et.value - o.expAtt * ut.value * 1.3;
          if (o.expDef >= e.steps) s += 1.5 * et.value;
          const et2 = G.tile(e.q, e.r);
          if (et2.city) s += et2.city.vp * 0.4;
          if (!o.ranged && o.ratio < 0.9) s -= 2;
          s -= th * 0.04;
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
      if (G.alive(e) && G.canAttack(u) && G.visibleEnemies(side).has(e.id) &&
          Hex.distance(u.q, u.r, e.q, e.r) <= ut.range) {
        await ctx.attack(u, e);
      }
      return true;
    },

    chooseGoal(u, side, enemies, claimed) {
      const G = WG.Game;
      const ut = UNIT_TYPES[u.type];
      const here = Hex.key(u.q, u.r);
      const near = (list) => list.reduce((b, e) => {
        const d = Hex.distance(u.q, u.r, e.q, e.r);
        return !b || d < b.d ? { e, d } : b;
      }, null);
      const centroidKey = (list) => {
        const x = list.reduce((s, m) => s + m.q, 0) / list.length;
        const y = list.reduce((s, m) => s + m.r, 0) / list.length;
        const h = Hex.round(x, y);
        let best = null;
        for (const t of G.map.list) {
          if (!isFinite(G.terr(t).cost[ut.move])) continue;
          const d = Hex.distance(t.q, t.r, h.q, h.r);
          if (!best || d < best.d) best = { d, key: t.key };
        }
        return best && best.key;
      };
      const front = G.unitsOf(side).filter((m) => m !== u && m.type !== 'arty' && m.type !== 'hq');

      if (u.type === 'hq') return front.length ? { mode: 'follow', key: centroidKey(front) } : { mode: 'hold' };
      if (u.type === 'arty') {
        if (enemies.length) return { mode: 'standoff', key: Hex.key(near(enemies).e.q, near(enemies).e.r) };
        return front.length ? { mode: 'follow', key: centroidKey(front) } : { mode: 'hold' };
      }

      // Garrison a threatened town we are standing in.
      const t = G.tile(u.q, u.r);
      if (t.city && t.city.owner === side && enemies.some((e) => Hex.distance(e.q, e.r, u.q, u.r) <= 4)) {
        return { mode: 'hold' };
      }

      let best = null;
      for (const c of G.map.cities) {
        const d = this.field(c.key, ut.move).get(here);
        if (d === undefined) continue;
        let v;
        if (c.city.owner !== side) {
          v = c.city.vp * 4 + (c.city.capital ? 3 : 0);
        } else {
          const threatened = enemies.some((e) => Hex.distance(e.q, e.r, c.q, c.r) <= 3);
          const g = G.unitAt(c.q, c.r, u);
          if (!threatened || (g && g.side === side)) continue;
          v = c.city.vp * 4 + 3;
        }
        const s = v - d * 0.6 - (claimed.get(c.key) || 0) * 3;
        if (!best || s > best.s) best = { s, key: c.key };
      }
      if (enemies.length && u.type !== 'recon') {
        const n = near(enemies);
        const key = Hex.key(n.e.q, n.e.r);
        const d = this.field(key, ut.move).get(here);
        if (d !== undefined) {
          const s = 5 + (1 - G.strength(n.e)) * 3 - d * 0.6 - (claimed.get(key) || 0) * 2;
          if (!best || s > best.s) best = { s, key };
        }
      }
      if (!best) {
        const cap = G.map.cities.find((c) => c.city.capital && c.city.owner !== side);
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
      for (const e of enemies) minE = Math.min(minE, Hex.distance(p.q, p.r, e.q, e.r));
      let s = 0;
      if (goal.mode === 'standoff') {
        const g = Hex.parse(goal.key);
        const d = Hex.distance(p.q, p.r, g.q, g.r);
        s -= Math.abs(d - 2.5) * 3;
        if (minE < 2) s -= 6;
      } else {
        const d = this.field(goal.key, ut.move).get(k);
        s -= d === undefined ? 99 : d;
        if ((goal.mode === 'scout' || goal.mode === 'follow') && minE < 3) s -= (3 - minE) * 3;
      }
      s += (G.terr(t).def - 1) * 1.2;
      const fragile = ut.indirect || u.type === 'hq' || u.type === 'recon';
      s -= this.threat(p.q, p.r, enemies) * (fragile ? 0.25 : 0.05);
      if (t.city && t.city.owner !== side) s += 3 + t.city.vp;
      if (t.terrain === 'river' && !t.road) s -= 1.5;
      return s;
    },

    async moveUnit(u, side, ctx, claimed) {
      const G = WG.Game;
      if (!G.alive(u) || u.mpLeft <= 0) return;
      const known = G.visibleEnemies(side);
      const enemies = G.state.units.filter((e) => e.side !== side && known.has(e.id));
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
      if (bestK !== here) await ctx.move(u, bestK);
      // Moving may have revealed a juicy target.
      if (ctx.alive() && G.alive(u) && !UNIT_TYPES[u.type].indirect) await this.tryAttack(u, side, ctx, true);
    },
  };

  WG.AI = AI;
})(window.WG);
