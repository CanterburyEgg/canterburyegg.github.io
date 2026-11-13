"""General Feathered-Beam / "repeat as desired" Accelerando Ostinato Tracker:

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    L_a = ns.get('L_a', MISSING)
    L_b = ns.get('L_b', MISSING)
    a0 = ns.get('a0', MISSING)
    a1 = ns.get('a1', MISSING)
    above = ns.get('above', MISSING)
    alt_segs = ns.get('alt_segs', MISSING)
    alt_subcell = ns.get('alt_subcell', MISSING)
    b0 = ns.get('b0', MISSING)
    b1 = ns.get('b1', MISSING)
    b1_p = ns.get('b1_p', MISSING)
    b2_p = ns.get('b2_p', MISSING)
    base_subcell = ns.get('base_subcell', MISSING)
    bin_hz_stft = ns.get('bin_hz_stft', MISSING)
    bmid_env = ns.get('bmid_env', MISSING)
    d_prev = ns.get('d_prev', MISSING)
    dt = ns.get('dt', MISSING)
    e_alt = ns.get('e_alt', MISSING)
    e_base = ns.get('e_base', MISSING)
    e_p = ns.get('e_p', MISSING)
    en = ns.get('en', MISSING)
    envs = ns.get('envs', MISSING)
    exp_ends = ns.get('exp_ends', MISSING)
    exp_notes = ns.get('exp_notes', MISSING)
    exp_starts = ns.get('exp_starts', MISSING)
    expanded_ends = ns.get('expanded_ends', MISSING)
    expanded_notes = ns.get('expanded_notes', MISSING)
    expanded_starts = ns.get('expanded_starts', MISSING)
    f0_p = ns.get('f0_p', MISSING)
    f_hi = ns.get('f_hi', MISSING)
    f_lo = ns.get('f_lo', MISSING)
    gap_prev = ns.get('gap_prev', MISSING)
    idx_hold = ns.get('idx_hold', MISSING)
    is_alt = ns.get('is_alt', MISSING)
    j0 = ns.get('j0', MISSING)
    k = ns.get('k', MISSING)
    k_e = ns.get('k_e', MISSING)
    k_sub = ns.get('k_sub', MISSING)
    key_shift = ns.get('key_shift', MISSING)
    labeled = ns.get('labeled', MISSING)
    lead_score_notes = ns.get('lead_score_notes', MISSING)
    m1_f = ns.get('m1_f', MISSING)
    m2_f = ns.get('m2_f', MISSING)
    m_hold = ns.get('m_hold', MISSING)
    mid_env = ns.get('mid_env', MISSING)
    n1_f = ns.get('n1_f', MISSING)
    n2_f = ns.get('n2_f', MISSING)
    n_exp = ns.get('n_exp', MISSING)
    n_hold = ns.get('n_hold', MISSING)
    n_segs = ns.get('n_segs', MISSING)
    np = ns.get('np', MISSING)
    ost_len = ns.get('ost_len', MISSING)
    ost_pitches = ns.get('ost_pitches', MISSING)
    ostinato_replacements = ns.get('ostinato_replacements', MISSING)
    p = ns.get('p', MISSING)
    p_alt = ns.get('p_alt', MISSING)
    p_base = ns.get('p_base', MISSING)
    p_bmid = ns.get('p_bmid', MISSING)
    p_btop = ns.get('p_btop', MISSING)
    p_mid = ns.get('p_mid', MISSING)
    p_top = ns.get('p_top', MISSING)
    prev_n = ns.get('prev_n', MISSING)
    pts_a = ns.get('pts_a', MISSING)
    pts_b = ns.get('pts_b', MISSING)
    q1 = ns.get('q1', MISSING)
    q2 = ns.get('q2', MISSING)
    raw_ends = ns.get('raw_ends', MISSING)
    raw_starts = ns.get('raw_starts', MISSING)
    s_dt = ns.get('s_dt', MISSING)
    s_dur_hold = ns.get('s_dur_hold', MISSING)
    s_idx = ns.get('s_idx', MISSING)
    s_t0 = ns.get('s_t0', MISSING)
    s_t1 = ns.get('s_t1', MISSING)
    scipy = ns.get('scipy', MISSING)
    seg_id = ns.get('seg_id', MISSING)
    stft_mag = ns.get('stft_mag', MISSING)
    t_hold_land = ns.get('t_hold_land', MISSING)
    template_n = ns.get('template_n', MISSING)
    w_m = ns.get('w_m', MISSING)
    where = ns.get('where', MISSING)

    # General Feathered-Beam / "repeat as desired" Accelerando Ostinato Tracker:
    # When a score has >= 12 consecutive short notes (dur <= 0.32s) cycling through <= 4 pitches within 6 semitones
    # leading directly into a long sustained hold (dur >= 2.5s, e.g. Arabesque m.13 "free accel. - repeat as desired" -> m.14),
    # track the actual acoustic half-cycles in STFT so the chart plays every accelerating cycle all the way into the landing hold!
    ostinato_replacements = []
    for idx_hold, n_hold in enumerate(lead_score_notes):
        s_dur_hold = float(n_hold["end"] - n_hold["start"])
        if s_dur_hold < 2.5 or idx_hold < 12:
            continue
        j0 = idx_hold
        while j0 > 0:
            prev_n = lead_score_notes[j0 - 1]
            d_prev = float(prev_n["end"] - prev_n["start"])
            gap_prev = float(lead_score_notes[j0]["start"] - prev_n["end"])
            if d_prev <= 0.115 and gap_prev <= 0.25:
                j0 -= 1
            else:
                break
        ost_len = idx_hold - j0
        if ost_len < 12:
            continue
        ost_pitches = sorted({int(lead_score_notes[k]["midi"] + key_shift) for k in range(j0, idx_hold)})
        if len(ost_pitches) > 4 or (max(ost_pitches) - min(ost_pitches)) > 6:
            continue
        m_hold = int(n_hold["midi"] + key_shift)
        p_alt = [p for p in ost_pitches if abs(p - m_hold) >= 2]
        p_base = [p for p in ost_pitches if abs(p - m_hold) <= 1]
        if not p_alt or not p_base:
            continue
        f_lo = max(4, int(round((raw_starts[j0] - 0.15) / dt)))
        f_hi = min(stft_mag.shape[1] - 10, int(round((raw_ends[idx_hold] - 0.50) / dt)))
        if f_hi <= f_lo + 60:
            continue
        envs = {}
        for p in ost_pitches:
            f0_p = 440.0 * (2.0 ** ((p - 69) / 12.0))
            b1_p = int(round(f0_p / bin_hz_stft))
            b2_p = int(round((2.0 * f0_p) / bin_hz_stft))
            if 3 <= b1_p < stft_mag.shape[0] - 4 and 3 <= b2_p < stft_mag.shape[0] - 4:
                e_p = (
                    np.max(stft_mag[b1_p - 1 : b1_p + 2, f_lo:f_hi], axis=0)
                    + 0.45 * np.max(stft_mag[b2_p - 1 : b2_p + 2, f_lo:f_hi], axis=0)
                )
                e_p = scipy.ndimage.gaussian_filter1d(e_p, sigma=0.7)
                envs[p] = e_p / (float(np.percentile(e_p, 95)) + 1e-6)
        if len(envs) != len(ost_pitches):
            continue
        e_alt = np.max(np.vstack([envs[p] for p in p_alt]), axis=0)
        e_base = np.max(np.vstack([envs[p] for p in p_base]), axis=0)
        is_alt = scipy.ndimage.binary_closing((e_alt > e_base) & (e_alt > 0.18), structure=np.ones(4))
        is_alt = scipy.ndimage.binary_opening(is_alt, structure=np.ones(5))
        labeled, n_segs = scipy.ndimage.label(is_alt)
        alt_segs = []
        for seg_id in range(1, n_segs + 1):
            where = np.where(labeled == seg_id)[0]
            if len(where) * dt >= 0.18:
                alt_segs.append((int(where[0]), int(where[-1]) + 1))
        if len(alt_segs) < 2:
            continue
        alt_subcell = [int(lead_score_notes[j0 + k]["midi"]) for k in range(3)]
        base_subcell = [int(lead_score_notes[j0 + 3 + k]["midi"]) for k in range(3)]
        template_n = lead_score_notes[j0]
        expanded_notes = []
        expanded_starts = []
        expanded_ends = []
        s_t0 = float(lead_score_notes[j0]["start"])
        s_t1 = float(lead_score_notes[idx_hold - 1]["end"])
        for s_idx, (a0, a1) in enumerate(alt_segs):
            L_a = a1 - a0
            p_mid = int(alt_subcell[1] + key_shift)
            p_top = int(alt_subcell[0] + key_shift)
            if L_a * dt >= 0.62 and p_mid in envs and p_top in envs:
                mid_env = envs[p_mid][a0:a1] - 0.5 * envs[p_top][a0:a1]
                q1 = max(2, int(round(L_a * 0.22)))
                q2 = min(L_a - 2, int(round(L_a * 0.78)))
                above = mid_env[q1:q2] > np.percentile(mid_env[q1:q2], 45)
                if np.any(above):
                    w_m = np.where(above)[0]
                    n1_f = a0 + q1 + int(w_m[0])
                    n2_f = max(n1_f + 4, a0 + q1 + int(w_m[-1]) + 1)
                else:
                    n1_f = a0 + int(round(L_a / 3.0))
                    n2_f = a0 + int(round(2.0 * L_a / 3.0))
            else:
                n1_f = a0 + int(round(L_a / 3.0))
                n2_f = a0 + int(round(2.0 * L_a / 3.0))
            pts_a = [(f_lo + a0) * dt, (f_lo + n1_f) * dt, (f_lo + n2_f) * dt, (f_lo + a1) * dt]
            for k_sub in range(3):
                expanded_starts.append(float(pts_a[k_sub]))
                expanded_ends.append(float(pts_a[k_sub + 1]))
                expanded_notes.append(
                    {
                        **template_n,
                        "midi": alt_subcell[k_sub],
                        "is_accel_ostinato": True,
                    }
                )
            if s_idx + 1 < len(alt_segs):
                b0 = a1
                b1 = alt_segs[s_idx + 1][0]
                L_b = b1 - b0
                p_bmid = int(base_subcell[1] + key_shift)
                p_btop = int(base_subcell[0] + key_shift)
                if L_b * dt >= 0.62 and p_bmid in envs and p_btop in envs:
                    bmid_env = envs[p_bmid][b0:b1] - 0.5 * envs[p_btop][b0:b1]
                    q1 = max(2, int(round(L_b * 0.22)))
                    q2 = min(L_b - 2, int(round(L_b * 0.78)))
                    above = bmid_env[q1:q2] > np.percentile(bmid_env[q1:q2], 45)
                    if np.any(above):
                        w_m = np.where(above)[0]
                        m1_f = b0 + q1 + int(w_m[0])
                        m2_f = max(m1_f + 4, b0 + q1 + int(w_m[-1]) + 1)
                    else:
                        m1_f = b0 + int(round(L_b / 3.0))
                        m2_f = b0 + int(round(2.0 * L_b / 3.0))
                else:
                    m1_f = b0 + int(round(L_b / 3.0))
                    m2_f = b0 + int(round(2.0 * L_b / 3.0))
                pts_b = [(f_lo + b0) * dt, (f_lo + m1_f) * dt, (f_lo + m2_f) * dt, (f_lo + b1) * dt]
                for k_sub in range(3):
                    expanded_starts.append(float(pts_b[k_sub]))
                    expanded_ends.append(float(pts_b[k_sub + 1]))
                    expanded_notes.append(
                        {
                            **template_n,
                            "midi": base_subcell[k_sub],
                            "is_accel_ostinato": True,
                        }
                    )
        # Assign synthetic monotonic score times within [s_t0, s_t1]
        n_exp = len(expanded_notes)
        s_dt = (s_t1 - s_t0) / max(1, n_exp)
        for k_e, en in enumerate(expanded_notes):
            en["start"] = s_t0 + k_e * s_dt
            en["end"] = s_t0 + (k_e + 1) * s_dt
        t_hold_land = float((f_lo + alt_segs[-1][1]) * dt)
        ostinato_replacements.append((j0, idx_hold, expanded_notes, expanded_starts, expanded_ends, t_hold_land))

    for j0, idx_hold, exp_notes, exp_starts, exp_ends, t_hold_land in reversed(ostinato_replacements):
        raw_starts[idx_hold] = t_hold_land
        lead_score_notes[idx_hold]["is_ostinato_landing"] = True
        lead_score_notes[j0:idx_hold] = exp_notes
        raw_starts[j0:idx_hold] = exp_starts
        raw_ends[j0:idx_hold] = exp_ends

    if L_a is not MISSING:
        ns['L_a'] = L_a
    if L_b is not MISSING:
        ns['L_b'] = L_b
    if a0 is not MISSING:
        ns['a0'] = a0
    if a1 is not MISSING:
        ns['a1'] = a1
    if above is not MISSING:
        ns['above'] = above
    if alt_segs is not MISSING:
        ns['alt_segs'] = alt_segs
    if alt_subcell is not MISSING:
        ns['alt_subcell'] = alt_subcell
    if b0 is not MISSING:
        ns['b0'] = b0
    if b1 is not MISSING:
        ns['b1'] = b1
    if b1_p is not MISSING:
        ns['b1_p'] = b1_p
    if b2_p is not MISSING:
        ns['b2_p'] = b2_p
    if base_subcell is not MISSING:
        ns['base_subcell'] = base_subcell
    if bmid_env is not MISSING:
        ns['bmid_env'] = bmid_env
    if d_prev is not MISSING:
        ns['d_prev'] = d_prev
    if e_alt is not MISSING:
        ns['e_alt'] = e_alt
    if e_base is not MISSING:
        ns['e_base'] = e_base
    if e_p is not MISSING:
        ns['e_p'] = e_p
    if en is not MISSING:
        ns['en'] = en
    if envs is not MISSING:
        ns['envs'] = envs
    if exp_ends is not MISSING:
        ns['exp_ends'] = exp_ends
    if exp_notes is not MISSING:
        ns['exp_notes'] = exp_notes
    if exp_starts is not MISSING:
        ns['exp_starts'] = exp_starts
    if expanded_ends is not MISSING:
        ns['expanded_ends'] = expanded_ends
    if expanded_notes is not MISSING:
        ns['expanded_notes'] = expanded_notes
    if expanded_starts is not MISSING:
        ns['expanded_starts'] = expanded_starts
    if f0_p is not MISSING:
        ns['f0_p'] = f0_p
    if f_hi is not MISSING:
        ns['f_hi'] = f_hi
    if f_lo is not MISSING:
        ns['f_lo'] = f_lo
    if gap_prev is not MISSING:
        ns['gap_prev'] = gap_prev
    if idx_hold is not MISSING:
        ns['idx_hold'] = idx_hold
    if is_alt is not MISSING:
        ns['is_alt'] = is_alt
    if j0 is not MISSING:
        ns['j0'] = j0
    if k is not MISSING:
        ns['k'] = k
    if k_e is not MISSING:
        ns['k_e'] = k_e
    if k_sub is not MISSING:
        ns['k_sub'] = k_sub
    if labeled is not MISSING:
        ns['labeled'] = labeled
    if m1_f is not MISSING:
        ns['m1_f'] = m1_f
    if m2_f is not MISSING:
        ns['m2_f'] = m2_f
    if m_hold is not MISSING:
        ns['m_hold'] = m_hold
    if mid_env is not MISSING:
        ns['mid_env'] = mid_env
    if n1_f is not MISSING:
        ns['n1_f'] = n1_f
    if n2_f is not MISSING:
        ns['n2_f'] = n2_f
    if n_exp is not MISSING:
        ns['n_exp'] = n_exp
    if n_hold is not MISSING:
        ns['n_hold'] = n_hold
    if n_segs is not MISSING:
        ns['n_segs'] = n_segs
    if ost_len is not MISSING:
        ns['ost_len'] = ost_len
    if ost_pitches is not MISSING:
        ns['ost_pitches'] = ost_pitches
    if ostinato_replacements is not MISSING:
        ns['ostinato_replacements'] = ostinato_replacements
    if p is not MISSING:
        ns['p'] = p
    if p_alt is not MISSING:
        ns['p_alt'] = p_alt
    if p_base is not MISSING:
        ns['p_base'] = p_base
    if p_bmid is not MISSING:
        ns['p_bmid'] = p_bmid
    if p_btop is not MISSING:
        ns['p_btop'] = p_btop
    if p_mid is not MISSING:
        ns['p_mid'] = p_mid
    if p_top is not MISSING:
        ns['p_top'] = p_top
    if prev_n is not MISSING:
        ns['prev_n'] = prev_n
    if pts_a is not MISSING:
        ns['pts_a'] = pts_a
    if pts_b is not MISSING:
        ns['pts_b'] = pts_b
    if q1 is not MISSING:
        ns['q1'] = q1
    if q2 is not MISSING:
        ns['q2'] = q2
    if s_dt is not MISSING:
        ns['s_dt'] = s_dt
    if s_dur_hold is not MISSING:
        ns['s_dur_hold'] = s_dur_hold
    if s_idx is not MISSING:
        ns['s_idx'] = s_idx
    if s_t0 is not MISSING:
        ns['s_t0'] = s_t0
    if s_t1 is not MISSING:
        ns['s_t1'] = s_t1
    if seg_id is not MISSING:
        ns['seg_id'] = seg_id
    if t_hold_land is not MISSING:
        ns['t_hold_land'] = t_hold_land
    if template_n is not MISSING:
        ns['template_n'] = template_n
    if w_m is not MISSING:
        ns['w_m'] = w_m
    if where is not MISSING:
        ns['where'] = where
