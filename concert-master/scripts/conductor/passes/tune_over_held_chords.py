"""The tune carries on over held chords: when a part goes on playing a tune the lead already played (same intervals and
rhythm, 7+ notes), and the lead there has dropped onto slow held chords, the lead stays with the tune.

The mirror of theme_returns (a slow tune over quick figures): here the tune is the quicker line and what the lead
fell onto is the band's held chords (Mercury 1:38: the second violins, then the first violins in canon, keep the
79 79 81 79 77 76 77 79 77 76 74 tune going over the clarinets' and horns' 67 65 67 65 chords; user, Nov 21: "I pick up
the horns here, but I should stick on the high melody"). The restatement is followed back to where it starts matching
the earlier lead and on for as long as it keeps matching, provided it sits at or above the chords. Exact scores only.
"""

MIN_LEN = 7


def _ivals(ns):
    return [int(ns[k + 1]["midi"]) - int(ns[k]["midi"]) for k in range(len(ns) - 1)]


def _iois(ns):
    return [float(ns[k + 1]["start"]) - float(ns[k]["start"]) for k in range(len(ns) - 1)]


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    staves = [st for st in ctx.staves if not st.get("is_drum")]
    index = {}
    for a in range(len(lead) - MIN_LEN + 1):
        seg = lead[a:a + MIN_LEN]
        if len({x.get("staff") for x in seg}) == 1:
            index.setdefault(tuple(_ivals(seg)), []).append(a)
    windows = []
    for st in staves:
        ns = sorted(st["notes"], key=lambda m: float(m["start"]))
        k = 0
        while k + MIN_LEN <= len(ns):
            cand = ns[k:k + MIN_LEN]
            t0 = float(cand[0]["start"])
            if any(float(cand[q + 1]["start"]) - float(cand[q]["end"]) > 0.1 for q in range(MIN_LEN - 1)) or \
                    len({int(m["midi"]) for m in cand}) < 3:
                k += 1
                continue
            iv, io = _ivals(cand), _iois(cand)
            match = None
            for a in index.get(tuple(iv), ()):
                ref = lead[a:a + MIN_LEN]
                if float(ref[-1]["start"]) > t0 - 1.0:
                    break
                if all(abs(x - y) <= 0.2 * y for x, y in zip(_iois(ref), io)):
                    match = a
            if match is None:
                k += 1
                continue
            # (back to where it starts matching, and on while it keeps matching -- not over a long held note)
            b, mb = k, match
            while (b > 0 and mb > 0 and int(ns[b]["midi"]) - int(ns[b - 1]["midi"]) == int(lead[mb]["midi"]) - int(lead[mb - 1]["midi"])
                   and float(ns[b]["start"]) - float(ns[b - 1]["end"]) <= 0.1 and float(ns[b - 1]["end"]) - float(ns[b - 1]["start"]) <= 0.8):
                b, mb = b - 1, mb - 1
            e = k + MIN_LEN
            me = match + MIN_LEN
            while (e < len(ns) and me < len(lead) and int(ns[e]["midi"]) - int(ns[e - 1]["midi"]) == int(lead[me]["midi"]) - int(lead[me - 1]["midi"])
                   and float(ns[e]["start"]) - float(ns[e - 1]["end"]) <= 0.1 and float(ns[e]["end"]) - float(ns[e]["start"]) <= 0.8):
                e, me = e + 1, me + 1
            seg = ns[b:e]
            s0, s1 = float(seg[0]["start"]), float(seg[-1]["end"])
            cur = [x for x in lead if s0 - 0.02 <= float(x["start"]) < s1 - 0.02]
            if cur and any(x.get("staff") != st["name"] for x in cur):
                durs = sorted(float(x["end"]) - float(x["start"]) for x in cur)
                tune = sorted(float(m["end"]) - float(m["start"]) for m in seg)
                md, mt = durs[len(durs) // 2], tune[len(tune) // 2]
                cp = sorted(int(x["midi"]) for x in cur)[len(cur) // 2]
                tp = sorted(int(m["midi"]) for m in seg)[len(seg) // 2]
                # (the lead there is held chords -- notes half a second or more -- under the tune)
                # (and they are chords: three or more other parts strike with the lead's note, held as long -- the band's
                # block chords, not a held line of its own like Mars 4:30's long-short tune)
                def chordal(x):
                    x0, xd = float(x["start"]), float(x["end"]) - float(x["start"])
                    return sum(1 for o in staves if any(abs(float(y["start"]) - x0) <= 0.03 and abs((float(y["end"]) - float(y["start"])) - xd) <= 0.15 * xd + 0.03
                                                        for y in o["notes"])) >= 4
                held = [x for x in cur if float(x["end"]) - float(x["start"]) >= 0.4]
                block = bool(held) and sum(1 for x in held if chordal(x)) >= 0.6 * len(held)
                # (held chords four times the tune's notes or more -- Mars 4:30's long-short line is only three times)
                if md >= 0.5 and md >= 4.0 * mt and tp >= cp and block:
                    # (from where the lead drops onto the chords: a statement still going in the lead plays on to its end
                    # -- Mercury 1:35, the clarinet's tune runs on to its 72 74 before the second violins take over)
                    h0 = min(float(x["start"]) for x in held)
                    seg = [m for m in seg if float(m["start"]) >= h0 - 0.02]
                    if len(seg) < MIN_LEN:
                        k += 1
                        continue
                    s0 = float(seg[0]["start"])
                    # (how many other parts double it, note for note -- the tutti statement over a lone canon voice)
                    dbl = sum(sum(1 for m in seg if any(abs(float(x["start"]) - float(m["start"])) <= 0.03 and
                                                       (int(x["midi"]) - int(m["midi"])) % 12 == 0 for x in o["notes"]))
                              for o in staves if o is not st) / len(seg)
                    windows.append((s0, s1, st["name"], seg, dbl))
                    k = e
                    continue
            k += 1
    if not windows:
        return
    windows.sort(key=lambda w: (w[0], -(w[1] - w[0])))
    keep = []
    for w in windows:
        if not keep or w[0] >= keep[-1][1] - 0.02:
            keep.append(w)
        elif w[4] >= keep[-1][4] + 2.0:
            # (the band coming in with the tune, doubled all round, takes it from a lone voice -- Mercury 1:47, flutes,
            # clarinets and first violins over the second violins' canon)
            k0 = keep.pop()
            trimmed = [m for m in k0[3] if float(m["start"]) < w[0] - 0.02]
            if trimmed:
                keep.append((k0[0], w[0], k0[2], trimmed, k0[4]))
            keep.append(w)
        elif w[1] > keep[-1][1] + 1.0:
            # (a canon: the next part carries the tune on past where the first one stops)
            keep.append((keep[-1][1], w[1], w[2], [m for m in w[3] if float(m["start"]) >= keep[-1][1] - 0.02], w[4]))
    out = list(lead)
    for s0, s1, name, seg, _d in keep:
        if not seg:
            continue
        print(f"    -> tune carries on over held chords at {s0:.2f}-{s1:.2f}s (score): {name}")
        out = [x for x in out if not (s0 - 0.02 <= float(x["start"]) < s1 - 0.02)]
        for x in out:
            if float(x["start"]) < s0 < float(x["end"]):
                x["end"] = s0
        out += [dict(m, staff=name) for m in seg]
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
