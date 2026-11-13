"""Landing notes (all songs): the last note of a quick, evenly written figure (3-12 notes, score gaps <= 0.2s) that the

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    _peak_near = ns.get('_peak_near', MISSING)
    d = ns.get('d', MISSING)
    expect = ns.get('expect', MISSING)
    g = ns.get('g', MISSING)
    k = ns.get('k', MISSING)
    k_a = ns.get('k_a', MISSING)
    k_b = ns.get('k_b', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    nm = ns.get('nm', MISSING)
    nt = ns.get('nt', MISSING)
    nxt = ns.get('nxt', MISSING)
    pace = ns.get('pace', MISSING)
    pk = ns.get('pk', MISSING)
    s_a = ns.get('s_a', MISSING)
    s_b = ns.get('s_b', MISSING)
    s_post = ns.get('s_post', MISSING)
    s_pre = ns.get('s_pre', MISSING)
    sg = ns.get('sg', MISSING)
    t_a = ns.get('t_a', MISSING)
    t_b = ns.get('t_b', MISSING)
    t_post = ns.get('t_post', MISSING)
    t_post_a = ns.get('t_post_a', MISSING)
    t_pre = ns.get('t_pre', MISSING)
    warped = ns.get('warped', MISSING)

    # Landing notes (all songs): the last note of a quick, evenly written figure (3-12 notes, score gaps <= 0.2s) that the
    # warp pulled off the beat it lands on. The local pace comes from the notes either side of the figure; if the last note
    # sits 50ms+ away from where that pace puts it and a clear attack is right there, it moves onto that attack and the
    # inner notes re-space by the written rhythm (Sevens 0:15 & 0:16: the F that ends each J F D F turn came in early).
    if len(warped) == len(melody_out):
        nm = len(melody_out)
        k_a = 1
        while k_a < nm - 3:
            k_b = k_a
            while k_b + 1 < nm and k_b - k_a < 11:
                g = float(warped[k_b + 1]["score_start"]) - float(warped[k_b]["score_start"])
                if not (0.03 < g <= 0.2):
                    break
                k_b += 1
            if k_b - k_a >= 2 and k_b + 1 < nm and not any(str(warped[k].get("staff", "")).startswith("Restored") for k in range(k_a - 1, k_b + 2)):
                sg = [float(warped[k + 1]["score_start"]) - float(warped[k]["score_start"]) for k in range(k_a, k_b)]
                s_pre, s_a = float(warped[k_a - 1]["score_start"]), float(warped[k_a]["score_start"])
                s_b, s_post = float(warped[k_b]["score_start"]), float(warped[k_b + 1]["score_start"])
                t_pre, t_a = float(melody_out[k_a - 1][0]), float(melody_out[k_a][0])
                t_b, t_post = float(melody_out[k_b][0]), float(melody_out[k_b + 1][0])
                if max(sg) <= 1.5 * min(sg) and s_post > s_b and s_pre < s_a and s_post - s_pre <= 1.5 and t_post > t_pre:
                    # (the neighbours' own attacks, where clear: the notes after a rushed figure are often a touch early too)
                    t_pre = _peak_near(t_pre, 0.07) or t_pre
                    t_post_a = _peak_near(t_post, 0.07) or t_post
                    pace = (t_post_a - t_pre) / (s_post - s_pre)
                    expect = t_pre + (s_b - s_pre) * pace
                    if 0.6 <= pace <= 1.8 and abs(t_b - expect) >= 0.05:
                        pk = _peak_near(expect, 0.07)
                        if pk is not None and abs(pk - expect) < abs(t_b - expect) and t_a + 0.03 < pk < t_post - 0.05:
                            print(f"    -> landing note at {t_b:.2f}s moved to its attack at {pk:.2f}s")
                            for k in range(k_a + 1, k_b + 1):
                                nt = t_a + (float(warped[k]["score_start"]) - s_a) * (pk - t_a) / (s_b - s_a)
                                d = float(melody_out[k][1]) - float(melody_out[k][0])
                                melody_out[k][0] = round(nt, 4)
                                melody_out[k][1] = round(nt + d, 4)
                            for k in range(k_a - 1, k_b + 1):
                                nxt = float(melody_out[k + 1][0])
                                if float(melody_out[k][1]) > nxt - 0.015:
                                    melody_out[k][1] = round(max(float(melody_out[k][0]) + 0.04, nxt - 0.015), 4)
            k_a = max(k_a + 1, k_b + 1)

    if d is not MISSING:
        ns['d'] = d
    if expect is not MISSING:
        ns['expect'] = expect
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
    if pace is not MISSING:
        ns['pace'] = pace
    if pk is not MISSING:
        ns['pk'] = pk
    if s_a is not MISSING:
        ns['s_a'] = s_a
    if s_b is not MISSING:
        ns['s_b'] = s_b
    if s_post is not MISSING:
        ns['s_post'] = s_post
    if s_pre is not MISSING:
        ns['s_pre'] = s_pre
    if sg is not MISSING:
        ns['sg'] = sg
    if t_a is not MISSING:
        ns['t_a'] = t_a
    if t_b is not MISSING:
        ns['t_b'] = t_b
    if t_post is not MISSING:
        ns['t_post'] = t_post
    if t_post_a is not MISSING:
        ns['t_post_a'] = t_post_a
    if t_pre is not MISSING:
        ns['t_pre'] = t_pre
