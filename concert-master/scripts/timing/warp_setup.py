"""Warp setup.

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    _warp_score_t = ns.get('_warp_score_t', MISSING)
    lead_score_notes = ns.get('lead_score_notes', MISSING)
    n = ns.get('n', MISSING)
    raw_ends = ns.get('raw_ends', MISSING)
    raw_starts = ns.get('raw_starts', MISSING)
    warp_fn = ns.get('warp_fn', MISSING)

    print("  [4/4] Warping melody notes, ties, holds & written percussion impacts to performance clock...")
    def _warp_score_t(t_val: float, n_obj: dict) -> float:
        rb = n_obj.get("repaired_bar")
        if rb is not None:
            b0, b1 = rb
            if b1 > b0:
                w0, w1 = float(warp_fn(b0)), float(warp_fn(b1))
                return w0 + (w1 - w0) * ((t_val - b0) / (b1 - b0))
        return float(warp_fn(t_val))

    raw_starts = [_warp_score_t(n["start"], n) for n in lead_score_notes]
    raw_ends = [_warp_score_t(n["end"], n) for n in lead_score_notes]

    if _warp_score_t is not MISSING:
        ns['_warp_score_t'] = _warp_score_t
    if n is not MISSING:
        ns['n'] = n
    if raw_ends is not MISSING:
        ns['raw_ends'] = raw_ends
    if raw_starts is not MISSING:
        ns['raw_starts'] = raw_starts
