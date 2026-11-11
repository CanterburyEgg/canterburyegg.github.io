// Coyote Crossbowman: Carry • Ranged Physical
// Hero kit: data (stats, talents, UI text) + player ability code moved verbatim from js/arena/*.js and phase1_data.js.
// Functions run in the shared global scope of js/arena/*.js (hero, actions, fadeToAction, damageDummy, heroBolts, ...).
// Still shared until Phase 2: bolt flight/collision (heroBolts loop in loop.js), Bleed ticking on dummies (loop.js) and
// applyBleedStacks (combat.js), bleed talents in phase1_engine.js, the crossbow/laser/grenade prop meshes (models.js),
// and the HEARTSEEKER plate tag / R glow driven by hero.rChargeTimer (loop.js).
(function () {
'use strict';
const H = (window.MOBA_HEROES = window.MOBA_HEROES || {});

let crossbowMounted = false;

// Spawn a 3D glowing Crossbow Bolt (or R Heartseeker Piercing Bolt!)
// rangeMult scales how far it flies; popScale scales the Heartseeker's Bleed detonation damage (see loop.js heroBolts)
function spawnCrossbowBolt(angle, dmg, bleedAdd, isPiercingHeartseeker = false, forcePierce = false, rangeMult = 1, popScale = 1) {
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
    popScale,
    life: (isPiercingHeartseeker ? 0.68 : 0.55) * rangeMult
  });
}

// R Heartseeker charge scaling: an instant release would be 50% damage / 60% range, ramping to 100% at the full 2.0s;
// a full charge is a Perfect Shot (+25% Bleed detonation damage). Early release is allowed after 0.35s (~59%).
const HEARTSEEKER = { chargeDur: 2.0, minPower: 0.5, minRange: 0.6, perfectPopBonus: 1.25 };

