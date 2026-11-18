"""The timpani isn't the tune: where the lead has landed on a timpani part while pitched parts strike with it, the
highest of those parts, if it's two octaves or more above, leads instead -- the top of the band's chord, not the drum under it (Mars 2:41: the band's
repeated chords, 80 on top, with the timpani's 45 under them; user, Nov 18: "locking onto the low brass background,
which it shouldn't"). A timpani solo -- nothing else striking -- keeps the lead. Exact scores only.
"""


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    others = [st for st in ctx.staves if not st.get("is_drum") and "timp" not in st["name"].lower()]
    out, swapped = [], 0
    for x in sorted(ctx.lead_notes, key=lambda m: float(m["start"])):
        if "timp" not in str(x.get("staff", "")).lower():
            out.append(x)
            continue
        t = float(x["start"])
        cands = [(int(m["midi"]), st["name"], m) for st in others for m in st["notes"] if abs(float(m["start"]) - t) < 0.03]
        if not cands:
            out.append(x)
            continue
        midi, name, m = max(cands, key=lambda c: c[0])
        if midi - int(x["midi"]) < 24:
            out.append(x)  # (the ostinato doubled an octave up -- Mars 0:34 -- is still the ostinato; the timpani can stay)
            continue
        out.append(dict(m, staff=name))
        swapped += 1
    if swapped:
        print(f"    -> timpani isn't the tune: {swapped} note(s) taken by the top of the chord")
    ctx.lead_notes = out
