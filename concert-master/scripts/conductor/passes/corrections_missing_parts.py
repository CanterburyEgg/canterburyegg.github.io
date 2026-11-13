"""<song>_corrections.json 'missing_parts' and 'merge' (by ear).

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

    # Parts the score reader misses (<song>_corrections.json "missing_parts", score seconds): e.g. Guthix's Howl FX
    # swells, written on single-line FX staves the PDF parser skips. They join the lead like any written note.
    corr_early = (Path(__file__).resolve().parents[2] / f"{score_path.stem.lower()}_corrections.json")
    if corr_early.exists():
        for mp in json.loads(corr_early.read_text(encoding="utf-8")).get("missing_parts", []):
            lead_score_notes.append(
                {
                    "start": float(mp["start"]),
                    "end": float(mp["end"]),
                    "midi": int(mp["midi"]),
                    "vel": int(mp.get("vel", 90)),
                    "staff": mp["staff"],
                    "is_legato_suspension": True,
                }
            )
        # "merge" entries (score seconds): a sustain the score reader splits into separate notes (e.g. a misread
        # accidental mid-tie) -> that part's notes starting in [start, end) become one held note on `midi`.
        for mg in json.loads(corr_early.read_text(encoding="utf-8")).get("merge", []):
            m0, m1 = float(mg["start"]), float(mg["end"])
            parts = [n for n in lead_score_notes if n.get("staff") == mg["staff"] and m0 - 0.02 <= float(n["start"]) < m1]
            if parts:
                first = min(parts, key=lambda x: float(x["start"]))
                lead_score_notes = [n for n in lead_score_notes if not any(n is q for q in parts)]
                lead_score_notes.append(dict(first, end=max(float(q["end"]) for q in parts), midi=int(mg["midi"])))
        lead_score_notes.sort(key=lambda x: float(x["start"]))

    ctx.lead_notes = lead_score_notes
