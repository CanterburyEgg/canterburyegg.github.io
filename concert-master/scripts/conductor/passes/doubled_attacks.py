"""Doubled attacks: two lead notes on the same pitch struck within 0.1s of each other are one note.

When two parts' notes both end up in the lead on the same pitch a hair apart (Jupiter 6:29: the violas' 0.03s 55 and
the English horn's 55 at the same beat came out as a jackhammer D D), the shorter one is dropped. Not a note the corrections keep as struck ("keep_restrikes": Mercury 0:24.8, the
second violins' 81 topping their run just before the flutes' 81 on the downbeat).
"""


def run(ctx):
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out = []
    dropped = 0
    for n in lead:
        p = out[-1] if out else None
        if p is not None and int(p["midi"]) == int(n["midi"]) and float(n["start"]) - float(p["start"]) < 0.1 \
                and p.get("staff") != n.get("staff") and not (p.get("keep_restrike") or n.get("keep_restrike")):
            if float(n["end"]) - float(n["start"]) > float(p["end"]) - float(p["start"]):
                out[-1] = n
            dropped += 1
            continue
        out.append(n)
    if dropped:
        print(f"    -> doubled attacks: {dropped} same-pitch note(s) a hair apart merged")
    ctx.lead_notes = out
