/**
 * CONCERT MASTER — Chart Audit Sandbox (playable)
 * Plays short clips of a song with the locked baseline chart (left) next to the current build (right), both on
 * Hard (More Notes) D F J K. You can PLAY either side with D F J K: hits are judged with the game's timing windows,
 * your saved audio offset & scroll speed are honoured. Clips: ./clips.json · Baseline: ../scripts/completed_songs_baseline.json
 */

// Always load the engine & repertoire fresh, so "current build" reflects the latest audio-engine.js after every fix
// The engine is re-imported every time a clip's chart is built, so engine edits show up without reloading the page
const { BUILTIN_REPERTOIRE } = await import(`../repertoire.js?t=${Date.now()}`);

// Lane index -> key. 0..3 = D F J K; 4 = ghost S (drawn far left), 5 = ghost L (drawn far right)
const LANE_KEYS = ['D', 'F', 'J', 'K', 'S', 'L'];
const LANE_CODES = ['KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyS', 'KeyL'];
const GHOST_W = 0.6; // ghost columns are 60% as wide as a normal lane
const LANE_HUES = [196, 156, 44, 12];
const PAD = 1.0; // seconds of lead-in / lead-out around each clip
const LEAD_IN = 2.0; // extra lead-in so the first notes can scroll down before you have to hit them
const LOOK_BEHIND = 0.45;
const MATCH_TOL = 0.006; // a note "matches" across charts if same key & type within 6ms
const WIN_HARD = { perfect: 0.048, great: 0.095, good: 0.138, missAfter: 0.145 }; // same as the game
const WIN_EASY = Object.fromEntries(Object.entries(WIN_HARD).map(([k, v]) => [k, v * 1.4])); // (Easy: 1.4x, as in game.js)
let WIN = WIN_HARD;

const els = {
  clips: document.getElementById('clips'),
  song: document.getElementById('clip-song'),
  title: document.getElementById('clip-title'),
  issue: document.getElementById('clip-issue'),
  clock: document.getElementById('clock'),
  play: document.getElementById('btn-play'),
  pause: document.getElementById('btn-pause'),
  slow: document.getElementById('btn-slow'),
  sideOld: document.getElementById('btn-side-old'),
  refBaseline: document.getElementById('btn-ref-baseline'),
  refCheckpoint: document.getElementById('btn-ref-checkpoint'),
  oldLabel: document.getElementById('old-label'),
  sideNew: document.getElementById('btn-side-new'),
  cvOld: document.getElementById('cv-old'),
  cvNew: document.getElementById('cv-new'),
  listOld: document.getElementById('list-old'),
  listNew: document.getElementById('list-new'),
  oldCount: document.getElementById('old-count'),
  newCount: document.getElementById('new-count'),
  scoreOld: document.getElementById('score-old'),
  scoreNew: document.getElementById('score-new'),
  sectionOld: document.getElementById('side-old'),
  sectionNew: document.getElementById('side-new'),
  status: document.getElementById('status'),
};

const prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem('concertmaster_prefs_v1') || localStorage.getItem('cadenza_prefs_v1') || '{}');
  } catch (_e) {
    return {};
  }
})();
let AUDIO_OFFSET = (Number(prefs.audioOffsetMs) || 0) / 1000; // adjustable here; saved back to the game's settings
const hitErrorsMs = []; // signed timing error of recent hits (+ = you tapped late)

function setOffsetMs(ms) {
  const clamped = Math.max(-200, Math.min(350, Math.round(ms)));
  AUDIO_OFFSET = clamped / 1000;
  try {
    const key = 'concertmaster_prefs_v1';
    const p = JSON.parse(localStorage.getItem(key) || '{}');
    p.audioOffsetMs = clamped;
    localStorage.setItem(key, JSON.stringify(p));
  } catch (_e) {
    /* storage unavailable: still applies for this session */
  }
  renderOffset();
}

function renderOffset() {
  const el = document.getElementById('offset-val');
  if (el) el.textContent = `${Math.round(AUDIO_OFFSET * 1000)} ms`;
  const hint = document.getElementById('offset-hint');
  if (hint) {
    if (hitErrorsMs.length >= 8) {
      const sorted = [...hitErrorsMs].sort((x, y) => x - y);
      const med = sorted[Math.floor(sorted.length / 2)];
      hint.textContent = `your last ${hitErrorsMs.length} hits average ${med > 0 ? '+' : ''}${med} ms ${med > 0 ? '(late)' : med < 0 ? '(early)' : ''}`;
    } else {
      hint.textContent = `play a clip to measure (${hitErrorsMs.length}/8 hits)`;
    }
  }
}
const LOOK_AHEAD = 1.96 - (Number(prefs.speedVal) || 5.5) * 0.11; // same approach time as the game
const HIT_VOL = Math.max(0, Math.min(1, (prefs.hitsoundPct ?? 52) / 100));

