"""Warp setup.

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    audio_path = ns.get('audio_path', MISSING)
    chord_hits = ns.get('chord_hits', MISSING)
    chord_notes = ns.get('chord_notes', MISSING)
    compute_macro_profiles = ns.get('compute_macro_profiles', MISSING)
    dt = ns.get('dt', MISSING)
    duration = ns.get('duration', MISSING)
    elev = ns.get('elev', MISSING)
    f = ns.get('f', MISSING)
    impacts = ns.get('impacts', MISSING)
    json = ns.get('json', MISSING)
    macro_10hz = ns.get('macro_10hz', MISSING)
    macro_hz = ns.get('macro_hz', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    mix_rms = ns.get('mix_rms', MISSING)
    out_path = ns.get('out_path', MISSING)
    payload = ns.get('payload', MISSING)
    score_path = ns.get('score_path', MISSING)

    elev, macro_hz, macro_10hz = compute_macro_profiles(mix_rms, dt, duration)

    if out_path is None:
        out_path = audio_path.with_suffix(".cadenza.json")

    payload = {
        "version": 1,
        "generator": "score_dtw_v1",
        "scoreFile": score_path.name,
        "duration": round(duration, 3),
        "elevationProfile": elev,
        "macroHz": macro_hz,
        "macroIntensity": macro_10hz,
        "melodyNotes": melody_out,
        "impacts": impacts,
    }
    if chord_notes:
        payload["chordNotes"] = chord_notes
    if chord_hits:
        payload["chordHits"] = chord_hits
    if ns.get("ghost_notes") is False or ns.get("ghost_notes") == "runs":
        payload["ghostNotes"] = ns["ghost_notes"]  # (corrections_no_ghosts)
    if ns.get("exact_score"):
        payload["exactScore"] = True  # (corrections_no_ghosts: a hand-made exact score that isn't MusicXML)
    if ns.get("no_ghost_windows"):
        payload["noGhostWindows"] = ns["no_ghost_windows"]  # (corrections_no_ghosts: stretches with no ghost keys)
    if ns.get("counter_notes"):
        payload["counterNotes"] = ns["counter_notes"]  # (counter_notes: the left hand's line in a two-hands passage)
    if ns.get("beat_levels") is not None:
        payload["beatLevels"] = ns["beat_levels"]  # (beat_levels: index-aligned with melodyNotes, for Easy)
    if ns.get("song_end") is not None:
        payload["songEnd"] = round(float(ns["song_end"]), 3)  # (corrections_song_end: the game stops here)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    if elev is not MISSING:
        ns['elev'] = elev
    if f is not MISSING:
        ns['f'] = f
    if macro_10hz is not MISSING:
        ns['macro_10hz'] = macro_10hz
    if macro_hz is not MISSING:
        ns['macro_hz'] = macro_hz
    if out_path is not MISSING:
        ns['out_path'] = out_path
    if payload is not MISSING:
        ns['payload'] = payload
