// Headless save round-trip check (jsc -m experiments/rpg/tests/save_check.mjs)
import { serialize, deserialize, SAVE_VERSION } from '../js/save.js';
import { createInventory, addItem } from '../js/inventory.js';

const log = typeof print === 'function' ? print : console.log;
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; log('  FAIL: ' + m); } };

const state = {
  inventory: createInventory(), xp: { mining: 1234.5, foraging: 77 }, credits: 321,
  bank: { bismuth_ore: 40, pale_log: 12 }, permits: new Set([0, 2]), visited: new Set([0, 2]),
  planetIndex: 2, playtime: 4000, quests: { a_clean_break: { step: 1 } },
};
addItem(state.inventory, 'bismuth_pick');
addItem(state.inventory, 'cobalt_ore', 3);

const data = serialize(state, { slotId: 'slot1', seed: 'mossyfern42', pos: { x: 12.345, z: -8.9 }, planetName: 'Kavas' });
const json = JSON.parse(JSON.stringify(data)); // simulate storage/export
const back = deserialize(json);
ok(back.seed === 'mossyfern42', 'seed');
ok(back.planetIndex === 2, 'planet index');
ok(back.inventory.filter(Boolean).length === 4, 'inventory count');
ok(back.bank.bismuth_ore === 40, 'bank');
ok(back.xp.mining === 1234.5, 'xp');
ok(back.permits.has(2) && back.permits.has(0), 'permits');
ok(back.visited.has(2), 'visited');
ok(back.pos.x === 12.35, 'pos rounding');
ok(back.quests.a_clean_break.step === 1, 'quests');
ok(data.summary.totalLevel > 2, 'summary total level');

// Robustness
const bad = { ...json, inventory: [{ id: 'removed_item', qty: 1 }, null], bank: { ghost: 3, bismuth_ore: -2 } };
const cleaned = deserialize(bad);
ok(cleaned.inventory.every((s) => !s) && cleaned.dropped.includes('removed_item'), 'unknown items dropped');
ok(!('bismuth_ore' in cleaned.bank), 'non-positive bank qty dropped');
let threw = false;
try { deserialize({ version: SAVE_VERSION + 1, seed: 'x' }); } catch { threw = true; }
ok(threw, 'newer version rejected');
threw = false;
try { deserialize({ foo: 1 }); } catch { threw = true; }
ok(threw, 'garbage rejected');

log(failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED');
