// =====================================================================
// PLANET RENDERER (Three.js). Builds terrain, water/borders, props,
// settlements, resource nodes, labels, quirk atmosphere.
// =====================================================================

import * as THREE from 'three';
import { CELL, WATER_Y, BIOME, RESOURCE_BY_ID, BRIDGE_Y, sampleHeight, cellToWorld, outsideHeight } from './worldgen.js';
import { QUIRKS } from '../data/quirks.js';
import { Rng } from './rng.js';



const BORDER_LOOK = {
  sea: { floor: '#2d4a5a', plane: { y: WATER_Y, color: '#3a7fb0', opacity: 0.82, emissive: null } },
  toxic_marsh: { floor: '#2a2a1c', plane: { y: -0.2, color: '#4a4a2a', opacity: 0.92, emissive: '#2a3a08' } },
  lava: { floor: '#3a1a10', plane: { y: -0.75, color: '#ff5a1f', opacity: 1, emissive: '#ff4010' } },
  chasm: { floor: '#1a1620', plane: { y: -29, color: '#0d0b12', opacity: 1, emissive: null } },
  cliffs: { floor: '#4a4550', plane: { y: -8, color: '#2f6f9a', opacity: 0.9, emissive: null } },
};

function hsl(h, s, l) { return new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l); }

// Hand-picked palettes (cohesive sets, not computed hues).
const PALETTES = [
  { name: 'verdant teal', meadow: '#5f9c7a', grove: '#3b6e5c', scrub: '#9aa57a', rocky: '#8a8f96', shore: '#d9c9a0', cliff: '#5d5a62', sky: '#a9d4e0', canopy: '#2f6a55', shrub: '#4f8a6a', tuft: '#84c08f', trunk: '#5a4636' },
  { name: 'rust desert', meadow: '#b9895a', grove: '#7f5a3a', scrub: '#cfa978', rocky: '#9a7f6e', shore: '#e6cfa2', cliff: '#6e4e40', sky: '#f0c9a0', canopy: '#8a4f30', shrub: '#a06b44', tuft: '#d8b27a', trunk: '#4a3426' },
  { name: 'violet moor', meadow: '#7d6e9e', grove: '#4e4376', scrub: '#a49bb8', rocky: '#8b8796', shore: '#d6cbb8', cliff: '#4a4558', sky: '#c8bde6', canopy: '#5a3f8a', shrub: '#6e5a9a', tuft: '#a896d0', trunk: '#3e3448' },
  { name: 'mint tundra', meadow: '#9cc7b0', grove: '#5e8f7c', scrub: '#c4d4c4', rocky: '#a0a8ac', shore: '#eae6da', cliff: '#6a7276', sky: '#d8eef0', canopy: '#4c7f6e', shrub: '#7aa892', tuft: '#c0e0cc', trunk: '#5a5048' },
  { name: 'ochre savanna', meadow: '#a8a04e', grove: '#6f7a34', scrub: '#c9b46a', rocky: '#9a9078', shore: '#e0d2a0', cliff: '#6a6250', sky: '#e8dca8', canopy: '#5f6e2a', shrub: '#8a8a40', tuft: '#d0c070', trunk: '#4e3e2a' },
  { name: 'magenta fungal', meadow: '#a86a86', grove: '#6e3f5e', scrub: '#c49aa8', rocky: '#8e8288', shore: '#e2cdbf', cliff: '#50404a', sky: '#e8c4d4', canopy: '#8a3f6e', shrub: '#a05a82', tuft: '#d896b4', trunk: '#3e2a32' },
];

function makePalette(P) {
  const rng = new Rng(P.meta.seed + ':palette');
  const base = rng.pick(PALETTES);
  const c = (hex) => new THREE.Color(hex);
  return {
    name: base.name,
    meadow: c(base.meadow), grove: c(base.grove), scrub: c(base.scrub), rocky: c(base.rocky),
    shore: c(base.shore), cliff: c(base.cliff), sky: c(base.sky),
    canopy: c(base.canopy), shrub: c(base.shrub), tuft: c(base.tuft), trunk: c(base.trunk),
    rock: c(base.rocky).offsetHSL(0, 0, 0.04),
    plaza: new THREE.Color('#9a948a'),
    path: new THREE.Color('#8a7a62'),
    lakebed: new THREE.Color('#3b5560'),
  };
}

