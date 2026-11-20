"""An ostinato comes in on its round: when the lead holds a note and then picks up an ostinato that was going on under the
hold (a rhythm hammered on one pitch), it comes in at the start of the round in progress -- its quick burst, the
triplet at the head of Mars' bar -- not just after it (when it came in within the round's first 0.6s). The hold gives way there. Mars 5:06: the band's chord held
for 4s, then the trumpets' 79s from the quarter after the triplet; the whole last round, F D F D | D D D D, is the
figure (user, Nov 19: "I wanted the full FDFD D DDD of JUST the last ostinato, so I still get some held note in
there"). Exact scores only.
"""


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    by = {st["name"]: sorted(st["notes"], key=lambda m: float(m["start"])) for st in ctx.staves if not st.get("is_drum")}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    add, cut = [], {}
    for i in range(len(lead) - 4):
        h, nx = lead[i], lead[i + 1]
        h0, h1 = float(h["start"]), float(h["end"])
        name = nx.get("staff")
        if h1 - h0 < 1.5 or name == h.get("staff") or name not in by:
            continue
        after = [x for x in lead[i + 1:i + 9] if x.get("staff") == name]
        ps = [int(x["midi"]) for x in after]
        if len(after) < 4 or ps.count(ps[0]) < 0.8 * len(ps):
            continue
        pitch = ps[0]
        t_in = float(nx["start"])
        if t_in < h1 - 0.3:
            continue  # (the ostinato already came in during the hold)
        ns = [m for m in by[name] if h0 - 0.02 <= float(m["start"]) < t_in - 0.02 and int(m["midi"]) == pitch]
        # (the round in progress: the last burst start -- a note after a slower gap with a quick one after it)
        starts = [float(ns[k]["start"]) for k in range(1, len(ns) - 1)
                  if float(ns[k]["start"]) - float(ns[k - 1]["start"]) >= 0.3 and float(ns[k + 1]["start"]) - float(ns[k]["start"]) < 0.2]
        starts = [t for t in starts if t >= h0 + 1.0 and t_in - t <= 0.6]
        if not starts:
            continue
        t_r = starts[-1]
        cut[id(h)] = t_r
        add.extend(dict(m, staff=name) for m in ns if float(m["start"]) >= t_r - 0.02)
        print(f"    -> ostinato comes in on its round at {t_r:.2f}s (score): {name} after the hold from {h0:.2f}")
    if not cut:
        return
    out = [dict(x, end=cut[id(x)]) if id(x) in cut else x for x in lead] + add
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
