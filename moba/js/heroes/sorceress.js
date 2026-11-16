// Astral Sorceress: Carry • Ranged Fantasy
// Hero kit: data (stats, talents, UI text) + player ability code moved verbatim from js/arena/*.js and phase1_data.js.
// Functions run in the shared global scope of js/arena/*.js (hero, actions, fadeToAction, damageDummy, heroBolts, ...).
// Still shared until Phase 2: Astral Bolt flight/collision (heroBolts loop in loop.js), Rift Stride dash movement
// (loop.js), and the sorcPillars / sorcMonolith / pendingSorc* state (combat.js).
(function () {
'use strict';
const H = (window.MOBA_HEROES = window.MOBA_HEROES || {});

// E Rift Stride: bolts fire when the dash ends (kit-local; isBusy() tells the self-test to wait)
let pendingRiftBolts = null;
// E: 2 charges (KitFx.charges), each a short step; every step fires the homing bolts at RIFT.boltPct damage
const RIFT = { range: 9.0, maxBolts: 3, spread: 0.55, speed: 21, life: 1.6, step: 2.5, stepDur: 0.15, boltPct: 0.5, recharge: [9.0, 8.5, 8.0] };
KitFx.charges.slotFor.rift = 'E';
// Q: each pillar hit adds a stack (max by what it hit: minion 1, jungle monster 2, hero 3) and refunds 10% of Q's
// cooldown per stack; stacks fall off 5s after the last hit
const Q_REFUND = { perStack: 0.10, holdSec: 5.0 };

// Up to RIFT.maxBolts nearest live enemies (dummies + engine units, no structures) within range of (x, z)
function nearestRiftTargets(x, z, actor) {
  const found = [];
  if (!actor || actor.isPlayer) dummies.forEach((d) => {
    if (d.isShooter && !shooterEnabled) return;
    const dist = Math.hypot(d.x - x, d.z - z) - d.r;
    if (dist <= RIFT.range) found.push({ dist, d });
  });
  if (phase1Engine) {
    (actor || KitFx.player).hostiles().forEach((t) => {
      if (!t || t.kind === 'structure' || !t.ref || (t.ref.hp !== undefined && t.ref.hp <= 0)) return;
      const dist = Math.hypot(t.x - x, t.z - z) - (t.r || 0);
      if (dist <= RIFT.range) found.push({ dist, ref: t.ref });
    });
  }
  found.sort((a, b) => a.dist - b.dist);
  return found.slice(0, RIFT.maxBolts);
}

// ---- Passive: Starmark (DESIGN_RULES Sorceress) ----
// Any ability hit (Q pillar, E bolts, R pulses) puts / refreshes ONE mark on the target; her next basic attack that
// hits a marked target pops it for bonus Ability damage. One mark per target per caster, no stacks.
const STARMARK = { dur: 4.0, popCd: 3.0 }; // popCd: a target can only be popped once per 3s (per caster)
const popReady = new WeakMap(); // target -> Map(caster -> game time it can be popped again)
const marks = []; // { u (unit or dummy), by (caster unit), t, sprite }
let starTex = null;
function starSprite() {
  if (!starTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.translate(32, 32);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 9 : 27, a = -Math.PI / 2 + i * Math.PI / 4;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#f5d0fe'; g.fill();
    g.lineWidth = 4; g.strokeStyle = '#a21caf'; g.stroke();
    starTex = new THREE.CanvasTexture(c);
    starTex.colorSpace = THREE.SRGBColorSpace;
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, depthTest: false, transparent: true }));
  sp.scale.setScalar(0.55);
  sp.renderOrder = 998;
  return sp;
}
function markTarget(by, u) {
  if (!u || !by) return;
  let m = marks.find((k) => k.u === u && k.by === by);
  if (!m) {
    m = { u, by, t: 0, sprite: starSprite() };
    scene.add(m.sprite);
    marks.push(m);
  }
  m.t = STARMARK.dur;
}
function dropMark(i) { scene.remove(marks[i].sprite); marks.splice(i, 1); }
function tickMarks(dt) {
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    m.t -= dt;
    if (m.t <= 0 || (m.u.hp !== undefined && m.u.hp <= 0 && !m.u.isDummy)) { dropMark(i); continue; }
    m.sprite.position.set(m.u.x, 2.75 + Math.sin(m.t * 5) * 0.06, m.u.z);
    m.sprite.material.rotation += dt * 2;
    m.sprite.visible = !m.u.pivot || m.u.pivot.visible;
  }
}
// basic-attack hit: pop this caster's mark on the target (t = engine target object; null for a dummy)
function popMark(actor, u, t) {
  const i = marks.findIndex((k) => k.u === u && k.by === actor.unit);
  if (i < 0) return;
  // per-target pop cooldown: the mark stays (and keeps refreshing) until this target can be popped again
  let pm = popReady.get(u);
  if (!pm) popReady.set(u, (pm = new Map()));
  if ((pm.get(actor.unit) || 0) > KitFx.time) return;
  pm.set(actor.unit, KitFx.time + STARMARK.popCd);
  dropMark(i);
  const dmg = H.sorceress.dmg.starmark(actor.stats(), actor.level());
  spawnShockRing(u.x, u.z, 0xf0abfc, 0.2, 1.0, 0.22);
  if (!t) { damageDummy(u, dmg, '#f0abfc'); spawnFloat(u.x, 2.9, u.z, 'STARMARK!', '#f0abfc'); return; }
  actor.damage(t, dmg, { dmgType: 'fantasy', src: 'ability', color: '#f0abfc' });
}

