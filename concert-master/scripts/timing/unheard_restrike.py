"""Unheard re-strike: a short note struck again on the same pitch as a held note plays as one hold when the
recording doesn't re-attack it.

`order_and_fuse_ties` already fuses same-pitch notes across a written barline/tie when the audio shows no new attack,
but only after a long note (0.68s+ written). A shorter written note that runs straight on (no written gap, same part)
into the same pitch held (0.68s+) is the same situation when the recording carries straight through it (Jupiter
0:46.8: the violins' 86 then 86 held, heard in the band as one held note; 1:13.4: the horns' 50 50-held after 60 57 54
50 plays F50 F50-hold). If the recording re-attacks the
second note -- a new onset, or the sound dipping by more than ~15% (Sevens 2:28-2:31's 72 72h, 77 77h, 79 79h;
3:18.6's 77 77h) -- it stays a double hit. (Sevens 3:10.9's 77 77 77h keeps all its hits the same way: the
recording dips into each one.)
"""
import os

from timing import MISSING


def run(ns):
    warped = ns.get('warped', MISSING)
    a_ons_raw = ns.get('a_ons_raw', MISSING)
    mix_rms = ns.get('mix_rms', MISSING)
    dt = ns.get('dt', MISSING)
    np = ns.get('np', MISSING)
    if any(x is MISSING for x in (warped, a_ons_raw, mix_rms, dt, np)) or not warped:
        return
    dbg = os.environ.get("CM_RESTRIKE_DEBUG")
    out = [warped[0]]
    merged = 0
    for wn in warped[1:]:
        p = out[-1]
        if (wn["midi"] == p["midi"] and wn.get("staff") == p.get("staff")
                and p["score_dur"] < 0.68 and wn["score_dur"] >= 0.68
                and wn.get("score_gap_prev", 1.0) <= 0.03 and wn["start"] - p["start"] <= 0.75):
            fi = int(round(wn["start"] / dt))
            if 3 < fi < len(mix_rms) - 4:
                ac_pk = float(np.max(a_ons_raw[fi - 2: fi + 3]))
                ac_med = float(np.median(a_ons_raw[max(0, fi - 25): min(len(a_ons_raw), fi + 25)])) + 1e-6
                r_pre = float(np.max(mix_rms[max(0, fi - 10): max(1, fi - 1)])) + 1e-6
                r_min = float(np.min(mix_rms[fi - 3: fi + 2]))
                if dbg:
                    print(f"    [restrike] {wn['start']:.2f} midi={wn['midi']} onset={ac_pk / ac_med:.2f} dip={r_min / r_pre:.2f}")
                if (ac_pk / ac_med) < 1.55 and (r_min / r_pre) > 0.85:
                    p["end"] = max(p["end"], wn["end"])
                    p["dur"] = p["end"] - p["start"]
                    p["score_dur"] += wn["score_dur"]
                    merged += 1
                    continue
        out.append(wn)
    if merged:
        print(f"    -> unheard re-strike: {merged} short note(s) + held note on the same pitch played as one hold")
    ns['warped'] = out