const state = {
  clips: [],
  baseline: {},
  checkpoint: null,
  ref: 'checkpoint', // 'baseline' | 'checkpoint' — what the left side shows
  charts: new Map(), // song id -> current-build notes
  audio: new Audio(),
  idx: -1,
  slow: false,
  oldNotes: [],
  newNotes: [],
  side: 'new', // which chart you're playing
  pressed: [false, false, false, false, false, false], // D F J K + ghost S / L
  run: null, // { perfect, great, good, miss, combo, maxCombo }
  judgment: null, // { text, side, at }
  ctx: null,
  // Pin mode: you set a note's time by ear. Pins are kept per song in localStorage and previewed on the current build
  pinMode: false,
  ticks: false, // tick on every current-build note (with pins applied) so you can check them against the music
  sel: -1, // index into newNotes of the note the next tap pins
  pins: (() => {
    try {
      return JSON.parse(localStorage.getItem('cm_sandbox_pins_v1') || '[]');
    } catch (_e) {
      return [];
    }
  })(), // [{ song, at, midi, key, to }] -- at = the note's time in the build, to = where you tapped it
  lastTickNow: null,
  easy: false, // the current-build side shows Easy (E); the left side stays the Hard reference
};
state.audio.preload = 'auto';

const fmt = (t) => `${Math.floor(t / 60)}:${(Math.max(0, t) % 60).toFixed(2).padStart(5, '0')}`;
const trackFor = (id) => BUILTIN_REPERTOIRE.find((t) => t.id === id);
const resolveUrl = (u) => (/^https?:\/\//i.test(u) ? u : `../${u.replace(/^\.\//, '')}`);
const activeNotes = () => (state.side === 'old' ? state.oldNotes : state.newNotes);
const audioBlobs = {}; // track url -> Promise<object URL> (fully downloaded, so seeking always works)
const songTime = () => state.audio.currentTime - AUDIO_OFFSET;

function sameNote(a, b) {
  return a.lane === b.lane && a.type === b.type && Math.abs(a.time - b.time) <= MATCH_TOL && Math.abs(a.endTime - b.endTime) <= 0.02;
}

function markDiffs(oldN, newN) {
  oldN.forEach((o) => (o.diff = newN.some((n) => sameNote(o, n)) ? null : 'removed'));
  newN.forEach((n) => (n.diff = oldN.some((o) => sameNote(o, n)) ? null : 'added'));
}

// rv: optional rules version to force (clips.json "rulesVersion"), e.g. to preview a locked song on the unified rules
async function currentChart(songId, rv) {
  const cacheKey = `${rv ? `${songId}@v${rv}` : songId}|${state.easy ? 'easy' : 'hard'}`;
  if (state.charts.has(cacheKey)) return state.charts.get(cacheKey);
  const track = trackFor(songId);
  const resp = await fetch(`${resolveUrl(track.sidecarUrl.split('?')[0])}?t=${Date.now()}`, { cache: 'no-store' });
  const sidecar = await resp.json();
  if (rv) sidecar.rulesVersion = rv;
  const { hydrateSidecarFeatures, buildChart } = await import(`../audio-engine.js?t=${Date.now()}`);
  const chart = buildChart(hydrateSidecarFeatures(sidecar, null), { keyMode: '4k', density: state.easy ? 'fewer' : 'more' });
  const notes = chart.notes.map((n) => ({
    time: n.time,
    endTime: n.endTime,
    type: n.type,
    lane: n.lane,
    midi: n.midi || 0,
    isChordPartner: Boolean(n.isChordPartner),
    isPercussionSolo: Boolean(n.isPercussionSolo),
  }));
  state.charts.set(cacheKey, notes);
  return notes;
}

function clipNotes(all, clip) {
  return all
    .filter((n) => n.lane >= 0 && n.time >= clip.start - PAD && n.time <= clip.end + PAD)
    .map((n) => ({ ...n }));
}

// ---------------------------------------------------------------- pin mode

const PIN_TOL = 0.004; // a pin belongs to the build note at its 'at' time (same pitch)

function savePins() {
  try {
    localStorage.setItem('cm_sandbox_pins_v1', JSON.stringify(state.pins));
  } catch (_e) {
    /* storage unavailable: pins last for this session */
  }
}

const songPins = () => {
  const clip = state.clips[state.idx];
  return clip ? state.pins.filter((p) => p.song === clip.song) : [];
};

// Move pinned notes (and the chord partner struck with them) to where you tapped them. Each note remembers its build
// time in .at, so pins can be re-applied or cleared without rebuilding the chart.
function applyPins(notes, song) {
  for (const n of notes) {
    if (n.at === undefined) n.at = n.time;
    const len = n.endTime - n.time;
    n.time = n.at;
    n.endTime = n.at + len;
    n.pinned = false;
  }
  for (const p of state.pins.filter((q) => q.song === song)) {
    const prim = notes.find((n) => !n.isChordPartner && n.midi === p.midi && Math.abs(n.at - p.at) <= PIN_TOL);
    if (!prim) continue;
    const d = p.to - p.at;
    for (const n of notes) {
      if (n === prim || (n.isChordPartner && Math.abs(n.at - p.at) <= PIN_TOL)) {
        n.time = n.at + d;
        n.endTime += d;
        n.pinned = true;
      }
    }
  }
}

function primaryIdx(from, dir) {
  const ns = state.newNotes;
  const cur = ns[from];
  for (let i = from + dir; i >= 0 && i < ns.length; i += dir) {
    if (ns[i].isChordPartner) continue;
    if (cur && Math.abs(ns[i].at - cur.at) <= PIN_TOL) continue; // (same moment: a chord's other note)
    return i;
  }
  return from;
}

function selectNote(i) {
  const n = state.newNotes[i];
  if (!n || n.isChordPartner) return;
  state.sel = i;
  renderPinBar();
  renderList(els.listNew, state.newNotes);
}

function pinSelected(t) {
  const n = state.newNotes[state.sel];
  if (!n) return;
  const clip = state.clips[state.idx];
  state.pins = state.pins.filter((p) => !(p.song === clip.song && p.midi === n.midi && Math.abs(p.at - n.at) <= PIN_TOL));
  state.pins.push({ song: clip.song, at: +n.at.toFixed(4), midi: n.midi, key: LANE_KEYS[n.lane], to: +t.toFixed(4) });
  savePins();
  applyPins(state.newNotes, clip.song);
  state.sel = primaryIdx(state.sel, 1); // (next note: tap a whole phrase in one pass)
  renderPinBar();
  renderList(els.listNew, state.newNotes);
}

function unpinSelected() {
  const n = state.newNotes[state.sel];
  if (!n) return;
  const clip = state.clips[state.idx];
  state.pins = state.pins.filter((p) => !(p.song === clip.song && p.midi === n.midi && Math.abs(p.at - n.at) <= PIN_TOL));
  savePins();
  applyPins(state.newNotes, clip.song);
  renderPinBar();
  renderList(els.listNew, state.newNotes);
}

function playFromSelected() {
  const n = state.newNotes[state.sel];
  if (!n) return play();
  ensureCtx();
  resetPlayState();
  state.audio.currentTime = Math.max(0, n.at - 2.0 + AUDIO_OFFSET);
  state.userPaused = false;
  state.audio.playbackRate = state.slow ? 0.5 : 1;
  state.audio.play().catch((e) => (els.status.textContent = `Audio blocked: ${e.message}`));
  renderPause();
}

function pinsText() {
  const ps = songPins().sort((a, b) => a.at - b.at);
  const lines = ps.map(({ song, at, midi, key, to }) => JSON.stringify({ song, at, midi, key, to }));
  return `{"pins": [\n${lines.join(',\n')}\n]}`;
}

function renderPinBar() {
  const bar = document.getElementById('pin-bar');
  if (!bar) return;
  bar.hidden = !state.pinMode;
  document.getElementById('btn-pin').classList.toggle('active', state.pinMode);
  document.getElementById('btn-ticks').textContent = `Ticks: ${state.ticks ? 'On' : 'Off'}`;
  const n = state.newNotes[state.sel];
  const pin = n && songPins().find((p) => p.midi === n.midi && Math.abs(p.at - n.at) <= PIN_TOL);
  document.getElementById('pin-sel').textContent = n
    ? `Next tap pins: ${LANE_KEYS[n.lane]} midi ${n.midi} at ${fmt(n.at)}${pin ? ` (pinned → ${fmt(pin.to)})` : ''}`
    : 'Click a note in the Current build list to pick where to start';
  document.getElementById('pin-count').textContent = `${songPins().length} pin(s) in this song`;
}

async function copyPins() {
  const txt = pinsText();
  try {
    await navigator.clipboard.writeText(txt);
    els.status.textContent = `Copied ${songPins().length} pin(s) -- paste them into the chat.`;
  } catch (_e) {
    const ta = document.getElementById('pin-out');
    ta.hidden = false;
    ta.value = txt;
    ta.select();
    els.status.textContent = 'Clipboard blocked: the pins are in the box, copy them from there.';
  }
}

function clearPins() {
  const clip = state.clips[state.idx];
  if (!clip || !confirm(`Clear all ${songPins().length} pin(s) for this song?`)) return;
  state.pins = state.pins.filter((p) => p.song !== clip.song);
  savePins();
  applyPins(state.newNotes, clip.song);
  renderPinBar();
  renderList(els.listNew, state.newNotes);
}

// Tick on each current-build note as it passes (pins applied), to check the chart against the music by ear
function stepTicks(now) {
  const prev = state.lastTickNow;
  state.lastTickNow = state.audio.paused ? null : now;
  if (!state.ticks || prev === null || state.audio.paused || now < prev || now - prev > 0.25) return;
  const seen = new Set();
  for (const n of state.newNotes) {
    if (n.time > prev && n.time <= now && !seen.has(n.time.toFixed(3))) {
      seen.add(n.time.toFixed(3));
      hitSound(n.lane);
    }
  }
}

function resetPlayState() {
  for (const n of [...state.oldNotes, ...state.newNotes]) {
    n.hit = false;
    n.missed = false;
    n.holding = false;
    n.judgment = null;
  }
  state.run = { perfect: 0, great: 0, good: 0, miss: 0, combo: 0, maxCombo: 0 };
  state.judgment = null;
  renderScore();
}

// ---------------------------------------------------------------- UI rendering

function renderClipList() {
  els.clips.innerHTML = '';
  state.clips.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `clip${i === state.idx ? ' active' : ''}`;
    b.innerHTML = `<span class="t">${fmt(c.start)}</span>${
      c.diffCount !== undefined
        ? `<span class="diffs${c.diffCount === 0 ? ' zero' : ''}">${c.diffCount === 0 ? 'no change' : `${c.diffCount} changed`}</span>`
        : ''
    }<span class="l">${c.label}</span><span class="i">${c.issue || ''}</span>`;
    b.addEventListener('click', () => selectClip(i, true));
    els.clips.appendChild(b);
  });
}

