// Phase 1: 3D 4v4 MOBA Map, Structures, Talents & Passive/Proc Item Shop Data
// Works over file:// and http:// with zero build step.
window.MOBA_PHASE1 = (function () {
  // Map layout lives in js/map_layout.js (window.MOBA_MAP); this file just re-exports it for the engine.
  const MAP = window.MOBA_MAP;
  const MAP_W = MAP.W;
  const MAP_H = MAP.H;
  const LANE_WAYPOINTS = MAP.LANE_WAYPOINTS;
  const buildInitialStructures = MAP.buildInitialStructures;
  const buildJungleCamps = MAP.buildJungleCamps;

  // LOS-blocking trees & pillars, plus wall collision circles (castle walls & hollow cliffs block sight; bridge rails don't)
  function buildMapObstacles() {
    const obs = MAP.buildMapObstacles();
    MAP.WALLS.forEach((w) => {
      MAP.wallCircles(w).forEach((c) => {
        if (w.kind === 'rail') c.noLos = true;
        c.wallKind = w.kind;
        obs.push(c);
      });
    });
    return obs;
  }

  // Level 1..12 XP Thresholds (Cumulative XP; Talents at Lv 3/7/10; Q/E ranks at Lv 1/6/9; Ult ranks at Lv 4/8/12)
  const LEVEL_XP = [0, 0, 220, 500, 860, 1300, 1840, 2480, 3220, 4080, 5060, 6160, 7400];

  // Binary Left/Right Talents at Levels 3, 7, and 10 (All 5 Playable 3D Heroes)
  const HERO_TALENTS = {
  };

  // Base Stats, Growth & Mana Costs for All 5 Playable 3D Heroes
  const HERO_SPECS = {
  };

  // Shop items: js/items.js (window.MOBA_ITEMS; SHOP_PLAN.md) — 7 components, 28 tier-2 items, 56 epics, 5 boots
  const SHOP_ITEMS = window.MOBA_ITEMS.items;

  // ---- Test builds for the balance tools (?profile / ?duel) ----
  // What each damage lean could afford at a level (about 0 / 2,500 / 9,000 gold at Lv1 / 6 / 12, 4 slots):
  // Lv6 = a tier-2 item + tier-2 boots + a component; Lv12 = 3 epics (one per line) + tier-2 boots.
  const HERO_LEAN = {
    coyote: 'attack', brawler: 'attack', imp: 'attack',
    sorceress: 'ability', fairy: 'support', scientist: 'ability',
    panther: 'hybrid', bodyguard: 'tank'
  };
  const TEST_BUILDS = {
    attack:  { 1: [], 6: ['bloodletters_knife', 'fencers_slippers', 'kestrel_feather'], 12: ['misericorde', 'whirling_glaive', 'hornets_nest', 'fencers_slippers'] },
    ability: { 1: [], 6: ['arcane_journal', 'monks_sandals', 'inkwell'], 12: ['magnum_opus', 'supernova', 'tuning_fork', 'monks_sandals'] },
    hybrid:  { 1: [], 6: ['sigiled_saber', 'fencers_slippers', 'hatchet'], 12: ['twin_scales', 'tempered_edge', 'hex_needle', 'fencers_slippers'] },
    tank:    { 1: [], 6: ['quilted_gambeson', 'insulated_sabatons', 'garnet_brooch'], 12: ['chameleon_hide', 'old_grizzlys_hide', 'tortoise_shell', 'insulated_sabatons'] },
    support: { 1: [], 6: ['amber_phial', 'monks_sandals', 'dewdrop_vial'], 12: ['wellspring', 'temple_censer', 'calm_waters', 'monks_sandals'] }
  };
  // Item objects for a hero's test build at a level ('none' = no items; a lean name overrides the hero's own lean).
  // Uses the nearest defined level at or below the requested one.
  function testBuildItems(heroId, level, build) {
    if (build === 'none') return [];
    const lean = (build && build !== 'standard' && TEST_BUILDS[build]) ? build : (HERO_LEAN[heroId] || 'attack');
    const byLvl = TEST_BUILDS[lean];
    const lv = Object.keys(byLvl).map(Number).filter((k) => k <= (level || 1)).sort((a, b) => b - a)[0] || 1;
    return byLvl[lv].map((id) => SHOP_ITEMS.find((it) => it.id === id)).filter(Boolean);
  }

  // Heroes migrated to js/heroes/<id>.js register their own stats & talents (loaded before this file)
  Object.values(window.MOBA_HEROES || {}).forEach((k) => {
    if (k.spec) HERO_SPECS[k.id] = k.spec;
    if (k.talents) HERO_TALENTS[k.id] = k.talents;
  });

  return {
    MAP_W,
    MAP_H,
    LANE_WAYPOINTS,
    buildInitialStructures,
    buildJungleCamps,
    buildMapObstacles,
    LEVEL_XP,
    HERO_TALENTS,
    HERO_SPECS,
    SHOP_ITEMS,
    HERO_LEAN,
    TEST_BUILDS,
    testBuildItems
  };
})();
