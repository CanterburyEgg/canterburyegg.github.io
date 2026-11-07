---
trigger: model_decision
description: "Load this rule whenever designing, discussing, or implementing the user's digital card game, card builder, or custom TCG mechanics."
---

# Digital Card Game — Design DNA & Memory

## Project Goal & Context
- **Scope**: Personal digital card game + interactive web card builder hosted on `canterburyegg.github.io`. Not intended for commercial release—prioritize fun, tactile design, clean web UX/AI playability, and expressive card creation over artificial differentiation from *Hearthstone*.
- **Division of Labor**: Assist with architecting the **core game system / rules chassis** and building the web game + card builder UI. **Do NOT design card-level keywords/mechanics unless explicitly asked**—the user wants to invent the card mechanics and cards themselves on top of the core system.
- **Core Conceit**: Built from the ground up to support **digital-only mechanisms** (such as modular assembly, perpetual card mutation across zones, and curated choice).

## User's TCG Design DNA (Quiz Results)

### 1. Core Engine Preferences
- **Resource Economy**: **Auto-Scaling Curve (`1A`) / Auto-Scaling + Spillover Bank (`1B`)** as primary; **Action / Pod Economy (`1E`)** as runner-up.
- **Hand & Card Flow**: **Classic +1 Card/Turn Drip (`2A`)** — card advantage, hand management, and holding key swing pieces matter.
- **Turn Cadence**: **"My Turn, My Canvas" (`3A`)** primary (snappy solo-turn flow, no constant opponent-turn stack prompts); **Alternating Micro-Actions (`3B`)** runner-up.
- **Board Topology**: **Open Lineup + Light Adjacency (`4A`) = Vanguard + Backline (`4C`)** tied at #1 (ahead of Multi-Lane `4B` and Grid `4D`).

