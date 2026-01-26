import requests
from bs4 import BeautifulSoup
import pandas as pd
import re
import time
import json
import io
import pdfplumber
import argparse
from urllib.parse import quote

# --- SETTINGS ---
INPUT_FILE = 'redactle_source_list_expanded.csv'
OUTPUT_FILE = 'redactle_data_final.json'
CHAR_LIMIT = 2000
SAVE_INTERVAL = 10 
TMDB_API_KEY = 'f5cc68dfbe5836293db6212bb383ffff'

def get_tv_pilot_name(tmdb_id):
    if not TMDB_API_KEY:
        return None
    url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/1?api_key={TMDB_API_KEY}"
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            if "episodes" in data and len(data["episodes"]) > 0:
                return data["episodes"][0]["name"]
    except:
        pass
    return None

def clean_script_text(text, title, char_limit=600):
    if not text:
        return None
    
    text_up = text.upper()
    
    # Primary anchors: almost certainly the start of the script
    primary_anchors = [
        r'\bINT\.', r'\bEXT\.', r'\bINT\b', r'\bEXT\b', 
        r'\bFADE\s*IN\b', r'\bACT\s+ONE\b'
    ]
    
    # Secondary anchors: used ONLY if no primary anchor is found
    secondary_anchors = [
        r'\bSCENE\s+1\b', r'\bBLACK\b', r'\bCUT\s+TO\b', r'\bFADE\s+OUT\b',
        r'\bOVER\s+BLACK\b', r'\bTITLE\s+CARD\b'
    ]
    
    first_idx = -1
    # 1. Look for the earliest primary anchor
    for pattern in primary_anchors:
        match = re.search(pattern, text_up)
        if match:
            idx = match.start()
            if first_idx == -1 or idx < first_idx:
                first_idx = idx
                
    # 2. ONLY if no primary found, look for the earliest secondary anchor
    if first_idx == -1:
        for pattern in secondary_anchors:
            match = re.search(pattern, text_up)
            if match:
                idx = match.start()
                if first_idx == -1 or idx < first_idx:
                    first_idx = idx
    
    # 3. Validation and Fallback
    # If the anchor is found too deep (e.g. at the end of the script), it's likely wrong.
    # We fallback to character 0 if no anchor is found or if it's beyond 2,000 chars.
    if first_idx == -1 or first_idx > 2000:
        # Safeguard: If the text is extremely short, it's probably not a script
        if len(text) < 500:
            return None
        first_idx = 0
            
    content = text[first_idx:]
    
    # Remove common script artifacts
    content = re.sub(r'\(CONT\'D\)', '', content, flags=re.IGNORECASE)
    content = re.sub(r'\(MORE\)', '', content, flags=re.IGNORECASE)
    
    # Normalize whitespace: replace multiple spaces/newlines with a single space
    content = re.sub(r'\s+', ' ', content).strip()
    
    # Return first 600 characters
    return content[:char_limit]