function renderList(el, notes) {
  el.innerHTML = notes
    .map((n, i) => {
      const key = n.isChordPartner ? `+${LANE_KEYS[n.lane]}` : LANE_KEYS[n.lane];
      const kind = n.type === 'hold' ? `hold ${(n.endTime - n.time).toFixed(2)}s` : 'tap';
      const isNew = el === els.listNew;
      const sel = isNew && state.pinMode && i === state.sel ? ' sel' : '';
      const pin = isNew && n.pinned ? ` <b class="pin">📌 ${fmt(n.at)} → ${fmt(n.time)}</b>` : '';
      return `<li data-i="${i}" class="${n.diff || ''}${sel}"><span class="k">${key}</span>${fmt(isNew && n.at !== undefined ? n.at : n.time)} · ${kind} · midi ${n.midi}${pin}</li>`;
    })
    .join('');
}

function renderSide() {
  const isOld = state.side === 'old';
  els.sideOld.classList.toggle('active', isOld);
  els.sideNew.classList.toggle('active', !isOld);
  els.sectionOld.classList.toggle('playing', isOld);
  els.sectionNew.classList.toggle('playing', !isOld);
}

function renderScore() {
  const r = state.run;
  const total = r ? r.perfect + r.great + r.good + r.miss : 0;
  const acc = total ? ((r.perfect + 0.75 * r.great + 0.4 * r.good) / total) * 100 : 100;
  const txt = r
    ? `${acc.toFixed(1)}% · P${r.perfect} G${r.great} g${r.good} M${r.miss} · max combo ${r.maxCombo}`
    : '';
  els.scoreOld.textContent = state.side === 'old' ? txt : '';
  els.scoreNew.textContent = state.side === 'new' ? txt : '';
}

