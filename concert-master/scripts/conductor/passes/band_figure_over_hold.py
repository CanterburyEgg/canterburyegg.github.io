"""Band figure over a held lead note: when most of the band plays a quick figure while the lead holds, the figure is the line.

While the lead holds one note (1s+), a quick figure (5+ notes, each 0.25s or shorter, starting inside the hold) that more
parts play than hold the lead's note (and at least 4: most of the band, not one instrument's fill) is what the ear
follows (Ride 2:24: oboe / clarinet / alto sax hold the chorale's 67 while piccolo, flutes, soprano sax, alto clarinet,
horns and glockenspiel play a fff turn; Ride 0:00: the horns hold 60 while the band plays 72 72 72 72 75 72). The figure is read from
the copy closest in register to the tune (or, over a plain accompaniment hold, the octave most parts play), and runs until the hold
ends; a figure that starts after the hold's attack keeps the held note until it comes in.
"""

from ..core import instrument_role_prior


def run(ctx):
    staves = ctx.staves
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    replaced = []
    for h in lead:
        t0, t1 = float(h["start"]), float(h["end"])
        # (a soloist's held note stays held: stay with the solo the whole time -- Ride 1:10, the alto sax's long note
        # under the woodwinds' riff)
        if t1 - t0 < 1.0 or h.get("solo"):
            continue
        if any(t0 + 0.02 < float(n["start"]) < t1 - 0.05 for n in lead if n is not h):
            continue
        holders, movers = 0, []
        for st in staves:
            if st.get("is_drum"):
                continue
            ns = [n for n in st["notes"] if t0 - 0.02 <= float(n["start"]) < t1 - 0.05]
            if any(abs(float(n["start"]) - t0) <= 0.02 and int(n["midi"]) == int(h["midi"]) and float(n["end"]) >= t1 - 0.05 for n in ns):
                holders += 1
                continue
            quick = [n for n in ns if float(n["end"]) - float(n["start"]) <= 0.25]
            if len(quick) >= 5 and ns and float(ns[0]["start"]) <= t1 - 0.3 and len(quick) >= len(ns) - 1:
                movers.append((st["name"], ns))
        if holders == 0 or len(movers) <= holders:
            continue
        # (the moving parts have to play the same figure: same attacks)
        ref = {round(float(n["start"]), 2) for n in movers[0][1]}
        same = [m for m in movers if len({round(float(n["start"]), 2) for n in m[1]} & ref) >= 0.8 * len(ref)]
        if len(same) <= holders or len(same) < 4:
            continue
        hm = int(h["midi"])
        # (a figure that sits at or below the held note -- even its highest copy -- is accompaniment under the tune: the
        # saxes' and horns' motif under the woodwinds' held 70 / 77 at Ride 0:26 / 0:34)
        med = lambda m: sorted(int(n["midi"]) for n in m[1])[len(m[1]) // 2]
        if max(med(m) for m in same) <= hm:
            continue
        line_of = lambda m: tuple(int(n["midi"]) for n in m[1])
        # (read from a leading instrument: not the piccolo / bells / bass parts that colour it)
        lead_parts = [m for m in same if instrument_role_prior(m[0]) >= 1.2] or same
        count = {}
        for m in lead_parts:
            count[line_of(m)] = count.get(line_of(m), 0) + 1
        # (after a tune phrase the figure is read from the copy closest to the tune's register, Ride 2:24's soprano sax;
        # over a hold that is just accompaniment -- no tune before it -- from the octave most of the band plays, Ride 0:00)
        # (a tune phrase: the held note's own part was moving (not holding) for a second or more just before it -- not just a
        # quick run up into it, like the horns' 53 55 56 58 into their held 60 at Ride 0:02)
        own = [float(n["start"]) for n in lead if t0 - 2.5 <= float(n["start"]) < t0 - 0.02 and n.get("staff") == h.get("staff")
               and float(n["end"]) - float(n["start"]) < 1.0]
        tune_before = len(own) >= 3 and t0 - min(own) >= 1.0
        dist = lambda m: abs(sorted(int(n["midi"]) for n in m[1])[len(m[1]) // 2] - hm)
        name, fig = min(lead_parts, key=(lambda m: (dist(m), -count[line_of(m)])) if tune_before else (lambda m: (-count[line_of(m)], dist(m))))
        # (a figure that comes in after the hold's attack over the last note of a tune phrase is an interjection: the
        # tune keeps its held note -- Ride 2:20, the fanfare motif under the chorale's held 65)
        if float(fig[0]["start"]) > t0 + 0.02 and tune_before:
            continue
        print(f"    -> band figure over held lead note {t0:.2f}-{t1:.2f}s (score): {name} ({len(same)} parts vs {holders} holding)")
        replaced.append((h, [dict(n, staff=name) for n in fig], tune_before))
    if replaced:
        # (the held note goes: a figure struck with it replaces it; a late figure over a plain accompaniment hold --
        # nothing of the hold's own part leading before it -- replaces it too, the hold was only background, Ride 0:00's
        # horn 60s under the trumpets' figure)
        drop = {id(h) for h, fig, tb in replaced if float(fig[0]["start"]) <= float(h["start"]) + 0.02 or not tb}
        for h, fig, _ in replaced:
            if id(h) not in drop:
                h["end"] = float(fig[0]["start"])
        lead = [n for n in lead if id(n) not in drop]
        for _, fig, _ in replaced:
            lead.extend(fig)
        lead.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = lead
