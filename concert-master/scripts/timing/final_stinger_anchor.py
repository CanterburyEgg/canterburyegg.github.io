"""If the piece ends with a sustained crescendo bridge hold leading into a final tutti stinger slam

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a0_coda = ns.get('a0_coda', MISSING)
    a_ons_raw = ns.get('a_ons_raw', MISSING)
    dt = ns.get('dt', MISSING)
    en_k = ns.get('en_k', MISSING)
    f_stinger = ns.get('f_stinger', MISSING)
    gap_prev = ns.get('gap_prev', MISSING)
    idx_coda0 = ns.get('idx_coda0', MISSING)
    k_c = ns.get('k_c', MISSING)
    last_loud_f = ns.get('last_loud_f', MISSING)
    lead_score_notes = ns.get('lead_score_notes', MISSING)
    loud_frames = ns.get('loud_frames', MISSING)
    max_r = ns.get('max_r', MISSING)
    mix_rms = ns.get('mix_rms', MISSING)
    np = ns.get('np', MISSING)
    raw_ends = ns.get('raw_ends', MISSING)
    raw_starts = ns.get('raw_starts', MISSING)
    s0_coda = ns.get('s0_coda', MISSING)
    s1_coda = ns.get('s1_coda', MISSING)
    s_win_hi = ns.get('s_win_hi', MISSING)
    s_win_lo = ns.get('s_win_lo', MISSING)
    slope_coda = ns.get('slope_coda', MISSING)
    st_k = ns.get('st_k', MISSING)
    t_stinger = ns.get('t_stinger', MISSING)

    # If the piece ends with a sustained crescendo bridge hold leading into a final tutti stinger slam
    # (e.g. Sevens mm.130-133 at 3:40-3:46), anchor the final stinger directly onto the last major acoustic
    # slam peak before silence and pace the final phrase cleanly into that climax!
    if len(lead_score_notes) >= 4 and lead_score_notes[-1].get("is_coda_final_stinger"):
        max_r = float(np.max(mix_rms)) + 1e-6
        loud_frames = np.where(mix_rms >= max_r * 0.40)[0]
        if len(loud_frames) > 0:
            last_loud_f = int(loud_frames[-1])
            s_win_lo = max(0, last_loud_f - int(round(0.45 / dt)))
            s_win_hi = min(len(mix_rms), last_loud_f + int(round(0.10 / dt)) + 1)
            f_stinger = s_win_lo + int(np.argmax(a_ons_raw[s_win_lo:s_win_hi] * mix_rms[s_win_lo:s_win_hi]))
            t_stinger = float(f_stinger * dt)
            idx_coda0 = len(lead_score_notes) - 1
            while idx_coda0 > 0:
                gap_prev = float(lead_score_notes[idx_coda0]["start"] - lead_score_notes[idx_coda0 - 1]["end"])
                if gap_prev >= 0.75 and (float(lead_score_notes[-1]["start"]) - float(lead_score_notes[idx_coda0]["start"])) >= 4.0:
                    break
                idx_coda0 -= 1
            s0_coda = float(lead_score_notes[idx_coda0]["start"])
            s1_coda = float(lead_score_notes[-1]["start"])
            a0_coda = float(raw_starts[idx_coda0])
            if s1_coda > s0_coda + 2.0 and t_stinger > a0_coda + 2.0:
                slope_coda = (t_stinger - a0_coda) / (s1_coda - s0_coda)
                for k_c in range(idx_coda0, len(lead_score_notes)):
                    st_k = float(lead_score_notes[k_c]["start"])
                    en_k = float(lead_score_notes[k_c]["end"])
                    raw_starts[k_c] = a0_coda + (st_k - s0_coda) * slope_coda
                    raw_ends[k_c] = a0_coda + (en_k - s0_coda) * slope_coda - (0.012 if (en_k - st_k) < 0.5 else 0.04)
                    lead_score_notes[k_c]["is_legato_suspension"] = True

    if a0_coda is not MISSING:
        ns['a0_coda'] = a0_coda
    if en_k is not MISSING:
        ns['en_k'] = en_k
    if f_stinger is not MISSING:
        ns['f_stinger'] = f_stinger
    if gap_prev is not MISSING:
        ns['gap_prev'] = gap_prev
    if idx_coda0 is not MISSING:
        ns['idx_coda0'] = idx_coda0
    if k_c is not MISSING:
        ns['k_c'] = k_c
    if last_loud_f is not MISSING:
        ns['last_loud_f'] = last_loud_f
    if loud_frames is not MISSING:
        ns['loud_frames'] = loud_frames
    if max_r is not MISSING:
        ns['max_r'] = max_r
    if s0_coda is not MISSING:
        ns['s0_coda'] = s0_coda
    if s1_coda is not MISSING:
        ns['s1_coda'] = s1_coda
    if s_win_hi is not MISSING:
        ns['s_win_hi'] = s_win_hi
    if s_win_lo is not MISSING:
        ns['s_win_lo'] = s_win_lo
    if slope_coda is not MISSING:
        ns['slope_coda'] = slope_coda
    if st_k is not MISSING:
        ns['st_k'] = st_k
    if t_stinger is not MISSING:
        ns['t_stinger'] = t_stinger
