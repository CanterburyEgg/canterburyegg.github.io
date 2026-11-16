"""Ostinato is background: a stretch of the lead taken from a running ostinato goes back to the tune around it.

When the lead drops into a part that is only going round a short cell of quick notes (an ostinato, e.g. Jupiter's
running strings and woodwinds) between stretches of a real tune, the ear stays with the tune: the stretch is replaced
by what the tune's part -- or a part that was doubling its last note -- plays there, including anything it plays in
the gap just before (Jupiter 0:19: the trombones' theme carries on 55 57 59 55 under the clarinets' ostinato; 0:46:
the violins finish the horns' 66 69 71 71 and hold 86 under the flutes' ostinato). If that part then lands on a held
note where the ostinato's part also holds, the tune's part keeps it (Jupiter 0:20.8, the trombones' held 64).
"""

from ._ostinato import is_ostinato


def run(ctx):
    by_name = {st["name"]: sorted(st["notes"], key=lambda m: float(m["start"])) for st in ctx.staves if not st.get("is_drum")}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))

    def at(nm, t):
        return next((m for m in by_name.get(nm, ()) if abs(float(m["start"]) - t) <= 0.02), None)

    out, i, changed = [], 0, False
    while i < len(lead):
        b = lead[i].get("staff")
        j = i
        while j + 1 < len(lead) and lead[j + 1].get("staff") == b:
            j += 1
        seg = lead[i:j + 1]
        prev = out[-1] if out else None
        # (the ostinato part's quick notes; a held note it lands on afterwards is handled below)
        k = len(seg)
        while k > 0 and float(seg[k - 1]["end"]) - float(seg[k - 1]["start"]) > 0.15:
            k -= 1
        quick = seg[:k]
        if prev is None or not is_ostinato(quick) or float(quick[0]["start"]) - float(prev["start"]) > 1.5 or is_ostinato([prev] * 6):
            out.extend(seg)
            i = j + 1
            continue
        s0 = float(quick[0]["start"])
        s1 = float(seg[k]["start"]) if k < len(seg) else (float(lead[j + 1]["start"]) if j + 1 < len(lead) else float(quick[-1]["end"]) + 0.01)
        a = prev.get("staff")
        cands = [a] + [nm for nm in by_name if nm != a and (lambda m: m is not None and (int(m["midi"]) - int(prev["midi"])) % 12 == 0)(at(nm, float(prev["start"])))]
        best, best_ns = None, []
        for nm in cands:
            ns = [m for m in by_name[nm] if float(prev["start"]) + 0.02 < float(m["start"]) < s1 - 0.02]
            if ns and not is_ostinato(ns) and len(ns) > len(best_ns):
                best, best_ns = nm, ns
        if best is None:
            out.extend(seg)
            i = j + 1
            continue
        print(f"    -> ostinato is background at {s0:.2f}-{s1:.2f}s (score): {b}'s ostinato -> {best}")
        out.extend(dict(m, staff=best) for m in best_ns)
        # a held note the ostinato's part lands on: the tune's part keeps it if it holds there too
        for n in seg[k:]:
            m = at(best, float(n["start"]))
            if m is not None and float(m["end"]) - float(m["start"]) >= 0.8 * (float(n["end"]) - float(n["start"])):
                out.append(dict(n, staff=best, midi=int(m["midi"]), end=float(m["end"])))
            else:
                out.append(n)
        changed = True
        i = j + 1
    if changed:
        out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
