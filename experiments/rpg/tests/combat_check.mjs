// Headless check for the M2 combat core (jsc -m experiments/rpg/tests/combat_check.mjs)
import { maxHp, hitDamage, armorReduce, combatXp, canEquip, equipFromInventory, unequip, splitForCrate, totalArmor, weaponOf, UNARMED } from '../js/combat.js';
import { spawnCreatures, updateCreatures, hurtCreature, safeZones, inSafeZone } from '../js/creatures.js';
import { generateSystem, generatePlanet, worldToCell } from '../js/worldgen.js';
import { createInventory, addItem } from '../js/inventory.js';
import { ITEMS } from '../data/items.js';
import { serialize, deserialize } from '../js/save.js';
import { CREATURES } from '../data/creatures.js';

const log = typeof print === 'function' ? print : console.log;
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; log('  FAIL: ' + m); } };
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// Rules
ok(maxHp(1) === 60 && maxHp(10) === 150, 'max hp curve');
let lo = 99, hi = 0;
for (let k = 0; k < 500; k++) { const d = hitDamage(10, 1, rand); lo = Math.min(lo, d); hi = Math.max(hi, d); }
ok(lo >= 6 && hi <= 12 && lo < hi, `hit spread ${lo}-${hi}`);
ok(armorReduce(20, 0) === 20 && armorReduce(20, 40) === 10 && armorReduce(1, 99) === 1, 'armor reduction');
ok(combatXp(10).melee === 40 && combatXp(9).vitality === 12, 'combat xp split');

// Equipment
const state = { inventory: createInventory(), xp: { mining: 0, foraging: 0, melee: 0, vitality: 0 }, equipment: { weapon: null, head: null, body: null, legs: null } };
addItem(state.inventory, 'bismuth_machete'); addItem(state.inventory, 'cobalt_spear'); addItem(state.inventory, 'bismuth_helmet'); addItem(state.inventory, 'bismuth_pick');
ok(weaponOf(state) === UNARMED, 'unarmed by default');
ok(equipFromInventory(state, 0).ok && state.equipment.weapon === 'bismuth_machete' && !state.inventory[0], 'equip machete');
ok(!canEquip(state, ITEMS.cobalt_spear).ok, 'cobalt spear needs Melee 10');
ok(equipFromInventory(state, 2).ok && totalArmor(state) === ITEMS.bismuth_helmet.armor, 'helmet armor counts');
ok(weaponOf(state).damage === ITEMS.bismuth_machete.damage, 'weapon stats');
ok(unequip(state, 'head').ok && totalArmor(state) === 0, 'unequip');
const { keep, crate } = splitForCrate(state.inventory);
ok(keep.filter(Boolean).every((s) => ITEMS[s.id].kind === 'tool') && crate.length === 2, 'death keeps tools only');

// Save round trip of the new fields
const save = deserialize(JSON.parse(JSON.stringify(serialize({ ...state, credits: 0, bank: {}, permits: new Set([0]), visited: new Set([0]), planetIndex: 0, playtime: 0, quests: {}, name: 'T', hp: 37,
  crate: { planetIndex: 0, x: 3, z: 4, items: crate } }, { slotId: 'slot1', seed: 's' }))));
ok(save.equipment.weapon === 'bismuth_machete' && save.hp === 37 && save.crate.items.length === 2, 'equipment/hp/crate round-trip');

// Creatures on a real planet
const sys = generateSystem('combatcheck1');
const P = generatePlanet(sys.planets[0]);
const list = spawnCreatures(P);
const zones = safeZones(P);
ok(list.length >= 8, `creatures spawned (${list.length})`);
ok(list.every((c) => !inSafeZone(zones, c.x, c.z)), 'no creatures inside settlements');
const fams = new Set(list.map((c) => c.family));
ok(fams.has('skarl') && fams.has('grondak'), `Skarl and Grondak both spawn (${[...fams].join(', ')})`);
ok(list.every((c) => (CREATURES[c.family].spawnWeight || 0) > 0), 'only enabled families spawn');
log(`  ${list.filter((c) => c.family === 'grondak').length} Grondak, ${list.filter((c) => c.family === 'skarl').length} Skarl`);
const canStand = (x, z) => { const c = worldToCell(P, x, z); return c.gx >= 0 && c.gy >= 0 && c.gx < P.W && c.gy < P.H && !!P.passable[c.gy * P.W + c.gx]; };
// stand a few meters from one pack and let it come
const c0 = list[0];
const player = { x: c0.denX + 6, z: c0.denZ, alive: true };
let attacks = 0, chased = false;
for (let t = 0; t < 20; t += 0.05) {
  const ev = updateCreatures(list, { t, dt: 0.05, player, canStand, zones, rand });
  if (list.some((c) => c.state === 'chase')) chased = true;
  attacks += ev.length;
}
ok(chased, 'pack notices a nearby player');
ok(attacks > 0, `pack attacks (${attacks})`);
// kill one and watch it respawn
ok(hurtCreature(c0, 9999, 30) && c0.state === 'dead', 'creature dies');
updateCreatures(list, { t: 30 + 80, dt: 0.05, player: { x: 0, z: 0, alive: false }, canStand, zones, rand });
ok(c0.state === 'idle' && c0.hp === c0.maxHp, 'creature respawns');
// player in the outpost: nobody follows
const safe = { x: P.outpost.x, z: P.outpost.z, alive: true };
for (let t = 200; t < 215; t += 0.05) updateCreatures(list, { t, dt: 0.05, player: safe, canStand, zones, rand });
ok(list.every((c) => !inSafeZone(zones, c.x, c.z)), 'creatures never enter a settlement');
log(`  ${list.length} creatures in ${new Set(list.map((c) => c.denX)).size} packs on ${P.meta.name}`);

// Balance sanity: a fresh drifter with a Bismuth Machete vs a tier-1 Skarl pack (fight them one at a time, all bite)
{
  const w = ITEMS.bismuth_machete, sk = CREATURES.skarl;
  let wins = 0, hpLeft = 0;
  for (let trial = 0; trial < 300; trial++) {
    let hp = 60, foes = Array.from({ length: sk.pack[1] }, () => sk.hp[0]), t = 0, pa = 0, ea = foes.map(() => Math.random() * 2.4);
    while (hp > 0 && foes.some((f) => f > 0) && t < 300) {
      t += 0.1; pa -= 0.1;
      if (pa <= 0) { pa = w.ticks * 0.6; const i = foes.findIndex((f) => f > 0); foes[i] -= hitDamage(w.damage, 1, rand); }
      foes.forEach((f, i) => { if (f > 0) { ea[i] -= 0.1; if (ea[i] <= 0) { ea[i] = sk.ticks * 0.6; hp -= 1 + Math.floor(rand() * sk.damage[0]); } } });
    }
    if (hp > 0) { wins++; hpLeft += hp; }
  }
  log(`  machete vs ${sk.pack[1]} tier-1 Skarl: win ${Math.round(wins / 3)}%, avg hp left ${Math.round(hpLeft / Math.max(1, wins))}/60`);
  ok(wins / 300 > 0.8, 'a fresh drifter with a machete usually survives a tier-1 pack');
}

log(failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED');
