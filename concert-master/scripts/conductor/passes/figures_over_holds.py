"""Figures over held lines: an instrument's ringing figure over a hold plays as taps.

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

    # Figures over long holds: while the lead sits on a long hold (2.5s+), one instrument (all its parts together, e.g.
    # Celesta 1 + Celesta 2 playing in canon) rings a figure of 5+ notes (each within 1s of the last), e.g. Guthix's
    # bell figures over the Choir at 1:26 -> cut the hold where the figure starts and play the figure as light taps,
    # until the next lead note. Where two parts strike together the top note plays; a note an octave or more below
    # both its neighbours is the bass under the figure, not part of it.
    if True:
        fam_of = lambda nm: re.sub(r"[\s\d,]+$", "", str(nm or ""))
        figs_added = []
        for fam in sorted({fam_of(st["name"]) for st in staves if not st.get("is_drum")}):
            fnotes = sorted(
                (dict(n, staff=st["name"]) for st in staves if not st.get("is_drum") and fam_of(st["name"]) == fam for n in st["notes"]),
                key=lambda x: float(x["start"]),
            )
            groups = []
            for n in fnotes:
                if groups and float(n["start"]) - float(groups[-1][-1]["start"]) <= 1.0:
                    groups[-1].append(n)
                else:
                    groups.append([n])
            for grp in groups:
                # each part's own line first: a note an octave or more below its neighbours in that part is the bass
                # under the figure, not part of it; then where parts strike together the part that led off plays
                lines = {}
                for n in grp:
                    lines.setdefault(n["staff"], []).append(n)
                lead_part = grp[0]["staff"]
                keep = []
                for nm_l, ln in lines.items():
                    for k, n in enumerate(ln):
                        nb = [ln[j] for j in (k - 1, k + 1) if 0 <= j < len(ln)]
                        if nb and all(int(n["midi"]) <= int(x["midi"]) - 12 for x in nb):
                            continue
                        keep.append(n)
                keep.sort(key=lambda x: (float(x["start"]), x["staff"] != lead_part))
                col = []
                for n in keep:
                    if col and abs(float(n["start"]) - float(col[-1]["start"])) <= 0.06:
                        if n["staff"] == lead_part and col[-1]["staff"] != lead_part:
                            col[-1] = n
                        continue
                    col.append(n)
                if len(col) < 5:
                    continue
                g0 = float(col[0]["start"])
                held = lambda h: float(h["end"]) - float(h["start"]) >= 1.0 and fam_of(h.get("staff")) != fam
                host = next(
                    (h for h in lead_score_notes if held(h) and float(h["start"]) < g0 - 0.3 and float(h["end"]) > g0 + 0.3),
                    None,
                )
                if host is None:
                    continue
                # (the figure runs until the lead plays something other than a sustained note; the held notes it passes
                # over drop out)
                nxt_t = min(
                    (float(h["start"]) for h in lead_score_notes if h is not host and float(h["start"]) > g0 - 0.02 and not held(h)),
                    default=1e9,
                )
                fig = [n for n in col if float(n["start"]) < nxt_t - 0.10]
                if len(fig) < 5:
                    continue
                f_end = float(fig[-1]["start"])
                # (a figure that rings OVER the sustained line: it starts above the held notes it covers and mostly stays
                # there, and lasts 1.5s+ -- not a quick run, and not an accompaniment pattern weaving around the melody)
                covered = [host] + [h for h in lead_score_notes if h is not host and held(h) and g0 - 0.02 <= float(h["start"]) <= f_end + 0.05]
                top_held = max(int(h["midi"]) for h in covered)
                mids = sorted(int(n["midi"]) for n in fig)
                if f_end - g0 < 1.5 or int(fig[0]["midi"]) <= top_held or mids[len(mids) // 2] <= top_held:
                    continue
                lead_score_notes = [h for h in lead_score_notes if not (h is not host and g0 - 0.02 <= float(h["start"]) <= f_end + 0.05)]
                host["end"] = g0
                # (the figure's keys follow its contour, like a fill: start on F, a repeat keeps its key, a step down one
                # key left, a step up one key right -- two on a leap of a 5th or more -- kept within D..K)
                lane_f, prev_m = None, None
                for n in fig:
                    m_f = int(n["midi"])
                    if lane_f is None:
                        lane_f = 1
                    elif m_f > prev_m:
                        lane_f = min(3, lane_f + (2 if m_f - prev_m >= 7 else 1))
                    elif m_f < prev_m:
                        lane_f = max(0, lane_f - 1)
                    prev_m = m_f
                    figs_added.append(
                        dict(n, is_legato_suspension=True, vel=85, lane_hint=lane_f, end=min(float(n["end"]), float(n["start"]) + 0.30))
                    )
        if figs_added:
            lead_score_notes = sorted(lead_score_notes + figs_added, key=lambda x: float(x["start"]))

    ctx.lead_notes = lead_score_notes