function cellColor(P, i, pal, out) {
  const land = P.land[i];
  if (!land || land === 255) {
    // Darken with depth so sheer drops read as walls falling away.
    out.set(BORDER_LOOK[P.meta.border].floor);
    const depth = Math.max(0, -P.height[i]);
    out.multiplyScalar(1 - Math.min(0.6, depth * 0.03));
    return out;
  }
  if (P.water[i]) return out.copy(pal.lakebed);
  if (P.plaza[i]) return out.copy(pal.plaza);
  if (P.trail[i] && P.walk[i]) return out.copy(pal.path).lerp(pal.shore, 0.15);
  if (!P.walk[i]) return out.copy(pal.cliff);
  switch (P.biome[i]) {
    case BIOME.MEADOW: out.copy(pal.meadow); break;
    case BIOME.GROVE: out.copy(pal.grove); break;
    case BIOME.SCRUB: out.copy(pal.scrub); break;
    case BIOME.ROCKY: out.copy(pal.rocky); break;
    case BIOME.SHORE: out.copy(pal.shore); break;
    default: out.copy(pal.meadow);
  }
  // subtle per-cell variation + height lightening
  const j = ((i * 2654435761) >>> 0) / 4294967296;
  out.offsetHSL(0, 0, (j - 0.5) * 0.018 + Math.min(0.05, P.height[i] * 0.006));
  return out;
}

function buildTerrain(P, pal) {
  const TERRAIN_STEP = P.W <= 460 ? 1 : 2; // vertex every 2m (small) or 4m (medium/large)
  const nx = Math.floor((P.W - 1) / TERRAIN_STEP) + 1;
  const nz = Math.floor((P.H - 1) / TERRAIN_STEP) + 1;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const c = new THREE.Color();
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const gx = i * TERRAIN_STEP, gy = j * TERRAIN_STEP;
      const idx = gy * P.W + gx;
      const w = cellToWorld(P, gx, gy);
      const k = (j * nx + i) * 3;
      // Bridge cells render as the open gap beneath the deck (the deck is its own mesh).
      const hy = P.land[idx] === 255 ? outsideHeight(P.meta.border) : P.height[idx];
      pos[k] = w.x; pos[k + 1] = hy; pos[k + 2] = w.z;
      cellColor(P, idx, pal, c);
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
  }
  const indices = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, cc = a + nx, d = cc + 1;
      indices.push(a, cc, b, b, cc, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

function buildBorderPlane(P) {
  const look = BORDER_LOOK[P.meta.border].plane;
  const size = P.W * 8;
  const mat = new THREE.MeshStandardMaterial({
    color: look.color, roughness: 0.25, metalness: 0.1,
    transparent: look.opacity < 1, opacity: look.opacity,
  });
  if (look.emissive) { mat.emissive = new THREE.Color(look.emissive); mat.emissiveIntensity = P.meta.border === 'lava' ? 1.1 : 0.4; }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = look.y;
  mesh.receiveShadow = P.meta.border !== 'lava';
  return mesh;
}

function buildLakes(P) {
  // Quads over inland water cells (sea planets already have a global water plane).
  const pos = [];
  for (let gy = 0; gy < P.H; gy++) {
    for (let gx = 0; gx < P.W; gx++) {
      const i = gy * P.W + gx;
      if (!P.water[i] || !P.land[i]) continue;
      const w = cellToWorld(P, gx, gy);
      const h = 0.55 * CELL;
      const y = WATER_Y;
      pos.push(w.x - h, y, w.z - h, w.x - h, y, w.z + h, w.x + h, y, w.z - h);
      pos.push(w.x + h, y, w.z - h, w.x - h, y, w.z + h, w.x + h, y, w.z + h);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: '#3a86b8', roughness: 0.2, transparent: true, opacity: 0.8 });
  return new THREE.Mesh(geo, mat);
}

// ---- Instancing helper -------------------------------------------------
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
function partMatrix(x, y, z, rx, ry, rz, sx, sy, sz) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
}

