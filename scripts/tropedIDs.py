import json
import requests
import time

# --- CONFIG ---
API_KEY = "f5cc68dfbe5836293db6212bb383ffff"  # <--- PASTE YOUR KEY HERE
INPUT_FILE = "jsons/tv_vectors.json"
# --------------

def get_show_id(title):
    url = f"https://api.themoviedb.org/3/search/tv?api_key={API_KEY}&query={title}"
    try:
        response = requests.get(url)
        if response.status_code == 200:
            results = response.json().get('results', [])
            if results:
                # Return the ID of the first (most popular) match
                return results[0]['id']
    except Exception as e:
        print(f"Error searching for {title}: {e}")
    return None

print(f"Loading {INPUT_FILE}...")
with open(INPUT_FILE, 'r') as f:
    data = json.load(f)

titles = data['titles']
vectors = data['vectors']
ids = []

print(f"Fetching IDs for {len(titles)} shows. This might take a moment...")

for i, title in enumerate(titles):
    show_id = get_show_id(title)
    
    if show_id:
        ids.append(show_id)
    else:
        print(f"⚠️ Could not find ID for: {title} (Using 0)")
        ids.append(0) # Placeholder to keep arrays aligned

    # Simple progress bar
    if i % 50 == 0:
        print(f"Processed {i}/{len(titles)}...")
    
    # Tiny sleep to be nice to the API
    time.sleep(0.05)

# Update the data dictionary
data['ids'] = ids

print("\nSaving updated file...")
with open(INPUT_FILE, 'w') as f:
    json.dump(data, f, indent=4)

print("✅ Done! 'ids' array added to tv_vectors.json")