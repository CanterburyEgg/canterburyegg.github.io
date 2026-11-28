"""
Build the Hollywood Connections actor and movie universe from TMDB.

One consistent definition of "things people know":
  * Puzzle movies: English-language, 5,000+ TMDB votes, already released.
  * Fame also counts movies down to 2,000 votes (comedies rarely reach 5,000 on TMDB:
    Elf, Anchorman and Bridesmaids all sit near 4,800), plus main TV roles.
  * Meaningful roles: billed in the top 15, minus bit parts ("Hitman #1", "Himself",
    "(uncredited)", unnamed descriptions). The top 5 billed are always kept.
  * Actors: ranked by body of work (how many of those movies they have a real role in,
    with leads and bigger movies counting more, voice roles counting less).
  * TV: main casts (35%+ of episodes) of live-action English shows with 2,000+ votes, plus a
    classics list, minus anthologies and obscure teen/genre shows. TV-first actors earn spots
    the same way movie actors do.
  * Options floor: an actor must fit 2+ possible groups (movies, shows, hand lists), or seeing
    them on the board gives the answer away. One-show actors can be "anchored" to a show that
    already has 3+ multi-option members (see ANCHOR_MIN_MULTI).

Usage (from the repo root):
    TMDB_API_KEY=... python3 scripts/hollywood_connections/buildUniverse.py

Outputs:
    lists/hc_movies.csv   one row per movie (title gets a year suffix when two movies share a title)
    lists/hc_actors.csv   the ranked actor pool, in the column format puzzleFactory_new.py reads
    lists/hc_review.txt   the bottom of the list and any dropped roles, for a quick human check
Raw TMDB responses are cached in scripts/hollywood_connections/.cache/ so reruns are fast.
"""
import json
import math
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from urllib.parse import urlencode
from urllib.request import urlopen

import pandas as pd

API_KEY = os.environ.get("TMDB_API_KEY")
if not API_KEY:
    raise SystemExit("Set TMDB_API_KEY in the environment.")

MIN_VOTES = 5000          # movies that can be puzzle answers
FAME_MIN_VOTES = 2000     # movies that count toward an actor's fame
POOL_SIZE = 800
CANDIDATES = 1400         # actors whose TV credits are checked before the final ranking
TOP_BILLING = 15          # roles billed 1st through 15th can count
ALWAYS_KEEP = 5           # roles billed 1st through 5th always count, whatever the character name
# ---- TV: built like movies. Main casts of well-known live-action English shows.
TV_MIN_VOTES = 2000       # TMDB votes; streaming shows score high and classic network shows low,
                          # so the two lists below correct the cutoff in both directions
TV_MAIN_SHARE = 0.35      # "main cast" = in at least 35% of the show's episodes...
TV_MAIN_MIN_EPS = 3       # ...and at least 3 episodes
TV_SKIP_GENRES = {10763, 10764, 10767, 16, 99}  # news, reality, talk, animation, documentary

# Classic ensembles below the vote cutoff (network shows from before streaming rarely clear it)
MUST_INCLUDE_SHOWS = [
    "Succession", "Mad Men", "Arrested Development", "Big Little Lies", "That '70s Show",
    "New Girl", "This Is Us", "24", "Star Trek: The Next Generation", "Cheers", "Frasier",
    "The West Wing", "Everybody Loves Raymond", "30 Rock", "Curb Your Enthusiasm", "Veep", "Scrubs",
]

# Shows that clear the cutoff but don't belong: anthologies (new cast each season) and
# teen/genre shows whose casts most players wouldn't know.
EXCLUDE_SHOWS = [
    # anthologies
    "Fargo", "True Detective", "American Horror Story", "Black Mirror", "The White Lotus",
    "DAHMER - Monster: The Jeffrey Dahmer Story", "The Haunting of Hill House",
    "The Haunting of Bly Manor", "American Crime Story", "Guillermo del Toro's Cabinet of Curiosities",
    "Doctor Who",
    # obscure for a general audience
    "Siren", "FROM", "Legacies", "The Originals", "Chucky", "The Purge", "Halo", "Anne with an E",
    "iZombie", "Titans", "Superman & Lois", "Blindspot", "DC's Legends of Tomorrow",
    "Seven Deadly Sins", "The Strain", "I Am Not Okay with This", "Altered Carbon", "ONE PIECE",
    "The Last Kingdom", "Spartacus", "The Wheel of Time", "See", "Chilling Adventures of Sabrina",
    "The End of the F***ing World", "Grimm", "Scorpion",
]

