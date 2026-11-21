// =====================================================================
// ALIEN BODIES from primitives (one builder per species in data/aliens.js). Each builder fills the
// `body` group (model faces +z) and returns { headY, frontZ, neckY, idle(body, t, moving) }.
// def.v holds a few seeded 0..1 numbers so individuals of a species differ (limb counts, proportions).
// =====================================================================
import * as THREE from 'three';

const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true, ...extra });
const glow = (c, k = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4, flatShading: true });
const shade = (c, dl) => new THREE.Color(c).offsetHSL(0, 0, dl);
function eye(parent, x, y, z, r, pupilDir = 1) {
  const white = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 10, 8), mat('#f4f1ea'));
  white.position.set(x, y, z);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat('#14161c'));
  pupil.position.set(x, y, z + r * 1.1 * pupilDir);
  parent.add(white, pupil);
  return white;
}

// Strider: a slim torso high on three or four long legs, a small head with one big eye.
function strider(body, def) {
  const v = def.v, tint = def.tint, accent = def.accent;
  const legs = v[0] < 0.5 ? 3 : 4, legLen = 1.35 + v[1] * 0.35, hipY = legLen * 0.92;
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(shade(tint, -0.06)));
  hips.position.y = hipY;
  body.add(hips);
  const legGroup = [];
  for (let k = 0; k < legs; k++) {
    const a = (k / legs) * Math.PI * 2 + 0.4;
    const leg = new THREE.Group();
    leg.position.set(0, hipY, 0);
    leg.rotation.y = a;
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, legLen * 0.55, 6), mat(tint));
    thigh.position.set(0, -legLen * 0.2, 0.18);
    thigh.rotation.x = 0.55;
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, legLen * 0.62, 6), mat(shade(tint, -0.1)));
    shin.position.set(0, -legLen * 0.62, 0.33);
    shin.rotation.x = -0.12;
    leg.add(thigh, shin);
    body.add(leg);
    legGroup.push(leg);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.55 + v[2] * 0.25, 4, 8), mat(tint));
  torso.position.y = hipY + 0.45;
  body.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.35, 6), mat(shade(tint, -0.05)));
  neck.position.y = hipY + 0.95;
  body.add(neck);
  const head = new THREE.Group();
  head.position.y = hipY + 1.18;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), mat(tint));
  skull.scale.set(1, 0.85, 1.25);
  head.add(skull);
  const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), mat('#f4f1ea'));
  e.position.set(0, 0.02, 0.17);
  const iris = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glow(accent, 0.6));
  iris.position.set(0, 0.02, 0.235);
  head.add(e, iris);
  body.add(head);
  for (const s of [-1, 1]) { // thin arms
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.75, 5), mat(shade(tint, -0.08)));
    arm.position.set(s * 0.2, hipY + 0.45, 0.05);
    arm.rotation.z = s * 0.18;
    body.add(arm);
  }
  return {
    headY: hipY + 1.18, frontZ: 0.25, neckY: hipY + 0.95,
    idle(b, t, moving) {
      head.rotation.y = Math.sin(t * 0.4) * 0.5;
      b.position.y = moving ? Math.abs(Math.sin(t * 3)) * 0.06 : Math.sin(t * 0.8) * 0.02;
      legGroup.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t * 3 + i * 2.1) * 0.25 : 0; });
    },
  };
}

// Glimmer: a translucent glowing bell that floats, trailing tentacles.
function glimmer(body, def) {
  const v = def.v, tint = def.tint;
  const floatY = 1.0 + v[0] * 0.3;
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.35, transparent: true, opacity: 0.72, roughness: 0.2, side: THREE.DoubleSide, flatShading: true }));
  bell.scale.set(1, 0.9 + v[1] * 0.3, 1);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), glow(def.accent, 1.1));
  core.position.y = 0.12;
  const swim = new THREE.Group();
  swim.position.y = floatY;
  swim.add(bell, core);
  const tentacles = [];
  const n = 5 + Math.floor(v[2] * 4);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 0.7 + (k % 3) * 0.15, 5), new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.25, transparent: true, opacity: 0.8 }));
    t.geometry.translate(0, -0.35, 0);
    t.position.set(Math.sin(a) * 0.3, 0.02, Math.cos(a) * 0.3);
    swim.add(t);
    tentacles.push(t);
  }
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat('#14161c'));
    e.position.set(s * 0.13, 0.14, 0.37);
    swim.add(e);
  }
  body.add(swim);
  return {
    headY: floatY + 0.15, frontZ: 0.4, neckY: floatY - 0.1,
    idle(b, t) {
      swim.position.y = floatY + Math.sin(t * 1.3) * 0.12;
      const pulse = 1 + Math.sin(t * 2.6) * 0.06;
      bell.scale.x = bell.scale.z = pulse;
      tentacles.forEach((tt, i) => { tt.rotation.x = Math.sin(t * 2 + i) * 0.25; tt.rotation.z = Math.cos(t * 1.7 + i) * 0.2; });
    },
  };
}

