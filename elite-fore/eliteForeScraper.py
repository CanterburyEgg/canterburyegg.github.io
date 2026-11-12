#!/usr/bin/env python3
"""
Elite Fore data builder: Pokémon trivia golf.

Data source: PokéAPI's published CSV dump
  https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv

Usage:
  python3 elite-fore/eliteForeScraper.py --fetch    # one-time download of the CSVs (needs network)
  python3 elite-fore/eliteForeScraper.py --counts   # print how many Pokémon fit each card
  python3 elite-fore/eliteForeScraper.py --stuck    # list Pokémon that can never be a unique answer
  python3 elite-fore/eliteForeScraper.py --build    # build courses + daily pools and write elite_fore.json (the page loads it)
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

POKE_DIR = Path(__file__).resolve().parent
CSV_DIR = POKE_DIR / ".pokeapi_csv"
CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"
CSV_FILES = [
    "pokemon.csv",
    "pokemon_species.csv",
    "pokemon_species_names.csv",
    "pokemon_types.csv",
    "types.csv",
    "pokemon_moves.csv",
    "moves.csv",
    "pokemon_evolution.csv",
    "evolution_triggers.csv",
    "items.csv",
    "item_categories.csv",
    "pokemon_shapes.csv",
    "pokemon_species_flavor_text.csv",
    "versions.csv",
]

MAX_SPECIES_ID = 1025
ENGLISH = "9"
MIN_CARD_SIZE = 40
CORE_FRACTION = 0.40
OUT_JSON_PATH = POKE_DIR / "elite_fore.json"
MAX_FACTS_PER_POKEMON = 8
FACT_FIXES_PATH = POKE_DIR / "pokedex_fixes.json"
CUT_CARD_PREFIXES = ("shape_",)
CUT_CARDS = {"evo_branching", "form_gmax"}

# PokéAPI pokemon_colors ids
POKEDEX_COLORS = {
    "1": "black", "2": "blue", "3": "brown", "4": "gray", "5": "green",
    "6": "pink", "7": "purple", "8": "red", "9": "white", "10": "yellow",
}

# Relative chance of a card being picked when the board builder samples cards.
# Pokédex colors are "rare" cards: they do show up, but much less often than normal cards,
# so a color card doesn't give away the answer and players aren't constantly guessing colors.
DEFAULT_CARD_WEIGHT = 1.0
RARE_CARD_PREFIXES = ("color_",)
RARE_CARD_WEIGHT = 0.07


def card_weight(card: str) -> float:
    return RARE_CARD_WEIGHT if card.startswith(RARE_CARD_PREFIXES) else DEFAULT_CARD_WEIGHT

# Move learn methods that count: level-up (1), move tutor (3), TM/HM (4).
# Egg moves and event/special methods are excluded.
COUNTED_MOVE_METHODS = {"1", "3", "4"}

MOVE_CARDS: dict[str, tuple[str, list[str]]] = {
    "move_ice_beam": ("Can Learn Ice Beam", ["ice-beam"]),
    "move_flamethrower": ("Can Learn Flamethrower", ["flamethrower"]),
    "move_thunderbolt": ("Can Learn Thunderbolt", ["thunderbolt"]),
    "move_surf": ("Can Learn Surf", ["surf"]),
    "move_earthquake": ("Can Learn Earthquake", ["earthquake"]),
    "move_fly": ("Can Learn Fly", ["fly"]),
    "move_psychic": ("Can Learn Psychic", ["psychic"]),
    "move_shadow_ball": ("Can Learn Shadow Ball", ["shadow-ball"]),
    "move_elemental_punch": ("Can Learn an Elemental Punch", ["fire-punch", "ice-punch", "thunder-punch"]),
    "move_elemental_fang": ("Can Learn an Elemental Fang", ["fire-fang", "ice-fang", "thunder-fang"]),
    "move_close_combat": ("Can Learn Close Combat", ["close-combat"]),
    "move_play_rough": ("Can Learn Play Rough", ["play-rough"]),
}

REGIONAL_TAGS = ("-alola", "-galar", "-hisui", "-paldea")

# Every stage of the 27 main-series starter lines (Gen 1 through Gen 9)
STARTER_LINE_FIRST_IDS = [1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501,
                          650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912]
STARTER_IDS = {first + offset for first in STARTER_LINE_FIRST_IDS for offset in range(3)}

# Species with a signature (exclusive) Z-move. Not in PokéAPI's data, so listed by hand.
# Alolan Raichu's Stoked Sparksurfer is left out: it belongs to a regional form, not base Raichu.
# Necrozma covers Ultra Necrozma (Light That Burns the Sky) plus its Dusk Mane / Dawn Wings forms.
SIGNATURE_Z_MOVE_SPECIES = {
    "Pikachu",      # Catastropika, 10,000,000 Volt Thunderbolt
    "Eevee",        # Extreme Evoboost
    "Snorlax",      # Pulverizing Pancake
    "Mew",          # Genesis Supernova
    "Decidueye",    # Sinister Arrow Raid
    "Incineroar",   # Malicious Moonslaught
    "Primarina",    # Oceanic Operetta
    "Lycanroc",     # Splintered Stormshards
    "Mimikyu",      # Let's Snuggle Forever
    "Kommo-o",      # Clangorous Soulblaze
    "Tapu Koko", "Tapu Lele", "Tapu Bulu", "Tapu Fini",  # Guardian of Alola
    "Solgaleo",     # Searing Sunraze Smash
    "Lunala",       # Menacing Moonraze Maelstrom
    "Necrozma",     # Light That Burns the Sky
    "Marshadow",    # Soul-Stealing 7-Star Strike
}


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------

def fetch_csvs() -> None:
    CSV_DIR.mkdir(parents=True, exist_ok=True)
    for name in CSV_FILES:
        url = CSV_BASE + name
        dest = CSV_DIR / name
        print(f"Downloading {name} ...", flush=True)
        req = urllib.request.Request(url, headers={"User-Agent": "CanterburyEggTriviaBot/1.0"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            dest.write_bytes(resp.read())
        print(f"  saved {dest.stat().st_size:,} bytes")
    print("Done.")


def read_csv(name: str) -> list[dict[str, str]]:
    path = CSV_DIR / name
    if not path.exists():
        sys.exit(f"Missing {path}. Run with --fetch first.")
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------------------
# Build roster
# ---------------------------------------------------------------------------

def letters_only(name: str) -> str:
    norm = unicodedata.normalize("NFD", name.lower())
    norm = "".join(ch for ch in norm if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z]", "", norm)


def build_roster() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    species_rows = {r["id"]: r for r in read_csv("pokemon_species.csv") if int(r["id"]) <= MAX_SPECIES_ID}
    pokemon_rows = read_csv("pokemon.csv")
    default_pokemon = {r["species_id"]: r for r in pokemon_rows if r["is_default"] == "1" and r["species_id"] in species_rows}
    forms_by_species: dict[str, list[str]] = defaultdict(list)
    for r in pokemon_rows:
        forms_by_species[r["species_id"]].append(r["identifier"])

    names = {r["pokemon_species_id"]: r["name"] for r in read_csv("pokemon_species_names.csv") if r["local_language_id"] == ENGLISH}

    type_names = {r["id"]: r["identifier"] for r in read_csv("types.csv")}
    types_by_pokemon: dict[str, list[str]] = defaultdict(list)
    for r in sorted(read_csv("pokemon_types.csv"), key=lambda r: int(r["slot"])):
        types_by_pokemon[r["pokemon_id"]].append(type_names[r["type_id"]])

    shapes = {r["id"]: r["identifier"] for r in read_csv("pokemon_shapes.csv")}

    # Moves
    move_ids = {r["identifier"]: r["id"] for r in read_csv("moves.csv")}
    wanted_move_ids = {move_ids[m]: m for _, (_, ms) in MOVE_CARDS.items() for m in ms}
    default_pokemon_ids = {r["id"] for r in default_pokemon.values()}
    learned: dict[str, set[str]] = defaultdict(set)
    # Number of games (version groups) each Pokémon has a learnset in: a proxy for how familiar it is
    games_present: dict[str, set[str]] = defaultdict(set)
    with (CSV_DIR / "pokemon_moves.csv").open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if r["pokemon_id"] not in default_pokemon_ids:
                continue
            games_present[r["pokemon_id"]].add(r["version_group_id"])
            if r["move_id"] in wanted_move_ids and r["pokemon_move_method_id"] in COUNTED_MOVE_METHODS:
                learned[r["pokemon_id"]].add(wanted_move_ids[r["move_id"]])

    # Evolution methods
    item_cats = {r["id"]: r["identifier"] for r in read_csv("item_categories.csv")}
    items = {r["id"]: r for r in read_csv("items.csv")}
    stone_item_ids = {iid for iid, r in items.items() if r["identifier"].endswith("-stone") and item_cats.get(r["category_id"]) == "evolution"}
    triggers = {r["id"]: r["identifier"] for r in read_csv("evolution_triggers.csv")}

    evo_rows_by_species: dict[str, list[dict[str, str]]] = defaultdict(list)
    for r in read_csv("pokemon_evolution.csv"):
        evo_rows_by_species[r["evolved_species_id"]].append(r)

    special_fields = [
        "gender_id", "location_id", "held_item_id", "time_of_day", "known_move_id", "known_move_type_id",
        "minimum_happiness", "minimum_beauty", "minimum_affection", "relative_physical_stats",
        "party_species_id", "party_type_id", "trade_species_id", "needs_overworld_rain", "turn_upside_down",
        "needs_multiplayer", "near_special_rock", "used_move_id", "minimum_move_count", "minimum_steps",
        "minimum_damage_taken",
    ]
    # Triggers that are just "reach a level" in practice (Maushold's 1% family-of-three roll)
    level_like_triggers = {"level-up", "in-battle-level-up"}

    def classify_method(r: dict[str, str]) -> str:
        trig = triggers.get(r["evolution_trigger_id"], "")
        if trig == "use-item" and r.get("trigger_item_id") in stone_item_ids:
            return "stone"
        if trig in level_like_triggers:
            extra = [k for k in special_fields if r.get(k) not in (None, "", "0")]
            cond = r.get("condition_expression", "")
            # EC/PID conditions are hidden random rolls (Wurmple, Tandemaus), not player-facing conditions
            if cond and not cond.startswith(("EC ", "PID ")):
                extra.append("condition_expression")
            if not extra:
                return "level"
        return "special"

    def is_alt_form(form_id: str) -> bool:
        # Default forms share the species/pokemon id (<= 10000); alternate and regional forms are 10001+
        return bool(form_id) and int(form_id) > 10000

    # How each species was evolved INTO: rows that produce its default form (prevo form doesn't matter,
    # so Cursola still counts as evolved from Galarian Corsola)
    evolved_methods: dict[str, set[str]] = defaultdict(set)
    # How each species' BASE form evolves forward: rows that start from the prevo's default form
    forward_children: dict[str, set[str]] = defaultdict(set)
    forward_methods_by_species: dict[str, set[str]] = defaultdict(set)
    regional_only_evolvers: dict[str, set[str]] = defaultdict(set)
    for evolved_sid, rows in evo_rows_by_species.items():
        prevo = species_rows.get(evolved_sid, {}).get("evolves_from_species_id")
        # Rows producing the evolved species' default form (fall back to all rows, e.g. Vivillon patterns)
        into_default = [r for r in rows if not is_alt_form(r.get("evolved_pokemon_form_id", ""))] or rows
        evolved_methods[evolved_sid] = {classify_method(r) for r in into_default}
        if not prevo:
            continue
        from_base = [r for r in rows if not is_alt_form(r.get("required_pokemon_form_id", ""))]
        if not from_base:
            regional_only_evolvers[prevo].add(evolved_sid)
            continue
        forward_children[prevo].add(evolved_sid)
        base_to_default = [r for r in from_base if not is_alt_form(r.get("evolved_pokemon_form_id", ""))] or from_base
        forward_methods_by_species[prevo] |= {classify_method(r) for r in base_to_default}
    for prevo in list(regional_only_evolvers):
        regional_only_evolvers[prevo] -= forward_children.get(prevo, set())
        if not regional_only_evolvers[prevo]:
            del regional_only_evolvers[prevo]
    evolves_into = forward_children

    def stages_above(sid: str) -> int:
        prevo = species_rows.get(sid, {}).get("evolves_from_species_id")
        return 0 if not prevo else 1 + stages_above(prevo)

    def stages_below(sid: str) -> int:
        kids = [k for k in forward_children.get(sid, set()) if k in species_rows]
        return 0 if not kids else 1 + max(stages_below(k) for k in kids)

    def ancestors(sid: str) -> list[str]:
        prevo = species_rows.get(sid, {}).get("evolves_from_species_id")
        return [] if not prevo else [prevo] + ancestors(prevo)

    def base_descendants(sid: str) -> set[str]:
        out: set[str] = set()
        for k in forward_children.get(sid, set()):
            if k in species_rows:
                out |= {k} | base_descendants(k)
        return out

    def family(sid: str) -> set[str]:
        """The Pokémon's evolution line using base forms: everything that grows out of its line's first
        stage without needing a regional form, plus itself and its own ancestors."""
        anc = ancestors(sid)
        root = anc[-1] if anc else sid
        return {root, sid, *anc} | base_descendants(root)

    roster: list[dict[str, Any]] = []
    for sid, srow in sorted(species_rows.items(), key=lambda kv: int(kv[0])):
        prow = default_pokemon[sid]
        name = names.get(sid, srow["identifier"].title())
        types = types_by_pokemon[prow["id"]]
        height_m = int(prow["height"]) / 10
        weight_kg = int(prow["weight"]) / 10
        forms = forms_by_species[sid]
        children = sorted(evolves_into.get(sid, set()))
        forward_methods = forward_methods_by_species.get(sid, set())
        back_methods = evolved_methods.get(sid, set()) if srow["evolves_from_species_id"] else set()

        traits: list[str] = []
        traits += [f"type_{t}" for t in types]
        traits.append("type_dual" if len(types) == 2 else "type_single")
        traits.append(f"gen_{srow['generation_id']}")

        if any(any(tag in f for tag in REGIONAL_TAGS) and "-cap" not in f for f in forms if f != srow["identifier"]):
            traits.append("form_regional")
        if any("-mega" in f for f in forms):
            traits.append("form_mega")
        if any(f.endswith("-gmax") for f in forms):
            traits.append("form_gmax")
        if any(f.endswith("-gmax") for f in forms) or name in SIGNATURE_Z_MOVE_SPECIES:
            traits.append("form_gmax_or_zmove")

        if srow["is_legendary"] == "1" or srow["is_mythical"] == "1":
            traits.append("legendary_mythical")
        if int(sid) in STARTER_IDS:
            traits.append("starter")

        if children:
            traits.append("evo_evolves")
        if srow["evolves_from_species_id"]:
            traits.append("evo_evolved")
        if not children and not srow["evolves_from_species_id"]:
            traits.append("evo_none")
        if not srow["evolves_from_species_id"]:
            traits.append("evo_basic")
        if not children:
            traits.append("evo_final")
        line_len = stages_above(sid) + 1 + stages_below(sid)
        if line_len == 2:
            traits.append("line_2")
        elif line_len >= 3:
            traits.append("line_3")
        if len({species_rows[f]["generation_id"] for f in family(sid) if f in species_rows}) > 1:
            traits.append("evo_cross_gen")
        own_types = set(types)
        if any(set(types_by_pokemon[default_pokemon[c]["id"]]) != own_types for c in children if c in default_pokemon):
            traits.append("evo_next_type_change")
        prevo_sid = srow["evolves_from_species_id"]
        if prevo_sid and prevo_sid in default_pokemon and set(types_by_pokemon[default_pokemon[prevo_sid]["id"]]) != own_types:
            traits.append("evo_prev_type_change")
        if "stone" in forward_methods:
            traits.append("evo_next_stone")
        if "special" in forward_methods:
            traits.append("evo_next_special")
        if "stone" in back_methods:
            traits.append("evo_was_stone")
        if "special" in back_methods:
            traits.append("evo_was_special")
        if len(children) >= 2:
            traits.append("evo_branching")

        traits.append("height_under_1m" if height_m < 1 else ("height_1_2m" if height_m <= 2 else "height_over_2m"))
        traits.append("weight_under_10kg" if weight_kg < 10 else ("weight_10_100kg" if weight_kg <= 100 else "weight_over_100kg"))

        if srow["shape_id"]:
            traits.append(f"shape_{shapes[srow['shape_id']]}")
        if srow.get("color_id"):
            traits.append(f"color_{POKEDEX_COLORS[srow['color_id']]}")

        gr = int(srow["gender_rate"])  # eighths female; -1 = genderless
        if gr == -1:
            traits.append("gender_none")
        elif gr in (0, 8):
            traits.append("gender_single")
        if gr > 4:
            traits.append("gender_more_female")
        elif 0 <= gr < 4:
            traits.append("gender_more_male")
        if srow["has_gender_differences"] == "1":
            traits.append("gender_differences")

        got = learned.get(prow["id"], set())
        for card_id, (_, ms) in MOVE_CARDS.items():
            if any(m in got for m in ms):
                traits.append(card_id)

        lo = letters_only(name)
        traits.append("name_starts_vowel" if lo[0] in "aeiou" else "name_starts_consonant")
        traits.append("name_starts_a_m" if lo[0] <= "m" else "name_starts_n_z")
        # Names ending in Y get neither ending card (Y sounds like a vowel but isn't one)
        if lo[-1] != "y":
            traits.append("name_ends_vowel" if lo[-1] in "aeiou" else "name_ends_consonant")
        traits.append("name_short" if len(lo) <= 5 else ("name_medium" if len(lo) <= 8 else "name_long"))
        if re.search(r"([a-z])\1", lo):
            traits.append("name_double_letter")
        if re.search(r"[^A-Za-zÀ-ÿ]", name):
            traits.append("name_punctuation")

        roster.append({
            "id": int(sid),
            "name": name,
            "types": types,
            "generation": int(srow["generation_id"]),
            "height_m": height_m,
            "weight_kg": weight_kg,
            "traits": traits,
            "games": len(games_present.get(prow["id"], set())),
            "_forward_methods": sorted(forward_methods),
            "_back_methods": sorted(back_methods),
        })

    # "Core" Pokémon: the most familiar ~40% of each generation, by how many games they appear in.
    # Courses use core Pokémon as answers, and sample solutions only use core Pokémon.
    by_gen: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for p in roster:
        by_gen[p["generation"]].append(p)
    for gen_list in by_gen.values():
        gen_list.sort(key=lambda p: (-p["games"], p["id"]))
        cutoff = max(1, round(len(gen_list) * CORE_FRACTION))
        for i, p in enumerate(gen_list):
            p["core"] = i < cutoff

    meta = {
        "stone_items": sorted(items[i]["identifier"] for i in stone_item_ids),
        "regional_only_evolvers": {
            names.get(p, p): sorted(names.get(c, c) for c in cs) for p, cs in regional_only_evolvers.items()
        },
    }
    return roster, meta


def active_cards(roster: list[dict[str, Any]]) -> set[str]:
    """Cards that are actually in play: big enough, and not a cut category."""
    counts: dict[str, int] = defaultdict(int)
    for p in roster:
        for t in p["traits"]:
            counts[t] += 1
    return {
        t for t, c in counts.items()
        if c >= MIN_CARD_SIZE and not t.startswith(CUT_CARD_PREFIXES) and t not in CUT_CARDS
    }


def card_conflict_groups(cards: set[str]) -> list[set[str]]:
    """Sets of cards where at most one may appear on the same board."""
    return [
        {c for c in cards if c.startswith("type_") and c not in ("type_dual", "type_single")},
        {"evo_basic", "evo_final", "evo_none"} & cards,
        {"line_2", "line_3", "evo_none"} & cards,
        {"gender_more_female", "gender_more_male"} & cards,
        {"starter", "gender_more_male"} & cards,
    ]


def find_stuck(roster: list[dict[str, Any]], cards: set[str]) -> dict[str, list[str]]:
    """Pokémon that can never be the single answer: for every allowed combination of their cards,
    some other Pokémon has all of those cards too. Returns {stuck name: [covering Pokémon]}."""
    import itertools

    groups = card_conflict_groups(cards)
    sets = {p["name"]: frozenset(t for t in p["traits"] if t in cards) for p in roster}
    stuck: dict[str, list[str]] = {}
    for name, s in sets.items():
        # For each conflict group the Pokémon has 2+ cards in, it may use only one of them
        choices = []
        for g in groups:
            mine = sorted(s & g)
            if len(mine) > 1:
                choices.append(mine)
        free = set(s)
        for opts in choices:
            free -= set(opts)
        coverers: list[str] = []
        ok = False
        for combo in itertools.product(*choices) if choices else [()]:
            avail = free | set(combo)
            cov = [m for m, ms in sets.items() if m != name and avail <= ms]
            if not cov:
                ok = True
                break
            coverers += cov
        if not ok:
            stuck[name] = list(dict.fromkeys(coverers))
    return stuck


def print_counts(roster: list[dict[str, Any]], meta: dict[str, Any]) -> None:
    counts: dict[str, int] = defaultdict(int)
    for p in roster:
        for t in p["traits"]:
            counts[t] += 1
    print(f"Roster: {len(roster)} Pokémon")
    print(f"Stone items: {', '.join(meta['stone_items'])}\n")
    groups: dict[str, list[str]] = defaultdict(list)
    for t in counts:
        groups[t.split("_")[0]].append(t)
    for g in sorted(groups):
        print(f"== {g} ==")
        for t in sorted(groups[g], key=lambda x: -counts[x]):
            flag = "" if counts[t] >= MIN_CARD_SIZE else f"   <-- under {MIN_CARD_SIZE}"
            print(f"  {t:28s} {counts[t]:5d}{flag}")
    # Multi-method evolutions worth eyeballing
    multi = [p["name"] for p in roster if len(p["_back_methods"]) > 1]
    print(f"\nPokémon reached by more than one kind of method ({len(multi)}): {', '.join(multi)}")
    print("\nEvolutions that only happen from a regional form (not counted for the base form):")
    for p, cs in meta["regional_only_evolvers"].items():
        print(f"  {p} -> {', '.join(cs)}")


# ---------------------------------------------------------------------------
# Card titles & descriptions
# ---------------------------------------------------------------------------

GEN_REGIONS = {1: "Kanto", 2: "Johto", 3: "Hoenn", 4: "Sinnoh", 5: "Unova", 6: "Kalos", 7: "Alola", 8: "Galar", 9: "Paldea"}
MOVE_METHOD_DESC = "by level-up, TM, or move tutor in any main-series game"
SPECIAL_METHOD_DESC = "trading, friendship, a held item, time of day, a location, or another special condition"


def card_def(card: str) -> tuple[str, str, str]:
    """(group, title, description) for a card id. Groups drive the badge color in the UI;
    "name" cards are balanced separately from the rest when building boards."""
    if card.startswith("type_"):
        t = card[5:]
        if t == "dual":
            return "type", "Dual-Type", "Has two types"
        if t == "single":
            return "type", "Single-Type", "Has exactly one type"
        return "type", f"{t.title()} Type", f"Has {t.title()} as one of its types"
    if card.startswith("gen_"):
        g = int(card[4:])
        return "origin", f"Generation {g}", f"First introduced in the Generation {g} games, set in {GEN_REGIONS[g]}"
    if card.startswith("color_"):
        c = card[6:].title()
        return "body", f"Pokédex Color: {c}", f"Listed as {c} in the official Pokédex color data"
    if card in MOVE_CARDS:
        title, moves = MOVE_CARDS[card]
        title = title.replace("Can Learn", "Learns")
        if len(moves) == 1:
            move_name = title.replace("Learns ", "")
            return "moves", title, f"Can learn {move_name} {MOVE_METHOD_DESC}"
        pretty = [m.replace("-", " ").title() for m in moves]
        return "moves", title, f"Can learn {', '.join(pretty[:-1])}, or {pretty[-1]} {MOVE_METHOD_DESC}"
    fixed = {
        "form_regional": ("origin", "Has a Regional Form", "Has an Alolan, Galarian, Hisuian, or Paldean regional variant"),
        "form_mega": ("origin", "Can Mega Evolve", "Has at least one Mega Evolution"),
        "form_gmax_or_zmove": ("origin", "Gigantamax or Signature Z-Move", "Has a Gigantamax form or an exclusive Z-Move of its own"),
        "legendary_mythical": ("origin", "Legendary or Mythical", "Officially classified as a Legendary or Mythical Pokémon"),
        "starter": ("origin", "Starter Pokémon", "Any stage of a starter you can choose at the beginning of a main-series game"),
        "evo_cross_gen": ("origin", "Cross-Generation Line", "Its evolution line includes a Pokémon introduced in a different generation"),
        "evo_evolves": ("evolution", "Evolves", "Can evolve into another Pokémon"),
        "evo_evolved": ("evolution", "Evolved Form", "Evolves from another Pokémon"),
        "evo_none": ("evolution", "Doesn't Evolve", "Does not evolve into or from any other Pokémon"),
        "evo_basic": ("evolution", "Basic Stage", "Does not evolve from any other Pokémon"),
        "evo_final": ("evolution", "Fully Evolved", "Does not evolve into any other Pokémon"),
        "evo_next_stone": ("evolution", "Evolves with a Stone", "Uses an evolution stone to evolve into its next stage"),
        "evo_next_special": ("evolution", "Special Evolution", f"Evolves into its next stage through {SPECIAL_METHOD_DESC}"),
        "evo_was_stone": ("evolution", "Evolved with a Stone", "Was evolved from its previous stage using an evolution stone"),
        "evo_was_special": ("evolution", "Evolved Specially", f"Was evolved from its previous stage through {SPECIAL_METHOD_DESC}"),
        "evo_next_type_change": ("evolution", "Changes Type on Evolving", "Evolves into a Pokémon with different types"),
        "evo_prev_type_change": ("evolution", "Changed Type on Evolving", "Evolves from a Pokémon with different types"),
        "line_2": ("evolution", "Two-Stage Line", "Part of an evolution line with exactly two stages"),
        "line_3": ("evolution", "Three-Stage Line", "Part of an evolution line with three stages"),
        "height_under_1m": ("body", "Under 1 Meter", "Officially stands less than 1 meter or 3 feet 3 inches tall"),
        "height_1_2m": ("body", "1 to 2 Meters", "Officially stands between 1 and 2 meters tall"),
        "height_over_2m": ("body", "Over 2 Meters", "Officially stands taller than 2 meters or 6 feet 7 inches"),
        "weight_under_10kg": ("body", "Under 10 Kilograms", "Officially weighs less than 10 kilograms or 22 pounds"),
        "weight_10_100kg": ("body", "10 to 100 Kilograms", "Officially weighs between 10 and 100 kilograms"),
        "weight_over_100kg": ("body", "Over 100 Kilograms", "Officially weighs more than 100 kilograms or 220 pounds"),
        "gender_none": ("body", "Genderless", "Has no gender"),
        "gender_single": ("body", "Single Gender", "Is always male or always female"),
        "gender_differences": ("body", "Gender Differences", "Males and females look visibly different"),
        "gender_more_female": ("body", "Mostly Female", "More likely to be female than male"),
        "gender_more_male": ("body", "Mostly Male", "More likely to be male than female"),
        "name_starts_vowel": ("name", "Starts with a Vowel", "Name begins with A, E, I, O, or U"),
        "name_starts_consonant": ("name", "Starts with a Consonant", "Name begins with a consonant"),
        "name_ends_vowel": ("name", "Ends in a Vowel", "Name ends with A, E, I, O, or U <em>(excluding Y)</em>"),
        "name_ends_consonant": ("name", "Ends in a Consonant", "Name ends with a consonant <em>(excluding Y)</em>"),
        "name_short": ("name", "Short Name", "Name has 5 letters or fewer"),
        "name_medium": ("name", "Medium-Length Name", "Name has between 6 and 8 letters"),
        "name_long": ("name", "Long Name", "Name has 9 or more letters"),
        "name_double_letter": ("name", "Double Letter", "Name contains two identical letters in a row"),
        "name_punctuation": ("name", "Punctuation in Name", "Name includes a space, hyphen, apostrophe, period, colon, or symbol"),
        "name_starts_a_m": ("name", "First Half of the Alphabet", "Name begins with a letter from A to M"),
        "name_starts_n_z": ("name", "Second Half of the Alphabet", "Name begins with a letter from N to Z"),
    }
    return fixed[card]


GROUP_ORDER = ["type", "origin", "evolution", "body", "moves", "name"]


def category_defs(cards: set[str]) -> list[dict[str, Any]]:
    defs = []
    for c in cards:
        group, title, desc = card_def(c)
        defs.append({"id": c, "group": group, "name": title, "desc": desc, "weight": card_weight(c)})
    defs.sort(key=lambda d: (GROUP_ORDER.index(d["group"]), d["id"]))
    return defs


# ---------------------------------------------------------------------------
# Pokédex entries -> fun facts
# ---------------------------------------------------------------------------

PRONOUN_SKIP_OPENERS = re.compile(
    r"^(It is|It's|It was) (said|believed|rumored|thought|told|known|claimed|considered|reported)\b", re.I
)


def clean_flavor_text(text: str, name: str) -> str:
    t = text.replace("\f", " ").replace("\n", " ").replace("\u00ad", "").replace("\u000c", " ")
    t = re.sub(r"-\s+(?=[a-z])", "", t)  # words hyphen-split across old Game Boy lines
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"POK[ée]MON", "Pokémon", t, flags=re.I)
    t = re.sub(r"POK[ée] BALL", "Poké Ball", t, flags=re.I)
    # Old games shout names in capitals: turn any ALL-CAPS word into Title Case
    t = re.sub(r"\b([A-Z][A-Z'’.\-]{2,})\b", lambda m: m.group(1).title() if m.group(1) not in ("TM", "HM", "HP") else m.group(1), t)
    if t and t[-1] not in ".!?":
        t += "."
    return t


SUBORDINATE_OPENERS = re.compile(
    r"^(When|If|While|Because|As|Although|Though|Once|After|Before|Since|Whenever|Even when|Even if|Unless|Until|To)\b"
)


def name_the_pokemon(text: str, name: str) -> str | None:
    """Make sure the entry's first sentence names the Pokémon.
    Returns None when the entry can't be rewritten cleanly (it gets dropped)."""
    possessive = f"{name}’s" if not name.endswith("s") else f"{name}’"
    parts = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)
    first = parts[0]
    if name.lower() in first.lower():
        return text  # e.g. "With their taillights lit, Volbeat fly..." reads naturally

    # "This Pokémon ..." / "This friendly Pokémon ..." opener
    # Adjectives only: "This friendly Pokémon", never "This is a ferocious Pokémon"
    m = re.match(r"^This ((?:(?!(?:is|was|are|were|has|had|can|will|may|does|did)\b)[\w\-]+ ){0,3})Pokémon(’s|'s)?\b", first)
    if m:
        adjectives, poss = m.group(1).strip(), m.group(2)
        if poss:
            return possessive + text[m.end():]
        if adjectives:
            article = "an" if adjectives[0].lower() in "aeiou" else "a"
            return f"{name}, {article} {adjectives} Pokémon," + text[m.end():]
        return name + text[m.end():]
    # "... this Pokémon('s) ..." inside the first sentence
    m = re.search(r"\bthis Pokémon(’s|'s)?\b", first)
    if m:
        return text[:m.start()] + (possessive if m.group(1) else name) + text[m.end():]

    # Replace the first pronoun in the first sentence, skipping dummy "it is said/thought..."
    pronoun_re = re.compile(r"\b(It's|it's|It’s|it’s|Its|its|It|it|They|they|Their|their|Them|them)\b")
    for m in pronoun_re.finditer(first):
        after = first[m.end():m.end() + 30].lower()
        word = m.group(1).lower().replace("’", "'")
        if word in ("it", "it's") and re.match(r"\s*(is|was|'s)?\s*(said|believed|rumored|thought|told|known|claimed|considered|reported|unknown|not known)\b", after):
            continue
        if word in ("it's",) and re.match(r"\s*(said|believed|rumored|thought|told|known|claimed)\b", after):
            continue
        rep = possessive if word in ("its", "their") else (f"{name} is" if word == "it's" else name)
        if m.start() == 0:
            rep = rep[0].upper() + rep[1:]
        return text[:m.start()] + rep + text[m.end():]

    if name.lower() in text.lower():
        return text  # first sentence is scene-setting with no pronoun; the name follows right after
    return None


