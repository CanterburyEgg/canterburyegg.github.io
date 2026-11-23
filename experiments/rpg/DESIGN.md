# Second System: Design Doc (living doc, built via /grill-me)

**Name:** *Second System*. **Type:** Syncopate for titles, Exo 2 for readable UI text, Orbitron when robots speak (Google Fonts).

The goal: a single-player, RuneScape-style RPG in the browser. You take on quests, fight farmable bosses, and level skills that unlock what you need, across a star system of weird planets that's procedurally generated fresh for every save.

## 0. Design north star (from the theme session)

What the player actually wants from this game, in priority order:
1. **Checklist**: always a list of concrete goals to tick off, while moving around the world toward a specific objective.
2. **Characters and story**: memorable, quirky NPCs and quest narratives with some real risk (Monkey Madness energy).
3. **Unlocks**: quests and levels open up new places, gear, and shortcuts.
4. **Accessible bosses**: bosses at *every* tier, not just endgame, so farming the ones you can beat is a core loop.
5. **Level-up dopamine**: skills are a means to an end (requirement gates), not an idle grind.

General rule: **simpler is better.** Combat and progression systems should stay light.

## 1. Locked decisions

| Area | Decision |
|---|---|
| **Theme** | **Grounded frontier sci-fi.** A procedurally generated star system of weird planets. Skills stay RS-grounded (mining, harvesting alien wood/fiber, fishing, cooking, forging), so familiarity is kept while the vibe comes from alien weirdness. |
| **Tone** | **Wry frontier.** Earnest adventure with RuneScape-style dry humor: quirky colonists, bureaucratic corporations, oddball aliens (Outer Wilds / Deep Rock Galactic warmth). |
| **Player premise** | **Freelance drifter**, like RS. No grand destiny: you show up, help people, take work, and get stronger. |
| **World topology** | Finite. Each save = a new star system seed. **Planets** are separate regions with **variable size**, linked by launch pads (travel points). Only one planet is loaded at a time. Difficulty and resource tier rise across planets. |
| **Planet quirks** | A data list of possible quirks (e.g., low gravity, spore fog, tidal shorelines, eternal night, magnetic storms, crystal resonance). Each planet **rolls a variable number** of them. Quirks give flavor plus light mechanical twists, and quest/boss generation can play off them. |
| **Core loop** | Quests and bosses are the heart. Skilling is the means: gather → forge/cook → gear up → quest and farm bosses. |
| **Controls / camera** | Isometric camera (right drag or Q/E rotate, wheel zoom). **WASD moves** (camera-relative). **Click to interact**: clicking a node, building or NPC auto-walks there and triggers it; WASD cancels. **Number keys 1-4 = weapon abilities.** Clicking bare ground does nothing; minimap click travels. |
| **Combat** | **Weapon-driven and small.** The equipped weapon type (melee tool, sidearm, long gun, maybe a thrown/gadget type) sets 2-3 simple abilities. Forged gear increases power. Melee / Ranged / Vitality level with use (Defense folded into armor). No classes. Details in §7. |
| **Bosses** | Every planet/tier has farmable bosses scaled to it, with telegraphed attacks (Soulslike patterns from `experiments/soulslike`). |
| **Persistence & death** | One long-lived save per seed. Death drops your carried inventory at a gravestone (corpse beacon) you can run back to. Skills and the bank are kept. |
| **Settlements** | Procedural outposts built from templates. Each planet gets 1+ with a bank (storage locker), a shop, the planet's crafting stations, and NPCs. The player always starts beside a starter outpost. |
| **Skills** | A full RS-scale list (10+), defined as data. Exact list still open. |
| **Skilling feel & pace** | Tick-based click-and-repeat (~0.6s tick, level-based success, 28-slot inventory, banking matters), **with a compressed grind**: max level ~50, fast early levels, and big XP chunks from quests and bosses. A skill level is mostly a requirement gate. |
| **Saves** | Stores the seed plus a diff, along with player, bank, and skills. Uses IndexedDB with autosave and multiple slots, plus JSON export/import. |
| **Code** | Lives in `experiments/rpg/`. Plain ES modules, Three.js via importmap. No build step, no npm. All content lives in data files. |
| **Art** | Low-poly stylized. Procedural terrain/flora with alien palettes. Characters and props come from Mixamo and/or CC0 packs (Quaternius has sci-fi and creature packs; Kenney has space/sci-fi kits). **No MOBA models are reused.** |

