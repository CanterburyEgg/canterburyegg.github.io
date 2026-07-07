import json
import os
import soccer_driver
import sys
import shutil
import random

def get_winner(res):
    if res.get("pk_score"): return res["teams"][0] if res["pk_score"][0] > res["pk_score"][1] else res["teams"][1]
    return res["teams"][0] if res["score"][0] > res["score"][1] else res["teams"][1]

def get_loser(res):
    winner = get_winner(res)
    return res["teams"][0] if res["teams"][1] == winner else res["teams"][1]

def get_series_stats(matches, series_id):
    series_matches = [m for m in matches if m.get("series_id") == series_id and m.get("played") and not m.get("canceled")]
    if not series_matches: return None, 0, 0
    # Use first non-TBD game to determine canonical order
    first = next((m for m in matches if m.get("series_id") == series_id and "TBD" not in m["teams"]), None)
    if not first: return None, 0, 0
    t1, t2 = first["teams"]
    t1_wins, t2_wins = 0, 0
    for m in series_matches:
        w = get_winner(m)
        if w == t1: t1_wins += 1
        elif w == t2: t2_wins += 1
    return (t1, t2), t1_wins, t2_wins

def get_series_winner(matches, series_id, best_of):
    stats = get_series_stats(matches, series_id)
    teams, w1, w2 = stats
    if not teams: return None
    needed = (best_of // 2) + 1
    if w1 >= needed: return teams[0]
    if w2 >= needed: return teams[1]
    return None

def update_standings(standings, result):
    if not result.get("played", True): return
    t1, t2 = result["teams"]
    s1, s2 = result["score"]
    for t in [t1, t2]:
        if t not in standings:
            standings[t] = {"played": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "gd": 0, "pts": 0}
    standings[t1]["played"] += 1
    standings[t2]["played"] += 1
    standings[t1]["gf"] += s1
    standings[t1]["ga"] += s2
    standings[t2]["gf"] += s2
    standings[t2]["ga"] += s1
    standings[t1]["gd"] = standings[t1]["gf"] - standings[t1]["ga"]
    standings[t2]["gd"] = standings[t2]["gf"] - standings[t2]["ga"]
    if s1 > s2:
        standings[t1]["w"] += 1
        standings[t1]["pts"] += 3
        standings[t2]["l"] += 1
    elif s2 > s1:
        standings[t2]["w"] += 1
        standings[t2]["pts"] += 3
        standings[t1]["l"] += 1
    else:
        standings[t1]["d"] += 1
        standings[t2]["d"] += 1
        standings[t1]["pts"] += 1
        standings[t2]["pts"] += 1

def get_h2h_stats(teams, matches):
    h2h = {team: {"pts": 0, "gd": 0, "gf": 0} for team in teams}
    for m in matches:
        if not m.get("played", False): continue
        t1, t2 = m["teams"]
        if t1 in teams and t2 in teams:
            s1, s2 = m["score"]
            h2h[t1]["gf"] += s1
            h2h[t1]["gd"] += (s1 - s2)
            h2h[t2]["gf"] += s2
            h2h[t2]["gd"] += (s2 - s1)
            if s1 > s2:
                h2h[t1]["pts"] += 3
            elif s2 > s1:
                h2h[t2]["pts"] += 3
            else:
                h2h[t1]["pts"] += 1
                h2h[t2]["pts"] += 1
    return h2h

def get_h2h_stats(cluster, matches):
    h2h = {}
    for t in cluster:
        h2h[t] = {"pts": 0, "gd": 0, "gf": 0}
    
    for m in matches:
        if not m["played"]: continue
        t1, t2 = m["teams"]
        if t1 in cluster and t2 in cluster:
            s1, s2 = m["score"]
            h2h[t1]["gf"] += s1
            h2h[t2]["gf"] += s2
            h2h[t1]["gd"] += (s1 - s2)
            h2h[t2]["gd"] += (s2 - s1)
            if s1 > s2:
                h2h[t1]["pts"] += 3
            elif s2 > s1:
                h2h[t2]["pts"] += 3
            else:
                h2h[t1]["pts"] += 1
                h2h[t2]["pts"] += 1
    return h2h

def sort_standings(standings, matches):
    teams = list(standings.keys())
    
    def resolve_tie(cluster, level=0):
        # Tie-break levels:
        # 0: Overall Points
        # 1: H2H Points among tied teams
        # 2: H2H GD among tied teams
        # 3: H2H GS among tied teams
        # 4: Overall GD
        # 5: Overall GS
        
        if len(cluster) <= 1: return cluster
        
        # Sort current cluster based on the current tie-break level
        if level == 0:
            cluster.sort(key=lambda t: standings[t]["pts"], reverse=True)
        elif level == 1: # H2H Pts
            h2h = get_h2h_stats(cluster, matches)
            cluster.sort(key=lambda t: h2h[t]["pts"], reverse=True)
        elif level == 2: # H2H GD
            h2h = get_h2h_stats(cluster, matches)
            cluster.sort(key=lambda t: h2h[t]["gd"], reverse=True)
        elif level == 3: # H2H GS
            h2h = get_h2h_stats(cluster, matches)
            cluster.sort(key=lambda t: h2h[t]["gf"], reverse=True)
        elif level == 4: # Overall GD
            cluster.sort(key=lambda t: standings[t]["gd"], reverse=True)
        elif level == 5: # Overall GS
            cluster.sort(key=lambda t: standings[t]["gf"], reverse=True)
        else:
            return cluster # End of the line

        # Group teams that are STILL tied at this level
        resolved = []
        i = 0
        while i < len(cluster):
            j = i + 1
            while j < len(cluster):
                is_tied = False
                if level == 0: is_tied = standings[cluster[j]]["pts"] == standings[cluster[i]]["pts"]
                elif level == 1: 
                    h2h = get_h2h_stats(cluster, matches)
                    is_tied = h2h[cluster[j]]["pts"] == h2h[cluster[i]]["pts"]
                elif level == 2:
                    h2h = get_h2h_stats(cluster, matches)
                    is_tied = h2h[cluster[j]]["gd"] == h2h[cluster[i]]["gd"]
                elif level == 3:
                    h2h = get_h2h_stats(cluster, matches)
                    is_tied = h2h[cluster[j]]["gf"] == h2h[cluster[i]]["gf"]
                elif level == 4: is_tied = standings[cluster[j]]["gd"] == standings[cluster[i]]["gd"]
                elif level == 5: is_tied = standings[cluster[j]]["gf"] == standings[cluster[i]]["gf"]
                
                if is_tied: j += 1
                else: break
            
            sub = cluster[i:j]
            if len(sub) > 1:
                # RESTART LOGIC: If we split the cluster (e.g. 1 team moved, 2 stayed tied), 
                # we restart the tied sub-group back at Level 1 (H2H Points).
                # Otherwise, we just move to the next level of tie-breaking.
                new_level = 1 if len(sub) < len(cluster) and level > 0 else level + 1
                resolved.extend(resolve_tie(sub, new_level))
            else:
                resolved.extend(sub)
            i = j
        return resolved

    sorted_names = resolve_tie(teams, 0)
    final_sorted = []
    for name in sorted_names:
        s = standings[name]
        s["team"] = name
        final_sorted.append(s)
    return final_sorted

def generate_round_robin_schedule(teams):
    if len(teams) % 2 != 0:
        teams.append(None)
    
    n = len(teams)
    rounds = []
    for i in range(n - 1):
        matches = []
        for j in range(n // 2):
            t1 = teams[j]
            t2 = teams[n - 1 - j]
            if t1 is not None and t2 is not None:
                # Alternate home/away
                if i % 2 == 0:
                    matches.append((t1, t2))
                else:
                    matches.append((t2, t1))
        rounds.append(matches)
        teams.insert(1, teams.pop())
    return rounds

def initialize_professional_league(base_path, tournament_path, config):
    # Assumes exactly 2 groups of 8
    groups_items = list(config["groups"].items())
    g1_name, g1_teams = groups_items[0]
    g2_name, g2_teams = groups_items[1]
    
    # 1. Generate Intra-division matches (14 rounds total)
    def get_intra_rounds(teams, leg):
        r_set = generate_round_robin_schedule(teams[:])
        if leg == 2:
            r_set = [[(m[1], m[0]) for m in rnd] for rnd in r_set]
        return r_set

    g1_intra = get_intra_rounds(g1_teams, 1) + get_intra_rounds(g1_teams, 2)
    g2_intra = get_intra_rounds(g2_teams, 1) + get_intra_rounds(g2_teams, 2)
    
    intra_rounds = []
    for i in range(14):
        rnd_matches = []
        for m in g1_intra[i]:
            rnd_matches.append({"group": g1_name, "teams": list(m)})
        for m in g2_intra[i]:
            rnd_matches.append({"group": g2_name, "teams": list(m)})
        intra_rounds.append(rnd_matches)

    # 2. Generate Cross-division matches (16 rounds)
    cross_rounds = []
    for leg in [1, 2]:
        for j in range(8):
            rnd_matches = []
            for i in range(8):
                t1 = g1_teams[i]
                t2 = g2_teams[(i + j) % 8]
                if leg == 1:
                    rnd_matches.append({"group": g1_name, "teams": [t1, t2]})
                else:
                    rnd_matches.append({"group": g2_name, "teams": [t2, t1]})
            cross_rounds.append(rnd_matches)

    # 30 rounds total. Round 29 and 30 must be intra.
    r29 = intra_rounds.pop()
    r30 = intra_rounds.pop()
    
    def validate_opponent_gap(rounds_pool, r29, r30):
        all_r = rounds_pool + [r29, r30]
        pair_last_seen = {} # (t1, t2) -> round_num
        for r_idx, rnd in enumerate(all_r):
            r_num = r_idx + 1
            for m in rnd:
                t1, t2 = sorted(m["teams"])
                pair = (t1, t2)
                if pair in pair_last_seen:
                    if r_num - pair_last_seen[pair] < 5:
                        return False
                pair_last_seen[pair] = r_num
        return True

    remaining_rounds = intra_rounds + cross_rounds
    
    # Shuffle and validate gap constraint
    for _ in range(500):
        random.shuffle(remaining_rounds)
        if validate_opponent_gap(remaining_rounds, r29, r30):
            break
            
    all_rounds = remaining_rounds + [r29, r30]

    data = {
        "name": config["name"],
        "path": tournament_path,
        "config": config,
        "current_day": 1,
        "groups": {g: {"matches": [], "standings": []} for g in config["groups"]},
        "playoffs": None,
        "qualified_teams": []
    }

    if config["type"] == "league":
        data["playoffs"] = {
            "rounds": [
                {"name": "Group First Round", "matches": []},
                {"name": "Group Semifinals", "matches": []},
                {"name": "Group Finals", "matches": []},
                {"name": "League Finals", "matches": []}
            ]
        }

    team_last_played = {t: -10 for t in (g1_teams + g2_teams)}

    for r_idx, rnd in enumerate(all_rounds):
        round_num = r_idx + 1
        day_start = (round_num - 1) * 7 + 1
        
        if round_num <= 28:
            success = False
            for _ in range(100):
                random.shuffle(rnd)
                candidate_days = [1, 2, 3, 4, 5, 5, 6, 6]
                possible = True
                for m_idx, m in enumerate(rnd):
                    d = day_start + candidate_days[m_idx] - 1
                    t1, t2 = m["teams"]
                    if team_last_played[t1] > d - 4 or team_last_played[t2] > d - 4:
                        possible = False
                        break
                if possible:
                    for m_idx, m in enumerate(rnd):
                        d = day_start + candidate_days[m_idx] - 1
                        t1, t2 = m["teams"]
                        m["day"] = d
                        team_last_played[t1] = d
                        team_last_played[t2] = d
                    success = True
                    break
            if not success:
                days = [1, 2, 3, 4, 5, 5, 6, 6]
                for m_idx, m in enumerate(rnd):
                    d = day_start + days[m_idx] - 1
                    t1, t2 = m["teams"]
                    m["day"] = d
                    team_last_played[t1] = d
                    team_last_played[t2] = d

        elif round_num == 29:
            days = [197, 198, 199, 200, 201, 202, 204, 205]
            random.shuffle(rnd)
            for m_idx, m in enumerate(rnd):
                d = days[m_idx]
                t1, t2 = m["teams"]
                m["day"] = d
                team_last_played[t1] = d
                team_last_played[t2] = d
        
        elif round_num == 30:
            g1_m = [m for m in rnd if m["group"] == g1_name]
            g2_m = [m for m in rnd if m["group"] == g2_name]
            for m in g1_m:
                m["day"] = 208
            for m in g2_m:
                m["day"] = 209
        
        for m in rnd:
            t1, t2 = m["teams"]
            match = {
                "day": m["day"], "teams": [t1, t2], "played": False, "score": [0, 0],
                "pk_score": None, "events": [], "player_data": {"team1": [], "team2": []},
                "stats": {t1: {"shots": 0, "sogs": 0, "saves": 0}, t2: {"shots": 0, "sogs": 0, "saves": 0}}
            }
            data["groups"][m["group"]]["matches"].append(match)

    for g_id in data["groups"]:
        update_group_standings(data, g_id)
    return data

def initialize_tournament(base_path, tournament_path, config):
    print(f"Generating optimized schedule for {config['name']}...")
    
    if config.get("type") == "league":
        return initialize_professional_league(base_path, tournament_path, config)
    
    target_density = config["rules"].get("target_density")
    
    def attempt_schedule():
        # 1. Collect teams and build pool
        all_teams = []
        for g_id, teams in config["groups"].items():
            all_teams.extend(teams)

        repeats = config["rules"].get("group_repeats", 1)
        match_pool = []
        
        # If league type, pool all teams for a single schedule (Cross-Division)
        if config.get("type") == "league":
            all_teams_list = []
            team_to_group = {}
            for g_id, teams in config["groups"].items():
                all_teams_list.extend(teams)
                for t in teams: team_to_group[t] = g_id
            
            for r_idx in range(repeats):
                base_r1 = generate_round_robin_schedule(all_teams_list[:])
                rnd_set = base_r1 if r_idx % 2 == 0 else [[(m[1], m[0]) for m in rnd] for rnd in base_r1]
                for rnd in rnd_set:
                    for t1, t2 in rnd:
                        # Find which group the home team belongs to for match storage
                        # (Matches are stored in the home team's group for bookkeeping)
                        match_pool.append({"group": team_to_group[t1], "teams": [t1, t2], "leg": r_idx + 1})
        else:
            for r_idx in range(repeats):
                repeat_pool = []
                for g_id, teams in config["groups"].items():
                    base_r1 = generate_round_robin_schedule(teams[:])
                    rnd_set = base_r1 if r_idx % 2 == 0 else [[(m[1], m[0]) for m in rnd] for rnd in base_r1]
                    for rnd in rnd_set:
                        for t1, t2 in rnd:
                            repeat_pool.append({"group": g_id, "teams": [t1, t2], "leg": r_idx + 1})
                random.shuffle(repeat_pool)
                match_pool.extend(repeat_pool)

        data = {
            "name": config["name"],
            "path": tournament_path,
            "config": config,
            "current_day": 1,
            "groups": {g: {"matches": [], "standings": []} for g in config["groups"]},
            "playoffs": None,
            "qualified_teams": []
        }

        # Pre-initialize Afro-Asia Cup bracket
        if config["type"] == "afro_asia_cup":
            data["playoffs"] = {
                "rounds": [
                    {
                        "name": "Round of 12",
                        "matches": [
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R12_1", "source": ["A2", "B3"]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R12_2", "source": ["C2", "D3"]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R12_3", "source": ["B2", "A3"]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R12_4", "source": ["D2", "C3"]}
                        ]
                    },
                    {
                        "name": "Quarterfinals",
                        "matches": [
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R12_1", "label": "QF_1", "source": ["D1", None]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R12_2", "label": "QF_2", "source": ["B1", None]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R12_3", "label": "QF_3", "source": ["C1", None]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R12_4", "label": "QF_4", "source": ["A1", None]}
                        ]
                    },
                    {
                        "name": "Semifinals",
                        "matches": [{"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": f"SF_{i+1}"} for i in range(2)]
                    },
                    {
                        "name": "Finals",
                        "matches": [
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "F"},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "3P"}
                        ]
                    }
                ]
            }

        # Pre-initialize World Cup bracket for visibility
        if config["type"] == "world_cup":
            data["playoffs"] = {
                "rounds": [
                    {
                        "name": "Round of 24",
                        "matches": [
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_1", "source": ["A2", "B3"]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_2", "source": ["C2", "D3"]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_3", "source": ["E2", "F3"]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_4", "source": ["G2", "H3"]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_5", "source": ["B2", "A3"]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_6", "source": ["D2", "C3"]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_7", "source": ["F2", "E3"]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_8", "source": ["H2", "G3"]}
                        ]
                    },
                    {
                        "name": "Round of 16",
                        "matches": [
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_1", "label": "R16_1", "source": ["E1", None]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_2", "label": "R16_2", "source": ["F1", None]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_3", "label": "R16_3", "source": ["A1", None]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_4", "label": "R16_4", "source": ["B1", None]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_5", "label": "R16_5", "source": ["G1", None]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_6", "label": "R16_6", "source": ["H1", None]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_7", "label": "R16_7", "source": ["C1", None]},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_8", "label": "R16_8", "source": ["D1", None]}
                        ]
                    },
                    {
                        "name": "Quarterfinals",
                        "matches": [{"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": f"QF_{i+1}"} for i in range(4)]
                    },
                    {
                        "name": "Semifinals",
                        "matches": [{"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": f"SF_{i+1}"} for i in range(2)]
                    },
                    {
                        "name": "Finals",
                        "matches": [
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "F"},
                            {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "3P"}
                        ]
                    }
                ]
            }

        # 2. Schedule
        day = 1
        team_last_played = {t: -3 for t in all_teams}
        team_game_counts = {t: 0 for t in all_teams}
        team_last_opponent = {t: None for t in all_teams}
        
        # Determine games per leg for gating
        if config.get("type") == "league":
            all_teams_pooled = []
            for g in config["groups"].values(): all_teams_pooled.extend(g)
            games_per_leg = len(all_teams_pooled) - 1
        else:
            first_group = next(iter(config["groups"]))
            games_per_leg = len(config["groups"][first_group]) - 1

        local_pool = list(match_pool)
        random.shuffle(local_pool) # ALWAYS shuffle to avoid constraint traps
        
        days_without_matches = 0
        while local_pool and days_without_matches < 100:
            local_pool.sort(key=lambda m: (team_game_counts[m["teams"][0]] + team_game_counts[m["teams"][1]]))
            
            if target_density:
                target_today = target_density
            else:
                target_today = 3 if day % 3 != 0 else 2
                
            matches_today = 0
            i = 0
            while i < len(local_pool) and matches_today < target_today:
                m_data = local_pool[i]
                t1, t2 = m_data["teams"]
                leg = m_data["leg"]
                
                can_play = (team_last_played[t1] < day - 2 and 
                            team_last_played[t2] < day - 2 and
                            team_last_opponent[t1] != t2 and
                            team_game_counts[t1] >= (leg - 1) * games_per_leg and
                            team_game_counts[t2] >= (leg - 1) * games_per_leg)
                
                if can_play:
                    m = local_pool.pop(i)
                    match = {
                        "day": day, "teams": m["teams"], "played": False, "score": [0, 0],
                        "pk_score": None, "events": [], "player_data": {"team1": [], "team2": []},
                        "stats": {t1: {"shots": 0, "sogs": 0, "saves": 0}, t2: {"shots": 0, "sogs": 0, "saves": 0}}
                    }
                    data["groups"][m["group"]]["matches"].append(match)
                    team_last_played[t1] = day
                    team_last_played[t2] = day
                    team_last_opponent[t1] = t2
                    team_last_opponent[t2] = t1
                    team_game_counts[t1] += 1
                    team_game_counts[t2] += 1
                    matches_today += 1
                else:
                    i += 1
            day += 1
        return data, day - 1

    # Try to fit it into the ideal window if target_density is provided
    best_data = None
    if target_density:
        total_games = 0
        for g in config["groups"].values():
            n = len(g)
            total_games += (n * (n-1) // 2) * config["rules"].get("group_repeats", 1)
        ideal_days = (total_games + target_density - 1) // target_density
        
        for _ in range(100):
            candidate, last_day = attempt_schedule()
            if last_day <= ideal_days:
                best_data = candidate
                break
            best_data = candidate
    else:
        best_data, _ = attempt_schedule()

    for g_id in best_data["groups"]:
        update_group_standings(best_data, g_id)
    return best_data

def check_mathematical_locks(tournament_data):
    conf_type = tournament_data["config"]["type"]
    if conf_type not in ["world_cup", "league"]: return
    if not tournament_data.get("playoffs") or "rounds" not in tournament_data["playoffs"]: return

    import copy
    po = tournament_data["playoffs"]
    
    # 1. Determine locks for each group
    locks = {}
    for g_id, g_teams in tournament_data["config"]["groups"].items():
        # Correctly gather ALL matches involving teams in this group
        group_teams = set(g_teams)
        all_relevant_matches = []
        for gid in tournament_data["groups"]:
            for match in tournament_data["groups"][gid]["matches"]:
                t1, t2 = match["teams"]
                if t1 in group_teams or t2 in group_teams:
                    all_relevant_matches.append(match)
        
        matches = all_relevant_matches
        remaining = [m for m in matches if not m["played"]]
        
        if not remaining:
            # All matches played, everything is locked
            standings = tournament_data["groups"][g_id]["standings"]
            for i, s in enumerate(standings):
                locks[f"{g_id}{i+1}"] = s["team"]
            continue
            
        if len(remaining) > 8:
            continue

        rank_possibilities = {t: set() for t in g_teams}
        
        # Pre-calculate base standings from played matches
        base_results = {t: {"played": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "gd": 0, "pts": 0} for t in g_teams}
        played_matches = [m for m in matches if m["played"]]
        for m in played_matches:
            update_standings(base_results, m)

        def simulate_remaining(m_idx, sim_standings, sim_matches):
            if m_idx == len(remaining):
                sorted_sim = sort_standings(sim_standings, played_matches + sim_matches)
                group_only_sorted = [s for s in sorted_sim if s["team"] in group_teams]
                for rank, s in enumerate(group_only_sorted):
                    rank_possibilities[s["team"]].add(rank + 1)
                return
            
            m = remaining[m_idx]
            t1, t2 = m["teams"]
            
            # 6 options for results: Win(Min), Win(Max), Loss(Min), Loss(Max), Draw(Min), Draw(Max)
            for s1, s2 in [(1, 0), (10, 0), (0, 1), (0, 10), (0, 0), (1, 1)]:
                # Create a lightweight copy of the standings for this branch
                new_standings = {t: stats.copy() for t, stats in sim_standings.items()}
                m_sim = {"teams": [t1, t2], "score": [s1, s2], "played": True}
                update_standings(new_standings, m_sim)
                simulate_remaining(m_idx + 1, new_standings, sim_matches + [m_sim])

        simulate_remaining(0, base_results, [])
        for team, ranks in rank_possibilities.items():
            if len(ranks) == 1:
                locked_rank = list(ranks)[0]
                locks[f"{g_id}{locked_rank}"] = team

    # 2. Apply locks
    if conf_type == "world_cup":
        r24 = po["rounds"][0]["matches"]
        r16 = po["rounds"][1]["matches"]
        for m in r24:
            source = m.get("source", [])
            if len(source) > 0 and source[0] and source[0][0] in "ABCDEFGH": m["teams"][0] = locks.get(source[0], "TBD")
            if len(source) > 1 and source[1] and source[1][0] in "ABCDEFGH": m["teams"][1] = locks.get(source[1], "TBD")
        for m in r16:
            source = m.get("source", [])
            if len(source) > 0 and source[0] and source[0][0] in "ABCDEFGH": m["teams"][0] = locks.get(source[0], "TBD")
            
    elif conf_type == "league":
        r1 = po["rounds"][0]["matches"]
        r2 = po["rounds"][1]["matches"]
        # League logic: Round 1 (3v6, 4v5), Round 2 (1 vs TBD, 2 vs TBD)
        for g_id in sorted(tournament_data["groups"].keys()):
            g_r1 = [m for m in r1 if m["label"].startswith(f"{g_id}_R1")]
            for m in g_r1:
                if "R1_1" in m["label"]: # 3v6
                    m["teams"][0] = locks.get(f"{g_id}3", "TBD")
                    m["teams"][1] = locks.get(f"{g_id}6", "TBD")
                elif "R1_2" in m["label"]: # 4v5
                    m["teams"][0] = locks.get(f"{g_id}4", "TBD")
                    m["teams"][1] = locks.get(f"{g_id}5", "TBD")
            
            g_r2 = [m for m in r2 if m["label"].startswith(f"{g_id}_R2")]
            for m in g_r2:
                if "R2_1" in m["label"]:
                    m["teams"][0] = locks.get(f"{g_id}1", "TBD")
                    m["home_seed"] = m["teams"][0]
                elif "R2_2" in m["label"]:
                    m["teams"][0] = locks.get(f"{g_id}2", "TBD")
                    m["home_seed"] = m["teams"][0]

def update_group_standings(tournament_data, g_id):
    results = {}
    group_teams = set(tournament_data["config"]["groups"][g_id])
    
    # Initialize all teams from the config for this group
    for t in group_teams:
        results[t] = {"played": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "gd": 0, "pts": 0}

    # Iterate through ALL groups to find ALL matches involving teams in this group
    all_relevant_matches = []
    for gid in tournament_data["groups"]:
        for match in tournament_data["groups"][gid]["matches"]:
            if not match["played"]: continue
            t1, t2 = match["teams"]
            if t1 in group_teams or t2 in group_teams:
                all_relevant_matches.append(match)
                s1, s2 = match["score"]
                
                if t1 in group_teams:
                    results[t1]["played"] += 1
                    results[t1]["gf"] += s1
                    results[t1]["ga"] += s2
                    results[t1]["gd"] = results[t1]["gf"] - results[t1]["ga"]
                    if s1 > s2:
                        results[t1]["w"] += 1
                        results[t1]["pts"] += 3
                    elif s2 > s1:
                        results[t1]["l"] += 1
                    else:
                        results[t1]["d"] += 1
                        results[t1]["pts"] += 1
                
                if t2 in group_teams:
                    results[t2]["played"] += 1
                    results[t2]["gf"] += s2
                    results[t2]["ga"] += s1
                    results[t2]["gd"] = results[t2]["gf"] - results[t2]["ga"]
                    if s2 > s1:
                        results[t2]["w"] += 1
                        results[t2]["pts"] += 3
                    elif s1 > s2:
                        results[t2]["l"] += 1
                    else:
                        results[t2]["d"] += 1
                        results[t2]["pts"] += 1
    
    tournament_data["groups"][g_id]["standings"] = sort_standings(results, all_relevant_matches)

def run_tournament_step(path_arg, simulate_all=False, days_to_sim=1):
    tournament_path = path_arg.strip('/')
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(scripts_dir)
    base_path = os.path.join(base_dir, "Tournaments", tournament_path)
    config_path = f"{base_path}/config.json"
    results_path = f"{base_path}/results.json"

    if not os.path.exists(config_path):
        print(f"Error: Could not find config.json at {config_path}")
        return

    with open(config_path, 'r') as f:
        config = json.load(f)

    if "--reset" in sys.argv or not os.path.exists(results_path):
        # Delete existing logs before re-initializing
        games_dir = f"{base_path}/Games"
        if os.path.exists(games_dir):
            shutil.rmtree(games_dir)
        os.makedirs(games_dir, exist_ok=True)
        
        tournament_data = initialize_tournament(base_path, tournament_path, config)
    else:
        with open(results_path, 'r') as f:
            tournament_data = json.load(f)
        
        # Ensure playoffs are initialized if missing (e.g. after rewind)
        if config["type"] == "world_cup" and not tournament_data.get("playoffs"):
            tournament_data["playoffs"] = {
                "rounds": [
                    {"name": "Round of 24", "matches": [{"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": f"R24_{i+1}", "source": s} for i, s in enumerate([["A2", "B3"], ["C2", "D3"], ["E2", "F3"], ["G2", "H3"], ["B2", "A3"], ["D2", "C3"], ["F2", "E3"], ["H2", "G3"]])] },
                    {"name": "Round of 16", "matches": [{"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": f"R16_{i+1}", "parent": f"R24_{i+1}", "source": s} for i, s in enumerate([["E1", None], ["F1", None], ["A1", None], ["B1", None], ["G1", None], ["H1", None], ["C1", None], ["D1", None]])] },
                    {"name": "Quarterfinals", "matches": [{"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": f"QF_{i+1}"} for i in range(4)] },
                    {"name": "Semifinals", "matches": [{"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": f"SF_{i+1}"} for i in range(2)] },
                    {"name": "Finals", "matches": [{"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "F"}, {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "3P"}] }
                ]
            }
        
        if config["type"] == "league" and (not tournament_data.get("playoffs") or not tournament_data["playoffs"]["rounds"][0]["matches"]):
            # Determine last day of group stage
            last_day = 0
            for g in tournament_data["groups"].values():
                for m in g["matches"]: last_day = max(last_day, m["day"])
            
            po = {
                "rounds": [
                    {"name": "Group First Round", "matches": []},
                    {"name": "Group Semifinals", "matches": []},
                    {"name": "Group Finals", "matches": []},
                    {"name": "League Finals", "matches": []}
                ]
            }
            tournament_data["playoffs"] = po

            # Timeline: 1 day gap after season end (last_day + 2 is first match day)
            # R1 (Bo3): 2 matches per day. Each group has 2 series (R1_1, R1_2).
            # So 4 series total. 2 matches/day means we finish G1 in 2 days.
            d_r1 = [last_day + 2, last_day + 3, last_day + 4, last_day + 5, last_day + 6, last_day + 7]
            
            # R2 (Bo3): 2 matches/day. 2 series per group = 4 series total.
            d_r2 = [d_r1[-1] + 2, d_r1[-1] + 3, d_r1[-1] + 4, d_r1[-1] + 5, d_r1[-1] + 6, d_r1[-1] + 7]
            
            # R3 (Bo5): 1 match/day, interlaced. 2 series total (one per group).
            # G1_A, G1_B, G2_A, G2_B, etc.
            d_r3 = [d_r2[-1] + 2 + i for i in range(10)]
            
            # Finals (Bo5): 1 match/day.
            d_f = [d_r3[-1] + 2 + i for i in range(5)]

            g_ids = sorted(tournament_data["groups"].keys()) # Usually 2 groups
            for g_idx, g_id in enumerate(g_ids):
                # Round 1 (Bo3): 2 matches per day (both from same group), then switch group
                for label in ["R1_1", "R1_2"]:
                    for i in range(3):
                        # Interlaced: G1(Group1), G1(Group2), G2(Group1), G2(Group2)...
                        day_idx = (i * 2) + g_idx
                        po["rounds"][0]["matches"].append({
                            "day": d_r1[day_idx], "teams": ["TBD", "TBD"], "score": [0,0], "played": False,
                            "label": f"{g_id}_{label}_G{i+1}", "series_id": f"{g_id}_{label}", "game_num": i+1
                        })
                # Round 2 (Bo3): Same interlacing
                for label in ["R2_1", "R2_2"]:
                    for i in range(3):
                        day_idx = (i * 2) + g_idx
                        po["rounds"][1]["matches"].append({
                            "day": d_r2[day_idx], "teams": ["TBD", "TBD"], "score": [0,0], "played": False,
                            "label": f"{g_id}_{label}_G{i+1}", "series_id": f"{g_id}_{label}", "game_num": i+1
                        })
                # Round 3 (Bo5): Interlaced 1 match/day
                for i in range(5):
                    po["rounds"][2]["matches"].append({
                        "day": d_r3[i * 2 + g_idx], "teams": ["TBD", "TBD"], "score": [0,0], "played": False,
                        "label": f"{g_id}_R3_G{i+1}", "series_id": f"{g_id}_R3", "game_num": i+1
                    })
            # Finals (Bo5)
            for i, day in enumerate(d_f):
                po["rounds"][3]["matches"].append({
                    "day": day, "teams": ["TBD", "TBD"], "score": [0,0], "played": False,
                    "label": f"F_G{i+1}", "series_id": "F", "game_num": i+1, "neutral": True
                })
            
            check_mathematical_locks(tournament_data)
            print(f"Initialized {config['name']} playoff bracket structure.")

    for _ in range(days_to_sim if not simulate_all else 1):
        if simulate_all: break
        
        current_day = tournament_data["current_day"]
        print(f"\n--- TOURNAMENT DAY {current_day} ---")

        # 1. Simulate Group Stage Matches for the current day
        matches_simulated = 0
        group_stage_complete = True
        
        for g_id, g_data in tournament_data["groups"].items():
            for match in g_data["matches"]:
                if not match["played"]:
                    group_stage_complete = False
                    if match["day"] == current_day:
                        print(f"Playing: {match['teams'][0]} vs {match['teams'][1]}")
                        is_league = config.get("type") == "league"
                        res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=False, logging=True, persist=False, hfa=is_league)
                        match.update(res)
                        match["played"] = True
                        matches_simulated += 1
            update_group_standings(tournament_data, g_id)
        
        if config["type"] == "world_cup":
            check_mathematical_locks(tournament_data)

        # 2. Check for Playoff Transition or Direct Qualification
        if group_stage_complete:
            if config["type"] == "aa_qualifiers" and tournament_data["playoffs"] is None:
                print("Group stage complete. Scheduling Afro-Asia Qualifiers playoffs...")
                last_day = 0
                for g in tournament_data["groups"].values():
                    for m in g["matches"]: last_day = max(last_day, m["day"])
                
                # Direct Qualifiers (1st place)
                for g_id in ["A", "B", "C", "D", "E", "F", "G", "H"]:
                    table = tournament_data["groups"][g_id]["standings"]
                    tournament_data["qualified_teams"].append(table[0]["team"])
                
                # Playoff teams (2nd place)
                p_teams = {g_id: tournament_data["groups"][g_id]["standings"][1]["team"] for g_id in ["A", "B", "C", "D", "E", "F", "G", "H"]}

                d1 = last_day + 2
                d2 = last_day + 4
                d3 = last_day + 6
                
                tournament_data["playoffs"] = {
                    "rounds": [
                        {
                            "name": "Playoff Round 1",
                            "matches": [
                                {"day": d1, "teams": [p_teams["A"], p_teams["B"]], "played": False, "label": "R1_1"},
                                {"day": d1, "teams": [p_teams["C"], p_teams["D"]], "played": False, "label": "R1_2"},
                                {"day": d1, "teams": [p_teams["E"], p_teams["F"]], "played": False, "label": "R1_3"},
                                {"day": d1, "teams": [p_teams["G"], p_teams["H"]], "played": False, "label": "R1_4"}
                            ]
                        },
                        {
                            "name": "Playoff Round 2",
                            "matches": [
                                # Upper (Winners of R1) - Winners Qualify (2-0)
                                {"day": d2, "teams": ["TBD", "TBD"], "played": False, "label": "R2_W1", "parent_win": ["R1_1", "R1_2"]},
                                {"day": d2, "teams": ["TBD", "TBD"], "played": False, "label": "R2_W2", "parent_win": ["R1_3", "R1_4"]},
                                # Lower (Losers of R1) - Losers Out (0-2)
                                {"day": d2, "teams": ["TBD", "TBD"], "played": False, "label": "R2_L1", "parent_loss": ["R1_1", "R1_2"]},
                                {"day": d2, "teams": ["TBD", "TBD"], "played": False, "label": "R2_L2", "parent_loss": ["R1_3", "R1_4"]}
                            ]
                        },
                        {
                            "name": "Playoff Round 3",
                            "matches": [
                                # Losers of Upper vs Winners of Lower - Winners Qualify (2-1)
                                {"day": d3, "teams": ["TBD", "TBD"], "played": False, "label": "R3_1", "parent_win": ["R2_L1"], "parent_loss": ["R2_W2"]},
                                {"day": d3, "teams": ["TBD", "TBD"], "played": False, "label": "R3_2", "parent_win": ["R2_L2"], "parent_loss": ["R2_W1"]}
                            ]
                        }
                    ]
                }
                print(f"Playoffs scheduled for days {d1}, {d2}, {d3}.")

            elif config["type"] == "asia_qualifiers" and tournament_data["playoffs"] is None:
                print("Group stage complete. Scheduling playoffs...")
                last_day = 0
                for g in tournament_data["groups"].values():
                    for m in g["matches"]: last_day = max(last_day, m["day"])
                
                playoff_teams = {"A": [], "B": []}
                direct_limit = config["rules"]["direct_qualifiers_per_group"]
                playoff_indices = config["rules"]["playoff_spots_per_group"]

                for g_id in ["A", "B"]:
                    table = tournament_data["groups"][g_id]["standings"]
                    for i in range(direct_limit): tournament_data["qualified_teams"].append(table[i]["team"])
                    for idx in playoff_indices: playoff_teams[g_id].append(table[idx]["team"])

                semi_day = last_day + 2
                final_day = last_day + 4
                
                tournament_data["playoffs"] = {
                    "semifinals": [
                        {"day": semi_day, "teams": [playoff_teams["A"][0], playoff_teams["B"][1]], "played": False},
                        {"day": semi_day, "teams": [playoff_teams["B"][0], playoff_teams["A"][1]], "played": False}
                    ],
                    "finals": [{"day": final_day, "teams": [None, None], "played": False}]
                }
                print(f"Playoffs scheduled for days {semi_day} and {final_day}.")

            elif config["type"] == "europe_qualifiers" and tournament_data["playoffs"] is None:
                print("Group stage complete. Scheduling UEFA playoffs...")
                last_day = 0
                for g in tournament_data["groups"].values():
                    for m in g["matches"]: last_day = max(last_day, m["day"])
                
                # Direct Qualifiers (Top 3)
                for g_id in ["A", "B", "C", "D"]:
                    table = tournament_data["groups"][g_id]["standings"]
                    for i in range(3): tournament_data["qualified_teams"].append(table[i]["team"])
                
                # Playoff teams (4th and 5th)
                teams = {g_id: [tournament_data["groups"][g_id]["standings"][i]["team"] for i in [3, 4]] for g_id in ["A", "B", "C", "D"]}

                semi_day = last_day + 2
                final_day = last_day + 4
                
                # Bracket 1: (4A vs 5B) and (4C vs 5D)
                # Bracket 2: (4B vs 5A) and (4D vs 5C)
                tournament_data["playoffs"] = {
                    "semifinals": [
                        {"day": semi_day, "teams": [teams["A"][0], teams["B"][1]], "played": False},
                        {"day": semi_day, "teams": [teams["C"][0], teams["D"][1]], "played": False},
                        {"day": semi_day, "teams": [teams["B"][0], teams["A"][1]], "played": False},
                        {"day": semi_day, "teams": [teams["D"][0], teams["C"][1]], "played": False}
                    ],
                    "finals": [
                        {"day": final_day, "teams": [None, None], "played": False},
                        {"day": final_day, "teams": [None, None], "played": False}
                    ]
                }
                print(f"UEFA Playoffs scheduled for days {semi_day} and {final_day}.")

            elif config["type"] == "world_cup" and (tournament_data["playoffs"] is None or "rounds" not in tournament_data["playoffs"] or tournament_data["playoffs"]["rounds"][0]["matches"][0]["day"] == 0):
                print("Group stage complete. Finalizing World Cup knockout stage...")
                last_day = 0
                for g in tournament_data["groups"].values():
                    for m in g["matches"]: last_day = max(last_day, m["day"])
                
                # Fetch seeds 1, 2, 3 from each group
                seeds = {}
                for g_id in ["A", "B", "C", "D", "E", "F", "G", "H"]:
                    table = tournament_data["groups"][g_id]["standings"]
                    seeds[f"{g_id}1"] = table[0]["team"]
                    seeds[f"{g_id}2"] = table[1]["team"]
                    seeds[f"{g_id}3"] = table[2]["team"]

                # Schedule - 16 days total
                # R24: 4 days (2/2/2/2)
                # R16: 4 days (2/2/2/2)
                # QF: 4 days (1/1/1/1)
                # SF: 2 days (1/1)
                # 3P: 1 day
                # F: 1 day
                d_r24 = [last_day + 1, last_day + 2, last_day + 3, last_day + 4]
                d_r16 = [last_day + 6, last_day + 7, last_day + 8, last_day + 9]
                d_qf =  [last_day + 11, last_day + 12, last_day + 13, last_day + 14]
                d_sf =  [last_day + 16, last_day + 17]
                d_3p =  last_day + 19
                d_f =   last_day + 21

                po = tournament_data["playoffs"]
                if not po or "rounds" not in po:
                    # (Fallback if not initialized, though it should be)
                    po = {"rounds": [{"name": n, "matches": []} for n in ["Round of 24", "Round of 16", "Quarterfinals", "Semifinals", "Finals"]]}
                    tournament_data["playoffs"] = po

                # Round of 24
                r24_sources = [["A2", "B3"], ["C2", "D3"], ["E2", "F3"], ["G2", "H3"], ["B2", "A3"], ["D2", "C3"], ["F2", "E3"], ["H2", "G3"]]
                po["rounds"][0]["matches"] = [
                    {"day": d_r24[0], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_1", "source": r24_sources[0]},
                    {"day": d_r24[0], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_2", "source": r24_sources[1]},
                    {"day": d_r24[1], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_3", "source": r24_sources[2]},
                    {"day": d_r24[1], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_4", "source": r24_sources[3]},
                    {"day": d_r24[2], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_5", "source": r24_sources[4]},
                    {"day": d_r24[2], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_6", "source": r24_sources[5]},
                    {"day": d_r24[3], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_7", "source": r24_sources[6]},
                    {"day": d_r24[3], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "R24_8", "source": r24_sources[7]}
                ]

                # Round of 16
                r16_sources = [["E1", None], ["F1", None], ["A1", None], ["B1", None], ["G1", None], ["H1", None], ["C1", None], ["D1", None]]
                po["rounds"][1]["matches"] = [
                    {"day": d_r16[0], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_1", "label": "R16_1", "source": r16_sources[0]},
                    {"day": d_r16[0], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_2", "label": "R16_2", "source": r16_sources[1]},
                    {"day": d_r16[1], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_3", "label": "R16_3", "source": r16_sources[2]},
                    {"day": d_r16[1], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_4", "label": "R16_4", "source": r16_sources[3]},
                    {"day": d_r16[2], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_5", "label": "R16_5", "source": r16_sources[4]},
                    {"day": d_r16[2], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_6", "label": "R16_6", "source": r16_sources[5]},
                    {"day": d_r16[3], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_7", "label": "R16_7", "source": r16_sources[6]},
                    {"day": d_r16[3], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "parent": "R24_8", "label": "R16_8", "source": r16_sources[7]}
                ]

                po["rounds"][2]["matches"] = [{"day": d_qf[i], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": f"QF_{i+1}"} for i in range(4)]
                po["rounds"][3]["matches"] = [{"day": d_sf[i], "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": f"SF_{i+1}"} for i in range(2)]
                po["rounds"][4]["matches"] = [
                    {"day": d_f, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "F"},
                    {"day": d_3p, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "3P"}
                ]
                
                check_mathematical_locks(tournament_data)
                print(f"World Cup knockout stage finalized.")

            elif config["type"] == "afro_asia_cup" and (tournament_data["playoffs"] is None or tournament_data["playoffs"]["rounds"][0]["matches"][0]["day"] == 0):
                print("Group stage complete. Scheduling Afro-Asia Cup playoffs...")
                
                if tournament_data["playoffs"] is None:
                    tournament_data["playoffs"] = {
                        "rounds": [
                            {"name": "Round of 12", "matches": [{"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": f"R12_{i+1}", "source": s} for i, s in enumerate([["A2", "B3"], ["C2", "D3"], ["B2", "A3"], ["D2", "C3"]])] },
                            {"name": "Quarterfinals", "matches": [{"day": 0, "teams": [s, "TBD"], "score": [0, 0], "played": False, "parent": p, "label": f"QF_{i+1}"} for i, (s, p) in enumerate([["D1", "R12_1"], ["B1", "R12_2"], ["C1", "R12_3"], ["A1", "R12_4"]])] },
                            {"name": "Semifinals", "matches": [{"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": f"SF_{i+1}"} for i in range(2)] },
                            {"name": "Finals", "matches": [{"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "F"}, {"day": 0, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "3P"}] }
                        ]
                    }

                seeds = {}
                for g_id in ["A", "B", "C", "D"]:
                    table = tournament_data["groups"][g_id]["standings"]
                    seeds[f"{g_id}1"] = table[0]["team"]
                    seeds[f"{g_id}2"] = table[1]["team"]
                    seeds[f"{g_id}3"] = table[2]["team"]

                po = tournament_data["playoffs"]
                d_base = current_day + 1
                
                # Round of 12
                r12 = po["rounds"][0]["matches"]
                r12[0]["teams"] = [seeds["A2"], seeds["B3"]]; r12[0]["day"] = d_base
                r12[1]["teams"] = [seeds["C2"], seeds["D3"]]; r12[1]["day"] = d_base
                r12[2]["teams"] = [seeds["B2"], seeds["A3"]]; r12[2]["day"] = d_base
                r12[3]["teams"] = [seeds["D2"], seeds["C3"]]; r12[3]["day"] = d_base

                # Quarterfinals
                qf = po["rounds"][1]["matches"]
                qf[0]["teams"] = [seeds["D1"], "TBD"]; qf[0]["day"] = d_base + 2
                qf[1]["teams"] = [seeds["B1"], "TBD"]; qf[1]["day"] = d_base + 2
                qf[2]["teams"] = [seeds["C1"], "TBD"]; qf[2]["day"] = d_base + 2
                qf[3]["teams"] = [seeds["A1"], "TBD"]; qf[3]["day"] = d_base + 2

                # Semifinals
                for i, m in enumerate(po["rounds"][2]["matches"]):
                    m["day"] = d_base + 4
                
                # Finals
                for m in po["rounds"][3]["matches"]:
                    m["day"] = d_base + 6

                print("Afro-Asia Cup knockout stage scheduled.")

            elif config["type"] == "league" and (tournament_data["playoffs"] is None or not tournament_data["playoffs"]["rounds"][0]["matches"]):
                print(f"Group stage complete. Finalizing {config['name']} playoffs...")
                
                # Determine last day of group stage
                last_day = 0
                for g in tournament_data["groups"].values():
                    for m in g["matches"]: last_day = max(last_day, m["day"])
                
                po = {
                    "rounds": [
                        {"name": "Group First Round", "matches": []},
                        {"name": "Group Semifinals", "matches": []},
                        {"name": "Group Finals", "matches": []},
                        {"name": "League Finals", "matches": []}
                    ]
                }
                tournament_data["playoffs"] = po

                # Days: Bo3 takes 3 days, Bo5 takes 5. We'll leave 1 day buffer between rounds.
                d_r1 = [last_day + 1, last_day + 2, last_day + 3]
                d_r2 = [last_day + 5, last_day + 6, last_day + 7]
                d_r3 = [last_day + 9, last_day + 10, last_day + 11, last_day + 12, last_day + 13]
                d_f  = [last_day + 15, last_day + 16, last_day + 17, last_day + 18, last_day + 19]

                for g_id in sorted(tournament_data["groups"].keys()):
                    table = tournament_data["groups"][g_id]["standings"]
                    seeds = [t["team"] for t in table[:6]]
                    
                    # Round 1 (Bo3): 3v6, 4v5
                    matchups = [(seeds[2], seeds[5], "R1_1"), (seeds[3], seeds[4], "R1_2")]
                    for tA, tB, label in matchups:
                        for i, day in enumerate(d_r1):
                            home = tA if i % 2 == 0 else tB # Higher seed hosts G1 and G3
                            away = tB if i % 2 == 0 else tA
                            po["rounds"][0]["matches"].append({
                                "day": day, "teams": [home, away], "score": [0,0], "played": False,
                                "label": f"{g_id}_{label}_G{i+1}", "series_id": f"{g_id}_{label}", "game_num": i+1
                            })

                    # Round 2 (Bo3): 1vLowest, 2vHighest (TBD)
                    for i, day in enumerate(d_r2):
                        po["rounds"][1]["matches"].append({
                            "day": day, "teams": [seeds[0], "TBD"], "score": [0,0], "played": False,
                            "label": f"{g_id}_R2_1_G{i+1}", "series_id": f"{g_id}_R2_1", "game_num": i+1, "home_seed": seeds[0]
                        })
                        po["rounds"][1]["matches"].append({
                            "day": day, "teams": [seeds[1], "TBD"], "score": [0,0], "played": False,
                            "label": f"{g_id}_R2_2_G{i+1}", "series_id": f"{g_id}_R2_2", "game_num": i+1, "home_seed": seeds[1]
                        })

                    # Round 3 (Bo5): Group Finals (TBD)
                    for i, day in enumerate(d_r3):
                        # 2 home, 2 away, 1 home logic handled during progression
                        po["rounds"][2]["matches"].append({
                            "day": day, "teams": ["TBD", "TBD"], "score": [0,0], "played": False,
                            "label": f"{g_id}_R3_G{i+1}", "series_id": f"{g_id}_R3", "game_num": i+1
                        })

                # League Finals (Bo5): Neutral
                for i, day in enumerate(d_f):
                    po["rounds"][3]["matches"].append({
                        "day": day, "teams": ["TBD", "TBD"], "score": [0,0], "played": False,
                        "label": f"F_G{i+1}", "series_id": "F", "game_num": i+1, "neutral": True
                    })

                check_mathematical_locks(tournament_data)
                print(f"{config['name']} playoffs scheduled.")

            elif config["type"] == "oceania_qualifiers" and not tournament_data["qualified_teams"]:
                print("Group stage complete. Determining qualifiers...")
                group_limit = config["rules"].get("direct_qualifiers_per_group")
                single_limit = config["rules"].get("direct_qualifiers")
                
                if group_limit:
                    for g_id in sorted(tournament_data["groups"].keys()):
                        table = tournament_data["groups"][g_id]["standings"]
                        for i in range(group_limit):
                            tournament_data["qualified_teams"].append(table[i]["team"])
                elif single_limit:
                    table = tournament_data["groups"]["A"]["standings"]
                    for i in range(single_limit):
                        tournament_data["qualified_teams"].append(table[i]["team"])
                
                print(f"Qualifiers: {', '.join(tournament_data['qualified_teams'])}")

        # 3. Simulate Playoff Matches
        if tournament_data["playoffs"]:
            # Generalized playoff stage simulation
            po = tournament_data["playoffs"]
            all_playoff_matches = [m for r in po.get("rounds", []) for m in r["matches"]]
            
            if "rounds" in po:
                for round in po["rounds"]:
                    for match in round["matches"]:
                        if match["played"] or match.get("canceled"): continue
                        if "TBD" in match["teams"] or None in match["teams"]: continue
                        if match["day"] != current_day: continue

                        # Series Check: skip if series already decided
                        if "series_id" in match:
                            best_of = 5 if "Finals" in round["name"] else 3
                            if get_series_winner(all_playoff_matches, match["series_id"], best_of):
                                match["played"] = True
                                match["canceled"] = True
                                continue

                        print(f"Playing {round['name']}: {match['teams'][0]} vs {match['teams'][1]} (HFA: {'No' if match.get('neutral') else 'Yes'})")
                        res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=True, logging=True, persist=False, hfa=not match.get('neutral'))
                        match.update(res)
                        match["played"] = True
                        matches_simulated += 1

            # Progression logic
            if config["type"] == "league" and "rounds" in po:
                r1, r2, r3, lf = [r["matches"] for r in po["rounds"]]
                
                # Progression for each group
                for g_id in sorted(tournament_data["groups"].keys()):
                    # R1 -> R2 (Re-seeding)
                    r1_winners = []
                    s1 = next((m for m in r1 if m["series_id"] == f"{g_id}_R1_1"), None)
                    s2 = next((m for m in r1 if m["series_id"] == f"{g_id}_R1_2"), None)
                    
                    w1 = get_series_winner(r1, f"{g_id}_R1_1", 3)
                    w2 = get_series_winner(r1, f"{g_id}_R1_2", 3)
                    
                    if w1 and w2:
                        # Find original seeds of winners
                        table = tournament_data["groups"][g_id]["standings"]
                        team_seeds = {t["team"]: i+1 for i, t in enumerate(table)}
                        winners = sorted([w1, w2], key=lambda x: team_seeds[x], reverse=True) # [Lowest, Highest]
                        
                        # Apply to R2 matches
                        for m in r2:
                            if m["series_id"] == f"{g_id}_R2_1": # 1 vs Lowest
                                if m["teams"][1] == "TBD":
                                    m["teams"][1] = winners[0]
                                    # Set home/away rotation for Bo3
                                    if m["game_num"] == 2: m["teams"] = [winners[0], m["home_seed"]]
                            elif m["series_id"] == f"{g_id}_R2_2": # 2 vs Highest
                                if m["teams"][1] == "TBD":
                                    m["teams"][1] = winners[1]
                                    # Set home/away rotation for Bo3
                                    if m["game_num"] == 2: m["teams"] = [winners[1], m["home_seed"]]

                    # R2 -> R3 (Group Finals)
                    wR2_1 = get_series_winner(r2, f"{g_id}_R2_1", 3)
                    wR2_2 = get_series_winner(r2, f"{g_id}_R2_2", 3)
                    if wR2_1 and wR2_2:
                        table = tournament_data["groups"][g_id]["standings"]
                        team_seeds = {t["team"]: i+1 for i, t in enumerate(table)}
                        r3_teams = sorted([wR2_1, wR2_2], key=lambda x: team_seeds[x]) # [High Seed, Low Seed]
                        for m in r3:
                            if m["series_id"] == f"{g_id}_R3":
                                if m["teams"][0] == "TBD":
                                    # Bo5: 2 home, 2 away, 1 home (G1, G2, G5 host is High Seed)
                                    if m["game_num"] in [1, 2, 5]: m["teams"] = [r3_teams[0], r3_teams[1]]
                                    else: m["teams"] = [r3_teams[1], r3_teams[0]]

                # R3 -> League Finals (Neutral Bo5)
                r3_winners = []
                for g_id in sorted(tournament_data["groups"].keys()):
                    win = get_series_winner(all_playoff_matches, f"{g_id}_R3", 5)
                    if win: r3_winners.append(win)
                
                if len(r3_winners) == 2:
                    for m in lf:
                        if m["teams"][0] == "TBD":
                            m["teams"] = r3_winners

            elif config["type"] == "world_cup" and "rounds" in po:
                r24, r16, qf, sf, f = [r["matches"] for r in po["rounds"]]
                # R24 -> R16
                for r16_m in r16:
                    if r16_m["teams"][1] in ["TBD", None]:
                        parent = next((m for m in r24 if m["label"] == r16_m["parent"]), None)
                        if parent and parent["played"]: r16_m["teams"][1] = get_winner(parent)
                # R16 -> QF
                for i in range(4):
                    if qf[i]["teams"][0] in ["TBD", None] and r16[i*2]["played"]: qf[i]["teams"][0] = get_winner(r16[i*2])
                    if qf[i]["teams"][1] in ["TBD", None] and r16[i*2+1]["played"]: qf[i]["teams"][1] = get_winner(r16[i*2+1])
                # QF -> SF
                for i in range(2):
                    if sf[i]["teams"][0] in ["TBD", None] and qf[i*2]["played"]: sf[i]["teams"][0] = get_winner(qf[i*2])
                    if sf[i]["teams"][1] in ["TBD", None] and qf[i*2+1]["played"]: sf[i]["teams"][1] = get_winner(qf[i*2+1])
                # SF -> Finals & 3rd Place
                if sf[0]["played"] and sf[1]["played"]:
                    if f[0]["teams"][0] in ["TBD", None]: f[0]["teams"][0] = get_winner(sf[0])
                    if f[0]["teams"][1] in ["TBD", None]: f[0]["teams"][1] = get_winner(sf[1])
                    if f[1]["teams"][0] in ["TBD", None]: f[1]["teams"][0] = get_loser(sf[0])
                    if f[1]["teams"][1] in ["TBD", None]: f[1]["teams"][1] = get_loser(sf[1])
            
            elif config["type"] == "afro_asia_cup" and "rounds" in po:
                r12, qf, sf, f = [r["matches"] for r in po["rounds"]]
                # R12 -> QF
                for i in range(4):
                    if qf[i]["teams"][1] in ["TBD", None]:
                        parent = next((m for m in r12 if m["label"] == qf[i]["parent"]), None)
                        if parent and parent["played"]: qf[i]["teams"][1] = get_winner(parent)
                # QF -> SF
                for i in range(2):
                    if sf[i]["teams"][0] in ["TBD", None] and qf[i*2]["played"]: sf[i]["teams"][0] = get_winner(qf[i*2])
                    if sf[i]["teams"][1] in ["TBD", None] and qf[i*2+1]["played"]: sf[i]["teams"][1] = get_winner(qf[i*2+1])
                # SF -> Finals
                if sf[0]["played"] and sf[1]["played"]:
                    if f[0]["teams"][0] in ["TBD", None]: f[0]["teams"][0] = get_winner(sf[0])
                    if f[0]["teams"][1] in ["TBD", None]: f[0]["teams"][1] = get_winner(sf[1])
                    if f[1]["teams"][0] in ["TBD", None]: f[1]["teams"][0] = get_loser(sf[0])
                    if f[1]["teams"][1] in ["TBD", None]: f[1]["teams"][1] = get_loser(sf[1])

            elif config["type"] == "aa_qualifiers" and "rounds" in po:
                all_p_matches = [m for r in po["rounds"] for m in r["matches"]]
                for round in po["rounds"]:
                    for match in round["matches"]:
                        if "parent_win" in match:
                            for i, p_label in enumerate(match["parent_win"]):
                                if i < len(match["teams"]) and match["teams"][i] in ["TBD", None]:
                                    parent = next((m for m in all_p_matches if m["label"] == p_label), None)
                                    if parent and parent["played"]: match["teams"][i] = get_winner(parent)
                        if "parent_loss" in match:
                            offset = len(match.get("parent_win", []))
                            for i, p_label in enumerate(match["parent_loss"]):
                                idx = i + offset
                                if idx < len(match["teams"]) and match["teams"][idx] in ["TBD", None]:
                                    parent = next((m for m in all_p_matches if m["label"] == p_label), None)
                                    if parent and parent["played"]: match["teams"][idx] = get_loser(parent)
                
                # Update qualified_teams from Winners of R2 Upper and R3
                r2 = po["rounds"][1]["matches"]
                r3 = po["rounds"][2]["matches"]
                for m in r2[:2]: # R2_W1, R2_W2
                    if m["played"]:
                        w = get_winner(m)
                        if w not in tournament_data["qualified_teams"]: tournament_data["qualified_teams"].append(w)
                for m in r3:
                    if m["played"]:
                        w = get_winner(m)
                        if w not in tournament_data["qualified_teams"]: tournament_data["qualified_teams"].append(w)

            # Legacy Semifinals -> Finals (Asia/Europe)
            elif "semifinals" in po and any(f["teams"][0] is None for f in po["finals"]):
                num_pairs = len(po["finals"])
                for i in range(num_pairs):
                    if po["semifinals"][i*2]["played"] and po["semifinals"][i*2+1]["played"]:
                        w1 = get_winner(po["semifinals"][i*2])
                        w2 = get_winner(po["semifinals"][i*2 + 1])
                        po["finals"][i]["teams"] = [w1, w2]

            # Qualifier update
            if config["type"] == "world_cup":
                final_match = po["rounds"][4]["matches"][0]
                if final_match["played"] and not tournament_data["qualified_teams"]:
                    tournament_data["qualified_teams"].append(get_winner(final_match))
            elif "finals" in po:
                final_match = po["finals"][0]
                if final_match["played"] and not tournament_data["qualified_teams"]:
                    tournament_data["qualified_teams"].append(get_winner(final_match))


        if matches_simulated == 0:
            print("No matches scheduled for today.")
        
        tournament_data["current_day"] += 1

    # Hande --all separately for simplicity
    if simulate_all:
        def get_winner(res):
            if res.get("pk_score"): return res["teams"][0] if res["pk_score"][0] > res["pk_score"][1] else res["teams"][1]
            return res["teams"][0] if res["score"][0] > res["score"][1] else res["teams"][1]
        def get_loser(res):
            winner = get_winner(res)
            return res["teams"][0] if res["teams"][1] == winner else res["teams"][1]

        print("\n--- SIMULATING ALL REMAINING MATCHES ---")
        # Logic for Group Stage
        for g_id, g_data in tournament_data["groups"].items():
            for match in g_data["matches"]:
                if not match["played"]:
                    print(f"Playing: {match['teams'][0]} vs {match['teams'][1]}")
                    is_league = config.get("type") == "league"
                    res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=False, logging=True, persist=False, hfa=is_league)
                    match.update(res)
                    match["played"] = True
            update_group_standings(tournament_data, g_id)
        
        if config["type"] == "world_cup":
            check_mathematical_locks(tournament_data)

        # Scheduling playoffs if not already done
        if tournament_data["playoffs"]:
            po = tournament_data["playoffs"]
            if config["type"] == "afro_asia_cup" and "rounds" in po and po["rounds"][0]["matches"][0]["day"] == 0:
                seeds = {}
                for g_id in ["A", "B", "C", "D"]:
                    table = tournament_data["groups"][g_id]["standings"]
                    seeds[f"{g_id}1"] = table[0]["team"]
                    seeds[f"{g_id}2"] = table[1]["team"]
                    seeds[f"{g_id}3"] = table[2]["team"]
                
                # Round of 12
                r12 = po["rounds"][0]["matches"]
                r12[0]["teams"] = [seeds["A2"], seeds["B3"]]
                r12[1]["teams"] = [seeds["C2"], seeds["D3"]]
                r12[2]["teams"] = [seeds["B2"], seeds["A3"]]
                r12[3]["teams"] = [seeds["D2"], seeds["C3"]]

                # Quarterfinals (static seeds)
                qf = po["rounds"][1]["matches"]
                qf[0]["teams"][0] = seeds["D1"]
                qf[1]["teams"][0] = seeds["B1"]
                qf[2]["teams"][0] = seeds["C1"]
                qf[3]["teams"][0] = seeds["A1"]
                print("Afro-Asia Cup knockout stage scheduled in simulate_all.")

            elif config["type"] == "league" and (tournament_data["playoffs"] is None or not tournament_data["playoffs"]["rounds"][0]["matches"]):
                print(f"Group stage complete. Scheduling {config['name']} playoffs in simulate_all...")
                last_day = 0
                for g in tournament_data["groups"].values():
                    for m in g["matches"]: last_day = max(last_day, m["day"])
                
                po = {"rounds": [{"name": n, "matches": []} for n in ["Group First Round", "Group Semifinals", "Group Finals", "League Finals"]]}
                tournament_data["playoffs"] = po

                # Timeline: 1 day gap after season end (last_day + 2 is first match day)
                d_r1 = [last_day + 2, last_day + 3, last_day + 4, last_day + 5, last_day + 6, last_day + 7]
                d_r2 = [d_r1[-1] + 2, d_r1[-1] + 3, d_r1[-1] + 4, d_r1[-1] + 5, d_r1[-1] + 6, d_r1[-1] + 7]
                d_r3 = [d_r2[-1] + 2 + i for i in range(10)]
                d_f  = [d_r3[-1] + 2 + i for i in range(5)]

                g_ids = sorted(tournament_data["groups"].keys())
                for g_idx, g_id in enumerate(g_ids):
                    table = tournament_data["groups"][g_id]["standings"]
                    seeds = [t["team"] for t in table[:6]]
                    
                    # Round 1 (Bo3): 2 matches per day (both from same group), then switch group
                    matchups = [(seeds[2], seeds[5], "R1_1"), (seeds[3], seeds[4], "R1_2")]
                    for tA, tB, label in matchups:
                        for i in range(3):
                            h, a = (tA, tB) if i % 2 == 0 else (tB, tA)
                            day_idx = (i * 2) + g_idx
                            po["rounds"][0]["matches"].append({
                                "day": d_r1[day_idx], "teams": [h, a], "score": [0,0], "played": False, 
                                "label": f"{g_id}_{label}_G{i+1}", "series_id": f"{g_id}_{label}", "game_num": i+1
                            })
                    
                    # Round 2 (Bo3): 2 matches per day, same interlacing
                    for i in range(3):
                        day_idx = (i * 2) + g_idx
                        po["rounds"][1]["matches"].append({
                            "day": d_r2[day_idx], "teams": [seeds[0], "TBD"], "score": [0,0], "played": False, 
                            "label": f"{g_id}_R2_1_G{i+1}", "series_id": f"{g_id}_R2_1", "game_num": i+1, "home_seed": seeds[0]
                        })
                        po["rounds"][1]["matches"].append({
                            "day": d_r2[day_idx], "teams": [seeds[1], "TBD"], "score": [0,0], "played": False, 
                            "label": f"{g_id}_R2_2_G{i+1}", "series_id": f"{g_id}_R2_2", "game_num": i+1, "home_seed": seeds[1]
                        })
                    
                    # Round 3 (Bo5): 1 match/day, interlaced
                    for i in range(5):
                        po["rounds"][2]["matches"].append({
                            "day": d_r3[i * 2 + g_idx], "teams": ["TBD", "TBD"], "score": [0,0], "played": False, 
                            "label": f"{g_id}_R3_G{i+1}", "series_id": f"{g_id}_R3", "game_num": i+1
                        })
                
                # Finals (Bo5)
                for i, day in enumerate(d_f):
                    po["rounds"][3]["matches"].append({
                        "day": day, "teams": ["TBD", "TBD"], "score": [0,0], "played": False, 
                        "label": f"F_G{i+1}", "series_id": "F", "game_num": i+1, "neutral": True
                    })

        # Sim Playoff Matches
        if tournament_data["playoffs"]:
            po = tournament_data["playoffs"]
            all_playoff_matches = [m for r in po.get("rounds", []) for m in r["matches"]]
            if "rounds" in po:
                for r_idx, round in enumerate(po["rounds"]):
                    # Progression before each round
                    if config["type"] == "league":
                        r1, r2, r3, lf = [r["matches"] for r in po["rounds"]]
                        for g_id in sorted(tournament_data["groups"].keys()):
                            if r_idx == 1: # R2 re-seeding
                                w1 = get_series_winner(r1, f"{g_id}_R1_1", 3)
                                w2 = get_series_winner(r1, f"{g_id}_R1_2", 3)
                                if w1 and w2:
                                    table = tournament_data["groups"][g_id]["standings"]
                                    team_seeds = {t["team"]: i+1 for i, t in enumerate(table)}
                                    winners = sorted([w1, w2], key=lambda x: team_seeds[x], reverse=True)
                                    for m in r2:
                                        if m["series_id"] == f"{g_id}_R2_1" and m["teams"][1] == "TBD":
                                            m["teams"][1] = winners[0]
                                            if m["game_num"] == 2: m["teams"] = [winners[0], m["home_seed"]]
                                        elif m["series_id"] == f"{g_id}_R2_2" and m["teams"][1] == "TBD":
                                            m["teams"][1] = winners[1]
                                            if m["game_num"] == 2: m["teams"] = [winners[1], m["home_seed"]]
                            elif r_idx == 2: # R3 (Group Finals)
                                wR2_1 = get_series_winner(r2, f"{g_id}_R2_1", 3)
                                wR2_2 = get_series_winner(r2, f"{g_id}_R2_2", 3)
                                if wR2_1 and wR2_2:
                                    table = tournament_data["groups"][g_id]["standings"]
                                    team_seeds = {t["team"]: i+1 for i, t in enumerate(table)}
                                    r3_teams = sorted([wR2_1, wR2_2], key=lambda x: team_seeds[x])
                                    for m in r3:
                                        if m["series_id"] == f"{g_id}_R3" and m["teams"][0] == "TBD":
                                            if m["game_num"] in [1, 2, 5]: m["teams"] = [r3_teams[0], r3_teams[1]]
                                            else: m["teams"] = [r3_teams[1], r3_teams[0]]
                        if r_idx == 3: # League Finals
                            r3_winners = []
                            for g_id in sorted(tournament_data["groups"].keys()):
                                win = get_series_winner(all_playoff_matches, f"{g_id}_R3", 5)
                                if win: r3_winners.append(win)
                            if len(r3_winners) == 2:
                                for m in lf:
                                    if m["teams"][0] == "TBD": m["teams"] = r3_winners

                    elif config["type"] == "world_cup":
                        r24, r16, qf, sf, f = [r["matches"] for r in po["rounds"]]
                        if r_idx == 1: # R16
                            for r16_m in r16:
                                if r16_m["teams"][1] in ["TBD", None]:
                                    parent = next((m for m in r24 if m["label"] == r16_m["parent"]), None)
                                    if parent and parent["played"]: r16_m["teams"][1] = get_winner(parent)
                        elif r_idx == 2: # QF
                            for i in range(4):
                                if qf[i]["teams"][0] in ["TBD", None] and r16[i*2]["played"]: qf[i]["teams"][0] = get_winner(r16[i*2])
                                if qf[i]["teams"][1] in ["TBD", None] and r16[i*2+1]["played"]: qf[i]["teams"][1] = get_winner(r16[i*2+1])
                        elif r_idx == 3: # SF
                            for i in range(2):
                                if sf[i]["teams"][0] in ["TBD", None] and qf[i*2]["played"]: sf[i]["teams"][0] = get_winner(qf[i*2])
                                if sf[i]["teams"][1] in ["TBD", None] and qf[i*2+1]["played"]: sf[i]["teams"][1] = get_winner(qf[i*2+1])
                        elif r_idx == 4: # F
                            if sf[0]["played"] and sf[1]["played"]:
                                if f[0]["teams"][0] in ["TBD", None]: f[0]["teams"][0] = get_winner(sf[0])
                                if f[0]["teams"][1] in ["TBD", None]: f[0]["teams"][1] = get_winner(sf[1])
                                if f[1]["teams"][0] in ["TBD", None]: f[1]["teams"][0] = get_loser(sf[0])
                                if f[1]["teams"][1] in ["TBD", None]: f[1]["teams"][1] = get_loser(sf[1])

                    elif config["type"] == "afro_asia_cup" and "rounds" in po:
                        r12, qf, sf, f = [r["matches"] for r in po["rounds"]]
                        if r_idx == 1: # QF
                            for i in range(4):
                                if qf[i]["teams"][1] in ["TBD", None]:
                                    parent = next((m for m in r12 if m["label"] == qf[i]["parent"]), None)
                                    if parent and parent["played"]: qf[i]["teams"][1] = get_winner(parent)
                        elif r_idx == 2: # SF
                            for i in range(2):
                                if sf[i]["teams"][0] in ["TBD", None] and qf[i*2]["played"]: sf[i]["teams"][0] = get_winner(qf[i*2])
                                if sf[i]["teams"][1] in ["TBD", None] and qf[i*2+1]["played"]: sf[i]["teams"][1] = get_winner(qf[i*2+1])
                        elif r_idx == 3: # F
                            if sf[0]["played"] and sf[1]["played"]:
                                if f[0]["teams"][0] in ["TBD", None]: f[0]["teams"][0] = get_winner(sf[0])
                                if f[0]["teams"][1] in ["TBD", None]: f[0]["teams"][1] = get_winner(sf[1])
                                if f[1]["teams"][0] in ["TBD", None]: f[1]["teams"][0] = get_loser(sf[0])
                                if f[1]["teams"][1] in ["TBD", None]: f[1]["teams"][1] = get_loser(sf[1])

                    elif config["type"] == "aa_qualifiers" and "rounds" in po:
                        all_p_matches = [m for r in po["rounds"] for m in r["matches"]]
                        for match in round["matches"]:
                            if "parent_win" in match:
                                for i, p_label in enumerate(match["parent_win"]):
                                    if i < len(match["teams"]) and match["teams"][i] in ["TBD", None]:
                                        parent = next((m for m in all_p_matches if m["label"] == p_label), None)
                                        if parent and parent["played"]: match["teams"][i] = get_winner(parent)
                            if "parent_loss" in match:
                                offset = len(match.get("parent_win", []))
                                for i, p_label in enumerate(match["parent_loss"]):
                                    idx = i + offset
                                    if idx < len(match["teams"]) and match["teams"][idx] in ["TBD", None]:
                                        parent = next((m for m in all_p_matches if m["label"] == p_label), None)
                                        if parent and parent["played"]: match["teams"][idx] = get_loser(parent)

                    for match in round["matches"]:
                        if not match["played"] and "TBD" not in match["teams"] and None not in match["teams"]:
                            if "series_id" in match:
                                best_of = 5 if "Finals" in round["name"] else 3
                                if get_series_winner(all_playoff_matches, match["series_id"], best_of):
                                    match["played"] = True
                                    match["canceled"] = True
                                    continue

                            print(f"Playing {round['name']}: {match['teams'][0]} vs {match['teams'][1]} (HFA: {'No' if match.get('neutral') else 'Yes'})")
                            res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=True, logging=True, persist=False, hfa=not match.get('neutral'))
                            match.update(res)
                            match["played"] = True

                if config["type"] == "aa_qualifiers" and "rounds" in po:
                    r2 = po["rounds"][1]["matches"]
                    r3 = po["rounds"][2]["matches"]
                    for m in r2[:2]: # R2_W1, R2_W2
                        if m["played"]:
                            w = get_winner(m)
                            if w not in tournament_data["qualified_teams"]: tournament_data["qualified_teams"].append(w)
                    for m in r3:
                        if m["played"]:
                            w = get_winner(m)
                            if w not in tournament_data["qualified_teams"]: tournament_data["qualified_teams"].append(w)
            else:
                stages = ["semifinals", "finals"]
                for stage_key in stages:
                    if stage_key in po:
                        # Legacy progression
                        if stage_key == "finals":
                            num_pairs = len(po["finals"])
                            for i in range(num_pairs):
                                if po["finals"][i]["teams"][0] is None:
                                    if po["semifinals"][i*2]["played"] and po["semifinals"][i*2+1]["played"]:
                                        w1 = get_winner(po["semifinals"][i*2])
                                        w2 = get_winner(po["semifinals"][i*2 + 1])
                                        po["finals"][i]["teams"] = [w1, w2]
                        for match in po[stage_key]:
                            if not match["played"] and match["teams"][0] is not None and match["teams"][1] is not None:
                                print(f"Playing {stage_key.upper()}: {match['teams'][0]} vs {match['teams'][1]}")
                                res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=True, logging=True, persist=False, hfa=False)
                                match.update(res)
                                match["played"] = True
            
            # Qualifier update
            if config["type"] == "world_cup":
                final_match = po["rounds"][4]["matches"][0]
                if final_match["played"] and not tournament_data["qualified_teams"]:
                    tournament_data["qualified_teams"].append(get_winner(final_match))
            elif "finals" in po:
                final_match = po["finals"][0]
                if final_match["played"] and not tournament_data["qualified_teams"]:
                    tournament_data["qualified_teams"].append(get_winner(final_match))

    # Final update of standings for ALL groups before saving
    for g_id in tournament_data["groups"]:
        update_group_standings(tournament_data, g_id)

    # Save Output
    if config["type"] in ["world_cup", "league"]:
        check_mathematical_locks(tournament_data)

    with open(results_path, "w") as f:
        json.dump(tournament_data, f, indent=2)
    
    # Completion check
    all_playoff_played = False
    if tournament_data["playoffs"]:
        if "rounds" in tournament_data["playoffs"]:
            all_playoff_played = all(m["played"] for r in tournament_data["playoffs"]["rounds"] for m in r["matches"])
        else:
            all_playoff_played = all(m["played"] for m in tournament_data["playoffs"].get("semifinals", []) + tournament_data["playoffs"].get("finals", []))
    
    if all_playoff_played:
        if tournament_data.get("qualified_teams"):
            print(f"\nTournament Complete! Qualified: {', '.join(tournament_data['qualified_teams'])}")
        else:
            # Cup-style completion
            po = tournament_data["playoffs"]
            winner = "Unknown"
            if config.get("type") == "afro_asia_cup":
                winner = get_winner(po["rounds"][3]["matches"][0])
            elif config.get("type") == "world_cup":
                winner = get_winner(po["rounds"][4]["matches"][0])
            print(f"\nTournament Complete! Winner: {winner}")
    else:
        print(f"Progress saved. Next day: {tournament_data['current_day']}")

def rewind_tournament(tournament_path, target_day):
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(scripts_dir)
    results_path = os.path.join(base_dir, f"Tournaments/{tournament_path}/results.json")
    if not os.path.exists(results_path):
        print("Results file not found.")
        return

    with open(results_path, 'r') as f:
        tournament_data = json.load(f)

    tournament_data["current_day"] = target_day
    tournament_data["qualified_teams"] = []
    
    def delete_match_log(m):
        # 1. Try explicit log_path
        lp = m.get("log_path")
        if lp and os.path.exists(lp):
            os.remove(lp)
            return
        
        # 2. Try legacy id-based path
        if "id" in m:
            legacy_path = os.path.join(base_dir, f"Tournaments/{tournament_path}/Games/{m['id']}")
            if os.path.exists(legacy_path):
                os.remove(legacy_path)

    # Reset group stage matches played on or after target_day
    for g_id, g_data in tournament_data["groups"].items():
        for m in g_data["matches"]:
            if m["day"] >= target_day:
                if m.get("played"):
                    delete_match_log(m)
                m["played"] = False
                if "score" in m: m["score"] = [0, 0]
                if "pk_score" in m: m["pk_score"] = None
                if "events" in m: m["events"] = []
                if "player_data" in m: m["player_data"] = {}
                if "log_path" in m: m["log_path"] = ""

    # Clear playoffs entirely if they haven't finished, forcing re-initialization with correct tags/days
    if tournament_data.get("playoffs"):
        po = tournament_data["playoffs"]
        finished = False
        if "rounds" in po:
            finished = po["rounds"][-1]["matches"][0]["played"]
        else:
            finished = po.get("finals", [{}])[0].get("played", False)
        
        if not finished:
            # Delete logs for all playoff matches before clearing
            if "rounds" in po:
                for r in po["rounds"]:
                    for m in r.get("matches", []):
                        delete_match_log(m)
            elif "semifinals" in po:
                for m in po["semifinals"]: delete_match_log(m)
                for m in po.get("finals", []): delete_match_log(m)
            elif "matches" in po:
                for m in po["matches"]: delete_match_log(m)

            tournament_data["playoffs"] = None
            print(f"Playoffs cleared and logs removed for re-initialization.")

    if tournament_data["config"]["type"] == "world_cup":
        check_mathematical_locks(tournament_data)

    with open(results_path, "w") as f:
        json.dump(tournament_data, f, indent=2)
    print(f"Rewound {tournament_path} to day {target_day}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 tournament_manager.py [PATH_TO_TOURNAMENT_OR_YEAR] [--all] [--reset] [--days N] [--rewind N]")
    else:
        path_arg = sys.argv[1].strip('/')
        
        # Determine if we are running for a single tournament or a whole year/directory
        scripts_dir = os.path.dirname(os.path.abspath(__file__))
        base_dir = os.path.dirname(scripts_dir)
        target_abs_path = os.path.join(base_dir, "Tournaments", path_arg)
        
        paths_to_run = []
        if os.path.isdir(target_abs_path):
            # Check if this is a tournament directory itself
            if os.path.exists(os.path.join(target_abs_path, "config.json")):
                paths_to_run.append(path_arg)
            else:
                # Look for subdirectories that are tournaments
                for sub in sorted(os.listdir(target_abs_path)):
                    sub_path = os.path.join(path_arg, sub)
                    if os.path.exists(os.path.join(base_dir, "Tournaments", sub_path, "config.json")):
                        paths_to_run.append(sub_path)
        
        if not paths_to_run:
            print(f"Error: No valid tournaments found at {path_arg}")
            sys.exit(1)

        for current_path in paths_to_run:
            print(f"\n{'='*20}\nRUNNING: {current_path}\n{'='*20}")
            if "--rewind" in sys.argv:
                idx = sys.argv.index("--rewind")
                if idx + 1 < len(sys.argv):
                    target = int(sys.argv[idx + 1])
                    rewind_tournament(current_path, target)
            else:
                simulate_all = "--all" in sys.argv
                days_to_sim = 1
                if "--days" in sys.argv:
                    idx = sys.argv.index("--days")
                    if idx + 1 < len(sys.argv):
                        days_to_sim = int(sys.argv[idx + 1])
                
                run_tournament_step(current_path, simulate_all, days_to_sim)
