"""Section holds the line: when the section doubling the line holds a note, the line holds with it.

The part carrying the line is really the section playing it: when the parts doubling the lead's note (5+, same time,
same note or octaves) split at the next note, most of them HOLD a note (0.9s+) and the lead's own part breaks off into
quicker notes (under 0.5s), the section's held note is the line and the part's figure is underneath it. The lead takes
the held note, and the part's notes under it go (Ride 2:00: clarinet 1, soprano sax, trumpet 1, flutes and piccolo hold
77 while the oboes play 74 75 74 with the horns).
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

    drop, quiet_until, quiet_staff, splits = set(), -1.0, None, 0
    for i in range(1, len(lead)):
        n, p = lead[i], lead[i - 1]
        st = n.get("staff")
        if st == quiet_staff and float(n["start"]) < quiet_until - 0.05:
            drop.add(i)
            continue
        if not st or st != p.get("staff"):
            continue
        group = [nm for nm in by_name if (lambda m: m is not None and (int(m["midi"]) - int(p["midi"])) % 12 == 0)(at(nm, float(p["start"])))]
        if len(group) < 5:
            continue
        cls = {}
        for nm in group:
            m = at(nm, float(n["start"]))
            if m is not None:
                cls.setdefault(int(m["midi"]) % 12, []).append((nm, m))
        mine = int(n["midi"]) % 12
        best = max(cls.items(), key=lambda kv: len(kv[1]), default=None)
        held = best and all(float(m["end"]) - float(m["start"]) >= 0.9 for _, m in best[1])
        if (best and held and best[0] != mine and float(n["end"]) - float(n["start"]) < 0.5
                and len(best[1]) > len(cls.get(mine, [])) + 1):
            nm2, m2 = min(best[1], key=lambda x: abs(int(x[1]["midi"]) - int(p["midi"])))
            lead[i] = dict(n, staff=nm2, midi=int(m2["midi"]), end=float(m2["end"]))
            quiet_until, quiet_staff = float(m2["end"]), st
            splits += 1
    if drop:
        lead = [n for i, n in enumerate(lead) if i not in drop]
    if splits:
        print(f"    -> section holds the line at {splits} split(s)")
    ctx.lead_notes = lead
