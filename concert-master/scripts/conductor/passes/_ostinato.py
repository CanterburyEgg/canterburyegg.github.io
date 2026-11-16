"""Helper (not a pass): is a run of notes an ostinato -- a short cell of quick notes going round and round?"""


def is_ostinato(notes, min_len=6):
    """Quick notes (0.15s or shorter) whose pitches repeat with a period of 2, 3 or 4 for 70%+ of the run
    (Jupiter's running strings / woodwinds: 72 74 69 72 79 81 76 79 81 76 ...)."""
    if len(notes) < min_len or any(float(n["end"]) - float(n["start"]) > 0.15 for n in notes):
        return False
    ms = [int(n["midi"]) for n in notes]
    for p in (2, 3, 4):
        same = sum(1 for i in range(len(ms) - p) if ms[i] == ms[i + p])
        if same >= 0.7 * (len(ms) - p):
            return True
    return False
