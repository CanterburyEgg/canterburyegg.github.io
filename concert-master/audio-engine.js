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
    codes: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
    labels: ['D', 'F', 'J', 'K'],
    // Ghost keys: S (lane index 4, far left) and L (lane index 5, far right) for quick runs
    ghostCodes: ['KeyS', 'KeyL'],
    ghostLabels: ['S', 'L'],
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
  // (a sidecar's songEnd -- the chart's own song_end correction -- ends the song before trailing silence in the file)
  const fileDur = audioBuffer ? audioBuffer.duration : sidecar.duration;
  const duration = sidecar.songEnd > 0 ? Math.min(fileDur, sidecar.songEnd) : fileDur;
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
    chordNotes: sidecar.chordNotes || [], // score chords entering under a held melody note: [start, end, midi]
    ghostNotes: sidecar.ghostNotes, // false = this song never uses ghost keys (e.g. Sevens, by taste); 'runs' = only in quick runs
    tryRules: sidecar.tryRules || [], // (sandbox previews only: layout rules switched on for a song they don't yet apply to)
    // charted from an exact score (MusicXML): its written rhythm and lines can be trusted note for note (Jupiter)
    exactScore: /\.(mxl|musicxml|xml)$/i.test(sidecar.scoreFile || ''),
    chordHits: sidecar.chordHits || [], // ensemble chord hits on a melody note: [time, chord tone above, chord tone below]
    counterNotes: sidecar.counterNotes || [], // a second line for the other hand (two_hands corrections): [start, end, midi]
    // how strong each melody note's place in the bar is (0 downbeat, 1 beat, 2 half beat, 3 smaller, -1 unknown), for Easy
    beatLevels: Array.isArray(sidecar.beatLevels) && sidecar.beatLevels.length === (sidecar.melodyNotes || []).length ? sidecar.beatLevels : null,
  };
}

/**
 * Easy charts: the melody on the beat. From Hard's melody keep
 *  - every note on a beat or a downbeat (Sevens' opening 75 75 75 75 77-75-73 | 75 75 77-75-73 plays T.T.T.. T.T..);
 *  - half-beat notes only where the music is slow enough (0.45s+ from the kept notes either side);
 *  - a note that starts a phrase (after a rest), and any long note (1s+), wherever it falls;
 * then never two notes closer than 0.3s (the weaker beat goes). Holds shorter than 1s become taps.
 * A score with no bar grid falls back to time alone: a note at most every 0.42s, phrase starts and long notes kept.
 */
const EASY_HOLD_MIN = 1.0;
function selectEasyMelody(rows, levels) {
  const n = rows.length;
  const dur = (i) => rows[i][1] - rows[i][0];
  const phraseStart = (i) => i === 0 || (rows[i][0] - rows[i - 1][1] >= 0.3 && rows[i][0] - rows[i - 1][0] >= 0.5);
  const keep = new Array(n).fill(false);
  const lv = (i) => (levels ? levels[i] : -1);
  let lastT = -9;
  for (let i = 0; i < n; i++) {
    const l = lv(i);
    if (l === 0 || l === 1 || dur(i) >= EASY_HOLD_MIN || phraseStart(i)) keep[i] = true;
    else if (l < 0 && rows[i][0] - lastT >= 0.42) keep[i] = true; // (no grid here: by time)
    if (keep[i]) lastT = rows[i][0];
  }
  // half-beat notes where it's slow enough
  for (let i = 0; i < n; i++) {
    if (keep[i] || lv(i) !== 2) continue;
    let p = i - 1;
    while (p >= 0 && !keep[p]) p--;
    let q = i + 1;
    while (q < n && !keep[q]) q++;
    if ((p < 0 || rows[i][0] - rows[p][0] >= 0.45) && (q >= n || rows[q][0] - rows[i][0] >= 0.45)) keep[i] = true;
  }
  // a flourish -- 4+ quick notes one way (each under 0.15s apart) that lands, with 0.3s+ before the next note or a long
  // last note -- is played as its landing, not its start (Arabesque 2:25: D82 F84 J85 K87 -> the K87). A short turn
  // that carries straight on (Sevens' 77-75-73 into the next 75) keeps its first note.
  for (let a = 0; a + 3 < n; ) {
    const dir = Math.sign(rows[a + 1][2] - rows[a][2]);
    let b = a;
    while (b + 1 < n && rows[b + 1][0] - rows[b][0] < 0.15 && dir && Math.sign(rows[b + 1][2] - rows[b][2]) === dir) b++;
    const lands = b + 1 >= n || rows[b + 1][0] - rows[b][0] >= 0.3 || dur(b) >= 0.3;
    if (b - a >= 3 && lands) {
      for (let j = a; j < b; j++) keep[j] = false;
      keep[b] = true;
      a = b + 1;
    } else a++;
  }
  // no two notes closer than 0.3s: the weaker place in the bar goes (a long note or phrase start counts as a beat)
  const strength = (i) => (dur(i) >= EASY_HOLD_MIN || phraseStart(i) ? Math.min(1, Math.max(0, lv(i))) : lv(i) < 0 ? 2 : lv(i));
  let prev = -1;
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    if (prev >= 0 && rows[i][0] - rows[prev][0] < 0.3) {
      if (strength(i) < strength(prev)) {
        keep[prev] = false;
        prev = i;
      } else keep[i] = false;
      continue;
    }
    prev = i;
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    const r = rows[i].slice();
    if (r[1] - r[0] < EASY_HOLD_MIN) r[1] = r[0] + Math.min(r[1] - r[0], 0.3); // (a short hold is a tap on Easy)
    out.push(r);
  }
  return out;
}

// One rule set for every chart (the per-song rule versions v2-v5 were folded together in the Nov 2026 reconciliation
// audit; a sidecar's rulesVersion field is ignored).

function buildChartFromSidecar(features, { keyMode = '4k', density = 'fewer' } = {}) {
  const mode = KEY_MODES[keyMode] || KEY_MODES['4k'];
  const lanes = mode.lanes;
  const isDense = density === 'more';
  const duration = features.duration;

  // Filter neural melody notes by tier (tier 1 = core melody; tier 2 = fast 16th runs/ornaments)
  // (Easy: the melody on the beat -- selectEasyMelody)
  const rawMel = isDense ? features.melodyNotes.filter((n) => n[4] <= 2) : selectEasyMelody(features.melodyNotes, features.beatLevels);

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
  let lastPercTap = -10;

  for (let i = 0; i < rawMel.length; i++) {
    const [tStart, tEnd, midi, conf, _tier, act] = rawMel[i];
    // (a note right on the song's first beat counts: play() starts 1.5s early, so there's time to see it coming)
    if (tStart < 0 || tStart > duration - 0.35) continue;
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
      downStepsBehind + downStepsAhead === (lanes - 1) &&
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
      const minL = 0;
      const maxL = lanes - 1;
      if (lane === minL + 1 && dp <= 0) lane = minL;
      else if (lane === maxL - 1 && dp >= 0) lane = maxL;
    }
    // A single quick re-strike of the same pitch (16th + 8th "da-DAH", not part of a fast run) stays on the same key
    if (i > 0 && isIsolatedQuickRestrike(rawMel, i, (r) => r[0], (r) => r[2])) {
      lane = prevLane;
    }
    // A repeated pitch parked on the edge key, with the line still climbing (or falling) 2+ steps after it, resets
    // inward ON the repeat so the climb reads cleanly (e.g. Sevens 2:53: 53 53 56 60 = K F J K, not K K D K)
    let edgeReset = false;
    {
      const minE = 0;
      const maxE = lanes - 1;
      if (i > 0 && dp === 0 && dtPrev >= 0.32 && plannedRunLanes[i] === undefined) {
        if (prevLane === maxE && upStepsAhead >= 2) {
          lane = Math.max(minE, maxE - upStepsAhead);
          edgeReset = true;
        } else if (prevLane === minE && downStepsAhead >= 2) {
          lane = Math.min(maxE, minE + downStepsAhead);
          edgeReset = true;
        }
      }
    }
    // Score-tagged percussion taps (7th field === 1, e.g. Guthix intro Drum Set 1) rock across the inner home-row keys
    if (rawMel[i].length > 6 && rawMel[i][6] === 1) {
      const centerLeft = Math.max(0, Math.floor(lanes / 2) - 1);
      const centerRight = Math.min(lanes - 1, Math.floor(lanes / 2));
      lane = midi % 2 === 0 ? centerLeft : centerRight;
      // (the hits are one sound, so they stay on one key; only a quick second hit (a flam / pickup within
      // 0.2s) takes the other: Guthix intro F F F F, 0:39 F - F J)
      lane = tStart - lastPercTap < 0.2 ? centerRight : centerLeft;
      lastPercTap = tStart;
    }
    let unpinnedLane = null; // what the chart would have picked without a pin
    // Score-planned lane hints (7th field 10..13 = D/F/J/K on the 4-key home row, centered on wider layouts)
    if (rawMel[i].length > 6 && rawMel[i][6] >= 10 && rawMel[i][6] <= 33 && rawMel[i][6] % 10 <= 3) {
      // 10..13 = pinned D/F/J/K (copied to every repeat of the phrase); 20..23 = pinned here only (a one-off);
      // 30..33 = pinned here only, but it is the phrase's usual fingering (repeats may follow it)
      const hint4 = rawMel[i][6] % 10;
      unpinnedLane = lane;
      lane = lanes <= 4 ? Math.min(lanes - 1, hint4) : Math.floor((lanes - 4) / 2) + hint4;
    }

    sameLaneStreak = lane === prevLane ? sameLaneStreak + 1 : 1;

    const fIdx = Math.min(features.numFrames - 1, Math.max(0, Math.floor(tStart / features.frameDt)));
    const inten = features.macroIntensity[fIdx] || 0.35;

    const gapToNext = nextStart - tStart;
    const isSlow = act < 0.42;
    const releaseBuf = isSlow ? 0.09 : 0.13;
    const usableHold = Math.min(tEnd - tStart, gapToNext - releaseBuf);
    // (a note the score wants held -- 9th field 1: the long notes of a 3+1 pattern -- holds down to 0.3s; user, Nov 19:
    // "some of the 3+1s have the 3s as holds, and some don't ... ALL of them should probably be held")
    const wantHold = rawMel[i].length > 8 && rawMel[i][8] === 1;
    const minHold = wantHold ? 0.3 : isSlow ? 0.46 : 0.56;
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
      fixedLane: rawMel[i].length > 6 && rawMel[i][6] >= 1, // score-planned lane (hint / percussion tap)
      localHint: rawMel[i].length > 6 && rawMel[i][6] >= 20 && rawMel[i][6] < 30, // one-off pin: never votes
      localPin: rawMel[i].length > 6 && rawMel[i][6] >= 30, // usual-fingering pin: votes, never forces
      partEntry: rawMel[i].length > 7 && rawMel[i][7] === 1, // the lead moves to a new part here (score)
      unpinnedLane,
      edgeReset,
      hit: false,
      missed: false,
      holding: false,
      completed: false,
    });

    // Cross-Hand Chords reserved for genuine climactic ensemble accents (never on quiet/sparse solo cadenzas!)
    // DISABLED (fix C): loudness alone is not a chord. A clear single melody line stays single notes; chords will come
    // back only from real chords in the score. Flip LOUDNESS_CHORDS to restore the old behaviour.
    const LOUDNESS_CHORDS = false;
    const chordConfReq = isSlow ? 0.80 : isDense ? 0.78 : 0.86;
    const chordCooldown = isDense ? 0.65 : 1.25;
    if (
      LOUDNESS_CHORDS &&
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

  applyRepeatedPatternConsistency(notes, lanes, features.exactScore ? 60 : 0);

  // Score chords that enter UNDER a held melody note (e.g. Sevens 3:42: the low brass come in under the trumpets'
  // held A-flat): a second hold on the other hand, starting when they enter and ending with the melody hold.
  for (const [cStart, cEnd, cMidi] of isDense ? features.chordNotes || [] : []) { // (no chords on Easy)
    const host = notes.find((n) => !n.isChordPartner && n.type === 'hold' && n.time <= cStart && n.endTime > cStart + 0.3);
    if (!host) continue;
    const below = cMidi < host.midi;
    const lane = below ? (host.lane >= lanes / 2 ? 0 : Math.max(0, host.lane - 1)) : host.lane < lanes / 2 ? lanes - 1 : Math.min(lanes - 1, host.lane + 1);
    if (lane === host.lane) continue;
    const end = Math.min(cEnd, host.endTime);
    notes.push({
      id: nextId++,
      type: 'hold',
      lane,
      midi: cMidi,
      time: cStart,
      endTime: end,
      duration: end - cStart,
      intensity: host.intensity,
      isChordPartner: true,
      isScoreChord: true,
      hit: false,
      missed: false,
      holding: false,
      completed: false,
    });
  }
  notes.sort((a, b) => a.time - b.time);

  // Ghost keys (Hard, 4 keys): a quick run of exactly five different notes gets a fifth key so it never has to jump
  // back mid-run: S D F J K up, L K J F D down (or, continuing straight off a run that just used the end key, the
  // ghost lands on the far end instead, e.g. Ride 1:13 S D F J K J F D S)
  ghostEdgeOK = isDense && features.ghostNotes !== false;
  runLayoutRules(notes, lanes, { isDense, ghosts: isDense && features.ghostNotes !== false, chordHits: features.chordHits || [], exactScore: !!features.exactScore, tryRules: features.tryRules || [], ghostTunes: features.ghostNotes !== 'runs' });
  if (isDense) addCounterLine(notes, features.counterNotes || [], lanes);

  // Add Demucs drum/bass stem impacts -> Percussion-Solo Handoff (F/J)
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
    // A cluster of impacts within 0.4s: only the sharpest real transient becomes a tap (Arabesque 2:26: the hit after the
    // woodwind rip), and a very sharp one may sit a little closer to the melody
    const sharp = features.impacts[i][2] || 0;
    const outshone = features.impacts.some((o, k) => k !== i && Math.abs(o[0] - impTime) < 0.4 && (o[2] || 0) >= 1.5 * sharp && sharp > 0);
    const outshines = features.impacts.some((o, k) => k !== i && Math.abs(o[0] - impTime) < 0.4 && (o[2] || 0) > 0 && sharp >= 1.5 * o[2]);
    const melGap = outshines && sharp >= 3.5 ? 0.5 : 0.72;
    if (
      !outshone &&
      nearestMelDist >= melGap &&
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
    }
  }

  alignChordHoldEnds(notes);
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  return { mode, density, notes };
}

/**
 * Two hands (a call and response from the score, `counterNotes`): the second line goes on the other hand from the lead
 * -- the left hand under a right-hand lead (Mars 1:12: the trumpets' 78 on the right,
 * the euphoniums' 67 on the left, each held while the other answers). On that hand its higher note takes the inner key
 * (F, or J on the right), a lower one the outer (D / K). Hard only.
 */
function addCounterLine(notes, counter, lanes) {
  if (!counter.length || lanes !== 4) return;
  const prim = notes.filter((n) => !n.isChordPartner && n.lane >= 0 && n.lane < lanes && !n.isPercussionSolo);
  const pitches = [...new Set(counter.map((c) => c[2]))].sort((a, b) => a - b);
  const topP = pitches[pitches.length - 1];
  // (the passage: from the first answer to the last; inside it the lead stays on one hand -- the right, above the
  // counter line; the left, below it -- each pitch on its own key, the highest on the outer key; and the two lines
  // replace the band chords there, two hands being busy enough)
  const c0 = Math.min(...counter.map((c) => c[0])) - 1.0;
  const c1 = Math.max(...counter.map((c) => c[1])) + 0.3;
  const inSpan = prim.filter((n) => n.time >= c0 && n.time <= c1);
  const leadAbove = inSpan.length && inSpan.reduce((a, n) => a + n.midi, 0) / inSpan.length >= pitches.reduce((a, p) => a + p, 0) / pitches.length;
  const lp = [...new Set(inSpan.map((n) => n.midi))].sort((a, b) => a - b);
  for (const n of inSpan) {
    const r = lp.length - 1 - lp.indexOf(n.midi); // 0 = highest
    n.lane = leadAbove ? Math.max(2, 3 - r) : Math.min(1, r === 0 ? 0 : 1);
  }
  for (let i = notes.length - 1; i >= 0; i--) {
    const x = notes[i];
    if (x.isChordPartner && !x.isCounterLine && x.time >= c0 && x.time <= c1) notes.splice(i, 1);
  }
  let id = Math.max(0, ...notes.map((x) => x.id || 0));
  for (const [t0, t1, midi] of counter) {
    const leftHand = leadAbove;
    const lane = leftHand ? (midi === topP ? 1 : 0) : midi === topP ? 2 : 3;
    const dur = t1 - t0;
    notes.push({
      id: ++id,
      type: dur >= 0.45 ? 'hold' : 'tap',
      lane,
      midi,
      time: t0,
      endTime: dur >= 0.45 ? t1 : t0,
      duration: dur >= 0.45 ? dur : 0,
      intensity: (inSpan[0] && inSpan[0].intensity) || 0.5,
      isChordPartner: true,
      isCounterLine: true,
      hit: false,
      missed: false,
      holding: false,
      completed: false,
    });
  }
  notes.sort((a, b) => a.time - b.time);
}

// Chord holds that start together let go together (Arabesque 4:56: F82 + J86 ended 0.11s apart): every hold in the
// chord ends at the earliest end (that one usually stops early so its key can be pressed again), unless another note
// starts between the ends (a voice really moving on while the other holds).
function alignChordHoldEnds(notes) {
  const holds = notes.filter((n) => n.lane >= 0 && n.type === 'hold' && !n.isPercussionSolo).sort((a, b) => a.time - b.time);
  for (let i = 0; i < holds.length; i++) {
    const grp = [holds[i]];
    for (let j = i + 1; j < holds.length && holds[j].time - holds[i].time < 0.03; j++) grp.push(holds[j]);
    if (grp.length < 2) continue;
    const e0 = Math.min(...grp.map((n) => n.endTime));
    const e1 = Math.max(...grp.map((n) => n.endTime));
    if (e1 - e0 < 0.01) continue;
    if (notes.some((n) => n.lane >= 0 && !grp.includes(n) && n.time >= e0 - 0.01 && n.time < e1)) continue;
    for (const n of grp) {
      n.endTime = e0;
      n.duration = e0 - n.time;
    }
    i += grp.length - 1;
  }
}

/**
 * Segments notes directly along the Viterbi Predominant Melody Stream P*(t):
 *   - Automatically delegates to Neural ML Sidecar data when present!
 *   - Otherwise uses in-browser Viterbi melody stream + percussion fallback.
 */
/**
 * A figure stated three or more times in a row plays the same every time: a short figure (3-5 notes, under 1.5s) that
 * comes round 3+ times close together (each within 3s of the last) takes the keys most of its statements have, as long
 * as that doesn't step the wrong way or double up a key with the notes either side. It fixes a statement that a
 * same-note link to the phrase before pulled off the others (Jupiter 0:35.7: the trumpets' 67 71 77 three times = D F J each time, though the clarinets' 67
 * just before sits on F).
 */
function applyRepeatedFigureMajority(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  const used = new Uint8Array(n);
  const clash = (a, b) =>
    b.time - a.time < 0.6 && a.midi !== b.midi &&
    (a.lane === b.lane || (Math.sign(b.lane - a.lane) !== Math.sign(b.midi - a.midi) &&
      !((a.lane === lanes - 1 && b.lane === 0 && b.midi > a.midi) || (a.lane === 0 && b.lane === lanes - 1 && b.midi < a.midi))));
  for (let k = 5; k >= 3; k--) {
    for (let i = 0; i + k <= n; i++) {
      if (used[i]) continue;
      const fig = prim.slice(i, i + k);
      if (fig.some((x, q) => used[i + q] || x.fixedLane || x.localPin || x.ghost || (q && x.time - fig[q - 1].time >= 0.6)) || fig[k - 1].time - fig[0].time >= 1.5) continue;
      if (new Set(fig.map((x) => x.midi)).size < 2) continue;
      const occ = [i];
      for (let j = i + k; j + k <= n; j++) {
        const last = prim[occ[occ.length - 1]];
        if (prim[j].time - last.time > 3) break;
        if (prim.slice(j, j + k).every((x, q) => x.midi === fig[q].midi && !used[j + q] && !x.fixedLane && !x.localPin && !x.ghost)) {
          occ.push(j);
          j += k - 1;
        }
      }
      if (occ.length < 3) continue;
      const lay = (j) => prim.slice(j, j + k).map((x) => x.lane).join(',');
      const votes = {};
      for (const j of occ) votes[lay(j)] = (votes[lay(j)] || 0) + 1;
      const [best, cnt] = Object.entries(votes).sort((x, y) => y[1] - x[1])[0];
      if (cnt * 2 <= occ.length) continue;
      const bl = best.split(',').map(Number);
      for (const j of occ) {
        // (only a statement pulled off the others by a same-note link to the note just before it: that note has the
        // statement's first pitch, within 0.6s, on the key the statement starts on)
        const pv = j > 0 ? prim[j - 1] : null;
        // ...and the statement is a new part coming in, not the same line carrying on (Arabesque 2:55's 60 | 60 61 60 58)
        const pulled = pv && pv.midi === prim[j].midi && prim[j].time - pv.time < 0.6 && pv.lane === prim[j].lane && prim[j].partEntry;
        if (lay(j) !== best && pulled) {
          const saved = prim.slice(j, j + k).map((x) => x.lane);
          prim.slice(j, j + k).forEach((x, q) => (x.lane = bl[q]));
          const before = j > 0 ? prim[j - 1] : null;
          const after = j + k < n ? prim[j + k] : null;
          if ((before && clash(before, prim[j])) || (after && clash(prim[j + k - 1], after))) prim.slice(j, j + k).forEach((x, q) => (x.lane = saved[q]));
        }
        for (let q = 0; q < k; q++) used[j + q] = 1;
      }
    }
  }
}

/**
 * Back-to-back repeat: a 3-5-note figure played twice in a row, same pitches and rhythm (Jupiter 0:50.4 / 0:51.3, the
 * theme's 71 74 76 twice), plays on the same keys both times -- the second statement copies the first, unless that
 * would step the wrong way or share a key with a different pitch next to it.
 */
function applyBackToBackRepeat(notes, lanes) {
  // (ghost-key notes stay in the list, so a figure with a ghost note between its statements isn't back-to-back: Ride
  // 1:20.3's 69 68 66 S63 69 68 66 run)
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  const n = prim.length;
  const clash = (a, b) =>
    b.time - a.time < 0.6 && a.midi !== b.midi &&
    (a.lane === b.lane || (Math.sign(b.lane - a.lane) !== Math.sign(b.midi - a.midi) &&
      !((a.lane === lanes - 1 && b.lane === 0 && b.midi > a.midi) || (a.lane === 0 && b.lane === lanes - 1 && b.midi < a.midi))));
  const bad = (x) => x.fixedLane || x.localPin || x.ghost || x.altRun || x.lane >= lanes;
  for (let k = 5; k >= 3; k--) {
    for (let i = 0; i + 2 * k <= n; i++) {
      const A = prim.slice(i, i + k);
      const B = prim.slice(i + k, i + 2 * k);
      if (A.concat(B).some(bad) || new Set(A.map((x) => x.midi)).size < k) continue;
      if (!B.every((x, q) => x.midi === A[q].midi)) continue;
      if (A[k - 1].time - A[0].time >= 1.5 || A.some((x, q) => q && x.time - A[q - 1].time >= 0.6)) continue;
      const span = A[k - 1].time - A[0].time;
      const rhythm = A.slice(1).every((x, q) => Math.abs((x.time - A[q].time) - (B[q + 1].time - B[q].time)) <= 0.3 * (x.time - A[q].time) + 0.03);
      if (!rhythm || B[0].time - A[k - 1].time > Math.max(0.8, span)) continue;
      if (B.every((x, q) => x.lane === A[q].lane)) continue;
      const saved = B.map((x) => x.lane);
      B.forEach((x, q) => (x.lane = A[q].lane));
      const before = prim[i + k - 1];
      const after = i + 2 * k < n ? prim[i + 2 * k] : null;
      if (clash(before, B[0]) || (after && clash(B[k - 1], after))) B.forEach((x, q) => (x.lane = saved[q]));
      // (no skip ahead: the next statements check against this one, so a figure played three or more times keeps its
      // keys all the way, even when the cell is counted from a different note: Mercury 0:25's 81 73 76 68 x3; user,
      // Nov 21: "same notes, same keys")
    }
  }
}

/**
 * Key-layout rules, in the order they run (after the first layout and the "same notes, same keys" vote). Each entry:
 * [name, rule(notes, lanes, ctx), when] -- `when` is 'hard' (Hard only) or 'ghosts' (Hard, and the song allows ghost
 * keys); omitted = always. Debug (like the Python passes' CM_SKIP / CM_PASS_TRACE): set globalThis.CM_LAYOUT =
 * { skip: ['name', ...], trace: [lo, hi] } to skip rules by name, or print the keys in [lo, hi] seconds after every rule
 * that changes them.
 */
const LAYOUT_RULES = [
  ['fourNoteWalks', (n, l) => applyFourNoteWalks(n, l)],
  ['walkRepeatClimb', (n, l) => applyWalkRepeatClimb(n, l)],
  ['neighbourTurns', (n, l) => applyNeighbourTurns(n, l)],
  ['edgeRepeatRuns', (n, l) => applyEdgeRepeatRuns(n, l)],
  ['turnLeadIns', (n, l) => applyTurnLeadIns(n, l)],
  ['longRunEdges', (n, l) => applyLongRunEdges(n, l)],
  ['leapPairSplits', (n, l) => applyLeapPairSplits(n, l)],
  ['phraseEndDirections', (n, l) => applyPhraseEndDirections(n, l)],
  ['phrasePlans', (n, l) => applyPhrasePlans(n, l)],
  ['compactFigures', (n, l) => applyCompactFigures(n, l)],
  ['heldLines', (n, l) => applyHeldLines(n, l)],
  ['heldKeyFamilies', (n, l, c) => applyHeldKeyFamilies(n, l, c.isDense ? c.chordHits : [])],
  ['gapShiftDoubles', (n, l) => applyGapShiftDoubles(n, l)],
  ['runSkipClose', (n, l) => applyRunSkipClose(n, l)],
  ['ghostLanes', (n, l) => assignGhostLanes(n, l), 'ghosts'],
  ['halfStepNoLeap', (n, l) => applyHalfStepNoLeap(n, l)],
  ['cleanRunCycles', (n, l) => applyCleanRunCycles(n, l)],
  ['flurryTurns', (n, l) => applyFlurryTurns(n, l), 'ghosts'],
  ['walkOffGhost', (n, l) => applyWalkOffGhost(n, l)],
  ['turnRoomBeyond', (n, l) => applyTurnRoomBeyond(n, l)],
  ['sixNoteRips', (n, l) => applySixNoteRips(n, l), 'ghosts'],
  ['fiveNoteClimbGhost', (n, l) => applyFiveNoteClimbGhost(n, l), 'ghosts'],
  ['repeatedFigureMajority', (n, l) => applyRepeatedFigureMajority(n, l)],
  ['backToBackRepeat', (n, l) => applyBackToBackRepeat(n, l)],
  ['fourPitchPhrases', (n, l) => applyFourPitchPhrases(n, l)],
  ['fivePitchTurnGhost', (n, l, c) => { if (c.ghostTunes) applyFivePitchTurnGhost(n, l); }, 'ghosts'],
  ['entryAboveK', (n, l) => applyEntryAboveK(n, l)],
  ['repeatAltOnlyQuick', (n, l) => applyRepeatAltOnlyQuick(n, l)],
  ['climbFitsKeys', (n, l) => applyClimbFitsKeys(n, l)],
  ['figureGrows', (n, l) => applyFigureGrows(n, l)],
  ['reentryMakesRoom', (n, l) => applyReentryMakesRoom(n, l)],
  ['fourWalkDown', (n, l) => applyFourWalkDown(n, l)],
  ['figureIntoHoldRepeats', (n, l) => applyFigureIntoHoldRepeats(n, l)],
  ['threeNoBacktrack', (n, l) => applyThreeNoBacktrack(n, l)],
  ['linesKeepDirection', (n, l, c) => { if (c.exactScore) applyLinesKeepDirection(n, l, c.ghosts); }],
  ['slowEntryClimbRises', (n, l, c) => { if (c.exactScore) applySlowEntryClimbRises(n, l); }],
  ['quickBurstsLandHome', (n, l, c) => { if (c.exactScore) applyQuickBurstsLandHome(n, l); }],
  ['twoNoteSwingKeys', (n, l, c) => { if (c.exactScore) applyTwoNoteSwingKeys(n, l, c.chordHits); }],
  ['slowRepeatsKeepKey', (n, l, c) => { if (c.exactScore) applySlowRepeatsKeepKey(n, l); }],
  ['noDoubledKeyInSteps', (n, l, c) => { if (c.exactScore) applyNoDoubledKeyInSteps(n, l, c.ghosts && c.ghostTunes); }],
  ['longRunsEndOnEdge', (n, l, c) => { if (c.exactScore) applyLongRunsEndOnEdge(n, l, c.ghosts); }],
  ['runsThatRoll', (n, l, c) => { if (c.exactScore || (c.tryRules || []).includes('runsThatRoll')) applyRunsThatRoll(n, l); }],
  ['steppingThreesAlternate', (n, l, c) => { if (c.exactScore) applySteppingThreesAlternate(n, l); }],
  ['backToBackFourShift', (n, l, c) => { if (c.exactScore) applyBackToBackFourShift(n, l); }],
  ['backAndForthOneKey', (n, l, c) => { if (c.exactScore) applyBackAndForthOneKey(n, l); }],
  ['leapOffEdgeFresh', (n, l, c) => { if (c.exactScore) applyLeapOffEdgeFresh(n, l); }],
  ['figureEchoKeys', (n, l, c) => { if (c.exactScore) applyFigureEchoKeys(n, l); }],
  ['oneKeyPerNoteInFigure', (n, l, c) => { if (c.exactScore) applyOneKeyPerNoteInFigure(n, l); }],
  ['handoffsTakeTurns', (n, l, c) => { if (c.exactScore) applyHandoffsTakeTurns(n, l); }],
  ['tuneStatementsKeepShape', (n, l, c) => { if (c.exactScore) applyTuneStatementsKeepShape(n, l); }],
  ['quickRipsFourKeys', (n, l, c) => { if (c.exactScore && !c.ghosts && c.isDense) applyQuickRipsFourKeys(n, l); }],
  ['easyRoomToClimb', (n, l, c) => { if (!c.isDense) applyEasyRoomToClimb(n, l); }],
  ['ensembleChordHits', (n, l, c) => addEnsembleChordHits(n, c.chordHits, l), 'hard'],
];

function runLayoutRules(notes, lanes, ctx) {
  const opts = (typeof globalThis !== 'undefined' && globalThis.CM_LAYOUT) || {};
  const skip = new Set(opts.skip || []);
  const out = typeof print === 'function' ? print : (...a) => console.log(...a);
  const snap = () =>
    opts.trace
      ? notes.filter((x) => x.time >= opts.trace[0] && x.time <= opts.trace[1] && x.lane >= 0 && !x.isChordPartner)
          .map((x) => 'DFJKSL'[x.lane] + x.midi + (x.type === 'hold' ? 'h' : '')).join(' ')
      : null;
  let last = snap();
  if (opts.trace) out('layout start'.padEnd(26) + last);
  for (const [name, rule, when] of LAYOUT_RULES) {
    if (skip.has(name) || (when === 'hard' && !ctx.isDense) || (when === 'ghosts' && !ctx.ghosts)) continue;
    rule(notes, lanes, ctx);
    if (opts.trace) {
      const s = snap();
      if (s !== last) out(name.padEnd(26) + s);
      last = s;
    }
  }
}

