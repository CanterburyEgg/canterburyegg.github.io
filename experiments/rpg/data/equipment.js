// =====================================================================
// EQUIPMENT (M2 combat core): melee weapons and armor, sold at shops until Smithing exists.
// Abilities per weapon arrive in Phase B; here a weapon is its auto-attack: damage per hit,
// attack speed in game ticks (0.6s), and reach in meters. Names follow <Metal> <Item>.
// Ranged (standard-issue Revolver / Rifle + <Metal> Rounds) also arrives in Phase B.
// =====================================================================
import { TOOL_METALS } from './resources.js';

export const SLOTS = ['weapon', 'head', 'body', 'legs'];
export const SLOT_NAMES = { weapon: 'Weapon', head: 'Head', body: 'Body', legs: 'Legs' };

// Two melee weapons per tier: a fast one and a heavy one.
export const MELEE_WEAPONS = [
  { id: 'bismuth_machete', name: 'Bismuth Machete', tier: 1, kind: 'machete', damage: 4, ticks: 3, reach: 1.9, price: 30 },
  { id: 'bismuth_maul', name: 'Bismuth Maul', tier: 1, kind: 'maul', damage: 7, ticks: 5, reach: 2.0, price: 40 },
  { id: 'cobalt_machete', name: 'Cobalt Machete', tier: 2, kind: 'machete', damage: 7, ticks: 3, reach: 1.9, price: 320 },
  { id: 'cobalt_spear', name: 'Cobalt Spear', tier: 2, kind: 'spear', damage: 9, ticks: 4, reach: 2.8, price: 360 },
  { id: 'tungsten_cleaver', name: 'Tungsten Cleaver', tier: 3, kind: 'cleaver', damage: 11, ticks: 3, reach: 2.0, price: 1500 },
  { id: 'tungsten_maul', name: 'Tungsten Maul', tier: 3, kind: 'maul', damage: 17, ticks: 5, reach: 2.1, price: 1700 },
];

// Ranged: the gun is standard issue; the ammo carries the tier (and most of the damage).
// damage = gun damage x round multiplier. reach in meters. Guns need Ranged levels too.
export const RANGED_WEAPONS = [
  { id: 'standard_revolver', name: 'Standard Revolver', kind: 'revolver', damage: 4, ticks: 3, reach: 9, levelReq: 1, price: 60 },
  { id: 'standard_rifle', name: 'Standard Rifle', kind: 'rifle', damage: 7, ticks: 5, reach: 15, levelReq: 5, price: 160 },
];
// <Metal> Rounds: stackable, sold in boxes of 25. A gun fires the best rounds you can use.
export const ROUNDS = [
  { id: 'bismuth_rounds', name: 'Bismuth Rounds', tier: 1, mult: 1.0, levelReq: 1, pricePerBox: 25 },
  { id: 'cobalt_rounds', name: 'Cobalt Rounds', tier: 2, mult: 1.6, levelReq: 10, pricePerBox: 150 },
  { id: 'tungsten_rounds', name: 'Tungsten Rounds', tier: 3, mult: 2.3, levelReq: 20, pricePerBox: 600 },
];
export const ROUNDS_PER_BOX = 25;

// Armor: head / body / legs per metal. `armor` points reduce damage taken (see combat.js).
const ARMOR_PIECES = [
  { slot: 'head', name: 'Helmet', armor: [2, 4, 7], price: [25, 260, 1100] },
  { slot: 'body', name: 'Chestplate', armor: [4, 8, 13], price: [45, 420, 1800] },
  { slot: 'legs', name: 'Greaves', armor: [3, 6, 10], price: [35, 340, 1400] },
];
export const ARMOR = TOOL_METALS.flatMap((m, ti) => ARMOR_PIECES.map((p) => ({
  id: `${m.metal}_${p.name.toLowerCase()}`, name: `${m.name} ${p.name}`, slot: p.slot, tier: m.tier, metal: m.metal,
  armor: p.armor[ti], price: p.price[ti],
})));

// Level requirements per tier: weapons need Melee, armor needs Vitality.
export const TIER_REQ = { 1: 1, 2: 10, 3: 20 };
export const METAL_OF_TIER = { 1: 'bismuth', 2: 'cobalt', 3: 'tungsten' };
