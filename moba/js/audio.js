window.MOBA = window.MOBA || {};

(function (M) {
  'use strict';

  let ctx = null;
  let enabled = true;

  function ensureCtx() {
    if (!enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
    return ctx;
  }

  function tone(freqStart, freqEnd, duration, type, gainVal) {
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }
    gain.gain.setValueAtTime(gainVal || 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  function noiseBurst(duration, filterFreq, filterType, gainVal) {
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime;
    const sampleCount = Math.max(1, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, sampleCount, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / sampleCount, 1.4);
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = filterType || 'bandpass';
    filter.frequency.setValueAtTime(filterFreq || 800, now);

    const gain = c.createGain();
    gain.gain.setValueAtTime(gainVal || 0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start(now);
  }

  M.Audio = {
    isEnabled: function () { return enabled; },
    setEnabled: function (val) { enabled = !!val; },
    unlock: function () { ensureCtx(); },

    play: function (kind) {
      if (!enabled) return;
      switch (kind) {
        case 'bolt':
          tone(360, 110, 0.09, 'sawtooth', 0.06);
          noiseBurst(0.05, 1600, 'highpass', 0.05);
          break;
        case 'pillar':
          tone(220, 520, 0.18, 'sine', 0.09);
          tone(440, 260, 0.22, 'triangle', 0.06);
          break;
        case 'bubble':
          tone(320, 780, 0.13, 'sine', 0.08);
          break;
        case 'chime':
          tone(587, 880, 0.2, 'sine', 0.06);
          break;
        case 'punch':
          tone(150, 48, 0.13, 'triangle', 0.13);
          noiseBurst(0.08, 420, 'lowpass', 0.1);
          break;
        case 'cannon':
          tone(125, 36, 0.24, 'sawtooth', 0.12);
          noiseBurst(0.2, 320, 'lowpass', 0.13);
          break;
        case 'saw':
          tone(190, 250, 0.14, 'sawtooth', 0.055);
          break;
        case 'claw':
          noiseBurst(0.07, 2200, 'bandpass', 0.08);
          tone(420, 170, 0.07, 'triangle', 0.05);
          break;
        case 'bleedPop':
          tone(280, 70, 0.22, 'sawtooth', 0.12);
          noiseBurst(0.14, 950, 'bandpass', 0.11);
          break;
        case 'arena':
          tone(110, 55, 0.35, 'sawtooth', 0.12);
          tone(220, 165, 0.32, 'triangle', 0.08);
          break;
        case 'stealth':
          noiseBurst(0.22, 650, 'lowpass', 0.07);
          tone(240, 140, 0.22, 'sine', 0.05);
          break;
        case 'dash':
          noiseBurst(0.09, 1100, 'bandpass', 0.06);
          break;
        case 'block':
          tone(820, 410, 0.09, 'square', 0.05);
          break;
        case 'levelup':
          tone(440, 660, 0.18, 'triangle', 0.08);
          setTimeout(function () { tone(660, 880, 0.24, 'triangle', 0.08); }, 90);
          break;
      }
    }
  };
})(window.MOBA);
