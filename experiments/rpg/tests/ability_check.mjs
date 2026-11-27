// Headless check for M2 Phase B abilities (jsc -m experiments/rpg/tests/ability_check.mjs)
import { resolveShape, inShape, targetsHit, bestRounds, weaponHitBase, abilityIdsFor } from '../js/abilities.js';
import { ABILITIES, WEAPON_ABILITIES } from '../data/abilities.js';
import { ITEMS } from '../data/items.js';
import { createInventory, addItem } from '../js/inventory.js';
import { xpForLevel } from '../data/skills.js';

const log = typeof print === 'function' ? print : console.log;
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; log('  FAIL: ' + m); } };
const P = { x: 0, z: 0 };

// Shapes aimed toward +z
const line = resolveShape(ABILITIES.thrust, P, { x: 0, z: 10 });
ok(inShape(line, 0, 4) && !inShape(line, 0, 7) && !inShape(line, 2, 2) && !inShape(line, 0, -2), 'line covers its length and width only');
const cone = resolveShape(ABILITIES.sweep, P, { x: 0, z: 10 });
ok(inShape(cone, 0, 2.5) && inShape(cone, 1.5, 1.5) && !inShape(cone, 0, -2) && !inShape(cone, 0, 4), 'cone covers a wedge in front');
const circ = resolveShape(ABILITIES.slam, P, { x: 0, z: 10 });
ok(Math.abs(circ.cz - 3) < 1e-6 && inShape(circ, 0.5, 3.5) && !inShape(circ, 0, 0), 'circle clamps to range and hits around its center');
const self = resolveShape(ABILITIES.whirl, P, { x: 5, z: 0 });
ok(inShape(self, -2.5, 0) && !inShape(self, 5, 0), 'self circle surrounds you');
// aiming direction follows the mouse
const side = resolveShape(ABILITIES.quickdraw, P, { x: 10, z: 0 });
ok(inShape(side, 8, 0) && !inShape(side, 0, 8), 'line points at the mouse');

// first vs all
const foes = [{ x: 0, z: 2 }, { x: 0, z: 4 }, { x: 3, z: 3 }];
ok(targetsHit(ABILITIES.quickdraw, side, foes).length === 0, 'miss means nothing');
const fwd = resolveShape(ABILITIES.quickdraw, P, { x: 0, z: 10 });
ok(targetsHit(ABILITIES.quickdraw, fwd, foes).length === 1 && targetsHit(ABILITIES.quickdraw, fwd, foes)[0].z === 2, 'first-hit takes the nearest');
ok(targetsHit(ABILITIES.pierce, resolveShape(ABILITIES.pierce, P, { x: 0, z: 10 }), foes).length === 2, 'piercing hits everything in line');

// Data integrity: every weapon's abilities exist, every weapon item has abilities
for (const [w, ids] of Object.entries(WEAPON_ABILITIES)) {
  ok(!!ITEMS[w], `weapon item ${w} exists`);
  for (const id of ids) ok(!!ABILITIES[id], `${w}: ability ${id} exists`);
  ok(ids.length >= 2 && ids.length <= 4, `${w} has 2-4 abilities`);
}
for (const d of Object.values(ITEMS)) if (d.kind === 'weapon') ok(!!WEAPON_ABILITIES[d.id], `${d.id} has abilities`);
// every ability animation is in the curated clip list
const curated = readFile('tools/curate_character_assets.py');
for (const [id, a] of Object.entries(ABILITIES)) ok(curated.includes(`'${a.clip}'`), `${id}: clip ${a.clip} is curated`);

// Ammo: best usable rounds, gated by Ranged level; guns without rounds can't fire
const st = { inventory: createInventory(), xp: { ranged: 0 }, equipment: { weapon: 'standard_revolver' } };
ok(weaponHitBase(st, ITEMS.standard_revolver) === null, 'no rounds, no shot');
addItem(st.inventory, 'cobalt_rounds', 25); addItem(st.inventory, 'bismuth_rounds', 25);
ok(bestRounds(st).id === 'bismuth_rounds', 'cobalt rounds need Ranged 10');
st.xp.ranged = xpForLevel(10);
ok(bestRounds(st).id === 'cobalt_rounds' && weaponHitBase(st, ITEMS.standard_revolver) === ITEMS.standard_revolver.damage * 1.6, 'better rounds, more damage');
ok(st.inventory.filter(Boolean).length === 2 && st.inventory.find((s) => s && s.id === 'bismuth_rounds').qty === 25, 'rounds stack');
ok(abilityIdsFor(st).join() === 'quickdraw,fan,dive', 'revolver abilities on the hotbar');
ok(abilityIdsFor({ equipment: { weapon: null } }).length === 0, 'unarmed has no abilities');

log(failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED');
