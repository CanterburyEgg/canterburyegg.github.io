"""Fill a silence: where the lead goes quiet for two seconds or more while the band plays on, the part that comes in at the
start of the silence is played -- a held note, or a run going right through the gap (the most notes in it, then the
highest). Mars 7:13: the trombones' held 66 after the horns' 65 left 3.4s with nothing to play; 7:19.9: the violins'
run started 2.6s before the lead picked it up (user, Nov 20: "I'm just missing this note?", "the woodwind part starts
here, but I don't pick it up for three whole seconds while I play nothing"). Percussion and parts holding a note from
before don't count. Exact scores only.
"""


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    perc = ("timp", "drum", "cymb", "gong", "glock", "xylo", "bell", "celesta", "tam", "triangle", "percus", "organ")
    staves = [st for st in ctx.staves if not st.get("is_drum") and not any(k in st["name"].lower() for k in perc)]
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    add = []
    for a, b in zip(lead, lead[1:]):
        g0, g1 = float(a["end"]), float(b["start"])
        if g1 - g0 < 2.0:
            continue
        best = None
        for st in staves:
            ns = [m for m in st["notes"] if g0 - 0.02 <= float(m["start"]) < g1 - 0.02]
            if not ns or float(min(ns, key=lambda m: float(m["start"]))["start"]) > g0 + 0.5:
                continue
            ns.sort(key=lambda m: float(m["start"]))
            # (sounding through most of the gap)
            cover = sum(min(g1, float(m["end"])) - float(m["start"]) for m in ns) / (g1 - g0)
            if cover < 0.6 or (len(ns) == 1 and float(ns[0]["end"]) - float(ns[0]["start"]) < 0.5):
                continue
            key = (len(ns), sorted(int(m["midi"]) for m in ns)[len(ns) // 2])
            if best is None or key > best[0]:
                best = (key, st["name"], ns)
        if best:
            _, name, ns = best
            add.extend(dict(m, staff=name, end=min(float(m["end"]), g1 - 0.02)) for m in ns)
            print(f"    -> silence filled at {g0:.2f}-{g1:.2f}s (score): {name}, {len(ns)} note(s)")
    if add:
        ctx.lead_notes = sorted(lead + add, key=lambda x: float(x["start"]))
