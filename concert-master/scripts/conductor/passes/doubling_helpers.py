"""Shared helpers (not a pass): _doublers_of, staff_notes_by_name.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    # Handoff onto a lone harmony note: when the conductor switches staff at a note where the staff it was following
    # ALSO plays (a different note), keep whichever note more of the band is playing (e.g. Ride m.75 at 1:31: Clarinet 1
    # drops to A with the alto saxes, alto clarinet and horns, while the Soprano Sax alone goes up to D).
    def _doublers_of(note, skip_name):
        cnt = 0
        for st in staves:
            nm = st["name"].lower()
            if st["name"] == skip_name or any(k in nm for k in ("perc", "timp", "drum")):
                continue
            if any(
                abs(float(m["start"]) - float(note["start"])) <= 0.02
                and m["midi"] % 12 == note["midi"] % 12
                and abs(m["midi"] - note["midi"]) <= 12
                for m in st["notes"]
            ):
                cnt += 1
        return cnt

    staff_notes_by_name = {st["name"]: st["notes"] for st in staves}

    ctx.staves = staves
    ctx.lead_notes = lead_notes
    ctx._doublers_of = _doublers_of
    ctx.staff_notes_by_name = staff_notes_by_name
