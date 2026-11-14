/**
 * CONCERT MASTER — Main Game Loop, Menus, Input Judge, Repertoire Loader & UI Controller
 */

import {
  KEY_MODES,
  extractTrackFeatures,
  hydrateSidecarFeatures,
  buildChart,
  ConcertAudioController,
} from './audio-engine.js?v=cm47';
import { StageRenderer } from './stage-renderer.js?v=cm47';
import { BUILTIN_REPERTOIRE } from './repertoire.js?v=cm47';


const DIFFICULTY_LABELS = { fewer: 'Easy', more: 'Hard' };
const MENU_SCREENS = ['title', 'menu', 'select', 'settings'];
const PREVIEW_LENGTH = 15; // seconds of looping preview on Song Select

// Generous, crisp timing windows tuned for acoustic band/classical transients
const TIMING_WINDOWS = {
  perfect: 0.048, // ±48ms
  great: 0.095,   // ±95ms
  good: 0.138,    // ±138ms
  missAfter: 0.145,
};

class ConcertMasterApp {
  constructor() {
    this.audio = new ConcertAudioController();
    this.stage = new StageRenderer(document.getElementById('stage-canvas'));

    // Player settings — Concert Master plays exclusively on D F J K (Easy = Fewer Notes, Hard = More Notes)
    this.keyModeId = '4k';
    this.density = 'more';
    this.approachTime = 1.38; // seconds from horizon to strike line
    this.audioOffsetMs = 0;

    // Selected track & cached analysis
    this.selectedSource = { type: 'builtin', track: BUILTIN_REPERTOIRE[0] };
    this.featureCache = new Map(); // cacheKey -> { buffer, features, title, composer }
    this.sidecarCache = new Map(); // track.id -> parsed sidecar JSON
    this.activeTrackData = null;
    this.activeChart = null;
    this.activeSongId = null; // builtin id of the song currently being played (null for custom files)
    this.activeDensity = 'more';

    // Menu state
    this.screenState = 'title'; // 'title' | 'menu' | 'select' | 'settings' | 'analyzing' | 'playing' | 'paused' | 'results'
    this.menuIndex = 0;
    this.settingsIndex = 0;
    this.pauseIndex = 0;
    this.wheelIndex = 0;
    this.showRehearsal = false;
    this.customFile = null;
    this.ratings = {};
    this.bests = {};
    this.syncReturnScreen = null;

    // Song Select looping preview
    this.previewEl = null;
    this.previewTrackId = null;
    this.previewTimer = null;
    this.previewFadeRaf = null;
    this.previewWindowCache = new Map();

    // Live gameplay state
    this.pressedLanes = new Array(8).fill(false);
    this.spacePressed = false;
    this.scanCursor = 0;

    // Score & accuracy state
    this.stats = this._freshStats();
    this.sectionAccuracyBuckets = new Array(48).fill(null).map(() => ({ sum: 0, count: 0 }));
    this.recentHitDeltasMs = [];
    this.judgmentTimer = null;

    // Tap-to-Sync Metronome Calibrator state
    this.syncActive = false;
    this.syncBeatPeriod = 0.75; // 80 BPM -> 750ms between woodblock clicks
    this.syncAnchorCtxTime = 0;
    this.syncNextBeatIndex = 0;
    this.syncSchedulerId = null;
    this.syncTapOffsetsMs = [];
    this.syncDetectedMs = 0;

    this._loadSavedPrefs();
    this._loadBests();
    this._bindDOM();
    this._applySavedPrefsToInputs();
    this._setScreen('title');
    this._loadRatings();
    this._probeBuiltinSidecars();

    window.addEventListener('resize', () => this.stage.resize());
    this._lastFrameTs = performance.now();
    requestAnimationFrame((ts) => this._loop(ts));
  }

  _freshStats() {
    return {
      score: 0,
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
      weightedHits: 0,
      judgedCount: 0,
    };
  }

