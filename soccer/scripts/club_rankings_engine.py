import os
import json
import copy
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(BASE_DIR, "lists", "club_rankings.json")
LEAGUES = ["Backyard", "Euro", "Med", "Prime"]

def get_match_date(day):
    # Day 1 = Feb 3, 2025
    base_date = datetime(2025, 2, 3)
    return base_date + timedelta(days=day - 1)

def get_team_stats_sum(league, team_name):
    json_path = os.path.join(BASE_DIR, "Tournaments", "2025", league, "Teams", f"{team_name}.json")
    if os.path.exists(json_path):
        with open(json_path, 'r') as f:
            data = json.load(f)
            r = data.get("ratings", {})
            return r.get("offense", 5) + r.get("speed", 5) + r.get("defense", 5) + r.get("gk", 5)
    
    # Fallback to legacy TXT
    path = os.path.join(BASE_DIR, "Tournaments", "2025", league, "Teams", f"{team_name}.txt")
    if not os.path.exists(path):
        return 20
    with open(path, 'r') as f:
        lines = [l.strip() for l in f.readlines() if l.strip()]
        try:
            stats = [float(l) for l in lines[-4:]]
            return sum(stats)
        except:
            return 20

def recalculate():
    rankings = {}
    
    # 1. Initialize all teams
    for league in LEAGUES:
        conf_path = os.path.join(BASE_DIR, "Tournaments", "2025", league, "config.json")
        if os.path.exists(conf_path):
            with open(conf_path, 'r') as f:
                conf = json.load(f)
                for group_teams in conf.get("groups", {}).values():
                    for t in group_teams:
                        stat_sum = get_team_stats_sum(league, t)
                        # Identical formula to world rankings, but with a -150 offset for clubs
                        rankings[t] = 850 + (stat_sum - 20) * 25

    # 2. Gather all played matches
    all_matches = []
    for league in LEAGUES:
        res_path = os.path.join(BASE_DIR, "Tournaments", "2025", league, "results.json")
        if os.path.exists(res_path):
            with open(res_path, 'r') as f:
                data = json.load(f)
                for g_data in data.get("groups", {}).values():
                    for m in g_data.get("matches", []):
                        if m.get("played"):
                            m_copy = copy.deepcopy(m)
                            all_matches.append(m_copy)

    all_matches.sort(key=lambda x: x["day"])
    
    # Determine the "current month" of the simulation
    latest_day = all_matches[-1]["day"] if all_matches else 0
    current_date = get_match_date(latest_day) if latest_day > 0 else datetime(2025, 2, 3)
    current_month = current_date.month
    current_year = current_date.year

    # Snapshots for movement: Compare current rank vs end of previous month
    # Find the last day of the previous month
    first_day_this_month = datetime(current_year, current_month, 1)
    last_day_prev_month_dt = first_day_this_month - timedelta(days=1)
    
    # Convert that date back to simulation "day"
    # day = (date - base_date).days + 1
    base_date = datetime(2025, 2, 3)
    last_day_prev_month_sim = (last_day_prev_month_dt - base_date).days + 1
    
    rankings_at_prev_month = {}
    
    # 3. Process Elo
    K = 20.0
    for m in all_matches:
        # If this match is the FIRST one past the previous month's boundary, 
        # capture the state before it.
        if m["day"] > last_day_prev_month_sim and not rankings_at_prev_month and last_day_prev_month_sim > 0:
            items = sorted(rankings.items(), key=lambda x: x[1], reverse=True)
            for i, (team, pts) in enumerate(items):
                rankings_at_prev_month[team] = i + 1

        t1, t2 = m["teams"]
        dr = rankings[t1] - rankings[t2]
        we1 = 1.0 / (pow(10, (-dr) / 600.0) + 1.0)
        we2 = 1.0 - we1
        
        s1, s2 = m["score"]
        w1, w2 = 0.5, 0.5
        if s1 > s2: w1, w2 = 1.0, 0.0
        elif s2 > s1: w1, w2 = 0.0, 1.0
        
        rankings[t1] += K * (w1 - we1)
        rankings[t2] += K * (w2 - we2)

    # 4. Generate Output
    final_list = []
    sorted_items = sorted(rankings.items(), key=lambda x: x[1], reverse=True)
    
    for i, (team, pts) in enumerate(sorted_items):
        cur_rank = i + 1
        old_rank = rankings_at_prev_month.get(team)
        movement = (old_rank - cur_rank) if old_rank else 0
        
        final_list.append({
            "rank": cur_rank,
            "team": team,
            "points": round(pts, 1),
            "movement": movement,
            "is_new": False # We don't really have "new" teams in the league mid-season
        })

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(final_list, f, indent=2)
    
    print(f"Club Rankings updated! Snapshot month: {current_month}. Output: {OUTPUT_FILE}")

if __name__ == "__main__":
    recalculate()
