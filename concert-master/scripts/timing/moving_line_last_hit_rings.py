"""Moving line's last hit rings on: when the moving line over held chords (`moving_line_big_hits_timing`) carries on
after its last big hit, and the band holds a chord struck with that hit (6+ parts), the hit rings on up to the line's
next note instead of being a tap (Jupiter 2:32: the trumpets' 78 under the band's held chord, then their 73 fanfare).
Ride's final strikes have nothing after them, so they stay taps.
"""
from timing import MISSING


def run(ns):
    warped = ns.get('warped', MISSING)
    if warped is MISSING:
        return
    mv_taps = [wn for wn in warped if wn.get("is_coda_fanfare_tap")]
    mv_hits = [wn for wn in mv_taps if wn["score_dur"] >= 1.00]
    if len(mv_taps) < 8 or not mv_hits:
        return
    last_h = mv_hits[-1]
    after_h = [float(w["start"]) for w in mv_taps if float(w["score_start"]) > float(last_h["score_start"]) + 0.02]
    if int(last_h.get("band_hold", 0)) >= 6 and after_h:
        last_h["end"] = max(float(last_h["start"]) + 0.65, min(after_h) - 0.08)
        last_h["dur"] = last_h["end"] - last_h["start"]
