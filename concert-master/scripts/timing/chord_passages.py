"""Ensemble passages (song-specific, chosen by ear): stretches where the whole band plays one rhythmic shape together

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    _ = ns.get('_', MISSING)
    _HIT_BRASS = ns.get('_HIT_BRASS', MISSING)
    a_h = ns.get('a_h', MISSING)
    a_ons_raw = ns.get('a_ons_raw', MISSING)
    att = ns.get('att', MISSING)
    beats = ns.get('beats', MISSING)
    best = ns.get('best', MISSING)
    brass = ns.get('brass', MISSING)
    chord_hits = ns.get('chord_hits', MISSING)
    cont = ns.get('cont', MISSING)
    d = ns.get('d', MISSING)
    dn = ns.get('dn', MISSING)
    dt = ns.get('dt', MISSING)
    f = ns.get('f', MISSING)
    f_c = ns.get('f_c', MISSING)
    frac = ns.get('frac', MISSING)
    h = ns.get('h', MISSING)
    have = ns.get('have', MISSING)
    in_all = ns.get('in_all', MISSING)
    j = ns.get('j', MISSING)
    k = ns.get('k', MISSING)
    k_h = ns.get('k_h', MISSING)
    ka = ns.get('ka', MISSING)
    kb = ns.get('kb', MISSING)
    last_p = ns.get('last_p', MISSING)
    loc = ns.get('loc', MISSING)
    m_h = ns.get('m_h', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    mode_all = ns.get('mode_all', MISSING)
    n_hit = ns.get('n_hit', MISSING)
    np = ns.get('np', MISSING)
    nt = ns.get('nt', MISSING)
    orig_t = ns.get('orig_t', MISSING)
    p = ns.get('p', MISSING)
    passages = ns.get('passages', MISSING)
    pitches = ns.get('pitches', MISSING)
    ps = ns.get('ps', MISSING)
    s0 = ns.get('s0', MISSING)
    s1 = ns.get('s1', MISSING)
    score_clock = ns.get('score_clock', MISSING)
    score_path = ns.get('score_path', MISSING)
    snapped = ns.get('snapped', MISSING)
    t_h = ns.get('t_h', MISSING)
    up = ns.get('up', MISSING)
    w_f = ns.get('w_f', MISSING)
    warped = ns.get('warped', MISSING)

    # Ensemble passages (song-specific, chosen by ear): stretches where the whole band plays one rhythmic shape together
    # (Arabesque 2:09-2:18: the brass & low reeds hammer the same F-C pattern). Every note the band attacks together
    # (>= 6 staves, >= 2 brass) is a chord, flagged so the chart plays the same chord on the same keys every time.
    # (a third field "all": every note in the passage is a chord, e.g. What We Do's opening marimba chord hits, which the
    # score only gives as single notes)
    passages = {
        "arabesque": [(129.0, 138.4), (277.5, 282.0)],
        "what-we-do": [(0.0, 18.6, "all")],
        "sound-of-guthix": [(59.9, 104.0, "holds"), (155.9, 200.0, "holds")],  # the choir's held notes are sung chords
    }.get(score_path.stem.lower(), [])
    # "all" passages are struck chords (mallets): each beat strike snaps to the nearest clear audio attack within 0.08s,
    # and quick strikes between two beats (What We Do intro triplets) are spaced by the written rhythm between them
    in_all = [] if score_clock is not None else [k for k in range(n_hit) if any(p[0] <= float(melody_out[k][0]) <= p[1] and len(p) > 2 and p[2] == "all" for p in passages)]
    orig_t = {k: float(melody_out[k][0]) for k in in_all}
    beats = [k for j, k in enumerate(in_all) if j == 0 or orig_t[k] - orig_t[in_all[j - 1]] >= 0.2]
    snapped = {}
    for k in beats:
        f_c = int(round(orig_t[k] / dt))
        w_f = int(round(0.08 / dt))
        best = None
        for f in range(max(2, f_c - w_f), min(len(a_ons_raw) - 2, f_c + w_f + 1)):
            if a_ons_raw[f] >= a_ons_raw[f - 1] and a_ons_raw[f] >= a_ons_raw[f + 1]:
                loc = float(np.median(a_ons_raw[max(0, f - 35) : f + 35])) + 0.12
                if float(a_ons_raw[f]) >= 2.0 * loc and (best is None or abs(f - f_c) < abs(best - f_c)):
                    best = f
        snapped[k] = best * dt if best is not None else orig_t[k]
    for j, k in enumerate(in_all):
        if k in snapped:
            nt = snapped[k]
        else:
            kb = max(b for b in beats if b < k)
            ka = min((b for b in beats if b > k), default=None)
            if ka is None:
                nt = orig_t[k] + (snapped[kb] - orig_t[kb])
            else:
                s0, s1 = float(warped[kb]["score_start"]), float(warped[ka]["score_start"])
                frac = (float(warped[k]["score_start"]) - s0) / max(1e-6, s1 - s0)
                nt = snapped[kb] + frac * (snapped[ka] - snapped[kb])
        d = float(melody_out[k][1]) - orig_t[k]
        melody_out[k][0] = round(nt, 4)
        melody_out[k][1] = round(nt + d, 4)
    for k_h in range(n_hit - 1):
        if float(melody_out[k_h][1]) > float(melody_out[k_h + 1][0]) - 0.015:
            melody_out[k_h][1] = round(max(float(melody_out[k_h][0]) + 0.04, float(melody_out[k_h + 1][0]) - 0.015), 4)
    have = {round(h[0], 3) for h in chord_hits}
    last_p = None  # (time, midi) of the last passage hit
    for k_h in range(n_hit):
        t_h = float(melody_out[k_h][0])
        mode_all = any(p[0] <= t_h <= p[1] and len(p) > 2 and p[2] == "all" for p in passages)
        # ("holds": only the held notes in the passage are chords, e.g. Guthix's choir, not the celesta runs between)
        if any(p[0] <= t_h <= p[1] and len(p) > 2 and p[2] == "holds" for p in passages):
            if float(melody_out[k_h][1]) - t_h < 0.5:
                continue
            mode_all = True
        if not any(p[0] <= t_h <= p[1] for p in passages) or round(t_h, 3) in have:
            continue
        a_h = att[k_h]
        brass = sum(any(b in nm for b in _HIT_BRASS) for nm, _ in a_h)
        # (a note restored from the approved chart has only an estimated score position: if it repeats the passage's
        # pitch right after a hit, it's the same band hit)
        cont = last_p is not None and int(melody_out[k_h][2]) == last_p[1] and t_h - last_p[0] < 0.6
        if (len(a_h) < 6 or brass < 2) and not cont and not mode_all:
            continue
        last_p = (t_h, int(melody_out[k_h][2]))
        m_h = int(melody_out[k_h][2])
        pitches = sorted({p for _, ps in a_h for p in ps})
        up = [p for p in pitches if p > m_h and (p - m_h) % 12]
        dn = [p for p in pitches if p < m_h and (m_h - p) % 12]
        chord_hits.append([round(t_h, 4), min(up) if up else m_h + 7, max(dn) if dn else m_h - 5, 1])
    chord_hits.sort(key=lambda h: h[0])

    if _ is not MISSING:
        ns['_'] = _
    if a_h is not MISSING:
        ns['a_h'] = a_h
    if beats is not MISSING:
        ns['beats'] = beats
    if best is not MISSING:
        ns['best'] = best
    if brass is not MISSING:
        ns['brass'] = brass
    if cont is not MISSING:
        ns['cont'] = cont
    if d is not MISSING:
        ns['d'] = d
    if dn is not MISSING:
        ns['dn'] = dn
    if f is not MISSING:
        ns['f'] = f
    if f_c is not MISSING:
        ns['f_c'] = f_c
    if frac is not MISSING:
        ns['frac'] = frac
    if h is not MISSING:
        ns['h'] = h
    if have is not MISSING:
        ns['have'] = have
    if in_all is not MISSING:
        ns['in_all'] = in_all
    if j is not MISSING:
        ns['j'] = j
    if k is not MISSING:
        ns['k'] = k
    if k_h is not MISSING:
        ns['k_h'] = k_h
    if ka is not MISSING:
        ns['ka'] = ka
    if kb is not MISSING:
        ns['kb'] = kb
    if last_p is not MISSING:
        ns['last_p'] = last_p
    if loc is not MISSING:
        ns['loc'] = loc
    if m_h is not MISSING:
        ns['m_h'] = m_h
    if mode_all is not MISSING:
        ns['mode_all'] = mode_all
    if nt is not MISSING:
        ns['nt'] = nt
    if orig_t is not MISSING:
        ns['orig_t'] = orig_t
    if p is not MISSING:
        ns['p'] = p
    if passages is not MISSING:
        ns['passages'] = passages
    if pitches is not MISSING:
        ns['pitches'] = pitches
    if ps is not MISSING:
        ns['ps'] = ps
    if s0 is not MISSING:
        ns['s0'] = s0
    if s1 is not MISSING:
        ns['s1'] = s1
    if snapped is not MISSING:
        ns['snapped'] = snapped
    if t_h is not MISSING:
        ns['t_h'] = t_h
    if up is not MISSING:
        ns['up'] = up
    if w_f is not MISSING:
        ns['w_f'] = w_f
