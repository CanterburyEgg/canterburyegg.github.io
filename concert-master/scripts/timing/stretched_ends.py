"""Stretched ends: a short written note the warp stretched into a hold goes back to its written length.

A note written shorter than 0.5s that ends a phrase (the next note 1.2s+ away) and came out of the warp 1.6x+ longer
than written (long enough to read as a hold) gets its written length back (scaled a touch for the recording's tempo), so a short accented hit stays a hit (Jupiter
1:01: the band's quarter-note chord at the end of the intro came out as a 0.8s hold; it's an impact).
"""


def run(ns):
    warped = ns.get("warped")
    melody_out = ns.get("melody_out")
    if not isinstance(warped, list) or not isinstance(melody_out, list) or len(warped) != len(melody_out):
        return
    for k, row in enumerate(melody_out):
        sd = float(warped[k].get("score_dur", 0) or 0)
        t0, t1 = float(row[0]), float(row[1])
        # (a phrase-ending hit: the next note is 1.2s+ away, so nothing but the stretch made it a hold)
        nxt = float(melody_out[k + 1][0]) if k + 1 < len(melody_out) else 1e9
        if 0.2 <= sd < 0.5 and t1 - t0 >= 0.48 and t1 - t0 >= 1.6 * sd and nxt - t0 >= 1.2:
            new_end = round(t0 + 1.1 * sd, 4)
            print(f"    -> stretched end at {t0:.2f}s back to its written length ({t1 - t0:.2f}s -> {new_end - t0:.2f}s)")
            row[1] = new_end
