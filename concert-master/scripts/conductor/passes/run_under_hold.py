"""Run under a held note: play the run, cut the hold.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    # Run under a held note: when the lead holds a note while at least three other parts play a quick scale run that
    # lands exactly on the lead's next note (e.g. Ride m.154 at 2:55: the trumpets hold B-flat while flutes, horns & saxes
    # run up 80 82 84 86 -> 87 into the trumpets' E-flat), the run is what's heard: cut the hold and play the run.
    def _quick_run_into(notes_s, t0, t1, landing_t):
        inside = [m for m in notes_s if t0 < float(m["start"]) < t1 - 0.01]
        land_n = [m for m in notes_s if abs(float(m["start"]) - landing_t) <= 0.02]
        if len(inside) < 4 or not land_n:
            return None
        seq_r = inside[-4:] + land_n[:1]
        steps_r = [seq_r[q + 1]["midi"] - seq_r[q]["midi"] for q in range(4)]
        gaps_r = [float(seq_r[q + 1]["start"]) - float(seq_r[q]["start"]) for q in range(4)]
        mono = all(0 < x <= 3 for x in steps_r) or all(-3 <= x < 0 for x in steps_r)
        return seq_r if mono and all(g <= 0.13 for g in gaps_r) else None

    inserted_runs = []
    for idx_h in range(len(lead_notes) - 1):
        hold_n, next_n = lead_notes[idx_h], lead_notes[idx_h + 1]
        h_s, h_e, n_s = float(hold_n["start"]), float(hold_n["end"]), float(next_n["start"])
        if h_e - h_s < 0.5:
            continue
        runs_found = []
        for st in staves:
            nm = st["name"].lower()
            if st["name"] == hold_n.get("staff") or any(k in nm for k in ("perc", "timp", "drum", "glock", "xylo", "mallet", "picc")):
                continue
            r = _quick_run_into(st["notes"], h_s + 0.1, n_s, n_s)
            if r and r[-1]["midi"] % 12 == next_n["midi"] % 12:
                runs_found.append((st["name"], r))
        if len(runs_found) >= 3:
            name_r, r = max(runs_found, key=lambda x: x[1][-1]["midi"])  # the top voice (as in the first statement)
            inserted_runs.append((idx_h, name_r, r))
    for idx_h, name_r, r in reversed(inserted_runs):
        hold_n = lead_notes[idx_h]
        hold_n["end"] = min(float(hold_n["end"]), float(r[0]["start"]) - 0.005)
        lead_notes[idx_h + 1] = dict(lead_notes[idx_h + 1], midi=r[-1]["midi"], run_landing=True)
        for m in reversed(r[:-1]):
            lead_notes.insert(idx_h + 1, dict(m, staff=name_r, run_under_hold=True))

    ctx.staves = staves
    ctx.lead_notes = lead_notes
