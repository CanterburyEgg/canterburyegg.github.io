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
  - **Hero HP**: `25`
  - **Deck Size**: `25` cards (`2x` standard copy limit / `1x` elite copy limit).
  - **Hand Flow**: `+1` card drawn per turn; **no** baseline `1 AP: Draw` system action (card draw/generation comes strictly from cards, Hero abilities, and Infrastructure). Starting hand / mulligan values to be tuned by user.

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
  - **Frame Badges**: `+Energy` provided sits bottom-left; optional Charge Counter sits bottom-right (matching Character Health position). Spending a Building's charge counter(s) on its activated ability does **not** destroy the Building when charges reach `0`—the ability simply can no longer be activated, while the Building remains in play providing its `+Energy`.
- **6 Character Slots** (Central Combat Row):
  - Houses combat units with left-to-right adjacency and persistent damage.
  - **No Default Haste (Summoning Sickness)**: Characters cannot attack on the turn they enter play unless they have a specific keyword or effect allowing them to do so.
  - **No Overwrite**: At `6/6` Characters, you cannot play new Characters until a slot opens (*Hearthstone* style).
- **Turn & Combat Flow (`Main 1 → Combat Window → Main 2`)**:
  - **Main Phase 1**: Spend `AP` freely on Characters, Buildings, Spells, and Abilities.
  - **Combat Step (Once per turn)**: Sequential **Attacker's Choice** combat—attack one-by-one in any order with ready Characters (Characters that did not enter play this turn, unless granted haste/rush by a keyword) and your Hero (whenever your Hero has `>0` Attack) at `0 AP` per attack against enemy Characters or the `25 HP` Enemy Hero. No `AP` plays/spells may be interleaved mid-combat; once you exit Combat into Main Phase 2, no further attacks can be declared that turn (unless an effect grants an extra Combat Step).
  - **Main Phase 2**: Spend any remaining `AP` after combat (e.g., deploying Characters into newly freed `6/6` slots or triggering post-combat synergy), then End Turn.
- **Core Card Types & Functional Tiers**:
  - Types: `Character`, `Building`, `Spell`, `Hero Active`, `Hero Passive` (inferred visually by card silhouette/boxes; no bottom card-type text tag, optional bottom Subtype plaque only when Subtype is set).
  - Copy Tiers: `Standard (2x)`, `Elite (1x)` (communicated visually via bespoke per-faction sculpted frame crowns), `Token (Non-Collectible)`.
  - Core Trigger Keywords (with inline rules-text bubbles): **`Debut`** (`{Debut}` — on-play from hand / "Battlecry" equivalent), **`Farewell`** (`{Farewell}` — on-destroyed / "Deathrattle" equivalent), **`Start of Turn`** (`{Start of Turn}`), **`End of Turn`** (`{End of Turn}`), and **`Siege`** (`{Siege}` — triggers when this Character attacks).
  - User-Designed Set 1 Mechanics:
    - **`Poisoned`**: Healing or pump spells that reverse their effects on opponents (e.g., `+3/+3` becomes `-3/-3`, `Heal 2` becomes `2 damage`), while still working normally on friendly targets.
    - **`Safeguard`**: `"This Character takes no damage when attacking another Character."`
    - **`Devotee`**: Trigger keyword that fires the **first time each turn** you play a Character with a higher Energy requirement than this card (capped at once per turn).
    - **`Provoke`**: Positional blocker keyword — enemy Characters cannot attack your Hero, or allies without **`Provoke`** adjacent to this Character (shields your Hero + immediate left/right neighbors on the `6`-slot row).
    - **`Ward`**: Stackable noun barrier (`"a {Ward}"` / `"{Wards}"`) — each **`Ward`** prevents the next single instance of damage that would be dealt to that Character or Hero, then breaks (multiple **`Wards`** stack!).
    - **`Fate`**: Card modifier — a card given **`Fate`** loses its `AP` cost (`0 AP`) and gains `"When played: Draw a card."`
    - **`Wish`**: Curated `1-of-3` card generation from outside your deck (*Discover* equivalent).
    - **Templating & Token Conventions**:
      - Rules text refers to your Hero directly as `"you"` / `"yourself"` (e.g., `"You take 3 damage"`, `"Give yourself or a friendly Character..."`), and uses `**Kill**` for unconditional destruction.
      - **`Play`** is used intentionally even when effects create/deploy tokens onto the board (e.g., `"{Farewell}: Play a 2/4 Royal Vanguard"`), and counts as playing a Character for `{Devotee}` checks.
      - **Tokens** are standardized at **`1E`** (`energyReq: 1`) by default (which also neatly prevents `1E` tokens from triggering `1E` `{Devotee}` units!).
      - Card titles wrapped in quotes (`"..."`) in `cards.json` indicate working flavor-beat placeholders awaiting final names.
      - **Card Naming Conventions**:
        - Cards are **loosely inspired** by fairy tales, folklore, and faction worldbuilding (e.g., *Red Velvet Court*) rather than strictly literal 1:1 public-domain names.
        - **Heroes**: Use a clean **Character Name** without an epithet (e.g., *King Valen*, *Belladonna*).
        - **`1x` Elite Characters**: Use **Character Name + Epithet** (unless the title itself is already uniquely iconic/elite, such as *"The Queen of Hearts"*).
        - **`2x` Standard Characters**: Use **indefinite role/trope titles** so controlling two copies on the board feels natural.
  - Project Folder: `/storybook/` (Card Builder at `/storybook/card-builder.html`, canonical data at `/storybook/cards.json`).

