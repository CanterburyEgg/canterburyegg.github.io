import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Build a comprehensive NAME_TO_ID map from teams.json
NAME_TO_ID = {}
teams_path = os.path.join(SCRIPT_DIR, "teams.json")
with open(teams_path, 'r') as f:
    teams_data = json.load(f)
    for team in teams_data:
        NAME_TO_ID[team['name']] = team['id']
        NAME_TO_ID[team['id']] = team['id']
        if "past_names" in team:
            for past in team["past_names"]:
                NAME_TO_ID[past] = team['id']

champ_raw = """
2010:1st Gen Pokemon
2010:Backyard Customs
2011:3rd Gen Pokemon
2011:Backyard Customs
2012:Boys
2012:Left 4 Dead
2013:Smash Bros.
2013:2nd Gen Pokemon
2014:3rd Gen Pokemon
2014:Smash Bros.
2015:1st Gen Pokemon
2015:Halloween Town
2016:Stuffed Animals
2016:Boys
2017:6th Gen Pokemon
2017:Halloween Town
2018:3rd Gen Pokemon
2018:The Avengers
2019:Overwatch
2019:Stuffed Animals
2020:New Mario
2020:Beanie Babies
2021:3rd Gen Pokemon
2021:Zombies
2022:Stuffed Animals
2022:Overwatch
2023:Stuffed Animals
2023:DC Villains
2024:7th Gen Pokemon
2024:DC Heroes
2025:Odd Ducks
2025:Game of Thrones
"""

opoy_raw = """
2025
Daenerys Targaryen
Demolisher
Randy
Reed
Bailey Myers-Morgan
Deonte Westbrook
Meloetta
Mooch
2024
Black Cat
Hawlucha
Randy
Reed
Meloetta
Nightwing
Sister Friede
Wonder Woman
2023
Demolisher
Hawlucha
Randy
Reed
Deonte Westbrook
Jack Skellington
Meloetta
Nightwing
2022
Hawlucha
Randy
Reed
Smoker
Meloetta
Mooch
Nick Hamburger
Oko
2021
Dragonite
Hawlucha
Meloetta
Randy
Grimmsnarl
Mooch
Nick Hamburger
Oko
2020
Fawful
Hawlucha
Meloetta
Smoker
Catwoman
Jack Skellington
Nick Hamburger
Sneasel
2019
Hawlucha
Meloetta
Randy
Reed
Nick Hamburger
Sigma
Sneasel
Swampert
2018
Dragonite
Jolteon
Randy
Reed
Catwoman
Jack Skellington
Nick Hamburger
Swampert
"""

playoffs_raw = """
2025
Game of Thrones
Zombies
League of Legends
Elden Ring
Stuffed Animals
1st Gen Pokemon
7th Gen Pokemon
Marvel Heroes
Beanie Babies
Classic OSFL
Odd Ducks
DC Heroes
Backyard Kids
5th Gen Pokemon
Overwatch
Magic Walkers
2024
Game of Thrones
6th Gen Pokemon
League of Legends
Stuffed Animals
1st Gen Pokemon
7th Gen Pokemon
Marvel Villains
9th Gen Pokemon
Omega
Beanie Babies
Classic OSFL
Dark Souls
DC Villains
DC Heroes
Overwatch
Shonen Jump
2023
Zombies
League of Legends
Game of Thrones
Stuffed Animals
1st Gen Pokemon
7th Gen Pokemon
9th Gen Pokemon
Marvel Heroes
Classic OSFL
Beanie Babies
Toon Town
DC Villains
Backyard Kids
Dark Souls
Shonen Jump
Overwatch
2022
New Mario
Zombies
Stuffed Animals
7th Gen Pokemon
Marvel Heroes
Smash Bros.
Beanie Babies
Omega
Odd Ducks
Overwatch
3rd Gen Pokemon
5th Gen Pokemon
2021
Zombies
6th Gen Pokemon
4th Gen Pokemon
Stuffed Animals
1st Gen Pokemon
Smash Bros.
Beanie Babies
Odd Ducks
Dark Souls
Backyard Kids
Overwatch
3rd Gen Pokemon
2020
New Mario
Game of Thrones
4th Gen Pokemon
Stuffed Animals
1st Gen Pokemon
7th Gen Pokemon
Beanie Babies
Backyard Kids
Odd Ducks
Dark Souls
Overwatch
3rd Gen Pokemon
2019
6th Gen Pokemon
New Mario
Stuffed Animals
4th Gen Pokemon
Smash Bros.
Beanie Babies
Halloween Town
Dark Souls
Overwatch
3rd Gen Pokemon
2018
6th Gen Pokemon
Stuffed Animals
1st Gen Pokemon
The Avengers
Marvel Villains
Halloween Town
Backyard Kids
DC Villains
3rd Gen Pokemon
5th Gen Pokemon
2017
6th Gen Pokemon
Boys
Overwatch
Evil Mario
Stuffed Animals
Halloween Town
3rd Gen Pokemon
Smash Bros.
1st Gen Pokemon
2nd Gen Pokemon
2016
Zombies
Evil Mario
Stuffed Animals
1st Gen Pokemon
Smash Bros.
2nd Gen Pokemon
Halloween Town
Boys
Backyard Customs
5th Gen Pokemon
2015
6th Gen Pokemon
1st Gen Pokemon
Stuffed Animals
4th Gen Pokemon
The Avengers
Classic 3IFL
Halloween Town
Beanie Babies
Boys
3rd Gen Pokemon
2014
Legendary Pokemon
Smash Bros.
4th Gen Pokemon
Mario
The Avengers
Classic 3IFL
Backyard Customs
3rd Gen Pokemon
Backyard Kids
5th Gen Pokemon
2013
League of Legends
Legendary Pokemon
Left 4 Dead
Smash Bros.
The Avengers
Backyard Customs
2nd Gen Pokemon
Classic 3IFL
3rd Gen Pokemon
5th Gen Pokemon
2012
1st Gen Pokemon
Left 4 Dead
Smash Bros.
4th Gen Pokemon
Boys
Backyard Customs
2nd Gen Pokemon
3rd Gen Pokemon
2011
Mario
3rd Gen Pokemon
1st Gen Pokemon
Beanie Babies
Backyard Customs
4th Gen Pokemon
2010
1st Gen Pokemon
Mario
Smash Bros.
Backyard Customs
Beanie Babies
Boys
"""

data = {
    "championship": {},
    "playoffs": {},
    "opoy_finalists": {}
}

# Parse Championship
for line in champ_raw.strip().split("\n"):
    year, name = line.split(":")
    if year not in data["championship"]: data["championship"][year] = []
    data["championship"][year].append(NAME_TO_ID.get(name, name))

# Parse OPOY
current_year = None
for line in opoy_raw.strip().split("\n"):
    if line.isdigit():
        current_year = line
        data["opoy_finalists"][current_year] = []
    elif current_year:
        data["opoy_finalists"][current_year].append(line.strip())

# Parse Playoffs
current_year = None
for line in playoffs_raw.strip().split("\n"):
    if line.isdigit():
        current_year = line
        data["playoffs"][current_year] = []
    elif current_year:
        data["playoffs"][current_year].append(NAME_TO_ID.get(line.strip(), line.strip()))

output_path = os.path.join(SCRIPT_DIR, "specialties.json")
with open(output_path, "w") as f:
    json.dump(data, f, indent=2)

print("Created specialties.json")
