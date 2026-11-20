// Headless world-gen check. Run with macOS JavaScriptCore:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc -m experiments/rpg/tests/worldgen_check.mjs
import { generateSystem, generatePlanet, worldToCell, RESOURCE_BY_ID } from '../js/worldgen.js';
import { findPath, nearestReachable } from '../js/pathfind.js';

const log = typeof print === 'function' ? print : console.log;
const seeds = ['alpha', 'zuzu', 'dustin', '12345', 'frontier'];
let failures = 0;
const fail = (msg) => { failures++; log('  FAIL: ' + msg); };

for (const seed of seeds) {
  const sys = generateSystem(seed);
  log(`System "${seed}": ${sys.planets.length} planets`);
  // Determinism
  const again = generateSystem(seed);
  if (JSON.stringify(again) !== JSON.stringify(sys)) fail('system not deterministic');

  for (const meta of sys.planets) {
    const t0 = Date.now();
    const P = generatePlanet(meta);
    const ms = Date.now() - t0;
    let reach = 0, land = 0;
    for (let i = 0; i < P.reach.length; i++) { if (P.reach[i]) reach++; if (P.land[i]) land++; }
    const nodes = P.sites.reduce((a, s) => a + s.nodes.length, 0);
    const bySkill = P.sites.reduce((a, s) => { a[s.skill] = (a[s.skill] || 0) + 1; return a; }, {});
    log(`  ${meta.index} ${meta.name.padEnd(10)} T${meta.tier} ${meta.sizeLabel.padEnd(6)} d=${meta.diameter} masses=${meta.landmassCount} border=${meta.border.padEnd(11)} quirks=[${meta.quirks.join(',')}] ` +
      `grid=${P.W} reach=${(100 * reach / Math.max(1, land)).toFixed(0)}% sites=${P.sites.length} (m${bySkill.mining || 0}/f${bySkill.foraging || 0}) nodes=${nodes} camps=${P.camps.length} ${ms}ms`);

    // Checks
    const s = worldToCell(P, P.spawn.x, P.spawn.z);
    if (!P.reach[s.gy * P.W + s.gx]) fail(`${meta.name}: spawn not reachable`);
    if (reach / Math.max(1, land) < 0.45) fail(`${meta.name}: low reachability`);
    const t1m = P.sites.some((x) => x.skill === 'mining' && x.tier === 1);
    const t1f = P.sites.some((x) => x.skill === 'foraging' && x.tier === 1);
    if (!t1m || !t1f) fail(`${meta.name}: missing T1 mining/foraging site`);
    if (meta.isStarter && meta.quirks.length > 1) fail('starter has >1 quirk');
    for (const c of P.camps) { const g = worldToCell(P, c.x, c.z); if (!P.reach[g.gy * P.W + g.gx] && !nearestReachable(P, g.gx, g.gy, 5)) fail(`${meta.name}: camp ${c.name} unreachable`); }
    const perMass = {}; for (let i = 0; i < P.land.length; i++) { const l = P.land[i]; if (!l || l === 255) continue; perMass[l] = perMass[l] || [0, 0]; perMass[l][0]++; if (P.reach[i]) perMass[l][1]++; }
    for (const k of Object.keys(perMass)) if (perMass[k][1] / perMass[k][0] < 0.4) fail(`${meta.name}: landmass ${k} only ${(100 * perMass[k][1] / perMass[k][0]).toFixed(0)}% reachable`);
    for (const site of P.sites) {
      if (!RESOURCE_BY_ID[site.resourceId]) fail(`bad resource ${site.resourceId}`);
    }
    // Determinism of planet
    const P2 = generatePlanet(meta);
    if (P2.sites.length !== P.sites.length || P2.boulders.length !== P.boulders.length) fail(`${meta.name}: planet not deterministic`);

    // Pathfind spawn -> each site
    let unreachableSites = 0;
    const tp = Date.now();
    for (const site of P.sites) {
      const n = site.nodes[0];
      const tgt = nearestReachable(P, n.gx, n.gy, 4);
      if (!tgt) { unreachableSites++; continue; }
      const path = findPath(P, s.gx, s.gy, tgt.gx, tgt.gy);
      if (!path) unreachableSites++;
    }
    if (unreachableSites) fail(`${meta.name}: ${unreachableSites} sites unreachable by A*`);
    log(`     pathfinding to ${P.sites.length} sites: ${Date.now() - tp}ms; sites: ${P.sites.slice(0, 5).map((x) => x.name).join(' | ')}`);
  }
}
log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
