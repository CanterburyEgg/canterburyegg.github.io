"""Screaming top note: a long high doubled top of the band.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    # Screaming top note: a long (>= 2.0s), high (>= A-flat 5) note that is the TOP of the whole band and is doubled
    # across sections (e.g. Sevens m.135 at 2:31: Soprano Sax + Eb Cornet + Mallets roaring a high A-flat) is what the
    # ear follows, even while Trumpet 1 moves underneath it (79 -> 82 -> 84). It replaces the inner line from that line's next move.
    def _is_pitched_band(name: str) -> bool:
        nm = name.lower()
        return not any(k in nm for k in ("mallet", "picc", "perc", "timp", "drum", "glock", "xylo", "chime"))

    band_notes = [(st["name"], n) for st in staves if _is_pitched_band(st["name"]) for n in st["notes"]]
    scream_spans = []
    for nm, n in band_notes:
        n_s, n_e = float(n["start"]), float(n["end"])
        if n.get("trill") or n_e - n_s < 2.0 or n["midi"] < 80 or any(abs(n_s - s0) < 0.1 for s0, _, _ in scream_spans):
            continue
        doublers = {
            nm2
            for nm2, m in band_notes
            if nm2 != nm
            and abs(float(m["start"]) - n_s) < 0.06
            and m["midi"] % 12 == n["midi"] % 12
            and abs(m["midi"] - n["midi"]) <= 12  # same note or one octave apart (not a bass pedal 3 octaves down)
            and float(m["end"]) - float(m["start"]) >= 1.0
        }
        top = max(m["midi"] for _, m in band_notes if float(m["start"]) <= n_s + 0.05 < float(m["end"]))
        # it has to ROAR: brass or saxes in the doubling (a held flute/clarinet pad on top is just colour)
        loud = [x for x in doublers | {nm} if any(k in x.lower() for k in ("cornet", "trumpet", "flugel", "horn", "sax", "trombone"))]
        if len(doublers) >= 2 and n["midi"] >= top and loud:
            scream_spans.append((n_s, n_e, dict(n, staff=nm)))
    for s0, e0, sn in scream_spans:
        # The lead line keeps whatever it starts together with the scream (e.g. Sevens 2:31 the trumpets' third ladder
        # rung, 79 79 79-hold, lands with the cornets' first A-flat); the scream takes over from the lead's next move.
        moves = [float(ln["start"]) for ln in lead_notes if s0 + 0.02 < float(ln["start"]) < e0 - 0.10]
        if not moves:
            continue
        s1 = min(moves)
        # never override a section that is deliberately led by mallets (e.g. Ride's chime / xylophone coda fanfare)
        if any(
            s1 - 0.02 <= float(ln["start"]) < e0 - 0.10
            and any(k in str(ln.get("staff", "")).lower() for k in ("mallet", "xylo", "chime", "glock"))
            for ln in lead_notes
        ):
            continue
        sn = dict(sn, start=round(s1, 4))
        lead_notes = [ln for ln in lead_notes if not (s1 - 0.02 <= float(ln["start"]) < e0 - 0.10)]
        for ln in lead_notes:
            if float(ln["start"]) < s1 - 0.02 and float(ln["end"]) > s1:
                ln["end"] = s1
        lead_notes.append(sn)
    if scream_spans:
        lead_notes.sort(key=lambda x: x["start"])

    ctx.staves = staves
    ctx.lead_notes = lead_notes
    ctx.band_notes = band_notes
