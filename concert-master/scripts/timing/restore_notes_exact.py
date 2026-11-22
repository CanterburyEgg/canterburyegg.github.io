"""Restored notes stay exactly where they were placed (<song>_restore.json 'notes'): the timing rules after
restore_windows (snapping onto attacks, evening out runs) can nudge them, but notes laid out by hand from the
user's taps are already where the user hears them (Mercury 1:19-2:12, user, Nov 21: 'Each section is exactly the
same two forms'). Runs after the timing rules, before the key pins.
"""
import json
from pathlib import Path


def run(ns):
    sp = ns.get("score_path")
    mo, warped = ns.get("melody_out"), ns.get("warped")
    if sp is None or not isinstance(mo, list) or not isinstance(warped, list) or len(mo) != len(warped):
        return
    f = Path(__file__).resolve().parents[1] / f"{sp.stem.lower()}_restore.json"
    if not f.exists():
        return
    notes = json.loads(f.read_text(encoding="utf-8")).get("notes", [])
    if not notes:
        return
    mine = [k for k, w in enumerate(warped) if str(w.get("staff", "")).startswith("Restored")]
    if len(mine) != len(notes):
        print(f"    !! restore_notes_exact: {len(mine)} restored rows vs {len(notes)} notes, left as they are")
        return
    order = sorted(mine, key=lambda k: float(mo[k][0]))
    for k, r in zip(order, sorted(notes, key=lambda r: float(r[0]))):
        mo[k][0], mo[k][1] = float(r[0]), float(r[1])
        warped[k]["start"] = float(r[0])