# Hand-edited Pokédex entries for the few Pokémon whose entries never name them in a way that can be
# rewritten automatically.
MANUAL_FACTS: dict[str, list[str]] = {
    "Wyrdeer": [
        "The black orbs on Wyrdeer’s antlers shine with an uncanny light when it is erecting invisible barriers.",
        "The fur shed from Wyrdeer’s beard retains heat well and is a highly useful material for winter clothing.",
    ],
    "Maushold": [
        "When facing strong opponents, the whole Maushold group joins the fight, with the larger pair protecting the little ones.",
        "The two little Maushold just appeared one day. The group might be a family of related Pokémon, but nobody knows for sure.",
    ],
    "Squawkabilly": [
        "Squawkabilly prefer to live in cities. They form flocks based on the color of their feathers, and they fight over territory.",
        "Green-feathered Squawkabilly flocks hold the most sway, and it gets very noisy when they’re out searching for food in the mornings and evenings.",
    ],
    "Miraidon": [
        "Much remains unknown about Miraidon. It resembles Cyclizar, but it is far more ruthless and powerful.",
        "Miraidon seems to be the Iron Serpent mentioned in an old book, which is said to have turned the land to ash with its lightning.",
    ],
    "Hydrapple": [
        "Seven syrpents live inside Hydrapple’s apple made of syrup. The syrpent in the center is the commander.",
        "Hydrapple’s capricious syrpents have banded together. On the rare occasion that their moods align, their true power is unleashed.",
    ],
}