## 2. Open questions (need dedicated discussion)

1. **Quest generation**: how seeded quests get their checklists, characters, and risk (templated questlines, task boards, quirk-driven hooks, boss gates).
1. ~~**Quest generation**~~: resolved, see §4.
2. **Exact skill list**: gathering family resolved (§5); combat skills, Hunting and Brewing resolved (§7). Still open: Smithing and other crafting skills, and the full gather → process → consume graph.
3. **Planet quirk mechanics**: the M1 starter list exists (§6). Still open: the full catalog and deeper mechanical effects.
4. **Collection Log / per-planet logs**: post-MVP. Design it once a generated planet exists.

## 3. Milestone 1: "Walkable Seed" + first quest (no combat)

Goal: prove world gen, skilling, saves, and the quest pipeline end-to-end.

### Build phases (rough share of M1 effort)
| Phase | Scope | Share |
|---|---|---|
| **A. World & movement** ✅ built | Seeded RNG/noise, star-system generator, planet generator (landmasses, bridges, terrain, lakes, borders, biomes, outposts, camps, resource sites, props), terrain/prop rendering, quirk atmosphere visuals, click-to-move pathfinding, isometric camera, minimap, debug HUD (seed + planet switcher) | **~25%** |
| **B. Gathering** ✅ built | Node picking, tick loop, success rolls, depletion/respawn, tools, 28-slot inventory, XP/level-up UI | ~20% |
| **C. Outpost services & travel** ✅ built (permits are a stop-gap) | Storage locker UI, shop, launch pad + permit + star map, camps' lockers | ~15% |
| **D. Saves** ✅ built | IndexedDB seed + diff, autosave, slots, JSON export/import | ~10% |
| **E. NPCs & quests** ✅ built | Base bodies, Quartermaster, ambient role NPCs + quips, chatbox + live portrait + blips, quest engine, journal, "A Clean Break" | ~20% |
| **F. Character & quirk mechanics** ✅ built | Faceted human player (look saved per slot, rolled at random until the character creator), animation states (idle / jog / per-tool gathering / interact / level-up cheer), tools in hand; site discovery; Spore Fog / Magnetic Storms / Singing Crystals / Tidal Shores / Low Gravity mechanics | ~10% |

