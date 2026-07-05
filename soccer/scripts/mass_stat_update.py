import os
import random
import math

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_stats(path):
    if not os.path.exists(path): return None
    with open(path, 'r') as f:
        lines = [l.strip() for l in f.readlines() if l.strip()]
        if len(lines) < 4: return None
        return [int(l) for l in lines[-4:]]

def update_stats(path, new_stats):
    with open(path, 'r') as f:
        lines = f.readlines()
    content_lines = [l.strip() for l in lines if l.strip()]
    player_lines = content_lines[:-4]
    with open(path, 'w') as f:
        for pl in player_lines:
            f.write(pl + "\n")
        for s in new_stats:
            f.write(str(s) + "\n")

def generate_valid_random_set(baseline):
    while True:
        candidate = []
        for val in baseline:
            candidate.append(random.randint(max(0, val - 2), min(10, val + 2)))
        net_drift = sum(candidate[i] - baseline[i] for i in range(4))
        if -4 <= net_drift <= 4:
            return candidate

def generate_brand_new_set():
    while True:
        candidate = [random.randint(0, 6) for _ in range(4)]
        if sum(candidate) <= 18:
            return candidate

def apply_extremity_rule(val):
    if val == 10: return random.choice([8, 9, 10])
    if val == 9:  return random.choice([8, 9])
    if val == 1:  return random.choice([1, 2])
    if val == 0:  return random.choice([0, 1, 2])
    return val

def find_all_files(year):
    registry = {}
    base = os.path.join(BASE_DIR, "Tournaments", year)
    if not os.path.exists(base): return {}
    for root, dirs, files in os.walk(base):
        if 'Teams' in root:
            for f in files:
                if f.endswith('.txt'):
                    name = f[:-4]
                    if name not in registry: registry[name] = []
                    registry[name].append(os.path.join(root, f))
    return registry

def is_eus_na(path):
    p = path.upper()
    return any(x in p for x in ["/EU", "/SA", "/NA", "EUC", "COPA"])

# --- Setup Baselines ---
t22_files = find_all_files('2022')
baselines_2022 = {name: get_stats(paths[0]) for name, paths in t22_files.items()}

t24_files = find_all_files('2024')
baselines_2024_qual = {}
for name, paths in t24_files.items():
    # Capture stats from any 2024 Qualifier folder
    qual_path = next((p for p in paths if "-Qual" in p or "EUC-Qual" in p or "Copa-Qual" in p), None)
    if qual_path:
        baselines_2024_qual[name] = get_stats(qual_path)

# --- Processing Loop ---
for year in ['2024', '2026']:
    year_files = find_all_files(year)
    team_data = {}
    for name, paths in sorted(year_files.items()):
        stats = get_stats(paths[0])
        if not stats: continue
        
        eus_na_status = any(is_eus_na(p) for p in paths)
        
        # Determine baseline type
        baseline = None
        is_brand_new = False
        
        # A team is ONLY brand new if it is not in 2022 AND not in any 2024 Quals
        if name not in baselines_2022 and name not in baselines_2024_qual:
            is_brand_new = True
            baseline = stats 
        else:
            # Region-based priority
            if eus_na_status:
                baseline = baselines_2024_qual.get(name) or baselines_2022.get(name)
            else:
                baseline = baselines_2022.get(name) or baselines_2024_qual.get(name)
            
        team_data[name] = {"actual": stats, "paths": paths, "baseline": baseline, "is_eus_na": eus_na_status, "is_brand_new": is_brand_new}

    print(f"\n--- {year} STAGE 0: BRAND NEW TEAMS ---")
    for name, data in team_data.items():
        if data["is_brand_new"]:
            new_stats = generate_brand_new_set()
            print(f"  [NEW] {name:<20}: {data['actual']} -> {new_stats}")
            data["actual"] = new_stats
            data["baseline"] = new_stats 

    print(f"\n--- {year} STAGE 1: REPAIRS ---")
    for name, data in team_data.items():
        # Skip 2024 stable regions
        if year == '2024' and data["is_eus_na"]: continue
        if data["is_brand_new"]: continue
        
        base = data["baseline"]
        act = data["actual"]
        individual_valid = all(abs(act[i] - base[i]) <= 2 for i in range(4))
        net_drift = sum(act[i] - base[i] for i in range(4))
        
        if not (individual_valid and (-4 <= net_drift <= 4)):
            new_stats = generate_valid_random_set(base)
            print(f"  [REPAIRED] {name:<20}: {act} -> {new_stats} (Baseline: {base})")
            data["actual"] = new_stats

    print(f"\n--- {year} STAGE 2: EXTREME REROLLS ---")
    for name, data in team_data.items():
        if year == '2024' and data["is_eus_na"]: continue
        
        act = data["actual"]
        if any(s in [0, 1, 9, 10] for s in act):
            new_stats = [apply_extremity_rule(s) for s in act]
            if new_stats != act:
                print(f"  [EXTREME] {name:<20}: {act} -> {new_stats}")
                data["actual"] = new_stats

    print(f"\n--- {year} STAGE 3: VALIDATION ---")
    for name, data in team_data.items():
        base = data["baseline"]
        act = data["actual"]
        net_drift = sum(act[i] - base[i] for i in range(4))
        
        if not (-4 <= net_drift <= 4):
            print(f"  [MANUAL CHECK] {name:<20}: {act} (Baseline: {base}, Net Drift: {net_drift})")
        
        for p in data["paths"]:
            update_stats(p, act)

print("\nUpdate process complete.")
