// Little Fairy: Support • Ranged Enchanter (guardian angel + trickster). See DESIGN_RULES.md.
// First playable pass: real model + clips, hover/lean/wings in code, stand-in versions of the designed kit
// (Glimmer Dart, Pop! Bubble lob + Fairy Dust heal, 2-charge Pixie Hop, Lullaby Dreamdust ring that sleeps = stuns).
// Talents are placeholders until the roster-wide talent pass.
(function () {
'use strict';
const H = (window.MOBA_HEROES = window.MOBA_HEROES || {});

const HOVER = 0.75;      // meters above the ground
const HOP_RANGE = 7.0;
const HOP_CHARGE_CD = 10.0;
const dustPatches = [];  // { grp, x, z, r, t, dream, owner } (owner: bot actor, or null = the player)
const bubbles = [];      // in-flight Pop! bubbles { mesh, sx, sz, tx, tz, t, dur, dmg, delay, owner }
let lullabyTimer = 0;    // the player's Lullaby (bots keep theirs on their unit as fairyLullaby)
function lullabyOn(owner) { return owner ? (owner.unit.fairyLullaby || 0) > 0 : lullabyTimer > 0; }
let wings = null;

function makeWings() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xbfffee, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.25, 0.55, 0.75, 0.75, 0.9, 0.35);
  shape.bezierCurveTo(0.95, 0.05, 0.4, -0.05, 0, 0);
  const lower = new THREE.Shape();
  lower.moveTo(0, 0);
  lower.bezierCurveTo(0.2, -0.15, 0.55, -0.45, 0.45, -0.6);
  lower.bezierCurveTo(0.25, -0.65, 0.05, -0.3, 0, 0);
  const geoU = new THREE.ShapeGeometry(shape), geoL = new THREE.ShapeGeometry(lower);
  [-1, 1].forEach((side) => {
    const pivot = new THREE.Group();
    const u = new THREE.Mesh(geoU, mat), l = new THREE.Mesh(geoL, mat);
    pivot.add(u, l);
    pivot.scale.set(side, 1, 1);
    pivot.userData.side = side;
    g.add(pivot);
  });
  g.scale.setScalar(0.75); // sized for her smaller 1.15m body
  g.userData.isFairyWings = true;
  scene.add(g);
  return g;
}

function nearestUnitTo(x, z, maxDist, includeAllies, actor) {
  let best = null, bestD = maxDist;
  const by = actor || KitFx.player;
  if (by.isPlayer) dummies.forEach((d) => {
    if (d.isShooter && !shooterEnabled) return;
    const dd = Math.hypot(d.x - x, d.z - z);
    if (dd < bestD) { bestD = dd; best = { x: d.x, z: d.z, enemy: true, dummy: d }; }
  });
  if (phase1Engine) {
    by.hostiles().forEach((t) => {
      if (t.kind === 'structure') return;
      const dd = Math.hypot(t.x - x, t.z - z);
      if (dd < bestD) { bestD = dd; best = { x: t.x, z: t.z, enemy: true, unit: t }; }
    });
    if (includeAllies) {
      by.allies().forEach((t) => {
        const dd = Math.hypot(t.x - x, t.z - z);
        if (dd < bestD) { bestD = dd; best = { x: t.x, z: t.z, enemy: false, unit: t }; }
      });
    }
  }
  return best;
}

