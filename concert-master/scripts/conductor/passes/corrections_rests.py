"""<song>_corrections.json 'rests' (by ear): stretches of the score (score seconds, [start, end)) where the recording
has nothing worth playing -- music the band arrangement leaves out or that can't be heard -- so the lead goes quiet
there. Applied at the end of the conductor, so no later rule refills the gap.
"""
import json
from pathlib import Path


def run(ctx):
    if ctx.score_path is None:
        return
    corr = Path(__file__).resolve().parents[2] / f"{ctx.score_path.stem.lower()}_corrections.json"
    if not corr.exists():
        return
    rests = json.loads(corr.read_text(encoding="utf-8")).get("rests", [])
    if not rests:
        return
    keep = []
    for n in ctx.lead_notes:
        t = float(n["start"])
        if any(float(r["start"]) <= t < float(r["end"]) for r in rests):
            continue
        keep.append(n)
    ctx.lead_notes = keep
