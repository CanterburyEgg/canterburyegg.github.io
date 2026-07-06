import os
import re
import json

def parse_roster(path):
    if not os.path.exists(path): return None
    with open(path, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f.readlines() if line.strip()]
    if not lines: return None
    players = []
    for i in range(min(7, len(lines))):
        parts = lines[i].split('	')
        if len(parts) < 2: continue
        players.append({"name": parts[0], "shots": 0, "sogs": 0, "goals": 0, "saves": 0, "goals_against": 0})
    return players

def get_teams_from_filename(filename):
    # 2022 format: Team A_vs_Team B_MM_DD_HH_MM_SS.txt
    if "_vs_" not in filename: return None, None
    parts = filename.replace(".txt", "").split("_vs_")
    t1_name = parts[0].strip()
    
    t2_part = parts[1]
    ts_match = re.search(r"_(\d+_\d+)", t2_part)
    if ts_match:
        t2_name = t2_part[:ts_match.start()].strip()
    else:
        t2_name = t2_part.strip()
    return t1_name, t2_name

def parse_match(file_path, team1_roster, team2_roster):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        lines = content.split('\n')
    
    filename = os.path.basename(file_path)
    t1_name, t2_name = get_teams_from_filename(filename)
    if not t1_name: return None

    match = {
        "id": f"{t1_name}_{t2_name}_{os.path.basename(file_path)}",
        "teams": [t1_name, t2_name],
        "score": [0, 0],
        "pk_score": None,
        "events": [],
        "played": True,
        "stats": {t1_name: {"shots": 0, "sogs": 0, "saves": 0}, t2_name: {"shots": 0, "sogs": 0, "saves": 0}},
        "player_data": {"team1": [dict(p) for p in (team1_roster or [])], "team2": [dict(p) for p in (team2_roster or [])]}
    }

    # Map player names to indices
    t1_map = {p['name']: i for i, p in enumerate(match['player_data']['team1'])}
    t2_map = {p['name']: i for i, p in enumerate(match['player_data']['team2'])}

    for line in lines:
        if "Minute " in line:
            min_match = re.search(r"Minute (\d+):", line)
            if not min_match: continue
            minute = int(min_match.group(1))

            if "GOAL!!!" in line:
                # Example: Akira Maeda GOAL!!! Score: 1-0
                # We need to know which team scored.
                player_part = line.split("GOAL!!!")[0].split(')')[-1].strip()
                if player_part in t1_map:
                    idx = t1_map[player_part]
                    match['player_data']['team1'][idx]['goals'] += 1
                    match['score'][0] += 1
                    match['events'].append({"minute": minute, "team": t1_name, "player": player_part})
                elif player_part in t2_map:
                    idx = t2_map[player_part]
                    match['player_data']['team2'][idx]['goals'] += 1
                    match['score'][1] += 1
                    match['events'].append({"minute": minute, "team": t2_name, "player": player_part})

            if "missed shot" in line:
                player_part = line.split("missed shot")[0].split(')')[-1].strip()
                if player_part in t1_map:
                    match['player_data']['team1'][t1_map[player_part]]['shots'] += 1
                    match['stats'][t1_name]['shots'] += 1
                elif player_part in t2_map:
                    match['player_data']['team2'][t2_map[player_part]]['shots'] += 1
                    match['stats'][t2_name]['shots'] += 1

            if "SAVE!" in line:
                # Example: Koji Suzuki shot on goal. Giorgi Gogoladze SAVE!
                if "shot on goal." in line:
                    parts = line.split("shot on goal.")
                    shooter = parts[0].split(')')[-1].strip()

                    if shooter in t1_map:
                        match['player_data']['team1'][t1_map[shooter]]['shots'] += 1
                        match['player_data']['team1'][t1_map[shooter]]['sogs'] += 1
                        match['stats'][t1_name]['shots'] += 1
                        match['stats'][t1_name]['sogs'] += 1
                        # Attribute save to Team 2 Goalie (idx 6)
                        if len(match['player_data']['team2']) > 6:
                            match['player_data']['team2'][6]['saves'] += 1
                            match['stats'][t2_name]['saves'] += 1
                    elif shooter in t2_map:
                        match['player_data']['team2'][t2_map[shooter]]['shots'] += 1
                        match['player_data']['team2'][t2_map[shooter]]['sogs'] += 1
                        match['stats'][t2_name]['shots'] += 1
                        match['stats'][t2_name]['sogs'] += 1
                        # Attribute save to Team 1 Goalie (idx 6)
                        if len(match['player_data']['team1']) > 6:
                            match['player_data']['team1'][6]['saves'] += 1
                            match['stats'][t1_name]['saves'] += 1

    # Goals against for GKs
    if len(match['player_data']['team1']) > 6:
        match['player_data']['team1'][6]['goals_against'] = match['score'][1]
    if len(match['player_data']['team2']) > 6:
        match['player_data']['team2'][6]['goals_against'] = match['score'][0]

    # PK Score
    final_line = lines[-1].strip() or lines[-2].strip()
    if "(" in final_line and "PK" in final_line:
        pk_m = re.search(r"\((\d+)-(\d+)\s+PK\)", final_line)
        if pk_m:
            match['pk_score'] = [int(pk_m.group(1)), int(pk_m.group(2))]

    return match

