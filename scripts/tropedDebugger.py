import requests
import time

# --- CONFIG ---
API_KEY = "f5cc68dfbe5836293db6212bb383ffff"

# The 10 Test Candidates
SHOW_LIST = [
    "High Potential",
    "Paradise",
    "The I-Land",
    "Chambers",
    "Night Sky",
    "Wisdom of the Crowd",
    "Pure Genius",
    "The Enemy Within",
    "Rutherford Falls",
    "Turner & Hooch",
    "The Mighty Ducks: Game Changers",
    "Cowboy Bebop"
]

def check_show(show_name):
    # 1. Search for the show
    search_url = f"https://api.themoviedb.org/3/search/tv?api_key={API_KEY}&query={show_name}"
    res = requests.get(search_url).json()
    
    if not res['results']:
        return "❌ NOT FOUND", f"TMDB returned no results for '{show_name}'"

    # Grab the best match
    show = res['results'][0]
    
    # --- RUN THE LOGIC GAUNTLET ---
    
    # 1. SETUP VARIABLES
    overview = show.get('overview', '')
    overview_lower = overview.lower()
    title = show['name']
    original_lang = show.get('original_language', 'en')
    genre_ids = set(show.get('genre_ids', []))
    vote_count = show.get('vote_count', 0)
    first_air_date = show.get('first_air_date', '2025')[:4]
    
    # --- LOGIC GATE 1: ANIME (The "VIP Entrance") ---
    if original_lang == 'ja':
        # ANIME RULE: Must have 400+ votes
        if vote_count < 400:
            return "❌ REJECTED", f"Anime with low votes ({vote_count} < 400)"
        
        return "✅ ACCEPTED", f"Anime VIP Pass ({vote_count} votes)"

    # --- LOGIC GATE 2: WESTERN SHOWS ---
    else:
        # A. COMPETITION REALITY CHECK
        is_reality = 10764 in genre_ids
        competition_keywords = [
            "competition", "contestant", "game show", "challenge", "eliminated",
            "reality", "race", "cooking", "chef", "baking", "teams"
        ]
        is_competition = is_reality and any(k in overview_lower for k in competition_keywords)
        
        # B. STRICT BANS (Doc, News, Talk, Soap) - Note: Reality (10764) removed
        STRICT_BANS = {99, 10763, 10767, 10766}
        if not genre_ids.isdisjoint(STRICT_BANS):
             return "❌ REJECTED", f"Banned Genre found (IDs: {genre_ids & STRICT_BANS})"
            
        # Fail if Reality but NOT a competition
        if is_reality and not is_competition:
            return "❌ REJECTED", "Reality show but no 'Competition' keywords found"

        # C. THE COLON RULE (Animation Protection)
        if 16 in genre_ids and ':' in title:
            is_safe_franchise = "Star Wars" in title or "Star Trek" in title
            is_massive_hit = vote_count >= 2000
            
            if not is_safe_franchise and not is_massive_hit:
                return "❌ REJECTED", f"Animated Sequel/Spinoff ({vote_count} < 2000 votes)"

        # D. MOUTHFUL RULE
        if len(title) > 40:
            return "❌ REJECTED", f"Title too long ({len(title)} chars)"

        # E. TIME MACHINE VOTE TIERS
        try:
            year = int(first_air_date)
        except:
            year = 2025

        if year >= 2016 and vote_count < 400:
            return "❌ REJECTED", f"Modern show (2016+) needs 400 votes, has {vote_count}"
        elif year >= 2000 and vote_count < 200:
            return "❌ REJECTED", f"2000s show needs 200 votes, has {vote_count}"
        elif year < 2000 and vote_count < 50:
            return "❌ REJECTED", f"Old show needs 50 votes, has {vote_count}"

        # F. KEYWORD PURGE (Skipped for Competitions)
        if not is_competition:
            bad_keywords = ["documentary", "docuseries", "reality series", "competition series", "unscripted"]
            if any(bad in overview_lower for bad in bad_keywords):
                return "❌ REJECTED", "Banned keyword in overview"

        # G. QUALITY CHECK
        if not overview or len(overview) < 10:
            return "❌ REJECTED", "Empty Overview"

        return "✅ ACCEPTED", f"Passed all Western filters ({vote_count} votes)"

# --- EXECUTE ---
print(f"{'STATUS':<12} | {'SHOW NAME':<35} | REASON")
print("-" * 80)

for name in SHOW_LIST:
    status, reason = check_show(name)
    print(f"{status:<12} | {name:<35} | {reason}")
    time.sleep(0.2) # Be nice to the API