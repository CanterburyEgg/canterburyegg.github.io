"""SONG-SPECIFIC (Ride mm.118-138): horn chorale + trumpet fanfare.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes
    st_by_name = ctx.st_by_name

    # Ride mm.118-138 (133.93s - 155.36s score time / ~2:17.5 - 2:39.8 audio time):
    # Ensure every note of the slower French Horn chorale melody (mm.118-128) is articulated in a consistent
    # concert-pitch register (without the Bb Euphonium pedal swallowing the m.118 pickup or Eb Alto Clarinet
    # tying across m.120 beat 1), followed by all Trumpet 1, 2 fanfare & rhythmic hits (mm.129-138).
    oboe_118_138 = [
        n for n in st_by_name.get("Oboe 1, 2", []) if 133.90 <= float(n["start"]) < 155.35
    ]
    sop_125_turn = [
        n for n in st_by_name.get("Bb Soprano Sax", []) if 140.70 <= float(n["start"]) < 142.49
    ]
    tpt1_126_138 = [
        n for n in st_by_name.get("Trumpet 1, 2", []) if 142.49 <= float(n["start"]) < 155.35
    ]
    if len(oboe_118_138) >= 25 and len(sop_125_turn) == 7 and len(tpt1_126_138) >= 25:
        for ln in lead_notes:
            if 132.00 <= float(ln["start"]) <= 132.30 and float(ln["end"]) > 133.88:
                ln["end"] = 133.88
        lead_notes = [
            n for n in lead_notes if not (133.90 <= float(n["start"]) < 155.35)
        ]
        # 1. Slower French Horn melody Phrases 1 & 2 (133.93s - 140.71s) from concert-pitch Oboe 1, 2 / Clarinet 1
        for n in oboe_118_138:
            st_t = float(n["start"])
            if 133.90 <= st_t < 140.70:
                lead_notes.append(dict(n, staff="F Horn 1, 2"))
        # 2. Phrase 2 fff Horn/Soprano Sax 7-note turn (140.71s - 142.50s) in matching concert register
        for n in sop_125_turn:
            lead_notes.append(dict(n, staff="F Horn 1, 2"))
        # 3. Phrase 3 (142.50s - 145.00s) + Trumpet 1, 2 fanfare & hits (145.00s - 150.75s)
        for n in tpt1_126_138:
            st_t = float(n["start"])
            if 142.49 <= st_t < 145.00:
                lead_notes.append(dict(n, staff="F Horn 1, 2"))
            elif 145.00 <= st_t < 151.00:
                lead_notes.append(dict(n, staff="Trumpet 1, 2"))
        # 4. Call-and-response woodwind/brass hits in mm.135-138 (151.07s - 155.35s)
        for n in oboe_118_138:
            st_t = float(n["start"])
            if 151.05 <= st_t < 152.00 or 153.20 <= st_t < 154.00:
                n_copy = dict(n, staff="Oboe 1, 2")
                if st_t >= 151.60 and float(n_copy["end"]) > 152.10 and st_t < 152.00:
                    n_copy["end"] = 152.10
                elif st_t >= 153.70 and float(n_copy["end"]) > 154.25:
                    n_copy["end"] = 154.25
                lead_notes.append(n_copy)
        for n in tpt1_126_138:
            st_t = float(n["start"])
            if 152.10 <= st_t < 153.20 or 154.25 <= st_t < 155.35:
                lead_notes.append(dict(n, staff="Trumpet 1, 2"))
        lead_notes.sort(key=lambda x: x["start"])

    ctx.staves = staves
    ctx.lead_notes = lead_notes
