"""Land with the band: a line the band lands on together gets its landing note.

When the band strikes a held note together (6+ parts, held 1.5s+) right after the lead's quick line (its last note 0.3s
or less before), and the lead's own part doesn't play that landing (it rests or goes off into a background figure), the
landing comes from a part that was doubling the lead's line just before and holds now -- held until the lead's next note
(Ride 2:58: the alto saxes' 70 71 70 68 66 68 ostinato doesn't land, it goes into the horn runs; the oboes, doubling it,
land on the band's 70).
"""


def run(ctx):
    staves = [st for st in ctx.staves if not st.get("is_drum")]
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    onsets = {}
    for st in staves:
        for m in st["notes"]:
            if float(m["end"]) - float(m["start"]) >= 1.5:
                onsets.setdefault(round(float(m["start"]), 2), []).append((st["name"], m))
    added = []
    for t, holders in sorted(onsets.items()):
        if len({nm for nm, _ in holders}) < 6:
            continue
        prev = [ln for ln in lead if t - 0.3 <= float(ln["start"]) < t - 0.02]
        if not prev or any(abs(float(ln["start"]) - t) <= 0.03 for ln in lead):
            continue
        p = prev[-1]
        if float(p["end"]) - float(p["start"]) > 0.3:
            continue
        # a holder that doubled the lead's last note (same time, same note or octave)
        src = None
        for nm, m in holders:
            st = next(s for s in staves if s["name"] == nm)
            if any(abs(float(x["start"]) - float(p["start"])) <= 0.02 and (int(x["midi"]) - int(p["midi"])) % 12 == 0 for x in st["notes"]):
                if src is None or abs(int(m["midi"]) - int(p["midi"])) < abs(int(src[1]["midi"]) - int(p["midi"])):
                    src = (nm, m)
        if src is None:
            continue
        nxt = min((float(ln["start"]) for ln in lead if float(ln["start"]) > t + 0.03), default=float(src[1]["end"]))
        print(f"    -> land with the band at {t:.2f}s (score): {src[0]}'s {src[1]['midi']}")
        added.append(dict(src[1], staff=src[0], end=min(float(src[1]["end"]), nxt)))
        p["end"] = min(float(p["end"]), t)
    if added:
        lead = sorted(lead + added, key=lambda x: float(x["start"]))
    ctx.lead_notes = lead