  _bindDOM() {
    // Screens
    this.elTitle = document.getElementById('title-screen');
    this.elMenu = document.getElementById('menu-screen');
    this.elSelect = document.getElementById('select-screen');
    this.elSettings = document.getElementById('settings-screen');
    this.elBackdrop = document.getElementById('menu-backdrop');
    this.elAnalysis = document.getElementById('analysis-screen');
    this.elHud = document.getElementById('hud-screen');
    this.elResults = document.getElementById('results-screen');
    this.elPauseModal = document.getElementById('pause-modal');
    this.elErrorBanner = document.getElementById('lobby-error');

    // Title screen: any key / click starts (keyboard handled in _onKeyDown)
    this.elTitle.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      this._advanceFromTitle();
    });

    // Main menu
    this.menuItems = Array.from(document.querySelectorAll('#menu-screen .menu-item'));
    this.menuItems.forEach((btn, idx) => {
      btn.addEventListener('mouseenter', () => this._focusMenuItem(idx, true));
      btn.addEventListener('click', () => this._activateMenuItem(idx));
    });

    // Song select
    this.elWheel = document.getElementById('song-wheel');
    this.elDetail = document.getElementById('song-detail');
    this.elRehearsalToggle = document.getElementById('rehearsal-toggle');
    this.elRehearsalToggle.addEventListener('change', () => {
      this.showRehearsal = this.elRehearsalToggle.checked;
      const cur = this._wheelEntries()[this.wheelIndex];
      this._renderWheel();
      const entries = this._wheelEntries();
      const keep = entries.findIndex((en) => cur && en.key === cur.key);
      this._setWheelIndex(keep >= 0 ? keep : 0, false);
      this.elRehearsalToggle.blur();
    });
    document.getElementById('wheel-viewport').addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (Math.abs(e.deltaY) < 8) return;
        this._setWheelIndex(this.wheelIndex + (e.deltaY > 0 ? 1 : -1));
      },
      { passive: false }
    );
    document.querySelectorAll('.diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => this._setDensity(btn.dataset.density));
    });

    // Custom Track drop zone
    this.elDropZone = document.getElementById('drop-zone');
    this.elDropTitle = document.getElementById('drop-zone-title');
    this.elDropHint = document.getElementById('drop-zone-hint');
    this.elFileInput = document.getElementById('audio-file-input');
    this.elDropZone.addEventListener('click', () => this.elFileInput.click());
    this.elFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) this._selectLocalFile(e.target.files[0]);
    });
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.screenState === 'select') this.elDropZone.classList.add('drag-active');
    });
    window.addEventListener('dragleave', () => this.elDropZone.classList.remove('drag-active'));
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      this.elDropZone.classList.remove('drag-active');
      if (this.screenState !== 'select') return;
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        this._selectLocalFile(e.dataTransfer.files[0]);
        // Jump the wheel to the Custom Track card
        const entries = this._wheelEntries();
        this._setWheelIndex(entries.length - 1);
      }
    });

    // Settings
    this.settingRows = Array.from(document.querySelectorAll('#settings-screen .setting-row'));
    this.settingRows.forEach((row, idx) => {
      row.addEventListener('mouseenter', () => this._focusSetting(idx));
    });
    document.getElementById('btn-settings-back').addEventListener('click', () => this._goBack());

    // Sliders (mirrored between Settings and Pause Modal)
    this._bindSliderPair('hitsound-slider', 'pause-hitsound-slider', (val) => {
      const pct = Number(val);
      this.hitsoundPct = pct;
      this.audio.hitsoundVolume = (pct / 100) * 0.72;
      document.getElementById('hitsound-val').textContent = `${pct}%`;
      document.getElementById('pause-hitsound-val').textContent = `${pct}%`;
      this._savePrefs();
    });

    this._bindSliderPair('speed-slider', 'pause-speed-slider', (val) => {
      const speedVal = Number(val); // 1..10 -> approachTime 1.85s .. 0.86s
      this.speedVal = speedVal;
      this.approachTime = 1.96 - speedVal * 0.11;
      document.getElementById('speed-val').textContent = `${speedVal}x`;
      document.getElementById('pause-speed-val').textContent = `${speedVal}x`;
      this._savePrefs();
    });

    this._bindSliderPair('offset-slider', 'pause-offset-slider', (val) => {
      this._setAudioOffsetMs(Number(val));
    });

    // Tap-to-Sync Calibrator & Live Tendency Auto-Adjust Buttons
    this.elSyncModal = document.getElementById('sync-modal');
    document.getElementById('btn-open-sync').addEventListener('click', () => this.openSyncCalibrator());
    document.getElementById('btn-pause-open-sync').addEventListener('click', () => this.openSyncCalibrator());
    document.getElementById('btn-sync-reset').addEventListener('click', () => this._resetSyncTaps());
    document.getElementById('btn-sync-cancel').addEventListener('click', () => this.closeSyncCalibrator());
    document.getElementById('btn-sync-apply').addEventListener('click', () => {
      this._setAudioOffsetMs(this.syncDetectedMs);
      this.recentHitDeltasMs = [];
      this._updatePauseTendencyUI();
      this.closeSyncCalibrator();
    });
    document.getElementById('btn-apply-tendency').addEventListener('click', () => {
      const med = this._computeMedianHitDeltaMs();
      if (med !== null) {
        this._setAudioOffsetMs(this.audioOffsetMs + med);
        this.recentHitDeltasMs = [];
        this._updatePauseTendencyUI();
      }
    });

    // Start / HUD / Pause / Results Buttons
    document.getElementById('btn-start-game').addEventListener('click', () => this._playSelected());
    document.getElementById('btn-pause').addEventListener('click', () => this.pauseConcert());
    document.getElementById('btn-lobby-hud').addEventListener('click', () => this.returnToLobby());

    this.pauseItems = [
      document.getElementById('btn-resume'),
      document.getElementById('btn-restart'),
      document.getElementById('btn-pause-lobby'),
    ];
    this.pauseItems.forEach((btn, idx) => btn.addEventListener('mouseenter', () => this._focusPauseItem(idx)));
    document.getElementById('btn-resume').addEventListener('click', () => this.resumeConcert());
    document.getElementById('btn-restart').addEventListener('click', () => {
      this.elPauseModal.classList.add('hidden');
      this._beginChartPlayback();
    });
    document.getElementById('btn-pause-lobby').addEventListener('click', () => this.returnToLobby());

    document.getElementById('btn-replay').addEventListener('click', () => {
      this._uiSound('confirm');
      this._beginChartPlayback();
    });
    document.getElementById('btn-results-lobby').addEventListener('click', () => this.returnToLobby());

    // Interactive Dynamic Elevation Scrubber
    this.elTimelineCanvas = document.getElementById('timeline-canvas');
    this.elTimelineCanvas.addEventListener('click', (e) => this._handleTimelineSeek(e));

    // Global Keyboard Listeners
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
  }

  _bindSliderPair(idA, idB, onChange) {
    const a = document.getElementById(idA);
    const b = document.getElementById(idB);
    a.addEventListener('input', () => {
      b.value = a.value;
      onChange(a.value);
    });
    b.addEventListener('input', () => {
      a.value = b.value;
      onChange(b.value);
    });
  }

  async _probeBuiltinSidecars() {
    await Promise.all(
      BUILTIN_REPERTOIRE.map(async (track) => {
        const baseSidecar = track.sidecarUrl || track.url.replace(/\.[^/.]+$/, '.cadenza.json');
        try {
          const resp = await fetch(baseSidecar, { cache: 'no-cache' });
          if (resp.ok) {
            const data = await resp.json();
            if (data && Array.isArray(data.melodyNotes)) {
              this.sidecarCache.set(track.id, data);
            }
          }
        } catch (_err) {
          // Live DSP fallback remains available
        }
      })
    );
    if (this.screenState === 'select') this._renderSelectDetail();
    this._renderWheel();
  }

  async _loadRatings() {
    try {
      const resp = await fetch('./ratings.json?v=cm1', { cache: 'no-cache' });
      if (resp.ok) this.ratings = await resp.json();
    } catch (_err) {
      this.ratings = {};
    }
    this._renderWheel();
    if (this.screenState === 'select') this._renderSelectDetail();
  }

  // ------------------------------------------------------------------
  // Screen state machine
  // ------------------------------------------------------------------

  _setScreen(next) {
    const prev = this.screenState;
    this.screenState = next;
    this.elTitle.classList.toggle('hidden', next !== 'title');
    this.elMenu.classList.toggle('hidden', next !== 'menu');
    this.elSelect.classList.toggle('hidden', next !== 'select');
    this.elSettings.classList.toggle('hidden', next !== 'settings');
    this.elBackdrop.classList.toggle('hidden', !MENU_SCREENS.includes(next) && next !== 'analyzing');
    this.elAnalysis.classList.toggle('hidden', next !== 'analyzing');
    this.elHud.classList.toggle('hidden', next !== 'playing' && next !== 'paused');
    this.elResults.classList.toggle('hidden', next !== 'results');
    this.elPauseModal.classList.toggle('hidden', next !== 'paused');

    if (next === 'menu') this._focusMenuItem(this.menuIndex);
    if (next === 'settings') this._focusSetting(this.settingsIndex);
    if (next === 'paused') this._focusPauseItem(0);
    if (next === 'select') {
      this._renderWheel();
      this._setWheelIndex(this.wheelIndex, false, true);
    } else if (prev === 'select') {
      this._stopPreview();
    }
  }

  _advanceFromTitle() {
    if (this.screenState !== 'title') return;
    this.audio.ensureContext();
    this._uiSound('confirm');
    this._setScreen('menu');
  }

  _goBack() {
    this._uiSound('back');
    if (this.screenState === 'menu') this._setScreen('title');
    else if (this.screenState === 'select' || this.screenState === 'settings') this._setScreen('menu');
  }

  _focusMenuItem(idx, fromMouse = false) {
    const n = this.menuItems.length;
    const next = ((idx % n) + n) % n;
    if (fromMouse && next !== this.menuIndex) this._uiSound('move');
    this.menuIndex = next;
    this.menuItems.forEach((btn, i) => btn.classList.toggle('focused', i === next));
  }

  _activateMenuItem(idx) {
    const action = this.menuItems[idx].dataset.menu;
    this._focusMenuItem(idx);
    this._uiSound('confirm');
    if (action === 'play') this._setScreen('select');
    else if (action === 'settings') this._setScreen('settings');
    else if (action === 'calibrate') this.openSyncCalibrator();
  }

  _focusSetting(idx) {
    const n = this.settingRows.length;
    this.settingsIndex = ((idx % n) + n) % n;
    this.settingRows.forEach((row, i) => row.classList.toggle('focused', i === this.settingsIndex));
  }

  _nudgeSetting(dir) {
    const row = this.settingRows[this.settingsIndex];
    const input = row.querySelector('input[type="range"]');
    const step = Number(input.step || 1) * (row.dataset.setting === 'offset' ? 5 : 1) * (row.dataset.setting === 'hitsound' ? 5 : 1);
    const next = Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + dir * step));
    if (next === Number(input.value)) return;
    input.value = String(next);
    input.dispatchEvent(new Event('input'));
    this._uiSound('move');
  }

  _focusPauseItem(idx) {
    const n = this.pauseItems.length;
    this.pauseIndex = ((idx % n) + n) % n;
    this.pauseItems.forEach((btn, i) => btn.classList.toggle('focused', i === this.pauseIndex));
  }

  // ------------------------------------------------------------------
  // Song wheel
  // ------------------------------------------------------------------

  _wheelEntries() {
    const songs = BUILTIN_REPERTOIRE.filter((t) => !t.wip || this.showRehearsal).map((t) => ({
      key: t.id,
      type: 'builtin',
      track: t,
    }));
    songs.push({ key: '__custom__', type: 'custom' });
    return songs;
  }

  _ratingFor(trackId) {
    const r = this.ratings[trackId];
    return r && r.hard ? r.hard.rating : null;
  }

  _ratingMarkup(rating, withCaption = false) {
    if (rating === null || rating === undefined) return '<span class="rating-caption">Unrated</span>';
    if (rating >= 5) {
      return `${'<span class="rating-note">♬</span>'.repeat(4)}${withCaption ? '<span class="rating-caption">Extra Hard</span>' : ''}`;
    }
    const notes = Array.from({ length: 4 }, (_, i) => `<span class="rating-note${i < rating ? ' on' : ''}">♩</span>`).join('');
    const captions = ['Warm-up', 'Easy-going', 'Moderate', 'Challenging', 'Virtuoso'];
    return `${notes}${withCaption ? `<span class="rating-caption">${captions[rating]}</span>` : ''}`;
  }

  _renderWheel() {
    if (!this.elWheel) return;
    const entries = this._wheelEntries();
    this.elWheel.innerHTML = '';
    entries.forEach((en, idx) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.id = `wheel-card-${en.key}`;
      card.className = 'wheel-card';
      card.setAttribute('role', 'option');
      if (en.type === 'builtin') {
        const t = en.track;
        const rating = this._ratingFor(t.id);
        const best = this.bests[`${t.id}:${this.density}`];
        card.innerHTML = `
          <div class="wheel-card-meta">
            <span class="wheel-card-composer">${t.composer}</span>
            <span class="wheel-card-title">${t.title}</span>
          </div>
          <div class="wheel-card-right">
            <span class="rating-notes${rating >= 5 ? ' extra' : ''}">${this._ratingMarkup(rating)}</span>
            ${t.wip ? '<span class="wip-tag">Rehearsal</span>' : `<span class="wheel-card-rank">${best ? best.rank + (best.fc ? ' · FC' : '') : ''}</span>`}
          </div>`;
      } else {
        card.classList.add('custom');
        card.innerHTML = `
          <div class="wheel-card-meta">
            <span class="wheel-card-composer">Your Recording</span>
            <span class="wheel-card-title">${this.customFile ? this.customFile.name : 'Custom Track…'}</span>
          </div>
          <div class="wheel-card-right"><span class="wip-tag">Any Audio</span></div>`;
      }
      card.addEventListener('click', () => {
        if (idx === this.wheelIndex) this._playSelected();
        else this._setWheelIndex(idx);
      });
      this.elWheel.appendChild(card);
    });
    this._layoutWheel();
  }

  _layoutWheel() {
    const cards = this.elWheel ? Array.from(this.elWheel.children) : [];
    cards.forEach((card, idx) => {
      const off = idx - this.wheelIndex;
      card.style.setProperty('--offset', String(off));
      card.style.setProperty('--abs', String(Math.min(3, Math.abs(off))));
      card.classList.toggle('selected', off === 0);
      card.classList.toggle('far', Math.abs(off) > 3);
      card.setAttribute('aria-selected', off === 0 ? 'true' : 'false');
    });
  }

  _setWheelIndex(idx, withSound = true, force = false) {
    const entries = this._wheelEntries();
    const next = Math.max(0, Math.min(entries.length - 1, idx));
    const changed = next !== this.wheelIndex;
    if (!changed && !force) return;
    this.wheelIndex = next;
    if (changed && withSound) this._uiSound('move');
    const en = entries[next];
    if (en.type === 'builtin') {
      this.selectedSource = { type: 'builtin', track: en.track };
    } else if (this.customFile) {
      this.selectedSource = { type: 'file', file: this.customFile };
    } else {
      this.selectedSource = { type: 'none' };
    }
    this._layoutWheel();
    this._renderSelectDetail(changed);
    this._schedulePreview(en.type === 'builtin' ? en.track : null);
  }

  _setDensity(density) {
    if (density !== 'fewer' && density !== 'more') return;
    if (density !== this.density) this._uiSound('move');
    this.density = density;
    this._savePrefs();
    this._renderWheel();
    this._renderSelectDetail();
  }

  _renderSelectDetail(animate = false) {
    if (!this.elDetail) return;
    const entries = this._wheelEntries();
    const en = entries[Math.min(this.wheelIndex, entries.length - 1)];
    if (!en) return;
    const isCustom = en.type === 'custom';
    this.elErrorBanner.classList.add('hidden');

    document.querySelectorAll('.diff-btn').forEach((btn) => {
      const on = btn.dataset.density === this.density;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    document.getElementById('best-diff-label').textContent = DIFFICULTY_LABELS[this.density];

    const elRating = document.getElementById('detail-rating');
    const bestPanel = document.getElementById('best-panel');
    if (isCustom) {
      document.getElementById('detail-composer').textContent = 'Custom Track';
      document.getElementById('detail-title').textContent = this.customFile ? this.customFile.name.replace(/\.[^/.]+$/, '') : 'Bring Your Own Recording';
      document.getElementById('detail-ensemble').textContent = 'Charted live in your browser from any audio file';
      document.getElementById('detail-length').textContent = '—';
      elRating.className = 'rating-notes';
      elRating.innerHTML = '<span class="rating-caption">Auto-charted</span>';
      bestPanel.classList.add('hidden');
      this.elDropZone.classList.remove('hidden');
    } else {
      const t = en.track;
      const sc = this.sidecarCache.get(t.id);
      document.getElementById('detail-composer').textContent = t.composer;
      document.getElementById('detail-title').textContent = t.title;
      document.getElementById('detail-ensemble').textContent = t.ensemble;
      document.getElementById('detail-length').textContent = sc ? this._formatTime(sc.duration) : '—';
      const rating = this._ratingFor(t.id);
      elRating.className = `rating-notes${rating >= 5 ? ' extra' : ''}`;
      elRating.innerHTML = this._ratingMarkup(rating, true);
      bestPanel.classList.remove('hidden');
      this.elDropZone.classList.add('hidden');

      const best = this.bests[`${t.id}:${this.density}`];
      document.getElementById('best-rank').textContent = best ? best.rank : '—';
      document.getElementById('best-score').textContent = best ? best.score.toLocaleString() : 'No record yet';
      document.getElementById('best-acc').textContent = best ? `${best.acc.toFixed(2)}% accuracy` : 'Play it to set your first record';
      document.getElementById('best-fc').classList.toggle('hidden', !(best && best.fc));
    }

    document.getElementById('btn-start-game').disabled = isCustom && !this.customFile;

    if (animate) {
      this.elDetail.classList.remove('swap');
      void this.elDetail.offsetWidth; // restart the swap animation
      this.elDetail.classList.add('swap');
    }
  }

  _selectLocalFile(file) {
    this.customFile = file;
    this.selectedSource = { type: 'file', file };
    this.elErrorBanner.classList.add('hidden');
    this.elDropTitle.textContent = file.name;
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    this.elDropHint.textContent = `Ready (${mb} MB) · Click or drop another file to swap`;
    this._renderWheel();
    this._renderSelectDetail();
  }

  _playSelected() {
    if (this.screenState !== 'select') return;
    if (this.selectedSource.type === 'none') {
      this.elFileInput.click();
      return;
    }
    this._uiSound('confirm');
    this._stopPreview();
    this.startConcert();
  }

  // ------------------------------------------------------------------
  // Looping song preview (Song Select)
  // ------------------------------------------------------------------

  _previewWindowFor(track) {
    if (typeof track.previewStart === 'number') return track.previewStart;
    if (this.previewWindowCache.has(track.id)) return this.previewWindowCache.get(track.id);
    const sc = this.sidecarCache.get(track.id);
    let start = 30;
    if (sc && Array.isArray(sc.macroIntensity) && sc.macroIntensity.length > 0) {
      // Loudest + busiest 15s window: macro intensity (10 Hz) weighted by chart note density
      const hz = sc.macroHz || 10;
      const inten = sc.macroIntensity;
      const dur = sc.duration || inten.length / hz;
      const density = new Float32Array(inten.length);
      for (const n of sc.melodyNotes || []) {
        const i = Math.floor(n[0] * hz);
        if (i >= 0 && i < density.length) density[i] += 1;
      }
      const win = Math.round(PREVIEW_LENGTH * hz);
      const lo = Math.round(5 * hz);
      const hi = Math.max(lo + 1, Math.round((dur - PREVIEW_LENGTH - 2) * hz));
      let sumI = 0;
      let sumD = 0;
      for (let i = lo; i < lo + win && i < inten.length; i++) {
        sumI += inten[i];
        sumD += density[i];
      }
      let best = -1;
      let bestIdx = lo;
      for (let i = lo; i < hi && i + win < inten.length; i++) {
        const score = sumI / win + 0.06 * (sumD / PREVIEW_LENGTH);
        if (score > best) {
          best = score;
          bestIdx = i;
        }
        sumI += inten[i + win] - inten[i];
        sumD += density[i + win] - density[i];
      }
      start = bestIdx / hz;
    }
    this.previewWindowCache.set(track.id, start);
    return start;
  }

  _schedulePreview(track) {
    clearTimeout(this.previewTimer);
    if (!track) {
      this._stopPreview();
      return;
    }
    if (this.previewTrackId === track.id && this.previewEl && !this.previewEl.paused) return;
    this._fadePreviewTo(0, 220, () => {
      this.previewTimer = setTimeout(() => this._startPreview(track), 260);
    });
  }

  _startPreview(track) {
    if (this.screenState !== 'select') return;
    const start = this._previewWindowFor(track);
    if (!this.previewEl) {
      this.previewEl = new Audio();
      this.previewEl.preload = 'auto';
      this.previewEl.addEventListener('timeupdate', () => this._onPreviewTick());
    }
    const el = this.previewEl;
    this.previewTrackId = track.id;
    this.previewStart = start;
    this.previewLooping = false;
    el.volume = 0;
    const absUrl = new URL(track.url, window.location.href).href;
    if (el.src !== absUrl) el.src = track.url;
    const begin = () => {
      try {
        el.currentTime = start;
      } catch (_err) {
        // Seek before metadata; retried on loadedmetadata
      }
      el.play()
        .then(() => {
          if (this.screenState === 'select' && this.previewTrackId === track.id) this._fadePreviewTo(0.55, 900);
          else el.pause();
        })
        .catch(() => {});
    };
    if (el.readyState >= 1) begin();
    else el.addEventListener('loadedmetadata', begin, { once: true });
  }

  _onPreviewTick() {
    const el = this.previewEl;
    if (!el || el.paused || this.previewLooping) return;
    if (el.currentTime >= this.previewStart + PREVIEW_LENGTH - 1.0) {
      this.previewLooping = true;
      this._fadePreviewTo(0, 900, () => {
        el.currentTime = this.previewStart;
        this.previewLooping = false;
        if (this.screenState === 'select') this._fadePreviewTo(0.55, 900);
      });
    }
  }

  _fadePreviewTo(target, ms, done) {
    cancelAnimationFrame(this.previewFadeRaf);
    const el = this.previewEl;
    if (!el) {
      if (done) done();
      return;
    }
    const from = el.volume;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      el.volume = Math.max(0, Math.min(1, from + (target - from) * k));
      if (k < 1) {
        this.previewFadeRaf = requestAnimationFrame(step);
      } else {
        if (target === 0 && !this.previewLooping) el.pause();
        if (done) done();
      }
    };
    this.previewFadeRaf = requestAnimationFrame(step);
  }

  _stopPreview() {
    clearTimeout(this.previewTimer);
    this.previewTrackId = null;
    this.previewLooping = false;
    if (this.previewEl && !this.previewEl.paused) this._fadePreviewTo(0, 300);
  }

  // ------------------------------------------------------------------
  // Synthesized UI sounds (bell tick / brass "tah!" / low thunk)
  // ------------------------------------------------------------------

  _uiSound(kind) {
    const ctx = this.audio.ensureContext();
    if (!ctx) return;
    const vol = Math.max(0, Math.min(1, (this.hitsoundPct ?? 52) / 100));
    if (vol <= 0.001) return;
    const now = ctx.currentTime + 0.005;
    const out = ctx.createGain();
    out.connect(ctx.destination);

    const tone = (type, freq, t0, dur, peak, freqEnd = null) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak * vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(out);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
      return osc;
    };

    if (kind === 'move') {
      // Soft celesta-like bell tick
      tone('sine', 1760, now, 0.16, 0.09);
      tone('sine', 3520, now, 0.08, 0.025);
    } else if (kind === 'confirm') {
      // Brass "tah!": filtered sawtooth fifth with a quick swell
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, now);
      lp.frequency.exponentialRampToValueAtTime(3200, now + 0.06);
      lp.frequency.exponentialRampToValueAtTime(1100, now + 0.32);
      lp.connect(out);
      out.disconnect();
      const brass = ctx.createGain();
      brass.connect(lp);
      lp.connect(ctx.destination);
      [[523.25, 0.11], [783.99, 0.08]].forEach(([f, pk]) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f * 0.985, now);
        osc.frequency.exponentialRampToValueAtTime(f, now + 0.04);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(pk * vol, now + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
        osc.connect(g);
        g.connect(brass);
        osc.start(now);
        osc.stop(now + 0.42);
      });
    } else if (kind === 'back') {
      // Low felt thunk
      tone('triangle', 220, now, 0.18, 0.14, 110);
    }
  }

  async startConcert() {
    this.elErrorBanner.classList.add('hidden');
    this.audio.ensureContext();

    const cacheKey =
      this.selectedSource.type === 'builtin'
        ? `builtin:${this.selectedSource.track.id}`
        : `file:${this.selectedSource.file.name}:${this.selectedSource.file.size}:${this.selectedSource.file.lastModified}`;
    this.activeSongId = this.selectedSource.type === 'builtin' ? this.selectedSource.track.id : null;

    if (this.featureCache.has(cacheKey)) {
      this.activeTrackData = this.featureCache.get(cacheKey);
      this.audio.activateTrackAudio(this.activeTrackData);
      this._beginChartPlayback();
      return;
    }

    this._setScreen('analyzing');
    const progFill = document.getElementById('analysis-progress-fill');
    const statusText = document.getElementById('analysis-status-text');
    const updateProgress = (pct, msg) => {
      progFill.style.width = `${Math.round(pct * 100)}%`;
      statusText.textContent = msg;
    };

    try {
      let arrayBuffer = null;
      let sidecarJson = null;
      let title;
      let composer;
      let isExternalStream = false;
      let streamUrl = null;

      if (this.selectedSource.type === 'builtin') {
        const t = this.selectedSource.track;
        title = t.title;
        composer = t.composer;
        updateProgress(0.03, `Loading ${t.title}...`);
        sidecarJson = this.sidecarCache.get(t.id) || null;
        const baseSidecar = t.sidecarUrl || t.url.replace(/\.[^/.]+$/, '.cadenza.json');
        const sidecarUrl = `${baseSidecar}?v=${Date.now()}`;
        if (!sidecarJson) {
          const sidecarResp = await fetch(sidecarUrl, { cache: 'no-store' }).catch(() => null);
          if (sidecarResp && sidecarResp.ok) {
            sidecarJson = await sidecarResp.json().catch(() => null);
            if (sidecarJson) this.sidecarCache.set(t.id, sidecarJson);
          }
        }

        if (/^https?:\/\//i.test(t.url) && sidecarJson) {
          isExternalStream = true;
          streamUrl = t.url;
        } else {
          const resp = await fetch(t.url);
          if (!resp.ok) {
            throw new Error(`Could not load ${t.url} (HTTP ${resp.status}). Drop any local MP3/M4A/WAV file to play!`);
          }
          arrayBuffer = await resp.arrayBuffer();
        }
      } else {
        const f = this.selectedSource.file;
        title = f.name.replace(/\.[^/.]+$/, '');
        composer = 'Custom Audio Selection';
        updateProgress(0.04, `Reading ${f.name}...`);
        // Also check if a pre-analyzed .cadenza.json exists in ./audio/<basename>.cadenza.json
        const localSidecarUrl = `./audio/${encodeURIComponent(title)}.cadenza.json?v=${Date.now()}`;
        const sidecarResp = await fetch(localSidecarUrl, { cache: 'no-store' }).catch(() => null);
        if (sidecarResp && sidecarResp.ok) {
          sidecarJson = await sidecarResp.json().catch(() => null);
        }
        arrayBuffer = await f.arrayBuffer();
      }

      let decodedBuffer = null;
      let mediaEl = null;
      let features;

      if (isExternalStream && streamUrl && sidecarJson) {
        updateProgress(0.45, `Buffering official concert stream (${title})...`);
        mediaEl = await this.audio.loadMediaStream(streamUrl, sidecarJson.duration);
        features = hydrateSidecarFeatures(sidecarJson, null);
      } else {
        updateProgress(0.06, 'Decoding concert waveform...');
        decodedBuffer = await this.audio.decodeAudio(arrayBuffer);
        features = sidecarJson
          ? hydrateSidecarFeatures(sidecarJson, decodedBuffer)
          : await extractTrackFeatures(decodedBuffer, updateProgress);
      }

      const entry = {
        buffer: decodedBuffer,
        mediaEl,
        features,
        title,
        composer,
      };
      this.featureCache.set(cacheKey, entry);
      this.activeTrackData = entry;
      this._beginChartPlayback();
    } catch (err) {
      console.error(err);
      this._setScreen('select');
      this.elErrorBanner.textContent =
        err.message || 'Unable to decode this audio file. Please try an MP3, M4A, WAV, FLAC, or OGG file.';
      this.elErrorBanner.classList.remove('hidden');
    }
  }

  _beginChartPlayback() {
    const { features, title, composer } = this.activeTrackData;
    this.activeDensity = this.density;
    this.activeChart = buildChart(features, {
      keyMode: this.keyModeId,
      density: this.density,
    });

    this.stats = this._freshStats();
    this.sectionAccuracyBuckets = new Array(48).fill(null).map(() => ({ sum: 0, count: 0 }));
    this.recentHitDeltasMs = [];
    this.scanCursor = 0;
    this.pressedLanes = new Array(this.activeChart.mode.lanes + 2).fill(false); // (+2: ghost S / L keys)
    this.spacePressed = false;

    // Populate HUD headers
    document.getElementById('hud-title').textContent = title;
    this._baseHudSubtitle = `${composer} · ${DIFFICULTY_LABELS[this.density]}`;
    document.getElementById('hud-subtitle').textContent = this._baseHudSubtitle;
    const elPill = document.getElementById('hud-engine-pill');
    if (elPill) {
      if (features.isNeuralSidecar) {
        const isScore = String(features.sidecarGenerator || '').startsWith('score_dtw');
        elPill.textContent = isScore ? 'SCORE SYNCED' : 'NEURAL ML';
        elPill.className = `engine-pill ${isScore ? 'score' : 'neural'}`;
      } else {
        elPill.textContent = 'LIVE DSP';
        elPill.className = 'engine-pill dsp';
      }
    }
    document.getElementById('time-total').textContent = this._formatTime(features.duration);

    this._updateHudStats();
    document.getElementById('hud-judgment').classList.remove('show');

    this._setScreen('playing');
    // Start with -1.5s pre-roll so even opening 0:00 hits glide cleanly down the highway!
    this.audio.play(-1.5);
  }

  pauseConcert() {
    if (this.screenState !== 'playing') return;
    this.audio.pause();
    this._updatePauseTendencyUI();
    this._setScreen('paused');
  }

  resumeConcert() {
    if (this.screenState !== 'paused') return;
    this._setScreen('playing');
    this.audio.resume();
  }

  returnToLobby() {
    this.audio.stopSource();
    this.audio.isPlaying = false;
    this._uiSound('back');
    this._setScreen('select');
  }

  _handleTimelineSeek(e) {
    if (!this.activeTrackData || !this.activeChart) return;
    if (this.screenState !== 'playing' && this.screenState !== 'paused') return;

    const rect = this.elTimelineCanvas.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = frac * this.activeTrackData.features.duration;

    // Mark notes prior to targetTime + 0.35s as completed (not missed!) so seeking doesn't tank accuracy
    const notes = this.activeChart.notes;
    let newCursor = 0;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.time < targetTime + 0.35) {
        n.hit = true;
        n.missed = false;
        n.holding = false;
        n.completed = true;
        newCursor = i + 1;
      } else {
        n.hit = false;
        n.missed = false;
        n.holding = false;
        n.completed = false;
      }
    }
    this.scanCursor = newCursor;
    this.audio.seek(targetTime);
  }

  _onMenuKey(e) {
    const code = e.code;
    const isUp = code === 'ArrowUp' || code === 'KeyF';
    const isDown = code === 'ArrowDown' || code === 'KeyJ';
    const isLeft = code === 'ArrowLeft' || code === 'KeyD';
    const isRight = code === 'ArrowRight' || code === 'KeyK';
    const isConfirm = code === 'Enter' || code === 'Space';
    const isBack = code === 'Escape' || code === 'Backspace';
    if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;

    if (this.screenState === 'title') {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || code === 'Tab') return;
      e.preventDefault();
      this._advanceFromTitle();
      return;
    }

    if (this.screenState === 'menu') {
      if (isUp || isDown) {
        e.preventDefault();
        this._focusMenuItem(this.menuIndex + (isUp ? -1 : 1));
        this._uiSound('move');
      } else if (isConfirm && !e.repeat) {
        e.preventDefault();
        this._activateMenuItem(this.menuIndex);
      } else if (isBack && !e.repeat) {
        e.preventDefault();
        this._goBack();
      }
      return;
    }

    if (this.screenState === 'select') {
      if (isUp || isDown) {
        e.preventDefault();
        this._setWheelIndex(this.wheelIndex + (isUp ? -1 : 1));
      } else if ((isLeft || isRight) && !e.repeat) {
        e.preventDefault();
        this._setDensity(isLeft ? 'fewer' : 'more');
      } else if (code === 'Tab' && !e.repeat) {
        e.preventDefault();
        this._setDensity(this.density === 'more' ? 'fewer' : 'more');
      } else if (isConfirm && !e.repeat) {
        e.preventDefault();
        this._playSelected();
      } else if (isBack && !e.repeat) {
        e.preventDefault();
        this._goBack();
      }
      return;
    }

    if (this.screenState === 'settings') {
      if (isUp || isDown) {
        e.preventDefault();
        this._focusSetting(this.settingsIndex + (isUp ? -1 : 1));
        this._uiSound('move');
      } else if (isLeft || isRight) {
        e.preventDefault();
        this._nudgeSetting(isLeft ? -1 : 1);
      } else if (isConfirm && !e.repeat) {
        e.preventDefault();
        this._goBack();
      } else if (isBack && !e.repeat) {
        e.preventDefault();
        this._goBack();
      }
    }
  }

  _onKeyDown(e) {
    // Menu screens (Title / Main Menu / Song Select / Settings) allow held-key auto-repeat for navigation
    if (!this.syncActive && MENU_SCREENS.includes(this.screenState)) {
      this._onMenuKey(e);
      return;
    }
    if (e.repeat) return;

    // Intercept keys when Tap-to-Sync Calibrator Modal is open!
    if (this.syncActive) {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.closeSyncCalibrator();
        return;
      }
      if (e.code === 'Enter' && this.syncTapOffsetsMs.length >= 3) {
        e.preventDefault();
        this._setAudioOffsetMs(this.syncDetectedMs);
        this.recentHitDeltasMs = [];
        this._updatePauseTendencyUI();
        this.closeSyncCalibrator();
        return;
      }
      if (['Space', 'KeyF', 'KeyJ', 'KeyD', 'KeyK'].includes(e.code)) {
        e.preventDefault();
        this._recordSyncTap();
      }
      return;
    }

    if (e.code === 'Escape') {
      if (this.screenState === 'playing') {
        e.preventDefault();
        this.pauseConcert();
      } else if (this.screenState === 'paused') {
        e.preventDefault();
        this.resumeConcert();
      } else if (this.screenState === 'results') {
        e.preventDefault();
        this.returnToLobby();
      }
      return;
    }

    // Pause menu & results keyboard navigation
    if (this.screenState === 'paused') {
      if (['ArrowUp', 'KeyF'].includes(e.code)) {
        e.preventDefault();
        this._focusPauseItem(this.pauseIndex - 1);
        this._uiSound('move');
      } else if (['ArrowDown', 'KeyJ'].includes(e.code)) {
        e.preventDefault();
        this._focusPauseItem(this.pauseIndex + 1);
        this._uiSound('move');
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this._uiSound('confirm');
        this.pauseItems[this.pauseIndex].click();
      }
      return;
    }
    if (this.screenState === 'results') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        document.getElementById('btn-replay').click();
      }
      return;
    }

    if (this.screenState !== 'playing') return;

    const mode = KEY_MODES[this.keyModeId];
    const laneIdx = this._laneForCode(mode, e.code);
    const isSpaceKey = e.code === 'Space' && mode.hasSpace;

    if (laneIdx === -1 && !isSpaceKey) return;
    e.preventDefault();

    const judgedTime = this._getJudgedSongTime();
    const curIntensity = this._getIntensityAt(judgedTime);

    if (isSpaceKey) {
      this.spacePressed = true;
      this.audio.playHitSound({
        isSpace: true,
        lane: -1,
        totalLanes: mode.lanes,
        intensity: Math.max(0.65, curIntensity),
      });
      this._judgeInput({ isSpace: true, lane: -1, judgedTime });
    } else if (laneIdx >= 0) {
      this.pressedLanes[laneIdx] = true;
      this.audio.playHitSound({
        isSpace: false,
        lane: laneIdx === mode.lanes ? 0 : laneIdx > mode.lanes ? mode.lanes - 1 : laneIdx, // ghosts sound like the end keys
        totalLanes: mode.lanes,
        intensity: curIntensity,
      });
      this._judgeInput({ isSpace: false, lane: laneIdx, judgedTime });
    }
  }

  /**
   * Lane index for a key: 0..lanes-1 for the normal keys; in modes with ghost keys (4 keys: S and L), the ghost keys
   * are lanes `lanes` (S, far left) and `lanes + 1` (L, far right). -1 if the key isn't a lane key.
   */
  _laneForCode(mode, code) {
    const idx = mode.codes.indexOf(code);
    if (idx >= 0) return idx;
    const g = mode.ghostCodes ? mode.ghostCodes.indexOf(code) : -1;
    return g >= 0 && (this.activeDensity || this.density) === 'more' ? mode.lanes + g : -1;
  }

  _onKeyUp(e) {
    const mode = KEY_MODES[this.keyModeId];
    const laneIdx = this._laneForCode(mode, e.code);
    if (laneIdx >= 0) {
      this.pressedLanes[laneIdx] = false;
      // Forgiving Hold release: stop holding cleanly without a miss penalty
      if (this.screenState === 'playing' && this.activeChart) {
        const notes = this.activeChart.notes;
        for (let i = Math.max(0, this.scanCursor - 25); i < notes.length; i++) {
          const n = notes[i];
          if (n.holding && n.lane === laneIdx) {
            n.holding = false;
            n.completed = true;
          }
          if (n.time > this._getJudgedSongTime() + 1.0) break;
        }
      }
    } else if (e.code === 'Space') {
      this.spacePressed = false;
    }
  }

  _judgeInput({ isSpace, lane, judgedTime }) {
    if (!this.activeChart) return;
    const notes = this.activeChart.notes;

    let bestNote = null;
    let bestAbsDiff = Infinity;

    for (let i = this.scanCursor; i < notes.length; i++) {
      const n = notes[i];
      if (n.hit || n.missed || n.completed) continue;
      const diff = n.time - judgedTime;
      if (diff > TIMING_WINDOWS.good) break;

      const matchesChannel = isSpace ? n.type === 'space' : n.type !== 'space' && n.lane === lane;
      if (!matchesChannel) continue;

      const absDiff = Math.abs(diff);
      if (absDiff <= TIMING_WINDOWS.good && absDiff < bestAbsDiff) {
        bestAbsDiff = absDiff;
        bestNote = n;
      }
    }

    if (!bestNote) return;

    let judgment = 'good';
    let weight = 0.4;
    let basePts = 350;
    if (bestAbsDiff <= TIMING_WINDOWS.perfect) {
      judgment = 'perfect';
      weight = 1.0;
      basePts = 1000;
    } else if (bestAbsDiff <= TIMING_WINDOWS.great) {
      judgment = 'great';
      weight = 0.75;
      basePts = 700;
    }

    // Track signed hit timing error (positive = tapped late = needs higher +ms offset)
    const signedErrMs = Math.round((judgedTime - bestNote.time) * 1000);
    this.recentHitDeltasMs.push(signedErrMs);
    if (this.recentHitDeltasMs.length > 32) {
      this.recentHitDeltasMs.shift();
    }

    bestNote.hit = true;
    if (bestNote.type === 'hold') {
      bestNote.holding = true;
      bestNote.nextHoldTick = judgedTime + 0.2;
    } else {
      bestNote.completed = true;
    }

    this._recordJudgment(judgment, weight, basePts, bestNote.time);
    this.stage.triggerHitEffect({
      isSpace,
      lane,
      totalLanes: this.activeChart.mode.lanes,
      judgment,
    });
  }

  _recordJudgment(judgment, weight, basePts, noteTime) {
    const s = this.stats;
    s[judgment]++;
    s.judgedCount++;
    s.weightedHits += weight;

    if (judgment === 'miss') {
      s.combo = 0;
    } else {
      s.combo++;
      if (s.combo > s.maxCombo) s.maxCombo = s.combo;
      const mult = 1 + Math.min(1.5, Math.floor(s.combo / 25) * 0.15);
      s.score += Math.round(basePts * mult);
    }

    // Track accuracy bucket for post-concert performance graph
    if (this.activeTrackData) {
      const dur = Math.max(1, this.activeTrackData.features.duration);
      const bIdx = Math.min(
        this.sectionAccuracyBuckets.length - 1,
        Math.max(0, Math.floor((noteTime / dur) * this.sectionAccuracyBuckets.length))
      );
      this.sectionAccuracyBuckets[bIdx].sum += weight;
      this.sectionAccuracyBuckets[bIdx].count += 1;
    }

    this._showJudgmentCallout(judgment);
    this._updateHudStats();
  }

  _showJudgmentCallout(judgment) {
    const el = document.getElementById('hud-judgment');
    el.className = `judgment-text show judgment-${judgment}`;
    el.textContent = judgment.toUpperCase();

    const comboEl = document.getElementById('hud-combo');
    comboEl.style.transform = 'scale(1.1)';
    setTimeout(() => {
      comboEl.style.transform = 'scale(1)';
    }, 75);

    clearTimeout(this.judgmentTimer);
    this.judgmentTimer = setTimeout(() => {
      el.classList.remove('show');
    }, 520);
  }

  _updateHudStats() {
    const s = this.stats;
    const acc = s.judgedCount > 0 ? (s.weightedHits / s.judgedCount) * 100 : 100;
    document.getElementById('hud-combo').textContent = s.combo > 0 ? String(s.combo) : '—';
    document.getElementById('hud-accuracy').textContent = `${acc.toFixed(2)}%`;
    document.getElementById('hud-score').textContent = s.score.toLocaleString();
  }

  _getJudgedSongTime() {
    return this.audio.getSongTime() - this.audioOffsetMs / 1000;
  }

  _getIntensityAt(t) {
    if (!this.activeTrackData || t < 0) return 0.25;
    const f = this.activeTrackData.features;
    const idx = Math.min(f.numFrames - 1, Math.max(0, Math.floor(t / f.frameDt)));
    return f.macroIntensity[idx] || 0.25;
  }

  _loop(ts) {
    const dt = Math.min(0.05, Math.max(0.001, (ts - this._lastFrameTs) / 1000));
    this._lastFrameTs = ts;

    let songTime = 0;
    if (this.screenState === 'playing' && this.activeChart && this.activeTrackData) {
      songTime = this._getJudgedSongTime();
      this._stepGameplay(songTime);
      this._drawTimelineScrubber(songTime);
      document.getElementById('time-current').textContent = this._formatTime(Math.max(0, songTime));

      if (songTime >= this.activeTrackData.features.duration + 0.45) {
        this._finishConcert();
      }
    } else if (this.screenState === 'paused' && this.activeTrackData) {
      songTime = this._getJudgedSongTime();
    }

    const mode = KEY_MODES[this.keyModeId];
    this.stage.render(dt, {
      isPlaying: this.screenState === 'playing',
      songTime,
      approachTime: this.approachTime,
      mode,
      notes: this.screenState === 'playing' || this.screenState === 'paused' ? this.activeChart?.notes || [] : [],
      pressedLanes: this.pressedLanes,
      spacePressed: this.spacePressed,
      features: this.activeTrackData?.features || null,
      ghostEnabled: (this.activeDensity || this.density) === 'more',
    });

    requestAnimationFrame((nextTs) => this._loop(nextTs));
  }

  _stepGameplay(judgedTime) {
    const notes = this.activeChart.notes;
    const totalLanes = this.activeChart.mode.lanes;

    // Advance scanCursor past fully resolved notes
    while (this.scanCursor < notes.length) {
      const n = notes[this.scanCursor];
      if (n.completed || (n.missed && n.type !== 'hold') || (n.missed && judgedTime > n.endTime)) {
        this.scanCursor++;
      } else {
        break;
      }
    }

    for (let i = this.scanCursor; i < notes.length; i++) {
      const n = notes[i];
      if (n.time > judgedTime + 0.25) break;

      // Active Hold Ribbon sustain ticks
      if (n.holding) {
        if (judgedTime >= n.endTime - 0.04) {
          n.holding = false;
          n.completed = true;
          this.stats.combo++;
          if (this.stats.combo > this.stats.maxCombo) this.stats.maxCombo = this.stats.combo;
          this.stats.score += 250;
          this.stage.triggerHitEffect({
            isSpace: false,
            lane: n.lane,
            totalLanes,
            judgment: 'perfect',
          });
          this._updateHudStats();
        } else if (judgedTime >= n.nextHoldTick) {
          n.nextHoldTick += 0.2;
          this.stats.combo++;
          if (this.stats.combo > this.stats.maxCombo) this.stats.maxCombo = this.stats.combo;
          this.stats.score += 120;
          this.stage.laneBeams[n.lane] = 0.55;
          this._updateHudStats();
        }
        continue;
      }

      // Check unhit notes passing the miss threshold
      if (!n.hit && !n.missed && !n.completed && judgedTime - n.time > TIMING_WINDOWS.missAfter) {
        n.missed = true;
        if (n.type !== 'hold') n.completed = true;
        this._recordJudgment('miss', 0, 0, n.time);
      }
    }
  }

  _drawTimelineScrubber(songTime) {
    const canvas = this.elTimelineCanvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 28;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const prof = this.activeTrackData.features.elevationProfile;
    const dur = Math.max(0.1, this.activeTrackData.features.duration);
    const prog = Math.max(0, Math.min(1, songTime / dur));

    const barCount = prof.length;
    const barW = w / barCount;

    for (let i = 0; i < barCount; i++) {
      const frac = i / barCount;
      const amp = 0.14 + prof[i] * 0.84;
      const bh = amp * (h - 4);
      const x = i * barW;
      const y = h - bh - 2;

      if (frac <= prog) {
        ctx.fillStyle = prof[i] > 0.65 ? 'hsl(42, 90%, 70%)' : 'hsl(198, 62%, 70%)';
      } else {
        ctx.fillStyle = 'hsla(40, 25%, 70%, 0.22)';
      }
      ctx.fillRect(x, y, Math.max(1, barW - 0.6), bh);
    }

    // Playhead needle
    const px = prog * w;
    ctx.fillStyle = 'hsl(45, 100%, 88%)';
    ctx.fillRect(px - 1, 0, 2, h);
  }

  _finishConcert() {
    this.audio.stopSource();
    this.audio.isPlaying = false;

    const s = this.stats;
    const acc = s.judgedCount > 0 ? (s.weightedHits / s.judgedCount) * 100 : 100;

    let rank = 'C';
    if (acc >= 98.0 && s.miss === 0) rank = 'S+';
    else if (acc >= 94.0) rank = 'S';
    else if (acc >= 87.0) rank = 'A';
    else if (acc >= 76.0) rank = 'B';

    const rankEl = document.getElementById('res-rank');
    rankEl.textContent = rank;
    rankEl.classList.remove('stamp-in');
    document.getElementById('res-title').textContent = this.activeTrackData.title;
    document.getElementById('res-sub').textContent = this.activeTrackData.composer;
    document.getElementById('res-diff').textContent = DIFFICULTY_LABELS[this.activeDensity];

    const isFc = s.judgedCount > 0 && s.miss === 0;
    const fcEl = document.getElementById('res-fc');
    if (isFc) {
      fcEl.textContent = s.great === 0 && s.good === 0 ? 'All Perfect · 100% Pure' : 'Full Combo · Zero Misses';
      fcEl.style.display = 'inline-block';
    } else {
      fcEl.style.display = 'none';
    }

    document.getElementById('res-acc').textContent = `${acc.toFixed(2)}%`;
    document.getElementById('res-combo').textContent = String(s.maxCombo);
    document.getElementById('res-score').textContent = s.score.toLocaleString();
    document.getElementById('res-breakdown').textContent = `${s.perfect} / ${s.great} / ${s.good} / ${s.miss}`;

    // Personal bests (per song x difficulty)
    let isNewBest = false;
    if (this.activeSongId && s.judgedCount > 0) {
      const key = `${this.activeSongId}:${this.activeDensity}`;
      const prev = this.bests[key];
      isNewBest = !prev || s.score > prev.score;
      if (isNewBest) {
        this.bests[key] = {
          score: s.score,
          acc: Math.max(acc, prev ? prev.acc : 0),
          rank,
          fc: isFc || Boolean(prev && prev.fc),
        };
      } else if (isFc && !prev.fc) {
        prev.fc = true;
      }
      this._saveBests();
    }
    document.getElementById('res-new-best').classList.toggle('hidden', !isNewBest);

    this._setScreen('results');
    requestAnimationFrame(() => {
      rankEl.classList.add('stamp-in');
      this._drawResultsGraph();
    });
  }

  _drawResultsGraph() {
    const canvas = document.getElementById('results-graph-canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 560;
    const h = canvas.clientHeight || 76;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Draw background dynamic contour silhouette
    const prof = this.activeTrackData.features.elevationProfile;
    ctx.fillStyle = 'hsla(41, 65%, 60%, 0.16)';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < prof.length; i++) {
      const x = (i / (prof.length - 1)) * w;
      const y = h - (0.1 + prof[i] * 0.82) * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Draw accuracy line across buckets
    const buckets = this.sectionAccuracyBuckets;
    ctx.strokeStyle = 'hsl(43, 92%, 74%)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].count === 0) continue;
      const acc = buckets[i].sum / buckets[i].count;
      const x = ((i + 0.5) / buckets.length) * w;
      const y = h - (0.12 + acc * 0.78) * h;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  _loadSavedPrefs() {
    this.hitsoundPct = 52;
    this.speedVal = 5.5;
    try {
      // Concert Master prefs (falls back to legacy Cadenza prefs so calibrated offsets carry over)
      const raw = localStorage.getItem('concertmaster_prefs_v1') || localStorage.getItem('cadenza_prefs_v1');
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.density === 'fewer' || p.density === 'more') this.density = p.density;
      if (typeof p.hitsoundPct === 'number') {
        this.hitsoundPct = Math.max(0, Math.min(100, p.hitsoundPct));
        this.audio.hitsoundVolume = (this.hitsoundPct / 100) * 0.72;
      }
      if (typeof p.speedVal === 'number') {
        this.speedVal = Math.max(1, Math.min(10, p.speedVal));
        this.approachTime = 1.96 - this.speedVal * 0.11;
      }
      if (typeof p.audioOffsetMs === 'number') {
        this.audioOffsetMs = Math.max(-200, Math.min(350, Math.round(p.audioOffsetMs)));
      }
    } catch (_err) {
      // Ignore storage access errors
    }
  }

  _savePrefs() {
    try {
      localStorage.setItem(
        'concertmaster_prefs_v1',
        JSON.stringify({
          density: this.density,
          hitsoundPct: this.hitsoundPct,
          speedVal: this.speedVal,
          audioOffsetMs: this.audioOffsetMs,
        })
      );
    } catch (_err) {
      // Ignore storage access errors
    }
  }

  _loadBests() {
    try {
      this.bests = JSON.parse(localStorage.getItem('concertmaster_bests_v1') || '{}') || {};
    } catch (_err) {
      this.bests = {};
    }
  }

  _saveBests() {
    try {
      localStorage.setItem('concertmaster_bests_v1', JSON.stringify(this.bests));
    } catch (_err) {
      // Ignore storage access errors
    }
  }

  _applySavedPrefsToInputs() {
    document.getElementById('hitsound-slider').value = String(this.hitsoundPct);
    document.getElementById('pause-hitsound-slider').value = String(this.hitsoundPct);
    document.getElementById('hitsound-val').textContent = `${this.hitsoundPct}%`;
    document.getElementById('pause-hitsound-val').textContent = `${this.hitsoundPct}%`;

    document.getElementById('speed-slider').value = String(this.speedVal);
    document.getElementById('pause-speed-slider').value = String(this.speedVal);
    document.getElementById('speed-val').textContent = `${this.speedVal}x`;
    document.getElementById('pause-speed-val').textContent = `${this.speedVal}x`;

    this._setAudioOffsetMs(this.audioOffsetMs, false);
  }

  _setAudioOffsetMs(ms, persist = true) {
    const clamped = Math.max(-200, Math.min(350, Math.round(ms)));
    this.audioOffsetMs = clamped;
    const label = `${clamped > 0 ? '+' : ''}${clamped}ms`;
    document.getElementById('offset-slider').value = String(clamped);
    document.getElementById('pause-offset-slider').value = String(clamped);
    document.getElementById('offset-val').textContent = label;
    document.getElementById('pause-offset-val').textContent = label;
    if (persist) this._savePrefs();
  }

  openSyncCalibrator() {
    const ctx = this.audio.ensureContext();
    this.syncActive = true;
    this._resetSyncTaps();
    this.elSyncModal.classList.remove('hidden');

    // Start steady 80 BPM woodblock scheduler 0.35s from now
    this.syncAnchorCtxTime = ctx.currentTime + 0.35;
    this.syncNextBeatIndex = 0;
    const scheduleAhead = () => {
      if (!this.syncActive) return;
      const now = ctx.currentTime;
      while (this.syncAnchorCtxTime + this.syncNextBeatIndex * this.syncBeatPeriod < now + 0.28) {
        const beatTime = this.syncAnchorCtxTime + this.syncNextBeatIndex * this.syncBeatPeriod;
        const isAccent = this.syncNextBeatIndex % 4 === 0;
        this.audio.scheduleCalibrationClick(beatTime, isAccent);
        this.syncNextBeatIndex++;
      }
    };
    scheduleAhead();
    this.syncSchedulerId = setInterval(scheduleAhead, 90);
  }

  closeSyncCalibrator() {
    this.syncActive = false;
    if (this.syncSchedulerId) {
      clearInterval(this.syncSchedulerId);
      this.syncSchedulerId = null;
    }
    this.elSyncModal.classList.add('hidden');
  }

  _resetSyncTaps() {
    this.syncTapOffsetsMs = [];
    this.syncDetectedMs = this.audioOffsetMs;
    document.getElementById('sync-tap-count').textContent = '0 / 8';
    document.getElementById('sync-detected-val').textContent = '—';
    document.getElementById('sync-pips-layer').innerHTML = '';
    document.getElementById('sync-median-marker').classList.add('hidden');
    document.getElementById('sync-last-tap-msg').textContent = 'Waiting for first tap...';
    const applyBtn = document.getElementById('btn-sync-apply');
    applyBtn.disabled = true;
    applyBtn.textContent = 'Apply Offset';
  }

  _recordSyncTap() {
    if (!this.audio.ctx) return;
    const tapCtxTime = this.audio.ctx.currentTime;
    const elapsed = tapCtxTime - this.syncAnchorCtxTime;
    if (elapsed < -0.25) return;

    // Asymmetric wrap into [-220ms, +530ms] across the 750ms beat period so even +350ms Bluetooth
    // headphone latency never wraps negatively!
    const period = this.syncBeatPeriod;
    let beatIdx = Math.floor((elapsed + 0.22) / period);
    if (beatIdx < 0) beatIdx = 0;
    const targetBeatTime = this.syncAnchorCtxTime + beatIdx * period;
    const deltaMs = Math.round((tapCtxTime - targetBeatTime) * 1000);
    if (deltaMs < -200 || deltaMs > 480) return;

    const clampedDelta = Math.max(-200, Math.min(350, deltaMs));
    this.syncTapOffsetsMs.push(clampedDelta);

    // Drop tap #1 once >=2 taps exist (first tap is usually rhythm lock-in), then compute trimmed median
    const usable =
      this.syncTapOffsetsMs.length >= 2 ? this.syncTapOffsetsMs.slice(1) : this.syncTapOffsetsMs.slice();
    usable.sort((a, b) => a - b);
    let trimmed = usable;
    if (usable.length >= 6) {
      trimmed = usable.slice(1, usable.length - 1);
    }
    const mid = Math.floor(trimmed.length / 2);
    const medianMs =
      trimmed.length % 2 === 1 ? trimmed[mid] : Math.round((trimmed[mid - 1] + trimmed[mid]) * 0.5);
    this.syncDetectedMs = medianMs;

    // Update UI meter (-150ms .. +350ms => 500ms span, 0ms sits at 30%)
    const count = this.syncTapOffsetsMs.length;
    document.getElementById('sync-tap-count').textContent = `${count} / 8`;
    const fmtMed = `${medianMs > 0 ? '+' : ''}${medianMs}ms`;
    document.getElementById('sync-detected-val').textContent = fmtMed;

    const pct = Math.max(2, Math.min(98, ((clampedDelta + 150) / 500) * 100));
    const pip = document.createElement('div');
    pip.className = 'sync-pip';
    pip.style.left = `${pct}%`;
    document.getElementById('sync-pips-layer').appendChild(pip);

    const medPct = Math.max(2, Math.min(98, ((medianMs + 150) / 500) * 100));
    const marker = document.getElementById('sync-median-marker');
    marker.style.left = `${medPct}%`;
    marker.classList.remove('hidden');

    const fmtTap = `${clampedDelta > 0 ? '+' : ''}${clampedDelta}ms`;
    document.getElementById('sync-last-tap-msg').textContent =
      count >= 8
        ? `Locked in at ${fmtMed} (last tap ${fmtTap}) · Press Enter or click Apply!`
        : `Last tap: ${fmtTap} · Keep tapping (${8 - count} more recommended)`;

    const applyBtn = document.getElementById('btn-sync-apply');
    if (count >= 3) {
      applyBtn.disabled = false;
      applyBtn.textContent = `Apply ${fmtMed}`;
    }
  }

  _computeMedianHitDeltaMs() {
    if (this.recentHitDeltasMs.length < 5) return null;
    const sorted = this.recentHitDeltasMs.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) * 0.5);
  }

  _updatePauseTendencyUI() {
    const row = document.getElementById('pause-live-tendency');
    const txt = document.getElementById('pause-tendency-text');
    const btn = document.getElementById('btn-apply-tendency');
    const med = this._computeMedianHitDeltaMs();
    if (med === null || Math.abs(med) < 6) {
      row.classList.add('hidden');
      return;
    }
    const dir = med > 0 ? `${med}ms late` : `${Math.abs(med)}ms early`;
    const nextOff = Math.max(-200, Math.min(350, this.audioOffsetMs + med));
    const fmtNext = `${nextOff > 0 ? '+' : ''}${nextOff}ms`;
    txt.textContent = `Recent hits: ${dir}`;
    btn.textContent = `Set ${fmtNext}`;
    row.classList.remove('hidden');
  }

  _formatTime(sec) {
    const total = Math.max(0, Math.floor(sec));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ConcertMasterApp();
});
