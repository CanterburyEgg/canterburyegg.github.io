"""For long high solo trill/hold climaxes preceded by ornamental climbs (e.g. m.5-6 Flute C6 trill after 3 climbs),

(Moved verbatim from sync_score.process_pair: a post-warp timing rule; runs on the shared namespace.)
"""
from timing import MISSING


def run(ns):
    b0 = ns.get('b0', MISSING)
    b1 = ns.get('b1', MISSING)
    bin_hz_stft = ns.get('bin_hz_stft', MISSING)
    cand_t = ns.get('cand_t', MISSING)
    cur_t = ns.get('cur_t', MISSING)
    d_k = ns.get('d_k', MISSING)
    dt = ns.get('dt', MISSING)
    f0_0 = ns.get('f0_0', MISSING)
    f0_1 = ns.get('f0_1', MISSING)
    f_shi = ns.get('f_shi', MISSING)
    f_slo = ns.get('f_slo', MISSING)
    fi_r = ns.get('fi_r', MISSING)
    idx_n = ns.get('idx_n', MISSING)
    idx_w = ns.get('idx_w', MISSING)
    j0 = ns.get('j0', MISSING)
    k_p = ns.get('k_p', MISSING)
    key_shift = ns.get('key_shift', MISSING)
    lead_score_notes = ns.get('lead_score_notes', MISSING)
    m_c = ns.get('m_c', MISSING)
    n = ns.get('n', MISSING)
    np = ns.get('np', MISSING)
    p_pk = ns.get('p_pk', MISSING)
    p_trill = ns.get('p_trill', MISSING)
    prev_d = ns.get('prev_d', MISSING)
    raw_ends = ns.get('raw_ends', MISSING)
    raw_starts = ns.get('raw_starts', MISSING)
    s_dur = ns.get('s_dur', MISSING)
    scipy = ns.get('scipy', MISSING)
    seg_t = ns.get('seg_t', MISSING)
    stft_mag = ns.get('stft_mag', MISSING)
    sus_f = ns.get('sus_f', MISSING)
    t_p0 = ns.get('t_p0', MISSING)
    total_span = ns.get('total_span', MISSING)
    w_sum = ns.get('w_sum', MISSING)
    weights = ns.get('weights', MISSING)

    # For long high solo trill/hold climaxes preceded by ornamental climbs (e.g. m.5-6 Flute C6 trill after 3 climbs),
    # if coarse DTW landed on the climax hold early while the soloist was still lingering on the preceding climbs,
    # detect the true harmonic emergence of the climax hold and re-apportion the preceding climbs across the phrase!
    bin_hz_stft = 22050.0 / 2048.0
    for idx_n, n in enumerate(lead_score_notes):
        s_dur = float(n["end"] - n["start"])
        m_c = int(n["midi"] + key_shift)
        prev_d = float(lead_score_notes[idx_n - 1]["end"] - lead_score_notes[idx_n - 1]["start"]) if idx_n > 0 else 99.0
        if s_dur >= 2.8 and m_c >= 78 and idx_n >= 3 and prev_d <= 0.65:
            f_slo = max(4, int(round((raw_starts[idx_n] - 0.08) / dt)))
            f_shi = min(stft_mag.shape[1] - 10, int(round((raw_ends[idx_n] - 0.60) / dt)))
            if f_shi > f_slo + 45:
                f0_0 = 440.0 * (2.0 ** ((m_c - 69) / 12.0))
                f0_1 = 440.0 * (2.0 ** ((m_c + 1 - 69) / 12.0))
                b0 = int(round(f0_0 / bin_hz_stft))
                b1 = int(round(f0_1 / bin_hz_stft))
                if 3 <= b0 < stft_mag.shape[0] - 4 and 3 <= b1 < stft_mag.shape[0] - 4:
                    p_trill = scipy.ndimage.gaussian_filter1d(
                        np.maximum(
                            np.max(stft_mag[b0 - 1 : b0 + 2, f_slo:f_shi], axis=0),
                            np.max(stft_mag[b1 - 1 : b1 + 2, f_slo:f_shi], axis=0),
                        ),
                        sigma=1.5,
                    )
                    p_pk = float(np.max(p_trill))
                    sus_f = max(8, int(round(0.28 / dt)))
                    if p_pk > 1e-4 and float(np.median(p_trill[:12])) < 0.16 * p_pk:
                        for fi_r in range(10, len(p_trill) - sus_f):
                            if p_trill[fi_r] >= 0.30 * p_pk and float(np.mean(p_trill[fi_r : fi_r + sus_f])) >= 0.32 * p_pk:
                                cand_t = float((f_slo + fi_r) * dt)
                                if cand_t > raw_starts[idx_n] + 0.25:
                                    # Find start of unbroken preceding ornamental phrase (e.g. the 3 climbs in m.5)
                                    j0 = idx_n
                                    while j0 > 0 and (lead_score_notes[j0]["start"] - lead_score_notes[j0 - 1]["end"]) <= 0.35:
                                        if (lead_score_notes[j0 - 1]["end"] - lead_score_notes[j0 - 1]["start"]) >= 1.5:
                                            break
                                        j0 -= 1
                                    if j0 < idx_n:
                                        t_p0 = raw_starts[j0]
                                        total_span = cand_t - t_p0
                                        if total_span > 0.45:
                                            # Keep fast 32nd-note pickups (~0.11s) and allocate rubato stretch to trill holds!
                                            weights = []
                                            for k_p in range(j0, idx_n):
                                                d_k = float(lead_score_notes[k_p]["end"] - lead_score_notes[k_p]["start"])
                                                weights.append(0.11 if d_k <= 0.18 else d_k * 2.4)
                                            w_sum = sum(weights) + 1e-6
                                            cur_t = t_p0
                                            for idx_w, k_p in enumerate(range(j0, idx_n)):
                                                seg_t = total_span * (weights[idx_w] / w_sum)
                                                raw_starts[k_p] = cur_t
                                                raw_ends[k_p] = cur_t + seg_t
                                                cur_t += seg_t
                                    raw_starts[idx_n] = cand_t
                                break

    if b0 is not MISSING:
        ns['b0'] = b0
    if b1 is not MISSING:
        ns['b1'] = b1
    if bin_hz_stft is not MISSING:
        ns['bin_hz_stft'] = bin_hz_stft
    if cand_t is not MISSING:
        ns['cand_t'] = cand_t
    if cur_t is not MISSING:
        ns['cur_t'] = cur_t
    if d_k is not MISSING:
        ns['d_k'] = d_k
    if f0_0 is not MISSING:
        ns['f0_0'] = f0_0
    if f0_1 is not MISSING:
        ns['f0_1'] = f0_1
    if f_shi is not MISSING:
        ns['f_shi'] = f_shi
    if f_slo is not MISSING:
        ns['f_slo'] = f_slo
    if fi_r is not MISSING:
        ns['fi_r'] = fi_r
    if idx_n is not MISSING:
        ns['idx_n'] = idx_n
    if idx_w is not MISSING:
        ns['idx_w'] = idx_w
    if j0 is not MISSING:
        ns['j0'] = j0
    if k_p is not MISSING:
        ns['k_p'] = k_p
    if m_c is not MISSING:
        ns['m_c'] = m_c
    if n is not MISSING:
        ns['n'] = n
    if p_pk is not MISSING:
        ns['p_pk'] = p_pk
    if p_trill is not MISSING:
        ns['p_trill'] = p_trill
    if prev_d is not MISSING:
        ns['prev_d'] = prev_d
    if s_dur is not MISSING:
        ns['s_dur'] = s_dur
    if seg_t is not MISSING:
        ns['seg_t'] = seg_t
    if sus_f is not MISSING:
        ns['sus_f'] = sus_f
    if t_p0 is not MISSING:
        ns['t_p0'] = t_p0
    if total_span is not MISSING:
        ns['total_span'] = total_span
    if w_sum is not MISSING:
        ns['w_sum'] = w_sum
    if weights is not MISSING:
        ns['weights'] = weights
