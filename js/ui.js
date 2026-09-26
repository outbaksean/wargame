'use strict';

(function (WG) {
  const { Hex, Game, Render, AI, Symbols, UNIT_TYPES, TERRAIN } = WG;
  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cap = Game.cap;
  const SIZES = { s: [24, 16], m: [32, 22], l: [40, 26] };
  const STEP_MS = 130;

  let svg;
  let sel = null, selReach = null, dests = new Set(), zocKeys = new Set(), targets = new Map();
  let hoverTile = null, busy = false, token = 0, modalOpen = false, bannerTimer = null;
  const view = { x: 0, y: 0, w: 1000, h: 700 };

  // ---------- perspective
  function viewer() {
    const p = Game.state.players;
    if (p.blue === 'human' && p.red === 'human') return Game.state.side;
    if (p.blue === 'human') return 'blue';
    if (p.red === 'human') return 'red';
    return null;
  }
  function knownFor(v) { return v && Game.state.fog ? Game.visibleEnemies(v) : null; }
  function isVisibleTo(u, v, known) { return !known || u.side === v || known.has(u.id); }
  function humanTurn() {
    const s = Game.state;
    return !!s && !s.over && s.players[s.side] === 'human' && !busy && !modalOpen;
  }

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
    if (scale() < 0.7) {
      view.w = svg.clientWidth / 0.8;
      view.h = view.w * aspect();
      const v = viewer();
      const capital = v && Game.map.cities.find((c) => c.city.capital && c.city.owner === v);
      const units = v ? Game.unitsOf(v) : Game.state.units;
      const cx = capital ? (capital.x + units.reduce((s, u) => s + Hex.toPixel(u.q, u.r).x, 0) / units.length) / 2 : Render.bounds.x + Render.bounds.w / 2;
      centerOn({ x: cx, y: Render.bounds.y + Render.bounds.h / 2 }, true);
    }
  }

  // ---------- refresh
  function isSpent(u) {
    const s = Game.state;
    if (u.side !== s.side || s.players[s.side] !== 'human') return false;
    if (u.mpLeft > 0) return false;
    return !Game.canAttack(u) || !Game.targets(u, Game.visibleEnemies(u.side)).length;
  }

  function refresh() {
    const v = viewer();
    const known = knownFor(v);
    Render.syncUnits(Game.state.units, {
      isVisible: (u) => isVisibleTo(u, v, known),
      isSpent,
      selectedId: sel && sel.id,
    });
    Render.updateFog(v && Game.state.fog ? Game.visibleTiles(v) : null);
    Render.drawCities(Game.map);
    updateTopbar();
    updatePanels();
    updateButtons();
    updateLog();
  }

  function updateTopbar() {
    const s = Game.state;
    const who = s.players[s.side] === 'ai' ? 'AI' : 'Human';
    const inc = Game.income();
    $('#turninfo').innerHTML =
      `<span class="turn">Turn <b>${s.turn}</b> / ${s.maxTurns}</span>` +
      `<span class="chip ${s.side}">${cap(s.side)} · ${who}</span>`;
    $('#vpinfo').innerHTML =
      `<span class="vp blue" title="Victory points (income per turn)">Blue <b>${s.vp.blue}</b> <small>+${inc.blue}</small></span>` +
      `<span class="vp red" title="Victory points (income per turn)">Red <b>${s.vp.red}</b> <small>+${inc.red}</small></span>`;
  }

  function updateButtons() {
    const h = humanTurn();
    $('#btn-end').disabled = !h;
    $('#btn-next').disabled = !h;
    $('#btn-undo').disabled = !h || !Game.undo;
  }

  function updateLog() {
    const log = Game.state.log;
    const ol = $('#log');
    if (ol._len === log.length && ol._last === log[log.length - 1]) return;
    ol._len = log.length;
    ol._last = log[log.length - 1];
    ol.innerHTML = log.slice(-80).reverse()
      .map((e) => `<li class="${e.side || 'sys'}"><span class="lt">T${e.t}</span>${esc(e.text)}</li>`).join('');
  }

  // ---------- side panels
  function symbolSvg(u, cls = 'usym') {
    return `<svg class="${cls}" viewBox="-26 -30 52 50">${Symbols.build(u.type, u.side)}</svg>`;
  }

  function unitCard(u) {
    const ut = UNIT_TYPES[u.type];
    const own = u.side === Game.state.side || u.side === viewer();
    const pips = Array.from({ length: ut.steps }, (_, i) => `<i class="${i < u.steps ? 'on' : ''}"></i>`).join('');
    const tags = [];
    if (u.entrenched) tags.push('<span class="tag dug">Dug in</span>');
    if (Game.hqNear(u.side, u.q, u.r, u)) tags.push('<span class="tag cmd">In command</span>');
    if (own && u.side === Game.state.side) {
      if (u.attacked) tags.push(`<span class="tag">${ut.indirect ? 'Fired' : 'Attacked'}</span>`);
      else if (ut.indirect && u.moved) tags.push('<span class="tag">Moved, cannot fire</span>');
    }
    const t = Game.tile(u.q, u.r);
    return `
      <div class="ucard ${u.side}">
        ${symbolSvg(u)}
        <div class="uinfo">
          <div class="uname">${esc(u.name)}</div>
          <div class="utype">${ut.name} · ${cap(u.side)}</div>
          <div class="pips" title="Strength ${u.steps}/${ut.steps}">${pips}</div>
        </div>
      </div>
      <div class="stats">
        <div><span>Attack</span><b>${ut.atk}</b></div>
        <div><span>Defense</span><b>${ut.def}</b></div>
        <div><span>Move</span><b>${own ? `${+u.mpLeft.toFixed(1)}/` : ''}${ut.mp}</b></div>
        <div><span>Range</span><b>${ut.range}</b></div>
        <div><span>Vision</span><b>${ut.vision}</b></div>
        <div><span>Mobility</span><b>${ut.move}</b></div>
      </div>
      <div class="tags">${tags.join('')}<span class="tag">${esc(Game.terr(t).name)}</span></div>`;
  }

  function fmtRatio(r) { return r >= 1 ? `${r.toFixed(1)} : 1` : `1 : ${(1 / r).toFixed(1)}`; }

  function combatPreview(att, def) {
    const o = Game.combatOdds(att, def);
    const cls = o.ratio >= 2 ? 'good' : o.ratio >= 1.2 ? 'fair' : 'bad';
    return `
      <div class="combat">
        <div class="combat-head"><span class="odds ${cls}">${fmtRatio(o.ratio)}</span>
          <span>${o.ranged ? 'Bombard' : 'Assault'} ${esc(def.name)}</span></div>
        <div class="exp">Expected losses: enemy <b>${o.expDef.toFixed(1)}</b> · yours <b>${o.expAtt.toFixed(1)}</b>
          ${o.ranged ? '<br><small>Indirect fire: no return fire, no retreat.</small>' : ''}</div>
        <ul class="mods">${o.mods.map((m) => `<li class="${m.good ? 'pos' : 'neg'}">${esc(m.text)}</li>`).join('') || '<li>No modifiers</li>'}</ul>
        <div class="hint">Click to attack</div>
      </div>`;
  }

  function hexInfo(t) {
    const terr = Game.terr(t);
    const c = (n) => (isFinite(n) ? n : '—');
    let html = `<div class="hexhead"><b>${esc(terr.name)}</b>${t.road ? ' <span class="tag">Road</span>' : ''}
      <span class="muted">Defense ×${terr.def}</span></div>
      <div class="muted small">Move cost: foot ${c(terr.cost.foot)} · tracked ${c(terr.cost.tracked)} · wheeled ${c(terr.cost.wheeled)}${t.road ? ' · road 0.5' : ''}</div>`;
    if (t.city) {
      html += `<div class="city-info"><b>${esc(t.city.name)}</b>${t.city.capital ? ' ★ capital' : ''} ·
        <span class="${t.city.owner || ''}">${t.city.owner ? cap(t.city.owner) : 'Neutral'}</span> · ${t.city.vp} VP/turn</div>`;
    }
    return html;
  }

  function updatePanels() {
    const v = viewer();
    const known = knownFor(v);
    const hu = hoverTile && Game.unitAt(hoverTile.q, hoverTile.r);
    const hoverUnit = hu && isVisibleTo(hu, v, known) ? hu : null;
    const shown = sel || hoverUnit;
    $('#unitpanel').innerHTML = shown ? unitCard(shown)
      : `<div class="empty">${humanTurn() ? 'Select one of your units.' : Game.state.over ? 'Game over.' : 'Waiting…'}</div>`;
    let hex = '';
    if (hoverTile) {
      if (sel && hoverUnit && targets.has(hoverUnit.id)) hex += combatPreview(sel, hoverUnit);
      else if (hoverUnit && hoverUnit !== sel) hex += `<div class="mini">${symbolSvg(hoverUnit, 'usym sm')}<span>${esc(hoverUnit.name)} <small>${UNIT_TYPES[hoverUnit.type].name}</small></span></div>`;
      hex += hexInfo(hoverTile);
    }
    $('#hexpanel').innerHTML = hex || '<div class="empty small">Hover a hex for details.</div>';
  }

  // ---------- selection
  function computeSel() {
    dests = new Set(); zocKeys = new Set(); targets = new Map(); selReach = null;
    if (!sel || !Game.alive(sel)) { sel = null; return; }
    const known = Game.visibleEnemies(sel.side);
    selReach = Game.reachable(sel, known);
    for (const k of Game.destinations(sel, selReach, known)) {
      dests.add(k);
      if (selReach.get(k).zoc) zocKeys.add(k);
    }
    if (Game.canAttack(sel)) for (const e of Game.targets(sel, known)) targets.set(e.id, e);
  }
  function select(u) {
    sel = u;
    computeSel();
    Render.drawOverlay({ sel, dests, zoc: zocKeys, targets: [...targets.values()] });
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
    const res = await Game.executeMove(u, key, async (mu, from, to) => {
      const known = knownFor(v);
      const vis = isVisibleTo(mu, v, known) || (known && Game.visibleTiles(v).has(from.key));
      if (vis) {
        Render.showUnit(mu);
        await Render.animateMove(mu, from, to, STEP_MS);
      }
      refresh();
    });
    if (res && res.contact && res.halted && u.side === v) setBanner('Contact! Enemy spotted. Movement halted.', 2200);
    Game.save();
    refresh();
    return res;
  }

  async function attack(att, def) {
    const v = viewer();
    const known = knownFor(v);
    const show = isVisibleTo(att, v, known) || isVisibleTo(def, v, known);
    const aT = Game.tile(att.q, att.r), dT = Game.tile(def.q, def.r);
    const ranged = UNIT_TYPES[att.type].indirect && Hex.distance(att.q, att.r, def.q, def.r) > 1;
    if (show) {
      Render.showUnit(att);
      if (ranged) await Render.tracer(aT, dT); else await Render.lunge(att, aT, dT);
    }
    const res = Game.resolveCombat(att, def);
    if (show || def.side === v) {
      Render.flash(dT);
      Render.floatText(dT, res.defKilled ? 'Destroyed' : res.defLoss ? `−${res.defLoss}` : 'No effect', '#ffdf5c');
      if (res.attLoss) Render.floatText(aT, res.attKilled ? 'Destroyed' : `−${res.attLoss}`, '#ff8a80');
    }
    if (res.retreat) await Render.animateMove(def, res.retreat.from, res.retreat.to, 220);
    if (res.advance) { await sleep(120); await Render.animateMove(att, res.advance.from, res.advance.to, 220); }
    Game.save();
    refresh();
    await sleep(show ? 380 : 0);
    return res;
  }

  // ---------- turn flow
  async function runTurn() {
    const my = token;
    const s = Game.state;
    deselect();
    refresh();
    if (s.over) { showGameOver(); return; }
    if (s.players[s.side] === 'ai') {
      busy = true;
      setBanner(`${cap(s.side)} (AI) is moving…`);
      refresh();
      await sleep(350);
      await AI.takeTurn(s.side, { alive: () => my === token && !Game.state.over, move: moveUnit, attack });
      if (my !== token) return;
      busy = false;
      setBanner('');
      if (Game.state.over) { refresh(); showGameOver(); return; }
      endTurn();
    } else {
      const hotseat = s.players.blue === 'human' && s.players.red === 'human';
      if (hotseat && s.fog) await handoff(s.side);
      if (my !== token) return;
      refresh();
      setBanner(`${cap(s.side)} to move — turn ${s.turn}`, 1800);
    }
  }

  function endTurn() {
    if (Game.state.over) return;
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

  // ---------- input handlers
  async function onClick(t) {
    if (!humanTurn() || !t) return;
    const side = Game.state.side;
    const u = Game.unitAt(t.q, t.r);
    if (sel && u && targets.has(u.id)) {
      busy = true;
      const att = sel;
      await attack(att, u);
      busy = false;
      if (Game.state.over) { showGameOver(); return; }
      if (Game.alive(att)) select(att); else deselect();
      refresh();
      return;
    }
    if (sel && dests.has(t.key)) {
      busy = true;
      const mover = sel;
      Render.drawOverlay({ sel: null });
      Render.drawPath(null);
      await moveUnit(mover, t.key);
      busy = false;
      if (Game.alive(mover)) select(mover); else deselect();
      return;
    }
    if (u && u.side === side) { select(u === sel ? null : u); return; }
    deselect();
    refresh();
  }

  function onHover(t) {
    if (t === hoverTile || !Game.state) return;
    hoverTile = t;
    Render.setHover(t);
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
    const known = Game.visibleEnemies(side);
    const ready = Game.unitsOf(side).filter((u) => u.mpLeft > 0 || (Game.canAttack(u) && Game.targets(u, known).length));
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
      if (k === 'escape') { deselect(); refresh(); }
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
    const known = Game.visibleEnemies(side);
    const idle = Game.unitsOf(side).filter((u) => !u.moved && !u.attacked).length;
    const canHit = Game.unitsOf(side).some((u) => Game.canAttack(u) && Game.targets(u, known).length);
    if (canHit && !$('#btn-end').dataset.confirm) {
      $('#btn-end').dataset.confirm = '1';
      $('#btn-end').textContent = 'Confirm end turn';
      setBanner(`Some units can still attack${idle ? ` (${idle} haven't moved; they will dig in)` : ''}. Click again to end the turn.`, 2500);
      setTimeout(() => { delete $('#btn-end').dataset.confirm; $('#btn-end').textContent = 'End turn'; }, 2500);
      return;
    }
    delete $('#btn-end').dataset.confirm;
    $('#btn-end').textContent = 'End turn';
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

  function showMenu() {
    const inGame = !!Game.state && !Game.state.over;
    const hasSave = !Game.state && Game.hasSave();
    const seed = Math.floor(Math.random() * 1e6);
    showModal(`
      <h2 class="title">HEX COMMAND</h2>
      <p class="sub">Operational hex wargame with NATO symbology. Runs entirely in your browser.</p>
      <div class="form">
        <label>Mode
          <select id="f-mode">
            <option value="blue">Play Blue vs AI</option>
            <option value="red">Play Red vs AI</option>
            <option value="hotseat">Hotseat (2 players)</option>
            <option value="watch">AI vs AI (watch)</option>
          </select></label>
        <label>Map size
          <select id="f-size">
            <option value="s">Small (24×16)</option>
            <option value="m" selected>Medium (32×22)</option>
            <option value="l">Large (40×26)</option>
          </select></label>
        <label>Turns
          <select id="f-turns"><option>10</option><option selected>15</option><option>20</option></select></label>
        <label>Map seed
          <span class="row"><input id="f-seed" inputmode="numeric" value="${seed}"><button type="button" id="f-reroll" title="Random seed">⟳</button></span></label>
        <label class="check"><input type="checkbox" id="f-fog" checked> Fog of war</label>
      </div>
      <div class="btns">
        ${inGame ? '<button id="f-resume">Resume</button>' : ''}
        ${hasSave ? '<button id="f-continue">Continue saved game</button>' : ''}
        <button id="f-start" class="primary">Start new game</button>
      </div>`, () => {
      $('#f-reroll').onclick = () => { $('#f-seed').value = Math.floor(Math.random() * 1e6); };
      if (inGame) $('#f-resume').onclick = closeModal;
      if (hasSave) $('#f-continue').onclick = () => { closeModal(); continueGame(); };
      $('#f-start').onclick = () => {
        const mode = $('#f-mode').value;
        const [cols, rows] = SIZES[$('#f-size').value];
        const players = {
          blue: { blue: 'human', red: 'ai', hotseat: 'human', watch: 'ai' },
          red: { blue: 'ai', red: 'human', hotseat: 'human', watch: 'ai' },
        };
        const seedVal = parseInt($('#f-seed').value, 10);
        closeModal();
        startGame({
          seed: Number.isFinite(seedVal) ? Math.abs(seedVal) : Math.floor(Math.random() * 1e6),
          cols, rows,
          maxTurns: parseInt($('#f-turns').value, 10),
          fog: $('#f-fog').checked,
          players: { blue: players.blue[mode], red: players.red[mode] },
        });
      };
    }, !inGame);
  }

  function showHelp() {
    const sym = (type, side) => `<svg class="usym sm" viewBox="-26 -30 52 50">${Symbols.build(type, side)}</svg>`;
    const rows = Object.entries(UNIT_TYPES).map(([k, t]) =>
      `<tr><td>${sym(k, 'blue')}${sym(k, 'red')}</td><td><b>${t.name}</b></td><td>${t.atk}</td><td>${t.def}</td><td>${t.mp}</td><td>${t.range}</td><td>${t.move}</td></tr>`).join('');
    const terr = Object.values(TERRAIN).map((t) => {
      const c = (n) => (isFinite(n) ? n : '—');
      return `<tr><td><i class="sw" style="background:${t.color}"></i>${t.name}</td><td>×${t.def}</td><td>${c(t.cost.foot)} / ${c(t.cost.tracked)} / ${c(t.cost.wheeled)}</td></tr>`;
    }).join('');
    showModal(`
      <h2>How to play</h2>
      <div class="help">
        <p><b>Goal:</b> at the end of every turn each side scores the VP of every town it holds (capitals ★ are worth 5).
        Most VP after the last turn wins; destroying the whole enemy force wins immediately.</p>
        <h3>Controls</h3>
        <ul>
          <li><b>Click</b> a unit to select it; highlighted hexes show where it can move, red outlines show targets.</li>
          <li><b>Click</b> a highlighted hex to move, or a red-outlined enemy to attack (hover first for the odds).</li>
          <li><b>Drag</b> to pan, <b>wheel</b>/pinch to zoom. <b>Right-click</b>/Esc deselects.</li>
          <li>Keys: <kbd>N</kbd>/<kbd>Space</kbd> next unit · <kbd>U</kbd> undo move · <kbd>E</kbd> end turn · <kbd>F</kbd> fit map · <kbd>+</kbd>/<kbd>−</kbd> zoom</li>
        </ul>
        <h3>Rules</h3>
        <ul>
          <li><b>Zones of control:</b> moving next to an enemy unit ends movement.</li>
          <li><b>One attack per unit per turn.</b> Attacking ends the unit's movement. Artillery fires up to 3 hexes with no return fire, but cannot fire after moving.</li>
          <li><b>Combat odds</b> compare attack vs defense, scaled by strength. Terrain, digging in, flanking (+15% per other friendly unit adjacent to the target), HQ command (+20% within 3 hexes) and anti-armor bonuses all apply.</li>
          <li>Beaten defenders may <b>retreat</b>; a unit with nowhere to go loses an extra step. Victorious attackers advance into the vacated hex.</li>
          <li>Units that don't move during their turn <b>dig in</b> (+30% defense).</li>
          <li><b>Fog of war:</b> you only see enemies near your units and towns. Forest and towns conceal units at range. Moving into contact halts movement.</li>
          <li><b>Roads</b> cost 0.5 per hex. Wheeled units can't enter marsh, mountains or rivers except by road or bridge. A unit that hasn't moved can always move one hex.</li>
        </ul>
        <h3>Units</h3>
        <table class="tbl"><tr><th>Symbol</th><th>Type</th><th>Atk</th><th>Def</th><th>MP</th><th>Rng</th><th>Mobility</th></tr>${rows}</table>
        <p class="small muted">Blue uses the NATO friendly frame (rectangle), Red the hostile frame (diamond). Marks above the frame show echelon: II battalion, X brigade. Bars below show remaining strength.</p>
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
        <h2>${cap(side)} commander</h2>
        <p>Pass the device to the <b class="${side}">${cap(side)}</b> player, then continue.</p>
        <div class="btns"><button id="h-go" class="primary">I'm ${cap(side)}, continue</button></div>`, () => {
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
    const title = s.winner === 'draw' ? 'Draw' : `${cap(s.winner)} victory`;
    const reason = s.reason === 'annihilation'
      ? 'The opposing force has been destroyed.'
      : `After ${s.maxTurns} turns the fighting ends.`;
    const alive = (side) => Game.unitsOf(side).length;
    const towns = (side) => Game.map.cities.filter((c) => c.city.owner === side).length;
    setBanner('');
    showModal(`
      <h2 class="${s.winner}">${title}</h2>
      <p>${reason}</p>
      <table class="tbl result">
        <tr><th></th><th class="blue">Blue</th><th class="red">Red</th></tr>
        <tr><td>Victory points</td><td>${s.vp.blue}</td><td>${s.vp.red}</td></tr>
        <tr><td>Towns held</td><td>${towns('blue')}</td><td>${towns('red')}</td></tr>
        <tr><td>Units remaining</td><td>${alive('blue')} / ${WG.ORBAT.length}</td><td>${alive('red')} / ${WG.ORBAT.length}</td></tr>
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
    sel = null;
    hoverTile = null;
    Render.drawMap(Game.map);
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
    showMenu();
  }

  window.addEventListener('DOMContentLoaded', init);
})(window.WG);
