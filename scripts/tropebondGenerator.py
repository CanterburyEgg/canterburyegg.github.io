import requests
import time
from collections import defaultdict
import itertools
from datetime import datetime
import difflib
import json
import re

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
    {"Venom", "Venom: Let There Be Carnage", "Venom: The Last Dance"},
    # Star Wars (Skywalker Saga + Rogue One/Solo/Clone Wars)
    {"Star Wars", "Star Wars: Episode IV - A New Hope", "The Empire Strikes Back", "Star Wars: Episode V - The Empire Strikes Back", "Return of the Jedi", "Star Wars: Episode VI - Return of the Jedi", "Star Wars: Episode I - The Phantom Menace", "Star Wars: Episode II - Attack of the Clones", "Star Wars: Episode III - Revenge of the Sith", "Star Wars: The Force Awakens", "Star Wars: The Last Jedi", "Star Wars: The Rise of Skywalker", "Rogue One: A Star Wars Story", "Solo: A Star Wars Story", "Star Wars: The Clone Wars"},
    # Star Trek (Original, TNG, and Kelvin Timeline)
    {"Star Trek: The Motion Picture", "Star Trek II: The Wrath of Khan", "Star Trek III: The Search for Spock", "Star Trek IV: The Voyage Home", "Star Trek V: The Final Frontier", "Star Trek VI: The Undiscovered Country", "Star Trek: Generations", "Star Trek: First Contact", "Star Trek: Insurrection", "Star Trek: Nemesis", "Star Trek", "Star Trek Into Darkness", "Star Trek Beyond"},
    # James Bond (The 007 Glue)
    # Judi Dench (M) and Desmond Llewelyn (Q) connect Pierce Brosnan to Daniel Craig
    {"Dr. No", "From Russia with Love", "Goldfinger", "Thunderball", "You Only Live Twice", "On Her Majesty's Secret Service", "Diamonds Are Forever", "Live and Let Die", "The Man with the Golden Gun", "The Spy Who Loved Me", "Moonraker", "For Your Eyes Only", "Octopussy", "A View to a Kill", "The Living Daylights", "Licence to Kill", "GoldenEye", "Tomorrow Never Dies", "The World Is Not Enough", "Die Another Day", "Casino Royale", "Quantum of Solace", "Skyfall", "Spectre", "No Time to Die"},

    # X-Men (The Timeline Mess)
    # Hugh Jackman connects almost all of these.
    {"X-Men", "X2", "X-Men: The Last Stand", "X-Men Origins: Wolverine", "X-Men: First Class", "The Wolverine", "X-Men: Days of Future Past", "X-Men: Apocalypse", "Dark Phoenix", "Logan", "Deadpool", "Deadpool 2", "Deadpool & Wolverine", "The New Mutants"},

    # Jurassic Park (The Legacy Cast)
    # Sam Neill / Laura Dern / Jeff Goldblum bridge the 1993 and 2022 movies.
    {"Jurassic Park", "The Lost World: Jurassic Park", "Jurassic Park III", "Jurassic World", "Jurassic World: Fallen Kingdom", "Jurassic World Dominion"},

    # Transformers (The Shia/Wahlberg Bridge)
    {"Transformers", "Transformers: Revenge of the Fallen", "Transformers: Dark of the Moon", "Transformers: Age of Extinction", "Transformers: The Last Knight", "Bumblebee", "Transformers: Rise of the Beasts"},

    # The Happy Madison Universe (Adam Sandler Spam)
    # These guys appear in almost all of these together.
    {"Happy Gilmore", "Billy Madison", "The Waterboy", "Big Daddy", "Little Nicky", "Mr. Deeds", "Anger Management", "50 First Dates", "The Longest Yard", "Click", "I Now Pronounce You Chuck & Larry", "Grown Ups", "Grown Ups 2", "Just Go with It", "Blended", "Hubie Halloween", "Murder Mystery"},
    
    # The Wes Anderson Troupe (Bill Murray / Owen Wilson Spam)
    # Stylish, but makes for very easy connections if you know the director.
    {"Bottle Rocket", "Rushmore", "The Royal Tenenbaums", "The Life Aquatic with Steve Zissou", "The Darjeeling Limited", "Fantastic Mr. Fox", "Moonrise Kingdom", "The Grand Budapest Hotel", "Isle of Dogs", "The French Dispatch", "Asteroid City"},

    # Rocky / Creed
    {"Rocky", "Rocky II", "Rocky III", "Rocky IV", "Rocky V", "Rocky Balboa", "Creed", "Creed II", "Creed III"},

    # Terminator (Arnold links them all)
    {"The Terminator", "Terminator 2: Judgment Day", "Terminator 3: Rise of the Machines", "Terminator Salvation", "Terminator Genisys", "Terminator: Dark Fate"},

    # Pirates of the Caribbean
    {"Pirates of the Caribbean: The Curse of the Black Pearl", "Pirates of the Caribbean: Dead Man's Chest", "Pirates of the Caribbean: At World's End", "Pirates of the Caribbean: On Stranger Tides", "Pirates of the Caribbean: Dead Men Tell No Tales"},

    # Indiana Jones
    {"Raiders of the Lost Ark", "Indiana Jones and the Temple of Doom", "Indiana Jones and the Last Crusade", "Indiana Jones and the Kingdom of the Crystal Skull", "Indiana Jones and the Dial of Destiny"},
    
    # The Hunger Games
    {"The Hunger Games", "The Hunger Games: Catching Fire", "The Hunger Games: Mockingjay - Part 1", "The Hunger Games: Mockingjay - Part 2", "The Hunger Games: The Ballad of Songbirds & Snakes"},

    # View Askewniverse
    {"Clerks", "Mallrats", "Chasing Amy", "Dogma", "Jay and Silent Bob Strike Back", "Clerks II", "Jay and Silent Bob Reboot", "Clerks III"},

    # Cornetto Trilogy
    {"Shaun of the Dead", "Hot Fuzz", "The World's End"}
]

