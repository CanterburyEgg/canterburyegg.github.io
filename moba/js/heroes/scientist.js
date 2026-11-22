// Saw Scientist: Jungle • Reckless mad-surgeon brawler. See DESIGN_RULES.md.
// First playable pass: real model + clips + saw gun prop, stand-in versions of the designed kit
// (stab LMB, Rev the Saw toggle channel, Adrenal Injection, Boomerang Blade out-and-back with a pull).
// Saw Fuel (spec.resource) replaces mana: the player's lives in hero.mp (so the HUD bar / costs work), a bot's in b.fuel.
// Talents: TALENTS_PLAN.md (all six in this file).
(function () {
'use strict';
const H = (window.MOBA_HEROES = window.MOBA_HEROES || {});

let sawGun = null;          // world-space prop following the right hand
let gunBlade = null;        // { holder, spin } code-built blade mounted on the gun's hub
let sawGunLoading = false;
let blade = null;           // the player's R boomerang blade { mesh, out, t, sx, sz, ang, hitOut:Set, hitBack:Set, dmg }
const botBlades = [];       // bots' blades (same shape + owner); a bot's own blade is also on its unit as scBlade
let sawTemplate = null, sawTemplateLoading = false; // saw gun prop for bots (cloned per bot)
let sawTick = 0;
const sparks = [];
let SPARK_GEO = null, SPARK_MAT = null;
let _hv = null;

// ---- Saw Fuel ----
// Fills when he takes damage (1 fuel per 1% of max HP lost, his own injection included) and refills slowly while the
// saw is off; the saw drains while it runs (no start cost); R costs 40.
const FUEL = { max: 100, drain: 9, refill: 4, perHpPct: 1.0 };
// Talents
const C = window.MOBA_COMBAT;
const tal = (u, tier) => C.talentOf(u, tier);
const OVERCLOCK_DRAIN = 1.3;    // 3L: fuel drain while the saw runs (and no saw slow)
const HANG_TIME = 0.5;          // 3R: hover at the far point
const HANG_SLOW = { dur: 1.5, pct: 0.35 };
const FRESH_FUEL = 2;           // 7L: fuel per saw hit on a hero
const SHOCK = { r: 4.0, dur: 1.5, pct: 0.30 }; // 7R: injection pulse
const RAMP = { step: 0.08, max: 0.60, gap: 0.6 }; // 10L: +8% per tick on the same target (forgotten after a missed tick)
const RETHROW = { window: 3.0, dmg: 0.75 };      // 10R
const drainOf = (u) => FUEL.drain * (tal(u, 3) === 'L' ? OVERCLOCK_DRAIN : 1);
const sawSlowOf = (u) => (u.sawOn && tal(u, 3) !== 'L' ? 0.75 : 1);
const fuelOf = (u) => (u.fuel === undefined ? FUEL.max : u.fuel);
function addFuel(h, amt) { h.mp = Math.min(h.maxMp || FUEL.max, (h.mp || 0) + amt); }
// damage taken since last frame (heals and respawns don't count)
function hpLost(u) {
  const lost = u._fuelHp !== undefined ? Math.max(0, u._fuelHp - u.hp) : 0;
  u._fuelHp = u.hp;
  return lost;
}
// player: fuel lives in hero.mp
function fuelTick(h, dt) {
  const lost = hpLost(h);
  if (lost > 0) addFuel(h, (lost / Math.max(1, h.maxHp)) * 100 * FUEL.perHpPct);
  if (wtfMode) return;
  if (h.sawOn) h.mp = Math.max(0, (h.mp || 0) - drainOf(h) * dt);
  else addFuel(h, FUEL.refill * dt);
}
// bots: fuel lives in b.fuel (bots have no mana)
function botFuelTick(u, dt) {
  if (u.respawnTimer > 0) { u.fuel = FUEL.max; u._fuelHp = undefined; return; }
  let f = fuelOf(u);
  const lost = hpLost(u);
  if (lost > 0) f += (lost / Math.max(1, u.maxHp)) * 100 * FUEL.perHpPct;
  f += (u.sawOn ? -drainOf(u) : FUEL.refill) * dt;
  u.fuel = Math.max(0, Math.min(FUEL.max, f));
}
function refuel(u, amt) {
  if (u === hero) addFuel(hero, amt);
  else u.fuel = Math.min(FUEL.max, fuelOf(u) + amt);
}

// 7L Fresh Fuel + 10L Butcher's Ramp read the saw's hits (saw ticks carry the saw's castId)
const isSawHit = (e) => !!e.attacker && !!e.attacker.sawOn && !!e.info.castId && e.info.castId === e.attacker.sawCastId;
C.on('hit', (e) => {
  if (!isSawHit(e)) return;
  const a = e.attacker;
  if (tal(a, 7) === 'L' && C.isHero(e.target)) refuel(a, FRESH_FUEL);
  if (tal(a, 10) === 'L') {
    const m = a.scRamp || (a.scRamp = new Map());
    const r = m.get(e.target);
    const fresh = !r || KitFx.time - r.t > RAMP.gap;
    m.set(e.target, { n: fresh ? 1 : r.n + 1, t: KitFx.time });
  }
});
// the ramp bonus for the next tick on a target (ticks so far on it x 8%, max 60%)
function rampOf(a, target) {
  const r = a.scRamp && a.scRamp.get(target);
  if (!r || KitFx.time - r.t > RAMP.gap) return 0;
  return Math.min(RAMP.max, r.n * RAMP.step);
}
C.damageMults.push((info, target, attacker) => {
  if (!attacker || !attacker.sawOn || !info || !info.castId || info.castId !== attacker.sawCastId || tal(attacker, 10) !== 'L') return 1;
  return 1 + rampOf(attacker, target);
});

// 7R Shock Dose: the injection pulse (any caster)
function shockPulse(actor) {
  const u = actor.unit;
  KitFx.hitArea(u.x, u.z, SHOCK.r, 0, { slowDur: SHOCK.dur, slowPct: SHOCK.pct, color: '#4ade80', by: actor });
  spawnShockRing(u.x, u.z, 0x86efac, 0.3, SHOCK.r, 0.3);
}

// R Boomerang Blade throw for any caster (second = the 10R free re-throw at 75% damage)
function makeThrow(actor, ctx, second) {
  const u = actor.unit;
  const lvl = (ctx.pProg && ctx.pProg.level) || 1;
  const mesh = makeBladeMesh();
  mesh.visible = false;
  scene.add(mesh);
  if (second) spawnFloat(u.x, 2.7, u.z, 'SECOND THROW!', '#4ade80');
  u.scRethrowUntil = 0;
  return {
    delay: 0.24, // release frame of the throw (clip 0.93s)
    mesh, out: true, t: 0, sx: u.x, sz: u.z, ang: u.facing, range: 11, spd: 16,
    hitOut: new Set(), hitHover: new Set(), hitBack: new Set(),
    dmg: Math.round(H.scientist.dmg.blade(ctx.st, lvl, KitFx.rUlt(lvl)) * (second ? RETHROW.dmg : 1)),
    castId: KitFx.castId(),
    hang: KitFx.tal(ctx, 3, 'R') ? HANG_TIME : 0,             // 3R Hang Time
    canRethrow: !second && KitFx.tal(ctx, 10, 'R'),           // 10R Second Throw (not after the second one)
    second: !!second
  };
}
// the blade came back: open the 10R re-throw window
function bladeBack(u, b) {
  if (!b.canRethrow) return;
  u.scRethrowUntil = KitFx.time + RETHROW.window;
  spawnFloat(u.x, 2.7, u.z, 'SECOND THROW READY', '#4ade80');
}

function makeBladeMesh() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0xc8cdd2, metalness: 0.8, roughness: 0.3 }));
  g.add(disc);
  for (let i = 0; i < 12; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), disc.material);
    const a = (i / 12) * Math.PI * 2;
    tooth.position.set(Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46);
    tooth.rotation.z = Math.PI / 2;
    tooth.rotation.y = -a;
    g.add(tooth);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 24), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}