def update_standings(standings, match):
    t1, t2 = match['teams']
    s1, s2 = match['score']
    p1, p2 = match.get('pk_score') if match.get('pk_score') else (None, None)

    for t in [t1, t2]:
        if t not in standings:
            standings[t] = {"team": t, "played": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "gd": 0, "pts": 0}
    
    standings[t1]['played'] += 1
    standings[t2]['played'] += 1
    standings[t1]['gf'] += s1
    standings[t1]['ga'] += s2
    standings[t2]['gf'] += s2
    standings[t2]['ga'] += s1
    standings[t1]['gd'] = standings[t1]['gf'] - standings[t1]['ga']
    standings[t2]['gd'] = standings[t2]['gf'] - standings[t2]['ga']

    if p1 is not None:
        if p1 > p2:
            standings[t1]['w'] += 1
            standings[t2]['l'] += 1
        else:
            standings[t2]['w'] += 1
            standings[t1]['l'] += 1
    else:
        if s1 > s2:
            standings[t1]['w'] += 1
            standings[t1]['pts'] += 3
            standings[t2]['l'] += 1
        elif s2 > s1:
            standings[t2]['w'] += 1
            standings[t2]['pts'] += 3
            standings[t1]['l'] += 1
        else:
            standings[t1]['d'] += 1
            standings[t2]['d'] += 1
            standings[t1]['pts'] += 1
            standings[t2]['pts'] += 1

