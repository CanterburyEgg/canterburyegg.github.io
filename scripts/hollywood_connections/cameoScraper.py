import pandas as pd
import requests
import time
import json

# --- CONFIG ---
TMDB_API_KEY = "f5cc68dfbe5836293db6212bb383ffff"
HEADERS = {"Authorization": f"Bearer {TMDB_API_KEY}"} if len(TMDB_API_KEY) > 40 else {}
PARAMS = {"api_key": TMDB_API_KEY} if len(TMDB_API_KEY) < 40 else {}

# Shows specifically known for "Celebrity Cameos"
CAMEO_SHOWS = {
    1668: "Friends",
    2316: "The Office (US)",
    4608: "30 Rock",
    2710: "Extras"
}

def scrape_cameos(csv_path):
    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip().str.lower()
    
    cameo_map = {show_name: [] for show_name in CAMEO_SHOWS.values()}
    
    print(f"--- 🕵️ Scoping Cameos for {len(df)} Actors ---")

    for i, row in df.iterrows():
        name = row['name']
        
        # 1. Get TMDB ID
        search_url = "https://api.themoviedb.org/3/search/person"
        s_res = requests.get(search_url, params={**PARAMS, "query": name}).json()
        if not s_res.get('results'): continue
        a_id = s_res['results'][0]['id']

        # 2. Get TV Credits
        url = f"https://api.themoviedb.org/3/person/{a_id}/tv_credits"
        r = requests.get(url, params=PARAMS).json()
        
        for credit in r.get('cast', []):
            show_id = credit.get('id')
            ep_count = credit.get('episode_count', 0)
            
            # THE CAMEO FILTER: 
            # 1. Must be in our Target Shows
            # 2. Must be between 1 and 4 episodes (The "Guest Star" Sweet Spot)
            if show_id in CAMEO_SHOWS and 1 <= ep_count <= 4:
                show_name = CAMEO_SHOWS[show_id]
                cameo_map[show_name].append(name)
                print(f"  ✨ Cameo Found: {name} in {show_name} ({ep_count} eps)")

        time.sleep(0.12) # Stay under the radar
        
    # Remove duplicates and sort
    for show in cameo_map:
        cameo_map[show] = sorted(list(set(cameo_map[show])))
        
    return cameo_map

# --- RUN & OUTPUT ---
results = scrape_cameos('lists/top_600_stripped.csv')

print("\n--- 📝 JSON FOR MANUAL ---")
print(json.dumps(results, indent=4))

with open('tv_cameos.json', 'w') as f:
    json.dump(results, f, indent=4)