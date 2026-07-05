import json
import csv
import os

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_FILE = os.path.join(BASE_DIR, "lists", "league_rosters.json")
OUTPUT_FILE = os.path.join(BASE_DIR, "lists", "league_rosters.tsv")

def convert():
    if not os.path.exists(INPUT_FILE):
        print(f"Error: {INPUT_FILE} not found.")
        return

    with open(INPUT_FILE, 'r') as f:
        data = json.load(f)

    # Define headers
    headers = [
        "Team", "League", "Identity", "Budget", "Spent", 
        "Player Name", "Position", "Country", "Rating", "Cost"
    ]

    with open(OUTPUT_FILE, 'w', newline='') as f:
        writer = csv.writer(f, delimiter='	')
        writer.writerow(headers)

        for team in data:
            # Shared team info
            team_info = [
                team["team"],
                team["league"],
                team["identity"],
                team["budget"],
                team["spent"]
            ]

            for player in team["roster"]:
                # Combine team info with player specific info
                row = team_info + [
                    player["name"],
                    player["pos"],
                    player.get("country", "Unknown"),
                    player["rating"],
                    player["cost"]
                ]
                writer.writerow(row)

    print(f"Successfully converted {INPUT_FILE} to {OUTPUT_FILE}")

if __name__ == "__main__":
    convert()
