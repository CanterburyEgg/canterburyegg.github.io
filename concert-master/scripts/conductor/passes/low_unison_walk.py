"""Low unison walk: 5+ low parts walking together -> follow the bass.

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

    _NOT_PITCHED = ("perc", "timp", "drum", "mallet", "bells", "glock", "xylo", "chime", "vib", "marimba")
    _BRASS_NM = ("trumpet", "horn", "trombone", "euph", "tuba", "flugel", "cornet", "baritone")
    pitched_st = [st for st in staves if not any(x in st["name"].lower() for x in _NOT_PITCHED)]

    # Low unison walk: when 5+ low parts (at or below G3, octave doublings count) strike together on every note of a
    # stepwise line (5+ notes, all one way, steps of 4 semitones or less, each held into the next) that ends on a held
    # landing, the whole bottom of the band is walking and the ear follows it (Arabesque 5:45: bass clarinet, bassoons,
    # bass trombone, cello + tuba & basses an octave down walk 48 46 45 42 -> 41 while the horns shuffle 69 70 69 66 69).
    low_att = {}
    low_list = sorted(((float(n["start"]), st, n) for st in pitched_st for n in st["notes"] if int(n["midi"]) <= 55), key=lambda x: x[0])
    k_cur, t_cur = None, -9.0
    for t_l, st, n in low_list:
        if t_l - t_cur > 0.03:
            k_cur, t_cur = round(t_l / 0.02), t_l
        low_att.setdefault(k_cur, []).append((st, n))
    walk_keys = sorted(k for k, v in low_att.items() if len({id(st) for st, _ in v}) >= 5)
    def _walk_pitch(k):
        # the line's pitch = the low note the most parts strike (3+), the higher one on a tie
        v = low_att[k]
        cnt = {}
        for _, n in v:
            cnt[int(n["midi"])] = cnt.get(int(n["midi"]), 0) + 1
        m, c = max(cnt.items(), key=lambda kv: (kv[1], kv[0]))
        return m if c >= 3 else None

    i_w = 0
    while i_w < len(walk_keys):
        seq = [walk_keys[i_w]]
        p0 = _walk_pitch(walk_keys[i_w])
        pitches = [p0]
        dir_w = 0
        j_w = i_w + 1
        while j_w < len(walk_keys) and p0 is not None:
            k_prev, k_new = seq[-1], walk_keys[j_w]
            p_new = _walk_pitch(k_new)
            if p_new is None or p_new == pitches[-1] or abs(p_new - pitches[-1]) > 4:
                break
            d_new = 1 if p_new > pitches[-1] else -1
            if dir_w and d_new != dir_w:
                break
            # every part on the line holds into the next note (legato), and the next note comes within 1.2s
            prev_line = [n for _, n in low_att[k_prev] if (int(n["midi"]) - pitches[-1]) % 12 == 0]
            if (k_new - k_prev) * 0.02 > 1.2 or any(float(n["end"]) < k_new * 0.02 - 0.05 for n in prev_line):
                break
            dir_w = d_new
            seq.append(k_new)
            pitches.append(p_new)
            j_w += 1
        last_line = [n for _, n in low_att[seq[-1]] if pitches[-1] is not None and (int(n["midi"]) - pitches[-1]) % 12 == 0]
        landing = len(seq) >= 2 and max((float(n["end"]) - float(n["start"]) for n in last_line), default=0) >= 1.5
        if len(seq) >= 5 and landing:
            # take the line from the part that plays it at the line's own octave with the most notes in the span
            w_s0, w_s1 = seq[0] * 0.02 - 0.01, max(float(n["end"]) for n in last_line)
            cands = {}
            for k in seq:
                for st, n in low_att[k]:
                    if int(n["midi"]) == pitches[seq.index(k)]:
                        cands.setdefault(st["name"], []).append(n)
            src_nm = max(cands, key=lambda nm: (len(cands[nm]), nm))
            src = cands[src_nm]
            if len(src) == len(seq):
                kept = [n for n in lead_score_notes if not (w_s0 <= float(n["start"]) < w_s1 - 0.01)]
                for n in kept:
                    if float(n["start"]) < w_s0 < float(n["end"]):
                        n["end"] = w_s0 + 0.01
                lead_score_notes = sorted(kept + [dict(n, staff=src_nm, is_low_walk=True, is_spliced=True) for n in src], key=lambda x: float(x["start"]))
                print(f"    -> low unison walk {pitches} at {w_s0:.2f}s ({src_nm})")
            i_w = j_w
        else:
            i_w += 1

    ctx.lead_notes = lead_score_notes
    ctx.pitched_st = pitched_st
    ctx._BRASS_NM = _BRASS_NM
