"""Embellished doubling: the lick through a held unison note replaces it.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    # Embellished doubling: when the lead staff sustains a note while the parts that were doubling it in unison play a
    # lick through that note instead (e.g. Ride m.124 at 2:34: Trumpet 1 holds 67 while Soprano Sax, Flutes, Clarinet 1
    # and the mallets play the triplet 67-63-60), the ear follows the lick, so it replaces the held note.
    def _is_lick_staff(name: str) -> bool:
        nm = name.lower()
        return not any(k in nm for k in ("perc", "timp", "drum"))

    emb_lead = []
    for idx_e, ln in enumerate(lead_notes):
        l_s, l_e = float(ln["start"]), float(ln["end"])
        prev_ln = lead_notes[idx_e - 1] if idx_e > 0 else None
        replaced = None
        if l_e - l_s >= 0.40 and prev_ln is not None:
            for st in staves:
                if st["name"] == ln.get("staff") or not _is_lick_staff(st["name"]):
                    continue
                c_notes = st["notes"]
                same_start = [c for c in c_notes if abs(float(c["start"]) - l_s) <= 0.02 and c["midi"] == ln["midi"]]
                same_prev = [
                    c for c in c_notes if abs(float(c["start"]) - float(prev_ln["start"])) <= 0.02 and c["midi"] == prev_ln["midi"]
                ]
                inside = [c for c in c_notes if l_s + 0.02 < float(c["start"]) < l_e - 0.05]
                if not same_start or not same_prev or len(inside) < 2:
                    continue
                lick = same_start[:1] + inside
                # the lick must be doubled (same rhythm, same notes up to octaves) by at least two other staves
                confirm = 0
                for st2 in staves:
                    if st2 is st or st2["name"] == ln.get("staff"):
                        continue
                    if all(
                        any(abs(float(c2["start"]) - float(c["start"])) <= 0.02 and c2["midi"] % 12 == c["midi"] % 12 for c2 in st2["notes"])
                        for c in lick
                    ):
                        confirm += 1
                if confirm >= 2:
                    replaced = [dict(c, staff=st["name"], embellished_doubling=True) for c in lick]
                    replaced[-1]["end"] = min(float(replaced[-1]["end"]), l_e)
                    break
        if replaced:
            emb_lead.extend(replaced)
        else:
            emb_lead.append(ln)
    lead_notes = emb_lead

    ctx.staves = staves
    ctx.lead_notes = lead_notes