// ---------------------------------------------------------------- clip playback

async function selectClip(i, autoplay) {
  if (i < 0 || i >= state.clips.length) return;
  state.idx = i;
  const clip = state.clips[i];
  const track = trackFor(clip.song);
  els.song.textContent = `${track.title} · ${track.composer}`;
  els.title.textContent = `${fmt(clip.start)} – ${fmt(clip.end)} · ${clip.label}`;
  els.issue.textContent = clip.issue || '';
  els.issue.title = clip.issue || '';

  const base = refSnapshot()[clip.song];
  state.oldNotes = base ? clipNotes(base.notes, clip) : [];
  state.newNotes = clipNotes(await currentChart(clip.song, clip.rulesVersion), clip);
  markDiffs(state.oldNotes, state.newNotes);
  applyPins(state.newNotes, clip.song);
  state.sel = state.pinMode ? primaryIdx(-1, 1) : -1;
  renderPinBar();
  els.oldCount.textContent = base ? `· ${state.oldNotes.length} notes` : '· (not locked)';
  els.newCount.textContent = `· ${state.newNotes.length} notes`;
  renderList(els.listOld, state.oldNotes);
  renderList(els.listNew, state.newNotes);
  renderClipList();
  resetPlayState();

  const url = resolveUrl(track.url);
  if (state.audio.dataset.src !== url) {
    // Load the whole file as a blob first: a plain static server may not answer range requests, and then the browser
    // can't seek into a long track (e.g. What We Do's .ogg restarted from 0:00 for clips at 3:31 / 4:28)
    if (!audioBlobs[url]) {
      els.status.textContent = 'Loading audio…';
      // (Hal Leonard's S3 files do allow cross-site fetches, but only answer with the CORS header when asked -- a copy
      // the browser cached from the game's menu preview, fetched without asking, would be refused here. So: no cache.
      // And if a fetch still fails, the <audio> element can play the stream directly; S3 answers range requests.)
      audioBlobs[url] = fetch(url, { cache: 'no-store' })
        .then((r) => r.blob())
        .then((b) => URL.createObjectURL(b))
        .catch(() => url);
    }
    const blobUrl = await audioBlobs[url];
    state.audio.src = blobUrl;
    state.audio.dataset.src = url;
  }
  state.userPaused = false;
  state.audio.pause();
  seekToStart();
  renderPause();
  if (autoplay) play();
}

