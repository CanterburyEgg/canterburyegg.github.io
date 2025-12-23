import json

FILENAME = "jsons/triangles.json" # Make sure path is correct
EASY_LIMIT = 250
MEDIUM_LIMIT = 500

try:
    with open(FILENAME, 'r') as f:
        data = json.load(f)
        
    puzzles = data['puzzles']
    total = len(puzzles)
    easy_count = sum(1 for p in puzzles if p.get('difficulty', 999) <= EASY_LIMIT)
    medium_count = sum(1 for p in puzzles if p.get('difficulty', 999) <= MEDIUM_LIMIT)
    
    print(f"📊 STATS REPORT")
    print(f"----------------")
    print(f"Total Puzzles: {total}")
    print(f"Easy Puzzles (Top {EASY_LIMIT}): {easy_count}")
    print(f"Easy Percentage: {easy_count / total * 100:.1f}%")
    print(f"Medium Puzzles (Top {MEDIUM_LIMIT}): {medium_count}")
    print(f"Medium Percentage: {medium_count / total * 100:.1f}%")

except FileNotFoundError:
    print(f"❌ Could not find {FILENAME}")