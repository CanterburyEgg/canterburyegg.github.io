"""<song>_corrections.json 'song_end' (by ear): where the music really ends in the recording (audio seconds), when the
file carries on in silence (Jupiter: the band's last chord dies away by 7:50 of an 8:00 file). The chart's length --
and so where the game finishes -- stops there instead of playing out the dead air.
"""
import json
from pathlib import Path


def run(ns):
    sp = ns.get("score_path")
    if sp is None:
        return
    corr = Path(__file__).resolve().parents[1] / f"{sp.stem.lower()}_corrections.json"
    if not corr.exists():
        return
    end = json.loads(corr.read_text(encoding="utf-8")).get("song_end")
    if end is not None and ns.get("duration") is not None and float(end) < float(ns["duration"]):
        ns["duration"] = float(end)
        ns["song_end"] = float(end)  # (written as the sidecar's songEnd: the game ends there even though the file runs on)
