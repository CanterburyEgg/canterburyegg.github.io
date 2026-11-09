# Hero-kit restructure: progress & deferred fixes

Branch: `moba-hero-kits` (local only, not pushed). Verification: `arena3d.html?selftest` must match
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
- **Bundle size**: brawler/coyote/sorceress `*_mixamo_bundle.js` still embed the old v1 models (now unused) - strip to
  cut load time.
- `updateSlotPills` dev-toolbar labels still special-case Coyote/Sorceress.
