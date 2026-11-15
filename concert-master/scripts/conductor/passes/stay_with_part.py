"""Stay with the part: the line stays with the part that has it while that part keeps playing the same tune.

When the lead passes to another part that is only doubling the current one (the same notes, struck together), the line
stays with the current part. And when the two then split into octaves, the line follows the part it stayed with -- the
ear doesn't jump sections just because a doubling part dropped an octave (Ride 1:32-1:34: clarinet 1 and the oboes play
74 75 74 72 together, then clarinet 1 and the flutes go up 77 79 81 82 84 while the oboes take it an octave lower).
"""


def run(ctx):
    by_name = {st["name"]: sorted(st["notes"], key=lambda m: float(m["start"])) for st in ctx.staves if not st.get("is_drum")}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))

    def at(nm, t):
        for m in by_name.get(nm, ()):
            s = float(m["start"])
            if abs(s - t) <= 0.02:
                return m
            if s > t + 0.05:
                break
        return None

    owner, doubling, swaps = None, False, 0
    for i, n in enumerate(lead):
        st = n.get("staff")
        if owner is None or st == owner or not st:
            owner, doubling = st or owner, False
            continue
        m = at(owner, float(n["start"]))
        if m is not None and (int(m["midi"]) == int(n["midi"]) or (doubling and abs(int(m["midi"]) - int(n["midi"])) == 12)):
            lead[i] = dict(n, staff=owner, midi=int(m["midi"]), end=float(m["end"]))
            doubling = True
            swaps += 1
        else:
            owner, doubling = st, False
    if swaps:
        print(f"    -> stayed with the part on {swaps} doubled notes")
    ctx.lead_notes = lead
