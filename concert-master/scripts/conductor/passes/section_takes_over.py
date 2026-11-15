"""Section takes over: a section coming in together above the lead's held note takes the line from there.

When 3+ parts that have been silent for a second or more come in together on the same figure (3+ notes struck together,
same notes or octaves), above a note the lead is holding, the ear moves to them -- and stays with them: the lead follows
the entering part for as long as the old part would have kept the line, until the lead moves to some other part or the
entering part rests for a second (Ride 1:26: clarinets and soprano sax come in with 74 75 74 72 over the horns' held 67,
and the woodwinds carry the line from there).
"""

from ..core import instrument_role_prior


def run(ctx):
    staves = [st for st in ctx.staves if not st.get("is_drum")]
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    onsets = sorted({round(float(m["start"]), 2) for st in staves for m in st["notes"]})
    done_until = -1.0
    for t in onsets:
        if t < done_until:
            continue
        # (the lead's current note -- the latest one struck before the entrance -- held through it)
        cur = [ln for ln in lead if float(ln["start"]) < t - 0.05]
        hold = cur[-1] if cur and float(cur[-1]["end"]) > t + 0.05 and float(cur[-1]["end"]) - float(cur[-1]["start"]) >= 0.9 else None
        # (only where the lead is still sitting on its held note: if the lead already moves at the entrance, the
        # conductor has followed it)
        if hold is None or any(abs(float(ln["start"]) - t) <= 0.03 for ln in lead):
            continue
        # (...and not the last note of a tune phrase: a figure coming in over a tune's held note is an interjection,
        # the tune keeps it -- Ride 2:20, the fanfare motif over the chorale's 65)
        h0 = float(hold["start"])
        own = [float(ln["start"]) for ln in cur if h0 - 2.5 <= float(ln["start"]) < h0 - 0.02
               and ln.get("staff") == hold.get("staff") and float(ln["end"]) - float(ln["start"]) < 1.0]
        if len(own) >= 3 and h0 - min(own) >= 1.0:
            continue
        group = []
        for st in staves:
            if st["name"] == hold.get("staff") or instrument_role_prior(st["name"]) < 1.2:
                continue
            ns = sorted(st["notes"], key=lambda m: float(m["start"]))
            first = [m for m in ns if abs(float(m["start"]) - t) <= 0.02]
            if not first or any(t - 1.0 < float(m["end"]) and float(m["start"]) < t - 0.02 for m in ns):
                continue
            fig = [m for m in ns if t - 0.02 <= float(m["start"])][:3]
            group.append((st["name"], ns, fig))
        if len(group) < 3:
            continue
        ref = group[0][2]
        same = [g for g in group if len(g[2]) == 3 and all(abs(float(a["start"]) - float(b["start"])) <= 0.02
                and (int(a["midi"]) - int(b["midi"])) % 12 == 0 for a, b in zip(g[2], ref))]
        if len(same) < 3:
            continue
        # the copy most of them play (ties: the first listed part)
        count = {}
        for g in same:
            key = tuple(int(m["midi"]) for m in g[2])
            count[key] = count.get(key, 0) + 1
        name, ns, fig0 = max(same, key=lambda g: count[tuple(int(m["midi"]) for m in g[2])])
        if min(int(m["midi"]) for m in fig0) <= int(hold["midi"]):
            continue
        old = hold.get("staff")
        # how far it carries: until the lead moves to a third part, or the entering part rests a second
        end = next((float(ln["start"]) for ln in lead if float(ln["start"]) > t and ln.get("staff") not in (old, name)), 1e9)
        mine = [m for m in ns if float(m["start"]) >= t - 0.02]
        for a, b in zip(mine, mine[1:]):
            if float(b["start"]) - float(a["end"]) >= 1.0:
                end = min(end, float(a["end"]) + 0.01)
                break
        print(f"    -> section takes over at {t:.2f}s (score): {name} (+{len(same) - 1}) over {old}'s held {hold['midi']}, until {min(end, 9999):.2f}s")
        hold["end"] = t
        lead = [ln for ln in lead if not (t - 0.02 <= float(ln["start"]) < end and ln.get("staff") == old)]
        lead.extend(dict(m, staff=name) for m in mine if float(m["start"]) < end)
        lead.sort(key=lambda x: float(x["start"]))
        done_until = end
    ctx.lead_notes = lead
