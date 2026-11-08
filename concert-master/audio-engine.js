/**
 * CADENZA — Predominant Melody Extraction & Stream-Locked Chart Engine (v3 — MELODIA + Viterbi)
 *
 * Architecture:
 *   1. 2048-pt Radix-2 FFT at 22,050 Hz (10.77 Hz bin resolution, 11.61ms hop)
 *   2. Spectral Peak-Picked Whitening -> strips broadband percussion/reverb wash before pitch scoring
 *   3. Subharmonic-Suppressed Harmonic Summation (f0 + 2f0 + ... + 6f0) across 52 lead semitones
 *      (A2 = 110 Hz .. C7 = 2,093 Hz) with lead-register prior -> spotlights melody over bass pads & high flits
 *   4. Global Viterbi Dynamic Programming -> locks onto ONE continuous melodic stream P*(t), refusing
 *      brief 1–2 octave distractions to background chords or piccolo flits
 *   5. Stream-Locked Segmentation -> spawns Taps (fast articulated melody notes) and Hold Ribbons
 *      (exact duration the melody sustains a note!) directly from the tracked melodic voice
 */

export const KEY_MODES = {
  '4k': {
    id: '4k',
    name: '4 Keys',
    sub: 'D F · J K',
    lanes: 4,
    hasSpace: false,
    codes: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
    labels: ['D', 'F', 'J', 'K'],
  },
  '4k-space': {
    id: '4k-space',
    name: '4 Keys + Space',
    sub: 'D F · J K + Space',
    lanes: 4,
    hasSpace: true,
    codes: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
    labels: ['D', 'F', 'J', 'K'],
  },
  '6k-space': {
    id: '6k-space',
    name: '6 Keys + Space',
    sub: 'S D F · J K L + Space',
    lanes: 6,
    hasSpace: true,
    codes: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'],
    labels: ['S', 'D', 'F', 'J', 'K', 'L'],
  },
  '8k-space': {
    id: '8k-space',
    name: '8 Keys + Space',
    sub: 'A S D F · J K L ; + Space',
    lanes: 8,
    hasSpace: true,
    codes: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
    labels: ['A', 'S', 'D', 'F', 'J', 'K', 'L', ';'],
  },
};

/* ---------- Precomputed 2048-pt FFT at 22,050 Hz (10.77 Hz/bin, 11.61ms hop) ---------- */
const FFT_SIZE = 2048;
const HOP_SIZE = 256;
const TARGET_RATE = 22050;
const BIN_HZ = TARGET_RATE / FFT_SIZE; // 10.7666 Hz

// 52 candidate melody semitones: MIDI 45 (A2 = 110 Hz) .. MIDI 96 (C7 = 2093 Hz)
const MELODY_MIDI_MIN = 45;
const NUM_MELODY_PITCHES = 52;
const UNVOICED_STATE = NUM_MELODY_PITCHES;
const NUM_VITERBI_STATES = NUM_MELODY_PITCHES + 1;
const NUM_HARMONICS = 6;
const HARM_WEIGHTS = new Float32Array([1.0, 0.88, 0.74, 0.58, 0.44, 0.32]);

const bitRev = new Uint16Array(FFT_SIZE);
const hannWin = new Float32Array(FFT_SIZE);
const cosTable = new Float32Array(FFT_SIZE / 2);
const sinTable = new Float32Array(FFT_SIZE / 2);

// Precomputed harmonic bin lookup tables [p * NUM_HARMONICS + h]
const harmLowBin = new Uint16Array(NUM_MELODY_PITCHES * NUM_HARMONICS);
const harmHighBin = new Uint16Array(NUM_MELODY_PITCHES * NUM_HARMONICS);
const registerPrior = new Float32Array(NUM_MELODY_PITCHES);
const transitionCost = new Float32Array(NUM_MELODY_PITCHES * NUM_MELODY_PITCHES);

(function initTables() {
  const bits = Math.log2(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    let rev = 0;
    let x = i;
    for (let b = 0; b < bits; b++) {
      rev = (rev << 1) | (x & 1);
      x >>= 1;
    }
    bitRev[i] = rev;
    hannWin[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }
  for (let i = 0; i < FFT_SIZE / 2; i++) {
    const angle = (-2 * Math.PI * i) / FFT_SIZE;
    cosTable[i] = Math.cos(angle);
    sinTable[i] = Math.sin(angle);
  }

  const maxBin = FFT_SIZE / 2 - 2;
  for (let p = 0; p < NUM_MELODY_PITCHES; p++) {
    const midi = MELODY_MIDI_MIN + p;
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);

    // Lead-instrument register prior: flat plateau across G3 (55) .. C6 (84),
    // steeper rolloff on low bass accompaniment (<G3) and high piccolo flits (>C6)
    if (midi >= 55 && midi <= 83) {
      registerPrior[p] = 1.0 + 0.08 * Math.sin(((midi - 55) / 28) * Math.PI);
    } else if (midi < 55) {
      registerPrior[p] = Math.max(0.22, 1.0 - (55 - midi) * 0.088);
    } else {
      registerPrior[p] = Math.max(0.32, 1.0 - (midi - 83) * 0.058);
    }

    for (let h = 0; h < NUM_HARMONICS; h++) {
      const fh = f0 * (h + 1);
      const halfSemiHz = fh * 0.029; // ±50 cents tolerance around h*f0
      const cBin = fh / BIN_HZ;
      const wBins = Math.max(1.0, halfSemiHz / BIN_HZ);
      const idx = p * NUM_HARMONICS + h;
      harmLowBin[idx] = Math.min(maxBin, Math.max(2, Math.floor(cBin - wBins)));
      harmHighBin[idx] = Math.min(maxBin, Math.max(2, Math.ceil(cBin + wBins)));
    }
  }

  // Viterbi pitch-continuity transition penalties
  // Stepwise & triad motion (1..5 semitones) is fluid; large leaps (>=7 semitones) carry strong
  // round-trip inertia so brief 150ms bass stabs or piccolo flits never hijack the active melody!
  for (let p1 = 0; p1 < NUM_MELODY_PITCHES; p1++) {
    for (let p2 = 0; p2 < NUM_MELODY_PITCHES; p2++) {
      const dp = Math.abs(p2 - p1);
      let c = 0;
      if (dp === 0) c = 0.0;
      else if (dp === 1) c = 0.46;
      else if (dp === 2) c = 0.52;
      else if (dp <= 5) c = 0.68 + (dp - 3) * 0.18;
      else if (dp === 6) c = 1.45;
      else if (dp < 12) c = 1.85 + (dp - 7) * 0.42;
      else if (dp === 12) c = 4.60; // Strong octave-flip guard during sustained notes
      else c = 4.30 + (dp - 12) * 0.48;
      transitionCost[p1 * NUM_MELODY_PITCHES + p2] = c;
    }
  }
})();

function fftInPlace(real, imag) {
  for (let i = 0; i < FFT_SIZE; i++) {
    const j = bitRev[i];
    if (j > i) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
  }
  for (let size = 2; size <= FFT_SIZE; size <<= 1) {
    const half = size >> 1;
    const step = FFT_SIZE / size;
    for (let i = 0; i < FFT_SIZE; i += size) {
      let k = 0;
      for (let j = i; j < i + half; j++) {
        const l = j + half;
        const wr = cosTable[k];
        const wi = sinTable[k];
        const tr = wr * real[l] - wi * imag[l];
        const ti = wr * imag[l] + wi * real[l];
        real[l] = real[j] - tr;
        imag[l] = imag[j] - ti;
        real[j] += tr;
        imag[j] += ti;
        k += step;
      }
    }
  }
}

