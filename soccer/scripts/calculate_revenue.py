import json
import os
import csv
import random

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEAM_STATS_FILE = os.path.join(BASE_DIR, "lists", "team_stats.tsv")
TOURNAMENTS_DIR = os.path.join(BASE_DIR, "Tournaments", "2025")

LEAGUES = ["Backyard", "Prime", "Euro", "Med"]
LEAGUE_FOLDERS = {
    "Backyard": "Backyard", "Prime": "Prime", "Euro": "Euro", "Med": "Med"
}

# --- YEAR 1 BUDGETS ---
YEAR_1_BUDGETS = {
    "Stratton United": 222.0, "Haverford Black": 214.0, "Stella Grey": 210.0, "Chateau Roux": 209.0,
    "Glass Castle FC": 197.0, "Thurston FC East": 193.0, "Thurston FC West": 193.0, "Eisenwald 1900": 184.0,
    "Askhatansa": 179.0, "Cheicester City": 176.0, "Barroclaugh Athletic": 168.0, "Havenpoort FC": 164.0,
    "Les Brasseurs": 162.0, "Corsaires de Calais": 154.0, "Stedham Journeymen": 151.0, "Celtic Cross FC": 151.0,
    "Imperiale Roma": 202.0, "Castellano Madrid": 195.0, "Al-Qahira FC": 192.0, "Fursan al-Arab": 191.0,
    "Catalonia Gothic": 180.0, "Le Rocher Monaco": 176.0, "Barbary Apes": 176.0, "Olympias Athena": 168.0,
    "Bosphorus Blue": 164.0, "Visconti Serpents": 161.0, "Lisbon United": 154.0, "Lions of Carthage": 150.0,
    "Najm al-Bayda": 148.0, "Alexandria Faros": 141.0, "Damascus Steel": 138.0, "Tripoli Sporting": 138.0,
    "Moscow Krepost": 163.0, "Slavutych Kyiv": 157.0, "Edelweiss Zurich": 155.0, "Stockholm United": 154.0,
    "Oslo Vikinger": 145.0, "Donau Wien": 143.0, "Dunav Belgrade": 143.0, "Sisu Helsinki": 136.0,
    "Kongens FC": 133.0, "Bohemian Gryphons": 131.0, "Korona Warsaw": 125.0, "Magyar Huszar": 122.0,
    "Bucharest International": 121.0, "Sarajevo Grad": 115.0, "Reykjavik Isbjorn": 113.0, "Slavia Tatry": 113.0,
    "New York Empire": 183.0, "Los Angeles Syndicate": 176.0, "Las Vegas Mirage": 173.0, "Chicago Surge": 172.0,
    "Boston Rebellion": 163.0, "Toronto Blizzard": 159.0, "Mexico City Sol": 159.0, "Seattle Echo": 152.0,
    "Philadelphia Spirit": 148.0, "Dallas Flare": 146.0, "San Jose Relampago": 139.0, "Montreal Coureurs": 136.0,
    "Tijuana Vaqueros": 135.0, "Washington Justice": 128.0, "Detroit Firebirds": 126.0, "Denver Torrent": 126.0
}

def load_team_stats():
    teams = {}
    with open(TEAM_STATS_FILE, "r") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            teams[row["Team"]] = {
                "sh": float(row["Off Rtg"]), "sp": float(row["Spd Rtg"]),
                "df": float(row["Def Rtg"]), "gk": float(row["GK Rtg"]),
                "region": row["Region"]
            }
    return teams

def calculate_appeal(stats):
    return (0.4 * stats["sh"]) + (0.3 * stats["sp"]) + (0.2 * stats["gk"]) + (0.1 * stats["df"])

def get_playoff_exits(results):
    exits = {}
    if not results or "playoffs" not in results: return exits
    rounds = results["playoffs"].get("rounds", [])
    if not rounds: return exits

    round_participants = []
    for r in rounds:
        participants = set()
        for m in r.get("matches", []):
            if not m.get("canceled"):
                participants.add(m["teams"][0]); participants.add(m["teams"][1])
        round_participants.append((r["name"], participants))
        
    for i in range(len(round_participants) - 1):
        curr_name, curr_parts = round_participants[i]
        next_parts = round_participants[i+1][1]
        mapping = {"Wild-Card Round": "Wild-Card", "Group First Round": "Wild-Card", "Group Semifinals": "Group Semis", "Group Finals": "Group Finals"}
        exit_key = mapping.get(curr_name, "Playoffs")
        for team in curr_parts:
            if team not in next_parts: exits[team] = exit_key
                
    played_finals = [m for m in rounds[-1]["matches"] if m.get("played") and not m.get("canceled")]
    if played_finals:
        final_match = played_finals[-1]
        t1, t2 = final_match["teams"]
        s1, s2 = final_match["score"]
        winner = t1 if s1 > s2 else t2
        runner_up = t2 if s1 > s2 else t1
        if final_match.get("pk_score"):
            p1, p2 = final_match["pk_score"]
            winner = t1 if p1 > p2 else t2
            runner_up = t2 if p1 > p2 else t1
        exits[winner] = "Winner"; exits[runner_up] = "Runner-up"
    return exits

