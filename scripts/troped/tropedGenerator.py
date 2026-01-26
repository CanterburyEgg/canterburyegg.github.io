import requests
import pandas as pd
from sentence_transformers import SentenceTransformer
from tqdm import tqdm
import json
import time
import numpy as np

# --- CONFIG ---
API_KEY = "f5cc68dfbe5836293db6212bb383ffff"
TOTAL_TARGET = 2000     
VALID_THRESHOLD = 1000  
OUTPUT_FILE = "tv_vectors_iconic.json"

# --- DEFINE BANNED GENRES ---
# 99: Documentary, 10763: News, 10764: Reality, 10766: Soap, 10767: Talk
BANNED_GENRES = {99, 10763, 10764, 10766, 10767}

# --- STEP 1: FETCH "ALL TIME" DATA ---
def get_genres():
    url = f"https://api.themoviedb.org/3/genre/tv/list?api_key={API_KEY}&language=en-US"
    response = requests.get(url).json()
    return {g['id']: g['name'] for g in response['genres']}

def fetch_iconic_shows():
    print(f"📡 Fetching {TOTAL_TARGET} most voted-on English shows...")
    shows = []
    genre_map = get_genres()
    
    # We use 'discover' instead of 'popular' to get filtering powers
    base_url = "https://api.themoviedb.org/3/discover/tv"

    # For deduping purposes
    seen_titles = set()
    
    for page in tqdm(range(1, 501)):
        params = {
            'api_key': API_KEY,
            'language': 'en-US',
            'sort_by': 'vote_count.desc',      # <--- FIX 1: All-Time Popularity
            'with_original_language': 'en|ja',    # <--- FIX 2: English Only
            'page': page
        }
        
        response = requests.get(base_url, params=params)
        
        if response.status_code == 200:
            results = response.json().get('results', [])
            for show in results:
                # 1. SETUP VARIABLES
                overview = show.get('overview', '')
                overview_lower = overview.lower() # Case-insensitive check helper
                title = show['name']
                original_lang = show.get('original_language', 'en')
                genre_ids = set(show.get('genre_ids', []))
                vote_count = show.get('vote_count', 0)
                first_air_date = show.get('first_air_date', '2025')[:4]

                # --- DUPLICATE CHECK ---
                if title in seen_titles:
                    print(f"Skipping duplicate: {title}")
                    continue
                seen_titles.add(title)
                # -----------------------
                
                # --- LOGIC GATE 1: ANIME (The "VIP Entrance") ---
                # If it is Japanese, it ignores almost all other rules (colons, animation, etc.)
                # BUT it must be a massive hit (600+ votes) to prove it's iconic.
                if original_lang == 'ja':
                    if vote_count < 600:
                        continue
                    # If it has >600 votes, it SKIPS the rest of the filters and goes straight to append.
                    # (Pass through to the bottom)
                    pass

                # --- LOGIC GATE 2: WESTERN SHOWS ---
                else:
                    # A. IDENTIFY COMPETITIONS
                    is_reality = 10764 in genre_ids
                    
                    # UPDATED KEYWORDS: Added "culinary", "kitchen", "battle" for Iron Chef
                    competition_keywords = [
                        "competition", "contestant", "game show", "challenge", "eliminated",
                        "reality", "race", "cooking", "chef", "baking", "teams",
                        "culinary", "kitchen", "battle" 
                    ]
                    is_competition = is_reality and any(k in overview_lower for k in competition_keywords)
                    
                    # B. THE "STRICT BAN" LIST
                    # We ignore this list IF it is a competition (fixes Amazing Race being "Doc")
                    STRICT_BANS = {99, 10763, 10767, 10766}
                    
                    if not is_competition:
                        if not genre_ids.isdisjoint(STRICT_BANS):
                            continue
                    
                    # If it is Reality but NOT a competition, kill it.
                    if is_reality and not is_competition:
                        continue

                    # C. THE COLON RULE
                    if 16 in genre_ids and ':' in title:
                        is_safe_franchise = "Star Wars" in title or "Star Trek" in title
                        is_massive_hit = vote_count >= 2000
                        if not is_safe_franchise and not is_massive_hit:
                            continue

                    # D. THE MOUTHFUL RULE
                    if len(title) > 40:
                        continue

                    # E. VOTE TIERS (The "Safe" Slop Prevention)
                    
                    # RULE 1: COMPETITIONS (The "Reality Ghetto")
                    # We allow low votes (50) HERE ONLY. 
                    # This allows "Chopped" (61) but blocks "The Geico Caveman Show" (Scripted).
                    if is_competition:
                        if vote_count < 50: continue
                    
                    # RULE 2: SCRIPTED SHOWS (Keep Standards High)
                    else:
                        try:
                            year = int(first_air_date)
                        except:
                            year = 2025

                        if year >= 2016 and vote_count < 400: continue
                        elif year >= 2000 and vote_count < 200: continue
                        elif year < 2000 and vote_count < 50: continue

                    # F. KEYWORD PURGE (Skipped for Competitions)
                    if not is_competition:
                        bad_keywords = ["documentary", "docuseries", "reality series", "competition series", "unscripted"]
                        if any(bad in overview_lower for bad in bad_keywords):
                            continue

                    # G. QUALITY CHECK
                    if not overview or len(overview) < 10:
                        continue

                # --- FINAL STEP: APPEND ---
                g_names = [genre_map.get(gid, "") for gid in show.get('genre_ids', [])]

                shows.append({
                    'id': show['id'],
                    'title': show['name'],
                    'soup': f"{show['name']} {show['name']} {show['name']} {' '.join(g_names)} {overview}",
                    'votes': show.get('vote_count', 0)
                })
        
        if len(shows) >= TOTAL_TARGET:
            break
            
        time.sleep(0.1)
            
    return pd.DataFrame(shows[:TOTAL_TARGET])

# --- MAIN EXECUTION ---
df = fetch_iconic_shows()
print(f"✅ Top show is: {df.iloc[0]['title']} with {df.iloc[0]['votes']} votes")

# --- STEP 2: VECTORS ---
print("🧠 Encoding vectors...")
model = SentenceTransformer('all-MiniLM-L6-v2')
embeddings = model.encode(df['soup'].tolist(), show_progress_bar=True)

# --- STEP 3: EXPORT ---
print("💾 Saving...")

data_export = {
    "valid_limit": VALID_THRESHOLD,
    "titles": df['title'].tolist(),
    "vectors": []
}

rounded_embeddings = np.round(embeddings, 3)

for vec in rounded_embeddings:
    data_export["vectors"].append(vec.tolist())

with open(OUTPUT_FILE, 'w') as f:
    json.dump(data_export, f, indent=4)

print(f"✅ Done! Saved to {OUTPUT_FILE}")