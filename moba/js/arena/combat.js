// MOBA 3D arena: Training dummies, player hero state, VFX helpers, phase1 engine boot, projectiles, attacks, castKey and keyboard input.
// Classic script (not a module) so the game still works from file://. Loaded in order by arena3d.html;
// top-level let/const/function names are shared across all js/arena/*.js files.
'use strict';

// =========================================================
// 3D TARGET DUMMIES & SHOOTER BOT (WITH 3D BLEED ORBS!)
// =========================================================
const dummies = [];
function createPlateEl(isEnemy, withMana = false) {
  const root = document.createElement('div');
  root.className = 'plate-3d';
  root.innerHTML =
    '<div class="plate-tag"></div>' +
    '<div class="plate-bar"><div class="plate-hp ' + (isEnemy ? 'enemy' : '') + '"></div><div class="plate-sh"></div></div>' +
    (withMana ? '<div class="plate-mp-wrap"><div class="plate-mp"></div></div>' : '');
  labelLayer.appendChild(root);
  return root;
}

const heroPlate = createPlateEl(false, true);
heroPlate.style.zIndex = '20';

function spawnDummy(name, x, z, isShooter = false) {
  const grp = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: isShooter ? 0x9f1239 : 0x78350f,
    roughness: 0.7
  });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.0, 8), trunkMat);
  post.position.y = 1.0;
  post.castShadow = true;
  grp.add(post);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.42, 1.15, 12), bodyMat);
  torso.position.y = 1.35;
  torso.castShadow = true;
  grp.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd6c7b2 }));
  head.position.y = 2.18;
  head.castShadow = true;
  grp.add(head);

  // 4 Orbiting Crimson Bleed Crystals above each Dummy's head!
  const bleedRingGrp = new THREE.Group();
  bleedRingGrp.position.y = 2.62;
  grp.add(bleedRingGrp);
  const bleedPips = [];
  const pipGeo = new THREE.OctahedronGeometry(0.11, 0);
  const pipMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
  for (let k = 0; k < 4; k++) {
    const pip = new THREE.Mesh(pipGeo, pipMat);
    const a = (k / 4) * Math.PI * 2;
    pip.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
    pip.visible = false;
    bleedRingGrp.add(pip);
    bleedPips.push(pip);
  }

  // 3D Physical Slow Ring + 4 Orbiting Frost Shards around Dummy's base!
  const slowFxGrp = new THREE.Group();
  const slowRing = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.84, 28),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  slowRing.rotation.x = -Math.PI / 2;
  slowRing.position.y = 0.06;
  slowFxGrp.add(slowRing);
  const slowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 24),
    new THREE.MeshBasicMaterial({ color: 0x0284c7, side: THREE.DoubleSide, transparent: true, opacity: 0.28, depthWrite: false })
  );
  slowDisc.rotation.x = -Math.PI / 2;
  slowDisc.position.y = 0.05;
  slowFxGrp.add(slowDisc);
  const shardGeo = new THREE.OctahedronGeometry(0.12, 0);
  const shardMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
  for (let k = 0; k < 4; k++) {
    const sh = new THREE.Mesh(shardGeo, shardMat);
    const a = (k / 4) * Math.PI * 2;
    sh.position.set(Math.cos(a) * 0.72, 0.22, Math.sin(a) * 0.72);
    slowFxGrp.add(sh);
  }
  slowFxGrp.visible = false;
  grp.add(slowFxGrp);

  const chilledMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.35,
    roughness: 0.45
  });

  grp.position.set(x, 0, z);
  scene.add(grp);

  const d = {
    id: dummies.length + 1,
    name, x, z, homeX: x, homeZ: z, r: 0.55,
    hp: 1800, maxHp: 1800,
    stunTimer: 0,
    slowTimer: 0,
    kbVx: 0, kbVz: 0, kbTimer: 0, kbWallStun: false, resetDelay: 0,
    siphoned: 0, siphonTimer: 0,
    bleedStacks: 0, bleedTimer: 0, bleedTickTimer: 0,
    bleedRingGrp, bleedPips,
    slowFxGrp,
    isShooter, shootCd: 1.2,
    wasInsideArena: false,
    hitFlash: 0,
    mesh: grp,
    torso,
    origMat: bodyMat,
    chilledMat,
    plate: createPlateEl(true)
  };
  dummies.push(d);
}

// Order Base Training Alcove Dummies (North of Allied Fountain so Central Boss Pit at (0,0) is clear!)
spawnDummy('Pit Target', -50.2, -13.2, false);
spawnDummy('Heavy Bag #1', -48.0, -14.4, false);
spawnDummy('Heavy Bag #2', -45.8, -13.2, false);
spawnDummy('Arcane Shooter', -53.2, -9.5, true);

// =========================================================
// 3D HERO GAMEPLAY STATE & VFX
// =========================================================
const hero = {
  x: -55, z: 12, r: 0.52,
  facing: 0,
  hp: 1350, maxHp: 1350,
  mp: 310, maxMp: 310,
  shield: 0, shieldTimer: 0,
  rShieldTimer: 0,
  peakPhysiqueTimer: 0,
  atkTimer: 0, cdQ: 0, cdE: 0, cdR: 0,
  qArmed: false,
  eRecast: 0,
  dashTimer: 0, dashVx: 0, dashVz: 0, dashKind: null, dashHit: false,
  punchAnim: 0, kickAnim: 0, grenadeAnim: 0, walkPhase: 0,
  rChargeTimer: 0,
  siphonBonus: 0,
  basicCombo: 0,
  comboResetTimer: 0,
  qTempoStacks: 0, qTempoTimer: 0,
  eSpeedBuffTimer: 0,
  leapTimer: 0, leapDur: 0.38, leapSx: 0, leapSz: 0, leapTx: 0, leapTz: 0
};

let wtfMode = false; // Default to live MOBA cooldowns in 4v4 match (toggleable anytime via 0 CD button!)
let shooterEnabled = false;
let arena = null;
const projectiles = []; // Enemy shooter projectiles
const heroBolts = [];   // Coyote 3D crossbow bolts, piercing R bolt, & Sorceress Astral Spark bolts
const heroGrenades = []; // Coyote arcing 3D shrapnel grenades
const sorcPillars = [];  // Sorceress 3D Starfall Pillars (Q & E 3-pillar cascade)
let sorcMonolith = null; // Sorceress R Cataclysm Monolith expanding 5s zone
const vfxRings = [];
const floatTexts = [];

