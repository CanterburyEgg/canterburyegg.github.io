"""Even runs on their attacks (exact scores): an evenly written run lines up with the recording's own even attacks.

With a MusicXML score, a run of 5+ notes written with equal gaps (up to 0.5s) whose notes each have a clear attack in
the recording close by (within 0.12s), where those attacks are themselves evenly spaced, takes the recording's
attacks when the run sits 0.04s+ off them and is out of shape against them (some notes early, others late) (Jupiter 1:11-1:13: the horns' 71 67 64 60 57 54 50 50 came out
0.06-0.1s early against a steady attack every 0.245s, and the last two 50s were off). PDF-read scores keep their
approved timing.
"""
import numpy as np


def _even(g1, g2):
    return 0.05 < g1 <= 0.5 and abs(g1 - g2) <= 0.03 * max(g1, g2) + 0.005


def run(ns):
    warped = ns.get("warped")
    mo = ns.get("melody_out")
    score_path = ns.get("score_path")
    a_ons = ns.get("a_ons_raw")
    dt = ns.get("dt")
    if not isinstance(warped, list) or not isinstance(mo, list) or len(warped) != len(mo) or a_ons is None or dt is None:
        return
    if score_path is None or score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    a_ons = np.asarray(a_ons, dtype=float)
    ss = [float(w.get("score_start", 0.0)) for w in warped]
    n = len(mo)

    def peak_near(t):
        f0, f1 = max(2, int(round((t - 0.12) / dt))), min(len(a_ons) - 3, int(round((t + 0.12) / dt)))
        if f1 <= f0:
            return None
        seg = a_ons[f0:f1 + 1]
        f = f0 + int(np.argmax(seg))
        ctx = a_ons[max(0, f - 40): f + 40]
        if a_ons[f] < 1.5 * float(np.median(ctx)) + 1e-9 or a_ons[f] < a_ons[f - 2:f + 3].max():
            return None
        return f * dt

    moved = 0
    a = 0
    while a < n - 4:
        g = ss[a + 1] - ss[a]
        b = a + 1
        while b + 1 < n and _even(g, ss[b + 1] - ss[b]):
            b += 1
        if b - a + 1 >= 5 and 0.05 < g <= 0.5:
            idx = list(range(a, b + 1))
            pk = [peak_near(float(mo[k][0])) for k in idx]
            got = [(k, p) for k, p in zip(idx, pk) if p is not None]
            # (a run that drifts away from the attacks -- the warp slowing where the band doesn't, Jupiter 5:55: the
            # trumpets' 69 72 74 triplets came out with a ritardando nobody plays -- is followed attack by attack from its
            # first note at the run's own early pace instead)
            if len(got) < 0.8 * len(idx) or True:
                p0 = peak_near(float(mo[a][0]))
                if p0 is not None:
                    pace0 = (float(mo[min(a + 3, b)][0]) - float(mo[a][0])) / (ss[min(a + 3, b)] - ss[a])
                    chain, cur, ok_n = [(a, p0)], p0, 0
                    for k in idx[1:]:
                        step = pace0 * (ss[k] - ss[chain[-1][0]])
                        exp = cur + step
                        # (never at or before the last attack taken: each note gets its own, at least half a step on)
                        lo = max(exp - 0.07, cur + 0.5 * step)
                        f0, f1 = max(2, int(round(lo / dt))), min(len(a_ons) - 3, int(round((exp + 0.07) / dt)))
                        if f1 <= f0:
                            break
                        f = f0 + int(np.argmax(a_ons[f0:f1 + 1]))
                        if a_ons[f] >= 1.5 * float(np.median(a_ons[max(0, f - 40): f + 40])):
                            cur = f * dt
                            chain.append((k, cur))
                            ok_n += 1
                    if len(chain) >= 0.8 * len(idx):
                        drift = max(abs(float(mo[k][0]) - p) for k, p in chain)
                        if drift >= 0.12 and (len(got) < 0.8 * len(idx) or drift > 0.2):
                            got = chain
            if len(got) >= 0.8 * len(idx):
                pts = np.array([p for _, p in got])
                sc = np.array([ss[k] for k, _ in got])
                # the attacks themselves keep an even pace (a straight line through them fits within 0.03s)
                fit = np.polyfit(sc, pts, 1)
                if fit[0] <= 0.1:
                    a = b
                    continue
                resid = pts - np.polyval(fit, sc)
                offs = [p - float(mo[k][0]) for k, p in got]
                # (only a run that's out of shape against them -- some notes early, some late, 0.08s+ apart -- not one that
                # sits a touch to one side all the way along)
                if float(np.max(np.abs(resid))) <= 0.03 and ((abs(float(np.median(offs))) >= 0.04 and max(offs) - min(offs) >= 0.08) or max(offs) - min(offs) >= 0.2):
                    for k in idx:
                        t = round(float(np.polyval(fit, ss[k])), 4)
                        end = float(mo[k][1])
                        dur = end - float(mo[k][0])
                        mo[k][0] = t
                        mo[k][1] = round(t + dur, 4)
                        moved += 1
                    for k in range(max(1, a), min(n, b + 2)):
                        mo[k - 1][1] = round(min(float(mo[k - 1][1]), float(mo[k][0]) - 0.015), 4)
            a = b
        else:
            a += 1
    if moved:
        print(f"    -> even runs on their attacks: {moved} note(s) lined up with the recording's attacks")
