import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_FILE = os.path.join(BASE_DIR, "lists", "league_rosters.json")
OUTPUT_FILE = os.path.join(BASE_DIR, "lists", "player_names.txt")

if not os.path.exists(INPUT_FILE):
    print(f"Error: {INPUT_FILE} not found. Run the transfer market script first.")
else:
    with open(INPUT_FILE, "r") as f:
        data = json.load(f)

    names = []
    for team in data:
        for player in team["roster"]:
            names.append(player["name"])

    with open(OUTPUT_FILE, "w") as f:
        f.write("\n".join(names))

    print(f"Successfully exported {len(names)} names to {OUTPUT_FILE}")
