"""Linearly pace contiguous uniform fast eighth-note scalar/terraced runs (>= 14 notes with 0.160 <= score_dur <= 0.175

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a0_8 = ns.get('a0_8', MISSING)
    a1_8 = ns.get('a1_8', MISSING)
    d8_0 = ns.get('d8_0', MISSING)
    d8_k = ns.get('d8_k', MISSING)
    e8_run = ns.get('e8_run', MISSING)
    en_new = ns.get('en_new', MISSING)
    g8_k = ns.get('g8_k', MISSING)
    idx_rel = ns.get('idx_rel', MISSING)
    n8_cnt = ns.get('n8_cnt', MISSING)
    s8_run = ns.get('s8_run', MISSING)
    st_new = ns.get('st_new', MISSING)
    step_8 = ns.get('step_8', MISSING)
    warped = ns.get('warped', MISSING)
    wn_k = ns.get('wn_k', MISSING)

    # Linearly pace contiguous uniform fast eighth-note scalar/terraced runs (>= 14 notes with 0.160 <= score_dur <= 0.175
    # and score_gap_prev <= 0.025, e.g. Ride mm.11-12 woodwind 14-note descending eighth-note run at 0:13-0:15) between
    # their snapped entrance and snapped landing downbeat so harmonic micro-snaps do not open a 2-eighth-note gap at 0:15!
    s8_run = 0
    while s8_run < len(warped):
        d8_0 = float(warped[s8_run]["score_dur"])
        if 0.160 <= d8_0 <= 0.175:
            e8_run = s8_run + 1
            while e8_run < len(warped):
                d8_k = float(warped[e8_run]["score_dur"])
                g8_k = float(warped[e8_run]["score_gap_prev"])
                if abs(d8_k - d8_0) <= 0.015 and g8_k <= 0.025:
                    e8_run += 1
                else:
                    break
            n8_cnt = e8_run - s8_run
            if n8_cnt >= 14 and e8_run < len(warped):
                a0_8 = float(warped[s8_run]["start"])
                a1_8 = float(warped[e8_run]["start"])
                step_8 = (a1_8 - a0_8) / n8_cnt
                if 0.155 <= step_8 <= 0.215:
                    for idx_rel in range(n8_cnt):
                        wn_k = warped[s8_run + idx_rel]
                        st_new = a0_8 + idx_rel * step_8
                        en_new = st_new + max(0.06, step_8 - 0.015)
                        wn_k["start"] = st_new
                        wn_k["end"] = en_new
                        wn_k["dur"] = en_new - st_new
                        wn_k["is_scalar_lick"] = True
            s8_run = e8_run
        else:
            s8_run += 1

    if a0_8 is not MISSING:
        ns['a0_8'] = a0_8
    if a1_8 is not MISSING:
        ns['a1_8'] = a1_8
    if d8_0 is not MISSING:
        ns['d8_0'] = d8_0
    if d8_k is not MISSING:
        ns['d8_k'] = d8_k
    if e8_run is not MISSING:
        ns['e8_run'] = e8_run
    if en_new is not MISSING:
        ns['en_new'] = en_new
    if g8_k is not MISSING:
        ns['g8_k'] = g8_k
    if idx_rel is not MISSING:
        ns['idx_rel'] = idx_rel
    if n8_cnt is not MISSING:
        ns['n8_cnt'] = n8_cnt
    if s8_run is not MISSING:
        ns['s8_run'] = s8_run
    if st_new is not MISSING:
        ns['st_new'] = st_new
    if step_8 is not MISSING:
        ns['step_8'] = step_8
    if wn_k is not MISSING:
        ns['wn_k'] = wn_k
