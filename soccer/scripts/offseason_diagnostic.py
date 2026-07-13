import json
import os
import csv
import random

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROSTERS_FILE = os.path.join(BASE_DIR, "lists", "league_rosters.json")
PLAYER_FILE = os.path.join(BASE_DIR, "lists", "full_player_list.tsv")
TOURNAMENTS_DIR = os.path.join(BASE_DIR, "Tournaments", "2025")
DIAGNOSTIC_FILE = os.path.join(BASE_DIR, "lists", "offseason_diagnostic.json")

LEAGUES = ["Backyard", "Prime", "Euro", "Med"]

def calc_overall(pos, sh, sp, df, gk):
    if pos == "FWD": val = ((sh * 3) + sp) / 4.0
    elif pos == "MID": val = (sh + (sp * 2) + df) / 4.0
    elif pos == "DEF": val = (sh + (sp * 2) + (df * 3)) / 6.0
    else: val = (df + (gk * 4)) / 5.0
    val += sh/100.0 if pos=="FWD" else (sp/100.0 if pos=="MID" else (df/100.0 if pos=="DEF" else gk/100.0))
    val += sp/10000.0 if pos=="FWD" else (sh/10000.0 if pos=="MID" else sp/10000.0)
    return val

def get_tier(rank, total):
    if rank < total * 0.25: return 1
    if rank < total * 0.50: return 2
    if rank < total * 0.75: return 3
    return 4