def get_imsdb_variations(title):
    import itertools
    
    # 1. Basic cleaning and tokenization
    # Keep & as 'and' because IMSDb almost always uses 'and'
    work_title = title.replace('&', 'and')
    
    # Specific fix for Spider-Verse
    if "Spider-Verse" in title:
        if "Across" in title:
            return ["Spider-Man-Across-the-Spider-Verse"]
        if "Into" in title:
            return ["Spider-Man-Into-the-Spider-Verse"]
    
    # We want to identify tokens and which ones are "flippable" (articles and colons)
    # Let's split by spaces but keep track of colons
    raw_tokens = []
    # Replace colons with " : " to make them separate tokens
    temp_title = work_title.replace(':', ' : ')
    temp_title = re.sub(r'\s+', ' ', temp_title).strip()
    raw_tokens = temp_title.split(' ')
    
    flippable_indices = []
    for i, token in enumerate(raw_tokens):
        # Articles at the start or after a colon are flippable
        if token.lower() in ['the', 'a', 'an']:
            if i == 0 or raw_tokens[i-1] == ':':
                flippable_indices.append(i)
        # Colons are always flippable (remove vs keep as dash)
        elif token == ':':
            flippable_indices.append(i)

    # Limit flippable to avoid exponential explosion (max 4 = 16 variations)
    flippable_indices = flippable_indices[:4]
    
    variations = []
    
    # Generate all combinations of keeping/removing flippable tokens
    for combo in itertools.product([True, False], repeat=len(flippable_indices)):
        current_tokens = []
        for i, token in enumerate(raw_tokens):
            if i in flippable_indices:
                # Get the index in the combo product
                combo_idx = flippable_indices.index(i)
                if combo[combo_idx]: # If True, keep it
                    # If it's a colon, we'll handle it as a space/dash
                    current_tokens.append(token)
                else: # If False, skip it
                    continue
            else:
                current_tokens.append(token)
        
        # Join tokens, removing special chars and normalizing dashes
        def finalize(tokens):
            s = " ".join(tokens)
            s = re.sub(r'[^a-zA-Z0-9\s]', ' ', s)
            words = s.split()
            return "-".join(words)
        
        pattern = finalize(current_tokens)
        if pattern:
            variations.append(pattern)

    # 2. Add the "Comma" variations for leading articles
    # If the title starts with an article, try moving it to the end
    match = re.match(r'^(the|a|an)\s+(.*)', work_title, re.IGNORECASE)
    if match:
        article = match.group(1)
        rest = match.group(2)
        
        # Repeat the combinatorial logic for the 'rest'
        temp_rest = rest.replace(':', ' : ')
        temp_rest = re.sub(r'\s+', ' ', temp_rest).strip()
        rest_tokens = temp_rest.split(' ')
        
        # Identify flippable in the rest (mostly internal colons and articles after them)
        rest_flippable = []
        for i, token in enumerate(rest_tokens):
            if token.lower() in ['the', 'a', 'an'] and i > 0 and rest_tokens[i-1] == ':':
                rest_flippable.append(i)
            elif token == ':':
                rest_flippable.append(i)
        
        rest_flippable = rest_flippable[:3]
        for combo in itertools.product([True, False], repeat=len(rest_flippable)):
            current_rest = []
            for i, token in enumerate(rest_tokens):
                if i in rest_flippable:
                    if combo[rest_flippable.index(i)]:
                        current_rest.append(token)
                else:
                    current_rest.append(token)
            
            base = finalize(current_rest)
            if base:
                variations.append(f"{base},-{article.capitalize()}")
                variations.append(f"{base},-{article.lower()}")

    # 3. Last ditch: remove everything that isn't alphanumeric
    last_ditch = re.sub(r'[^a-zA-Z0-9]', '', work_title)
    if last_ditch:
        variations.append(last_ditch)

    return list(dict.fromkeys(variations))

def scrape_imsdb(title):
    variations = get_imsdb_variations(title)
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    
    for pattern in variations:
        urls = [
            f"https://imsdb.com/scripts/{quote(pattern)}.html",
            f"https://imsdb.com/Movie%20Scripts/{quote(pattern.replace('-', ' '))} Script.html"
        ]
        
        for url in urls:
            try:
                res = requests.get(url, headers=headers, timeout=7)
                if res.status_code != 200:
                    continue
                
                soup = BeautifulSoup(res.text, 'html.parser')
                
                # Check if this page contains the script directly
                body = soup.find('pre') or soup.find('td', class_='scrtext')
                
                if body and len(body.get_text()) > 1500:
                    snippet = clean_script_text(body.get_text(), title, CHAR_LIMIT)
                    if snippet:
                        return snippet

                # Landing page check: Look for "Read [Title] Script"
                for link in soup.find_all('a', href=True):
                    href = link['href']
                    text = link.get_text().lower()
                    if "/scripts/" in href and href.endswith(".html") and "read" in text and "script" in text:
                        script_url = f"https://imsdb.com{href}" if href.startswith('/') else f"https://imsdb.com/scripts/{href}"
                        s_res = requests.get(script_url, headers=headers, timeout=7)
                        if s_res.status_code == 200:
                            s_soup = BeautifulSoup(s_res.text, 'html.parser')
                            s_body = s_soup.find('pre') or s_soup.find('td', class_='scrtext')
                            if not s_body:
                                s_tds = s_soup.find_all('td')
                                if s_tds:
                                    s_body = max(s_tds, key=lambda x: len(x.get_text()))
                            
                            if s_body and len(s_body.get_text()) > 1500:
                                snippet = clean_script_text(s_body.get_text(), title, CHAR_LIMIT)
                                if snippet:
                                    return snippet
            except Exception:
                continue
    return None