### M1 checklist
- [ ] Seeded RNG and a star-system generator: planet list (variable size, rolled quirks, tier), terrain heightmap, biomes, outpost placement, resource nodes
- [ ] Render one planet (instanced low-poly terrain, alien flora, rocks, outpost buildings, quirk-driven sky/palette)
- [ ] Click-to-move with pathfinding, plus an isometric camera (pan/zoom/rotate)
- [x] Player character model, built in the Asset Lab (`asset-lab.html`, `js/faceted_human.js`, `js/face.js`): faceted UBC male/female bodies on the 86 UAL clips; build sliders (height, weight, muscle, bust, lift, shoulders, neck, head); outfit cuts and colors; UBC hair; real eyeballs with lid blinks; expressions; split jaw with lip shapes for talking
- [x] Faceted human in game (`js/player_character.js`, `js/character_look.js`); used pack files curated into `assets/characters/` (3.5 MB, CC0) by `tools/curate_character_assets.py`
- [x] Quirk mechanics (`js/quirk_mechanics.js`, `tests/quirk_check.mjs`): Spore Fog hides undiscovered sites and shortens discovery range; Magnetic Storms every ~2.5-4 min for 30s (+10% Mining, minimap static, darker sky, lightning); Singing Crystals chime toward the nearest undiscovered site within 60m (panned audio + minimap arc); Tidal Shores raise/lower the sea on a 4 min cycle, with low-shore sites that go underwater at high tide (tidal planets always get a sea border); Low Gravity +15% speed
- [x] **Start menus + character creator**: live title screen over a daily showcase planet (Continue / New Game / Load / Settings); New Game = slot, name + creator (Body / Face / Hair / Outfit / Colors tabs, 6 presets, Randomize, turntable preview with expressions), random hidden seed, lander arrival; Settings (volume, quality, camera sensitivity, FPS); Esc pause menu; debug panel behind F3; saves v2 (name required, v1 prototype saves retired)
- [x] **Humanoid NPCs are faceted humans**: seeded looks per townsperson (full 88-112 height range), a designed Quartermaster, walk / talk / idle clips with talking mouths, built one at a time at lower detail; blob aliens and robots keep their primitive models
- [ ] **Makeover NPC** (free, reuses the creator minus body type and height): with the cities pass
- [ ] Bust/Lift sliders for body type 1 (the bust morph only fits the type 2 mesh today)
- [ ] Tick-based gathering for **Mining + Foraging**, with node depletion and respawn (see §5)
- [ ] **Quartermaster NPC** at the landing pad who hands over the tier-1 tools with a one-line joke (mini-tutorial moment)
- [ ] 28-slot inventory, storage locker UI at the outpost, compressed XP curve and level-ups
- [ ] Launch pad that loads a second generated planet
- [ ] IndexedDB save of seed + diff, autosave, reload into the identical system, JSON export/import
- [ ] **One simple Novice quest** (from a user pitch) proving the pipeline: quest template data → placement scoring → slot filling → authored ensemble spawned in-world → chatbox dialogue with live portrait + blip voice → step tracking → journal (planet-grouped, `?` until started) → reward (Reputation + XP/item) → persisted in the save

## 4. Quests & Characters (locked, quest session)

**Philosophy:** memorable characters come from **tight, authored ensembles with one strong vibe**, built for a single quest (the White Knights of Falador, the bickering goblin generals). They don't need to persist in the wider world.

| Area | Decision |
|---|---|
| **Authoring model** | Hand-written **quest templates**. Each one owns its ensemble (names, personalities, running gags, dialogue), its steps, and its climax. The seed only fills **setting slots**: which planet, which outpost, and which local resource/quirk/creature/boss gets referenced. |
| **Per-save inclusion** | **Every save contains every authored quest** (a complete checklist). The seed rearranges placement and slot fills. Authored series stay in their authored order. |
| **Structure** | No main story, RS-style. Standalone quests plus short authored series (2-4 parts). Difficulty tiers (Novice → Master) map to planet tiers. A **capstone quest** requiring many others is the soft ending. |
| **Quest shapes** | **Emergent per quest, not prescribed.** The engine supports a toolbox: existing planet areas, quest-specific areas, persistent unlocked zones, instanced areas that change with active quest state, dangerous above-tier zones, and set-piece bosses. Each template picks what it needs. |
| **Placement** | **Quests adapt to the world. The world never bends to quests.** Templates declare a tier plus soft preferences (e.g., "prefers water/tides"). A placement pass scores the best-fit planet, and slots fall back gracefully ("the local {hazard}"). |
| **Writing workflow** | **Collaborative.** User pitches a premise + ensemble vibe in 1-2 sentences → agent drafts the full template (steps, dialogue, jokes, slots, climax) as data → user punches up the voice. |
| **Dialogue** | RS-style chatbox: portrait, name, short punchy lines, click to continue, and occasional 2-4 replies that are mostly flavor/jokes, with rare meaningful branches. Text only, with synthesized per-character **blip voices**. |
| **Character visuals** | A few rigged base bodies (humanoid, robot, critter, blob alien; Quaternius/Mixamo) varied by authored color, scale, and accessories. The chatbox portrait is a **live render-to-texture close-up** of the in-world model. |
| **Discovery & journal** | RS-style journal **grouped by planet**. A planet's section unlocks when you first visit it. Quests appear as **`?`** until you start them, so you find them by exploring. Started quests show RS-style step text. |
| **Ambient NPCs** | Generated role NPCs (banker, shopkeeper, locals) with generated names/looks and **authored quip pools per role**, including planet-quirk-aware lines. Kept clearly separate from authored quest casts. |
| **Rewards** | Varies per quest: **Reputation** (the Quest Points equivalent, gating the capstone and some later quests), XP chunks, currency, items. **Some** quests (not all) give a signature unlock: unique gear, a recipe, a shortcut/teleport, a new area, or a re-fightable boss. |

