import os
import random
import datetime
import sys
import json

class Player:
    def __init__(self, name, shot_prop, assist_prop=0, stop_prop=0, pos="N/A"):
        self.name = name
        self.pos = pos
        self.shot_prop = shot_prop
        self.assist_prop = assist_prop
        self.stop_prop = stop_prop
        self.shots = 0
        self.sogs = 0
        self.goals = 0
        self.assists = 0
        self.stops = 0

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
        self.possession_ticks = 0

    def reset_match_stats(self):
        self.score = 0
        self.saves = 0
        self.possession_ticks = 0
        for p in self.players:
            p.shots = 0
            p.sogs = 0
            p.goals = 0
            p.assists = 0
            p.stops = 0

def load_team(tournament_path, team_name):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, "Tournaments", tournament_path, "Teams", f"{team_name}.json")
    txt_path = os.path.join(base_dir, "Tournaments", tournament_path, "Teams", f"{team_name}.txt")

    if os.path.exists(json_path):
        with open(json_path, 'r') as f:
            data = json.load(f)
        players = []
        for p in data["players"]:
            players.append(Player(p["name"], p["shot_prop"], p.get("assist_prop", 0), p.get("stop_prop", 0), p.get("pos", "N/A")))
        return Team(team_name, players, data["ratings"]["offense"], data["ratings"]["speed"], data["ratings"]["defense"], data["ratings"]["gk"])
    
    if not os.path.exists(txt_path): return None
    
    with open(txt_path, 'r') as f:
        lines = [line.strip() for line in f.readlines() if line.strip()]
    
    player_lines = lines[:-4]
    players = []
    for line in player_lines:
        parts = line.split('\t')
        name = parts[0]
        weight = int(parts[1])
        players.append(Player(name, weight))
    
    return Team(team_name, players, int(lines[-4]), int(lines[-3]), int(lines[-2]), int(lines[-1]))

def select_player(players, prop_type, exclude_name=None):
    valid_players = [p for p in players if p.name != exclude_name]
    if not valid_players: return None
    
    total_prop = sum(getattr(p, prop_type) for p in valid_players)
    if total_prop <= 0: return random.choice(valid_players)
    
    roll = random.randint(0, total_prop - 1)
    current = 0
    for p in valid_players:
        current += getattr(p, prop_type)
        if roll < current: return p
    return valid_players[-1]

def play_minutes(minutes, team1, team2, logging, log_file, hfa=False, pro_mode=False, minute_offset=0):
    match_events = []
    t1_off = team1.offense + (1 if hfa else 0)
    t1_spd = team1.speed + (1 if hfa else 0)
    
    for i in range(1, minutes + 1):
        display_min = i + minute_offset
        # 1. Box Score Possession Check
        if pro_mode and random.random() < 0.10:
            pass # Neutral tick
        else:
            while True:
                t1roll = random.randint(1, 75) + t1_spd
                t2roll = random.randint(1, 75) + team2.speed
                if t1roll != t2roll: break
            if t1roll > t2roll: team1.possession_ticks += 1
            else: team2.possession_ticks += 1

        # 2. Match Action Logic
        check = random.randint(1, 50)
        if logging: log_file.write(f"(check={check}) Minute {display_min}: ")

        if check <= 38: # No action
            stop_name = None
            if pro_mode and random.random() < 0.3:
                while True:
                    t1p = random.randint(1, 75) + t1_spd
                    t2p = random.randint(1, 75) + team2.speed
                    if t1p != t2p: break
                defender = team2 if t1p > t2p else team1
                p = select_player(defender.players, "stop_prop")
                if p: 
                    p.stops += 1
                    stop_name = p.name
            if logging: log_file.write(f"no shot.{f' (Stop: {stop_name})' if stop_name else ''}\n")
            continue

        # 3. Action Attempted
        while True:
            t1p = random.randint(1, 75) + t1_spd
            t2p = random.randint(1, 75) + team2.speed
            if t1p != t2p: break
            
        attacker, defender = (team1, team2) if t1p > t2p else (team2, team1)
        attacker_off = t1_off if attacker == team1 else attacker.offense
        
        # Identify GK to exclude from shooting
        atk_gk = attacker.players[-1]
        for p in attacker.players:
            if p.pos == 'GK':
                atk_gk = p
                break

        if logging: log_file.write(f"(t1check={t1p}, t2check={t2p}, ")

        # Shot Check
        roll = random.randint(1, 50)
        res_check = roll + attacker_off - defender.defense
        if logging: log_file.write(f"check1={roll}, check2={res_check}) ")
        
        if res_check <= 30: # Miss / Block
            shooter = select_player(attacker.players, "shot_prop", exclude_name=atk_gk.name)
            if shooter: shooter.shots += 1
            stopper_name = None
            if pro_mode:
                stopper = select_player(defender.players, "stop_prop")
                if stopper: 
                    stopper.stops += 1
                    stopper_name = stopper.name
            if logging: log_file.write(f"{shooter.name if shooter else attacker.name} missed shot.{f' (Stop: {stopper_name})' if stopper_name else ''}\n")
        else:
            # Shot on Goal
            roll = random.randint(1, 50)
            goal_check = roll - defender.gk
            if logging: log_file.write(f"(goalchk1={roll}, goalchk2={goal_check}) ")
            
            shooter = select_player(attacker.players, "shot_prop", exclude_name=atk_gk.name)
            if shooter:
                shooter.shots += 1
                shooter.sogs += 1

            if goal_check <= 25: # Save
                defender.saves += 1
                if logging: log_file.write(f"{shooter.name if shooter else attacker.name} shot on goal. {defender.players[-1].name} SAVE!\n")
            else: # Goal
                attacker.score += 1
                if shooter: shooter.goals += 1
                
                assist_name = None
                if pro_mode and random.random() < 0.7:
                    assister = select_player(attacker.players, "assist_prop", exclude_name=shooter.name if shooter else None)
                    if assister:
                        assister.assists += 1
                        assist_name = assister.name
                
                match_events.append({"minute": display_min, "team": attacker.name, "player": shooter.name if shooter else "Unknown", "assist": assist_name})
                if logging: log_file.write(f"{shooter.name if shooter else attacker.name} GOAL!!!{f' (Ast: {assist_name})' if assist_name else ''} Score: {team1.score}-{team2.score}\n")
                
    return match_events

