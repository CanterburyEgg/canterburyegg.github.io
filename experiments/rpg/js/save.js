// Saves: seed + player state in IndexedDB, multiple slots, JSON export/import.
// serialize/deserialize are pure (testable headlessly); IndexedDB is only touched inside functions.
import { ITEMS } from '../data/items.js';
import { levelForXp } from '../data/skills.js';
import { INV_SIZE } from './inventory.js';

export const SAVE_VERSION = 2; // v2: drifter name + look required (v1 prototype saves are retired)
export const SLOT_IDS = ['slot1', 'slot2', 'slot3'];
const DB_NAME = 'drifter-rpg';
const STORE = 'slots';

// ---------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------
export function serialize(state, extra) {
  const totalLevel = Object.values(state.xp).reduce((a, x) => a + levelForXp(x), 0);
  return {
    version: SAVE_VERSION,
    id: extra.slotId,
    name: state.name || 'Drifter',
    seed: extra.seed,
    planetIndex: state.planetIndex,
    pos: extra.pos ? { x: +extra.pos.x.toFixed(2), z: +extra.pos.z.toFixed(2) } : null,
    inventory: state.inventory.map((s) => (s ? { id: s.id, qty: s.qty } : null)),
    bank: { ...state.bank },
    xp: { ...state.xp },
    credits: state.credits,
    reputation: state.reputation || 0,
    permits: [...state.permits],
    visited: [...state.visited],
    quests: state.quests || {},
    look: state.look || null,
    discovered: state.discovered || {},
    playtime: Math.round(state.playtime || 0),
    savedAt: Date.now(),
    summary: { planetName: extra.planetName || '', totalLevel, name: state.name || 'Drifter' },
  };
}

// Returns a clean, validated save object (unknown items dropped). Throws on unusable data.
export function deserialize(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a save file.');
  if (typeof raw.version !== 'number') throw new Error('Missing save version.');
  if (raw.version > SAVE_VERSION) throw new Error('This save is from a newer version of the game.');
  if (raw.version < SAVE_VERSION) throw new Error('This is an old prototype save and can no longer be loaded.');
  if (typeof raw.seed !== 'string' || !raw.seed) throw new Error('Save has no world seed.');
  const dropped = [];
  const inv = new Array(INV_SIZE).fill(null);
  (Array.isArray(raw.inventory) ? raw.inventory : []).slice(0, INV_SIZE).forEach((s, i) => {
    if (!s) return;
    if (!ITEMS[s.id]) { dropped.push(s.id); return; }
    inv[i] = { id: s.id, qty: Math.max(1, Math.floor(s.qty) || 1) };
  });
  const bank = {};
  for (const [id, q] of Object.entries(raw.bank || {})) {
    if (!ITEMS[id]) { dropped.push(id); continue; }
    const n = Math.floor(q);
    if (n > 0) bank[id] = n;
  }
  const xp = { mining: 0, foraging: 0 };
  for (const [k, v] of Object.entries(raw.xp || {})) if (typeof v === 'number' && v >= 0) xp[k] = v;
  const nums = (a) => (Array.isArray(a) ? a.filter((n) => Number.isInteger(n) && n >= 0) : []);
  return {
    seed: raw.seed,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 24) : 'Drifter',
    planetIndex: Number.isInteger(raw.planetIndex) && raw.planetIndex >= 0 ? raw.planetIndex : 0,
    pos: raw.pos && typeof raw.pos.x === 'number' && typeof raw.pos.z === 'number' ? raw.pos : null,
    inventory: inv,
    bank,
    xp,
    credits: Math.max(0, Math.floor(raw.credits) || 0),
    reputation: Math.max(0, Math.floor(raw.reputation) || 0),
    permits: new Set([0, ...nums(raw.permits)]),
    visited: new Set(nums(raw.visited)),
    quests: raw.quests && typeof raw.quests === 'object' ? raw.quests : {},
    look: raw.look && typeof raw.look === 'object' && !Array.isArray(raw.look) ? raw.look : null,
    discovered: cleanDiscovered(raw.discovered),
    playtime: Math.max(0, raw.playtime || 0),
    savedAt: raw.savedAt || 0,
    summary: raw.summary || {},
    dropped,
  };
}

function cleanDiscovered(d) {
  const out = {};
  if (!d || typeof d !== 'object') return out;
  for (const [k, v] of Object.entries(d)) if (/^\d+$/.test(k) && Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string');
  return out;
}

// ---------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const result = fn(store);
    t.oncomplete = () => { db.close(); resolve(result && result.result !== undefined ? result.result : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
  }));
}

export function writeSlot(data) { return tx('readwrite', (s) => s.put(data)); }
export function readSlot(id) { return tx('readonly', (s) => s.get(id)); }
export function deleteSlot(id) { return tx('readwrite', (s) => s.delete(id)); }
export async function listSlots() {
  const out = [];
  for (const id of SLOT_IDS) out.push({ id, data: (await readSlot(id)) || null });
  return out;
}

// ---------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------
export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function readFileJSON(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { try { resolve(JSON.parse(r.result)); } catch { reject(new Error('That file is not valid JSON.')); } };
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
