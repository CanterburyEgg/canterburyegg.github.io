"""Lead-melody conductor: pick the line the ear follows from the score's staves.

Order: score-prep passes (fix the score reading) -> core picker (windows + Viterbi + splicing) -> post passes (each a
general rule, or a clearly marked song-specific one). Every pass is a module in conductor/passes with run(ctx).

Debug switches (env):
  CM_SKIP=name,name      skip those passes
  CM_PASS_TRACE=lo:hi    print the lead notes in [lo, hi] score seconds after every pass that changes them
"""
import os
from importlib import import_module
from types import SimpleNamespace

from .core import pick_lead

PREP_PASSES = ['repair_split_dyads', 'rhythm_consensus', 'fix_oboe_lick', 'fix_trombone']
# lead-level rules run by sync_score right after the conductor (also for single-staff scores)
AFTER_PICK_PASSES = ['low_unison_walk', 'top_held_brass', 'held_over_reattack', 'corrections_move_notes', 'corrections_missing_parts', 'grace_into_holds', 'drum_led_passages', 'fills_under_holds', 'figures_over_holds']
POST_PASSES = ['arabesque_tutti_splices', 'relay_lines', 'ride_chorale', 'solos', 'handoff_phrase_start', 'rhythmic_ostinato', 'tune_over_bells', 'what_we_do_tunes', 'doubling_helpers', 'run_completion', 'run_under_hold', 'lone_harmony_handoff', 'embellished_doubling', 'screaming_top_note', 'section_entrance', 'unison_split', 'held_landing', 'moving_line_over_held_chords', 'coda_bridge_hold', 'trim_overlaps']


def _trace_window():
    tw = os.environ.get("CM_PASS_TRACE")
    if not tw:
        return None
    lo, hi = (float(x) for x in tw.split(":"))
    return lo, hi


def _snap(notes, win):
    if notes is None or win is None:
        return None
    return " ".join(f"{float(n['start']):.2f}:{n['midi']}" + ("h" if float(n["end"]) - float(n["start"]) >= 0.45 else "") for n in notes if win[0] <= float(n["start"]) <= win[1])


def _run(names, ctx, skip, win, last):
    for name in names:
        if name in skip:
            continue
        import_module(f".passes.{name}", __name__).run(ctx)
        s = _snap(ctx.lead_notes, win)
        if win is not None and s != last[0]:
            print(f"    [pass] {name:30s} {s}")
            last[0] = s


def conduct(staves: list[dict], score_duration: float) -> list[dict]:
    """
    Phrase-Level Viterbi Conductor across Score Staves:
      - Rewards Unison/Octave Orchestration Doubling (how composers spotlight the main theme!)
      - Penalizes repetitive 2-3 pitch ostinato motors when a true melodic theme is playing
      - Maintains phrase continuity (1.0s windows with instrument-switch inertia)
    """
    if not staves:
        return []
    if len(staves) == 1:
        return staves[0]["notes"]

    skip = {x.strip() for x in os.environ.get("CM_SKIP", "").split(",") if x.strip()}
    win = _trace_window()
    last = [None]
    ctx = SimpleNamespace(staves=staves, score_duration=score_duration, lead_notes=None)
    _run(PREP_PASSES, ctx, skip, win, last)
    ctx.lead_notes = pick_lead(ctx.staves, ctx.score_duration)
    if win is not None:
        last[0] = _snap(ctx.lead_notes, win)
        print(f"    [pass] {'core':30s} {last[0]}")
    _run(POST_PASSES, ctx, skip, win, last)
    return ctx.lead_notes


def run_after_pick(ctx) -> None:
    """Run AFTER_PICK_PASSES on ctx (needs staves, raw_staves, score_duration, score_path, lead_notes)."""
    skip = {x.strip() for x in os.environ.get("CM_SKIP", "").split(",") if x.strip()}
    win = _trace_window()
    _run(AFTER_PICK_PASSES, ctx, skip, win, [_snap(ctx.lead_notes, win)])
