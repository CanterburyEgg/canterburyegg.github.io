// Cannon Imp: Solo • Siege engineer + tinkerer pest. See DESIGN_RULES.md.
// First playable pass: real model + clips + cannon & wrench props, stand-in versions of the designed kit:
//  - Carrying: Box Idle arms (also layered over the run), cannon shots with code recoil.
//  - Q plants the cannon as a turret that shoots nearby enemies (no turret HP/scrap yet); Q near it picks it up.
//  - Unburdened: +22% move speed, wrench swings.
//  - E: rocket jump while carrying (frozen pose, cannon blasting downward) or a short hop while unburdened.
//  - R Superball: giant piercing cannonball from wherever the cannon is, knock-up (stun) on hit.
// Talents are placeholders until the talent pass.
(function () {
'use strict';
const H = (window.MOBA_HEROES = window.MOBA_HEROES || {});

const CARRY_SIZE = 0.9;    // bare barrel length while carried
const TURRET_SIZE = 1.3;   // full cannon (with carriage) when planted
const WRENCH_SIZE = 0.34;
const WRENCH_GRIP = 0.05;  // grip point this far up from the handle end
const WRENCH_OFF = { f: 0, s: 0, n: 0.01 };
const WRENCH_TWIST = 0;
let cannonCarry = null, cannonTurret = null, wrench = null, propsLoading = false;
let turret = null;         // { x, z, facing, shootCd, hp, maxHp, armor, r, team, plantedAt } (also an engine deployable)
let scrap = null;          // { x, z, mesh } wreck left when the turret is destroyed; salvage it (Q) or return to base
let turretPlate = null;    // overhead HP bar
const PICKUP_LOCKOUT = 1.5;
let superball = null;      // { mesh, x, z, ang, dist, hit:Set, dmg }
let recoil = 0;            // 0..1 kick amount, decays
let pendingQ = null;       // { t, kind: 'plant'|'pickup' }
let rocketPuff = 0, PUFF_GEO = null;
const puffs = [];          // rocket-jump exhaust

const UPPER_BODY = /^(Spine|Spine1|Spine2|Neck|Head|LeftShoulder|LeftArm|LeftForeArm|LeftHand|RightShoulder|RightArm|RightForeArm|RightHand)$/;

function carrying() { return !turret && !scrap; }

function turretMaxHp() {
  const lvl = phase1Engine ? (phase1Engine.getPlayerProg().level || 1) : 1;
  return 520 + lvl * 70;
}

function destroyTurret() {
  if (!turret) return;
  const t = turret;
  turret = null;
  smoke(t.x, t.z, 2.6);
  spawnShockRing(t.x, t.z, 0xfb923c, 0.3, 2.4, 0.4);
  SFX.play('arena');
  spawnFloat(t.x, 2.6, t.z, 'TURRET DESTROYED! SALVAGE THE SCRAP', '#fb923c');
  scrap = { x: t.x, z: t.z, mesh: makeScrapMesh(t.x, t.z) };
}

// a little heap of wreckage: bent plates + the barrel's cap
function makeScrapMesh(x, z) {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.6, roughness: 0.5 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9a7b3c, metalness: 0.6, roughness: 0.45 });
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(i % 3 === 0 ? new THREE.CylinderGeometry(0.12, 0.14, 0.5, 8) : new THREE.BoxGeometry(0.4 + (i % 2) * 0.2, 0.08, 0.3), i % 4 === 0 ? brass : iron);
    m.position.set(Math.sin(i * 2.4) * 0.45, 0.06 + (i % 3) * 0.07, Math.cos(i * 2.4) * 0.45);
    m.rotation.set(i * 0.6, i * 1.1, i * 0.35);
    m.castShadow = true;
    g.add(m);
  }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 14), new THREE.MeshStandardMaterial({ color: 0x5b3d24, roughness: 0.9 }));
  wheel.rotation.x = Math.PI / 2 - 0.3;
  wheel.position.set(0.2, 0.08, -0.1);
  g.add(wheel);
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}

function cannonball(r) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6, roughness: 0.4 }));
}

// One turret step for any owner: turn toward the nearest enemy in range and fire (player turrets also shoot dummies)
function stepTurret(t, dt, actor) {
  t.shootCd -= dt;
  let best = null, bestD = 8.5;
  if (actor.isPlayer) dummies.forEach((d) => {
    if (d.isShooter && !shooterEnabled) return;
    const dd = Math.hypot(d.x - t.x, d.z - t.z);
    if (dd < bestD) { bestD = dd; best = d; }
  });
  if (phase1Engine) {
    actor.hostiles().forEach((h) => {
      if (h.kind === 'structure') return;
      const dd = Math.hypot(h.x - t.x, h.z - t.z);
      if (dd < bestD) { bestD = dd; best = h; }
    });
  }
  if (best) {
    const want = Math.atan2(best.x - t.x, best.z - t.z);
    let df = want - t.facing;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    t.facing += Math.max(-dt * 6, Math.min(dt * 6, df));
    if (t.shootCd <= 0 && Math.abs(df) < 0.25) {
      t.shootCd = 1.4;
      t.kick = 1;
      const st = actor.stats();
      const fx = t.x + Math.sin(t.facing) * 1.3, fz = t.z + Math.cos(t.facing) * 1.3;
      smoke(fx, fz, 0.9);
      SFX.play('arena');
      KitFx.spawnBolt(t.facing, H.imp.dmg.turretShot(st), { mesh: cannonball(0.22), speed: 15, life: 0.75, y: 1.1, fromX: fx, fromZ: fz, by: actor });
    }
  }
  t.kick = Math.max(0, (t.kick || 0) - dt * 5);
}

