"""Deduplicate impacts within 150ms keeping strongest

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    drum_passages = ns.get('drum_passages', MISSING)
    g0 = ns.get('g0', MISSING)
    g1 = ns.get('g1', MISSING)
    imp = ns.get('imp', MISSING)
    impacts = ns.get('impacts', MISSING)
    raw_impacts = ns.get('raw_impacts', MISSING)
    sharp = ns.get('sharp', MISSING)
    spans_a = ns.get('spans_a', MISSING)
    st_val = ns.get('st_val', MISSING)
    ta = ns.get('ta', MISSING)
    tap_t = ns.get('tap_t', MISSING)
    warp_fn = ns.get('warp_fn', MISSING)
    warped = ns.get('warped', MISSING)
    wn = ns.get('wn', MISSING)

    # Deduplicate impacts within 150ms keeping strongest
    if drum_passages:
        # While the drums lead, the written drum taps ARE the chart: drop recorded hits that don't line up with one
        tap_t = [float(wn["start"]) for wn in warped if wn.get("is_perc_tap")]
        spans_a = [(float(warp_fn(g0)), float(warp_fn(g1))) for g0, g1 in drum_passages]
        raw_impacts = [
            imp for imp in raw_impacts
            if not any(a0 - 0.1 <= imp[0] < a1 for a0, a1 in spans_a) or any(abs(imp[0] - t_k) <= 0.06 for t_k in tap_t)
        ]
    impacts = []
    for ta, st_val, sharp in sorted(raw_impacts, key=lambda x: x[0]):
        if impacts and ta - impacts[-1][0] < 0.15:
            if st_val > impacts[-1][1]:
                impacts[-1] = [ta, st_val, sharp]
        else:
            impacts.append([ta, st_val, sharp])

    if g0 is not MISSING:
        ns['g0'] = g0
    if g1 is not MISSING:
        ns['g1'] = g1
    if imp is not MISSING:
        ns['imp'] = imp
    if impacts is not MISSING:
        ns['impacts'] = impacts
    if raw_impacts is not MISSING:
        ns['raw_impacts'] = raw_impacts
    if sharp is not MISSING:
        ns['sharp'] = sharp
    if spans_a is not MISSING:
        ns['spans_a'] = spans_a
    if st_val is not MISSING:
        ns['st_val'] = st_val
    if ta is not MISSING:
        ns['ta'] = ta
    if tap_t is not MISSING:
        ns['tap_t'] = tap_t
    if wn is not MISSING:
        ns['wn'] = wn
