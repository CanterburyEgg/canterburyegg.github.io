"""Alternation is background: a lead stretch that only rocks between two notes gives way to the part that's moving.

When the lead sits in a part that just swings between two pitches (74 69 74 69 ...) while nearly every other part
does the same and one part actually moves through a figure (Jupiter 1:36-1:44: the English horn's 74 69 under the
trumpets' 62 67 72 | 64 69 74 calls), the ear follows the moving part: the stretch is replaced by what that part plays.
The moving part must cover the stretch, play at least as many notes, use 3+ different pitches, and not be a quick
running ostinato itself.
"""

from ._ostinato import is_ostinato


def _alternates(ns):
    return len(ns) >= 6 and len({int(m["midi"]) for m in ns}) == 2 and all(
        int(ns[i]["midi"]) == int(ns[i - 2]["midi"]) and int(ns[i]["midi"]) != int(ns[i - 1]["midi"]) for i in range(2, len(ns)))


def _mostly_alternating(ns):
    if len(ns) < 4:
        return False
    hits = sum(1 for i in range(2, len(ns)) if int(ns[i]["midi"]) == int(ns[i - 2]["midi"]))
    return hits >= 0.5 * (len(ns) - 2)


def run(ctx):
    staves = [st for st in ctx.staves if not st.get("is_drum")]
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out, i, changed = [], 0, False
    while i < len(lead):
        # the longest two-note rocking stretch starting here, in one part
        j = i
        while (j + 1 < len(lead) and lead[j + 1].get("staff") == lead[i].get("staff")
               and float(lead[j + 1]["start"]) - float(lead[j]["end"]) < 0.3
               and int(lead[j + 1]["midi"]) != int(lead[j]["midi"])
               and (j == i or int(lead[j + 1]["midi"]) == int(lead[j - 1]["midi"]))):
            j += 1
        seg = lead[i:j + 1]
        if not _alternates(seg):
            out.append(lead[i])
            i += 1
            continue
        s0, s1 = float(seg[0]["start"]), float(seg[-1]["end"])
        best, best_ns = None, []
        for st in staves:
            if st["name"] == seg[0].get("staff"):
                continue
            ns = sorted((m for m in st["notes"] if s0 - 0.3 <= float(m["start"]) < s1 - 0.05), key=lambda m: float(m["start"]))
            if len(ns) < len(seg) or len({int(m["midi"]) for m in ns}) < 3 or _mostly_alternating(ns) or is_ostinato(ns):
                continue
            if float(ns[0]["start"]) > s0 + 0.5 or float(ns[-1]["end"]) < s1 - 0.6:
                continue
            if len(ns) > len(best_ns):
                best, best_ns = st["name"], ns
        if best is None:
            out.extend(seg)
            i = j + 1
            continue
        print(f"    -> alternation is background at {s0:.2f}-{s1:.2f}s (score): {seg[0].get('staff')}'s two-note rocking -> {best}")
        out.extend(dict(m, staff=best) for m in best_ns)
        changed = True
        i = j + 1
    if changed:
        out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
