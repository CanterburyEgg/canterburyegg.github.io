"""An ostinato keeps its written rhythm: a run of one repeated pitch in one part (8+ notes, each within 0.5s of the
last in the score, in at least two different note lengths -- Mars 5:01-5:07, the trumpets' 79 | 79 79 79 . 79 79 79 |
...: quarters, eighths and triplets) is laid on its written rhythm at the local tempo, a steady line fitted through
the notes' own times (the 8 either side, robustly), wherever the alignment has let its quick notes drift: a triplet
came out 0.18s apart, the same as the eighths next to it, so the bursts read as one long run of eighths and the keys
couldn't tell them apart (user, Nov 19: "I like that it jumps into the ostinato here"). Only where some quick group is
off its written spacing by a quarter or more. Exact scores only.
"""

import numpy as np


def run(ns):
    sp, mo, warped = ns.get("score_path"), ns.get("melody_out"), ns.get("warped")
    if sp is None or sp.suffix.lower() not in (".mxl", ".musicxml", ".xml") or not mo or not warped:
        return
    n = min(len(mo), len(warped))
    sc = lambda k: float(warped[k]["score_start"])
    moved = 0
    k = 0
    while k < n:
        j = k
        while j + 1 < n and int(mo[j + 1][2]) == int(mo[k][2]) and warped[j + 1].get("staff") == warped[k].get("staff") and \
                0.03 < sc(j + 1) - sc(j) <= 0.5:
            j += 1
        if j - k + 1 >= 8:
            idx = list(range(k, j + 1))
            sg = [sc(q + 1) - sc(q) for q in idx[:-1]]
            if len({round(g, 2) for g in sg}) >= 2:
                s = np.array([sc(q) for q in idx])
                t = np.array([float(mo[q][0]) for q in idx])
                ag = np.diff(t)
                quick = [i for i, g in enumerate(sg) if g < 0.18]
                # (only where the quick notes have drifted off their written spacing)
                scale = (t[-1] - t[0]) / (s[-1] - s[0])
                off = [i for i in quick if abs(ag[i] - sg[i] * scale) > sg[i] * scale / 4]
                if off:
                    W = min(17, len(idx))
                    new = []
                    for i in range(len(idx)):
                        lo = min(max(0, i - W // 2), len(idx) - W)
                        ss_, tt_ = s[lo:lo + W], t[lo:lo + W]
                        pairs = [(tt_[b] - tt_[a]) / (ss_[b] - ss_[a]) for a in range(W) for b in range(a + 1, W) if ss_[b] > ss_[a]]
                        m = float(np.median(pairs))
                        c = float(np.median(tt_ - m * ss_))
                        new.append(m * s[i] + c)
                    for i, q in enumerate(idx):
                        if abs(new[i] - float(mo[q][0])) > 0.015:
                            d = float(mo[q][1]) - float(mo[q][0])
                            mo[q][0] = round(new[i], 4)
                            mo[q][1] = round(new[i] + d, 4)
                            moved += 1
                    for q in range(max(0, k - 1), min(n - 1, j + 1)):
                        nxt = float(mo[q + 1][0])
                        if float(mo[q][1]) > nxt - 0.015:
                            mo[q][1] = round(max(float(mo[q][0]) + 0.04, nxt - 0.015), 4)
                    print(f"    -> ostinato in written rhythm at {float(mo[k][0]):.2f}s ({len(idx)} notes)")
        k = j + 1
    if moved:
        print(f"    -> ostinatos: {moved} note(s) re-timed")
