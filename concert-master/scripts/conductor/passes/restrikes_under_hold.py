"""Re-strikes under a hold: a held lead note re-struck a few times while a part above keeps holding is one hold.

When the lead holds a note and then strikes the same pitch again two or more times straight after (Jupiter 2:38-2:42:
the brass hold 76, then 76 76 76 in quarters) while another part holds one long note right through all of it (the
first violins' 88), the ear follows the sustained sound and the re-strikes read as part of it: they merge into the
held note.
"""


def run(ctx):
    staves = [st for st in ctx.staves if not st.get("is_drum")]
    lead = sorted(ctx.lead_notes, key=lambda x: float(x["start"]))
    out, i, merged = [], 0, 0
    while i < len(lead):
        a = lead[i]
        j = i
        while (j + 1 < len(lead) and int(lead[j + 1]["midi"]) == int(a["midi"]) and lead[j + 1].get("staff") == a.get("staff")
               and float(lead[j + 1]["start"]) - float(lead[j]["end"]) <= 0.05
               and float(lead[j + 1]["end"]) - float(lead[j + 1]["start"]) <= 0.6):
            j += 1
        if float(a["end"]) - float(a["start"]) >= 1.0 and j - i >= 2:
            s0, s1 = float(a["start"]), float(lead[j]["end"])
            cover = any(st["name"] != a.get("staff") and any(
                float(m["start"]) <= s0 + 0.05 and float(m["end"]) >= s1 - 0.05 for m in st["notes"]) for st in staves)
            if cover:
                out.append(dict(a, end=s1))
                merged += j - i
                i = j + 1
                continue
        out.append(a)
        i += 1
    if merged:
        print(f"    -> re-strikes under a hold: {merged} re-strike(s) merged into the held note")
    ctx.lead_notes = out
