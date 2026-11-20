// =====================================================================
// WORLD GENERATION. Pure JS (no Three.js): star system + planet grids.
// Grid convention: cell (gx, gy), index = gy * W + gx, CELL = 2m.
// Distances inside the generator are in CELLS unless wrapped in M(meters).
// World coords: x = (gx + 0.5 - W/2) * CELL, z = (gy + 0.5 - H/2) * CELL.
// North = -z.
// =====================================================================

import { Rng, makeNoise2D, fbm, smoothstep, lerp, clamp } from './rng.js';
import { QUIRKS, QUIRK_ROLLS, BORDER_TYPES } from '../data/quirks.js';
import { RESOURCES } from '../data/resources.js';
import { planetName, outpostName, campName, shopName, siteName } from './names.js';

export const CELL = 2;
export const WATER_Y = 0;
export const WALK_SPEED = 4.4;   // m/s (player base speed)
const ROUTE_FACTOR = 1.2;        // paths are ~20% longer than straight lines
const M = (meters) => meters / CELL;
const MARGIN = 16;               // cells
const BRIDGE_ID = 255;
const MAX_STEP = 0.8 * CELL;     // max height difference between walkable neighbor cells (m)

export const BIOME = { NONE: 0, MEADOW: 1, SCRUB: 2, ROCKY: 3, GROVE: 4, SHORE: 5 };

export const SIZE_CLASSES = {
  // Sized by tip-to-tip walking time (agreed design: ~2 / ~5 / ~8 minutes).
  small: { label: 'Small', crossSec: [105, 135], landmasses: [1, 2] },
  medium: { label: 'Medium', crossSec: [270, 330], landmasses: [1, 2] },
  large: { label: 'Large', crossSec: [440, 520], landmasses: [2, 3] },
};

// Height of the area outside the landmasses, per border type.
const OUTSIDE = {
  sea: { h: -1.6, sheer: false },
  toxic_marsh: { h: -0.6, sheer: false },
  lava: { h: -1.4, sheer: false },
  chasm: { h: -30, sheer: true },
  cliffs: { h: -9, sheer: true },
};

export function outsideHeight(border) { return (OUTSIDE[border] || OUTSIDE.sea).h; }
export const BRIDGE_Y = 0.45;

export const RESOURCE_BY_ID = {};
for (const skill of Object.keys(RESOURCES)) {
  for (const tier of Object.keys(RESOURCES[skill])) {
    for (const r of RESOURCES[skill][tier]) RESOURCE_BY_ID[r.id] = { ...r, skill, tier: Number(tier) };
  }
}

