"""Handoffs start where the new part's phrase starts.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes
    is_perc_name = ctx.is_perc_name

    # Handoffs start where the new part's phrase starts: the conductor switches parts on a one-second grid, so if the
    # part it switches to was already playing its phrase just before (notes less than a second apart, back up to 2s)
    # while the outgoing part only held one note struck together with it, the phrase's opening notes come from the new part
    # (Ride 0:57: the oboes' ostinato starts 75 82 80 under the clarinet's held 63).
    lead_notes.sort(key=lambda x: x["start"])
    by_nm_h = {st["name"]: st["notes"] for st in staves}
    k_h = 1
    while k_h < len(lead_notes):
        a_n, b_n = lead_notes[k_h - 1], lead_notes[k_h]
        nm_b = str(b_n.get("staff", ""))
        # (mallets are accents behind the band: no reaching back for them)
        if nm_b != str(a_n.get("staff", "")) and nm_b in by_nm_h and not is_perc_name(nm_b):
            t_b = float(b_n["start"])
            pre = sorted((m for m in by_nm_h[nm_b] if t_b - 2.0 <= float(m["start"]) < t_b - 0.02), key=lambda m: float(m["start"]))
            # keep only the tail that leads straight in (no gap of a second or more)
            while pre and any(float(pre[j + 1]["start"]) - float(pre[j]["start"]) >= 1.0 for j in range(len(pre) - 1)):
                pre = pre[1:]
            if pre and t_b - float(pre[-1]["start"]) < 1.0:
                p0 = float(pre[0]["start"])
                outgoing = [n for n in lead_notes if p0 - 0.02 <= float(n["start"]) < t_b - 0.02]
                # (only when the outgoing part just sat on one held note that started together with the new phrase,
                # i.e. it was accompanying it; a real line handing over, e.g. Arabesque 1:58 flute -> trumpet, stays)
                if len(outgoing) == 1 and len(pre) >= 2 and abs(float(outgoing[0]["start"]) - p0) < 0.05 and float(outgoing[0]["end"]) - float(outgoing[0]["start"]) >= 0.9:
                    lead_notes = [n for n in lead_notes if not (p0 - 0.02 <= float(n["start"]) < t_b - 0.02)]
                    for ln in lead_notes:
                        if float(ln["start"]) < p0 and float(ln["end"]) > p0:
                            ln["end"] = p0
                    lead_notes.extend(dict(m, staff=nm_b) for m in pre)
                    lead_notes.sort(key=lambda x: x["start"])
                    print(f"    -> handoff to {nm_b} at {t_b:.2f}s (score) starts with its phrase at {p0:.2f}s")
                    k_h = next(i for i, n in enumerate(lead_notes) if float(n["start"]) >= t_b - 0.02) + 1
                    continue
        k_h += 1

    ctx.staves = staves
    ctx.lead_notes = lead_notes
