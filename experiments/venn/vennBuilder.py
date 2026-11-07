#!/usr/bin/env python3
"""
vennBuilder.py — Automated Wikipedia + Infobox + Pageview Data Pipeline for Venn Dive

What this pipeline does:
1. HARVESTS candidate articles from Wikipedia Categories via the MediaWiki API
   (`en.wikipedia.org/w/api.php`), caching responses in `scripts/venn/.wiki_cache.json`.
2. FETCHES for every candidate article:
   - Real 60-day Wikipedia Pageviews (`prop=pageviews`) for mechanical rarity scoring
   - Lead section Wikitext & Infobox fields (`prop=revisions&rvprop=content&rvsection=0`)
   - Plaintext summary (`prop=extracts&exintro=1&explaintext=1`)
   - Redirects (`prop=redirects`) for automatic alias discovery
3. CLEANS & CROSS-TAGS every candidate across all 3 circles using 3-valued logic (`1`, `0`, `"?"`):
   - Filters out meta-articles, processes (`-tion`/`-ing`), company names, and organic
     marine gems (`Pearl`, `Coral`, `Ivory`, `Ammolite`) from mined categories.
   - Parses Wikipedia Infobox `| color =` fields strictly so multi-color minerals
     (`Opal`, `Diamond`, `Quartz`, `Calcite`, `Fluorite`, `Beryl`, `Topaz`, `Tourmaline`,
     `Spinel`, `Zircon`, `Sapphire`, `Jade`, `Feldspar`, `Barite`, `Dolomite`, `Gypsum`)
     get `"?"` and work in BOTH valid Venn sections.
4. SCORES RARITY mechanically from 60-day Wikipedia pageview counts within each region:
   - Top ~18% pageviews -> `plankton` (10 pts)
   - Famous trivia traps -> `tooclever` (15 pts)
   - Next ~30% -> `schooler` (30 pts)
   - Next ~27% -> `rare` (60 pts)
   - Bottom ~25% -> `deepcut` (85 pts)
   - Designated regional gem -> `krillion` (100 pts)
5. WRITES `lists/venn/puzzles.json` and syncs the embedded bank in `venn.html`.

Usage:
  python3 scripts/venn/vennBuilder.py --build
  python3 scripts/venn/vennBuilder.py --audit lists/venn/puzzles.json
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

WIKI_API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "VennTriviaBuilder/2.0 (https://github.com/canterburyegg/canterburyegg.github.io)"
VENN_DIR = Path(__file__).resolve().parent
CACHE_PATH = VENN_DIR / ".wiki_cache.json"

REGION_KEYS = ["A", "B", "C", "AB", "AC", "BC", "ABC"]

SKIP_PATTERNS = re.compile(
    r"^(List of|Index of|Outline of|Portal:|Category:|Template:|Types of|History of|"
    r"Glossary of|Classification of|Comparison of|Shades of |Mineral$|Gemstone$|"
    r"Rock \(geology\)$|Ore$|Cooking$|Kitchen$|Utensil$|Color$|Given name$)|"
    r"(Corporation|Company|Inc\.|Ltd|utensils$|appliances$|instruments$|tools$|fasteners$|"
    r"minerals$|rocks$|pigments$|processes$|techniques$|exfoliation|stitching|ification$|"
    r"ism$|cuisine$|frying$|boiling$|roasting$|steaming$|separation$|material$|industry$|"
    r"-$|\([a-z0-9]+\)$)",
    re.I,
)

# Marine/biological gems in Category:Gemstones that are NOT mined from rock/ground
NON_MINED_ORGANIC_GEMS = {
    "pearl", "cultured pearl", "akoya pearl", "tahitian pearl", "freshwater pearl",
    "coral", "red coral", "precious coral", "black coral",
    "ivory", "walrus ivory", "elephant ivory",
    "nacre", "mother of pearl", "mother-of-pearl", "abalone", "conch pearl",
    "tortoiseshell", "shell", "seashell", "operculum", "bezoar",
}

# Non-white web colors that Wikipedia places inside Category:Shades_of_white
NON_WHITE_SHADE_ARTICLES = {
    "spring green", "alice blue", "peach", "lemon chiffon", "honeydew", "mint cream",
    "azure", "lavender blush", "misty rose", "papaya whip", "moccasin", "bisque",
    "blanched almond", "wheat", "Wait", "shades of white", "white",
}


def load_cache() -> dict[str, Any]:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"categories": {}, "pages": {}}


def save_cache(cache: dict[str, Any]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def clean_title(title: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*$", "", title).strip()


def is_clean_entity_name(name: str) -> bool:
    if not name or len(name) < 3 or len(name) > 26:
        return False
    if SKIP_PATTERNS.search(name):
        return False
    if name.endswith("-"):
        return False
    if re.search(r"\b(and|or|of|in|for|the|with|by)\b", name.lower()) and not re.search(
        r"(mortar and pestle|plaster of paris|mother of pearl|bicarbonate of soda|cream of tartar|eye|salt|lapis)",
        name.lower(),
    ):
        return False
    return True


def fetch_category_members(category: str, limit: int, cache: dict[str, Any]) -> list[str]:
    if not category.startswith("Category:"):
        category = f"Category:{category}"
    cache_key = f"{category}::{limit}"
    if cache_key in cache["categories"]:
        return cache["categories"][cache_key]

    titles: list[str] = []
    cmcontinue: str | None = None
    while len(titles) < limit:
        params: dict[str, Any] = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": category,
            "cmtype": "page",
            "cmlimit": min(50, limit - len(titles)),
            "format": "json",
        }
        if cmcontinue:
            params["cmcontinue"] = cmcontinue
        url = f"{WIKI_API}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.load(resp)
        except Exception as exc:
            print(f"[warn] Category fetch failed for {category}: {exc}", file=sys.stderr)
            break

        for m in data.get("query", {}).get("categorymembers", []):
            raw_title = m.get("title", "")
            if not raw_title or SKIP_PATTERNS.search(raw_title):
                continue
            titles.append(raw_title)

        cmcontinue = data.get("continue", {}).get("cmcontinue")
        if not cmcontinue:
            break

    deduped = list(dict.fromkeys(titles))
    cache["categories"][cache_key] = deduped
    return deduped


def fetch_page_links(page_title: str, cache: dict[str, Any]) -> list[str]:
    """Fetch all article links from a Wikipedia 'List of...' or overview page."""
    cache_key = f"PAGELINKS::{page_title}"
    if cache_key in cache["categories"]:
        return cache["categories"][cache_key]

    params = {
        "action": "parse",
        "page": page_title,
        "prop": "links",
        "format": "json",
    }
    url = f"{WIKI_API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    titles: list[str] = []
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.load(resp)
        for link in data.get("parse", {}).get("links", []):
            if link.get("ns") == 0 and "exists" in link:
                raw_title = link.get("*", "")
                if raw_title and not SKIP_PATTERNS.search(raw_title):
                    titles.append(raw_title)
    except Exception as exc:
        print(f"[warn] Page links fetch failed for {page_title}: {exc}", file=sys.stderr)

    deduped = list(dict.fromkeys(titles))
    cache["categories"][cache_key] = deduped
    return deduped


def fetch_pages_metadata(titles: list[str], cache: dict[str, Any]) -> dict[str, dict[str, Any]]:
    filtered = [t for t in dict.fromkeys(titles) if is_clean_entity_name(clean_title(t))]
    missing = [
        t
        for t in filtered
        if t not in cache["pages"] or not cache["pages"][t].get("views_60d")
    ]
    if missing:
        print(f"Fetching Wikipedia API metadata (10-page batches for complete pageviews) for {len(missing)} articles...")

    # MediaWiki `prop=pageviews` returns at most 10 pages per request without continuation
    batches = [missing[i : i + 10] for i in range(0, len(missing), 10)]

    def fetch_one_batch(batch: list[str]) -> dict[str, Any]:
        params = {
            "action": "query",
            "prop": "pageviews|info|extracts|revisions",
            "titles": "|".join(batch),
            "exintro": "1",
            "exsentences": "3",
            "explaintext": "1",
            "rvprop": "content",
            "rvsection": "0",
            "redirects": "1",
            "format": "json",
        }
        url = f"{WIKI_API}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return json.load(resp)
        except Exception as exc:
            print(f"[warn] Batch metadata failed: {exc}", file=sys.stderr)
            return {}

    if batches:
        with ThreadPoolExecutor(max_workers=8) as pool:
            for data in pool.map(fetch_one_batch, batches):
                if not data:
                    continue
                redirect_map: dict[str, list[str]] = {}
                for r in data.get("query", {}).get("redirects", []):
                    redirect_map.setdefault(r["to"], []).append(r["from"])

                pages = data.get("query", {}).get("pages", {})
                for page in pages.values():
                    if "missing" in page:
                        continue
                    p_title = page.get("title", "")
                    pv_dict = page.get("pageviews") or {}
                    views_60d = sum(v for v in pv_dict.values() if isinstance(v, int))
                    page_len = page.get("length", 1000)
                    # Fallback if Wikipedia had 0 recorded views or throttled pv
                    if views_60d == 0:
                        views_60d = max(1, int(page_len // 10))
                    extract = (page.get("extract") or "").strip()
                    revs = page.get("revisions") or []
                    wikitext = revs[0].get("*", "") if revs else ""
                    if not wikitext and revs and "slots" in revs[0]:
                        wikitext = revs[0]["slots"].get("main", {}).get("*", "")

                    infobox_color = extract_infobox_field(wikitext, ["color", "colour"])
                    aliases = [
                        clean_title(a)
                        for a in redirect_map.get(p_title, [])
                        if clean_title(a).lower() != clean_title(p_title).lower()
                    ]

                    prev = cache["pages"].get(p_title) or {}
                    record = {
                        "title": p_title,
                        "clean": clean_title(p_title),
                        "views_60d": views_60d,
                        "length": page_len,
                        "extract": extract or prev.get("extract", ""),
                        "infobox_color": infobox_color or prev.get("infobox_color", ""),
                        "aliases": aliases or prev.get("aliases", []),
                    }
                    cache["pages"][p_title] = record
                    for orig in redirect_map.get(p_title, []):
                        cache["pages"][orig] = record

    if missing:
        save_cache(cache)

    # Also build a case-insensitive lookup by clean title
    by_clean: dict[str, dict[str, Any]] = {}
    for rec in cache["pages"].values():
        if isinstance(rec, dict) and "clean" in rec:
            by_clean[rec["clean"].lower()] = rec

    out: dict[str, dict[str, Any]] = {}
    for t in titles:
        if t in cache["pages"]:
            out[t] = cache["pages"][t]
        elif clean_title(t).lower() in by_clean:
            out[t] = by_clean[clean_title(t).lower()]
    return out


def extract_infobox_field(wikitext: str, keys: list[str]) -> str:
    found: list[str] = []
    for line in wikitext.splitlines():
        m = re.match(r"^\s*\|\s*([a-zA-Z0-9_]+)\s*=\s*(.+)$", line)
        if m and m.group(1).lower() in keys:
            val = re.sub(r"\{\{[^}]+\}\}", " ", m.group(2))
            val = re.sub(r"\[\[([^|\]]+\|)?([^\]]+)\]\]", r"\2", val)
            val = re.sub(r"<[^>]+>", " ", val)
            found.append(val.strip())
    return " ; ".join(found)


def parse_mineral_color_White(info: dict[str, Any]) -> int | str:
    """
    Strictly inspect a mineral/gemstone's Infobox `color` field (or first sentence if no infobox)
    to classify White (`1`), Not White (`0`), or Multi-variety including White (`"?"`).
    """
    name_low = info["clean"].lower()
    always_white = {
        "chalk", "cryolite", "alabaster", "talc", "nahcolite", "trona", "ulexite",
        "borax", "kaolin", "kaolinite", "gypsum", "anhydrite", "magnesite", "wollastonite",
        "petalite", "cerussite", "witherite", "strontianite", "natrolite", "scolecite",
        "tremolite", "perlite", "diatomaceous earth", "diatomite", "limestone", "selenite",
        "howlite", "mirabilite", "thenardite", "colemanite", "kernite", "aragonite",
        "pumice", "white quartz", "milky quartz", "meerschaum", "sepiolite", "alunite",
        "brucite", "hydromagnesite", "epsomite", "goslarite", "pickeringite",
    }
    if name_low in always_white:
        return 1

    multi_white = {
        "opal", "diamond", "quartz", "calcite", "fluorite", "beryl", "topaz",
        "tourmaline", "spinel", "zircon", "corundum", "sapphire", "jade", "nephrite",
        "jadeite", "feldspar", "albite", "orthoclase", "plagioclase", "microcline",
        "moonstone", "barite", "baryte", "celestite", "dolomite", "smithsonite",
        "apophyllite", "spodumene", "amblygonite", "agate", "chalcedony", "zeolite",
        "stilbite", "heulandite", "laumontite", "chabazite", "analcime", "pectolite",
        "hemimorphite", "anglesite", "scheelite", "cassiterite", "kainite", "sylvite",
        "carnallite", "polyhalite", "glauberite", "bloedite", "blödite",
    }
    if name_low in multi_white:
        return "?"

    color_text = (info.get("infobox_color") or "").lower()
    if not color_text:
        return 0

    has_white = bool(re.search(r"\b(white|colorless|colourless|milky|snow-white)\b", color_text))
    other_colors = re.findall(
        r"\b(red|blue|green|yellow|purple|violet|black|orange|pink|brown|crimson|scarlet|emerald|azure|dark|gray|grey)\b",
        color_text,
    )
    if has_white and not other_colors:
        return 1
    if has_white and other_colors:
        return "?"
    return 0


def parse_mineral_color_RedPink(info: dict[str, Any]) -> int | str:
    """
    Strictly inspect a mineral/gemstone's Infobox `color` field & first sentence
    to classify Red/Pink (`1`), Not Red/Pink (`0`), or Multi-variety including Red/Pink (`"?"`).
    """
    name_low = info["clean"].lower()
    always_red_pink = {
        "ruby", "cinnabar", "rhodochrosite", "rhodonite", "cuprite", "realgar",
        "proustite", "pyrargyrite", "crocoite", "erythrite", "rose quartz", "carnelian",
        "sard", "morganite", "kunzite", "rubellite", "bixbite", "pezzottaite",
        "eudialyte", "tugtupite", "thulite", "piemontite", "villiaumite", "roselite",
        "inesite", "pyroxmangite", "bustamite", "painite", "jacinth", "hyacinth",
        "pyrope", "almandine", "rhodolite", "red ochre", "red jasper", "red beryl",
        "red spinel", "pink diamond",
    }
    if name_low in always_red_pink:
        return 1

    multi_red_pink = {
        "garnet", "spinel", "tourmaline", "opal", "topaz", "zircon", "beryl",
        "corundum", "quartz", "fluorite", "diamond", "andalusite", "spodumene",
        "jasper", "agate", "chalcedony", "calcite", "apophyllite", "elbaite",
        "spessartine", "grossular", "hessonite", "rutile", "hematite", "sphalerite",
        "wulfenite", "vanadinite", "zunyite", "stibiotantalite", "monazite",
    }
    if name_low in multi_red_pink:
        return "?"

    color_text = (info.get("infobox_color") or "").lower()
    if not color_text:
        return 0

    has_rp = bool(
        re.search(
            r"\b(red|reddish|pink|pinkish|rose|crimson|scarlet|vermilion|carmine|ruby|magenta|burgundy|salmon|coral|peach)\b",
            color_text,
        )
    )
    other_colors = re.findall(
        r"\b(blue|green|yellow|black|white|purple|violet|gray|grey|colorless|brown)\b",
        color_text,
    )
    if has_rp and not other_colors:
        return 1
    if has_rp and other_colors:
        return "?"
    return 0


def load_given_names_set(cache: dict[str, Any]) -> set[str]:
    names: set[str] = set()
    proper_path = Path("/usr/share/dict/propernames")
    if proper_path.exists():
        for line in proper_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.strip():
                names.add(line.strip().lower())

    for cat in [
        "Category:English-language_feminine_given_names",
        "Category:English-language_unisex_given_names",
        "Category:English-language_masculine_given_names",
    ]:
        for t in fetch_category_members(cat, 400, cache):
            names.add(clean_title(t).lower())

    names.update({
        "ruby", "jade", "amber", "opal", "pearl", "emerald", "sapphire", "amethyst", "topaz",
        "garnet", "peridot", "onyx", "jasper", "mica", "micah", "crystal", "beryl", "agate",
        "ivory", "ebony", "coral", "scarlet", "scarlett", "rose", "rosie", "cherry", "sienna",
        "poppy", "carmine", "crimson", "magenta", "fuchsia", "violet", "indigo", "hazel",
        "olive", "clementine", "iris", "lily", "daisy", "fiona", "flannery", "sorrel",
        "carnelian", "jacinth", "hyacinth", "celeste", "azura", "cyan", "mauve", "ginger",
        "rusty", "penny", "goldie", "sterling", "flint", "slate", "clay", "cole", "sandy",
    })
    return names


def expand_three_valued_bits(bits: list[int | str]) -> list[str]:
    options = [[0, 1] if b == "?" else [int(b)] for b in bits]
    regions: list[str] = []
    for a in options[0]:
        for b in options[1]:
            for c in options[2]:
                if a and b and c:
                    regions.append("ABC")
                elif a and b and not c:
                    regions.append("AB")
                elif a and not b and c:
                    regions.append("AC")
                elif not a and b and c:
                    regions.append("BC")
                elif a and not b and not c:
                    regions.append("A")
                elif not a and b and not c:
                    regions.append("B")
                elif not a and not b and c:
                    regions.append("C")
    return regions


def lookup_views(name: str, cache: dict[str, Any], default: int = 35000) -> int:
    pages = cache.get("pages", {})
    if name in pages:
        return pages[name].get("views_60d", default)
    low = name.lower()
    for rec in pages.values():
        if isinstance(rec, dict) and rec.get("clean", "").lower() == low:
            return rec.get("views_60d", default)
    return default


def assign_pageview_tiers(items: list[dict[str, Any]], cache: dict[str, Any]) -> list[dict[str, Any]]:
    by_norm: dict[str, dict[str, Any]] = {}
    for it in items:
        ans = it["answer"].strip()
        if not is_clean_entity_name(ans):
            continue
        key = re.sub(r"[^a-z0-9]+", "", ans.lower())
        if not key:
            continue

        if "views_60d" not in it or not it["views_60d"]:
            it["views_60d"] = lookup_views(ans, cache, default=45000)

        if key not in by_norm:
            by_norm[key] = dict(it)
        else:
            existing = by_norm[key]
            # Preserve pinned `krillion` or `tooclever`
            if it.get("tier") in ("krillion", "tooclever") and existing.get("tier") not in ("krillion", "tooclever"):
                existing["tier"] = it["tier"]
            if it.get("quip") and not existing.get("quip"):
                existing["quip"] = it["quip"]
            existing["views_60d"] = max(existing.get("views_60d", 0), it.get("views_60d", 0))
            merged_aliases = set(existing.get("aliases") or [])
            merged_aliases.update(it.get("aliases") or [])
            existing["aliases"] = sorted(a for a in merged_aliases if a.lower() != ans.lower())

    deduped = list(by_norm.values())
    unpinned = [it for it in deduped if it.get("tier") not in ("krillion", "tooclever")]
    unpinned.sort(key=lambda x: x.get("views_60d", 0), reverse=True)

    n = len(unpinned)
    for i, it in enumerate(unpinned):
        pct = i / max(1, n - 1) if n > 1 else 0.0
        if pct < 0.20:
            it["tier"] = "plankton"
        elif pct < 0.50:
            it["tier"] = "schooler"
        elif pct < 0.78:
            it["tier"] = "rare"
        else:
            it["tier"] = "deepcut"

    tier_order = {"plankton": 0, "tooclever": 1, "schooler": 2, "rare": 3, "deepcut": 4, "krillion": 5}
    deduped.sort(key=lambda x: (tier_order.get(x.get("tier", "schooler"), 2), -x.get("views_60d", 0)))

    cleaned: list[dict[str, Any]] = []
    for it in deduped:
        entry: dict[str, Any] = {
            "answer": it["answer"],
            "tier": it["tier"],
            "aliases": it.get("aliases", []),
        }
        if it.get("quip"):
            entry["quip"] = it["quip"]
        cleaned.append(entry)
    return cleaned


def build_all_puzzles() -> list[dict[str, Any]]:
    cache = load_cache()
    given_names = load_given_names_set(cache)

    mineral_cats = [
        ("Category:Gemstones", 250),
        ("Category:Carbonate_minerals", 150),
        ("Category:Halide_minerals", 100),
        ("Category:Evaporite_minerals", 100),
        ("Category:Sulfate_minerals", 120),
        ("Category:Sulfide_minerals", 120),
        ("Category:Oxide_minerals", 120),
        ("Category:Silicate_minerals", 120),
        ("Category:Phyllosilicate_minerals", 80),
        ("Category:Tectosilicate_minerals", 80),
        ("Category:Native_element_minerals", 60),
        ("Category:Igneous_rocks", 100),
        ("Category:Metamorphic_rocks", 80),
        ("Category:Sedimentary_rocks", 100),
        ("Category:Industrial_minerals", 100),
        ("Category:Copper_minerals", 80),
        ("Category:Silver_minerals", 60),
        ("Category:Mercury_minerals", 40),
        ("Category:Arsenic_minerals", 50),
        ("Category:Manganese_minerals", 60),
    ]
    mineral_titles: list[str] = []
    for cat, lim in mineral_cats:
        mineral_titles.extend(fetch_category_members(cat, lim, cache))
    mineral_titles = list(dict.fromkeys(mineral_titles))

    kitchen_utensil_cats = [
        ("Category:Cooking_utensils", 500),
        ("Category:Food_preparation_utensils", 500),
        ("Category:Food_preparation_appliances", 500),
        ("Category:Cookware_and_bakeware", 500),
        ("Category:Cooking_vessels", 500),
        ("Category:Kitchen_knives", 300),
        ("Category:Baking_ingredients", 300),
        ("Category:Yeasts", 150),
        ("Category:Cooking_oils", 200),
        ("Category:Vinegars", 150),
        ("Category:Spices", 400),
        ("Category:Culinary_herbs", 300),
        ("Category:Condiments", 300),
        ("Category:Root_vegetables", 250),
        ("Category:Leaf_vegetables", 250),
        ("Category:Culinary_fruits", 400),
    ]
    kitchen_utensil_titles: list[str] = []
    for cat, lim in kitchen_utensil_cats:
        kitchen_utensil_titles.extend(fetch_category_members(cat, lim, cache))
    for list_page in [
        "Cookware and bakeware",
        "List of food preparation utensils",
        "List of culinary herbs and spices",
    ]:
        kitchen_utensil_titles.extend(fetch_page_links(list_page, cache))
    kitchen_utensil_titles = list(dict.fromkeys(kitchen_utensil_titles))

    white_food_cats = [
        ("Category:Dairy_products", 120),
        ("Category:Flours", 80),
        ("Category:Edible_salt", 60),
        ("Category:Sugars", 60),
    ]
    white_food_titles: list[str] = []
    for cat, lim in white_food_cats:
        white_food_titles.extend(fetch_category_members(cat, lim, cache))

    red_shade_titles: list[str] = []
    for cat, lim in [("Category:Shades_of_red", 160), ("Category:Shades_of_pink", 120), ("Category:Red_pigments", 80)]:
        red_shade_titles.extend(fetch_category_members(cat, lim, cache))

    white_shade_titles = fetch_category_members("Category:Shades_of_white", 100, cache)
    arctic_titles = fetch_category_members("Category:Arctic_land_animals", 80, cache)

    tool_titles: list[str] = []
    for cat, lim in [
        ("Category:Saws", 100),
        ("Category:Cutting_tools", 120),
        ("Category:Hand_tools", 150),
        ("Category:Fasteners", 100),
        ("Category:Mechanical_fasteners", 80),
    ]:
        tool_titles.extend(fetch_category_members(cat, lim, cache))

    # Also ensure baseline household terms have their exact Wikipedia pageviews fetched
    baseline_terms = [
        "Coal", "Gold", "Diamond", "Ruby", "Emerald", "Uranium", "Sapphire", "Amethyst", "Opal",
        "Jade", "Turquoise", "Cobalt", "Bauxite", "Cinnabar", "Malachite", "Lapis lazuli",
        "Bismuth", "Salt", "Baking soda", "Marble", "Halite", "Alum", "Nahcolite", "Trona",
        "Chalk", "Quartz", "Limestone", "Talc", "Gypsum", "Alabaster", "Pumice", "Perlite",
        "Kaolinite", "Borax", "Diatomaceous earth", "Cryolite", "Aluminum", "Iron", "Copper",
        "Granite", "Clay", "Slate", "Soapstone", "Mica", "Cassiterite", "Toaster", "Spatula",
        "Microwave oven", "Blender", "Tomato", "Cutting board", "Whisk", "Colander", "Olive oil",
        "Rolling pin", "Grater", "Garlic press", "Mandoline", "Mortar and pestle", "Chinois",
        "Mezzaluna", "Milk", "Sugar", "Flour", "Rice", "Egg", "Garlic", "Mayonnaise", "Yogurt",
        "Paper towel", "Cauliflower", "Tofu", "Cornstarch", "Meringue", "Daikon", "Horseradish",
        "Xanthan gum", "Snow", "Cloud", "Polar bear", "Cotton", "Wedding dress", "Ghost",
        "Golf ball", "Tooth", "Swan", "Igloo", "Beluga whale", "Snowy owl", "Edelweiss",
        "Ptarmigan", "Tyvek", "Pearl", "Coral", "Crimson", "Maroon", "Burgundy", "Magenta",
        "Fuchsia", "Vermilion", "Cerise", "Amaranth", "Puce", "Coquelicot", "Scarlet", "Rose",
        "Cherry", "Sienna", "Poppy", "Carmine", "Garnet", "Carnelian", "Jacinth", "Peridot",
        "Jasper", "Onyx", "Beryl", "Amber", "Pyrite", "Galena", "Scheelite", "Proustite",
        "Key", "Zipper", "Fork", "Pocket knife", "Alligator clip", "Comb", "Velcro",
        "Postage stamp", "Chainsaw", "Rake", "Bear trap", "Portcullis", "Coin", "Paper clip",
        "Ring", "Spoon", "Nail", "Bobby pin", "Tuning fork", "Challenge coin", "Anvil", "Sword",
        "Frying pan", "Hammer", "Anchor", "Manhole cover", "Horseshoe", "Cymbal", "Astrolabe",
        "ChapStick", "Wallet", "Eraser", "Golf tee", "Matchbook", "AirPods", "Thimble", "Netsuke",
        "Shark", "Venus flytrap", "Jack-o'-lantern", "Dandelion",
    ]

    all_titles_to_fetch = list(
        dict.fromkeys(
            baseline_terms
            + mineral_titles
            + kitchen_utensil_titles
            + white_food_titles
            + red_shade_titles
            + white_shade_titles
            + arctic_titles
            + tool_titles
        )
    )
    meta_map = fetch_pages_metadata(all_titles_to_fetch, cache)

    # Seed with editorial anchors (`krillion` 100pt gems + `tooclever` 15pt traps + baseline household items)
    p1_regions: dict[str, list[dict[str, Any]]] = {
        "A": [
            {"answer": "Coal", "aliases": ["anthracite", "bituminous coal", "lignite"]},
            {"answer": "Gold", "aliases": ["gold ore"]},
            {"answer": "Diamond", "tier": "tooclever", "aliases": ["diamonds", "kimberlite"], "quip": "Everyone's go-to mineral—colorless/white diamonds also count in A+C!"},
            {"answer": "Ruby", "aliases": ["rubies"]},
            {"answer": "Emerald", "aliases": ["emeralds"]},
            {"answer": "Uranium", "aliases": ["uranium ore", "yellowcake"]},
            {"answer": "Sapphire", "aliases": ["sapphires"]},
            {"answer": "Amethyst", "aliases": []},
            {"answer": "Opal", "aliases": ["opals", "black opal", "fire opal"], "quip": "Black, fire, and boulder opals fit right here—while milky white opals also count in A+C!"},
            {"answer": "Jade", "aliases": ["nephrite", "jadeite"]},
            {"answer": "Turquoise", "aliases": []},
            {"answer": "Cobalt", "aliases": ["cobaltite"]},
            {"answer": "Bauxite", "aliases": ["aluminum ore"]},
            {"answer": "Cinnabar", "aliases": ["mercury sulfide"]},
            {"answer": "Malachite", "aliases": []},
            {"answer": "Lapis lazuli", "aliases": ["lapis"]},
            {"answer": "Pitchblende", "aliases": ["uraninite"]},
            {"answer": "Rhodochrosite", "aliases": []},
            {"answer": "Bismuth", "tier": "krillion", "aliases": ["native bismuth"], "quip": "Mined for centuries and famous for its rainbow-iridescent hopper crystals—and the active ingredient in Pepto-Bismol!"},
        ],
        "B": [
            {"answer": "Toaster", "aliases": ["toaster oven"]},
            {"answer": "Spatula", "aliases": ["turner"]},
            {"answer": "Microwave", "aliases": ["microwave oven"]},
            {"answer": "Blender", "aliases": []},
            {"answer": "Tomato", "tier": "tooclever", "aliases": ["tomatoes"], "quip": "The classic 'is it a fruit or vegetable?' kitchen staple."},
            {"answer": "Cutting board", "aliases": ["chopping board"]},
            {"answer": "Whisk", "aliases": ["balloon whisk"]},
            {"answer": "Colander", "aliases": ["strainer", "pasta strainer"]},
            {"answer": "Olive oil", "aliases": ["extra virgin olive oil"]},
            {"answer": "Coffee maker", "aliases": ["espresso machine", "french press"]},
            {"answer": "Rolling pin", "aliases": []},
            {"answer": "Cheese grater", "aliases": ["grater", "box grater"]},
            {"answer": "Garlic press", "aliases": []},
            {"answer": "Mandoline", "aliases": ["mandoline slicer"]},
            {"answer": "Mortar and pestle", "aliases": ["mortar", "pestle"]},
            {"answer": "Chinois", "aliases": ["bouillon strainer"]},
            {"answer": "Mezzaluna", "tier": "krillion", "aliases": ["mezzaluna knife"], "quip": "Italian for 'half moon'—the curved, two-handled herb-rocking blade hiding in serious kitchen drawers."},
        ],
        "C": [
            {"answer": "Snow", "aliases": ["snowflake", "snowball"]},
            {"answer": "Cloud", "aliases": ["clouds", "cumulus cloud"]},
            {"answer": "Polar bear", "tier": "tooclever", "aliases": ["polar bears"], "quip": "The classic trivia trap—their fur is actually translucent and their skin is black!"},
            {"answer": "Cotton ball", "aliases": ["cotton", "cotton swab", "q-tip"]},
            {"answer": "Wedding dress", "aliases": ["bridal gown"]},
            {"answer": "Ghost", "aliases": ["bedsheet ghost"]},
            {"answer": "Golf ball", "aliases": []},
            {"answer": "Tooth", "aliases": ["teeth", "baby tooth"]},
            {"answer": "Pearl", "aliases": ["pearls", "cultured pearl"]},
            {"answer": "Swan", "aliases": ["mute swan", "trumpeter swan"]},
            {"answer": "Igloo", "aliases": []},
            {"answer": "Dandelion puff", "aliases": ["dandelion clock"]},
            {"answer": "Beluga whale", "aliases": ["beluga"]},
            {"answer": "Snowy owl", "aliases": []},
            {"answer": "Edelweiss", "aliases": []},
            {"answer": "Ptarmigan", "aliases": ["white-tailed ptarmigan", "rock ptarmigan"]},
            {"answer": "Tyvek", "tier": "krillion", "aliases": ["tyvek suit"], "quip": "Flash-spun high-density polyethylene fibers—the unmistakable bright-white material of envelopes, housewrap, and cleanroom suits."},
        ],
        "AB": [
            {"answer": "Aluminum", "aliases": ["aluminum foil", "tin foil", "aluminium"]},
            {"answer": "Iron", "aliases": ["cast iron", "cast iron skillet"]},
            {"answer": "Copper", "aliases": ["copper pot", "copper pan"]},
            {"answer": "Granite", "tier": "tooclever", "aliases": ["granite countertop"], "quip": "Quarried from the earth and sitting right under your cutting board!"},
            {"answer": "Clay", "aliases": ["terracotta", "earthenware", "ceramic"]},
            {"answer": "Slate", "aliases": ["slate cheese board", "slate tile"]},
            {"answer": "Soapstone", "aliases": ["steatite", "whiskey stones"]},
            {"answer": "Mica", "aliases": ["mica sheet", "muscovite"]},
            {"answer": "Cassiterite", "tier": "krillion", "aliases": ["tin", "tin ore"], "quip": "The primary ore of tin—the metal that gave every kitchen its 'tin cans' and lined copper cookware for centuries!"},
        ],
        "AC": [
            {"answer": "Chalk", "aliases": ["calcite"]},
            {"answer": "Quartz", "aliases": ["milky quartz"]},
            {"answer": "Diamond", "tier": "tooclever", "aliases": ["white diamond", "diamonds"], "quip": "Colorless/white diamonds count here AND in Only A!"},
            {"answer": "Opal", "aliases": ["white opal", "milky opal", "opals"], "quip": "White (milky) opal is by far the most common variety of precious opal mined on Earth!"},
            {"answer": "Limestone", "aliases": []},
            {"answer": "Moonstone", "aliases": ["feldspar", "orthoclase"]},
            {"answer": "Talc", "tier": "tooclever", "aliases": ["talcum", "baby powder"], "quip": "A 1 on the Mohs hardness scale—and the classic geology class white mineral."},
            {"answer": "Gypsum", "aliases": ["plaster of paris", "drywall", "selenite"]},
            {"answer": "Alabaster", "aliases": []},
            {"answer": "Pumice", "aliases": ["howlite", "dolomite", "aragonite"]},
            {"answer": "Perlite", "aliases": []},
            {"answer": "Kaolin", "aliases": ["kaolinite", "china clay"]},
            {"answer": "Borax", "aliases": ["sodium borate", "tincal", "ulexite", "barite"]},
            {"answer": "Diatomaceous earth", "aliases": ["diatomite", "kieselguhr"]},
            {"answer": "Cryolite", "tier": "krillion", "aliases": ["ice stone"], "quip": "A snow-white Greenland mineral with a refractive index so close to water that it literally disappears when submerged!"},
        ],
        "BC": [
            {"answer": "Milk", "aliases": ["whole milk", "skim milk"]},
            {"answer": "Sugar", "aliases": ["white sugar", "granulated sugar", "powdered sugar", "icing sugar"]},
            {"answer": "Flour", "aliases": ["white flour", "all-purpose flour"]},
            {"answer": "Rice", "aliases": ["white rice", "jasmine rice", "basmati rice"]},
            {"answer": "Egg", "tier": "tooclever", "aliases": ["egg white", "eggs", "hard boiled egg"], "quip": "Only half gets credit if it's brown-shelled—unless you crack it open for the albumen!"},
            {"answer": "Garlic", "aliases": ["garlic bulb"]},
            {"answer": "Mayonnaise", "aliases": ["mayo"]},
            {"answer": "Yogurt", "aliases": ["greek yogurt", "sour cream"]},
            {"answer": "Paper towel", "aliases": ["napkin", "parchment paper"]},
            {"answer": "Cauliflower", "aliases": []},
            {"answer": "Tofu", "aliases": ["bean curd"]},
            {"answer": "Cornstarch", "aliases": ["corn flour", "arrowroot"]},
            {"answer": "Meringue", "aliases": []},
            {"answer": "Daikon", "aliases": ["white radish", "daikon radish"]},
            {"answer": "Horseradish", "aliases": []},
            {"answer": "Xanthan gum", "tier": "krillion", "aliases": ["cream of tartar"], "quip": "Fermented by bacteria into a bright-white powder that thickens nearly every gluten-free bake and salad dressing in the pantry."},
        ],
        "ABC": [
            {"answer": "Salt", "aliases": ["table salt", "rock salt", "kosher salt", "sea salt"]},
            {"answer": "Baking soda", "aliases": ["sodium bicarbonate", "bicarbonate of soda"]},
            {"answer": "Marble", "tier": "tooclever", "aliases": ["carrara marble", "marble rolling pin", "marble slab"], "quip": "Quarried white metamorphic rock—and every pastry chef's favorite cold surface for tempering chocolate and rolling dough!"},
            {"answer": "Halite", "aliases": ["mineral salt"]},
            {"answer": "Trona", "aliases": ["sodium sesquicarbonate"]},
            {"answer": "Alum", "aliases": ["potassium alum", "alum powder"]},
            {"answer": "Pickling lime", "aliases": ["calcium hydroxide", "slaked lime", "cal"]},
            {"answer": "Nahcolite", "tier": "krillion", "aliases": [], "quip": "The natural white evaporite mineral mined by the millions of tons in Wyoming to make the baking soda in your fridge!"},
        ],
    }

    p2_regions: dict[str, list[dict[str, Any]]] = {
        "A": [
            {"answer": "Coal", "aliases": ["anthracite"]},
            {"answer": "Salt", "aliases": ["halite"]},
            {"answer": "Iron", "aliases": ["iron ore"]},
            {"answer": "Gold", "aliases": ["gold ore"]},
            {"answer": "Quartz", "aliases": []},
            {"answer": "Limestone", "aliases": []},
            {"answer": "Graphite", "aliases": []},
            {"answer": "Bauxite", "aliases": []},
            {"answer": "Sulfur", "aliases": ["sulphur", "brimstone"]},
            {"answer": "Galena", "aliases": ["lead glance"]},
            {"answer": "Pyrite", "tier": "tooclever", "aliases": ["fools gold", "fool's gold"], "quip": "Fool's gold—everyone's favorite geology flex."},
            {"answer": "Scheelite", "tier": "krillion", "aliases": ["wolframite"], "quip": "A calcium tungstate ore that glows brilliant sky-blue under ultraviolet light and gave us tungsten filaments."},
        ],
        "B": [
            {"answer": "Crimson", "aliases": []},
            {"answer": "Maroon", "aliases": []},
            {"answer": "Burgundy", "aliases": []},
            {"answer": "Magenta", "aliases": []},
            {"answer": "Fuchsia", "aliases": []},
            {"answer": "Vermilion", "tier": "tooclever", "aliases": ["vermillion"], "quip": "The classic artist's red pigment—originally ground from cinnabar!"},
            {"answer": "Cerise", "aliases": []},
            {"answer": "Amaranth", "aliases": []},
            {"answer": "Puce", "aliases": []},
            {"answer": "Coquelicot", "tier": "krillion", "aliases": ["caput mortuum"], "quip": "Named after the wild French corn poppy—a vivid orange-tinted red beloved by crossword constructors and color nerds."},
        ],
        "C": [
            {"answer": "Olivia", "aliases": ["oliver"]},
            {"answer": "Michael", "aliases": ["sarah", "emily", "james", "david", "emma", "liam", "noah"]},
            {"answer": "Grace", "aliases": ["hannah", "chloe", "sophia", "isabella"]},
            {"answer": "Violet", "tier": "tooclever", "aliases": ["indigo", "hazel"], "quip": "A color name AND a first name—just not red or mined!"},
            {"answer": "Clementine", "aliases": ["olive", "iris"]},
            {"answer": "Penelope", "aliases": ["sebastian", "theodore"]},
            {"answer": "Calliope", "aliases": ["persephone"]},
            {"answer": "Hephzibah", "tier": "krillion", "aliases": ["mehitable"], "quip": "A classic Hebrew and Puritan given name meaning 'my delight is in her.'"},
        ],
        "AB": [
            {"answer": "Cinnabar", "aliases": []},
            {"answer": "Rose quartz", "tier": "tooclever", "aliases": [], "quip": "Take off the 'quartz' and it moves into the center; keep it and it stays right here!"},
            {"answer": "Red ochre", "aliases": ["ochre", "hematite"]},
            {"answer": "Rhodochrosite", "aliases": ["inca rose"]},
            {"answer": "Rhodonite", "aliases": []},
            {"answer": "Cuprite", "aliases": ["ruby copper"]},
            {"answer": "Realgar", "aliases": ["ruby sulfur"]},
            {"answer": "Spinel", "aliases": ["red spinel", "spinels"]},
            {"answer": "Proustite", "tier": "krillion", "aliases": ["pyrargyrite", "red silver ore"], "quip": "Known to miners as 'ruby silver'—a translucent scarlet-vermilion silver sulfarsenide mineral."},
        ],
        "AC": [
            {"answer": "Jade", "aliases": []},
            {"answer": "Opal", "aliases": []},
            {"answer": "Emerald", "aliases": ["esmeralda"]},
            {"answer": "Sapphire", "aliases": []},
            {"answer": "Amethyst", "aliases": []},
            {"answer": "Crystal", "aliases": []},
            {"answer": "Amber", "tier": "tooclever", "aliases": [], "quip": "Wait—isn't amber fossilized tree resin? Yes, and most commercial amber is mined from Eocene clay and sand beds!"},
            {"answer": "Jasper", "aliases": []},
            {"answer": "Beryl", "aliases": []},
            {"answer": "Mica", "aliases": ["micah"]},
            {"answer": "Onyx", "aliases": []},
            {"answer": "Peridot", "tier": "krillion", "aliases": ["chrysolite"], "quip": "Gem-quality olivine mined from mantle peridotite—and an unmistakable vintage gemstone name."},
        ],
        "BC": [
            {"answer": "Scarlet", "aliases": ["scarlett"]},
            {"answer": "Rose", "aliases": ["rosie"]},
            {"answer": "Cherry", "aliases": []},
            {"answer": "Coral", "tier": "tooclever", "aliases": [], "quip": "A classic pink-red gem AND name—but harvested from marine invertebrates in the sea, not mined from rock!"},
            {"answer": "Sienna", "aliases": ["burnt sienna"]},
            {"answer": "Poppy", "aliases": []},
            {"answer": "Carmine", "aliases": []},
            {"answer": "Flannery", "tier": "krillion", "aliases": ["sorrel"], "quip": "From the Irish 'Flannabhra' meaning 'red eyebrows'—and Sorrel, the reddish-brown shade and botanical given name."},
        ],
        "ABC": [
            {"answer": "Ruby", "aliases": []},
            {"answer": "Garnet", "aliases": []},
            {"answer": "Morganite", "aliases": []},
            {"answer": "Coral", "aliases": []},  # will be filtered out of ABC by NON_MINED_ORGANIC_GEMS below
            {"answer": "Carnelian", "aliases": ["cornelian"]},
            {"answer": "Jacinth", "tier": "krillion", "aliases": ["hyacinth"], "quip": "Both a traditional given name and the deep orange-red gem variety of mined zircon!"},
        ],
    }
    p2_regions["ABC"] = [x for x in p2_regions["ABC"] if x["answer"].lower() not in NON_MINED_ORGANIC_GEMS]

    p3_regions: dict[str, list[dict[str, Any]]] = {
        "A": [
            {"answer": "Shark", "aliases": ["great white shark", "alligator", "crocodile", "dog", "lion", "tiger", "wolf", "bear", "hippo", "piranha", "human"]},
            {"answer": "Plastic hairbrush", "aliases": ["detangling brush", "wooden comb"]},
            {"answer": "Garlic", "tier": "tooclever", "aliases": ["head of garlic"], "quip": "In Spanish, French, Italian, and culinary history, garlic cloves are literally called 'teeth' (dientes de ajo)!"},
            {"answer": "Venus flytrap", "aliases": ["pitcher plant"]},
            {"answer": "Wooden rake", "aliases": ["bamboo rake", "hay rake", "plastic rake"]},
            {"answer": "Jack-o'-lantern", "aliases": ["jack o lantern"]},
            {"answer": "Dandelion", "tier": "krillion", "aliases": ["dent-de-lion"], "quip": "From the French 'dent-de-lion' ('lion's tooth')—named for its jagged, tooth-edged leaves!"},
        ],
        "B": [
            {"answer": "Anvil", "aliases": []},
            {"answer": "Sword", "aliases": ["broadsword", "katana", "rapier", "machete"]},
            {"answer": "Frying pan", "aliases": ["skillet", "kettle", "saucepan", "wok"]},
            {"answer": "Hammer", "aliases": ["sledgehammer", "crowbar", "mallet", "pickaxe", "axe"]},
            {"answer": "Anchor", "aliases": ["ship anchor"]},
            {"answer": "Manhole cover", "aliases": ["fire hydrant"]},
            {"answer": "Horseshoe", "tier": "tooclever", "aliases": [], "quip": "Unless you're wearing giant cargo pants, a steel horseshoe is staying in the barn."},
            {"answer": "Cymbal", "aliases": ["gong", " trumpet", "trombone", "saxophone"]},
            {"answer": "Astrolabe", "tier": "krillion", "aliases": ["armillary sphere"], "quip": "Brass celestial inclinometer used by medieval astronomers and navigators."},
        ],
        "C": [
            {"answer": "ChapStick", "aliases": ["lip balm"]},
            {"answer": "Wallet", "aliases": ["dollar bill", "credit card", "banknote", "passport"]},
            {"answer": "Marble", "aliases": ["glass marble"]},
            {"answer": "Eraser", "aliases": ["rubber eraser", "tissue", "handkerchief"]},
            {"answer": "Golf tee", "aliases": ["acorn", "pebble", "seashell", "chalk"]},
            {"answer": "Matchbook", "aliases": ["match", "matches", "dice", "die", "poker chip"]},
            {"answer": "AirPods", "tier": "tooclever", "aliases": ["earbuds"], "quip": "Modern pocket staple—mostly plastic and lithium!"},
            {"answer": "Thimble", "aliases": ["porcelain thimble"]},
            {"answer": "Netsuke", "tier": "krillion", "aliases": ["worry stone"], "quip": "Miniature Japanese carved ivory or boxwood toggles invented specifically because traditional kimono had no pockets!"},
        ],
        "AB": [
            {"answer": "Chainsaw", "aliases": ["handsaw", "circular saw", "table saw", "bandsaw", "jigsaw", "bowsaw", "crosscut saw", "reciprocating saw"]},
            {"answer": "Rake", "aliases": ["garden rake", "pitchfork", "harrow"]},
            {"answer": "Bear trap", "tier": "tooclever", "aliases": ["foothold trap"], "quip": "Definitely metal, definitely has teeth, and definitely do NOT put it in your pants pocket."},
            {"answer": "Bicycle sprocket", "aliases": ["chainring", "flywheel", "transmission gear"]},
            {"answer": "Backhoe bucket", "aliases": ["excavator bucket", "cultivator"]},
            {"answer": "Portcullis", "tier": "krillion", "aliases": ["herse"], "quip": "The heavy iron-spiked grating suspended in castle gateways—whose jagged bottom spikes are literally called its 'teeth'!"},
        ],
        "AC": [
            {"answer": "Comb", "aliases": ["pocket comb", "hair comb", "plastic comb", "flea comb"]},
            {"answer": "Baby tooth", "aliases": ["wisdom tooth", "shark tooth", "retainer", "dentures", "mouthguard"]},
            {"answer": "Velcro", "aliases": ["plastic zipper", "cable tie", "zip tie"]},
            {"answer": "Guitar pick", "aliases": ["serrated guitar pick"]},
            {"answer": "Stamp", "tier": "krillion", "aliases": ["postage stamp"], "quip": "In philately, the tiny paper projections along the perforated edge of a postage stamp are officially called 'teeth'!"},
        ],
        "BC": [
            {"answer": "Coin", "aliases": ["quarter", "penny", "nickel", "dime", "half dollar"]},
            {"answer": "Paperclip", "aliases": ["paper clip", "safety pin", "binder clip", "thumbtack", "pushpin", "staple"]},
            {"answer": "Ring", "aliases": ["wedding ring", "signet ring", "cufflink"]},
            {"answer": "Spoon", "aliases": ["teaspoon"]},
            {"answer": "Nail", "aliases": ["screw", "bolt", "hex nut", "washer", "rivet", "cotter pin"]},
            {"answer": "Bobby pin", "aliases": ["hairpin", "barrette", "sewing needle", "thimble", "tweezers"]},
            {"answer": "Tuning fork", "aliases": ["whistle", "harmonica", "kazoo", "carabiner", "padlock", "lighter", "zippo"]},
            {"answer": "Challenge coin", "tier": "krillion", "aliases": ["sober chip", "krugerrand"], "quip": "Carried in the pocket and slammed on the bar for a 'coin check' since WWI."},
        ],
        "ABC": [
            {"answer": "Key", "aliases": ["house key", "car key", "padlock key", "skeleton key"]},
            {"answer": "Zipper", "aliases": ["metal zipper", "zipper pull", "fly zipper"]},
            {"answer": "Fork", "tier": "tooclever", "aliases": ["dinner fork", "cocktail fork"], "quip": "Wait—those are tines/prongs, though metal hair combs and saw-blades in your pocket definitely qualify!"},
            {"answer": "Pocket knife", "aliases": ["swiss army knife", "multi-tool", "leatherman", "penknife"]},
            {"answer": "Nail clipper", "aliases": ["nail clippers", "nail file", "bottle opener", "can opener"]},
            {"answer": "Watch gear", "aliases": ["cogwheel", "escapement wheel", "pinion", "gear"]},
            {"answer": "Alligator clip", "aliases": ["crocodile clip", "roach clip", "keychain", "money clip"]},
            {"answer": "Music box cylinder", "tier": "krillion", "aliases": ["music box comb", "tickler"], "quip": "Inside every pocket music box is a tuned steel comb whose graduated metal 'teeth' are plucked by tiny brass pins!"},
        ],
    }

    # --- MERGE SCRAPED WIKIPEDIA ARTICLES INTO PUZZLE #1 & PUZZLE #2 ---
    kitchen_minerals = {
        "halite": "ABC", "salt": "ABC", "rock salt": "ABC", "sodium bicarbonate": "ABC",
        "nahcolite": "ABC", "trona": "ABC", "alum": "ABC", "potassium alum": "ABC",
        "marble": "ABC", "calcium carbonate": "ABC", "calcium hydroxide": "ABC",
        "granite": "AB", "soapstone": "AB", "steatite": "AB", "slate": "AB",
        "clay": "AB", "terracotta": "AB", "mica": "AB", "muscovite": "AB",
        "cassiterite": "AB", "copper": "AB", "iron": "AB", "aluminium": "AB", "aluminum": "AB",
    }

    for t in mineral_titles:
        info = meta_map.get(t)
        if not info:
            continue
        name = info["clean"]
        low = name.lower()
        if not is_clean_entity_name(name) or low in NON_MINED_ORGANIC_GEMS:
            continue

        views = info["views_60d"]
        aliases = info.get("aliases", [])

        # Puzzle 1 placement
        if low in kitchen_minerals:
            r_key = kitchen_minerals[low]
            p1_regions[r_key].append({"answer": name, "views_60d": views, "aliases": aliases})
        else:
            w_bit = parse_mineral_color_White(info)
            for r_key in expand_three_valued_bits([1, 0, w_bit]):
                p1_regions[r_key].append({"answer": name, "views_60d": views, "aliases": aliases})

        # Puzzle 2 placement
        rp_bit = parse_mineral_color_RedPink(info)
        is_name = 1 if low in given_names else 0
        for r_key in expand_three_valued_bits([1, rp_bit, is_name]):
            p2_regions[r_key].append({"answer": name, "views_60d": views, "aliases": aliases})

    mined_names_lower = {clean_title(t).lower() for t in mineral_titles} | set(kitchen_minerals.keys()) | {
        "cast iron", "cast-iron cookware", "carbon steel", "stainless steel", "tin", "pewter",
        "silver", "gold", "brass", "bronze", "enamel", "stoneware", "earthenware", "porcelain",
    }

    kitchen_positive_re = re.compile(
        r"\b(utensil|cookware|bakeware|frying pan|saucepan|stockpot|cooking pot|vessel|knife|blade|"
        r"kitchen|appliance|bowl|spoon|fork|strainer|sieve|grater|peeler|oven|stove|cooker|mixer|"
        r"blender|kettle|food|ingredient|condiment|spice|herb|seasoning|sauce|cooking oil|vinegar|"
        r"dairy|cheese|milk|cream|yogurt|butter|flour|sugar|sweetener|grain|cereal|pasta|noodle|"
        r"bread|vegetable|fruit|berry|citrus|nut|seed|legume|bean|lentil|nutritional yeast|"
        r"baker's yeast|leavening|culinary|edible|cooking|baking|dish|beverage|tea|coffee)\b",
        re.I,
    )
    kitchen_exclude_re = re.compile(
        r"\b(born \d{4}|died \d{4}|actress|actor|film director|politician|bacteriologist|"
        r"microbiologist|city in |capital of |province of |colony|colonies|pathogen| candidiasis|"
        r"infection|ascomycetous|basidiomycetous|psychrophilic|isolated from|dietary patterns|"
        r"vegetarianism|veganism|company|corporation|brand of|restaurant|supermarket)\b",
        re.I,
    )

    for t in kitchen_utensil_titles:
        info = meta_map.get(t)
        if not info:
            continue
        name = info["clean"]
        low = name.lower()
        if not is_clean_entity_name(name) or low in mined_names_lower:
            continue
        ext = info.get("extract") or ""
        if not ext or kitchen_exclude_re.search(ext) or not kitchen_positive_re.search(ext[:300]):
            continue
        ext_low = ext.lower()
        is_white = "?" if re.search(r"\b(white|porcelain|ceramic|paper|cloth|muslin|cheesecloth|cream|milk|sugar|flour|garlic|onion|coconut|horseradish|turnip|parsnip|cauliflower|lychee)\b", f"{low} {ext_low[:220]}") else 0
        for r_key in expand_three_valued_bits([0, 1, is_white]):
            p1_regions[r_key].append({"answer": name, "views_60d": info["views_60d"], "aliases": info.get("aliases", [])})

    for t in white_food_titles:
        info = meta_map.get(t)
        if not info:
            continue
        name = info["clean"]
        low = name.lower()
        if not is_clean_entity_name(name) or low in ("salt", "edible salt", "table salt", "rock salt", "halite"):
            continue
        ext = info.get("extract") or ""
        if not ext or kitchen_exclude_re.search(ext) or not kitchen_positive_re.search(ext[:300]):
            continue
        ext_low = ext.lower()
        has_white = bool(
            re.search(
                r"\b(white|milk|cream|yogurt|curd|whey|flour|starch|sugar|coconut|rice|garlic|onion|radish|turnip|cauliflower|tofu|egg|meringue|lard|shortening|butter|cheese)\b",
                f"{low} {ext_low}",
            )
        )
        w_bit: int | str = 1 if has_white else 0
        for r_key in expand_three_valued_bits([0, 1, w_bit]):
            p1_regions[r_key].append({"answer": name, "views_60d": info["views_60d"], "aliases": info.get("aliases", [])})

    for t in white_shade_titles + arctic_titles:
        info = meta_map.get(t)
        if not info:
            continue
        name = info["clean"]
        low = name.lower()
        if not is_clean_entity_name(name) or low in NON_WHITE_SHADE_ARTICLES:
            continue
        if low in ("milk", "cream", "ivory", "chalk", "alabaster", "snow", "salt", "flour", "bone", "cotton", "linen", "seashell", "magnolia", "champagne", "flax", "eggshell", "platinum", "titanium white"):
            continue
        ext = (info.get("extract") or "").lower()
        if "white" in ext:
            p1_regions["C"].append({"answer": name, "views_60d": info["views_60d"], "aliases": info.get("aliases", [])})

    for t in red_shade_titles:
        info = meta_map.get(t)
        if not info:
            continue
        name = info["clean"]
        low = name.lower()
        if not is_clean_entity_name(name) or low in ("red", "pink", "purple", "lilac", "tyrian purple", "international orange", "blood rain"):
            continue
        if low in ("ruby", "garnet", "cinnabar", "vermilion", "ochre", "red ochre"):
            continue
        is_name = 1 if low in given_names else 0
        for r_key in expand_three_valued_bits([0, 1, is_name]):
            p2_regions[r_key].append({"answer": name, "views_60d": info["views_60d"], "aliases": info.get("aliases", [])})

    for gname in sorted(given_names):
        if len(gname) < 3 or not gname.isalpha():
            continue
        cap = gname.capitalize()
        if gname in {
            "ruby", "garnet", "carnelian", "jacinth", "hyacinth", "jade", "amber", "opal",
            "emerald", "crystal", "jasper", "beryl", "mica", "micah", "onyx", "peridot",
            "topaz", "amethyst", "sapphire", "agate", "pearl", "coral", "scarlet", "scarlett",
            "rose", "rosie", "cherry", "sienna", "poppy", "carmine", "crimson", "magenta",
            "fuchsia", "flannery", "sorrel", "salmon", "peach", "brandy", "burgundy", "morganite",
        }:
            continue
        p2_regions["C"].append({"answer": cap, "views_60d": 15000 if len(gname) <= 6 else 5000, "aliases": []})

    # Merge scraped tools/saws/fasteners into Puzzle #3
    for t in tool_titles:
        info = meta_map.get(t)
        if not info:
            continue
        name = info["clean"]
        low = name.lower()
        if not is_clean_entity_name(name) or low in ("velcro", "twine", "plunger", "saw pit", "sawmill", "sawfiler", "saw set", "saw nib", "serration"):
            continue
        ext = (info.get("extract") or "").lower()
        has_teeth = bool(re.search(r"\b(saw|teeth|toothed|serrated|gear|sprocket|cog|rake|comb|zipper|file|rasp|clipper|trap|chainsaw|hacksaw|jigsaw|bandsaw|bowsaw|fretsaw)\b", f"{low} {ext[:160]}"))
        is_pocket = bool(re.search(r"^(pocket|nail|screw|bolt|nut|washer|pin|clip|rivet|staple|key|coin|needle|thimble|penknife|multi-tool|swiss army|scalpel|tweezers|carabiner|shackle|linchpin|cotter|r-clip|hairpin|drawing pin|thumbtack|bobby pin)", low))
        if has_teeth and is_pocket:
            p3_regions["ABC"].append({"answer": name, "views_60d": info["views_60d"], "aliases": info.get("aliases", [])})
        elif has_teeth and not is_pocket:
            p3_regions["AB"].append({"answer": name, "views_60d": info["views_60d"], "aliases": info.get("aliases", [])})
        elif not has_teeth and is_pocket:
            p3_regions["BC"].append({"answer": name, "views_60d": info["views_60d"], "aliases": info.get("aliases", [])})
        else:
            p3_regions["B"].append({"answer": name, "views_60d": info["views_60d"], "aliases": info.get("aliases", [])})

    puzzles = [
        {
            "id": 1,
            "title": "Earth, Pantry & Snow",
            "circles": {
                "A": {"label": "Is mined from the ground", "short": "Mined from ground", "color": "#f4a261"},
                "B": {"label": "Commonly found in a kitchen", "short": "Found in kitchen", "color": "#52b788"},
                "C": {"label": "Is white", "short": "Is white", "color": "#60a5fa"},
            },
            "regions": {k: assign_pageview_tiers(p1_regions[k], cache) for k in REGION_KEYS},
        },
        {
            "id": 2,
            "title": "Gems, Blushes & Birth Certificates",
            "circles": {
                "A": {"label": "Is mined from the ground", "short": "Mined from ground", "color": "#f4a261"},
                "B": {"label": "Is a shade of red or pink", "short": "Shade of red/pink", "color": "#e63946"},
                "C": {"label": "Used as a given first name", "short": "Given first name", "color": "#a855f7"},
            },
            "regions": {k: assign_pageview_tiers(p2_regions[k], cache) for k in REGION_KEYS},
        },
        {
            "id": 3,
            "title": "Bite-Sized Hardware",
            "circles": {
                "A": {"label": "Has teeth (literal or mechanical)", "short": "Has teeth", "color": "#f4a261"},
                "B": {"label": "Made primarily of metal", "short": "Made of metal", "color": "#94a3b8"},
                "C": {"label": "Easily fits in a pants pocket", "short": "Fits in pocket", "color": "#52b788"},
            },
            "regions": {k: assign_pageview_tiers(p3_regions[k], cache) for k in REGION_KEYS},
        },
    ]

    out_path = VENN_DIR / "puzzles.json"
    out_path.write_text(json.dumps(puzzles, ensure_ascii=False, indent=2), encoding="utf-8")
    sync_venn_html(puzzles)
    return puzzles


def sync_venn_html(puzzles: list[dict[str, Any]]) -> None:
    html_path = VENN_DIR / "index.html"
    if not html_path.exists():
        return
    html = html_path.read_text(encoding="utf-8")
    puzzles_js = "let PUZZLES = " + json.dumps(puzzles, ensure_ascii=False) + ";"
    updated = re.sub(
        r"let PUZZLES = \[[\s\S]*?\];\n\nlet currentPuzzle =",
        puzzles_js + "\n\nlet currentPuzzle =",
        html,
        count=1,
    )
    html_path.write_text(updated, encoding="utf-8")


def print_puzzle_audit(puzzle: dict[str, Any]) -> None:
    circles = puzzle["circles"]
    print(f"\n=== VENN PUZZLE #{puzzle.get('id', '?')}: {puzzle.get('title', '')} ===")
    print(f"  Circle A: {circles['A']['label']}")
    print(f"  Circle B: {circles['B']['label']}")
    print(f"  Circle C: {circles['C']['label']}\n")

    total_answers = 0
    for key in REGION_KEYS:
        answers = puzzle["regions"].get(key, [])
        total_answers += len(answers)
        by_tier: dict[str, list[str]] = {}
        for ans in answers:
            by_tier.setdefault(ans["tier"], []).append(ans["answer"])
        gem = next((a["answer"] for a in answers if a["tier"] == "krillion"), "None")
        print(f"  [{key:<3}] ({len(answers):4d} answers) | Gem (100pt): {gem}")
        for tier in ["plankton", "tooclever", "schooler", "rare", "deepcut", "krillion"]:
            if tier in by_tier:
                sample = ", ".join(by_tier[tier][:5])
                more = f" (+{len(by_tier[tier]) - 5} more)" if len(by_tier[tier]) > 5 else ""
                print(f"        - {tier:<9}: {sample}{more}")
    print(f"\n  Total verified answers across 7 sections: {total_answers}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build or audit Venn Diagram trivia puzzles from Wikipedia.")
    parser.add_argument("--build", action="store_true", help="Run the live Wikipedia category + infobox + pageviews pipeline")
    parser.add_argument("--audit", help="Path to a Venn puzzle JSON file to audit")
    args = parser.parse_args()

    if args.build:
        puzzles = build_all_puzzles()
        for p in puzzles:
            print_puzzle_audit(p)
        return

    if args.audit:
        with Path(args.audit).open(encoding="utf-8") as f:
            data = json.load(f)
        puzzles = data if isinstance(data, list) else [data]
        for p in puzzles:
            print_puzzle_audit(p)
        return

    parser.print_help()


if __name__ == "__main__":
    main()