def remove_em_dashes(text: str) -> str:
    """No em-dashes in game text: a dash between words becomes a comma."""
    t = re.sub(r"\s*[—–]\s*", ", ", text)
    t = re.sub(r",\s*,", ",", t)
    t = re.sub(r",\s*([.!?])", r"\1", t)
    return t


def build_fun_facts(roster: list[dict[str, Any]]) -> dict[int, list[str]]:
    # Hand-reviewed corrections: {cleaned original entry: corrected entry}. Kept in a file so they
    # survive rebuilds; covers cases the automatic rewrite gets wrong (e.g. "When it gets dark").
    fact_fixes: dict[str, str] = {}
    if FACT_FIXES_PATH.exists():
        fact_fixes = json.loads(FACT_FIXES_PATH.read_text(encoding="utf-8"))
    by_species: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for r in read_csv("pokemon_species_flavor_text.csv"):
        if r["language_id"] == ENGLISH and int(r["species_id"]) <= MAX_SPECIES_ID:
            by_species[r["species_id"]].append((int(r["version_id"]), r["flavor_text"]))
    out: dict[int, list[str]] = {}
    for p in roster:
        seen: set[str] = set()
        facts: list[str] = []
        # Newest games first: their entries read most naturally
        for _, raw in sorted(by_species.get(str(p["id"]), []), key=lambda x: -x[0]):
            t = name_the_pokemon(clean_flavor_text(raw, p["name"]), p["name"])
            cleaned = clean_flavor_text(raw, p["name"])
            if cleaned in fact_fixes:
                t = fact_fixes[cleaned]
            if t is None:
                continue
            t = remove_em_dashes(t)
            key = re.sub(r"[^a-z]", "", t.lower())
            if key in seen or len(t) < 25:
                continue
            seen.add(key)
            facts.append(t)
            if len(facts) >= MAX_FACTS_PER_POKEMON:
                break
        if not facts:
            facts = list(MANUAL_FACTS.get(p["name"], []))
        out[p["id"]] = facts
    return out


