"""Long-short patterns keep their written rhythm: a line that goes long-short, long-short ... (8+ notes, each long note
about three times its short one, the same written length every time -- Mars 3:30-3:51, the cellos' 45 . 44 | 43 . 44 |
45 . 47 | 48 ..., a dotted 3+1 the whole way) is laid on that rhythm at the local tempo: the long notes on a steady
line fitted through their own attacks (the 3 cycles either side), each short note exactly three quarters of the way to
the next long note. Note by note, the alignment had the first two notes 0.3s late and every short note wandering
0.1-0.2s either side of its place (user, Nov 19: "the new entries are WAY late", "it should be 3+1 ... have you checked
to make sure it's timed exactly like that?"). Exact scores only.
"""

import numpy as np


def _pitch_attack(audio, t, midi, sr=22050):
    """Where a low note's pitch comes in near t: the half-way point of its rise (the note and the octave below), if it
    rises clearly (12 dB+) within 0.45s before to 0.35s after t."""
    import librosa
    a = max(0.0, t - 1.0)
    seg = audio[int(a * sr):int((t + 1.0) * sr)]
    if len(seg) < sr // 2:
        return None
    hop = 128
    C = np.abs(librosa.cqt(seg, sr=sr, hop_length=hop, fmin=librosa.midi_to_hz(midi - 12), n_bins=13 * 3, bins_per_octave=36))
    C = C.reshape(13, 3, -1).max(1)
    lev = 20 * np.log10(C[12] + 1e-6)
    tt = np.arange(len(lev)) * hop / sr + a
    idx = np.where((tt >= t - 0.45) & (tt <= t + 0.35))[0]
    if len(idx) < 5:
        return None
    sg = lev[idx]
    ip = int(np.argmax(sg))
    if ip == 0:
        return None
    fl = float(np.min(sg[:ip]))
    if sg[ip] - fl < 12:
        return None
    half = fl + 0.5 * (sg[ip] - fl)
    k = next(j for j in range(ip + 1) if sg[j] >= half)
    return float(tt[idx[k]])


def run(ns):
    sp, mo, warped = ns.get("score_path"), ns.get("melody_out"), ns.get("warped")
    audio = ns.get("audio_22k")
    if sp is None or sp.suffix.lower() not in (".mxl", ".musicxml", ".xml") or not mo or not warped:
        return
    n = min(len(mo), len(warped))
    sc = lambda k: float(warped[k]["score_start"])
    # (written length = time to the next note in the line, which a dotted pattern fills)
    wl = lambda k: sc(k + 1) - sc(k) if k + 1 < n else 0.0
    moved = 0
    k = 0
    while k < n - 1:
        # a long-short pair at k: long ~3x short, same staff
        def pair(i):
            if i + 2 >= n or warped[i].get("staff") != warped[i + 1].get("staff"):
                return None
            L, S = wl(i), wl(i + 1)
            if S <= 0.05 or not (2.5 <= L / S <= 3.5) or L + S > 2.0:
                return None
            return L + S
        c0 = pair(k)
        if c0 is None:
            k += 1
            continue
        j = k
        while pair(j + 2) is not None and abs(pair(j + 2) - c0) <= 0.03 and warped[j + 2].get("staff") == warped[k].get("staff"):
            j += 2
        # (the pattern's last long note, if the line goes on to it and it is long too -- Mars 2:13, the cor anglais'
        # 72 . 71 then a quick 70 71 72 73: that 71 is the next figure's start, not a long note to anchor on)
        S0 = wl(k + 1)
        longs = [q for q in range(k, j + 3, 2) if q < n and warped[q].get("staff") == warped[k].get("staff") and (q <= j or wl(q) >= 2.5 * S0)]
        if len(longs) >= 3:
            s = np.array([sc(q) for q in longs])
            t = np.array([float(mo[q][0]) for q in longs])
            # (a bass-register line -- averaging under E3: cellos and basses, soft bowed attacks under held chords -- is anchored on where each long
            # note's own pitch comes in, which the alignment hears late: Mars 3:30, 0.2-0.3s; user, Nov 19: "the cello
            # entry is still wrong")
            if np.mean([int(mo[q][2]) for q in longs]) < 52 and audio is not None:
                t = np.array([_pitch_attack(audio, float(mo[q][0]), int(mo[q][2])) or float(mo[q][0]) for q in longs])
            # (a steady line through the long notes around each one: 7 of them, shifted in at the ends of the pattern,
            # fitted robustly -- the median of the pairwise slopes -- so one late or early attack, often the first one,
            # coming in under a held chord, doesn't drag the line)
            fit, slopes = [], []
            W = min(7, len(longs))
            for i in range(len(longs)):
                lo = min(max(0, i - W // 2), len(longs) - W)
                ss_, tt_ = s[lo:lo + W], t[lo:lo + W]
                pairs = [(tt_[b] - tt_[a]) / (ss_[b] - ss_[a]) for a in range(W) for b in range(a + 1, W) if ss_[b] > ss_[a]]
                m = float(np.median(pairs))
                c = float(np.median(tt_ - m * ss_))
                fit.append(m * s[i] + c)
                slopes.append(m)
            new = {}
            for i, q in enumerate(longs):
                new[q] = fit[i]
                if i + 1 < len(longs) and q + 1 < longs[i + 1]:
                    frac = (sc(q + 1) - sc(q)) / (sc(longs[i + 1]) - sc(q))
                    new[q + 1] = fit[i] + frac * (fit[i + 1] - fit[i])
                elif i + 1 == len(longs) and q + 1 <= j + 1 and q + 2 < n:
                    # (the last pair's short note: on the same pace, toward where the next note would fall)
                    new[q + 1] = fit[i] + (sc(q + 1) - sc(q)) * slopes[i]
            for q, tn in new.items():
                if abs(tn - float(mo[q][0])) > 0.02:
                    d = float(mo[q][1]) - float(mo[q][0])
                    mo[q][0] = round(tn, 4)
                    mo[q][1] = round(tn + d, 4)
                    moved += 1
            qs = sorted(new)
            # (every long note is held, right up to the short note after it -- the alignment had cut some short by
            # articulation, so some 3s were holds and some taps; user, Nov 19: "I do think ALL of them should probably
            # be held")
            for q in longs:
                if q + 1 < n:
                    mo[q][1] = round(max(float(mo[q][1]), float(mo[q + 1][0]) - 0.015), 4)
                # (and flagged, 9th field = 1, so the chart holds it even when the pattern runs quick)
                while len(mo[q]) < 9:
                    mo[q].append(0)
                mo[q][8] = 1
            for q in range(max(0, qs[0] - 1), min(n - 1, qs[-1] + 1)):
                nxt = float(mo[q + 1][0])
                if float(mo[q][1]) > nxt - 0.015:
                    mo[q][1] = round(max(float(mo[q][0]) + 0.04, nxt - 0.015), 4)
            print(f"    -> long-short pattern in written rhythm at {float(mo[k][0]):.2f}s ({len(qs)} notes)")
            k = longs[-1]
        else:
            k += 1
    if moved:
        print(f"    -> long-short patterns: {moved} note(s) re-timed")
