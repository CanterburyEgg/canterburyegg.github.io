"""Tag contiguous 32nd-note scalar showcase runs (>= 12 notes with score_dur <= 0.075, e.g. Arabesque m.50 woodwind lick)

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    k_r = ns.get('k_r', MISSING)
    run_end = ns.get('run_end', MISSING)
    run_start = ns.get('run_start', MISSING)
    warped = ns.get('warped', MISSING)

    # Tag contiguous 32nd-note scalar showcase runs (>= 12 notes with score_dur <= 0.075, e.g. Arabesque m.50 woodwind lick)
    run_start = 0
    while run_start < len(warped):
        if warped[run_start]["score_dur"] <= 0.075:
            run_end = run_start + 1
            while run_end < len(warped) and warped[run_end]["score_dur"] <= 0.075:
                run_end += 1
            if (run_end - run_start) >= 12:
                for k_r in range(run_start, run_end):
                    warped[k_r]["is_scalar_lick"] = True
            run_start = run_end
        else:
            run_start += 1

    if k_r is not MISSING:
        ns['k_r'] = k_r
    if run_end is not MISSING:
        ns['run_end'] = run_end
    if run_start is not MISSING:
        ns['run_start'] = run_start