function spawnFloat(x, y, z, txt, col) {
  const el = document.createElement('div');
  el.className = 'float-dmg';
  el.style.color = col;
  el.textContent = txt;
  labelLayer.appendChild(el);
  floatTexts.push({ x, y, z, life: 0.85, el });
}

function spawnShockRing(x, z, color, startR, endR, dur = 0.32) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1.0, 36),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.08, z);
  m.scale.setScalar(startR);
  scene.add(m);
  vfxRings.push({ mesh: m, startR, endR, t: 0, dur });
}

// Raycast mouse onto y=0 ground plane
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const mouseNDC = new THREE.Vector2();
const aimWorld = new THREE.Vector3(2, 0, 0);
let mouseDown = false;
const keys = {};

// Boot Phase 1 4v4 MOBA Engine (Map, Lanes, Towers, Barracks, Minions, Jungle + Boss, LOS Fog, 7 Bots, Shop & Talents!)
if (window.MOBA_PHASE1_ENGINE) {
  phase1Engine = window.MOBA_PHASE1_ENGINE.createEngine({
    THREE,
    SkeletonUtils,
    scene,
    camera,
    labelLayer,
    hero,
    aimWorld,
    getActiveHeroId: () => activeHeroId,
    getTemplates: () => heroTemplates,
    prepareClipForModel,
    spawnFloat,
    spawnShockRing,
    SFX,
    isWtfMode: () => wtfMode,
    isPlayerMoving: () => isMovingNow,
    getArena: () => arena
  });
}

// Boot Coyote Crossbowman by default!
switchHero('coyote');
document.getElementById('btn-wtf-3d').classList.toggle('toggled', wtfMode);

function applyBleedStacks(d, count) {
  d.bleedStacks = Math.min(4, d.bleedStacks + count);
  d.bleedTimer = 5.5;
  if (d.bleedTickTimer <= 0) d.bleedTickTimer = 0.6;
  for (let k = 0; k < 4; k++) {
    d.bleedPips[k].visible = k < d.bleedStacks;
  }
}

function buildArena3D(x, z) {
  if (arena) scene.remove(arena.group);
  const group = new THREE.Group();
  const radius = 4.6;
  const talents = phase1Engine ? phase1Engine.getPlayerProg().talents : {};

  // Glowing Force-Wall Cylinder (blocks projectiles in & out!)
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 2.2, 48, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  wall.position.y = 1.1;
  group.add(wall);

  // Floor Rim Ring
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.14, radius + 0.08, 56),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide })
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.04;
  group.add(rim);

  // 12 Coliseum Iron & Brass Posts around the perimeter
  const postGeo = new THREE.CylinderGeometry(0.16, 0.22, 2.35, 7);
  const orbGeo = new THREE.OctahedronGeometry(0.24, 0);
  const orbMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const px = Math.cos(a) * radius;
    const pz = Math.sin(a) * radius;
    const post = new THREE.Mesh(postGeo, wallMat);
    post.position.set(px, 1.17, pz);
    post.castShadow = true;
    group.add(post);

    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.set(px, 2.5, pz);
    group.add(orb);
  }

  group.position.set(x, 0, z);
  scene.add(group);

  dummies.forEach((d) => {
    d.wasInsideArena = Math.hypot(d.x - x, d.z - z) <= radius;
  });
  hero.wasInsideArena = true;
  const pLvl = phase1Engine ? (phase1Engine.getPlayerProg().level || 4) : 4;
  const rUlt = pLvl >= 12 ? 2 : (pLvl >= 8 ? 1 : 0);
  const baseArenaAmp = [1.20, 1.25, 1.30][rUlt] + (talents[10] === 'L' ? 0.10 : 0);
  const arenaDur = talents[10] === 'L' ? 7.0 : 5.5;
  arena = { x, z, r: radius, life: arenaDur, group, wall, amp: baseArenaAmp };
  if (phase1Engine && phase1Engine.onArenaSpawned) {
    phase1Engine.onArenaSpawned(arena);
  }
  // Brawler 10R Talent (Gladiator's Rush): Casting R immediately resets E cooldown!
  if (talents[10] === 'R') {
    hero.cdE = 0;
  }
  SFX.play('arena');
  spawnShockRing(x, z, 0xf43f5e, 0.8, radius, 0.35);
  spawnFloat(x, 2.8, z, 'WELCOME TO THE PIT!', '#fb7185');
}

function damageDummy(d, raw, customColor = '#fb7185') {
  let dmg = raw;
  if (arena && Math.hypot(d.x - arena.x, d.z - arena.z) <= arena.r) dmg *= (arena.amp || 1.25);
  dmg = Math.round(dmg);
  if (window.__MOBA_TEST && window.__MOBA_TEST.onDummyDamage) window.__MOBA_TEST.onDummyDamage(d, dmg);
  d.hp -= dmg;
  if (d.hp <= 0) {
    d.hp = d.maxHp;
    d.bleedStacks = 0;
    d.bleedTimer = 0;
    for (let k = 0; k < 4; k++) d.bleedPips[k].visible = false;
    spawnFloat(d.x, 2.6, d.z, 'KO! RESET', '#fde047');
  } else {
    spawnFloat(d.x, 2.2, d.z, String(dmg), customColor);
  }
  d.hitFlash = 0.09;
}

window.addEventListener('mousemove', (e) => {
  mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
});
renderer.domElement.addEventListener('mousedown', (e) => {
  SFX.unlock();
  if (e.button === 0) mouseDown = true;
});
window.addEventListener('mouseup', () => { mouseDown = false; });
window.addEventListener('wheel', (e) => {
  camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.014, 5.2, 35);
  document.getElementById('btn-cam-moba').classList.toggle('toggled', camDist > 13);
  document.getElementById('btn-cam-close').classList.toggle('toggled', camDist <= 13);
}, { passive: true });

let pendingStrike = null;
let pendingGrenadeThrow = null;
let pendingSorcBolt = null;
let pendingSorcUlt = null;

function trySpendMana(slot) {
  if (wtfMode) return true;
  const specs = window.MOBA_PHASE1 && window.MOBA_PHASE1.HERO_SPECS[activeHeroId];
  const cost = (specs && specs.mpCosts && specs.mpCosts[slot]) || 0;
  if ((hero.mp || 0) < cost) {
    SFX.play('block');
    spawnFloat(hero.x, 2.6, hero.z, 'NOT ENOUGH MANA (' + cost + ' MP)!', '#38bdf8');
    return false;
  }
  hero.mp = Math.max(0, (hero.mp || 0) - cost);
  return true;
}

