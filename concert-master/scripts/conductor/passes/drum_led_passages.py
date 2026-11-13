"""Drum-led passages: the drum part's written hits are the tune.

(Moved verbatim from sync_score.process_pair: runs after the conductor picks the lead.)
"""
import json  # noqa: F401
import re  # noqa: F401
from pathlib import Path  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    raw_staves = ctx.raw_staves  # noqa: F841
    score_dur = ctx.score_duration  # noqa: F841
    score_path = ctx.score_path  # noqa: F841
    lead_score_notes = ctx.lead_notes

    # Drum-led passages: where no pitched part leads for 2.5s+ but an (unpitched) drum part plays, the drum part's
    # written hits ARE the tune: play them as taps (the runtime rocks them across the inner keys), following whichever
    # drum part entered most recently (e.g. Guthix intro: Drum Set 1's beats, then Drum Set 2's groove from 0:36).
    # While the drums lead, recorded hits that don't line up with a written one are dropped (see the impacts below).
    drum_led_spans = []
    drum_passages = []
    drum_staves = [
        st for st in raw_staves
        if st.get("is_drum") and not any(k in st["name"].lower() for k in ("timp", "mallet", "bell", "glock", "xylo", "chime", "vib", "marimba"))
    ]
    if drum_staves:
        def _entrances(notes):
            ts = sorted(float(n["start"]) for n in notes)
            return [t for k, t in enumerate(ts) if k == 0 or t - ts[k - 1] >= 2.0]

        drum_info = [(st, sorted(st["notes"], key=lambda x: float(x["start"])), _entrances(st["notes"])) for st in drum_staves]
        sounding = sorted((float(n["start"]), float(n["end"])) for n in lead_score_notes)
        gaps = []
        t_free = 0.0
        for s0, s1 in sounding:
            if s0 - t_free >= 2.5:
                gaps.append((t_free, s0))
            t_free = max(t_free, s1)
        if score_dur - t_free >= 2.5:
            gaps.append((t_free, score_dur))
        taps = []
        for g0, g1 in gaps:
            hits = []
            for st, notes, ents in drum_info:
                for n in notes:
                    t = float(n["start"])
                    if g0 - 0.05 <= t < g1 - 0.05:
                        ent = max((e for e in ents if e <= t + 1e-6), default=-1.0)
                        hits.append((t, ent, st["name"], n))
            if len(hits) < 4:
                continue
            chosen = []
            for t, ent, nm, n in sorted(hits, key=lambda x: x[0]):
                # the most recent entrance among drum parts still playing (a note within 1.5s) leads
                live = [h for h in hits if abs(h[0] - t) <= 1.5]
                lead_ent = max(h[1] for h in live)
                if ent != lead_ent or (chosen and t - chosen[-1][0] < 0.02):
                    continue
                chosen.append((t, nm, n))
            # (a steady part: at least one hit a second on average; scattered accents in a rest don't count)
            if len(chosen) < 4 or len(chosen) / max(0.1, g1 - g0) < 1.0:
                continue
            drum_led_spans.append((g0, g1))
            k_tap = 0
            prev_t = -10.0
            for t, nm, n in chosen:
                if t - prev_t >= 1.0:
                    k_tap = 0  # each group of hits after a rest starts on the left hand
                taps.append(
                    dict(
                        n,
                        staff=nm,
                        midi=36 if k_tap % 2 == 0 else 37,
                        end=t + min(0.40, float(n["end"]) - t),
                        vel=max(int(n.get("vel", 80)), 80),
                        is_legato_suspension=True,
                        is_perc_tap=True,
                    )
                )
                k_tap += 1
                prev_t = t
        if taps:
            lead_score_notes = sorted(lead_score_notes + taps, key=lambda x: float(x["start"]))
        # The whole drum-led passage: it carries on across short pitched interludes (< 10s) between drum sections, and
        # through the parts heard inside it until a new part takes the lead (e.g. Guthix: the pan-flute holds between
        # and after the drum bars, up to the Choir at 1:00)
        for g0, g1 in sorted(drum_led_spans):
            if drum_passages and g0 - drum_passages[-1][1] < 10.0:
                drum_passages[-1][1] = g1
            else:
                drum_passages.append([g0, g1])
        for psg in drum_passages:
            family = lambda nm: re.sub(r"[\s\d,]+$", "", str(nm or ""))  # Pan Flute 1 / Pan Flute 3 = one instrument
            heard = {family(n.get("staff")) for n in lead_score_notes if psg[0] <= float(n["start"]) < psg[1] and not n.get("is_perc_tap")}
            for n in sorted(lead_score_notes, key=lambda x: float(x["start"])):
                if float(n["start"]) < psg[1] or n.get("is_perc_tap"):
                    continue
                if family(n.get("staff")) not in heard:
                    break
                psg[1] = max(psg[1], float(n["end"]))

    ctx.lead_notes = lead_score_notes
    ctx.drum_passages = drum_passages
