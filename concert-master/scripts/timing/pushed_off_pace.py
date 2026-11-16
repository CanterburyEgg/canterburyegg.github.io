"""Pushed off its pace (exact scores): a note squeezed against one neighbour and stretched from the other goes back to
where the written rhythm puts it between them.

With a MusicXML score the written rhythm is exact. When a note's gap to the note before it and its gap to the note
after it, each measured against its written length, disagree by 2x or more (one side rushed, the other dragged) and
the note sits 0.12s+ from where its written position between those two neighbours puts it, it moves there (Jupiter
3:54: the clarinets' 75 in 75 77 75 74 came out 0.71s after the 77 for a written 0.57s, then 0.57s before the 74 for a
written 1.14s -- 0.29s late). Uneven written rhythms are fine: only the pace is compared. PDF-read scores keep their
approved timing.
"""


def run(ns):
    warped = ns.get("warped")
    mo = ns.get("melody_out")
    score_path = ns.get("score_path")
    if not isinstance(warped, list) or not isinstance(mo, list) or len(warped) != len(mo):
        return
    if score_path is None or score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    ss = [float(w.get("score_start", 0.0)) for w in warped]
    moved = 0
    for k in range(1, len(mo) - 1):
        w1, w2 = ss[k] - ss[k - 1], ss[k + 1] - ss[k]
        ta, tb, tc = float(mo[k - 1][0]), float(mo[k][0]), float(mo[k + 1][0])
        if w1 <= 0.05 or w2 <= 0.05 or tc - ta > 2.5 or tb <= ta or tc <= tb:
            continue
        p1, p2 = (tb - ta) / w1, (tc - tb) / w2
        if max(p1, p2) < 2.0 * min(p1, p2):
            continue
        exp = ta + (tc - ta) * w1 / (w1 + w2)
        if abs(tb - exp) < 0.12:
            continue
        end = float(mo[k][1])
        dur = end - tb
        mo[k][0] = round(exp, 4)
        mo[k][1] = round(min(exp + dur, tc - 0.015), 4)
        mo[k - 1][1] = round(min(float(mo[k - 1][1]), exp - 0.015), 4)
        moved += 1
        if __import__("os").environ.get("CM_PACE_LIST"):
            print(f"      pace {tb:.2f} -> {exp:.2f} midi {mo[k][2]}")
    if moved:
        print(f"    -> pushed off its pace: {moved} note(s) moved back between their neighbours")