def process_region(region_id, group_dir, knockout_dir):
    print(f"Processing 2022 {region_id}...")
    
    # Load all rosters in the region
    rosters = {}
    for d in [group_dir, knockout_dir]:
        if not d or not os.path.exists(os.path.join(d, "Teams")): continue
        team_dir = os.path.join(d, "Teams")
        for f in os.listdir(team_dir):
            if f.endswith(".txt"):
                team_name = f.replace(".txt", "")
                if team_name not in rosters:
                    rosters[team_name] = parse_roster(os.path.join(team_dir, f))

    # Read groupings from standings.txt
    groups = {}
    standings_path = os.path.join(group_dir, "standings.txt")
    if os.path.exists(standings_path):
        with open(standings_path, 'r') as f:
            content = f.read()
            # Crude parser for the standings.txt format
            current_group = None
            for line in content.split('\n'):
                if line.startswith("Group"):
                    base_group = line.split()[1]
                    current_group = base_group
                    # Handle duplicate group names in standings.txt
                    if current_group in groups:
                        # Try letters B, C, D...
                        suffix_idx = 1
                        while f"{base_group}_{suffix_idx}" in groups:
                            suffix_idx += 1
                        # If base is A and we find another A, make it B, C, etc if they follow pattern
                        # But simplest is just suffix
                        current_group = f"{base_group}_{suffix_idx}"
                    
                    groups[current_group] = []
                elif current_group and line.strip() and not line.startswith("Team") and "\t" in line:
                    team = line.split('	')[0].strip()
                    if team: groups[current_group].append(team)

    results = {
        "name": f"2022 {region_id} Qualifiers",
        "groups": {},
        "playoffs": None,
        "qualified_teams": []
    }

    # Group Stage Matches
    game_dir = os.path.join(group_dir, "Games")
    if os.path.exists(game_dir):
        all_matches = []
        for f in os.listdir(game_dir):
            if f.endswith(".txt"):
                m_path = os.path.join(game_dir, f)
                t1, t2 = get_teams_from_filename(f)
                if not t1: continue
                match_data = parse_match(m_path, rosters.get(t1, []), rosters.get(t2, []))
                if match_data: all_matches.append(match_data)
        
        # SPECIAL CASE: Oceania 2022 Final Playoffs
        if region_id == "Oceania":
            # The two latest Australia vs New Zealand matches are playoffs
            all_matches.sort(key=lambda m: re.search(r"(\d+_\d+_\d+_\d+_\d+)", m['id']).group(0) if re.search(r"(\d+_\d+_\d+_\d+_\d+)", m['id']) else "")
            oceania_playoffs = [m for m in all_matches if set(m['teams']) == {"Australia", "New Zealand"}][-2:]
            # Remove them from the group stage list
            group_matches = [m for m in all_matches if m not in oceania_playoffs]
            all_matches = group_matches
            results["playoffs"] = {
                "type": "bracket",
                "rounds": [
                    {"name": "Round 1", "matches": [oceania_playoffs[0]]},
                    {"name": "Round 2", "matches": [oceania_playoffs[1]]}
                ]
            }
        
        # SPECIAL CASE: Play-In 2022 Stage Separation
        if region_id == "Play-In":
            def get_group(team):
                for gid, tl in groups.items():
                    if team in tl: return gid
                return None
            
            group_matches = []
            ko_matches = []
            for m in all_matches:
                g1 = get_group(m['teams'][0])
                g2 = get_group(m['teams'][1])
                if g1 == g2:
                    group_matches.append(m)
                else:
                    ko_matches.append(m)
            
            all_matches = group_matches
            if ko_matches:
                # Sort by normalized timestamp
                def get_ts(m):
                    ts_m = re.search(r"(\d+)_(\d+)_(\d+)_(\d+)_(\d+)", m['id'])
                    if ts_m:
                        return "_".join([p.zfill(2) for p in ts_m.groups()])
                    return m['id']
                ko_matches.sort(key=get_ts)
                
                # Group into 3 rounds as requested
                results["playoffs"] = {
                    "type": "bracket",
                    "rounds": [
                        {"name": "Round 1", "matches": ko_matches[0:4]},
                        {"name": "Round 2", "matches": ko_matches[4:8]},
                        {"name": "Round 3", "matches": ko_matches[8:10]}
                    ]
                }

        # Sort matches into groups
        for g_id, team_list in groups.items():
            results["groups"][g_id] = {"matches": [], "standings": []}
            g_standings = {}
            for m in all_matches:
                # Cross-group support: if either team is in this group, match belongs here
                if m['teams'][0] in team_list or m['teams'][1] in team_list:
                    results["groups"][g_id]["matches"].append(m)
                    update_standings(g_standings, m)
            
            # Finalize standings: Only include teams that actually belong in this group
            filtered_s = {t: data for t, data in g_standings.items() if t in team_list}
            # Add teams that haven't played
            for t in team_list:
                if t not in filtered_s:
                    filtered_s[t] = {"team": t, "played": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "gd": 0, "pts": 0}
            
            sorted_s = sorted(filtered_s.values(), key=lambda x: (x['pts'], x['gd'], x['gf']), reverse=True)
            results["groups"][g_id]["standings"] = sorted_s

    # Knockout Stage Matches
    if knockout_dir and os.path.exists(knockout_dir):
        ko_game_dir = os.path.join(knockout_dir, "Games")
        if os.path.exists(ko_game_dir):
            ko_matches = []
            for f in os.listdir(ko_game_dir):
                if f.endswith(".txt"):
                    t1, t2 = get_teams_from_filename(f)
                    if not t1: continue
                    m_path = os.path.join(ko_game_dir, f)
                    match_data = parse_match(m_path, rosters.get(t1, []), rosters.get(t2, []))
                    if match_data: ko_matches.append(match_data)
            
            if len(ko_matches) > 0:
                # Helper for normalized timestamp sorting
                def get_ts_norm(m):
                    ts_m = re.search(r"(\d+)_(\d+)_(\d+)_(\d+)_(\d+)", m['id'])
                    if ts_m:
                        return "_".join([p.zfill(2) for p in ts_m.groups()])
                    return m['id']

                if (region_id == "Asia" or region_id == "Africa") and len(ko_matches) == 10:
                    ko_matches.sort(key=get_ts_norm)
                    results["playoffs"] = {
                        "type": "bracket",
                        "rounds": [
                            {"name": "Round 1", "matches": [ko_matches[0], ko_matches[1]]},
                            {"name": "Round 2", "matches": [ko_matches[2], ko_matches[3]]},
                            {"name": "Round 3", "matches": [ko_matches[5], ko_matches[6]]},
                            {"name": "Round 4", "matches": [ko_matches[4], ko_matches[7]]},
                            {"name": "Round 5", "matches": [ko_matches[8]]},
                            {"name": "Round 6", "matches": [ko_matches[9]]}
                        ]
                    }
                elif region_id == "South America" and len(ko_matches) == 5:
                    ko_matches.sort(key=get_ts_norm)
                    results["playoffs"] = {
                        "type": "bracket",
                        "rounds": [
                            {"name": "Round 1", "matches": [ko_matches[0], ko_matches[1]]},
                            {"name": "Round 2", "matches": [ko_matches[2], ko_matches[3]]},
                            {"name": "Round 3", "matches": [ko_matches[4]]}
                        ]
                    }
                elif region_id == "North America" and len(ko_matches) == 4:
                    ko_matches.sort(key=get_ts_norm)
                    results["playoffs"] = {
                        "type": "bracket",
                        "rounds": [
                            {"name": "Round 1", "matches": [ko_matches[0], ko_matches[1]]},
                            {"name": "Round 2", "matches": [ko_matches[2], ko_matches[3]]}
                        ]
                    }
                elif region_id == "Europe" and len(ko_matches) == 21:
                    ko_matches.sort(key=get_ts_norm)
                    results["playoffs"] = {
                        "type": "bracket",
                        "rounds": [
                            {"name": "Round 1", "matches": ko_matches[0:4]},
                            {"name": "Round 2", "matches": ko_matches[4:8]},
                            {"name": "Round 3", "matches": ko_matches[8:14]},
                            {"name": "Round 4", "matches": ko_matches[14:17]},
                            {"name": "Round 5", "matches": ko_matches[17:19]},
                            {"name": "Round 6", "matches": [ko_matches[19]]},
                            {"name": "Round 7", "matches": [ko_matches[20]]}
                        ]
                    }
                else:
                    ko_matches.sort(key=get_ts_norm)
                    results["playoffs"] = {"type": "list", "matches": ko_matches}

    output_path = os.path.join(group_dir, "results.json")
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)

