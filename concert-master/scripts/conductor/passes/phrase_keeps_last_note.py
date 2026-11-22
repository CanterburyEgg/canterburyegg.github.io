"""A phrase keeps its last note: when the lead hands from one part to another and the first part still has a note to
play before the next part comes in (straight on from its last lead note, nothing else in the lead there), that note
is the end of its phrase and is played (Mercury 1:22: the oboe's 79 79 81 79 77 76 77 79 77 76 72 74 lost its 74 to the
flute's entry a beat later; user, Nov 21: "I think I'm missing the last note in the oboe(?) melody here"). Exact
scores only.
"""


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    by_name = {st["name"]: st["notes"] for st in ctx.staves if not st.get("is_drum")}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    added = []
    for i in range(1, len(lead) - 1):
        a, b = lead[i], lead[i + 1]
        p = a.get("staff")
        if p is None or p == b.get("staff") or p not in by_name or lead[i - 1].get("staff") != p:
            continue
        a0, a1, b0 = float(a["start"]), float(a["end"]), float(b["start"])
        ioi = a0 - float(lead[i - 1]["start"])
        nxt = [m for m in by_name[p] if a0 + 0.05 < float(m["start"]) < b0 - 0.05]
        if len(nxt) != 1:
            continue
        m = nxt[0]
        t = float(m["start"])
        # (straight on from the last note, in the phrase's own pace)
        if t - a1 > 0.1 or t - a0 > max(0.6, 1.6 * ioi) or a1 > t + 0.02:
            continue
        # (with room to sound before the next part comes in -- not a pickup the next entry lands right on top of, Mars
        # 3:18's trumpet 81 a tenth of a second before the runs)
        if b0 - t < 0.2:
            continue
        added.append(dict(m, staff=p, end=min(float(m["end"]), b0)))
        print(f"    -> phrase keeps its last note at {t:.2f}s (score): {p} {int(m['midi'])}")
    if added:
        lead.extend(added)
        lead.sort(key=lambda x: float(x["start"]))
        ctx.lead_notes = lead