# ---- Options floor: an actor must fit at least this many possible groups (movies, shows, and
# the hand lists in puzzleFactory_new.py). Otherwise seeing them on the board gives the answer away.
MIN_OPTIONS = 2

# ---- One-show actors (Matthew Perry, Matt LeBlanc): famous enough, but their show is their only
# option. They're allowed in "anchored" to that show if the show already has at least
# ANCHOR_MIN_MULTI pool members with other options. puzzleFactory_new.py must only use an anchored
# actor inside their own show's group, and at most 1 anchored actor per puzzle.
ANCHOR_MIN_MULTI = 3

# Famous people whose fame TMDB votes don't capture (older comedies, SNL/TV, music, one franchise).
# They're added to the pool even if their score falls short.
MUST_INCLUDE = [
    "Steve Martin", "Tina Fey", "Amy Poehler", "Jennifer Lopez", "Maggie Smith",
    "Macaulay Culkin", "Daisy Ridley", "Harry Styles",
]

# Character actors whose score is propped up by many supporting parts but whose names most
# players wouldn't recognize. They're skipped and the next person in line takes the spot.
EXCLUDE = [
    # First pass from the bottom of the 800 (Nov 2026). Remove a name here to let it back in.
    # Mykelti Williamson (Bubba) is borderline: Forrest Gump already has 4 pool actors without him
    # (Hanks, Wright, Osment, Sinise). Let him back in if Sinise ever drops out of the pool.
    "Bob Gunton", "Mykelti Williamson", "Thomas Kretschmann", "Noah Taylor", "Jason Flemyng",
    "Donal Logue", "Boyd Holbrook", "Michiel Huisman", "Mark Margolis", "Shea Whigham",
    "Rodrigo Santoro", "Rafe Spall", "Corey Stoll", "John Hannah", "John Ortiz", "Dougray Scott",
    "Philip Baker Hall", "Rupert Friend", "James Rebhorn", "Brenton Thwaites", "Taissa Farmiga",
    "Kyle Gallner", "David Denman", "Billy Burke", "Will Yun Lee", "Reg E. Cathey",
    "Xander Berkeley", "Richard Crenna", "Oded Fehr", "Callum Keith Rennie",
    "James Remar", "John Carroll Lynch", "Ewen Bremner", "Scott Glenn", "Toby Kebbell",
    "Thomas Jane", "Ken Leung", "Robert John Burke", "Max Martini", "Colin Salmon", "P.J. Byrne",
]

# TMDB sometimes lists a star far down the billing. Force these roles to count.
# (actor name, movie title as TMDB spells it)
BILLING_OVERRIDES = {
    ("Jennifer Lawrence", "The Hunger Games: Mockingjay - Part 2"),
}

# The reverse: brief cameos TMDB bills high enough to count. These roles never count.
ROLE_EXCLUDE = {
    ("Jon Favreau", "Deadpool & Wolverine"),   # Happy Hogan cameo, billed 6th
}

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
os.makedirs(CACHE, exist_ok=True)
TODAY = date.today().isoformat()


def tmdb(path, **params):
    """GET a TMDB endpoint, cached on disk."""
    params["api_key"] = API_KEY
    key = re.sub(r"[^A-Za-z0-9]+", "_", path + "_" + "_".join(f"{k}{v}" for k, v in sorted(params.items()) if k != "api_key"))
    fn = os.path.join(CACHE, key + ".json")
    if os.path.exists(fn):
        with open(fn) as f:
            return json.load(f)
    url = f"https://api.themoviedb.org/3{path}?{urlencode(params)}"
    for attempt in range(5):
        try:
            data = json.load(urlopen(url, timeout=30))
            with open(fn, "w") as f:
                json.dump(data, f)
            return data
        except Exception as e:  # rate limit or network blip
            time.sleep(1.5 * (attempt + 1))
            last = e
    raise last


