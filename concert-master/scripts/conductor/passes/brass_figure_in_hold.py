"""Brass figure in a hold: when the lead holds a note (0.75s+) and a brass part plays a quick figure inside it (4+ notes,
median under 0.2s, back to back), the figure cuts into the hold -- the hold is played up to the figure, then the
figure (Mars 2:30: the euphoniums hold 62 while the trumpets go 71 71 71 70 71 74 71 67 62; 2:47 on, the brass
figures inside the woodwinds' and violins' long notes. User, Nov 18: "if it makes sense to play the trumpet
decoration, I want that too"; "I want the brass melody to cut into the held notes of the woodwinds").

The figure must start 0.2s+ into the hold (or with it) and before the hold's last 0.3s, after a rest or a held note in
its part; it's played to its end (until a rest, or a long note it lands on), and the lead's notes under it give way. With several brass parts playing it, the highest wins. Exact scores only.
"""

BRASS = ("trumpet", "cornet", "horn", "trombone", "tuba", "euph", "baritone", "flugel")


def _is_brass(name):
    nm = name.lower()
    return any(b in nm for b in BRASS) and "english" not in nm


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    brass = [st for st in ctx.staves if not st.get("is_drum") and _is_brass(st["name"])]
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out, spans = [], []
    for idx, n in enumerate(lead):
        s0, s1 = float(n["start"]), float(n["end"])
        if s1 - s0 < 0.75:
            out.append(n)
            continue
        best = None
        for st in brass:
            if st["name"] == n.get("staff"):
                continue
            ns = sorted(st["notes"], key=lambda m: float(m["start"]))
            for q, m in enumerate(ns):
                t = float(m["start"])
                # (the figure may also start just before the hold, up to 0.5s, where the lead is only doubling the
                # figure's own first notes in another part -- Mars 2:54: the woodwinds' 74 before the violins' 91, the
                # horns' 62 62 62 ... starting with it; the whole figure is played, its repeated notes and all)
                doubled_head = (s0 - 0.5 <= t < s0 - 0.02) and all(
                    any(abs(float(y["start"]) - float(x["start"])) <= 0.03 and (int(y["midi"]) - int(x["midi"])) % 12 == 0 for y in ns)
                    for x in lead if t - 0.02 <= float(x["start"]) < s0 - 0.02)
                if not (s0 - 0.02 <= t <= s1 - 0.3 or doubled_head) or (s0 + 0.02 < t < s0 + 0.2):
                    continue
                if q > 0 and t - float(ns[q - 1]["end"]) < 0.05 and float(ns[q - 1]["end"]) - float(ns[q - 1]["start"]) < 0.25:
                    continue  # (the figure's own first note: after a rest or a held note, not mid-run)
                # (the whole figure, to its end: on until a rest, or a long note it lands on -- user, Nov 18: "I play
                # the start of the trumpet figure here but not the end of it")
                fig = [m]
                for x in ns[q + 1:]:
                    if float(x["start"]) - float(fig[-1]["end"]) > 0.05:
                        break
                    if float(x["start"]) - t > 2.5:
                        break  # (a figure, not a whole stretch of the part: 2.5s at most)
                    fig.append(x)
                    if float(x["end"]) - float(x["start"]) >= 0.75:
                        break
                fp = [int(x["midi"]) for x in fig]
                if len(set(fp)) < 3 or max(fp.count(v) for v in set(fp)) > 0.6 * len(fp):
                    continue  # (a figure moves; a part hammering one note is an ostinato, not a figure)
                durs = sorted(float(x["end"]) - float(x["start"]) for x in fig[:-1] or fig)
                if len(fig) < 4 or durs[len(durs) // 2] >= 0.2:
                    continue
                med = sorted(int(x["midi"]) for x in fig)[len(fig) // 2]
                if best is None or med > best[0]:
                    best = (med, st["name"], fig)
                break
        if best is None:
            out.append(n)
            continue
        _, name, fig = best
        f0 = float(fig[0]["start"])
        if f0 > s0 + 0.02:
            out.append(dict(n, end=f0))
        out.extend(dict(x, staff=name, _fig=True) for x in fig)
        spans.append((f0, float(fig[-1]["start"]) + 0.05))  # (what starts under its last note still plays)
        print(f"    -> brass figure in the hold at {f0:.2f}s (score): {name}, {len(fig)} notes")
    # (lead notes the figure now covers give way to it)
    out = [x for x in out if x.pop("_fig", False) or not any(a - 0.02 <= float(x["start"]) < b - 0.02 for a, b in spans)]
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
