"""<song>_corrections.json 'move_notes' (by ear).

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

    # Lead notes the score writes at the wrong moment (<song>_corrections.json "move_notes", score seconds, by ear):
    # 'to' = where the recording plays it; the lead's previous note ends there (cut short, or ringing on up to it).
    # Applied to the lead after it is picked, so the shorter neighbour doesn't change the pick.
    corr_drop = (Path(__file__).resolve().parents[2] / f"{score_path.stem.lower()}_corrections.json")
    if corr_drop.exists():
        for mv in json.loads(corr_drop.read_text(encoding="utf-8")).get("move_notes", []):
            for n_m in lead_score_notes:
                if n_m.get("staff") == mv["staff"] and abs(float(n_m["start"]) - float(mv["start"])) < 0.02 and int(n_m["midi"]) == int(mv["midi"]):
                    n_m["start"] = float(mv["to"])
                    prev_l = [n_p for n_p in lead_score_notes if n_p is not n_m and float(n_p["start"]) < float(mv["to"])]
                    if prev_l:
                        max(prev_l, key=lambda x: float(x["start"]))["end"] = float(mv["to"])
            lead_score_notes.sort(key=lambda x: float(x["start"]))

    ctx.lead_notes = lead_score_notes
