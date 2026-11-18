"""Beat levels for Easy charts: how strong each melody note's place in the bar is (0 = downbeat, 1 = beat, 2 = half a
beat, 3 = smaller; -1 = the score gave no bar grid there), from the score's bar grid (meter_grid) at the note's score
position. Index-aligned with melodyNotes; written to the sidecar as `beatLevels`. Hard ignores it.
"""
import meter_grid


def run(ns):
    melody_out, warped = ns.get("melody_out"), ns.get("warped")
    if not melody_out or not warped or not meter_grid.grid():
        return
    levels = []
    for k in range(len(melody_out)):
        lv = meter_grid.beat_level(float(warped[k].get("score_start", -1.0))) if k < len(warped) else None
        levels.append(-1 if lv is None else int(lv))
    ns["beat_levels"] = levels
