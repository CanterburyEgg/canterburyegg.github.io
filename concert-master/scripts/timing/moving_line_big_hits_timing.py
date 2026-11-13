"""Moving line over held chords (see the conductor): its big hits (written 1 beat+) land on the strongest ensemble

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a_end_fast = ns.get('a_end_fast', MISSING)
    a_ons_raw = ns.get('a_ons_raw', MISSING)
    a_start_fast = ns.get('a_start_fast', MISSING)
    cur_t = ns.get('cur_t', MISSING)
    dt = ns.get('dt', MISSING)
    expect = ns.get('expect', MISSING)
    f_hi = ns.get('f_hi', MISSING)
    f_lo = ns.get('f_lo', MISSING)
    frac = ns.get('frac', MISSING)
    g = ns.get('g', MISSING)
    hi_t = ns.get('hi_t', MISSING)
    idx_h = ns.get('idx_h', MISSING)
    lo_t = ns.get('lo_t', MISSING)
    mix_rms = ns.get('mix_rms', MISSING)
    mv_fast = ns.get('mv_fast', MISSING)
    mv_hits = ns.get('mv_hits', MISSING)
    mv_taps = ns.get('mv_taps', MISSING)
    next_h_start = ns.get('next_h_start', MISSING)
    np = ns.get('np', MISSING)
    prev_s = ns.get('prev_s', MISSING)
    s_end_fast = ns.get('s_end_fast', MISSING)
    s_h = ns.get('s_h', MISSING)
    s_start_fast = ns.get('s_start_fast', MISSING)
    score_vec = ns.get('score_vec', MISSING)
    t_f = ns.get('t_f', MISSING)
    warped = ns.get('warped', MISSING)
    wn = ns.get('wn', MISSING)
    wn_f = ns.get('wn_f', MISSING)
    wn_h = ns.get('wn_h', MISSING)

    # Moving line over held chords (see the conductor): its big hits (written 1 beat+) land on the strongest ensemble
    # attack near where the written rhythm puts them, chained hit to hit; a hit that the band holds as a chord (6+ parts)
    # rings on until the next hit, a hit only the line strikes is a tap; the quick notes before the first hit are paced
    # evenly by the written rhythm (Ride 3:06-3:19: the chimes' fanfare, 4 held tutti chords, 3 final strikes).
    mv_taps = [wn for wn in warped if wn.get("is_coda_fanfare_tap")]
    mv_hits = [wn for wn in mv_taps if wn["score_dur"] >= 1.00]
    if len(mv_taps) >= 8 and mv_hits:
        cur_t = float(mv_hits[0]["start"])
        prev_s = None
        for wn_h in mv_hits:
            s_h = float(wn_h["score_start"])
            # (an ending stretches and pushes freely, so each hit is looked for between 0.6x and 1.4x its written gap
            # after the last one, and the first within 0.3s of where the warp put it)
            if prev_s is None:
                lo_t, hi_t = cur_t - 0.30, cur_t + 0.30
            else:
                g = s_h - prev_s
                lo_t, hi_t = cur_t + 0.6 * g, cur_t + 1.4 * g
            expect = 0.5 * (lo_t + hi_t)
            f_lo = max(3, int(round(lo_t / dt)))
            f_hi = min(len(a_ons_raw) - 3, int(round(hi_t / dt)))
            if f_hi > f_lo:
                score_vec = a_ons_raw[f_lo:f_hi] * np.sqrt(np.maximum(0.0, mix_rms[f_lo:f_hi]))
                cur_t = float((f_lo + int(np.argmax(score_vec))) * dt)
            else:
                cur_t = expect
            prev_s = s_h
            wn_h["start"] = cur_t
            wn_h["end"] = cur_t + 0.22
            wn_h["dur"] = 0.22
        for idx_h in range(len(mv_hits) - 1):
            wn_h = mv_hits[idx_h]
            if int(wn_h.get("band_hold", 0)) >= 6:
                next_h_start = float(mv_hits[idx_h + 1]["start"])
                wn_h["end"] = max(wn_h["start"] + 0.65, next_h_start - 0.08)
                wn_h["dur"] = wn_h["end"] - wn_h["start"]
        mv_fast = [wn for wn in mv_taps if wn["score_dur"] < 1.00 and float(wn["score_start"]) < float(mv_hits[0]["score_start"])]
        if mv_fast:
            a_start_fast = float(mv_fast[0]["start"])
            a_end_fast = float(mv_hits[0]["start"])
            s_start_fast = float(mv_fast[0]["score_start"])
            s_end_fast = float(mv_hits[0]["score_start"])
            if s_end_fast > s_start_fast + 1.0 and a_end_fast > a_start_fast + 1.0:
                for wn_f in mv_fast:
                    frac = (float(wn_f["score_start"]) - s_start_fast) / (s_end_fast - s_start_fast)
                    t_f = a_start_fast + frac * (a_end_fast - a_start_fast)
                    wn_f["start"] = t_f
                    wn_f["end"] = t_f + min(0.22, max(0.08, float(wn_f["score_dur"]) * 0.75))
                    wn_f["dur"] = wn_f["end"] - wn_f["start"]
                    wn_f["is_scalar_lick"] = True
        for wn_h in mv_hits:
            wn_h["is_scalar_lick"] = True

    if a_end_fast is not MISSING:
        ns['a_end_fast'] = a_end_fast
    if a_start_fast is not MISSING:
        ns['a_start_fast'] = a_start_fast
    if cur_t is not MISSING:
        ns['cur_t'] = cur_t
    if expect is not MISSING:
        ns['expect'] = expect
    if f_hi is not MISSING:
        ns['f_hi'] = f_hi
    if f_lo is not MISSING:
        ns['f_lo'] = f_lo
    if frac is not MISSING:
        ns['frac'] = frac
    if g is not MISSING:
        ns['g'] = g
    if hi_t is not MISSING:
        ns['hi_t'] = hi_t
    if idx_h is not MISSING:
        ns['idx_h'] = idx_h
    if lo_t is not MISSING:
        ns['lo_t'] = lo_t
    if mv_fast is not MISSING:
        ns['mv_fast'] = mv_fast
    if mv_hits is not MISSING:
        ns['mv_hits'] = mv_hits
    if mv_taps is not MISSING:
        ns['mv_taps'] = mv_taps
    if next_h_start is not MISSING:
        ns['next_h_start'] = next_h_start
    if prev_s is not MISSING:
        ns['prev_s'] = prev_s
    if s_end_fast is not MISSING:
        ns['s_end_fast'] = s_end_fast
    if s_h is not MISSING:
        ns['s_h'] = s_h
    if s_start_fast is not MISSING:
        ns['s_start_fast'] = s_start_fast
    if score_vec is not MISSING:
        ns['score_vec'] = score_vec
    if t_f is not MISSING:
        ns['t_f'] = t_f
    if wn is not MISSING:
        ns['wn'] = wn
    if wn_f is not MISSING:
        ns['wn_f'] = wn_f
    if wn_h is not MISSING:
        ns['wn_h'] = wn_h
