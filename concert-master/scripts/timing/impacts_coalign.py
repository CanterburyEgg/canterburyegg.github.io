"""Co-align simultaneous [melody_note, impact] hits within 110ms so melody + Spacebar never flam!

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    best_diff = ns.get('best_diff', MISSING)
    best_k = ns.get('best_k', MISSING)
    d = ns.get('d', MISSING)
    dt = ns.get('dt', MISSING)
    duration = ns.get('duration', MISSING)
    f_mn = ns.get('f_mn', MISSING)
    f_ta = ns.get('f_ta', MISSING)
    imp = ns.get('imp', MISSING)
    impacts = ns.get('impacts', MISSING)
    k = ns.get('k', MISSING)
    max_d = ns.get('max_d', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    min_next_buf = ns.get('min_next_buf', MISSING)
    mix_rms = ns.get('mix_rms', MISSING)
    mn = ns.get('mn', MISSING)
    mn_t = ns.get('mn_t', MISSING)
    next_start = ns.get('next_start', MISSING)
    prev_end = ns.get('prev_end', MISSING)
    ta = ns.get('ta', MISSING)
    warped = ns.get('warped', MISSING)

    # Co-align simultaneous [melody_note, impact] hits within 110ms so melody + Spacebar never flam!
    for imp in impacts:
        ta = imp[0]
        best_k = -1
        best_diff = 0.135
        for k, mn in enumerate(melody_out):
            max_d = 0.135 if warped[k].get("is_legato_suspension") else 0.115
            d = abs(mn[0] - ta)
            if d < max_d and d < best_diff:
                best_diff = d
                best_k = k
        if best_k >= 0 and best_diff > 0.002:
            mn_t = melody_out[best_k][0]
            f_ta = min(len(mix_rms) - 1, max(0, int(round(ta / dt))))
            f_mn = min(len(mix_rms) - 1, max(0, int(round(mn_t / dt))))
            prev_end = melody_out[best_k - 1][1] + 0.015 if best_k > 0 else 0.10
            min_next_buf = 0.125 if "timp" in warped[best_k]["staff"].lower() else 0.045
            next_start = melody_out[best_k + 1][0] - min_next_buf if best_k + 1 < len(melody_out) else duration
            # (a note evenly spaced between its neighbours keeps its time -- the impact comes to it: Ride 0:39, an even
            # eighth-note run 73 75 77 had its 75 pulled 0.09s late onto a spacebar hit)
            gp_c = mn_t - melody_out[best_k - 1][0] if best_k > 0 else 9.0
            gn_c = melody_out[best_k + 1][0] - mn_t if best_k + 1 < len(melody_out) else 9.0
            even_c = max(gp_c, gn_c) < 0.45 and abs(gp_c - gn_c) <= 0.15 * max(gp_c, gn_c)
            if (
                not even_c
                and not warped[best_k].get("is_scalar_lick")
                and not warped[best_k].get("is_legato_suspension")
                and mix_rms[f_ta] > mix_rms[f_mn] * 1.25
                and prev_end <= ta <= next_start
                and ta < melody_out[best_k][1] - 0.04
            ):
                melody_out[best_k][0] = round(ta, 4)
            else:
                imp[0] = round(mn_t, 4)

    if best_diff is not MISSING:
        ns['best_diff'] = best_diff
    if best_k is not MISSING:
        ns['best_k'] = best_k
    if d is not MISSING:
        ns['d'] = d
    if f_mn is not MISSING:
        ns['f_mn'] = f_mn
    if f_ta is not MISSING:
        ns['f_ta'] = f_ta
    if imp is not MISSING:
        ns['imp'] = imp
    if k is not MISSING:
        ns['k'] = k
    if max_d is not MISSING:
        ns['max_d'] = max_d
    if min_next_buf is not MISSING:
        ns['min_next_buf'] = min_next_buf
    if mn is not MISSING:
        ns['mn'] = mn
    if mn_t is not MISSING:
        ns['mn_t'] = mn_t
    if next_start is not MISSING:
        ns['next_start'] = next_start
    if prev_end is not MISSING:
        ns['prev_end'] = prev_end
    if ta is not MISSING:
        ns['ta'] = ta
