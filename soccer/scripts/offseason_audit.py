import json
import os
import csv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROSTERS_FILE = os.path.join(BASE_DIR, "lists", "league_rosters.json")
TOURNAMENTS_DIR = os.path.join(BASE_DIR, "Tournaments", "2025")
AUDIT_FILE = os.path.join(BASE_DIR, "lists", "offseason_audit.json")

LEAGUES = ["Backyard", "Prime", "Euro", "Med"]

def main():
    if not os.path.exists(ROSTERS_FILE): return

    with open(ROSTERS_FILE, "r") as f:
        rosters = json.load(f)
    
    player_db = {}
    for team in rosters:
        for p in team["roster"]:
            player_db[p["name"]] = {
                "pos": p["pos"], "rating": p["rating"],
                "team": team["team"], "league": team["league"]
            }

    p_stats = {name: {"g": 0, "a": 0, "s": 0, "saves": 0, "ga": 0, "sog": 0, "opp_poss": 0, "m": 0} for name in player_db}
    
    for league in LEAGUES:
        res_path = os.path.join(TOURNAMENTS_DIR, league, "results.json")
        if not os.path.exists(res_path): continue
        with open(res_path, "r") as f:
            results = json.load(f)
            
        def process_m(m):
            if not m.get("played") or m.get("canceled"): return
            t1, t2 = m["teams"]
            if "stats" not in m or t1 not in m["stats"] or t2 not in m["stats"]: return
            
            s1, s2 = m["stats"][t1], m["stats"][t2]
            for side, team, opp_team in [("team1", t1, t2), ("team2", t2, t1)]:
                opp_poss = m["stats"][opp_team]["possession"]
                for p in m["player_data"].get(side, []):
                    name = p["name"]
                    if name in p_stats:
                        st = p_stats[name]
                        st["m"] += 1
                        st["g"] += p.get("goals", 0)
                        st["a"] += p.get("assists", 0)
                        st["s"] += p.get("stops", 0)
                        st["sog"] += p.get("sogs", 0)
                        st["saves"] += p.get("saves", 0)
                        st["ga"] += p.get("goals_against", 0)
                        st["opp_poss"] += (opp_poss / 100.0)

        for g in results["groups"].values():
            for m in g["matches"]: process_m(m)
        if "playoffs" in results:
            for r in results["playoffs"].get("rounds", []):
                for m in r.get("matches", []): process_m(m)

    players_list = []
    for league in LEAGUES:
        # MID Averages
        league_mids = [p_stats[n] for n, info in player_db.items() if info["league"] == league and info["pos"] == "MID"]
        avg_g = sum(s["g"] for s in league_mids) / len(league_mids) if league_mids else 1
        avg_a = sum(s["a"] for s in league_mids) / len(league_mids) if league_mids else 1
        avg_s = sum(s["s"] for s in league_mids) / len(league_mids) if league_mids else 1
        
        for name, p_info in player_db.items():
            if p_info["league"] != league: continue
            s = p_stats[name]
            
            if p_info["pos"] == "FWD":
                eff = (s["g"] / s["sog"]) if s["sog"] > 0 else 0
                metric = eff + (s["g"] / 100.0)
            elif p_info["pos"] == "MID":
                metric = (s["g"] / (avg_g or 1)) + (s["a"] / (avg_a or 1)) + (s["s"] / (avg_s or 1))
            elif p_info["pos"] == "DEF":
                # Stops / (Total Opponent Possession Units)
                metric = (s["s"] / s["opp_poss"]) if s["opp_poss"] > 0 else 0
            elif p_info["pos"] == "GK":
                metric = (s["saves"] / (s["saves"] + s["ga"])) if (s["saves"] + s["ga"]) > 0 else 0
            
            players_list.append({
                "name": name, "rating": p_info["rating"], "pos": p_info["pos"], 
                "team": p_info["team"], "league": p_info["league"],
                "metric": metric, "stats": s
            })

    for league in LEAGUES:
        for pos in ["FWD", "MID", "DEF", "GK"]:
            sub = [p for p in players_list if p["league"] == league and p["pos"] == pos]
            if not sub: continue
            sub.sort(key=lambda x: x["rating"], reverse=True)
            for i, p in enumerate(sub): p["r_rank"] = i + 1
            sub.sort(key=lambda x: x["metric"], reverse=True)
            for i, p in enumerate(sub): p["m_rank"] = i + 1

    prime_audit = [p for p in players_list if p["league"] == "Prime"]
    
    with open(AUDIT_FILE, "w") as f:
        json.dump(players_list, f, indent=4)

    # ONLY PRIME OUTPUT
    print("\n" + "="*30 + " PRIME LEAGUE AUDIT " + "="*30)
    for pos, label in [("FWD", "Efficiency + G/100"), ("MID", "Rel Production (G/avg + A/avg + S/avg)"), ("DEF", "Stops per 100% OppPoss"), ("GK", "Save %")]:
        print("\n--- " + pos + " RANKINGS (" + label + ") ---")
        print(f"{'Name':22} | {'Rating':6} | {'RRnk':4} | {'Metric':6} | {'MRnk':4} | {'Net':3} | {'Data'}")
        print("-" * 95)
        
        pos_group = [p for p in prime_audit if p["pos"] == pos]
        pos_group.sort(key=lambda x: x["m_rank"])
        
        for p in pos_group:
            net = p["r_rank"] - p["m_rank"]
            net_str = ("+" if net > 0 else "") + str(net)
            s = p["stats"]
            if pos == "FWD": data = f"G:{s['g']} SOG:{s['sog']}"
            elif pos == "MID": data = f"G:{s['g']} A:{s['a']} S:{s['s']}"
            elif pos == "DEF": data = f"S:{s['s']} OppPossUnits:{s['opp_poss']:.2f}"
            elif pos == "GK": data = f"Svs:{s['saves']} GA:{s['ga']}"
            print(f"{p['name']:22} | {p['rating']:6.2f} | {p['r_rank']:4} | {p['metric']:.3f} | {p['m_rank']:4} | {net_str:3} | {data}")

if __name__ == "__main__":
    main()
