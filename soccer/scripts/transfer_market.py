import csv
import json
import os
import random

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYER_FILE = os.path.join(BASE_DIR, "lists", "full_player_list.tsv")
OUTPUT_FILE = os.path.join(BASE_DIR, "lists", "league_rosters.json")

POS_MULT = {"FWD": 1.1, "MID": 1.0, "GK": 0.9, "DEF": 0.8}
REGION_MAP = {"Prime": "Prime", "Mediterranean": "Med", "Europe": "Euro", "America": "Backyard"}

# Budgets increased by another $10.0m (Total +$25.0m from original)
TEAMS_DATA_TEMPLATE = [
    # PRIME
    {"name": "Stratton United", "league": "Prime", "budget": 222.0, "identity": "Balanced"},
    {"name": "Haverford Black", "league": "Prime", "budget": 214.0, "identity": "Balanced"},
    {"name": "Stella Grey", "league": "Prime", "budget": 210.0, "identity": "Offense"},
    {"name": "Chateau Roux", "league": "Prime", "budget": 209.0, "identity": "Balanced"},
    {"name": "Glass Castle FC", "league": "Prime", "budget": 197.0, "identity": "Offense"},
    {"name": "Thurston FC East", "league": "Prime", "budget": 193.0, "identity": "Control"},
    {"name": "Thurston FC West", "league": "Prime", "budget": 193.0, "identity": "Control"},
    {"name": "Eisenwald 1900", "league": "Prime", "budget": 184.0, "identity": "Defense"},
    {"name": "Askhatansa", "league": "Prime", "budget": 179.0, "identity": "Offense"},
    {"name": "Cheicester City", "league": "Prime", "budget": 176.0, "identity": "Balanced"},
    {"name": "Barroclaugh Athletic", "league": "Prime", "budget": 168.0, "identity": "Defense"},
    {"name": "Havenpoort FC", "league": "Prime", "budget": 164.0, "identity": "Control"},
    {"name": "Les Brasseurs", "league": "Prime", "budget": 162.0, "identity": "Defense"},
    {"name": "Corsaires de Calais", "league": "Prime", "budget": 154.0, "identity": "Offense"},
    {"name": "Stedham Journeymen", "league": "Prime", "budget": 151.0, "identity": "Control"},
    {"name": "Celtic Cross FC", "league": "Prime", "budget": 151.0, "identity": "Balanced"},
    # MED
    {"name": "Imperiale Roma", "league": "Med", "budget": 202.0, "identity": "Balanced"},
    {"name": "Castellano Madrid", "league": "Med", "budget": 195.0, "identity": "Balanced"},
    {"name": "Al-Qahira FC", "league": "Med", "budget": 192.0, "identity": "Offense"},
    {"name": "Fursan al-Arab", "league": "Med", "budget": 191.0, "identity": "Balanced"},
    {"name": "Catalonia Gothic", "league": "Med", "budget": 180.0, "identity": "Control"},
    {"name": "Le Rocher Monaco", "league": "Med", "budget": 176.0, "identity": "Offense"},
    {"name": "Barbary Apes", "league": "Med", "budget": 176.0, "identity": "Defense"},
    {"name": "Olympias Athena", "league": "Med", "budget": 168.0, "identity": "Defense"},
    {"name": "Bosphorus Blue", "league": "Med", "budget": 164.0, "identity": "Control"},
    {"name": "Visconti Serpents", "league": "Med", "budget": 161.0, "identity": "Offense"},
    {"name": "Lisbon United", "league": "Med", "budget": 154.0, "identity": "Control"},
    {"name": "Lions of Carthage", "league": "Med", "budget": 150.0, "identity": "Offense"},
    {"name": "Najm al-Bayda", "league": "Med", "budget": 148.0, "identity": "Balanced"},
    {"name": "Alexandria Faros", "league": "Med", "budget": 141.0, "identity": "Control"},
    {"name": "Damascus Steel", "league": "Med", "budget": 138.0, "identity": "Defense"},
    {"name": "Tripoli Sporting", "league": "Med", "budget": 138.0, "identity": "Balanced"},
    # EURO
    {"name": "Moscow Krepost", "league": "Euro", "budget": 163.0, "identity": "Control"},
    {"name": "Slavutych Kyiv", "league": "Euro", "budget": 157.0, "identity": "Offense"},
    {"name": "Edelweiss Zurich", "league": "Euro", "budget": 155.0, "identity": "Balanced"},
    {"name": "Stockholm United", "league": "Euro", "budget": 154.0, "identity": "Balanced"},
    {"name": "Oslo Vikinger", "league": "Euro", "budget": 145.0, "identity": "Offense"},
    {"name": "Donau Wien", "league": "Euro", "budget": 143.0, "identity": "Control"},
    {"name": "Dunav Belgrade", "league": "Euro", "budget": 143.0, "identity": "Control"},
    {"name": "Sisu Helsinki", "league": "Euro", "budget": 136.0, "identity": "Control"},
    {"name": "Kongens FC", "league": "Euro", "budget": 133.0, "identity": "Balanced"},
    {"name": "Bohemian Gryphons", "league": "Euro", "budget": 131.0, "identity": "Offense"},
    {"name": "Korona Warsaw", "league": "Euro", "budget": 125.0, "identity": "Defense"},
    {"name": "Magyar Huszar", "league": "Euro", "budget": 122.0, "identity": "Defense"},
    {"name": "Bucharest International", "league": "Euro", "budget": 121.0, "identity": "Balanced"},
    {"name": "Sarajevo Grad", "league": "Euro", "budget": 115.0, "identity": "Balanced"},
    {"name": "Reykjavik Isbjorn", "league": "Euro", "budget": 113.0, "identity": "Offense"},
    {"name": "Slavia Tatry", "league": "Euro", "budget": 113.0, "identity": "Defense"},
    # BACKYARD
    {"name": "New York Empire", "league": "Backyard", "budget": 183.0, "identity": "Control"},
    {"name": "Los Angeles Syndicate", "league": "Backyard", "budget": 176.0, "identity": "Control"},
    {"name": "Las Vegas Mirage", "league": "Backyard", "budget": 173.0, "identity": "Balanced"},
    {"name": "Chicago Surge", "league": "Backyard", "budget": 172.0, "identity": "Balanced"},
    {"name": "Boston Rebellion", "league": "Backyard", "budget": 163.0, "identity": "Balanced"},
    {"name": "Toronto Blizzard", "league": "Backyard", "budget": 159.0, "identity": "Defense"},
    {"name": "Mexico City Sol", "league": "Backyard", "budget": 159.0, "identity": "Offense"},
    {"name": "Seattle Echo", "league": "Backyard", "budget": 152.0, "identity": "Balanced"},
    {"name": "Philadelphia Spirit", "league": "Backyard", "budget": 148.0, "identity": "Defense"},
    {"name": "Dallas Flare", "league": "Backyard", "budget": 146.0, "identity": "Offense"},
    {"name": "San Jose Relampago", "league": "Backyard", "budget": 139.0, "identity": "Offense"},
    {"name": "Montreal Coureurs", "league": "Backyard", "budget": 136.0, "identity": "Control"},
    {"name": "Tijuana Vaqueros", "league": "Backyard", "budget": 135.0, "identity": "Balanced"},
    {"name": "Washington Justice", "league": "Backyard", "budget": 128.0, "identity": "Control"},
    {"name": "Detroit Firebirds", "league": "Backyard", "budget": 126.0, "identity": "Offense"},
    {"name": "Denver Torrent", "league": "Backyard", "budget": 126.0, "identity": "Defense"}
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
    return 1.5 + (0.05 * max(0, rating - 21)**2)

def get_tax(player_region, team_league):
    reg = "Prime" if player_region == "Prime" else ("Med" if player_region == "Mediterranean" else ("Euro" if player_region == "Europe" else ("Backyard" if player_region == "America" else "International")))
    if reg == team_league: return 0.0
    if reg == "International": return 1.5
    return 3.0

def calculate_bid(player, team, needs):
    # 1. VALUATION
    sh_b = player["sh"] + (2 if team["identity"] == "Offense" else 0) + (1 if team["identity"] == "Balanced" else 0)
    sp_b = player["sp"] + (2 if team["identity"] == "Control" else 0) + (1 if team["identity"] == "Balanced" else 0)
    df_b = player["df"] + (2 if team["identity"] == "Defense" and player["pos"] != "GK" else 0) + (1 if team["identity"] == "Balanced" else 0)
    gk_b = player["gk"] + (2 if team["identity"] == "Defense" and player["pos"] == "GK" else 0) + (1 if team["identity"] == "Balanced" else 0)
    p_rating = calc_overall(player["pos"], sh_b, sp_b, df_b, gk_b)
    valuation = get_base_price(p_rating) * POS_MULT[player["pos"]]
    
    bid = valuation * random.uniform(1.0, 1.2)
    tax = get_tax(player["region"], team["league"])
    
    # Updated Magic Number: 10/8/6
    f_future = needs["FWD"] - (1 if player["pos"] == "FWD" else 0)
    gk_future = needs["GK"] - (1 if player["pos"] == "GK" else 0)
    o_future = (sum(needs.values()) - 1) - f_future - gk_future
    magic_number = (f_future * 12.0) + (gk_future * 10.0) + (o_future * 8.0)
    
    abs_cap = team["remaining"] - magic_number - tax
    
    if len(team["roster"]) > 0:
        avg_spot = team["remaining"] / sum(needs.values())
        if team["identity"] == "Balanced": abs_cap = min(abs_cap, avg_spot * 1.5)
        else:
            is_spec = (team["identity"] == "Offense" and player["pos"] == "FWD") or \
                      (team["identity"] == "Control" and player["pos"] == "MID") or \
                      (team["identity"] == "Defense" and player["pos"] in ["DEF", "GK"])
            if not is_spec: abs_cap = min(abs_cap, avg_spot * 1.4)

    return max(0, min(bid, abs_cap))

# --- LOAD ---
master_players = []
with open(PLAYER_FILE, "r") as f:
    reader = csv.DictReader(f, delimiter="\t")
    for row in reader:
        p = {
            "name": row["Name"], "pos": row["Position"], "country": row["Country"],
            "region": row.get("Region", "International"),
            "sh": int(float(row.get("Shooting", 0))),
            "sp": int(float(row.get("Speed", 0))),
            "df": int(float(row.get("Defense", 0))),
            "gk": int(float(row.get("Goalkeeping", 0))),
            "taken": False
        }
        p["overall"] = calc_overall(p["pos"], p["sh"], p["sp"], p["df"], p["gk"])
        p["floor"] = get_base_price(p["overall"]) * POS_MULT[p["pos"]]
        # Sorting Priority: FWD +2, MID +1
        p["sort_val"] = p["overall"] + (2.0 if p["pos"] == "FWD" else (1.0 if p["pos"] == "MID" else 0.0))
        master_players.append(p)
master_players.sort(key=lambda x: x["sort_val"], reverse=True)

casey_p = next((p for p in master_players if p["name"] == "Casey Myers-Morgan"), None)

teams = [dict(t) for t in TEAMS_DATA_TEMPLATE]
for t in teams:
    t["roster"] = []
    t["remaining"] = t["budget"]
    t["needs"] = {"FWD": 2, "MID": 3, "DEF": 3, "GK": 1}

nick_team_name = "Unassigned"
jp_team_name = "Unassigned"

# MAIN PASS
for p in master_players:
    if p["name"] == "Casey Myers-Morgan": continue 
    if p["name"] == "Bailey Myers-Morgan":
        print(f"\n--- MANUAL INTERVENTION: {p['name']} ---")
        print(f"Jean-Pierre de Clercq is at: {jp_team_name}")
        print(f"Nick Hamburger is at: {nick_team_name}")
        offers = []
        for t in teams:
            if t["needs"]["MID"] < 2: continue
            tax_bmm = get_tax(p["region"], t["league"])
            tax_casey = get_tax(casey_p["region"], t["league"])
            
            # Reserved for rest of team: 10/8/6 logic
            f_rem = t["needs"]["FWD"]
            gk_rem = t["needs"]["GK"]
            o_rem = (sum(t["needs"].values()) - 2) - f_rem - gk_rem
            magic_number = (f_rem * 12.0) + (gk_rem * 10.0) + (o_rem * 8.0)
            
            abs_cap = t["remaining"] - (casey_p["floor"] + tax_casey) - magic_number - tax_bmm
            bid = min(calculate_bid(p, t, t["needs"]), abs_cap)
            if bid >= p["floor"]:
                desire = (bid + (t["budget"]/11.0) + (3.0 if get_tax(p["region"], t["league"])==0 else 0.0)) * random.uniform(0.9, 1.1)
                offers.append({"team": t, "bid": bid, "desire": desire, "tax": tax_bmm})
        
        offers.sort(key=lambda x: x["desire"], reverse=True)
        for i, o in enumerate(offers[:15]): print(f"{i}: {o['team']['name']} (${o['bid']:.2f}m)")
        choice = int(input("Select index: "))
        winner = offers[choice]
        t_win = winner["team"]
        t_win["remaining"] -= (winner["bid"] + winner["tax"])
        t_win["needs"]["MID"] -= 1
        t_win["roster"].append({"name": p["name"], "pos": "MID", "country": p["country"], "rating": round(p["overall"], 4), "cost": round(winner["bid"], 2)})
        t_win["remaining"] -= (casey_p["floor"] + get_tax(casey_p["region"], t_win["league"]))
        t_win["needs"]["MID"] -= 1
        t_win["roster"].append({"name": "Casey Myers-Morgan", "pos": "MID", "country": casey_p["country"], "rating": round(casey_p["overall"], 4), "cost": round(casey_p["floor"], 2)})
        p["taken"] = True
        casey_p["taken"] = True
        continue

    offers = []
    for t in teams:
        if t["needs"][p["pos"]] == 0: continue
        bid = calculate_bid(p, t, t["needs"])
        if bid >= p["floor"]:
            desire = (bid + (t["budget"]/11.0) + (3.0 if get_tax(p["region"], t["league"])==0 else 0.0)) * random.uniform(0.9, 1.1)
            offers.append({"team": t, "bid": bid, "desire": desire, "tax": get_tax(p["region"], t["league"])})

    if not offers: continue
    offers.sort(key=lambda x: x["desire"], reverse=True)
    winner = offers[0]
    t_win = winner["team"]
    t_win["remaining"] -= (winner["bid"] + winner["tax"])
    t_win["needs"][p["pos"]] -= 1
    t_win["roster"].append({"name": p["name"], "pos": p["pos"], "country": p["country"], "rating": round(p["overall"], 4), "cost": round(winner["bid"], 2)})
    p["taken"] = True
    if p["name"] == "Nick Hamburger": nick_team_name = t_win["name"]
    if p["name"] == "Jean-Pierre de Clercq": jp_team_name = t_win["name"]

# CLEANUP PASS
print("\nFinalizing rosters...")
for t in teams:
    for pos in ["FWD", "GK", "MID", "DEF"]:
        while t["needs"][pos] > 0:
            assigned = False
            for p in master_players:
                if p["taken"] or p["pos"] != pos: continue
                tax = get_tax(p["region"], t["league"])
                
                # Check 10/8/6 reserve for future cleanup players
                f_f = t["needs"]["FWD"] - (1 if pos == "FWD" else 0)
                gk_f = t["needs"]["GK"] - (1 if pos == "GK" else 0)
                o_f = (sum(t["needs"].values()) - 1) - f_f - gk_f
                reserve = (f_f * 12.0) + (gk_f * 10.0) + (o_f * 8.0)
                
                if t["remaining"] >= (p["floor"] + tax + reserve):
                    t["remaining"] -= (p["floor"] + tax)
                    t["needs"][pos] -= 1
                    t["roster"].append({"name": p["name"], "pos": p["pos"], "country": p["country"], "rating": round(p["overall"], 4), "cost": round(p["floor"], 2)})
                    p["taken"] = True
                    assigned = True
                    if t["needs"][pos] == 0: break
            if not assigned:
                print(f"CRITICAL ERROR: {t['name']} cannot find an affordable {pos}! (Cash: {t['remaining']:.2f})")
                break

final_output = []
for t in teams:
    final_output.append({"team": t["name"], "league": t["league"], "identity": t["identity"], "budget": t["budget"], "spent": round(t["budget"] - t["remaining"], 2), "roster": t["roster"]})
with open(OUTPUT_FILE, "w") as f: json.dump(final_output, f, indent=4)
print("\nAuction complete.")
