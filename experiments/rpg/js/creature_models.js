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

const glowMat = (col, k = 1.2) => new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: k });
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };
function finish(g, c, height) {
  g.scale.setScalar(c.scale || 1);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.height = height * (c.scale || 1);
  return g;
}
// shared death: tip over and sink a little
function fall(body, k = 0.25) { body.rotation.z = Math.min(Math.PI / 2, body.rotation.z + 0.12); body.position.y = -k; }

// ---------------------------------------------------------------------
// Gallox: a herd grazer the size of a bison. Barrel body, hump, long neck that dips to graze.
// ---------------------------------------------------------------------
function gallox(c) {
  const [hide, dark, accent] = c.colors;
  const v = c.variant || 'scrub';
  const legLen = v === 'ridge' ? 0.95 : v === 'scrub' ? 0.62 : 0.75;
  const hipY = legLen;
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const torso = mesh(new THREE.CapsuleGeometry(0.36, 0.7, 4, 10), mat(hide), 0, hipY + 0.28, 0);
  torso.rotation.x = Math.PI / 2;
  body.add(torso);
  const hump = mesh(new THREE.SphereGeometry(0.34, 10, 8), mat(v === 'ash' ? '#7a7066' : hide), 0, hipY + 0.5, 0.25);
  hump.scale.set(1, 0.8, 1.2);
  body.add(hump);
  if (v === 'ash') for (let k = 0; k < 4; k++) { // stone plates over the hump
    const p = mesh(new THREE.DodecahedronGeometry(0.13 - k * 0.012, 0), mat('#8a8278', { roughness: 0.95 }), (k % 2 ? 0.1 : -0.1), hipY + 0.74 - k * 0.04, 0.38 - k * 0.15);
    p.rotation.set(k, k * 2, 0);
    body.add(p);
  }
  if (v === 'scrub') for (let k = 0; k < 14; k++) { // shaggy fringe hanging off the belly and flanks
    const a = (k / 14) * Math.PI * 2;
    const f = mesh(new THREE.ConeGeometry(0.06, 0.26, 4), mat(dark), Math.cos(a) * 0.3, hipY + 0.02, Math.sin(a) * 0.5);
    f.rotation.x = Math.PI;
    body.add(f);
  }
  if (v === 'dusk') for (let k = 0; k < 6; k++) { // glowing spots down the back
    for (const s of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.035, 6, 4), glowMat(accent, 1.5), s * 0.16, hipY + 0.6 - k * 0.02, 0.3 - k * 0.15));
  }
  // neck pivots at the shoulders so the whole head dips to graze
  const neck = new THREE.Group();
  neck.position.set(0, hipY + 0.36, 0.66);
  body.add(neck);
  const neckLen = v === 'ridge' ? 0.62 : 0.48;
  const neckM = mesh(new THREE.CylinderGeometry(0.12, 0.2, neckLen, 7), mat(hide), 0, neckLen * 0.42, neckLen * 0.28);
  neckM.rotation.x = 0.6;
  neck.add(neckM);
  const head = new THREE.Group();
  head.position.set(0, neckLen * 0.82, neckLen * 0.62);
  neck.add(head);
  head.add(mesh(new THREE.BoxGeometry(0.22, 0.22, 0.3), mat(hide), 0, 0, 0.05));
  head.add(mesh(new THREE.BoxGeometry(0.18, 0.16, 0.18), mat(dark), 0, -0.04, 0.26)); // muzzle
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.025, 6, 4), v === 'ash' ? glowMat(accent, 1.3) : v === 'dusk' ? glowMat(accent, 1.0) : mat('#141414'), s * 0.11, 0.04, 0.14));
    const ear = mesh(new THREE.ConeGeometry(0.045, v === 'dusk' ? 0.34 : 0.14, 4), mat(dark), s * 0.13, v === 'dusk' ? -0.02 : 0.1, -0.04);
    ear.rotation.z = v === 'dusk' ? s * 2.4 : -s * 0.9; // dusk ears droop low
    head.add(ear);
    if (v === 'scrub') { // short horns curling forward
      const horn = mesh(new THREE.TorusGeometry(0.08, 0.025, 4, 8, Math.PI * 1.2), mat('#e8dcc4', { roughness: 0.5 }), s * 0.12, 0.13, 0.0);
      horn.rotation.set(0, Math.PI / 2, s * 0.4);
      head.add(horn);
    } else if (v === 'ridge') { // branching antlers
      const beam = mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.5, 5), mat('#e8dcc4', { roughness: 0.5 }), s * 0.16, 0.32, -0.04);
      beam.rotation.z = -s * 0.45;
      head.add(beam);
      for (let k = 0; k < 3; k++) {
        const tine = mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.18, 4), mat('#e8dcc4', { roughness: 0.5 }), s * (0.14 + k * 0.06), 0.24 + k * 0.1, 0.03);
        tine.rotation.set(0.7, 0, -s * 0.1);
        head.add(tine);
      }
    } else if (v === 'ash') { // broad flat horns sweeping out sideways
      const horn = mesh(new THREE.BoxGeometry(0.34, 0.05, 0.1), mat('#d8ccb8', { roughness: 0.6 }), s * 0.26, 0.1, 0.0);
      horn.rotation.z = s * 0.3;
      head.add(horn);
    }
  }
  const tail = new THREE.Group();
  tail.position.set(0, hipY + 0.4, -0.7);
  tail.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.4, 4), mat(dark), 0, -0.2, 0));
  tail.add(mesh(new THREE.SphereGeometry(0.06, 5, 4), mat(dark), 0, -0.42, 0));
  tail.rotation.x = 0.3;
  body.add(tail);
  const legs = [];
  for (const [x, z] of [[-0.2, 0.42], [0.2, 0.42], [-0.2, -0.42], [0.2, -0.42]]) {
    const leg = new THREE.Group();
    leg.position.set(x, hipY + 0.08, z);
    leg.add(mesh(new THREE.CylinderGeometry(0.08, 0.06, legLen, 6), mat(hide), 0, -legLen / 2, 0));
    leg.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 6), mat('#2a2420'), 0, -legLen + 0.0, 0)); // hoof
    body.add(leg);
    legs.push(leg);
  }
  g.userData.animate = (t, moving, attacking, dead) => {
    if (dead) return fall(body, 0.35);
    body.rotation.z = 0;
    const gait = moving ? Math.sin(t * 9) : 0;
    legs[0].rotation.x = legs[3].rotation.x = gait * 0.5;
    legs[1].rotation.x = legs[2].rotation.x = -gait * 0.5;
    body.position.y = moving ? Math.abs(gait) * 0.05 : 0;
    // grazing: the neck dips to the ground for a few seconds, then looks up and chews
    const graze = Math.max(0, Math.sin(t * 0.45 + (c.scale || 1) * 9));
    neck.rotation.x = attacking ? 0.7 : moving ? 0.1 : graze * 1.1;
    head.rotation.x = attacking ? -0.4 : Math.sin(t * 6) * 0.03 * graze;
    tail.rotation.z = Math.sin(t * (moving ? 8 : 2.5)) * 0.35;
  };
  return finish(g, c, hipY + 0.95 + (v === 'ridge' ? 0.3 : 0));
}

