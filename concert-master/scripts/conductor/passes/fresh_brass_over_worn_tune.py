"""Fresh brass line over a well-worn tune: once a tune has been the lead twice already, a new brass line over its next
statement takes the lead.

The third time a tune comes round, a brass part playing something new on top of it -- a fanfare or counter-line that
is busier and higher than the tune, not a doubling of it (Jupiter 2:25-2:32: the trumpets' 69 71 67 71 69 fanfare over
the English horn's fourth statement of the 67 62 64 65 tune) -- is what the ear picks up. The tune's stretch is
replaced by that part's notes -- the ones another brass part doubles, when most are (the line the section plays
together, without one player's interjections in between). A tune counts as well-worn when its 7-note shape (same intervals) already led at least
twice, each statement over before this one starts.
"""

N = 7
BRASS = ("trumpet", "cornet", "horn", "flugel")


def _iv(ns):
    return tuple(int(ns[k + 1]["midi"]) - int(ns[k]["midi"]) for k in range(len(ns) - 1))


def run(ctx):
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    if len(lead) < N:
        return
    seen = {}
    for a in range(len(lead) - N + 1):
        seen.setdefault(_iv(lead[a:a + N]), []).append(a)
    # lead notes inside a statement of a shape that already led twice before it
    worn = [False] * len(lead)
    for occ in seen.values():
        for k, a in enumerate(occ):
            prior = [b for b in occ[:k] if float(lead[b + N - 1]["end"]) <= float(lead[a]["start"]) + 0.02]
            # (two earlier statements that don't overlap each other)
            starts = []
            for b in prior:
                if not starts or b >= starts[-1] + N:
                    starts.append(b)
            if len(starts) >= 2:
                for q in range(a, a + N):
                    worn[q] = True
    # (the English horn is a woodwind, whatever its name says)
    staves = [st for st in ctx.staves if not st.get("is_drum") and any(b in st["name"].lower() for b in BRASS)
              and "english" not in st["name"].lower()]
    out, i, changed = [], 0, False
    while i < len(lead):
        if not worn[i]:
            out.append(lead[i])
            i += 1
            continue
        j = i
        while j + 1 < len(lead) and worn[j + 1] and lead[j + 1].get("staff") == lead[i].get("staff"):
            j += 1
        seg = lead[i:j + 1]
        s0, s1 = float(seg[0]["start"]), float(seg[-1]["end"])
        best, best_ns = None, []
        if s1 - s0 >= 3.0:
            tune_mid = sorted(int(x["midi"]) for x in seg)[len(seg) // 2]
            tune_pc = [int(x["midi"]) % 12 for x in seg]
            for st in staves:
                if st["name"] == seg[0].get("staff"):
                    continue
                ns = sorted((m for m in st["notes"] if s0 - 0.02 <= float(m["start"]) < s1 - 0.02), key=lambda m: float(m["start"]))
                if len(ns) < len(seg) or len({int(m["midi"]) for m in ns}) < 4:
                    continue
                if float(ns[0]["start"]) > s0 + 0.8 or float(ns[-1]["end"]) < s1 - 0.8:
                    continue
                mid = sorted(int(m["midi"]) for m in ns)[len(ns) // 2]
                # (higher than the tune, and not just doubling it in another octave)
                if mid <= tune_mid or [int(m["midi"]) % 12 for m in ns][:len(tune_pc)] == tune_pc:
                    continue
                # (the fanfare is what the brass play together: keep the notes another brass part doubles -- the second
                # trumpet's own interjections in between aren't the line)
                dbl = [m for m in ns if any(o["name"] != st["name"] and any(
                    abs(float(x["start"]) - float(m["start"])) <= 0.02 and (int(x["midi"]) - int(m["midi"])) % 12 == 0
                    for x in o["notes"]) for o in staves)]
                line = dbl if len(dbl) >= max(len(seg) * 0.6, 0.5 * len(ns)) else ns
                if len(line) > len(best_ns) or (best is not None and len(dbl) == len(line) and len(line) >= 0.9 * len(best_ns)):
                    best, best_ns = st["name"], line
        if best is None:
            out.extend(seg)
        else:
            print(f"    -> fresh brass line at {s0:.2f}-{s1:.2f}s (score): {best} over {seg[0].get('staff')}'s well-worn tune")
            out.extend(dict(m, staff=best) for m in best_ns)
            changed = True
        i = j + 1
    if changed:
        out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
