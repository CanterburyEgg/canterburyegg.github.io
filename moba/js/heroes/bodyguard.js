// Shirtless Bodyguard: Support • Melee Vanguard
// Hero kit: data (stats, talents, UI text) + player ability code moved verbatim from js/arena/*.js and phase1_data.js.
// Functions run in the shared global scope of js/arena/*.js (hero, actions, fadeToAction, damageDummy, ...).
// Still in phase1_engine.js: Stand Behind Me! guard stacks (getPlayerStats / unitResist) and the talents that read
// them (3L Broad Shoulders, 7L Counterpunch arming, 10L Last Stand).
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

// Kit numbers (DESIGN_RULES Bodyguard)
const WALL_STUN = 0.5;      // Q: stun when the knockback slams them into a wall / tree / tower
const SLAM_KNOCKUP = 0.25;  // E landing: knock-up
const SLAM_SLOW = 1.0;      // E landing: slow after the knock-up
// Talents
const BIG_LUNGS = 1.20;       // 3R: Eyes On Me! radius
const COUNTER_STUN = 0.75;    // 7L: Counterpunch Haymaker stun
const BRACE_TIME = 1.5;       // 7R: damage reduction after landing
const BRACE_MULT = 0.80;      //     (20% less damage taken)
const BOUNCER_PULL = 2.5;     // 10R: drag taunted enemies toward him

// 7R Unstoppable: 20% less damage for a moment after Crowd Dive lands (every damage path runs Combat.mitigate)
window.MOBA_COMBAT.damageMults.push((info, target) => (target && (target.bgBraceUntil || 0) > KitFx.time ? BRACE_MULT : 1));

