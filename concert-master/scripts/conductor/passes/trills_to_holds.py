"""Written-out trills: a fast alternation between two neighbouring notes in one part (6+ notes, each 0.16s or less,
back to back, a step of 2 semitones or less) is a trill: one held note on its first (main) note. The score reader
spells trills out note by note, which made the part look busy and melodic (Arabesque 4:42: the trombones' 58-60 trill
under the band; read as 16 quick notes it pulled the lead away from the horns)."""


def run(ctx):
    n_tr = 0
    for st in ctx.staves:
        ns = sorted(st["notes"], key=lambda x: float(x["start"]))
        out, i = [], 0
        while i < len(ns):
            j = i
            while (
                j + 1 < len(ns)
                and float(ns[j]["end"]) - float(ns[j]["start"]) <= 0.16
                and abs(float(ns[j + 1]["start"]) - float(ns[j]["end"])) <= 0.02
                and 0 < abs(int(ns[j + 1]["midi"]) - int(ns[j]["midi"])) <= 2
                and (j == i or int(ns[j + 1]["midi"]) == int(ns[j - 1]["midi"]))
            ):
                j += 1
            if j - i + 1 >= 6 and float(ns[j]["end"]) - float(ns[j]["start"]) <= 0.16:
                out.append(dict(ns[i], end=float(ns[j]["end"])))
                n_tr += 1
                i = j + 1
            else:
                out.append(ns[i])
                i += 1
        st["notes"] = out
    if n_tr:
        print(f"    -> {n_tr} written-out trills held")
