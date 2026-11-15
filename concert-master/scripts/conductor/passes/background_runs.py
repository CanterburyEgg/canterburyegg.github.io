"""Background runs: a quick run by another part in the middle of a line is background, the line stays with its part.

When the lead is with one part, detours to a second part for just a quick run underneath it (3+ notes, each 0.15s or shorter, all
within 0.6s), and comes straight back to the first part (within a second either side), the run was in the background:
the line stays with the first part, playing whatever it plays there (Ride 0:02 / 0:03: the horns' runs up between the
trumpets' figures).
"""


def run(ctx):
    by_name = {st["name"]: st["notes"] for st in ctx.staves if not st.get("is_drum")}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out = []
    i = 0
    changed = False
    while i < len(lead):
        b = lead[i].get("staff")
        j = i
        while j + 1 < len(lead) and lead[j + 1].get("staff") == b:
            j += 1
        seg = lead[i:j + 1]
        s0, s1 = float(seg[0]["start"]), float(seg[-1]["start"])
        a_prev = lead[i - 1] if i > 0 else None
        a_next = lead[j + 1] if j + 1 < len(lead) else None
        if (
            a_prev is not None and a_next is not None and b
            and a_prev.get("staff") == a_next.get("staff") and a_prev.get("staff") != b
            and len(seg) >= 3 and s1 - s0 <= 0.6
            and all(float(n["end"]) - float(n["start"]) <= 0.15 for n in seg)
            and s0 - float(a_prev["start"]) <= 1.0 and float(a_next["start"]) - s1 <= 1.0
            # (underneath the line: a run above it, like a flute pickup over the trumpets, is the top of the band)
            and max(int(n["midi"]) for n in seg) < min(int(a_prev["midi"]), int(a_next["midi"]))
        ):
            a = a_prev.get("staff")
            own = [dict(m, staff=a) for m in by_name.get(a, ()) if s0 - 0.02 <= float(m["start"]) < float(a_next["start"]) - 0.02]
            print(f"    -> background run at {s0:.2f}s (score): {b}'s run under {a}'s line")
            out.extend(own)
            changed = True
        else:
            out.extend(seg)
        i = j + 1
    if changed:
        out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
