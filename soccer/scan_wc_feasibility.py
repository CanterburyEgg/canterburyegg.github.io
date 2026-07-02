import json
import os
import random

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_bucket_range(rank):
    l = 22.5 + (rank * 2.5)
    return l, l + 2.5

def get_team_data(name):
    path = os.path.join(BASE_DIR, "Tournaments/2026/World Cup/Teams", f"{name}.txt")
    if not os.path.exists(path): return None
    with open(path, 'r') as f:
        lines = [l.strip() for l in f.readlines() if l.strip()]
    stats = [int(l) for l in lines[-4:]]
    props = [int(l.split('\t')[1]) for l in lines[:-4]]
    return {"name": name, "stats": stats, "props": props}

def check_feasibility(team):
    o_r = get_bucket_range(team["stats"][0])
    s_r = get_bucket_range(team["stats"][1])
    d_r = get_bucket_range(team["stats"][2])
    g_r = get_bucket_range(team["stats"][3])
    props = team["props"]
    size = 9
    
    gk_min = max(20, int(g_r[0]) + 1)
    gk_max = min(50, int(g_r[1]))
    
    # Brute force check that focuses on the Pincer:
    # High Iteration search within the GK bucket.
    max_o = 0
    min_o = 100
    found_sd = False

    for _ in range(2000000):
        # Generate random ratings 20-50
        r = [random.randint(20, 50) for _ in range(9)]
        # Force GK into bucket
        r[8] = random.randint(gk_min, gk_max)
        
        # Enforce position group shot-propensity constraints
        # FWD (0,1), MID (2,3,4), DEF (5,6,7)
        if r[0] < r[1]: r[0], r[1] = r[1], r[0]
        if r[2] < r[3]: r[2], r[3] = r[3], r[2]
        if r[3] < r[4]: r[3], r[4] = r[4], r[3]
        if r[5] < r[6]: r[5], r[6] = r[6], r[5]
        if r[6] < r[7]: r[6], r[7] = r[7], r[6]

        f_avg = (r[0] + r[1]) / 2.0
        m_avg = (r[2] + r[3] + r[4]) / 3.0
        d_avg = (r[5] + r[6] + r[7]) / 3.0
        
        spd = (f_avg * 0.25) + (m_avg * 0.5) + (d_avg * 0.25)
        dfn = (d_avg * 0.6) + (m_avg * 0.3) + (r[8] * 0.1)
        
        # Check if Speed and Defense are satisfied
        if (s_r[0] < spd <= s_r[1]) and (d_r[0] < dfn <= d_r[1]):
            found_sd = True
            off = sum(r[i] * props[i] for i in range(8)) / 100.0
            max_o = max(max_o, off)
            min_o = min(min_o, off)
            if o_r[0] < off <= o_r[1]:
                return True, "SUCCESS"
    
    if not found_sd:
        return False, "Speed and Defense buckets are incompatible."
    if max_o < o_r[0]:
        return False, f"Offense too low (Max achievable: {max_o:.2f}, Need: >{o_r[0]})"
    if min_o > o_r[1]:
        return False, f"Offense too high (Min achievable: {min_o:.2f}, Need: <={o_r[1]})"
    
    return False, "Failed to hit Offense bucket within Speed/Defense constraints."

# Load World Cup teams
teams = []
wc_res_path = os.path.join(BASE_DIR, "Tournaments/2026/World Cup/results.json")
with open(wc_res_path, 'r') as f:
    wc_data = json.load(f)
    for g_id, g_teams in wc_data["config"]["groups"].items():
        for t_name in g_teams:
            data = get_team_data(t_name)
            if data: teams.append(data)

print(f"Scanning {len(teams)} teams for mathematical feasibility...")
impossible = []

for t in teams:
    success, reason = check_feasibility(t)
    if not success:
        print(f"[IMPOSSIBLE] {t['name']} - {reason}")
        impossible.append(t['name'])
    else:
        print(f"[OK]         {t['name']}")

print(f"\nScan Complete. {len(impossible)} teams are mathematically impossible.")
if impossible:
    print(f"Impossible teams: {', '.join(impossible)}")
