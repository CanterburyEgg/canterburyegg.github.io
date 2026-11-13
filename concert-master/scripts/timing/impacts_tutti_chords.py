"""Also detect massive Tutti orchestral chord attacks (>= 6 staves attacking within 50ms)

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    b = ns.get('b', MISSING)
    cnt = ns.get('cnt', MISSING)
    defaultdict = ns.get('defaultdict', MISSING)
    imp_bins = ns.get('imp_bins', MISSING)
    n = ns.get('n', MISSING)
    score_dur = ns.get('score_dur', MISSING)
    seen_b = ns.get('seen_b', MISSING)
    st = ns.get('st', MISSING)
    staff_attack_bins = ns.get('staff_attack_bins', MISSING)
    staff_sustained_bins = ns.get('staff_sustained_bins', MISSING)
    staves = ns.get('staves', MISSING)

    # Also detect massive Tutti orchestral chord attacks (>= 6 staves attacking within 50ms)
    staff_attack_bins = defaultdict(int)
    staff_sustained_bins = defaultdict(int)
    for st in staves:
        if "timp" in st["name"].lower():
            continue
        seen_b = set()
        for n in st["notes"]:
            b = round(n["start"] * 20.0) / 20.0
            if b not in seen_b:
                seen_b.add(b)
                staff_attack_bins[b] += 1
                if (n["end"] - n["start"]) >= 1.4 or b >= score_dur - 3.0:
                    staff_sustained_bins[b] += 1

    for b, cnt in staff_attack_bins.items():
        if cnt >= max(4, int(len(staves) * 0.42)):
            imp_bins[b] += 0.65

    if b is not MISSING:
        ns['b'] = b
    if cnt is not MISSING:
        ns['cnt'] = cnt
    if n is not MISSING:
        ns['n'] = n
    if seen_b is not MISSING:
        ns['seen_b'] = seen_b
    if st is not MISSING:
        ns['st'] = st
    if staff_attack_bins is not MISSING:
        ns['staff_attack_bins'] = staff_attack_bins
    if staff_sustained_bins is not MISSING:
        ns['staff_sustained_bins'] = staff_sustained_bins
