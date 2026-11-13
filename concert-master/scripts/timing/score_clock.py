"""Sequenced tracks (the score IS the clock: What We Do's audio follows its score at exactly 1.0000x, residual jitter

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    RIGID_CLOCK = ns.get('RIGID_CLOCK', MISSING)
    _all_s = ns.get('_all_s', MISSING)
    d_c2 = ns.get('d_c2', MISSING)
    k = ns.get('k', MISSING)
    k_c2 = ns.get('k_c2', MISSING)
    m = ns.get('m', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    np = ns.get('np', MISSING)
    nxt = ns.get('nxt', MISSING)
    order_c2 = ns.get('order_c2', MISSING)
    score_clock = ns.get('score_clock', MISSING)
    st = ns.get('st', MISSING)
    staves = ns.get('staves', MISSING)
    t_c2 = ns.get('t_c2', MISSING)
    warp_fn = ns.get('warp_fn', MISSING)
    warped = ns.get('warped', MISSING)

    # Sequenced tracks (the score IS the clock: What We Do's audio follows its score at exactly 1.0000x, residual jitter
    # only from the warp): every note goes to its written time plus the track's offset, so metronomic passages are
    # exactly even (flute triplets, harp pairs). Notes restored from an approved chart keep their times.
    # (detected, not listed per song: a recording whose attacks land on the score's own clock at one constant latency
    # for 35%+ of the score's attacks is sequenced, e.g. What We Do 68%, Guthix 42%, against 5-15% for the live band
    # recordings; its offset is the median gap between where the warp puts the score's attacks and where they're written)
    score_clock = None
    if RIGID_CLOCK["rate"] >= 0.35 and len(warped) == len(melody_out):
        # (measured on every attack in the score, not just the chart's notes, so it doesn't move when the chart follows
        # a different part)
        _all_s = np.array(sorted({float(m["start"]) for st in staves for m in st["notes"]}))
        score_clock = round(float(np.median(warp_fn(_all_s) - _all_s)), 4)
    if score_clock is not None and len(warped) == len(melody_out):
        for k_c2 in range(len(melody_out)):
            if str(warped[k_c2].get("staff", "")).startswith("Restored"):
                continue
            d_c2 = float(melody_out[k_c2][1]) - float(melody_out[k_c2][0])
            t_c2 = float(warped[k_c2]["score_start"]) + score_clock
            melody_out[k_c2][0] = round(t_c2, 4)
            melody_out[k_c2][1] = round(t_c2 + d_c2, 4)
        order_c2 = sorted(range(len(melody_out)), key=lambda k: float(melody_out[k][0]))
        melody_out = [melody_out[k] for k in order_c2]
        warped = [warped[k] for k in order_c2]
        for k_c2 in range(len(melody_out) - 1):
            nxt = float(melody_out[k_c2 + 1][0])
            if float(melody_out[k_c2][1]) > nxt - 0.015:
                melody_out[k_c2][1] = round(max(float(melody_out[k_c2][0]) + 0.04, nxt - 0.015), 4)
        print(f"    -> score clock: {len(melody_out)} notes on their written times (+{score_clock:.4f}s)")

    if _all_s is not MISSING:
        ns['_all_s'] = _all_s
    if d_c2 is not MISSING:
        ns['d_c2'] = d_c2
    if k is not MISSING:
        ns['k'] = k
    if k_c2 is not MISSING:
        ns['k_c2'] = k_c2
    if m is not MISSING:
        ns['m'] = m
    if melody_out is not MISSING:
        ns['melody_out'] = melody_out
    if nxt is not MISSING:
        ns['nxt'] = nxt
    if order_c2 is not MISSING:
        ns['order_c2'] = order_c2
    if score_clock is not MISSING:
        ns['score_clock'] = score_clock
    if st is not MISSING:
        ns['st'] = st
    if t_c2 is not MISSING:
        ns['t_c2'] = t_c2
    if warped is not MISSING:
        ns['warped'] = warped
