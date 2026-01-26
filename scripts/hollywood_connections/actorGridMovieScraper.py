import requests
import pandas as pd
import time

TMDB_API_KEY = "f5cc68dfbe5836293db6212bb383ffff"

def get_high_vote_movies():
    movies = []
    # Loop through the first 20-30 pages of results (20 movies per page)
    # Most movies with 10k+ votes will be in the top ~500-1000 popular movies.
    for page in range(1, 51): 
        url = f"https://api.themoviedb.org/3/discover/movie?api_key={TMDB_API_KEY}&vote_count.gte=10000&sort_by=popularity.desc&page={page}"
        try:
            response = requests.get(url).json()
            results = response.get('results', [])
            if not results:
                break
            for m in results:
                movies.append({
                    'id': m['id'],
                    'title': m['title'],
                    'vote_count': m['vote_count'],
                    'popularity': m['popularity']
                })
            print(f"Page {page} scraped. Total movies: {len(movies)}")
            time.sleep(0.2)
        except Exception as e:
            print(f"Error on page {page}: {e}")
            break
            
    return pd.DataFrame(movies)

# Create and save the movie filter list
movie_universe = get_high_vote_movies()
movie_universe.to_csv('movie_universe_10k.csv', index=False)