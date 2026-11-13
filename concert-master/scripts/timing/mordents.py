"""Identify 3-note 16th-16th-8th upper-neighbor mordents (`X [16th] -> X+1/2 [16th] -> X [8th]`, e.g. Ride mm.76-88 woodwinds):

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    T = ns.get('T', MISSING)
    act = ns.get('act', MISSING)
    act_curve = ns.get('act_curve', MISSING)
    dt = ns.get('dt', MISSING)
    f_idx = ns.get('f_idx', MISSING)
    idx_m = ns.get('idx_m', MISSING)
    idx_w = ns.get('idx_w', MISSING)
    is_after_low_triplet_w = ns.get('is_after_low_triplet_w', MISSING)
    is_low_triplet_w = ns.get('is_low_triplet_w', MISSING)
    last_t1 = ns.get('last_t1', MISSING)
    leads_to_hold = ns.get('leads_to_hold', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    min_t1_gap = ns.get('min_t1_gap', MISSING)
    mordent_tier2_indices = ns.get('mordent_tier2_indices', MISSING)
    out_act = ns.get('out_act', MISSING)
    out_row = ns.get('out_row', MISSING)
    tier = ns.get('tier', MISSING)
    w0 = ns.get('w0', MISSING)
    w1 = ns.get('w1', MISSING)
    w2 = ns.get('w2', MISSING)
    warped = ns.get('warped', MISSING)
    wn = ns.get('wn', MISSING)
    yields_to_next_structural = ns.get('yields_to_next_structural', MISSING)

    # Identify 3-note 16th-16th-8th upper-neighbor mordents (`X [16th] -> X+1/2 [16th] -> X [8th]`, e.g. Ride mm.76-88 woodwinds):
    # In Tier 1 (Fewer Notes), collapse the mordent onto its downbeat attack `X` (marking both the 16th upper neighbor
    # and the 8th return as Tier 2) so Tier 1 never creates phantom repeated `X -> X` eighth-note pairs!
    mordent_tier2_indices = set()
    idx_m = 0
    while idx_m + 2 < len(warped):
        w0, w1, w2 = warped[idx_m], warped[idx_m + 1], warped[idx_m + 2]
        if (
            0.075 <= w0["score_dur"] <= 0.100
            and 0.075 <= w1["score_dur"] <= 0.100
            and 0.150 <= w2["score_dur"] <= 0.200
            and w1["score_gap_prev"] <= 0.025
            and w2["score_gap_prev"] <= 0.025
            and 1 <= (w1["midi"] - w0["midi"]) <= 2
            and w2["midi"] == w0["midi"]
        ):
            mordent_tier2_indices.add(idx_m + 1)
            mordent_tier2_indices.add(idx_m + 2)
            idx_m += 3
        else:
            idx_m += 1

    melody_out = []
    last_t1 = -10.0
    for idx_w, wn in enumerate(warped):
        f_idx = min(T - 1, max(0, int(round(wn["start"] / dt))))
        act = float(act_curve[f_idx])
        is_low_triplet_w = wn["midi"] <= 65 and 0.076 <= wn["score_dur"] <= 0.095
        is_after_low_triplet_w = (
            idx_w > 0
            and warped[idx_w - 1]["midi"] <= 65
            and 0.076 <= warped[idx_w - 1]["score_dur"] <= 0.095
        )
        if wn.get("is_scalar_lick"):
            min_t1_gap = 0.045
        elif is_low_triplet_w or is_after_low_triplet_w:
            min_t1_gap = 0.058
        elif wn.get("is_accel_ostinato"):
            min_t1_gap = 0.072
        elif act >= 0.35 or wn["score_dur"] >= 0.110:
            min_t1_gap = 0.085
        else:
            min_t1_gap = 0.115
        # Lookahead Structural Priority: never let a short ornament (< 0.105s) steal the Tier-1 slot
        # when a longer structural melody note (>= 0.120s) arrives < min_t1_gap later!
        yields_to_next_structural = (
            not wn.get("is_accel_ostinato")
            and not wn.get("is_scalar_lick")
            and not is_low_triplet_w
            and wn["score_dur"] < 0.105
            and idx_w + 1 < len(warped)
            and (warped[idx_w + 1]["start"] - wn["start"]) < min_t1_gap
            and warped[idx_w + 1]["score_dur"] >= 0.120
        )
        leads_to_hold = (
            act < 0.45
            and (wn["start"] - last_t1) >= 0.085
            and (
                wn["dur"] >= 0.32
                or (idx_w + 1 < len(warped) and warped[idx_w + 1]["dur"] >= 0.46 and (warped[idx_w + 1]["start"] - wn["start"]) <= 0.52)
                or (idx_w + 2 < len(warped) and warped[idx_w + 2]["dur"] >= 0.46 and (warped[idx_w + 2]["start"] - wn["start"]) <= 0.55)
            )
        )
        if (
            idx_w not in mordent_tier2_indices
            and not yields_to_next_structural
            and (wn["dur"] >= 0.46 or (wn["start"] - last_t1) >= min_t1_gap or leads_to_hold)
        ):
            tier = 1
            last_t1 = wn["start"]
        else:
            tier = 2

        out_act = min(act, 0.38) if wn.get("is_ostinato_landing") else act
        out_row = [
            round(wn["start"], 4),
            round(wn["end"], 4),
            int(wn["midi"]),
            round(wn["conf"], 3),
            tier,
            round(out_act, 3),
        ]
        if wn.get("is_perc_tap"):
            out_row.append(1)
        elif wn.get("lane_hint") is not None:
            out_row.append(10 + int(wn["lane_hint"]))
        elif wn.get("local_hint") is not None:
            # pinned here only, not copied to other statements: 30..33 if it is the phrase's usual fingering (other
            # statements may follow it), 20..23 if it is a one-off exception (others ignore it)
            out_row.append((30 if wn.get("local_hint_votes") else 20) + int(wn["local_hint"]))
        melody_out.append(out_row)

    if act is not MISSING:
        ns['act'] = act
    if f_idx is not MISSING:
        ns['f_idx'] = f_idx
    if idx_m is not MISSING:
        ns['idx_m'] = idx_m
    if idx_w is not MISSING:
        ns['idx_w'] = idx_w
    if is_after_low_triplet_w is not MISSING:
        ns['is_after_low_triplet_w'] = is_after_low_triplet_w
    if is_low_triplet_w is not MISSING:
        ns['is_low_triplet_w'] = is_low_triplet_w
    if last_t1 is not MISSING:
        ns['last_t1'] = last_t1
    if leads_to_hold is not MISSING:
        ns['leads_to_hold'] = leads_to_hold
    if melody_out is not MISSING:
        ns['melody_out'] = melody_out
    if min_t1_gap is not MISSING:
        ns['min_t1_gap'] = min_t1_gap
    if mordent_tier2_indices is not MISSING:
        ns['mordent_tier2_indices'] = mordent_tier2_indices
    if out_act is not MISSING:
        ns['out_act'] = out_act
    if out_row is not MISSING:
        ns['out_row'] = out_row
    if tier is not MISSING:
        ns['tier'] = tier
    if w0 is not MISSING:
        ns['w0'] = w0
    if w1 is not MISSING:
        ns['w1'] = w1
    if w2 is not MISSING:
        ns['w2'] = w2
    if wn is not MISSING:
        ns['wn'] = wn
    if yields_to_next_structural is not MISSING:
        ns['yields_to_next_structural'] = yields_to_next_structural
