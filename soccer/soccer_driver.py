import os
import random
import datetime
import sys
import json

class Player:
    def __init__(self, name, shot_prop):
        self.name = name
        self.shot_prop = shot_prop
        self.shots = 0
        self.sogs = 0
        self.goals = 0

class Team:
    def __init__(self, name, players, offense, speed, defense, gk):
        self.name = name
        self.players = players
        self.offense = offense
        self.speed = speed
        self.defense = defense
        self.gk = gk
        self.score = 0
        self.saves = 0

    def reset_match_stats(self):
        self.score = 0
        self.saves = 0
        for p in self.players:
            p.shots = 0
            p.sogs = 0
            p.goals = 0

def load_team(tournament_path, team_name):
    # tournament_path should be like "2026/AS"
    path = f"Tournaments/{tournament_path}/Teams/{team_name}.txt"
    if not os.path.exists(path):
        return None
    
    with open(path, 'r') as f:
        lines = [line.strip() for line in f.readlines() if line.strip()]
    
    players = []
    cumulative_prop = 0
    for i in range(7):
        parts = lines[i].split('\t')
        name = parts[0]
        prop = int(parts[1])
        cumulative_prop += prop
        players.append(Player(name, cumulative_prop))
    
    offense = int(lines[7])
    speed = int(lines[8])
    defense = int(lines[9])
    gk = int(lines[10])
    
    return Team(team_name, players, offense, speed, defense, gk)

def play_minutes(minutes, team1, team2, logging, log_file):
    match_events = []
    for i in range(1, minutes + 1):
        check = random.randint(1, 50)
        if logging:
            log_file.write(f"(check={check}) Minute {i}: ")
        
        if check <= 38: # 76% no action
            if logging:
                log_file.write("no shot.\n")
        else:
            while True:
                t1check = random.randint(1, 75) + team1.speed
                t2check = random.randint(1, 75) + team2.speed
                if t1check != t2check:
                    break
            
            if logging:
                log_file.write(f"(t1check={t1check}, t2check={t2check}, ")
            
            if t1check > t2check:
                check = random.randint(1, 50)
                if logging:
                    log_file.write(f"check1={check}, ")
                check = check + team1.offense - team2.defense
                if logging:
                    log_file.write(f"check2={check}) ")
                
                if check <= 30: # Miss
                    p_check = random.randint(0, 99)
                    player_idx = -1
                    for j in range(6):
                        if p_check < team1.players[j].shot_prop:
                            player_idx = j
                            break
                    team1.players[player_idx].shots += 1
                    if logging:
                        log_file.write(f"{team1.players[player_idx].name} missed shot.\n")
                else:
                    check = random.randint(1, 50)
                    if logging:
                        log_file.write(f"(goalchk1={check}, ")
                    check -= team2.gk
                    if logging:
                        log_file.write(f"goalchk2={check}) ")
                    
                    p_check = random.randint(0, 99)
                    player_idx = -1
                    for j in range(6):
                        if p_check < team1.players[j].shot_prop:
                            player_idx = j
                            break
                    team1.players[player_idx].shots += 1
                    team1.players[player_idx].sogs += 1

                    if check <= 25: # Save
                        team2.saves += 1
                        if logging:
                            log_file.write(f"{team1.players[player_idx].name} shot on goal. {team2.players[6].name} SAVE!\n")
                    else: # Goal
                        team1.players[player_idx].goals += 1
                        team1.score += 1
                        match_events.append({"minute": i, "team": team1.name, "player": team1.players[player_idx].name})
                        if logging:
                            log_file.write(f"{team1.players[player_idx].name} GOAL!!! Score: {team1.score}-{team2.score}\n")
            else:
                # Team 2 Turn
                check = random.randint(1, 50)
                if logging:
                    log_file.write(f"check1={check}, ")
                check = check + team2.offense - team1.defense
                if logging:
                    log_file.write(f"check2={check}) ")
                
                if check <= 30: # Miss
                    p_check = random.randint(0, 99)
                    player_idx = -1
                    for j in range(6):
                        if p_check < team2.players[j].shot_prop:
                            player_idx = j
                            break
                    team2.players[player_idx].shots += 1
                    if logging:
                        log_file.write(f"{team2.players[player_idx].name} missed shot.\n")
                else:
                    check = random.randint(1, 50)
                    if logging:
                        log_file.write(f"(goalchk1={check}, ")
                    check -= team1.gk
                    if logging:
                        log_file.write(f"goalchk2={check}) ")
                    
                    p_check = random.randint(0, 99)
                    player_idx = -1
                    for j in range(6):
                        if p_check < team2.players[j].shot_prop:
                            player_idx = j
                            break
                    team2.players[player_idx].shots += 1
                    team2.players[player_idx].sogs += 1

                    if check <= 25: # Save
                        team1.saves += 1
                        if logging:
                            log_file.write(f"{team2.players[player_idx].name} shot on goal. {team1.players[6].name} SAVE!\n")
                    else: # Goal
                        team2.players[player_idx].goals += 1
                        team2.score += 1
                        match_events.append({"minute": i, "team": team2.name, "player": team2.players[player_idx].name})
                        if logging:
                            log_file.write(f"{team2.players[player_idx].name} GOAL!!! Score: {team1.score}-{team2.score}\n")
    return match_events

