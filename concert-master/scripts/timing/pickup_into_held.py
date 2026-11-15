"""A two-note pickup into a held note (3 quick notes written evenly, the last one held 0.4s+) keeps its first and last
attack and the middle note goes halfway, even when the warp left it only mildly lopsided (gaps 1.6x+ apart) (Ride
1:07, the alto sax's 70 71 -> 73 into the solo: 0.14s then 0.26s apart, written 0.18 / 0.18).
"""


def run(ns):
    warped = ns.get("warped")
    melody_out = ns.get("melody_out")
    _peak_near = ns.get("_peak_near")  # noqa: F841
    if not isinstance(warped, list) or not isinstance(melody_out, list) or len(warped) != len(melody_out):
        return
    nm = len(melody_out)
    # A two-note pickup into a held note (3 quick notes written evenly, the last one held 0.4s+) keeps its first and last
    # attack and the middle note goes halfway, even when the warp left it only mildly lopsided (gaps 1.6x+ apart) (Ride 1:07, the alto sax's
    # 70 71 -> 73 into the solo: 0.14s then 0.26s apart, written 0.18 / 0.18).
    k_a = 0
    while k_a < nm - 2:
        k_b = k_a
        while k_b + 1 < nm and k_b - k_a < 2:
            g = float(warped[k_b + 1]["score_start"]) - float(warped[k_b]["score_start"])
            if not (0.03 < g <= 0.2):
                break
            k_b += 1
        if k_b - k_a == 2 and float(warped[k_b].get("score_dur", 0) or 0) >= 0.4:
            sg = [float(warped[k + 1]["score_start"]) - float(warped[k]["score_start"]) for k in range(k_a, k_b)]
            ag = [float(melody_out[k + 1][0]) - float(melody_out[k][0]) for k in range(k_a, k_b)]
            if max(sg) <= 1.2 * min(sg) and min(ag) > 0 and max(ag) > 1.6 * min(ag):
                t_a, t_b = float(melody_out[k_a][0]), float(melody_out[k_b][0])
                s_a, s_b = float(warped[k_a]["score_start"]), float(warped[k_b]["score_start"])
                print(f"    -> evened pickup into a held note at {t_a:.2f}s ({k_b - k_a + 1} notes)")
                for k in range(k_a + 1, k_b):
                    nt = t_a + (float(warped[k]["score_start"]) - s_a) * (t_b - t_a) / (s_b - s_a)
                    d = float(melody_out[k][1]) - float(melody_out[k][0])
                    melody_out[k][0] = round(nt, 4)
                    melody_out[k][1] = round(min(nt + d, float(melody_out[k + 1][0]) - 0.015), 4)
                    melody_out[k - 1][1] = round(min(float(melody_out[k - 1][1]), nt - 0.015), 4)
        k_a = max(k_a + 1, k_b)
