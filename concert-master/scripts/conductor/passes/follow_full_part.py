"""Follow the full part: when the lead is in a quick passage (8+ notes) and its part drops out for a moment (a rest of
0.2s+ inside the passage) while another part doubling it -- the same notes, or the same notes an octave away -- plays
the whole passage straight through, the lead follows that part for the whole passage. Mars 3:19-3:23: the flutes rest
for a beat in the middle of the woodwind run while the first violins play every note of it (user, Nov 18: "for any part
where some instruments jump in and out and some play the full part, stick to the instrument playing the full part").
Exact scores only.
"""

QUICK = 0.15


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    by = {st["name"]: sorted(st["notes"], key=lambda m: float(m["start"])) for st in ctx.staves if not st.get("is_drum")}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out, i, swapped, cut = [], 0, 0, []
    while i < len(lead):
        a = lead[i].get("staff")
        j = i
        while j + 1 < len(lead) and lead[j + 1].get("staff") == a and float(lead[j + 1]["start"]) - float(lead[j]["start"]) < 0.5:
            j += 1
        seg = lead[i:j + 1]
        gaps = [float(y["start"]) - float(x["end"]) for x, y in zip(seg, seg[1:])]
        quick = sum(1 for x, y in zip(seg, seg[1:]) if float(y["start"]) - float(x["start"]) < QUICK + 0.02)
        holes = [g for g in gaps if g >= 0.2]
        best = None
        if len(seg) >= 8 and quick >= 0.7 * (len(seg) - 1) and holes:
            t0, t1 = float(seg[0]["start"]), float(seg[-1]["start"])
            for nm, ns in by.items():
                if nm == a:
                    continue
                part = [m for m in ns if t0 - 0.02 <= float(m["start"]) <= t1 + 0.02]
                if len(part) < len(seg):
                    continue
                # (straight through: no rest anywhere in the passage)
                if any(float(y["start"]) - float(x["start"]) > QUICK + 0.02 for x, y in zip(part, part[1:])):
                    continue
                # (doubling the lead: nearly every lead note has this part on the same note, or an octave away)
                dbl = sum(any(abs(float(m["start"]) - float(x["start"])) <= 0.03 and (int(m["midi"]) - int(x["midi"])) % 12 == 0 for m in part) for x in seg)
                if dbl < 0.85 * len(seg):
                    continue
                key = (dbl, -abs(sum(int(m["midi"]) for m in part) / len(part) - sum(int(x["midi"]) for x in seg) / len(seg)))
                if best is None or key > best[0]:
                    best = (key, nm, part)
        if best:
            _, nm, part = best
            # (from the passage's own first note: where the part started it earlier, under a held note or a last note
            # of the tune before -- Mars 3:19, all the voices start the flourish on the 16th after the trumpets' last
            # 81, which is cut for it; user, Nov 19: "the K ... can be cut and we can start the flourish there")
            ns = by[nm]
            k0 = ns.index(part[0])
            while k0 > 0 and float(ns[k0]["start"]) - float(ns[k0 - 1]["start"]) < QUICK + 0.02 and float(part[0]["start"]) - float(ns[k0 - 1]["start"]) < 2.5:
                k0 -= 1
            head = ns[k0:ns.index(part[0])]
            if head:
                h0 = float(head[0]["start"])
                cut.append((h0 - 0.12, float(part[0]["start"]) - 0.02))
                for x in out:
                    if float(x["start"]) < h0 - 0.12 and float(x["end"]) > h0:
                        x["end"] = h0
            out.extend(dict(m, staff=nm, _full=True) for m in head + part)
            print(f"    -> full part at {float(seg[0]['start']):.2f}s (score): {nm} plays straight through where {a} drops out")
            swapped += 1
        else:
            out.extend(seg)
        i = j + 1
    if swapped:
        out = [x for x in out if x.pop("_full", False) or not any(a <= float(x["start"]) < b for a, b in cut)]
        out.sort(key=lambda x: float(x["start"]))
        ctx.lead_notes = out
