// Tiered shop (SHOP_IMPL_PLAN.md Phase 4). Components -> tier 2 -> epics, plus boots.
// Buying uses recipe pricing (parts you hold count toward the price and are used up) and the buying rules in
// js/items.js (buyBlock). Selling refunds 70%. While you stay at the fountain, Undo reverses your last purchases
// and sales one at a time at full value; leaving the fountain locks them in.
// Mounted by the engine: window.MOBA_SHOP_UI.mount(containerEl, api).
window.MOBA_SHOP_UI = (function () {
  'use strict';
  const I = window.MOBA_ITEMS;
  let api = null, root = null;
  let selected = null;
  let filter = 'all';
  let undo = []; // this fountain visit: { type: 'buy', item, paid, used: [items] } | { type: 'sell', item, refund, slot }
  let lastMsg = { text: '', color: '#94a3b8' };

  const FILTERS = [
    ['all', 'All'], ['hp', 'HP'], ['mana', 'Mana'], ['atk', 'Attack'], ['abil', 'Ability'],
    ['res', 'Resist'], ['asp', 'Attack speed'], ['haste', 'Haste'], ['boots', 'Boots']
  ];
  const TIER_NAME = { 1: 'Components', 2: 'Tier 2', 3: 'Epics' };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function msg(text, color) { lastMsg = { text, color: color || '#94a3b8' }; const el = root && root.querySelector('#shop-msg'); if (el) { el.textContent = text; el.style.color = lastMsg.color; } }
  function owned() { return api.prog().items; }
  function inLine(it, f) {
    if (f === 'all') return true;
    if (f === 'boots') return it.line === 'boots';
    return it.line !== 'boots' && it.line.split('+').indexOf(f) >= 0;
  }
  function priceOf(it) { return I.costGiven(it.id, owned().map((o) => o.id)); }
  function blockOf(it) {
    if (!api.atFountain()) return 'Recall to the fountain (B) to buy';
    const why = I.buyBlock(it.id, owned(), { ranged: api.isRanged() });
    if (why) return why;
    const p = priceOf(it);
    if (api.prog().gold < p.owed) return 'Need ' + p.owed + ' gold';
    return null;
  }

  // ---- actions ----
  function buy(id) {
    const it = I.byId[id];
    if (!it) return false;
    const why = blockOf(it);
    if (why) { msg(why + '.', '#fb7185'); api.float(why.toUpperCase() + '!', '#fb7185'); return false; }
    const prog = api.prog();
    const price = priceOf(it);
    const used = [];
    price.used.forEach((uid) => {
      const k = prog.items.findIndex((o) => o.id === uid);
      if (k >= 0) used.push(prog.items.splice(k, 1)[0]);
    });
    prog.gold -= price.owed;
    prog.items.push(it);
    undo.push({ type: 'buy', item: it, paid: price.owed, used });
    api.itemsChanged(it);
    msg('Bought ' + it.name + (price.owed < it.cost ? ' (' + price.owed + 'g with your parts)' : '') + '.', '#fde047');
    api.float('EQUIPPED: ' + it.name, '#fde047');
    refresh();
    return true;
  }
  function sell(slot) {
    const prog = api.prog();
    const it = prog.items[slot];
    if (!it) return false;
    if (!api.atFountain()) { msg('Recall to the fountain (B) to sell.', '#fb7185'); return false; }
    const refund = I.sellValue(it);
    prog.items.splice(slot, 1);
    prog.gold += refund;
    undo.push({ type: 'sell', item: it, refund, slot });
    api.itemsChanged(null);
    msg('Sold ' + it.name + ' for ' + refund + 'g.', '#fde047');
    refresh();
    return true;
  }
  function undoLast() {
    if (!undo.length || !api.atFountain()) return false;
    const prog = api.prog();
    const t = undo.pop();
    if (t.type === 'buy') {
      const k = prog.items.lastIndexOf(t.item);
      if (k >= 0) prog.items.splice(k, 1);
      t.used.forEach((o) => prog.items.push(o));
      prog.gold += t.paid;
      msg('Undid ' + t.item.name + ' (+' + t.paid + 'g).', '#86efac');
    } else {
      prog.items.splice(Math.min(t.slot, prog.items.length), 0, t.item);
      prog.gold -= t.refund;
      msg('Undid selling ' + t.item.name + '.', '#86efac');
    }
    api.itemsChanged(null);
    refresh();
    return true;
  }

  // ---- view ----
  function tile(it) {
    const p = priceOf(it);
    const why = blockOf(it);
    const own = owned().some((o) => o.id === it.id);
    const sel = selected === it.id;
    return `<div data-item="${it.id}" title="${esc(why || '')}" style="padding:5px 7px;border-radius:5px;cursor:pointer;margin-bottom:4px;
      background:${sel ? 'rgba(56,189,248,0.18)' : 'rgba(20,29,42,0.92)'};border:1px solid ${sel ? '#38bdf8' : (own ? '#fbbf24' : (why ? 'rgba(255,255,255,0.08)' : 'rgba(250,204,21,0.45)'))};
      opacity:${why && !own ? 0.55 : 1}">
      <div style="font-size:11.5px;font-weight:800;color:#f8fafc;line-height:1.2">${esc(it.name)}</div>
      <div style="font-size:10px;color:${p.owed < it.cost ? '#86efac' : '#fde047'}">${p.owed}g${p.owed < it.cost ? ' <span style="color:#64748b;text-decoration:line-through">' + it.cost + '</span>' : ''}${own ? ' <span style="color:#fbbf24">• owned</span>' : ''}</div>
    </div>`;
  }
  function detail() {
    const it = selected && I.byId[selected];
    if (!it) return '<div style="color:#64748b;font-size:11px;padding:6px">Pick an item to see what it does and what it builds from.</div>';
    const p = priceOf(it);
    const why = blockOf(it);
    const ownIds = owned().map((o) => o.id);
    const pool = ownIds.slice();
    const parts = it.from.map((fid) => {
      const k = pool.indexOf(fid);
      const have = k >= 0;
      if (have) pool.splice(k, 1);
      return `<span data-item="${fid}" style="cursor:pointer;color:${have ? '#86efac' : '#cbd5e1'};text-decoration:underline dotted">${esc(I.byId[fid].name)}${have ? ' ✓' : ''}</span>`;
    });
    const recipeGold = it.cost - it.from.reduce((a, fid) => a + I.byId[fid].cost, 0);
    const into = I.buildsInto(it.id).map((o) => `<span data-item="${o.id}" style="cursor:pointer;color:#cbd5e1;text-decoration:underline dotted">${esc(o.name)}</span>`);
    return `<div style="font-size:14px;font-weight:800;color:#fde047">${esc(it.name)}</div>
      <div style="font-size:10.5px;color:#94a3b8;margin-bottom:4px">${TIER_NAME[it.tier] || ''}${it.boots ? ' • Boots' : ''}${it.rangedOnly ? ' • Ranged only' : ''}</div>
      <div style="font-size:11.5px;color:#e2e8f0;margin-bottom:5px">${esc(I.statText(it.stats))}</div>
      ${it.passive ? `<div style="font-size:11px;color:#c4b5fd;margin-bottom:6px"><b>Passive:</b> ${esc(it.passive.text)}</div>` : ''}
      ${parts.length ? `<div style="font-size:10.5px;color:#94a3b8;margin-bottom:3px">Built from: ${parts.join(' + ')} + ${recipeGold}g</div>` : ''}
      ${into.length ? `<div style="font-size:10.5px;color:#94a3b8;margin-bottom:6px">Builds into: ${into.join(' / ')}</div>` : ''}
      <button type="button" class="sb-btn" data-buy="${it.id}" style="padding:5px 12px;font-size:12px;opacity:${why ? 0.45 : 1}">Buy ${p.owed}g</button>
      ${why ? `<div style="font-size:10.5px;color:#fb7185;margin-top:4px">${esc(why)}</div>` : ''}`;
  }
  function statsLine() {
    const st = api.stats();
    const aps = 1 / window.MOBA_COMBAT.atkInterval(api.baseAtkCd(), st);
    const capped = window.MOBA_COMBAT.atkCapped(api.baseAtkCd(), st);
    const f = (v) => Math.round(v);
    return `HP ${f(st.maxHp)} • Attack ${f(st.attack)} • Ability ${f(st.ability)} • Resist ${f(st.resist)} • Haste ${f(st.haste)} • ` +
      `Attack speed ${aps.toFixed(2)}/s${capped ? ' <span style="color:#fbbf24">(max)</span>' : ''}`;
  }
  function inventory() {
    const items = owned();
    let html = '';
    for (let i = 0; i < I.SLOTS; i++) {
      const it = items[i];
      html += `<div style="flex:1;min-width:0;padding:5px 7px;background:rgba(30,41,59,0.85);border:1px solid ${it ? '#fbbf24' : 'rgba(255,255,255,0.15)'};border-radius:5px">
        ${it ? `<div data-item="${it.id}" style="cursor:pointer;font-size:11px;font-weight:700;color:#fde047;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.name)}</div>
          <button type="button" class="sb-btn" data-sell="${i}" style="margin-top:3px;padding:1px 6px;font-size:10px">Sell ${I.sellValue(it)}g</button>`
        : `<div style="font-size:10.5px;color:#64748b">Empty slot ${i + 1}</div>`}
      </div>`;
    }
    return html;
  }
  let lastHtml = '';
  function refresh() {
    if (!root || root.style.display === 'none') return;
    const items = I.items.filter((it) => inLine(it, filter));
    const col = (tier) => items.filter((it) => (it.line === 'boots' ? (it.tier === 1 ? 1 : 2) : it.tier) === tier).map(tile).join('') || '<div style="color:#475569;font-size:10.5px">—</div>';
    const html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div><span style="font-size:14px;font-weight:800;color:#fde047">FOUNTAIN ARMORY</span>
          <span style="font-size:12px;color:#fde047;margin-left:10px">🪙 ${api.prog().gold}g</span>
          <div id="shop-msg" style="font-size:11px;color:${lastMsg.color}">${esc(lastMsg.text || (api.atFountain() ? 'Buy and sell at the fountain. Undo works until you leave.' : 'Recall to the fountain (B) to buy or sell.'))}</div></div>
        <div style="display:flex;gap:6px">
          <button type="button" class="sb-btn" data-undo="1" style="padding:3px 9px;opacity:${undo.length && api.atFountain() ? 1 : 0.4}">↶ Undo${undo.length ? ' (' + undo.length + ')' : ''}</button>
          <button type="button" class="sb-btn" data-close="1" style="padding:3px 9px">✕ Close (P)</button>
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
        ${FILTERS.map(([k, label]) => `<button type="button" class="sb-btn" data-filter="${k}" style="padding:2px 8px;font-size:10.5px;${filter === k ? 'border-color:#38bdf8;color:#7dd3fc' : ''}">${label}</button>`).join('')}
      </div>
      <div style="display:flex;gap:10px">
        <div style="flex:1.6;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;max-height:330px;overflow-y:auto" data-no-cam-wheel="1">
          <div><div style="font-size:10.5px;font-weight:800;color:#94a3b8;margin-bottom:4px">${filter === 'boots' ? 'BOOTS' : 'COMPONENTS'}</div>${col(1)}</div>
          <div><div style="font-size:10.5px;font-weight:800;color:#94a3b8;margin-bottom:4px">${filter === 'boots' ? 'UPGRADED BOOTS' : 'TIER 2'}</div>${col(2)}</div>
          <div><div style="font-size:10.5px;font-weight:800;color:#94a3b8;margin-bottom:4px">EPICS</div>${col(3)}</div>
        </div>
        <div style="flex:1;background:rgba(15,23,42,0.85);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px;min-height:150px">${detail()}</div>
      </div>
      <div style="margin-top:8px;font-size:10.5px;color:#cbd5e1">${statsLine()}</div>
      <div style="margin-top:6px;display:flex;gap:6px">${inventory()}</div>`;
    if (html !== lastHtml) { lastHtml = html; root.innerHTML = html; }
  }

  function mount(el, adapter) {
    root = el; api = adapter;
    // one delegated listener; act on pointerdown so a rebuild between press and release can't eat the click
    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !e.target.closest) return;
      const b = e.target.closest('[data-buy],[data-sell],[data-undo],[data-close],[data-filter],[data-item]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (b.dataset.buy) buy(b.dataset.buy);
      else if (b.dataset.sell !== undefined) sell(parseInt(b.dataset.sell, 10));
      else if (b.dataset.undo) undoLast();
      else if (b.dataset.close) api.close();
      else if (b.dataset.filter) { filter = b.dataset.filter; refresh(); }
      else if (b.dataset.item) { selected = b.dataset.item; refresh(); }
    });
    // double-click an item to buy it
    root.addEventListener('dblclick', (e) => { const t = e.target.closest && e.target.closest('[data-item]'); if (t) buy(t.dataset.item); });
  }
  // leaving the fountain locks in this visit's purchases (no more undo)
  let wasAt = false;
  function tick() {
    if (!api) return;
    const at = api.atFountain();
    if (wasAt && !at && undo.length) { undo = []; lastMsg = { text: '', color: '#94a3b8' }; refresh(); }
    wasAt = at;
  }
  function reset() { undo = []; selected = null; lastMsg = { text: '', color: '#94a3b8' }; lastHtml = ''; }

  return { mount, refresh, buy, sell, undo: undoLast, tick, reset, undoCount: () => undo.length };
})();