// Spawn a 3D glowing Crossbow Bolt (or R Heartseeker Piercing Bolt!)
function spawnCrossbowBolt(angle, dmg, bleedAdd, isPiercingHeartseeker = false, forcePierce = false) {
  const boltGrp = new THREE.Group();
  const len = isPiercingHeartseeker ? 1.55 : 0.85;
  const rad = isPiercingHeartseeker ? 0.075 : 0.038;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(rad * 0.65, rad, len, 8),
    new THREE.MeshBasicMaterial({ color: isPiercingHeartseeker ? 0xfde047 : 0xf43f5e })
  );
  shaft.rotation.x = Math.PI / 2;
  boltGrp.add(shaft);

  // Glowing crimson arrowhead
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(rad * 1.9, len * 0.35, 8),
    new THREE.MeshBasicMaterial({ color: isPiercingHeartseeker ? 0xf43f5e : 0xfbbf24 })
  );
  tip.rotation.x = Math.PI / 2;
  tip.position.z = len * 0.55;
  boltGrp.add(tip);

  const startX = hero.x + Math.sin(angle) * 0.72;
  const startZ = hero.z + Math.cos(angle) * 0.72;
  boltGrp.position.set(startX, 1.18, startZ);
  boltGrp.rotation.y = angle;
  scene.add(boltGrp);

  const spd = isPiercingHeartseeker ? 28.0 : 21.0;
  heroBolts.push({
    mesh: boltGrp,
    vx: Math.sin(angle) * spd,
    vz: Math.cos(angle) * spd,
    dmg,
    dmgType: 'physical',
    bleedAdd,
    isHeartseeker: isPiercingHeartseeker,
    pierce: isPiercingHeartseeker || forcePierce,
    hitIds: new Set(),
    life: isPiercingHeartseeker ? 0.68 : 0.55
  });
}

// Spawn Sorceress LMB Astral Spark Bolt (Fantasy Damage!)
function spawnAstralBolt(angle, dmg) {
  const boltGrp = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.16, 0),
    new THREE.MeshBasicMaterial({ color: 0xe879f9 })
  );
  boltGrp.add(core);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.025, 8, 20),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  ring.rotation.x = Math.PI / 2;
  boltGrp.add(ring);

  const fwdX = Math.sin(angle);
  const fwdZ = Math.cos(angle);
  // Right-hand offset (her casting hand in Standing 1H Magic Attack 01!)
  const rightPerpX = -Math.cos(angle) * 0.22;
  const rightPerpZ = Math.sin(angle) * 0.22;
  let startX = hero.x + fwdX * 0.78 + rightPerpX;
  let startY = 1.44;
  let startZ = hero.z + fwdZ * 0.78 + rightPerpZ;
  if (currentModel && rightHandBone) {
    heroPivot.updateMatrixWorld(true);
    rightHandBone.getWorldPosition(rhWorld);
    startX = rhWorld.x + fwdX * 0.28;
    startY = THREE.MathUtils.clamp(rhWorld.y, 1.32, 1.60);
    startZ = rhWorld.z + fwdZ * 0.28;
  }
  boltGrp.position.set(startX, startY, startZ);
  boltGrp.rotation.y = angle;
  scene.add(boltGrp);

  const spd = 19.5;
  heroBolts.push({
    mesh: boltGrp,
    vx: Math.sin(angle) * spd,
    vz: Math.cos(angle) * spd,
    dmg,
    dmgType: 'fantasy',
    bleedAdd: 0,
    isHeartseeker: false,
    pierce: false,
    hitIds: new Set(),
    life: 0.54
  });
}

// Spawn Sorceress 3D Starfall Pillar (used by Q and E 3-Pillar Cascade)
function spawnStarfallPillar(tx, tz, radius, delay, dmg, isFromQ, slowDur = 0) {
  const grp = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.09, radius, 40),
    new THREE.MeshBasicMaterial({ color: isFromQ ? 0xe879f9 : 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  grp.add(ring);

  const innerFill = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.96, 36),
    new THREE.MeshBasicMaterial({ color: 0xa855f7, side: THREE.DoubleSide, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  innerFill.rotation.x = -Math.PI / 2;
  innerFill.position.y = 0.03;
  grp.add(innerFill);

  const crystal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, radius * 0.52, 3.1, 6),
    new THREE.MeshBasicMaterial({ color: isFromQ ? 0xf472b6 : 0x38bdf8, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending })
  );
  crystal.position.y = 1.55;
  crystal.scale.set(0.1, 0.01, 0.1);
  crystal.visible = false;
  grp.add(crystal);

  grp.position.set(tx, 0, tz);
  scene.add(grp);

  sorcPillars.push({
    grp, crystal, innerFill,
    x: tx, z: tz, r: radius,
    delay,
    erupted: false,
    postLife: 0.28,
    dmg,
    isFromQ,
    slowDur
  });
}

