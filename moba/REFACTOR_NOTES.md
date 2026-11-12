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
  - [ ] Imp
  - [ ] Numbers pass: Scientist saw feels like it does almost no damage (~60 dps at Lv1 through armor) - player and bot alike
  - [ ] Investigate: brief hitch when a bot Fairy died (first-time shader compile of wings/dust materials?)
  - [ ] Delete the old bot-only ability copies (spawnBotCrossbowBolt, launchBotShrapnelGrenade, ...) once all 8 are on kits
  - Dev: `?chaoscarry=<hero>` swaps the enemy carry; `&simfast&botlog=N` runs a fast headless sim and logs bot kit casts.
- [ ] **See-through walls (pinned 2026-11-10)**: when the player (or something they need to see) is behind a wall, tree
  or other tall map piece from the camera's point of view, fade that piece out so you can always see yourself.
- [ ] **Spyglass prop**: replace the code-built stand-in on the lookout deck with a real model (next model batch).
- [ ] **Pit guardian (Behemoth) rig**: four-legged, so Mixamo can't rig it; check for an auto-rigger that handles quadrupeds, else rig it in code.
- [ ] **Fog of war darkening (pinned 2026-11-11)**: darken the ground/map in areas the player's team can't currently see
  (the engine already answers "is this point visible" for hiding enemies; drive a dark overlay from the same vision).
- [ ] **Imp turret health (noted 2026-11-11)**: the planted cannon has no HP or health bar yet, so enemies can't hit it.
  Give it HP plus an overhead bar, make it targetable by bots, minions and towers, and when it's destroyed the Imp has
  to salvage the scrap to get his cannon back (DESIGN_RULES.md). Wrench hits repair it.

## Next model batch (5 Hunyuan credits, planned 2026-11-11)
Jungle camps are still primitive stand-ins and they're everywhere, so they're the biggest visual gap.
1. **Moss golem** (humanoid, so Mixamo rigs it as usual)
2. **Signature jungle tree** (static; replaces the blob trees, the jungle's main look)
3. **Thorn-wolf** (four-legged)
4. **Boar** (four-legged)
5. **Spare**: a redo if one comes out badly, otherwise a second tree or rock variant
Wolf and boar are four-legged like the Behemoth, so one quadruped rig solution (auto-rigger or code rig) covers all three.
Tripo props (separate from the Hunyuan credits): spyglass, then ballista / minion weapons.
