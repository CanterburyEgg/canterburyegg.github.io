// Faceted human: Universal Base Character body (continuous skin) decimated by vertex clustering
// into a chunky low-poly mesh that keeps skinning. Outfits are painted by CUT LINES measured in
// body space (distance down each limb, height up the torso, front/back), so edges stay clean.
// Weight/Muscle morphs, real UBC hairstyles refit to each head, all 86 UAL animations.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { morphHead, createFace, detectFaceLayout, headBox } from './face.js';

const UBC = 'Universal_Base_Characters/Universal Base Characters[Standard]/';
const HAIR_DIR = UBC + 'Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/';

export const UAL_PATHS = {
  ual1: 'UAL/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
  ual2: 'UAL/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb',
};
export const BODY_PATHS = {
  male: UBC + 'Base Characters/Godot - UE/Superhero_Male_FullBody.gltf',
  female: UBC + 'Base Characters/Godot - UE/Superhero_Female_FullBody.gltf',
  android: UAL_PATHS.ual1, // segmented mannequin: future robot/android NPCs
};
export const HAIR_PATHS = {
  buzz: HAIR_DIR + 'Hair_Buzzed.gltf',
  buzzSoft: HAIR_DIR + 'Hair_BuzzedFemale.gltf',
  parted: HAIR_DIR + 'Hair_SimpleParted.gltf',
  long: [HAIR_DIR + 'Hair_BuzzedFemale.gltf', HAIR_DIR + 'Hair_Long.gltf'], // long = top + back layer
  buns: HAIR_DIR + 'Hair_Buns.gltf',
};
export const BEARD_PATH = HAIR_DIR + 'Hair_Beard.gltf';
export const BROW_PATHS = { male: HAIR_DIR + 'Eyebrows_Regular.gltf', female: HAIR_DIR + 'Eyebrows_Female.gltf' };

function dominantBone(si, sw, v) {
  let dom = 0, best = -1;
  for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > best) { best = w; dom = si.getComponent(v, k); } }
  return dom;
}

function jointBindPositions(mesh) {
  const inv = mesh.bindMatrixInverse;
  return mesh.skeleton.boneInverses.map((bi) => new THREE.Vector3().applyMatrix4(bi.clone().invert()).applyMatrix4(inv));
}

// Head bounding box (bind space) of the largest skinned mesh in a glTF.
export function headBoxOf(gltf) {
  let body = null;
  gltf.scene.traverse((o) => {
    if (o.isSkinnedMesh && !/hair|eye/i.test((o.material && o.material.name) || '')) {
      if (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count) body = o;
    }
  });
  if (!body) return null;
  const head = body.skeleton.bones.findIndex((b) => b.name === 'Head');
  const pos = body.geometry.attributes.position, si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) if (dominantBone(si, sw, i) === head) box.expandByPoint(v.fromBufferAttribute(pos, i));
  return box;
}

// ---------------------------------------------------------------------
// Body morphs. Displacement blends across all 4 skin influences (no ridges);
// torso bones push from one body centerline (pelvis -> neck).
// Slimming also deflates collarbones/upper chest; gaining weight leaves them mostly alone.
// ---------------------------------------------------------------------
const WEIGHT_GAIN = [[/^spine_01/, 0.65], [/^spine_02/, 0.5], [/^spine_03/, 0.25], [/^pelvis/, 0.55], [/^clavicle/, 0.1], [/^upperarm/, 0.45], [/^lowerarm/, 0.25], [/^thigh/, 0.5], [/^calf/, 0.25], [/^neck/, 0.25]];
const WEIGHT_LOSS = [[/^spine_01/, 0.5], [/^spine_02/, 0.45], [/^spine_03/, 0.45], [/^pelvis/, 0.35], [/^clavicle/, 0.5], [/^upperarm/, 0.22], [/^lowerarm/, 0.12], [/^thigh/, 0.28], [/^calf/, 0.12], [/^neck/, 0.3]];
const MUSCLE = [[/^spine_01/, -0.12], [/^spine_02/, 0.1], [/^spine_03/, 0.35], [/^pelvis/, -0.05], [/^clavicle/, 0.35], [/^upperarm/, 0.55], [/^lowerarm/, 0.45], [/^thigh/, 0.35], [/^calf/, 0.45], [/^neck/, 0.35]];
const TORSO_RE = /^(spine|pelvis|clavicle)/;
const kTable = (bones, table) => bones.map((b) => { const hit = table.find(([re]) => re.test(b.name.toLowerCase())); return hit ? hit[1] : 0; });

