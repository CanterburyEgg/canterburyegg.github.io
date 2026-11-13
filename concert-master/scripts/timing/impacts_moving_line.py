"""(a moving line's big hits ARE the impacts from its first hit on)

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    imp = ns.get('imp', MISSING)
    mv_hits = ns.get('mv_hits', MISSING)
    mv_taps = ns.get('mv_taps', MISSING)
    raw_impacts = ns.get('raw_impacts', MISSING)
    t_hit0 = ns.get('t_hit0', MISSING)
    t_hitN = ns.get('t_hitN', MISSING)
    wn_h = ns.get('wn_h', MISSING)

    # (a moving line's big hits ARE the impacts from its first hit on)
    if len(mv_taps) >= 8 and mv_hits:
        t_hit0 = float(mv_hits[0]["start"]) - 0.35
        t_hitN = float(mv_hits[-1]["start"]) + 0.35
        raw_impacts = [imp for imp in raw_impacts if not (t_hit0 <= imp[0] <= t_hitN)]
        for wn_h in mv_hits:
            raw_impacts.append([round(float(wn_h["start"]), 4), 1.35, 9.9])

    if imp is not MISSING:
        ns['imp'] = imp
    if raw_impacts is not MISSING:
        ns['raw_impacts'] = raw_impacts
    if t_hit0 is not MISSING:
        ns['t_hit0'] = t_hit0
    if t_hitN is not MISSING:
        ns['t_hitN'] = t_hitN
    if wn_h is not MISSING:
        ns['wn_h'] = wn_h
