#!/usr/bin/env python3
"""
Post-build regression & audit verifier for completed Concert Master charts (Hard / More Notes on D F J K).
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
# Review checkpoint: snapshot of the last build the user finished reviewing (sandbox can diff against it).
# Independent of the locked baseline above.
CHECKPOINT_PATH = ROOT_DIR / "scripts" / "review_checkpoint.json"
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

# The ONLY supported audit mode: Hard (More Notes) on D F J K. All other key layouts / densities are deprecated.
AUDIT_KEY_MODE = "4k"
AUDIT_DENSITY = "more"


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
        notes = build_chart_via_jsc(sidecar_path, key_mode=AUDIT_KEY_MODE, density=AUDIT_DENSITY)
        snapshot[song_id] = {
            "title": title,
            "sidecar_sha256": sidecar_sha256,
            "mode": f"{AUDIT_KEY_MODE}:{AUDIT_DENSITY}",
            "notes": notes,
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
    old_mel = [n for n in old_entry["notes"] if n["lane"] >= 0 and not n.get("isChordPartner")]
    new_mel = [n for n in new_entry["notes"] if n["lane"] >= 0 and not n.get("isChordPartner")]

    if old_entry["notes"] == new_entry["notes"] and not sidecar_changed:
        print(f"✅ {title}: 0 changes (100% identical to baseline, {len(new_mel)} playable notes)")
        return False

    print(f"⚠️  {title}: CHANGES DETECTED! (sidecar JSON modified: {sidecar_changed})")
    if len(old_mel) != len(new_mel):
        print(f"   Note count changed: {len(old_mel)} -> {len(new_mel)}")

    # Time-aligned diff: a note is unchanged if the other chart has a note with the same key, type and
    # (for holds) length within 6ms. Unmatched notes are reported as removed (old only) / added (new only).
    def _same(a, b):
        return (
            a["lane"] == b["lane"]
            and a["type"] == b["type"]
            and abs(a["time"] - b["time"]) <= 0.006
            and abs(a["endTime"] - b["endTime"]) <= 0.02
        )

    def _unmatched(src, other):
        out, j = [], 0
        for n in src:
            while j < len(other) and other[j]["time"] < n["time"] - 0.05:
                j += 1
            k = j
            hit = False
            while k < len(other) and other[k]["time"] <= n["time"] + 0.05:
                if _same(n, other[k]):
                    hit = True
                    break
                k += 1
            if not hit:
                out.append(n)
        return out

    old_all = [n for n in old_entry["notes"] if n["lane"] >= 0]
    new_all = [n for n in new_entry["notes"] if n["lane"] >= 0]
    removed = [("removed", n) for n in _unmatched(old_all, new_all)]
    added = [("added", n) for n in _unmatched(new_all, old_all)]
    changes = sorted(removed + added, key=lambda item: (item[1]["time"], item[0]))
    if not changes:
        print("   Only non-gameplay metadata changed (no playable notes differ).")
        return True

    sections = []
    for ch in changes:
        if not sections or ch[1]["time"] - sections[-1][-1][1]["time"] > 3.5:
            sections.append([ch])
        else:
            sections[-1].append(ch)
    print(f"   {len(removed)} removed / {len(added)} added notes across {len(sections)} musical section(s):")
    for s_idx, sec in enumerate(sections, 1):
        t0, t1 = sec[0][1]["time"], sec[-1][1]["time"]
        print(f"\n   --- Section {s_idx}: {fmt_time(t0)} – {fmt_time(t1)} ---")
        for kind, n in sec:
            sign = "-" if kind == "removed" else "+"
            print(f"     {sign} {fmt_time(n['time'])} {fmt_note(n):14s} midi={n['midi']}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Verify completed Concert Master songs against baseline.")
    parser.add_argument("--accept", action="store_true", help="Save current chart outputs as the new baseline.")
    parser.add_argument(
        "--checkpoint",
        metavar="LABEL",
        help="Save current chart outputs as the review checkpoint (does NOT touch the locked baseline).",
    )
    args = parser.parse_args()

    current = compute_current_snapshot()
    if args.checkpoint:
        import datetime

        payload = {
            "_meta": {"label": args.checkpoint, "saved_at": datetime.datetime.now().isoformat(timespec="seconds")},
            **current,
        }
        CHECKPOINT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"Saved review checkpoint '{args.checkpoint}' for {len(current)} songs to {CHECKPOINT_PATH}")
        return 0
    if args.accept or not BASELINE_PATH.exists():
        BASELINE_PATH.write_text(json.dumps(current, indent=2), encoding="utf-8")
        print(f"Saved baseline for {len(current)} completed songs to {BASELINE_PATH}")
        for song_id, entry in current.items():
            mel_count = sum(1 for n in entry["notes"] if n["lane"] >= 0 and not n.get("isChordPartner"))
            print(f"  - {entry['title']}: {mel_count} playable notes locked")
        return 0

    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    any_changed = False
    for song_id, _, _ in COMPLETED_SONGS:
        if song_id not in baseline:
            print(f"⚠️  {song_id} missing from baseline!")
            any_changed = True
            continue
        if baseline[song_id].get("mode") != current[song_id]["mode"]:
            print(f"⚠️  {song_id}: baseline was recorded in a different mode ({baseline[song_id].get('mode', 'legacy 4k-space:fewer')}); re-baseline with --accept")
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
