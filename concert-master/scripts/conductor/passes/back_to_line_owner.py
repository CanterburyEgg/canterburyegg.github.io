"""Back to the line's owner: after a hand-off, the part that had the line takes it back where it doubles the new part.

When the lead passes from one part to another and, within a few seconds, the first part plays the new part's notes
an octave higher (same attacks) for 3+ notes in a row starting within a second of the hand-off, the first part never
really left: the new part only had a lead-in (notes the first part does not play) into the same line, an octave down. The doubled stretch is read from the first part (Ride 0:03: the horns' quick run up hands the tune straight
back to the oboes, who play 82 81 77 80 over the horns' 70 69 65 68).
"""


def run(ctx):
    by_name = {st["name"]: st["notes"] for st in ctx.staves if not st.get("is_drum")}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))

    def same_note(owner, n):
        t = float(n["start"])
        for m in by_name.get(owner, ()):
            if abs(float(m["start"]) - t) <= 0.02 and int(m["midi"]) - int(n["midi"]) in (12, 24):
                return m
            if float(m["start"]) > t + 0.05:
                break
        return None

    for nm in by_name:
        by_name[nm] = sorted(by_name[nm], key=lambda m: float(m["start"]))
    i = 1
    while i < len(lead):
        a, b = lead[i - 1].get("staff"), lead[i].get("staff")
        if not a or not b or a == b:
            i += 1
            continue
        # the new part's notes from the hand-off, up to 4s on
        j = i
        while j < len(lead) and lead[j].get("staff") == b and float(lead[j]["start"]) - float(lead[i]["start"]) < 4.0:
            j += 1
        k = i
        while k < j:
            if same_note(a, lead[k]) is None:
                k += 1
                continue
            e = k
            while e < j and same_note(a, lead[e]) is not None:
                e += 1
            if e - k >= 3 and k > i and float(lead[k]["start"]) - float(lead[i]["start"]) <= 1.0:
                print(f"    -> back to the line's owner at {float(lead[k]['start']):.2f}s (score): {a} takes it back from {b}")
                for q in range(k, e):
                    m = same_note(a, lead[q])
                    lead[q] = dict(lead[q], midi=int(m["midi"]), end=float(m["end"]), staff=a)
            k = e
        i = j
    ctx.lead_notes = lead
