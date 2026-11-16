"""Measured tremolo is texture: a long run of one note struck over and over in quick even notes isn't a line.

When the lead lands on a part that just re-strikes one pitch in quick notes (8+ strikes, 0.15s or shorter, back to
back -- a measured tremolo, like Jupiter 2:45's violas on 55 under the timpani roll), the ear hears a rumble of
texture, not a tune: those notes are dropped from the lead (whatever plays next takes over as usual).
"""


def run(ctx):
    staves = [st for st in ctx.staves if not st.get("is_drum")]
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out, i, dropped = [], 0, 0
    while i < len(lead):
        j = i
        while (j + 1 < len(lead) and int(lead[j + 1]["midi"]) == int(lead[i]["midi"])
               and lead[j + 1].get("staff") == lead[i].get("staff")
               and float(lead[j + 1]["start"]) - float(lead[j]["end"]) <= 0.05
               and float(lead[j + 1]["end"]) - float(lead[j + 1]["start"]) <= 0.15):
            j += 1
        run_ = lead[i:j + 1]
        if len(run_) >= 8 and all(float(x["end"]) - float(x["start"]) <= 0.15 for x in run_):
            print(f"    -> measured tremolo is texture at {float(run_[0]['start']):.2f}-{float(run_[-1]['end']):.2f}s (score): "
                  f"{run_[0].get('staff')}'s repeated {int(run_[0]['midi'])} dropped")
            dropped += len(run_)
            # (a strike that another part plays as the start of a real note -- same pitch, longer -- is that part's line
            # starting, not the tremolo: Jupiter 2:44's violins' 55 58 60 begins on the violas' last 55)
            for x in run_:
                t = float(x["start"])
                for st in staves:
                    if st["name"] == x.get("staff"):
                        continue
                    m = next((m for m in st["notes"] if abs(float(m["start"]) - t) <= 0.02 and int(m["midi"]) == int(x["midi"])
                              and float(m["end"]) - float(m["start"]) > 0.18), None)
                    if m is not None:
                        out.append(dict(x, staff=st["name"], end=float(m["end"])))
                        dropped -= 1
                        break
        else:
            out.extend(run_)
        i = j + 1
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