# ---------------------------------------------------------------- movies
def fetch_movies():
    base = dict(sort_by="vote_count.desc", with_original_language="en", **{"vote_count.gte": FAME_MIN_VOTES})
    first = tmdb("/discover/movie", page=1, **base)
    movies = list(first["results"])
    for page in range(2, first["total_pages"] + 1):
        movies += tmdb("/discover/movie", page=page, **base)["results"]
    movies = [m for m in movies if m.get("release_date") and m["release_date"] <= TODAY]
    # Unique by id; give a year suffix to titles shared by two movies (The Lion King 1994 vs 2019)
    by_id = {m["id"]: m for m in movies}
    counts = pd.Series([m["title"] for m in by_id.values()]).value_counts()
    rows = []
    for m in by_id.values():
        year = m["release_date"][:4]
        display = f"{m['title']} ({year})" if counts[m["title"]] > 1 else m["title"]
        rows.append({"id": m["id"], "title": display, "tmdb_title": m["title"], "year": year,
                     "vote_count": m["vote_count"], "popularity": m.get("popularity", 0),
                     "puzzle_ok": m["vote_count"] >= MIN_VOTES,
                     "animated": 16 in m.get("genre_ids", []),
                     "overview": m.get("overview", "")})
    return pd.DataFrame(rows).sort_values("vote_count", ascending=False).reset_index(drop=True)


# ---------------------------------------------------------------- TV
def fetch_shows():
    base = dict(sort_by="vote_count.desc", with_original_language="en", **{"vote_count.gte": TV_MIN_VOTES})
    first = tmdb("/discover/tv", page=1, **base)
    found = list(first["results"])
    for page in range(2, first["total_pages"] + 1):
        found += tmdb("/discover/tv", page=page, **base)["results"]
    for name in MUST_INCLUDE_SHOWS:
        res = [r for r in tmdb("/search/tv", query=name).get("results", []) if r["name"].lower() == name.lower()]
        if res:
            found.append(max(res, key=lambda r: r.get("vote_count", 0)))
        else:
            print("  MUST_INCLUDE_SHOWS not found:", name)
    shows = {}
    for sh in found:
        if sh["name"] in EXCLUDE_SHOWS or set(sh.get("genre_ids", [])) & TV_SKIP_GENRES:
            continue
        shows[sh["id"]] = sh
    out = []
    for sh in shows.values():
        d = tmdb(f"/tv/{sh['id']}")
        ac = tmdb(f"/tv/{sh['id']}/aggregate_credits")
        n_eps = d.get("number_of_episodes") or 1
        need = max(TV_MAIN_MIN_EPS, TV_MAIN_SHARE * n_eps)
        main = [c for c in ac.get("cast", []) if c.get("total_episode_count", 0) >= need]
        out.append({"id": sh["id"], "name": sh["name"], "votes": sh.get("vote_count", 0),
                    "year": (sh.get("first_air_date") or "2000")[:4], "episodes": n_eps,
                    "main": [{"id": c["id"], "name": c["name"], "profile_path": c.get("profile_path"),
                              "gender": c.get("gender"), "eps": c["total_episode_count"],
                              "order": c.get("order", 99)} for c in main]})
    return out


def show_weight(show, actor_eps):
    # Like movie_weight but TV vote counts run ~2.5x lower: 2k -> 0.70, 5k -> 1.1, 10k -> 1.4, 20k -> 1.7.
    age_boost = min(3.0, 1 + max(0, 2010 - int(show["year"])) * 0.04)
    size = max(0.0, math.log10(show["votes"] * age_boost) - 2.6)
    # A long run as a regular counts more: 40 episodes = 1x, up to 3x at 120+ episodes
    # (years on a hit show should count like several hit movies).
    return size * min(3.0, actor_eps / 40)


def load_hand_lists():
    """Read HAND from puzzleFactory_new.py without importing it (it loads data on import).
    Name groups don't count as options: every actor has a name."""
    import ast
    src = open(os.path.join(HERE, "puzzleFactory_new.py")).read()
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "HAND":
            hand = eval(compile(ast.Expression(node.value), "HAND", "eval"), {"dict": dict})
            return [set(g["picks"]) for g in hand.values()]
    return []


