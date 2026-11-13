"""Rhythmic ostinato: da-da-DAAH cells repeated 3+ times.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    # Rhythmic ostinato: a "da-da-DAAH" cell (two or three quick notes, 0.22s or less, then a held note 0.65s+) that the
    # same part repeats 3+ times back to back: the quick notes are timed as an ostinato and each held note is a landing
    # (Ride 0:57-1:05: the oboes' "1-and-2..." figure).
    lead_notes.sort(key=lambda x: x["start"])
    dur_l = lambda x: float(x["end"]) - float(x["start"])
    cells = []
    k_o = 0
    while k_o < len(lead_notes):
        q = k_o
        while q < len(lead_notes) and dur_l(lead_notes[q]) <= 0.22 and q - k_o < 3 and lead_notes[q].get("staff") == lead_notes[k_o].get("staff"):
            q += 1
        if 2 <= q - k_o <= 3 and q < len(lead_notes) and dur_l(lead_notes[q]) >= 0.65 and lead_notes[q].get("staff") == lead_notes[k_o].get("staff"):
            cells.append((k_o, q))
            k_o = q + 1
        else:
            k_o += 1
    run_c = []
    for c in cells + [None]:
        if c is not None and run_c and c[0] == run_c[-1][1] + 1 and lead_notes[c[0]].get("staff") == lead_notes[run_c[-1][0]].get("staff"):
            run_c.append(c)
            continue
        if len(run_c) >= 3:
            for a_c, b_c in run_c:
                for j in range(a_c, b_c):
                    lead_notes[j] = dict(lead_notes[j], is_accel_ostinato=True)
                lead_notes[b_c] = dict(lead_notes[b_c], is_ostinato_landing=True)
            print(f"    -> rhythmic ostinato x{len(run_c)} at {float(lead_notes[run_c[0][0]]['start']):.2f}s (score)")
        run_c = [c] if c is not None else []

    ctx.staves = staves
    ctx.lead_notes = lead_notes
