// Faces for faceted humans:
//  1. Structure: morph head vertices (jaw, chin, cheekbones, brow ridge, nose, width) before faceting.
//  2. Features: a canvas-drawn face texture (eyes, brows, nose, mouth) projected onto the front of the
//     faceted head as a skinned decal. Expressions redraw the canvas; talking flaps the mouth; blinks.
import * as THREE from 'three';

export const EXPRESSIONS = ['neutral', 'happy', 'grin', 'smug', 'angry', 'sad', 'worried', 'surprised', 'asleep'];

function dominantBone(si, sw, v) {
  let dom = 0, best = -1;
  for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > best) { best = w; dom = si.getComponent(v, k); } }
  return dom;
}

export function headBox(geo, headIdx) {
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) if (dominantBone(si, sw, i) === headIdx) box.expandByPoint(v.fromBufferAttribute(pos, i));
  return box;
}

const bump = (x, c, w) => Math.max(0, 1 - Math.abs(x - c) / w); // triangular falloff

// Find the real mouth seam and nose tip from the head's center profile (most-forward z per height).
// Mouth = deepest dip between the two lip bumps, between chin and nose.
export function detectFaceLayout(geo, headIdx) {
  const box = headBox(geo, headIdx);
  if (box.isEmpty()) return {};
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const B = 80, prof = new Float32Array(B).fill(-Infinity);
  for (let i = 0; i < pos.count; i++) {
    if (dominantBone(si, sw, i) !== headIdx) continue;
    if (Math.abs(pos.getX(i) - c.x) > s.x * 0.07) continue;
    const b = Math.min(B - 1, Math.floor(((pos.getY(i) - box.min.y) / s.y) * B));
    prof[b] = Math.max(prof[b], pos.getZ(i));
  }
  for (let b = 1; b < B; b++) if (prof[b] === -Infinity) prof[b] = prof[b - 1];
  const sm = Array.from(prof, (_, b) => (prof[Math.max(0, b - 1)] + prof[b] + prof[Math.min(B - 1, b + 1)]) / 3);
  const vAt = (b) => (b + 0.5) / B;
  // Nose tip = most forward point in the mid face. The mouth seam sits ~54% of the way from the
  // chin to the nose tip (measured on both UBC heads); snap to the deepest profile dip near there.
  // (The dip just under the nose is the philtrum, not the mouth.)
  let nose = -1;
  for (let b = 0; b < B; b++) { const v = vAt(b); if (v > 0.25 && v < 0.5 && (nose < 0 || sm[b] > sm[nose])) nose = b; }
  let mouth = -1;
  if (nose >= 0) {
    const prior = vAt(nose) * 0.54;
    for (let b = 0; b < B; b++) {
      const v = vAt(b);
      if (Math.abs(v - prior) > 0.032) continue;
      if (!(b > 0 && b < B - 1 && sm[b] <= sm[b - 1] && sm[b] <= sm[b + 1])) continue; // real dips only
      // lowest point in the window; ties go to the bin closest to the prior
      if (mouth < 0 || sm[b] < sm[mouth] - 1e-4 || (Math.abs(sm[b] - sm[mouth]) <= 1e-4 && Math.abs(v - prior) < Math.abs(vAt(mouth) - prior))) mouth = b;
    }
  }
  const chin = 0;
  const out = {};
  if (nose >= 0) out.noseV = vAt(nose) - 0.045; // nostrils sit just under the tip
  out.mouthV = mouth >= 0 ? vAt(mouth) : nose >= 0 ? vAt(nose) * 0.55 : FACE_LAYOUT.mouthV;

  // Precise: the sculpt has real openings for the mouth and eyes (their meshes are hidden).
  // Boundary edges (used by one triangle) outline those holes; use their positions directly.
  const holes = faceHoles(geo, headIdx, box);
  if (holes.mouthV !== undefined && holes.mouthV > 0.1) out.mouthV = holes.mouthV;
  if (holes.eyeV !== undefined) { out.eyeV = holes.eyeV; out.eyeU = holes.eyeU; out.browV = holes.eyeV + 0.075; }
  if (out.noseV !== undefined && out.mouthV !== undefined) out.noseV = Math.max(out.noseV, out.mouthV + 0.05);
  return out;
}