def name_aliases(name: str) -> list[str]:
    """Extra ways to type names with punctuation or symbols."""
    aliases: set[str] = set()
    if "♀" in name:
        base = name.replace("♀", "").strip()
        aliases |= {f"{base} f", f"{base} female", f"{base} girl", base}
    if "♂" in name:
        base = name.replace("♂", "").strip()
        aliases |= {f"{base} m", f"{base} male", f"{base} boy", base}
    stripped = re.sub(r"[^A-Za-z0-9À-ÿ]", "", name)
    spaced = re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9À-ÿ]", " ", name)).strip()
    for a in (stripped, spaced):
        if a.lower() != name.lower():
            aliases.add(a)
    return sorted(a.lower() for a in aliases if a)


# ---------------------------------------------------------------------------
# Board builder
# ---------------------------------------------------------------------------

PAR_BOXES = {2: 6, 3: 9, 4: 12}
PAR_SPLITS = {  # (non-name cards, name cards)
    2: [(5, 1), (4, 2)],
    3: [(7, 2), (6, 3), (8, 1)],
    4: [(9, 3), (8, 4), (10, 2)],
}


class BoardBuilder:
    def __init__(self, roster: list[dict[str, Any]], cards: set[str], rng: "random.Random"):
        self.roster = roster
        self.cards = cards
        self.rng = rng
        self.index = {p["name"]: i for i, p in enumerate(roster)}
        self.bits: dict[str, int] = defaultdict(int)
        for i, p in enumerate(roster):
            for t in p["traits"]:
                if t in cards:
                    self.bits[t] |= 1 << i
        self.core_idx = [i for i, p in enumerate(roster) if p.get("core")]
        self.groups = [g for g in card_conflict_groups(cards) if len(g) > 1]
        self.name_cards = {c for c in cards if card_def(c)[0] == "name"}
        # Pairs where one card's Pokémon are all inside another's (A implies B): never on one board
        self.subset_pairs: set[tuple[str, str]] = set()
        for a in cards:
            for b in cards:
                if a != b and (self.bits[a] & ~self.bits[b]) == 0:
                    self.subset_pairs.add((a, b))

    def orthogonal(self, chosen: list[str]) -> bool:
        s = set(chosen)
        for g in self.groups:
            if len(s & g) > 1:
                return False
        for a in chosen:
            for b in chosen:
                if a != b and (a, b) in self.subset_pairs:
                    return False
        return True

    def weighted_sample(self, pool: list[str], k: int, force: list[str] = ()) -> list[str]:
        chosen = [c for c in force if c in pool][:k]
        rest = [c for c in pool if c not in chosen]
        # Efraimidis-Spirakis weighted sampling without replacement
        keyed = sorted(rest, key=lambda c: -(self.rng.random() ** (1.0 / card_weight(c))))
        return chosen + keyed[: k - len(chosen)]

    def solve(self, chosen: list[str], par: int) -> tuple[str, list[str]] | None:
        """Exactly one Pokémon fits every card, plus a sample solution in `par` or fewer core Pokémon."""
        all_bits = -1
        for c in chosen:
            all_bits &= self.bits[c]
        if all_bits <= 0 or all_bits & (all_bits - 1):
            return None
        hio = self.roster[all_bits.bit_length() - 1]["name"]
        n = len(chosen)
        target = (1 << n) - 1
        partials: list[tuple[int, int, str]] = []
        for i in self.core_idx:
            mask = 0
            for j, c in enumerate(chosen):
                if (self.bits[c] >> i) & 1:
                    mask |= 1 << j
            cnt = bin(mask).count("1")
            if 2 <= cnt <= n - 2:
                partials.append((cnt, mask, self.roster[i]["name"]))
        partials.sort(key=lambda x: -x[0])
        top = partials[:45]
        if par == 2:
            for a in range(len(top)):
                for b in range(a + 1, len(top)):
                    if top[a][1] | top[b][1] == target:
                        return hio, [top[a][2], top[b][2]]
        else:
            lim = 40 if par == 3 else 42
            for a in range(min(30, len(top))):
                for b in range(a + 1, min(35, len(top))):
                    m2 = top[a][1] | top[b][1]
                    for c in range(b + 1, min(lim, len(top))):
                        m3 = m2 | top[c][1]
                        if m3 == target:
                            return hio, [top[a][2], top[b][2], top[c][2]]
                        if par == 4:
                            for d in range(c + 1, min(lim, len(top))):
                                if m3 | top[d][1] == target:
                                    return hio, [top[a][2], top[b][2], top[c][2], top[d][2]]
        return None

    def boards_for(self, p: dict[str, Any], par: int, seen: set[tuple[str, ...]], max_boards: int,
                   attempts: int = 160) -> list[dict[str, Any]]:
        mine = [t for t in p["traits"] if t in self.cards]
        bio = [t for t in mine if t not in self.name_cards]
        nm = [t for t in mine if t in self.name_cards]
        rare = [t for t in bio if card_weight(t) < DEFAULT_CARD_WEIGHT]
        out: list[dict[str, Any]] = []
        local: set[tuple[str, ...]] = set()
        for force_rare in (False, True):
            if force_rare and (out or not rare):
                break
            for n_bio, n_nm in self.rng.sample(PAR_SPLITS[par], len(PAR_SPLITS[par])):
                if len(bio) < n_bio or len(nm) < n_nm:
                    continue
                for _ in range(attempts):
                    chosen = self.weighted_sample(bio, n_bio, rare if force_rare else ()) + self.rng.sample(nm, n_nm)
                    sig = tuple(sorted(chosen))
                    if sig in seen or sig in local or not self.orthogonal(chosen):
                        continue
                    solved = self.solve(chosen, par)
                    if not solved or solved[0] != p["name"]:
                        continue
                    local.add(sig)
                    self.rng.shuffle(chosen)
                    out.append({"par": par, "boxes": PAR_BOXES[par], "categories": chosen,
                                "hole_in_ones": [p["name"]], "sample_solution": solved[1], "_sig": sig})
                    if len(out) >= max_boards:
                        return out
                if len(out) >= max_boards:
                    return out
        return out


