"""one-off key pins by time ([final audio time, lane], from the song's _restore.json): e.g. What We Do 4:53.34's 88

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from pathlib import Path

from timing import MISSING


def run(ns):
    score_path = ns["score_path"]
    json = ns.get('json', MISSING)
    lane_pin = ns.get('lane_pin', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    r = ns.get('r', MISSING)
    restore_path = ns.get('restore_path', MISSING)
    t_pin = ns.get('t_pin', MISSING)

    # one-off key pins by time ([final audio time, lane], from the song's _restore.json): e.g. What We Do 4:53.34's 88
    # starts its pattern on J; the 2:50 harp stretch plays like the 0:18 one
    restore_path = Path(__file__).resolve().parents[1] / f"{score_path.stem.lower()}_restore.json"
    if restore_path.exists():
        for t_pin, lane_pin in json.loads(restore_path.read_text(encoding="utf-8")).get("pins", []):
            for r in melody_out:
                if abs(float(r[0]) - t_pin) < 0.03:
                    del r[6:]
                    r.append(20 + int(lane_pin))

    if lane_pin is not MISSING:
        ns['lane_pin'] = lane_pin
    if r is not MISSING:
        ns['r'] = r
    if t_pin is not MISSING:
        ns['t_pin'] = t_pin
