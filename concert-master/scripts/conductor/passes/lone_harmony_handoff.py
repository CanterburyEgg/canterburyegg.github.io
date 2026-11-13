"""Handoff onto a lone harmony note: keep the note more of the band plays.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes
    staff_notes_by_name = ctx.staff_notes_by_name
    _doublers_of = ctx._doublers_of

    for idx_h in range(1, len(lead_notes)):
        cur_h, prev_h = lead_notes[idx_h], lead_notes[idx_h - 1]
        a_name, b_name = prev_h.get("staff"), cur_h.get("staff")
        if not a_name or not b_name or a_name == b_name or a_name not in staff_notes_by_name:
            continue
        a_same_t = [
            m for m in staff_notes_by_name[a_name]
            if abs(float(m["start"]) - float(cur_h["start"])) <= 0.02 and m["midi"] != cur_h["midi"]
        ]
        if not a_same_t or idx_h < 3 or float(cur_h["end"]) - float(cur_h["start"]) < 0.5:
            continue
        if any(k in (a_name + b_name).lower() for k in ("mallet", "xylo", "chime", "glock")):
            continue
        # only where the two staves were playing the same line in unison right up to the split
        b_notes_h = staff_notes_by_name.get(b_name, [])
        if not all(
            any(abs(float(m["start"]) - float(lead_notes[idx_h - q]["start"])) <= 0.02 and m["midi"] == lead_notes[idx_h - q]["midi"] for m in b_notes_h)
            for q in (1, 2, 3)
        ):
            continue
        alt = a_same_t[0]
        if _doublers_of(alt, a_name) > _doublers_of(cur_h, b_name) + 1:
            lead_notes[idx_h] = dict(cur_h, midi=alt["midi"], start=alt["start"], end=alt["end"], staff=a_name)

    ctx.staves = staves
    ctx.lead_notes = lead_notes
