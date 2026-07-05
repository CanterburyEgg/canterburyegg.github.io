import random
from collections import Counter

# --- CONFIGURATION ---
POS_MULT = {"FWD": 1.1, "MID": 1.0, "GK": 0.9, "DEF": 0.8}

TEAMS_DATA = [
    # PRIME
    {"name": "Stratton United", "league": "Prime", "budget": 197.0, "identity": "Balanced"},
    {"name": "Haverford Black", "league": "Prime", "budget": 189.0, "identity": "Balanced"},
    {"name": "Stella Grey", "league": "Prime", "budget": 185.0, "identity": "Offense"},
    {"name": "Chateau Roux", "league": "Prime", "budget": 184.0, "identity": "Balanced"},
    {"name": "Glass Castle FC", "league": "Prime", "budget": 172.0, "identity": "Offense"},
    {"name": "Thurston FC East", "league": "Prime", "budget": 168.0, "identity": "Control"},
    {"name": "Thurston FC West", "league": "Prime", "budget": 168.0, "identity": "Control"},
    {"name": "Eisenwald 1900", "league": "Prime", "budget": 159.0, "identity": "Defense"},
    {"name": "Askhatansa", "league": "Prime", "budget": 154.0, "identity": "Offense"},
    {"name": "Cheicester City", "league": "Prime", "budget": 151.0, "identity": "Balanced"},
    {"name": "Barroclaugh Athletic", "league": "Prime", "budget": 143.0, "identity": "Defense"},
    {"name": "Havenpoort FC", "league": "Prime", "budget": 139.0, "identity": "Control"},
    {"name": "Les Brasseurs", "league": "Prime", "budget": 137.0, "identity": "Defense"},
    {"name": "Corsaires de Calais", "league": "Prime", "budget": 129.0, "identity": "Offense"},
    {"name": "Stedham Journeymen", "league": "Prime", "budget": 126.0, "identity": "Control"},
    {"name": "Celtic Cross FC", "league": "Prime", "budget": 126.0, "identity": "Balanced"},
    # MED
    {"name": "Imperiale Roma", "league": "Med", "budget": 177.0, "identity": "Balanced"},
    {"name": "Castellano Madrid", "league": "Med", "budget": 170.0, "identity": "Balanced"},
    {"name": "Al-Qahira FC", "league": "Med", "budget": 167.0, "identity": "Offense"},
    {"name": "Fursan al-Arab", "league": "Med", "budget": 166.0, "identity": "Balanced"},
    {"name": "Catalonia Gothic", "league": "Med", "budget": 155.0, "identity": "Control"},
    {"name": "Le Rocher Monaco", "league": "Med", "budget": 151.0, "identity": "Offense"},
    {"name": "Barbary Apes", "league": "Med", "budget": 151.0, "identity": "Defense"},
    {"name": "Olympias Athena", "league": "Med", "budget": 143.0, "identity": "Defense"},
    {"name": "Bosphorus Blue", "league": "Med", "budget": 139.0, "identity": "Control"},
    {"name": "Visconti Serpents", "league": "Med", "budget": 136.0, "identity": "Offense"},
    {"name": "Lisbon United", "league": "Med", "budget": 129.0, "identity": "Control"},
    {"name": "Lions of Carthage", "league": "Med", "budget": 125.0, "identity": "Offense"},
    {"name": "Najm al-Bayda", "league": "Med", "budget": 123.0, "identity": "Balanced"},
    {"name": "Alexandria Faros", "league": "Med", "budget": 116.0, "identity": "Control"},
    {"name": "Damascus Steel", "league": "Med", "budget": 113.0, "identity": "Defense"},
    {"name": "Tripoli Sporting", "league": "Med", "budget": 113.0, "identity": "Balanced"},
    # EURO
    {"name": "Moscow Krepost", "league": "Euro", "budget": 138.0, "identity": "Control"},
    {"name": "Slavutych Kyiv", "league": "Euro", "budget": 132.0, "identity": "Offense"},
    {"name": "Edelweiss Zurich", "league": "Euro", "budget": 130.0, "identity": "Balanced"},
    {"name": "Stockholm United", "league": "Euro", "budget": 129.0, "identity": "Balanced"},
    {"name": "Oslo Vikinger", "league": "Euro", "budget": 120.0, "identity": "Offense"},
    {"name": "Donau Wien", "league": "Euro", "budget": 118.0, "identity": "Control"},
    {"name": "Dunav Belgrade", "league": "Euro", "budget": 118.0, "identity": "Control"},
    {"name": "Sisu Helsinki", "league": "Euro", "budget": 111.0, "identity": "Control"},
    {"name": "Kongens FC", "league": "Euro", "budget": 108.0, "identity": "Balanced"},
    {"name": "Bohemian Gryphons", "league": "Euro", "budget": 106.0, "identity": "Offense"},
    {"name": "Korona Warsaw", "league": "Euro", "budget": 100.0, "identity": "Defense"},
    {"name": "Magyar Huszar", "league": "Euro", "budget": 97.0, "identity": "Defense"},
    {"name": "Bucharest International", "league": "Euro", "budget": 96.0, "identity": "Balanced"},
    {"name": "Sarajevo Grad", "league": "Euro", "budget": 90.0, "identity": "Balanced"},
    {"name": "Reykjavik Isbjorn", "league": "Euro", "budget": 88.0, "identity": "Offense"},
    {"name": "Slavia Tatry", "league": "Euro", "budget": 88.0, "identity": "Defense"},
    # BACKYARD
    {"name": "New York Empire", "league": "Backyard", "budget": 158.0, "identity": "Control"},
    {"name": "Los Angeles Syndicate", "league": "Backyard", "budget": 151.0, "identity": "Control"},
    {"name": "Las Vegas Mirage", "league": "Backyard", "budget": 148.0, "identity": "Balanced"},
    {"name": "Chicago Surge", "league": "Backyard", "budget": 147.0, "identity": "Balanced"},
    {"name": "Boston Rebellion", "league": "Backyard", "budget": 138.0, "identity": "Balanced"},
    {"name": "Toronto Blizzard", "league": "Backyard", "budget": 134.0, "identity": "Defense"},
    {"name": "Mexico City Sol", "league": "Backyard", "budget": 134.0, "identity": "Offense"},
    {"name": "Seattle Echo", "league": "Backyard", "budget": 127.0, "identity": "Balanced"},
    {"name": "Philadelphia Spirit", "league": "Backyard", "budget": 123.0, "identity": "Defense"},
    {"name": "Dallas Flare", "league": "Backyard", "budget": 121.0, "identity": "Offense"},
    {"name": "San Jose Relampago", "league": "Backyard", "budget": 114.0, "identity": "Offense"},
    {"name": "Montreal Coureurs", "league": "Backyard", "budget": 111.0, "identity": "Control"},
    {"name": "Tijuana Vaqueros", "league": "Backyard", "budget": 110.0, "identity": "Balanced"},
    {"name": "Washington Justice", "league": "Backyard", "budget": 103.0, "identity": "Control"},
    {"name": "Detroit Firebirds", "league": "Backyard", "budget": 101.0, "identity": "Offense"},
    {"name": "Denver Torrent", "league": "Backyard", "budget": 101.0, "identity": "Defense"}
]