export async function extractTrackFeatures(audioBuffer, onProgress = () => {}) {
  onProgress(0.05, 'Downmixing stereo stage channels...');
  await nextTick();

  const srcRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const srcLen = audioBuffer.length;
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = numChannels > 1 ? audioBuffer.getChannelData(1) : null;

  const ratio = srcRate / TARGET_RATE;
  const monoLen = Math.floor(srcLen / ratio);
  const mono = new Float32Array(monoLen);

  if (Math.abs(ratio - 2.0) < 0.02) {
    for (let i = 0; i < monoLen; i++) {
      const s = i * 2;
      mono[i] = ch1
        ? 0.25 * (ch0[s] + ch1[s] + (ch0[s + 1] || 0) + (ch1[s + 1] || 0))
        : 0.5 * (ch0[s] + (ch0[s + 1] || 0));
    }
  } else {
    for (let i = 0; i < monoLen; i++) {
      const idx = Math.min(srcLen - 1, Math.floor(i * ratio));
      mono[i] = ch1 ? 0.5 * (ch0[idx] + ch1[idx]) : ch0[idx];
    }
  }

  const numFrames = Math.max(1, Math.floor((monoLen - FFT_SIZE) / HOP_SIZE));
  const frameDt = HOP_SIZE / TARGET_RATE; // 0.01161s
  const windowCenterSec = (FFT_SIZE * 0.5) / TARGET_RATE - 0.006;

  const rms = new Float32Array(numFrames);
  const coreAttack = new Float32Array(numFrames);
  const impactFlux = new Float32Array(numFrames);
  const unpitchedFlux = new Float32Array(numFrames); // Fallback for pure percussion solos!
  const salienceFlat = new Float32Array(numFrames * NUM_MELODY_PITCHES);
  const chromaSeq = new Float32Array(numFrames * 12);

  const real = new Float32Array(FFT_SIZE);
  const imag = new Float32Array(FFT_SIZE);
  const MAX_SPEC_BIN = Math.min(FFT_SIZE >> 1, 820); // Up to ~8.8 kHz
  const mags = new Float32Array(MAX_SPEC_BIN);
  const localBg = new Float32Array(MAX_SPEC_BIN);
  const whitenedPeaks = new Float32Array(MAX_SPEC_BIN);

  // Tight 512-sample (~23ms) center slice for crisp transient timing
  const CORE_START = (FFT_SIZE >> 1) - 256;
  const CORE_END = (FFT_SIZE >> 1) + 256;
  const CORE_LEN = CORE_END - CORE_START;

  let prevCoreLog1 = 0;
  let prevCoreLog2 = 0;
  let prevLowLog1 = 0;
  let prevLowLog2 = 0;
  let prevHighNoise1 = 0;
  let maxRms = 1e-6;

  for (let f = 0; f < numFrames; f++) {
    if (f > 0 && f % 5500 === 0) {
      const pct = 0.10 + 0.62 * (f / numFrames);
      onProgress(pct, `Scoring harmonic overtone stacks (${Math.round((f / numFrames) * 100)}%)...`);
      await nextTick();
    }

    const offset = f * HOP_SIZE;
    let coreSq = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      real[i] = mono[offset + i] * hannWin[i];
      imag[i] = 0;
    }
    for (let i = CORE_START; i < CORE_END; i++) {
      const s = mono[offset + i];
      coreSq += s * s;
    }

    const cRms = Math.sqrt(coreSq / CORE_LEN);
    rms[f] = cRms;
    if (cRms > maxRms) maxRms = cRms;

    const coreLog = Math.log(cRms + 0.0015);
    const coreRef = Math.max(prevCoreLog1, prevCoreLog2);
    const cJump = coreLog > coreRef ? coreLog - coreRef : 0;
    prevCoreLog2 = prevCoreLog1;
    prevCoreLog1 = coreLog;
    coreAttack[f] = cJump;

    fftInPlace(real, imag);

    const invN = 1 / FFT_SIZE;
    for (let k = 1; k < MAX_SPEC_BIN; k++) {
      mags[k] = Math.hypot(real[k], imag[k]) * invN;
    }

    // 1. Sub/Low Bass Impact (43 Hz – 150 Hz: bins 4..14) + High Broadband Crash
    let lowEnergy = 0;
    for (let k = 4; k <= 14; k++) {
      lowEnergy += mags[k] * (k <= 9 ? 1.55 : 1.0);
    }
    const lowLog = Math.log(lowEnergy + 0.0012);
    const lowRef = Math.max(prevLowLog1, prevLowLog2);
    const lowJump = lowLog > lowRef ? lowLog - lowRef : 0;
    prevLowLog2 = prevLowLog1;
    prevLowLog1 = lowLog;

    let highNoise = 0;
    for (let k = 180; k < 560; k += 2) highNoise += mags[k];
    const hnLog = Math.log(highNoise + 0.002);
    const hnJump = hnLog > prevHighNoise1 ? hnLog - prevHighNoise1 : 0;
    prevHighNoise1 = hnLog * 0.6 + prevHighNoise1 * 0.4;

    impactFlux[f] = lowJump * 2.3 + (cJump > 0.20 && hnJump > 0.16 ? (cJump + hnJump) * 0.9 : 0);
    unpitchedFlux[f] = cJump * 1.8 + hnJump * 1.4 + lowJump * 0.8;

    // 2. Spectral Whitening & Sinusoidal Peak Isolation (±9 bins = ±97 Hz moving average)
    // Strips flat percussion/cymbal/hall wash so only true pitched partials feed Harmonic Summation!
    const BG_HALF = 9;
    let runSum = 0;
    let runCnt = 0;
    for (let k = 1; k < Math.min(MAX_SPEC_BIN, BG_HALF); k++) {
      runSum += mags[k];
      runCnt++;
    }
    for (let k = 1; k < MAX_SPEC_BIN; k++) {
      if (k + BG_HALF < MAX_SPEC_BIN) {
        runSum += mags[k + BG_HALF];
        runCnt++;
      }
      if (k - BG_HALF - 1 >= 1) {
        runSum -= mags[k - BG_HALF - 1];
        runCnt--;
      }
      localBg[k] = runSum / runCnt;
    }

    whitenedPeaks.fill(0);
    for (let k = 3; k < MAX_SPEC_BIN - 2; k++) {
      const m = mags[k];
      const bg = localBg[k];
      // Keep bins near spectral peaks that rise distinctly above local broadband wash
      if (m > bg * 1.16 && m >= mags[k - 1] * 0.85 && m >= mags[k + 1] * 0.85) {
        whitenedPeaks[k] = m - bg * 0.72;
      }
    }

    // 3. Harmonic Summation Salience (MELODIA + Subharmonic Odd-Even Suppression)
    const salBase = f * NUM_MELODY_PITCHES;
    const chromaBase = f * 12;

    for (let p = 0; p < NUM_MELODY_PITCHES; p++) {
      const hBase = p * NUM_HARMONICS;
      let oddSum = 0;
      let evenSum = 0;
      let h1 = 0;

      for (let h = 0; h < NUM_HARMONICS; h++) {
        const b0 = harmLowBin[hBase + h];
        const b1 = harmHighBin[hBase + h];
        let best = 0;
        for (let k = b0; k <= b1; k++) {
          if (whitenedPeaks[k] > best) best = whitenedPeaks[k];
        }
        const weighted = best * HARM_WEIGHTS[h];
        if (h === 0) h1 = weighted;
        if ((h & 1) === 0) oddSum += weighted; // h=0 (f0), h=2 (3f0), h=4 (5f0)
        else evenSum += weighted;              // h=1 (2f0), h=3 (4f0), h=5 (6f0)
      }

      const rawStack = oddSum + evenSum;
      if (rawStack > 1e-7) {
        // Sub-octave suppression: if f0+3f0+5f0 is weak compared to 2f0+4f0+6f0, this is a ghost sub-octave!
        const oddSupport = Math.min(1.0, (oddSum * 1.75) / (evenSum + 1e-9));
        // Also require at least minimal fundamental presence (allows soft horn/oboe f0, blocks pure missing-f0 ghosts)
        const f0Gate = h1 > rawStack * 0.045 ? 1.0 : (h1 / (rawStack * 0.045 + 1e-9)) * 0.55;
        const sal = rawStack * oddSupport * f0Gate * registerPrior[p];
        salienceFlat[salBase + p] = sal;
        chromaSeq[chromaBase + ((MELODY_MIDI_MIN + p) % 12)] += sal;
      }
    }
  }

  onProgress(0.76, 'Tracking predominant melodic voice (Viterbi path)...');
  await nextTick();

  // 4. Global Viterbi Predominant Melody Stream Extraction
  const noiseGateRms = maxRms * 0.0045;
  const { melodyPitch, streamAmp, pitchNoveltyRatio } = extractViterbiMelodyStream(
    salienceFlat,
    rms,
    numFrames,
    noiseGateRms
  );

  onProgress(0.88, 'Mapping melodic phrasing & tempo regimes...');
  await nextTick();

  const harmonicFlux = computeChromaNovelty(chromaSeq, rms, numFrames, noiseGateRms);
  const macroIntensity = computeMacroIntensity(rms, frameDt);

  // Measure Stream-Specific Attack Flux + Activity Regime directly on the tracked melody!
  const {
    streamAttack,
    activityCurve,
    globalStreamAtkRef,
  } = computeStreamDynamicsAndRegime(
    melodyPitch,
    streamAmp,
    unpitchedFlux,
    rms,
    frameDt,
    noiseGateRms
  );

  onProgress(0.96, 'Sculpting dynamic elevation & highway contour...');
  await nextTick();

  const silhouetteBins = 240;
  const elevationProfile = new Float32Array(silhouetteBins);
  for (let b = 0; b < silhouetteBins; b++) {
    const startF = Math.floor((b / silhouetteBins) * numFrames);
    const endF = Math.max(startF + 1, Math.floor(((b + 1) / silhouetteBins) * numFrames));
    let sum = 0;
    for (let f = startF; f < endF; f++) sum += macroIntensity[f];
    elevationProfile[b] = sum / (endF - startF);
  }

  onProgress(1.0, 'Ready for downbeat.');
  return {
    duration: audioBuffer.duration,
    numFrames,
    frameDt,
    windowCenterSec,
    maxRms,
    noiseGateRms,
    globalStreamAtkRef,
    rms,
    coreAttack,
    impactFlux,
    unpitchedFlux,
    harmonicFlux,
    melodyPitch,
    streamAmp,
    pitchNoveltyRatio,
    streamAttack,
    macroIntensity,
    activityCurve,
    elevationProfile,
  };
}

/**
 * Runs Viterbi Dynamic Programming across the entire piece to lock onto ONE continuous
 * predominant melodic contour, ignoring off-stream accompaniment chords and high flits.
 */
