"""<song>_corrections.json 'insert_notes' (by ear): a note the score leaves out, put straight onto the recording's
clock ('time' / 'end' in audio seconds, 'midi'), for places where a 'missing_parts' note can't survive the first
alignment (a stretch the warp crams together before its time map spreads it out -- Gnome Village II 1:54.6, the
octave-up walk down's 85; user, Nov 27: '1:02: this is missing a note in the walkdown JFDF').
"""
import json
from pathlib import Path


def run(ns):
    sp, mo, warped = ns.get("score_path"), ns.get("melody_out"), ns.get("warped")
    if sp is None or not isinstance(mo, list) or not isinstance(warped, list) or len(mo) != len(warped):
        return
    corr = Path(__file__).resolve().parents[1] / f"{sp.stem.lower()}_corrections.json"
    if not corr.exists():
        return
    for ins in json.loads(corr.read_text(encoding="utf-8")).get("insert_notes", []):
        t, e, m = float(ins["time"]), float(ins["end"]), int(ins["midi"])
        k = next((i for i, r in enumerate(mo) if float(r[0]) > t), len(mo))
        ref = mo[k - 1] if k > 0 else mo[0]
        row = [round(t, 4), round(e, 4), m] + list(ref[3:6])
        mo.insert(k, row)
        warped.insert(k, {"start": t, "score_start": float(ins.get("score_start", 0.0)), "score_dur": e - t,
                          "staff": ins.get("staff", "Inserted")})
        if k > 0 and float(mo[k - 1][1]) > t - 0.015:
            mo[k - 1][1] = round(max(float(mo[k - 1][0]) + 0.04, t - 0.015), 4)
