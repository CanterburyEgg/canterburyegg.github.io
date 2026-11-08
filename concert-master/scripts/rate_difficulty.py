#!/usr/bin/env python3
"""
Concert Master difficulty rater (DFJK charts, Easy & Hard).

Plays each song's real chart through the live `audio-engine.js` (via macOS JavaScriptCore, same harness as
`verify_completed_songs.py`) and scores it on two axes, in the spirit of osu!/StepMania strain ratings:

  1. BURST (55%): every note adds effort ~ 1 / (time since the SAME hand last played), x1.35 for a repeated key,
     +0.6 for holds. Strain accumulates and decays with a 1s half-life; the song's hardest seconds are summed with
     a 0.9 falloff (sum of top per-second peaks * 0.9^i / 10).
  2. ENDURANCE (45%): 2 x mean strain across the hardest 60-second window, plus a long-stream bonus
     2 * log2(1 + longest unbroken stream seconds / 10)  (stream = consecutive notes < 0.36s apart).

Final score -> rating:  < 4.5 = 0 (Warm-up)  |  4.5-8 = 1  |  8-11 = 2  |  11-14.5 = 3  |  14.5-18 = 4  |  >= 18 = 5 (extra-hard)

Usage:
  python3 concert-master/scripts/rate_difficulty.py          # rate every song and write concert-master/ratings.json
"""

import json
import math
import sys
from pathlib import Path

import numpy as np

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_completed_songs import build_chart_via_jsc  # noqa: E402

OUT_PATH = ROOT_DIR / "ratings.json"

# Song id (as used in game.js BUILTIN_REPERTOIRE) -> sidecar chart
SONGS = {
    "sound-of-guthix": "sound-of-guthix.cadenza.json",
    "sevens": "sevens.cadenza.json",
    "ride": "ride.cadenza.json",
    "what-we-do": "what-we-do.cadenza.json",
    "arabesque": "arabesque.cadenza.json",
    "jupiter": "jupiter.cadenza.json",
    "maslanka4": "maslanka-symphony-4.cadenza.json",
}

BANDS = [(4.5, 0), (8.0, 1), (11.0, 2), (14.5, 3), (18.0, 4)]


def score_to_rating(score: float) -> int:
    for limit, rating in BANDS:
        if score < limit:
            return rating
    return 5


def strain_curve(times, lanes, holds):
    strain = 0.0
    last_t = None
    last_lane = {0: None, 1: None}
    last_hand_t = {0: -9.0, 1: -9.0}
    curve = []
    for t, ln, hd in zip(times, lanes, holds):
        if last_t is not None:
            strain *= 0.5 ** ((t - last_t) / 1.0)
        hand = 0 if ln <= 1 else 1
        effort = 1.0 / max(0.06, t - last_hand_t[hand])
        if last_lane[hand] == ln:
            effort *= 1.35
        if hd:
            effort += 0.6
        strain += effort * 0.15
        curve.append(strain)
        last_t = t
        last_hand_t[hand] = t
        last_lane[hand] = ln
    return np.array(curve)


def rate_chart(sidecar: Path, density: str) -> dict:
    dur = float(json.loads(sidecar.read_text())["duration"])
    notes = sorted(
        (n for n in build_chart_via_jsc(sidecar, key_mode="4k", density=density) if not n["isChordPartner"]),
        key=lambda n: n["time"],
    )
    t = np.array([n["time"] for n in notes])
    lanes = [n["lane"] for n in notes]
    holds = [n["type"] == "hold" for n in notes]
    if len(t) < 10:
        return {"score": 0.0, "rating": 0, "notes": int(len(t))}
    s = strain_curve(t, lanes, holds)

    per_sec = np.zeros(int(dur) + 2)
    for ti, si in zip(t, s):
        per_sec[int(ti)] = max(per_sec[int(ti)], si)
    top = np.sort(per_sec)[::-1]
    burst = float(np.sum(top * (0.9 ** np.arange(len(top))))) / 10.0

    best60 = 0.0
    for a in np.arange(0.0, max(1.0, dur - 60.0), 1.0):
        m = (t >= a) & (t < a + 60.0)
        if m.any():
            best60 = max(best60, float(np.mean(s[m])))
    gaps = np.diff(t)
    longest_span, run_start = 0.0, 0
    for i, g in enumerate(gaps):
        if g >= 0.36:
            longest_span = max(longest_span, float(t[i] - t[run_start]))
            run_start = i + 1
    longest_span = max(longest_span, float(t[-1] - t[run_start]))
    endurance = 2.0 * best60 + 2.0 * math.log2(1.0 + longest_span / 10.0)

    score = 0.55 * burst + 0.45 * endurance
    return {
        "score": round(score, 2),
        "rating": score_to_rating(score),
        "burst": round(burst, 2),
        "endurance": round(endurance, 2),
        "notes": int(len(t)),
    }


def main():
    out = {}
    for song_id, fname in SONGS.items():
        sidecar = ROOT_DIR / "audio" / fname
        if not sidecar.exists():
            continue
        hard = rate_chart(sidecar, "more")
        easy = rate_chart(sidecar, "fewer")
        out[song_id] = {"hard": hard, "easy": easy}
        stars = "♬♬♬♬" if hard["rating"] == 5 else ("♩" * hard["rating"] + "○" * (4 - hard["rating"]))
        print(f"{song_id:16s} HARD {hard['score']:6.2f} -> {hard['rating']} {stars:5s} | EASY {easy['score']:6.2f} -> {easy['rating']}")
    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
