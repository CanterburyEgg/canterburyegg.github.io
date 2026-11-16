"""Hold through its own re-strikes: a held lead note whose part keeps re-striking it, with nothing else in the lead
meanwhile, rings on to the last re-strike.

When the lead holds a note (1s+) and its part then strikes the same pitch again and again straight after (3+ times,
back to back) but those strikes aren't in the lead (dropped as a pedal, or never picked), the lead shouldn't go
silent while that part is still sounding the note: the hold carries on through them, up to the next lead note
(Jupiter 0:13: the trumpets hold 76, then strike it four more times up to the trombones' 57 at 0:16; the hold used to
stop after its first 1.45s).
"""


def run(ctx):
    by_name = {st["name"]: sorted(st["notes"], key=lambda m: float(m["start"])) for st in ctx.staves if not st.get("is_drum")}
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    changed = 0
    for i, n in enumerate(lead):
        if float(n["end"]) - float(n["start"]) < 1.0:
            continue
        ns = by_name.get(n.get("staff"), [])
        end, cnt = float(n["end"]), 0
        for m in ns:
            if float(m["start"]) < end - 0.05:
                continue
            if float(m["start"]) - end > 0.05 or int(m["midi"]) != int(n["midi"]):
                break
            end, cnt = float(m["end"]), cnt + 1
        if cnt < 3:
            continue
        nxt = float(lead[i + 1]["start"]) if i + 1 < len(lead) else 1e9
        # (nothing else in the lead while the re-strikes sound)
        new_end = min(end, nxt - 0.01)
        if nxt < float(n["end"]) + 0.3 or new_end <= float(n["end"]) + 0.2:
            continue
        lead[i] = dict(n, end=new_end)
        changed += 1
    if changed:
        print(f"    -> hold through its own re-strikes: {changed} held note(s) ring on")
    ctx.lead_notes = lead