// One Superball step for any caster; returns true when it's done
function stepBall(b, dt, actor) {
  const step = 17 * dt;
  b.x += Math.sin(b.ang) * step;
  b.z += Math.cos(b.ang) * step;
  b.dist += step;
  b.mesh.position.set(b.x, 1.0, b.z);
  b.mesh.rotation.x += dt * 10;
  if (actor.isPlayer) dummies.forEach((d) => {
    if (d.isShooter && !shooterEnabled) return;
    if (!b.hit.has('d' + d.id) && Math.hypot(d.x - b.x, d.z - b.z) <= 1.1 + d.r) {
      b.hit.add('d' + d.id);
      damageDummy(d, b.dmg, '#fb923c');
      d.stunTimer = Math.max(d.stunTimer, 1.0);
      spawnFloat(d.x, 2.8, d.z, 'KNOCKED UP!', '#fb923c');
    }
  });
  if (phase1Engine) {
    actor.hostiles().forEach((t, j) => {
      if (t.kind === 'structure') return;
      const key = t.kind + (t.ref && t.ref.id || j);
      if (!b.hit.has(key) && Math.hypot(t.x - b.x, t.z - b.z) <= 1.1 + (t.r || 0.5)) {
        b.hit.add(key);
        actor.damage(t, b.dmg, { dmgType: 'physical', stunDur: 1.0, color: '#fb923c' });
      }
    });
  }
  if (b.dist > 26) {
    scene.remove(b.mesh);
    return true;
  }
  return false;
}

function makeSuperballMesh() {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14), new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.7, roughness: 0.35, emissive: 0x7c2d12, emissiveIntensity: 0.4 }));
  scene.add(mesh);
  return mesh;
}

// ---- Bot Imps (Phase 2): state lives on the bot unit (impTurret, impScrap, impPendingQ, impRecoil, impRocket)
const botBalls = [];        // bots' superballs ({ ...ball, owner })
const botTurrets = [];      // bots' planted turrets (also engine deployables, with the bot's team)
let botTpl = null, botTplLoading = false; // { barrel, turret, wrench } prop templates cloned per bot
function botCarrying(u) { return !u.impTurret && !u.impScrap; }

function makeTurretPlate(team) {
  const p = document.createElement('div');
  p.className = 'plate-3d';
  p.style.zIndex = '14';
  const col = team === 0 ? 'rgba(56,189,248,0.6)' : 'rgba(244,63,94,0.6)';
  p.innerHTML = '<div class="plate-tag" style="background:rgba(15,23,42,0.82);border:1px solid ' + col + ';padding:1px 5px;border-radius:3px;color:#fed7aa;">Turret</div><div class="plate-bar" style="width:56px;"><div class="plate-hp ' + (team === 0 ? 'ally' : 'enemy') + '"></div><div class="plate-sh"></div></div>';
  labelLayer.appendChild(p);
  return p;
}

function botRemoveTurret(u) {
  const t = u.impTurret;
  if (!t) return;
  u.impTurret = null;
  if (phase1Engine && phase1Engine.removeDeployable) phase1Engine.removeDeployable(t);
  const i = botTurrets.indexOf(t);
  if (i >= 0) botTurrets.splice(i, 1);
  if (t.mesh) scene.remove(t.mesh);
  if (t.plate) t.plate.remove();
}

function botClearScrap(u) {
  if (!u.impScrap) return;
  scene.remove(u.impScrap.mesh);
  u.impScrap = null;
}

function botTurretDestroyed(u) {
  const t = u.impTurret;
  if (!t) return;
  botRemoveTurret(u);
  smoke(t.x, t.z, 2.6);
  spawnShockRing(t.x, t.z, 0xfb923c, 0.3, 2.4, 0.4);
  SFX.play('arena');
  spawnFloat(t.x, 2.6, t.z, 'TURRET DESTROYED!', '#fb923c');
  u.impScrap = { x: t.x, z: t.z, mesh: makeScrapMesh(t.x, t.z) };
}

function clearScrap(msg) {
  if (!scrap) return;
  scene.remove(scrap.mesh);
  scrap = null;
  if (msg) spawnFloat(hero.x, 2.6, hero.z, msg, '#fb923c');
}

function smoke(x, z, r) {
  spawnShockRing(x, z, 0xd6d3d1, 0.3, r, 0.45);
  spawnShockRing(x, z, 0x78716c, 0.2, r * 0.6, 0.35);
}

function stats() {
  return phase1Engine ? phase1Engine.getPlayerStats() : { atk: 55, fant: 0, asPct: 0 };
}

