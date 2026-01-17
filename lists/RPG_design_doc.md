# RPG MVP DESIGN DOC - FINALIZED BASE

## 1. CORE MECHANICS
- CHARACTER STATS: Strength (STR), Constitution (CON), Dexterity (DEX), Arcana (ARC).
- CHARACTER CREATION: Roll 3d6, drop the lowest (9 times). Assign stats to two characters.
- CLASS ASSIGNMENT: Determined by highest stat(s).
- ACTION POINTS (AP): Base 2 AP + 1 for every 3 DEX.
- DAMAGE: 3 damage is FLAT (modified by weapons).
- WEAPON REQS: Weapons have stat requirements.
- SHIELD/DODGE: 1 AP = 2.5 Armor/Shield (Decays at start of player turn).
- HEALING: Characters heal +5 HP between rounds. No heal during fights.

## 2. EQUIPMENT SLOTS
- Armor (Basic armor at start; similar across classes).
- Main Hand (Unique per Class).
- Off-Hand (Only some classes start with one).

## 3. BOSS DATA
Bosses roll 1d6 each turn.

| Boss | HP | Roll 1-2 | Roll 3-4 | Roll 5 | Roll 6 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. The Grunt** | 15 | 3 dmg to each | 3 dmg to each | 5 dmg to one | 5 dmg to one |
| **2. The Bulwark** | 25 | 5 dmg (Most HP) | 5 dmg (Most HP) | 5 dmg (Most HP) | 10 dmg (Random) |
| **3. The Hunter** | 40 | 4 dmg to each | 8 dmg (Random) | 8 dmg (Lowest HP) | 8 dmg (Lowest HP) |
| **4. The Twin-Soul**| 50 | 3 dmg to each, -1 AP | 3 dmg to each, -1 AP | 6 dmg (Random), Heal | 6 dmg (Random), -2 AP |

## 4. CLASS MATRIX

| Stat Combination | Class A | Class B |
| :--- | :--- | :--- |
| **Pure STR** | Berserker | Slayer |
| **Pure CON** | Bulwark | Warden |
| **Pure DEX** | Assassin | Ranger |
| **Pure ARC** | Sorcerer | Scholar |
| **STR + CON** | Gladiator | Vanguard |
| **DEX + CON** | Dragoon | Phalanx |
| **ARC + CON** | Templar | Bloodknight |
| **STR + DEX** | Sellsword | Duelist |
| **STR + ARC** | Paladin | Magus |
| **DEX + ARC** | Warlock | Spellblade |

## 5. PENDING
- Starting Equipment kits (one-by-one).
- Progression: Talismans + [New Simplified System].

Class,Stat Focus,Weapon,Abilities & Properties
1. Barbarian,STR,Greataxe,Normal Attack: 3 damage. Rage (2 AP): Adds +3 damage to all attacks this turn.
2. Fighter,STR,Longsword,Normal Attack: 4 damage (Flat).
3. Assassin,DEX,Daggers,Twin Strike: 1 AP. Hits twice for 2 damage each hit.
4. Rogue,DEX,Shortsword,"Normal Attack: 3 damage. Hidden Blade: If the boss didn't attack the Rogue last turn, deal +3 damage."
5. Bulwark,CON,Greatshield,Slam: 1 AP. 2 damage. Protect: 1 AP. Redirect the next attack on an ally to yourself; take half damage.
6. Warden,CON,Halberd,"Normal Attack: 3 damage. Stalwart: If you have more than 50% HP, deal +2 damage."
7. Sorcerer,ARC,Staff,Magic Bolt (1 AP): 3 damage. Great Magic Bolt (3 AP): 10 damage.
8. Scholar,ARC,Tome & Wand,Tome (1 AP): Heal 3 HP. Wand (1 AP): 3 damage.

Class,Stat Focus,Weapon,Abilities & Properties
9. Gladiator,STR + CON,Spear & Shield,"Spear: 3 damage. Momentum: Each time the Gladiator is hit, gain permanent +1 damage to all attacks for the match."
10. Vanguard,STR + CON,Greatsword,Normal Attack: 4 damage. Power Stance (2 AP): Adds +2 damage to all future attacks this match.
11. Dragoon,DEX + CON,Lance,Normal Attack: 2 damage. Counter-Thrust: Deals 2 damage to the boss every time the Dragoon is hit.
12. Monk,DEX + CON,Fists,Normal Attack: 2 damage. Find Focus (3 AP): The next attack this turn hits 5 times (Total 10 damage).
13. Duelist,STR + DEX,Rapier,"Normal Attack: 3 damage. Critical Hit: Roll a d6; on a 6, deal DEX damage instead."
14. Samurai,STR + DEX,Katana,"Normal Attack: 3 damage. Bleed: Each hit adds a stack. At 6 stacks, deal DEX damage and reset."

Class,Stat Focus,Weapon,Abilities & Properties
15. Paladin,STR + ARC,Mace,Normal Attack: 4 damage. Bless (2 AP): Next attack deals +2 damage and heals self for damage dealt.
16. Cleric,STR + ARC,Warhammer,Unholy Brand (2 AP): 5 damage; ally attacks deal +1 damage this turn. Flash Heal (2 AP): Heal 2 HP to both players.
17. Spellblade,DEX + ARC,Curved Sword,Magic Dart (1 AP): 2 damage. Echoing Blade (3 AP): 3 damage; hits once for each spell cast this turn.
18. Inquisitor,DEX + ARC,Crossbow,Normal Attack: 3 damage. Blessed Silver Bolt (2 AP): Deal ARC damage. (Only if Boss rolled 5–6 last turn; 1/turn).
19. Blood Knight,CON + ARC,Flail,"Normal Attack: 3 damage. Infuse (2 AP): Toggle state. While active, deal +2 damage but take 2 damage per swing."
20. Warlock,CON + ARC,Scythe,"Normal Attack (2 AP): 5 damage. Soul Harvest: If ally HP ≤ 5, deal ARC damage and heal lowest ally for damage dealt."