"""Repair split 2nd-interval dyads in 4/4 bars scaled by 0.80x (the score reader offsets two notes a 2nd apart on one
stem and squeezes the bar): merge them and re-stretch the bar. Bar and note lengths come from the score's own beat.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    # Repair split 2nd-interval dyads in 4/4 measures (where a ~2.1818s bar was scaled by 0.80x
    # because two notes 1-2 semitones apart on a single stem were horizontally offset by ~4.4pt,
    # e.g. m.80 on F Horn 1-4 / C Trumpet 1,2 and m.81 on F Horn 1-4) on a copy of staves so DTW
    # alignment remains 100% unchanged.
    # (the bar and note lengths come from the score's own beat: the most common note length between 0.3s and 1.0s is
    # the quarter note; Arabesque's 0.5454s quarter gives its 2.1818s bars. In scores where an eighth or dotted note is
    # the most common length the pattern simply doesn't match; a time-signature-aware beat would be the next step)
    from collections import Counter

    lens = Counter(round(float(n["end"]) - float(n["start"]), 3) for st in staves for n in st["notes"] if 0.3 <= float(n["end"]) - float(n["start"]) <= 1.0)
    q_len = lens.most_common(1)[0][0] if lens else 0.5454
    bar_len, short_d, long_d = 4 * q_len, 0.4 * q_len, 0.8 * q_len
    repaired_staves = []
    for st in staves:
        notes = st["notes"]
        i = 0
        new_notes = []
        while i < len(notes):
            t0 = notes[i]["start"]
            j = i
            while j < len(notes) and notes[j]["end"] <= t0 + bar_len + 0.04:
                j += 1
            bar_ns = notes[i:j]
            if len(bar_ns) == 6 and abs((bar_ns[-1]["end"] - t0) - bar_len) <= 0.05:
                durs = [n["end"] - n["start"] for n in bar_ns]
                if all(abs(d - short_d) <= 0.025 or abs(d - long_d) <= 0.025 for d in durs):
                    dyad_k = None
                    for k in (0, len(bar_ns) - 2):
                        if (
                            abs(durs[k] - long_d) <= 0.025
                            and abs(durs[k + 1] - long_d) <= 0.025
                            and 1 <= abs(bar_ns[k + 1]["midi"] - bar_ns[k]["midi"]) <= 2
                        ):
                            dyad_k = k
                            break
                    if dyad_k is not None:
                        bar_t1 = bar_ns[-1]["end"]
                        merged = []
                        for k in range(len(bar_ns)):
                            if k == dyad_k:
                                m_item = dict(bar_ns[k])
                                m_item["midi"] = max(bar_ns[k]["midi"], bar_ns[k + 1]["midi"])
                                merged.append(m_item)
                            elif k == dyad_k + 1:
                                continue
                            else:
                                merged.append(dict(bar_ns[k]))
                        cur_t = t0
                        for m_item in merged:
                            orig_d = m_item["end"] - m_item["start"]
                            new_d = orig_d * 1.25
                            m_item["start"] = round(cur_t, 4)
                            m_item["end"] = round(cur_t + new_d, 4)
                            m_item["repaired_bar"] = (t0, bar_t1)
                            cur_t += new_d
                        new_notes.extend(merged)
                        i = j
                        continue
            new_notes.append(dict(notes[i]))
            i += 1
        repaired_staves.append({"name": st["name"], "notes": new_notes})
    staves = repaired_staves

    ctx.staves = staves
    ctx.lead_notes = lead_notes