function addInstanced(root, geo, material, transforms, opts = {}) {
  if (!transforms.length) return null;
  const mesh = new THREE.InstancedMesh(geo, material, transforms.length);
  transforms.forEach((t, k) => {
    mesh.setMatrixAt(k, t.matrix);
    if (t.color) mesh.setColorAt(k, t.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = opts.castShadow !== false;
  mesh.receiveShadow = !!opts.receiveShadow;
  root.add(mesh);
  return mesh;
}

function placeMatrix(x, y, z, rotY, scale, local) {
  _e.set(0, rotY, 0);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(scale, scale, scale);
  _m.compose(_p, _q, _s);
  return new THREE.Matrix4().multiplyMatrices(_m, local);
}

// ---- Shared geometries -------------------------------------------------
const G = {
  rock: new THREE.DodecahedronGeometry(1, 0),
  crystal: new THREE.OctahedronGeometry(1, 0),
  trunk: new THREE.CylinderGeometry(0.22, 0.32, 1, 6),
  canopy: new THREE.IcosahedronGeometry(1, 0),
  blade: new THREE.ConeGeometry(1, 1, 4),
  stem: new THREE.CylinderGeometry(0.22, 0.3, 1, 7),
  cap: new THREE.SphereGeometry(1, 9, 6),
  shrub: new THREE.IcosahedronGeometry(0.5, 0),
};

// Each part: { geo, color, emissive?, local: Matrix4 }
function nodeModel(res, pal) {
  const c = new THREE.Color(res.color);
  if (res.tool === 'pick') {
    const parts = [{ geo: G.rock, color: res.metal ? pal.rock : c, local: partMatrix(0, 0.45, 0, 0, 0, 0, 0.95, 0.7, 0.95) }];
    const crystals = res.metal ? [[0.35, 0.95, 0.1, 0.3], [-0.3, 0.85, -0.25, -0.4], [0.05, 1.05, -0.35, 0.15]] : [[0.4, 0.5, 0.3, 0.6], [-0.45, 0.4, -0.2, -0.5]];
    for (const [x, y, z, tilt] of crystals) {
      parts.push({ geo: res.metal ? G.crystal : G.rock, color: c, emissive: res.metal || res.id === 'glowing_quartz', local: partMatrix(x, y, z, tilt, 0, tilt * 0.6, 0.28, 0.55, 0.28) });
    }
    return parts;
  }
  if (res.tool === 'hatchet') {
    return [
      { geo: G.trunk, color: pal.trunk, local: partMatrix(0, 1.2, 0, 0, 0, 0, 1, 2.4, 1) },
      { geo: G.canopy, color: c, emissive: res.id === 'lantern_log', local: partMatrix(0, 3.0, 0, 0, 0.4, 0, 1.45, 1.25, 1.45) },
    ];
  }
  if (res.id === 'sting_nettle') {
    const parts = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      parts.push({ geo: G.blade, color: c, local: partMatrix(Math.cos(a) * 0.3, 0.45, Math.sin(a) * 0.3, Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35, 0.12, 0.9, 0.12) });
    }
    return parts;
  }
  if (res.tool === 'sickle') {
    const parts = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const h = 1.1 + (k % 3) * 0.25;
      parts.push({ geo: G.blade, color: c, local: partMatrix(Math.cos(a) * 0.32, h / 2, Math.sin(a) * 0.32, Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12, 0.08, h, 0.08) });
    }
    return parts;
  }
  // gloves: fungus
  return [
    { geo: G.stem, color: new THREE.Color('#e9e2cf'), local: partMatrix(0, 0.45, 0, 0, 0, 0, 1, 0.9, 1) },
    { geo: G.cap, color: c, local: partMatrix(0, 0.95, 0, 0, 0, 0, 0.95, 0.38, 0.95) },
  ];
}

function buildNodes(root, P, pal, nodeRefs) {
  const byRes = {};
  for (const site of P.sites) {
    for (const n of site.nodes) (byRes[site.resourceId] = byRes[site.resourceId] || []).push(n);
  }
  const meshes = [];
  for (const [resId, nodes] of Object.entries(byRes)) {
    const res = RESOURCE_BY_ID[resId];
    const parts = nodeModel(res, pal);
    parts.forEach((part, partIdx) => {
      const mat = new THREE.MeshStandardMaterial({ color: part.color, flatShading: true, roughness: 0.7, metalness: res.metal ? 0.35 : 0 });
      if (part.emissive) { mat.emissive = part.color.clone(); mat.emissiveIntensity = 0.35; }
      const transforms = nodes.map((n) => ({ matrix: placeMatrix(n.x, sampleHeight(P, n.x, n.z), n.z, n.rot, n.scale, part.local) }));
      const mesh = addInstanced(root, part.geo, mat, transforms);
      if (!mesh) return;
      mesh.userData.nodes = nodes;
      mesh.userData.resourceId = resId;
      meshes.push(mesh);
      nodes.forEach((n, k) => {
        if (!nodeRefs.has(n.id)) nodeRefs.set(n.id, []);
        nodeRefs.get(n.id).push({ mesh, index: k, partIdx, local: part.local, node: n });
      });
    });
  }
  return meshes;
}

function buildProps(root, P, pal) {
  const rockMat = new THREE.MeshStandardMaterial({ color: pal.rock, flatShading: true, roughness: 0.9 });
  addInstanced(root, G.rock, rockMat, P.boulders.map((b) => ({
    matrix: placeMatrix(b.x, sampleHeight(P, b.x, b.z) + b.r * 0.25, b.z, b.rot, 1, partMatrix(0, 0, 0, 0.3, 0, 0.2, b.r, b.r * 0.75, b.r)),
  })));

  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.85 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: pal.trunk, flatShading: true, roughness: 0.9 });
  const trees = P.decor.trees;
  addInstanced(root, G.trunk, trunkMat, trees.map((t) => ({ matrix: placeMatrix(t.x, sampleHeight(P, t.x, t.z), t.z, t.rot, t.s, partMatrix(0, 1.1, 0, 0, 0, 0, 0.9, 2.2, 0.9)) })));
  addInstanced(root, G.canopy, white.clone(), trees.map((t) => ({
    matrix: placeMatrix(t.x, sampleHeight(P, t.x, t.z), t.z, t.rot, t.s, partMatrix(0, 2.8, 0, 0, 0, 0, 1.5, 1.3, 1.5)),
    color: pal.canopy.clone().offsetHSL((t.v - 0.5) * 0.04, 0, (t.v - 0.5) * 0.08),
  })));
  addInstanced(root, G.shrub, white.clone(), P.decor.shrubs.map((t) => ({
    matrix: placeMatrix(t.x, sampleHeight(P, t.x, t.z), t.z, t.rot, t.s, partMatrix(0, 0.25, 0, 0, 0, 0, 1.1, 0.8, 1.1)),
    color: pal.shrub.clone().offsetHSL(0, 0, (t.v - 0.5) * 0.1),
  })));
  addInstanced(root, G.blade, white.clone(), P.decor.tufts.map((t) => ({
    matrix: placeMatrix(t.x, sampleHeight(P, t.x, t.z), t.z, t.rot, t.s, partMatrix(0, 0.3, 0, 0, 0, 0, 0.14, 0.6, 0.14)),
    color: pal.tuft.clone().offsetHSL(0, 0, (t.v - 0.5) * 0.12),
  })), { castShadow: false });
}

