"""Ensemble hits don't come from runs: a band hit is parts striking (and holding or stabbing) together, not
arpeggios and scales that happen to pass a downbeat at the same instant as a bass note.

`ensemble_hits` counts every stave that has a note starting at the melody note's moment. In a run-heavy passage
(Jupiter 7:26: the low line holds 46 while flutes, clarinets, harp, violins and violas race through arpeggios)
the downbeat of each arpeggio counts as a stave "striking", so a lone bass note became a two-key chord hit whose
second key was a passing viola sixteenth (user, Nov 17: "why do I have a random FK chord? whose notes are those?").

Rule: re-check each chord hit with run notes left out -- a note is part of a run when the same stave's next note
starts within 0.2 score-seconds (a quick note with another right behind it). The chord itself must be in the parts
that strike and hold: if those no longer give >= 2 brass and >= 3 pitch classes, drop it. (The stave count stays
the whole band's: Jupiter 5:18's brass chord under running strings and woodwinds is still a hit.)
"""
import os

from timing import MISSING


def _run_note(notes, i):
    s = float(notes[i]["start"])
    for n in notes[i + 1:]:
        d = float(n["start"]) - s
        if d > 0.001:
            return d < 0.2
    return False


def run(ns):
    chord_hits = ns.get('chord_hits', MISSING)
    if chord_hits is MISSING or not chord_hits:
        return
    staves = ns['staves']
    melody_out = ns['melody_out']
    warped = ns['warped']
    skip = ns.get('_HIT_SKIP', ())
    brass_kw = ns.get('_HIT_BRASS', ())
    sorted_staves = []
    for st in staves:
        nm = st["name"].lower()
        if any(x in nm for x in skip):
            continue
        sorted_staves.append((nm, sorted(st["notes"], key=lambda n: float(n["start"]))))

    def held_attack(s0):
        found = []
        for nm, notes in sorted_staves:
            ps = [int(n["midi"]) for i, n in enumerate(notes)
                  if abs(float(n["start"]) - s0) < 0.04 and not _run_note(notes, i)]
            if ps:
                found.append((nm, ps))
        return found

    n_hit = min(len(melody_out), len(warped))
    by_time = {round(float(melody_out[k][0]), 4): k for k in range(n_hit)}
    kept = []
    for h in chord_hits:
        k = by_time.get(round(float(h[0]), 4))
        if k is None:
            kept.append(h)
            continue
        a = held_attack(float(warped[k]["score_start"]))
        brass = sum(any(b in nm for b in brass_kw) for nm, _ in a)
        pcs = {p % 12 for _, ps in a for p in ps}
        if brass >= 2 and len(pcs) >= 3:
            kept.append(h)
        if os.environ.get("CM_DEBUG_HITS"):
            print("    [hits_no_runs]", h, warped[k]["score_start"], len(a), brass, sorted(pcs), [nm for nm, _ in a])
    chord_hits[:] = kept
