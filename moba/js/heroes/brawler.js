// Pit Brawler: Solo • Melee Cage-Fighter
// Hero kit: data (stats, talents, UI text) + player ability code moved verbatim from js/arena/*.js and phase1_data.js.
// Functions run in the shared global scope of js/arena/*.js (hero, actions, fadeToAction, damageDummy, arena, ...).
// Still shared until Phase 2: Footwork Siphon dummy tracking (loop.js), arena zone lifetime/projectile blocking (loop.js),
// arena damage amp (damageDummy) and the generic dash movement/collision (loop.js).
(function () {
'use strict';
const H = (window.MOBA_HEROES = window.MOBA_HEROES || {});

// R The Pit Arena: build the 3D cage and register it as the active arena zone
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

// E dash clips: 1st dash = flying kick (jump), rebound 2nd dash = running slide
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

H.brawler = {
  id: 'brawler',

  bundle: { label: 'Pit Brawler', src: 'assets/brawler/brawler_mixamo_bundle.js', globalKey: 'BRAWLER_MIXAMO', pStart: 30, pEnd: 44 },
  moveSpeed: 5.88, // world units/s before bonuses
  hudSpeed: 338,   // SPD number shown in the HUD

  spec: {
    id: 'brawler',
    name: 'Pit Brawler',
    role: 'Solo • Melee Coliseum Cage-Fighter',
    glyph: 'P',
    color: '#f43f5e',
    height: 2.25,
    baseHp: 1660, hpGrow: 132,
    baseMp: 280, mpGrow: 24, mpRegen: 5.0,
    baseAtk: 64, atkGrow: 7.8,
    baseFant: 0, fantGrow: 0,
    baseArmor: 30, armorGrow: 3.6,
    baseFResist: 25, fResistGrow: 2.8,
    baseSpd: 5.88,
    atkCd: 1.04,
    mpCosts: { Q: 40, E: 50, R: 95 }
  },

  talents: {
    3: {
      L: { id: '3L', name: 'Low Blow', desc: '-1.5s Q MMA Stun Kick cooldown & +0.25s Stun' },
      R: { id: '3R', name: 'Relentless Siphon', desc: 'Her punches siphon 4% Move Speed per hit (up to 12%) for 6s' }
    },
    7: {
      L: { id: '7L', name: 'Heavy Impact', desc: '+35% E Rebound Shield & her 2nd Jump Vault slams a 2.4m AoE' },
      R: { id: '7R', name: 'Haymaker Cleave', desc: 'Every 3rd punch cleaves nearby foes & heals her for +55 (+5/Lv) HP' }
    },
    10: {
      L: { id: '10L', name: 'Bloodsport Champion', desc: '+1.5s R Pit Arena duration & +10% extra Arena bonus damage' },
      R: { id: '10R', name: 'Cage Fighter', desc: 'Casting R resets E cooldown & Arena wall rebounds deal +65% bonus dmg' }
    }
  },

  ui: {
    height: 2.25,
    modelLabel: 'Pit Brawler (Mixamo Rigged)',
    glyph: 'P',
    color: '#f43f5e',
    name: 'Pit Brawler (3D)',
    role: 'Solo • Melee Physical Coliseum Bruiser',
    passive: 'Combo Siphon',
    lmb: 'Punch',
    q: 'Stun Kick',
    e: '2x Dash',
    r: 'Pit Arena',
    banner: '<b>1/2/3/4</b> Hero &bull; <b>LMB</b> Punch &bull; <b>Q+LMB</b> Stun Kick &bull; <b>E</b> 2x Vault Dash &bull; <b>R</b> Pit Arena &bull; <b>P</b> Shop &bull; <b>F</b> Ward &bull; <b>B</b> Recall',
    tooltips: {
      P: {
        title: 'Passive • Coliseum Rhythm',
        meta: 'Innate Combo & Siphon',
        metaColor: '#fb7185',
        body: 'She chains rapid <b>left/right hook combinations</b> in melee combat, siphoning Move Speed. Wall-rebounding with <b>E: Vault Dash</b> grants her a <b>Coliseum Barrier Shield</b> and unlocks a second recast dash.',
        talentLevels: [3, 7]
      },
      LMB: {
        title: 'LMB • Heavy Knuckle Combo',
        meta: '0 MP • 1.04s Base ATK',
        body: 'She strikes enemies in front of her for <b>100% Physical ATK</b>, alternating between rapid jabs and heavy cross hooks.',
        talentLevels: [3, 7]
      },
      Q: {
        title: 'Q • MMA Roundhouse Kick',
        meta: '40 MP • 7.5s / 6.8s / 6.0s CD (Lv 1/6/9)',
        body: 'Empowers her next basic attack (or fires immediately if an enemy is in range) to unleash a spinning roundhouse kick that deals <b>85 (+14/Lv + 90% ATK) Physical Damage</b> and <b>Stuns for 1.0s / 1.1s / 1.2s</b>.',
        talentLevels: [3]
      },
      E: {
        title: 'E • 2x Cage Vault Dash',
        meta: '50 MP • 10.0s / 9.0s / 8.0s CD (Lv 1/6/9)',
        body: 'She lunges forward with a <b>Flying Kick</b>. Colliding with an enemy or wall/pillar grants a <b>Shield</b> and unlocks a <b>2nd Recast (Running Slide)</b> within 3.0s.',
        talentLevels: [7]
      },
      R: {
        title: 'R • Bloodsport Pit Arena',
        meta: '95 MP • 46s / 40s / 34s CD (Lv 4/8/12)',
        body: 'She slams the ground to erect an octagonal ring of <b>Coliseum Stone Walls</b> for 5.0s (+20% / 25% / 30% damage inside), trapping enemies and creating rebound surfaces for <b>E: Vault Dash</b>.',
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
    const punchFbx = fbxLoader.parse(b64ToBuffer(bundle.punchFbxB64), '');
    if (punchFbx.animations[0]) targetTmpl.clips.punch = punchFbx.animations[0];
    if (bundle.punch2FbxB64) {
      const punch2Fbx = fbxLoader.parse(b64ToBuffer(bundle.punch2FbxB64), '');
      if (punch2Fbx.animations[0]) targetTmpl.clips.punch2 = punch2Fbx.animations[0];
    }
    const kickFbx = fbxLoader.parse(b64ToBuffer(bundle.kickFbxB64), '');
    if (kickFbx.animations[0]) targetTmpl.clips.kick = kickFbx.animations[0];
    if (bundle.slideFbxB64) {
      const slideFbx = fbxLoader.parse(b64ToBuffer(bundle.slideFbxB64), '');
      if (slideFbx.animations[0]) targetTmpl.clips.slide = slideFbx.animations[0];
    }
    if (bundle.jumpFbxB64) {
      const jumpFbx = fbxLoader.parse(b64ToBuffer(bundle.jumpFbxB64), '');
      if (jumpFbx.animations[0]) targetTmpl.clips.jump = jumpFbx.animations[0];
    }
    return idleFbx;
  },

  // LMB: alternating hook punches, or the Q-armed Crushing Kick (impact resolves in onStrikeImpact)
  onBasicAttack(st, qWasArmed) {
    const isKick = qWasArmed;

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
  },

  // LMB hook punches (+ 7R Haymaker Cleave every 3rd) OR empowered Q Crushing Kick impact; siphons Move Speed
  onStrikeImpact(strike, ctx) {
    const { st, pProg, talents } = ctx;
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
  },

  // Q Crushing Kick (arms next LMB), E Rebound Rush (2x dash), R The Pit Arena
  cast(slot, ctx) {
    const { st, pProg, talents, cdrMult, rQE, rUlt } = ctx;
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
  },

  // E Rebound Rush: per-frame dash collision results (wall/arena rim/dummy/unit hit -> damage, shield, rebound)
  onDashStep(ctx) {
    const { st, pProg, talents, hitWall, hitArenaRim, hitDummy, hitHostile } = ctx;
    if (!hero.dashHit && (hitWall || hitDummy || hitHostile)) {
      hero.dashHit = true;
      const rimMult = hitArenaRim ? (talents[10] === 'R' ? 1.65 : 1.35) : 1.0;
      const dashDmg = Math.round((58 + (pProg.level || 1) * 10 + st.atk * 0.50) * rimMult);
      if (hitDummy) damageDummy(hitDummy, dashDmg);
      if (hitHostile && phase1Engine) {
        phase1Engine.dealPlayerDamageToUnit(hitHostile, dashDmg);
        if (hero.dashKind === 'first') {
          const ux = hero.x - hitHostile.x;
          const uz = hero.z - hitHostile.z;
          const ud = Math.hypot(ux, uz) || 0.01;
          if (ud < hero.r + hitHostile.r + 0.08) {
            hero.x = hitHostile.x + (ux / ud) * (hero.r + hitHostile.r + 0.08);
            hero.z = hitHostile.z + (uz / ud) * (hero.r + hitHostile.r + 0.08);
          }
        }
      }
      if (hitArenaRim) {
        spawnShockRing(hero.x, hero.z, 0xf43f5e, 0.35, 2.8, 0.32);
        dummies.forEach((d) => {
          if (d !== hitDummy && (!d.isShooter || shooterEnabled) && Math.hypot(d.x - hero.x, d.z - hero.z) <= 2.8 + d.r) {
            damageDummy(d, dashDmg, '#fde047');
          }
        });
        if (phase1Engine) {
          phase1Engine.getHostileTargets().forEach((t) => {
            if ((!hitHostile || t.ref !== hitHostile.ref) && Math.hypot(t.x - hero.x, t.z - hero.z) <= 2.8 + t.r) {
              phase1Engine.dealPlayerDamageToUnit(t, dashDmg, { color: '#fde047' });
            }
          });
        }
      }
      if (hero.dashKind === 'first') {
        hero.dashTimer = 0;
        const rQE = (pProg.level || 1) >= 9 ? 2 : ((pProg.level || 1) >= 6 ? 1 : 0);
        const shieldMult = (talents[7] === 'L' ? 1.35 : 1.0) * (hitArenaRim ? 1.35 : 1.0);
        hero.shield = Math.round(([180, 240, 300][rQE] + (pProg.level || 1) * 15) * shieldMult);
        hero.shieldTimer = 3.5;
        hero.eRecast = 3.0;
        SFX.play(hitArenaRim ? 'arena' : 'punch');
        spawnShockRing(hero.x, hero.z, 0xfbbf24, 0.3, 1.8, 0.25);
        spawnFloat(
          hero.x,
          2.65,
          hero.z,
          hitArenaRim ? 'PIT WALL REBOUND! (+35% SHIELD & AOE)' : 'REBOUND! 2ND DASH',
          '#fde047'
        );
      }
    }
    if (hero.dashTimer <= 0 && hero.dashKind === 'second' && talents[7] === 'L') {
      spawnShockRing(hero.x, hero.z, 0xf43f5e, 0.3, 2.4, 0.3);
      if (phase1Engine) {
        phase1Engine.getHostileTargets().forEach((t) => {
          if (Math.hypot(t.x - hero.x, t.z - hero.z) <= 2.4 + t.r) {
            phase1Engine.dealPlayerDamageToUnit(t, 95);
          }
        });
      }
    }
  },

  // Passive slot pip text ('' hides it)
  passivePip(st) {
    return hero.siphonBonus > 0 ? '+' + Math.round(hero.siphonBonus * 100) + '%' : '';
  }
};
})();
