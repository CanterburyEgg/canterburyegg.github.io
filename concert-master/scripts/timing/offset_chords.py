"""Offset chords: when a low section (>= 3 staves, at or below F3, >= 2.0s long, entering together) comes in UNDER a

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a_a = ns.get('a_a', MISSING)
    a_b = ns.get('a_b', MISSING)
    c_t0 = ns.get('c_t0', MISSING)
    chord_notes = ns.get('chord_notes', MISSING)
    e = ns.get('e', MISSING)
    e_s = ns.get('e_s', MISSING)
    ens = ns.get('ens', MISSING)
    entries = ns.get('entries', MISSING)
    k_c = ns.get('k_c', MISSING)
    key = ns.get('key', MISSING)
    m_t0 = ns.get('m_t0', MISSING)
    m_t1 = ns.get('m_t1', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    n = ns.get('n', MISSING)
    n_s = ns.get('n_s', MISSING)
    nm = ns.get('nm', MISSING)
    s_a = ns.get('s_a', MISSING)
    s_b = ns.get('s_b', MISSING)
    se_c = ns.get('se_c', MISSING)
    ss_c = ns.get('ss_c', MISSING)
    st = ns.get('st', MISSING)
    staves = ns.get('staves', MISSING)
    warped = ns.get('warped', MISSING)

    # Offset chords: when a low section (>= 3 staves, at or below F3, >= 2.0s long, entering together) comes in UNDER a
    # held melody note, after it started (e.g. Sevens m.131 at 3:42: low brass & reeds swell in under the trumpets'
    # held A-flat), emit the entry as a chord note so the chart adds a second hold on the other hand.
    chord_notes = []
    for k_c in range(len(melody_out)):
        m_t0, m_t1 = float(melody_out[k_c][0]), float(melody_out[k_c][1])
        if m_t1 - m_t0 < 1.5 or k_c >= len(warped):
            continue
        ss_c = float(warped[k_c]["score_start"])
        se_c = ss_c + float(warped[k_c]["score_dur"])
        entries = {}
        for st in staves:
            nm = st["name"].lower()
            if any(x in nm for x in ("perc", "timp", "drum", "mallet")):
                continue
            for n in st["notes"]:
                n_s = float(n["start"])
                if n["midi"] <= 53 and float(n["end"]) - n_s >= 2.0 and ss_c + 0.15 < n_s < se_c - 1.0:
                    key = round(n_s, 1)
                    entries.setdefault(key, []).append(n)
        for key, ens in sorted(entries.items()):
            if len({id(e) for e in ens}) < 3:
                continue
            e_s = min(float(e["start"]) for e in ens)
            # map score time -> audio time locally between this held note and the next melody note
            if k_c + 1 < len(warped):
                s_a, s_b = ss_c, float(warped[k_c + 1]["score_start"])
                a_a, a_b = m_t0, float(melody_out[k_c + 1][0])
                c_t0 = a_a + (e_s - s_a) * (a_b - a_a) / max(1e-6, s_b - s_a)
            else:
                c_t0 = m_t0 + (e_s - ss_c)
            if m_t0 + 0.15 < c_t0 < m_t1 - 0.5:
                chord_notes.append([round(c_t0, 4), round(m_t1, 4), int(max(e["midi"] for e in ens))])
            break

    if a_a is not MISSING:
        ns['a_a'] = a_a
    if a_b is not MISSING:
        ns['a_b'] = a_b
    if c_t0 is not MISSING:
        ns['c_t0'] = c_t0
    if chord_notes is not MISSING:
        ns['chord_notes'] = chord_notes
    if e is not MISSING:
        ns['e'] = e
    if e_s is not MISSING:
        ns['e_s'] = e_s
    if ens is not MISSING:
        ns['ens'] = ens
    if entries is not MISSING:
        ns['entries'] = entries
    if k_c is not MISSING:
        ns['k_c'] = k_c
    if key is not MISSING:
        ns['key'] = key
    if m_t0 is not MISSING:
        ns['m_t0'] = m_t0
    if m_t1 is not MISSING:
        ns['m_t1'] = m_t1
    if n is not MISSING:
        ns['n'] = n
    if n_s is not MISSING:
        ns['n_s'] = n_s
    if nm is not MISSING:
        ns['nm'] = nm
    if s_a is not MISSING:
        ns['s_a'] = s_a
    if s_b is not MISSING:
        ns['s_b'] = s_b
    if se_c is not MISSING:
        ns['se_c'] = se_c
    if ss_c is not MISSING:
        ns['ss_c'] = ss_c
    if st is not MISSING:
        ns['st'] = st