// ---------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------
export function cellToWorld(P, gx, gy) {
  return { x: (gx + 0.5 - P.W / 2) * CELL, z: (gy + 0.5 - P.H / 2) * CELL };
}
export function worldToCell(P, x, z) {
  return { gx: Math.floor(x / CELL + P.W / 2), gy: Math.floor(z / CELL + P.H / 2) };
}
function gridToWorld(P, fx, fy) {
  // fractional grid coords (cell-center space) to world
  return { x: (fx - P.W / 2) * CELL, z: (fy - P.H / 2) * CELL };
}
export function sampleHeight(P, x, z) {
  const fx = x / CELL + P.W / 2 - 0.5;
  const fy = z / CELL + P.H / 2 - 0.5;
  const x0 = clamp(Math.floor(fx), 0, P.W - 2);
  const y0 = clamp(Math.floor(fy), 0, P.H - 2);
  const tx = clamp(fx - x0, 0, 1), ty = clamp(fy - y0, 0, 1);
  const h = P.height, W = P.W;
  const a = h[y0 * W + x0], b = h[y0 * W + x0 + 1];
  const c = h[(y0 + 1) * W + x0], d = h[(y0 + 1) * W + x0 + 1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

// ---------------------------------------------------------------------
// Star system
// ---------------------------------------------------------------------
export function generateSystem(seed) {
  const rng = new Rng('system:' + seed);
  const count = rng.int(6, 8);
  const used = new Set();
  const planets = [];
  for (let i = 0; i < count; i++) {
    const isStarter = i === 0;
    let name;
    do { name = planetName(rng); } while (used.has(name));
    used.add(name);
    const sizeKey = isStarter ? rng.pick(['small', 'medium']) : rng.weighted([['small', 3], ['medium', 4], ['large', 3]]);
    const sc = SIZE_CLASSES[sizeKey];
    const quirks = rollQuirks(rng, isStarter);
    // a quirk whose mechanic needs its border (Tidal Shores needs a sea) wins over cosmetic ones
    const forcedBorder = (quirks.includes('tidal_shores') && QUIRKS.tidal_shores.border) || quirks.map((q) => QUIRKS[q].border).find(Boolean);
    planets.push({
      index: i,
      id: 'p' + i,
      name,
      isStarter,
      tier: 1 + Math.floor(i / 2),
      sizeKey,
      sizeLabel: sc.label,
      crossSec: 0,
      diameter: 0,
      landmassCount: rng.int(sc.landmasses[0], sc.landmasses[1]),
      quirks,
      border: forcedBorder || rng.pick(BORDER_TYPES),
      seed: `${seed}:planet:${i}`,
    });
    const p = planets[planets.length - 1];
    p.crossSec = Math.round(rng.range(sc.crossSec[0], sc.crossSec[1]));
    p.diameter = Math.round((p.crossSec * WALK_SPEED) / ROUTE_FACTOR);
  }
  return { seed: String(seed), planets };
}

function rollQuirks(rng, isStarter) {
  let n = isStarter ? (rng.chance(0.6) ? 1 : 0) : rng.int(QUIRK_ROLLS.min, QUIRK_ROLLS.max);
  if (isStarter) n = Math.min(n, QUIRK_ROLLS.starterMax);
  const pool = rng.shuffle(
    Object.keys(QUIRKS).filter((k) => !isStarter || !QUIRK_ROLLS.starterGentleOnly || QUIRKS[k].gentle)
  );
  const out = [];
  for (const k of pool) {
    if (out.length >= n) break;
    const clash = out.some((o) => QUIRKS[o].excludes.includes(k) || QUIRKS[k].excludes.includes(o));
    if (!clash) out.push(k);
  }
  return out;
}

function rollPlanetResources(rng, meta) {
  // M1 rule: the starter planet has T1 + T2; every other planet adds T3.
  const tiers = meta.isStarter ? [1, 2] : [1, 2, 3];
  const res = { mining: {}, foraging: {} };
  for (const skill of ['mining', 'foraging']) {
    for (const t of tiers) {
      const list = RESOURCES[skill][t];
      const n = Math.min(list.length, rng.int(1, 2));
      res[skill][t] = rng.shuffle(list.slice()).slice(0, n).map((r) => r.id);
    }
  }
  return res;
}

// ---------------------------------------------------------------------
// Planet
// ---------------------------------------------------------------------
export function generatePlanet(meta) {
  const rng = new Rng(meta.seed);
  const nShape = makeNoise2D(rng.fork('shape'));
  const nHills = makeNoise2D(rng.fork('hills'));
  const nPlat = makeNoise2D(rng.fork('plateau'));
  const nMoist = makeNoise2D(rng.fork('moisture'));
  const nLake = makeNoise2D(rng.fork('lakes'));

  const R = meta.diameter / 2 / CELL; // cells
  const margin = Math.max(MARGIN, Math.ceil(R * 0.1));
  const W = Math.ceil(R * 2 + margin * 2);
  const H = W;
  const N = W * H;

  const P = {
    meta, W, H, cell: CELL, R,
    height: new Float32Array(N),
    landField: new Float32Array(N),
    landDist: new Float32Array(N), // approx meters from the landmass edge (positive = inland)
    land: new Uint8Array(N),      // 0 = outside, 1..n = landmass id, 255 = bridge
    biome: new Uint8Array(N),
    water: new Uint8Array(N),
    plaza: new Uint8Array(N),
    trail: new Uint8Array(N),     // worn dirt trails
    walk: new Uint8Array(N),      // terrain walkable (slope/water/land)
    blocked: new Uint8Array(N),   // props/buildings/nodes
    passable: new Uint8Array(N),  // walk && !blocked
    reach: new Uint8Array(N),     // flood-filled from spawn
    resources: rollPlanetResources(rng.fork('resources'), meta),
  };

  // 1. Landmasses
  const masses = layoutLandmasses(rng.fork('masses'), meta.landmassCount, R, W / 2, H / 2);
  for (let gy = 0; gy < H; gy++) {
    for (let gx = 0; gx < W; gx++) {
      const i = gy * W + gx;
      const px = gx + 0.5, py = gy + 0.5;
      let best = -Infinity, bestId = 0, bestR = 1;
      for (const m of masses) {
        const d = Math.hypot(px - m.x, py - m.y);
        const sf = 2.4 / m.r; // coastline detail scales with landmass size
        const wob = fbm(nShape, px * sf + m.id * 13.7, py * sf - m.id * 7.3, 4);
        const f = (m.r * (1 + 0.44 * wob) - d) / m.r;
        if (f > best) { best = f; bestId = m.id; bestR = m.r; }
      }
      P.landField[i] = best;
      P.landDist[i] = best * bestR * CELL; // meters
      if (best > 0) P.land[i] = bestId;
    }
  }

  // 2. Bridges: coast to coast between the nearest shore points (or a natural land bridge
  //    if the landmasses already touch). Every extra landmass links to the main one.
  const bridges = [];
  for (let k = 1; k < masses.length; k++) {
    const a = masses[0], b = masses[k];
    if (landmassesTouch(P, a.id, b.id)) {
      bridges.push({ from: a.id, to: b.id, natural: true, gated: false });
      continue;
    }
    const pair = nearestCoastPair(P, a.id, b.id);
    if (!pair) continue;
    const dx = pair.bx - pair.ax, dy = pair.by - pair.ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const ext = M(4); // extend onto land so the ends meet the ramps
    carveBridge(P, pair.ax - ux * ext, pair.ay - uy * ext, pair.bx + ux * ext, pair.by + uy * ext, M(2.4));
    const wa = gridToWorld(P, pair.ax - ux * M(1.5), pair.ay - uy * M(1.5));
    const wb = gridToWorld(P, pair.bx + ux * M(1.5), pair.by + uy * M(1.5));
    bridges.push({ from: a.id, to: b.id, natural: false, gated: false, ax: wa.x, az: wa.z, bx: wb.x, bz: wb.z, width: 4.4 });
  }

  // 3. Heights, lakes, biomes
  const out = OUTSIDE[meta.border] || OUTSIDE.sea;
  const lakeOk = meta.border === 'lava' || meta.border === 'chasm' ? rng.chance(0.25) : rng.chance(0.65);
  for (let gy = 0; gy < H; gy++) {
    for (let gx = 0; gx < W; gx++) {
      const i = gy * W + gx;
      const px = gx + 0.5, py = gy + 0.5;
      const mx = px * CELL, my = py * CELL; // meters
      if (P.land[i] === BRIDGE_ID) {
        P.height[i] = 0.45;
        P.biome[i] = BIOME.SHORE;
        continue;
      }
      const lf = P.landField[i];
      if (lf > 0) {
        const ld = P.landDist[i];
        const coast = smoothstep(0, 30, ld);
        const hills = fbm(nHills, mx * 0.02, my * 0.02, 4);
        const pn = fbm(nPlat, mx * 0.009, my * 0.009, 3);
        const plat = smoothstep(0.1, 0.14, pn) * 4.0 * smoothstep(10, 22, ld);
        let h = 0.35 + coast * (1.0 + (hills + 0.5) * 5.0) + plat;
        if (lakeOk) {
          const ln = fbm(nLake, mx * 0.011, my * 0.011, 3);
          const lk = smoothstep(0.14, 0.22, ln) * smoothstep(6, 14, ld) * (1 - smoothstep(0.06, 0.1, pn));
          h = lerp(h, -0.9, lk);
        }
        P.height[i] = h;
        if (h < WATER_Y + 0.05) {
          P.water[i] = 1;
          P.biome[i] = BIOME.SHORE;
        } else {
          const m = fbm(nMoist, mx * 0.007, my * 0.007, 4);
          if (plat > 1.6 || hills > 0.24) P.biome[i] = BIOME.ROCKY;
          else if (ld < 3) P.biome[i] = BIOME.SHORE;
          else if (m > 0.1) P.biome[i] = BIOME.GROVE;
          else if (m > -0.12) P.biome[i] = BIOME.MEADOW;
          else P.biome[i] = BIOME.SCRUB;
        }
      } else {
        const t = out.sheer ? smoothstep(0, 0.025, -lf) : smoothstep(0, 0.1, -lf);
        P.height[i] = lerp(0.3, out.h, t);
        if (meta.border === 'sea' && P.height[i] < WATER_Y + 0.05) P.water[i] = 1;
      }
    }
  }

  // 3b. Ramp the land down to bridge height near bridge ends
  rampToBridges(P, M(45));

  // 4. Settlements: outpost on the main landmass, camps on the others
  const names = {
    outpost: outpostName(rng, meta.name),
    shop: shopName(rng),
  };
  const oSpot = findFlatSpot(P, rng, masses[0], M(17), []) || { gx: Math.floor(masses[0].x), gy: Math.floor(masses[0].y) };
  flatten(P, oSpot.gx, oSpot.gy, M(18), M(8));
  const outpost = layoutOutpost(P, rng.fork('outpost'), oSpot.gx, oSpot.gy, names);

  const camps = [];
  for (let k = 1; k < masses.length; k++) {
    const spot = findFlatSpot(P, rng, masses[k], M(7), [{ gx: oSpot.gx, gy: oSpot.gy, r: M(60) }]);
    if (!spot) continue;
    flatten(P, spot.gx, spot.gy, M(8), M(5));
    camps.push(layoutCamp(P, rng.fork('camp' + k), spot.gx, spot.gy, campName(rng), masses[k].id));
  }
  // Medium/Large planets also get a far camp on the main landmass, so bank trips stay sane.
  if (meta.sizeKey !== 'small') {
    const avoid = [{ gx: oSpot.gx, gy: oSpot.gy, r: masses[0].r * 0.55 }].concat(camps.map((c) => ({ gx: c.gx, gy: c.gy, r: M(80) })));
    const spot = findFlatSpot(P, rng, masses[0], M(7), avoid);
    if (spot) {
      flatten(P, spot.gx, spot.gy, M(8), M(5));
      const usedNames = new Set(camps.map((c) => c.name));
      let nm = campName(rng);
      for (let t = 0; t < 5 && usedNames.has(nm); t++) nm = campName(rng);
      camps.push(layoutCamp(P, rng.fork('campmain'), spot.gx, spot.gy, nm, masses[0].id));
    }
  }

  // 5. Walkability, trails, then clustered decorative props
  computeWalk(P);
  layTrails(P, rng.fork('trails'), oSpot, camps, masses);
  const nForest = makeNoise2D(rng.fork('forest'));
  const nRocks = makeNoise2D(rng.fork('rockfields'));
  const boulders = scatterBoulders(P, rng.fork('boulders'), nRocks);
  const decor = scatterDecor(P, rng.fork('decor'), nForest);

  // 6. Reachability from spawn
  const spawnCell = worldToCell(P, outpost.spawn.x, outpost.spawn.z);
  computePassableAndReach(P, spawnCell.gx, spawnCell.gy);
  ensureConnected(P, masses, bridges, decor, boulders, spawnCell);

  // 7. Resource sites
  const settlementsGrid = [{ gx: oSpot.gx, gy: oSpot.gy, r: M(26) }].concat(
    camps.map((c) => ({ gx: c.gx, gy: c.gy, r: M(12) }))
  );
  const sites = placeSites(P, rng.fork('sites'), oSpot, settlementsGrid, camps);

  // 8. Final reach pass; drop nodes that got walled off
  computePassableAndReach(P, spawnCell.gx, spawnCell.gy);
  for (const s of sites) {
    s.nodes = s.nodes.filter((n) => hasReachableNeighbor(P, n.gx, n.gy));
  }
  const finalSites = sites.filter((s) => s.nodes.length > 0);

  P.masses = masses.map((m) => ({ id: m.id, r: m.r, ...gridToWorld(P, m.x, m.y) }));
  P.bridges = bridges;
  P.outpost = outpost;
  P.camps = camps;
  P.boulders = boulders;
  P.decor = decor;
  P.sites = finalSites;
  P.spawn = outpost.spawn;
  return P;
}

// ---------------------------------------------------------------------
// Landmass layout
// ---------------------------------------------------------------------
function layoutLandmasses(rng, count, R, cx, cy) {
  // Landmasses sit close together: a short channel (sometimes they touch = natural land bridge).
  const a0 = rng.range(0, Math.PI * 2);
  const ux = Math.cos(a0), uy = Math.sin(a0), vx = -uy, vy = ux;
  const gap = M(rng.range(30, 64));
  if (count <= 1) return [{ id: 1, r: R * 0.86, x: cx, y: cy }];
  if (count === 2) {
    const rm = R * 0.56, rk = R * 0.36;
    const D = rm + rk + gap;
    const back = (rm + D + rk - (rm * 2)) / 2; // center the pair
    const mx = cx - ux * back, my = cy - uy * back;
    const tilt = rng.range(-0.25, 0.25);
    return [
      { id: 1, r: rm, x: mx, y: my },
      { id: 2, r: rk, x: mx + (ux * Math.cos(tilt) + vx * Math.sin(tilt)) * D, y: my + (uy * Math.cos(tilt) + vy * Math.sin(tilt)) * D },
    ];
  }
  const rm = R * 0.5, rk = R * 0.32;
  const D = rm + rk + gap;
  const mx = cx - ux * R * 0.3, my = cy - uy * R * 0.3;
  const out = [{ id: 1, r: rm, x: mx, y: my }];
  [-1, 1].forEach((sgn, j) => {
    const a = sgn * (0.75 + rng.range(-0.12, 0.12));
    out.push({ id: j + 2, r: rk, x: mx + (ux * Math.cos(a) + vx * Math.sin(a)) * D, y: my + (uy * Math.cos(a) + vy * Math.sin(a)) * D });
  });
  return out;
}

// Safety net: any landmass whose main body isn't reachable gets a bridge from the nearest
// reachable shore. Guarantees every landmass (and its camp) can be walked to.
function ensureConnected(P, masses, bridges, decor, boulders, spawnCell) {
  const { W, H } = P;
  let changed = false;
  for (let k = 1; k < masses.length; k++) {
    const mask = largestComponent(P, masses[k].id);
    let tot = 0, got = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) { tot++; if (P.reach[i]) got++; }
    if (!tot || got / tot > 0.3) continue;
    const A = [], B = [];
    for (let gy = 1; gy < H - 1; gy++) {
      for (let gx = 1; gx < W - 1; gx++) {
        const i = gy * W + gx;
        const edge = !P.land[i - 1] || !P.land[i + 1] || !P.land[i - W] || !P.land[i + W];
        if (!edge) continue;
        if (P.reach[i] && P.land[i] !== BRIDGE_ID) A.push([gx + 0.5, gy + 0.5]);
        else if (mask[i]) B.push([gx + 0.5, gy + 0.5]);
      }
    }
    if (!A.length || !B.length) continue;
    const sa = Math.max(1, Math.floor(A.length / 1500)), sb = Math.max(1, Math.floor(B.length / 1500));
    let best = null, bestD = Infinity;
    for (let i = 0; i < A.length; i += sa) for (let j = 0; j < B.length; j += sb) {
      const d = (A[i][0] - B[j][0]) ** 2 + (A[i][1] - B[j][1]) ** 2;
      if (d < bestD) { bestD = d; best = [A[i], B[j]]; }
    }
    const [[ax, ay], [bx, by]] = best;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const ext = M(4);
    carveForced(P, ax - ux * ext, ay - uy * ext, bx + ux * ext, by + uy * ext, M(2.4));
    const wa = gridToWorld(P, ax - ux * M(1.5), ay - uy * M(1.5));
    const wb = gridToWorld(P, bx + ux * M(1.5), by + uy * M(1.5));
    for (let i = bridges.length - 1; i >= 0; i--) if (bridges[i].to === masses[k].id) bridges.splice(i, 1);
    bridges.push({ from: 1, to: masses[k].id, natural: false, gated: false, ax: wa.x, az: wa.z, bx: wb.x, bz: wb.z, width: 4.4 });
    changed = true;
  }
  if (!changed) return;
  rampToBridges(P, M(45));
  computeWalk(P);
  const onBridge = (x, z) => { const c = worldToCell(P, x, z); return P.land[c.gy * W + c.gx] === BRIDGE_ID; };
  for (const key of Object.keys(decor)) decor[key] = decor[key].filter((d) => !onBridge(d.x, d.z));
  for (let i = boulders.length - 1; i >= 0; i--) if (onBridge(boulders[i].x, boulders[i].z)) boulders.splice(i, 1);
  computePassableAndReach(P, spawnCell.gx, spawnCell.gy);
}

function carveForced(P, ax, ay, bx, by, halfWidth) {
  const { W, H } = P;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - halfWidth - 1));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + halfWidth + 1));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - halfWidth - 1));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by) + halfWidth + 1));
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const px = gx + 0.5, py = gy + 0.5;
      const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
      if (Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) > halfWidth) continue;
      const i = gy * W + gx;
      if (P.plaza[i]) continue;
      if (P.land[i] && P.walk[i] && !P.water[i]) continue; // keep good ground as-is
      P.land[i] = BRIDGE_ID;
      P.landField[i] = 0.04;
      P.height[i] = BRIDGE_Y;
      P.water[i] = 0;
      P.blocked[i] = 0;
      P.biome[i] = BIOME.SHORE;
    }
  }
}

