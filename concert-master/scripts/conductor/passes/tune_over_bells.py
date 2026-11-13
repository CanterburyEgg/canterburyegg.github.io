"""The tune over the bells.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes
    is_perc_name = ctx.is_perc_name
    solo_by_name = ctx.solo_by_name
    win_s = ctx.win_s
    step_s = ctx.step_s
    t_end_s = ctx.t_end_s

    # The tune over the bells: when the conductor is following a mallet / dulcimer part, but one wind or string part plays
    # clearly more than every other wind or string part for a long stretch (8s+, 1.3x the next, 12+ notes per 4s), that
    # part is the tune and the bells are accompaniment (What We Do 0:52 flute 2 over the dulcimer, 2:28 the piccolo over
    # the marimba), as long as it also out-plays every bell part.
    is_bellish = lambda nm_x: is_perc_name(nm_x) or "dulcimer" in nm_x.lower() or "harp" in nm_x.lower() or "celesta" in nm_x.lower()
    tune_win = []
    t_w = 0.0
    while t_w + win_s <= t_end_s:
        counts = sorted(((sum(1 for m in ns if t_w <= float(m["start"]) < t_w + win_s), nm2) for nm2, ns in solo_by_name.items() if not is_bellish(nm2)), reverse=True)
        leads_w = [n for n in lead_notes if t_w <= float(n["start"]) < t_w + win_s]
        on_bells = leads_w and sum(1 for n in leads_w if is_bellish(str(n.get("staff", "")))) >= 0.6 * len(leads_w)
        # (and it has to out-play the bells too: where a bell part is the busiest thing going, the bells ARE the tune,
        # e.g. What We Do's dulcimer and marimba sections)
        bell_max = max((sum(1 for m in ns if t_w <= float(m["start"]) < t_w + win_s) for nm2, ns in solo_by_name.items() if is_bellish(nm2)), default=0)
        ok_w = len(counts) >= 1 and counts[0][0] >= 12 and (len(counts) == 1 or counts[0][0] >= 1.3 * counts[1][0]) and counts[0][0] >= 1.2 * bell_max and on_bells
        tune_win.append((t_w, counts[0][1] if ok_w else None))
        t_w += step_s
    tune_spans = []
    for t_w, nm_s in tune_win:
        if nm_s and tune_spans and tune_spans[-1][2] == nm_s and t_w <= tune_spans[-1][1]:
            tune_spans[-1][1] = t_w + win_s
        elif nm_s:
            tune_spans.append([t_w, t_w + win_s, nm_s])
    for t0, t1, nm_s in tune_spans:
        ns_s = [m for m in solo_by_name[nm_s] if t0 <= float(m["start"]) < t1]
        if t1 - t0 < 8.0 or not ns_s:
            continue
        s0, s1 = min(float(m["start"]) for m in ns_s), max(float(m["start"]) for m in ns_s)
        earlier = sorted((m for m in solo_by_name[nm_s] if float(m["start"]) < s0), key=lambda m: float(m["start"]), reverse=True)
        for m in earlier:
            if s0 - float(m["start"]) > 2.0:
                break
            s0 = float(m["start"])
            ns_s.append(m)
        # (it only takes over from the bells: a wind / string line the chart already follows in the stretch stays)
        cut = min((float(n["start"]) for n in lead_notes if s0 < float(n["start"]) <= s1 + 0.02 and not is_bellish(str(n.get("staff", "")))), default=None)
        if cut is not None:
            s1 = cut - 0.03
            ns_s = [m for m in ns_s if float(m["start"]) <= s1]
        print(f"    -> tune over the bells {s0:.2f}-{s1:.2f}s (score): {nm_s} takes the lead")
        lead_notes = [n for n in lead_notes if not (s0 - 0.02 <= float(n["start"]) <= s1 + 0.02)]
        for ln in lead_notes:
            if float(ln["start"]) < s0 and float(ln["end"]) > s0:
                ln["end"] = s0
        lead_notes.extend(dict(m, staff=nm_s) for m in ns_s)
    lead_notes.sort(key=lambda x: x["start"])

    ctx.staves = staves
    ctx.lead_notes = lead_notes
