# Talent pass: decisions

Process (2026-11-20): one hero at a time. For each hero: pick 2 of 4 playstyles, then each tier (Lv3 small → Lv7 medium → Lv10 large) offers 3 options per playstyle and the user picks one per side. Tiers are **mix and match**: every cross-tier combination should work (no locked L/L/L lanes).
**Coverage rule:** across the four Lv3 + Lv7 talents, each of P, Q, E and R gets exactly one (basic attacks don't count). Lv10 is free.

**Implementation status:** all 8 heroes done (Bodyguard 2026-11-21 morning, the other 7 the same evening). `arena3d.html?talenttest` checks every talent.
Notes from implementing:
- **Imp Demolitionist:** the base turret and Superball never hit structures. Wrecking Ball and Siege Mode are what point them at buildings.
  - Wrecking Ball: Superball hits structures, +50%.
  - Siege Mode: when nothing else is in range, the turret shoots vulnerable structures from 25% farther, for x2.
- **Coyote Through the Trees:** bolts have no terrain collision yet, so today the talent is the +40% range. The bolt carries `ignoresTerrain` for when collision exists.
- **Fairy Decoy:**
  - Decoy HP is 15% of her max HP; its darts are not basic attacks (no on-hit).
  - The look is a placeholder: a glowing body, her wings and sparkles.
- **Heavy Gravity:** the Monolith's old slow was the standard 32%, not 30%.
- **Bots:** they roll a random side per tier. A Scientist bot with Second Throw re-throws by itself if its target is still within 11m.

Shared plumbing:
- `KitFx.tal(ctx, tier, side)` inside kit code.
- `Combat.talentOf(unit, tier)` anywhere else (player and bots).
- `CC.immuneOf` / `u.ccImmuneTimer` for CC immunity.
- `CC.slowSources` for slows that last as long as some state does.
- `Combat.saves` for "instead of dying" effects.
- `Combat.untargetable(u)` for untargetable.
- `Combat.damageMults` for damage taken or dealt.
- `structMult` on a hit for extra damage vs structures.
- `Combat.visionSources` for kit vision.
- `addBleed` in the engine is the one place that adds Bleed (max 4 everywhere now).

## Bodyguard: Protector / Initiator

| Tier | Protector | Initiator |
|---|---|---|
| Lv3 | **Broad Shoulders** (P): every ally you're currently screening gets half your Guard Resist (+7 per stack) | **Big Lungs** (R): Eyes On Me's radius is 20% larger |
| Lv7 | **Counterpunch** (Q): after an enemy hero damages an ally you're screening, your next Haymaker within 3s stuns them 0.75s, even without a wall | **Unstoppable** (E): can't be crowd-controlled during Leap Slam; 20% less damage taken for 1.5s after landing |
| Lv10 | **Last Stand:** once per 60s, if an ally you're screening would take lethal damage, you take the hit instead and they're untargetable for 1s | **Bouncer's Call:** Eyes On Me pulls taunted enemies 2.5m toward you before the taunt |

## Coyote: Sniper / Bleeder

| Tier | Sniper | Bleeder |
|---|---|---|
| Lv3 | **Steady Aim** (R): Heartseeker reaches full charge in 1.5s (was 2.0s) | **Shrapnel** (E): the grenade adds one more Bleed stack to everyone hit (outer ring 2, bullseye 4) |
| Lv7 | **Watchful Traps** (Q): each armed trap reveals enemies within 5m while it sits | **Crippling Bleed** (P): bleeding heroes are slowed 5% per stack (up to 20% at the max of 4) |
| Lv10 | **Through the Trees:** a fully charged Perfect Shot passes through walls and trees and has +40% range | **Plague:** when a bleeding enemy dies, their Bleed stacks jump to the nearest enemy within 6m |

## Saw Scientist: Butcher / Wrangler

| Tier | Butcher | Wrangler |
|---|---|---|
| Lv3 | **Overclock** (Q): the saw no longer slows you while it runs, but drains 30% more fuel | **Hang Time** (R): the Boomerang Blade hovers at its farthest point for 0.5s before coming back, slowing anyone it passes |
| Lv7 | **Fresh Fuel** (P): each saw hit on an enemy hero refunds 2 fuel | **Shock Dose** (E): casting Adrenal Injection releases a pulse that slows enemies within 4m by 30% for 1.5s |
| Lv10 | **Butcher's Ramp:** each saw tick on the same target deals 8% more, up to +60%; resets when you switch | **Second Throw:** after the Boomerang Blade returns, throw it once more within 3s for free; the second throw deals 75% damage |

## Cannon Imp: Engineer / Demolitionist

| Tier | Engineer | Demolitionist |
|---|---|---|
| Lv3 | **Reinforced Plating** (Q): the turret has 30% more HP | **Wrecking Ball** (R): Superball deals 50% more damage to structures |
| Lv7 | **Master Mechanic** (P): wrench hits repair the turret twice as much, and each repair gives it +20% attack speed for 3s | **Breaching Charge** (E): Blast Hop's take-off blast deals 100 + 50% Attack around you, doubled vs structures |
| Lv10 | **Spare Cannon:** after planting the turret you pull out a lighter spare cannon and keep fighting in carrying form at 70% damage | **Siege Mode:** the planted turret deals double damage to structures and has 25% more range against them (outranges towers) |

## Astral Sorceress: Artillery / Zone Controller

| Tier | Artillery | Zone Controller |
|---|---|---|
| Lv3 | **Wide Pillar** (Q): Starfall's area is 15% larger | **Heavy Gravity** (R): the Monolith's slow is 45% (was 30%) |
| Lv7 | **Stellar Swiftness** (E): Rift Step gets a third charge | **Gravity Mark** (P): Starmarked enemies are slowed 15% while the mark lasts (4s) |
| Lv10 | **Meteor Shower:** each Starfall calls down 2 extra smaller pillars around its target 0.4s later (50% damage each) | **Event Horizon:** when the Monolith ends, enemies still inside are pulled to its center and stunned 0.75s |

## Panther: Ambusher / Roamer

| Tier | Ambusher | Roamer |
|---|---|---|
| Lv3 | **Terror** (E): an unseen pounce fears for 1.3s (was 0.9s) | **Silent Paws** (P): Shadow Stalker's unseen move speed is +38% (was +28%) |
| Lv7 | **Go for the Throat** (Q): Gnash deals 35% more damage to heroes below 40% HP | **Long Night** (R): Nightprowl stealth lasts 9s (was 6s) |
| Lv10 | **Killing Spree:** a hero takedown within 3s of damaging them resets Pounce's cooldown | **Shadow Cloak:** casting Nightprowl removes slows and roots on you |

## Little Fairy: Healer / Trickster

| Tier | Healer | Trickster |
|---|---|---|
| Lv3 | **Fresh Dust** (P): each Fairy Dust patch heals double for its first second | **Hush** (E): Pixie Hop's silence on an enemy lasts 1.5s (was 1s) |
| Lv7 | **Quick Pop** (Q): Pop! Bubble flies 60% faster | **Rude Awakening** (R): enemies woken from sleep by damage are silenced 1s |
| Lv10 | **Guardian Wings:** hopping to an ally drops a quick mini bubble on them as you land (pops instantly, 50% strength: damage, slow, shield, smaller dust patch) | **Decoy:** each hop leaves a glittering copy of you for 3s that throws Glimmer Darts (30% damage) and can be targeted; when it dies or expires it pops into a Fairy Dust patch (Dreamdust during Lullaby) |

## Pit Brawler: Chaser / Bruiser

| Tier | Chaser | Bruiser |
|---|---|---|
| Lv3 | **Short Memory** (P): Don't Turn Your Back's per-target cooldown is 4s (was 6s) | **Second Guard** (E): Running Slide also grants a shield (half the collision shield) |
| Lv7 | **Shrinking Ring** (R): the Pit shrinks 30% over its duration, squeezing enemies toward the center | **Second Wind** (Q): a Roundhouse Kick that lands on a hero heals her 8% max HP |
| Lv10 | **Drag Back:** a Roundhouse Kick on a fleeing target pulls them 2m back toward her | **Home Turf:** inside her own Pit she takes 20% less damage |
