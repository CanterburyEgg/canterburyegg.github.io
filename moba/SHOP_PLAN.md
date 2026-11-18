# Shop overhaul: item tree (working doc)

Structure (DESIGN_RULES §2): 7 components → 28 tier-2 items (21 mixed pairs + 7 doubles) → **two epics per tier-2 item** (56 epics), plus a separate boots line. You draft the passives; we go pair by pair and I record decisions here. Numbers come last.

**Status 2026-11-18: design, numbers and names all locked.** Next: implementation.

## Components (tier 1)
HP · Mana · Attack · Ability · Resist · Attack speed · Haste

## Doubles (X+X), with their innate specialty stat

| Tier 2 | Specialty | Epic A | Epic B |
|---|---|---|---|
| HP + HP | HP regen | **Warmog's-style:** out of combat (no damage taken for a few seconds), regenerate a large % of max HP per second | **Knight's-Vow-style (draft):** a share (~15%?) of the damage nearby allied heroes take is redirected to you instead. Open: all allies in range vs. one bonded ally; overlaps the Bodyguard's protector role |
| Mana + Mana | Mana regen | **Mana engine (Seraph's / RoA-style):** bonus HP and bonus Ability scaling with your bonus Mana | **Mana shield:** dropping below 50% HP triggers a shield equal to X% of your current Mana (~45s cooldown) |
| Attack + Attack | Lifesteal | **Overheal shield:** lifesteal healing past max HP becomes a shield (sustain / bruiser path; Brawler, Panther, late Coyote) | **Attack penetration:** ignore X% of the target's Resist on Attack damage (damage path; the shop's only Attack pen; Coyote / Imp vs tanks, Panther burst) |
| Ability + Ability | Spell Vamp | **Ability penetration:** ignore X% of the target's Resist on Ability damage (the shop's only Ability pen) | **Amplifier (Rabadon's-style):** +X% total Ability (multiplies everything else you've built; the late-game Ability capstone) |
| Resist + Resist | Penetration resistance (enemy Attack/Ability pen is X% less effective on you; replaced Tenacity, which moved to the Resist boots) | **Attack ward:** take X% less Attack damage (~25%, tune) — counters Coyote / Brawler / Imp / auto-attackers | **Ability ward:** take X% less Ability damage (~25%, tune) — counters Sorceress / Scientist saw / burst casters |
| Attack speed + Attack speed | On-hit damage | **Ricochet:** basic attacks bounce up to 3 times after hitting their target, for reduced damage per bounce; no target is hit more than twice by one attack. Open: how melee basics bounce (a short arc to the nearest enemy?) | **Frenzy:** land 3 basic attacks on the same target within a short window → a short burst of move speed + attack speed (moderate cooldown) |
| Haste + Haste | Ultimate Haste | **Reset (assassin):** landing a hero kill reduces your current cooldowns by 30%. Open: kills only, or takedowns (assists) too | **Ult follow-up (team fight):** for ~6s after casting R, gain a burst of Haste so your basic abilities cycle fast during the fight |

Notes from the locked spec: Attack+Attack branches e.g. overheal → shield / Attack penetration; Ability+Ability: Ability penetration / TBD. Heal & Shield power lives on one or two support epics.

## Mixed pairs (X+Y)