def fallback_scriptslug(title, year, media_type='movie', tmdb_id=None):
    # Normalize title for ScriptSlug URL
    s = title.replace("'", "")
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()
    
    # Typo Fixes
    if "Chocolate Factory" in title:
        s_typo = s.replace("chocolate", "choclate")
        s = s_typo # Use the typo version if found
        
    # Handle Deathly Hallows/Hollows inconsistency
    slugs = [s]
    if "hallows" in s:
        slugs.append(s.replace("hallows", "hollows"))
    if "hollows" in s:
        slugs.append(s.replace("hollows", "hallows"))
    
    year_str = str(year)
    years = [year_str, str(int(year)-1), str(int(year)+1)]
    
    patterns = []
    # Get TV Pilot Name if applicable
    pilot_slugs = []
    if media_type == 'tv' and tmdb_id:
        pilot_name = get_tv_pilot_name(tmdb_id)
        if pilot_name:
            # Strip all non-alphanumeric but keep spaces, then slugify with dashes
            # e.g., "Wednesday's Child..." -> "wednesdays child..." -> "wednesdays-child..."
            def slugify_tv(text):
                t = text.lower().replace("'s", "s").replace("'", "")
                t = re.sub(r'[^a-z0-9\s]', '', t)
                return "-".join(t.split())
            
            p_slug = slugify_tv(pilot_name)
            # Remove "Chapter 1", "Pilot", etc. from the start of episode name
            p_clean = re.sub(r'^(chapter|pilot|part|episode)\s*(\d+|one|1)\s*[:\-]*\s*', '', pilot_name, flags=re.IGNORECASE)
            p_clean_slug = slugify_tv(p_clean)
            
            pilot_slugs.extend([p_slug, p_clean_slug])
            
            # Manual fix for Wednesday typo on ScriptSlug ("woe" vs "woes")
            if "Wednesday" in title:
                pilot_slugs.append(p_clean_slug + "s")

    for slug in slugs:
        if media_type == 'tv':
            # TV Priority: 101-episode-name (with year is common too)
            for ps in list(dict.fromkeys(pilot_slugs)):
                patterns.append(f"{slug}-101-{ps}-{year_str}")
                patterns.append(f"{slug}-101-{ps}")
            # TV Fallback: Pilot
            patterns.append(f"{slug}-pilot-{year_str}")
            patterns.append(f"{slug}-pilot")
        else:
            # Movie Logic
            for y in years:
                patterns.append(f"{slug}-{y}")
                patterns.append(f"{slug}-scripted-{y}")
            patterns.append(slug)
            patterns.append(f"{slug}-script")
            patterns.append(f"{slug}-{year_str[:2]}") 
            patterns.append(f"{slug}-pdf")

    # Handling ": Part X" which often maps to "-part-x"
    if ":" in title:
        s_part = re.sub(r'[^a-zA-Z0-9]+', '-', title.replace(":", " ")).strip('-').lower()
        for y in years:
            patterns.append(f"{s_part}-{y}")
        patterns.append(s_part)    
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"}
    
    found_unreadable_url = None
    for p in list(dict.fromkeys(patterns)):
        url = f"https://assets.scriptslug.com/live/pdf/scripts/{p}.pdf"
        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code == 200:
                with pdfplumber.open(io.BytesIO(res.content)) as pdf:
                    full_text = ""
                    for page in pdf.pages[:15]:
                        txt = page.extract_text()
                        if txt:
                            full_text += txt + "\n"
                    
                    snippet = clean_script_text(full_text, title, CHAR_LIMIT)
                    if snippet:
                        return snippet, None
                    else:
                        found_unreadable_url = url
        except Exception:
            continue
    
    return None, found_unreadable_url