movie_rank_map = {}

def clean_title(title):
    t = title.lower().strip()
    if t.startswith("the "): return t[4:]
    if t.startswith("a "): return t[2:]
    if t.startswith("an "): return t[3:]
    return t

def redact_title_from_plot(title, plot):
    if not plot: return ""
    
    # 1. Identify the versions of the title to hide
    #    Example: "The Dark Knight" -> ["The Dark Knight", "Dark Knight"]
    clean_t = title.strip()
    variations = [clean_t]
    
    # If it starts with "The ", add the version without it
    if clean_t.lower().startswith("the "):
        variations.append(clean_t[4:])
    
    # Sort by length (descending) so we replace the longest match first
    # (prevents replacing just "Matrix" inside "The Matrix")
    variations.sort(key=len, reverse=True)
    
    redacted_plot = plot
    for variant in variations:
        # Skip very short titles (like "Up", "Us", "It") to prevent false positives
        # unless they are the exact full title string.
        if len(variant) < 3: 
            continue
            
        # Create a regex with IGNORECASE and Word Boundaries (\b)
        # \b ensures we don't match "Alien" inside "Alienation"
        pattern = r'\b' + re.escape(variant) + r'\b'
        redacted_plot = re.sub(pattern, "[REDACTED]", redacted_plot, flags=re.IGNORECASE)
        
    return redacted_plot

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
    unique_movies = {} 
    global movie_rank_map
    movie_rank_map = {}
    
    # --- BUCKET 1: THE HALL OF FAME ---
    # We grab the top 2,400 movies.
    # This covers everything with > 2,000 votes (approx 2,445 movies exist).
    print(f"🏛️  Fetching Hall of Fame (Top 2,400)...")
    page = 1
    
    while len(unique_movies) < 2400 and page < 150:
        # Sort by most votes to guarantee we get the best ones first
        url = f"https://api.themoviedb.org/3/discover/movie?api_key={API_KEY}&language=en-US&sort_by=vote_count.desc&page={page}"
        try:
            res = requests.get(url).json()
            if 'results' in res:
                for m in res['results']:
                    if not m.get('release_date') or m['release_date'] > TODAY: continue
                    
                    # THRESHOLD: 2,000 Votes.
                    # This guarantees quality while letting in "August Rush" (2,782) and "Challengers" (2,478)
                    if m.get('vote_count', 0) < 2000: continue 

                    title_key = m['title'].lower().strip()
                    
                    # DEDUPLICATION LOGIC
                    safe_plot = redact_title_from_plot(m['title'], m['overview'])
                    if title_key in unique_movies:
                        existing = unique_movies[title_key]
                        if m['vote_count'] > existing['vote_count']:
                            unique_movies[title_key] = {
                                'id': m['id'], 'title': m['title'],
                                'year': m['release_date'].split('-')[0],
                                'overview': safe_plot,
                                'vote_count': m['vote_count']
                            }
                    else:
                        unique_movies[title_key] = {
                            'id': m['id'], 'title': m['title'],
                            'year': m['release_date'].split('-')[0],
                            'overview': safe_plot,
                            'vote_count': m['vote_count']
                        }

            print(f"   [Fame] Page {page}: stored {len(unique_movies)} unique titles...")
            page += 1
            time.sleep(0.1)
        except Exception as e:
            print(f"Error: {e}")
            break

    # --- BUCKET 2: THE TRENDING LIST ---
    # Catches "Monkey Man" (1,280 votes) or brand new hits.
    print(f"🔥 Fetching Current Hits (Popularity)...")
    page = 1
    target_count = len(unique_movies) + 100 # Add top 100 trends
    
    while len(unique_movies) < target_count and page < 20:
        url = f"https://api.themoviedb.org/3/movie/popular?api_key={API_KEY}&language=en-US&page={page}"
        try:
            res = requests.get(url).json()
            if 'results' in res:
                for m in res['results']:
                    if not m.get('release_date') or m['release_date'] > TODAY: continue
                    
                    # Low threshold for new stuff
                    if m.get('vote_count', 0) < 400: continue 

                    title_key = m['title'].lower().strip()
                    
                    # Only add if we don't already have it
                    if title_key not in unique_movies:
                        safe_plot = redact_title_from_plot(m['title'], m['overview'])
                        unique_movies[title_key] = {
                            'id': m['id'], 'title': m['title'],
                            'year': m['release_date'].split('-')[0],
                            'overview': safe_plot,
                            'vote_count': m['vote_count']
                        }
                        
            print(f"   [Trend] Page {page}: Total {len(unique_movies)}...")
            page += 1
            time.sleep(0.1)
        except Exception as e:
            print(f"Error: {e}")
            break

    # --- FINALIZE ---
    final_list = []
    rank = 1
    # Sort by votes so "Easy Mode" is truly the most famous stuff
    sorted_movies = sorted(unique_movies.values(), key=lambda x: x['vote_count'], reverse=True)
    
    for m in sorted_movies:
        movie_rank_map[m['id']] = rank
        final_list.append(m)
        rank += 1
        
    return final_list

