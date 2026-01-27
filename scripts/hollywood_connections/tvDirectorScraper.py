import pandas as pd
import requests
import time
import json

# --- CONFIG ---
TMDB_API_KEY = "f5cc68dfbe5836293db6212bb383ffff"
HEADERS = {"Authorization": f"Bearer {TMDB_API_KEY}"} if len(TMDB_API_KEY) > 40 else {}
PARAMS = {"api_key": TMDB_API_KEY} if len(TMDB_API_KEY) < 40 else {}

# The 20 Definitive Directors
DIRECTORS_LIST = [
    "Martin Scorsese", "Wes Anderson", "Quentin Tarantino", "Christopher Nolan",
    "Joel Coen", "Tim Burton", "Alfred Hitchcock", "Greta Gerwig", 
    "Steven Spielberg", "Spike Lee", "David Fincher", "Paul Thomas Anderson",
    "Ridley Scott", "James Cameron", "John Ford", "Akira Kurosawa",
    "Guillermo del Toro", "Denis Villeneuve", "Sofia Coppola", "Yorgos Lanthimos"
]

# Load Actor List
df_actors = pd.read_csv('lists/top_600_stripped.csv')
df_actors.columns = df_actors.columns.str.strip().str.lower()
ACTOR_NAMES = set(df_actors['name'].tolist())

def get_tmdb_id(name, type="person"):
    url = f"https://api.themoviedb.org/3/search/{type}"
    p = {**PARAMS, "query": name}
    try:
        r = requests.get(url, params=p, headers=HEADERS).json()
        return r['results'][0]['id'] if r.get('results') else None
    except: return None

# ==========================================
# TASK 1: DIRECTORIAL MUSES (3+ Movies, Top 10 Billing)
# ==========================================
def get_muses(directors, actor_list):
    muses = {}
    for d_name in directors:
        d_id = get_tmdb_id(d_name)
        if not d_id: continue
        
        print(f"Scanning Director: {d_name}")
        url = f"https://api.themoviedb.org/3/person/{d_id}/movie_credits"
        r = requests.get(url, params=PARAMS, headers=HEADERS).json()
        
        counts = {}
        directed = [m for m in r.get('crew', []) if m['job'] == 'Director']
        
        for m in directed:
            c_url = f"https://api.themoviedb.org/3/movie/{m['id']}/credits"
            c_r = requests.get(c_url, params=PARAMS, headers=HEADERS).json()
            # billing order < 10 for movie muses
            for cast in c_r.get('cast', []):
                if cast.get('order', 99) < 10 and cast['name'] in actor_list:
                    counts[cast['name']] = counts.get(cast['name'], 0) + 1
            time.sleep(0.1)

        muses[d_name] = [name for name, count in counts.items() if count >= 3]
    return muses

# ==========================================
# TASK 2: TOP 50 TV SHOWS (Top 20 Billed)
# ==========================================
def get_top_50_tv_ids():
    print("--- 📺 Starting TV Show Discovery (Filtered) ---")
    show_data = {} 
    
    # Genre IDs to EXCLUDE: Reality (10764), Talk (10767), News (10763)
    exclude_genres = "10764,10767,10763"
    
    for page in range(1, 10): # Checking more pages to find 50 "scripted" shows
        url = "https://api.themoviedb.org/3/discover/tv"
        p = {
            **PARAMS, 
            "sort_by": "vote_count.desc", 
            "page": page,
            "without_genres": exclude_genres
        }
        
        try:
            r = requests.get(url, params=p, headers=HEADERS, timeout=15).json()
            for show in r.get('results', []):
                if len(show_data) < 50:
                    show_data[show['id']] = show['name']
            
            if len(show_data) >= 50: break
            
        except Exception as e:
            print(f"❌ Discovery failed: {e}")
            break
            
    print(f"--- 📺 Locked in 50 Scripted Shows (e.g., {list(show_data.values())[0]}) ---\n")
    return show_data

def add_tv_categories(df, top_tv_map):
    print(f"--- 🎭 Scanning {len(df)} Actors for TV Credits ---")
    df['tv_shows'] = ""
    top_tv_ids = set(top_tv_map.keys())
    
    for i, row in df.iterrows():
        name = row['name']
        a_id = get_tmdb_id(name)
        if not a_id: continue
        
        try:
            url = f"https://api.themoviedb.org/3/person/{a_id}/tv_credits"
            r = requests.get(url, params=PARAMS, headers=HEADERS).json()
            
            found = []
            for credit in r.get('cast', []):
                show_id = credit.get('id')
                # NEW: Get episode count for this actor in this show
                ep_count = credit.get('episode_count', 0)
                
                # BUG FIX: Winona in Friends check
                # We only want actors who were in more than, say, 5 episodes
                # This kills the "One-off Guest Star" bug.
                if show_id in top_tv_ids and ep_count > 5:
                    found.append(top_tv_map[show_id])
            
            if found:
                # Use a pipe | instead of comma to avoid the "Quote Wrapping" in CSV
                unique_shows = sorted(list(set(found)))
                df.at[i, 'tv_shows'] = "|".join(unique_shows)
                print(f"  🌟 Match! {name} in: {unique_shows}")
        
        except Exception as e:
            print(f"  ⚠️ Error fetching {name}: {e}")
            
        time.sleep(0.15) 
    return df

# --- RUN ---
# Part A: Muses
#muse_data = get_muses(DIRECTORS_LIST, ACTOR_NAMES)
#with open('directorial_muses.json', 'w') as f:
#    json.dump(muse_data, f, indent=4)

# Part B: TV
top_50_tv = get_top_50_tv_ids()
df_actors = add_tv_categories(df_actors, top_50_tv)
df_actors.to_csv('lists/top_600_enriched_final.csv', index=False)

print("\nProcessing Complete.")