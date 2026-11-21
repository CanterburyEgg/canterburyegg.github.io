// =====================================================================
// PAUSE MENU (Esc in game): Resume, Settings, Save, Save and Quit to Title, Export save.
// =====================================================================
import { mountSettingsPanel } from './settings.js';

export function createPause({ settings, onSettingsChange, onSave, onQuit, onExport }) {
  const el = document.createElement('section');
  el.id = 'pause';
  el.setAttribute('aria-label', 'Pause menu');
  document.body.appendChild(el);

  function renderMain() {
    el.innerHTML = `<div class="pause-box">
      <div class="pause-title">Paused</div>
      <button type="button" class="big primary" data-act="resume">Resume</button>
      <button type="button" class="big" data-act="settings">Settings</button>
      <button type="button" class="big" data-act="save">Save</button>
      <button type="button" class="big" data-act="export">Export save</button>
      <button type="button" class="big" data-act="quit">Save and quit to title</button>
      <div class="pause-note muted"></div>
    </div>`;
  }
  function renderSettings() {
    el.innerHTML = `<div class="pause-box wide"><div class="pause-title">Settings</div><div class="settings-box"></div>
      <button type="button" class="big" data-act="back">Back</button></div>`;
    mountSettingsPanel(el.querySelector('.settings-box'), settings, onSettingsChange);
  }
  el.addEventListener('click', async (e) => {
    if (e.target === el) { hide(); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'resume') hide();
    else if (act === 'settings') renderSettings();
    else if (act === 'back') renderMain();
    else if (act === 'save') { const msg = await onSave(); el.querySelector('.pause-note').textContent = msg; }
    else if (act === 'export') onExport();
    else if (act === 'quit') { hide(); onQuit(); }
  });

  function show() { renderMain(); el.classList.add('show'); }
  function hide() { el.classList.remove('show'); }
  return { show, hide, isOpen: () => el.classList.contains('show') };
}