export function buildChart(features, { keyMode = '4k', density = 'fewer' } = {}) {
  if (features.isNeuralSidecar) {
    return buildChartFromSidecar(features, { keyMode, density });
  }
  const mode = KEY_MODES[keyMode] || KEY_MODES['4k'];
  const lanes = mode.lanes;
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


  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  return {
    mode,
    density,
    notes,
  };
}

function precomputeScalarRunLanes(rawMel, lanes) {
  const minL = 0;
  const maxL = lanes - 1;
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

  // Repeated pitch at a playable pace (>= 145ms apart — 8th notes even when attacks jitter ±80ms, e.g. Sevens' opening 8th-note A-flats) is the SAME note in
  // the music, so it stays on the SAME key however many times it repeats. Only genuinely fast repeats (16ths) alternate.
  if (dp === 0 && dtPrev >= 0.145 && dtPrev < 1.2 && prevLane >= minL && prevLane <= maxL) {
    return prevLane;
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

/**
 * PERMANENT CHARTING RULE — "same notes, same keys":
 * When a passage repeats a phrase whose notes are exactly the same (identical pitches in identical rhythm, >= 3 notes,
 * at least 2 different pitches), every occurrence is played with exactly the same key presses.
 * Each repeat is linked note-by-note to its nearest earlier occurrence; every linked note then plays the key most of
 * its occurrences naturally landed on (latest wins ties), so one awkward statement can't spread its fingering to
 * every repeat. Score-planned lanes (hints / percussion taps) always win.
 * Then repeated single pitches are normalised (see normalizeRepeatedPitchRuns) and chord partners re-derived.
 */
function applyRepeatedPatternConsistency(notes, lanes, linkWindow = 0) {
  const MIN_LEN = 3; // shortest phrase treated as a repeat (3 notes: e.g. Sevens 1:09 80-79-77 turn)
  const prim = notes.filter((n) => !n.isChordPartner);
  const n = prim.length;
  if (n < MIN_LEN * 2) return;
  const ioi = (k) => (k + 1 < n ? prim[k + 1].time - prim[k].time : 99);
  // (the v4 "looser swing" match was retired in the one-rule-set audit: the loose links were dragging short fragments
  // of other songs onto the wrong keys. What We Do's 2:50 harp links to its 0:18 statement as an exact repeat.)
  const rhythmMatch = (a, b) => Math.abs(a - b) <= Math.max(0.07, 0.35 * Math.min(a, b));
  // Notes "match" if same pitch and the gap to the following note is rhythmically the same (the phrase's last note only
  // needs the same pitch). The earlier occurrence must END before the repeat starts (no overlapping self-matches).
  const extend = (j, i) => {
    let len = 0;
    while (i + len < n && j + len < i && prim[j + len].midi === prim[i + len].midi) {
      if (len >= 1 && !rhythmMatch(ioi(j + len - 1), ioi(i + len - 1))) break;
      len++;
    }
    // A quick figure of 4+ identical notes is the same figure even if the snapped timing jitters (e.g. Ride 1:28 vs
    // 1:30: 74 75 74 72 at 0.13/0.17/0.15s vs 0.21/0.15/0.23s): all gaps fast, each within 90ms, length within 40%.
    let pl = 0;
    while (i + pl < n && j + pl < i && prim[j + pl].midi === prim[i + pl].midi) pl++;
    if (pl >= 4 && pl > len) {
      let fast = true;
      for (let k = 0; k < pl - 1 && fast; k++) fast = ioi(j + k) < 0.3 && ioi(i + k) < 0.3 && Math.abs(ioi(j + k) - ioi(i + k)) <= 0.09;
      const s1 = prim[j + pl - 1].time - prim[j].time;
      const s2 = prim[i + pl - 1].time - prim[i].time;
      if (fast && s1 > 0 && s2 > 0 && Math.max(s1, s2) / Math.min(s1, s2) <= 1.4) len = pl;
    }
    let distinct = false;
    for (let k = 1; k < len && !distinct; k++) distinct = prim[i + k].midi !== prim[i].midi;
    return distinct ? len : 0;
  };

  applyNeighbourReturnRuns(prim); // so the vote below already sees e.g. Sevens 3:06's runs back on J
  const natural = prim.map((x) => x.lane); // each note's own lane before harmonising
  // Link every repeat note-by-note to its nearest earlier occurrence (union-find equivalence classes)
  const parent = Array.from({ length: n }, (_, k) => k);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  // Link every repeat to its nearest earlier occurrence. A short fragment (3-4 notes) may not glue two different
  // longer repeated figures together: if both copies sit inside figures that already repeat at length (8+ notes),
  // the shared notes are a coincidence between different phrases (What We Do 0:52 flute 2's 79-81-67 vs the intro
  // harp's), so the search keeps looking further back instead.
  const LONG_FIG = 8;
  const findMatches = (reject) => {
    const out = [];
    let i = 1;
    while (i < n) {
      let bestJ = -1;
      let bestLen = 0;
      for (let j = i - 1; j >= 0; j--) {
        // (linkWindow, exact scores: a repeat links only to a statement within the last minute, so a passage's keys
        // can't be moved by something minutes later -- Mars 0:57's approved chords moved when notes changed at 2:30;
        // user, Nov 18. The PDF charts keep their song-wide links as locked)
        if (linkWindow && prim[i].time - prim[j].time > linkWindow) break;
        if (prim[j].midi !== prim[i].midi) continue;
        const len = extend(j, i);
        if (len >= MIN_LEN && !(reject && reject(j, i, len))) {
          bestLen = len;
          bestJ = j;
          break; // nearest earlier occurrence; chains of repeats link transitively
        }
      }
      if (bestLen >= MIN_LEN) {
        out.push([bestJ, i, bestLen]);
        i += bestLen;
      } else {
        i++;
      }
    }
    return out;
  };
  let matches = findMatches(null);
  if (LONG_FIG) {
    const inLong = new Uint8Array(n);
    const fig = Array.from({ length: n }, (_, k) => k); // which long figure each note belongs to
    const ffind = (x) => {
      while (fig[x] !== x) x = fig[x] = fig[fig[x]];
      return x;
    };
    for (const [j, i2, len] of matches) {
      if (len < LONG_FIG) continue;
      for (let k = 0; k < len; k++) {
        inLong[j + k] = inLong[i2 + k] = 1;
        fig[ffind(j + k)] = ffind(j);
        fig[ffind(i2 + k)] = ffind(j);
      }
    }
    const coincidence = (j, i2, len) => {
      if (len >= 5) return false;
      for (let k = 0; k < len; k++) if (!inLong[j + k] || !inLong[i2 + k]) return false;
      return ffind(j) !== ffind(i2);
    };
    if (matches.some(([j, i2, len]) => coincidence(j, i2, len))) matches = findMatches(coincidence);
  }
  for (const [j, i2, len] of matches) for (let k = 0; k < len; k++) union(j + k, i2 + k);

  // Each class plays the key most of its occurrences naturally landed on (latest wins ties); fixed lanes win.
  const classes = new Map();
  for (let k = 0; k < n; k++) {
    const r = find(k);
    if (!classes.has(r)) classes.set(r, []);
    classes.get(r).push(k);
  }
  // Two rounds: after the first vote, neighbour-note returns settle (e.g. 77-75-77 runs back on J), then a re-vote
  // spreads that settled fingering to every linked copy (e.g. Sevens 3:28)
  for (let round = 0; round < 2; round++) {
  if (round === 1) applyNeighbourReturnRuns(prim);
  for (const members of classes.values()) {
    if (members.length < 2) continue;
    // locally pinned notes (sidecar 20..33) keep their own key and never force it on the others
    const fixed = members.find((k) => prim[k].fixedLane && !prim[k].localHint && !prim[k].localPin);
    let lane;
    if (fixed !== undefined) {
      lane = prim[fixed].lane;
    } else {
      const votes = new Map();
      // a one-off pin votes with the key it would have had unpinned, so it doesn't sway the other statements
      const voteLane = (k) => (prim[k].localHint && prim[k].unpinnedLane !== null ? prim[k].unpinnedLane : prim[k].lane);
      for (const k of members) votes.set(voteLane(k), (votes.get(voteLane(k)) || 0) + 1);

      // Ties go to the LATEST occurrence: by then the passage has settled into its fingering (e.g. Sevens 1:29 vs 1:33)
      let best = -1;
      for (const k of members) {
        const v = votes.get(voteLane(k));
        if (v >= best) {
          best = v;
          lane = voteLane(k);
        }
      }
    }
    if (linkWindow && fixed === undefined) {
      // (exact scores: each statement takes the majority of the statements within a minute of it -- chains of repeats
      // can't carry a change from minutes later back to an approved passage)
      const voteLane = (k) => (prim[k].localHint && prim[k].unpinnedLane !== null ? prim[k].unpinnedLane : prim[k].lane);
      const own = members.map((k) => {
        const near = members.filter((m) => Math.abs(prim[m].time - prim[k].time) <= linkWindow);
        const v = new Map();
        for (const m of near) v.set(voteLane(m), (v.get(voteLane(m)) || 0) + 1);
        let best = -1;
        let ln;
        for (const m of near) {
          const c = v.get(voteLane(m));
          if (c >= best) {
            best = c;
            ln = voteLane(m);
          }
        }
        return ln;
      });
      members.forEach((k, q) => {
        if (!prim[k].fixedLane) prim[k].lane = own[q];
      });
      continue;
    }
    for (const k of members) if (!prim[k].fixedLane) prim[k].lane = lane;
  }
  }
  const voted = prim.map((x) => x.lane);

  normalizeRepeatedPitchRuns(prim, lanes);

  // Direction repair: a majority vote can leave a phrase's edge pointing the wrong way against its neighbours
  // ("notes go down, keys go up", or two different pitches on one key). Search for the lane assignment with the
  // fewest such clashes, moving a whole class at a time (so repeats stay identical) or shifting a whole repeated phrase
  // up/down a key (e.g. Sevens 2:07 J J J J F D F D -> K K K K J F J F D so the phrase has room to keep falling).
  const normLanes = prim.map((x) => x.lane);
  repairLaneDirections(prim, notes, lanes, voted, find, matches);
  // ...but the repair never splits a repeated note that plays on one key: if it moved only part of the run, the whole
  // run takes whichever of its keys reads best from the note before and into the note after (a different note on the
  // same key or a wrong-way step costs; a leap of more than a 5th is a fresh start; ties go to the last strike's key):
  // Arabesque 4:19 79 79 79 79 after the low D62 hold = D D D D; 2:20 80, 79 79 79 79, 80 79 77 = F, D D D D, J F D
  const runCost = (a, la, b, lb) => {
    if (!a || !b) return 0;
    const gap = b.time - Math.max(a.time, a.endTime || a.time);
    if (gap >= 0.6 || a.midi === b.midi || Math.abs(b.midi - a.midi) > 7) return 0;
    if (la === lb) return 1.5;
    return Math.sign(lb - la) === Math.sign(b.midi - a.midi) ? 0 : 1;
  };
  for (let s = 0; s < prim.length; ) {
    let e = s;
    while (e + 1 < prim.length && prim[e + 1].midi === prim[s].midi && prim[e + 1].time - prim[e].time < 0.5) e++;
    if (e > s && !prim[s].altRun) {
      const run = prim.slice(s, e + 1);
      const wasOne = run.every((x, j) => normLanes[s + j] === normLanes[s]);
      if (wasOne && run.some((x) => x.lane !== run[0].lane) && !run.some((x) => x.fixedLane)) {
        const before = s > 0 ? prim[s - 1] : null;
        const after = e + 1 < prim.length ? prim[e + 1] : null;
        const opts = [run[run.length - 1].lane, ...run.map((x) => x.lane), normLanes[s]].filter((l, j, arr) => arr.indexOf(l) === j);
        const cost = (l) => runCost(before, before && before.lane, run[0], l) + runCost(run[run.length - 1], l, after, after && after.lane);
        const best = opts.reduce((p, l) => (cost(l) < cost(p) ? l : p), opts[0]);
        run.forEach((x) => (x.lane = best));
      }
    }
    s = e + 1;
  }

  // Back-to-back groups of one repeated pitch split only by short rests (e.g. Sevens 0:18-0:22, three bars of
  // four brass A-flats) are the same note in the music, so they share one key: the key of the LAST group, which is
  // already fitted to the phrase that follows. Skipped if it would break the direction from the note before.
  {
    let s = 0;
    while (s < n) {
      let e = s;
      while (e + 1 < n && prim[e + 1].midi === prim[s].midi && prim[e + 1].time - prim[e].time < 1.0) e++;
      const block = prim.slice(s, e + 1);
      const sameKeyRuns = block.every((x, j) => j === 0 || x.time - block[j - 1].time >= 0.5 || x.lane === block[j - 1].lane);
      if (e > s && sameKeyRuns && !block.some((x) => x.fixedLane)) {
        const target = prim[e].lane;
        const before = s > 0 ? prim[s - 1] : null;
        const dirOk =
          !before ||
          before.midi === prim[s].midi ||
          (prim[s].midi > before.midi ? target > before.lane : target < before.lane);
        if (dirOk) for (const x of block) x.lane = target;
      }
      s = e + 1;
    }
  }

  applyNeighbourReturnRuns(prim);

  // Keep chord partners on the opposite hand of their (possibly re-laned) primary note
  for (let k = 0; k < notes.length; k++) {
    const p = notes[k];
    if (!p.isChordPartner) continue;
    const primary = notes.slice(Math.max(0, k - 2), k).reverse().find((q) => !q.isChordPartner && q.time === p.time);
    if (primary) p.lane = pickCrossHandPartner(primary.lane, lanes);
  }
  // An accent chord partner sitting on the key the previous or next melody note uses makes a different pitch look
  // like a repeat (e.g. Sevens 0:31 F, then an F+J chord on the next note up): drop that partner.
  for (let k = notes.length - 1; k >= 0; k--) {
    const p = notes[k];
    if (!p.isChordPartner) continue;
    const primary = notes.slice(Math.max(0, k - 2), k).reverse().find((q) => !q.isChordPartner && q.time === p.time);
    const next = notes.slice(k + 1).find((q) => !q.isChordPartner);
    if (!primary) continue;
    const pi = notes.indexOf(primary);
    let prevP = null;
    for (let q = pi - 1; q >= 0; q--) if (!notes[q].isChordPartner) { prevP = notes[q]; break; }
    const nextClash =
      next && next.lane === p.lane && next.midi !== primary.midi &&
      (next.time - Math.max(p.time, p.endTime || p.time) < 0.6 || next.time - p.time < 0.6);
    const prevClash =
      prevP && prevP.lane === p.lane && prevP.midi !== primary.midi &&
      (p.time - Math.max(prevP.time, prevP.endTime || prevP.time) < 0.6 || p.time - prevP.time < 0.6);
    if (nextClash || prevClash) notes.splice(k, 1);
  }
}

/**
 * Neighbour-note return into a repeated-note run (A-flat, G, A-flat A-flat A-flat... within ~0.6s): the run goes
 * back to the key the pitch just used (e.g. Sevens 3:06: J D J J J J, not J D F F F F), if that still reads in the
 * right direction from the note in between and into the note after the run.
 */
function applyNeighbourReturnRuns(prim) {
  const n = prim.length;
  for (let k = 2; k < n; k++) {
    const a = prim[k - 2];
    const mid = prim[k - 1];
    const cur = prim[k];
    if (cur.midi !== a.midi || mid.midi === cur.midi || cur.time - a.time > 0.6 || cur.lane === a.lane) continue;
    let e = k;
    while (e + 1 < n && prim[e + 1].midi === cur.midi && prim[e + 1].time - prim[e].time < 0.5 && prim[e + 1].lane === cur.lane) e++;
    if (e === k && !(k + 1 < n && prim[k + 1].midi === cur.midi)) continue; // only runs (>= 2 strikes)
    if (prim.slice(k, e + 1).some((x) => x.fixedLane)) continue;
    const tgt = a.lane;
    const inOk = cur.midi > mid.midi ? tgt > mid.lane : tgt < mid.lane;
    const nx = e + 1 < n ? prim[e + 1] : null;
    const outOk =
      !nx || nx.time - prim[e].time >= 0.5 || (nx.midi > cur.midi ? nx.lane > tgt : nx.midi < cur.midi ? nx.lane < tgt : true);
    if (inOk && outOk) for (let j = k; j <= e; j++) prim[j].lane = tgt;
  }
}

/**
 * Lane-direction repair after the repeated-pattern vote. A clash is two neighbouring melody notes (attacks within
 * 0.6s, or straight off a hold at a third of the weight) whose keys contradict the music: pitch goes down but the key goes right (or vice versa), two
 * different pitches on one key, a pitch landing on the key its predecessor's chord partner holds, or the same pitch
 * (at a playable pace) on two keys. Moves: re-key a whole class of linked repeat notes (singletons included), or
 * shift every class of a repeated phrase up/down together. A move is kept only if it lowers
 * 10 x clashes - (votes for the chosen keys), so repeats stay identical and majority fingerings survive when clean.
 */
function repairLaneDirections(prim, notes, lanes, voted, find, matches) {
  const natural = voted;
  const n = prim.length;
  // Clash cost between notes a -> b if they sit on keys la -> lb. Two different pitches on one key reads as a repeated
  // note, which is the most misleading, so it weighs a little more than a plain wrong-way step (a reset).
  const pairCostL = (a, la, b, lb) => {
    if (a.fixedLane && b.fixedLane) return 0; // two pinned notes: whatever they do is intended
    const dt = b.time - a.time;
    if (dt < 0.6) return pairCostNear(a, la, b, lb, dt);
    // Straight off a hold: the release gives the hand a moment, so a clash there only counts a third
    const gap = b.time - Math.max(a.time, a.endTime || a.time);
    const offHold = gap < 0.6 ? pairCostNear(a, la, b, lb, dt) / 3 : 0;
    // A beat apart (0.6-0.8s) still half reads as one phrase (and the same note a beat later must keep its key)
    const beat = dt < 0.8 ? pairCostNear(a, la, b, lb, dt) / (a.midi === b.midi ? 1 : 2) : 0;
    return Math.max(offHold, beat);
  };
  const pairCostNear = (a, la, b, lb, dt) => {
    if (b.midi === a.midi) {
      if (lb === la || a.altRun || b.altRun || b.edgeReset) return 0;
      // fast repeats may rock between keys, but a lone quick re-strike ("da-DAH") stays on its key
      return dt < 0.145 && !isoRestrike.has(b) ? 0 : 1;
    }
    if (lb === la) {
      // Dipping a 3rd or more below a note already on the bottom key (or leaping above one on the top key): keys have
      // run out, and staying put reads as "settling low", gentler than jumping back the wrong way (Sevens 1:13 68 -> 65)
      const floorDip = (la === 0 && a.midi - b.midi >= 3) || (la === lanes - 1 && b.midi - a.midi >= 3);
      return floorDip ? 0.8 : 1.5;
    }
    // Right direction, but a jump across the whole keyboard for a small interval (e.g. D -> K for a 3rd) is awkward
    if (Math.sign(b.midi - a.midi) === Math.sign(lb - la)) return Math.abs(lb - la) === lanes - 1 && Math.abs(b.midi - a.midi) <= 4 ? 0.5 : 0;
    // A full re-anchor (top key -> bottom key on a climb, or bottom -> top on a fall) is the normal way a long run
    // keeps going past four keys, so it is the cheapest wrong-way move (e.g. Sevens 0:30 climb: D F J K D F J K)
    const reAnchor = (b.midi > a.midi && la === lanes - 1 && lb === 0) || (b.midi < a.midi && la === 0 && lb === lanes - 1);
    // ...but never for a half-step neighbour (K -> D -> K for 72 73 72 is the worst look)
    return reAnchor ? (Math.abs(b.midi - a.midi) <= 1 ? 1.2 : 0.9) : 1;
  };
  const isoRestrike = new Set();
  for (let k = 1; k < n; k++) if (isIsolatedQuickRestrike(prim, k)) isoRestrike.add(prim[k]);
  const linked = (k) => k >= 1 && k < n && pairCostL(prim[k - 1], 0, prim[k], 1) + pairCostL(prim[k - 1], 1, prim[k], 1) > 0;
  const pairCost = (k) => (k < 1 || k >= n ? 0 : pairCostL(prim[k - 1], prim[k - 1].lane, prim[k], prim[k].lane));
  // Soft: the same pitch again a moment later (<= 1.2s, <= 4 notes in between) should reuse its key
  const backLink = new Array(n).fill(-1);
  const fwdLinks = Array.from({ length: n }, () => []);
  for (let k = 1; k < n; k++) {
    for (let j = k - 2; j >= Math.max(0, k - 5); j--) {
      if (prim[k].time - prim[j].time > 1.2) break;
      if (prim[j].midi === prim[k].midi) {
        backLink[k] = j;
        fwdLinks[j].push(k);
        break;
      }
    }
  }
  const SOFT = 0.3;
  const softCost = (k) => {
    let c = 0;
    const j = backLink[k];
    if (j >= 0) {
      const a = prim[j];
      const b = prim[k];
      if (!(a.lane === b.lane || a.altRun || b.altRun || b.edgeReset)) c += SOFT;
    }
    // ...and two different pitches a note apart shouldn't share a key either (e.g. 65 67 65 70 as D J D J: the 67 and
    // the 70 look like the same note)
    if (k >= 2) {
      const a = prim[k - 2];
      const b = prim[k];
      const mid = prim[k - 1].midi;
      // (only when the later note reaches further from the note between, within a fifth, so a further key exists)
      if (a.midi !== b.midi && a.lane === b.lane && b.time - a.time < 0.6 && Math.abs(b.midi - mid) > Math.abs(a.midi - mid) && Math.abs(b.midi - a.midi) <= 7) c += SOFT;
    }
    return c;
  };
  const costOf = (idxs) => {
    const ks = new Set();
    for (const k of idxs) {
      ks.add(k);
      ks.add(k + 1);
      for (const f of fwdLinks[k]) ks.add(f);
      ks.add(k + 2);
    }
    let c = 0;
    for (const k of ks) if (k < n) c += pairCost(k) + softCost(k);
    return c;
  };

  const classes = new Map();
  for (let k = 0; k < n; k++) {
    const r = find(k);
    if (!classes.has(r)) classes.set(r, []);
    // locally pinned notes stay put on their own: they don't anchor (or block) moves of their repeat class
    if (!prim[k].localHint && !prim[k].localPin) classes.get(r).push(k);
  }
  for (const [r, members] of [...classes]) if (!members.length) classes.delete(r);
  // ...but their unpinned key still counts as a vote for the class
  const pinnedVoters = new Map();
  for (let k = 0; k < n; k++) {
    if (!(prim[k].localHint || prim[k].localPin)) continue;
    const r = find(k);
    if (!pinnedVoters.has(r)) pinnedVoters.set(r, []);
    pinnedVoters.get(r).push(prim[k].localPin || prim[k].unpinnedLane === null ? prim[k].lane : prim[k].unpinnedLane);
  }
  const votes = new Map();
  for (const [r, members] of classes) {
    const v = new Map();
    for (const k of members) v.set(natural[k], (v.get(natural[k]) || 0) + 1);
    for (const l of pinnedVoters.get(r) || []) v.set(l, (v.get(l) || 0) + 1);
    const last = members[members.length - 1];
    v.set(natural[last], (v.get(natural[last]) || 0) + 0.1); // latest occurrence breaks ties
    votes.set(r, v);
  }
  const swept = new Set(); // notes re-drawn as a sweep; later passes leave them alone
  // drum-like alternating runs (e.g. Sevens 2:37) keep their rocking keys: never re-key them
  const movable = (members) => !members.some((k) => prim[k].fixedLane || prim[k].altRun || swept.has(k));
  const W = 10;

  const totalVotes = (rs) => rs.reduce((acc, r) => acc + (votes.get(r).get(prim[classes.get(r)[0]].lane) || 0), 0);
  const classMoves = () => {
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      // Move 2: shift a whole repeated phrase (every class it touches) by one or two keys
      for (const [j, i, len] of matches) {
        const roots = new Set();
        for (let k = 0; k < len; k++) roots.add(find(i + k));
        const idxs = [];
        for (const r of roots) idxs.push(...(classes.get(r) || []));
        if (!movable(idxs)) continue;
        const before = idxs.map((k) => prim[k].lane);
        const voteSum = () => idxs.reduce((acc, k) => acc + (votes.get(find(k)).get(prim[k].lane) || 0) / classes.get(find(k)).length, 0);
        let bestD = 0;
        let bestCost = W * costOf(idxs) - voteSum();
        for (const d of [-2, -1, 1, 2]) {
          if (before.some((l) => l + d < 0 || l + d >= lanes)) continue;
          idxs.forEach((k, q) => (prim[k].lane = before[q] + d));
          const c = W * costOf(idxs) - voteSum();
          if (c < bestCost - 1e-9) {
            bestCost = c;
            bestD = d;
          }
        }
        idxs.forEach((k, q) => (prim[k].lane = before[q] + bestD));
        if (bestD !== 0) changed = true;
      }
      // Move 1: re-key one class
      for (const [r, members] of classes) {
        if (!movable(members)) continue;
        const v = votes.get(r);
        const cur = prim[members[0]].lane;
        if (members.some((k) => prim[k].lane !== cur)) continue; // alternating runs etc. keep their own shape
        let bestLane = cur;
        let bestCost = W * costOf(members) - (v.get(cur) || 0);
        for (let l = 0; l < lanes; l++) {
          if (l === cur) continue;
          for (const k of members) prim[k].lane = l;
          const c = W * costOf(members) - (v.get(l) || 0);
          if (c < bestCost - 1e-9) {
            bestCost = c;
            bestLane = l;
          }
        }
        for (const k of members) prim[k].lane = bestLane;
        if (bestLane !== cur) changed = true;
      }
      if (!changed) break;
    }

    // Move 3: any clash still left gets a joint search over the classes of the few notes around it (e.g. Sevens 0:59
    // 67-65-60 needs all three re-keyed together: J F D)
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (let k = 1; k < n; k++) {
        if (pairCost(k) < 1) continue;
        let lo = k - 1;
        while (lo > Math.max(0, k - 5) && prim[lo].time - prim[lo - 1].time < 0.6) lo--;
        let hi = k;
        while (hi < Math.min(n - 1, k + 2) && prim[hi + 1].time - prim[hi].time < 0.6) hi++;
        const rs = [];
        for (let q = lo; q <= hi; q++) {
          const r = find(q);
          const m = classes.get(r);
          if (!m) continue;
          if (rs.includes(r) || !movable(m) || m.some((x) => prim[x].lane !== prim[m[0]].lane)) continue;
          rs.push(r);
        }
        if (!rs.length || rs.length > 6) continue;
        const idxs = rs.flatMap((r) => classes.get(r));
        const start = rs.map((r) => prim[classes.get(r)[0]].lane);
        const setLanes = (ls) => rs.forEach((r, q) => classes.get(r).forEach((x) => (prim[x].lane = ls[q])));
        let best = start.slice();
        let bestCost = W * costOf(idxs) - totalVotes(rs);
        const cur = new Array(rs.length).fill(0);
        const total = Math.pow(lanes, rs.length);
        for (let code = 0; code < total; code++) {
          let c = code;
          for (let q = 0; q < rs.length; q++) {
            cur[q] = c % lanes;
            c = Math.floor(c / lanes);
          }
          setLanes(cur);
          const cost = W * costOf(idxs) - totalVotes(rs);
          if (cost < bestCost - 1e-9) {
            bestCost = cost;
            best = cur.slice();
          }
        }
        setLanes(best);
        if (best.some((l, q) => l !== start[q])) changed = true;
      }
      if (!changed) break;
    }
  };
  classMoves();

  // Long climbs / falls (>= 5 different notes all moving one way, repeats allowed, < 0.6s apart) can't fit on four keys, so if one
  // clashes it is re-drawn as a clean sweep (D F J K D F ... or K J F D K J ...): fewest jumps back, clean joins to
  // its neighbours, then starting from the end key (e.g. Sevens 0:30 brass climb: D F J K D F J K D).
  {
    let a1 = 0;
    while (a1 < n - 1) {
      const dir = Math.sign(prim[a1 + 1].midi - prim[a1].midi);
      let a0 = a1; // a run may open with a repeated note (e.g. Sevens 0:45: 67 67 70 70 72 75 77)
      while (a0 > 0 && prim[a0 - 1].midi === prim[a0].midi && prim[a0].time - prim[a0 - 1].time < 0.6) a0--;
      let b0 = a1;
      while (
        b0 + 1 < n &&
        dir !== 0 &&
        (Math.sign(prim[b0 + 1].midi - prim[b0].midi) === dir || prim[b0 + 1].midi === prim[b0].midi) &&
        Math.abs(prim[b0 + 1].midi - prim[b0].midi) <= 7 &&
        prim[b0 + 1].time - prim[b0].time < 0.6 &&
        // a clear breath (much longer than the step before it) starts a new phrase (e.g. Sevens 2:23 trumpet pickup)
        !(b0 > a0 && prim[b0 + 1].time - prim[b0].time > 0.45 && prim[b0 + 1].time - prim[b0].time > 2.5 * (prim[b0].time - prim[b0 - 1].time))
      )
        b0++;
      // ...and a run doesn't START across a breath either (e.g. Ride 1:19: a 0.6s gap, then a 32nd-note run)
      if (
        b0 >= a0 + 2 &&
        prim[a0 + 1].time - prim[a0].time > 0.45 &&
        prim[a0 + 1].time - prim[a0].time > 2.5 * (prim[a0 + 2].time - prim[a0 + 1].time)
      )
        a0++;
      const len = b0 - a0 + 1;
      // a run that starts on a turning point (the top of an arch, e.g. Sevens 1:12 68 70 72 73 72 70 68) shares that
      // note with the climb before it, so the turn note doesn't count towards the sweep
      const turn = a0 > 0 && Math.sign(prim[a0].midi - prim[a0 - 1].midi) === -dir && prim[a0].time - prim[a0 - 1].time < 0.6;
      const distinct = new Set(prim.slice(turn ? a0 + 1 : a0, b0 + 1).map((x) => x.midi)).size;
      const distinctAll = new Set(prim.slice(a0, b0 + 1).map((x) => x.midi)).size;
      // Folding: exactly five different notes can also be drawn with the two outermost LOW notes sharing the bottom key
      // (D D F J K up, K J F D D down) - no jump back mid-run. Allowed even from a turning point, as long as the turn
      // note already sits on that end key (e.g. Ride 1:13 arch D D F J K J F D D, Ride 2:34 lick ... F D | D F J K).
      const foldable = false; // folds (D D F J K) read as jackhammers: five-note runs will get a ghost key instead
      const gaps = [];
      for (let q = a0 + 1; q <= b0; q++) gaps.push(prim[q].time - prim[q - 1].time);
      gaps.sort((x, y) => x - y);
      const fastRun = gaps.length > 0 && gaps[Math.floor(gaps.length / 2)] < 0.2;
      if ((distinct >= 5 || foldable) && !prim.slice(a0, b0 + 1).some((x) => x.fixedLane)) {
        let clash = 0;
        for (let q = a0 + 1; q <= b0; q++) clash += pairCost(q);
        if (clash >= 0.85) {
          const idxs = Array.from({ length: len }, (_, q) => a0 + q);
          const start = idxs.map((q) => prim[q].lane);
          // joins count against neighbours played right against the run; the run may START fresh after a short breath
          // (0.4s+, e.g. Ride 1:19 the alto run starts low after the previous note), but must lead cleanly out of its end
          const joinIn = (k) => (k >= 1 && k < n && prim[k].time - prim[k - 1].time < 0.4 ? pairCost(k) : 0);
          const join = (k) => (k >= 1 && k < n && prim[k].time - prim[k - 1].time < 0.6 ? pairCost(k) : 0);
          let best = null;
          let bestIdxs = null;
          let bestCost = Infinity;
          if (distinct >= 5) {
            const sIdxs = idxs;
            for (let off = 0; off < lanes; off++) {
              let wraps = 0;
              let pos = off - 1;
              sIdxs.forEach((q, j) => {
                const repeat = j > 0 && prim[q].midi === prim[q - 1].midi; // a repeated note stays on its key
                if (!repeat) pos++;
                const step = pos % lanes;
                prim[q].lane = dir > 0 ? step : lanes - 1 - step;
                // a jump back costs 1, or 1.5 on a half step (72 73 72 should never jump across the keyboard)
                if (j > 0 && !repeat && step === 0) wraps += Math.abs(prim[q].midi - prim[q - 1].midi) <= 1 ? 1.5 : 1;
              });
              // fewest jumps back (each one a stumble in a fast run), clean joins, then starting from the end key
              const cost = wraps * (fastRun ? 1.5 : 1) + joinIn(sIdxs[0]) + join(b0 + 1) + 0.05 * off;
              if (cost < bestCost - 1e-9) {
                bestCost = cost;
                bestIdxs = sIdxs;
                best = sIdxs.map((q) => prim[q].lane);
              }
            }
            idxs.forEach((q, j) => (prim[q].lane = start[j]));
          }
          if (foldable) {
            // the fold: the two lowest notes share the bottom key
            const pitches = [...new Set(idxs.map((q) => prim[q].midi))].sort((x, y) => x - y);
            const foldLane = (m) => Math.max(0, pitches.indexOf(m) - 1);
            idxs.forEach((q) => (prim[q].lane = foldLane(prim[q].midi)));
            // slow runs: a fold costs a touch more than one jump back (Sevens 0:45 keeps D D F F J K D)
            const cost = (fastRun ? 0.9 : 1.05) + (turn ? 0 : joinIn(a0)) + join(b0 + 1);
            if (cost < bestCost - 1e-9) {
              bestCost = cost;
              bestIdxs = idxs;
              best = idxs.map((q) => prim[q].lane);
            }
            idxs.forEach((q, j) => (prim[q].lane = start[j]));
          }
          if (false && turn && !foldable && distinct === lanes + 1) {
            // five different notes AFTER a turning point that doesn't sit on the end key: fold just those, starting
            // fresh after the turn (e.g. Ride 1:34 72 | 77 79 81 82 84 = D D F J K instead of a jump mid-run)
            const fIdxs = idxs.slice(1);
            const pitches = [...new Set(fIdxs.map((q) => prim[q].midi))].sort((x, y) => x - y);
            fIdxs.forEach((q) => (prim[q].lane = dir > 0 ? Math.max(0, pitches.indexOf(prim[q].midi) - 1) : lanes - 1 - Math.max(0, pitches.length - 1 - pitches.indexOf(prim[q].midi) - 1)));
            // restarting low right after the turn is fine on a leap (a 4th+), not on a step (Ride 0:04 68 -> 70)
            const leapIn = Math.abs(prim[a0 + 1].midi - prim[a0].midi) >= 4;
            const cost = !leapIn && joinIn(a0 + 1) > 0 ? Infinity : (fastRun ? 0.9 : 1.05) + 0.5 * joinIn(a0 + 1) + join(b0 + 1);
            if (cost < bestCost - 1e-9) {
              bestCost = cost;
              bestIdxs = fIdxs;
              best = fIdxs.map((q) => prim[q].lane);
            }
            idxs.forEach((q, j) => (prim[q].lane = start[j]));
          }
          if (best) {
            bestIdxs.forEach((q, j) => {
              prim[q].lane = best[j];
              swept.add(q);
            });
          }
        }
      }
      a1 = Math.max(a1 + 1, b0);
    }
  }

  classMoves(); // settle the classes around any sweep

  // Move 4 (last resort): a clash that no whole-class move can fix means this copy of the phrase continues
  // differently from its twins (e.g. Sevens 0:59 dives on to a low C). Re-plan just that phrase (notes joined by
  // < 0.6s) with a shortest-path search that also looks one note further back, so neighbour figures read right
  // (65 67 65 70 should not put the 67 and the 70 on one key; 67 65 67 keeps both 67s on one key). Kept only if it
  // removes a real clash.
  const softK2 = (a, la, b, lb, mid) => {
    if (b.time - a.time >= 0.8) return 0;
    if (a.midi !== b.midi) return la === lb && b.time - a.time < 0.6 && Math.abs(b.midi - mid) > Math.abs(a.midi - mid) && Math.abs(b.midi - a.midi) <= 7 ? SOFT : 0;
    return la !== lb && !a.altRun && !b.altRun && !b.edgeReset ? SOFT : 0;
  };
  // (a leap of a 5th or more into the start of a repeated figure is a new phrase that already plays like its twins:
  // same notes, same keys beats the join, e.g. Ride 2:39, the trumpets' 4th answer 67 68 67 65 right after the
  // woodwinds' 79 80 79 77)
  const repeatStart = new Set(matches.map(([, i]) => i));
  const phraseReplan = () => {
    let k4 = 1;
    while (k4 < n) {
      if (pairCost(k4) < 0.85 || (repeatStart.has(k4) && Math.abs(prim[k4].midi - prim[k4 - 1].midi) >= 7)) {
        k4++;
        continue;
      }
      let lo = k4 - 1;
      while (lo > 0 && linked(lo) && k4 - lo < 10 && prim[k4].time - prim[lo - 1].time < 1.8) lo--;
      let hi = k4;
      while (hi + 1 < n && linked(hi + 1) && hi - k4 < 10 && prim[hi + 1].time - prim[k4].time < 1.8) hi++;
      const len = hi - lo + 1;
      const allowed = (q) =>
        prim[q].fixedLane || prim[q].altRun || swept.has(q) ? [prim[q].lane] : Array.from({ length: lanes }, (_, l) => l);
      const keep = (q, l) => (l === voted[q] ? 0 : 1);
      let hard0 = 0;
      for (let q = lo + 1; q <= hi; q++) hard0 += pairCost(q);
      // state = (lane of previous note, lane of this note) -> [total, hard, back-pointer state]
      let dp = new Map();
      for (const l of allowed(lo)) dp.set(`-1,${l}`, [keep(lo, l), 0, null]);
      const backs = [];
      for (let q = lo + 1; q <= hi; q++) {
        const nd = new Map();
        for (const [key, [tot, hard]] of dp) {
          const [ppl, pl] = key.split(',').map(Number);
          for (const l of allowed(q)) {
            const h = pairCostL(prim[q - 1], pl, prim[q], l);
            const sk = ppl >= 0 ? softK2(prim[q - 2], ppl, prim[q], l, prim[q - 1].midi) : 0;
            const t = tot + W * h + W * sk + keep(q, l);
            const nk = `${pl},${l}`;
            const cur = nd.get(nk);
            if (!cur || t < cur[0] - 1e-9) nd.set(nk, [t, hard + h, key]);
          }
        }
        backs.push(nd);
        dp = nd;
      }
      let bestKey = null;
      let best = null;
      for (const [key, v] of dp) if (!best || v[0] < best[0] - 1e-9) {
        best = v;
        bestKey = key;
      }
      const realFix = best && best[1] < hard0 - 0.1;
      if (len > 1 && realFix) {
        const plan = new Array(len);
        let key = bestKey;
        for (let q = len - 1; q >= 1; q--) {
          const [, l] = key.split(',').map(Number);
          plan[q] = l;
          key = backs[q - 1].get(key)[2];
        }
        plan[0] = Number(key.split(',')[1]);
        for (let q = 0; q < len; q++) prim[lo + q].lane = plan[q];
      }
      k4 = hi + 1;
    }
  };
  const polishLoners = () => {
    // Final polish: lone notes (not tied to any repeat) settle on whichever key now fits their neighbours best
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      for (const [, members] of classes) {
        if (members.length !== 1) continue;
        const k = members[0];
        if (prim[k].fixedLane || prim[k].altRun || swept.has(k)) continue;
        const cur = prim[k].lane;
        let bestL = cur;
        let bestC = W * costOf([k]) - (cur === voted[k] ? 1 : 0);
        for (let l = 0; l < lanes; l++) {
          prim[k].lane = l;
          const c = W * costOf([k]) - (l === voted[k] ? 1 : 0);
          if (c < bestC - 1e-9) {
            bestC = c;
            bestL = l;
          }
        }
        prim[k].lane = bestL;
        if (bestL !== cur) changed = true;
      }
      if (!changed) break;
    }
  };
  // re-plan, polish, then once more: polishing a lone note can expose a clash the re-plan can now fix (e.g. Sevens 2:23)
  for (let round = 0; round < 2; round++) {
    phraseReplan();
    polishLoners();
  }
}

