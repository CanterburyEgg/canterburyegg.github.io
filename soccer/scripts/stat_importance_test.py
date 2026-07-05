import os
import random
import sys

# Add current directory to path to import driver
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.join(BASE_DIR, "scripts"))
import soccer_driver

class MockPlayer:
    def __init__(self, name, shot_prop):
        self.name = name
        self.shot_prop = shot_prop
        self.shots = 0
        self.sogs = 0
        self.goals = 0

class MockTeam:
    def __init__(self, name, offense, speed, defense, gk):
        self.name = name
        self.offense = offense
        self.speed = speed
        self.defense = defense
        self.gk = gk
        self.score = 0
        self.saves = 0
        # Generic balanced roster
        self.players = [MockPlayer(f"{name}_P{i}", (100 if i==0 else 0)) for i in range(9)]

    def reset_match_stats(self):
        self.score = 0
        self.saves = 0
        for p in self.players:
            p.shots = 0
            p.sogs = 0
            p.goals = 0

def run_sim(team1, team2, runs=1000, hfa=False):
    results = {"win": 0, "draw": 0, "loss": 0, "gf": 0, "ga": 0}
    for _ in range(runs):
        team1.reset_match_stats()
        team2.reset_match_stats()
        soccer_driver.play_minutes(90, team1, team2, False, None, hfa=hfa)
        
        results["gf"] += team1.score
        results["ga"] += team2.score
        
        if team1.score > team2.score:
            results["win"] += 1
        elif team1.score < team2.score:
            results["loss"] += 1
        else:
            results["draw"] += 1
            
    return results

def test_importance():
    print(f"Running Stat Importance Test (10000 games per stat)...")
    print(f"Baseline: Team A (5,5,5,5) vs Team B (5,5,5,5)")
    print("-" * 60)

    # 1. Baseline
    baseline_a = MockTeam("Team A", 5, 5, 5, 5)
    baseline_b = MockTeam("Team B", 5, 5, 5, 5)
    base_res = run_sim(baseline_a, baseline_b, runs=10000)
    print(f"BASELINE: {base_res['win']} Wins | {base_res['draw']} Draws | Avg {base_res['gf']/10000:.2f} Goals")

    # 2. HFA Test
    hfa_res = run_sim(baseline_a, baseline_b, runs=10000, hfa=True)
    hfa_diff = hfa_res["win"] - base_res["win"]
    print(f"HFA BOOST (+1 Off/Spd): {hfa_res['win']:>4} Wins (+{hfa_diff:>4}) | Avg {hfa_res['gf']/10000:.2f} GF / {hfa_res['ga']/10000:.2f} GA")

    stats = ["Offense", "Speed", "Defense", "GK"]
    importance = {}

    for i, stat_name in enumerate(stats):
        # Reset teams
        team_a = MockTeam("Team A", 5, 5, 5, 5)
        team_b = MockTeam("Team B", 5, 5, 5, 5)
        
        # Set target stat to 10
        if i == 0: team_a.offense = 10
        elif i == 1: team_a.speed = 10
        elif i == 2: team_a.defense = 10
        elif i == 3: team_a.gk = 10
        
        res = run_sim(team_a, team_b, runs=10000)
        win_diff = res["win"] - base_res["win"]
        importance[stat_name] = win_diff
        
        print(f"+5 {stat_name:<8}: {res['win']:>4} Wins (+{win_diff:>4}) | Avg {res['gf']/10000:.2f} GF / {res['ga']/10000:.2f} GA")

    print("-" * 60)
    sorted_imp = sorted(importance.items(), key=lambda x: x[1], reverse=True)
    print("FINAL RANKING OF IMPORTANCE:")
    for rank, (name, diff) in enumerate(sorted_imp):
        print(f"{rank+1}. {name} ({diff} additional wins)")

if __name__ == "__main__":
    test_importance()