function landmassesTouch(P, a, b) {
  const { W, H } = P;
  let contacts = 0;
  for (let gy = 0; gy < H - 1; gy++) {
    for (let gx = 0; gx < W - 1; gx++) {
      const i = gy * W + gx;
      const l = P.land[i];
      if (l !== a && l !== b) continue;
      const other = l === a ? b : a;
      if (P.land[i + 1] === other || P.land[i + W] === other) contacts++;
    }
  }
  return contacts >= 8;
}

function largestComponent(P, id) {
  // 4-connected flood fill over cells of landmass `id`; returns a mask of the biggest piece.
  const { W, H } = P;
  const N = W * H;
  const comp = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  let bestId = -1, bestSize = 0, next = 0;
  for (let s = 0; s < N; s++) {
    if (P.land[s] !== id || comp[s] !== -1) continue;
    let head = 0, tail = 0, size = 0;
    queue[tail++] = s; comp[s] = next;
    while (head < tail) {
      const c = queue[head++]; size++;
      const cx = c % W, cy = (c / W) | 0;
      const nb = [cx > 0 ? c - 1 : -1, cx < W - 1 ? c + 1 : -1, cy > 0 ? c - W : -1, cy < H - 1 ? c + W : -1];
      for (const n of nb) {
        if (n < 0 || comp[n] !== -1 || P.land[n] !== id) continue;
        comp[n] = next; queue[tail++] = n;
      }
    }
    if (size > bestSize) { bestSize = size; bestId = next; }
    next++;
  }
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (comp[i] === bestId) mask[i] = 1;
  return mask;
}

