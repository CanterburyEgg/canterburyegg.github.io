"""Re-time a staff to the rhythm two unison doublings agree on.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    # Rhythm consensus across unison doublings: when a staff plays exactly the same pitch sequence as two other staves
    # that agree on the rhythm, between two shared attacks, but its own rhythm differs, the reading of that staff is
    # wrong (e.g. Sevens mm.122-123 at 3:28, Flugel Horn 1 / Trumpet 2,3: a stray dot made one 16th dotted and
    # squeezed the rest of the figure). Re-time it to the consensus.
    def _starts_index(notes):
        return [float(n["start"]) for n in notes]

    for s_st in staves:
        s_notes = s_st["notes"]
        if len(s_notes) < 4:
            continue
        s_starts = _starts_index(s_notes)
        for t_st in staves:
            if t_st is s_st or len(t_st["notes"]) < 4:
                continue
            t_notes = t_st["notes"]
            t_starts = _starts_index(t_notes)
            # shared attacks (both staves start a note within 10ms)
            anchors = []
            j = 0
            for i_s, ts in enumerate(s_starts):
                while j < len(t_starts) and t_starts[j] < ts - 0.01:
                    j += 1
                if j < len(t_starts) and abs(t_starts[j] - ts) <= 0.01:
                    anchors.append((i_s, j))
            for (a_s, a_t), (b_s, b_t) in zip(anchors, anchors[1:]):
                n_s, n_t = b_s - a_s, b_t - a_t
                if n_s != n_t or n_s < 3:
                    continue
                if any(s_notes[a_s + q]["midi"] % 12 != t_notes[a_t + q]["midi"] % 12 for q in range(n_s)):
                    continue
                if all(abs(s_starts[a_s + q] - t_starts[a_t + q]) <= 0.02 for q in range(n_s)):
                    continue
                t_span = [(t_starts[a_t + q], float(t_notes[a_t + q]["end"])) for q in range(n_s)]
                # a third staff must confirm the target rhythm
                confirmed = False
                for u_st in staves:
                    if u_st is s_st or u_st is t_st:
                        continue
                    u_starts = _starts_index(u_st["notes"])
                    if all(any(abs(us - ts) <= 0.01 for us in u_starts) for ts, _ in t_span):
                        confirmed = True
                        break
                if not confirmed:
                    continue
                for q in range(n_s):
                    s_notes[a_s + q]["start"] = round(t_span[q][0], 4)
                    s_notes[a_s + q]["end"] = round(t_span[q][1], 4)
                    s_notes[a_s + q]["rhythm_consensus"] = True
                s_starts = _starts_index(s_notes)

    ctx.staves = staves
    ctx.lead_notes = lead_notes
