"""Acoustic Pre-Silence Cutoff Clamping:

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a_ons_raw = ns.get('a_ons_raw', MISSING)
    after_end = ns.get('after_end', MISSING)
    c_hi = ns.get('c_hi', MISSING)
    c_lo = ns.get('c_lo', MISSING)
    dt = ns.get('dt', MISSING)
    duration = ns.get('duration', MISSING)
    f_cut = ns.get('f_cut', MISSING)
    f_hi = ns.get('f_hi', MISSING)
    f_lo = ns.get('f_lo', MISSING)
    f_pk = ns.get('f_pk', MISSING)
    k = ns.get('k', MISSING)
    max_mix_rms_all = ns.get('max_mix_rms_all', MISSING)
    mix_rms = ns.get('mix_rms', MISSING)
    next_t = ns.get('next_t', MISSING)
    np = ns.get('np', MISSING)
    prev_lim = ns.get('prev_lim', MISSING)
    rms_min_after = ns.get('rms_min_after', MISSING)
    rms_pk = ns.get('rms_pk', MISSING)
    same_staff_trill = ns.get('same_staff_trill', MISSING)
    seg_rms = ns.get('seg_rms', MISSING)
    t_cut = ns.get('t_cut', MISSING)
    warped = ns.get('warped', MISSING)
    wn = ns.get('wn', MISSING)

    # Acoustic Pre-Silence Cutoff Clamping:
    # Before any grand pause / caesura (>= 1.5s rest) or final cutoff, lock the phrase release & any final
    # short cutoff flick (e.g. m.6 G6, m.10 G6, m.14 F6) directly onto the ensemble cutoff cliff in mix_rms!
    max_mix_rms_all = float(np.max(mix_rms)) + 1e-6
    for k in range(len(warped)):
        wn = warped[k]
        if wn.get("is_coda_fanfare_tap"):
            continue
        next_t = warped[k + 1]["start"] if k + 1 < len(warped) else duration
        if (next_t - wn["end"]) < 1.35 and (next_t - wn["start"]) < 1.95 and k < len(warped) - 1:
            continue
        f_lo = max(3, int(round((wn["start"] - 1.35) / dt)))
        f_hi = min(len(mix_rms) - int(round(0.45 / dt)), int(round(min(next_t - 0.35, wn["end"] + 0.55) / dt)))
        if f_hi <= f_lo + 4:
            continue
        seg_rms = mix_rms[f_lo:f_hi]
        f_pk = f_lo + int(np.argmax(seg_rms))
        rms_pk = float(mix_rms[f_pk])
        after_end = min(len(mix_rms), f_pk + int(round(0.95 / dt)))
        rms_min_after = float(np.min(mix_rms[f_pk + 4 : after_end])) if after_end > f_pk + 4 else rms_pk
        if rms_pk >= max_mix_rms_all * 0.10 and rms_min_after <= min(rms_pk * 0.16, max_mix_rms_all * 0.045):
            # Refine exact cutoff transient/cliff frame around f_pk
            c_lo = max(2, f_pk - int(round(0.16 / dt)))
            c_hi = min(len(a_ons_raw) - 2, f_pk + int(round(0.08 / dt)) + 1)
            f_cut = c_lo + int(np.argmax(a_ons_raw[c_lo:c_hi] * np.sqrt(np.maximum(0.0, mix_rms[c_lo:c_hi]))))
            t_cut = float(f_cut * dt)
            prev_lim = (warped[k - 1]["start"] + 0.22) if k > 0 else 0.15
            if wn["score_dur"] <= 0.92 and t_cut >= prev_lim and abs(wn["start"] - t_cut) <= 1.35:
                # Short cutoff flick at climax of swell -> crisp cutoff tap right at t_cut!
                wn["start"] = max(prev_lim, t_cut - 0.01)
                wn["end"] = min(next_t - 0.25, wn["start"] + 0.08)
                wn["dur"] = wn["end"] - wn["start"]
                same_staff_trill = wn["staff"] == warped[k - 1]["staff"] and wn["score_gap_prev"] <= 1.85 if k > 0 else False
                if (
                    k > 0
                    and (wn["score_gap_prev"] <= 0.20 or same_staff_trill)
                    and warped[k - 1]["score_dur"] >= 1.1
                    and warped[k - 1]["start"] < wn["start"] - 0.20
                ):
                    warped[k - 1]["end"] = wn["start"] - 0.08
                    warped[k - 1]["dur"] = warped[k - 1]["end"] - warped[k - 1]["start"]
            elif wn["end"] > t_cut + 0.06 and t_cut > wn["start"] + 0.08:
                wn["end"] = t_cut + 0.04
                wn["dur"] = wn["end"] - wn["start"]

    if after_end is not MISSING:
        ns['after_end'] = after_end
    if c_hi is not MISSING:
        ns['c_hi'] = c_hi
    if c_lo is not MISSING:
        ns['c_lo'] = c_lo
    if f_cut is not MISSING:
        ns['f_cut'] = f_cut
    if f_hi is not MISSING:
        ns['f_hi'] = f_hi
    if f_lo is not MISSING:
        ns['f_lo'] = f_lo
    if f_pk is not MISSING:
        ns['f_pk'] = f_pk
    if k is not MISSING:
        ns['k'] = k
    if max_mix_rms_all is not MISSING:
        ns['max_mix_rms_all'] = max_mix_rms_all
    if next_t is not MISSING:
        ns['next_t'] = next_t
    if prev_lim is not MISSING:
        ns['prev_lim'] = prev_lim
    if rms_min_after is not MISSING:
        ns['rms_min_after'] = rms_min_after
    if rms_pk is not MISSING:
        ns['rms_pk'] = rms_pk
    if same_staff_trill is not MISSING:
        ns['same_staff_trill'] = same_staff_trill
    if seg_rms is not MISSING:
        ns['seg_rms'] = seg_rms
    if t_cut is not MISSING:
        ns['t_cut'] = t_cut
    if wn is not MISSING:
        ns['wn'] = wn
