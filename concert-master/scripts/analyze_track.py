#!/usr/bin/env python3
"""
CADENZA — Neural Stem Separation + Polyphonic Note Transcription Pre-Analyzer (Approach #2)

Pipeline:
  1. Meta Hybrid Transformer Demucs (`htdemucs` on Apple Silicon MPS / CPU) isolates:
       - Melodic Winds/Brass/Strings (`other` + `vocals` + high-passed tenor `bass`)
       - Percussion & Sub-Bass Impacts (`drums` + low `bass`) -> Spacebar
  2. Spotify Research `Basic Pitch` ONNX Neural Network (`predict` with `melodia_trick=True`
     and exact drift-free `model_frames_to_time`) transcribes polyphonic note events, followed
     by Acoustic-Verified Sustained Hold Fusion (merging vibrato/crescendo splits on held wind/
     brass/string notes while preserving crisp tongued repeats!).
  3. Voice-Leading + Chord-Skyline DAG Dynamic Programming selects the single cohesive
     monophonic Lead Melody line from the polyphonic transcription:
       - Harmonized brass/wind chords lock onto the Soprano/Lead voice on top
       - Sustained whole/half notes stay intact as true Hold Ribbons (never chopped!)
       - Fast melodic runs stay intact as crisp Taps
"""

import argparse
import hashlib
import json
import logging
import os
import subprocess
import sys
import tempfile
import time
import types
import warnings
from collections import defaultdict
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
warnings.filterwarnings("ignore")

import librosa
import numpy as np
import scipy.ndimage
import scipy.signal
import soundfile as sf
import torch


CACHE_DIR = Path(tempfile.gettempdir()) / "cadenza_ml_cache"


def load_stereo_44k(audio_path: Path) -> np.ndarray:
    """Decode any audio file (.mp3, .m4a, .flac, .wav, .ogg) to (2, N) float32 @ 44100 Hz."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_wav = tmp.name
    try:
        if os.path.exists("/usr/bin/afconvert"):
            subprocess.run(
                [
                    "/usr/bin/afconvert",
                    "-f",
                    "WAVE",
                    "-d",
                    "LEI16@44100",
                    "-c",
                    "2",
                    str(audio_path),
                    tmp_wav,
                ],
                check=True,
            )
            data, _ = sf.read(tmp_wav, dtype="float32", always_2d=True)
        else:
            y, _ = librosa.load(str(audio_path), sr=44100, mono=False)
            if y.ndim == 1:
                y = np.stack([y, y], axis=0)
            return y.astype(np.float32)
    finally:
        if os.path.exists(tmp_wav):
            os.remove(tmp_wav)
    return data.T  # (2, N)


def separate_stems_demucs(audio_path: Path, stereo_44k: np.ndarray):
    """Run Meta htdemucs (cached by file hash in TMPDIR so re-tuning is instant!)."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    stat = audio_path.stat()
    key = hashlib.md5(f"{audio_path.name}:{stat.st_size}:{int(stat.st_mtime)}".encode()).hexdigest()[:12]
    cache_npz = CACHE_DIR / f"{audio_path.stem}_{key}_stems22k.npz"

    if cache_npz.exists():
        print(f"  [1/4] Loaded cached Demucs stems ({cache_npz.name})...")
        d = np.load(cache_npz)
        return d["melodic"], d["drums"], d["bass"]

    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"  [1/4] Separating stems with htdemucs on {device.upper()}...")
    model = get_model("htdemucs")
    model.eval()
    model.to(device)

    wav_tensor = torch.from_numpy(stereo_44k).unsqueeze(0)
    ref = wav_tensor.mean(0)
    mean = ref.mean()
    std = ref.std() + 1e-8
    wav_norm = (wav_tensor - mean) / std

    try:
        with torch.no_grad():
            sources = apply_model(
                model,
                wav_norm.to(device),
                shifts=0,
                split=True,
                overlap=0.25,
                progress=False,
            )[0]
        sources = (sources.cpu() * std + mean).numpy()
    except Exception as exc:
        print(f"    (MPS fallback to CPU: {exc})")
        model.to("cpu")
        with torch.no_grad():
            sources = apply_model(
                model,
                wav_norm,
                shifts=0,
                split=True,
                overlap=0.25,
                progress=False,
            )[0]
        sources = (sources * std.numpy() + mean.numpy()).numpy()

    src_names = list(model.sources)
    drums = sources[src_names.index("drums")].mean(axis=0)
    bass = sources[src_names.index("bass")].mean(axis=0)
    other = sources[src_names.index("other")].mean(axis=0)
    vocals = sources[src_names.index("vocals")].mean(axis=0)

    # Keep tenor-brass / euphonium / cello melody (>155Hz) while stripping low tuba roots
    sos_hp = scipy.signal.butter(4, 155.0, btype="highpass", fs=44100, output="sos")
    tenor_bass = scipy.signal.sosfiltfilt(sos_hp, bass).astype(np.float32)
    melodic_44k = other + vocals + 0.30 * tenor_bass

    melodic_22k = librosa.resample(melodic_44k, orig_sr=44100, target_sr=22050).astype(np.float32)
    drums_22k = librosa.resample(drums, orig_sr=44100, target_sr=22050).astype(np.float32)
    bass_22k = librosa.resample(bass, orig_sr=44100, target_sr=22050).astype(np.float32)

    np.savez_compressed(cache_npz, melodic=melodic_22k, drums=drums_22k, bass=bass_22k)
    return melodic_22k, drums_22k, bass_22k


