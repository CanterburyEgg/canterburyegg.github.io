"""<song>_corrections.json 'chord_hits' (by ear): chords struck on lead notes, two keys at once. Each entry: 'time'
(the lead note's audio time), 'lane' (the partner key, 0-3 = D F J K), and optionally 'up' / 'down' (the chord tone
the partner stands for). Added to the chart's ensemble chord hits with the partner key fixed (Gnome Village II's
fadeout: the band's chords on the horn's rhythm, [FJ] x8 then [DF]; user, Nov 27: "I'm hearing something that'd be
like [FJ] [FJ][FJ][FJ][FJ] [FJ][FJ][FJ][DF]").
"""
import json
from pathlib import Path


def run(ns):
    sp = ns.get("score_path")
    if sp is None:
        return
    corr = Path(__file__).resolve().parents[1] / f"{sp.stem.lower()}_corrections.json"
    if not corr.exists():
        return
    extra = json.loads(corr.read_text(encoding="utf-8")).get("chord_hits", [])
    if not extra:
        return
    hits = ns.get("chord_hits")
    if not isinstance(hits, list):
        hits = []
        ns["chord_hits"] = hits
    mo = ns.get("melody_out") or []
    for h in extra:
        t = float(h["time"])
        host = next((r for r in mo if abs(float(r[0]) - t) < 0.03), None)
        m = int(host[2]) if host else 0
        hits[:] = [x for x in hits if abs(float(x[0]) - t) >= 0.03]
        hits.append([round(t, 4), int(h.get("up", m + 4)), int(h.get("down", m - 3)), 0, 0, int(h["lane"])])
    hits.sort(key=lambda x: x[0])
