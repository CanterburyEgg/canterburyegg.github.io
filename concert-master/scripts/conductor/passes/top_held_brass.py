"""Top of the held brass: follow the higher brass part on long holds.

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
    pitched_st = ctx.pitched_st
    _BRASS_NM = ctx._BRASS_NM

    # Top of the held brass: when the lead is an inner brass part on long held notes (1s+) and, at each of 2+ of those
    # notes in a row, a brass part above it strikes a different, higher held note at the same moment, the top of the
    # brass is what rings out (Arabesque 5:38: the trumpets climb 81 82 84 over the horns' 67 70 70).
    def _top_brass(n):
        best = None
        for st in pitched_st:
            if st["name"] == n.get("staff") or not any(b in st["name"].lower() for b in _BRASS_NM):
                continue
            for q in st["notes"]:
                if abs(float(q["start"]) - float(n["start"])) < 0.02 and float(q["end"]) - float(q["start"]) >= 1.0 and int(q["midi"]) > int(n["midi"]):
                    if best is None or int(q["midi"]) > int(best[1]["midi"]):
                        best = (st["name"], q)
        return best

    tb = []
    for idx, n in enumerate(lead_score_notes):
        is_br = any(b in str(n.get("staff", "")).lower() for b in _BRASS_NM)
        tb.append(_top_brass(n) if is_br and float(n["end"]) - float(n["start"]) >= 1.0 and not n.get("is_low_walk") else None)
    idx = 0
    out_tb = []
    while idx < len(lead_score_notes):
        j_t = idx
        while j_t < len(lead_score_notes) and tb[j_t] is not None and tb[j_t][0] == (tb[idx][0] if tb[idx] else None):
            j_t += 1
        if j_t - idx >= 2:
            for k in range(idx, j_t):
                out_tb.append(dict(tb[k][1], staff=tb[k][0], is_spliced=True))
            print(f"    -> top of the held brass: {tb[idx][0]} {[int(tb[k][1]['midi']) for k in range(idx, j_t)]} at {float(lead_score_notes[idx]['start']):.2f}s")
            idx = j_t
        else:
            out_tb.append(lead_score_notes[idx])
            idx += 1
    lead_score_notes = out_tb

    ctx.lead_notes = lead_score_notes
