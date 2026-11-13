"""<song>_corrections.json 'lead_part' (by ear): in [start, end) score seconds the ear follows this part, whatever the
rules pick (e.g. Arabesque 5:05: the horns carry over the woodwinds' doubled figure; the score has no dynamics to tell).
The part's notes replace the lead there, timed like any lead note."""
import json
from pathlib import Path


def run(ctx):
    corr = Path(__file__).resolve().parents[2] / f"{ctx.score_path.stem.lower()}_corrections.json"
    if not corr.exists():
        return
    lead = ctx.lead_notes
    for lp in json.loads(corr.read_text(encoding="utf-8")).get("lead_part", []):
        s0, s1 = float(lp["start"]), float(lp["end"])
        src = next((st for st in ctx.staves if st["name"] == lp["staff"]), None)
        if src is None:
            continue
        new = [dict(n, staff=src["name"]) for n in src["notes"] if s0 <= float(n["start"]) < s1]
        if not new:
            continue
        kept = [n for n in lead if not (s0 <= float(n["start"]) < s1)]
        first = min(float(n["start"]) for n in new)
        for n in kept:
            if float(n["start"]) < first < float(n["end"]):
                n["end"] = first
        lead = sorted(kept + new, key=lambda x: float(x["start"]))
    ctx.lead_notes = lead
