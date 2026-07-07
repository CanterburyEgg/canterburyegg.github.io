import os
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOURNAMENTS_DIR = os.path.join(BASE_DIR, "Tournaments")

def convert_teams():
    count = 0
    leagues = ["Backyard", "Euro", "Med", "Prime"]
    for league in leagues:
        league_path = os.path.join(TOURNAMENTS_DIR, "2025", league, "Teams")
        if not os.path.exists(league_path): continue

        for file in os.listdir(league_path):
            if file.endswith(".txt"):
                txt_path = os.path.join(league_path, file)
                json_path = txt_path.replace(".txt", ".json")

                try:
                    with open(txt_path, 'r') as f:
                        lines = [line.strip() for line in f.readlines() if line.strip()]

                    if len(lines) < 5: continue

                    player_lines = lines[:-4]
                    ratings = lines[-4:]

                    players = []
                    last_prop = 0
                    for line in player_lines:
                        parts = line.split('\t')
                        name = parts[0]
                        cumulative_prop = int(parts[1])
                        weight = cumulative_prop - last_prop
                        last_prop = cumulative_prop

                        players.append({
                            "name": name,
                            "shot_prop": weight,
                            "assist_prop": 0,
                            "stop_prop": 0
                        })

                    team_data = {
                        "name": file.replace(".txt", ""),
                        "ratings": {
                            "offense": int(ratings[0]),
                            "speed": int(ratings[1]),
                            "defense": int(ratings[2]),
                            "gk": int(ratings[3])
                        },
                        "players": players
                    }

                    with open(json_path, 'w') as f:
                        json.dump(team_data, f, indent=2)
                    count += 1
                except Exception as e:
                    print(f"Error converting {txt_path}: {e}")

                        
    print(f"Successfully converted {count} teams to JSON.")

if __name__ == "__main__":
    convert_teams()