# Course answers come only from these widely recognized Pokémon (spread across generations).
ICONIC_POKEMON = [
    # Gen 1
    "Bulbasaur", "Venusaur", "Charmander", "Charizard", "Squirtle", "Blastoise", "Butterfree", "Pidgeot",
    "Pikachu", "Raichu", "Vulpix", "Ninetales", "Jigglypuff", "Meowth", "Psyduck", "Growlithe", "Arcanine",
    "Abra", "Alakazam", "Machamp", "Geodude", "Slowpoke", "Gengar", "Onix", "Cubone", "Mr. Mime", "Scyther",
    "Magikarp", "Gyarados", "Lapras", "Ditto", "Eevee", "Vaporeon", "Jolteon", "Flareon", "Snorlax",
    "Articuno", "Zapdos", "Moltres", "Dragonite", "Mewtwo", "Mew", "Clefairy", "Diglett", "Kangaskhan",
    # Gen 2
    "Chikorita", "Cyndaquil", "Typhlosion", "Totodile", "Pichu", "Togepi", "Ampharos", "Marill", "Sudowoodo",
    "Espeon", "Umbreon", "Wobbuffet", "Steelix", "Scizor", "Heracross", "Houndoom", "Tyranitar", "Lugia",
    "Ho-Oh", "Celebi", "Suicune",
    # Gen 3
    "Treecko", "Sceptile", "Torchic", "Blaziken", "Mudkip", "Swampert", "Gardevoir", "Sableye", "Mawile",
    "Aggron", "Flygon", "Milotic", "Absol", "Salamence", "Metagross", "Kyogre", "Groudon", "Rayquaza", "Jirachi",
    "Wailord",
    # Gen 4
    "Turtwig", "Chimchar", "Infernape", "Piplup", "Bidoof", "Shinx", "Luxray", "Lucario", "Garchomp",
    "Togekiss", "Leafeon", "Glaceon", "Rotom", "Dialga", "Palkia", "Giratina", "Darkrai", "Arceus", "Spiritomb",
    # Gen 5
    "Snivy", "Tepig", "Oshawott", "Excadrill", "Zorua", "Zoroark", "Chandelure", "Haxorus", "Hydreigon",
    "Volcarona", "Krookodile", "Reshiram", "Zekrom", "Victini",
    # Gen 6
    "Chespin", "Fennekin", "Froakie", "Greninja", "Pancham", "Talonflame", "Aegislash", "Sylveon", "Hawlucha",
    "Goodra", "Xerneas", "Yveltal",
    # Gen 7
    "Rowlet", "Decidueye", "Litten", "Incineroar", "Popplio", "Primarina", "Rockruff", "Lycanroc", "Mimikyu",
    "Toucannon", "Togedemaru", "Solgaleo", "Lunala",
    # Gen 8
    "Grookey", "Scorbunny", "Cinderace", "Sobble", "Wooloo", "Yamper", "Corviknight", "Toxtricity",
    "Dragapult", "Zacian", "Zamazenta", "Eternatus",
    # Gen 9
    "Sprigatito", "Meowscarada", "Fuecoco", "Skeledirge", "Quaxly", "Lechonk", "Pawmi", "Fidough", "Tinkaton",
    "Gholdengo", "Koraidon", "Miraidon",
]