// ---- Settlements -------------------------------------------------------
const BODY_COLORS = { locker: '#5a6b7d', shop: '#b5835a', house: '#c9b79c', workshop: '#8d7b6a', tower: '#6e7480', shed: '#9a8a70', camp_locker: '#5a6b7d', tent: '#c96f4a' };
const ROOF_COLORS = { locker: '#2f3a48', shop: '#7a3b2e', house: '#5f6f4a', workshop: '#4a4a52', tower: '#3a3f4a', shed: '#5a4a3a' };
const pyramid = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
pyramid.rotateY(Math.PI / 4);
pyramid.translate(0, 0.5, 0);

const INTERACT_VERB = { pad: 'Use', locker: 'Open', camp_locker: 'Open', shop: 'Trade at', beacon: 'Inspect', house: 'Knock on', workshop: 'Inspect', tower: 'Inspect', shed: 'Inspect', tent: 'Inspect' };

function buildSettlement(root, P, buildings, labels, interactables) {
  for (const b of buildings) {
    const y = sampleHeight(P, b.x, b.z);
    const g = new THREE.Group();
    g.position.set(b.x, y, b.z);
    if (b.kind === 'pad') {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r * 1.05, 0.3, 28), new THREE.MeshStandardMaterial({ color: '#3b3f4a', roughness: 0.6, metalness: 0.4 }));
      pad.position.y = 0.15;
      pad.receiveShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(b.r * 0.78, 0.09, 6, 40), new THREE.MeshStandardMaterial({ color: '#7ff0ff', emissive: '#3fd0ff', emissiveIntensity: 1.2 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.32;
      g.add(pad, ring);
      labels.push({ text: b.label, x: b.x, y: y + 1.6, z: b.z, cls: 'lbl-building' });
    } else if (b.kind === 'beacon') {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#4a4f5a', metalness: 0.5, roughness: 0.5 }));
      post.position.y = 1.1;
      post.castShadow = true;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), new THREE.MeshStandardMaterial({ color: '#ffd77a', emissive: '#ffb020', emissiveIntensity: 1.4 }));
      orb.position.y = 2.5;
      g.add(post, orb);
      labels.push({ text: b.label, x: b.x, y: y + 3.6, z: b.z, cls: 'lbl-settlement' });
    } else if (b.kind === 'tent') {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(b.w * 0.7, b.h, 3), new THREE.MeshStandardMaterial({ color: BODY_COLORS.tent, flatShading: true }));
      tent.position.y = b.h / 2;
      tent.rotation.y = -b.rot;
      tent.castShadow = true;
      g.add(tent);
      labels.push({ text: b.label, x: b.x, y: y + b.h + 1.2, z: b.z, cls: 'lbl-settlement' });
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), new THREE.MeshStandardMaterial({ color: BODY_COLORS[b.kind] || '#999', flatShading: true, roughness: 0.85 }));
      body.position.y = b.h / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      const inner = new THREE.Group();
      inner.rotation.y = -b.rot;
      inner.add(body);
      if (b.kind === 'tower') {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w * 1.2, 0.4, b.d * 1.2), new THREE.MeshStandardMaterial({ color: ROOF_COLORS.tower }));
        cap.position.y = b.h + 0.2;
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 5), new THREE.MeshStandardMaterial({ color: '#cfd4dc' }));
        mast.position.y = b.h + 1.9;
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: '#ff5050', emissive: '#ff2020', emissiveIntensity: 1.5 }));
        tip.position.y = b.h + 3.4;
        inner.add(cap, mast, tip);
      } else if (b.kind !== 'camp_locker') {
        const roof = new THREE.Mesh(pyramid, new THREE.MeshStandardMaterial({ color: ROOF_COLORS[b.kind] || '#555', flatShading: true }));
        roof.scale.set(b.w * 1.12, 1.5, b.d * 1.12);
        roof.position.y = b.h;
        roof.castShadow = true;
        inner.add(roof);
      }
      // door faces the settlement center (local +z)
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.12), new THREE.MeshStandardMaterial({ color: '#2a2622' }));
      door.position.set(0, 0.95, b.d / 2 + 0.05);
      inner.add(door);
      if (b.kind === 'locker' || b.kind === 'camp_locker') {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.02, 0.25, b.d + 0.02), new THREE.MeshStandardMaterial({ color: '#ffcf4a', emissive: '#a07000', emissiveIntensity: 0.4 }));
        stripe.position.y = b.h * 0.7;
        inner.add(stripe);
      }
      g.add(inner);
      if (b.label) labels.push({ text: b.label, x: b.x, y: y + b.h + 2.0, z: b.z, cls: 'lbl-building' });
    }
    g.userData.interact = {
      type: 'building',
      kind: b.kind,
      name: b.label || b.kind.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()),
      verb: INTERACT_VERB[b.kind] || 'Inspect',
      // Walk to the door (local +z faces the plaza), then face the building.
      ...(b.d && b.kind !== 'tent'
        ? { x: b.x - Math.sin(b.rot) * (b.d / 2 + 1.3), z: b.z + Math.cos(b.rot) * (b.d / 2 + 1.3), reach: 1.4 }
        : { x: b.x, z: b.z, reach: b.kind === 'pad' ? (b.r || 3) : Math.max(b.w || 2, b.d || 2) / 2 + 1.2 }),
      faceX: b.x, faceZ: b.z,
    };
    interactables.push(g);
    root.add(g);
  }
}

