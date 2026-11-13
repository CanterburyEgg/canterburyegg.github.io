"""SONG-SPECIFIC (Arabesque): trombone score fix.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes
    by_name = ctx.by_name

    tb_st = by_name.get("Trombone 1, 2")
    if tb_st is not None:
        new_tb = []
        for n in tb_st["notes"]:
            if 270.95 <= n["start"] <= 271.85 and n["midi"] == 58:
                n_copy = dict(n)
                n_copy["midi"] = 62
                new_tb.append(n_copy)
            elif 276.80 <= n["start"] < 278.95 and n["midi"] in (58, 60):
                if (
                    new_tb
                    and 276.80 <= new_tb[-1]["start"] < 278.95
                    and new_tb[-1]["midi"] == 60
                    and (n["start"] - new_tb[-1]["end"]) <= 0.05
                ):
                    new_tb[-1]["end"] = n["end"]
                else:
                    n_copy = dict(n)
                    n_copy["midi"] = 60
                    new_tb.append(n_copy)
            else:
                new_tb.append(n)
        tb_st["notes"] = new_tb

    ctx.staves = staves
    ctx.lead_notes = lead_notes