## 5. Gathering Skills (locked, M1 skill session)

| Area | Decision |
|---|---|
| **Gathering family** | **Mining** (rocks/ore), **Foraging** (everything that grows: alien trees, fungus, fiber reeds), **Hunting** (creatures; arrives after combat exists). Fishing is maybe later, not now. M1 builds Mining + Foraging. |
| **XP curve** | RS-shaped exponential compressed to max level 50: each level costs ~10% more than the last (`data/skills.js`: base 40, growth 1.10 → L10 ≈ 540 XP, L25 ≈ 3.5k, L50 ≈ 42k). Quests and bosses give big lumps. |
| **Gathering roll** | RS-classic. One attempt every 4 ticks (2.4s). Success chance = base + (level − node level) + tool tier, clamped. 1 item per success. Rocks deplete after 1-3 successes; flora depletes by random chance. Respawn 10-60s by tier. |
| **Tools** | Required. RuneScape material logic: `<Metal> <Tool>` (**Bismuth / Cobalt / Tungsten** at levels 1/10/20; Iridium and Osmium reserved for later tiers; deliberately avoids the bronze/iron/steel cliche), so better metal means a better tool and a higher success chance. Each node declares its tool type: **Pick** (mining), plus **Hatchet** (trees), **Sickle** (reeds, vines) and **Gloves** (fungi, stinging plants) for foraging. Sold at shops now, forged from mined metals later. |
| **Starting tools** | A **Quartermaster NPC** at the landing pad hands over a Bismuth Pick, Hatchet and Sickle (gloves come later with T2 fungi) with a one-line joke. Cheap replacements at the starter shop. |
| **Resources (M1)** | 3 tiers (levels 1/10/20), 2 draft variants per tier per skill in `data/resources.js`, named with real words plus plain adjectives (Bismuth Ore, Humming Basalt, Coil Vine). Planets roll 1-2 variants per tier. The starter planet always has T1 + some T2; planet 2 adds T3. |

## 6. World Generation (locked, world session)

