"""<song>_corrections.json "ghost_notes": false -- the song never uses the ghost keys S / L (Mars, by the user's call,
Nov 18); written to the sidecar as ghostNotes: false, which turns the engine's ghost rules off (quick five-note rips
play on D F J K instead: quickRipsFourKeys)."""
import json
from pathlib import Path


def run(ns):
    sp = ns.get("score_path")
    if sp is None:
        return
    f = Path(__file__).resolve().parents[1] / f"{sp.stem.lower()}_corrections.json"
    g = json.loads(f.read_text(encoding="utf-8")).get("ghost_notes") if f.exists() else None
    if g is False or g == "runs":
        ns["ghost_notes"] = g
    # ("no_ghosts": [{"from": audio s, "to": audio s, "why": ...}] -- stretches with no ghost keys even where the song
    # has them: Mercury's triplet section, "I would like no ghost notes in this section")
    w = json.loads(f.read_text(encoding="utf-8")).get("no_ghosts", []) if f.exists() else []
    if w:
        ns["no_ghost_windows"] = [[float(x["from"]), float(x["to"])] for x in w]
