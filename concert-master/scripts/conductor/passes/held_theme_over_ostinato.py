"""Held theme over an ostinato: when the lead is an ostinato -- a rhythm hammered on one pitch (Mars: the strings' and
harp's col legno 5/4 figure on G) -- and another part plays a theme in long notes over it (the bassoons and horns'
G ... D C# ..., notes of 0.75s and more), the theme leads for as long as it plays, its long notes held; the ostinato
comes back only where the theme rests (user, Nov 17: "the ostinato only when the long melody ISN'T playing").

Theme: a phrase in one part (split at a rest of 0.3s+) of 2+ notes, at least 2 different pitches, median length 0.75s+,
sounding through 85%+ of its span, not a percussion part and not the ostinato itself. The ostinato: the lead notes
under it are 80%+ one pitch with a median length under 0.45s. With several parts playing the theme in unison/octaves,
the highest wins (brass on a tie). Exact scores only.
"""

BRASS = ("trumpet", "cornet", "horn", "trombone", "tuba", "euph", "baritone", "flugel")


def _phrases(notes):
    ns = sorted(notes, key=lambda m: float(m["start"]))
    out, cur = [], []
    for m in ns:
        if cur and float(m["start"]) - max(float(x["end"]) for x in cur) >= 0.3:
            out.append(cur)
            cur = []
        cur.append(m)
    if cur:
        out.append(cur)
    return out


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    cands = []
    ost_of = {}  # id(phrase) -> the ostinato notes it replaces
    for st in ctx.staves:
        if st.get("is_drum"):
            continue
        for ph in _phrases(st["notes"]):
            if len(ph) < 2 or len({int(m["midi"]) for m in ph}) < 2:
                continue
            durs = sorted(float(m["end"]) - float(m["start"]) for m in ph)
            if durs[len(durs) // 2] < 0.75:
                continue
            b0, b1 = float(ph[0]["start"]), max(float(m["end"]) for m in ph)
            cover = sum(float(m["end"]) - float(m["start"]) for m in ph) / max(1e-6, b1 - b0)
            if cover < 0.85:
                continue
            under = [x for x in lead if b0 - 0.02 <= float(x["start"]) < b1 - 0.02]
            if len(under) < 4:
                continue
            # (the lead under it: the ostinato -- quick notes, mostly one pitch -- and maybe, for part of the span,
            # this theme already, in this or another part: Mars 0:35, the tenor trombone's theme runs on past where
            # the ostinato stops and the theme already leads)
            def sounding(t):
                return next((m for m in ph if float(m["start"]) - 0.02 <= t < float(m["end"]) - 0.02), None)
            quick = [x for x in under if float(x["end"]) - float(x["start"]) < 0.45]
            if len(quick) < 4:
                continue
            qp = [int(x["midi"]) for x in quick]
            top = max(set(qp), key=qp.count)
            ost = [x for x in quick if int(x["midi"]) == top]
            same = [x for x in under if x not in ost and sounding(float(x["start"])) is not None
                    and (int(sounding(float(x["start"]))["midi"]) - int(x["midi"])) % 12 == 0]
            if len(ost) < 4 or len(ost) + len(same) < 0.9 * len(under):
                continue
            if any(x.get("staff") == st["name"] for x in ost):
                continue
            # (only the ostinato gives way: where the theme already leads -- maybe an octave up in other parts, Mars
            # 0:25's horns and trumpets -- those notes stay, and this part's notes fill only the ostinato's stretches)
            keep = [x for x in under if x not in ost]
            fill = [m for m in ph if not any(float(x["start"]) < float(m["end"]) - 0.02 and float(m["start"]) < float(x["end"]) - 0.02
                                            for x in keep)]
            if not fill:
                continue
            ph = fill
            med = sorted(int(m["midi"]) for m in ph)[len(ph) // 2]
            brass = any(b in st["name"].lower() for b in BRASS) and "english" not in st["name"].lower()
            ost_of[id(ph)] = ost
            cands.append(((med, brass, b1 - b0), b0, b1, st["name"], ph))
    if not cands:
        return
    taken = []
    for _, b0, b1, name, ph in sorted(cands, key=lambda c: c[0], reverse=True):
        if any(b0 < t1 - 0.02 and t0 < b1 - 0.02 for t0, t1, _n, _p in taken):
            continue
        taken.append((b0, b1, name, ph))
    out = [x for x in lead if not any(b0 - 0.02 <= float(x["start"]) < b1 - 0.02 and x in ost_of[id(p)]
                                      for b0, b1, _n, p in taken)]
    for b0, b1, name, ph in sorted(taken, key=lambda t: t[0]):
        print(f"    -> held theme over ostinato at {b0:.2f}-{b1:.2f}s (score): {name}")
        out.extend(dict(m, staff=name) for m in ph)
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
