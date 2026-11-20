// 28-slot inventory (RuneScape-style). Pure JS.
import { ITEMS } from '../data/items.js';

export const INV_SIZE = 28;

export function createInventory() {
  return new Array(INV_SIZE).fill(null);
}

export function freeSlots(inv) {
  return inv.reduce((n, s) => n + (s ? 0 : 1), 0);
}

export function canAdd(inv, id) {
  const def = ITEMS[id];
  if (def && def.stackable && inv.some((s) => s && s.id === id)) return true;
  return freeSlots(inv) > 0;
}

// Returns how many were added.
export function addItem(inv, id, qty = 1) {
  const def = ITEMS[id];
  if (!def) return 0;
  if (def.stackable) {
    const s = inv.find((x) => x && x.id === id);
    if (s) { s.qty += qty; return qty; }
    const i = inv.indexOf(null);
    if (i < 0) return 0;
    inv[i] = { id, qty };
    return qty;
  }
  let added = 0;
  while (added < qty) {
    const i = inv.indexOf(null);
    if (i < 0) break;
    inv[i] = { id, qty: 1 };
    added++;
  }
  return added;
}

export function countItem(inv, id) {
  return inv.reduce((n, s) => n + (s && s.id === id ? s.qty : 0), 0);
}

export function removeItems(inv, id, qty) {
  let left = qty;
  for (let i = inv.length - 1; i >= 0 && left > 0; i--) {
    const s = inv[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(s.qty, left);
    s.qty -= take;
    left -= take;
    if (s.qty <= 0) inv[i] = null;
  }
  return qty - left;
}

export function removeAt(inv, i) {
  const s = inv[i];
  inv[i] = null;
  return s;
}
