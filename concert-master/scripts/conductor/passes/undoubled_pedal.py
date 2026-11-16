"""Undoubled pedal: a repeated-note pedal that no other part doubles isn't the tune.

When the lead sits on one part striking the same note over and over (4+ times, each at least 0.2s long, above the
bass), no other part plays that note with it (same time, same note or octave, 0.3s+), and something else is moving
meanwhile, the ear doesn't follow it as a line -- it's a pedal in the background (Jupiter 0:12.6-0:14.5: the trumpets' repeated quarter-note E under the running strings). The
pedal notes go (a note struck together with 4+ held parts stays: that's the band's hit), and if the next part's
phrase began during the pedal, its notes from there come in (the trombones' theme starts on its 57 at 0:14.5, where
the pedal's last note was).
"""


def run(ctx):
    staves = [st for st in ctx.staves if not st.get("is_drum")]
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))

    def doubled(n):
        t, pc = float(n["start"]), int(n["midi"]) % 12
        return any(st["name"] != n.get("staff") and any(abs(float(m["start"]) - t) <= 0.02 and int(m["midi"]) % 12 == pc
                                                        and float(m["end"]) - float(m["start"]) >= 0.3 for m in st["notes"])
                   for st in staves)

    def held_hit(n):
        # (struck together with 4+ other parts -- not counting quick running notes: that's the band's hit)
        t = float(n["start"])
        return sum(1 for st in staves if st["name"] != n.get("staff") and any(
            abs(float(m["start"]) - t) <= 0.02 and float(m["end"]) - float(m["start"]) > 0.15 for m in st["notes"])) >= 4

    def others_moving(t0, t1, nm):
        # (a pedal is background to something moving: another part plays 3+ different notes meanwhile)
        return any(st["name"] != nm and len({int(m["midi"]) for m in st["notes"] if t0 <= float(m["start"]) <= t1}) >= 3 for st in staves)

    drop = set()
    i = 0
    while i < len(lead):
        j = i
        while (j + 1 < len(lead) and lead[j + 1].get("staff") == lead[i].get("staff") and int(lead[j + 1]["midi"]) == int(lead[i]["midi"])
               and float(lead[j + 1]["start"]) - float(lead[j]["start"]) >= 0.35):
            j += 1
        run_ = [k for k in range(i, j + 1) if float(lead[k]["end"]) - float(lead[k]["start"]) >= 0.2 and not held_hit(lead[k])]
        if (len(run_) >= 4 and int(lead[i]["midi"]) >= 55 and not any(doubled(lead[k]) for k in run_)
                and others_moving(float(lead[run_[0]]["start"]), float(lead[run_[-1]]["start"]), lead[i].get("staff"))):
            print(f"    -> undoubled pedal {float(lead[run_[0]]['start']):.2f}-{float(lead[run_[-1]]['start']):.2f}s (score): {lead[i].get('staff')}'s {lead[i]['midi']} x{len(run_)}")
            drop.update(run_)
            # the next part's phrase, if it began during the pedal
            if j + 1 < len(lead):
                nxt = lead[j + 1]
                t0 = float(lead[run_[0]]["start"])
                src = next((st["notes"] for st in staves if st["name"] == nxt.get("staff")), [])
                early = sorted((m for m in src if t0 <= float(m["start"]) < float(nxt["start"]) - 0.02), key=lambda m: float(m["start"]))
                # (only its notes leading straight into its first lead note: no breath over 0.5s)
                keep = []
                for m in reversed(early):
                    nxt_t = float(keep[-1]["start"]) if keep else float(nxt["start"])
                    if nxt_t - float(m["end"]) > 0.5:
                        break
                    keep.append(m)
                lead.extend(dict(m, staff=nxt.get("staff")) for m in keep)
                # (a pedal note struck right where the new phrase begins goes too)
                drop.update(k for k in range(i, j + 1) if any(abs(float(lead[k]["start"]) - float(m["start"])) <= 0.03 for m in keep))
        i = j + 1
    if drop:
        lead = sorted((n for k, n in enumerate(lead) if k not in drop), key=lambda x: float(x["start"]))
    ctx.lead_notes = lead
