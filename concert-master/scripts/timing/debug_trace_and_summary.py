"""Optional audit trace: CM_DEBUG_DUMP=/path/trace.json writes each melody note's source staff & score position

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    debug_path = ns.get('debug_path', MISSING)
    f = ns.get('f', MISSING)
    holds = ns.get('holds', MISSING)
    impacts = ns.get('impacts', MISSING)
    json = ns.get('json', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    os = ns.get('os', MISSING)
    out_path = ns.get('out_path', MISSING)
    t_begin = ns.get('t_begin', MISSING)
    tier1 = ns.get('tier1', MISSING)
    time = ns.get('time', MISSING)
    trace = ns.get('trace', MISSING)
    warped = ns.get('warped', MISSING)
    wn = ns.get('wn', MISSING)

    # Optional audit trace: CM_DEBUG_DUMP=/path/trace.json writes each melody note's source staff & score position
    # (index-aligned with melodyNotes) so chart audits can explain exactly where every note came from.
    debug_path = os.environ.get("CM_DEBUG_DUMP")
    if debug_path:
        trace = [
            {
                "start": round(float(wn["start"]), 4),
                "end": round(float(wn["end"]), 4),
                "midi": int(wn["midi"]),
                "staff": wn.get("staff"),
                "score_start": round(float(wn.get("score_start", 0.0)), 4),
                "score_dur": round(float(wn.get("score_dur", 0.0)), 4),
                "flags": sorted(k for k, v in wn.items() if k.startswith("is_") and v),
            }
            for wn in warped
        ]
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump({"melody": trace, "impacts": impacts}, f, indent=1)

    tier1 = sum(1 for n in melody_out if n[4] == 1)
    holds = sum(1 for n in melody_out if (n[1] - n[0]) >= 0.48)
    print(
        f"✓ Saved Score-Synced {out_path.name} ({os.path.getsize(out_path) / 1024:.1f} KB) in {time.time() - t_begin:.1f}s "
        f"| Tier-1={tier1}, Total={len(melody_out)}, Sustained(>=0.48s)={holds}, Impacts={len(impacts)}"
    )

    if debug_path is not MISSING:
        ns['debug_path'] = debug_path
    if f is not MISSING:
        ns['f'] = f
    if holds is not MISSING:
        ns['holds'] = holds
    if tier1 is not MISSING:
        ns['tier1'] = tier1
    if trace is not MISSING:
        ns['trace'] = trace
    if wn is not MISSING:
        ns['wn'] = wn
