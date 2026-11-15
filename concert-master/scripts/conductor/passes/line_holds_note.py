"""Line holds its note: a quick figure that ends on a note the next chord keeps holds that note.

When the lead's quick figure runs straight into a held chord, the lead's own part drops to a lower chord tone, and another
leading part holds the very note the figure just played, the ear hears the line hold its note (Ride 1:31: the woodwinds'
74 75 74 72 70 72 lands on a chord where clarinet 1 drops to 69 but trumpet 2 holds the 72 -- the chart plays 72, 72 held).
"""

from ..core import instrument_role_prior


def run(ctx):
    staves = [st for st in ctx.staves if not st.get("is_drum")]
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    for i in range(1, len(lead)):
        p, h = lead[i - 1], lead[i]
        t0, d = float(h["start"]), float(h["end"]) - float(h["start"])
        if d < 0.9 or float(p["end"]) - float(p["start"]) > 0.25 or t0 - float(p["start"]) > 0.3:
            continue
        if int(h["midi"]) >= int(p["midi"]):
            continue
        keep = None
        for st in staves:
            if st["name"] == h.get("staff") or instrument_role_prior(st["name"]) < 1.2:
                continue
            m = next((m for m in st["notes"] if abs(float(m["start"]) - t0) <= 0.02 and int(m["midi"]) == int(p["midi"])
                      and float(m["end"]) - float(m["start"]) >= 0.8 * d), None)
            if m is not None:
                keep = (st["name"], m)
                break
        if keep:
            print(f"    -> line holds its note at {t0:.2f}s (score): {keep[0]}'s {p['midi']} instead of {h.get('staff')}'s {h['midi']}")
            lead[i] = dict(h, midi=int(p["midi"]), staff=keep[0])
    ctx.lead_notes = lead
