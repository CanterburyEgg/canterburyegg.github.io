// Astral Sorceress: Carry • Ranged Fantasy
// Hero kit: data (stats, talents, UI text) + player ability code moved verbatim from js/arena/*.js and phase1_data.js.
// Functions run in the shared global scope of js/arena/*.js (hero, actions, fadeToAction, damageDummy, heroBolts, ...).
// Still shared until Phase 2: Astral Bolt flight/collision (heroBolts loop in loop.js), Soul Siphon (phase1_engine.js),
// Rift Stride dash movement (loop.js), and the sorcPillars / sorcMonolith / pendingSorc* state (combat.js).
(function () {
'use strict';
const H = (window.MOBA_HEROES = window.MOBA_HEROES || {});

// E Rift Stride: bolts fire when the dash ends (kit-local; isBusy() tells the self-test to wait)
let pendingRiftBolts = null;
const RIFT = { range: 9.0, maxBolts: 3, spread: 0.55, speed: 21, life: 1.6 };

// Up to RIFT.maxBolts nearest live enemies (dummies + engine units, no structures) within range of (x, z)
function nearestRiftTargets(x, z) {
  const found = [];
  dummies.forEach((d) => {
    if (d.isShooter && !shooterEnabled) return;
    const dist = Math.hypot(d.x - x, d.z - z) - d.r;
    if (dist <= RIFT.range) found.push({ dist, d });
  });
  if (phase1Engine) {
    phase1Engine.getHostileTargets().forEach((t) => {
      if (!t || t.kind === 'structure' || !t.ref || (t.ref.hp !== undefined && t.ref.hp <= 0)) return;
      const dist = Math.hypot(t.x - x, t.z - z) - (t.r || 0);
      if (dist <= RIFT.range) found.push({ dist, ref: t.ref });
    });
  }
  found.sort((a, b) => a.dist - b.dist);
  return found.slice(0, RIFT.maxBolts);
}

// Spawn Sorceress LMB Astral Spark Bolt (Fantasy Damage!). opts (E Rift Stride bolts):
// { homeTo: {d}|{ref}, slowDur, fromBody } -> homing, not a basic attack, only hits its target
function spawnAstralBolt(angle, dmg, opts) {
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
  if (currentModel && rightHandBone && !(opts && opts.fromBody)) {
    heroPivot.updateMatrixWorld(true);
    rightHandBone.getWorldPosition(rhWorld);
    startX = rhWorld.x + fwdX * 0.28;
    startY = THREE.MathUtils.clamp(rhWorld.y, 1.32, 1.60);
    startZ = rhWorld.z + fwdZ * 0.28;
  } else if (opts && opts.fromBody) {
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
    slowDur: opts ? (opts.slowDur || 0) : 0
  });
}

// Spawn Sorceress 3D Starfall Pillar (Q)
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

H.sorceress = {
  id: 'sorceress',

  bundle: { label: 'Astral Sorceress', src: 'assets/sorceress/sorceress_bundle.js', globalKey: 'SORCERESS_MIXAMO', pStart: 50, pEnd: 64 },
  moveSpeed: 6.00, // world units/s before bonuses
  hudSpeed: 328,   // SPD number shown in the HUD
  usesWandProp: true, // procedural star wand (only shown if her Mixamo bundle is missing)
  pillLabels: { punch: '1H Cast', kick: '2H Area', dash: 'Rig', dashReady: () => !!(actions.idle && actions.run) }, // dev toolbar pills

  spec: {
    id: 'sorceress',
    name: 'Astral Sorceress',
    role: 'Carry • Ranged Late-Game Fantasy Mage',
    glyph: 'S',
    color: '#38bdf8',
    height: 2.05,
    baseHp: 1260, hpGrow: 100,
    baseMp: 440, mpGrow: 40, mpRegen: 7.5,
    baseAtk: 36, atkGrow: 2.5,
    baseFant: 52, fantGrow: 8.8,
    baseArmor: 15, armorGrow: 2.2,
    baseFResist: 24, fResistGrow: 2.6,
    baseSpd: 6.00,
    atkCd: 1.12,
    mpCosts: { Q: 38, E: 60, R: 100 }
  },

  talents: {
    3: {
      L: { id: '3L', name: 'Far Sight', desc: 'Q Starfall Pillar cast range increased by +15% (9.5m -> 11.0m)' },
      R: { id: '3R', name: 'Chilling Wake', desc: "E Rift Stride's bolts slow hit enemies by 25% for 1.5s" }
    },
    7: {
      L: { id: '7L', name: 'Wide Conduit', desc: 'Q Starfall Pillar explosion radius increased by +20%' },
      R: { id: '7R', name: 'Astral Slipstream', desc: 'E dash distance +25% and grants +25% Move Speed for 1.5s' }
    },
    10: {
      L: { id: '10L', name: 'Gravity Collapse', desc: 'R Cataclysm Monolith pulls enemies inward upon reaching max size' },
      R: { id: '10R', name: '4th Resonance', desc: 'Max Q cooldown stacks 3 -> 4 vs Heroes, and Q deals +20% dmg inside R' }
    }
  },

  ui: {
    height: 1.94,
    modelLabel: 'Astral Sorceress (Mixamo Rigged)',
    glyph: 'S',
    color: '#e879f9',
    name: 'Astral Sorceress (3D)',
    role: 'Carry • Ranged Fantasy Burst & Zone Mage',
    passive: 'Soul Siphon',
    lmb: 'Astral Bolt',
    q: 'Star Pillar',
    e: 'Rift Stride',
    r: 'Monolith',
    banner: '<b>1/2/3/4</b> Hero &bull; <b>Passive</b> Soul Siphon (+MP on Kills) &bull; <b>Q</b> Starfall Pillar (-0.9s CD/Hit) &bull; <b>E</b> Rift Stride + 3 Homing Bolts &bull; <b>R</b> Cataclysm Monolith &bull; <b>P</b> Shop',
    tooltips: {
      P: {
        title: 'Passive • Soul Siphon & Astral Tempo',
        meta: 'Innate Mana & CDR',
        body: 'Killing any unit siphons <b>36 (+6/Lv) Mana (3x on Hero takedowns)</b>. Hitting enemies with <b>Q: Starfall Pillar</b> grants <b>Astral Tempo</b> stacks (up to 3x), reducing Q cooldown by <b>-0.9s per stack (1.50s min floor)</b>.',
        talentLevels: [10]
      },
      LMB: {
        title: 'LMB • Astral Bolt',
        meta: '0 MP • 1.12s Base ATK',
        body: 'Hurls a luminous bolt of starlight from her hand dealing <b>Physical + Fantasy Damage</b> at long range.'
      },
      Q: {
        title: 'Q • Starfall Pillar',
        meta: '38 MP • 5.2s / 4.8s / 4.4s Base CD (Lv 1/6/9)',
        body: 'Calls down a delayed pillar of cosmic fire at the cursor after 0.38s, dealing <b>heavy Fantasy Damage</b> in an area. Hitting an enemy grants <b>+1 Astral Tempo stack (-0.9s Q CD, 1.50s floor)</b>.',
        talentLevels: [3, 7, 10]
      },
      E: {
        title: 'E • Rift Stride',
        meta: '60 MP • 12.0s / 10.5s / 9.0s CD (Lv 1/6/9)',
        body: 'Dashes in your movement direction, then fires <b>3 homing Fantasy bolts</b> split across the <b>3 nearest enemies</b> within 9m (2 enemies: 2 bolts on the closest; 1 enemy: all 3).',
        talentLevels: [3, 7]
      },
      R: {
        title: 'R • Cataclysm Monolith',
        meta: '100 MP • 46s / 40s / 34s CD (Lv 4/8/12)',
        body: 'After a 0.50s 2H overhead windup, slams down an expanding <b>Astral Monolith</b> zone for 5.0s that continuously <b>Slows enemies</b> and pulses <b>Fantasy Damage</b>.',
        talentLevels: [10]
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
    const atk1hFbx = fbxLoader.parse(b64ToBuffer(bundle.attack1hFbxB64), '');
    if (atk1hFbx.animations[0]) targetTmpl.clips.punch = atk1hFbx.animations[0];
    const atk2hFbx = fbxLoader.parse(b64ToBuffer(bundle.attack2hFbxB64), '');
    if (atk2hFbx.animations[0]) targetTmpl.clips.kick = atk2hFbx.animations[0];
    return idleFbx;
  },

  // LMB Astral Bolt: 0.22s left-hand windup, then the bolt (see tickTimers)
  onRangedAttack(st) {
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
  },

  // Q Starfall Pillar (Astral Tempo CDR), E Rift Stride + homing bolts, R Cataclysm Monolith
  cast(slot, ctx) {
    const { st, pProg, talents, cdrMult, rQE, rUlt } = ctx;
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

      // When the dash ends: one homing Fantasy bolt at each of the (up to) 3 nearest enemies in range
      const eDmg = Math.round([50, 80, 110][rQE] + (st.fant || 0) * 0.65);
      const eSlow = talents[3] === 'R' ? 1.5 : 0;
      pendingRiftBolts = { t: dashDur, dmg: eDmg, slowDur: eSlow };
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
  },

  // Runs every frame for every hero kit: LMB bolt release and R monolith slam after their windups
  tickTimers(dt) {
    if (pendingRiftBolts) {
      pendingRiftBolts.t -= dt;
      if (pendingRiftBolts.t <= 0) {
        const rb = pendingRiftBolts;
        pendingRiftBolts = null;
        if (activeHeroId === 'sorceress') {
          const near = nearestRiftTargets(hero.x, hero.z);
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
            spawnAstralBolt(ang, rb.dmg, { homeTo: tg.d ? { d: tg.d } : { ref: tg.ref }, slowDur: rb.slowDur, fromBody: true });
          });
        }
      }
    }
    if (pendingSorcBolt) {
      pendingSorcBolt.t -= dt;
      if (pendingSorcBolt.t <= 0) {
        const b = pendingSorcBolt;
        pendingSorcBolt = null;
        if (activeHeroId === 'sorceress') {
          SFX.play('chime');
          spawnAstralBolt(b.facing, b.dmg);
        }
      }
    }
    if (pendingSorcUlt) {
      pendingSorcUlt.t -= dt;
      if (pendingSorcUlt.t <= 0) {
        const u = pendingSorcUlt;
        pendingSorcUlt = null;
        if (activeHeroId === 'sorceress') {
          spawnCataclysmMonolith(u.tx, u.tz);
        }
      }
    }
  },

  // Runs every frame for every hero kit: Starfall Pillars erupting and the expanding Cataclysm Monolith
  updateWorld(dt, ctx) {
    const { st, pProg, talents, now } = ctx;
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
          // Talent 10R (4th Resonance): Pillars deal +20% damage to enemies inside Cataclysm Monolith!
          const inMonoAmp = (sorcMonolith && talents[10] === 'R' && Math.hypot(p.x - sorcMonolith.x, p.z - sorcMonolith.z) <= sorcMonolith.curR + p.r) ? 1.20 : 1.0;
          const finalPillarDmg = Math.round(p.dmg * inMonoAmp);

          dummies.forEach((d) => {
            if (d.isShooter && !shooterEnabled) return;
            if (Math.hypot(d.x - p.x, d.z - p.z) <= p.r + d.r) {
              damageDummy(d, finalPillarDmg, '#e879f9');
              hitHeroOrBoss = true;
              hitAny = true;
            }
          });
          if (phase1Engine) {
            phase1Engine.getHostileTargets().forEach((t) => {
              if (t.kind === 'structure') return;
              if (Math.hypot(t.x - p.x, t.z - p.z) <= p.r + t.r) {
                const hit = phase1Engine.dealPlayerDamageToUnit(t, finalPillarDmg, {
                  dmgType: 'fantasy',
                  slowDur: p.slowDur || 0,
                  color: '#e879f9'
                });
                if (hit) {
                  hitAny = true;
                  if (t.kind === 'bot' || (t.kind === 'monster' && t.ref && t.ref.isBoss)) {
                    hitHeroOrBoss = true;
                  }
                }
              }
            });
          }

          if (p.isFromQ && hitAny) {
            const maxStacks = talents[10] === 'R' ? 4 : 3;
            const cap = hitHeroOrBoss ? maxStacks : Math.min(2, maxStacks);
            if ((hero.qTempoStacks || 0) < cap) {
              hero.qTempoStacks = (hero.qTempoStacks || 0) + 1;
            }
            hero.qTempoTimer = 5.0;
            spawnFloat(hero.x, 2.75, hero.z, 'STARFALL TEMPO ' + hero.qTempoStacks + 'x (-' + hero.qTempoStacks + 's Q CD)!', '#e879f9');
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
        const tickDmg = Math.round([45, 70, 95][rUlt] + (st.fant || 0) * 0.38);
        spawnShockRing(sorcMonolith.x, sorcMonolith.z, 0xa855f7, 0.4, sorcMonolith.curR, 0.28);

        dummies.forEach((d) => {
          if (d.isShooter && !shooterEnabled) return;
          if (Math.hypot(d.x - sorcMonolith.x, d.z - sorcMonolith.z) <= sorcMonolith.curR + d.r) {
            damageDummy(d, tickDmg, '#e879f9');
          }
        });
        if (phase1Engine) {
          phase1Engine.getHostileTargets().forEach((t) => {
            if (t.kind === 'structure') return;
            if (Math.hypot(t.x - sorcMonolith.x, t.z - sorcMonolith.z) <= sorcMonolith.curR + t.r) {
              phase1Engine.dealPlayerDamageToUnit(t, tickDmg, {
                dmgType: 'fantasy',
                slowDur: 0.65,
                color: '#e879f9'
              });
            }
          });
        }
      }

      // Talent 10L (Gravity Collapse): At max size (t >= 4.2s), pulls enemies inward & deals bonus burst!
      if (!sorcMonolith.collapsed && sorcMonolith.t >= 4.2 && talents[10] === 'L') {
        sorcMonolith.collapsed = true;
        const collapseDmg = Math.round(85 + (st.fant || 0) * 0.55);
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
  hudTag(st) {
    return (hero.qTempoStacks || 0) > 0 ? ' [TEMPO x' + hero.qTempoStacks + ']' : '';
  },

  // Passive slot pip text ('' hides it)
  passivePip(st) {
    return (hero.qTempoStacks || 0) > 0 ? hero.qTempoStacks + 'x' : '';
  },

  // Q slot stack pip (Astral Tempo)
  showQStacks() {
    return (hero.qTempoStacks || 0) > 0;
  },

  qEmpowered() {
    return (hero.qTempoStacks || 0) > 0;
  },

  rEmpowered() {
    return !!sorcMonolith;
  },

  // Self-test: still has something scheduled
  isBusy() {
    return !!pendingRiftBolts;
  }
};
})();
