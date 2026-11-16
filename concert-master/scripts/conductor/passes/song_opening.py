"""Song opening: the chart starts with the music.

When the first lead note comes after the piece has already started -- another leading part plays 3+ notes from the
very beginning and runs straight into it (no breath over 0.25s) -- those opening notes come first (Jupiter 0:00: the second violins'
64 67 69 64 start the running figure a beat before the first violins the conductor picked).
"""

from ..core import instrument_role_prior


def run(ctx):
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    if not lead:
        return
    t_lead = float(lead[0]["start"])
    staves = [st for st in ctx.staves if not st.get("is_drum") and st["notes"]]
    t_first = min(float(m["start"]) for st in staves for m in st["notes"])
    if t_lead - t_first < 0.1:
        return
    best = None
    for st in staves:
        ns = sorted((m for m in st["notes"] if float(m["start"]) < t_lead - 0.02), key=lambda m: float(m["start"]))
        # (a leading part's running figure, 3+ notes -- not a bass note or a timpani roll)
        if len(ns) < 3 or float(ns[0]["start"]) > t_first + 0.02 or instrument_role_prior(st["name"]) < 0.4:
            continue
        # it runs straight into the first lead note
        chain = ns + [lead[0]]
        if all(float(b["start"]) - float(a["end"]) <= 0.25 for a, b in zip(chain, chain[1:])):
            if best is None or len(ns) > len(best[1]):
                best = (st["name"], ns)
    if best:
        print(f"    -> song opening: {best[0]}'s {len(best[1])} notes before the first lead note")
        ctx.lead_notes = sorted(lead + [dict(m, staff=best[0]) for m in best[1]], key=lambda x: float(x["start"]))
