"""A second line for the other hand (score seconds), recorded by the conductor (corrections_two_hands) and warped onto
the recording by the timing module counter_notes. Each note: {"start", "end", "midi", "staff"}."""

_NOTES = []


def reset():
    _NOTES.clear()


def add(notes):
    _NOTES.extend(notes)


def notes():
    return sorted(_NOTES, key=lambda m: float(m["start"]))
