window.MOBA = window.MOBA || {};

(function (M) {
  'use strict';

  let nextId = 1;
  function uid() { return nextId++; }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function createSandboxState() {
    const state = {
      time: 0,
      wtfMode: false,
      shooterEnabled: false,
      enemyWardEnabled: false,
      selectedLevel: 6,
      talents: { 3: 'L', 6: 'L', 10: 'L' },
      units: [],
      projectiles: [],
      zones: [],
      wards: [],
      texts: [],
      particles: [],
      turretUnit: null,
      cannonScrap: null,
      arenaRing: null,
      boomerangSaw: null,
      hero: null
    };
    spawnDefaultDummies(state);
    selectHero(state, 'sorceress', true);
    return state;
  }

  function makeDummy(opts) {
    return {
      id: uid(),
      name: opts.name,
      kind: opts.kind || 'heroDummy', // 'heroDummy' | 'allyDummy' | 'shooter' | 'creep'
      isHero: opts.isHero !== false,
      immortal: opts.immortal !== false,
      team: opts.team || 2,
      x: opts.x,
      y: opts.y,
      spawnX: opts.x,
      spawnY: opts.y,
      vx: 0,
      vy: 0,
      facing: opts.facing || 0,
      radius: opts.radius || M.HITBOX.STANDARD,
      maxHp: opts.hp || 1800,
      hp: opts.hp || 1800,
      shield: 0,
      shieldTimer: 0,
      armor: opts.armor || 25,
      fResist: opts.fResist || 25,
      bonusArmorAura: 0,
      bonusFResistAura: 0,
      moveSpeed: opts.moveSpeed || 0,
      dead: false,
      koResetTimer: 0,
      stunTimer: 0,
      silenceTimer: 0,
      sleepTimer: 0,
      sleepGrace: 0,
      sleepImmune: 0,
      drowsyTimer: 0,
      tauntTimer: 0,
      tauntSource: null,
      slowPct: 0,
      slowTimer: 0,
      siphonedPct: 0,
      siphonedTimer: 0,
      bleedStacks: 0,
      bleedTimer: 0,
      bleedTickAcc: 0,
      bleedSource: null,
      predatorMarks: 0,
      markTimer: 0,
      vivisectHits: 0,
      vivisectTimer: 0,
      knockbackVx: 0,
      knockbackVy: 0,
      knockbackTimer: 0,
      knockbackWallStun: false,
      knockbackSource: null,
      lastDamagedByHeroAt: -99,
      shooterCd: 1.4,
      wasInsideArena: false
    };
  }

  function spawnDefaultDummies(state) {
    state.units = [];

    // Primary Courtyard Duelist Hero Dummy
    state.units.push(makeDummy({
      name: 'Boss Target',
      kind: 'heroDummy',
      isHero: true,
      immortal: true,
      team: 2,
      x: 1120,
      y: 775,
      hp: 2200,
      armor: 26,
      fResist: 26,
      facing: Math.PI
    }));

    // Friendly Ally Dummy (for Fairy heals/shields/E-hop + Bodyguard screening aura!)
    const ally = makeDummy({
      name: 'Ally Squire',
      kind: 'allyDummy',
      isHero: true,
      immortal: true,
      team: 1,
      x: 910,
      y: 865,
      hp: 1400,
      armor: 20,
      fResist: 20,
      facing: 0
    });
    ally.hp = 980; // Slightly injured so heals are immediately visible!
    state.units.push(ally);

    // 4-Pack Clustered Hero Dummies (North-East Courtyard)
    const packOrigin = { x: 1560, y: 555 };
    const offsets = [
      [-48, -42],
      [48, -42],
      [-48, 46],
      [48, 46]
    ];
    for (let i = 0; i < offsets.length; i++) {
      state.units.push(makeDummy({
        name: 'Dummy #' + (i + 1),
        kind: 'heroDummy',
        isHero: true,
        immortal: true,
        team: 2,
        x: packOrigin.x + offsets[i][0],
        y: packOrigin.y + offsets[i][1],
        hp: 1600,
        armor: 22,
        fResist: 22,
        facing: Math.PI
      }));
    }

    // Ranged Projectile Shooter Dummy (South-East Courtyard)
    state.units.push(makeDummy({
      name: 'Arcane Turret Bot',
      kind: 'shooter',
      isHero: true,
      immortal: true,
      team: 2,
      x: 1410,
      y: 1145,
      hp: 1700,
      armor: 20,
      fResist: 20,
      facing: -Math.PI * 0.75
    }));
  }

  function spawnCreepPack(state) {
    const spots = [
      { x: 960, y: 635 },
      { x: 1020, y: 605 },
      { x: 1030, y: 670 },
      { x: 1085, y: 635 }
    ];
    for (let i = 0; i < spots.length; i++) {
      state.units.push(makeDummy({
        name: 'Creep',
        kind: 'creep',
        isHero: false,
        immortal: false,
        team: 2,
        x: spots[i].x + (Math.random() * 14 - 7),
        y: spots[i].y + (Math.random() * 14 - 7),
        radius: 17,
        hp: 260,
        armor: 8,
        fResist: 8,
        facing: Math.PI
      }));
    }
    addFloatingText(state, 1020, 585, 'CREEP PACK SPAWNED', '#fde047', 13);
  }

  function selectHero(state, heroId, resetPosition) {
    const def = M.HEROES[heroId];
    if (!def) return;

    // Clean up hero-specific sub-entities
    if (state.turretUnit) {
      state.units = state.units.filter(function (u) { return u !== state.turretUnit; });
      state.turretUnit = null;
    }
    state.cannonScrap = null;
    state.arenaRing = null;
    state.boomerangSaw = null;

    const prevX = state.hero && !resetPosition ? state.hero.x : 740;
    const prevY = state.hero && !resetPosition ? state.hero.y : 830;

    if (state.hero) {
      state.units = state.units.filter(function (u) { return u !== state.hero; });
    }

    const hero = {
      id: uid(),
      heroId: heroId,
      def: def,
      name: def.name,
      kind: 'playerHero',
      isHero: true,
      immortal: true,
      team: 1,
      x: prevX,
      y: prevY,
      vx: 0,
      vy: 0,
      facing: 0,
      radius: def.radius,
      level: state.selectedLevel,
      hp: 800,
      maxHp: 800,
      mp: 400,
      maxMp: 400,
      shield: 0,
      shieldTimer: 0,
      rShieldActive: false,
      dead: false,

      // Cooldowns
      atkTimer: 0,
      cdQ: 0,
      cdE: 0,
      cdR: 0,
      cdWard: 0,
      recallTimer: 0,

      // Generic CC/Buff states
      stunTimer: 0,
      silenceTimer: 0,
      sleepTimer: 0,
      sleepGrace: 0,
      sleepImmune: 0,
      drowsyTimer: 0,
      tauntTimer: 0,
      tauntSource: null,
      slowPct: 0,
      slowTimer: 0,
      siphonedPct: 0,
      siphonedTimer: 0,
      hastePct: 0,
      hasteTimer: 0,
      atkSpeedBonusPct: 0,
      atkSpeedTimer: 0,
      knockbackVx: 0,
      knockbackVy: 0,
      knockbackTimer: 0,
      dashTimer: 0,
      dashVx: 0,
      dashVy: 0,
      dashKind: null,
      airborneTimer: 0,

      // Kit-specific states
      qTempoStacks: 0,
      qTempoTimer: 0,
      coyoteQArmed: false,
      coyoteChargeTimer: 0,
      fairyERecastTimer: 0,
      fairyUltTimer: 0,
      guardStacks: 0,
      peakPhysiqueTimer: 0,
      qWindupTimer: 0,
      qWindupAngle: 0,
      hasCannon: true,
      brawlerQArmed: false,
      brawlerPunchCount: 0,
      brawlerERecastTimer: 0,
      brawlerEHitDone: false,
      siphonMap: {},
      sawSpinTimer: 0,
      sawSpinTickAcc: 0,
      sawSpinInterval: 1.0,
      stealthTimer: 0,
      stealthExitGrace: 0,
      unseenLinger: 0,
      isCurrentlyUnseen: false,
      flurryRemaining: 0,
      flurryAcc: 0,
      meleeSwingTimer: 0,
      meleeSwingAngle: 0
    };

    recalcHeroStats(state, hero, true);
    state.hero = hero;
    state.units.unshift(hero);
  }

  function hasTalent(state, tier, side) {
    return state.hero && state.hero.level >= tier && state.talents[tier] === side;
  }

  function recalcHeroStats(state, hero, refill) {
    const b = hero.def.baseStats;
    const lv = hero.level - 1;
    hero.maxHp = Math.round(b.hp + b.hpGrow * lv);
    hero.maxMp = Math.round(b.mp + b.mpGrow * lv);
    hero.phys = b.phys + b.physGrow * lv;
    hero.fant = b.fant + b.fantGrow * lv;
    hero.baseArmor = b.armor + b.armorGrow * lv;
    hero.baseFResist = b.fResist + b.fResistGrow * lv;
    hero.hpRegen = b.hpRegen + lv * 0.55;
    hero.mpRegen = b.mpRegen + lv * 0.45;

    if (refill) {
      hero.hp = hero.maxHp;
      hero.mp = hero.maxMp;
    } else {
      hero.hp = Math.min(hero.hp, hero.maxHp);
      hero.mp = Math.min(hero.mp, hero.maxMp);
    }
  }

  function getEffectiveArmor(state, unit) {
    let a = unit.baseArmor !== undefined ? unit.baseArmor : unit.armor;
    if (unit.heroId === 'bodyguard') {
      a += unit.guardStacks * 14;
    }
    if (unit.heroId === 'cannon' && !unit.hasCannon && state.turretUnit && !state.turretUnit.dead) {
      if (hasTalent(state, 3, 'L') && dist(unit, state.turretUnit) <= 270) {
        a += 20;
      }
    }
    if (unit.bonusArmorAura) a += unit.bonusArmorAura;
    return a;
  }

  function getEffectiveFResist(state, unit) {
    let r = unit.baseFResist !== undefined ? unit.baseFResist : unit.fResist;
    if (unit.heroId === 'bodyguard') {
      r += unit.guardStacks * 14;
    }
    if (unit.bonusFResistAura) r += unit.bonusFResistAura;
    return r;
  }

  function getEffectiveMoveSpeed(state, hero) {
    let spd = hero.def.baseStats.moveSpeed;
    let bonusPct = 0;

    if (hero.heroId === 'cannon' && !hero.hasCannon) {
      bonusPct += 0.22;
    }
    if (hero.heroId === 'panther' && hero.unseenLinger > 0) {
      bonusPct += hasTalent(state, 3, 'L') ? 0.38 : 0.28;
    }
    if (hero.heroId === 'brawler') {
      const keys = Object.keys(hero.siphonMap);
      for (let i = 0; i < keys.length; i++) {
        bonusPct += hero.siphonMap[keys[i]].pct;
      }
    }
    if (hero.heroId === 'scientist' && hero.sawSpinTimer > 0 && hasTalent(state, 6, 'L')) {
      bonusPct += 0.10;
    }
    if (hero.heroId === 'coyote' && hasTalent(state, 3, 'L')) {
      // Bloodscent: +4% per bleed stack when moving toward bleeding hero
      const mvLen = Math.hypot(hero.vx, hero.vy);
      if (mvLen > 10) {
        let bestBleed = 0;
        for (let i = 0; i < state.units.length; i++) {
          const u = state.units[i];
          if (u.team !== hero.team && !u.dead && u.isHero && u.bleedStacks > 0 && dist(hero, u) <= 720) {
            const dx = (u.x - hero.x) / Math.max(1, dist(hero, u));
            const dy = (u.y - hero.y) / Math.max(1, dist(hero, u));
            const dot = (hero.vx / mvLen) * dx + (hero.vy / mvLen) * dy;
            if (dot > 0.32 && u.bleedStacks > bestBleed) {
              bestBleed = u.bleedStacks;
            }
          }
        }
        bonusPct += bestBleed * 0.04;
      }
    }

    if (hero.hasteTimer > 0) bonusPct += hero.hastePct;

    let slow = hero.slowTimer > 0 ? hero.slowPct : 0;
    if (hero.coyoteChargeTimer > 0) slow = Math.max(slow, 0.42);
    if (hero.siphonedTimer > 0) slow = Math.max(slow, hero.siphonedPct);

    return Math.round(spd * (1 + bonusPct) * (1 - clamp(slow, 0, 0.75)));
  }

  function addFloatingText(state, x, y, text, color, size) {
    state.texts.push({
      x: x + (Math.random() * 18 - 9),
      y: y - 18,
      vy: -42,
      life: 0.95,
      maxLife: 0.95,
      text: text,
      color: color || '#fff',
      size: size || 13
    });
  }

  function spawnParticles(state, x, y, color, count, speed) {
    const n = count || 8;
    const spd = speed || 130;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const v = spd * (0.35 + Math.random() * 0.75);
      state.particles.push({
        x: x,
        y: y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        r: 2.5 + Math.random() * 3,
        color: color,
        life: 0.32 + Math.random() * 0.25,
        maxLife: 0.55
      });
    }
  }

  function giveShield(unit, amount, duration, isBodyguardUlt) {
    unit.shield = Math.max(unit.shield, Math.round(amount));
    unit.shieldTimer = Math.max(unit.shieldTimer, duration || 3.5);
    if (isBodyguardUlt) unit.rShieldActive = true;
  }

  function healUnit(state, unit, amount) {
    if (unit.dead || amount <= 0) return;
    const before = unit.hp;
    unit.hp = Math.min(unit.maxHp, unit.hp + amount);
    const gained = Math.round(unit.hp - before);
    if (gained >= 4) {
      addFloatingText(state, unit.x, unit.y - unit.radius, '+' + gained, '#4ade80', 12);
    }
  }

  function applySlow(unit, pct, duration) {
    if (pct >= unit.slowPct || unit.slowTimer <= 0) {
      unit.slowPct = pct;
    }
    unit.slowTimer = Math.max(unit.slowTimer, duration);
  }

  function applyKnockback(unit, dirX, dirY, distance, duration, wallStun, source) {
    const len = Math.hypot(dirX, dirY) || 1;
    const dur = duration || 0.22;
    unit.knockbackVx = (dirX / len) * (distance / dur);
    unit.knockbackVy = (dirY / len) * (distance / dur);
    unit.knockbackTimer = dur;
    unit.knockbackWallStun = !!wallStun;
    unit.knockbackSource = source || null;
  }

  function applyBleed(state, source, target, stacksToAdd) {
    if (!target || target.dead || target.team === source.team) return;
    const maxStacks = hasTalent(state, 6, 'R') && source.heroId === 'coyote' ? 5 : 4;
    target.bleedStacks = Math.min(maxStacks, target.bleedStacks + stacksToAdd);
    target.bleedTimer = 5.0;
    target.bleedSource = source;
  }

  function addVivisectHit(state, scientist, target) {
    if (!target || target.dead || target.team === scientist.team) return;
    const threshold = hasTalent(state, 3, 'R') ? 4 : 5;
    target.vivisectHits = (target.vivisectHits || 0) + 1;
    target.vivisectTimer = 4.0;
    if (target.vivisectHits >= threshold) {
      target.vivisectHits = 0;
      const bonus = 55 + scientist.level * 12 + scientist.phys * 0.85;
      M.Audio.play('bleedPop');
      spawnParticles(state, target.x, target.y, '#f59e0b', 14, 180);
      addFloatingText(state, target.x, target.y - 26, 'VIVISECT!', '#fbbf24', 14);
      dealDamage(state, scientist, target, bonus, 'physical', { isProc: true });
    }
  }

  function procPredatorMark(state, panther, target) {
    if (!target || target.predatorMarks <= 0) return;
    target.predatorMarks -= 1;
    let bonus = 28 + panther.level * 6 + panther.phys * 0.35 + panther.fant * 0.6;
    if (hasTalent(state, 6, 'R')) bonus *= 1.35;
    dealDamage(state, panther, target, bonus, 'fantasy', { isProc: true });
    spawnParticles(state, target.x, target.y, '#38bdf8', 6, 110);

    if (target.predatorMarks === 0 && hasTalent(state, 6, 'L')) {
      applySlow(target, 0.50, 1.25);
      panther.cdE = Math.max(0, panther.cdE - 2.0);
      addFloatingText(state, target.x, target.y - 24, 'HAMSTRUNG!', '#38bdf8', 12);
    }
  }

  function onEnemyTakedown(state, killer, victim) {
    if (!killer) return;
    // Sorceress Passive: Restore Mana on recent kill
    if (killer.heroId === 'sorceress') {
      const baseMana = 36 + killer.level * 6;
      const gain = victim.isHero ? baseMana * 3 : baseMana;
      killer.mp = Math.min(killer.maxMp, killer.mp + gain);
      addFloatingText(state, killer.x, killer.y - 28, '+' + Math.round(gain) + ' MP', '#38bdf8', 13);
      spawnParticles(state, killer.x, killer.y, '#38bdf8', 10, 110);
    }
    // Panther Lv 10 Left: Hero takedown within 4s of exiting Stealth refreshes E & grants 2.5s Stealth
    if (killer.heroId === 'panther' && victim.isHero && hasTalent(state, 10, 'L')) {
      if (killer.stealthTimer > 0 || killer.stealthExitGrace > 0) {
        killer.cdE = 0;
        killer.stealthTimer = Math.max(killer.stealthTimer, 2.5);
        killer.unseenLinger = hasTalent(state, 3, 'L') ? 2.7 : 1.2;
        M.Audio.play('stealth');
        addFloatingText(state, killer.x, killer.y - 30, 'APEX RESET!', '#2dd4bf', 14);
      }
    }
  }

  function dealDamage(state, attacker, target, rawAmount, dmgType, opts) {
    opts = opts || {};
    if (!target || target.dead || rawAmount <= 0) return 0;

    let amount = rawAmount;

    // Brawler Arena amplification
    if (attacker && attacker.heroId === 'brawler' && state.arenaRing && state.arenaRing.owner === attacker) {
      if (dist(target, state.arenaRing) <= state.arenaRing.radius) {
        amount *= hasTalent(state, 10, 'L') ? 1.35 : 1.20;
      }
    }

    const resist = dmgType === 'fantasy'
      ? getEffectiveFResist(state, target)
      : getEffectiveArmor(state, target);
    const mitigated = amount * (100 / (100 + Math.max(0, resist)));
    let finalDmg = Math.max(1, Math.round(mitigated));

    // Break Recall on Hero damage
    if (target.kind === 'playerHero' && finalDmg > 0) {
      target.recallTimer = 0;
    }

    // Track Sorceress damage credit window (2s)
    if (attacker && state.hero && (attacker === state.hero || attacker.owner === state.hero)) {
      target.lastDamagedByHeroAt = state.time;
    }

    // Bodyguard Lv 10L Thorns reflect while R Shield holds
    if (target.heroId === 'bodyguard' && target.shield > 0 && target.rShieldActive && !opts.isReflect && attacker && attacker !== target) {
      if (hasTalent(state, 10, 'L')) {
        dealDamage(state, target, attacker, rawAmount * 0.25, 'physical', { isReflect: true, isDot: true });
      }
    }

    // Wake up Sleeping target on direct damage
    if (target.sleepTimer > 0 && target.sleepGrace <= 0 && !opts.isDot) {
      target.sleepTimer = 0;
      target.sleepImmune = 4.0;
      addFloatingText(state, target.x, target.y - 30, 'WOKE UP!', '#fde047', 12);
      if (state.hero && state.hero.heroId === 'fairy' && hasTalent(state, 10, 'L')) {
        const wakePop = 65 + state.hero.level * 12 + state.hero.fant * 0.8;
        dealDamage(state, state.hero, target, wakePop, 'fantasy', { isDot: true });
      }
    }

    // Absorb with Shield first
    if (target.shield > 0) {
      if (target.shield >= finalDmg) {
        target.shield -= finalDmg;
        if (!opts.isDot) {
          addFloatingText(state, target.x, target.y, '(' + finalDmg + ')', '#fde047', 11);
        }
        return finalDmg;
      } else {
        finalDmg -= target.shield;
        target.shield = 0;
        target.rShieldActive = false;
      }
    }

    target.hp -= finalDmg;

    if (!opts.isDot || finalDmg >= 12) {
      const col = dmgType === 'fantasy' ? '#38bdf8' : '#fb7185';
      addFloatingText(state, target.x, target.y, String(finalDmg), col, opts.bigText ? 15 : 12);
    }

    // Check Death vs Immortal Dummy Knockout
    if (target.hp <= 0) {
      if (target.kind === 'turretPet') {
        destroyAnchoredTurret(state, target);
      } else if (target.immortal) {
        target.hp = 1;
        if (target.koResetTimer <= 0) {
          target.koResetTimer = 0.75;
          addFloatingText(state, target.x, target.y - 32, 'KO! SIMULATED KILL', '#fde047', 14);
          if (state.hero && state.time - target.lastDamagedByHeroAt <= 2.2) {
            onEnemyTakedown(state, state.hero, target);
          }
        }
      } else {
        target.hp = 0;
        target.dead = true;
        spawnParticles(state, target.x, target.y, '#fb7185', 12, 140);
        if (state.hero && state.time - target.lastDamagedByHeroAt <= 2.2) {
          onEnemyTakedown(state, state.hero, target);
        }
      }
    }

    return finalDmg;
  }

  function spawnFairyDust(state, fairy, x, y, customRadius) {
    const dur = 3.5 + (hasTalent(state, 3, 'R') ? 1.5 : 0);
    state.zones.push({
      id: uid(),
      kind: 'fairyDust',
      owner: fairy,
      team: fairy.team,
      x: x,
      y: y,
      radius: customRadius || 96,
      life: dur,
      maxLife: dur,
      tickAcc: 0
    });
  }

  function destroyAnchoredTurret(state, turret) {
    turret.dead = true;
    state.turretUnit = null;
    state.cannonScrap = {
      x: turret.x,
      y: turret.y,
      radius: 26
    };
    M.Audio.play('cannon');
    spawnParticles(state, turret.x, turret.y, '#fb923c', 16, 170);
    addFloatingText(state, turret.x, turret.y - 24, 'CANNON BROKEN! PICK UP SCRAP', '#fbbf24', 13);
  }

  function grantCannonPickupBuff(state, hero) {
    hero.hasCannon = true;
    M.Audio.play('chime');
    if (hasTalent(state, 6, 'R')) {
      giveShield(hero, 95 + hero.level * 16, 3.0, false);
      hero.hastePct = 0.30;
      hero.hasteTimer = 2.0;
      addFloatingText(state, hero.x, hero.y - 28, 'SALVAGE BOOST!', '#fde047', 13);
    }
  }

  // =========================================================
  // BASIC ATTACKS (LMB)
  // =========================================================
  function tryBasicAttack(state, aimX, aimY) {
    const h = state.hero;
    if (!h || h.dead || h.stunTimer > 0 || h.sleepTimer > 0 || h.airborneTimer > 0) return;
    if (h.coyoteChargeTimer > 0) return;
    if (h.atkTimer > 0) return;

    const ang = Math.atan2(aimY - h.y, aimX - h.x);
    h.facing = ang;

    // Breaking Panther Stealth on attack
    if (h.stealthTimer > 0) {
      h.stealthTimer = 0;
      h.stealthExitGrace = 4.0;
    }

    let baseCd = h.def.baseStats.atkCooldown;
    if (h.heroId === 'cannon' && !h.hasCannon) baseCd = 0.65;
    if (h.atkSpeedTimer > 0) baseCd /= (1 + h.atkSpeedBonusPct);
    h.atkTimer = baseCd;

    const dx = Math.cos(ang);
    const dy = Math.sin(ang);

    switch (h.heroId) {
      case 'sorceress': {
        M.Audio.play('pillar');
        state.projectiles.push({
          id: uid(), owner: h, team: h.team, kind: 'sorcAuto',
          x: h.x + dx * 22, y: h.y + dy * 22,
          vx: dx * 640, vy: dy * 640,
          radius: 7, maxDist: h.def.baseStats.atkRange, traveled: 0,
          dmg: h.phys * 0.4 + h.fant * 0.42, dmgType: 'fantasy', color: '#7dd3fc'
        });
        break;
      }

      case 'coyote': {
        M.Audio.play('bolt');
        if (h.coyoteQArmed) {
          h.coyoteQArmed = false;
          const mult = hasTalent(state, 3, 'R') ? 1.5 : 2.0;
          h.atkTimer = baseCd * mult;
          const pierceAll = hasTalent(state, 10, 'R');
          const rangeMult = pierceAll ? 1.20 : 1.0;
          const spreads = [-0.13, 0, 0.13];
          for (let i = 0; i < spreads.length; i++) {
            const a = ang + spreads[i];
            state.projectiles.push({
              id: uid(), owner: h, team: h.team, kind: 'coyoteBolt',
              x: h.x + Math.cos(a) * 24, y: h.y + Math.sin(a) * 24,
              vx: Math.cos(a) * 840, vy: Math.sin(a) * 840,
              radius: 7, maxDist: h.def.baseStats.atkRange * rangeMult, traveled: 0,
              dmg: h.phys * 0.82, dmgType: 'physical', color: '#fbbf24',
              pierce: pierceAll, hitSet: {}
            });
          }
        } else {
          state.projectiles.push({
            id: uid(), owner: h, team: h.team, kind: 'coyoteBolt',
            x: h.x + dx * 24, y: h.y + dy * 24,
            vx: dx * 820, vy: dy * 820,
            radius: 7, maxDist: h.def.baseStats.atkRange, traveled: 0,
            dmg: h.phys * 1.05, dmgType: 'physical', color: '#f97316',
            pierce: false, hitSet: {}
          });
        }
        break;
      }

      case 'fairy': {
        M.Audio.play('bubble');
        state.projectiles.push({
          id: uid(), owner: h, team: h.team, kind: 'fairyAuto',
          x: h.x + dx * 18, y: h.y + dy * 18,
          vx: dx * 680, vy: dy * 680,
          radius: 6, maxDist: h.def.baseStats.atkRange, traveled: 0,
          dmg: h.phys * 0.5 + h.fant * 0.32, dmgType: 'fantasy', color: '#6ee7b7'
        });
        break;
      }

      case 'cannon': {
        if (h.hasCannon) {
          M.Audio.play('cannon');
          state.projectiles.push({
            id: uid(), owner: h, team: h.team, kind: 'cannonShell',
            x: h.x + dx * 24, y: h.y + dy * 24,
            vx: dx * 630, vy: dy * 630,
            radius: 10, maxDist: h.def.baseStats.atkRange, traveled: 0,
            dmg: h.phys * 1.05, dmgType: 'physical', color: '#fb923c'
          });
        } else {
          performMeleeArc(state, h, ang, 88, h.phys * 0.58, 'punch');
        }
        break;
      }

      case 'bodyguard': {
        performMeleeArc(state, h, ang, 102, h.phys * 1.05, 'punch');
        break;
      }

      case 'brawler': {
        h.brawlerPunchCount += 1;
        const isThird = hasTalent(state, 6, 'R') && (h.brawlerPunchCount % 3 === 0);
        const isKick = h.brawlerQArmed;
        h.brawlerQArmed = false;

        const dmg = isKick ? (h.phys * 1.45 + 35 + h.level * 10) : (h.phys * 1.05);
        const hitUnits = performMeleeArc(state, h, ang, isThird ? 125 : 98, dmg, 'punch', isThird ? Math.PI * 0.9 : Math.PI * 0.55);

        for (let i = 0; i < hitUnits.length; i++) {
          const u = hitUnits[i];
          // Siphon Move Speed Passive
          const step = hasTalent(state, 3, 'R') ? 0.05 : 0.025;
          const dur = hasTalent(state, 3, 'R') ? 6.0 : 4.0;
          const cur = h.siphonMap[u.id] ? h.siphonMap[u.id].pct : 0;
          const nextPct = Math.min(0.10, cur + step);
          h.siphonMap[u.id] = { pct: nextPct, timer: dur };
          u.siphonedPct = nextPct;
          u.siphonedTimer = dur;

          if (isKick) {
            u.stunTimer = Math.max(u.stunTimer, 1.1);
            addFloatingText(state, u.x, u.y - 26, 'STUNNED!', '#fde047', 13);
            spawnParticles(state, u.x, u.y, '#fb7185', 10, 150);
          }
        }
        if (isThird && hitUnits.length > 0) {
          healUnit(state, h, (h.maxHp - h.hp) * 0.08 + 18);
        }
        break;
      }

      case 'scientist': {
        const hits = performMeleeArc(state, h, ang, 94, h.phys * 0.95, 'saw');
        for (let i = 0; i < hits.length; i++) {
          addVivisectHit(state, h, hits[i]);
        }
        break;
      }

      case 'panther': {
        const hits = performMeleeArc(state, h, ang, 94, h.phys * 0.95, 'claw');
        for (let i = 0; i < hits.length; i++) {
          procPredatorMark(state, h, hits[i]);
        }
        break;
      }
    }
  }

  function performMeleeArc(state, attacker, angle, reach, dmg, sfx, halfArc) {
    M.Audio.play(sfx || 'punch');
    attacker.meleeSwingTimer = 0.18;
    attacker.meleeSwingAngle = angle;
    const cone = halfArc || Math.PI * 0.52;
    const hitList = [];

    for (let i = 0; i < state.units.length; i++) {
      const u = state.units[i];
      if (u.dead || u.team === attacker.team) continue;
      if (u.kind === 'shooter' && !state.shooterEnabled) continue;
      const d = dist(attacker, u);
      if (d <= reach + u.radius) {
        let diff = Math.atan2(u.y - attacker.y, u.x - attacker.x) - angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) <= cone || d <= attacker.radius + u.radius + 8) {
          dealDamage(state, attacker, u, dmg, 'physical');
          spawnParticles(state, u.x, u.y, '#fb7185', 5, 100);
          hitList.push(u);
        }
      }
    }
    return hitList;
  }

  // =========================================================
  // ABILITY CASTING (Q / E / R / F / B)
  // =========================================================
  function canCast(state, hero, slotKey) {
    if (!hero || hero.dead || hero.stunTimer > 0 || hero.sleepTimer > 0 || hero.silenceTimer > 0 || hero.tauntTimer > 0) {
      return false;
    }
    if (slotKey === 'R' && hero.level < 4) {
      addFloatingText(state, hero.x, hero.y - 26, 'ULT UNLOCKS AT LV 4', '#94a3b8', 12);
      return false;
    }
    const cdField = 'cd' + slotKey;
    if (!state.wtfMode && hero[cdField] > 0) return false;

    const ab = hero.def.abilities[slotKey];
    const cost = state.wtfMode ? 0 : (ab.mp || 0);
    if (hero.mp < cost) {
      addFloatingText(state, hero.x, hero.y - 26, 'NO MANA', '#38bdf8', 12);
      return false;
    }
    return true;
  }

  function spendAbility(state, hero, slotKey, customCd) {
    const ab = hero.def.abilities[slotKey];
    if (!state.wtfMode) {
      hero.mp = Math.max(0, hero.mp - (ab.mp || 0));
      let cd = customCd !== undefined ? customCd : ab.cd;
      if (hero.heroId === 'fairy' && hero.fairyUltTimer > 0 && hasTalent(state, 10, 'R') && (slotKey === 'Q' || slotKey === 'E')) {
        cd *= 0.70;
      }
      hero['cd' + slotKey] = cd;
    } else {
      hero['cd' + slotKey] = 0.12;
    }
    hero.recallTimer = 0;
  }

  function castAbility(state, slotKey, aimX, aimY, moveDirX, moveDirY) {
    const h = state.hero;
    if (!h) return;

    // Special free recast checks BEFORE mana/cd gates:
    // 1. Fairy E ally-return recast
    if (slotKey === 'E' && h.heroId === 'fairy' && h.fairyERecastTimer > 0) {
      if (h.stunTimer > 0 || h.sleepTimer > 0 || h.silenceTimer > 0) return;
      let bestAlly = null;
      let bestD = 580;
      for (let i = 0; i < state.units.length; i++) {
        const u = state.units[i];
        if (!u.dead && u.team === h.team && u !== h) {
          const d = Math.hypot(u.x - aimX, u.y - aimY);
          if (dist(h, u) <= 620 && d < bestD) {
            bestD = d;
            bestAlly = u;
          }
        }
      }
      if (!bestAlly) {
        addFloatingText(state, h.x, h.y - 24, 'NO ALLY IN RANGE', '#94a3b8', 12);
        return;
      }
      h.fairyERecastTimer = 0;
      h.x = bestAlly.x - 36;
      h.y = bestAlly.y + 18;
      M.Audio.play('chime');
      spawnFairyDust(state, h, bestAlly.x, bestAlly.y);
      if (hasTalent(state, 6, 'L')) {
        const sh = 75 + h.level * 14 + h.fant * 0.6;
        giveShield(h, sh, 3.0);
        giveShield(bestAlly, sh, 3.0);
      }
      return;
    }

    // 2. Brawler E free 2nd dash recast
    if (slotKey === 'E' && h.heroId === 'brawler' && h.brawlerERecastTimer > 0) {
      if (h.stunTimer > 0 || h.sleepTimer > 0 || h.silenceTimer > 0) return;
      h.brawlerERecastTimer = 0;
      const ang = Math.atan2(aimY - h.y, aimX - h.x);
      h.facing = ang;
      h.dashVx = Math.cos(ang) * 920;
      h.dashVy = Math.sin(ang) * 920;
      h.dashTimer = 0.27;
      h.dashKind = 'brawlerSecondDash';
      h.brawlerEHitDone = false;
      M.Audio.play('dash');
      return;
    }

    if (!canCast(state, h, slotKey)) return;

    const ang = Math.atan2(aimY - h.y, aimX - h.x);
    h.facing = ang;

    // Exiting Panther Stealth on Q/E cast (note: E cast FROM stealth gets Stealth bonus!)
    const wasStealthed = h.stealthTimer > 0;
    if (wasStealthed && slotKey !== 'R') {
      h.stealthTimer = 0;
      h.stealthExitGrace = 4.0;
    }

    // ---------------- SORCERESS ----------------
    if (h.heroId === 'sorceress') {
      if (slotKey === 'Q') {
        const maxRange = 540 * (hasTalent(state, 3, 'L') ? 1.15 : 1.0);
        const d = Math.min(maxRange, Math.hypot(aimX - h.x, aimY - h.y));
        const tx = h.x + Math.cos(ang) * d;
        const ty = h.y + Math.sin(ang) * d;
        const effCd = Math.max(0.6, h.def.abilities.Q.cd - h.qTempoStacks * 1.0);
        spendAbility(state, h, 'Q', effCd);
        spawnSorceressPillar(state, h, tx, ty, true, false);
      } else if (slotKey === 'E') {
        spendAbility(state, h, 'E');
        let mx = moveDirX;
        let my = moveDirY;
        if (Math.hypot(mx, my) < 0.1) {
          mx = Math.cos(ang);
          my = Math.sin(ang);
        } else {
          const ml = Math.hypot(mx, my);
          mx /= ml;
          my /= ml;
        }
        const dashDist = 235 * (hasTalent(state, 6, 'R') ? 1.25 : 1.0);
        const landX = clamp(h.x + mx * dashDist, 60, M.WORLD.width - 60);
        const landY = clamp(h.y + my * dashDist, 60, M.WORLD.height - 60);
        h.dashVx = (landX - h.x) / 0.18;
        h.dashVy = (landY - h.y) / 0.18;
        h.dashTimer = 0.18;
        h.dashKind = 'sorcDash';
        M.Audio.play('dash');
        if (hasTalent(state, 6, 'R')) {
          h.hastePct = 0.25;
          h.hasteTimer = 1.5;
        }
        // Line of 3 pillars aimed from landing spot along your cast cursor direction!
        const lineAng = ang;
        const slowLine = hasTalent(state, 3, 'R');
        for (let i = 1; i <= 3; i++) {
          const px = landX + Math.cos(lineAng) * (i * 92);
          const py = landY + Math.sin(lineAng) * (i * 92);
          state.zones.push({
            id: uid(), kind: 'sorcPillar', owner: h, team: h.team,
            x: px, y: py, radius: 56, delay: 0.18 + i * 0.11, life: 0.45,
            grantsTempo: false, appliesSlow: slowLine
          });
        }
      } else if (slotKey === 'R') {
        const d = Math.min(540, Math.hypot(aimX - h.x, aimY - h.y));
        const tx = h.x + Math.cos(ang) * d;
        const ty = h.y + Math.sin(ang) * d;
        spendAbility(state, h, 'R');
        M.Audio.play('arena');
        state.zones.push({
          id: uid(), kind: 'sorcMonolith', owner: h, team: h.team,
          x: tx, y: ty, startRadius: 90, maxRadius: 205, radius: 90,
          life: 5.0, maxLife: 5.0, tickAcc: 0, pulledAtMax: false
        });
      }
    }

    // ---------------- COYOTE ----------------
    else if (h.heroId === 'coyote') {
      if (slotKey === 'Q') {
        spendAbility(state, h, 'Q');
        h.coyoteQArmed = true;
        h.atkTimer = 0; // Immediately ready to fire!
        M.Audio.play('chime');
        addFloatingText(state, h.x, h.y - 26, 'TRIPLE-NOTCH READY', '#fbbf24', 12);
      } else if (slotKey === 'E') {
        const d = Math.min(520, Math.hypot(aimX - h.x, aimY - h.y));
        const tx = h.x + Math.cos(ang) * d;
        const ty = h.y + Math.sin(ang) * d;
        spendAbility(state, h, 'E');
        M.Audio.play('bolt');
        state.zones.push({
          id: uid(), kind: 'coyoteGrenade', owner: h, team: h.team,
          startX: h.x, startY: h.y, x: tx, y: ty,
          radius: 112, bullseyeRadius: 36,
          delay: 0.34, maxDelay: 0.34
        });
      } else if (slotKey === 'R') {
        spendAbility(state, h, 'R');
        h.coyoteChargeTimer = 2.0;
        M.Audio.play('pillar');
        addFloatingText(state, h.x, h.y - 28, 'CHARGING BOLT...', '#fbbf24', 13);
      }
    }

    // ---------------- LITTLE FAIRY ----------------
    else if (h.heroId === 'fairy') {
      if (slotKey === 'Q') {
        const d = Math.min(520, Math.hypot(aimX - h.x, aimY - h.y));
        const tx = h.x + Math.cos(ang) * d;
        const ty = h.y + Math.sin(ang) * d;
        spendAbility(state, h, 'Q');
        M.Audio.play('bubble');
        const mult = hasTalent(state, 3, 'L') ? 1.20 : 1.0;
        state.zones.push({
          id: uid(), kind: 'fairyBubble', owner: h, team: h.team,
          startX: h.x, startY: h.y, x: tx, y: ty,
          radius: Math.round(108 * mult), shieldMult: mult,
          delay: 0.32, maxDelay: 0.32
        });
      } else if (slotKey === 'E') {
        // Find enemy nearest cursor within range
        let target = null;
        let best = 240;
        for (let i = 0; i < state.units.length; i++) {
          const u = state.units[i];
          if (u.dead || u.team === h.team) continue;
          if (u.kind === 'shooter' && !state.shooterEnabled) continue;
          if (dist(h, u) <= 530 && Math.hypot(u.x - aimX, u.y - aimY) < best) {
            best = Math.hypot(u.x - aimX, u.y - aimY);
            target = u;
          }
        }
        if (!target) {
          addFloatingText(state, h.x, h.y - 24, 'AIM NEAR AN ENEMY', '#94a3b8', 12);
          return;
        }
        spendAbility(state, h, 'E');
        h.x = target.x - Math.cos(ang) * (target.radius + h.radius + 8);
        h.y = target.y - Math.sin(ang) * (target.radius + h.radius + 8);
        const silDur = hasTalent(state, 6, 'R') ? 1.6 : 1.0;
        target.silenceTimer = Math.max(target.silenceTimer, silDur);
        dealDamage(state, h, target, 42 + h.level * 9 + h.fant * 0.55, 'fantasy');
        addFloatingText(state, target.x, target.y - 28, 'SILENCED!', '#7dd3fc', 12);
        spawnFairyDust(state, h, target.x, target.y);
        h.fairyERecastTimer = 3.0;
        M.Audio.play('chime');
      } else if (slotKey === 'R') {
        spendAbility(state, h, 'R');
        h.fairyUltTimer = 10.0;
        M.Audio.play('chime');
        addFloatingText(state, h.x, h.y - 30, 'DREAMDUST ACTIVE!', '#6ee7b7', 14);
        if (hasTalent(state, 10, 'R')) {
          spawnFairyDust(state, h, h.x, h.y, 175);
        }
      }
    }

    // ---------------- SHIRTLESS BODYGUARD ----------------
    else if (h.heroId === 'bodyguard') {
      if (slotKey === 'Q') {
        spendAbility(state, h, 'Q');
        h.qWindupTimer = 0.30;
        h.qWindupAngle = ang;
      } else if (slotKey === 'E') {
        const maxR = 410 * (hasTalent(state, 6, 'L') ? 1.25 : 1.0);
        const d = Math.min(maxR, Math.hypot(aimX - h.x, aimY - h.y));
        const tx = clamp(h.x + Math.cos(ang) * d, 55, M.WORLD.width - 55);
        const ty = clamp(h.y + Math.sin(ang) * d, 55, M.WORLD.height - 55);
        spendAbility(state, h, 'E');
        h.airborneTimer = 0.36;
        h.dashVx = (tx - h.x) / 0.36;
        h.dashVy = (ty - h.y) / 0.36;
        h.dashTimer = 0.36;
        h.dashKind = 'bodyguardLeap';
        M.Audio.play('dash');
      } else if (slotKey === 'R') {
        spendAbility(state, h, 'R');
        M.Audio.play('arena');
        const rad = 255 * (hasTalent(state, 10, 'L') ? 1.25 : 1.0);
        let enemyCount = 0;
        for (let i = 0; i < state.units.length; i++) {
          const u = state.units[i];
          if (u.dead || u.team === h.team) continue;
          if (u.kind === 'shooter' && !state.shooterEnabled) continue;
          if (dist(h, u) <= rad + u.radius) {
            enemyCount += u.isHero ? 2 : 1;
            u.tauntTimer = 2.2;
            u.tauntSource = h;
            addFloatingText(state, u.x, u.y - 28, 'TAUNTED!', '#fbbf24', 13);
          }
        }
        const sh = 120 + h.level * 20 + enemyCount * (55 + h.level * 8);
        giveShield(h, sh, 4.5, true);
        if (hasTalent(state, 10, 'R')) {
          h.peakPhysiqueTimer = 6.0;
        }
        spawnParticles(state, h.x, h.y, '#fbbf24', 20, 210);
        addFloatingText(state, h.x, h.y - 34, 'EYES ON ME!', '#fde047', 15);
      }
    }

    // ---------------- CANNON CREATURE ----------------
    else if (h.heroId === 'cannon') {
      if (slotKey === 'Q') {
        if (h.hasCannon) {
          spendAbility(state, h, 'Q');
          h.hasCannon = false;
          const hpMult = hasTalent(state, 3, 'L') ? 1.35 : 1.0;
          const tHp = Math.round((420 + h.level * 55) * hpMult);
          const turret = makeDummy({
            name: 'Anchored Cannon',
            kind: 'turretPet',
            isHero: false,
            immortal: false,
            team: h.team,
            x: h.x + Math.cos(ang) * 34,
            y: h.y + Math.sin(ang) * 34,
            radius: 21,
            hp: tHp,
            armor: 22,
            fResist: 22,
            facing: ang
          });
          turret.owner = h;
          turret.fireCd = 0.4;
          turret.overchargeTimer = 0;
          state.turretUnit = turret;
          state.units.push(turret);
          M.Audio.play('cannon');
        } else if (state.turretUnit && !state.turretUnit.dead) {
          if (dist(h, state.turretUnit) <= 135) {
            spendAbility(state, h, 'Q', 2.0);
            state.units = state.units.filter(function (u) { return u !== state.turretUnit; });
            state.turretUnit = null;
            grantCannonPickupBuff(state, h);
            addFloatingText(state, h.x, h.y - 24, 'CANNON RECLAIMED', '#fbbf24', 12);
          } else {
            addFloatingText(state, h.x, h.y - 24, 'MOVE CLOSER TO TURRET', '#94a3b8', 12);
          }
        } else {
          addFloatingText(state, h.x, h.y - 24, 'PICK UP SCRAP OR VISIT FOUNTAIN', '#fbbf24', 12);
        }
      } else if (slotKey === 'E') {
        const isBigJump = h.hasCannon;
        const cd = (!isBigJump && hasTalent(state, 6, 'L')) ? h.def.abilities.E.cd * 0.6 : h.def.abilities.E.cd;
        spendAbility(state, h, 'E', cd);
        const maxDist = isBigJump ? 460 : 210;
        const d = Math.min(maxDist, Math.hypot(aimX - h.x, aimY - h.y));
        const tx = clamp(h.x + Math.cos(ang) * d, 55, M.WORLD.width - 55);
        const ty = clamp(h.y + Math.sin(ang) * d, 55, M.WORLD.height - 55);

        if (isBigJump && hasTalent(state, 6, 'L')) {
          cannonBlastArea(state, h, h.x, h.y, 115, h.phys * 0.8 + 30);
        }
        h.airborneTimer = isBigJump ? 0.42 : 0.24;
        h.dashVx = (tx - h.x) / h.airborneTimer;
        h.dashVy = (ty - h.y) / h.airborneTimer;
        h.dashTimer = h.airborneTimer;
        h.dashKind = isBigJump ? 'cannonRocketJump' : 'cannonMiniHop';
        M.Audio.play(isBigJump ? 'cannon' : 'dash');
      } else if (slotKey === 'R') {
        if (!h.hasCannon && (!state.turretUnit || state.turretUnit.dead)) {
          addFloatingText(state, h.x, h.y - 26, 'CANNON IS BROKEN!', '#fb7185', 13);
          return;
        }
        spendAbility(state, h, 'R');
        const origin = (!h.hasCannon && state.turretUnit) ? state.turretUnit : h;
        const fireAng = Math.atan2(aimY - origin.y, aimX - origin.x);
        origin.facing = fireAng;

        if (origin === state.turretUnit && hasTalent(state, 10, 'R')) {
          origin.hp = origin.maxHp;
          origin.overchargeTimer = 5.0;
          addFloatingText(state, origin.x, origin.y - 26, 'TURRET OVERCHARGED!', '#fde047', 13);
        }

        M.Audio.play('cannon');
        state.projectiles.push({
          id: uid(), owner: h, team: h.team, kind: 'superball',
          x: origin.x + Math.cos(fireAng) * 28,
          y: origin.y + Math.sin(fireAng) * 28,
          vx: Math.cos(fireAng) * 860,
          vy: Math.sin(fireAng) * 860,
          radius: 17, maxDist: 780, traveled: 0,
          dmg: 145 + h.level * 24 + h.phys * 1.45,
          dmgType: 'physical', color: '#fde047',
          pierce: hasTalent(state, 10, 'L'), hitSet: {}
        });
      }
    }

    // ---------------- FEMALE BRAWLER ----------------
    else if (h.heroId === 'brawler') {
      if (slotKey === 'Q') {
        const cd = h.def.abilities.Q.cd - (hasTalent(state, 3, 'L') ? 1.5 : 0);
        spendAbility(state, h, 'Q', cd);
        h.brawlerQArmed = true;
        h.atkTimer = 0; // Swing reset!
        M.Audio.play('chime');
        addFloatingText(state, h.x, h.y - 26, 'KICK ARMED!', '#fb7185', 12);
      } else if (slotKey === 'E') {
        spendAbility(state, h, 'E');
        h.dashVx = Math.cos(ang) * 900;
        h.dashVy = Math.sin(ang) * 900;
        h.dashTimer = 0.30;
        h.dashKind = 'brawlerFirstDash';
        h.brawlerEHitDone = false;
        M.Audio.play('dash');
      } else if (slotKey === 'R') {
        spendAbility(state, h, 'R');
        const dur = 5.0 + (hasTalent(state, 10, 'L') ? 1.5 : 0);
        state.arenaRing = {
          owner: h,
          team: h.team,
          x: h.x,
          y: h.y,
          radius: 255,
          life: dur,
          maxLife: dur,
          wallDmgCooldowns: {}
        };
        for (let i = 0; i < state.units.length; i++) {
          const u = state.units[i];
          u.wasInsideArena = dist(u, state.arenaRing) <= state.arenaRing.radius;
        }
        if (hasTalent(state, 10, 'R')) {
          h.cdE = 0;
        }
        M.Audio.play('arena');
        addFloatingText(state, h.x, h.y - 34, 'WELCOME TO THE PIT!', '#fb7185', 15);
      }
    }

    // ---------------- WEIRD SAW SCIENTIST ----------------
    else if (h.heroId === 'scientist') {
      if (slotKey === 'Q') {
        spendAbility(state, h, 'Q');
        h.sawSpinTimer = 3.0;
        h.sawSpinInterval = hasTalent(state, 6, 'L') ? 0.75 : 1.0;
        h.sawSpinTickAcc = h.sawSpinInterval; // Immediate first tick!
        M.Audio.play('saw');
      } else if (slotKey === 'E') {
        spendAbility(state, h, 'E');
        let healAmt = 95 + h.level * 18;
        if (hasTalent(state, 6, 'R')) {
          healAmt *= 1.30;
          h.atkSpeedBonusPct = 0.35;
          h.atkSpeedTimer = 4.0;
        }
        healUnit(state, h, healAmt);
        if (hasTalent(state, 3, 'L')) {
          h.slowTimer = 0;
          h.slowPct = 0;
          h.hastePct = 0.45;
        } else {
          h.hastePct = 0.30;
        }
        h.hasteTimer = 3.0;
        M.Audio.play('bubble');
      } else if (slotKey === 'R') {
        spendAbility(state, h, 'R');
        M.Audio.play('saw');
        state.boomerangSaw = {
          owner: h,
          team: h.team,
          x: h.x,
          y: h.y,
          dirX: Math.cos(ang),
          dirY: Math.sin(ang),
          phase: 'out', // 'out' | 'hover' | 'return'
          traveled: 0,
          maxDist: 640,
          hoverTimer: hasTalent(state, 10, 'L') ? 1.0 : 0,
          hoverAcc: 0,
          radius: 42,
          outHits: {},
          retHits: {},
          heroReturnHits: 0
        };
      }
    }

    // ---------------- PANTHER ROGUE ----------------
    else if (h.heroId === 'panther') {
      if (slotKey === 'Q') {
        spendAbility(state, h, 'Q');
        h.flurryRemaining = 3;
        h.flurryAcc = 0.14; // Fires 1st slash immediately!
      } else if (slotKey === 'E') {
        const maxR = wasStealthed ? 595 : 360;
        const d = Math.min(maxR, Math.hypot(aimX - h.x, aimY - h.y));
        const tx = clamp(h.x + Math.cos(ang) * d, 55, M.WORLD.width - 55);
        const ty = clamp(h.y + Math.sin(ang) * d, 55, M.WORLD.height - 55);
        spendAbility(state, h, 'E');
        h.airborneTimer = 0.24;
        h.dashVx = (tx - h.x) / 0.24;
        h.dashVy = (ty - h.y) / 0.24;
        h.dashTimer = 0.24;
        h.dashKind = wasStealthed ? 'pantherStealthLeap' : 'pantherLeap';
        M.Audio.play('dash');
      } else if (slotKey === 'R') {
        spendAbility(state, h, 'R');
        h.stealthTimer = 6.0;
        h.unseenLinger = hasTalent(state, 3, 'L') ? 2.7 : 1.2;
        M.Audio.play('stealth');
        addFloatingText(state, h.x, h.y - 28, 'STEALTH!', '#2dd4bf', 13);
      }
    }
  }

  function spawnSorceressPillar(state, hero, x, y, grantsTempo, appliesSlow) {
    const rad = Math.round(68 * (hasTalent(state, 6, 'L') ? 1.20 : 1.0));
    state.zones.push({
      id: uid(),
      kind: 'sorcPillar',
      owner: hero,
      team: hero.team,
      x: x,
      y: y,
      radius: rad,
      delay: 0.34,
      life: 0.56,
      grantsTempo: !!grantsTempo,
      appliesSlow: !!appliesSlow
    });
    M.Audio.play('pillar');
  }

  function cannonBlastArea(state, hero, x, y, radius, dmg) {
    spawnParticles(state, x, y, '#fb923c', 12, 160);
    for (let i = 0; i < state.units.length; i++) {
      const u = state.units[i];
      if (u.dead || u.team === hero.team) continue;
      if (u.kind === 'shooter' && !state.shooterEnabled) continue;
      if (Math.hypot(u.x - x, u.y - y) <= radius + u.radius) {
        dealDamage(state, hero, u, dmg, 'physical');
      }
    }
  }

  function placePlayerWard(state, aimX, aimY) {
    const h = state.hero;
    if (!h || h.dead) return;
    if (!state.wtfMode && h.cdWard > 0) return;

    const ang = Math.atan2(aimY - h.y, aimX - h.x);
    const d = Math.min(440, Math.hypot(aimX - h.x, aimY - h.y));
    const wx = clamp(h.x + Math.cos(ang) * d, 50, M.WORLD.width - 50);
    const wy = clamp(h.y + Math.sin(ang) * d, 50, M.WORLD.height - 50);

    // Keep max 2 allied sandbox wards active
    const allied = state.wards.filter(function (w) { return w.team === 1; });
    if (allied.length >= 2) {
      const idx = state.wards.indexOf(allied[0]);
      if (idx >= 0) state.wards.splice(idx, 1);
    }

    state.wards.push({
      id: uid(),
      team: 1,
      x: wx,
      y: wy,
      radius: M.WORLD.visionRangeWard,
      life: 75
    });
    h.cdWard = state.wtfMode ? 0.2 : 18.0;
    M.Audio.play('chime');
    addFloatingText(state, wx, wy - 16, 'OBSERVER WARD', '#fde047', 11);
  }

  function startRecall(state) {
    const h = state.hero;
    if (!h || h.dead || h.stunTimer > 0 || h.sleepTimer > 0) return;
    h.recallTimer = 4.0;
    addFloatingText(state, h.x, h.y - 28, 'RECALLING...', '#38bdf8', 12);
  }

  // =========================================================
  // COLLISION & GEOMETRY RESOLUTION
  // =========================================================
  function resolveObstacleCollisions(state, unit, ignoreTerrain) {
    let hitWallOrTree = false;
    unit.x = clamp(unit.x, unit.radius + 16, M.WORLD.width - unit.radius - 16);
    unit.y = clamp(unit.y, unit.radius + 16, M.WORLD.height - unit.radius - 16);

    if (!ignoreTerrain) {
      for (let i = 0; i < M.TREES.length; i++) {
        const t = M.TREES[i];
        const dx = unit.x - t.x;
        const dy = unit.y - t.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const minD = unit.radius + t.r * 0.82;
        if (d < minD) {
          unit.x = t.x + (dx / d) * minD;
          unit.y = t.y + (dy / d) * minD;
          hitWallOrTree = true;
        }
      }

      for (let i = 0; i < M.WALLS.length; i++) {
        const w = M.WALLS[i];
        const cx = clamp(unit.x, w.x, w.x + w.w);
        const cy = clamp(unit.y, w.y, w.y + w.h);
        const dx = unit.x - cx;
        const dy = unit.y - cy;
        const d = Math.hypot(dx, dy);
        if (d < unit.radius) {
          hitWallOrTree = true;
          if (d > 0.001) {
            unit.x = cx + (dx / d) * unit.radius;
            unit.y = cy + (dy / d) * unit.radius;
          } else {
            unit.x = w.x - unit.radius;
          }
        }
      }
    }

    // Brawler Arena Ring Interaction:
    // - Enemies inside CANNOT leave; enemies outside CAN walk in!
    // - Brawler's own E dash can rebound off her Arena ring!
    if (state.arenaRing) {
      const ar = state.arenaRing;
      const dx = unit.x - ar.x;
      const dy = unit.y - ar.y;
      const d = Math.hypot(dx, dy) || 0.001;

      if (unit.team !== ar.team) {
        if (unit.wasInsideArena && d > ar.radius - unit.radius) {
          unit.x = ar.x + (dx / d) * (ar.radius - unit.radius);
          unit.y = ar.y + (dy / d) * (ar.radius - unit.radius);
          hitWallOrTree = true;

          // Brawler Lv 10R: Enemies colliding with Arena wall take Physical damage
          if (hasTalent(state, 10, 'R')) {
            const lastHit = ar.wallDmgCooldowns[unit.id] || -99;
            if (state.time - lastHit >= 0.9) {
              ar.wallDmgCooldowns[unit.id] = state.time;
              dealDamage(state, ar.owner, unit, 55 + ar.owner.level * 10 + ar.owner.phys * 0.6, 'physical');
              spawnParticles(state, unit.x, unit.y, '#fb7185', 8, 130);
            }
          }
        } else if (d <= ar.radius - unit.radius * 0.4) {
          unit.wasInsideArena = true; // Walked into the Arena -> now trapped inside!
        }
      } else if (unit === ar.owner && unit.dashKind === 'brawlerFirstDash') {
        if (Math.abs(d - ar.radius) <= unit.radius + 8) {
          hitWallOrTree = true;
        }
      }
    }

    return hitWallOrTree;
  }

  // =========================================================
  // MAIN SIMULATION TICK
  // =========================================================
  function update(state, dt, input) {
    state.time += dt;
    const h = state.hero;

    // Sync Enemy Observer Ward toggle
    const existingEnemyWard = state.wards.find(function (w) { return w.team === 2; });
    if (state.enemyWardEnabled && !existingEnemyWard) {
      state.wards.push({
        id: uid(),
        team: 2,
        x: M.WORLD.enemyWardPos.x,
        y: M.WORLD.enemyWardPos.y,
        radius: M.WORLD.visionRangeWard,
        life: 99999
      });
    } else if (!state.enemyWardEnabled && existingEnemyWard) {
      state.wards = state.wards.filter(function (w) { return w.team !== 2; });
    }

    // Update Bodyguard Screening Passive & Broad Shoulders Aura
    for (let i = 0; i < state.units.length; i++) {
      state.units[i].bonusArmorAura = 0;
      state.units[i].bonusFResistAura = 0;
    }
    if (h && h.heroId === 'bodyguard') {
      if (h.peakPhysiqueTimer > 0) {
        h.peakPhysiqueTimer = Math.max(0, h.peakPhysiqueTimer - dt);
        h.guardStacks = 6;
      } else {
        let stacks = 0;
        const allies = state.units.filter(function (u) { return !u.dead && u.team === 1 && u !== h; });
        const enemies = state.units.filter(function (u) {
          return !u.dead && u.team === 2 && (u.kind !== 'shooter' || state.shooterEnabled);
        });
        for (let a = 0; a < allies.length; a++) {
          let allyProtected = false;
          for (let e = 0; e < enemies.length; e++) {
            const al = allies[a];
            const en = enemies[e];
            if (dist(al, en) > 840) continue;
            const sx = en.x - al.x;
            const sy = en.y - al.y;
            const lenSq = sx * sx + sy * sy;
            if (lenSq < 1) continue;
            const t = ((h.x - al.x) * sx + (h.y - al.y) * sy) / lenSq;
            if (t > 0.08 && t < 0.94) {
              const px = al.x + t * sx;
              const py = al.y + t * sy;
              if (Math.hypot(h.x - px, h.y - py) <= 135) {
                stacks += 1;
                allyProtected = true;
              }
            }
          }
          if (allyProtected && hasTalent(state, 3, 'R')) {
            allies[a].bonusArmorAura = stacks * 7;
            allies[a].bonusFResistAura = stacks * 7;
          }
        }
        h.guardStacks = Math.min(6, stacks);
      }
    }

    // Update Hero
    if (h && !h.dead) {
      recalcHeroStats(state, h, false);

      // Cooldowns & Regen
      h.atkTimer = Math.max(0, h.atkTimer - dt);
      h.cdQ = Math.max(0, h.cdQ - dt);
      h.cdE = Math.max(0, h.cdE - dt);
      h.cdR = Math.max(0, h.cdR - dt);
      h.cdWard = Math.max(0, h.cdWard - dt);
      h.meleeSwingTimer = Math.max(0, h.meleeSwingTimer - dt);

      if (state.wtfMode) {
        h.mp = h.maxMp;
      } else {
        h.hp = Math.min(h.maxHp, h.hp + h.hpRegen * dt);
        h.mp = Math.min(h.maxMp, h.mp + h.mpRegen * dt);
      }

      // Fountain Pad Regen + Cannon Replacement!
      if (Math.hypot(h.x - M.WORLD.fountain.x, h.y - M.WORLD.fountain.y) <= M.WORLD.fountain.radius) {
        h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.22 * dt);
        h.mp = Math.min(h.maxMp, h.mp + h.maxMp * 0.28 * dt);
        if (h.heroId === 'cannon' && !h.hasCannon && state.cannonScrap) {
          state.cannonScrap = null;
          h.hasCannon = true;
          M.Audio.play('chime');
          addFloatingText(state, h.x, h.y - 28, 'NEW CANNON ISSUED!', '#fde047', 13);
        }
      }

      // Cannon Scrap Ground Salvage
      if (h.heroId === 'cannon' && !h.hasCannon && state.cannonScrap) {
        if (Math.hypot(h.x - state.cannonScrap.x, h.y - state.cannonScrap.y) <= h.radius + state.cannonScrap.radius + 8) {
          state.cannonScrap = null;
          grantCannonPickupBuff(state, h);
          addFloatingText(state, h.x, h.y - 26, 'CANNON SALVAGED!', '#fbbf24', 13);
        }
      }

      // Recall Channel
      if (h.recallTimer > 0) {
        if (Math.hypot(input.moveX, input.moveY) > 0.1) {
          h.recallTimer = 0;
        } else {
          h.recallTimer -= dt;
          if (h.recallTimer <= 0) {
            h.recallTimer = 0;
            h.x = M.WORLD.fountain.x + 25;
            h.y = M.WORLD.fountain.y;
            M.Audio.play('chime');
            spawnParticles(state, h.x, h.y, '#38bdf8', 18, 170);
          }
        }
      }

      // Kit Timers
      if (h.qTempoTimer > 0) {
        h.qTempoTimer -= dt;
        if (h.qTempoTimer <= 0) h.qTempoStacks = 0;
      }
      if (h.fairyERecastTimer > 0) h.fairyERecastTimer = Math.max(0, h.fairyERecastTimer - dt);
      if (h.fairyUltTimer > 0) h.fairyUltTimer = Math.max(0, h.fairyUltTimer - dt);
      if (h.brawlerERecastTimer > 0) h.brawlerERecastTimer = Math.max(0, h.brawlerERecastTimer - dt);
      if (h.hasteTimer > 0) h.hasteTimer = Math.max(0, h.hasteTimer - dt);
      if (h.atkSpeedTimer > 0) h.atkSpeedTimer = Math.max(0, h.atkSpeedTimer - dt);
      if (h.stealthExitGrace > 0) h.stealthExitGrace = Math.max(0, h.stealthExitGrace - dt);
      if (h.stealthTimer > 0) {
        h.stealthTimer -= dt;
        if (h.stealthTimer <= 0) {
          h.stealthTimer = 0;
          h.stealthExitGrace = 4.0;
        }
      }

      // Brawler Siphon map decay
      const sKeys = Object.keys(h.siphonMap);
      for (let i = 0; i < sKeys.length; i++) {
        const k = sKeys[i];
        h.siphonMap[k].timer -= dt;
        if (h.siphonMap[k].timer <= 0) delete h.siphonMap[k];
      }

      // Panther Unseen LOS Check
      if (h.heroId === 'panther') {
        const seen = M.Vision.isSeenByEnemyTeam(h, state);
        h.isCurrentlyUnseen = !seen;
        if (!seen) {
          h.unseenLinger = hasTalent(state, 3, 'L') ? 2.7 : 1.2;
        } else {
          h.unseenLinger = Math.max(0, h.unseenLinger - dt);
        }
      }

      // Coyote R Supercharge Windup -> Piercing Bleed Detonation Shot!
      if (h.coyoteChargeTimer > 0) {
        h.facing = Math.atan2(input.worldY - h.y, input.worldX - h.x);
        h.coyoteChargeTimer -= dt;
        if (h.coyoteChargeTimer <= 0) {
          h.coyoteChargeTimer = 0;
          const a = h.facing;
          M.Audio.play('bleedPop');
          state.projectiles.push({
            id: uid(), owner: h, team: h.team, kind: 'heartseeker',
            x: h.x + Math.cos(a) * 26, y: h.y + Math.sin(a) * 26,
            vx: Math.cos(a) * 1180, vy: Math.sin(a) * 1180,
            radius: 14, maxDist: 640, traveled: 0,
            dmg: 140 + h.level * 22 + h.phys * 1.4,
            dmgType: 'physical', color: '#fb7185',
            pierce: true, hitSet: {}
          });
        }
      }

      // Bodyguard Q Windup Punch
      if (h.qWindupTimer > 0) {
        h.qWindupTimer -= dt;
        if (h.qWindupTimer <= 0) {
          M.Audio.play('punch');
          h.meleeSwingTimer = 0.22;
          h.meleeSwingAngle = h.qWindupAngle;
          const wallStun = hasTalent(state, 3, 'L');
          for (let i = 0; i < state.units.length; i++) {
            const u = state.units[i];
            if (u.dead || u.team === h.team) continue;
            if (u.kind === 'shooter' && !state.shooterEnabled) continue;
            const d = dist(h, u);
            if (d <= 145 + u.radius) {
              let diff = Math.atan2(u.y - h.y, u.x - h.x) - h.qWindupAngle;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              if (Math.abs(diff) <= Math.PI * 0.45) {
                dealDamage(state, h, u, 65 + h.level * 14 + h.phys * 1.1, 'physical');
                applyKnockback(u, Math.cos(h.qWindupAngle), Math.sin(h.qWindupAngle), 220, 0.24, wallStun, h);
              }
            }
          }
        }
      }

      // Scientist Q Spinning Saw (3s + final knockback)
      if (h.sawSpinTimer > 0) {
        h.sawSpinTimer -= dt;
        h.sawSpinTickAcc += dt;
        if (h.sawSpinTickAcc >= h.sawSpinInterval) {
          h.sawSpinTickAcc -= h.sawSpinInterval;
          M.Audio.play('saw');
          for (let i = 0; i < state.units.length; i++) {
            const u = state.units[i];
            if (u.dead || u.team === h.team) continue;
            if (u.kind === 'shooter' && !state.shooterEnabled) continue;
            if (dist(h, u) <= 142 + u.radius) {
              dealDamage(state, h, u, 36 + h.level * 8 + h.phys * 0.55, 'physical');
              addVivisectHit(state, h, u);
            }
          }
        }
        if (h.sawSpinTimer <= 0) {
          h.sawSpinTimer = 0;
          M.Audio.play('punch');
          spawnParticles(state, h.x, h.y, '#10b981', 16, 190);
          for (let i = 0; i < state.units.length; i++) {
            const u = state.units[i];
            if (u.dead || u.team === h.team) continue;
            if (u.kind === 'shooter' && !state.shooterEnabled) continue;
            if (dist(h, u) <= 155 + u.radius) {
              dealDamage(state, h, u, 42 + h.level * 8 + h.phys * 0.5, 'physical');
              addVivisectHit(state, h, u);
              applyKnockback(u, u.x - h.x, u.y - h.y, 175, 0.22, false, h);
            }
          }
        }
      }

      // Panther Q Slash & Gnash 3-hit flurry
      if (h.flurryRemaining > 0) {
        h.flurryAcc += dt;
        if (h.flurryAcc >= 0.13) {
          h.flurryAcc -= 0.13;
          h.flurryRemaining -= 1;
          const a = Math.atan2(input.worldY - h.y, input.worldX - h.x);
          h.facing = a;
          M.Audio.play('claw');
          h.meleeSwingTimer = 0.12;
          h.meleeSwingAngle = a;
          let hitAny = false;
          for (let i = 0; i < state.units.length; i++) {
            const u = state.units[i];
            if (u.dead || u.team === h.team) continue;
            if (u.kind === 'shooter' && !state.shooterEnabled) continue;
            if (dist(h, u) <= 118 + u.radius) {
              let dmg = 26 + h.level * 6 + h.phys * 0.55;
              if (hasTalent(state, 3, 'R') && (u.hp / u.maxHp) < 0.40) {
                dmg *= 1.30;
              }
              dealDamage(state, h, u, dmg, 'physical');
              procPredatorMark(state, h, u);
              hitAny = true;
            }
          }
          if (hitAny) {
            let heal = 18 + h.level * 4 + h.phys * 0.16;
            if (hasTalent(state, 3, 'R')) heal *= 1.35;
            healUnit(state, h, heal);
          }
        }
      }

      // Hero Movement / Dash
      if (h.dashTimer > 0) {
        const stepDt = Math.min(dt, h.dashTimer);
        h.x += h.dashVx * stepDt;
        h.y += h.dashVy * stepDt;
        h.dashTimer -= dt;
        const hitObstacle = resolveObstacleCollisions(state, h, h.airborneTimer > 0);
        h.airborneTimer = Math.max(0, h.airborneTimer - dt);

        // Brawler Dash Collision Check (Enemy, Wall, Tree, or Arena Ring!)
        if ((h.dashKind === 'brawlerFirstDash' || h.dashKind === 'brawlerSecondDash') && !h.brawlerEHitDone) {
          let hitEnemy = null;
          for (let i = 0; i < state.units.length; i++) {
            const u = state.units[i];
            if (u.dead || u.team === h.team) continue;
            if (u.kind === 'shooter' && !state.shooterEnabled) continue;
            if (dist(h, u) <= h.radius + u.radius + 10) {
              hitEnemy = u;
              break;
            }
          }
          if (hitEnemy || hitObstacle) {
            h.brawlerEHitDone = true;
            if (hitEnemy) {
              dealDamage(state, h, hitEnemy, 45 + h.level * 10 + h.phys * 0.7, 'physical');
            }
            if (h.dashKind === 'brawlerFirstDash') {
              h.dashTimer = 0;
              let sh = 95 + h.level * 18;
              if (hasTalent(state, 6, 'L')) sh *= 1.35;
              giveShield(h, sh, 3.5);
              h.brawlerERecastTimer = 3.0;
              M.Audio.play('punch');
              addFloatingText(state, h.x, h.y - 26, '2ND DASH READY!', '#fde047', 12);
            } else if (h.dashKind === 'brawlerSecondDash' && hitEnemy && hasTalent(state, 6, 'L')) {
              h.dashTimer = 0;
              M.Audio.play('punch');
              cannonBlastArea(state, h, h.x, h.y, 125, 55 + h.level * 11 + h.phys * 0.75);
            }
          }
        }

        // Landing impacts for airborne leaps
        if (h.dashTimer <= 0) {
          const kind = h.dashKind;
          h.dashKind = null;
          resolveObstacleCollisions(state, h, false);

          if (kind === 'bodyguardLeap') {
            M.Audio.play('punch');
            spawnParticles(state, h.x, h.y, '#eab308', 16, 180);
            const slowAmt = hasTalent(state, 6, 'L') ? 0.50 : 0.35;
            for (let i = 0; i < state.units.length; i++) {
              const u = state.units[i];
              if (u.dead) continue;
              if (u.team !== h.team) {
                if (u.kind === 'shooter' && !state.shooterEnabled) continue;
                if (dist(h, u) <= 145 + u.radius) {
                  dealDamage(state, h, u, 58 + h.level * 12 + h.phys * 0.85, 'physical');
                  applySlow(u, slowAmt, 2.0);
                }
              } else if (hasTalent(state, 6, 'R') && dist(h, u) <= 165 + u.radius) {
                giveShield(u, 85 + h.level * 16, 3.5);
                u.slowTimer = 0;
                u.slowPct = 0;
              }
            }
          } else if (kind === 'cannonRocketJump' && hasTalent(state, 6, 'L')) {
            M.Audio.play('cannon');
            cannonBlastArea(state, h, h.x, h.y, 120, h.phys * 0.85 + 35);
          } else if (kind === 'pantherLeap' || kind === 'pantherStealthLeap') {
            M.Audio.play('claw');
            spawnParticles(state, h.x, h.y, '#2dd4bf', 12, 150);
            for (let i = 0; i < state.units.length; i++) {
              const u = state.units[i];
              if (u.dead || u.team === h.team) continue;
              if (u.kind === 'shooter' && !state.shooterEnabled) continue;
              if (dist(h, u) <= 125 + u.radius) {
                dealDamage(state, h, u, 36 + h.level * 8 + h.fant * 0.7, 'fantasy');
                u.predatorMarks = 3;
                u.markTimer = 5.0;
                if (kind === 'pantherStealthLeap' && hasTalent(state, 10, 'R')) {
                  applySlow(u, 0.40, 1.5);
                  u.silenceTimer = Math.max(u.silenceTimer, 0.8);
                  addFloatingText(state, u.x, u.y - 28, 'SILENCED!', '#2dd4bf', 12);
                }
              }
            }
          }
        }
      } else if (h.stunTimer <= 0 && h.sleepTimer <= 0) {
        const mvLen = Math.hypot(input.moveX, input.moveY);
        const spd = getEffectiveMoveSpeed(state, h);
        if (mvLen > 0.05) {
          h.vx = (input.moveX / mvLen) * spd;
          h.vy = (input.moveY / mvLen) * spd;
          h.x += h.vx * dt;
          h.y += h.vy * dt;
          if (!input.mouseDown) {
            h.facing = Math.atan2(input.worldY - h.y, input.worldX - h.x);
          }
        } else {
          h.vx = 0;
          h.vy = 0;
          h.facing = Math.atan2(input.worldY - h.y, input.worldX - h.x);
        }
        resolveObstacleCollisions(state, h, false);
      }

      if (input.mouseDown) {
        tryBasicAttack(state, input.worldX, input.worldY);
      }
    }

    // Update All Units (Status Effects, Bleeds, Knockbacks, Turret Pet, Shooter Bot)
    for (let i = state.units.length - 1; i >= 0; i--) {
      const u = state.units[i];
      if (u.dead) {
        if (u.kind === 'creep') state.units.splice(i, 1);
        continue;
      }

      if (u.koResetTimer > 0) {
        u.koResetTimer -= dt;
        if (u.koResetTimer <= 0) {
          u.hp = u.maxHp;
        }
      }

      if (u.shieldTimer > 0) {
        u.shieldTimer -= dt;
        if (u.shieldTimer <= 0) {
          u.shield = 0;
          u.rShieldActive = false;
        }
      }
      u.stunTimer = Math.max(0, u.stunTimer - dt);
      u.silenceTimer = Math.max(0, u.silenceTimer - dt);
      u.sleepGrace = Math.max(0, u.sleepGrace - dt);
      u.sleepImmune = Math.max(0, u.sleepImmune - dt);
      u.sleepTimer = Math.max(0, u.sleepTimer - dt);
      u.tauntTimer = Math.max(0, u.tauntTimer - dt);
      u.slowTimer = Math.max(0, u.slowTimer - dt);
      u.siphonedTimer = Math.max(0, u.siphonedTimer - dt);
      if (u.markTimer > 0) {
        u.markTimer -= dt;
        if (u.markTimer <= 0) u.predatorMarks = 0;
      }
      if (u.vivisectTimer > 0) {
        u.vivisectTimer -= dt;
        if (u.vivisectTimer <= 0) u.vivisectHits = 0;
      }

      // Bleed DoT ticks
      if (u.bleedStacks > 0 && u.bleedTimer > 0) {
        u.bleedTimer -= dt;
        u.bleedTickAcc += dt;
        if (u.bleedTickAcc >= 0.5) {
          u.bleedTickAcc -= 0.5;
          const src = u.bleedSource || h;
          const perTick = (7 + (src ? src.level * 1.6 + src.phys * 0.14 : 10)) * u.bleedStacks;
          dealDamage(state, src, u, perTick, 'physical', { isDot: true });
        }
        if (u.bleedTimer <= 0) u.bleedStacks = 0;
      }

      // Knockbacks + Wall-Stun Check
      if (u.knockbackTimer > 0) {
        u.x += u.knockbackVx * dt;
        u.y += u.knockbackVy * dt;
        u.knockbackTimer -= dt;
        const hitWall = resolveObstacleCollisions(state, u, false);
        if (hitWall && u.knockbackWallStun) {
          u.knockbackWallStun = false;
          u.knockbackTimer = 0;
          u.stunTimer = Math.max(u.stunTimer, 1.0);
          dealDamage(state, u.knockbackSource, u, 48 + (h ? h.level * 9 : 20), 'physical');
          addFloatingText(state, u.x, u.y - 30, 'WALL STUN!', '#fde047', 14);
        }
      } else if (u !== h) {
        // Taunt movement pull on dummies
        if (u.tauntTimer > 0 && u.tauntSource && !u.tauntSource.dead && u.stunTimer <= 0 && u.sleepTimer <= 0) {
          const d = dist(u, u.tauntSource);
          if (d > u.radius + u.tauntSource.radius + 14) {
            const ang = Math.atan2(u.tauntSource.y - u.y, u.tauntSource.x - u.x);
            u.facing = ang;
            u.x += Math.cos(ang) * 125 * dt;
            u.y += Math.sin(ang) * 125 * dt;
            resolveObstacleCollisions(state, u, false);
          }
        }
      }

      // Anchored Cannon Turret AI
      if (u.kind === 'turretPet' && u.stunTimer <= 0 && u.sleepTimer <= 0) {
        u.overchargeTimer = Math.max(0, u.overchargeTimer - dt);
        u.fireCd -= dt;
        if (u.fireCd <= 0) {
          const tRange = 460 * (hasTalent(state, 10, 'R') ? 1.30 : 1.0);
          let best = null;
          let bestD = tRange;
          for (let j = 0; j < state.units.length; j++) {
            const e = state.units[j];
            if (e.dead || e.team === u.team) continue;
            if (e.kind === 'shooter' && !state.shooterEnabled) continue;
            const d = dist(u, e);
            if (d <= bestD) { bestD = d; best = e; }
          }
          if (best) {
            const ang = Math.atan2(best.y - u.y, best.x - u.x);
            u.facing = ang;
            let cd = 1.05;
            if (hasTalent(state, 10, 'R')) cd /= 1.30;
            if (u.overchargeTimer > 0) cd /= 1.25;
            u.fireCd = cd;
            M.Audio.play('cannon');
            state.projectiles.push({
              id: uid(), owner: u.owner, team: u.team, kind: 'cannonShell',
              x: u.x + Math.cos(ang) * 20, y: u.y + Math.sin(ang) * 20,
              vx: Math.cos(ang) * 650, vy: Math.sin(ang) * 650,
              radius: 9, maxDist: tRange + 40, traveled: 0,
              dmg: (u.owner ? u.owner.phys * 0.72 + 18 : 45),
              dmgType: 'physical', color: '#fb923c'
            });
          } else {
            u.fireCd = 0.25;
          }
        }
      }

      // Enemy Ranged Shooter Dummy AI (tests Arena Projectile Barrier, Taunt, Sleep, Bodyguard!)
      if (u.kind === 'shooter' && state.shooterEnabled && u.stunTimer <= 0 && u.sleepTimer <= 0 && u.silenceTimer <= 0) {
        u.shooterCd -= dt;
        if (u.shooterCd <= 0) {
          u.shooterCd = 1.25;
          let target = h;
          if (u.tauntTimer > 0 && u.tauntSource) {
            target = u.tauntSource;
          } else if (state.turretUnit && !state.turretUnit.dead && dist(u, state.turretUnit) < dist(u, h)) {
            target = state.turretUnit;
          }
          if (target && !target.dead && target.stealthTimer <= 0 && dist(u, target) <= 780) {
            const ang = Math.atan2(target.y - u.y, target.x - u.x);
            u.facing = ang;
            state.projectiles.push({
              id: uid(), owner: u, team: u.team, kind: 'enemyShot',
              x: u.x + Math.cos(ang) * 24, y: u.y + Math.sin(ang) * 24,
              vx: Math.cos(ang) * 470, vy: Math.sin(ang) * 470,
              radius: 8, maxDist: 820, traveled: 0,
              dmg: 48, dmgType: 'fantasy', color: '#f43f5e'
            });
          }
        }
      }
    }

    // Soft Unit-to-Unit Separation
    for (let i = 0; i < state.units.length; i++) {
      const a = state.units[i];
      if (a.dead || a.airborneTimer > 0) continue;
      for (let j = i + 1; j < state.units.length; j++) {
        const b = state.units[j];
        if (b.dead || b.airborneTimer > 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const minD = a.radius + b.radius;
        if (d < minD) {
          const push = (minD - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          resolveObstacleCollisions(state, a, false);
          resolveObstacleCollisions(state, b, false);
        }
      }
    }

    // Update Arena Ring Duration
    if (state.arenaRing) {
      state.arenaRing.life -= dt;
      if (state.arenaRing.life <= 0) state.arenaRing = null;
    }

    // Update Boomerang Sawblade (Scientist R)
    if (state.boomerangSaw) {
      const saw = state.boomerangSaw;
      const prevX = saw.x;
      const prevY = saw.y;

      if (saw.phase === 'out') {
        const step = 820 * dt;
        saw.x += saw.dirX * step;
        saw.y += saw.dirY * step;
        saw.traveled += step;

        // Arena barrier bounces saw into return phase
        if (state.arenaRing && (Math.hypot(prevX - state.arenaRing.x, prevY - state.arenaRing.y) <= state.arenaRing.radius) !==
            (Math.hypot(saw.x - state.arenaRing.x, saw.y - state.arenaRing.y) <= state.arenaRing.radius)) {
          M.Audio.play('block');
          saw.phase = 'return';
        }

        for (let i = 0; i < state.units.length; i++) {
          const u = state.units[i];
          if (u.dead || u.team === saw.team || saw.outHits[u.id]) continue;
          if (u.kind === 'shooter' && !state.shooterEnabled) continue;
          if (Math.hypot(u.x - saw.x, u.y - saw.y) <= saw.radius + u.radius) {
            saw.outHits[u.id] = true;
            dealDamage(state, saw.owner, u, 70 + saw.owner.level * 14 + saw.owner.phys * 0.85, 'physical');
            applySlow(u, 0.35, 2.0);
            addVivisectHit(state, saw.owner, u);
          }
        }
        if (saw.traveled >= saw.maxDist) {
          saw.phase = saw.hoverTimer > 0 ? 'hover' : 'return';
        }
      } else if (saw.phase === 'hover') {
        saw.hoverTimer -= dt;
        saw.hoverAcc += dt;
        if (saw.hoverAcc >= 0.25) {
          saw.hoverAcc -= 0.25;
          M.Audio.play('saw');
          for (let i = 0; i < state.units.length; i++) {
            const u = state.units[i];
            if (u.dead || u.team === saw.team) continue;
            if (u.kind === 'shooter' && !state.shooterEnabled) continue;
            if (Math.hypot(u.x - saw.x, u.y - saw.y) <= saw.radius + 14 + u.radius) {
              dealDamage(state, saw.owner, u, 28 + saw.owner.level * 5 + saw.owner.phys * 0.3, 'physical');
              addVivisectHit(state, saw.owner, u);
            }
          }
        }
        if (saw.hoverTimer <= 0) saw.phase = 'return';
      } else if (saw.phase === 'return') {
        const dx = saw.owner.x - saw.x;
        const dy = saw.owner.y - saw.y;
        const d = Math.hypot(dx, dy);
        if (d <= 36) {
          if (saw.heroReturnHits > 0 && hasTalent(state, 10, 'R')) {
            const sh = saw.heroReturnHits * (75 + saw.owner.level * 12);
            giveShield(saw.owner, sh, 4.0);
            const refund = saw.owner.def.abilities.R.cd * (0.15 * saw.heroReturnHits);
            saw.owner.cdR = Math.max(0, saw.owner.cdR - refund);
            addFloatingText(state, saw.owner.x, saw.owner.y - 32, '-' + Math.round(saw.heroReturnHits * 15) + '% R CD!', '#fde047', 14);
          }
          state.boomerangSaw = null;
        } else {
          const step = 920 * dt;
          saw.x += (dx / d) * step;
          saw.y += (dy / d) * step;
          for (let i = 0; i < state.units.length; i++) {
            const u = state.units[i];
            if (u.dead || u.team === saw.team || saw.retHits[u.id]) continue;
            if (u.kind === 'shooter' && !state.shooterEnabled) continue;
            if (Math.hypot(u.x - saw.x, u.y - saw.y) <= saw.radius + u.radius) {
              saw.retHits[u.id] = true;
              if (u.isHero) saw.heroReturnHits += 1;
              dealDamage(state, saw.owner, u, 80 + saw.owner.level * 15 + saw.owner.phys * 0.9, 'physical');
              applyKnockback(u, saw.owner.x - u.x, saw.owner.y - u.y, 195, 0.24, false, saw.owner);
              addVivisectHit(state, saw.owner, u);
            }
          }
        }
      }
    }

    // Update Projectiles
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      const prevX = p.x;
      const prevY = p.y;
      const stepX = p.vx * dt;
      const stepY = p.vy * dt;
      p.x += stepX;
      p.y += stepY;
      p.traveled += Math.hypot(stepX, stepY);

      // Brawler R Arena Two-Way Projectile Interception!
      if (state.arenaRing) {
        const ar = state.arenaRing;
        const wasIn = Math.hypot(prevX - ar.x, prevY - ar.y) <= ar.radius;
        const nowIn = Math.hypot(p.x - ar.x, p.y - ar.y) <= ar.radius;
        if (wasIn !== nowIn) {
          M.Audio.play('block');
          spawnParticles(state, p.x, p.y, '#fde047', 8, 120);
          addFloatingText(state, p.x, p.y - 12, 'BLOCKED', '#fde047', 11);
          state.projectiles.splice(i, 1);
          continue;
        }
      }

      // Wall collision for projectiles
      let hitWall = false;
      for (let w = 0; w < M.WALLS.length; w++) {
        const wl = M.WALLS[w];
        if (p.x >= wl.x && p.x <= wl.x + wl.w && p.y >= wl.y && p.y <= wl.y + wl.h) {
          hitWall = true;
          break;
        }
      }
      if (hitWall || p.traveled >= p.maxDist) {
        state.projectiles.splice(i, 1);
        continue;
      }

      // Unit Hit Detection
      let removeProj = false;
      for (let j = 0; j < state.units.length; j++) {
        const u = state.units[j];
        if (u.dead || u.team === p.team) continue;
        if (u.kind === 'shooter' && !state.shooterEnabled) continue;
        if (p.hitSet && p.hitSet[u.id]) continue;

        if (Math.hypot(u.x - p.x, u.y - p.y) <= p.radius + u.radius) {
          if (p.hitSet) p.hitSet[u.id] = true;

          if (p.kind === 'cannonShell') {
            // Cannon Passive AoE Splash!
            const splashR = 85 * (hasTalent(state, 3, 'R') ? 1.30 : 1.0);
            const slowShell = hasTalent(state, 3, 'R');
            spawnParticles(state, p.x, p.y, '#fb923c', 10, 140);
            for (let k = 0; k < state.units.length; k++) {
              const v = state.units[k];
              if (v.dead || v.team === p.team) continue;
              if (v.kind === 'shooter' && !state.shooterEnabled) continue;
              const sd = Math.hypot(v.x - p.x, v.y - p.y);
              if (sd <= splashR + v.radius) {
                const dmg = v === u ? p.dmg : p.dmg * 0.48;
                dealDamage(state, p.owner, v, dmg, 'physical');
                if (slowShell) applySlow(v, 0.15, 1.2);
              }
            }
            removeProj = true;
            break;
          } else if (p.kind === 'coyoteBolt') {
            dealDamage(state, p.owner, u, p.dmg, 'physical');
            applyBleed(state, p.owner, u, 1);
            spawnParticles(state, u.x, u.y, '#fb923c', 5, 90);
            if (!p.pierce) { removeProj = true; break; }
          } else if (p.kind === 'heartseeker') {
            const stacks = u.bleedStacks;
            let burst = 0;
            if (stacks > 0) {
              burst = stacks * (38 + p.owner.level * 7 + p.owner.phys * 0.55);
              u.bleedStacks = 0;
              u.bleedTimer = 0;
              addFloatingText(state, u.x, u.y - 30, 'BLEED POP x' + stacks + '!', '#fbbf24', 14);
              spawnParticles(state, u.x, u.y, '#ef4444', 16, 200);
              if (stacks >= 4 && u.isHero && hasTalent(state, 10, 'L')) {
                p.owner.cdR *= 0.5;
                addFloatingText(state, p.owner.x, p.owner.y - 30, '-50% R CD!', '#fde047', 13);
              }
            }
            dealDamage(state, p.owner, u, p.dmg + burst, 'physical', { bigText: true });
          } else if (p.kind === 'superball') {
            dealDamage(state, p.owner, u, p.dmg, 'physical', { bigText: true });
            u.stunTimer = Math.max(u.stunTimer, 1.4);
            addFloatingText(state, u.x, u.y - 28, 'KNOCKDOWN!', '#fde047', 13);
            spawnParticles(state, u.x, u.y, '#fde047', 14, 175);
            if (!p.pierce) { removeProj = true; break; }
          } else {
            dealDamage(state, p.owner, u, p.dmg, p.dmgType);
            spawnParticles(state, p.x, p.y, p.color, 5, 90);
            removeProj = true;
            break;
          }
        }
      }
      if (removeProj) state.projectiles.splice(i, 1);
    }

    // Update Ground Zones (Sorceress Pillars, Monolith, Coyote Grenade, Fairy Bubble & Dust)
    for (let i = state.zones.length - 1; i >= 0; i--) {
      const z = state.zones[i];

      if (z.kind === 'sorcPillar') {
        if (z.delay > 0) {
          z.delay -= dt;
          if (z.delay <= 0) {
            M.Audio.play('pillar');
            spawnParticles(state, z.x, z.y, '#38bdf8', 12, 150);
            let hitHero = false;
            let hitAny = false;
            const insideUlt = state.zones.some(function (oz) {
              return oz.kind === 'sorcMonolith' && Math.hypot(z.x - oz.x, z.y - oz.y) <= oz.radius;
            });
            for (let j = 0; j < state.units.length; j++) {
              const u = state.units[j];
              if (u.dead || u.team === z.team) continue;
              if (u.kind === 'shooter' && !state.shooterEnabled) continue;
              if (Math.hypot(u.x - z.x, u.y - z.y) <= z.radius + u.radius) {
                hitAny = true;
                if (u.isHero) hitHero = true;
                let dmg = 55 + z.owner.level * 12 + z.owner.fant * 0.92;
                if (insideUlt && hasTalent(state, 10, 'R')) dmg *= 1.20;
                dealDamage(state, z.owner, u, dmg, 'fantasy');
                if (z.appliesSlow) applySlow(u, 0.25, 1.5);
              }
            }
            if (z.grantsTempo && hitAny) {
              const heroCap = hasTalent(state, 10, 'R') ? 4 : 3;
              const cap = hitHero ? heroCap : 2;
              if (z.owner.qTempoStacks < cap) {
                z.owner.qTempoStacks = Math.min(cap, z.owner.qTempoStacks + 1);
              }
              z.owner.qTempoTimer = 5.0;
            }
          }
        } else {
          z.life -= dt;
          if (z.life <= 0) state.zones.splice(i, 1);
        }
      } else if (z.kind === 'sorcMonolith') {
        z.life -= dt;
        const progress = clamp(1 - z.life / z.maxLife, 0, 1);
        z.radius = z.startRadius + (z.maxRadius - z.startRadius) * progress;
        z.tickAcc += dt;

        if (progress >= 0.92 && !z.pulledAtMax && hasTalent(state, 10, 'L')) {
          z.pulledAtMax = true;
          for (let j = 0; j < state.units.length; j++) {
            const u = state.units[j];
            if (!u.dead && u.team !== z.team && Math.hypot(u.x - z.x, u.y - z.y) <= z.radius + u.radius) {
              applyKnockback(u, z.x - u.x, z.y - u.y, 115, 0.22, false, z.owner);
            }
          }
        }

        if (z.tickAcc >= 0.5) {
          z.tickAcc -= 0.5;
          for (let j = 0; j < state.units.length; j++) {
            const u = state.units[j];
            if (u.dead || u.team === z.team) continue;
            if (u.kind === 'shooter' && !state.shooterEnabled) continue;
            if (Math.hypot(u.x - z.x, u.y - z.y) <= z.radius + u.radius) {
              dealDamage(state, z.owner, u, 28 + z.owner.level * 6 + z.owner.fant * 0.38, 'fantasy', { isDot: true });
              applySlow(u, 0.35, 0.7);
            }
          }
        }
        if (z.life <= 0) state.zones.splice(i, 1);
      } else if (z.kind === 'coyoteGrenade') {
        z.delay -= dt;
        if (z.delay <= 0) {
          M.Audio.play('bleedPop');
          spawnParticles(state, z.x, z.y, '#fb923c', 16, 175);
          const hasSlow = hasTalent(state, 6, 'L');
          for (let j = 0; j < state.units.length; j++) {
            const u = state.units[j];
            if (u.dead || u.team === z.team) continue;
            if (u.kind === 'shooter' && !state.shooterEnabled) continue;
            const d = Math.hypot(u.x - z.x, u.y - z.y);
            if (d <= z.radius + u.radius) {
              const bullseye = d <= z.bullseyeRadius + u.radius * 0.55;
              const baseDmg = 52 + z.owner.level * 10 + z.owner.phys * 0.75;
              dealDamage(state, z.owner, u, bullseye ? baseDmg * 2 : baseDmg, 'physical', { bigText: bullseye });
              applyBleed(state, z.owner, u, bullseye ? 4 : 2);
              if (hasSlow) applySlow(u, bullseye ? 0.40 : 0.20, 2.0);
              if (bullseye) {
                addFloatingText(state, u.x, u.y - 30, 'BULLSEYE! 2x', '#fde047', 14);
              }
            }
          }
          state.zones.splice(i, 1);
        }
      } else if (z.kind === 'fairyBubble') {
        z.delay -= dt;
        if (z.delay <= 0) {
          M.Audio.play('bubble');
          spawnParticles(state, z.x, z.y, '#6ee7b7', 14, 150);
          spawnFairyDust(state, z.owner, z.x, z.y, z.radius);
          for (let j = 0; j < state.units.length; j++) {
            const u = state.units[j];
            if (u.dead) continue;
            if (Math.hypot(u.x - z.x, u.y - z.y) <= z.radius + u.radius) {
              if (u.team === z.team) {
                const sh = (72 + z.owner.level * 14 + z.owner.fant * 0.7) * z.shieldMult;
                giveShield(u, sh, 3.5);
              } else if (u.kind !== 'shooter' || state.shooterEnabled) {
                dealDamage(state, z.owner, u, 44 + z.owner.level * 9 + z.owner.fant * 0.65, 'fantasy');
                applySlow(u, 0.32, 2.0);
              }
            }
          }
          state.zones.splice(i, 1);
        }
      } else if (z.kind === 'fairyDust') {
        z.life -= dt;
        z.tickAcc += dt;
        const isDreamdust = z.owner && z.owner.fairyUltTimer > 0;

        if (isDreamdust) {
          for (let j = 0; j < state.units.length; j++) {
            const u = state.units[j];
            if (u.dead || u.team === z.team || u.sleepTimer > 0 || u.sleepImmune > 0) continue;
            if (u.kind === 'shooter' && !state.shooterEnabled) continue;
            if (Math.hypot(u.x - z.x, u.y - z.y) <= z.radius + u.radius) {
              u.drowsyTimer += dt;
              if (u.drowsyTimer >= 0.45) {
                u.drowsyTimer = 0;
                u.sleepTimer = 2.1;
                u.sleepGrace = 0.25;
                addFloatingText(state, u.x, u.y - 28, 'ASLEEP Zzz', '#7dd3fc', 13);
              }
            }
          }
        }

        if (z.tickAcc >= 0.5) {
          z.tickAcc -= 0.5;
          let healAmt = 14 + z.owner.level * 3 + z.owner.fant * 0.25;
          if (hasTalent(state, 3, 'R')) healAmt *= 1.30;
          for (let j = 0; j < state.units.length; j++) {
            const u = state.units[j];
            if (!u.dead && u.team === z.team && Math.hypot(u.x - z.x, u.y - z.y) <= z.radius + u.radius) {
              healUnit(state, u, healAmt);
            }
          }
        }
        if (z.life <= 0) state.zones.splice(i, 1);
      }
    }

    // Update Wards
    for (let i = state.wards.length - 1; i >= 0; i--) {
      state.wards[i].life -= dt;
      if (state.wards[i].life <= 0) state.wards.splice(i, 1);
    }

    // Floating Texts & Particles
    for (let i = state.texts.length - 1; i >= 0; i--) {
      const t = state.texts[i];
      t.y += t.vy * dt;
      t.life -= dt;
      if (t.life <= 0) state.texts.splice(i, 1);
    }
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pt = state.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
  }

  M.Combat = {
    createSandboxState: createSandboxState,
    selectHero: selectHero,
    recalcHeroStats: recalcHeroStats,
    getEffectiveMoveSpeed: getEffectiveMoveSpeed,
    getEffectiveArmor: getEffectiveArmor,
    getEffectiveFResist: getEffectiveFResist,
    castAbility: castAbility,
    placePlayerWard: placePlayerWard,
    startRecall: startRecall,
    spawnCreepPack: spawnCreepPack,
    spawnDefaultDummies: spawnDefaultDummies,
    dealDamage: dealDamage,
    update: update
  };
})(window.MOBA);
