"""Mover over a shared hold: when two parts start on the same note and one holds it while the other climbs away, the
lead follows the one that moves.

At an entry where the lead takes a part that sits on a long note (1.5s+), but another part starts on that same note
at the same moment and carries on moving through 3+ more notes while it's held (Jupiter 4:59-5:02: the English horn
holds 65 while the clarinets go 65 70 75 77; the clarinets hold 70 while the oboes go 70 75 80 82; the oboes hold 77
while the flutes go 77 82 87 89), the ear follows the line that moves: its notes replace the hold.
"""


def run(ctx):
    staves = [st for st in ctx.staves if not st.get("is_drum")]
    by = {st["name"]: sorted(st["notes"], key=lambda m: float(m["start"])) for st in staves}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out, changed = [], 0
    for n in lead:
        s0, s1 = float(n["start"]), float(n["end"])
        if s1 - s0 < 1.5:
            out.append(n)
            continue
        best = None
        for name, ns in by.items():
            if name == n.get("staff"):
                continue
            i = next((q for q, m in enumerate(ns) if abs(float(m["start"]) - s0) <= 0.02 and int(m["midi"]) == int(n["midi"])), None)
            if i is None:
                continue
            line = [ns[i]]
            q = i + 1
            while q < len(ns) and float(ns[q]["start"]) < s1 - 0.05 and float(ns[q]["start"]) - float(line[-1]["end"]) <= 0.05:
                line.append(ns[q])
                q += 1
            # (a real line leaving the note: its first note much shorter than the hold -- not a part that shares most
            # of the hold before moving, like Sevens 0:51's second trumpets -- and steps of 0.3s+, not a harp sweep)
            if float(line[0]["end"]) - float(line[0]["start"]) > 0.35 * (s1 - s0) or any(float(m["end"]) - float(m["start"]) < 0.3 for m in line):
                continue
            if len(line) >= 4 and len({int(m["midi"]) for m in line}) >= 4 and (best is None or len(line) > len(best[1])):
                best = (name, line)
        if best is None:
            out.append(n)
            continue
        name, line = best
        out.extend(dict(m, staff=name) for m in line)
        changed += 1
    if changed:
        print(f"    -> mover over a shared hold: {changed} held lead note(s) replaced by the part moving away from them")
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
