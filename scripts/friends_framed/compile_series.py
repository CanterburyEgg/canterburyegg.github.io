import base64
import hashlib
import json
import os
import random
import re
import shutil

REPO = "/Users/bmyersmorgan/Documents/GitHub/canterburyegg.github.io"
SCRIPTS_DIR = os.path.join(REPO, "scripts", "friends_framed")
REGISTRY_PATH = os.path.join(SCRIPTS_DIR, "series_registry.json")
ALL_EPS_PATH = os.path.join(SCRIPTS_DIR, "all_friends_eps.json")
IMG_ROOT = os.path.join(REPO, "img", "friends_framed")
OUT_JSON = os.path.join(REPO, "jsons", "friends_framed.json")
HTML_PATH = os.path.join(REPO, "friends-framed.html")


def b64(s: str) -> str:
    return base64.b64encode(s.encode("utf-8")).decode("ascii")


def ep_hash_id(s: int, e: int) -> str:
    h = hashlib.md5(f"friends_framed:S{s:02d}E{e:02d}".encode("utf-8")).hexdigest()[:8]
    return f"e_{h}"


NICKNAMES = {
    (1, 1): ["pilot", "the one where it all began", "wedding dress"],
    (1, 7): ["atm vestibule", "jill goodacre"],
    (2, 6): ["smelly cat", "chrissie hynde"],
    (2, 14): ["lobster"],
    (3, 2): ["wearing any more clothes"],
    (3, 9): ["geller cup", "thanksgiving"],
    (3, 21): ["rollerskates", "pete"],
    (4, 1): ["we were on a break", "beach"],
    (4, 8): ["thanksgiving", "eye patch"],
    (4, 11): ["seven"],
    (4, 12): ["trivia", "quiz", "transponster", "apartment bet", "lightning round"],
    (4, 24): ["london", "take thee rachel"],
    (5, 8): ["turkey head", "flashback"],
    (5, 9): ["my sandwich", "moist maker"],
    (5, 11): ["leather pants"],
    (5, 14): ["my eyes", "they dont know"],
    (5, 16): ["pivot", "couch"],
    (5, 24): ["vegas"],
    (6, 9): ["trifle", "thanksgiving"],
    (6, 10): ["new years", "dance", "janine"],
    (6, 17): ["salmon skin roll"],
    (6, 25): ["candles", "engagement"],
    (7, 10): ["hanukkah", "santa", "superman"],
    (7, 11): ["cheesecake"],
    (7, 24): ["wedding"],
    (8, 4): ["europe story", "ken adams", "backpack"],
    (8, 6): ["spudnik", "pink bunny"],
    (8, 9): ["brad pitt", "will", "thanksgiving"],
    (9, 7): ["baby got back"],
    (9, 13): ["piano bar", "eyebrows"],
    (10, 3): ["spray tan", "mississippilessly"],
    (10, 8): ["floating heads", "foam finger"],
    (10, 11): ["danny devito", "pyramid", "paper snow a ghost"],
    (10, 14): ["crap bag", "banana hammock"],
    (10, 17): ["finale", "series finale", "empty apartment", "phalange"],
}

