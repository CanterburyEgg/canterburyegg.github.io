// Shirtless Bodyguard: Support • Melee Vanguard
// Hero kit: data (stats, talents, UI text) + player ability code moved verbatim from js/arena/*.js and phase1_data.js.
// Functions run in the shared global scope of js/arena/*.js (hero, actions, fadeToAction, damageDummy, ...).
// Still in phase1_engine.js until Phase 2: Stand Behind Me! guard stacks (getPlayerStats) and 10L Thorns of Brass reflect.
(function () {
'use strict';
const H = (window.MOBA_HEROES = window.MOBA_HEROES || {});

// Post-process Guardian v2 FBX skin weights so his skull, jaw, mouth, and beard are 100% rigid on mixamorigHead!
function lockGuardianHeadSkinWeights(fbxRoot) {
  fbxRoot.traverse((ch) => {
    if (!ch.isSkinnedMesh || !ch.geometry || !ch.skeleton) return;
    const geom = ch.geometry;
    const posAttr = geom.attributes.position;
    const skinIdx = geom.attributes.skinIndex;
    const skinWgt = geom.attributes.skinWeight;
    if (!posAttr || !skinIdx || !skinWgt) return;

    let headBoneIdx = -1;
    ch.skeleton.bones.forEach((b, idx) => {
      if (canonicalMixamoBone(b.name) === 'Head') headBoneIdx = idx;
    });
    if (headBoneIdx < 0) return;

    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    const H = Math.max(0.001, maxY - minY);
    const cx = (minX + maxX) * 0.5;

    for (let i = 0; i < posAttr.count; i++) {
      const nx = Math.abs(posAttr.getX(i) - cx) / H;
      const ny = (posAttr.getY(i) - minY) / H;
      const nz = posAttr.getZ(i) / H;

      // Entire upper skull/hair (ny >= 0.852) OR front jaw/mouth/mustache/beard down to goatee tip (ny >= 0.820 && nz >= 0.016)
      const isRigidHead = (nx <= 0.056) && (ny >= 0.852 || (ny >= 0.820 && nz >= 0.016));
      if (isRigidHead) {
        skinIdx.setXYZW(i, headBoneIdx, 0, 0, 0);
        skinWgt.setXYZW(i, 1.0, 0.0, 0.0, 0.0);
      } else if (nx <= 0.054 && ny >= 0.798 && ny < 0.820 && nz >= 0.012) {
        // Smooth transition collar on upper throat just below beard tip
        const t = (ny - 0.798) / 0.022;
        const w0 = skinWgt.getX(i) * (1 - t);
        const w1 = skinWgt.getY(i) * (1 - t);
        const w2 = skinWgt.getZ(i) * (1 - t);
        skinIdx.setW(i, headBoneIdx);
        skinWgt.setXYZW(i, w0, w1, w2, t);
      }
    }
    skinIdx.needsUpdate = true;
    skinWgt.needsUpdate = true;
  });
}

H.bodyguard = {
  id: 'bodyguard',

  bundle: { label: 'Shirtless Bodyguard', src: 'assets/guardian/guardian_mixamo_bundle.js', globalKey: 'GUARDIAN_MIXAMO', pStart: 68, pEnd: 78 },
  moveSpeed: 6.05, // world units/s before bonuses
  hudSpeed: 334,   // SPD number shown in the HUD
  clipTweaks: { jumpClampHips: true },
  pillLabels: { kick: 'Haymaker', dash: 'Leap' }, // dev toolbar animation-slot pills

  spec: {
    id: 'bodyguard',
    name: 'Coliseum Bodyguard',
    role: 'Support • Melee Crowd-Control Bouncer',
    glyph: 'B',
    color: '#eab308',
    height: 2.38,
    baseHp: 1760, hpGrow: 140,
    baseMp: 300, mpGrow: 26, mpRegen: 5.5,
    baseAtk: 50, atkGrow: 5.0,
    baseFant: 0, fantGrow: 0,
    baseArmor: 28, armorGrow: 3.4,
    baseFResist: 25, fResistGrow: 3.0,
    baseSpd: 6.05,
    atkCd: 1.30,
    mpCosts: { Q: 45, E: 55, R: 90 }
  },

  talents: {
    3: {
      L: { id: '3L', name: 'Into the Stonework', desc: 'Q Haymaker knocking an enemy into a Wall, Tree, or Tower Stuns for 1.0s' },
      R: { id: '3R', name: 'Broad Shoulders', desc: 'Allies behind you receive 50% (+7/stack) of your Passive Armor & Resist' }
    },
    7: {
      L: { id: '7L', name: 'Sky Drop', desc: 'E Crowd Dive leap range +25% and Slow increased from 35% to 50%' },
      R: { id: '7R', name: 'Heroic Rescue', desc: 'Allies inside E landing zone gain a Shield and have Slows cleansed' }
    },
    10: {
      L: { id: '10L', name: 'Thorns of Brass', desc: 'R Eyes On Me! radius +25% and reflects 25% of damage taken while Shield holds' },
      R: { id: '10R', name: 'Peak Physique', desc: 'Casting R grants doubled max Passive resists (+84 Armor & Resist) for 6s' }
    }
  },

  ui: {
    height: 2.38,
    modelLabel: 'Shirtless Bodyguard (Coliseum Strongman)',
    glyph: 'B',
    color: '#38bdf8',
    name: 'Shirtless Bodyguard (3D)',
    role: 'Support • Melee Vanguard Tank & Protector',
    passive: 'Stand Behind!',
    lmb: 'Knuckles',
    q: 'Haymaker',
    e: 'Crowd Dive',
    r: 'Eyes On Me!',
    banner: '<b>1/2/3/4</b> Hero &bull; <b>Passive</b> Stand Behind Me! (+Armor/Res screening Allies) &bull; <b>Q</b> Knockback Haymaker &bull; <b>E</b> Crowd Dive Leap &bull; <b>R</b> AoE Taunt + Shield &bull; <b>P</b> Shop',
    tooltips: {
      P: {
        title: 'Passive • Stand Behind Me!',
        meta: 'Innate Vanguard Aura',
        body: 'Positioning yourself between nearby enemies and an allied Hero grants up to <b>3 stacks of Guard (+14 Armor & +14 Fantasy Resist per stack, up to +42)</b>.',
        talentLevels: [3, 10]
      },
      LMB: {
        title: 'LMB • Brass Knuckles',
        meta: '0 MP • 1.30s Base ATK',
        body: 'Delivers a heavy close-range hook punch dealing <b>100% Physical ATK</b> in a wide frontal arc.'
      },
      Q: {
        title: 'Q • Bouncer Haymaker',
        meta: '45 MP • 7.5s / 6.5s / 5.5s CD (Lv 1/6/9)',
        body: 'Unleashes a massive uppercut that deals <b>Physical Damage</b> and <b>knocks enemies back 3.8m</b>. (With Lv3 Talent, knocking foes into walls/trees Stuns for 1.0s!)',
        talentLevels: [3]
      },
      E: {
        title: 'E • Crowd Dive',
        meta: '55 MP • 11.0s / 9.5s / 8.0s CD (Lv 1/6/9)',
        body: 'Leaps high through the air to the target location, slamming the ground on impact to deal <b>Physical Damage</b> and <b>Slow enemies by 35% for 1.8s / 2.1s / 2.4s</b>.',
        talentLevels: [7]
      },
      R: {
        title: 'R • Eyes On Me!',
        meta: '90 MP • 44s / 38s / 32s CD (Lv 4/8/12)',
        body: 'Roars a thunderous battle-cry that deals AoE Physical Damage, <b>Taunts all nearby enemies for 1.5s / 1.75s / 2.0s</b>, and grants a massive <b>Barrier Shield</b> scaling with each enemy hit.',
        talentLevels: [10]
      }
    }
  },

  // Parse the Mixamo bundle into a hero template (model, texture, animation clips)
  parseBundle(gBundle, targetTmpl) {
    if (!gBundle || targetTmpl.fbx) return targetTmpl.fbx;
    targetTmpl.tex = loadHeroDiffuseTexture(gBundle.diffuseDataUrl);
    const gIdleFbx = fbxLoader.parse(b64ToBuffer(gBundle.idleFbxB64), '');
    gIdleFbx.traverse((ch) => {
      if (ch.isMesh && ch.geometry && !ch.geometry.attributes.normal) {
        ch.geometry.computeVertexNormals();
      }
    });
    lockGuardianHeadSkinWeights(gIdleFbx);
    targetTmpl.fbx = gIdleFbx;
    if (gIdleFbx.animations[0]) targetTmpl.clips.idle = gIdleFbx.animations[0];
    const gRunFbx = fbxLoader.parse(b64ToBuffer(gBundle.runFbxB64), '');
    if (gRunFbx.animations[0]) targetTmpl.clips.run = gRunFbx.animations[0];
    const gPunchFbx = fbxLoader.parse(b64ToBuffer(gBundle.punchFbxB64), '');
    if (gPunchFbx.animations[0]) targetTmpl.clips.punch = gPunchFbx.animations[0];
    const gKickFbx = fbxLoader.parse(b64ToBuffer(gBundle.kickFbxB64), '');
    if (gKickFbx.animations[0]) targetTmpl.clips.kick = gKickFbx.animations[0];
    if (gBundle.jumpFbxB64) {
      const gJumpFbx = fbxLoader.parse(b64ToBuffer(gBundle.jumpFbxB64), '');
      if (gJumpFbx.animations[0]) targetTmpl.clips.jump = gJumpFbx.animations[0];
    }
    if (gBundle.tauntFbxB64) {
      const gTauntFbx = fbxLoader.parse(b64ToBuffer(gBundle.tauntFbxB64), '');
      if (gTauntFbx.animations[0]) targetTmpl.clips.slide = gTauntFbx.animations[0];
    }
    return gIdleFbx;
  },

  // LMB Brass Knuckles hook punch (impact resolves in onStrikeImpact)
  onBasicAttack(st) {
    hero.atkTimer = 1.30 / (1 + st.asPct);
    // Hook Punch.fbx (2.17s): skip the 0.42s off-hand guard shift and start right as the right shoulder cocks back;
    // at 2.15x speed, the Right-Hand Hook Punch impacts at t = 0.27s (clipTime = 1.00s) and finishes follow-through at 0.50s!
    hero.punchAnim = 0.50;
    if (actions.punch) {
      fadeToAction(actions.punch, 0.05, true, 2.15, 0.42);
    }
    pendingStrike = { isKick: false, isHaymaker: false, facing: hero.facing, t: 0.27 };
  },

  // LMB Brass Knuckles OR Q Bouncer Haymaker knockback impact
  onStrikeImpact(strike, ctx) {
    const { st, pProg, talents } = ctx;
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
  },

  // Q Bouncer Haymaker, E Crowd Dive, R Eyes On Me!
  cast(slot, ctx) {
    const { st, pProg, talents, cdrMult, rQE, rUlt } = ctx;
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
  },

  // E Crowd Dive landing slam (+ 7R Heroic Rescue shields)
  onLeapLand(ctx) {
    const { st, pProg, talents } = ctx;
    // Bodyguard E (Crowd Dive) Landing Slam!
    const rQE = (pProg.level || 1) >= 9 ? 2 : ((pProg.level || 1) >= 6 ? 1 : 0);
    const slamR = 2.85;
    const slamDmg = Math.round(55 + (pProg.level || 1) * 10 + st.atk * 0.70);
    const slamSlow = [1.8, 2.1, 2.4][rQE] + (talents[7] === 'L' ? 0.5 : 0);
    SFX.play('arena');
    spawnShockRing(hero.x, hero.z, 0x38bdf8, 0.35, slamR, 0.32);

    dummies.forEach((d) => {
      if (d.isShooter && !shooterEnabled) return;
      if (Math.hypot(d.x - hero.x, d.z - hero.z) <= slamR + d.r) {
        damageDummy(d, slamDmg, '#38bdf8');
        d.slowTimer = Math.max(d.slowTimer || 0, slamSlow);
        spawnFloat(d.x, 2.65, d.z, talents[7] === 'L' ? '50% SLOW!' : '35% SLOW!', '#38bdf8');
      }
    });
    if (phase1Engine) {
      phase1Engine.getHostileTargets().forEach((t) => {
        if (t.kind === 'structure') return;
        if (Math.hypot(t.x - hero.x, t.z - hero.z) <= slamR + t.r) {
          phase1Engine.dealPlayerDamageToUnit(t, slamDmg, {
            dmgType: 'physical',
            slowDur: slamSlow,
            color: '#38bdf8'
          });
        }
      });
      // Talent 7R (Heroic Rescue): Shield self + nearby Allied Bots & cleanse slows!
      if (talents[7] === 'R') {
        const rescueSh = 140 + (pProg.level || 1) * 20;
        hero.shield = Math.max(hero.shield, rescueSh);
        hero.shieldTimer = 3.5;
        let shieldedAllies = 0;
        if (phase1Engine.getAlliedTargets) {
          phase1Engine.getAlliedTargets().forEach((ally) => {
            if (Math.hypot(ally.x - hero.x, ally.z - hero.z) <= 3.4) {
              ally.shield = Math.max(ally.shield || 0, rescueSh);
              ally.shieldTimer = 3.5;
              ally.slowTimer = 0;
              shieldedAllies++;
            }
          });
        }
        spawnFloat(hero.x, 2.85, hero.z, 'HEROIC RESCUE! (+' + rescueSh + ' SHIELD' + (shieldedAllies > 0 ? ' TO ALLIES' : '') + ')', '#fde047');
      }
    }
  },

  // Release the E Jump Attack clip right after the 1.60s ground slam + brief follow-through (1.92s) so it doesn't linger
  releaseOneShotClips() {
    if (actions.jump && activeAction === actions.jump && hero.leapTimer <= 0 && actions.jump.time >= 1.92) {
      oneShotActive = false;
      if (actions.idle) fadeToAction(actions.idle, 0.16, false, 1.0);
    }
  },

  // Overhead plate tag
  hudTag(st) {
    return (st.bgStacks || 0) > 0 ? ' [GUARD x' + st.bgStacks + ']' : '';
  },

  // Passive slot pip text ('' hides it)
  passivePip(st) {
    return (st.bgStacks || 0) > 0 ? st.bgStacks + 'x' : '';
  },

  rEmpowered() {
    return (hero.rShieldTimer || 0) > 0;
  }
};
})();