function faceHoles(geo, headIdx, box) {
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const idx = geo.index ? geo.index.array : null;
  if (!idx) return {};
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const key = (i) => `${Math.round(pos.getX(i) * 5000)},${Math.round(pos.getY(i) * 5000)},${Math.round(pos.getZ(i) * 5000)}`;
  const weld = new Map(), wid = new Int32Array(pos.count), rep = [];
  for (let i = 0; i < pos.count; i++) { const k = key(i); if (!weld.has(k)) { weld.set(k, rep.length); rep.push(i); } wid[i] = weld.get(k); }
  const edges = new Map();
  const add = (a, b) => { const k = a < b ? a * 1e7 + b : b * 1e7 + a; edges.set(k, (edges.get(k) || 0) + 1); };
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
    if (dominantBone(si, sw, i0) !== headIdx && dominantBone(si, sw, i1) !== headIdx && dominantBone(si, sw, i2) !== headIdx) continue;
    const a = wid[i0], b = wid[i1], d = wid[i2];
    add(a, b); add(b, d); add(d, a);
  }
  const mouth = [], eyes = [];
  for (const [k, n] of edges) {
    if (n !== 1) continue;
    for (const w of [Math.floor(k / 1e7), k % 1e7]) {
      const i = rep[w];
      const x = pos.getX(i) - c.x, v = (pos.getY(i) - box.min.y) / s.y, z = pos.getZ(i);
      if (z < c.z) continue; // front half only
      if (Math.abs(x) < s.x * 0.12 && v > 0.08 && v < 0.4) mouth.push(v);
      else if (Math.abs(x) > s.x * 0.06 && Math.abs(x) < s.x * 0.36 && v > 0.38 && v < 0.7) eyes.push([v, Math.abs(x) / s.x]);
    }
  }
  const out = {};
  if (mouth.length >= 4) out.mouthV = mouth.reduce((a, b) => a + b, 0) / mouth.length;
  if (eyes.length >= 6) {
    out.eyeV = eyes.reduce((a, e) => a + e[0], 0) / eyes.length;
    out.eyeU = eyes.reduce((a, e) => a + e[1], 0) / eyes.length;
  }
  return out;
}

// shape: { jaw, chin, cheeks, brow, nose, width } in [-1, 1]
export function morphHead(geo, mesh, shape = {}) {
  shape = { socketFill: 1, ...shape };
  const headIdx = mesh.skeleton.bones.findIndex((b) => b.name === 'Head');
  const box = headBox(geo, headIdx);
  if (box.isEmpty()) return geo;
  const g = geo.clone();
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  for (let i = 0; i < pos.count; i++) {
    // blend by head weight so the neck seam stays smooth
    let wHead = 0;
    for (let q = 0; q < 4; q++) if (si.getComponent(i, q) === headIdx) wHead += sw.getComponent(i, q);
    if (wHead <= 0) continue;
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const X = (x - c.x) / (s.x / 2), Y = (y - box.min.y) / s.y, Z = (z - c.z) / (s.z / 2);
    let dx = 0, dy = 0, dz = 0;
    const front = Math.max(0, Z);
    dx += (x - c.x) * (shape.width || 0) * 0.08;
    dx += (x - c.x) * (shape.jaw || 0) * 0.28 * bump(Y, 0.12, 0.25);
    dx += (x - c.x) * (shape.cheeks || 0) * 0.16 * bump(Y, 0.45, 0.14) * front;
    dy += -(shape.chin || 0) * s.y * 0.05 * Math.max(0, 1 - Y / 0.18) * front;
    dz += (shape.chin || 0) * s.z * 0.04 * Math.max(0, 1 - Y / 0.18) * front;
    dz += (shape.brow || 0) * s.z * 0.05 * bump(Y, 0.6, 0.07) * Math.max(0, Z - 0.4);
    dz += (shape.nose || 0) * s.z * 0.09 * bump(Y, 0.44, 0.12) * Math.max(0, 1 - Math.abs(X) / 0.18) * Math.max(0, Z - 0.6);
    // fill the eye sockets so flat-shaded facets don't read as dark bands
    // soften the under-nose/philtrum hollow
    dz += shape.socketFill * s.z * 0.045 * bump(Y, 0.32, 0.09) * Math.max(0, 1 - Math.abs(X) / 0.4) * Math.max(0, Z - 0.4);
    pos.setXYZ(i, x + dx * wHead, y + dy * wHead, z + dz * wHead);
  }
  return g;
}

