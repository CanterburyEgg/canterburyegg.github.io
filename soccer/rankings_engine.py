import os
import json
import sys
import re
import copy

# Add current directory to path to import driver
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)
import soccer_driver

CONFIG_FILE = os.path.join(BASE_DIR, "rankings_config.json")
RANKINGS_FILE = os.path.join(BASE_DIR, "rankings.json")

def get_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {"tournaments": []}

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

def generate_winprob_matrix(tournament_path, runs=1000):
    full_path = os.path.join(BASE_DIR, "Tournaments", tournament_path)
    matrix_path = os.path.join(full_path, "winprob_matrix.json")
    config_path = os.path.join(full_path, "config.json")
    
    if os.path.exists(matrix_path):
        with open(matrix_path, 'r') as f:
            return json.load(f)

    print(f"Generating winprob matrix for {tournament_path}...")
    if not os.path.exists(config_path):
        print(f"Error: config.json not found for {tournament_path}")
        return {}

    with open(config_path, 'r') as f:
        config = json.load(f)
    
    teams = []
    for group_teams in config["groups"].values():
        teams.extend(group_teams)
    teams = list(set(teams))
    
    matrix = {}
    for i, t1 in enumerate(teams):
        matrix[t1] = {}
        for j, t2 in enumerate(teams):
            if i == j: continue
            
            t1w, t2w = 0, 0
            for _ in range(runs):
                res = soccer_driver.play_game(tournament_path, t1, t2, False, False, False)
                if res['score'][0] > res['score'][1]: t1w += 1
                elif res['score'][1] > res['score'][0]: t2w += 1
            
            prob = 0.5
            if t1w + t2w > 0:
                prob = t1w / (t1w + t2w)
            matrix[t1][t2] = prob
        print(f"Matrix progress: {i+1}/{len(teams)} teams")

    with open(matrix_path, 'w') as f:
        json.dump(matrix, f, indent=2)
    return matrix

def find_log_file(tournament_path, match):
    # Try the explicit log_path first
    log_path = match.get("log_path")
    if log_path and os.path.exists(log_path): return log_path
    
    # Try constructing it from the tournament path and match data
    t1, t2 = match["teams"]
    # 2022 AS specific hack for ASk directory
    search_dirs = [os.path.join(BASE_DIR, "Tournaments", tournament_path, "Games")]
    if "2022/AS" in tournament_path:
        search_dirs.append(os.path.join(BASE_DIR, "Tournaments/2022/ASk/Games"))

    # Match ID check
    match_id = match.get("id")
    for d in search_dirs:
        if not os.path.exists(d): continue
        if match_id and os.path.exists(os.path.join(d, match_id)):
            return os.path.join(d, match_id)
        
        # Fuzzy match by team names
        try:
            files = os.listdir(d)
            for f in files:
                if t1 in f and t2 in f:
                    return os.path.join(d, f)
        except: continue
    return None

def get_team_stats_sum(tournament_path, team_name):
    path = os.path.join(BASE_DIR, "Tournaments", tournament_path, "Teams", f"{team_name}.txt")
    if not os.path.exists(path): return 20 # Fallback if missing
    
    with open(path, 'r') as f:
        lines = [l.strip() for l in f.readlines() if l.strip()]
        # Stats are the last 4 lines
        try:
            stats = [float(l) for l in lines[-4:]]
            return sum(stats)
        except:
            return 20