H.imp = {
  id: 'imp',
  roster: { order: 8, emoji: '💣', short: 'Imp' },
  bundle: { label: 'Cannon Imp', src: 'assets/imp/imp_bundle.js', globalKey: 'IMP_MIXAMO', pStart: 75, pEnd: 88 },
  bundleClips: { idle: 'idleFbxB64', run: 'runFreeFbxB64', idleFree: 'idleFreeFbxB64', runFree: 'runFbxB64', punch: 'punchFbxB64', kick: 'kickFbxB64', jump: 'jumpFbxB64' },
  moveSpeed: 5.9,
  hudSpeed: 322,
  pillLabels: { punch: 'Wrench', kick: 'Lift', dash: 'Jump', dashReady: () => true },
  // While carrying, his run keeps Box Idle's arms (cradling the cannon)
  // While carrying, his run keeps Box Idle's arms (cradling the cannon). The unburdened hop plays the Jumping clip as-is
  // (its upward Hips hop is clamped since the code arc already lifts him).
  clipTweaks: {
    jumpClampHips: true,
    overlay: { run: { from: 'idle', bones: UPPER_BODY } }
  },

  // All of the Imp's damage numbers in one place. Cannon shots, wrench swings and turret shots (they count as his basic
  // attacks) are Attack damage; Superball is Ability damage.
  dmg: {
    cannon: (st) => Math.round(st.attack * 1.5),
    wrench: (st) => Math.round(st.attack * 1.2),
    turretShot: (st) => Math.round(20 + st.attack * 1.1),
    superball: (st, lvl, rUlt) => Math.round([260, 390, 520][rUlt] + 8 * ((lvl || 1) - 1) + st.ability * 1.2)
  },

  spec: {
    id: 'imp',
    name: 'Cannon Imp',
    role: 'Solo • Siege & Salvage Pest',
    glyph: 'K',
    color: '#fb923c',
    height: 1.35,
    baseHp: 1340, hpGrow: 110,
    baseMp: 310, mpGrow: 26, mpRegen: 5.0,
    // Stat model (DESIGN_RULES §2): Attack-leaning siege carry (~160 / 285 / 558 dps budget, no items)
    baseAttack: 80, attackGrow: 13.0,
    baseAbility: 15, abilityGrow: 2.5,
    baseResist: 20, resistGrow: 2.5,
    asGrow: 0.03,
    baseSpd: 5.9,
    atkCd: 1.05,
    mpCosts: { Q: 20, E: 50, R: 85 }
  },

  talents: {
    3: { L: { id: '3L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '3R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } },
    7: { L: { id: '7L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '7R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } },
    10: { L: { id: '10L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '10R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } }
  },

  ui: {
    height: 1.35,
    modelLabel: 'Cannon Imp (Mixamo Rigged)',
    glyph: 'K',
    color: '#fb923c',
    name: 'Cannon Imp (3D)',
    role: 'Solo • Siege & Salvage Pest',
    passive: 'Two Forms',
    lmb: 'Siege Shot / Wrench',
    q: 'Anchor Turret',
    e: 'Blast Hop',
    r: 'Superball',
    banner: '<b>Q</b> Plant / pick up the cannon &bull; <b>E</b> Rocket jump (carrying) or hop &bull; <b>R</b> Superball &bull; <b>P</b> Shop',
    tooltips: {
      P: { title: 'Passive • Two Forms', meta: 'Carrying vs. Unburdened', body: 'Carrying: slow, long-range cannon shots. Unburdened: <b>+22% move speed</b> and fast wrench swings. <b>Wrench hits repair your turret.</b>' },
      LMB: { title: 'LMB • Siege Shot / Wrench', meta: '0 MP • 1.05s Base ATK', body: 'Carrying: fire a cannonball for <b>Attack damage</b>. Unburdened: a quick wrench swing.' },
      Q: { title: 'Q • Anchor Turret', meta: '20 MP • 3s CD', body: 'Plant the cannon as a <b>turret</b> with its own HP that fires at nearby enemies. Press Q next to it to pick it back up (after 1.5s). If it is destroyed it leaves <b>scrap</b>: Q on it to salvage, or head home for a fresh cannon.' },
      E: { title: 'E • Blast Hop', meta: '50 MP • 8.5s CD', body: 'Carrying: the cannon blasts downward for a <b>long rocket jump</b>. Unburdened: a <b>short nimble hop</b>.' },
      R: { title: 'R • Superball', meta: '85 MP • 38s CD (Lv 4)', body: 'Fire a giant cannonball <b>from wherever the cannon is</b> (hands or turret). It pierces and <b>knocks up</b> everything it hits for 1.0s.' }
    }
  },

  parseBundle(bundle, tmpl) {
    return parseMixamoBundle(bundle, tmpl, H.imp.bundleClips);
  },

  locomotion() {
    return carrying() ? null : { idle: 'idleFree', move: 'runFree' };
  },
  speedMult() {
    return carrying() ? 1 : 1.22;
  },

  onBasicAttack(st) {
    hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
    if (carrying()) {
      hero.atkTimer = H.imp.spec.atkCd / (1 + st.asPct);
      hero.punchAnim = 0.25;
      recoil = 1;
      SFX.play('arena');
      const ang = hero.facing;
      const fx = hero.x + Math.sin(ang) * 0.9, fz = hero.z + Math.cos(ang) * 0.9;
      smoke(fx, fz, 0.9);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6, roughness: 0.4 }));
      KitFx.spawnBolt(ang, H.imp.dmg.cannon(st), { mesh: ball, speed: 15, life: 0.75, y: 1.0, fromX: fx, fromZ: fz });
    } else {
      hero.atkTimer = 0.7 / (1 + st.asPct);
      hero.punchAnim = 0.3;
      if (actions.punch) fadeToAction(actions.punch, 0.05, true, 2.2, 0.35);
      pendingStrike = { isKick: false, facing: hero.facing, t: 0.15 };
    }
  },

  onStrikeImpact(strike, ctx) {
    KitFx.hitCone(2.0, 0.8, H.imp.dmg.wrench(ctx.st), { isBasic: true, color: '#fb923c' });
    // Tinkerer: wrench hits on his own turret repair it
    if (turret && turret.hp < turret.maxHp) {
      const dx = turret.x - hero.x, dz = turret.z - hero.z, d = Math.hypot(dx, dz);
      const inFront = d < 0.8 || (dx * Math.sin(hero.facing) + dz * Math.cos(hero.facing)) / d > Math.cos(0.9);
      if (d <= 2.0 + turret.r && inFront) {
        const heal = Math.round(turret.maxHp * 0.12);
        turret.hp = Math.min(turret.maxHp, turret.hp + heal);
        spawnFloat(turret.x, 2.2, turret.z, '+' + heal + ' REPAIRED', '#4ade80');
        spawnShockRing(turret.x, turret.z, 0x4ade80, 0.3, 1.3, 0.25);
      }
    }
  },

  cast(slot, ctx) {
    const { st, cdrMult, pProg } = ctx;
    if (slot === 'Q') {
      if (!wtfMode && hero.cdQ > 0) return;
      if (pendingQ) return;
      // Lifting Object (8.3s): squats 0.6-1.75s, heaves up to ~3.0s, holds, sets down at ~5.5s, stands by ~6.75s
      const lift = actions.kick;
      if (carrying()) {
        if (!trySpendMana('Q')) return;
        hero.cdQ = wtfMode ? 0.3 : 3.0 * cdrMult;
        hero.kickAnim = 0.8;
        if (lift) fadeToAction(lift, 0.06, true, 2.6, 4.6); // set-down phase: touches the ground at clip 5.5s -> ~0.35s
        pendingQ = { t: 0.35, kind: 'plant', x: hero.x + Math.sin(hero.facing) * 1.6, z: hero.z + Math.cos(hero.facing) * 1.6, facing: hero.facing };
      } else if (scrap) {
        if (Math.hypot(hero.x - scrap.x, hero.z - scrap.z) > 2.0) {
          spawnFloat(hero.x, 2.6, hero.z, 'SALVAGE YOUR SCRAP (OR GO HOME)!', '#fb923c');
          return;
        }
        hero.cdQ = wtfMode ? 0.3 : 1.5;
        hero.facing = Math.atan2(scrap.x - hero.x, scrap.z - hero.z);
        hero.kickAnim = 0.75;
        if (lift) fadeToAction(lift, 0.06, true, 3.2, 0.7);
        pendingQ = { t: 0.72, kind: 'salvage' };
      } else {
        if (Math.hypot(hero.x - turret.x, hero.z - turret.z) > 2.0) {
          spawnFloat(hero.x, 2.6, hero.z, 'WALK BACK TO YOUR CANNON!', '#fb923c');
          return;
        }
        if (!wtfMode && performance.now() / 1000 - turret.plantedAt < PICKUP_LOCKOUT) {
          spawnFloat(hero.x, 2.6, hero.z, 'STILL SETTLING...', '#fb923c');
          return;
        }
        hero.cdQ = wtfMode ? 0.3 : 1.5;
        hero.facing = Math.atan2(turret.x - hero.x, turret.z - hero.z);
        hero.kickAnim = 0.75;
        if (lift) fadeToAction(lift, 0.06, true, 3.2, 0.7); // squat + heave: lifted at clip 3.0s -> ~0.72s
        pendingQ = { t: 0.72, kind: 'pickup' };
      }
    } else if (slot === 'E') {
      if (!wtfMode && hero.cdE > 0) return;
      if (!trySpendMana('E')) return;
      hero.cdE = wtfMode ? 0.4 : 8.5 * cdrMult;
      const longJump = carrying();
      const maxD = longJump ? 9.0 : 4.5;
      const dx = aimWorld.x - hero.x, dz = aimWorld.z - hero.z;
      const d = Math.min(maxD, Math.hypot(dx, dz) || 0.01);
      const ang = Math.atan2(dx, dz);
      hero.facing = ang;
      hero.leapSx = hero.x; hero.leapSz = hero.z;
      hero.leapTx = hero.x + Math.sin(ang) * d;
      hero.leapTz = hero.z + Math.cos(ang) * d;
      hero.leapDur = longJump ? 0.75 : 0.42;
      hero.leapHeight = longJump ? 3.2 : 0.9;
      hero.leapTimer = hero.leapDur;
      hero.impRocket = longJump;
      if (longJump) {
        smoke(hero.x, hero.z, 2.2);
        SFX.play('arena');
        if (actions.idle) fadeToAction(actions.idle, 0.05, false, 0); // frozen carry pose in the air (barrel aimed down)
      } else {
        SFX.play('dash');
        if (actions.jump) fadeToAction(actions.jump, 0.05, true, 1.67, 0.3);
      }
    } else if (slot === 'R') {
      if (!wtfMode && pProg.level < 4) {
        spawnFloat(hero.x, 2.6, hero.z, 'ULTIMATE UNLOCKS AT LEVEL 4!', '#fb7185');
        return;
      }
      if (!wtfMode && hero.cdR > 0) return;
      if (scrap) {
        spawnFloat(hero.x, 2.6, hero.z, 'YOUR CANNON IS SCRAP!', '#fb7185');
        return;
      }
      if (!trySpendMana('R')) return;
      hero.cdR = wtfMode ? 0.5 : 38 * cdrMult;
      const from = carrying() ? { x: hero.x, z: hero.z } : { x: turret.x, z: turret.z };
      const ang = Math.atan2(aimWorld.x - from.x, aimWorld.z - from.z);
      if (!carrying()) turret.facing = ang;
      else recoil = 1.6;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14), new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.7, roughness: 0.35, emissive: 0x7c2d12, emissiveIntensity: 0.4 }));
      scene.add(mesh);
      const rUlt = (pProg.level || 1) >= 12 ? 2 : ((pProg.level || 1) >= 8 ? 1 : 0);
      superball = { mesh, x: from.x + Math.sin(ang) * 1.2, z: from.z + Math.cos(ang) * 1.2, ang, dist: 0, hit: new Set(), dmg: H.imp.dmg.superball(st, pProg.level, rUlt) };
      smoke(superball.x, superball.z, 2.0);
      SFX.play('arena');
      spawnFloat(from.x, 3.0, from.z, 'SUPERBALL!', '#fb923c');
    }
  },

  // ---- Phase 2 actor entry points (the player keeps onBasicAttack / cast above)
  basicAttackFor(actor, st) {
    if (actor.isPlayer) return this.onBasicAttack(st);
    const u = actor.unit, a = actor.aim();
    u.facing = Math.atan2(a.x - u.x, a.z - u.z);
    const L = (window.__kitBotLog = window.__kitBotLog || {}); L.imp_lmb = (L.imp_lmb || 0) + 1;
    if (botCarrying(u)) {
      u.impRecoil = 1;
      SFX.play('arena');
      const fx = u.x + Math.sin(u.facing) * 0.9, fz = u.z + Math.cos(u.facing) * 0.9;
      smoke(fx, fz, 0.9);
      KitFx.spawnBolt(u.facing, H.imp.dmg.cannon(st), { mesh: cannonball(0.2), speed: 15, life: 0.75, y: 1.0, fromX: fx, fromZ: fz, by: actor });
    } else {
      u.atkCd = (u.atkCd || 0) * (0.7 / 1.05); // wrench swings faster than the cannon fires
      u.punchAnim = 0.3;
      actor.play('punch', 0.05, true, 2.2, 0.35, 0.3);
      u.impStrike = { t: 0.15, dmg: H.imp.dmg.wrench(st) };
    }
  },

  castFor(actor, slot, ctx) {
    if (!ctx) {
      const lvl = actor.level();
      ctx = { st: actor.stats(), pProg: { level: lvl }, talents: actor.talents(), cdrMult: 1 - (actor.stats().cdr || 0), rQE: KitFx.rQE(lvl), rUlt: KitFx.rUlt(lvl) };
    }
    if (actor.isPlayer) return this.cast(slot, ctx);
    return this.botCast(actor, slot, ctx);
  },

  // Bots: no mana; same timings as the player's casts
  botCast(actor, slot, ctx) {
    const { st, pProg } = ctx;
    const u = actor.unit;
    const a = actor.aim();
    const L = (window.__kitBotLog = window.__kitBotLog || {}); L['imp_' + slot] = (L['imp_' + slot] || 0) + 1;
    if (slot === 'Q') {
      if (u.cdQ > 0 || u.impPendingQ || !botCarrying(u)) return; // (pick-up / salvage are automatic, see tickActor)
      u.facing = Math.atan2(a.x - u.x, a.z - u.z);
      u.cdQ = 3.0 * (ctx.cdrMult || 1);
      u.kickAnim = 0.8;
      actor.play('kick', 0.06, true, 2.6, 4.6, 0.4);
      u.impPendingQ = { t: 0.35, kind: 'plant', x: u.x + Math.sin(u.facing) * 1.6, z: u.z + Math.cos(u.facing) * 1.6, facing: u.facing };
    } else if (slot === 'E') {
      if (u.cdE > 0 || u.leapTimer > 0) return;
      u.cdE = 8.5 * (ctx.cdrMult || 1);
      const longJump = botCarrying(u);
      const maxD = longJump ? 9.0 : 4.5;
      const dx = a.x - u.x, dz = a.z - u.z;
      const d = Math.min(maxD, Math.hypot(dx, dz) || 0.01);
      const ang = Math.atan2(dx, dz);
      u.facing = ang;
      u.leapSx = u.x; u.leapSz = u.z;
      u.leapTx = u.x + Math.sin(ang) * d;
      u.leapTz = u.z + Math.cos(ang) * d;
      u.leapDur = longJump ? 0.75 : 0.42;
      u.leapHeight = longJump ? 3.2 : 0.9;
      u.leapTimer = u.leapDur;
      u.impRocket = longJump;
      u.leapOnLand = () => {
        if (u.impRocket) { smoke(u.x, u.z, 2.4); SFX.play('arena'); }
        else spawnShockRing(u.x, u.z, 0xd6b470, 0.2, 1.0, 0.25);
        u.impRocket = false;
        u.leapHeight = undefined;
      };
      if (longJump) {
        smoke(u.x, u.z, 2.2);
        SFX.play('arena');
        actor.play('idle', 0.05, false, 0.001, 0, u.leapDur); // frozen carry pose in the air (barrel aimed down)
      } else {
        SFX.play('dash');
        actor.play('jump', 0.05, true, 1.67, 0.3, u.leapDur);
      }
    } else if (slot === 'R') {
      if ((pProg.level || 1) < 4 || u.cdR > 0 || u.impScrap) return;
      u.cdR = 38 * (ctx.cdrMult || 1);
      const t = u.impTurret;
      const from = t ? { x: t.x, z: t.z } : { x: u.x, z: u.z };
      const ang = Math.atan2(a.x - from.x, a.z - from.z);
      if (t) t.facing = ang;
      else { u.impRecoil = 1.6; u.facing = ang; }
      const b = {
        mesh: makeSuperballMesh(), x: from.x + Math.sin(ang) * 1.2, z: from.z + Math.cos(ang) * 1.2, ang, dist: 0, hit: new Set(),
        dmg: H.imp.dmg.superball(st, pProg.level, KitFx.rUlt(pProg.level || 1)), owner: actor
      };
      botBalls.push(b);
      smoke(b.x, b.z, 2.0);
      SFX.play('arena');
      spawnFloat(from.x, 3.0, from.z, 'SUPERBALL!', '#fb923c');
    }
  },

  tickActor(actor, dt) {
    if (actor.isPlayer) return;
    const u = actor.unit;
    u.kickAnim = Math.max(0, (u.kickAnim || 0) - dt);
    u.punchAnim = Math.max(0, (u.punchAnim || 0) - dt);
    u.impRecoil = Math.max(0, (u.impRecoil || 0) - dt * 6);
    u.range = botCarrying(u) && !u.impPendingQ ? 7.5 : 1.95; // cannon at range, wrench up close
    if ((u.stunTimer || 0) > 0) { u.impStrike = null; u.impPendingQ = null; }
    // back home (respawn / retreat): a fresh cannon from the workshop
    if (u.impScrap && Math.hypot(u.x - u.homeX, u.z - u.homeZ) < 9) botClearScrap(u);
    if (u.impStrike && (u.impStrike.t -= dt) <= 0) {
      const sk = u.impStrike;
      u.impStrike = null;
      KitFx.hitCone(2.0, 0.8, sk.dmg, { isBasic: true, color: '#fb923c', by: actor });
      // Tinkerer: wrench hits on his own turret repair it
      const t = u.impTurret;
      if (t && t.hp < t.maxHp && Math.hypot(t.x - u.x, t.z - u.z) <= 2.0 + t.r) {
        const heal = Math.round(t.maxHp * 0.12);
        t.hp = Math.min(t.maxHp, t.hp + heal);
        spawnFloat(t.x, 2.2, t.z, '+' + heal + ' REPAIRED', '#4ade80');
        spawnShockRing(t.x, t.z, 0x4ade80, 0.3, 1.3, 0.25);
      }
    }
    if (u.impPendingQ && (u.impPendingQ.t -= dt) <= 0) {
      const q = u.impPendingQ;
      u.impPendingQ = null;
      if (q.kind === 'plant') {
        const mhp = 520 + (u.level || 1) * 70;
        const t = {
          id: 'impturret_' + u.id, x: q.x, z: q.z, facing: q.facing, shootCd: 0.8, plantedAt: performance.now() / 1000,
          hp: mhp, maxHp: mhp, armor: 25, r: 0.9, team: u.team, owner: actor,
          onDestroyed: () => botTurretDestroyed(u)
        };
        u.impTurret = t;
        botTurrets.push(t);
        if (phase1Engine && phase1Engine.addDeployable) phase1Engine.addDeployable(t);
        smoke(q.x, q.z, 2.2);
        SFX.play('block');
      } else if (q.kind === 'salvage') {
        if (u.impScrap) smoke(u.impScrap.x, u.impScrap.z, 1.4);
        botClearScrap(u);
        SFX.play('block');
      } else if (u.impTurret) {
        smoke(u.impTurret.x, u.impTurret.z, 1.4);
        botRemoveTurret(u);
        SFX.play('block');
      }
    }
    // Pick the cannon back up / salvage the scrap when standing at it and the fight there is over (or when fleeing past it)
    u.impThink = (u.impThink || 0) - dt;
    if (u.impThink <= 0 && !u.impPendingQ && u.cdQ <= 0 && u.leapTimer <= 0 && (u.stunTimer || 0) <= 0) {
      u.impThink = 0.4;
      const spot = u.impTurret || u.impScrap;
      if (spot && Math.hypot(spot.x - u.x, spot.z - u.z) <= 2.2) {
        const settled = !u.impTurret || performance.now() / 1000 - u.impTurret.plantedAt >= PICKUP_LOCKOUT;
        const quiet = !actor.hostiles().some((h) => h.kind !== 'structure' && Math.hypot(h.x - spot.x, h.z - spot.z) <= 9);
        const fleeing = u.hp / u.maxHp < 0.3;
        if (settled && (quiet || fleeing)) {
          u.cdQ = 1.5;
          u.facing = Math.atan2(spot.x - u.x, spot.z - u.z);
          u.kickAnim = 0.75;
          actor.play('kick', 0.06, true, 3.2, 0.7, 0.75);
          u.impPendingQ = { t: 0.72, kind: u.impTurret ? 'pickup' : 'salvage' };
        }
      }
    }
  },

  // Bots: +22% unburdened (the engine multiplies bot speed by this)
  botSpeedMult(b) { return botCarrying(b) ? 1 : 1.22; },
  // Bots: carry idle/run with the cannon, the free set without it
  botLocomotion(b) { return botCarrying(b) ? null : { idle: 'idleFree', move: 'runFree' }; },
  // Bots with nothing to fight walk back to their turret (to pick it up) or nearby scrap (to salvage it)
  botGoal(b) {
    if (b.impTurret) return { x: b.impTurret.x, z: b.impTurret.z };
    if (b.impScrap && Math.hypot(b.impScrap.x - b.x, b.impScrap.z - b.z) < 16) return { x: b.impScrap.x, z: b.impScrap.z };
    return null;
  },
  // Bots: Superball when it lines up 2+ enemy heroes from wherever the cannon is, or finishes a weak one
  botWantsSuperball(b, actor, target) {
    const src = b.impTurret || b;
    const tx = target.ref.x - src.x, tz = target.ref.z - src.z, len = Math.hypot(tx, tz);
    if (len > 18 || len < 0.5) return false;
    if (target.ref.hp / target.ref.maxHp < 0.45) return true;
    const ux = tx / len, uz = tz / len;
    let n = 0;
    actor.hostiles().forEach((h) => {
      if (h.kind !== 'bot' && h.kind !== 'player') return;
      const px = h.x - src.x, pz = h.z - src.z, along = px * ux + pz * uz;
      if (along > 0 && along < 24 && Math.abs(px * uz - pz * ux) <= 1.1 + (h.r || 0.5)) n++;
    });
    return n >= 2;
  },

  // Bots: carried barrel at the chest (straight down in a rocket jump), wrench in a fist when unburdened
  botVisual(b) {
    const src = window.IMP_MIXAMO;
    if (!botTpl && !botTplLoading && src) {
      botTplLoading = true;
      Promise.all([
        KitFx.loadPropGlb(src.barrelGlbB64 || src.cannonGlbB64, CARRY_SIZE),
        KitFx.loadPropGlb(src.cannonGlbB64, TURRET_SIZE),
        KitFx.loadPropGlb(src.wrenchGlbB64, WRENCH_SIZE)
      ]).then(([c1, c2, w]) => {
        if (w && w.children[0]) w.children[0].position.x -= WRENCH_SIZE * 0.5 - WRENCH_GRIP;
        botTpl = { barrel: c1, turret: c2, wrench: w };
      });
    }
    if (!botTpl || !b.bones) return;
    if (!b.impProps) {
      b.impProps = { barrel: botTpl.barrel && botTpl.barrel.clone(true), wrench: botTpl.wrench && botTpl.wrench.clone(true), puffT: 0 };
      if (b.impProps.barrel) scene.add(b.impProps.barrel);
      if (b.impProps.wrench) scene.add(b.impProps.wrench);
    }
    const P = b.impProps;
    b.model.updateMatrixWorld(true);
    const carryNow = botCarrying(b);
    const srcB = { bones: b.bones, yaw: b.facing || 0 };
    if (P.barrel) {
      P.barrel.visible = b.pivot.visible && carryNow && !(b.impPendingQ && b.impPendingQ.kind === 'plant' && b.impPendingQ.t < 0.15);
      if (P.barrel.visible) {
        if (b.impRocket && b.leapTimer > 0) {
          KitFx.placeAtBone(P.barrel, 'Spine2', { x: 0.02, y: -0.5, z: 0.22 }, { x: 0, y: Math.PI / 2, z: Math.PI / 2 - 0.12 }, srcB);
          P.puffT -= 1 / 60;
          if (P.puffT <= 0) {
            P.puffT = 0.07;
            const p = P.barrel.position;
            const puff = new THREE.Mesh(PUFF_GEO || (PUFF_GEO = new THREE.SphereGeometry(0.22, 8, 6)), new THREE.MeshBasicMaterial({ color: 0xd6d3d1, transparent: true, opacity: 0.6, depthWrite: false }));
            puff.position.set(p.x, p.y - 0.5, p.z);
            scene.add(puff);
            puffs.push({ m: puff, t: 0.5 });
          }
        } else {
          KitFx.placeAtBone(P.barrel, 'Spine2', { x: 0.04, y: -0.2, z: 0.46 - (b.impRecoil || 0) * 0.12 }, { x: 0, y: Math.PI / 2, z: -0.06 }, srcB);
        }
      }
    }
    const fist = !carryNow;
    KitFx.curlHand('Right', fist ? 1 : 0, b.bones);
    if (P.wrench) {
      P.wrench.visible = b.pivot.visible && fist;
      if (P.wrench.visible) KitFx.seatInFist(P.wrench, 'Right', WRENCH_OFF, WRENCH_TWIST, b.bones);
    }
    // body recoil: a quick shove back along his facing
    if ((b.impRecoil || 0) > 0) b.model.position.z -= b.impRecoil * 0.18;
  },

  botHide(b) {
    if (!b.impProps) return;
    if (b.impProps.barrel) b.impProps.barrel.visible = false;
    if (b.impProps.wrench) b.impProps.wrench.visible = false;
  },

  // bot is dead: the scrap goes (he respawns with a fresh cannon); a still-standing turret stays planted
  botDead(b) {
    if (b.impScrap) botClearScrap(b);
    b.impPendingQ = null;
    b.impStrike = null;
  },

  // the engine is respawning its bots (new match): drop this bot's turret, scrap and props
  botCleanup(b) {
    botRemoveTurret(b);
    botClearScrap(b);
    if (b.impProps) {
      if (b.impProps.barrel) scene.remove(b.impProps.barrel);
      if (b.impProps.wrench) scene.remove(b.impProps.wrench);
      b.impProps = null;
    }
  },

  onLeapLand() {
    if (hero.impRocket) {
      smoke(hero.x, hero.z, 2.4);
      SFX.play('arena');
    } else {
      spawnShockRing(hero.x, hero.z, 0xd6b470, 0.2, 1.0, 0.25);
    }
    hero.impRocket = false;
    hero.leapHeight = undefined;
  },

  tickTimers(dt) {
    recoil = Math.max(0, recoil - dt * 6);
    // dead or back at base (recall / respawn): the workshop hands him a fresh cannon
    if (scrap && activeHeroId === 'imp' && phase1Engine && phase1Engine.getPlayerProg().respawnTimer > 0) clearScrap();
    if (scrap && activeHeroId === 'imp' && window.MOBA_MAP) {
      const f = window.MOBA_MAP.BASE.fountain;
      if (Math.hypot(hero.x - f.x, hero.z - f.z) < 9) clearScrap('FRESH CANNON FROM THE WORKSHOP!');
    }
    if (pendingQ) {
      pendingQ.t -= dt;
      if (pendingQ.t <= 0) {
        const q = pendingQ;
        pendingQ = null;
        if (q.kind === 'plant') {
          const mhp = turretMaxHp();
          turret = {
            x: q.x, z: q.z, facing: q.facing, shootCd: 0.8, plantedAt: performance.now() / 1000, id: 'impturret_player',
            hp: mhp, maxHp: mhp, armor: 25, r: 0.9, team: 0,
            onDestroyed: () => destroyTurret()
          };
          if (phase1Engine && phase1Engine.addDeployable) phase1Engine.addDeployable(turret);
          smoke(q.x, q.z, 2.2);
          SFX.play('block');
        } else if (q.kind === 'salvage') {
          if (scrap) smoke(scrap.x, scrap.z, 1.4);
          clearScrap('CANNON SALVAGED!');
          SFX.play('block');
        } else if (turret) {
          smoke(turret.x, turret.z, 1.4);
          if (phase1Engine && phase1Engine.removeDeployable) phase1Engine.removeDeployable(turret);
          turret = null;
          SFX.play('block');
        }
      }
    }
  },

  updateWorld(dt) {
    // Turret: fire at the nearest enemy within range
    if (turret && activeHeroId === 'imp') stepTurret(turret, dt, KitFx.player);
    // Superball flight
    if (superball && stepBall(superball, dt, KitFx.player)) superball = null;
    // bots' turrets (fog-hidden for Chaos), scrap and superballs
    botTurrets.forEach((t) => {
      stepTurret(t, dt, t.owner);
      const vis = t.team === 0 || !phase1Engine || !phase1Engine.isVisibleToOrder || phase1Engine.isVisibleToOrder(t.x, t.z);
      if (!t.mesh && botTpl && botTpl.turret) { t.mesh = botTpl.turret.clone(true); scene.add(t.mesh); }
      if (t.mesh) {
        const kick = (t.kick || 0) * 0.15;
        t.mesh.visible = vis;
        t.mesh.position.set(t.x - Math.sin(t.facing) * kick, TURRET_SIZE * 0.36, t.z - Math.cos(t.facing) * kick);
        t.mesh.rotation.set(0, t.facing + Math.PI / 2, 0);
      }
      if (!t.plate) t.plate = makeTurretPlate(t.team);
      const sp = projectToScreen(t.x, 2.1, t.z);
      t.plate.style.display = vis && sp.visible ? 'flex' : 'none';
      t.plate.style.left = sp.x + 'px';
      t.plate.style.top = sp.y + 'px';
      t.plate.querySelector('.plate-hp').style.width = Math.max(0, t.hp / t.maxHp * 100) + '%';
    });
    for (let i = botBalls.length - 1; i >= 0; i--) {
      if (stepBall(botBalls[i], dt, botBalls[i].owner)) botBalls.splice(i, 1);
    }
    // rocket-jump exhaust puffs (player and bots)
    for (let i = puffs.length - 1; i >= 0; i--) {
      const pf = puffs[i];
      pf.t -= dt;
      pf.m.scale.setScalar(1 + (0.5 - pf.t) * 3);
      pf.m.material.opacity = Math.max(0, pf.t * 1.2);
      if (pf.t <= 0) { scene.remove(pf.m); pf.m.material.dispose(); puffs.splice(i, 1); }
    }
  },

  // Cannon (carried / planted) and wrench props
  updateHandProps() {
    if (!(currentModel && rightHandBone)) return false;
    const src = window.IMP_MIXAMO;
    if (!propsLoading && src) {
      propsLoading = true;
      Promise.all([
        KitFx.loadPropGlb(src.barrelGlbB64 || src.cannonGlbB64, CARRY_SIZE),
        KitFx.loadPropGlb(src.cannonGlbB64, TURRET_SIZE),
        KitFx.loadPropGlb(src.wrenchGlbB64, WRENCH_SIZE)
      ]).then(([c1, c2, w]) => {
        cannonCarry = c1; cannonTurret = c2; wrench = w;
        // grip point: slide the wrench so a spot just above its handle end (+X) sits at the holder origin
        if (w && w.children[0]) w.children[0].position.x -= WRENCH_SIZE * 0.5 - WRENCH_GRIP;
        [c1, c2, w].forEach((p) => p && scene.add(p));
      });
    }
    if (cannonCarry) {
      cannonCarry.visible = carrying() && !(pendingQ && pendingQ.kind === 'plant' && pendingQ.t < 0.15);
      if (cannonCarry.visible) {
        const kick = recoil * 0.12;
        // the bare barrel cradled across his chest, muzzle (-X) forward. Rocket jump: muzzle straight down under him,
        // breech at his chest. (Pitch is about the barrel's side axis = local Z; local X is the barrel's length.)
        if (hero.impRocket) {
          KitFx.placeAtBone(cannonCarry, 'Spine2', { x: 0.02, y: -0.5, z: 0.22 }, { x: 0, y: Math.PI / 2, z: Math.PI / 2 - 0.12 });
          rocketPuff -= 1 / 60;
          if (rocketPuff <= 0) {
            rocketPuff = 0.07;
            const p = cannonCarry.position;
            const puff = new THREE.Mesh(PUFF_GEO || (PUFF_GEO = new THREE.SphereGeometry(0.22, 8, 6)), new THREE.MeshBasicMaterial({ color: 0xd6d3d1, transparent: true, opacity: 0.6, depthWrite: false }));
            puff.position.set(p.x, p.y - 0.5, p.z);
            scene.add(puff);
            puffs.push({ m: puff, t: 0.5 });
          }
        } else {
          KitFx.placeAtBone(cannonCarry, 'Spine2', { x: 0.04, y: -0.2, z: 0.46 - kick }, { x: 0, y: Math.PI / 2, z: -0.06 });
        }
      }
    }
    if (cannonTurret) {
      cannonTurret.visible = !!turret && activeHeroId === 'imp';
      if (turret) {
        const kick = (turret.kick || 0) * 0.15;
        cannonTurret.position.set(turret.x - Math.sin(turret.facing) * kick, TURRET_SIZE * 0.36, turret.z - Math.cos(turret.facing) * kick);
        cannonTurret.rotation.set(0, turret.facing + Math.PI / 2, 0);
      }
    }
    // turret HP bar
    if (!turretPlate) {
      turretPlate = document.createElement('div');
      turretPlate.className = 'plate-3d';
      turretPlate.style.zIndex = '14';
      turretPlate.innerHTML = '<div class="plate-tag" style="background:rgba(15,23,42,0.82);border:1px solid rgba(251,146,60,0.6);padding:1px 5px;border-radius:3px;color:#fed7aa;">Turret</div><div class="plate-bar" style="width:56px;"><div class="plate-hp ally"></div><div class="plate-sh"></div></div>';
      labelLayer.appendChild(turretPlate);
    }
    if (turret && activeHeroId === 'imp') {
      const sp = projectToScreen(turret.x, 2.1, turret.z);
      turretPlate.style.display = sp.visible ? 'flex' : 'none';
      turretPlate.style.left = sp.x + 'px';
      turretPlate.style.top = sp.y + 'px';
      turretPlate.querySelector('.plate-hp').style.width = Math.max(0, turret.hp / turret.maxHp * 100) + '%';
    } else {
      turretPlate.style.display = 'none';
    }
    if (scrap) scrap.mesh.visible = activeHeroId === 'imp';
    // Unburdened: right hand balls into a fist around the wrench handle
    const fist = !carrying();
    KitFx.curlHand('Right', fist ? 1 : 0);
    if (wrench) {
      wrench.visible = fist;
      if (fist) KitFx.seatInFist(wrench, 'Right', WRENCH_OFF, WRENCH_TWIST);
    }
    // body recoil: a quick shove back along his facing
    if (recoil > 0) heroTiltNode.position.z -= recoil * 0.18;
    return true;
  },

  onSwitchedAway() {
    [cannonCarry, cannonTurret, wrench].forEach((p) => { if (p) p.visible = false; });
    if (turretPlate) turretPlate.style.display = 'none';
    if (turret && phase1Engine && phase1Engine.removeDeployable) phase1Engine.removeDeployable(turret);
    turret = null;
    clearScrap();
  },

  // Dev (&devturret=N in boot.js): blow up the planted turret to test scrap/salvage
  devDestroyTurret() { if (turret) { turret.hp = 0; if (phase1Engine) phase1Engine.removeDeployable(turret); destroyTurret(); } },

  hudTag() { return scrap ? ' [SCRAPPED]' : (carrying() ? ' [CARRYING]' : ' [UNBURDENED]'); },
  passivePip() { return carrying() ? '' : '+22%'; },
  qEmpowered() { return !carrying(); }
};
})();
