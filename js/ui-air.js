'use strict';

// Theater panel: air bases and squadrons, missile strikes, the air picture overlay, and airborne assaults.
(function (WG) {
  const { Hex, AIR_TYPES, Symbols, Render } = WG;
  const UI = () => WG.UI;
  const G = () => WG.Game;
  const A = () => WG.Air;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const other = (s) => (s === 'blue' ? 'red' : 'blue');
  let picture = true;

  const MISSION_BUTTONS = {
    ftr: [['cap', 'CAP'], ['strike', 'Strike']],
    ftr5: [['cap', 'CAP'], ['strike', 'Strike']],
    bomber: [['strike', 'Strike']],
    aew: [['aew', 'AEW']],
    ewac: [['jam', 'Jam'], ['cap', 'CAP']],
    mpa: [['asw', 'ASW patrol']],
    uav: [['isr', 'ISR']],
    tanker: [],
  };
  const MISSION_HELP = {
    cap: 'Combat air patrol: contests control of the zone, fights enemy fighters there and intercepts strikes.',
    strike: 'Attack a detected enemy unit or airbase. Enemy fighters and air defenses over the target shoot back.',
    aew: 'Airborne early warning: ships in this zone and its neighbours become targetable; your fighters there fight 25% better.',
    jam: 'Electronic attack: enemy air defenses and sensors in the zone are degraded; enemy drones and radars lose targeting.',
    asw: 'Anti-submarine patrol: may find and attack enemy submarines in the zone (harder in deep water).',
    isr: 'Drone surveillance: enemy ships and ground units in the open in this zone become targetable.',
  };

  function viewSide() { return UI().viewer() || G().state.side; }
  function mySquadron(q) {
    const g = G();
    return q.side === g.state.side && g.controller(q.faction) === 'human' && UI().humanTurn();
  }
  function sqSymbol(q, cls = 'usym xs') {
    return `<svg class="${cls}" viewBox="-30 -20 60 36">${Symbols.buildAir(q.type, q.side, { country: q.country })}</svg>`;
  }
  function pips(q) {
    const n = AIR_TYPES[q.type].steps;
    return `<span class="pips sm">${Array.from({ length: n }, (_, i) => `<i class="${i < q.steps ? 'on' : ''}"></i>`).join('')}</span>`;
  }
  function missionText(q) {
    const air = A();
    if (!q.mission) return '';
    const z = q.mission.zone ? air.zoneName(q.mission.zone) : '';
    return { cap: `CAP · ${z}`, strike: 'Strike flown', isr: `ISR · ${z}`, aew: `AEW · ${z}`, jam: `Jamming · ${z}`, asw: `ASW · ${z}` }[q.mission.kind] || '';
  }

  // ---------- air picture overlay
  function drawPicture(highlightZone) {
    const g = G(), air = A();
    if (!g.map || !g.map.zones || !air.active()) { Render.drawAirPicture([], '', []); return; }
    if (!picture && !highlightZone) { Render.drawAirPicture([], '', []); return; }
    const v = viewSide();
    const cells = [];
    const labels = [];
    for (const z of Object.values(g.map.zones)) {
      const c = air.control(z.id);
      const cov = air.coverage(v, z.id);
      let cls = c.owner ? 'zc-' + c.owner : '';
      if (z.id === highlightZone) cls += ' zc-hl';
      if (cov.isr || cov.aew) cls += ' zc-isr';
      if (cls.trim()) for (const k of z.keys) cells.push({ key: k, cls });
      const bits = [];
      if (c.blue) bits.push(`▲${Math.round(c.blue)}`);
      if (c.red) bits.push(`▼${Math.round(c.red)}`);
      labels.push({ x: z.x, y: z.y, name: z.name, sub: bits.join('  '), cls: c.owner ? 'zl-' + c.owner : '' });
    }
    Render.drawAirPicture(cells, Render.zoneBorders(g.map), labels);
  }

  function zoneInfo(zone) {
    const air = A();
    const c = air.control(zone);
    const own = { blue: 'Allied', red: 'PRC', contested: 'Contested' }[c.owner] || 'No one';
    const v = viewSide();
    const cov = air.coverage(v, zone);
    return `<div class="combat"><div class="combat-head"><span>${esc(air.zoneName(zone))}</span></div>
      <div class="exp">Air control: <b>${own}</b><br>Fighter strength: Allied ${c.blue.toFixed(1)} · PRC ${c.red.toFixed(1)}
      ${cov.isr || cov.aew ? `<br>Your sensors cover this zone (${[cov.isr ? 'drones' : '', cov.aew ? 'AEW' : ''].filter(Boolean).join(', ')})` : ''}
      ${air.jammed(other(v), zone) ? '<br><span class="neg">Enemy jamming active</span>' : ''}</div></div>`;
  }

  // ---------- missions
  function zoneMission(q, kind) {
    const air = A();
    UI().setMode({
      hint: `${q.name}: click any hex in the zone for the ${kind.toUpperCase()} mission. Right-click to cancel.`,
      onHover(t) { drawPicture(t && t.zone); },
      preview(t) { return t && t.zone ? zoneInfo(t.zone) + `<p class="small muted">${MISSION_HELP[kind]}</p>` : ''; },
      async onClick(t) {
        if (!t || !t.zone) return false;
        if (kind === 'cap') air.flyCap(q, t.zone);
        else air.flySupport(q, t.zone, kind);
        G().save();
        return true;
      },
      cancel() { drawPicture(); },
    });
  }

  function strikeTargets(q) {
    const g = G(), air = A();
    const known = g.intel(q.side);
    const units = g.state.units.filter((e) => e.side !== q.side && air.canStrikeUnit(q, e, known));
    const bases = air.allBases().filter((d) => d.kind === 'hex' && air.owner(d.id) !== q.side);
    return { units, bases };
  }

  function strikeMission(q) {
    const g = G(), air = A();
    const { units, bases } = strikeTargets(q);
    const baseTiles = bases.map((d) => ({ key: d.key, assault: true }));
    UI().setMode({
      hint: `${q.name}: click a highlighted enemy unit or airbase to strike. Right-click to cancel.`,
      onHover() { Render.drawOverlay({ sel: {}, targets: units, landings: baseTiles }); },
      preview(t) {
        const e = units.find((u) => u.q === t.q && u.r === t.r);
        if (e) {
          const o = air.strikeOdds(q, e);
          return `<div class="combat"><div class="combat-head"><span class="odds ${o.exp >= 1.2 ? 'good' : o.exp >= 0.6 ? 'fair' : 'bad'}">~${o.exp.toFixed(1)}</span><span>Air strike on ${esc(e.name)}</span></div>
            <div class="exp">Expected enemy losses ${o.exp.toFixed(1)} steps.<br>Enemy fighters in zone: ${o.capP.toFixed(1)} · air defense: ${o.D.toFixed(1)}${AIR_TYPES[q.type].standoff ? '<br><small>Standoff weapons: launched outside enemy air defenses.</small>' : ''}</div></div>`;
        }
        const b = bases.find((d) => d.key === t.key);
        if (b) return `<div class="combat"><div class="combat-head"><span>Strike ${esc(b.name)}</span></div><div class="exp">Runway: ${air.baseState(b.id)} · squadrons on the ground: ${air.st().squadrons.filter((x) => x.base === b.id && !x.mission).length}</div></div>`;
        return '';
      },
      async onClick(t) {
        const e = units.find((u) => u.q === t.q && u.r === t.r);
        const b = bases.find((d) => d.key === t.key);
        if (!e && !b) return false;
        await UI().actions.fx(null, t, 'air');
        if (e) air.strikeUnit(q, e);
        else air.strikeBaseWithAircraft(q, b.id);
        Render.floatText(t, 'Strike', '#ffdf5c');
        g.save();
        return true;
      },
      cancel() { Render.drawOverlay({ sel: null }); },
    });
    Render.drawOverlay({ sel: {}, targets: units, landings: baseTiles });
  }

  function flyMission(id, kind) {
    const q = A().st().squadrons.find((x) => x.id === id);
    if (!q || !mySquadron(q) || !A().canFly(q)) return;
    if (kind === 'strike') strikeMission(q);
    else zoneMission(q, kind);
  }

  // ---------- missiles
  function missileMission(side, id) {
    const g = G(), air = A();
    const known = g.intel(side);
    const units = g.state.units.filter((e) => e.side !== side && air.missileCanHitUnit(side, id, e, known));
    const bases = air.allBases().filter((d) => d.kind === 'hex' && air.missileCanHitBase(side, id, d));
    const sites = (g.scenario.sensorSites ? g.scenario.sensorSites(g) : []).filter((s) => s.side !== side && !(g.state.sitesDown || {})[s.id]);
    const baseTiles = bases.map((d) => ({ key: d.key, assault: true })).concat(sites.map((s) => ({ key: s.t.key, assault: true })));
    const d = air.missileDef(side, id);
    UI().setMode({
      hint: `${d.name}: click a targetable unit, enemy airbase or radar site. Right-click to cancel.`,
      onHover() { Render.drawOverlay({ sel: {}, targets: units, landings: baseTiles }); },
      preview(t) {
        const e = units.find((u) => u.q === t.q && u.r === t.r);
        if (e) {
          const o = air.missileOdds(side, id, e);
          return `<div class="combat"><div class="combat-head"><span class="odds ${o.exp >= 1.2 ? 'good' : o.exp >= 0.6 ? 'fair' : 'bad'}">~${o.exp.toFixed(1)}</span><span>${esc(d.name)} on ${esc(e.name)}</span></div>
            <div class="exp">Expected losses ${o.exp.toFixed(1)} steps · ${Math.round(o.intercept * 100)}% intercepted</div></div>`;
        }
        const b = bases.find((x) => x.key === t.key);
        if (b) return `<div class="combat"><div class="combat-head"><span>${esc(d.name)} on ${esc(b.name)}</span></div><div class="exp">Runway: ${air.baseState(b.id)}</div></div>`;
        const s = sites.find((x) => x.t.key === t.key);
        if (s) return `<div class="combat"><div class="combat-head"><span>${esc(d.name)} on coastal radar</span></div><div class="exp">Knocking out radars removes their ship tracking.</div></div>`;
        return '';
      },
      async onClick(t) {
        const e = units.find((u) => u.q === t.q && u.r === t.r);
        const b = bases.find((x) => x.key === t.key);
        const s = sites.find((x) => x.t.key === t.key);
        if (!e && !b && !s) return false;
        await UI().actions.fx(null, t, 'missile');
        if (e) air.fireAtUnit(side, id, e);
        else if (b) air.fireAtBase(side, id, b.id);
        else g.scenario.strikeSite(g, side, id, s);
        g.save();
        return true;
      },
      cancel() { Render.drawOverlay({ sel: null }); },
    });
    Render.drawOverlay({ sel: {}, targets: units, landings: baseTiles });
  }

  // ---------- tab rendering
  function renderAir(el) {
    const g = G(), air = A();
    const v = viewSide();
    const pool = air.tankerPool(v), used = air.st().tankerUsed[v] || 0;
    const mine = air.squadronsOf(v);
    const byBase = new Map();
    for (const q of mine) { if (!byBase.has(q.base)) byBase.set(q.base, []); byBase.get(q.base).push(q); }
    let html = `<div class="air-top"><label class="check"><input type="checkbox" id="air-pic" ${picture ? 'checked' : ''}> Air picture on map</label>
      <span class="muted small">Tanker support ${used}/${pool}</span></div>`;
    const bases = [...byBase.keys()].map((id) => air.baseDef(id)).filter(Boolean)
      .sort((a, b) => ['close', 'medium', 'far'].indexOf(a.tier) - ['close', 'medium', 'far'].indexOf(b.tier));
    for (const b of bases) {
      const state = air.baseState(b.id);
      html += `<div class="base"><div class="base-head"><b>${esc(b.name)}</b> <span class="tag">${b.kind === 'carrier' ? 'carrier' : b.tier}</span>
        <span class="tag st-${state}">${state}</span></div>`;
      for (const q of byBase.get(b.id)) {
        const at = AIR_TYPES[q.type];
        const why = air.whyGrounded(q);
        const ctl = mySquadron(q) && air.canFly(q);
        const btns = (MISSION_BUTTONS[q.type] || []).map(([k, l]) =>
          `<button class="msn" data-sq="${q.id}" data-k="${k}" ${ctl ? '' : 'disabled'} title="${esc(MISSION_HELP[k])}">${l}</button>`).join('');
        const status = q.mission ? missionText(q) : at.tanker ? `Provides ${Math.round(at.tanker * air.strength(q))} tanker support` : why || 'Ready';
        html += `<div class="sq">${sqSymbol(q)}<div class="sq-main"><div class="sq-name">${esc(q.name)} ${pips(q)}</div>
          <div class="sq-status ${q.mission ? 'on' : ''}">${esc(status)}</div>
          ${g.controller(q.faction) === 'human' ? `<div class="sq-btns">${btns}</div>` : ''}</div></div>`;
      }
      html += '</div>';
    }
    // Enemy bases we know about.
    const enemy = air.allBases().filter((b) => b.side !== v && b.kind !== 'carrier');
    if (enemy.length) {
      html += '<h4>Enemy air bases</h4><div class="enemy-bases">' + enemy.map((b) =>
        `<div><span>${esc(b.name)}</span><span class="tag st-${air.baseState(b.id)}">${air.baseState(b.id)}</span></div>`).join('') + '</div>';
    }
    el.innerHTML = html;
    el.querySelector('#air-pic').onchange = (e) => { picture = e.target.checked; drawPicture(); };
    el.querySelectorAll('.msn').forEach((b) => { b.onclick = () => flyMission(+b.dataset.sq, b.dataset.k); });
  }

  function renderStrike(el) {
    const g = G(), air = A();
    const v = viewSide();
    const opts = air.missileOptions(v);
    let html = '<p class="small muted">Salvos per turn are limited by launchers. Missiles can hit ships (anti-ship types), air defenses, artillery, missile batteries, headquarters, airbases and radar sites, but only <b>targetable</b> contacts.</p>';
    for (const m of opts) {
      const human = !m.def.faction || g.controller(m.def.faction) === 'human';
      const ctl = human && g.state.side === v && UI().humanTurn() && m.canFire;
      const offmap = air.allBases().filter((b) => b.kind === 'offmap' && air.missileCanHitBase(v, m.id, b));
      html += `<div class="msl"><div class="msl-head"><b>${esc(m.def.name)}</b><span class="muted small">${m.left} left · ${Math.max(0, air.launchesLeft(v, m.id))}/${m.def.perTurn} this turn</span></div>
        <div class="muted small">Power ${m.def.power}${m.def.ballistic ? ' · ballistic' : ' · cruise'}${m.def.antiShip ? ' · anti-ship' : ''} · reach: ${m.def.reach.join(', ')}${m.def.faction ? ` · ${esc(g.scenario.factions[m.def.faction].name)}` : ''}</div>
        ${human ? `<div class="sq-btns"><button class="fire" data-m="${m.id}" ${ctl ? '' : 'disabled'}>Fire at map target</button>
        ${offmap.length ? `<select class="offmap" data-m="${m.id}" ${ctl ? '' : 'disabled'}>${offmap.map((b) => `<option value="${b.id}">${esc(b.name)} (${air.baseState(b.id)})</option>`).join('')}</select><button class="fire-off" data-m="${m.id}" ${ctl ? '' : 'disabled'}>Fire</button>` : ''}</div>` : ''}
      </div>`;
    }
    if (!opts.length) html += '<p class="muted">No missile forces.</p>';
    el.innerHTML = html;
    el.querySelectorAll('.fire').forEach((b) => { b.onclick = () => missileMission(v, b.dataset.m); });
    el.querySelectorAll('.fire-off').forEach((b) => {
      b.onclick = async () => {
        const sel = el.querySelector(`.offmap[data-m="${b.dataset.m}"]`);
        const baseId = sel.value;
        if (g.scenario.confirmStrike && !(await g.scenario.confirmStrike(g, v, air.baseDef(baseId)))) return;
        air.fireAtBase(v, b.dataset.m, baseId);
        g.save();
        UI().refresh();
      };
    });
  }

  // ---------- registration
  WG.UI.registerTab({
    id: 'air', label: 'Air',
    visible: () => A().active(),
    render: renderAir,
    onRefresh: () => { if (A().active()) drawPicture(); },
    onNewGame: () => { picture = true; drawPicture(); },
    helpHtml: () => (A().active() ? `
      <h3>Air power</h3>
      <ul>
        <li>Squadrons sit at <b>bases</b>: airbases on the map, off-map base boxes (close, medium or far from the fight) and carriers. Each flies one mission per turn from the <b>Air</b> tab; missions last until your next turn.</li>
        <li>Bases farther away need <b>tanker support</b> (medium 1, far 2 points; bombers and drones need less). Far-base squadrons rest a turn after flying.</li>
        <li><b>CAP</b> contests an air zone. The side with 1.5× the fighter strength controls it: +20% to its ground attacks there, and its fighters intercept enemy strikes and drones.</li>
        <li><b>Strike</b> hits a detected unit or airbase. <b>AEW</b>, <b>drones (ISR)</b> and <b>jamming</b> shape what each side can see and target. <b>ASW patrols</b> hunt submarines.</li>
        <li>Missile and bomb hits on a base damage its <b>runway</b> (damaged: one sortie per turn; closed: none; repaired a level per turn) and destroy aircraft caught on the ground beyond its hardened shelters.</li>
        <li><b>Airborne</b> units at a friendly airbase can air-assault any empty hex within 16. Enemy air defenses and fighters over the drop zone cause losses in transit.</li>
      </ul>` : ''),
  });
  WG.UI.registerTab({ id: 'strike', label: 'Missiles', visible: () => A().active(), render: renderStrike });
  WG.UI.registerTab({
    id: 'zones', label: '', visible: () => false, render() {},
    hexInfo(t) {
      if (!A().active() || !t.zone) return '';
      const c = A().control(t.zone);
      const own = { blue: 'Allied air control', red: 'PRC air control', contested: 'Contested airspace' }[c.owner];
      return own ? `<div class="muted small">${own}</div>` : '';
    },
  });

  // Airborne assault button on the unit card.
  WG.UI.registerUnitAction((u) => {
    const air = A();
    if (!air.active() || !WG.UNIT_TYPES[u.type].airAssault) return [];
    const opts = air.airAssaultOptions(u);
    if (!opts.length) return [];
    return [{
      label: 'Air assault',
      title: 'Drop anywhere within 16 hexes. Losses depend on enemy air defense and fighters over the drop zone.',
      run(unit) {
        const keys = air.airAssaultOptions(unit);
        UI().setMode({
          hint: `${unit.name}: click a green hex to air-assault. Right-click to cancel.`,
          onHover() { Render.drawOverlay({ sel: {}, landings: keys.map((k) => ({ key: k })) }); },
          preview(t) {
            if (!keys.includes(t.key)) return '';
            const r = air.airAssaultRisk(unit, t.key);
            return `<div class="combat"><div class="combat-head"><span class="odds ${r.exp < 0.5 ? 'good' : r.exp < 1.2 ? 'fair' : 'bad'}">~${r.exp.toFixed(1)}</span><span>Expected losses in transit</span></div>
              <div class="exp">Enemy air defense ${r.D.toFixed(1)} · enemy fighters ${r.cap.toFixed(1)} vs yours ${r.own.toFixed(1)}</div></div>`;
          },
          async onClick(t) {
            if (!keys.includes(t.key)) return false;
            await UI().actions.airAssault(unit, t.key);
            return true;
          },
          cancel() { Render.drawOverlay({ sel: null }); },
        });
        Render.drawOverlay({ sel: {}, landings: keys.map((k) => ({ key: k })) });
      },
    }];
  });
})(window.WG);