function closestOnSegment(v, a, b, out) {
  const sx = b.x - a.x, sy = b.y - a.y, sz = b.z - a.z;
  const t = Math.min(1, Math.max(0, ((v.x - a.x) * sx + (v.y - a.y) * sy + (v.z - a.z) * sz) / Math.max(1e-9, sx * sx + sy * sy + sz * sz)));
  out.set(a.x + sx * t, a.y + sy * t, a.z + sz * t);
  return t;
}

function morphBuild(geo, mesh, weight, muscle) {
  if (!weight && !muscle) return geo;
  const g = geo.clone();
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const bones = mesh.skeleton.bones;
  const names = bones.map((b) => b.name.toLowerCase());
  const joints = jointBindPositions(mesh);
  const child = bones.map((b) => { const c = b.children.find((x) => x.isBone); return c ? bones.indexOf(c) : -1; });
  const kw = kTable(bones, weight >= 0 ? WEIGHT_GAIN : WEIGHT_LOSS), km = kTable(bones, MUSCLE);
  const tA = joints[names.indexOf('pelvis')], tB = joints[names.indexOf('neck_01')];
  const v = new THREE.Vector3(), cp = new THREE.Vector3(), total = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    total.set(0, 0, 0);
    for (let q = 0; q < 4; q++) {
      const w = sw.getComponent(i, q);
      if (w <= 0) continue;
      const j = si.getComponent(i, q);
      const k = weight * kw[j] + muscle * km[j];
      if (!k) continue;
      let kk = k;
      if (TORSO_RE.test(names[j])) {
        closestOnSegment(v, tA, tB, cp);
        // the back (shoulder blades, spine) changes much less than the belly/chest
        if (v.z < cp.z) kk *= weight < 0 ? 0.3 : 0.5;
      }
      else if (child[j] >= 0) closestOnSegment(v, joints[j], joints[child[j]], cp);
      else continue;
      total.x += (v.x - cp.x) * w * kk; total.y += (v.y - cp.y) * w * kk; total.z += (v.z - cp.z) * w * kk;
    }
    pos.setXYZ(i, v.x + total.x, v.y + total.y, v.z + total.z);
  }
  return g;
}

// ---------------------------------------------------------------------
// Bust (female bodies): size + lift + slight inward push (cleavage). Weight adds volume.
// ---------------------------------------------------------------------
function morphBust(geo, F, size, lift) {
  // Volume model: each breast is an ellipsoid resting on the chest; skin inside it is pushed out
  // to its surface (shrink-wrap), so growing it fills out round instead of pulling to a point.
  const g = geo.clone();
  const pos = g.attributes.position;
  const R = Math.min(0.105, Math.max(0.03, 0.058 + 0.026 * size));
  const shrink = Math.max(0, -size);
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (const side of [-1, 1]) {
    let best = -1, bz = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (F.kind[i] !== 1 || F.h[i] < 0.55 || F.h[i] > 0.88 || F.x[i] * side < 0.03 || F.f[i] <= 0) continue;
      if (pos.getZ(i) > bz) { bz = pos.getZ(i); best = i; }
    }
    if (best < 0) continue;
    const full = Math.max(0, size);
    const C = new THREE.Vector3(pos.getX(best) - side * 0.005 * full, pos.getY(best) - 0.015 + 0.03 * lift, pos.getZ(best) - R * 0.62);
    // teardrop: upper half stretched upward to slope into the chest; inner side widens with size
    // so larger busts meet and press together in the middle
    const rxOut = R * 0.95, rxIn = R * (1.0 + 0.28 * full), ryDown = R * 0.9, ryUp = R * (1.9 - 0.4 * lift), rz = R;
    for (let i = 0; i < pos.count; i++) {
      if (F.kind[i] !== 1 || F.f[i] <= -0.02) continue;
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const inner = (vx - C.x) * side < 0;
      const dx = (vx - C.x) / (inner ? rxIn : rxOut), dy = (vy - C.y) / (vy > C.y ? ryUp : ryDown), dz = (vz - C.z) / rz;
      const n = Math.hypot(dx, dy, dz);
      if (shrink > 0) {
        // smaller: flatten the existing chest toward the ribcage
        if (n < 1.6 && dz > -0.2) pos.setZ(i, vz - shrink * 0.025 * Math.max(0, 1 - n / 1.6));
        continue;
      }
      if (n >= 1 || n < 1e-4) continue;
      // push to the ellipsoid surface; the upper slope blends into the chest, the underside stays full
      // push outward (mostly forward/sideways) to the teardrop surface; soft falloff near its rim
      const k = 1 - sm(0.85, 1, n) * 0.5;
      const tx = C.x + (vx - C.x) / n, tz = C.z + (vz - C.z) / n;
      const ty = C.y + (vy - C.y) / n;
      pos.setXYZ(i, vx + (tx - vx) * k, vy + (ty - vy) * k * (vy > C.y ? 0.15 : 0.5), vz + (tz - vz) * k);
    }
  }
  return g;
}

