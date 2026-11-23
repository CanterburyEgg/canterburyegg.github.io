"""A relay line: where the music is one stream of quick notes handed from part to part with no melody over it (each
part takes the line up on the note the last one finished on, or the next one -- Mercury's opening: bassoons and cellos
41 46 50 52 47 44 50, violas 53 58 62 64, clarinets 64 59 56 62, flutes and violins 65 70 74 76 71 68 81 ...), the lead
follows the stream the whole way, part to part, instead of jumping to whichever part the windows picked and leaving
holes at the handovers (user, Nov 21: "the moving line jumps from part to part and there's no clear melody ... all I
hear is the moving line. I'd like to just be playing that").

The stream: the quick notes (0.15s or shorter) of every pitched part, slot by slot; at each slot the part already
carrying it keeps it if it plays there, otherwise the part that runs on longest from that slot takes it (a part that
only strikes now and then -- a chord on the beat -- loses to the one running). It counts where it runs 3s+ without a
break of more than 0.3s, and is laid over a stretch of the lead that's mostly quick notes (no tune of its own).
Exact scores only.
"""

PERC = ("timp", "drum", "cymb", "gong", "glock", "xylo", "bell", "celesta", "tam", "triangle", "percus", "harp", "organ")


def run(ctx):
    if ctx.score_path is None or ctx.score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    staves = [st for st in ctx.staves if not st.get("is_drum") and not any(k in st["name"].lower() for k in PERC)]
    quick = {}
    for st in staves:
        for m in st["notes"]:
            if float(m["end"]) - float(m["start"]) <= 0.15:
                quick.setdefault(st["name"], []).append(m)
    for nm in quick:
        quick[nm].sort(key=lambda m: float(m["start"]))

    # (the sweeps -- quick rising scale runs, 4+ notes a step at a time, a tenth of a second apart -- and which of them
    # hand on to each other as one glissando: the next part starting on the note the last one reached, or a step above,
    # as it gets there)
    def sweep_runs():
        out = []
        for nm, ns in quick.items():
            r = []
            for m in ns + [None]:
                if m is not None and r and float(m["start"]) - float(r[-1]["start"]) <= 0.11 and \
                        float(r[-1]["end"]) - float(r[-1]["start"]) <= 0.11 and 1 <= int(m["midi"]) - int(r[-1]["midi"]) <= 2:
                    r.append(m)
                    continue
                if len(r) >= 4:
                    out.append((nm, r))
                r = [m] if m is not None else []
        return sorted(out, key=lambda nr: float(nr[1][0]["start"]))

    def linked(p, q):
        return p[0] != q[0] and 0 <= int(q[1][0]["midi"]) - int(p[1][-1]["midi"]) <= 2 and \
            -0.02 <= float(q[1][0]["start"]) - float(p[1][-1]["start"]) <= 0.13

    all_sweeps = sweep_runs()
    in_chain = set()
    for i, p in enumerate(all_sweeps):
        for q in all_sweeps[i + 1:]:
            if linked(p, q):
                in_chain.add(id(p[1]))
                in_chain.add(id(q[1]))
    # (a sweep on its own, under a triplet figure -- a part's notes an eighth of a beat apart, 3+ in a row, while it plays --
    # is the texture, not the line: the stream follows the figures there -- Mercury 2:23, the clarinets' 69 64 61 64 59 56
    # with the violas', cor anglais' and second violins' sweeps going up around them; user, Nov 22: "I'm hearing triplets
    # here, but being asked to play a sweep. I want to follow the triplet line that seems to lead this section")
    def figure_near(a, b):
        for nm, ns in quick.items():
            fig = [m for m in ns if 0.1 < float(m["end"]) - float(m["start"]) <= 0.15 and a - 0.02 <= float(m["start"]) <= b + 0.02]
            if sum(1 for j in range(1, len(fig)) if float(fig[j]["start"]) - float(fig[j - 1]["start"]) <= 0.15) >= 2:
                return True
        return False
    drop = set()
    for nm, r in all_sweeps:
        if id(r) not in in_chain and figure_near(float(r[0]["start"]), float(r[-1]["start"])):
            drop.update(id(m) for m in r)
    if drop:
        quick = {nm: [m for m in ns if id(m) not in drop] for nm, ns in quick.items()}
        quick = {nm: ns for nm, ns in quick.items() if ns}
    slots = sorted({round(float(m["start"]), 2) for ns in quick.values() for m in ns})
    if not slots:
        return

    def at(nm, t):
        return next((m for m in quick[nm] if abs(float(m["start"]) - t) <= 0.02), None)

    def run_len(nm, k):
        n = 0
        while k + n < len(slots) and at(nm, slots[k + n]) is not None and (n == 0 or slots[k + n] - slots[k + n - 1] <= 0.3):
            n += 1
        return n

    alls = [st for st in ctx.staves if not st.get("is_drum")]
    # (the stream, as runs of consecutive slots)
    streams, cur, line = [], None, []
    for k, t in enumerate(slots):
        if line and t - float(line[-1][1]["start"]) > 0.3:
            streams.append(line)
            line, cur = [], None
        cands = [nm for nm in quick if at(nm, t) is not None]
        best = max(cands, key=lambda nm: (run_len(nm, k), max(int(m["midi"]) for m in [at(nm, t)])))
        # (the part carrying the line keeps it -- unless this is only its last note and another part takes the line up
        # right here, running on: the incoming part starts its figure on it, Mercury 0:06's clarinets 74 69 66 | 69 64
        # 61 ... coming in over the second clarinet's last 62; user, Nov 21: "a JKF here that doesn't make much sense")
        # (... or a part enters here and runs on 6+ while the carrier's figure has 3 or fewer notes left: Mercury
        # 0:22, the English horn's 61 54 57 54 coming in under the clarinet's last 69 61 66; user, Nov 21: "this is
        # where I start hearing what's being played again (the back and forth line)")
        entering = k > 0 and at(best, slots[k - 1]) is None and run_len(best, k) >= 6 and run_len(cur, k) <= 3 if cur in cands else False
        if cur in cands and not (run_len(cur, k) <= 1 and run_len(best, k) >= 3) and not entering:
            pick = cur
        else:
            pick = best
        # (a line about to strike its notes twice over gives way to a part moving above it in the same rhythm: over the
        # next four slots the carrier repeats a note, the other part doesn't, runs 4+ on and sits at or above it --
        # Mercury 0:27, the first violins' 73 76 68 73 64 69 61 66 over the second violins' 73 71 68 68 64 64 61 61;
        # user, Nov 21: "that KKJJ section where it becomes briefly unplayable", "let's go with the first violins")
        def window(nm):
            return [at(nm, slots[j]) for j in range(k, min(k + 4, len(slots)))]
        wp = window(pick)
        if len(wp) == 4 and all(wp) and any(int(wp[q]["midi"]) == int(wp[q + 1]["midi"]) for q in range(3)):
            for nm in cands:
                wn = window(nm)
                if nm == pick or len(wn) < 4 or not all(wn) or run_len(nm, k) < 4:
                    continue
                if any(int(wn[q]["midi"]) == int(wn[q + 1]["midi"]) for q in range(3)):
                    continue
                if sum(1 for q in range(4) if int(wn[q]["midi"]) >= int(wp[q]["midi"])) >= 3:
                    pick = nm
                    break
        # (a doubled figure over the line takes it: a part 3+ semitones above the carrier, its note doubled at the
        # unison or octave by 3+ other parts -- Mercury 0:25, flutes, first violins and harp 81 73 76 . 81 73 76 over
        # the second violins' runs 76 73 71 68; user, Nov 21: "it's definitely not the runs")
        # (the figure only shows on top: the part carrying the line keeps carrying it underneath, and takes the line
        # back when the figure rests)
        cur = pick
        top = at(pick, t)
        for nm in cands:
            m = at(nm, t)
            # (a figure: a short cell, 4 notes or fewer before it breaks, played over and over -- this note comes round
            # twice more within a second or so -- and not the carrier's note an octave up)
            if nm == pick or int(m["midi"]) < int(top["midi"]) + 3 or run_len(nm, k) > 4:
                continue
            if (int(m["midi"]) - int(top["midi"])) % 12 == 0:
                continue
            again = sum(1 for x in quick[nm] if int(x["midi"]) == int(m["midi"]) and 0.2 <= abs(float(x["start"]) - t) <= 1.2)
            if again < 2:
                continue
            dbl = sum(1 for o in alls if o["name"] != nm and any(abs(float(x["start"]) - t) <= 0.03 and
                      (int(x["midi"]) - int(m["midi"])) % 12 == 0 for x in o["notes"]))
            if dbl >= 3 and int(m["midi"]) > int(at(pick, t)["midi"]):
                pick, top = nm, m
        line.append((pick, at(pick, t)))
    if line:
        streams.append(line)
    # (glissandos ride on through: quick rising scale runs -- 4+ notes, a step at a time, a tenth of a second apart --
    # are followed run to run, each taking over where the one before ends, instead of the stream hopping part to part
    # note by note where several voices sweep up a few notes apart -- Mercury 2:20, the violas' 48 50 51 52, the cor
    # anglais' 58 ... 64, the second violins' 64 ... 70, then 2:23's 58 60 62 63 64 | 64 66 68 69 70 | 70 72 74 75 76 |
    # 76 78 ...; user, Nov 22: "I'm hearing mostly glissandos, but what I play seems super random")
    runs = []
    for st in staves:
        ns = sorted(quick.get(st["name"], []), key=lambda m: float(m["start"]))
        r = []
        for m in ns + [None]:
            ok = m is not None and r and float(m["start"]) - float(r[-1]["start"]) <= 0.11 and float(r[-1]["end"]) - float(r[-1]["start"]) <= 0.11 \
                and 1 <= int(m["midi"]) - int(r[-1]["midi"]) <= 2
            if ok:
                r.append(m)
                continue
            if len(r) >= 4:
                runs.append((st["name"], r))
            r = [m] if m is not None else []
    runs.sort(key=lambda nr: float(nr[1][0]["start"]))
    for li, line in enumerate(streams):
        l0, l1 = float(line[0][1]["start"]), float(line[-1][1]["start"])
        chosen, cur_end, cur_top = [], -1.0, -1
        for nm, r in runs:
            r0 = float(r[0]["start"])
            if not (l0 - 0.02 <= r0 <= l1 + 0.02):
                continue
            if r0 >= cur_end - 0.02 + 0.13:
                chosen.append((nm, list(r)))
            else:
                # (a voice already sweeping up when this one's run ends carries it on from the next note above)
                rest = [m for m in r if float(m["start"]) > cur_end + 0.06 and int(m["midi"]) > cur_top]
                if not rest:
                    continue
                chosen.append((nm, rest))
            cur_end, cur_top = float(chosen[-1][1][-1]["start"]), int(chosen[-1][1][-1]["midi"])
        if not chosen:
            continue
        # (a glissando is runs taken up part to part, each starting on the note the last one reached or a step above it
        # -- 2+ runs in a chain; a lone run is the stream's own business, and so are runs it already follows)
        chains, cur_c = [], []
        for c in chosen:
            if cur_c and linked(cur_c[-1], c):
                cur_c.append(c)
                continue
            if len(cur_c) >= 2:
                chains.append(cur_c)
            cur_c = [c]
        if len(cur_c) >= 2:
            chains.append(cur_c)
        chosen = [c for ch in chains for c in ch]

        def same(nm_r):
            a, b = float(nm_r[1][0]["start"]) - 0.02, float(nm_r[1][-1]["start"]) + 0.02
            have = sorted((round(float(m["start"]), 2), int(m["midi"])) for _nm, m in line if a <= float(m["start"]) <= b)
            return have == sorted((round(float(m["start"]), 2), int(m["midi"])) for m in nm_r[1])
        if all(same(c) for c in chosen):
            continue
        spans = []
        for _nm, r in chosen:
            a, b = float(r[0]["start"]) - 0.02, float(r[-1]["start"]) + 0.07
            if spans and a - spans[-1][1] <= 0.3:
                spans[-1] = (spans[-1][0], b)
            else:
                spans.append((a, b))
        keep = [(nm, m) for nm, m in line if not any(a <= float(m["start"]) <= b for a, b in spans)]
        keep += [(nm, m) for nm, r in chosen for m in r]
        keep.sort(key=lambda nm_m: float(nm_m[1]["start"]))
        streams[li] = keep

    # (a line that lands on a held note lands held: its last note struck with the same pitch held in another part --
    # Mercury 0:32, the piccolo's run up to 100 with the first violins holding that 100; user, Nov 21: "that last
    # flute note is held all the way through, and I should play that")
    for line in streams:
        nm, last = line[-1]
        t = float(last["start"])
        held = [(o["name"], x) for o in alls for x in o["notes"] if abs(float(x["start"]) - t) <= 0.03 and
                int(x["midi"]) == int(last["midi"]) and float(x["end"]) - float(x["start"]) > 0.3]
        if held:
            line[-1] = max(held, key=lambda h: float(h[1]["end"]))

    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    # (a tune inside the stream keeps the lead: notes a quaver or more apart, 4+ in a row, either what the lead already
    # plays there or a part the band doubles -- Mercury 0:15, the oboes' 82 79 81 75 79 77 under the piccolos' quick
    # arpeggios; 0:25, the flutes and first violins' 81 73 76 . 81 73 76 over the second violins' runs; user, Nov 21:
    # "here I'm hearing the flute eighth notes, not the moving decoration", "definitely not the runs")
    def tune_runs(ns):
        ns = sorted(ns, key=lambda m: float(m["start"]))
        runs, cur_r = [], []
        for m in ns:
            if cur_r and not (0.2 <= float(m["start"]) - float(cur_r[-1]["start"]) <= 0.5 and float(m["end"]) - float(m["start"]) <= 0.3):
                if len(cur_r) >= 4:
                    runs.append(cur_r)
                cur_r = []
            cur_r.append(m)
        if len(cur_r) >= 4:
            runs.append(cur_r)
        return runs
    stream_notes = [m for line in streams for _nm, m in line]

    def above_stream(r):
        a0, a1 = float(r[0]["start"]), float(r[-1]["end"])
        sl = sorted(int(m["midi"]) for m in stream_notes if a0 - 0.02 <= float(m["start"]) < a1)
        rm = sorted(int(m["midi"]) for m in r)[len(r) // 2]
        return bool(sl) and rm >= sl[len(sl) // 2] + 3

    def trim_flourish(r):
        # (a tune starts on its first note the stream doesn't run up to: a quick run between its first two notes is
        # the flourish into it, played -- Mercury 0:15, the piccolo's 88 90 92 93 up to the first violins' 94; user,
        # Nov 21: "I still hear flourish there, I think just a DFJ up to that top K")
        while len(r) > 4 and float(r[0]["end"]) - float(r[0]["start"]) <= 0.15 and sum(
                1 for m in stream_notes if float(r[0]["start"]) + 0.02 < float(m["start"]) < float(r[1]["start"]) - 0.02) >= 2:
            r = r[1:]
        return r

    # (the lead's own tune, where it sits over the stream -- not a part of the stream itself slowing down: Mercury
    # 0:30, the English horn's 64 . 65 . 68 under the clarinets' and flutes' runs up; user, Nov 21: "suddenly two
    # quarter notes in here, interjecting in the main line")
    tunes = [(None, trim_flourish(r)) for r in tune_runs([x for x in lead if float(x["end"]) - float(x["start"]) <= 0.3])
             if above_stream(r)]
    # (a part's tune, above the stream: doubled by another part, 3+ different notes, and pitched over the line's own
    # notes there -- not the bass's quavers under it)
    for st in staves:
        for r in tune_runs([m for m in st["notes"] if float(m["end"]) - float(m["start"]) <= 0.3]):
            if len({int(m["midi"]) for m in r}) < 3 or not above_stream(r):
                continue
            r = trim_flourish(r)
            dbl = sum(1 for o in alls if o is not st and sum(1 for m in r if any(abs(float(x["start"]) - float(m["start"])) <= 0.03 and (int(x["midi"]) - int(m["midi"])) % 12 == 0 for x in o["notes"])) >= 0.75 * len(r))
            if dbl >= 1:
                tunes.append((st["name"], r))
    # (a tune coming in near the end of the stream and carrying on after it takes over where it comes in: a part's
    # note of a quaver or longer in the stream's last 2s, then 6+ notes in the 3s after the stream, not rocking between
    # two notes, pitched over the stream -- Mercury 1:09, the first violins' 83 . 83 83 83 81 79 79 81 ... coming in
    # over the second violins' 62 66 62 66; user, Nov 21: "I should DEFINITELY be on the flute melody here")
    for line in streams:
        s0, s1 = float(line[0][1]["start"]), float(line[-1][1]["end"])
        med = sorted(int(m["midi"]) for _nm, m in line)[len(line) // 2]
        for st in staves:
            ent = sorted((m for m in st["notes"] if s1 - 2.0 <= float(m["start"]) < s1 - 0.1 and
                          float(m["end"]) - float(m["start"]) >= 0.2), key=lambda m: float(m["start"]))
            if not ent:
                continue
            after = sorted((m for m in st["notes"] if s1 - 0.02 <= float(m["start"]) < s1 + 3.0), key=lambda m: float(m["start"]))
            if len(after) < 6 or len({int(m["midi"]) for m in after}) < 3:
                continue
            rock = sum(1 for q in range(2, len(after)) if int(after[q]["midi"]) == int(after[q - 2]["midi"]) != int(after[q - 1]["midi"]))
            if rock >= 0.5 * (len(after) - 2) or sorted(int(m["midi"]) for m in after)[len(after) // 2] < med + 3:
                continue
            r = sorted((m for m in st["notes"] if float(ent[0]["start"]) - 0.02 <= float(m["start"]) < s1 + 0.5), key=lambda m: float(m["start"]))
            tunes.append((st["name"], r))
    out, laid = list(lead), 0
    for line in streams:
        s0, s1 = float(line[0][1]["start"]), float(line[-1][1]["end"])
        if s1 - s0 < 3.0:
            continue
        under = [x for x in lead if s0 - 0.02 <= float(x["start"]) < s1 - 0.02]
        # (no tune of its own there: the lead is mostly quick notes, or holes)
        if under and sum(1 for x in under if float(x["end"]) - float(x["start"]) <= 0.2) < 0.7 * len(under):
            continue
        # (the tunes inside it, highest first, each over its own span)
        spans = []
        for nm_t, r in sorted(tunes, key=lambda tr: -sorted(int(m["midi"]) for m in tr[1])[len(tr[1]) // 2]):
            a0, a1 = float(r[0]["start"]), float(r[-1]["end"])
            # (tunes that hand over on a shared note -- Mercury 0:16, first violins' 94 91 93 87 91 89 88 into the
            # second violins' 88 85 87 81 85 83 -- both count; only a real overlap rules the lower one out)
            if a1 <= s0 or a0 >= s1 or any(a0 < b1 - 0.15 and b0 < a1 - 0.15 for b0, b1, _n, _r in spans):
                continue
            spans.append((a0, a1, nm_t, r))
        inside = lambda t: any(b0 - 0.02 <= t < b1 - 0.02 for b0, b1, _n, _r in spans)
        out = [x for x in out if not (s0 - 0.02 <= float(x["start"]) < s1 - 0.02) or (inside(float(x["start"])) and
               any(nm_t is None for b0, b1, nm_t, _r in spans if b0 - 0.02 <= float(x["start"]) < b1 - 0.02))]
        out.extend(dict(m, staff=nm) for nm, m in line if not inside(float(m["start"])))
        for b0, b1, nm_t, r in spans:
            if nm_t is not None:
                out = [x for x in out if not (b0 - 0.02 <= float(x["start"]) < b1 - 0.02)]
                out.extend(dict(m, staff=nm_t) for m in r)
                print(f"    -> tune inside the relay at {b0:.2f}-{b1:.2f}s (score): {nm_t}")
        laid += 1
        print(f"    -> relay line at {s0:.2f}-{s1:.2f}s (score): {len(line)} notes across {len({nm for nm, _ in line})} parts")
    if laid:
        out.sort(key=lambda x: float(x["start"]))
        ctx.lead_notes = out
