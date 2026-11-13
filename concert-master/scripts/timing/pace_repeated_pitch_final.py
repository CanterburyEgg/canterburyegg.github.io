"""Final even pacing of repeated-pitch runs, AFTER impact co-alignment (which can pull a run's first note onto the

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a0_r = ns.get('a0_r', MISSING)
    a1_r = ns.get('a1_r', MISSING)
    e_r = ns.get('e_r', MISSING)
    k2 = ns.get('k2', MISSING)
    k_r = ns.get('k_r', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    new_start = ns.get('new_start', MISSING)
    nxt = ns.get('nxt', MISSING)
    s0_r = ns.get('s0_r', MISSING)
    s1_r = ns.get('s1_r', MISSING)
    shift = ns.get('shift', MISSING)
    warped = ns.get('warped', MISSING)

    # Final even pacing of repeated-pitch runs, AFTER impact co-alignment (which can pull a run's first note onto the
    # true ensemble attack, e.g. Sevens 0:21.20): pace the run from that attack to the next note, by the written rhythm.
    k_r = 0
    while k_r < len(melody_out):
        e_r = k_r
        while (
            e_r + 1 < len(melody_out)
            and melody_out[e_r + 1][2] == melody_out[k_r][2]
            and abs(float(warped[e_r + 1]["score_dur"]) - float(warped[k_r]["score_dur"])) <= 0.03
            and float(warped[e_r + 1]["score_gap_prev"]) <= 0.03
        ):
            e_r += 1
        if e_r - k_r + 1 >= 3 and e_r + 1 < len(melody_out) and float(warped[e_r + 1]["score_gap_prev"]) <= 0.03:
            s0_r = float(warped[k_r]["score_start"])
            s1_r = float(warped[e_r + 1]["score_start"])
            a0_r = float(melody_out[k_r][0])
            a1_r = float(melody_out[e_r + 1][0])
            if s1_r > s0_r + 0.2 and a1_r > a0_r + 0.2 and 0.6 <= (a1_r - a0_r) / (s1_r - s0_r) <= 1.6:
                for k2 in range(k_r + 1, e_r + 1):
                    new_start = a0_r + (float(warped[k2]["score_start"]) - s0_r) * (a1_r - a0_r) / (s1_r - s0_r)
                    shift = new_start - float(melody_out[k2][0])
                    melody_out[k2][0] = round(new_start, 4)
                    melody_out[k2][1] = round(float(melody_out[k2][1]) + shift, 4)
                for k2 in range(k_r, e_r + 1):
                    nxt = float(melody_out[k2 + 1][0]) - 0.015
                    melody_out[k2][1] = round(max(float(melody_out[k2][0]) + 0.04, min(float(melody_out[k2][1]), nxt)), 4)
        elif e_r - k_r + 1 >= 3:
            # Run followed by a rest (e.g. Sevens 0:18.32 brass hits): no next attack to aim at, so pace the inner
            # hits evenly between the run's own first and last attacks.
            s0_r = float(warped[k_r]["score_start"])
            s1_r = float(warped[e_r]["score_start"])
            a0_r = float(melody_out[k_r][0])
            a1_r = float(melody_out[e_r][0])
            if s1_r > s0_r + 0.2 and a1_r > a0_r + 0.2 and 0.6 <= (a1_r - a0_r) / (s1_r - s0_r) <= 1.6:
                for k2 in range(k_r + 1, e_r):
                    new_start = a0_r + (float(warped[k2]["score_start"]) - s0_r) * (a1_r - a0_r) / (s1_r - s0_r)
                    shift = new_start - float(melody_out[k2][0])
                    melody_out[k2][0] = round(new_start, 4)
                    melody_out[k2][1] = round(float(melody_out[k2][1]) + shift, 4)
                for k2 in range(k_r, e_r):
                    nxt = float(melody_out[k2 + 1][0]) - 0.015
                    melody_out[k2][1] = round(max(float(melody_out[k2][0]) + 0.04, min(float(melody_out[k2][1]), nxt)), 4)
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
    if nxt is not MISSING:
        ns['nxt'] = nxt
    if s0_r is not MISSING:
        ns['s0_r'] = s0_r
    if s1_r is not MISSING:
        ns['s1_r'] = s1_r
    if shift is not MISSING:
        ns['shift'] = shift
