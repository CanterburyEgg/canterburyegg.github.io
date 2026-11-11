# MOBA Design Rules (living doc, built via /grill-me)

The goal: each hero's 3-ability kit lets you live that character's dream and make interesting positional and gameplay choices.

## 1. Hero dreams (locked)
| Hero | Dream |
|---|---|
| **Coyote** (Carry) | Classic long-range ADC. Shoots enemies from afar and surprises them with bleed, or with a long-range snipe from out of sight. |
| **Little Fairy** (Support) | Guardian angel + trickster. Classic support who sticks near her ally until she has a little trick to play. Hard to pin down; always a helpful ally. |
| **Pit Brawler** (Solo) | The overall bully. Sticks to enemies and beats them down; challenges them to an ultimate duel if they try to flee. |
| **Panther** (Jungle) | The unseen hunter. Roams the jungle unseen, picks the moment and angle, pounces on an isolated target and vanishes. Decision: approach route and line of sight; commit vs. stay hidden. |
| **Bodyguard** (Support) | The ultimate bouncer. Dictates who is where, and when. Keeps attention on himself while the carries do the rest; sets up fights with devastating positioning. |
| **Cannon Imp** (Solo) | Siege engineer + tinkerer. A pest: turns 1v1s into 2v1s, hard to pin down, then a powerful long-range threat when the team groups. |
| **Astral Sorceress** (Carry) | The stock mage. An ADC who casts spells instead; play her to feel like a wizard. |
| **Saw Scientist** (Jungle) | The mad surgeon. A reckless jungle brawler who dives into the thick of fights, carves through enemies up close and drags victims back with his saw, kept alive by risky chemistry. Decision: when to dive, and who to pull out of position. |

## 2. Stat model (locked)
- **Damage comes from the source, not an elemental type.** Basic attacks deal **Attack damage** and scale with Attack (plus attack speed). Abilities deal **Ability damage** and scale with Ability power (plus cooldowns).
- **One "Resist" stat** reduces both.
- **Exceptions are explicit:** a few abilities are flagged **"counts as a basic attack"**. They scale with Attack and apply on-hit effects (e.g. Coyote Q, Brawler Q kick, Panther Q).
- Feel target: Attack = sustained, steady output that rewards autos and on-hit. Ability = burst, spikes on cooldowns.
- Builds split into Attack items vs. Ability items. A hero's identity comes from which stat their kit leans on, so hybrids emerge naturally.
- Implementation note: the code already tags damage with `isBasic`; the Physical/Fantasy `dmgType` and the armor/fResist pair get replaced.

## 3. Mobility budget (locked)
- **Emergent, no fixed quota.** Every movement ability has to pass the test: **"does this kit really need it to live the dream?"** The default answer is no.
- Positioning is hugely important, but not everyone should be uncatchable.
- When auditing, consider the alternatives to a dash: conditional movement (needs a wall, target, stealth or the cannon), move-speed bursts, or displacing enemies instead of yourself.

