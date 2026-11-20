// Gathering rules (RS-classic). Pure JS: no DOM, no Three.js.
import { GATHER_ROLL, TICK_SECONDS, TICKS_PER_ATTEMPT, levelForXp } from '../data/skills.js';
import { TIER_LEVELS, TOOL_TYPES } from '../data/resources.js';
import { ITEMS } from '../data/items.js';
import { canAdd } from './inventory.js';

export const ATTEMPT_SECONDS = TICK_SECONDS * TICKS_PER_ATTEMPT;

export function nodeLevel(res) {
  return TIER_LEVELS[res.tier] || 1;
}

export function successChance(level, nodeLvl, toolTier) {
  const r = GATHER_ROLL;
  const c = r.base + (level - nodeLvl) * r.perLevel + toolTier * r.perTool;
  return Math.min(r.max, Math.max(r.min, c));
}

// Best usable tool of a type in the inventory. Also reports the best owned-but-too-high-level tool.
export function bestTool(inv, toolType, skillLevel) {
  let usable = null, locked = null;
  for (const s of inv) {
    if (!s) continue;
    const def = ITEMS[s.id];
    if (!def || def.kind !== 'tool' || def.toolType !== toolType) continue;
    if (def.levelReq <= skillLevel) {
      if (!usable || def.tier > usable.tier) usable = def;
    } else if (!locked || def.levelReq < locked.levelReq) {
      locked = def;
    }
  }
  return { usable, locked };
}

const VERB = { pick: 'mine', hatchet: 'chop', sickle: 'cut', gloves: 'harvest' };

export function checkGather(state, res) {
  const skillName = res.skill[0].toUpperCase() + res.skill.slice(1);
  const level = levelForXp(state.xp[res.skill] || 0);
  const need = nodeLevel(res);
  if (level < need) {
    return { ok: false, reason: `You need ${skillName} level ${need} to ${VERB[res.tool] || 'gather'} ${res.name}.` };
  }
  const { usable, locked } = bestTool(state.inventory, res.tool, level);
  if (!usable) {
    const toolName = TOOL_TYPES[res.tool] ? TOOL_TYPES[res.tool].name.toLowerCase() : res.tool;
    if (locked) return { ok: false, reason: `You need ${skillName} level ${locked.levelReq} to use your ${locked.name}.` };
    return { ok: false, reason: `You need a ${toolName} to ${VERB[res.tool] || 'gather'} this.` };
  }
  if (!canAdd(state.inventory, res.id)) {
    return { ok: false, reason: `Your inventory is too full to hold any more ${res.name}.`, full: true };
  }
  return { ok: true, tool: usable, level };
}

// rand: () => [0,1)
export function initialNodeState(res, rand) {
  if (res.depletes) {
    const [a, b] = res.depletes;
    return { remaining: a + Math.floor(rand() * (b - a + 1)), depletedUntil: 0 };
  }
  return { remaining: Infinity, depletedUntil: 0 };
}

// Call after a successful gather. Returns true if the node is now depleted.
export function afterSuccess(st, res, rand) {
  if (res.depletes) {
    st.remaining -= 1;
    return st.remaining <= 0;
  }
  return rand() < (res.depleteChance || 0);
}

// bonus: flat success chance added by planet quirks (Magnetic Storms), applied after clamping.
export function attemptGather(state, res, tool, rand, bonus = 0) {
  const level = levelForXp(state.xp[res.skill] || 0);
  return rand() < Math.min(0.98, successChance(level, nodeLevel(res), tool.tier) + bonus);
}
