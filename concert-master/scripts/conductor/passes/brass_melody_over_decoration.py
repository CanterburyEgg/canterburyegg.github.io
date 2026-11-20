"""Brass melody over decoration: when the lead is woodwind (or string) decoration and a brass part plays a real melody
at the same time, the brass melody leads.

Decoration: a stretch of the lead in one non-brass part, 6+ quick notes (median 0.22s or shorter) that keep coming back
to the same few pitches -- arpeggios and riffs going round (Jupiter 7:05: the woodwinds' 84 79 76 72 67 72 76 79 ...).
A brass melody: a brass part -- trumpets, cornets, horns, trombones, euphonium/baritone, tubas (not the English horn) --
playing at least 3 notes there with a median length of 0.3s+, at least 3 different pitches and not mostly one repeated
note, sounding through most of the stretch (60%+). Its notes replace the decoration; with several, the one covering
the highest line wins (trumpets over a trombone counter-line), and it leads only from its first note to its last. A lead that's a bass line -- an octave or more under the brass melody sounding over it (7:27: the bass clarinet's
low notes under the trumpets' broad tune) -- gives way too. Woodwind melodies -- longer notes in the tune's register,
or a line that doesn't circle -- aren't decoration and keep the lead.
"""

BRASS = ("trumpet", "cornet", "horn", "trombone", "tuba", "euph", "baritone", "flugel")


def _is_brass(name):
    nm = name.lower()
    return any(b in nm for b in BRASS) and "english" not in nm


def _circling(ns):
    # most notes repeat a pitch heard in the 8 notes before (a cell of up to 8 going round)
    rep = sum(1 for i, m in enumerate(ns) if any(int(m["midi"]) == int(x["midi"]) for x in ns[max(0, i - 8):i]))
    return rep >= 0.4 * len(ns)


def _doubled(ns, others):
    # how many non-brass parts double most of the phrase (same pitch class at the same moment)
    cnt = 0
    for st in others:
        hit = sum(1 for m in ns if any(abs(float(x["start"]) - float(m["start"])) <= 0.03 and (int(x["midi"]) - int(m["midi"])) % 12 == 0
                                       for x in st["notes"]))
        if hit >= 0.7 * len(ns):
            cnt += 1
    return cnt


