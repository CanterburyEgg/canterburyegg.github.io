"""<song>_corrections.json 'audio_moves' (by ear): a lead note the alignment places at the wrong moment in the recording
(e.g. a chord that swells in after a molto rit., with no sharp attack to align to). Matched by its score start (within
0.02s) and written pitch; 'to' is its audio time. The note before it releases just before."""
import json
from pathlib import Path


def run(ns):
    corr = Path(__file__).resolve().parents[1] / f"{ns['score_path'].stem.lower()}_corrections.json"
    if not corr.exists():
        return
    melody_out, warped = ns["melody_out"], ns["warped"]
    for mv in json.loads(corr.read_text(encoding="utf-8")).get("audio_moves", []):
        for k in range(min(len(melody_out), len(warped))):
            if abs(float(warped[k]["score_start"]) - float(mv["score_start"])) < 0.02 and int(melody_out[k][2]) == int(mv["midi"]):
                t_new = float(mv["to"])
                end = float(melody_out[k][1])
                melody_out[k][0] = round(t_new, 4)
                melody_out[k][1] = round(max(end, t_new + 0.04), 4)
                warped[k]["start"] = t_new
                if k > 0 and float(melody_out[k - 1][1]) > t_new - 0.015:
                    melody_out[k - 1][1] = round(max(float(melody_out[k - 1][0]) + 0.04, t_new - 0.015), 4)
