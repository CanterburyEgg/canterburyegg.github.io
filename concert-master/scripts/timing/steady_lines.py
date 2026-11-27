"""Steady lines (exact scores): a stretch written in one even rhythm is laid on one smooth tempo curve.

A run of 8+ lead notes written with equal gaps (eighths or quicker, up to 0.5s) is fitted with a smooth curve of
audio time against score time (a straight line, or a gentle bend for a band that speeds up or slows down), and every
note in it goes onto that curve. The warp follows the recording note by note, so its noise (one note 0.05s early,
the next 0.05s late) is what the player feels as uneven; the curve keeps the band's real tempo and drops the noise
(Mercury 3:50-4:00: the celesta, piccolo and flute's even eighths came out 0.09-0.19s apart around a steady 0.14s;
user, Nov 27: "this whole song should likely have that time map correction, just to make sure the notes are pinned
properly. that's something we should mostly enforce across ALL songs, when the audio doesn't detect a slowdown and
the pattern is uniform. anything that snaps off of the chart would be a manual correction").

Left alone: a run where some note sits 0.12s+ off the curve (the recording really does something there -- a held
beat, a break; that's for a manual correction), notes laid out by hand (restored notes, time maps), and PDF-read
scores. The pins in <song>_restore.json still find a note that moved: restore_pins matches the time before this pass
too.
"""
import json
from pathlib import Path

MIN_NOTES = 8
OFF_CURVE = 0.12


def _even(g, g0):
    return 0.05 < g <= 0.5 and abs(g - g0) <= 0.03 * max(g, g0) + 0.005


def _fit(xs, ys, deg):
    # least squares polynomial (deg 1 or 2) without numpy
    n = deg + 1
    m = [[sum(x ** (i + j) for x in xs) for j in range(n)] for i in range(n)]
    v = [sum(y * x ** i for x, y in zip(xs, ys)) for i in range(n)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[p], v[c], v[p] = m[p], m[c], v[p], v[c]
        if abs(m[c][c]) < 1e-12:
            return None
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                m[r] = [a - f * b for a, b in zip(m[r], m[c])]
                v[r] -= f * v[c]
    co = [v[i] / m[i][i] for i in range(n)]
    return lambda x: sum(c * x ** i for i, c in enumerate(co))


def run(ns):
    warped, mo, sp = ns.get("warped"), ns.get("melody_out"), ns.get("score_path")
    if not isinstance(warped, list) or not isinstance(mo, list) or len(warped) != len(mo):
        return
    if sp is None or sp.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    corr = Path(__file__).resolve().parents[1] / f"{sp.stem.lower()}_corrections.json"
    rest = Path(__file__).resolve().parents[1] / f"{sp.stem.lower()}_restore.json"
    maps = json.loads(corr.read_text(encoding="utf-8")).get("time_map", []) if corr.exists() else []
    wins = json.loads(rest.read_text(encoding="utf-8")).get("windows", []) if rest.exists() else []
    n = len(mo)
    ss = [float(w.get("score_start", 0.0)) for w in warped]

    def fixed(k):
        if str(warped[k].get("staff", "")).startswith("Restored"):
            return True
        if any(float(t["score_from"]) - 0.01 <= ss[k] <= float(t["score_to"]) + 0.01 for t in maps):
            return True
        return any(float(a) <= float(mo[k][0]) <= float(b) for a, b in wins)

    orig = ns.setdefault("steady_orig", {})
    moved, skipped, k = 0, 0, 0
    done = set()  # (a run's last note can start the next run; it moves once)
    while k < n - 1:
        if fixed(k):
            k += 1
            continue
        g0 = ss[k + 1] - ss[k]
        m = k + 1
        while m < n and not fixed(m) and _even(ss[m] - ss[m - 1], g0):
            m += 1
        run_ = list(range(k, m))
        if len(run_) >= MIN_NOTES:
            xs = [ss[j] - ss[k] for j in run_]
            ys = [float(mo[j][0]) for j in run_]
            f = _fit(xs, ys, 2 if len(run_) >= 12 else 1)
            if f is not None:
                want = [f(x) for x in xs]
                # (a curve that runs backwards anywhere isn't a tempo)
                ok = all(b > a for a, b in zip(want, want[1:]))
                if ok and max(abs(w - y) for w, y in zip(want, ys)) < OFF_CURVE:
                    for j, t in zip(run_, want):
                        if j in done:
                            continue
                        done.add(j)
                        if abs(float(mo[j][0]) - t) >= 0.004:
                            orig.setdefault(j, float(mo[j][0]))
                            dur = float(mo[j][1]) - float(mo[j][0])
                            mo[j][0] = round(t, 4)
                            mo[j][1] = round(t + dur, 4)
                            warped[j]["start"] = t
                            moved += 1
                else:
                    skipped += 1
        k = max(m - 1, k + 1) if m - 1 > k else k + 1
    for j in range(1, n):
        if float(mo[j - 1][1]) > float(mo[j][0]) - 0.015:
            mo[j - 1][1] = round(max(float(mo[j - 1][0]) + 0.04, float(mo[j][0]) - 0.015), 4)
    if moved or skipped:
        print(f"    -> steady lines: {moved} note(s) laid on their run's tempo curve; {skipped} run(s) left for a closer look")
