"""Score errata (<song>_corrections.json): notes the printed score gets wrong, confirmed against the recording

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    Path = ns.get('Path', MISSING)
    __file__ = ns.get('__file__', MISSING)
    corrections_path = ns.get('corrections_path', MISSING)
    fix = ns.get('fix', MISSING)
    json = ns.get('json', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    r = ns.get('r', MISSING)
    score_path = ns.get('score_path', MISSING)

    # Score errata (<song>_corrections.json): notes the printed score gets wrong, confirmed against the recording
    # (e.g. Guthix's intro pan-flute holds at 0:45 / 0:57 fall to D where the score has E). Each entry names the note
    # by its final audio time and written pitch, and the pitch the recording actually plays.
    corrections_path = Path(__file__).with_name(f"{score_path.stem.lower()}_corrections.json")
    if corrections_path.exists():
        for fix in json.loads(corrections_path.read_text(encoding="utf-8")).get("pitch", []):
            for r in melody_out:
                if abs(float(r[0]) - float(fix["time"])) < 0.06 and int(r[2]) == int(fix["from"]):
                    r[2] = int(fix["to"])

    if corrections_path is not MISSING:
        ns['corrections_path'] = corrections_path
    if fix is not MISSING:
        ns['fix'] = fix
    if r is not MISSING:
        ns['r'] = r
