"""Arabesque: windows where the user preferred the chart approved before the 2026-11 rebuild (1:00 accelerating

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    Path = ns.get('Path', MISSING)
    __file__ = ns.get('__file__', MISSING)
    a_pts = ns.get('a_pts', MISSING)
    json = ns.get('json', MISSING)
    m = ns.get('m', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    np = ns.get('np', MISSING)
    order = ns.get('order', MISSING)
    p = ns.get('p', MISSING)
    pairs = ns.get('pairs', MISSING)
    r = ns.get('r', MISSING)
    rest = ns.get('rest', MISSING)
    restore_path = ns.get('restore_path', MISSING)
    s0r = ns.get('s0r', MISSING)
    s_pts = ns.get('s_pts', MISSING)
    score_path = ns.get('score_path', MISSING)
    to_score = ns.get('to_score', MISSING)
    w = ns.get('w', MISSING)
    warped = ns.get('warped', MISSING)
    wins = ns.get('wins', MISSING)

    # Arabesque: windows where the user preferred the chart approved before the 2026-11 rebuild (1:00 accelerating
    # figure, 1:09 & 2:40 low line, 2:14 horns, 2:30 woodwind lick landing, 3:27 horn figure) take those notes verbatim.
    restore_path = Path(__file__).with_name(f"{score_path.stem.lower()}_restore.json")
    if restore_path.exists() and len(warped) == len(melody_out):
        rest = json.loads(restore_path.read_text(encoding="utf-8"))
        wins = rest.get("windows", [])
        a_pts = np.array([float(m[0]) for m in melody_out])
        s_pts = np.array([float(w["score_start"]) for w in warped])
        order = np.argsort(a_pts)
        to_score = lambda t: float(np.interp(t, a_pts[order], s_pts[order]))
        pairs = [(m, w) for m, w in zip(melody_out, warped) if not any(a0 <= float(m[0]) < a1 for a0, a1 in wins)]
        for r in rest["notes"]:
            s0r = to_score(float(r[0]))
            pairs.append(
                (
                    list(r),
                    {
                        "start": float(r[0]),
                        "end": float(r[1]),
                        "midi": int(r[2]),
                        "staff": "Restored (approved chart)",
                        "score_start": s0r,
                        "score_dur": max(0.01, to_score(float(r[1])) - s0r),
                    },
                )
            )
        pairs.sort(key=lambda p: float(p[0][0]))
        melody_out = [p[0] for p in pairs]
        warped = [p[1] for p in pairs]
        print(f"    -> restored {len(rest['notes'])} approved notes in {len(wins)} windows")

    if a_pts is not MISSING:
        ns['a_pts'] = a_pts
    if m is not MISSING:
        ns['m'] = m
    if melody_out is not MISSING:
        ns['melody_out'] = melody_out
    if order is not MISSING:
        ns['order'] = order
    if p is not MISSING:
        ns['p'] = p
    if pairs is not MISSING:
        ns['pairs'] = pairs
    if r is not MISSING:
        ns['r'] = r
    if rest is not MISSING:
        ns['rest'] = rest
    if restore_path is not MISSING:
        ns['restore_path'] = restore_path
    if s0r is not MISSING:
        ns['s0r'] = s0r
    if s_pts is not MISSING:
        ns['s_pts'] = s_pts
    if to_score is not MISSING:
        ns['to_score'] = to_score
    if w is not MISSING:
        ns['w'] = w
    if warped is not MISSING:
        ns['warped'] = warped
    if wins is not MISSING:
        ns['wins'] = wins
