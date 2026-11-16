"""Entry during a hold: a part that comes in with a rising line while the lead sits on a long note takes the lead.

When the lead holds a note (1.5s+) and, partway through it (0.3s+ in), another part enters above it after a rest of 1s+
with a rising line of 3+ notes (each 0.3s+ written), the ear goes to the entry (Jupiter 5:02: the oboes hold 80 while the
piccolo comes in with 88 92 98). The hold is cut at the entry and the entering line takes over; if several parts enter
together, the highest one leads.
"""


def run(ctx):
    staves = [st for st in ctx.staves if not st.get("is_drum")]
    by = {st["name"]: sorted(st["notes"], key=lambda m: float(m["start"])) for st in staves}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out, changed, spans = [], 0, []
    for idx, n in enumerate(lead):
        s0, s1 = float(n["start"]), float(n["end"])
        if s1 - s0 < 1.5:
            out.append(n)
            continue
        nxt = float(lead[idx + 1]["start"]) if idx + 1 < len(lead) else 1e9
        best = None
        for name, ns in by.items():
            if name == n.get("staff"):
                continue
            for q, m in enumerate(ns):
                t = float(m["start"])
                if t < s0 + 0.3 or t > s1 - 0.3:
                    continue
                prev_end = float(ns[q - 1]["end"]) if q > 0 else -1e9
                if t - prev_end < 1.0:
                    continue
                line = [m]
                r = q + 1
                while r < len(ns) and float(ns[r]["start"]) - float(line[-1]["end"]) <= 0.05 and int(ns[r]["midi"]) > int(line[-1]["midi"]):
                    line.append(ns[r])
                    r += 1
                # (an entry above the held note -- a part coming in underneath, like Arabesque 5:29's violins or a bass
                # line under a held tune note, stays accompaniment)
                if len(line) < 3 or any(float(x["end"]) - float(x["start"]) < 0.3 for x in line[:-1]) or int(line[0]["midi"]) <= int(n["midi"]):
                    break
                    continue
                key = (float(line[0]["start"]), -int(line[0]["midi"]))
                if best is None or key < best[0]:
                    best = (key, name, line)
                break
        if best is None:
            out.append(n)
            continue
        _, name, line = best
        # (nothing to do when the lead already plays that line -- relayed from a doubling part, say: Sevens 0:31)
        if sum(any(abs(float(y["start"]) - float(x["start"])) <= 0.02 and int(y["midi"]) == int(x["midi"]) for y in lead) for x in line[:3]) >= 2:
            out.append(n)
            continue
        t0 = float(line[0]["start"])
        out.append(dict(n, end=t0 - 0.01))
        out.extend(dict(x, staff=name, _entry=True) for x in line)
        spans.append((t0, float(line[-1]["end"]) - 0.02, name))
        changed += 1
    # (the entering line carries on to its own end: other lead notes starting inside it give way)
    out = [x for x in out if x.get("_entry") or not any(a <= float(x["start"]) < b for a, b, nm in spans)]
    out = [{k: v for k, v in x.items() if k != "_entry"} for x in out]
    if changed:
        print(f"    -> entry during a hold: {changed} rising entr(ies) take over from a held lead note")
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
