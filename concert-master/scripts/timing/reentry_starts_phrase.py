"""Re-entry starts a phrase (exact scores): a note struck again on the pitch a part was holding is kept as its own
attack when it begins a moving phrase.

`order_and_fuse_ties` joins a same-pitch note onto the long note before it when the recording shows no clear new attack
(a barline tie the reader split). In a MusicXML score real ties are already joined when the score is read, so a
same-pitch note right after a long one is written as a new attack; when it leads straight into other notes of its part
(the next one starts as it ends, on another pitch), it's the part coming back in on the held note, and a soft attack
in a quiet passage doesn't make it a tie (Jupiter 3:15 / 3:18: the horns hold 55, then 55 58 60; hold 60, then 60 63
62 -- the start of the tune again; 3:23: held 67, 67 again, 67, then 65). Tagged here, before the fuse.
"""


def run(ns):
    warped = ns.get("warped")
    score_path = ns.get("score_path")
    if not isinstance(warped, list) or score_path is None or score_path.suffix.lower() not in (".mxl", ".musicxml", ".xml"):
        return
    ws = sorted(warped, key=lambda x: float(x.get("score_start", 0.0)))
    joined = lambda a, b: abs(float(b.get("score_start", 0.0)) - (float(a.get("score_start", 0.0)) + float(a["score_dur"]))) <= 0.05
    for k in range(1, len(ws) - 1):
        p, w = ws[k - 1], ws[k]
        if w.get("staff") != p.get("staff") or int(w["midi"]) != int(p["midi"]) or float(p["score_dur"]) < 0.68:
            continue
        if float(w["score_dur"]) > 1.2:
            continue
        # (it may be struck again first -- 67-held, 67, 67, then 65 -- as long as the part runs on into another pitch)
        j = k
        while j + 1 < len(ws) and ws[j + 1].get("staff") == w.get("staff") and int(ws[j + 1]["midi"]) == int(w["midi"]) and joined(ws[j], ws[j + 1]):
            j += 1
        nx = ws[j + 1] if j + 1 < len(ws) else None
        if nx is None or nx.get("staff") != w.get("staff") or not joined(ws[j], nx):
            continue
        w["keep_restrike"] = True
