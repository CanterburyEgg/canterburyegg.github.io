"""The score's bar-and-beat grid, for Easy charts.

Each score parser records its measures here (start and length in quarters, time signature) and then converts them to
score seconds with its own tempo map. After warping, `beat_level(score_sec)` tells how strong a note's position is:

  0 = the bar's downbeat, 1 = a beat, 2 = half a beat, 3 = anything smaller.

Beats follow the time signature's grouping: x/4 and x/2 -> every quarter (half); compound x/8 (6, 9, 12) -> every
dotted quarter; other x/8 -> pairs of eighths with a group of three at the end (7/8 = 2+2+3); x/16 -> groups of four
sixteenths with a three at the end (11/16 = 4+4+3, 7/16 = 4+3). Positions are taken as a fraction of the measure, so
a fermata that stretches a bar in time doesn't shift its beats.
"""

_Q = []  # (q_start, q_len, num, den) in quarters, as the parser walks the score
_GRID = []  # (sec_start, sec_end, num, den)


def reset():
    _Q.clear()
    _GRID.clear()


def record_q(q_start, q_len, num, den):
    if q_len > 0 and num > 0 and den > 0:
        _Q.append((float(q_start), float(q_len), int(num), int(den)))


def finalize(q_to_sec):
    """Convert the recorded measures to score seconds (the parser's own tempo map)."""
    _GRID.clear()
    for q0, ql, num, den in sorted(_Q):
        s0, s1 = float(q_to_sec(q0)), float(q_to_sec(q0 + ql))
        if s1 > s0:
            _GRID.append((s0, s1, num, den))
    _Q.clear()


def record_sec(s0, s1, num, den):
    if s1 > s0 and num > 0 and den > 0:
        _GRID.append((float(s0), float(s1), int(num), int(den)))


def grid():
    return list(_GRID)


def _groups(num, den):
    """Beat lengths in 1/den units, in order through the bar."""
    if den <= 4:
        return [1] * num
    if den == 8:
        if num % 3 == 0 and num >= 6:
            return [3] * (num // 3)
        if num <= 3:
            return [num]
        g = [2] * (num // 2)
        if num % 2:
            g[-1] = 3
        return g
    # den 16 (and finer): groups of four, the last one three (or five)
    unit = 4 * den // 16 if den >= 16 else 4
    g = [unit] * (num // unit)
    rem = num - unit * len(g)
    if rem:
        if rem >= 2 or not g:
            g.append(rem)
        else:
            g[-1] += rem
    return g or [num]


def level_in_bar(pos_units, num, den):
    """pos_units: position from the downbeat in 1/den units (may be fractional)."""
    eps = 0.06
    if abs(pos_units) < eps:
        return 0
    acc = 0
    for g in _groups(num, den):
        off = pos_units - acc
        if -eps < off < g - eps:
            if abs(off) < eps:
                return 1
            # half a beat: the middle of a beat of 2 or 4 units (for 1-unit beats, half a unit)
            half = g / 2.0
            if g in (1, 2, 4) and abs(off - half) < eps:
                return 2
            if g == 3 and abs(off - round(off)) < eps and den >= 8:
                return 2
            return 3
        acc += g
    return 3


def beat_level(sec, grid_=None):
    """Strength of a score position (score seconds); None if the score had no bar grid there."""
    g = _GRID if grid_ is None else grid_
    lo, hi = 0, len(g) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        s0, s1, num, den = g[mid]
        if sec < s0 - 0.01:
            hi = mid - 1
        elif sec >= s1 - 0.01:
            lo = mid + 1
        else:
            return level_in_bar((sec - s0) / (s1 - s0) * num, num, den)
    return None