def play_game(tournament_path, team1_name, team2_name, elim, logging, persist=True):
    team1 = load_team(tournament_path, team1_name)
    team2 = load_team(tournament_path, team2_name)
    
    if not team1 or not team2:
        return None

    log_file = None
    log_path = ""
    if logging:
        now = datetime.datetime.now()
        timestamp = f"{now.month}{now.day}{now.hour}{now.minute}{now.second}_{random.randint(100,999)}"
        os.makedirs(f"Tournaments/{tournament_path}/Games", exist_ok=True)
        log_path = f"Tournaments/{tournament_path}/Games/{team1_name}_vs_{team2_name}_{timestamp}.txt"
        log_file = open(log_path, 'w')

    events = play_minutes(90, team1, team2, logging, log_file)

    if team1.score == team2.score and elim:
        if logging: log_file.write("\n--- EXTRA TIME ---\n\n")
        events.extend(play_minutes(30, team1, team2, logging, log_file))

    pk_score = None
    if team1.score == team2.score and elim:
        while True:
            pk1, pk2 = random.randint(1, 5), random.randint(1, 5)
            if pk1 != pk2 and abs(pk1 - pk2) <= 2:
                pk_score = [pk1, pk2]
                break
        if logging: log_file.write(f"Final score: {team1.score}-{team2.score} ({pk1}-{pk2} PK)\n")
    else:
        if logging: log_file.write(f"Final score: {team1.score}-{team2.score}\n")
    
    if logging: log_file.close()

    result = {
        "teams": [team1.name, team2.name],
        "score": [team1.score, team2.score],
        "pk_score": pk_score,
        "events": events,
        "stats": {
            team1.name: {"shots": sum(p.shots for p in team1.players), "sogs": sum(p.sogs for p in team1.players), "saves": team1.saves},
            team2.name: {"shots": sum(p.shots for p in team2.players), "sogs": sum(p.sogs for p in team2.players), "saves": team2.saves}
        },
        "player_data": {
            "team1": [{"name": p.name, "shots": p.shots, "sogs": p.sogs, "goals": p.goals, "saves": team1.saves if i == 6 else 0, "goals_against": team2.score if i == 6 else 0} for i, p in enumerate(team1.players)],
            "team2": [{"name": p.name, "shots": p.shots, "sogs": p.sogs, "goals": p.goals, "saves": team2.saves if i == 6 else 0, "goals_against": team1.score if i == 6 else 0} for i, p in enumerate(team2.players)]
        },
        "log_path": log_path
    }

    return result

def main():
    if len(sys.argv) < 2:
        print("Soccer Driver Engine Loaded.")
        return

    command = sys.argv[1]
    if command == "winprob":
        # Keep original simple winprob for CLI use
        tp = sys.argv[2]
        t1, t2 = sys.argv[3], sys.argv[4]
        runs = 10000
        t1w, t2w, d = 0, 0, 0
        t1_goals, t2_goals = 0, 0
        for _ in range(runs):
            res = play_game(tp, t1, t2, False, False, False)
            t1_goals += res['score'][0]
            t2_goals += res['score'][1]
            if res['score'][0] > res['score'][1]: t1w += 1
            elif res['score'][1] > res['score'][0]: t2w += 1
            else: d += 1
        print(f"{t1} wins: {t1w} ({t1w/100}%) | {t2} wins: {t2w} ({t2w/100}%) | Draws: {d} ({d/100}%)")
        print(f"Avg Goals: {t1} {t1_goals/runs:.2f} | {t2} {t2_goals/runs:.2f}")

if __name__ == "__main__":
    main()
