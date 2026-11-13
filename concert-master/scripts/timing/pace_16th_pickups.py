"""Also tag & linearly pace 4-note 16th-note ascending pickups leading directly into a sustained 5th landing note

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    idx_p = ns.get('idx_p', MISSING)
    j = ns.get('j', MISSING)
    step_p = ns.get('step_p', MISSING)
    t_p0 = ns.get('t_p0', MISSING)
    t_p4 = ns.get('t_p4', MISSING)
    w_slice = ns.get('w_slice', MISSING)
    warped = ns.get('warped', MISSING)

    # Also tag & linearly pace 4-note 16th-note ascending pickups leading directly into a sustained 5th landing note
    # (e.g. Ride m.77 at 1:34.4 [77,79,81,82,84] and m.85 at 1:43.8 [70,72,74,75,77]) so all 5 notes stay in Tier 1!
    for idx_p in range(len(warped) - 4):
        w_slice = warped[idx_p : idx_p + 5]
        if (
            all(0.075 <= w_slice[j]["score_dur"] <= 0.098 for j in range(4))
            and w_slice[4]["score_dur"] >= 0.30
            and all(w_slice[j]["score_gap_prev"] <= 0.025 for j in range(1, 5))
            and all(1 <= (w_slice[j]["midi"] - w_slice[j - 1]["midi"]) <= 3 for j in range(1, 5))
        ):
            t_p0 = float(w_slice[0]["start"])
            t_p4 = float(w_slice[4]["start"])
            step_p = (t_p4 - t_p0) / 4.0
            if 0.075 <= step_p <= 0.145:
                for j in range(4):
                    w_slice[j]["start"] = t_p0 + j * step_p
                    w_slice[j]["end"] = w_slice[j]["start"] + max(0.05, step_p - 0.015)
                    w_slice[j]["dur"] = w_slice[j]["end"] - w_slice[j]["start"]
                    w_slice[j]["is_scalar_lick"] = True
                w_slice[4]["is_scalar_lick"] = True

    if idx_p is not MISSING:
        ns['idx_p'] = idx_p
    if j is not MISSING:
        ns['j'] = j
    if step_p is not MISSING:
        ns['step_p'] = step_p
    if t_p0 is not MISSING:
        ns['t_p0'] = t_p0
    if t_p4 is not MISSING:
        ns['t_p4'] = t_p4
    if w_slice is not MISSING:
        ns['w_slice'] = w_slice