## Set 1 — Storybook / Fable Factions (LOCKED)
1. **Red Velvet Court (`R` — Deep Crimson / Burgundy)** *(Palace / Regal Tyranny)*: Evil queens, vain kings, wicked stepmothers, loyal guards/footmen, royal executioners, magic mirrors, decrees, palace intrigue.
2. **Havenhearth (`H` — Warm Amber / Gold)** *(Village & Road / Heroic Folk)*: Plucky folk, waistcoat-wearing talking critters, cottages, bakers, huntsmen, valiant tailors, gallant knights-errant.
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
- **Locked Game Art Style — Mignola / Dark Horse Ink & Gouache Wash**: All card art uses the expressive **Mike Mignola (*Hellboy*) / *Darkest Dungeon*** graphic novel ink aesthetic exemplified by `archive/art-belladonna-style9-mignola-ink.jpg`: heavy, organic brush-and-ink linework, massive pooled chiaroscuro black-ink shadows, gritty angular crosshatching, and rich, moody watercolor/gouache washes (never thin, flat, clean-lined modern comic-book coloring).
- **Character Age Diversity**: Characters across the game must span a wide, authentic range of ages (weathered elders, matronly/middle-aged schemers, grizzled veterans, crone witches, children/pages, young nobles)—do NOT default every character in the world to the same 20-something age bracket.
- **Before presenting ANY newly generated card illustration to the user**, you MUST inspect it via `read_file` and audit it against the North Star standards. **If it fails any check below, do NOT show it to the user—immediately send it back to the image generator with targeted corrections until it passes**:
  1. **Brushwork, Ink & Shadow Weight**: Must feature bold, organic brush-and-ink contours, deep pooled black-ink shadows, gritty crosshatching, and textured gouache/watercolor washes matching `archive/art-belladonna-style9-mignola-ink.jpg`. Reject smooth airbrushed skin gradients, thin uniform digital lineart, fake glowing rim-light halos, and overworked micro-filigree noodles.
  2. **Pose, Camera & Character Acting (NO "Selfie Stare" / Generic AI Face)**: Characters must have a dynamic, asymmetric posture or head tilt and genuine theatrical acting—often absorbed in their action (looking at what they are doing) rather than standing level-headed smiling politely at the camera like a modern Instagram portrait. Female characters should be strikingly beautiful/hot (`deep cleavage` where appropriate) without defaulting to the "Generic AI Woman" face or uncanny doll proportions.
  3. **Physical & Narrative Logic**: Verify eye direction, hand-to-prop alignment, shadows, and physical storytelling (no fake neon poison auras—use physical syrupy glaze/liquids; no readable gibberish AI text; no duplicate shadows; no closed scrolls while stamping).
  4. **Faction Identity & Frame Headroom**: Ensure the costume/environment belongs to the card's Faction (e.g., aristocratic dark court decadence for `R`, not cozy peasant cottages) and that the subject has proper headroom/margins for its specific card window (Oval + Elite Crown, Circular Hero Medallion, Spell Archway, or Building Window).
