"""Layered entries (<song>_corrections.json "layer_notes", score seconds, by ear): a part's note that comes in ON TOP

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a_b = ns.get('a_b', MISSING)
    c_t0 = ns.get('c_t0', MISSING)
    chord_notes = ns.get('chord_notes', MISSING)
    corrections_path = ns.get('corrections_path', MISSING)
    json = ns.get('json', MISSING)
    k_c = ns.get('k_c', MISSING)
    ly = ns.get('ly', MISSING)
    m_t0 = ns.get('m_t0', MISSING)
    m_t1 = ns.get('m_t1', MISSING)
    melody_out = ns.get('melody_out', MISSING)
    s_b = ns.get('s_b', MISSING)
    s_ly = ns.get('s_ly', MISSING)
    ss_c = ns.get('ss_c', MISSING)
    warped = ns.get('warped', MISSING)

    # Layered entries (<song>_corrections.json "layer_notes", score seconds, by ear): a part's note that comes in ON TOP
    # of a held lead note (e.g. Arabesque 2:39: the trumpets' high 85 over the band's held chord) is added as a second
    # hold on the other hand, like the offset chords above, instead of replacing the held note.
    if corrections_path.exists() and len(warped) == len(melody_out):
        for ly in json.loads(corrections_path.read_text(encoding="utf-8")).get("layer_notes", []):
            s_ly = float(ly["start"])
            for k_c in range(len(melody_out)):
                ss_c = float(warped[k_c]["score_start"])
                if not (ss_c < s_ly < ss_c + float(warped[k_c]["score_dur"])):
                    continue
                m_t0, m_t1 = float(melody_out[k_c][0]), float(melody_out[k_c][1])
                if k_c + 1 < len(warped):
                    s_b, a_b = float(warped[k_c + 1]["score_start"]), float(melody_out[k_c + 1][0])
                    c_t0 = m_t0 + (s_ly - ss_c) * (a_b - m_t0) / max(1e-6, s_b - ss_c)
                else:
                    c_t0 = m_t0 + (s_ly - ss_c)
                if m_t0 + 0.15 < c_t0 < m_t1 - 0.3:
                    chord_notes.append([round(c_t0, 4), round(m_t1, 4), int(ly["midi"])])
                break

    if a_b is not MISSING:
        ns['a_b'] = a_b
    if c_t0 is not MISSING:
        ns['c_t0'] = c_t0
    if k_c is not MISSING:
        ns['k_c'] = k_c
    if ly is not MISSING:
        ns['ly'] = ly
    if m_t0 is not MISSING:
        ns['m_t0'] = m_t0
    if m_t1 is not MISSING:
        ns['m_t1'] = m_t1
    if s_b is not MISSING:
        ns['s_b'] = s_b
    if s_ly is not MISSING:
        ns['s_ly'] = s_ly
    if ss_c is not MISSING:
        ns['ss_c'] = ss_c
