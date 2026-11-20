// Headless gathering + inventory check (jsc -m experiments/rpg/tests/gathering_check.mjs)
import { createInventory, addItem, countItem, removeItems, freeSlots, INV_SIZE } from '../js/inventory.js';
import { checkGather, successChance, nodeLevel, initialNodeState, afterSuccess, ATTEMPT_SECONDS, bestTool } from '../js/gathering.js';
import { RESOURCE_BY_ID } from '../js/worldgen.js';
import { levelForXp, xpForLevel } from '../data/skills.js';
import { ITEMS, STARTER_ITEMS } from '../data/items.js';

const log = typeof print === 'function' ? print : console.log;
let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; log('  FAIL: ' + msg); } };

// --- inventory ---
const inv = createInventory();
STARTER_ITEMS.forEach((id) => addItem(inv, id));
ok(freeSlots(inv) === INV_SIZE - 3, 'starter tools take 3 slots');
ok(addItem(inv, 'bismuth_ore', 30) === 25, 'only 25 ore fit');
ok(freeSlots(inv) === 0, 'inventory full');
ok(removeItems(inv, 'bismuth_ore', 5) === 5 && countItem(inv, 'bismuth_ore') === 20, 'remove 5 ore');

// --- checks ---
const st = { inventory: createInventory(), xp: { mining: 0, foraging: 0 } };
const bis = RESOURCE_BY_ID.bismuth_ore, cob = RESOURCE_BY_ID.cobalt_ore, cap = RESOURCE_BY_ID.shelf_cap;
ok(!checkGather(st, bis).ok && /need a pick/.test(checkGather(st, bis).reason), 'no pick → need a pick');
addItem(st.inventory, 'bismuth_pick');
ok(checkGather(st, bis).ok, 'can mine bismuth with bismuth pick');
ok(/level 10/.test(checkGather(st, cob).reason), 'cobalt needs level 10');
addItem(st.inventory, 'cobalt_pick');
st.xp.mining = xpForLevel(10);
ok(bestTool(st.inventory, 'pick', 10).usable.id === 'cobalt_pick', 'best tool picks cobalt at 10');
st.xp.foraging = xpForLevel(10);
ok(/gloves/.test(checkGather(st, cap).reason), 'shelf cap needs gloves');

// --- pacing simulation: always use the best node/tool available, bank trip every 25 items (~40s) ---
function simulate(skill, targetLevel) {
  let xp = 0, t = 0, carried = 0;
  const tiers = skill === 'mining' ? ['bismuth_ore', 'cobalt_ore', 'tungsten_ore'] : ['bristle_reed', 'coil_vine', 'lantern_log'];
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  while (levelForXp(xp) < targetLevel && t < 3600 * 20) {
    const lvl = levelForXp(xp);
    const res = RESOURCE_BY_ID[[...tiers].reverse().find((id) => nodeLevel(RESOURCE_BY_ID[id]) <= lvl)];
    const toolTier = lvl >= 20 ? 3 : lvl >= 10 ? 2 : 1;
    const nodeSt = initialNodeState(res, rand);
    let depleted = false;
    while (!depleted) {
      t += ATTEMPT_SECONDS;
      if (rand() < successChance(lvl, nodeLevel(res), toolTier)) {
        xp += res.xp; carried++;
        depleted = afterSuccess(nodeSt, res, rand);
        if (carried >= 25) { t += 40; carried = 0; }
      }
    }
    t += 3; // walk to the next node in the site
  }
  return t / 60;
}
for (const skill of ['mining', 'foraging']) {
  const m10 = simulate(skill, 10), m25 = simulate(skill, 25), m50 = simulate(skill, 50);
  log(`  ${skill}: L10 ${m10.toFixed(0)} min · L25 ${m25.toFixed(0)} min · L50 ${(m50 / 60).toFixed(1)} h (pure skilling)`);
}
log(`  chance at L1 vs T1 node w/ T1 tool: ${(successChance(1, 1, 1) * 100).toFixed(0)}%; L20 vs T1 w/ T3: ${(successChance(20, 1, 3) * 100).toFixed(0)}%`);
log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