// ---------------------------------------------------------------------
// Face drawing (normalized head-front coordinates: u 0..1 left->right, v 0 chin .. 1 crown)
// ---------------------------------------------------------------------
export const FACE_LAYOUT = { eyeV: 0.5, eyeU: 0.165, browV: 0.585, noseV: 0.39, mouthV: 0.255 };

function drawFace(ctx, S, look, expr, mouth, blink) {
  ctx.clearRect(0, 0, S, S);
  const L = { ...FACE_LAYOUT, ...(look.layout || {}) };
  if (look.debugLines) {
    for (const [v, c] of [[L.mouthV, '#ff0000'], [L.noseV, '#00c000'], [L.eyeV, '#0060ff'], [L.browV, '#ff00ff']]) {
      ctx.fillStyle = c; ctx.fillRect(0, (1 - v) * S - 2, S, 4);
    }
    return;
  }
  const P = (u, v) => [u * S, (1 - v) * S];
  const eyeSize = look.eyeSize || 1, spacing = look.eyeSpacing || 1, mouthW = look.mouthWidth || 1;
  const ew = 0.084 * S * eyeSize, eh = 0.042 * S * eyeSize;
  const E = {
    neutral: { lid: 0.0, brow: 0, browTilt: 0, open: 1 },
    happy: { lid: 0.25, brow: 0.01, browTilt: -0.02, open: 1 },
    grin: { lid: 0.35, brow: 0.015, browTilt: -0.02, open: 1 },
    smug: { lid: 0.45, brow: -0.005, browTilt: 0.03, open: 1, asym: true },
    angry: { lid: 0.3, brow: -0.02, browTilt: 0.07, open: 1 },
    sad: { lid: 0.3, brow: 0.0, browTilt: -0.07, open: 1 },
    worried: { lid: 0.1, brow: 0.02, browTilt: -0.06, open: 1 },
    surprised: { lid: -0.15, brow: 0.04, browTilt: -0.01, open: 1.35 },
    asleep: { lid: 1, brow: -0.005, browTilt: 0, open: 1 },
  }[expr] || {};
  const lid = Math.min(1, Math.max(E.lid || 0, blink));

  for (const side of [-1, 1]) {
    if (look.paintEyes) {
    const [cx, cy] = P(0.5 + side * L.eyeU * spacing, L.eyeV);
    const h = eh * (E.open || 1) * (1 - lid);
    const irisX = cx + side * -ew * 0.06, irisY = cy + eh * 0.08;
    const ir = eh * 0.86;
    if (h > 0.6) {
      ctx.save();
      // almond eye shape: pointed corners
      ctx.beginPath();
      ctx.moveTo(cx - ew, cy);
      ctx.bezierCurveTo(cx - ew * 0.45, cy - h * 1.35, cx + ew * 0.45, cy - h * 1.35, cx + ew, cy);
      ctx.bezierCurveTo(cx + ew * 0.45, cy + h * 1.15, cx - ew * 0.45, cy + h * 1.15, cx - ew, cy);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.clip();
      // iris with a dark limbal ring, pupil, highlight
      ctx.beginPath(); ctx.arc(irisX, irisY, ir, 0, Math.PI * 2); ctx.fillStyle = look.eyeColor || '#4a6a8a'; ctx.fill();
      ctx.lineWidth = ir * 0.22; ctx.strokeStyle = 'rgba(10,12,16,0.75)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(irisX, irisY, ir * 0.45, 0, Math.PI * 2); ctx.fillStyle = '#050608'; ctx.fill();
      ctx.beginPath(); ctx.arc(irisX - ir * 0.32, irisY - ir * 0.34, ir * 0.24, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      // upper-lid shadow on the eyeball
      ctx.fillStyle = 'rgba(40,24,20,0.28)';
      ctx.fillRect(cx - ew, cy - h * 1.4, ew * 2, h * 0.55);
      ctx.restore();
    }
    // crisp upper lid + outer lash flick
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#120c0a';
    ctx.lineWidth = S * 0.0085;
    ctx.beginPath();
    if (lid >= 0.95) {
      ctx.moveTo(cx - ew, cy); ctx.quadraticCurveTo(cx, cy + eh * 0.55, cx + ew, cy);
    } else {
      ctx.moveTo(cx - ew, cy);
      ctx.bezierCurveTo(cx - ew * 0.45, cy - h * 1.35, cx + ew * 0.45, cy - h * 1.35, cx + ew, cy);
    }
    ctx.stroke();
    const lashX = cx + side * ew, lashY = cy;
    ctx.beginPath(); ctx.moveTo(lashX, lashY); ctx.lineTo(lashX + side * ew * 0.22, lashY - eh * 0.35); ctx.stroke();
    // soft lower lid
    if (h > 0.6) {
      ctx.strokeStyle = 'rgba(60,32,26,0.45)';
      ctx.lineWidth = S * 0.004;
      ctx.beginPath();
      ctx.moveTo(cx - ew * 0.9, cy + h * 0.2);
      ctx.bezierCurveTo(cx - ew * 0.4, cy + h * 1.15, cx + ew * 0.4, cy + h * 1.15, cx + ew * 0.9, cy + h * 0.2);
      ctx.stroke();
    }
    }
    // brow
    const tilt = (E.browTilt || 0) * (E.asym && side > 0 ? -1.5 : 1);
    const by = L.browV + (E.brow || 0);
    const [ix, iy] = P(0.5 + side * (L.eyeU * spacing - 0.07), by - tilt);
    const [ox, oy] = P(0.5 + side * (L.eyeU * spacing + 0.095), by + tilt * 0.4);
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.quadraticCurveTo((ix + ox) / 2, Math.min(iy, oy) - S * 0.012, ox, oy);
    ctx.strokeStyle = look.browColor || '#3a2a20';
    ctx.lineWidth = S * 0.032 * (look.browThickness || 1);
    ctx.stroke();
  }

  // nose: soft shadow + nostrils
  const [nx, ny] = P(0.5, L.noseV);
  ctx.fillStyle = 'rgba(70,32,24,0.45)';
  ctx.beginPath(); ctx.ellipse(nx - S * 0.026, ny, S * 0.013, S * 0.008, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(nx + S * 0.026, ny, S * 0.013, S * 0.008, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(70,32,24,0.35)';
  ctx.lineWidth = S * 0.009;
  ctx.beginPath(); ctx.moveTo(nx + S * 0.012, ny - S * 0.07); ctx.quadraticCurveTo(nx + S * 0.03, ny - S * 0.01, nx + S * 0.012, ny + S * 0.006); ctx.stroke();

  // mouth
  const [mx, my] = P(0.5, L.mouthV);
  const mw = S * 0.095 * mouthW;
  const lip = look.lipColor || '#9a4a44';
  const curve = { neutral: 0.004, happy: 0.03, grin: 0.035, smug: 0.022, angry: -0.012, sad: -0.028, worried: -0.012, surprised: 0, asleep: 0 }[expr] ?? 0;
  const open = Math.max(mouth * 0.8, expr === 'surprised' ? 0.45 : expr === 'grin' ? 0.4 : 0);
  ctx.lineCap = 'round';
  if (open > 0.05 && !look.realMouth) {
    const oh = S * 0.045 * open;
    const w = expr === 'surprised' ? mw * 0.55 : mw * (0.8 + 0.2 * (1 - open));
    ctx.beginPath();
    ctx.moveTo(mx - w, my - curve * S);
    ctx.quadraticCurveTo(mx, my - curve * S * 2 - oh * 0.35, mx + w, my - curve * S);
    ctx.quadraticCurveTo(mx, my + oh - curve * S * 2, mx - w, my - curve * S);
    const grad = ctx.createRadialGradient(mx, my - curve * S + oh * 0.3, 0, mx, my - curve * S + oh * 0.3, w);
    grad.addColorStop(0, '#000000');
    grad.addColorStop(1, '#120606');
    ctx.fillStyle = grad;
    ctx.fill();
    if (expr === 'grin' || expr === 'happy') {
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#f4f1ea';
      ctx.fillRect(mx - w, my - curve * S * 2 - oh, w * 2, oh * 0.75);
      ctx.restore();
    }
    ctx.strokeStyle = lip;
    ctx.lineWidth = S * 0.012;
    ctx.stroke();
  } else {
    const asym = expr === 'smug' ? S * 0.02 : 0;
    ctx.beginPath();
    ctx.moveTo(mx - mw, my - curve * S);
    ctx.quadraticCurveTo(mx, my + curve * S * 1.2, mx + mw, my - curve * S - asym);
    ctx.strokeStyle = lip;
    ctx.lineWidth = S * 0.022;
    ctx.stroke();
  }
}

// Eyelid shells (angles in radians, measured from the top of the eyeball): upperT/lowerT are the
// shell sizes; upperRest tilts the open upper lid; upperClose/lowerClose are the blink swings.
const LID = { upperT: 1.0, lowerT: 0.85, upperRest: -0.1, upperClose: 1.37, lowerClose: 0.35 };

// Mouth shapes for speech: [jaw, wide, round, part]. Not real phonemes, just enough variety that
// talking reads as words rather than a flapping hinge.
const VISEMES = {
  rest: [0, 0, 0, 0],
  A: [0.5, 0.15, 0, 0.3], // "ah"
  E: [0.28, 0.55, 0, 0.3], // "eh"
  I: [0.12, 0.85, 0, 0.45], // "ee"
  O: [0.38, 0, 0.7, 0.2], // "oh"
  U: [0.12, 0, 1, 0.15], // "oo"
  M: [0, 0.1, 0.1, 0], // m, b, p: lips pressed shut
  F: [0.06, 0.2, 0, 0.6], // f, v: lip tucked, teeth showing
  S: [0.07, 0.5, 0, 0.4], // s, t, d, n
  L: [0.22, 0.25, 0, 0.35], // l, r, th
  W: [0.08, 0, 0.85, 0.1], // w, sh
};
const CONSONANTS = ['M', 'F', 'S', 'S', 'L', 'L', 'W'];
const VOWELS = ['A', 'A', 'E', 'E', 'I', 'O', 'U'];
// One sentence of babble: words of 1-3 syllables, short gaps between words, a longer breath after.
function babble() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const out = [];
  const words = 3 + Math.floor(Math.random() * 6);
  for (let w = 0; w < words; w++) {
    const gain = 0.7 + Math.random() * 0.45; // some words are said with more energy
    const syl = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < syl; k++) {
      if (k > 0 || Math.random() < 0.75) out.push([pick(CONSONANTS), 0.045 + Math.random() * 0.05, gain]);
      out.push([pick(VOWELS), 0.08 + Math.random() * 0.09, gain]);
    }
    if (Math.random() < 0.6) out.push(['rest', 0.05 + Math.random() * 0.08, 1]);
  }
  out.push(['rest', 0.3 + Math.random() * 0.4, 1]);
  return out;
}

// ---------------------------------------------------------------------
// Morph targets on the head:
//  [0] jaw: chin/lower face swings down on a hinge near the ears. Within the mouth's width the
//      mesh is split at the lip seam (each triangle goes wholly with the upper or lower lip), so
//      the lips actually part and you can see into the mouth from the side.
//  [1] wide: mouth corners stretch out and back, lips thin ("ee", smiles).
//  [2] round: lips purse forward and in toward the middle ("oo", "w").
//  [3] part: lips open a little without the jaw (upper lip lifts, lower lip drops; "f", "s", "th").
// Talking blends these per syllable, so speech isn't just the jaw flapping.
// ---------------------------------------------------------------------
function faceMorphs(geo, headIdx, box, layout, eyes) {
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const hingeY = box.min.y + s.y * 0.43, hingeZ = c.z - s.z * 0.12;
  const A = 0.4, cosA = Math.cos(A), sinA = Math.sin(A);
  const mouthY = (layout && layout.seamY) ?? box.min.y + s.y * ((layout && layout.mouthV) || FACE_LAYOUT.mouthV);
  const N = pos.count * 3;
  const jaw = new Float32Array(N), wide = new Float32Array(N), round = new Float32Array(N), part = new Float32Array(N);
  const hw = s.x * 0.2, hv = s.y * 0.1, lipFrontZ = box.max.z - s.z * 0.4;
  const tri = pos.count % 3 === 0; // non-indexed (faceted) geometry: triangles are vertex triples
  for (let i = 0; i < pos.count; i++) {
    let wHead = 0;
    for (let q = 0; q < 4; q++) if (si.getComponent(i, q) === headIdx) wHead += sw.getComponent(i, q);
    if (wHead <= 0) continue;
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // ---- jaw
    const front = Math.min(1, Math.max(0, (z - (c.z - s.z * 0.3)) / (s.z * 0.35)));
    let below = Math.min(1, Math.max(0, (mouthY + s.y * 0.015 - y) / (s.y * 0.045)));
    if (tri) {
      // Inside the mouth, each triangle goes wholly with the upper or lower lip. The split fades out
      // toward the corners (measured per vertex, so corner vertices still agree and nothing tears),
      // which opens the lips in a lens shape instead of a box.
      const t0 = i - (i % 3);
      const cy = (pos.getY(t0) + pos.getY(t0 + 1) + pos.getY(t0 + 2)) / 3;
      const u = Math.abs(x - c.x) / (s.x * 0.15);
      if (u < 1 && cy > mouthY - s.y * 0.08 && cy < mouthY + s.y * 0.05) {
        const open = Math.sqrt(1 - u * u);
        below += ((cy < mouthY ? 1 : 0) - below) * open;
      }
    }
    const wj = wHead * below * front;
    if (wj) {
      const dy0 = y - hingeY, dz0 = z - hingeZ;
      jaw[i * 3 + 1] = (hingeY + dy0 * cosA - dz0 * sinA - y) * wj;
      jaw[i * 3 + 2] = (hingeZ + dy0 * sinA + dz0 * cosA - z) * wj;
    }
    // ---- lip shapes: a soft oval around the mouth, front of the face only
    const dx = x - c.x, dy = y - mouthY, ux = dx / hw;
    let wm = 1 - ux * ux - (dy / hv) * (dy / hv);
    if (wm > 0 && z > lipFrontZ) {
      wm = wm * wm * (3 - 2 * wm) * Math.min(1, (z - lipFrontZ) / (s.z * 0.12)) * wHead;
      const k = i * 3;
      // wide: corners out and back, lips flatten toward the seam
      wide[k] = dx * 0.28 * wm;
      wide[k + 1] = -dy * 0.25 * wm;
      wide[k + 2] = -s.z * 0.02 * ux * ux * wm;
      // round: corners in, lips forward and toward each other
      round[k] = -dx * 0.45 * wm;
      round[k + 1] = -dy * 0.12 * wm;
      round[k + 2] = s.z * 0.05 * (1 - Math.min(1, ux * ux)) * wm;
      // part: lower lip drops, upper lip lifts (follows the same upper/lower split as the jaw)
      part[k + 1] = (-below * 0.03 + (1 - below) * 0.012) * s.y * wm;
      part[k + 2] = -below * s.z * 0.006 * wm;
    }
  }
  geo.morphAttributes.position = [jaw, wide, round, part].map((a) => new THREE.Float32BufferAttribute(a, 3));
  geo.morphTargetsRelative = true;
}

// Recolor the UBC eye texture's iris to a target color (keeps the painted shading).
export function recolorEyes(eyeMeshes, hex) {
  const target = new THREE.Color(hex), hsl = {}, th = {};
  target.getHSL(th);
  for (const m of eyeMeshes || []) {
    const src = m.userData.eyeSourceImage || (m.material.map && m.material.map.image);
    if (!src) continue;
    m.userData.eyeSourceImage = src;
    const W = src.width, H = src.height;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const cx2 = cv.getContext('2d');
    cx2.drawImage(src, 0, 0);
    const img = cx2.getImageData(0, 0, W, H), d = img.data;
    const hx = new THREE.Color(hex).getHex(); // sRGB, matching the canvas
    const tc = { r: ((hx >> 16) & 255) / 255, g: ((hx >> 8) & 255) / 255, b: (hx & 255) / 255 };
    // The UBC texture: pupil r < 0.033, iris to 0.105, sclera beyond (rather grey). Repaint the iris
    // in the target color with a dark limbal ring, and whiten the sclera so the eyes read clearly.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x / W - 0.5, dy = y / H - 0.5, r = Math.hypot(dx, dy);
      const k = (y * W + x) * 4;
      if (r < 0.034) continue; // pupil
      if (r < 0.105) {
        const lum = (d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11) / 255;
        if (lum > 0.6) continue; // catchlight
        let shade = 0.75 + Math.min(0.6, lum * 1.6); // keep the painted streaks
        if (r > 0.088) shade *= 0.45 + 0.55 * (0.105 - r) / 0.017; // limbal ring
        d[k] = Math.min(255, tc.r * 255 * shade); d[k + 1] = Math.min(255, tc.g * 255 * shade); d[k + 2] = Math.min(255, tc.b * 255 * shade);
      } else if (r < 0.32) {
        const f = r < 0.2 ? 1.5 : 1.5 - (r - 0.2) / 0.12 * 0.5;
        for (let q = 0; q < 3; q++) d[k + q] = Math.min(255, d[k + q] * f);
      }
    }
    cx2.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    m.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0 });
  }
}

