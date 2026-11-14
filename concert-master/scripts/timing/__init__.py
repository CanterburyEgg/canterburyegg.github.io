"""Post-warp timing rules: each module turns score positions into the recording's timing (snaps, spacing, chord
hits, ...). They share one namespace dict (the old process_pair locals + sync_score globals), in this order.

Debug switches (env): CM_SKIP_TIMING=name,name skips those modules; CM_TIMING_TRACE=lo:hi (audio seconds) prints the
melody notes in that window after every module that changes them.
"""
import os
from importlib import import_module

MISSING = object()

TIMING_PASSES = ['warp_setup', 'climax_trill_emergence', 'accel_ostinato', 'tag_32nd_runs_pre', 'pace_16th_runs', 'pace_suspension_chains', 'final_stinger_anchor', 'suspension_entrance_after_rest', 'moving_line_big_hits_timing', 'pace_8th_runs', 'pace_repeated_pitch_runs', 'order_and_fuse_ties', 'final_chord_marcato', 'pre_silence_cutoff', 'activity_tiers', 'tag_32nd_runs', 'pace_16th_pickups', 'mordents', 'impacts_written', 'impacts_tutti_chords', 'impacts_verify', 'impacts_cannon_shots', 'impacts_moving_line', 'impacts_dedupe', 'impacts_coalign', 'pace_repeated_pitch_final', 'arabesque_restore_windows', 'spliced_line_snapping', 'repeated_note_figures', 'uneven_quick_figures', 'landing_notes', 'score_clock', 'corrections_pitch', 'corrections_audio_moves', 'restore_pins', 'offset_chords', 'corrections_layer_notes', 'ensemble_hits', 'chord_passages', 'low_slide_into_hit', 'write_payload', 'debug_trace_and_summary']


def _snap(ns, win):
    mo = ns.get("melody_out")
    if not isinstance(mo, list) or win is None:
        return None
    return " ".join(f"{float(r[0]):.2f}:{r[2]}" for r in mo if win[0] <= float(r[0]) <= win[1])


def run_all(ns: dict) -> None:
    skip = {x.strip() for x in os.environ.get("CM_SKIP_TIMING", "").split(",") if x.strip()}
    tw = os.environ.get("CM_TIMING_TRACE")  # lo:hi audio seconds: print melody notes after every module that moves them
    win = tuple(float(x) for x in tw.split(":")) if tw else None
    last = None
    for name in TIMING_PASSES:
        if name not in skip:
            import_module(f"timing.{name}").run(ns)
            snap = _snap(ns, win)
            if win is not None and snap != last:
                print(f"    [timing] {name:32s} {snap}")
                last = snap
