import pandas as pd
import requests
import time

TMDB_API_KEY = "f5cc68dfbe5836293db6212bb383ffff"
TOP_X_THRESHOLD = 12 # Adjust this (10-15 is the sweet spot)

# 1. Load your data
actors_df = pd.read_csv('lists/top_600_popular.csv')
movie_universe = pd.read_csv('lists/top_movies.csv')

# Create a set of valid Movie IDs for O(1) lookups
valid_movie_ids = set(movie_universe['id'].astype(int))
# Create a mapping of ID -> Title for quick referencing
id_to_title = dict(zip(movie_universe['id'], movie_universe['title']))

def get_definitive_credits(actor_name):
    """
    Finds every movie in our universe where this actor is Top-X billed.
    """
    definitive_movies = []
    
    # Search for the person to get their TMDB ID
    search_url = f"https://api.themoviedb.org/3/search/person?api_key={TMDB_API_KEY}&query={actor_name}"
    try:
        person_data = requests.get(search_url).json()
        if not person_data['results']:
            return ""
        
        person_id = person_data['results'][0]['id']
        
        # Get their combined movie credits
        credits_url = f"https://api.themoviedb.org/3/person/{person_id}/movie_credits?api_key={TMDB_API_KEY}"
        credits_data = requests.get(credits_url).json()
        
        for cast_member in credits_data.get('cast', []):
            m_id = cast_member.get('id')
            # The 'order' key is the billing position (0 = Lead)
            billing_pos = cast_member.get('order', 999) 
            
            # CRITERIA:
            # 1. Movie must be in your 10k+ vote universe
            # 2. Actor must be billed in the Top X
            if m_id in valid_movie_ids and billing_pos <= TOP_X_THRESHOLD:
                title = id_to_title.get(m_id)
                if title:
                    definitive_movies.append(title)
        
        print(f"Cleaned credits for {actor_name}: {len(definitive_movies)} movies found.")
        time.sleep(0.1) # Respect rate limits
        return "|".join(definitive_movies)
        
    except Exception as e:
        print(f"Error processing {actor_name}: {e}")
        return ""

# 2. Apply the cleaner to your 600 actors
print("Starting credit cleanup... this will take a few minutes.")
actors_df['movie_credits'] = actors_df['name'].apply(get_definitive_credits)

# 3. Save the definitive version
actors_df.to_csv('lists/top_600_stripped.csv', index=False)
print("Done! saved to top_600_stripped.csv")