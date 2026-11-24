"""<song>_corrections.json 'lead_part' (by ear): in [start, end) score seconds the ear follows this part, whatever the
rules pick (e.g. Arabesque 5:05: the horns carry over the woodwinds' doubled figure; the score has no dynamics to tell).
The part's notes replace the lead there, timed like any lead note."""
import json
from pathlib import Path


def run(ctx):
    if ctx.score_path is None:
        return
    corr = Path(__file__).resolve().parents[2] / f"{ctx.score_path.stem.lower()}_corrections.json"
    if not corr.exists():
        return
    apply(ctx, json.loads(corr.read_text(encoding="utf-8")).get("lead_part", []))


def apply(ctx, entries):
    lead = ctx.lead_notes
    for lp in entries:
        s0, s1 = float(lp["start"]), float(lp["end"])
        src = next((st for st in ctx.staves if st["name"] == lp["staff"]), None)
        if src is None:
            continue
        # ("as": the part the ear hears, when the notes are read from a part that doubles it -- e.g. Ride's horn chorale,
        # taken from the oboes' concert-pitch copy -- so the borrowed notes count as one line for the later rules)
        new = [dict(n, staff=lp.get("as", src["name"])) for n in src["notes"] if s0 <= float(n["start"]) < s1]
        # ("keep_restrikes": the part's notes are heard as struck, even one restruck under the note before -- Mercury
        # 0:28.3, the violas' 54 after the violins' 63; held_over_reattack leaves these alone)
        if lp.get("keep_restrikes"):
            new = [dict(n, keep_restrike=True) for n in new]
        # ("legato": a slow sung line -- each note is timed as a legato suspension, held into the next)
        if lp.get("legato"):
            new = [dict(n, is_legato_suspension=True) for n in new]
        if not new:
            continue
        kept = [n for n in lead if not (s0 <= float(n["start"]) < s1)]
        first = min(float(n["start"]) for n in new)
        for n in kept:
            if float(n["start"]) < first < float(n["end"]):
                n["end"] = first
        lead = sorted(kept + new, key=lambda x: float(x["start"]))
    ctx.lead_notes = lead
