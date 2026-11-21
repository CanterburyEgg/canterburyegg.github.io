// NPC models from primitives (placeholder until real rigged assets).
// Bodies: humanoid, blob_alien, robot_small. Model faces +z.
import * as THREE from 'three';
import { ALIEN_BUILDERS } from './alien_models.js';

const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true, ...extra });

function eyePair(parent, y, z, spread, r = 0.05) {
  for (const s of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 10, 8), mat('#f4f1ea'));
    white.position.set(s * spread, y, z);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat('#14161c'));
    pupil.position.set(s * spread, y, z + r * 1.1);
    parent.add(white, pupil);
  }
}

export function buildNpcModel(def) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const tint = def.tint || '#9a8a70';
  const accent = def.accent || '#ffcf4a';
  const skin = def.skin || '#e8c9a8';
  let headY = 1.55;
  let frontZ = 0.3;
  let neckY = 1.3;

  let idle = null;
  if (ALIEN_BUILDERS[def.body]) {
    const r = ALIEN_BUILDERS[def.body](body, { ...def, tint, accent, v: def.v || [0.5, 0.5, 0.5] });
    ({ headY, frontZ, neckY } = r);
    idle = r.idle;
  } else if (def.body === 'blob_alien') {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), mat(tint));
    blob.scale.set(1, 0.88, 1);
    blob.position.y = 0.5;
    body.add(blob);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.32, 3, 6), mat(new THREE.Color(tint).offsetHSL(0, 0, -0.08)));
      arm.position.set(Math.sin(a) * 0.52, 0.42 + (k % 2) * 0.12, Math.cos(a) * 0.52);
      arm.rotation.z = -Math.sin(a) * 0.9;
      arm.rotation.x = Math.cos(a) * 0.9;
      arm.name = 'arm';
      body.add(arm);
    }
    for (const s of [-1, 1]) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.38, 6), mat(tint));
      stalk.position.set(s * 0.17, 1.05, 0.12);
      stalk.rotation.z = -s * 0.25;
      body.add(stalk);
    }
    eyePair(body, 1.27, 0.2, 0.22, 0.055);
    headY = 1.1; frontZ = 0.5; neckY = 0.9;
  } else if (def.body === 'robot_small') {
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.56), mat(tint, { metalness: 0.5, roughness: 0.4 }));
    chassis.position.y = 0.42;
    body.add(chassis);
    for (const s of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 12), mat('#2a2d34'));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(s * 0.38, 0.17, 0);
      body.add(wheel);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(accent, { metalness: 0.3 }));
    dome.position.y = 0.63;
    body.add(dome);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.05), new THREE.MeshStandardMaterial({ color: '#1a2230', emissive: '#3fd0ff', emissiveIntensity: 1.2 }));
    visor.position.set(0, 0.72, 0.22);
    visor.name = 'visor';
    body.add(visor);
    headY = 0.75; frontZ = 0.3; neckY = 0.62;
  } else {
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.7, 4, 10), mat(tint));
    torso.position.y = 0.82;
    body.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), mat(skin));
    head.position.y = 1.56;
    body.add(head);
    eyePair(body, 1.6, 0.2, 0.09, 0.035);
    headY = 1.58; frontZ = 0.31; neckY = 1.3;
  }

  for (const acc of def.accessories || []) {
    if (acc === 'floral_apron' || acc === 'apron') {
      const apron = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.04), mat(accent));
      apron.position.set(0, neckY - 0.45, frontZ + 0.02);
      body.add(apron);
      if (acc === 'floral_apron') {
        ['#ffffff', '#ffe680', '#ff9ab8'].forEach((c, i) => {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), mat(c));
          dot.position.set(-0.15 + i * 0.15, neckY - 0.42 + (i % 2) * 0.1, frontZ + 0.05);
          body.add(dot);
        });
      }
    } else if (acc === 'reading_goggles') {
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.015, 6, 14), mat('#c9a24a', { metalness: 0.6 }));
        ring.position.set(s * (def.body === 'blob_alien' ? 0.22 : 0.09), def.body === 'blob_alien' ? 1.27 : 1.6, (def.body === 'blob_alien' ? 0.2 : 0.2) + 0.08);
        body.add(ring);
      }
    } else if (acc === 'mop_attachment') {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6), mat('#8a6a4a'));
      stick.position.set(0.42, 0.45, 0.25);
      stick.rotation.x = 0.5;
      const mop = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.14, 8), mat('#e9e2cf'));
      mop.position.set(0.42, 0.08, 0.45);
      body.add(stick, mop);
    } else if (acc === 'tiny_bowtie') {
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), mat('#d83a4a'));
        wing.rotation.z = s * Math.PI / 2;
        wing.position.set(s * 0.06, 0.6, 0.29);
        body.add(wing);
      }
    } else if (acc === 'cap') {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.12, 12), mat(accent));
      cap.position.y = headY + 0.2;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.18), mat(accent));
      brim.position.set(0, headY + 0.15, 0.25);
      body.add(cap, brim);
    } else if (acc === 'clipboard') {
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.03), mat('#a07a4a'));
      board.position.set(0.22, 0.95, frontZ + 0.08);
      board.rotation.x = -0.4;
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.01), mat('#f4f1ea'));
      paper.position.copy(board.position).add(new THREE.Vector3(0, 0.01, 0.02));
      paper.rotation.x = -0.4;
      body.add(board, paper);
    } else if (acc === 'scarf') {
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 14), mat(accent));
      scarf.rotation.x = Math.PI / 2;
      scarf.position.y = neckY;
      body.add(scarf);
    } else if (acc === 'antenna') {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 5), mat('#cfd4dc'));
      rod.position.y = headY + 0.3;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.8 }));
      ball.position.y = headY + 0.47;
      body.add(rod, ball);
    }
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  const sc = def.scale || 1;
  root.scale.setScalar(sc);
  root.userData.body = body;
  root.userData.idle = idle; // species idle motion (body, t, moving), replaces the generic bob
  root.userData.headY = headY * sc;
  root.userData.height = (headY + 0.4) * sc;
  return root;
}
