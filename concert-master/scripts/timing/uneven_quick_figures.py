"""Uneven quick figures (Arabesque; What We Do's steady flute 16ths at a tighter 1.5x, e.g. 2:43): 3-12 quick notes written evenly (score gaps <= 0.2s, within 1.5x of each other)

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    _peak_near = ns.get('_peak_near', MISSING)
    ag = ns.get('ag', MISSING)
    d = ns.get('d', MISSING)
    g = ns.get('g', MISSING)
    k = ns.get('k', MISSING)
    k_a = ns.get('k_a', MISSING)
    k_b = ns.get('k_b', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    nm = ns.get('nm', MISSING)
    nt = ns.get('nt', MISSING)
    nxt = ns.get('nxt', MISSING)
    nxt_t = ns.get('nxt_t', MISSING)
    prev_t = ns.get('prev_t', MISSING)
    s_a = ns.get('s_a', MISSING)
    s_b = ns.get('s_b', MISSING)
    sg = ns.get('sg', MISSING)
    t_a = ns.get('t_a', MISSING)
    t_b = ns.get('t_b', MISSING)
    uneven_ratio = ns.get('uneven_ratio', MISSING)
    warped = ns.get('warped', MISSING)

    # Uneven quick figures (Arabesque; What We Do's steady flute 16ths at a tighter 1.5x, e.g. 2:43): 3-12 quick notes written evenly (score gaps <= 0.2s, within 1.5x of each other)
    # that came out of the warp bunched (audio gaps more than 2.5x apart) get re-spaced by the written rhythm between
    # their first and last notes' clear audio attacks (0:56 flute turn 84 85 84; 3:26 horn figure 58 56 55 53 55 56 58 61).
    uneven_ratio = 2.5  # (one setting for every song; the sequenced tracks go onto their written times afterwards anyway)
    if uneven_ratio and len(warped) == len(melody_out):
        k_a = 0
        nm = len(melody_out)
        while k_a < nm - 2:
            k_b = k_a
            while k_b + 1 < nm and k_b - k_a < 11:
                g = float(warped[k_b + 1]["score_start"]) - float(warped[k_b]["score_start"])
                if not (0.03 < g <= 0.2):
                    break
                k_b += 1
            if k_b - k_a >= 2 and not any(str(warped[k].get("staff", "")).startswith("Restored") for k in range(k_a, k_b + 1)):
                sg = [float(warped[k + 1]["score_start"]) - float(warped[k]["score_start"]) for k in range(k_a, k_b)]
                ag = [float(melody_out[k + 1][0]) - float(melody_out[k][0]) for k in range(k_a, k_b)]
                if max(sg) <= 1.5 * min(sg) and min(ag) > 0 and max(ag) > uneven_ratio * min(ag):
                    t_a, t_b = _peak_near(float(melody_out[k_a][0]), 0.15, 1.5), _peak_near(float(melody_out[k_b][0]), 0.25, 1.5)
                    s_a, s_b = float(warped[k_a]["score_start"]), float(warped[k_b]["score_start"])
                    nxt_t = float(melody_out[k_b + 1][0]) if k_b + 1 < nm else 1e9
                    prev_t = float(melody_out[k_a - 1][0]) if k_a > 0 else -1e9
                    if t_a is not None and t_a <= prev_t + 0.05:
                        # the anchor attack belongs to the note before (What We Do 2:43): anchor on that note instead
                        k_a -= 1
                        t_a = prev_t
                        s_a = float(warped[k_a]["score_start"])
                        ag = [float(melody_out[k + 1][0]) - float(melody_out[k][0]) for k in range(k_a, k_b)]
                        sg = [float(warped[k + 1]["score_start"]) - float(warped[k]["score_start"]) for k in range(k_a, k_b)]
                    if t_a is not None and t_b is None:
                        # a soft last note with no clear attack (0:56 flute): keep the pace of the figure's unstretched gap
                        t_b = t_a + (s_b - s_a) * min(x / y for x, y in zip(ag, sg))
                    if t_a is not None and t_b is not None and t_a < t_b < nxt_t - 0.05 and 0.6 <= (t_b - t_a) / (s_b - s_a) <= 1.8:
                        print(f"    -> re-spaced uneven quick figure at {float(melody_out[k_a][0]):.2f}s ({k_b - k_a + 1} notes)")
                        for k in range(k_a, k_b + 1):
                            nt = t_a + (float(warped[k]["score_start"]) - s_a) * (t_b - t_a) / (s_b - s_a)
                            d = float(melody_out[k][1]) - float(melody_out[k][0])
                            melody_out[k][0] = round(nt, 4)
                            melody_out[k][1] = round(nt + d, 4)
                        for k in range(max(0, k_a - 1), min(nm - 1, k_b + 1)):
                            nxt = float(melody_out[k + 1][0])
                            if float(melody_out[k][1]) > nxt - 0.015:
                                melody_out[k][1] = round(max(float(melody_out[k][0]) + 0.04, nxt - 0.015), 4)
            k_a = max(k_a + 1, k_b)

    if ag is not MISSING:
        ns['ag'] = ag
    if d is not MISSING:
        ns['d'] = d
    if g is not MISSING:
        ns['g'] = g
    if k is not MISSING:
        ns['k'] = k
    if k_a is not MISSING:
        ns['k_a'] = k_a
    if k_b is not MISSING:
        ns['k_b'] = k_b
    if nm is not MISSING:
        ns['nm'] = nm
    if nt is not MISSING:
        ns['nt'] = nt
    if nxt is not MISSING:
        ns['nxt'] = nxt
    if nxt_t is not MISSING:
        ns['nxt_t'] = nxt_t
    if prev_t is not MISSING:
        ns['prev_t'] = prev_t
    if s_a is not MISSING:
        ns['s_a'] = s_a
    if s_b is not MISSING:
        ns['s_b'] = s_b
    if sg is not MISSING:
        ns['sg'] = sg
    if t_a is not MISSING:
        ns['t_a'] = t_a
    if t_b is not MISSING:
        ns['t_b'] = t_b
    if uneven_ratio is not MISSING:
        ns['uneven_ratio'] = uneven_ratio
