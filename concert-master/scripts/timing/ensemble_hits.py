"""Ensemble hits: a melody note the band attacks together as a real chord (>= 8 staves, >= 2 of them brass, >= 3

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    _ = ns.get('_', MISSING)
    _HIT_BRASS = ns.get('_HIT_BRASS', MISSING)
    _HIT_SKIP = ns.get('_HIT_SKIP', MISSING)
    _attack = ns.get('_attack', MISSING)
    a_h = ns.get('a_h', MISSING)
    att = ns.get('att', MISSING)
    brass = ns.get('brass', MISSING)
    chord_hits = ns.get('chord_hits', MISSING)
    ctx = ns.get('ctx', MISSING)
    dn = ns.get('dn', MISSING)
    gn = ns.get('gn', MISSING)
    gp = ns.get('gp', MISSING)
    hit_staves = ns.get('hit_staves', MISSING)
    j = ns.get('j', MISSING)
    k = ns.get('k', MISSING)
    k_h = ns.get('k_h', MISSING)
    m_h = ns.get('m_h', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    n_hit = ns.get('n_hit', MISSING)
    n_st = ns.get('n_st', MISSING)
    p = ns.get('p', MISSING)
    pitches = ns.get('pitches', MISSING)
    ps = ns.get('ps', MISSING)
    st = ns.get('st', MISSING)
    staves = ns.get('staves', MISSING)
    t_h = ns.get('t_h', MISSING)
    up = ns.get('up', MISSING)
    warped = ns.get('warped', MISSING)

    # Ensemble hits: a melody note the band attacks together as a real chord (>= 8 staves, >= 2 of them brass, >= 3
    # pitch classes) that stands out from what came just before it (the busiest attack in the previous second has at
    # most half as many staves), and that the ear hears as the whole band's moment (>= 0.9s before the melody moves on). E.g. Ride 3:11-3:15: the horn hits and the final
    # chord. The chart adds a second key on the other hand; we pass the nearest chord tones above & below the melody.
    _HIT_SKIP = ("perc", "timp", "drum", "mallet", "bells", "glock", "xylo", "chime", "vib", "marimba")
    _HIT_BRASS = ("trumpet", "horn", "trombone", "euph", "tuba", "bb bass", "flugel", "cornet")
    hit_staves = [st for st in staves if not any(x in st["name"].lower() for x in _HIT_SKIP)]

    def _attack(s0):
        found = []
        for st in hit_staves:
            ps = [int(n["midi"]) for n in st["notes"] if abs(float(n["start"]) - s0) < 0.04]
            if ps:
                found.append((st["name"].lower(), ps))
        return found

    n_hit = min(len(melody_out), len(warped))
    att = [_attack(float(warped[k]["score_start"])) for k in range(n_hit)]
    chord_hits = []
    for k_h in range(n_hit):
        t_h = float(melody_out[k_h][0])
        a_h = att[k_h]
        n_st = len(a_h)
        if n_st < 8:
            continue
        brass = sum(any(b in nm for b in _HIT_BRASS) for nm, _ in a_h)
        pitches = sorted({p for _, ps in a_h for p in ps})
        if brass < 2 or len({p % 12 for p in pitches}) < 3:
            continue
        gp = t_h - float(melody_out[k_h - 1][0]) if k_h else 9.0
        gn = float(melody_out[k_h + 1][0]) - t_h if k_h + 1 < n_hit else 9.0
        # the band IS the moment: nothing else moves for a beat after the hit (held, or a stab with space after it).
        # A hit inside a flowing melody (woodwind tune, brass changing chord underneath; a solo with band hits behind
        # it) is still the melody's moment, not the ensemble's: no chord.
        if gp < 0.25 or gn < 0.9:
            continue
        ctx = max([len(att[j]) for j in range(k_h) if t_h - float(melody_out[j][0]) <= 1.0] or [0])
        if ctx > 0.5 * n_st:
            continue
        m_h = int(melody_out[k_h][2])
        up = [p for p in pitches if p > m_h and (p - m_h) % 12]
        dn = [p for p in pitches if p < m_h and (m_h - p) % 12]
        chord_hits.append([round(t_h, 4), min(up) if up else m_h + 7, max(dn) if dn else m_h - 5])

    if _ is not MISSING:
        ns['_'] = _
    if _HIT_BRASS is not MISSING:
        ns['_HIT_BRASS'] = _HIT_BRASS
    if _HIT_SKIP is not MISSING:
        ns['_HIT_SKIP'] = _HIT_SKIP
    if _attack is not MISSING:
        ns['_attack'] = _attack
    if a_h is not MISSING:
        ns['a_h'] = a_h
    if att is not MISSING:
        ns['att'] = att
    if brass is not MISSING:
        ns['brass'] = brass
    if chord_hits is not MISSING:
        ns['chord_hits'] = chord_hits
    if ctx is not MISSING:
        ns['ctx'] = ctx
    if dn is not MISSING:
        ns['dn'] = dn
    if gn is not MISSING:
        ns['gn'] = gn
    if gp is not MISSING:
        ns['gp'] = gp
    if hit_staves is not MISSING:
        ns['hit_staves'] = hit_staves
    if j is not MISSING:
        ns['j'] = j
    if k is not MISSING:
        ns['k'] = k
    if k_h is not MISSING:
        ns['k_h'] = k_h
    if m_h is not MISSING:
        ns['m_h'] = m_h
    if n_hit is not MISSING:
        ns['n_hit'] = n_hit
    if n_st is not MISSING:
        ns['n_st'] = n_st
    if p is not MISSING:
        ns['p'] = p
    if pitches is not MISSING:
        ns['pitches'] = pitches
    if ps is not MISSING:
        ns['ps'] = ps
    if st is not MISSING:
        ns['st'] = st
    if t_h is not MISSING:
        ns['t_h'] = t_h
    if up is not MISSING:
        ns['up'] = up
