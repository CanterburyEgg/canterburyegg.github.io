"""Pre-tag contiguous 32nd-note scalar showcase runs (>= 12 notes with score_dur <= 0.075, e.g. Arabesque m.50 woodwind lick)

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    e_run = ns.get('e_run', MISSING)
    k_r = ns.get('k_r', MISSING)
    lead_score_notes = ns.get('lead_score_notes', MISSING)
    s_run = ns.get('s_run', MISSING)

    # Pre-tag contiguous 32nd-note scalar showcase runs (>= 12 notes with score_dur <= 0.075, e.g. Arabesque m.50 woodwind lick)
    s_run = 0
    while s_run < len(lead_score_notes):
        if (lead_score_notes[s_run]["end"] - lead_score_notes[s_run]["start"]) <= 0.075:
            e_run = s_run + 1
            while e_run < len(lead_score_notes) and (lead_score_notes[e_run]["end"] - lead_score_notes[e_run]["start"]) <= 0.075:
                e_run += 1
            if (e_run - s_run) >= 12:
                for k_r in range(s_run, e_run):
                    lead_score_notes[k_r]["is_scalar_lick"] = True
            s_run = e_run
        else:
            s_run += 1

    if e_run is not MISSING:
        ns['e_run'] = e_run
    if k_r is not MISSING:
        ns['k_r'] = k_r
    if s_run is not MISSING:
        ns['s_run'] = s_run