// ---------------------------------------------------------------------
// Vorm: a burrowing ambusher. A ring of dirt with a segmented body that rises out of it, topped by
// a round mouth ringed with teeth. Mostly buried until something comes close.
// ---------------------------------------------------------------------
function vorm(c) {
  const [skin, dark, accent] = c.colors;
  const v = c.variant || 'scrub';
  const g = new THREE.Group();
  // the mound stays put; only the body rises and sways
  const mound = mesh(new THREE.SphereGeometry(0.75, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#5a4636', { roughness: 1 }), 0, -0.25, 0);
  mound.scale.set(1, 0.5, 1);
  g.add(mound);
  const hole = mesh(new THREE.CircleGeometry(0.38, 12), mat('#161210'), 0, 0.13, 0);
  hole.rotation.x = -Math.PI / 2;
  g.add(hole);
  for (let k = 0; k < 6; k++) { // clods of dirt around the rim
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const clod = mesh(new THREE.DodecahedronGeometry(0.11, 0), mat('#4a3a2c', { roughness: 1 }), Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.62);
    clod.rotation.set(k, k * 1.7, 0);
    g.add(clod);
  }
  const body = new THREE.Group(); // rises from below ground
  g.add(body);
  const segs = [];
  const N = 6;
  let parent = body;
  for (let k = 0; k < N; k++) {
    const r = 0.34 - k * 0.025;
    const seg = new THREE.Group();
    seg.position.y = k === 0 ? 0 : 0.3;
    const m = mesh(new THREE.SphereGeometry(r, 10, 8), mat(k % 2 ? skin : new THREE.Color(skin).lerp(new THREE.Color(dark), 0.35)));
    m.scale.set(1, 0.85, 1);
    seg.add(m);
    if (v === 'scrub') for (let b = 0; b < 6; b++) { // bristles
      const a = (b / 6) * Math.PI * 2 + k;
      const br = mesh(new THREE.ConeGeometry(0.025, 0.16, 3), mat(dark), Math.cos(a) * r, 0, Math.sin(a) * r);
      br.rotation.set(Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4);
      seg.add(br);
    }
    if (v === 'ridge') { // stone rings
      const ring = mesh(new THREE.TorusGeometry(r * 0.98, 0.05, 4, 10), mat('#8a8a80', { roughness: 0.95 }));
      ring.rotation.x = Math.PI / 2;
      seg.add(ring);
    }
    if (v === 'ash' && k % 2) { // ember bands
      const band = mesh(new THREE.TorusGeometry(r * 0.96, 0.02, 4, 12), glowMat(accent, 1.4));
      band.rotation.x = Math.PI / 2;
      seg.add(band);
    }
    parent.add(seg);
    segs.push(seg);
    parent = seg;
  }
  // head: a fat ring of lips around a round mouth, teeth pointing in
  const head = new THREE.Group();
  head.position.y = 0.32;
  parent.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(dark)));
  const mouth = mesh(new THREE.CircleGeometry(0.17, 12), v === 'ash' ? glowMat(accent, 1.6) : mat('#2a0e10'), 0, 0.02, 0.27);
  head.add(mouth);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const tooth = mesh(new THREE.ConeGeometry(0.025, 0.1, 4), mat('#ece4d0'), Math.cos(a) * 0.17, 0.02 + Math.sin(a) * 0.17, 0.27);
    tooth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.cos(a), -Math.sin(a), 0.5).normalize()); // pointing in
    head.add(tooth);
  }
  for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), glowMat(v === 'dusk' || v === 'ash' ? accent : '#ffe24a', 1.3), s * 0.15, 0.16, 0.18));
  let lure = null;
  if (v === 'dusk') { // a glowing lure on a stalk, bobbing over the mouth
    const stalk = mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.45, 4), mat(dark), 0, 0.42, 0.08);
    stalk.rotation.x = 0.5;
    lure = mesh(new THREE.SphereGeometry(0.06, 8, 6), glowMat(accent, 2), 0, 0.62, 0.22);
    head.add(stalk, lure);
  }
  let rise = 0.25;
  g.userData.animate = (t, moving, attacking, dead) => {
    // buried most of the way at rest; erupts to full height to attack
    const want = dead ? 0 : attacking ? 1 : moving ? 0.55 : 0.25;
    rise += (want - rise) * 0.08;
    body.position.y = -1.7 * (1 - rise) + 0.05;
    body.visible = rise > 0.03;
    const amp = attacking ? 0.22 : 0.08;
    segs.forEach((s, k) => { s.rotation.x = Math.sin(t * (attacking ? 5 : 1.6) - k * 0.7) * amp; s.rotation.z = Math.cos(t * 1.1 - k * 0.6) * amp * 0.6; });
    head.rotation.x = attacking ? -0.6 + Math.max(0, Math.sin(t * 7)) * 0.6 : -0.2;
    if (lure) lure.position.y = 0.62 + Math.sin(t * 2.4) * 0.04;
  };
  return finish(g, c, 1.95);
}

