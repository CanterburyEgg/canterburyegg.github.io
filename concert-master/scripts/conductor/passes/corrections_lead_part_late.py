"""<song>_corrections.json 'lead_part' entries marked "late": true, applied again at the end of the conductor.

Some by-ear lead parts sit where later rules would take the lead somewhere else again (Jupiter 7:27: the trumpets'
broad melody, which 'theme_returns' and 'moving_line_over_held_chords' would hand to the bass clarinet and the
violas' arpeggio). Re-applying just those entries last keeps the ear's choice; the other entries keep their place.
"""
import json
from pathlib import Path

from . import corrections_lead_part as _lp


def run(ctx):
    if ctx.score_path is None:
        return
    corr = Path(__file__).resolve().parents[2] / f"{ctx.score_path.stem.lower()}_corrections.json"
    if not corr.exists():
        return
    late = [lp for lp in json.loads(corr.read_text(encoding="utf-8")).get("lead_part", []) if lp.get("late")]
    if late:
        _lp.apply(ctx, late)