let dustTex = null;
function softBlobTexture() {
  if (dustTex) return dustTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  dustTex = new THREE.CanvasTexture(c);
  return dustTex;
}
let _limbAxis = null;
function spawnDust(x, z, r, life, ring = false, owner = null) {
  const grp = new THREE.Group();
  const disc = new THREE.MeshBasicMaterial({ color: 0x86efac, map: softBlobTexture(), transparent: true, opacity: 0.32, depthWrite: false });
  // overlapping soft blobs: a loose ring for R, a lumpy patch otherwise
  const n = ring ? 14 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const rr = ring ? r * (0.72 + Math.random() * 0.22) : r * Math.random() * 0.45;
    const br = ring ? r * (0.22 + Math.random() * 0.14) : r * (0.5 + Math.random() * 0.3);
    const blob = new THREE.Mesh(new THREE.CircleGeometry(br, 20), disc);
    blob.rotation.x = -Math.PI / 2;
    blob.scale.set(1 + Math.random() * 0.4, 1, 1);
    blob.rotation.z = Math.random() * Math.PI;
    blob.position.set(Math.cos(a) * rr, 0.05 + i * 0.002, Math.sin(a) * rr);
    grp.add(blob);
  }
  for (let i = 0; i < (ring ? 36 : 18); i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xfef9c3 }));
    s.userData.sparkle = true;
    const a = Math.random() * Math.PI * 2, rr = ring ? r * (0.6 + Math.random() * 0.4) : Math.random() * r;
    s.position.set(Math.cos(a) * rr, 0.2 + Math.random() * 1.0, Math.sin(a) * rr);
    s.userData.phase = Math.random() * 6;
    grp.add(s);
  }
  grp.position.set(x, 0, z);
  scene.add(grp);
  dustPatches.push({ grp, disc, x, z, r, t: life, life, dream: lullabyOn(owner), owner });
}

// Hover, bank/lean and the limb flutter, shared by the player's Fairy and bot Fairies.
// st holds the smoothing state (the hero or a bot); o = { dt, t, yaw, moving, casting, bone(name) }.
// Swings the limb bones directly (call after the mixer) and returns the body offsets for the caller to apply.
let _wv = null;
function fairyMotion(st, o) {
  const { dt, t, yaw, moving, casting } = o;
  // bank into turns from how fast the facing is changing
  let dYaw = yaw - (st.fairyLastYaw === undefined ? yaw : st.fairyLastYaw);
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;
  st.fairyLastYaw = yaw;
  const bankTarget = dt > 0 ? THREE.MathUtils.clamp(-dYaw / dt * 0.06, -0.45, 0.45) : 0;
  st.fairyBank = THREE.MathUtils.lerp(st.fairyBank || 0, bankTarget, Math.min(1, dt * 6));
  // pitch eases into a forward lean and swings slightly back when she stops
  const pitchTarget = moving ? 0.32 : (st.fairyWasMoving ? -0.12 : 0.0);
  if (!moving && st.fairyWasMoving) st.fairyStopT = 0.35;
  st.fairyWasMoving = !!moving;
  st.fairyStopT = Math.max(0, (st.fairyStopT || 0) - dt);
  st.fairyPitch = THREE.MathUtils.lerp(st.fairyPitch || 0, st.fairyStopT > 0 ? -0.12 : pitchTarget, Math.min(1, dt * 4));
  const flapHz = moving ? 4.2 : 2.2;
  const flapPh = st.fairyFlapPh = ((st.fairyFlapPh || 0) + dt * flapHz * Math.PI * 2) % (Math.PI * 2);
  const pump = Math.max(0, Math.sin(flapPh)) * 0.035; // little lift on each downstroke
  // Limbs: the clips leave her arms and legs doll-still, so add a flutter on top.
  // Flying: legs trail back and scissor-kick, knees bent, arms swept back. Hovering: legs dangle, arms drift.
  // Faded out during casts (spins/kisses twist the hips, and the world-space swing would pinwheel).
  const mw = st.fairyMoveW = THREE.MathUtils.lerp(st.fairyMoveW || 0, moving ? 1 : 0, Math.min(1, dt * 5));
  const aw = st.fairyArmW = THREE.MathUtils.lerp(st.fairyArmW === undefined ? 1 : st.fairyArmW, casting ? 0 : 1, Math.min(1, dt * (casting ? 14 : 4)));
  const side = _limbAxis || (_limbAxis = new THREE.Vector3());
  side.set(Math.cos(yaw), 0, -Math.sin(yaw)); // + angle swings a hanging limb backward
  // integrate the phase (t * freq would race through cycles whenever freq changes, since t is huge)
  const kickHz = 0.7 + mw * 0.35;
  const ph = st.fairyLegPh = ((st.fairyLegPh || 0) + dt * kickHz * Math.PI * 2) % (Math.PI * 2);
  const legBack = aw * (0.06 + mw * 0.16);
  const legAmp = aw * (0.06 + mw * 0.04);
  const kneeBase = aw * (0.25 + mw * 0.25), kneeKick = aw * (0.1 + mw * 0.06);
  const sw = (n, a) => KitFx.swingBoneObj(o.bone(n), side, a);
  sw('LeftUpLeg', legBack + Math.sin(ph) * legAmp);
  sw('RightUpLeg', legBack - Math.sin(ph) * legAmp);
  sw('LeftLeg', kneeBase + Math.max(0, Math.sin(ph + 0.9)) * kneeKick);
  sw('RightLeg', kneeBase + Math.max(0, -Math.sin(ph + 0.9)) * kneeKick);
  if (aw > 0.01) {
    const armSwing = Math.sin(ph + 0.6);
    sw('LeftArm', aw * (mw * 0.45 + armSwing * (0.06 + mw * 0.06)));
    sw('RightArm', aw * (mw * 0.45 - armSwing * (0.06 + mw * 0.06)));
    sw('LeftForeArm', -aw * (0.2 + Math.sin(t * 2.1) * 0.08));
    sw('RightForeArm', -aw * (0.2 + Math.sin(t * 2.1 + 1.3) * 0.08));
  }
  return {
    lift: HOVER + Math.sin(t * 1.6) * 0.13 + pump,
    pitch: st.fairyPitch,
    roll: st.fairyBank + Math.sin(t * 0.9) * (moving ? 0.02 : 0.06),
    yawWobble: Math.sin(t * 0.7) * (moving ? 0 : 0.08),
    flapPh
  };
}

