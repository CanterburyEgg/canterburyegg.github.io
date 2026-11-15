"""Held landings on their attack: a held note (written 0.8s+) straight after a quick note (written 0.2s or less before
it) that the warp left late -- its gap from that quick note stretched 1.3x+ past the written pace of the two notes
before, with a clear attack 0.03-0.08s earlier -- moves back onto that attack (Ride 1:41: the clarinets' 72 -> held
79 came in 0.05s after its attack).
"""


def run(ns):
    warped = ns.get("warped")
    melody_out = ns.get("melody_out")
    _peak_near = ns.get("_peak_near")  # noqa: F841
    if not isinstance(warped, list) or not isinstance(melody_out, list) or len(warped) != len(melody_out):
        return
    nm = len(melody_out)
    # Held landings on their attack: a held note (written 0.8s+) straight after a quick note (written 0.2s or less
    # before it) that the warp left late -- its gap from that quick note stretched 1.3x+ past the written pace of the
    # two notes before, with a clear attack 0.03-0.08s earlier -- moves back onto that attack (Ride 1:41: the
    # clarinets' 72 -> held 79 came in 0.05s after its attack).
    for k in range(2, nm):
        if float(warped[k].get("score_dur", 0) or 0) < 0.8:
            continue
        s0_, s1_, s2_ = (float(warped[j]["score_start"]) for j in (k - 2, k - 1, k))
        t0_, t1_, t2_ = (float(melody_out[j][0]) for j in (k - 2, k - 1, k))
        if not (0.03 < s2_ - s1_ <= 0.2 and 0.03 < s1_ - s0_ <= 0.4 and t1_ > t0_):
            continue
        pace = (t1_ - t0_) / (s1_ - s0_)
        if t2_ - t1_ < 1.3 * pace * (s2_ - s1_):
            continue
        pk = _peak_near(t2_ - 0.055, 0.025, true_peak=True)
        if pk is not None and 0.03 <= t2_ - pk <= 0.08 and pk > t1_ + 0.06:
            print(f"    -> held landing at {t2_:.2f}s moved to its attack at {pk:.2f}s")
            d = float(melody_out[k][1]) - t2_
            melody_out[k][0] = round(pk, 4)
            melody_out[k][1] = round(pk + d, 4)
            melody_out[k - 1][1] = round(min(float(melody_out[k - 1][1]), pk - 0.015), 4)
