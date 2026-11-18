"""<song>_corrections.json 'two_hands' (by ear): a call and response between two parts, played with both hands -- the
right hand follows `right` (it becomes the lead there), the left hand plays `left` as a second line, each note held
while the other part answers (Mars 1:12-1:24: the trumpets' 78 and the euphoniums'/horns' 67 trade back and forth;
user, Nov 18: "I'd like to play both parts ... left hand does the horn and the right hand does the trumpet").
Grace notes stay in both lines (each part's pickup is half its call: user, Nov 18: "DFh for the horns, JKh for the
trumpets"); the pickup and its note sit on that hand's two keys.
Each entry: {"start", "end" (score seconds), "right": staff, "left": staff, "why"}.
"""
import json
from pathlib import Path

import counter_store


def _main_notes(st, s0, s1):
    alln = sorted(st["notes"], key=lambda m: float(m["start"]))
    out = []
    for i, n in enumerate(alln):
        if not (s0 <= float(n["start"]) < s1):
            continue
        out.append(n)
    return out


def run(ctx):
    counter_store.reset()
    if ctx.score_path is None:
        return
    corr = Path(__file__).resolve().parents[2] / f"{ctx.score_path.stem.lower()}_corrections.json"
    if not corr.exists():
        return
    lead = ctx.lead_notes
    for th in json.loads(corr.read_text(encoding="utf-8")).get("two_hands", []):
        s0, s1 = float(th["start"]), float(th["end"])
        right = next((st for st in ctx.staves if st["name"] == th["right"]), None)
        left = next((st for st in ctx.staves if st["name"] == th["left"]), None)
        if right is None or left is None:
            print(f"    !! two_hands: no staff {th['right']!r} / {th['left']!r}")
            continue
        new = [dict(n, staff=right["name"]) for n in _main_notes(right, s0, s1)]
        kept = [n for n in lead if not (s0 <= float(n["start"]) < s1)]
        first = min((float(n["start"]) for n in new), default=s0)
        for n in kept:
            if float(n["start"]) < first < float(n["end"]):
                n["end"] = first
        lead = sorted(kept + new, key=lambda x: float(x["start"]))
        counter_store.add([dict(n, staff=left["name"]) for n in _main_notes(left, s0, s1)])
        print(f"    -> two hands {s0:.2f}-{s1:.2f}s (score): right {right['name']}, left {left['name']}")
    ctx.lead_notes = lead
