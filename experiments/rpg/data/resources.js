// =====================================================================
// RESOURCE NODE CATALOG + TOOLS (M1). Names are drafts; veto freely.
// Planets roll 1-2 variants per tier per skill from these lists.
// Starter planet: always T1 (both skills) + some T2. Planet 2 adds T3.
//
// Naming: real words first; alien flavor comes from plain adjectives.
// Tools follow RuneScape material logic: <Metal> <Tool>, better metal = better tool.
// Metal ladder deliberately avoids bronze/iron/steel: Bismuth → Cobalt → Tungsten (→ Iridium → Osmium later).
// =====================================================================

export const TIER_LEVELS = { 1: 1, 2: 10, 3: 20 };

// Tool types. Every gathering node declares which tool type it needs.
export const TOOL_TYPES = {
  pick:    { name: 'Pick',    skill: 'mining' },
  hatchet: { name: 'Hatchet', skill: 'foraging' },  // trees, woody stalks
  sickle:  { name: 'Sickle',  skill: 'foraging' },  // reeds, grasses, vines
  gloves:  { name: 'Gloves',  skill: 'foraging' },  // fungi, delicate or stinging plants
};

export const RESOURCES = {
  mining: {
    1: [
      { id: 'bismuth_ore', name: 'Bismuth Ore', node: 'Bismuth Crystal Bed', tool: 'pick', color: '#c9a2e8', xp: 12, depletes: [1, 3], respawnSec: 10, metal: 'bismuth' },
      { id: 'limestone',  name: 'Limestone',  node: 'Limestone Outcrop', tool: 'pick', color: '#e6e0cf', xp: 10, depletes: [1, 3], respawnSec: 8 },
    ],
    2: [
      { id: 'cobalt_ore',     name: 'Cobalt Ore',     node: 'Cobalt Vein',            tool: 'pick', color: '#2b4fa8', xp: 22, depletes: [1, 2], respawnSec: 20, metal: 'cobalt' },
      { id: 'humming_basalt', name: 'Humming Basalt', node: 'Humming Basalt Boulder', tool: 'pick', color: '#3a3346', xp: 20, depletes: [1, 3], respawnSec: 18 },
    ],
    3: [
      { id: 'tungsten_ore',   name: 'Tungsten Ore',   node: 'Tungsten Seam',  tool: 'pick', color: '#5d636e', xp: 32, depletes: [1, 1], respawnSec: 50, metal: 'tungsten' },
      { id: 'glowing_quartz', name: 'Glowing Quartz', node: 'Quartz Cluster', tool: 'pick', color: '#7ef0e0', xp: 30, depletes: [1, 2], respawnSec: 40 },
    ],
  },
  foraging: {
    1: [
      { id: 'bristle_reed', name: 'Bristle Reed', node: 'Bristle Reed Clump', tool: 'sickle',  color: '#9fcf6a', xp: 12, depleteChance: 0.25, respawnSec: 12 },
      { id: 'pale_log',     name: 'Pale Log',     node: 'Pale Tree',          tool: 'hatchet', color: '#e8dcc8', xp: 14, depleteChance: 0.15, respawnSec: 15 },
    ],
    2: [
      { id: 'coil_vine',  name: 'Coil Vine',  node: 'Coil Vine Tangle', tool: 'sickle', color: '#3fa37a', xp: 21, depleteChance: 0.20, respawnSec: 22 },
      { id: 'shelf_cap',  name: 'Shelf Cap',  node: 'Giant Shelf Fungus', tool: 'gloves', color: '#c99a5b', xp: 23, depleteChance: 0.12, respawnSec: 25 },
    ],
    3: [
      { id: 'lantern_log',  name: 'Lantern Log',  node: 'Lantern Tree',  tool: 'hatchet', color: '#f5d061', xp: 32, depleteChance: 0.10, respawnSec: 45 },
      { id: 'sting_nettle', name: 'Sting Nettle', node: 'Sting Nettle Patch', tool: 'gloves', color: '#9b8cf2', xp: 30, depleteChance: 0.18, respawnSec: 40 },
    ],
  },
};

// Tool metals: tier, level requirement, and shop price. Tool = <Metal> <ToolType>.
// (Later, Forging turns these metals' ores into the tools.)
export const TOOL_METALS = [
  { metal: 'bismuth',  name: 'Bismuth',  tier: 1, levelReq: 1,  price: 15 },
  { metal: 'cobalt',   name: 'Cobalt',   tier: 2, levelReq: 10, price: 180 },
  { metal: 'tungsten', name: 'Tungsten', tier: 3, levelReq: 20, price: 900 },
  // Future tiers (not in M1): Iridium (T4), Osmium (T5).
];

// Expands to Bismuth Pick, Cobalt Sickle, Tungsten Mesh Gloves, etc.
export const TOOLS = TOOL_METALS.flatMap((m) =>
  Object.entries(TOOL_TYPES).map(([type, t]) => ({
    id: `${m.metal}_${type}`,
    name: type === 'gloves' ? `${m.name} Mesh Gloves` : `${m.name} ${t.name}`,
    type,
    skill: t.skill,
    tier: m.tier,
    levelReq: m.levelReq,
    price: m.price,
  }))
);

// Quartermaster starter kit: only the tool types the starter planet's T1 nodes need.
export const STARTER_TOOL_TYPES = ['pick', 'hatchet', 'sickle'];