H.bodyguard = {
  id: 'bodyguard',
  roster: { order: 4, emoji: '🛡️', short: 'Bodyguard' },

  bundle: { label: 'Shirtless Bodyguard', src: 'assets/bodyguard/bodyguard_bundle.js', globalKey: 'GUARDIAN_MIXAMO', pStart: 35, pEnd: 45 },
  moveSpeed: 6.05, // world units/s before bonuses
  hudSpeed: 334,   // SPD number shown in the HUD
  clipTweaks: { jumpClampHips: true },
  pillLabels: { kick: 'Haymaker', dash: 'Leap' }, // dev toolbar animation-slot pills

  // All of the Bodyguard's damage numbers in one place. Punches are Attack damage; the Q haymaker, E slam and R taunt
  // burst are Ability damage.
  dmg: {
    punch: (st) => Math.round(st.attack),
    haymaker: (st, lvl, rQE) => Math.round([125, 195, 265][rQE] + 9 * ((lvl || 1) - 1) + st.ability * 0.7),
    slam: (st, lvl, rQE) => Math.round([100, 155, 210][rQE] + 8 * ((lvl || 1) - 1) + st.ability * 0.6),
    taunt: (st, rUlt) => Math.round([140, 225, 310][rUlt] + st.ability * 0.8)
  },

  spec: {
    id: 'bodyguard',
    name: 'Coliseum Bodyguard',
    role: 'Support • Melee Crowd-Control Bouncer',
    glyph: 'B',
    color: '#eab308',
    height: 2.38,
    baseHp: 1700, hpGrow: 122,
    baseMp: 300, mpGrow: 26, mpRegen: 5.5,
    // Stat model (DESIGN_RULES §2): tank, low on both (~107 / 190 / 372 dps = 2/3 of the budget, no items)
    baseAttack: 70, attackGrow: 7.5,
    baseAbility: 20, abilityGrow: 3.0,
    baseResist: 26, resistGrow: 3.2,
    asGrow: 0.03,
    baseSpd: 6.05,
    atkCd: 1.30,
    mpCosts: { Q: 45, E: 55, R: 90 }
  },

  // TALENTS_PLAN.md: L = Protector, R = Initiator. Broad Shoulders, Counterpunch and Last Stand need the guard data,
  // so they live next to the passive in phase1_engine.js; the rest are in this file.
  talents: {
    3: {
      L: { id: '3L', name: 'Broad Shoulders', desc: 'Every ally you are screening gets half your Guard Resist (+7 per stack).' },
      R: { id: '3R', name: 'Big Lungs', desc: 'Eyes On Me! reaches 20% farther.' }
    },
    7: {
      L: { id: '7L', name: 'Counterpunch', desc: 'When an enemy hero damages an ally you are screening, your next Haymaker within 3s stuns for 0.75s, wall or no wall.' },
      R: { id: '7R', name: 'Unstoppable', desc: 'Crowd control can\'t touch you during Crowd Dive, and you take 20% less damage for 1.5s after landing.' }
    },
    10: {
      L: { id: '10L', name: 'Last Stand', desc: 'Once every 60s, a hit that would kill an ally you are screening lands on you instead, and they are untargetable for 1s.' },
      R: { id: '10R', name: "Bouncer's Call", desc: 'Eyes On Me! drags taunted enemies 2.5m toward you before the taunt.' }
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
    banner: '<b>1/2/3/4</b> Hero &bull; <b>Passive</b> Stand Behind Me! (+Resist screening Allies) &bull; <b>Q</b> Knockback Haymaker &bull; <b>E</b> Crowd Dive Leap &bull; <b>R</b> AoE Taunt + Shield &bull; <b>P</b> Shop',
    tooltips: {
      P: {
        title: 'Passive • Stand Behind Me!',
        meta: 'Innate Vanguard Aura',
        body: 'While you stand between an enemy hero and an allied hero you build <b>Guard</b> (+14 Resist per stack, max 3 = +42). Stacks build <b>one at a time</b> and fade <b>one at a time</b> (1 per 1.5s), so a dive keeps them for a few seconds. A faint tether shows who you\'re guarding.'
      },
      LMB: {
        title: 'LMB • Brass Knuckles',
        meta: '0 MP • 1.30s Base ATK',
        body: 'Delivers a heavy close-range hook punch dealing <b>100% Attack</b> in a wide frontal arc.'
      },
      Q: {
        title: 'Q • Bouncer Haymaker',
        meta: '45 MP • 7.5s / 6.5s / 5.5s CD (Lv 1/6/9)',
        body: 'Unleashes a massive uppercut that deals <b>125 / 195 / 265 (+9/Lv) + 70% Ability</b> and <b>knocks enemies back 3.8m</b>. Knocking someone into a <b>wall, tree or tower stuns them for 0.5s</b>.'
      },
      E: {
        title: 'E • Crowd Dive',
        meta: '55 MP • 11.0s / 9.5s / 8.0s CD (Lv 1/6/9)',
        body: 'Leaps high through the air to the target location, slamming the ground on impact to deal <b>100 / 155 / 210 (+8/Lv) + 60% Ability</b>, <b>knocking enemies up for 0.25s</b> and then <b>slowing them for 1s</b>.'
      },
      R: {
        title: 'R • Eyes On Me!',
        meta: '90 MP • 44s / 38s / 32s CD (Lv 4/8/12)',
        body: 'Roars a thunderous battle-cry that deals <b>140 / 225 / 310 + 80% Ability</b> around him, <b>Taunts all nearby enemies for 1.5s / 1.75s / 2.0s</b>, and grants a massive <b>Barrier Shield</b> scaling with each enemy hit.'
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
    return this.basicAttackFor(KitFx.player, st);
  },

  basicAttackFor(actor, st) {
    if (!actor.isPlayer) {
      const u = actor.unit, a = actor.aim();
      u.facing = Math.atan2(a.x - u.x, a.z - u.z);
      actor.play('punch', 0.05, true, 2.15, 0.42, 0.5);
      u.bgStrike = { isKick: false, isHaymaker: false, facing: u.facing, t: 0.27 };
      const L = (window.__kitBotLog = window.__kitBotLog || {}); L.bg_lmb = (L.bg_lmb || 0) + 1;
      return;
    }
    hero.atkTimer = KitFx.atkInterval(H.bodyguard.spec.atkCd, st);
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
    return this.strikeImpactFor(KitFx.player, strike, ctx);
  },

  strikeImpactFor(actor, strike, ctx) {
    const { st, pProg, talents } = ctx;
    const hero = actor.unit; // (local alias: the striker)
    const reach = strike.isHaymaker ? 1.45 : 1.18;
    const fx = hero.x + Math.sin(strike.facing) * reach;
    const fz = hero.z + Math.cos(strike.facing) * reach;
    const hitRadius = strike.isHaymaker ? 2.25 : 1.58;
    spawnShockRing(fx, fz, strike.isHaymaker ? 0x38bdf8 : 0xfbbf24, 0.28, hitRadius, 0.26);

    const rQE = (pProg.level || 1) >= 9 ? 2 : ((pProg.level || 1) >= 6 ? 1 : 0);
    const dmg = strike.isHaymaker
      ? H.bodyguard.dmg.haymaker(strike.st || st, pProg.level, rQE) // (Q: the stats from cast time)
      : H.bodyguard.dmg.punch(st);
    const kbDist = strike.isHaymaker ? 3.8 : 0;
    const wallStun = strike.isHaymaker ? WALL_STUN : 0; // Q: knocked into a wall / tree / tower = stunned
    // 7L Counterpunch: armed by the engine (an enemy hero hit someone he's screening in the last 3s); used up by this Haymaker
    const counter = strike.isHaymaker && (hero.counterUntil || 0) > KitFx.time;
    if (counter) {
      hero.counterUntil = 0;
      spawnFloat(hero.x, 2.9, hero.z, 'COUNTERPUNCH!', '#38bdf8');
    }
    const stunDur = counter ? COUNTER_STUN : 0;

    if (actor.isPlayer) dummies.forEach((d) => {
      if (d.isShooter && !shooterEnabled) return;
      if (Math.hypot(d.x - fx, d.z - fz) <= hitRadius + d.r) {
        damageDummy(d, dmg, strike.isHaymaker ? '#38bdf8' : '#fb7185');
        if (stunDur > 0) CC.apply(d, { stunDur }, { x: hero.x, z: hero.z, unit: hero });
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
      actor.hostiles().forEach((t) => {
        if (Math.hypot(t.x - fx, t.z - fz) <= hitRadius + t.r) {
          let dirX = t.x - hero.x;
          let dirZ = t.z - hero.z;
          if (Math.hypot(dirX, dirZ) < 0.05) {
            dirX = Math.sin(strike.facing);
            dirZ = Math.cos(strike.facing);
          }
          actor.damage(t, dmg, {
            isBasic: !strike.isHaymaker,
            dmgType: 'physical',
            knockbackDist: kbDist,
            knockbackDirX: dirX,
            knockbackDirZ: dirZ,
            kbOriginX: hero.x,
            kbOriginZ: hero.z,
            castId: strike.castId, // Q haymaker strikes carry their cast (basics leave it unset)
            wallStun,
            stunDur: stunDur || undefined
          });
        }
      });
    }
    return;
  },

  // Q Bouncer Haymaker, E Crowd Dive, R Eyes On Me!
  cast(slot, ctx) {
    return this.castFor(KitFx.player, slot, ctx);
  },

  castFor(actor, slot, ctx) {
    if (!ctx) {
      ctx = KitFx.castCtx(actor);
    }
    const { st, pProg, talents, cdrMult, rQE, rUlt } = ctx;
    if (!actor.isPlayer) return this.botCast(actor, slot, ctx);
    if (slot === 'Q') {
      if (hero.leapTimer > 0) return;
      if (!wtfMode && hero.cdQ > 0) return;
      if (!trySpendMana('Q')) return;
      hero.cdQ = wtfMode ? 0.22 : [7.5, 6.5, 5.5][rQE] * cdrMult;
      hero.kickAnim = 0.38;
      const act = actions.kick || actions.punch;
      if (act) fadeToAction(act, 0.05, true, 1.65);
      SFX.play('chime');
      pendingStrike = { isKick: false, isHaymaker: true, facing: hero.facing, t: 0.24, castId: KitFx.castId(), st };
      spawnFloat(hero.x, 2.6, hero.z, 'BOUNCER HAYMAKER!', '#38bdf8');
    } else if (slot === 'E') {
      if (hero.leapTimer > 0) return;
      if (!wtfMode && hero.cdE > 0) return;
      if (!trySpendMana('E')) return;
      hero.cdE = wtfMode ? 0.30 : [11.0, 9.5, 8.0][rQE] * cdrMult;

      const maxLeap = 7.8;
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
      hero.leapCastId = KitFx.castId(); // the landing slam (leapLandFor) belongs to this cast
      hero.leapSt = st; // ...and uses the stats from cast time
      if (KitFx.tal(ctx, 7, 'R')) this.unstoppable(hero);
    } else if (slot === 'R') {
      if (!wtfMode && pProg.level < 4) {
        spawnFloat(hero.x, 2.6, hero.z, 'ULTIMATE UNLOCKS AT LEVEL 4!', '#fb7185');
        return;
      }
      if (!wtfMode && hero.cdR > 0) return;
      if (!trySpendMana('R')) return;
      hero.cdR = wtfMode ? 0.45 : [44.0, 38.0, 32.0][rUlt] * (ctx.ultCdrMult || cdrMult);
      this.eyesOnMe(KitFx.player, ctx);
    }
    return;
  },

  // R Eyes On Me! for any actor: taunt + damage around her, shield scaled by how many enemies she caught
  eyesOnMe(actor, ctx) {
    const { st, pProg, talents, rUlt } = ctx;
    const hero = actor.unit;
    {
      const rRad = 4.8 * (KitFx.tal(ctx, 3, 'R') ? BIG_LUNGS : 1); // 3R Big Lungs
      const pull = KitFx.tal(ctx, 10, 'R'); // 10R Bouncer's Call
      // how far to drag a target at (x, z): up to 2.5m, stopping short of his body
      const pullDist = (x, z, r) => Math.max(0, Math.min(BOUNCER_PULL, Math.hypot(x - hero.x, z - hero.z) - (hero.r || 0.62) - (r || 0.5) - 0.3));
      const rDmg = H.bodyguard.dmg.taunt(st, rUlt);
      const tauntDur = [1.5, 1.75, 2.0][rUlt];
      let enemyScore = 0;

      if (actor.isPlayer) dummies.forEach((d) => {
        if (d.isShooter && !shooterEnabled) return;
        if (Math.hypot(d.x - hero.x, d.z - hero.z) <= rRad + d.r) {
          damageDummy(d, rDmg, '#fde047');
          enemyScore += 2;
          spawnFloat(d.x, 2.75, d.z, 'TAUNTED (' + tauntDur + 's)!', '#fde047');
          const pd = pull ? pullDist(d.x, d.z, d.r) : 0;
          if (pd > 0) {
            const l = Math.hypot(hero.x - d.x, hero.z - d.z) || 1, kbDur = 0.2;
            d.kbVx = ((hero.x - d.x) / l) * (pd / kbDur);
            d.kbVz = ((hero.z - d.z) / l) * (pd / kbDur);
            d.kbTimer = kbDur;
            d.kbWallStun = 0;
            d.resetDelay = 3.5;
          }
        }
      });
      if (phase1Engine) {
        actor.hostiles().forEach((t) => {
          if (t.kind === 'structure') return;
          if (Math.hypot(t.x - hero.x, t.z - hero.z) <= rRad + t.r) {
            const pd = pull && t.kind !== 'deployable' ? pullDist(t.x, t.z, t.r) : 0;
            const hit = actor.damage(t, rDmg, {
              dmgType: 'physical',
              tauntDur,
              color: '#fde047',
              // 10R: a short knockback toward him (no wall stun)
              knockbackDist: pd > 0 ? pd : undefined,
              knockbackDirX: hero.x - t.x,
              knockbackDirZ: hero.z - t.z,
              knockbackDur: 0.2,
              wallStun: 0
            });
            if (hit) enemyScore += (t.kind === 'bot' || t.kind === 'player' ? 2 : 1);
          }
        });
      }

      hero.shield = Math.round(140 + (pProg.level || 1) * 20 + enemyScore * 50);
      hero.shieldTimer = 4.5;
      hero.rShieldTimer = 4.5;
      hero.kickAnim = 0.72;
      if (actor.isPlayer) {
        const tauntAct = actions.slide || actions.kick;
        if (tauntAct) fadeToAction(tauntAct, 0.05, true, 1.55, 0.10);
      } else actor.play('slide', 0.05, true, 1.55, 0.10, 0.65);
      SFX.play('arena');
      spawnShockRing(hero.x, hero.z, 0xfbbf24, 0.5, rRad, 0.38);
      spawnShockRing(hero.x, hero.z, 0x38bdf8, 0.3, rRad * 0.75, 0.28);
      spawnFloat(hero.x, 2.9, hero.z, 'EYES ON ME! (+' + hero.shield + ' SHIELD)', '#fde047');
    }
    return;
  },

  // 7R Unstoppable: no new crowd control for the whole leap (CC.immuneOf)
  unstoppable(u) {
    u.ccImmuneTimer = (u.leapDur || 0.42) + 0.05;
    spawnFloat(u.x, 3.0, u.z, 'UNSTOPPABLE', '#fbbf24');
  },

  // E Crowd Dive landing slam (+ 7R Unstoppable damage reduction)
  onLeapLand(ctx) {
    return this.leapLandFor(KitFx.player, ctx);
  },

  leapLandFor(actor, ctx) {
    const { st, pProg, talents } = ctx;
    const hero = actor.unit; // (local alias: the lander)
    // 7R Unstoppable: 20% less damage for 1.5s after landing (damageMults hook at the top of this file)
    if (KitFx.tal(ctx, 7, 'R')) hero.bgBraceUntil = KitFx.time + BRACE_TIME;
    // Bodyguard E (Crowd Dive) Landing Slam!
    const rQE = (pProg.level || 1) >= 9 ? 2 : ((pProg.level || 1) >= 6 ? 1 : 0);
    const slamR = 2.85;
    const slamDmg = H.bodyguard.dmg.slam(hero.leapSt || st, pProg.level, rQE);
    // landing: a short knock-up, then a short slow (the slow runs past the knock-up)
    SFX.play('arena');
    spawnShockRing(hero.x, hero.z, 0x38bdf8, 0.35, slamR, 0.32);

    if (actor.isPlayer) dummies.forEach((d) => {
      if (d.isShooter && !shooterEnabled) return;
      if (Math.hypot(d.x - hero.x, d.z - hero.z) <= slamR + d.r) {
        damageDummy(d, slamDmg, '#38bdf8');
        CC.apply(d, { knockupDur: SLAM_KNOCKUP, slowDur: SLAM_KNOCKUP + SLAM_SLOW }, { x: hero.x, z: hero.z, unit: hero });
      }
    });
    if (phase1Engine) {
      actor.hostiles().forEach((t) => {
        if (t.kind === 'structure') return;
        if (Math.hypot(t.x - hero.x, t.z - hero.z) <= slamR + t.r) {
          actor.damage(t, slamDmg, {
            dmgType: 'physical',
            knockupDur: SLAM_KNOCKUP,
            slowDur: SLAM_KNOCKUP + SLAM_SLOW,
            castId: hero.leapCastId,
            color: '#38bdf8'
          });
        }
      });
    }
  },

  // ---- Bots (Phase 2): Q/LMB strikes resolve in tickActor; E uses the engine's bot leap with the kit's landing slam
  botCast(actor, slot, ctx) {
    const { st, pProg, talents, rQE, rUlt } = ctx;
    const hero = actor.unit;
    const a = actor.aim();
    hero.facing = Math.atan2(a.x - hero.x, a.z - hero.z);
    const L = (window.__kitBotLog = window.__kitBotLog || {}); L['bg_' + slot] = (L['bg_' + slot] || 0) + 1;
    if (slot === 'Q') {
      if (hero.cdQ > 0 || hero.leapTimer > 0) return;
      hero.cdQ = [7.5, 6.5, 5.5][rQE] * (ctx.cdrMult || 1);
      actor.play('kick', 0.05, true, 1.65, 0, 0.4);
      hero.bgStrike = { isKick: false, isHaymaker: true, facing: hero.facing, t: 0.24, castId: KitFx.castId(), st };
      spawnFloat(hero.x, 2.6, hero.z, 'BOUNCER HAYMAKER!', '#38bdf8');
    } else if (slot === 'E') {
      if (hero.cdE > 0 || hero.leapTimer > 0) return;
      hero.cdE = [11.0, 9.5, 8.0][rQE] * (ctx.cdrMult || 1);
      const maxLeap = 7.8;
      const dx = a.x - hero.x, dz = a.z - hero.z;
      const dist = Math.hypot(dx, dz) || 0.01;
      const clamped = Math.max(0, Math.min(maxLeap, dist - 1.15)); // land just short of the target
      hero.leapSx = hero.x;
      hero.leapSz = hero.z;
      hero.leapTx = hero.x + (dx / dist) * clamped;
      hero.leapTz = hero.z + (dz / dist) * clamped;
      hero.leapDur = 0.42;
      hero.leapTimer = 0.42;
      actor.play('jump', 0.05, true, 2.55, 0.52, 0.54);
      spawnShockRing(hero.x, hero.z, 0x38bdf8, 0.3, 1.4, 0.24);
      spawnFloat(hero.x, 2.7, hero.z, 'CROWD DIVE!', '#38bdf8');
      hero.leapCastId = KitFx.castId(); // the landing slam (leapLandFor) belongs to this cast
      hero.leapSt = st; // ...and uses the stats from cast time
      if (KitFx.tal(ctx, 7, 'R')) this.unstoppable(hero);
      hero.leapOnLand = () => {
        const lvl = actor.level();
        this.leapLandFor(actor, { st: actor.stats(), pProg: { level: lvl }, talents: actor.talents() });
      };
    } else if (slot === 'R') {
      if (pProg.level < 4 || hero.cdR > 0) return;
      hero.cdR = [44.0, 38.0, 32.0][rUlt] * (ctx.ultCdrMult || ctx.cdrMult || 1);
      this.eyesOnMe(actor, ctx);
    }
  },

  tickActor(actor, dt) {
    if (actor.isPlayer) return;
    const u = actor.unit;
    u.kickAnim = Math.max(0, (u.kickAnim || 0) - dt);
    if (u.bgStrike) {
      if ((u.stunTimer || 0) > 0) u.bgStrike = null;
      else {
        u.bgStrike.t -= dt;
        if (u.bgStrike.t <= 0) {
          const strike = u.bgStrike;
          u.bgStrike = null;
          const lvl = actor.level();
          this.strikeImpactFor(actor, strike, { st: actor.stats(), pProg: { level: lvl }, talents: actor.talents() });
        }
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
  // (st.guardStacks: the stats used to say bgStacks, which never existed, so the pip never showed)
  hudTag(st) {
    return (st.guardStacks || 0) > 0 ? ' ' + '🛡️'.repeat(st.guardStacks) : '';
  },

  // Passive slot pip text ('' hides it)
  passivePip(st) {
    return (st.guardStacks || 0) > 0 ? st.guardStacks + 'x' : '';
  },

  rEmpowered() {
    return (hero.rShieldTimer || 0) > 0;
  }
};
})();