function seekToStart() {
  const clip = state.clips[state.idx];
  const t0 = Math.max(0, clip.start - PAD - LEAD_IN);
  const doSeek = () => (state.audio.currentTime = t0);
  if (state.audio.readyState >= 1) doSeek();
  else state.audio.addEventListener('loadedmetadata', doSeek, { once: true });
}

function play() {
  if (state.idx < 0) return;
  ensureCtx();
  resetPlayState();
  seekToStart();
  state.userPaused = false;
  state.audio.playbackRate = state.slow ? 0.5 : 1;
  state.audio.play().catch((e) => (els.status.textContent = `Audio blocked: ${e.message}`));
  renderPause();
}

// Pause keeps your place (and your score so far); resume picks up from there. Start always restarts the clip.
function togglePause() {
  if (state.idx < 0) return;
  const clip = state.clips[state.idx];
  if (!state.audio.paused) {
    state.audio.pause();
    state.userPaused = true;
  } else if (state.userPaused && songTime() < clip.end + PAD) {
    state.userPaused = false;
    state.audio.playbackRate = state.slow ? 0.5 : 1;
    state.audio.play().catch((e) => (els.status.textContent = `Audio blocked: ${e.message}`));
  }
  renderPause();
}

function renderPause() {
  const playing = !state.audio.paused;
  els.pause.disabled = !playing && !state.userPaused;
  els.pause.textContent = state.userPaused ? '▶ Resume' : '⏸ Pause';
}

// ---------------------------------------------------------------- playing

function ensureCtx() {
  if (!state.ctx) state.ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (state.ctx.state === 'suspended') state.ctx.resume();
  return state.ctx;
}

function hitSound(lane) {
  const ctx = state.ctx;
  if (!ctx || HIT_VOL <= 0) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'triangle';
  const sl = lane === 4 ? 0 : lane === 5 ? 3 : lane; // ghosts sound like the end keys
  osc.frequency.setValueAtTime([620, 740, 880, 1040][sl], t);
  osc.frequency.exponentialRampToValueAtTime([310, 370, 440, 520][sl], t + 0.06);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22 * HIT_VOL, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.1);
}

function record(kind, note) {
  const r = state.run;
  r[kind]++;
  if (kind === 'miss') r.combo = 0;
  else {
    r.combo++;
    r.maxCombo = Math.max(r.maxCombo, r.combo);
  }
  if (note) note.judgment = kind;
  state.judgment = { text: kind.toUpperCase(), kind, at: performance.now() };
  renderScore();
}

function onLanePress(lane) {
  if (state.audio.paused) return;
  hitSound(lane);
  const now = songTime();
  let best = null;
  let bestAbs = Infinity;
  for (const n of activeNotes()) {
    if (n.lane !== lane || n.hit || n.missed) continue;
    const d = Math.abs(n.time - now);
    if (d <= WIN.good && d < bestAbs) {
      best = n;
      bestAbs = d;
    }
  }
  if (!best) return;
  best.hit = true;
  hitErrorsMs.push(Math.round((now - best.time) * 1000));
  if (hitErrorsMs.length > 32) hitErrorsMs.shift();
  renderOffset();
  if (best.type === 'hold') best.holding = true;
  record(bestAbs <= WIN.perfect ? 'perfect' : bestAbs <= WIN.great ? 'great' : 'good', best);
}