// Skitter: a low armored body on six legs, four eyes and a pair of feelers.
function skitter(body, def) {
  const v = def.v, tint = def.tint, accent = def.accent;
  const len = 0.75 + v[0] * 0.3, bodyY = 0.42;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), mat(tint, { roughness: 0.45 }));
  shell.scale.set(1, 0.6, len / 0.68);
  shell.position.y = bodyY;
  body.add(shell);
  for (let k = 0; k < 3; k++) { // armor bands
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 4, 12, Math.PI), mat(accent));
    band.rotation.y = Math.PI / 2;
    band.position.set(0, bodyY, -0.18 + k * 0.18);
    band.scale.set(1, 0.65, 1);
    body.add(band);
  }
  const head = new THREE.Group();
  head.position.set(0, bodyY + 0.05, len * 0.5);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(shade(tint, -0.06)));
  head.add(skull);
  [[-0.08, 0.06], [0.08, 0.06], [-0.11, -0.03], [0.11, -0.03]].forEach(([x, y], i) => eye(head, x, y, 0.13, i < 2 ? 0.028 : 0.02));
  const feelers = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.42, 4), mat(shade(tint, -0.15)));
    f.geometry.translate(0, 0.21, 0);
    f.position.set(s * 0.06, 0.12, 0.08);
    f.rotation.set(0.7, 0, -s * 0.35);
    head.add(f);
    feelers.push(f);
  }
  body.add(head);
  const legs = [];
  for (let k = 0; k < 6; k++) {
    const side = k < 3 ? -1 : 1, i = k % 3;
    const leg = new THREE.Group();
    leg.position.set(side * 0.26, bodyY, -0.22 + i * 0.22);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.32, 5), mat(shade(tint, -0.1)));
    upper.geometry.translate(0, 0.16, 0);
    upper.rotation.z = side * -1.0;
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.022, 0.42, 5), mat(shade(tint, -0.14)));
    lower.position.set(side * 0.27, 0.13, 0);
    lower.geometry.translate(0, -0.21, 0);
    lower.rotation.z = side * 0.25;
    leg.add(upper, lower);
    body.add(leg);
    legs.push(leg);
  }
  return {
    headY: bodyY + 0.1, frontZ: len * 0.5 + 0.15, neckY: bodyY + 0.1,
    idle(b, t, moving) {
      legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t * 14 + i * Math.PI * 0.66) * 0.35 : Math.sin(t * 2 + i) * 0.04; });
      feelers.forEach((f, i) => { f.rotation.x = 0.7 + Math.sin(t * 5 + i * 1.3) * 0.25; });
      head.rotation.y = Math.sin(t * 0.9) * 0.3;
      b.position.y = moving ? Math.abs(Math.sin(t * 14)) * 0.02 : 0;
    },
  };
}

// Facet: a crystal body of stacked shards around a glowing core; shards orbit slowly.
function facet(body, def) {
  const v = def.v, tint = def.tint;
  const crystal = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.15, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.88, emissive: tint, emissiveIntensity: 0.12 });
  const base = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), crystal);
  base.scale.set(1, 1.4, 1);
  base.position.y = 0.48;
  const chest = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), crystal);
  chest.scale.set(1.1, 1.2, 0.9);
  chest.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), crystal);
  head.scale.set(1, 1.3, 1);
  head.position.y = 1.62;
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), glow(def.accent, 1.4));
  core.position.y = 1.12;
  body.add(base, chest, head, core);
  const eyeBar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), glow(def.accent, 1.2));
  eyeBar.position.set(0, 1.64, 0.17);
  body.add(eyeBar);
  const shards = new THREE.Group();
  shards.position.y = 1.1;
  const n = 3 + Math.floor(v[0] * 4);
  for (let k = 0; k < n; k++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.07 + v[1] * 0.05, 0), crystal);
    const a = (k / n) * Math.PI * 2;
    s.position.set(Math.sin(a) * 0.55, Math.sin(a * 2) * 0.15, Math.cos(a) * 0.55);
    s.scale.set(0.7, 1.6, 0.7);
    shards.add(s);
  }
  body.add(shards);
  return {
    headY: 1.62, frontZ: 0.3, neckY: 1.42,
    idle(b, t) {
      shards.rotation.y = t * 0.6;
      core.rotation.y = t * 1.5;
      core.material.emissiveIntensity = 1.1 + Math.sin(t * 3) * 0.4;
      b.position.y = Math.sin(t * 1.2) * 0.03;
    },
  };
}