// ---------------------------------------------------------------------
// Decal: front-facing head triangles of the faceted body, UV-projected onto the face canvas.
// ---------------------------------------------------------------------
export function createFace(bodyMesh, look = {}) {
  const geo = bodyMesh.geometry;
  const headIdx = bodyMesh.skeleton.bones.findIndex((b) => b.name === 'Head');
  const box = headBox(geo, headIdx);
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const s = box.getSize(new THREE.Vector3());
  const P = [], UV = [], SI = [], SW = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    if (dominantBone(si, sw, t) !== headIdx || dominantBone(si, sw, t + 1) !== headIdx || dominantBone(si, sw, t + 2) !== headIdx) continue;
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
    n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    const vs = [a, b, c].map((p) => (p.y - box.min.y) / s.y);
    const eyeBand = Math.min(...vs) < 0.62 && Math.max(...vs) > 0.4;
    const mouthBand = Math.min(...vs) < 0.26 && Math.max(...vs) > 0.12; // lip creases face up/down
    if (n.z < (eyeBand || mouthBand ? -0.25 : 0.15)) continue;
    if (Math.max(...vs) < 0.12 || Math.min(...vs) > 0.72) continue;
    [a, b, c].forEach((p, k) => {
      // exactly on the skin (same vertices, same morphs); polygonOffset keeps it on top. Any lift
      // leaves paint floating off steep spots like the nose wings and lip edges.
      P.push(p.x, p.y, p.z);
      UV.push((p.x - box.min.x) / s.x, (p.y - box.min.y) / s.y);
      for (let q = 0; q < 4; q++) { SI.push(si.getComponent(t + k, q)); SW.push(sw.getComponent(t + k, q)); }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  g.computeVertexNormals();

  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
  const mesh = new THREE.SkinnedMesh(g, mat);
  mesh.position.copy(bodyMesh.position);
  mesh.quaternion.copy(bodyMesh.quaternion);
  mesh.scale.copy(bodyMesh.scale);
  bodyMesh.parent.add(mesh);
  mesh.bind(bodyMesh.skeleton, bodyMesh.bindMatrix);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;

  // Real jaw motion on both the faceted head and the face decal
  const layout = { ...FACE_LAYOUT, ...(look.layout || {}) };
  faceMorphs(geo, headIdx, box, layout, look.eyes);
  bodyMesh.updateMorphTargets();
  faceMorphs(g, headIdx, box, layout, look.eyes);
  mesh.updateMorphTargets();
  if (look.eyeMeshes) recolorEyes(look.eyeMeshes, look.eyeColor || '#4a6a8a');
  // Mouth interior: the body is a closed shell, so when the lips part you look at its inside. Render
  // the body double sided and shade back faces near-black, which reads as a real mouth from any
  // angle and deforms with the skin (a rigid box on the head bone poked through the chin).
  {
    const m = bodyMesh.material;
    m.side = THREE.DoubleSide;
    m.shadowSide = THREE.BackSide; // as single sided would; DoubleSide shadows self-shadow the whole body
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\n  if (!gl_FrontFacing) gl_FragColor = vec4(0.045, 0.012, 0.014, 1.0);');
    };
    m.customProgramCacheKey = () => 'mouthInterior';
    m.needsUpdate = true;
  }
  // Eyelids: the head mesh has no real lids, so each eye gets two thin skin shells hugging the
  // eyeball, parented to the head bone. The upper lid swings down over the eye to blink (its edge
  // carries a dark lash line); the lower lid rises a little to meet it.
  const lids = [];
  if (look.eyes) {
    const headBone = bodyMesh.skeleton.bones[headIdx];
    const toBone = new THREE.Matrix4().multiplyMatrices(bodyMesh.skeleton.boneInverses[headIdx], bodyMesh.bindMatrix);
    const lidMat = new THREE.MeshStandardMaterial({ color: look.skinColor || '#d9a982', vertexColors: true, flatShading: true, roughness: 0.8 });
    const WS = 18, HS = 6;
    const shell = (r, t0, tl, edgeRow, edgeCol) => {
      const g = new THREE.SphereGeometry(r, WS, HS, Math.PI / 2 - 1.7, 3.4, t0, tl);
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) col.set(Math.floor(k / (WS + 1)) === edgeRow ? edgeCol : [1, 1, 1], k * 3);
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, lidMat);
      m.castShadow = false;
      return m;
    };
    for (const e of look.eyes) {
      const pivot = new THREE.Group();
      pivot.matrixAutoUpdate = false;
      pivot.matrix.copy(toBone).multiply(new THREE.Matrix4().makeTranslation(e.x, e.y, e.z));
      headBone.add(pivot);
      const upper = shell(e.r * 1.07, 0, LID.upperT, HS, [0.18, 0.12, 0.1]);
      const lower = shell(e.r * 1.05, Math.PI - LID.lowerT, LID.lowerT, 0, [0.75, 0.6, 0.55]);
      pivot.add(upper, lower);
      lids.push({ upper, lower });
    }
  }
  const setLids = (v) => {
    for (const l of lids) {
      l.upper.rotation.x = LID.upperRest + v * LID.upperClose;
      l.lower.rotation.x = -LID.lowerClose * Math.max(0, v);
    }
  };
  setLids(0);
  const setMorph = (k, v) => {
    if (bodyMesh.morphTargetInfluences) bodyMesh.morphTargetInfluences[k] = v;
    if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[k] = v;
  };
  const setJaw = (v) => setMorph(0, v);
  const EXPR_LID = { happy: 0.25, grin: 0.35, smug: 0.45, angry: 0.3, sad: 0.3, worried: 0.1, surprised: -0.2, asleep: 1 };

  const state = { look: { ...look }, expr: look.expression || 'neutral', talking: false, t: 0, mouth: 0, jaw: 0, blink: 0, nextBlink: 2 + Math.random() * 3, redraw: 0 };
  const EXPR_JAW = { surprised: 0.55, grin: 0.2, happy: 0.05, sad: 0.02 };
  const EXPR_WIDE = { happy: 0.3, grin: 0.55, smug: 0.2, worried: 0.1 };
  const EXPR_ROUND = { surprised: 0.35 };
  const mouthPose = [0, 0, 0, 0]; // current [jaw, wide, round, part], smoothed toward the speech target
  const talk = { target: VISEMES.rest, left: 0, queue: [] };
  const draw = () => { drawFace(ctx, S, state.look, state.expr, state.mouth, state.blink); tex.needsUpdate = true; };
  draw();
  return {
    mesh,
    setExpression(e) { state.expr = e; draw(); },
    setTalking(on) { state.talking = on; if (!on) { state.mouth = 0; draw(); } },
    setLook(l) {
      const eyeChanged = l.eyeColor && l.eyeColor !== state.look.eyeColor;
      state.look = { ...state.look, ...l };
      if (eyeChanged && state.look.eyeMeshes) recolorEyes(state.look.eyeMeshes, state.look.eyeColor);
      draw();
    },
    debugJaw(v) { state.forceJaw = v; state.mouth = v ?? 0; draw(); },
    debugViseme(name) { state.forceViseme = name ? VISEMES[name] : null; },
    update(dt) {
      state.t += dt;
      let dirty = false;
      // blink
      if (state.t > state.nextBlink) {
        const k = (state.t - state.nextBlink) / 0.14;
        state.blink = k < 1 ? Math.sin(k * Math.PI) : 0;
        if (k >= 1) state.nextBlink = state.t + 2.5 + Math.random() * 3.5;
        dirty = true;
      }
      // talking: a stream of made-up words, each syllable a consonant shape then a vowel shape
      if (state.talking) {
        talk.left -= dt;
        if (talk.left <= 0) {
          if (!talk.queue.length) talk.queue = babble();
          const [v, dur, gain] = talk.queue.shift();
          talk.target = VISEMES[v].map((x) => x * gain);
          talk.left = dur;
        }
      } else talk.target = VISEMES.rest;
      const speech = state.forceViseme || talk.target;
      const goal = [
        state.forceJaw ?? Math.max(speech[0], EXPR_JAW[state.expr] || 0),
        Math.max(speech[1], EXPR_WIDE[state.expr] || 0),
        Math.max(speech[2], EXPR_ROUND[state.expr] || 0),
        speech[3],
      ];
      const ease = Math.min(1, dt * 16);
      for (let q = 0; q < 4; q++) {
        mouthPose[q] += (goal[q] - mouthPose[q]) * ease;
        setMorph(q, mouthPose[q]);
      }
      state.jaw = mouthPose[0];
      // real lids: expression squint/widen plus blinks
      const lidTarget = state.expr === 'asleep' ? 1 : Math.max(EXPR_LID[state.expr] || 0, state.blink);
      state.lid = (state.lid || 0) + (lidTarget - (state.lid || 0)) * Math.min(1, dt * 30);
      setLids(state.lid);
      if (dirty && !state.look.eyes) draw();

    },
  };
}
