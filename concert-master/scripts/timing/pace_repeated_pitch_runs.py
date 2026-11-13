"""Evenly pace repeated-pitch runs (>= 3 identical notes of equal written length played back-to-back, e.g. Sevens 0:21

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a0_r = ns.get('a0_r', MISSING)
    a1_r = ns.get('a1_r', MISSING)
    e_r = ns.get('e_r', MISSING)
    k2 = ns.get('k2', MISSING)
    k_r = ns.get('k_r', MISSING)
    new_start = ns.get('new_start', MISSING)
    run_n = ns.get('run_n', MISSING)
    s0_r = ns.get('s0_r', MISSING)
    s1_r = ns.get('s1_r', MISSING)
    shift = ns.get('shift', MISSING)
    warped = ns.get('warped', MISSING)
    wn_r = ns.get('wn_r', MISSING)

    # Evenly pace repeated-pitch runs (>= 3 identical notes of equal written length played back-to-back, e.g. Sevens 0:21
    # band A-flats): re-attacks of one pitch have no new harmonic to lock onto, so per-note onset snapping drifts onto
    # neighbouring percussion hits and spaces them unevenly. Pace them linearly between the run's first attack and the
    # next note's attack, following the written rhythm.
    k_r = 0
    while k_r < len(warped):
        e_r = k_r
        while (
            e_r + 1 < len(warped)
            and warped[e_r + 1]["midi"] == warped[k_r]["midi"]
            and abs(float(warped[e_r + 1]["score_dur"]) - float(warped[k_r]["score_dur"])) <= 0.03
            and float(warped[e_r + 1]["score_gap_prev"]) <= 0.03
        ):
            e_r += 1
        run_n = e_r - k_r + 1
        if run_n >= 3 and e_r + 1 < len(warped) and float(warped[e_r + 1]["score_gap_prev"]) <= 0.03:
            s0_r = float(warped[k_r]["score_start"])
            s1_r = float(warped[e_r + 1]["score_start"])
            a0_r = float(warped[k_r]["start"])
            a1_r = float(warped[e_r + 1]["start"])
            if s1_r > s0_r + 0.2 and a1_r > a0_r + 0.2 and 0.6 <= (a1_r - a0_r) / (s1_r - s0_r) <= 1.6:
                for k2 in range(k_r + 1, e_r + 1):
                    wn_r = warped[k2]
                    new_start = a0_r + (float(wn_r["score_start"]) - s0_r) * (a1_r - a0_r) / (s1_r - s0_r)
                    shift = new_start - float(wn_r["start"])
                    wn_r["start"] = new_start
                    wn_r["end"] = float(wn_r["end"]) + shift
                    wn_r["dur"] = wn_r["end"] - wn_r["start"]
        k_r = e_r + 1

    if a0_r is not MISSING:
        ns['a0_r'] = a0_r
    if a1_r is not MISSING:
        ns['a1_r'] = a1_r
    if e_r is not MISSING:
        ns['e_r'] = e_r
    if k2 is not MISSING:
        ns['k2'] = k2
    if k_r is not MISSING:
        ns['k_r'] = k_r
    if new_start is not MISSING:
        ns['new_start'] = new_start
    if run_n is not MISSING:
        ns['run_n'] = run_n
    if s0_r is not MISSING:
        ns['s0_r'] = s0_r
    if s1_r is not MISSING:
        ns['s1_r'] = s1_r
    if shift is not MISSING:
        ns['shift'] = shift
    if wn_r is not MISSING:
        ns['wn_r'] = wn_r