// Pending windups: the player keeps the shared globals (the self-test drain check reads them); bots keep theirs on the unit
function pend(actor, key) {
  if (actor.isPlayer) return key === 'bolt' ? pendingSorcBolt : key === 'ult' ? pendingSorcUlt : pendingRiftBolts;
  return actor.unit['sorc_' + key];
}
function setPend(actor, key, v) {
  if (!actor.isPlayer) { actor.unit['sorc_' + key] = v; return; }
  if (key === 'bolt') pendingSorcBolt = v; else if (key === 'ult') pendingSorcUlt = v; else pendingRiftBolts = v;
}

// Spawn Sorceress LMB Astral Spark Bolt (Fantasy Damage!). opts (E Rift Stride bolts):
// { homeTo: {d}|{ref}, slowDur, fromBody } -> homing, not a basic attack, only hits its target
function spawnAstralBolt(actor, angle, dmg, opts) {
  const hero = actor.unit; // (local alias: the caster)
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
  if (actor.isPlayer && currentModel && rightHandBone && !(opts && opts.fromBody)) {
    heroPivot.updateMatrixWorld(true);
    rightHandBone.getWorldPosition(rhWorld);
    startX = rhWorld.x + fwdX * 0.28;
    startY = THREE.MathUtils.clamp(rhWorld.y, 1.32, 1.60);
    startZ = rhWorld.z + fwdZ * 0.28;
  } else if ((opts && opts.fromBody) || !actor.isPlayer) {
    startX = hero.x + fwdX * 0.45;
    startY = 1.35;
    startZ = hero.z + fwdZ * 0.45;
  }
  boltGrp.position.set(startX, startY, startZ);
  boltGrp.rotation.y = angle;
  scene.add(boltGrp);

  const spd = opts ? RIFT.speed : 19.5;
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
    life: opts ? RIFT.life : 0.54,
    homeTo: opts ? opts.homeTo : null,
    age: 0,
    isBasic: !opts,
    src: opts ? 'ability' : 'attack', // her bolt is a basic attack; Rift bolts are Ability damage
    owner: actor.isPlayer ? null : actor,
    slowDur: opts ? (opts.slowDur || 0) : 0,
    // Starmark: Rift bolts (abilities) mark what they hit; her basic bolt pops a mark
    onHit: opts ? (x, z, u) => markTarget(hero, u) : (x, z, u, t) => popMark(actor, u, t)
  });
}