function coastCells(P, id) {
  const { W, H } = P;
  const main = largestComponent(P, id);
  const out = [];
  for (let gy = 1; gy < H - 1; gy++) {
    for (let gx = 1; gx < W - 1; gx++) {
      const i = gy * W + gx;
      if (!main[i]) continue;
      if (!P.land[i - 1] || !P.land[i + 1] || !P.land[i - W] || !P.land[i + W]) out.push([gx + 0.5, gy + 0.5]);
    }
  }
  return out;
}

function nearestCoastPair(P, a, b) {
  const ca = coastCells(P, a), cb = coastCells(P, b);
  if (!ca.length || !cb.length) return null;
  const sa = Math.max(1, Math.floor(ca.length / 1500)), sb = Math.max(1, Math.floor(cb.length / 1500));
  let best = null, bestD = Infinity;
  for (let i = 0; i < ca.length; i += sa) {
    const [ax, ay] = ca[i];
    for (let j = 0; j < cb.length; j += sb) {
      const d = (cb[j][0] - ax) ** 2 + (cb[j][1] - ay) ** 2;
      if (d < bestD) { bestD = d; best = { ax, ay, bx: cb[j][0], by: cb[j][1] }; }
    }
  }
  return best;
}

function carveBridge(P, ax, ay, bx, by, halfWidth) {
  const { W, H } = P;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - halfWidth - 1));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + halfWidth + 1));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - halfWidth - 1));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by) + halfWidth + 1));
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      const i = gy * W + gx;
      if (P.land[i] !== 0) continue;
      const px = gx + 0.5, py = gy + 0.5;
      const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
      const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
      if (d <= halfWidth) {
        P.land[i] = BRIDGE_ID;
        P.landField[i] = 0.04;
      }
    }
  }
}

function rampToBridges(P, maxD) {
  const { W, H } = P;
  const N = W * H;
  const dist = new Float32Array(N).fill(Infinity);
  const queue = [];
  for (let i = 0; i < N; i++) if (P.land[i] === BRIDGE_ID) { dist[i] = 0; queue.push(i); }
  // Multi-source BFS (8-neighbor, approximate euclidean) over land cells
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const cx = cur % W, cy = (cur / W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (!P.land[ni] || P.land[ni] === BRIDGE_ID) continue;
        const nd = dist[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (nd < dist[ni] && nd <= maxD) { dist[ni] = nd; queue.push(ni); }
      }
    }
  }
  // Carve a gentle cone around each bridge end: height can't exceed 0.45m + 0.35m per meter of distance.
  // min() of two continuous surfaces keeps slopes bounded, so there's always a walkable ramp up.
  for (let i = 0; i < N; i++) {
    if (!P.land[i] || P.land[i] === BRIDGE_ID || dist[i] === Infinity) continue;
    const cap = 0.45 + dist[i] * CELL * 0.35;
    if (P.height[i] > cap) P.height[i] = cap;
    if (P.height[i] >= WATER_Y + 0.05) P.water[i] = 0;
  }
}

