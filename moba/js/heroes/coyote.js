// Coyote Crossbowman: Carry • Ranged Physical
// Hero kit: data (stats, talents, UI text) + player ability code moved verbatim from js/arena/*.js and phase1_data.js.
// Functions run in the shared global scope of js/arena/*.js (hero, actions, fadeToAction, damageDummy, heroBolts, ...).
// Still shared until Phase 2: bolt flight/collision (heroBolts loop in loop.js), Bleed ticking on dummies (loop.js) and
// applyBleedStacks (combat.js), Bleed stacks + 10R Plague in phase1_engine.js (addBleed), 7R Crippling Bleed in cc.js,
// the crossbow/laser/grenade prop meshes (models.js), and the HEARTSEEKER plate tag / R glow driven by hero.rChargeTimer (loop.js).
(function () {
'use strict';
const H = (window.MOBA_HEROES = window.MOBA_HEROES || {});

let crossbowMounted = false;

// Spawn a 3D glowing Crossbow Bolt (or R Heartseeker Piercing Bolt!)
// rangeMult scales how far it flies; popScale scales the Heartseeker's Bleed detonation damage (see loop.js heroBolts)
// actor: KitFx.player or a bot actor (phase1Engine.botActor). Bolts remember a bot owner so loop.js hits that bot's enemies.
function spawnCrossbowBolt(actor, angle, dmg, bleedAdd, isPiercingHeartseeker = false, forcePierce = false, rangeMult = 1, popScale = 1, castId = 0, st = null) {
  const u = actor.unit;
  const boltGrp = new THREE.Group();
  const len = isPiercingHeartseeker ? 1.55 : 0.85;
  const rad = isPiercingHeartseeker ? 0.075 : 0.038;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(rad * 0.65, rad, len, 8),
    new THREE.MeshBasicMaterial({ color: isPiercingHeartseeker ? 0xfde047 : (actor.isPlayer || actor.team === 1 ? 0xf43f5e : 0x38bdf8) })
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

  const startX = u.x + Math.sin(angle) * 0.72;
  const startZ = u.z + Math.cos(angle) * 0.72;
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
    src: isPiercingHeartseeker ? 'ability' : 'attack', // basics are Attack damage; Heartseeker is Ability
    bleedAdd,
    isHeartseeker: isPiercingHeartseeker,
    pierce: isPiercingHeartseeker || forcePierce,
    hitIds: new Set(),
    popScale,
    castId, // the R cast for Heartseeker bolts (0 for basics)
    st, // Heartseeker: the stats from cast time (loop.js uses them for the Bleed pop)
    owner: actor.isPlayer ? null : actor,
    life: (isPiercingHeartseeker ? 0.68 : 0.55) * rangeMult
  });
}

// R Heartseeker charge scaling: an instant release would be 50% damage / 60% range, ramping to 100% at the full 2.0s;
// a full charge is a Perfect Shot (+25% Bleed detonation damage). Early release is allowed after 0.35s (~59%).
function getPendingGrenade(actor) { return actor.isPlayer ? pendingGrenadeThrow : actor.unit.coyPendingGrenade; }
function setPendingGrenade(actor, g) { if (actor.isPlayer) pendingGrenadeThrow = g; else actor.unit.coyPendingGrenade = g; }

const HEARTSEEKER = { chargeDur: 2.0, minPower: 0.5, minRange: 0.6, perfectPopBonus: 1.25, earlyAfter: 0.35 };
// Talents
const STEADY_AIM_DUR = 1.5;      // 3L: full charge time
const SHRAPNEL_BONUS = 1;        // 3R: extra Bleed stack from the grenade
const WATCH_R = 5.0;             // 7L: armed trap vision radius
const TREES_RANGE = 1.4;         // 10L: Perfect Shot range

