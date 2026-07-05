import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILE_PATH = os.path.join(BASE_DIR, "lists", "league_rosters.json")

with open(FILE_PATH, 'r') as f:
    data = json.load(f)

print(f"{'Team':<25} | {'Identity':<10} | {'Surplus':<10}")
print("-" * 50)

total_surplus = 0
for t in data:
    surplus = t["budget"] - t["spent"]
    total_surplus += surplus
    print(f"{t['team']:<25} | {t['identity']:<10} | ${surplus:>8.2f}m")

print("-" * 50)
print(f"TOTAL LEAGUE SURPLUS: ${total_surplus:,.2f}m")