// ---- Atmosphere --------------------------------------------------------
const PARTICLES = {
  drifting_spores: { color: '#d8f0b0', size: 0.22, vel: [0.35, 0.12, 0.2], jitter: 0.3 },
  floating_pebbles: { color: '#a09080', size: 0.28, vel: [0, 0.35, 0], jitter: 0.1 },
  aurora_sparks: { color: '#8ff0ff', size: 0.16, vel: [0.2, 0.3, -0.1], jitter: 0.6 },
  falling_ash: { color: '#d4cfc8', size: 0.16, vel: [0.25, -0.9, 0.1], jitter: 0.2 },
  crystal_glints: { color: '#e6fffb', size: 0.2, vel: [0, 0.08, 0], jitter: 0.15 },
};
const PARTICLE_BOX = { x: 70, y: 18, z: 70 };

function buildParticles(presetKey, rng) {
  const preset = PARTICLES[presetKey];
  if (!preset) return null;
  const count = 700;
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    pos[k * 3] = (rng.float() - 0.5) * PARTICLE_BOX.x;
    pos[k * 3 + 1] = rng.float() * PARTICLE_BOX.y;
    pos[k * 3 + 2] = (rng.float() - 0.5) * PARTICLE_BOX.z;
    for (let a = 0; a < 3; a++) vel[k * 3 + a] = preset.vel[a] + (rng.float() - 0.5) * preset.jitter;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: preset.color, size: preset.size, transparent: true, opacity: 0.85, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.vel = vel;
  return pts;
}

function updateParticles(pts, dt, center) {
  const pos = pts.geometry.attributes.position.array;
  const vel = pts.userData.vel;
  const hx = PARTICLE_BOX.x / 2, hz = PARTICLE_BOX.z / 2;
  for (let k = 0; k < pos.length; k += 3) {
    pos[k] += vel[k] * dt;
    pos[k + 1] += vel[k + 1] * dt;
    pos[k + 2] += vel[k + 2] * dt;
    // wrap relative to the player
    let rx = pos[k] - center.x, rz = pos[k + 2] - center.z;
    if (rx > hx) pos[k] -= PARTICLE_BOX.x; else if (rx < -hx) pos[k] += PARTICLE_BOX.x;
    if (rz > hz) pos[k + 2] -= PARTICLE_BOX.z; else if (rz < -hz) pos[k + 2] += PARTICLE_BOX.z;
    const ry = pos[k + 1] - center.y;
    if (ry > PARTICLE_BOX.y) pos[k + 1] -= PARTICLE_BOX.y; else if (ry < -2) pos[k + 1] += PARTICLE_BOX.y;
  }
  pts.geometry.attributes.position.needsUpdate = true;
}

