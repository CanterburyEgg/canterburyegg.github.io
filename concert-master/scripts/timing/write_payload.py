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
