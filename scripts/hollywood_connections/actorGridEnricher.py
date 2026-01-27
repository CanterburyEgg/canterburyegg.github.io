import pandas as pd
from curl_cffi import requests 
from bs4 import BeautifulSoup
import re
import time
import urllib.parse

# --- CONFIG ---
INPUT_FILE = 'lists/top_600_stripped.csv'
OUTPUT_FILE = 'lists/top_600_enriched.csv'

def clean_text(text):
    if not text: return "None"
    # Remove bracketed and parenthetical junk like [m. 2024] or (2 children)
    text = re.sub(r'\[.*?\]', '', text) 
    text = re.sub(r'\(.*?\)', '', text) 
    return " ".join(text.split()).strip()

def get_imdb_data(name):
    """Back to the flexible label-based search that worked."""
    search_url = f"https://www.imdb.com/find?q={urllib.parse.quote(name)}&s=nm"
    data = {"height": "None", "spouse": "None"}
    try:
        r = requests.get(search_url, impersonate="chrome110", timeout=15)
        soup = BeautifulSoup(r.text, 'html.parser')
        result_link = soup.find('a', href=re.compile(r'/name/nm\d+'))
        if not result_link: return data
        
        nm_id = re.search(r'nm\d+', result_link['href']).group()
        r_bio = requests.get(f"https://www.imdb.com/name/{nm_id}/bio", impersonate="chrome110", timeout=15)
        b_soup = BeautifulSoup(r_bio.text, 'html.parser')
        
        # Look for labels anywhere in the list
        for li in b_soup.find_all('li'):
            text = li.get_text()
            
            # Height search
            if "Height" in text and data["height"] == "None":
                match = re.search(r'(\d)\s*(?:\'|ft|′|’)\s*(\d+)', text)
                if match: data["height"] = f"{match.group(1)}ft {match.group(2)}"
            
            # Spouse search (the 'old way' that was working)
            if "Spouse" in text and data["spouse"] == "None":
                # Isolate the name by removing the 'Spouse' label itself
                raw_name = text.replace("Spouse", "").strip()
                data["spouse"] = clean_text(raw_name)
        
        return data
    except: return data

def get_wiki_data(name):
    """Wikipedia is best for Gender and Alma Mater."""
    url = f"https://en.wikipedia.org/wiki/{name.replace(' ', '_')}"
    res = {"gender": "Unknown", "alma_mater": "None"}
    try:
        r = requests.get(url, impersonate="chrome110", timeout=15)
        soup = BeautifulSoup(r.text, 'html.parser')
        bio = soup.get_text()[:3000]
        res["gender"] = "Female" if len(re.findall(r'\b(she|her)\b', bio, re.I)) > len(re.findall(r'\b(he|him)\b', bio, re.I)) else "Male"
        
        infobox = soup.find("table", {"class": ["infobox", "vcard"]})
        if infobox:
            for row in infobox.find_all("tr"):
                th, td = row.find("th"), row.find("td")
                if th and td and any(x in th.get_text().lower() for x in ["alma mater", "education"]):
                    res["alma_mater"] = clean_text(td.get_text(separator=" "))
        return res
    except: return res

# --- RUNNER ---
df = pd.read_csv(INPUT_FILE)
for field in ['height', 'spouse', 'gender', 'alma_mater']:
    if field not in df.columns:
        df[field] = None
        df[field] = df[field].astype(object)

print("Running definitive enrichment (Height | Gender | Alma Mater | Spouse)...")

for i, row in df.iterrows():
    if pd.isna(df.at[i, 'height']):
        name = row['name']
        imdb, wiki = get_imdb_data(name), get_wiki_data(name)
        scraped = {**imdb, **wiki}
        
        for k, v in scraped.items():
            df.at[i, k] = v
        
        print(f"[{i+1}] {name}: {scraped['height']} | {scraped['gender']} | {scraped['alma_mater']} | {scraped['spouse']}")
        
        if (i + 1) % 10 == 0:
            df.to_csv(OUTPUT_FILE, index=False)
        time.sleep(5) 

df.to_csv(OUTPUT_FILE, index=False)