H.scientist = {
  id: 'scientist',
  roster: { order: 7, emoji: '🧪', short: 'Scientist' },
  bundle: { label: 'Saw Scientist', src: 'assets/scientist/scientist_bundle.js', globalKey: 'SCIENTIST_MIXAMO', pStart: 65, pEnd: 75 },
  bundleClips: { idle: 'idleFbxB64', run: 'runFbxB64', crawl: 'crawlFbxB64', punch: 'punchFbxB64', kick: 'kickFbxB64', slide: 'slideFbxB64' },
  moveSpeed: 6.1,
  hudSpeed: 336,
  pillLabels: { punch: 'Stab', kick: 'Drink', dash: 'Throw', dashReady: () => !!actions.slide },

  // All of the Scientist's damage numbers in one place. The stab is Attack damage; the saw and the boomerang blade are
  // Ability damage.
  dmg: {
    stab: (st) => Math.round(st.attack),
    sawTick: (st, lvl, rQE) => Math.round([44, 58, 72][rQE] + 7 * ((lvl || 1) - 1) + st.ability * 0.18), // every 0.35s
    blade: (st, lvl, rUlt) => Math.round([150, 240, 330][rUlt] + 6 * ((lvl || 1) - 1) + st.ability * 0.8) // each pass
  },

  spec: {
    id: 'scientist',
    name: 'Saw Scientist',
    role: 'Jungle • Reckless Saw Brawler',
    glyph: 'W',
    color: '#10b981',
    height: 1.9,
    baseHp: 1560, hpGrow: 128,
    baseMp: 310, mpGrow: 26, mpRegen: 5.0,
    // Stat model (DESIGN_RULES §2): Ability-leaning diver; the saw is his damage (~136 / 242 / 474 dps, 85% bruiser budget)
    baseAttack: 52, attackGrow: 6.0,
    baseAbility: 40, abilityGrow: 7.0,
    baseResist: 23, resistGrow: 2.8,
    asGrow: 0.03,
    baseSpd: 6.1,
    atkCd: 0.9,
    mpCosts: { Q: 0, E: 0, R: 40 }, // costs in fuel (the saw has no start cost; it drains while running)
    // Saw Fuel replaces mana (DESIGN_RULES §3): see FUEL below for how it fills and drains
    resource: { name: 'FUEL', max: 100, colors: ['#c2410c', '#fb923c'] }
  },

  // TALENTS_PLAN.md: L = Butcher, R = Wrangler. All six live in this file.
  talents: {
    3: {
      L: { id: '3L', name: 'Overclock', desc: 'The saw no longer slows you while it runs, but drains 30% more fuel.' },
      R: { id: '3R', name: 'Hang Time', desc: 'The Boomerang Blade hovers at its farthest point for 0.5s before coming back, slowing anyone it touches.' }
    },
    7: {
      L: { id: '7L', name: 'Fresh Fuel', desc: 'Each saw hit on an enemy hero refunds 2 fuel.' },
      R: { id: '7R', name: 'Shock Dose', desc: 'Adrenal Injection releases a pulse that slows enemies within 4m by 30% for 1.5s.' }
    },
    10: {
      L: { id: '10L', name: "Butcher's Ramp", desc: 'Each saw tick on the same target deals 8% more, up to +60%. Resets when the saw stops hitting them.' },
      R: { id: '10R', name: 'Second Throw', desc: 'After the Boomerang Blade returns, throw it once more within 3s for free. The second throw deals 75% damage.' }
    }
  },

  ui: {
    height: 1.9,
    modelLabel: 'Saw Scientist (Mixamo Rigged)',
    glyph: 'W',
    color: '#10b981',
    name: 'Saw Scientist (3D)',
    role: 'Jungle • Reckless Saw Brawler',
    passive: 'Saw Fuel',
    lmb: 'Surgical Strike',
    q: 'Rev the Saw',
    e: 'Adrenal Injection',
    r: 'Boomerang Blade',
    banner: '<b>Q</b> Rev the Saw (toggle) &bull; <b>E</b> Adrenal Injection (costs HP) &bull; <b>R</b> Boomerang Blade &bull; <b>P</b> Shop',
    tooltips: {
      P: { title: 'Passive • Saw Fuel', meta: 'Unique Resource (replaces mana)', body: 'A <b>100 fuel</b> tank instead of mana. It fills when he <b>takes damage</b> (1 fuel per 1% max HP lost, his own injection included) and refills slowly (<b>4/s</b>) while the saw is off. Mana items do nothing for him.' },
      LMB: { title: 'LMB • Surgical Strike', meta: '0 MP • 0.90s Base ATK', body: 'A close-range stab for <b>Attack damage</b>.' },
      Q: { title: 'Q • Rev the Saw', meta: 'Toggle • drains 9 fuel/s', body: 'Rev the saw in front of him: it hits a short frontal cone every 0.35s for <b>44 / 58 / 72 (+7/Lv) + 18% Ability</b>. He moves 25% slower and can\'t basic attack while it runs. Shuts off when out of fuel or toggled off.' },
      E: { title: 'E • Adrenal Injection', meta: 'Costs HP • 10s CD', body: 'Inject: <b>lose 6% of current HP</b>, gain a burst of move speed, and heal back <b>more than you lost</b> over 4s.' },
      R: { title: 'R • Boomerang Blade', meta: '40 fuel • 40s CD (Lv 4)', body: 'Hurl the sawblade out and back (<b>150 / 240 / 330 (+6/Lv) + 80% Ability</b> per pass): damages and <b>slows</b> going out, then damages and <b>pulls</b> enemies toward him on the return. The saw can\'t rev while the blade is away.' }
    }
  },

  parseBundle(bundle, tmpl) {
    return parseMixamoBundle(bundle, tmpl, H.scientist.bundleClips);
  },

  // Movement clips: walk with the saw revved, run otherwise
  locomotion() {
    return hero.sawOn ? { idle: 'idle', move: 'crawl' } : null;
  },
  speedMult() {
    return sawSlowOf(hero); // 3L Overclock: no saw slow
  },

  onBasicAttack(st) {
    return this.basicAttackFor(KitFx.player, st);
  },

  basicAttackFor(actor, st) {
    if (!actor.isPlayer) {
      const u = actor.unit, a = actor.aim();
      if (u.sawOn) return;
      u.facing = Math.atan2(a.x - u.x, a.z - u.z);
      u.punchAnim = 0.34;
      actor.play('punch', 0.05, true, 2.0, 0.15, 0.34);
      u.scStrike = { t: 0.1, dmg: H.scientist.dmg.stab(st) };
      const L = (window.__kitBotLog = window.__kitBotLog || {}); L.sc_lmb = (L.sc_lmb || 0) + 1;
      return;
    }
    if (hero.sawOn) return; // the saw is busy
    hero.atkTimer = KitFx.atkInterval(H.scientist.spec.atkCd, st);
    hero.punchAnim = 0.34;
    if (actions.punch) fadeToAction(actions.punch, 0.05, true, 2.0, 0.15); // jab extends at clip 0.35s -> ~0.10s
    pendingStrike = { isKick: false, facing: hero.facing, t: 0.1 };
  },

  onStrikeImpact(strike, ctx) {
    const dmg = H.scientist.dmg.stab(ctx.st);
    KitFx.hitCone(2.1, 0.7, dmg, { isBasic: true, color: '#fb7185' });
  },

  cast(slot, ctx) {
    return this.castFor(KitFx.player, slot, ctx);
  },

  castFor(actor, slot, ctx) {
    if (!ctx) {
      ctx = KitFx.castCtx(actor);
    }
    if (!actor.isPlayer) return this.botCast(actor, slot, ctx);
    const { st, cdrMult, rQE, pProg } = ctx;
    if (slot === 'Q') {
      if (hero.sawOn) {
        hero.sawOn = false;
        hero.cdQ = wtfMode ? 0.1 : 1.0;
        spawnFloat(hero.x, 2.6, hero.z, 'SAW OFF', '#94a3b8');
        return;
      }
      if (!wtfMode && hero.cdQ > 0) return;
      if (blade) { spawnFloat(hero.x, 2.6, hero.z, 'BLADE IS OUT!', '#fb7185'); return; }
      if (!wtfMode && (hero.mp || 0) < 1) { SFX.play('block'); spawnFloat(hero.x, 2.6, hero.z, 'OUT OF FUEL!', '#fb923c'); return; }
      hero.sawOn = true;
      hero.sawCastId = KitFx.castId(); // saw ticks run later (every 0.35s)
      sawTick = 0;
      SFX.play('arena');
      spawnFloat(hero.x, 2.6, hero.z, 'BZZZZT!', '#4ade80');
    } else if (slot === 'E') {
      if (!wtfMode && hero.cdE > 0) return;
      hero.cdE = wtfMode ? 0.3 : 10 * cdrMult;
      hero.kickAnim = 0.65;
      if (actions.kick) fadeToAction(actions.kick, 0.06, true, 2.2, 0.6); // bottle reaches his mouth at clip 1.73s -> ~0.5s
      hero.pendingInject = { t: 0.5, rQE, shock: KitFx.tal(ctx, 7, 'R') };
    } else if (slot === 'R') {
      // 10R Second Throw: a free re-throw (no fuel, no cooldown) within 3s of the blade coming back
      const rethrow = !blade && (hero.scRethrowUntil || 0) > KitFx.time;
      if (!rethrow) {
        if (!wtfMode && pProg.level < 4) {
          spawnFloat(hero.x, 2.6, hero.z, 'ULTIMATE UNLOCKS AT LEVEL 4!', '#fb7185');
          return;
        }
        if (!wtfMode && hero.cdR > 0) return;
        if (blade) return;
        if (!trySpendMana('R')) return;
        hero.cdR = wtfMode ? 0.5 : 40 * (ctx.ultCdrMult || cdrMult);
      }
      hero.sawOn = false;
      hero.kickAnim = 0.45;
      if (actions.slide) fadeToAction(actions.slide, 0.06, true, 1.8, 0.5);
      blade = makeThrow(KitFx.player, ctx, rethrow);
      SFX.play('dash');
    }
  },

  tickTimers(dt) {
    if (hero.pendingInject) {
      hero.pendingInject.t -= dt;
      if (hero.pendingInject.t <= 0) {
        const rQE = hero.pendingInject.rQE;
        const shock = hero.pendingInject.shock;
        hero.pendingInject = null;
        if (activeHeroId === 'scientist') {
          if (shock) shockPulse(KitFx.player);
          const cost = Math.round(hero.hp * 0.06);
          hero.hp = Math.max(1, hero.hp - cost);
          spawnFloat(hero.x, 2.4, hero.z, '-' + cost, '#fb7185');
          hero.injectTimer = 4.0;
          hero.injectHealPerSec = (cost * 1.6 + 30 + [0, 20, 40][rQE]) / 4.0;
          hero.eSpeedBuffTimer = 2.0; // shared +25% move speed buff
          SFX.play('chime');
          spawnShockRing(hero.x, hero.z, 0x4ade80, 0.2, 1.2, 0.3);
        }
      }
    }
    if (hero.injectTimer > 0) {
      hero.injectTimer -= dt;
      if (activeHeroId === 'scientist') MOBA_COMBAT.heal(hero, (hero.injectHealPerSec || 0) * dt);
    }
    if (activeHeroId !== 'scientist') { hero.sawOn = false; return; }
    fuelTick(hero, dt);
    if (hero.sawOn) {
      if (hero.mp <= 0 && !wtfMode) {
        hero.sawOn = false;
        hero.cdQ = 1.0;
        spawnFloat(hero.x, 2.6, hero.z, 'OUT OF FUEL!', '#fb7185');
      }
      sawTick -= dt;
      if (sawTick <= 0) {
        sawTick = 0.35;
        hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
        const st = phase1Engine ? phase1Engine.getPlayerStats() : { atk: 50, fant: 30 };
        const pl = phase1Engine ? (phase1Engine.getPlayerProg().level || 1) : 1;
        const dmg = H.scientist.dmg.sawTick(st, pl, KitFx.rQE(pl));
        const hits = KitFx.hitCone(2.5, 0.55, dmg, { dmgType: 'fantasy', color: '#4ade80', src: 'ability', aoe: true, castId: hero.sawCastId });
        if (hits > 0) SFX.play('punch');
      }
    }
  },

  // ---- Bots (Phase 2): saw toggle (no mana for bots; the brain shuts it off), injection, boomerang blade
  botCast(actor, slot, ctx) {
    const { st, rQE, pProg } = ctx;
    const hero = actor.unit;
    const a = actor.aim();
    hero.facing = Math.atan2(a.x - hero.x, a.z - hero.z);
    const L = (window.__kitBotLog = window.__kitBotLog || {}); L['sc_' + slot] = (L['sc_' + slot] || 0) + 1;
    if (slot === 'Q') {
      if (hero.sawOn) { hero.sawOn = false; hero.cdQ = 1.0; return; }
      if (hero.cdQ > 0 || hero.scBlade || fuelOf(hero) < 1) return;
      hero.sawOn = true;
      hero.sawCastId = KitFx.castId(); // saw ticks run later (every 0.35s)
      hero.sawT = 0;
      hero.sawTick = 0;
      SFX.play('arena');
      spawnFloat(hero.x, 2.6, hero.z, 'BZZZZT!', '#4ade80');
    } else if (slot === 'E') {
      if (hero.cdE > 0) return;
      hero.cdE = 10 * (ctx.cdrMult || 1);
      hero.kickAnim = 0.65;
      actor.play('kick', 0.06, true, 2.2, 0.6, 0.65);
      hero.pendingInject = { t: 0.5, rQE, shock: KitFx.tal(ctx, 7, 'R') };
    } else if (slot === 'R') {
      const rethrow = !hero.scBlade && (hero.scRethrowUntil || 0) > KitFx.time; // 10R Second Throw
      if (!rethrow) {
        if (pProg.level < 4 || hero.cdR > 0 || hero.scBlade || fuelOf(hero) < H.scientist.spec.mpCosts.R) return;
        hero.fuel = fuelOf(hero) - H.scientist.spec.mpCosts.R;
        hero.cdR = 40 * (ctx.ultCdrMult || ctx.cdrMult || 1);
      }
      hero.sawOn = false;
      hero.kickAnim = 0.45;
      actor.play('slide', 0.06, true, 1.8, 0.5, 0.45);
      const b = makeThrow(actor, ctx, rethrow);
      b.owner = actor;
      hero.scBlade = b;
      botBlades.push(b);
      SFX.play('dash');
    }
  },

  tickActor(actor, dt) {
    if (actor.isPlayer) return;
    const u = actor.unit;
    u.kickAnim = Math.max(0, (u.kickAnim || 0) - dt);
    u.punchAnim = Math.max(0, (u.punchAnim || 0) - dt);
    u.eSpeedBuffTimer = Math.max(0, (u.eSpeedBuffTimer || 0) - dt);
    if ((u.stunTimer || 0) > 0) { u.scStrike = null; u.pendingInject = null; u.sawOn = false; }
    if (u.scStrike && (u.scStrike.t -= dt) <= 0) {
      const sk = u.scStrike;
      u.scStrike = null;
      KitFx.hitCone(2.1, 0.7, sk.dmg, { isBasic: true, color: '#fb7185', by: actor });
    }
    if (u.pendingInject && (u.pendingInject.t -= dt) <= 0) {
      const rQE = u.pendingInject.rQE;
      if (u.pendingInject.shock) shockPulse(actor);
      u.pendingInject = null;
      const cost = Math.round(u.hp * 0.06);
      u.hp = Math.max(1, u.hp - cost);
      spawnFloat(u.x, 2.4, u.z, '-' + cost, '#fb7185');
      u.injectTimer = 4.0;
      u.injectHealPerSec = (cost * 1.6 + 30 + [0, 20, 40][rQE]) / 4.0;
      u.eSpeedBuffTimer = 2.0;
      SFX.play('chime');
      spawnShockRing(u.x, u.z, 0x4ade80, 0.2, 1.2, 0.3);
    }
    if ((u.injectTimer || 0) > 0) {
      u.injectTimer -= dt;
      MOBA_COMBAT.heal(u, (u.injectHealPerSec || 0) * dt);
    }
    botFuelTick(u, dt);
    // 10R Second Throw: a bot takes the free re-throw right away if its target is still in reach
    if ((u.scRethrowUntil || 0) > KitFx.time && !u.scBlade && !CC.helpless(u)) {
      const t = u.aimTarget && u.aimTarget.ref;
      if (t && (t.hp === undefined || t.hp > 0) && Math.hypot(t.x - u.x, t.z - u.z) <= 11) this.botCast(actor, 'R', KitFx.castCtx(actor));
    }
    if (u.sawOn && ((u.sawT || 0) > 6 || fuelOf(u) <= 0)) { u.sawOn = false; u.cdQ = 1.0; } // out of fuel (or the 6s safety cap)
    if (u.sawOn) {
      u.sawT = (u.sawT || 0) + dt;
      u.sawTick = (u.sawTick || 0) - dt;
      if (u.sawTick <= 0) {
        u.sawTick = 0.35;
        const a = actor.aim();
        u.facing = Math.atan2(a.x - u.x, a.z - u.z);
        const st = actor.stats();
        const dmg = H.scientist.dmg.sawTick(st, actor.level(), KitFx.rQE(actor.level()));
        const hits = KitFx.hitCone(2.5, 0.55, dmg, { dmgType: 'fantasy', color: '#4ade80', by: actor, src: 'ability', aoe: true, castId: u.sawCastId });
        if (hits > 0) SFX.play('punch');
      }
    }
  },

  // Bots: revved saw = 25% slower, injection = +25% burst (the engine multiplies bot speed by this)
  botSpeedMult(b) {
    return sawSlowOf(b) * ((b.eSpeedBuffTimer || 0) > 0 ? 1.25 : 1);
  },

  // Bots: the saw gun in the right hand, its blade hidden while the boomerang is out
  botVisual(b) {
    if (!sawTemplate && !sawTemplateLoading && window.SCIENTIST_MIXAMO) {
      sawTemplateLoading = true;
      KitFx.loadPropGlb(window.SCIENTIST_MIXAMO.sawGunGlbB64, 0.75).then((p) => { sawTemplate = p; });
    }
    if (!sawTemplate || !b.rightHand) return;
    if (!b.scGun) {
      b.scGun = sawTemplate.clone(true);
      const spin = makeBladeMesh();
      spin.scale.setScalar(0.34);
      const tilt = new THREE.Group();
      tilt.rotation.z = Math.PI / 2;
      tilt.add(spin);
      b.scGunBlade = { tilt, spin };
      scene.add(b.scGun);
      scene.add(tilt);
    }
    if (!_hv) _hv = new THREE.Vector3();
    b.model.updateMatrixWorld(true);
    b.rightHand.getWorldPosition(_hv);
    const yaw = b.facing || 0, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    b.scGun.position.set(_hv.x + rx * 0.02 + fx * 0.12, _hv.y - 0.02, _hv.z + rz * 0.02 + fz * 0.12);
    b.scGun.rotation.set(0, yaw - Math.PI / 2, b.sawOn ? Math.sin(performance.now() * 0.08) * 0.03 : 0, 'YXZ');
    b.scGun.visible = b.pivot.visible;
    const gb = b.scGunBlade;
    gb.tilt.visible = b.pivot.visible && !b.scBlade;
    gb.tilt.position.set(_hv.x + rx * 0.02 + fx * 0.52, _hv.y + 0.03, _hv.z + rz * 0.02 + fz * 0.52);
    gb.tilt.rotation.set(0, yaw, Math.PI / 2, 'YXZ');
    gb.spin.rotation.y += b.sawOn ? 0.9 : (b.punchAnim > 0 ? 0.5 : 0);
    gb.spin.userData.ring.material.color.setHex(b.sawOn ? 0x4ade80 : 0x3f4a44);
  },

  botHide(b) {
    if (b.scGun) b.scGun.visible = false;
    if (b.scGunBlade) b.scGunBlade.tilt.visible = false;
  },

  updateWorld(dt) {
    // bots' boomerang blades
    for (let i = botBlades.length - 1; i >= 0; i--) {
      const b = botBlades[i];
      if (this.stepBlade(b, dt, b.owner)) { botBlades.splice(i, 1); b.owner.unit.scBlade = null; bladeBack(b.owner.unit, b); }
    }
    if (!blade) return;
    if (this.stepBlade(blade, dt, KitFx.player)) { bladeBack(hero, blade); blade = null; }
  },

  // One boomerang blade step for any caster; returns true when it's back (done)
  stepBlade(b, dt, actor) {
    const hero = actor.unit; // (local alias: the thrower)
    if (b.delay > 0) {
      b.delay -= dt;
      if (b.delay > 0) return false;
      b.mesh.visible = true;
      b.sx = hero.x; b.sz = hero.z; b.ang = hero.facing;
    }
    b.t += dt;
    const sx = Math.sin(b.ang), sz = Math.cos(b.ang);
    let x, z;
    if (b.hovering > 0) {
      // 3R Hang Time: parked at the far point, slowing whoever it touches
      b.hovering -= dt;
      x = b.turnX; z = b.turnZ;
      if (b.hovering <= 0) { b.out = false; b.t = 0; }
    } else if (b.out) {
      const d = Math.min(b.range, b.t * b.spd);
      x = b.sx + sx * d; z = b.sz + sz * d;
      if (d >= b.range) {
        b.turnX = x; b.turnZ = z;
        if (b.hang > 0) b.hovering = b.hang;
        else { b.out = false; b.t = 0; }
      }
    } else {
      // return toward the scientist's current position
      const tx = hero.x, tz = hero.z;
      const cx = b.mesh.position.x, cz = b.mesh.position.z;
      const dd = Math.hypot(tx - cx, tz - cz);
      if (dd < 0.8 || b.t > 2.5 || (hero.hp !== undefined && hero.hp <= 0)) {
        scene.remove(b.mesh);
        return true;
      }
      x = cx + ((tx - cx) / dd) * b.spd * 1.1 * dt;
      z = cz + ((tz - cz) / dd) * b.spd * 1.1 * dt;
    }
    b.mesh.position.set(x, 1.2, z);
    b.mesh.rotation.y += dt * 22;
    // hits: once per target per leg (out: slow; hover: slow only; back: pull toward him)
    const hover = b.hovering > 0;
    const set = hover ? b.hitHover : (b.out ? b.hitOut : b.hitBack);
    const hitOne = (key, fn) => { if (!set.has(key)) { set.add(key); fn(); } };
    if (actor.isPlayer) dummies.forEach((d) => {
      if (d.isShooter && !shooterEnabled) return;
      if (Math.hypot(d.x - x, d.z - z) <= 0.9 + d.r) hitOne('d' + d.id, () => {
        if (hover) { CC.slow(d, HANG_SLOW.dur, HANG_SLOW.pct); return; }
        damageDummy(d, b.dmg, '#4ade80');
        if (b.out) d.slowTimer = Math.max(d.slowTimer || 0, 1.5);
        else KitFx.knockDummy(d, hero.x - d.x, hero.z - d.z, Math.min(4, Math.hypot(hero.x - d.x, hero.z - d.z) - 1.2));
      });
    });
    if (phase1Engine) {
      actor.hostiles().forEach((t, j) => {
        if (t.kind === 'structure') return;
        if (Math.hypot(t.x - x, t.z - z) <= 0.9 + (t.r || 0.5)) hitOne(t.kind + (t.ref && t.ref.id || j), () => {
          if (hover) { actor.damage(t, 0, { slowDur: HANG_SLOW.dur, slowPct: HANG_SLOW.pct, castId: b.castId }); return; }
          const opts = { dmgType: 'physical', color: '#4ade80', castId: b.castId };
          if (b.out) opts.slowDur = 1.5;
          else {
            opts.knockbackDist = Math.max(0, Math.min(4, Math.hypot(hero.x - t.x, hero.z - t.z) - 1.2));
            opts.knockbackDirX = hero.x - t.x;
            opts.knockbackDirZ = hero.z - t.z;
          }
          actor.damage(t, b.dmg, opts);
        });
      });
    }
    return false;
  },

  // Saw gun follows the right hand
  updateHandProps() {
    if (!(currentModel && rightHandBone)) return false;
    if (!sawGun && !sawGunLoading && window.SCIENTIST_MIXAMO) {
      sawGunLoading = true;
      KitFx.loadPropGlb(window.SCIENTIST_MIXAMO.sawGunGlbB64, 0.75).then((p) => { sawGun = p; if (p) scene.add(p); });
    }
    if (sawGun) {
      sawGun.visible = true;
      KitFx.placeAtBone(sawGun, 'RightHand', { x: 0.02, y: -0.02, z: 0.12 }, { x: 0, y: -Math.PI / 2, z: 0 });
      if (hero.sawOn) sawGun.rotation.z += Math.sin(performance.now() * 0.08) * 0.03; // rattle while revving
    }
    if (!gunBlade) {
      const holder = new THREE.Group();
      const spin = makeBladeMesh();
      spin.scale.setScalar(0.34);
      const tilt = new THREE.Group();
      tilt.rotation.z = Math.PI / 2; // disc stands vertical, edge facing forward
      tilt.add(spin);
      // glow halo that only shows while the saw is running
      const glow = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 8, 28), new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = Math.PI / 2;
      spin.add(glow);
      holder.add(tilt);
      scene.add(holder);
      SPARK_GEO = new THREE.SphereGeometry(0.025, 5, 4);
      SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xfde68a, blending: THREE.AdditiveBlending, transparent: true });
      gunBlade = { holder, spin, glow, ring: spin.userData.ring, speed: 0, sparkT: 0 };
    }
    gunBlade.holder.visible = !blade;
    if (!blade) {
      KitFx.placeAtBone(gunBlade.holder, 'RightHand', { x: 0.02, y: 0.03, z: 0.52 }, { x: 0, y: 0, z: 0 });
      // Off: blade parked, ring dark. On (Q): spins up hard, ring glows green, sparks fly. Jabs give it a quick buzz.
      const want = hero.sawOn ? 1 : (hero.punchAnim > 0 ? 0.6 : 0);
      const gb = gunBlade;
      gb.speed = THREE.MathUtils.lerp(gb.speed, want, want > gb.speed ? 0.25 : 0.06);
      gb.spin.rotation.y += gb.speed * 0.95;
      const on = hero.sawOn ? 1 : 0;
      const pulse = 0.75 + Math.sin(performance.now() * 0.03) * 0.25;
      gb.ring.material.color.setHex(gb.speed > 0.3 ? 0x4ade80 : 0x3f4a44);
      gb.glow.material.opacity = on * 0.55 * pulse;
      if (on) {
        gb.sparkT -= 1 / 60;
        if (gb.sparkT <= 0) {
          gb.sparkT = 0.12 + Math.random() * 0.1;
          for (let k = 0; k < 3; k++) {
            const m = new THREE.Mesh(SPARK_GEO, SPARK_MAT);
            m.position.copy(gb.holder.position);
            const a = Math.random() * Math.PI * 2;
            sparks.push({ m, vx: Math.cos(a) * 2.2, vy: 1.5 + Math.random() * 2, vz: Math.sin(a) * 2.2, t: 0.3 });
            scene.add(m);
          }
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.t -= 1 / 60;
        sp.vy -= 9.8 / 60;
        sp.m.position.x += sp.vx / 60; sp.m.position.y += sp.vy / 60; sp.m.position.z += sp.vz / 60;
        if (sp.t <= 0) { scene.remove(sp.m); sparks.splice(i, 1); }
      }
    }
    return true;
  },

  onSwitchedAway() {
    if (sawGun) sawGun.visible = false;
    if (gunBlade) gunBlade.holder.visible = false;
    hero.sawOn = false;
  },

  hudTag() { return hero.sawOn ? ' [SAW]' : ''; },
  passivePip() { return ''; },
  qEmpowered() { return !!hero.sawOn; },
  // R glows while the 10R free re-throw is up
  rEmpowered() { return !blade && (hero.scRethrowUntil || 0) > KitFx.time; },
  devBlade() { return blade; } // (talent test)
};
})();
