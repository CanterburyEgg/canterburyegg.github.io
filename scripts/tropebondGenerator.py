import requests
import time
from collections import defaultdict
import itertools
from datetime import datetime
import difflib
import json

# --- CONFIG ---
API_KEY = "f5cc68dfbe5836293db6212bb383ffff"  # <--- PASTE YOUR KEY HERE
OUTPUT_FILE = "triangles_enriched.json"
MOVIE_LIMIT = 800
CAST_LIMIT = 10 # Need enough depth to find a 4th star
TODAY = datetime.now().strftime("%Y-%m-%d")
SIMILARITY_THRESHOLD = 0.6

# --- MANUAL FRANCHISE SETS ---
FRANCHISE_SETS = [
    # MCU (The big offenders)
    {"Iron Man", "Iron Man 2", "Iron Man 3", "The Avengers", "Avengers: Age of Ultron", "Avengers: Infinity War", "Avengers: Endgame", "Captain America: The First Avenger", "Captain America: The Winter Soldier", "Captain America: Civil War", "Thor", "Thor: The Dark World", "Thor: Ragnarok", "Thor: Love and Thunder", "Black Widow", "Spider-Man: Homecoming", "Spider-Man: Far From Home", "Spider-Man: No Way Home", "Doctor Strange", "Doctor Strange in the Multiverse of Madness", "Black Panther", "Black Panther: Wakanda Forever", "Guardians of the Galaxy", "Guardians of the Galaxy Vol. 2", "Guardians of the Galaxy Vol. 3", "Ant-Man", "Ant-Man and the Wasp", "Ant-Man and the Wasp: Quantumania", "Eternals", "Shang-Chi and the Legend of the Ten Rings", "The Marvels"},

    # Batman (Nolan / Snyder / Reeves)
    {"Batman Begins", "The Dark Knight", "The Dark Knight Rises", "Batman v Superman: Dawn of Justice", "Justice League", "Zack Snyder's Justice League", "The Batman"},

    # Middle Earth
    {"The Hobbit: An Unexpected Journey", "The Hobbit: The Desolation of Smaug", "The Hobbit: The Battle of the Five Armies", "The Lord of the Rings: The Fellowship of the Ring", "The Lord of the Rings: The Two Towers", "The Lord of the Rings: The Return of the King"},

    # Harry Potter / Fantastic Beasts
    {"Harry Potter and the Philosopher's Stone", "Harry Potter and the Chamber of Secrets", "Harry Potter and the Prisoner of Azkaban", "Harry Potter and the Goblet of Fire", "Harry Potter and the Order of the Phoenix", "Harry Potter and the Half-Blood Prince", "Harry Potter and the Deathly Hallows: Part 1", "Harry Potter and the Deathly Hallows: Part 2", "Fantastic Beasts and Where to Find Them", "Fantastic Beasts: The Crimes of Grindelwald", "Fantastic Beasts: The Secrets of Dumbledore"},

    # Knives Out
    {"Knives Out", "Glass Onion: A Knives Out Mystery", "Wake Up Dead Man: A Knives Out Mystery"},

    # Dune
    {"Dune", "Dune: Part Two"},

    # Fast & Furious
    {"The Fast and the Furious", "2 Fast 2 Furious", "The Fast and the Furious: Tokyo Drift", "Fast & Furious", "Fast Five", "Fast & Furious 6", "Furious 7", "The Fate of the Furious", "F9", "Fast X"},

    # Mission Impossible
    {"Mission: Impossible", "Mission: Impossible II", "Mission: Impossible III", "Mission: Impossible - Ghost Protocol", "Mission: Impossible - Rogue Nation", "Mission: Impossible - Fallout", "Mission: Impossible - Dead Reckoning Part One"},

    # The Extra Ones we found earlier (Now You See Me, Panda, Venom, Zootopia)
    {"Now You See Me", "Now You See Me 2", "Now You See Me: Now You Don't"},
    {"Zootopia", "Zootopia 2"},
    {"Kung Fu Panda", "Kung Fu Panda 2", "Kung Fu Panda 3", "Kung Fu Panda 4"},
    {"Venom", "Venom: Let There Be Carnage", "Venom: The Last Dance"}
]

