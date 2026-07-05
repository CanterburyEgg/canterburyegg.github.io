import csv
import json
import os

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROSTERS_FILE = os.path.join(BASE_DIR, "lists", "source_rosters.tsv")
STATS_FILE = os.path.join(BASE_DIR, "lists", "team_stats.tsv")
OUTPUT_BASE = os.path.join(BASE_DIR, "Tournaments", "2025")

POS_ORDER = {"FWD": 0, "MID": 1, "DEF": 2, "GK": 3}

def build_world():
    if not os.path.exists(ROSTERS_FILE) or not os.path.exists(STATS_FILE):
        print("Error: Required TSV files not found in soccer/lists/")
        return

    # 1. Load Team Stats
    rankings = {}
    with open(STATS_FILE, 'r') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            rankings[row["Team"]] = [row["Off Rtg"], row["Spd Rtg"], row["Def Rtg"], row["GK Rtg"]]

    # 2. Load and Group Rosters
    teams = {}
    with open(ROSTERS_FILE, 'r') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            t_name = row["Team"]
            l_name = row["League"]
            if t_name not in teams:
                teams[t_name] = {"league": l_name, "players": []}
            
            teams[t_name]["players"].append({
                "name": row["Player Name"],
                "pos": row["Position"],
                "prop": int(row["Shot Prop"])
            })

    # 3. Create Directories and Files
    leagues = set(t["league"] for t in teams.values())
    for league in leagues:
        l_dir = os.path.join(OUTPUT_BASE, league)
        t_dir = os.path.join(l_dir, "Teams")
        os.makedirs(t_dir, exist_ok=True)
        
        league_teams = sorted([name for name, data in teams.items() if data["league"] == league])
        config = {
            "name": f"2025 {league} League",
            "type": "league",
            "groups": {"A": league_teams},
            "rules": {"rounds": 2}
        }
        with open(os.path.join(l_dir, "config.json"), 'w') as f:
            json.dump(config, f, indent=4)

    # 4. Write Team .txt files
    for t_name, data in teams.items():
        l_name = data["league"]
        
        # SORTING LOGIC:
        # Primary: Position (FWD -> MID -> DEF -> GK)
        # Secondary: Shot Prop (Descending)
        sorted_players = sorted(
            data["players"], 
            key=lambda x: (POS_ORDER.get(x["pos"], 99), -x["prop"])
        )
        
        player_lines = [f"{p['name']}\t{p['prop']}" for p in sorted_players]
        ranks = rankings.get(t_name, ["5", "5", "5", "5"])
        
        content = player_lines + ranks
        
        file_path = os.path.join(OUTPUT_BASE, l_name, "Teams", f"{t_name}.txt")
        with open(file_path, 'w') as f:
            f.write("\n".join(content))

    print(f"2025 World Built Successfully at {OUTPUT_BASE}")

if __name__ == "__main__":
    build_world()