// Morel: a stubby stalk body under a big spotted cap, little arms, sleepy eyes.
function morel(body, def) {
  const v = def.v, tint = def.tint, accent = def.accent;
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.75, 10), mat('#efe6d2'));
  stalk.position.y = 0.42;
  body.add(stalk);
  const capR = 0.42 + v[0] * 0.2;
  const tall = v[1] > 0.6; // some caps are tall and honeycombed (a true morel)
  const cap = tall
    ? new THREE.Mesh(new THREE.ConeGeometry(capR * 0.75, capR * 1.8, 9, 3), mat(tint))
    : new THREE.Mesh(new THREE.SphereGeometry(capR, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(tint));
  cap.position.y = tall ? 0.8 + capR * 0.9 : 0.78;
  if (!tall) cap.scale.y = 0.75;
  body.add(cap);
  const spots = 4 + Math.floor(v[2] * 5);
  for (let k = 0; k < spots; k++) {
    const a = k * 2.4, el = 0.35 + (k % 3) * 0.2;
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.05 + (k % 2) * 0.025, 6, 5), mat(accent));
    let r, y;
    if (tall) { // sit on the cone's surface: radius shrinks toward the tip
      const h = capR * 1.8, f = 0.12 + (k % 4) * 0.16;
      y = cap.position.y - h / 2 + f * h;
      r = capR * 0.75 * (1 - f);
    } else { r = capR * Math.cos(el); y = cap.position.y + capR * 0.75 * Math.sin(el); }
    sp.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
    body.add(sp);
  }
  for (const s of [-1, 1]) {
    eye(body, s * 0.08, 0.66, 0.2, 0.03);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e6dcc4'));
    lid.position.set(s * 0.08, 0.665, 0.205);
    lid.rotation.x = 0.35; // sleepy half-lids
    body.add(lid);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 3, 6), mat('#e6dcc4'));
    arm.position.set(s * 0.27, 0.42, 0.02);
    arm.rotation.z = s * 0.5;
    body.add(arm);
  }
  return {
    headY: 0.72, frontZ: 0.25, neckY: 0.62,
    idle(b, t, moving) {
      b.rotation.z = moving ? Math.sin(t * 6) * 0.08 : Math.sin(t * 0.7) * 0.03;
      b.position.y = moving ? Math.abs(Math.sin(t * 6)) * 0.04 : 0;
    },
  };
}

// Murmur: an empty work suit with a glass dome full of drifting lights.
function murmur(body, def) {
  const v = def.v, tint = def.tint, accent = def.accent;
  const suit = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 4, 10), mat(tint));
  suit.position.y = 0.85;
  body.add(suit);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.35, 3, 6), mat(shade(tint, -0.08)));
    leg.position.set(s * 0.13, 0.28, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.42, 3, 6), mat(shade(tint, -0.05)));
    arm.position.set(s * 0.38, 0.85, 0);
    arm.rotation.z = s * 0.15;
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat('#2a2d34'));
    glove.position.set(s * 0.41, 0.55, 0);
    body.add(leg, arm, glove);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 16), mat('#8a919c', { metalness: 0.6, roughness: 0.35 }));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.32;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1 }));
  dome.position.y = 1.55;
  body.add(collar, dome);
  const motes = [];
  const n = 9 + Math.floor(v[0] * 8);
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.025 + (k % 3) * 0.01, 6, 4), glow(k % 4 === 0 ? '#ffffff' : accent, 1.5));
    m.userData.seed = [Math.random() * 6, Math.random() * 6, 0.6 + Math.random()];
    body.add(m);
    motes.push(m);
  }
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.02), mat(accent));
  patch.position.set(0.12, 1.02, 0.3);
  body.add(patch);
  return {
    headY: 1.55, frontZ: 0.32, neckY: 1.32,
    idle(b, t, moving) {
      motes.forEach((m) => {
        const [p, q, sp] = m.userData.seed;
        m.position.set(Math.sin(t * sp + p) * 0.15, 1.55 + Math.sin(t * sp * 1.3 + q) * 0.13, Math.cos(t * sp * 0.8 + p) * 0.15);
      });
      b.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.05 : Math.sin(t * 2) * 0.015;
    },
  };
}

export const ALIEN_BUILDERS = { strider, glimmer, skitter, facet, morel, murmur };
