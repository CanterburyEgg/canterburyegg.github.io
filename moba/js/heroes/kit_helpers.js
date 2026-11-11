// Shared helpers for hero kits (js/heroes/*.js). Functions run at call time in the shared global scope of
// js/arena/*.js (hero, dummies, phase1Engine, damageDummy, heroBolts, scene, ...), so they're safe to define early.
(function () {
'use strict';

const K = (window.KitFx = {});

// Damage everything (dummies + engine units, no structures unless opts.structures) inside a circle.
// opts: dealPlayerDamageToUnit options (dmgType, slowDur, stunDur, knockbackDist, ...) + color; returns hit count.
K.hitArea = function (x, z, r, dmg, opts = {}) {
  let hits = 0;
  dummies.forEach((d) => {
    if (d.isShooter && !shooterEnabled) return;
    if (Math.hypot(d.x - x, d.z - z) <= r + d.r) {
      damageDummy(d, dmg, opts.color || '#fb7185');
      if (opts.stunDur) d.stunTimer = Math.max(d.stunTimer, opts.stunDur);
      if (opts.slowDur) d.slowTimer = Math.max(d.slowTimer || 0, opts.slowDur);
      if (opts.pullTo) K.knockDummy(d, opts.pullTo.x - d.x, opts.pullTo.z - d.z, Math.min(opts.pullDist || 3, Math.hypot(opts.pullTo.x - d.x, opts.pullTo.z - d.z) - 1.0));
      hits++;
    }
  });
  if (phase1Engine) {
    phase1Engine.getHostileTargets().forEach((t) => {
      if (t.kind === 'structure' && !opts.structures) return;
      if (Math.hypot(t.x - x, t.z - z) <= r + (t.r || 0.5)) {
        const o = Object.assign({}, opts);
        if (opts.pullTo) {
          o.knockbackDist = Math.max(0, Math.min(opts.pullDist || 3, Math.hypot(opts.pullTo.x - t.x, opts.pullTo.z - t.z) - 1.0));
          o.knockbackDirX = opts.pullTo.x - t.x;
          o.knockbackDirZ = opts.pullTo.z - t.z;
          delete o.pullTo;
        }
        if (phase1Engine.dealPlayerDamageToUnit(t, dmg, o)) hits++;
      }
    });
  }
  return hits;
};

// Damage inside a frontal cone from the hero (range, half-angle in radians)
K.hitCone = function (range, halfAngle, dmg, opts = {}) {
  const fx = Math.sin(hero.facing), fz = Math.cos(hero.facing);
  const inCone = (x, z, r) => {
    const dx = x - hero.x, dz = z - hero.z;
    const d = Math.hypot(dx, dz);
    if (d > range + r) return false;
    if (d < 0.6) return true;
    return (dx * fx + dz * fz) / d >= Math.cos(halfAngle);
  };
  let hits = 0;
  dummies.forEach((d) => {
    if (d.isShooter && !shooterEnabled) return;
    if (inCone(d.x, d.z, d.r)) {
      damageDummy(d, dmg, opts.color || '#fb7185');
      if (opts.slowDur) d.slowTimer = Math.max(d.slowTimer || 0, opts.slowDur);
      hits++;
    }
  });
  if (phase1Engine) {
    phase1Engine.getHostileTargets().forEach((t) => {
      if (t.kind === 'structure' && !opts.structures) return;
      if (inCone(t.x, t.z, t.r || 0.5) && phase1Engine.dealPlayerDamageToUnit(t, dmg, opts)) hits++;
    });
  }
  return hits;
};

// Short knockback/pull on a training dummy
K.knockDummy = function (d, dx, dz, dist) {
  const len = Math.hypot(dx, dz) || 1;
  if (dist <= 0) return;
  d.kbVx = (dx / len) * (dist / 0.24);
  d.kbVz = (dz / len) * (dist / 0.24);
  d.kbTimer = 0.24;
};

// Fire a straight projectile through the shared heroBolts loop (loop.js handles flight + hits)
// opts: { speed, life, pierce, dmgType ('physical'|'fantasy'), isBasic, slowDur, mesh, y, fromX, fromZ }
K.spawnBolt = function (angle, dmg, opts = {}) {
  const mesh = opts.mesh || new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: opts.color || 0xffffff }));
  const sx = opts.fromX !== undefined ? opts.fromX : hero.x + Math.sin(angle) * 0.7;
  const sz = opts.fromZ !== undefined ? opts.fromZ : hero.z + Math.cos(angle) * 0.7;
  mesh.position.set(sx, opts.y || 1.3, sz);
  mesh.rotation.y = angle;
  scene.add(mesh);
  const spd = opts.speed || 18;
  heroBolts.push({
    mesh, vx: Math.sin(angle) * spd, vz: Math.cos(angle) * spd, dmg,
    dmgType: opts.dmgType || 'physical', bleedAdd: 0, isHeartseeker: false, pierce: !!opts.pierce,
    hitIds: new Set(), life: opts.life || 0.6, isBasic: opts.isBasic !== false, slowDur: opts.slowDur || 0
  });
  return mesh;
};

// Find a bone on the current hero model by canonical Mixamo name (e.g. 'Spine2', 'RightHand')
K.bone = function (name) {
  return (typeof heroBones !== 'undefined' && heroBones[name]) || null;
};

// Parse a GLB prop embedded in a bundle (base64) into a scene node, scaled so its longest side = size
K.loadPropGlb = function (b64, size) {
  return new Promise((resolve) => {
    if (!b64) { resolve(null); return; }
    gltfLoader.parse(b64ToBuffer(b64), '', (g) => {
      const obj = g.scene;
      const box = new THREE.Box3().setFromObject(obj);
      const s = box.getSize(new THREE.Vector3());
      const k = size / Math.max(s.x, s.y, s.z);
      obj.scale.setScalar(k);
      const c = box.getCenter(new THREE.Vector3());
      obj.position.set(-c.x * k, -c.y * k, -c.z * k);
      obj.traverse((ch) => { if (ch.isMesh) { ch.castShadow = true; } });
      const holder = new THREE.Group();
      holder.add(obj);
      resolve(holder);
    }, () => resolve(null));
  });
};

// Place a world-space prop at a bone's world position with an offset in hero-facing space (right, up, forward)
// and an extra rotation (Euler, applied after facing the hero's direction).
let _bp = null; // created lazily (THREE loads after the kits)
K.placeAtBone = function (prop, boneName, off, rot) {
  const b = K.bone(boneName);
  if (!b || !prop) return false;
  if (!_bp) _bp = new THREE.Vector3();
  b.getWorldPosition(_bp);
  const yaw = heroPivot.rotation.y;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  prop.position.set(
    _bp.x + rx * off.x + fx * off.z,
    _bp.y + off.y,
    _bp.z + rz * off.x + fz * off.z
  );
  prop.rotation.set(rot.x, yaw + rot.y, rot.z, 'YXZ');
  return true;
};

// Lerp helper for code-driven arcs
K.arcY = (u, h) => Math.sin(Math.PI * u) * h;
})();
