import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Build a comprehensive NAME_TO_ID map from teams.json
NAME_TO_ID = {}
teams_path = os.path.join(SCRIPT_DIR, "teams.json")
with open(teams_path, 'r') as f:
    teams_data = json.load(f)
    for team in teams_data:
        NAME_TO_ID[team['name']] = team['id']
        NAME_TO_ID[team['id']] = team['id']
        if "past_names" in team:
            for past in team["past_names"]:
                NAME_TO_ID[past] = team['id']

def parse_divisions(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    years_data = {}
    current_year = None
    current_div = None
    
    for line in content.split('\n'):
        line = line.strip()
        if not line: continue
        
        if line.isdigit():
            current_year = line
            years_data[current_year] = {"divisions": {}, "conferences": {"National Conference": [], "American Conference": []}}
        elif line.startswith('==='):
            current_div = line.replace('===', '')
            years_data[current_year]["divisions"][current_div] = []
            
            # Assign to conference based on prefix or year-specific rules
            if current_div.startswith('NC') or current_div == "North":
                years_data[current_year]["conferences"]["National Conference"].append(current_div)
            elif current_div.startswith('AC') or current_div == "South":
                years_data[current_year]["conferences"]["American Conference"].append(current_div)
        elif current_year and current_div:
            name = line
            team_id = NAME_TO_ID.get(name, name)
            years_data[current_year]["divisions"][current_div].append(team_id)
            
    return years_data

lists_dir = os.path.join(os.path.dirname(os.path.dirname(SCRIPT_DIR)), "lists")
raw_data = parse_divisions(os.path.join(lists_dir, 'bfl_divisions.txt'))

# Extract 2025 for current structure
structure_2025 = {
    "divisions": raw_data["2025"]["divisions"],
    "conferences": raw_data["2025"]["conferences"]
}

final_output = {
    "historical": raw_data,
    "current": structure_2025
}

output_path = os.path.join(SCRIPT_DIR, 'divisions.json')
with open(output_path, 'w') as f:
    json.dump(final_output, f, indent=2)

print("Processed divisions to divisions.json")