def play_game(tournament_path, team1_name, team2_name, elim, logging, persist=True, log_path="", hfa=False):
    pro_mode = False
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    conf_path = os.path.join(base_dir, "Tournaments", tournament_path, "config.json")
    if os.path.exists(conf_path):
        with open(conf_path, 'r') as f:
            conf = json.load(f)
            pro_mode = conf.get("pro_stats", False)

    team1 = load_team(tournament_path, team1_name)
    team2 = load_team(tournament_path, team2_name)
    if not team1 or not team2: return None

    log_file = None
    if logging:
        if not log_path:
            now = datetime.datetime.now()
            timestamp = f"{now.month}{now.day}{now.hour}{now.minute}{now.second}_{random.randint(100,999)}"
            os.makedirs(os.path.join(base_dir, "Tournaments", tournament_path, "Games"), exist_ok=True)
            log_path = os.path.join(base_dir, "Tournaments", tournament_path, "Games", f"{team1_name}_vs_{team2_name}_{timestamp}.txt")
        log_file = open(log_path, 'w')
        log_file.write(f"Match: {team1_name} vs {team2_name}\n")

    events = play_minutes(90, team1, team2, logging, log_file, hfa=hfa, pro_mode=pro_mode)

    is_ot = False
    if team1.score == team2.score and elim:
        is_ot = True
        if logging: log_file.write("\n--- EXTRA TIME ---\n\n")
        events.extend(play_minutes(30, team1, team2, logging, log_file, hfa=hfa, pro_mode=pro_mode, minute_offset=90))

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

    total_mins = 90
    if is_ot: total_mins += 30

    t1_poss = 50
    t2_poss = 50
    neutral_poss = 0
    
    if pro_mode:
        t1_poss = round((team1.possession_ticks / total_mins) * 100)
        t2_poss = round((team2.possession_ticks / total_mins) * 100)
        neutral_poss = 100 - t1_poss - t2_poss

    result = {
        "teams": [team1.name, team2.name],
        "score": [team1.score, team2.score],
        "pk_score": pk_score,
        "is_ot": is_ot,
        "events": events,
        "stats": {
            "neutral_possession": neutral_poss,
            team1.name: {
                "shots": sum(p.shots for p in team1.players), 
                "sogs": sum(p.sogs for p in team1.players), 
                "saves": team1.saves,
                "possession": t1_poss,
                "stops": sum(p.stops for p in team1.players)
            },
            team2.name: {
                "shots": sum(p.shots for p in team2.players), 
                "sogs": sum(p.sogs for p in team2.players), 
                "saves": team2.saves,
                "possession": t2_poss,
                "stops": sum(p.stops for p in team2.players)
            }
        },
        "player_data": {
            "team1": [{"name": p.name, "pos": p.pos, "shots": p.shots, "sogs": p.sogs, "goals": p.goals, "assists": p.assists, "stops": p.stops, 
                       "saves": team1.saves if (p.pos == 'GK' or (p.pos == 'N/A' and i == len(team1.players)-1)) else 0,
                       "goals_against": team2.score if (p.pos == 'GK' or (p.pos == 'N/A' and i == len(team1.players)-1)) else 0} for i, p in enumerate(team1.players)],
            "team2": [{"name": p.name, "pos": p.pos, "shots": p.shots, "sogs": p.sogs, "goals": p.goals, "assists": p.assists, "stops": p.stops, 
                       "saves": team2.saves if (p.pos == 'GK' or (p.pos == 'N/A' and i == len(team2.players)-1)) else 0,
                       "goals_against": team1.score if (p.pos == 'GK' or (p.pos == 'N/A' and i == len(team2.players)-1)) else 0} for i, p in enumerate(team2.players)]
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