function fireHeartseekerRelease() {
  const charge = THREE.MathUtils.clamp(1 - (hero.rChargeTimer / HEARTSEEKER.chargeDur), 0, 1);
  const isPerfect = charge >= 0.999;
  const power = HEARTSEEKER.minPower + (1 - HEARTSEEKER.minPower) * charge;
  const range = HEARTSEEKER.minRange + (1 - HEARTSEEKER.minRange) * charge;
  const popScale = power * (isPerfect ? HEARTSEEKER.perfectPopBonus : 1);
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
  spawnCrossbowBolt(hero.facing, Math.round((130 + st.atk * 0.85) * power), 1, true, true, range, popScale);
  if (isPerfect) {
    spawnFloat(hero.x, 2.75, hero.z, 'PERFECT SHOT! (+25% BLEED POP)', '#fde047');
  } else {
    spawnFloat(hero.x, 2.75, hero.z, 'QUICK SHOT (' + Math.round(power * 100) + '%)', '#fb7185');
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
    role: 'Carry • Ranged Physical Bleed Marksman',
    glyph: 'C',
    color: '#f59e0b',
    height: 1.98,
    baseHp: 1380, hpGrow: 114,
    baseMp: 310, mpGrow: 26, mpRegen: 5.5,
    baseAtk: 56, atkGrow: 7.2,
    baseFant: 0, fantGrow: 0,
    baseArmor: 19, armorGrow: 2.8,
    baseFResist: 19, fResistGrow: 2.2,
    baseSpd: 6.10,
    atkCd: 1.05,
    mpCosts: { Q: 40, E: 55, R: 90 }
  },

  talents: {
    3: {
      L: { id: '3L', name: 'Bloodhound Stride', desc: '+4% Move Speed per active Bleed stack on nearby enemies' },
      R: { id: '3R', name: 'Hair-Trigger Crank', desc: 'Q Fan Volley reload time reduced from 1.10s to 0.80s' }
    },
    7: {
      L: { id: '7L', name: 'Concussive Shrapnel', desc: 'E Grenade slows by 25% (45% on Bullseye) for 2.5s' },
      R: { id: '7R', name: 'Deep Serration', desc: 'Max Bleed stacks increased from 4 to 5 (+25% Bleed & R damage)' }
    },
    10: {
      L: { id: '10L', name: "Executioner's Tempo", desc: 'Detonating 4+ Bleed stacks with R refunds 50% of R cooldown' },
      R: { id: '10R', name: 'Piercing Broadheads', desc: 'Q Fan Volley fires 5 bolts that pierce all enemies' }
    }
  },

  ui: {
    height: 1.98,
    modelLabel: 'Coyote Crossbowman (Mixamo + 3D Crossbow)',
    glyph: 'C',
    color: '#f59e0b',
    name: 'Coyote Crossbowman (3D)',
    role: 'Carry • Ranged Physical Bleed Marksman',
    passive: 'Serrated Bolts',
    lmb: 'Bleed Bolt',
    q: '3-Bolt Fan',
    e: 'Grenade',
    r: 'Heartseeker',
    banner: '<b>1/2/3/4</b> Hero &bull; <b>LMB</b> Bleed Bolt &bull; <b>Q</b> Fan Volley &bull; <b>E</b> Shrapnel Grenade (2x Bullseye) &bull; <b>R</b> Heartseeker &bull; <b>P</b> Shop &bull; <b>F</b> Ward &bull; <b>B</b> Recall',
    tooltips: {
      P: {
        title: 'Passive • Serrated Broadheads',
        meta: 'Innate Bleed',
        body: 'Crossbow bolts apply <b>Serrated Bleed</b> for 4.5s (stacks up to <b>4x</b>; 5x with Lv7 Talent), dealing physical damage over time and priming targets for <b>R: Heartseeker</b> detonation.',
        talentLevels: [3, 7]
      },
      LMB: {
        title: 'LMB • Repeating Crossbow',
        meta: '0 MP • 1.05s Base ATK',
        body: 'Fires a high-velocity quarrel for <b>100% Physical ATK</b> and applies <b>1 stack of Serrated Bleed</b>.'
      },
      Q: {
        title: 'Q • 3-Bolt Fan Volley',
        meta: '40 MP • 7.5s / 6.5s / 5.5s CD (Lv 1/6/9)',
        body: 'Fires a tight spread of <b>3 serrated bolts</b> in a cone, each dealing <b>Physical Damage</b> and applying <b>1 stack of Bleed</b>.',
        talentLevels: [3, 10]
      },
      E: {
        title: 'E • Shrapnel Grenade',
        meta: '55 MP • 11.0s / 9.8s / 8.5s CD (Lv 1/6/9)',
        body: 'Lobs an explosive black-powder grenade to the target zone. Enemies caught in the <b>inner Bullseye</b> take <b>2x Physical Damage</b> and <b>+2 Bleed stacks</b> (outer ring applies 1 stack).',
        talentLevels: [7]
      },
      R: {
        title: 'R • Heartseeker Piercer',
        meta: '90 MP • 42s / 36s / 30s CD (Lv 4/8/12)',
        body: 'Channel for up to 2.0s, aiming a long-range sniper laser that pierces all enemies and <b>detonates all active Bleed stacks</b> for massive bonus physical burst. Damage and range grow with the charge; press <b>R</b> again to fire a weaker Quick Shot early, or hold the full 2.0s for a <b>Perfect Shot (+25% Bleed detonation)</b>.',
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
    hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
    hero.atkTimer = 1.05 / (1 + st.asPct);
    hero.punchAnim = 0.22;
    if (actions.punch) {
      fadeToAction(actions.punch, 0.04, true, 0.95);
    }
    SFX.play('punch');
    spawnCrossbowBolt(hero.facing, st.atk, 1, false, false);
  },

  // Q Triple-Notch fan volley, E Briar Bomb grenade, R Heartseeker Quarrel (2s charge, recast to fire early)
  cast(slot, ctx) {
    const { st, pProg, talents, cdrMult, rQE, rUlt } = ctx;
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
  },

  // Runs every frame for every hero kit: E grenade release after its windup, R Heartseeker charge + laser sight
  tickTimers(dt, now) {
    if (pendingGrenadeThrow) {
      pendingGrenadeThrow.t -= dt;
      if (pendingGrenadeThrow.t <= 0) {
        const g = pendingGrenadeThrow;
        pendingGrenadeThrow = null;
        launchShrapnelGrenade(g.tx, g.tz);
      }
    }

    // Coyote R 2.0s Self-Slowed Laser-Sight Charge
    if (hero.rChargeTimer > 0) {
      hero.rChargeTimer -= dt;
      hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
      laserSightMesh.visible = true;
      laserSightMesh.position.set(hero.x + Math.sin(hero.facing) * 0.55, 0.09, hero.z + Math.cos(hero.facing) * 0.55);
      // Plane points along local +Y; after rotation.x = -PI/2 that's (-sin z, 0, -cos z), so z = facing + PI aims it at (sin f, cos f)
      laserSightMesh.rotation.z = hero.facing + Math.PI;
      const chargePct = 1 - (hero.rChargeTimer / 2.0);
      laserSightMesh.scale.x = 0.7 + chargePct * 1.6;
      muzzleOrb.visible = true;
      muzzleOrb.scale.setScalar(0.6 + chargePct * 1.1 + Math.sin(now * 0.03) * 0.15);
      if (hero.rChargeTimer <= 0) {
        fireHeartseekerRelease();
      }
    } else {
      laserSightMesh.visible = false;
      muzzleOrb.visible = false;
    }
  },

  // Runs every frame for every hero kit: arcing E grenades (bullseye 2x + Bleed)
  updateWorld(dt, ctx) {
    const { st, pProg, talents } = ctx;
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

      if (u >= 1) {
        SFX.play('arena');
        spawnShockRing(g.tx, g.tz, 0xf59e0b, 0.3, g.outerR, 0.32);
        spawnShockRing(g.tx, g.tz, 0xf43f5e, 0.15, g.bullseyeR, 0.24);
        const rQE = (pProg.level || 1) >= 9 ? 2 : ((pProg.level || 1) >= 6 ? 1 : 0);
        const outerDmg = Math.round([70, 105, 140][rQE] + st.atk * 0.48);
        const bullDmg = outerDmg * 2;
        const grenSlow = talents[7] === 'L' ? 2.5 : 0;

        dummies.forEach((d) => {
          if (d.isShooter && !shooterEnabled) return;
          const dist = Math.hypot(d.x - g.tx, d.z - g.tz);
          if (dist <= g.bullseyeR + d.r * 0.45) {
            damageDummy(d, bullDmg, '#fde047');
            applyBleedStacks(d, 4);
            spawnFloat(d.x, 2.8, d.z, 'BULLSEYE 2X! (4 BLEEDS)', '#fde047');
          } else if (dist <= g.outerR + d.r) {
            damageDummy(d, outerDmg);
            applyBleedStacks(d, 2);
            spawnFloat(d.x, 2.65, d.z, '+2 BLEED', '#fb7185');
          }
        });

        if (phase1Engine) {
          phase1Engine.getHostileTargets().forEach((t) => {
            if (t.kind === 'structure') return;
            const realDist = Math.hypot(t.x - g.tx, t.z - g.tz);
            if (realDist <= g.bullseyeR + t.r * 0.45) {
              const didHit = phase1Engine.dealPlayerDamageToUnit(t, bullDmg, { bleedAdd: 4, slowDur: grenSlow, color: '#fde047' });
              if (didHit) spawnFloat(t.x, 2.8, t.z, 'BULLSEYE 2X! (4 BLEEDS)', '#fde047');
            } else if (realDist <= g.outerR + t.r) {
              phase1Engine.dealPlayerDamageToUnit(t, outerDmg, { bleedAdd: 2, slowDur: grenSlow });
            }
          });
        }

        scene.remove(g.mesh);
        scene.remove(g.teleGrp);
        heroGrenades.splice(i, 1);
      }
    }
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