3. `card_mvrhmr5k_zdo17` (`1E/0AP` `EDICT` — Wish `{2E}` Character w/ `{Devotee} +1/+1`): **Bestowing a Court Title** (*Puss in Boots* / *Brave Little Tailor*)
4. `card_mvrr6xhe_863ug` (`1E/1AP` `FOOD` — `{Fate}` with Queen, Heal 2 from a Hero): **Turkish Delight** (*The Snow Queen* / *Narnia*)
5. `card_mvrlon9p_9f5ec` (`1E/1AP` `2/2` Character — `{Devotee} +1/+1`): **Trumpet-Bearing Royal Herald** (*Cinderella* / *Sleeping Beauty*)
6. `card_mvrlp86k_0zurb` (`1E/1AP` `1/1` Character — `{Farewell} Draw a card`): **White Rabbit / Frantic Court Courier** (*Alice in Wonderland*)
7. `card_mvrhepzb_uh9ml` (`2E/1AP` `EDICT` — Draw 2, take 2 damage unless Queen): **Royal Tax Levy** (*Robin Hood* / *Rumpelstiltskin*)
8. `card_mvrjs6yo_7ityt` (`2E/1AP` `1/3` Character — `{Debut} {Devotee}` Humble Pie): **Royal Pie-Baker** (*Sing a Song of Sixpence*)
9. `card_mvrn0r4k_xbj7d` (`2E/1AP` `2/3` Character — `{Devotee}` `{0AP}` Hero Power): **Scheming Lady-in-Waiting** (*Snow White* / *Sleeping Beauty*)
10. `card_mvrrbe1g_th6hb` (`2E/1AP` `+1E` Building — `{Devotee} Heal 2`): **Painted Rose-Garden** (*Alice in Wonderland*)
11. `card_mvrl4zqm_2es2l` (`2E/1AP` `+1E [1]` Building — `{5E}{2AP}` copy friendly Character): **Magic Mirror** (*Snow White*)
12. `card_mvrltf84_63deu` (`2E/2AP` `2/2` Standard `QUEEN` — `{Debut}` Wish for Food, one `{Poisoned}`): **Ogress Queen-Mother** (*Perrault's Sleeping Beauty*)
13. `card_mvrlqoga_r4xfg` (`3E/1AP` `3/3` Character — `{Safeguard} {Provoke}`): **Palace / Playing-Card Halberdiers** (*Alice in Wonderland*)
14. `card_mvrreqsj_fb440` (`3E/1AP` `4/3` Character — `{Siege}` sacrifice left neighbor for 2 damage): **Bluebeard** (*Perrault's Bluebeard*)
15. `card_mvrhqoq9_hevyn` (`3E/1AP` `EDICT • FOOD` — `+3/+3` & friendly `{Provoke}`): **"Eat Me" Cake** (*Alice in Wonderland*)
16. `card_mvrhemm3_shcv5` (`3E/2AP` `2p` `EDICT` — `**Kill** a Character`): **`Off With His Head!`** (*Alice in Wonderland*)
17. `card_mvridm7s_tq9zo` (`4E/1AP` `EDICT` — `+4/+0` this turn & `{Ward}`): **Naming the Royal Champion / Trial by Combat** (*Arthurian & Chivalric Lore*)
18. `card_mvrjkp2l_fldzs` (`4E/1AP` `FOOD` — `+2/+4` & friendly `{Farewell}` 2/4 Royal Vanguard): **Giant Banquet Surprise Pie / Cake with Guard Inside** (*Sing a Song of Sixpence* / Renaissance Banquet Lore)
19. `card_mvrjdrhq_s3zpe` (`4E/1AP` `FOOD` — two Characters get `+2/+2`): **The Fox and the Stork's Two-Dish Supper** (*Aesop's Fables*)
20. `card_mvrm8s4w_yl17w` (`4E/2AP` `4/4` Elite `QUEEN` — `{Debut}` shuffle four `{Poisoned}` `{Fate}` Apples): **Snow White's Evil Queen** (*Grimms' Snow White*)
21. `card_mvrmdayy_71u8x` (`5E/2AP` `6/6` Elite `QUEEN` — `{End of Turn}` sacrifice left neighbor for `2/4` `{Provoke}` Royal Vanguard on right): **Queen of Hearts** (*Alice in Wonderland*)
22. `card_mvrmfgsc_w8zmw` (`5E/3AP` `2p` Elite Spell — Choose a friendly Queen, Kill all other Characters): **"Fairest of Them All"** (*Snow White*)
- **Neutral (`N`) Building** (`card_mvrkzy6k_fq4hz`, `0E/1AP` `+1E`): **Windmill**
