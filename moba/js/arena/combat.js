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
spawnDummy('Pit Target', ALCOVE.x, ALCOVE.z, false);
spawnDummy('Heavy Bag #1', ALCOVE.x + 2.2, ALCOVE.z - 1.2, false);
spawnDummy('Heavy Bag #2', ALCOVE.x + 4.4, ALCOVE.z, false);
spawnDummy('Arcane Shooter', ALCOVE.x - 3.0, ALCOVE.z + 3.7, true);

// =========================================================
// 3D HERO GAMEPLAY STATE & VFX
// =========================================================
const hero = {
  x: window.MOBA_MAP.BASE.heroSpawn.x, z: window.MOBA_MAP.BASE.heroSpawn.z, r: 0.52,
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
}

function tryAttack() {
  if (phase1Engine && phase1Engine.getPlayerProg().respawnTimer > 0) return;
  if (hero.atkTimer > 0 || hero.dashTimer > 0 || hero.leapTimer > 0 || hero.grenadeAnim > 0 || hero.rChargeTimer > 0) return;
  const st = phase1Engine ? phase1Engine.getPlayerStats() : { atk: 55, fant: 40, asPct: 0 };

  const kitRanged = heroKit();
  if (kitRanged && kitRanged.onRangedAttack) {
    kitRanged.onRangedAttack(st);
    return;
  }

  // Melee heroes (kit decides punch/kick/claw)
  if (pendingStrike) {
    fireStrikeImpact(pendingStrike);
    pendingStrike = null;
  }
  hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
  const qWasArmed = hero.qArmed;
  hero.qArmed = false;

  if (heroKit() && heroKit().onBasicAttack) {
    heroKit().onBasicAttack(st, qWasArmed);
  }
}

let dashTrailTimer = 0;
let activeDashClipKind = null; // 'slide' | 'jump' | null

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

  // Heroes migrated to js/heroes/<id>.js
  const kitCast = heroKit();
  if (kitCast && kitCast.cast) {
    kitCast.cast(slot, { st, pProg, talents, cdrMult, rQE, rUlt });
    return;
  }
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit) {
    const k = rosterKits()[parseInt(digit[1], 10) - 1];
    if (k) switchHero(k.id);
  }
  if (e.code === 'KeyQ') castKey('Q');
  if (e.code === 'KeyE') castKey('E');
  if (e.code === 'KeyR') castKey('R');
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
