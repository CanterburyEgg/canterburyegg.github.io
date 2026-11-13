"""Moving line over held chords.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    # Moving line over held chords: when the lead is only long holds for a stretch (3s+) because the whole band is
    # sustaining chords (6+ parts holding through it), and one part keeps moving over them (8+ attacks, 4x the lead's),
    # that part is what the ear follows (Ride 3:06-3:19: the winds & brass hold tied chords while the chimes and
    # xylophone play the ending fanfare and the final chord slams).
    all_by_name = {st["name"]: st["notes"] for st in staves}
    is_mallet = lambda nm_x: any(k in nm_x.lower() for k in ("mallet", "xylo", "glock", "chime", "marimba", "vibra", "bell", "timp"))
    lead_notes.sort(key=lambda x: x["start"])
    k_m = 0
    moving_spans = []
    while k_m < len(lead_notes):
        if float(lead_notes[k_m]["end"]) - float(lead_notes[k_m]["start"]) < 1.2:
            k_m += 1
            continue
        k_e = k_m
        while k_e + 1 < len(lead_notes) and float(lead_notes[k_e + 1]["end"]) - float(lead_notes[k_e + 1]["start"]) >= 1.2 and float(lead_notes[k_e + 1]["start"]) - float(lead_notes[k_e]["end"]) < 0.3:
            k_e += 1
        t0, t1 = float(lead_notes[k_m]["start"]), float(lead_notes[k_e]["end"])
        if t1 - t0 >= 3.0:
            n_lead = k_e - k_m + 1
            holders = sum(1 for nm2, ns in all_by_name.items() if sum(min(t1, float(m["end"])) - max(t0, float(m["start"])) for m in ns if float(m["end"]) - float(m["start"]) >= 1.2 and float(m["end"]) > t0 and float(m["start"]) < t1) >= 0.6 * (t1 - t0))
            busiest = max(all_by_name.items(), key=lambda kv: sum(1 for m in kv[1] if t0 - 0.02 <= float(m["start"]) < t1), default=None)
            if busiest is not None:
                n_busy = sum(1 for m in busiest[1] if t0 - 0.02 <= float(m["start"]) < t1)
                # (mallets mostly add accents behind the band, so they only take over when they are the ONLY thing moving
                # for a long stretch (8s+), like Ride's ending fanfare; not Arabesque 4:50 or What We Do 4:49)
                mallet = is_mallet(busiest[0])
                # (the busiest non-mallet part: the band has to be just holding, no tune moving elsewhere)
                others = max((sum(1 for m in ns if t0 - 0.02 <= float(m["start"]) < t1) for nm2, ns in all_by_name.items() if not is_mallet(nm2)), default=0)
                if holders >= 6 and n_busy >= max(8, 4 * n_lead) and (not mallet or (t1 - t0 >= 8.0 and others <= max(3, n_lead + 2))):
                    moving_spans.append((t0, t1, busiest[0]))
        k_m = k_e + 1
    for t0, t1, nm_mv in moving_spans:
        print(f"    -> moving line over held chords {t0:.2f}-{t1:.2f}s (score): {nm_mv} takes the lead")
        lead_notes = [n for n in lead_notes if not (t0 - 0.02 <= float(n["start"]) < t1)]
        # (marked as a moving line: its notes stay crisp taps, never fused into holds or clamped to a cutoff)
        # (band_hold: how many non-mallet parts hold a chord struck with the note, so the timing pass knows which of the
        # line's big hits ring on as held chords and which are just struck)
        def _band_hold(m):
            ts_ = float(m["start"])
            return sum(1 for nm2, ns in all_by_name.items() if not is_mallet(nm2) and any(abs(float(x["start"]) - ts_) < 0.05 and float(x["end"]) - float(x["start"]) >= 0.9 for x in ns))
        lead_notes.extend(dict(m, staff=nm_mv, is_coda_fanfare_tap=True, score_start=float(m["start"]), band_hold=_band_hold(m)) for m in all_by_name[nm_mv] if t0 - 0.02 <= float(m["start"]) < t1)
    if moving_spans:
        lead_notes.sort(key=lambda x: x["start"])

    ctx.staves = staves
    ctx.lead_notes = lead_notes
