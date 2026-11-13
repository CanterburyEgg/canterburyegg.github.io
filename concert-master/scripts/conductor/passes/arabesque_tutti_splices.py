"""SONG-SPECIFIC (Arabesque mm.108-112): slow majestic tutti splices.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    # In slow/majestic sustained tutti sections (e.g. Arabesque mm.108-112 at 4:45-5:05):
    # 1. When the active woodwind staff holds a static whole note across a bar (m.109, 283.97..286.77s)
    #    while F Horn 1, 2 articulates the downbeat band hit and plays a 16th-note melodic lick in the
    #    middle of the sustained chord (284.67..285.37s Eb4-F4-G4-A4 -> Bb4), splice the Horn bar!
    # 2. When the active woodwind staff holds across ensemble pickup/cadential band hits in m.110 (Beat 4
    #    pickup 289.99..291.07s into [111] Majestic) and m.111 (Beats 3 & 4 fff > quarter-note band hits
    #    292.94..293.88..294.82s), articulate every ensemble band hit!
    st_by_name = {st["name"]: st["notes"] for st in staves}
    horn_notes_109 = [
        dict(n, staff="F Horn 1, 2", is_scalar_lick=(n["end"] - n["start"]) <= 0.20)
        for n in st_by_name.get("F Horn 1, 2", [])
        if 283.90 <= n["start"] < 286.75
    ]
    horn_contour_113_114 = [81, 79, 77, 74, 78]
    horn_raw_113_114 = [
        n for n in st_by_name.get("F Horn 1, 2", []) if 304.15 <= n["start"] < 307.00
    ]
    horn_notes_113_114 = [
        dict(
            n,
            midi=horn_contour_113_114[idx] if idx < len(horn_contour_113_114) else n["midi"] + 12,
            vel=82 if idx < 4 else n["vel"],
            staff="F Horn 1, 2",
            is_legato_suspension=True,
        )
        for idx, n in enumerate(horn_raw_113_114)
    ]
    spliced_113_114 = False
    enriched_lead = []
    for n in lead_notes:
        s0, s1 = float(n["start"]), float(n["end"])
        if 280.60 <= s0 <= 281.16 and (s1 - s0) <= 0.08:
            n = dict(n, is_scalar_lick=True)
        elif 295.74 <= s0 <= 298.56 and (s1 - s0) <= 0.50:
            n = dict(n, is_scalar_lick=True)
        if 283.90 <= s0 <= 284.05 and (s1 - s0) >= 2.50 and len(horn_notes_109) >= 5:
            enriched_lead.extend(horn_notes_109)
        elif 304.15 <= s0 < 307.00 and len(horn_notes_113_114) >= 5:
            if not spliced_113_114:
                enriched_lead.extend(horn_notes_113_114)
                spliced_113_114 = True
        elif 286.70 <= s0 <= 286.85 and (s1 - s0) >= 4.00:
            # m.110 (molto rit.): Beat 1-3 sustained entrance (286.77..289.99s) + Beat 4 pickup (289.99..291.07s)
            n_b1 = dict(n, start=s0, end=289.99)
            n_b4 = dict(n, start=289.99, end=s1, midi=81, staff="C Trumpet 1, 2")
            enriched_lead.extend([n_b1, n_b4])
        elif 292.88 <= s0 <= 293.00 and (s1 - s0) >= 1.75:
            # m.111 ([111] Majestic): Beat 3 (292.94..293.88s) + Beat 4 (293.88..294.82s) fff > band hits
            mid_t = 0.5 * (s0 + s1)
            n_b3 = dict(n, start=s0, end=mid_t, midi=81, staff="C Trumpet 1, 2")
            n_b4 = dict(n, start=mid_t, end=s1, midi=84, staff="Oboe 1, 2")
            enriched_lead.extend([n_b3, n_b4])
        else:
            enriched_lead.append(n)
    lead_notes = enriched_lead

    lead_notes.sort(key=lambda x: x["start"])

    ctx.staves = staves
    ctx.lead_notes = lead_notes
    ctx.st_by_name = st_by_name