H.fairy = {
  id: 'fairy',
  roster: { order: 6, emoji: '🧚', short: 'Fairy' },
  bundle: { label: 'Little Fairy', src: 'assets/fairy/fairy_bundle.js', globalKey: 'FAIRY_MIXAMO', pStart: 55, pEnd: 65 },
  bundleClips: { idle: 'idleFbxB64', punch: 'punchFbxB64', kick: 'kickFbxB64', slide: 'slideFbxB64' },
  moveSpeed: 6.2,
  hudSpeed: 342,
  pillLabels: { punch: 'Point', kick: 'Kiss', dash: 'Twirl', dashReady: () => !!actions.slide },
  // She hovers: casting clips keep the idle's dangling legs (no planted feet in mid-air)
  clipTweaks: {
    overlay: {
      punch: { from: 'idle', bones: /^(Hips|LeftUpLeg|LeftLeg|LeftFoot|LeftToeBase|RightUpLeg|RightLeg|RightFoot|RightToeBase)$/ },
      kick: { from: 'idle', bones: /^(Hips|LeftUpLeg|LeftLeg|LeftFoot|LeftToeBase|RightUpLeg|RightLeg|RightFoot|RightToeBase)$/ },
      // the twirl lives in the Hips rotation, so only the legs keep the hover pose here
      slide: { from: 'idle', bones: /^(LeftUpLeg|LeftLeg|LeftFoot|LeftToeBase|RightUpLeg|RightLeg|RightFoot|RightToeBase)$/ }
    }
  },

  // All of the Fairy's numbers in one place. The dart is Attack damage; the bubble and hop are Ability damage; dust heals
  // and the bubble shield scale with Ability.
  dmg: {
    dart: (st) => Math.round(st.attack),
    bubble: (st, lvl, rQE) => Math.round([150, 230, 320][rQE] + 12 * ((lvl || 1) - 1) + st.ability * 1.0),
    hop: (st, lvl) => Math.round(50 + 7 * ((lvl || 1) - 1) + st.ability * 0.5),
    dustHealPerSec: (st, lvl) => 12 + 2 * ((lvl || 1) - 1) + st.ability * 0.12,
    bubbleShield: (st, lvl) => Math.round(70 + 10 * ((lvl || 1) - 1) + st.ability * 0.5)
  },

  spec: {
    id: 'fairy',
    name: 'Little Fairy',
    role: 'Support • Ranged Enchanter',
    glyph: 'F',
    color: '#34d399',
    height: 1.15,
    baseHp: 1080, hpGrow: 88,
    baseMp: 440, mpGrow: 40, mpRegen: 7.5,
    // Stat model (DESIGN_RULES §2): Ability support (~96 / 171 / 335 dps, about 60% of the budget, no items);
    // her heals and shields scale with Ability too
    baseAttack: 45, attackGrow: 4.0,
    baseAbility: 45, abilityGrow: 8.0,
    baseResist: 19, resistGrow: 2.2,
    asGrow: 0.03,
    baseSpd: 6.2,
    atkCd: 0.86,
    mpCosts: { Q: 50, E: 30, R: 100 }
  },

  talents: {
    3: { L: { id: '3L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '3R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } },
    7: { L: { id: '7L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '7R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } },
    10: { L: { id: '10L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '10R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } }
  },

  ui: {
    height: 1.15,
    modelLabel: 'Little Fairy (Mixamo Rigged)',
    glyph: 'F',
    color: '#34d399',
    name: 'Little Fairy (3D)',
    role: 'Support • Ranged Enchanter',
    passive: 'Fairy Dust',
    lmb: 'Glimmer Dart',
    q: 'Pop! Bubble',
    e: 'Pixie Hop',
    r: 'Lullaby',
    banner: '<b>Passive</b> Fairy Dust (heals allies) &bull; <b>Q</b> Pop! Bubble lob &bull; <b>E</b> Pixie Hop (2 charges) &bull; <b>R</b> Lullaby Dreamdust &bull; <b>P</b> Shop',
    tooltips: {
      P: { title: 'Passive • Fairy Dust', meta: 'Innate Heal Zones', body: 'Every <b>Q</b> pop leaves a patch of Fairy Dust for 3.5s that <b>heals allies standing inside</b> (12 (+2/Lv) + 12% Ability per second). During <b>R</b> it becomes Dreamdust.' },
      LMB: { title: 'LMB • Glimmer Dart', meta: '0 MP • 0.86s Base ATK', body: 'A light ranged poke for <b>Attack damage</b>.' },
      Q: { title: 'Q • Pop! Bubble', meta: '50 MP • 6.5s CD', body: 'Lob a slow bubble to a spot. It pops over an area: enemies take <b>150 / 230 / 320 (+12/Lv) + 100% Ability</b> and a 2s slow, allies get a <b>shield</b> (70 (+10/Lv) + 50% Ability), and it leaves Fairy Dust.' },
      E: { title: 'E • Pixie Hop', meta: '30 MP • 2 charges (10s each)', body: 'Blink to the <b>unit nearest the cursor</b> within 7m (enemy: minor damage + a brief silence; ally: reposition). Can\'t hop to the same unit until that charge recharges.' },
      R: { title: 'R • Lullaby', meta: '100 MP • 48s CD (Lv 4)', body: 'Twirl and burst a <b>4m Dreamdust ring</b>. For 10s all her dust is Dreamdust: enemies inside <b>fall asleep for 2s</b>.' }
    }
  },

  parseBundle(bundle, tmpl) {
    return parseMixamoBundle(bundle, tmpl, H.fairy.bundleClips);
  },

  // LMB Glimmer Dart (Pointing clip, a quick flick)
  onRangedAttack(st) {
    return this.basicAttackFor(KitFx.player, st);
  },

  basicAttackFor(actor, st) {
    if (!actor.isPlayer) {
      const u = actor.unit, a = actor.aim();
      u.facing = Math.atan2(a.x - u.x, a.z - u.z);
      actor.play('punch', 0.05, true, 1.6, 0.2, 0.32);
      u.fairyDart = { t: 0.16, facing: u.facing, dmg: H.fairy.dmg.dart(st) };
      const L = (window.__kitBotLog = window.__kitBotLog || {}); L.fy_lmb = (L.fy_lmb || 0) + 1;
      return;
    }
    hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
    hero.atkTimer = H.fairy.spec.atkCd / (1 + st.asPct);
    hero.punchAnim = 0.32;
    if (actions.punch) fadeToAction(actions.punch, 0.05, true, 1.6, 0.2); // point extends at clip 0.45s -> ~0.16s
    const dmg = H.fairy.dmg.dart(st);
    const facing = hero.facing;
    setTimeout(() => {
      if (activeHeroId !== 'fairy') return;
      SFX.play('chime');
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0xbbf7d0 }));
      KitFx.spawnBolt(facing, dmg, { mesh: m, speed: 12.5, life: 0.75, y: 1.3 + HOVER, dmgType: 'physical' });
    }, 160);
  },

  cast(slot, ctx) {
    return this.castFor(KitFx.player, slot, ctx);
  },

  castFor(actor, slot, ctx) {
    if (!ctx) {
      const lvl = actor.level();
      ctx = { st: actor.stats(), pProg: { level: lvl }, talents: actor.talents(), cdrMult: 1 - (actor.stats().cdr || 0), rQE: KitFx.rQE(lvl), rUlt: KitFx.rUlt(lvl) };
    }
    const { st, cdrMult, rQE, pProg } = ctx;
    const hero = actor.unit;
    const wtfMode = actor.wtf;
    const trySpendMana = (sl) => actor.spend(sl);
    const aimWorld = actor.aim();
    const owner = actor.isPlayer ? null : actor;
    if (!actor.isPlayer) {
      hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
      const L = (window.__kitBotLog = window.__kitBotLog || {}); L['fy_' + slot] = (L['fy_' + slot] || 0) + 1;
    }
    if (slot === 'Q') {
      if (!wtfMode && hero.cdQ > 0) return;
      if (!trySpendMana('Q')) return;
      hero.cdQ = wtfMode ? 0.3 : 6.5 * cdrMult;
      hero.kickAnim = 0.55;
      actor.play('kick', 0.06, true, 1.6, 1.65, 0.55); // kiss at clip 1.93s, blow ~2.2s -> release at ~0.34s
      const dx = aimWorld.x - hero.x, dz = aimWorld.z - hero.z;
      const dist = Math.min(9, Math.hypot(dx, dz) || 0.01);
      const ang = Math.atan2(dx, dz);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 18, 14),
        new THREE.MeshBasicMaterial({ color: 0xa7f3d0, transparent: true, opacity: 0.45, depthWrite: false })
      );
      mesh.visible = false;
      scene.add(mesh);
      bubbles.push({
        mesh, sx: hero.x, sz: hero.z, tx: hero.x + Math.sin(ang) * dist, tz: hero.z + Math.cos(ang) * dist,
        delay: 0.34, t: 0, dur: 0.6, dmg: H.fairy.dmg.bubble(st, pProg.level, rQE), owner
      });
    } else if (slot === 'E') {
      hero.hopCharges = hero.hopCharges === undefined ? 2 : hero.hopCharges;
      if (!wtfMode && hero.hopCharges <= 0) return;
      const target = nearestUnitTo(aimWorld.x, aimWorld.z, 3.0, true, actor);
      if (!target || Math.hypot(target.x - hero.x, target.z - hero.z) > HOP_RANGE + 0.5) {
        spawnFloat(hero.x, 2.8, hero.z, 'NO UNIT IN RANGE', '#fb7185');
        return;
      }
      if (!trySpendMana('E')) return;
      if (!wtfMode) {
        hero.hopCharges--;
        hero.hopRecharge = hero.hopRecharge || [];
        hero.hopRecharge.push(HOP_CHARGE_CD * cdrMult);
      }
      spawnShockRing(hero.x, hero.z, 0x86efac, 0.2, 1.3, 0.25);
      const ang = Math.atan2(target.x - hero.x, target.z - hero.z);
      hero.x = target.x - Math.sin(ang) * 1.1;
      hero.z = target.z - Math.cos(ang) * 1.1;
      hero.facing = ang;
      spawnShockRing(hero.x, hero.z, 0x86efac, 0.2, 1.3, 0.25);
      spawnDust(target.x, target.z, 2.5, 3.5, false, owner);
      SFX.play('dash');
      if (target.enemy) {
        const dmg = H.fairy.dmg.hop(st, pProg.level);
        if (target.dummy) {
          damageDummy(target.dummy, dmg, '#86efac');
        } else if (target.unit && phase1Engine) {
          actor.damage(target.unit, dmg, { dmgType: 'fantasy', stunDur: 0.4, color: '#86efac' });
        }
        spawnFloat(target.x, 2.6, target.z, 'HUSH!', '#86efac');
      }
      hero.cdE = hero.hopCharges > 0 ? 0 : Math.min(...(hero.hopRecharge || [0]));
    } else if (slot === 'R') {
      if (!wtfMode && pProg.level < 4) {
        spawnFloat(hero.x, 2.6, hero.z, 'ULTIMATE UNLOCKS AT LEVEL 4!', '#fb7185');
        return;
      }
      if (!wtfMode && hero.cdR > 0) return;
      if (!trySpendMana('R')) return;
      hero.cdR = wtfMode ? 0.5 : 48 * cdrMult;
      hero.kickAnim = 0.75;
      actor.play('slide', 0.06, true, 1.6, 1.25, 0.75); // just the second spin (clip ~1.25-2.5s)
      if (owner) hero.fairyLullaby = 10; else lullabyTimer = 10;
      dustPatches.forEach((p) => { if (p.owner === owner) p.dream = true; });
      spawnFloat(hero.x, 3.0, hero.z, 'LULLABY!', '#c4b5fd');
      if (owner) {
        hero.fairyRing = 0.4; // tickActor drops the ring after the spin
      } else {
        setTimeout(() => {
          if (activeHeroId !== 'fairy') return;
          spawnDust(hero.x, hero.z, 4.0, 10, true);
          spawnShockRing(hero.x, hero.z, 0xc4b5fd, 0.4, 4.2, 0.5);
          SFX.play('arena');
        }, 400);
      }
    }
  },

  tickTimers(dt) {
    // Pixie Hop charges recharge separately
    if (hero.hopRecharge && hero.hopRecharge.length) {
      for (let i = hero.hopRecharge.length - 1; i >= 0; i--) {
        hero.hopRecharge[i] -= dt;
        if (hero.hopRecharge[i] <= 0) {
          hero.hopRecharge.splice(i, 1);
          hero.hopCharges = Math.min(2, (hero.hopCharges || 0) + 1);
        }
      }
      if (activeHeroId === 'fairy') hero.cdE = hero.hopCharges > 0 ? 0 : Math.max(0, Math.min(...hero.hopRecharge));
    }
    lullabyTimer = Math.max(0, lullabyTimer - dt);
  },

  // Bots: dart release, hop charges, Lullaby timer and its ring (the player's run through tickTimers/setTimeout)
  tickActor(actor, dt) {
    if (actor.isPlayer) return;
    const u = actor.unit;
    u.kickAnim = Math.max(0, (u.kickAnim || 0) - dt);
    u.fairyLullaby = Math.max(0, (u.fairyLullaby || 0) - dt);
    if (u.hopRecharge && u.hopRecharge.length) {
      for (let i = u.hopRecharge.length - 1; i >= 0; i--) {
        u.hopRecharge[i] -= dt;
        if (u.hopRecharge[i] <= 0) { u.hopRecharge.splice(i, 1); u.hopCharges = Math.min(2, (u.hopCharges || 0) + 1); }
      }
    }
    if (u.fairyDart) {
      if ((u.stunTimer || 0) > 0) u.fairyDart = null;
      else if ((u.fairyDart.t -= dt) <= 0) {
        const d = u.fairyDart;
        u.fairyDart = null;
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0xbbf7d0 }));
        KitFx.spawnBolt(d.facing, d.dmg, { mesh: m, speed: 12.5, life: 0.75, y: 1.3 + HOVER, dmgType: 'physical', by: actor });
      }
    }
    if ((u.fairyRing || 0) > 0 && (u.fairyRing -= dt) <= 0) {
      spawnDust(u.x, u.z, 4.0, 10, true, actor);
      spawnShockRing(u.x, u.z, 0xc4b5fd, 0.4, 4.2, 0.5);
      SFX.play('arena');
    }
  },

  updateWorld(dt) {
    for (let bi = bubbles.length - 1; bi >= 0; bi--) {
      const b = bubbles[bi];
      if (b.delay > 0) {
        b.delay -= dt;
        if (b.delay > 0) continue;
        b.mesh.visible = true;
        SFX.play('chime');
      }
      b.t += dt;
      const u = Math.min(1, b.t / b.dur);
      b.mesh.position.set(b.sx + (b.tx - b.sx) * u, 1.6 + Math.sin(u * Math.PI) * 2.2, b.sz + (b.tz - b.sz) * u);
      if (u >= 1) {
        scene.remove(b.mesh);
        bubbles.splice(bi, 1);
        SFX.play('chime');
        spawnShockRing(b.tx, b.tz, 0xa7f3d0, 0.3, 2.6, 0.3);
        KitFx.hitArea(b.tx, b.tz, 2.5, b.dmg, { dmgType: 'fantasy', slowDur: 2.0, color: '#a7f3d0', by: b.owner || KitFx.player });
        const caster = b.owner ? b.owner.unit : hero;
        if (Math.hypot(caster.x - b.tx, caster.z - b.tz) <= 2.5) {
          const ca = b.owner || KitFx.player;
          caster.shield = Math.max(caster.shield || 0, H.fairy.dmg.bubbleShield(ca.stats(), ca.level()));
          caster.shieldTimer = 3.0;
          spawnFloat(caster.x, 2.6, caster.z, 'BUBBLE SHIELD', '#a7f3d0');
        }
        spawnDust(b.tx, b.tz, 2.5, 3.5, false, b.owner);
      }
    }
    for (let i = dustPatches.length - 1; i >= 0; i--) {
      const p = dustPatches[i];
      p.t -= dt;
      if (lullabyOn(p.owner)) p.dream = true;
      p.disc.color.setHex(p.dream ? 0xc4b5fd : 0x86efac);
      p.disc.opacity = 0.32 * Math.min(1, p.t / 0.6);
      p.grp.children.forEach((c) => { if (c.userData.sparkle) c.position.y = 0.3 + Math.sin(performance.now() * 0.002 + c.userData.phase) * 0.3 + 0.5; });
      // Heal the Fairy and her allies standing inside (her own team's, whoever cast it); scales with the caster's Ability
      const po = p.owner;
      const pa = po || KitFx.player;
      const heal = H.fairy.dmg.dustHealPerSec(pa.stats(), pa.level()) * dt;
      if (!po && activeHeroId === 'fairy' && Math.hypot(hero.x - p.x, hero.z - p.z) <= p.r) {
        hero.hp = Math.min(hero.maxHp, hero.hp + heal);
      }
      if (po && po.unit.hp > 0 && Math.hypot(po.unit.x - p.x, po.unit.z - p.z) <= p.r) {
        po.unit.hp = Math.min(po.unit.maxHp, po.unit.hp + heal);
      }
      if (phase1Engine) {
        (po || KitFx.player).allies().forEach((a) => {
          const b = a.ref;
          if (b.hp > 0 && b.hp < b.maxHp && Math.hypot(a.x - p.x, a.z - p.z) <= p.r + (a.r || 0.5) * 0.5) {
            b.hp = Math.min(b.maxHp, b.hp + heal);
          }
        });
      }
      // Dreamdust: enemies inside fall asleep (stun stand-in; damage would wake them once sleep exists)
      if (p.dream) {
        p.sleepTick = (p.sleepTick || 0) - dt;
        if (p.sleepTick <= 0) {
          p.sleepTick = 0.5;
          KitFx.hitArea(p.x, p.z, p.r, 0, { stunDur: 2.0, color: '#c4b5fd', by: p.owner || KitFx.player });
        }
      }
      if (p.t <= 0) {
        scene.remove(p.grp);
        dustPatches.splice(i, 1);
      }
    }
  },

  // Hover + lean + wing flap (runs after the mixer each frame)
  postMixer() {
    const t = performance.now() * 0.001;
    const dt = Math.min(0.05, t - (hero.fairyLastT || t));
    hero.fairyLastT = t;
    const m = fairyMotion(hero, { dt, t, yaw: heroPivot.rotation.y, moving: isMovingNow, casting: hero.kickAnim > 0 || hero.punchAnim > 0, bone: (n) => KitFx.bone(n) });
    heroTiltNode.position.y += m.lift;
    heroTiltNode.rotation.x += m.pitch;
    heroTiltNode.rotation.z += m.roll;
    heroTiltNode.rotation.y += m.yawWobble;
    if (!wings) wings = makeWings();
    const spine = KitFx.bone('Spine2');
    if (spine) {
      wings.visible = true;
      KitFx.placeAtBone(wings, 'Spine2', { x: 0, y: 0.05, z: -0.16 }, { x: isMovingNow ? 0.3 : 0.05, y: 0, z: 0 });
      const flap = Math.sin(m.flapPh) * 0.45;
      wings.children.forEach((w) => { w.rotation.y = w.userData.side * (0.35 + flap); });
    }
  },

  // Bots: the same hover, lean and limb flutter on the bot's own skeleton, plus wings on its back
  botVisual(b, dt, info) {
    if (!b.model || !b.baseModelPos || !b.bones) return;
    const t = performance.now() * 0.001;
    const casting = (b.atkAnimTimer || 0) > 0;
    const m = fairyMotion(b, { dt, t, yaw: b.facing || 0, moving: !!(info && info.moving), casting, bone: (n) => b.bones[n] });
    b.model.position.y = b.baseModelPos.y + m.lift;
    b.model.rotation.set(m.pitch, m.yawWobble, m.roll);
    if (!b.fairyWings) {
      b.fairyWings = makeWings();
      scene.remove(b.fairyWings);
      b.pivot.add(b.fairyWings);
    }
    const sp = b.bones.Spine2;
    if (sp) {
      if (!_wv) _wv = new THREE.Vector3();
      b.model.updateMatrixWorld(true);
      sp.getWorldPosition(_wv);
      b.pivot.worldToLocal(_wv);
      b.fairyWings.position.set(_wv.x, _wv.y + 0.05, _wv.z - 0.16);
      b.fairyWings.rotation.set(m.pitch + (info && info.moving ? 0.3 : 0.05), 0, m.roll);
    }
    const flap = Math.sin(m.flapPh) * 0.45;
    b.fairyWings.children.forEach((w) => { w.rotation.y = w.userData.side * (0.35 + flap); });
  },

  onSwitchedAway() {
    if (wings) wings.visible = false;
  },

  hudTag() {
    return hero.hopCharges !== undefined && hero.hopCharges < 2 ? ' [HOP ' + hero.hopCharges + '/2]' : '';
  },
  passivePip() { return ''; }
};
})();
