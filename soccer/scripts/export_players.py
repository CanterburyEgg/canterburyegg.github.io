import json
import os
import random
import math
from collections import Counter

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class RetryTeam(Exception): pass

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

# WORLD-WIDE UNIQUENESS TRACKER
world_used_stats = set()

for team in all_teams:
    t_stats = team["stats"]
    o_bucket = get_bucket_range(t_stats[0])
    s_bucket = get_bucket_range(t_stats[1])
    d_bucket = get_bucket_range(t_stats[2])
    g_bucket = get_bucket_range(t_stats[3])
    caps_base = [33 + (2 * s) for s in t_stats]
    size = team["size"]
    roster = team["roster"]
    props = [p["prop"] for p in roster]
    actual_outfield = size - 1

    if size == 9:
        f_s, m_s, d_s = slice(0, 2), slice(2, 5), slice(5, 8)
    else:
        f_s, m_s, d_s = slice(0, 2), slice(2, 4), slice(4, 6)

    def validate_shooting(r, indices):
        sorted_idx = sorted(indices, key=lambda idx: props[idx], reverse=True)
        for i in range(len(sorted_idx) - 1):
            idx_a, idx_b = sorted_idx[i], sorted_idx[i+1]
            p_a, p_b = props[idx_a], props[idx_b]
            r_a, r_b = r[idx_a], r[idx_b]
            if p_a > p_b:
                if r_a <= r_b: return False
            elif p_a == p_b:
                if abs(r_a - r_b) > 5: return False
        return True

    def attempt_team():
        team_value_counts = Counter()
        
        def roll_stat(bucket, score_func, specific_caps=None, team_stat_cap=50, is_shooting=False):
            for attempt in range(5000):
                r = []
                col_counts = Counter()
                unit_counts = {"F": Counter(), "M": Counter(), "D": Counter(), "G": Counter()}
                success = True
                
                def get_unit(idx):
                    if idx in range(f_s.start, f_s.stop): return "F"
                    if idx in range(m_s.start, m_s.stop): return "M"
                    if idx in range(d_s.start, d_s.stop): return "D"
                    return "G"

                for i in range(size):
                    u = get_unit(i)
                    val_found = False
                    p_cap = team_stat_cap
                    if specific_caps and i < len(specific_caps): p_cap = min(p_cap, specific_caps[i])
                    
                    for _ in range(100):
                        val = random.randint(20, min(50, p_cap))
                        if val == 50: val = random.choice([50, 49, 48, 47])
                        elif val == 49: val = random.choice([49, 48, 47])
                        val = min(val, p_cap)
                        
                        if unit_counts[u][val] < 1 and col_counts[val] < 2 and (team_value_counts[val] + col_counts[val]) < 4:
                            r.append(val)
                            unit_counts[u][val] += 1
                            col_counts[val] += 1
                            val_found = True
                            break
                    if not val_found:
                        success = False
                        break
                
                if not success: continue
                if is_shooting and not validate_shooting(r, range(actual_outfield)): continue
                
                if bucket[0] <= score_func(r) < bucket[1]:
                    for val in r: team_value_counts[val] += 1
                    return r
            raise RetryTeam()

        sh_caps = [30 + p for p in props]
        sh = roll_stat(o_bucket, lambda r: (sum(r[i]*props[i] for i in range(actual_outfield))/100.0) + max(r[f_s]), specific_caps=sh_caps, team_stat_cap=caps_base[0], is_shooting=True)
        sp = roll_stat(s_bucket, lambda r: (sum(r[f_s])/2.0 * 0.25) + (sum(r[m_s])/(m_s.stop-m_s.start) * 0.5) + (sum(r[d_s])/(d_s.stop-d_s.start) * 0.25) + max(r[m_s]), team_stat_cap=caps_base[1])

        def df_score(r):
            m_idx, d_idx = range(m_s.start, m_s.stop), range(d_s.start, d_s.stop)
            m_avg, d_avg = sum(r[i] for i in m_idx)/len(m_idx), sum(r[i] for i in d_idx)/len(d_idx)
            return (d_avg * 0.6) + (m_avg * 0.3) + (r[-1] * 0.1) + max(r[i] for i in d_idx)
        df = roll_stat(d_bucket, df_score, team_stat_cap=caps_base[2])

        gk_min, gk_max = max(20, math.ceil(g_bucket[0]/2.0)), min(50, math.floor(g_bucket[1]/2.0), caps_base[3])
        gk_rating = None
        for _ in range(500):
            val = random.randint(max(20, gk_min), min(50, gk_max))
            if team_value_counts[val] < 4:
                gk_rating = val; break
        if gk_rating is None: raise RetryTeam()
        return sh, sp, df, gk_rating

    # OUTER LOOP: WORLD-WIDE UNIQUE CHECK
    while True:
        try:
            sh, sp, df, gk = attempt_team()
            
            # Map the actual final stat lines
            temp_lines = []
            collision = False
            for i in range(size):
                # 0, 1 = FWD; 2... = MID/DEF; last = GK
                is_fwd = (i in [0, 1])
                is_gk = (i == size - 1)
                
                # FWD: SH, SP, 0, 0
                # MID/DEF: SH, SP, DF, 0
                # GK: 0, 0, DF, GK
                
                final_sh = sh[i] if not is_gk else 0
                final_sp = sp[i] if not is_gk else 0
                final_df = df[i] if not is_fwd else 0
                final_gk = gk if is_gk else 0
                
                line = (final_sh, final_sp, final_df, final_gk)
                if line in world_used_stats:
                    collision = True
                    break
                temp_lines.append(line)
            
            if collision:
                continue # Retry this country
            
            # SUCCESS: Add to world and break
            for line in temp_lines:
                world_used_stats.add(line)
            
            # Final matrix for TSV matches the line logic
            p_matrix = []
            for i in range(size):
                p_matrix.append(list(temp_lines[i]))
            break
            
        except RetryTeam: continue

    print(f"Validated {team['name']}")
    pos_labels = ["FWD"]*2 + ["MID"]*(m_s.stop-m_s.start) + ["DEF"]*(d_s.stop-d_s.start) + ["GK"]
    for i, p in enumerate(roster):
        output_rows.append([pos_labels[i], p["name"], team["name"]] + p_matrix[i])

out_path = os.path.join(BASE_DIR, "player_export.tsv")
with open(out_path, "w") as f:
    for row in output_rows:
        f.write("\t".join([str(x) for x in row]) + "\n")
print(f"Exported {len(output_rows)-1} players to {out_path}")
