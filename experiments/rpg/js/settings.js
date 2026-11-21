// =====================================================================
// SETTINGS: device-level preferences (localStorage, not per save slot) and the Settings panel.
// =====================================================================

const KEY = 'drifter-settings';
export const QUALITY = {
  low: { cellFrac: 0.008, shadows: false, pixelRatio: 1 },
  medium: { cellFrac: 0.004, shadows: true, pixelRatio: 1.5 },
  high: { cellFrac: 0.002, shadows: true, pixelRatio: 2 },
};
export const DEFAULT_SETTINGS = { master: 80, sfx: 80, quality: 'high', camSens: 100, showFps: false };

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const s = { ...DEFAULT_SETTINGS, ...raw };
    if (!QUALITY[s.quality]) s.quality = DEFAULT_SETTINGS.quality;
    for (const k of ['master', 'sfx', 'camSens']) s[k] = Math.max(0, Math.min(k === 'camSens' ? 200 : 100, Number(s[k]) || 0));
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: keep in memory */ }
}

// Builds the panel into `root` (an element). onChange(settings, key) fires on every edit.
export function mountSettingsPanel(root, settings, onChange) {
  const row = (label, input) => `<label class="set-row"><span>${label}</span>${input}</label>`;
  const range = (k, min, max) => `<input type="range" data-k="${k}" min="${min}" max="${max}" value="${settings[k]}" /><b data-v="${k}">${settings[k]}</b>`;
  root.innerHTML = `
    <div class="set-group"><div class="set-head">Sound</div>
      ${row('Master volume', range('master', 0, 100))}
      ${row('Effects volume', range('sfx', 0, 100))}
    </div>
    <div class="set-group"><div class="set-head">Graphics</div>
      ${row('Quality', `<select data-k="quality">${Object.keys(QUALITY).map((q) => `<option value="${q}" ${q === settings.quality ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}</select>`)}
      <div class="muted set-note">Character detail, shadows and resolution. Character detail applies the next time your drifter is built.</div>
      ${row('Show FPS', `<input type="checkbox" data-k="showFps" ${settings.showFps ? 'checked' : ''} />`)}
    </div>
    <div class="set-group"><div class="set-head">Controls</div>
      ${row('Camera sensitivity', range('camSens', 25, 200))}
    </div>`;
  root.querySelectorAll('[data-k]').forEach((el) => {
    el.addEventListener('input', () => {
      const k = el.dataset.k;
      settings[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
      const v = root.querySelector(`[data-v="${k}"]`);
      if (v) v.textContent = settings[k];
      saveSettings(settings);
      onChange(settings, k);
    });
  });
}