// ---------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------
function findFlatSpot(P, rng, mass, radius, avoid) {
  const { W, H } = P;
  let best = null, bestScore = Infinity;
  for (let gy = MARGIN; gy < H - MARGIN; gy += 3) {
    for (let gx = MARGIN; gx < W - MARGIN; gx += 3) {
      const i = gy * W + gx;
      if (P.land[i] !== mass.id || P.water[i] || P.landField[i] < 0.22) continue;
      if (avoid.some((a) => Math.hypot(gx - a.gx, gy - a.gy) < a.r)) continue;
      let lo = Infinity, hi = -Infinity, ok = true;
      for (let k = 0; k < 12 && ok; k++) {
        const ang = (k / 12) * Math.PI * 2;
        for (const rr of [radius * 0.5, radius]) {
          const sx = Math.floor(gx + Math.cos(ang) * rr), sy = Math.floor(gy + Math.sin(ang) * rr);
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) { ok = false; break; }
          const j = sy * W + sx;
          if (P.land[j] !== mass.id || P.water[j]) { ok = false; break; }
          lo = Math.min(lo, P.height[j]);
          hi = Math.max(hi, P.height[j]);
        }
      }
      if (!ok) continue;
      const centerBias = Math.hypot(gx - mass.x, gy - mass.y) / mass.r;
      const score = (hi - lo) + centerBias * 1.5 + rng.float() * 0.3;
      if (score < bestScore) { bestScore = score; best = { gx, gy }; }
    }
  }
  return best;
}

function flatten(P, cgx, cgy, radius, feather) {
  const { W, H } = P;
  let sum = 0, cnt = 0;
  const r0 = Math.ceil(radius);
  for (let gy = cgy - r0; gy <= cgy + r0; gy++) {
    for (let gx = cgx - r0; gx <= cgx + r0; gx++) {
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
      const i = gy * W + gx;
      if (Math.hypot(gx - cgx, gy - cgy) > radius || !P.land[i]) continue;
      sum += Math.max(0.6, P.height[i]);
      cnt++;
    }
  }
  const target = cnt ? sum / cnt : 0.8;
  const R2 = radius + feather;
  const r2c = Math.ceil(R2);
  for (let gy = cgy - r2c; gy <= cgy + r2c; gy++) {
    for (let gx = cgx - r2c; gx <= cgx + r2c; gx++) {
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
      const i = gy * W + gx;
      if (!P.land[i]) continue;
      const d = Math.hypot(gx - cgx, gy - cgy);
      const t = 1 - smoothstep(radius, R2, d);
      if (t <= 0) continue;
      P.height[i] = lerp(P.height[i], target, t);
      if (t > 0.5) {
        P.water[i] = 0;
        if (P.biome[i] === BIOME.SHORE && P.land[i] !== BRIDGE_ID) P.biome[i] = BIOME.MEADOW;
      }
      if (d <= radius) P.plaza[i] = 1;
    }
  }
}

function blockRect(P, cx, cy, w, d, rot, pad = 0.2) {
  // cx, cy in fractional grid coords; local x axis = (cos rot, sin rot), local z = (-sin rot, cos rot)
  const c = Math.cos(rot), s = Math.sin(rot);
  const ext = Math.hypot(w, d) / 2 + 1;
  for (let gy = Math.floor(cy - ext); gy <= Math.ceil(cy + ext); gy++) {
    for (let gx = Math.floor(cx - ext); gx <= Math.ceil(cx + ext); gx++) {
      if (gx < 0 || gy < 0 || gx >= P.W || gy >= P.H) continue;
      const dx = gx + 0.5 - cx, dy = gy + 0.5 - cy;
      const lx = dx * c + dy * s;
      const lz = -dx * s + dy * c;
      if (Math.abs(lx) <= w / 2 + pad && Math.abs(lz) <= d / 2 + pad) P.blocked[gy * P.W + gx] = 1;
    }
  }
}

function blockCircle(P, cx, cy, r) {
  const ccx = Math.floor(cx), ccy = Math.floor(cy);
  if (ccx >= 0 && ccy >= 0 && ccx < P.W && ccy < P.H) P.blocked[ccy * P.W + ccx] = 1;
  for (let gy = Math.floor(cy - r - 1); gy <= Math.ceil(cy + r + 1); gy++) {
    for (let gx = Math.floor(cx - r - 1); gx <= Math.ceil(cx + r + 1); gx++) {
      if (gx < 0 || gy < 0 || gx >= P.W || gy >= P.H) continue;
      if (Math.hypot(gx + 0.5 - cx, gy + 0.5 - cy) <= r) P.blocked[gy * P.W + gx] = 1;
    }
  }
}

const BUILDING_DIMS = {
  locker: { w: 5, d: 4, h: 3.0, label: 'Storage Locker' },
  shop: { w: 7, d: 5, h: 3.6, label: null },
  house: { w: 5, d: 5, h: 3.2, label: null },
  workshop: { w: 6, d: 4.5, h: 3.0, label: null },
  tower: { w: 3.5, d: 3.5, h: 7.0, label: 'Relay Tower' },
  shed: { w: 3.5, d: 3, h: 2.4, label: null },
  camp_locker: { w: 3.5, d: 2.5, h: 2.2, label: 'Camp Locker' },
  tent: { w: 3, d: 3, h: 2.4, label: null },
};

function makeBuilding(P, kind, cgx, cgy, rot, label) {
  const dims = BUILDING_DIMS[kind];
  blockRect(P, cgx, cgy, M(dims.w), M(dims.d), rot, 0.1);
  const w = gridToWorld(P, cgx, cgy);
  return { kind, label: label !== undefined ? label : dims.label, x: w.x, z: w.z, w: dims.w, d: dims.d, h: dims.h, rot };
}

function layoutOutpost(P, rng, gx, gy, names) {
  const cx = gx + 0.5, cy = gy + 0.5;
  const rot = rng.range(0, Math.PI * 2);
  const buildings = [];

  const padX = cx + Math.cos(rot) * M(12.5), padY = cy + Math.sin(rot) * M(12.5);
  const padW = gridToWorld(P, padX, padY);
  buildings.push({ kind: 'pad', label: 'Launch Pad', x: padW.x, z: padW.z, r: 4.5 });

  const flavor = rng.shuffle(['house', 'workshop', 'house', 'tower', 'shed']).slice(0, rng.int(2, 4));
  const kinds = ['locker', 'shop', ...flavor];
  const arc0 = rot + 0.8, arc1 = rot + Math.PI * 2 - 0.8;
  kinds.forEach((k, j) => {
    const a = arc0 + (arc1 - arc0) * (kinds.length === 1 ? 0.5 : j / (kinds.length - 1));
    const dist = M(11 + rng.range(0, 3));
    const bx = cx + Math.cos(a) * dist, by = cy + Math.sin(a) * dist;
    const label = k === 'shop' ? names.shop : undefined;
    buildings.push(makeBuilding(P, k, bx, by, a + Math.PI / 2, label));
  });

  blockCircle(P, cx, cy, M(1.1));
  const center = gridToWorld(P, cx, cy);
  buildings.push({ kind: 'beacon', label: names.outpost, x: center.x, z: center.z, r: 1.1 });

  const spawnG = { x: padX + (cx - padX) * 0.45, y: padY + (cy - padY) * 0.45 };
  const spawn = gridToWorld(P, spawnG.x, spawnG.y);
  const plazaAnchor = gridToWorld(P, cx + Math.cos(rot + Math.PI) * M(4), cy + Math.sin(rot + Math.PI) * M(4));

  return {
    name: names.outpost,
    shopName: names.shop,
    gx, gy,
    x: center.x, z: center.z,
    buildings,
    spawn,
    anchors: { plaza: plazaAnchor, pad: padW },
  };
}