def build_game(roster: list[dict[str, Any]]) -> dict[str, Any]:
    import random

    cards = active_cards(roster)
    rng = random.Random(2026111142)
    builder = BoardBuilder(roster, cards, rng)
    seen: set[tuple[str, ...]] = set()

    # --- Courses: 27 distinct, widely recognized Pokémon, spread across generations
    by_name = {p["name"]: p for p in roster}
    missing = [n for n in ICONIC_POKEMON if n not in by_name]
    if missing:
        sys.exit(f"ICONIC_POKEMON names not found in roster: {missing}")
    core = [by_name[n] for n in ICONIC_POKEMON]
    rng.shuffle(core)
    used: set[str] = set()

    def course_boards(par: int, count: int) -> list[dict[str, Any]]:
        out = []
        gen_counts: dict[int, int] = defaultdict(int)
        # Round-robin-ish across generations so courses aren't all Kanto
        for p in sorted(core, key=lambda p: gen_counts[p["generation"]]):
            if len(out) >= count:
                break
            if p["name"] in used or gen_counts[p["generation"]] >= 1 + count // 9:
                continue
            bs = builder.boards_for(p, par, seen, 1)
            if bs:
                b = bs[0]
                seen.add(b.pop("_sig"))
                used.add(p["name"])
                gen_counts[p["generation"]] += 1
                out.append(b)
        if len(out) < count:
            sys.exit(f"Could only build {len(out)} of {count} par-{par} course holes")
        return out

    p4 = course_boards(4, 2)
    p3 = course_boards(3, 7)
    p2 = course_boards(2, 18)
    c1 = p2[:9]
    c2p2, c2p3 = p2[9:14], p3[:4]
    c2 = [c2p2[0], c2p3[0], c2p2[1], c2p3[1], c2p2[2], c2p3[2], c2p2[3], c2p2[4], c2p3[3]]
    c3p2, c3p3, c3p4 = p2[14:18], p3[4:7], p4[:2]
    c3 = [c3p2[0], c3p3[0], c3p2[1], c3p4[0], c3p2[2], c3p3[1], c3p2[3], c3p3[2], c3p4[1]]
    course_meta = [
        ("course_1", "Viridian Forest", "9 Holes of Par 2", "", c1),
        ("course_2", "Safari Zone", "5 Par 2s & 4 Par 3s", "", c2),
        ("course_3", "Indigo Plateau", "4 Par 2s, 3 Par 3s & 2 Par 4s", "", c3),
    ]
    courses = []
    for num, (cid, name, sub, icon, holes) in enumerate(course_meta, 1):
        courses.append({
            "id": cid, "num": num, "name": name, "subtitle": sub, "icon": icon,
            "total_par": sum(h["par"] for h in holes),
            "holes": [{**h, "id": i + 1} for i, h in enumerate(holes)],
        })

    # --- Daily pools: every Pokémon (course answers included, on different boards), up to 2 boards each
    daily_pools: dict[str, list[dict[str, Any]]] = {}
    for par in (4, 3, 2):
        pool = []
        for p in roster:
            bs = builder.boards_for(p, par, seen, 2, attempts=120)
            if not bs:
                continue
            for b in bs:
                seen.add(b.pop("_sig"))
            first = bs[0]
            first["single_board"] = len(bs) == 1
            first["alt_boards"] = [{"categories": b["categories"], "sample_solution": b["sample_solution"]} for b in bs[1:]]
            pool.append(first)
        for i, b in enumerate(pool):
            b["id"] = f"D{par}-{i + 1}"
        daily_pools[f"par{par}"] = pool
        print(f"  Par {par} daily pool: {len(pool)} Pokémon", flush=True)

    return {"cards": cards, "courses": courses, "daily_pools": daily_pools}


