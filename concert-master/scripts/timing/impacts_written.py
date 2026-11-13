"""Extract written Percussion / Tutti impacts straight from the Score!

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    b = ns.get('b', MISSING)
    defaultdict = ns.get('defaultdict', MISSING)
    dn = ns.get('dn', MISSING)
    drum_notes = ns.get('drum_notes', MISSING)
    imp_bins = ns.get('imp_bins', MISSING)

    # Extract written Percussion / Tutti impacts straight from the Score!
    imp_bins = defaultdict(float)
    for dn in drum_notes:
        b = round(dn["start"] * 20.0) / 20.0
        imp_bins[b] += dn["vel"] / 100.0

    if b is not MISSING:
        ns['b'] = b
    if dn is not MISSING:
        ns['dn'] = dn
    if imp_bins is not MISSING:
        ns['imp_bins'] = imp_bins
