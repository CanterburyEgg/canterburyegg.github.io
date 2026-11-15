"""Answer in the hold: call-and-response, where another part echoes the lead's call while the lead holds its last note.

When the lead holds a note (1s+) at the end of a short call, and another part comes in during the hold with the same
figure (the same steps up and down as the call's last 3+ notes, in any octave) and finishes by the time the hold ends,
the echo is the line: cut the hold and play the answer (Ride 2:35-2:39: the woodwinds call 67 68 67 65 and hold; the
trumpets answer 67 68 67 65 under the held note, four times).
"""


def run(ctx):
    staves = ctx.staves
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    added = []
    for i, h in enumerate(lead):
        t0, t1 = float(h["start"]), float(h["end"])
        if t1 - t0 < 1.0 or i < 2:
            continue
        if any(t0 + 0.02 < float(n["start"]) < t1 - 0.05 for n in lead if n is not h):
            continue
        best = None
        for st in staves:
            if st.get("is_drum") or st["name"] == h.get("staff"):
                continue
            ans = sorted((n for n in st["notes"] if t0 + 0.3 <= float(n["start"]) < t1 - 0.1), key=lambda n: float(n["start"]))
            # (top voice where the part strikes a chord)
            col = []
            for n in ans:
                if col and abs(float(n["start"]) - float(col[-1]["start"])) <= 0.03:
                    if int(n["midi"]) > int(col[-1]["midi"]):
                        col[-1] = n
                    continue
                col.append(n)
            if not 3 <= len(col) <= 8 or float(col[-1]["end"]) > t1 + 0.05:
                continue
            # (nothing else of this part's sounding before the answer inside the hold: it's an entrance)
            if any(t0 + 0.02 < float(n["start"]) < float(col[0]["start"]) - 0.02 for n in st["notes"]):
                continue
            call = lead[i - len(col) + 1:i + 1]
            if len(call) != len(col):
                continue
            steps_c = [int(b["midi"]) - int(a["midi"]) for a, b in zip(call, call[1:])]
            steps_a = [int(b["midi"]) - int(a["midi"]) for a, b in zip(col, col[1:])]
            if steps_c != steps_a or not any(steps_c):
                continue
            # (the call has to be a figure too: its notes within a beat or so of each other)
            if any(float(b["start"]) - float(a["start"]) > 0.6 for a, b in zip(call, call[1:])):
                continue
            if best is None:
                best = (st["name"], col)
        if best is None:
            continue
        name, col = best
        print(f"    -> answer in the hold at {float(col[0]['start']):.2f}s (score): {name} echoes the call")
        h["end"] = float(col[0]["start"])
        added.extend(dict(n, staff=name) for n in col)
    if added:
        lead = sorted(lead + added, key=lambda x: float(x["start"]))
    ctx.lead_notes = lead