// Spawn Sorceress R (Cataclysm Monolith): 5.0s expanding arcane field (2.0m -> 4.5m)
function spawnCataclysmMonolith(tx, tz) {
  if (sorcMonolith) scene.remove(sorcMonolith.grp);
  const grp = new THREE.Group();

  const obelisk = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.68, 0),
    new THREE.MeshStandardMaterial({ color: 0x3b0764, emissive: 0xd946ef, emissiveIntensity: 0.75, roughness: 0.25, metalness: 0.8 })
  );
  obelisk.scale.set(0.85, 2.4, 0.85);
  obelisk.position.y = 1.85;
  grp.add(obelisk);

  const zoneRing = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1.0, 48),
    new THREE.MeshBasicMaterial({ color: 0xe879f9, side: THREE.DoubleSide, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending })
  );
  zoneRing.rotation.x = -Math.PI / 2;
  zoneRing.position.y = 0.05;
  zoneRing.scale.setScalar(2.0);
  grp.add(zoneRing);

  const zoneDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.0, 48),
    new THREE.MeshBasicMaterial({ color: 0x7e22ce, side: THREE.DoubleSide, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  zoneDisc.rotation.x = -Math.PI / 2;
  zoneDisc.position.y = 0.03;
  zoneDisc.scale.setScalar(2.0);
  grp.add(zoneDisc);

  grp.position.set(tx, 0, tz);
  scene.add(grp);

  SFX.play('arena');
  spawnShockRing(tx, tz, 0xe879f9, 0.5, 2.4, 0.35);
  spawnFloat(tx, 2.9, tz, 'CATACLYSM MONOLITH!', '#e879f9');

  sorcMonolith = {
    grp, obelisk, zoneRing, zoneDisc,
    x: tx, z: tz,
    startR: 2.0, maxR: 4.5, curR: 2.0,
    t: 0, dur: 5.0,
    tickTimer: 0.1,
    collapsed: false
  };
}

function fireHeartseekerRelease() {
  hero.rChargeTimer = 0;
  laserSightMesh.visible = false;
  muzzleOrb.visible = false;
  hero.punchAnim = 0.24;
  if (actions.punch) {
    fadeToAction(actions.punch, 0.04, true, 1.0);
  }
  SFX.play('arena');
  spawnShockRing(hero.x + Math.sin(hero.facing) * 0.8, hero.z + Math.cos(hero.facing) * 0.8, 0xf43f5e, 0.2, 1.6, 0.26);
  const st = phase1Engine ? phase1Engine.getPlayerStats() : { atk: 52 };
  spawnCrossbowBolt(hero.facing, Math.round(130 + st.atk * 0.85), 1, true, true);
}

function fireStrikeImpact(strike) {
  SFX.play(strike.isBite ? 'arena' : 'punch');
  const st = phase1Engine ? phase1Engine.getPlayerStats() : { atk: 62 };
  const pProg = phase1Engine ? phase1Engine.getPlayerProg() : { level: 1, talents: {} };
  const talents = pProg.talents || {};

  const kitImpact = heroKit();
  if (kitImpact && kitImpact.onStrikeImpact) {
    kitImpact.onStrikeImpact(strike, { st, pProg, talents });
    return;
  }

  // Shirtless Bodyguard Melee Impact (Basic Knuckles OR Q Bouncer Haymaker Knockback!)
  if (activeHeroId === 'bodyguard') {
    const reach = strike.isHaymaker ? 1.45 : 1.18;
    const fx = hero.x + Math.sin(strike.facing) * reach;
    const fz = hero.z + Math.cos(strike.facing) * reach;
    const hitRadius = strike.isHaymaker ? 2.25 : 1.58;
    spawnShockRing(fx, fz, strike.isHaymaker ? 0x38bdf8 : 0xfbbf24, 0.28, hitRadius, 0.26);

    const rQE = (pProg.level || 1) >= 9 ? 2 : ((pProg.level || 1) >= 6 ? 1 : 0);
    const dmg = strike.isHaymaker
      ? Math.round([70, 110, 150][rQE] + st.atk * 0.80)
      : Math.round(st.atk * 1.00);
    const kbDist = strike.isHaymaker ? 3.8 : 0;
    const wallStun = strike.isHaymaker && talents[3] === 'L';

    dummies.forEach((d) => {
      if (d.isShooter && !shooterEnabled) return;
      if (Math.hypot(d.x - fx, d.z - fz) <= hitRadius + d.r) {
        damageDummy(d, dmg, strike.isHaymaker ? '#38bdf8' : '#fb7185');
        if (kbDist > 0) {
          let dirX = d.x - hero.x;
          let dirZ = d.z - hero.z;
          let dirLen = Math.hypot(dirX, dirZ);
          if (dirLen < 0.05) {
            dirX = Math.sin(strike.facing);
            dirZ = Math.cos(strike.facing);
            dirLen = 1;
          }
          const kbDur = 0.26;
          d.kbVx = (dirX / dirLen) * (kbDist / kbDur);
          d.kbVz = (dirZ / dirLen) * (kbDist / kbDur);
          d.kbTimer = kbDur;
          d.kbWallStun = wallStun;
          d.resetDelay = 3.5;
          spawnFloat(d.x, 2.7, d.z, 'KNOCKBACK!', '#38bdf8');
        }
      }
    });

    if (phase1Engine) {
      phase1Engine.getHostileTargets().forEach((t) => {
        if (Math.hypot(t.x - fx, t.z - fz) <= hitRadius + t.r) {
          let dirX = t.x - hero.x;
          let dirZ = t.z - hero.z;
          if (Math.hypot(dirX, dirZ) < 0.05) {
            dirX = Math.sin(strike.facing);
            dirZ = Math.cos(strike.facing);
          }
          phase1Engine.dealPlayerDamageToUnit(t, dmg, {
            isBasic: !strike.isHaymaker,
            dmgType: 'physical',
            knockbackDist: kbDist,
            knockbackDirX: dirX,
            knockbackDirZ: dirZ,
            kbOriginX: hero.x,
            kbOriginZ: hero.z,
            wallStun
          });
        }
      });
    }
    return;
  }

  const fx = hero.x + Math.sin(strike.facing) * 1.15;
  const fz = hero.z + Math.cos(strike.facing) * 1.15;

  // Brawler 7R Talent (Haymaker Cleave): Every 3rd basic punch unleashes a 2.3m shockwave (+36+4/Lv dmg & heals 55+5/Lv HP)!
  let isHaymaker = false;
  const haymakerHeal = 55 + (pProg.level || 1) * 5;
  if (!strike.isKick && talents[7] === 'R') {
    hero.basicCombo = (hero.basicCombo + 1) % 3;
    if (hero.basicCombo === 0) {
      isHaymaker = true;
      hero.hp = Math.min(hero.maxHp, hero.hp + haymakerHeal);
      spawnShockRing(fx, fz, 0xfde047, 0.3, 2.35, 0.28);
      spawnFloat(hero.x, 2.6, hero.z, 'HAYMAKER CLEAVE! (+' + haymakerHeal + ' HP)', '#4ade80');
    }
  }
  const hitRadius = strike.isKick ? 1.95 : (isHaymaker ? 2.35 : 1.52);
  spawnShockRing(fx, fz, strike.isKick ? 0xfbbf24 : 0xf43f5e, 0.25, hitRadius, 0.24);

  const rQE = (pProg.level || 1) >= 9 ? 2 : ((pProg.level || 1) >= 6 ? 1 : 0);
  const baseStrikeDmg = strike.isKick
    ? Math.round(85 + (pProg.level || 1) * 14 + st.atk * 0.90)
    : Math.round(st.atk + (isHaymaker ? 36 + (pProg.level || 1) * 4 : 0));
  const stunDur = [1.0, 1.1, 1.2][rQE] + (talents[3] === 'L' ? 0.25 : 0);
  const siphonStep = talents[3] === 'R' ? 0.04 : 0.02;
  const siphonCap = talents[3] === 'R' ? 0.12 : 0.08;

  dummies.forEach((d) => {
    if (d.isShooter && !shooterEnabled) return;
    if (Math.hypot(d.x - fx, d.z - fz) <= hitRadius + d.r) {
      damageDummy(d, baseStrikeDmg);
      d.siphoned = Math.min(siphonCap, d.siphoned + siphonStep);
      d.siphonTimer = 4.0;
      if (strike.isKick) {
        d.stunTimer = stunDur;
        spawnFloat(d.x, 2.7, d.z, 'STUNNED!', '#fde047');
      }
    }
  });

  // Hit 4v4 Hostile Targets (Enemy Bots, Enemy Minions, Jungle Camps + Boss, Structures!)
  if (phase1Engine) {
    const arenaMult = (arena && Math.hypot(hero.x - arena.x, hero.z - arena.z) <= arena.r) ? (arena.amp || 1.25) : 1.0;
    phase1Engine.getHostileTargets().forEach((t) => {
      if (Math.hypot(t.x - fx, t.z - fz) <= hitRadius + t.r) {
        const didHit = phase1Engine.dealPlayerDamageToUnit(t, baseStrikeDmg * arenaMult, {
          isBasic: !strike.isKick,
          stunDur: strike.isKick ? stunDur : 0
        });
        if (didHit) {
          hero.siphonBonus = Math.min(siphonCap, hero.siphonBonus + siphonStep);
        }
      }
    });
  }
}

function tryAttack() {
  if (phase1Engine && phase1Engine.getPlayerProg().respawnTimer > 0) return;
  if (hero.atkTimer > 0 || hero.dashTimer > 0 || hero.leapTimer > 0 || hero.grenadeAnim > 0 || hero.rChargeTimer > 0) return;
  const st = phase1Engine ? phase1Engine.getPlayerStats() : { atk: 55, fant: 40, asPct: 0 };

  if (activeHeroId === 'coyote') {
    hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
    hero.atkTimer = 1.05 / (1 + st.asPct);
    hero.punchAnim = 0.22;
    if (actions.punch) {
      fadeToAction(actions.punch, 0.04, true, 0.95);
    }
    SFX.play('punch');
    spawnCrossbowBolt(hero.facing, st.atk, 1, false, false);
    return;
  }

  if (activeHeroId === 'sorceress') {
    if (pendingSorcBolt) {
      SFX.play('chime');
      spawnAstralBolt(pendingSorcBolt.facing, pendingSorcBolt.dmg);
      pendingSorcBolt = null;
    }
    hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
    hero.atkTimer = 1.12 / (1 + st.asPct);
    // 0.44s commit window covers the 0.22s left-hand pullback windup + throw release!
    hero.punchAnim = 0.44;
    if (actions.punch) {
      fadeToAction(actions.punch, 0.04, true, 2.25, 0.24);
    }
    const sparkDmg = Math.round(st.atk * 0.40 + (st.fant || 0) * 0.55);
    pendingSorcBolt = { facing: hero.facing, dmg: sparkDmg, t: 0.22 };
    return;
  }

  // Pit Brawler or Shirtless Bodyguard Melee Attack
  if (pendingStrike) {
    fireStrikeImpact(pendingStrike);
    pendingStrike = null;
  }
  hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
  const isKick = activeHeroId === 'brawler' && hero.qArmed;
  hero.qArmed = false;

  if (isKick) {
    hero.atkTimer = 1.04 / (1 + st.asPct * 0.5);
    // Full 0.76s commit window so moving during Q Kick finishes the roundhouse & leg plant before blending to run!
    hero.kickAnim = 0.76;
    const kickAct = actions.kick || actions.punch;
    if (kickAct) {
      const dur = kickAct.getClip().duration || 1.6;
      fadeToAction(kickAct, 0.06, true, THREE.MathUtils.clamp(dur / 0.78, 1.25, 2.25));
    }
    pendingStrike = { isKick: true, isHaymaker: false, facing: hero.facing, t: 0.23 };
  } else if (heroKit() && heroKit().onBasicAttack) {
    heroKit().onBasicAttack(st);
  } else if (activeHeroId === 'bodyguard') {
    hero.atkTimer = 1.30 / (1 + st.asPct);
    // Hook Punch.fbx (2.17s): skip the 0.42s off-hand guard shift and start right as the right shoulder cocks back;
    // at 2.15x speed, the Right-Hand Hook Punch impacts at t = 0.27s (clipTime = 1.00s) and finishes follow-through at 0.50s!
    hero.punchAnim = 0.50;
    if (actions.punch) {
      fadeToAction(actions.punch, 0.05, true, 2.15, 0.42);
    }
    pendingStrike = { isKick: false, isHaymaker: false, facing: hero.facing, t: 0.27 };
  } else {
    hero.atkTimer = 1.04 / (1 + st.asPct);
    hero.punchAnim = 0.48;

    // Each click swings 1 punch: default to Punching (1), or alternate 1/2/1/2/1 if attacking in rapid sequence!
    if (hero.comboResetTimer > 0) {
      hero.basicCombo = (hero.basicCombo + 1) % 2;
    } else {
      hero.basicCombo = 0;
    }
    hero.comboResetTimer = hero.atkTimer + 0.48;

    const punchAct = (hero.basicCombo === 1 && actions.punch2) ? actions.punch2 : actions.punch;
    if (punchAct) {
      const dur = punchAct.getClip().duration || 0.87;
      fadeToAction(punchAct, 0.05, true, THREE.MathUtils.clamp(dur / 0.62, 1.1, 1.8));
    }
    pendingStrike = { isKick: false, isHaymaker: false, facing: hero.facing, t: 0.16 };
  }
}

let dashTrailTimer = 0;
let activeDashClipKind = null; // 'slide' | 'jump' | null

function triggerDashAnimation(isRebound) {
  hero.punchAnim = 0;
  hero.kickAnim = 0;
  pendingStrike = null;

  // Dash sequence: 1st Dash (!isRebound) = Flying Kick (actions.jump) => 2nd Rebound Dash (isRebound) = Running Slide (actions.slide)
  if (!isRebound && actions.jump) {
    activeDashClipKind = 'jump';
    fadeToAction(actions.jump, 0.05, true, 1.75, 0.03);
    spawnShockRing(hero.x, hero.z, 0xfde047, 0.25, 1.15, 0.22);
  } else if (actions.slide) {
    activeDashClipKind = 'slide';
    fadeToAction(actions.slide, 0.05, true, 2.35, 0.14);
    dashTrailTimer = 0;
  } else if (actions.jump) {
    activeDashClipKind = 'jump';
    fadeToAction(actions.jump, 0.05, true, 1.75, 0.03);
  } else {
    activeDashClipKind = null;
  }
}

function launchShrapnelGrenade(tx, tz) {
  const outerR = 2.45;
  const bullseyeR = 0.92;

  // Target Telegraph Rings on Ground (Outer Shrapnel Ring + Inner 2x Bullseye Ring!)
  const teleGrp = new THREE.Group();
  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(outerR - 0.08, outerR, 40),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.04;
  teleGrp.add(outerRing);

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(bullseyeR - 0.07, bullseyeR, 32),
    new THREE.MeshBasicMaterial({ color: 0xf43f5e, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.05;
  teleGrp.add(innerRing);

  teleGrp.position.set(tx, 0, tz);
  scene.add(teleGrp);

  // Flying 3D Iron Shrapnel Grenade
  const gMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.75, emissive: 0xf43f5e, emissiveIntensity: 0.6 })
  );
  const sx = hero.x + Math.sin(hero.facing) * 0.45;
  const sz = hero.z + Math.cos(hero.facing) * 0.45;
  gMesh.position.set(sx, 1.45, sz);
  scene.add(gMesh);

  SFX.play('dash');
  heroGrenades.push({
    mesh: gMesh,
    teleGrp,
    sx, sz, tx, tz,
    outerR, bullseyeR,
    t: 0,
    dur: 0.48
  });
}

