// Shop item data (SHOP_PLAN.md: "Numbers pass" + "Names"). Everything is generated from the locked formulas so the
// numbers can't drift from the plan:
//   component 350 · tier 2 = 2 components + 250 = 950 · epic = tier 2 + both of its components + 950 = 2,600
//   boots 300 · tier-2 boots = boots + 600 = 900
//   mixed tier 2 = both components' stats x1.15 · double tier 2 = both components' stats + its specialty
//   epic = 2x its tier-2 stats (a double's specialty is 1.5x instead) + a passive
// Both epics of a line share one recipe (their stats are identical; the passive is the difference).
// Passive ids + numbers live here; js/item_passives.js runs them.
window.MOBA_ITEMS = (function () {
  'use strict';
  // stat keys used by computeUnitStats (js/phase1_engine.js)
  const STAT = { hp: 'maxHp', mana: 'maxMp', atk: 'attack', abil: 'ability', res: 'resist', asp: 'asPct', haste: 'haste' };
  const COMP_AMT = { hp: 180, mana: 200, atk: 15, abil: 25, res: 12, asp: 0.12, haste: 12 };
  const MIX_T2 = { hp: 210, mana: 230, atk: 17, abil: 30, res: 14, asp: 0.14, haste: 14 };
  const MIX_EPIC = { hp: 420, mana: 460, atk: 35, abil: 60, res: 28, asp: 0.28, haste: 28 };
  const DBL_T2 = { hp: 360, mana: 400, atk: 30, abil: 50, res: 24, asp: 0.24, haste: 24 };
  const DBL_EPIC = { hp: 720, mana: 800, atk: 60, abil: 100, res: 48, asp: 0.48, haste: 48 };
  // double specialty: [stat key, tier-2 amount, epic amount]
  const SPECIALTY = {
    hp: ['hpRegen', 8, 12], mana: ['mpRegen', 4, 6], atk: ['lifesteal', 0.10, 0.15], abil: ['spellVamp', 0.08, 0.12],
    res: ['penResist', 0.30, 0.45], asp: ['onHit', 15, 22], haste: ['ultHaste', 25, 40]
  };
  const COST = { component: 350, tier2: 950, epic: 2600, boots: 300, boots2: 900 };

  const COMPONENTS = {
    hp: 'Garnet Brooch', mana: 'Dewdrop Vial', atk: 'Hatchet', abil: 'Inkwell',
    res: 'Iron Collar', asp: 'Kestrel Feather', haste: 'Metronome'
  };

  // line -> [tier-2 name, [epic A name, passive id, params], [epic B name, passive id, params]]
  // Numbers: SHOP_PLAN.md Stage 3 batches (+ the scripted-check changes to Retort and Bulwark breaker).
  const LINES = {
    'hp+hp': ['Bear Pelt',
      ["Old Grizzly's Hide", 'warmog', { delay: 6, pctPerSec: 0.03 }],
      ['Cloak of the Oathsworn', 'redirect', { range: 5, share: 0.12 }]],
    'mana+mana': ['Tide Pearl',
      ['Brimming Chalice', 'manaEngine', { abilityPerBonusMana: 0.05, hpPerBonusMana: 0.25 }],
      ['Breakwater', 'manaShield', { hpPct: 0.5, base: 150, manaPct: 0.25, dur: 3, cd: 45 }]],
    'atk+atk': ["Bloodletter's Knife",
      ['Gluttonous Carver', 'overheal', { capBase: 60, capPctHp: 0.12, drainAfter: 5 }],
      ['Misericorde', 'attackPen', { pen: 0.30 }]],
    'abil+abil': ['Arcane Journal',
      ['Unraveling Codex', 'abilityPen', { pen: 0.30 }],
      ['Magnum Opus', 'amplifier', { abilityMult: 0.25 }]],
    'res+res': ['Pavise',
      ['Tortoise Shell', 'attackWard', { cut: 0.20 }],
      ["Spellbreaker's Veil", 'abilityWard', { cut: 0.20 }]],
    'asp+asp': ['Hornet Bracers',
      ["Hornet's Nest", 'ricochet', { bounces: 3, range: 4, pct: 0.40, maxPerTarget: 2 }],
      ["Hive Queen's Stinger", 'frenzy', { hits: 3, window: 3, asPct: 0.40, spdPct: 0.20, dur: 3, cd: 8 }]],
    'haste+haste': ['Brass Astrolabe',
      ["Reaper's Orrery", 'reset', { killPct: 0.30, assistPct: 0.15 }],
      ['Crescendo', 'ultFollowUp', { haste: 60, dur: 6 }]],
    'hp+mana': ['Amber Phial',
      ['Heartwood Amulet', 'lifeblood', { hpPct: 0.35, healPctPerSec: 0.03, manaPerSec: 30, dur: 5, stopManaPct: 0.10, cd: 30 }],
      ['Wellspring', 'wellspring', { power: 0.15, mana: 15, icd: 1 }]],
    'hp+atk': ['Splitting Maul',
      ["Woodsman's Greataxe", 'cleaver', { splashR: 2, splashPct: 0.40, every: 10, bonusPctMaxHp: 0.03 }],
      ['Rending Flail', 'weakness', { perStack: 0.04, maxStacks: 5, dur: 4 }]],
    'hp+abil': ["Druid's Branch",
      ['Hoarfrost Staff', 'frostTouched', { slow: 0.25, aoeSlow: 0.15, dur: 1.5 }],
      ['Wildfire Totem', 'immolate', { range: 3, base: 15, bonusHpPct: 0.015 }]],
    'hp+res': ['Quilted Gambeson',
      ['Chameleon Hide', 'adaptiveGuard', { window: 3, shieldBase: 100, shieldPctHp: 0.08, resist: 30, resistDur: 4, cd: 25 }],
      ['Withering Hauberk', 'wither', { perStack: 0.05, maxStacks: 3, dur: 4 }]],
    'hp+asp': ['Leather Handwraps',
      ['Ogre Knuckles', 'bulwarkBreaker', { pctMaxHp: 0.025, monsterCap: 60 }],
      ['Death Grip', 'lastStand', { hpPct: 0.40, asPct: 0.35, healPctMaxHp: 0.02 }]],
    'hp+haste': ['Marching Harness',
      ["Inquisitor's Plate", 'exposed', { amp: 0.10, dur: 3 }],
      ['Bell Cuirass', 'battleRhythm', { cdCut: 0.5, icd: 1 }]],
    'mana+atk': ['Engraved Machete',
      ['Sapphire Kopis', 'manaForged', { cost: 25, base: 20, maxManaPct: 0.04, stopManaPct: 0.25 }],
      ['Spirit Saber', 'essence', { mana: 12, cdCut: 0.3 }]],
    'mana+abil': ['Star Chart',
      ['Supernova', 'overcharge', { extraCost: 0.25, dmgPerExtraMana: 3 }],
      ['Harvest Moon', 'soulHarvest', { hero: 0.08, monster: 0.03, minion: 0.01, smallCapPct: 0.05, smallCapWindow: 3 }]],
    'mana+res': ['Prayer Shawl',
      ['Temple Censer', 'wardAura', { range: 6, resist: 15 }],
      ['Thistle Shroud', 'barbedWard', { antiHeal: 0.40, dur: 3 }]],
    'mana+asp': ['Copper Bangle',
      ['Rusted Chakram', 'woundingStrikes', { antiHeal: 0.40, dur: 3 }],
      ['Moonlit Anklet', 'manaTap', { mana: 6, heroMana: 10 }]],
    'mana+haste': ['Rosary',
      ['Prayer Wheel', 'momentum', { perStack: 0.06, maxStacks: 5, dropAfter: 4 }],
      ['Calm Waters', 'flowState', { manaPct: 0.5, haste: 20 }]],
    'atk+abil': ['Sigiled Saber',
      ['Twin Scales', 'equilibrium', { pctOfLower: 0.25 }],
      ['Mirror Blade', 'crossover', { cd: 5 }]],
    'atk+res': ['Spiked Gorget',
      ['Rimed Pauldrons', 'frostbitePlate', { asSlow: 0.20, spdSlow: 0.10, dur: 2 }],
      ['Vendetta', 'grudge', { perStack: 0.04, maxStacks: 6, dropAfter: 4 }]],
    'atk+asp': ['Javelin',
      ["Hawk's Reach", 'longshot', { rangePct: 0.15 }, { rangedOnly: true }],
      ['Whirling Glaive', 'windUp', { perStack: 0.06, maxStacks: 6, dropAfter: 3 }]],
    'atk+haste': ['Kukri',
      ['Tempered Edge', 'temperedSpells', { pctAttack: 0.40 }],
      ["Viper's Kiss", 'ambush', { base: 80, pctAttack: 0.60, grace: 1.2, cd: 8 }]],
    'abil+res': ["Abjurer's Robe",
      ['Lunar Halo', 'spellShield', { cd: 40 }],
      ['Stone Litany', 'bulwarkCasting', { resist: 8, dur: 4, maxStacks: 5 }]],
    'abil+asp': ["Witch's Thimble",
      ['Hex Needle', 'hexedStrikes', { base: 15, pctAbility: 0.15 }],
      ['Lightning Distaff', 'staticCharge', { hits: 5, base: 60, pctAbility: 0.35, jumps: 4, range: 4 }]],
    'abil+haste': ['Quartz Pendulum',
      ['Tuning Fork', 'spellCadence', { abilities: 3, window: 4, base: 80, pctAbility: 0.30, cd: 8 }],
      ['Infinity Scrolls', 'accumulation', { every: 5, ability: 4, cap: 60 }]],
    'res+asp': ['Porcupine Quills',
      ['Rebound Buckler', 'retort', { storePct: 0.25, capBase: 60, capPerResist: 1, dropAfter: 4 }],
      ['Bloodspike Plate', 'siphonPlating', { steal: 3, maxStacks: 5, dur: 4 }]],
    'res+haste': ['Lodestone',
      ['Horn of Steel Sun', 'steadfastAura', { range: 6, tenacity: 0.20 }],
      ['Broken Chains', 'shrugOff', { cdCut: 2, icd: 4 }]],
    'asp+haste': ["Fencer's Foil",
      ['Hair Trigger', 'snapBack', {}],
      ['Dancing Rapier', 'battleTempo', { asPct: 0.30, dur: 3 }]]
  };

  // short display text for each passive (shop tooltips)
  const PASSIVE_TEXT = {
    warmog: 'After 6s without taking damage, regenerate 3% max HP per second.',
    redirect: '12% of the damage taken by allied heroes within 5m is redirected to you.',
    manaEngine: 'Gain Ability equal to 5% of your bonus Mana and HP equal to 25% of it.',
    manaShield: 'Dropping below 50% HP grants a shield of 150 + 25% current Mana for 3s (45s cooldown).',
    overheal: 'Lifesteal past full HP becomes a shield (up to 60 + 12% max HP). It drains after 5s out of combat.',
    attackPen: 'Ignore 30% of the target\'s Resist on Attack damage.',
    abilityPen: 'Ignore 30% of the target\'s Resist on Ability damage.',
    amplifier: '+25% total Ability.',
    attackWard: 'Take 20% less Attack damage.',
    abilityWard: 'Take 20% less Ability damage.',
    ricochet: 'Basic attacks bounce up to 3 times to enemies within 4m for 40% damage (on-hit damage included, no on-hit effects).',
    frenzy: 'Land 3 basic attacks on one target within 3s: +40% Attack speed and +20% Move speed for 3s (8s cooldown).',
    reset: 'A hero kill cuts your current cooldowns by 30% (assists: 15%).',
    ultFollowUp: 'For 6s after casting your ultimate, gain +60 Haste.',
    lifeblood: 'Below 35% HP: regenerate 3% max HP per second for up to 5s, costing 30 Mana per second (30s cooldown).',
    wellspring: 'Your heals and shields on allies are 15% stronger, and each restores 15 Mana (once per second).',
    cleaver: 'Basic attacks splash 40% damage within 2m. Every 10s, your next basic attack adds 3% of your max HP.',
    weakness: 'Attack damage applies Weakness (max 5): each stack makes the target take 4% more Attack damage from everyone.',
    frostTouched: 'Ability damage slows by 25% for 1.5s (area hits 15%).',
    immolate: 'Enemies within 3m burn for 15 + 1.5% of your bonus HP per second.',
    adaptiveGuard: 'Taking Attack and Ability damage within 3s grants a shield of 100 + 8% max HP and +30 Resist fading over 4s (25s cooldown).',
    wither: 'Enemies who hit you with abilities lose 5% Attack and Ability per stack (max 3, 4s).',
    bulwarkBreaker: 'Basic attacks deal bonus damage equal to 2.5% of the target\'s max HP (max 60 vs minions and monsters).',
    lastStand: 'Below 40% HP: +35% Attack speed, and basic attacks heal 2% max HP.',
    exposed: 'Enemies you hard-CC take 10% more damage from everyone for 3s.',
    battleRhythm: 'Each direct hit from an enemy hero cuts your non-ultimate cooldowns by 0.5s (once per second).',
    manaForged: 'Basic attacks on heroes spend 25 Mana for 20 + 4% max Mana bonus damage (off below 25% Mana).',
    essence: 'Basic attacks on heroes restore 12 Mana and cut your basic ability cooldowns by 0.3s.',
    overcharge: 'Abilities cost 25% more Mana but deal bonus damage equal to 3x the extra Mana spent.',
    soulHarvest: 'Enemies that die to your Ability damage refund Mana (8% max Mana for heroes, less for monsters and minions).',
    wardAura: 'Nearby allies (6m) gain +15 Resist.',
    barbedWard: 'Enemies who hit you are afflicted with 40% anti-heal for 3s.',
    woundingStrikes: 'Basic attacks apply 40% anti-heal for 3s.',
    manaTap: 'Basic attacks restore 6 Mana (10 against heroes).',
    momentum: 'Each cast lowers your Mana costs by 6% (max 30%); the stacks drop after 4s without casting.',
    flowState: 'While above 50% Mana, gain +20 Haste.',
    equilibrium: 'Your hits deal bonus damage equal to 25% of your lower stat (Attack or Ability).',
    crossover: 'Once every 5s, your first hit of your weaker damage type uses your stronger stat.',
    frostbitePlate: 'Enemies who hit you lose 20% Attack speed and 10% Move speed for 2s.',
    grudge: 'Each hit on the same hero grants +4% Attack (max 24%); resets when you switch targets.',
    longshot: '+15% basic attack range. Ranged heroes only.',
    windUp: 'Each basic attack grants +6% Attack speed (max 36%) for the fight; can exceed the Attack speed cap.',
    temperedSpells: 'Each ability\'s first hit deals bonus damage equal to 40% of your Attack.',
    ambush: 'Your first hit while unseen (or within 1.2s of being spotted) deals 80 + 60% Attack bonus damage (8s cooldown).',
    spellShield: 'Blocks the next enemy ability, crowd control included. Recharges 40s after it breaks.',
    bulwarkCasting: 'Each cast grants +8 Resist for 4s, stacking to +40 (each stack on its own timer).',
    hexedStrikes: 'Basic attacks deal 15 + 15% Ability bonus Ability damage.',
    staticCharge: '5 basic attacks charge it; the next releases 60 + 35% Ability to the target and up to 4 nearby enemies.',
    spellCadence: 'Hit one target with 3 different abilities within 4s for 80 + 30% Ability bonus damage (8s per target).',
    accumulation: 'Every 5 casts that hit an enemy hero or monster permanently grant +4 Ability (max +60).',
    retort: '25% of the damage your Resist prevents is stored (up to 60 + your Resist) and added to your next basic attack.',
    siphonPlating: 'Basic attacks on heroes steal 3 Resist (max 15, 4s).',
    steadfastAura: 'Nearby allies (6m) gain 20% Tenacity.',
    shrugOff: 'When you\'re hard crowd-controlled, your basic ability cooldowns drop by 2s (once per 4s).',
    snapBack: 'Casting an ability resets your basic attack timer.',
    battleTempo: 'Casting an ability grants +30% Attack speed for 3s (can exceed the Attack speed cap).'
  };

  const ORDER = ['hp', 'mana', 'atk', 'abil', 'res', 'asp', 'haste'];
  const items = [];
  const byId = {};
  const add = (it) => { items.push(it); byId[it.id] = it; return it; };
  const slug = (name) => name.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const round = (v) => Math.round(v * 1000) / 1000;

  ORDER.forEach((k) => add({
    id: slug(COMPONENTS[k]), name: COMPONENTS[k], tier: 1, line: k, cost: COST.component, from: [],
    stats: { [STAT[k]]: COMP_AMT[k] }
  }));
  const compId = (k) => slug(COMPONENTS[k]);

  for (let i = 0; i < ORDER.length; i++) {
    for (let j = i; j < ORDER.length; j++) {
      const a = ORDER[i], b = ORDER[j];
      const line = a + '+' + b;
      const def = LINES[line];
      if (!def) throw new Error('items.js: missing line ' + line);
      const dbl = a === b;
      const t2Stats = {};
      const epicStats = {};
      if (dbl) {
        t2Stats[STAT[a]] = DBL_T2[a]; epicStats[STAT[a]] = DBL_EPIC[a];
        const sp = SPECIALTY[a];
        t2Stats[sp[0]] = sp[1]; epicStats[sp[0]] = sp[2];
      } else {
        t2Stats[STAT[a]] = MIX_T2[a]; t2Stats[STAT[b]] = MIX_T2[b];
        epicStats[STAT[a]] = MIX_EPIC[a]; epicStats[STAT[b]] = MIX_EPIC[b];
      }
      const t2 = add({ id: slug(def[0]), name: def[0], tier: 2, line, cost: COST.tier2, from: [compId(a), compId(b)], stats: t2Stats });
      [def[1], def[2]].forEach((e, n) => {
        add({
          id: slug(e[0]), name: e[0], tier: 3, line, cost: COST.epic,
          from: [t2.id, compId(a), compId(b)],
          stats: Object.assign({}, epicStats),
          passive: { id: e[1], params: e[2], text: PASSIVE_TEXT[e[1]] || '' },
          rangedOnly: !!(e[3] && e[3].rangedOnly) // the shop won't sell it to melee heroes
        });
      });
    }
  }

  const BOOTS = add({ id: 'footwraps', name: 'Footwraps', tier: 1, line: 'boots', cost: COST.boots, from: [], stats: { spdPct: 0.08 }, boots: true });
  [
    ['Insulated Sabatons', { spdPct: 0.12, resist: 18, tenacity: 0.25 }],
    ["Fencer's Slippers", { spdPct: 0.12, asPct: 0.25 }],
    ["Monk's Sandals", { spdPct: 0.12, haste: 15 }],
    ['Jackrabbit Moccasins', { spdPct: 0.20 }]
  ].forEach(([name, stats]) => add({ id: slug(name), name, tier: 2, line: 'boots', cost: COST.boots2, from: [BOOTS.id], stats, boots: true }));

  // short stat line for tooltips: '+420 HP, +35 Attack'
  const STAT_LABEL = {
    maxHp: ['HP', 1], maxMp: ['Mana', 1], attack: ['Attack', 1], ability: ['Ability', 1], resist: ['Resist', 1],
    asPct: ['% Attack speed', 100], haste: ['Haste', 1], spdPct: ['% Move speed', 100], hpRegen: ['HP regen/s', 1],
    mpRegen: ['Mana regen/s', 1], lifesteal: ['% Lifesteal', 100], spellVamp: ['% Spell Vamp', 100],
    penResist: ['% penetration resistance', 100], onHit: ['on-hit damage', 1], ultHaste: ['Ultimate Haste', 1],
    tenacity: ['% Tenacity', 100]
  };
  function statText(stats) {
    return Object.keys(stats).map((k) => {
      const l = STAT_LABEL[k] || [k, 1];
      const v = Math.round(stats[k] * l[1] * 10) / 10;
      return '+' + v + (l[0].charAt(0) === '%' ? l[0] : ' ' + l[0]);
    }).join(', ');
  }

  // sanity: 7 + 28 + 56 + 5 = 96 unique ids
  if (items.length !== 96 || Object.keys(byId).length !== 96) throw new Error('items.js: expected 96 unique items, got ' + items.length);
  items.forEach((it) => {
    Object.keys(it.stats).forEach((k) => { it.stats[k] = round(it.stats[k]); });
    it.desc = statText(it.stats) + (it.passive ? ' • ' + it.passive.text : '');
  });

  // gold still owed for an item given what you hold (each owned part, recursively, counts at its full cost)
  function costGiven(itemId, ownedIds) {
    const pool = ownedIds.slice();
    const used = [];
    const walk = (id) => {
      const it = byId[id];
      let owed = it.cost;
      it.from.forEach((fid) => {
        const k = pool.indexOf(fid);
        if (k >= 0) { pool.splice(k, 1); used.push(fid); owed -= byId[fid].cost; }
        else owed -= byId[fid].cost - walk(fid);
      });
      return owed;
    };
    const owed = walk(itemId);
    return { owed, used };
  }

  return { items, byId, LINES, STAT, COST, costGiven, statText };
})();
