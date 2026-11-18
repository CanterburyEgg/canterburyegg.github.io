"""A moving tune beats a repeated-note accompaniment: when the lead has settled on a part that just repeats one note (an
ostinato or a repeated-chord accompaniment -- Mars 1:45: the trumpets hammering 72; 2:32: the clarinets' repeated 63;
2:41: the timpani's 45s), and another part is playing a tune at the same time, the tune leads (user, Nov 18: "just be
playing the brass melody as it's handed off, with the ostinato only coming back into play if it's truly the only
thing being played").

The accompaniment: a stretch of the lead in one part, 4+ notes, 80%+ of them one pitch. The tune: a phrase in another
part (split at rests of 0.3s+) of 4+ notes with 3+ different pitch classes (octave leaps aren't a tune), no one pitch
more than 75% of them, median note 0.2s+ (a tune, not figuration), not a mallet/harp part, sounding
through 60%+ of the stretch. Brass first, then the highest. The tune leads from its first note to its last (only over
the accompaniment). Exact scores only.
"""

BRASS = ("trumpet", "cornet", "horn", "trombone", "tuba", "euph", "baritone", "flugel")


def _is_brass(name):
    nm = name.lower()
    return any(b in nm for b in BRASS) and "english" not in nm


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
    # (the lead's stretches in one part)
    stretches, i = [], 0
    while i < len(lead):
        j = i
        while j + 1 < len(lead) and lead[j + 1].get("staff") == lead[i].get("staff") and float(lead[j + 1]["start"]) - float(lead[j]["end"]) < 0.5:
            j += 1
        seg = lead[i:j + 1]
        ps = [int(x["midi"]) for x in seg]
        if len(seg) >= 4 and max(ps.count(p) for p in set(ps)) >= 0.8 * len(seg):
            stretches.append(seg)
        i = j + 1
    if not stretches:
        return
    phrases = [(st["name"], ph) for st in ctx.staves if not st.get("is_drum") for ph in _phrases(st["notes"])]
    replace = []  # (s0, s1, name, notes)
    for seg in stretches:
        s0, s1 = float(seg[0]["start"]), float(seg[-1]["end"])
        best = None
        for name, ph in phrases:
            if name == seg[0].get("staff") or any(k in name.lower() for k in ("glock", "xylo", "bell", "celesta", "harp", "timp")):
                continue
            inside = [m for m in ph if s0 - 0.05 <= float(m["start"]) < s1]
            if len(inside) < 4:
                continue
            ps = [int(m["midi"]) for m in inside]
            # (3+ different notes -- by pitch class, so the harp's 43 31 43 31 octaves under the ostinato aren't a tune)
            if len({p % 12 for p in ps}) < 3 or max(ps.count(p) for p in set(ps)) > 0.75 * len(inside):
                continue
            # (a tune, not quick figuration: Jupiter 0:47's piccolo arpeggios over the violins' held 86 aren't one)
            ds = sorted(float(m["end"]) - float(m["start"]) for m in inside)
            if ds[len(ds) // 2] < 0.2:
                continue
            b0, b1 = float(inside[0]["start"]), min(s1, max(float(m["end"]) for m in inside))
            cover = sum(min(b1, float(m["end"])) - max(b0, float(m["start"])) for m in inside) / max(1e-6, s1 - s0)
            if cover < 0.6:
                continue
            key = (_is_brass(name), sorted(ps)[len(ps) // 2])
            if best is None or key > best[0]:
                best = (key, name, inside)
        if best is not None:
            _, name, inside = best
            replace.append((float(inside[0]["start"]) - 0.02, s1 - 0.02, name, inside))
            print(f"    -> tune over repeated notes at {s0:.2f}-{s1:.2f}s (score): {name} over {seg[0].get('staff')}'s {seg[0]['midi']}s")
    if not replace:
        return
    out = [x for x in lead if not any(a <= float(x["start"]) < b for a, b, _n, _i in replace)]
    for _a, _b, name, inside in replace:
        out.extend(dict(m, staff=name) for m in inside)
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