| Area | Decision |
|---|---|
| **System size** | 6-8 planets per system. Tiers rise roughly every 2 planets. |
| **Planet size** | Sized by **tip-to-tip walking time** at 4.4 m/s (+20% for routing): Small ~2 min (~400-500m), Medium ~5 min (~1-1.2km), Large ~8 min (~1.6-1.9km). The starter planet is always Small or Medium. Grid cells are 2m. Medium/Large planets also get a far camp on the main landmass. |
| **Landmasses** | A planet can have **multiple landmasses**, each an irregular shape ringed by a natural border (sea, chasm, cliffs, lava, toxic marsh) that fades into fog/sky. The border type can come from quirks. |
| **Crossings** | Mixed. Some landmasses connect freely (land or built bridges). Others are gated by a skill or quest (repair a rope bridge with Foraging materials, a level-gated jump, a quest-granted ferry or grapple). Outlying landmasses hold higher-tier sites and quest spots. |
| **Terrain** | Readable rolling terrain: walkable hills and plateaus, plus impassable cliffs, boulders, deep water and chasms that form routes and chokepoints. Rivers and lakes where the planet allows. No caves in M1 (they become quest zones later). |
| **Resource layout** | **Clustered, named sites** (a quarry of 4-8 rocks, a grove, a reed marsh), placed by biome and terrain fit. Higher tiers sit farther from settlements. A few lone nodes for flavor. Discovered sites are labeled on the map. |
| **Quirks** | ~8 starter quirks in `data/quirks.js` (Spore Fog, Low Gravity, Tidal Shores, Endless Dusk, Twin Moons, Magnetic Storms, Ash Fall, Singing Crystals). Mostly atmospheric (sky, fog, particles, border). **M1 gameplay modifiers:** Low Gravity (+15% walk speed), Tidal Shores (shoreline sites reachable only at low tide), Spore Fog (shorter view distance, faster Foraging respawn), Magnetic Storms (periodic ~30s storms: +Mining success, static minimap), Singing Crystals (audio compass toward undiscovered sites). Endless Dusk, Twin Moons and Ash Fall are visual for now; their ideas are **generation modifiers** for the later quirk session. Each planet rolls 0-3; the starter planet gets at most 1 gentle one. A full mechanical catalog comes in a later session. |
| **Travel** | ⚠️ **STOP-GAP, final design open.** Launch pads at settlements. Each destination needs a **Launch Permit**: cheap (credits) or from easy quests early, Reputation or quest-gated later. A star map previews each planet's tier and quirk hints before you visit. In M1, planet 2's permit is a small credit cost. |
| **Settlements** | Three sizes. **Camp**: bank + pad, on outlying landmasses. **Outpost**: Lumbridge-like compact basics plus accent pieces, ~30-40m. **City**: Varrock/Falador-like, ~80-120m, with streets, a market square with several shops, multiple crafting stations, many ambient NPCs, and dense quests. Systems roll 1-2 Cities on Medium/Large planets in tier 2+. The starter planet always has an Outpost. **M1 builds Outpost + Camp; City generation comes later.** |
| **Defaults I'll pick and show in the build** | Camera controls (pan/zoom/rotate), minimap, day/night (off unless a quirk sets it), pathfinding grid resolution, render budget. |

## 7. Milestone 2: Combat (locked, combat session Nov 21)

Goal: fights that feel good without RuneScape's whiffing, plus the first gather → process → consume loop (Hunting + Brewing feed healing).

