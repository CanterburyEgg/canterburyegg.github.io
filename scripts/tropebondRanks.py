import os
import requests

API_KEY = "f5cc68dfbe5836293db6212bb383ffff"

# The "Stress Test" List
TARGETS = [
    "Dune: Part Two", 
    "Civil War", 
    "The Fall Guy", 
    "Challengers", 
    "Monkey Man",
    "Godzilla x Kong: The New Empire",
    "Late Night with the Devil" 
]

def check_trending_stats():
    print(f"{'MOVIE TITLE':<30} | {'YEAR':<6} | {'VOTES':<8} | {'STATUS'}")
    print("-" * 75)

    for title in TARGETS:
        url = f"https://api.themoviedb.org/3/search/movie?api_key={API_KEY}&query={title}"
        try:
            res = requests.get(url).json()
            if 'results' in res and res['results']:
                # Get the best match
                m = res['results'][0] 
                votes = m['vote_count']
                
                status = "✅ SAFE (>3000)" if votes >= 3000 else "❌ CUT (<3000)"
                if votes < 1500: status = "💀 GONE (<1500)"
                
                print(f"{m['title']:<30} | {m.get('release_date', 'N/A')[:4]:<6} | {votes:<8} | {status}")
            else:
                print(f"{title:<30} | NOT FOUND")
        except Exception as e:
            print(f"Error checking {title}: {e}")

if __name__ == "__main__":
    check_trending_stats()