/**
 * Ghost lanes for quick five-note runs (4-key Hard only). Ghost S = lane index `lanes`, ghost L = `lanes + 1`.
 * A run: consecutive melody notes moving strictly one way in steps of a 5th or less, with no breath inside it, quick
 * (median gap < 0.3s, no gap over 0.45s), and exactly five different notes. Longer runs keep their jumps back.
 */
function assignGhostLanes(notes, lanes) {
  const S = lanes;
  const L = lanes + 1;
  const prim = notes.filter((n) => !n.isChordPartner && n.lane >= 0 && n.lane < lanes);
  const n = prim.length;
  let lastGhostRunEnd = -1; // index of the last note of the previous ghost run
  let prevGhost = null; // [note, original lane] pairs of the previous ghost run
  let prevMid = 0; // median gap of the previous ghost run
  const ghostEnds = [];
  let a = 0;
  while (a < n - 1) {
    const dir = Math.sign(prim[a + 1].midi - prim[a].midi);
    let b = a;
    while (
      b + 1 < n &&
      dir !== 0 &&
      Math.sign(prim[b + 1].midi - prim[b].midi) === dir &&
      Math.abs(prim[b + 1].midi - prim[b].midi) <= 7 &&
      prim[b + 1].time - prim[b].time < 0.45 &&
      !(b > a && prim[b + 1].time - prim[b].time > 2.5 * (prim[b].time - prim[b - 1].time) && prim[b + 1].time - prim[b].time > 0.3)
    )
      b++;
    // a breath before the 2nd note means the run really starts on the 2nd note
    if (b >= a + 2 && prim[a + 1].time - prim[a].time > 0.3 && prim[a + 1].time - prim[a].time > 2.5 * (prim[a + 2].time - prim[a + 1].time)) a++;
    const len = b - a + 1;
    let sharedTurn = a === lastGhostRunEnd; // this run starts on the last note of a ghost run (an arch)
    let s0 = a;
    const turnHere = a > 0 && Math.sign(prim[a].midi - prim[a - 1].midi) === -dir;
    // a real V: the turn note ends a run of 3+ notes going the other way (Ride 0:04). A lone neighbour note (79 80 79 77
    // ..., Arabesque 1:57 & 4:07) is an ornament, not a run: a fall starting on it (or right after it) gets no ghost
    const trueV = turnHere && a > 1 && Math.sign(prim[a - 1].midi - prim[a - 2].midi) === -dir && prim[a].time - prim[a - 2].time < 0.9;
    const neighbour =
      turnHere && !trueV && a + 1 < n && prim[a - 1].midi === prim[a + 1].midi && prim[a + 1].time - prim[a - 1].time < 0.6;
    if (neighbour && len === lanes + 2) {
      a = Math.max(a + 1, b);
      continue;
    }
    if (len === lanes + 2 && turnHere) {
      // five notes AFTER a turning point: the run proper starts after the turn. If the turn closed a ghost run, the
      // two can't both fit (a V needs six keys), so the later run wins (e.g. Ride 0:04-0:06: the climb gets the ghost)
      if (sharedTurn && prevGhost) {
        // a V whose far side starts AFTER the turn note: both runs keep their ghost by sharing the ghost key at the
        // bottom (or top) of the V (Arabesque 1:44: 79 77 76 73 72, then the rip 77 79 80 82 84 = K J F D S, S D F J K)
        const vseq = dir > 0 ? [3, 2, 1, 0, S] : [0, 1, 2, 3, L];
        const fits = prevGhost.length === lanes + 1 && !prevGhost.some(([x], j) => vseq[j] >= lanes && x.type === 'hold');
        prevGhost.forEach(([x, l], j) => {
          if (fits) {
            x.lane = vseq[j];
            if (vseq[j] >= lanes) x.ghost = vseq[j] === S ? 'S' : 'L';
            else delete x.ghost;
          } else {
            x.lane = l;
            delete x.ghost;
          }
        });
        prevGhost = null;
      }
      sharedTurn = false;
      s0 = a + 1;
    }
    const runLen = b - s0 + 1;
    const gaps = [];
    for (let q = s0 + 1; q <= b; q++) gaps.push(prim[q].time - prim[q - 1].time);
    gaps.sort((x, y) => x - y);
    const mid = gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
    // (quick = really quick taps, median gap under 0.2s: a flowing eighth-note line at ~0.22s, e.g. What We Do 1:03, is
    // not a ghost run)
    const quick = gaps.length > 0 && mid < 0.2 && gaps[gaps.length - 1] <= 0.3;
    const run = prim.slice(s0, b + 1);
    // a scale-like run (steps of a 3rd or less -- a major 3rd only with clean joins, below -- not leaps: Ride 2:11's fall
    // stays on four keys)...
    const stepwise = run.every((x, j) => j === 0 || Math.abs(x.midi - run[j - 1].midi) <= 4);
    // ...that stands on its own, not five notes partway through a long flurry
    let pa = s0;
    while (pa > 0 && prim[pa].time - prim[pa - 1].time < 0.2) pa--;
    let pb = b;
    while (pb + 1 < n && prim[pb + 1].time - prim[pb].time < 0.2) pb++;
    // (a long flurry may still OPEN with a ghost run, e.g. Ride 1:19 the alto's big run starts on S, but never dips
    // back into a ghost key partway through)
    const isolated = pb - pa + 1 <= 16 || s0 === pa;
    if (runLen === lanes + 1 && quick && stepwise && isolated && !run.some((x) => x.fixedLane || x.altRun)) {
      let seq;
      if (sharedTurn && prevMid && mid > 1.5 * prevMid) {
        // the arch's far side moves much slower than its climb (Arabesque 3:49: quick S D F J K, then 87 86 84 82 at a
        // quarter of the pace): it's a new phrase, not the same run turning, so no ghost (82 starts the K J F D pattern)
        seq = null;
      } else if (sharedTurn) {
        // continue from the end key the previous ghost run finished on; the ghost takes the far end
        const st = run[0].lane;
        if (dir > 0) seq = st === S ? [S, 0, 1, 2, 3] : st === 0 ? [0, 1, 2, 3, L] : null;
        else seq = st === L ? [L, 3, 2, 1, 0] : st === 3 ? [3, 2, 1, 0, S] : null;
      } else {
        seq = dir > 0 ? [S, 0, 1, 2, 3] : [L, 3, 2, 1, 0];
        // ...unless the turn note tops off a clean four-key sweep coming the other way (e.g. Sevens 1:12: D F J K
        // up, then the fall): keep the sweep's end key and put the ghost on the far end (K J F D S)
        if (s0 === a && turnHere) {
          let k = a;
          while (k > 0 && Math.sign(prim[k].midi - prim[k - 1].midi) === -dir && prim[k].time - prim[k - 1].time < 0.6) k--;
          const sweep = prim.slice(k, a + 1).map((x) => x.lane);
          const clean = sweep.length >= 4 && sweep.every((l, j) => j === 0 || l - sweep[j - 1] === -dir);
          if (clean && dir < 0 && run[0].lane === 3) seq = [3, 2, 1, 0, S];
          if (clean && dir > 0 && run[0].lane === 0) seq = [0, 1, 2, 3, L];
        }
      }
      // ghost keys are taps only: if the ghost would land on a held note, put it on the other end instead (Arabesque
      // 4:50: J67-hold, then 63 65 67 69 -> 70 held = S D F J K-hold), or drop it if that end is held too
      if (seq && run.some((x, j) => seq[j] >= lanes && x.type === 'hold')) {
        const flip = dir > 0 ? [S, 0, 1, 2, 3] : [L, 3, 2, 1, 0];
        seq = run.some((x, j) => flip[j] >= lanes && x.type === 'hold') ? null : flip;
      }
      // (a run with a major-3rd step -- e.g. Arabesque 5:07's horns 58 60 62 63 67 -- only when it joins the notes around
      // it cleanly: no wrong-way step or same key from the note just before, no same key into the note just after)
      if (seq && run.some((x, j) => j > 0 && Math.abs(x.midi - run[j - 1].midi) === 4)) {
        const pv = s0 > 0 && run[0].time - prim[s0 - 1].time < 0.3 ? prim[s0 - 1] : null;
        const nx = b + 1 < n && prim[b + 1].time - run[run.length - 1].time < 0.3 ? prim[b + 1] : null;
        const kp = (l) => (l === S ? -1 : l === L ? lanes : l);
        const badIn = pv && pv.midi !== run[0].midi && (kp(pv.lane) === kp(seq[0]) || Math.sign(kp(seq[0]) - kp(pv.lane)) !== Math.sign(run[0].midi - pv.midi));
        const badOut = nx && nx.midi !== run[run.length - 1].midi && kp(nx.lane) === kp(seq[seq.length - 1]);
        if (badIn || badOut) seq = null;
      }
      if (seq) {
        prevGhost = run.map((x) => [x, x.lane]);
        prevMid = mid;
        run.forEach((x, j) => {
          x.lane = seq[j];
          if (seq[j] >= lanes) x.ghost = seq[j] === S ? 'S' : 'L';
        });
        lastGhostRunEnd = b;
        ghostEnds.push(b);
      }
    }
    a = Math.max(a + 1, b);
  }
  // Leaving a ghost run: re-plan the few notes after it (up to 6, while they follow on quickly) so they read right from
  // where the run ended (e.g. Ride 1:36: ... D S, then 82 79 77 = J F D; Ride 2:52: ... J K, then 82 81 77 = J F D)
  for (const e of ghostEnds) replanAfter(prim, e, lanes);
}

/**
 * Re-plan the few notes after prim[e] (up to 6, while they follow on quickly, stopping at ghost / score-planned notes)
 * so they read right from prim[e]'s key: wrong-way steps, different notes on one key and one-key bounces cost; the nearer
 * key wins a tie on the first step, and bouncing back right away costs more than a wrap a few notes later.
 */
// (Hard only: re-planned quick notes may finish on a ghost key -- see replanAfter)
let ghostEdgeOK = false;

function replanAfter(prim, e, lanes, gapLim = 0.6) {
  const S = lanes;
  const L = lanes + 1;
  const n = prim.length;
  const pos = (l) => (l === S ? -1 : l === L ? lanes : l);
  const clash = (a, la, b, lb) => {
    if (b.time - a.time >= 0.6) return 0;
    const pa = pos(la);
    const pb = pos(lb);
    if (a.midi === b.midi) return pa === pb ? 0 : 1;
    if (pa === pb) return 1.5;
    if (Math.sign(b.midi - a.midi) === Math.sign(pb - pa)) return 0;
    return Math.abs(pb - pa) === 1 ? 1.2 : 1; // a one-key bounce the wrong way reads worse than a full wraparound
  };
  const win = [];
  for (let q = e + 1; q < n && win.length < 6; q++) {
    // (a run of quick repeats rocks between two keys -- F J F J -- and keeps that: one key can't be struck that fast)
    if (prim[q].time - prim[q - 1].time >= gapLim || prim[q].ghost || prim[q].fixedLane || prim[q].altRun) break;
    win.push(q);
  }
  if (!win.length) return;
  const after = win[win.length - 1] + 1 < n ? prim[win[win.length - 1] + 1] : null;
  let dp = new Map([[prim[e].lane, { cost: 0, path: [] }]]);
  let prevNote = prim[e];
  for (const q of win) {
    const nd = new Map();
    // (a quick run that runs out of keys at the edge may finish on the ghost key past it -- its last note before a
    // breath or a leap: Ride 1:21's 68 66 68 66 63 61 -> J F J F D S, then the leap up to 75)
    const nq = q + 1 < n ? prim[q + 1] : null;
    // (the run really ends there: the next note leaps away, a 4th or more -- a fall that carries on, like Arabesque
    // 1:57's flute sequence 80 79 77 | 76 73 72, or a dip that just turns back up, like Ride 1:38's 79 77 79, keeps its
    // own layout)
    const runEnd = !nq || Math.abs(nq.midi - prim[q].midi) >= 5;
    const quickIn = prim[q].time - prim[q - 1].time <= 0.12;
    const cands = [...Array(lanes).keys()];
    if (ghostEdgeOK && runEnd && quickIn && prim[q].midi !== prim[q - 1].midi) cands.push(prim[q].midi < prim[q - 1].midi ? S : L);
    for (const l of cands) {
      let best = null;
      for (const [pl, v] of dp) {
        // (the ghost only continues a step off the edge key next to it)
        if (l === S && pl !== 0) continue;
        if (l === L && pl !== lanes - 1) continue;
        const jump = (q === win[0] ? 0.15 * Math.abs(pos(l) - pos(pl)) : 0) + (l >= lanes ? 0.3 : 0);
        const w = win.indexOf(q) < 3 ? 1.5 : 1;
        const c = v.cost + w * clash(prevNote, pl, prim[q], l) + (l === prim[q].lane ? 0 : 0.1) + jump;
        if (!best || c < best.cost) best = { cost: c, path: [...v.path, l] };
      }
      if (best) nd.set(l, best);
    }
    dp = nd;
    prevNote = prim[q];
  }
  let best = null;
  for (const [l, v] of dp) {
    const c = v.cost + (after ? clash(prevNote, l, after, after.lane) : 0);
    if (!best || c < best.cost) best = { cost: c, path: v.path };
  }
  let ghostAt = -1;
  win.forEach((q, j) => {
    const l = best.path[j];
    prim[q].lane = l;
    if (l >= lanes) {
      prim[q].ghost = l === S ? 'S' : 'L';
      ghostAt = q;
    } else if (prim[q].ghost) delete prim[q].ghost;
  });
}

/**
 * A repeated-note run (3+ strikes) sitting on an edge key whose line then carries on past that edge moves one key
 * inward, and what follows is re-planned (Arabesque 4:30: 81 81 81 81, 82, 81, 79 = F F F F J F D, not D D D D F F D).
 */
function applyEdgeRepeatRuns(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  let s = 0;
  while (s < n) {
    let e = s;
    while (e + 1 < n && prim[e + 1].midi === prim[s].midi && prim[e + 1].time - prim[e].time < 0.5 && prim[e + 1].lane === prim[s].lane) e++;
    const run = prim.slice(s, e + 1);
    const L0 = prim[s].lane;
    if (run.length >= 3 && (L0 === 0 || L0 === lanes - 1) && !run.some((x) => x.fixedLane || x.altRun || x.localPin)) {
      const after = prim.slice(e + 1, e + 4).filter((x) => x.time - prim[e].time < 1.0);
      const m = prim[s].midi;
      let to = L0;
      if (L0 === 0 && after.some((x) => x.midi < m)) to = 1;
      if (L0 === lanes - 1 && after.some((x) => x.midi > m)) to = lanes - 2;
      const before = s > 0 && prim[s].time - prim[s - 1].time < 0.8 ? prim[s - 1] : null;
      const okBefore = !before || before.midi === m || Math.sign(m - before.midi) === Math.sign(to - before.lane);
      if (to !== L0 && okBefore) {
        run.forEach((x) => (x.lane = to));
        replanAfter(prim, e, lanes);
      }
    }
    s = e + 1;
  }
}

/**
 * A quick neighbour turn that leads into a descent (or ascent) of 2+ steps sits on the keys that leave the line
 * room: x y x on J K J then F D ... going down (Ride 0:27 & 0:38: 77 78 77 75 73 75 = J K J F D F; 1:09: 73 74 73 71 69
 * 71 73 = J K J F D F J), or F D F then J K ... going up. The notes after the turn are re-planned from there.
 */
function applyTurnLeadIns(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  for (let k = 1; k + 3 < prim.length; k++) {
    const x = prim[k - 1];
    const y = prim[k];
    const z = prim[k + 1];
    const n1 = prim[k + 2];
    const n2 = prim[k + 3];
    // (a turn in its own time, not one flick inside a fast flurry: Ride 1:20's 71 72 71 stays part of its sequence)
    if (x.midi !== z.midi || y.midi === x.midi || Math.abs(y.midi - x.midi) > 2 || z.time - x.time >= 0.45 || z.time - x.time < 0.2) continue;
    if ([x, y, z].some((q) => q.fixedLane || q.altRun || q.localPin || q.ghost)) continue;
    const up = y.midi > x.midi; // upper neighbour: the line then falls
    const falls = n1.midi < z.midi && n2.midi < n1.midi;
    const rises = n1.midi > z.midi && n2.midi > n1.midi;
    if (!(up ? falls : rises) || n1.time - z.time >= 0.5 || n2.time - n1.time >= 0.5) continue;
    // (a descent by steps, not a leap away: Mercury 1:03, the horns' 68 70 68 67 then the bassoons' 43 an octave and
    // more below)
    if (Math.abs(n1.midi - z.midi) > 4 || Math.abs(n2.midi - n1.midi) > 4) continue;
    // (a turn that launches a five-note run is the ghost run's business: Ride 0:06 70 68 | 70 72 73 75 77 = S D F J K)
    let m = k + 1;
    while (m + 1 < prim.length && Math.sign(prim[m + 1].midi - prim[m].midi) === (up ? -1 : 1) && prim[m + 1].time - prim[m].time < 0.3) m++;
    if (m - (k + 1) + 1 >= 5) continue;
    // the turn's note and its repeats just before it (Arabesque 4:29: 84 84 | 84 86 84 82)
    let r0 = k - 1;
    while (r0 - 1 >= 0 && prim[r0 - 1].midi === x.midi && prim[r0].time - prim[r0 - 1].time < 0.5 && !(prim[r0 - 1].fixedLane || prim[r0 - 1].localPin || prim[r0 - 1].ghost)) r0--;
    // the turn must read the right way from the note before it: a turn sequenced one step on from the figure before sits
    // one key further along (Arabesque 4:28: 86 87 86 = J K J, then 84 86 84 = F J F); if neither fits, it's left alone
    const before = r0 > 0 && prim[r0].time - prim[r0 - 1].time < 0.5 ? prim[r0 - 1] : null;
    // (a line already on the edge key has to wrap: Ride 0:27's D F J K run, then 77 78 77 75 = J K J F)
    const edged = before && (x.midi > before.midi ? before.lane === lanes - 1 : before.lane === 0);
    const fits = (l) => !before || before.midi === x.midi || (l !== before.lane && (edged || Math.sign(l - before.lane) === Math.sign(x.midi - before.midi)));
    let xl = up ? 2 : 1;
    let yl = up ? 3 : 0;
    if (!fits(xl)) {
      xl += up ? -1 : 1;
      yl += up ? -1 : 1;
      if (!fits(xl)) continue;
    }
    if (x.lane === xl && y.lane === yl && z.lane === xl && prim.slice(r0, k - 1).every((q) => q.lane === xl)) continue;
    x.lane = xl;
    y.lane = yl;
    z.lane = xl;
    for (let b = r0; b < k - 1; b++) prim[b].lane = xl;
    replanAfter(prim, k + 1, lanes);
  }
}

/**
 * A long quick run (6-8 notes stepping one way, every gap <= 0.12s, not part of a longer run, no ghost) lays its
 * keys out in full sweeps that END on the edge key, so the top (or bottom) note lands on K (or D): Ride 1:16 69 71 73 74
 * 76 78 80 = F J K D F J K.
 */
function applyLongRunEdges(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  let a = 0;
  while (a < n - 1) {
    const dir = Math.sign(prim[a + 1].midi - prim[a].midi);
    let b = a;
    while (b + 1 < n && dir !== 0 && Math.sign(prim[b + 1].midi - prim[b].midi) === dir && Math.abs(prim[b + 1].midi - prim[b].midi) <= 3 && prim[b + 1].time - prim[b].time <= 0.12) b++;
    const len = b - a + 1;
    const run = prim.slice(a, b + 1);
    // a nine-note sweep (one note more than two full sweeps; the lead-in note may come a touch early, up to 0.2s) starts on
    // the ghost key: Arabesque 4:46 70 72 74 75 78 79 81 82 84 = S D F J K D F J K, not D D F J K D F J K
    const lead = a > 0 ? prim[a - 1] : null;
    if (len === 8 && lead && Math.sign(prim[a].midi - lead.midi) === dir && Math.abs(prim[a].midi - lead.midi) <= 3 && prim[a].time - lead.time <= 0.2 &&
        lead.type !== 'hold' && !(lead.ghost || lead.fixedLane || lead.localPin || lead.altRun) && !run.some((x) => x.ghost || x.fixedLane || x.localPin || x.altRun) &&
        !(a > 1 && Math.sign(lead.midi - prim[a - 2].midi) === dir && lead.time - prim[a - 2].time <= 0.2)) {
      lead.lane = dir > 0 ? lanes : lanes + 1;
      lead.ghost = dir > 0 ? 'S' : 'L';
      const end = dir > 0 ? lanes - 1 : 0;
      run.forEach((x, j) => {
        const fromEnd = len - 1 - j;
        x.lane = dir > 0 ? (((end - fromEnd) % lanes) + lanes) % lanes : (end + fromEnd) % lanes;
      });
      replanAfter(prim, b, lanes);
      a = Math.max(a + 1, b);
      continue;
    }
    if (len >= 6 && len <= 8 && !run.some((x) => x.ghost || x.fixedLane || x.localPin || x.altRun)) {
      const end = dir > 0 ? lanes - 1 : 0;
      run.forEach((x, j) => {
        const fromEnd = len - 1 - j;
        x.lane = dir > 0 ? (((end - fromEnd) % lanes) + lanes) % lanes : (end + fromEnd) % lanes;
      });
      replanAfter(prim, b, lanes);
    }
    a = Math.max(a + 1, b);
  }
}

/**
* Two quick notes on one key after a leap (What We Do 0:28 harp: 81 76, leap down to 67, then 64 = J F D D):
 * the leaping note moves off the shared key, pushing the notes before it along while they'd collide, so the figure reads
 * as K J F D. (A plain stepwise run that bottoms out on two notes on one key is left alone, e.g. What We Do 2:17's flute.)
 */
function applyLeapPairSplits(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  for (let k = 1; k + 1 < prim.length; k++) {
    const p = prim[k - 1];
    const a = prim[k];
    const b = prim[k + 1];
    if (a.lane !== b.lane || a.midi === b.midi || b.time - a.time >= 0.3) continue;
    if (Math.abs(a.midi - p.midi) < 5 || a.time - p.time >= 0.6) continue;
    if ([a, b].some((q) => q.fixedLane || q.localPin || q.ghost || q.altRun)) continue;
    const dir = Math.sign(a.midi - b.midi);
    const plan = [[a, a.lane + dir]];
    let j = k - 1;
    let target = a.lane + dir;
    let ok = target >= 0 && target < lanes;
    while (ok && j >= 0) {
      const q = prim[j];
      const nextQ = plan[plan.length - 1][0];
      if (nextQ.time - q.time >= 0.6 || q.lane !== target || q.midi === nextQ.midi) break;
      if (Math.sign(q.midi - nextQ.midi) !== dir || q.fixedLane || q.localPin || q.ghost) {
        ok = false;
        break;
      }
      target += dir;
      if (target < 0 || target >= lanes) ok = false;
      else plan.push([q, target]);
      j--;
    }
    if (ok) plan.forEach(([q, l]) => (q.lane = l));
  }
}

/**
 * Compact figures: "don't jump keys if you don't need to". A quick figure (5+ notes, each under 0.3s apart) that uses
 * no more different pitches than there are keys is laid out with its pitches in order across the keys, so it never jumps
 * back across the keyboard inside itself; if a jump is needed it comes before the figure (with any repeats of its first
 * note leading in). Ride 0:22: 73 | 73 72 70 72 70 68 70 = K | K J F J F D F, not F | F K J K J F J.
 */