def recalculate_all():
    config = get_config()
    rankings = {} # team -> pts
    
    # 1. Gather ALL matches from ALL configured tournaments
    all_matches = []
    
    # Sort tournaments: exclusively by preservation of the order they were added
    # (assuming the user adds them chronologically regardless of year)
    def tourney_sort_key(t):
        original_idx = 0
        for i, tc in enumerate(config["tournaments"]):
            if tc["path"] == t["path"]:
                original_idx = i
                break
        return original_idx

    sorted_tourneys = sorted(config["tournaments"], key=tourney_sort_key)
    
    for idx, t_conf in enumerate(sorted_tourneys):
        t_path = t_conf["path"]
        importance = t_conf["importance"]
        res_path = os.path.join(BASE_DIR, "Tournaments", t_path, "results.json")
        
        if not os.path.exists(res_path): continue
        with open(res_path, 'r') as f:
            data = json.load(f)
        
        # Load or generate matrix for this tournament
        matrix = generate_winprob_matrix(t_path)
        
        year = int(t_path.split('/')[0])
        
        # Group stage
        for g_id, g_data in data.get("groups", {}).items():
            for m in g_data.get("matches", []):
                if m.get("played"):
                    m_data = copy.deepcopy(m)
                    m_data["importance"] = importance
                    m_data["year"] = year
                    m_data["tourney_idx"] = idx
                    m_data["matrix"] = matrix
                    m_data["is_knockout"] = False
                    m_data["tournament_path"] = t_path
                    all_matches.append(m_data)
        
        # Playoffs
        po = data.get("playoffs")
        if po:
            p_matches = []
            if "rounds" in po:
                for r in po["rounds"]: p_matches.extend(r.get("matches", []))
            elif "matches" in po:
                p_matches.extend(po["matches"])
            else:
                p_matches.extend(po.get("semifinals", []) + po.get("finals", []))
            
            for m in p_matches:
                if m.get("played"):
                    m_data = copy.deepcopy(m)
                    m_data["importance"] = importance
                    m_data["year"] = year
                    m_data["tourney_idx"] = idx
                    m_data["matrix"] = matrix
                    m_data["is_knockout"] = True
                    m_data["tournament_path"] = t_path
                    all_matches.append(m_data)

    # 2. Sort by Tourney Index, then Day
    all_matches.sort(key=lambda x: (x["tourney_idx"], x.get("day", 0)))

    # 3. Process Timeline
    print(f"Processing {len(all_matches)} matches across all tournaments...")
    
    verbose_team = "Morocco"
    last_tourney_path = sorted_tourneys[-1]["path"] if sorted_tourneys else None
    rankings_before_last = {}

    for m in all_matches:
        t1, t2 = m["teams"]
        # Stat-based initialization for new teams
        if t1 not in rankings: 
            rankings[t1] = get_team_stats_sum(m["tournament_path"], t1) * 50
        if t2 not in rankings: 
            rankings[t2] = get_team_stats_sum(m["tournament_path"], t2) * 50
        
        # Capture state before last tourney matches start
        if last_tourney_path and m["tournament_path"] == last_tourney_path and not rankings_before_last:
            items = sorted(rankings.items(), key=lambda x: x[1], reverse=True)
            for rank, (team, pts) in enumerate(items):
                rankings_before_last[team] = rank + 1
            print(f"Snapshot taken before {last_tourney_path}. Teams in snapshot: {len(rankings_before_last)}")
            if "Ghana" in rankings_before_last:
                print(f"Ghana is in snapshot at rank {rankings_before_last['Ghana']}")
            else:
                print("Ghana is NOT in snapshot!")

        we1 = m["matrix"].get(t1, {}).get(t2, 0.5)
        we2 = 1.0 - we1
        
        s1, s2 = m["score"]
        w1, w2 = 0.5, 0.5
        if s1 > s2: w1, w2 = 1.0, 0.0
        elif s2 > s1: w1, w2 = 0.0, 1.0
        
        # ELO Rules
        importance = m["importance"]
        
        # Team 1 Change
        if m["is_knockout"] and m["importance"] >= 40:
            if w1 == 1.0:
                multiplier = 1.0
                if m.get("pk_score"): multiplier = 0.5
                else:
                    is_ot = m.get("is_ot", False)
                    if not is_ot:
                        log_path = find_log_file(m["tournament_path"], m)
                        if log_path:
                            with open(log_path, 'r') as f:
                                if "--- EXTRA TIME ---" in f.read(): is_ot = True
                        if not is_ot and any(e["minute"] > 90 for e in m.get("events", [])): is_ot = True
                    if is_ot: multiplier = 0.75
                diff1 = importance * (1.0 - we1) * multiplier
            else:
                diff1 = 0 
        else:
            diff1 = importance * (w1 - we1)
            
        # Team 2 Change
        if m["is_knockout"] and m["importance"] >= 40:
            if w2 == 1.0:
                multiplier = 1.0
                if m.get("pk_score"): multiplier = 0.5
                else:
                    is_ot = m.get("is_ot", False)
                    if not is_ot:
                        log_path = find_log_file(m["tournament_path"], m)
                        if log_path:
                            with open(log_path, 'r') as f:
                                if "--- EXTRA TIME ---" in f.read(): is_ot = True
                        if not is_ot and any(e["minute"] > 90 for e in m.get("events", [])): is_ot = True
                    if is_ot: multiplier = 0.75
                diff2 = importance * (1.0 - we2) * multiplier
            else:
                diff2 = 0
        else:
            diff2 = importance * (w2 - we2)

        rankings[t1] += diff1
        rankings[t2] += diff2

        if t1 == verbose_team or t2 == verbose_team:
            p_we = we1 if t1 == verbose_team else we2
            p_diff = diff1 if t1 == verbose_team else diff2
            p_res = f"{s1}-{s2}" if t1 == verbose_team else f"{s2}-{s1}"
            opp = t2 if t1 == verbose_team else t1
            print(f"[{verbose_team}] vs {opp} | Prob: {p_we:.1%} | Res: {p_res} | Pts: {p_diff:+.1f} | New: {rankings[verbose_team]:.1f}")


    # 4. Save Final Rankings with Movement
    sorted_list = []
    items = sorted(rankings.items(), key=lambda x: x[1], reverse=True)
    for rank, (team, pts) in enumerate(items):
        new_rank = rank + 1
        old_rank = rankings_before_last.get(team)
        movement = old_rank - new_rank if old_rank is not None else 0
        
        sorted_list.append({
            "rank": new_rank, 
            "team": team, 
            "points": round(pts, 1),
            "movement": movement,
            "is_new": old_rank is None
        })
    
    with open(RANKINGS_FILE, 'w') as f:
        json.dump(sorted_list, f, indent=2)
    print(f"Global rankings updated based on {len(config['tournaments'])} tournaments.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 rankings_engine.py add <path> <importance>")
        print("  python3 rankings_engine.py recalculate")
        sys.exit(1)
        
    cmd = sys.argv[1]
    if cmd == "add":
        path = sys.argv[2]
        imp = float(sys.argv[3])
        config = get_config()
        if not any(t["path"] == path for t in config["tournaments"]):
            config["tournaments"].append({"path": path, "importance": imp})
            save_config(config)
        recalculate_all()
    elif cmd == "recalculate":
        recalculate_all()
    elif cmd == "remove":
        path = sys.argv[2]
        config = get_config()
        config["tournaments"] = [t for t in config["tournaments"] if t["path"] != path]
        save_config(config)
        recalculate_all()