// ---- Bridges -----------------------------------------------------------
function buildBridges(root, P) {
  const deckMat = new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.85, flatShading: true });
  const railMat = new THREE.MeshStandardMaterial({ color: '#6b7380', roughness: 0.5, metalness: 0.5 });
  const pierMat = new THREE.MeshStandardMaterial({ color: '#4a4f58', roughness: 0.7, metalness: 0.3 });
  const plankGeo = new THREE.BoxGeometry(1, 1, 1);
  const deepBorder = P.meta.border === 'chasm' || P.meta.border === 'cliffs';
  for (const b of P.bridges) {
    if (b.natural || b.ax === undefined) continue;
    const dx = b.bx - b.ax, dz = b.bz - b.az;
    const L = Math.hypot(dx, dz);
    const g = new THREE.Group();
    g.position.set(b.ax, 0, b.az);
    g.rotation.y = Math.atan2(dx, dz);
    const W = b.width || 4.4;
    // planks across the deck
    const planks = [];
    for (let z = 0.6; z < L - 0.3; z += 1.25) planks.push({ matrix: partMatrix(0, BRIDGE_Y - 0.06, z, 0, 0, 0, W, 0.14, 1.05) });
    addInstanced(g, plankGeo, deckMat, planks, { receiveShadow: true });
    // stringers under the planks
    for (const sx of [-W / 2 + 0.3, W / 2 - 0.3]) {
      const st = new THREE.Mesh(plankGeo, pierMat);
      st.scale.set(0.3, 0.35, L);
      st.position.set(sx, BRIDGE_Y - 0.3, L / 2);
      g.add(st);
    }
    // posts + rails
    const posts = [];
    for (let z = 0.4; z <= L; z += 3.2) for (const sx of [-W / 2, W / 2]) posts.push({ matrix: partMatrix(sx, BRIDGE_Y + 0.5, z, 0, 0, 0, 0.14, 1.0, 0.14) });
    addInstanced(g, plankGeo, railMat, posts);
    for (const sx of [-W / 2, W / 2]) {
      const rail = new THREE.Mesh(plankGeo, railMat);
      rail.scale.set(0.1, 0.1, L);
      rail.position.set(sx, BRIDGE_Y + 1.0, L / 2);
      rail.castShadow = true;
      g.add(rail);
    }
    // piers
    const pierDepth = deepBorder ? 26 : 4;
    const piers = [];
    for (let z = 6; z < L - 4; z += 9) for (const sx of [-W / 2 + 0.3, W / 2 - 0.3]) piers.push({ matrix: partMatrix(sx, BRIDGE_Y - 0.4 - pierDepth / 2, z, 0, 0, 0, 0.45, pierDepth, 0.45) });
    addInstanced(g, plankGeo, pierMat, piers);
    root.add(g);
  }
}

// ---- Coastline outline (marching squares over standable land) ----------
const EDGE_STYLE = {
  foam: { color: '#eef8ff', opacity: 0.85, width: 0.9 },
  sea: { color: '#eef8ff', opacity: 0.85, width: 0.9 },
  toxic_marsh: { color: '#c8e86a', opacity: 0.8, width: 0.8 },
  lava: { color: '#ffb050', opacity: 1.0, width: 0.9 },
  chasm: { color: '#e8dcc4', opacity: 0.9, width: 0.55 },
  cliffs: { color: '#e8dcc4', opacity: 0.9, width: 0.55 },
};