# Two-parter / alternate-title forgiveness across the series
EXTRA_ALIASES = {
    (1, 1): ["The Pilot", "Pilot", "The One Where It All Began"],
    (1, 16): ["The One with Two Parts"],
    (1, 17): ["The One with Two Parts"],
    (2, 12): ["The One After the Superbowl"],
    (2, 13): ["The One After the Superbowl"],
    (4, 23): ["The One with Ross's Wedding: Part 1", "The One with Ross's Wedding: Part 2"],
    (4, 24): ["The One with Ross's Wedding", "The One with Ross's Wedding: Part 1"],
    (5, 23): ["The One in Vegas", "The One in Vegas: Part 2"],
    (5, 24): ["The One in Vegas", "The One in Vegas: Part 1"],
    (6, 15): ["The One That Could Have Been", "The One That Could Have Been: Part 2"],
    (6, 16): ["The One That Could Have Been", "The One That Could Have Been: Part 1"],
    (6, 24): ["The One with the Proposal", "The One with the Proposal: Part 2"],
    (6, 25): ["The One with the Proposal", "The One with the Proposal: Part 1"],
    (7, 23): ["The One with Monica and Chandler's Wedding", "The One with Monica and Chandler's Wedding: Part 2"],
    (7, 24): ["The One with Monica and Chandler's Wedding", "The One with Monica and Chandler's Wedding: Part 1"],
    (8, 23): ["The One Where Rachel Has a Baby", "The One Where Rachel Has a Baby: Part 2"],
    (8, 24): ["The One Where Rachel Has a Baby", "The One Where Rachel Has a Baby: Part 1"],
    (9, 23): ["The One in Barbados: Part 1", "The One in Barbados: Part 2"],
    (10, 17): ["The Last One: Part 1", "The Last One: Part 2", "Series Finale"],
}


def compile_all():
    with open(ALL_EPS_PATH) as f:
        raw_eps = json.load(f)

    sorted_eps = sorted(raw_eps, key=lambda x: (int(x["season"]), int(x["episode"])))
    by_se = {(int(x["season"]), int(x["episode"])): x for x in sorted_eps}

    catalog = []
    for ep in sorted_eps:
        s, e = int(ep["season"]), int(ep["episode"])
        entry = {"s": s, "e": e, "code": f"S{s} E{e}", "title": ep["title"]}
        if (s, e) in NICKNAMES:
            entry["kw"] = NICKNAMES[(s, e)]
        catalog.append(entry)

    with open(REGISTRY_PATH) as f:
        registry = json.load(f)

    # Deterministic shuffled order across all registered episodes so seasons mix naturally in play!
    reg_keys = sorted(registry.keys())
    rng = random.Random(19940922)  # Friends premiere date!
    rng.shuffle(reg_keys)

    puzzles = []
    for code_key in reg_keys:
        rec = registry[code_key]
        s, e = int(rec["season"]), int(rec["episode"])
        hid = rec["hash_id"]
        ep = by_se[(s, e)]
        year = ep.get("year") or ""

        frames = [f"img/friends_framed/{hid}/{i}.jpg" for i in range(1, 7)]
        for fp in frames:
            full_fp = os.path.join(REPO, fp)
            assert os.path.exists(full_fp), f"Missing frame {full_fp} for {code_key}"

        code_str = f"S{s} E{e}"
        sub_str = f"Season {s}, Episode {e}" + (f" ({year})" if year else "")
        aliases = [f"{code_str} · {ep['title']}"] + EXTRA_ALIASES.get((s, e), [])

        puzzles.append({
            "id": hid,
            "frames": frames,
            "a": b64(ep["title"]),
            "al": [b64(a) for a in aliases],
            "s": b64(sub_str),
            "c": b64(f"{s}:{e}"),
        })

    out_data = {"episodes": catalog, "puzzles": puzzles}
    raw_json = json.dumps(out_data, separators=(",", ":"))
    with open(OUT_JSON, "w") as f:
        f.write(raw_json)

    # Sync embedded fallback in friends-framed.html
    with open(HTML_PATH) as f:
        html = f.read()
    new_html, count = re.subn(
        r'(<script id="embedded-friends-data" type="application/json">).*?(</script>)',
        lambda m: m.group(1) + raw_json + m.group(2),
        html,
        count=1,
        flags=re.S,
    )
    assert count == 1, "Failed to update embedded-friends-data in friends-framed.html"
    with open(HTML_PATH, "w") as f:
        f.write(new_html)

    print(f"Compiled {len(puzzles)} verified episodes into jsons/friends_framed.json ({len(raw_json)/1024:.1f} KB) and synced friends-framed.html.")


if __name__ == "__main__":
    compile_all()
