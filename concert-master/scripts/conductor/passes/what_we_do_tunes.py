"""SONG-SPECIFIC (What We Do): trombone and bagpipe tunes.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes
    st_by_name = ctx.st_by_name

    # What We Do (song-specific, parked with the Ride chorale for the end of the audit): two slow tunes under busy parts
    # that the ear follows anyway, mm.65-75 (212.44s - 240.89s) the trombones' sustained melody under the marimba /
    # piccolo / flute ostinati, and mm.85-100 (264.89s - 293.33s) the bagpipes' climax melody. (The flute 2 / flute 1 /
    # piccolo sections and the marimba outro are now found by the general rules.)
    wwd_brass = [
        n for n in st_by_name.get("Trombone 1, 2", []) if 212.40 <= float(n["start"]) < 240.85
    ]
    wwd_bagpipes = [
        n for n in st_by_name.get("Bagpipes", []) if 264.85 <= float(n["start"]) < 293.30
    ]
    if len(wwd_brass) == 15 and len(wwd_bagpipes) == 29 and "Dulcimer" in st_by_name:
        lead_notes = [
            n
            for n in lead_notes
            if not (212.40 <= float(n["start"]) < 240.85)
            and not (264.85 <= float(n["start"]) < 293.30)
        ]
        for n in wwd_brass:
            lead_notes.append(dict(n, staff="Trombone 1, 2", is_legato_suspension=True))
        for n in wwd_bagpipes:
            lead_notes.append(dict(n, staff="Bagpipes", is_legato_suspension=True))
        lead_notes.sort(key=lambda x: x["start"])

    ctx.staves = staves
    ctx.lead_notes = lead_notes
