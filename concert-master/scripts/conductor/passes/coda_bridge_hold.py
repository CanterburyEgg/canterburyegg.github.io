"""Coda bridge: sustain the penultimate note across the final crescendo.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    # If the penultimate note of the piece is followed by a >= 2.0s gap before the final stinger hit while the
    # low brass/woodwind section holds a tied crescendo chord across that entire gap (e.g. Sevens mm.131-133 at 3:42-3:46),
    # sustain the penultimate note across the crescendo hold so it leads directly into the final stinger slam!
    if len(lead_notes) >= 2 and (lead_notes[-1]["start"] - lead_notes[-2]["end"]) >= 2.0:
        pen_n = lead_notes[-2]
        fin_n = lead_notes[-1]
        has_bridge_hold = any(
            float(sn["start"]) <= float(pen_n["end"]) + 0.15
            and float(sn["end"]) >= float(fin_n["start"]) - 0.15
            and (float(sn["end"]) - float(sn["start"])) >= 2.5
            for st in staves
            for sn in st["notes"]
        )
        if has_bridge_hold:
            pen_n["end"] = round(float(fin_n["start"]) - 0.12, 4)
            pen_n["is_coda_bridge_hold"] = True
            fin_n["is_coda_final_stinger"] = True

    ctx.staves = staves
    ctx.lead_notes = lead_notes
