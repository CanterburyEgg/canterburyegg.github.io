// Start menu: three save slots, new game (with seed), continue, delete, import.
import { listSlots, deleteSlot, readFileJSON, deserialize, writeSlot } from './save.js';

function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function createMenu({ onContinue, onNewGame, randomSeed, canResume, onResume }) {
  const el = document.getElementById('menu');
  const slotsEl = document.getElementById('menu-slots');
  const resumeBtn = document.getElementById('menu-resume');
  const fileInput = document.getElementById('menu-import-file');
  let importTarget = null;

  resumeBtn.addEventListener('click', () => { hide(); onResume(); });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (!f || !importTarget) return;
    try {
      const raw = await readFileJSON(f);
      deserialize(raw); // validate before writing
      await writeSlot({ ...raw, id: importTarget });
      render();
    } catch (e) {
      alert(`Import failed: ${e.message}`);
    }
  });

  async function render() {
    resumeBtn.style.display = canResume() ? 'inline-block' : 'none';
    let slots;
    try {
      slots = await listSlots();
    } catch (e) {
      slotsEl.innerHTML = `<div class="slot-card"><b>Saving is unavailable in this browser.</b><div class="muted">${e.message || e}</div></div>`;
      return;
    }
    slotsEl.innerHTML = slots.map(({ id, data }, i) => {
      if (!data) {
        return `<div class="slot-card empty" data-slot="${id}">
          <div class="slot-title">Slot ${i + 1} <span class="muted">empty</span></div>
          <div class="slot-new"><input class="seed-in" spellcheck="false" value="${randomSeed()}" aria-label="World seed" />
          <button data-act="new" type="button">New game</button></div>
          <button class="link" data-act="import" type="button">Import save file here</button>
        </div>`;
      }
      const s = data.summary || {};
      return `<div class="slot-card" data-slot="${id}">
        <div class="slot-title">Slot ${i + 1} · <span class="seed">${data.seed}</span></div>
        <div class="muted">${s.planetName || 'Unknown planet'} · Total level ${s.totalLevel || 2} · ${data.credits || 0} cr · ${fmtTime(data.playtime || 0)} played</div>
        <div class="muted">Saved ${fmtDate(data.savedAt)}</div>
        <div class="slot-btns">
          <button data-act="continue" type="button">Continue</button>
          <button class="danger" data-act="delete" type="button">Delete</button>
          <button class="link" data-act="import" type="button">Import over</button>
        </div>
      </div>`;
    }).join('');

    slotsEl.querySelectorAll('.slot-card').forEach((card) => {
      const id = card.dataset.slot;
      card.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
        const act = b.dataset.act;
        if (act === 'new') {
          const seed = card.querySelector('.seed-in').value.trim() || randomSeed();
          hide();
          onNewGame(id, seed);
        } else if (act === 'continue') {
          hide();
          onContinue(id);
        } else if (act === 'delete') {
          if (confirm('Delete this save? This cannot be undone.')) { await deleteSlot(id); render(); }
        } else if (act === 'import') {
          importTarget = id;
          fileInput.click();
        }
      }));
    });
  }

  function show() { el.classList.add('show'); render(); }
  function hide() { el.classList.remove('show'); }
  return { show, hide, isOpen: () => el.classList.contains('show') };
}
