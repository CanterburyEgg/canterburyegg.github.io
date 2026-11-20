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
  // Layout (user direction 2026-11-19): item grid on the left (40%) in three tiers, Basic / Advanced / Epic;
  // the selected item's view on the right (60%) with a League-style build tree and a BUILDS INTO row along its bottom.
  const TIERS = [[1, 'BASIC'], [2, 'ADVANCED'], [3, 'EPIC']];
  const tierOf = (it) => it.tier; // boots: Footwraps is Basic (tier 1), upgraded boots are Advanced (tier 2)
  const CSS = `
    .shp-tile{padding:4px 6px;border-radius:5px;cursor:pointer;background:rgba(20,29,42,0.92);border:1px solid rgba(255,255,255,0.08);min-width:0}
    .shp-tile:hover{border-color:rgba(125,211,252,0.6)}
    .shp-name{font-size:11px;font-weight:800;color:#f8fafc;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .shp-cost{font-size:10px;color:#fde047}
    .shp-tier{font-size:10.5px;font-weight:800;letter-spacing:0.08em;color:#94a3b8;margin:6px 0 4px}
    .shp-tree{display:flex;flex-direction:column;align-items:center}
    .shp-kids{display:flex;gap:10px;justify-content:center;position:relative;padding-top:16px}
    .shp-kids::before{content:'';position:absolute;top:0;left:50%;height:8px;border-left:2px solid rgba(148,163,184,0.5)}
    .shp-kid{position:relative;display:flex;flex-direction:column;align-items:center;padding-top:8px}
    .shp-kid::before{content:'';position:absolute;top:0;left:50%;height:8px;border-left:2px solid rgba(148,163,184,0.5)}
    .shp-kid::after{content:'';position:absolute;top:0;height:0;border-top:2px solid rgba(148,163,184,0.5);left:0;right:0}
    .shp-kid:first-child::after{left:50%}
    .shp-kid:last-child::after{right:50%}
    .shp-kid:only-child::after{display:none}
    .shp-node{padding:4px 8px;border-radius:6px;background:rgba(20,29,42,0.95);border:1px solid rgba(255,255,255,0.15);cursor:pointer;text-align:center;min-width:96px;max-width:150px}
    .shp-node.own{border-color:#86efac}
    .shp-node.root{border-color:#fbbf24;background:rgba(56,40,8,0.6)}
    .shp-into{display:flex;gap:6px;flex-wrap:wrap}
  `;
  function tile(it) {
    const p = priceOf(it);
    const why = blockOf(it);
    const own = owned().some((o) => o.id === it.id);
    const sel = selected === it.id;
    const bc = sel ? '#38bdf8' : (own ? '#fbbf24' : (why ? 'rgba(255,255,255,0.08)' : 'rgba(250,204,21,0.45)'));
    return `<div class="shp-tile" data-item="${it.id}" title="${esc(it.name + (why ? ' — ' + why : ''))}" style="border-color:${bc};${sel ? 'background:rgba(56,189,248,0.18);' : ''}opacity:${why && !own ? 0.55 : 1}">
      <div class="shp-name">${esc(it.name)}</div>
      <div class="shp-cost" style="color:${p.owed < it.cost ? '#86efac' : '#fde047'}">${p.owed}g${own ? ' <span style="color:#fbbf24">✓</span>' : ''}</div>
    </div>`;
  }
  // build tree: the item, its parts under it (recursively); parts you hold are outlined green; recipe gold per step
  function treeNode(id, pool, isRoot) {
    const it = I.byId[id];
    let have = false;
    if (!isRoot) { const k = pool.indexOf(id); if (k >= 0) { pool.splice(k, 1); have = true; } }
    const recipe = it.cost - it.from.reduce((a, fid) => a + I.byId[fid].cost, 0);
    const node = `<div class="shp-node${isRoot ? ' root' : ''}${have ? ' own' : ''}" data-item="${id}">
      <div class="shp-name" style="white-space:normal">${esc(it.name)}${have ? ' ✓' : ''}</div>
      <div class="shp-cost">${it.cost}g${it.from.length ? ' <span style="color:#94a3b8">(+' + recipe + 'g)</span>' : ''}</div></div>`;
    if (!it.from.length || have) return `<div class="shp-tree">${node}</div>`;
    return `<div class="shp-tree">${node}<div class="shp-kids">${it.from.map((fid) => `<div class="shp-kid">${treeNode(fid, pool, false)}</div>`).join('')}</div></div>`;
  }
  function detail() {
    const it = selected && I.byId[selected];
    if (!it) return '<div style="color:#64748b;font-size:12px;padding:10px">Pick an item to see what it does, how it builds, and what it builds into.</div>';
    const p = priceOf(it);
    const why = blockOf(it);
    const into = I.buildsInto(it.id).filter((o) => o.tier === it.tier + 1); // direct upgrades only (Basic -> Advanced -> Epic)
    const tierName = (TIERS.find((t) => t[0] === tierOf(it)) || [0, ''])[1];
    return `<div style="display:flex;flex-direction:column;height:100%">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div>
          <div style="font-size:15px;font-weight:800;color:#fde047">${esc(it.name)}</div>
          <div style="font-size:10.5px;color:#94a3b8;letter-spacing:0.06em">${tierName}${it.boots ? ' • BOOTS' : ''}${it.rangedOnly ? ' • RANGED ONLY' : ''}</div>
        </div>
        <div style="text-align:right">
          <button type="button" class="sb-btn" data-buy="${it.id}" style="padding:5px 14px;font-size:12px;opacity:${why ? 0.45 : 1}">Buy ${p.owed}g</button>
          ${why ? `<div style="font-size:10.5px;color:#fb7185;margin-top:3px">${esc(why)}</div>` : ''}
        </div>
      </div>
      <div style="font-size:12px;color:#e2e8f0;margin:6px 0 3px">${esc(I.statText(it.stats))}</div>
      ${it.passive ? `<div style="font-size:11.5px;color:#c4b5fd;margin-bottom:4px"><b>Passive:</b> ${esc(it.passive.text)}</div>` : ''}
      <div class="shp-tier" style="margin-top:8px">BUILD PATH</div>
      <div style="overflow-x:auto;padding-bottom:4px">${treeNode(it.id, owned().map((o) => o.id), true)}</div>
      <div style="flex:1"></div>
      <div class="shp-tier">BUILDS INTO</div>
      <div class="shp-into">${into.length ? into.map(tile).join('') : '<span style="color:#475569;font-size:11px">Nothing: this is a finished item.</span>'}</div>
    </div>`;
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
    const section = ([tier, name]) => {
      const list = items.filter((it) => tierOf(it) === tier);
      if (!list.length) return '';
      return `<div class="shp-tier">${name}</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:5px">${list.map(tile).join('')}</div>`;
    };
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
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">
        ${FILTERS.map(([k, label]) => `<button type="button" class="sb-btn" data-filter="${k}" style="padding:2px 8px;font-size:10.5px;${filter === k ? 'border-color:#38bdf8;color:#7dd3fc' : ''}">${label}</button>`).join('')}
      </div>
      <div style="display:flex;gap:12px;height:min(56vh,470px)">
        <div style="flex:0 0 ${selected ? '40%' : '100%'};overflow-y:auto;padding-right:4px" data-no-cam-wheel="1">${TIERS.map(section).join('')}</div>
        ${selected ? `<div style="flex:1 1 60%;min-width:0;background:rgba(15,23,42,0.85);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:10px;overflow-y:auto" data-no-cam-wheel="1">
          <div style="text-align:right;margin:-4px -2px 0 0"><button type="button" class="sb-btn" data-deselect="1" style="padding:0 7px;font-size:11px">✕</button></div>${detail()}</div>` : ''}
      </div>
      <div style="margin-top:8px;font-size:10.5px;color:#cbd5e1">${statsLine()}</div>
      <div style="margin-top:6px;display:flex;gap:6px">${inventory()}</div>`;
    if (html !== lastHtml) {
      lastHtml = html;
      // keep the grid's scroll position across rebuilds
      const grid = root.querySelector('[data-no-cam-wheel]');
      const top = grid ? grid.scrollTop : 0;
      root.innerHTML = html;
      const g2 = root.querySelector('[data-no-cam-wheel]');
      if (g2) g2.scrollTop = top;
    }
  }

  function mount(el, adapter) {
    root = el; api = adapter;
    if (!document.getElementById('shp-css')) {
      const st = document.createElement('style');
      st.id = 'shp-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    // one delegated listener; act on pointerdown so a rebuild between press and release can't eat the click
    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !e.target.closest) return;
      const b = e.target.closest('[data-buy],[data-sell],[data-undo],[data-close],[data-filter],[data-deselect],[data-item]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (b.dataset.buy) buy(b.dataset.buy);
      else if (b.dataset.sell !== undefined) sell(parseInt(b.dataset.sell, 10));
      else if (b.dataset.undo) undoLast();
      else if (b.dataset.close) api.close();
      else if (b.dataset.filter) { filter = b.dataset.filter; refresh(); }
      else if (b.dataset.deselect) { selected = null; refresh(); }
      // clicking the selected item again closes its view (back to the full grid)
      else if (b.dataset.item) { selected = selected === b.dataset.item && b.closest('[data-no-cam-wheel]') === root.querySelector('[data-no-cam-wheel]') ? null : b.dataset.item; refresh(); }
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
