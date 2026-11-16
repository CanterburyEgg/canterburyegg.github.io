"""Even written lines (exact scores): notes written evenly are spaced evenly.

With a MusicXML score the written rhythm is exact, so notes written with equal gaps (eighths or quicker, up to 0.5s)
should sound evenly spaced. A note that came out 0.045s+ away from where the written rhythm puts it between its
neighbours -- pulled by an impact, a snap to a nearby attack, or the warp -- moves back there; repeated a few times so
a run with several pulled notes settles evenly (Jupiter 1:43: the trumpets' 62 67 72 74; 2:05: the trumpets' 79 74 76
quarters came out 0.19s / 0.46s apart; 0:34, 0:57, 2:08, 2:46, 2:56). Only the pulled notes move, so a run that
speeds up or slows down with the band keeps doing so. The last note of an even run that lands on a held note, with
the next note 2 gaps+ away, is put at the run's pace from the two before it (1:16: the woodwinds' 71 74 76 into the
held 76). PDF-read scores (every locked chart so far) keep their approved timing: their rhythm is read from the
engraving and the recording decides.
"""


def _even(g1, g2):
    return 0.05 < g1 <= 0.5 and abs(g1 - g2) <= 0.03 * max(g1, g2) + 0.005


def run(ns):
    warped = ns.get("warped")
    mo = ns.get("melody_out")
    score_path = ns.get("score_path")
    if not isinstance(warped, list) or not isinstance(mo, list) or len(warped) != len(mo):
        return
    if score_path is None or score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    ss = [float(w.get("score_start", 0.0)) for w in warped]
    n = len(mo)
    touched = set()

    def put(k, t, keep_end=False):
        end = float(mo[k][1])
        dur = end - float(mo[k][0])
        t = round(t, 4)
        mo[k][0] = t
        nxt = float(mo[k + 1][0]) if k + 1 < n else 1e9
        mo[k][1] = round(end if keep_end else min(t + dur, nxt - 0.015), 4)
        if k > 0:
            mo[k - 1][1] = round(min(float(mo[k - 1][1]), t - 0.015), 4)
        touched.add(k)

    # pulled notes inside even runs, a few passes so neighbouring pulls settle
    flagged = set()
    for k in range(1, n - 1):
        g1, g2 = ss[k] - ss[k - 1], ss[k + 1] - ss[k]
        if _even(g1, g2):
            ta, tb, tc = float(mo[k - 1][0]), float(mo[k][0]), float(mo[k + 1][0])
            if abs(tb - (ta + (tc - ta) * g1 / (g1 + g2))) >= 0.045:
                flagged.add(k)
    # (a pulled note's neighbours inside the run may need to give a little too)
    zone = sorted({j for k in flagged for j in (k - 1, k, k + 1) if 0 < j < n - 1 and _even(ss[j] - ss[j - 1], ss[j + 1] - ss[j])})
    for _ in range(12):
        for k in zone:
            g1, g2 = ss[k] - ss[k - 1], ss[k + 1] - ss[k]
            ta, tc = float(mo[k - 1][0]), float(mo[k + 1][0])
            exp = ta + (tc - ta) * g1 / (g1 + g2)
            if abs(float(mo[k][0]) - exp) >= 0.005:
                put(k, exp)
    # the last note of an even run landing on a hold
    for k in range(2, n):
        g1, g2 = ss[k - 1] - ss[k - 2], ss[k] - ss[k - 1]
        if not _even(g1, g2) or (k + 1 < n and _even(g2, ss[k + 1] - ss[k])):
            continue
        if float(mo[k][1]) - float(mo[k][0]) < 0.45 or (k + 1 < n and float(mo[k + 1][0]) - float(mo[k][0]) < 2 * g2):
            continue
        pace = (float(mo[k - 1][0]) - float(mo[k - 2][0])) / g1
        want = float(mo[k - 1][0]) + pace * g2
        if abs(float(mo[k][0]) - want) >= 0.045:
            put(k, want, keep_end=True)
    if touched:
        print(f"    -> even written lines: {len(touched)} note(s) moved back onto their written spacing")
