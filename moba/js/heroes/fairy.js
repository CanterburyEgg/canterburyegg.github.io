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
const dustPatches = [];  // { grp, x, z, r, t, dream }
let pendingBubble = null; // { mesh, sx, sz, tx, tz, t, dur, dmg }
let lullabyTimer = 0;
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
  g.userData.isFairyWings = true;
  scene.add(g);
  return g;
}

function nearestUnitTo(x, z, maxDist, includeAllies) {
  let best = null, bestD = maxDist;
  dummies.forEach((d) => {
    if (d.isShooter && !shooterEnabled) return;
    const dd = Math.hypot(d.x - x, d.z - z);
    if (dd < bestD) { bestD = dd; best = { x: d.x, z: d.z, enemy: true, dummy: d }; }
  });
  if (phase1Engine) {
    phase1Engine.getHostileTargets().forEach((t) => {
      if (t.kind === 'structure') return;
      const dd = Math.hypot(t.x - x, t.z - z);
      if (dd < bestD) { bestD = dd; best = { x: t.x, z: t.z, enemy: true, unit: t }; }
    });
    if (includeAllies && phase1Engine.getAlliedTargets) {
      phase1Engine.getAlliedTargets().forEach((t) => {
        const dd = Math.hypot(t.x - x, t.z - z);
        if (dd < bestD) { bestD = dd; best = { x: t.x, z: t.z, enemy: false, unit: t }; }
      });
    }
  }
  return best;
}

