"""A figure the lead plays is played every time: when the lead plays a quick figure from a part (4+ quick notes in a
row, 3+ different notes), and the same part played the same figure (same notes, same rhythm) up to 4s earlier while the lead was only
holding a note through it, the hold stops there and the earlier figure is played too (Mercury 1:01: the bassoons,
cellos and basses' 43 43 45 43 37 under the horns' held 67, played by the lead when it comes back at 1:03; user,
Nov 21: "I should play the low brass melodic flourish here"). Exact scores only.
"""


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    by_name = {st["name"]: sorted(st["notes"], key=lambda m: float(m["start"])) for st in ctx.staves if not st.get("is_drum")}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    added = []
    i = 0
    while i < len(lead):
        nm = lead[i].get("staff")
        j = i + 1
        while (j < len(lead) and lead[j].get("staff") == nm and float(lead[j - 1]["end"]) - float(lead[j - 1]["start"]) <= 0.15
               and float(lead[j]["start"]) - float(lead[j - 1]["start"]) <= 0.2):
            j += 1
        fig = lead[i:j]
        i = j
        # (a figure: 3+ different notes, not one note struck over and over -- Mars 1:26's violins' 84 84 84 84)
        if len(fig) < 4 or nm not in by_name or len({int(m["midi"]) for m in fig}) < 3:
            continue
        k = min(len(fig), 5)
        pit = [int(m["midi"]) for m in fig[:k]]
        gaps = [float(fig[q + 1]["start"]) - float(fig[q]["start"]) for q in range(k - 1)]
        t2 = float(fig[0]["start"])
        ns = by_name[nm]
        for a in range(len(ns) - k + 1):
            t1 = float(ns[a]["start"])
            if not (t2 - 4.0 <= t1 <= t2 - 0.5):
                continue
            occ = ns[a:a + k]
            if [int(m["midi"]) for m in occ] != pit:
                continue
            if any(abs((float(occ[q + 1]["start"]) - float(occ[q]["start"])) - gaps[q]) > 0.05 for q in range(k - 1)):
                continue
            t_end = float(occ[-1]["start"])
            held = [h for h in lead if float(h["start"]) < t1 - 0.05 and float(h["end"]) > t1 + 0.1]
            if not held or any(t1 - 0.02 <= float(x["start"]) <= t_end + 0.02 for x in lead):
                continue
            for h in held:
                h["end"] = t1
            # (the figure, and the notes that carry straight on from it in that part, as far as the lead's figure goes)
            take = list(occ)
            b = a + k
            while b < len(ns) and len(take) < len(fig) and float(ns[b]["start"]) - float(take[-1]["start"]) <= 0.2:
                take.append(ns[b])
                b += 1
            added.extend(dict(m, staff=nm) for m in take)
            print(f"    -> figure every time at {t1:.2f}s (score): {nm} {' '.join(str(p) for p in pit)}")
            break
    if added:
        lead.extend(added)
        lead.sort(key=lambda x: float(x["start"]))
        ctx.lead_notes = lead