function layoutCamp(P, rng, gx, gy, name, landmassId) {
  const cx = gx + 0.5, cy = gy + 0.5;
  const rot = rng.range(0, Math.PI * 2);
  const buildings = [];
  const padX = cx + Math.cos(rot) * M(4.5), padY = cy + Math.sin(rot) * M(4.5);
  const padW = gridToWorld(P, padX, padY);
  buildings.push({ kind: 'pad', label: 'Launch Pad', x: padW.x, z: padW.z, r: 2.8 });
  buildings.push(makeBuilding(P, 'camp_locker', cx - Math.cos(rot) * M(3.5), cy - Math.sin(rot) * M(3.5), rot + Math.PI * 1.5));
  buildings.push(makeBuilding(P, 'tent', cx + Math.cos(rot + Math.PI / 2) * M(4), cy + Math.sin(rot + Math.PI / 2) * M(4), rot, name));
  const center = gridToWorld(P, cx, cy);
  return { name, gx, gy, x: center.x, z: center.z, landmass: landmassId, buildings };
}

// ---------------------------------------------------------------------
// Walkability, props, reachability
// ---------------------------------------------------------------------
function computeWalk(P) {
  const { W, H } = P;
  for (let gy = 0; gy < H; gy++) {
    for (let gx = 0; gx < W; gx++) {
      const i = gy * W + gx;
      if (!P.land[i] || P.water[i]) { P.walk[i] = 0; continue; }
      const h = P.height[i];
      let maxd = 0;
      if (gx > 0) maxd = Math.max(maxd, stepTo(P, i - 1, h));
      if (gx < W - 1) maxd = Math.max(maxd, stepTo(P, i + 1, h));
      if (gy > 0) maxd = Math.max(maxd, stepTo(P, i - W, h));
      if (gy < H - 1) maxd = Math.max(maxd, stepTo(P, i + W, h));
      P.walk[i] = maxd <= MAX_STEP ? 1 : 0;
    }
  }
}
function stepTo(P, j, h) {
  // Only compare against neighbors you could stand on (ignore outside/water).
  if (!P.land[j] || P.water[j]) return 0;
  return Math.abs(P.height[j] - h);
}

function landCells(P) {
  const out = [];
  for (let i = 0; i < P.walk.length; i++) if (P.walk[i] && !P.plaza[i] && P.land[i] !== BRIDGE_ID) out.push(i);
  return out;
}

function scatterBoulders(P, rng, nRocks) {
  const cells = landCells(P).filter((i) => !P.trail[i]);
  const target = Math.round(cells.length * CELL * CELL * 0.0016);
  const out = [];
  let tries = 0;
  while (out.length < target && tries < target * 8) {
    tries++;
    const i = rng.pick(cells);
    if (P.blocked[i]) continue;
    const gx = i % P.W, gy = (i / P.W) | 0;
    // Rock fields: boulders cluster where the rock-field noise is high (and in rocky ground).
    const field = fbm(nRocks, gx * CELL * 0.012, gy * CELL * 0.012, 3);
    const p = (P.biome[i] === BIOME.ROCKY ? 0.35 : 0.06) + smoothstep(0.08, 0.25, field) * 0.9;
    if (!rng.chance(Math.min(1, p))) continue;
    const r = field > 0.15 ? rng.range(0.5, 1.9) : rng.range(0.6, 1.4);
    blockCircle(P, gx + 0.5, gy + 0.5, M(r * 0.85));
    const w = cellToWorld(P, gx, gy);
    out.push({ x: w.x, z: w.z, r, rot: rng.range(0, Math.PI * 2) });
  }
  return out;
}

function scatterDecor(P, rng, nForest) {
  const decor = { trees: [], shrubs: [], tufts: [] };
  const { W, H } = P;
  for (let gy = 1; gy < H - 1; gy += 2) {
    for (let gx = 1; gx < W - 1; gx += 2) {
      const jx = gx + rng.int(0, 1), jy = gy + rng.int(0, 1);
      const i = jy * W + jx;
      if (!P.walk[i] || P.plaza[i] || P.blocked[i] || P.trail[i] || P.land[i] === BRIDGE_ID) continue;
      const b = P.biome[i];
      // Forest field: dense stands where high, open clearings where low.
      const fv = fbm(nForest, jx * CELL * 0.008, jy * CELL * 0.008, 4);
      const forest = smoothstep(0.02, 0.16, fv);      // 0 = open, 1 = deep forest
      const clearing = 1 - smoothstep(-0.2, -0.05, fv); // 1 = open clearing
      const w = cellToWorld(P, jx, jy);
      const ox = rng.range(-0.4, 0.4) * CELL, oz = rng.range(-0.4, 0.4) * CELL;
      const item = { x: w.x + ox, z: w.z + oz, s: rng.range(0.75, 1.3), rot: rng.range(0, Math.PI * 2), v: rng.float() };
      const r = rng.float();
      const tree = () => { decor.trees.push(item); blockCircle(P, jx + 0.5, jy + 0.5, M(0.6)); };
      if (b === BIOME.GROVE) {
        const pt = 0.05 + forest * 0.32;
        if (r < pt) tree();
        else if (r < pt + 0.1 + forest * 0.08) decor.shrubs.push(item);
        else if (r < pt + 0.22) decor.tufts.push(item);
      } else if (b === BIOME.MEADOW) {
        const pt = 0.004 + forest * 0.16;
        if (r < pt) tree();
        else if (r < pt + 0.03 + forest * 0.08) decor.shrubs.push(item);
        else if (r < pt + 0.12 + clearing * 0.18) decor.tufts.push(item);
      } else if (b === BIOME.SCRUB) {
        if (r < forest * 0.05) tree();
        else if (r < 0.08 + forest * 0.06) decor.shrubs.push(item);
        else if (r < 0.14) decor.tufts.push(item);
      } else if (b === BIOME.SHORE) {
        if (r < 0.06) decor.tufts.push(item);
      } else if (b === BIOME.ROCKY) {
        if (r < 0.03) decor.shrubs.push(item);
      }
    }
  }
  return decor;
}

