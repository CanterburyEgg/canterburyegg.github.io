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

  // 4-Slot Base Shop Items (Physical, Fantasy, Mana & Tank Support — Zero Active Keys!)
  // Placeholder items converted straight to the new stats (atk -> attack, fant -> ability, armor/fResist -> resist,
  // 15% CDR -> 18 Haste) until the shop overhaul (DESIGN_RULES.md §2 'Stat list and shop structure').
  const SHOP_ITEMS = [
    {
      id: 'boots_swift',
      name: 'Desert Strider Boots',
      cost: 450,
      stats: { spdPct: 0.12, maxHp: 120 },
      desc: '+12% Move Speed, +120 Max HP'
    },
    {
      id: 'serrated_dirk',
      name: 'Serrated Brass Dirk',
      cost: 550,
      stats: { attack: 24, asPct: 0.12 },
      desc: '+24 Attack, +12% Attack Speed'
    },
    {
      id: 'astral_tome',
      name: "Starweaver's Codex",
      cost: 550,
      stats: { ability: 34, maxMp: 180, mpRegen: 4.0 },
      desc: '+34 Ability, +180 Max Mana, +4 MP/s Regen'
    },
    {
      id: 'vamp_fang',
      name: 'Crimson Leech Fang',
      cost: 650,
      stats: { attack: 22, lifesteal: 0.14, spellVamp: 0.07 },
      desc: '+22 Attack, +14% Lifesteal, +7% Spell Vamp'
    },
    {
      id: 'coliseum_plate',
      name: 'Coliseum Iron Greaves',
      cost: 650,
      stats: { maxHp: 340, resist: 22 },
      desc: '+340 Max HP, +22 Resist'
    },
    {
      id: 'aegis_cloak',
      name: 'Spellbreaker Mantle',
      cost: 700,
      stats: { maxHp: 320, resist: 32, allyAuraRes: 12 },
      desc: '+320 HP, +32 Resist • Aura: Nearby allies gain +12 Resist'
    },
    {
      id: 'mana_pendant',
      name: 'Soulstone Chalice',
      cost: 750,
      stats: { ability: 42, maxMp: 220, haste: 18, mpRegen: 5.0 },
      desc: '+42 Ability, +220 Max Mana, +18 Haste'
    },
    {
      id: 'repeating_spring',
      name: 'Clockwork Crank-Spring',
      cost: 800,
      stats: { attack: 26, asPct: 0.25, haste: 18 },
      desc: '+26 Attack, +25% Attack Speed, +18 Haste'
    },
    {
      id: 'frost_bolter',
      name: 'Frostbite Broadheads',
      cost: 900,
      stats: { attack: 32, maxHp: 220, slowOnHit: 0.22 },
      desc: '+32 Attack, +220 HP • Passive: Basic Attacks slow by 22% for 1.5s'
    },
    {
      id: 'titan_gauntlet',
      name: "Pit Champion's Cestus",
      cost: 950,
      stats: { attack: 35, maxHp: 380, cleaveProc: 75 },
      desc: '+35 Attack, +380 HP • Passive: Attacks shockwave 2.4m for +75 damage'
    },
    {
      id: 'cataclysm_crown',
      name: 'Crown of the Astral Archon',
      cost: 1100,
      stats: { ability: 68, maxHp: 240, spellAmp: 0.18 },
      desc: '+68 Ability, +240 HP • Passive: Abilities deal +18% damage'
    },
    {
      id: 'executioner_bow',
      name: 'Heartseeker Repeater',
      cost: 1150,
      stats: { attack: 54, asPct: 0.20, executeAmp: 0.25 },
      desc: '+54 Attack, +20% AS • Passive: +25% damage vs targets below 45% HP'
    }
  ];

  // ---- Test builds for the balance tools (?profile / ?duel) ----
  // What each damage lean could afford at a level (about 0 / 2,500 / 9,000 gold at Lv1 / 6 / 12, max 4 items).
  // Placeholder until the shop overhaul replaces the item list.
  const HERO_LEAN = {
    coyote: 'attack', brawler: 'attack', imp: 'attack',
    sorceress: 'ability', fairy: 'support', scientist: 'ability',
    panther: 'hybrid', bodyguard: 'tank'
  };
  const TEST_BUILDS = {
    attack:  { 1: [], 6: ['serrated_dirk', 'executioner_bow', 'boots_swift'], 12: ['executioner_bow', 'titan_gauntlet', 'frost_bolter', 'repeating_spring'] },
    ability: { 1: [], 6: ['cataclysm_crown', 'mana_pendant', 'boots_swift'], 12: ['cataclysm_crown', 'mana_pendant', 'astral_tome', 'boots_swift'] },
    hybrid:  { 1: [], 6: ['serrated_dirk', 'cataclysm_crown', 'boots_swift'], 12: ['executioner_bow', 'cataclysm_crown', 'repeating_spring', 'boots_swift'] },
    tank:    { 1: [], 6: ['coliseum_plate', 'aegis_cloak', 'boots_swift'], 12: ['titan_gauntlet', 'aegis_cloak', 'coliseum_plate', 'boots_swift'] },
    support: { 1: [], 6: ['aegis_cloak', 'mana_pendant', 'boots_swift'], 12: ['aegis_cloak', 'mana_pendant', 'astral_tome', 'boots_swift'] }
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
