// Tiny WebAudio synth for gathering feedback. No assets.
let ctx = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(f0, f1, dur, type = 'triangle', gain = 0.06, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur);
}

function noise(dur, freq, gain = 0.06) {
  const c = ac();
  if (!c) return;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

export const SFX = {
  unlock() { ac(); },
  swing(tool) {
    if (tool === 'pick') { tone(900, 700, 0.06, 'square', 0.03); noise(0.05, 2400, 0.04); }
    else if (tool === 'hatchet') { tone(160, 90, 0.09, 'triangle', 0.07); noise(0.06, 600, 0.05); }
    else noise(0.08, 3200, 0.035);
  },
  success() { tone(660, 990, 0.12, 'sine', 0.05); },
  deplete() { tone(300, 140, 0.25, 'triangle', 0.06); noise(0.18, 400, 0.04); },
  fail() { tone(220, 180, 0.12, 'sine', 0.035); },
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 'triangle', 0.06, i * 0.09)); },
  questComplete() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.3, 'triangle', 0.06, i * 0.11)); },
  clank() { tone(420, 180, 0.12, 'square', 0.04); noise(0.1, 1800, 0.05); },
  repair() { for (let i = 0; i < 6; i++) { tone(300 + Math.random() * 600, 200, 0.06, 'square', 0.025, i * 0.12); } noise(0.5, 900, 0.03); },
  // Singing Crystals: a glassy two-note hum, panned toward the site (-1 left .. 1 right).
  chime(gain, pan) {
    const c = ac();
    if (!c) return;
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(c.destination); }
    const t = c.currentTime;
    for (const [f, d] of [[1318, 0], [1976, 0.07]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t + d);
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(gain, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.7);
      o.connect(g).connect(p || c.destination);
      o.start(t + d);
      o.stop(t + d + 0.75);
    }
  },
  storm() { noise(1.4, 140, 0.08); tone(70, 45, 1.2, 'sawtooth', 0.025); },
  // Per-character voice blip (Animal Crossing style). voice: { pitch, wobble, bitcrush }
  blip(voice, ch) {
    const base = 260 * (voice.pitch || 1);
    const code = ch.toLowerCase().charCodeAt(0) || 97;
    const f = base * (1 + ((code % 7) - 3) * 0.035 * (1 + (voice.wobble || 0) * 2));
    tone(f, f * 0.96, 0.05, voice.bitcrush ? 'square' : 'triangle', voice.bitcrush ? 0.025 : 0.04);
  },
};