def run(ctx):
    # (exact scores only for now: the locked PDF charts follow approved woodwind riffs in places -- backlog)
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    brass = [st for st in ctx.staves if not st.get("is_drum") and _is_brass(st["name"])]
    others = [st for st in ctx.staves if not st.get("is_drum") and not _is_brass(st["name"])]
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out, i, changed = [], 0, 0
    while i < len(lead):
        if _is_brass(str(lead[i].get("staff", ""))):
            out.append(lead[i])
            i += 1
            continue
        j = i
        quick = lambda x: float(x["end"]) - float(x["start"]) <= 0.25 and not _is_brass(str(x.get("staff", "")))
        # (one part's stretch -- or quick decoration handed from one woodwind to another without a break)
        while j + 1 < len(lead) and float(lead[j + 1]["start"]) - float(lead[j]["end"]) < 0.3 and \
                (lead[j + 1].get("staff") == lead[i].get("staff") or (quick(lead[j]) and quick(lead[j + 1]))):
            j += 1
        seg = lead[i:j + 1]
        durs = sorted(float(x["end"]) - float(x["start"]) for x in seg)
        # (going round, or leaping about like an arpeggio -- steps averaging a 4th or more)
        leaps = sum(abs(int(seg[q + 1]["midi"]) - int(seg[q]["midi"])) for q in range(len(seg) - 1)) / max(1, len(seg) - 1)
        # (or sweeping one way: a quick scale or arpeggio run up or down)
        sweep = all((int(seg[q + 1]["midi"]) - int(seg[q]["midi"])) * (int(seg[1]["midi"]) - int(seg[0]["midi"])) > 0 for q in range(len(seg) - 1))
        riff = durs[len(durs) // 2] <= 0.22 and ((len(seg) >= 6 and (_circling(seg) or leaps >= 6)) or (len(seg) >= 4 and sweep))
        # (or a bass line: the lead sitting an octave+ under a brass melody that's sounding over it)
        seg_mid = sorted(int(x["midi"]) for x in seg)[len(seg) // 2]
        if not riff and len(seg) < 3:
            out.extend(seg)
            i = j + 1
            continue
        s0, s1 = float(seg[0]["start"]), float(seg[-1]["end"])
        best = None
        phrases = []
        for st in brass:
            # (a phrase may start a little before the riff or carry on past it: 2s either side)
            alln = sorted((m for m in st["notes"] if s0 - 2.0 <= float(m["start"]) < s1 + 2.0), key=lambda m: float(m["start"]))
            # (the part's phrases there: split at a rest of 0.5s+ or where it starts hammering one note -- a fanfare on
            # one pitch isn't a melody)
            cur = []
            _quick = lambda x: float(x["end"]) - float(x["start"]) < 0.45
            for m in alln:
                # (same-pitch run at the end of the phrase so far)
                run_n = 0
                while run_n < len(cur) and int(cur[-1 - run_n]["midi"]) == int(cur[-1]["midi"]):
                    run_n += 1
                rep = bool(cur) and int(m["midi"]) == int(cur[-1]["midi"])
                if cur and float(m["start"]) - float(cur[-1]["end"]) > 0.5:
                    phrases.append((st, cur))
                    cur = []
                elif rep and run_n == 2 and len(cur) > 2 and all(_quick(x) for x in cur[-2:] + [m]):
                    # (a third quick strike of one note: a hammered run starts -- it becomes its own phrase. Broad
                    # repeated notes are still the tune: 7:33's trumpets 73 | 75 75 75 at almost a second each)
                    phrases.append((st, cur[:-2]))
                    cur = cur[-2:]
                elif not rep and run_n >= 3 and all(_quick(x) for x in cur[-run_n:]):
                    # (a hammered run ends)
                    phrases.append((st, cur))
                    cur = []
                cur.append(m)
            if cur:
                phrases.append((st, cur))
        for st, ns in phrases:
            if len(ns) < 3:
                continue
            nd = sorted(float(m["end"]) - float(m["start"]) for m in ns)
            pitches = [int(m["midi"]) for m in ns]
            top_share = max(pitches.count(p) for p in set(pitches)) / len(pitches)
            # (a phrase overlapping the riff; a low one -- below middle C -- needs 4+ different notes to be a melody
            # rather than a bass pattern like 7:02's bass trombones 53 53 48 48)
            if float(ns[-1]["end"]) <= s0 + 0.05 or float(ns[0]["start"]) >= s1 - 0.05:
                continue
            low = sorted(pitches)[len(pitches) // 2] < 60
            # (or a brass fanfare: 8+ strikes hammering one or two notes in a rhythm -- 7:41's repeated C)
            fanfare = len(ns) >= 8 and len(set(pitches)) <= 2 and len({round(float(m["end"]) - float(m["start"]), 2) for m in ns}) >= 2
            # (a pedal held for ages -- 7:20's horns on 66 for 15s -- isn't a line)
            if nd[-1] > 4.0:
                continue
            if not fanfare and (nd[len(nd) // 2] < 0.3 or len(set(pitches)) < (4 if low else 3) or top_share > 0.75):
                continue
            # (a brass line, not the whole band's bass line -- three or more woodwind/string parts doubling it -- unless the
            # woodwinds are only decorating: 7:20's slow low line 39 42 44 47 under the flute and clarinet runs is
            # what you follow, but 7:00's low 55 57 58 stays under the woodwinds' answer 67 72 77)
            # (...and then only a slow-moving one, half-second notes and longer)
            # (...but a brass part playing the very tune the lead has -- the same notes or an octave away, struck with it
            # -- is the brass carrying that tune on, and it leads: Mars 4:45, the third and fourth trumpets take up the
            # woodwinds' 76 74 73 74 79 ... an octave down while the first two hold a chord; user, Nov 19: "picked up a
            # held note instead of the brass continuation of the melody")
            # (over the lead's notes while this phrase plays)
            span = [x for x in seg if float(ns[0]["start"]) - 0.02 <= float(x["start"]) < float(ns[-1]["end"]) - 0.02]
            tune = sum(1 for x in span if any(abs(float(m["start"]) - float(x["start"])) <= 0.03 and (int(m["midi"]) - int(x["midi"])) % 12 == 0 for m in ns))
            # (a tune that moves -- a part doubling a one-note ostinato isn't carrying a melody: 1:29's repeated 84s)
            carries = len(span) >= 4 and tune >= 0.7 * len(span) and len({int(x["midi"]) for x in span}) >= 3 and not fanfare
            if not carries and _doubled(ns, others) >= 3 and (not riff or nd[len(nd) // 2] < 0.45):
                continue
            # (a phrase of 1.5s+ that sounds through most of its own span)
            b0, b1 = float(ns[0]["start"]), float(ns[-1]["end"])
            if b1 - b0 < 1.5:
                continue
            cover = sum(min(b1, float(m["end"])) - max(b0, float(m["start"])) for m in ns) / (b1 - b0)
            if cover < 0.6:
                continue
            if not riff and not carries and sorted(pitches)[len(pitches) // 2] < seg_mid + 12:
                continue
            # (the tune is the top brass line: trumpets over a trombone counter-line, unless only low brass plays)
            key = (carries, sorted(pitches)[len(pitches) // 2], round(cover, 2), b0)
            if best is None:
                best = []
            best.append((key, st["name"], ns))
        if not best:
            out.extend(seg)
        else:
            # (the highest phrases first; each takes its own stretch, no overlaps)
            taken = []
            for _, name, ns in sorted(best, key=lambda b_: b_[0], reverse=True):
                b0, b1 = float(ns[0]["start"]), float(ns[-1]["end"])
                if any(b0 < t1 - 0.02 and t0 < b1 - 0.02 for t0, t1, _n, _s in taken):
                    continue
                taken.append((b0, b1, name, ns))
            seg_ids = {id(x) for x in seg}
            have = [(float(x["start"]), int(x["midi"])) for x in lead if id(x) not in seg_ids]
            for b0, b1, name, ns in taken:
                print(f"    -> brass melody over decoration at {b0:.2f}-{b1:.2f}s (score): {name} over {seg[0].get('staff')}'s riff")
                # (inside the riff's stretch, or just before it where nothing else plays -- 7:20: the low line from 522.94)
                prev_end = max([float(x["end"]) for x in lead if id(x) not in seg_ids and float(x["start"]) < s0] or [-1e9])
                # (...up to the next note the lead already plays after the riff)
                next_start = min([float(x["start"]) for x in lead if id(x) not in seg_ids and float(x["start"]) >= s1 - 0.02] or [s1])
                out.extend(dict(m, staff=name) for m in ns
                           if float(m["start"]) < next_start - 0.02 and float(m["start"]) >= min(s0, max(s0 - 2.0, prev_end - 0.02))
                           and not any(abs(float(m["start"]) - t) <= 0.03 and int(m["midi"]) == md for t, md in have))
            # (the riff stays outside the brass phrases)
            out.extend(x for x in seg if not any(b0 - 0.02 <= float(x["start"]) < b1 - 0.02 for b0, b1, _n, _s in taken))
            changed += 1
        i = j + 1
    out.sort(key=lambda x: float(x["start"]))
    ctx.lead_notes = out