def main():
    # 1. Load Data
    if not os.path.exists(ROSTERS_FILE):
        print("Roster file not found.")
        return

    with open(ROSTERS_FILE, "r") as f:
        rosters = json.load(f)
    
    player_db = {}
    for team in rosters:
        for p in team["roster"]:
            player_db[p["name"]] = {
                "pos": p["pos"],
                "age": p.get("age", 28),
                "rating": p["rating"],
                "team": team["team"],
                "league": team["league"]
            }

    # 2. Gather Performance Stats
    performance_stats = {name: {"actual": 0, "opps": 0, "matches": 0} for name in player_db}
    
    for league in LEAGUES:
        res_path = os.path.join(TOURNAMENTS_DIR, league, "results.json")
        if not os.path.exists(res_path): continue
        with open(res_path, "r") as f:
            results = json.load(f)
            
        def process_m(m):
            if not m.get("played") or m.get("canceled"): return
            t1, t2 = m["teams"]
            # Check if stats exist
            if t1 not in m["stats"] or t2 not in m["stats"]: return
            
            s1, s2 = m["stats"][t1], m["stats"][t2]
            for side, team, opp_team in [("team1", t1, t2), ("team2", t2, t1)]:
                opp_shots = m["stats"][opp_team]["shots"]
                for p in m["player_data"].get(side, []):
                    if p["name"] in performance_stats:
                        st = performance_stats[p["name"]]
                        st["matches"] += 1
                        pos = player_db[p["name"]]["pos"]
                        if pos == "FWD":
                            st["actual"] += p.get("goals", 0)
                            st["opps"] += p.get("sogs", 0)
                        elif pos == "DEF":
                            st["actual"] += p.get("stops", 0)
                            st["opps"] += opp_shots
                        elif pos == "GK":
                            st["actual"] += p.get("saves", 0)
                            st["opps"] += (p.get("saves", 0) + p.get("goals_against", 0))
                        elif pos == "MID":
                            st["actual"] += (p.get("goals", 0) + p.get("assists", 0) + p.get("stops", 0))
                            st["opps"] = st["matches"]

        for g in results["groups"].values():
            for m in g["matches"]: process_m(m)
        if "playoffs" in results:
            for r in results["playoffs"].get("rounds", []):
                for m in r.get("matches", []): process_m(m)

    # 3. Calculate Tiers & Deltas
    players_list = []
    for name, p_info in player_db.items():
        s = performance_stats[name]
        metric = (s["actual"] / s["opps"]) if s["opps"] > 0 else 0
        players_list.append({
            "name": name, 
            "rating": p_info["rating"], 
            "pos": p_info["pos"], 
            "team": p_info["team"],
            "league": p_info["league"],
            "metric": metric, 
            "age": p_info["age"],
            "matches": s["matches"]
        })

    # Sort and Tier by Rating
    players_list.sort(key=lambda x: x["rating"], reverse=True)
    for i, p in enumerate(players_list): p["r_tier"] = get_tier(i, len(players_list))
    
    # Sort and Tier by Performance (within position group)
    for pos in ["FWD", "MID", "DEF", "GK"]:
        pos_group = [p for p in players_list if p["pos"] == pos]
        pos_group.sort(key=lambda x: x["metric"], reverse=True)
        for i, p in enumerate(pos_group): p["m_tier"] = get_tier(i, len(pos_group))

    # 4. Load Master Stats for context
    master_data = {}
    with open(PLAYER_FILE, "r") as f:
        reader = csv.DictReader(f, delimiter="	")
        for row in reader: master_data[row["Name"]] = row

    # 5. Simulate Changes
    diagnostic_report = []
    
    for p in players_list:
        age = p["age"]
        delta = p["r_tier"] - p["m_tier"] # Positive = Overperforming
        
        # Base Probabilities: [Improve, Stable, Degrade]
        if age <= 25: probs = [0.60, 0.35, 0.05]
        elif age <= 30: probs = [0.20, 0.70, 0.10]
        elif age <= 34: probs = [0.05, 0.35, 0.60]
        else: probs = [0.00, 0.20, 0.80]
        
        # Performance adjustment
        if delta >= 1: 
            probs[0] += 0.15
            probs[2] = max(0, probs[2] - 0.05)
        elif delta <= -1: 
            probs[0] = max(0, probs[0] - 0.10)
            probs[2] += 0.20
            
        # Normalize
        total = sum(probs)
        probs = [x/total for x in probs]
        
        # Roll
        roll = random.random()
        change = 0
        if roll < probs[0]: change = random.randint(1, 3)
        elif roll > (1 - probs[2]): change = -random.randint(1, 3)
            
        m = master_data.get(p["name"])
        if not m: continue

        old_sh = int(float(m["Shooting"]))
        old_sp = int(float(m["Speed"]))
        old_df = int(float(m["Defense"]))
        old_gk = int(float(m["Goalkeeping"]))
        
        new_sh, new_sp, new_df, new_gk = old_sh, old_sp, old_df, old_gk
        stat_modified = "None"
        
        if change != 0:
            if p["pos"] == "FWD": 
                new_sh = min(50, max(0, old_sh + change))
                stat_modified = "Shooting"
            elif p["pos"] == "GK": 
                new_gk = min(50, max(0, old_gk + change))
                stat_modified = "Goalkeeping"
            elif p["pos"] == "DEF": 
                new_df = min(50, max(0, old_df + change))
                stat_modified = "Defense"
                if change > 0: new_sp = min(50, old_sp + 1)
            elif p["pos"] == "MID":
                new_sp = min(50, max(0, old_sp + change))
                stat_modified = "Speed"
                if change > 0: new_sh = min(50, old_sh + 1)

        new_overall = calc_overall(p["pos"], new_sh, new_sp, new_df, new_gk)
        
        diagnostic_report.append({
            "name": p["name"],
            "team": p["team"],
            "league": p["league"],
            "age": age,
            "pos": p["pos"],
            "rating_tier": p["r_tier"],
            "stat_tier": p["m_tier"],
            "tier_delta": delta,
            "roll_result": "Improve" if change > 0 else ("Degrade" if change < 0 else "Stable"),
            "stat_changed": stat_modified,
            "change_amount": change,
            "old_overall": round(p["rating"], 2),
            "new_overall": round(new_overall, 2),
            "net_gain": round(new_overall - p["rating"], 2),
            "matches_played": p["matches"]
        })

    # Save Diagnostic Report (Filtered for Prime)
    prime_report = [p for p in diagnostic_report if p["league"] == "Prime"]
    prime_report.sort(key=lambda x: x["net_gain"], reverse=True)
    with open(DIAGNOSTIC_FILE, "w") as f:
        json.dump(prime_report, f, indent=4)

    print(f"\n--- OFFSEASON DIAGNOSTIC: PRIME LEAGUE ONLY ---")
    print(f"No data files were modified.")
    print(f"Prime League report: {DIAGNOSTIC_FILE}")
    
    # Summary Tables
    risers = [p for p in prime_report if p["change_amount"] > 0]
    fallers = [p for p in prime_report if p["change_amount"] < 0]
    
    print(f"\nSummary Analysis (Prime):")
    print(f"Total Players Analyzed: {len(prime_report)}")
    print(f"Potential Risers: {len(risers)} ({len(risers)/len(prime_report):.1%})")
    print(f"Potential Fallers: {len(fallers)} ({len(fallers)/len(prime_report):.1%})")
    print(f"Stable Players: {len(prime_report)-len(risers)-len(fallers)}")

    print(f"\nTop 5 Overperforming Risers in Prime:")
    over_risers = [p for p in risers if p["tier_delta"] >= 1]
    for p in sorted(over_risers, key=lambda x: x['net_gain'], reverse=True)[:5]:
        print(f"- {p['name']} ({p['team']}): T{p['rating_tier']} Rtg -> T{p['stat_tier']} Stats. Gain: +{p['net_gain']}")

    print(f"\nTop 5 Underperforming Fallers in Prime:")
    under_fallers = [p for p in fallers if p["tier_delta"] <= -1]
    for p in sorted(under_fallers, key=lambda x: x['net_gain'])[:5]:
        print(f"- {p['name']} ({p['team']}): T{p['rating_tier']} Rtg -> T{p['stat_tier']} Stats. Loss: {p['net_gain']}")

if __name__ == "__main__":
    main()