def calculate_club_cup_revenue():
    cup_results_path = os.path.join(TOURNAMENTS_DIR, "Club Cup", "results.json")
    if not os.path.exists(cup_results_path): return {}
    with open(cup_results_path, "r") as f: results = json.load(f)
    cup_earnings = {}
    for group_list in results["config"]["groups"].values():
        for p in group_list: cup_earnings[p] = 10.0
    for group_data in results["groups"].values():
        for m in group_data["matches"]:
            if m.get("played"):
                t1, t2 = m["teams"]; s1, s2 = m["score"]
                if s1 > s2: cup_earnings[t1] += 2.0
                elif s2 > s1: cup_earnings[t2] += 2.0
                else: cup_earnings[t1] += 1.0; cup_earnings[t2] += 1.0
    for r in results.get("playoffs", {}).get("rounds", []):
        r_name = r["name"]; played_in_round = set()
        for m in r["matches"]:
            if not m.get("canceled"):
                played_in_round.add(m["teams"][0]); played_in_round.add(m["teams"][1])
        bonus = 7.0 if r_name == "Quarterfinals" else (8.0 if r_name == "Semifinals" else 9.0)
        if r_name == "Finals":
            final_match = next((m for m in r["matches"] if m.get("played") and m.get("label") == "F"), None)
            if final_match:
                t1, t2 = final_match["teams"]; s1, s2 = final_match["score"]
                winner = t1 if s1 > s2 else t2
                if final_match.get("pk_score"):
                    p1, p2 = final_match["pk_score"]; winner = t1 if p1 > p2 else t2
                cup_earnings[winner] += 10.0
        for team in played_in_round: cup_earnings[team] += bonus
    return cup_earnings