# ---------------------------------------------------------------- what counts as a real role
_GENERIC_WORDS = (
    r"man|woman|men|women|boy|girl|guy|lady|kid|child|teen|baby|guard|cop|officer|agent|soldier|"
    r"reporter|journalist|waiter|waitress|bartender|nurse|doctor|surgeon|driver|pilot|student|friend|"
    r"neighbor|neighbour|customer|clerk|stranger|thug|henchman|goon|hitman|technician|scientist|"
    r"newscaster|anchor|announcer|passenger|prisoner|inmate|security|bouncer|dancer|stripper|singer|"
    r"cashier|receptionist|secretary|assistant|worker|tourist|patron|partygoer|bystander|onlooker|"
    r"pedestrian|mourner|villager|citizen|civilian|businessman|executive|lawyer|judge|priest|"
    r"photographer|paramedic|fireman|firefighter|detective|sergeant|captain|lieutenant|marine|"
    r"mercenary|gunman|biker|cowboy|hooker|prostitute|janitor|valet|chef|cook|maid|butler|"
    r"caterer|vendor|salesman|shopper|fan|groupie|hostage|victim|survivor|refugee|alien|robot|"
    r"creature|zombie|vampire|monster|demon|ghost"
)
_GENERIC_ROLE = re.compile(
    rf"^(the |a |an )?((young|old|older|little|tall|fat|bearded|masked|drunk|angry|cute|hot|pretty|"
    rf"nervous|first|second|third|other|lead|head|chief|senior|junior|female|male|black|white|"
    rf"local|police|army|navy|security|school|hotel|bar|club|news|tv|museum|bank|prison|hospital|"
    rf"store|shop|street|chat room|party|wedding|office|airport|train|bus|taxi|cab) )*"
    rf"({_GENERIC_WORDS})( in .*| at .*| on .*| with .*| from .*| \d+| #\d+)?$",
    re.I,
)
_BIT_PART = re.compile(r"#\s*\d|uncredited|\bhimself\b|\bherself\b|\bthemselves\b|\bcameo\b|archive footage", re.I)


def is_voice(character):
    return "(voice)" in (character or "").lower()


def is_meaningful(order, character, actor, tmdb_title):
    if (actor, tmdb_title) in ROLE_EXCLUDE:
        return False
    if (actor, tmdb_title) in BILLING_OVERRIDES:
        return True
    if order < ALWAYS_KEEP:
        return True
    if order >= TOP_BILLING:
        return False
    ch = re.sub(r"\(voice\)", "", character or "", flags=re.I).strip()
    if not ch or _BIT_PART.search(ch):
        return False
    if _GENERIC_ROLE.match(ch):
        return False
    return True


# ---------------------------------------------------------------- fame score
def movie_weight(votes, year):
    # 2k votes -> 0.30, 5k -> 0.70, 10k -> 1.0, 20k -> 1.30, 35k -> 1.54.
    # TMDB voters skew recent, so older movies get their votes scaled up before weighting
    # (a 1990 movie is treated as having 1.8x its votes, a 1980 movie 2.4x).
    age_boost = 1 + max(0, 2010 - int(year)) * 0.04
    return max(0.0, math.log10(votes * min(age_boost, 3.0)) - 3)


def voice_weight(order, voice):
    if not voice: return 1.0
    return 0.75 if order <= 2 else 0.4   # Donkey and Mushu are iconic; "Townsperson (voice)" is not


def tv_weight(show):
    # A main role on a big show counts like a big movie lead. 1.5k votes -> 0.68, 5k -> 1.2, 15k -> 1.68
    eps = show.get("episode_count", 0)
    return (math.log10(show["vote_count"]) - 2.5) * min(1.0, eps / 20)


def franchise_key(title):
    t = re.sub(r"\(\d{4}\)$", "", title.lower())
    t = re.split(r"[:\-–]| part | \d", t)[0]
    words = re.sub(r"^(the|a|an) ", "", t.strip()).split()
    return " ".join(words[:2])


def damped_sum(scores_by_franchise):
    """Each extra movie in the same franchise counts for less: 1, 0.6, 0.4, 0.3, 0.25..."""
    total = 0.0
    for scores in scores_by_franchise.values():
        for i, sc in enumerate(sorted(scores, reverse=True)):
            total += sc * (1.0 if i == 0 else 0.6 / i ** 0.6)
    return total


