"""A section plays its top voice: when the lead is in one part of a section (Horn 5) and another part of the same
section (Horn 1) strikes the same rhythm a 3rd to a 6th higher, the higher part leads -- the tune is on top of the
section's harmony (Mars 1:50: the horns' 68 67 66 ..., Horn 5 a third under it). Same rhythm: 80%+ of the stretch's
notes struck together. Exact scores only.
"""
import re


def _section(name):
    return re.sub(r"[\s\d]+(in .*)?$", "", name.split(" in ")[0]).strip().lower()


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    by = {st["name"]: st["notes"] for st in ctx.staves if not st.get("is_drum")}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out, i, swapped = [], 0, 0
    while i < len(lead):
        j = i
        while j + 1 < len(lead) and lead[j + 1].get("staff") == lead[i].get("staff"):
            j += 1
        seg = lead[i:j + 1]
        i = j + 1
        name = seg[0].get("staff", "")
        best = None
        if len(seg) >= 4 and name in by:
            sec = _section(name)
            for other, ns in by.items():
                if other == name or _section(other) != sec:
                    continue
                match = []
                for x in seg:
                    m = next((m for m in ns if abs(float(m["start"]) - float(x["start"])) < 0.03), None)
                    if m is not None and 3 <= int(m["midi"]) - int(x["midi"]) <= 9:
                        match.append(dict(m, staff=other))
                if len(match) >= 0.8 * len(seg) and (best is None or len(match) > len(best[1])):
                    best = (other, match)
        if best is None:
            out.extend(seg)
            continue
        other, match = best
        times = {round(float(m["start"]), 3) for m in match}
        out.extend(m for m in match)
        out.extend(x for x in seg if round(float(x["start"]), 3) not in {round(float(m["start"]), 3) for m in match})
        swapped += 1
        print(f"    -> section top voice: {other} over {name} at {float(seg[0]['start']):.2f}s (score)")
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
