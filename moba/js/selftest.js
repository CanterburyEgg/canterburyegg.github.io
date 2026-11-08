// MOBA refactor safety net.
// Open arena3d.html?selftest (all heroes) or arena3d.html?selftest=panther (one hero).
// For every hero x config x ability it casts at the training dummies and records
// damage dealt, hit count, cooldown set, and mana spent, then diffs against a saved baseline.
// Only talks to window.__MOBA_TEST (defined in arena3d.html) so this file never needs to change.
(function () {
  'use strict';
  const T = window.__MOBA_TEST;
  if (!T || !T.api) return;
  const A = T.api;
  const eng = A.getEngine();
  const hero = A.hero;
  const STORAGE_KEY = 'mobaSelftestBaseline_v1';

  const ALL_HEROES = ['coyote', 'brawler', 'sorceress', 'bodyguard', 'panther'];
  const RANGED = { coyote: true, sorceress: true };
  const CONFIGS = [
    { name: 'Lv1', level: 1, talents: {} },
    { name: 'Lv12-L', level: 12, talents: { 3: 'L', 7: 'L', 10: 'L' } },
    { name: 'Lv12-R', level: 12, talents: { 3: 'R', 7: 'R', 10: 'R' } }
  ];
  const SLOTS = ['LMB', 'Q', 'Q>LMB', 'E', 'R'];

  const param = new URLSearchParams(location.search).get('selftest');
  const heroes = param && ALL_HEROES.includes(param) ? [param] : ALL_HEROES;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const target = A.dummies[1] || A.dummies[0];

  // ---- Freeze the match so nothing but the player's casts changes state ----
  if (eng) eng.update = function () {};

  let dummyEvents = [];
  let unitEvents = [];
  let lastEventAt = 0;
  T.onDummyDamage = (d, dmg) => { dummyEvents.push(dmg); lastEventAt = performance.now(); };
  if (eng && eng.dealPlayerDamageToUnit) {
    const orig = eng.dealPlayerDamageToUnit;
    eng.dealPlayerDamageToUnit = function (t, dmg) {
      unitEvents.push(Math.round(dmg || 0));
      lastEventAt = performance.now();
      return orig.apply(this, arguments);
    };
  }

  // ---- UI ----
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;max-width:640px;max-height:86vh;overflow:auto;' +
    'background:rgba(10,14,20,0.95);color:#e2e8f0;font:12px/1.4 ui-monospace,Menlo,monospace;padding:12px;border:1px solid #fbbf24;border-radius:8px;';
  panel.innerHTML = '<b style="color:#fbbf24">SELFTEST</b> <span id="st-status">starting… keep this tab visible, do not touch mouse/keyboard</span><pre id="st-out" style="white-space:pre-wrap;margin:8px 0 0"></pre>';
  document.body.appendChild(panel);
  const statusEl = panel.querySelector('#st-status');
  const outEl = panel.querySelector('#st-out');

  function resetStage(heroId) {
    if (A.endLingeringZones) A.endLingeringZones();
    A.dummies.forEach((d) => {
      d.x = d.homeX; d.z = d.homeZ;
      if (d.mesh) d.mesh.position.set(d.x, 0, d.z);
      d.hp = d.maxHp;
      d.stunTimer = 0; d.slowTimer = 0;
      d.kbVx = 0; d.kbVz = 0; d.kbTimer = 0; d.kbWallStun = false; d.resetDelay = 0;
      d.siphoned = 0; d.siphonTimer = 0;
      d.bleedStacks = 0; d.bleedTimer = 0; d.bleedTickTimer = 0;
      d.predatorMarks = 0; d.predatorMarkTimer = 0;
      if (d.bleedPips) d.bleedPips.forEach((p) => { p.visible = false; });
    });
    const st = eng ? eng.getPlayerStats() : null;
    if (st) { hero.maxHp = st.maxHp; hero.maxMp = st.maxMp; }
    hero.hp = hero.maxHp; hero.mp = hero.maxMp;
    hero.shield = 0; hero.shieldTimer = 0; hero.rShieldTimer = 0; hero.peakPhysiqueTimer = 0;
    hero.atkTimer = 0; hero.cdQ = 0; hero.cdE = 0; hero.cdR = 0;
    hero.qArmed = false; hero.eRecast = 0; hero.dashTimer = 0; hero.dashKind = null; hero.dashHit = false;
    hero.punchAnim = 0; hero.kickAnim = 0; hero.grenadeAnim = 0; hero.rChargeTimer = 0;
    hero.siphonBonus = 0; hero.basicCombo = 0; hero.comboResetTimer = 0;
    hero.qTempoStacks = 0; hero.qTempoTimer = 0; hero.eSpeedBuffTimer = 0; hero.leapTimer = 0;
    hero.stealthTimer = 0; hero.stealthExitTimer = 0; hero.unseenLingerTimer = 0;
    hero.qFlurryRemaining = 0; hero.qFlurryTimer = 0; hero.gnashAnim = 0;
    const dist = RANGED[heroId] ? 6.0 : 1.6;
    hero.x = target.homeX; hero.z = target.homeZ + dist;
    hero.facing = Math.PI; // facing -z toward the dummy
    T.aim = { x: target.homeX, z: target.homeZ };
  }

  async function waitQuiet(startAt, minMs, maxMs) {
    for (;;) {
      await sleep(100);
      const now = performance.now();
      const bleeding = A.dummies.some((d) => (d.bleedStacks || 0) > 0);
      const quiet = now - Math.max(startAt, lastEventAt) >= 900;
      if (now - startAt >= minMs && quiet && !bleeding && !A.isBusy()) return false;
      if (now - startAt >= maxMs) return true;
    }
  }

  async function measure(heroId, slot) {
    resetStage(heroId);
    await sleep(250); // let one or two frames apply aim + position
    dummyEvents = []; unitEvents = [];
    const startAt = performance.now();
    const mp0 = hero.mp;
    let cd = 0;
    if (slot === 'LMB') { A.tryAttack(); cd = hero.atkTimer; }
    else if (slot === 'Q>LMB') { A.castKey('Q'); cd = hero.cdQ; }
    else { A.castKey(slot); cd = hero['cd' + slot]; }
    const mp = Math.round(mp0 - hero.mp);
    if (slot === 'Q>LMB') {
      await sleep(350);
      hero.atkTimer = 0;
      A.tryAttack();
    }
    const timedOut = await waitQuiet(startAt, 1200, 12000);
    const dmg = dummyEvents.reduce((a, b) => a + b, 0);
    const unit = unitEvents.reduce((a, b) => a + b, 0);
    return 'dmg=' + dmg + ' hits=' + dummyEvents.length + ' unit=' + unit +
      ' cd=' + (cd || 0).toFixed(2) + ' mp=' + mp + (timedOut ? ' TIMEOUT' : '');
  }

  async function run() {
    const results = {};
    const total = heroes.length * CONFIGS.length * SLOTS.length;
    let n = 0;
    for (const heroId of heroes) {
      A.switchHero(heroId);
      await sleep(400);
      for (const cfg of CONFIGS) {
        const prog = eng ? eng.getPlayerProg() : null;
        if (prog) {
          prog.level = cfg.level;
          Object.keys(prog.talents).forEach((k) => { prog.talents[k] = null; });
          Object.assign(prog.talents, cfg.talents);
        }
        for (const slot of SLOTS) {
          n++;
          statusEl.textContent = 'running ' + n + '/' + total + ': ' + heroId + ' ' + cfg.name + ' ' + slot + ' (keep tab visible, hands off)';
          results[heroId + ' | ' + cfg.name + ' | ' + slot] = await measure(heroId, slot);
        }
      }
    }
    T.aim = null;
    T.onDummyDamage = null;
    report(results);
  }

  function report(results) {
    let baseline = null;
    try { baseline = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { baseline = null; }
    const lines = [];
    let diffs = 0;
    let compared = 0;
    Object.keys(results).forEach((k) => {
      const v = results[k];
      if (baseline && baseline[k] !== undefined) {
        compared++;
        if (baseline[k] === v) lines.push('OK   ' + k + '  ' + v);
        else { diffs++; lines.push('DIFF ' + k + '\n       was ' + baseline[k] + '\n       now ' + v); }
      } else {
        lines.push('     ' + k + '  ' + v);
      }
    });
    const summary = baseline
      ? (diffs === 0 ? 'ALL ' + compared + ' ROWS MATCH BASELINE' : diffs + ' of ' + compared + ' ROWS DIFFER FROM BASELINE')
      : 'NO BASELINE SAVED YET';
    statusEl.textContent = 'done: ' + summary;
    statusEl.style.color = baseline ? (diffs === 0 ? '#4ade80' : '#fb7185') : '#fde047';
    const text = summary + '\n' + lines.join('\n');
    outEl.textContent = text;
    console.log('[SELFTEST]\n' + text);

    const bar = document.createElement('div');
    bar.style.cssText = 'margin-top:8px;display:flex;gap:8px;';
    const mkBtn = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'background:#1e293b;color:#fde047;border:1px solid #fbbf24;border-radius:4px;padding:4px 8px;cursor:pointer;';
      b.onclick = fn;
      bar.appendChild(b);
    };
    mkBtn('Save as baseline', () => {
      const merged = Object.assign({}, baseline || {}, results);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      statusEl.textContent = 'baseline saved (' + Object.keys(merged).length + ' rows)';
      statusEl.style.color = '#4ade80';
    });
    mkBtn('Copy results', () => {
      if (navigator.clipboard) navigator.clipboard.writeText(text);
    });
    mkBtn('Close', () => panel.remove());
    panel.appendChild(bar);
  }

  run();
})();
