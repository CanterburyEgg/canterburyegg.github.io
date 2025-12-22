import requests

API_KEY = "f5cc68dfbe5836293db6212bb383ffff" # <--- Paste your key
QUERY = "Iron Chef"

def find_the_truth():
    print(f"🔎 SEARCHING TMDB FOR: '{QUERY}'...")
    url = f"https://api.themoviedb.org/3/search/tv?api_key={API_KEY}&query={QUERY}"
    res = requests.get(url).json()

    if not res['results']:
        print("❌ No results found.")
        return

    print(f"Found {len(res['results'])} matches.\n")

    for show in res['results']:
        print(f"📺 TITLE: {show['name']}")
        print(f"🆔 ID: {show['id']}")
        print(f"🏳️ LANG: {show['original_language']}")
        print(f"📅 DATE: {show.get('first_air_date', 'N/A')}")
        print(f"🗳️ VOTES: {show.get('vote_count', 0)}")
        print(f"🎭 GENRES: {show.get('genre_ids', [])}")
        
        # Keyword Check
        overview = show.get('overview', '').lower()
        keywords = ["cooking", "chef", "kitchen", "battle", "competition", "contestant"]
        found_keys = [k for k in keywords if k in overview]
        
        if found_keys:
            print(f"✅ KEYWORDS FOUND: {found_keys}")
        else:
            print(f"❌ NO KEYWORDS in overview.")
            # Print the first 100 chars so we can see what's wrong
            print(f"   📝 \"{overview[:100]}...\"")
            
        print("-" * 40)

find_the_truth()