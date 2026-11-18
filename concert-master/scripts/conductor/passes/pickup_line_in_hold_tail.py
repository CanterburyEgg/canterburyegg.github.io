"""Pick up the next line inside the hold's tail: when the lead holds a note and the part that leads next is already
playing under it, the line is picked up at its note that starts in the hold's last stretch, if that note runs straight
into the line's next lead note -- the ear hears the new line take over there, not after the hold (Mars 0:54: the
trumpets hold 75 while the euphoniums and horns go 51 | 60 -> 58 65 63 ...; the 60, a half note starting 0.4s before
the trumpets let go, was missing. User, Nov 17: "I'm missing a half note in the euphonium/tuba line").

Conditions: the hold is 1.2s+ and has sounded 0.8s+ when the pickup note starts; the pickup starts in the hold's second
half and 0.25s+ before its end; it's 0.5s+ long, the same part as the next lead note, and ends where that note begins
(within 0.05s). The hold is cut at the pickup. Exact scores only.
"""


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    by = {st["name"]: sorted(st["notes"], key=lambda m: float(m["start"])) for st in ctx.staves if not st.get("is_drum")}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out, added = [], 0
    for idx, n in enumerate(lead):
        out.append(n)
        if idx + 1 >= len(lead):
            continue
        nx = lead[idx + 1]
        s0, s1 = float(n["start"]), float(n["end"])
        if s1 - s0 < 1.2 or nx.get("staff") == n.get("staff") or nx.get("staff") not in by:
            continue
        t_next = float(nx["start"])
        cand = [m for m in by[nx["staff"]]
                if s0 + max(0.8, 0.5 * (s1 - s0)) <= float(m["start"]) <= s1 - 0.25
                and float(m["end"]) - float(m["start"]) >= 0.5
                and abs(float(m["end"]) - t_next) <= 0.05]
        if not cand:
            continue
        m = cand[-1]
        out[-1] = dict(n, end=float(m["start"]))
        out.append(dict(m, staff=nx["staff"]))
        added += 1
        print(f"    -> picked up {nx['staff']}'s line at {float(m['start']):.2f}s (score), inside the hold's tail")
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
