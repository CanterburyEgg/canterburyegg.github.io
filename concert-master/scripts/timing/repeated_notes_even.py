"""Repeated notes even: a quick run of one note struck 3+ times (each strike under 0.45s after the last, the gaps
within a third of each other) is spaced evenly between its first and last strike. A drummed-out repeat is felt as a
pulse, and a score or alignment that wobbles it (0.18 / 0.16 / 0.20) makes the taps feel off (Gnome Village II 0:17:
the cello's phrase-end 30 30 30 30; user, Nov 27: "make sure this DDDD is spaced evenly. We should have a spacing
rule for that").
"""


def run(ns):
    mo = ns.get("melody_out")
    if not isinstance(mo, list) or len(mo) < 3:
        return
    n = len(mo)
    moved = 0
    k = 0
    while k < n - 2:
        m = k + 1
        while m < n and int(mo[m][2]) == int(mo[k][2]) and float(mo[m][0]) - float(mo[m - 1][0]) < 0.45:
            m += 1
        run_ = list(range(k, m))
        if len(run_) >= 3:
            gaps = [float(mo[j][0]) - float(mo[j - 1][0]) for j in run_[1:]]
            if min(gaps) > 0.05 and max(gaps) / min(gaps) <= 1.35 and max(gaps) - min(gaps) >= 0.01:
                t0, t1 = float(mo[run_[0]][0]), float(mo[run_[-1]][0])
                step = (t1 - t0) / (len(run_) - 1)
                for i, j in enumerate(run_[1:-1], start=1):
                    dur = float(mo[j][1]) - float(mo[j][0])
                    t = t0 + i * step
                    mo[j][0] = round(t, 4)
                    mo[j][1] = round(min(t + dur, t0 + (i + 1) * step - 0.015), 4)
                    moved += 1
                for j in run_[:-1]:
                    mo[j][1] = round(min(float(mo[j][1]), float(mo[j + 1][0]) - 0.015), 4)
        k = max(m, k + 1)
    if moved:
        print(f"    -> repeated notes even: {moved} strike(s) spaced evenly")
