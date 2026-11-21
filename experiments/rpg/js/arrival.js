// =====================================================================
// ARRIVAL: a short landing for new games. A lander drops onto the pad under thrust while the camera
// swoops down from high above; the drifter steps out and the lander lifts off again.
// Pure scene code: main.js owns the camera numbers and calls update(dt) each frame.
// =====================================================================
import * as THREE from 'three';

const DUR = { descend: 3.0, settle: 0.6, depart: 2.2 };

function buildLander() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: '#c9ccd2', roughness: 0.5, metalness: 0.3, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.7, flatShading: true });
  const accent = new THREE.MeshStandardMaterial({ color: '#ffcf4a', roughness: 0.5, flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 2.2, 8), hull);
  body.position.y = 2.1;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.3, 8), hull);
  nose.position.y = 3.85;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.48, 0.25, 8), accent);
  band.position.y = 1.55;
  const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.1), new THREE.MeshStandardMaterial({ color: '#1f2a3a', emissive: '#3fd0ff', emissiveIntensity: 0.7 }));
  window_.position.set(0, 2.7, 1.12);
  window_.rotation.x = -0.15;
  g.add(body, nose, band, window_);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 5), dark);
    leg.position.set(Math.sin(a) * 1.5, 0.75, Math.cos(a) * 1.5);
    leg.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.1, 6), dark);
    foot.position.set(Math.sin(a) * 1.75, 0.05, Math.cos(a) * 1.75);
    g.add(leg, foot);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.6, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  flame.rotation.x = Math.PI;
  flame.position.y = -0.3;
  flame.name = 'flame';
  const glow = new THREE.PointLight('#ffb35a', 0, 18);
  glow.position.y = -0.6;
  glow.name = 'glow';
  g.add(flame, glow);
  g.traverse((o) => { if (o.isMesh && o !== flame) o.castShadow = true; });
  return g;
}

// dust: a ring of puffs that spreads out on touchdown
function buildDust() {
  const n = 40, pos = new Float32Array(n * 3), dir = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; dir.push([Math.sin(a), Math.cos(a), 0.6 + Math.random() * 0.8]); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#d8ccb0', size: 0.9, transparent: true, opacity: 0, depthWrite: false }));
  pts.userData.dir = dir;
  pts.frustumCulled = false;
  return pts;
}

// at: { x, y, z } pad center. Returns { update(dt) -> phase info, skip(), done, dispose() }.
export function startArrival(scene, at) {
  const lander = buildLander();
  const dust = buildDust();
  scene.add(lander, dust);
  const flame = lander.getObjectByName('flame'), glow = lander.getObjectByName('glow');
  let t = 0, done = false, stepped = false;
  const total = DUR.descend + DUR.settle + DUR.depart;

  function place() {
    let y, thrust;
    if (t < DUR.descend) {
      const k = t / DUR.descend, e = 1 - (1 - k) ** 3; // fast, then braking
      y = at.y + 46 * (1 - e);
      thrust = 0.6 + 0.4 * k;
    } else if (t < DUR.descend + DUR.settle) {
      y = at.y; thrust = 1 - (t - DUR.descend) / DUR.settle;
    } else {
      const k = (t - DUR.descend - DUR.settle) / DUR.depart;
      y = at.y + 60 * k * k;
      thrust = k < 0.15 ? k / 0.15 : 1;
    }
    lander.position.set(at.x, y, at.z);
    lander.rotation.y = t * 0.15;
    flame.scale.set(1, 0.4 + thrust * (0.8 + Math.random() * 0.25), 1);
    flame.visible = thrust > 0.02;
    glow.intensity = thrust * 40;
    // dust spreads on touchdown and fades
    const dt = t - DUR.descend + 0.4;
    const p = dust.geometry.attributes.position;
    dust.material.opacity = dt > 0 && dt < 2.4 ? Math.max(0, 0.7 * (1 - dt / 2.4)) : 0;
    dust.userData.dir.forEach(([dx, dz, sp], i) => {
      const r = 1.6 + Math.max(0, dt) * 3.2 * sp;
      p.setXYZ(i, at.x + dx * r, at.y + 0.3 + Math.max(0, dt) * 0.35, at.z + dz * r);
    });
    p.needsUpdate = true;
  }
  place();

  return {
    get t() { return t; },
    get progress() { return Math.min(1, t / (DUR.descend + DUR.settle)); }, // 0..1 until the drifter steps out
    get stepped() { return stepped; },
    get done() { return done; },
    update(dt) {
      if (done) return;
      t += dt;
      if (!stepped && t >= DUR.descend + DUR.settle * 0.5) stepped = true;
      if (t >= total) { done = true; dispose(); return; }
      place();
    },
    skip() { t = total; stepped = true; done = true; dispose(); },
  };
  function dispose() {
    scene.remove(lander, dust);
    lander.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    dust.geometry.dispose(); dust.material.dispose();
  }
}
