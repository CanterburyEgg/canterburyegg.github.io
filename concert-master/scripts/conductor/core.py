"""Conductor core: score every part in 1s windows, Viterbi a part per window, splice the runs at phrase entrances.

(Moved verbatim from sync_score.conduct_lead_melody_from_score.)
"""
import numpy as np


def instrument_role_prior(name: str) -> float:
    ln = name.lower()
    if "timp" in ln:
        return 0.16
    if any(k in ln for k in ["doublebass", "contrabass", "double bass", "string bass", "bass tuba", "subbass"]):
        return 0.18
    if any(k in ln for k in ["bassoon", "bass clarinet", "bassclarin", "bari sax", "baritone sax", "bass trombone", "harp", "tuba"]):
        if "tenor tuba" in ln:  # Euphonium!
            return 1.15
        return 0.28
    if "glockenspiel" in ln or "celesta" in ln or "piccolo" in ln:
        return 0.72
    if ("flugel" in ln or "trumpet" in ln) and "2, 3" in ln:
        return 0.80
    if any(k in ln for k in ["2nd", "3rd", "iii", "iv", "v ", "vi", "viola", "second", "marimba 2", "warm pad 2", "strings ii"]):
        if "horn" in ln and ("i " in ln or "1" in ln):
            return 1.24
        return 0.45
    if "warm pad 1" in ln or "strings i" in ln:
        return 0.65
    if any(k in ln for k in ["dulcimer", "choir", "celesta 1", "marimba 1", "xylophone"]):
        return 1.15
    if any(k in ln for k in ["trumpet", "cornet", "flugel", "flute", "pan flute", "bagpipe", "oboe", "english horn", "clarinet", "horn", "sax", "euphonium", "1st violin", "violin 1", "violin i", "solo"]):
        return 1.25
    if "cello" in ln or "trombone" in ln:
        return 0.95
    return 1.0


