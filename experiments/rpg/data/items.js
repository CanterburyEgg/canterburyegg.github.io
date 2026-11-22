// Item registry, derived from resources + tools. Theme-agnostic data.
import { RESOURCES, TOOLS, TOOL_METALS } from './resources.js';
import { MELEE_WEAPONS, ARMOR, TIER_REQ, METAL_OF_TIER } from './equipment.js';

const METAL_COLORS = { bismuth: '#c9a2e8', cobalt: '#3d63c4', tungsten: '#8a919c' };
const TOOL_ICONS = { pick: '⛏️', hatchet: '🪓', sickle: '🌙', gloves: '🧤' };

export const ITEMS = {};

for (const skill of Object.keys(RESOURCES)) {
  for (const tier of Object.keys(RESOURCES[skill])) {
    for (const r of RESOURCES[skill][tier]) {
      ITEMS[r.id] = {
        id: r.id, name: r.name, kind: 'resource', skill, tier: Number(tier),
        color: r.color, stackable: false, value: 3 * Number(tier) * Number(tier),
      };
    }
  }
}

for (const t of TOOLS) {
  const metal = TOOL_METALS.find((m) => m.tier === t.tier);
  ITEMS[t.id] = {
    id: t.id, name: t.name, kind: 'tool', toolType: t.type, skill: t.skill,
    tier: t.tier, levelReq: t.levelReq, color: METAL_COLORS[metal.metal] || '#999',
    icon: TOOL_ICONS[t.type] || '🔧', stackable: false, value: t.price,
  };
}

// Equipment: melee weapons (need Melee) and armor (needs Vitality). kind 'weapon' / 'armor', slot.
const WEAPON_ICONS = { machete: '🔪', maul: '🔨', spear: '🔱', cleaver: '🪓' };
const ARMOR_ICONS = { head: '⛑️', body: '🛡️', legs: '🦵' };
for (const w of MELEE_WEAPONS) {
  ITEMS[w.id] = {
    id: w.id, name: w.name, kind: 'weapon', slot: 'weapon', style: 'melee', weaponKind: w.kind, tier: w.tier,
    skill: 'melee', levelReq: TIER_REQ[w.tier], damage: w.damage, ticks: w.ticks, reach: w.reach,
    color: METAL_COLORS[METAL_OF_TIER[w.tier]], icon: WEAPON_ICONS[w.kind] || '🗡️', stackable: false, value: w.price,
  };
}
for (const a of ARMOR) {
  ITEMS[a.id] = {
    id: a.id, name: a.name, kind: 'armor', slot: a.slot, tier: a.tier, metal: a.metal, armor: a.armor,
    skill: 'vitality', levelReq: TIER_REQ[a.tier], color: METAL_COLORS[a.metal], icon: ARMOR_ICONS[a.slot], stackable: false, value: a.price,
  };
}
export const isEquipment = (def) => def && (def.kind === 'weapon' || def.kind === 'armor');

// Temporary until the Quartermaster NPC exists (Phase E).
export const STARTER_ITEMS = ['bismuth_pick', 'bismuth_hatchet', 'bismuth_sickle'];
