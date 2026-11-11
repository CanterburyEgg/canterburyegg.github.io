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

// Rotate a bone about a WORLD-space axis through its pivot, on top of whatever the mixer posed (call after the mixer).
// Uses the parent's last world matrix, so call currentModel.updateMatrixWorld(true) once per frame before a batch.
let _sw = null;
K.swingBone = function (name, axisW, angle) {
  const b = K.bone(name);
  if (!b || !b.parent) return;
  if (!_sw) _sw = { pq: new THREE.Quaternion(), d: new THREE.Quaternion(), a: new THREE.Vector3() };
  // If the mixer didn't write this bone since our last swing (no active clip drives it this frame), undo last frame's
  // swing first - otherwise the offsets pile up frame after frame and the limb pinwheels.
  const u = b.userData;
  if (u._swPost && b.quaternion.equals(u._swPost)) b.quaternion.copy(u._swBase);
  if (!u._swBase) { u._swBase = new THREE.Quaternion(); u._swPost = new THREE.Quaternion(); }
  u._swBase.copy(b.quaternion);
  if (angle) {
    b.parent.getWorldQuaternion(_sw.pq);
    // local delta = inv(parentWorld) * R(axisW) * parentWorld  ->  rotate the axis into the parent's frame instead
    _sw.a.copy(axisW).applyQuaternion(_sw.pq.invert()).normalize();
    b.quaternion.premultiply(_sw.d.setFromAxisAngle(_sw.a, angle));
  }
  u._swPost.copy(b.quaternion);
};

// ---- Hand grips ----
// Clips have no finger tracks, so hands stay in the open bind pose. curlHand() bends the finger bones toward the
// palm procedurally (call every frame AFTER the mixer; amt 0 = open bind pose, 1 = a full grip).
const CURL = { 1: 1.25, 2: 1.5, 3: 0.95 };          // per-joint bend at amt=1 (radians)
const THUMB_CURL = { 1: 0.25, 2: 0.55, 3: 0.45 };
let _curlCache = { model: null, sides: {} };
function handSetup(side) {
  const P = side + 'Hand';
  const hand = K.bone(P);
  const mid1 = K.bone(P + 'Middle1'), idx1 = K.bone(P + 'Index1'), pky1 = K.bone(P + 'Pinky1');
  if (!hand || !mid1 || !idx1 || !pky1) return null;
  hand.updateWorldMatrix(true, true);
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  const handP = wp(hand);
  const f = wp(mid1).sub(handP).normalize();                       // finger direction
  const s = wp(idx1).sub(wp(pky1)).normalize();                     // pinky -> index
  // palm normal: right hand = s x f, left hand = f x s (Mixamo bind: palms down, thumbs forward)
  const n = side === 'Right' ? new THREE.Vector3().crossVectors(s, f) : new THREE.Vector3().crossVectors(f, s);
  n.normalize();
  const joints = [];
  ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'].forEach((fing) => {
    for (let k = 1; k <= 3; k++) {
      const b = K.bone(P + fing + k);
      if (!b) continue;
      const next = K.bone(P + fing + (k + 1));
      const d = next ? wp(next).sub(wp(b)) : f.clone();
      if (d.lengthSq() < 1e-10) d.copy(f);
      const axisW = new THREE.Vector3().crossVectors(d.normalize(), n).normalize(); // rotating d about d x n moves it toward n
      const qw = b.getWorldQuaternion(new THREE.Quaternion());
      const axisL = axisW.applyQuaternion(qw.invert());
      joints.push({ b, bind: b.quaternion.clone(), axis: axisL, max: (fing === 'Thumb' ? THUMB_CURL : CURL)[k] });
    }
  });
  return { hand, joints, f, s, n, amt: 0, q0inv: hand.getWorldQuaternion(new THREE.Quaternion()).invert() };
}
const _q = { a: null };
K.curlHand = function (side, amt) {
  if (_curlCache.model !== currentModel) _curlCache = { model: currentModel, sides: {} };
  let h = _curlCache.sides[side];
  if (h === undefined) h = _curlCache.sides[side] = handSetup(side);
  if (!h) return null;
  if (amt <= 0 && h.amt <= 0) return h;
  if (!_q.a) _q.a = new THREE.Quaternion();
  h.joints.forEach((j) => {
    j.b.quaternion.copy(j.bind);
    if (amt > 0) j.b.quaternion.multiply(_q.a.setFromAxisAngle(j.axis, j.max * amt));
  });
  h.amt = amt;
  h.hand.updateWorldMatrix(true, true);
  return h;
};

// Seat a world-space prop in a curled hand: the prop's grip point (its holder origin) goes to the middle of the fist,
// and its local +X runs along the fist from the index side to the pinky side (so a wrench whose handle end is +X sticks
// its head out past the thumb). twist rotates it about that axis; off = {f, s, n} nudges along finger/side/palm dirs.
let _g = null;
K.seatInFist = function (prop, side, off, twist) {
  const h = _curlCache.model === currentModel && _curlCache.sides[side];
  if (!h || !prop) return false;
  if (!_g) _g = { qh: new THREE.Quaternion(), f: new THREE.Vector3(), s: new THREE.Vector3(), n: new THREE.Vector3(), p: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), t: new THREE.Quaternion(), x: new THREE.Vector3(1, 0, 0) };
  const P = side + 'Hand';
  // current hand frame = bind-time directions carried by the hand's rotation since setup
  h.hand.getWorldQuaternion(_g.qh);
  _g.q.copy(_g.qh).multiply(h.q0inv);
  _g.f.copy(h.f).applyQuaternion(_g.q);
  _g.s.copy(h.s).applyQuaternion(_g.q);
  _g.n.copy(h.n).applyQuaternion(_g.q);
  // fist center: between the middle knuckle and its curled middle phalanx, a touch toward the palm
  const m1 = K.bone(P + 'Middle1'), m2 = K.bone(P + 'Middle2');
  m1.getWorldPosition(_g.p);
  const a = _g.p.clone();
  if (m2) { m2.getWorldPosition(_g.p); a.add(_g.p).multiplyScalar(0.5); }
  a.addScaledVector(_g.f, off.f || 0).addScaledVector(_g.s, off.s || 0).addScaledVector(_g.n, off.n || 0);
  prop.position.copy(a);
  // basis: X = -s (index -> pinky), Y = n (palm normal), Z = X x Y
  const X = _g.s.clone().negate();
  const Y = _g.n.clone().addScaledVector(X, -_g.n.dot(X)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  _g.m.makeBasis(X, Y, Z);
  prop.quaternion.setFromRotationMatrix(_g.m);
  if (twist) prop.quaternion.multiply(_g.t.setFromAxisAngle(_g.x, twist));
  return true;
};
})();