movie_rank_map = {}

def clean_title(title):
    t = title.lower().strip()
    if t.startswith("the "): return t[4:]
    if t.startswith("a "): return t[2:]
    if t.startswith("an "): return t[3:]
    return t

def is_too_similar(t1, t2):
    c1 = clean_title(t1)
    c2 = clean_title(t2)
    if c1 in c2 or c2 in c1: return True
    return difflib.SequenceMatcher(None, c1, c2).ratio() > SIMILARITY_THRESHOLD

def shares_common_word(titles):
    sets = [set(t.lower().replace(':', '').split()) for t in titles]
    common = sets[0].intersection(sets[1]).intersection(sets[2])
    for word in common:
        if len(word) >= 4: return True
    return False

def is_franchise_spam(movie_objs):
    titles = [m['title'] for m in movie_objs]
    title_set = set(titles)
    for f_set in FRANCHISE_SETS:
        if len(title_set.intersection(f_set)) >= 2: return True
    for t1, t2 in itertools.combinations(titles, 2):
        if is_too_similar(t1, t2): return True
    if shares_common_word(titles): return True
    return False

def get_fourth_star(full_cast, exclude_names):
    """Finds the top billed actor who is NOT in the excluded list"""
    for member in full_cast:
        if member['name'] not in exclude_names:
            return member['name']
    return "Unknown"

def fetch_top_movies():
    movies = []
    seen_ids = set()
    
    # --- BUCKET 1: THE HALL OF FAME (Sorted by Vote Count) ---
    # This captures "Memento", "The Matrix", "Pulp Fiction" - the classics people actually know.
    print(f"🏛️  Fetching Hall of Fame (Most Voted)...")
    page = 1
    # We'll take the top 800 most voted movies
    while len(movies) < 800 and page < 50:
        # Note: We use discover/movie with sort_by=vote_count.desc
        url = f"https://api.themoviedb.org/3/discover/movie?api_key={API_KEY}&language=en-US&sort_by=vote_count.desc&page={page}"
        try:
            res = requests.get(url).json()
            if 'results' in res:
                for m in res['results']:
                    if m['id'] in seen_ids: continue
                    if not m.get('release_date') or m['release_date'] > TODAY: continue
                    
                    # HARD FILTER: Must have at least 3000 votes to be considered "Famous"
                    if m.get('vote_count', 0) < 3000: continue 

                    seen_ids.add(m['id'])
                    
                    # Rank is roughly the order we find them (0-800)
                    movie_rank_map[m['id']] = len(movies) + 1 

                    movies.append({
                        'id': m['id'], 
                        'title': m['title'],
                        'year': m['release_date'].split('-')[0],
                        'overview': m['overview']
                    })
            print(f"   [Fame] Page {page}: Total {len(movies)}...")
            page += 1
            time.sleep(0.1)
        except Exception as e:
            print(f"Error: {e}")
            break

    # --- BUCKET 2: THE CURRENT HITS (Sorted by Popularity) ---
    # This captures brand new stuff like "Dune 2" that might not have 20k votes yet but everyone knows.
    print(f"🔥 Fetching Current Hits (Popularity)...")
    page = 1
    target_count = len(movies) + 200 # Add 200 more
    
    while len(movies) < target_count and page < 20:
        url = f"https://api.themoviedb.org/3/movie/popular?api_key={API_KEY}&language=en-US&page={page}"
        try:
            res = requests.get(url).json()
            if 'results' in res:
                for m in res['results']:
                    if m['id'] in seen_ids: continue
                    if not m.get('release_date') or m['release_date'] > TODAY: continue
                    
                    # Lower threshold for new stuff, but still needs to be legit
                    if m.get('vote_count', 0) < 500: continue 

                    seen_ids.add(m['id'])
                    movie_rank_map[m['id']] = len(movies) + 1 

                    movies.append({
                        'id': m['id'], 
                        'title': m['title'],
                        'year': m['release_date'].split('-')[0],
                        'overview': m['overview']
                    })
            print(f"   [Trend] Page {page}: Total {len(movies)}...")
            page += 1
            time.sleep(0.1)
        except Exception as e:
            print(f"Error: {e}")
            break

    return movies

