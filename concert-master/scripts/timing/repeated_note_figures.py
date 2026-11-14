"""Repeated-note figures (3+ strikes of one pitch, e.g. Arabesque 2:02 "da, da-da-da" and 4:30 81 81 81 81): anchor

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    _peak_near = ns.get('_peak_near', MISSING)
    a_ons_raw = ns.get('a_ons_raw', MISSING)
    d = ns.get('d', MISSING)
    dt = ns.get('dt', MISSING)
    j = ns.get('j', MISSING)
    k = ns.get('k', MISSING)
    k_a = ns.get('k_a', MISSING)
    k_b = ns.get('k_b', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    new_t = ns.get('new_t', MISSING)
    np = ns.get('np', MISSING)
    nt = ns.get('nt', MISSING)
    nxt = ns.get('nxt', MISSING)
    s_a = ns.get('s_a', MISSING)
    s_b = ns.get('s_b', MISSING)
    t_a = ns.get('t_a', MISSING)
    t_b = ns.get('t_b', MISSING)
    warped = ns.get('warped', MISSING)

    # Repeated-note figures (3+ strikes of one pitch, e.g. Arabesque 2:02 "da, da-da-da" and 4:30 81 81 81 81): anchor
    # the first and last strikes on their clear audio attacks (within 0.12s) and space the ones between by the written
    # rhythm, so the quick strikes come out even instead of bunching.
    def _peak_near(t, w=0.12, thr=2.0, true_peak=False):
        f_c = int(round(t / dt))
        lo_f, hi_f = max(1, f_c - int(round(w / dt))), min(len(a_ons_raw) - 1, f_c + int(round(w / dt)) + 1)
        if hi_f <= lo_f:
            return None
        f_pk = lo_f + int(np.argmax(a_ons_raw[lo_f:hi_f]))
        # true_peak: a real attack peaks inside the window; a max on the window's edge is the slope of a neighbouring hit
        if true_peak and (float(a_ons_raw[f_pk - 1]) > float(a_ons_raw[f_pk]) or (f_pk + 1 < len(a_ons_raw) and float(a_ons_raw[f_pk + 1]) > float(a_ons_raw[f_pk]))):
            return None
        loc = float(np.median(a_ons_raw[max(0, f_pk - 35) : f_pk + 35])) + 0.12
        return f_pk * dt if float(a_ons_raw[f_pk]) >= thr * loc else None

    if len(warped) == len(melody_out):
        k_a = 0
        while k_a < len(melody_out):
            k_b = k_a
            while (
                k_b + 1 < len(melody_out)
                and int(melody_out[k_b + 1][2]) == int(melody_out[k_a][2])
                and float(melody_out[k_b + 1][0]) - float(melody_out[k_b][0]) < 0.45
            ):
                k_b += 1
            if k_b - k_a >= 2 and not any(str(warped[k].get("staff", "")).startswith("Restored") for k in range(k_a, k_b + 1)):
                t_a, t_b = _peak_near(float(melody_out[k_a][0]), true_peak=True), _peak_near(float(melody_out[k_b][0]), true_peak=True)
                s_a, s_b = float(warped[k_a]["score_start"]), float(warped[k_b]["score_start"])
                if t_a is not None and t_b is not None and t_b > t_a + 0.1 and s_b > s_a:
                    new_t = [t_a + (float(warped[k]["score_start"]) - s_a) * (t_b - t_a) / (s_b - s_a) for k in range(k_a, k_b + 1)]
                    # (the figure stays between its neighbours: Ride 0:24, the last 70 had been pushed past the 73 after it)
                    t_prev = float(melody_out[k_a - 1][0]) if k_a > 0 else -1.0
                    t_next = float(melody_out[k_b + 1][0]) if k_b + 1 < len(melody_out) else 1e9
                    if all(abs(nt - float(melody_out[k_a + j][0])) <= 0.13 for j, nt in enumerate(new_t)) and new_t[0] > t_prev + 0.03 and new_t[-1] < t_next - 0.03:
                        for j, nt in enumerate(new_t):
                            k = k_a + j
                            d = float(melody_out[k][1]) - float(melody_out[k][0])
                            melody_out[k][0] = round(nt, 4)
                            melody_out[k][1] = round(nt + d, 4)
                        for k in range(max(0, k_a - 1), min(len(melody_out) - 1, k_b + 1)):
                            nxt = float(melody_out[k + 1][0])
                            if float(melody_out[k][1]) > nxt - 0.015:
                                melody_out[k][1] = round(max(float(melody_out[k][0]) + 0.04, nxt - 0.015), 4)
            k_a = k_b + 1

    if _peak_near is not MISSING:
        ns['_peak_near'] = _peak_near
    if d is not MISSING:
        ns['d'] = d
    if j is not MISSING:
        ns['j'] = j
    if k is not MISSING:
        ns['k'] = k
    if k_a is not MISSING:
        ns['k_a'] = k_a
    if k_b is not MISSING:
        ns['k_b'] = k_b
    if new_t is not MISSING:
        ns['new_t'] = new_t
    if nt is not MISSING:
        ns['nt'] = nt
    if nxt is not MISSING:
        ns['nxt'] = nxt
    if s_a is not MISSING:
        ns['s_a'] = s_a
    if s_b is not MISSING:
        ns['s_b'] = s_b
    if t_a is not MISSING:
        ns['t_a'] = t_a
    if t_b is not MISSING:
        ns['t_b'] = t_b
