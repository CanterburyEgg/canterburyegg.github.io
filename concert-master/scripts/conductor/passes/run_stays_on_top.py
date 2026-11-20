"""A run stays on top: when the lead is in a quick run (6+ notes, each under 0.15s apart) and hands over mid-run to a
part playing well under it (7+ semitones lower on average) while the run's own part keeps going note for note, the
run's part keeps the lead to its end. Mars 3:22: after a beat's rest, the flutes' run climbs 78 80 81 85 84 88 90 92 to the 93, and the
lead dropped to the cor anglais' inner line 61 60 68 66 68 69 71 72 underneath -- it jumped around the keys and isn't
what the ear follows (user, Nov 18: "those last 8 notes aren't playable the way they jump around"). Exact scores only.
"""

QUICK = 0.15


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    by = {st["name"]: sorted(st["notes"], key=lambda m: float(m["start"])) for st in ctx.staves if not st.get("is_drum")}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out, i, swapped = [], 0, 0
    while i < len(lead):
        n = lead[i]
        a = lead[i - 1].get("staff") if i else None
        if not a or n.get("staff") == a or a not in by:
            out.append(n)
            i += 1
            continue
        # (the run so far: 6+ quick notes in part a, right up to the handover)
        k = i - 1
        # (a breath inside it is still the run: the flutes' 84, a beat's rest, then 78 80 81 ...)
        while k > 0 and lead[k - 1].get("staff") == a and float(lead[k]["start"]) - float(lead[k - 1]["start"]) < 0.45:
            k -= 1
        run_len = sum(1 for q in range(k + 1, i) if float(lead[q]["start"]) - float(lead[q - 1]["start"]) < QUICK + 0.02) + 1
        quick_in = float(n["start"]) - float(lead[i - 1]["start"]) < 0.5
        # (the new part's stretch: its own quick notes from here)
        j = i
        while j + 1 < len(lead) and lead[j + 1].get("staff") == n.get("staff") and float(lead[j + 1]["start"]) - float(lead[j]["start"]) < QUICK + 0.02:
            j += 1
        seg = lead[i:j + 1]
        if run_len < 6 or not quick_in or len(seg) < 3:
            out.append(n)
            i += 1
            continue
        s0, s1 = float(seg[0]["start"]) - 0.15, float(seg[-1]["start"]) + 0.02
        top = [m for m in by[a] if s0 <= float(m["start"]) <= s1 and float(m["start"]) > float(lead[i - 1]["start"]) + 0.02]
        hits = sum(any(abs(float(m["start"]) - float(x["start"])) <= 0.03 for m in top) for x in seg)
        low = sum(int(x["midi"]) for x in seg) / len(seg)
        high = sum(int(m["midi"]) for m in top) / len(top) if top else 0
        if top and hits >= 0.7 * len(seg) and high - low >= 7 and all(float(m["end"]) - float(m["start"]) < 0.3 for m in top[:-1]):
            out.extend(dict(m, staff=a) for m in top)
            # (and on to its landing, if the part a lands on a note right after)
            nxt = [m for m in by[a] if s1 < float(m["start"]) <= s1 + QUICK + 0.03]
            end_t = float(seg[-1]["end"])
            if nxt:
                out.extend(dict(m, staff=a) for m in nxt[:1])
                end_t = max(end_t, float(nxt[0]["start"]) + 0.02)
            print(f"    -> run stays on top at {float(seg[0]['start']):.2f}s (score): {a} over {seg[0].get('staff')}")
            swapped += 1
            i = j + 1
            while i < len(lead) and float(lead[i]["start"]) < end_t - 0.02:
                i += 1
            continue
        out.append(n)
        i += 1
    if swapped:
        out.sort(key=lambda x: float(x["start"]))
        ctx.lead_notes = out