function onLaneRelease(lane) {
  for (const n of activeNotes()) if (n.holding && n.lane === lane) n.holding = false; // forgiving release, like the game
}

function stepMisses() {
  if (state.audio.paused) return;
  const now = songTime();
  for (const n of activeNotes()) {
    if (!n.hit && !n.missed && now - n.time > WIN.missAfter) {
      n.missed = true;
      record('miss', n);
    }
    if (n.holding && now >= n.endTime) n.holding = false;
  }
}

// ---------------------------------------------------------------- drawing

function drawHighway(canvas, notes, now, isActive) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const strikeY = h * 0.84;
  const pxPerSec = strikeY / LOOK_AHEAD;
  const laneW = w / (4 + 2 * GHOST_W);
  const gW = laneW * GHOST_W;
  const laneX = (l) => (l === 4 ? 0 : l === 5 ? gW + 4 * laneW : gW + l * laneW);
  const laneWidth = (l) => (l >= 4 ? gW : laneW);
  const yOf = (t) => strikeY - (t - now) * pxPerSec;
  const hasGhost = notes.some((n) => n.lane >= 4);

  for (const l of [4, 0, 1, 2, 3, 5]) {
    const lit = isActive && state.pressed[l];
    const ghost = l >= 4;
    const hueL = ghost ? (l === 4 ? LANE_HUES[0] : LANE_HUES[3]) : LANE_HUES[l];
    ctx.fillStyle = lit
      ? `hsla(${hueL}, 60%, 22%, 0.95)`
      : ghost
      ? `hsla(222, 30%, 5%, ${hasGhost ? 0.9 : 0.6})`
      : l % 2 === 0
      ? 'hsla(222, 30%, 9%, 0.9)'
      : 'hsla(222, 30%, 7%, 0.9)';
    ctx.fillRect(laneX(l), 0, laneWidth(l), h);
    if (ghost) {
      ctx.strokeStyle = `hsla(40, 30%, 85%, ${hasGhost ? 0.3 : 0.1})`;
      ctx.setLineDash([4, 6]);
      ctx.strokeRect(laneX(l) + 0.5, 0.5, laneWidth(l) - 1, h - 1);
      ctx.setLineDash([]);
    }
    ctx.fillStyle = lit ? 'hsl(44, 95%, 80%)' : `hsla(40, 30%, 85%, ${ghost && !hasGhost ? 0.12 : 0.28})`;
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(LANE_KEYS[l], laneX(l) + laneWidth(l) / 2, h - 8);
  }
  // Clip boundaries (the audited window, without the lead-in/out padding)
  const clip = state.clips[state.idx];
  for (const tb of [clip.start, clip.end]) {
    const y = yOf(tb);
    ctx.strokeStyle = 'hsla(44, 90%, 70%, 0.35)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = isActive ? 'hsla(44, 95%, 70%, 0.95)' : 'hsla(44, 60%, 60%, 0.45)';
  ctx.fillRect(0, strikeY - 1.5, w, 3);

  for (const n of notes) {
    if (n.endTime < now - LOOK_BEHIND || n.time > now + LOOK_AHEAD) continue;
    if (isActive && n.hit && n.type !== 'hold') continue; // hit taps vanish
    const x = laneX(n.lane) + laneWidth(n.lane) * 0.12;
    const nw = laneWidth(n.lane) * 0.76;
    // Unchanged notes are dull grey; changed notes are red on the baseline side and green on the current side
    const changed = Boolean(n.diff);
    const hue = n.diff === 'added' ? 140 : 2;
    const sat = changed ? 82 : 0;
    const faded = isActive ? n.missed : n.time < now;
    if (n.type === 'hold' && n.endTime > n.time) {
      const yTop = yOf(n.endTime);
      const yBot = isActive && n.holding ? strikeY : yOf(n.time);
      ctx.fillStyle = `hsla(${hue}, ${sat}%, ${n.holding ? 72 : changed ? 52 : 46}%, ${faded ? 0.2 : 0.45})`;
      ctx.fillRect(x + nw * 0.28, yTop, nw * 0.44, Math.max(0, yBot - yTop));
      if (isActive && n.hit) continue;
    }
    const y = yOf(n.time);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${faded ? 32 : changed ? 60 : 52}%, ${faded ? 0.5 : 1})`;
    ctx.beginPath();
    ctx.roundRect(x, y - 7, nw, 14, 5);
    ctx.fill();
    if (n.isChordPartner) {
      ctx.strokeStyle = 'hsl(0, 0%, 100%)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (n.pinned) {
      ctx.strokeStyle = 'hsl(285, 90%, 72%)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (state.pinMode && notes === state.newNotes && notes[state.sel] === n) {
      ctx.strokeStyle = 'hsl(52, 100%, 60%)';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (n.lane >= 4) {
      // ghost note: bright dashed outline
      ctx.strokeStyle = 'hsla(45, 100%, 92%, 0.95)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (isActive && state.judgment && performance.now() - state.judgment.at < 450) {
    const colors = { perfect: 'hsl(44, 95%, 75%)', great: 'hsl(198, 70%, 75%)', good: 'hsl(150, 60%, 65%)', miss: 'hsl(4, 80%, 66%)' };
    ctx.fillStyle = colors[state.judgment.kind];
    ctx.font = '800 22px "Cinzel", serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.judgment.text, w / 2, strikeY - 40);
    if (state.run.combo > 1) {
      ctx.font = '700 15px "JetBrains Mono", monospace';
      ctx.fillStyle = 'hsla(40, 30%, 92%, 0.85)';
      ctx.fillText(`${state.run.combo} combo`, w / 2, strikeY - 18);
    }
  }
}

function highlightList(el, notes, now) {
  el.querySelectorAll('li').forEach((li) => {
    const n = notes[Number(li.dataset.i)];
    const isNow = n && Math.abs(n.time - now) < 0.09;
    li.classList.toggle('now', isNow);
    li.dataset.j = n && n.judgment ? n.judgment : '';
    if (isNow) li.scrollIntoView({ block: 'nearest' });
  });
}

function loop() {
  if (state.idx >= 0) {
    const clip = state.clips[state.idx];
    const now = songTime();
    if (!state.audio.paused && now >= clip.end + PAD) state.audio.pause();
    stepMisses();
    stepTicks(now);
    els.clock.textContent = fmt(now);
    drawHighway(els.cvOld, state.oldNotes, now, state.side === 'old');
    drawHighway(els.cvNew, state.newNotes, now, state.side === 'new');
    highlightList(els.listOld, state.oldNotes, now);
    highlightList(els.listNew, state.newNotes, now);
  }
  requestAnimationFrame(loop);
}

function refSnapshot() {
  return state.ref === 'checkpoint' && state.checkpoint ? state.checkpoint : state.baseline;
}

function renderRef() {
  const useCp = state.ref === 'checkpoint' && state.checkpoint;
  els.refBaseline.classList.toggle('active', !useCp);
  els.refCheckpoint.classList.toggle('active', Boolean(useCp));
  els.refCheckpoint.disabled = !state.checkpoint;
  const meta = state.checkpoint && state.checkpoint._meta;
  els.oldLabel.textContent = useCp ? `Checkpoint${meta ? ` (${meta.saved_at.replace('T', ' ')})` : ''}` : 'Locked baseline';
  els.oldLabel.title = useCp && meta ? meta.label : '';
}

async function setRef(ref) {
  state.ref = ref;
  renderRef();
  await countAllDiffs();
  await selectClip(state.idx < 0 ? 0 : state.idx, false);
}

async function countAllDiffs() {
  for (const c of state.clips) {
    const base = refSnapshot()[c.song];
    if (!base) continue;
    const o = clipNotes(base.notes, c);
    const n = clipNotes(await currentChart(c.song, c.rulesVersion), c);
    markDiffs(o, n);
    c.diffCount = o.filter((x) => x.diff).length + n.filter((x) => x.diff).length;
  }
  renderClipList();
}

function setSide(side) {
  state.side = side;
  renderSide();
  resetPlayState();
}

async function init() {
  const [clips, baseline, checkpoint] = await Promise.all([
    fetch(`./clips.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()),
    fetch(`../scripts/completed_songs_baseline.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()),
    fetch(`../scripts/review_checkpoint.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  state.clips = clips;
  state.baseline = baseline;
  state.checkpoint = checkpoint;
  if (!checkpoint) state.ref = 'baseline';
  renderRef();
  renderClipList();
  renderSide();
  els.status.textContent = `Play with D F J K (+ ghost S/L) · Space = start over · P or Esc = pause / resume · scroll speed from your game settings · offset adjustable at the top ([ / ]) · Grey = unchanged · Red (baseline) / Green (current) = changed · White outline = chord partner · Dashed lines = audited window`;
  await countAllDiffs();
  await selectClip(0, false);
  requestAnimationFrame(loop);
}

