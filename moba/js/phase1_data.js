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
      stats: { atk: 24, asPct: 0.12 },
      desc: '+24 Physical ATK, +12% Attack Speed'
    },
    {
      id: 'astral_tome',
      name: "Starweaver's Codex",
      cost: 550,
      stats: { fant: 34, maxMp: 180, mpRegen: 4.0 },
      desc: '+34 Fantasy Power, +180 Max Mana, +4 MP/s Regen'
    },
    {
      id: 'vamp_fang',
      name: 'Crimson Leech Fang',
      cost: 650,
      stats: { atk: 22, lifesteal: 0.14 },
      desc: '+22 ATK, +14% Lifesteal on Attacks & Abilities'
    },
    {
      id: 'coliseum_plate',
      name: 'Coliseum Iron Greaves',
      cost: 650,
      stats: { maxHp: 340, armor: 22 },
      desc: '+340 Max HP, +22 Armor (Reduces Physical Damage taken)'
    },
    {
      id: 'aegis_cloak',
      name: 'Spellbreaker Mantle',
      cost: 700,
      stats: { maxHp: 320, fResist: 28, armor: 14, allyAuraRes: 12 },
      desc: '+320 HP, +28 Fantasy Resist, +14 Armor • Aura: Nearby allies gain +12 Resists'
    },
    {
      id: 'mana_pendant',
      name: 'Soulstone Chalice',
      cost: 750,
      stats: { fant: 42, maxMp: 220, cdr: 0.15, mpRegen: 5.0 },
      desc: '+42 Fantasy Power, +220 Max Mana, +15% Cooldown Reduction'
    },
    {
      id: 'repeating_spring',
      name: 'Clockwork Crank-Spring',
      cost: 800,
      stats: { atk: 26, asPct: 0.25, cdr: 0.15 },
      desc: '+26 ATK, +25% Attack Speed, +15% Cooldown Reduction'
    },
    {
      id: 'frost_bolter',
      name: 'Frostbite Broadheads',
      cost: 900,
      stats: { atk: 32, maxHp: 220, slowOnHit: 0.22 },
      desc: '+32 ATK, +220 HP • Passive Proc: Basic Attacks slow by 22% for 1.5s'
    },
    {
      id: 'titan_gauntlet',
      name: "Pit Champion's Cestus",
      cost: 950,
      stats: { atk: 35, maxHp: 380, cleaveProc: 75 },
      desc: '+35 ATK, +380 HP • Passive Proc: Attacks shockwave 2.4m for +75 Physical dmg'
    },
    {
      id: 'cataclysm_crown',
      name: 'Crown of the Astral Archon',
      cost: 1100,
      stats: { fant: 68, maxHp: 240, spellAmp: 0.18 },
      desc: '+68 Fantasy Power, +240 HP • Passive Proc: Fantasy spells deal +18% bonus dmg'
    },
    {
      id: 'executioner_bow',
      name: 'Heartseeker Repeater',
      cost: 1150,
      stats: { atk: 54, asPct: 0.20, executeAmp: 0.25 },
      desc: '+54 ATK, +20% AS • Passive Proc: +25% damage vs targets below 45% HP'
    }
  ];

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
    SHOP_ITEMS
  };
})();
