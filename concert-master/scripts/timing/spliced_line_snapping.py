"""Spliced lines (a rule took the lead from a different part than the conductor's, e.g. the low unison walk or the top

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a_ons_raw = ns.get('a_ons_raw', MISSING)
    dt = ns.get('dt', MISSING)
    f_c = ns.get('f_c', MISSING)
    f_pk = ns.get('f_pk', MISSING)
    hi_f = ns.get('hi_f', MISSING)
    k_sp = ns.get('k_sp', MISSING)
    lo_f = ns.get('lo_f', MISSING)
    loc = ns.get('loc', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    np = ns.get('np', MISSING)
    nxt = ns.get('nxt', MISSING)
    shift = ns.get('shift', MISSING)
    w = ns.get('w', MISSING)
    warped = ns.get('warped', MISSING)

    # Spliced lines (a rule took the lead from a different part than the conductor's, e.g. the low unison walk or the top
    # of the held brass): their written rhythm came from a different staff than the one the warp followed, so each note
    # snaps to the clear audio attack within 0.25s (Arabesque 5:45 walk-down).
    for k_sp in range(min(len(melody_out), len(warped))):
        if not warped[k_sp].get("is_spliced"):
            continue
        f_c = int(round(float(melody_out[k_sp][0]) / dt))
        w = int(round(0.25 / dt))
        lo_f, hi_f = max(1, f_c - w), min(len(a_ons_raw) - 1, f_c + w + 1)
        if hi_f <= lo_f:
            continue
        f_pk = lo_f + int(np.argmax(a_ons_raw[lo_f:hi_f]))
        loc = float(np.median(a_ons_raw[max(0, f_pk - 35) : f_pk + 35])) + 0.12
        if float(a_ons_raw[f_pk]) >= 1.5 * loc:
            shift = f_pk * dt - float(melody_out[k_sp][0])
            melody_out[k_sp][0] = round(float(melody_out[k_sp][0]) + shift, 4)
            melody_out[k_sp][1] = round(float(melody_out[k_sp][1]) + shift, 4)
    for k_sp in range(len(melody_out) - 1):
        if warped[k_sp].get("is_spliced") or (k_sp + 1 < len(warped) and warped[k_sp + 1].get("is_spliced")):
            nxt = float(melody_out[k_sp + 1][0])
            if float(melody_out[k_sp][1]) > nxt - 0.015:
                melody_out[k_sp][1] = round(max(float(melody_out[k_sp][0]) + 0.04, nxt - 0.015), 4)
            # a legato low walk holds each step right up to the next one, so every step reads the same
            if warped[k_sp].get("is_low_walk") and nxt - float(melody_out[k_sp][0]) < 1.0:
                melody_out[k_sp][1] = round(nxt - 0.03, 4)

    if f_c is not MISSING:
        ns['f_c'] = f_c
    if f_pk is not MISSING:
        ns['f_pk'] = f_pk
    if hi_f is not MISSING:
        ns['hi_f'] = hi_f
    if k_sp is not MISSING:
        ns['k_sp'] = k_sp
    if lo_f is not MISSING:
        ns['lo_f'] = lo_f
    if loc is not MISSING:
        ns['loc'] = loc
    if nxt is not MISSING:
        ns['nxt'] = nxt
    if shift is not MISSING:
        ns['shift'] = shift
    if w is not MISSING:
        ns['w'] = w