function extractViterbiMelodyStream(salienceFlat, rms, numFrames, noiseGateRms) {
  const frameMaxSal = new Float32Array(numFrames);
  const peakSamples = [];

  for (let f = 0; f < numFrames; f++) {
    if (rms[f] < noiseGateRms) continue;
    const base = f * NUM_MELODY_PITCHES;
    let mx = 0;
    for (let p = 0; p < NUM_MELODY_PITCHES; p++) {
      if (salienceFlat[base + p] > mx) mx = salienceFlat[base + p];
    }
    frameMaxSal[f] = mx;
    if (f % 4 === 0 && mx > 1e-6) peakSamples.push(mx);
  }

  peakSamples.sort((a, b) => a - b);
  const medianPeak = peakSamples.length > 20 ? peakSamples[Math.floor(peakSamples.length * 0.5)] : 0.01;
  const voicedSalienceFloor = Math.max(1e-6, medianPeak * 0.045);

  // Backpointer matrix stored compactly in Uint8Array (~2MB for an 8-min symphony)
  const backptr = new Uint8Array(numFrames * NUM_VITERBI_STATES);
  let prevScore = new Float64Array(NUM_VITERBI_STATES);
  let currScore = new Float64Array(NUM_VITERBI_STATES);

  prevScore.fill(-1e9);
  prevScore[UNVOICED_STATE] = 0;

  const ENTER_VOICED_COST = 1.05;
  const EXIT_VOICED_COST = 1.05;

  for (let f = 0; f < numFrames; f++) {
    const fMax = frameMaxSal[f];
    const bpBase = f * NUM_VITERBI_STATES;

    if (rms[f] < noiseGateRms || fMax < voicedSalienceFloor) {
      // Unvoiced / Rest frame (grand pause, breath, or unpitched percussion solo)
      for (let p = 0; p < NUM_MELODY_PITCHES; p++) {
        currScore[p] = prevScore[p] - 0.85; // penalize lingering in voiced state during silence
        backptr[bpBase + p] = p;
      }
      // Best transition into Unvoiced
      let bestPrev = UNVOICED_STATE;
      let bestVal = prevScore[UNVOICED_STATE] + 0.95;
      for (let p = 0; p < NUM_MELODY_PITCHES; p++) {
        const cand = prevScore[p] - EXIT_VOICED_COST + 0.95;
        if (cand > bestVal) {
          bestVal = cand;
          bestPrev = p;
        }
      }
      currScore[UNVOICED_STATE] = bestVal;
      backptr[bpBase + UNVOICED_STATE] = bestPrev;
    } else {
      const salBase = f * NUM_MELODY_PITCHES;
      // Compute harmonic clarity (peakedness of top pitch vs average pitch clutter)
      let salSum = 0;
      for (let p = 0; p < NUM_MELODY_PITCHES; p++) salSum += salienceFlat[salBase + p];
      const meanSal = salSum / NUM_MELODY_PITCHES;
      const clarity = fMax / (meanSal * 4.5 + 1e-9); // >1.0 when a pitched voice clearly leads

      const strengthScale = Math.min(1.55, 0.55 + 0.42 * Math.log1p(6.0 * (fMax / medianPeak)));
      const invMax = 1 / fMax;

      for (let p = 0; p < NUM_MELODY_PITCHES; p++) {
        // Emission reward in [0 .. ~1.55]
        const rel = salienceFlat[salBase + p] * invMax;
        // Sharpen rel^1.35 so true harmonic peaks decisively beat background chord tones
        const emission = Math.pow(rel, 1.35) * strengthScale;

        // Candidate 1: enter from Unvoiced
        let bestPrev = UNVOICED_STATE;
        let bestVal = prevScore[UNVOICED_STATE] - ENTER_VOICED_COST + emission;

        // Candidate 2: transition from previous pitch pPrev
        const rowOffset = p * NUM_MELODY_PITCHES;
        for (let pPrev = 0; pPrev < NUM_MELODY_PITCHES; pPrev++) {
          const cand = prevScore[pPrev] - transitionCost[rowOffset + pPrev] + emission;
          if (cand > bestVal) {
            bestVal = cand;
            bestPrev = pPrev;
          }
        }
        currScore[p] = bestVal;
        backptr[bpBase + p] = bestPrev;
      }

      // Unvoiced state reward: attractive only if spectrum is noisy/unpitched (low clarity < 0.72)
      const unvoicedEmission = clarity < 0.72 ? 0.78 : 0.12;
      let bestU = UNVOICED_STATE;
      let bestUVal = prevScore[UNVOICED_STATE] + unvoicedEmission;
      for (let p = 0; p < NUM_MELODY_PITCHES; p++) {
        const cand = prevScore[p] - EXIT_VOICED_COST + unvoicedEmission;
        if (cand > bestUVal) {
          bestUVal = cand;
          bestU = p;
        }
      }
      currScore[UNVOICED_STATE] = bestUVal;
      backptr[bpBase + UNVOICED_STATE] = bestU;
    }

    // Swap buffers
    const tmp = prevScore;
    prevScore = currScore;
    currScore = tmp;
  }

  // Backtrack optimal global melody path
  const rawPath = new Int16Array(numFrames);
  let bestEndState = UNVOICED_STATE;
  let bestEndScore = prevScore[UNVOICED_STATE];
  for (let s = 0; s < NUM_VITERBI_STATES; s++) {
    if (prevScore[s] > bestEndScore) {
      bestEndScore = prevScore[s];
      bestEndState = s;
    }
  }

  let state = bestEndState;
  for (let f = numFrames - 1; f >= 0; f--) {
    rawPath[f] = state === UNVOICED_STATE ? -1 : state;
    state = backptr[f * NUM_VITERBI_STATES + state];
  }

  // Clean 1–2 frame micro-glitches via 5-frame majority/median smoothing
  const melodyPitch = new Int16Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const p = rawPath[f];
    if (f >= 2 && f < numFrames - 2) {
      // If surrounded on both sides by the same pitch, snap single-frame blip
      if (rawPath[f - 1] === rawPath[f + 1] && p !== rawPath[f - 1]) {
        melodyPitch[f] = rawPath[f - 1];
        continue;
      }
      if (rawPath[f - 2] === rawPath[f + 2] && rawPath[f - 2] === rawPath[f - 1] && p !== rawPath[f - 1]) {
        melodyPitch[f] = rawPath[f - 1];
        continue;
      }
    }
    melodyPitch[f] = p;
  }

  // Extract stream-specific harmonic amplitude & whether melodyPitch[f] is genuinely NEW vs already ringing in the chord!
  const streamAmp = new Float32Array(numFrames);
  const pitchNoveltyRatio = new Float32Array(numFrames);

  for (let f = 0; f < numFrames; f++) {
    const p = melodyPitch[f];
    if (p < 0) continue;
    const salBase = f * NUM_MELODY_PITCHES;
    const pLow = Math.max(0, p - 1);
    const pHigh = Math.min(NUM_MELODY_PITCHES - 1, p + 1);
    let sEnergy = 0;
    for (let k = pLow; k <= pHigh; k++) {
      if (salienceFlat[salBase + k] > sEnergy) sEnergy = salienceFlat[salBase + k];
    }
    streamAmp[f] = sEnergy;

    // Compare current salience of pitch p against its salience ~120ms ago (normalized by RMS so crescendos stay = 1.0!)
    if (f >= 12 && rms[f - 10] > noiseGateRms) {
      const prevBase = (f - 10) * NUM_MELODY_PITCHES;
      let prevE = 0;
      for (let k = pLow; k <= pHigh; k++) {
        if (salienceFlat[prevBase + k] > prevE) prevE = salienceFlat[prevBase + k];
      }
      const curRel = sEnergy / (rms[f] + 0.005);
      const prevRel = prevE / (rms[f - 10] + 0.005);
      pitchNoveltyRatio[f] = curRel / (prevRel + 1e-5);
    } else {
      pitchNoveltyRatio[f] = 10.0;
    }
  }

  return { melodyPitch, streamAmp, pitchNoveltyRatio };
}

/**
 * Measures stream-specific tonguing/re-attacks along the melody contour AND classifies
 * Fast/Articulate vs. Slow/Lyrical sections directly from how rapidly the melody itself moves!
 */
function computeStreamDynamicsAndRegime(
  melodyPitch,
  streamAmp,
  unpitchedFlux,
  rms,
  frameDt,
  noiseGateRms
) {
  const n = melodyPitch.length;
  const streamAttack = new Float32Array(n);
  const melodyEventImpulse = new Float32Array(n);

  const atkSamples = [];
  for (let f = 3; f < n; f++) {
    if (melodyPitch[f] >= 0 && rms[f] > noiseGateRms) {
      const curLog = Math.log(streamAmp[f] + 0.0008);
      const prevRef = Math.max(
        Math.log(streamAmp[f - 2] + 0.0008),
        Math.log(streamAmp[f - 3] + 0.0008)
      );
      // Only measure same-pitch re-attack when pitch hasn't just stepped
      const jump = curLog > prevRef ? curLog - prevRef : 0;
      streamAttack[f] = jump;
      if (jump > 0.04) atkSamples.push(jump);
    }
  }
  atkSamples.sort((a, b) => a - b);
  const globalStreamAtkRef =
    atkSamples.length > 20 ? atkSamples[Math.floor(atkSamples.length * 0.75)] : 0.25;

  // Count how many times per second the MELODY ITSELF either steps pitch or sharply re-tongues!
  let lastEvtFrame = -15;
  let heldPitch = -1;
  for (let f = 4; f < n - 4; f++) {
    if (rms[f] < noiseGateRms) {
      heldPitch = -1;
      continue;
    }
    const p = melodyPitch[f];
    if (p < 0) continue;

    const pitchStepped =
      p !== heldPitch &&
      Math.abs(p - heldPitch) !== 12 &&
      melodyPitch[f + 1] === p &&
      melodyPitch[f + 2] === p;

    const sharpTongue =
      streamAttack[f] >= Math.max(0.18, globalStreamAtkRef * 0.85) &&
      streamAttack[f] >= streamAttack[f - 1] &&
      streamAttack[f] >= streamAttack[f + 1];

    if ((pitchStepped || sharpTongue) && f - lastEvtFrame >= 8) {
      melodyEventImpulse[f] = 1;
      heldPitch = p;
      lastEvtFrame = f;
    } else if (heldPitch < 0) {
      heldPitch = p;
    }
  }

  // Smooth melodic note-rate over ±2.3s window -> Slow Chorale (<=1.6 notes/s) vs Fast Allegro (>=3.8 notes/s)
  const winHalf = Math.max(12, Math.round(2.3 / frameDt));
  const melRatePerFrame = rollingMean(melodyEventImpulse, winHalf);
  const activityCurve = new Float32Array(n);

  for (let f = 0; f < n; f++) {
    const notesPerSec = melRatePerFrame[f] / frameDt;
    activityCurve[f] = Math.max(0, Math.min(1, (notesPerSec - 1.55) / 2.35));
  }

  const smoothHalf = Math.max(6, Math.round(1.2 / frameDt));
  return {
    streamAttack,
    activityCurve: rollingMean(activityCurve, smoothHalf),
    globalStreamAtkRef: Math.max(0.14, globalStreamAtkRef),
  };
}

function computeChromaNovelty(chromaSeq, rms, numFrames, silenceGate) {
  const out = new Float32Array(numFrames);
  const W = 10;
  const leftVec = new Float32Array(12);
  const rightVec = new Float32Array(12);

  for (let f = W + 2; f < numFrames - W - 2; f++) {
    if (rms[f] < silenceGate) continue;
    leftVec.fill(0);
    rightVec.fill(0);
    for (let k = 2; k <= W; k++) {
      const lBase = (f - k) * 12;
      const rBase = (f + k) * 12;
      for (let c = 0; c < 12; c++) {
        leftVec[c] += chromaSeq[lBase + c];
        rightVec[c] += chromaSeq[rBase + c];
      }
    }
    let dot = 0;
    let normL = 0;
    let normR = 0;
    for (let c = 0; c < 12; c++) {
      dot += leftVec[c] * rightVec[c];
      normL += leftVec[c] * leftVec[c];
      normR += rightVec[c] * rightVec[c];
    }
    const denom = Math.sqrt(normL * normR);
    if (denom > 1e-9) {
      const cosSim = Math.max(0, Math.min(1, dot / denom));
      const entranceBoost = normR >= normL * 0.45 ? 1.0 : 0.3;
      out[f] = (1.0 - cosSim) * entranceBoost;
    }
  }
  return out;
}

function computeMacroIntensity(rms, frameDt) {
  const n = rms.length;
  const out = new Float32Array(n);
  const halfWin = Math.max(2, Math.round(0.7 / frameDt));
  let running = 0;
  let count = 0;

  for (let i = 0; i < Math.min(n, halfWin); i++) {
    running += rms[i];
    count++;
  }
  for (let i = 0; i < n; i++) {
    const addIdx = i + halfWin;
    if (addIdx < n) {
      running += rms[addIdx];
      count++;
    }
    const remIdx = i - halfWin - 1;
    if (remIdx >= 0) {
      running -= rms[remIdx];
      count--;
    }
    out[i] = Math.log1p(18 * (running / Math.max(1, count)));
  }

  const sampleStep = Math.max(1, Math.floor(n / 2000));
  const sorted = [];
  for (let i = 0; i < n; i += sampleStep) sorted.push(out[i]);
  sorted.sort((a, b) => a - b);

  const pLow = sorted[Math.floor(sorted.length * 0.06)] || 0;
  const pHigh = sorted[Math.floor(sorted.length * 0.985)] || 1;
  const span = Math.max(1e-5, pHigh - pLow);

  for (let i = 0; i < n; i++) {
    out[i] = Math.max(0, Math.min(1, (out[i] - pLow) / span));
  }
  return out;
}

/**
 * Hydrates a pre-computed Python Neural ML sidecar (.cadenza.json) into a features object
 * compatible with StageRenderer, HUD elevation scrubber, and buildChart() in <3ms!
 */
