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
const WIN = { perfect: 0.048, great: 0.095, good: 0.138, missAfter: 0.145 }; // same as the game

const els = {
  clips: document.getElementById('clips'),
  song: document.getElementById('clip-song'),
  title: document.getElementById('clip-title'),
  issue: document.getElementById('clip-issue'),
  clock: document.getElementById('clock'),
  play: document.getElementById('btn-play'),
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
  const cacheKey = rv ? `${songId}@v${rv}` : songId;
  if (state.charts.has(cacheKey)) return state.charts.get(cacheKey);
  const track = trackFor(songId);
  const resp = await fetch(`${resolveUrl(track.sidecarUrl.split('?')[0])}?t=${Date.now()}`, { cache: 'no-store' });
  const sidecar = await resp.json();
  if (rv) sidecar.rulesVersion = rv;
  const { hydrateSidecarFeatures, buildChart } = await import(`../audio-engine.js?t=${Date.now()}`);
  const chart = buildChart(hydrateSidecarFeatures(sidecar, null), { keyMode: '4k', density: 'more' });
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
      return `<li data-i="${i}" class="${n.diff || ''}"><span class="k">${key}</span>${fmt(n.time)} · ${kind} · midi ${n.midi}</li>`;
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

  const base = refSnapshot()[clip.song];
  state.oldNotes = base ? clipNotes(base.notes, clip) : [];
  state.newNotes = clipNotes(await currentChart(clip.song, clip.rulesVersion), clip);
  markDiffs(state.oldNotes, state.newNotes);
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
      audioBlobs[url] = fetch(url)
        .then((r) => r.blob())
        .then((b) => URL.createObjectURL(b));
    }
    const blobUrl = await audioBlobs[url];
    state.audio.src = blobUrl;
    state.audio.dataset.src = url;
  }
  seekToStart();
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
  state.audio.playbackRate = state.slow ? 0.5 : 1;
  state.audio.play().catch((e) => (els.status.textContent = `Audio blocked: ${e.message}`));
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
  els.status.textContent = `Play with D F J K (+ ghost S/L) · scroll speed from your game settings · offset adjustable at the top ([ / ]) · Grey = unchanged · Red (baseline) / Green (current) = changed · White outline = chord partner · Dashed lines = audited window`;
  await countAllDiffs();
  await selectClip(0, false);
  requestAnimationFrame(loop);
}

els.play.addEventListener('click', play);
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
  } else if (e.code === 'Escape') {
    state.audio.pause();
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
