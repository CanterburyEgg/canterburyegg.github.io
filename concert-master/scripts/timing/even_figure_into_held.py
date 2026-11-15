"""An even figure into a held note: 3-8 notes written evenly (gaps up to 0.4s, within 1.15x of each other) that land on
a held note (written 0.5s+), struck lopsided (audio gaps 1.85x+ apart), keep their first attack and their landing
and are re-spaced evenly in between by the written rhythm (Ride 1:42, the clarinets' quarter-note 74 75 74 -> held;
Ride 2:25, the soprano sax's eighth-note turn 74 75 74 72 70 72 -> held 67).
"""


def run(ns):
    warped = ns.get("warped")
    melody_out = ns.get("melody_out")
    _peak_near = ns.get("_peak_near")  # noqa: F841
    if not isinstance(warped, list) or not isinstance(melody_out, list) or len(warped) != len(melody_out):
        return
    nm = len(melody_out)
    # An even figure into a held note: 3-8 notes written evenly (gaps up to 0.4s, within 1.15x of each other) that land
    # on a held note (written 0.5s+), struck lopsided (audio gaps 1.85x+ apart), keep their first attack and their
    # landing and are re-spaced evenly in between by the written rhythm (Ride 1:42, the clarinets' quarter-note
    # 74 75 74 -> held; Ride 2:25, the soprano sax's eighth-note turn 74 75 74 72 70 72 -> held 67).
    k_a = 0
    while k_a < nm - 2:
        k_b = k_a
        while k_b + 1 < nm and k_b - k_a < 7:
            g = float(warped[k_b + 1]["score_start"]) - float(warped[k_b]["score_start"])
            if not (0.03 < g <= 0.4):
                break
            k_b += 1
        if k_b - k_a >= 2:
            sg = [float(warped[k + 1]["score_start"]) - float(warped[k]["score_start"]) for k in range(k_a, k_b)]
            # (the figure proper ends on the first held note)
            land = next((k for k in range(k_a + 2, k_b + 1) if float(warped[k].get("score_dur", 0) or 0) >= 0.5), None)
            if land is not None and max(sg[: land - k_a]) <= 1.15 * min(sg[: land - k_a]):
                ag = [float(melody_out[k + 1][0]) - float(melody_out[k][0]) for k in range(k_a, land)]
                if min(ag) > 0 and max(ag) >= 1.85 * min(ag):
                    t_a, t_b = float(melody_out[k_a][0]), float(melody_out[land][0])
                    s_a, s_b = float(warped[k_a]["score_start"]), float(warped[land]["score_start"])
                    # (coming off a held note, the whole figure -- landing included -- goes on the local pace between
                    # that held note's attack and the note after the landing: Ride 1:42 came out 0.1s late)
                    if k_a > 0 and land + 1 < nm and float(warped[k_a - 1].get("score_dur", 0) or 0) >= 0.8:
                        tp, sp = float(melody_out[k_a - 1][0]), float(warped[k_a - 1]["score_start"])
                        tn, sn = float(melody_out[land + 1][0]), float(warped[land + 1]["score_start"])
                        pace = (tn - tp) / (sn - sp) if sn > sp else 0
                        if 0.8 <= pace <= 1.25 and tn - tp <= 4.0:
                            pa, pb = tp + (s_a - sp) * pace, tp + (s_b - sp) * pace
                            if abs(pa - t_a) >= 0.06 and pb < tn - 0.1:
                                t_a, t_b = pa, pb
                                melody_out[k_a][0] = round(t_a, 4)
                                d_l = float(melody_out[land][1]) - float(melody_out[land][0])
                                melody_out[land][0] = round(t_b, 4)
                                melody_out[land][1] = round(min(t_b + d_l, tn - 0.015), 4)
                                melody_out[k_a - 1][1] = round(min(float(melody_out[k_a - 1][1]), t_a - 0.015), 4)
                    print(f"    -> even figure into a held note at {t_a:.2f}s re-spaced ({land - k_a + 1} notes)")
                    for k in range(k_a + 1, land):
                        nt = t_a + (float(warped[k]["score_start"]) - s_a) * (t_b - t_a) / (s_b - s_a)
                        d = float(melody_out[k][1]) - float(melody_out[k][0])
                        melody_out[k][0] = round(nt, 4)
                    for k in range(k_a, land):
                        melody_out[k][1] = round(min(float(melody_out[k][1]), float(melody_out[k + 1][0]) - 0.015), 4)
                    k_b = land
        k_a = max(k_a + 1, k_b)
