const SIMFAST = /[?&]simfast/.test(location.search);
let simFrame = 0;
// MOBA 3D arena: Main per-frame update (tick).
// Classic script (not a module) so the game still works from file://. Loaded in order by arena3d.html;
// top-level let/const/function names are shared across all js/arena/*.js files.
'use strict';

// =========================================================
// MAIN 60FPS 3D LOOP
// =========================================================
let last = performance.now();
function tick(now) {
  // Selftest uses a fixed 60 Hz step so results are identical on any machine / frame rate
  // Dev: ?simfast = fixed 0.05s steps and render only every 20th frame (headless bot testing)
  const dt = window.__MOBA_TEST ? (window.__MOBA_TEST.dt || 1 / 60) : (SIMFAST ? 0.05 : Math.min(0.05, (now - last) / 1000));
  last = now;

  raycaster.setFromCamera(mouseNDC, camera);
  raycaster.ray.intersectPlane(groundPlane, aimWorld);
  if (window.__MOBA_TEST && window.__MOBA_TEST.aim) aimWorld.set(window.__MOBA_TEST.aim.x, 0, window.__MOBA_TEST.aim.z);
  if (window.__MOBA_TEST) window.__MOBA_TEST.gameTime += dt;

  hero.atkTimer = Math.max(0, hero.atkTimer - dt);
  hero.comboResetTimer = Math.max(0, (hero.comboResetTimer || 0) - dt);
  hero.cdQ = Math.max(0, hero.cdQ - dt);
  hero.cdE = Math.max(0, hero.cdE - dt);
  hero.cdR = Math.max(0, hero.cdR - dt);
  hero.eRecast = Math.max(0, hero.eRecast - dt);
  hero.punchAnim = Math.max(0, hero.punchAnim - dt);
  hero.kickAnim = Math.max(0, hero.kickAnim - dt);
  hero.grenadeAnim = Math.max(0, hero.grenadeAnim - dt);
  hero.eSpeedBuffTimer = Math.max(0, (hero.eSpeedBuffTimer || 0) - dt);
  hero.stealthTimer = Math.max(0, (hero.stealthTimer || 0) - dt);
  hero.stealthExitTimer = Math.max(0, (hero.stealthExitTimer || 0) - dt);
  hero.unseenLingerTimer = Math.max(0, (hero.unseenLingerTimer || 0) - dt);
  if (hero.qTempoTimer > 0) {
    hero.qTempoTimer -= dt;
    if (hero.qTempoTimer <= 0) hero.qTempoStacks = 0;
  }

  if ((hero.qFlurryRemaining || 0) > 0) {
    hero.qFlurryTimer = (hero.qFlurryTimer || 0) - dt;
    if (hero.qFlurryTimer <= 0) {
      hero.qFlurryRemaining = 0;
      const kitFlurry = heroKit();
      if (kitFlurry && kitFlurry.onFlurryEnd) kitFlurry.onFlurryEnd();
    }
  }
  if ((hero.gnashAnim || 0) > 0) {
    hero.gnashAnim = Math.max(0, hero.gnashAnim - dt);
  }

  if (pendingStrike) {
    pendingStrike.t -= dt;
    if (pendingStrike.t <= 0) {
      const s = pendingStrike;
      pendingStrike = null;
      fireStrikeImpact(s);
    }
  }
  Object.values(window.MOBA_HEROES || {}).forEach((k) => { if (k.tickTimers) k.tickTimers(dt, now); });

  const kitRelease = heroKit();
  if (kitRelease && kitRelease.releaseOneShotClips) kitRelease.releaseOneShotClips();

  if (hero.shieldTimer > 0) {
    hero.shieldTimer -= dt;
    if (hero.shieldTimer <= 0) hero.shield = 0;
  }

  const st = phase1Engine ? phase1Engine.getPlayerStats() : { atk: 55, fant: 40, maxHp: hero.maxHp, maxMp: hero.maxMp, spdPct: 0, bgStacks: 0 };
  const pProg = phase1Engine ? phase1Engine.getPlayerProg() : { level: 1, recallTimer: 0, talents: {} };
  const talents = pProg.talents || {};
  const allObstacles = phase1Engine ? obstacles.concat(phase1Engine.getMapObstacles()) : obstacles;

  // Update Dummies (Passive Move Speed Siphon, Bleed DoT, Physical Knockback & 3D Slow Ring!)
  let siphonTotal = 0;
  dummies.forEach((d) => {
    if (d.siphonTimer > 0) {
      d.siphonTimer -= dt;
      siphonTotal += d.siphoned;
      if (d.siphonTimer <= 0) d.siphoned = 0;
    }
    if (d.bleedTimer > 0 && d.bleedStacks > 0) {
      d.bleedTimer -= dt;
      d.bleedRingGrp.rotation.y += dt * 3.2;
      d.bleedTickTimer -= dt;
      if (d.bleedTickTimer <= 0) {
        d.bleedTickTimer = 0.65;
        damageDummy(d, d.bleedStacks * 12, '#f43f5e');
      }
      if (d.bleedTimer <= 0) {
        d.bleedStacks = 0;
        for (let k = 0; k < 4; k++) d.bleedPips[k].visible = false;
      }
    }
    if (d.kbTimer > 0) {
      const stepDt = Math.min(dt, d.kbTimer);
      d.x += d.kbVx * stepDt;
      d.z += d.kbVz * stepDt;
      d.kbTimer -= dt;
      let hitWall = false;
      allObstacles.forEach((o) => {
        const ox = d.x - o.x;
        const oz = d.z - o.z;
        const dist = Math.hypot(ox, oz) || 0.01;
        if (dist < d.r + o.r) {
          d.x = o.x + (ox / dist) * (d.r + o.r);
          d.z = o.z + (oz / dist) * (d.r + o.r);
          hitWall = true;
        }
      });
      if (hitWall && d.kbWallStun) {
        d.kbWallStun = false;
        d.kbTimer = 0;
        d.stunTimer = Math.max(d.stunTimer, 1.0);
        SFX.play('arena');
        spawnShockRing(d.x, d.z, 0xfde047, 0.25, 1.7, 0.28);
        spawnFloat(d.x, 2.85, d.z, 'WALL STUN! (1.0s)', '#fde047');
        damageDummy(d, 65 + (pProg.level || 1) * 12, '#fde047');
      }
      d.mesh.position.set(d.x, 0, d.z);
    } else if (d.resetDelay > 0) {
      d.resetDelay -= dt;
    } else if (Math.hypot(d.x - d.homeX, d.z - d.homeZ) > 0.05) {
      const rx = d.homeX - d.x;
      const rz = d.homeZ - d.z;
      const rd = Math.hypot(rx, rz);
      const step = Math.min(rd, 4.5 * dt);
      d.x += (rx / rd) * step;
      d.z += (rz / rd) * step;
      d.mesh.position.set(d.x, 0, d.z);
    }
    d.stunTimer = Math.max(0, d.stunTimer - dt);
    d.slowTimer = Math.max(0, (d.slowTimer || 0) - dt);
    if ((d.predatorMarkTimer || 0) > 0) {
      d.predatorMarkTimer = Math.max(0, d.predatorMarkTimer - dt);
      if (d.predatorMarkTimer <= 0) d.predatorMarks = 0;
    }
    if (d.slowFxGrp) {
      d.slowFxGrp.visible = d.slowTimer > 0;
      if (d.slowTimer > 0) d.slowFxGrp.rotation.y -= dt * 3.2;
    }
    if (d.hitFlash > 0) {
      d.hitFlash -= dt;
      d.torso.material = d.hitFlash > 0 ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : (d.slowTimer > 0 ? d.chilledMat : d.origMat);
    } else {
      d.torso.material = d.slowTimer > 0 ? d.chilledMat : d.origMat;
    }
  });
  // Decay Brawler Siphon Bonus when out of combat
  if (dummies.every((d) => d.siphonTimer <= 0)) {
    hero.siphonBonus = Math.max(0, hero.siphonBonus - dt * 0.025);
  } else {
    hero.siphonBonus = Math.max(hero.siphonBonus, siphonTotal);
  }

  // Movement, Airborne Leap (Bodyguard E), & Rebound Dash (Brawler E / Sorceress E)
  let isMoving = false;
  let airborneY = 0;
  if (hero.leapTimer > 0) {
    hero.leapTimer = Math.max(0, hero.leapTimer - dt);
    const u = 1 - (hero.leapTimer / (hero.leapDur || 0.38));
    hero.x = hero.leapSx + (hero.leapTx - hero.leapSx) * u;
    hero.z = hero.leapSz + (hero.leapTz - hero.leapSz) * u;
    airborneY = Math.sin(u * Math.PI) * (hero.leapHeight || 1.65);

    if (hero.leapTimer <= 0) {
      const kitLand = heroKit();
      if (kitLand && kitLand.onLeapLand) {
        kitLand.onLeapLand({ st, pProg, talents });
      }
    }
  } else if (hero.dashTimer > 0) {
    const prevX = hero.x;
    const prevZ = hero.z;
    hero.x += hero.dashVx * dt;
    hero.z += hero.dashVz * dt;
    hero.dashTimer -= dt;

    let hitWall = false;
    allObstacles.forEach((o) => {
      const dx = hero.x - o.x;
      const dz = hero.z - o.z;
      const d = Math.hypot(dx, dz) || 0.01;
      if (d < hero.r + o.r) {
        hero.x = o.x + (dx / d) * (hero.r + o.r);
        hero.z = o.z + (dz / d) * (hero.r + o.r);
        hitWall = true;
      }
    });

    let hitArenaRim = false;
    if (arena) {
      const dxA = hero.x - arena.x;
      const dzA = hero.z - arena.z;
      const distA = Math.hypot(dxA, dzA) || 0.01;
      const radialDot = dxA * hero.dashVx + dzA * hero.dashVz;

      if (distA >= arena.r - hero.r - 0.12 && radialDot > 0) {
        hero.x = arena.x + (dxA / distA) * (arena.r - hero.r);
        hero.z = arena.z + (dzA / distA) * (arena.r - hero.r);
        if (hero.dashKind === 'first') {
          hitWall = true;
          hitArenaRim = true;
        }
      }
    }

    const segX = hero.x - prevX;
    const segZ = hero.z - prevZ;
    const segLenSq = segX * segX + segZ * segZ;
    const distToDashSeg = (tx, tz) => {
      if (segLenSq < 0.0001) return Math.hypot(hero.x - tx, hero.z - tz);
      const u = THREE.MathUtils.clamp(((tx - prevX) * segX + (tz - prevZ) * segZ) / segLenSq, 0, 1);
      return Math.hypot((prevX + u * segX) - tx, (prevZ + u * segZ) - tz);
    };

    let hitDummy = null;
    dummies.forEach((d) => {
      if (d.isShooter && !shooterEnabled) return;
      if (distToDashSeg(d.x, d.z) <= hero.r + d.r + 0.35) hitDummy = d;
    });
    let hitHostile = null;
    let bestHostileDist = 999;
    if (phase1Engine) {
      phase1Engine.getHostileTargets().forEach((t) => {
        const dist = distToDashSeg(t.x, t.z);
        if (dist <= hero.r + t.r + 0.42 && dist < bestHostileDist) {
          bestHostileDist = dist;
          hitHostile = t;
        }
      });
    }

    const kitDash = heroKit();
    if (kitDash && kitDash.onDashStep) {
      kitDash.onDashStep({ st, pProg, talents, hitWall, hitArenaRim, hitDummy, hitHostile });
    }
  } else {
    hero.stunTimer = Math.max(0, (hero.stunTimer || 0) - dt);
    hero.slowTimer = Math.max(0, (hero.slowTimer || 0) - dt);
    let mx = 0, mz = 0;
    if (keys.KeyW || keys.ArrowUp) mz -= 1;
    if (keys.KeyS || keys.ArrowDown) mz += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    const ml = Math.hypot(mx, mz);
    const inAttackLock = hero.punchAnim > 0 || hero.kickAnim > 0 || hero.grenadeAnim > 0 || (hero.knockbackTimer || 0) > 0 || (hero.stunTimer || 0) > 0;
    if (ml > 0.05 && !inAttackLock && (!phase1Engine || phase1Engine.getPlayerProg().respawnTimer <= 0)) {
      isMoving = true;
      const baseSpd = (heroKit() && heroKit().moveSpeed) ? heroKit().moveSpeed : 5.88;
      const rSlow = (hero.rChargeTimer > 0 ? 0.50 : 1.0) * ((hero.slowTimer || 0) > 0 ? 0.68 : 1.0);
      const eSlipstream = (hero.eSpeedBuffTimer || 0) > 0 ? 0.25 : 0;
      const kitSpd = heroKit() && heroKit().speedMult ? heroKit().speedMult() : 1;
      const spd = baseSpd * (1 + hero.siphonBonus + eSlipstream + (st.spdPct || 0)) * rSlow * kitSpd;
      hero.x += (mx / ml) * spd * dt;
      hero.z += (mz / ml) * spd * dt;
      if (hero.rChargeTimer <= 0) {
        hero.facing = Math.atan2(mx, mz);
      }
    } else if (!inAttackLock) {
      hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
    }
    allObstacles.forEach((o) => {
      const dx = hero.x - o.x;
      const dz = hero.z - o.z;
      const d = Math.hypot(dx, dz) || 0.01;
      if (d < hero.r + o.r) {
        hero.x = o.x + (dx / d) * (hero.r + o.r);
        hero.z = o.z + (dz / d) * (hero.r + o.r);
      }
    });
    if (arena) {
      // Brawler's Pit: she can't walk out (recast R drops it). If she ended up far outside some other way
      // (respawn at fountain, recall), drop it instead of yanking her back.
      const dxA = hero.x - arena.x;
      const dzA = hero.z - arena.z;
      const distA = Math.hypot(dxA, dzA) || 0.01;
      if (distA > arena.r + 2.5) {
        scene.remove(arena.group);
        arena = null;
        SFX.play('block');
        spawnShockRing(hero.x, hero.z, 0xf43f5e, 0.4, 2.2, 0.28);
        spawnFloat(hero.x, 2.65, hero.z, 'LEFT THE PIT — ARENA DROPPED!', '#fb7185');
      } else if (distA > arena.r - hero.r) {
        hero.x = arena.x + (dxA / distA) * (arena.r - hero.r);
        hero.z = arena.z + (dzA / distA) * (arena.r - hero.r);
      }
    }
  }
  isMovingNow = isMoving;
  hero.x = THREE.MathUtils.clamp(hero.x, window.MOBA_MAP.BOUNDS.minX, window.MOBA_MAP.BOUNDS.maxX);
  hero.z = THREE.MathUtils.clamp(hero.z, window.MOBA_MAP.BOUNDS.minZ, window.MOBA_MAP.BOUNDS.maxZ);
  hero.z = Math.max(hero.z, window.MOBA_MAP.northMinZ(hero.x));

  if (mouseDown) tryAttack();

  // Bot-owned kit bolts (Phase 2): same flight, but they hit their owner's enemies (no dummies) via owner.damage().
  // Returns true when the bolt is finished.
  function stepOwnedBolt(b, dt) {
    const o = b.owner;
    if (b.homeTo && b.homeTo.ref) {
      // homing (Sorceress E): steer toward the one target, turning harder the longer it flies
      b.age = (b.age || 0) + dt;
      const ht = b.homeTo.ref;
      if (ht && !(ht.hp !== undefined && ht.hp <= 0)) {
        const want = Math.atan2(ht.x - b.mesh.position.x, ht.z - b.mesh.position.z);
        const cur = Math.atan2(b.vx, b.vz);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = (10 + b.age * 40) * dt;
        const ang = cur + THREE.MathUtils.clamp(diff, -turn, turn);
        const spd = Math.hypot(b.vx, b.vz);
        b.vx = Math.sin(ang) * spd;
        b.vz = Math.cos(ang) * spd;
        b.mesh.rotation.y = ang;
      }
    }
    b.mesh.position.x += b.vx * dt;
    b.mesh.position.z += b.vz * dt;
    b.life -= dt;
    const list = o.hostiles();
    for (let j = 0; j < list.length; j++) {
      const t = list[j];
      if (!t || !t.ref || (t.ref.hp !== undefined && t.ref.hp <= 0)) continue;
      const uid = t.kind + '_' + (t.ref.id || j);
      if (b.hitIds.has(uid)) continue;
      if (b.homeTo && b.homeTo.ref && b.homeTo.ref !== t.ref) continue;
      const hitR = (t.r || 0.5) + (b.isHeartseeker ? 0.48 : 0.28);
      if (Math.hypot(b.mesh.position.x - t.x, b.mesh.position.z - t.z) > hitR) continue;
      b.hitIds.add(uid);
      if (b.isHeartseeker) {
        const stacks = t.ref.bleedStacks || 0;
        const rU = KitFx.rUlt(o.level());
        const popDmg = Math.round(stacks * Math.round([60, 80, 100][rU] * (o.talents()[7] === 'R' ? 1.25 : 1.0)) * (b.popScale || 1));
        o.damage(t, b.dmg + popDmg, { color: stacks > 0 ? '#fde047' : '#fb7185' });
        if (stacks > 0) {
          t.ref.bleedStacks = 0;
          t.ref.bleedTimer = 0;
          spawnShockRing(t.x, t.z, 0xf43f5e, 0.35, 2.2, 0.32);
          spawnFloat(t.x, 2.85, t.z, 'BLEED DETONATED (' + stacks + 'x)!', '#fde047');
        }
      } else {
        o.damage(t, b.dmg, { bleedAdd: b.bleedAdd, isBasic: b.isBasic !== false, slowDur: b.slowDur || 0, dmgType: b.dmgType || 'physical' });
        spawnShockRing(t.x, t.z, b.dmgType === 'fantasy' ? 0xe879f9 : 0xf43f5e, 0.15, 0.65, 0.16);
        if (!b.pierce) { scene.remove(b.mesh); return true; }
      }
    }
    if (b.life <= 0) { scene.remove(b.mesh); return true; }
    return false;
  }

  // Update Coyote Crossbow Bolts, R Heartseeker Bolt, & Sorceress Astral Spark Bolts
  const hostiles = phase1Engine ? phase1Engine.getHostileTargets() : [];
  for (let i = heroBolts.length - 1; i >= 0; i--) {
    const b = heroBolts[i];
    if (b.owner) { if (stepOwnedBolt(b, dt)) heroBolts.splice(i, 1); continue; }
    // Homing bolts (Sorceress E): steer toward their one target, turning harder the longer they fly
    if (b.homeTo) {
      b.age = (b.age || 0) + dt;
      const ht = b.homeTo.d || b.homeTo.ref;
      const alive = ht && !(ht.hp !== undefined && ht.hp <= 0 && !b.homeTo.d);
      if (alive) {
        const want = Math.atan2(ht.x - b.mesh.position.x, ht.z - b.mesh.position.z);
        const cur = Math.atan2(b.vx, b.vz);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = (10 + b.age * 40) * dt;
        const ang = cur + THREE.MathUtils.clamp(diff, -turn, turn);
        const spd = Math.hypot(b.vx, b.vz);
        b.vx = Math.sin(ang) * spd;
        b.vz = Math.cos(ang) * spd;
        b.mesh.rotation.y = ang;
      }
    }
    b.mesh.position.x += b.vx * dt;
    b.mesh.position.z += b.vz * dt;
    b.life -= dt;

    let removed = false;
    const isFant = b.dmgType === 'fantasy';
    // 1. Check Practice Dummies
    for (let j = 0; j < dummies.length; j++) {
      const d = dummies[j];
      if (d.isShooter && !shooterEnabled) continue;
      if (b.hitIds.has('d_' + d.id)) continue;
      if (b.homeTo && b.homeTo.d !== d) continue;
      const hitR = d.r + (b.isHeartseeker ? 0.48 : 0.28);
      if (Math.hypot(b.mesh.position.x - d.x, b.mesh.position.z - d.z) <= hitR) {
        b.hitIds.add('d_' + d.id);
        if (b.isHeartseeker) {
          const stacks = d.bleedStacks;
          const popDmg = Math.round(stacks * 110 * (b.popScale || 1));
          damageDummy(d, b.dmg + popDmg, stacks > 0 ? '#fde047' : '#fb7185');
          if (stacks > 0) {
            d.bleedStacks = 0;
            d.bleedTimer = 0;
            for (let k = 0; k < 4; k++) d.bleedPips[k].visible = false;
            spawnShockRing(d.x, d.z, 0xf43f5e, 0.35, 2.2, 0.32);
            spawnFloat(d.x, 2.85, d.z, 'BLEED DETONATED (' + stacks + 'x)!', '#fde047');
          }
        } else {
          damageDummy(d, b.dmg, isFant ? '#e879f9' : '#fb7185');
          if (b.bleedAdd > 0) applyBleedStacks(d, b.bleedAdd);
          spawnShockRing(d.x, d.z, isFant ? 0xe879f9 : 0xf43f5e, 0.15, 0.65, 0.16);
          if (!b.pierce) {
            scene.remove(b.mesh);
            heroBolts.splice(i, 1);
            removed = true;
            break;
          }
        }
      }
    }
    // 2. Check 4v4 Hostile Targets (Enemy Bots, Minions, Jungle Camps + Boss, Structures!)
    if (!removed && phase1Engine) {
      for (let j = 0; j < hostiles.length; j++) {
        const t = hostiles[j];
        if (!t || !t.ref || (t.ref.hp !== undefined && t.ref.hp <= 0)) continue;
        const uid = t.kind + '_' + (t.ref.id || j);
        if (b.hitIds.has(uid)) continue;
        if (b.homeTo && b.homeTo.ref !== t.ref) continue;
        const hitR = t.r + (b.isHeartseeker ? 0.48 : 0.28);
        if (Math.hypot(b.mesh.position.x - t.x, b.mesh.position.z - t.z) <= hitR) {
          b.hitIds.add(uid);
          if (b.isHeartseeker) {
            const stacks = t.ref.bleedStacks || 0;
            const rUlt = (pProg.level || 1) >= 12 ? 2 : ((pProg.level || 1) >= 8 ? 1 : 0);
            const popDmg = Math.round(stacks * Math.round([60, 80, 100][rUlt] * (talents[7] === 'R' ? 1.25 : 1.0)) * (b.popScale || 1));
            const didHit = phase1Engine.dealPlayerDamageToUnit(t, b.dmg + popDmg, { color: stacks > 0 ? '#fde047' : '#fb7185' });
            if (didHit && stacks > 0) {
              t.ref.bleedStacks = 0;
              t.ref.bleedTimer = 0;
              spawnShockRing(t.x, t.z, 0xf43f5e, 0.35, 2.2, 0.32);
              spawnFloat(t.x, 2.85, t.z, 'BLEED DETONATED (' + stacks + 'x)!', '#fde047');
              if (stacks >= 4 && talents[10] === 'L') {
                hero.cdR *= 0.5;
                spawnFloat(hero.x, 2.9, hero.z, 'EXECUTIONER: 50% R REFUND!', '#38bdf8');
              }
            }
          } else {
            const didHit = phase1Engine.dealPlayerDamageToUnit(t, b.dmg, {
              bleedAdd: b.bleedAdd,
              isBasic: b.isBasic !== false,
              slowDur: b.slowDur || 0,
              dmgType: b.dmgType || 'physical'
            });
            if (didHit) spawnShockRing(t.x, t.z, isFant ? 0xe879f9 : 0xf43f5e, 0.15, 0.65, 0.16);
            if (!b.pierce) {
              scene.remove(b.mesh);
              heroBolts.splice(i, 1);
              removed = true;
              break;
            }
          }
        }
      }
    }
    if (!removed && b.life <= 0) {
      scene.remove(b.mesh);
      heroBolts.splice(i, 1);
    }
  }

  // Hero-owned world objects (zones, pillars, ...)
  Object.values(window.MOBA_HEROES || {}).forEach((k) => { if (k.updateWorld) k.updateWorld(dt, { st, pProg, talents, now }); });

  // Shooter Bot Projectiles (Tests 3D Arena Barrier!)
  const shooter = dummies.find((d) => d.isShooter);
  shooter.mesh.visible = shooterEnabled;
  shooter.plate.style.display = shooterEnabled ? 'flex' : 'none';
  if (shooterEnabled && shooter.stunTimer <= 0) {
    shooter.shootCd -= dt;
    if (shooter.shootCd <= 0) {
      shooter.shootCd = 1.25;
      const ang = Math.atan2(hero.x - shooter.x, hero.z - shooter.z);
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      orb.position.set(shooter.x, 1.3, shooter.z);
      scene.add(orb);
      projectiles.push({ mesh: orb, vx: Math.sin(ang) * 10.5, vz: Math.cos(ang) * 10.5, life: 2.6 });
    }
  }

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const px = p.mesh.position.x;
    const pz = p.mesh.position.z;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.z += p.vz * dt;
    p.life -= dt;

    // 2-Way Arena Projectile Block!
    if (arena) {
      const wasIn = Math.hypot(px - arena.x, pz - arena.z) <= arena.r;
      const nowIn = Math.hypot(p.mesh.position.x - arena.x, p.mesh.position.z - arena.z) <= arena.r;
      if (wasIn !== nowIn) {
        SFX.play('block');
        spawnShockRing(p.mesh.position.x, p.mesh.position.z, 0xfde047, 0.2, 0.9, 0.2);
        spawnFloat(p.mesh.position.x, 1.5, p.mesh.position.z, 'BLOCKED!', '#fde047');
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
        continue;
      }
    }

    if (Math.hypot(p.mesh.position.x - hero.x, p.mesh.position.z - hero.z) <= hero.r + 0.28) {
      const dmg = 65;
      if (hero.shield >= dmg) hero.shield -= dmg;
      else { hero.hp = Math.max(200, hero.hp - (dmg - hero.shield)); hero.shield = 0; }
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
      continue;
    }
    if (p.life <= 0) {
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }

  if (arena) {
    arena.life -= dt;
    arena.wall.material.opacity = 0.18 + Math.sin(now * 0.008) * 0.05;
    if (arena.life <= 0) {
      scene.remove(arena.group);
      arena = null;
    }
  }

  for (let i = vfxRings.length - 1; i >= 0; i--) {
    const r = vfxRings[i];
    r.t += dt;
    const k = Math.min(1, r.t / r.dur);
    r.mesh.scale.setScalar(r.startR + (r.endR - r.startR) * k);
    r.mesh.material.opacity = 0.85 * (1 - k);
    if (k >= 1) {
      scene.remove(r.mesh);
      vfxRings.splice(i, 1);
    }
  }

  // Animate Hero Pivot & Skeletal Mixer
  heroPivot.position.set(hero.x, airborneY, hero.z);
  let diff = hero.facing - heroPivot.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  heroPivot.rotation.y += diff * Math.min(1, dt * 18);

  if (mixer) {
    heroTiltNode.position.set(0, 0, 0);
    if (hero.dashTimer > 0) {
      heroTiltNode.rotation.set(activeDashClipKind === 'jump' ? 0.16 : 0, 0, 0);
      if (activeDashClipKind === 'slide') {
        dashTrailTimer -= dt;
        if (dashTrailTimer <= 0) {
          dashTrailTimer = 0.075;
          spawnShockRing(hero.x, hero.z, 0xd6b470, 0.18, 0.72, 0.22);
        }
      } else if (!activeDashClipKind && (actions.run || actions.idle)) {
        heroTiltNode.rotation.set(0.22, 0, 0);
        fadeToAction(actions.run || actions.idle, 0.08, false, 1.9);
      }
    } else {
      heroTiltNode.rotation.set(0, 0, 0);
      if (activeDashClipKind) {
        if (activeDashClipKind === 'jump') {
          spawnShockRing(hero.x, hero.z, 0xf43f5e, 0.22, 1.15, 0.20);
        }
        activeDashClipKind = null;
        oneShotActive = false;
      }
      const inCommit = hero.punchAnim > 0 || hero.kickAnim > 0 || hero.grenadeAnim > 0 || hero.leapTimer > 0;
      const isNightprowlCrawl = !!(heroKit() && heroKit().isAltMoveActive && heroKit().isAltMoveActive());
      // Kits can swap their locomotion clips (e.g. Cannon Imp carrying vs. unburdened): { idle: slot, move: slot }
      const loco = heroKit() && heroKit().locomotion ? heroKit().locomotion() : null;
      const idleAct = (loco && actions[loco.idle]) || actions.idle;
      const moveAct = isNightprowlCrawl ? actions.crawl : ((loco && actions[loco.move]) || actions.run);
      const runScale = (hero.rChargeTimer > 0 ? 0.62 : isNightprowlCrawl ? 1.38 : 1.15) * (1 + hero.siphonBonus);

      // Track smooth transition into/out of All-Fours Prowl (0.50s drop onto front paws, 0.42s rise back to two feet)
      const wasProwling = (hero.prowlBlend || 0) > 0.5;
      if (isNightprowlCrawl) {
        hero.prowlBlend = Math.min(1, (hero.prowlBlend || 0) + dt / 0.50);
      } else {
        hero.prowlBlend = Math.max(0, (hero.prowlBlend || 0) - dt / 0.42);
      }
      const prowlFadeDur = (isNightprowlCrawl && activeAction !== actions.crawl) ? 0.50
        : (!isNightprowlCrawl && wasProwling) ? 0.42
        : 0.16;

      if (oneShotActive && isMoving && !inCommit && moveAct) {
        fadeToAction(moveAct, 0.24, false, runScale);
      } else if (!oneShotActive) {
        if (isNightprowlCrawl) {
          // Stay on all fours throughout Nightprowl (1.38x bounding prowl while moving, 0.16x crouched breathing while still!)
          fadeToAction(actions.crawl, prowlFadeDur, false, isMoving ? runScale : 0.16);
        } else if (isMoving && moveAct) {
          fadeToAction(moveAct, prowlFadeDur, false, runScale);
        } else if (idleAct) {
          fadeToAction(idleAct, prowlFadeDur, false, 1.0);
        } else if (moveAct) {
          fadeToAction(moveAct, prowlFadeDur, false, isMoving ? runScale : 0.0);
        }
      }

      // Add a smooth feline dive-to-paws arc during the upright <-> all-fours transition + bounding gallop rock while prowling!
      const pb = hero.prowlBlend || 0;
      if (pb > 0.01 && pb < 0.99) {
        const diveArc = Math.sin(pb * Math.PI);
        heroTiltNode.position.y += diveArc * 0.14;
        heroTiltNode.position.z += diveArc * 0.18;
        heroTiltNode.rotation.x += diveArc * 0.26;
      } else if (pb >= 0.99 && isMoving && actions.crawl) {
        const boundPhase = ((actions.crawl.time || 0) / 0.67) * Math.PI * 2;
        heroTiltNode.rotation.x += Math.sin(boundPhase) * 0.095;
        heroTiltNode.position.y += Math.abs(Math.cos(boundPhase)) * 0.065;
      }
    }
    mixer.update(dt);

    const kitPost = heroKit();
    if (kitPost && kitPost.postMixer) kitPost.postMixer();
  }

  // Smooth Twilight-Teal Stealth Shimmer Transition (0.55s fade-in, 0.40s fade-out) during Panther's R (Nightprowl)!
  if (loadedMeshes && loadedMeshes.length > 0) {
    const wantStealth = !!(heroKit() && heroKit().wantsStealthShimmer && heroKit().wantsStealthShimmer());
    const prevBlend = hero.stealthBlend || 0;
    if (wantStealth) {
      hero.stealthBlend = Math.min(1, prevBlend + dt / 0.55);
      if (prevBlend < 0.45 && hero.stealthBlend >= 0.45) {
        spawnShockRing(hero.x, hero.z, 0x2dd4bf, 0.18, 1.45, 0.26);
      }
    } else {
      hero.stealthBlend = Math.max(0, prevBlend - dt / 0.40);
    }
    const sb = hero.stealthBlend;
    if (sb > 0.001 || hero._stealthMatActive) {
      hero._stealthMatActive = sb > 0.001;
      const s = sb * sb * (3 - 2 * sb); // Smoothstep
      const op = 1.0 - s * 0.58; // Smoothly glides 1.0 -> 0.42
      const shimmer = Math.sin(s * Math.PI); // Peaks mid-transition as he dissolves into shadow!
      loadedMeshes.forEach((m) => {
        if (!m.material) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => {
          const needTrans = s > 0.005;
          if (mat.transparent !== needTrans) {
            mat.transparent = needTrans;
            mat.needsUpdate = true;
          }
          mat.opacity = needTrans ? op : 1.0;
          if (mat.color) {
            if (needTrans) {
              mat.color.setRGB(
                1.0 - s * 0.42 - shimmer * 0.22,
                1.0 - s * 0.08 + shimmer * 0.06,
                1.0 - s * 0.12 + shimmer * 0.08
              );
            } else {
              mat.color.setHex(0xffffff);
            }
          }
        });
      });
    }
  }

  // Hand-held weapon props (crossbow, wand, ...)
  const kitProps = heroKit();
  if (!(kitProps && kitProps.updateHandProps && kitProps.updateHandProps())) {
    handGrenadeMesh.visible = false;
  }

  const playerDead = phase1Engine && phase1Engine.getPlayerProg().respawnTimer > 0;
  heroPivot.visible = !playerDead;
  crossbowPivot.visible = !playerDead && !!(heroKit() && heroKit().usesCrossbowProp);
  wandPivot.visible = !playerDead && !!(heroKit() && heroKit().usesWandProp) && !window.SORCERESS_MIXAMO;
  shieldSphere.visible = !playerDead && hero.shield > 0;

  // Update League Camera & Sun Shadow Follow (Y unlocks: screen-edge panning; hold Space to snap back to the hero)
  if (camLocked || keys.Space) {
    camFocus.x = hero.x;
    camFocus.z = hero.z;
  } else {
    const pan = 26 * (camDist / 21.5) * dt;
    const edge = 0.94;
    let px = 0, pz = 0;
    if (document.hasFocus()) {
      if (mouseNDC.x > edge) px += 1;
      if (mouseNDC.x < -edge) px -= 1;
      if (mouseNDC.y > edge) pz -= 1;
      if (mouseNDC.y < -edge) pz += 1;
    }
    const B = (window.MOBA_MAP && window.MOBA_MAP.BOUNDS) || { minX: -80, maxX: 80, minZ: -55, maxZ: 55 };
    camFocus.x = THREE.MathUtils.clamp(camFocus.x + px * pan, B.minX, B.maxX);
    camFocus.z = THREE.MathUtils.clamp(camFocus.z + pz * pan, B.minZ, B.maxZ);
  }
  const camY = Math.sin(CAM_PITCH) * camDist;
  const camZOff = Math.cos(CAM_PITCH) * camDist;
  camera.position.set(camFocus.x, camY, camFocus.z + camZOff);
  camera.lookAt(camFocus.x, 0.9, camFocus.z);
  camera.updateMatrixWorld();

  sunLight.position.set(camFocus.x + 12, 24, camFocus.z + 10);
  sunLight.target.position.set(camFocus.x, 0, camFocus.z);
  sunLight.target.updateMatrixWorld();

  // Update Phase 1 4v4 MOBA Engine (Bots, Minion Waves, Towers, Jungle Camps + Boss, LOS Fog & Minimap!)
  if (phase1Engine) {
    phase1Engine.update(dt);
  }

  if (window.__MOBA_TEST && window.__MOBA_TEST.noRender) scene.updateMatrixWorld();
  else if (!SIMFAST || (simFrame++ % 20) === 0) renderer.render(scene, camera);
  else scene.updateMatrixWorld();

  // Update Overhead 3D Unit Plates & HUD
  const hpPos = projectToScreen(hero.x, HERO_HEIGHT + airborneY + 0.45, hero.z);
  heroPlate.style.display = (!playerDead && hpPos.visible) ? 'flex' : 'none';
  heroPlate.style.left = hpPos.x + 'px';
  heroPlate.style.top = hpPos.y + 'px';
  heroPlate.querySelector('.plate-hp').style.width = Math.max(0, (hero.hp / hero.maxHp) * 100) + '%';
  heroPlate.querySelector('.plate-sh').style.width = Math.max(0, (hero.shield / hero.maxHp) * 100) + '%';
  const mpPlateBar = heroPlate.querySelector('.plate-mp');
  if (mpPlateBar) {
    mpPlateBar.style.width = Math.max(0, ((hero.mp || 0) / Math.max(1, hero.maxMp || 1)) * 100) + '%';
  }
  const kitHud = heroKit();
  const kitTag = (kitHud && kitHud.hudTag) ? kitHud.hudTag(st) : '';
  heroPlate.querySelector('.plate-tag').textContent =
    pProg.recallTimer > 0 ? 'RECALLING (' + pProg.recallTimer.toFixed(1) + 's)'
    : hero.rChargeTimer > 0 ? 'HEARTSEEKER (' + hero.rChargeTimer.toFixed(1) + 's)'
    : hero.qArmed ? 'KICK ARMED!'
    : 'Lv' + pProg.level + kitTag + (hero.siphonBonus > 0 ? ' +' + Math.round(hero.siphonBonus * 100) + '% SPD' : '');

  dummies.forEach((d) => {
    if (d.isShooter && !shooterEnabled) return;
    const p = projectToScreen(d.x, 2.75, d.z);
    d.plate.style.display = p.visible ? 'flex' : 'none';
    d.plate.style.left = p.x + 'px';
    d.plate.style.top = p.y + 'px';
    d.plate.querySelector('.plate-hp').style.width = ((d.hp / d.maxHp) * 100) + '%';
    const bleedStr = d.bleedStacks > 0 ? ' [BLEED x' + d.bleedStacks + ']' : '';
    const markStr = (d.predatorMarks || 0) > 0 ? ' [🐾x' + d.predatorMarks + ']' : '';
    const slowStr = d.slowTimer > 0 ? ' [❄️ SLOWED]' : '';
    d.plate.querySelector('.plate-tag').textContent = (d.stunTimer > 0 ? '⚡ STUNNED' : d.name) + slowStr + bleedStr + markStr;
  });

  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i];
    f.y += 1.4 * dt;
    f.life -= dt;
    const sp = projectToScreen(f.x, f.y, f.z);
    f.el.style.left = sp.x + 'px';
    f.el.style.top = sp.y + 'px';
    f.el.style.opacity = Math.min(1, f.life * 1.6);
    if (f.life <= 0) {
      f.el.remove();
      floatTexts.splice(i, 1);
    }
  }

  const meta = HERO_UI_META[activeHeroId] || HERO_UI_META.coyote;
  const baseSpdHud = (heroKit() && heroKit().hudSpeed) ? heroKit().hudSpeed : 338;
  const rSlowHud = hero.rChargeTimer > 0 ? 0.50 : 1.0;
  const eSlipHud = (hero.eSpeedBuffTimer || 0) > 0 ? 0.25 : 0;
  document.getElementById('hud3d-lvl').textContent = pProg.level || 1;
  document.getElementById('hud3d-atk').textContent = 'ATK ' + st.attack;
  document.getElementById('hud3d-fant').textContent = 'ABL ' + (st.ability || 0);
  document.getElementById('hud3d-def').textContent = 'RES ' + (st.resist || 0) + (st.haste ? ' • HASTE ' + st.haste : '');
  document.getElementById('hud3d-spd').textContent = 'SPD ' + Math.round(baseSpdHud * (1 + hero.siphonBonus + eSlipHud + (st.spdPct || 0)) * rSlowHud);

  document.getElementById('hp3d-fill').style.width = Math.max(0, (hero.hp / hero.maxHp) * 100) + '%';
  document.getElementById('sh3d-fill').style.width = Math.max(0, (hero.shield / hero.maxHp) * 100) + '%';
  document.getElementById('hp3d-txt').textContent =
    Math.round(hero.hp) + (hero.shield > 0 ? ' (+' + hero.shield + ')' : '') + ' / ' + hero.maxHp;

  const maxMp = Math.max(1, hero.maxMp || st.maxMp || 310);
  const curMp = Math.round(hero.mp !== undefined ? hero.mp : maxMp);
  document.getElementById('mp3d-fill').style.width = Math.max(0, (curMp / maxMp) * 100) + '%';
  document.getElementById('mp3d-txt').textContent = curMp + ' / ' + maxMp + ' MP';

  document.getElementById('lbl3d-q').textContent = hero.cdQ > 0.05 ? hero.cdQ.toFixed(1) + 's' : meta.q;
  document.getElementById('lbl3d-e').textContent = hero.cdE > 0.05 && hero.eRecast <= 0 ? hero.cdE.toFixed(1) + 's' : meta.e;
  document.getElementById('lbl3d-r').textContent =
    (!wtfMode && (pProg.level || 1) < 4) ? 'LV 4 REQ'
    : (hero.cdR > 0.05 && hero.rChargeTimer <= 0 ? Math.ceil(hero.cdR) + 's' : meta.r);

  const passPip = document.getElementById('pip3d-passive');
  if (passPip) {
    let pText = '';
    if (heroKit() && heroKit().passivePip) {
      pText = heroKit().passivePip(st);
    }
    passPip.style.display = pText ? 'block' : 'none';
    if (pText) passPip.textContent = pText;
  }

  const qPip = document.getElementById('pip3d-q');
  if (qPip) {
    const showQStacks = !!(heroKit() && heroKit().showQStacks && heroKit().showQStacks());
    qPip.style.display = showQStacks ? 'block' : 'none';
    if (showQStacks) qPip.textContent = hero.qTempoStacks + 'x';
  }

  document.getElementById('s3d-q').classList.toggle('empowered', hero.qArmed || (!!heroKit() && !!heroKit().qEmpowered && heroKit().qEmpowered()));
  document.getElementById('s3d-e').classList.toggle('recast-ready', hero.eRecast > 0 || (!!heroKit() && !!heroKit().eReadyGlow && heroKit().eReadyGlow(st)));
  document.getElementById('pip3d-e').style.display = hero.eRecast > 0 ? 'block' : 'none';
  document.getElementById('s3d-r').classList.toggle('empowered', hero.rChargeTimer > 0 || (!!heroKit() && !!heroKit().rEmpowered && heroKit().rEmpowered()));

  // Update Q / E (Lv 1/6/9) and R (Lv 4/8/12) 3-Pip Rank Indicators
  const curLvl = pProg.level || 1;
  const qeRankNow = curLvl >= 9 ? 3 : (curLvl >= 6 ? 2 : 1);
  const ultRankNow = curLvl >= 12 ? 3 : (curLvl >= 8 ? 2 : (curLvl >= 4 ? 1 : 0));
  ['rpips-q', 'rpips-e'].forEach((id) => {
    const row = document.getElementById(id);
    if (row) {
      for (let k = 0; k < 3; k++) {
        if (row.children[k]) row.children[k].classList.toggle('on', k < qeRankNow);
      }
    }
  });
  const rRow = document.getElementById('rpips-r');
  if (rRow) {
    for (let k = 0; k < 3; k++) {
      if (rRow.children[k]) rRow.children[k].classList.toggle('ult-on', k < ultRankNow);
    }
  }

  requestAnimationFrame(tick);
}
