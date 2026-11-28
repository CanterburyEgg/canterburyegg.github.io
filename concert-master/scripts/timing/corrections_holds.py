"""<song>_corrections.json 'holds' (by ear): in a score range, lead notes written at least 'min_dur' long are held
(9th field 1), the same way every time, instead of turning into holds only where the recording happens to be quiet
(Gnome Village II's intros: the 47s and 43s, then the cello's 71s and 67s, held from 0:28 on but tapped before; user,
Nov 27: "why are these suddenly holds? I actually think they make sense as holds across the whole section").
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
    for h in json.loads(corr.read_text(encoding="utf-8")).get("holds", []):
        s0, s1, md = float(h["start"]), float(h["end"]), float(h.get("min_dur", 0.5))
        skip = [float(x) for x in h.get("except", [])]  # ('except': score starts left as taps)
        for k in range(len(mo)):
            if s0 <= float(warped[k]["score_start"]) < s1 and float(warped[k].get("score_dur", 0)) >= md \
                    and not any(abs(float(warped[k]["score_start"]) - x) < 0.02 for x in skip):
                while len(mo[k]) < 9:
                    mo[k].append(0)
                mo[k][8] = 1
