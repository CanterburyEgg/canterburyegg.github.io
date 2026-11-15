"""Figure entries, the mirror image: the FIRST note of a quick, evenly written figure (3+ notes) coming off a held note
(written 0.8s+) that the warp left late -- a clear attack 0.05-0.10s before it, after the held note's own attack --
moves back onto that attack, and the figure's inner notes re-space by the written rhythm up to its last note (Ride
1:32: the woodwinds' 74 75 74 call came in 0.07s after its attack).
"""


def run(ns):
    warped = ns.get("warped")
    melody_out = ns.get("melody_out")
    _peak_near = ns.get("_peak_near")  # noqa: F841
    if not isinstance(warped, list) or not isinstance(melody_out, list) or len(warped) != len(melody_out):
        return
    nm = len(melody_out)
    # Figure entries, the mirror image: the FIRST note of a quick, evenly written figure (3+ notes) coming off a held
    # note (written 0.8s+) that the warp left late -- a clear attack 0.05-0.10s before it, after the held note's own
    # attack -- moves back onto that attack, and the figure's inner notes re-space by the written rhythm up to its last
    # note (Ride 1:32: the woodwinds' 74 75 74 call came in 0.07s after its attack).
    k_a = 1
    while k_a < nm - 2:
        k_b = k_a
        while k_b + 1 < nm and k_b - k_a < 11:
            g = float(warped[k_b + 1]["score_start"]) - float(warped[k_b]["score_start"])
            if not (0.03 < g <= 0.2):
                break
            k_b += 1
        if k_b - k_a >= 2 and float(warped[k_a - 1].get("score_dur", 0) or 0) >= 0.8:
            sg = [float(warped[k + 1]["score_start"]) - float(warped[k]["score_start"]) for k in range(k_a, k_b)]
            t_a, t_b = float(melody_out[k_a][0]), float(melody_out[k_b][0])
            t_pre = float(melody_out[k_a - 1][0])
            pk = _peak_near(t_a - 0.06, 0.06, true_peak=True)
            if max(sg) <= 1.5 * min(sg) and pk is not None and 0.05 <= t_a - pk <= 0.10 and pk > t_pre + 0.3:
                s_a, s_b = float(warped[k_a]["score_start"]), float(warped[k_b]["score_start"])
                print(f"    -> figure entry at {t_a:.2f}s moved to its attack at {pk:.2f}s")
                for k in range(k_a, k_b):
                    nt = pk + (float(warped[k]["score_start"]) - s_a) * (t_b - pk) / (s_b - s_a)
                    d = float(melody_out[k][1]) - float(melody_out[k][0])
                    melody_out[k][0] = round(nt, 4)
                    melody_out[k][1] = round(min(nt + d, float(melody_out[k + 1][0]) - 0.015), 4)
                melody_out[k_a - 1][1] = round(min(float(melody_out[k_a - 1][1]), pk - 0.015), 4)
        k_a = max(k_a + 1, k_b + 1)
