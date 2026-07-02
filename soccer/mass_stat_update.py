import os
import random

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_stats(path):
    if not os.path.exists(path): return None
    with open(path, 'r') as f:
        lines = [l.strip() for l in f.readlines() if l.strip()]
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

def generate_valid_set(baseline):
    while True:
        candidate = []
        for val in baseline:
            if val == 10: res = random.choice([8, 9, 10])
            elif val == 9: res = random.choice([8, 9])
            elif val == 1: res = random.choice([1, 2])
            elif val == 0: res = random.choice([0, 1, 2])
            else:
                low = max(0, val - 2)
                high = min(10, val + 2)
                res = random.randint(low, high)
            candidate.append(res)
        
        total_drift = sum(abs(candidate[i] - baseline[i]) for i in range(4))
        if total_drift <= 4:
            return candidate

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

# --- 1. Global Baseline (2022) ---
t22_files = find_all_files('2022')
baselines = {name: get_stats(paths[0]) for name, paths in t22_files.items()}

# --- 2. Update 2024 and 2026 ---
for year in ['2024', '2026']:
    year_files = find_all_files(year)
    print(f"Checking and repairing {year} stats...")
    for name, paths in sorted(year_files.items()):
        current_baseline = baselines.get(name) or get_stats(paths[0])
        current_actual = get_stats(paths[0])
        
        if current_baseline and current_actual:
            # Check if current is already valid
            individual_valid = all(abs(current_actual[i] - current_baseline[i]) <= 2 for i in range(4))
            total_drift = sum(abs(current_actual[i] - current_baseline[i]) for i in range(4))
            total_valid = total_drift <= 4
            
            # Additional Check: If baseline is 10, 9, 1, or 0, it ALWAYS triggers a re-roll?
            # User said "rerolling new numbers IF the drift is too high."
            # So I will prioritize the drift check.
            
            if individual_valid and total_valid:
                new_stats = current_actual
            else:
                new_stats = generate_valid_set(current_baseline)
                print(f"  [REPAIRED] {name}: {current_actual} -> {new_stats} (Baseline: {current_baseline})")
            
            for p in paths:
                update_stats(p, new_stats)
            
            if name not in baselines:
                baselines[name] = current_baseline

print("Update complete. All teams within limits.")
