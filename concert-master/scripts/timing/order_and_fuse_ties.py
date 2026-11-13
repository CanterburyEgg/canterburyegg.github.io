"""Enforce strict monotonic ordering and fuse un-articulated MIDI barline ties on identical pitch

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    _short_between_holds = ns.get('_short_between_holds', MISSING)
    a_ons_raw = ns.get('a_ons_raw', MISSING)
    ac_med = ns.get('ac_med', MISSING)
    ac_pk = ns.get('ac_pk', MISSING)
    dt = ns.get('dt', MISSING)
    fi = ns.get('fi', MISSING)
    fused_ties = ns.get('fused_ties', MISSING)
    is_long_tie = ns.get('is_long_tie', MISSING)
    k = ns.get('k', MISSING)
    mix_rms = ns.get('mix_rms', MISSING)
    np = ns.get('np', MISSING)
    r_min = ns.get('r_min', MISSING)
    r_pre = ns.get('r_pre', MISSING)
    warped = ns.get('warped', MISSING)
    wn = ns.get('wn', MISSING)

    # Enforce strict monotonic ordering and fuse un-articulated MIDI barline ties on identical pitch
    warped.sort(key=lambda x: x["start"])
    fused_ties = []
    for wn in warped:
        if fused_ties and wn["start"] - fused_ties[-1]["start"] < 0.048:
            if wn["score_dur"] > fused_ties[-1]["score_dur"] * 1.5 and wn["end"] > fused_ties[-1]["end"] + 0.20:
                if fused_ties[-1]["score_dur"] >= 0.25 and wn["end"] > fused_ties[-1]["start"] + 0.35:
                    wn["start"] = fused_ties[-1]["start"] + 0.08
                    wn["dur"] = wn["end"] - wn["start"]
                    fused_ties[-1]["end"] = wn["start"] - 0.015
                    fused_ties[-1]["dur"] = fused_ties[-1]["end"] - fused_ties[-1]["start"]
                else:
                    fused_ties[-1] = wn
                    continue
            else:
                continue
        if (
            fused_ties
            and not wn.get("is_coda_fanfare_tap")
            and not (wn is warped[-1] and wn["score_gap_prev"] >= 0.08)
            and wn["midi"] == fused_ties[-1]["midi"]
            and fused_ties[-1]["score_dur"] >= 0.68
            and wn["score_dur"] >= 0.35
            and ((wn["start"] - fused_ties[-1]["end"]) <= 0.085 or (wn["score_gap_prev"] <= 0.03 and wn["staff"] == fused_ties[-1]["staff"]))
        ):
            # Check if the live performance actually re-articulated this repeated pitch!
            fi = int(round(wn["start"] / dt))
            if 3 < fi < len(mix_rms) - 4:
                ac_pk = float(np.max(a_ons_raw[fi - 2 : fi + 3]))
                ac_med = float(np.median(a_ons_raw[max(0, fi - 25) : min(len(a_ons_raw), fi + 25)])) + 1e-6
                r_pre = float(np.max(mix_rms[max(0, fi - 10) : max(1, fi - 1)])) + 1e-6
                r_min = float(np.min(mix_rms[fi - 3 : fi + 2]))
                is_long_tie = wn["score_gap_prev"] <= 0.03 and wn["staff"] == fused_ties[-1]["staff"] and fused_ties[-1]["score_dur"] >= 1.0
                if ((ac_pk / ac_med) < 1.55 and (r_min / r_pre) > 0.62) or (is_long_tie and (r_min / r_pre) > 0.78 and (ac_pk / ac_med) < 2.1):
                    # Pure tied sustain across MIDI/PDF barline or internal tie -> fuse into unbroken Hold Ribbon!
                    fused_ties[-1]["end"] = max(fused_ties[-1]["end"], wn["end"])
                    fused_ties[-1]["dur"] = fused_ties[-1]["end"] - fused_ties[-1]["start"]
                    fused_ties[-1]["score_dur"] += wn["score_dur"]
                    continue
        fused_ties.append(wn)
    warped = fused_ties

    def _short_between_holds(k):
        # A short note sitting between two notes of its own part that are each at least twice as long (e.g. Guthix
        # 1:05's half-beat Choir Bb between a 4-beat and a 2-beat hold) is part of a sustained line, not a walking step.
        me = warped[k]
        prv = next((warped[j] for j in range(k - 1, -1, -1) if warped[j].get("staff") == me.get("staff")), None)
        nxt = next((warped[j] for j in range(k + 1, len(warped)) if warped[j].get("staff") == me.get("staff")), None)
        return (
            prv is not None and nxt is not None
            and float(nxt["start"]) - float(me["start"]) < 0.78
            and prv["score_dur"] >= 2 * me["score_dur"]
            and nxt["score_dur"] >= 2 * me["score_dur"]
        )

    for k in range(len(warped) - 1):
        if warped[k]["end"] > warped[k + 1]["start"] - 0.015:
            warped[k]["end"] = max(warped[k]["start"] + 0.035, warped[k + 1]["start"] - 0.015)
            warped[k]["dur"] = warped[k]["end"] - warped[k]["start"]
        if warped[k].get("is_ostinato_landing"):
            warped[k]["end"] = max(
                warped[k]["end"],
                min(warped[k + 1]["start"] - 0.015, warped[k]["start"] + max(0.68, warped[k]["score_dur"])),
            )
            warped[k]["dur"] = warped[k]["end"] - warped[k]["start"]
        # Prevent walking quarter-note / triplet steps (score_dur 0.45..0.64s, audio dur < 0.72s) from randomly
        # crossing the 0.46s Hold Ribbon threshold when moving directly into the next note. Longer written notes
        # (dotted quarters and up, e.g. Sevens 2:32 trumpet 82 -> 84) are sustained, so they stay holds.
        elif (
            0.45 <= warped[k]["score_dur"] <= 0.64
            and not warped[k].get("keep_hold")
            and not _short_between_holds(k)
            and warped[k]["dur"] < 0.72
            and (warped[k + 1]["start"] - warped[k]["start"]) < 0.78
        ):
            warped[k]["end"] = min(warped[k]["end"], warped[k]["start"] + 0.32)
            warped[k]["dur"] = warped[k]["end"] - warped[k]["start"]

    if _short_between_holds is not MISSING:
        ns['_short_between_holds'] = _short_between_holds
    if ac_med is not MISSING:
        ns['ac_med'] = ac_med
    if ac_pk is not MISSING:
        ns['ac_pk'] = ac_pk
    if fi is not MISSING:
        ns['fi'] = fi
    if fused_ties is not MISSING:
        ns['fused_ties'] = fused_ties
    if is_long_tie is not MISSING:
        ns['is_long_tie'] = is_long_tie
    if k is not MISSING:
        ns['k'] = k
    if r_min is not MISSING:
        ns['r_min'] = r_min
    if r_pre is not MISSING:
        ns['r_pre'] = r_pre
    if warped is not MISSING:
        ns['warped'] = warped
    if wn is not MISSING:
        ns['wn'] = wn
