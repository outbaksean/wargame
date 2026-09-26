'use strict';

// Intel tab: satellites, counterspace, escalation and the political situation.
(function (WG) {
  const UI = () => WG.UI;
  const G = () => WG.Game;
  const S = () => WG.Space;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const other = (s) => (s === 'blue' ? 'red' : 'blue');

  function meter(v, max, cls) {
    return `<span class="meter ${cls || ''}">${Array.from({ length: max }, (_, i) => `<i class="${i < v ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  function render(el) {
    const g = G(), sp = S();
    const v = UI().viewer() || g.state.side;
    const mine = sp.st(v), theirs = sp.st(other(v));
    const e = g.state.escalation;
    const zn = (z) => esc(g.map.zones[z] ? g.map.zones[z].name : z);
    const owner = g.scenario.spaceFaction && g.scenario.spaceFaction[v];
    const human = !owner || g.controller(owner) === 'human';
    const ctl = human && g.state.side === v && UI().humanTurn() && sp.canAct(v);
    const enemyNextTurn = g.state.side === v && g.scenario.firstSide === v ? g.state.turn : g.state.turn + 1;

    let html = '<h4>Escalation</h4>';
    html += `<div class="esc-bar">${Array.from({ length: 10 }, (_, i) => `<i class="${i < e.level ? 'on' : ''} ${i === 4 ? 'm5' : ''} ${i === 5 ? 'm6' : ''} ${i === 9 ? 'm10' : ''}"></i>`).join('')}</div>
      <div class="esc-legend small muted"><span>5: Japan enters</span><span>6: mainland strikes, Philippine bases</span><span>10: catastrophe</span></div>
      <div class="small">Level <b>${e.level}</b> · driven by PRC ${e.by.red || 0}, Allies ${e.by.blue || 0}</div>
      <ul class="esc-events">${e.events.slice(-6).reverse().map((x) => `<li class="${x.side}">T${x.t} +${x.amount}: ${esc(x.why)}</li>`).join('') || '<li class="muted">No escalatory acts yet.</li>'}</ul>
      <div class="small">Japan: <b>${g.state.japanAtWar ? 'at war' : 'not at war'}</b> · US basing in Japan: <b>${g.state.access !== 'none' || g.state.japanAtWar ? 'allowed' : 'denied'}</b> · Philippines: <b>${g.state.access === 'full' || g.state.phOpen ? 'open' : 'closed'}</b></div>`;

    html += '<h4>Satellites</h4>';
    html += `<div class="sat-row"><span>Your reconnaissance</span>${meter(mine.isr, mine.isrMax)}${mine.blinded ? '<span class="tag bad">dazzled</span>' : ''}</div>
      <div class="sat-row"><span>Your SATCOM</span>${meter(mine.satcom, mine.satcomMax)}</div>
      <div class="sat-row"><span>Enemy reconnaissance</span>${meter(theirs.isr, theirs.isrMax, 'enemy')}${theirs.blinded ? '<span class="tag">dazzled</span>' : ''}</div>
      <div class="sat-row"><span>Enemy SATCOM</span>${meter(theirs.satcom, theirs.satcomMax, 'enemy')}</div>
      <p class="small">Your passes this turn: ${mine.passes.map(zn).join(', ') || 'none'}.<br>
      Enemy passes on their next turn (orbits are predictable): ${sp.passesFor(other(v), enemyNextTurn, sp.effectiveIsr(other(v))).map(zn).join(', ') || 'none'}.</p>
      <p class="small muted">Satellite passes make ships in the swept zones targetable and spot ground units in the open. SATCOM at 1 or less shortens HQ command range; with none, drones cannot fly from distant bases.</p>`;

    html += '<h4>Counterspace (one action per turn)</h4>';
    html += `<div class="sq-btns"><button id="cs-dazzle" ${ctl && mine.dazzle > 0 ? '' : 'disabled'} title="Blind enemy reconnaissance satellites for two turns. Reversible; no escalation.">Dazzle/jam satellites (${mine.dazzle})</button></div>
      <div class="sq-btns"><button id="cs-asat-isr" ${ctl && mine.asat > 0 ? '' : 'disabled'}>Kinetic ASAT: reconnaissance (${mine.asat})</button>
      <button id="cs-asat-com" ${ctl && mine.asat > 0 ? '' : 'disabled'}>Kinetic ASAT: SATCOM</button></div>
      <p class="small muted">A kinetic ASAT permanently destroys a satellite but raises escalation by 2 and litters orbit with debris.</p>`;
    el.innerHTML = html;
    const done = () => { g.save(); UI().refresh(); };
    const q = (id) => el.querySelector(id);
    q('#cs-dazzle').onclick = () => { if (sp.dazzle(v)) done(); };
    const asat = (what) => {
      if (!window.confirm('A kinetic anti-satellite strike raises escalation by 2. Proceed?')) return;
      if (sp.asat(v, what)) done();
    };
    q('#cs-asat-isr').onclick = () => asat('isr');
    q('#cs-asat-com').onclick = () => asat('satcom');
  }

  WG.UI.registerTab({
    id: 'intel', label: 'Intel & Space',
    visible: () => S().active(),
    render,
    helpHtml: () => (S().active() ? `
      <h3>Space, electronic warfare and escalation</h3>
      <ul>
        <li><b>What you can hit depends on what you can see.</b> Enemy units are <i>unknown</i>, <i>detected</i> or <i>targetable</i>. Long-range fire needs targetable contacts: from your own units' sight, coastal radars, drones, AEW aircraft or satellite passes.</li>
        <li><b>Jamming</b> (EW units and aircraft) degrades enemy air defense by 30%, cuts sensor tracks to "detected", shortens vision, stops HQ command and weakens drone attacks in its zone.</li>
        <li><b>Emissions:</b> radars and jammers give their own position away. Switching them off hides the unit but weakens it.</li>
        <li><b>Satellites</b> sweep a few air zones each turn on a predictable schedule (see the Intel tab). <b>Dazzling</b> blinds them for two turns; a <b>kinetic ASAT</b> destroys one permanently but escalates.</li>
        <li><b>Escalation</b> rises with strikes on Japan (+2, and Japan enters the war), Guam (+2), the Philippines (+1), the Chinese mainland (+2, then +1 each turn), kinetic ASATs (+2) and sinking a US carrier (+1). At 5 Japan enters regardless; at 6 the Philippines opens its bases and the Allied AI stops holding back from mainland strikes; at 10 the game ends in catastrophe for everyone.</li>
        <li><b>Reinforcements:</b> PRC follow-on echelons reach the Fujian ports every other turn; Taiwan mobilizes reserve brigades; a second US carrier group arrives around day 4 and a Marine Expeditionary Unit later.</li>
      </ul>` : ''),
  });
})(window.WG);