def billing_weight(order):
    # Stars are remembered for leads; a pile of supporting parts shouldn't outrank them.
    if order <= 1: return 1.2
    if order <= 3: return 0.85
    if order <= 5: return 0.5
    if order <= 9: return 0.25
    return 0.15


def main():
    print("Fetching movies...")
    movies = fetch_movies()
    print(f"  {len(movies)} English-language movies with {FAME_MIN_VOTES:,}+ votes, "
          f"{int(movies['puzzle_ok'].sum())} with {MIN_VOTES:,}+ (puzzle answers)")

    print("Fetching casts...")
    with ThreadPoolExecutor(8) as ex:
        credits = list(ex.map(lambda mid: tmdb(f"/movie/{mid}/credits"), movies["id"]))

    roles, dropped = [], []
    people = {}
    for (_, m), cr in zip(movies.iterrows(), credits):
        for c in cr.get("cast", []):
            if c.get("known_for_department") not in (None, "Acting"):
                continue
            people.setdefault(c["id"], {"name": c["name"], "profile_path": c.get("profile_path"),
                                        "gender": c.get("gender")})
            keep = is_meaningful(c["order"], c.get("character"), c["name"], m["tmdb_title"])
            rec = {"person_id": c["id"], "name": c["name"], "movie_id": m["id"], "title": m["title"],
                   "votes": m["vote_count"], "year": m["year"], "order": c["order"], "character": c.get("character", ""),
                   "voice": is_voice(c.get("character")), "puzzle_ok": m["puzzle_ok"]}
            if keep:
                roles.append(rec)
            elif c["order"] < TOP_BILLING:
                dropped.append(rec)
    roles = pd.DataFrame(roles)
    dropped = pd.DataFrame(dropped)

    roles["score"] = [movie_weight(v, y) * billing_weight(o) * voice_weight(o, voice)
                      for v, y, o, voice in zip(roles["votes"], roles["year"], roles["order"], roles["voice"])]
    roles["fkey"] = roles["title"].map(franchise_key)
    movie_score = {pid: damped_sum(g.groupby("fkey")["score"].apply(list).to_dict())
                   for pid, g in roles.groupby("person_id")}
    print("Fetching TV shows and main casts...")
    shows = fetch_shows()
    print(f"  {len(shows)} shows")
    tv_roles = {}   # person_id -> list of (show, eps)
    for sh in shows:
        for c in sh["main"]:
            people.setdefault(c["id"], {"name": c["name"], "profile_path": c.get("profile_path"),
                                        "gender": c.get("gender")})
            tv_roles.setdefault(c["id"], []).append((sh, c["eps"], c["order"]))
    # Same billing weights as movies, so a show's leads count more than its supporting regulars
    tv_score = {pid: sum(sorted((show_weight(sh, eps) * billing_weight(order) for sh, eps, order in r),
                                reverse=True)[:2])
                for pid, r in tv_roles.items()}

    everyone = set(movie_score) | set(tv_score)
    total = {pid: movie_score.get(pid, 0) + tv_score.get(pid, 0) for pid in everyone}
    ranked = [pid for pid in sorted(total, key=total.get, reverse=True) if people[pid]["name"] not in EXCLUDE]

    name_to_id = {}
    for pid in sorted(everyone, key=lambda x: -total[x]):
        name_to_id.setdefault(people[pid]["name"], pid)
    forced = [name_to_id[n] for n in MUST_INCLUDE if n in name_to_id]
    missing = [n for n in MUST_INCLUDE if n not in name_to_id]
    if missing:
        print("  MUST_INCLUDE names not found:", missing)

    # ---- options floor: count the movie, TV and hand-list groups each actor could be in,
    # given who else is in the pool (a movie needs 4 pool actors to be a group).
    puzzle_roles = roles[roles["puzzle_ok"]]
    movies_of = puzzle_roles.groupby("person_id")["title"].apply(set).to_dict()
    shows_of = {pid: {sh["name"] for sh, _, _ in r} for pid, r in tv_roles.items()}
    hand_lists = load_hand_lists()

    def options(pid, pool_set, m_count, s_count, name_set):
        n = sum(1 for m in movies_of.get(pid, ()) if m_count[m] >= 4)
        n += sum(1 for t in shows_of.get(pid, ()) if s_count[t] >= 4)
        name = people[pid]["name"]
        n += sum(1 for L in hand_lists if name in L and len(L & name_set) >= 4)
        return n

    from collections import Counter
    # Start from a wider reference set so a whole ensemble can qualify together (a show only
    # counts once 4 of its main cast are in), then narrow to POOL_SIZE until stable.
    REF_SIZE = int(POOL_SIZE * 1.6)
    ref = [pid for pid in ranked if pid not in forced][:REF_SIZE] + forced
    floor_dropped = {}
    pool = ref
    for _ in range(10):
        names = {people[x]["name"] for x in ref}
        m_count = Counter(m for x in ref for m in movies_of.get(x, ()))
        s_count = Counter(t for x in ref for t in shows_of.get(x, ()))
        opt = {x: options(x, set(ref), m_count, s_count, names) for x in ref}
        eligible = [x for x in ref if x not in forced and opt[x] >= MIN_OPTIONS]
        for x in ref:
            if x not in forced and opt[x] < MIN_OPTIONS and len(eligible) < POOL_SIZE * 2:
                floor_dropped.setdefault(x, opt[x])
        new_ref = sorted(eligible, key=lambda x: -total[x])[:POOL_SIZE - len(forced)] + forced
        if set(new_ref) == set(ref):
            break
        ref = new_ref
    pool = ref
    # Top back up to POOL_SIZE with the next-ranked people who clear the floor given this pool
    pool_set = set(pool)
    names = {people[x]["name"] for x in pool}
    m_count = Counter(m for x in pool for m in movies_of.get(x, ()))
    s_count = Counter(t for x in pool for t in shows_of.get(x, ()))
    for pid in ranked:
        if len(pool) >= POOL_SIZE:
            break
        if pid in pool_set:
            continue
        trial_m = Counter(m_count); trial_s = Counter(s_count)
        for m in movies_of.get(pid, ()): trial_m[m] += 1
        for t in shows_of.get(pid, ()): trial_s[t] += 1
        nm = names | {people[pid]["name"]}
        if options(pid, pool_set | {pid}, trial_m, trial_s, nm) >= MIN_OPTIONS:
            pool.append(pid); pool_set.add(pid); names = nm; m_count = trial_m; s_count = trial_s
    floor_dropped = {x: o for x, o in floor_dropped.items() if x not in set(pool) and ranked.index(x) < POOL_SIZE * 1.2}
    # ---- anchored one-show actors
    pool_set = set(pool)
    s_multi = Counter(t for x in pool for t in shows_of.get(x, ()))
    fame_cut = min(total[x] for x in pool if x not in forced)
    anchored = {}
    for pid in ranked:
        if pid in pool_set or total[pid] < fame_cut:
            continue
        viable = [t for t in shows_of.get(pid, ()) if s_multi[t] >= ANCHOR_MIN_MULTI]
        if viable:
            anchored[pid] = max(viable, key=lambda t: s_multi[t])
    pool = pool + list(anchored)
    floor_dropped = {x: o for x, o in floor_dropped.items() if x not in anchored}

    names = {people[x]["name"] for x in pool}
    m_count = Counter(m for x in pool for m in movies_of.get(x, ()))
    s_count = Counter(t for x in pool for t in shows_of.get(x, ()))
    opt = {x: options(x, set(pool), m_count, s_count, names) for x in pool}
    pool_ids = sorted(pool, key=lambda x: -total[x])
    # Debug dump of every scored person (cache folder is gitignored)
    pool_set_final = set(pool)
    pd.DataFrame([{"name": people[x]["name"], "total": round(total[x], 2), "movie": round(movie_score.get(x, 0), 2),
                   "tv": round(tv_score.get(x, 0), 2), "rank": i + 1, "in_pool": x in pool_set_final,
                   "shows": "|".join(sorted(shows_of.get(x, ())))}
                  for i, x in enumerate(sorted(everyone, key=lambda x: -total[x]))]
                 ).to_csv(os.path.join(CACHE, "_scores.csv"), index=False)
    n_roles = roles.groupby("person_id")["movie_id"].nunique()

    rows = []
    for rank, pid in enumerate(pool_ids, start=1):
        p = people[pid]
        name = p["name"]
        parts = name.split()
        mine = puzzle_roles[puzzle_roles["person_id"] == pid].sort_values("votes", ascending=False)
        rows.append({
            "rank": rank, "name": name, "profile_path": p["profile_path"],
            "first_name": parts[0], "last_name": parts[-1] if len(parts) > 1 else "",
            "initials": "".join(w[0] for w in parts if w[0].isalpha()).upper(),
            "gender": {1: "Female", 2: "Male"}.get(p["gender"], "Unknown"),
            "fame_score": round(total[pid], 2),
            "movie_score": round(movie_score.get(pid, 0), 2),
            "tv_score": round(tv_score.get(pid, 0), 2),
            "options": opt[pid],
            "anchored_show": anchored.get(pid, ""),
            "n_movies": int(n_roles.get(pid, 0)),
            "movie_credits": "|".join(mine["title"]),
            "tv_shows": "|".join(sorted(shows_of.get(pid, ()))),
        })
    actors = pd.DataFrame(rows)

    actors.to_csv(os.path.join(ROOT, "lists", "hc_actors.csv"), index=False)
    movies.drop(columns=["tmdb_title"]).to_csv(os.path.join(ROOT, "lists", "hc_movies.csv"), index=False)
    # Billing for every pool role, so the puzzle generator can tell leads from supporting parts
    role_rows = [{"name": people[pid]["name"], "kind": "movie", "title": r.title, "order": int(r.order),
                  "voice": bool(r.voice)}
                 for pid in pool_ids for r in puzzle_roles[puzzle_roles["person_id"] == pid].itertuples()]
    role_rows += [{"name": people[pid]["name"], "kind": "tv", "title": sh["name"], "order": int(order), "voice": False}
                  for pid in pool_ids for sh, _, order in tv_roles.get(pid, [])]
    pd.DataFrame(role_rows).to_csv(os.path.join(ROOT, "lists", "hc_roles.csv"), index=False)
    pd.DataFrame([{"id": sh["id"], "name": sh["name"], "votes": sh["votes"], "year": sh["year"],
                   "episodes": sh["episodes"], "main_cast": "|".join(c["name"] for c in sh["main"])}
                  for sh in shows]).to_csv(os.path.join(ROOT, "lists", "hc_shows.csv"), index=False)

    # Review file: bottom of the pool, and named roles of pool actors that the bit-part filter dropped
    pool_names = set(actors["name"])
    with open(os.path.join(ROOT, "lists", "hc_review.txt"), "w") as f:
        f.write(f"Pool: {len(actors)} actors from {len(movies)} movies\n\n")
        f.write("== Bottom 100 of the pool (rank, name, score, movies)\n")
        for r in actors.tail(100).itertuples():
            f.write(f"{r.rank:>4}  {r.name:<28} {r.fame_score:>5}  {r.movie_credits[:90]}\n")
        f.write("\n== Next 60 just outside the pool\n")
        for pid in ranked[POOL_SIZE:POOL_SIZE + 60]:
            f.write(f"      {people[pid]['name']:<28} {total[pid]:.2f}\n")
        f.write("\n== Ranked high enough but dropped by the options floor (name, options)\n")
        for pid, o in sorted(floor_dropped.items(), key=lambda kv: -total[kv[0]]):
            f.write(f"      {people[pid]['name']:<28} {o}  movies: {', '.join(sorted(movies_of.get(pid, ())))[:60]}  tv: {', '.join(sorted(shows_of.get(pid, ())))[:40]}\n")
        f.write("\n== Pool actors' roles dropped as bit parts (check for real roles)\n")
        d = dropped[dropped["name"].isin(pool_names) & dropped["puzzle_ok"]].sort_values(["name", "votes"], ascending=[True, False])
        for r in d.itertuples():
            f.write(f"  {r.name:<26} #{r.order + 1:<3} {r.title[:42]:<42} as \"{r.character}\"\n")
    print("Wrote lists/hc_actors.csv, hc_movies.csv, hc_shows.csv, hc_roles.csv, hc_review.txt")


if __name__ == "__main__":
    main()
