"""Percussion pulse notes: in a mallet / percussion staff, one pitch struck over and over (20+ times) an octave or more
below everything else the staff plays is an unpitched pulse written on the staff, not a tune: it never leads
(Arabesque: the Mallet Perc staff's low 45 pulse under its real bell notes at 70-91; at 1:09 and 2:40 the lead follows
the timpani's moving 53 48 51 line instead)."""
from collections import Counter

_PERC = ("mallet", "perc")


def run(ctx):
    for st in ctx.staves:
        nm = st["name"].lower()
        if not any(k in nm for k in _PERC) or "timp" in nm:
            continue
        cnt = Counter(int(n["midi"]) for n in st["notes"])
        if not cnt:
            continue
        p, c = cnt.most_common(1)[0]
        others = [m for m in cnt if m != p]
        if c < 20 or not others or min(others) < p + 12:
            continue
        st["notes"] = [n for n in st["notes"] if int(n["midi"]) != p]
        print(f"    -> {st['name']}: {c} pulse notes on {p} set aside (never lead)")
