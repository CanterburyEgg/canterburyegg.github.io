"""A brass figure keeps its written rhythm: when the lead moves onto a brass part (or the part starts again after a long
note or a rest) for a quick figure (5+ notes, each
written within 0.35s of the last, 2.5s at most -- Mars 2:36 / 2:38: the trumpets' 74 . 74 74 73 74 77 74 70 65), the
figure is laid from its first note in its written rhythm, at the local tempo (from its first note to the lead note
after it), instead of note by note to whatever the alignment latched onto -- that left the second note late and the
third squeezed against it (user, Nov 18: "the second trumpet entrance comes in late on the keys"; "the first two
trumpet notes are too close together"). Exact scores only.
"""

BRASS = ("trumpet", "cornet", "horn", "trombone", "tuba", "euph", "baritone", "flugel")


def run(ns):
    sp, mo, warped = ns.get("score_path"), ns.get("melody_out"), ns.get("warped")
    if sp is None or sp.suffix.lower() not in (".mxl", ".musicxml", ".xml") or not mo or not warped:
        return
    n = min(len(mo), len(warped))
    is_brass = lambda k: any(b in str(warped[k].get("staff", "")).lower() for b in BRASS) and "english" not in str(warped[k].get("staff", "")).lower()
    moved = 0
    k = 1
    while k < n:
        # (a figure starts where the lead comes to this part, or after its own long note or rest)
        fresh = warped[k].get("staff") != warped[k - 1].get("staff") or float(warped[k - 1].get("score_dur", 0)) >= 0.5 or \
            float(warped[k]["score_start"]) - float(warped[k - 1]["score_start"]) - float(warped[k - 1].get("score_dur", 0)) >= 0.3
        if not is_brass(k) or not fresh:
            k += 1
            continue
        j = k
        while j + 1 < n and warped[j + 1].get("staff") == warped[k].get("staff") and \
                float(warped[j + 1]["score_start"]) - float(warped[j]["score_start"]) <= 0.35:
            j += 1
        s0 = float(warped[k]["score_start"])
        if j - k + 1 >= 5 and float(warped[j]["score_start"]) - s0 <= 2.5 and j + 1 < n:
            t0 = float(mo[k][0])
            s_after, t_after = float(warped[j + 1]["score_start"]), float(mo[j + 1][0])
            # (a figure that lands on a written hold takes its tempo from that landing, which the alignment hears clearly --
            # players rush the triplets into it, so the tempo out to the next figure left the tail late: Mars 2:46, user,
            # Nov 18: "check the timing on the first trumpet riff")
            if j > k and float(warped[j].get("score_dur", 0)) >= 0.75 and float(warped[j]["score_start"]) - s0 >= 0.6:
                s_after, t_after = float(warped[j]["score_start"]), float(mo[j][0])
            if s_after > s0 and t_after > t0 and t_after - t0 < 4.0:
                r = (t_after - t0) / (s_after - s0)
                for q in range(k + 1, j + 1):
                    want = t0 + (float(warped[q]["score_start"]) - s0) * r
                    if abs(want - float(mo[q][0])) > 0.03:
                        d = float(mo[q][1]) - float(mo[q][0])
                        mo[q][0] = round(want, 4)
                        mo[q][1] = round(want + d, 4)
                        moved += 1
                # (each note lets go before the next)
                for q in range(k, j + 1):
                    if float(mo[q][1]) > float(mo[q + 1][0]) - 0.015:
                        mo[q][1] = round(max(float(mo[q][0]) + 0.04, float(mo[q + 1][0]) - 0.015), 4)
        k = j + 1
    if moved:
        print(f"    -> brass figures in written rhythm: {moved} note(s) re-timed")
