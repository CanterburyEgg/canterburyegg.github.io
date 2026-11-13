# Hero-kit restructure: progress & deferred fixes

Merged into `main` (2026-11-08). Verification: `arena3d.html?selftest` must match
[tests/selftest_baseline.txt](tests/selftest_baseline.txt) after every restructure step.

## Phase 1 progress (move each hero into `js/heroes/<id>.js`, verbatim)
- [x] Step 0: selftest + baseline; mana-cost bug fixed (rebaselined)
- [x] Step 1: removed v1/v2 dev tools; split `arena3d.html` script into `js/arena/*.js`
- [x] Panther
- [x] Bodyguard
- [x] Brawler (+ gameplay changes: Pit traps her inside / recast R drops it; always-alternating hooks)
- [x] Sorceress
- [x] Coyote (+ gameplay change: Heartseeker charge scales damage/range; full charge = Perfect Shot)
- **Phase 1 complete.** Next: Phase 2 (bots use the real hero kits), then Fairy & Scientist.

## Deferred fixes (found during the move; kept verbatim so the selftest stays identical)
- **Bodyguard GUARD tag/pip never shows**: HUD reads `st.bgStacks` but `getPlayerStats()` returns `guardStacks`.
- **Hero-specific rules still inside `phase1_engine.js`** (move into kits in Phase 2): Panther Shadow Stalker speed +
  10L Apex Reset; Bodyguard guard stacks + 10L Thorns of Brass; Coyote bleed talents; Sorceress Soul Siphon.
- **Brawler Footwork Siphon** dummy tracking, arena zone lifetime/projectile blocking and arena damage amp still live in
  shared `loop.js` / `combat.js`.
- **Bundle size**: brawler/coyote/sorceress `*_bundle.js` still embed the old v1 models (now unused) - strip to
  cut load time.
- `updateSlotPills` dev-toolbar labels still special-case Coyote/Sorceress.

