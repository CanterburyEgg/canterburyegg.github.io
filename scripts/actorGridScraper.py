import requests
import pandas as pd
import time
from bs4 import BeautifulSoup

# --- CONFIGURATION ---
TMDB_API_KEY = "f5cc68dfbe5836293db6212bb383ffff"
VOTE_THRESHOLD = 10000  # Scrapes EVERY movie with at least this many votes
BASE_URL = "https://api.themoviedb.org/3"

def get_ivy_leaguers():
    print("Fetching Ivy League list...")
    url = "https://query.wikidata.org/sparql"
    query = """
    SELECT DISTINCT ?itemLabel WHERE {
      ?item wdt:P106 wd:Q33999; wdt:P69 ?college.
      VALUES ?college { wd:Q13371 wd:Q49088 wd:Q49110 wd:Q49114 wd:Q42327 wd:Q49057 wd:Q49074 wd:Q134511 }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    """
    try:
        r = requests.get(url, params={'format': 'json', 'query': query}, timeout=15)
        return [item['itemLabel']['value'] for item in r.json()['results']['bindings']]
    except:
        return []

def get_actor_height(imdb_id):
    if not imdb_id: return None
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        r = requests.get(f"https://www.imdb.com/name/{imdb_id}/bio", headers=headers, timeout=5)
        soup = BeautifulSoup(r.text, 'html.parser')
        # Targeting the specific height string format on IMDb (e.g., "6' 2" (1.88 m)")
        height_span = soup.find('span', string=lambda x: x and ('cm' in x or 'm)' in x))
        return height_span.text.strip() if height_span else None
    except:
        return None

def scrape_actor_universe():
    ivy_list = get_ivy_leaguers()
    seen_actors = set()
    actor_data = []

    # Initial call to see how many pages exist for this threshold
    init_url = f"{BASE_URL}/discover/movie?api_key={TMDB_API_KEY}&sort_by=vote_count.desc&vote_count.gte={VOTE_THRESHOLD}&with_original_language=en"
    init_res = requests.get(init_url).json()
    total_pages = init_res.get('total_pages', 1)
    total_movies = init_res.get('total_results', 0)

    print(f"Found {total_movies} movies matching threshold. Processing {total_pages} pages...")

    for page in range(1, total_pages + 1):
        url = f"{init_url}&page={page}"
        movies = requests.get(url).json().get('results', [])

        for movie in movies:
            m_id = movie['id']
            # Get Cast
            credits = requests.get(f"{BASE_URL}/movie/{m_id}/credits?api_key={TMDB_API_KEY}").json()
            cast = credits.get('cast', [])[:10]

            for member in cast:
                a_id = member['id']
                if a_id in seen_actors: continue
                seen_actors.add(a_id)

                # Get Person Details
                d = requests.get(f"{BASE_URL}/person/{a_id}?api_key={TMDB_API_KEY}&append_to_response=external_ids,combined_credits").json()
                
                name = d.get('name', '')
                imdb_id = d.get('external_ids', {}).get('imdb_id')
                
                actor_data.append({
                    "name": name,
                    "profile_path": d.get('profile_path'),
                    "first_name": name.split()[0] if ' ' in name else name,
                    "last_name": name.split()[-1] if ' ' in name else "",
                    "initials": "".join([n[0] for n in name.split()]) if ' ' in name else name[0],
                    "birthday": d.get('birthday'),
                    "birth_year": d.get('birthday')[:4] if d.get('birthday') else None,
                    "birth_place": d.get('place_of_birth'),
                    "is_ivy": name in ivy_list,
                    # "height": get_actor_height(imdb_id),
                    "height": None,
                    "movie_credits": "|".join([c.get('title', 'Unknown') for c in d.get('combined_credits', {}).get('cast', []) if c.get('media_type') == 'movie']),
                    "tv_credits": "|".join([c.get('name', 'Unknown') for c in d.get('combined_credits', {}).get('cast', []) if c.get('media_type') == 'tv']),
                    "popularity": d.get('popularity')
                })
                print(f"Saved: {name}")
                time.sleep(0.1)

    df = pd.DataFrame(actor_data)
    df.to_csv("actor_universe.csv", index=False)
    print(f"Complete! Universe contains {len(actor_data)} actors.")

if __name__ == "__main__":
    scrape_actor_universe()