def calc_overall(pos, sh, sp, df, gk):
    if pos == "FWD": val = ((sh * 3) + sp) / 4.0
    elif pos == "MID": val = (sh + (sp * 2) + df) / 4.0
    elif pos == "DEF": val = (sh + (sp * 2) + (df * 3)) / 6.0
    else: val = (df + (gk * 4)) / 5.0
    val += sh/100.0 if pos=="FWD" else (sp/100.0 if pos=="MID" else (df/100.0 if pos=="DEF" else gk/100.0))
    val += sp/10000.0 if pos=="FWD" else (sh/10000.0 if pos=="MID" else sp/10000.0)
    return val

def get_base_price(rating):
    return 1.0 + (0.05 * max(0, rating - 24)**2)

def calculate_bid(player, team, current_budget):
    # 1. VALUATION (with +2 buff)
    sh_b = player["sh"] + (2 if team["identity"] == "Offense" else 0)
    sp_b = player["sp"] + (2 if team["identity"] == "Control" else 0)
    p_rating = calc_overall(player["pos"], sh_b, sp_b, 0, 0)
    valuation = get_base_price(p_rating) * POS_MULT["FWD"]
    
    # 2. MANAGER ROLL (1.0 to 1.2) - No underbidding
    manager_roll = random.uniform(1.0, 1.2)
    bid = valuation * manager_roll
    
    # 3. AFFORDABILITY CAP (Pick 1 logic: Leave 32m floor)
    tax = 0.0 if team["league"] == "Prime" else 2.5
    cap = current_budget - 32.0 - tax
    
    return max(0, min(bid, cap))

def run_test():
    top_p = {"name": "Jean-Pierre de Clercq", "pos": "FWD", "region": "Prime", "sh": 50, "sp": 48}
    winners = []
    winning_prices = []
    
    for _ in range(1000):
        offers = []
        for t in TEAMS_DATA:
            bid = calculate_bid(top_p, t, t["budget"])
            if bid > 0:
                # 4. PLAYER DESIRE CALC
                # (Bid + Prestige + Region Bonus) * Random(0.9, 1.1)
                prestige = t["budget"] / 11.0
                region_bonus = 3.0 if top_p["region"] == t["league"] else 0.0
                desire = (bid + prestige + region_bonus) * random.uniform(0.9, 1.1)
                offers.append({"team": t, "bid": bid, "desire": desire})
        
        if not offers: continue
        offers.sort(key=lambda x: x["desire"], reverse=True)
        
        winner = offers[0]
        winners.append(winner["team"]["name"])
        winning_prices.append(winner["bid"])
    
    avg_price = sum(winning_prices) / 1000.0
    counts = Counter(winners).most_common(64)
    
    print(f"\nAvg Selling Price: ${avg_price:.2f}m")
    print("--- DE CLERCQ LOTTERY (PLAYER DESIRE MODEL) ---")
    for idx, (team, count) in enumerate(counts):
        print(f"{idx+1}. {team}: {count/10.0}%")
    print("------------------------------------------------\n")

if __name__ == "__main__":
    run_test()
