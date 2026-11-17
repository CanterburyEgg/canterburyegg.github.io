"""<song>_corrections.json 'thin' (by ear): a written flourish too dense to play note for note keeps every Nth note.

Each entry: one part ('staff'), a score range [start, end), and 'every' (N). The part's lead notes in that range keep
their first and last note and every Nth one between, so a scale too quick to tap still reads as the same rising sweep
(Jupiter 6:12: the woodwinds' 22-note scale 50 ... 86, kept as 11). Applied at the end of the conductor.
"""
import json
from pathlib import Path


def run(ctx):
    if ctx.score_path is None:
        return
    corr = Path(__file__).resolve().parents[2] / f"{ctx.score_path.stem.lower()}_corrections.json"
    if not corr.exists():
        return
    thins = json.loads(corr.read_text(encoding="utf-8")).get("thin", [])
    if not thins:
        return
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    drop = set()
    for th in thins:
        s0, s1, every = float(th["start"]), float(th["end"]), max(1, int(th.get("every", 2)))
        idx = [i for i, x in enumerate(lead) if x.get("staff") == th["staff"] and s0 <= float(x["start"]) < s1]
        for j, i in enumerate(idx):
            if j == 0 or j == len(idx) - 1 or j % every == 0:
                continue
            drop.add(i)
    ctx.lead_notes = [x for i, x in enumerate(lead) if i not in drop]