## To-do list (as of 2026-11-08)
- [ ] **Model check + Mixamo packaging**: Fairy, Saw Scientist, Cannon Imp, siege cannon, Treefolk (reserve hero #9).
  Check each against its concept, then decimate and export `*_for_mixamo.zip`. Props (saw gun, wrench, cannon): size/orientation check only.
- [ ] **Map style session**: layout concept = castle base on a plateau, castle-bridge top lane over a gorge, sloped woods
  jungle, valley bottom lane. Gentle cosmetic elevation via one `groundHeight(x, z)` function. Boss in the gorge beside
  the bridge (true "under the bridge" would need a two-layer system; deferred).
- [ ] **Shop overhaul** (new stat model: Attack / Ability / single Resist; see DESIGN_RULES.md). Three tiers:
  1. **Basic items:** one per stat (+Attack Speed, +Attack, +Ability Power, +Resist, +HP, etc.).
  2. **Combined items:** take two basic items and combine them into one, upgrading the amount of each stat.
  3. **Specialty items:** each combined item branches into **two specialty variants** with different use cases
     (basic → combined → branching specialty). Each specialty gives **at least** the two stats of its combined item.
- [x] **Asset housekeeping** (2026-11-09): layout is `assets/<id>/<id>_{concept.png,texture.jpg,preview.jpg,bundle.js}`,
  `mixamo/*.fbx`, `props/`. IDs: `guardian`→`bodyguard`, `cannon`→`imp`. v1 assets deleted. `.glb/.zip/.fbx` under
  assets are git-ignored (on disk only; the game only loads `<id>_bundle.js`).
- [ ] **Talent pass**: all 8 heroes, level by level (see DESIGN_RULES.md).
- [ ] **Stat model (Attack / Ability / Resist, DESIGN_RULES.md §2)**: plan in three steps.
  - [x] Step 1: balance tools on the current model. `computeUnitStats` (one stat function for the player, bots and
    tools), test builds (`DATA.testBuildItems`), **Damage Profile** (`?profile[=hero]&levels=1,6,12&build=..&resist=40`,
    js/profile.js) and **Duel Arena** (`?duel=a,b | all | support&level=6&trials=6&build=..`, js/duel.js). Add
    `&norender` for headless runs. Baselines in `balance/2026-11-12_*`.
  - [x] **Stat list agreed (2026-11-13)**: see DESIGN_RULES.md §2 "Stat list and shop structure".
  - [ ] Step 2: switch to the new model, hero by hero, with before/after tool runs.
    - [x] 2a engine (2026-11-13): `computeUnitStats` returns attack / ability / resist / haste / hpRegen / lifesteal /
      spellVamp (old names kept as aliases: atk, fant, armor = fResist = resist, cdr from Haste). One `unitResist()`
      for every mitigation; damage is Attack if `opts.src === 'attack'` or `isBasic`, else Ability (Spell Amp and Spell
      Vamp apply to Ability damage; `opts.aoe` heals at 1/3). Bots get base HP regen. Old specs' armor/fResist average
      into one Resist. Placeholder items converted (15% CDR = 18 Haste). HUD shows ATK / ABL / RES.
    - [ ] 2b heroes, 2-3 at a time: spec to baseAttack / baseAbility / baseResist (+ growth, hpRegen, asGrow), every
      formula to the scaling rules (abilities = base + Ability ratio; basics and "counts as basic" = Attack), tag damage
      with `src`, bot casts use Haste, tooltips updated. Then the aliases go.
  - [ ] Step 3: tuning against the time-to-kill targets (includes the Scientist saw and Panther Q outliers, and the
    Imp bot's turret play).
- [ ] **Phase 2**: bots use the real hero kits, then implement the new kits from DESIGN_RULES.md.
  - Pattern (2026-11-11): kits take an **actor** (`KitFx.player` or `phase1Engine.botActor(bot)`, see kit_helpers.js).
    `cast(slot, ctx)` → `castFor(actor, slot, ctx?)`, basic attack → `basicAttackFor(actor, st)`, per-caster timers →
    `tickActor(actor, dt)`. Bot-owned projectiles carry `owner` and hit `owner.hostiles()` via `owner.damage()`.
    The bot brain (engine) only picks the ability + aim (`b.aimTarget`), then calls the kit. `KIT_BOTS` in the engine
    lists converted heroes; the rest keep their old bot code until converted.
  - [x] Coyote (player selftest rows identical; bots now use the player formulas, so they hit harder than the old bot copy)
  - [x] Brawler (bots: Q fires the kick at once, E has its own dash collision, R uses the engine's bot Pit Arena)
  - [x] Sorceress (bots: E dashes away from close threats or sidesteps, then the real homing bolts; R = engine bot monolith, collapse only with 10L)
  - [x] Bodyguard (bots: Q haymaker knockback + LMB resolve in tickActor; E = engine leap with the kit's landing slam; R taunt = half-length stun on the player)
  - [x] Panther (bots: Slash -> Gnash + LMB resolve in tickActor; E = engine leap with the kit's pounce + marks; R = 6s stealth like the player)
  - [x] Fairy (new brain: Lullaby on a crowd, hop away when hurt / onto a weak hero, Pop! at her target; bot visuals via
    kit.botVisual on bot.bones; bots now get their own kit's clipTweaks + pose overlays)
  - [x] Scientist (new brain: saw on within ~2.6m of a camp/hero edge and off when nobody's in reach (6s cap), injection when
    hurt, blade at a hero 4-10m away; saw gun prop on bots; kit.botSpeedMult / botHide hooks)
  - [x] Imp (new brain: plant the turret when a hero is within 9m or a wave of 3+ minions is near; rocket jump / hop home
    when hurt; hop onto a weak hero when unburdened; Superball when it lines up 2+ heroes or the target is under 45%.
    Pick-up / salvage happen automatically in tickActor once nothing hostile is within 9m of the turret (or when fleeing);
    with nothing to fight the bot walks back to its turret (`botGoal`). Bot turrets are team-tagged deployables
    (minions, towers, bots and the player all target the other team's), fog-hidden for Chaos. Engine hooks added:
    `botGoal`, `botLocomotion`, `botCleanup`, `b.leapHeight`; KitFx placeAtBone / curlHand / seatInFist take a bot's bones)
  - [ ] Numbers pass: Scientist saw feels like it does almost no damage (~60 dps at Lv1 through armor) - player and bot alike
  - [ ] Investigate: brief hitch when a bot Fairy died (first-time shader compile of wings/dust materials?)
  - [x] Delete the old bot-only ability copies (spawnBotCrossbowBolt, spawnBotAstralBolt, launchBotShrapnelGrenade,
    spawnBotStarfallPillar, playBotAction/scheduleBotHit + the per-hero basic-attack fallbacks). Kept: the bot Monolith and
    Pit Arena (the Sorceress/Brawler kits call them through the bot actor) and `__kitBotLog` (cheap; `&botlog` uses it)
  - Dev: `?chaoscarry=<hero>` swaps the enemy carry; `&simfast&botlog=N` runs a fast headless sim and logs bot kit casts.
- [ ] **Stun indicator (noted 2026-11-12)**: a small overhead effect while a unit is stunned (spinning stars circling the
  head), on the player, bots, minions and camps. Later, matching icons for the other CC types (sleep Zzz, fear, silence).
- [ ] **Positional sound (noted 2026-11-12, low priority)**: SFX play at full volume wherever they happen on the map.
  Give `SFX.play` an optional world position: fade with distance from the camera focus (silent off-screen / in fog),
  maybe pan left/right by screen side.
- [x] **Camera unlock (2026-11-12)**: Y toggles the lock; unlocked pans when the mouse is at the screen edge, hold
  Space to snap back onto the hero (`camLocked` / `camFocus` in core.js, camera block in loop.js).
- [ ] **See-through walls (pinned 2026-11-10)**: when the player (or something they need to see) is behind a wall, tree
  or other tall map piece from the camera's point of view, fade that piece out so you can always see yourself.
- [ ] **Spyglass prop**: replace the code-built stand-in on the lookout deck with a real model (next model batch).
- [ ] **Pit guardian (Behemoth) rig**: four-legged, so Mixamo can't rig it; check for an auto-rigger that handles quadrupeds, else rig it in code.
- [ ] **Fog of war darkening (pinned 2026-11-11)**: darken the ground/map in areas the player's team can't currently see
  (the engine already answers "is this point visible" for hiding enemies; drive a dark overlay from the same vision).
- [ ] **Imp turret health (noted 2026-11-11)**: the planted cannon has no HP or health bar yet, so enemies can't hit it.
  Give it HP plus an overhead bar, make it targetable by bots, minions and towers, and when it's destroyed the Imp has
  to salvage the scrap to get his cannon back (DESIGN_RULES.md). Wrench hits repair it.

## Model batch 2026-11-12 (done: textured and in game)
Trees, moss golem, boar, thorn wolf and glimmer wisp are in `assets/map/jungle_bundle.js` (trees reduced to about 30k
triangles each with `glb_decimate.py`). New Glimmer Wisp camp per side at (±16, 30). Camp monsters move in code only
(breathing, trot bob, attack lunge); their legs don't move yet.
- [ ] **Golem:** Mixamo rig (user, 2026-11-13), then idle / walk / attack clips like the minions.
- [ ] **Quadruped rig (wolf, boar, later the Behemoth):** Mixamo can't do four legs. Options: a quadruped auto-rigger,
  or a code rig: auto-skin the mesh to a simple skeleton (spine, 4 legs × 2 bones, head, tail) with a script, then
  a procedural gait in code.
- [ ] **Camp redesign (noted 2026-11-13)**: camps become groups of monsters (the engine has one unit per camp today).
  Four camps per side: **Golems** (one big + one small), **Boar + Wolf** together, **Wisps** (a family of 4 small + 1 big),
  and a new **buff camp** (added after the other three).
- [ ] **Facing / look pass** during the jungle visual overhaul (which way each model faces, tree size vs. sight lines;
  trees are candidates for the see-through-walls trick).
- Tripo props (separate from the Hunyuan credits): spyglass, then ballista / minion weapons.
