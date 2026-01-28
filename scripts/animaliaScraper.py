import requests
import pandas as pd
import time
from datetime import datetime, timedelta

# Updated to use the most stable Wikipedia titles
FAMILIES_TO_PROBE = [
    ("Felidae", "Felidae"), 
    ("Ursidae", "Ursidae"), 
    ("Crocodylidae", "Crocodylidae")
]

HEADERS = {'User-Agent': 'AnimalGameBot/1.0 (contact@yourdomain.com)'}

def get_links_from_page(page_title):
    """Fetch links from a page with a strict timeout to prevent hanging."""
    url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "titles": page_title,
        "prop": "links",
        "pllimit": "max",
        "format": "json"
    }
    try:
        # 10-second timeout prevents the 'Elephant' hang
        response = requests.get(url, params=params, headers=HEADERS, timeout=10)
        data = response.json()
        pages = data.get('query', {}).get('pages', {})
        for page_id in pages:
            # If the page doesn't exist, pages[page_id] will have a 'missing' key
            if 'missing' in pages[page_id]:
                print(f"  ! Page '{page_title}' not found. Skipping...")
                return []
            return [link['title'] for link in pages[page_id].get('links', [])]
    except Exception as e:
        print(f"  ! Request timed out or failed for {page_title}: {e}")
    return []

# The rest of your functions (get_page_views, get_summary) stay the same...

def get_page_views(page_title):
    """Proxy for popularity."""
    end_date = datetime.now().strftime('%Y%m%d')
    start_date = (datetime.now() - timedelta(days=30)).strftime('%Y%m%d')
    url = f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/{page_title.replace(' ', '_')}/monthly/{start_date}/{end_date}"
    try:
        time.sleep(0.05) # Be kind to the API
        res = requests.get(url, headers=HEADERS)
        if res.status_code == 200:
            return res.json()['items'][0]['views']
    except:
        pass
    return 0

def get_summary(page_title):
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{page_title.replace(' ', '_')}"
    try:
        res = requests.get(url, headers=HEADERS)
        if res.status_code == 200:
            d = res.json()
            return {"name": page_title, "desc": d.get("description", ""), "sum": d.get("extract", "")}
    except:
        pass
    return None

# --- Main Logic ---
results = []
for display_name, family_id in FAMILIES_TO_PROBE:
    print(f"Scanning 'List of {display_name}'...")
    candidates = get_links_from_page(display_name)
    
    scored = []
    for c in candidates:
        # Filter out noise
        if any(x in c for x in ["List", "Category", "Template", "Help", "Identifier"]): continue
        views = get_page_views(c)
        if views > 1000: # Only keep animals someone actually searches for
            scored.append((c, views))
    
    # Take top 10 most famous
    top = sorted(scored, key=lambda x: x[1], reverse=True)[:10]
    for name, v in top:
        print(f"  + Found: {name} ({v} views)")
        info = get_summary(name)
        if info:
            info['family'] = family_id
            info['views'] = v
            results.append(info)

if results:
    pd.DataFrame(results).to_csv("animal_db.csv", index=False)
    print(f"\nSaved {len(results)} animals to animal_db.csv!")