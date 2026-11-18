# Shop overhaul: item tree (working doc)

Structure (DESIGN_RULES §2): 7 components → 28 tier-2 items (21 mixed pairs + 7 doubles) → **two epics per tier-2 item** (56 epics), plus a separate boots line. You draft the passives; we go pair by pair and I record decisions here. Numbers come last.

**Status 2026-11-17: all 56 epics designed.** Next: boots, then names, then the numbers pass, then implementation.

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

## Tenacity sources (after the boots change)
- Plated boots (Tenacity stat)
- Steadfast aura (Resist + Haste epic): nearby allies gain Tenacity
- Engine: tenacity isn't implemented yet; add it as a CC duration multiplier in `CC.apply` with the shop work