def pick_lead(staves: list[dict], score_duration: float) -> list[dict]:
    V = len(staves)
    win_dt = 1.0
    W = max(1, int(np.ceil(score_duration / win_dt)))
    priors = np.array([instrument_role_prior(st["name"]) for st in staves], dtype=np.float64)

    # Pre-index notes by window [w] for fast scoring
    win_notes = [[[] for _ in range(W)] for _ in range(V)]
    # Also build 100ms pitch-class onset grids for unison/octave doubling detection!
    grid_dt = 0.10
    G = max(10, int(np.ceil(score_duration / grid_dt)) + 2)
    pc_onset_grid = np.zeros((V, G, 12), dtype=np.float32)

    for v, st in enumerate(staves):
        for n in st["notes"]:
            w0 = max(0, int(n["start"] / win_dt))
            w1 = min(W - 1, int(n["end"] / win_dt))
            for w in range(w0, w1 + 1):
                win_notes[v][w].append(n)
            g = min(G - 2, max(0, int(round(n["start"] / grid_dt))))
            pc = n["midi"] % 12
            pc_onset_grid[v, g, pc] = 1.0
            if g > 0:
                pc_onset_grid[v, g - 1, pc] = max(pc_onset_grid[v, g - 1, pc], 0.6)
            pc_onset_grid[v, g + 1, pc] = max(pc_onset_grid[v, g + 1, pc], 0.6)

    emit = np.full((W, V), -2.5, dtype=np.float64)

    for w in range(W):
        t0 = w * win_dt
        t1 = t0 + win_dt
        g0 = max(0, int(t0 / grid_dt))
        g1 = min(G, int((t1 + 0.5) / grid_dt))

        for v in range(V):
            cands = win_notes[v][w]
            if not cands:
                continue
            if "mallet" in staves[v]["name"].lower() and not any(t0 - 1e-4 <= n["start"] < t1 for n in cands):
                # Struck glockenspiel/xylophone notes decay rapidly; do not hold the lead voice across windows with zero new attacks
                continue

            # Broader 3.0s phrase context around window w to judge ostinato vs lyrical melody!
            ctx = []
            for wc in range(max(0, w - 1), min(W, w + 2)):
                for n in win_notes[v][wc]:
                    if not ctx or ctx[-1] is not n:
                        ctx.append(n)

            pitches = [n["midi"] for n in ctx]
            durs = [n["end"] - n["start"] for n in ctx]
            if len(ctx) == 1 and durs[0] <= 0.30:
                # Single isolated short hit surrounded by silence (e.g. m.55 ensemble Clap X-notehead during drum solo)
                continue
            mean_pitch = float(np.mean(pitches))
            mean_vel = float(np.mean([n["vel"] for n in cands]))
            uniq_p = len(set(pitches))
            n_ctx = len(ctx)

            # Suppress static low bass pedal drones (e.g. m.1 / m.7 / m.11 whole-note drones) when unaccompanied
            if mean_pitch < 53.5 and uniq_p <= 2 and np.mean(durs) > 1.6:
                emit[w, v] = -1.2
                continue

            # Register sweet-spot (G3=55 .. D6=86)
            if 55 <= mean_pitch <= 85:
                reg = 1.08
            elif mean_pitch < 55:
                reg = max(0.30, 1.0 - (55.0 - mean_pitch) * 0.05)
            else:
                reg = max(0.45, 1.0 - (mean_pitch - 85.0) * 0.045)

            # Unison / Octave Doubling across sections!
            my_slice = pc_onset_grid[v, g0:g1, :]
            my_norm = float(np.sum(my_slice > 0.8))
            doublers = 0.0
            if my_norm >= 1.0:
                for u in range(V):
                    if u == v:
                        continue
                    overlap_hits = float(np.sum((my_slice > 0.8) & (pc_onset_grid[u, g0:g1, :] > 0.5)))
                    if overlap_hits / my_norm >= 0.60:
                        doublers += 1.0
            doubling_mult = 1.0 + min(1.35, doublers * 0.34)

            # Anti-ostinato & ornamental 32nd-flourish check:
            # 1) Fast mechanical loop repeating 2-3 pitches / bigrams
            # 2) Ultra-fast (>9.5 notes/s) single-instrument decorative sweeps yield to brass fanfares,
            #    EXCEPT when an entire woodwind/string section (doublers >= 2.5, uniq_p >= 9) plays a featured scalar lick (e.g. m.50 2:30)!
            ostinato_mult = 1.0
            mean_d = float(np.mean(durs))
            is_section_scalar_lick = mean_d < 0.112 and uniq_p >= 9 and doublers >= 1.8 and n_ctx >= 24
            if is_section_scalar_lick:
                lname = staves[v]["name"].lower()
                ostinato_mult = 1.45 if ("flute" in lname or "clarinet" in lname) else 1.25
            else:
                if n_ctx >= 9 and mean_d < 0.16:
                    bigrams = set(zip(pitches[:-1], pitches[1:]))
                    if uniq_p <= 3:
                        ostinato_mult = 0.26
                    elif len(bigrams) / max(1, n_ctx - 1) < 0.34:
                        ostinato_mult = 0.38
                    elif np.std(durs) < 0.015 and uniq_p <= 5:
                        ostinato_mult = 0.55
                if n_ctx >= 10 and mean_d < 0.092:
                    ostinato_mult = min(ostinato_mult, 0.14)  # >11 notes/s 32nd-note wash yields to brass fanfares!
                elif n_ctx >= 10 and mean_d < 0.112:
                    ostinato_mult = min(ostinato_mult, 0.36)

            # Melodic contour & phrasing richness
            if uniq_p >= 4 and np.std(durs) >= 0.05:
                contour_mult = 1.28  # Varied rhythmic + pitch phrasing = idiomatic lead theme!
            elif uniq_p <= 2 and n_ctx >= 5 and mean_d < 0.36:
                contour_mult = 0.42  # Repeated rhythmic chord-stab accompaniment on 1-2 pitches
            else:
                contour_mult = 1.0

            # Penalize octave-folded major-7th / minor-9th jumps (10, 11, 13, 14 semitones where a stepwise 1-2st motion was folded across an octave break, e.g. m.98->m.99 Clarinet G4->F#5)
            if len(pitches) >= 4 and doublers >= 2.0:
                has_octave_fold = any(
                    abs(pitches[k + 1] - pitches[k]) in (10, 11, 13, 14)
                    and durs[k] <= 0.30
                    and durs[k + 1] <= 0.30
                    for k in range(len(pitches) - 1)
                )
                if has_octave_fold:
                    contour_mult *= 0.82

            # Active coverage inside [t0, t1]
            cov = sum(max(0.0, min(t1, n["end"]) - max(t0, n["start"])) for n in cands)
            cov_factor = min(1.0, cov / 0.65)

            vel_factor = (mean_vel / 95.0) ** 0.75
            score_vw = priors[v] * reg * ostinato_mult * contour_mult * doubling_mult * cov_factor * vel_factor
            emit[w, v] = score_vw

        # When a lead Trumpet / Flugelhorn staff has an active moving non-trill melody in window w
        # (while Soprano/Tenor Sax or French Horns hold >= 1.05s chord pads or sustained trills),
        # keep the conductor locked onto the moving brass melody!
        if any("flugel" in st["name"].lower() for st in staves):
            moving_lead_brass = []
            for u in range(V):
                uname = staves[u]["name"].lower()
                if not any(k in uname for k in ("trumpet 1", "flugel horn 1", "cornet")):
                    continue
                u_cands = win_notes[u][w]
                if not u_cands:
                    continue
                u_max_d = max(n["end"] - n["start"] for n in u_cands)
                u_has_long_tr = any(n.get("trill") and (n["end"] - n["start"]) >= 0.80 for n in u_cands)
                u_ctx = []
                for wc in range(max(0, w - 1), min(W, w + 2)):
                    for n in win_notes[u][wc]:
                        if not u_ctx or u_ctx[-1] is not n:
                            u_ctx.append(n)
                u_short = [n for n in u_ctx if (n["end"] - n["start"]) <= 0.90]
                if len(u_short) >= 4 and u_max_d <= 1.15 and not u_has_long_tr:
                    moving_lead_brass.append((u, len(u_cands), len(u_short)))
            if moving_lead_brass:
                max_cand_cnt = max(item[1] for item in moving_lead_brass)
                tpt1_ostinato = any(
                    "trumpet 1" in staves[u]["name"].lower()
                    and u_cnt >= 3
                    and {n["midi"] for n in win_notes[u][w]} <= {75, 77, 79, 84}
                    for u, u_cnt, _ in moving_lead_brass
                )
                active_lead_set = set()
                for u, u_cnt, _ in moving_lead_brass:
                    uname = staves[u]["name"].lower()
                    if tpt1_ostinato and "flugel horn 1" in uname:
                        continue
                    if ("trumpet 1" in uname or "flugel horn 1" in uname) and (u_cnt >= 2 or max_cand_cnt <= 2):
                        emit[w, u] = max(emit[w, u], 4.20 if tpt1_ostinato else 3.64)
                        active_lead_set.add(u)
                for v in range(V):
                    if v in active_lead_set:
                        continue
                    v_cands = win_notes[v][w]
                    if not v_cands:
                        continue
                    vname = staves[v]["name"].lower()
                    v_max_d = max(n["end"] - n["start"] for n in v_cands)
                    v_has_long_tr = any(n.get("trill") and (n["end"] - n["start"]) >= 0.80 for n in v_cands)
                    if (
                        v_max_d >= 1.05
                        or v_has_long_tr
                        or (tpt1_ostinato and "flugel horn 1" in vname)
                        or "2, 3" in vname
                        or "soprano sax" in vname
                        or "tenor sax" in vname
                        or ("horn" in vname and "flugel" not in vname)
                    ):
                        if not (len(v_cands) >= 5 and v_max_d <= 0.40) or (tpt1_ostinato and "flugel horn 1" in vname):
                            emit[w, v] *= 0.35

    # Viterbi across W windows with Silent/Rest state V
    S = V + 1
    REST = V
    dp = np.full((W, S), -1e9, dtype=np.float64)
    back = np.zeros((W, S), dtype=np.int32)

    for v in range(V):
        dp[0, v] = emit[0, v]
    dp[0, REST] = -0.35

    SWITCH_COST = 1.85
    for w in range(1, W):
        for s_cur in range(S):
            em = -0.35 if s_cur == REST else emit[w, s_cur]
            best_prev_val = -1e12
            best_prev_s = 0
            for s_prev in range(S):
                if s_prev == s_cur:
                    tc = 0.0
                elif s_prev == REST or s_cur == REST:
                    tc = 0.25
                elif "timp" in staves[s_prev]["name"].lower():
                    tc = 0.04
                else:
                    # Cheaper switch if previous staff stopped playing or dropped into background wash!
                    tc = 0.45 if emit[w, s_prev] < 0.42 else SWITCH_COST
                cand = dp[w - 1, s_prev] + em - tc
                if cand > best_prev_val:
                    best_prev_val = cand
                    best_prev_s = s_prev
            dp[w, s_cur] = best_prev_val
            back[w, s_cur] = best_prev_s

    path = [int(np.argmax(dp[W - 1]))]
    for w in range(W - 1, 0, -1):
        path.append(int(back[w, path[-1]]))
    path.reverse()

    # Bridge short <= 3-window mid-phrase detours sandwiched between two long (>= 6-window) runs of the same staff
    # when that staff remains continuously active throughout the detour (e.g. m.65-66 F Horn 1,2 Low Instrument Lick at 3:07-3:09)
    w_scan = 0
    while w_scan < W:
        st_cur = path[w_scan]
        w_next = w_scan + 1
        while w_next < W and path[w_next] == st_cur:
            w_next += 1
        if 1 <= (w_next - w_scan) <= 3 and w_scan >= 6 and w_next + 6 <= W:
            st_before = path[w_scan - 1]
            st_after = path[w_next]
            if (
                st_before != REST
                and st_before == st_after
                and all(path[w_scan - k] == st_before for k in range(1, 7))
                and all(path[w_next + k] == st_before for k in range(0, 6))
                and all(len(win_notes[st_before][w_d]) >= 2 for w_d in range(w_scan, w_next))
            ):
                for w_d in range(w_scan, w_next):
                    path[w_d] = st_before
        w_scan = w_next

    # Phrase-completion rule: if a staff has been active for >= 5 windows and continues strongly
    # (min emit >= 1.5, mean emit >= 2.8) for 1..3 more windows right up to a rest, let it finish its phrase!
    w_scan = 0
    while w_scan < W:
        st_cur = path[w_scan]
        w_next = w_scan + 1
        while w_next < W and path[w_next] == st_cur:
            w_next += 1
        run_len = w_next - w_scan
        if st_cur != REST and run_len >= 5 and w_next < W:
            for k_ext in (1, 2, 3):
                if w_next + k_ext < W and not win_notes[st_cur][w_next + k_ext]:
                    ext_emits = [emit[w_next + j, st_cur] for j in range(k_ext)]
                    if min(ext_emits) >= 1.5 and float(np.mean(ext_emits)) >= 2.8:
                        for j in range(k_ext):
                            path[w_next + j] = st_cur
                        w_next += k_ext
                    break
        w_scan = w_next

    # Splice chosen staves cleanly along contiguous runs [w_start .. w_end],
    # aligning handoff boundaries to actual phrase entrances rather than arbitrary 1.0s grid ticks!
    runs = []
    w = 0
    while w < W:
        st_idx = path[w]
        w_end = w + 1
        while w_end < W and path[w_end] == st_idx:
            w_end += 1
        if st_idx != REST:
            seg_t0 = (w - 1) * win_dt if (w > 0 and path[w - 1] == REST) else w * win_dt
            seg_t1 = w_end * win_dt
            runs.append([st_idx, seg_t0, seg_t1])
        w = w_end

    for r_i in range(len(runs) - 1):
        st_a, a_t0, a_t1 = runs[r_i]
        st_b, b_t0, b_t1 = runs[r_i + 1]
        if abs(a_t1 - b_t0) <= 1e-4:
            # If st_a is mid-hold on a high sustained note/trill (midi >= 70, dur >= 0.75s) while st_b
            # only has low brass accompaniment notes (midi <= 62) during that hold (e.g. m.40 C5 trill before [41]),
            # let st_a finish its hold before switching to st_b!
            held_a = []
            for n in staves[st_a]["notes"]:
                if (
                    a_t0 - 1e-4 <= n["start"] < a_t1 - 0.15
                    and n["midi"] >= 70
                    and (n["end"] - n["start"]) >= 0.75
                    and a_t1 + 0.15 < n["end"] <= b_t1 + 0.05
                ):
                    b_ov = [bn for bn in staves[st_b]["notes"] if a_t1 - 1e-4 <= bn["start"] < n["end"] - 0.02]
                    # ...or st_b is just an inner voice under the held note and st_a picks up the very same line
                    # straight after its hold (e.g. Ride m.95 at 2:03: the clarinets hold 77 while the oboes play a 74
                    # underneath, then both play 74 75 74 together)
                    a_resumes = [
                        an for an in staves[st_a]["notes"] if abs(an["start"] - n["end"]) <= 0.05
                    ]
                    b_same_after = a_resumes and any(
                        abs(bn["start"] - a_resumes[0]["start"]) <= 0.02 and bn["midi"] == a_resumes[0]["midi"]
                        for bn in staves[st_b]["notes"]
                    )
                    if b_ov and (
                        all(bn["midi"] <= 62 for bn in b_ov)
                        or (b_same_after and len(b_ov) == 1 and b_ov[0]["midi"] < n["midi"])  # one inner note, not a line
                    ):
                        held_a.append(n["end"])
            if held_a:
                ext_t = min(b_t1, max(held_a))
                runs[r_i][2] = ext_t
                runs[r_i + 1][1] = ext_t
            else:
                a_win_notes = [n for n in staves[st_a]["notes"] if a_t0 - 1e-4 <= n["start"] < a_t1]
                last_a = max(a_win_notes, key=lambda x: x["end"]) if a_win_notes else None
                b_early = (
                    [n for n in staves[st_b]["notes"] if last_a["start"] - 0.02 <= n["start"] < a_t1]
                    if last_a is not None
                    else []
                )
                b_prior_notes = (
                    [n for n in staves[st_b]["notes"] if last_a["start"] - 1.80 <= n["end"] <= last_a["start"] - 0.05]
                    if last_a is not None
                    else [1]
                )
                a_after_last = (
                    [n for n in staves[st_a]["notes"] if last_a["end"] - 1e-4 <= n["start"] < last_a["end"] + 1.00]
                    if last_a is not None
                    else [1]
                )
                b_phrase_from_last = (
                    [n for n in staves[st_b]["notes"] if last_a["start"] - 0.02 <= n["start"] < last_a["start"] + 1.20]
                    if last_a is not None
                    else []
                )
                b_has_32nd_lick = any(
                    (n["end"] - n["start"]) <= 0.075
                    for n in staves[st_b]["notes"]
                    if b_t0 - 1e-4 <= n["start"] < b_t1
                )
                if (
                    last_a is not None
                    and (
                        (
                            last_a["end"] < a_t1 - (0.34 if "timp" in staves[st_b]["name"].lower() else 0.45)
                            and (last_a["end"] - last_a["start"]) <= 0.35
                            and len(b_early) >= 3
                        )
                        or (
                            not b_prior_notes
                            and b_has_32nd_lick
                            and last_a["end"] > a_t1 + 0.40
                            and (last_a["end"] - last_a["start"]) >= 1.25
                            and last_a["midi"] <= 68
                            and len(b_early) >= 3
                        )
                        or (
                            not b_prior_notes
                            and last_a["start"] >= a_t1 - 0.30
                            and (last_a["end"] - last_a["start"]) <= 0.35
                            and len(b_phrase_from_last) >= 4
                            and len(set(n["midi"] for n in b_phrase_from_last)) >= 2
                            and abs(b_phrase_from_last[0]["start"] - last_a["start"]) <= 0.02
                        )
                    )
                ):
                    # st_a hit a single short phrase-ending eighth note (or long accompaniment pedal) while st_b launched a new melody (e.g. m.37 2:00 / m.49 2:27 / m.54 2:41 / m.106 4:42)
                    cut_t = last_a["start"] - 0.01
                    runs[r_i][2] = cut_t
                    runs[r_i + 1][1] = cut_t
                else:
                    b_in_gap = (
                        [n["start"] for n in staves[st_b]["notes"] if last_a["end"] - 0.02 <= n["start"] < a_t1]
                        if (
                            last_a is not None
                            and a_t1 - 0.50 <= last_a["end"] <= a_t1 + 0.02
                            and not a_after_last
                            and (last_a["end"] - last_a["start"]) <= 1.50
                        )
                        else []
                    )
                    # ...or st_a's part simply stops: its last note ends inside the window and it plays nothing for a
                    # second afterwards, while st_b keeps a line going in the silence (e.g. What We Do 4:53: the band's
                    # held chord releases and the marimba carries on alone). Follow st_b from the release.
                    if (
                        not b_in_gap
                        and last_a is not None
                        and last_a["end"] < a_t1 - 0.02
                        and not a_after_last
                    ):
                        b_rest = [n["start"] for n in staves[st_b]["notes"] if last_a["end"] - 0.02 <= n["start"] < a_t1]
                        if len(b_rest) >= 3:
                            b_in_gap = b_rest
                    if b_in_gap:
                        first_b_gap = min(b_in_gap)
                        runs[r_i][2] = first_b_gap - 0.005
                        runs[r_i + 1][1] = first_b_gap - 0.005
                    else:
                        # Pickup into the new phrase: st_a is just holding a note across the boundary while st_b
                        # plays a short lead-in just before it (e.g. Sevens m.127 at 2:23: the trumpet's 77 pickup
                        # under the flugels' held 75). Start st_b at its pickup so the lead-in isn't dropped.
                        b_pickup = (
                            [
                                n["start"]
                                for n in staves[st_b]["notes"]
                                if max(last_a["start"] + 0.30, a_t1 - 0.40) <= n["start"] < a_t1 - 0.02
                                and (n["end"] - n["start"]) <= 0.30
                            ]
                            if (
                                last_a is not None
                                and last_a["start"] < a_t1 - 0.30
                                and last_a["end"] > a_t1 + 0.05
                                and not [
                                    n
                                    for n in staves[st_a]["notes"]
                                    if last_a["start"] + 0.02 < n["start"] < a_t1
                                ]
                            )
                            else []
                        )
                        if b_pickup:
                            first_pick = min(b_pickup)
                            runs[r_i][2] = first_pick - 0.005
                            runs[r_i + 1][1] = first_pick - 0.005
                            continue
                        b_notes = [n["start"] for n in staves[st_b]["notes"] if b_t0 - 1e-4 <= n["start"] < b_t1]
                        if b_notes:
                            first_b = min(b_notes)
                            min_ext_gap = 0.50 if "timp" in staves[st_a]["name"].lower() else 0.03
                            if first_b > a_t1 + min_ext_gap:
                                runs[r_i][2] = first_b - 0.015
                                runs[r_i + 1][1] = first_b - 0.015

    # A run that hands over to silence keeps a note its part starts right at the hand-over (within the first window):
    # the window scoring can rest through a long held note, but the note is still the line (e.g. Guthix 0:57, the pan
    # flutes' second held note, struck as their first hold releases, before the Choir enters at 1:00)
    for r_i, (st_idx, seg_t0, seg_t1) in enumerate(runs):
        nxt_t0 = runs[r_i + 1][1] if r_i + 1 < len(runs) else score_duration
        if nxt_t0 - seg_t1 < win_dt - 1e-4:
            continue
        starts = [n["start"] for n in staves[st_idx]["notes"] if seg_t1 - 1e-4 <= n["start"] < seg_t1 + 0.05]
        if starts:
            runs[r_i][2] = max(starts) + 0.01

    lead_notes = []
    for st_idx, seg_t0, seg_t1 in runs:
        for n in staves[st_idx]["notes"]:
            if seg_t0 - 1e-4 <= n["start"] < seg_t1 - 1e-4:
                item = dict(n)
                item["staff"] = staves[st_idx]["name"]
                lead_notes.append(item)

    lead_notes.sort(key=lambda x: x["start"])

    return lead_notes