function applyCompactFigures(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  const hard = (a, la, b, lb) => {
    if (b.time - a.time >= 0.6) return 0;
    if (a.midi === b.midi) return la === lb ? 0 : 1;
    if (la === lb) return 1.5;
    return Math.sign(lb - la) === Math.sign(b.midi - a.midi) ? 0 : 1;
  };
  let a = 0;
  while (a < n) {
    let b = a;
    while (b + 1 < n && prim[b + 1].time - prim[b].time < 0.3) b++;
    const bEnd = b;
    // (a drum-like repeated-note run joined on at either end keeps its own rocking keys)
    while (b > a && prim[b].altRun) b--;
    let aa = a;
    while (aa < b && prim[aa].altRun) aa++;
    const fig = prim.slice(aa, b + 1);
    if (fig.length >= 5 && !fig.some((x) => x.fixedLane || x.localPin || x.ghost || x.altRun || x.type === 'hold')) {
      const pitches = [...new Set(fig.map((x) => x.midi))].sort((p, q) => p - q);
      let inner = 0;
      for (let k = 1; k < fig.length; k++) inner += hard(fig[k - 1], fig[k - 1].lane, fig[k], fig[k].lane);
      if (pitches.length >= 2 && pitches.length <= lanes && inner >= 1) {
        // repeats of the first note just before (a breath apart at most) come along
        let s0 = aa;
        while (s0 > 0 && prim[s0 - 1].midi === prim[aa].midi && prim[s0].time - prim[s0 - 1].time < 0.5 && !prim[s0 - 1].fixedLane && !prim[s0 - 1].ghost) s0--;
        const seg = prim.slice(s0, b + 1);
        const before = s0 > 0 ? prim[s0 - 1] : null;
        const after = b + 1 < n ? prim[b + 1] : null;
        let best = null;
        for (let off = 0; off + pitches.length <= lanes; off++) {
          const lane = (x) => off + pitches.indexOf(x.midi);
          let c = 0;
          if (before) c += hard(before, before.lane, seg[0], lane(seg[0]));
          if (after) c += hard(seg[seg.length - 1], lane(seg[seg.length - 1]), after, after.lane);
          c += seg.reduce((acc, x) => acc + (lane(x) === x.lane ? 0 : 0.01), 0);
          if (!best || c < best.c - 1e-9) best = { c, off };
        }
        // only if it's no worse at the edges than the jump it removes inside
        let edgeNow = 0;
        if (before) edgeNow += hard(before, before.lane, seg[0], seg[0].lane);
        if (after) edgeNow += hard(seg[seg.length - 1], seg[seg.length - 1].lane, after, after.lane);
        if (best && Math.floor(best.c) <= edgeNow + inner - 1) seg.forEach((x) => (x.lane = best.off + pitches.indexOf(x.midi)));
      }
    }
    a = bEnd + 1;
  }
}

/**
 * Phrase plans: a long phrase that repeats (8+ notes, same pitches in the same rhythm, 2+ statements) is laid out as
 * ONE unit, all statements on the same keys. If it needs more keys than there are, its key "break" goes where the
 * phrase's figure comes back (a phrase restart) rather than in the middle of a line. E.g. Ride's clarinet
 * phrase 74 75 74 70 67 70 72 | 74 75 74 77 = J K J F D F J | F J F K: six notes climb from 67, so something has to
 * give, and the natural place is where 74 75 74 starts again. Only used when it reads better than the current keys.
 */
function applyPhrasePlans(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  if (n < 16) return;
  const MIN = 8;
  // (8+ identical pitches is a strong match on its own; the rhythm only has to be roughly the same, within 2x, since live
  // recordings swing each statement a little differently)
  const gapOk = (a, b) => Math.max(a, b) <= 2 * Math.min(a, b) + 0.05;
  const ioi = (k) => prim[k + 1].time - prim[k].time;
  const same = (i, j, len) => {
    for (let q = 0; q < len; q++) if (prim[i + q].midi !== prim[j + q].midi) return false;
    for (let q = 0; q + 1 < len; q++) if (!gapOk(ioi(i + q), ioi(j + q))) return false;
    return true;
  };
  // longest repeat starting at each note (vs any earlier, non-overlapping start)
  const cands = [];
  for (let i = 1; i < n; i++) {
    let best = 0;
    for (let j = Math.max(0, i - 400); j < i; j++) {
      if (prim[j].midi !== prim[i].midi) continue;
      let len = 0;
      while (i + len < n && j + len < i && prim[j + len].midi === prim[i + len].midi && (len === 0 || gapOk(ioi(j + len - 1), ioi(i + len - 1)))) len++;
      if (len > best) best = len;
    }
    // (a phrase is a line, 8-24 notes; a whole repeated section is many phrases and is left to the other rules)
    if (best >= MIN && best <= 24) cands.push([i, best]);
  }
  cands.sort((a, b) => b[1] - a[1]);
  const covered = new Uint8Array(n);
  const planned = new Uint8Array(n); // notes a phrase plan actually re-keyed
  const pairCost = (a, la, b, lb) => {
    const dt = b.time - a.time;
    const gap = b.time - Math.max(a.time, a.endTime || a.time);
    // (as in the lane repair: a beat apart, 0.6-0.8s, still half reads as one phrase; straight off a hold, a third)
    const w = dt < 0.6 ? 1 : dt < 0.8 ? (a.midi === b.midi ? 1 : 0.5) : gap < 0.6 ? 1 / 3 : 0;
    if (!w) return 0;
    if (a.midi === b.midi) return la === lb ? 0 : w;
    // (as in the lane repair: dipping a 3rd+ below a note already on the bottom key, or leaping above one on the top
    // key, reads as settling there, gentler than a jump back)
    if (la === lb) return ((la === 0 && a.midi - b.midi >= 3) || (la === lanes - 1 && b.midi - a.midi >= 3) ? 0.8 : 1.5) * w;
    if (Math.sign(b.midi - a.midi) === Math.sign(lb - la)) {
      if (Math.abs(lb - la) === lanes - 1 && Math.abs(b.midi - a.midi) <= 4) return 0.5 * w;
      // (a step that skips a key reads a little loose: F70 K72 vs F70 J72)
      return Math.abs(b.midi - a.midi) <= 2 && Math.abs(lb - la) >= 2 ? 0.1 * (Math.abs(lb - la) - 1) * w : 0;
    }
    const reAnchor = (b.midi > a.midi && la === lanes - 1 && lb === 0) || (b.midi < a.midi && la === 0 && lb === lanes - 1);
    return (reAnchor ? (Math.abs(b.midi - a.midi) <= 1 ? 1.2 : 0.9) : 1) * w;
  };
  // two notes back, a moment ago: a different pitch on the same key reads like a repeat of it, and the same pitch on a
  // different key looks like a new note (74 75 74 should come back on the key it left)
  const soft = (a, la, b, lb) => {
    if (b.time - a.time >= 0.8) return 0;
    if (a.midi === b.midi) return la !== lb ? 0.6 : 0;
    return la === lb && b.time - a.time < 0.6 ? 0.3 : 0;
  };
  for (const [i0, len0] of cands) {
    if (covered[i0]) continue;
    const pat = prim.slice(i0, i0 + len0).map((x) => x.midi);
    const all = [];
    for (let s = 0; s + len0 <= n; s++) {
      if (all.length && s < all[all.length - 1] + len0) continue;
      if (prim[s].midi === pat[0] && same(s, i0, len0)) all.push(s);
    }
    if (all.length < 2) continue;
    // notes already laid out as part of a longer phrase anchor the same positions of this one (same notes, same keys);
    // statements not yet laid out at all get planned
    const nCov = (s) => { let c = 0; for (let q = s; q < s + len0; q++) c += covered[q]; return c; };
    const anchor = undefined;
    const occ = all.filter((s) => nCov(s) === 0);
    if (!occ.length) continue;
    // (hand-pinned / score-planned keys mean the phrase was laid out on purpose: leave it)
    if (all.some((s) => prim.slice(s, s + len0).some((x) => x.altRun || x.ghost || x.isPercussionSolo || x.fixedLane || x.localPin || x.localHint))) {
      for (const s of all) for (let q = s; q < s + len0; q++) covered[q] = 1;
      continue;
    }
    // pinned notes: every statement must agree on the pin, which then constrains the plan
    const fixedAt = new Array(len0).fill(null);
    let clash = false;
    for (const s of all) for (let q = 0; q < len0; q++) {
      if (!planned[s + q]) continue;
      if (fixedAt[q] !== null && fixedAt[q] !== prim[s + q].lane) clash = true;
      fixedAt[q] = prim[s + q].lane;
    }
    for (const s of occ) for (let q = 0; q < len0; q++) {
      const x = prim[s + q];
      if (!(x.fixedLane || x.localPin || x.localHint)) continue;
      if (fixedAt[q] !== null && fixedAt[q] !== x.lane) clash = true;
      fixedAt[q] = x.lane;
    }
    if (clash) continue;
    // where a figure (3 notes) comes back inside the phrase, the phrase starts again: a break there costs half
    const restart = new Array(len0).fill(false);
    for (let q = 3; q + 2 < len0; q++)
      for (let p0 = 0; p0 + 3 <= q; p0++) if (pat[q] === pat[p0] && pat[q + 1] === pat[p0 + 1] && pat[q + 2] === pat[p0 + 2]) restart[q] = true;
    // (a statement that disagrees with the keys its phrase was just given elsewhere is re-planned regardless)
    const mismatch = occ.some((s) => fixedAt.some((l, q) => l !== null && planned[all.find((a) => planned[a + q]) + q] && prim[s + q].lane !== l));
    // only phrases that restart inside themselves AND currently break somewhere else (a clash mid-line) are re-planned
    if (!restart.some(Boolean) && !mismatch) {
      for (const s of occ) for (let q = s; q < s + len0; q++) covered[q] = 1;
      continue;
    }
    const midBreak = occ.some((s) => {
      for (let q = 1; q < len0; q++) if (!restart[q] && pairCost(prim[s + q - 1], prim[s + q - 1].lane, prim[s + q], prim[s + q].lane) >= 0.9) return true;
      return false;
    });
    if (!midBreak && !mismatch) {
      for (const s of occ) for (let q = s; q < s + len0; q++) covered[q] = 1;
      continue;
    }
    // (a break at a restart costs half, and a small step back reads as a restart better than a jump across the keys)
    const brk = (q, a, la, b, lb) => {
      const c = pairCost(a, la, b, lb);
      return restart[q] && c > 0 && la !== lb ? 0.45 + 0.02 * Math.abs(lb - la) : c;
    };
    const stepCost = (q, la, lb, lc) => {
      // cost of moving into position q (lane lb) from q-1 (lane la), with q-2 on lane lc, summed over statements
      let c = 0;
      for (const s of occ) {
        c += brk(q, prim[s + q - 1], la, prim[s + q], lb);
        if (q >= 2) c += soft(prim[s + q - 2], lc, prim[s + q], lb);
      }
      return c;
    };
    const entryCost = (l0) => occ.reduce((c, s) => c + (s > 0 ? pairCost(prim[s - 1], prim[s - 1].lane, prim[s], l0) : 0), 0);
    const exitCost = (lL) => occ.reduce((c, s) => c + (s + len0 < n ? pairCost(prim[s + len0 - 1], lL, prim[s + len0], prim[s + len0].lane) : 0), 0);
    const allowed = (q) => (fixedAt[q] !== null ? [fixedAt[q]] : [...Array(lanes).keys()]);
    // DP over (lane at q-1, lane at q)
    let dp = new Map();
    for (const l of allowed(0)) dp.set(`-1,${l}`, { c: entryCost(l) + occ.reduce((a, s) => a + (prim[s].lane !== l ? 0.01 : 0), 0), path: [l] });
    for (let q = 1; q < len0; q++) {
      const nd = new Map();
      for (const [key, v] of dp) {
        const [pl, l] = key.split(',').map(Number);
        for (const nl of allowed(q)) {
          // (a hair of cost for moving a note off its current key, so ties keep what's there)
          const c = v.c + stepCost(q, l, nl, pl) + occ.reduce((a, s) => a + (prim[s + q].lane !== nl ? 0.01 : 0), 0);
          const nk = `${l},${nl}`;
          const cur = nd.get(nk);
          if (!cur || c < cur.c - 1e-9) nd.set(nk, { c, path: [...v.path, nl] });
        }
      }
      dp = nd;
    }
    let best = null;
    for (const v of dp.values()) {
      const c = v.c + exitCost(v.path[len0 - 1]);
      if (!best || c < best.c - 1e-9) best = { c, path: v.path };
    }
    // the current keys, scored the same way (statement by statement)
    let now = 0;
    for (const s of occ) {
      for (let q = 1; q < len0; q++) {
        now += brk(q, prim[s + q - 1], prim[s + q - 1].lane, prim[s + q], prim[s + q].lane);
        if (q >= 2) now += soft(prim[s + q - 2], prim[s + q - 2].lane, prim[s + q], prim[s + q].lane);
      }
      if (s > 0) now += pairCost(prim[s - 1], prim[s - 1].lane, prim[s], prim[s].lane);
      if (s + len0 < n) now += pairCost(prim[s + len0 - 1], prim[s + len0 - 1].lane, prim[s + len0], prim[s + len0].lane);
    }
    for (const s of occ) for (let q = s; q < s + len0; q++) covered[q] = 1;
    if (!best || (!mismatch && best.c > now - 0.5)) continue;
    // ...and it has to take a break out of the middle of the phrase (fewer wrong-way / shared-key steps away from restarts)
    const breaks = (laneAt) => {
      let b = 0;
      for (const s of occ) {
        for (let q = 1; q < len0; q++) if (!(restart[q] && laneAt(s, q - 1) !== laneAt(s, q)) && pairCost(prim[s + q - 1], laneAt(s, q - 1), prim[s + q], laneAt(s, q)) >= 0.9) b++;
        if (s > 0 && pairCost(prim[s - 1], prim[s - 1].lane, prim[s], laneAt(s, 0)) >= 0.9) b++;
        if (s + len0 < n && pairCost(prim[s + len0 - 1], laneAt(s, len0 - 1), prim[s + len0], prim[s + len0].lane) >= 0.9) b++;
      }
      return b;
    };
    if (!mismatch && breaks((s, q) => best.path[q]) >= breaks((s, q) => prim[s + q].lane)) continue;
    for (const s of occ) for (let q = 0; q < len0; q++) {
      prim[s + q].lane = best.path[q];
      planned[s + q] = 1;
    }
    for (const s of occ) {
      // the few notes leading in (a pickup) and following on re-fit to the new keys
      const win = [];
      for (let k = s - 1; k >= 0 && win.length < 3 && prim[k + 1].time - prim[k].time < 0.7; k--) {
        if (prim[k].fixedLane || prim[k].altRun || prim[k].ghost || planned[k]) break;
        win.unshift(k);
      }
      if (win.length) {
        const pre = win[0] > 0 ? prim[win[0] - 1] : null;
        let dpL = new Map([[pre ? pre.lane : -1, { c: 0, path: [] }]]);
        let prevN = pre;
        for (const k of win) {
          const nd = new Map();
          for (let l = 0; l < lanes; l++) {
            let bestV = null;
            for (const [pl, v] of dpL) {
              const c = v.c + (prevN && pl >= 0 ? pairCost(prevN, pl, prim[k], l) : 0) + (l === prim[k].lane ? 0 : 0.01);
              if (!bestV || c < bestV.c - 1e-9) bestV = { c, path: [...v.path, l] };
            }
            nd.set(l, bestV);
          }
          dpL = nd;
          prevN = prim[k];
        }
        let fin = null;
        for (const [l, v] of dpL) {
          // (the phrase starts afresh on its first note, so a pickup climbing straight into it may land on the same key
          // as that first note, as for the restarts inside it: Ride 1:48 62 70 72 = D F J, then the phrase's J74)
          const e = pairCost(prim[win[win.length - 1]], l, prim[s], prim[s].lane);
          const c = v.c + (e > 0 && l === prim[s].lane ? 0.45 : e);
          if (!fin || c < fin.c - 1e-9) fin = { c, path: v.path };
        }
        win.forEach((k, j) => (prim[k].lane = fin.path[j]));
      }
      if (s + len0 < n && !planned[s + len0]) {
        replanAfter(prim, s + len0 - 1, lanes);
        // (a note a beat after the phrase, which the re-plan above doesn't reach, still shouldn't clash with its end)
        const lastN = prim[s + len0 - 1];
        const nx = prim[s + len0];
        const nx2 = s + len0 + 1 < n ? prim[s + len0 + 1] : null;
        if (!nx.fixedLane && !nx.altRun && !nx.ghost && pairCost(lastN, lastN.lane, nx, nx.lane) > 0) {
          let bl = nx.lane;
          let bc = 1e9;
          for (let l = 0; l < lanes; l++) {
            const c = pairCost(lastN, lastN.lane, nx, l) + (nx2 ? pairCost(nx, l, nx2, nx2.lane) : 0) + (l === nx.lane ? 0 : 0.01);
            if (c < bc - 1e-9) {
              bc = c;
              bl = l;
            }
          }
          nx.lane = bl;
        }
      }
    }
  }
}

/**
* The last note of a phrase (0.4s+ before the next note) that steps the wrong way from the note before it moves
 * to the nearest key that reads right (What We Do 0:54 & 1:00 flute: 76 79 81 = F J K, not F J F).
 */
function applyPhraseEndDirections(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  for (let k = 1; k < prim.length; k++) {
    const p = prim[k - 1];
    const x = prim[k];
    const nx = prim[k + 1];
    if (x.time - p.time >= 0.6 || (nx && nx.time - x.time < 0.4) || x.midi === p.midi) continue;
    // (a note that goes on repeating isn't a phrase end, and moving just its first strike would split the repeat
    // across two keys: Ride 0:10 80 79 77 77 77, 2:05 72 74 74 74)
    if (nx && nx.midi === x.midi && nx.time - x.time < 1.0) continue;
    if (x.fixedLane || x.localPin || x.ghost || x.altRun || x.isChordPartner) continue;
    const want = Math.sign(x.midi - p.midi);
    if (x.lane !== p.lane && Math.sign(x.lane - p.lane) === want) continue;
    const cands = [];
    for (let l = 0; l < lanes; l++) if (l !== p.lane && Math.sign(l - p.lane) === want) cands.push(l);
    if (!cands.length) continue;
    cands.sort((u, v) => Math.abs(u - x.lane) - Math.abs(v - x.lane));
    x.lane = cands[0];
  }
}

/**
 * Slow held lines: a chain of 3+ different notes, each held right up to the next (legato, the release within 0.25s of
 * the next attack), all moving one way, reads as one line even though the notes are far apart, so its keys walk the
 * same way (e.g. Guthix 2:22 alto flute 79 77 70 65 held = K J F D, not J F J F). The line takes consecutive keys,
 * placed so it joins the notes around it the right way, as close to its current keys as possible.
 */
function applyHeldLines(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const end = (x) => (x.endTime && x.endTime > x.time ? x.endTime : x.time);
  let a = 0;
  while (a < prim.length - 1) {
    const dir = Math.sign(prim[a + 1].midi - prim[a].midi);
    let b = a;
    while (
      b + 1 < prim.length &&
      dir !== 0 &&
      prim[b].type === 'hold' &&
      prim[b + 1].time - prim[b].time >= 0.5 &&
      Math.abs(prim[b + 1].time - end(prim[b])) <= 0.25 &&
      Math.sign(prim[b + 1].midi - prim[b].midi) === dir
    )
      b++;
    // (a short last note that kicks off a quick figure belongs to that figure, e.g. Sevens 2:35's riff 75 68 68 75)
    if (b > a && prim[b].type !== 'hold' && b + 1 < prim.length && prim[b + 1].time - prim[b].time < 0.3) b--;
    const len = b - a + 1;
    const line = prim.slice(a, b + 1);
    // (one note longer than the keys, landing on a long final hold: the walk takes every key from the edge it's heading
    // away from and the landing wraps, e.g. Arabesque 5:45's low walk-down 48 46 45 42 + held 41 = K J F D + K; a leap
    // over an octave into the walk is a different voice handing over, so the walk counts from there. The note before
    // it, if it sits on the walk's first key, moves one key over so that key isn't struck twice for two notes.)
    let w0 = 0;
    for (let q = 1; q < len; q++) if (Math.abs(line[q].midi - line[q - 1].midi) > 12) w0 = q;
    const walk = line.slice(w0);
    if (
      walk.length === lanes + 1 &&
      walk[lanes].type === 'hold' &&
      end(walk[lanes]) - walk[lanes].time >= 1.5 &&
      !walk.some((x) => x.fixedLane || x.localPin || x.ghost || x.altRun)
    ) {
      const ls = walk.map((_, q) => (dir > 0 ? q % lanes : lanes - 1 - (q % lanes)));
      const okW = walk.every((x, q) => q === 0 || Math.sign(x.lane - walk[q - 1].lane) === dir || (q === lanes && x.lane === ls[q]));
      if (!okW) {
        walk.forEach((x, q) => (x.lane = ls[q]));
        const bf = a + w0 > 0 ? prim[a + w0 - 1] : null;
        if (bf && !bf.fixedLane && !bf.localPin && bf.lane === ls[0] && bf.midi !== walk[0].midi && walk[0].time - end(bf) < 0.25) {
          // the note before (and the climb or fall it ends, if it's one: consecutive keys, one way) shifts one key away
          // from the walk's first key, keeping its own shape (Arabesque 5:38: the trumpets' held 81 82 84 on F J K
          // move to D F J so the walk can start on K)
          let r0 = a + w0 - 1;
          while (
            r0 > 0 &&
            !prim[r0 - 1].fixedLane &&
            !prim[r0 - 1].localPin &&
            Math.abs(prim[r0].lane - prim[r0 - 1].lane) === 1 &&
            Math.sign(prim[r0].lane - prim[r0 - 1].lane) === Math.sign(prim[r0].midi - prim[r0 - 1].midi) &&
            Math.abs(prim[r0].midi - prim[r0 - 1].midi) <= 12 &&
            prim[r0].time - end(prim[r0 - 1]) < 0.3
          )
            r0--;
          const run = prim.slice(r0, a + w0);
          const step = ls[0] === lanes - 1 ? -1 : 1;
          const pre = r0 > 0 ? prim[r0 - 1] : null;
          const fits = run.every((x) => x.lane + step >= 0 && x.lane + step < lanes) && !(pre && pre.lane === run[0].lane + step && pre.midi !== run[0].midi && run[0].time - end(pre) < 0.3);
          if (fits) run.forEach((x) => (x.lane += step));
        }
      }
    }
    if (len >= 3 && len <= lanes && !line.some((x) => x.fixedLane || x.localPin || x.ghost || x.altRun)) {
      // (a re-anchor, top key -> bottom key on a climb or bottom -> top on a fall, is the normal way a line continues)
      const reAnchor = (la, lb) => (dir > 0 && la === lanes - 1 && lb === 0) || (dir < 0 && la === 0 && lb === lanes - 1);
      const ok = line.every((x, q) => q === 0 || Math.sign(x.lane - line[q - 1].lane) === dir || reAnchor(line[q - 1].lane, x.lane));
      if (!ok) {
        const before = a > 0 ? prim[a - 1] : null;
        const after = b + 1 < prim.length ? prim[b + 1] : null;
        const joins = (x, lx, y, ly) =>
          !x || !y || y.time - end(x) > 0.6 || x.midi === y.midi ? 0 : ly === lx ? 1.5 : Math.sign(ly - lx) === Math.sign(y.midi - x.midi) ? 0 : 1;
        let best = null;
        let bestCost = Infinity;
        for (let s0 = 0; s0 + len <= lanes; s0++) {
          const ls = line.map((_, q) => (dir > 0 ? s0 + q : s0 + len - 1 - q));
          const cost =
            10 * (joins(before, before && before.lane, line[0], ls[0]) + joins(line[len - 1], ls[len - 1], after, after && after.lane)) +
            line.reduce((acc, x, q) => acc + (x.lane === ls[q] ? 0 : 1), 0);
          if (cost < bestCost) {
            bestCost = cost;
            best = ls;
          }
        }
        // only when the line can join the notes around it cleanly (else keep what the earlier rules worked out)
        const bestJoins = joins(before, before && before.lane, line[0], best[0]) + joins(line[len - 1], best[len - 1], after, after && after.lane);
        // ...and never splits a note from the same pitch played again moment later (same notes, same keys: e.g.
        // Arabesque 5:31's 82 79 66 is followed by 67 66, so the 66 keeps the key it shares with the next 66)
        const splitsRepeat = line.some((x, q) =>
          prim.some((y) => !line.includes(y) && y.midi === x.midi && Math.abs(y.time - x.time) <= 2.0 && y.lane === x.lane && y.lane !== best[q])
        );
        if (bestJoins === 0 && !splitsRepeat) line.forEach((x, q) => (x.lane = best[q]));
      }
    }
    a = Math.max(a + 1, b);
  }
}

/**
 * Flurries turn cleanly: in a flurry of quick runs going up and down (16+ notes, each 0.12s or less after the last, steps
 * of a major 3rd or less, 3+ turnarounds, runs of 4+ notes, gaps of 0.2s or less), every run cycles through the keys
 * its way (the S / L ghost keys count as a fifth key at either end), and every
 * turnaround steps just one key the new way -- never a wrap (K->D, D->K) on the two notes either side of a turn, which
 * is what makes a K D K so hard to read at speed. A run may end on (or start from) a ghost key to make its turn
 * (Arabesque 2:30: 8 down, 9 up, 7 down, 9 up, 7 down, 8 up = K J F D K J F D | F J K L D F J K L | ...).
 */
function applyFlurryTurns(notes, lanes) {
  const S = lanes;
  const L = lanes + 1;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  const n = prim.length;
  const pos = (l) => (l === S ? -1 : l === L ? lanes : l);
  let a = 0;
  while (a < n - 1) {
    let b = a;
    while (b + 1 < n && prim[b + 1].time - prim[b].time <= 0.2 && prim[b + 1].midi !== prim[b].midi && Math.abs(prim[b + 1].midi - prim[b].midi) <= 4) b++;
    const fl = prim.slice(a, b + 1);
    const m = fl.length;
    // runs: split where the direction turns
    const dirs = fl.map((x, q) => (q ? Math.sign(x.midi - fl[q - 1].midi) : 0));
    const runStart = fl.map((_, q) => q === 0 || (q > 1 && dirs[q] !== dirs[q - 1]));
    const starts = runStart.reduce((acc, v, q) => (v ? [...acc, q] : acc), []);
    const lens = starts.map((s0, k) => (k + 1 < starts.length ? starts[k + 1] : m) - s0);
    if (m >= 16 && starts.length >= 4 && lens.slice(1, -1).every((l) => l >= 4) && !fl.some((x) => x.fixedLane || x.localPin || x.type === 'hold' && x !== fl[m - 1])) {
      const runOf = fl.map((_, q) => starts.filter((s0) => s0 <= q).length - 1);
      const idxIn = fl.map((_, q) => q - starts[runOf[q]]);
      const lenOf = (q) => lens[runOf[q]];
      const edge = (q) => idxIn[q] === 0 || idxIn[q] === lenOf(q) - 1;
      const near = (q) => idxIn[q] <= 1 || idxIn[q] >= lenOf(q) - 2;
      const opts = () => [0, 1, 2, 3, S, L];
      const step = (q, la, lb) => {
        const d = Math.sign(fl[q].midi - fl[q - 1].midi);
        const pa = pos(la);
        const pb = pos(lb);
        if (pa === pb) return 10;
        if (Math.sign(pb - pa) === d) return Math.abs(pb - pa) === 1 ? 0 : 2 * (Math.abs(pb - pa) - 1);
        // (a wrap: from the top -- K or the L ghost -- back to D on a climb, from the bottom -- D or the S ghost -- back to
        // K on a fall)
        const wrap = (d > 0 && pa >= lanes - 1 && pb === 0) || (d < 0 && pa <= 0 && pb === lanes - 1);
        if (wrap) return near(q) || near(q - 1) ? 6 : 0.5;
        return 10;
      };
      // DP over the flurry; the note before it joins as usual, ghost keys cost a little
      const before = a > 0 && fl[0].time - prim[a - 1].time < 0.6 ? prim[a - 1] : null;
      let dp = new Map();
      for (const l of opts(0)) {
        let c = (l >= lanes ? 0.3 : 0) + (l === fl[0].lane ? 0 : 0.05);
        if (before) {
          const d = Math.sign(fl[0].midi - before.midi);
          const pd = pos(l) - pos(before.lane);
          c += !d ? (pd ? 1 : 0) : pd === 0 ? 3 : Math.sign(pd) === d ? 0 : 1;
        }
        dp.set(l, { c, path: [l] });
      }
      for (let q = 1; q < m; q++) {
        const nd = new Map();
        for (const l of opts(q)) {
          let best = null;
          for (const [pl, v] of dp) {
            const c = v.c + step(q, pl, l) + (l >= lanes ? 0.3 : 0) + (l === fl[q].lane ? 0 : 0.05);
            if (!best || c < best.c) best = { c, path: v.path };
          }
          nd.set(l, { c: best.c, path: [...best.path, l] });
        }
        dp = nd;
      }
      const best = [...dp.values()].reduce((x, y) => (y.c < x.c ? y : x));
      fl.forEach((x, q) => {
        const l = best.path[q];
        x.lane = l;
        if (l >= lanes) x.ghost = l === S ? 'S' : 'L';
        else delete x.ghost;
      });
    }
    a = Math.max(a + 1, b);
  }
}

/**
 * A walk off a ghost key: when a run finishes on a ghost key (S below D, L above K) and the line then walks straight
 * back the other way -- 3 or 4 notes stepping one way (a 3rd or less each, under 0.7s apart) -- the walk starts on the
 * key next to the ghost and takes the next key each step (Ride 1:21: S61, then the walk-up 71 73 75 77 = D F J K).
 */
function applyWalkOffGhost(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  for (let k = 0; k + 3 < prim.length; k++) {
    const g = prim[k];
    if (!g.ghost) continue;
    const dir = g.ghost === 'S' ? 1 : -1;
    let m = 0;
    while (
      m < 4 && k + m + 1 < prim.length &&
      !prim[k + m + 1].ghost && !prim[k + m + 1].fixedLane && !prim[k + m + 1].localPin &&
      Math.sign(prim[k + m + 1].midi - (m ? prim[k + m].midi : g.midi)) === dir &&
      (m === 0 || Math.abs(prim[k + m + 1].midi - prim[k + m].midi) <= 4) &&
      prim[k + m + 1].time - prim[k + m].time < 0.7
    )
      m++;
    if (m < 3) continue;
    for (let q = 1; q <= m; q++) prim[k + q].lane = dir > 0 ? q - 1 : lanes - q;
    k += m;
  }
}

/**
 * A turn with a note beyond it keeps the edge key free: a neighbour turn x y x (in its own time, up to 0.8s) that the line
 * then passes going up (the next note goes above y, within 0.8s) sits on F J F so the next note can take the K, and the line rising into the turn steps up to it from below -- D F J, then the reset to F (Ride
 * 2:00: 67 70 72 74 75 74 77 = D F J F J F K; a J K J turn would leave the 77 on the 75's key).
 */
