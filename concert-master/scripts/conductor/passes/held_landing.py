"""Held landing: the band holds the line's last note on.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes
    band_notes = ctx.band_notes
    entrances = ctx.entrances
    _players = ctx._players

    # Held landing: when the lead lands on a held note right after the line (< 0.3s), but most of the band holds the
    # line's LAST note on instead (2+ more parts than the lead's own note), the ear hears that note go on (Ride 1:31:
    # 72 70 72, then the clarinet drops to a held 69 while the alto saxes, horns & 2nd trumpet hold 72: you hear the 72 go on)
    n_land = 0
    for k_h in range(1, len(lead_notes)):
        prv, cur = lead_notes[k_h - 1], lead_notes[k_h]
        t_c = float(cur["start"])
        if float(cur["end"]) - t_c < 0.9 or t_c - float(prv["end"]) > 0.3 or cur.get("unison_split"):
            continue
        # (a mallet lead was chosen on purpose for its ring: leave it)
        if any(k in str(cur.get("staff", "")).lower() for k in ("mallet", "xylo", "glock", "chime")):
            continue
        if any(abs(t_c - s0) < 0.04 for s0, _, _ in entrances):
            continue
        held = {}
        for nm2, m in band_notes:
            if abs(float(m["start"]) - t_c) < 0.04 and float(m["end"]) - float(m["start"]) >= 0.45 and abs(int(m["midi"]) - int(cur["midi"])) <= 7:
                held.setdefault(int(m["midi"]), []).append((nm2, m))
        own = len(held.get(int(cur["midi"]), []))
        best_m = max(held, key=lambda mm: len(held[mm]), default=None)
        # ...or the lead's part strikes its note again and holds it while the parts that were in unison with it all move
        # together onto another held note: the tune moved on (Sevens 1:23: 77 79 77 75, then the soprano sax, cornet & mallets
        # hold 79 while Flugel Horn 1 holds 75 underneath)
        mates_h = _players(float(prv["start"]), int(prv["midi"])) - {str(cur.get("staff", ""))}
        mates_to = {int(m["midi"]) for nm2, m in band_notes if nm2 in mates_h and abs(float(m["start"]) - t_c) < 0.04 and float(m["end"]) - float(m["start"]) >= 0.45}
        split_hold = int(cur["midi"]) == int(prv["midi"]) and len(mates_h) >= 2 and len(mates_to) == 1 and best_m in mates_to and all(
            any(nm2 == mt and abs(float(m["start"]) - t_c) < 0.04 for nm2, m in band_notes) for mt in mates_h)
        if best_m is None or best_m == int(cur["midi"]) or len(held[best_m]) < own + (1 if split_hold else 2) or (best_m != int(prv["midi"]) and not split_hold):
            continue
        nm_h, m_h = held[best_m][0]
        print(f"       held landing at {t_c:.2f}s (score): {cur.get('staff')} {cur['midi']} -> {best_m} ({len(held[best_m])} parts vs {own})")
        lead_notes[k_h] = dict(cur, midi=best_m, staff=nm_h)
        n_land += 1

    ctx.staves = staves
    ctx.lead_notes = lead_notes
