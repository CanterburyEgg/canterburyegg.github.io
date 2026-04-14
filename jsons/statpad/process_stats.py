import json
import os
from collections import defaultdict
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_PATH = "/Users/bmyersmorgan/football-sim/bfl-site/lib/season_data"
YEARS = range(2010, 2026)

# player_db: name -> { "seasons": { year: { team, team_long, pos, stats: {} } } }
player_db = defaultdict(lambda: {"seasons": {}})

# Build a comprehensive NAME_TO_ID map from teams.json
NAME_TO_ID = {}
teams_path = os.path.join(SCRIPT_DIR, "teams.json")
if os.path.exists(teams_path):
    with open(teams_path, 'r') as f:
        teams_data = json.load(f)
        for team in teams_data:
            NAME_TO_ID[team['name']] = team['id']
            NAME_TO_ID[team['id']] = team['id']
            if "past_names" in team:
                for past in team["past_names"]:
                    NAME_TO_ID[past] = team['id']
else:
    # Fallback to building from divisions.json if teams.json is missing
    with open(os.path.join(SCRIPT_DIR, "divisions.json"), 'r') as f:
        div_data = json.load(f)
        for year, data in div_data['historical'].items():
            for conf, divs in data['conferences'].items():
                for div_name in divs:
                    for team_id in data['divisions'][div_name]:
                        NAME_TO_ID[team_id] = team_id

def clean_pos(pos):
    if not pos: return ""
    # Strip numbers (RB1 -> RB)
    p = re.sub(r'\d+', '', pos)
    # Map specialized shorthand to base positions
    if p in ["SWR", "OWR"]: return "WR"
    if p in ["CRB"]: return "RB"
    if p in ["NCB", "OCB"]: return "CB"
    if p in ["MLB", "OLB"]: return "LB"
    return p

for year in YEARS:
    path = os.path.join(BASE_PATH, str(year), "stats.json")
    if not os.path.exists(path):
        continue
        
    with open(path, 'r') as f:
        data = json.load(f)
        
    categories = {
        "passing_stats": "passing",
        "rushing_stats": "rushing",
        "receiving_stats": "receiving",
        "rush_defense_stats": "defense",
        "pass_defense_stats": "defense_pass",
        "kicking_stats": "kicking"
    }
    
    for key, cat in categories.items():
        if key not in data: continue
        for p in data[key]:
            name = p["Player"]
            
            # Find a valid ID by checking both Team (Long) and Team, handling missing keys
            team_id = NAME_TO_ID.get(p.get("Team (Long)"), NAME_TO_ID.get(p.get("Team")))

            if not team_id:
                # print(f"Warning: Could not map team '{p.get('Team (Long)')}' or '{p.get('Team')}' to a canonical ID for {name} in {year}.")
                continue
            
            team_long = p.get("Team (Long)", p.get("Team"))
            pos = clean_pos(p["Pos"])
            
            if year not in player_db[name]["seasons"]:
                player_db[name]["seasons"][year] = {
                    "team": team_id,
                    "team_long": team_long,
                    "pos": pos,
                    "stats": {
                        "pass_yds": 0, "pass_td": 0, "pass_int": 0,
                        "rush_yds": 0, "rush_td": 0,
                        "rec_yds": 0, "rec_td": 0, "rec_count": 0,
                        "fumbles": 0,
                        "tackles": 0, "sacks": 0, "def_int": 0,
                        "fantasy_points": 0
                    }
                }
            
            s = player_db[name]["seasons"][year]["stats"]
            
            # Prefer offensive positions over defensive ones if a player played both
            current_pos = player_db[name]["seasons"][year]["pos"]
            offensive_positions = ["QB", "RB", "WR", "TE"]
            if pos in offensive_positions and current_pos not in offensive_positions:
                player_db[name]["seasons"][year]["pos"] = pos

            if cat in ["passing", "rushing", "receiving", "kicking"]:
                if "Fum" in p:
                    s["fumbles"] = max(s["fumbles"], p["Fum"])

            if cat == "passing":
                s["pass_yds"] = p.get("Yds", 0)
                s["pass_td"] = p.get("TD", 0)
                s["pass_int"] = p.get("Int", 0)
            elif cat == "rushing":
                s["rush_yds"] = p.get("Yds", 0)
                s["rush_td"] = p.get("TD", 0)
            elif cat == "receiving":
                s["rec_yds"] = p.get("Yds", 0)
                s["rec_td"] = p.get("TD", 0)
                s["rec_count"] = p.get("Rec", 0)
            elif cat == "defense":
                s["tackles"] = p.get("Solo", 0) + p.get("Ast", 0)
                s["sacks"] = p.get("Sck", 0)
            elif cat == "defense_pass":
                s["def_int"] = p.get("Int", 0)

    # Final Single-Pass Fantasy Calculation for this year
    for name, p_info in player_db.items():
        if year in p_info["seasons"]:
            s = p_info["seasons"][year]["stats"]
            
            fp = 0
            fp += s["pass_yds"] / 25.0
            fp += s["pass_td"] * 4
            fp += s["pass_int"] * -2
            fp += s["rush_yds"] / 10.0
            fp += s["rush_td"] * 6
            fp += s["rec_count"] * 0.5
            fp += s["rec_yds"] / 10.0
            fp += s["rec_td"] * 6
            fp += s["fumbles"] * -2
            
            s["fantasy_points"] = round(fp, 2)
            s["scrimmage_yds"] = round(s["rush_yds"] + s["rec_yds"], 2)
            s["total_tds"] = s["rush_td"] + s["rec_td"]

output = []
for name, info in player_db.items():
    years_active = sorted(info["seasons"].keys())
    output.append({
        "name": name,
        "years": years_active,
        "seasons": info["seasons"]
    })

output_path = os.path.join(SCRIPT_DIR, "player_stats.json")
with open(output_path, "w") as f:
    json.dump(output, f)

print(f"Processed {len(output)} players. Normalized positions and fixed stat aggregation.")