// ---------------------------------------------------------------------
// Dart Fly: a hand-sized pest that hovers at head height. Big eyes, four buzzing wings, and the
// long needle it's named for.
// ---------------------------------------------------------------------
function dartFly(c) {
  const [shell, dark, accent] = c.colors;
  const v = c.variant || 'scrub';
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.35;
  g.add(body);
  body.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), mat(shell))); // thorax
  const abdomen = mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(v === 'scrub' ? shell : dark), 0, -0.02, -0.2);
  abdomen.scale.set(0.9, 0.85, 1.9);
  body.add(abdomen);
  if (v === 'scrub') for (let k = 0; k < 3; k++) { // dark bands
    const band = mesh(new THREE.TorusGeometry(0.085 - Math.abs(k - 1) * 0.012, 0.016, 4, 10), mat(dark), 0, -0.02, -0.12 - k * 0.08);
    body.add(band);
  }
  if (v === 'dusk') body.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), glowMat(accent, 2.2), 0, -0.03, -0.38)); // lantern tail
  if (v === 'ash') {
    const sting = mesh(new THREE.ConeGeometry(0.025, 0.16, 4), glowMat(accent, 0.8), 0, -0.04, -0.44);
    sting.rotation.x = -Math.PI / 2;
    body.add(sting);
    for (let k = 0; k < 4; k++) { // spiked shell
      const sp = mesh(new THREE.ConeGeometry(0.02, 0.08, 4), mat('#1a0c0c'), 0, 0.09, 0.04 - k * 0.1);
      sp.rotation.x = -0.4;
      body.add(sp);
    }
  }
  if (v === 'ridge') for (const s of [-1, 1]) { // trailing streamers
    const st = mesh(new THREE.BoxGeometry(0.012, 0.004, 0.36), mat(accent), s * 0.04, -0.02, -0.5);
    body.add(st);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.02, 0.13);
  body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(dark)));
  for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), glowMat(v === 'dusk' ? accent : '#d83a2a', 0.5), s * 0.05, 0.02, 0.03));
  const needle = mesh(new THREE.ConeGeometry(0.012, 0.3, 4), mat('#2a2420'), 0, -0.02, 0.2);
  needle.rotation.x = Math.PI / 2;
  head.add(needle);
  const wingMat = new THREE.MeshStandardMaterial({ color: v === 'ridge' ? accent : '#e8f4ff', transparent: true, opacity: 0.45, side: THREE.DoubleSide, roughness: 0.2 });
  const wingLen = v === 'ridge' ? 0.42 : 0.28;
  const wings = [];
  for (const s of [-1, 1]) for (const [z, len] of [[0.03, wingLen], [-0.06, wingLen * 0.8]]) {
    const w = new THREE.Group();
    w.position.set(s * 0.06, 0.08, z);
    const blade = mesh(new THREE.PlaneGeometry(len, 0.09), wingMat, s * len / 2, 0, 0);
    blade.rotation.x = -Math.PI / 2;
    w.add(blade);
    w.userData.s = s;
    body.add(w);
    wings.push(w);
  }
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { // dangling legs
    const leg = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 3), mat(dark), s * 0.05, -0.12, 0.04 - k * 0.08);
    leg.rotation.z = s * 0.3;
    body.add(leg);
  }
  let fallY = 1.35;
  g.userData.animate = (t, moving, attacking, dead) => {
    if (dead) {
      fallY = Math.max(0.08, fallY - 0.06);
      body.position.y = fallY; body.rotation.z = Math.PI / 2; body.rotation.x = 0;
      wings.forEach((w) => { w.rotation.z = w.userData.s * 0.2; });
      return;
    }
    fallY = 1.35;
    body.rotation.z = Math.sin(t * 1.7) * 0.15;
    body.position.y = 1.35 + Math.sin(t * 3.1 + (c.scale || 1) * 20) * 0.08;
    // dive: pitch nose down and jab the needle
    const jab = attacking ? Math.max(0, Math.sin(t * 8)) : 0;
    body.rotation.x = attacking ? 0.35 + jab * 0.3 : moving ? 0.25 : 0;
    body.position.z = jab * 0.25;
    if (attacking) body.position.y -= 0.3 + jab * 0.2;
    const flap = Math.sin(t * 70);
    wings.forEach((w, i) => { w.rotation.z = w.userData.s * (0.15 + flap * 0.55 * (i % 2 ? -1 : 1)); });
  };
  return finish(g, c, 1.55);
}