// ---- Q: Bear Trap (DESIGN_RULES Coyote) ----
// Thrown to a spot within TRAP.range; arms after TRAP.arm s, then it's invisible to enemies (they see a faint shimmer
// within 2.25m, like other stealth). The first enemy hero to step on it is rooted and takes bleed. 2 charges (KitFx.charges).
const TRAP = { range: 6.0, arm: 0.5, life: 30, root: 1.0, bleed: 2, trigR: 0.65, maxActive: 3, recharge: [12, 11, 10], reveal: 2.25 }; // reveal = the shared stealth reveal radius
KitFx.charges.slotFor.trap = 'Q';
const traps = [];
// 7L Watchful Traps: every armed trap whose owner took the talent sees 5m around it (for the owner's team)
window.MOBA_COMBAT.visionSources.push((team) => {
  const C = window.MOBA_COMBAT;
  const out = [];
  traps.forEach((tr) => {
    if (tr.state !== 'armed' || tr.team !== team) return;
    const owner = tr.owner ? tr.owner.unit : hero;
    if (C.talentOf(owner, 7) === 'L') out.push({ x: tr.x, z: tr.z, r: WATCH_R });
  });
  return out;
});
function makeTrapMesh() {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.7, roughness: 0.45, transparent: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.05, 14), iron);
  base.position.y = 0.03;
  g.add(base);
  const jaws = [];
  for (let side = -1; side <= 1; side += 2) {
    const jaw = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 18, Math.PI), iron);
    arc.rotation.x = Math.PI / 2;
    jaw.add(arc);
    for (let k = 1; k < 8; k++) {
      const a = (k / 8) * Math.PI;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.11, 5), iron);
      tooth.position.set(Math.cos(a) * 0.42, 0.06, Math.sin(a) * 0.42);
      jaw.add(tooth);
    }
    jaw.rotation.y = side > 0 ? 0 : Math.PI;
    jaw.position.y = 0.05;
    jaw.userData.side = side;
    g.add(jaw);
    jaws.push(jaw);
  }
  g.userData.jaws = jaws;
  g.userData.mat = iron;
  return g;
}
function throwTrap(actor, tx, tz) {
  const u = actor.unit;
  const team = actor.isPlayer ? 0 : (actor.team || 0);
  const owner = actor.isPlayer ? null : actor;
  // oldest trap goes when this caster already has the max out
  const mine = traps.filter((t) => t.owner === owner && t.state !== 'snapped');
  if (mine.length >= TRAP.maxActive) removeTrap(traps.indexOf(mine[0]));
  const mesh = makeTrapMesh();
  mesh.position.set(u.x, 1.2, u.z);
  scene.add(mesh);
  traps.push({ owner, team, sx: u.x, sz: u.z, tx, tz, x: tx, z: tz, t: 0, dur: 0.35, armT: TRAP.arm, life: TRAP.life, snapT: 0, state: 'flying', mesh, castId: KitFx.castId() });
  SFX.play('dash');
}
function removeTrap(i) {
  if (i < 0) return;
  scene.remove(traps[i].mesh);
  traps.splice(i, 1);
}
function snapTrap(tr) {
  tr.state = 'snapped';
  tr.snapT = 0.6;
  SFX.play('punch');
  spawnShockRing(tr.x, tr.z, 0xf43f5e, 0.15, 1.0, 0.22);
  spawnFloat(tr.x, 2.5, tr.z, 'TRAPPED!', '#f43f5e');
}
function updateTraps(dt) {
  for (let i = traps.length - 1; i >= 0; i--) {
    const tr = traps[i];
    const m = tr.mesh;
    if (tr.state === 'flying') {
      tr.t += dt;
      const k = Math.min(1, tr.t / tr.dur);
      m.position.set(tr.sx + (tr.tx - tr.sx) * k, (1 - k) * 1.2 + Math.sin(k * Math.PI) * 1.4, tr.sz + (tr.tz - tr.sz) * k);
      m.rotation.y += dt * 9;
      if (k >= 1) { tr.state = 'arming'; m.position.set(tr.x, 0, tr.z); }
    } else if (tr.state === 'arming') {
      tr.armT -= dt;
      if (tr.armT <= 0) tr.state = 'armed';
    } else if (tr.state === 'armed') {
      tr.life -= dt;
      if (tr.life <= 0) { removeTrap(i); continue; }
      const victim = findTrapVictim(tr);
      if (victim) springTrap(tr, victim);
    } else if (tr.state === 'snapped') {
      tr.snapT -= dt;
      m.userData.jaws.forEach((j) => { j.rotation.z = THREE.MathUtils.lerp(j.rotation.z, j.userData.side * 1.25, 0.5); });
      if (tr.snapT <= 0) { removeTrap(i); continue; }
    }
    // who sees it: its own team always; enemies only while it's in the air / arming (and in their vision),
    // then just a faint shimmer if the player is within TRAP.reveal of an armed enemy trap
    let op = 1;
    if (tr.team !== 0) {
      const inVision = !phase1Engine || !phase1Engine.isVisibleToOrder || phase1Engine.isVisibleToOrder(tr.x, tr.z);
      if (tr.state === 'armed') op = Math.hypot(hero.x - tr.x, hero.z - tr.z) <= TRAP.reveal ? 0.25 : 0;
      else op = inVision ? 1 : 0;
    } else if (tr.state === 'armed') op = 0.55;
    m.visible = op > 0;
    m.userData.mat.opacity = op;
  }
}
// first enemy hero standing on an armed trap (the player's traps also catch training dummies)
function findTrapVictim(tr) {
  const R = TRAP.trigR;
  if (!tr.owner) {
    for (const d of dummies) {
      if (d.isShooter && !shooterEnabled) continue;
      if (Math.hypot(d.x - tr.x, d.z - tr.z) <= R + d.r) return { dummy: d };
    }
    if (phase1Engine) {
      const t = phase1Engine.getHostileTargets().find((h) => h.kind === 'bot' && Math.hypot(h.x - tr.x, h.z - tr.z) <= R + (h.r || 0.5));
      if (t) return { unit: t };
    }
    return null;
  }
  const t = tr.owner.hostiles().find((h) => (h.kind === 'bot' || h.kind === 'player') && Math.hypot(h.x - tr.x, h.z - tr.z) <= R + (h.r || 0.5));
  return t ? { unit: t } : null;
}
function springTrap(tr, v) {
  snapTrap(tr);
  if (v.dummy) {
    CC.apply(v.dummy, { rootDur: TRAP.root }, { x: tr.x, z: tr.z });
    applyBleedStacks(v.dummy, TRAP.bleed);
    v.dummy.hitFlash = 0.09;
    return;
  }
  const opts = { rootDur: TRAP.root, bleedAdd: TRAP.bleed, color: '#f43f5e', castId: tr.castId };
  if (tr.owner) tr.owner.damage(v.unit, 0, opts);
  else if (phase1Engine) phase1Engine.dealPlayerDamageToUnit(v.unit, 0, opts);
}

