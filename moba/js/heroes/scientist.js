// Saw Scientist: Jungle • Reckless mad-surgeon brawler. See DESIGN_RULES.md.
// First playable pass: real model + clips + saw gun prop, stand-in versions of the designed kit
// (stab LMB, Rev the Saw toggle channel, Adrenal Injection, Boomerang Blade out-and-back with a pull).
// Saw Fuel isn't built yet: Q drains mana as a stand-in. Talents are placeholders until the talent pass.
(function () {
'use strict';
const H = (window.MOBA_HEROES = window.MOBA_HEROES || {});

let sawGun = null;          // world-space prop following the right hand
let sawGunLoading = false;
let blade = null;           // R boomerang blade { mesh, out, t, sx, sz, ang, hitOut:Set, hitBack:Set, dmg }
let sawTick = 0;

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

  spec: {
    id: 'scientist',
    name: 'Saw Scientist',
    role: 'Jungle • Reckless Saw Brawler',
    glyph: 'W',
    color: '#10b981',
    height: 1.9,
    baseHp: 1460, hpGrow: 120,
    baseMp: 310, mpGrow: 26, mpRegen: 5.0,
    baseAtk: 50, atkGrow: 5.5,
    baseFant: 30, fantGrow: 4.0,
    baseArmor: 23, armorGrow: 3.0,
    baseFResist: 22, fResistGrow: 2.5,
    baseSpd: 6.1,
    atkCd: 0.9,
    mpCosts: { Q: 10, E: 0, R: 70 }
  },

  talents: {
    3: { L: { id: '3L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '3R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } },
    7: { L: { id: '7L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '7R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } },
    10: { L: { id: '10L', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' }, R: { id: '10R', name: 'TBD (talent pass)', desc: 'Placeholder until the roster-wide talent pass' } }
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
      P: { title: 'Passive • Saw Fuel', meta: 'Unique Resource (coming soon)', body: 'Will replace mana: fuel charges when he <b>takes damage</b> or lands basic attacks, and refills slowly while the saw is off. For now the saw drains mana.' },
      LMB: { title: 'LMB • Surgical Strike', meta: '0 MP • 0.90s Base ATK', body: 'A close-range stab for <b>Attack damage</b>.' },
      Q: { title: 'Q • Rev the Saw', meta: 'Toggle • drains MP/s', body: 'Rev the saw in front of him: it hits a short frontal cone every 0.35s for <b>Ability damage</b>. He moves 25% slower and can\'t basic attack while it runs. Shuts off when out of mana or toggled off.' },
      E: { title: 'E • Adrenal Injection', meta: 'Costs HP • 10s CD', body: 'Inject: <b>lose 6% of current HP</b>, gain a burst of move speed, and heal back <b>more than you lost</b> over 4s.' },
      R: { title: 'R • Boomerang Blade', meta: '70 MP • 40s CD (Lv 4)', body: 'Hurl the sawblade out and back: damages and <b>slows</b> going out, then damages and <b>pulls</b> enemies toward him on the return. The saw can\'t rev while the blade is away.' }
    }
  },

  parseBundle(bundle, tmpl) {
    return parseMixamoBundle(bundle, tmpl, H.scientist.bundleClips);
  },

  // Movement clips: walk with the saw revved, run otherwise
  locomotion() {
    return hero.sawOn ? { idle: 'crawl', move: 'crawl' } : null;
  },
  speedMult() {
    return hero.sawOn ? 0.75 : 1;
  },

  onBasicAttack(st) {
    if (hero.sawOn) return; // the saw is busy
    hero.atkTimer = 0.9 / (1 + st.asPct);
    hero.punchAnim = 0.34;
    if (actions.punch) fadeToAction(actions.punch, 0.05, true, 2.0, 0.3);
    pendingStrike = { isKick: false, facing: hero.facing, t: 0.16 };
  },

  onStrikeImpact(strike, ctx) {
    const dmg = Math.round(ctx.st.atk * 1.0);
    KitFx.hitCone(2.1, 0.7, dmg, { isBasic: true, color: '#fb7185' });
  },

  cast(slot, ctx) {
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
      if (!trySpendMana('Q')) return;
      hero.sawOn = true;
      sawTick = 0;
      SFX.play('arena');
      spawnFloat(hero.x, 2.6, hero.z, 'BZZZZT!', '#4ade80');
    } else if (slot === 'E') {
      if (!wtfMode && hero.cdE > 0) return;
      hero.cdE = wtfMode ? 0.3 : 10 * cdrMult;
      const cost = Math.round(hero.hp * 0.06);
      hero.hp = Math.max(1, hero.hp - cost);
      spawnFloat(hero.x, 2.4, hero.z, '-' + cost, '#fb7185');
      hero.injectTimer = 4.0;
      hero.injectHealPerSec = (cost * 1.6 + 30 + [0, 20, 40][rQE]) / 4.0;
      hero.eSpeedBuffTimer = 2.0; // shared +25% move speed buff
      hero.kickAnim = 0.4;
      if (actions.kick) fadeToAction(actions.kick, 0.06, true, 2.2, 0.6);
      SFX.play('chime');
      spawnShockRing(hero.x, hero.z, 0x4ade80, 0.2, 1.2, 0.3);
    } else if (slot === 'R') {
      if (!wtfMode && pProg.level < 4) {
        spawnFloat(hero.x, 2.6, hero.z, 'ULTIMATE UNLOCKS AT LEVEL 4!', '#fb7185');
        return;
      }
      if (!wtfMode && hero.cdR > 0) return;
      if (blade) return;
      if (!trySpendMana('R')) return;
      hero.cdR = wtfMode ? 0.5 : 40 * cdrMult;
      hero.sawOn = false;
      hero.kickAnim = 0.45;
      if (actions.slide) fadeToAction(actions.slide, 0.06, true, 1.8, 0.5);
      const mesh = makeBladeMesh();
      scene.add(mesh);
      blade = {
        mesh, out: true, t: 0, sx: hero.x, sz: hero.z, ang: hero.facing, range: 11, spd: 16,
        hitOut: new Set(), hitBack: new Set(), dmg: Math.round([120, 170, 220][Math.min(2, (pProg.level || 1) >= 12 ? 2 : (pProg.level || 1) >= 8 ? 1 : 0)] + st.atk * 0.6)
      };
      SFX.play('dash');
    }
  },

  tickTimers(dt) {
    if (hero.injectTimer > 0) {
      hero.injectTimer -= dt;
      if (activeHeroId === 'scientist') hero.hp = Math.min(hero.maxHp, hero.hp + (hero.injectHealPerSec || 0) * dt);
    }
    if (activeHeroId !== 'scientist') { hero.sawOn = false; return; }
    if (hero.sawOn) {
      hero.mp = Math.max(0, hero.mp - 9 * dt);
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
        const dmg = Math.round(14 + (st.atk || 0) * 0.18 + (st.fant || 0) * 0.2);
        const hits = KitFx.hitCone(2.5, 0.55, dmg, { dmgType: 'fantasy', color: '#4ade80' });
        if (hits > 0) SFX.play('punch');
      }
    }
  },

  updateWorld(dt) {
    if (!blade) return;
    const b = blade;
    b.t += dt;
    const sx = Math.sin(b.ang), sz = Math.cos(b.ang);
    let x, z;
    if (b.out) {
      const d = Math.min(b.range, b.t * b.spd);
      x = b.sx + sx * d; z = b.sz + sz * d;
      if (d >= b.range) { b.out = false; b.t = 0; b.turnX = x; b.turnZ = z; }
    } else {
      // return toward the scientist's current position
      const tx = hero.x, tz = hero.z;
      const cx = b.mesh.position.x, cz = b.mesh.position.z;
      const dd = Math.hypot(tx - cx, tz - cz);
      if (dd < 0.8 || b.t > 2.5) {
        scene.remove(b.mesh);
        blade = null;
        return;
      }
      x = cx + ((tx - cx) / dd) * b.spd * 1.1 * dt;
      z = cz + ((tz - cz) / dd) * b.spd * 1.1 * dt;
    }
    b.mesh.position.set(x, 1.2, z);
    b.mesh.rotation.y += dt * 22;
    // hits: once per target per leg (out: slow; back: pull toward him)
    const set = b.out ? b.hitOut : b.hitBack;
    const hitOne = (key, fn) => { if (!set.has(key)) { set.add(key); fn(); } };
    dummies.forEach((d) => {
      if (d.isShooter && !shooterEnabled) return;
      if (Math.hypot(d.x - x, d.z - z) <= 0.9 + d.r) hitOne('d' + d.id, () => {
        damageDummy(d, b.dmg, '#4ade80');
        if (b.out) d.slowTimer = Math.max(d.slowTimer || 0, 1.5);
        else KitFx.knockDummy(d, hero.x - d.x, hero.z - d.z, Math.min(4, Math.hypot(hero.x - d.x, hero.z - d.z) - 1.2));
      });
    });
    if (phase1Engine) {
      phase1Engine.getHostileTargets().forEach((t, j) => {
        if (t.kind === 'structure') return;
        if (Math.hypot(t.x - x, t.z - z) <= 0.9 + (t.r || 0.5)) hitOne(t.kind + (t.ref && t.ref.id || j), () => {
          const opts = { dmgType: 'physical', color: '#4ade80' };
          if (b.out) opts.slowDur = 1.5;
          else {
            opts.knockbackDist = Math.max(0, Math.min(4, Math.hypot(hero.x - t.x, hero.z - t.z) - 1.2));
            opts.knockbackDirX = hero.x - t.x;
            opts.knockbackDirZ = hero.z - t.z;
          }
          phase1Engine.dealPlayerDamageToUnit(t, b.dmg, opts);
        });
      });
    }
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
    return true;
  },

  onSwitchedAway() {
    if (sawGun) sawGun.visible = false;
    hero.sawOn = false;
  },

  hudTag() { return hero.sawOn ? ' [SAW]' : ''; },
  passivePip() { return ''; },
  qEmpowered() { return !!hero.sawOn; }
};
})();
