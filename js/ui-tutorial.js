'use strict';

// Tutorial tab: a checklist of guided steps for scenarios that define `tutorial.steps`.
// Each step is { id, title, text (html), focus: [lon, lat], check(G) }; completion is kept in G.state.tutorial.done.
(function (WG) {
  const UI = () => WG.UI;
  const G = () => WG.Game;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const expanded = new Set(); // steps the player opened besides the current one
  const steps = () => (G().scenario && G().scenario.tutorial ? G().scenario.tutorial.steps : null);

  // Tick off any steps whose condition now holds.
  function update() {
    const g = G();
    const list = steps();
    if (!list || !g.state || !g.state.tutorial) return;
    const done = g.state.tutorial.done;
    const fresh = list.filter((s) => done[s.id] === undefined && s.check(g));
    for (const s of fresh) done[s.id] = g.state.turn;
    if (!fresh.length) return;
    const next = list.find((s) => done[s.id] === undefined);
    if (UI().humanTurn()) UI().setBanner(`Step complete: ${fresh[fresh.length - 1].title}${next ? ` · Next: ${next.title}` : ''}`, 3000);
    g.save();
  }

  function render(el) {
    const g = G();
    const list = steps();
    const done = g.state.tutorial.done;
    const current = list.find((s) => done[s.id] === undefined);
    const n = list.filter((s) => done[s.id] !== undefined).length;
    const brief = g.scenario.briefing ? '<button class="tut-brief" title="Reread the mission briefing">Briefing</button>' : '';
    el.innerHTML = `<div class="tut-top"><h4>${esc(g.scenario.name)} · ${n}/${list.length} steps</h4>${brief}</div>` + list.map((s, i) => {
      const cls = done[s.id] !== undefined ? 'done' : s === current ? 'cur' : '';
      return `<div class="tut-step ${cls}">
        <div class="tut-head"><span class="tut-mark">${cls === 'done' ? '✓' : i + 1}</span><b>${esc(s.title)}</b>
          ${s.focus ? `<button class="tut-show" data-i="${i}" title="Center the map here">Show</button>` : ''}</div>
        ${s === current || expanded.has(s.id) ? `<div class="tut-text">${s.text}</div>` : ''}
      </div>`;
    }).join('') + (current ? '<p class="small muted">Steps can be done in any order. Click a step to read it.</p>'
      : '<p class="small">All steps done. Tutorial complete.</p>');
    if (brief) el.querySelector('.tut-brief').onclick = () => UI().showBriefing();
    el.querySelectorAll('.tut-show').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const [lon, lat] = list[+b.dataset.i].focus;
        const t = g.map.at(lon, lat);
        if (t) UI().centerOn(t, true);
      };
    });
    el.querySelectorAll('.tut-step:not(.cur) .tut-head').forEach((h) => {
      h.onclick = () => {
        const id = list[[...el.querySelectorAll('.tut-step')].indexOf(h.parentElement)].id;
        if (!expanded.delete(id)) expanded.add(id);
        render(el);
      };
    });
  }

  WG.UI.registerTab({
    id: 'tutorial', label: 'Tutorial',
    visible: () => !!steps(),
    onNewGame() { expanded.clear(); if (steps()) setTimeout(() => UI().showTab('tutorial')); },
    onRefresh: update,
    render,
  });
})(window.WG);
