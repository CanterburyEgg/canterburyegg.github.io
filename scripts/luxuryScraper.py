from playwright.sync_api import sync_playwright
import json
import os
import time
import random

# --- CONFIGURATION ---
TARGET_PER_GENDER = 3650
FULL_PAGE_THRESHOLD = 120 

DESIGNERS_MEN = ["gucci", "balenciaga", "the-row", "rick-owens", "prada", "saint-laurent", "bottega-veneta", "loewe", "thom-browne", "valentino"]
DESIGNERS_WOMEN = ["gucci", "miu-miu", "prada", "the-row", "balenciaga", "jacquemus", "saint-laurent", "bottega-veneta", "loewe", "chloe"]

def save_and_count(items, filename):
    if not os.path.exists(filename):
        with open(filename, 'w') as f: json.dump([], f)
    with open(filename, 'r') as f:
        try: existing = json.load(f)
        except: existing = []
    
    existing_ids = {item['id'] for item in existing}
    new_added = 0
    for item in items:
        if item['id'] not in existing_ids:
            existing.append(item)
            new_added += 1
            
    with open(filename, 'w') as f:
        json.dump(existing, f, indent=4)
    return len(existing), new_added

def scrape_url(page, url):
    print(f"Accessing: {url}")
    try:
        time.sleep(random.uniform(2, 4))
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        
        # Anti-bot detection
        if "Access Denied" in page.title() or page.query_selector("text=Press and Hold"):
            print("!!! CAPTCHA DETECTED !!! Solve it manually in the window...")
            page.wait_for_selector('script[type="application/ld+json"]', timeout=120000)

        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(2) 
        
        scripts = page.query_selector_all('script[type="application/ld+json"]')
        found = []
        for s in scripts:
            try:
                data = json.loads(s.inner_text())
                if data.get('@type') == 'Product':
                    found.append({
                        "brand": data.get('brand', {}).get('name'),
                        "name": data.get('name'),
                        "price": data.get('offers', {}).get('price'),
                        "image": data.get('image'),
                        "id": data.get('productID'),
                        "url": "https://www.ssense.com" + data.get('url', '')
                    })
            except: continue
        return found
    except Exception as e:
        print(f"Error scraping {url}: {e}")
        return []

def run_collection():
    filename = "master_luxury_database.json"
    user_data_dir = os.path.join(os.getcwd(), "browser_data")
    
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir,
            headless=False,
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            args=["--disable-blink-features=AutomationControlled"]
        )
        page = context.pages[0]
        page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")

        for gender, designer_list, trend_url in [
            ("Men", DESIGNERS_MEN, "https://www.ssense.com/en-us/men?sort=popularity-desc"),
            ("Women", DESIGNERS_WOMEN, "https://www.ssense.com/en-us/women?sort=popularity-desc")
        ]:
            print(f"\n=== STARTING {gender.upper()} COLLECTION ===")
            
            for designer in designer_list:
                for p_num in range(1, 6):
                    d_url = f"https://www.ssense.com/en-us/{gender.lower()}/designers/{designer}?page={p_num}"
                    items = scrape_url(page, d_url)
                    
                    # Logic: If 0 items, we definitely hit the end. 
                    # If items < FULL_PAGE_THRESHOLD, it's the final page of that designer.
                    if not items:
                        print(f"[{designer}] No items found on Page {p_num}. Breaking designer loop.")
                        break

                    total, added = save_and_count(items, filename)
                    print(f"[{designer}] Page {p_num}: Added {added}. Total in DB: {total}")

                    if len(items) < FULL_PAGE_THRESHOLD:
                        print(f"[{designer}] Page {p_num} only has {len(items)} items. Reached the end.")
                        break

            # 2. Trending Backfill
            current_total, _ = save_and_count([], filename)
            trend_page = 1
            target = TARGET_PER_GENDER if gender == "Men" else TARGET_PER_GENDER * 2
            
            while current_total < target:
                t_url = f"{trend_url}&page={trend_page}"
                items = scrape_url(page, t_url)
                if not items: break
                current_total, added = save_and_count(items, filename)
                print(f"[Trending {gender}] Page {trend_page}: Added {added}. Total in DB: {current_total}")
                trend_page += 1
                if trend_page > 160: break

        context.close()

if __name__ == "__main__":
    run_collection()