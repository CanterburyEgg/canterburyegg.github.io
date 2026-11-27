// =====================================================================
// ABILITY RULES (M2 Phase B). Pure JS: resolving a skillshot's shape from where you stand and where
// you aim, what it hits, cooldowns, and ammo. main.js does the aiming preview, animation and effects.
// =====================================================================
import { ABILITIES, WEAPON_ABILITIES } from '../data/abilities.js';
import { ITEMS } from '../data/items.js';
import { ROUNDS } from '../data/equipment.js';
import { levelForXp } from '../data/skills.js';

export const CREATURE_RADIUS = 0.45; // creatures count as hit if their body overlaps the shape

export function abilityIdsFor(state) {
  const w = state.equipment && state.equipment.weapon;
  return (w && WEAPON_ABILITIES[w]) || [];
}

// Resolve a shape. from: {x,z} player, aim: {x,z} ground point under the mouse.
export function resolveShape(def, from, aim) {
  let dx = aim.x - from.x, dz = aim.z - from.z;
  let d = Math.hypot(dx, dz);
  if (d < 1e-3) { dx = 0; dz = 1; d = 1; }
  const ux = dx / d, uz = dz / d, angle = Math.atan2(ux, uz);
  switch (def.shape) {
    case 'line': case 'dash':
      return { type: 'line', ox: from.x, oz: from.z, ux, uz, angle, length: def.length, width: def.width };
    case 'cone':
      return { type: 'cone', ox: from.x, oz: from.z, ux, uz, angle, radius: def.radius, half: def.angle / 2 };
    case 'circle': case 'leap': {
      const r = Math.min(d, def.range);
      return { type: 'circle', cx: from.x + ux * r, cz: from.z + uz * r, radius: def.radius, ux, uz, angle, dist: r };
    }
    case 'self':
      return { type: 'circle', cx: from.x, cz: from.z, radius: def.radius, ux, uz, angle, dist: 0 };
    default:
      return null;
  }
}

// Is a point (with radius r) inside the shape?
export function inShape(s, x, z, r = CREATURE_RADIUS) {
  if (s.type === 'circle') return Math.hypot(x - s.cx, z - s.cz) <= s.radius + r;
  const px = x - s.ox, pz = z - s.oz;
  const along = px * s.ux + pz * s.uz;
  if (s.type === 'line') {
    const across = Math.abs(px * s.uz - pz * s.ux);
    return along >= -r && along <= s.length + r && across <= s.width / 2 + r;
  }
  if (s.type === 'cone') {
    const dist = Math.hypot(px, pz);
    if (dist > s.radius + r) return false;
    if (dist <= r) return true;
    const ang = Math.acos(Math.max(-1, Math.min(1, along / dist)));
    return ang <= s.half + Math.asin(Math.min(1, r / dist));
  }
  return false;
}

// Targets hit by an ability, nearest first. list: [{x, z, ...}] (alive ones only).
export function targetsHit(def, s, list) {
  if (def.hits === 'none') return [];
  const ox = s.ox ?? s.cx, oz = s.oz ?? s.cz;
  const hit = list.filter((c) => inShape(s, c.x, c.z)).sort((a, b) => Math.hypot(a.x - ox, a.z - oz) - Math.hypot(b.x - ox, b.z - oz));
  return def.hits === 'first' ? hit.slice(0, 1) : hit;
}

// The best rounds the player can fire right now (highest tier they have and are allowed to use).
export function bestRounds(state) {
  const lvl = levelForXp(state.xp.ranged || 0);
  for (const r of [...ROUNDS].reverse()) {
    if (lvl < r.levelReq) continue;
    if (state.inventory.some((s) => s && s.id === r.id && s.qty > 0)) return ITEMS[r.id];
  }
  return null;
}

// Damage per hit for the equipped weapon (guns multiply by the round tier). Null if a gun has no ammo.
export function weaponHitBase(state, weapon) {
  if (weapon.style !== 'ranged') return weapon.damage;
  const r = bestRounds(state);
  return r ? weapon.damage * r.mult : null;
}

export function abilityDef(id) { return ABILITIES[id]; }