### Locked decisions
| Area | Decision |
|---|---|
| **Feel** | RS3-lite. Click an enemy to **auto-attack** on the game tick; **auto-attacks always hit** (no whiffs). Keys **1-4 fire weapon abilities** with cooldowns, and abilities are **skillshots**: hold the key to preview a line / cone / circle on the ground at the mouse, release to fire. Big damage if it lands, nothing if it misses. WASD still moves, so you can kite and dodge. |
| **Enemy telegraphs** | Creatures' big attacks flash a ground telegraph (circle / cone / line) first; step out with WASD. Normal hits just land. |
| **Danger** | **Settlements are safe**; everything outside can attack. Danger scales with **planet tier**. Each creature family has a **temperament**: skittish (flees, may rally), territorial (attacks if you get close or hit it), aggressive (hunts on sight). Most are territorial. |
| **Death** | Wake at the last settlement you visited. Your pack drops as a **salvage crate** where you fell (tools and equipped gear always kept). **No timer**, but if you die again before recovering it, the old crate is gone. |
| **Damage model** | Simple: auto-attacks deal weapon damage plus a small level bonus, always landing. Ability damage scales the same way. Armor reduces damage taken. No accuracy rolls. |
| **Weapons** | Abilities come from the **weapon item** (better weapons have different abilities); levels only raise numbers. **Melee:** frontier tools named `<Metal> <Weapon>`, 2 per tier (Bismuth / Cobalt / Tungsten) = 6. **Ranged:** the gun is standard issue (**Revolver**: fast, short range; **Rifle**: slow, long range, piercing); **ammo carries the tier** (`<Metal> Rounds`) and sets damage. Scattergun later. A future third style, **energy**, loads **catalysts** into the same guns. |
| **Equipment** | Weapon slot + armor in **head / body / legs**, visible on the character. Bought from shops in M2; **Smithing** (forge your own gear, craft ammo and catalysts) comes with the crafting milestone. |
| **Ammo** | Shops sell all three ammo tiers in M2. Crafting ammo arrives with Smithing. |
| **Healing** | Brewed consumables: **Brewing** combines foraged plants and creature parts at a camp stove or outpost kettle into stews, tinctures and draughts (heal over time, instant heal, short buffs). Slow regen out of combat. |
| **Skills added** | **Melee, Ranged, Vitality** (max health; Defense is folded into armor stats), **Hunting**, **Brewing**. |
| **Hunting** | Its own gathering skill: **tracking and trapping** (snares, bait) for critters and rarer parts. Separate from combat kills. |
| **Kill drops** | XP, creature parts by species (hide, chitin, glands...), and a small variable loot drop by enemy. No big RS loot tables yet. |
| **Scope** | 2 weapon styles (melee + ranged), **5 creature families** with tier variants (Skarl added for the quest), Hunting, Brewing, **one combat quest** (user pitch below) with **one quest mini-boss**. |

### Drafts (mine, veto freely)
- **Melee roster**: Bismuth Machete (Lunge: short dash line; Sweep: wide cone) and Bismuth Maul (Slam: circle ahead; Shove: cone knockback). Cobalt Machete (adds Flurry: three quick cuts) and Cobalt Spear (Thrust: long line; Vault: leap to a point; Pin: slowing line). Tungsten Cleaver (Whirl: circle around you; Rend: bleed cone; Lunge) and Tungsten Maul (Slam; Quake: big slow circle; Shove).
- **Ranged abilities**: Revolver: Quickdraw (instant line, high damage), Fan the Hammer (cone of three shots), Dive (short dodge roll). Rifle: Piercing Shot (long line through every enemy in it), Steady Aim (charge for a heavy shot), Flare (circle that slows and reveals).
- **Creature families** (primitive models, lineup page like the aliens; **names chosen by the user**, invented words that sound like animals): **Gallox**: skittish herd grazers, the biggest one charges (line telegraph) if the herd is attacked. **Vorm**: territorial burrowing ambusher, erupts when you step close (circle telegraph) and spits. **Dart Fly**: aggressive flying pests in groups of 3-5, low health, dive attacks (line telegraph). **Grondak**: territorial armored brute, slow ground slam (big circle telegraph), weak spot behind. **Skarl** (added for the combat quest): wolf-like pack predators, aggressive, hunt in packs and circle before lunging (short line telegraph); a pack has a leader. Tier variants by size, color and a biome name ("Ridge Gallox").
- **Health**: ~50 + 10 per Vitality level. Tick-based auto-attacks (machete 3 ticks, maul 5, revolver 3, rifle 5).
- **Hunting loop**: critter burrows and trails appear as nodes; set a snare (bought, later crafted), optionally baited with foraged plants; come back later to collect parts. Tracking (follow prints to a rare critter) is a stretch goal.

