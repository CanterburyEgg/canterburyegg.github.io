"""Held-over re-attacks under the lead are skipped; the previous note rings on.

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

    # Held-over re-attacks: when the lead jumps to a part that has been holding this same pitch since the previous lead
    # note was struck (they came in together), the written re-attack isn't heard: the part is already sounding, under the
    # lead. The re-attack is skipped and the previous lead note rings on over it (Arabesque 4:35: the horns' A, held from
    # the oboe rip's top note, then written again; the rip's top note rings on). Only for a part UNDER the lead: a unison
    # re-strike is a repeated note you hear, and a part above a low line (Arabesque 5:35: piccolo over the low line) is
    # the next voice coming in.
    by_nm_r = {st["name"]: st for st in staves}
    kept_r = []
    for n in lead_score_notes:
        prev_r = kept_r[-1] if kept_r else None
        st_r = by_nm_r.get(n.get("staff"))
        if prev_r is not None and st_r is not None and prev_r.get("staff") != n.get("staff") and int(n["midi"]) < int(prev_r["midi"]):
            held = any(
                q is not n and int(q["midi"]) == int(n["midi"]) and abs(float(q["end"]) - float(n["start"])) < 0.02
                and abs(float(q["start"]) - float(prev_r["start"])) < 0.02
                for q in st_r["notes"]
            )
            if held:
                prev_r["end"] = max(float(prev_r["end"]), float(n["end"]))
                continue
        kept_r.append(n)
    lead_score_notes = kept_r

    ctx.lead_notes = lead_score_notes
