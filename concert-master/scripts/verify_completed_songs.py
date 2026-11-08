#!/usr/bin/env python3
"""
Post-build regression & audit verifier for completed Cadenza charts.
Executes the live `cadenza/audio-engine.js` via macOS JavaScriptCore (`jsc`)
against each completed song's `.cadenza.json` sidecar, diffs every note/hold/chord/space
event against the locked baseline (`completed_songs_baseline.json`), and prints
a section-by-section musical audit whenever any completed song changes.

Usage:
  python3 cadenza/scripts/verify_completed_songs.py            # Run check & print audit
  python3 cadenza/scripts/verify_completed_songs.py --accept   # Lock current state as baseline
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
AUDIO_ENGINE_JS = ROOT_DIR / "audio-engine.js"
BASELINE_PATH = ROOT_DIR / "scripts" / "completed_songs_baseline.json"
JSC_BIN = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"

# Official roster of completed & verified songs
COMPLETED_SONGS = [
    ("arabesque", "Arabesque (Samuel R. Hazo)", ROOT_DIR / "audio" / "arabesque.cadenza.json"),
    ("sevens", "Sevens (Samuel R. Hazo)", ROOT_DIR / "audio" / "sevens.cadenza.json"),
    ("ride", "Ride (Samuel R. Hazo)", ROOT_DIR / "audio" / "ride.cadenza.json"),
    ("what-we-do", "What We Do (RuneScape 3)", ROOT_DIR / "audio" / "what-we-do.cadenza.json"),
    ("sound-of-guthix", "The Sound of Guthix (RuneScape 3)", ROOT_DIR / "audio" / "sound-of-guthix.cadenza.json"),
]

KEY_LABELS_4K = {-1: "SPACE", 0: "D", 1: "F", 2: "J", 3: "K"}


def build_chart_via_jsc(sidecar_path: Path, key_mode: str = "4k-space", density: str = "fewer"):
    """Runs the live `cadenza/audio-engine.js` in JavaScriptCore and returns the built chart."""
    js_code = AUDIO_ENGINE_JS.read_text(encoding="utf-8")
    # Strip ES module exports so jsc can evaluate it directly
    clean_js = re.sub(r"\bexport\s+", "", js_code)

    runner_js = f"""
{clean_js}
const sidecar = JSON.parse(readFile({json.dumps(str(sidecar_path))}));
const features = hydrateSidecarFeatures(sidecar, null);
const chart = buildChart(features, {{ keyMode: {json.dumps(key_mode)}, density: {json.dumps(density)} }});
const slim = chart.notes.map(n => ({{
  time: Math.round(n.time * 10000) / 10000,
  endTime: Math.round(n.endTime * 10000) / 10000,
  type: n.type,
  lane: n.lane,
  midi: n.midi || 0,
  isPercussionSolo: !!n.isPercussionSolo,
  isChordPartner: !!n.isChordPartner
}}));
print(JSON.stringify(slim));
"""
    tmp_path = Path("/tmp/cadenza_verify_runner.js")
    tmp_path.write_text(runner_js, encoding="utf-8")

    try:
        res = subprocess.run([JSC_BIN, str(tmp_path)], capture_output=True, text=True, check=True)
        return json.loads(res.stdout.strip())
    finally:
        tmp_path.unlink(missing_ok=True)


def compute_current_snapshot():
    snapshot = {}
    for song_id, title, sidecar_path in COMPLETED_SONGS:
        raw_bytes = sidecar_path.read_bytes()
        sidecar_sha256 = hashlib.sha256(raw_bytes).hexdigest()
        notes_4k = build_chart_via_jsc(sidecar_path, key_mode="4k-space", density="fewer")
        snapshot[song_id] = {
            "title": title,
            "sidecar_sha256": sidecar_sha256,
            "notes_4k_space": notes_4k,
        }
    return snapshot


def fmt_time(sec: float) -> str:
    m = int(sec // 60)
    s = sec % 60
    return f"{m}:{s:05.2f}"


def fmt_note(n: dict) -> str:
    lbl = KEY_LABELS_4K.get(n["lane"], f"L{n['lane']}")
    if n["type"] == "hold":
        dur = n["endTime"] - n["time"]
        return f"{lbl}[HOLD {dur:.2f}s]"
    if n.get("isPercussionSolo"):
        return f"{lbl}[PERC]"
    if n.get("isChordPartner"):
        return f"{lbl}[CHORD]"
    return lbl


def diff_song(song_id: str, old_entry: dict, new_entry: dict) -> bool:
    title = new_entry["title"]
    sidecar_changed = old_entry["sidecar_sha256"] != new_entry["sidecar_sha256"]

    # Compare primary melodic/percussion notes (excluding chord partners & spacebars unless count differs)
    old_mel = [n for n in old_entry["notes_4k_space"] if n["lane"] >= 0 and not n.get("isChordPartner")]
    new_mel = [n for n in new_entry["notes_4k_space"] if n["lane"] >= 0 and not n.get("isChordPartner")]

    if old_entry["notes_4k_space"] == new_entry["notes_4k_space"] and not sidecar_changed:
        print(f"✅ {title}: 0 changes (100% identical to baseline, {len(new_mel)} playable notes)")
        return False

    print(f"⚠️  {title}: CHANGES DETECTED! (sidecar JSON modified: {sidecar_changed})")
    if len(old_mel) != len(new_mel):
        print(f"   Note count changed: {len(old_mel)} -> {len(new_mel)}")

    min_len = min(len(old_mel), len(new_mel))
    diff_indices = [
        i for i in range(min_len)
        if old_mel[i]["lane"] != new_mel[i]["lane"]
        or old_mel[i]["type"] != new_mel[i]["type"]
        or abs(old_mel[i]["time"] - new_mel[i]["time"]) > 0.005
    ]

    if not diff_indices and len(old_mel) == len(new_mel):
        print("   Only secondary spacebar/chord events changed.")
        return True

    # Group changed indices into contiguous musical sections (within 3.5s)
    sections = []
    for idx in diff_indices:
        if not sections or new_mel[idx]["time"] - new_mel[sections[-1][-1]]["time"] > 3.5:
            sections.append([idx])
        else:
            sections[-1].append(idx)

    print(f"   {len(diff_indices)} notes changed across {len(sections)} musical section(s):")
    for s_idx, sec in enumerate(sections, 1):
        i0 = max(0, sec[0] - 2)
        i1 = min(min_len - 1, sec[-1] + 2)
        t0, t1 = new_mel[sec[0]]["time"], new_mel[sec[-1]]["time"]
        print(f"\n   --- Section {s_idx}: {fmt_time(t0)} – {fmt_time(t1)} (notes {sec}) ---")
        for k in range(i0, i1 + 1):
            o_n, n_n = old_mel[k], new_mel[k]
            dt = n_n["time"] - new_mel[k - 1]["time"] if k > 0 else 99.0
            dp = n_n["midi"] - new_mel[k - 1]["midi"] if k > 0 else 0
            mark = " <--- CHANGED" if k in sec else ""
            print(
                f"     [{k:3d}] {fmt_time(n_n['time'])} midi={n_n['midi']:2d} "
                f"(dp={dp:+2d}, dt={dt:.2f}s) | Old: {fmt_note(o_n):4s} -> New: {fmt_note(n_n):4s}{mark}"
            )
    return True


def main():
    parser = argparse.ArgumentParser(description="Verify completed Cadenza songs against baseline.")
    parser.add_argument("--accept", action="store_true", help="Save current chart outputs as the new baseline.")
    args = parser.parse_args()

    current = compute_current_snapshot()
    if args.accept or not BASELINE_PATH.exists():
        BASELINE_PATH.write_text(json.dumps(current, indent=2), encoding="utf-8")
        print(f"Saved baseline for {len(current)} completed songs to {BASELINE_PATH}")
        for song_id, entry in current.items():
            mel_count = sum(1 for n in entry["notes_4k_space"] if n["lane"] >= 0 and not n.get("isChordPartner"))
            print(f"  - {entry['title']}: {mel_count} playable notes locked")
        return 0

    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    any_changed = False
    for song_id, _, _ in COMPLETED_SONGS:
        if song_id not in baseline:
            print(f"⚠️  {song_id} missing from baseline!")
            any_changed = True
            continue
        if diff_song(song_id, baseline[song_id], current[song_id]):
            any_changed = True

    if any_changed:
        print("\nAudit required! Review the sections above with the user before running `--accept`.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
