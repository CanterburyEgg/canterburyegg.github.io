// Headless quest engine check (jsc -m experiments/rpg/tests/quest_check.mjs)
import { generateSystem, generatePlanet } from '../js/worldgen.js';
import { QUEST_BY_ID } from '../data/quests/index.js';
import { resolveSlots, fillText, pickEntry, quirkLine, journalEntry, slotRef } from '../js/quests.js';
import { createInventory, addItem } from '../js/inventory.js';

const log = typeof print === 'function' ? print : console.log;
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; log('  FAIL: ' + m); } };

const q = QUEST_BY_ID.a_clean_break;
for (const seed of ['alpha', 'zuzu', 'frontier']) {
  const sys = generateSystem(seed);
  const P = generatePlanet(sys.planets[0]);
  const slots = resolveSlots(q, P);
  ok(slots.ore.id && slots.fiber.id, `${seed}: ore/fiber resolve to item ids`);
  ok(slots.oreQty.num === 4 && slots.fiberQty.num === 3, 'quantities');
  const intro = fillText(q.dialogue.nodes.intro_need.lines[0], slots);
  ok(!/\{\w+\}/.test(intro), `${seed}: no unfilled slots in intro_need`);
  log(`  ${seed}: "${intro}"`);
  log(`  ${seed} quirk line: "${quirkLine(q, P, slots)}"`);

  const inv = createInventory();
  const base = { step: 1, flags: {}, inventory: inv, slots };
  ok(pickEntry(q.dialogue.entry, { ...base, step: 0 }) === 'intro', 'step 0 → intro');
  ok(pickEntry(q.dialogue.entry, base) === 'reminder', 'step 1 without items → reminder');
  addItem(inv, slots.ore.id, 4);
  addItem(inv, slots.fiber.id, 3);
  ok(pickEntry(q.dialogue.entry, base) === 'return_ready', 'step 1 with items → return_ready');
  ok(pickEntry(q.dialogue.entryByCast.dustin, { ...base, step: 2 }) === 'dustin_fixed', 'dustin after');

  const st = { inventory: inv, quests: { a_clean_break: { step: 1, slots } } };
  const j = journalEntry(q, st);
  ok(j.objectives.length === 2 && j.objectives.every((o) => o.done), 'journal objectives complete');
  ok(slotRef('{ore}', slots, 'id') === slots.ore.id, 'slotRef id');
}
// Every node reference resolves
const nodes = q.dialogue.nodes;
for (const [id, n] of Object.entries(nodes)) {
  if (n.next) ok(nodes[n.next], `node ${id} → missing ${n.next}`);
  for (const o of n.options || []) ok(nodes[o.next], `option in ${id} → missing ${o.next}`);
}
for (const e of [...q.dialogue.entry, ...Object.values(q.dialogue.entryByCast).flat()]) ok(nodes[e.node], `entry → missing ${e.node}`);
log(failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED');
