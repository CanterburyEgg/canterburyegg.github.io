// MOBA castle map layout (see MAP_DESIGN.md). Single source of truth for every map position.
// Mirror-symmetric: Order (team 0) on the left (x < 0), Chaos (team 1) on the right (x > 0).
// Top lane = stone bridge road (north, z < 0); bottom lane = valley floor (south, z > 0);
// jungle = slopes in between, split by the Y path that wraps the behemoth's walled hollow.
// Classic script, loaded before phase1_data.js. Works over file:// with no build step.
window.MOBA_MAP = (function () {
  'use strict';
  const W = 160; // x: -80 .. 80
  const H = 110; // z: -55 .. 55
  const BOUNDS = { minX: -78, maxX: 78, minZ: -47, maxZ: 52 };

  // ---- Key lines --------------------------------------------------------
  const TOP_Z = -40;          // top lane (bridge road) centerline
  const BRIDGE_HALF = 3.2;    // road half-width; railings sit just outside
  const CASTLE = { x0: 52, x1: 79, z0: -48, z1: -6 }; // |x| range and z range of each castle's walls
  const UPPER_GATE_Z = TOP_Z; // gate in the castle's inner (east/west) wall, opening |z - TOP_Z| < 3
  const SIDE_GATE_X = 60;     // gate in the castle's south wall, opening ||x| - 60| < 3
  const GATE_HALF = 3.0;

  // Behemoth hollow: triangle under the bridge; entrance at its bottom tip
  const HOLLOW = {
    top: -37,          // top wall z (just south of the bridge's south railing)
    halfTop: 16,       // top corners at x = +-16
    tipZ: -14,         // bottom tip z (entrance)
    entranceHalf: 4,   // side walls stop at x = +-4 near the tip, leaving the entrance open
    boss: { x: 0, z: -28 }
  };

  // ---- Per-team points (Order values; Chaos mirrors x) ----------------
  const BASE = {
    fountain: { x: -72, z: -38 },
    core: { x: -63, z: -34 },
    heroSpawn: { x: -69, z: -31 },
    botHomes: [{ x: -73, z: -42 }, { x: -73, z: -38.5 }, { x: -73, z: -35 }, { x: -70, z: -40 }],
    // Training alcove (dummies + two rebound pillars); kept rigid so the selftest geometry is unchanged
    alcove: { x: -68, z: -18 }
  };
  const mirror = (p) => ({ x: -p.x, z: p.z });
  const teamPoint = (team, p) => (team === 0 ? { x: p.x, z: p.z } : mirror(p));

  // ---- Lanes (Order -> Chaos) ------------------------------------------
  const LANE_WAYPOINTS = {
    top: [
      { x: -60, z: TOP_Z }, { x: -52, z: TOP_Z }, { x: -30, z: TOP_Z }, { x: 0, z: TOP_Z },
      { x: 30, z: TOP_Z }, { x: 52, z: TOP_Z }, { x: 60, z: TOP_Z }
    ],
    bot: [
      { x: -60, z: -12 }, { x: -60, z: -5 }, { x: -58, z: 4 }, { x: -50, z: 22 }, { x: -38, z: 37 },
      { x: -20, z: 43 }, { x: 0, z: 44 }, { x: 20, z: 43 }, { x: 38, z: 37 }, { x: 50, z: 22 },
      { x: 58, z: 4 }, { x: 60, z: -5 }, { x: 60, z: -12 }
    ]
  };

  // Jungle Y path: branches leave the bridge at ~1/3 and ~2/3, run down outside the hollow walls,
  // meet at the hollow entrance, then one path runs straight to mid-valley.
  const JUNGLE_PATHS = [
    [{ x: -19, z: TOP_Z }, { x: -8.5, z: -18 }, { x: 0, z: -9.5 }],
    [{ x: 19, z: TOP_Z }, { x: 8.5, z: -18 }, { x: 0, z: -9.5 }],
    [{ x: 0, z: -9.5 }, { x: 0, z: 44 }]
  ];

  // ---- Structures ------------------------------------------------------
  function buildInitialStructures() {
    const half = [
      { key: 'top_t1', lane: 'top', kind: 'tower', tier: 1, label: 'Top T1 Tower', x: -30, z: TOP_Z, r: 1.45, hp: 2800, armor: 45, atk: 135, range: 9.5 },
      { key: 'top_t2', lane: 'top', kind: 'tower', tier: 2, label: 'Top T2 Tower', x: -46, z: TOP_Z, r: 1.5, hp: 3400, armor: 50, atk: 160, range: 9.5 },
      // Gatehouses: the targetable flank tower of each castle gate (the gate opening itself stays walkable)
      { key: 'top_rax', lane: 'top', kind: 'barracks', tier: 3, label: 'Upper Gatehouse', x: -52, z: TOP_Z - GATE_HALF - 2.2, r: 1.65, hp: 3000, armor: 40, atk: 0, range: 0 },
      { key: 'bot_t1', lane: 'bot', kind: 'tower', tier: 1, label: 'Bot T1 Tower', x: -30, z: 41, r: 1.45, hp: 2800, armor: 45, atk: 135, range: 9.5 },
      { key: 'bot_t2', lane: 'bot', kind: 'tower', tier: 2, label: 'Bot T2 Tower', x: -58.5, z: 2, r: 1.5, hp: 3400, armor: 50, atk: 160, range: 9.5 },
      { key: 'bot_rax', lane: 'bot', kind: 'barracks', tier: 3, label: 'Side Gatehouse', x: -SIDE_GATE_X - GATE_HALF - 2.2, z: -6, r: 1.65, hp: 3000, armor: 40, atk: 0, range: 0 },
      { key: 'ancient', lane: 'base', kind: 'ancient', tier: 4, label: 'Hearth', x: BASE.core.x, z: BASE.core.z, r: 2.35, hp: 5500, armor: 55, atk: 185, range: 10.5 }
    ];
    const out = [];
    [0, 1].forEach((team) => {
      const pre = team === 0 ? 'o_' : 'c_';
      const teamName = team === 0 ? 'Order' : 'Chaos';
      half.forEach((s) => {
        out.push({
          id: pre + s.key, team, lane: s.lane, kind: s.kind, tier: s.tier, name: teamName + ' ' + s.label,
          x: team === 0 ? s.x : -s.x, z: s.z, r: s.r, hp: s.hp, maxHp: s.hp, armor: s.armor, atk: s.atk, range: s.range
        });
      });
    });
    return out;
  }

  // ---- Jungle camps (mirrored for now; the two jungles get distinct layouts later) ----
  function buildJungleCamps() {
    const half = [
      { key: 'north', name: 'Razorback Pack', x: -34, z: -27, maxHp: 1100, armor: 16, atk: 46, gold: 135, xp: 165, respawnDur: 40 },
      { key: 'mid', name: 'Stone Golem', x: -29, z: -5, maxHp: 1400, armor: 22, atk: 56, gold: 165, xp: 195, respawnDur: 45 },
      { key: 'south', name: 'Bramble Stalkers', x: -37, z: 15, maxHp: 1100, armor: 16, atk: 46, gold: 135, xp: 165, respawnDur: 40 }
    ];
    const out = [];
    [0, 1].forEach((team) => {
      half.forEach((c) => {
        out.push(Object.assign({}, c, { id: 'camp_' + (team === 0 ? 'o_' : 'c_') + c.key, x: team === 0 ? c.x : -c.x, isBoss: false }));
      });
    });
    out.push({ id: 'camp_boss', name: 'Gorge Behemoth (BOSS: +10% All Stats)', x: HOLLOW.boss.x, z: HOLLOW.boss.z, isBoss: true, maxHp: 4800, armor: 38, atk: 125, gold: 380, xp: 420, respawnDur: 95 });
    return out;
  }

  // ---- Walls (line segments; collision uses circle chains built from them) ----
  // kind: 'castle' | 'rail' | 'cliff'
  function buildWalls() {
    const segs = [];
    const add = (x0, z0, x1, z1, kind, team) => segs.push({ x0, z0, x1, z1, kind, team });
    [0, 1].forEach((team) => {
      const s = team === 0 ? -1 : 1;
      const xi = s * CASTLE.x0;   // inner wall (faces the map center)
      const xo = s * CASTLE.x1;   // outer wall (map edge)
      // north wall
      add(xo, CASTLE.z0, xi, CASTLE.z0, 'castle', team);
      // inner wall with the upper gate opening
      add(xi, CASTLE.z0, xi, UPPER_GATE_Z - GATE_HALF, 'castle', team);
      add(xi, UPPER_GATE_Z + GATE_HALF, xi, CASTLE.z1, 'castle', team);
      // south wall with the side gate opening
      add(xi, CASTLE.z1, s * (SIDE_GATE_X - GATE_HALF), CASTLE.z1, 'castle', team);
      add(s * (SIDE_GATE_X + GATE_HALF), CASTLE.z1, xo, CASTLE.z1, 'castle', team);
      // outer wall
      add(xo, CASTLE.z1, xo, CASTLE.z0, 'castle', team);
    });
    // Bridge railings: north side along the whole road (the drop), south side over the hollow
    add(-CASTLE.x0, TOP_Z - BRIDGE_HALF - 0.4, CASTLE.x0, TOP_Z - BRIDGE_HALF - 0.4, 'rail');
    // Hollow: top cliff under the bridge, two side cliffs ending short of the tip (the entrance)
    const sideEnd = (sign) => {
      // point along the side edge where |x| = entranceHalf
      const t = (HOLLOW.halfTop - HOLLOW.entranceHalf) / HOLLOW.halfTop;
      return { x: sign * HOLLOW.entranceHalf, z: HOLLOW.top + (HOLLOW.tipZ - HOLLOW.top) * t };
    };
    add(-HOLLOW.halfTop, HOLLOW.top, HOLLOW.halfTop, HOLLOW.top, 'cliff');
    const le = sideEnd(-1), re = sideEnd(1);
    add(-HOLLOW.halfTop, HOLLOW.top, le.x, le.z, 'cliff');
    add(HOLLOW.halfTop, HOLLOW.top, re.x, re.z, 'cliff');
    return segs;
  }
  const WALLS = buildWalls();

  // Circle chain along a wall segment (for the existing circle-based collision)
  function wallCircles(seg, r = 0.85, spacing = 1.1) {
    const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
    const n = Math.max(1, Math.round(len / spacing));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push({ kind: 'wall', x: seg.x0 + (seg.x1 - seg.x0) * t, z: seg.z0 + (seg.z1 - seg.z0) * t, r });
    }
    return out;
  }

  // ---- Geometry helpers -------------------------------------------------
  function distToSeg(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1e-6;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }
  function distToPolyline(px, pz, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, distToSeg(px, pz, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z));
    return best;
  }
  function segsIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
    const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
    if (Math.abs(d) < 1e-9) return false;
    const u = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
    const v = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
    return u > 0 && u < 1 && v > 0 && v < 1;
  }
  // True when the straight move a->b crosses a wall (with a little clearance)
  function segmentBlockedByWalls(ax, az, bx, bz, pad = 0.9) {
    for (let i = 0; i < WALLS.length; i++) {
      const w = WALLS[i];
      if (segsIntersect(ax, az, bx, bz, w.x0, w.z0, w.x1, w.z1)) return true;
      // wall ends are posts: passing within pad of one counts as blocked (unless the move starts/ends there)
      const posts = [[w.x0, w.z0], [w.x1, w.z1]];
      for (let k = 0; k < 2; k++) {
        const [px, pz] = posts[k];
        if (distToSeg(px, pz, ax, az, bx, bz) < pad && Math.hypot(px - ax, pz - az) > pad && Math.hypot(px - bx, pz - bz) > pad) return true;
      }
    }
    return false;
  }
  function inHollow(x, z) {
    if (z < HOLLOW.top || z > HOLLOW.tipZ) return false;
    const halfW = HOLLOW.halfTop * (1 - (z - HOLLOW.top) / (HOLLOW.tipZ - HOLLOW.top));
    return Math.abs(x) < halfW;
  }
  function inCastle(x, z, pad = 0) {
    return Math.abs(x) > CASTLE.x0 - pad && z > CASTLE.z0 - pad && z < CASTLE.z1 + pad;
  }

  // ---- Trees & pillars (LOS blockers), deterministic, mirrored ----------
  function buildMapObstacles() {
    let seed = 1337;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const keepOut = (x, z, r) => {
      if (z < TOP_Z + BRIDGE_HALF + 2.5 || z > BOUNDS.maxZ - 1.5) return true;
      if (x > -6 + 0) return true; // left half only (mirrored below)
      if (inCastle(x, z, 3.5)) return true;
      if (distToPolyline(x, z, LANE_WAYPOINTS.bot) < 5.5 + r) return true;
      if (distToPolyline(x, z, LANE_WAYPOINTS.top) < 5.5 + r) return true;
      for (let i = 0; i < JUNGLE_PATHS.length; i++) if (distToPolyline(x, z, JUNGLE_PATHS[i]) < 3.8 + r) return true;
      if (inHollow(x, z) || distToSeg(x, z, -HOLLOW.halfTop, HOLLOW.top, 0, HOLLOW.tipZ) < 2.5) return true;
      const camps = buildJungleCamps();
      for (let i = 0; i < camps.length; i++) if (Math.hypot(x - camps[i].x, z - camps[i].z) < 6.0 + r) return true;
      const ss = buildInitialStructures();
      for (let i = 0; i < ss.length; i++) if (Math.hypot(x - ss[i].x, z - ss[i].z) < 6.5) return true;
      return false;
    };
    const half = [];
    let tries = 0;
    while (half.length < 34 && tries < 4000) {
      tries++;
      const x = -50 + rnd() * 44;
      const z = TOP_Z + 4 + rnd() * (BOUNDS.maxZ - TOP_Z - 6);
      const isPillar = half.length % 6 === 5;
      const s = 0.9 + rnd() * 0.35;
      const r = isPillar ? 1.3 : 0.92 * s;
      if (keepOut(x, z, r)) continue;
      if (half.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 2.2)) continue;
      half.push(isPillar ? { kind: 'pillar', x, z, r } : { kind: 'tree', x, z, r, scale: s });
    }
    // valley edge trees along the south border, and along the top lane's south shoulder over the slopes
    const out = [];
    half.forEach((o) => {
      out.push(o);
      out.push(Object.assign({}, o, { x: -o.x }));
    });
    return out;
  }

  // ---- Navigation graph for bots (routes through gates & paths around walls) ----
  const NAV_NODES = (function () {
    const n = [];
    const both = (p) => { n.push({ x: p.x, z: p.z }); n.push({ x: -p.x, z: p.z }); };
    both(BASE.fountain);
    both({ x: -63, z: -27 });                   // courtyard center
    both({ x: -56, z: TOP_Z });                 // upper gate inner
    both({ x: -48, z: TOP_Z });                 // upper gate outer
    both({ x: -SIDE_GATE_X, z: -10 });          // side gate inner
    both({ x: -SIDE_GATE_X, z: -1 });           // side gate outer
    LANE_WAYPOINTS.top.forEach((p) => n.push({ x: p.x, z: p.z }));
    LANE_WAYPOINTS.bot.forEach((p) => n.push({ x: p.x, z: p.z }));
    JUNGLE_PATHS.forEach((path) => path.forEach((p) => n.push({ x: p.x, z: p.z })));
    n.push({ x: 0, z: 10 }, { x: 0, z: 28 });   // along the single path
    n.push({ x: 0, z: -12.5 }, { x: 0, z: -20 }); // hollow entrance & inside
    both({ x: -22, z: -20 }); both({ x: -30, z: 4 }); both({ x: -40, z: -8 }); both({ x: -28, z: 26 }); // jungle crossroads
    buildJungleCamps().forEach((c) => n.push({ x: c.x, z: c.z }));
    // de-duplicate
    const out = [];
    n.forEach((p) => { if (!out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.5)) out.push(p); });
    return out;
  })();
  const NAV_EDGES = NAV_NODES.map((a, i) => NAV_NODES.map((b, j) => {
    if (i === j) return null;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > 48) return null;
    return segmentBlockedByWalls(a.x, a.z, b.x, b.z) ? null : d;
  }));

  // Next point to walk toward when heading from (fx,fz) to (tx,tz): the target itself when the line is clear,
  // otherwise the next nav node on the shortest wall-free route.
  function navNextPoint(fx, fz, tx, tz) {
    if (!segmentBlockedByWalls(fx, fz, tx, tz)) return { x: tx, z: tz };
    const N = NAV_NODES.length;
    const dist = new Array(N).fill(Infinity);
    const prev = new Array(N).fill(-1);
    const done = new Array(N).fill(false);
    for (let i = 0; i < N; i++) {
      const p = NAV_NODES[i];
      if (!segmentBlockedByWalls(fx, fz, p.x, p.z)) dist[i] = Math.hypot(p.x - fx, p.z - fz);
    }
    let bestEnd = -1, bestTotal = Infinity;
    for (let k = 0; k < N; k++) {
      let u = -1;
      for (let i = 0; i < N; i++) if (!done[i] && (u === -1 || dist[i] < dist[u])) u = i;
      if (u === -1 || dist[u] === Infinity) break;
      done[u] = true;
      const pu = NAV_NODES[u];
      if (dist[u] < bestTotal && !segmentBlockedByWalls(pu.x, pu.z, tx, tz)) {
        const tot = dist[u] + Math.hypot(tx - pu.x, tz - pu.z);
        if (tot < bestTotal) { bestTotal = tot; bestEnd = u; }
      }
      for (let v = 0; v < N; v++) {
        const w = NAV_EDGES[u][v];
        if (w !== null && dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
      }
    }
    if (bestEnd === -1) return { x: tx, z: tz };
    let node = bestEnd;
    while (prev[node] !== -1) node = prev[node];
    const p = NAV_NODES[node];
    // already standing on the first node: aim at the following one
    if (Math.hypot(p.x - fx, p.z - fz) < 1.2) {
      let n2 = bestEnd;
      const chain = [];
      while (n2 !== -1) { chain.unshift(n2); n2 = prev[n2]; }
      const nextIdx = chain[1];
      if (nextIdx !== undefined) return { x: NAV_NODES[nextIdx].x, z: NAV_NODES[nextIdx].z };
      return { x: tx, z: tz };
    }
    return { x: p.x, z: p.z };
  }

  // Look-only elevation (Stage B fills this in; gameplay stays flat)
  function groundHeight(x, z) {
    return 0;
  }

  return {
    W, H, BOUNDS, TOP_Z, BRIDGE_HALF, CASTLE, UPPER_GATE_Z, SIDE_GATE_X, GATE_HALF, HOLLOW, BASE,
    teamPoint, LANE_WAYPOINTS, JUNGLE_PATHS, WALLS,
    buildInitialStructures, buildJungleCamps, buildMapObstacles, wallCircles,
    segmentBlockedByWalls, navNextPoint, inHollow, inCastle, distToPolyline, groundHeight
  };
})();
