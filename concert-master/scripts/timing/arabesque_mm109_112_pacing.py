"""Pace the rubato transition & majestic band hits in mm.109-112 (score_t 283.97..298.57s, audio 4:49.52..5:04.41)

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    k_m = ns.get('k_m', MISSING)
    lead_score_notes = ns.get('lead_score_notes', MISSING)
    maj_a_knots = ns.get('maj_a_knots', MISSING)
    maj_s_knots = ns.get('maj_s_knots', MISSING)
    n_m = ns.get('n_m', MISSING)
    np = ns.get('np', MISSING)
    raw_ends = ns.get('raw_ends', MISSING)
    raw_starts = ns.get('raw_starts', MISSING)
    s_en = ns.get('s_en', MISSING)
    s_st = ns.get('s_st', MISSING)
    score_dur = ns.get('score_dur', MISSING)

    # Pace the rubato transition & majestic band hits in mm.109-112 (score_t 283.97..298.57s, audio 4:49.52..5:04.41)
    # across verified ensemble beat anchors so neither rit./molto rit. drift nor vibrato micro-snaps offset the band hits!
    maj_s_knots = np.array(
        [283.97, 284.67, 285.37, 286.77, 289.99, 291.07, 292.94, 293.88, 294.82, 295.76, 296.69, 297.16, 297.63, 298.10, 298.57],
        dtype=np.float64,
    )
    maj_a_knots = np.array(
        [289.52, 290.25, 291.00, 292.60, 295.64, 296.82, 298.74, 299.68, 300.56, 301.44, 302.42, 302.95, 303.53, 303.95, 304.41],
        dtype=np.float64,
    )
    if score_dur >= 340.0 and any(283.95 <= n["start"] <= 284.05 and n["staff"] == "F Horn 1, 2" for n in lead_score_notes):
        for k_m, n_m in enumerate(lead_score_notes):
            s_st = float(n_m["start"])
            s_en = float(n_m["end"])
            if 283.95 <= s_st <= 298.55:
                raw_starts[k_m] = float(np.interp(s_st, maj_s_knots, maj_a_knots))
                raw_ends[k_m] = float(np.interp(s_en, maj_s_knots, maj_a_knots)) - (0.08 if (s_en - s_st) >= 0.65 else 0.015)
                n_m["is_legato_suspension"] = True

    if k_m is not MISSING:
        ns['k_m'] = k_m
    if maj_a_knots is not MISSING:
        ns['maj_a_knots'] = maj_a_knots
    if maj_s_knots is not MISSING:
        ns['maj_s_knots'] = maj_s_knots
    if n_m is not MISSING:
        ns['n_m'] = n_m
    if s_en is not MISSING:
        ns['s_en'] = s_en
    if s_st is not MISSING:
        ns['s_st'] = s_st