// ---------------------------------------------------------------------
// Grondak: an armored brute that walks on its knuckles. Huge forearms, a small low head, plates
// down its back, and a soft glowing weak spot on its rump.
// ---------------------------------------------------------------------
function grondak(c) {
  const [hide, dark, accent] = c.colors;
  const v = c.variant || 'scrub';
  const plateCol = v === 'ash' ? '#1a1820' : v === 'ridge' ? '#8a929c' : dark;
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const torso = new THREE.Group(); // pitched forward like a gorilla
  torso.position.set(0, 1.0, 0);
  torso.rotation.x = 0.45;
  body.add(torso);
  const chest = mesh(new THREE.SphereGeometry(0.62, 10, 8), mat(hide));
  chest.scale.set(1.15, 0.95, 1.1);
  torso.add(chest);
  const belly = mesh(new THREE.SphereGeometry(0.42, 8, 6), mat(hide), 0, -0.25, -0.35);
  torso.add(belly);
  // back plates, big to small from the shoulders to the rump
  for (let k = 0; k < 5; k++) {
    const p = mesh(new THREE.BoxGeometry(0.95 - k * 0.1, 0.12, 0.3), mat(plateCol, { roughness: v === 'ash' ? 0.3 : 0.8, metalness: v === 'ash' ? 0.3 : 0 }), 0, 0.56 - k * 0.07, 0.3 - k * 0.24);
    p.rotation.x = -0.25 + k * 0.22;
    torso.add(p);
    if (v === 'ash' && k < 4) { // lava seams between the plates
      const seam = mesh(new THREE.BoxGeometry(0.8 - k * 0.1, 0.03, 0.05), glowMat(accent, 1.6), 0, 0.55 - k * 0.07, 0.16 - k * 0.24);
      seam.rotation.x = p.rotation.x;
      torso.add(seam);
    }
    if (v === 'scrub') for (let m = 0; m < 3; m++) { // moss and brush growing on the plates
      const tuft = mesh(new THREE.ConeGeometry(0.05, 0.16, 4), mat(m % 2 ? '#6a8a3a' : '#8aa04a'), (m - 1) * 0.22 + (k % 2) * 0.08, 0.66 - k * 0.07, 0.3 - k * 0.24);
      tuft.rotation.x = -0.3 + k * 0.2;
      torso.add(tuft);
    }
  }
  // the weak spot: a soft glowing patch where the plates stop
  const weak = mesh(new THREE.SphereGeometry(0.16, 8, 6), glowMat(accent, 1.1), 0, 0.12, -0.74);
  weak.scale.set(1.3, 1, 0.5);
  torso.add(weak);
  if (v === 'ridge') for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { // crystal spikes on the shoulders
    const cr = mesh(new THREE.OctahedronGeometry(0.12 - k * 0.025, 0), glowMat(accent, 0.6), s * (0.42 + k * 0.1), 0.5 - k * 0.05, 0.32 - k * 0.06);
    cr.scale.y = 2.2;
    cr.rotation.z = -s * (0.4 + k * 0.2);
    torso.add(cr);
  }
  // head sits low between the shoulders
  const head = new THREE.Group();
  head.position.set(0, 0.05, 0.66);
  torso.add(head);
  const skull = mesh(new THREE.BoxGeometry(0.34, 0.28, 0.3), mat(dark));
  head.add(skull);
  head.add(mesh(new THREE.BoxGeometry(0.4, 0.08, 0.1), mat(plateCol), 0, 0.14, 0.1)); // brow plate
  const jaw = mesh(new THREE.BoxGeometry(0.3, 0.1, 0.24), mat(dark), 0, -0.16, 0.04);
  head.add(jaw);
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), v === 'dusk' ? glowMat(accent, 1.8) : glowMat('#ffd23f', 0.8), s * 0.09, 0.05, 0.16));
    head.add(mesh(new THREE.ConeGeometry(0.025, 0.1, 4), mat('#e8e0cc'), s * 0.1, -0.08, 0.15)); // tusks
  }
  if (v === 'dusk') for (let k = 0; k < 3; k++) { // horn crest
    const horn = mesh(new THREE.ConeGeometry(0.05, 0.36 - k * 0.08, 5), mat('#d8cfe0', { roughness: 0.4 }), 0, 0.2 + k * 0.02, 0.0 - k * 0.12);
    horn.rotation.x = -0.6 - k * 0.2;
    head.add(horn);
  }
  // huge forearms down to the knuckles; short hind legs
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.62, 1.25, 0.38);
    const upper = mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.6, 7), mat(hide), 0, -0.3, 0);
    const fore = mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.55, 7), mat(hide), 0, -0.82, 0.05);
    const fist = mesh(new THREE.BoxGeometry(0.3, 0.22, 0.3), mat(dark), 0, -1.14, 0.07);
    const guard = mesh(new THREE.BoxGeometry(0.32, 0.1, 0.36), mat(plateCol), s * 0.04, -0.75, 0.1); // forearm plate
    guard.rotation.z = s * 0.15;
    arm.add(upper, fore, fist, guard);
    body.add(arm);
    arms.push(arm);
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.32, 0.62, -0.45);
    leg.add(mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.58, 7), mat(hide), 0, -0.3, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.26, 0.1, 0.32), mat(dark), 0, -0.6, 0.06));
    body.add(leg);
    legs.push(leg);
  }
  g.userData.animate = (t, moving, attacking, dead) => {
    if (dead) return fall(body, 0.5);
    body.rotation.z = 0;
    // knuckle walk: arms and legs swing in opposite pairs, the whole body rocks
    const gait = moving ? Math.sin(t * 5.5) : 0;
    arms[0].rotation.x = gait * 0.45; legs[1].rotation.x = gait * 0.4;
    arms[1].rotation.x = -gait * 0.45; legs[0].rotation.x = -gait * 0.4;
    body.rotation.y = gait * 0.06;
    body.position.y = moving ? Math.abs(gait) * 0.06 : Math.sin(t * 1.4) * 0.02;
    // slam: both arms rise overhead and come down together
    if (attacking) {
      const ph = (t * 1.2) % 1;
      const lift = ph < 0.7 ? ph / 0.7 : 1 - (ph - 0.7) / 0.3;
      arms[0].rotation.x = arms[1].rotation.x = -2.6 * lift;
      torso.rotation.x = 0.45 - lift * 0.35;
    } else torso.rotation.x = 0.45;
    head.rotation.x = Math.sin(t * 0.7) * 0.05;
    jaw.position.y = attacking ? -0.2 : -0.16;
    weak.material.emissiveIntensity = 0.9 + Math.sin(t * 3) * 0.3;
  };
  return finish(g, c, 2.05);
}

export const CREATURE_BUILDERS = { skarl, gallox, vorm, dart_fly: dartFly, grondak };
export function buildCreatureModel(c) { return (CREATURE_BUILDERS[c.family] || skarl)(c); }
