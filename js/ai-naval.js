'use strict';

// Naval and amphibious planner for the AI.
(function (WG) {
  const { Hex, UNIT_TYPES } = WG;
  const G = () => WG.Game;
  const FIXED_ROLES = ['hq', 'sam', 'lrocket', 'lasm', 'arty', 'rocket', 'ew', 'airborne', 'asm', 'lm'];

  const Naval = {
    fields: new Map(),
    fieldTurn: null,

    // Naval movement distance to the nearest of several goal hexes.
    field(keys, side) {
      const g = G();
      if (this.fieldTurn !== g.state.turn + g.state.side) { this.fields.clear(); this.fieldTurn = g.state.turn + g.state.side; }
      const id = side + ':' + keys.slice().sort().join(';');
      if (this.fields.has(id)) return this.fields.get(id);
      const dist = new Map();
      const pq = new WG.PQ();
      for (const k of keys) { dist.set(k, 0); pq.push(k, 0); }
      while (pq.size) {
        const { item: k, pri: d } = pq.pop();
        if (d > dist.get(k)) continue;
        const t = g.map.tiles.get(k);
        for (const n of Hex.neighbors(t.q, t.r)) {
          const nt = g.tile(n.q, n.r);
          if (!nt) continue;
          const c = g.classCost('naval', nt, t, side);
          if (!isFinite(c)) continue;
          const nd = d + c;
          if (nd < (dist.has(nt.key) ? dist.get(nt.key) : Infinity)) { dist.set(nt.key, nd); pq.push(nt.key, nd); }
        }
      }
      this.fields.set(id, dist);
      return dist;
    },

    enemies(side) {
      const g = G();
      const known = g.intel(side);
      return g.state.units.filter((e) => e.side !== side && !e.carrier && known.has(e.id));
    },

    // Enemy anti-ship firepower that can reach hex p.
    exposure(p, enemies) {
      const g = G();
      let x = 0;
      for (const e of enemies) {
        const et = UNIT_TYPES[e.type];
        if (!et.sea || et.sea.kind === 'torpedo') continue;
        const d = Hex.distance(p.q, p.r, e.q, e.r);
        const reach = et.sea.range + (et.domain === 'land' ? 0 : Math.min(4, et.mp / 2));
        if (d <= reach) x += et.sea.atk * g.strength(e);
      }
      return x;
    },

    seaAdjacent(t) {
      const g = G();
      return Hex.neighbors(t.q, t.r).map((n) => g.tile(n.q, n.r)).filter((x) => x && g.isSea(x)).map((x) => x.key);
    },

    targetValue(e, side) {
      const et = UNIT_TYPES[e.type];
      let v = et.value;
      if (e.cargo && e.cargo.length) v *= 2.2;
      const sc = G().scenario;
      if (sc.aiTargetBonus) v *= sc.aiTargetBonus(G(), side, e);
      return v;
    },

    // Fire at the best target, possibly after moving into range.
    async strike(u, side, ctx, allowMove = true) {
      const g = G();
      if (!g.alive(u) || !g.canAttack(u)) return false;
      const ut = UNIT_TYPES[u.type];
      const known = g.intel(side);
      const enemies = this.enemies(side);
      if (!enemies.length) return false;
      const here = Hex.key(u.q, u.r);
      let opts = [here];
      if (allowMove && u.mpLeft > 0) opts = opts.concat(g.destinations(u, g.reachable(u, known), known));
      let best = null;
      for (const k of opts) {
        const p = Hex.parse(k);
        const tg = g.targets(u, known, p);
        if (!tg.length) continue;
        const exp = ut.domain === 'sub' ? 0 : this.exposure(p, enemies);
        for (const e of tg) {
          const o = g.odds(u, e, p);
          const tv = this.targetValue(e, side);
          let s = o.expDef * tv * (UNIT_TYPES[e.type].domain === 'land' ? 0.7 : 1);
          if (o.expDef >= e.steps) s += tv;
          if (ut.expendable) s -= ut.value * 0.5;
          s -= exp * 0.03 * ut.value;
          if (k === here) s += 0.15;
          if (!best || s > best.s) best = { s, k, e };
        }
      }
      if (!best || best.s < 0.35) return false;
      if (best.k !== here) {
        await ctx.move(u, best.k);
        if (!ctx.alive() || !g.alive(u)) return true;
      }
      if (g.alive(best.e) && g.canAttack(u) && g.targets(u, g.intel(side)).includes(best.e)) await ctx.attack(u, best.e);
      return true;
    },

    // Move to the reachable hex with the best score.
    // Re-plans after a contact halt, up to a few times, while movement points remain.
    async moveBy(u, side, ctx, score) {
      const g = G();
      for (let tries = 0; tries < 3; tries++) {
        if (!ctx.alive() || !g.alive(u) || u.mpLeft <= 0) return;
        const known = g.intel(side);
        const here = Hex.key(u.q, u.r);
        let bestK = here, bestS = score(here) + 0.2;
        for (const k of g.destinations(u, g.reachable(u, known), known)) {
          const s = score(k);
          if (s > bestS) { bestS = s; bestK = k; }
        }
        if (bestK === here) return;
        const res = await ctx.move(u, bestK);
        if (!res || !res.halted || !res.contact) return;
      }
    },

    // ---------- amphibious
    // Sea hexes from which troops can go ashore in an area: free or enemy-held beaches,
    // plus open coast beside our own beachheads there.
    areaGoals(area, side) {
      const g = G();
      const keys = new Set();
      const beaches = (g.map.landingAreas[area] || []).map((k) => g.map.tiles.get(k));
      const spots = [];
      for (const t of beaches) {
        const occ = g.unitAt(t.q, t.r, null, 'land');
        if (!occ || occ.side !== side) spots.push(t);
        if (g.state.beachheads[t.key] === side || (occ && occ.side === side)) {
          for (const n of Hex.neighbors(t.q, t.r)) {
            const nt = g.tile(n.q, n.r);
            if (nt && !g.isSea(nt) && nt.mass === t.mass && !g.unitAt(nt.q, nt.r, null, 'land') && this.seaAdjacent(nt).length) spots.push(nt);
          }
        }
      }
      for (const t of (spots.length ? spots : beaches)) for (const s of this.seaAdjacent(t)) keys.add(s);
      return [...keys];
    },

    lodgments(side) {
      const g = G();
      const out = [];
      for (const c of g.map.cities) if (c.city.owner === side && c.home !== side && c.city.port) out.push({ t: c, port: true });
      for (const k in g.state.beachheads) if (g.state.beachheads[k] === side) out.push({ t: g.map.tiles.get(k), port: false });
      return out;
    },

    assignAreas(side, transports) {
      const g = G();
      const plan = g.state.aiPlan || (g.state.aiPlan = { areas: Object.keys(g.map.landingAreas || {}).slice(0, 2) });
      plan.assign = plan.assign || {};
      const areas = plan.areas.filter((a) => (g.map.landingAreas[a] || []).length);
      const loaded = transports.filter((t) => t.cargo.length && !plan.assign[t.id] && !UNIT_TYPES[t.type].portOnly);
      if (!loaded.length || !areas.length) return plan;
      if (plan.penghu && !plan.penghuTaken && g.map.landingAreas.penghu) {
        const f = this.field(this.areaGoals('penghu', side), side);
        const best = loaded.map((t) => ({ t, d: f.get(Hex.key(t.q, t.r)) })).filter((x) => x.d !== undefined).sort((a, b) => a.d - b.d)[0];
        if (best) { plan.assign[best.t.id] = 'penghu'; plan.penghuTaken = true; }
      }
      const count = {};
      for (const id in plan.assign) count[plan.assign[id]] = (count[plan.assign[id]] || 0) + 1;
      const cap = Math.ceil(loaded.length / areas.length) + 1;
      for (const t of loaded) {
        if (plan.assign[t.id]) continue;
        let best = null;
        for (const a of areas) {
          const d = this.field(this.areaGoals(a, side), side).get(Hex.key(t.q, t.r));
          if (d === undefined) continue;
          const s = d + ((count[a] || 0) >= cap ? 50 : 0);
          if (!best || s < best.s) best = { s, a };
        }
        if (best) { plan.assign[t.id] = best.a; count[best.a] = (count[best.a] || 0) + 1; }
      }
      return plan;
    },

    async tryLand(ship, side, ctx) {
      const g = G();
      let landed = false;
      const minOdds = Math.max(0.85, 1.3 - 0.15 * (ship.aiWait || 0));
      for (const id of ship.cargo.slice()) {
        if (!ctx.alive() || !g.alive(ship)) return landed;
        const u = g.byId(id);
        if (!u || u.moved) continue;
        const known = g.intel(side);
        const opts = g.landingOptions(ship, u, known).filter((o) => g.map.tiles.get(o.key).home !== side);
        let best = null;
        for (const o of opts) {
          const t = g.map.tiles.get(o.key);
          let s = 3 + (t.city && t.city.port ? 2 : 0) + (t.city ? t.city.vp || 0 : 0) * 0.3;
          const friendsAshore = Hex.neighbors(t.q, t.r).filter((n) => {
            const f = g.unitAt(n.q, n.r, null, 'land');
            return f && f.side === side;
          }).length;
          s += Math.min(2, friendsAshore) * 1.5;
          if (o.assault) {
            const odds = g.combatOdds(u, o.def, { q: ship.q, r: ship.r }, { landing: true });
            if (odds.ratio < minOdds) continue;
            s = odds.ratio * 2 - 1;
          } else {
            s -= g.enemyAdjacent(side, t.q, t.r, known, 'land') ? 1.5 : 0;
          }
          if (!best || s > best.s) best = { s, o };
        }
        if (!best) continue;
        await ctx.land(u, ship, best.o.key);
        landed = true;
      }
      return landed;
    },

    waitingTroops(side, factions) {
      const g = G();
      return g.state.units.filter((u) => u.side === side && factions.includes(u.faction) && !u.carrier &&
        UNIT_TYPES[u.type].domain === 'land' && !FIXED_ROLES.includes(u.type) && g.tile(u.q, u.r).home === side);
    },

    async transport(ship, plan, ctx) {
      const g = G();
      const side = plan.side;
      const st = UNIT_TYPES[ship.type];
      const enemies = this.enemies(side);
      const pending = ship.cargo.filter((id) => { const c = g.byId(id); return c && !c.moved; });
      if (pending.length) {
        if (await this.tryLand(ship, side, ctx)) return;
        let goals;
        const lodg = this.lodgments(side).filter((l) => l.port || !st.portOnly);
        const area = g.state.aiPlan && g.state.aiPlan.assign && g.state.aiPlan.assign[ship.id];
        if (st.portOnly) {
          const cap = g.state.capturedAt || {};
          const ports = lodg.filter((l) => l.port && (cap[l.t.key] || 0) < g.state.turn &&
            !enemies.some((e) => UNIT_TYPES[e.type].domain === 'land' && Hex.distance(e.q, e.r, l.t.q, l.t.r) <= 2));
          if (!ports.length) return; // wait in port until a harbor is taken
          goals = [];
          for (const l of ports) goals.push(l.t.key, ...this.seaAdjacent(l.t));
        } else if (area && !ship.aiLanded) {
          goals = this.areaGoals(area, side);
        } else if (lodg.length) {
          goals = [];
          for (const l of lodg) goals.push(...this.seaAdjacent(l.t));
        } else {
          goals = this.areaGoals((g.state.aiPlan && g.state.aiPlan.areas[0]) || 'north', side);
        }
        const f = this.field(goals, side);
        // Assault waves form up ~5 hexes out and go in together.
        let hold = 0;
        if (area && !ship.aiLanded && !st.portOnly) {
          const group = g.state.units.filter((t) => t.side === side && t.cargo && t.cargo.length && !t.aiLanded &&
            g.state.aiPlan.assign[t.id] === area);
          const near = group.filter((t) => (f.get(Hex.key(t.q, t.r)) ?? 99) <= 6).length;
          if (near < Math.ceil(group.length * 0.7) && g.state.turn < 5) hold = 5;
        }
        await this.moveBy(ship, side, ctx, (k) => {
          let d = f.get(k);
          d = d === undefined ? 99 : d;
          const dist = d < hold ? hold + (hold - d) * 2 : d;
          return -dist - this.exposure(Hex.parse(k), enemies) * 0.02 - (g.state.minesKnown[side][k] && g.state.mines[k] !== side ? 5 : 0);
        });
        if (hold) return;
        if (ctx.alive() && g.alive(ship)) {
          if (await this.tryLand(ship, side, ctx)) { ship.aiLanded = true; ship.aiWait = 0; }
          else if ((f.get(Hex.key(ship.q, ship.r)) ?? 99) <= 1) {
            // At the beach but could not get ashore: grow bolder, and eventually try another area.
            ship.aiWait = (ship.aiWait || 0) + 1;
            if (ship.aiWait >= 3 && area && g.state.aiPlan) {
              const alt = Object.keys(g.map.landingAreas).filter((a) => a !== area && a !== 'penghu')
                .map((a) => ({ a, free: (g.map.landingAreas[a] || []).filter((k) => !g.unitAt(g.map.tiles.get(k).q, g.map.tiles.get(k).r, null, 'land')).length }))
                .sort((x, y) => y.free - x.free)[0];
              if (alt && alt.free) { g.state.aiPlan.assign[ship.id] = alt.a; ship.aiWait = 0; }
            }
          }
        }
        return;
      }
      // Empty: sustain a beachhead that has no shipping alongside, else fetch more troops.
      if (st.beach) {
        const needy = this.lodgments(side).filter((l) => !l.port).find((l) => !Hex.within(l.t.q, l.t.r, 1).some((h) => {
          const s = g.unitAt(h.q, h.r, null, 'sea');
          return s && s !== ship && s.side === side && UNIT_TYPES[s.type].beach;
        }));
        if (needy && Math.random() < 0.6) {
          const f = this.field(this.seaAdjacent(needy.t), side);
          await this.moveBy(ship, side, ctx, (k) => -(f.get(k) === undefined ? 99 : f.get(k)) - this.exposure(Hex.parse(k), enemies) * 0.01);
          return;
        }
      }
      const troops = this.waitingTroops(side, plan.factions).filter((u) => !u.aiClaimed);
      if (!troops.length) {
        const home = g.map.cities.filter((c) => c.city.owner === side && c.home === side && c.city.port);
        const f = this.field(home.map((c) => c.key), side);
        await this.moveBy(ship, side, ctx, (k) => -(f.get(k) === undefined ? 99 : f.get(k)));
        return;
      }
      // Embark anyone already alongside.
      for (const u of troops) {
        if (ship.cargo.length >= st.capacity) break;
        if (Hex.distance(u.q, u.r, ship.q, ship.r) <= 1 && u.mpLeft > 0 && !u.attacked) {
          g.doEmbark(u, ship);
          u.aiClaimed = true;
          ctx.refresh();
        }
      }
      if (ship.cargo.length) return;
      let goals = [];
      for (const u of troops) {
        const t = g.tile(u.q, u.r);
        goals.push(...this.seaAdjacent(t));
        if (t.city && t.city.port) goals.push(t.key);
      }
      const f = this.field(goals, side);
      await this.moveBy(ship, side, ctx, (k) => -(f.get(k) === undefined ? 99 : f.get(k)));
      for (const u of troops) {
        if (ship.cargo.length >= st.capacity || !g.alive(ship)) break;
        if (Hex.distance(u.q, u.r, ship.q, ship.r) <= 1 && u.mpLeft > 0 && !u.attacked) {
          g.doEmbark(u, ship);
          u.aiClaimed = true;
          ctx.refresh();
        }
      }
    },

    // ---------- turn
    async act(plan, ctx) {
      const g = G();
      const side = plan.side;
      const mineShips = () => g.state.units.filter((u) => plan.mine(u) && UNIT_TYPES[u.type].domain !== 'land');
      if (!mineShips().length) return;
      for (const u of g.state.units) if (u.side === side) delete u.aiClaimed;
      const sc = g.scenario.ai || {};

      // 1. Submarines and missile ships fire, moving into range where needed.
      const shooters = mineShips().filter((u) => UNIT_TYPES[u.type].sea && UNIT_TYPES[u.type].domain !== 'land')
        .sort((a, b) => (UNIT_TYPES[b.type].sea.range - UNIT_TYPES[a.type].sea.range));
      for (const u of shooters) {
        if (!ctx.alive()) return;
        const ut = UNIT_TYPES[u.type];
        const free = ut.domain === 'sub' || ut.expendable || u.type === 'fac';
        await this.strike(u, side, ctx, free);
      }

      // 2. Amphibious shipping.
      const transports = mineShips().filter((u) => UNIT_TYPES[u.type].capacity);
      if (transports.length) this.assignAreas(side, transports);
      for (const t of transports) {
        if (!ctx.alive()) return;
        if (g.alive(t)) await this.transport(t, plan, ctx);
      }

      // 3. Everyone else repositions.
      const enemies = this.enemies(side);
      const carriers = mineShips().filter((u) => u.type === 'cv');
      const loaded = mineShips().filter((u) => u.cargo && u.cargo.length);
      const escorted = new Map();
      for (const u of mineShips()) {
        if (!ctx.alive()) return;
        if (!g.alive(u) || u.mpLeft <= 0 || UNIT_TYPES[u.type].capacity) continue;
        const ut = UNIT_TYPES[u.type];
        // Out of missiles or torpedoes: head for a friendly port to reload.
        if (ut.sea && ut.sea.ammo && !u.ammo) {
          const ports = g.map.cities.filter((c) => c.city.port && c.city.owner === side);
          if (ports.length) {
            const f = this.field(ports.map((c) => c.key), side);
            await this.moveBy(u, side, ctx, (k) => -(f.get(k) === undefined ? 99 : f.get(k)) - this.exposure(Hex.parse(k), enemies) * 0.02);
            continue;
          }
        }
        if (u.type === 'cv') {
          const st = sc.carrierStation && sc.carrierStation[side];
          const anchor = st ? g.map.at(st[0], st[1]) : g.tile(u.q, u.r);
          await this.moveBy(u, side, ctx, (k) => {
            const p = Hex.parse(k);
            return -this.exposure(p, enemies) * 0.15 - Hex.distance(p.q, p.r, anchor.q, anchor.r) * 0.3;
          });
          continue;
        }
        if (ut.domain === 'sub') {
          const prey = enemies.filter((e) => UNIT_TYPES[e.type].domain === 'sea');
          const pts = (sc.subPatrol && sc.subPatrol[side]) || [];
          let goalKeys = prey.map((e) => Hex.key(e.q, e.r));
          if (!goalKeys.length && pts.length) {
            const pt = pts[u.id % pts.length];
            const t = g.map.at(pt[0], pt[1]);
            if (t) goalKeys = [t.key];
          }
          if (!goalKeys.length) continue;
          const f = this.field(goalKeys, side);
          await this.moveBy(u, side, ctx, (k) => {
            const p = Hex.parse(k);
            let s = -(f.get(k) === undefined ? 99 : f.get(k));
            for (const e of enemies) if (UNIT_TYPES[e.type].asw && Hex.distance(p.q, p.r, e.q, e.r) <= UNIT_TYPES[e.type].asw.range) s -= 4;
            return s;
          });
          await this.strike(u, side, ctx, false);
          continue;
        }
        if (ut.sweep) {
          const plan2 = g.state.aiPlan;
          const areas = plan2 && plan2.areas ? plan2.areas : [];
          const area = areas[u.id % Math.max(1, areas.length)];
          if (!area || !loaded.length) continue;
          const goals = this.areaGoals(area, side).filter((k) => g.state.mines[k] && g.state.mines[k] !== side && g.state.minesKnown[side][k]);
          const approach = goals.length ? goals : this.areaGoals(area, side);
          const f = this.field(approach.flatMap((k) => this.seaAdjacent(g.map.tiles.get(k)).concat([k])), side);
          await this.moveBy(u, side, ctx, (k) => -(f.get(k) === undefined ? 99 : f.get(k)) - (g.state.minesKnown[side][k] && g.state.mines[k] !== side ? 5 : 0));
          continue;
        }
        // Escort a carrier, then loaded transports; otherwise hunt or hold near the coast.
        let charge = null;
        for (const c of carriers) if (!escorted.get(c.id)) { charge = c; break; }
        if (!charge && loaded.length && (u.type === 'ddg' || u.type === 'ffg')) {
          charge = loaded.slice().sort((a, b) => (escorted.get(a.id) || 0) - (escorted.get(b.id) || 0) ||
            Hex.distance(u.q, u.r, a.q, a.r) - Hex.distance(u.q, u.r, b.q, b.r))[0];
        }
        if (charge) {
          escorted.set(charge.id, (escorted.get(charge.id) || 0) + 1);
          await this.moveBy(u, side, ctx, (k) => {
            const p = Hex.parse(k);
            const d = Hex.distance(p.q, p.r, charge.q, charge.r);
            return -Math.abs(d - 1) * 2 - this.exposure(p, enemies) * 0.01;
          });
        } else if (sc.hold && sc.hold(g, u)) {
          // scenario asks this ship to hold (e.g. sheltered on the east coast until a target appears)
        } else if (enemies.some((e) => UNIT_TYPES[e.type].domain !== 'land')) {
          const prey = enemies.filter((e) => UNIT_TYPES[e.type].domain === 'sea');
          if (prey.length && ut.sea) {
            await this.moveBy(u, side, ctx, (k) => {
              const p = Hex.parse(k);
              let dmin = 99;
              for (const e of prey) dmin = Math.min(dmin, Hex.distance(p.q, p.r, e.q, e.r));
              return -Math.abs(dmin - (ut.sea.range - 1)) - this.exposure(p, enemies) * 0.05;
            });
          }
        }
        await this.strike(u, side, ctx, false);
      }
    },

    // Ground units stranded on a landmass with nothing to do head for a port to be picked up.
    landGoal(u, side) {
      const g = G();
      const t = g.tile(u.q, u.r);
      if (FIXED_ROLES.includes(u.type) || t.home !== side) return null;
      if (!g.unitsOf(side).some((s) => s.cargo)) return null;
      const ports = g.map.cities.filter((c) => c.city.port && c.city.owner === side && c.mass === t.mass);
      if (!ports.length) return null;
      if (t.city && t.city.port) return { mode: 'hold' };
      if (Hex.neighbors(t.q, t.r).some((n) => { const x = g.tile(n.q, n.r); return x && g.isSea(x); })) return { mode: 'hold' };
      let best = null;
      for (const c of ports) {
        const d = Hex.distance(c.q, c.r, u.q, u.r);
        if (!best || d < best.d) best = { d, c };
      }
      return { mode: 'advance', key: best.c.key };
    },
  };

  WG.AI.Naval = Naval;
  WG.AI.planners.push({ act: (plan, ctx) => Naval.act(plan, ctx) });
})(window.WG);
