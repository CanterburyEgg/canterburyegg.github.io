# Shop implementation plan

Source of truth for every number and name: [SHOP_PLAN.md](file:///Users/bmyersmorgan/Documents/GitHub/canterburyegg.github.io/moba/SHOP_PLAN.md). One commit per phase, after you check it.

## What the code looks like today
- **Three separate damage paths:**
  - Player hits: [dealPlayerDamageToUnit](file:///Users/bmyersmorgan/Documents/GitHub/canterburyegg.github.io/moba/js/phase1_engine.js#L2233) has the full options (`isBasic`, `src`, `aoe`), lifesteal and the old item procs.
  - Bot hits: `botActor().damage` → [applyBotDamageToTarget](file:///Users/bmyersmorgan/Documents/GitHub/canterburyegg.github.io/moba/js/phase1_engine.js#L3943) **drops those options**, so the engine can't tell a bot's basic attack from its ability.
  - Hits on the player and allied bots: [damageOrderHeroOrBot](file:///Users/bmyersmorgan/Documents/GitHub/canterburyegg.github.io/moba/js/phase1_engine.js#L3078).
- **Items only change stats.** Only the player gets procs, and bots never buy anything in a match (only the test tools hand them items).
- **Cooldowns:** each kit applies Haste once, at cast time (`ctx.cdrMult`). There's no Ultimate Haste and no way to cut a cooldown that's already running.
- **Attack speed:** each kit computes its attack timer as `spec.atkCd / (1 + st.asPct)` (9 places), with no cap.
- **Tenacity** doesn't exist.

## Phase 0: one damage pipeline (the prerequisite)
Most passives need to know who hit whom with what, for bots as well as the player, so this comes first.
- **`resolveHit(attacker, target, raw, opts)`:** every damage path routes through it, and the bot actor passes `src`, `isBasic`, `isDoT`, `aoe` and a `castId`.
  - Order: raw → attacker and target amps (Weakness, Exposed, Wither) → Resist, worked out as `max(0, Resist − shred) × (1 − pen × (1 − penResist))` → wards → shield → HP.
- **`heal(unit, amount, source)`:** one healing path that respects anti-heal and can turn overheal into a shield.
- **Hooks for passives:** `onDealHit`, `onTakeHit`, `onCast`, `onKill` / assist, `onCCApplied` / `onCCReceived`, and `tick`.
- **Tagging:** label the engine's 12 bot damage calls as Attack or Ability.
- **Check:** the existing selftest should come out the same, since nothing about the numbers changes yet.

## Phase 1: item data
- **New file `js/items.js`** with all 96 items. Each entry has an id, name, tier, line, the items it's built from, total cost, stats, and a passive with its parameters.
  - Stats are generated from the Stage 1 formulas, not hand-typed, so there are no typos.
- **Remove the old placeholders:** this replaces `SHOP_ITEMS` and deletes the old item stats (`cleaveProc`, `slowOnHit`, `executeAmp`, `spellAmp`, `allyAuraRes`) along with their engine code.

## Phase 2: new stats
- **New stat keys:** `onHit`, `penResist`, `ultHaste`, `tenacity`, plus the existing regen, lifesteal and spell vamp for the doubles.
- **Attack speed cap:** a shared `KitFx.atkInterval(actor)` replaces the 9 per-kit formulas.
  - Stat attack speed caps at 2.5 attacks per second.
  - Passive attack speed is added on top as a % of the hero's base rate, up to 3.5.
- **Tenacity:** applied in `CC.apply`. Several sources multiply together.
- **Ultimate Haste:** one line per kit, so the R cooldown uses its own multiplier (8 kits).
- **`KitFx.reduceCooldowns(actor, { seconds | pct, ult })`:** cuts cooldowns that are already running. Reset, Essence, Battle rhythm and Shrug off use it.

## Phase 3: the 56 passives
- **New file `js/item_passives.js`:** a list of passives keyed by id, with per-unit state, built on the Phase 0 hooks.
- **Built in the same 6 batches as the design,** committed batch by batch.
- **New `?itemtest` harness:** frame-exact and headless. Each passive gets its own assertions, for example "Retort stores 25% of blocked damage, capped at 60 + Resist."

## Phase 4: tiered shop
- **Layout:** a tree view of components → tier 2 → epics, plus a row for boots. Tooltips show the passive text.
- **Recipe pricing:** the price is the total minus the parts you already own.
- **Buying rules:** 4 slots. Each tier-2 item is unique and you can own only one epic per line; items that break a rule are greyed out with the reason.
- **Attack speed display:** shows "(max)" when stat attack speed is capped.
- **Only at the fountain,** as today.

## Phase 5: bot buying
- **Build orders:** 2 or 3 per lean, picked at random. Bots buy when they're at the fountain and have the gold (they already earn it).
- **Bot passives:** they work automatically through the Phase 0 pipeline.

## Phase 6: tests and balance
- **New test builds:** at Lv6, a tier-2 item, boots and a component. At Lv12, boots and 3 epics, for each lean.
- **Tests:**
  - You rerun the selftest and save a new baseline (expect differences once the items change).
  - I run the Lv6 and Lv12 profile and duel tools, compare the results against the damage budget, and save the reports.

> [!WARNING]
> Phase 0 is the risky one: it touches every hit in the game. I'll keep it a pure refactor (no number changes) so the selftest can prove it didn't break anything.

## Decisions (2026-11-18)
1. **Selling:** yes, 70% refund. While you're still at the fountain, an **Undo** button reverses your last purchases, working the same as selling at the fountain (full refund for items bought this visit).
2. **Tenacity:** shortens every CC **including slows**; knock-ups excluded.
3. **Slots:** components and tier-2 items take a slot (4 total).
4. **Bots:** buy items in real matches, and their passives work.