function castKey(slot) {
  if (phase1Engine && phase1Engine.getPlayerProg().respawnTimer > 0) return;
  SFX.unlock();
  hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
  const st = phase1Engine ? phase1Engine.getPlayerStats() : { atk: 55, fant: 42, cdr: 0 };
  const pProg = phase1Engine ? phase1Engine.getPlayerProg() : { level: 4, talents: {} };
  const talents = pProg.talents || {};
  const cdrMult = 1 - (st.cdr || 0);
  const rQE = (pProg.level || 1) >= 9 ? 2 : ((pProg.level || 1) >= 6 ? 1 : 0);
  const rUlt = (pProg.level || 1) >= 12 ? 2 : ((pProg.level || 1) >= 8 ? 1 : 0);

  // =====================================================
  // 1. COYOTE CROSSBOWMAN
  // =====================================================
  if (activeHeroId === 'coyote') {
    if (slot === 'Q') {
      if (hero.rChargeTimer > 0 || hero.grenadeAnim > 0) return;
      if (!wtfMode && hero.cdQ > 0) return;
      if (!trySpendMana('Q')) return;
      hero.cdQ = wtfMode ? 0.25 : [7.5, 6.5, 5.5][rQE] * cdrMult;
      hero.atkTimer = (talents[3] === 'R' ? 0.80 : 1.10) / (1 + (st.asPct || 0) * 0.5);
      hero.punchAnim = 0.24;
      if (actions.punch) fadeToAction(actions.punch, 0.04, true, 0.95);
      SFX.play('punch');
      const angles = talents[10] === 'R' ? [-0.22, -0.11, 0, 0.11, 0.22] : [-0.14, 0, 0.14];
      const pierceQ = talents[10] === 'R';
      const boltDmg = Math.round([25, 45, 65][rQE] + st.atk * 0.85);
      angles.forEach((off) => {
        spawnCrossbowBolt(hero.facing + off, boltDmg, 1, false, pierceQ);
      });
      spawnFloat(hero.x, 2.4, hero.z, pierceQ ? '5-BOLT PIERCE VOLLEY!' : 'FAN VOLLEY!', '#fde047');
    } else if (slot === 'E') {
      if (hero.rChargeTimer > 0) return;
      if (!wtfMode && hero.cdE > 0) return;
      if (!trySpendMana('E')) return;
      hero.cdE = wtfMode ? 0.35 : [11.0, 9.8, 8.5][rQE] * cdrMult;
      hero.grenadeAnim = 0.42;
      const dx = aimWorld.x - hero.x;
      const dz = aimWorld.z - hero.z;
      const dist = Math.hypot(dx, dz) || 0.01;
      const clampedDist = Math.min(10.5, dist);
      const tx = hero.x + (dx / dist) * clampedDist;
      const tz = hero.z + (dz / dist) * clampedDist;

      if (actions.kick) {
        fadeToAction(actions.kick, 0.05, true, 1.85, 1.28);
      }
      pendingGrenadeThrow = { tx, tz, t: 0.22 };
    } else if (slot === 'R') {
      if (hero.rChargeTimer > 0) {
        if (hero.rChargeTimer <= 1.65) fireHeartseekerRelease();
        return;
      }
      if (!wtfMode && pProg.level < 4) {
        spawnFloat(hero.x, 2.6, hero.z, 'ULTIMATE UNLOCKS AT LEVEL 4!', '#fb7185');
        return;
      }
      if (!wtfMode && hero.cdR > 0) return;
      if (!trySpendMana('R')) return;
      hero.cdR = wtfMode ? 0.5 : [42.0, 36.0, 30.0][rUlt] * cdrMult;
      hero.rChargeTimer = 2.0;
      SFX.play('chime');
      spawnFloat(hero.x, 2.55, hero.z, 'CHARGING HEARTSEEKER!', '#fb7185');
    }
    return;
  }

  // =====================================================
  // 2. ASTRAL SORCERESS
  // =====================================================
  if (activeHeroId === 'sorceress') {
    if (slot === 'Q') {
      if (!wtfMode && hero.cdQ > 0) return;
      if (!trySpendMana('Q')) return;
      // Each Tempo stack reduces Q base cooldown (5.2s/4.8s/4.4s) by 0.90s (capped at a 1.50s minimum floor!)
      const baseQCd = [5.2, 4.8, 4.4][rQE];
      const effBaseCd = Math.max(1.65, baseQCd - (hero.qTempoStacks || 0) * 0.90);
      hero.cdQ = wtfMode ? 0.22 : Math.max(1.50, effBaseCd * cdrMult);
      hero.punchAnim = 0.54;
      const qAct = actions.punch || actions.kick;
      if (qAct) fadeToAction(qAct, 0.05, true, 2.25, 0.22);

      const maxRange = talents[3] === 'L' ? 10.9 : 9.5;
      const radius = talents[7] === 'L' ? 2.0 : 1.65;
      const dx = aimWorld.x - hero.x;
      const dz = aimWorld.z - hero.z;
      const dist = Math.hypot(dx, dz) || 0.01;
      const clamped = Math.min(maxRange, dist);
      const tx = hero.x + (dx / dist) * clamped;
      const tz = hero.z + (dz / dist) * clamped;

      const baseDmg = 60 + (pProg.level || 1) * 12 + (st.fant || 0) * 0.92 + (talents[3] === 'L' ? 25 : 0);
      SFX.play('chime');
      spawnStarfallPillar(tx, tz, radius, 0.38, Math.round(baseDmg), true, 0);
    } else if (slot === 'E') {
      if (!wtfMode && hero.cdE > 0) return;
      if (!trySpendMana('E')) return;
      hero.cdE = wtfMode ? 0.30 : [12.0, 10.5, 9.0][rQE] * cdrMult;

      // Dash in current WASD movement direction (or toward cursor if no WASD key is held)
      let mx = 0, mz = 0;
      if (keys.KeyW || keys.ArrowUp) mz -= 1;
      if (keys.KeyS || keys.ArrowDown) mz += 1;
      if (keys.KeyA || keys.ArrowLeft) mx -= 1;
      if (keys.KeyD || keys.ArrowRight) mx += 1;
      const ml = Math.hypot(mx, mz);
      const dashAng = ml > 0.05 ? Math.atan2(mx, mz) : hero.facing;
      const dashDist = talents[7] === 'R' ? 5.25 : 4.2;
      const dashDur = 0.24;
      hero.dashVx = Math.sin(dashAng) * (dashDist / dashDur);
      hero.dashVz = Math.cos(dashAng) * (dashDist / dashDur);
      hero.dashTimer = dashDur;
      hero.dashKind = 'sorc_rift';
      hero.dashHit = true; // Don't stop on units during Rift Stride
      if (talents[7] === 'R') {
        hero.eSpeedBuffTimer = 1.5;
      }
      SFX.play('dash');
      spawnShockRing(hero.x, hero.z, 0x38bdf8, 0.25, 1.35, 0.24);

      // Erupt cascading line of 3 Starfall Pillars from post-dash position toward aimWorld!
      const endX = hero.x + Math.sin(dashAng) * dashDist;
      const endZ = hero.z + Math.cos(dashAng) * dashDist;
      const lineAng = Math.atan2(aimWorld.x - endX, aimWorld.z - endZ);
      const eDmg = Math.round([50, 80, 110][rQE] + (st.fant || 0) * 0.65);
      const eSlow = talents[3] === 'R' ? 1.5 : 0;
      [1.8, 3.6, 5.4].forEach((stepDist, idx) => {
        const px = endX + Math.sin(lineAng) * stepDist;
        const pz = endZ + Math.cos(lineAng) * stepDist;
        spawnStarfallPillar(px, pz, 1.35, 0.18 + idx * 0.12, eDmg, false, eSlow);
      });
      spawnFloat(hero.x, 2.55, hero.z, 'RIFT STRIDE!', '#38bdf8');
    } else if (slot === 'R') {
      if (!wtfMode && pProg.level < 4) {
        spawnFloat(hero.x, 2.6, hero.z, 'ULTIMATE UNLOCKS AT LEVEL 4!', '#fb7185');
        return;
      }
      if (!wtfMode && hero.cdR > 0) return;
      if (!trySpendMana('R')) return;
      hero.cdR = wtfMode ? 0.45 : [46.0, 40.0, 34.0][rUlt] * cdrMult;
      // 0.72s commit window covers the 0.50s 2H overhead windup + downward slam!
      hero.kickAnim = 0.72;
      const rAct = actions.kick || actions.punch;
      if (rAct) fadeToAction(rAct, 0.05, true, 2.2, 0.25);

      const dx = aimWorld.x - hero.x;
      const dz = aimWorld.z - hero.z;
      const dist = Math.hypot(dx, dz) || 0.01;
      const clamped = Math.min(9.0, dist);
      const tx = hero.x + (dx / dist) * clamped;
      const tz = hero.z + (dz / dist) * clamped;
      spawnShockRing(tx, tz, 0xe879f9, 2.0, 0.4, 0.50);
      pendingSorcUlt = { tx, tz, t: 0.50 };
    }
    return;
  }

  // =====================================================
  // 3. SHIRTLESS BODYGUARD
  // =====================================================
  if (activeHeroId === 'bodyguard') {
    if (slot === 'Q') {
      if (hero.leapTimer > 0) return;
      if (!wtfMode && hero.cdQ > 0) return;
      if (!trySpendMana('Q')) return;
      hero.cdQ = wtfMode ? 0.22 : [7.5, 6.5, 5.5][rQE] * cdrMult;
      hero.kickAnim = 0.38;
      const act = actions.kick || actions.punch;
      if (act) fadeToAction(act, 0.05, true, 1.65);
      SFX.play('chime');
      pendingStrike = { isKick: false, isHaymaker: true, facing: hero.facing, t: 0.24 };
      spawnFloat(hero.x, 2.6, hero.z, 'BOUNCER HAYMAKER!', '#38bdf8');
    } else if (slot === 'E') {
      if (hero.leapTimer > 0) return;
      if (!wtfMode && hero.cdE > 0) return;
      if (!trySpendMana('E')) return;
      hero.cdE = wtfMode ? 0.30 : [11.0, 9.5, 8.0][rQE] * cdrMult;

      const maxLeap = talents[7] === 'L' ? 9.75 : 7.8;
      const dx = aimWorld.x - hero.x;
      const dz = aimWorld.z - hero.z;
      const dist = Math.hypot(dx, dz) || 0.01;
      const clamped = Math.min(maxLeap, dist);
      hero.leapSx = hero.x;
      hero.leapSz = hero.z;
      hero.leapTx = THREE.MathUtils.clamp(hero.x + (dx / dist) * clamped, -69, 69);
      hero.leapTz = THREE.MathUtils.clamp(hero.z + (dz / dist) * clamped, -46, 46);
      hero.leapDur = 0.42;
      hero.leapTimer = hero.leapDur;
      hero.kickAnim = 0.54; // 0.42s leap + 0.12s ground-slam follow-through
      // Jump Attack.fbx: start at 0.52s (takeoff) at 2.55x so clipTime reaches 1.60s (ground slam) right as leapTimer hits 0!
      if (actions.jump) fadeToAction(actions.jump, 0.05, true, 2.55, 0.52);
      SFX.play('dash');
      spawnShockRing(hero.x, hero.z, 0x38bdf8, 0.3, 1.4, 0.24);
      spawnFloat(hero.x, 2.7, hero.z, 'CROWD DIVE!', '#38bdf8');
    } else if (slot === 'R') {
      if (!wtfMode && pProg.level < 4) {
        spawnFloat(hero.x, 2.6, hero.z, 'ULTIMATE UNLOCKS AT LEVEL 4!', '#fb7185');
        return;
      }
      if (!wtfMode && hero.cdR > 0) return;
      if (!trySpendMana('R')) return;
      hero.cdR = wtfMode ? 0.45 : [44.0, 38.0, 32.0][rUlt] * cdrMult;

      const rRad = talents[10] === 'L' ? 6.0 : 4.8;
      const rDmg = Math.round(75 + (pProg.level || 1) * 14 + st.atk * 0.50);
      const tauntDur = [1.5, 1.75, 2.0][rUlt];
      let enemyScore = 0;

      dummies.forEach((d) => {
        if (d.isShooter && !shooterEnabled) return;
        if (Math.hypot(d.x - hero.x, d.z - hero.z) <= rRad + d.r) {
          damageDummy(d, rDmg, '#fde047');
          enemyScore += 2;
          spawnFloat(d.x, 2.75, d.z, 'TAUNTED (' + tauntDur + 's)!', '#fde047');
        }
      });
      if (phase1Engine) {
        phase1Engine.getHostileTargets().forEach((t) => {
          if (t.kind === 'structure') return;
          if (Math.hypot(t.x - hero.x, t.z - hero.z) <= rRad + t.r) {
            const hit = phase1Engine.dealPlayerDamageToUnit(t, rDmg, {
              dmgType: 'physical',
              tauntDur,
              color: '#fde047'
            });
            if (hit) enemyScore += (t.kind === 'bot' ? 2 : 1);
          }
        });
      }

      hero.shield = Math.round(180 + (pProg.level || 1) * 25 + enemyScore * 65);
      hero.shieldTimer = 4.5;
      hero.rShieldTimer = 4.5;
      if (talents[10] === 'R') {
        hero.peakPhysiqueTimer = 6.0;
      }
      hero.kickAnim = 0.72;
      const tauntAct = actions.slide || actions.kick;
      if (tauntAct) fadeToAction(tauntAct, 0.05, true, 1.55, 0.10);
      SFX.play('arena');
      spawnShockRing(hero.x, hero.z, 0xfbbf24, 0.5, rRad, 0.38);
      spawnShockRing(hero.x, hero.z, 0x38bdf8, 0.3, rRad * 0.75, 0.28);
      spawnFloat(hero.x, 2.9, hero.z, 'EYES ON ME! (+' + hero.shield + ' SHIELD)', '#fde047');
    }
    return;
  }

  // Heroes migrated to js/heroes/<id>.js
  const kitCast = heroKit();
  if (kitCast && kitCast.cast) {
    kitCast.cast(slot, { st, pProg, talents, cdrMult, rQE, rUlt });
    return;
  }

  // =====================================================
  // 5. PIT BRAWLER
  // =====================================================
  if (slot === 'Q') {
    if (!wtfMode && hero.cdQ > 0) return;
    if (!trySpendMana('Q')) return;
    const baseQCd = [7.5, 6.8, 6.0][rQE] - (talents[3] === 'L' ? 1.5 : 0);
    hero.cdQ = wtfMode ? 0.15 : baseQCd * cdrMult;
    hero.qArmed = true;
    hero.atkTimer = 0;
    const dummyNear = dummies.some((d) => (!d.isShooter || shooterEnabled) && Math.hypot(d.x - hero.x, d.z - hero.z) <= 2.9);
    const unitNear = phase1Engine && phase1Engine.getHostileTargets().some((t) => Math.hypot(t.x - hero.x, t.z - hero.z) <= 2.9);
    if (dummyNear || unitNear) {
      tryAttack();
    } else {
      SFX.play('chime');
      spawnFloat(hero.x, 2.5, hero.z, 'KICK ARMED!', '#fde047');
    }
  } else if (slot === 'E') {
    if (hero.eRecast > 0) {
      hero.eRecast = 0;
      hero.dashVx = Math.sin(hero.facing) * 14.2;
      hero.dashVz = Math.cos(hero.facing) * 14.2;
      hero.dashTimer = 0.36;
      hero.dashKind = 'second';
      hero.dashHit = false;
      triggerDashAnimation(true);
      SFX.play('dash');
      return;
    }
    if (!wtfMode && hero.cdE > 0) return;
    if (!trySpendMana('E')) return;
    hero.cdE = wtfMode ? 0.25 : [10.0, 9.0, 8.0][rQE] * cdrMult;
    hero.dashVx = Math.sin(hero.facing) * 14.2;
    hero.dashVz = Math.cos(hero.facing) * 14.2;
    hero.dashTimer = 0.36;
    hero.dashKind = 'first';
    hero.dashHit = false;
    triggerDashAnimation(false);
    SFX.play('dash');
  } else if (slot === 'R') {
    if (!wtfMode && pProg.level < 4) {
      spawnFloat(hero.x, 2.6, hero.z, 'ULTIMATE UNLOCKS AT LEVEL 4!', '#fb7185');
      return;
    }
    if (!wtfMode && hero.cdR > 0) return;
    if (!trySpendMana('R')) return;
    hero.cdR = wtfMode ? 0.4 : [46.0, 40.0, 34.0][rUlt] * cdrMult;
    buildArena3D(hero.x, hero.z);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Digit1') {
    switchHero('coyote');
  }
  if (e.code === 'Digit2') {
    switchHero('brawler');
  }
  if (e.code === 'Digit3') {
    switchHero('sorceress');
  }
  if (e.code === 'Digit4') {
    switchHero('bodyguard');
  }
  if (e.code === 'Digit5') {
    switchHero('panther');
  }
  if (e.code === 'KeyQ') castKey('Q');
  if (e.code === 'KeyE') castKey('E');
  if (e.code === 'KeyR') castKey('R');
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