els.play.addEventListener('click', play);
els.pause.addEventListener('click', togglePause);
state.audio.addEventListener('pause', renderPause);
state.audio.addEventListener('play', renderPause);
els.slow.addEventListener('click', () => {
  state.slow = !state.slow;
  els.slow.textContent = `0.5× Slow-mo: ${state.slow ? 'On' : 'Off'}`;
  state.audio.playbackRate = state.slow ? 0.5 : 1;
});
els.sideOld.addEventListener('click', () => setSide('old'));
els.refBaseline.addEventListener('click', () => setRef('baseline'));
els.refCheckpoint.addEventListener('click', () => setRef('checkpoint'));
els.sideNew.addEventListener('click', () => setSide('new'));

document.getElementById('offset-minus')?.addEventListener('click', () => setOffsetMs(AUDIO_OFFSET * 1000 - 5));
document.getElementById('offset-plus')?.addEventListener('click', () => setOffsetMs(AUDIO_OFFSET * 1000 + 5));
document.getElementById('offset-auto')?.addEventListener('click', () => {
  if (hitErrorsMs.length < 8) return;
  const sorted = [...hitErrorsMs].sort((x, y) => x - y);
  // tapping late means the sound reaches you late: raise the offset by that amount (same rule as the game's calibrator)
  setOffsetMs(AUDIO_OFFSET * 1000 + sorted[Math.floor(sorted.length / 2)]);
  hitErrorsMs.length = 0;
  renderOffset();
});
renderOffset();

