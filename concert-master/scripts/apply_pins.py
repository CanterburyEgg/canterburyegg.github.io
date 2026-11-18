"""Apply note pins from the sandbox's pin mode to a song's corrections.

In the sandbox (sandbox/index.html, Pin mode) you tap each note where you hear it; "Copy pins" gives JSON like
  {"pins": [{"song": "jupiter", "at": 453.19, "midi": 75, "key": "K", "to": 453.05}, ...]}
where `at` is the note's time in the current build and `to` is where you tapped it.

    python scripts/apply_pins.py jupiter pins.json      (or pipe the JSON in on stdin)

For each pin this finds the build's melody note (same pitch, nearest to `at`), looks up its score position in a debug
trace, and writes an `audio_moves` entry (keep_length, so taps stay taps and holds keep their length) into
scripts/<song>_corrections.json -- replacing any earlier move of the same note. Then it rebuilds the chart and prints
where each pinned note landed. A song-specific correction, by ear: use it where the recording has no clear attack for
the alignment to find.
"""
import datetime
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MATCH = 0.15  # a pin's `at` must be within this of the build note it names


def build(song, audio, score, trace=None):
    env = dict(os.environ)
    if trace:
        env["CM_DEBUG_DUMP"] = str(trace)
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "sync_score.py"), str(audio), str(score)],
                       cwd=ROOT, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"build failed:\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    song = sys.argv[1]
    raw = Path(sys.argv[2]).read_text(encoding="utf-8") if len(sys.argv) > 2 else sys.stdin.read()
    # (several passes pasted one after another: each note's taps are averaged)
    dec, pos, sets = json.JSONDecoder(), 0, []
    while pos < len(raw):
        while pos < len(raw) and raw[pos] in " \t\r\n,":
            pos += 1
        if pos >= len(raw):
            break
        obj, pos = dec.raw_decode(raw, pos)
        sets.append(obj["pins"] if isinstance(obj, dict) else obj)
    groups = {}
    for s in sets:
        for p in s:
            if p.get("song", song) == song:
                groups.setdefault((int(p["midi"]), round(float(p["at"]), 3)), []).append(float(p["to"]))
    pins = []
    for (midi, at), tos in groups.items():
        avg = sum(tos) / len(tos)
        spread = max(tos) - min(tos)
        if len(tos) > 1:
            print(f"  midi {midi} at {at:.2f}: {len(tos)} taps, mean {avg:.3f}, spread {spread * 1000:.0f} ms")
        pins.append({"at": at, "midi": midi, "to": avg})
    if not pins:
        sys.exit("no pins for this song")

    sidecar_path = ROOT / "audio" / f"{song}.cadenza.json"
    score = ROOT / "scores" / json.loads(sidecar_path.read_text(encoding="utf-8"))["scoreFile"]
    audio = next((ROOT / "audio" / f"{song}{ext}" for ext in (".ogg", ".mp3", ".wav")
                  if (ROOT / "audio" / f"{song}{ext}").exists()), None)
    if audio is None:
        sys.exit(f"no audio for {song}")
    corr_path = ROOT / "scripts" / f"{score.stem.lower()}_corrections.json"
    corr = json.loads(corr_path.read_text(encoding="utf-8")) if corr_path.exists() else {}

    trace_path = ROOT / "scripts" / f".{song}_pin_trace.json"
    build(song, audio, score, trace_path)
    trace = json.loads(trace_path.read_text(encoding="utf-8"))["melody"]
    trace_path.unlink()
    mel = json.loads(sidecar_path.read_text(encoding="utf-8"))["melodyNotes"]

    moves = corr.setdefault("audio_moves", [])
    today = datetime.date.today().strftime("%b %d").replace(" 0", " ")
    done = []
    for p in sorted(pins, key=lambda q: q["at"]):
        cands = [k for k in range(min(len(mel), len(trace))) if int(mel[k][2]) == int(p["midi"])
                 and abs(float(mel[k][0]) - float(p["at"])) <= MATCH]
        if not cands:
            print(f"  ! no build note midi {p['midi']} near {p['at']:.2f} -- skipped (rebuild changed? re-pin it)")
            continue
        k = min(cands, key=lambda c: abs(float(mel[c][0]) - float(p["at"])))
        ss = round(float(trace[k]["score_start"]), 4)
        to = round(float(mel[k][0]) + float(p["to"]) - float(p["at"]), 4)
        moves[:] = [m for m in moves if not (abs(float(m["score_start"]) - ss) < 0.02 and int(m["midi"]) == int(p["midi"]))]
        m_, s_ = divmod(to, 60)
        moves.append({
            "score_start": ss, "midi": int(p["midi"]), "to": to, "keep_length": True,
            "why": f"{int(m_)}:{s_:05.2f} (score {ss}): pinned by ear in the sandbox (user, {today}).",
        })
        done.append((ss, int(p["midi"]), float(mel[k][0]), to))
    corr_path.write_text(json.dumps(corr, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  {len(done)} pin(s) written to {corr_path.relative_to(ROOT)}")

    build(song, audio, score)
    mel = json.loads(sidecar_path.read_text(encoding="utf-8"))["melodyNotes"]
    for ss, midi, was, to in done:
        now = min((float(r[0]) for r in mel if int(r[2]) == midi), key=lambda t: abs(t - to))
        print(f"  score {ss:.2f} midi {midi}: {was:.2f} -> {now:.2f}" + ("" if abs(now - to) < 0.01 else f"  (wanted {to:.2f})"))


if __name__ == "__main__":
    main()
