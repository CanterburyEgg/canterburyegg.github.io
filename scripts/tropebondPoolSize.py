import os
import requests

API_KEY = "f5cc68dfbe5836293db6212bb383ffff"

def check_pool_size():
    # We ask for:
    # 1. English Language (to avoid flooding the list with anime/foreign films unless you want them)
    # 2. Vote Count >= 2000
    url = f"https://api.themoviedb.org/3/discover/movie?api_key={API_KEY}&language=en-US&vote_count.gte=2000&with_original_language=en"
    
    try:
        res = requests.get(url).json()
        total_2k = res.get('total_results', 0)
        
        # Let's also check 1500 and 3000 to give you a range
        url_1500 = f"https://api.themoviedb.org/3/discover/movie?api_key={API_KEY}&language=en-US&vote_count.gte=1500&with_original_language=en"
        res_1500 = requests.get(url_1500).json()
        total_1500 = res_1500.get('total_results', 0)

        url_3k = f"https://api.themoviedb.org/3/discover/movie?api_key={API_KEY}&language=en-US&vote_count.gte=3000&with_original_language=en"
        res_3k = requests.get(url_3k).json()
        total_3k = res_3k.get('total_results', 0)

        print("-" * 40)
        print(f"📊 HALL OF FAME POOL SIZES (English Only)")
        print("-" * 40)
        print(f"movies with 1,500+ votes: {total_1500:>5}  <-- Catches 'Monkey Man' types")
        print(f"movies with 2,000+ votes: {total_2k:>5}  <-- Solid 'Cult Classic' bar")
        print(f"movies with 3,000+ votes: {total_3k:>5}  <-- Strict 'Mainstream' bar")
        print("-" * 40)

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_pool_size()