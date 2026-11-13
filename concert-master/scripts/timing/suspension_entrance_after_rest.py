"""If a legato-suspension entrance after a rest (>= 1.5s gap, e.g. What We Do m.85 after the m.84 timpani roll)

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a_ons_raw = ns.get('a_ons_raw', MISSING)
    b1 = ns.get('b1', MISSING)
    b_half = ns.get('b_half', MISSING)
    bin_hz = ns.get('bin_hz', MISSING)
    cand_t = ns.get('cand_t', MISSING)
    dt = ns.get('dt', MISSING)
    duration = ns.get('duration', MISSING)
    f0_hz = ns.get('f0_hz', MISSING)
    f_shi = ns.get('f_shi', MISSING)
    f_slo = ns.get('f_slo', MISSING)
    fi_rel = ns.get('fi_rel', MISSING)
    gap_prev = ns.get('gap_prev', MISSING)
    idx_n = ns.get('idx_n', MISSING)
    is_final_note = ns.get('is_final_note', MISSING)
    is_low_triplet = ns.get('is_low_triplet', MISSING)
    key_shift = ns.get('key_shift', MISSING)
    lead_score_notes = ns.get('lead_score_notes', MISSING)
    midi_concert = ns.get('midi_concert', MISSING)
    min_step_next = ns.get('min_step_next', MISSING)
    min_step_prev = ns.get('min_step_prev', MISSING)
    n = ns.get('n', MISSING)
    n_cur = ns.get('n_cur', MISSING)
    n_nxt = ns.get('n_nxt', MISSING)
    next_raw = ns.get('next_raw', MISSING)
    np = ns.get('np', MISSING)
    p1 = ns.get('p1', MISSING)
    p_clean = ns.get('p_clean', MISSING)
    p_pk = ns.get('p_pk', MISSING)
    p_sub = ns.get('p_sub', MISSING)
    prev_midi = ns.get('prev_midi', MISSING)
    prev_score_dur = ns.get('prev_score_dur', MISSING)
    prev_snapped_start = ns.get('prev_snapped_start', MISSING)
    raw_ends = ns.get('raw_ends', MISSING)
    raw_starts = ns.get('raw_starts', MISSING)
    s_dur = ns.get('s_dur', MISSING)
    scipy = ns.get('scipy', MISSING)
    score_dur_n = ns.get('score_dur_n', MISSING)
    score_gap_prev = ns.get('score_gap_prev', MISSING)
    search_lo_t = ns.get('search_lo_t', MISSING)
    snap_f = ns.get('snap_f', MISSING)
    snap_note_to_harmonic_onset = ns.get('snap_note_to_harmonic_onset', MISSING)
    stft_mag = ns.get('stft_mag', MISSING)
    sus_frames = ns.get('sus_frames', MISSING)
    te = ns.get('te', MISSING)
    te_raw = ns.get('te_raw', MISSING)
    ts = ns.get('ts', MISSING)
    ts_raw = ns.get('ts_raw', MISSING)
    warped = ns.get('warped', MISSING)

    # If a legato-suspension entrance after a rest (>= 1.5s gap, e.g. What We Do m.85 after the m.84 timpani roll)
    # was pulled early by DTW waiting horizontally across the rest, restore its true bar duration from the next bar!
    for idx_n in range(len(lead_score_notes) - 1):
        n_cur = lead_score_notes[idx_n]
        n_nxt = lead_score_notes[idx_n + 1]
        gap_prev = float(n_cur["start"] - lead_score_notes[idx_n - 1]["end"]) if idx_n > 0 else 99.0
        s_dur = float(n_nxt["start"] - n_cur["start"])  # score inter-onset interval to the next bar
        if (
            n_cur.get("is_legato_suspension")
            and gap_prev >= 1.5
            and n_nxt["staff"] == n_cur["staff"]
            and (raw_starts[idx_n + 1] - raw_starts[idx_n]) > s_dur * 1.15
        ):
            raw_starts[idx_n] = raw_starts[idx_n + 1] - s_dur

    warped = []
    prev_snapped_start = 0.05
    for idx_n, n in enumerate(lead_score_notes):
        ts_raw = raw_starts[idx_n]
        te_raw = raw_ends[idx_n]
        next_raw = raw_starts[idx_n + 1] if idx_n + 1 < len(lead_score_notes) else duration - 0.15
        midi_concert = int(n["midi"] + key_shift)

        score_gap_prev = float(n["start"] - lead_score_notes[idx_n - 1]["end"]) if idx_n > 0 else 99.0
        score_dur_n = float(n["end"] - n["start"])

        # For sustained solo entrances after silence (e.g. m.2 ppp Solo Flute G5, m.12 Solo Flute F5),
        # detect the true harmonic emergence foot if soft breath rubato entered earlier than coarse DTW!
        if not n.get("is_legato_suspension") and score_gap_prev >= 1.8 and score_dur_n >= 0.45 and midi_concert >= 58:
            search_lo_t = max((warped[-1]["end"] + 1.2) if warped else 2.2, ts_raw - 2.6)
            f_slo = max(4, int(round(search_lo_t / dt)))
            f_shi = min(stft_mag.shape[1] - 10, int(round((te_raw - 0.25) / dt)))
            if f_shi > f_slo + 35:
                bin_hz = 22050.0 / 2048.0
                f0_hz = 440.0 * (2.0 ** ((midi_concert - 69) / 12.0))
                b1 = int(round(f0_hz / bin_hz))
                b_half = int(round((f0_hz * 0.5) / bin_hz))
                if 3 <= b1 < stft_mag.shape[0] - 3:
                    p1 = scipy.ndimage.gaussian_filter1d(np.max(stft_mag[b1 - 1 : b1 + 2, f_slo:f_shi], axis=0), sigma=2.0)
                    p_sub = scipy.ndimage.gaussian_filter1d(np.max(stft_mag[max(1, b_half - 1) : b_half + 2, f_slo:f_shi], axis=0), sigma=2.0)
                    p_clean = np.maximum(0.0, p1 - 0.65 * p_sub)
                    p_pk = float(np.max(p_clean))
                    sus_frames = max(8, int(round(0.32 / dt)))
                    if p_pk > 1e-4 and float(np.median(p_clean[:8])) < 0.12 * p_pk:
                        for fi_rel in range(6, len(p_clean) - sus_frames):
                            if p_clean[fi_rel] >= 0.24 * p_pk and float(np.mean(p_clean[fi_rel : fi_rel + sus_frames])) >= 0.28 * p_pk:
                                cand_t = float((f_slo + fi_rel) * dt)
                                if cand_t < ts_raw - 0.20:
                                    ts_raw = cand_t
                                break

        is_final_note = idx_n == len(lead_score_notes) - 1
        prev_score_dur = float(lead_score_notes[idx_n - 1]["end"] - lead_score_notes[idx_n - 1]["start"]) if idx_n > 0 else 0.5
        prev_midi = int(lead_score_notes[idx_n - 1]["midi"]) if idx_n > 0 else -1
        is_low_triplet = midi_concert <= 65 and 0.076 <= score_dur_n <= 0.095
        if n.get("is_scalar_lick"):
            ts = max(prev_snapped_start + 0.049, ts_raw)
        elif is_low_triplet:
            ts = max(prev_snapped_start + 0.055, ts_raw)
        elif n.get("is_accel_ostinato") or n.get("is_ostinato_landing") or n.get("is_legato_suspension"):
            ts = max(0.02, ts_raw) if idx_n == 0 else max(prev_snapped_start + 0.045, ts_raw)
        else:
            min_step_prev = min(0.115, max(0.060, prev_score_dur * 0.76))
            min_step_next = min(0.115, max(0.060, score_dur_n * 0.76))
            if is_final_note:
                snap_f = 18
            elif (midi_concert == prev_midi and score_dur_n <= 0.18) or (
                midi_concert <= 65 and score_dur_n <= 0.145
            ):
                # Repeated pitch on a 16th note or low-register 16th-note run:
                # keep anchored to the beat grid so it never gets pulled onto off-beat percussion transients!
                snap_f = 1
            elif score_dur_n <= 0.16 or prev_score_dur <= 0.16:
                snap_f = 3
            elif score_dur_n <= 0.32:
                snap_f = 5
            elif midi_concert <= 54:
                snap_f = 12
            else:
                snap_f = 8
            ts = snap_note_to_harmonic_onset(
                ts_raw,
                midi_concert,
                stft_mag,
                a_ons_raw,
                dt,
                t_min=0.02 if (idx_n == 0 and ts_raw < 0.12) else max(0.12, prev_snapped_start + min_step_prev),
                t_max=min(duration - 0.25, next_raw - min_step_next),
                max_snap_frames=snap_f,
            )
        te = max(ts + 0.04, te_raw)
        if (0.02 if idx_n == 0 else 0.12) <= ts <= duration - 0.25:
            warped.append(
                {
                    "start": ts,
                    "end": min(duration - 0.1, te),
                    "dur": te - ts,
                    "midi": midi_concert,
                    "conf": float(np.clip(n["vel"] / 110.0, 0.45, 1.0)),
                    "staff": n["staff"],
                    "score_dur": score_dur_n,
                    "score_gap_prev": score_gap_prev,
                    "is_accel_ostinato": bool(n.get("is_accel_ostinato", False)),
                    "is_ostinato_landing": bool(n.get("is_ostinato_landing", False)),
                    "is_scalar_lick": bool(n.get("is_scalar_lick", False)),
                    "is_legato_suspension": bool(n.get("is_legato_suspension", False)),
                    "is_coda_fanfare_tap": bool(n.get("is_coda_fanfare_tap", False)),
                    "band_hold": int(n.get("band_hold", 0)),
                    "is_perc_tap": bool(n.get("is_perc_tap", False)),
                    "keep_hold": bool(n.get("keep_hold", False)),
                    "is_spliced": bool(n.get("is_spliced", False)),
                    "is_low_walk": bool(n.get("is_low_walk", False)),
                    "is_forced_hold": bool(n.get("is_forced_hold", False)),
                    "lane_hint": n.get("lane_hint"),
                    "local_hint": n.get("local_hint"),
                    "local_hint_votes": bool(n.get("local_hint_votes", False)),
                    "score_start": float(n.get("score_start", n["start"])),
                }
            )
            prev_snapped_start = ts

    if b1 is not MISSING:
        ns['b1'] = b1
    if b_half is not MISSING:
        ns['b_half'] = b_half
    if bin_hz is not MISSING:
        ns['bin_hz'] = bin_hz
    if cand_t is not MISSING:
        ns['cand_t'] = cand_t
    if f0_hz is not MISSING:
        ns['f0_hz'] = f0_hz
    if f_shi is not MISSING:
        ns['f_shi'] = f_shi
    if f_slo is not MISSING:
        ns['f_slo'] = f_slo
    if fi_rel is not MISSING:
        ns['fi_rel'] = fi_rel
    if gap_prev is not MISSING:
        ns['gap_prev'] = gap_prev
    if idx_n is not MISSING:
        ns['idx_n'] = idx_n
    if is_final_note is not MISSING:
        ns['is_final_note'] = is_final_note
    if is_low_triplet is not MISSING:
        ns['is_low_triplet'] = is_low_triplet
    if midi_concert is not MISSING:
        ns['midi_concert'] = midi_concert
    if min_step_next is not MISSING:
        ns['min_step_next'] = min_step_next
    if min_step_prev is not MISSING:
        ns['min_step_prev'] = min_step_prev
    if n is not MISSING:
        ns['n'] = n
    if n_cur is not MISSING:
        ns['n_cur'] = n_cur
    if n_nxt is not MISSING:
        ns['n_nxt'] = n_nxt
    if next_raw is not MISSING:
        ns['next_raw'] = next_raw
    if p1 is not MISSING:
        ns['p1'] = p1
    if p_clean is not MISSING:
        ns['p_clean'] = p_clean
    if p_pk is not MISSING:
        ns['p_pk'] = p_pk
    if p_sub is not MISSING:
        ns['p_sub'] = p_sub
    if prev_midi is not MISSING:
        ns['prev_midi'] = prev_midi
    if prev_score_dur is not MISSING:
        ns['prev_score_dur'] = prev_score_dur
    if prev_snapped_start is not MISSING:
        ns['prev_snapped_start'] = prev_snapped_start
    if s_dur is not MISSING:
        ns['s_dur'] = s_dur
    if score_dur_n is not MISSING:
        ns['score_dur_n'] = score_dur_n
    if score_gap_prev is not MISSING:
        ns['score_gap_prev'] = score_gap_prev
    if search_lo_t is not MISSING:
        ns['search_lo_t'] = search_lo_t
    if snap_f is not MISSING:
        ns['snap_f'] = snap_f
    if sus_frames is not MISSING:
        ns['sus_frames'] = sus_frames
    if te is not MISSING:
        ns['te'] = te
    if te_raw is not MISSING:
        ns['te_raw'] = te_raw
    if ts is not MISSING:
        ns['ts'] = ts
    if ts_raw is not MISSING:
        ns['ts_raw'] = ts_raw
    if warped is not MISSING:
        ns['warped'] = warped