def is_genuine_same_pitch_articulation(
    t_boundary: float,
    gap: float,
    mel_rms: np.ndarray,
    mel_onset: np.ndarray,
    fps: float,
) -> bool:
    """
    Distinguishes a true physical re-articulation (tongued brass/woodwind repeat, bow change,
    piano strike) from Basic Pitch splitting a continuous sustained wind/string note on vibrato
    or crescendo swells.
    """
    if gap > 0.048:
        return True  # Distinct silence / neural sustain drop between notes

    ai = int(round(t_boundary * fps))
    if ai <= 2 or ai >= len(mel_rms) - 3:
        return False

    ac_pk = float(np.max(mel_onset[max(0, ai - 2) : min(len(mel_onset), ai + 3)]))
    ac_med = float(np.median(mel_onset[max(0, ai - 25) : min(len(mel_onset), ai + 25)])) + 1e-6
    ac_rel = ac_pk / ac_med

    r_pre = float(np.max(mel_rms[max(0, ai - 10) : max(1, ai - 1)])) + 1e-6
    r_min = float(np.min(mel_rms[max(0, ai - 3) : min(len(mel_rms), ai + 2)]))
    r_post = float(np.max(mel_rms[ai : min(len(mel_rms), ai + 8)]))
    rms_dip = r_min / r_pre
    rms_rebound = r_post / (r_min + 1e-6)

    # 1. Crisp spectral attack spike (e.g. tongued F5-F5-F5 in Folk Dance: ac_rel = 1.62x..2.34x)
    if ac_rel >= 1.58 and ac_pk >= 1.15:
        return True

    # 2. Audible articulation valley + rebound (e.g. legato-tongued C#5 or Thaxted "to thee": dip <= 0.56)
    if rms_dip <= 0.56 and rms_rebound >= 1.28:
        return True

    return False


def fuse_sustained_same_pitch_notes(notes: list, mel_rms: np.ndarray, mel_onset: np.ndarray, fps: float) -> list:
    """Fuses back-to-back segments of the exact same MIDI pitch when no physical articulation occurred."""
    by_pitch = defaultdict(list)
    for n in notes:
        by_pitch[n["midi"]].append(dict(n))

    fused_all = []
    for midi, group in by_pitch.items():
        group.sort(key=lambda x: x["start"])
        merged = [group[0]]
        for nxt in group[1:]:
            cur = merged[-1]
            gap = nxt["start"] - cur["end"]
            dt_onsets = nxt["start"] - cur["start"]
            # Ensemble unison entrance spread: two players attacking the same unison note <122ms apart
            # with zero gap, or a <165ms section stagger directly into a sustained (>=0.35s) hold
            is_unison_stagger = gap <= 0.030 and (
                dt_onsets < 0.122 or (cur["dur"] < 0.165 and nxt["dur"] >= 0.35)
            )
            if is_unison_stagger or (
                gap <= 0.075
                and not is_genuine_same_pitch_articulation(
                    nxt["start"], max(0.0, gap), mel_rms, mel_onset, fps
                )
            ):
                new_end = max(cur["end"], nxt["end"])
                d1 = max(0.02, cur["dur"])
                d2 = max(0.02, nxt["dur"])
                cur["amp"] = float((cur["amp"] * d1 + nxt["amp"] * d2) / (d1 + d2))
                cur["end"] = float(new_end)
                cur["dur"] = float(new_end - cur["start"])
            else:
                merged.append(nxt)
        fused_all.extend(merged)

    fused_all.sort(key=lambda x: (x["start"], -x["midi"]))
    return fused_all


