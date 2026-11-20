// Headless check for quirk mechanics + new save fields (jsc -m experiments/rpg/tests/quirk_check.mjs)
import { createQuirkRuntime, discoverSites, crystalCompass, DISCOVER_RADIUS, TIDE_AMPLITUDE } from '../js/quirk_mechanics.js';
import { generateSystem, generatePlanet, sampleHeight } from '../js/worldgen.js';
import { serialize, deserialize } from '../js/save.js';
import { createInventory } from '../js/inventory.js';
import { randomLook, lookToOpts, DEFAULT_LOOK } from '../js/character_look.js';

const log = typeof print === 'function' ? print : console.log;
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; log('  FAIL: ' + m); } };

// Storms: one arrives, lasts ~30s, boosts mining only while active, then a gap.
{
  let r = 0.5;
  const rt = createQuirkRuntime(['magnetic_storms'], () => r);
  ok(rt.miningBonus() === 0 && !rt.minimapStatic(), 'no storm at start');
  let started = -1, ended = -1;
  for (let t = 0; t < 400; t += 0.5) {
    for (const ev of rt.update(0.5)) { if (ev === 'stormStart' && started < 0) started = rt.t; if (ev === 'stormEnd' && ended < 0) ended = rt.t; }
    if (started > 0 && ended < 0 && rt.t > started + 5) { ok(rt.miningBonus() > 0, 'storm bonus while active'); ok(rt.minimapStatic(), 'static while active'); }
  }
  ok(started > 0 && started < 200, `first storm arrives (t=${started})`);
  ok(Math.abs(ended - started - 30) <= 0.5, `storm lasts 30s (${ended - started})`);
  ok(rt.miningBonus() === 0 || rt.storm.active, 'bonus off outside storms');
  log(`  storm: first at ${started.toFixed(0)}s, next at ${rt.storm.nextAt.toFixed(0)}s`);
}

// Tides: a full cycle passes through all four phases; submersion follows the sea level.
{
  const rt = createQuirkRuntime(['tidal_shores']);
  const phases = new Set();
  let maxOff = -9, minOff = 9;
  for (let t = 0; t < 240; t += 1) { rt.update(1); phases.add(rt.tidePhase()); maxOff = Math.max(maxOff, rt.seaOffset()); minOff = Math.min(minOff, rt.seaOffset()); }
  ok(['low', 'high', 'rising', 'ebbing'].every((p) => phases.has(p)), 'tide hits all phases: ' + [...phases]);
  ok(Math.abs(maxOff - TIDE_AMPLITUDE) < 0.02 && Math.abs(minOff + TIDE_AMPLITUDE) < 0.02, 'tide amplitude');
  const calm = createQuirkRuntime([]);
  ok(!calm.isSubmerged(-5), 'no tides, nothing submerged');
  ok(!createQuirkRuntime(['tidal_shores'], Math.random, 'chasm').tide, 'no tides without a sea');
}

// A tidal planet actually has shoreline nodes the tide covers (and uncovers).
{
  let found = null;
  for (let k = 0; k < 60 && !found; k++) {
    const sys = generateSystem('tidecheck' + k);
    const meta = sys.planets.find((p) => p.quirks.includes('tidal_shores'));
    if (meta) found = meta;
  }
  ok(!!found, 'found a tidal planet');
  for (let k = 0; k < 40; k++) for (const p of generateSystem('tideborder' + k).planets) if (p.quirks.includes('tidal_shores')) ok(p.border === 'sea', `tidal planet ${p.name} has a sea (${p.quirks})`);
  if (found) {
    const P = generatePlanet(found);
    const nodes = P.sites.flatMap((s) => s.nodes);
    const ys = nodes.map((n) => sampleHeight(P, n.x, n.z));
    const tidal = ys.filter((y) => y - 0.05 < TIDE_AMPLITUDE).length;
    const alwaysDry = ys.filter((y) => y - 0.05 >= TIDE_AMPLITUDE).length;
    ok(tidal >= 3, `tidal nodes exist (${tidal})`);
    ok(alwaysDry > tidal, 'most nodes stay dry');
    log(`  tidal planet ${found.name}: ${tidal} of ${nodes.length} nodes go under at high tide`);
  }
}

// Discovery + Singing Crystals compass.
{
  const sites = [{ id: 'a', x: 10, z: 0 }, { id: 'b', x: 50, z: 0 }, { id: 'c', x: 0, z: -40 }, { id: 'd', x: 5, z: 5, lone: true }];
  const seen = new Set();
  const f1 = discoverSites(sites, 0, 0, DISCOVER_RADIUS, seen);
  ok(f1.length === 1 && f1[0].id === 'a' && seen.has('a'), 'discovers the near site, skips lone nodes');
  ok(discoverSites(sites, 0, 0, DISCOVER_RADIUS, seen).length === 0, 'no repeat discoveries');
  const c = crystalCompass(sites, 0, 0, 60, seen);
  ok(c && c.site.id === 'c', 'compass points at the nearest undiscovered site');
  ok(Math.abs(c.angle - Math.PI) < 1e-6, 'compass bearing (site to -z)');
  ok(createQuirkRuntime(['spore_fog']).discoverRadius < DISCOVER_RADIUS, 'spore fog shrinks discovery');
}

// Save carries the character look and discovered sites.
{
  const look = randomLook(() => 0.3);
  const state = { inventory: createInventory(), xp: { mining: 0, foraging: 0 }, credits: 0, bank: {}, permits: new Set([0]), visited: new Set([0]),
    planetIndex: 0, playtime: 1, quests: {}, look, discovered: { 0: ['site1', 'site4'], bogus: 3 } };
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state, { slotId: 'slot1', seed: 'x1' }))));
  ok(back.look && back.look.body === look.body && back.look.colors.skin === look.colors.skin, 'look round-trips');
  ok(back.discovered[0].length === 2 && !('bogus' in back.discovered), 'discovered round-trips (cleaned)');
  const old = deserialize({ version: 1, seed: 'x2' });
  ok(old.look === null && Object.keys(old.discovered).length === 0, 'old saves load without look/discovered');
  const o = lookToOpts(DEFAULT_LOOK);
  ok(Math.abs(o.weight - -0.1) < 1e-9 && o.outfit.top === 'shirt', 'lookToOpts mirrors the lab mapping');
}

log(failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED');