## 4. CC vocabulary (locked)
| CC | Definition |
|---|---|
| Slow | Reduced move speed |
| Stun | Can't move, attack or cast |
| Silence | Can move and attack, but can't cast |
| Root | Can't move, but can attack and cast |
| Knockback | Pushed a set distance; can stun if they hit a wall |
| Knock-up | Briefly airborne and helpless (this is Cannon Imp's old "Knock Down") |
| Pull | Dragged toward a point |
| Taunt | Forced to walk at and attack the taunter |
| Sleep | Helpless until the duration ends or they take damage |
| Fear | Forced to run away from the source |

- **Distribution is emergent.** Some heroes have no CC at all; some kits are entirely CC. There's no signature-CC quota.
- To fix during audits: Panther 10R's ambiguous "Silence/Stun" has to pick one of the above.

## 5. Talent rules (locked)
- **Each tier is a choice between two playstyles, not two numbers.**
- **Impact scales with tier:** Lv 3 = small, Lv 7 = medium, Lv 10 = large.
- **No slot rules:** any tier can touch any ability, passive or R. What each tier affects is emergent per hero.
- The current talents were built very basically; rebuild them freely during the audits.

## 6. Mechanic rules
- **Passives can be anything**, including simple stat passives, as long as no two heroes share one.
- No "every Nth hit" passives in the first 8 heroes.
- **Shields and move-speed buffs are emergent:** a hero gets them if their kit needs them. No caps, but never as generic talent filler.

## Audit order (random)
Bodyguard → Coyote → Saw Scientist → Cannon Imp → Astral Sorceress → Panther → Little Fairy → Pit Brawler

## Overall philosophy
Almost every distribution question (mobility, CC, shields and speed, what talents touch) is **emergent**. Each kit is judged against its hero's dream and the question "does it really need this?", not against quotas. The fixed rules are few: the stat model, the CC vocabulary, the talent impact tiers, unique passives, and no Nth-hit passives.
- Names are all placeholders; rename once the kits are settled.

---

# Hero audits (baseline kits; talents come in one pass after all 8, level by level)

## Bodyguard ✅
- **Passive (Stand Behind Me!):** keep. Standing between enemies and an ally builds Guard stacks of +Resist (max 3). **Stacks build one at a time and decay one at a time (~1 per 1.5s)** instead of vanishing, so the E+Q dive isn't suicide, but he has to return to a guarding spot to recharge. Add visuals: a faint tether to the guarded ally and a shield icon per stack. Fix the HUD pip bug.
- **LMB (Brass Knuckles):** keep.
- **Q (Haymaker):** keep the knockback straight away from him (it feels very good). **Baseline: knocking an enemy into a wall, tree or tower stuns for 0.5s.** A talent can extend that stun.
- **E (Crowd Dive):** keep the leap. The leap-over-then-knock-back play is excellent. **Landing: 0.25s knock-up followed by a short slow** (replaces the 35%/1.8s slow).
- **R (Eyes On Me!):** keep as is (AoE taunt + a shield that scales with enemies hit).
- Talent ideas to revisit later: Brick Wall (longer wall-stun), Broad Shoulders (the guarded ally shares Resist), Bowling (enemies knocked into other enemies stun both), Heroic Rescue (E can target an ally), Thorns, Bouncer's Call (R pulls taunted enemies inward).

## Coyote ✅
- **Passive (bleed, up to 4 stacks):** keep.
- **LMB (crossbow, applies bleed):** keep.
- **Mobility:** none. His safety comes from range, positioning, the trap and the grenade slow. If testing shows he's helpless, add a small conditional tool (e.g. a backward hop on a close-range grenade), never a free dash.
- **Q → Bear Trap (replaces Fan Volley).** The volley wanted him close and R wants him far; the trap stacks bleed while he stays back. Thrown to a spot within ~6m, it arms after 0.5s and then turns **invisible to enemies**. The first enemy to step on it is **rooted for 1.0s and takes 2 bleed stacks**. Up to **2 charges**; a trap lasts ~30s. Works as peel (drop it at your feet) and as an ambush (trap a bush, then snipe). This is the roster's first root.
- **E (Shrapnel Grenade):** keep. **The slow becomes baseline** (25%, 45% on a bullseye); a talent can improve the bullseye slow later. A bullseye still adds +2 bleed.
- **R (Heartseeker):** keep the charged snipe that detonates bleed. **New: the aiming laser is invisible to enemies while Coyote is unseen** (brush or fog), so a snipe from hiding is a true surprise.
- Dependency: needs a shared "unseen / vision" system (Panther's passive uses it too).

## Saw Scientist ✅
- **Resource: Saw Fuel instead of mana** (the only hero without mana). Mana items do nothing for him.
- **Passive = the fuel system.** Fuel charges from **taking damage** (including his own E self-damage) and from **landing basic attacks**, and **slowly recharges whenever the saw isn't running** (in or out of combat). Replaces Five-Cut Vivisect, which broke the no-Nth-hit rule.
- **LMB:** keep. Its new job is revving fuel back up between saw bursts.
- **Q → Rev the Saw (toggle channel; replaces the orbiting Whirling Buzzsaw).** The blade spins in front of him like a real saw (matches the prop). It hits a **short frontal cone (~2.5m) every 0.35s for Ability damage**, aimed toward the cursor. While running: **25% slower movement, no basic attacks**, E and R still castable. A small cost to start, then it **drains fuel per second**. Toggling off puts it on a **1s cooldown**; it **shuts off automatically when out of fuel**.
- **E → Adrenal Injection (replaces Wild Potion).** **Costs HP, not fuel**: immediate self-damage, which also refuels him through the passive. Grants an **immediate move-speed burst that decays over time**, and while it decays he **slowly heals back past where he started** (a short-term speed boost, a long-term heal). It also offsets the Q self-slow.
- **R (Boomerang Blade):** keep (out: damage + slow; back: damage + pull toward him). **Costs a chunk of fuel.** While the blade is flying, Q is unavailable and shuts off if running. The intended combo: R drags them in front of him, then Q revs on them.
- Implementation note: needs a per-hero resource abstraction (bars, costs and bot logic currently assume mana).

## Cannon Imp ✅
- **Passive (form rules + tinkerer):** carrying = slow, long-range **splash shells**; unburdened = **+22% move speed and fast wrench swings**. **New: wrench hits on his own planted turret repair it.** Defending the turret becomes a real 2v1 decision: repair it or fight.
- **LMB:** depends on form, as above (Attack damage).
- **Q (Anchor Turret):** keep the core loop. He plants the cannon as a turret with its own HP and presses Q nearby to pick it up. A destroyed turret leaves **scrap** to salvage (or he gets it back at base). **Add a ~1.5s pickup lockout** after planting. Turret shots count as his basic attacks (Attack damage).
- **E (Blast Hop):** keep both forms. Carrying = the cannon fires downward for a **long rocket jump** (big commitment, loud boom, long cooldown); unburdened = a **short nimble hop** on a shorter cooldown. Passes the mobility test ("hard to pin down").
- **R (Superball):** keep. A giant cannonball skillshot fired **from wherever the cannon is** (shoulder or turret), **1.0s knock-up** on everything hit. **Uncastable while the cannon is scrap.**

## Astral Sorceress ✅
- **Passive → Starmark (Lux-style; replaces Soul Siphon + Astral Tempo).** Any ability hit applies or refreshes **one mark**; her next **basic attack pops it for bonus Ability damage**. One mark, no stacks (stacks would overlap Coyote's bleed). The cast-then-auto rhythm makes her a natural hybrid.
- **LMB (Astral Bolt):** keep; now plain Attack damage (no Physical+Fantasy mix).
- **Q (Starfall Pillar):** keep the delayed (0.38s) AoE pillar. **Hitting a hero refunds part of Q's cooldown** (replaces the stacking Tempo).
- **E (Rift Stride) → short step with 2 charges.** Each step is **~2.5m**, each charge **recharges separately (~9s)**. **Every step fires the homing bolts** with the same split (3 targets / 2+1 / all 3 on one) at **~60% of the current per-bolt damage**. Double-step to escape, or dance in and out of a scrappy fight.
- **R (Cataclysm Monolith):** keep as is: an expanding AoE "don't stand here" zone that slows and pulses Ability damage. The end-of-zone pull can be a talent at any level.
- Flag for Panther's audit: her E "Predator Marks" is also "mark, then pop with hits", so differentiate it.

## Panther ✅
- **Passive (Shadow Stalker):** keep. +28% move speed while unseen, lingering 2.2s after she's spotted. Add a clear **"UNSEEN" indicator** (a dark vignette or eye icon) so the player knows when the E bonus range and fear are live.
- **Stealth reveal radius:** enemies within **~3m** see her shimmer (applies to R and to all stealth in general).
- **LMB (Twin Claws):** keep (the Predator Mark interaction is removed).
- **Q (Slash & Gnash):** keep as is. A double auto with built-in sustain ("counts as a basic attack"), mainly for jungling, and part of the auto → Q → auto combo from the shadows.
- **E (Predator's Leap) → pounce bonus (Predator Marks removed, since they overlapped Sorceress's Starmark).** The leap deals **big Ability damage on landing**. **If she leapt while unseen** (fog, brush or R stealth), the target is **briefly feared**. Keeps the +65% range while unseen. This is the roster's only Fear.
- **R (Nightprowl):** keep as is (stealth up to 6s; turns on the passive speed and E range). Its climax is now R → long-range pounce → fear → Q combo. "Vanish after a kill" (old 10L Apex Reset) stays a talent candidate.
- Panther 10R's ambiguous "Silence/Stun" gets resolved in the talent pass.

## Little Fairy ✅
- **Passive (Fairy Dust):** keep. **Only Q pops create dust**: a patch for 3.5s that heals allies standing inside over time, and becomes Dreamdust during R.
- **LMB (Glimmer Dart):** keep; a light Attack-damage poke (support filler is fine).
- **Q (Pop! Bubble):** a **slow lob to a target spot** (~0.6s visible flight, so enemies can dodge). It pops over a **~2.5m area**: enemies inside take Ability damage and a 2s slow, allies inside get a shield, and the pop area becomes a dust patch. Prediction is the skill.
- **E (Pixie Hop) → 2-charge targeted blink.** **2 charges (~10s each)**, blink to **any unit within ~7m**, enemy or ally. **You can't hop to the same unit again until the charge used on it has recharged.** Enemy: minor Ability damage + **1s silence**. Ally: pure reposition. **Each hop drops a Fairy Dust patch at the target** (user correction, 2026-11-10). (Sorceress's E also has 2 charges; fine: hers is a free-direction step, Fairy's is a targeted unit blink.)
- **R (Lullaby Glamour):** **casting bursts a ~4m Dreamdust ring around her**, and for **10s all her dust, including new Q patches, is Dreamdust**: enemies inside fall asleep for 2s, woken early by damage. Reliable every time; lobbing Q during R is the skill.

## Pit Brawler ✅
- **Passive → "Don't Turn Your Back" (Jarvan-style; replaces Coliseum Rhythm / Combo Siphon).** Her **first basic attack on an enemy moving away from her** deals **significant bonus damage and a crippling slow (~40% for 1s)**, then that target has a **~6s cooldown**. A readable "got you" moment with counterplay (turn and fight, or wait it out).
- **LMB (Heavy Knuckle Combo):** keep (alternating hooks).
- **Q (MMA Roundhouse Kick):** keep. Empowers her next basic attack (fires immediately if an enemy is in range), **"counts as a basic attack"**, stuns 1.0-1.2s.
- **E (2x Cage Vault Dash):** keep. A flying-kick lunge; **colliding with an enemy or wall grants a shield and a recast within 3s**. Passes the mobility test (sticks to enemies; not a free escape).
- **R (Bloodsport Pit Arena):** keep (5s octagon of walls, +damage inside, E rebound surfaces, recast drops it early). **Change: her allies are NOT trapped**; they can walk in and out freely. Enemies (and she) are trapped.

---

# Next steps
1. **Talent pass:** all 8 heroes, one level at a time (Lv 3 small → Lv 7 medium → Lv 10 large), checking variety across the roster.
2. Rename everything once kits and talents are settled (all names are placeholders).
3. Implementation work these decisions create: the single Resist / Attack-vs-Ability damage model, a per-hero resource system (Scientist's fuel), a shared unseen/vision system plus a stealth reveal radius, charge-based abilities (Sorceress E, Fairy E, Coyote Q), and the new CC types (root, fear, knock-up, sleep).