// Smooth the collarbone ridges and fill the hollow between them and the bust (front upper chest).
function smoothUpperChest(geo, F, strength, fill) {
  if (!strength && !fill) return geo;
  const g = geo.clone();
  const pos = g.attributes.position;
  const idx = g.index ? g.index.array : null;
  const n = pos.count;
  const region = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (F.kind[i] === 2 || F.kind[i] === 3 || F.f[i] < -0.01) continue;
    const t = Math.max(0, 1 - Math.abs(F.h[i] - 0.86) / 0.16) * Math.max(0, 1 - Math.abs(F.x[i]) / 0.2);
    region[i] = t;
  }
  // vertex adjacency (positions may be split at UV seams; weld by rounded position)
  const key = (i) => `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
  const weld = new Map(), wid = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, weld.size); wid[i] = weld.get(k); }
  const nbr = Array.from({ length: weld.size }, () => new Set());
  if (idx) for (let t = 0; t < idx.length; t += 3) {
    const a = wid[idx[t]], b = wid[idx[t + 1]], c = wid[idx[t + 2]];
    nbr[a].add(b); nbr[a].add(c); nbr[b].add(a); nbr[b].add(c); nbr[c].add(a); nbr[c].add(b);
  }
  const P = new Float32Array(weld.size * 3), cnt = new Float32Array(weld.size), R = new Float32Array(weld.size);
  for (let i = 0; i < n; i++) { const w = wid[i]; P[w * 3] += pos.getX(i); P[w * 3 + 1] += pos.getY(i); P[w * 3 + 2] += pos.getZ(i); cnt[w]++; R[w] = Math.max(R[w], region[i]); }
  for (let w = 0; w < weld.size; w++) { P[w * 3] /= cnt[w]; P[w * 3 + 1] /= cnt[w]; P[w * 3 + 2] /= cnt[w]; }
  for (let it = 0; it < 6; it++) {
    const Q = P.slice();
    for (let w = 0; w < weld.size; w++) {
      if (!R[w] || !nbr[w].size) continue;
      let ax = 0, ay = 0, az = 0;
      for (const m of nbr[w]) { ax += P[m * 3]; ay += P[m * 3 + 1]; az += P[m * 3 + 2]; }
      const k = nbr[w].size, lam = 0.5 * strength * R[w];
      Q[w * 3] += (ax / k - P[w * 3]) * lam;
      Q[w * 3 + 1] += (ay / k - P[w * 3 + 1]) * lam * 0.3;
      // only fill outward (never dig the hollow deeper)
      Q[w * 3 + 2] = Math.max(Q[w * 3 + 2], P[w * 3 + 2] + (az / k - P[w * 3 + 2]) * lam);
    }
    P.set(Q);
  }
  for (let i = 0; i < n; i++) {
    const w = wid[i];
    const lowFill = fill * 0.022 * Math.max(0, 1 - Math.abs(F.h[i] - 0.8) / 0.1) * Math.max(0, 1 - Math.abs(F.x[i]) / 0.15) * (F.f[i] > 0 ? 1 : 0);
    pos.setXYZ(i, P[w * 3], P[w * 3 + 1], P[w * 3 + 2] + lowFill);
  }
  return g;
}

// ---------------------------------------------------------------------
// Body-space features per vertex, used for outfit cut lines.
// kind: 0 head/neck, 1 torso, 2 arm, 3 leg
// s: distance along limb chain (arm: 0 shoulder .. 1 elbow .. 2 wrist .. >2 hand;
//    leg: 0 hip .. 1 knee .. 2 ankle .. >2 foot)
// h: torso height 0 (pelvis) .. 1 (neck); x: lateral offset; f: forwardness (+ front)
// ---------------------------------------------------------------------
const ARM = ['upperarm', 'lowerarm', 'hand'];
const LEG = ['thigh', 'calf', 'foot'];

function vertexFeatures(geo, mesh) {
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const bones = mesh.skeleton.bones;
  const names = bones.map((b) => b.name.toLowerCase());
  const joints = jointBindPositions(mesh);
  const child = bones.map((b) => { const c = b.children.find((x) => x.isBone); return c ? bones.indexOf(c) : -1; });
  const pel = joints[names.indexOf('pelvis')], neck = joints[names.indexOf('neck_01')];
  const torsoLen = pel.distanceTo(neck);
  const n = pos.count;
  const kind = new Uint8Array(n), s = new Float32Array(n), h = new Float32Array(n), x = new Float32Array(n), f = new Float32Array(n);
  const v = new THREE.Vector3(), cp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    h[i] = (v.y - pel.y) / torsoLen;
    x[i] = v.x;
    f[i] = v.z - (pel.z + neck.z) / 2;
    // strongest limb influence decides arm/leg membership
    let best = -1, bestW = 0.25, chain = null, seg = 0;
    for (let q = 0; q < 4; q++) {
      const w = sw.getComponent(i, q), j = si.getComponent(i, q), nm = names[j];
      if (w <= bestW) continue;
      const ai = ARM.findIndex((p) => nm.startsWith(p)), li = LEG.findIndex((p) => nm.startsWith(p));
      const isFinger = /^(index|middle|pinky|ring|thumb)/.test(nm), isToe = nm.startsWith('ball');
      if (ai >= 0 || isFinger) { best = j; bestW = w; chain = 'arm'; seg = isFinger ? 2 : ai; }
      else if (li >= 0 || isToe) { best = j; bestW = w; chain = 'leg'; seg = isToe ? 2 : li; }
    }
    const dom = names[dominantBone(si, sw, i)];
    if (dom.startsWith('head') || dom.startsWith('neck')) { kind[i] = 0; continue; }
    if (best < 0) { kind[i] = 1; continue; }
    kind[i] = chain === 'arm' ? 2 : 3;
    if (seg < 2 && child[best] >= 0) s[i] = seg + closestOnSegment(v, joints[best], joints[child[best]], cp);
    else s[i] = 2.2;
  }
  return { kind, s, h, x, f, pelY: pel.y, torsoLen, fz0: (pel.z + neck.z) / 2 };
}

// Outfit painter: returns a color key for a point in body space.
// Layers in order: skin -> shirt -> layer (vest/jacket) -> pants -> belt -> boots -> gloves.
const SLEEVE_S = { tank: 0, short: 0.45, elbow: 1.05, long: 2.0 };
const PANTS_S = { shorts: 0.5, capri: 1.4, full: 2.05 };
const NECKLINE_H = 0.97; // crew neckline height on the torso axis
function paint(o, kind, s, h, x, f) {
  // neck: cut by torso height so the neckline edge can be smoothed
  if (kind === 0) return o.top === 'turtleneck' || h < NECKLINE_H - 0.06 ? 'shirt' : 'skin';
  if (kind === 2) {
    if (s > 2.0) return o.gloves ? 'gloves' : 'skin';
    if (o.layer === 'jacket' && s <= 2.0) return 'layer';
    return s <= (SLEEVE_S[o.sleeves] ?? 0.45) ? 'shirt' : 'skin';
  }
  const beltBand = h > 0.1 && h < 0.19; // natural waist (pelvis joint sits at hip level)
  if (kind === 3) {
    if (s < 0.45 && beltBand) return 'belt';
    if (s > (o.boots === 'tall' ? 1.25 : 1.7)) return 'boots';
    return s <= (PANTS_S[o.pants] ?? 2.05) ? 'pants' : 'skin';
  }
  // torso
  if (beltBand) return 'belt';
  if (h <= 0.1) return 'pants';
  const front = f > 0;
  // neckline (front only)
  if (front && h > 0.8) {
    if (o.neck === 'v' && h > 1.0 - 0.32 * Math.max(0, 1 - Math.abs(x) / 0.09)) return 'skin';
    if (o.neck === 'scoop' && h > 0.86 && Math.abs(x) < 0.12) return 'skin';
  }
  if (o.sleeves === 'tank' && Math.abs(x) > 0.15 && h > 0.72) return 'skin'; // tank-top armholes
  if (o.top !== 'turtleneck' && h >= NECKLINE_H - 0.06 && Math.abs(x) < 0.075 + (h - NECKLINE_H) * 0.4) return 'skin';
  if (o.hem === 'crop' && h < 0.52) return 'skin'; // crop top ends just under the bust
  if (o.layer === 'vest' || o.layer === 'jacket') {
    const open = front && Math.abs(x) < 0.05; // open front shows the shirt
    if (!open) return 'layer';
  }
  return 'shirt';
}

// ---------------------------------------------------------------------
// Vertex-clustering decimation that preserves skin weights.
// painter: { color } paints everything one color (hair), or
//          { F, paint(kind,s,h,x,f) -> hex } paints outfits by body-space cut lines.
// Triangles that straddle a cut line are subdivided (up to EDGE_DEPTH) so edges stay clean.
// ---------------------------------------------------------------------
const EDGE_DEPTH = 3;

function mergeWeights(a, b, t) {
  const m = new Map();
  for (let q = 0; q < 4; q++) {
    if (a.sw[q] > 0) m.set(a.si[q], (m.get(a.si[q]) || 0) + a.sw[q] * (1 - t));
    if (b.sw[q] > 0) m.set(b.si[q], (m.get(b.si[q]) || 0) + b.sw[q] * t);
  }
  const top = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
  const sum = top.reduce((acc, e) => acc + e[1], 0) || 1;
  const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
  top.forEach(([j, w], q) => { si[q] = j; sw[q] = w / sum; });
  return { si, sw };
}

function lerpVert(a, b, t) {
  const { si, sw } = mergeWeights(a, b, t);
  return {
    p: [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t, a.p[2] + (b.p[2] - a.p[2]) * t],
    si, sw,
    kind: t < 0.5 ? a.kind : b.kind,
    s: a.s + (b.s - a.s) * t, h: a.h + (b.h - a.h) * t, x: a.x + (b.x - a.x) * t, f: a.f + (b.f - a.f) * t,
  };
}

function facetGeometry(srcGeo, opts, refHeight, painter) {
  const pos = srcGeo.attributes.position;
  const si = srcGeo.attributes.skinIndex, sw = srcGeo.attributes.skinWeight;
  const idx = srcGeo.index ? srcGeo.index.array : Array.from({ length: pos.count }, (_, i) => i);
  const F = painter.F;
  const cell = refHeight * opts.cellFrac;
  const map = new Map();
  const reps = [];
  const repOf = new Int32Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const dom = dominantBone(si, sw, v);
    const key = `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)},${dom}`;
    let r = map.get(key);
    if (r === undefined) { r = reps.length; map.set(key, r); reps.push({ x: 0, y: 0, z: 0, n: 0, v, s: 0, h: 0, fx: 0, f: 0 }); }
    const R = reps[r];
    R.x += x; R.y += y; R.z += z; R.n++;
    if (F) { R.s += F.s[v]; R.h += F.h[v]; R.fx += F.x[v]; R.f += F.f[v]; }
    repOf[v] = r;
  }
  const verts = reps.map((R) => ({
    p: [R.x / R.n, R.y / R.n, R.z / R.n],
    si: [0, 1, 2, 3].map((q) => si.getComponent(R.v, q)),
    sw: [0, 1, 2, 3].map((q) => sw.getComponent(R.v, q)),
    kind: F ? F.kind[R.v] : 0, s: R.s / R.n, h: R.h / R.n, x: R.fx / R.n, f: R.f / R.n,
  }));

  const P = [], SI = [], SW = [], C = [];
  const col = new THREE.Color();
  const label = (v) => painter.paint(v.kind, v.s, v.h, v.x, v.f);
  const hexOf = painter.hex || ((k) => k); // paint() may return keys; several keys can share a color
  const emit = (a, b, c, key) => {
    col.set(hexOf(key));
    for (const v of [a, b, c]) { P.push(...v.p); SI.push(...v.si); SW.push(...v.sw); C.push(col.r, col.g, col.b); }
  };
  // Find where the label changes along edge a->b (bisection), returning the crossing vertex.
  const crossing = (a, b, la) => {
    let lo = 0, hi = 1;
    for (let k = 0; k < 7; k++) {
      const mid = (lo + hi) / 2;
      if (label(lerpVert(a, b, mid)) === la) lo = mid; else hi = mid;
    }
    return lerpVert(a, b, (lo + hi) / 2);
  };
  const tri = (a, b, c, depth) => {
    if (!F) return emit(a, b, c, painter.color);
    const la = label(a), lb = label(b), lc = label(c);
    // Exactly two labels: cut the triangle along the boundary (one triangle + one quad).
    if ((la !== lb || lb !== lc) && (la === lb || lb === lc || la === lc) && depth < EDGE_DEPTH) {
      let [p, q, r] = la === lb ? [c, a, b] : lb === lc ? [a, b, c] : [b, c, a]; // p is the odd one out
      const lp = label(p), lq = label(q);
      const pq = crossing(p, q, lp), pr = crossing(p, r, lp);
      emit(p, pq, pr, lp);
      emit(pq, q, r, lq);
      emit(pq, r, pr, lq);
      return;
    }
    if ((la !== lb || lb !== lc) && depth < EDGE_DEPTH) {
      const ab = lerpVert(a, b, 0.5), bc = lerpVert(b, c, 0.5), ca = lerpVert(c, a, 0.5);
      tri(a, ab, ca, depth + 1); tri(ab, b, bc, depth + 1); tri(ca, bc, c, depth + 1); tri(ab, bc, ca, depth + 1);
      return;
    }
    // centroid label (kind from the majority vertex)
    const ks = [a.kind, b.kind, c.kind];
    const kind = ks[0] === ks[1] || ks[0] === ks[2] ? ks[0] : ks[1];
    emit(a, b, c, painter.paint(kind, (a.s + b.s + c.s) / 3, (a.h + b.h + c.h) / 3, (a.x + b.x + c.x) / 3, (a.f + b.f + c.f) / 3));
  };
  const seen = new Set();
  for (let t = 0; t < idx.length; t += 3) {
    const a = repOf[idx[t]], b = repOf[idx[t + 1]], c = repOf[idx[t + 2]];
    if (a === b || b === c || a === c) continue;
    const key = [a, b, c].sort((p, q) => p - q).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    tri(verts[a], verts[b], verts[c], 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return { geometry: g, tris: P.length / 9 };
}

const facetedMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });

// Refit geometry authored for head box A onto head box B (per-axis scale about centers).
function refit(geo, from, to) {
  if (!from || !to) return geo;
  const g = geo.clone();
  const pos = g.attributes.position;
  const ca = from.getCenter(new THREE.Vector3()), sa = from.getSize(new THREE.Vector3());
  const cb = to.getCenter(new THREE.Vector3()), sb = to.getSize(new THREE.Vector3());
  const k = new THREE.Vector3(sb.x / sa.x, sb.y / sa.y, sb.z / sa.z);
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, cb.x + (pos.getX(i) - ca.x) * k.x, cb.y + (pos.getY(i) - ca.y) * k.y, cb.z + (pos.getZ(i) - ca.z) * k.z);
  }
  return g;
}

// A UBC hair/beard/brow glTF: refit to this head, faceted, recolored, bound to the body's skeleton.
function attachSkinnedPart(partGltf, bodyMesh, opts, refHeight, color, detail, heads, bodyKey) {
  let src = null;
  partGltf.scene.traverse((o) => { if (o.isSkinnedMesh && !src) src = o; });
  if (!src) return null;
  const authoredFor = /hair_2/i.test((src.material && src.material.name) || '') ? 'female' : 'male';
  const geo = refit(src.geometry, heads && heads[authoredFor], heads && heads[bodyKey]);
  const { geometry, tris } = facetGeometry(geo, { ...opts, cellFrac: opts.cellFrac * detail }, refHeight, { color });
  const m = new THREE.SkinnedMesh(geometry, facetedMat());
  m.position.copy(src.position);
  m.quaternion.copy(src.quaternion);
  m.scale.copy(src.scale);
  bodyMesh.parent.add(m);
  m.bind(bodyMesh.skeleton, src.bindMatrix.clone());
  m.castShadow = true;
  m.frustumCulled = false;
  return { mesh: m, tris };
}

// Placeholder eyes until the face pass.
function addEyes(mesh) {
  const names = mesh.skeleton.bones.map((b) => b.name);
  const headIdx = names.indexOf('Head');
  const pos = mesh.geometry.attributes.position, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) if (dominantBone(si, sw, i) === headIdx) box.expandByPoint(v.fromBufferAttribute(pos, i));
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const bindToBone = new THREE.Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[headIdx], mesh.bindMatrix);
  // surface depth at a point on the face: frontmost head vertex near (x, y)
  const surfaceZ = (x, y) => {
    let z = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (dominantBone(si, sw, i) !== headIdx) continue;
      if (Math.abs(pos.getX(i) - x) < s.x * 0.07 && Math.abs(pos.getY(i) - y) < s.y * 0.05) z = Math.max(z, pos.getZ(i));
    }
    return z === -Infinity ? box.max.z : z;
  };
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(s.x * 0.1, s.y * 0.05, 0.006), new THREE.MeshStandardMaterial({ color: '#14161c' }));
    const ex = c.x + side * s.x * 0.19, ey = c.y + s.y * 0.08;
    eye.position.set(ex, ey, surfaceZ(ex, ey) + 0.001);
    eye.applyMatrix4(bindToBone);
    mesh.skeleton.bones[headIdx].add(eye);
  }
}

// parts: { hair?: gltf|gltf[], beard?: gltf, brows?: gltf }, heads: { male: Box3, female: Box3 }
export function buildFacetedHuman(gltf, opts, parts = {}, heads = null, bodyKey = 'male') {
  const root = SkeletonUtils.clone(gltf.scene);
  const meshes = [], eyeMeshes = [];
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const mn = (o.material && o.material.name) || '';
    if (/eye/i.test(mn)) { eyeMeshes.push(o); o.castShadow = false; return; } // real eyeballs (kept smooth)
    if (/hair/i.test(mn)) { o.visible = false; return; }
    meshes.push(o);
  });
  const refHeight = 1.8;
  let tris = 0;
  for (const mesh of meshes) {
    // features from the un-morphed body so cut lines don't drift with build
    const F = vertexFeatures(mesh.geometry, mesh);
    let morphed = morphBuild(mesh.geometry, mesh, opts.weight || 0, opts.muscle || 0);
    const bustSize = (opts.bust || 0) + Math.max(0, opts.weight || 0) * 0.8;
    if (bodyKey === 'female') {
      morphed = smoothUpperChest(morphed, F, 1, 0.6 + Math.max(0, bustSize) * 0.6);
      morphed = morphBust(morphed, F, bustSize, opts.bustLift ?? 0.5);
    } else {
      morphed = smoothUpperChest(morphed, F, 0.4, 0);
    }
    // detect the real mouth/nose lines before face morphs, so painted lips + jaw sit on the actual mouth
    if (!mesh.userData.faceLayout) mesh.userData.faceLayout = detectFaceLayout(mesh.geometry, mesh.skeleton.bones.findIndex((b) => b.name === 'Head'));
    morphed = morphHead(morphed, mesh, opts.faceShape);
    // Mouth seam: label the lower lip region 'skinLower' (same color as skin) so the faceting cuts
    // triangles exactly along the lip line; the jaw morph then opens a clean slit, not a zigzag.
    const headIdx = mesh.skeleton.bones.findIndex((b) => b.name === 'Head');
    const hb = headBox(mesh.geometry, headIdx), hs = hb.getSize(new THREE.Vector3()), hcx = (hb.min.x + hb.max.x) / 2;
    mesh.userData.seamY = hb.min.y + hs.y * mesh.userData.faceLayout.mouthV;
    const seamH = (mesh.userData.seamY - F.pelY) / F.torsoLen;
    const seamBand = (hs.y * 0.07) / F.torsoLen, seamF = hb.max.z - hs.z * 0.4 - F.fz0;
    const painter = {
      F,
      paint: (kind, ss, h, x, f) => {
        const k = paint(opts.outfit, kind, ss, h, x, f);
        if (k === 'skin' && kind === 0 && h < seamH && h > seamH - seamBand && f > seamF && Math.abs(x - hcx) < hs.x * 0.16) return 'skinLower';
        return k;
      },
      hex: (k) => opts.colors[k === 'skinLower' ? 'skin' : k] || opts.colors.shirt,
    };
    const out = facetGeometry(morphed, opts, refHeight, painter);
    mesh.geometry = out.geometry;
    tris += out.tris;
    mesh.material = facetedMat();
    mesh.castShadow = true;
    mesh.frustumCulled = false;
  }
  const body = meshes.reduce((a, b) => (b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a), meshes[0]);
  // Drawn face (eyes, brows, nose, mouth, expressions) replaces placeholder eyes and brow meshes.
  // eyeball centers (bind space) for the lid blink
  const eyes = [];
  for (const em of eyeMeshes) {
    const p = em.geometry.attributes.position;
    for (const side of [-1, 1]) {
      const bx = new THREE.Box3(), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (v.x * side > 0) bx.expandByPoint(v); }
      if (!bx.isEmpty()) { const cc = bx.getCenter(new THREE.Vector3()), sz = bx.getSize(new THREE.Vector3()); eyes.push({ x: cc.x, y: cc.y, z: cc.z, r: Math.max(sz.x, sz.y) / 2 }); }
    }
  }
  const face = bodyKey === 'android' ? null : createFace(body, {
    ...(opts.face || {}),
    layout: { ...((opts.face && opts.face.layout) || {}), ...(body.userData.faceLayout || {}), seamY: body.userData.seamY },
    eyes: eyes.length ? eyes : null, eyeMeshes, paintEyes: !eyes.length, realMouth: true, skinColor: (opts.colors && opts.colors.skin) || '#d9a982',
  });
  if (!face) addEyes(body);
  for (const [key, detail] of [['hair', 0.7], ['beard', 0.7], ['brows', 0.5]]) {
    if (key === 'brows' && face) continue;
    for (const p of [].concat(parts[key] || []).filter(Boolean)) {
      const r = attachSkinnedPart(p, body, opts, refHeight, opts.colors.hair, detail, heads, bodyKey);
      if (r) tris += r.tris;
    }
  }
  const bone = (n) => body.skeleton.bones.find((b) => b.name === n);
  const head = bone('Head'), chest = bone('spine_03');
  if (chest) {
    chest.scale.setScalar(opts.shoulders);
    for (const n of ['neck_01', 'clavicle_l', 'clavicle_r']) { const b = bone(n); if (b) b.scale.setScalar(1 / opts.shoulders); }
  }
  if (head) {
    head.scale.setScalar(opts.headScale);
    head.position.multiplyScalar(opts.neck ?? 0.8);
  }
  const neckBone = bone('neck_01');
  if (neckBone) neckBone.position.multiplyScalar(0.55 + 0.45 * (opts.neck ?? 0.8));
  root.scale.setScalar(opts.height);
  return { root, mesh: body, tris, face };
}
