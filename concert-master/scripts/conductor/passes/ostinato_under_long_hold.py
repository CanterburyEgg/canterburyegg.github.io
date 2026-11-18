"""Ostinato under a long hold: when the lead holds one note for a long time (5s+) while an ostinato -- a rhythm hammered
on one pitch -- keeps going underneath the whole way (Mars 1:24-1:31: the band's 68 held for three bars over the 5/4
figure), the hold is played for about half its length and the ostinato is picked up from the start of the next round
of its rhythm after the halfway point (user, Nov 18: "a long hold that has the ostinato behind it, I wouldn't mind
picking that up halfway through").

The ostinato: one part with 8+ notes inside the hold, 80%+ of them one pitch, median length under 0.45s, running from
within 1s of the hold's start to within 1s of its end. A round starts where a quick burst begins after a slower gap
(the triplet at the head of Mars' bar). The highest such part is used. Exact scores only.
"""


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out = []
    for n in lead:
        s0, s1 = float(n["start"]), float(n["end"])
        if s1 - s0 < 5.0:
            out.append(n)
            continue
        best = None
        for st in ctx.staves:
            if st.get("is_drum") or st["name"] == n.get("staff"):
                continue
            ns = sorted((m for m in st["notes"] if s0 - 0.02 <= float(m["start"]) < s1 - 0.02), key=lambda m: float(m["start"]))
            if len(ns) < 8 or float(ns[0]["start"]) > s0 + 1.0 or float(ns[-1]["end"]) < s1 - 1.0:
                continue
            ps = [int(m["midi"]) for m in ns]
            top = max(set(ps), key=ps.count)
            durs = sorted(float(m["end"]) - float(m["start"]) for m in ns)
            if ps.count(top) < 0.8 * len(ns) or durs[len(durs) // 2] >= 0.45:
                continue
            if best is None or top > best[0]:
                best = (top, st["name"], ns)
        if best is None:
            out.append(n)
            continue
        _, name, ns = best
        mid = s0 + 0.5 * (s1 - s0)
        starts = [float(ns[i]["start"]) for i in range(1, len(ns) - 1)
                  if float(ns[i]["start"]) - float(ns[i - 1]["start"]) >= 0.3 and float(ns[i + 1]["start"]) - float(ns[i]["start"]) < 0.2]
        later = [t for t in starts if t >= mid - 0.05]
        cut = later[0] if later else min((float(m["start"]) for m in ns), key=lambda t: abs(t - mid))
        out.append(dict(n, end=cut))
        out.extend(dict(m, staff=name) for m in ns if float(m["start"]) >= cut - 0.02)
        print(f"    -> ostinato under the hold at {s0:.2f}s (score): held to {cut:.2f}, then {name}'s ostinato")
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