def calculate_league_revenue(league_name, club_cup_data):
    all_team_stats = load_team_stats()
    league_teams = {name: stats for name, stats in all_team_stats.items() if stats["region"] == league_name}
    team_data = {}; league_appeal_sum = 0
    for name, stats in league_teams.items():
        appeal = calculate_appeal(stats); league_appeal_sum += appeal
        team_data[name] = {"appeal": appeal, "exit": "Group Stage (7th/8th)"}
    
    # League-specific scalars
    scalars = {
        "Prime": random.uniform(23.5, 24.5),
        "Med": random.uniform(22.5, 23.5),
        "Backyard": random.uniform(22.5, 23.5),
        "Euro": random.uniform(21.5, 22.5)
    }
    
    total_pot = league_appeal_sum * scalars.get(league_name, 23.0)
    equal_share_per_team = (total_pot * 0.60) / 16
    prize_pot, facility_pot = total_pot * 0.20, total_pot * 0.20
    
    results_path = os.path.join(TOURNAMENTS_DIR, LEAGUE_FOLDERS[league_name], "results.json")
    with open(results_path, "r") as f: results = json.load(f)
    exits = get_playoff_exits(results)
    for team, exit_round in exits.items():
        if team in team_data: team_data[team]["exit"] = exit_round
            
    share_map = {"Group Stage (7th/8th)": 3, "Wild-Card": 4, "Group Semis": 5, "Group Finals": 6, "Runner-up": 8, "Winner": 10}
    total_shares = sum(share_map[d["exit"]] for d in team_data.values())
    price_per_share = prize_pot / total_shares
    
    tiers_config = {
        "Prime": {
            "Haverford Black": 1, "Stratton United": 1, "Eisenwald 1900": 1, "Chateau Roux": 2, "Stella Grey": 2, "Glass Castle FC": 2, "Thurston FC West": 2, "Thurston FC East": 2, "Barroclaugh Athletic": 3, "Askhatansa": 3, "Les Brasseurs": 3, "Cheicester City": 3, "Celtic Cross FC": 3, "Stedham Journeymen": 4, "Corsaires de Calais": 4, "Havenpoort FC": 4
        },
        "Med": {
            "Castellano Madrid": 1, "Imperiale Roma": 1, "Le Rocher Monaco": 1, "Fursan al-Arab": 2, "Al-Qahira FC": 2, "Catalonia Gothic": 2, "Lisbon United": 2, "Barbary Apes": 2, "Najm al-Bayda": 3, "Visconti Serpents": 3, "Lions of Carthage": 3, "Bosphorus Blue": 3, "Olympias Athena": 3, "Alexandria Faros": 4, "Damascus Steel": 4, "Tripoli Sporting": 4
        },
        "Euro": {
            "Edelweiss Zurich": 1, "Moscow Krepost": 1, "Slavutych Kyiv": 1, "Donau Wien": 2, "Dunav Belgrade": 2, "Sisu Helsinki": 2, "Stockholm United": 2, "Oslo Vikinger": 2, "Reykjavik Isbjorn": 3, "Bucharest International": 3, "Korona Warsaw": 3, "Kongens FC": 3, "Bohemian Gryphons": 3, "Slavia Tatry": 4, "Sarajevo Grad": 4, "Magyar Huszar": 4
        },
        "Backyard": {
            "New York Empire": 1, "Las Vegas Mirage": 1, "Los Angeles Syndicate": 1, "Chicago Surge": 2, "Boston Rebellion": 2, "Seattle Echo": 2, "Philadelphia Spirit": 2, "Mexico City Sol": 2, "Toronto Blizzard": 3, "Tijuana Vaqueros": 3, "San Jose Relampago": 3, "Washington Justice": 3, "Dallas Flare": 3, "Denver Torrent": 4, "Montreal Coureurs": 4, "Detroit Firebirds": 4
        }
    }
    
    team_f_percents = {}
    total_t123_random, t123_teams = 0, []
    current_tiers = tiers_config.get(league_name, {})
    for t_name in team_data.keys():
        tier = current_tiers.get(t_name, 4)
        if tier == 4: team_f_percents[t_name] = 3.0
        else:
            val = random.uniform(10.0, 12.0) if tier == 1 else (random.uniform(7.0, 9.0) if tier == 2 else random.uniform(4.0, 6.0))
            team_f_percents[t_name] = val; total_t123_random += val; t123_teams.append(t_name)
    if t123_teams:
        norm_factor = 91.0 / total_t123_random
        for t_name in t123_teams: team_f_percents[t_name] *= norm_factor

    print(f"\n--- {league_name.upper()} REVENUE REPORT ---")
    print(f"Total Pot: ${total_pot:.2f}m")
    print(f"Equal Share: ${equal_share_per_team:.2f}m per team")
    print(f"Prize Share Value: ${price_per_share:.2f}m")
    print(f"Facility Pot: ${facility_pot:.2f}m")
    output = []
    for t_name, d in team_data.items():
        shares = share_map[d["exit"]]; p_money = price_per_share * shares
        f_fee = facility_pot * (team_f_percents.get(t_name, 0) / 100.0)
        external = club_cup_data.get(t_name, 0)
        raw_revenue = equal_share_per_team + p_money + f_fee + external
        
        # --- DEFICIT PROTECTION LOGIC ---
        y1_budget = YEAR_1_BUDGETS.get(t_name, raw_revenue)        
        threshold = y1_budget - 20.0
        if raw_revenue >= threshold:
            final_budget = max(raw_revenue, y1_budget)
        else:
            deficit_penalty = threshold - raw_revenue
            final_budget = y1_budget - deficit_penalty
            
        final_budget = round(final_budget)
        output.append({
            "team": t_name, "raw": round(raw_revenue, 2), "y1": y1_budget, "final": final_budget, "exit": d["exit"]
        })
        
    output.sort(key=lambda x: x["final"], reverse=True)
    total_change_pre_cup = 0
    total_change_post_cup = 0
    for i, t in enumerate(output):
        # Calculate domestic-only final (final budget minus cup kicker)
        cup_money = round(club_cup_data.get(t['team'], 0))
        change_domestic = t['final'] - t['y1'] - cup_money
        total_change_pre_cup += change_domestic
        total_change_post_cup += (t['final'] - t['y1'])
        
        diff = t['final'] - t['y1']
        diff_str = f"(+{diff}m)" if diff >= 0 else f"({diff}m)"
        print(f"{i+1}. {t['team']} ({t['exit']}): ${t['final']}m {diff_str} [Start: ${int(t['y1'])}m | Raw: ${t['raw']:.1f}m]")

    print(f"\nTotal regional change (pre-Club Cup): ${total_change_pre_cup}m")
    print(f"Total regional change (POST-Club Cup): ${total_change_post_cup}m")
    return {"league": league_name, "teams": output}

if __name__ == "__main__":
    club_cup_data = calculate_club_cup_revenue()
    world_revenues = {}
    master_budget_list = {}
    for league in LEAGUES:
        world_revenues[league] = calculate_league_revenue(league, club_cup_data)
        for t in world_revenues[league]["teams"]:
            master_budget_list[t["team"]] = {
                "year_2_budget": t["final"],
                "year_1_budget": t["y1"],
                "revenue_raw": t["raw"],
                "league": league
            }
            
    with open(os.path.join(BASE_DIR, "lists", "year_2_budgets.json"), "w") as f:
        json.dump(master_budget_list, f, indent=4)
