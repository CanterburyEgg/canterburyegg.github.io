"""Cut stubs go: a lead note left only a sliver long (under 0.06s) because the lead switched parts right on top of it
-- with the next lead note starting within 0.06s -- isn't a note the ear hears; it's dropped (Mars 1:38: the horns'
70, cut to 0.03s where the other horns' 63 takes over, came out as a K flicked just before the J; user, Nov 18: "a weird
KJ here that I think should just be one J"). Exact scores only.
"""


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out, dropped = [], 0
    for i, n in enumerate(lead):
        nxt = lead[i + 1] if i + 1 < len(lead) else None
        if float(n["end"]) - float(n["start"]) < 0.06 and nxt is not None and float(nxt["start"]) - float(n["start"]) < 0.06 \
                and nxt.get("staff") != n.get("staff"):
            dropped += 1
            continue
        out.append(n)
    if dropped:
        print(f"    -> cut stubs: {dropped} sliver note(s) dropped")
    ctx.lead_notes = out
