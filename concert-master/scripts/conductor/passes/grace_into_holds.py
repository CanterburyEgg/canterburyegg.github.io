"""Grace notes into holds: the hold starts on the grace.

(Moved verbatim from sync_score.process_pair: runs after the conductor picks the lead.)
"""
import json  # noqa: F401
import re  # noqa: F401
from pathlib import Path  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    raw_staves = ctx.raw_staves  # noqa: F841
    score_dur = ctx.score_duration  # noqa: F841
    score_path = ctx.score_path  # noqa: F841
    lead_score_notes = ctx.lead_notes

    # Grace notes into holds: a very short note (<= 0.15s) running straight into a long hold (1s+) in the same part is
    # the hold's ornament, so the hold starts on it (e.g. Guthix 0:42 / 0:54, the pan flute's grace into each hold).
    folded = []
    k_g = 0
    while k_g < len(lead_score_notes):
        n = lead_score_notes[k_g]
        nxt = lead_score_notes[k_g + 1] if k_g + 1 < len(lead_score_notes) else None
        prev_end = max((float(x["end"]) for x in folded), default=-10.0)
        # (only at a phrase start, after a 1s+ rest: mid-phrase acciaccaturas stay their own quick notes)
        if (
            nxt is not None
            and nxt.get("staff") == n.get("staff")
            and float(n["start"]) - prev_end >= 1.0
            and float(n["end"]) - float(n["start"]) <= 0.15
            and abs(float(nxt["start"]) - float(n["end"])) <= 0.02
            and float(nxt["end"]) - float(nxt["start"]) >= 1.0
        ):
            folded.append(dict(nxt, start=float(n["start"]), is_legato_suspension=True))
            k_g += 2
            continue
        folded.append(n)
        k_g += 1
    lead_score_notes = folded

    ctx.lead_notes = lead_score_notes