function applyTurnRoomBeyond(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const locked = (q) => q.fixedLane || q.altRun || q.localPin || q.ghost;
  const templates = [];
  for (let k = 1; k + 2 < prim.length; k++) {
    const x = prim[k - 1];
    const y = prim[k];
    const z = prim[k + 1];
    const n1 = prim[k + 2];
    if (x.midi !== z.midi || y.midi === x.midi || Math.abs(y.midi - x.midi) > 2) continue;
    if (z.time - x.time >= 0.8 || n1.time - z.time >= 0.8) continue;
    const up = y.midi > x.midi;
    // (an upper-neighbour turn on a rising line only: going down, the line has room on its own)
    if (!up) continue;
    const beyond = n1.midi > y.midi;
    if ([x, y, z].some(locked) || (beyond && locked(n1))) continue;
    const edge = up ? lanes - 1 : 0;
    // only when the turn as laid out leaves no room: its far note already sits on the edge key
    if (y.lane !== edge) continue;
    const xl = up ? 1 : lanes - 2;
    const yl = up ? 2 : lanes - 3;
    // the line rising (falling) into the turn: up to 3 notes stepping the same way, under 0.8s apart
    const lead = [];
    for (let b = k - 2; b >= 0 && lead.length < 3; b--) {
      const nb = prim[b + 1];
      const q = prim[b];
      if (locked(q) || nb.time - q.time >= 0.8 || Math.sign(nb.midi - q.midi) !== (up ? 1 : -1)) break;
      lead.push(q);
    }
    if (!lead.length) continue;
    // (it re-lays when the next note passes the turn, or when the line rising into it already steps the wrong way)
    const seq = [...lead].reverse().concat([x]);
    // (a one-key bounce the wrong way, J -> F on a rising step: the worst-reading kind)
    const wrongWay = seq.some((q, j) => j > 0 && Math.abs(q.lane - seq[j - 1].lane) === 1 && Math.sign(q.lane - seq[j - 1].lane) !== Math.sign(q.midi - seq[j - 1].midi));
    // (...the latter only for a turn in its own slow time, 0.45s+ across -- quick turns are ornaments in their line)
    if (!beyond && !(wrongWay && z.time - x.time >= 0.45)) continue;
    // (a turn the line then falls away from -- two more notes going down -- keeps J K J, room for the fall below it;
    // the climb into it steps F, D, then wraps from K for a third note when the note before that is lower: Ride 1:48.6,
    // 67 69 70 72 74 75 74 70 67 = F K D F J K J F D, not the F J F turn that would leave 74 70 on one key)
    const n2 = prim[k + 3];
    const falls = !beyond && n1.midi < x.midi && n2 && n2.midi < n1.midi && n2.time - n1.time < 0.8;
    if (falls) {
      const lanesF = [1, 0, lanes - 1].slice(0, lead.length);
      const top = lead[lead.length - 1];
      const before = prim[prim.indexOf(top) - 1];
      if (lead.length === 3 && !(before && before.midi < top.midi && !locked(before))) continue;
      x.lane = lanes - 2;
      y.lane = lanes - 1;
      z.lane = lanes - 2;
      lead.forEach((q, j) => (q.lane = lanesF[j]));
      continue;
    }
    x.lane = xl;
    y.lane = yl;
    z.lane = xl;
    if (beyond) n1.lane = edge;
    lead.forEach((q, j) => (q.lane = up ? lanes - 2 - j : 1 + j));
    templates.push({ tpl: [...lead].reverse().concat([x, y, z]).map((q) => [q.midi, q.lane]), nextUp: n1.midi > z.midi });
  }
  // (same notes, same keys: other statements of the re-laid phrase -- its first 5+ notes, the same pitches in a row,
  // under 0.8s apart -- take its keys, e.g. Ride 1:51 and the sax lick at 1:52.9 copy 2:00's D F J F J F)
  for (const { tpl, nextUp } of templates) {
    for (let s0 = 0; s0 + 4 < prim.length; s0++) {
      let m = 0;
      while (m < tpl.length && s0 + m < prim.length && prim[s0 + m].midi === tpl[m][0] && !locked(prim[s0 + m]) &&
        (m === 0 || prim[s0 + m].time - prim[s0 + m - 1].time < 0.8)) m++;
      if (m < 5) continue;
      // (only where the phrase carries on the same way after: a copy that then falls away needs its own layout)
      const after = prim[s0 + m];
      if (m === tpl.length && after && after.time - prim[s0 + m - 1].time < 0.8 && (after.midi > prim[s0 + m - 1].midi) !== nextUp) continue;
      const after2 = prim[s0 + m + 1];
      if (m === tpl.length && after && after2 && after.midi < prim[s0 + m - 1].midi && after2.midi < after.midi && after2.time - after.time < 0.8) continue;
      for (let q = 0; q < m; q++) prim[s0 + q].lane = tpl[q][1];
      s0 += m - 1;
    }
  }
}

/**
 * Six-note rips (Hard): a quick rip of exactly six different notes going one way -- five quick steps (0.12s or less)
 * then a last step of a whole tone or less within 0.45s onto a note that rings -- uses both ghost keys: S D F J K L (Ride
 * 3:02: 62 63 65 67 69 -> 70 held).
 */
function applySixNoteRips(notes, lanes) {
  const S = lanes;
  const L = lanes + 1;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  for (let a = 0; a + 5 < prim.length; a++) {
    const run = prim.slice(a, a + 6);
    // (rips go up: a six-note fall keeps its own layout, e.g. Arabesque 0:40's flute sequence)
    const dir = Math.sign(run[1].midi - run[0].midi);
    if (dir <= 0) continue;
    const ok = run.every((x, j) => j === 0 || (Math.sign(x.midi - run[j - 1].midi) === dir && Math.abs(x.midi - run[j - 1].midi) <= 4 &&
      x.time - run[j - 1].time <= (j < 5 ? 0.12 : 0.45))) && Math.abs(run[5].midi - run[4].midi) <= 2;
    // (a rip up to a note that rings: 0.25s+ before the next note)
    const ringing = !prim[a + 6] || prim[a + 6].time - run[5].time >= 0.25;
    if (!ok || !ringing || run.some((x) => x.fixedLane || x.localPin)) continue;
    // (exactly six: not part of a longer run)
    const pv = prim[a - 1];
    const nx = prim[a + 6];
    if (pv && Math.sign(run[0].midi - pv.midi) === dir && run[0].time - pv.time <= 0.12) continue;
    if (nx && Math.sign(nx.midi - run[5].midi) === dir && nx.time - run[5].time <= 0.12) continue;
    const seq = dir > 0 ? [S, 0, 1, 2, 3, L] : [L, 3, 2, 1, 0, S];
    run.forEach((x, j) => {
      x.lane = seq[j];
      if (seq[j] >= lanes) x.ghost = seq[j] === S ? 'S' : 'L';
      else delete x.ghost;
    });
    a += 5;
  }
}

/**
 * Quick runs cycle cleanly: a quick run going one way (6+ notes, each 0.25s or less after the last, steps of a major 3rd
 * or less, no ghost or pinned notes) whose keys step the wrong way or repeat a key somewhere inside is laid out as a clean
 * cycle instead (each note the next key its way, wrapping at the edge: D F J K D F J K), turned so it joins the notes
 * before and after it best (Ride 0:27: D70 F72 J73 K75 J77 K78 -> J K D F J K). A run laid out as a repeating key
 * pattern (a sequence: J F D | J F D) keeps it.
 */
function applyCleanRunCycles(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  const n = prim.length;
  const bad = (a, la, b, lb) => {
    if (b.time - a.time >= 0.6 || a.lane >= lanes || b.lane >= lanes) return 0;
    if (a.midi === b.midi) return la === lb ? 0 : 1;
    if (la === lb) return 1.5;
    if (Math.sign(b.midi - a.midi) === Math.sign(lb - la)) return Math.abs(lb - la) > 1 && Math.abs(b.midi - a.midi) <= 2 ? 0.3 : 0;
    const wrap = (b.midi > a.midi && la === lanes - 1 && lb === 0) || (b.midi < a.midi && la === 0 && lb === lanes - 1);
    return wrap ? 0.2 : 1;
  };
  let i = 0;
  while (i < n - 1) {
    const dir = Math.sign(prim[i + 1].midi - prim[i].midi);
    let j = i;
    while (
      j + 1 < n && dir &&
      Math.sign(prim[j + 1].midi - prim[j].midi) === dir &&
      Math.abs(prim[j + 1].midi - prim[j].midi) <= 4 &&
      prim[j + 1].time - prim[j].time <= 0.25
    )
      j++;
    const run = prim.slice(i, j + 1);
    if (run.length >= 6 && !run.some((x) => x.ghost || x.fixedLane || x.localPin || x.altRun || x.lane >= lanes)) {
      const inside = run.reduce((acc, x, q) => acc + (q ? bad(run[q - 1], run[q - 1].lane, x, x.lane) : 0), 0);
      // (a run already laid out as a repeating key pattern -- a sequence, e.g. Arabesque 1:57 / 0:40's flute falls
      // 80 79 77 | 76 73 72 = J F D | J F D -- keeps it: each group restarts on the same key)
      const periodic = [2, 3].some((p) => run.length >= 2 * p && run.every((x, q) => q < p || x.lane === run[q - p].lane) && run.slice(0, p).every((x, q) => q === 0 || Math.sign(x.lane - run[q - 1].lane) === dir));
      if (inside > 0.25 && !periodic) {
        const pv = i > 0 ? prim[i - 1] : null;
        const nx = j + 1 < n ? prim[j + 1] : null;
        const cost = (ls) =>
          (pv ? bad(pv, pv.lane, run[0], ls[0]) : 0) +
          ls.reduce((acc, l, q) => acc + (q ? bad(run[q - 1], ls[q - 1], run[q], l) : 0), 0) +
          (nx ? bad(run[run.length - 1], ls[ls.length - 1], nx, nx.lane) : 0) +
          0.01 * ls.reduce((acc, l, q) => acc + (l === run[q].lane ? 0 : 1), 0);
        let best = null;
        for (let s0 = 0; s0 < lanes; s0++) {
          // (the run's last note may step off the cycle: it's where the next phrase takes over)
          for (let ll = 0; ll < lanes; ll++) {
            const ls = run.map((_, q) => (((s0 + dir * q) % lanes) + lanes) % lanes);
            const onCycle = ls[ls.length - 1] === ll;
            ls[ls.length - 1] = ll;
            const c = cost(ls) + (onCycle ? 0 : 0.05);
            if (!best || c < best.c) best = { c, ls };
          }
        }
        const now = cost(run.map((x) => x.lane));
        if (best.c < now - 0.1) run.forEach((x, q) => (x.lane = best.ls[q]));
      }
    }
    i = Math.max(i + 1, j);
  }
}

/**
 * A half-step neighbour never jumps across the keyboard: a note a half step from the note just before it (0.4s or less
 * apart) that sits on the far edge key from it (K -> D or D -> K) moves to the key next door, as long as that doesn't
 * put it on the same key as the next note or make the next step go the wrong way (Arabesque 0:37: K85, then the 84
 * hold on D -> J).
 */
function applyHalfStepNoLeap(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const end = (x) => (x.endTime && x.endTime > x.time ? x.endTime : x.time);
  for (let i = 1; i < prim.length; i++) {
    const a = prim[i - 1];
    const b = prim[i];
    if (b.fixedLane || b.localPin || b.ghost || Math.abs(b.midi - a.midi) !== 1 || b.time - a.time > 0.4) continue;
    if (Math.abs(b.lane - a.lane) !== lanes - 1) continue;
    const nl = a.lane + Math.sign(b.midi - a.midi);
    if (nl < 0 || nl >= lanes) continue;
    const c = i + 1 < prim.length && prim[i + 1].time - end(b) < 0.6 ? prim[i + 1] : null;
    if (c && c.midi !== b.midi && c.lane === nl) continue;
    if (c && c.midi === b.midi && c.lane === b.lane) continue; // (same note again next: it keeps its key)
    if (c && c.midi !== b.midi && c.lane < lanes && Math.sign(c.lane - nl) !== Math.sign(c.midi - b.midi)) continue;
    b.lane = nl;
  }
}

/**
 * No skipped key after a turn: when a quick run climbs (or falls) out of a neighbour turn (X Y X, kept on the same keys)
 * and its first step out jumps two keys, the rest of the run (4+ notes, 0.15s or less apart, small steps, one way)
 * shifts back one key so every step takes the next key (Arabesque 4:45: 62 63 66 67 69 = D F K D F -> D F J K D, after a turn put both 63s on F).
 */
function applyRunSkipClose(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const locked = (x) => x.fixedLane || x.localPin || x.ghost;
  for (let i = 1; i + 1 < prim.length; i++) {
    const a = prim[i - 1];
    const b = prim[i];
    const dm = Math.sign(b.midi - a.midi);
    if (!dm || Math.abs(b.midi - a.midi) > 4 || b.time - a.time > 0.15 || b.lane - a.lane !== 2 * dm) continue;
    // (only right after a neighbour turn, X Y X, whose same-notes-same-keys layout left the climb a key behind)
    if (i < 3 || prim[i - 3].midi !== a.midi || prim[i - 3].lane !== a.lane || a.time - prim[i - 3].time > 0.3) continue;
    // the rest of the run: same direction, quick, small steps
    let j = i;
    while (j + 1 < prim.length && Math.sign(prim[j + 1].midi - prim[j].midi) === dm && Math.abs(prim[j + 1].midi - prim[j].midi) <= 4 && prim[j + 1].time - prim[j].time <= 0.15) j++;
    const rest = prim.slice(i, j + 1);
    if (rest.length < 4 || rest.some(locked)) continue;
    rest.forEach((x) => (x.lane = (x.lane - dm + lanes) % lanes));
    i = j;
  }
}

/**
 * Close the gap instead of doubling up: when two different notes land on the same key back to back, and the notes
 * leading into the first of them step one key at a time from a spot where the line skipped a key, that stretch shifts
 * one key toward the skipped key (Arabesque 5:36: horns 63 62 60 then the trumpets' 81 = K F D D -> K J F D). Notes of
 * the same pitch just before the stretch (within 2s, on the old key) move with it, so the same notes keep the same keys.
 */
function applyGapShiftDoubles(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const end = (x) => (x.endTime && x.endTime > x.time ? x.endTime : x.time);
  const locked = (x) => x.fixedLane || x.localPin || x.ghost;
  for (let i = 1; i + 1 < prim.length; i++) {
    const p = prim[i];
    const q = prim[i + 1];
    if (p.lane !== q.lane || p.midi === q.midi || q.time - end(p) > 0.8) continue;
    // walk back over single-key steps (one way) to the skipped key
    let j = i;
    let d = 0;
    while (j > 0) {
      const dl = prim[j - 1].lane - prim[j].lane;
      if (Math.abs(dl) !== 1 || (d && Math.sign(dl) !== d) || prim[j].time - end(prim[j - 1]) > 0.8) break;
      d = Math.sign(dl);
      j--;
    }
    if (!d || j === 0) continue;
    const dg = prim[j - 1].lane - prim[j].lane;
    if (dg !== 2 * d || prim[j].time - end(prim[j - 1]) > 0.8) continue;
    const seg = prim.slice(j, i + 1);
    if (seg.some(locked)) continue;
    const moved = new Map(seg.map((x) => [x, x.lane]));
    // same pitch just before the stretch, on the old key, comes along
    for (let k = j - 1; k >= 0 && seg[0].time - prim[k].time <= 2.0; k--) {
      const twin = seg.find((x) => x.midi === prim[k].midi && moved.get(x) === prim[k].lane);
      if (twin && !locked(prim[k])) moved.set(prim[k], prim[k].lane);
    }
    for (const x of moved.keys()) x.lane += d;
  }
}

/**
 * Repeated slow phrases (held-key families): a slow singing phrase (2+ held notes, each 0.45s+, legato into the next,
 * no leap over an octave) that comes back within a few bars plays on the same keys every time, e.g. Guthix's Choir
 * 67 69 70 67 69 (otherwise the layout drifts: 67 on F, then D, then J). Phrases that share pitches form a family; if
 * the family fits on the keys (one key per pitch, low to high) and isn't already consistent, every phrase in it takes
 * one shared key map: the one whose joins to the notes around the phrases read best (a wrong-way step costs 1, a
 * different note on the same key 1.5), then the fewest moved notes, then the lowest keys.
 */
function applyHeldKeyFamilies(notes, lanes, chordHits = []) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const WIN = 15;
  const end = (x) => (x.endTime && x.endTime > x.time ? x.endTime : x.time);
  const ok = (x) => x.type === 'hold' && end(x) - x.time >= 0.45 && !x.fixedLane && !x.localPin && !x.ghost && !x.altRun;
  // phrases: index ranges [a, b] into prim
  const phrases = [];
  let a = 0;
  while (a < prim.length) {
    if (!ok(prim[a])) {
      a++;
      continue;
    }
    let b = a;
    while (
      b + 1 < prim.length &&
      ok(prim[b + 1]) &&
      Math.abs(prim[b + 1].time - end(prim[b])) <= 0.25 &&
      Math.abs(prim[b + 1].midi - prim[b].midi) <= 12
    )
      b++;
    if (b > a) phrases.push([a, b]);
    a = b + 1;
  }
  // families: phrases sharing a pitch, each starting within WIN of the family's last phrase
  const fams = [];
  for (const ph of phrases) {
    const ps = new Set(prim.slice(ph[0], ph[1] + 1).map((x) => x.midi));
    // (a phrase joins a family only as the same tune coming back, whole or in part: its pitches all belong to the
    // family's, or the family's all to it; e.g. Guthix 1:57's alto flute line, which shares a 67, starts its own)
    const f = fams.find(
      (F) => prim[ph[0]].time - F.last <= WIN && ([...ps].every((m) => F.pitches.has(m)) || [...F.pitches].every((m) => ps.has(m)))
    );
    if (f) {
      f.phrases.push(ph);
      ps.forEach((m) => f.pitches.add(m));
      f.last = end(prim[ph[1]]);
    } else fams.push({ phrases: [ph], pitches: ps, last: end(prim[ph[1]]) });
  }
  const isChord = (x) => chordHits.some((h) => Math.abs(h[0] - x.time) < 0.03);
  const joinCost = (x, lx, y, ly) =>
    !x || !y || y.time - end(x) > 0.6 ? 0 : x.midi === y.midi ? (lx === ly ? 0 : 1.5) : lx === ly ? 1.5 : Math.sign(ly - lx) === Math.sign(y.midi - x.midi) ? 0 : 1;
  for (const F of fams) {
    if (F.phrases.length < 2) continue;
    // (only a phrase that really comes back: two of its phrases play the same 3+ notes in the same order)
    const seqs = F.phrases.filter(([p, q]) => q - p >= 2).map(([p, q]) => prim.slice(p, q + 1).map((x) => x.midi).join(','));
    if (new Set(seqs).size === seqs.length) continue;
    const pitches = [...F.pitches].sort((u, v) => u - v);
    const n = pitches.length;
    if (n > lanes) continue;
    const members = F.phrases.flatMap(([p, q]) => prim.slice(p, q + 1));
    const seen = new Map();
    let consistent = true;
    for (const x of members) {
      if (seen.has(x.midi) && seen.get(x.midi) !== x.lane) consistent = false;
      seen.set(x.midi, x.lane);
    }
    const order = pitches.map((m) => seen.get(m));
    if (consistent && order.every((l, k) => k === 0 || l > order[k - 1])) continue;
    let best = null;
    let bestCost = Infinity;
    for (let s0 = 0; s0 + n <= lanes; s0++) {
      const map = new Map(pitches.map((m, k) => [m, s0 + k]));
      let cost = 0;
      for (const [p, q] of F.phrases) {
        const before = p > 0 ? prim[p - 1] : null;
        const after = q + 1 < prim.length ? prim[q + 1] : null;
        cost += 10 * (joinCost(before, before && before.lane, prim[p], map.get(prim[p].midi)) + joinCost(prim[q], map.get(prim[q].midi), after, after && after.lane));
        for (let k = p; k <= q; k++) {
          cost += prim[k].lane === map.get(prim[k].midi) ? 0 : 0.1;
          // a chord the melody climbs into needs a key above it so the pair can climb too: on the top key its partner
          // would have to sit below, and the chord would look the same as the one before (counts as a wrong-way step)
          if (k > p && prim[k].midi > prim[k - 1].midi && map.get(prim[k].midi) === lanes - 1 && isChord(prim[k]) && isChord(prim[k - 1])) cost += 10;
        }
      }
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        best = map;
      }
    }
    for (const x of members) x.lane = best.get(x.midi);
    F.applied = true;
  }
  // Shorter chord phrases in the same passage that move the same way as part of a family's phrase (same ups and downs,
  // note for note) take that part's keys, e.g. Guthix 1:36's 65 66 climbs like the Choir's 67 69 -> D F, and 3:05's
  // 70 65 66 like 70 67 69 -> J D F. Only if every note is a chord, and no join to the notes around goes from clean to bad.
  const templates = fams.filter((F) => F.applied).flatMap((F) => F.phrases.map((ph) => [ph[0], ph[1], F]));
  const inApplied = new Set(templates.flatMap(([p, q]) => prim.slice(p, q + 1)));
  const signs = (p, q) => prim.slice(p + 1, q + 1).map((x, k) => Math.sign(x.midi - prim[p + k].midi)).join(',');
  for (const [p, q] of phrases) {
    if (inApplied.has(prim[p]) || !prim.slice(p, q + 1).every(isChord)) continue;
    const len = q - p + 1;
    const sig = signs(p, q);
    const tpl = templates
      // (any phrase of a family still going: its last phrase ended within WIN of this one)
      .filter(([tp, tq, TF]) => tq < p && TF.phrases.some(([, fq]) => fq < p && prim[p].time - end(prim[fq]) <= WIN) && tq - tp + 1 >= len)
      .sort((u, v) => v[0] - u[0])[0];
    if (!tpl) continue;
    let w = -1;
    for (let k = tpl[0]; k + len - 1 <= tpl[1]; k++) if (signs(k, k + len - 1) === sig && prim.slice(k, k + len).every(isChord)) { w = k; break; }
    if (w < 0) continue;
    const L = prim.slice(w, w + len).map((x) => x.lane);
    const before = p > 0 ? prim[p - 1] : null;
    const after = q + 1 < prim.length ? prim[q + 1] : null;
    // (a note with its own fixed key, e.g. a fill's last tap, doesn't hold the phrase back: the family itself joins it
    // the same way)
    const worse = (c0, c1) => c0 === 0 && c1 > 0;
    const free = (x) => x && !x.fixedLane;
    if (free(before) && worse(joinCost(before, before.lane, prim[p], prim[p].lane), joinCost(before, before.lane, prim[p], L[0]))) continue;
    if (free(after) && worse(joinCost(prim[q], prim[q].lane, after, after.lane), joinCost(prim[q], L[len - 1], after, after.lane))) continue;
    if (L.some((l, k) => k > 0 && (l === L[k - 1] || Math.sign(l - L[k - 1]) !== Math.sign(prim[p + k].midi - prim[p + k - 1].midi)))) continue;
    prim.slice(p, q + 1).forEach((x, k) => (x.lane = L[k]));
  }
}

/**
 * Quick neighbour turns (x y x within 0.4s, y a step away, e.g. Arabesque 1:57 79 80 79, 1:28 77 76 77): both x's
 * play one key and y the key right next to it on its side, then the notes after the turn are re-planned from there.
 * (Otherwise the same pitch can land on two keys a split second apart: F79 K80 J79.)
 */
function applyNeighbourTurns(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  for (let k = 1; k + 1 < prim.length; k++) {
    const x = prim[k - 1];
    const y = prim[k];
    const z = prim[k + 1];
    // a neighbour note between two strikes already on one key sits right next to them, not a key further out (Ride 1:32
    // 74 75 74 = F J F; Sevens' riff 79 77 79 = J F J every time, even when a statement swings a little slower)
    if (x.midi === z.midi && y.midi !== x.midi && Math.abs(y.midi - x.midi) <= 2 && z.time - x.time < 0.5 && z.lane === x.lane &&
        Math.abs(y.lane - x.lane) > 1 && Math.sign(y.lane - x.lane) === Math.sign(y.midi - x.midi) && !y.fixedLane && !y.localPin && !y.altRun) {
      y.lane = x.lane + Math.sign(y.midi - x.midi);
      continue;
    }
    if (x.midi !== z.midi || y.midi === x.midi || Math.abs(y.midi - x.midi) > 2 || z.time - x.time >= 0.4) continue;
    if ([x, y, z].some((q) => q.fixedLane || q.altRun || q.localPin)) continue;
    const w = k > 1 && x.time - prim[k - 2].time < 0.6 ? prim[k - 2] : null;
    const nx = k + 2 < prim.length && prim[k + 2].time - z.time < 0.6 ? prim[k + 2] : null;
    const dir = Math.sign(y.midi - x.midi);
    // A turn starting on an edge key whose line then carries on past that edge (Arabesque 4:20 & 4:22: 81 81 82 81 -> 79):
    // move the turn (and the repeats leading into it) one key inward (F F J F D), or, if the note before sits on that
    // inner key itself, open the turn out from the edge (D D J F D)
    const edge = x.lane === 0 ? 1 : x.lane === lanes - 1 ? lanes - 2 : null;
    const past = nx && ((x.lane === 0 && nx.midi < x.midi) || (x.lane === lanes - 1 && nx.midi > x.midi));
    const turnsIn = edge !== null && edge + dir >= 0 && edge + dir < lanes && edge + dir !== edge && (dir > 0) === (x.lane === 0);
    if (z.lane === x.lane || (past && turnsIn)) {
      // (otherwise already one key for the repeated pitch: leave the turn alone, Arabesque 1:00)
      if (!past || !turnsIn) continue;
      let j0 = k - 1;
      while (j0 > 0 && prim[j0 - 1].midi === x.midi && prim[j0 - 1].lane === x.lane && prim[j0].time - prim[j0 - 1].time < 0.5) j0--;
      const lead = j0 > 0 && prim[j0].time - prim[j0 - 1].time < 0.8 ? prim[j0 - 1] : null;
      if (prim.slice(j0, k + 2).some((q) => q.fixedLane || q.localPin)) continue;
      if (lead && lead.midi !== x.midi && Math.sign(x.midi - lead.midi) !== Math.sign(edge - lead.lane)) {
        // the note before can't lead into the inner key (it sits there itself): keep the first strike(s) on the edge
        // and open the turn out instead, e.g. F82, then 81 81 82 81 -> 79 = D D J F D
        y.lane = edge + dir;
        z.lane = edge;
      } else {
        for (let j = j0; j <= k + 1; j++) prim[j].lane = prim[j] === y ? edge + dir : edge;
      }
      replanAfter(prim, k + 1, lanes);
      continue;
    }
    const bad = (p, q, lp, lq) => (p.midi === q.midi ? lp !== lq : lp === lq || Math.sign(q.midi - p.midi) !== Math.sign(lq - lp)) ? 1 : 0;
    // two ways to make it one key: keep x's key (A) or move x to z's key (B, Arabesque 1:28: K77, then 76 77 76 =
    // J K J); pick the one that reads best with the notes either side
    const opts = [x.lane, z.lane]
      .map((l) => ({ l, yl: l + dir }))
      .filter((o) => o.yl >= 0 && o.yl < lanes)
      .map((o) => ({
        ...o,
        cost:
          (w ? bad(w, x, w.lane, o.l) : 0) + bad(x, y, o.l, o.yl) + bad(y, z, o.yl, o.l) + (nx ? bad(z, nx, o.l, nx.lane) : 0),
        tail: nx ? bad(z, nx, o.l, nx.lane) : 0,
      }))
      .sort((p, q) => p.cost - q.cost);
    if (!opts.length) continue;
    const o = opts[0];
    x.lane = o.l;
    y.lane = o.yl;
    z.lane = o.l;
    if (o.tail) replanAfter(prim, k + 1, lanes);
  }
}

/**
 * Four-note walks: a walk of exactly four notes stepping one way (steps of a 5th or less, no breath, not part of a
 * longer run) uses all four keys, K J F D down or D F J K up (e.g. Arabesque 0:13: 76, then 79 77 73 70 = D K J F D;
 * 5:10: 79, then 81 79 77 74 = D K J F D), as long as that still reads the right way from the notes either side.
 */
function applyFourNoteWalks(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  const step = (i) => prim[i + 1].midi - prim[i].midi;
  // (slow climbs count too, with steps up to a 5th: Arabesque 0:45 flute 79 84 85 91, about a second apart = D F J K)
  const linked = (i) => Math.abs(step(i)) >= 1 && Math.abs(step(i)) <= 7 && prim[i + 1].time - prim[i].time < 1.3;
  let a = 0;
  while (a < n - 1) {
    if (!linked(a)) {
      a++;
      continue;
    }
    const dir = Math.sign(step(a));
    let b = a;
    while (b + 1 < n && linked(b) && Math.sign(step(b)) === dir) b++;
    const run = prim.slice(a, b + 1);
    const gaps = run.slice(1).map((x, j) => x.time - run[j].time);
    const even = Math.max(...gaps) <= 1.6 * Math.min(...gaps) + 0.03;
    if (run.length === lanes && even && !run.some((x) => x.fixedLane || x.altRun || x.localPin)) {
      const want = dir < 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];
      const reads = (p, q, lp, lq) => p.midi === q.midi ? lp === lq : Math.sign(q.midi - p.midi) === Math.sign(lq - lp);
      const prev = a > 0 && run[0].time - prim[a - 1].time < 0.8 ? prim[a - 1] : null;
      const next = b + 1 < n && prim[b + 1].time - run[run.length - 1].time < 0.8 ? prim[b + 1] : null;
      const okPrev = !prev || reads(prev, run[0], prev.lane, want[0]);
      const okNext = !next || reads(run[run.length - 1], next, want[want.length - 1], next.lane);
      if (okPrev && okNext) {
        run.forEach((x, j) => (x.lane = want[j]));
        // the lead-in note must still read right into the walk and from the note before it, and not share a key with a
        // different walk note (Arabesque 0:13: F79-hold, 76 on J would go the wrong way and clash with J77 -> D76)
        if (prev) {
          const pp = a > 1 && prev.time - prim[a - 2].time < 1.6 ? prim[a - 2] : null;
          // (only a lead-in that's actually wrong moves: Sevens 0:57's F70-hold, J67 K68 J67 stays as approved)
          const intoWalk = (l) => reads(prev, run[0], l, want[0]) && !run.some((x, j) => want[j] === l && x.midi !== prev.midi && x.time - prev.time < 0.6);
          const fine = (l) => intoWalk(l) && (!pp || reads(pp, prev, pp.lane, l));
          if (!intoWalk(prev.lane)) {
            const alt = [0, 1, 2, 3].filter(fine).sort((x, y) => Math.abs(x - prev.lane) - Math.abs(y - prev.lane))[0];
            if (alt !== undefined) prev.lane = alt;
          }
        }
      }
    }
    a = Math.max(a + 1, b);
  }
}

/**
 * Walk, then climb again from the top note: an even four-note walk up whose top note is struck again and the line then
 * keeps climbing (Jupiter 0:49.4: 59 64 69 71, then 71 74 76 as the theme comes in). Staying on K would leave nowhere to
 * climb, and wrapping mid-walk (F J K D) puts a wrong-way step inside it, so the walk takes D F J K and the repeated
 * note starts the new climb from D (D F J K | D F J).
 */
function applyWalkRepeatClimb(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  const pinned = (x) => x.fixedLane || x.altRun || x.localPin;
  for (let a = 0; a + 5 < n; a++) {
    const walk = prim.slice(a, a + 4);
    const steps = walk.slice(1).map((x, j) => x.midi - walk[j].midi);
    const gaps = walk.slice(1).map((x, j) => x.time - walk[j].time);
    if (steps.some((s) => s < 1 || s > 7) || Math.max(...gaps) > 1.3) continue;
    if (Math.max(...gaps) > 1.6 * Math.min(...gaps) + 0.03) continue;
    const rep = prim[a + 4];
    if (rep.midi !== walk[3].midi || rep.time - walk[3].time > 1.6 * Math.max(...gaps) + 0.03) continue;
    // the climb after the repeat: rising, linked notes (up to the three keys left after D)
    const climb = [rep];
    for (let k = a + 5; k < n && climb.length < 4; k++) {
      const s = prim[k].midi - climb[climb.length - 1].midi;
      if (s < 1 || s > 7 || prim[k].time - climb[climb.length - 1].time > 0.8) break;
      climb.push(prim[k]);
    }
    if (climb.length < 3) continue;
    const prev = a > 0 && walk[0].time - prim[a - 1].time < 0.8 ? prim[a - 1] : null;
    if (prev && !(prev.midi > walk[0].midi || prev.lane < 0)) continue;
    const after = prim[a + 4 + climb.length];
    const all = walk.concat(climb);
    if (all.some(pinned)) continue;
    const want = [0, 1, 2, 3, ...climb.map((_, j) => j)];
    if (after && after.time - climb[climb.length - 1].time < 0.8) {
      const lq = want[want.length - 1];
      const ok = after.midi === climb[climb.length - 1].midi ? after.lane === lq : Math.sign(after.midi - climb[climb.length - 1].midi) === Math.sign(after.lane - lq);
      if (!ok) continue;
    }
    all.forEach((x, j) => (x.lane = want[j]));
    a += 3;
  }
}