def fetch_credits(movie_id):
    url = f"https://api.themoviedb.org/3/movie/{movie_id}/credits?api_key={API_KEY}"
    try:
        res = requests.get(url).json()
        cast = []
        if 'cast' in res:
            # Sort by order just in case
            sorted_cast = sorted(res['cast'], key=lambda x: x['order'])
            for c in sorted_cast[:CAST_LIMIT]:
                cast.append({
                    'id': c['id'], 
                    'name': c['name'], 
                    'profile_path': c.get('profile_path') 
                })
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
    for c in cast: 
        actor_map[c['id']] = {
            'name': c['name'], 
            'img': c['profile_path']
        }

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

                    # NEW: Retrieve Name and Image separately
                    a_obj = actor_map[actor_a]
                    b_obj = actor_map[actor_b]
                    c_obj = actor_map[actor_c]

                    actors = [a_obj['name'], b_obj['name'], c_obj['name']]
                    actor_images = [a_obj['img'], b_obj['img'], c_obj['img']]

                    # (Ranking logic remains the same)
                    ranks = [movie_rank_map[m['id']] for m in valid_set]
                    difficulty = max(ranks)

                    # (4th Star logic remains the same)
                    clue_cast = []
                    for m in valid_set:
                        m_cast = movie_cast_lookup[m['id']]
                        star = get_fourth_star(m_cast, actors)
                        clue_cast.append(star)

                    triangles.append({
                        'actors': actors,
                        'actor_images': actor_images, # <--- ADD THIS FIELD
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