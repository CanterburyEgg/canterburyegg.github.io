"""Unison split: stay with the unison when the lead's part splits off.

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

    # Unison split: when the lead's staff has been playing in unison with other parts and then moves off on its own to a
    # harmony note while those parts (2+ of them, agreeing) carry on together on another note, the ear stays with them
    # (Sevens 3:02: Horns 3-4 drop to 63 while Horns 1-2 and the alto saxes repeat the 67 melody).
    def _players(t, midi):
        return {nm2 for nm2, m in band_notes if abs(float(m["start"]) - t) < 0.04 and int(m["midi"]) == midi}

    n_split = 0
    for k_u in range(1, len(lead_notes)):
        prv, cur = lead_notes[k_u - 1], lead_notes[k_u]
        t_p, t_c = float(prv["start"]), float(cur["start"])
        if t_c - float(prv["end"]) > 0.3:
            continue
        mates = _players(t_p, int(prv["midi"])) - {str(cur.get("staff", ""))}
        if len(mates) < 2:
            continue
        nxt = {}
        for nm2, m in band_notes:
            if nm2 in mates and abs(float(m["start"]) - t_c) < 0.04:
                nxt.setdefault(int(m["midi"]), []).append((nm2, m))
        if len(nxt) != 1:
            continue
        (mid_u, plays), = nxt.items()
        if mid_u == int(cur["midi"]) or len(plays) < 2 or len(plays) != len(mates):
            continue
        # (a split DOWN to a harmony note under the tune: the tune carries on above, within a 5th of where it was; an
        # octave apart is the same tune, and a section entrance the lead just jumped to stays)
        if mid_u <= int(cur["midi"]) or (mid_u - int(cur["midi"])) % 12 == 0 or abs(mid_u - int(prv["midi"])) > 7:
            continue
        if any(abs(float(cur["start"]) - s0) < 0.04 for s0, _, _ in entrances):
            continue
        if len(_players(t_c, int(cur["midi"]))) >= len(_players(t_c, mid_u)):
            continue
        # it starts where the unison HELD a note together and the others strike that same note again (the tune repeats,
        # the lead's part peels off underneath); from there it follows the tune for as long as the split lasts
        # (a held note in the lead's part is a chord tone the band sustains together: it stays, and the split ends there,
        # e.g. Sevens 3:03 the D61 hold under the 65)
        if float(cur["end"]) - t_c >= 1.0:
            continue
        chained = bool(prv.get("unison_split"))
        if not chained and not (mid_u == int(prv["midi"]) and float(prv["end"]) - t_p >= 0.4):
            continue
        nm_u, m_u = plays[0]
        print(f"       unison split at {t_c:.2f}s (score): {cur.get('staff')} {cur['midi']} -> {nm_u} {mid_u} (with {len(plays)} parts; lead note had {len(_players(t_c, int(cur['midi'])))})")
        lead_notes[k_u] = dict(m_u, staff=nm_u, unison_split=True)
        n_split += 1
    if n_split:
        print(f"    -> {n_split} lead notes kept with the unison when the lead's part split off to a harmony note")

    ctx.staves = staves
    ctx.lead_notes = lead_notes
    ctx._players = _players
