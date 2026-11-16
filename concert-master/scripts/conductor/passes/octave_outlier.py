"""Octave outlier: a lead note an octave away from where everyone doubling the tune plays it takes their octave.

When the lead's part drops (or jumps) an octave for one note -- a range break or a part written in another octave --
while three or more other parts play the same note in the tune's own octave and nobody doubles the lead's octave, the
ear hears the tune's octave (Jupiter 2:12 / 2:16: the tenor tuba's 47 under the strings' 59, in 64 57 59 60). The note
moves to that octave when it leaps a 5th+ to and from its neighbours and the other octave just steps (a 4th or less).
"""


from bisect import bisect_left


def run(ctx):
    staves = [st for st in ctx.staves if not st.get("is_drum")]
    idx = []
    for st in staves:
        ns = sorted(st["notes"], key=lambda x: float(x["start"]))
        idx.append((st["name"], [float(x["start"]) for x in ns], ns))
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    changed = 0
    for i, n in enumerate(lead):
        t, m = float(n["start"]), int(n["midi"])
        same, octs = 0, {}
        for name, starts, ns in idx:
            if name == n.get("staff"):
                continue
            for q in range(bisect_left(starts, t - 0.02), len(ns)):
                if starts[q] > t + 0.02:
                    break
                x = ns[q]
                if True:
                    xm = int(x["midi"])
                    if xm == m:
                        same += 1
                    elif abs(xm - m) == 12:
                        octs[xm] = octs.get(xm, 0) + 1
        if not octs or same > 0:
            continue
        alt, cnt = max(octs.items(), key=lambda kv: kv[1])
        if cnt < 3:
            continue
        nb = [int(lead[j]["midi"]) for j in (i - 1, i + 1) if 0 <= j < len(lead) and abs(float(lead[j]["start"]) - t) < 1.0]
        # (a real outlier: a leap of a 5th+ to and from it, where the doubled octave just steps -- a 4th or less)
        if len(nb) < 2 or not all(abs(m - q) >= 7 and abs(alt - q) <= 5 for q in nb):
            continue
        lead[i] = dict(n, midi=alt)
        changed += 1
    if changed:
        print(f"    -> octave outlier: {changed} lead note(s) moved to the octave the doubling parts play")
    ctx.lead_notes = lead
