"""Fills under long holds: a short connected line under a hold plays as taps.

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

    # Fills under long holds: while the lead sits on a long hold (2.5s+), another part plays a short connected line of
    # 3-4 quick notes moving one way (e.g. Guthix's Warm Pad downwalk under each 4-beat Choir hold, 1:10.5) -> cut
    # the hold where the line starts and play the line as light taps. 32nd-note grace pickups fold into the next step.
    if True:
        fills_added = []
        for st in staves:
            if st.get("is_drum"):
                continue
            onsets = {}
            for n in st["notes"]:
                k_on = round(float(n["start"]), 3)
                if k_on not in onsets or int(n["midi"]) > int(onsets[k_on]["midi"]):
                    onsets[k_on] = n
            seq = [onsets[k] for k in sorted(onsets)]
            groups = []
            for n in seq:
                if float(n["end"]) - float(n["start"]) > 0.55:
                    groups.append(None)
                    continue
                if groups and groups[-1] and float(n["start"]) - float(groups[-1][-1]["end"]) <= 0.02:
                    groups[-1].append(n)
                else:
                    groups.append([n])
            for grp in [g for g in groups if g]:
                walk = []
                for k_g, n in enumerate(grp):
                    if float(n["end"]) - float(n["start"]) < 0.15 and k_g + 1 < len(grp):
                        continue
                    prev_g = grp[k_g - 1] if k_g > 0 else None
                    if prev_g is not None and float(prev_g["end"]) - float(prev_g["start"]) < 0.15:
                        walk.append(dict(n, start=float(prev_g["start"]), midi=prev_g["midi"], staff=st["name"], is_legato_suspension=True))
                    else:
                        walk.append(dict(n, staff=st["name"], is_legato_suspension=True))
                if not 3 <= len(walk) <= 4:
                    continue
                steps = [int(b["midi"]) - int(a["midi"]) for a, b in zip(walk, walk[1:])]
                if not (all(d < 0 for d in steps) or all(d > 0 for d in steps)) or max(abs(d) for d in steps) > 4:
                    continue
                g0, g1 = float(walk[0]["start"]), float(walk[-1]["end"])
                host = next(
                    (
                        h for h in lead_score_notes
                        if h.get("staff") != st["name"] and float(h["end"]) - float(h["start"]) >= 2.5
                        and float(h["start"]) < g0 - 0.3 and float(h["end"]) > g0 + 0.3
                    ),
                    None,
                )
                if host is None or any(
                    h is not host and g0 - 0.02 <= float(h["start"]) < g1 for h in lead_score_notes
                ):
                    continue
                down = steps[0] < 0
                # (a fill that runs straight into a held note one more step the same way lands there: the landing stays a
                # hold, e.g. Arabesque 4:50, the horns' 63 65 67 69 -> held 70 under the woodwinds' long note)
                landing = next(
                    (
                        q for q in seq
                        if abs(float(q["start"]) - float(walk[-1]["end"])) <= 0.02 and float(q["end"]) - float(q["start"]) > 0.55
                        and 0 < (int(q["midi"]) - int(walk[-1]["midi"])) * (-1 if down else 1) <= 4
                    ),
                    None,
                )
                if landing is not None and any(
                    h is not host and float(landing["start"]) - 0.02 <= float(h["start"]) < min(float(landing["end"]), float(host["end"])) - 0.02
                    for h in lead_score_notes
                ):
                    landing = None
                # (...and the fill's part came in together with the held note and leads straight into the fill: Arabesque
                # 4:49, the horns' downbeat 67 into the lick)
                lead_in = next(
                    (
                        q for q in seq
                        if abs(float(q["end"]) - g0) <= 0.02 and abs(float(q["start"]) - float(host["start"])) <= 0.05
                        and float(q["end"]) - float(q["start"]) > 0.15
                    ),
                    None,
                ) if landing is not None else None
                # (landing + entry together only: the part takes over the whole held note -- it comes in with it, plays the
                # fill and lands inside the held note, holding to its end; otherwise it's a plain fill)
                if (
                    lead_in is None or landing is None
                    or float(landing["start"]) > float(host["end"]) - 0.3
                    or abs(float(landing["end"]) - float(host["end"])) > 0.05
                ):
                    landing = lead_in = None
                for k_w, w in enumerate(walk):
                    # (a fill is its own little line: it sweeps from the edge key in its direction, K-J-F down / D-F-J up;
                    # a fill with a landing is a run into a held note, laid out like any run)
                    if landing is None:
                        w["lane_hint"] = 3 - k_w if down else k_w
                    w["end"] = float(w["start"]) + 0.32  # crisp taps (never a stray hold on the last step)
                    w["vel"] = 85  # light taps: never trigger a cross-hand accent chord
                if landing is not None:
                    walk.append(dict(landing, staff=st["name"], is_legato_suspension=True, vel=85, end=min(float(landing["end"]), float(host["end"]))))
                if lead_in is not None:
                    walk.insert(0, dict(lead_in, staff=st["name"], is_legato_suspension=True))
                    lead_score_notes = [h for h in lead_score_notes if h is not host]
                else:
                    host["end"] = g0
                fills_added.extend(walk)
        if fills_added:
            lead_score_notes = sorted(lead_score_notes + fills_added, key=lambda x: float(x["start"]))

    ctx.lead_notes = lead_score_notes