// ---------------------------------------------------------------------
// Trails: cheapest walkable routes (gentle slopes, reuse existing trail)
// from the outpost to camps (through bridges) plus a few spokes outward.
// ---------------------------------------------------------------------
function layTrails(P, rng, oSpot, camps, masses) {
  const { W, H } = P;
  const N = W * H;
  const cost = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!P.walk[i] || P.blocked[i]) { cost[i] = Infinity; continue; }
    const gx = i % W, gy = (i / W) | 0;
    const h = P.height[i];
    let slope = 0;
    if (gx < W - 1 && P.walk[i + 1]) slope = Math.max(slope, Math.abs(P.height[i + 1] - h));
    if (gy < H - 1 && P.walk[i + W]) slope = Math.max(slope, Math.abs(P.height[i + W] - h));
    cost[i] = 1 + slope * 2.5 + (P.biome[i] === BIOME.GROVE ? 0.4 : 0);
  }
  const targets = camps.map((c) => ({ gx: c.gx, gy: c.gy }));
  // Spokes toward the far reaches of the main landmass (future landmark hooks)
  const spokes = rng.int(2, 3);
  const a0 = rng.range(0, Math.PI * 2);
  for (let k = 0; k < spokes; k++) {
    const a = a0 + (k / spokes) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const m = masses[0];
    for (let f = 0.75; f > 0.3; f -= 0.08) {
      const gx = Math.floor(m.x + Math.cos(a) * m.r * f), gy = Math.floor(m.y + Math.sin(a) * m.r * f);
      if (gx < 1 || gy < 1 || gx >= W - 1 || gy >= H - 1) continue;
      if (P.walk[gy * W + gx] && !P.blocked[gy * W + gx]) { targets.push({ gx, gy }); break; }
    }
  }
  for (const t of targets) {
    const path = cheapestPath(P, cost, oSpot.gx, oSpot.gy, t.gx, t.gy);
    if (!path) continue;
    for (const c of path) {
      if (P.plaza[c]) continue;
      P.trail[c] = 1;
      cost[c] = Math.min(cost[c], 0.55); // later trails merge into earlier ones
      const gx = c % W, gy = (c / W) | 0;
      // widen organically to ~3-4m
      const side = [[1, 0], [0, 1], [-1, 0], [0, -1]][(gx * 7 + gy * 13) % 4];
      const n = (gy + side[1]) * W + gx + side[0];
      if (P.walk[n] && !P.plaza[n] && !P.blocked[n]) P.trail[n] = 1;
    }
  }
}

function cheapestPath(P, cost, sx, sy, tx, ty) {
  const { W, H } = P;
  const N = W * H;
  const g = new Float32Array(N).fill(Infinity);
  const parent = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heapI = [], heapK = [];
  const push = (id, k) => {
    let i = heapI.length; heapI.push(id); heapK.push(k);
    while (i > 0) { const p = (i - 1) >> 1; if (heapK[p] <= k) break; heapI[i] = heapI[p]; heapK[i] = heapK[p]; i = p; }
    heapI[i] = id; heapK[i] = k;
  };
  const pop = () => {
    const top = heapI[0], li = heapI.pop(), lk = heapK.pop();
    if (heapI.length) {
      let i = 0; const n = heapI.length;
      while (true) {
        const l = i * 2 + 1, r = l + 1; let m = i, mk = lk;
        if (l < n && heapK[l] < mk) { m = l; mk = heapK[l]; }
        if (r < n && heapK[r] < mk) { m = r; mk = heapK[r]; }
        if (m === i) break;
        heapI[i] = heapI[m]; heapK[i] = heapK[m]; i = m;
      }
      heapI[i] = li; heapK[i] = lk;
    }
    return top;
  };
  const start = sy * W + sx, goal = ty * W + tx;
  g[start] = 0;
  push(start, 0);
  const hw = 0.7; // heuristic weight (min step cost is 0.55)
  while (heapI.length) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % W, cy = (cur / W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (closed[ni] || cost[ni] === Infinity) continue;
        if (dx && dy && (cost[cy * W + nx] === Infinity || cost[ny * W + cx] === Infinity)) continue;
        const ng = g[cur] + cost[ni] * (dx && dy ? Math.SQRT2 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          parent[ni] = cur;
          const hx = Math.abs(nx - tx), hy = Math.abs(ny - ty);
          push(ni, ng + hw * (Math.max(hx, hy) + 0.414 * Math.min(hx, hy)));
        }
      }
    }
  }
  if (parent[goal] === -1) return null;
  const out = [];
  for (let c = goal; c !== -1 && c !== start; c = parent[c]) out.push(c);
  return out;
}

function computePassableAndReach(P, sgx, sgy) {
  const { W, H } = P;
  const N = W * H;
  for (let i = 0; i < N; i++) P.passable[i] = P.walk[i] && !P.blocked[i] ? 1 : 0;
  P.reach.fill(0);
  const start = sgy * W + sgx;
  P.passable[start] = 1; // spawn is always standable
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  queue[tail++] = start;
  P.reach[start] = 1;
  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % W, cy = (cur / W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (P.reach[ni] || !P.passable[ni]) continue;
        if (dx && dy && (!P.passable[cy * W + nx] || !P.passable[ny * W + cx])) continue;
        P.reach[ni] = 1;
        queue[tail++] = ni;
      }
    }
  }
}

function hasReachableNeighbor(P, gx, gy) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= P.W || ny >= P.H) continue;
      if (P.reach[ny * P.W + nx]) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------
// Resource sites
// ---------------------------------------------------------------------
const BIOME_FIT = {
  pick: { [BIOME.ROCKY]: 1, [BIOME.SCRUB]: 0.7, [BIOME.SHORE]: 0.4, [BIOME.MEADOW]: 0.35, [BIOME.GROVE]: 0.25 },
  hatchet: { [BIOME.GROVE]: 1, [BIOME.MEADOW]: 0.6, [BIOME.SCRUB]: 0.3, [BIOME.SHORE]: 0.2, [BIOME.ROCKY]: 0.1 },
  sickle: { [BIOME.MEADOW]: 1, [BIOME.SHORE]: 0.9, [BIOME.GROVE]: 0.5, [BIOME.SCRUB]: 0.4, [BIOME.ROCKY]: 0.1 },
  gloves: { [BIOME.GROVE]: 1, [BIOME.MEADOW]: 0.5, [BIOME.SCRUB]: 0.3, [BIOME.ROCKY]: 0.3, [BIOME.SHORE]: 0.2 },
};

