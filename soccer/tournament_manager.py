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

def sort_standings(standings):
    sorted_list = []
    for team, stats in standings.items():
        stats["team"] = team
        sorted_list.append(stats)
    return sorted(sorted_list, key=lambda x: (x["pts"], x["gd"], x["gf"]), reverse=True)

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

def update_group_standings(tournament_data, g_id):
    results = {}
    for match in tournament_data["groups"][g_id]["matches"]:
        if match["played"]:
            update_standings(results, match)
    
    # Ensure all teams are in standings even if they haven't played
    for team in tournament_data["config"]["groups"][g_id]:
        if team not in results:
            results[team] = {"played": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "gd": 0, "pts": 0}
    
    tournament_data["groups"][g_id]["standings"] = sort_standings(results)

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
                if res["pk_score"]: return res["teams"][0] if res["pk_score"][0] > res["pk_score"][1] else res["teams"][1]
                return res["teams"][0] if res["score"][0] > res["score"][1] else res["teams"][1]

            for match in tournament_data["playoffs"]["semifinals"]:
                if not match["played"] and match["day"] == current_day:
                    print(f"Playing Semifinal: {match['teams'][0]} vs {match['teams'][1]}")
                    res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=True, logging=True, persist=False)
                    match.update(res)
                    match["played"] = True
                    matches_simulated += 1

            if all(m["played"] for m in tournament_data["playoffs"]["semifinals"]) and any(f["teams"][0] is None for f in tournament_data["playoffs"]["finals"]):
                # Pair semis for finals
                # For Asia: 1 pair. For Europe: 2 pairs.
                num_pairs = len(tournament_data["playoffs"]["finals"])
                for i in range(num_pairs):
                    w1 = get_winner(tournament_data["playoffs"]["semifinals"][i*2])
                    w2 = get_winner(tournament_data["playoffs"]["semifinals"][i*2 + 1])
                    tournament_data["playoffs"]["finals"][i]["teams"] = [w1, w2]

            # Finals
            for match in tournament_data["playoffs"]["finals"]:
                if not match["played"] and match["teams"][0] is not None and match["day"] == current_day:
                    print(f"Playing Final: {match['teams'][0]} vs {match['teams'][1]}")
                    res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=True, logging=True, persist=False)
                    match.update(res)
                    match["played"] = True
                    matches_simulated += 1
                    tournament_data["qualified_teams"].append(get_winner(match))

        if matches_simulated == 0:
            print("No matches scheduled for today.")
        
        tournament_data["current_day"] += 1

    # Hande --all separately for simplicity
    if simulate_all:
        def get_winner(res):
            if res["pk_score"]: return res["teams"][0] if res["pk_score"][0] > res["pk_score"][1] else res["teams"][1]
            return res["teams"][0] if res["score"][0] > res["score"][1] else res["teams"][1]

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
            # (Same scheduling logic as above, condensed)
            last_day = 0
            for g in tournament_data["groups"].values():
                for m in g["matches"]: last_day = max(last_day, m["day"])
            if config["type"] == "asia_qualifiers":
                playoff_teams = {"A": [], "B": []}
                for g_id in ["A", "B"]:
                    table = tournament_data["groups"][g_id]["standings"]
                    for i in range(config["rules"]["direct_qualifiers_per_group"]): tournament_data["qualified_teams"].append(table[i]["team"])
                    for idx in config["rules"]["playoff_spots_per_group"]: playoff_teams[g_id].append(table[idx]["team"])
                tournament_data["playoffs"] = {
                    "semifinals": [{"day": last_day+2, "teams": [playoff_teams["A"][0], playoff_teams["B"][1]], "played": False},
                                   {"day": last_day+2, "teams": [playoff_teams["B"][0], playoff_teams["A"][1]], "played": False}],
                    "finals": [{"day": last_day+4, "teams": [None, None], "played": False}]
                }
            elif config["type"] == "europe_qualifiers":
                # Direct Qualifiers (Top 3)
                for g_id in ["A", "B", "C", "D"]:
                    table = tournament_data["groups"][g_id]["standings"]
                    for i in range(3): tournament_data["qualified_teams"].append(table[i]["team"])
                # Playoff teams (4th and 5th)
                teams = {g_id: [tournament_data["groups"][g_id]["standings"][i]["team"] for i in [3, 4]] for g_id in ["A", "B", "C", "D"]}
                tournament_data["playoffs"] = {
                    "semifinals": [
                        {"day": last_day+2, "teams": [teams["A"][0], teams["B"][1]], "played": False},
                        {"day": last_day+2, "teams": [teams["C"][0], teams["D"][1]], "played": False},
                        {"day": last_day+2, "teams": [teams["B"][0], teams["A"][1]], "played": False},
                        {"day": last_day+2, "teams": [teams["D"][0], teams["C"][1]], "played": False}
                    ],
                    "finals": [{"day": last_day+4, "teams": [None, None], "played": False},
                               {"day": last_day+4, "teams": [None, None], "played": False}]
                }

        # Sim Playoff Matches
        for match in tournament_data["playoffs"]["semifinals"]:
            if not match["played"]:
                res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=True, logging=True, persist=False)
                match.update(res)
                match["played"] = True
        
        # Populate finals
        num_pairs = len(tournament_data["playoffs"]["finals"])
        for i in range(num_pairs):
            if tournament_data["playoffs"]["finals"][i]["teams"][0] is None:
                w1 = get_winner(tournament_data["playoffs"]["semifinals"][i*2])
                w2 = get_winner(tournament_data["playoffs"]["semifinals"][i*2 + 1])
                tournament_data["playoffs"]["finals"][i]["teams"] = [w1, w2]
        
        for match in tournament_data["playoffs"]["finals"]:
            if not match["played"]:
                res = soccer_driver.play_game(tournament_path, match['teams'][0], match['teams'][1], elim=True, logging=True, persist=False)
                match.update(res)
                match["played"] = True
                tournament_data["qualified_teams"].append(get_winner(match))

    # Save Output
    with open(results_path, "w") as f:
        json.dump(tournament_data, f, indent=2)
    
    # Completion check
    all_playoff_played = False
    if tournament_data["playoffs"]:
        all_playoff_played = all(m["played"] for m in tournament_data["playoffs"]["semifinals"] + tournament_data["playoffs"]["finals"])
    
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
