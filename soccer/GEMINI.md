# Soccer Sim 2026: Project State & Context

## 1. Simulation Engine (soccer_driver.py)
The engine has been converted from C# to Python and tuned for a specific "World Class" feel.
- **Hybrid Randomness Model:**
    - **Possession Check:** uses a **1-75** range to ensure underdogs (Speed 0) still get ~33% possession against elite teams (Speed 10).
    - **Action/Shot/Goal Checks:** use a tighter **1-50** range to make ratings (0-10) high-leverage.
- **Thresholds (Mapping to ~60% Miss / 50% Save):**
    - **Action Check:** `<= 38` (No action in ~76% of minutes).
    - **Shot Quality:** `<= 30` (Miss).
    - **Goal Check:** `<= 25` (Save).
- **Target Logic:** Designed to yield a **3.5 - 0.5** scoreline for a "Perfect" (10s) vs "Awful" (0s) matchup.

## 2. Architecture
- **tournament_manager.py:** A path-agnostic script that runs tournaments based on a `config.json` file found in the target directory.
- **Data-Driven:** It clears existing `Games/` logs, runs a double-round robin group stage, and executes custom knockout logic (currently `asia_qualifiers` type).
- **Output:** Generates a comprehensive `results.json` containing match events, scorers, and stats, alongside individual `.txt` logs.

## 3. Current Tournament State (2026 Cycle)
- **Rosters:** 88 teams total. 61 are legacy rosters from 2022; 27 are new teams with culturally authentic generated names (10 name pool per country).
- **Ratings:** Teams are tiered S through F.
    - **Tier S:** Argentina, Germany, Belgium, Brazil, France (Rank 9.2+).
    - **Tier F:** Vietnam, Suriname, Guyana, Bahrain, Guinea, China (Rank < 2.5).
- **Progress:** Asia (AS) Qualifiers have been successfully simulated. The next regions to configure are AFR, SA, EU, NA, and OCE.

## 4. League Ecosystem (48-64 Teams)
The simulation is expanding into a club-based league structure.
- **Roster Construction:** 9 players per team (2 FWD, 3 MID, 3 DEF, 1 GK).
- **Leagues (16 teams each):**
    1. **Backyard League:** US-based (MLS-style pedigree).
    2. **Prime League:** UK-based (Elite pedigree).
    3. **Euro League:** Northern Continental Europe.
    4. **Liga Mediterranea:** Mediterranean-based.
- **Player Pool:** Hybrid of World Cup/Qualifier stars and newly generated "Domestic Reserve" players for powerhouse nations.