### Combat quest (user pitch, Nov 21): working title "The Skarl Mother"
- **Act 1, the cull.** A pack of **Skarl** has been killing the outpost's livestock. You're sent to their territory to kill **X** of them, then report back and show **X Skarl Pelts** (you keep them; it's bragging, not a turn-in). The town thanks you, and everyone turns in for the night (a sleep fade to the next morning).
- **Act 2, the den.** Next morning, more livestock are dead, and brutally. Something bigger is behind it. You follow a **trail of clues** (torn fencing, tracks, blood, a dropped tuft) to the Skarl den: a **cave that only opens while you're on this quest** (a quest-specific area, §4 toolbox). Inside are many Skarl and the **Skarl Mother**, who did the night's killing.
- **The Mother (quest mini-boss).** Telegraphed attacks, a second phase, and she calls pups and packmates for help.
- **Reward.** Slay her and claim her **quest trophy**, then bring it to town to finish the quest. The trophy can later be **crafted into a low/mid-level armor piece or weapon** (details later, once Smithing exists). Plus Reputation and XP.
- **World needs:** small **livestock pens** at outposts (a few grazing critters), so the attacks and the gored animals the next morning show up in the world. The cave den is the first interior/instanced area.
- **Still open (mine to draft, user approves):** the authored ensemble (quest giver and townsfolk with one strong vibe), X, clue placement, the Mother's moveset, the trophy's name.

### M2 build phases
| Phase | Scope |
|---|---|
| **A. Combat core** 🔨 built, needs a browser playtest (`js/combat.js`, `js/creatures.js`, `js/creature_models.js`, `data/equipment.js`, `data/creatures.js`, `tests/combat_check.mjs`; Skarl stand in as the only family until Phase C; the Quartermaster's kit now includes a Bismuth Machete) | Health and Vitality, targeting, tick auto-attacks, hitsplats, death and salvage crate, equipment slots + armor (visible), shop stock |
| **B. Weapons and abilities** | Skillshot aiming previews, cooldowns on the hotbar, the 6 melee weapons + Revolver and Rifle, ammo, Melee and Ranged skills |
| **C. Creatures** | 4 families from primitives (lineup page), temperament AI, telegraphs, spawns by planet tier away from settlements, respawns, drops |
| **D. Hunting** | Critter nodes, snares and bait, parts |
| **E. Brewing** | Stations, recipes, consumables (heal and buff), eating/drinking from the inventory |
| **F. Combat quest + tuning** | "The Skarl Mother": livestock pens, Skarl family + Skarl Mother mini-boss, quest den cave, sleep transition, clue trail; numbers pass |

## 8. Backlog

| Item | Notes |
|---|---|
| **World edges are hard to read** (first pass done: coastline outline per border type, depth-darkened drops) | The border (sea, chasm, lava, marsh, cliffs) doesn't clearly say "the land ends here." Ideas: shoreline foam/lip, cliff wall meshes on sheer borders, edge fog falloff, a subtle edge fade. |
| **Bridges feel massive on big maps** (first pass done: coast-to-coast, 4.4m decks with rails and piers, closer landmasses, natural land bridges) | Bridges are carved center to center, so on Large planets they can span 100m+. Ideas: connect the nearest coast points instead, cap length, narrow them, real bridge meshes (planks, rails, posts), occasional natural land bridges instead. |
| **Asset audit (Nov 19)** | Packs on disk (gitignored): Ultimate Space Kit (92 models, one shared 5KB palette atlas, flat low-poly, includes outpost modules, alien trees/rocks, rovers, ships, planets, 12 animated characters/enemies), Stylized Nature MegaKit (68) + Ultimate Stylized Nature (36) (painted bark textures up to ~20MB each, alpha-card leaves, 750-10k tris per tree), Universal Base Characters (free tier = 2 bodies, no animations), Animated Mech Pack (4 mechs, 18-20 anims). Asset Lab: `experiments/rpg/asset-lab.html`. Idea under test: our faceted primitive characters riding the Space Kit astronaut skeleton (43 bones, 18 anims). |
| **Art direction pass** | Everything is greybox (primitives, flat vertex colors, placeholder capsule player). Needs its own session: palette rules, asset packs (Quaternius/Kenney), terrain texturing, water, lighting/post, UI style. |
| **Building interaction point** | Auto-walk goes to the nearest open cell, not the door side. |
| **Map overhaul** | Fog of war (reveal as you explore; ties into quest `?` discovery and Singing Crystals), map icons (sites by skill/tier, settlements, launch pads, quest markers), a full-screen map view (M key) with zoom/pan, minimap zoom on Large planets. |
| **World feels sparse (quick wins)** ✅ first pass done (denser sites + settlement rings, clustered forests/rock fields/clearings, dirt trails) | Raise site density (especially within ~2 min of settlements; current sqrt scaling gives ~1 site per 20,000 m² on Large planets), cluster decor into forests/rock fields/clearings instead of even scatter, add worn dirt trails linking outpost, camps and bridges. |
| **Landmarks (design session)** | A catalog of points of interest (ruins, wrecks, lone huts, monoliths, abandoned camps) placed per planet; hooks for quests, lore, and the future collection log. |
| **Ambient wildlife (design session)** | Harmless critters and fauna per biome/planet for life and motion; later become Hunting targets and combat creatures. |
| **Player animation audit** ✅ first pass (Nov 23): `tests/_anim_lab.html` (any clip on the real character, full library toggle) + grip solver in `tests/_tool_grip.html`. Fixed: one-shot swings flashing the bind pose when re-triggered; machete/cleaver/maul/spear now use a solved blade grip (handle across the fist, blade out the thumb side); auto-attacks alternate per weapon (Sword_Regular_A/B, Sword_Heavy_Combo for mauls, Sword_Attack thrust for spears, jab/cross unarmed) and only speed up to fit the attack interval; interact is a reach-and-open (Chest_Open) instead of kneel-and-point; waking up after death plays LayToIdle; armor reads as metal (darker tints, greaves as shin guards). Still to check: run start/stop blends, foot sliding at speed, the sickle and gloves poses. Original note: Go clip by clip through every state: idle, sprint and stop, each gathering tool, interact, cheer, talk, combat stance, each weapon's swing, hit, death and getting up, plus transitions between them (blend times, foot sliding, one-shots cutting off loops, the tool/weapon grip in each). Check against the full 86-clip UAL library for better fits, tune timeScales to the game tick, and capture before/after GIFs. |
| **Character props** | Bone-attached props for faceted humans (the old primitive NPCs had them; the new bodies don't yet): caps and hats on the Head bone, scarves on the neck, aprons and tool belts on the spine, clipboards and lanterns in a hand (reuse the tool grip system in `player_character.js`). Bring back the Quartermaster's cap and clipboard, let townsfolk roll one, and later make them player-equippable cosmetics. |
| **Bulk alien species** ✅ first set **locked as-is** (user, Nov 20); add many more species over time rather than reworking these. First pass done (Dollop, Strider, Glimmer, Skitter, Facet, Morel, Murmur in `data/aliens.js` + `js/alien_models.js`; 2-3 species per planet; preview at `tests/_alien_lineup.html`). Was: every alien was the same blob with two eye stalks. Build a family of procedural alien body plans from primitives (the style the user loves): e.g. tall stilt walkers, floating jellies, many-legged crawlers, crystal-shelled folk, tiny swarms riding a shared suit, plus per-species palettes, eye/limb/antenna counts and idle motions. Each species gets name rules and a voice range; settlements roll a few species per planet so towns feel distinct. |
| **City generation** | Designed in §6 (Settlements) but not built: Varrock/Falador-sized cities (~80-120m) with streets, a market square with several shops, multiple crafting stations, dense ambient NPCs and quests. Systems roll 1-2 on Medium/Large planets in tier 2+. Unlocks the makeover NPC, more shops, and crafting stations once crafting skills exist. Wants its own layout pass (street grid vs organic, districts, walls/gates) and pairs with alien species and props. |
| **Number tuning** | Needs real playtesting: gather rhythm (2.4s), success odds (38% at L1), XP curve/yields, respawn timers, site density, pop-up noise, quest XP rewards vs. grind XP. |
