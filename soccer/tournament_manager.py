import json
import os
import soccer_driver
import sys
import shutil
import random

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

def sort_standings(standings, matches):
    teams = list(standings.keys())
    # Initial sort by points
    teams.sort(key=lambda t: standings[t]["pts"], reverse=True)
    
    final_sorted = []
    i = 0
    while i < len(teams):
        j = i + 1
        while j < len(teams) and standings[teams[j]]["pts"] == standings[teams[i]]["pts"]:
            j += 1
        
        cluster = teams[i:j]
        if len(cluster) > 1:
            # Step one: H2H among tied teams
            h2h_stats = get_h2h_stats(cluster, matches)
            # Sort cluster by H2H stats
            cluster.sort(key=lambda t: (h2h_stats[t]["pts"], h2h_stats[t]["gd"], h2h_stats[t]["gf"]), reverse=True)
            
            # Identify sub-clusters that are still tied after H2H
            k = 0
            while k < len(cluster):
                l = k + 1
                while l < len(cluster) and \
                      h2h_stats[cluster[l]]["pts"] == h2h_stats[cluster[k]]["pts"] and \
                      h2h_stats[cluster[l]]["gd"] == h2h_stats[cluster[k]]["gd"] and \
                      h2h_stats[cluster[l]]["gf"] == h2h_stats[cluster[k]]["gf"]:
                    l += 1
                
                sub_cluster = cluster[k:l]
                if len(sub_cluster) > 1:
                    # Step two: Overall GD and GS
                    sub_cluster.sort(key=lambda t: (standings[t]["gd"], standings[t]["gf"]), reverse=True)
                
                for team in sub_cluster:
                    stats = standings[team]
                    stats["team"] = team
                    final_sorted.append(stats)
                k = l
        else:
            team = cluster[0]
            stats = standings[team]
            stats["team"] = team
            final_sorted.append(stats)
        i = j
    
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

def initialize_tournament(base_path, tournament_path, config):
    print(f"Generating optimized schedule for {config['name']}...")
    
    target_density = config["rules"].get("target_density")
    
    def attempt_schedule():
        # 1. Collect teams and build pool
        all_teams = []
        for g_id, teams in config["groups"].items():
            all_teams.extend(teams)

        repeats = config["rules"].get("group_repeats", 1)
        match_pool = []
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
        first_group = next(iter(config["groups"]))
        games_per_leg = len(config["groups"][first_group]) - 1

        local_pool = list(match_pool)
        while local_pool:
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
    if tournament_data["config"]["type"] != "world_cup": return
    if not tournament_data.get("playoffs") or "rounds" not in tournament_data["playoffs"]: return

    import copy

    po = tournament_data["playoffs"]
    r24 = po["rounds"][0]["matches"]
    r16 = po["rounds"][1]["matches"]
    
    # 1. Determine locks for each group
    locks = {}
    for g_id, g_teams in tournament_data["config"]["groups"].items():
        standings = tournament_data["groups"][g_id]["standings"]
        matches = tournament_data["groups"][g_id]["matches"]
        remaining = [m for m in matches if not m["played"]]
        
        if not remaining:
            # All matches played, everything is locked
            for i, s in enumerate(standings):
                locks[f"{g_id}{i+1}"] = s["team"]
            continue
            
        # If too many remaining matches, permutation will be too slow. 
        # But group stage usually has few games left when locks matter.
        # Max games remaining for a team is usually 1-2 at this stage.
        if len(remaining) > 6:
            # Fallback to current simple logic if too many games (optimization)
            continue

        rank_possibilities = {t: set() for t in g_teams}
        
        def simulate_remaining(m_idx, current_matches):
            if m_idx == len(remaining):
                # Calculate standings for this outcome
                sim_results = {}
                for t in g_teams:
                    sim_results[t] = {"played": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "gd": 0, "pts": 0}
                
                # Apply played matches
                for m in [m for m in matches if m["played"]]:
                    update_standings(sim_results, m)
                # Apply simulated matches
                for m in current_matches:
                    update_standings(sim_results, m)
                
                sorted_sim = sort_standings(sim_results, matches) # Matches includes simulated scores now
                for rank, s in enumerate(sorted_sim):
                    rank_possibilities[s["team"]].add(rank + 1)
                return

            m = remaining[m_idx]
            # Try 3 outcomes: Home win (1-0), Away win (0-1), Draw (0-0)
            # (Scores don't matter for H2H points, and we don't assume GD/GS)
            for s1, s2 in [(1, 0), (0, 1), (0, 0)]:
                m_copy = copy.deepcopy(m)
                m_copy["score"] = [s1, s2]
                m_copy["played"] = True
                simulate_remaining(m_idx + 1, current_matches + [m_copy])

        simulate_remaining(0, [])
        
        for team, ranks in rank_possibilities.items():
            if len(ranks) == 1:
                locked_rank = list(ranks)[0]
                locks[f"{g_id}{locked_rank}"] = team

    # 2. Apply locks
    for m in r24:
        source = m.get("source", [])
        if source[0] in locks: m["teams"][0] = locks[source[0]]
        if source[1] in locks: m["teams"][1] = locks[source[1]]
    
    for m in r16:
        source = m.get("source", [])
        if source[0] in locks: m["teams"][0] = locks[source[0]]

    # 2. Apply locks
    for m in r24:
        source = m.get("source", [])
        if source[0] in locks: m["teams"][0] = locks[source[0]]
        if source[1] in locks: m["teams"][1] = locks[source[1]]
    
    for m in r16:
        source = m.get("source", [])
        if source[0] in locks: m["teams"][0] = locks[source[0]]