| Tier 2 | Epic A | Epic B |
|---|---|---|
| HP + Mana | **Lifeblood:** below an HP threshold, gain a burst of HP regen that drains mana while it runs (stops when mana runs low). Note: close in purpose to Mana shield (Mana + Mana) — an instant shield vs. regen over time (set Lifeblood's threshold lower, ~35%) | **Wellspring (support; the spec's Heal & Shield power):** your heals and shields on allies are X% stronger, and each one restores a little mana |
| HP + Attack | **Cleaver:** basic attacks cleave in a small area around the target; the first basic attack every 10s deals bonus damage | **Weakness:** your Attack damage applies Weakness stacks (max 5); each stack makes the target take 5% more Attack damage; stacks decay out of combat. Open: 5% per stack (25% at max) or 5% total; only from you, or from every attacker |
| HP + Ability | **Frost-touched (Rylai's-style):** your Ability damage slows the target briefly (weaker on area hits?) | **Immolate (Sunfire-style aura):** enemies near you take a burn every second scaling with your bonus HP (damage over time: doesn't wake sleepers) |
| HP + Resist | **Adaptive guard:** taking both Attack and Ability damage within a short window grants a big shield and a decaying burst of bonus Resist (cooldown) | **Wither:** each time an enemy hits you with an ability, they get a stack that lowers their Attack and Ability by 5%. Open: max stacks, duration |
| HP + Attack speed | **Bulwark breaker (tank buster; the spec's %-max-HP item):** basic attacks deal bonus damage equal to X% of the target's max HP | **Last stand:** below 40% HP, gain bonus attack speed and a little healing on each basic attack |
| HP + Haste | **Exposed:** when you crowd-control an enemy, they take 10% more damage (from everyone) for a few seconds | **Battle rhythm:** each time an enemy hero damages you, your non-ultimate cooldowns drop by ~0.5s. Open: direct hits only (not damage over time / saw ticks) and a short internal cooldown so rapid hits can't zero your cooldowns |
| Mana + Attack | **Mana-forged (Muramana-style):** basic attacks spend mana for bonus damage. No toggle: only on hits against heroes, and it stops below ~25% mana | **Essence (Essence Reaver-style):** each basic attack on a hero restores a little mana and takes ~0.3s off your basic ability cooldowns |
| Mana + Ability | **Overcharge:** your abilities cost ~25% more mana but deal bonus damage based on the extra mana spent | **Soul harvest:** any enemy (minions and monsters too) that dies to your Ability damage refunds some mana. Open: smaller refund for minions / a per-second cap so wave-clearing ults don't refill the bar |
| Mana + Resist | **Ward aura:** nearby allies gain bonus Resist | **Barbed ward:** enemies who hit you are afflicted with anti-heal (reduced healing) for a few seconds |
| Mana + Attack speed | **Wounding strikes:** basic attacks apply anti-heal (reduced healing) for a few seconds | **Mana tap:** basic attacks on any target restore a little mana (lane sustain; Essence is heroes-only + cooldowns) |
| Mana + Haste | **Momentum:** each ability you cast lowers your mana costs by a stacking X% (max N stacks); the stacks fall off if you stop casting for a few seconds | **Flow state:** while above 50% mana, gain bonus Haste (rewards pacing; the opposite of Momentum's spam) |
| Attack + Ability | **Equilibrium (locked):** your hits deal bonus damage scaling with whichever of Attack / Ability is *lower* (rewards building balanced) | **Crossover:** once every 5s, your first hit of your *weaker* damage type is calculated with your *stronger* stat instead (e.g. an Attack-built Panther's pounce scales with Attack). Rewards specializing without leaving half the kit dead. Implementation: swap the stat in that hit's ratio |
| Attack + Resist | **Frostbite plate:** enemies who hit you have their attack speed and move speed lowered for a short time. Open: basic attacks only (anti-carry) or any hit | **Grudge:** each hit on the same enemy hero gives you stacking bonus Attack (resets when you switch targets) — a 1v1 dueling item. (Distinct from Weakness: this buffs you, Weakness debuffs the target for the team) |
| Attack + Attack speed | **Longshot:** +X% basic attack range. Open: ranged only, or a smaller bonus for melee | **Wind-up (Guinsoo's-style):** each basic attack gives stacking attack speed for the rest of the fight; stacks fall off out of combat (gradual ramp, vs Frenzy's short burst) |
| Attack + Haste | **Tempered spells:** your abilities deal bonus damage equal to X% of your Attack (once per cast) — keeps Attack heroes' spells relevant late | **Ambush:** your first hit after being unseen deals big bonus damage (uses the vision system: fog, R stealth, flanks) |
| Ability + Resist | **Spell shield (Banshee's-style):** blocks the next enemy ability that would hit you; recharges after ~40s without being broken. Note: it blocks the ability's CC too | **Bulwark casting:** each ability you cast gives a short burst of bonus Resist; bursts stack up to a cap and each wears off on its own timer (staggered) — for caster tanks |
| Ability + Attack speed | **Hexed strikes (Nashor's-style):** basic attacks deal bonus Ability damage | **Static charge:** basic attacks build charge; at full charge the next one releases a chain of Ability damage jumping to up to 4 nearby enemies |
| Ability + Haste | **Spell cadence:** hitting the same target with 3 *different* abilities in a short window deals bonus damage (3 separate abilities, not 3 hits, so multi-bolt / ticking spells don't trigger it alone) | **Accumulation:** every 5 abilities that hit an enemy permanently grant +X Ability. Open: count casts that hit (one per cast, so the saw's ticks / multi-bolts don't farm it); do minions count; a cap or not |
| Resist + Attack speed | **Retort:** damage your Resist prevents is stored and added to your next basic attack (a proactive Thornmail). Open: storage cap; it decays if you don't attack | **Siphon plating:** basic attacks on a target lower its Resist and raise yours, stacking up to a cap (a shred; watch stacking with Attack pen + Weakness in the numbers pass) |
| Resist + Haste | **Steadfast aura:** nearby allies gain Tenacity (shorter crowd control) | **Shrug off:** when you're crowd-controlled, your basic ability cooldowns drop by ~2s (being CC'd becomes tempo) |
| Attack speed + Haste | **Snap-back:** casting an ability resets your basic attack timer (an instant auto after each spell) | **Battle tempo:** casting an ability gives a few seconds of bonus attack speed |

## Boots (decided 2026-11-17: pure stats, no passives)
Basic Boots (+Move speed) → one tier-2 boot (more Move speed + a flavor). One pair max.

| Boot | Stats |
|---|---|
| Boots | Move speed |
| Plated boots | Move speed + Resist + **Tenacity** (the main tenacity source; Mercury's-Treads style) |
| Swift-strike boots | Move speed + Attack speed |
| Mindful boots | Move speed + Haste |
| Swiftness boots | Move speed + extra Move speed |

## Numbers pass

### Stage 1: foundations (locked 2026-11-17)
- **Slots:** 4 (boots + 3 epics at full build). Economy assumption: ~2,500 gold at Lv6, ~9,000 at Lv12 (gold itself isn't tuned yet; revisit in the pace pass).
- **Cost ladder:** component 350 · tier 2 = 2 components + 250 = **950** · epic = tier 2 + both components + 950 = **2,600** · basic boots 300 · tier-2 boots = boots + 600 = **900**. Full build ≈ 8,700.
- **Component stats (350 each):** HP +180 · Mana +200 · Attack +15 · Ability +25 · Resist +12 · Attack speed +12% · Haste +12. (HP is the better buy early, Resist late: +180 HP ≈ 13% EHP at Lv1 vs 7% at Lv12; +12 Resist ≈ 10% vs 8%.)
- **Build paths (changed 2026-11-18):** epic = tier 2 + **both** of its components + 950 = 2,600 (e.g. Splitting Maul + Garnet Brooch + Hatchet + 950). Both epics of a line share the recipe, since their stats are identical.
- **Mixed tier 2:** both components' stats +15%.
- **Double tier 2:** both components' stats + the specialty stat (instead of the 15%).
- **Epic:** 2× the tier-2 item's base stats (~1,400 gold of stats); the passive carries the remaining ~1,200 of value.
- Sanity check: 3 Attack epics at Lv12 ≈ +120 Attack on a ~200 base, ≈ +60% basic attack damage before attack speed and passives (matches the ~40% item share).
- **Uniqueness:** every tier-2 item is unique (one copy), and you can own only **one epic per line** (e.g. not both Attack+AS epics). Epics are unique by extension.

### Stage 2: doubles + boots (locked 2026-11-17)
Doubles (950) = both components' stats + specialty. In the double's epics the specialty is 1.5× (other stats 2× per Stage 1).

| Double | Stats | Specialty (tier 2 → epic) |
|---|---|---|
| HP+HP | +360 HP | HP regen +8/s → +12/s |
| Mana+Mana | +400 Mana | Mana regen +4/s → +6/s |
| Attack+Attack | +30 Attack | Lifesteal 10% → 15% |
| Ability+Ability | +50 Ability | Spell Vamp 8% → 12% (area hits 1/3) |
| Resist+Resist | +24 Resist | Penetration resistance 30% → 45% |
| AS+AS | +24% AS | On-hit +15 → +22 Attack damage (flat) |
| Haste+Haste | +24 Haste | Ultimate Haste +25 → +40 |

| Boot | Cost | Stats |
|---|---|---|
| Boots | 300 | +8% Move speed |
| Plated | 900 | +12% MS, +18 Resist, 25% Tenacity |
| Swift-strike | 900 | +12% MS, +25% Attack speed |
| Mindful | 900 | +12% MS, +15 Haste |
| Swiftness | 900 | +20% MS |

Tenacity stacks multiplicatively (25% + 25% ≈ 44%).

### Stage 3: passives

**Mixed-pair stat lines** (tier 2 = component stats ×1.15; epic = 2× tier 2). Each mixed item has both of its stats at these values:

| Stat | Mixed tier 2 | Mixed epic |
|---|---|---|
| HP | +210 | +420 |
| Mana | +230 | +460 |
| Attack | +17 | +35 |
| Ability | +30 | +60 |
| Resist | +14 | +28 |
| Attack speed | +14% | +28% |
| Haste | +14 | +28 |

**Batch 1: double epics (locked 2026-11-17)**

| Epic | Passive |
|---|---|
| HP+HP A: Warmog's | After 6 s without taking damage, regen 3% max HP/s |
| HP+HP B: Redirect | 12% of damage taken by allied heroes within 5 m is redirected to you |
| Mana+Mana A: Mana engine | +Ability = 5% of bonus Mana; +HP = 25% of bonus Mana |
| Mana+Mana B: Mana shield | Below 50% HP: shield 150 + 25% current Mana for 3 s; 45 s cooldown |
| Attack+Attack A: Overheal | Lifesteal past full HP → shield, cap 60 + 12% max HP; drains after 5 s out of combat |
| Attack+Attack B: Attack pen | Ignore 30% of target Resist on Attack damage |
| Ability+Ability A: Ability pen | Ignore 30% of target Resist on Ability damage |
| Ability+Ability B: Amplifier | +25% total Ability |
| Resist+Resist A: Attack ward | Take 20% less Attack damage |
| Resist+Resist B: Ability ward | Take 20% less Ability damage |
| AS+AS A: Ricochet | Up to 3 bounces within 4 m, 40% damage each (incl. on-hit damage, no on-hit effects); max 2 hits per target per attack; melee bounces the same (spark arc) |
| AS+AS B: Frenzy | 3 basics on one target within 3 s → +40% AS, +20% MS for 3 s; 8 s cooldown |
| Haste+Haste A: Reset | Hero kill: current cooldowns −30%; assist: −15% |
| Haste+Haste B: Ult follow-up | +60 Haste for 6 s after casting R |

**Shared conventions:** anti-heal is always 40% for 3 s and doesn't stack between sources (refreshes). "Hard CC" = stun, knock-up, sleep, root, silence, fear, taunt (not slows). Ability bonus damage is "once per target per cast" unless noted, so multi-bolt / ticking spells don't multiply it. Flat Resist shred applies before % penetration. Auras include yourself.

**Batch 2: HP pairs (locked 2026-11-17)**

| Epic | Passive |
|---|---|
| HP+Mana A: Lifeblood | Below 35% HP: regen 3% max HP/s costing 30 Mana/s, up to 5 s, stops below 10% Mana; 30 s cooldown |
| HP+Mana B: Wellspring | Heals and shields on allies +15%; each restores 15 Mana (max once per 1 s) |
| HP+Attack A: Cleaver | Basics splash 40% damage within 2 m of the target; every 10 s the next basic deals +3% of your max HP |
| HP+Attack B: Weakness | Attack damage applies a stack (max 5); each = +4% Attack damage taken from everyone; 4 s, refresh, decay one at a time |
| HP+Ability A: Frost-touched | Ability damage slows 25% for 1.5 s (area hits 15%) |
| HP+Ability B: Immolate | Enemies within 3 m take 15 + 1.5% bonus HP per second (DoT) |
| HP+Resist A: Adaptive guard | Attack + Ability damage within 3 s → shield 100 + 8% max HP and +30 Resist fading over 4 s; 25 s cooldown |
| HP+Resist B: Wither | Each enemy ability that hits you gives its caster a stack (max 3): −5% Attack and Ability each; 4 s |
| HP+AS A: Bulwark breaker | Basics deal +2.5% of target max HP (max 60 vs minions/monsters) |
| HP+AS B: Last stand | Below 40% HP: +35% AS, basics heal 2% max HP |
| HP+Haste A: Exposed | Hard CC on an enemy → takes 10% more damage from everyone for 3 s (refresh, no stack) |
| HP+Haste B: Battle rhythm | Each direct hit from an enemy hero: non-ult cooldowns −0.5 s (max once per 1 s; no DoT / saw ticks) |

**Batch 3: Mana pairs (locked 2026-11-17)**

| Epic | Passive |
|---|---|
| Mana+Attack A: Mana-forged | Basics on heroes spend 25 Mana for +20 + 4% max Mana bonus Attack damage; off below 25% Mana |
| Mana+Attack B: Essence | Basics on heroes restore 12 Mana and take 0.3 s off basic ability cooldowns |
| Mana+Ability A: Overcharge | Abilities cost 25% more; deal bonus Ability damage = 3× the extra Mana spent (once per target per cast) |
| Mana+Ability B: Soul harvest | Enemy dies to your Ability damage → refund 8% max Mana (hero), 3% (monster), 1% (minion); minion + monster refunds capped at 5% max Mana per 3 s |
| Mana+Resist A: Ward aura | Allies within 6 m gain +15 Resist |
| Mana+Resist B: Barbed ward | Enemies who directly hit you get anti-heal |
| Mana+AS A: Wounding strikes | Basics apply anti-heal |
| Mana+AS B: Mana tap | Basics restore 6 Mana (10 vs heroes) |
| Mana+Haste A: Momentum | Each cast: −6% Mana costs, max 5 stacks (−30%); all drop after 4 s without casting |
| Mana+Haste B: Flow state | Above 50% Mana: +20 Haste |

**Batch 4: Attack pairs (locked 2026-11-17)**

| Epic | Passive |
|---|---|
| Attack+Ability A: Equilibrium | Hits deal bonus damage = 25% of your lower stat (Attack or Ability); abilities once per target per cast |
| Attack+Ability B: Crossover | Once every 5 s, your first hit of your weaker type uses your stronger stat in its ratio |
| Attack+Resist A: Frostbite plate | Enemies who hit you (any direct hit): −20% AS, −10% MS for 2 s |
| Attack+Resist B: Grudge | Each hit on the same hero: +4% Attack, max 6 (+24%); resets on switching target or 4 s without hitting |
| Attack+AS A: Longshot | Ranged: +15% basic attack range. Melee: +15% AS instead |
| Attack+AS B: Wind-up | Each basic: +6% AS, max 6 (+36%); lost after 3 s out of combat |
| Attack+Haste A: Tempered spells | Each cast's first enemy hit deals +40% of your Attack as bonus damage |
| Attack+Haste B: Ambush | First hit while unseen (fog, stealth, flanks), or within 1.2 s of being spotted (same grace as Panther's pounce fear, `POUNCE_LINGER`), deals +80 + 60% Attack bonus damage; 8 s cooldown |

**Batch 5: Ability pairs (locked 2026-11-17)**

| Epic | Passive |
|---|---|
| Ability+Resist A: Spell shield | Blocks the next enemy ability (and its CC); recharges 40 s after it pops |
| Ability+Resist B: Bulwark casting | Each cast: +8 Resist for 4 s, max 5 stacks (+40), each on its own timer |
| Ability+AS A: Hexed strikes | Basics deal +15 + 15% Ability bonus Ability damage |
| Ability+AS B: Static charge | 5 basics charge it; the next releases 60 + 35% Ability to the target and chains to up to 4 enemies within 4 m (full damage each; no minion bonus) |
| Ability+Haste A: Spell cadence | 3 different abilities on one target within 4 s → +80 + 30% Ability bonus damage; 8 s cooldown per target |
| Ability+Haste B: Accumulation | Every 5 casts that hit an enemy hero or monster (one count per cast; minions don't count): +4 Ability permanently, cap +60 |

**Batch 6: Resist + AS pairs (locked 2026-11-17)**

| Epic | Passive |
|---|---|
| Resist+AS A: Retort | 25% of the damage your Resist prevents is stored (cap 60 + 1× Resist) and added to your next basic as Attack damage; storage empties after 4 s without attacking |
| Resist+AS B: Siphon plating | Basics on a hero steal 3 Resist (they −3, you +3), max 5 stacks (15), 4 s, refresh |
| Resist+Haste A: Steadfast aura | Allies within 6 m gain 20% Tenacity |
| Resist+Haste B: Shrug off | When hard-CC'd: basic ability cooldowns −2 s (max once per 4 s) |
| AS+Haste A: Snap-back | Casting an ability resets your basic attack timer |
| AS+Haste B: Battle tempo | Casting an ability: +30% AS for 3 s (refresh, no stack) |

**Scripted check (2026-11-17, `scratch/shopcalc.py`):** a Lv12 6 s fight model scores each passive's gold value vs spending the same gold on raw stats (target ~1,000 to 1,200). Changes made from it: Retort cut from "all prevented damage, cap 150 + 2× Resist" (worth ~4,000 to 9,000 gold) to 25% stored, cap 60 + 1× Resist; Bulwark breaker 3% → 2.5%. The model can't value team, lane-sustain or snowball passives (Redirect, auras, Wellspring, Soul harvest, Mana tap, Momentum, Reset, Accumulation, Warmog's): those wait for playtests.

**Attack speed cap (locked 2026-11-17):** stat attack speed (levels, item stats, boots) hard-caps at 2.5 attacks/s. Epic passive attack speed (Frenzy, Wind-up, Battle tempo, Last stand) is added *after* the cap, as a % of the hero's **base** attack rate (e.g. Panther with Wind-up: 2.5 + 1.28 × 36% ≈ 2.96), with an absolute ceiling of ~3.5/s. The shop shows "(max)" when stat attack speed is capped. Watch Wind-up in playtests (it may become the default carry item; trim stacks if so).

## Names (locked 2026-11-18; picked in rounds of 6)
Rules: nouns may overlap League item names, adjectives/descriptors may not (user kept "Infinity Scrolls" as an exception); fake compounds / hyphens only if truly the best option; an item never reuses the noun of the item it upgrades from. Working names in brackets are the passive's design name.

**Components:** HP: Garnet Brooch · Mana: Dewdrop Vial · Attack: Hatchet · Ability: Inkwell · Resist: Iron Collar · Attack speed: Kestrel Feather · Haste: Metronome

**Boots:** basic: Footwraps · Resist + Tenacity: Insulated Sabatons · Attack speed: Fencer's Slippers · Haste: Monk's Sandals · Move speed: Jackrabbit Moccasins

| Line | Tier 2 | Epic A | Epic B |
|---|---|---|---|
| HP+HP | Bear Pelt | Old Grizzly's Hide (Warmog's) | Cloak of the Oathsworn (Redirect) |
| Mana+Mana | Tide Pearl | Brimming Chalice (Mana engine) | Breakwater (Mana shield) |
| Attack+Attack | Bloodletter's Knife | Gluttonous Carver (Overheal) | Misericorde (Attack pen) |
| Ability+Ability | Arcane Journal | Unraveling Codex (Ability pen) | Magnum Opus (Amplifier) |
| Resist+Resist | Pavise | Tortoise Shell (Attack ward) | Spellbreaker's Veil (Ability ward) |
| AS+AS | Hornet Bracers | Hornet's Nest (Ricochet) | Hive Queen's Stinger (Frenzy) |
| Haste+Haste | Brass Astrolabe | Reaper's Orrery (Reset) | Crescendo (Ult follow-up) |
| HP+Mana | Amber Phial | Heartwood Amulet (Lifeblood) | Wellspring (Wellspring) |
| HP+Attack | Splitting Maul | Woodsman's Greataxe (Cleaver) | Rending Flail (Weakness) |
| HP+Ability | Druid's Branch | Hoarfrost Staff (Frost-touched) | Wildfire Totem (Immolate) |
| HP+Resist | Quilted Gambeson | Chameleon Hide (Adaptive guard) | Withering Hauberk (Wither) |
| HP+AS | Leather Handwraps | Ogre Knuckles (Bulwark breaker) | Death Grip (Last stand) |
| HP+Haste | Marching Harness | Inquisitor's Plate (Exposed) | Bell Cuirass (Battle rhythm) |
| Mana+Attack | Engraved Machete | Sapphire Kopis (Mana-forged) | Spirit Saber (Essence) |
| Mana+Ability | Star Chart | Supernova (Overcharge) | Harvest Moon (Soul harvest) |
| Mana+Resist | Prayer Shawl | Temple Censer (Ward aura) | Thistle Shroud (Barbed ward) |
| Mana+AS | Copper Bangle | Rusted Chakram (Wounding strikes) | Moonlit Anklet (Mana tap) |
| Mana+Haste | Rosary | Prayer Wheel (Momentum) | Calm Waters (Flow state) |
| Attack+Ability | Sigiled Saber | Twin Scales (Equilibrium) | Mirror Blade (Crossover) |
| Attack+Resist | Spiked Gorget | Rimed Pauldrons (Frostbite plate) | Vendetta (Grudge) |
| Attack+AS | Javelin | Hawk's Reach (Longshot) | Whirling Glaive (Wind-up) |
| Attack+Haste | Kukri | Tempered Edge (Tempered spells) | Viper's Kiss (Ambush) |
| Ability+Resist | Abjurer's Robe | Lunar Halo (Spell shield) | Stone Litany (Bulwark casting) |
| Ability+AS | Witch's Thimble | Hex Needle (Hexed strikes) | Lightning Distaff (Static charge) |
| Ability+Haste | Quartz Pendulum | Tuning Fork (Spell cadence) | Infinity Scrolls (Accumulation) |
| Resist+AS | Porcupine Quills | Rebound Buckler (Retort) | Bloodspike Plate (Siphon plating) |
| Resist+Haste | Lodestone | Horn of Steel Sun (Steadfast aura) | Broken Chains (Shrug off) |
| AS+Haste | Fencer's Foil | Hair Trigger (Snap-back) | Dancing Rapier (Battle tempo) |

## Tenacity sources (after the boots change)
- Plated boots (Tenacity stat)
- Steadfast aura (Resist + Haste epic): nearby allies gain Tenacity
- Engine: tenacity isn't implemented yet; add it as a CC duration multiplier in `CC.apply` with the shop work. Scope (2026-11-18): every CC **including slows**; knock-ups excluded.
