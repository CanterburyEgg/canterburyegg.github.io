"""Run completion: a run's last note comes from the outgoing staff.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes
    staff_notes_by_name = ctx.staff_notes_by_name

    # Run completion: when the lead switches staff exactly where a quick run in the outgoing staff lands on its top (or
    # bottom) note, the run's last note comes from the outgoing staff (e.g. Ride m.150 at 2:52: flutes, horns & saxes
    # run 80 82 84 86 -> 87 while the trumpets enter on the same E-flat two octaves down: the run should land on 87)
    for idx_h in range(4, len(lead_notes)):
        cur_h = lead_notes[idx_h]
        a_name = lead_notes[idx_h - 1].get("staff")
        if not a_name or a_name == cur_h.get("staff") or a_name not in staff_notes_by_name:
            continue
        prev4 = lead_notes[idx_h - 4 : idx_h]
        if any(p.get("staff") != a_name for p in prev4):
            continue
        steps = [prev4[q + 1]["midi"] - prev4[q]["midi"] for q in range(3)]
        dir_r = 1 if all(0 < st <= 3 for st in steps) else -1 if all(-3 <= st < 0 for st in steps) else 0
        if not dir_r or any(float(prev4[q + 1]["start"]) - float(prev4[q]["start"]) > 0.25 for q in range(3)):
            continue
        land = [
            m for m in staff_notes_by_name[a_name]
            if abs(float(m["start"]) - float(cur_h["start"])) <= 0.02
            and 0 < (m["midi"] - prev4[-1]["midi"]) * dir_r <= 3
            and m["midi"] % 12 == cur_h["midi"] % 12
        ]
        if land:
            lead_notes[idx_h] = dict(cur_h, midi=land[0]["midi"], run_landing=True)

    ctx.staves = staves
    ctx.lead_notes = lead_notes
