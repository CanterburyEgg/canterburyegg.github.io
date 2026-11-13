"""Linearly pace contiguous uniform 16th-note scalar runs (>= 12 notes with 0.12 <= score_dur <= 0.155

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a0_16 = ns.get('a0_16', MISSING)
    a1_16 = ns.get('a1_16', MISSING)
    e16_run = ns.get('e16_run', MISSING)
    en_k = ns.get('en_k', MISSING)
    k16 = ns.get('k16', MISSING)
    lead_score_notes = ns.get('lead_score_notes', MISSING)
    raw_ends = ns.get('raw_ends', MISSING)
    raw_starts = ns.get('raw_starts', MISSING)
    s0_16 = ns.get('s0_16', MISSING)
    s16_run = ns.get('s16_run', MISSING)
    s1_16 = ns.get('s1_16', MISSING)
    st_k = ns.get('st_k', MISSING)

    # Linearly pace contiguous uniform 16th-note scalar runs (>= 12 notes with 0.12 <= score_dur <= 0.155
    # already tagged as is_scalar_lick, e.g. Arabesque m.101 woodwind 16th run at 4:31) so coarse DTW
    # diagonal steps do not alternate 199ms/97ms inside an even 16th-note bar.
    s16_run = 0
    while s16_run < len(lead_score_notes):
        if lead_score_notes[s16_run].get("is_scalar_lick") and 0.12 <= (
            lead_score_notes[s16_run]["end"] - lead_score_notes[s16_run]["start"]
        ) <= 0.155:
            e16_run = s16_run + 1
            while (
                e16_run < len(lead_score_notes)
                and lead_score_notes[e16_run].get("is_scalar_lick")
                and 0.12 <= (lead_score_notes[e16_run]["end"] - lead_score_notes[e16_run]["start"]) <= 0.155
            ):
                e16_run += 1
            if (e16_run - s16_run) >= 12 and e16_run < len(lead_score_notes):
                s0_16 = float(lead_score_notes[s16_run]["start"])
                s1_16 = float(lead_score_notes[e16_run]["start"])
                a0_16 = float(raw_starts[s16_run])
                a1_16 = float(raw_starts[e16_run])
                if s1_16 > s0_16 + 1.0 and a1_16 > a0_16 + 1.0:
                    for k16 in range(s16_run, e16_run):
                        st_k = float(lead_score_notes[k16]["start"])
                        en_k = float(lead_score_notes[k16]["end"])
                        raw_starts[k16] = a0_16 + (a1_16 - a0_16) * ((st_k - s0_16) / (s1_16 - s0_16))
                        raw_ends[k16] = a0_16 + (a1_16 - a0_16) * ((en_k - s0_16) / (s1_16 - s0_16))
            s16_run = e16_run
        else:
            s16_run += 1

    if a0_16 is not MISSING:
        ns['a0_16'] = a0_16
    if a1_16 is not MISSING:
        ns['a1_16'] = a1_16
    if e16_run is not MISSING:
        ns['e16_run'] = e16_run
    if en_k is not MISSING:
        ns['en_k'] = en_k
    if k16 is not MISSING:
        ns['k16'] = k16
    if s0_16 is not MISSING:
        ns['s0_16'] = s0_16
    if s16_run is not MISSING:
        ns['s16_run'] = s16_run
    if s1_16 is not MISSING:
        ns['s1_16'] = s1_16
    if st_k is not MISSING:
        ns['st_k'] = st_k