function fireHeartseekerRelease(actor) {
  const hero = actor.unit; // (local alias: the caster)
  const dur = hero.rChargeDur || HEARTSEEKER.chargeDur;
  const charge = THREE.MathUtils.clamp(1 - (hero.rChargeTimer / dur), 0, 1);
  const isPerfect = charge >= 0.999;
  const power = HEARTSEEKER.minPower + (1 - HEARTSEEKER.minPower) * charge;
  // 10L Through the Trees: a Perfect Shot flies 40% farther (and ignores terrain; bolts have no terrain collision yet)
  const trees = isPerfect && window.MOBA_COMBAT.talentOf(hero, 10) === 'L';
  const range = (HEARTSEEKER.minRange + (1 - HEARTSEEKER.minRange) * charge) * (trees ? TREES_RANGE : 1);
  const popScale = power * (isPerfect ? HEARTSEEKER.perfectPopBonus : 1);
  hero.rChargeTimer = 0;
  if (actor.isPlayer) {
    laserSightMesh.visible = false;
    muzzleOrb.visible = false;
  }
  hero.punchAnim = 0.24;
  actor.play('punch', 0.04, true, 1.0, 0, 0.35);
  SFX.play('arena');
  spawnShockRing(hero.x + Math.sin(hero.facing) * 0.8, hero.z + Math.cos(hero.facing) * 0.8, 0xf43f5e, 0.2, 1.6, 0.26);
  const st = hero.rSt || actor.stats(); // stats from the R cast
  spawnCrossbowBolt(actor, hero.facing, Math.round(H.coyote.dmg.heartseeker(st, KitFx.rUlt(actor.level())) * power), 1, true, true, range, popScale, hero.rCastId, st);
  if (trees) heroBolts[heroBolts.length - 1].ignoresTerrain = true;
  if (isPerfect) {
    spawnFloat(hero.x, 2.75, hero.z, trees ? 'PERFECT SHOT! (THROUGH THE TREES)' : 'PERFECT SHOT! (+25% BLEED POP)', '#fde047');
  } else {
    spawnFloat(hero.x, 2.75, hero.z, 'QUICK SHOT (' + Math.round(power * 100) + '%)', '#fb7185');
  }
}

// E: bleed + baseline slow (outer ring / bullseye)
const GRENADE = { bleedOuter: 1, bleedBull: 3, slowDur: 2.0, slowOuter: 0.25, slowBull: 0.45 };

function launchShrapnelGrenade(actor, tx, tz, castId, st, bonusBleed) {
  const hero = actor.unit; // (local alias: the caster)
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
    owner: actor.isPlayer ? null : actor,
    t: 0,
    dur: 0.48,
    castId: castId || 0,
    st: st || null, // stats from cast time
    bonusBleed: bonusBleed || 0 // 3R Shrapnel
  });
}

