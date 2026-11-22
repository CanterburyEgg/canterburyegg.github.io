"""Solos: one part far busier than the rest for 8s+ (finds them; solo_ends_with_band trims, solos_take_lead applies).

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import re  # noqa: F401

import numpy as np  # noqa: F401


def run(ctx):
    staves = ctx.staves
    score_duration = ctx.score_duration  # noqa: F841
    lead_notes = ctx.lead_notes

    # Solos: when one part plays far more than anyone else for a long stretch (8s+), on its own (not doubled in unison),
    # it is a solo, and the solo is the tune (Ride 1:06-1:23: Alto Sax 1's 16-bar solo over the band's backing).
    solo_by_name = {st["name"]: st["notes"] for st in staves}
    is_perc_name = lambda nm_x: any(k in nm_x.lower() for k in ("mallet", "xylo", "glock", "chime", "marimba", "vibra", "bell", "timp", "perc", "drum"))
    win_s, step_s = 4.0, 1.0
    t_end_s = max((float(m["end"]) for ns in solo_by_name.values() for m in ns), default=0.0)
    solo_win = []
    t_w = 0.0
    while t_w + win_s <= t_end_s:
        counts = sorted(((sum(1 for m in ns if t_w <= float(m["start"]) < t_w + win_s), nm2) for nm2, ns in solo_by_name.items() if not is_perc_name(nm2)), reverse=True)
        if len(counts) >= 2 and counts[0][0] >= 12 and counts[0][0] >= 1.6 * counts[1][0]:
            nm_s = counts[0][1]
            mine = [m for m in solo_by_name[nm_s] if t_w <= float(m["start"]) < t_w + win_s]
            doubled = sum(1 for m in mine if any(nm2 != nm_s and not is_perc_name(nm2) and any(abs(float(x["start"]) - float(m["start"])) < 0.04 and int(x["midi"]) % 12 == int(m["midi"]) % 12 for x in ns) for nm2, ns in solo_by_name.items()))
            # (a solo is marked by its section splitting: the 1st chair plays while its own section-mate, the "2" part,
            # sits out; a busy accompaniment line has no such split, e.g. What We Do's flute & piccolo ostinati)
            m_ch = re.match(r"^(.*?)\s*1$", nm_s.strip())
            mate = (m_ch.group(1) + " 2") if m_ch else None
            mate_ns = [m for nm2, ns in solo_by_name.items() if mate and re.sub(r"\s+", " ", nm2.strip()) == re.sub(r"\s+", " ", mate) for m in ns if t_w <= float(m["start"]) < t_w + win_s]
            chair_split = mate is not None and mate in {re.sub(r"\s+", " ", x.strip()) for x in solo_by_name} and len(mate_ns) <= 0.2 * len(mine)
            # (and a solo is a tune, not a part rocking back and forth between two notes -- Mercury 1:09, the harp's
            # 62 65 62 65 ... 74 77 74 77 marked "Solo" under the violins' tune; user, Nov 21: "I should DEFINITELY be on
            # the flute melody here")
            ms = sorted(mine, key=lambda m: float(m["start"]))
            rocking = sum(1 for q in range(2, len(ms)) if int(ms[q]["midi"]) == int(ms[q - 2]["midi"]) != int(ms[q - 1]["midi"]))
            if len(ms) >= 3 and rocking >= 0.7 * (len(ms) - 2):
                chair_split = False
            solo_win.append((t_w, nm_s if doubled <= 0.3 * len(mine) and chair_split else None))
        else:
            solo_win.append((t_w, None))
        t_w += step_s
    solo_spans = []
    for t_w, nm_s in solo_win:
        if nm_s and solo_spans and solo_spans[-1][2] == nm_s and t_w <= solo_spans[-1][1]:
            solo_spans[-1][1] = t_w + win_s
        elif nm_s:
            solo_spans.append([t_w, t_w + win_s, nm_s])
    solos = []
    for t0, t1, nm_s in solo_spans:
        ns_s = [m for m in solo_by_name[nm_s] if t0 <= float(m["start"]) < t1]
        if t1 - t0 < 8.0 or not ns_s:
            continue
        # the solo runs from its own first note to its last in the stretch, reaching back to where the soloist came in
        # (its notes before, with no breath over 2s, while its section-mate still sits out: Ride 1:06, the solo enters
        # quietly over the oboes' ostinato before it takes over)
        s0, s1 = min(float(m["start"]) for m in ns_s), max(float(m["start"]) for m in ns_s)
        m_ch2 = re.match(r"^(.*?)\s*1$", nm_s.strip())
        mate_all = [m for nm2, ns in solo_by_name.items() if m_ch2 and re.sub(r"\s+", " ", nm2.strip()) == re.sub(r"\s+", " ", m_ch2.group(1) + " 2") for m in ns]
        earlier = sorted((m for m in solo_by_name[nm_s] if float(m["start"]) < s0), key=lambda m: float(m["start"]), reverse=True)
        for m in earlier:
            if s0 - float(m["start"]) > 2.0:
                break
            s0 = float(m["start"])
            ns_s.append(m)
        print(f"    -> solo {s0:.2f}-{s1:.2f}s (score): {nm_s} takes the lead")
        ns_s.sort(key=lambda m: float(m["start"]))
        solos.append({"s0": s0, "s1": s1, "staff": nm_s, "notes": ns_s})
    ctx.solos = solos  # (taken by solos_take_lead, after solo_ends_with_band trims them)

    ctx.staves = staves
    ctx.lead_notes = lead_notes
    ctx.solo_by_name = solo_by_name
    ctx.is_perc_name = is_perc_name
    ctx.win_s = win_s
    ctx.step_s = step_s
    ctx.t_end_s = t_end_s