// Spawn Sorceress 3D Starfall Pillar (Q)
function spawnStarfallPillar(actor, tx, tz, radius, delay, dmg, isFromQ, slowDur = 0) {
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
    owner: actor.isPlayer ? null : actor,
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

H.sorceress = {
  id: 'sorceress',
  roster: { order: 3, emoji: '✨', short: 'Sorceress' },

  bundle: { label: 'Astral Sorceress', src: 'assets/sorceress/sorceress_bundle.js', globalKey: 'SORCERESS_MIXAMO', pStart: 25, pEnd: 35 },
  moveSpeed: 6.00, // world units/s before bonuses
  hudSpeed: 328,   // SPD number shown in the HUD
  usesWandProp: true, // procedural star wand (only shown if her Mixamo bundle is missing)
  pillLabels: { punch: '1H Cast', kick: '2H Area', dash: 'Rig', dashReady: () => !!(actions.idle && actions.run) }, // dev toolbar pills

  // All of the Sorceress's damage numbers in one place. Her bolt is plain Attack damage (DESIGN_RULES: no more
  // Physical+Fantasy mix); Starfall, the Rift bolts and the Monolith are Ability damage.
  dmg: {
    bolt: (st) => Math.round(st.attack),
    starfall: (st, lvl, rQE) => Math.round([280, 380, 480][rQE] + 12 * ((lvl || 1) - 1) + st.ability * 1.1),
    riftBolt: (st, lvl, rQE) => Math.round([100, 140, 180][rQE] + 8 * ((lvl || 1) - 1) + st.ability * 0.6), // x up to 3
    monolithPulse: (st, rUlt) => Math.round([40, 60, 80][rUlt] + st.ability * 0.25),                         // every 0.5s
    collapse: (st) => Math.round(100 + st.ability * 0.5),                                                   // (old 10L talent; unused)
    starmark: (st, lvl) => Math.round(20 + 4 * ((lvl || 1) - 1) + st.ability * 0.30)                       // passive pop
  },

  spec: {
    id: 'sorceress',
    name: 'Astral Sorceress',
    role: 'Carry • Ranged Late-Game Mage (Ability)',
    glyph: 'S',
    color: '#38bdf8',
    height: 2.05,
    baseHp: 1260, hpGrow: 100,
    baseMp: 440, mpGrow: 40, mpRegen: 7.5,
    // Stat model (DESIGN_RULES §2): Ability-leaning burst mage (~160 / 285 / 558 dps budget, no items, front-loaded)
    baseAttack: 50, attackGrow: 4.0,
    baseAbility: 50, abilityGrow: 9.0,
    baseResist: 19, resistGrow: 2.4,
    asGrow: 0.03,
    baseSpd: 6.00,
    atkCd: 1.12,
    mpCosts: { Q: 38, E: 40, R: 100 } // E: per step
  },

  talents: {
    3: { L: { id: '3L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '3R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } },
    7: { L: { id: '7L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '7R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } },
    10: { L: { id: '10L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '10R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } }
  },

  ui: {
    height: 1.94,
    modelLabel: 'Astral Sorceress (Mixamo Rigged)',
    glyph: 'S',
    color: '#e879f9',
    name: 'Astral Sorceress (3D)',
    role: 'Carry • Ranged Burst & Zone Mage (Ability)',
    passive: 'Starmark',
    lmb: 'Astral Bolt',
    q: 'Star Pillar',
    e: 'Rift Stride',
    r: 'Monolith',
    banner: '<b>1/2/3/4</b> Hero &bull; <b>Passive</b> Starmark (abilities mark, basics pop) &bull; <b>Q</b> Starfall Pillar &bull; <b>E</b> Rift Stride (2 steps) + Homing Bolts &bull; <b>R</b> Cataclysm Monolith &bull; <b>P</b> Shop',
    tooltips: {
      P: {
        title: 'Passive • Starmark',
        meta: 'Cast, then attack',
        body: 'Any of her <b>ability hits</b> puts a <b>Starmark</b> on the target (one mark, refreshed by each hit, lasts 4s). Her next <b>basic attack</b> on a marked target pops it for <b>20 (+4/Lv) + 30% Ability</b> bonus damage (at most once every 3s per target).'
      },
      LMB: {
        title: 'LMB • Astral Bolt',
        meta: '0 MP • 1.12s Base ATK',
        body: 'Hurls a luminous bolt of starlight from her hand dealing <b>100% Attack</b> at long range.'
      },
      Q: {
        title: 'Q • Starfall Pillar',
        meta: '38 MP • 5.2s / 4.8s / 4.4s Base CD (Lv 1/6/9)',
        body: 'Calls down a delayed pillar of cosmic fire at the cursor after 0.38s, dealing <b>280 / 380 / 480 (+12/Lv) + 110% Ability</b> in an area. Each hit adds a stack that <b>refunds 10% / 20% / 30%</b> of Q\'s cooldown (stacks up to 1 on minions, 2 on jungle monsters, 3 on heroes; they fade 5s after your last hit).'
      },
      E: {
        title: 'E • Rift Stride',
        meta: '40 MP per step • 2 charges (9s / 8.5s / 8s each, Lv 1/6/9)',
        body: 'A short <b>2.5m step</b> toward the cursor, then <b>3 homing bolts (50 / 70 / 90 (+4/Lv) + 30% Ability each)</b> split across the <b>3 nearest enemies</b> within 9m (2 enemies: 2 on the closest; 1 enemy: all 3). Two charges: double-step to escape, or dance in and out.'
      },
      R: {
        title: 'R • Cataclysm Monolith',
        meta: '100 MP • 46s / 40s / 34s CD (Lv 4/8/12)',
        body: 'After a 0.50s 2H overhead windup, slams down an expanding <b>Astral Monolith</b> zone for 5.0s that continuously <b>Slows enemies</b> and pulses <b>40 / 60 / 80 + 25% Ability</b> every 0.5s.'
      }
    }
  },

  // Parse the Mixamo bundle into a hero template (model, texture, animation clips)
  parseBundle(bundle, targetTmpl) {
    if (!bundle || targetTmpl.fbx) return targetTmpl.fbx;
    targetTmpl.tex = loadHeroDiffuseTexture(bundle.diffuseDataUrl);
    // her Hunyuan model's strand/fold detail lives in a normal map (the flat-looking hair without it)
    if (bundle.normalDataUrl) {
      targetTmpl.normalTex = loadHeroDiffuseTexture(bundle.normalDataUrl);
      targetTmpl.normalTex.colorSpace = THREE.NoColorSpace;
    }
    const idleFbx = fbxLoader.parse(b64ToBuffer(bundle.idleFbxB64), '');
    idleFbx.traverse((ch) => {
      if (ch.isMesh && ch.geometry && !ch.geometry.attributes.normal) {
        ch.geometry.computeVertexNormals();
      }
    });
    // her package was split at every UV seam: smooth the shading back across the seams (see KitFx.smoothSeams)
    idleFbx.traverse((ch) => { if (ch.isMesh && ch.geometry) KitFx.smoothSeams(ch.geometry, 60); });
    targetTmpl.fbx = idleFbx;
    if (idleFbx.animations[0]) targetTmpl.clips.idle = idleFbx.animations[0];
    const runFbx = fbxLoader.parse(b64ToBuffer(bundle.runFbxB64), '');
    if (runFbx.animations[0]) targetTmpl.clips.run = runFbx.animations[0];
    const atk1hFbx = fbxLoader.parse(b64ToBuffer(bundle.attack1hFbxB64), '');
    if (atk1hFbx.animations[0]) targetTmpl.clips.punch = atk1hFbx.animations[0];
    const atk2hFbx = fbxLoader.parse(b64ToBuffer(bundle.attack2hFbxB64), '');
    if (atk2hFbx.animations[0]) targetTmpl.clips.kick = atk2hFbx.animations[0];
    return idleFbx;
  },

  // LMB Astral Bolt: 0.22s left-hand windup, then the bolt (see tickTimers)
  onRangedAttack(st) {
    return this.basicAttackFor(KitFx.player, st);
  },

  basicAttackFor(actor, st) {
    const hero = actor.unit;
    const prev = pend(actor, 'bolt');
    if (prev) {
      SFX.play('chime');
      spawnAstralBolt(actor, prev.facing, prev.dmg);
      setPend(actor, 'bolt', null);
    }
    const aim = actor.aim();
    hero.facing = Math.atan2(aim.x - hero.x, aim.z - hero.z);
    hero.atkTimer = H.sorceress.spec.atkCd / (1 + st.asPct);
    // 0.44s commit window covers the 0.22s left-hand pullback windup + throw release!
    hero.punchAnim = 0.44;
    actor.play('punch', 0.04, true, 2.25, 0.24, 0.34);
    if (!actor.isPlayer) { const L = (window.__kitBotLog = window.__kitBotLog || {}); L.so_lmb = (L.so_lmb || 0) + 1; }
    const sparkDmg = H.sorceress.dmg.bolt(st);
    setPend(actor, 'bolt', { facing: hero.facing, dmg: sparkDmg, t: 0.22 });
  },

  // Q Starfall Pillar (Astral Tempo CDR), E Rift Stride + homing bolts, R Cataclysm Monolith
  cast(slot, ctx) {
    return this.castFor(KitFx.player, slot, ctx);
  },

  castFor(actor, slot, ctx) {
    if (!ctx) {
      const lvl = actor.level();
      ctx = { st: actor.stats(), pProg: { level: lvl }, talents: actor.talents(), cdrMult: 1 - (actor.stats().cdr || 0), rQE: KitFx.rQE(lvl), rUlt: KitFx.rUlt(lvl) };
    }
    const { st, pProg, talents, cdrMult, rQE, rUlt } = ctx;
    const hero = actor.unit;
    const wtfMode = actor.wtf;
    const trySpendMana = (sl) => actor.spend(sl);
    const aimWorld = actor.aim();
    if (!actor.isPlayer) {
      hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
      const L = (window.__kitBotLog = window.__kitBotLog || {}); L['so_' + slot] = (L['so_' + slot] || 0) + 1;
    }
    if (slot === 'Q') {
      if (!wtfMode && hero.cdQ > 0) return;
      if (!trySpendMana('Q')) return;
      hero.cdQ = wtfMode ? 0.22 : [5.2, 4.8, 4.4][rQE] * cdrMult; // (pillar hits refund part of it on eruption)
      hero.punchAnim = 0.54;
      if (actor.isPlayer) {
        const qAct = actions.punch || actions.kick;
        if (qAct) fadeToAction(qAct, 0.05, true, 2.25, 0.22);
      } else actor.play('punch', 0.05, true, 2.25, 0.22, 0.54);

      const maxRange = 9.5;
      const radius = 1.65;
      const dx = aimWorld.x - hero.x;
      const dz = aimWorld.z - hero.z;
      const dist = Math.hypot(dx, dz) || 0.01;
      const clamped = Math.min(maxRange, dist);
      const tx = hero.x + (dx / dist) * clamped;
      const tz = hero.z + (dz / dist) * clamped;

      const baseDmg = H.sorceress.dmg.starfall(st, pProg.level, rQE);
      SFX.play('chime');
      spawnStarfallPillar(actor, tx, tz, radius, 0.38, Math.round(baseDmg), true, 0);
    } else if (slot === 'E') {
      if ((hero.dashTimer || 0) > 0 || pend(actor, 'rift')) return; // one step at a time
      if (!wtfMode && KitFx.charges.count(hero, 'rift', 2) <= 0) return;
      if (!trySpendMana('E')) return;
      if (!wtfMode) KitFx.charges.use(hero, 'rift', 2, RIFT.recharge[rQE] * cdrMult);
      else hero.cdE = 0.3;

      // Step toward the cursor (bots: toward the brain's aim point)
      const dashAng = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
      hero.facing = dashAng;
      const dashDist = RIFT.step;
      const dashDur = RIFT.stepDur;
      hero.dashVx = Math.sin(dashAng) * (dashDist / dashDur);
      hero.dashVz = Math.cos(dashAng) * (dashDist / dashDur);
      hero.dashTimer = dashDur;
      hero.dashKind = 'sorc_rift';
      hero.dashHit = true; // Don't stop on units during Rift Stride
      SFX.play('dash');
      spawnShockRing(hero.x, hero.z, 0x38bdf8, 0.25, 1.35, 0.24);

      // When the dash ends: one homing Fantasy bolt at each of the (up to) 3 nearest enemies in range
      const eDmg = Math.round(H.sorceress.dmg.riftBolt(st, pProg.level, rQE) * RIFT.boltPct);
      setPend(actor, 'rift', { t: dashDur, dmg: eDmg, slowDur: 0 });
      if (!actor.isPlayer) actor.play('punch', 0.05, true, 2.25, 0.22, dashDur);
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
      if (actor.isPlayer) {
        const rAct = actions.kick || actions.punch;
        if (rAct) fadeToAction(rAct, 0.05, true, 2.2, 0.25);
      } else actor.play('kick', 0.05, true, 2.2, 0.25, 0.72);

      const dx = aimWorld.x - hero.x;
      const dz = aimWorld.z - hero.z;
      const dist = Math.hypot(dx, dz) || 0.01;
      const clamped = Math.min(9.0, dist);
      const tx = hero.x + (dx / dist) * clamped;
      const tz = hero.z + (dz / dist) * clamped;
      spawnShockRing(tx, tz, 0xe879f9, 2.0, 0.4, 0.50);
      setPend(actor, 'ult', { tx, tz, t: 0.50 });
    }
    return;
  },

  // Runs every frame for every hero kit: LMB bolt release and R monolith slam after their windups
  tickTimers(dt) {
    this.tickActor(KitFx.player, dt);
  },

  tickActor(actor, dt) {
    const hero = actor.unit;
    const live = actor.isPlayer ? activeHeroId === 'sorceress' : true;
    if ((hero.qTempoTimer || 0) > 0) { hero.qTempoTimer -= dt; if (hero.qTempoTimer <= 0) hero.qTempoStacks = 0; }
    if (!actor.isPlayer && (hero.stunTimer || 0) > 0) { setPend(actor, 'bolt', null); setPend(actor, 'ult', null); }
    if (!actor.isPlayer) {
      hero.punchAnim = Math.max(0, (hero.punchAnim || 0) - dt);
      hero.kickAnim = Math.max(0, (hero.kickAnim || 0) - dt);
    }
    const pendingRiftBolts = pend(actor, 'rift');
    if (pendingRiftBolts) {
      pendingRiftBolts.t -= dt;
      if (pendingRiftBolts.t <= 0) {
        const rb = pendingRiftBolts;
        setPend(actor, 'rift', null);
        if (live) {
          const near = nearestRiftTargets(hero.x, hero.z, actor);
          // Always 3 bolts when anyone's in range: 3 targets = 1 each, 2 targets = 2 on the closest + 1, 1 target = all 3
          const targets = near.length === 0 ? [] : near.length === 1 ? [near[0], near[0], near[0]]
            : near.length === 2 ? [near[0], near[0], near[1]] : near;
          if (targets.length) {
            SFX.play('chime');
            spawnShockRing(hero.x, hero.z, 0xe879f9, 0.3, 1.1, 0.2);
          }
          targets.forEach((tg, idx) => {
            const tx = tg.d ? tg.d.x : tg.ref.x;
            const tz = tg.d ? tg.d.z : tg.ref.z;
            // Fan out a little, then curve in (spread: left / center / right)
            const fan = (idx - (targets.length - 1) / 2) * RIFT.spread;
            const ang = Math.atan2(tx - hero.x, tz - hero.z) + fan;
            spawnAstralBolt(actor, ang, rb.dmg, { homeTo: tg.d ? { d: tg.d } : { ref: tg.ref }, slowDur: rb.slowDur, fromBody: true });
          });
        }
      }
    }
    const pb = pend(actor, 'bolt');
    if (pb) {
      pb.t -= dt;
      if (pb.t <= 0) {
        setPend(actor, 'bolt', null);
        if (live) {
          SFX.play('chime');
          spawnAstralBolt(actor, pb.facing, pb.dmg);
        }
      }
    }
    const pu = pend(actor, 'ult');
    if (pu) {
      pu.t -= dt;
      if (pu.t <= 0) {
        setPend(actor, 'ult', null);
        if (actor.isPlayer) {
          if (live) spawnCataclysmMonolith(pu.tx, pu.tz);
        } else if (actor.monolith) {
          // bots: the engine's bot monolith (same pulse numbers; the collapse only with the 10L talent, like the player)
          const st = actor.stats(), rU = KitFx.rUlt(actor.level());
          const pulse = H.sorceress.dmg.monolithPulse(st, rU);
          const collapse = 0; // (the end-of-zone pull is a talent candidate)
          actor.monolith(pu.tx, pu.tz, pulse, collapse);
        }
      }
    }
  },

  // Runs every frame for every hero kit: Starfall Pillars erupting and the expanding Cataclysm Monolith
  updateWorld(dt, ctx) {
    const { st, pProg, now } = ctx;
    tickMarks(dt);
    // Update Sorceress 3D Starfall Pillars (Q)
    for (let i = sorcPillars.length - 1; i >= 0; i--) {
      const p = sorcPillars[i];
      if (!p.erupted) {
        p.delay -= dt;
        p.innerFill.material.opacity = 0.20 + Math.min(0.45, (0.34 - Math.max(0, p.delay)) * 1.2);
        if (p.delay <= 0) {
          p.erupted = true;
          p.crystal.visible = true;
          p.crystal.scale.set(1, 1, 1);
          SFX.play('arena');
          spawnShockRing(p.x, p.z, p.isFromQ ? 0xe879f9 : 0x38bdf8, 0.25, p.r, 0.26);

          let hitHeroOrBoss = false;
          let hitAny = false;
          let stackCap = 0; // best thing it hit: minion 1, jungle monster 2, hero (or training dummy) 3
          const finalPillarDmg = p.dmg;

          const pa = p.owner || KitFx.player; // who cast this pillar
          if (!p.owner) dummies.forEach((d) => {
            if (d.isShooter && !shooterEnabled) return;
            if (Math.hypot(d.x - p.x, d.z - p.z) <= p.r + d.r) {
              damageDummy(d, finalPillarDmg, '#e879f9');
              if (p.isFromQ) markTarget(pa.unit, d);
              stackCap = 3;
              hitHeroOrBoss = true;
              hitAny = true;
            }
          });
          if (phase1Engine) {
            pa.hostiles().forEach((t) => {
              if (t.kind === 'structure') return;
              if (Math.hypot(t.x - p.x, t.z - p.z) <= p.r + t.r) {
                const hit = pa.damage(t, finalPillarDmg, {
                  dmgType: 'fantasy',
                  slowDur: p.slowDur || 0,
                  color: '#e879f9'
                });
                if (hit) {
                  hitAny = true;
                  if (p.isFromQ) markTarget(pa.unit, t.ref);
                  stackCap = Math.max(stackCap, (t.kind === 'bot' || t.kind === 'player') ? 3 : (t.kind === 'camp' ? 2 : (t.kind === 'minion' ? 1 : 0)));
                  if (t.kind === 'bot' || t.kind === 'player') {
                    hitHeroOrBoss = true;
                  }
                }
              }
            });
          }

          // stacking cooldown refund: +1 stack per hit (capped by what it hit), 10% of Q's base cooldown per stack
          if (p.isFromQ && stackCap > 0) {
            const caster = pa.unit;
            const rq = KitFx.rQE(pa.level());
            const prev = (caster.qTempoTimer || 0) > 0 ? (caster.qTempoStacks || 0) : 0;
            caster.qTempoStacks = prev < stackCap ? prev + 1 : prev; // a weaker target can't build past its cap (stacks already earned stay)
            caster.qTempoTimer = Q_REFUND.holdSec;
            caster.cdQ = Math.max(0, (caster.cdQ || 0) - [5.2, 4.8, 4.4][rq] * Q_REFUND.perStack * caster.qTempoStacks);
          }
        }
      } else {
        p.postLife -= dt;
        const k = Math.max(0, p.postLife / 0.28);
        p.crystal.scale.set(k, 1.0 + (1 - k) * 0.35, k);
        p.crystal.material.opacity = 0.88 * k;
        if (p.postLife <= 0) {
          scene.remove(p.grp);
          sorcPillars.splice(i, 1);
        }
      }
    }

    // Update Sorceress R (Cataclysm Monolith) 5.0s Expanding Field
    if (sorcMonolith) {
      sorcMonolith.t += dt;
      const u = Math.min(1, sorcMonolith.t / sorcMonolith.dur);
      sorcMonolith.curR = sorcMonolith.startR + (sorcMonolith.maxR - sorcMonolith.startR) * u;
      sorcMonolith.zoneRing.scale.setScalar(sorcMonolith.curR);
      sorcMonolith.zoneDisc.scale.setScalar(sorcMonolith.curR);
      sorcMonolith.obelisk.rotation.y += dt * 2.8;
      sorcMonolith.obelisk.position.y = 1.85 + Math.sin(now * 0.006) * 0.22;

      sorcMonolith.tickTimer -= dt;
      if (sorcMonolith.tickTimer <= 0) {
        sorcMonolith.tickTimer = 0.5;
        const rUlt = (pProg.level || 1) >= 12 ? 2 : ((pProg.level || 1) >= 8 ? 1 : 0);
        const tickDmg = H.sorceress.dmg.monolithPulse(st, rUlt);
        spawnShockRing(sorcMonolith.x, sorcMonolith.z, 0xa855f7, 0.4, sorcMonolith.curR, 0.28);

        dummies.forEach((d) => {
          if (d.isShooter && !shooterEnabled) return;
          if (Math.hypot(d.x - sorcMonolith.x, d.z - sorcMonolith.z) <= sorcMonolith.curR + d.r) {
            damageDummy(d, tickDmg, '#e879f9', true);
            markTarget(hero, d);
          }
        });
        if (phase1Engine) {
          phase1Engine.getHostileTargets().forEach((t) => {
            if (t.kind === 'structure') return;
            if (Math.hypot(t.x - sorcMonolith.x, t.z - sorcMonolith.z) <= sorcMonolith.curR + t.r) {
              if (phase1Engine.dealPlayerDamageToUnit(t, tickDmg, {
                dmgType: 'fantasy',
                slowDur: 0.65,
                color: '#e879f9',
                isDoT: true
              })) markTarget(hero, t.ref);
            }
          });
        }
      }

      // (old 10L Gravity Collapse: the end-of-zone pull is a talent candidate; off for now)
      if (false) {
        sorcMonolith.collapsed = true;
        const collapseDmg = H.sorceress.dmg.collapse(st);
        SFX.play('arena');
        spawnShockRing(sorcMonolith.x, sorcMonolith.z, 0x38bdf8, sorcMonolith.curR, 0.4, 0.34);
        spawnFloat(sorcMonolith.x, 3.1, sorcMonolith.z, 'GRAVITY COLLAPSE!', '#38bdf8');
        if (phase1Engine) {
          phase1Engine.getHostileTargets().forEach((t) => {
            if (t.kind === 'structure') return;
            const dx = sorcMonolith.x - t.x;
            const dz = sorcMonolith.z - t.z;
            const dist = Math.hypot(dx, dz) || 0.01;
            if (dist <= sorcMonolith.curR + t.r) {
              const pull = Math.min(1.8, dist * 0.65);
              if (t.ref) {
                t.ref.x += (dx / dist) * pull;
                t.ref.z += (dz / dist) * pull;
              }
              phase1Engine.dealPlayerDamageToUnit(t, collapseDmg, { dmgType: 'fantasy', color: '#38bdf8' });
            }
          });
        }
      }

      if (sorcMonolith.t >= sorcMonolith.dur) {
        scene.remove(sorcMonolith.grp);
        sorcMonolith = null;
      }
    }
  },

  // Stop the 2H cast clip cleanly at 2.25s so it never loops back toward frame 0
  releaseOneShotClips() {
    if (actions.kick && activeAction === actions.kick && actions.kick.time >= 2.25) {
      oneShotActive = false;
      if (actions.idle) fadeToAction(actions.idle, 0.14, false, 1.0);
    }
  },

  // Star wand follows her right hand (returns true when handled)
  updateHandProps() {
    if (!(currentModel && rightHandBone)) return false;
    handGrenadeMesh.visible = false;
    currentModel.updateMatrixWorld(true);
    rightHandBone.getWorldPosition(rhWorld);
    const fwdX = Math.sin(heroPivot.rotation.y);
    const fwdZ = Math.cos(heroPivot.rotation.y);
    wandPivot.position.copy(rhWorld);
    bowAimTarget.set(rhWorld.x + fwdX * 0.9, rhWorld.y + 0.25, rhWorld.z + fwdZ * 0.9);
    wandPivot.up.set(0, 1, 0);
    wandPivot.lookAt(bowAimTarget);
    return true;
  },

  // Overhead plate tag
  hudTag(st) { return ''; },

  // Passive slot pip: how many targets carry her Starmark right now
  passivePip(st) {
    const n = marks.filter((m) => m.by === hero).length;
    return n > 0 ? n + '✦' : '';
  },

  // Q slot: refund stacks (10% / 20% / 30%)
  showQStacks() { return (hero.qTempoStacks || 0) > 0 && (hero.qTempoTimer || 0) > 0; },
  qEmpowered() { return false; },

  rEmpowered() {
    return !!sorcMonolith;
  },

  // Self-test: still has something scheduled
  isBusy() {
    return !!pendingRiftBolts;
  },

  // the test tools clear leftovers between rows
  clearState() { this.onSwitchedAway(); },

  // switching heroes / the test tools: clear the player's marks
  onSwitchedAway() {
    for (let i = marks.length - 1; i >= 0; i--) if (marks[i].by === hero) dropMark(i);
  }
};
})();