def transcribe_polyphonic_notes_basic_pitch(audio_path: Path, melodic_22k: np.ndarray):
    """
    Uses Spotify's official `basic_pitch.inference.predict` with the ONNX model and
    `melodia_trick=True` + exact drift-free `model_frames_to_time`, then fuses vibrato/crescendo
    splits on sustained notes using acoustic envelope verification.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    stat = audio_path.stat()
    key = hashlib.md5(f"{audio_path.name}:{stat.st_size}:{int(stat.st_mtime)}".encode()).hexdigest()[:12]
    bp_cache = CACHE_DIR / f"{audio_path.stem}_{key}_bp_raw.json"

    if bp_cache.exists():
        print(f"  [2/4] Loaded cached Basic Pitch ONNX transcription ({bp_cache.name})...")
        with open(bp_cache, "r", encoding="utf-8") as f:
            raw_notes = json.load(f)
    else:
        sys.modules.setdefault("mir_eval", types.ModuleType("mir_eval"))
        logging.getLogger().setLevel(logging.ERROR)
        import basic_pitch
        from basic_pitch.inference import Model, predict

        print("  [2/4] Transcribing polyphonic notes with Spotify Basic Pitch (ONNX)...")
        pkg_dir = Path(basic_pitch.__file__).parent
        onnx_path = next(pkg_dir.rglob("*.onnx"))
        bp_model = Model(onnx_path)

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            mel_wav = tmp.name
        try:
            sf.write(mel_wav, melodic_22k, 22050)
            _model_output, _midi_data, note_events = predict(
                mel_wav,
                bp_model,
                onset_threshold=0.46,
                frame_threshold=0.27,
                minimum_note_length=58.0,  # ms (~5 frames, preserves crisp fast 16ths while rejecting glitches)
                minimum_frequency=110.0,   # A2
                maximum_frequency=2093.0,  # C7
                multiple_pitch_bends=False,
                melodia_trick=True,
            )
        finally:
            if os.path.exists(mel_wav):
                os.remove(mel_wav)

        raw_notes = []
        for start_s, end_s, pitch_midi, amp, _bends in note_events:
            dur = float(end_s - start_s)
            if dur >= 0.048 and 45 <= int(pitch_midi) <= 96:
                raw_notes.append(
                    {
                        "start": float(start_s),
                        "end": float(end_s),
                        "dur": dur,
                        "midi": int(pitch_midi),
                        "amp": float(amp),
                    }
                )
        with open(bp_cache, "w", encoding="utf-8") as f:
            json.dump(raw_notes, f)

    fps = 22050.0 / 256.0
    mel_rms = librosa.feature.rms(y=melodic_22k, frame_length=512, hop_length=256, center=True)[0]
    mel_onset = librosa.onset.onset_strength(y=melodic_22k, sr=22050, hop_length=256, n_fft=1024)

    fused_notes = fuse_sustained_same_pitch_notes(raw_notes, mel_rms, mel_onset, fps)
    print(
        f"    -> Transcribed {len(raw_notes)} raw polyphonic events -> {len(fused_notes)} after sustained-hold fusion."
    )
    return fused_notes, mel_rms, mel_onset


def select_monophonic_lead_melody(
    poly_notes: list,
    full_mix_22k: np.ndarray,
    mel_rms: np.ndarray,
    mel_onset: np.ndarray,
):
    """
    Selects the single cohesive Lead Melody line from Basic Pitch's polyphonic note events
    via Weighted DAG Dynamic Programming (Interval Scheduling + Voice-Leading):
      - Soprano/Skyline chord bonus: in simultaneous brass/wind chords, favors the top lead note
      - Anti-Ostinato damper: penalizes background 2-3 note accompaniment loops when a stronger voice plays
      - Sustain Integrity: a 2.2s held whole note outscores scattered weak background blips inside it!
    """
    print("  [3/4] Solving global Lead-Melody DAG (Chord Skyline + Voice-Leading DP)...")
    if not poly_notes:
        return [], np.zeros(10, dtype=np.float32)

    mix_rms = librosa.feature.rms(y=full_mix_22k, frame_length=1024, hop_length=256, center=True)[0]
    noise_gate = float(np.max(mix_rms)) * 0.0045
    fps = 22050.0 / 256.0

    # Filter notes during true silence
    filtered = []
    for n in poly_notes:
        f_mid = min(len(mix_rms) - 1, max(0, int(((n["start"] + n["end"]) * 0.5) * fps)))
        if mix_rms[f_mid] >= noise_gate:
            filtered.append(dict(n))

    K = len(filtered)
    if K == 0:
        return [], mix_rms

    # 1. Compute Chord-Skyline Bonus & Anti-Ostinato Score per candidate note!
    for i, ni in enumerate(filtered):
        t0 = ni["start"]
        m = ni["midi"]

        # Register prior: sweet spot G3 (55) .. C6 (84)
        if 55 <= m <= 84:
            reg = 1.0 + 0.08 * np.sin(((m - 55) / 29.0) * np.pi)
        elif m < 55:
            reg = max(0.32, 1.0 - (55 - m) * 0.085)
        else:
            reg = max(0.35, 1.0 - (m - 84) * 0.06)

        # Simultaneous chord peers attacking within ±48ms
        peers = []
        j = i - 1
        while j >= 0 and t0 - filtered[j]["start"] <= 0.048:
            peers.append(filtered[j])
            j -= 1
        j = i + 1
        while j < K and filtered[j]["start"] - t0 <= 0.048:
            peers.append(filtered[j])
            j += 1

        skyline_mult = 1.0
        if peers:
            all_chord = peers + [ni]
            max_amp = max(c["amp"] for c in all_chord)
            # Confident lead-register chord tones (within 55..84 and >= 52% of chord max velocity)
            lead_tones = [
                c["midi"]
                for c in all_chord
                if 55 <= c["midi"] <= 84 and c["amp"] >= max_amp * 0.52
            ]
            if len(lead_tones) >= 2:
                top_midi = max(lead_tones)
                if m == top_midi:
                    skyline_mult = 1.44  # Top voice of brass/wind chord = 1st Trumpet / Soprano Melody!
                elif m < top_midi:
                    skyline_mult = 0.76  # Inner alto/tenor harmony pad

        # Anti-ostinato repetition check: how many times did this exact pitch (±1) repeat in ±1.5s?
        same_pitch_hits = 0
        for j in range(max(0, i - 35), min(K, i + 35)):
            if j != i and abs(filtered[j]["start"] - t0) <= 1.5 and abs(filtered[j]["midi"] - m) <= 1:
                if filtered[j]["dur"] < 0.18:
                    same_pitch_hits += 1
        ostinato_mult = max(0.62, 1.0 - max(0, same_pitch_hits - 4) * 0.07)

        # Note intrinsic value: scales with BOTH onset punch + sustained duration
        # so long melody holds (e.g. 2.4s whole notes & Thaxted half-notes) naturally resist fragmentation!
        unit_w = (ni["amp"] ** 1.15) * reg * skyline_mult * ostinato_mult
        eff_dur = min(ni["dur"], 3.4)
        ni["unit_w"] = unit_w
        ni["score"] = (0.32 + 1.18 * eff_dur) * unit_w

    # 2. DAG Dynamic Programming over Discrete Polyphonic Notes
    dp = np.zeros(K, dtype=np.float64)
    prev_idx = np.full(K, -1, dtype=np.int32)
    ptr = 0
    max_completed_dp = 0.0
    max_completed_idx = -1

    for j in range(K):
        nj = filtered[j]
        tj0 = nj["start"]
        mj = nj["midi"]
        base_score = nj["score"]

        # Advance O(1) frontier for notes >4.5s before tj0 so grand pauses/fermatas never sever multi-movement works!
        while ptr < j and (tj0 - filtered[ptr]["start"]) > 4.5:
            rem_ov = max(0.0, filtered[ptr]["end"] - tj0)
            adj_dp = dp[ptr] - (1.18 * rem_ov * filtered[ptr]["unit_w"] if rem_ov > 0.05 else 0.0)
            if adj_dp > max_completed_dp:
                max_completed_dp = adj_dp
                max_completed_idx = ptr
            ptr += 1

        # Option A: start at piece opening OR resume seamlessly after a grand pause / percussion cadenza
        if max_completed_idx >= 0:
            best_val = max_completed_dp + base_score - 0.88
            best_p = max_completed_idx
        else:
            best_val = base_score - 0.15
            best_p = -1

        # Look back up to ~4.8 seconds (or 320 candidate notes in dense organ/band clusters) for predecessor i
        for i in range(j - 1, max(-1, j - 320), -1):
            ni = filtered[i]
            dt_starts = tj0 - ni["start"]
            if dt_starts < 0.068:
                continue  # Simultaneous chord tone or micro-flam -> cannot both be in monophonic line
            if dt_starts > 4.8:
                break

            # Exact conservation of sustain reward if j truncates predecessor i early
            overlap = max(0.0, ni["end"] - tj0)
            dm = abs(mj - ni["midi"])
            if overlap > 0.055:
                eff_full = min(ni["dur"], 3.4)
                eff_kept = min(max(0.04, dt_starts), 3.4)
                trunc_loss = 1.18 * max(0.0, eff_full - eff_kept) * ni["unit_w"]
                # Prevent weak background inner voices or accompaniment leaps from interrupting a held melody note!
                if nj["amp"] < ni["amp"] * 0.86:
                    trunc_loss += 0.45
                elif dm >= 7 and overlap > 0.22:
                    trunc_loss += 0.32
            else:
                trunc_loss = 0.0

            gap = max(0.0, tj0 - ni["end"])

            # Voice-leading pitch interval cost
            if dm == 0:
                p_cost = 0.04
            elif dm <= 2:
                p_cost = 0.02  # Scale steps are maximally idiomatic!
            elif dm <= 5:
                p_cost = 0.08 + (dm - 2) * 0.03
            elif dm <= 7:
                p_cost = 0.24
            elif dm < 12:
                p_cost = 0.38 + (dm - 7) * 0.08
            else:
                short_gap_mult = 1.65 if gap < 0.35 else 0.95
                p_cost = (0.78 + (dm - 12) * 0.09) * short_gap_mult

            gap_cost = min(0.85, gap * 0.22)

            cand = dp[i] + base_score - trunc_loss - p_cost - gap_cost
            if cand > best_val:
                best_val = cand
                best_p = i

        dp[j] = best_val
        prev_idx[j] = best_p

    # Backtrack optimal monophonic melody sequence
    end_j = int(np.argmax(dp))
    chosen = []
    cur = end_j
    while cur >= 0:
        chosen.append(dict(filtered[cur]))
        cur = int(prev_idx[cur])
    chosen.reverse()

    # Final pass: fuse any consecutive same-pitch notes on the monophonic line that lack real articulation
    chosen = fuse_sustained_same_pitch_notes(chosen, mel_rms, mel_onset, fps)

    # Trim slight legato overlaps so note i ends cleanly before note i+1 starts
    for k in range(len(chosen) - 1):
        if chosen[k]["end"] > chosen[k + 1]["start"] - 0.02:
            chosen[k]["end"] = max(chosen[k]["start"] + 0.04, chosen[k + 1]["start"] - 0.02)
            chosen[k]["dur"] = chosen[k]["end"] - chosen[k]["start"]

    # Compute local melodic activity (notes/sec over ±2.3s window) & Tier 1 (Fewer) vs Tier 2 (More)
    T = len(mix_rms)
    frame_dt = 256.0 / 22050.0
    impulse = np.zeros(T, dtype=np.float32)
    for n in chosen:
        f_idx = min(T - 1, max(0, int(round(n["start"] / frame_dt))))
        impulse[f_idx] = 1.0

    rate_curve = scipy.ndimage.uniform_filter1d(impulse, size=max(10, int(round(4.6 / frame_dt)))) / frame_dt
    act_curve = np.clip((rate_curve - 1.55) / 2.35, 0.0, 1.0)
    act_curve = scipy.ndimage.uniform_filter1d(act_curve, size=max(6, int(round(2.0 / frame_dt))))

    melody_out = []
    last_t1 = -10.0
    for n in chosen:
        f_idx = min(T - 1, max(0, int(round(n["start"] / frame_dt))))
        act = float(act_curve[f_idx])
        min_t1_gap = 0.38 if act < 0.40 else 0.148

        # Long sustained notes (>= 0.48s) ALWAYS promote to Tier 1 so whole/half holds are never skipped!
        if n["dur"] >= 0.48 or (n["start"] - last_t1) >= min_t1_gap:
            tier = 1
            last_t1 = n["start"]
        else:
            tier = 2

        melody_out.append(
            [
                round(n["start"], 4),
                round(n["end"], 4),
                int(n["midi"]),
                round(min(1.0, n["amp"] * 1.15), 3),
                tier,
                round(act, 3),
            ]
        )

    return melody_out, mix_rms


def extract_drum_bass_impacts(drums_22k: np.ndarray, bass_22k: np.ndarray, mix_rms: np.ndarray, frame_dt: float):
    """Extract surgical Spacebar impacts directly from Demucs isolated `drums` + low `bass` stems."""
    print("  [4/4] Extracting percussion & timpani impacts from isolated drum/bass stems...")
    sos_lp = scipy.signal.butter(4, 145.0, btype="lowpass", fs=22050, output="sos")
    sub_bass = scipy.signal.sosfiltfilt(sos_lp, bass_22k).astype(np.float32)
    perc_mix = drums_22k + 0.55 * sub_bass

    onset_env = librosa.onset.onset_strength(y=perc_mix, sr=22050, hop_length=256)
    T = min(len(onset_env), len(mix_rms))
    onset_env = onset_env[:T]

    pos_vals = onset_env[onset_env > 0.05]
    p90 = float(np.percentile(pos_vals, 90)) if len(pos_vals) > 20 else 1.0
    peaks = librosa.util.peak_pick(
        onset_env,
        pre_max=4,
        post_max=4,
        pre_avg=25,
        post_avg=25,
        delta=max(0.22, p90 * 0.40),
        wait=20,
    )

    impacts = []
    max_mix = float(np.max(mix_rms)) + 1e-8
    for pk in peaks:
        if mix_rms[pk] < max_mix * 0.05:
            continue
        strength = float(np.clip(onset_env[pk] / (p90 * 1.45 + 1e-6), 0.0, 1.5))
        if strength >= 0.38:
            impacts.append([round(int(pk) * frame_dt, 4), round(strength, 3)])

    return impacts


def compute_macro_profiles(mix_rms: np.ndarray, frame_dt: float, duration: float):
    win = max(3, int(round(1.4 / frame_dt)))
    sm = np.log1p(18.0 * scipy.ndimage.uniform_filter1d(mix_rms, size=win))
    p_lo = float(np.percentile(sm, 6))
    p_hi = float(np.percentile(sm, 98.5))
    macro = np.clip((sm - p_lo) / max(1e-5, p_hi - p_lo), 0.0, 1.0)

    elev = [round(float(chunk.mean()), 4) for chunk in np.array_split(macro, 240)]
    macro_hz = 10
    n_out = max(1, int(round(duration * macro_hz)))
    macro_10hz = [round(float(chunk.mean()), 4) for chunk in np.array_split(macro, n_out)]
    return elev, macro_hz, macro_10hz


def process_file(audio_path: Path):
    t0 = time.time()
    print(f"\n=== Analyzing {audio_path.name} ===")
    stereo_44k = load_stereo_44k(audio_path)
    duration = stereo_44k.shape[1] / 44100.0
    full_mix_22k = librosa.resample(stereo_44k.mean(axis=0), orig_sr=44100, target_sr=22050)
    frame_dt = 256.0 / 22050.0

    melodic_22k, drums_22k, bass_22k = separate_stems_demucs(audio_path, stereo_44k)
    poly_notes, mel_rms, mel_onset = transcribe_polyphonic_notes_basic_pitch(audio_path, melodic_22k)
    melody_notes, mix_rms = select_monophonic_lead_melody(poly_notes, full_mix_22k, mel_rms, mel_onset)
    impacts = extract_drum_bass_impacts(drums_22k, bass_22k, mix_rms, frame_dt)
    elev, macro_hz, macro_10hz = compute_macro_profiles(mix_rms, frame_dt, duration)

    out_path = audio_path.with_suffix(".cadenza.json")
    payload = {
        "version": 1,
        "generator": "htdemucs+basic_pitch_dag_v3",
        "duration": round(duration, 3),
        "elevationProfile": elev,
        "macroHz": macro_hz,
        "macroIntensity": macro_10hz,
        "melodyNotes": melody_notes,
        "impacts": impacts,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    tier1 = sum(1 for n in melody_notes if n[4] == 1)
    holds = sum(1 for n in melody_notes if (n[1] - n[0]) >= 0.50)
    print(
        f"✓ Saved {out_path.name} ({os.path.getsize(out_path) / 1024:.1f} KB) in {time.time() - t0:.1f}s "
        f"| Tier-1={tier1}, Total={len(melody_notes)}, Sustained(>=0.50s)={holds}, Impacts={len(impacts)}"
    )


def main():
    parser = argparse.ArgumentParser(description="Generate Neural ML Cadenza sidecar (.cadenza.json)")
    parser.add_argument("files", nargs="+", help="Audio files (.mp3, .m4a, .flac, .wav, .ogg)")
    args = parser.parse_args()
    for f in args.files:
        process_file(Path(f))


if __name__ == "__main__":
    main()