/**
 * Five-note climb on a ghost key: an even five-note run (steps of a 3rd or less, up to ~0.3s apart -- slower than the
 * quick runs `assignGhostLanes` takes) that four keys can't hold without two different notes sharing a key (Jupiter
 * 1:08: the horns' 66 67 69 71 74 came out D F J K K) takes the ghost key at its far start when it's quick (S D F J K
 * going up, L K J F D going down) and steps back once at the start at a walking pace (F D F J K / J K J F D; user, Nov 17). Taps only, and it must join the notes either side the right way.
 */
function applyFiveNoteClimbGhost(notes, lanes) {
  const S = lanes;
  const L = lanes + 1;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  const n = prim.length;
  const kp = (l) => (l === S ? -1 : l === L ? lanes : l);
  for (let a = 0; a + 4 < n; a++) {
    const run = prim.slice(a, a + 5);
    const steps = run.slice(1).map((x, j) => x.midi - run[j].midi);
    const dir = Math.sign(steps[0]);
    if (!dir || steps.some((s) => Math.sign(s) !== dir || Math.abs(s) > 4)) continue;
    const gaps = run.slice(1).map((x, j) => x.time - run[j].time);
    if (Math.max(...gaps) > 0.3 || Math.max(...gaps) > 1.4 * Math.min(...gaps) + 0.02) continue;
    // a longer run in the same direction isn't five notes
    const pv = a > 0 ? prim[a - 1] : null;
    const nx = a + 5 < n ? prim[a + 5] : null;
    if (pv && Math.sign(run[0].midi - pv.midi) === dir && run[0].time - pv.time < 0.4) continue;
    if (nx && Math.sign(nx.midi - run[4].midi) === dir && nx.time - run[4].time < 0.4) continue;
    if (run.some((x) => x.fixedLane || x.altRun || x.ghost || x.lane >= lanes)) continue;
    // only when four keys fail it: two neighbouring notes of the run share a key
    if (!run.some((x, j) => j && x.lane === run[j - 1].lane)) continue;
    // (at a walking pace -- median gap 0.18s+ -- it steps back once at the start instead: F D F J K / J K J F D)
    const medG = [...gaps].sort((x, y) => x - y)[2];
    const seq = medG >= 0.18 ? (dir > 0 ? [1, 0, 1, 2, 3] : [2, 3, 2, 1, 0]) : dir > 0 ? [S, 0, 1, 2, 3] : [L, 3, 2, 1, 0];
    if (run.some((x, j) => seq[j] >= lanes && x.type === 'hold')) continue;
    const reads = (p, q, lp, lq) => p.midi === q.midi ? kp(lp) === kp(lq) : kp(lp) !== kp(lq) && Math.sign(kp(lq) - kp(lp)) === Math.sign(q.midi - p.midi);
    if (pv && run[0].time - pv.time < 0.6 && !reads(pv, run[0], pv.lane, seq[0])) continue;
    if (nx && nx.time - run[4].time < 0.6 && !reads(run[4], nx, seq[4], nx.lane)) continue;
    run.forEach((x, j) => {
      x.lane = seq[j];
      if (seq[j] >= lanes) x.ghost = seq[j] === S ? 'S' : 'L';
    });
    a += 4;
  }
}

/**
 * Four-pitch phrases: a phrase that moves among just four pitches (6+ notes, no breath longer than 0.8s, Jupiter 1:44's
 * horn tune 67 62 64 65 64 62 67 62 64 and its return at 1:52 an octave up) plays them in pitch order on D F J K, so the
 * same note is always the same key and every step reads the right way (K D F J F D K D F). Only when the layout it has
 * breaks that; it must join the note after it the right way, and the note before it too unless the phrase is a new
 * part coming in.
 */
function applyFourPitchPhrases(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  const n = prim.length;
  const kp = (l) => (l === lanes ? -1 : l === lanes + 1 ? lanes : l);
  const reads = (p, q, lp, lq) => p.midi === q.midi ? kp(lp) === kp(lq) : kp(lp) !== kp(lq) && Math.sign(kp(lq) - kp(lp)) === Math.sign(q.midi - p.midi);
  let a = 0;
  while (a < n) {
    const set = new Set([prim[a].midi]);
    let b = a;
    while (b + 1 < n && prim[b + 1].time - prim[b].time < 0.8 && !prim[b + 1].partEntry && (set.has(prim[b + 1].midi) || set.size < 4)) {
      set.add(prim[b + 1].midi);
      b++;
    }
    const run = prim.slice(a, b + 1);
    // (an even line of taps at a singing pace -- 0.3s+ apart, not quick turns like Ride 0:13's 73 72 73 72 70 -- with no
    // note struck twice in a row: Ride 0:18's 77 77 77 73 70 around a held 79 stays as locked)
    const gaps = run.slice(1).map((x, j) => x.time - run[j].time).sort((x, y) => x - y);
    const med = gaps[gaps.length >> 1] || 0;
    const ok =
      run.length >= 6 && set.size === 4 && med >= 0.3 &&
      gaps[0] >= 0.6 * med && gaps[gaps.length - 1] <= 1.6 * med &&
      !run.some((x, j) => (j && x.midi === run[j - 1].midi) || (j < run.length - 1 && x.type === 'hold')) &&
      !run.some((x) => x.fixedLane || x.altRun || x.localPin || x.ghost || x.lane >= lanes) &&
      (run.some((x, j) => j && !reads(run[j - 1], x, run[j - 1].lane, x.lane)) ||
        run.some((x) => run.some((y) => y.midi === x.midi && y.lane !== x.lane)) ||
        // (or it reads right but skips keys out of pitch order -- Jupiter 2:10's horn tune came out J D J K J D, while
        // its other statements are K D F J F D; a new part's first note may still cheat, below)
        (run[0].partEntry && run.slice(1).some((x) => x.lane !== [...set].sort((p, q) => p - q).indexOf(x.midi))));
    if (ok) {
      const order = [...set].sort((x, y) => x - y);
      const want = run.map((x) => order.indexOf(x.midi));
      const pv = a > 0 && run[0].time - prim[a - 1].time < 0.6 ? prim[a - 1] : null;
      const nx = b + 1 < n && prim[b + 1].time - run[run.length - 1].time < 0.6 ? prim[b + 1] : null;
      let inOk = !pv || reads(pv, run[0], pv.lane, want[0]);
      // a new part coming in may start its first note on another key, one that reads right from the note before it and
      // into its second note (Jupiter 1:44: the trumpets' K74, then the horns' 67 on J, not a second K)
      if (!inOk && run[0].partEntry && run[1].midi !== run[0].midi) {
        const near = (l) => run.slice(1, 5).findIndex((y) => y.midi !== run[0].midi && want[run.indexOf(y)] === l);
        const alt = [0, 1, 2, 3]
          .filter((l) => reads(pv, run[0], pv.lane, l) && reads(run[0], run[1], l, want[1]))
          .sort((x, y) => (near(y) < 0 ? 9 : near(y)) - (near(x) < 0 ? 9 : near(x)) || Math.abs(x - want[0]) - Math.abs(y - want[0]))[0];
        if (alt !== undefined) {
          want[0] = alt;
          inOk = true;
        }
      }
      const outOk = !nx || reads(run[run.length - 1], nx, want[want.length - 1], nx.lane);
      if (inOk && outOk) {
        run.forEach((x, j) => (x.lane = want[j]));
        a = b + 1;
        continue;
      }
    }
    a++;
  }
}

/**
 * Five-pitch turn phrases on a ghost key: a phrase with quick three-note turns in it that moves among exactly five
 * pitches (Jupiter 1:48: 67 62 64 | 65 67 69 | 67-69-67 | 65 | 64-65-64 | 62, and 1:56 an octave up) can't climb and
 * turn on four keys without stepping the wrong way, so it plays its pitches in order on D F J K and the top one on the
 * L ghost key: K D F | J K L | K L K | J | F J F | D. Only when one of its turns comes out on two keys, and only if the
 * top note is always a tap. The note after it may restart lower down after a longer note (0.3s+), like any new phrase.
 */
function applyFivePitchTurnGhost(notes, lanes) {
  if (lanes !== 4) return;
  const L = lanes + 1;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  const n = prim.length;
  const kp = (l) => (l === lanes ? -1 : l === L ? lanes : l);
  const reads = (p, q, lp, lq) => p.midi === q.midi ? kp(lp) === kp(lq) : kp(lp) !== kp(lq) && Math.sign(kp(lq) - kp(lp)) === Math.sign(q.midi - p.midi);
  let a = 0;
  while (a < n) {
    const set = new Set([prim[a].midi]);
    let b = a;
    while (b + 1 < n && prim[b + 1].time - prim[b].time < 0.8 && !prim[b + 1].partEntry && (set.has(prim[b + 1].midi) || set.size < 5)) {
      set.add(prim[b + 1].midi);
      b++;
    }
    const run = prim.slice(a, b + 1);
    const turn = run.some((x, j) => j + 2 < run.length && run[j + 2].midi === x.midi && run[j + 1].midi !== x.midi &&
      Math.abs(run[j + 1].midi - x.midi) <= 2 && run[j + 2].time - x.time <= 0.36);
    const order = [...set].sort((x, y) => x - y);
    // (turns set in a singing tune -- 3+ gaps of 0.3s or more between its notes -- not a quick flurry: Ride 1:37's
    // 82 84 82 81 82 81 79 run stays as locked)
    const slowGaps = run.filter((x, j) => j && x.time - run[j - 1].time >= 0.3).length;
    const ok =
      set.size === 5 && run.length >= 8 && turn && slowGaps >= 3 &&
      !run.some((x) => x.fixedLane || x.altRun || x.localPin || x.ghost || x.lane >= lanes) &&
      !run.some((x) => x.midi === order[4] && x.type === 'hold') &&
      // (only when one of its turns doesn't go out and back on one key -- Jupiter's F67 K69 J67. Turns that already do,
      // like Ride 1:50's J74 K75 J74 or Arabesque 1:41's J85 K87 J85, stay as locked)
      run.some((x, j) => j + 2 < run.length && run[j + 2].midi === x.midi && run[j + 1].midi !== x.midi &&
        run[j + 2].time - x.time <= 0.36 && run[j + 2].lane !== x.lane);
    if (ok) {
      const want = run.map((x) => { const r = order.indexOf(x.midi); return r === 4 ? L : r; });
      const pv = a > 0 && run[0].time - prim[a - 1].time < 0.6 ? prim[a - 1] : null;
      const nx = b + 1 < n && prim[b + 1].time - run[run.length - 1].time < 0.6 ? prim[b + 1] : null;
      const inOk = !pv || reads(pv, run[0], pv.lane, want[0]);
      const last = run[run.length - 1];
      const outOk = !nx || reads(last, nx, want[want.length - 1], nx.lane) ||
        (nx.time - last.time >= 0.25 && nx.midi !== last.midi && kp(nx.lane) !== kp(want[want.length - 1]));
      if (inOk && outOk) {
        run.forEach((x, j) => {
          x.lane = want[j];
          if (want[j] === L) x.ghost = 'L';
        });
        a = b + 1;
        continue;
      }
    }
    a++;
  }
}

/**
 * Entry above a K: when a phrase climbs to K (or would, but was bent back to stay clear of the next note -- J59 D60)
 * and a new part comes straight in on a higher note, the climb finishes on K and the new part's first note "cheats" one
 * key back to J: a wrong-way step, but it's the start of the next section, and better than two different notes on K
 * (Jupiter 1:52: F57 D55 F57 J59 K60 | J79 D74 F76 J77, not K60 K79 or J59 D60; same as 1:44's K74 | J67; 2:32's
 * K60 | J78-hold). The note after the entry, if it's close, must be lower and read right from J.
 */
function applyEntryAboveK(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  for (let k = 2; k + 1 < prim.length; k++) {
    const e = prim[k];
    const p = prim[k - 1];
    const pp = prim[k - 2];
    const nx = prim[k + 1];
    if (!e.partEntry || e.ghost || e.fixedLane || e.localPin || p.fixedLane || p.localPin) continue;
    if (e.time - p.time >= 0.6 || e.midi <= p.midi) continue;
    // (the note after the entry, if close, must be lower and read right from J; a held entry needs room after it)
    const close = nx.time - e.time < 0.6;
    if (close && (e.type === 'hold' || nx.midi >= e.midi || nx.lane >= 2)) continue;
    if (p.lane >= lanes || pp.lane >= lanes) continue;
    // the climb into p: rising from pp; p belongs on the key after pp's (or already sits on K)
    const climbing = p.midi > pp.midi && p.time - pp.time < 0.6;
    const bent = climbing && pp.lane === 2 && p.lane < pp.lane;
    if (!(bent || (p.lane === 3 && e.lane === 3))) continue;
    p.lane = 3;
    e.lane = 2;
  }
}

/**
 * Repeated notes flip keys only when quick: in a run of one repeated pitch that mixes slow strikes with quick bursts
 * (Jupiter 2:35's trumpet fanfare on 73: quarters and eighths, then a burst of four 16ths), the keys only alternate
 * inside the quick bursts (notes under 0.145s apart, the "hammer-on"); every slower strike goes back to the run's own
 * key. Runs that are quick all the way through keep alternating as before.
 */
function applyRepeatAltOnlyQuick(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  let s = 0;
  while (s < n) {
    let e = s;
    while (e + 1 < n && prim[e + 1].altRun && prim[s].altRun && prim[e + 1].midi === prim[s].midi && prim[e + 1].time - prim[e].time < 0.5) e++;
    if (e - s >= 3) {
      const run = prim.slice(s, e + 1);
      const gaps = run.slice(1).map((x, j) => x.time - run[j].time);
      const slow = gaps.filter((g) => g >= 0.2).length;
      // (mostly slow strikes with a quick burst or two in them -- a run that's mostly quick, like Sevens 2:36's mallet
      // 45s, keeps alternating all the way, as locked)
      if (slow >= 3 && slow * 2 >= gaps.length && gaps.some((g) => g < 0.145)) {
        const base = run[0].lane;
        const partner = run.find((x) => x.lane !== base)?.lane ?? (base >= lanes / 2 ? base - 1 : base + 1);
        for (let j = 1; j < run.length; j++) run[j].lane = gaps[j - 1] < 0.145 && run[j - 1].lane === base ? partner : base;
      }
    }
    s = e + 1;
  }
}

/**
 * Climb fits the keys: a short climb of 3-4 different notes (each a step up, under 0.6s apart, maybe ending on a
 * repeated top note) that runs out of room and puts two of its notes on one key (Jupiter 2:48: 60 63 67 67 came out
 * J K K K, because its 60 kept the key of the 60 a beat earlier) is laid so its top lands on K: F J K (K) or D F J K
 * (K). The note before it, if close, must still read right; one of the same pitch 0.8s+ back doesn't hold it.
 */
function applyClimbFitsKeys(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  const n = prim.length;
  const kp = (l) => (l === lanes ? -1 : l === lanes + 1 ? lanes : l);
  const reads = (p, q, lp, lq) => p.midi === q.midi ? kp(lp) === kp(lq) : kp(lp) !== kp(lq) && Math.sign(kp(lq) - kp(lp)) === Math.sign(q.midi - p.midi);
  for (let a = 0; a < n; a++) {
    let b = a;
    while (b + 1 < n && prim[b + 1].midi > prim[b].midi && prim[b + 1].time - prim[b].time < 0.6 && !prim[b + 1].partEntry) b++;
    const distinct = b - a + 1;
    if (distinct < 3 || distinct > 4) continue;
    let c = b;
    while (c + 1 < n && prim[c + 1].midi === prim[b].midi && prim[c + 1].time - prim[c].time < 0.6) c++;
    const run = prim.slice(a, c + 1);
    if (run.some((x) => x.fixedLane || x.altRun || x.localPin || x.ghost || x.lane >= lanes)) continue;
    // only when the climb really ran out of room: two different notes on one key -- or, for a new part's entry, a
    // climb that wraps round (Jupiter 5:02: the piccolo's 88 92 98 came out K D J; it plays F J K)
    const entryWrap = run[0].partEntry && run.some((x, j) => j && x.midi !== run[j - 1].midi && x.lane < run[j - 1].lane);
    if (!entryWrap && !run.some((x, j) => j && x.midi !== run[j - 1].midi && x.lane === run[j - 1].lane)) continue;
    const want = run.map((x, j) => Math.min(j, distinct - 1) + (lanes - distinct));
    const pv = a > 0 && run[0].time - prim[a - 1].time < 0.6 ? prim[a - 1] : null;
    const nx = c + 1 < n && prim[c + 1].time - run[run.length - 1].time < 0.6 ? prim[c + 1] : null;
    // (a new part's first note may step back from the note before it, like any section start -- not onto its key)
    if (pv && !reads(pv, run[0], pv.lane, want[0]) && !(run[0].partEntry && pv.lane !== want[0])) continue;
    if (nx && !reads(run[run.length - 1], nx, want[want.length - 1], nx.lane) && !(nx.partEntry && nx.lane !== want[want.length - 1])) continue;
    run.forEach((x, j) => (x.lane = want[j]));
    a = c;
  }
}

/**
 * Figure grows: a short figure (3 notes) played two or more times in a row and then once more with extra notes on the
 * end (Jupiter 0:28: the horns' 55 60 65 | 55 60 65 | 55 60 65 67) keeps the keys the long statement needs from the
 * start, so it doesn't change shape when it grows: D F J | D F J | D F J K, not D J K | D J K | D F J K. Only if the
 * short statements still read right into each other and from the note before.
 */
function applyFigureGrows(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  const kp = (l) => l;
  const reads = (p, q, lp, lq) => p.midi === q.midi ? lp === lq : lp !== lq && Math.sign(kp(lq) - kp(lp)) === Math.sign(q.midi - p.midi);
  const K = 3;
  for (let a = 0; a + 3 * K < n; a++) {
    const fig = prim.slice(a, a + K);
    if (new Set(fig.map((x) => x.midi)).size < K || fig.some((x, j) => j && x.time - fig[j - 1].time >= 0.6)) continue;
    const same = (s) => prim.slice(s, s + K).every((x, j) => x.midi === fig[j].midi);
    const starts = [a];
    let s = a + K;
    while (s + K <= n && same(s) && prim[s].time - prim[s - 1].time < 1.0) {
      starts.push(s);
      s += K;
    }
    const last = starts[starts.length - 1];
    // the last statement carries on: its next note follows straight on, continuing the same direction
    const ext = prim[last + K];
    const dir = Math.sign(fig[K - 1].midi - fig[0].midi);
    if (starts.length < 3 || !ext || ext.time - prim[last + K - 1].time >= 0.6 || Math.sign(ext.midi - fig[K - 1].midi) !== dir) continue;
    const want = prim.slice(last, last + K).map((x) => x.lane);
    const earlier = starts.slice(0, -1);
    if (earlier.every((st) => prim.slice(st, st + K).every((x, j) => x.lane === want[j]))) continue;
    if (prim.slice(a, last + K).some((x) => x.fixedLane || x.localPin || x.ghost || x.altRun)) continue;
    const saved = prim.slice(a, last).map((x) => x.lane);
    earlier.forEach((st) => prim.slice(st, st + K).forEach((x, j) => (x.lane = want[j])));
    const pv = a > 0 && prim[a].time - prim[a - 1].time < 0.6 ? prim[a - 1] : null;
    const bad = (pv && !reads(pv, prim[a], pv.lane, prim[a].lane)) ||
      prim.slice(a + 1, last + 1).some((x, j) => !reads(prim[a + j], x, prim[a + j].lane, x.lane));
    if (bad) prim.slice(a, last).forEach((x, j) => (x.lane = saved[j]));
    a = last + K - 1;
  }
}

/**
 * Re-entry makes room: a note struck again right after it was held on an edge key, when the line then carries on past
 * that edge (Jupiter 4:45: K84-hold, 84, 87 came out K84 K87, two different notes on K), steps one key in so the line
 * fits: K84-hold | J84 K87. A one-key step back on the re-entry, like the other phrase restarts.
 */
function applyReentryMakesRoom(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  for (let k = 1; k + 1 < prim.length; k++) {
    const p = prim[k - 1];
    const x = prim[k];
    const nx = prim[k + 1];
    if (p.type !== 'hold' || x.midi !== p.midi || x.lane !== p.lane || x.fixedLane || x.localPin || x.altRun) continue;
    if (nx.time - x.time >= 0.6 || nx.lane !== x.lane || nx.midi === x.midi) continue;
    const up = nx.midi > x.midi;
    if ((up && x.lane !== lanes - 1) || (!up && x.lane !== 0)) continue;
    x.lane = up ? lanes - 2 : 1;
  }
}

/**
 * Four-note walk down is K J F D: an even walk of exactly four notes stepping down (steps of a 3rd or less, under
 * 0.4s apart) plays K J F D even when the note before it would like another start -- a walk down that starts mid-hand
 * and wraps (Jupiter 5:32: 72 71 69 67 came out F D K -) reads worse than one step back into it. The note after it
 * must still read right from D.
 */
function applyFourWalkDown(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  for (let a = 0; a + 3 < n; a++) {
    const run = prim.slice(a, a + 4);
    const steps = run.slice(1).map((x, j) => run[j].midi - x.midi);
    const gaps = run.slice(1).map((x, j) => x.time - run[j].time);
    if (steps.some((s) => s < 1 || s > 4) || Math.min(...gaps) < 0.15 || Math.max(...gaps) >= 0.4 || Math.max(...gaps) > 1.6 * Math.min(...gaps) + 0.03) continue;
    // exactly four: the walk doesn't carry on down either side
    const pv = a > 0 ? prim[a - 1] : null;
    const nx = a + 4 < n ? prim[a + 4] : null;
    if (pv && pv.midi > run[0].midi && pv.midi - run[0].midi <= 4 && run[0].time - pv.time < 0.4) continue;
    if (nx && nx.midi < run[3].midi && run[3].midi - nx.midi <= 4 && nx.time - run[3].time < 0.4) continue;
    if (run.some((x) => x.fixedLane || x.altRun || x.localPin || x.ghost)) continue;
    if (run.every((x, j) => x.lane === 3 - j)) continue;
    // (only a walk the layout bent round: a step inside it goes the wrong way)
    if (!run.some((x, j) => j && x.lane > run[j - 1].lane)) continue;
    // (a new part coming in after it may restart anywhere, like any section start)
    if (nx && !nx.partEntry && nx.time - run[3].time < 0.6 && nx.midi !== run[3].midi && (nx.lane === 0 || nx.midi < run[3].midi)) continue;
    if (pv && pv.time - run[0].time > -0.6 && pv.lane === 3 && pv.midi !== run[0].midi) continue;
    run.forEach((x, j) => (x.lane = 3 - j));
    a += 3;
  }
}

/**
 * Figure into a hold repeats its keys: a short figure (3 notes) ending on a held note, played again a few seconds later
 * with the same notes and rhythm (Jupiter 6:02 / 6:06: the horns' 57 60 62-hold, D F J the first time, D F D the
 * second), takes the first statement's keys. The step after the hold may go back a key -- a phrase restarting -- but
 * the figure must still read right from the note before it.
 */
function applyFigureIntoHoldRepeats(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  const kp = (l) => l;
  const reads = (p, q, lp, lq) => p.midi === q.midi ? lp === lq : lp !== lq && Math.sign(kp(lq) - kp(lp)) === Math.sign(q.midi - p.midi);
  for (let i = 0; i + 2 < n; i++) {
    const fig = prim.slice(i, i + 3);
    if (fig[2].type !== 'hold' || fig[0].type === 'hold' || fig[1].type === 'hold') continue;
    for (let j = i + 3; j + 2 < n && prim[j].time - fig[0].time < 8; j++) {
      const rep = prim.slice(j, j + 3);
      if (!rep.every((x, q) => x.midi === fig[q].midi) || rep[2].type !== 'hold') continue;
      const r1 = fig[1].time - fig[0].time, r2 = fig[2].time - fig[1].time;
      if (Math.abs((rep[1].time - rep[0].time) - r1) > 0.25 * r1 + 0.03 || Math.abs((rep[2].time - rep[1].time) - r2) > 0.25 * r2 + 0.03) continue;
      if (rep.every((x, q) => x.lane === fig[q].lane) || rep.some((x) => x.fixedLane || x.localPin || x.altRun || x.ghost)) continue;
      const pv = j > 0 && rep[0].time - prim[j - 1].time < 0.6 ? prim[j - 1] : null;
      if (pv && !reads(pv, rep[0], pv.lane, fig[0].lane)) continue;
      // (the note after the hold: same pitch keeps its key; otherwise it may step back but not land on the hold's key)
      const nx = j + 3 < n ? prim[j + 3] : null;
      if (nx && nx.midi !== rep[2].midi && nx.lane === fig[2].lane && nx.time - rep[2].time < 1.2) continue;
      rep.forEach((x, q) => (x.lane = fig[q].lane));
      break;
    }
  }
}

/**
 * Three notes one way, three keys one way: a quick three-note figure that climbs (or falls) all the way (Jupiter 6:38:
 * the horns' 57 62 67) whose third note was pulled back onto an earlier key (D F D, to match the next part's 67) keeps
 * going instead: D F J. Only when the next key along is free, the figure stands alone (a gap or a new part after it),
 * and it then still reads into the note after it, a new part's first note excepted.
 */
function applyThreeNoBacktrack(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  for (let a = 0; a + 2 < n; a++) {
    const [p, q, r] = prim.slice(a, a + 3);
    if (r.time - p.time > 0.9 || [p, q, r].some((x) => x.fixedLane || x.localPin || x.altRun || x.ghost)) continue;
    const d1 = Math.sign(q.midi - p.midi), d2 = Math.sign(r.midi - q.midi);
    if (!d1 || d1 !== d2 || Math.sign(q.lane - p.lane) !== d1) continue;
    if (Math.sign(r.lane - q.lane) === d1) continue;
    const want = q.lane + d1;
    if (want < 0 || want >= lanes) continue;
    // (the figure's own: before and after it, a gap or a different part)
    const before = a > 0 ? prim[a - 1] : null;
    const after = a + 3 < n ? prim[a + 3] : null;
    if (before && p.time - before.time < 0.4 && Math.sign(p.midi - before.midi) === d1) continue;
    if (after && !after.partEntry && after.time - r.time < 0.4) continue;
    r.lane = want;
    a += 2;
  }
}

/**
 * Lines keep direction (exact scores): a quick line of 3-5 notes all moving one way plays on keys moving the same way.
 * Where a step inside the line goes back on the keys (Jupiter 6:07: 64 65 67 69 came out F J F J; 6:55: 57 58 60 62 as
 * F J F J), and that step isn't a phrase restart -- after a longer note (a gap 1.5x the line's pace) or on a new part's
 * first note, like the approved restarts at 1:51 and the walk-downs that start on K -- the line is laid in order: up to
 * four different notes on D F J K (K J F D going down), starting where it joins the notes either side the right way;
 * five going one way on S D F J K / L K J F D when the song uses ghost keys. If nothing fits, it's left as it was.
 */
/**
 * Slow entry climbs rise: a new part that comes in climbing at a broad pace (half notes, up to 1.2s apart -- Jupiter
 * 7:44: the trumpets' 72 77 82 after the fanfare) gets keys that climb with it. `climbFitsKeys` only looks at quick
 * climbs (< 0.6s), so a slow one that started high came out K J K, the second note stepping back. Laid from the lowest
 * keys that still read from the note before (an entry may step back, just not onto that note's key) and into the note
 * after. Exact scores only.
 */
function applySlowEntryClimbRises(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  const n = prim.length;
  const reads = (p, q, lp, lq) => p.midi === q.midi ? lp === lq : lp !== lq && Math.sign(lq - lp) === Math.sign(q.midi - p.midi);
  for (let a = 0; a < n; a++) {
    if (!prim[a].partEntry || a + 1 >= n) continue;
    // (and falls the same way, mirrored -- Mars 3:30: the cellos come in 45 . 44 | 43 under the held chord and were
    // laid D45 F44 D43, the 44 stepping back; user, Nov 19: "JFD makes so much sense")
    const dir = Math.sign(prim[a + 1].midi - prim[a].midi);
    if (!dir) continue;
    let b = a;
    while (b + 1 < n && b - a < 3 && Math.sign(prim[b + 1].midi - prim[b].midi) === dir && prim[b + 1].time - prim[b].time < 1.2 && !prim[b + 1].partEntry) b++;
    const run = prim.slice(a, b + 1);
    const k = run.length;
    if (k < 3 || run.some((x) => x.fixedLane || x.altRun || x.localPin || x.ghost || x.lane >= lanes)) continue;
    // (only the broad ones -- quick climbs belong to climbFitsKeys -- and only when the keys step back somewhere)
    if (!run.slice(1).some((x, j) => x.time - run[j].time >= 0.6)) continue;
    if (!run.slice(1).some((x, j) => (dir > 0 ? x.lane <= run[j].lane : x.lane >= run[j].lane))) continue;
    const pv = a > 0 && run[0].time - prim[a - 1].time < 0.6 ? prim[a - 1] : null;
    const nx = b + 1 < n && prim[b + 1].time - run[k - 1].time < 1.2 ? prim[b + 1] : null;
    const options = [];
    for (let st = 0; st + k <= lanes; st++) options.push(run.map((_, j) => (dir > 0 ? st + j : lanes - 1 - st - j)));
    if (dir < 0) options.reverse(); // (lowest-first either way, so the last that fits is the highest)
    const ok = options.filter((o) => (!pv || reads(pv, run[0], pv.lane, o[0]) || pv.lane !== o[0])
      && (!nx || nx.partEntry || reads(run[k - 1], nx, o[k - 1], nx.lane)));
    if (!ok.length) continue;
    const o = ok[ok.length - 1]; // (highest that fits: closest to where it sat)
    run.forEach((x, j) => (x.lane = o[j]));
    a = b;
  }
}

/**
 * Easy: room to keep going. Easy keeps fewer notes, so a note can end up on K (or D) with the next note going further
 * the same way and nowhere to go (Arabesque 2:23 on Easy: F82 K84-hold J87, the 87 stepping back). Move the stuck note
 * one key in, if it still reads right from the note before it: F82 J84-hold K87. Easy only.
 */
function applyEasyRoomToClimb(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const reads = (p, q, lp, lq) => (p.midi === q.midi ? lp === lq : lp !== lq && Math.sign(lq - lp) === Math.sign(q.midi - p.midi));
  for (let i = 1; i < prim.length; i++) {
    const p = prim[i - 1];
    const q = prim[i];
    if (q.midi === p.midi || reads(p, q, p.lane, q.lane)) continue;
    const up = q.midi > p.midi;
    if (p.lane !== (up ? lanes - 1 : 0)) continue;
    const want = p.lane + (up ? -1 : 1);
    const pp = i >= 2 ? prim[i - 2] : null;
    if (pp && q.time - pp.time < 3 && !reads(pp, p, pp.lane, want)) continue;
    if (!reads(p, q, want, q.lane)) {
      // (the stuck note moves in; the next one takes the end key)
      const qWant = up ? lanes - 1 : 0;
      const qq = prim[i + 1];
      if (qq && qq.time - q.time < 3 && !reads(q, qq, qWant, qq.lane)) continue;
      q.lane = qWant;
    }
    p.lane = want;
  }
}