def write_outputs(roster: list[dict[str, Any]], game: dict[str, Any]) -> None:
    cards = game["cards"]
    defs = category_defs(cards)
    facts = build_fun_facts(roster)
    conflict = [sorted(g) for g in card_conflict_groups(cards) if len(g) > 1]
    cat_idx = {d["id"]: i for i, d in enumerate(defs)}
    packed = [
        [p["name"], [cat_idx[t] for t in p["traits"] if t in cat_idx], 1 if p.get("core") else 0,
         name_aliases(p["name"]), facts.get(p["id"], []), p["id"]]
        for p in roster
    ]
    all_base = [h for c in game["courses"] for h in c["holes"]]
    payload = {
        "categories": defs,
        "conflict_groups": conflict,
        "pokemon_packed": packed,
        "courses": game["courses"],
        "daily_pools": game["daily_pools"],
        "boards": all_base,
    }
    OUT_JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Saved {OUT_JSON_PATH} ({OUT_JSON_PATH.stat().st_size:,} bytes)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--counts", action="store_true")
    ap.add_argument("--stuck", action="store_true")
    ap.add_argument("--build", action="store_true")
    args = ap.parse_args()
    if args.fetch:
        fetch_csvs()
    if args.counts or args.stuck or args.build:
        roster, meta = build_roster()
    if args.build:
        game = build_game(roster)
        for c in game["courses"]:
            print(f"  {c['name']}: {[h['par'] for h in c['holes']]} total par {c['total_par']}")
        write_outputs(roster, game)
    if args.counts:
        print_counts(roster, meta)
    if args.stuck:
        cards = active_cards(roster)
        stuck = find_stuck(roster, cards)
        print(f"\nCards in play: {len(cards)} | Pokémon that can't be a unique answer: {len(stuck)}")
        by_name = {p["name"]: p for p in roster}
        for n, cov in stuck.items():
            p = by_name[n]
            print(f"  {n} [{'/'.join(p['types'])}, Gen {p['generation']}] covered by: {', '.join(cov[:4])}")


if __name__ == "__main__":
    main()
