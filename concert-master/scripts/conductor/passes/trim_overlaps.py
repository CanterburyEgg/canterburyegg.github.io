"""Trim overlaps between consecutive lead notes.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    for k in range(len(lead_notes) - 1):
        if lead_notes[k]["end"] > lead_notes[k + 1]["start"] - 0.01:
            lead_notes[k]["end"] = max(lead_notes[k]["start"] + 0.03, lead_notes[k + 1]["start"] - 0.01)

    ctx.staves = staves
    ctx.lead_notes = lead_notes
