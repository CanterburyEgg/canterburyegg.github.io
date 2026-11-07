window.MOBA = window.MOBA || {};

(function (M) {
  'use strict';

  M.WORLD = {
    width: 2400,
    height: 1660,
    fountain: { x: 300, y: 830, radius: 165 },
    spawn: { x: 430, y: 830 },
    enemyWardPos: { x: 1075, y: 215 },
    visionRangeHero: 780,
    visionRangeWard: 540,
    visionRangeDummy: 680
  };

  M.HITBOX = {
    SMALL: 18,
    STANDARD: 24,
    LARGE: 33
  };

  // Rectangular stone walls (block movement + cast LOS shadows)
  M.WALLS = [
    { x: 760, y: 520, w: 46, h: 170 },
    { x: 1270, y: 690, w: 46, h: 185 },
    { x: 1120, y: 1080, w: 190, h: 44 },
    { x: 1680, y: 820, w: 50, h: 210 }
  ];

  // Dense Warcraft-style pine tree clusters (circular movement + LOS blockers)
  M.TREES = [
    // North Whispering Grove (ideal for Panther Unseen + Ward testing)
    { x: 930, y: 310, r: 34 },
    { x: 995, y: 295, r: 38 },
    { x: 1060, y: 315, r: 35 },
    { x: 960, y: 375, r: 36 },
    { x: 1030, y: 380, r: 34 },
    { x: 1155, y: 325, r: 38 },
    { x: 1215, y: 355, r: 34 },
    { x: 1185, y: 420, r: 35 },

    // South Woodland Copse
    { x: 790, y: 1220, r: 38 },
    { x: 855, y: 1255, r: 35 },
    { x: 920, y: 1230, r: 36 },
    { x: 845, y: 1320, r: 38 },

    // East Flanking Pines
    { x: 1820, y: 470, r: 38 },
    { x: 1885, y: 510, r: 36 },
    { x: 1855, y: 575, r: 35 },
    { x: 1790, y: 1190, r: 38 },
    { x: 1855, y: 1230, r: 36 },

    // Perimeter framing trees
    { x: 520, y: 250, r: 42 },
    { x: 590, y: 225, r: 38 },
    { x: 520, y: 1410, r: 42 },
    { x: 595, y: 1435, r: 38 }
  ];

  M.ROLE_COLORS = {
    Carry: '#f59e0b',
    Support: '#34d399',
    Solo: '#fb7185',
    Jungle: '#38bdf8'
  };

  M.HERO_ORDER = [
    'sorceress',
    'coyote',
    'fairy',
    'bodyguard',
    'cannon',
    'brawler',
    'scientist',
    'panther'
  ];

  M.HEROES = {
    sorceress: {
      id: 'sorceress',
      name: 'Sorceress',
      subtitle: 'Carry • Ranged Fantasy',
      role: 'Carry',
      rangeType: 'Ranged',
      glyph: 'S',
      color: '#38bdf8',
      accent: '#fde047',
      radius: M.HITBOX.STANDARD,
      baseStats: {
        hp: 620, hpGrow: 68,
        mp: 420, mpGrow: 38,
        hpRegen: 4.5, mpRegen: 6.5,
        phys: 34, physGrow: 2.2,
        fant: 46, fantGrow: 7.5,
        armor: 14, armorGrow: 2.0,
        fResist: 22, fResistGrow: 2.2,
        moveSpeed: 325,
        atkCooldown: 1.08,
        atkRange: 470
      },
      abilities: {
        P: {
          name: 'Soul Siphon',
          short: 'Mana Kill',
          meta: 'Passive',
          desc: 'Enemies dying within 2s of taking damage from you restore 36 (+6/Lv) Mana. Tripled on Hero takedowns.'
        },
        LMB: {
          name: 'Astral Spark',
          short: 'Bolt',
          meta: 'Slow Ranged Auto',
          desc: 'Fires a slow bolt dealing light Fantasy damage.'
        },
        Q: {
          name: 'Starfall Pillar',
          short: 'Pillar',
          cd: 3.6,
          mp: 38,
          desc: 'Drop a magic pillar dealing Fantasy damage. Hits grant -1s Q cooldown for 5s (stacks up to 2 on creeps, 3 on Heroes/Boss).'
        },
        E: {
          name: 'Rift Stride',
          short: 'Dash+Line',
          cd: 9.0,
          mp: 60,
          desc: 'Dash in your WASD direction, then erupt a line of 3 Fantasy pillars from your landing spot toward your Mouse Cursor.'
        },
        R: {
          name: 'Cataclysm Monolith',
          short: 'Grow Zone',
          cd: 42.0,
          mp: 100,
          desc: 'Summon a massive pillar for 5s that steadily expands, dealing Fantasy AoE damage over time and Slowing enemies inside by 35%.'
        }
      },
      talents: {
        3: {
          L: { title: 'Far Sight', desc: 'Q cast range increased by +15%.' },
          R: { title: 'Chilling Wake', desc: "E's pillar line slows hit enemies by 25% for 1.5s." }
        },
        6: {
          L: { title: 'Wide Conduit', desc: 'Q explosion radius increased by +20%.' },
          R: { title: 'Astral Slipstream', desc: 'E dash distance +25% and grants +25% Move Speed for 1.5s.' }
        },
        10: {
          L: { title: 'Gravity Collapse', desc: 'R pulls enemies inward toward its center upon reaching max size.' },
          R: { title: '4th Resonance', desc: 'Max Q cooldown stacks 3 -> 4 vs Heroes, and Q deals +20% damage inside R.' }
        }
      }
    },

    coyote: {
      id: 'coyote',
      name: 'Coyote',
      subtitle: 'Carry • Ranged Physical',
      role: 'Carry',
      rangeType: 'Ranged',
      glyph: 'C',
      color: '#e0533c',
      accent: '#fbbf24',
      radius: M.HITBOX.STANDARD,
      baseStats: {
        hp: 650, hpGrow: 74,
        mp: 310, mpGrow: 26,
        hpRegen: 5.0, mpRegen: 4.5,
        phys: 58, physGrow: 6.8,
        fant: 0, fantGrow: 0,
        armor: 17, armorGrow: 2.5,
        fResist: 18, fResistGrow: 1.8,
        moveSpeed: 330,
        atkCooldown: 0.96,
        atkRange: 485
      },
      abilities: {
        P: {
          name: 'Barbed Quarrels',
          short: 'Bleed x4',
          meta: 'Passive',
          desc: 'Your crossbow bolts apply Bleed stacks (up to 4) for 5s, dealing Physical damage over time.'
        },
        LMB: {
          name: 'Heavy Crossbow',
          short: 'Heavy Bolt',
          meta: 'Slow Strong Auto',
          desc: 'Fires a high-impact Physical bolt that applies 1 Bleed stack.'
        },
        Q: {
          name: 'Triple-Notch',
          short: '3-Bolt Fan',
          cd: 6.5,
          mp: 40,
          desc: 'Empower your next shot to fire a 3-bolt fan (each bolt applies Bleed), followed by 2x reload recovery.'
        },
        E: {
          name: 'Briar Bomb',
          short: 'Grenade',
          cd: 9.5,
          mp: 55,
          desc: 'Throw an AoE grenade dealing Physical damage + 2 Bleed stacks. Direct bullseye hits deal 2x damage and apply 4 Bleed stacks!'
        },
        R: {
          name: 'Heartseeker Quarrel',
          short: 'Bleed Pop',
          cd: 40.0,
          mp: 90,
          desc: 'Self-slowed for 2s while charging, then fire a medium-range piercing bolt for heavy Physical damage that immediately detonates all Bleed stacks.'
        }
      },
      talents: {
        3: {
          L: { title: 'Bloodscent', desc: '+4% Move Speed per Bleed stack (4/8/12/16%) when moving toward bleeding heroes.' },
          R: { title: 'Oiled Winch', desc: 'Reduces Q reload penalty from 2.0x down to 1.5x.' }
        },
        6: {
          L: { title: 'Caltrop Shrapnel', desc: 'E slows enemies for 2s (20% splash / 40% direct bullseye).' },
          R: { title: 'Arterial Rupture', desc: 'Max Bleed stacks increased from 4 -> 5.' }
        },
        10: {
          L: { title: 'Trophy Shot', desc: 'Detonating 4+ Bleed stacks on a Hero with R refunds 50% of R cooldown.' },
          R: { title: 'Bodkin Volley', desc: "Q's 3 bolts pierce through all targets and gain +20% range." }
        }
      }
    },

    fairy: {
      id: 'fairy',
      name: 'Little Fairy',
      subtitle: 'Support • Ranged Enchanter',
      role: 'Support',
      rangeType: 'Ranged',
      glyph: 'F',
      color: '#34d399',
      accent: '#7dd3fc',
      radius: M.HITBOX.SMALL,
      baseStats: {
        hp: 560, hpGrow: 62,
        mp: 440, mpGrow: 40,
        hpRegen: 5.0, mpRegen: 7.5,
        phys: 30, physGrow: 1.8,
        fant: 40, fantGrow: 5.6,
        armor: 14, armorGrow: 2.0,
        fResist: 24, fResistGrow: 2.4,
        moveSpeed: 342,
        atkCooldown: 0.86,
        atkRange: 450
      },
      abilities: {
        P: {
          name: 'Fairy Dust',
          short: 'Heal Dust',
          meta: 'Passive • Small Hitbox',
          desc: 'Ability impact zones leave shimmering Fairy Dust for 3.5s that heals allies standing inside over time.'
        },
        LMB: {
          name: 'Glimmer Dart',
          short: 'Sparkle',
          meta: 'Light Ranged Auto',
          desc: 'Fires a light Fantasy bolt.'
        },
        Q: {
          name: 'Pop! Bubble',
          short: 'Bubble',
          cd: 6.5,
          mp: 50,
          desc: 'Toss a bubble: enemies hit take Fantasy damage and a 2s Slow; allies hit gain a Shield. Leaves Fairy Dust.'
        },
        E: {
          name: 'Pixie Hop',
          short: 'Blink+Sil',
          cd: 10.5,
          mp: 60,
          desc: 'Blink to an enemy, dealing minor Fantasy damage + 1s Silence. Within 3s, recast E to blink to a nearby ally!'
        },
        R: {
          name: 'Lullaby Glamour',
          short: 'Sleep Dust',
          cd: 48.0,
          mp: 100,
          desc: 'For 10s, all your Fairy Dust turns into Dreamdust, putting enemies inside to Sleep for 2s (woken early by direct damage).'
        }
      },
      talents: {
        3: {
          L: { title: 'Grand Bubble', desc: 'Q radius and ally Shield strength increased by +20%.' },
          R: { title: 'Rich Pollen', desc: 'Fairy Dust lasts +1.5s longer and heals +30% more.' }
        },
        6: {
          L: { title: 'Safe Return', desc: "E's ally-return blink grants a Shield to both you and that ally." },
          R: { title: 'Hush Now', desc: 'E Silence duration increased from 1.0s -> 1.6s.' }
        },
        10: {
          L: { title: 'Rude Awakening', desc: 'Waking a Sleeping enemy deals a burst of bonus Fantasy damage.' },
          R: { title: 'Faerie Ring', desc: 'Casting R bursts a large Fairy Dust ring around you and cuts Q/E cooldowns by 30% during R.' }
        }
      }
    },

    bodyguard: {
      id: 'bodyguard',
      name: 'Bodyguard',
      subtitle: 'Support • Melee Vanguard',
      role: 'Support',
      rangeType: 'Melee',
      glyph: 'B',
      color: '#eab308',
      accent: '#f97316',
      radius: M.HITBOX.LARGE,
      baseStats: {
        hp: 820, hpGrow: 98,
        mp: 290, mpGrow: 25,
        hpRegen: 8.0, mpRegen: 4.5,
        phys: 56, physGrow: 4.8,
        fant: 0, fantGrow: 0,
        armor: 28, armorGrow: 3.4,
        fResist: 26, fResistGrow: 3.0,
        moveSpeed: 330,
        atkCooldown: 1.02,
        atkRange: 95
      },
      abilities: {
        P: {
          name: 'Stand Behind Me!',
          short: 'Guard Aura',
          meta: 'Passive • Large Hitbox',
          desc: 'Gain +14 Armor & Fantasy Resist for each Ally-Enemy threat line you position yourself between.'
        },
        LMB: {
          name: 'Heavy Knuckles',
          short: 'Punch',
          meta: 'Strong Slow Melee',
          desc: 'Delivers a forceful Physical punch in front of you.'
        },
        Q: {
          name: 'Bouncer Haymaker',
          short: 'Knockback',
          cd: 7.0,
          mp: 45,
          desc: 'Wind up a heavy directional punch dealing Physical damage and knocking hit enemies away.'
        },
        E: {
          name: 'Crowd Dive',
          short: 'Leap Slam',
          cd: 9.5,
          mp: 55,
          desc: 'Jump into the air and slam target area, dealing AoE Physical damage and Slowing hit enemies by 35%.'
        },
        R: {
          name: 'Eyes On Me!',
          short: 'AoE Taunt',
          cd: 46.0,
          mp: 90,
          desc: 'Taunt all nearby enemies for 2.2s to attack you, gaining a thick Shield scaled per enemy in the area.'
        }
      },
      talents: {
        3: {
          L: { title: 'Into the Stonework', desc: 'Q knocking an enemy into a Wall or Tree Stuns them for 1.0s.' },
          R: { title: 'Broad Shoulders', desc: 'Allies behind you receive 50% of your Passive Armor & Fantasy Resist.' }
        },
        6: {
          L: { title: 'Sky Drop', desc: 'E leap range +25% and Slow increased to 50%.' },
          R: { title: 'Heroic Rescue', desc: 'Allies inside E landing zone gain a Shield and have Slows cleansed.' }
        },
        10: {
          L: { title: 'Thorns of Brass', desc: 'R radius +25% and reflects 25% of damage taken while R Shield holds.' },
          R: { title: 'Peak Physique', desc: 'Casting R grants doubled max Passive resists (+84) for 6s regardless of angle.' }
        }
      }
    },

    cannon: {
      id: 'cannon',
      name: 'Cannon Imp',
      subtitle: 'Solo • Siege & Salvage',
      role: 'Solo',
      rangeType: 'Ranged / Melee',
      glyph: 'K',
      color: '#fb923c',
      accent: '#fde047',
      radius: M.HITBOX.SMALL,
      baseStats: {
        hp: 690, hpGrow: 80,
        mp: 310, mpGrow: 26,
        hpRegen: 6.0, mpRegen: 5.0,
        phys: 55, physGrow: 6.0,
        fant: 0, fantGrow: 0,
        armor: 20, armorGrow: 2.7,
        fResist: 20, fResistGrow: 2.2,
        moveSpeed: 322,
        atkCooldown: 1.05,
        atkRange: 445
      },
      abilities: {
        P: {
          name: 'Black-Powder Splash',
          short: 'AoE Shell',
          meta: 'Passive • Small Hitbox',
          desc: 'Cannon basic attacks (carried & turret) deal Physical splash AoE. Without cannon, gain +22% Move Speed and fast melee wrench strikes.'
        },
        LMB: {
          name: 'Siege Shot / Wrench',
          short: 'Shell/Melee',
          meta: 'Form Dependent',
          desc: 'Fires slow AoE cannonballs when carrying your cannon, or quick melee swings while anchored/broken.'
        },
        Q: {
          name: 'Anchor Turret',
          short: 'Turret',
          cd: 3.0,
          mp: 35,
          desc: 'Anchor cannon as a Turret with secondary HP (press Q nearby to pick back up). If destroyed, walk over the scrap to salvage it or visit Base Fountain.'
        },
        E: {
          name: 'Blast Hop',
          short: 'Jump',
          cd: 8.5,
          mp: 50,
          desc: 'Rocket-Jump a long distance while holding your cannon, or do a nimble short hop while unburdened.'
        },
        R: {
          name: 'Superball',
          short: 'Superball',
          cd: 38.0,
          mp: 85,
          desc: 'Fires a giant cannonball skillshot from your cannon (wherever it currently is!), dealing heavy Physical damage and Knocking Down enemies hit.'
        }
      },
      talents: {
        3: {
          L: { title: 'Iron Rivets', desc: 'Anchored Q Turret has +35% HP and grants you +20 Armor nearby.' },
          R: { title: 'Concussive Shells', desc: 'Passive cannon AoE radius +30% and applies a brief 15% Slow.' }
        },
        6: {
          L: { title: 'Scorched Launch', desc: 'E Cannon-Jump blasts takeoff & landing; unburdened hop CD -40%.' },
          R: { title: 'Field Mechanic', desc: 'Picking up cannon (alive or scrap) grants a Shield and +30% Move Speed for 2s.' }
        },
        10: {
          L: { title: 'Strike! Superball', desc: 'R pierces through ALL enemies in a line, knocking down everyone hit.' },
          R: { title: 'Overclocked Rig', desc: 'Anchored Turret gains +30% AS & range; firing R heals & overcharges it.' }
        }
      }
    },

    brawler: {
      id: 'brawler',
      name: 'Pit Brawler',
      subtitle: 'Solo • Melee Cage-Fighter',
      role: 'Solo',
      rangeType: 'Melee',
      glyph: 'P',
      color: '#f43f5e',
      accent: '#fbbf24',
      radius: M.HITBOX.STANDARD,
      baseStats: {
        hp: 780, hpGrow: 92,
        mp: 280, mpGrow: 24,
        hpRegen: 7.5, mpRegen: 4.5,
        phys: 58, physGrow: 6.2,
        fant: 0, fantGrow: 0,
        armor: 25, armorGrow: 3.1,
        fResist: 22, fResistGrow: 2.5,
        moveSpeed: 338,
        atkCooldown: 0.94,
        atkRange: 92
      },
      abilities: {
        P: {
          name: 'Footwork Siphon',
          short: 'Steal Spd',
          meta: 'Passive',
          desc: 'Basic attacks siphon 2.5% Move Speed per punch from enemies hit, stacking up to 10% stolen per enemy.'
        },
        LMB: {
          name: 'Gauntlet Hook',
          short: 'Punch',
          meta: 'Strong Melee Auto',
          desc: 'Heavy Physical fist strike that steals Move Speed.'
        },
        Q: {
          name: 'Crushing Kick',
          short: 'Stun Kick',
          cd: 6.5,
          mp: 40,
          desc: 'Empower your next auto (resets swing) into a devastating kick dealing bonus Physical damage and Stunning for 1.1s.'
        },
        E: {
          name: 'Rebound Rush',
          short: '2x Dash',
          cd: 9.0,
          mp: 50,
          desc: 'Dash forward. Hitting an Enemy, Wall, Tree, or your Arena Ring immediately grants a Shield and a free 2nd Dash!'
        },
        R: {
          name: 'The Pit Arena',
          short: 'Cage Ring',
          cd: 48.0,
          mp: 95,
          desc: 'Erect an Arena for 5s: enemies inside cannot leave and take +20% damage from you; no projectiles can cross in or out. Allies pass freely.'
        }
      },
      talents: {
        3: {
          L: { title: 'Snap Kick', desc: 'Q Crushing Kick cooldown reduced by 1.5s.' },
          R: { title: 'Fleet Pugilist', desc: 'Passive hits max 10% Move Speed steal in 2 punches (5%/hit) and lasts +2s longer.' }
        },
        6: {
          L: { title: 'Rope-a-Dope', desc: 'E Shield +35% and the 2nd Dash deals AoE Physical slam damage on hit.' },
          R: { title: 'Haymaker Combo', desc: 'Every 3rd LMB punch cleaves nearby foes and heals 8% missing HP.' }
        },
        10: {
          L: { title: 'Undisputed', desc: 'R Arena lasts +1.5s longer and bonus damage inside rises to +35%.' },
          R: { title: 'Cageside Impact', desc: 'Casting R resets E cooldown; enemies colliding with the Arena wall take Physical damage.' }
        }
      }
    },

    scientist: {
      id: 'scientist',
      name: 'Saw Scientist',
      subtitle: 'Jungle • Physical Brawl',
      role: 'Jungle',
      rangeType: 'Melee',
      glyph: 'W',
      color: '#10b981',
      accent: '#f59e0b',
      radius: M.HITBOX.STANDARD,
      baseStats: {
        hp: 750, hpGrow: 88,
        mp: 310, mpGrow: 26,
        hpRegen: 7.0, mpRegen: 5.0,
        phys: 50, physGrow: 5.5,
        fant: 0, fantGrow: 0,
        armor: 23, armorGrow: 3.0,
        fResist: 22, fResistGrow: 2.5,
        moveSpeed: 336,
        atkCooldown: 0.78,
        atkRange: 88
      },
      abilities: {
        P: {
          name: 'Five-Cut Vivisect',
          short: '5-Hit Pop',
          meta: 'Passive',
          desc: 'Every 5th hit in quick succession on an enemy (LMB, Q ticks, and R hits all count!) deals bonus Physical burst damage.'
        },
        LMB: {
          name: 'Surgical Strike',
          short: 'Slash',
          meta: 'Close Melee Auto',
          desc: 'Close-range Physical strike building Vivisect stacks.'
        },
        Q: {
          name: 'Whirling Buzzsaw',
          short: 'Saw Spin',
          cd: 8.5,
          mp: 50,
          desc: 'Spin your saw around yourself for 3s (1 Physical AoE tick/sec), ending with a burst that knocks nearby enemies back.'
        },
        E: {
          name: 'Wild Potion',
          short: 'Heal+Spd',
          cd: 10.0,
          mp: 55,
          desc: 'Drink your volatile tonic, restoring Health and granting +30% Move Speed for 3s.'
        },
        R: {
          name: 'Boomerang Blade',
          short: 'Pull Saw',
          cd: 42.0,
          mp: 90,
          desc: 'Hurl your sawblade out and back: deals Physical damage + Slows going out, then damages + Pulls hit enemies toward you on return.'
        }
      },
      talents: {
        3: {
          L: { title: 'Purified Serum', desc: 'E cleanses Slows and boosts Move Speed bonus to +45%.' },
          R: { title: 'Four-Point Cut', desc: 'Passive triggers every 4 hits instead of 5.' }
        },
        6: {
          L: { title: 'Overdrive Motor', desc: 'Q ticks 4 times over 3s and grants +10% Move Speed while spinning.' },
          R: { title: 'Adrenaline Brew', desc: 'Drinking E heals +30% more and grants +35% Attack Speed for 4s.' }
        },
        10: {
          L: { title: 'Grinder Apex', desc: 'R hovers and spins at max range for 1s before yanking enemies back.' },
          R: { title: 'Blood Harvest', desc: 'Returning R grants a Shield + 15% R cooldown refund PER Enemy Hero hit!' }
        }
      }
    },

    panther: {
      id: 'panther',
      name: 'Panther Rogue',
      subtitle: 'Jungle • Stealth Assassin',
      role: 'Jungle',
      rangeType: 'Melee',
      glyph: 'X',
      color: '#2dd4bf',
      accent: '#fbbf24',
      radius: M.HITBOX.STANDARD,
      baseStats: {
        hp: 670, hpGrow: 78,
        mp: 300, mpGrow: 25,
        hpRegen: 6.5, mpRegen: 5.0,
        phys: 54, physGrow: 6.4,
        fant: 22, fantGrow: 2.8,
        armor: 19, armorGrow: 2.6,
        fResist: 20, fResistGrow: 2.2,
        moveSpeed: 344,
        atkCooldown: 0.72,
        atkRange: 88
      },
      abilities: {
        P: {
          name: 'Shadow Stalker',
          short: 'Unseen Spd',
          meta: 'Passive • Ward Detector',
          desc: 'Gain +28% Move Speed while Unseen by enemies (behind LOS trees, in Fog, or Stealthed), wearing off over 1.2s when spotted.'
        },
        LMB: {
          name: 'Twin Claws',
          short: 'Claws',
          meta: 'Fast Melee Auto',
          desc: 'Rapid Physical claw swipes that trigger Predator Marks.'
        },
        Q: {
          name: 'Slash & Gnash',
          short: '3x Flurry',
          cd: 6.0,
          mp: 45,
          desc: 'Unleash 3 rapid strikes in quick succession; each hit deals Physical damage, heals you, and procs E Marks!'
        },
        E: {
          name: "Predator's Leap",
          short: 'Mark Leap',
          cd: 8.5,
          mp: 50,
          desc: 'Pounce to target spot dealing minor Fantasy damage and Marking enemies: your next 3 hits (LMB or Q) deal bonus damage.'
        },
        R: {
          name: 'Nightprowl',
          short: 'Stealth',
          cd: 38.0,
          mp: 80,
          desc: 'Enter Stealth for up to 6s (immediately activating Unseen speed) and increase E Leap range by +65%.'
        }
      },
      talents: {
        3: {
          L: { title: 'Duskwalker', desc: 'Unseen Move Speed rises to +38% and lingers +1.5s longer after being spotted.' },
          R: { title: 'Bloodfangs', desc: 'Q healing +35% and deals +30% bonus damage to enemies below 40% HP.' }
        },
        6: {
          L: { title: 'Hamstring Mark', desc: 'Consuming the 3rd E Mark Slows by 50% (1.25s) and refunds 2s off E CD.' },
          R: { title: 'Arcane Claws', desc: 'E Mark bonus damage increased by +35% (Fantasy damage).' }
        },
        10: {
          L: { title: 'Apex Reset', desc: 'Hero takedowns within 4s of exiting R Stealth refresh E and grant 2.5s Stealth.' },
          R: { title: 'Throat Pounce', desc: 'Leaping with E from R Stealth applies a 40% Slow + 0.8s Silence on landing.' }
        }
      }
    }
  };
})(window.MOBA);
