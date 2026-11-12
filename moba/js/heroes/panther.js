// Panther Rogue: Jungle • Melee Stealth Assassin
// Hero kit: data (stats, talents, UI text) + player ability code moved verbatim from js/arena/*.js and phase1_data.js.
// Functions run in the shared global scope of js/arena/*.js (hero, actions, fadeToAction, damageDummy, ...).
// Still in phase1_engine.js until Phase 2: Shadow Stalker speed bonus (getPlayerStats) and 10L Apex Reset (kill handler).
(function () {
'use strict';
const H = (window.MOBA_HEROES = window.MOBA_HEROES || {});

H.panther = {
  id: 'panther',
  roster: { order: 5, emoji: '🐾', short: 'Panther' },

  bundle: { label: 'Panther Rogue', src: 'assets/panther/panther_bundle.js', globalKey: 'PANTHER_MIXAMO', pStart: 45, pEnd: 55 },
  moveSpeed: 6.55, // world units/s before bonuses
  hudSpeed: 342,   // SPD number shown in the HUD
  clipTweaks: { crawlStabilizeHead: true, crawlBound: true, jumpClampHips: true },

  spec: {
    id: 'panther',
    name: 'Panther Rogue',
    role: 'Jungle • Melee Stealth Assassin',
    glyph: 'X',
    color: '#2dd4bf',
    height: 2.15,
    baseHp: 1380, hpGrow: 118,
    baseMp: 300, mpGrow: 25, mpRegen: 5.5,
    baseAtk: 56, atkGrow: 7.5,
    baseFant: 24, fantGrow: 5.2,
    baseArmor: 20, armorGrow: 2.8,
    baseFResist: 20, fResistGrow: 2.6,
    baseSpd: 6.55,
    atkCd: 0.78,
    mpCosts: { Q: 45, E: 50, R: 80 }
  },

  talents: {
    3: {
      L: { id: '3L', name: 'Duskwalker', desc: 'Unseen Move Speed rises to +38% and lingers +1.3s longer after being spotted' },
      R: { id: '3R', name: 'Bloodfangs', desc: 'Q Slash & Gnash healing +35% and deals +30% bonus damage to enemies below 40% HP' }
    },
    7: {
      L: { id: '7L', name: 'Hamstring Mark', desc: 'Consuming the 3rd E Predator Mark Slows by 50% (1.25s) and refunds 2s off E CD' },
      R: { id: '7R', name: 'Arcane Claws', desc: 'E Predator Mark bonus damage increased by +35% (Fantasy damage)' }
    },
    10: {
      L: { id: '10L', name: 'Apex Reset', desc: 'Hero takedowns within 4s of exiting R Stealth refresh E and grant 2.5s Stealth' },
      R: { id: '10R', name: 'Throat Pounce', desc: 'Leaping with E from R Stealth applies a 40% Slow + 0.8s Silence/Stun on landing' }
    }
  },

  ui: {
    height: 2.15,
    modelLabel: 'Panther Rogue (Mixamo + Nightprowl All-Fours)',
    glyph: 'X',
    color: '#2dd4bf',
    name: 'Panther Rogue (3D)',
    role: 'Jungle • Melee Physical Stealth Assassin',
    passive: 'Shadow Stalker',
    lmb: 'Twin Claws',
    q: 'Slash&Gnash',
    e: 'Mark Leap',
    r: 'Nightprowl',
    banner: '<b>1/2/3/4/5</b> Hero &bull; <b>Passive</b> Shadow Stalker (+28% Unseen MS) &bull; <b>Q</b> Slash &amp; Gnash (Swipe + Bite) &bull; <b>E</b> Predator&#39;s Leap &bull; <b>R</b> Nightprowl Stealth (All-Fours Prowl!) &bull; <b>P</b> Shop',
    tooltips: {
      P: {
        title: 'Passive • Shadow Stalker',
        meta: 'Innate Unseen Speed',
        body: 'Gain <b>+28% Move Speed</b> while Unseen by enemies (behind LOS trees/pillars, out of enemy vision, or during <b>R: Nightprowl</b> Stealth), lingering for 2.2s after being spotted.',
        talentLevels: [3]
      },
      LMB: {
        title: 'LMB • Twin Claws',
        meta: '0 MP • 0.78s Base ATK',
        body: 'Rapid Physical claw swipes for <b>100% Physical ATK</b> that consume active <b>E: Predator Marks</b> for bonus Fantasy burst damage.',
        talentLevels: [7]
      },
      Q: {
        title: 'Q • Slash & Gnash',
        meta: '45 MP • 5.8s / 5.0s / 4.2s CD (Lv 1/6/9)',
        body: 'Unleashes a wide <b>Claw Swipe (Slash)</b> followed immediately by a lunging <b>Feline Bite (Gnash)</b>; both hits deal Physical Damage, <b>heal you</b>, and each consumes an active <b>Predator Mark</b>!',
        talentLevels: [3, 7]
      },
      E: {
        title: "E • Predator's Leap",
        meta: '50 MP • 7.5s / 6.2s / 5.0s CD (Lv 1/6/9)',
        body: 'Pounces to the target spot (<b>+65% range while Unseen or in R Stealth!</b>), dealing AoE Fantasy Damage and applying <b>3 Predator Marks</b> for 5.0s so your next 3 hits deal bonus Fantasy burst.',
        talentLevels: [7, 10]
      },
      R: {
        title: 'R • Nightprowl',
        meta: '80 MP • 38s / 32s / 26s CD (Lv 4/8/12)',
        body: 'Drops onto all fours and enters <b>Stealth for up to 6.0s</b>, immediately activating <b>Shadow Stalker (+28% MS)</b> and boosting <b>E: Predator&#39;s Leap range by +65%</b>.',
        talentLevels: [3, 10]
      }
    }
  },

  // Parse the Mixamo bundle into a hero template (model, texture, animation clips)
  parseBundle(pBundle, targetTmpl) {
    if (!pBundle || targetTmpl.fbx) return targetTmpl.fbx;
    targetTmpl.tex = loadHeroDiffuseTexture(pBundle.diffuseDataUrl);
    const pIdleFbx = fbxLoader.parse(b64ToBuffer(pBundle.idleFbxB64), '');
    pIdleFbx.traverse((ch) => {
      if (ch.isMesh && ch.geometry && !ch.geometry.attributes.normal) {
        ch.geometry.computeVertexNormals();
      }
    });
    targetTmpl.fbx = pIdleFbx;
    if (pIdleFbx.animations[0]) targetTmpl.clips.idle = pIdleFbx.animations[0];
    const pRunFbx = fbxLoader.parse(b64ToBuffer(pBundle.runFbxB64), '');
    if (pRunFbx.animations[0]) targetTmpl.clips.run = pRunFbx.animations[0];
    if (pBundle.crawlFbxB64) {
      const pCrawlFbx = fbxLoader.parse(b64ToBuffer(pBundle.crawlFbxB64), '');
      if (pCrawlFbx.animations[0]) targetTmpl.clips.crawl = pCrawlFbx.animations[0];
    }
    const pPunchFbx = fbxLoader.parse(b64ToBuffer(pBundle.punchFbxB64), '');
    if (pPunchFbx.animations[0]) targetTmpl.clips.punch = pPunchFbx.animations[0];
    if (pBundle.jumpFbxB64) {
      const pJumpFbx = fbxLoader.parse(b64ToBuffer(pBundle.jumpFbxB64), '');
      if (pJumpFbx.animations[0]) targetTmpl.clips.jump = pJumpFbx.animations[0];
    }
    return pIdleFbx;
  },

  // LMB Twin Claws swing (impact resolves in onStrikeImpact)
  onBasicAttack(st) {
    return this.basicAttackFor(KitFx.player, st);
  },

  basicAttackFor(actor, st) {
    if (!actor.isPlayer) {
      const u = actor.unit, a = actor.aim();
      u.facing = Math.atan2(a.x - u.x, a.z - u.z);
      u.stealthTimer = 0;
      actor.play('punch', 0.04, true, 2.45, 0.82, 0.36);
      u.pnStrike = { isKick: false, isHaymaker: false, isFlurry: false, isBite: false, facing: u.facing, t: 0.16 };
      const L = (window.__kitBotLog = window.__kitBotLog || {}); L.pn_lmb = (L.pn_lmb || 0) + 1;
      return;
    }
    if ((hero.stealthTimer || 0) > 0) {
      hero.stealthTimer = 0;
      hero.stealthExitTimer = 4.0;
      spawnFloat(hero.x, 2.75, hero.z, 'AMBUSH FROM STEALTH!', '#2dd4bf');
    }
    hero.atkTimer = 0.78 / (1 + st.asPct);
    hero.punchAnim = 0.36;
    if (actions.punch) {
      // Mutant Swiping.fbx: skip the 0.00s-0.82s slow windup and start right at 0.82s as the claw sweeps across!
      fadeToAction(actions.punch, 0.04, true, 2.45, 0.82);
    }
    pendingStrike = { isKick: false, isHaymaker: false, isFlurry: false, isBite: false, facing: hero.facing, t: 0.16 };
  },

  // LMB Twin Claws OR Q Slash & Gnash impact (1st hit = Slash swipe, 2nd hit = Gnash bite)
  onStrikeImpact(strike, ctx) {
    return this.strikeImpactFor(KitFx.player, strike, ctx);
  },

  strikeImpactFor(actor, strike, ctx) {
    const { st, pProg, talents } = ctx;
    const hero = actor.unit; // (local alias: the striker)
    const reach = strike.isBite ? 1.28 : 1.15;
    const fx = hero.x + Math.sin(strike.facing) * reach;
    const fz = hero.z + Math.cos(strike.facing) * reach;
    const hitRadius = strike.isFlurry ? 1.88 : 1.55;
    spawnShockRing(fx, fz, strike.isBite ? 0xf43f5e : (strike.isFlurry ? 0x2dd4bf : 0xfbbf24), 0.24, hitRadius, 0.22);
    if (strike.isBite) {
      spawnFloat(hero.x, 2.75, hero.z, 'GNASH!', '#f43f5e');
    }

    const rQE = (pProg.level || 1) >= 9 ? 2 : ((pProg.level || 1) >= 6 ? 1 : 0);
    const rankMult = [1.0, 1.25, 1.50][rQE];
    const baseClawDmg = strike.isFlurry
      ? Math.round(strike.isBite ? (62 + (pProg.level || 1) * 11 + st.atk * 1.05) : (48 + (pProg.level || 1) * 9 + st.atk * 0.85))
      : Math.round(st.atk);
    const markBonusDmg = Math.round((34 + (pProg.level || 1) * 7 + (st.fant || 24) * 0.80) * rankMult * (talents[7] === 'R' ? 1.35 : 1.0));
    const healPerHit = strike.isFlurry
      ? Math.round((strike.isBite ? (28 + (pProg.level || 1) * 6) : (22 + (pProg.level || 1) * 5)) * rankMult * (talents[3] === 'R' ? 1.35 : 1.0))
      : 0;
    let didHitAny = false;

    if (actor.isPlayer) dummies.forEach((d) => {
      if (d.isShooter && !shooterEnabled) return;
      if (Math.hypot(d.x - fx, d.z - fz) <= hitRadius + d.r) {
        didHitAny = true;
        const lowHpAmp = (strike.isFlurry && talents[3] === 'R' && d.hp / d.maxHp < 0.40) ? 1.30 : 1.0;
        damageDummy(d, Math.round(baseClawDmg * lowHpAmp), strike.isFlurry ? '#2dd4bf' : '#fb7185');
        if ((d.predatorMarks || 0) > 0 && (d.predatorMarkTimer || 0) > 0) {
          d.predatorMarks--;
          damageDummy(d, markBonusDmg, '#fde047');
          spawnShockRing(d.x, d.z, 0x2dd4bf, 0.2, 1.35, 0.22);
          if (d.predatorMarks === 0 && talents[7] === 'L') {
            d.slowTimer = Math.max(d.slowTimer || 0, 1.25);
            hero.cdE = Math.max(0, hero.cdE - 2.0);
            spawnFloat(d.x, 2.8, d.z, 'HAMSTRING MARK! (50% SLOW & -2s E CD)', '#2dd4bf');
          } else {
            spawnFloat(d.x, 2.7, d.z, 'MARK PROC! +' + markBonusDmg, '#fde047');
          }
        }
      }
    });

    if (phase1Engine) {
      actor.hostiles().forEach((t) => {
        if (Math.hypot(t.x - fx, t.z - fz) <= hitRadius + t.r) {
          const u = t.ref;
          const lowHpAmp = (strike.isFlurry && talents[3] === 'R' && u && u.hp / u.maxHp < 0.40 && t.kind !== 'structure') ? 1.30 : 1.0;
          const hit = actor.damage(t, Math.round(baseClawDmg * lowHpAmp), {
            isBasic: !strike.isFlurry,
            dmgType: 'physical',
            color: strike.isFlurry ? '#2dd4bf' : '#fb7185'
          });
          if (hit) {
            didHitAny = true;
            if (u && (u.predatorMarks || 0) > 0 && (u.predatorMarkTimer || 0) > 0 && u.hp > 0) {
              u.predatorMarks--;
              const isThirdMark = (u.predatorMarks === 0);
              actor.damage(t, markBonusDmg, {
                dmgType: 'fantasy',
                slowDur: (isThirdMark && talents[7] === 'L') ? 1.25 : 0,
                color: '#fde047'
              });
              if (isThirdMark && talents[7] === 'L') {
                hero.cdE = Math.max(0, hero.cdE - 2.0);
                spawnFloat(t.x, 2.8, t.z, 'HAMSTRING MARK! (50% SLOW & -2s E CD)', '#2dd4bf');
              }
            }
          }
        }
      });
    }

    if (didHitAny && healPerHit > 0) {
      hero.hp = Math.min(hero.maxHp, hero.hp + healPerHit);
      spawnFloat(hero.x, 2.65, hero.z, '+' + healPerHit + ' HP', '#4ade80');
    }
    return;
  },

  // Q Slash & Gnash, E Predator's Leap, R Nightprowl
  cast(slot, ctx) {
    return this.castFor(KitFx.player, slot, ctx);
  },

  castFor(actor, slot, ctx) {
    if (!ctx) {
      const lvl = actor.level();
      ctx = { st: actor.stats(), pProg: { level: lvl }, talents: actor.talents(), cdrMult: 1, rQE: KitFx.rQE(lvl), rUlt: KitFx.rUlt(lvl) };
    }
    if (!actor.isPlayer) return this.botCast(actor, slot, ctx);
    const { pProg, talents, cdrMult, rQE, rUlt } = ctx;
    const stNow = phase1Engine ? phase1Engine.getPlayerStats() : { pantherUnseen: true };
    if (slot === 'Q') {
      if (!wtfMode && hero.cdQ > 0) return;
      if (!trySpendMana('Q')) return;
      hero.cdQ = wtfMode ? 0.15 : [5.8, 5.0, 4.2][rQE] * cdrMult;
      if ((hero.stealthTimer || 0) > 0) {
        hero.stealthTimer = 0;
        hero.stealthExitTimer = 4.0;
      }
      hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
      hero.punchAnim = 0.54;
      hero.qFlurryRemaining = 1; // 2nd Hit: The Feline Bite ("Gnash")!
      hero.qFlurryTimer = 0.21;
      hero.gnashAnim = 0;
      if (actions.punch) {
        oneShotActive = true;
        // Start Mutant Swiping at 0.85s (2.40x) so the 1st Hit is a clean, wide horizontal Claw Swipe across!
        fadeToAction(actions.punch, 0.04, true, 2.40, 0.85);
      }
      pendingStrike = {
        isKick: false,
        isFlurry: true,
        isBite: false,
        facing: hero.facing,
        t: 0.13
      };
      SFX.play('dash');
      spawnFloat(hero.x, 2.65, hero.z, 'SLASH!', '#2dd4bf');
    } else if (slot === 'E') {
      if (!wtfMode && hero.cdE > 0) return;
      if (!trySpendMana('E')) return;
      hero.cdE = wtfMode ? 0.25 : [7.5, 6.2, 5.0][rQE] * cdrMult;
      const fromUnseen = (hero.stealthTimer || 0) > 0 || (stNow && stNow.pantherUnseen);
      hero.leapFromStealth = fromUnseen;
      if ((hero.stealthTimer || 0) > 0) {
        hero.stealthTimer = 0;
        hero.stealthExitTimer = 4.0;
      }
      const dx = aimWorld.x - hero.x;
      const dz = aimWorld.z - hero.z;
      const dist = Math.hypot(dx, dz) || 0.01;
      const maxRange = fromUnseen ? 7.8 * 1.65 : 7.8;
      const leapDist = Math.min(maxRange, Math.max(2.2, dist));
      hero.facing = Math.atan2(dx, dz);
      hero.leapSx = hero.x;
      hero.leapSz = hero.z;
      hero.leapTx = THREE.MathUtils.clamp(hero.x + (dx / dist) * leapDist, -69, 69);
      hero.leapTz = THREE.MathUtils.clamp(hero.z + (dz / dist) * leapDist, -46, 46);
      hero.leapDur = 0.36;
      hero.leapTimer = 0.36;
      hero.kickAnim = 0.42;
      if (actions.jump) {
        oneShotActive = true;
        fadeToAction(actions.jump, 0.04, true, 1.65, 0.0);
      }
      SFX.play('dash');
      spawnShockRing(hero.x, hero.z, 0x2dd4bf, 0.22, 1.2, 0.22);
      if (fromUnseen) {
        spawnFloat(hero.x, 2.75, hero.z, 'SHADOW POUNCE (+65% RANGE)!', '#2dd4bf');
      }
    } else if (slot === 'R') {
      if (!wtfMode && pProg.level < 4) {
        spawnFloat(hero.x, 2.6, hero.z, 'ULTIMATE UNLOCKS AT LEVEL 4!', '#fb7185');
        return;
      }
      if (!wtfMode && hero.cdR > 0) return;
      if (!trySpendMana('R')) return;
      hero.cdR = wtfMode ? 0.4 : [38.0, 32.0, 26.0][rUlt] * cdrMult;
      hero.stealthTimer = 6.0;
      hero.unseenLingerTimer = talents[3] === 'L' ? 3.5 : 2.2;
      SFX.play('dash');
      spawnShockRing(hero.x, hero.z, 0x2dd4bf, 0.35, 2.6, 0.32);
      spawnShockRing(hero.x, hero.z, 0xa855f7, 0.2, 1.8, 0.26);
      spawnFloat(hero.x, 2.9, hero.z, 'NIGHTPROWL STEALTH (6.0s)!', '#2dd4bf');
    }
    return;
  },

  // Q phase 2: when the flurry timer ends, start the Gnash bite
  onFlurryEnd() {
    hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
    // Begin Phase 2 of Q (Slash & Gnash): Feline Lunge-Bite ("Gnash"!)
    hero.gnashDur = 0.34;
    hero.gnashAnim = 0.34;
    oneShotActive = false;
    if (actions.idle) {
      fadeToAction(actions.idle, 0.22, false, 1.0);
    }
    pendingStrike = {
      isKick: false,
      isFlurry: true,
      isBite: true,
      facing: hero.facing,
      t: 0.14
    };
  },

  // E Predator's Leap landing pounce + 3 Predator Marks
  onLeapLand(ctx) {
    return this.leapLandFor(KitFx.player, ctx);
  },

  leapLandFor(actor, ctx) {
    const { st, pProg, talents } = ctx;
    const hero = actor.unit; // (local alias: the pouncer)
    // Panther E (Predator's Leap) Landing Pounce + 3 Predator Marks!
    const pounceR = 2.65;
    const pounceDmg = Math.round(55 + (pProg.level || 1) * 11 + (st.fant || 0) * 0.75);
    const isThroatPounce = hero.leapFromStealth && talents[10] === 'R';
    SFX.play('arena');
    spawnShockRing(hero.x, hero.z, 0x2dd4bf, 0.30, pounceR, 0.28);
    spawnShockRing(hero.x, hero.z, 0xa855f7, 0.18, pounceR * 0.7, 0.22);

    if (actor.isPlayer) dummies.forEach((d) => {
      if (d.isShooter && !shooterEnabled) return;
      if (Math.hypot(d.x - hero.x, d.z - hero.z) <= pounceR + d.r) {
        damageDummy(d, pounceDmg, '#a855f7');
        d.predatorMarks = 3;
        d.predatorMarkTimer = 5.0;
        if (isThroatPounce) {
          d.slowTimer = Math.max(d.slowTimer || 0, 2.0);
          d.stunTimer = Math.max(d.stunTimer || 0, 0.8);
          spawnFloat(d.x, 2.85, d.z, 'THROAT POUNCE! SILENCED & 40% SLOW + 3 MARKS!', '#fde047');
        } else {
          spawnFloat(d.x, 2.65, d.z, '3x PREDATOR MARK!', '#2dd4bf');
        }
      }
    });
    if (phase1Engine) {
      actor.hostiles().forEach((t) => {
        if (t.kind === 'structure') return;
        if (Math.hypot(t.x - hero.x, t.z - hero.z) <= pounceR + t.r) {
          if (t.ref) {
            t.ref.predatorMarks = 3;
            t.ref.predatorMarkTimer = 5.0;
          }
          actor.damage(t, pounceDmg, {
            dmgType: 'fantasy',
            slowDur: isThroatPounce ? 2.0 : 0,
            stunDur: isThroatPounce ? 0.8 : 0,
            color: '#a855f7'
          });
          spawnFloat(
            t.x,
            2.75,
            t.z,
            isThroatPounce ? 'THROAT POUNCE! SILENCED & 3 MARKS!' : '3x PREDATOR MARK!',
            isThroatPounce ? '#fde047' : '#2dd4bf'
          );
        }
      });
    }
    hero.leapFromStealth = false;
  },

  // ---- Bots (Phase 2): strikes + the Slash -> Gnash sequence resolve in tickActor; E = engine leap with the kit's pounce
  botCast(actor, slot, ctx) {
    const { st, pProg, talents, rQE, rUlt } = ctx;
    const hero = actor.unit;
    const a = actor.aim();
    hero.facing = Math.atan2(a.x - hero.x, a.z - hero.z);
    const L = (window.__kitBotLog = window.__kitBotLog || {}); L['pn_' + slot] = (L['pn_' + slot] || 0) + 1;
    if (slot === 'Q') {
      if (hero.cdQ > 0) return;
      hero.cdQ = [5.8, 5.0, 4.2][rQE];
      hero.stealthTimer = 0;
      actor.play('punch', 0.04, true, 2.40, 0.85, 0.54);
      hero.pnStrike = { isKick: false, isFlurry: true, isBite: false, facing: hero.facing, t: 0.13 };
      hero.pnFlurryT = 0.21; // then the Gnash bite
      SFX.play('dash');
      spawnFloat(hero.x, 2.65, hero.z, 'SLASH!', '#2dd4bf');
    } else if (slot === 'E') {
      if (hero.cdE > 0 || hero.leapTimer > 0) return;
      hero.cdE = [7.5, 6.2, 5.0][rQE];
      const fromUnseen = (hero.stealthTimer || 0) > 0;
      hero.leapFromStealth = fromUnseen;
      hero.stealthTimer = 0;
      const dx = a.x - hero.x, dz = a.z - hero.z;
      const dist = Math.hypot(dx, dz) || 0.01;
      const maxRange = fromUnseen ? 7.8 * 1.65 : 7.8;
      const leapDist = Math.min(maxRange, Math.max(0, dist - 1.15)); // land on top of them, just short
      hero.leapSx = hero.x;
      hero.leapSz = hero.z;
      hero.leapTx = hero.x + (dx / dist) * leapDist;
      hero.leapTz = hero.z + (dz / dist) * leapDist;
      hero.leapDur = 0.36;
      hero.leapTimer = 0.36;
      actor.play('jump', 0.04, true, 1.65, 0.0, 0.42);
      SFX.play('dash');
      spawnShockRing(hero.x, hero.z, 0x2dd4bf, 0.22, 1.2, 0.22);
      if (fromUnseen) spawnFloat(hero.x, 2.75, hero.z, 'SHADOW POUNCE (+65% RANGE)!', '#2dd4bf');
      hero.leapOnLand = () => {
        const lvl = actor.level();
        this.leapLandFor(actor, { st: actor.stats(), pProg: { level: lvl }, talents: actor.talents() });
      };
    } else if (slot === 'R') {
      if (pProg.level < 4 || hero.cdR > 0) return;
      hero.cdR = [38.0, 32.0, 26.0][rUlt];
      hero.stealthTimer = 6.0;
      SFX.play('dash');
      spawnShockRing(hero.x, hero.z, 0x2dd4bf, 0.35, 2.6, 0.32);
      spawnShockRing(hero.x, hero.z, 0xa855f7, 0.2, 1.8, 0.26);
      spawnFloat(hero.x, 2.9, hero.z, 'NIGHTPROWL!', '#2dd4bf');
    }
  },

  tickActor(actor, dt) {
    if (actor.isPlayer) return;
    const u = actor.unit;
    if ((u.stunTimer || 0) > 0) { u.pnStrike = null; u.pnFlurryT = 0; return; }
    if ((u.pnFlurryT || 0) > 0) {
      u.pnFlurryT -= dt;
      if (u.pnFlurryT <= 0) {
        const a = actor.aim();
        u.facing = Math.atan2(a.x - u.x, a.z - u.z);
        u.gnashAnim = 0.22; // the engine's forward bite lunge
        u.pnStrike = { isKick: false, isFlurry: true, isBite: true, facing: u.facing, t: 0.14 };
      }
    }
    if (u.pnStrike) {
      u.pnStrike.t -= dt;
      if (u.pnStrike.t <= 0) {
        const strike = u.pnStrike;
        u.pnStrike = null;
        const lvl = actor.level();
        this.strikeImpactFor(actor, strike, { st: actor.stats(), pProg: { level: lvl }, talents: actor.talents() });
      }
    }
  },

  // Release the E leap clip right after landing so it doesn't linger
  releaseOneShotClips() {
    if (actions.jump && activeAction === actions.jump && hero.leapTimer <= 0 && actions.jump.time >= 0.58) {
      oneShotActive = false;
      if (actions.idle) fadeToAction(actions.idle, 0.14, false, 1.0);
    }
  },

  // Nightprowl: prowl on all fours while stealthed
  isAltMoveActive() {
    return (hero.stealthTimer || 0) > 0 && !!actions.crawl;
  },

  // Procedural skeletal Gnash bite lunge, applied right after mixer.update(dt)
  postMixer() {
    if ((hero.gnashAnim || 0) > 0) {
      const u = 1 - (hero.gnashAnim / (hero.gnashDur || 0.34));
      if (u < 0.28) {
        // Phase 2A (0.00 -> 0.28): Coil neck/jaws back & sweep arms behind ribs as the 1st claw swipe finishes
        const coil = Math.sin((u / 0.28) * (Math.PI * 0.5));
        heroTiltNode.position.z -= 0.08 * coil;
        heroTiltNode.rotation.x -= 0.10 * coil;
        if (heroBones.Spine) heroBones.Spine.rotateX(-0.10 * coil);
        if (heroBones.Neck) heroBones.Neck.rotateX(-0.22 * coil);
        if (heroBones.Head) heroBones.Head.rotateX(-0.32 * coil);
        if (heroBones.LeftArm) heroBones.LeftArm.rotateX(0.35 * coil);
        if (heroBones.RightArm) heroBones.RightArm.rotateX(0.45 * coil);
      } else {
        // Phase 2B (0.28 -> 1.00): Explosive forward lunge & ferocious downward Jaws/Head Bite Snap!
        const biteEnv = Math.sin(((u - 0.28) / 0.72) * Math.PI);
        heroTiltNode.position.z += 0.44 * biteEnv;
        heroTiltNode.position.y -= 0.11 * biteEnv;
        heroTiltNode.rotation.x += 0.28 * biteEnv;
        if (heroBones.Spine) heroBones.Spine.rotateX(0.16 * biteEnv);
        if (heroBones.Spine1) heroBones.Spine1.rotateX(0.16 * biteEnv);
        if (heroBones.Spine2) heroBones.Spine2.rotateX(0.14 * biteEnv);
        if (heroBones.Neck) heroBones.Neck.rotateX(0.32 * biteEnv);
        if (heroBones.Head) {
          heroBones.Head.rotateX(0.46 * biteEnv);
          heroBones.Head.rotateZ(0.18 * biteEnv);
        }
        if (heroBones.LeftArm) heroBones.LeftArm.rotateX(0.50 * biteEnv);
        if (heroBones.RightArm) heroBones.RightArm.rotateX(0.55 * biteEnv);
      }
    }
  },

  wantsStealthShimmer() {
    return (hero.stealthTimer || 0) > 0;
  },

  // Overhead plate tag
  hudTag(st) {
    return (hero.stealthTimer || 0) > 0 ? ' [🐾 NIGHTPROWL ' + hero.stealthTimer.toFixed(1) + 's]' : (st.pantherUnseen ? ' [🐾 UNSEEN]' : '');
  },

  // Passive slot pip text ('' hides it)
  passivePip(st) {
    if (!((hero.stealthTimer || 0) > 0 || st.pantherUnseen)) return '';
    return (hero.stealthTimer || 0) > 0 ? 'STEALTH' : 'UNSEEN';
  },

  // E slot glows while Unseen/stealthed (leap range bonus ready)
  eReadyGlow(st) {
    return (hero.stealthTimer || 0) > 0 || st.pantherUnseen;
  },

  rEmpowered() {
    return (hero.stealthTimer || 0) > 0;
  }
};
})();