/**
 * Quick bursts land home: in a stretch of one repeated pitch (Mars' ostinato on G: a triplet, then quarters and
 * eighths), every strike that isn't part of a quick burst (notes under 0.18s apart) sits on the run's home key, and a
 * burst alternates so it lands back on home: the triplet plays F D F, then the next strike D (user, Nov 17: "the
 * triplets should alternate and go down (FDFD). Everything else should stay on D"). Home is the lower of the run's
 * keys (the upper one at K); the burst's other key is the one above it. Exact scores only.
 */
function applyQuickBurstsLandHome(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  const QUICK = 0.18;
  const runs = [];
  for (let s = 0; s < n; ) {
    let e = s;
    // (a quarter in a broad tempo can run past half a second -- Mars 4:50, 0.52s -- and the ostinato goes on through it)
    while (e + 1 < n && prim[e + 1].midi === prim[s].midi && prim[e + 1].time - prim[e].time < 0.6) e++;
    const run = prim.slice(s, e + 1);
    s = e + 1;
    if (run.length < 5 || run.some((x) => x.fixedLane || x.localPin || x.ghost || x.type === 'hold')) continue;
    const gaps = run.slice(1).map((x, j) => x.time - run[j].time);
    // (a mix: some quick bursts, and slower strikes too -- 3+ of them)
    if (!gaps.some((g) => g < QUICK) || gaps.filter((g) => g >= QUICK).length < 3) continue;
    // (an ostinato: the same rhythm over and over -- the gaps repeat with a period of 3-12 strikes)
    let periodic = false;
    for (let per = 3; per <= 12 && gaps.length - per >= 3; per++) {
      let ok = 0;
      for (let j = 0; j + per < gaps.length; j++) if (Math.abs(gaps[j] - gaps[j + per]) < 0.06) ok++;
      if (ok >= 0.85 * (gaps.length - per)) periodic = true;
    }
    runs.push({ run, gaps, periodic });
  }
  // (...or a short stretch of a rhythm that goes round elsewhere, on any note -- Mars 0:12's bar and a half of the
  // ostinato between the theme's entries, 1:29's bar of it on 84. A one-off fanfare in an irregular rhythm, Jupiter 2:37 / 7:41, keeps its keys)
  const inside = (a, b) => {
    for (let o = 0; o + a.length <= b.length; o++) if (a.every((g, j) => Math.abs(g - b[o + j]) < 0.06)) return true;
    return false;
  };
  for (const r of runs) {
    if (!r.periodic && r.gaps.length >= 6) {
      r.periodic = runs.some((o) => o !== r && o.periodic && inside(r.gaps, o.gaps));
    }
  }
  for (const { run, gaps, periodic } of runs) {
    if (!periodic) continue;
    const used = [...new Set(run.map((x) => x.lane))].sort((a, b) => a - b);
    const home = used[0] === lanes - 1 ? lanes - 1 : used[0];
    const partner = home === lanes - 1 ? home - 1 : home + 1;
    // (a burst: the strikes followed quickly by the next one; the strike they lead into -- the triplet's quarter --
    // lands home, and the burst alternates back from it: F D F | D)
    for (let j = 0; j < run.length; ) {
      if (!(j < gaps.length && gaps[j] < QUICK)) {
        run[j].lane = home;
        j++;
        continue;
      }
      let k = j;
      while (k < gaps.length && gaps[k] < QUICK) k++; // run[k] is the landing
      run[k].lane = home;
      for (let q = k - 1, alt = true; q >= j; q--, alt = !alt) run[q].lane = alt ? partner : home;
      j = k + 1;
    }
  }
}

/**
 * Two-note swings keep their keys: a phrase that swings back and forth between the same two notes (Mars 1:00-1:16:
 * the horns' 68 71 68 71 ..., each with its band chord) plays them on the same two keys every time, the first
 * statement's (user, Nov 18: "the chords in this passage are the same, back and forth, but here they switch key
 * presses"). 4+ notes, only the two pitches, each next note within 4s, most of them band chord hits; the note before and after must still read
 * right (or be 1.5s+ away). Exact scores only.
 */
function applyTwoNoteSwingKeys(notes, lanes, chordHits) {
  const hitAt = (t) => (chordHits || []).some((h) => Math.abs(h[0] - t) < 0.02);
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  const reads = (p, q, lp, lq) => (p.midi === q.midi ? lp === lq : lp !== lq && Math.sign(lq - lp) === Math.sign(q.midi - p.midi));
  for (let a = 0; a + 3 < n; ) {
    const lo = Math.min(prim[a].midi, prim[a + 1].midi);
    const hi = Math.max(prim[a].midi, prim[a + 1].midi);
    if (lo === hi) {
      a++;
      continue;
    }
    let b = a + 1;
    while (b + 1 < n && (prim[b + 1].midi === lo || prim[b + 1].midi === hi) && prim[b + 1].time - prim[b].time < 4) b++;
    const run = prim.slice(a, b + 1);
    const swaps = run.slice(1).filter((x, j) => x.midi !== run[j].midi).length;
    // (the band's chord swing: most of its notes are chord hits -- a plain two-note figure in a tune keeps its keys)
    const chorded = run.filter((x) => hitAt(x.time)).length >= 0.75 * run.length;
    if (run.length < 4 || swaps < 3 || !chorded || run.some((x) => x.fixedLane || x.localPin || x.ghost)) {
      a++;
      continue;
    }
    const first = run.find((x) => x.midi === lo).lane;
    const second = run.find((x) => x.midi === hi).lane;
    if (!(first < second)) {
      a = b + 1;
      continue;
    }
    const laneOf = (x) => (x.midi === lo ? first : second);
    const pv = a > 0 ? prim[a - 1] : null;
    const nx = b + 1 < n ? prim[b + 1] : null;
    const pvOk = !pv || run[0].time - pv.time >= 1.5 || reads(pv, run[0], pv.lane, laneOf(run[0]));
    const nxOk = !nx || nx.time - run[run.length - 1].time >= 1.5 || reads(run[run.length - 1], nx, laneOf(run[run.length - 1]), nx.lane);
    if (pvOk && nxOk) run.forEach((x) => (x.lane = laneOf(x)));
    a = b + 1;
  }
}

/**
 * Slow repeats keep their key: a note struck again and again at an unhurried pace (each repeat 0.2s+ after the last --
 * Mars 2:22: the 82s every 0.43s) stays on one key; only quick bursts alternate (user, Nov 18: "why is this alternating
 * notes? it's not nearly fast enough to trigger our jackhammer rule"). The key is the run's own one that reads right
 * from the note before it and into the note after it (the first note's key if both do). Exact scores only.
 */
function applySlowRepeatsKeepKey(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const n = prim.length;
  const reads = (p, q, lp, lq) => (p.midi === q.midi ? lp === lq : lp !== lq && Math.sign(lq - lp) === Math.sign(q.midi - p.midi));
  for (let a = 0; a < n; ) {
    let b = a;
    // (a strike in a quick burst -- one under 0.2s from its neighbour -- belongs to the burst, not the run)
    const startsBurst = (k) => (k + 1 < n && prim[k + 1].midi === prim[k].midi && prim[k + 1].time - prim[k].time < 0.2) ||
      (k > 0 && prim[k - 1].midi === prim[k].midi && prim[k].time - prim[k - 1].time < 0.2);
    if (startsBurst(a)) {
      a++;
      continue;
    }
    while (b + 1 < n && prim[b + 1].midi === prim[a].midi && prim[b + 1].time - prim[b].time >= 0.2 && prim[b + 1].time - prim[b].time < 1.2 && !startsBurst(b + 1)) b++;
    const run = prim.slice(a, b + 1);
    const usedLanes = [...new Set(run.map((x) => x.lane))];
    if (run.length >= 3 && usedLanes.length > 1 && !run.some((x) => x.fixedLane || x.localPin || x.ghost)) {
      const pv = a > 0 && run[0].time - prim[a - 1].time < 1.5 ? prim[a - 1] : null;
      const nx = b + 1 < n && prim[b + 1].time - run[run.length - 1].time < 1.5 ? prim[b + 1] : null;
      const fits = (l) => (!pv || reads(pv, run[0], pv.lane, l)) && (!nx || reads(run[run.length - 1], nx, l, nx.lane));
      const others = [0, 1, 2, 3].filter((l) => !usedLanes.includes(l)).sort((x, y) => Math.abs(x - run[0].lane) - Math.abs(y - run[0].lane));
      const pick = [run[0].lane, ...usedLanes, ...others].find(fits);
      if (pick !== undefined) run.forEach((x) => (x.lane = pick));
    }
    a = b + 1;
  }
}

/**
 * Runs that roll: a long quick run (12+ notes, each under 0.2s apart) that both steps back by a step somewhere and
 * drops back a third or more somewhere -- not a plain scale -- follows its shape instead of restarting D F J K every four
 * notes: each step on is the next key (wrapping K to D when it runs out of room), a step back of a tone or less is one
 * key back (a little K J K roll), a drop of a third or more starts afresh on the first key, a repeated note keeps its
 * key. Mars 3:19-3:23: the violins' run 76 78 80 81 | 72 ... | 60 64 69 72 | 66 68 69 73 72 76 81 84 | 78 80 81 85 84 88
 * 90 92 93 played D F J K sixteen times over (user, Nov 19: "it'd be more fun to play something other than
 * DFJKDFJKDFJK over and over again", "what I want to avoid is random jumps that don't read well"). Up runs shown;
 * down runs mirror it. Exact scores only.
 */
function applyRunsThatRoll(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  for (let a = 0; a < prim.length; ) {
    let b = a;
    // (a leap of more than a fifth ends the run: Mercury 1:09, the violins' tune coming in on 83 over the 62 66 62 66
    // figure isn't the figure running on)
    while (b + 1 < prim.length && prim[b + 1].time - prim[b].time < 0.2 && Math.abs(prim[b + 1].midi - prim[b].midi) <= 7) b++;
    const run = prim.slice(a, b + 1);
    a = b + 1;
    if (run.length < 12 || run.some((x) => x.fixedLane || x.localPin || x.ghost)) continue;
    const st = run.slice(1).map((x, j) => x.midi - run[j].midi);
    const dir = Math.sign(run[run.length - 1].midi - run[0].midi) || 1;
    const back = st.some((d) => d * dir < 0 && Math.abs(d) <= 2);
    // (a drop inside the run, not just the note it lands on)
    const drop = st.slice(0, -1).some((d) => d * dir < 0 && Math.abs(d) >= 3);
    // (and it gets somewhere: an octave or more from its first note to its last -- a figure turning round the same few
    // notes (Arabesque 1:02, 76 77 80 79 80 77 three times) or a short dip-and-fall (Ride 1:19) keeps its keys; tried in
    // the sandbox, user, Nov 19: "MUCH worse at Arabesque 1:02", "slightly worse at Ride 1:19")
    if (!back || !drop || Math.abs(run[run.length - 1].midi - run[0].midi) < 12) continue;
    const first = dir > 0 ? 0 : lanes - 1;
    const last = lanes - 1 - first;
    let l = run[0].lane;
    const plan = [l];
    let ok = true;
    for (let j = 1; j < run.length && ok; j++) {
      const d = (run[j].midi - run[j - 1].midi) * dir;
      // (two steps back in a row aren't a roll in a run but figures going the other way -- Mercury 2:22, the triplets'
      // 58 62 64 inside a falling stretch all came out on K)
      if (d < 0 && j > 1 && (run[j - 1].midi - run[j - 2].midi) * dir < 0) { ok = false; break; }
      if (d === 0) {
        // (same note, same key)
      } else if (d > 0) l = l === last ? first : l + dir;
      // (a step back starts afresh too, like a drop, so the groups line up as D F J K and the 12-note waves can take
      // them -- the K J K rolls read as J K J K; user, Nov 20: "is it possible to clean that up with the new DFJFJK
      // ligature? it's more pleasing to play by a mile")
      else l = first;
      plan.push(l);
    }
    if (ok) run.forEach((x, j) => (x.lane = plan[j]));
  }
}

/**
 * A figure echoed keeps its keys: a 4-5-note run (all different notes, one way) played again within a second and a
 * half, quicker or slower, plays on the same keys as the first time, unless that would step the wrong way or share a
 * key with a different note next to it (Mercury 0:43.4 / 0:48.5 / 0:53.5: the woodwinds' 79 76 72 69 echoed quick
 * after the slow statement came out F D K J; user, Nov 21: "this should be KJFD rather than FDKJ"). Exact scores.
 */
function applyFigureEchoKeys(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  const n = prim.length;
  // (a wrong-way move is only a clash on a step; a leap of a third or more off the figure can go either way, like the
  // D85 F68 the user okayed at 0:59.2)
  const clash = (a, b) =>
    b.time - a.time < 0.6 && a.midi !== b.midi &&
    (a.lane === b.lane || (Math.abs(b.midi - a.midi) < 3 && Math.sign(b.lane - a.lane) !== Math.sign(b.midi - a.midi)));
  const bad = (x) => x.fixedLane || x.localPin || x.ghost || x.lane >= lanes;
  for (let k = 5; k >= 4; k--) {
    for (let i = 0; i + k < n; i++) {
      const A = prim.slice(i, i + k);
      if (A.some(bad) || new Set(A.map((x) => x.midi)).size < k) continue;
      const dir = Math.sign(A[1].midi - A[0].midi);
      if (!A.every((x, q) => !q || (Math.sign(x.midi - A[q - 1].midi) === dir && Math.sign(x.lane - A[q - 1].lane) === dir))) continue;
      for (let j = i + k; j + k <= n && prim[j].time - A[k - 1].time <= 1.5; j++) {
        const B = prim.slice(j, j + k);
        if (B.some(bad) || !B.every((x, q) => x.midi === A[q].midi) || B.every((x, q) => x.lane === A[q].lane)) continue;
        const saved = B.map((x) => x.lane);
        B.forEach((x, q) => (x.lane = A[q].lane));
        const before = j > 0 ? prim[j - 1] : null;
        const after = j + k < n ? prim[j + k] : null;
        if ((before && clash(before, B[0])) || (after && clash(B[k - 1], after))) B.forEach((x, q) => (x.lane = saved[q]));
        break;
      }
    }
  }
}

/**
 * One key per note in a figure: inside a quick figure (4+ notes, each within 0.3s of the last), a note that comes
 * back more than once sits on one key every time -- the key, of those it already uses, that keeps every move in the
 * figure going the right way and doesn't share a key with a different note next to it (Mercury 1:03.9: the bassoons'
 * 43 43 45 43 37 came out D D J F D, the 43 on two keys and then the 37 on top of it; user: "same notes, same keys").
 * Exact scores.
 */
function applyOneKeyPerNoteInFigure(notes, lanes) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo && !x.ghost);
  const n = prim.length;
  for (let a = 0; a < n; ) {
    let b = a;
    // (a leap of more than an octave starts another figure: Mercury 1:04, the bassoons' 43 43 45 43 37 then the violins'
    // 68 68 70 68)
    while (b + 1 < n && prim[b + 1].time - prim[b].time <= 0.3 && Math.abs(prim[b + 1].midi - prim[b].midi) <= 12) b++;
    const fig = prim.slice(a, b + 1);
    const before = a > 0 && prim[a].time - prim[a - 1].time < 0.6 ? prim[a - 1] : null;
    const after = b + 1 < n && prim[b + 1].time - prim[b].time < 0.6 ? prim[b + 1] : null;
    a = b + 1;
    if (fig.length < 4 || fig.some((x) => x.fixedLane || x.localPin)) continue;
    const reads = (x, y, strict) => x.midi === y.midi ? x.lane === y.lane :
      x.lane !== y.lane && (!strict && Math.abs(y.midi - x.midi) >= 3 || Math.sign(y.lane - x.lane) === Math.sign(y.midi - x.midi));
    const okAll = () => fig.every((x, q) => !q || reads(fig[q - 1], x, true)) &&
      (!before || reads(before, fig[0], false)) && (!after || reads(fig[fig.length - 1], after, false));
    // (only where the figure has a key doubled for two different notes, next to each other or with the note before)
    const seq = before ? [before, ...fig] : fig;
    if (!seq.some((x, q) => q && x.lane === seq[q - 1].lane && x.midi !== seq[q - 1].midi)) continue;
    for (const p of new Set(fig.map((x) => x.midi))) {
      const mine = fig.filter((x) => x.midi === p);
      const used = [...new Set(mine.map((x) => x.lane))];
      if (used.length < 2) continue;
      const saved = mine.map((x) => x.lane);
      const pick = used.find((l) => {
        mine.forEach((x) => (x.lane = l));
        return okAll();
      });
      if (pick === undefined) mine.forEach((x, q) => (x.lane = saved[q]));
      else mine.forEach((x) => (x.lane = pick));
    }
  }
}

/**
 * Handoffs take turns: a little x x y x cell (a note, again, a step away and back) passed back and forth between parts
 * -- each cell within 2.5s of the last -- starts its turns on alternating keys, F then J, so the trade reads as a trade
 * instead of the same four keys every time (Mercury 1:01-1:05: the horns' 68 68 70 68 and the bassoons' 43 43 45 43,
 * all F F J F; user, Nov 21: "as I do the handoffs, can I switch the start notes? like one starting on F then the next
 * on J, for variance"). A big drop that lands on D after the cell stays there. Not where the cell's notes carry on
 * just after it. Exact scores, 4 keys only.
 */
function applyHandoffsTakeTurns(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo && !x.ghost);
  const n = prim.length;
  const cells = [];
  for (let i = 0; i + 3 < n; i++) {
    const [a, b, c, d] = prim.slice(i, i + 4);
    if (a.midi !== b.midi || d.midi !== a.midi || c.midi === a.midi || Math.abs(c.midi - a.midi) > 2) continue;
    if (d.time - a.time > 0.8 || (i > 0 && a.time - prim[i - 1].time < 0.25 && prim[i - 1].midi === a.midi)) continue;
    cells.push(i);
    i += 3;
  }
  let chainPos = 0;
  for (let q = 0; q < cells.length; q++) {
    const i = cells[q];
    if (q === 0 || prim[i].time - prim[cells[q - 1]].time > 2.5) { chainPos = 0; continue; }
    chainPos++;
    const prev = prim[cells[q - 1]];
    const cell = prim.slice(i, i + 4);
    if (chainPos % 2 === 0 || cell[0].lane !== prev.lane) continue;
    if (cell.some((x) => x.fixedLane || x.localPin)) continue;
    const shift = Math.max(...cell.map((x) => x.lane)) < lanes - 1 ? 1 : Math.min(...cell.map((x) => x.lane)) > 0 ? -1 : 0;
    if (!shift) continue;
    const drop = i + 4 < n && prim[i + 4].time - cell[3].time < 0.6 ? prim[i + 4] : null;
    // (not where the cell's notes carry on just after it)
    const tailEnd = cell[3].time + 1.0;
    if (prim.slice(i + 4).some((x) => x.time <= tailEnd && cell.some((y) => y.midi === x.midi) && x !== drop)) continue;
    const saved = cell.map((x) => x.lane);
    cell.forEach((x) => (x.lane += shift));
    const before = i > 0 && cell[0].time - prim[i - 1].time < 0.6 ? prim[i - 1] : null;
    let bad = before && before.midi !== cell[0].midi && before.lane === cell[0].lane;
    if (drop && drop.midi !== cell[3].midi && drop.lane === cell[3].lane) bad = true;
    if (drop && !(drop.lane === 0 && cell[3].midi - drop.midi >= 3) && Math.sign(drop.lane - cell[3].lane) !== Math.sign(drop.midi - cell[3].midi) && Math.abs(drop.midi - cell[3].midi) < 3) bad = true;
    if (bad) cell.forEach((x, k) => (x.lane = saved[k]));
  }
}

/**
 * A tune's statements keep its shape: the phrase of 10-12 notes that comes round most often in the song (5+ times) (the same steps
 * and the same rhythm, at any pitch) plays on the keys most of its statements use, every time -- even when the note
 * before it pushes one statement's start onto other keys (Mercury 1:19-2:12: the 79 79 81 79 77 76 77 79 77 76 tune,
 * J J K J F D J K J F, came out F F K J ... after the celesta's 86, and D D K J ... for the horns' 67 67 69; user, Nov
 * 21: "Each section is exactly the same two forms"). Not where it would put two different notes on one key next to
 * each other. Exact scores, 4 keys.
 */
function applyTuneStatementsKeepShape(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo && !x.ghost);
  const n = prim.length;
  // (twice round: a statement held back by the one after it can follow once that one is fixed)
  for (const k of [12, 11, 10, 12, 11, 10]) {
    const groups = new Map();
    for (let i = 0; i + k <= n; i++) {
      const w = prim.slice(i, i + k);
      const span = w[k - 1].time - w[0].time;
      if (span <= 0 || span > 4 || new Set(w.map((x) => x.midi)).size < 4) continue;
      const iv = w.slice(1).map((x, j) => x.midi - w[j].midi).join(',');
      const rh = w.slice(1).map((x, j) => Math.round(((x.time - w[j].time) / span) * 24)).join(',');
      const key = iv + '|' + rh;
      if (!groups.has(key)) groups.set(key, []);
      const g = groups.get(key);
      if (!g.length || g[g.length - 1] + k <= i) g.push(i);
    }
    // (only the phrase heard most often, counted from its own first note -- not the same notes counted from one note
    // further in)
    const top = [...groups.values()].sort((a, b) => b.length - a.length)[0];
    for (const starts of top ? [top] : []) {
      if (starts.length < 5) continue;
      const seqs = starts.map((i) => prim.slice(i, i + k).map((x) => x.lane).join(''));
      const count = {};
      seqs.forEach((q) => (count[q] = (count[q] || 0) + 1));
      const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
      if (count[best] < 2) continue;
      const want = best.split('').map(Number);
      starts.forEach((i) => {
        const w = prim.slice(i, i + k);
        if (w.every((x, j) => x.lane === want[j]) || w.some((x) => x.fixedLane || x.localPin)) return;
        const saved = w.map((x) => x.lane);
        w.forEach((x, j) => (x.lane = want[j]));
        const before = i > 0 && w[0].time - prim[i - 1].time < 0.6 ? prim[i - 1] : null;
        const after = i + k < n && prim[i + k].time - w[k - 1].time < 0.6 ? prim[i + k] : null;
        const clash = (a, b) => a.midi !== b.midi && a.lane === b.lane;
        // (the last note of the phrase before, a leap away, moves aside if it's in the way -- Mercury 1:32, the celesta's
        // 84 86 ending D J, then the clarinets' 79 on J: the 86 plays F)
        if (before && clash(before, w[0]) && Math.abs(before.midi - w[0].midi) >= 5 && !before.fixedLane && !before.localPin) {
          const pp = i > 1 && before.time - prim[i - 2].time < 0.6 ? prim[i - 2] : null;
          const okLane = (l) => l !== w[0].lane && (!pp || (pp.midi === before.midi ? l === pp.lane :
            l !== pp.lane && Math.sign(l - pp.lane) === Math.sign(before.midi - pp.midi)));
          const alt = [before.lane - 1, before.lane + 1, before.lane - 2, before.lane + 2].find((l) => l >= 0 && l < lanes && okLane(l));
          if (alt !== undefined) before.lane = alt;
        }
        if ((before && clash(before, w[0])) || (after && clash(w[k - 1], after))) w.forEach((x, j) => (x.lane = saved[j]));
      });
    }
  }
}

/**
 * A leap off the edge doesn't land on the same key: a falling cell that ends on D, followed at once by a drop to a
 * lower note that's also on D (two different notes on one key), moves up a key so the drop lands fresh (Mercury
 * 0:05.2: the flutes' 76 71 68 then the violas' 53, J F D | D became K J F | D; user, Nov 21: "there's a double D here
 * I'd like to eliminate"). Mirrored for a rising cell ending on K before a leap up. Exact scores, 4 keys only.
 */
function applyLeapOffEdgeFresh(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo && !x.ghost);
  for (let i = 1; i + 1 < prim.length; i++) {
    const p = prim[i], q = prim[i + 1];
    if (q.time - p.time > 0.3 || p.lane !== q.lane || p.midi === q.midi) continue;
    let dir = p.lane === 0 && q.midi < p.midi ? -1 : p.lane === lanes - 1 && q.midi > p.midi ? 1 : 0;
    // (also a falling cell landing on D followed by a leap back up that starts on D too -- Mercury 2:23.9, the bassoons'
    // 52 47 44 then the climb from 58, K F D | D58: the cell moves up a key, K52 J47 F44 | D58)
    if (!dir && p.lane === 0 && q.midi - p.midi >= 5 && i > 0 && prim[i - 1].midi > p.midi && prim[i - 1].lane > p.lane) dir = -1;
    if (!dir) continue;
    // (the cell: the notes before p moving the same way, key by key)
    let a = i;
    while (a > 0 && prim[a].time - prim[a - 1].time <= 0.3 && Math.sign(prim[a].midi - prim[a - 1].midi) === dir &&
      prim[a - 1].lane === prim[a].lane - dir) a--;
    const cell = prim.slice(a, i + 1);
    if (cell.length < 2 || cell.some((x) => x.fixedLane || x.localPin)) continue;
    const top = cell[0].lane - dir;
    if (top < 0 || top >= lanes) continue;
    const before = a > 0 ? prim[a - 1] : null;
    // (the note before the cell still steps the right way into it)
    if (before && cell[0].time - before.time <= 0.6 && before.midi !== cell[0].midi &&
      (before.lane === top || Math.sign(top - before.lane) !== Math.sign(cell[0].midi - before.midi))) continue;
    cell.forEach((x) => (x.lane -= dir));
  }
}

/**
 * Back and forth on one key: a quick zigzag where every other note dips down (high low high low, 8+ notes, the low
 * notes not all the same pitch) puts all its low notes on D and swings the high notes K, J, K, J (a high note repeated
 * keeps its key), so the figure swings off a single home key with only two keys above it (Mercury 0:25.0: the flutes'
 * 81 73 76 . 81 73 76 with the oboes' 68 in the gap, K D J D; user, Nov 21: "this back and forth part is playing three
 * notes above the consistent D, but I think it should only be two. I think KDJDKDJD makes the most sense"; and on into
 * the first violins' 73 76 68 73 64 69 61 66 57 63 at 0:27, which falls as it zigzags). Exact scores, 4 keys only.
 */
function applyBackAndForthOneKey(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo && !x.ghost);
  const n = prim.length;
  const lowAt = (p) => p > 0 && p + 1 < n && prim[p].midi < prim[p - 1].midi && prim[p].midi < prim[p + 1].midi;
  const quick = (p) => prim[p].time - prim[p - 1].time <= 0.2;
  let a = 0;
  while (a < n) {
    // (the longest zigzag from a: a high note, then low and high by turns, every gap quick)
    let b = a + 1;
    while (b + 1 < n && quick(b) && quick(b + 1) && lowAt(b) && !lowAt(b + 1)) b += 2;
    // (prim[a..b) is high low ... high low; its last low is at b - 1)
    const len = b - a;
    if (len >= 8 && !lowAt(a)) {
      const seg = prim.slice(a, b);
      const lows = seg.filter((_, p) => p % 2 === 1);
      const highs = seg.filter((_, p) => p % 2 === 0);
      // (lows of more than one pitch, or one low note under highs that alternate between two -- Mercury 2:39, the cor
      // anglais' 67 60 63 60 67 60 ...; user, Nov 23: 'that KFJ(F) pattern of sixteenths back and forth')
      const highSet = new Set(highs.map((x) => x.midi));
      // (one low note: only where the keys came out scattered -- the low note on more than one key, or a high note on
      // two -- not a figure already swinging off one key, like the approved 0:22 F61 D54 J57 D54)
      const scattered = new Set(lows.map((x) => x.lane)).size > 1 ||
        [...highSet].some((m) => new Set(highs.filter((x) => x.midi === m).map((x) => x.lane)).size > 1);
      if ((new Set(lows.map((x) => x.midi)).size >= 2 || (highSet.size >= 2 && scattered)) && !seg.some((x) => x.fixedLane || x.localPin)) {
        lows.forEach((x) => (x.lane = 0));
        let lane = highs.length > 1 && highs.find((x) => x.midi !== highs[0].midi)?.midi > highs[0].midi ? 2 : 3;
        highs.forEach((x, q) => {
          if (q > 0 && x.midi !== highs[q - 1].midi) lane = lane === 3 ? 2 : 3;
          x.lane = lane;
        });
        a = b;
        continue;
      }
    }
    a++;
  }
}

/**
 * Stepping-down threes alternate: a sequence of rising three-note groups (each a quick step-step-up, 3+ in a row), each
 * starting below where the last one ended -- the sequence stepping down -- alternates its keys F J K | D F J | F J K |
 * D F J, so the groups feel like they step down instead of all landing on F J K (Mars 7:23.8: the violins' 69 71 72 |
 * 66 67 69 | 63 64 66 | 57 59 60; user, Nov 20: "it'd be fun to play FJKDFJFJKDFJ there"). Mirrored for falling
 * groups stepping up. Exact scores only.
 */
function applySteppingThreesAlternate(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const cellAt = (i) => {
    if (i + 2 >= prim.length) return 0;
    const [a, b, c] = [prim[i], prim[i + 1], prim[i + 2]];
    if (b.time - a.time >= 0.2 || c.time - b.time >= 0.2) return 0;
    const d1 = b.midi - a.midi;
    const d2 = c.midi - b.midi;
    if (!d1 || Math.sign(d1) !== Math.sign(d2) || Math.abs(d1) > 3 || Math.abs(d2) > 3) return 0;
    if ([a, b, c].some((x) => x.fixedLane || x.localPin || x.ghost)) return 0;
    // (a group of exactly three: the next note turns back -- 55 57 59 61 is a four-note climb, not a three)
    const nx = prim[i + 3];
    if (nx && nx.time - c.time < 0.25 && Math.sign(nx.midi - c.midi) === Math.sign(d1)) return 0;
    return Math.sign(d1);
  };
  for (let i = 0; i < prim.length; ) {
    const dir = cellAt(i);
    if (!dir) { i++; continue; }
    const cells = [i];
    let k = i;
    while (cellAt(k + 3) === dir && prim[k + 3].time - prim[k + 2].time < 0.25 &&
           (prim[k + 3].midi - prim[k].midi) * dir < 0) {
      k += 3;
      cells.push(k);
    }
    if (cells.length >= 3) {
      const A = dir > 0 ? [1, 2, 3] : [2, 1, 0];
      const B = dir > 0 ? [0, 1, 2] : [3, 2, 1];
      cells.forEach((c, n) => [0, 1, 2].forEach((q) => (prim[c + q].lane = (n % 2 ? B : A)[q])));
      i = k + 3;
    } else i++;
  }
}

/**
 * Back-to-back D F J K: where a quick run plays three groups of four on D F J K in a row (12 notes), they play
 * D F J F J K D F J F J K instead -- two six-note waves -- so the run doesn't cycle the same four keys three times
 * over; a longer stretch does this for every three groups, and any leftover groups stay D F J K (going down, mirrored:
 * K J F J F D ...). Mars 7:24.9-7:27.7, the violins' climb (user, Nov 20: "can I have runs of 12 go DFJFJKDFJFJK?").
 * Exact scores only.
 */
function applyBackToBackFourShift(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  const groupAt = (i, want) => {
    if (i + 3 >= prim.length) return false;
    for (let q = 0; q < 4; q++) {
      const x = prim[i + q];
      if (x.lane !== want[q] || x.fixedLane || x.localPin || x.ghost) return false;
      if (q && x.time - prim[i + q - 1].time >= 0.2) return false;
    }
    return true;
  };
  for (const base of [[0, 1, 2, 3], [3, 2, 1, 0]]) {
    for (let i = 0; i < prim.length; ) {
      if (!groupAt(i, base)) { i++; continue; }
      const groups = [i];
      let k = i;
      while (groupAt(k + 4, base) && prim[k + 4].time - prim[k + 3].time < 0.2) {
        k += 4;
        groups.push(k);
      }
      for (let g = 0; g + 2 < groups.length; g += 3) {
        const wave = base[0] === 0 ? [0, 1, 2, 1, 2, 3, 0, 1, 2, 1, 2, 3] : [3, 2, 1, 2, 1, 0, 3, 2, 1, 2, 1, 0];
        for (let q = 0; q < 12; q++) prim[groups[g] + q].lane = wave[q];
      }
      i = k + 4;
    }
  }
}

