"""Low slides into a band hit: a short lead note (< 0.4s) an octave or more below the notes either side of it, running

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a_d = ns.get('a_d', MISSING)
    b_d = ns.get('b_d', MISSING)
    c_d = ns.get('c_d', MISSING)
    chord_hits = ns.get('chord_hits', MISSING)
    h = ns.get('h', MISSING)
    hit_t = ns.get('hit_t', MISSING)
    k_d = ns.get('k_d', MISSING)
    melody_out = ns.get('melody_out', MISSING)

    # Low slides into a band hit: a short lead note (< 0.4s) an octave or more below the notes either side of it, running
    # straight into a full-band chord hit, is the accompaniment's pickup, not the tune: the ear hears the hit (Arabesque
    # 2:35.6: the clarinets' and horns' 72 under the big chord at 2:35.96).
    hit_t = [h[0] for h in chord_hits if len(h) == 3]
    for k_d in range(len(melody_out) - 2, 0, -1):
        a_d, b_d, c_d = melody_out[k_d - 1], melody_out[k_d], melody_out[k_d + 1]
        if (
            float(b_d[1]) - float(b_d[0]) < 0.4
            and int(b_d[2]) <= int(a_d[2]) - 12
            and int(b_d[2]) <= int(c_d[2]) - 12
            and float(c_d[0]) - float(b_d[1]) < 0.15
            and any(abs(t - float(c_d[0])) < 0.03 for t in hit_t)
        ):
            del melody_out[k_d]
    if chord_hits:
        print(f"    -> {len(chord_hits)} ensemble chord hits")

    if a_d is not MISSING:
        ns['a_d'] = a_d
    if b_d is not MISSING:
        ns['b_d'] = b_d
    if c_d is not MISSING:
        ns['c_d'] = c_d
    if h is not MISSING:
        ns['h'] = h
    if hit_t is not MISSING:
        ns['hit_t'] = hit_t
    if k_d is not MISSING:
        ns['k_d'] = k_d
