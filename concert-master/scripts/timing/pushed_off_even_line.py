"""One note pushed off an even line: inside a stretch written evenly (3 steady gaps, up to 0.4s each), a single note
that came out 0.1s+ away from the written spot between its neighbours -- its gap before stretched and its gap after
squeezed (or the other way round) against the steady gap leading in -- goes back to that spot (Ride 2:01: 70 72 74
75 written 0.36s apart, the 75 came out 0.53s after the 74 and 0.26s before the next note).
"""


def run(ns):
    warped = ns.get("warped")
    melody_out = ns.get("melody_out")
    _peak_near = ns.get("_peak_near")  # noqa: F841
    if not isinstance(warped, list) or not isinstance(melody_out, list) or len(warped) != len(melody_out):
        return
    nm = len(melody_out)
    # One note pushed off an even line: inside a stretch written evenly (3 steady gaps, up to 0.4s each), a single note
    # that came out 0.1s+ away from the written spot between its neighbours -- its gap before stretched and its gap
    # after squeezed (or the other way round) against the steady gap leading in -- goes back to that spot (Ride 2:01:
    # 70 72 74 75 written 0.36s apart, the 75 came out 0.53s after the 74 and 0.26s before the next note).
    for k in range(2, nm - 1):
        ss = [float(warped[j]["score_start"]) for j in range(k - 2, k + 2)]
        sgs = [b - a for a, b in zip(ss, ss[1:])]
        if not (0.03 < min(sgs) and max(sgs) <= 0.4 and max(sgs) <= 1.15 * min(sgs)):
            continue
        ts = [float(melody_out[j][0]) for j in range(k - 2, k + 2)]
        ags = [b - a for a, b in zip(ts, ts[1:])]
        if min(ags) <= 0:
            continue
        ref, g_in, g_out = ags
        want = ts[1] + (ts[3] - ts[1]) * sgs[1] / (sgs[1] + sgs[2])
        lopsided = (g_in >= 1.35 * ref and g_out * 1.35 <= ref) or (g_out >= 1.35 * ref and g_in * 1.35 <= ref)
        if lopsided and abs(want - ts[2]) >= 0.1:
            print(f"    -> note pushed off an even line at {ts[2]:.2f}s put back at {want:.2f}s")
            d = float(melody_out[k][1]) - ts[2]
            melody_out[k][0] = round(want, 4)
            melody_out[k][1] = round(min(want + d, ts[3] - 0.015), 4)
            melody_out[k - 1][1] = round(min(float(melody_out[k - 1][1]), want - 0.015), 4)
