"""SONG-SPECIFIC (Arabesque): oboe lick / mallet run score fix.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    by_name = {st["name"]: st for st in staves}
    mallet_st = by_name.get("Mallet Perc")
    oboe_st = by_name.get("Oboe 1, 2")
    if oboe_st is not None:
        for n in oboe_st["notes"]:
            if 266.10 <= n["start"] < 268.08 and (n["end"] - n["start"]) <= 0.16:
                n["is_scalar_lick"] = True
        if mallet_st is not None:
            trill_term = [
                dict(m)
                for m in mallet_st["notes"]
                if 269.95 <= m["start"] <= 270.30 and m["midi"] >= 84
            ]
            if len(trill_term) == 5:
                new_oboe = []
                for n in oboe_st["notes"]:
                    if abs(n["start"] - 268.08) < 0.10 and n["midi"] == 86 and (n["end"] - n["start"]) >= 1.8:
                        n_copy = dict(n)
                        n_copy["end"] = round(trill_term[0]["start"] - 0.005, 4)
                        new_oboe.append(n_copy)
                        for tn in trill_term:
                            tn_copy = dict(tn)
                            tn_copy["is_scalar_lick"] = True
                            new_oboe.append(tn_copy)
                    else:
                        new_oboe.append(n)
                new_oboe.sort(key=lambda x: x["start"])
                oboe_st["notes"] = new_oboe

    ctx.staves = staves
    ctx.lead_notes = lead_notes
    ctx.by_name = by_name