function spawnDust(x, z, r, life) {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(r, 32),
    new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0.22, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  grp.add(disc);
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xfef9c3 }));
    const a = Math.random() * Math.PI * 2, rr = Math.random() * r;
    s.position.set(Math.cos(a) * rr, 0.2 + Math.random() * 1.0, Math.sin(a) * rr);
    s.userData.phase = Math.random() * 6;
    grp.add(s);
  }
  grp.position.set(x, 0, z);
  scene.add(grp);
  dustPatches.push({ grp, disc, x, z, r, t: life, life, dream: lullabyTimer > 0 });
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
      slide: { from: 'idle', bones: /^(Hips|LeftUpLeg|LeftLeg|LeftFoot|LeftToeBase|RightUpLeg|RightLeg|RightFoot|RightToeBase)$/ }
    }
  },

  spec: {
    id: 'fairy',
    name: 'Little Fairy',
    role: 'Support • Ranged Enchanter',
    glyph: 'F',
    color: '#34d399',
    height: 1.55,
    baseHp: 1080, hpGrow: 88,
    baseMp: 440, mpGrow: 40, mpRegen: 7.5,
    baseAtk: 30, atkGrow: 1.8,
    baseFant: 40, fantGrow: 5.6,
    baseArmor: 14, armorGrow: 2.0,
    baseFResist: 24, fResistGrow: 2.4,
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
    height: 1.55,
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
      P: { title: 'Passive • Fairy Dust', meta: 'Innate Heal Zones', body: 'Every <b>Q</b> pop leaves a patch of Fairy Dust for 3.5s that <b>heals allies standing inside</b>. During <b>R</b> it becomes Dreamdust.' },
      LMB: { title: 'LMB • Glimmer Dart', meta: '0 MP • 0.86s Base ATK', body: 'A light ranged poke for <b>Attack damage</b>.' },
      Q: { title: 'Q • Pop! Bubble', meta: '50 MP • 6.5s CD', body: 'Lob a slow bubble to a spot. It pops over an area: enemies take <b>Ability damage + a 2s slow</b>, allies get a <b>shield</b>, and it leaves Fairy Dust.' },
      E: { title: 'E • Pixie Hop', meta: '30 MP • 2 charges (10s each)', body: 'Blink to the <b>unit nearest the cursor</b> within 7m (enemy: minor damage + a brief silence; ally: reposition). Can\'t hop to the same unit until that charge recharges.' },
      R: { title: 'R • Lullaby', meta: '100 MP • 48s CD (Lv 4)', body: 'Twirl and burst a <b>4m Dreamdust ring</b>. For 10s all her dust is Dreamdust: enemies inside <b>fall asleep for 2s</b>.' }
    }
  },

  parseBundle(bundle, tmpl) {
    return parseMixamoBundle(bundle, tmpl, H.fairy.bundleClips);
  },

  // LMB Glimmer Dart (Pointing clip, a quick flick)
  onRangedAttack(st) {
    hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
    hero.atkTimer = 0.86 / (1 + st.asPct);
    hero.punchAnim = 0.32;
    if (actions.punch) fadeToAction(actions.punch, 0.05, true, 1.9, 0.35);
    const dmg = Math.round(st.atk * 1.0);
    const facing = hero.facing;
    setTimeout(() => {
      if (activeHeroId !== 'fairy') return;
      SFX.play('chime');
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0xbbf7d0 }));
      KitFx.spawnBolt(facing, dmg, { mesh: m, speed: 20, life: 0.5, y: 1.3 + HOVER, dmgType: 'physical' });
    }, 160);
  },

  cast(slot, ctx) {
    const { st, cdrMult, rQE, pProg } = ctx;
    if (slot === 'Q') {
      if (!wtfMode && hero.cdQ > 0) return;
      if (!trySpendMana('Q')) return;
      hero.cdQ = wtfMode ? 0.3 : 6.5 * cdrMult;
      hero.kickAnim = 0.5;
      if (actions.kick) fadeToAction(actions.kick, 0.06, true, 1.8, 0.4);
      const dx = aimWorld.x - hero.x, dz = aimWorld.z - hero.z;
      const dist = Math.min(9, Math.hypot(dx, dz) || 0.01);
      const ang = Math.atan2(dx, dz);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 18, 14),
        new THREE.MeshBasicMaterial({ color: 0xa7f3d0, transparent: true, opacity: 0.45, depthWrite: false })
      );
      scene.add(mesh);
      pendingBubble = {
        mesh, sx: hero.x, sz: hero.z, tx: hero.x + Math.sin(ang) * dist, tz: hero.z + Math.cos(ang) * dist,
        t: 0, dur: 0.6, dmg: Math.round([60, 90, 120][rQE] + (st.fant || 0) * 0.6)
      };
      SFX.play('chime');
    } else if (slot === 'E') {
      hero.hopCharges = hero.hopCharges === undefined ? 2 : hero.hopCharges;
      if (!wtfMode && hero.hopCharges <= 0) return;
      const target = nearestUnitTo(aimWorld.x, aimWorld.z, 3.0, true);
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
      SFX.play('dash');
      if (target.enemy) {
        const dmg = Math.round(30 + (st.fant || 0) * 0.3);
        if (target.dummy) {
          damageDummy(target.dummy, dmg, '#86efac');
        } else if (target.unit && phase1Engine) {
          phase1Engine.dealPlayerDamageToUnit(target.unit, dmg, { dmgType: 'fantasy', stunDur: 0.4, color: '#86efac' });
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
      hero.kickAnim = 0.9;
      if (actions.slide) fadeToAction(actions.slide, 0.08, true, 1.6, 0.6);
      lullabyTimer = 10;
      dustPatches.forEach((p) => { p.dream = true; });
      spawnDust(hero.x, hero.z, 4.0, 10);
      spawnShockRing(hero.x, hero.z, 0xc4b5fd, 0.4, 4.2, 0.5);
      spawnFloat(hero.x, 3.0, hero.z, 'LULLABY!', '#c4b5fd');
      SFX.play('arena');
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

  updateWorld(dt) {
    if (pendingBubble) {
      const b = pendingBubble;
      b.t += dt;
      const u = Math.min(1, b.t / b.dur);
      b.mesh.position.set(b.sx + (b.tx - b.sx) * u, 1.6 + Math.sin(u * Math.PI) * 2.2, b.sz + (b.tz - b.sz) * u);
      if (u >= 1) {
        scene.remove(b.mesh);
        pendingBubble = null;
        SFX.play('chime');
        spawnShockRing(b.tx, b.tz, 0xa7f3d0, 0.3, 2.6, 0.3);
        KitFx.hitArea(b.tx, b.tz, 2.5, b.dmg, { dmgType: 'fantasy', slowDur: 2.0, color: '#a7f3d0' });
        if (Math.hypot(hero.x - b.tx, hero.z - b.tz) <= 2.5) {
          hero.shield = Math.max(hero.shield || 0, 90);
          hero.shieldTimer = 3.0;
          spawnFloat(hero.x, 2.6, hero.z, 'BUBBLE SHIELD', '#a7f3d0');
        }
        spawnDust(b.tx, b.tz, 2.5, 3.5);
      }
    }
    for (let i = dustPatches.length - 1; i >= 0; i--) {
      const p = dustPatches[i];
      p.t -= dt;
      if (lullabyTimer > 0) p.dream = true;
      p.disc.material.color.setHex(p.dream ? 0xc4b5fd : 0x86efac);
      p.disc.material.opacity = 0.22 * Math.min(1, p.t / 0.6);
      p.grp.children.forEach((c, k) => { if (k > 0) c.position.y = 0.3 + Math.sin(performance.now() * 0.002 + c.userData.phase) * 0.3 + 0.5; });
      // Heal the Fairy (and later allies) standing inside
      if (activeHeroId === 'fairy' && Math.hypot(hero.x - p.x, hero.z - p.z) <= p.r) {
        hero.hp = Math.min(hero.maxHp, hero.hp + 18 * dt);
      }
      // Dreamdust: enemies inside fall asleep (stun stand-in; damage would wake them once sleep exists)
      if (p.dream) {
        p.sleepTick = (p.sleepTick || 0) - dt;
        if (p.sleepTick <= 0) {
          p.sleepTick = 0.5;
          KitFx.hitArea(p.x, p.z, p.r, 0, { stunDur: 2.0, color: '#c4b5fd' });
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
    heroTiltNode.position.y += HOVER + Math.sin(t * 2.4) * 0.08;
    heroTiltNode.rotation.x += isMovingNow ? 0.28 : 0.0;
    if (!wings) wings = makeWings();
    const spine = KitFx.bone('Spine2');
    if (spine) {
      wings.visible = true;
      KitFx.placeAtBone(wings, 'Spine2', { x: 0, y: 0.05, z: -0.16 }, { x: isMovingNow ? 0.3 : 0.05, y: 0, z: 0 });
      const flap = Math.sin(t * (isMovingNow ? 26 : 14)) * 0.45;
      wings.children.forEach((w) => { w.rotation.y = w.userData.side * (0.35 + flap); });
    }
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
