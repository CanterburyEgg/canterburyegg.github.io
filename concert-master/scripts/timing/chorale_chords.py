"""Chorale chords (exact scores): a slow stretch where the harmony moves in step with the tune plays as chords.

In a slow passage, when 3+ other parts strike a different note together with each tune note, in the same rhythm (each
lasting within 30% of the tune note), for 3+ tune notes in a row (each 0.4s+), the band is playing a chorale under
the tune (Jupiter 3:39-3:43: 75 74 72 70 75 67 over the woodwinds' and horns' moving harmony). Those notes join the
chord hits, so Hard adds a second key on the other hand, chosen from the harmony struck with them (the nearest chord
tone above and below, like the ensemble hits). MusicXML scores only: the locked PDF charts keep their approved chords.
"""

SKIP = ("perc", "timp", "drum", "mallet", "bells", "glock", "xylo", "chime", "vib", "marimba", "harp")


def run(ns):
    warped = ns.get("warped")
    mo = ns.get("melody_out")
    staves = ns.get("staves")
    score_path = ns.get("score_path")
    hits = ns.get("chord_hits")
    if not isinstance(warped, list) or not isinstance(mo, list) or not isinstance(staves, list) or not isinstance(hits, list):
        return
    if score_path is None or score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    parts = [st for st in staves if not st.get("is_drum") and not any(x in st["name"].lower() for x in SKIP)]
    n = min(len(mo), len(warped))

    def harmony(k):
        s0, d, m = float(warped[k]["score_start"]), float(warped[k]["score_dur"]), int(mo[k][2])
        # (a tune note cut short where the next line picks up inside it -- Mars 0:52's trumpet 75, cut at the
        # euphoniums' 60 -- still has its chord: the harmony struck with it may run on past the cut)
        nxt = float(warped[k + 1]["score_start"]) if k + 1 < n else 1e9
        cut = nxt - (s0 + d) < 0.05
        out = []
        for st in parts:
            if st["name"] == warped[k].get("staff"):
                continue
            for x in st["notes"]:
                xd = float(x["end"]) - float(x["start"])
                fits = abs(xd - d) <= 0.3 * d + 0.03 or (cut and d < xd <= 1.6 * d)
                if abs(float(x["start"]) - s0) <= 0.03 and fits and (int(x["midi"]) - m) % 12:
                    out.append(int(x["midi"]))
                    break
        return out

    harm = [harmony(k) if float(warped[k]["score_dur"]) >= 0.4 else [] for k in range(n)]
    have = {round(float(h[0]), 2) for h in hits}
    added = 0
    k = 0
    while k < n:
        j = k
        while j < n and len(harm[j]) >= 3:
            j += 1
        if j - k >= 3:
            for q in range(k, j):
                t, m = round(float(mo[q][0]), 4), int(mo[q][2])
                if round(t, 2) in have:
                    continue
                up = [p for p in harm[q] if p > m]
                dn = [p for p in harm[q] if p < m]
                hits.append([t, min(up) if up else m + 7, max(dn) if dn else m - 5])
                added += 1
            print(f"    -> chorale chords at {float(mo[k][0]):.2f}-{float(mo[j - 1][0]):.2f}s: {j - k} tune notes over moving harmony")
        k = max(j, k + 1)
    if added:
        hits.sort(key=lambda h: float(h[0]))
        ns["chord_hits"] = hits
