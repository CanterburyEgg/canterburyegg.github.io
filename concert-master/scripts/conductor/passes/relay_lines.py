"""Relay lines (a pyramid): one line climbing through the sections.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    # Relay lines (a "pyramid"): a line that climbs (or falls) in even steps while passing from section to section, each
    # section entering on the next note and holding it, is heard as one line: the chart plays every step, whoever has it
    # (Sevens 0:30 & 1:25: 53 58 60 63 in the low & middle winds, then 65 70 72 75 77 in the trumpets, a step every
    # 0.375s). 7+ steps, at one even pacing (0.25-0.6s), each a small step (7 semitones or less) the same way, no single
    # part playing it all, and 3+ of its notes held on by the section that entered with them.
    relay_atts = sorted(((float(m["start"]), int(m["midi"]), st["name"], m) for st in staves if not any(k in st["name"].lower() for k in ("mallet", "xylo", "glock", "chime", "marimba", "vibra", "bell", "timp", "perc", "drum")) for m in st["notes"]), key=lambda x: x[0])
    relay_times = np.array([a[0] for a in relay_atts]) if relay_atts else np.zeros(0)
    def _atts_at(t):
        i0 = int(np.searchsorted(relay_times, t - 0.04))
        out = []
        while i0 < len(relay_atts) and relay_atts[i0][0] <= t + 0.04:
            out.append(relay_atts[i0])
            i0 += 1
        return out
    relays = []
    used_t = -1.0
    for a0 in relay_atts:
        if a0[0] <= used_t:
            continue
        for direction in (1, -1):
            nxt1 = [a for a in relay_atts if 0.25 <= a[0] - a0[0] <= 0.6 and 0 < direction * (a[1] - a0[1]) <= 7]
            if not nxt1:
                continue
            step = min(a[0] for a in nxt1) - a0[0]
            chain = [a0]
            while True:
                cands = [a for a in _atts_at(chain[-1][0] + step) if 0 < direction * (a[1] - chain[-1][1]) <= 7]
                if not cands:
                    break
                chain.append(min(cands, key=lambda a: direction * (a[1] - chain[-1][1])))
            if len(chain) < 7:
                continue
            pitches_c = [c[1] for c in chain]
            whole = [nm for nm in {c[2] for c in chain} if all(any(abs(float(m["start"]) - c[0]) < 0.04 and int(m["midi"]) == c[1] for m in next(st["notes"] for st in staves if st["name"] == nm)) for c in chain)]
            if whole:
                continue
            # (a pyramid STACKS: at least 3 of its notes are held on by the section that entered with them, 4+ steps,
            # building a chord; a run handed between sections without holding is just a run, left to the conductor)
            held_c = sum(1 for c in chain if any(abs(a[0] - c[0]) < 0.04 and a[1] == c[1] and float(a[3]["end"]) - float(a[3]["start"]) >= 4 * step for a in _atts_at(c[0])))
            if held_c < 3:
                continue
            relays.append(chain)
            used_t = chain[-1][0]
            break
    for chain in relays:
        t0, t1 = chain[0][0], chain[-1][0]
        print(f"    -> relay line {t0:.2f}-{t1:.2f}s (score): " + " ".join(str(c[1]) for c in chain))
        lead_notes = [n for n in lead_notes if not (t0 - 0.04 <= float(n["start"]) <= t1 + 0.04)]
        for ln in lead_notes:
            if float(ln["start"]) < t0 and float(ln["end"]) > t0:
                ln["end"] = t0
        for j, c in enumerate(chain):
            m = c[3]
            end = float(chain[j + 1][0]) - 0.01 if j + 1 < len(chain) else float(m["end"])
            lead_notes.append(dict(m, staff=c[2], end=end))
    if relays:
        lead_notes.sort(key=lambda x: x["start"])

    ctx.staves = staves
    ctx.lead_notes = lead_notes