H.coyote = {
  id: 'coyote',
  roster: { order: 1, emoji: '🐺', short: 'Coyote' },

  bundle: { label: 'Coyote Crossbowman', src: 'assets/coyote/coyote_bundle.js', globalKey: 'COYOTE_MIXAMO', pStart: 5, pEnd: 15 },
  moveSpeed: 6.10, // world units/s before bonuses
  hudSpeed: 332,   // SPD number shown in the HUD
  usesCrossbowProp: true,
  pillLabels: { punch: 'Fire', kick: 'Grenade', dash: 'Crossbow', dashReady: () => crossbowPivot.children.length > 1 }, // dev toolbar pills

  spec: {
    id: 'coyote',
    name: 'Coyote Crossbowman',
    role: 'Carry • Ranged Bleed Marksman (Attack)',
    glyph: 'C',
    color: '#f59e0b',
    height: 1.98,
    baseHp: 1480, hpGrow: 122, // (2026-11-19 shop balance: +100 / +8 per level)
    baseMp: 310, mpGrow: 26, mpRegen: 5.5,
    // Stat model (DESIGN_RULES §2): Attack-leaning carry. Budget (Damage Profile, no items): ~160 / 285 / 558 dps
    baseAttack: 70, attackGrow: 12.0,
    baseAbility: 10, abilityGrow: 2,
    baseResist: 19, resistGrow: 2.5,
    asGrow: 0.055,
    baseSpd: 6.10,
    atkCd: 1.0,
    mpCosts: { Q: 40, E: 55, R: 90 }
  },

  // All of Coyote's damage numbers in one place (used by the kit, the shared bolt code in loop.js and bleed ticks in
  // the engine). Basics and Bleed are Attack damage; the grenade and Heartseeker are Ability damage. The Q trap only roots + bleeds.
  dmg: {
    lmb: (st) => Math.round(st.attack),
    bleedTick: (st) => 4 + 0.09 * st.attack,                                         // per stack, every 0.65s (max 4)
    grenadeOuter: (st, lvl, rQE) => Math.round([110, 195, 300][rQE] + 10 * ((lvl || 1) - 1) + st.ability * 0.6), // bullseye x2
    heartseeker: (st, rUlt) => Math.round([360, 580, 800][rUlt] + st.ability * 1.0), // x charge power
    popPerStack: (st, rUlt) => Math.round([80, 140, 200][rUlt] + st.ability * 0.3)   // per Bleed stack detonated
  },

  // TALENTS_PLAN.md: L = Sniper, R = Bleeder. Crippling Bleed lives in cc.js (slowMult) and Plague in phase1_engine.js
  // (next to the shared Bleed helper); the rest are in this file.
  talents: {
    3: {
      L: { id: '3L', name: 'Steady Aim', desc: 'Heartseeker reaches full charge in 1.5s (was 2.0s).' },
      R: { id: '3R', name: 'Shrapnel', desc: 'Shrapnel Grenade adds one more Bleed stack to everyone hit (outer ring 2, Bullseye 4).' }
    },
    7: {
      L: { id: '7L', name: 'Watchful Traps', desc: 'Each armed Bear Trap reveals enemies within 5m (stealthed ones too).' },
      R: { id: '7R', name: 'Crippling Bleed', desc: 'Bleeding heroes are slowed 5% per stack (20% at the max of 4).' }
    },
    10: {
      L: { id: '10L', name: 'Through the Trees', desc: 'A fully charged Perfect Shot flies 40% farther and goes through walls and trees.' },
      R: { id: '10R', name: 'Plague', desc: 'When a bleeding enemy dies, its Bleed stacks jump to the nearest enemy within 6m.' }
    }
  },

  ui: {
    height: 1.98,
    modelLabel: 'Coyote Crossbowman (Mixamo + 3D Crossbow)',
    glyph: 'C',
    color: '#f59e0b',
    name: 'Coyote Crossbowman (3D)',
    role: 'Carry • Ranged Bleed Marksman (Attack)',
    passive: 'Serrated Bolts',
    lmb: 'Bleed Bolt',
    q: 'Bear Trap',
    e: 'Grenade',
    r: 'Heartseeker',
    banner: '<b>1/2/3/4</b> Hero &bull; <b>LMB</b> Bleed Bolt &bull; <b>Q</b> Bear Trap &bull; <b>E</b> Shrapnel Grenade (2x Bullseye) &bull; <b>R</b> Heartseeker &bull; <b>P</b> Shop &bull; <b>F</b> Ward &bull; <b>B</b> Recall',
    tooltips: {
      P: {
        title: 'Passive • Serrated Broadheads',
        meta: 'Innate Bleed',
        body: 'Crossbow bolts apply <b>Serrated Bleed</b> for 4.5s (stacks up to <b>4x</b>), dealing <b>Attack damage over time</b> (4 + 9% Attack per stack per tick) and priming targets for <b>R: Heartseeker</b> detonation.'
      },
      LMB: {
        title: 'LMB • Repeating Crossbow',
        meta: '0 MP • 1.0s Base ATK',
        body: 'Fires a high-velocity quarrel for <b>100% Attack</b> and applies <b>1 stack of Serrated Bleed</b>.'
      },
      Q: {
        title: 'Q • Bear Trap',
        meta: '40 MP • 2 charges (12s / 11s / 10s each, Lv 1/6/9)',
        body: 'Toss a bear trap to a spot within <b>6m</b>. It arms after <b>0.5s</b> and then turns <b>invisible to enemies</b> (they spot a faint shimmer up close). The first enemy hero to step on it is <b>rooted for 1s</b> and takes <b>2 Bleed stacks</b>. Traps last 30s; up to 3 out at once.'
      },
      E: {
        title: 'E • Shrapnel Grenade',
        meta: '55 MP • 11.0s / 9.8s / 8.5s CD (Lv 1/6/9)',
        body: 'Lobs an explosive black-powder grenade to the target zone. Everyone hit takes <b>110 / 195 / 300 (+10/Lv) + 60% Ability</b>, <b>+1 Bleed stack</b> and is <b>slowed 25% for 2s</b>. The <b>inner Bullseye</b> deals <b>2x damage</b>, adds <b>3 Bleed stacks</b> instead and slows <b>45%</b>.'
      },
      R: {
        title: 'R • Heartseeker Piercer',
        meta: '90 MP • 42s / 36s / 30s CD (Lv 4/8/12)',
        body: 'Channel for up to 2.0s, aiming a long-range sniper laser that pierces all enemies and deals <b>260 / 420 / 580 + 100% Ability</b> and <b>detonates all active Bleed stacks</b> (60 / 100 / 140 + 30% Ability each). Damage and range grow with the charge; press <b>R</b> again to fire a weaker Quick Shot early, or hold the full 2.0s for a <b>Perfect Shot (+25% Bleed detonation)</b>.'
      }
    }
  },

  // Parse the Mixamo bundle into a hero template (model, texture, animation clips)
  parseBundle(bundle, targetTmpl) {
    if (!bundle || targetTmpl.fbx) return targetTmpl.fbx;
    targetTmpl.tex = loadHeroDiffuseTexture(bundle.diffuseDataUrl);
    const idleFbx = fbxLoader.parse(b64ToBuffer(bundle.idleFbxB64), '');
    idleFbx.traverse((ch) => {
      if (ch.isMesh && ch.geometry && !ch.geometry.attributes.normal) {
        ch.geometry.computeVertexNormals();
      }
    });
    targetTmpl.fbx = idleFbx;
    if (idleFbx.animations[0]) targetTmpl.clips.idle = idleFbx.animations[0];
    const runFbx = fbxLoader.parse(b64ToBuffer(bundle.runFbxB64), '');
    if (runFbx.animations[0]) targetTmpl.clips.run = runFbx.animations[0];
    const fireFbx = fbxLoader.parse(b64ToBuffer(bundle.fireFbxB64), '');
    if (fireFbx.animations[0]) targetTmpl.clips.punch = fireFbx.animations[0];
    const grenFbx = fbxLoader.parse(b64ToBuffer(bundle.grenadeFbxB64), '');
    if (grenFbx.animations[0]) targetTmpl.clips.kick = grenFbx.animations[0];
    return idleFbx;
  },

  // Parse the 3D crossbow GLB from the bundle and mount it on the hand pivot (called once by boot.js)
  mountProps() {
    if (crossbowMounted || !window.COYOTE_MIXAMO || !window.COYOTE_MIXAMO.crossbowGlbB64) return Promise.resolve();
    crossbowMounted = true;
    return new Promise((resolve) => {
      gltfLoader.parse(b64ToBuffer(window.COYOTE_MIXAMO.crossbowGlbB64), '', (gltf) => {
        const bowScene = gltf.scene;
        bowScene.traverse((ch) => {
          if (ch.isMesh) {
            ch.castShadow = true;
            ch.receiveShadow = true;
            ch.frustumCulled = false;
            if (ch.material && ch.material.map) {
              ch.material.map.colorSpace = THREE.SRGBColorSpace;
            }
          }
        });
        // Cache clean unrotated clone for Coyote Bots before rotating player's bowScene:
        heroTemplates.crossbowScene = bowScene.clone(true);
        if (phase1Engine) phase1Engine.notifyTemplatesReady();

        // Raw GLB has +X = barrel tip (+0.50), -X = buttstock (-0.50), +Y = top sights, +-Z = horizontal bow prod.
        // Rotate Y by -90 deg so +X barrel points along +Z (Three.js lookAt direction!) and shift grip to origin:
        bowScene.rotation.y = -Math.PI / 2;
        bowScene.position.set(0, -0.14, 0.24);
        crossbowPivot.scale.setScalar(0.88);
        crossbowPivot.add(bowScene);
        updateSlotPills();
        resolve();
      }, () => resolve());
    });
  },

  // LMB Heavy Crossbow bolt (applies 1 Bleed)
  onRangedAttack(st) {
    this.basicAttackFor(KitFx.player, st);
  },

  // The same basic attack for any actor (the bot brain decides when; it also owns the bot's attack timer)
  basicAttackFor(actor, st) {
    const hero = actor.unit;
    if (!actor.isPlayer) { const L = (window.__kitBotLog = window.__kitBotLog || {}); L.lmb = (L.lmb || 0) + 1; }
    const aim = actor.aim();
    hero.facing = Math.atan2(aim.x - hero.x, aim.z - hero.z);
    hero.atkTimer = KitFx.atkInterval(H.coyote.spec.atkCd, st);
    hero.punchAnim = 0.22;
    actor.play('punch', 0.04, true, 0.95, 0, 0.36);
    SFX.play('punch');
    spawnCrossbowBolt(actor, hero.facing, H.coyote.dmg.lmb(st), 1, false, false);
  },

  // Q Triple-Notch fan volley, E Briar Bomb grenade, R Heartseeker Quarrel (2s charge, recast to fire early)
  cast(slot, ctx) {
    return this.castFor(KitFx.player, slot, ctx);
  },

  // ctx is optional for bots: built from the actor (no talents yet, no CDR items)
  castFor(actor, slot, ctx) {
    if (!ctx) {
      ctx = KitFx.castCtx(actor);
    }
    const { st, pProg, talents, cdrMult, rQE, rUlt } = ctx;
    const hero = actor.unit;
    const wtfMode = actor.wtf;
    const trySpendMana = (sl) => actor.spend(sl);
    const aimWorld = actor.aim();
    if (!actor.isPlayer) { const L = (window.__kitBotLog = window.__kitBotLog || {}); L[slot] = (L[slot] || 0) + 1; }
    if (!actor.isPlayer) hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
    if (slot === 'Q') {
      // Bear Trap: 2 charges, thrown to a spot within TRAP.range
      if (hero.rChargeTimer > 0 || hero.grenadeAnim > 0) return;
      if (!wtfMode && KitFx.charges.count(hero, 'trap', 2) <= 0) return;
      if (!trySpendMana('Q')) return;
      if (!wtfMode) KitFx.charges.use(hero, 'trap', 2, TRAP.recharge[rQE] * cdrMult);
      else hero.cdQ = 0.25;
      const dx = aimWorld.x - hero.x, dz = aimWorld.z - hero.z;
      const dist = Math.hypot(dx, dz) || 0.01;
      const reach = Math.min(TRAP.range, dist);
      hero.facing = Math.atan2(dx, dz);
      hero.punchAnim = 0.24;
      actor.play('kick', 0.05, true, 2.4, 1.28, 0.3);
      throwTrap(actor, hero.x + (dx / dist) * reach, hero.z + (dz / dist) * reach);
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

      actor.play('kick', 0.05, true, 1.85, 1.28, 0.4);
      setPendingGrenade(actor, { tx, tz, t: 0.22, castId: KitFx.castId(), st, bonusBleed: KitFx.tal(ctx, 3, 'R') ? SHRAPNEL_BONUS : 0 });
    } else if (slot === 'R') {
      if (hero.rChargeTimer > 0) {
        if (hero.rChargeTimer <= (hero.rChargeDur || HEARTSEEKER.chargeDur) - HEARTSEEKER.earlyAfter) fireHeartseekerRelease(actor);
        return;
      }
      if (!wtfMode && pProg.level < 4) {
        spawnFloat(hero.x, 2.6, hero.z, 'ULTIMATE UNLOCKS AT LEVEL 4!', '#fb7185');
        return;
      }
      if (!wtfMode && hero.cdR > 0) return;
      if (!trySpendMana('R')) return;
      hero.cdR = wtfMode ? 0.5 : [42.0, 36.0, 30.0][rUlt] * (ctx.ultCdrMult || cdrMult);
      hero.rChargeDur = KitFx.tal(ctx, 3, 'L') ? STEADY_AIM_DUR : HEARTSEEKER.chargeDur; // 3L Steady Aim
      hero.rChargeTimer = hero.rChargeDur;
      hero.rCastId = KitFx.castId(); // the Heartseeker fires later (full charge or recast)
      hero.rSt = st;
      SFX.play('chime');
      spawnFloat(hero.x, 2.55, hero.z, 'CHARGING HEARTSEEKER!', '#fb7185');
    }
    return;
  },

  // Runs every frame for every hero kit: E grenade release after its windup, R Heartseeker charge + laser sight
  tickTimers(dt, now) {
    this.tickActor(KitFx.player, dt, now);
  },

  // Per-caster timers (the engine calls this for Coyote bots every frame)
  tickActor(actor, dt, now) {
    const hero = actor.unit;
    const pg = getPendingGrenade(actor);
    if (pg) {
      if (!actor.isPlayer && (hero.stunTimer || 0) > 0) {
        setPendingGrenade(actor, null); // stunned bots lose their windup, like their old scheduled hits
      } else {
        pg.t -= dt;
        if (pg.t <= 0) {
          setPendingGrenade(actor, null);
          launchShrapnelGrenade(actor, pg.tx, pg.tz, pg.castId, pg.st, pg.bonusBleed);
        }
      }
    }
    if (!actor.isPlayer) {
      // (the player's anim timers tick in loop.js; a bot's tick here)
      hero.grenadeAnim = Math.max(0, (hero.grenadeAnim || 0) - dt);
      hero.punchAnim = Math.max(0, (hero.punchAnim || 0) - dt);
      // bots: charge toward the aim, release at full charge (the engine draws their laser and cancels on stun)
      if (hero.rChargeTimer > 0) {
        hero.rChargeTimer -= dt;
        const a = actor.aim();
        hero.facing = Math.atan2(a.x - hero.x, a.z - hero.z);
        if (hero.rChargeTimer <= 0) fireHeartseekerRelease(actor);
      }
      return;
    }

    // Coyote R 2.0s Self-Slowed Laser-Sight Charge
    if (hero.rChargeTimer > 0) {
      hero.rChargeTimer -= dt;
      hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
      laserSightMesh.visible = true;
      laserSightMesh.position.set(hero.x + Math.sin(hero.facing) * 0.55, 0.09, hero.z + Math.cos(hero.facing) * 0.55);
      // Plane points along local +Y; after rotation.x = -PI/2 that's (-sin z, 0, -cos z), so z = facing + PI aims it at (sin f, cos f)
      laserSightMesh.rotation.z = hero.facing + Math.PI;
      const chargePct = 1 - (hero.rChargeTimer / (hero.rChargeDur || HEARTSEEKER.chargeDur));
      laserSightMesh.scale.x = 0.7 + chargePct * 1.6;
      // enemies can't see the laser while she's unseen: show that by dimming it
      laserSightMesh.material.opacity = hero.isUnseen ? 0.25 : 0.65;
      muzzleOrb.visible = true;
      muzzleOrb.scale.setScalar(0.6 + chargePct * 1.1 + Math.sin(now * 0.03) * 0.15);
      if (hero.rChargeTimer <= 0) {
        fireHeartseekerRelease(actor);
      }
    } else {
      laserSightMesh.visible = false;
      muzzleOrb.visible = false;
    }
  },

  // Runs every frame for every hero kit: arcing E grenades (bullseye 2x + Bleed)
  updateWorld(dt, ctx) {
    const { st, pProg } = ctx;
    updateTraps(dt);
    // Update Coyote Arcing 3D Shrapnel Grenades
    for (let i = heroGrenades.length - 1; i >= 0; i--) {
      const g = heroGrenades[i];
      g.t += dt;
      const u = Math.min(1, g.t / g.dur);
      const gx = g.sx + (g.tx - g.sx) * u;
      const gz = g.sz + (g.tz - g.sz) * u;
      const gy = (1 - u) * 1.45 + Math.sin(u * Math.PI) * 2.85;
      g.mesh.position.set(gx, gy, gz);
      g.mesh.rotation.x += dt * 14;
      g.mesh.rotation.z += dt * 10;

      if (u >= 1 && g.owner) {
        // a bot's grenade: same numbers, from that bot's level/stats, hitting that bot's enemies
        const o = g.owner;
        SFX.play('arena');
        spawnShockRing(g.tx, g.tz, 0xf59e0b, 0.3, g.outerR, 0.32);
        spawnShockRing(g.tx, g.tz, 0xf43f5e, 0.15, g.bullseyeR, 0.24);
        const ost = g.st || o.stats(), otal = o.talents();
        const oRank = KitFx.rQE(o.level());
        const outerDmg = H.coyote.dmg.grenadeOuter(ost, o.level(), oRank);
        o.hostiles().forEach((t) => {
          if (t.kind === 'structure') return;
          const realDist = Math.hypot(t.x - g.tx, t.z - g.tz);
          if (realDist <= g.bullseyeR + t.r * 0.45) o.damage(t, outerDmg * 2, { bleedAdd: (GRENADE.bleedBull + g.bonusBleed), slowDur: GRENADE.slowDur, slowPct: GRENADE.slowBull, color: '#fde047', castId: g.castId });
          else if (realDist <= g.outerR + t.r) o.damage(t, outerDmg, { bleedAdd: (GRENADE.bleedOuter + g.bonusBleed), slowDur: GRENADE.slowDur, slowPct: GRENADE.slowOuter, castId: g.castId });
        });
        scene.remove(g.mesh);
        scene.remove(g.teleGrp);
        heroGrenades.splice(i, 1);
      } else if (u >= 1) {
        SFX.play('arena');
        spawnShockRing(g.tx, g.tz, 0xf59e0b, 0.3, g.outerR, 0.32);
        spawnShockRing(g.tx, g.tz, 0xf43f5e, 0.15, g.bullseyeR, 0.24);
        const rQE = (pProg.level || 1) >= 9 ? 2 : ((pProg.level || 1) >= 6 ? 1 : 0);
        const outerDmg = H.coyote.dmg.grenadeOuter(g.st || st, pProg.level || 1, rQE);
        const bullDmg = outerDmg * 2;
        dummies.forEach((d) => {
          if (d.isShooter && !shooterEnabled) return;
          const dist = Math.hypot(d.x - g.tx, d.z - g.tz);
          if (dist <= g.bullseyeR + d.r * 0.45) {
            damageDummy(d, bullDmg, '#fde047');
            applyBleedStacks(d, (GRENADE.bleedBull + g.bonusBleed));
            CC.slow(d, GRENADE.slowDur, GRENADE.slowBull);
            spawnFloat(d.x, 2.8, d.z, 'BULLSEYE 2X!', '#fde047');
          } else if (dist <= g.outerR + d.r) {
            damageDummy(d, outerDmg);
            applyBleedStacks(d, (GRENADE.bleedOuter + g.bonusBleed));
            CC.slow(d, GRENADE.slowDur, GRENADE.slowOuter);
          }
        });

        if (phase1Engine) {
          phase1Engine.getHostileTargets().forEach((t) => {
            if (t.kind === 'structure') return;
            const realDist = Math.hypot(t.x - g.tx, t.z - g.tz);
            if (realDist <= g.bullseyeR + t.r * 0.45) {
              const didHit = phase1Engine.dealPlayerDamageToUnit(t, bullDmg, { bleedAdd: (GRENADE.bleedBull + g.bonusBleed), slowDur: GRENADE.slowDur, slowPct: GRENADE.slowBull, color: '#fde047', castId: g.castId });
              if (didHit) spawnFloat(t.x, 2.8, t.z, 'BULLSEYE 2X!', '#fde047');
            } else if (realDist <= g.outerR + t.r) {
              phase1Engine.dealPlayerDamageToUnit(t, outerDmg, { bleedAdd: (GRENADE.bleedOuter + g.bonusBleed), slowDur: GRENADE.slowDur, slowPct: GRENADE.slowOuter, castId: g.castId });
            }
          });
        }

        scene.remove(g.mesh);
        scene.remove(g.teleGrp);
        heroGrenades.splice(i, 1);
      }
    }
  },

  // the test tools clear leftovers between rows
  clearState() { this.onSwitchedAway(); },

  // switching heroes (and the test tools) clear the player's traps
  onSwitchedAway() {
    for (let i = traps.length - 1; i >= 0; i--) if (!traps[i].owner) removeTrap(i);
  },

  // Stop the Toss Grenade clip cleanly at 2.25s so it never loops back toward frame 0
  releaseOneShotClips() {
    if (actions.kick && activeAction === actions.kick && actions.kick.time >= 2.25) {
      oneShotActive = false;
      if (actions.idle) fadeToAction(actions.idle, 0.14, false, 1.0);
    }
  },

  // Crossbow follows his hands (swaps to the left hand + shows the grenade during E); returns true when handled
  updateHandProps() {
    if (!(currentModel && rightHandBone && leftHandBone)) return false;
    currentModel.updateMatrixWorld(true);
    rightHandBone.getWorldPosition(rhWorld);
    leftHandBone.getWorldPosition(lhWorld);

    const fwdX = Math.sin(heroPivot.rotation.y);
    const fwdZ = Math.cos(heroPivot.rotation.y);

    if (hero.grenadeAnim > 0) {
      crossbowPivot.position.copy(lhWorld);
      bowAimTarget.set(lhWorld.x + fwdX * 0.85, lhWorld.y - 0.22, lhWorld.z + fwdZ * 0.85);
      crossbowPivot.up.set(0, 1, 0);
      crossbowPivot.lookAt(bowAimTarget);

      handGrenadeMesh.visible = !!pendingGrenadeThrow;
      handGrenadeMesh.position.copy(rhWorld);
    } else {
      handGrenadeMesh.visible = false;
      crossbowPivot.position.copy(rhWorld);
      const handDx = lhWorld.x - rhWorld.x;
      const handDz = lhWorld.z - rhWorld.z;
      const handLen = Math.hypot(handDx, handDz) || 0.01;
      const dirX = (handDx / handLen) * 0.35 + fwdX * 0.65;
      const dirZ = (handDz / handLen) * 0.35 + fwdZ * 0.65;
      const dirY = THREE.MathUtils.clamp(lhWorld.y - rhWorld.y, -0.08, 0.08);
      bowAimTarget.set(rhWorld.x + dirX, rhWorld.y + dirY, rhWorld.z + dirZ);
      crossbowPivot.up.set(0, 1, 0);
      crossbowPivot.lookAt(bowAimTarget);
    }
    return true;
  }
};
})();