def fetch_credits(movie_id):
    url = f"https://api.themoviedb.org/3/movie/{movie_id}/credits?api_key={API_KEY}"
    try:
        res = requests.get(url).json()
        cast = []
        if 'cast' in res:
            # Sort by order just in case
            sorted_cast = sorted(res['cast'], key=lambda x: x['order'])
            for c in sorted_cast[:CAST_LIMIT]:
                cast.append({'id': c['id'], 'name': c['name']})
        return cast
    except:
        return []

# --- MAIN ---
movies = fetch_top_movies()
print(f"✅ Scanning {len(movies)} movies...")

actor_map = {}
pairs_to_movies = defaultdict(list)
actor_connections = defaultdict(set)

# Store full cast for later lookup
movie_cast_lookup = {}

for i, m in enumerate(movies):
    cast = fetch_credits(m['id'])
    movie_cast_lookup[m['id']] = cast # Save cast for 4th star logic

    ids = [c['id'] for c in cast]
    for c in cast: actor_map[c['id']] = c['name']

    for id_a, id_b in itertools.combinations(ids, 2):
        key = tuple(sorted((id_a, id_b)))
        # Pass the whole movie object to the map
        pairs_to_movies[key].append(m)
        actor_connections[id_a].add(id_b)
        actor_connections[id_b].add(id_a)

    if i % 50 == 0: print(f"Processing... {i}/{len(movies)}")
    time.sleep(0.05)

print("\n🔺 Hunting & Enriching...")

triangles = []
seen_triangles = set()

# Create a master list of ALL titles we scanned to use for the dropdown
all_movie_titles = sorted([m['title'] for m in movies])

for actor_a in actor_connections:
    for actor_b in actor_connections[actor_a]:
        if actor_b <= actor_a: continue
        common = actor_connections[actor_a].intersection(actor_connections[actor_b])

        for actor_c in common:
            if actor_c <= actor_b: continue

            movies_ab = pairs_to_movies[tuple(sorted((actor_a, actor_b)))]
            movies_bc = pairs_to_movies[tuple(sorted((actor_b, actor_c)))]
            movies_ca = pairs_to_movies[tuple(sorted((actor_c, actor_a)))]

            found_combo = False
            valid_set = []

            for m1 in movies_ab:
                for m2 in movies_bc:
                    if m1['id'] == m2['id']: continue
                    for m3 in movies_ca:
                        if m3['id'] == m1['id'] or m3['id'] == m2['id']: continue

                        candidate_trio = [m1, m2, m3]
                        if is_franchise_spam(candidate_trio): continue

                        found_combo = True
                        valid_set = candidate_trio
                        break
                    if found_combo: break
                if found_combo: break

            if found_combo:
                t_key = tuple(sorted((actor_a, actor_b, actor_c)))
                if t_key not in seen_triangles:
                    seen_triangles.add(t_key)

                    actors = [actor_map[actor_a], actor_map[actor_b], actor_map[actor_c]]

                    ranks = [movie_rank_map[m['id']] for m in valid_set]
                    difficulty = max(ranks)

                    clue_cast = []
                    for m in valid_set:
                        m_cast = movie_cast_lookup[m['id']]
                        star = get_fourth_star(m_cast, actors)
                        clue_cast.append(star)

                    triangles.append({
                        'actors': actors,
                        'movies': [m['title'] for m in valid_set],
                        'years': [m['year'] for m in valid_set],
                        'plots': [m['overview'] for m in valid_set],
                        'clue_cast': clue_cast,
                        'difficulty': difficulty
                    })

print(f"\n🎉 FOUND {len(triangles)} ENRICHED PUZZLES.")
print(f"📚 MOVIE POOL SIZE: {len(all_movie_titles)}")

# --- NEW SAVE STRUCTURE ---
output_data = {
    "puzzles": triangles,
    "all_movies": all_movie_titles
}

with open(OUTPUT_FILE, 'w') as f:
    json.dump(output_data, f, indent=2)

print("✅ Done!")