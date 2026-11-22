// =====================================================================
// COMBAT RULES (M2 core). Pure JS: no DOM, no Three.js, testable headlessly.
// Auto-attacks always hit (no RS whiffs); armor reduces damage taken; levels add a little.
// =====================================================================
import { ITEMS } from '../data/items.js';
import { SLOTS } from '../data/equipment.js';
import { levelForXp } from '../data/skills.js';

export const TICK = 0.6;                 // seconds per game tick
export const UNARMED = { damage: 2, ticks: 4, reach: 1.5, weaponKind: 'fists' };
export const REGEN = { delaySec: 6, perSec: 0.6 }; // out of combat

export function maxHp(vitalityLevel) { return 50 + 10 * vitalityLevel; }
export function hpOf(state) { return maxHp(levelForXp(state.xp.vitality || 0)); }

// Weapon the player swings (equipped melee weapon or fists).
export function weaponOf(state) {
  const id = state.equipment && state.equipment.weapon;
  return (id && ITEMS[id]) || UNARMED;
}

export function totalArmor(state) {
  let a = 0;
  for (const s of SLOTS) { const id = state.equipment && state.equipment[s]; if (id && ITEMS[id] && ITEMS[id].armor) a += ITEMS[id].armor; }
  return a;
}

// Damage a hit deals: weapon damage with some spread, plus a small level bonus. Never below 1.
export function hitDamage(base, level, rand) {
  const spread = 0.65 + rand() * 0.55;            // 65%..120% of the weapon's number
  return Math.max(1, Math.round(base * spread + (level - 1) * 0.18));
}

// Armor: each point shaves ~2.5%, diminishing (40 armor halves damage).
export function armorReduce(raw, armor) {
  return Math.max(1, Math.round(raw * 40 / (40 + armor)));
}

// XP for damage dealt: Melee gets 4 per point, Vitality a third of that (RS-style split).
export function combatXp(damage) { return { melee: damage * 4, vitality: Math.round(damage * 4 / 3) }; }

// Can this item be equipped by this player? Returns { ok, reason }.
export function canEquip(state, def) {
  if (!def || (def.kind !== 'weapon' && def.kind !== 'armor')) return { ok: false, reason: "You can't wear that." };
  const lvl = levelForXp(state.xp[def.skill] || 0);
  if (lvl < def.levelReq) {
    const skill = def.skill[0].toUpperCase() + def.skill.slice(1);
    return { ok: false, reason: `You need ${skill} level ${def.levelReq} to use the ${def.name}.` };
  }
  return { ok: true };
}

// Equip from inventory slot i: the item moves to its equipment slot, whatever was there moves back.
// Mutates state; returns { ok, reason, swapped }.
export function equipFromInventory(state, i) {
  const s = state.inventory[i];
  if (!s) return { ok: false, reason: '' };
  const def = ITEMS[s.id];
  const chk = canEquip(state, def);
  if (!chk.ok) return chk;
  const prev = state.equipment[def.slot] || null;
  state.equipment[def.slot] = s.id;
  state.inventory[i] = prev ? { id: prev, qty: 1 } : null;
  return { ok: true, swapped: prev };
}

// Unequip a slot back into the first free inventory slot.
export function unequip(state, slot) {
  const id = state.equipment[slot];
  if (!id) return { ok: false, reason: '' };
  const free = state.inventory.indexOf(null);
  if (free < 0) return { ok: false, reason: 'Your inventory is full.' };
  state.inventory[free] = { id, qty: 1 };
  state.equipment[slot] = null;
  return { ok: true };
}

// Death: tools stay with you (as do equipped items); everything else goes in the salvage crate.
export function splitForCrate(inventory) {
  const keep = inventory.map((s) => (s && ITEMS[s.id] && ITEMS[s.id].kind === 'tool' ? s : null));
  const crate = inventory.filter((s) => s && !(ITEMS[s.id] && ITEMS[s.id].kind === 'tool')).map((s) => ({ id: s.id, qty: s.qty }));
  return { keep, crate };
}

// Creature stats for a planet tier (1-based), from a CREATURES entry.
export function creatureStats(def, tier) {
  const t = Math.max(0, Math.min(def.hp.length - 1, tier - 1));
  return { hp: def.hp[t], damage: def.damage[t], xp: def.xp[t], colors: def.colors[t], name: def.biomeNames[t] || def.name, variant: (def.variants || [])[t] || null };
}
