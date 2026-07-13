import json
import os
import csv
import random

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAYER_FILE = os.path.join(BASE_DIR, "lists", "full_player_list.tsv")
ROSTERS_FILE = os.path.join(BASE_DIR, "lists", "league_rosters.json")

def get_weighted_age(group):
    # 1. Veteran class (15% chance, tapering 35 to 40)
    if random.random() < 0.15:
        # beta(1, 3) creates a steep downward taper from 35 to 40
        return min(35 + int(random.betavariate(1, 3) * 6.5), 40)
    
    # 2. Standard class (85% chance, peak at 29)
    # Range is [Low] to 35. Max val of int(beta * 16) is 15.
    if group == "2022":
        low, high = 24, 36
    elif group == "2024":
        low, high = 22, 36
    else:
        low, high = 20, 36
        
    spread = high - low
    # Calculate alpha/beta to put the peak at 29
    # For Beta, mode = (alpha - 1) / (alpha + beta - 2)
    # If we fix alpha=4, we can solve for beta to peak at the relative mode
    rel_mode = (29 - low) / spread
    # beta = ((alpha - 1) / rel_mode) - alpha + 2
    alpha = 2.5
    beta = ((alpha - 1.0) / rel_mode) - alpha + 2.0
    
    return low + int(random.betavariate(alpha, beta) * spread)

def get_players_from_results(path):
    players = set()
    if not os.path.exists(path): return players
    try:
        with open(path, "r") as f:
            data = json.load(f)
            if "groups" in data:
                for group in data["groups"].values():
                    if "matches" in group:
                        for match in group["matches"]:
                            if "player_data" in match:
                                for side in ["team1", "team2"]:
                                    for p in match["player_data"].get(side, []):
                                        players.add(p["name"])
    except: pass
    return players

def main():
    players_2022 = set()
    players_2024 = set()
    dir_2022 = os.path.join(BASE_DIR, "Tournaments", "2022")
    for root, dirs, files in os.walk(dir_2022):
        if "results.json" in files:
            players_2022.update(get_players_from_results(os.path.join(root, "results.json")))
    dir_2024 = os.path.join(BASE_DIR, "Tournaments", "2024")
    for root, dirs, files in os.walk(dir_2024):
        if "results.json" in files:
            players_2024.update(get_players_from_results(os.path.join(root, "results.json")))

    overrides = {
        "Bailey Myers-Morgan": 32, "Nick Hamburger": 32, "Jonathan Carmichael": 32,
        "Casey Myers-Morgan": 30, "Dylan Werth": 30
    }

    all_players = []
    with open(PLAYER_FILE, "r") as f:
        reader = csv.DictReader(f, delimiter="\t")
        fieldnames = reader.fieldnames
        if "Age" not in fieldnames: fieldnames.append("Age")
        for row in reader:
            name = row["Name"]
            if name in overrides:
                row["Age"] = overrides[name]
            else:
                if name in players_2022: group = "2022"
                elif name in players_2024: group = "2024"
                else: group = "other"
                row["Age"] = get_weighted_age(group)
            all_players.append(row)

    with open(PLAYER_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter="\t")
        writer.writeheader()
        writer.writerows(all_players)

    age_map = {p["Name"]: p["Age"] for p in all_players}
    if os.path.exists(ROSTERS_FILE):
        with open(ROSTERS_FILE, "r") as f:
            rosters = json.load(f)
        for team in rosters:
            for p in team["roster"]:
                p["age"] = age_map.get(p["name"], 25)
        with open(ROSTERS_FILE, "w") as f:
            json.dump(rosters, f, indent=4)

    print("Ages re-injected with Pure-Beta distribution (Peak 29).")

if __name__ == "__main__":
    main()
