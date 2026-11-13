"""Compute local melodic activity curve & Tier-1 (Fewer) vs Tier-2 (More)

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    T = ns.get('T', MISSING)
    act_curve = ns.get('act_curve', MISSING)
    dt = ns.get('dt', MISSING)
    f_idx = ns.get('f_idx', MISSING)
    impulse = ns.get('impulse', MISSING)
    mix_rms = ns.get('mix_rms', MISSING)
    np = ns.get('np', MISSING)
    rate_curve = ns.get('rate_curve', MISSING)
    scipy = ns.get('scipy', MISSING)
    warped = ns.get('warped', MISSING)
    wn = ns.get('wn', MISSING)

    # Compute local melodic activity curve & Tier-1 (Fewer) vs Tier-2 (More)
    T = len(mix_rms)
    impulse = np.zeros(T, dtype=np.float32)
    for wn in warped:
        f_idx = min(T - 1, max(0, int(round(wn["start"] / dt))))
        impulse[f_idx] = 1.0

    rate_curve = scipy.ndimage.uniform_filter1d(impulse, size=max(10, int(round(4.4 / dt)))) / dt
    act_curve = np.clip((rate_curve - 1.55) / 2.35, 0.0, 1.0)
    act_curve = scipy.ndimage.uniform_filter1d(act_curve, size=max(6, int(round(1.8 / dt))))

    if T is not MISSING:
        ns['T'] = T
    if act_curve is not MISSING:
        ns['act_curve'] = act_curve
    if f_idx is not MISSING:
        ns['f_idx'] = f_idx
    if impulse is not MISSING:
        ns['impulse'] = impulse
    if rate_curve is not MISSING:
        ns['rate_curve'] = rate_curve
    if wn is not MISSING:
        ns['wn'] = wn
