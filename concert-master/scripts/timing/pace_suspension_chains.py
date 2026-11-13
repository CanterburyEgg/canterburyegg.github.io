"""Pace Legato Repeated-Cell Quarter-Note Suspension Chains (>= 10 consecutive quarter notes cycling through <= 4 pitches

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    a0 = ns.get('a0', MISSING)
    a1 = ns.get('a1', MISSING)
    a_knots = ns.get('a_knots', MISSING)
    a_ons_raw = ns.get('a_ons_raw', MISSING)
    a_q0 = ns.get('a_q0', MISSING)
    d_q = ns.get('d_q', MISSING)
    dt = ns.get('dt', MISSING)
    duration = ns.get('duration', MISSING)
    en_k = ns.get('en_k', MISSING)
    g_q = ns.get('g_q', MISSING)
    idx_p0 = ns.get('idx_p0', MISSING)
    idx_p1 = ns.get('idx_p1', MISSING)
    k = ns.get('k', MISSING)
    k_back = ns.get('k_back', MISSING)
    k_leg = ns.get('k_leg', MISSING)
    key_shift = ns.get('key_shift', MISSING)
    lead_score_notes = ns.get('lead_score_notes', MISSING)
    m_p0 = ns.get('m_p0', MISSING)
    m_q0 = ns.get('m_q0', MISSING)
    np = ns.get('np', MISSING)
    q_end = ns.get('q_end', MISSING)
    q_pitches = ns.get('q_pitches', MISSING)
    q_scan = ns.get('q_scan', MISSING)
    raw_ends = ns.get('raw_ends', MISSING)
    raw_starts = ns.get('raw_starts', MISSING)
    s0 = ns.get('s0', MISSING)
    s1 = ns.get('s1', MISSING)
    s_knots = ns.get('s_knots', MISSING)
    s_q0 = ns.get('s_q0', MISSING)
    snap_note_to_harmonic_onset = ns.get('snap_note_to_harmonic_onset', MISSING)
    st_k = ns.get('st_k', MISSING)
    stft_mag = ns.get('stft_mag', MISSING)

    # Pace Legato Repeated-Cell Quarter-Note Suspension Chains (>= 10 consecutive quarter notes cycling through <= 4 pitches
    # on the same staff, e.g. Arabesque mm.84-86 woodwind suspension chain preceded by m.83 setup bar) at the steady section
    # tempo between phrase anchors so DTW's 1:1 diagonal bias and vibrato micro-snaps do not rush early or jitter the pulse.
    q_scan = 0
    while q_scan < len(lead_score_notes):
        q_end = q_scan
        while q_end < len(lead_score_notes):
            d_q = float(lead_score_notes[q_end]["end"] - lead_score_notes[q_end]["start"])
            g_q = float(lead_score_notes[q_end]["start"] - lead_score_notes[q_end - 1]["end"]) if q_end > q_scan else 0.0
            if 0.48 <= d_q <= 0.62 and g_q <= 0.03 and lead_score_notes[q_end]["staff"] == lead_score_notes[q_scan]["staff"]:
                q_end += 1
            else:
                break
        if (q_end - q_scan) >= 10:
            q_pitches = {int(lead_score_notes[k]["midi"]) for k in range(q_scan, q_end)}
            if len(q_pitches) <= 4 and q_end < len(lead_score_notes):
                idx_p0 = q_scan
                for k_back in range(q_scan - 1, max(-1, q_scan - 12), -1):
                    if lead_score_notes[k_back]["staff"] != lead_score_notes[q_scan]["staff"]:
                        break
                    if (lead_score_notes[q_scan]["start"] - lead_score_notes[k_back]["start"]) <= 2.35 and (
                        lead_score_notes[k_back]["end"] - lead_score_notes[k_back]["start"]
                    ) >= 0.75:
                        idx_p0 = k_back
                        break
                idx_p1 = q_end
                s0 = float(lead_score_notes[idx_p0]["start"])
                s_q0 = float(lead_score_notes[q_scan]["start"])
                s1 = float(lead_score_notes[idx_p1]["start"])
                if s1 > s0 + 4.0:
                    m_p0 = int(lead_score_notes[idx_p0]["midi"] + key_shift)
                    a0 = snap_note_to_harmonic_onset(
                        raw_starts[idx_p0],
                        m_p0,
                        stft_mag,
                        a_ons_raw,
                        dt,
                        t_min=max(0.12, raw_starts[idx_p0] - 0.18),
                        t_max=min(duration - 0.25, raw_starts[idx_p0] + 0.18),
                        max_snap_frames=8,
                    )
                    m_q0 = int(lead_score_notes[q_scan]["midi"] + key_shift)
                    a_q0 = (
                        snap_note_to_harmonic_onset(
                            raw_starts[q_scan],
                            m_q0,
                            stft_mag,
                            a_ons_raw,
                            dt,
                            t_min=max(a0 + 0.5, raw_starts[q_scan] - 0.22),
                            t_max=min(duration - 0.25, raw_starts[q_scan] + 0.18),
                            max_snap_frames=8,
                        )
                        - 0.045
                    )
                    a1 = float(raw_starts[idx_p1]) - 0.16
                    s_knots = np.array([s0, s_q0, s1], dtype=np.float64) if s_q0 > s0 + 0.5 else np.array([s0, s1], dtype=np.float64)
                    a_knots = np.array([a0, a_q0, a1], dtype=np.float64) if s_q0 > s0 + 0.5 else np.array([a0, a1], dtype=np.float64)
                    for k_leg in range(idx_p0, idx_p1):
                        st_k = float(lead_score_notes[k_leg]["start"])
                        en_k = float(lead_score_notes[k_leg]["end"])
                        raw_starts[k_leg] = float(np.interp(st_k, s_knots, a_knots))
                        raw_ends[k_leg] = float(np.interp(en_k, s_knots, a_knots))
                        lead_score_notes[k_leg]["is_legato_suspension"] = True
        q_scan = max(q_scan + 1, q_end)

    if a0 is not MISSING:
        ns['a0'] = a0
    if a1 is not MISSING:
        ns['a1'] = a1
    if a_knots is not MISSING:
        ns['a_knots'] = a_knots
    if a_q0 is not MISSING:
        ns['a_q0'] = a_q0
    if d_q is not MISSING:
        ns['d_q'] = d_q
    if en_k is not MISSING:
        ns['en_k'] = en_k
    if g_q is not MISSING:
        ns['g_q'] = g_q
    if idx_p0 is not MISSING:
        ns['idx_p0'] = idx_p0
    if idx_p1 is not MISSING:
        ns['idx_p1'] = idx_p1
    if k is not MISSING:
        ns['k'] = k
    if k_back is not MISSING:
        ns['k_back'] = k_back
    if k_leg is not MISSING:
        ns['k_leg'] = k_leg
    if m_p0 is not MISSING:
        ns['m_p0'] = m_p0
    if m_q0 is not MISSING:
        ns['m_q0'] = m_q0
    if q_end is not MISSING:
        ns['q_end'] = q_end
    if q_pitches is not MISSING:
        ns['q_pitches'] = q_pitches
    if q_scan is not MISSING:
        ns['q_scan'] = q_scan
    if s0 is not MISSING:
        ns['s0'] = s0
    if s1 is not MISSING:
        ns['s1'] = s1
    if s_knots is not MISSING:
        ns['s_knots'] = s_knots
    if s_q0 is not MISSING:
        ns['s_q0'] = s_q0
    if st_k is not MISSING:
        ns['st_k'] = st_k
