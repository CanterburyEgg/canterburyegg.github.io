"""Verify every candidate Score Impact against actual Acoustic Transients in `a_ons_raw` & `mix_rms`

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a_ons_raw = ns.get('a_ons_raw', MISSING)
    ac_boost = ns.get('ac_boost', MISSING)
    dt = ns.get('dt', MISSING)
    duration = ns.get('duration', MISSING)
    eff_str = ns.get('eff_str', MISSING)
    f_c = ns.get('f_c', MISSING)
    f_pk = ns.get('f_pk', MISSING)
    hi = ns.get('hi', MISSING)
    imp_bins = ns.get('imp_bins', MISSING)
    is_tutti_slam = ns.get('is_tutti_slam', MISSING)
    lo = ns.get('lo', MISSING)
    loc_med = ns.get('loc_med', MISSING)
    max_mix_rms = ns.get('max_mix_rms', MISSING)
    mix_rms = ns.get('mix_rms', MISSING)
    np = ns.get('np', MISSING)
    pk_off = ns.get('pk_off', MISSING)
    pk_ons = ns.get('pk_ons', MISSING)
    pk_rms = ns.get('pk_rms', MISSING)
    pre_rms = ns.get('pre_rms', MISSING)
    raw_impacts = ns.get('raw_impacts', MISSING)
    s_time = ns.get('s_time', MISSING)
    score_dur = ns.get('score_dur', MISSING)
    score_str = ns.get('score_str', MISSING)
    staff_attack_bins = ns.get('staff_attack_bins', MISSING)
    staff_sustained_bins = ns.get('staff_sustained_bins', MISSING)
    staves = ns.get('staves', MISSING)
    t_est = ns.get('t_est', MISSING)
    ta = ns.get('ta', MISSING)
    tutti_surge = ns.get('tutti_surge', MISSING)
    warp_fn = ns.get('warp_fn', MISSING)
    warped = ns.get('warped', MISSING)
    wn = ns.get('wn', MISSING)

    # Verify every candidate Score Impact against actual Acoustic Transients in `a_ons_raw` & `mix_rms`
    # so silent roll fade-outs (`> n.`), `p <` roll starts, and soft background shaker/conga ticks NEVER spawn ghost notes!
    max_mix_rms = float(np.max(mix_rms)) + 1e-6
    raw_impacts = []
    for s_time in sorted(imp_bins.keys()):
        score_str = float(np.clip(imp_bins[s_time] * 0.65, 0.0, 1.5))
        if score_str < 0.38:
            continue
        t_est = float(warp_fn(s_time))
        for wn in warped:
            if wn.get("is_legato_suspension") and abs(wn["score_start"] - s_time) <= 0.06:
                t_est = float(wn["start"])
                break
        f_c = int(round(t_est / dt))
        if f_c < 6 or f_c >= len(a_ons_raw) - 8:
            continue
        # Search within +-7 frames (+-81ms) for the true acoustic transient peak
        lo = max(2, f_c - 7)
        hi = min(len(a_ons_raw) - 3, f_c + 8)
        pk_off = int(np.argmax(a_ons_raw[lo:hi]))
        f_pk = lo + pk_off
        pk_ons = float(a_ons_raw[f_pk])
        loc_med = float(np.median(a_ons_raw[max(0, f_pk - 35) : min(len(a_ons_raw), f_pk + 35)])) + 0.12
        pk_rms = float(np.max(mix_rms[max(0, f_pk - 2) : min(len(mix_rms), f_pk + 5)]))

        # Require genuine audible transient attack above local background, OR massive sustained/final Tutti chord slam
        is_tutti_slam = (staff_sustained_bins.get(s_time, 0) >= max(5, int(len(staves) * 0.45)) or staff_attack_bins.get(s_time, 0) >= max(8, int(len(staves) * 0.60))) and score_str >= 0.85
        pre_rms = float(np.median(mix_rms[max(0, f_pk - 12) : max(1, f_pk - 2)])) + 1e-6
        tutti_surge = is_tutti_slam and pk_rms >= max_mix_rms * 0.42 and (pk_rms >= pre_rms * 1.25 or pk_ons >= loc_med * 1.35)
        if (pk_ons >= 1.85 and pk_ons >= loc_med * 1.52 and pk_rms >= max_mix_rms * 0.032) or tutti_surge:
            ta = float(f_pk * dt)
            if is_tutti_slam and s_time >= score_dur - 3.5 and warped:
                ta = float(warped[-1]["start"])
            # If Timpani is already the active lead voice on the home-row keys at `ta` and this is a soft/medium groove hit,
            # do not double-spawn an impact on top of the home-row motor!
            if pk_rms < max_mix_rms * 0.22 and any("timp" in wn["staff"].lower() and abs(wn["start"] - ta) <= 0.25 for wn in warped):
                continue
            ac_boost = float(np.clip(pk_ons / 6.5, 0.45, 1.35))
            eff_str = float(np.clip(0.45 * score_str + 0.55 * ac_boost, 0.40, 1.50))
            if pk_rms < max_mix_rms * 0.115 and pk_ons < 3.8 and not tutti_surge:
                eff_str = min(eff_str, 0.50)
            if tutti_surge:
                eff_str = max(eff_str, 1.25)
            if 0.25 <= ta <= duration - 0.30:
                # 3rd field: how sharp the audio transient is vs its surroundings, so the chart can pick the real hit
                # out of a cluster (Arabesque 2:26: the big hit after the woodwind rip is 0.3s after a softer one)
                raw_impacts.append([round(ta, 4), round(eff_str, 3), round(pk_ons / loc_med, 2)])

    if ac_boost is not MISSING:
        ns['ac_boost'] = ac_boost
    if eff_str is not MISSING:
        ns['eff_str'] = eff_str
    if f_c is not MISSING:
        ns['f_c'] = f_c
    if f_pk is not MISSING:
        ns['f_pk'] = f_pk
    if hi is not MISSING:
        ns['hi'] = hi
    if is_tutti_slam is not MISSING:
        ns['is_tutti_slam'] = is_tutti_slam
    if lo is not MISSING:
        ns['lo'] = lo
    if loc_med is not MISSING:
        ns['loc_med'] = loc_med
    if max_mix_rms is not MISSING:
        ns['max_mix_rms'] = max_mix_rms
    if pk_off is not MISSING:
        ns['pk_off'] = pk_off
    if pk_ons is not MISSING:
        ns['pk_ons'] = pk_ons
    if pk_rms is not MISSING:
        ns['pk_rms'] = pk_rms
    if pre_rms is not MISSING:
        ns['pre_rms'] = pre_rms
    if raw_impacts is not MISSING:
        ns['raw_impacts'] = raw_impacts
    if s_time is not MISSING:
        ns['s_time'] = s_time
    if score_str is not MISSING:
        ns['score_str'] = score_str
    if t_est is not MISSING:
        ns['t_est'] = t_est
    if ta is not MISSING:
        ns['ta'] = ta
    if tutti_surge is not MISSING:
        ns['tutti_surge'] = tutti_surge
    if wn is not MISSING:
        ns['wn'] = wn