/**
 * No doubled key in a step: two different notes close together (under 0.7s apart, a 5th or less) never share a key
 * (Mars 2:17: the cor anglais' 70 71 | 72 73 | 75 70 came out D F | F J | K D, the 71 and 72 both on F; user, Nov 18:
 * "something that doesn't double the note"). The second note moves on a key the way the line goes (and the next note
 * follows if it now doubles). At the edge, a note that starts a new pair (0.5s+ after the last) cheats back one key
 * instead: D F | J K | J D, the 75 a new group's start. Exact scores only.
 */
function applyNoDoubledKeyInSteps(notes, lanes, ghosts = false) {
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  for (let i = 1; i < prim.length; i++) {
    const p = prim[i - 1];
    const q = prim[i];
    // (a step off a held note counts out to 1.3s: Mars 4:24 / 4:45, J76h J78 and F64h F62 -- user, Nov 19)
    const reach = p.type === 'hold' && Math.abs(q.midi - p.midi) <= 2 ? 1.3 : 0.7;
    if (p.midi === q.midi || p.lane !== q.lane || q.time - p.time >= reach || Math.abs(q.midi - p.midi) > 7) continue;
    // (...unless that note comes back on this key right after: Jupiter 3:55's F74h F72 J74 F72h keeps its F72s -- moving
    // the first one made it D72 J74 F72; user, Nov 19: "net worse")
    if (q.time - p.time >= 0.7 && prim.some((r) => r !== q && r.midi === q.midi && r.lane === q.lane && r.time > q.time && r.time - q.time < 2.5)) continue;
    if (q.fixedLane || q.localPin || q.ghost) continue;
    const dir = Math.sign(q.midi - p.midi);
    const want = q.lane + dir;
    if (want >= 0 && want < lanes) q.lane = want;
    else if (q.time - p.time >= 0.5) q.lane = q.lane - dir;
    // (no room past the edge, in a song with the ghost keys, on a step: the note steps out onto the ghost key, rather
    // than pushing the line back into the notes before it (a leap still pushes back, Jupiter 0:34) -- Mercury 1:54, the trumpets' 77 76 74 | 72 came out K79 K77 J76 F74 D72;
    // it plays J77 F76 D74 S72)
    else if (ghosts && Math.abs(q.midi - p.midi) <= 2 && !(i + 1 < prim.length && prim[i + 1].time - q.time < 0.6 && Math.sign(prim[i + 1].midi - q.midi) === dir)) {
      q.lane = dir < 0 ? lanes : lanes + 1;
      q.ghost = dir < 0 ? 'S' : 'L';
    }
    else if (!p.fixedLane && !p.localPin && !p.ghost) {
      // (no room past the edge: the note before steps back from it instead, and the one before that if it now doubles
      // -- Jupiter 0:34: 72 71 | 65 came out F72 D71 D65; it plays J72 F71 D65)
      const saved = prim.slice(Math.max(0, i - 5), i).map((x) => x.lane);
      p.lane -= dir;
      let k = i - 1;
      for (; k >= 1 && i - k <= 3; k--) {
        const a = prim[k - 1];
        const b = prim[k];
        if (a.midi === b.midi || a.lane !== b.lane || b.time - a.time >= 0.7 || a.fixedLane || a.localPin || a.ghost) break;
        const nl = a.lane - dir;
        if (nl < 0 || nl >= lanes) break;
        a.lane = nl;
      }
      // (if pushing back only moves the doubled key further up the line -- Mercury 1:54, the trumpets' 79 77 76 74 | 72
      // came out K79 K77 J76 F74 D72 -- leave the line alone and let the last note cheat back a key instead: J77 K79 J77
      // F76 D74 F72, the 72 a new pair's end)
      const lo = Math.max(0, i - 5);
      const stillDoubled = prim.slice(lo, i).some((x, j) => j && x.lane === prim[lo + j - 1].lane && x.midi !== prim[lo + j - 1].midi &&
        x.time - prim[lo + j - 1].time < 0.7);
      if (stillDoubled) {
        prim.slice(lo, i).forEach((x, j) => (x.lane = saved[j]));
        q.lane = q.lane - dir;
      }
    }
  }
}

/**
 * Very quick rips on four keys: in a song that doesn't use the ghost keys (ghostNotes: false -- Mars), a rip of 5-7 notes going one way (its landing
 * note included), each under 0.1s apart, plays as four -- its first note and its last three, on D F J K up (K J F D
 * down; Mars 2:41: 70 72 74 75 77 79 -> 80 plays 70 77 79 80) -- instead of
 * wrapping round the keys (user, Nov 18: "if there's a VERY quick rip of five, let's cheat and make it four (DFJK)").
 * The dropped notes are taken off the chart. Exact scores only.
 */
function applyQuickRipsFourKeys(notes, lanes) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  for (let a = 0; a + 4 < prim.length; ) {
    const dir = Math.sign(prim[a + 1].midi - prim[a].midi);
    let b = a;
    while (b + 1 < prim.length && dir && prim[b + 1].time - prim[b].time < 0.1 && Math.sign(prim[b + 1].midi - prim[b].midi) === dir) b++;
    // (a rip on its own: not a stretch of a longer run -- the notes either side don't carry on the same way within 0.2s)
    const midRun = a > 0 && prim[a].time - prim[a - 1].time < 0.2 && Math.sign(prim[a].midi - prim[a - 1].midi) === dir;
    const runsOn = b + 1 < prim.length && prim[b + 1].time - prim[b].time < 0.2 && Math.sign(prim[b + 1].midi - prim[b].midi) === dir;
    if (!midRun && !runsOn && b - a + 1 >= 5 && b - a + 1 <= 7 && !prim.slice(a, b + 1).some((x) => x.type === 'hold' && x !== prim[b])) {
      const run = prim.slice(a, b + 1);
      const keep = [run[0], ...run.slice(-3)];
      run.forEach((x) => {
        if (!keep.includes(x)) notes.splice(notes.indexOf(x), 1);
      });
      keep.forEach((x, j) => (x.lane = dir > 0 ? j : lanes - 1 - j));
      a = b + 1;
    } else a++;
  }
}

/**
 * Long runs end on the end key: a quick run of 6+ notes one way (each under 0.2s apart, its landing note included)
 * that wraps round the keys is laid so it ends on K going up, D going down -- counting back from its last note
 * (Mars 2:52: the clarinets' 55 ... 89 scale ended on D; user, Nov 18: "for extended woodwind runs like this I'd like
 * them to end on K"). Exact scores only.
 */
function applyLongRunsEndOnEdge(notes, lanes, ghosts = false) {
  if (lanes !== 4) return;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && x.lane < lanes && !x.isPercussionSolo);
  for (let a = 0; a + 5 < prim.length; ) {
    const dir = Math.sign(prim[a + 1].midi - prim[a].midi);
    let b = a;
    // (a long run -- 8+ notes -- may turn back once by a step on its way: Mars 3:22, the flutes' 78 80 81 85 84 88 90
    // 92 93; shorter brass figures with a turn keep the figure rules' keys)
    let turned = -1;
    for (;;) {
      if (!(b + 1 < prim.length && dir && prim[b + 1].time - prim[b].time < 0.2)) break;
      const st = prim[b + 1].midi - prim[b].midi;
      // (a leap of more than a 5th starts a new run: Mars 7:22.8, the climb 81 83 85 then the fall from 71 -- the 85
      // was planned as the fall's first note and doubled the 83's key; user, Nov 20: "there's a repeated FF in there")
      if (Math.abs(st) > 7) break;
      if (Math.sign(st) === dir) { b++; continue; }
      if (turned < 0 && b > a && Math.abs(st) <= 2 && st !== 0 && b + 2 < prim.length && prim[b + 2].time - prim[b + 1].time < 0.2 &&
          Math.sign(prim[b + 2].midi - prim[b + 1].midi) === dir) { turned = b + 1 - a; b++; continue; }
      break;
    }
    if (turned >= 0 && b - a + 1 < 8) { b = a + turned - 1; turned = -1; }
    const run = prim.slice(a, b + 1);
    if (turned >= 0 && run.length >= 8 && !run.some((x) => x.fixedLane || x.localPin || x.ghost)) {
      // (with a turn in it, the keys are planned: each step on a key the way it goes, wrapping round the end key only
      // where it must, ending on the end key if it can -- K J back for the turn: D F J K J K | D F J)
      const L = run.length;
      const cost = (j, lp, l) => {
        const up = Math.sign(run[j].midi - run[j - 1].midi) * dir > 0;
        const want = up ? (dir > 0 ? lp + 1 : lp - 1) : dir > 0 ? lp - 1 : lp + 1;
        if (l === want) return 0;
        if (up && (dir > 0 ? lp === lanes - 1 && l === 0 : lp === 0 && l === lanes - 1)) return 1;
        // (the turn back starts the next group afresh on the first key, and that's preferred -- K73 to D72, then
        // D F J K again; user, Nov 18: D F J K J K D F J "without a full cycle" was hard to follow)
        if (!up && l === (dir > 0 ? 0 : lanes - 1) && l !== lp) return -0.5;
        return 10;
      };
      let best = [0, 1, 2, 3].map((l) => (l === (dir > 0 ? 0 : lanes - 1) ? 0 : 0.5));
      const back = [];
      for (let j = 1; j < L; j++) {
        const nb = [];
        const bk = [];
        for (let l = 0; l < lanes; l++) {
          let m = Infinity;
          let arg = 0;
          for (let lp = 0; lp < lanes; lp++) { const c = best[lp] + cost(j, lp, l); if (c < m) { m = c; arg = lp; } }
          nb.push(m);
          bk.push(arg);
        }
        best = nb;
        back.push(bk);
      }
      best = best.map((c, l) => c + (l === (dir > 0 ? lanes - 1 : 0) ? 0 : 2));
      let l = best.indexOf(Math.min(...best));
      const plan = [l];
      for (let j = L - 2; j >= 0; j--) { l = back[j][l]; plan.unshift(l); }
      run.forEach((x, j) => (x.lane = plan[j]));
      a = b + 1;
    } else if (turned < 0 && run.length >= 6 && !run.some((x) => x.fixedLane || x.localPin || x.ghost)) {
      const L = run.length;
      run.forEach((x, j) => {
        const back = L - 1 - j;
        x.lane = dir > 0 ? (((3 - back) % 4) + 4) % 4 : back % 4;
      });
      // (a long run that would start mid-keyboard or on the far key straight after another note drops its first note
      // or two so it starts on D going up (K going down) -- Mars 2:48: the trumpets end on D, the clarinet scale
      // started on K right after; user, Nov 18: "I don't mind having a gap and skipping the K")
      const startEdge = dir > 0 ? 0 : lanes - 1;
      const pv = a > 0 ? prim[a - 1] : null;
      if (L >= 10 && pv && run[0].time - pv.time < 0.4 && run[0].lane !== startEdge) {
        const k = run.findIndex((x) => x.lane === startEdge);
        // (in a song with the ghost keys, one note before the edge steps out onto the ghost key instead of being dropped
        // -- Mercury 2:24.3, the climb from 58 starts S58 D60 ...; user, Nov 22: "the 'drop the first note' rule only
        // matters if we don't have ghost notes; I think we should start the second sweep on S")
        if (k === 1 && ghosts) {
          // (unless that note ends the figure before -- a leap into the run from it, the figure's own note just
          // before: it keeps the figure's edge key and the run's first step goes on the ghost key instead -- Mercury
          // 2:39, the cor anglais' ... J63 D60 then the violins' S64 F66 ...; user, Nov 24: "my notes end on J but it
          // feels like there's one more D I'm not hitting")
          const endsFigure = Math.abs(run[1].midi - run[0].midi) >= 3 && run[0].time - pv.time < 0.2 && Math.abs(run[0].midi - pv.midi) >= 3;
          const g = endsFigure ? run[1] : run[0];
          if (endsFigure) run[0].lane = startEdge;
          g.lane = dir > 0 ? lanes : lanes + 1;
          g.ghost = dir > 0 ? 'S' : 'L';
        } else if (k > 0 && k <= 2) run.slice(0, k).forEach((x) => notes.splice(notes.indexOf(x), 1));
      }
      a = b + 1;
    } else a++;
  }
}

function applyLinesKeepDirection(notes, lanes, ghosts) {
  if (lanes !== 4) return;
  const S = lanes;
  const L = lanes + 1;
  const prim = notes.filter((x) => !x.isChordPartner && x.lane >= 0 && !x.isPercussionSolo);
  const n = prim.length;
  const kp = (l) => (l === S ? -1 : l === L ? lanes : l);
  const reads = (p, q, lp, lq) => p.midi === q.midi ? kp(lp) === kp(lq) : kp(lp) !== kp(lq) && Math.sign(kp(lq) - kp(lp)) === Math.sign(q.midi - p.midi);
  const wrapOK = (p, q) => (kp(p.lane) === lanes - 1 && kp(q.lane) === 0 && q.midi > p.midi) || (kp(p.lane) === 0 && kp(q.lane) === lanes - 1 && q.midi < p.midi);
  const bad = (x) => x.fixedLane || x.localPin || x.altRun || x.ghost;
  for (let a = 0; a + 2 < n; a++) {
    // the longest one-way quick line from a (up to 5 notes)
    const dir = Math.sign(prim[a + 1].midi - prim[a].midi);
    if (!dir) continue;
    let b = a + 1;
    while (b + 1 < n && b - a < 4 && Math.sign(prim[b + 1].midi - prim[b].midi) === dir && Math.abs(prim[b + 1].midi - prim[b].midi) <= 4) b++;
    const run = prim.slice(a, b + 1);
    if (run.length < 3 || run.some((x, j) => j && Math.abs(x.midi - run[j - 1].midi) > 4) || run.some(bad) || run.some((x) => x.lane >= lanes)) continue;
    const gaps = run.slice(1).map((x, j) => x.time - run[j].time);
    // (quick, though not always even: 0:55's 55 57 58 60 62 mixes eighths and sixteenths)
    if (Math.max(...gaps) >= 0.4 || Math.max(...gaps) > 3.5 * Math.min(...gaps) + 0.03) continue;
    const pace = Math.min(...gaps);
    // a step back inside it that isn't a wrap or a restart
    const backs = run.map((x, j) => j && !reads(run[j - 1], x, run[j - 1].lane, x.lane) && !wrapOK(run[j - 1], x)
      && !(x.partEntry) && !(gaps[j - 1] >= 1.5 * pace && gaps[j - 1] >= 0.3)).slice(1);
    // (or a step of a tone or less that skips a key -- Mars 7:24.1, the run's 66 67 69 came out D F-skipped J K; user,
    // Nov 20: "two two-note jumps that feel strange")
    const skips = run.map((x, j) => j && Math.abs(x.midi - run[j - 1].midi) <= 2 && Math.abs(kp(x.lane) - kp(run[j - 1].lane)) >= 2 && !wrapOK(run[j - 1], x)).slice(1);
    if (!backs.some(Boolean) && !skips.some(Boolean)) continue;
    const k = run.length;
    const pv = a > 0 && run[0].time - prim[a - 1].time < 0.6 ? prim[a - 1] : null;
    const nx = b + 1 < n && prim[b + 1].time - run[k - 1].time < 0.6 ? prim[b + 1] : null;
    let options = [];
    if (k <= 4) {
      for (let st = 0; st + k <= lanes; st++) options.push(run.map((_, j) => (dir > 0 ? st + j : lanes - 1 - st - j)));
    } else if (k === 5) {
      // (five at a walking pace -- median gap 0.18s+ -- step back once at the start instead of a ghost key: F D F J K
      // up, J K J F D down; a quick run takes the ghost: S D F J K / L K J F D)
      const med = [...gaps].sort((x, y) => x - y)[gaps.length >> 1];
      // (two slower notes, then a quick three -- Jupiter 6:55's 55 57 | 58 60 62, 7:10's 67 69 | 70 72 74: the pair on
      // its own keys and the flourish starting afresh, F J | F J K up (J F | J F D down); user, Nov 18)
      const leadIn = gaps[0] >= 1.8 * Math.max(gaps[2], gaps[3]) && gaps[1] >= 1.8 * Math.max(gaps[2], gaps[3]);
      if (leadIn) options.push(dir > 0 ? [1, 2, 1, 2, 3] : [2, 1, 2, 1, 0]);
      else if (med >= 0.18) options.push(dir > 0 ? [1, 0, 1, 2, 3] : [2, 3, 2, 1, 0]);
      else if (ghosts) options.push(dir > 0 ? [S, 0, 1, 2, 3] : [L, 3, 2, 1, 0]);
    }
    // (a new part's entry may break the line, but never onto the same key as a different note: Mars 7:27.7, F69 then the
    // trumpets' F79)
    const fits = (o) => (!pv || (run[0].partEntry ? !(kp(o[0]) === kp(pv.lane) && pv.midi !== run[0].midi) : reads(pv, run[0], pv.lane, o[0])))
      && (!nx || (nx.partEntry ? !(kp(o[k - 1]) === kp(nx.lane) && nx.midi !== run[k - 1].midi) : reads(run[k - 1], nx, o[k - 1], nx.lane)));
    options = options.filter(fits);
    if (!options.length) continue;
    // (closest to where the line already sits)
    options.sort((o1, o2) => o1.reduce((s_, l, j) => s_ + Math.abs(kp(l) - kp(run[j].lane)), 0) - o2.reduce((s_, l, j) => s_ + Math.abs(kp(l) - kp(run[j].lane)), 0));
    const o = options[0];
    run.forEach((x, j) => {
      x.lane = o[j];
      if (o[j] >= lanes) x.ghost = o[j] === S ? 'S' : 'L';
    });
    a = b - 1;
  }
}

/**
 * Ensemble chord hits (from the score: many staves, brass among them, attacking a real chord that stands out from what
 * came before, e.g. Ride 3:11-3:15 horn hits & final chord): add a partner key on the other hand, same tap/hold as the
 * melody note. The mirror key is preferred; the partner never sits on a key the neighbouring melody notes use (that
 * would look like a repeat of a different pitch); if both other-hand keys clash, the hit stays a single note.
 */
function addEnsembleChordHits(notes, hits, lanes) {
  if (!hits.length) return;
  const prim = notes.filter((n) => !n.isChordPartner && n.lane >= 0 && n.lane < lanes && !n.isPercussionSolo);
  const added = [];
  let passageLane = null; // passage hits: the same note keeps one key all the way through (no rocking)
  const chordMemo = new Map(); // "midi:hostLane" -> partner lane
  const moveMemo = new Map(); // "prevHostLane:prevPartnerLane:dir:hostLane" -> partner lane
  for (const [t, up, dn, inPassage, holdEnd, forcedLane] of hits) {
    const i = prim.findIndex((x) => Math.abs(x.time - t) < 0.03);
    if (i < 0) continue;
    const host = prim[i];
    if (inPassage) {
      const lastP = added[added.length - 1];
      const lastHost = lastP && lastP.inPassage ? prim.find((x) => x.time === lastP.time) : null;
      if (lastHost && lastHost.midi === host.midi && host.time - lastHost.time < 1.5 && passageLane !== null) host.lane = passageLane;
      passageLane = host.lane;
      delete host.altRun;
    }
    if (host.ghost || notes.some((x) => x.isChordPartner && Math.abs(x.time - host.time) < 0.03)) continue;
    const cands = [];
    // (any two keys can make a chord, D+F and J+K included; the partner sits on the side of its chord
    // tone (a tone below -> a key to the left), as close as the interval: a 3rd or 4th next door, wider further)
    const below = dn !== undefined && host.lane > 0;
    const tone = below ? dn : up;
    const dirP = below ? -1 : 1;
    const want = Math.abs(tone - host.midi) <= 5 ? 1 : 2;
    for (let l = 0; l < lanes; l++) if (l !== host.lane) cands.push(l);
    // if that side is blocked, the partner plays the other chord tone, again as close as ITS interval
    const other = below ? up : dn;
    const wantO = other !== undefined ? (Math.abs(other - host.midi) <= 5 ? 1 : 2) : want;
    const score = (l) => (Math.sign(l - host.lane) === dirP ? Math.abs(Math.abs(l - host.lane) - want) : 10 + Math.abs(Math.abs(l - host.lane) - wantO));
    cands.sort((a, b) => score(a) - score(b));
    const prev = i > 0 ? prim[i - 1] : null;
    const next = i + 1 < prim.length ? prim[i + 1] : null;
    const hostEnd = Math.max(host.time, host.endTime || host.time);
    const ok = (l) =>
      !(prev && prev.lane === l && host.time - Math.max(prev.time, prev.endTime || prev.time) < 0.6) &&
      !(next && next.lane === l && next.time - hostEnd < 0.6);
    // a repeated hit (same note, same key, within 3s of the last one) keeps the last hit's partner key if it can
    // (Ride 3:11-3:13: three D hits all take J)
    const last = added[added.length - 1];
    const lastHost = last && prim.find((x) => x.time === last.time);
    const same = last && lastHost && host.time - last.time < 3 && lastHost.midi === host.midi && lastHost.lane === host.lane;
    // (the same chord on the same melody key keeps its partner key all song, unless a neighbour sits right on it)
    const memoKey = `${host.midi}:${host.lane}`;
    const hard = (l) =>
      (prev && prev.lane === l && host.time - Math.max(prev.time, prev.endTime || prev.time) < 0.15) || (next && next.lane === l && next.time - hostEnd < 0.15);
    // (a long hold that runs right up to the chord on its partner key lets go a beat early instead: Guthix 2:35, the J48
    // hold before the D+J choir chord)
    if (chordMemo.has(memoKey) && prev && prev.type === 'hold' && prev.lane === chordMemo.get(memoKey)) {
      const cut = host.time - 0.2;
      if (prev.endTime > cut && cut - prev.time >= 0.5) {
        prev.endTime = cut;
        prev.duration = cut - prev.time;
      }
    }
    let memoLane = chordMemo.has(memoKey) && !hard(chordMemo.get(memoKey)) ? chordMemo.get(memoKey) : undefined;
    // ...and if the chord's own hold runs into the next note on the remembered key, the partner lets go 0.2s before it
    // rather than the chord changing keys (Guthix 1:07: F69+76 stays F+K like 1:01, ending before the K68 at 1:10.5)
    let partnerEnd;
    if (memoLane === undefined && chordMemo.has(memoKey) && host.type === 'hold' && !holdEnd) {
      const ml = chordMemo.get(memoKey);
      const prevBlocks = prev && prev.lane === ml && host.time - Math.max(prev.time, prev.endTime || prev.time) < 0.15;
      if (!prevBlocks && next && next.lane === ml && next.time - 0.2 - host.time >= 0.5) {
        memoLane = ml;
        partnerEnd = Math.min(hostEnd, next.time - 0.2);
      }
    }
    // the same goes for a chord's first appearance: if the only free key is the far end (D+K), a hold on the best partner
    // key lets go 0.2s early instead, so the rest of the passage doesn't copy a stretched chord (Arabesque 4:37: J70 hold,
    // then D67+75 = D+J)
    let firstPick;
    const top = cands[0];
    const fallback = cands.find(ok);
    if (memoLane === undefined && !(forcedLane !== undefined && forcedLane !== null) && top !== undefined && !ok(top) && !(same && ok(last.lane)) &&
        (fallback === undefined || Math.abs(fallback - host.lane) >= 3) &&
        prev && prev.type === 'hold' && prev.lane === top && !(next && next.lane === top && next.time - hostEnd < 0.6)) {
      const cut = host.time - 0.2;
      if (cut - prev.time >= 0.5) {
        prev.endTime = Math.min(prev.endTime, cut);
        prev.duration = prev.endTime - prev.time;
        firstPick = top;
      }
    }
    // chord to chord: when the melody moves straight from one chord into the next, the pair of keys moves with it (its
    // low key and its high key never step the opposite way), e.g. Guthix 1:00 F67+K74 -> J69+K, not D+J69
    const prevPartner = prev && host.time - Math.max(prev.time, prev.endTime || prev.time) < 0.6 && prev.midi !== host.midi
      ? added.find((x) => Math.abs(x.time - prev.time) < 0.03)
      : null;
    const pairOk = (l) => {
      if (!prevPartner) return true;
      const dir = Math.sign(host.midi - prev.midi);
      const lo0 = Math.min(prev.lane, prevPartner.lane), hi0 = Math.max(prev.lane, prevPartner.lane);
      const lo1 = Math.min(host.lane, l), hi1 = Math.max(host.lane, l);
      return Math.sign(lo1 - lo0) !== -dir && Math.sign(hi1 - hi0) !== -dir;
    };
    if (memoLane !== undefined && !pairOk(memoLane) && cands.some((l) => ok(l) && pairOk(l))) memoLane = undefined;
    // the same chord move as before (same keys, melody stepping the same way onto the same key) plays the same way
    // again, e.g. Guthix 1:36 D+J -> F66 takes K like the Choir's D+J -> F69+K
    const moveKey = prevPartner ? `${prev.lane}:${prevPartner.lane}:${Math.sign(host.midi - prev.midi)}:${host.lane}` : null;
    if (moveKey && moveMemo.has(moveKey) && forcedLane == null) {
      const ml = moveMemo.get(moveKey);
      if (ml !== host.lane && ok(ml)) memoLane = ml;
    }
    // (if the only key that moves with the melody is the next note's key, a held chord's partner lets go 0.2s before
    // that note instead, as with a remembered chord)
    if (prevPartner && memoLane === undefined && firstPick === undefined && host.type === 'hold' && !holdEnd && !cands.some((l) => ok(l) && pairOk(l))) {
      const l2 = cands.find(
        (l) => pairOk(l) && !(prev && prev.lane === l && host.time - Math.max(prev.time, prev.endTime || prev.time) < 0.6) &&
          next && next.lane === l && next.time - 0.2 - host.time >= 0.5
      );
      if (l2 !== undefined) {
        firstPick = l2;
        partnerEnd = Math.min(hostEnd, next.time - 0.2);
      }
    }
    const lane =
      forcedLane !== undefined && forcedLane !== null ? forcedLane : memoLane !== undefined ? memoLane : firstPick !== undefined ? firstPick : same && ok(last.lane) ? last.lane : (cands.find((l) => ok(l) && pairOk(l)) ?? cands.find(ok));
    if (lane !== undefined && !chordMemo.has(memoKey)) chordMemo.set(memoKey, lane);
    if (lane !== undefined && moveKey && !moveMemo.has(moveKey)) moveMemo.set(moveKey, lane);
    if (lane === undefined) continue;
    added.push({
      id: Math.max(...notes.map((x) => x.id || 0), ...added.map((x) => x.id)) + 1,
      // (a partner may hold on its own while the melody note is a tap, e.g. Arabesque 4:35: J-hold under the rip's top K)
      type: holdEnd ? 'hold' : host.type,
      lane,
      midi: lane > host.lane ? up : dn,
      time: host.time,
      endTime: holdEnd || partnerEnd || host.endTime,
      duration: (holdEnd || partnerEnd || host.endTime) - host.time,
      intensity: host.intensity,
      isChordPartner: true,
      isScoreChord: true,
      isEnsembleHit: true,
      inPassage: !!inPassage,
      hit: false,
      missed: false,
      holding: false,
      completed: false,
    });
  }
  if (!added.length) return;
  notes.push(...added);
  notes.sort((a, b) => a.time - b.time);
}

/**
 * Repeated single pitches:
 *  - A short run (2–5 strikes) at a playable pace stays on ONE key: it's the same note in the music. A lone quick
 *    re-strike (16th + 8th "da-DAH") counts as playable.
 *  - A long run (>= 6 strikes without a 0.5s break) or a chain of fast strikes (>= 2 gaps under 145ms) is drum-like:
 *    it rocks between two neighbouring keys so it never turns into a jackhammer.
 */
function normalizeRepeatedPitchRuns(prim, lanes) {
  const n = prim.length;
  let s = 0;
  while (s < n) {
    let e = s;
    while (e + 1 < n && prim[e + 1].midi === prim[s].midi && prim[e + 1].time - prim[e].time < 0.5 && !prim[e + 1].edgeReset) e++;
    const len = e - s + 1;
    if (len >= 2 && !prim.slice(s, e + 1).some((x) => x.fixedLane)) {
      let fastGaps = 0;
      for (let k = s + 1; k <= e; k++) if (prim[k].time - prim[k - 1].time < 0.145) fastGaps++;
      const base = prim[s].lane;
      // (a "da, da-da-da" of four strikes stays on one key even when quick, e.g. Arabesque 2:02 F FFF)
      if (len >= 6 || fastGaps >= 3) {
        const partner = base >= lanes / 2 ? base - 1 : base + 1;
        for (let k = s; k <= e; k++) {
          prim[k].lane = (k - s) % 2 === 0 ? base : partner;
          prim[k].altRun = true;
        }
      } else {
        // a one-key run on an edge key whose line then carries on past that edge moves one key inward, so the next
        // notes still have room (Arabesque 4:30: 81 81 81 81, 82, 81, 79 = F F F F J F D, not D D D D F D D)
        let b2 = base;
        const after = prim.slice(e + 1, e + 4).filter((x) => x.time - prim[e].time < 1.0);
        if (base === 0 && after.some((x) => x.midi < prim[s].midi)) b2 = 1;
        if (base === lanes - 1 && after.some((x) => x.midi > prim[s].midi)) b2 = lanes - 2;
        const before = s > 0 && prim[s].time - prim[s - 1].time < 0.8 ? prim[s - 1] : null;
        if (b2 !== base && before && before.midi !== prim[s].midi && Math.sign(prim[s].midi - before.midi) !== Math.sign(b2 - before.lane)) b2 = base;
        for (let k = s; k <= e; k++) prim[k].lane = b2;
      }
    }
    s = e + 1;
  }
}

/**
 * A quick re-strike of the same pitch (70–145ms, e.g. Sevens' accented 16th+8th "da-DAH" pairs) that is NOT part of a
 * run of fast repeats: playable as a quick double-tap on the same key. Runs of fast repeats still alternate keys.
 * `seq[k]` needs `.time` and `.midi` (works for runtime notes and for [t0, t1, midi, ...] rows via accessor).
 */
function isIsolatedQuickRestrike(seq, k, t = (x) => x.time, m = (x) => x.midi) {
  if (k < 1) return false;
  const gap = t(seq[k]) - t(seq[k - 1]);
  if (m(seq[k]) !== m(seq[k - 1]) || gap < 0.07 || gap >= 0.145) return false;
  const prevFast = k >= 2 && m(seq[k - 2]) === m(seq[k]) && t(seq[k - 1]) - t(seq[k - 2]) < 0.145;
  const nextFast = k + 1 < seq.length && m(seq[k + 1]) === m(seq[k]) && t(seq[k + 1]) - t(seq[k]) < 0.145;
  return !prevFast && !nextFast;
}

function pickCrossHandPartner(primaryLane, lanes) {
  const half = lanes >> 1;
  if (primaryLane < half) {
    const mirrored = lanes - 1 - primaryLane;
    return mirrored;
  } else {
    const mirrored = lanes - 1 - primaryLane;
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

  playHitSound({ lane = 0, totalLanes = 4, intensity = 0.5 }) {
    if (!this.ctx || this.hitsoundVolume <= 0.005) return;

    const now = this.ctx.currentTime;
    const dynamicScale = 0.45 + 0.55 * Math.max(0, Math.min(1, intensity));
    const gainLevel = this.hitsoundVolume * dynamicScale;

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