const NODE_COUNTS = { pick: [4, 8], hatchet: [3, 6], sickle: [5, 8], gloves: [4, 7] };

function chooseTier(rng, n, avail) {
  const w = {
    1: Math.max(0.05, 1 - n * 1.6),
    2: n < 0.2 ? 0.05 : 0.7,
    3: n > 0.45 ? n * 1.2 : 0,
  };
  const entries = avail.map((t) => [t, w[t] || 0]).filter(([, x]) => x > 0);
  return entries.length ? rng.weighted(entries) : avail[0];
}

function placeSites(P, rng, oSpot, settlements, camps) {
  const { W, meta } = P;
  const reachCells = [];
  let dMax = 1;
  for (let i = 0; i < P.reach.length; i++) {
    if (!P.reach[i] || P.plaza[i] || P.land[i] === BRIDGE_ID) continue;
    reachCells.push(i);
    const gx = i % W, gy = (i / W) | 0;
    dMax = Math.max(dMax, Math.hypot(gx - oSpot.gx, gy - oSpot.gy));
  }
  if (!reachCells.length) return [];

  const miningW = meta.quirks.reduce((acc, q) => acc * ((QUIRKS[q].generation && QUIRKS[q].generation.miningSiteWeightMult) || 1), 1);
  const areaM2 = reachCells.length * CELL * CELL;
  const target = clamp(Math.round(areaM2 / 9000), 12, 200);
  const home = { gx: oSpot.gx, gy: oSpot.gy, maxD: M(55) };
  const homeRing = { gx: oSpot.gx, gy: oSpot.gy, maxD: M(140) };
  const plan = [
    { skill: 'mining', tier: 1, anchor: home },
    { skill: 'foraging', tier: 1, anchor: home },
  ];
  const pickSkill = () => rng.weighted([['mining', miningW], ['foraging', 1]]);
  for (let k = 0; k < 5; k++) plan.push({ skill: pickSkill(), anchor: homeRing });
  for (const c of camps) for (let k = 0; k < 2; k++) plan.push({ skill: pickSkill(), anchor: { gx: c.gx, gy: c.gy, maxD: M(75) } });
  while (plan.length < target) plan.push({ skill: pickSkill() });
  const lone = rng.int(3, 6) + Math.round(target * 0.2);
  for (let k = 0; k < lone; k++) plan.push({ skill: rng.weighted([['mining', miningW], ['foraging', 1]]), lone: true });
  // Tidal Shores: a few sites down on the low shore, which the high tide covers (quirk_mechanics.js)
  const tidal = meta.quirks.some((q) => QUIRKS[q].mechanic && QUIRKS[q].mechanic.tideCycleSec);
  const lowShore = tidal ? reachCells.filter((i) => P.height[i] >= 0.05 && P.height[i] < 0.42 && !P.blocked[i]) : [];
  if (lowShore.length > 30) for (let k = 0; k < 4; k++) plan.push({ skill: pickSkill(), shore: true });

  const sites = [];
  const usedNames = new Set();
  plan.forEach((item, idx) => {
    let best = null;
    for (let attempt = 0; attempt < 50; attempt++) {
      const i = rng.pick(item.shore ? lowShore : reachCells);
      if (P.blocked[i]) continue;
      const gx = i % W, gy = (i / W) | 0;
      const d = Math.hypot(gx - oSpot.gx, gy - oSpot.gy);
      if (d < M(26)) continue;
      const da = item.anchor ? Math.hypot(gx - item.anchor.gx, gy - item.anchor.gy) : 0;
      if (item.anchor && da > item.anchor.maxD) continue;
      if (P.trail[i]) continue;
      if (settlements.some((s) => Math.hypot(gx - s.gx, gy - s.gy) < s.r)) continue;
      const minSep = item.lone ? M(10) : M(22);
      if (sites.some((s) => Math.hypot(gx - s.gx, gy - s.gy) < (s.lone || item.lone ? minSep : minSep))) continue;

      let n = d / dMax;
      if (P.land[i] > 1 && P.land[i] !== BRIDGE_ID) n = Math.min(1, n + 0.35);
      const avail = Object.keys(P.resources[item.skill]).map(Number).sort();
      const tier = item.tier || chooseTier(rng, n, avail);
      const ids = P.resources[item.skill][tier] || P.resources[item.skill][avail[0]];
      const res = RESOURCE_BY_ID[rng.pick(ids)];
      const fit = (BIOME_FIT[res.tool] && BIOME_FIT[res.tool][P.biome[i]]) || 0.2;
      const score = fit + rng.float() * 0.4 + (item.anchor ? (1 - da / item.anchor.maxD) * 0.3 : 0);
      if (!best || score > best.score) best = { score, gx, gy, res, tier };
    }
    if (!best) return;

    const { res } = best;
    const site = {
      id: `site${idx}`,
      skill: res.skill,
      tier: res.tier,
      resourceId: res.id,
      tool: res.tool,
      lone: !!item.lone,
      tidal: !!item.shore,
      gx: best.gx, gy: best.gy,
      nodes: [],
    };
    const count = item.lone ? 1 : rng.int(NODE_COUNTS[res.tool][0], NODE_COUNTS[res.tool][1]);
    const radius = item.lone ? 0 : M(5 + count * 0.6);
    for (let attempt = 0; attempt < count * 12 && site.nodes.length < count; attempt++) {
      const a = rng.range(0, Math.PI * 2), rr = Math.sqrt(rng.float()) * radius;
      const nx = Math.floor(best.gx + 0.5 + Math.cos(a) * rr), ny = Math.floor(best.gy + 0.5 + Math.sin(a) * rr);
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= P.H - 1) continue;
      const ni = ny * W + nx;
      if (!P.reach[ni] || P.blocked[ni] || P.plaza[ni] || P.trail[ni]) continue;
      if (item.shore && P.height[ni] >= 0.5) continue;
      if (site.nodes.some((o) => Math.hypot(o.gx - nx, o.gy - ny) < M(2.4))) continue;
      P.blocked[ni] = 1;
      const w = cellToWorld(P, nx, ny);
      site.nodes.push({
        id: `${site.id}_n${site.nodes.length}`,
        gx: nx, gy: ny, x: w.x, z: w.z,
        rot: rng.range(0, Math.PI * 2),
        scale: rng.range(0.85, 1.15),
      });
    }
    if (!site.nodes.length) return;
    const wc = cellToWorld(P, best.gx, best.gy);
    site.x = wc.x;
    site.z = wc.z;
    const oc = cellToWorld(P, oSpot.gx, oSpot.gy);
    site.name = item.lone ? res.node : siteName(rng, res, wc.x - oc.x, wc.z - oc.z, usedNames);
    sites.push(site);
  });
  return sites;
}
