import json
import os
import tournament_manager

def refresh(tournament_path):
    # Match the logic in tournament_manager.py
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    base_path = os.path.join(base_dir, "Tournaments", tournament_path)
    results_path = os.path.join(base_path, "results.json")
    config_path = os.path.join(base_path, "config.json")
    
    if not os.path.exists(results_path):
        print(f"Results file not found at {results_path}")
        return

    with open(results_path, 'r') as f:
        data = json.load(f)
    
    with open(config_path, 'r') as f:
        config = json.load(f)

    print(f"Refreshing standings for {tournament_path}...")
    
    # Recalculate standings for each group
    for g_id in data["groups"]:
        tournament_manager.update_group_standings(data, g_id)
        print(f"  Group {g_id} updated.")

    # Re-check mathematical locks/bracket if it's a World Cup
    if config.get("type") == "world_cup":
        tournament_manager.check_mathematical_locks(data)
        print("  Bracket locks updated.")

    with open(results_path, 'w') as f:
        json.dump(data, f, indent=2)
    print("Refresh complete.")

if __name__ == "__main__":
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else "2026/World Cup"
    refresh(path)
