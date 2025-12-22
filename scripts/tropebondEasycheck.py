import json

FILENAME = "jsons/triangles.json" # Make sure path is correct
EASY_LIMIT = 300

try:
    with open(FILENAME, 'r') as f:
        data = json.load(f)
        
    puzzles = data['puzzles']
    total = len(puzzles)
    easy_count = sum(1 for p in puzzles if p.get('difficulty', 999) <= EASY_LIMIT)
    
    print(f"📊 STATS REPORT")
    print(f"----------------")
    print(f"Total Puzzles: {total}")
    print(f"Easy Puzzles (Top {EASY_LIMIT}): {easy_count}")
    print(f"Easy Percentage: {easy_count / total * 100:.1f}%")

except FileNotFoundError:
    print(f"❌ Could not find {FILENAME}")