def process_wc(wc_dir):
    print("Processing 2022 World Cup...")
    rosters = {}
    team_dir = os.path.join(wc_dir, "Teams")
    for f in os.listdir(team_dir):
        if f.endswith(".txt"):
            team_name = f.replace(".txt", "")
            rosters[team_name] = parse_roster(os.path.join(team_dir, f))

    groups = {}
    standings_path = os.path.join(wc_dir, "standings.txt")
    with open(standings_path, 'r') as f:
        content = f.read()
        current_group = None
        for line in content.split('\n'):
            if line.startswith("Group"):
                current_group = line.split()[1]
                groups[current_group] = []
            elif current_group and line.strip() and not line.startswith("Team") and "\t" in line:
                team = line.split('\t')[0].strip()
                if team: groups[current_group].append(team)

    results = {
        "name": "2022 FIFA World Cup",
        "groups": {},
        "playoffs": None,
        "qualified_teams": []
    }

    # 1. Collect and sort ALL matches chronologically
    game_dir = os.path.join(wc_dir, "Games")
    raw_matches = []
    for f in os.listdir(game_dir):
        if f.endswith(".txt"):
            t1, t2 = get_teams_from_filename(f)
            if not t1: continue
            match_data = parse_match(os.path.join(game_dir, f), rosters.get(t1, []), rosters.get(t2, []))
            if match_data:
                # Extract and normalize timestamp for sorting: MM_DD_HH_MM_SS
                # We pad single digits to ensure string sort works (e.g. 12_5 -> 12_05)
                ts_m = re.search(r"(\d+)_(\d+)_(\d+)_(\d+)_(\d+)", f)
                if ts_m:
                    parts = [p.zfill(2) for p in ts_m.groups()]
                    match_data['ts'] = "_".join(parts)
                else:
                    match_data['ts'] = f
                raw_matches.append(match_data)
    
    raw_matches.sort(key=lambda x: x['ts'])

    # 2. Split into Group vs Knockout based on team game counts
    group_matches = []
    ko_matches = []
    team_counts = {}

    for m in raw_matches:
        t1, t2 = m['teams']
        c1 = team_counts.get(t1, 0)
        c2 = team_counts.get(t2, 0)
        
        # If both teams are in their first 3 games, it's a group match
        if c1 < 3 and c2 < 3:
            group_matches.append(m)
        else:
            ko_matches.append(m)
        
        team_counts[t1] = c1 + 1
        team_counts[t2] = c2 + 1

    # 3. Process Group Standings
    for g_id, team_list in groups.items():
        results["groups"][g_id] = {"matches": [], "standings": []}
        g_standings = {}
        for m in group_matches:
            if m['teams'][0] in team_list or m['teams'][1] in team_list:
                results["groups"][g_id]["matches"].append(m)
                update_standings(g_standings, m)
        
        filtered_s = {t: data for t, data in g_standings.items() if t in team_list}
        for t in team_list:
            if t not in filtered_s:
                filtered_s[t] = {"team": t, "played": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "gd": 0, "pts": 0}
        
        sorted_s = sorted(filtered_s.values(), key=lambda x: (x['pts'], x['gd'], x['gf']), reverse=True)
        results["groups"][g_id]["standings"] = sorted_s

    # 4. Process Knockout Bracket
    if ko_matches:
        # Sort KO matches into chronological rounds
        rounds = []
        # Total KO matches in 32-team WC = 16 (8 + 4 + 2 + 2)
        # Usually: 8 R16, 4 QF, 2 SF, 2 Finals (incl 3rd place)
        # We'll group them by count since we already sorted by timestamp
        if len(ko_matches) >= 8:
            rounds.append({"name": "Round of 16", "matches": ko_matches[0:8]})
        if len(ko_matches) >= 12:
            rounds.append({"name": "Quarterfinals", "matches": ko_matches[8:12]})
        if len(ko_matches) >= 14:
            rounds.append({"name": "Semifinals", "matches": ko_matches[12:14]})
        if len(ko_matches) > 14:
            rounds.append({"name": "Finals", "matches": ko_matches[14:]})
        elif len(ko_matches) == 1: # Fallback for single match
             rounds.append({"name": "Final", "matches": ko_matches})

        results["playoffs"] = {"type": "bracket", "rounds": rounds}

    with open(os.path.join(wc_dir, "results.json"), 'w') as f:
        json.dump(results, f, indent=2)

    with open(os.path.join(wc_dir, "results.json"), 'w') as f:
        json.dump(results, f, indent=2)

# Run it
base = "soccer/Tournaments/2022"
process_region("Asia", f"{base}/AS", f"{base}/ASk")
process_region("Africa", f"{base}/AFR", f"{base}/AFRk")
process_region("Europe", f"{base}/EU", f"{base}/EUk")
process_region("North America", f"{base}/NA", f"{base}/NAk")
process_region("South America", f"{base}/SA", f"{base}/SAk")
process_region("Oceania", f"{base}/OCE", None)
process_region("Play-In", f"{base}/Play-In", None)
process_wc(f"{base}/World Cup")
