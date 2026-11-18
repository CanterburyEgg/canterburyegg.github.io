"""The second line for the other hand (counter_store, from corrections_two_hands), timed onto the recording: each note
is placed between the lead notes around it by score position (the lead there is the right hand's part, already timed).
Written to the sidecar as `counterNotes`: [start, end, midi]."""
import counter_store


def run(ns):
    src = counter_store.notes()
    melody_out, warped = ns.get("melody_out"), ns.get("warped")
    if not src or not melody_out or not warped:
        return
    pts = sorted((float(warped[k]["score_start"]), float(melody_out[k][0])) for k in range(min(len(warped), len(melody_out))))

    def at(s):
        for i in range(len(pts) - 1):
            (s_a, a_a), (s_b, a_b) = pts[i], pts[i + 1]
            if s_a <= s <= s_b and s_b > s_a:
                return a_a + (s - s_a) * (a_b - a_a) / (s_b - s_a)
        return None

    out = []
    for n in src:
        t0, t1 = at(float(n["start"])), at(float(n["end"]))
        if t0 is None or t1 is None:
            continue
        out.append([round(t0, 4), round(max(t0 + 0.05, t1 - 0.02), 4), int(n["midi"])])
    ns["counter_notes"] = out