### 2. Conflict, Win Conditions & Digital Space
- **Combat & Win Structure**: **Persistent Leader / Milestone Progression (`5D`) = Attacker's Choice (`5A`)** tied at #1, followed by **Orthogonal / Alt-Win Axes (`5E`)**. (Did not select Defender's Choice `5B` or pure Point/Zone Control `5C`.)
- **Digital-Native Design Pillars (Top 3)**:
  1. *(Tied #1)* **Modular "Build-a-Card" Assembly (`6A`)** — splicing components, upgrades, or halves into custom cards mid-match.
  2. *(Tied #1)* **Perpetual Card Memory & Mutation (`6C`)** — cards permanently gaining stats, cost changes, or rewritten text across zones (hand, deck, graveyard).
  3. *(#3)* **Curated "1-of-3" Adaptation (`6B`)** — *Discover*-style contextual selection.
- **Variance Philosophy**: Deferred until core game chassis is finalized.

### 3. Identity, Pacing & Guardrails
- **Deckbuilding Architecture**: Tentatively **Squad / Pod Stitching (`8C`)** (combining 2–3 distinct character/faction packages), to be finalized after core rules.
- **Core Player Thrills**:
  - **Engine Pop-Off (`9A`)** — assembling interlocking value/synergy machines.
  - **Inevitable Grind (`9E`)** — answering threats cleanly and building inevitability.
  - **Back-and-Forth Big Tempo Swings (`9F`)** — dramatic haymaker board flips traded by both sides.
- **Ideal Match Length**: **Crisp Midrange Arc (`10B`)** — ~7–12 minutes, ~8–10 turns.
- **Hard Vetoes (Engineer Out Forever)**:
  - **NO Mana Screw / Mana Flood (`11A`)**
  - **NO Exhausting Board Stalls where attacking first loses (`11G`)**

## Core System Specification v1.0 (LOCKED)

### 1. Hero & Faction Deckbuilding
- **Hero Loadout**: Each faction has **2 Hero Powers** (either Active with `{XAP}:` in its rules text, each usable `1/turn` independently, or Passive with plain text). Flavor-wise, each Hero Power represents a **specific Hero character**—so at deckbuilding, you are choosing **your 2 Heroes** from across the game's Factions (`5` Mono-Faction loadouts + `40` Dual-Faction loadouts) and gaining access to their powers. Hero Powers render as lightweight tabletop **Medallion + Parchment Plaques** (not full deck cards).
- **Faction Access**: Deck may include single-pip cards from **either chosen Faction**, plus **Neutral (`N`)** cards (0 faction pips).
- **Double-Pip Loyalty (`XX`)**: Cards with double faction pips require **both** chosen Hero Powers to belong to that same Faction (Mono-Faction payoff).
- **Core Numbers**:
  - **Hero HP**: `30`
  - **Deck Size**: `25` cards (`2x` standard copy limit / `1x` elite copy limit).
  - **Hand Flow**: `+1` card drawn per turn; **no** baseline `1 AP: Draw` system action (card draw/generation comes strictly from cards, Hero abilities, and Infrastructure).
  - **Opening Hand, Mulligan & Limits**:
    - **Player 1 (First)**: Selective mulligan **4 cards** (toggle any to shuffle back & replace once) + draws `1` at Start of Turn 1 (`5` cards on Turn 1).
    - **Player 2 (Second)**: Selective mulligan **5 cards** + receives a **`Wishing Coin`** (`1E / 0AP` Neutral Spell Token: `"Gain {1AP} or {+1E} this turn."`) after mulligan + draws `1` at Start of Turn 1 (`7` cards on Turn 1 including `Wishing Coin`).
    - **Hand Cap**: **10-card hard limit** (*Hearthstone*-style: draws at `10/10` burn; generated/`Wished` cards at `10/10` fizzle).
    - **Empty Deck**: **Instant deck-out loss** (*MTG*-style) when required to draw from a `0`-card deck (filtered `"Draw a Character"` safely whiffs if a non-empty deck has no matching Characters left; loses if deck has `0` cards).

### 2. Economy (`AP` + `Energy`)
- **Innate Scaling**: Both **Action Points (AP)** and **Base Energy** scale `1 → 2 → 3` automatically over Turns 1–3.
- **Action Points (AP)**: Spent to play cards and trigger activated abilities. **Resets strictly** each turn (`3 AP` cap from Turn 3 onward; no rollover banking).
- **Energy**: Unspent **threshold requirement** checked when playing cards (`Base Energy [up to 3] + Bonus Energy from Buildings`).
- **Costing & Curve Law (Option A — Flat `1 AP` Curve, `2 AP` Haymakers)**:
  - Because players draw `1` card/turn into `3 AP`/turn, **cards in hand are the primary bottleneck** and **`AP` (`1 AP` vs `2 AP`) is the true raw-power multiplier**, while **`Energy` (`1E` → `2E` → `3E`) is a Role & Timing Gate** (not a *Hearthstone* `1× → 2× → 3×` stat multiplier).
  - **`1E–3E` (`1 AP`)**: Flat per-card value across `1E`, `2E`, and `3E` so `1E` cards remain strong draws on Turn 5+. `1E / 1AP` holds proactive openers, scaling engines (`{Devotee}`), `+1E` Buildings, and real bodies (`~2/2` with upside, `2/3`); `2E–3E / 1AP` holds mid-game engines, board-dependent buffs (`+3/+3 & {Provoke}`), and reactive/synergy tools that shouldn't fire on Turn 1.
  - **`2 AP` (& `3 AP`)**: Standalone heavy threats (Queens, Juggernauts), 2-for-1s, sweepers, and unconditional removal (`Off With His Head!` at `3E / 2AP`). Costing heavy plays at `2 AP` prevents dumping three bombs on Turn 3 after skipping Turns 1–2, and naturally creates a `2 AP + 1 AP = 3 AP` pocket on Turn 3+ where `1 AP` cards and Hero Powers always fit.

### 3. Board Zones & Combat
- **4 Building Slots** (`2` left of Hero, `2` right of Hero — formerly referred to as Infrastructure):
  - Houses non-combat **Building** permanents (Energy Ramp pieces to spike early or push past `3 Energy`, plus Value/Synergy Engines).
  - Protected from normal combat attacks.
  - **Overwrite Allowed**: When at `4/4` Buildings, playing a new Building allows scrapping/replacing an existing one.
  - **Frame Badges, Energy Timing & Activation Limit**: `+Energy` provided sits bottom-left; optional Charge Counter sits bottom-right (matching Character Health position). **Delayed `+Energy` Ramp**: A newly built/planted Building does **not** grant its `+Energy` on the turn it enters play—its `+Energy` comes online starting at your next **`{Start of Turn}`** (preventing immediate same-turn ramp spikes; overwriting an active Building also loses the old Building's `+Energy` until the new one activates next turn). Activated abilities on Buildings are usable **starting the turn played** (provided you already meet any `{#E}`/`{XAP}` cost), capped at **once per turn per Building**. Spending charge counter(s) to `0` does **not** destroy the Building—the ability simply disables while the Building remains in play providing its `+Energy`.
- **6 Character Slots** (Dynamic Compacting Row):
  - Houses combat units in a compacting *Hearthstone*-style row (`0..N`, visual left-to-right on both sides) with persistent damage; playing a Character from hand lets you insert it into any gap, and deaths close gaps immediately.
  - **Summon Placement Law**: Single-unit Character triggers summon immediately to that Character's **right**, while Character triggers that summon **two** Characters place **one on either side** (`[Left, Summoner, Right]`, e.g., `Hedgerow Matron` flanking herself with both `1/1 Rabbits` inside her `{Provoke}` cover); `{Farewell}` triggers summon in the dead Character's **exact vacated spot**; Spells & Buildings summon on the **far right** (`Vanity Mirror` copies exact current board state; `Woodland Blessing`'s `2/2` copy preserves all abilities/modifiers at `2/2`).
  - **No Default Haste (Summoning Sickness)**: Characters cannot attack on the turn they enter play unless they have `{Swift}` or a forced-attack spell effect.
  - **No Overwrite**: At `6/6` Characters, you cannot play new Characters until a slot opens (*Hearthstone* style).
- **Turn & Combat Flow (`Main 1 → Combat Window → Main 2`)**:
  - **Main Phase 1**: Spend `AP` freely on Characters, Buildings, Spells, and Abilities.
  - **Combat Step (Once per turn)**: Sequential **Attacker's Choice** combat—declaring your first attack in `Main 1` transitions into Combat; attack one-by-one in any order with ready Characters and your Hero (whenever your Hero has `>0` Attack; Heroes obey enemy `{Provoke}` and take Character retaliation damage, preventable by `{Ward}`) at `0 AP` per attack against enemy Characters or the `25 HP` Enemy Hero. No `AP` plays/abilities may be interleaved mid-combat; swinging your last ready attacker (or clicking `End Combat`) enters `Main Phase 2` with no further normal attacks that turn.
  - **Main Phase 2**: Spend any remaining `AP` after combat (e.g., deploying Characters into newly freed `6/6` slots or triggering post-combat synergy), then End Turn.
- **Core Card Types & Functional Tiers**:
  - Types: `Character`, `Building`, `Spell`, `Hero Active`, `Hero Passive` (inferred visually by card silhouette/boxes; no bottom card-type text tag, optional bottom Subtype plaque only when Subtype is set).
  - Copy Tiers: `Standard (2x)`, `Elite (1x)` (communicated visually via bespoke per-faction sculpted frame crowns), `Token (Non-Collectible)`.
  - Core Trigger Keywords (with inline rules-text bubbles): **`Debut`** (`{Debut}` — on-play from hand / "Battlecry" equivalent), **`Farewell`** (`{Farewell}` — on-destroyed / "Deathrattle" equivalent), **`Start of Turn`** (`{Start of Turn}`), **`End of Turn`** (`{End of Turn}`), and **`Siege`** (`{Siege}` — triggers when this Character declares an attack, resolving *before* combat damage so killing the defender aborts combat strike with `0` retaliation).
  - User-Designed Set 1 Mechanics:
    - **`Poisoned`**: Healing or pump spells that reverse their effects (`+X/+Y` becomes `-X/-Y` bypassing `{Ward}` and killing at `≤0` HP; `Heal N` becomes `N damage` blocked by `{Ward}`)—once a `Food` card is `{Poisoned}`, it is strictly committed to its reversed effect rather than acting as a friendly buff/heal. Temporary `+HP` acts as a real turn-long HP cushion; temporary `-X/-Y` restores at End of Turn if the Character survives. (`Belladonna`'s `{0AP}` strictly poisons the literal left-most `Food` in hand *Outcast*-style, even if already `{Poisoned}`.)
    - **`Safeguard`**: `"This Character takes no damage when attacking another Character."`
    - **`Devotee`**: Trigger keyword that fires the **first time each turn** you play a Character with a higher Energy requirement than this card (capped at once per turn).
    - **`Kinship`**: Trigger keyword that fires **once**, as soon as you control another Character that shares this Character's subtype/type (whether already in play on arrival or arriving later).
    - **`Provoke`**: Positional blocker keyword — enemy Characters and attacking Heroes cannot attack your Hero, or allies without **`Provoke`** adjacent to this Character (shields your Hero + immediate left/right neighbors on the `6`-slot row; targeted spells ignore `{Provoke}`).
    - **`Swift`**: Immediate-attacker keyword — this Character can attack on the turn you play it (bypasses summoning sickness).
    - **`Ward`**: Stackable noun barrier (`"a {Ward}"` / `"{Wards}"`) — each **`Ward`** prevents the next single instance of damage that would be dealt to that Character or Hero, then breaks (multiple **`Wards`** stack!).
    - **`Fate`**: Boolean card modifier (doesn't stack to draw 2) — a card given **`Fate`** loses its `AP` cost (`0 AP`) and gains `"When played: Draw a card."`
    - **`Wish`**: Sequential **`1 → 1 → 1` Push-Your-Luck** card generation from outside your deck (replaces simultaneous 3-card *Discover*). Rolls 3 distinct collectible non-Token cards from your **2 Heroes' factions + Neutrals** (including `2-pip` cards of your factions), weighted `2×` Standard : `1×` Elite, never generating the source card itself—but reveals them **one at a time**: see Offer 1 (Take it, or pass it forever to see Offer 2) → see Offer 2 (Take it, or pass it forever to lock into Offer 3) → Offer 3 must be claimed. (`Ravenous Dowager` pre-poisons 1 of the 3 Food cards, turning sequential passes into a deduction risk!)
    - **`Woodland Blessing`**: Smart-filtered random Character bonus rendered dynamically right onto each candidate card when seen (`Gift of the Wishing Oak` guarantees **3 distinct** Blessings across its 3 `Wish` options):
      1. `This Character's {Debut} and {Farewell} abilities trigger twice.` *(only if it has Debut or Farewell)*
      2. `When you play this Character, summon a 2/2 copy of it.`
      3. `+2/+2`
      4. `+1/+2 and {Provoke}` *(only if lacking Provoke)*
      5. `+2/+1 and {Safeguard}` *(only if lacking Safeguard)*
      6. `+1/+0 and {Swift}` *(only if lacking Swift)*
      7. `{Kinship}: Give this Character +3/+3.` *(only if it has a Subtype)*
      8. `+1/+1` and `{Debut}: Give this Character a {Ward}.`
    - **Templating & Token Conventions**:
      - Rules text refers to your Hero directly as `"you"` / `"yourself"` (e.g., `"You take 3 damage"`, `"Give yourself or a friendly Character..."`), and uses `**Kill**` for unconditional destruction.
      - **`Play` vs `Summon`**: **`Play`** strictly means casting a card from hand (fires `{Debut}`, `{Devotee}`, `{Fate}`, and `"When you play..."`), whereas **`Summon`** means any Character entering the board (playing from hand counts as summoning, while token-creation and copy effects say `"Summon a ..."` so they don't re-fire on-play triggers).
      - **Tokens** are standardized at **`1E`** (`energyReq: 1`) by default.
      - Card titles wrapped in quotes (`"..."`) in `cards.json` indicate working flavor-beat placeholders awaiting final names.
      - **Card Naming Conventions**:
        - Cards are **loosely inspired** by fairy tales, folklore, and faction worldbuilding (e.g., *Red Velvet Court*) rather than strictly literal 1:1 public-domain names.
        - **Heroes**: Use a clean **Character Name** without an epithet (e.g., *King Valen*, *Belladonna*).
        - **`1x` Elite Characters**: Use **Character Name + Epithet** (unless the title itself is already uniquely iconic/elite, such as *"The Queen of Hearts"*).
        - **`2x` Standard Characters**: Use **indefinite role/trope titles** so controlling two copies on the board feels natural.
  - Project Folder: `/storybook/` (2-Handed Playtest Table & Deckbuilder at `/storybook/index.html`, Card Builder at `/storybook/card-builder.html`, Worldbook at `/storybook/factions.html`, canonical data at `/storybook/cards.json`).
  - Set 1 Card-Specific Rulings:
    - `For Hearth and Hollow`: `4E / 1AP` — `"Give each Character in your hand a **Woodland Blessing**."` (Non-targeted spell; requires at least 1 Character in hand and smart-filters out duplicate boolean Woodland Blessings on Characters that are already blessed.)
    - `Stone Soup`: True match-wide `"everywhere"` aura counting all `{1E}`/`{2E}` Characters you **play** from hand (tokens and summoned copies do not increment it), updating hand, deck, graveyard, and newly `Wished` copies.
    - `Kit Merryweather, Folk Hero`: `4E / 2AP` `5/4` — Buffs the literal top `{1E}`/`{2E}` Character in deck (stacking `+2/+2` if triggered again before drawn).
    - `Bloodkey Baron` & `Velvet Queen Valentina`: Left-neighbor sacrifice is mandatory (`Bloodkey Baron` is a `3E / 2AP` `2/3` that sacrifices its left neighbor on `{Debut}` to deal 2 damage to all enemy Characters; `Valentina` sacrifices her left neighbor at `{End of Turn}` to summon a 2/4 `{Provoke}` Royal Vanguard; place at leftmost slot `0` to opt out).
    - `Crossroads Inn`: `"{1AP}: Draw a Character. {5E}: Give it a **Woodland Blessing**."`
    - `Granny Thimble's Cottage`: `"{1AP}: Heal 2. {5E}: Heal 4 instead. {7E}: Give +4 Health instead."` (targets any Hero or Character; at `{7E}`, gives a Character `+0/+4` permanent Health or gives a Hero `+4` HP & `+4` Max HP even past 30).
    - `Dub Thee Champion`: `"Give a friendly Character a {Ward}. Replace its {Debut} and {Farewell} with {Siege}."`
    - `Fairest of Them All`: `"**Kill** all Characters. {6E}: Except friendly **Queens**."` (`3E / 3AP` non-targeted board wipe that spares friendly Queens when cast at `6E+`.)

## Set 1 — Storybook / Fable Factions (LOCKED)
1. **Red Velvet Court (`R` — Deep Crimson / Burgundy)** *(Palace / Regal Tyranny)*: Evil queens, vain kings, wicked stepmothers, aristocratic court elves, regimented palace-guard orcs, loyal guards/footmen, royal executioners, magic mirrors, decrees, palace intrigue.
2. **Havenhearth (`H` — Warm Amber / Gold)** *(Village & Road / Heroic Folk)*: Plucky folk (including stout village dwarves and gnomes alongside humans), waistcoat-wearing talking critters, cottages, bakers, huntsmen, valiant tailors, gallant knights-errant, and the safe, sun-dappled border woods of the **Honeywood**.
3. **Deepbriar (`D` — Dark Forest / Moss Green)** *(Bog & Dark Woods / "Off the Path")*: Big bad wolves, bridge trolls, beanstalk giants, candy-house & swamp witches, cauldrons, briar thickets, dark curses.
4. **Twilight Glade (`T` — Moonlit Violet / Indigo)** *(Moonlight, Fae & Living Lore)*: Fairy godmothers, sprites, changelings, pied pipers, wandering bards, wishes, riddles, fate-weaving story-ink.
5. **Whimsy's Workshop (`W` — Confectioner / Bright Pink)** *(Enchanted Craft & Curios)*: Wooden puppets, tin soldiers, gingerbread folk, animated household curios, straw-to-gold looms, mechanical nightingales, magic lamps, master crafters.

## Mechanical Color Pie & Guardrails (LOCKED)
- **System-Wide Rules**:
  - **Formation & Adjacency (`6`-Slot Ordering)**: **Universal baseline layer across all 5 factions** (never restricted to 1–2 factions).
  - **NO Deck Tutoring**: Hard ban on deterministic deck-searching (`25`-card `2x` decks already have high natural consistency, and tutoring overshadows digital discovery, assembly, and mutation).
- **22 Active Mechanical Slices (`Primary / Secondary / Tertiary`)**:
  1. **Go-Wide Swarm & Team Buffs**: `H / W / T`
  2. **Tall "Juggernaut" Threats**: `D / R / —`
  3. **Sacrifice & `Farewell` Aristocrats**: `R / W = D / —`
  4. *(Universal: Formation & Adjacency across all 5 factions)*
  5. **Wounded-Unit Synergy & Healing Midrange**: `H / D / —`
  6. **Hard Single-Target Execution**: `R / D / T`
  7. **Board Sweepers / AoE Clears**: `R / T / W`
  8. **Direct Face Burn & Reach**: `W / R / T`
  9. **Tempo Stalls (Stun / Bounce / Shrink)**: `T / H / W`
  10. **Taxing, Edicts & Rule-Setting**: `R / D = T / —`
  11. **Energy Ramp & Big Landmarks**: `D / R = W / —`
  12. **AP Flurry & `0-AP` Combo Turns**: `T / H = W / —`
  13. **Building Engines & "Scrap/Rebuild" Loops**: `W / R / H`
  14. **Sabotage / Anti-Building Tech**: `D / W / —`
  15. **Hero Combat & Loadout Mastery**: `W / H / R`
  16. **Pure Card Draw & Hand-Size Payoffs**: `T / W = R / —`
  17. **Spell-Slinger / Cast Triggers**: `T / W = R (Edict typal) / —`
  18. **`Debut` Reuse & Self-Bounce**: `T / H / W`
  19. **Graveyard Recursion & Reanimation**: `D / H (small units) = W / —`
  20. *(BANNED: Deck Tutoring & Setup)*
  21. **Modular "Build-a-Card" Assembly**: `W / D / All others`
  22. **Perpetual Card Mutation**: `H / W / All others`
  23. **Curated `1-of-3` Discovery ("Wishing")**: `T / H / All others`
  24. **Transformation & Polymorph**: `T / H = D / —`
  25. *(Cut from Pie: Deck-Seeding & Story Milestones — rare standalone designs only)*

## Active Design Status
- **Phase 1 (Complete)**: TCG Design DNA Quiz & Profile established.
- **Phase 2 (Complete)**: Core System Specification v1.0, all 5 Storybook Faction identities, core triggers (`Debut`, `Farewell`), and the 22-slice Mechanical Color Pie locked.
- **Phase 3 (Complete — Card Designer v1)**: Interactive Card Designer & Set Studio built at `/storybook/card-builder.html` + Faction Worldbook & Pie Reference at `/storybook/factions.html`.
- **Phase 4 (Active)**: Authoring initial vertical-slice cards (`R` Court & `H` Havenhearth + `N` Neutrals), followed by building the playable game engine.

### Locked Red Velvet Court (`R`) & Neutral (`N`) Flavor Beats
1. `card_mvrdweu3_tffta` (`hero_active` `{1AP}` Edict generator — `King Valen`): **The Velvet Machiavelli / Scheming Sovereign** (suave, dangerous young King who rules in tandem with his ruthless Queens)
### 2. `Belladonna` (`card_mvrecr9y_ejwp5` — `hero_active` `{0AP}` Poison left-most Food): **Black-Lace Court Poisoner** (*Snow White* / *Borgia* inspiration)

### Mandatory Card Art Quality Audit & Visual Style (LOCKED)
- **Locked Game Art Style — Sleek Graphic-Novel Comic Ink & Flat Solid Blacks (`art-belladonna.jpg` + `art-bloodkey-baron.jpg`)**: All card art uses the razor-clean dark fairy-tale poster/graphic-novel aesthetic exemplified by `art-belladonna.jpg`, `art-bloodkey-baron.jpg`, and `archive/art-belladonna-style9-mignola-ink.jpg`:
  1. **Crisp Tapered Ink Line Economy**: Confident, razor-clean tapered black comic-ink contours with minimal interior linework—keep skin, cloth, metal, and wood as smooth, calm, open spans of color (Joëlle Jones / *Fables* poster cover clarity).
  2. **Big Flat Solid Blacks + Smooth Two-Tone Cel/Gouache Blocks**: Bold, chunked graphic slabs of **100% flat solid jet-black** shadows paired with smooth **two-tone cel/gouache shading** (1 clean base color + 1 smooth hard-edged shadow tone).
  3. **STRICTLY ZERO Crosshatching / Woodcut Grit**: **NEVER** prompt for *"Darkest Dungeon"*, *"gritty crosshatching"*, *"etching/engraving lines"*, *"textured grunge washes"*, excessive cheek/knuckle scratch wrinkles, individual scratchy white hair/fur strands, or chalky yellow rim-light hair hatching.
  4. **High-Contrast Stagecraft & Purposeful Detail (`art-belladonna.jpg`, `art-valentina.jpg`, `art-bloodkey-baron.jpg`)**: Use strong value contrast (crisp `#000000` blacks in shadows, folds, and recesses so silhouettes snap) and include environmental architecture/props whenever they genuinely augment the vibe and storytelling of the scene (`art-valentina.jpg`'s rose-flanked vaulted throne room is a hallmark of the style—do NOT strip atmospheric rooms into empty `#000000` black voids!). Only cut detail when it becomes noisy micro-clutter (gaudy RPG filigree, muddy 3D stone soup) that fights the focal subject. For **Havenhearth**, bright sunlit countryside backgrounds are intentional—aim for *"if Dark Horse comics illustrated Peter Rabbit"* (crisp comic ink, punchy dark shadow anchors, and clean cel/gouache planes rather than pitch-black voids or soft washed-out watercolor).
- **Character Age Diversity**: Characters across the game must span a wide, authentic range of ages (weathered elders, matronly/middle-aged schemers, grizzled veterans, crone witches, children/pages, young nobles)—do NOT default every character in the world to the same 20-something age bracket.
- **Human References — Cast First for Human Characters, Vibe by Default**: Before generating art for any human ("true") Character card, align with the user on a real-world human/actor reference first (propose 3–4 strong actor anchors with a clear #1 recommendation if none is specified yet). Unless the user explicitly asks for an exact facial reconstruction (e.g., Katie Stevens for `Rosalind`), treat actor/celebrity picks strictly as a **vibe, build, and attitude anchor**—translate their energy into an **original storybook character face** (and omit the celebrity's literal name from the final render prompt if needed) so cards never look like exact celebrity photos in costume.
- **Before presenting ANY newly generated card illustration to the user**, a **disposable auditor subagent** (NEVER the parent conversation!) MUST inspect it via `read_file` and audit it against the North Star standards (**ZERO images may ever be read via `read_file` in the parent conversation**, so the main chat's memory stays 100% text-only and fast). **If an option fails any check below, do NOT show it to the user—send it back to that option's image generator with targeted corrections (1 retry max) until it passes**:
  1. **Line Economy, Flat Blacks & Smooth Two-Tone Planes**: Must match `art-belladonna.jpg`, `art-valentina.jpg`, and `art-bloodkey-baron.jpg`—razor-clean comic ink contours, bold solid-black shadow anchors, smooth two-tone cel/gouache color blocks, and purposeful scene-augmenting backgrounds. Reject scratchy crosshatching, woodcut engraving lines, dusty dungeon grit filters, smooth airbrushed 3D skin/metallic gradients, chalky rim-light halos, and noisy micro-clutter.
  2. **Pose, Camera & Character Acting (NO "Selfie Stare" / Empty Distance Stares / Generic AI Face / Cartoon "Y-Cleavage")**: Characters must have a dynamic, asymmetric posture or head tilt and genuine theatrical acting—actively absorbed in a grounded, sensible action (looking *directly along a locked eye-line at the prop/person they are interacting with*, never staring politely at the camera OR gazing vacantly off past the object into empty sky). Female characters should be strikingly beautiful/hot with natural feminine bust and proportions—avoiding the "Generic AI Woman" face, uncanny doll proportions, or awkward misplaced lines etched high up on the upper sternum, while **NEVER** flattening or erasing a character's natural bust/cleavage (`art-valentina.jpg` is a hallmark reference).
  3. **Physical & Narrative Logic**: Verify exact eye-to-prop laser alignment, hand-to-prop alignment, shadows, and grounded real-world physics (no fake neon poison auras—use physical syrupy glaze/liquids; no random background candelabras/candles scattered in nonsensical spots around rooms—avoid prompting for candelabras unless a single candle is the active focal prop; no blossoms + full-grown fruit on a baby sapling; no unheld floating cloth; no readable gibberish AI text or fake runes; no duplicate shadows; no closed scrolls while stamping; real utensil buoyancy/resting angles and realistic utensil-to-hand scale; grounded door/window/prop architectural proportions; avian `ANIMALFOLK` keep true bird wings and grip weapons via talons/harnesses rather than "feather-hands").
  4. **Faction Identity, Safe-Zone Headroom & Full-Bleed `1:1` (NEVER Edit in PIL)**: Ensure the costume/environment belongs to the card's Faction (`art-turnpike-tollkeep.jpg`, `art-granny-thimbles-cottage.jpg`, `art-stone-soup.jpg`, and `art-featherweight-lancer.jpg` are the locked Havenhearth benchmarks alongside `art-belladonna.jpg` and `art-bloodkey-baron.jpg`). Every image must be **100% full-bleed `1024x1024`** with **zero** white margins or black letterbox bars, keeping core subjects inside frame safe zones (`Character Oval: x=20%–80%, y=16%–82%`; `Building: x=15%–85%, y=15%–84%`; `Spell Archway: x=16%–84%, y=15%–84%`). **NEVER manually edit, mask, scale, or composite card art in PIL/Python**—perform 100% of visual generation and edits directly via the image model.
- **Card Art Production Workflow & Context Hygiene**:
  - Present **3 distinct compositional/narrative options per card**, staged both in a `UserFacing: true` carousel artifact AND copied to `/storybook/assets/art-<slug>-opt{1,2,3}.jpg` with clickable `file://` links; delete `-opt*.jpg` files once the winner is locked as `/storybook/assets/art-<slug>.jpg`.
  - Whenever updating a card's `artUrl` in `/storybook/cards.json`, **always bump BOTH** that card's `updatedAt` AND the root `"updatedAt"` on line 4 (so `card-builder.js` merges cleanly with `localStorage`).
  - **Keep turns fast (Disposable Card Director + 1 Subagent Per Image, ZERO Parent Image Reads)**: NEVER call `read_file` on any `.jpg`/`.png` inside the parent conversation. For each card, delegate orchestration + North Star visual QA to a single disposable `self` subagent (which spawns **3 parallel `image-generator` subagents—1 per option**, audits the JPEGs inside its own throwaway context with 1 retry max, copies `art-<slug>-opt{1,2,3}.jpg` into `/storybook/assets/`, kills its child subagents, and returns plain text only), then immediately `kill` that `self` subagent so the parent chat stays 100% text-only with a single wakeup per card.
3. `card_mvrhmr5k_zdo17` (`1E/0AP` `EDICT` — Wish `{2E}` Character w/ `{Devotee} +1/+1`): **Bestowing a Court Title** (*Puss in Boots* / *Brave Little Tailor*)
4. `card_mvrr6xhe_863ug` (`1E/1AP` `FOOD` — `{Fate}` with Queen, Heal 3 from a Hero): **Turkish Delight** (*The Snow Queen* / *Narnia*)
5. `card_mvrlon9p_9f5ec` (`1E/1AP` `2/2` Character — `{Devotee} +1/+1`): **Trumpet-Bearing Royal Herald** (*Cinderella* / *Sleeping Beauty*)
6. `card_mvrlp86k_0zurb` (`1E/1AP` `2/1` Character — `{Farewell} Draw a card`): **White Rabbit / Frantic Court Courier** (*Alice in Wonderland*)
7. `card_mvrhepzb_uh9ml` (`2E/1AP` `EDICT` — Draw 2, take 2 damage unless Queen): **Royal Tax Levy** (*Robin Hood* / *Rumpelstiltskin*)
8. `card_mvrjs6yo_7ityt` (`2E/1AP` `1/3` Character — `{Debut} {Devotee}` Humble Pie [`+2/+1` this turn]): **Royal Pie-Baker** (*Sing a Song of Sixpence*)
9. `card_mvrn0r4k_xbj7d` (`2E/1AP` `2/3` Character — `{Devotee}` `{0AP}` Hero Power): **Scheming Lady-in-Waiting** (*Snow White* / *Sleeping Beauty*)
10. `card_mvrrbe1g_th6hb` (`2E/1AP` `+1E` Building — `{Devotee}` Add a Powdered Rose-Joys to your hand): **Painted Rose-Garden** (*Alice in Wonderland*)
11. `card_mvrl4zqm_2es2l` (`2E/1AP` `+1E [1]` Building — `{5E}{2AP}` copy friendly Character): **Magic Mirror** (*Snow White*)
12. `card_mvrltf84_63deu` (`2E/1AP` `1/3` Standard `QUEEN` — `{Debut}` Wish for Food, one `{Poisoned}`): **Ogress Queen-Mother** (*Perrault's Sleeping Beauty*)
13. `card_mvrlqoga_r4xfg` (`3E/1AP` `3/3` Character — `{Safeguard} {Provoke}`): **Palace / Playing-Card Halberdiers** (*Alice in Wonderland*)
14. `card_mvrreqsj_fb440` (`3E/2AP` `2/3` Character — `{Debut}` sacrifice left neighbor for 2 damage to all enemy Characters): **Bluebeard** (*Perrault's Bluebeard*)
15. `card_mvrhqoq9_hevyn` (`3E/1AP` `EDICT • FOOD` — `+3/+3` & friendly `{Provoke}`): **"Eat Me" Cake** (*Alice in Wonderland*)
16. `card_mvrhemm3_shcv5` (`5E/1AP` `2p` `EDICT` — `**Kill** a Character.`): **`Off With His Head!`** (*Alice in Wonderland*)
17. `card_mvridm7s_tq9zo` (`4E/1AP` `EDICT` — Give friendly Character `{Ward}`, replace `{Debut}` & `{Farewell}` with `{Siege}`): **Naming the Royal Champion / Trial by Combat** (*Arthurian & Chivalric Lore*)
18. `card_mvrjkp2l_fldzs` (`4E/1AP` `FOOD` — `+2/+4` & friendly `{Farewell}` 2/4 Royal Vanguard): **Giant Banquet Surprise Pie / Cake with Guard Inside** (*Sing a Song of Sixpence* / Renaissance Banquet Lore)
19. `card_mvrjdrhq_s3zpe` (`4E/1AP` `FOOD` — two Characters get `+2/+2`): **The Fox and the Stork's Two-Dish Supper** (*Aesop's Fables*)
20. `card_mvrm8s4w_yl17w` (`4E/2AP` `4/4` Elite `QUEEN` — `{Debut}` shuffle four `{Poisoned}` `{Fate}` Apples): **Snow White's Evil Queen** (*Grimms' Snow White*)
21. `card_mvrmdayy_71u8x` (`5E/2AP` `6/6` Elite `QUEEN` — `{End of Turn}` sacrifice left neighbor for `2/4` `{Provoke}` Royal Vanguard on right): **Queen of Hearts** (*Alice in Wonderland*)
22. `card_mvrmfgsc_w8zmw` (`3E/3AP` `2p` Elite Spell — `**Kill** all Characters. {6E}: Except friendly **Queens**.`): **"Fairest of Them All"** (*Snow White*)
- **Neutral (`N`) Building** (`card_mvrkzy6k_fq4hz`, `0E/1AP` `+1E`): **Windmill**

### Locked Havenhearth (`H`) Flavor Beats & Card Names
1. `card_mvree65s_0b7nf` (`hero_active` `{1AP}` `+2/+1` temp, Animalfolk keeps it — **`Rosalind`**): **Rose-Red Woodsmaiden / Beast-Friend** (*Grimms' Snow-White and Rose-Red* — striking cottage heroine)
2. `card_mvrehrld_xsd6w` (`hero_passive` 2 allies on each side → `{Safeguard}` — **`Flynn & Basker`**): **Two Musketeers Animalfolk Duo — Fox & Hound** (*Three Musketeers* / *The Fox and the Hound*)
3. `card_mvua3z8u_lvooq` (`1E/1AP` `FOOD` — play `{1E}/{2E}` gives `+1/+1` anywhere; give `+1/+1` temp — **`Stone Soup`**): **Stone Soup** (*Classic Folk Tale*)
4. `card_mvua8iwo_9p8rl` (`1E/1AP` `2/3` vanilla `ANIMALFOLK` — **`Turnpike Tollkeep`**): **Turnpike Badger Brawler** (*Wind in the Willows* / *Redwall*)
5. `card_mvua8m73_dgs2d` (`1E/1AP` `1/1` `ANIMALFOLK` — `{Kinship}` Draw a Character — **`Barnyard Troubadour`**): **Bremen Choir-Starter** (*Town Musicians of Bremen*)
6. `card_mvuacgfm_tj74n` (`1E/1AP` `2/1` — `{Debut}` `+2/+1` temp — **`Whetsmith Apprentice`**): **Whetsmith Apprentice / Farrier** (*Village Forge Lore*)
7. `card_mvug1oqe_xmd98` (`1E/1AP` `+1E` Elite Building — `{1AP}: Heal 2. {5E}: Heal 4 instead. {7E}: Give +4 Health instead.` — **`Granny Thimble's Cottage`**): **Grandmother's Cottage / Roaring Hearth** (*Little Red* / *Snow-White & Rose-Red*)
8. `card_mvu98w44_4w32a` (`2E/1AP` `2/1` — `{Debut}` Wish `Animalfolk` Character + `Woodland Blessing` — **`Gentle Woodsman`**): **Thorn-Pulling Woodsman** (*Androcles and the Lion* / *Snow White's Huntsman*)
9. `card_mvu9z0mn_lncuu` (`2E/1AP` `3/1` `ANIMALFOLK` — `{Swift}` — **`Featherweight Lancer`**): **Dive-Bombing Swallow Lancer** (*Thumbelina's Swallow*)
10. `card_mvuag3ss_ksiou` (`2E/1AP` `+1E [2]` Building — `{1AP}: Draw a Character. {5E}: Give it a **Woodland Blessing**.` — **`Crossroads Inn`**): **Crossroads Wayside Inn** (*Canterbury Tales' Tabard Inn*)
11. `card_mvub9om9_90zba` (`2E/1AP` `1/4` — `{Debut}` add `Cureall Cookie` — **`Sweet Old Soul`**): **Plump Apothecary-Baker Granny** (*Village Herb-Granny*)
12. `card_mvuc56wm_yam76` (`2E/1AP` Spell — Deal 2 to Character; `4+` Chars do it again — **`Pots and Pans!`**): **Flying Skillets & Rolling Pins** (*Town Musicians of Bremen* cottage rout)
13. `card_mvu91ysb_n31tf` (`3E/2AP` `3/4` Elite — `{Debut}` Plant an `Apple Tree` — **`Mother Pippin`**): **Mother Holle, Orchard Matron** (*Grimms' Mother Holle*)
14. `card_mvu9ro10_lxwsc` (`3E/1AP` `FOOD` — Choose Hero, each of their Chars `+2/+1` temp — **`Harvest Banquet`**): **Harvest Barn-Raising Banquet** (*Countryside / Redwall Abbey Feast*)
15. `card_mvubeg8t_aufxf` (`3E/1AP` `4/1` `ANIMALFOLK` — `{Kinship}` `{Safeguard}` — **`Honeywood Sentry`**): **Red Squirrel Longbowman** (*Redwall* / *Woodland Sharpshooter*)
16. `card_mvubxz0x_fwouj` (`3E/1AP` `+1E [2]` Building — `{0AP}` Hero `+2/+0` temp — **`Old Chestnut Smithy`**): **Village Smithy & Weapon-Rack** (*Chestnut-Tree Forge*)
17. `card_mvu9qeuj_9159i` (`4E/1AP` `2/2` — `{Debut}` left `+2/+2`, `{Farewell}` right `+2/+2` — **`Graybeard Knight-Errant`**): **Graybeard Knight-Errant / Old Mentor** (*Don Quixote* / *Aging Paladin*)
18. `card_mvub5nrb_jr92d` (`4E/2AP` `2p` Spell — Summon six `1/1 Rabbits`, overflow `+1/+1` to Animalfolk — **`Under the Garden Gate`**): **Peter Rabbit Garden-Gate Stampede** (*The Tale of Peter Rabbit*)
19. `card_mvub7lnm_zc6eo` (`4E/2AP` `2/6` `ANIMALFOLK` — `{Provoke}`, `{Debut}` summon two `1/1 Rabbits` — **`Hedgerow Matron`**): **Stout Mama Rabbit / Hare Matriarch** (*Old Mrs. Rabbit*)
20. `card_mvubf9tu_8fzbh` (`5E/2AP` Spell — Wish for two Characters with `Woodland Blessings`, each costs `{1AP}` less — **`Gift of the Wishing Oak`**): **Heart-Oak Wishing Tree Anointing** (*Cinderella's Wishing Tree* / *Sacred Oak*)
21. `card_mvuc1r51_affx1` (`4E/2AP` Spell — Animalfolk `{Safeguard}` & each attack enemy Character — **`For Hearth and Hollow`**): **Great Woodland Muster** (*Redwall* / *Forest Uprising*)
22. `card_mvufxmei_c0d6f` (`4E/2AP` `5/4` `2p` Elite — `{Debut}` Ward, `{Debut}{Siege}` top `{1E}/{2E}` Char `+1/+1` & `{Fate}` — **`Kit Merryweather, Folk Hero`**): **Greenwood Outlaw Prince** (*Robin Hood*)
