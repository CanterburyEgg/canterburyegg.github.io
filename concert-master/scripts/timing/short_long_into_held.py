"""Short-long figure into a held note: a quick note into a longer one into a held note (written short-long-held, e.g. 0.18 / 0.54 then
a hold): the middle note keeps the written proportion between the outer attacks when the warp pushed it 1.4x+ off,
so a figure the band plays twice comes out the same twice (Ride 1:24 / 1:26, the alto clarinet's 70 69 -> 67, warped
0.24 / 0.49 the first time and 0.16 / 0.63 the second).
"""


def run(ns):
    warped = ns.get("warped")
    melody_out = ns.get("melody_out")
    _peak_near = ns.get("_peak_near")  # noqa: F841
    if not isinstance(warped, list) or not isinstance(melody_out, list) or len(warped) != len(melody_out):
        return
    nm = len(melody_out)
    # ...and the same for a quick note into a longer one into a held note (written short-long-held, e.g. 0.18 / 0.54
    # then a hold): the middle note keeps the written proportion between the outer attacks when the warp pushed it
    # 1.4x+ off, so a figure the band plays twice comes out the same twice (Ride 1:24 / 1:26, the alto clarinet's
    # 70 69 -> 67, warped 0.24 / 0.49 the first time and 0.16 / 0.63 the second).
    for k_a in range(0, nm - 2):
        k_b = k_a + 2
        s0_, s1_, s2_ = (float(warped[k]["score_start"]) for k in (k_a, k_a + 1, k_b))
        g0, g1 = s1_ - s0_, s2_ - s1_
        if not (0.03 < g0 <= 0.2 and 2.0 * g0 <= g1 <= 0.6) or float(warped[k_b].get("score_dur", 0) or 0) < 0.4:
            continue
        t0_, t1_, t2_ = (float(melody_out[k][0]) for k in (k_a, k_a + 1, k_b))
        if not (t0_ < t1_ < t2_):
            continue
        want = t0_ + (t2_ - t0_) * g0 / (g0 + g1)
        r_a, r_s = (t1_ - t0_) / (t2_ - t1_), g0 / g1
        if max(r_a, r_s) / min(r_a, r_s) >= 1.4:
            print(f"    -> short-long figure into a held note at {t0_:.2f}s kept to its written proportion")
            d = float(melody_out[k_a + 1][1]) - t1_
            melody_out[k_a + 1][0] = round(want, 4)
            melody_out[k_a + 1][1] = round(min(want + d, t2_ - 0.015), 4)
            melody_out[k_a][1] = round(min(float(melody_out[k_a][1]), want - 0.015), 4)