def main():
    parser = argparse.ArgumentParser(description="Scrape movie and TV scripts.")
    parser.add_argument("--type", choices=["movie", "tv"], help="Filter by media type (movie or tv)")
    parser.add_argument("--refetch", action="store_true", help="Re-fetch existing entries in JSON to update character count")
    args = parser.parse_args()

    try:
        df_source = pd.read_csv(INPUT_FILE)
    except FileNotFoundError:
        print(f"Error: {INPUT_FILE} not found.")
        return

    # Load existing results
    results = []
    try:
        with open(OUTPUT_FILE, 'r') as f:
            results = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        results = []

    if args.refetch:
        print(f"🔄 Re-fetching {len(results)} existing entries to update to {CHAR_LIMIT} chars...")
        
        # Build comprehensive media map from all available source files
        media_map = {}
        for source_file in ['redactle_source_list.csv', 'redactle_source_list_expanded.csv']:
            try:
                df_temp = pd.read_csv(source_file)
                for _, row in df_temp.iterrows():
                    media_map[int(row['tmdb_id'])] = row['media_type']
            except:
                continue

        for i, entry in enumerate(results):
            tmdb_id = int(entry['tmdb_id'])
            title = entry['title']
            year = entry['year']
            media_type = media_map.get(tmdb_id, 'movie')
            
            # Only refetch if snippet is shorter than 95% of limit
            if len(entry.get('snippet', '')) >= (CHAR_LIMIT * 0.95):
                continue

            print(f"[{i+1}/{len(results)}] Updating {title}...", end="", flush=True)
            
            new_snippet = None
            if media_type != 'tv':
                new_snippet = scrape_imsdb(title)
            
            if not new_snippet:
                new_snippet, _ = fallback_scriptslug(title, year, media_type, tmdb_id)
            
            if new_snippet:
                entry['snippet'] = new_snippet
                print(" ✅ UPDATED")
            else:
                print(" ⏩ SKIPPED (No new text found, keeping old)")
            
            if (i + 1) % SAVE_INTERVAL == 0:
                with open(OUTPUT_FILE, 'w') as f:
                    json.dump(results, f, indent=4)
            time.sleep(0.5)
            
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(results, f, indent=4)
        print("\nRefetch complete.")
        return

    # Standard Scraping Mode
    processed_ids = {r['tmdb_id'] for r in results}
    df = df_source[~df_source['tmdb_id'].isin(processed_ids)]
    
    if args.type:
        df = df[df['media_type'] == args.type]
        print(f"Filtering for {args.type} only. {len(df)} items to process.")

    success_imsdb, success_slug, fail = 0, 0, 0
    print(f"🚀 Scraping scripts...")

    for i, row in df.iterrows():
        tmdb_id = int(row['tmdb_id'])
        title, year, media_type = row['title'], row['year'], row['media_type']
        print(f"[{i+1}/{len(df_source)}] {title} ({year})...", end="", flush=True)
        
        snippet = None
        warning_url = None
        
        if media_type != 'tv':
            snippet = scrape_imsdb(title)
            if snippet:
                print(" ✅ IMSDB")
                success_imsdb += 1
        
        if not snippet:
            snippet, warning_url = fallback_scriptslug(title, row['year'], media_type, tmdb_id)
            if snippet:
                print(" ✅ SLUG")
                success_slug += 1
            elif warning_url:
                print(f" ⚠️ WARNING: Scanned PDF found at {warning_url}. Extract manually!")
                fail += 1
            else:
                print(" ❌ FAIL")
                fail += 1

        if snippet:
            results.append({
                'tmdb_id': tmdb_id,
                'title': title,
                'year': int(year),
                'snippet': snippet
            })

        if len(results) % SAVE_INTERVAL == 0 and len(results) > 0:
            with open(OUTPUT_FILE, 'w') as f:
                json.dump(results, f, indent=4)
        
        # Polite delay
        time.sleep(0.5)

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(results, f, indent=4)
        
    print(f"\nDONE | IMSDb: {success_imsdb} | Slug: {success_slug} | Fail: {fail}")
    print(f"Total results: {len(results)}")

if __name__ == "__main__":
    main()