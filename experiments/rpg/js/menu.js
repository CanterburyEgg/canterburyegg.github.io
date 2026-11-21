// =====================================================================
// START MENUS: title (Continue / New Game / Load / Settings), slot picker for loading or starting,
// and Settings. The live planet behind it is drawn by main.js (title mode).
// =====================================================================
import { listSlots, deleteSlot, readFileJSON, deserialize, writeSlot, SAVE_VERSION } from './save.js';
import { mountSettingsPanel } from './settings.js';

function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createMenu({ onContinue, onNewGame, settings, onSettingsChange }) {
  const el = document.getElementById('menu');
  const screen = document.getElementById('menu-screen');
  const fileInput = document.getElementById('menu-import-file');
  let importTarget = null;
  let current = 'title';

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (!f || !importTarget) return;
    try {
      const raw = await readFileJSON(f);
      deserialize(raw); // validate before writing
      await writeSlot({ ...raw, id: importTarget });
      go(current);
    } catch (e) {
      alert(`Import failed: ${e.message}`);
    }
  });

  async function slots() {
    try { return { slots: await listSlots() }; } catch (e) { return { error: e.message || String(e) }; }
  }
  const usable = (d) => d && d.version === SAVE_VERSION;

  async function renderTitle() {
    const { slots: list = [] } = await slots();
    const latest = list.filter((s) => usable(s.data)).sort((a, b) => (b.data.savedAt || 0) - (a.data.savedAt || 0))[0];
    screen.innerHTML = `
      <div class="title-btns">
        ${latest ? `<button type="button" class="big primary" data-go="continue">Continue<span>${esc(latest.data.name || 'Drifter')} · ${esc((latest.data.summary || {}).planetName || '')}</span></button>` : ''}
        <button type="button" class="big" data-go="new">New Game</button>
        <button type="button" class="big" data-go="load">Load</button>
        <button type="button" class="big" data-go="settings">Settings</button>
      </div>`;
    const cont = screen.querySelector('[data-go="continue"]');
    if (cont) cont.addEventListener('click', () => { hide(); onContinue(latest.id); });
  }

  async function renderSlots(mode) {
    const { slots: list, error } = await slots();
    if (error) {
      screen.innerHTML = `<div class="slot-card"><b>Saving is unavailable in this browser.</b><div class="muted">${esc(error)}</div></div>${backBtn()}`;
      return;
    }
    const head = mode === 'new' ? 'Choose a slot for your new drifter' : 'Load a drifter';
    screen.innerHTML = `<div class="screen-head">${head}</div>` + list.map(({ id, data }, i) => {
      if (!data) {
        return `<div class="slot-card empty" data-slot="${id}">
          <div class="slot-title">Slot ${i + 1} <span class="muted">empty</span></div>
          <div class="slot-btns">${mode === 'new' ? '<button data-act="new" type="button" class="primary">Start here</button>' : ''}
          <button class="link" data-act="import" type="button">Import save file here</button></div>
        </div>`;
      }
      if (!usable(data)) {
        return `<div class="slot-card old" data-slot="${id}">
          <div class="slot-title">Slot ${i + 1} · <span class="muted">Old prototype save</span></div>
          <div class="muted">From before drifters had names. It can't be loaded anymore.</div>
          <div class="slot-btns">${mode === 'new' ? '<button data-act="new" type="button" class="primary">Start here (replaces it)</button>' : ''}<button class="danger" data-act="delete" type="button">Delete</button></div>
        </div>`;
      }
      const s = data.summary || {};
      return `<div class="slot-card" data-slot="${id}">
        <div class="slot-title">${esc(data.name || 'Drifter')} <span class="muted">· Slot ${i + 1}</span></div>
        <div class="muted">${esc(s.planetName || 'Unknown planet')} · Total level ${s.totalLevel || 2} · ${data.credits || 0} cr · ${fmtTime(data.playtime || 0)} played</div>
        <div class="muted">Saved ${fmtDate(data.savedAt)} · world <span class="seed">${esc(data.seed)}</span></div>
        <div class="slot-btns">
          ${mode === 'new' ? '<button data-act="new" type="button">Start here (overwrites)</button>' : '<button data-act="continue" type="button" class="primary">Continue</button>'}
          <button class="danger" data-act="delete" type="button">Delete</button>
          <button class="link" data-act="import" type="button">Import over</button>
        </div>
      </div>`;
    }).join('') + backBtn();
    screen.querySelectorAll('.slot-card').forEach((card) => {
      const id = card.dataset.slot;
      card.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
        const act = b.dataset.act;
        if (act === 'new') {
          if (card.classList.contains('empty') || card.classList.contains('old') || confirm('Overwrite this drifter? This cannot be undone.')) { hide(); onNewGame(id); }
        } else if (act === 'continue') { hide(); onContinue(id); }
        else if (act === 'delete') { if (confirm('Delete this save? This cannot be undone.')) { await deleteSlot(id); renderSlots(mode); } }
        else if (act === 'import') { importTarget = id; fileInput.click(); }
      }));
    });
  }

  function renderSettings() {
    screen.innerHTML = `<div class="screen-head">Settings</div><div class="settings-box"></div>${backBtn()}`;
    mountSettingsPanel(screen.querySelector('.settings-box'), settings, onSettingsChange);
  }
  const backBtn = () => '<div class="menu-foot"><button type="button" data-go="title">Back</button></div>';

  function go(where) {
    current = where;
    el.dataset.screen = where;
    if (where === 'title') renderTitle();
    else if (where === 'new' || where === 'load') renderSlots(where);
    else if (where === 'settings') renderSettings();
  }
  screen.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b && b.dataset.go !== 'continue') go(b.dataset.go);
  });

  function show(where = 'title') { el.classList.add('show'); go(where); }
  function hide() { el.classList.remove('show'); }
  return { show, hide, isOpen: () => el.classList.contains('show') };
}
