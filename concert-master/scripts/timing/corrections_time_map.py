"""<song>_corrections.json 'time_map' (by ear / by the recording's attacks): a stretch of the score the alignment
crumpled is laid out again on a straight line between two anchor points (score seconds -> audio seconds), e.g. a
passage the band plays far faster than the score's tempo marking, where the warp can't follow (Jupiter 4:55-5:10).
Notes whose score start falls in [score_from, score_to] are re-timed linearly between 'audio_from' and 'audio_to'
(lengths scaled the same way); the evenness and attack rules that follow tidy them onto the recording.
"""
import json
from pathlib import Path



def run(ns):
    sp = ns.get("score_path")
    mo, warped = ns.get("melody_out"), ns.get("warped")
    if sp is None or not isinstance(mo, list) or not isinstance(warped, list) or len(mo) != len(warped):
        return
    corr = Path(__file__).resolve().parents[1] / f"{sp.stem.lower()}_corrections.json"
    if not corr.exists():
        return
    for tm in json.loads(corr.read_text(encoding="utf-8")).get("time_map", []):
        s0, s1, a0, a1 = float(tm["score_from"]), float(tm["score_to"]), float(tm["audio_from"]), float(tm["audio_to"])
        k_ = (a1 - a0) / (s1 - s0)
        idx = [k for k in range(len(mo)) if s0 - 0.01 <= float(warped[k]["score_start"]) <= s1 + 0.01]
        for k in idx:
            t = a0 + k_ * (float(warped[k]["score_start"]) - s0)
            d = max(0.05, k_ * float(warped[k].get("score_dur", 0.25)))
            mo[k][0] = round(t, 4)
            mo[k][1] = round(t + d, 4)
        for k in range(1, len(mo)):
            if float(mo[k - 1][1]) > float(mo[k][0]) - 0.015:
                mo[k - 1][1] = round(max(float(mo[k - 1][0]) + 0.04, float(mo[k][0]) - 0.015), 4)
        if idx:
            print(f"    -> time map: {len(idx)} notes in score {s0:.2f}-{s1:.2f}s re-laid at {k_:.3f}s per written second")
