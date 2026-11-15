"""Solos take the lead: each solo (found by solos, trimmed by solo_ends_with_band) replaces the lead over its span.

The lead's notes from the solo's first note to its last go; a note ringing into the solo is cut where it starts. A
solo's quick notes are licks, snapped tight; its long notes are landings, held (Ride 1:06-1:21, Alto Sax 1).
"""


def run(ctx):
    lead_notes = ctx.lead_notes
    for so in ctx.solos:
        s0, s1, nm_s, ns_s = so["s0"], so["s1"], so["staff"], so["notes"]
        lead_notes = [n for n in lead_notes if not (s0 - 0.02 <= float(n["start"]) <= s1 + 0.02)]
        for ln in lead_notes:
            if float(ln["start"]) < s0 and float(ln["end"]) > s0:
                ln["end"] = s0
        lead_notes.extend(dict(m, staff=nm_s, solo=True, is_scalar_lick=(float(m["end"]) - float(m["start"]) <= 0.14), is_ostinato_landing=(float(m["end"]) - float(m["start"]) >= 0.65)) for m in ns_s)
    lead_notes.sort(key=lambda x: x["start"])
    ctx.lead_notes = lead_notes
