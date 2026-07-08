import os
import json
import copy
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(BASE_DIR, "lists", "club_rankings.json")
LEAGUES = ["Backyard", "Euro", "Med", "Prime", "Club Cup"]

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
                
                # Group matches
                for g_data in data.get("groups", {}).values():
                    for m in g_data.get("matches", []):
                        if m.get("played") and not m.get("canceled"):
                            m_copy = copy.deepcopy(m)
                            m_copy["league"] = league
                            m_copy["is_playoff"] = False
                            all_matches.append(m_copy)
                
                # Playoff matches
                if data.get("playoffs"):
                    po = data["playoffs"]
                    po_matches = []
                    if "rounds" in po:
                        for rd in po["rounds"]:
                            po_matches.extend(rd.get("matches", []))
                    else:
                        for key in ["semifinals", "finals", "matches"]:
                            if key in po:
                                po_matches.extend(po[key])
                                
                    for m in po_matches:
                        if m.get("played") and not m.get("canceled"):
                            m_copy = copy.deepcopy(m)
                            m_copy["league"] = league
                            m_copy["is_playoff"] = True
                            all_matches.append(m_copy)

    if not all_matches:
        print("No matches played found.")
        return

    # Sort: All regular leagues by day first, then Club Cup matches at the very end
    all_matches.sort(key=lambda x: (1 if x["league"] == "Club Cup" else 0, x["day"]))
    
    # Determine if Club Cup is the active tournament (the last one calculated)
    is_cup_active = (all_matches[-1]["league"] == "Club Cup")
    
    # Determine the "current month/stage" for the output message
    latest_match = all_matches[-1]
    current_date = get_match_date(latest_match["day"])
    current_month = current_date.month
    
    # Snapshots for movement:
    rankings_at_prev_month = {}
    
    if not is_cup_active:
        # Standard calendar month boundary
        first_day_this_month = datetime(current_date.year, current_month, 1)
        last_day_prev_month_dt = first_day_this_month - timedelta(days=1)
        base_date = datetime(2025, 2, 3)
        calendar_snapshot_day = (last_day_prev_month_dt - base_date).days + 1
    else:
        calendar_snapshot_day = -1 # Not used in Cup mode

    # 3. Process Elo
    K = 20.0
    for m in all_matches:
        # Capture snapshot for movement
        if is_cup_active:
            # If Cup is active, snapshot is the moment we transition to the first Cup match
            if m["league"] == "Club Cup" and not rankings_at_prev_month:
                items = sorted(rankings.items(), key=lambda x: x[1], reverse=True)
                for i, (team, pts) in enumerate(items):
                    rankings_at_prev_month[team] = i + 1
        else:
            # Standard calendar logic
            if m["day"] > calendar_snapshot_day and not rankings_at_prev_month and calendar_snapshot_day > 0:
                items = sorted(rankings.items(), key=lambda x: x[1], reverse=True)
                for i, (team, pts) in enumerate(items):
                    rankings_at_prev_month[team] = i + 1

        t1, t2 = m["teams"]
        if t1 not in rankings or t2 not in rankings:
            continue

        dr = rankings[t1] - rankings[t2]
        we1 = 1.0 / (pow(10, (-dr) / 600.0) + 1.0)
        we2 = 1.0 - we1
        
        # Determine match weight/score based on regulation or PKs
        s1, s2 = m["score"]
        p1, p2 = m.get("pk_score") if m.get("pk_score") else (None, None)
        
        w1, w2 = 0.5, 0.5
        if p1 is not None:
            if p1 > p2: w1, w2 = 0.75, 0.25 # Lower weight for PK win
            else: w1, w2 = 0.25, 0.75
        else:
            if s1 > s2: w1, w2 = 1.0, 0.0
            elif s2 > s1: w1, w2 = 0.0, 1.0
        
        # Calculate point changes
        change1 = K * (w1 - we1)
        change2 = K * (w2 - we2)
        
        # If it's a playoff match, team points cannot decrease (only 0 or positive)
        if m.get("is_playoff"):
            change1 = max(0, change1)
            change2 = max(0, change2)
            
        rankings[t1] += change1
        rankings[t2] += change2

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
            "is_new": False
        })

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(final_list, f, indent=2)
    
    status_label = "Club Cup" if is_cup_active else f"Month {current_month}"
    print(f"Club Rankings updated! Snapshot mode: {status_label}. Output: {OUTPUT_FILE}")

if __name__ == "__main__":
    recalculate()
