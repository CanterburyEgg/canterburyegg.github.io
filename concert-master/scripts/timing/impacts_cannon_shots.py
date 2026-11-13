"""Also anchor towering concert-hall percussion cannon shots (`a_ons_raw >= 7.2`, e.g. m.1 / m.7 / m.11 `fp` hits)

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    _ = ns.get('_', MISSING)
    a_ons_raw = ns.get('a_ons_raw', MISSING)
    dt = ns.get('dt', MISSING)
    duration = ns.get('duration', MISSING)
    imp_bins = ns.get('imp_bins', MISSING)
    loc_m = ns.get('loc_m', MISSING)
    major_pks = ns.get('major_pks', MISSING)
    min_score_imp = ns.get('min_score_imp', MISSING)
    mpk = ns.get('mpk', MISSING)
    near_warped = ns.get('near_warped', MISSING)
    np = ns.get('np', MISSING)
    opening_downbeat = ns.get('opening_downbeat', MISSING)
    raw_impacts = ns.get('raw_impacts', MISSING)
    scipy = ns.get('scipy', MISSING)
    st = ns.get('st', MISSING)
    tp = ns.get('tp', MISSING)
    warp_fn = ns.get('warp_fn', MISSING)
    warped_imp_times = ns.get('warped_imp_times', MISSING)

    # Also anchor towering concert-hall percussion cannon shots (`a_ons_raw >= 7.2`, e.g. m.1 / m.7 / m.11 `fp` hits)
    # when a written score percussion/tutti event lies within +-1.3s (protecting rubato grand-pause impacts!)
    warped_imp_times = np.array([float(warp_fn(st)) for st in sorted(imp_bins.keys())], dtype=np.float64)
    min_score_imp = min(imp_bins.keys()) if imp_bins else 999.0
    if len(warped_imp_times) > 0:
        major_pks, _ = scipy.signal.find_peaks(a_ons_raw, height=7.2, distance=max(5, int(0.32 / dt)))
        for mpk in major_pks:
            tp = float(mpk * dt)
            near_warped = np.min(np.abs(warped_imp_times - tp)) <= 1.35
            opening_downbeat = tp <= 1.8 and min_score_imp <= 0.5
            if 0.22 <= tp <= duration - 0.30 and (near_warped or opening_downbeat):
                loc_m = float(np.median(a_ons_raw[max(0, mpk - 35) : min(len(a_ons_raw), mpk + 35)])) + 0.12
                raw_impacts.append([round(tp, 4), round(float(np.clip(a_ons_raw[mpk] / 7.5, 0.85, 1.50)), 3), round(float(a_ons_raw[mpk]) / loc_m, 2)])

    if _ is not MISSING:
        ns['_'] = _
    if loc_m is not MISSING:
        ns['loc_m'] = loc_m
    if major_pks is not MISSING:
        ns['major_pks'] = major_pks
    if min_score_imp is not MISSING:
        ns['min_score_imp'] = min_score_imp
    if mpk is not MISSING:
        ns['mpk'] = mpk
    if near_warped is not MISSING:
        ns['near_warped'] = near_warped
    if opening_downbeat is not MISSING:
        ns['opening_downbeat'] = opening_downbeat
    if st is not MISSING:
        ns['st'] = st
    if tp is not MISSING:
        ns['tp'] = tp
    if warped_imp_times is not MISSING:
        ns['warped_imp_times'] = warped_imp_times