def update_group_standings(tournament_data, g_id):
    results = {}
    matches = tournament_data["groups"][g_id]["matches"]
    for match in matches:
        if match["played"]:
            update_standings(results, match)
    
    # Ensure all teams are in standings even if they haven't played
    for team in tournament_data["config"]["groups"][g_id]:
        if team not in results:
            results[team] = {"played": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "gd": 0, "pts": 0}
    
    tournament_data["groups"][g_id]["standings"] = sort_standings(results, matches)
    check_mathematical_locks(tournament_data)

def run_tournament_step(path_arg, simulate_all=False, days_to_sim=1):
    tournament_path = path_arg.strip('/')
    base_path = f"Tournaments/{tournament_path}"
    config_path = f"{base_path}/config.json"
    results_path = f"{base_path}/results.json"

    if not os.path.exists(config_path):
        print(f"Error: Could not find config.json at {config_path}")
        return

    with open(config_path, 'r') as f:
        config = json.load(f)

    if "--reset" in sys.argv or not os.path.exists(results_path):
        tournament_data = initialize_tournament(base_path, tournament_path, config)
        games_dir = f"{base_path}/Games"
        if os.path.exists(games_dir):
            shutil.rmtree(games_dir)
        os.makedirs(games_dir, exist_ok=True)
    else:
        with open(results_path, 'r') as f:
            tournament_data = json.load(f)

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
                        res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=False, logging=True, persist=False)
                        match.update(res)
                        match["played"] = True
                        matches_simulated += 1
            update_group_standings(tournament_data, g_id)

        # 2. Check for Playoff Transition or Direct Qualification
        if group_stage_complete:
            if config["type"] == "asia_qualifiers" and tournament_data["playoffs"] is None:
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

                d_r24, d_r16, d_qf, d_sf, d_f = [last_day + i for i in [2, 5, 8, 11, 14]]

                po = tournament_data["playoffs"]
                if not po or "rounds" not in po:
                    # (Fallback if not initialized, though it should be)
                    po = {"rounds": [{"name": n, "matches": []} for n in ["Round of 24", "Round of 16", "Quarterfinals", "Semifinals", "Finals"]]}
                    tournament_data["playoffs"] = po

                # Round of 24
                po["rounds"][0]["matches"] = [
                    {"day": d_r24, "teams": [seeds["A2"], seeds["B3"]], "score": [0, 0], "played": False, "label": "R24_1"},
                    {"day": d_r24, "teams": [seeds["C2"], seeds["D3"]], "score": [0, 0], "played": False, "label": "R24_2"},
                    {"day": d_r24, "teams": [seeds["E2"], seeds["F3"]], "score": [0, 0], "played": False, "label": "R24_3"},
                    {"day": d_r24, "teams": [seeds["G2"], seeds["H3"]], "score": [0, 0], "played": False, "label": "R24_4"},
                    {"day": d_r24, "teams": [seeds["B2"], seeds["A3"]], "score": [0, 0], "played": False, "label": "R24_5"},
                    {"day": d_r24, "teams": [seeds["D2"], seeds["C3"]], "score": [0, 0], "played": False, "label": "R24_6"},
                    {"day": d_r24, "teams": [seeds["F2"], seeds["E3"]], "score": [0, 0], "played": False, "label": "R24_7"},
                    {"day": d_r24, "teams": [seeds["H2"], seeds["G3"]], "score": [0, 0], "played": False, "label": "R24_8"}
                ]

                # Round of 16
                po["rounds"][1]["matches"] = [
                    {"day": d_r16, "teams": [seeds["E1"], None], "score": [0, 0], "played": False, "parent": "R24_1", "label": "R16_1"},
                    {"day": d_r16, "teams": [seeds["F1"], None], "score": [0, 0], "played": False, "parent": "R24_2", "label": "R16_2"},
                    {"day": d_r16, "teams": [seeds["A1"], None], "score": [0, 0], "played": False, "parent": "R24_3", "label": "R16_3"},
                    {"day": d_r16, "teams": [seeds["B1"], None], "score": [0, 0], "played": False, "parent": "R24_4", "label": "R16_4"},
                    {"day": d_r16, "teams": [seeds["G1"], None], "score": [0, 0], "played": False, "parent": "R24_5", "label": "R16_5"},
                    {"day": d_r16, "teams": [seeds["H1"], None], "score": [0, 0], "played": False, "parent": "R24_6", "label": "R16_6"},
                    {"day": d_r16, "teams": [seeds["C1"], None], "score": [0, 0], "played": False, "parent": "R24_7", "label": "R16_7"},
                    {"day": d_r16, "teams": [seeds["D1"], None], "score": [0, 0], "played": False, "parent": "R24_8", "label": "R16_8"}
                ]

                po["rounds"][2]["matches"] = [{"day": d_qf, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": f"QF_{i+1}"} for i in range(4)]
                po["rounds"][3]["matches"] = [{"day": d_sf, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": f"SF_{i+1}"} for i in range(2)]
                po["rounds"][4]["matches"] = [
                    {"day": d_f, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "F"},
                    {"day": d_f, "teams": ["TBD", "TBD"], "score": [0, 0], "played": False, "label": "3P"}
                ]
                
                print(f"World Cup knockout stage finalized.")

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
            def get_winner(res):
                if res.get("pk_score"): return res["teams"][0] if res["pk_score"][0] > res["pk_score"][1] else res["teams"][1]
                return res["teams"][0] if res["score"][0] > res["score"][1] else res["teams"][1]
            def get_loser(res):
                winner = get_winner(res)
                return res["teams"][0] if res["teams"][1] == winner else res["teams"][1]

            # Generalized playoff stage simulation
            po = tournament_data["playoffs"]
            if "rounds" in po:
                for round in po["rounds"]:
                    for match in round["matches"]:
                        if not match["played"] and "TBD" not in match["teams"] and None not in match["teams"] and match["day"] == current_day:
                            print(f"Playing {round['name']}: {match['teams'][0]} vs {match['teams'][1]}")
                            res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=True, logging=True, persist=False)
                            match.update(res)
                            match["played"] = True
                            matches_simulated += 1
            else:
                stages = ["semifinals", "finals"]
                for stage_key in stages:
                    if stage_key in po:
                        for match in po[stage_key]:
                            if not match["played"] and match["teams"][0] is not None and match["teams"][1] is not None and match["day"] == current_day:
                                print(f"Playing {stage_key.upper()}: {match['teams'][0]} vs {match['teams'][1]}")
                                res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=True, logging=True, persist=False)
                                match.update(res)
                                match["played"] = True
                                matches_simulated += 1

            # Progression logic
            if config["type"] == "world_cup" and "rounds" in po:
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

            # Legacy Semifinals -> Finals (Asia/Europe)
            elif "semifinals" in po and any(f["teams"][0] is None for f in po["finals"]):
                num_pairs = len(po["finals"])
                for i in range(num_pairs):
                    if po["semifinals"][i*2]["played"] and po["semifinals"][i*2+1]["played"]:
                        w1 = get_winner(po["semifinals"][i*2])
                        w2 = get_winner(po["semifinals"][i*2 + 1])
                        po["finals"][i]["teams"] = [w1, w2]

            # Qualifier update
            final_match = po["rounds"][4]["matches"][0] if "rounds" in po else po["finals"][0]
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
                    res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=False, logging=True, persist=False)
                    match.update(res)
                    match["played"] = True
            update_group_standings(tournament_data, g_id)
        
        # Scheduling playoffs if not already done
        if tournament_data["playoffs"] is None:
             pass # Assumes pre-init or handled in loop

        # Sim Playoff Matches
        if tournament_data["playoffs"]:
            po = tournament_data["playoffs"]
            if "rounds" in po:
                for r_idx, round in enumerate(po["rounds"]):
                    # Progression before each round
                    if config["type"] == "world_cup":
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

                    for match in round["matches"]:
                        if not match["played"] and "TBD" not in match["teams"] and None not in match["teams"]:
                            print(f"Playing {round['name']}: {match['teams'][0]} vs {match['teams'][1]}")
                            res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=True, logging=True, persist=False)
                            match.update(res)
                            match["played"] = True
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
                                res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=True, logging=True, persist=False)
                                match.update(res)
                                match["played"] = True
            
            final_match = po["rounds"][4]["matches"][0] if "rounds" in po else po["finals"][0]
            if final_match["played"] and not tournament_data["qualified_teams"]:
                tournament_data["qualified_teams"].append(get_winner(final_match))

    # Save Output
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
         print(f"\nTournament Complete! Qualified: {', '.join(tournament_data['qualified_teams'])}")
    else:
        print(f"Progress saved. Next day: {tournament_data['current_day']}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 tournament_manager.py [PATH_TO_TOURNAMENT] [--all] [--reset] [--days N]")
    else:
        simulate_all = "--all" in sys.argv
        days_to_sim = 1
        if "--days" in sys.argv:
            idx = sys.argv.index("--days")
            if idx + 1 < len(sys.argv):
                days_to_sim = int(sys.argv[idx + 1])
        
        run_tournament_step(sys.argv[1], simulate_all, days_to_sim)
