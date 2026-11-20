// Modal panels: Storage Locker (shared bank), Shop, Star Map (launch pad).
import { ITEMS } from '../data/items.js';
import { TOOLS } from '../data/resources.js';
import { QUIRKS } from '../data/quirks.js';
import { permitPrice, SELL_RATE, shopStockTiers } from '../data/travel.js';
import { itemIconHTML } from './ui.js';

export function sellPrice(def) {
  return Math.max(1, Math.floor(def.value * (SELL_RATE[def.kind] || 0.5)));
}

export function createPanels(actions) {
  const modal = document.getElementById('modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const hintEl = document.getElementById('modal-hint');
  document.getElementById('modal-close').addEventListener('click', () => close());

  let current = null; // { kind, source: {x,z}, ctx }

  function open(kind, source, ctx) {
    current = { kind, source, ctx };
    modal.classList.add('show');
    render();
  }

  function close() {
    current = null;
    modal.classList.remove('show');
  }

  function render() {
    if (!current) return;
    const st = actions.getState();
    if (current.kind === 'bank') renderBank(st);
    else if (current.kind === 'shop') renderShop(st);
    else if (current.kind === 'starmap') renderStarMap(st);
    else if (current.kind === 'journal') renderJournal();
  }

  // ---- Bank -------------------------------------------------------------
  function renderBank(st) {
    titleEl.textContent = current.ctx.title || 'Storage Locker';
    const ids = Object.keys(st.bank).filter((id) => st.bank[id] > 0);
    const cells = ids.map((id) => `<div class="bank-slot" data-id="${id}" title="${ITEMS[id].name} ×${st.bank[id]}\nClick: withdraw 1 · Shift-click: withdraw all">${itemIconHTML(ITEMS[id], st.bank[id])}</div>`).join('');
    bodyEl.innerHTML = `
      <div class="bank-actions">
        <button data-act="dep-res" type="button">Deposit resources</button>
        <button data-act="dep-all" type="button">Deposit everything</button>
        <span class="muted">${ids.length} item types stored</span>
      </div>
      <div class="bank-grid">${cells || '<div class="muted empty">Your locker is empty. Click items in your inventory to deposit them.</div>'}</div>`;
    hintEl.textContent = 'Shared across every locker in the system. Click inventory items to deposit (shift: all of that kind).';
    bodyEl.querySelectorAll('.bank-slot').forEach((el) => {
      el.addEventListener('click', (e) => { actions.withdraw(el.dataset.id, e.shiftKey ? Infinity : 1); render(); });
    });
    bodyEl.querySelector('[data-act="dep-res"]').addEventListener('click', () => { actions.depositAll((def) => def.kind === 'resource'); render(); });
    bodyEl.querySelector('[data-act="dep-all"]').addEventListener('click', () => { actions.depositAll(() => true); render(); });
  }

  // ---- Shop -------------------------------------------------------------
  function renderShop(st) {
    titleEl.textContent = current.ctx.title || 'Shop';
    const maxTier = shopStockTiers(current.ctx.meta);
    const stock = TOOLS.filter((t) => t.tier <= maxTier);
    const rows = stock.map((t) => {
      const def = ITEMS[t.id];
      const afford = st.credits >= def.value;
      return `<div class="shop-row">
        <div class="shop-icon">${itemIconHTML(def, 1)}</div>
        <div class="shop-name">${def.name}<div class="muted">Needs ${def.skill[0].toUpperCase() + def.skill.slice(1)} ${def.levelReq}</div></div>
        <button type="button" data-buy="${t.id}" ${afford ? '' : 'disabled'}>Buy · ${def.value} cr</button>
      </div>`;
    }).join('');
    bodyEl.innerHTML = `<div class="shop-credits">You have <b>${st.credits} cr</b></div><div class="shop-list">${rows}</div>`;
    hintEl.textContent = 'Click inventory items to sell one (shift: sell all of that kind). Resources sell at full value, tools at 40%.';
    bodyEl.querySelectorAll('[data-buy]').forEach((el) => {
      el.addEventListener('click', () => { actions.buy(el.dataset.buy); render(); });
    });
  }

  // ---- Star map -----------------------------------------------------------
  function renderStarMap(st) {
    titleEl.textContent = 'Launch Pad: Star Map';
    const sys = actions.getSystem();
    const rows = sys.planets.map((p) => {
      const here = p.index === st.planetIndex;
      const visited = st.visited.has(p.index);
      const owned = st.permits.has(p.index);
      const price = permitPrice(p);
      const quirks = visited
        ? (p.quirks.length ? p.quirks.map((q) => QUIRKS[q].name).join(', ') : 'No anomalies')
        : (p.quirks.length ? `${p.quirks.length} anomal${p.quirks.length > 1 ? 'ies' : 'y'} detected` : 'No anomalies detected');
      let btn;
      if (here) btn = '<span class="tag here">You are here</span>';
      else if (owned) btn = `<button type="button" data-launch="${p.index}">Launch</button>`;
      else btn = `<button type="button" data-permit="${p.index}" ${st.credits >= price ? '' : 'disabled'}>Permit · ${price} cr</button>`;
      return `<div class="star-row ${here ? 'here' : ''}">
        <div class="star-dot t${Math.min(4, p.tier)}"></div>
        <div class="star-name">${visited ? p.name : p.name + ' <span class="muted">(unvisited)</span>'}
          <div class="muted">Tier ${p.tier} · ${p.sizeLabel} · ${p.border.replace('_', ' ')} · ${quirks}</div></div>
        ${btn}
      </div>`;
    }).join('');
    bodyEl.innerHTML = `<div class="shop-credits">You have <b>${st.credits} cr</b></div><div class="star-list">${rows}</div>`;
    hintEl.textContent = 'Stop-gap travel: buy a permit once per destination, then launch any time from any pad.';
    bodyEl.querySelectorAll('[data-permit]').forEach((el) => {
      el.addEventListener('click', () => { actions.buyPermit(Number(el.dataset.permit)); render(); });
    });
    bodyEl.querySelectorAll('[data-launch]').forEach((el) => {
      el.addEventListener('click', () => { const i = Number(el.dataset.launch); close(); actions.launch(i); });
    });
  }

  // ---- Journal ------------------------------------------------------------
  function renderJournal() {
    const j = actions.getJournal();
    titleEl.textContent = 'Quest Journal';
    const sections = j.sections.map((sec) => {
      const items = sec.quests.map((q) => {
        if (q.unknown) return '<div class="jq unknown">???<div class="muted">Undiscovered. Explore and talk to people.</div></div>';
        const cls = q.status === 'done' ? 'done' : 'started';
        const objectives = q.objectives.map((o) => `<div class="jobj ${o.done ? 'ok' : ''}">${o.done ? '✓' : '•'} ${o.text}</div>`).join('');
        return `<div class="jq ${cls}"><div class="jq-title">${q.title} <span class="muted">${q.tier}</span></div>
          <div class="jq-text">${q.text.replace(/\n/g, '<br>')}</div>${objectives}</div>`;
      }).join('');
      return `<div class="jsec"><div class="jsec-head">${sec.planet.name} <span class="muted">Tier ${sec.planet.tier}</span></div>${items}</div>`;
    }).join('');
    bodyEl.innerHTML = `<div class="shop-credits">Quests complete: <b>${j.done}/${j.total}</b> · Reputation: <b>${j.reputation}</b></div>
      ${sections || '<div class="muted">No quests discovered yet.</div>'}
      ${j.hiddenCount ? `<div class="muted jhidden">${j.hiddenCount} quest${j.hiddenCount > 1 ? 's' : ''} on planets you haven't visited.</div>` : ''}`;
    hintEl.textContent = 'Press J to open or close.';
  }

  return {
    open, close, render,
    get current() { return current; },
    isOpen: () => !!current,
  };
}
