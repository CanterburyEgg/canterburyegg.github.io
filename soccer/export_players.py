import json
import os
import random
import math

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_team_data(year, tournament, name):
    file_path = os.path.join(BASE_DIR, "Tournaments", year, tournament, "Teams", f"{name}.txt")
    if not os.path.exists(file_path): return None
    with open(file_path, 'r') as f:
        lines = [l.strip() for l in f.readlines() if l.strip()]
    if len(lines) < 5: return None
    stats = [int(l) for l in lines[-4:]]
    roster_lines = lines[:-4]
    roster = []
    for rl in roster_lines:
        parts = rl.split('\t')
        if len(parts) < 2: continue
        roster.append({"name": parts[0], "prop": int(parts[1])})
    return {"name": name, "roster": roster, "stats": stats}

def get_bucket_range(rank):
    # 10: 91+, 9: 87-91, 8: 83-87, ... 1: 55-59, 0: <55
    if rank == 0: return 40.0, 55.0
    right = 91.0 - (9 - rank) * 4.0
    left = right - 4.0
    if rank == 10: return 91.0, 100.0
    return left, right

team_registry = {}
wc_teams_dir = os.path.join(BASE_DIR, "Tournaments", "2026", "World Cup", "Teams")
if os.path.exists(wc_teams_dir):
    for f in os.listdir(wc_teams_dir):
        if f.endswith(".txt"):
            t_name = f[:-4]
            data = get_team_data("2026", "World Cup", t_name)
            if data:
                data["size"] = 9
                team_registry[t_name] = data

target_quals = ["Africa-Qual", "Asia-Qual", "Copa-Qual", "EUC-Qual"]
for q_dir in target_quals:
    q_teams_dir = os.path.join(BASE_DIR, "Tournaments", "2024", q_dir, "Teams")
    if os.path.exists(q_teams_dir):
        for f in os.listdir(q_teams_dir):
            if f.endswith(".txt"):
                t_name = f[:-4]
                if t_name in team_registry: continue
                data = get_team_data("2024", q_dir, t_name)
                if data:
                    data["size"] = 7
                    team_registry[t_name] = data

all_teams = list(team_registry.values())
output_rows = [["Position", "Name", "Country", "SH", "SP", "DF", "GK"]]

for team in all_teams:
    o_bucket = get_bucket_range(team["stats"][0])
    s_bucket = get_bucket_range(team["stats"][1])
    d_bucket = get_bucket_range(team["stats"][2])
    g_bucket = get_bucket_range(team["stats"][3])
    
    size = team["size"]
    roster = team["roster"]
    props = [p["prop"] for p in roster]
    actual_outfield = size - 1

    if size == 9:
        f_s, m_s, d_s = slice(0, 2), slice(2, 5), slice(5, 8)
    else:
        f_s, m_s, d_s = slice(0, 2), slice(2, 4), slice(4, 6)

    def validate_constraints(r, indices):
        # Higher shot prop = Higher rating
        sorted_idx = sorted(range(len(indices)), key=lambda i: props[indices[i]], reverse=True)
        for i in range(len(sorted_idx) - 1):
            idx_a, idx_b = indices[sorted_idx[i]], indices[sorted_idx[i+1]]
            if r[idx_a] < r[idx_b]: return False
            # Tie breaker: same prop -> within 5
            if props[idx_a] == props[idx_b]:
                if abs(r[idx_a] - r[idx_b]) > 5: return False
        return True

    def roll_stat(bucket, score_func, player_indices, group_indices_list, caps=None):
        while True:
            r = []
            used = set()
            success = True
            for i in range(size):
                val_found = False
                for _ in range(200): # Internal attempts for uniqueness
                    val = random.randint(20, 50)
                    if val == 50:
                        val = random.choice([50, 49, 48, 47])
                    elif val == 49:
                        val = random.choice([49, 48, 47])
                    
                    if caps and i < len(caps):
                        val = min(val, caps[i])
                    
                    if val not in used:
                        r.append(val)
                        used.add(val)
                        val_found = True
                        break
                
                if not val_found:
                    success = False
                    break
            
            if not success: continue
            
            valid = True
            for g in group_indices_list:
                if not validate_constraints(r, g):
                    valid = False
                    break
            if not valid: continue
            
            score = score_func(r)
            if bucket[0] <= score < bucket[1]:
                return r

    # 1. SH (FWD max is star)
    def sh_score(r):
        avg = sum(r[i] * props[i] for i in range(actual_outfield)) / 100.0
        return avg + max(r[f_s])
    
    sh_caps = [30 + p for p in props] # Caps for SH
    sh = roll_stat(o_bucket, sh_score, range(actual_outfield), [list(range(f_s.start, f_s.stop)), list(range(m_s.start, m_s.stop)), list(range(d_s.start, d_s.stop))], caps=sh_caps)

    # 2. SP (MID max is star)
    def sp_score(r):
        f = sum(r[f_s])/2.0; m = sum(r[m_s])/(m_s.stop-m_s.start); d = sum(r[d_s])/(d_s.stop-d_s.start)
        avg = (f * 0.25) + (m * 0.5) + (d * 0.25)
        return avg + max(r[m_s])
    sp = roll_stat(s_bucket, sp_score, range(actual_outfield), [])

    # 3. DF (DEF max is star)
    def df_score(r):
        m_indices = list(range(m_s.start, m_s.stop))
        d_indices = list(range(d_s.start, d_s.stop))
        m_avg = sum(r[i] for i in m_indices) / len(m_indices)
        d_avg = sum(r[i] for i in d_indices) / len(d_indices)
        gk_df = r[-1]
        avg = (d_avg * 0.6) + (m_avg * 0.3) + (gk_df * 0.1)
        return avg + max(r[i] for i in d_indices)
    
    # We include GK in the roll for DF
    df = roll_stat(d_bucket, df_score, list(range(m_s.start, m_s.stop)) + list(range(d_s.start, d_s.stop)) + [size-1], [])

    # 4. GK (GK Score = Rating + Rating)
    gk_rating = random.randint(max(20, math.ceil(g_bucket[0]/2.0)), min(50, math.floor(g_bucket[1]/2.0)))

    # Matrix Compilation
    p_matrix = [[0,0,0,0] for _ in range(size)]
    
    # FWD, MID, DEF all have SH and SP
    for i in range(actual_outfield):
        p_matrix[i][0] = sh[i]
        p_matrix[i][1] = sp[i]
    
    # MID, DEF, and GK have Defense (DF)
    m_indices = range(m_s.start, m_s.stop)
    d_indices = range(d_s.start, d_s.stop)
    for i in m_indices: p_matrix[i][2] = df[i]
    for i in d_indices: p_matrix[i][2] = df[i]
    p_matrix[-1][2] = df[-1] # GK DF
    
    # Only GK has Goalkeeping (GK)
    p_matrix[-1][3] = gk_rating

    print(f"Validated {team['name']}")

    pos_labels = ["FWD"]*2 + ["MID"]*(m_s.stop-m_s.start) + ["DEF"]*(d_s.stop-d_s.start) + ["GK"]
    for i, p in enumerate(roster):
        row = [pos_labels[i], p["name"], team["name"]] + p_matrix[i]
        output_rows.append(row)

out_path = os.path.join(BASE_DIR, "player_export.tsv")
with open(out_path, "w") as f:
    for row in output_rows:
        f.write("\t".join([str(x) for x in row]) + "\n")

print(f"Exported {len(output_rows)-1} players to {out_path}")
