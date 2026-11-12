// Balance tool A: Damage Profile (fixed results, no randomness from bots).
// Open arena3d.html?profile (all heroes) or ?profile=coyote, plus optional
//   &levels=1,6,12   &build=standard|none|attack|ability|hybrid|tank|support   &resist=40   &dt=0.033   &norender
// For every hero x level it equips the test build (DATA.testBuildItems), casts each slot at a training dummy,
// and records raw damage + cooldown. From that it derives burst, 10s sustained damage per second (against the given
// Resist), effective HP, and an estimated time-to-kill grid between every pair of heroes (each hero's rotation
// damage timeline against the other's HP and average resist; no dodging, no defender damage, no healing).
// Mana is ignored; talents are off (placeholders until the talent pass); the match is frozen while it runs.
// Output: an on-screen panel, plus console lines 'PROFILE ROW <json>' and 'PROFILE MD <markdown line>', then 'PROFILE done'.
(function () {
  'use strict';
  const T = window.__MOBA_TEST;
  if (!T || !T.api) return;
  const A = T.api;
  const eng = A.getEngine();
  const hero = A.hero;
  const DATA = window.MOBA_PHASE1;

  const qs = new URLSearchParams(location.search);
  const allHeroes = Object.values(window.MOBA_HEROES || {}).filter((k) => k.spec)
    .sort((a, b) => ((a.roster && a.roster.order) || 99) - ((b.roster && b.roster.order) || 99)).map((k) => k.id);
  const pick = qs.get('profile');
  const heroes = pick && allHeroes.includes(pick) ? [pick] : allHeroes;
  const levels = (qs.get('levels') || '1,6,12').split(',').map(Number).filter((n) => n >= 1 && n <= 12);
  const build = qs.get('build') || 'standard';
  const RESIST = Number(qs.get('resist') || 40);
  T.dt = Number(qs.get('dt') || 1 / 30); // game step (1/60 = finest, slower)
  const RANGED = { coyote: true, sorceress: true, fairy: true, imp: true };
  const WINDOW = 10;       // sustained-damage window (s)
  const SLOT_MAX = 8;      // max game seconds to watch one cast (zones, turrets, toggles get cut off here)
  const ROT = 20;          // rotation length (s): autos + every ability as it comes off cooldown

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const gameNow = () => T.gameTime || 0;
  async function waitGame(sec) { const until = gameNow() + sec; while (gameNow() < until) await sleep(20); }
  const target = A.dummies[1] || A.dummies[0];

  // ---- freeze the match (bots, minions, towers) so only the hero's casts change anything ----
  const origUpdate = eng ? eng.update : null;
  const prog = eng ? eng.getPlayerProg() : null;
  const orig = prog ? { level: prog.level, talents: Object.assign({}, prog.talents), items: prog.items.slice() } : null;
  const origHeroId = A.getActiveHeroId();
  if (eng) eng.update = function () {};
  function restoreGame() {
    if (prog && orig) {
      prog.level = orig.level;
      Object.keys(prog.talents).forEach((k) => { prog.talents[k] = null; });
      Object.assign(prog.talents, orig.talents);
      prog.items.length = 0; orig.items.forEach((it) => prog.items.push(it));
    }
    A.switchHero(origHeroId);
    if (eng && origUpdate) eng.update = origUpdate;
  }

  let events = [];
  let lastEventAt = 0;
  let timeline = null;     // [{t, dmg}] during a rotation
  T.onDummyDamage = (d, dmg) => { events.push(dmg); lastEventAt = gameNow(); if (timeline) timeline.push({ t: gameNow(), dmg }); };

  // ---- UI ----
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;max-width:820px;max-height:86vh;overflow:auto;' +
    'background:rgba(10,14,20,0.95);color:#e2e8f0;font:12px/1.4 ui-monospace,Menlo,monospace;padding:12px;border:1px solid #38bdf8;border-radius:8px;';
  panel.innerHTML = '<b style="color:#38bdf8">DAMAGE PROFILE</b> <span id="pf-status">starting… keep this tab visible, hands off</span><pre id="pf-out" style="white-space:pre;margin:8px 0 0"></pre>';
  document.body.appendChild(panel);
  const statusEl = panel.querySelector('#pf-status');
  const outEl = panel.querySelector('#pf-out');

  function resetStage(heroId) {
    if (A.endLingeringZones) A.endLingeringZones();
    A.dummies.forEach((d) => {
      d.x = d.homeX; d.z = d.homeZ;
      if (d.mesh) d.mesh.position.set(d.x, 0, d.z);
      d.hp = d.maxHp = Math.max(d.maxHp, 999999); // never KO mid-measure
      d.stunTimer = 0; d.slowTimer = 0; d.kbVx = 0; d.kbVz = 0; d.kbTimer = 0; d.kbWallStun = false; d.resetDelay = 0;
      d.bleedStacks = 0; d.bleedTimer = 0; d.bleedTickTimer = 0; d.predatorMarks = 0; d.predatorMarkTimer = 0;
      if (d.bleedPips) d.bleedPips.forEach((p) => { p.visible = false; });
    });
    const st = eng ? eng.getPlayerStats() : null;
    if (st) { hero.maxHp = st.maxHp; hero.maxMp = st.maxMp; }
    hero.hp = hero.maxHp; hero.mp = hero.maxMp;
    hero.shield = 0; hero.atkTimer = 0; hero.cdQ = 0; hero.cdE = 0; hero.cdR = 0;
    hero.qArmed = false; hero.eRecast = 0; hero.dashTimer = 0; hero.leapTimer = 0; hero.rChargeTimer = 0;
    hero.stealthTimer = 0; hero.sawOn = false;
    delete hero.hopCharges;
    const dist = RANGED[heroId] ? 6.0 : 1.6;
    hero.x = target.homeX; hero.z = target.homeZ + dist;
    hero.facing = Math.PI;
    T.aim = { x: target.homeX, z: target.homeZ };
  }

  // stop anything a cast left running (planted turret, revving saw, ...) so it can't leak into the next row
  function cleanupKit(heroId) {
    const k = window.MOBA_HEROES[heroId];
    if (k && k.onSwitchedAway) k.onSwitchedAway();
  }

  async function waitQuiet(startAt) {
    for (;;) {
      await sleep(30);
      const now = gameNow();
      const bleeding = A.dummies.some((d) => (d.bleedStacks || 0) > 0);
      if (now - startAt >= 1.2 && now - Math.max(startAt, lastEventAt) >= 0.9 && !bleeding && !A.isBusy()) return false;
      if (now - startAt >= SLOT_MAX) return true;
    }
  }

  async function measure(heroId, slot) {
    resetStage(heroId);
    await waitGame(0.15);
    events = [];
    const startAt = gameNow();
    let cd = 0;
    if (slot === 'LMB') { A.tryAttack(); cd = hero.atkTimer; }
    else { A.castKey(slot); cd = hero['cd' + slot]; }
    const capped = await waitQuiet(startAt);
    cleanupKit(heroId);
    if (A.endLingeringZones) A.endLingeringZones();
    await waitGame(0.3);
    return { dmg: events.reduce((a, b) => a + b, 0), hits: events.length, cd: cd || 0, capped };
  }

  const mit = (raw, res) => raw * 100 / (100 + Math.max(0, res));

  // Rotation: for ROT seconds, cast every ability as it comes off cooldown (R, E, Q) and auto-attack in between, with
  // mana refilled. Melee heroes are walked back into reach between casts. Returns the damage timeline [{t, dmg}].
  const ROT_HINTS = {
    scientist: { qToggle: true },      // Q is a toggle: turn the saw on once and leave it running
    imp: { meleeAfterQ: true }         // after planting the turret he fights with the wrench (melee)
  };
  async function rotation(heroId, lvl) {
    resetStage(heroId);
    await waitGame(0.15);
    const hint = ROT_HINTS[heroId] || {};
    const k = window.MOBA_HEROES[heroId];
    timeline = [];
    const t0 = gameNow();
    let qUsed = false, lastPlace = 0;
    while (gameNow() - t0 < ROT) {
      await sleep(16);
      const now = gameNow();
      hero.mp = hero.maxMp;
      T.aim = { x: target.x, z: target.z };
      const busy = (hero.dashTimer || 0) > 0 || (hero.leapTimer || 0) > 0;
      // keep in reach: ranged at 6m, melee at 1.6m (the Imp turns melee once his cannon is planted)
      const melee = !RANGED[heroId] || (hint.meleeAfterQ && qUsed);
      const want = melee ? 1.6 : 6.0;
      const dNow = Math.hypot(hero.x - target.x, hero.z - target.z);
      if (!busy && now - lastPlace > 0.5 && Math.abs(dNow - want) > (melee ? 0.9 : 2.5)) {
        hero.x = target.x; hero.z = target.z + want; lastPlace = now;
      }
      if (busy) continue;
      if (lvl >= 4 && hero.cdR <= 0) A.castKey('R');
      if (hero.cdE <= 0) A.castKey('E');
      if (hero.cdQ <= 0 && !(hint.qToggle && hero.sawOn) && !(hint.meleeAfterQ && qUsed)) { A.castKey('Q'); qUsed = true; }
      if (hero.atkTimer <= 0) A.tryAttack();
    }
    const tl = timeline.map((e) => ({ t: e.t - t0, dmg: e.dmg }));
    timeline = null;
    cleanupKit(heroId);
    if (A.endLingeringZones) A.endLingeringZones();
    await waitGame(0.5);
    return tl;
  }

  // seconds until a timeline's damage (mitigated by res) reaches hp
  function ttkFromTimeline(tl, hp, res) {
    let dealt = 0;
    for (const e of tl) {
      dealt += mit(e.dmg, res);
      if (dealt >= hp) return e.t;
    }
    return Infinity;
  }

  async function run() {
    const rows = [];
    const total = heroes.length * levels.length;
    let n = 0;
    for (const heroId of heroes) {
      A.switchHero(heroId);
      await waitGame(0.4);
      for (const lvl of levels) {
        n++;
        statusEl.textContent = 'running ' + n + '/' + total + ': ' + heroId + ' Lv' + lvl + ' (' + build + ')';
        prog.level = lvl;
        Object.keys(prog.talents).forEach((k) => { prog.talents[k] = null; });
        prog.items.length = 0;
        DATA.testBuildItems(heroId, lvl, build).forEach((it) => prog.items.push(it));
        const st = eng.getPlayerStats();
        const row = { hero: heroId, level: lvl, build, items: prog.items.map((it) => it.id), maxHp: st.maxHp, armor: st.armor, fResist: st.fResist, atk: st.atk, fant: st.fant };
        for (const slot of ['LMB', 'Q', 'E', 'R']) {
          if (slot === 'R' && lvl < 4) { row.R = { dmg: 0, hits: 0, cd: 0, capped: false }; continue; }
          row[slot] = await measure(heroId, slot);
        }
        const tl = await rotation(heroId, lvl);
        row.timeline = tl;
        const sumTo = (sec) => tl.filter((e) => e.t <= sec).reduce((x, e) => x + e.dmg, 0);
        row.burst = Math.round(mit(sumTo(3), RESIST));            // first 3s of the rotation
        row.dps10 = Math.round(mit(sumTo(10), RESIST) / 10);       // first 10s of the rotation
        row.dpsLate = Math.round(mit(sumTo(20) - sumTo(10), RESIST) / 10); // seconds 10-20 (after the opening burst)
        row.ehpAtk = Math.round(st.maxHp * (1 + st.armor / 100));
        row.ehpAbl = Math.round(st.maxHp * (1 + st.fResist / 100));
        rows.push(row);
        const slim = Object.assign({}, row); delete slim.timeline;
        console.log('PROFILE ROW ' + JSON.stringify(slim));
      }
    }
    T.aim = null;
    T.onDummyDamage = null;
    restoreGame();
    report(rows);
  }

  function report(rows) {
    const L = [];
    L.push('# Damage profile (build: ' + build + ', target Resist ' + RESIST + ', ' + WINDOW + 's window, mana ignored, no talents)');
    L.push('');
    L.push('| Hero | Lv | HP | Atk/Abl | Arm/Res | Burst 3s | DPS 0-10s | DPS 10-20s | EHP vs Atk/Abl | LMB | Q | E | R |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    const cell = (s) => s.dmg + (s.cd ? ' / ' + s.cd.toFixed(1) + 's' : '') + (s.capped ? '*' : '');
    rows.forEach((r) => {
      L.push('| ' + r.hero + ' | ' + r.level + ' | ' + r.maxHp + ' | ' + r.atk + '/' + r.fant + ' | ' + r.armor + '/' + r.fResist + ' | ' + r.burst + ' | ' + r.dps10 + ' | ' + r.dpsLate +
        ' | ' + r.ehpAtk + '/' + r.ehpAbl + ' | ' + cell(r.LMB) + ' | ' + cell(r.Q) + ' | ' + cell(r.E) + ' | ' + cell(r.R) + ' |');
    });
    L.push('');
    L.push('Burst and DPS come from a ' + ROT + 's rotation (autos + abilities on cooldown) against Resist ' + RESIST + '. Slot cells: one cast\'s raw damage / cooldown. * = still dealing damage when cut off at ' + SLOT_MAX + 's (zone, turret, toggle).');
    // estimated time-to-kill grids per level: row = attacker, column = defender (defender's average resist)
    levels.forEach((lvl) => {
      const at = rows.filter((r) => r.level === lvl);
      if (at.length < 2) return;
      L.push('');
      L.push('## Estimated time to kill at Lv' + lvl + ' (row kills column, seconds)');
      L.push('');
      L.push('| attacker \\ defender | ' + at.map((r) => r.hero).join(' | ') + ' |');
      L.push('|---|' + at.map(() => '---').join('|') + '|');
      at.forEach((a) => {
        L.push('| ' + a.hero + ' | ' + at.map((d) => {
          if (d === a) return '-';
          const t = ttkFromTimeline(a.timeline, d.maxHp, (d.armor + d.fResist) / 2);
          return t === Infinity ? '>' + ROT : t.toFixed(1);
        }).join(' | ') + ' |');
      });
    });
    const text = L.join('\n');
    L.forEach((line) => console.log('PROFILE MD ' + line));
    console.log('PROFILE done');
    statusEl.textContent = 'done (' + rows.length + ' rows)';
    statusEl.style.color = '#4ade80';
    outEl.textContent = text;
    const b = document.createElement('button');
    b.textContent = 'Copy markdown';
    b.style.cssText = 'margin-top:8px;background:#1e293b;color:#38bdf8;border:1px solid #38bdf8;border-radius:4px;padding:4px 8px;cursor:pointer;';
    b.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(text); };
    panel.appendChild(b);
  }

  run();
})();
