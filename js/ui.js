'use strict';

(function (WG) {
  const { Hex, Game, Render, AI, Symbols, UNIT_TYPES, TERRAIN } = WG;
  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cap = Game.cap;
  const SPEEDS = { normal: 1, fast: 0.22, instant: 0 };
  let speed = (() => { try { return localStorage.getItem('hexcommand.speed') || 'fast'; } catch (e) { return 'fast'; } })();
  const k = () => (SPEEDS[speed] === undefined ? 0.35 : SPEEDS[speed]);
  const ms = (n) => Math.round(n * k());
  const wait = (n) => (k() ? sleep(ms(n)) : Promise.resolve());
  // Only animate what is inside the current view.
  const onScreen = (...ts) => ts.some((t) => t && t.x >= view.x - 40 && t.x <= view.x + view.w + 40 && t.y >= view.y - 40 && t.y <= view.y + view.h + 40);

  let svg;
  let sel = null, selReach = null, dests = new Set(), zocKeys = new Set(), targets = new Map();
  let landings = [], embarks = [], cargoPick = 0;
  let hoverTile = null, busy = false, token = 0, modalOpen = false, bannerTimer = null, humanPhase = false;
  let mode = null; // plugin targeting mode: { hint, onHover(tile), onClick(tile), cancel() }
  const view = { x: 0, y: 0, w: 1000, h: 700 };
  const tabs = [];
  const unitActionProviders = [];
  let pluginActions = [];
  let activeTab = 'log';

  // ---------- perspective
  function viewer() {
    const s = Game.state;
    const hb = Game.humanFactions('blue').length, hr = Game.humanFactions('red').length;
    if (hb && hr) return s.side;
    if (hb) return 'blue';
    if (hr) return 'red';
    return null;
  }
  function knownFor(v) { return v && Game.state.fog ? Game.intel(v) : null; }
  function isVisibleTo(u, v, known) { return !known || u.side === v || known.has(u.id); }
  function humanTurn() {
    const s = Game.state;
    return !!s && !s.over && humanPhase && Game.humanFactions(s.side).length > 0 && !busy && !modalOpen;
  }
  function controllable(u) { return u && u.side === Game.state.side && Game.isHuman(u) && !u.carrier; }

  // ---------- view / camera
  function applyView() { svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); }
  function aspect() { return svg.clientHeight / Math.max(1, svg.clientWidth); }
  function scale() { return svg.clientWidth / view.w; }
  function clientToMap(cx, cy) {
    const r = svg.getBoundingClientRect();
    return { x: view.x + ((cx - r.left) / r.width) * view.w, y: view.y + ((cy - r.top) / r.height) * view.h };
  }
  function tileAtClient(cx, cy) {
    if (!Game.map) return null;
    const p = clientToMap(cx, cy);
    const h = Hex.fromPixel(p.x, p.y);
    return Game.map.tiles.get(Hex.key(h.q, h.r)) || null;
  }
  function clampView() {
    const b = Render.bounds;
    if (!b) return;
    const m = Hex.SIZE * 2;
    const clamp1 = (v, lo, size, span) => (span > size + 2 * m ? lo + size / 2 - span / 2 : Math.min(Math.max(v, lo - m), lo + size - span + m));
    view.x = clamp1(view.x, b.x, b.w, view.w);
    view.y = clamp1(view.y, b.y, b.h, view.h);
  }
  function zoomAt(factor, cx, cy) {
    const b = Render.bounds;
    if (!b) return;
    const minW = svg.clientWidth / 2.4;
    const maxW = Math.max(b.w, b.h / aspect()) * 1.25;
    const nw = Math.min(maxW, Math.max(minW, view.w * factor));
    const p = clientToMap(cx, cy);
    const k = nw / view.w;
    view.x = p.x - (p.x - view.x) * k;
    view.y = p.y - (p.y - view.y) * k;
    view.w = nw;
    view.h = nw * aspect();
    clampView();
    applyView();
  }
  function zoomCenter(factor) {
    const r = svg.getBoundingClientRect();
    zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  }
  function fitMap() {
    const b = Render.bounds;
    if (!b) return;
    view.w = Math.max(b.w, b.h / aspect()) * 1.02;
    view.h = view.w * aspect();
    view.x = b.x + b.w / 2 - view.w / 2;
    view.y = b.y + b.h / 2 - view.h / 2;
    applyView();
  }
  function centerOn(t, force) {
    const m = Hex.SIZE * 1.5;
    if (!force && t.x > view.x + m && t.x < view.x + view.w - m && t.y > view.y + m && t.y < view.y + view.h - m) return;
    view.x = t.x - view.w / 2;
    view.y = t.y - view.h / 2;
    clampView();
    applyView();
  }
  function initialView() {
    fitMap();
    const sc = Game.scenario;
    const v = viewer();
    const focus = sc.initialFocus ? sc.initialFocus(Game, v) : null;
    if (scale() < 0.6) {
      view.w = svg.clientWidth / (focus && focus.scale ? focus.scale : 0.8);
      view.h = view.w * aspect();
      if (focus) {
        centerOn(Hex.toPixel(focus.q, focus.r), true);
      } else {
        const units = v ? Game.unitsOf(v) : Game.state.units;
        const capital = v && Game.map.cities.find((c) => c.city.capital && c.city.owner === v);
        const avg = units.reduce((s, u) => s + Hex.toPixel(u.q, u.r).x, 0) / Math.max(1, units.length);
        const cx = capital ? (capital.x + avg) / 2 : Render.bounds.x + Render.bounds.w / 2;
        centerOn({ x: cx, y: Render.bounds.y + Render.bounds.h / 2 }, true);
      }
    }
  }

  // ---------- refresh
  function isSpent(u) {
    if (!controllable(u)) return false;
    if (u.mpLeft > 0) return false;
    if (u.cargo && u.cargo.some((id) => { const c = Game.byId(id); return c && !c.moved; })) return false;
    return !Game.canAttack(u) || !Game.targets(u, Game.intel(u.side)).length;
  }

  // Map layer: units, fog, towns and marks. Cheap enough to run on every step.
  function refreshMap() {
    const v = viewer();
    const known = knownFor(v);
    Render.syncUnits(Game.state.units, {
      isVisible: (u) => isVisibleTo(u, v, known),
      isSpent,
      selectedId: sel && sel.id,
    });
    Render.updateFog(v && Game.state.fog ? Game.visibleTiles(v) : null);
  }

  // Everything else is batched into one repaint per animation frame.
  let panelsPending = false;
  function refreshPanels() {
    panelsPending = false;
    if (!Game.state) return;
    Render.drawCities(Game.map);
    Render.drawMarks(Game.state, viewer());
    for (const t of tabs) if (t.onRefresh) t.onRefresh();
    updateTopbar();
    updatePanels();
    updateButtons();
    renderTab();
  }

  function refresh() {
    refreshMap();
    if (!panelsPending) {
      panelsPending = true;
      requestAnimationFrame(refreshPanels);
    }
  }

  function updateTopbar() {
    const s = Game.state;
    const humans = Game.humanFactions(s.side);
    const who = humans.length ? humans.map((f) => Game.scenario.factions[f].name).join(', ') : 'AI';
    const inc = Game.income();
    const extra = Game.scenario.statusText ? Game.scenario.statusText(Game) : '';
    $('#turninfo').innerHTML =
      `<span class="turn">Turn <b>${s.turn}</b> / ${s.maxTurns}</span>` +
      `<span class="chip ${s.side}">${esc(Game.sideName(s.side))} · ${esc(who)}</span>${extra}`;
    if (Game.scenario.vpHtml) { $('#vpinfo').innerHTML = Game.scenario.vpHtml(Game); return; }
    $('#vpinfo').innerHTML =
      `<span class="vp blue" title="Victory points (income per turn)">${esc(Game.sideName('blue'))} <b>${s.vp.blue}</b> <small>+${inc.blue}</small></span>` +
      `<span class="vp red" title="Victory points (income per turn)">${esc(Game.sideName('red'))} <b>${s.vp.red}</b> <small>+${inc.red}</small></span>`;
  }

  function updateButtons() {
    const h = humanTurn();
    $('#btn-end').disabled = !h;
    $('#btn-next').disabled = !h;
    $('#btn-undo').disabled = !h || !Game.undo;
  }

  // ---------- sidebar tabs
  function registerTab(t) { tabs.push(t); }
  function renderTabBar() {
    const all = [...tabs, { id: 'log', label: 'Log' }];
    $('#tabbar').innerHTML = all.filter((t) => !t.visible || t.visible())
      .map((t) => `<button data-tab="${t.id}" class="${t.id === activeTab ? 'on' : ''}">${esc(t.label)}</button>`).join('');
    $('#tabbar').querySelectorAll('button').forEach((b) => { b.onclick = () => { activeTab = b.dataset.tab; renderTabBar(); renderTab(); }; });
  }
  function renderTab() {
    const t = tabs.find((x) => x.id === activeTab);
    $('#log').style.display = t ? 'none' : '';
    $('#tabbody').style.display = t ? '' : 'none';
    if (t) t.render($('#tabbody'));
    else updateLog();
  }
  function showTab(id) { activeTab = id; renderTabBar(); renderTab(); }

  function updateLog() {
    const log = Game.state.log;
    const ol = $('#log');
    if (ol._len === log.length && ol._last === log[log.length - 1]) return;
    ol._len = log.length;
    ol._last = log[log.length - 1];
    ol.innerHTML = log.slice(-100).reverse()
      .map((e) => `<li class="${e.side || 'sys'}"><span class="lt">T${e.t}</span>${esc(e.text)}</li>`).join('');
  }

  // ---------- side panels
  function symbolSvg(u, cls = 'usym') {
    return `<svg class="${cls}" viewBox="-32 -31 64 52">${Symbols.build(u.type, u.side, { echelon: u.echelon, country: u.country })}</svg>`;
  }

  function unitCard(u) {
    const ut = UNIT_TYPES[u.type];
    const own = u.side === viewer() || !Game.state.fog;
    const pips = Array.from({ length: ut.steps }, (_, i) => `<i class="${i < u.steps ? 'on' : ''}"></i>`).join('');
    const tags = [];
    if (u.entrenched && ut.domain === 'land') tags.push('<span class="tag dug">Dug in</span>');
    if (ut.domain === 'land' && !u.supplied) tags.push(`<span class="tag bad">Out of supply${u.oos ? ` (${u.oos})` : ''}</span>`);
    if (Game.hqNear(u.side, u.q, u.r, u) && ut.domain === 'land') tags.push('<span class="tag cmd">In command</span>');
    if (ut.emitter) tags.push(u.emitting ? `<span class="tag emit">${ut.emitter === 'jammer' ? 'Jamming' : 'Radar on'}</span>` : '<span class="tag">Emissions off</span>');
    if (own && u.side === Game.state.side) {
      if (u.attacked) tags.push('<span class="tag">Engaged</span>');
      else if (ut.domain === 'land' && (ut.indirect || ut.sea) && u.moved) tags.push('<span class="tag">Moved, cannot fire</span>');
    }
    const t = Game.tile(u.q, u.r);
    const fac = Game.faction(u);
    const stat = (label, val) => `<div><span>${label}</span><b>${val}</b></div>`;
    const stats = [];
    if (ut.atk) stats.push(stat('Attack', `${ut.atk}${ut.range > 1 ? ` <small>r${ut.range}</small>` : ''}`));
    if (ut.sea) stats.push(stat(ut.sea.kind === 'torpedo' ? 'Torpedo' : 'Anti-ship', `${ut.sea.atk} <small>r${ut.sea.range}</small>`));
    if (ut.sea && ut.sea.ammo && own) stats.push(stat('Salvos', `${u.ammo}/${ut.sea.ammo}`));
    if (ut.asw) stats.push(stat('ASW', `${ut.asw.atk} <small>r${ut.asw.range}</small>`));
    if (ut.ad) stats.push(stat('Air def.', `${ut.ad.ad}${ut.ad.bmd ? `/${ut.ad.bmd}` : ''} <small>r${ut.ad.range}</small>`));
    if (ut.jam) stats.push(stat('Jam radius', ut.jam));
    stats.push(stat('Defense', ut.def));
    stats.push(stat('Move', `${own ? `${+u.mpLeft.toFixed(1)}/` : ''}${ut.mp}`));
    stats.push(stat('Vision', ut.vision));
    if (ut.capacity) stats.push(stat('Carries', `${u.cargo.length}/${ut.capacity}`));
    let actions = '';
    if (controllable(u) && humanTurn()) {
      if (ut.emitter) actions += `<button class="act" data-act="emit">${u.emitting ? (ut.emitter === 'jammer' ? 'Stop jamming' : 'Radar off (EMCON)') : ut.emitter === 'jammer' ? 'Start jamming' : 'Radar on'}</button>`;
      for (const s of embarks) actions += `<button class="act" data-act="embark" data-ship="${s.id}">Embark on ${esc(s.name)}</button>`;
      pluginActions = [];
      for (const prov of unitActionProviders) for (const a of prov(u) || []) pluginActions.push(a);
      pluginActions.forEach((a, i) => { actions += `<button class="act" data-act="plugin" data-i="${i}" ${a.disabled ? 'disabled' : ''} title="${esc(a.title || '')}">${esc(a.label)}</button>`; });
    }
    let cargo = '';
    if (u.cargo && u.cargo.length && (own || !Game.state.fog)) {
      cargo = '<div class="cargo-list"><span class="muted small">Aboard:</span>' + u.cargo.map((id, i) => {
        const c = Game.byId(id);
        if (!c) return '';
        const pick = controllable(u) && humanTurn() && !c.moved;
        return `<button class="cargo-item ${i === cargoPick ? 'on' : ''}" data-cargo="${i}" ${pick ? '' : 'disabled'}>${symbolSvg(c, 'usym xs')}${esc(c.name)}${c.moved ? ' <small>(landed)</small>' : ''}</button>`;
      }).join('') + (controllable(u) && humanTurn() ? '<div class="hint">Green hexes: land here. Red: assault landing.</div>' : '') + '</div>';
    }
    return `
      <div class="ucard ${u.side}">
        ${symbolSvg(u)}
        <div class="uinfo">
          <div class="uname">${esc(u.name)}</div>
          <div class="utype">${ut.name} · ${esc(fac.name)}</div>
          <div class="pips" title="Strength ${u.steps}/${ut.steps}">${pips}</div>
        </div>
      </div>
      <div class="stats">${stats.join('')}</div>
      <div class="tags">${tags.join('')}<span class="tag">${esc(Game.terr(t).name)}</span></div>
      ${cargo}
      ${actions ? `<div class="unit-actions">${actions}</div>` : ''}`;
  }

  function fmtRatio(r) { return r >= 1 ? `${r.toFixed(1)} : 1` : `1 : ${(1 / r).toFixed(1)}`; }

  function combatPreview(att, def) {
    const o = Game.odds(att, def);
    const land = o.mode === 'land';
    const cls = land ? (o.ratio >= 2 ? 'good' : o.ratio >= 1.2 ? 'fair' : 'bad') : (o.expDef >= 1.2 ? 'good' : o.expDef >= 0.6 ? 'fair' : 'bad');
    const head = land ? fmtRatio(o.ratio) : `~${o.expDef.toFixed(1)}`;
    const title = land ? `${o.ranged ? 'Bombard' : 'Assault'} ${esc(def.name)}`
      : `${{ missile: 'Missile strike', torpedo: 'Torpedo attack', drone: 'Drone strike', kamikaze: 'Drone boat attack', asw: 'ASW attack' }[o.kind]} on ${esc(def.name)}`;
    return `
      <div class="combat">
        <div class="combat-head"><span class="odds ${cls}">${head}</span><span>${title}</span></div>
        <div class="exp">Expected losses: enemy <b>${o.expDef.toFixed(1)}</b>${land ? ` · yours <b>${o.expAtt.toFixed(1)}</b>` : ''}
          ${o.ranged && land ? '<br><small>Indirect fire: no return fire, no retreat.</small>' : ''}</div>
        <ul class="mods">${o.mods.map((m) => `<li class="${m.good ? 'pos' : 'neg'}">${esc(m.text)}</li>`).join('') || '<li>No modifiers</li>'}</ul>
        <div class="hint">Click to attack</div>
      </div>`;
  }

  function landingPreview(u, ship, def) {
    const o = Game.combatOdds(u, def, { q: ship.q, r: ship.r }, { landing: true });
    const cls = o.ratio >= 2 ? 'good' : o.ratio >= 1.2 ? 'fair' : 'bad';
    return `
      <div class="combat">
        <div class="combat-head"><span class="odds ${cls}">${fmtRatio(o.ratio)}</span><span>Assault landing vs ${esc(def.name)}</span></div>
        <div class="exp">Expected losses: enemy <b>${o.expDef.toFixed(1)}</b> · yours <b>${o.expAtt.toFixed(1)}</b><br><small>If the defenders don't break, your troops stay aboard.</small></div>
        <ul class="mods">${o.mods.map((m) => `<li class="${m.good ? 'pos' : 'neg'}">${esc(m.text)}</li>`).join('')}</ul>
        <div class="hint">Click to storm the beach</div>
      </div>`;
  }

  function hexInfo(t) {
    const terr = Game.terr(t);
    const c = (n) => (isFinite(n) ? n : '—');
    let html = `<div class="hexhead"><b>${esc(terr.name)}</b>${t.road ? ' <span class="tag">Road</span>' : ''}${t.beach ? ' <span class="tag">Landing beach</span>' : ''}
      ${terr.sea ? '' : `<span class="muted">Defense ×${terr.def}</span>`}</div>`;
    if (!terr.sea) html += `<div class="muted small">Move cost: foot ${c(terr.cost.foot)} · tracked ${c(terr.cost.tracked)} · wheeled ${c(terr.cost.wheeled)}${t.road ? ' · road 0.5' : ''}</div>`;
    if (t.region) html += `<div class="muted small">${esc(t.region)}${t.zone && Game.map.zones ? ` · ${esc(Game.map.zones[t.zone].name)}` : ''}</div>`;
    if (t.city) {
      html += `<div class="city-info"><b>${esc(t.city.name)}</b>${t.city.capital ? ' ★ capital' : ''}${t.city.port ? ' ⚓ port' : ''} ·
        <span class="${t.city.owner || ''}">${t.city.owner ? esc(Game.sideName(t.city.owner)) : 'Neutral'}</span>${t.city.vp ? ` · ${t.city.vp} VP/turn` : ''}</div>`;
    }
    if (t.airbase && Game.map.bases) {
      const b = Game.map.bases[t.airbase];
      if (b) html += `<div class="city-info">✈ ${esc(b.name)}</div>`;
    }
    for (const tab of tabs) if (tab.hexInfo) html += tab.hexInfo(t) || '';
    return html;
  }

  function updatePanels() {
    const v = viewer();
    const known = knownFor(v);
    let hoverUnit = null;
    if (hoverTile) {
      const hl = Game.unitAt(hoverTile.q, hoverTile.r, null, 'land');
      const hs = Game.unitAt(hoverTile.q, hoverTile.r, null, 'sea');
      const pickVisible = (u) => (u && isVisibleTo(u, v, known) ? u : null);
      hoverUnit = (sel && targets.has(hs && hs.id) && pickVisible(hs)) || pickVisible(hl) || pickVisible(hs);
    }
    const shown = sel || hoverUnit;
    $('#unitpanel').innerHTML = shown ? unitCard(shown)
      : `<div class="empty">${mode ? esc(mode.hint || '') : humanTurn() ? 'Select one of your units.' : Game.state.over ? 'Game over.' : 'Waiting…'}</div>`;
    bindUnitActions();
    let hex = '';
    if (hoverTile) {
      if (mode && mode.preview) hex += mode.preview(hoverTile) || '';
      const landing = landings.find((l) => l.key === hoverTile.key);
      if (sel && landing && landing.assault && sel.cargo) {
        const u = Game.byId(sel.cargo[cargoPick]);
        if (u) hex += landingPreview(u, sel, landing.def);
      } else if (sel) {
        const tgt = [...targets.values()].find((e) => e.q === hoverTile.q && e.r === hoverTile.r);
        if (tgt) hex += combatPreview(sel, tgt);
      }
      if (hoverUnit && hoverUnit !== sel && !(sel && targets.has(hoverUnit.id))) {
        const ut = UNIT_TYPES[hoverUnit.type];
        hex += `<div class="mini">${symbolSvg(hoverUnit, 'usym sm')}<span>${esc(hoverUnit.name)} <small>${ut.name}</small></span></div>`;
      }
      hex += hexInfo(hoverTile);
    }
    $('#hexpanel').innerHTML = hex || '<div class="empty small">Hover a hex for details.</div>';
  }

  function bindUnitActions() {
    document.querySelectorAll('#unitpanel [data-act]').forEach((b) => {
      b.onclick = () => {
        if (!sel || !humanTurn()) return;
        if (b.dataset.act === 'emit') {
          sel.emitting = !sel.emitting;
          Game.addLog(sel.side, `${sel.name} ${sel.emitting ? 'switches emitters on' : 'goes silent (EMCON)'}`);
          Game.touch();
          Game.save();
          select(sel);
        } else if (b.dataset.act === 'embark') {
          const ship = Game.byId(+b.dataset.ship);
          if (ship) doEmbark(sel, ship);
        } else if (b.dataset.act === 'plugin') {
          const a = pluginActions[+b.dataset.i];
          if (a) a.run(sel);
        }
      };
    });
    document.querySelectorAll('#unitpanel [data-cargo]').forEach((b) => {
      b.onclick = () => { cargoPick = +b.dataset.cargo; computeSel(); drawSel(); updatePanels(); };
    });
  }

  // ---------- selection
  function computeSel() {
    dests = new Set(); zocKeys = new Set(); targets = new Map(); selReach = null; landings = []; embarks = [];
    if (!sel || !Game.alive(sel) || sel.carrier) { sel = null; return; }
    const known = Game.intel(sel.side);
    if (!controllable(sel)) return;
    selReach = Game.reachable(sel, known);
    for (const k of Game.destinations(sel, selReach, known)) {
      dests.add(k);
      if (selReach.get(k).zoc) zocKeys.add(k);
    }
    if (Game.canAttack(sel)) for (const e of Game.targets(sel, known)) targets.set(e.id, e);
    embarks = Game.embarkOptions(sel);
    if (sel.cargo && sel.cargo.length) {
      if (cargoPick >= sel.cargo.length) cargoPick = 0;
      let u = Game.byId(sel.cargo[cargoPick]);
      if (u && u.moved) {
        const i = sel.cargo.findIndex((id) => { const c = Game.byId(id); return c && !c.moved; });
        if (i >= 0) { cargoPick = i; u = Game.byId(sel.cargo[i]); }
      }
      if (u) landings = Game.landingOptions(sel, u, known);
    }
  }
  function drawSel() {
    const circles = [];
    if (sel) {
      const ut = UNIT_TYPES[sel.type];
      const k = Hex.key(sel.q, sel.r);
      if (ut.ad && (sel.emitting || !ut.emitter)) circles.push({ key: k, r: ut.ad.range, cls: 'ad' });
      if (ut.jam && sel.emitting) circles.push({ key: k, r: ut.jam, cls: 'jam' });
      if (ut.sea && ut.sea.range > 1 && controllable(sel)) circles.push({ key: k, r: ut.sea.range, cls: 'wpn' });
      else if (ut.range > 1 && controllable(sel)) circles.push({ key: k, r: ut.range, cls: 'wpn' });
    }
    Render.drawOverlay({ sel, dests, zoc: zocKeys, targets: [...targets.values()], landings, embarks, circles });
  }
  function select(u) {
    if (u !== sel) cargoPick = 0;
    sel = u;
    computeSel();
    drawSel();
    Render.drawPath(null);
    refresh();
  }
  function deselect() {
    sel = null;
    computeSel();
    Render.drawOverlay({ sel: null });
    Render.drawPath(null);
  }

  // ---------- actions (shared by humans and AI)
  async function moveUnit(u, key) {
    const v = viewer();
    const trail = [];
    let seen = false;
    const res = await Game.executeMove(u, key, async (mu, from, to) => {
      const known = knownFor(v);
      const vis = isVisibleTo(mu, v, known) || (known && Game.visibleTiles(v).has(from.key) && Game.type(mu).domain !== 'sub');
      if (!trail.length) trail.push(from);
      trail.push(to);
      if (vis) seen = true;
      if (vis && speed === 'normal' && onScreen(from, to)) {
        Render.showUnit(mu);
        await Render.animateMove(mu, from, to, 120);
        refreshMap();
      }
    });
    // Faster modes: one quick glide along the whole path.
    if (seen && speed !== 'normal' && k() && Game.alive(u) && onScreen(...trail)) {
      Render.showUnit(u);
      await Render.animatePath(u, trail, Math.min(ms(900), ms(110) * (trail.length - 1)));
    }
    if (res && res.contact && res.halted && u.side === v) setBanner('Contact! Movement halted.', 2200);
    Game.save();
    refresh();
    return res;
  }

  function showCombatFx(att, def, res, aT, dT) {
    Render.flash(dT);
    const lost = UNIT_TYPES[def.type].domain === 'land' ? 'Destroyed' : 'Sunk';
    Render.floatText(dT, res.defKilled ? lost : res.defLoss ? `−${res.defLoss}` : 'No effect', '#ffdf5c');
    if (res.attLoss) Render.floatText(aT, res.attKilled ? 'Destroyed' : `−${res.attLoss}`, '#ff8a80');
  }

  async function attack(att, def) {
    const v = viewer();
    const known = knownFor(v);
    const aT = Game.tile(att.q, att.r), dT = Game.tile(def.q, def.r);
    const show = (isVisibleTo(att, v, known) || isVisibleTo(def, v, known)) && onScreen(aT, dT);
    const mode = Game.attackMode(att, def);
    const ranged = mode !== 'land' || Game.combatOdds(att, def).ranged;
    if (show) {
      Render.showUnit(att);
      if (k()) {
        if (ranged) await Render.tracer(aT, dT, ms(380), mode === 'land' ? 'tracer' : 'tracer missile');
        else await Render.lunge(att, aT, dT, ms(260));
      }
    }
    const res = Game.resolveAttack(att, def);
    if (show || def.side === v) await showCombatFx(att, def, res, aT, dT);
    if (res.retreat) await Render.animateMove(def, res.retreat.from, res.retreat.to, ms(220));
    if (res.advance) { await wait(120); await Render.animateMove(att, res.advance.from, res.advance.to, ms(220)); }
    Game.save();
    refresh();
    if (show) await wait(380);
    return res;
  }

  async function land(u, ship, key) {
    const t = Game.map.tiles.get(key);
    const def = Game.unitAt(t.q, t.r, null, 'land');
    const v = viewer();
    const show = !knownFor(v) || u.side === v || knownFor(v).has(ship.id);
    if (def && def.side !== u.side) {
      const from = Game.tile(ship.q, ship.r);
      Game.reveal(def, u.side);
      if (show && k()) await Render.tracer(from, t, ms(300));
      const res = Game.resolveLanding(u, ship, def);
      if (show || def.side === v) await showCombatFx(u, def, res, from, t);
      if (res.retreat) await Render.animateMove(def, res.retreat.from, res.retreat.to, ms(220));
      Game.save();
      refresh();
      if (show) await wait(380);
      return res;
    }
    Game.disembark(u, ship, t);
    Game.save();
    refresh();
    if (show) {
      Render.showUnit(u);
      await Render.animateMove(u, Game.tile(ship.q, ship.r), t, ms(260));
    }
    refresh();
    return { landed: true };
  }

  function doEmbark(u, ship) {
    if (!humanTurn()) return;
    Game.doEmbark(u, ship);
    Game.save();
    select(ship);
  }

  // Visual effect for off-map fire (missiles, aircraft) arriving at a tile.
  async function fx(from, to, kind) {
    const v = viewer();
    if (!to) return;
    const seen = !v || !Game.state.fog || Game.visibleTiles(v).has(to.key) || Game.state.side === v;
    if (!seen || !k() || !onScreen(to)) return;
    const origin = from || { x: to.x + (Game.state.side === 'red' ? -520 : 520), y: to.y - 380 };
    await Render.tracer(origin, to, ms(420), kind === 'missile' ? 'tracer missile' : 'tracer air');
    Render.flash(to);
  }

  async function airAssault(u, key) {
    const t = Game.map.tiles.get(key);
    const from = Game.tile(u.q, u.r);
    await fx(from, t, 'air');
    const res = WG.Air.doAirAssault(u, key);
    Game.save();
    refresh();
    if (res.loss) Render.floatText(res.to || t, `−${res.loss}`, '#ff8a80');
    return res;
  }

  // Actions used by the AI and plugins.
  const actions = { move: moveUnit, attack, land, refresh, sleep, viewer, fx, airAssault };

  // ---------- turn flow
  async function runTurn() {
    const my = token;
    const s = Game.state;
    humanPhase = false;
    deselect();
    refresh();
    if (s.over) { showGameOver(); return; }
    const side = s.side;
    const aiFactions = Game.factionsOf(side).filter((f) => Game.controller(f) === 'ai' && Game.factionActive(f));
    const humans = Game.humanFactions(side);
    if (aiFactions.length) {
      busy = true;
      const names = aiFactions.map((f) => Game.scenario.factions[f].name).join(' & ');
      setBanner(`${names} (AI) ${aiFactions.length > 1 ? 'are' : 'is'} moving…`);
      refresh();
      await wait(350);
      await AI.takeTurn(side, aiFactions, { alive: () => my === token && !Game.state.over, ...actions });
      if (my !== token) return;
      busy = false;
      setBanner('');
      if (Game.state.over) { refresh(); showGameOver(); return; }
    }
    if (!humans.length) { endTurn(); return; }
    const hotseat = Game.humanFactions('blue').length && Game.humanFactions('red').length;
    if (hotseat && s.fog) await handoff(side);
    if (my !== token) return;
    humanPhase = true;
    refresh();
    setBanner(`${Game.sideName(side)} to move — turn ${s.turn}`, 1800);
  }

  function endTurn() {
    if (Game.state.over) return;
    cancelMode();
    deselect();
    Game.endTurn();
    Game.save();
    refresh();
    runTurn();
  }

  function setBanner(text, ms) {
    const b = $('#banner');
    clearTimeout(bannerTimer);
    b.textContent = text;
    b.classList.toggle('show', !!text);
    if (text && ms) bannerTimer = setTimeout(() => b.classList.remove('show'), ms);
  }

  // ---------- plugin targeting modes
  function setMode(m) {
    cancelMode();
    mode = m;
    deselect();
    svg.classList.toggle('targeting', !!m);
    if (m && m.hint) setBanner(m.hint);
    refresh();
  }
  function cancelMode() {
    if (!mode) return;
    const m = mode;
    mode = null;
    svg.classList.remove('targeting');
    Render.drawZones([]);
    setBanner('');
    if (m.cancel) m.cancel();
  }

  // ---------- input handlers
  async function onClick(t) {
    if (!t) return;
    if (mode) {
      if (!humanTurn()) return;
      busy = true;
      const m = mode;
      const done = await m.onClick(t);
      busy = false;
      if (done !== false && mode === m) cancelMode();
      refresh();
      return;
    }
    if (!humanTurn()) return;
    const landU = Game.unitAt(t.q, t.r, null, 'land');
    const seaU = Game.unitAt(t.q, t.r, null, 'sea');
    // Attack
    if (sel) {
      const tgt = [...targets.values()].find((e) => e.q === t.q && e.r === t.r);
      if (tgt) {
        busy = true;
        const att = sel;
        await attack(att, tgt);
        busy = false;
        if (Game.state.over) { showGameOver(); return; }
        if (Game.alive(att)) select(att); else deselect();
        refresh();
        return;
      }
      const landing = landings.find((l) => l.key === t.key);
      if (landing && sel.cargo) {
        busy = true;
        const ship = sel;
        const u = Game.byId(ship.cargo[cargoPick]);
        await land(u, ship, t.key);
        busy = false;
        if (Game.state.over) { showGameOver(); return; }
        if (Game.alive(ship)) select(ship); else deselect();
        return;
      }
      if (dests.has(t.key)) {
        busy = true;
        const mover = sel;
        Render.drawOverlay({ sel: null });
        Render.drawPath(null);
        await moveUnit(mover, t.key);
        busy = false;
        if (Game.alive(mover)) select(mover); else deselect();
        return;
      }
      const ship = embarks.find((s) => s.q === t.q && s.r === t.r);
      if (ship) { doEmbark(sel, ship); return; }
    }
    // Selection, cycling through stacked own units.
    const mine = [landU, seaU].filter(controllable);
    if (mine.length) {
      const i = mine.indexOf(sel);
      select(i === -1 ? mine[0] : mine[i + 1] || null);
      return;
    }
    deselect();
    refresh();
  }

  function onHover(t) {
    if (t === hoverTile || !Game.state) return;
    hoverTile = t;
    Render.setHover(t);
    if (mode && mode.onHover) mode.onHover(t);
    if (sel && t && dests.has(t.key) && humanTurn()) {
      const keys = [Hex.key(sel.q, sel.r), ...Game.pathTo(selReach, t.key)];
      Render.drawPath(keys.map((k) => Game.map.tiles.get(k)), selReach.get(t.key).cost);
    } else {
      Render.drawPath(null);
    }
    updatePanels();
  }

  function nextUnit() {
    if (!humanTurn()) return;
    const side = Game.state.side;
    const known = Game.intel(side);
    const ready = Game.unitsOf(side).filter((u) => controllable(u) &&
      (u.mpLeft > 0 || (Game.canAttack(u) && Game.targets(u, known).length) ||
        (u.cargo && u.cargo.some((id) => { const c = Game.byId(id); return c && !c.moved; }))));
    if (!ready.length) { setBanner('All units have acted. End your turn.', 1800); return; }
    const u = (sel && ready.find((x) => x.id > sel.id)) || ready[0];
    select(u);
    centerOn(Game.tile(u.q, u.r));
  }

  function undo() {
    if (!humanTurn() || !Game.undo) return;
    const u = Game.applyUndo();
    Game.save();
    if (u) select(u); else refresh();
  }

  function bindInput() {
    const pointers = new Map();
    let drag = null, pinch = null;

    svg.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      svg.setPointerCapture(e.pointerId);
      if (pointers.size === 1) {
        drag = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, button: e.button };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: view.w };
        drag = null;
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((pinch.w * (pinch.d / d)) / view.w, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; svg.classList.add('dragging'); }
        if (drag.moved) {
          const k = view.w / svg.clientWidth;
          view.x = drag.vx - dx * k;
          view.y = drag.vy - dy * k;
          clampView();
          applyView();
        }
        return;
      }
      if (e.pointerType === 'mouse') onHover(tileAtClient(e.clientX, e.clientY));
    });
    const up = (e) => {
      const wasDrag = drag;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) { drag = null; svg.classList.remove('dragging'); }
      if (e.type === 'pointerup' && wasDrag && !wasDrag.moved && wasDrag.button === 0) {
        const t = tileAtClient(e.clientX, e.clientY);
        if (e.pointerType !== 'mouse') onHover(t);
        onClick(t);
      }
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('pointerleave', () => onHover(null));
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(Math.pow(1.0015, e.deltaY), e.clientX, e.clientY);
    }, { passive: false });
    svg.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (mode) { cancelMode(); refresh(); return; }
      if (humanTurn()) { deselect(); refresh(); }
    });

    window.addEventListener('resize', () => {
      const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
      view.h = view.w * aspect();
      view.x = cx - view.w / 2;
      view.y = cy - view.h / 2;
      applyView();
    });

    window.addEventListener('keydown', (e) => {
      if (e.target.matches('input, select, textarea')) return;
      if (modalOpen) {
        if (e.key === 'Escape' && Game.state && !$('#modal').dataset.locked) closeModal();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'escape') { if (mode) cancelMode(); deselect(); refresh(); }
      else if (k === 'e') endTurnClicked();
      else if (k === 'n' || k === ' ') { e.preventDefault(); nextUnit(); }
      else if (k === 'u' || (k === 'z' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); undo(); }
      else if (k === '+' || k === '=') zoomCenter(1 / 1.25);
      else if (k === '-') zoomCenter(1.25);
      else if (k === 'f') fitMap();
      else if (k === 'h' || k === '?') showHelp();
    });

    $('#btn-end').addEventListener('click', endTurnClicked);
    $('#btn-next').addEventListener('click', nextUnit);
    $('#btn-undo').addEventListener('click', undo);
    $('#btn-menu').addEventListener('click', () => showMenu());
    $('#btn-help').addEventListener('click', showHelp);
    $('#zoom-in').addEventListener('click', () => zoomCenter(1 / 1.25));
    $('#zoom-out').addEventListener('click', () => zoomCenter(1.25));
    $('#zoom-fit').addEventListener('click', fitMap);
  }

  function endTurnClicked() {
    if (!humanTurn()) return;
    const side = Game.state.side;
    const known = Game.intel(side);
    const mine = Game.unitsOf(side).filter(controllable);
    const idle = mine.filter((u) => !u.moved && !u.attacked && UNIT_TYPES[u.type].domain === 'land').length;
    const canHit = mine.some((u) => Game.canAttack(u) && Game.targets(u, known).length);
    const btn = $('#btn-end');
    if (canHit && !btn.dataset.confirm) {
      btn.dataset.confirm = '1';
      btn.textContent = 'Confirm end turn';
      setBanner(`Some units can still attack${idle ? ` (${idle} idle ground units will dig in)` : ''}. Click again to end the turn.`, 2500);
      setTimeout(() => { delete btn.dataset.confirm; btn.textContent = 'End turn'; }, 2500);
      return;
    }
    delete btn.dataset.confirm;
    btn.textContent = 'End turn';
    endTurn();
  }

  // ---------- modals
  function showModal(html, bind, locked) {
    modalOpen = true;
    const m = $('#modal');
    if (locked) m.dataset.locked = '1'; else delete m.dataset.locked;
    $('#modal-box').innerHTML = html;
    m.classList.remove('hidden');
    if (bind) bind();
    updateButtons();
  }
  function closeModal() {
    modalOpen = false;
    $('#modal').classList.add('hidden');
    updateButtons();
    if (Game.state) updatePanels();
  }

  function scenarioForm(sc) {
    const seed = Math.floor(Math.random() * 1e6);
    const opts = (sc.options || []).map((o) => {
      if (o.type === 'seed') {
        return `<label>${esc(o.label)}<span class="row"><input data-opt="${o.id}" inputmode="numeric" value="${seed}"><button type="button" class="reroll" title="Random seed">⟳</button></span></label>`;
      }
      return `<label>${esc(o.label)}<select data-opt="${o.id}">${o.choices.map(([v, l]) => `<option value="${v}" ${v === o.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    }).join('');
    return `
      <label>Play as<select id="f-role">${sc.roles.map((r) => `<option value="${r.id}">${esc(r.label)}</option>`).join('')}</select></label>
      ${opts}
      <label class="check"><input type="checkbox" id="f-fog" checked> Fog of war</label>`;
  }

  function showMenu() {
    const inGame = !!Game.state && !Game.state.over;
    const hasSave = !Game.state && Game.hasSave();
    const list = Object.values(WG.SCENARIOS);
    let current = list.find((s) => s.id === 'taiwan') || list[0];
    showModal(`
      <h2 class="title">HEX COMMAND</h2>
      <p class="sub">Operational hex wargame with NATO symbology. Runs entirely in your browser.</p>
      <div class="scen-list">${list.map((s) => `<button class="scen ${s === current ? 'on' : ''}" data-scen="${s.id}"><b>${esc(s.name)}</b><span>${esc(s.description)}</span></button>`).join('')}</div>
      <div class="form" id="f-form">${scenarioForm(current)}</div>
      <label class="speed">Animation speed <select id="f-speed">${Object.keys(SPEEDS).map((x) => `<option value="${x}" ${x === speed ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select></label>
      <div class="btns">
        ${inGame ? '<button id="f-resume">Resume</button>' : ''}
        ${hasSave ? '<button id="f-continue">Continue saved game</button>' : ''}
        <button id="f-start" class="primary">Start new game</button>
      </div>`, () => {
      const bindForm = () => {
        document.querySelectorAll('.reroll').forEach((b) => {
          b.onclick = () => { b.parentElement.querySelector('input').value = Math.floor(Math.random() * 1e6); };
        });
      };
      bindForm();
      document.querySelectorAll('.scen').forEach((b) => {
        b.onclick = () => {
          current = WG.SCENARIOS[b.dataset.scen];
          document.querySelectorAll('.scen').forEach((x) => x.classList.toggle('on', x === b));
          $('#f-form').innerHTML = scenarioForm(current);
          bindForm();
        };
      });
      $('#f-speed').onchange = (e) => {
        speed = e.target.value;
        try { localStorage.setItem('hexcommand.speed', speed); } catch (err) { /* ignore */ }
      };
      if (inGame) $('#f-resume').onclick = closeModal;
      if (hasSave) $('#f-continue').onclick = () => { closeModal(); continueGame(); };
      $('#f-start').onclick = () => {
        const role = current.roles.find((r) => r.id === $('#f-role').value);
        const options = {};
        document.querySelectorAll('[data-opt]').forEach((i) => {
          options[i.dataset.opt] = i.tagName === 'INPUT' ? Math.abs(parseInt(i.value, 10)) || Math.floor(Math.random() * 1e6) : i.value;
        });
        const fog = $('#f-fog').checked;
        closeModal();
        startGame({ scenario: current.id, controllers: role.controllers, fog, options });
      };
    }, !inGame);
  }

  function showHelp() {
    const sym = (type, side) => `<svg class="usym sm" viewBox="-32 -31 64 52">${Symbols.build(type, side)}</svg>`;
    const sc = Game.scenario;
    const types = sc && sc.unitTypes ? sc.unitTypes : Object.keys(UNIT_TYPES).filter((k) => UNIT_TYPES[k].domain === 'land' && WG.ORBAT.includes(k));
    const rows = types.map((k) => {
      const t = UNIT_TYPES[k];
      const atk = [t.atk ? `${t.atk}${t.range > 1 ? `/r${t.range}` : ''}` : '', t.sea ? `ship ${t.sea.atk}/r${t.sea.range}` : '', t.ad ? `AD ${t.ad.ad}` : ''].filter(Boolean).join(', ') || '—';
      return `<tr><td>${sym(k, 'blue')}${sym(k, 'red')}</td><td><b>${t.name}</b></td><td>${atk}</td><td>${t.def}</td><td>${t.mp}</td><td>${t.move}</td></tr>`;
    }).join('');
    const terr = Object.values(TERRAIN).filter((t) => !t.sea).map((t) => {
      const c = (n) => (isFinite(n) ? n : '—');
      return `<tr><td><i class="sw" style="background:${t.color}"></i>${t.name}</td><td>×${t.def}</td><td>${c(t.cost.foot)} / ${c(t.cost.tracked)} / ${c(t.cost.wheeled)}</td></tr>`;
    }).join('');
    const extra = (sc && sc.helpHtml) ? sc.helpHtml(Game) : '';
    const tabHelp = tabs.map((t) => (t.helpHtml ? t.helpHtml() : '')).join('');
    showModal(`
      <h2>How to play</h2>
      <div class="help">
        ${extra || `<p><b>Goal:</b> at the end of every turn each side scores the VP of every town it holds (capitals ★ are worth 5).
        Most VP after the last turn wins; destroying the whole enemy force wins immediately.</p>`}
        <h3>Controls</h3>
        <ul>
          <li><b>Click</b> a unit to select it; highlighted hexes show where it can move, red outlines show targets. Click again to cycle through a land and naval unit sharing a hex.</li>
          <li><b>Click</b> a highlighted hex to move, or a red-outlined enemy to attack (hover first for the odds).</li>
          <li><b>Drag</b> to pan, <b>wheel</b>/pinch to zoom. <b>Right-click</b>/Esc deselects.</li>
          <li>Keys: <kbd>N</kbd>/<kbd>Space</kbd> next unit · <kbd>U</kbd> undo move · <kbd>E</kbd> end turn · <kbd>F</kbd> fit map · <kbd>+</kbd>/<kbd>−</kbd> zoom</li>
        </ul>
        <h3>Ground combat</h3>
        <ul>
          <li><b>Zones of control:</b> moving next to an enemy unit ends movement.</li>
          <li><b>One attack per unit per turn.</b> Attacking ends the unit's movement. Artillery, rockets and missile batteries cannot fire after moving.</li>
          <li><b>Combat odds</b> compare attack vs defense, scaled by strength. Terrain, digging in, flanking (+15% per other friendly unit adjacent to the target), HQ command (+20% within 3 hexes), supply and anti-armor bonuses all apply.</li>
          <li>Beaten defenders may <b>retreat</b>; a unit with nowhere to go loses an extra step. Victorious attackers advance into the vacated hex.</li>
          <li>Units that don't move during their turn <b>dig in</b> (+30% defense).</li>
          <li><b>Supply:</b> ground units must trace a path of up to 8 hexes to a supply source, not through enemy zones of control. Out of supply units attack at half strength and start losing strength after 3 turns (red ! badge).</li>
          <li><b>Fog of war:</b> you only see enemies near your units and towns. Forest and towns conceal units at range. Moving into contact halts movement.</li>
        </ul>
        ${tabHelp}
        <h3>Units</h3>
        <table class="tbl"><tr><th>Symbol</th><th>Type</th><th>Attack</th><th>Def</th><th>MP</th><th>Mobility</th></tr>${rows}</table>
        <p class="small muted">Blue uses the NATO friendly frames (rectangle on land, circle at sea), Red the hostile frame (diamond). Submarines use the half-frame below the waterline. Marks above the frame show echelon: II battalion, III regiment, X brigade. Bars below show remaining strength.</p>
        <h3>Terrain</h3>
        <table class="tbl"><tr><th>Terrain</th><th>Defense</th><th>Move foot / tracked / wheeled</th></tr>${terr}</table>
      </div>
      <div class="btns"><button id="h-close" class="primary">Close</button></div>`,
    () => { $('#h-close').onclick = () => (Game.state ? closeModal() : showMenu()); });
  }

  function handoff(side) {
    return new Promise((resolve) => {
      $('#mapwrap').classList.add('blind');
      showModal(`
        <h2>${esc(Game.sideName(side))} commander</h2>
        <p>Pass the device to the <b class="${side}">${esc(Game.sideName(side))}</b> player, then continue.</p>
        <div class="btns"><button id="h-go" class="primary">Continue as ${esc(Game.sideName(side))}</button></div>`, () => {
        $('#h-go').onclick = () => {
          $('#mapwrap').classList.remove('blind');
          closeModal();
          resolve();
        };
      }, true);
    });
  }

  function showGameOver() {
    const s = Game.state;
    const sc = Game.scenario;
    const title = s.winner === 'draw' ? 'Draw' : `${Game.sideName(s.winner)} victory`;
    const reason = s.reasonText || (s.reason === 'annihilation'
      ? 'The opposing force has been destroyed.'
      : `After ${s.maxTurns} turns the fighting ends.`);
    const alive = (side) => Game.allUnitsOf(side).length;
    const towns = (side) => Game.map.cities.filter((c) => c.city.owner === side && c.city.vp).length;
    setBanner('');
    const extraRows = sc.resultRows ? sc.resultRows(Game) : '';
    showModal(`
      <h2 class="${s.winner}">${esc(title)}</h2>
      <p>${esc(reason)}</p>
      <table class="tbl result">
        <tr><th></th><th class="blue">${esc(Game.sideName('blue'))}</th><th class="red">${esc(Game.sideName('red'))}</th></tr>
        <tr><td>Victory points</td><td>${s.vp.blue}</td><td>${s.vp.red}</td></tr>
        <tr><td>Objectives held</td><td>${towns('blue')}</td><td>${towns('red')}</td></tr>
        <tr><td>Units remaining</td><td>${alive('blue')}</td><td>${alive('red')}</td></tr>
        <tr><td>Units lost</td><td>${s.lost.blue || 0}</td><td>${s.lost.red || 0}</td></tr>
        ${extraRows}
      </table>
      <div class="btns"><button id="g-view">View map</button><button id="g-new" class="primary">New game</button></div>`, () => {
      $('#g-view').onclick = closeModal;
      $('#g-new').onclick = () => showMenu();
    });
  }

  // ---------- game lifecycle
  function begin() {
    token++;
    busy = false;
    humanPhase = false;
    sel = null;
    hoverTile = null;
    mode = null;
    Render.drawMap(Game.map);
    for (const t of tabs) if (t.onNewGame) t.onNewGame();
    activeTab = tabs.find((t) => !t.visible || t.visible()) ? activeTab : 'log';
    if (!tabs.find((t) => t.id === activeTab && (!t.visible || t.visible()))) activeTab = 'log';
    renderTabBar();
    computeSel();
    initialView();
    refresh();
    runTurn();
  }

  function startGame(opts) {
    Game.newGame(opts);
    Game.save();
    begin();
  }

  function continueGame() {
    if (Game.load()) begin();
    else showMenu();
  }

  function init() {
    svg = $('#map');
    Render.init(svg);
    bindInput();
    renderTabBar();
    showMenu();
  }

  WG.UI = {
    registerTab, showTab, registerUnitAction: (fn) => unitActionProviders.push(fn), select, deselect, controllable,
    showModal, closeModal, setMode, cancelMode, refresh, setBanner, humanTurn, viewer, knownFor, isVisibleTo,
    actions, esc, centerOn, get busy() { return busy; }, set busy(v) { busy = v; },
  };

  window.addEventListener('DOMContentLoaded', init);
})(window.WG);
