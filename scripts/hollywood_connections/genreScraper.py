import pandas as pd
import requests
import time
import json

# --- CONFIG ---
TMDB_API_KEY = "f5cc68dfbe5836293db6212bb383ffff"
HEADERS = {"Authorization": f"Bearer {TMDB_API_KEY}"} if len(TMDB_API_KEY) > 40 else {}
PARAMS = {"api_key": TMDB_API_KEY} if len(TMDB_API_KEY) < 40 else {}

# Thresholds: What % of their Top 10 roles must be in this genre?
THRESHOLDS = {
    "Action Heroes": 0.30,      # 30% Action
    "Scream Queens/Kings": 0.20, # 20% Horror
    "Rom-Com Icons": 0.25        # 25% Comedy + Romance (must have both tags)
}

def get_genre_archetypes(csv_path):
    df = pd.read_csv(csv_path)
    # Ensure column names are clean
    df.columns = df.columns.str.strip().str.lower()
    
    results = {
        "Action Heroes": [],
        "Scream Queens/Kings": [],
        "Rom-Com Icons": []
    }

    print(f"--- 📊 Analyzing Genres for {len(df)} Actors ---")

    for i, row in df.iterrows():
        name = row['name']
        
        # 1. Get TMDB ID
        search_url = "https://api.themoviedb.org/3/search/person"
        s_res = requests.get(search_url, params={**PARAMS, "query": name}).json()
        if not s_res.get('results'): continue
        a_id = s_res['results'][0]['id']

        # 2. Get Movie Credits
        c_url = f"https://api.themoviedb.org/3/person/{a_id}/movie_credits"
        c_res = requests.get(c_url, params=PARAMS).json()
        
        cast = c_res.get('cast', [])
        # Filter for "Significant" roles (Top 10 Billing)
        main_roles = [m for m in cast if m.get('order', 99) <= 10]
        total_sig = len(main_roles)
        
        if total_sig < 5: continue # Skip actors with too few major roles for a fair %

        genre_counts = {"Action": 0, "Horror": 0, "RomCom": 0}

        for movie in main_roles:
            g_ids = movie.get('genre_ids', [])
            if 28 in g_ids: genre_counts["Action"] += 1
            if 27 in g_ids: genre_counts["Horror"] += 1
            if 35 in g_ids and 10749 in g_ids: genre_counts["RomCom"] += 1

        # 3. Calculate Scores & Sort
        action_score = genre_counts["Action"] / total_sig
        horror_score = genre_counts["Horror"] / total_sig
        romcom_score = genre_counts["RomCom"] / total_sig

        if action_score >= THRESHOLDS["Action Heroes"]:
            results["Action Heroes"].append(name)
        if horror_score >= THRESHOLDS["Scream Queens/Kings"]:
            results["Scream Queens/Kings"].append(name)
        if romcom_score >= THRESHOLDS["Rom-Com Icons"]:
            results["Rom-Com Icons"].append(name)

        if i % 20 == 0:
            print(f"  > Processed {i}/{len(df)} actors...")
        time.sleep(0.1) # Respect rate limits

    return results

# --- RUN & OUTPUT ---
archetypes = get_genre_archetypes('lists/top_600_stripped.csv')

# Clean up duplicates (an actor could technically be an Action Hero AND a Scream King)
for key in archetypes:
    archetypes[key] = sorted(list(set(archetypes[key])))

print("\n--- ✅ Final JSON for Manual ---")
print(json.dumps(archetypes, indent=4))

# Optional: Save to file
with open('genre_archetypes.json', 'w') as f:
    json.dump(archetypes, f, indent=4)