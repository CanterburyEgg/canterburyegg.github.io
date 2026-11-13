"""Section entrance: the ear jumps to a section coming in together.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes
    band_notes = ctx.band_notes

    # Section entrance: when the lead's quick run lands at the very moment a section comes in together on a held note
    # above it (3+ parts in unison incl. brass, none of them playing in the second before), the ear jumps to the
    # entrance: it takes over for as long as it holds (e.g. Sevens 2:57: the low line runs 60 58 56 55 -> 53 just as the
    # horns, alto saxes & trumpets enter on a held 63, so the chart plays K J F D, then the horns' 63 hold).
    brass_k = ("cornet", "trumpet", "flugel", "horn", "trombone")
    entrances = []
    for nm, n in band_notes:
        n_s, n_e = float(n["start"]), float(n["end"])
        if n_e - n_s < 0.9 or any(abs(n_s - s0) < 0.1 for s0, _, _ in entrances):
            continue
        group = {nm2 for nm2, m in band_notes if abs(float(m["start"]) - n_s) < 0.04 and m["midi"] == n["midi"] and float(m["end"]) - float(m["start"]) >= 0.9}
        if len(group) < 3 or not any(any(k in x.lower() for k in brass_k) for x in group):
            continue
        if any(nm2 in group and float(m["start"]) < n_s - 0.02 and float(m["end"]) > n_s - 1.0 for nm2, m in band_notes):
            continue
        at = [ln for ln in lead_notes if abs(float(ln["start"]) - n_s) < 0.04]
        if not at or str(at[0].get("staff", "")) in group or int(at[0]["midi"]) >= int(n["midi"]):
            continue
        before = sorted((ln for ln in lead_notes if n_s - 0.9 < float(ln["start"]) < n_s - 0.02), key=lambda x: x["start"])
        seq_r = before[-2:] + [at[0]]
        if len(before) < 2 or any(float(b["start"]) - float(a["start"]) > 0.3 for a, b in zip(seq_r, seq_r[1:])):
            continue
        entrances.append((n_s, n_e, dict(n, staff=nm)))
    for s0, e0, sn in entrances:
        print(f"    -> section entrance at {s0:.2f}s (score): {sn['staff']} {sn['midi']} takes the lead")
        # ...and if the lead moves onto that section soon after the hold anyway (within 1s), the notes in between come
        # from the section too (Sevens 2:58.8: the horns' 65 after the held 63, not the low line's 48)
        grp_names = {nm2 for nm2, m in band_notes if abs(float(m["start"]) - s0) < 0.04 and m["midi"] == sn["midi"]}
        nxt_grp = [float(ln["start"]) for ln in lead_notes if float(ln["start"]) >= e0 - 0.10 and str(ln.get("staff", "")) in grp_names]
        e1 = e0 - 0.10
        fill = []
        if nxt_grp and min(nxt_grp) - e0 <= 1.0:
            e1 = min(nxt_grp) - 0.02
            src = next((st["notes"] for st in staves if st["name"] == sn["staff"]), [])
            fill = [dict(m, staff=sn["staff"]) for m in src if e0 - 0.10 <= float(m["start"]) < e1]
        lead_notes = [ln for ln in lead_notes if not (s0 - 0.02 <= float(ln["start"]) < e1)]
        for ln in lead_notes:
            if float(ln["start"]) < s0 - 0.02 and float(ln["end"]) > s0:
                ln["end"] = s0
        lead_notes.append(sn)
        lead_notes.extend(fill)
    if entrances:
        lead_notes.sort(key=lambda x: x["start"])

    ctx.staves = staves
    ctx.lead_notes = lead_notes
    ctx.entrances = entrances
