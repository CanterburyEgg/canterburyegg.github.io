"""Solo ends with the band: the solo is over once the soloist falls into step with the band.

When a solo's last notes are all plain beats (0.4s+) struck together with 4+ other parts, the soloist has joined the
band's texture: those notes are dropped from the solo, and the band's line the conductor picked plays there instead
(Ride 1:21: the alto's 75 73 75 77 inside the band's walk-up 71 73 75 77, which is the line the ear follows).
"""


def run(ctx):
    solo_by_name = ctx.solo_by_name
    is_perc_name = ctx.is_perc_name
    for so in ctx.solos:
        nm_s, ns_s = so["staff"], so["notes"]

        def _with_band(m):
            return sum(1 for nm2, ns in solo_by_name.items() if nm2 != nm_s and not is_perc_name(nm2)
                       and any(abs(float(x["start"]) - float(m["start"])) < 0.04 for x in ns)) >= 4

        k_t = len(ns_s)
        while k_t > 0 and float(ns_s[k_t - 1]["end"]) - float(ns_s[k_t - 1]["start"]) >= 0.4 and _with_band(ns_s[k_t - 1]):
            k_t -= 1
        if len(ns_s) - k_t >= 3:
            so["s1"] = float(ns_s[k_t - 1]["start"])
            print(f"    -> solo ends at {float(ns_s[k_t]['start']):.2f}s (score): {nm_s} falls in with the band")
            so["notes"] = ns_s[:k_t]
