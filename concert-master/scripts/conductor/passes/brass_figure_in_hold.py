"""Brass figure in a hold: when the lead holds a note (0.75s+) and a brass part plays a quick figure inside it (4+ notes,
median under 0.2s, back to back), the figure cuts into the hold -- the hold is played up to the figure, then the
figure (Mars 2:30: the euphoniums hold 62 while the trumpets go 71 71 71 70 71 74 71 67 62; 2:47 on, the brass
figures inside the woodwinds' and violins' long notes. User, Nov 18: "if it makes sense to play the trumpet
decoration, I want that too"; "I want the brass melody to cut into the held notes of the woodwinds").

The figure must start 0.2s+ into the hold (or with it) and before the hold's last 0.3s, after a rest or a held note in
its part; it's played only inside the hold -- where the held line moves on, that line leads again. With several brass parts playing it, the highest wins. Exact scores only.
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
                if not (s0 - 0.02 <= t <= s1 - 0.3) or (s0 + 0.02 < t < s0 + 0.2):
                    continue
                if q > 0 and t - float(ns[q - 1]["end"]) < 0.05 and float(ns[q - 1]["end"]) - float(ns[q - 1]["start"]) < 0.25:
                    continue  # (the figure's own first note: after a rest or a held note, not mid-run)
                fig = [m]
                for x in ns[q + 1:]:
                    if float(x["start"]) - float(fig[-1]["end"]) > 0.05:
                        break
                    fig.append(x)
                    if float(x["end"]) - float(x["start"]) >= 0.5:
                        break  # (it lands on a longer note)
                # (only inside the hold, and before the next lead note: where the music moves on, that leads again)
                nxt = float(lead[idx + 1]["start"]) if idx + 1 < len(lead) else 1e9
                fig = [x for x in fig if float(x["start"]) < min(s1, nxt) - 0.02]
                durs = sorted(float(x["end"]) - float(x["start"]) for x in fig) or [9.0]
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
        out.extend(dict(x, staff=name, _fig=True, end=min(float(x["end"]), s1)) for x in fig)
        spans.append((f0, s1))
        print(f"    -> brass figure in the hold at {f0:.2f}s (score): {name}, {len(fig)} notes")
    # (lead notes the figure now covers give way to it)
    out = [x for x in out if x.pop("_fig", False) or not any(a - 0.02 <= float(x["start"]) < b - 0.02 for a, b in spans)]
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