function togglePinMode() {
  state.pinMode = !state.pinMode;
  if (state.pinMode && state.sel < 0) state.sel = primaryIdx(-1, 1);
  if (state.pinMode && state.side !== 'new') setSide('new');
  renderPinBar();
  renderList(els.listNew, state.newNotes);
}
async function toggleEasy() {
  state.easy = !state.easy;
  WIN = state.easy ? WIN_EASY : WIN_HARD;
  document.getElementById('btn-easy').textContent = `Current: ${state.easy ? 'Easy' : 'Hard'}`;
  await countAllDiffs();
  await selectClip(state.idx < 0 ? 0 : state.idx, false);
}
document.getElementById('btn-easy').addEventListener('click', toggleEasy);
document.getElementById('btn-pin').addEventListener('click', togglePinMode);
document.getElementById('btn-ticks').addEventListener('click', () => {
  state.ticks = !state.ticks;
  renderPinBar();
});
document.getElementById('btn-pin-copy').addEventListener('click', copyPins);
document.getElementById('btn-pin-clear').addEventListener('click', clearPins);
els.listNew.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li || !state.pinMode) return;
  selectNote(Number(li.dataset.i));
});

window.addEventListener('keydown', (e) => {
  const lane = LANE_CODES.indexOf(e.code);
  if (lane >= 0) {
    e.preventDefault();
    if (e.repeat) return;
    state.pressed[lane] = true;
    onLanePress(lane);
    return;
  }
  if (e.repeat) return;
  if (state.pinMode && e.code === 'KeyT') {
    e.preventDefault();
    if (!state.audio.paused) pinSelected(songTime());
    return;
  }
  if (state.pinMode && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    e.preventDefault();
    selectNote(primaryIdx(state.sel, e.code === 'ArrowRight' ? 1 : -1));
    return;
  }
  if (state.pinMode && e.code === 'KeyB') {
    playFromSelected();
    return;
  }
  if (state.pinMode && e.code === 'Backspace') {
    e.preventDefault();
    unpinSelected();
    return;
  }
  if (e.code === 'KeyN') {
    togglePinMode();
    return;
  }
  if (e.code === 'KeyE') {
    toggleEasy();
    return;
  }
  if (e.code === 'KeyY') {
    state.ticks = !state.ticks;
    renderPinBar();
    return;
  }
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    selectClip(state.idx + (e.code === 'ArrowDown' ? 1 : -1), true);
  } else if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    play();
  } else if (e.code === 'Tab') {
    e.preventDefault();
    setSide(state.side === 'old' ? 'new' : 'old');
  } else if (e.code === 'KeyC') {
    setRef(state.ref === 'checkpoint' ? 'baseline' : 'checkpoint');
  } else if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    const step = (e.shiftKey ? 20 : 5) * (e.code === 'BracketRight' ? 1 : -1);
    setOffsetMs(AUDIO_OFFSET * 1000 + step);
  } else if (e.code === 'KeyM') {
    els.slow.click(); // (S is the ghost key now)
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    togglePause();
  }
});
window.addEventListener('keyup', (e) => {
  const lane = LANE_CODES.indexOf(e.code);
  if (lane >= 0) {
    state.pressed[lane] = false;
    onLaneRelease(lane);
  }
});

init().catch((err) => {
  console.error(err);
  els.status.textContent = `Failed to load sandbox: ${err.message}`;
});
