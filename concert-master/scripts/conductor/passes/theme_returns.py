"""Theme returns: when a part restates a tune the lead already played, it takes the lead back from running figures.

A tune heard earlier as the lead that comes back in another part -- same intervals and rhythm, 7+ notes -- is what
the ear follows, even when a louder or higher part is busy with quick figuration on top (Jupiter 2:00: the trumpets
bring back the 79 74 76 77 76 74 79 tune the clarinets had at 1:52, under the woodwinds' 79 74 71 67 62 arpeggios).
The returning part takes over for as long as it keeps following the earlier statement, provided the lead there is
quicker figuration (its notes much shorter than the tune's) that isn't the tune itself.
"""

from bisect import bisect_left

MIN_LEN = 7


def _ivals(ns):
    return [int(ns[k + 1]["midi"]) - int(ns[k]["midi"]) for k in range(len(ns) - 1)]


def _iois(ns):
    return [float(ns[k + 1]["start"]) - float(ns[k]["start"]) for k in range(len(ns) - 1)]


def run(ctx):
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    staves = [st for st in ctx.staves if not st.get("is_drum")]
    starts = [float(x["start"]) for x in lead]
    index = {}
    for a in range(len(lead) - MIN_LEN + 1):
        index.setdefault(tuple(_ivals(lead[a:a + MIN_LEN])), []).append(a)
    windows = []  # (s0, s1, staff, notes)
    for st in staves:
        ns = sorted(st["notes"], key=lambda m: float(m["start"]))
        k = 0
        while k + MIN_LEN <= len(ns):
            t0 = float(ns[k]["start"])
            # the lead at this point must be another part
            h = bisect_left(starts, t0 - 0.05)
            if h >= len(lead) or abs(starts[h] - t0) >= 0.05 or lead[h].get("staff") == st["name"]:
                k += 1
                continue
            cand = ns[k:k + MIN_LEN]
            if any(float(cand[q + 1]["start"]) - float(cand[q]["end"]) > 0.1 for q in range(MIN_LEN - 1)) or \
                    min(float(m["end"]) - float(m["start"]) for m in cand) < 0.3:
                k += 1
                continue
            iv, io = _ivals(cand), _iois(cand)
            # an earlier lead statement of it (ended 3s+ before)
            match = None
            for a in index.get(tuple(iv), ()):
                ref = lead[a:a + MIN_LEN]
                if float(ref[-1]["start"]) > t0 - 3.0:
                    break
                if all(abs(x - y) <= 0.2 * y for x, y in zip(_iois(ref), io)):
                    match = a
                    break
            if match is None:
                k += 1
                continue
            # follow the restatement as long as it matches the earlier one
            e = MIN_LEN
            while (k + e < len(ns) and match + e < len(lead)
                   and int(ns[k + e]["midi"]) - int(ns[k + e - 1]["midi"]) == int(lead[match + e]["midi"]) - int(lead[match + e - 1]["midi"])
                   and float(ns[k + e]["start"]) - float(ns[k + e - 1]["end"]) <= 0.1):
                e += 1
            seg = ns[k:k + e]
            s0, s1 = float(seg[0]["start"]), float(seg[-1]["end"])
            cur = [x for x in lead if s0 - 0.02 <= float(x["start"]) < s1 - 0.02]
            if cur:
                durs = sorted(float(x["end"]) - float(x["start"]) for x in cur)
                tune = sorted(float(m["end"]) - float(m["start"]) for m in seg)
                same = [int(x["midi"]) for x in cur] == [int(m["midi"]) for m in seg]
                # (the lead there is really quick figuration -- notes 0.25s or shorter -- under a tune of 0.35s+ notes)
                md, mt = durs[len(durs) // 2], tune[len(tune) // 2]
                # (one note hammered in the brass doesn't take over from a brass line that moves -- Mars 5:50, the fourth trumpet's 59 59 59
                # 59 59 over the tenor tuba's 55 55 55 55 54 55 55 54 55 58; user, Nov 19: "I should do the low brass
                # triplet section INTO the trumpets")
                _br = lambda nm: any(b in str(nm).lower() for b in ("trumpet", "cornet", "horn", "trombone", "tuba", "euph", "baritone")) and "english" not in str(nm).lower()
                flat = len({int(m["midi"]) for m in seg}) == 1 and len({int(x["midi"]) for x in cur}) >= 3 and _br(st["name"]) and all(_br(x.get("staff")) for x in cur)
                if not same and not flat and md <= 0.25 and mt >= 0.35 and md <= 0.6 * mt:
                    windows.append((s0, s1, st["name"], seg))
            k += e
    if not windows:
        return
    # earliest-starting, longest windows first; no overlaps
    windows.sort(key=lambda w: (w[0], -(w[1] - w[0])))
    keep = []
    for w in windows:
        if not keep or w[0] >= keep[-1][1] - 0.02:
            keep.append(w)
    out = list(lead)
    for s0, s1, name, seg in keep:
        print(f"    -> theme returns at {s0:.2f}-{s1:.2f}s (score): {name} restates the earlier tune")
        out = [x for x in out if not (s0 - 0.02 <= float(x["start"]) < s1 - 0.02)] + [dict(m, staff=name) for m in seg]
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
