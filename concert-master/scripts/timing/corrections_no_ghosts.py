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
    if f.exists() and json.loads(f.read_text(encoding="utf-8")).get("ghost_notes") is False:
        ns["ghost_notes"] = False