function buildCoastline(root, P) {
  const { W, H } = P;
  const solid = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= W || gy >= H) return 0;
    const i = gy * W + gx;
    return P.land[i] && P.land[i] !== 255 && !P.water[i] ? 1 : 0;
  };
  const buckets = {};
  const push = (style, ax, ay, ah, bx, by, bh) => {
    (buckets[style] = buckets[style] || []).push(ax, ay, ah, bx, by, bh);
  };
  for (let gy = 0; gy < H - 1; gy++) {
    for (let gx = 0; gx < W - 1; gx++) {
      const tl = solid(gx, gy), tr = solid(gx + 1, gy), br = solid(gx + 1, gy + 1), bl = solid(gx, gy + 1);
      const code = tl * 8 + tr * 4 + br * 2 + bl;
      if (code === 0 || code === 15) continue;
      // leave a gap where bridges meet the shore
      if (P.land[gy * W + gx] === 255 || P.land[gy * W + gx + 1] === 255 || P.land[(gy + 1) * W + gx] === 255 || P.land[(gy + 1) * W + gx + 1] === 255) continue;
      // style from an open corner: water → foam, otherwise the border type
      let style = P.meta.border;
      const corners = [[gx, gy, tl], [gx + 1, gy, tr], [gx + 1, gy + 1, br], [gx, gy + 1, bl]];
      for (const [cx, cy, v] of corners) {
        if (v) continue;
        const i = cy * W + cx;
        if (P.water[i]) style = 'foam';
        break;
      }
      // edge midpoints (cell-center grid space) with the land-side height
      const hAt = (ax, ay, av, bx2, by2, bv) => (av ? P.height[ay * W + ax] : P.height[by2 * W + bx2]);
      const T = [gx + 1, gy + 0.5, hAt(gx, gy, tl, gx + 1, gy, tr)];
      const R = [gx + 1.5, gy + 1, hAt(gx + 1, gy, tr, gx + 1, gy + 1, br)];
      const B = [gx + 1, gy + 1.5, hAt(gx, gy + 1, bl, gx + 1, gy + 1, br)];
      const L = [gx + 0.5, gy + 1, hAt(gx, gy, tl, gx, gy + 1, bl)];
      const seg = (p, q) => push(style, p[0], p[1], p[2], q[0], q[1], q[2]);
      switch (code) {
        case 1: case 14: seg(L, B); break;
        case 2: case 13: seg(B, R); break;
        case 3: case 12: seg(L, R); break;
        case 4: case 11: seg(T, R); break;
        case 5: seg(L, T); seg(B, R); break;
        case 6: case 9: seg(T, B); break;
        case 7: case 8: seg(L, T); break;
        case 10: seg(T, R); seg(L, B); break;
      }
    }
  }
  for (const [style, segs] of Object.entries(buckets)) {
    const st = EDGE_STYLE[style] || EDGE_STYLE.sea;
    const pos = new Float32Array((segs.length / 6) * 18);
    let k = 0;
    for (let s = 0; s < segs.length; s += 6) {
      const ax = (segs[s] - W / 2) * CELL, az = (segs[s + 1] - H / 2) * CELL;
      const bx = (segs[s + 3] - W / 2) * CELL, bz = (segs[s + 4] - H / 2) * CELL;
      const ay = Math.max(segs[s + 2], WATER_Y) + 0.07, by = Math.max(segs[s + 5], WATER_Y) + 0.07;
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * st.width * 0.5, nz = (dx / len) * st.width * 0.5;
      const quad = [ax - nx, ay, az - nz, ax + nx, ay, az + nz, bx + nx, by, bz + nz, ax - nx, ay, az - nz, bx + nx, by, bz + nz, bx - nx, by, bz - nz];
      for (let q = 0; q < 18; q++) pos[k++] = quad[q];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.MeshBasicMaterial({
      color: st.color, transparent: st.opacity < 1, opacity: st.opacity, side: THREE.DoubleSide,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    root.add(mesh);
  }
}

// ---- Public API --------------------------------------------------------
export function buildPlanetView(scene, P) {
  const root = new THREE.Group();
  scene.add(root);
  const pal = makePalette(P);
  const quirks = P.meta.quirks.map((q) => QUIRKS[q]);
  const has = (id) => P.meta.quirks.includes(id);

  // Sky + fog
  const skyQ = quirks.find((q) => q.sky);
  const fogQ = quirks.find((q) => q.fog);
  const sky = new THREE.Color(skyQ ? skyQ.sky : pal.sky);
  scene.background = sky;
  scene.fog = new THREE.FogExp2(fogQ ? fogQ.fog.color : sky, fogQ ? fogQ.fog.density : 0.0075);

  // Lights
  const dusk = has('endless_dusk'), night = has('twin_moons');
  const hemi = new THREE.HemisphereLight(night ? '#9fb0ff' : '#dfe8ff', night ? '#1a1830' : '#3a3428', night ? 0.55 : 0.9);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(dusk ? '#ffb27a' : night ? '#c8d4ff' : '#fff4e0', dusk ? 1.6 : night ? 0.9 : 1.9);
  const sunDir = dusk ? new THREE.Vector3(0.9, 0.16, 0.4).normalize() : new THREE.Vector3(0.45, 0.85, 0.3).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = 46;
  Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 1, far: 200 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  root.add(sun, sun.target);
  if (night) {
    const moonMat = new THREE.MeshBasicMaterial({ color: '#e8ecff', fog: false });
    const m1 = new THREE.Mesh(new THREE.SphereGeometry(14, 20, 14), moonMat);
    m1.position.set(-180, 160, -260);
    const m2 = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffd9c2', fog: false }));
    m2.position.set(-120, 120, -280);
    root.add(m1, m2);
  }
  if (P.meta.border === 'lava') {
    const glow = new THREE.HemisphereLight('#000000', '#ff5a1f', 0.25);
    root.add(glow);
  }

  // Terrain + water
  const terrain = buildTerrain(P, pal);
  root.add(terrain);
  const borderPlane = buildBorderPlane(P);
  root.add(borderPlane);
  const seaBaseY = borderPlane.position.y;
  if (P.meta.border !== 'sea') {
    const lakes = buildLakes(P);
    if (lakes) root.add(lakes);
  }

  buildBridges(root, P);
  buildCoastline(root, P);

  // Props, nodes, settlements
  buildProps(root, P, pal);
  const nodeRefs = new Map();
  const nodeMeshes = buildNodes(root, P, pal, nodeRefs);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const STUMP = new THREE.Matrix4().makeScale(1, 0.32, 1);
  const labels = [];
  const interactables = [];
  buildSettlement(root, P, P.outpost.buildings, labels, interactables);
  for (const camp of P.camps) buildSettlement(root, P, camp.buildings, labels, interactables);
  for (const site of P.sites) {
    if (site.lone) continue;
    labels.push({ text: site.name, x: site.x, y: sampleHeight(P, site.x, site.z) + 3.2, z: site.z, cls: 'lbl-site', tier: site.tier, siteId: site.id });
  }

  // Particles
  const particlePresets = quirks.map((q) => q.particles).filter(Boolean);
  const prng = new Rng(P.meta.seed + ':particles');
  const particles = particlePresets.map((k) => buildParticles(k, prng)).filter(Boolean);
  particles.forEach((p) => root.add(p));

  // Magnetic storm look: darker sky, aurora sparks surge, the odd lightning flicker.
  const base = { hemi: hemi.intensity, sun: sun.intensity, sky: sky.clone(), fog: scene.fog.color.clone() };
  const stormSky = new THREE.Color('#141a2a');
  let storm = 0, flash = 0;

  return {
    root,
    terrain,
    nodeMeshes,
    interactables,
    labels,
    palette: pal,
    // Depleted: first part becomes a stump/rubble, the rest disappears.
    setNodeDepleted(nodeId, depleted) {
      const refs = nodeRefs.get(nodeId);
      if (!refs) return;
      for (const r of refs) {
        const n = r.node;
        let m;
        if (!depleted) m = placeMatrix(n.x, sampleHeight(P, n.x, n.z), n.z, n.rot, n.scale, r.local);
        else if (r.partIdx === 0) m = placeMatrix(n.x, sampleHeight(P, n.x, n.z), n.z, n.rot, n.scale, new THREE.Matrix4().multiplyMatrices(STUMP, r.local));
        else m = ZERO;
        r.mesh.setMatrixAt(r.index, m);
        r.mesh.instanceMatrix.needsUpdate = true;
        r.mesh.computeBoundingSphere();
      }
    },
    update(dt, focus) {
      sun.position.set(focus.x + sunDir.x * 80, focus.y + sunDir.y * 80, focus.z + sunDir.z * 80);
      sun.target.position.set(focus.x, focus.y, focus.z);
      sun.target.updateMatrixWorld();
      for (const p of particles) updateParticles(p, dt, focus);
      if (storm > 0 || flash > 0) {
        if (storm > 0.5 && Math.random() < dt * 0.35) flash = 1;
        flash = Math.max(0, flash - dt * 5);
        const f = flash * flash;
        hemi.intensity = base.hemi * (1 - storm * 0.45) + f * 1.6;
        sun.intensity = base.sun * (1 - storm * 0.55) + f * 0.8;
        sky.copy(base.sky).lerp(stormSky, storm * 0.7);
        scene.fog.color.copy(base.fog).lerp(stormSky, storm * 0.6);
        for (const p of particles) { p.material.size = (p.userData.baseSize ??= p.material.size) * (1 + storm * 0.8); p.material.opacity = 0.85; }
      }
    },
    // 0..1 storm intensity from the quirk runtime.
    setStorm(k) {
      if (k === storm) return;
      storm = k;
      if (k === 0 && flash === 0) {
        hemi.intensity = base.hemi; sun.intensity = base.sun; sky.copy(base.sky); scene.fog.color.copy(base.fog);
        for (const p of particles) if (p.userData.baseSize) p.material.size = p.userData.baseSize;
      }
    },
    // Tidal Shores: raise/lower the sea plane (meters relative to mean level).
    setSeaOffset(dy) { if (P.meta.border === 'sea') borderPlane.position.y = seaBaseY + dy; },
    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        if (o.geometry && !Object.values(G).includes(o.geometry) && o.geometry !== pyramid) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
    },
  };
}
