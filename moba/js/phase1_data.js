// Phase 1: 3D 4v4 MOBA Map, Structures, Talents & Passive/Proc Item Shop Data
// Works over file:// and http:// with zero build step.
window.MOBA_PHASE1 = (function () {
  const MAP_W = 148; // X: -74 .. +74 (Order Base at -62, Chaos Base at +62)
  const MAP_H = 100; // Z: -50 .. +50 (Top Solo Lane at z=-33, Bot Duo Lane at z=+37)

  // Waypoints for Top (Short Solo 1v1) and Bot (Long Duo 2v2) lanes (Order -> Chaos)
  const LANE_WAYPOINTS = {
    top: [
      { x: -56, z: -6 },
      { x: -46, z: -26 },
      { x: -24, z: -33 },
      { x: 0, z: -33 },
      { x: 24, z: -33 },
      { x: 46, z: -26 },
      { x: 56, z: -6 }
    ],
    bot: [
      { x: -56, z: 6 },
      { x: -48, z: 30 },
      { x: -26, z: 38 },
      { x: 0, z: 39 },
      { x: 26, z: 38 },
      { x: 48, z: 30 },
      { x: 56, z: 6 }
    ]
  };

  // Structures per team: 2 Towers + 1 Barracks per lane + 1 Ancient Core
  function buildInitialStructures() {
    return [
      // ORDER (Team 0 — Left Side, Blue/Emerald)
      { id: 'o_top_t1', team: 0, lane: 'top', kind: 'tower', tier: 1, name: 'Order Top T1 Tower', x: -22, z: -33, r: 1.45, hp: 2800, maxHp: 2800, armor: 45, atk: 135, range: 9.5 },
      { id: 'o_top_t2', team: 0, lane: 'top', kind: 'tower', tier: 2, name: 'Order Top T2 Tower', x: -43, z: -24, r: 1.5, hp: 3400, maxHp: 3400, armor: 50, atk: 160, range: 9.5 },
      { id: 'o_top_rax', team: 0, lane: 'top', kind: 'barracks', tier: 3, name: 'Order Top Barracks', x: -51, z: -13, r: 1.65, hp: 3000, maxHp: 3000, armor: 40, atk: 0, range: 0 },

      { id: 'o_bot_t1', team: 0, lane: 'bot', kind: 'tower', tier: 1, name: 'Order Bot T1 Tower', x: -23, z: 38, r: 1.45, hp: 2800, maxHp: 2800, armor: 45, atk: 135, range: 9.5 },
      { id: 'o_bot_t2', team: 0, lane: 'bot', kind: 'tower', tier: 2, name: 'Order Bot T2 Tower', x: -45, z: 28, r: 1.5, hp: 3400, maxHp: 3400, armor: 50, atk: 160, range: 9.5 },
      { id: 'o_bot_rax', team: 0, lane: 'bot', kind: 'barracks', tier: 3, name: 'Order Bot Barracks', x: -51, z: 13, r: 1.65, hp: 3000, maxHp: 3000, armor: 40, atk: 0, range: 0 },

      { id: 'o_ancient', team: 0, lane: 'base', kind: 'ancient', tier: 4, name: 'Order Ancient Core', x: -57, z: 0, r: 2.35, hp: 5500, maxHp: 5500, armor: 55, atk: 185, range: 10.5 },

      // CHAOS (Team 1 — Right Side, Crimson/Gold)
      { id: 'c_top_t1', team: 1, lane: 'top', kind: 'tower', tier: 1, name: 'Chaos Top T1 Tower', x: 22, z: -33, r: 1.45, hp: 2800, maxHp: 2800, armor: 45, atk: 135, range: 9.5 },
      { id: 'c_top_t2', team: 1, lane: 'top', kind: 'tower', tier: 2, name: 'Chaos Top T2 Tower', x: 43, z: -24, r: 1.5, hp: 3400, maxHp: 3400, armor: 50, atk: 160, range: 9.5 },
      { id: 'c_top_rax', team: 1, lane: 'top', kind: 'barracks', tier: 3, name: 'Chaos Top Barracks', x: 51, z: -13, r: 1.65, hp: 3000, maxHp: 3000, armor: 40, atk: 0, range: 0 },

      { id: 'c_bot_t1', team: 1, lane: 'bot', kind: 'tower', tier: 1, name: 'Chaos Bot T1 Tower', x: 23, z: 38, r: 1.45, hp: 2800, maxHp: 2800, armor: 45, atk: 135, range: 9.5 },
      { id: 'c_bot_t2', team: 1, lane: 'bot', kind: 'tower', tier: 2, name: 'Chaos Bot T2 Tower', x: 45, z: 28, r: 1.5, hp: 3400, maxHp: 3400, armor: 50, atk: 160, range: 9.5 },
      { id: 'c_bot_rax', team: 1, lane: 'bot', kind: 'barracks', tier: 3, name: 'Chaos Bot Barracks', x: 51, z: 13, r: 1.65, hp: 3000, maxHp: 3000, armor: 40, atk: 0, range: 0 },

      { id: 'c_ancient', team: 1, lane: 'base', kind: 'ancient', tier: 4, name: 'Chaos Ancient Core', x: 57, z: 0, r: 2.35, hp: 5500, maxHp: 5500, armor: 55, atk: 185, range: 10.5 }
    ];
  }

  // Neutral Jungle Camps (3 per half) + 1 Central Boss Pit (+10% All-Stats Buff!)
  function buildJungleCamps() {
    return [
      { id: 'camp_o_north', name: 'Razorback Pack', x: -19, z: -15, isBoss: false, maxHp: 1100, armor: 16, atk: 46, gold: 135, xp: 165, respawnDur: 40 },
      { id: 'camp_o_mid',   name: 'Stone Golem',    x: -31, z: 0,   isBoss: false, maxHp: 1400, armor: 22, atk: 56, gold: 165, xp: 195, respawnDur: 45 },
      { id: 'camp_o_south', name: 'Bramble Stalkers', x: -18, z: 17, isBoss: false, maxHp: 1100, armor: 16, atk: 46, gold: 135, xp: 165, respawnDur: 40 },

      { id: 'camp_c_north', name: 'Razorback Pack', x: 19, z: -15, isBoss: false, maxHp: 1100, armor: 16, atk: 46, gold: 135, xp: 165, respawnDur: 40 },
      { id: 'camp_c_mid',   name: 'Stone Golem',    x: 31, z: 0,   isBoss: false, maxHp: 1400, armor: 22, atk: 56, gold: 165, xp: 195, respawnDur: 45 },
      { id: 'camp_c_south', name: 'Bramble Stalkers', x: 18, z: 17, isBoss: false, maxHp: 1100, armor: 16, atk: 46, gold: 135, xp: 165, respawnDur: 40 },

      { id: 'camp_boss',    name: 'Coliseum Behemoth (BOSS: +10% All Stats)', x: 0, z: 0, isBoss: true, maxHp: 4800, armor: 38, atk: 125, gold: 380, xp: 420, respawnDur: 95 }
    ];
  }

  // LOS-Blocking Jungle Trees & Stone Pillars (Mirrored Left & Right)
  function buildMapObstacles() {
    const obs = [];
    const halfPillars = [
      [-10, -8, 1.3], [-10, 8, 1.3],
      [-25, -21, 1.4], [-25, 23, 1.4],
      [-37, -11, 1.35], [-37, 11, 1.35]
    ];
    halfPillars.forEach(([x, z, r]) => {
      obs.push({ kind: 'pillar', x, z, r });
      obs.push({ kind: 'pillar', x: -x, z, r });
    });

    const halfTrees = [
      [-14, -24, 1.15], [-11, -25, 1.05], [-8, -23, 1.1],
      [-28, -8, 1.15], [-26, -5, 1.05],
      [-14, 25, 1.15], [-11, 27, 1.1], [-8, 24, 1.05],
      [-28, 9, 1.15], [-26, 6, 1.05],
      [-38, -20, 1.1], [-38, 21, 1.1],
      [-4, -25, 1.15], [0, -26, 1.2],
      [-4, 26, 1.15], [0, 27, 1.2]
    ];
    halfTrees.forEach(([x, z, s]) => {
      obs.push({ kind: 'tree', x, z, r: 0.92 * s, scale: s });
      if (Math.abs(x) > 0.5) {
        obs.push({ kind: 'tree', x: -x, z, r: 0.92 * s, scale: s });
      }
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
