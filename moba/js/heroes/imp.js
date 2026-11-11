// Cannon Imp: Solo • Siege engineer + tinkerer pest. See DESIGN_RULES.md.
// First playable pass: real model + clips + cannon & wrench props, stand-in versions of the designed kit:
//  - Carrying: Box Idle arms (also layered over the run), cannon shots with code recoil.
//  - Q plants the cannon as a turret that shoots nearby enemies (no turret HP/scrap yet); Q near it picks it up.
//  - Unburdened: +22% move speed, wrench swings.
//  - E: rocket jump while carrying (frozen pose, cannon blasting downward) or a short hop while unburdened.
//  - R Superball: giant piercing cannonball from wherever the cannon is, knock-up (stun) on hit.
// Talents are placeholders until the talent pass.
(function () {
'use strict';
const H = (window.MOBA_HEROES = window.MOBA_HEROES || {});

const CARRY_SIZE = 1.05;   // cannon length while carried
const TURRET_SIZE = 2.1;   // full size when planted
let cannonCarry = null, cannonTurret = null, wrench = null, propsLoading = false;
let turret = null;         // { x, z, facing, shootCd }
let superball = null;      // { mesh, x, z, ang, dist, hit:Set, dmg }
let recoil = 0;            // 0..1 kick amount, decays
let pendingQ = null;       // { t, kind: 'plant'|'pickup' }

const UPPER_BODY = /^(Spine|Spine1|Spine2|Neck|Head|LeftShoulder|LeftArm|LeftForeArm|LeftHand|RightShoulder|RightArm|RightForeArm|RightHand)$/;

function carrying() { return !turret; }

function smoke(x, z, r) {
  spawnShockRing(x, z, 0xd6d3d1, 0.3, r, 0.45);
  spawnShockRing(x, z, 0x78716c, 0.2, r * 0.6, 0.35);
}

function stats() {
  return phase1Engine ? phase1Engine.getPlayerStats() : { atk: 55, fant: 0, asPct: 0 };
}

H.imp = {
  id: 'imp',
  roster: { order: 8, emoji: '💣', short: 'Imp' },
  bundle: { label: 'Cannon Imp', src: 'assets/imp/imp_bundle.js', globalKey: 'IMP_MIXAMO', pStart: 75, pEnd: 88 },
  bundleClips: { idle: 'idleFbxB64', run: 'runFbxB64', idleFree: 'idleFreeFbxB64', runFree: 'runFreeFbxB64', punch: 'punchFbxB64', kick: 'kickFbxB64', jump: 'jumpFbxB64' },
  moveSpeed: 5.9,
  hudSpeed: 322,
  pillLabels: { punch: 'Wrench', kick: 'Lift', dash: 'Jump', dashReady: () => true },
  // While carrying, his run keeps Box Idle's arms (cradling the cannon)
  clipTweaks: { overlay: { run: { from: 'idle', bones: UPPER_BODY } } },

  spec: {
    id: 'imp',
    name: 'Cannon Imp',
    role: 'Solo • Siege & Salvage Pest',
    glyph: 'K',
    color: '#fb923c',
    height: 1.35,
    baseHp: 1340, hpGrow: 110,
    baseMp: 310, mpGrow: 26, mpRegen: 5.0,
    baseAtk: 55, atkGrow: 6.0,
    baseFant: 20, fantGrow: 3.0,
    baseArmor: 20, armorGrow: 2.7,
    baseFResist: 20, fResistGrow: 2.2,
    baseSpd: 5.9,
    atkCd: 1.05,
    mpCosts: { Q: 20, E: 50, R: 85 }
  },

  talents: {
    3: { L: { id: '3L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '3R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } },
    7: { L: { id: '7L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '7R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } },
    10: { L: { id: '10L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '10R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } }
  },

  ui: {
    height: 1.35,
    modelLabel: 'Cannon Imp (Mixamo Rigged)',
    glyph: 'K',
    color: '#fb923c',
    name: 'Cannon Imp (3D)',
    role: 'Solo • Siege & Salvage Pest',
    passive: 'Two Forms',
    lmb: 'Siege Shot / Wrench',
    q: 'Anchor Turret',
    e: 'Blast Hop',
    r: 'Superball',
    banner: '<b>Q</b> Plant / pick up the cannon &bull; <b>E</b> Rocket jump (carrying) or hop &bull; <b>R</b> Superball &bull; <b>P</b> Shop',
    tooltips: {
      P: { title: 'Passive • Two Forms', meta: 'Carrying vs. Unburdened', body: 'Carrying: slow, long-range cannon shots. Unburdened: <b>+22% move speed</b> and fast wrench swings. (Coming: wrench hits repair your turret.)' },
      LMB: { title: 'LMB • Siege Shot / Wrench', meta: '0 MP • 1.05s Base ATK', body: 'Carrying: fire a cannonball for <b>Attack damage</b>. Unburdened: a quick wrench swing.' },
      Q: { title: 'Q • Anchor Turret', meta: '20 MP • 3s CD', body: 'Plant the cannon as a <b>turret</b> that fires at nearby enemies. Press Q next to it to pick it back up. (Coming: turret HP and scrap salvage.)' },
      E: { title: 'E • Blast Hop', meta: '50 MP • 8.5s CD', body: 'Carrying: the cannon blasts downward for a <b>long rocket jump</b>. Unburdened: a <b>short nimble hop</b>.' },
      R: { title: 'R • Superball', meta: '85 MP • 38s CD (Lv 4)', body: 'Fire a giant cannonball <b>from wherever the cannon is</b> (hands or turret). It pierces and <b>knocks up</b> everything it hits for 1.0s.' }
    }
  },

  parseBundle(bundle, tmpl) {
    return parseMixamoBundle(bundle, tmpl, H.imp.bundleClips);
  },

  locomotion() {
    return carrying() ? null : { idle: 'idleFree', move: 'runFree' };
  },
  speedMult() {
    return carrying() ? 1 : 1.22;
  },

  onBasicAttack(st) {
    hero.facing = Math.atan2(aimWorld.x - hero.x, aimWorld.z - hero.z);
    if (carrying()) {
      hero.atkTimer = 1.05 / (1 + st.asPct);
      hero.punchAnim = 0.25;
      recoil = 1;
      SFX.play('arena');
      const ang = hero.facing;
      const fx = hero.x + Math.sin(ang) * 0.9, fz = hero.z + Math.cos(ang) * 0.9;
      smoke(fx, fz, 0.9);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6, roughness: 0.4 }));
      KitFx.spawnBolt(ang, Math.round(st.atk * 1.15), { mesh: ball, speed: 15, life: 0.75, y: 1.0, fromX: fx, fromZ: fz });
    } else {
      hero.atkTimer = 0.7 / (1 + st.asPct);
      hero.punchAnim = 0.3;
      if (actions.punch) fadeToAction(actions.punch, 0.05, true, 2.2, 0.35);
      pendingStrike = { isKick: false, facing: hero.facing, t: 0.15 };
    }
  },

  onStrikeImpact(strike, ctx) {
    KitFx.hitCone(2.0, 0.8, Math.round(ctx.st.atk * 0.85), { isBasic: true, color: '#fb923c' });
  },

  cast(slot, ctx) {
    const { st, cdrMult, pProg } = ctx;
    if (slot === 'Q') {
      if (!wtfMode && hero.cdQ > 0) return;
      if (pendingQ) return;
      const lift = actions.kick;
      const dur = lift ? lift.getClip().duration : 1.2;
      if (carrying()) {
        if (!trySpendMana('Q')) return;
        hero.cdQ = wtfMode ? 0.3 : 3.0 * cdrMult;
        hero.kickAnim = 0.6;
        if (lift) fadeToAction(lift, 0.06, true, (dur * 0.5) / 0.6, dur * 0.5); // second half: set it down
        pendingQ = { t: 0.45, kind: 'plant', x: hero.x + Math.sin(hero.facing) * 1.6, z: hero.z + Math.cos(hero.facing) * 1.6, facing: hero.facing };
      } else {
        if (Math.hypot(hero.x - turret.x, hero.z - turret.z) > 3.2) {
          spawnFloat(hero.x, 2.6, hero.z, 'WALK BACK TO YOUR CANNON!', '#fb923c');
          return;
        }
        hero.cdQ = wtfMode ? 0.3 : 1.5;
        hero.facing = Math.atan2(turret.x - hero.x, turret.z - hero.z);
        hero.kickAnim = 0.6;
        if (lift) fadeToAction(lift, 0.06, true, (dur * 0.5) / 0.6, 0); // first half: heave it up
        pendingQ = { t: 0.5, kind: 'pickup' };
      }
    } else if (slot === 'E') {
      if (!wtfMode && hero.cdE > 0) return;
      if (!trySpendMana('E')) return;
      hero.cdE = wtfMode ? 0.4 : 8.5 * cdrMult;
      const longJump = carrying();
      const maxD = longJump ? 9.0 : 4.5;
      const dx = aimWorld.x - hero.x, dz = aimWorld.z - hero.z;
      const d = Math.min(maxD, Math.hypot(dx, dz) || 0.01);
      const ang = Math.atan2(dx, dz);
      hero.facing = ang;
      hero.leapSx = hero.x; hero.leapSz = hero.z;
      hero.leapTx = hero.x + Math.sin(ang) * d;
      hero.leapTz = hero.z + Math.cos(ang) * d;
      hero.leapDur = longJump ? 0.75 : 0.42;
      hero.leapHeight = longJump ? 3.2 : 1.2;
      hero.leapTimer = hero.leapDur;
      hero.impRocket = longJump;
      if (longJump) {
        smoke(hero.x, hero.z, 2.2);
        SFX.play('arena');
        if (actions.idle) fadeToAction(actions.idle, 0.05, false, 0); // frozen carry pose in the air
      } else {
        SFX.play('dash');
      }
    } else if (slot === 'R') {
      if (!wtfMode && pProg.level < 4) {
        spawnFloat(hero.x, 2.6, hero.z, 'ULTIMATE UNLOCKS AT LEVEL 4!', '#fb7185');
        return;
      }
      if (!wtfMode && hero.cdR > 0) return;
      if (!trySpendMana('R')) return;
      hero.cdR = wtfMode ? 0.5 : 38 * cdrMult;
      const from = carrying() ? { x: hero.x, z: hero.z } : { x: turret.x, z: turret.z };
      const ang = Math.atan2(aimWorld.x - from.x, aimWorld.z - from.z);
      if (!carrying()) turret.facing = ang;
      else recoil = 1.6;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14), new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.7, roughness: 0.35, emissive: 0x7c2d12, emissiveIntensity: 0.4 }));
      scene.add(mesh);
      const rUlt = (pProg.level || 1) >= 12 ? 2 : ((pProg.level || 1) >= 8 ? 1 : 0);
      superball = { mesh, x: from.x + Math.sin(ang) * 1.2, z: from.z + Math.cos(ang) * 1.2, ang, dist: 0, hit: new Set(), dmg: Math.round([180, 260, 340][rUlt] + st.atk * 0.9) };
      smoke(superball.x, superball.z, 2.0);
      SFX.play('arena');
      spawnFloat(from.x, 3.0, from.z, 'SUPERBALL!', '#fb923c');
    }
  },

  onLeapLand() {
    if (hero.impRocket) {
      smoke(hero.x, hero.z, 2.4);
      SFX.play('arena');
    } else {
      spawnShockRing(hero.x, hero.z, 0xd6b470, 0.2, 1.0, 0.25);
    }
    hero.impRocket = false;
    hero.leapHeight = undefined;
  },

  tickTimers(dt) {
    recoil = Math.max(0, recoil - dt * 6);
    if (pendingQ) {
      pendingQ.t -= dt;
      if (pendingQ.t <= 0) {
        const q = pendingQ;
        pendingQ = null;
        if (q.kind === 'plant') {
          turret = { x: q.x, z: q.z, facing: q.facing, shootCd: 0.8 };
          smoke(q.x, q.z, 2.2);
          SFX.play('block');
        } else {
          smoke(turret.x, turret.z, 1.4);
          turret = null;
          SFX.play('block');
        }
      }
    }
  },

  updateWorld(dt) {
    // Turret: fire at the nearest enemy within range
    if (turret && activeHeroId === 'imp') {
      turret.shootCd -= dt;
      let best = null, bestD = 8.5;
      dummies.forEach((d) => {
        if (d.isShooter && !shooterEnabled) return;
        const dd = Math.hypot(d.x - turret.x, d.z - turret.z);
        if (dd < bestD) { bestD = dd; best = d; }
      });
      if (phase1Engine) {
        phase1Engine.getHostileTargets().forEach((t) => {
          if (t.kind === 'structure') return;
          const dd = Math.hypot(t.x - turret.x, t.z - turret.z);
          if (dd < bestD) { bestD = dd; best = t; }
        });
      }
      if (best) {
        const want = Math.atan2(best.x - turret.x, best.z - turret.z);
        let df = want - turret.facing;
        while (df > Math.PI) df -= Math.PI * 2;
        while (df < -Math.PI) df += Math.PI * 2;
        turret.facing += Math.max(-dt * 6, Math.min(dt * 6, df));
        if (turret.shootCd <= 0 && Math.abs(df) < 0.25) {
          turret.shootCd = 1.4;
          turret.kick = 1;
          const st = stats();
          const fx = turret.x + Math.sin(turret.facing) * 1.3, fz = turret.z + Math.cos(turret.facing) * 1.3;
          smoke(fx, fz, 0.9);
          SFX.play('arena');
          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6, roughness: 0.4 }));
          KitFx.spawnBolt(turret.facing, Math.round(st.atk * 0.9), { mesh: ball, speed: 15, life: 0.75, y: 1.1, fromX: fx, fromZ: fz });
        }
      }
      turret.kick = Math.max(0, (turret.kick || 0) - dt * 5);
    }
    // Superball flight
    if (superball) {
      const b = superball;
      const step = 17 * dt;
      b.x += Math.sin(b.ang) * step;
      b.z += Math.cos(b.ang) * step;
      b.dist += step;
      b.mesh.position.set(b.x, 1.0, b.z);
      b.mesh.rotation.x += dt * 10;
      dummies.forEach((d) => {
        if (d.isShooter && !shooterEnabled) return;
        if (!b.hit.has('d' + d.id) && Math.hypot(d.x - b.x, d.z - b.z) <= 1.1 + d.r) {
          b.hit.add('d' + d.id);
          damageDummy(d, b.dmg, '#fb923c');
          d.stunTimer = Math.max(d.stunTimer, 1.0);
          spawnFloat(d.x, 2.8, d.z, 'KNOCKED UP!', '#fb923c');
        }
      });
      if (phase1Engine) {
        phase1Engine.getHostileTargets().forEach((t, j) => {
          if (t.kind === 'structure') return;
          const key = t.kind + (t.ref && t.ref.id || j);
          if (!b.hit.has(key) && Math.hypot(t.x - b.x, t.z - b.z) <= 1.1 + (t.r || 0.5)) {
            b.hit.add(key);
            phase1Engine.dealPlayerDamageToUnit(t, b.dmg, { dmgType: 'physical', stunDur: 1.0, color: '#fb923c' });
          }
        });
      }
      if (b.dist > 26) {
        scene.remove(b.mesh);
        superball = null;
      }
    }
  },

  // Cannon (carried / planted) and wrench props
  updateHandProps() {
    if (!(currentModel && rightHandBone)) return false;
    const src = window.IMP_MIXAMO;
    if (!propsLoading && src) {
      propsLoading = true;
      Promise.all([
        KitFx.loadPropGlb(src.cannonGlbB64, CARRY_SIZE),
        KitFx.loadPropGlb(src.cannonGlbB64, TURRET_SIZE),
        KitFx.loadPropGlb(src.wrenchGlbB64, 0.55)
      ]).then(([c1, c2, w]) => {
        cannonCarry = c1; cannonTurret = c2; wrench = w;
        [c1, c2, w].forEach((p) => p && scene.add(p));
      });
    }
    if (cannonCarry) {
      cannonCarry.visible = carrying() && !(pendingQ && pendingQ.kind === 'plant' && pendingQ.t < 0.15);
      if (cannonCarry.visible) {
        const kick = recoil * 0.12;
        // cradled across his chest, barrel forward; pointed straight down during the rocket jump
        const pitch = hero.impRocket ? -1.35 : 0.08;
        KitFx.placeAtBone(cannonCarry, 'Spine2', { x: 0.05, y: hero.impRocket ? -0.25 : -0.22, z: 0.32 - kick }, { x: pitch, y: -Math.PI / 2, z: 0 });
      }
    }
    if (cannonTurret) {
      cannonTurret.visible = !!turret && activeHeroId === 'imp';
      if (turret) {
        const kick = (turret.kick || 0) * 0.15;
        cannonTurret.position.set(turret.x - Math.sin(turret.facing) * kick, TURRET_SIZE * 0.36, turret.z - Math.cos(turret.facing) * kick);
        cannonTurret.rotation.set(0, turret.facing - Math.PI / 2, 0);
      }
    }
    if (wrench) {
      wrench.visible = !carrying();
      if (wrench.visible) KitFx.placeAtBone(wrench, 'RightHand', { x: 0, y: -0.02, z: 0.1 }, { x: -Math.PI / 2, y: 0, z: 0 });
    }
    // body recoil: a quick shove back along his facing
    if (recoil > 0) heroTiltNode.position.z -= recoil * 0.18;
    return true;
  },

  onSwitchedAway() {
    [cannonCarry, cannonTurret, wrench].forEach((p) => { if (p) p.visible = false; });
  },

  hudTag() { return carrying() ? ' [CARRYING]' : ' [UNBURDENED]'; },
  passivePip() { return carrying() ? '' : '+22%'; },
  qEmpowered() { return !carrying(); }
};
})();