export function hydrateSidecarFeatures(sidecar, audioBuffer) {
  const duration = audioBuffer ? audioBuffer.duration : sidecar.duration;
  const macroArr = Float32Array.from(sidecar.macroIntensity || []);
  const macroHz = sidecar.macroHz || 10;
  const numFrames = Math.max(1, macroArr.length);
  const frameDt = 1 / macroHz;

  return {
    isNeuralSidecar: true,
    sidecarGenerator: sidecar.generator || 'neural',
    duration,
    numFrames,
    frameDt,
    macroIntensity: macroArr,
    elevationProfile: Float32Array.from(sidecar.elevationProfile || []),
    melodyNotes: sidecar.melodyNotes || [],
    impacts: sidecar.impacts || [],
  };
}

function buildChartFromSidecar(features, { keyMode = '6k-space', density = 'fewer' } = {}) {
  const mode = KEY_MODES[keyMode] || KEY_MODES['6k-space'];
  const lanes = mode.lanes;
  const hasSpace = mode.hasSpace;
  const isDense = density === 'more';
  const duration = features.duration;

  // Filter neural melody notes by tier (tier 1 = core melody; tier 2 = fast 16th runs/ornaments)
  const rawMel = features.melodyNotes.filter((n) => (isDense ? n[4] <= 2 : n[4] === 1));

  const notes = [];
  let prevLane = Math.floor(lanes / 2);
  let prev2Lane = -1;
  let sameLaneStreak = 0;
  let prevMidi = rawMel.length ? rawMel[0][2] : 64;
  let prev2Midi = -1;
  let prevTime = -10;
  let prevDt = 99;
  let lastChordTime = -10;
  let nextId = 1;

  // Pre-plan smooth multi-finger rolls for fast scalar runs (dt < 0.24s) so ascending/descending licks
  // (like the 3:49 5-note flute climb) roll cleanly across keys instead of clamping into J-K-K-K-K!
  const plannedRunLanes = precomputeScalarRunLanes(rawMel, lanes);

  for (let i = 0; i < rawMel.length; i++) {
    const [tStart, tEnd, midi, conf, _tier, act] = rawMel[i];
    if (tStart < 0.01 || tStart > duration - 0.35) continue;
    const nextStart = i + 1 < rawMel.length ? rawMel[i + 1][0] : duration - 0.2;

    // Rolling melodic phrase pitch range (±10 melody notes within ±5.0s, bounded by register/voice handoffs!)
    let wLo = i;
    while (wLo > Math.max(0, i - 10)) {
      const dtBack = rawMel[wLo][0] - rawMel[wLo - 1][0];
      const dpBack = Math.abs(rawMel[wLo][2] - rawMel[wLo - 1][2]);
      if (dtBack >= 2.0 || dpBack >= 6 || Math.abs(rawMel[wLo - 1][0] - tStart) > 5.0) break;
      wLo--;
    }
    let wHi = i;
    while (wHi < Math.min(rawMel.length - 1, i + 10)) {
      const dtFwd = rawMel[wHi + 1][0] - rawMel[wHi][0];
      const dpFwd = Math.abs(rawMel[wHi + 1][2] - rawMel[wHi][2]);
      if (dtFwd >= 2.0 || dpFwd >= 6 || Math.abs(rawMel[wHi + 1][0] - tStart) > 5.0) break;
      wHi++;
    }
    const winPitches = [];
    for (let j = wLo; j <= wHi; j++) {
      winPitches.push(rawMel[j][2]);
    }
    let pMin = midi - 5;
    let pMax = midi + 5;
    if (winPitches.length >= 3) {
      winPitches.sort((a, b) => a - b);
      pMin = winPitches[0];
      pMax = winPitches[winPitches.length - 1];
    }
    const pSpan = Math.max(5.0, pMax - pMin);
    const pNorm = Math.max(0, Math.min(1, (midi - pMin) / pSpan));

    const dtPrev = tStart - prevTime;
    const dp = midi - prevMidi;
    let upStepsAhead = 0;
    for (let k = i; k + 1 < rawMel.length; k++) {
      const dtK = rawMel[k + 1][0] - rawMel[k][0];
      const dpK = rawMel[k + 1][2] - rawMel[k][2];
      const isSlowHoldEntry =
        winPitches.length === 1 && Math.abs(dp) >= 12 && rawMel[k + 1][0] - rawMel[k][1] < 0.20;
      if ((dtK < 0.70 || isSlowHoldEntry) && dpK >= 1 && dpK <= 4) upStepsAhead++;
      else break;
    }
    let upStepsBehind = 0;
    for (let k = i; k > 0; k--) {
      const dtK = rawMel[k][0] - rawMel[k - 1][0];
      const dpK = rawMel[k][2] - rawMel[k - 1][2];
      if (dtK < 0.70 && dpK >= 1 && dpK <= 4) upStepsBehind++;
      else break;
    }
    let downStepsAhead = 0;
    for (let k = i; k + 1 < rawMel.length; k++) {
      const dtK = rawMel[k + 1][0] - rawMel[k][0];
      const dpK = rawMel[k + 1][2] - rawMel[k][2];
      if (dtK < 0.70 && dpK <= -1 && dpK >= -4) downStepsAhead++;
      else break;
    }
    let downStepsBehind = 0;
    for (let k = i; k > 0; k--) {
      const dtK = rawMel[k][0] - rawMel[k - 1][0];
      const dpK = rawMel[k][2] - rawMel[k - 1][2];
      if (dtK < 0.70 && dpK <= -1 && dpK >= -4) downStepsBehind++;
      else break;
    }
    let downStepsAfterPeak = 0;
    const dropStartIdx = i - downStepsBehind;
    if (
      downStepsBehind + downStepsAhead === (lanes === 8 ? 5 : lanes - 1) &&
      dropStartIdx > 0 &&
      rawMel[dropStartIdx][0] - rawMel[dropStartIdx - 1][0] < 0.25 &&
      rawMel[dropStartIdx][2] - rawMel[dropStartIdx - 1][2] <= -5
    ) {
      downStepsAfterPeak = -99;
    } else if (upStepsAhead === 1 && i + 1 < rawMel.length) {
      for (let k = i + 1; k + 1 < rawMel.length; k++) {
        const dtK = rawMel[k + 1][0] - rawMel[k][0];
        const dpK = rawMel[k + 1][2] - rawMel[k][2];
        if (dtK < 0.70 && dpK <= -1 && dpK >= -4) downStepsAfterPeak++;
        else break;
      }
    }
    const isNeighborReturn =
      i >= 2 && dtPrev < 0.55 && prevDt < 0.55 && midi === prev2Midi && midi !== prevMidi;
    let lane =
      plannedRunLanes[i] !== undefined
        ? plannedRunLanes[i]
        : selectErgonomicLane({
            lanes,
            pNorm,
            dp,
            dtPrev,
            upStepsAhead,
            upStepsBehind,
            downStepsAhead,
            downStepsBehind,
            downStepsAfterPeak,
            prevLane,
            prev2Lane,
            isNeighborReturn,
            sameLaneStreak,
            isLegatoHoldStep:
              i > 0 &&
              dtPrev >= 1.2 &&
              dp >= 1 &&
              dp <= 2 &&
              tStart - rawMel[i - 1][1] < 0.05 &&
              rawMel[i - 1][1] - rawMel[i - 1][0] >= 1.2,
          });
    if (plannedRunLanes[i] !== undefined && dtPrev < 0.32 && lane === prevLane) {
      const minL = lanes === 8 ? 1 : 0;
      const maxL = lanes === 8 ? 6 : lanes - 1;
      if (lane === minL + 1 && dp <= 0) lane = minL;
      else if (lane === maxL - 1 && dp >= 0) lane = maxL;
    }
    // Score-tagged percussion taps (7th field === 1, e.g. Guthix intro Drum Set 1) rock across the inner home-row keys
    if (rawMel[i].length > 6 && rawMel[i][6] === 1) {
      const centerLeft = Math.max(0, Math.floor(lanes / 2) - 1);
      const centerRight = Math.min(lanes - 1, Math.floor(lanes / 2));
      lane = midi % 2 === 0 ? centerLeft : centerRight;
    }
    // Score-planned lane hints (7th field 10..13 = D/F/J/K on the 4-key home row, centered on wider layouts)
    if (rawMel[i].length > 6 && rawMel[i][6] >= 10 && rawMel[i][6] <= 13) {
      const hint4 = rawMel[i][6] - 10;
      lane = lanes <= 4 ? Math.min(lanes - 1, hint4) : Math.floor((lanes - 4) / 2) + hint4;
    }

    sameLaneStreak = lane === prevLane ? sameLaneStreak + 1 : 1;

    const fIdx = Math.min(features.numFrames - 1, Math.max(0, Math.floor(tStart / features.frameDt)));
    const inten = features.macroIntensity[fIdx] || 0.35;

    const gapToNext = nextStart - tStart;
    const isSlow = act < 0.42;
    const releaseBuf = isSlow ? 0.09 : 0.13;
    const usableHold = Math.min(tEnd - tStart, gapToNext - releaseBuf);
    const minHold = isSlow ? 0.46 : 0.56;
    const holdDuration = usableHold >= minHold ? usableHold : 0;

    notes.push({
      id: nextId++,
      type: holdDuration > 0 ? 'hold' : 'tap',
      lane,
      midi,
      time: tStart,
      endTime: tStart + holdDuration,
      duration: holdDuration,
      intensity: inten,
      hit: false,
      missed: false,
      holding: false,
      completed: false,
    });

    // Cross-Hand Chords reserved for genuine climactic ensemble accents (never on quiet/sparse solo cadenzas!)
    const chordConfReq = isSlow ? 0.80 : isDense ? 0.78 : 0.86;
    const chordCooldown = isDense ? 0.65 : 1.25;
    if (
      !(rawMel[i].length > 6 && rawMel[i][6] >= 1) && // score-planned notes never sprout accent chords
      inten >= 0.72 &&
      act >= 0.12 &&
      conf >= chordConfReq &&
      dtPrev >= 0.28 &&
      gapToNext >= 0.18 &&
      tStart - lastChordTime >= chordCooldown
    ) {
      const partnerLane = pickCrossHandPartner(lane, lanes);
      notes.push({
        id: nextId++,
        type: holdDuration > 0 ? 'hold' : 'tap',
        lane: partnerLane,
        midi,
        time: tStart,
        endTime: tStart + holdDuration,
        duration: holdDuration,
        intensity: inten,
        isChordPartner: true,
        hit: false,
        missed: false,
        holding: false,
        completed: false,
      });
      lastChordTime = tStart;
    }

    prev2Lane = prevLane;
    prevLane = lane;
    prev2Midi = prevMidi;
    prevMidi = midi;
    prevDt = dtPrev;
    prevTime = tStart;
  }

  // Add Demucs drum/bass stem impacts -> Percussion-Solo Handoff (F/J) or Spacebar Shockwave Bars
  const minImpStrength = isDense ? 0.42 : 0.58;
  const spaceCooldown = isDense ? 0.38 : 0.62;
  let lastSpace = -10;
  let lastPercSolo = -10;
  let percToggle = 0;

  for (let i = 0; i < features.impacts.length; i++) {
    const [impTime, impStr] = features.impacts[i];
    if (impTime < 0.22 || impTime > duration - 0.35) continue;

    // Check if inside a hold OR inside a pure percussion break (>=1.5s melodic rest)
    let insideHold = false;
    let nearestMelDist = 999;
    for (let j = 0; j < notes.length; j++) {
      const n = notes[j];
      if (n.lane < 0 || n.isPercussionSolo) continue;
      if (n.type === 'hold' && impTime > n.time + 0.06 && impTime < n.endTime - 0.05) {
        insideHold = true;
        break;
      }
      const dist = impTime < n.time ? n.time - impTime : impTime - n.endTime;
      if (dist < nearestMelDist) nearestMelDist = Math.max(0, dist);
    }
    if (insideHold) continue;

    const fIdx = Math.min(features.numFrames - 1, Math.max(0, Math.floor(impTime / features.frameDt)));
    const inten = features.macroIntensity[fIdx] || 0.5;

    // Pure percussion solo groove (e.g. darbuka/clap groove while winds rest): play on inner home-row keys!
    // Isolated lone cannon-shot impacts (no neighbor impact within 1.25s) use the Spacebar Shockwave in +Space modes.
    const prevImpDist = i > 0 ? impTime - features.impacts[i - 1][0] : 999;
    const nextImpDist = i + 1 < features.impacts.length ? features.impacts[i + 1][0] - impTime : 999;
    const isPercGroove = Math.min(prevImpDist, nextImpDist) <= 1.25;

    if (
      nearestMelDist >= 0.72 &&
      (isPercGroove || !hasSpace) &&
      impStr >= (isDense ? 0.40 : 0.48) &&
      impTime - lastPercSolo >= 0.16
    ) {
      const centerLeft = Math.max(0, Math.floor(lanes / 2) - 1);
      const centerRight = Math.min(lanes - 1, Math.floor(lanes / 2));
      const soloLane = percToggle++ % 2 === 0 ? centerLeft : centerRight;
      notes.push({
        id: nextId++,
        type: 'tap',
        lane: soloLane,
        midi: 60,
        isPercussionSolo: true,
        time: impTime,
        endTime: impTime,
        duration: 0,
        intensity: inten,
        hit: false,
        missed: false,
        holding: false,
        completed: false,
      });
      lastPercSolo = impTime;
      continue;
    }

    if (impStr < minImpStrength || impTime - lastSpace < spaceCooldown) continue;

    if (hasSpace) {
      let aligned = impTime;
      for (let j = 0; j < notes.length; j++) {
        if (Math.abs(notes[j].time - impTime) <= 0.042) {
          aligned = notes[j].time;
          break;
        }
      }
      notes.push({
        id: nextId++,
        type: 'space',
        lane: -1,
        time: aligned,
        endTime: aligned,
        duration: 0,
        intensity: inten,
        hit: false,
        missed: false,
        holding: false,
        completed: false,
      });
      lastSpace = aligned;
    }
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  return { mode, density, notes };
}

/**
 * Segments notes directly along the Viterbi Predominant Melody Stream P*(t):
 *   - Automatically delegates to Neural ML Sidecar data when present!
 *   - Otherwise uses in-browser Viterbi melody stream + percussion fallback.
 */
export function buildChart(features, { keyMode = '6k-space', density = 'fewer' } = {}) {
  if (features.isNeuralSidecar) {
    return buildChartFromSidecar(features, { keyMode, density });
  }
  const mode = KEY_MODES[keyMode] || KEY_MODES['6k-space'];
  const lanes = mode.lanes;
  const hasSpace = mode.hasSpace;
  const isDense = density === 'more';

  const {
    duration,
    numFrames,
    frameDt,
    windowCenterSec,
    noiseGateRms,
    globalStreamAtkRef,
    rms,
    coreAttack,
    impactFlux,
    unpitchedFlux,
    harmonicFlux,
    melodyPitch,
    streamAmp,
    pitchNoveltyRatio,
    streamAttack,
    macroIntensity,
    activityCurve,
  } = features;

  // Minimum stability frames for a new pitch (4 frames = 46ms on More, 5 frames = 58ms on Fewer)
  const minStableFrames = isDense ? 4 : 5;

  // 1. Segment Melodic Note Events Along melodyPitch[f]
  const melEvents = [];
  let activePitch = -1;
  let lastNoteFrame = -50;
  let peakAmpInNote = 0;
  let minAmpSincePeak = 1e9;
  let unvoicedFrames = 0;

  for (let f = 5; f < numFrames - 8; f++) {
    const t = f * frameDt + windowCenterSec;
    if (t < 0.20 || t > duration - 0.40) continue;

    if (rms[f] < noiseGateRms) {
      activePitch = -1;
      unvoicedFrames++;
      continue;
    }

    const p = melodyPitch[f];
    const act = activityCurve[f];
    const isSlow = act < 0.42;
    const fastFewerGap = act >= 0.72 ? 0.095 : 0.142;
    const minGapSec = isSlow ? (isDense ? 0.34 : 0.52) : isDense ? 0.082 : fastFewerGap;
    const minGapFrames = Math.ceil(minGapSec / frameDt);

    if (p < 0) {
      activePitch = -1;
      unvoicedFrames++;

      // Percussion-solo fallback ONLY when pitched melody has genuinely rested for >= 0.40s (35 frames)
      if (unvoicedFrames >= 35 && f - lastNoteFrame >= minGapFrames) {
        const uVal = unpitchedFlux[f];
        if (
          uVal >= (isDense ? 0.36 : 0.48) &&
          uVal > unpitchedFlux[f - 1] &&
          uVal >= unpitchedFlux[f + 1]
        ) {
          melEvents.push({
            frame: f,
            endFrame: f + 6,
            time: t,
            pitch: 24, // neutral center register for unpitched percussion
            isPercussionFallback: true,
            strength: uVal * 2.5,
            intensity: macroIntensity[f],
            activity: act,
          });
          lastNoteFrame = f;
        }
      }
      continue;
    }

    unvoicedFrames = 0;
    const sAmp = streamAmp[f];
    if (sAmp > peakAmpInNote) {
      peakAmpInNote = sAmp;
      minAmpSincePeak = sAmp;
    } else if (sAmp < minAmpSincePeak) {
      minAmpSincePeak = sAmp;
    }

    // Check stable pitch dwell ahead so 1-2 frame vibrato transitions don't false-trigger
    let isStableNewPitch = p !== activePitch;
    if (isStableNewPitch) {
      for (let k = 1; k < minStableFrames; k++) {
        if (melodyPitch[f + k] !== p) {
          isStableNewPitch = false;
          break;
        }
      }
    }

    let spawnReason = null;
    let eventStrength = 1.0;

    if (isStableNewPitch) {
      // Sustained Chord-Tone Guard:
      // If Viterbi jumps >= 5 semitones (e.g. E4 <-> B4 fifth or octave inside a held open-fifth chord!)
      // while that target pitch was ALREADY ringing 120ms ago (pitchNoveltyRatio < 1.55) AND neither
      // overall harmony shifted (harmonicFlux < 0.13) NOR loudness re-attacked (coreAttack < 0.11),
      // recognize it as an internal chord-balance shift on the SAME held note rather than a new note!
      const dpAbs = activePitch >= 0 ? Math.abs(p - activePitch) : 99;
      const isInternalChordBalanceFlip =
        activePitch >= 0 &&
        dpAbs >= 5 &&
        pitchNoveltyRatio[f] < 1.55 &&
        harmonicFlux[f] < 0.135 &&
        coreAttack[f] < 0.115;

      if (isInternalChordBalanceFlip) {
        activePitch = p;
      } else if (f - lastNoteFrame >= minGapFrames) {
        spawnReason = activePitch < 0 ? 'entrance' : 'pitch_step';
        eventStrength = 1.2 + streamAttack[f] * 2.0 + coreAttack[f] * 2.0;
      }
    } else if (p === activePitch && f - lastNoteFrame >= Math.max(minGapFrames, 9)) {
      // Same-Pitch Melodic Re-Articulation (e.g., repeated trumpet/horn fanfare notes "G - G - G"!)
      // Requires BOTH an articulation valley on THIS melody pitch AND a sharp re-tongue peak!
      const hadArticulationDip = minAmpSincePeak < peakAmpInNote * (isSlow ? 0.58 : 0.72);
      const sAtk = streamAttack[f];
      const tongueThresh = Math.max(
        isSlow ? 0.30 : isDense ? 0.19 : 0.25,
        globalStreamAtkRef * (isSlow ? 1.35 : isDense ? 0.90 : 1.15)
      );

      if (
        hadArticulationDip &&
        sAtk >= tongueThresh &&
        sAtk > streamAttack[f - 1] &&
        sAtk >= streamAttack[f + 1] &&
        (coreAttack[f] >= 0.08 || coreAttack[f - 1] >= 0.08 || sAtk >= tongueThresh * 1.45)
      ) {
        spawnReason = 're_tongue';
        eventStrength = sAtk / tongueThresh + coreAttack[f] * 1.5;
      }
    }

    if (spawnReason) {
      // Close previous melodic note's sustain frame right before this new note!
      if (melEvents.length > 0) {
        melEvents[melEvents.length - 1].endFrame = Math.min(melEvents[melEvents.length - 1].endFrame, f - 2);
      }

      // Micro-snap onset frame within [f-1 .. f+2] to the sharpest transient moment
      let bestF = f;
      let bestSnapScore = streamAttack[f] + coreAttack[f];
      for (let df = -1; df <= 2; df++) {
        const cf = f + df;
        if (cf > lastNoteFrame + 4 && cf < numFrames - 4) {
          const sc = streamAttack[cf] + coreAttack[cf];
          if (sc > bestSnapScore * 1.15) {
            bestSnapScore = sc;
            bestF = cf;
          }
        }
      }

      melEvents.push({
        frame: bestF,
        endFrame: numFrames - 4, // trimmed below when melody rests or next note starts!
        time: bestF * frameDt + windowCenterSec,
        pitch: p,
        reason: spawnReason,
        strength: eventStrength,
        intensity: macroIntensity[bestF],
        activity: act,
      });

      activePitch = p;
      lastNoteFrame = bestF;
      peakAmpInNote = sAmp;
      minAmpSincePeak = sAmp;
    }
  }

  // Trim each melodic note's actual sustained endFrame when the melody rests or fades out!
  for (let i = 0; i < melEvents.length; i++) {
    const ev = melEvents[i];
    if (ev.isPercussionFallback) continue;
    const maxEnd = Math.min(ev.endFrame, ev.frame + Math.floor(5.2 / frameDt));
    const startStreamAmp = Math.max(
      streamAmp[ev.frame] || 0,
      streamAmp[Math.min(numFrames - 1, ev.frame + 2)] || 0
    );
    const ampFloor = startStreamAmp * (ev.activity < 0.45 ? 0.14 : 0.22);

    let lastAlive = ev.frame;
    let dropFrames = 0;
    for (let f = ev.frame + 1; f <= maxEnd; f++) {
      const p = melodyPitch[f];
      const dpHold = p >= 0 ? Math.abs(p - ev.pitch) : 99;
      // Allow hold to stay alive even if Viterbi shifts smoothly to an internal fifth/octave of the same held chord
      const sameChordSustain =
        p >= 0 && (dpHold <= 1 || dpHold === 7 || dpHold === 12);
      if (!sameChordSustain || rms[f] < noiseGateRms || streamAmp[f] < ampFloor) {
        dropFrames++;
        if (dropFrames > 4) break;
      } else {
        dropFrames = 0;
        lastAlive = f;
      }
    }
    ev.endFrame = lastAlive;
  }

  // 2. Map Melodic Phrase Contour to Ergonomic Finger Lanes, True Melody Holds & Chords
  // Compute rolling phrase pitch range (±4.0s of MELODY pitches!) so lanes mirror the real score!
  const notes = [];
  let prevLane = Math.floor(lanes / 2);
  let sameLaneStreak = 0;
  let prevPitch = melEvents.length ? melEvents[0].pitch : 24;
  let prevTime = -10;
  let nextId = 1;

  for (let i = 0; i < melEvents.length; i++) {
    const cur = melEvents[i];
    const next = melEvents[i + 1];

    // Local melodic phrase pitch range (±10 melody notes / ±4.5s)
    const winPitches = [];
    for (let j = Math.max(0, i - 10); j <= Math.min(melEvents.length - 1, i + 10); j++) {
      if (Math.abs(melEvents[j].time - cur.time) <= 4.5 && !melEvents[j].isPercussionFallback) {
        winPitches.push(melEvents[j].pitch);
      }
    }
    let pMin = cur.pitch - 5;
    let pMax = cur.pitch + 5;
    if (winPitches.length >= 3) {
      winPitches.sort((a, b) => a - b);
      pMin = winPitches[0];
      pMax = winPitches[winPitches.length - 1];
    }
    const pSpan = Math.max(5.0, pMax - pMin);
    const pNorm = Math.max(0, Math.min(1, (cur.pitch - pMin) / pSpan));

    const dtPrev = cur.time - prevTime;
    const dp = cur.pitch - prevPitch; // Exact integer semitone interval on the melody!

    const lane = selectErgonomicLane({
      lanes,
      pNorm,
      dp,
      dtPrev,
      prevLane,
      sameLaneStreak,
    });
    sameLaneStreak = lane === prevLane ? sameLaneStreak + 1 : 1;

    // Exact sustained note duration from the melody stream!
    // Fast sections: notes >= 0.58s (half/whole notes like 0:22.3!) become Hold Ribbons; fast 8th/16ths stay crisp Taps!
    // Slow sections: notes >= 0.34s become flowing Hold Ribbons!
    const rawSustainSec = (cur.endFrame - cur.frame) * frameDt;
    const gapToNext = next ? next.time - cur.time : duration - cur.time;
    const releaseBuffer = cur.activity < 0.45 ? 0.10 : 0.14;
    const usableHold = Math.min(rawSustainSec, gapToNext - releaseBuffer);
    const minHoldReq = cur.activity < 0.45 ? 0.32 : 0.58;
    const holdDuration = usableHold >= minHoldReq ? usableHold : 0;

    notes.push({
      id: nextId++,
      type: holdDuration > 0 ? 'hold' : 'tap',
      lane,
      midi: MELODY_MIDI_MIN + cur.pitch,
      time: cur.time,
      endTime: cur.time + holdDuration,
      duration: holdDuration,
      intensity: cur.intensity,
      hit: false,
      missed: false,
      holding: false,
      completed: false,
    });

    // Cross-Hand Chords on bold, accented melody peaks during loud ensemble passages (max 2 fingers!)
    const chordReq = cur.activity < 0.45 ? 1.55 : isDense ? 1.85 : 2.15;
    if (
      cur.intensity >= 0.54 &&
      cur.strength >= chordReq &&
      dtPrev >= 0.24 &&
      (!next || next.time - cur.time >= 0.15)
    ) {
      const partnerLane = pickCrossHandPartner(lane, lanes);
      notes.push({
        id: nextId++,
        type: holdDuration > 0 ? 'hold' : 'tap',
        lane: partnerLane,
        midi: MELODY_MIDI_MIN + cur.pitch,
        time: cur.time,
        endTime: cur.time + holdDuration,
        duration: holdDuration,
        intensity: cur.intensity,
        isChordPartner: true,
        hit: false,
        missed: false,
        holding: false,
        completed: false,
      });
    }

    prevLane = lane;
    prevPitch = cur.pitch;
    prevTime = cur.time;
  }

  // 3. Impact Channel -> Spacebar Shockwave Bars (major bass-drum / timpani / tutti crashes)
  const impSamples = [];
  for (let f = 4; f < numFrames; f += 4) {
    if (impactFlux[f] > 0.02) impSamples.push(impactFlux[f]);
  }
  impSamples.sort((a, b) => a - b);
  const globalImpP88 = impSamples.length > 20 ? impSamples[Math.floor(impSamples.length * 0.88)] : 0.45;
  const phraseHalf = Math.max(20, Math.round(8.0 / frameDt));
  const impPhraseMean = rollingMean(impactFlux, phraseHalf);

  let lastSpaceTime = -10;
  for (let f = 4; f < numFrames - 4; f++) {
    const t = f * frameDt + windowCenterSec;
    if (t < 0.25 || t > duration - 0.40) continue;
    if (rms[f] < noiseGateRms * 2.0) continue;

    // Never drop a random Spacebar slam in the middle of an active Finger Hold Ribbon!
    let insideActiveHold = false;
    for (let j = 0; j < notes.length; j++) {
      const n = notes[j];
      if (n.type === 'hold' && t > n.time + 0.06 && t < n.endTime - 0.05) {
        insideActiveHold = true;
        break;
      }
    }
    if (insideActiveHold) continue;

    const val = impactFlux[f];
    if (val <= impactFlux[f - 1] || val < impactFlux[f + 1]) continue;
    if (val < impactFlux[f - 2] || val < impactFlux[f + 2]) continue;

    const act = activityCurve[f];
    const inten = macroIntensity[f];

    if (act < 0.42 && inten < 0.58) continue;
    if (inten < 0.36) continue;

    const impFloor = Math.max(
      globalImpP88 * (isDense ? 1.10 : 1.40),
      impPhraseMean[f] * (isDense ? 2.2 : 2.75)
    );
    if (val < impFloor) continue;

    const spaceCooldown = act < 0.42 ? 1.30 : isDense ? 0.42 : 0.68;
    if (t - lastSpaceTime < spaceCooldown) continue;

    if (hasSpace) {
      let alignedTime = t;
      for (let j = 0; j < notes.length; j++) {
        if (Math.abs(notes[j].time - t) <= 0.045) {
          alignedTime = notes[j].time;
          break;
        }
      }
      notes.push({
        id: nextId++,
        type: 'space',
        lane: -1,
        time: alignedTime,
        endTime: alignedTime,
        duration: 0,
        intensity: inten,
        hit: false,
        missed: false,
        holding: false,
        completed: false,
      });
      lastSpaceTime = alignedTime;
    }
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  return {
    mode,
    density,
    notes,
  };
}

function precomputeScalarRunLanes(rawMel, lanes) {
  const minL = lanes === 8 ? 1 : 0;
  const maxL = lanes === 8 ? 6 : lanes - 1;
  const span = maxL - minL + 1;
  const planned = {};

  let i = 0;
  while (i < rawMel.length - 2) {
    let rEnd = i + 1;
    while (
      rEnd < rawMel.length &&
      rawMel[rEnd][0] - rawMel[rEnd - 1][0] < 0.24 &&
      Math.abs(rawMel[rEnd][2] - rawMel[rEnd - 1][2]) <= 4
    ) {
      rEnd++;
    }
    const runLen = rEnd - i;
    const isNeighborTurn =
      runLen === 3 &&
      i > 0 &&
      rawMel[i][0] - rawMel[i - 1][0] >= 0.24 &&
      rawMel[i][0] - rawMel[i - 1][0] < 0.30 &&
      rawMel[i + 1][2] === rawMel[i - 1][2] &&
      (rawMel[i][2] - rawMel[i - 1][2]) * (rawMel[rEnd - 1][2] - rawMel[i][2]) < 0;
    if (runLen >= 3 && !isNeighborTurn) {
      let upSteps = 0;
      let downSteps = 0;
      for (let k = i + 1; k < rEnd; k++) {
        const dp = rawMel[k][2] - rawMel[k - 1][2];
        if (dp > 0) upSteps++;
        else if (dp < 0) downSteps++;
      }
      const netPitch = rawMel[rEnd - 1][2] - rawMel[i][2];

      // Purely/predominantly ascending run (e.g. 3:49 5-note flute climb Bb5-C6-D6-Eb6-F6):
      // Sweep smoothly left-to-right across the keys so it never slams into the right wall as J-K-K-K-K!
      if (upSteps >= runLen - 1 && downSteps === 0 && netPitch >= 2) {
        if (runLen <= span) {
          for (let k = 0; k < runLen; k++) {
            planned[i + k] = maxL - (runLen - 1 - k);
          }
        } else if (runLen === span + 1) {
          // 5-note climb on 4 keys -> F - J - F - J - K, or D - J - F - J - K when landing at the bottom trough of a connected descent!
          const steppedDownIntoStart =
            i > 0 && rawMel[i][0] - rawMel[i - 1][0] < 0.45 && rawMel[i][2] - rawMel[i - 1][2] < 0;
          const pat5Up = [steppedDownIntoStart ? minL : minL + 1, minL + 2, minL + 1, minL + 2, maxL];
          for (let k = 0; k < runLen; k++) {
            planned[i + k] = pat5Up[k];
          }
        } else {
          for (let k = 0; k < runLen; k++) {
            planned[i + k] = minL + (k % span);
          }
        }
      } else if (downSteps >= runLen - 1 && upSteps === 0 && netPitch <= -2) {
        // Purely/predominantly descending run: sweep smoothly right-to-left across the keys!
        if (runLen <= span) {
          for (let k = 0; k < runLen; k++) {
            planned[i + k] = minL + (runLen - 1 - k);
          }
        } else if (runLen === span + 1) {
          // 5-note drop on 4 keys -> J - F - J - F - D, or K - F - J - F - D when landing at the top peak of a connected climb!
          const steppedUpIntoStart =
            i > 0 && rawMel[i][0] - rawMel[i - 1][0] < 0.45 && rawMel[i][2] - rawMel[i - 1][2] > 0;
          const pat5Down = [steppedUpIntoStart ? maxL : maxL - 1, maxL - 2, maxL - 1, maxL - 2, minL];
          for (let k = 0; k < runLen; k++) {
            planned[i + k] = pat5Down[k];
          }
        } else {
          for (let k = 0; k < runLen; k++) {
            planned[i + k] = maxL - (k % span);
          }
        }
      }
      i = rEnd;
    } else {
      i++;
    }
  }
  return planned;
}

function selectErgonomicLane({
  lanes,
  pNorm,
  dp,
  dtPrev,
  upStepsAhead = 0,
  upStepsBehind = 0,
  downStepsAhead = 0,
  downStepsBehind = 0,
  downStepsAfterPeak = 0,
  prevLane,
  prev2Lane = -1,
  isNeighborReturn = false,
  sameLaneStreak = 1,
  isLegatoHoldStep = false,
}) {
  if (lanes === 8) {
    const canUsePinky = dtPrev >= 0.16 && prevLane !== 0 && prevLane !== 7;
    if (canUsePinky && pNorm <= 0.10 && downStepsAhead === 0) return 0;
    if (canUsePinky && pNorm >= 0.90 && upStepsAhead === 0) return 7;

    let inner = 1 + Math.round(Math.max(0, Math.min(1, (pNorm - 0.08) / 0.84)) * 5);
    inner = applyStepAndAntiJackhammer(
      inner,
      dp,
      dtPrev,
      prevLane,
      prev2Lane,
      isNeighborReturn,
      upStepsAhead,
      upStepsBehind,
      downStepsAhead,
      downStepsBehind,
      downStepsAfterPeak,
      sameLaneStreak,
      1,
      6,
      isLegatoHoldStep
    );
    return inner;
  }

  const minL = 0;
  const maxL = lanes - 1;
  const target = Math.round(pNorm * maxL);
  return applyStepAndAntiJackhammer(
    target,
    dp,
    dtPrev,
    prevLane,
    prev2Lane,
    isNeighborReturn,
    upStepsAhead,
    upStepsBehind,
    downStepsAhead,
    downStepsBehind,
    downStepsAfterPeak,
    sameLaneStreak,
    minL,
    maxL,
    isLegatoHoldStep
  );
}

function applyStepAndAntiJackhammer(
  target,
  dp,
  dtPrev,
  prevLane,
  prev2Lane,
  isNeighborReturn,
  upStepsAhead,
  upStepsBehind,
  downStepsAhead,
  downStepsBehind,
  downStepsAfterPeak,
  sameLaneStreak,
  minL,
  maxL,
  isLegatoHoldStep = false
) {
  const spanL = maxL - minL;
  const numKeys = spanL + 1;
  const totalClimbSteps = upStepsBehind + upStepsAhead;
  const totalDropSteps = downStepsBehind + downStepsAhead;

  // Full-hand or 5-note ascending climb (e.g. 4-note DFJK or 5-note FJFJK):
  // Anchor the peak on maxL (K) so 4-note runs sweep D-F-J-K and 5-note runs play F-J-F-J-K!
  if (totalClimbSteps >= spanL) {
    if (totalClimbSteps === spanL) {
      return minL + upStepsBehind;
    }
    if (totalClimbSteps === spanL + 1) {
      if (
        upStepsBehind === 0 &&
        ((dtPrev < 0.45 && (downStepsBehind > 0 || (dp < 0 && prevLane <= minL + 1))) ||
          (dtPrev < 0.32 && prevLane === minL + 1 && dp <= 0))
      ) {
        return minL;
      }
      const pat5Up = [minL + 1, minL + 2, minL + 1, minL + 2, maxL];
      return pat5Up[Math.min(4, upStepsBehind)];
    }
    return minL + (upStepsBehind % numKeys);
  }
  // Full-hand or multi-note descending run (e.g. 4-note KJFD, 5-note JFJFD, or 6+ note KJFDKJ):
  if (totalDropSteps >= spanL && (!isNeighborReturn || downStepsAhead >= 2)) {
    if (totalDropSteps === spanL) {
      if (downStepsAfterPeak === -99) {
        const pat4AfterPeak = [maxL - 1, maxL - 2, maxL - 1, minL];
        return pat4AfterPeak[Math.min(3, downStepsBehind)];
      }
      return maxL - downStepsBehind;
    }
    if (totalDropSteps === spanL + 1) {
      if (
        downStepsBehind === 0 &&
        ((dtPrev < 0.45 && (upStepsBehind > 0 || (dp > 0 && prevLane >= maxL - 1))) ||
          (dtPrev < 0.32 && prevLane === maxL - 1 && dp >= 0))
      ) {
        return maxL;
      }
      const pat5Down = [maxL - 1, maxL - 2, maxL - 1, maxL - 2, minL];
      return pat5Down[Math.min(4, downStepsBehind)];
    }
    return maxL - (downStepsBehind % numKeys);
  }
  let effMinL =
    downStepsAhead > 0 ? minL + Math.min(downStepsAhead, Math.max(1, spanL - 1)) : minL;
  if (
    upStepsAhead === 1 &&
    downStepsAfterPeak >= 2 &&
    (dp >= 0 || Math.abs(dp) >= 5 || dtPrev >= 0.85 || prevLane > maxL - 1)
  ) {
    effMinL = Math.max(effMinL, maxL - 1);
  }
  const effMaxL =
    upStepsAhead > 0 ? maxL - Math.min(upStepsAhead, Math.max(1, spanL - 1)) : maxL;

  let lane = target;
  if (upStepsAhead > 0) {
    lane = Math.min(maxL - Math.min(upStepsAhead, spanL), lane);
  } else if (downStepsAhead > 0) {
    lane = Math.max(minL + Math.min(downStepsAhead, spanL), lane);
  }
  if (isNeighborReturn && prev2Lane >= minL && prev2Lane <= maxL) {
    lane = prev2Lane;
  }
  lane = Math.max(effMinL, Math.min(effMaxL, lane));

  // Strictly honor melodic step direction within the same voice/register (`|dp| < 6`)!
  // (Also across slow legato hold-to-hold steps, e.g. Guthix Pan Flute Eb -> E holds, so they never repeat one key.)
  if ((dtPrev < 1.2 || isLegatoHoldStep) && Math.abs(dp) < 6) {
    if (dp >= 1) {
      if (lane <= prevLane && prevLane < effMaxL) {
        lane = prevLane + 1;
      } else if (prevLane >= effMaxL && dtPrev < 0.55) {
        // Already at ceiling (or reserving upward headroom for peak ahead): reset/wrap inward early so the peak never inverts!
        lane = effMaxL < maxL || dp >= 3 ? minL : Math.max(effMinL, effMaxL - 1);
      }
    } else if (dp <= -1) {
      if (lane >= prevLane && prevLane > effMinL) {
        lane = prevLane - 1;
      } else if (prevLane <= effMinL && dtPrev < 0.55) {
        // Already at floor (or reserving downward headroom for trough ahead): reset/wrap inward early!
        lane = effMinL > minL || dp <= -3 ? maxL : Math.min(effMaxL, effMinL + 1);
      }
    } else if (dp === 0 && dtPrev >= 0.32 && sameLaneStreak < 2) {
      // Repeated melody note at slow pace (>= 320ms) stays on the SAME key (up to 2 times max)
      lane = prevLane;
    }
  }

  // Universal anti-jackhammer guard:
  // 1) Never repeat the same key on fast/8th-note runs (< 320ms)
  // 2) Never repeat the same key more than twice in a row on moderate notes (< 480ms)
  if (lane === prevLane && (dtPrev < 0.32 || (dtPrev < 0.48 && sameLaneStreak >= 2))) {
    const mid = (effMinL + effMaxL) * 0.5;
    if (prevLane >= effMaxL) lane = Math.max(minL, effMaxL - 1);
    else if (prevLane <= effMinL) lane = Math.min(maxL, effMinL + 1);
    else lane = prevLane < mid ? prevLane + 1 : prevLane - 1;
  }
  return Math.max(effMinL, Math.min(effMaxL, lane));
}

function pickCrossHandPartner(primaryLane, lanes) {
  const half = lanes >> 1;
  if (primaryLane < half) {
    const mirrored = lanes - 1 - primaryLane;
    if (lanes === 8 && mirrored === 7 && primaryLane !== 0) return 6;
    return mirrored;
  } else {
    const mirrored = lanes - 1 - primaryLane;
    if (lanes === 8 && mirrored === 0 && primaryLane !== 7) return 1;
    return mirrored;
  }
}

function rollingMean(arr, halfWin) {
  const n = arr.length;
  const out = new Float32Array(n);
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < Math.min(n, halfWin); i++) {
    sum += arr[i];
    cnt++;
  }
  for (let i = 0; i < n; i++) {
    if (i + halfWin < n) {
      sum += arr[i + halfWin];
      cnt++;
    }
    if (i - halfWin - 1 >= 0) {
      sum -= arr[i - halfWin - 1];
      cnt--;
    }
    out[i] = sum / Math.max(1, cnt);
  }
  return out;
}

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/* ==========================================================================
   CONCERT AUDIO CONDUCTOR & TACTILE KEYBED SYNTHESIZER
   ========================================================================== */

export class ConcertAudioController {
  constructor() {
    this.ctx = null;
    this.buffer = null;
    this.source = null;
    this.musicGain = null;

    // Cross-origin HTML5 <audio> streaming state (plays remote MP3s without CORS headers)
    this.mediaEl = null;
    this.usingMediaElement = false;
    this.mediaStarted = false;
    this.mediaDuration = 0;
    this._preRollTimer = null;

    // Passive diagnostic telemetry (does not alter sync34 behavior)
    this.diag = {
      pureCtxTime: 0,
      mediaRaw: 0,
      est: 0,
      ctxVsMediaMs: 0,
      spinupMs: 0,
      snapCount: 0,
      lastSnapMs: 0,
      paused: false,
      seeking: false,
    };
    this._playZeroCtxTime = 0;
    this._mediaPlayCalledCtx = 0;
    this._spinupRecorded = false;
    this._mediaStartTarget = 0;
    this._mediaOffsetLocked = false;
    this._mediaInitialOffset = 0;

    this.isPlaying = false;
    this.songOffsetAtStart = 0;
    this.ctxTimeAtStart = 0;
    this.pausedSongTime = 0;

    this.hitsoundVolume = 0.38;
    this.noiseBuffer = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.92;
      this.musicGain.connect(this.ctx.destination);
      this.noiseBuffer = this._createWoodNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  _createWoodNoiseBuffer() {
    const len = Math.floor(this.ctx.sampleRate * 0.025);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.exp(-i / (len * 0.22));
      data[i] = (Math.random() * 2 - 1) * env;
    }
    return buf;
  }

  async decodeAudio(arrayBuffer) {
    const ctx = this.ensureContext();
    const copy = arrayBuffer.slice(0);
    this.buffer = await ctx.decodeAudioData(copy);
    this.usingMediaElement = false;
    return this.buffer;
  }

  /**
   * Streams an external MP3 via a standard HTML5 <audio> element (without crossOrigin),
   * bypassing CORS restrictions when a pre-compiled .cadenza.json chart sidecar is used.
   */
  loadMediaStream(url, fallbackDuration = 0) {
    this.ensureContext();
    this.stopSource();
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.volume = 0.92;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.mediaEl = audio;
        this.buffer = null;
        this.usingMediaElement = true;
        this.mediaDuration =
          Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : fallbackDuration;
        resolve(audio);
      };

      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Unable to stream remote audio from ${url}`));
      };

      const cleanup = () => {
        audio.removeEventListener('canplaythrough', finish);
        audio.removeEventListener('loadeddata', finish);
        audio.removeEventListener('error', onError);
      };

      audio.addEventListener('canplaythrough', finish, { once: true });
      audio.addEventListener('loadeddata', finish, { once: true });
      audio.addEventListener('error', onError, { once: true });
      audio.src = url;
      audio.load();
    });
  }

  activateTrackAudio(trackData) {
    this.stopSource();
    if (trackData.mediaEl) {
      this.mediaEl = trackData.mediaEl;
      this.buffer = null;
      this.usingMediaElement = true;
      this.mediaDuration = trackData.features?.duration || this.mediaEl.duration || 0;
    } else {
      this.buffer = trackData.buffer;
      this.usingMediaElement = false;
    }
  }

  _startMediaAt(offsetSec, preservePreRollClock = false) {
    if (!this.mediaEl) return;
    const maxDur = this.mediaDuration || this.mediaEl.duration || 600;
    const clamped = Math.min(Math.max(0, offsetSec), Math.max(0, maxDur - 0.05));
    this.mediaStarted = true;
    this._mediaStartTarget = clamped;
    this._mediaOffsetLocked = false;
    this._mediaInitialOffset = 0;
    this._mediaPlayCalledCtx = this.ctx ? this.ctx.currentTime : 0;
    this._spinupRecorded = false;
    try {
      if (Math.abs(this.mediaEl.currentTime - clamped) > 0.02) {
        this.mediaEl.currentTime = clamped;
      }
    } catch (_) {
      // Ignore seek before metadata if any
    }
    if (!preservePreRollClock) {
      this.ctxTimeAtStart = this.ctx.currentTime;
      this.songOffsetAtStart = clamped;
    }
    const playPromise = this.mediaEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => console.warn('Remote audio playback blocked or interrupted:', err));
    }
  }

  play(songTime = -1.5) {
    this.ensureContext();
    this.stopSource();

    const now = this.ctx.currentTime;
    this._playZeroCtxTime = now - songTime;
    this._mediaStartTarget = Math.max(0, songTime);
    this._mediaOffsetLocked = false;
    this._mediaInitialOffset = 0;
    this.diag = {
      pureCtxTime: songTime,
      mediaRaw: 0,
      est: songTime,
      ctxVsMediaMs: 0,
      spinupMs: 0,
      snapCount: 0,
      lastSnapMs: 0,
      paused: false,
      seeking: false,
    };

    if (this.usingMediaElement && this.mediaEl) {
      this.ctxTimeAtStart = now;
      this.songOffsetAtStart = songTime;
      this.isPlaying = true;

      if (songTime < 0) {
        this.mediaStarted = false;
        try {
          this.mediaEl.currentTime = 0;
        } catch (_) {
          // Ignore
        }
        const delayMs = Math.max(0, -songTime * 1000);
        this._preRollTimer = setTimeout(() => {
          this._preRollTimer = null;
          if (this.isPlaying && this.usingMediaElement && !this.mediaStarted) {
            this._startMediaAt(0, true);
          }
        }, delayMs);
      } else {
        this._startMediaAt(songTime, false);
      }
      return;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.musicGain);

    if (songTime < 0) {
      const delaySec = -songTime;
      src.start(now + delaySec, 0);
    } else {
      const clamped = Math.min(Math.max(0, songTime), Math.max(0, this.buffer.duration - 0.05));
      src.start(now, clamped);
      songTime = clamped;
    }

    this.source = src;
    this.ctxTimeAtStart = now;
    this.songOffsetAtStart = songTime;
    this.isPlaying = true;
  }

  pause() {
    if (!this.isPlaying) return;
    this.pausedSongTime = this.getSongTime();
    this.stopSource();
    this.isPlaying = false;
  }

  resume() {
    if (this.isPlaying) return;
    this.play(this.pausedSongTime);
  }

  seek(targetTime) {
    const wasPlaying = this.isPlaying;
    this.pausedSongTime = targetTime;
    if (wasPlaying) {
      this.play(targetTime);
    } else if (this.usingMediaElement && this.mediaEl) {
      try {
        this.mediaEl.currentTime = Math.max(0, targetTime);
      } catch (_) {
        // Ignore
      }
    }
  }

  stopSource() {
    if (this._preRollTimer) {
      clearTimeout(this._preRollTimer);
      this._preRollTimer = null;
    }
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
        this.source.disconnect();
      } catch (_) {
        // Ignore already-stopped nodes
      }
      this.source = null;
    }
    if (this.mediaEl) {
      try {
        this.mediaEl.pause();
      } catch (_) {
        // Ignore
      }
    }
    this.mediaStarted = false;
  }

  getSongTime() {
    if (!this.ctx) return 0;
    if (!this.isPlaying) return this.pausedSongTime;

    const now = this.ctx.currentTime;
    const pureCtxTime = now - this._playZeroCtxTime;
    let est = this.songOffsetAtStart + (now - this.ctxTimeAtStart);

    if (this.usingMediaElement && this.mediaEl) {
      if (!this.mediaStarted) {
        if (est >= 0) {
          this._startMediaAt(0, true);
          return est;
        }
        this.diag.pureCtxTime = pureCtxTime;
        this.diag.est = est;
        return est;
      }
      const raw = this.mediaEl.currentTime || 0;
      if (!this._mediaOffsetLocked) {
        if (!this.mediaEl.paused && !this.mediaEl.seeking && raw >= this._mediaStartTarget + 0.05) {
          this._mediaOffsetLocked = true;
          this._mediaInitialOffset = raw - est;
          this._spinupRecorded = true;
          this.diag.spinupMs = Math.round(-this._mediaInitialOffset * 1000);
        } else {
          this.diag.pureCtxTime = pureCtxTime;
          this.diag.mediaRaw = raw;
          this.diag.est = est;
          this.diag.ctxVsMediaMs = Math.round((raw - pureCtxTime) * 1000);
          this.diag.paused = Boolean(this.mediaEl.paused);
          this.diag.seeking = Boolean(this.mediaEl.seeking);
          return est;
        }
      }
      const alignedRaw = raw - this._mediaInitialOffset;
      if ((this.mediaEl.paused || this.mediaEl.seeking) && !this.mediaEl.ended) {
        this.songOffsetAtStart = alignedRaw;
        this.ctxTimeAtStart = now;
        this.diag.pureCtxTime = pureCtxTime;
        this.diag.mediaRaw = raw;
        this.diag.est = alignedRaw;
        this.diag.ctxVsMediaMs = Math.round((alignedRaw - pureCtxTime) * 1000);
        this.diag.paused = Boolean(this.mediaEl.paused);
        this.diag.seeking = Boolean(this.mediaEl.seeking);
        return alignedRaw;
      }
      if (!this.mediaEl.ended) {
        const drift = alignedRaw - est;
        if (Math.abs(drift) > 0.045) {
          this.diag.snapCount++;
          this.diag.lastSnapMs = Math.round(drift * 1000);
          this.songOffsetAtStart = alignedRaw;
          this.ctxTimeAtStart = now;
          est = alignedRaw;
        } else if (Math.abs(drift) > 0.003) {
          this.songOffsetAtStart += drift * 0.15;
          est = this.songOffsetAtStart + (now - this.ctxTimeAtStart);
        }
      }
      this.diag.pureCtxTime = pureCtxTime;
      this.diag.mediaRaw = raw;
      this.diag.est = est;
      this.diag.ctxVsMediaMs = Math.round((alignedRaw - pureCtxTime) * 1000);
      this.diag.paused = Boolean(this.mediaEl.paused);
      this.diag.seeking = Boolean(this.mediaEl.seeking);
      return est;
    }

    return est;
  }

  playHitSound({ isSpace = false, lane = 0, totalLanes = 6, intensity = 0.5 }) {
    if (!this.ctx || this.hitsoundVolume <= 0.005) return;

    const now = this.ctx.currentTime;
    const dynamicScale = 0.45 + 0.55 * Math.max(0, Math.min(1, intensity));
    const gainLevel = this.hitsoundVolume * dynamicScale;

    if (isSpace) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(118, now);
      osc.frequency.exponentialRampToValueAtTime(41, now + 0.068);

      gain.gain.setValueAtTime(gainLevel * 0.52, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } else {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      const bodyFreq = 235 + (lane / Math.max(1, totalLanes - 1)) * 45;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(bodyFreq, now);
      osc.frequency.exponentialRampToValueAtTime(78, now + 0.022);

      oscGain.gain.setValueAtTime(gainLevel * 0.28, now);
      oscGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.026);

      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);

      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1050;
        filter.Q.value = 1.8;

        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(gainLevel * 0.24, now);
        nGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.018);

        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(this.ctx.destination);
        noise.start(now);
      }
    }
  }

  /**
   * Schedules a sample-accurate orchestral woodblock click at exact AudioContext timestamp `when`
   * for hardware latency calibration.
   */
  scheduleCalibrationClick(when, isAccent = false) {
    this.ensureContext();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const pitch = isAccent ? 1140 : 860;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, when);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.52, when + 0.028);

    gain.gain.setValueAtTime(isAccent ? 0.42 : 0.30, when);
    gain.gain.exponentialRampToValueAtTime(0.0008, when + 0.036);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(when);
    osc.stop(when + 0.042);

    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = isAccent ? 1850 : 1400;
      filter.Q.value = 3.2;

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(isAccent ? 0.25 : 0.17, when);
      nGain.gain.exponentialRampToValueAtTime(0.0008, when + 0.016);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.ctx.destination);
      noise.start(when);
    }
  }
}
