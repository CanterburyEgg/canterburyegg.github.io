// Item registry, derived from resources + tools. Theme-agnostic data.
import { RESOURCES, TOOLS, TOOL_METALS } from './resources.js';

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

// Temporary until the Quartermaster NPC exists (Phase E).
export const STARTER_ITEMS = ['bismuth_pick', 'bismuth_hatchet', 'bismuth_sickle'];
