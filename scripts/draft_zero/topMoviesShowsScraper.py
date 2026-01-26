import requests
import pandas as pd
import time

# Replace with your TMDb API key
API_KEY = 'f5cc68dfbe5836293db6212bb383ffff'
BASE_URL = "https://api.themoviedb.org/3"

def fetch_titles(media_type, limit):
    results = []
    pages = (limit // 20) + 1
    
    for page in range(1, pages + 1):
        url = f"{BASE_URL}/discover/{media_type}"
        params = {
            'api_key': API_KEY,
            'sort_by': 'vote_count.desc',
            'with_original_language': 'en',
            'page': page
        }
        
        response = requests.get(url, params=params)
        if response.status_code == 200:
            data = response.json()
            for item in data.get('results', []):
                # Extract year for better search matching later
                release_date = item.get('release_date') or item.get('first_air_date') or "0000"
                year = release_date.split('-')[0]
                
                results.append({
                    'title': item.get('title') or item.get('name'),
                    'year': year,
                    'media_type': media_type,
                    'tmdb_id': item['id']
                })
        time.sleep(0.2) # Small delay to be polite
        
    return results[:limit]

# Get the lists
print("Downloading movie list...")
movies = fetch_titles('movie', 1000)

print("Downloading TV list...")
tv_shows = fetch_titles('tv', 500)

# Combine and save
full_list = movies + tv_shows
df = pd.DataFrame(full_list)
df.to_csv('redactle_source_list_expanded.csv', index=False)

print(f"File saved! {len(df)} titles ready for scraping.")