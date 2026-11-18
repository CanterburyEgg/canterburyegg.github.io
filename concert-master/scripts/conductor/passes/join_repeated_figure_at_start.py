"""Join a repeated figure where it starts: when the lead moves onto a part that's hammering one note (Mars 2:22: the
82s, ten in a row) partway through its run, the run's earlier strikes that come after the previous lead note has
ended are played too -- the figure starts when it starts (user, Nov 18: "this is when the first note of the pattern
comes, but it should be earlier").

The run: the part's same-pitch notes back to back (each starting within 0.05s of the last one's end), 4+ of them, an
even figure (each 0.3s+ and all the same length).
Exact scores only.
"""


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    by = {st["name"]: sorted(st["notes"], key=lambda m: float(m["start"])) for st in ctx.staves if not st.get("is_drum")}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    add = []
    for i, n in enumerate(lead):
        if i == 0 or lead[i - 1].get("staff") == n.get("staff") or n.get("staff") not in by:
            continue
        ns = by[n["staff"]]
        k = next((q for q, m in enumerate(ns) if abs(float(m["start"]) - float(n["start"])) < 0.01 and int(m["midi"]) == int(n["midi"])), None)
        if k is None:
            continue
        # (the run around it: same pitch, back to back)
        a = k
        while a > 0 and int(ns[a - 1]["midi"]) == int(n["midi"]) and float(ns[a]["start"]) - float(ns[a - 1]["end"]) <= 0.05:
            a -= 1
        b = k
        while b + 1 < len(ns) and int(ns[b + 1]["midi"]) == int(n["midi"]) and float(ns[b + 1]["start"]) - float(ns[b]["end"]) <= 0.05:
            b += 1
        if a == k or b - a + 1 < 4:
            continue
        # (an even figure of slow strikes -- each 0.3s+, all the same length -- not an ostinato's mixed rhythm)
        lens = [float(m["end"]) - float(m["start"]) for m in ns[a:b + 1]]
        if min(lens) < 0.3 or max(lens) > 1.1 * min(lens):
            continue
        prev_end = float(lead[i - 1]["end"])
        early = [dict(m, staff=n["staff"]) for m in ns[a:k] if float(m["start"]) >= prev_end - 0.02]
        if early:
            add.extend(early)
            print(f"    -> joined {n['staff']}'s repeated {n['midi']}s at {float(early[0]['start']):.2f}s (score), {len(early)} earlier")
    if add:
        ctx.lead_notes = sorted(lead + add, key=lambda x: float(x["start"]))
