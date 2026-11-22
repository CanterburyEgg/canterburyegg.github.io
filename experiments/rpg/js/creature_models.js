// =====================================================================
// CREATURE MODELS from primitives (style matches the NPCs and aliens). Model faces +z.
// Phase A: the Skarl. Each builder returns a Group with userData.animate(t, moving, attacking, dead).
// =====================================================================
import * as THREE from 'three';

const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true, ...extra });

// Skarl: lean wolf-like pack hunter. Long body, low head, tall ears, bristled back, glowing eyes.
function skarl(c) {
  const [fur, dark, accent = '#ffd23f'] = c.colors;
  const v = c.variant || 'scrub';
  const legLen = v === 'scrub' ? 0.42 : v === 'ridge' ? 0.66 : 0.55; // scrub runs low, ridge runs tall
  const hipY = legLen;
  const glow = (col, k = 1.2) => new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: k });
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.62, 4, 8), mat(fur));
  torso.rotation.x = Math.PI / 2;
  torso.position.y = hipY + 0.07;
  body.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat(fur));
  chest.position.set(0, hipY + 0.11, 0.28);
  body.add(chest);
  if (v === 'ridge') { // tall mane crest from head to mid-back
    for (let k = 0; k < 7; k++) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3 - k * 0.025, 4), mat(dark));
      b.position.set(0, hipY + 0.32, 0.34 - k * 0.11);
      b.rotation.x = -0.35;
      body.add(b);
    }
  } else if (v === 'ash') { // overlapping bone plates down the back
    for (let k = 0; k < 5; k++) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3 - k * 0.025, 0.06, 0.16), mat('#cfc6b8', { roughness: 0.5 }));
      plate.position.set(0, hipY + 0.25 - k * 0.012, 0.24 - k * 0.14);
      plate.rotation.x = 0.15;
      body.add(plate);
    }
  } else { // short scruffy bristles
    const n = v === 'scrub' ? 8 : 5;
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(v === 'scrub' ? 0.04 : 0.05, v === 'scrub' ? 0.12 : 0.16, 4), mat(dark));
      b.position.set(v === 'scrub' ? (k % 2 ? 0.05 : -0.05) : 0, hipY + 0.22, 0.26 - k * (0.65 / n));
      b.rotation.set(-0.5, 0, v === 'scrub' ? (k % 2 ? 0.4 : -0.4) : 0);
      body.add(b);
    }
  }
  if (v === 'ridge') for (let k = 0; k < 3; k++) { // pale stripes across the flanks
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.022, 4, 12, Math.PI), mat(accent));
    stripe.position.set(0, hipY + 0.07, 0.12 - k * 0.2);
    stripe.rotation.y = Math.PI / 2;
    body.add(stripe);
  }
  if (v === 'ash') for (let k = 0; k < 4; k++) { // ember cracks glowing through the hide
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.05), glow(accent, 1.4));
    crack.position.set(k % 2 ? 0.205 : -0.205, hipY + 0.06, 0.2 - k * 0.15);
    crack.rotation.x = 0.6;
    body.add(crack);
  }
  const head = new THREE.Group();
  head.position.set(0, hipY + 0.19, 0.5);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), mat(fur));
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.24), mat(dark));
  snout.position.set(0, -0.04, 0.2);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.2), mat(dark));
  jaw.position.set(0, -0.11, 0.17);
  head.add(skull, snout, jaw);
  const eyeCol = v === 'dusk' ? accent : v === 'ash' ? accent : '#ffd23f';
  for (const s of [-1, 1]) {
    // scrub: huge ears · dusk: swept-back horns instead of tall ears
    const ear = v === 'scrub'
      ? new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.26, 4), mat(dark))
      : new THREE.Mesh(new THREE.ConeGeometry(0.05, v === 'dusk' ? 0.1 : 0.16, 4), mat(dark));
    ear.position.set(s * (v === 'scrub' ? 0.1 : 0.08), v === 'scrub' ? 0.2 : 0.16, -0.04);
    if (v === 'scrub') ear.rotation.z = -s * 0.35;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), glow(eyeCol, 1.3));
    eye.position.set(s * 0.07, 0.04, 0.12);
    head.add(ear, eye);
    if (v === 'dusk') {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.34, 5), mat('#d8cfe0', { roughness: 0.4 }));
      horn.position.set(s * 0.09, 0.14, -0.14);
      horn.rotation.set(-1.1, 0, -s * 0.25);
      const eye2 = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), glow(eyeCol, 1.3)); // second pair of eyes
      eye2.position.set(s * 0.085, 0.085, 0.1);
      head.add(horn, eye2);
    }
    if (v === 'ash') { // tusks out of the lower jaw
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.12, 4), mat('#ece4d4'));
      tusk.position.set(s * 0.055, -0.07, 0.27);
      tusk.rotation.x = -0.3;
      head.add(tusk);
    }
  }
  body.add(head);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.45, 5), mat(dark));
  tail.position.set(v === 'dusk' ? 0.06 : 0, hipY + 0.13, -0.52);
  tail.rotation.x = -2.2;
  body.add(tail);
  let tail2 = null;
  if (v === 'dusk') { // twin tails
    tail2 = tail.clone();
    tail2.position.x = -0.06;
    body.add(tail2);
  }
  const legs = [];
  for (const [x, z] of [[-0.13, 0.3], [0.13, 0.3], [-0.13, -0.3], [0.13, -0.3]]) {
    const leg = new THREE.Group();
    leg.position.set(x, hipY, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(v === 'scrub' ? 0.05 : 0.045, 0.035, legLen, 5), mat(z > 0 ? fur : dark));
    m.position.y = -legLen / 2;
    leg.add(m);
    body.add(leg);
    legs.push(leg);
  }
  g.scale.setScalar(c.scale || 1);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.height = (hipY + 0.45) * (c.scale || 1);
  g.userData.animate = (t, moving, attacking, dead) => {
    if (dead) { body.rotation.z = Math.min(Math.PI / 2, body.rotation.z + 0.15); body.position.y = -0.25; return; }
    body.rotation.z = 0; body.position.y = 0;
    const gait = moving ? Math.sin(t * 13) : 0;
    legs[0].rotation.x = legs[3].rotation.x = gait * 0.6;
    legs[1].rotation.x = legs[2].rotation.x = -gait * 0.6;
    body.position.y = moving ? Math.abs(gait) * 0.04 : Math.sin(t * 2) * 0.01;
    tail.rotation.x = -2.2 + Math.sin(t * (moving ? 10 : 2)) * 0.15;
    if (tail2) tail2.rotation.x = -2.2 + Math.sin(t * (moving ? 10 : 2) + 1.3) * 0.15;
    head.rotation.x = attacking ? -0.5 * Math.max(0, Math.sin(t * 9)) : Math.sin(t * 0.8) * 0.06;
    jaw.position.y = attacking ? -0.15 : -0.11;
  };
  return g;
}

export const CREATURE_BUILDERS = { skarl };
export function buildCreatureModel(c) { return (CREATURE_BUILDERS[c.family] || skarl)(c); }
