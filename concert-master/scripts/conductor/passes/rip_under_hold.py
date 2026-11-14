"""Rip octave: when the lead plays a quick run (4+ notes, each 0.1s or less, one way, small steps) that 3+ parts double
in octaves, coming off a held note (1s+), the run is heard in the octave nearest that held note -- not in whichever
octave the lead's part happens to have it (Arabesque 4:35: the clarinets hold 86, then rip from 72; piccolo, violins and
the mallets double it, and the mallets' 84 86 87 89 91 is the octave next to the 86). Only re-octaves a run the lead
already plays."""

_SKIP = ("timp", "drum")


def _runs(notes):
    out = []
    ns = sorted(notes, key=lambda x: float(x["start"]))
    i = 0
    while i < len(ns):
        j = i
        while (
            j + 1 < len(ns)
            and float(ns[j]["end"]) - float(ns[j]["start"]) <= 0.1
            and abs(float(ns[j + 1]["start"]) - float(ns[j]["end"])) <= 0.02
            and 0 < abs(int(ns[j + 1]["midi"]) - int(ns[j]["midi"])) <= 3
            and (j == i or (int(ns[j + 1]["midi"]) - int(ns[j]["midi"])) * (int(ns[j]["midi"]) - int(ns[j - 1]["midi"])) > 0)
        ):
            j += 1
        if j - i + 1 >= 4:
            out.append(ns[i : j + 1])
            i = j + 1
        else:
            i += 1
    return out


def run(ctx):
    lead = ctx.lead_notes
    cands = []
    for st in ctx.staves:
        if any(k in st["name"].lower() for k in _SKIP):
            continue
        for r in _runs(st["notes"]):
            cands.append((st["name"], r))
    added = []
    for h in sorted(lead, key=lambda x: float(x["start"])):
        h0, h1 = float(h["start"]), float(h["end"])
        if h1 - h0 < 1.0:
            continue
        # (the held note's own part may rip too, e.g. the clarinets hold 86 then rip from 72: it counts as one of the parts,
        # and the rip still comes in the octave nearest the held note)
        here = [(nm, r) for nm, r in cands if h0 + 0.3 < float(r[0]["start"]) <= h1 + 0.02]
        if not here:
            continue
        # group runs that start together with the same shape (octave doublings count as the same run)
        groups = {}
        for nm, r in here:
            shape = (round(float(r[0]["start"]), 2), int(r[0]["midi"]) % 12, tuple(int(b["midi"]) - int(a["midi"]) for a, b in zip(r, r[1:])))
            groups.setdefault(shape, []).append((nm, r))
        best = max(groups.values(), key=len)
        if len({nm for nm, _ in best}) < 3:
            continue
        nm, r = min(best, key=lambda x: (abs(int(x[1][0]["midi"]) - int(h["midi"])), -int(x[1][0]["midi"])))
        r0, r1 = float(r[0]["start"]), float(r[-1]["start"])
        # lead notes inside the rip are its other octaves (or a part that enters on the rip's last note): they give way
        inside = [x for x in lead if x is not h and r0 - 0.02 <= float(x["start"]) <= r1 + 0.02]
        in_run = {(g_nm, round(float(n["start"]), 3)) for g_nm, g_r in best for n in g_r}
        if any((x.get("staff"), round(float(x["start"]), 3)) not in in_run and float(x["start"]) < r1 - 0.02 for x in inside):
            continue
        # only a run the lead already plays, in a different octave
        if not inside or [int(x["midi"]) for x in sorted(inside, key=lambda x: float(x["start"]))][: len(r)] == [int(n["midi"]) for n in r]:
            continue
        lead = [x for x in lead if not any(x is y for y in inside)]
        h["end"] = min(float(h["end"]), r0)
        added.extend(dict(n, staff=nm, is_scalar_lick=True) for n in r)
        print(f"    -> rip octave: {nm} {[int(n['midi']) for n in r]} at {r0:.2f}s (nearest the held {h['midi']})")
    if added:
        ctx.lead_notes = sorted(lead + added, key=lambda x: float(x["start"]))
