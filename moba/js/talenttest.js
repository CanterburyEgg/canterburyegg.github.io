// Talent checks in the real game (TALENTS_PLAN.md). Open arena3d.html?talenttest
// Same idea as js/itemtest.js: the match is frozen (engine update off; the arena loop still runs the player's kit),
// each check sets up a tiny scene with real bots, runs the talent and reads the result. One section per hero.
(function () {
  'use strict';
  const T = window.__MOBA_TEST;
  if (!T || !T.api) return;
  const A = T.api;
  const eng = A.getEngine();
  const hero = A.hero;
  const CC = window.CC;
  const K = window.KitFx;
  if (!eng || !K) return;

  const sleep = () => T.nextFrame();
  const gameNow = () => T.gameTime || 0;
  async function waitGame(sec) { const until = gameNow() + sec; while (gameNow() < until) await sleep(); }
  async function quiet() { for (let i = 0; i < 600 && A.isBusy(); i++) await sleep(); }
  const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 0.011 : tol) * Math.max(1, Math.abs(b));
  const f2 = (v) => (Math.round(v * 1000) / 1000).toString();

  // ---- panel ----
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;width:560px;max-height:86vh;overflow:auto;' +
    'background:rgba(10,14,20,0.96);color:#e2e8f0;font:12px/1.45 ui-monospace,Menlo,monospace;padding:12px;border:1px solid #a78bfa;border-radius:8px;';
  panel.innerHTML = '<b style="color:#a78bfa">TALENT TEST</b> <span id="tt-status">running… keep this tab visible, hands off</span><div id="tt-out" style="margin-top:8px"></div>';
  document.body.appendChild(panel);
  const out = panel.querySelector('#tt-out');
  const statusEl = panel.querySelector('#tt-status');
  const results = [];
  function section(name) { out.insertAdjacentHTML('beforeend', '<div style="margin-top:8px;color:#fbbf24;font-weight:700">' + name + '</div>'); }
  function check(name, ok, detail) {
    results.push({ name, ok, detail });
    out.insertAdjacentHTML('beforeend', '<div><span style="color:' + (ok ? '#4ade80' : '#f87171') + ';font-weight:700">' +
      (ok ? 'PASS' : 'FAIL') + '</span> ' + name + ' <span style="color:#94a3b8">' + (detail || '') + '</span></div>');
  }

  // ---- freeze the match, remember what we touch ----
  const prog = eng.getPlayerProg();
  const saved = {
    update: eng.update, level: prog.level, items: prog.items.slice(), talents: Object.assign({}, prog.talents),
    heroId: A.getActiveHeroId(), hp: hero.hp, mp: hero.mp, x: hero.x, z: hero.z
  };
  eng.update = function () {};

  const botsSaved = new Map();
  function remember(b) {
    if (b && !botsSaved.has(b)) botsSaved.set(b, { x: b.x, z: b.z, hp: b.hp, level: b.level, items: (b.items || []).slice(), type: b.heroType, rt: b.respawnTimer, talents: Object.assign({}, b.talents) });
    return b;
  }
  function grabBot(team, idx, notType) {
    return remember(eng.devBots().filter((x) => x.team === team && x.heroType !== notType)[idx || 0]);
  }
  function placeBot(b, x, z) {
    eng.devDuelSetBot(b, b.heroType, 12, []);
    b.respawnTimer = 0; b.hp = b.maxHp; b.shield = 0; b.x = x; b.z = z;
    if (b.pivot) { b.pivot.visible = true; b.pivot.position.set(x, 0, z); }
    CC.clear(b); b.stunTimer = 0; b.slowTimer = 0; b.tauntTimer = 0; b.knockbackTimer = 0; b.knockbackVx = 0; b.knockbackVz = 0;
    b.untargetableUntil = 0; b.guardStacks = 0; b.guardScreened = null;
  }
  function restoreBots() {
    botsSaved.forEach((v, b) => {
      eng.devDuelSetBot(b, v.type, v.level, v.items);
      b.x = v.x; b.z = v.z; b.respawnTimer = v.rt; b.hp = Math.min(b.maxHp, v.hp); b.shield = 0; b.talents = v.talents;
      b.untargetableUntil = 0; b.guardScreened = null; b.guardStacks = 0;
      CC.clear(b); b.stunTimer = 0; b.tauntTimer = 0; b.knockbackTimer = 0;
      if (b.pivot) b.pivot.position.set(b.x, 0, b.z);
    });
  }
  function setPlayer(level, talents) {
    prog.level = level;
    prog.items = [];
    prog.talents = Object.assign({ 3: null, 7: null, 10: null }, talents || {});
    const st = eng.getPlayerStats();
    hero.maxHp = st.maxHp; hero.hp = st.maxHp;
    hero.maxMp = st.maxMp; hero.mp = st.maxMp;
    hero.cdQ = 0; hero.cdE = 0; hero.cdR = 0; hero.atkTimer = 0; hero.shield = 0;
    CC.clear(hero); hero.stunTimer = 0; hero.slowTimer = 0; hero.knockbackTimer = 0;
    hero.guardStacks = 0; hero.guardScreened = null; hero.counterUntil = 0; hero.bgBraceUntil = 0; hero.lastStandReady = 0; hero.ccImmuneTimer = 0;
    return st;
  }
  function face(x, z) { hero.facing = Math.atan2(x - hero.x, z - hero.z); T.aim = { x, z }; }
  // an enemy bot hits someone for raw damage through the real bot damage path; returns HP lost
  function botHits(attacker, target, raw, opts) {
    const before = target.hp;
    eng.devBotActor(attacker).damage({ kind: target === hero ? 'player' : 'bot', ref: target }, raw, opts || { isBasic: true });
    return before - target.hp;
  }

  // ===================================================================================================
  async function runBodyguard() {
    section('Bodyguard: Protector (L) / Initiator (R)');
    const tal = window.MOBA_PHASE1.HERO_TALENTS.bodyguard;
    const names = [3, 7, 10].map((t) => tal[t].L.name + ' / ' + tal[t].R.name);
    check('Talent names filled in', names.every((n) => n.indexOf('TBD') < 0), names.join(', '));

    A.switchHero('bodyguard');
    await waitGame(0.3);
    const foe = grabBot(1, 0), ally = grabBot(0, 0, 'bodyguard');
    if (!foe || !ally) { check('bots available', false, 'need an enemy bot and an ally bot'); return; }
    hero.x = 0; hero.z = 0;
    placeBot(ally, -3, 0);
    placeBot(foe, 6, 0);

    // talentOf: player + bots, gated by level
    setPlayer(12, { 3: 'L', 7: 'R', 10: 'L' });
    const C = window.MOBA_COMBAT;
    ally.talents = { 3: 'R', 7: 'L', 10: 'R' };
    ally.level = 5;
    check('Combat.talentOf reads the player and bots, gated by level', C.talentOf(hero, 7) === 'R' && C.talentOf(ally, 3) === 'R' && C.talentOf(ally, 7) === null,
      'player 7 = ' + C.talentOf(hero, 7) + ', bot Lv5: 3 = ' + C.talentOf(ally, 3) + ', 7 = ' + C.talentOf(ally, 7));
    ally.level = 12;
    check('Every bot rolled a talent for each tier', eng.devBots().every((b) => b.talents && [3, 7, 10].every((t) => b.talents[t] === 'L' || b.talents[t] === 'R')), '');

    // --- 3L Broad Shoulders ---
    setPlayer(12, { 3: 'L' });
    eng.devGuardTick(hero, 0);
    const screened = !!hero.guardScreened && hero.guardScreened.indexOf(ally) >= 0;
    check('Guard tick lists the ally he stands in front of', screened, 'screened: ' + (hero.guardScreened || []).length);
    hero.guardStacks = 3;
    const r1 = eng.devUnitResist(ally);
    prog.talents[3] = null;
    const r0 = eng.devUnitResist(ally);
    check('3L Broad Shoulders: screened ally gets +7 Resist per Guard stack (3 stacks = +21)', r1 - r0 === 21, r0 + ' -> ' + r1);
    const dTak0 = botHits(foe, ally, 400); ally.hp = ally.maxHp;
    prog.talents[3] = 'L';
    const dTak1 = botHits(foe, ally, 400); ally.hp = ally.maxHp;
    check('...and it lowers the damage the ally takes', dTak1 < dTak0 && Math.abs(dTak1 - Math.round(400 * 100 / (100 + r1))) <= 1, dTak0 + ' -> ' + dTak1 + ' (expected ' + Math.round(400 * 100 / (100 + r1)) + ')');
    hero.guardStacks = 0; hero.guardScreened = null;

    // ...the player as the ally of a bot Bodyguard
    let gBot = eng.devBots().find((b) => b.team === 0 && b.heroType === 'bodyguard' && b !== ally);
    if (gBot) remember(gBot);
    else {
      gBot = eng.devBots().find((b) => b.team === 0 && b !== ally);
      if (gBot) { remember(gBot); eng.devDuelSetBot(gBot, 'bodyguard', 12, []); }
    }
    if (gBot) {
      A.switchHero('coyote'); await waitGame(0.2);
      setPlayer(12, {});
      gBot.level = 12; gBot.respawnTimer = 0; gBot.talents = { 3: 'L', 7: 'L', 10: 'L' }; gBot.guardStacks = 3; gBot.guardScreened = null;
      const p0 = eng.getPlayerStats().resist;
      gBot.guardScreened = [hero];
      const p1 = eng.getPlayerStats().resist;
      check('3L from a bot Bodyguard: the player gets the share too', p1 - p0 === 21, p0 + ' -> ' + p1);
      gBot.guardScreened = null; gBot.guardStacks = 0;
      A.switchHero('bodyguard'); await waitGame(0.3);
    }

    // --- 7L Counterpunch ---
    hero.x = 0; hero.z = 0;
    placeBot(foe, 1.6, 0);
    setPlayer(12, { 7: 'L' });
    face(foe.x, foe.z);
    await quiet();
    A.castKey('Q');
    await waitGame(0.5);
    check('Plain Haymaker (no wall) does not stun', !(foe.stunTimer > 0), 'stun ' + f2(foe.stunTimer || 0));
    placeBot(foe, 1.6, 0);
    hero.cdQ = 0; hero.mp = hero.maxMp;
    hero.guardScreened = [ally];
    botHits(foe, ally, 100); ally.hp = ally.maxHp;
    const armed = (hero.counterUntil || 0) - K.time;
    check('7L Counterpunch: an enemy hero hitting a screened ally arms it for 3s', near(armed, 3.0, 0.03), 'armed for ' + f2(armed) + 's');
    face(foe.x, foe.z);
    A.castKey('Q');
    await waitGame(0.5);
    check('...and the next Haymaker stuns 0.75s with no wall', near(foe.stunTimer || 0, 0.75, 0.03) && !(hero.counterUntil > 0), 'stun ' + f2(foe.stunTimer || 0) + ', still armed: ' + !!(hero.counterUntil > 0));
    hero.guardScreened = null;

    // --- 7R Unstoppable ---
    hero.x = 0; hero.z = 0;
    placeBot(foe, 6, 0);
    setPlayer(12, { 7: 'R' });
    const h0 = botHits(foe, hero, 400); hero.hp = hero.maxHp;
    face(-5, 0);
    await quiet();
    A.castKey('E');
    for (let i = 0; i < 30 && !(hero.leapTimer > 0); i++) await sleep();
    const imm = hero.ccImmuneTimer || 0;
    CC.apply(hero, { stunDur: 1.0, rootDur: 1.0 });
    CC.slow(hero, 1.0, 0.5);
    eng.devBotActor(foe).damage({ kind: 'player', ref: hero }, 1, { knockbackDist: 3, knockbackDirX: 1, knockbackDirZ: 0, tauntDur: 1 });
    check('7R Unstoppable: no stun, root, slow, taunt or knockback during Crowd Dive', imm > 0 && !(hero.stunTimer > 0) && !(hero.rootTimer > 0) && !(hero.slowTimer > 0) && !(hero.tauntTimer > 0) && !(hero.knockbackTimer > 0),
      'immune ' + f2(imm) + 's; stun ' + f2(hero.stunTimer || 0) + ', root ' + f2(hero.rootTimer || 0) + ', slow ' + f2(hero.slowTimer || 0) + ', taunt ' + f2(hero.tauntTimer || 0) + ', knockback ' + f2(hero.knockbackTimer || 0));
    for (let i = 0; i < 90 && hero.leapTimer > 0; i++) await sleep();
    await sleep();
    const brace = (hero.bgBraceUntil || 0) - K.time;
    hero.hp = hero.maxHp; hero.shield = 0;
    const h1 = botHits(foe, hero, 400); hero.hp = hero.maxHp;
    check('...then 20% less damage for 1.5s after landing', brace > 1.3 && brace <= 1.5 && Math.abs(h1 - Math.round(h0 * 0.8)) <= 1, 'window ' + f2(brace) + 's, hit ' + h0 + ' -> ' + h1 + ' (expected ' + Math.round(h0 * 0.8) + ')');
    hero.ccImmuneTimer = 0;
    CC.apply(hero, { stunDur: 0.5 });
    check('...and CC works on him again once the leap is over', hero.stunTimer > 0, 'stun ' + f2(hero.stunTimer || 0));
    CC.clear(hero); hero.stunTimer = 0; hero.bgBraceUntil = 0;

    // --- 10L Last Stand ---
    hero.x = 0; hero.z = 0;
    placeBot(ally, -3, 0);
    placeBot(foe, 6, 0);
    setPlayer(12, { 10: 'L' });
    hero.guardScreened = [ally];
    ally.hp = 50;
    const heroBefore = hero.hp;
    botHits(foe, ally, 3000);
    const saved1 = ally.hp === 50 && hero.hp < heroBefore;
    check('10L Last Stand: a lethal hit on a screened ally lands on him instead', saved1, 'ally HP ' + Math.round(ally.hp) + ', his HP ' + Math.round(heroBefore) + ' -> ' + Math.round(hero.hp));
    const untg = (ally.untargetableUntil || 0) - K.time;
    const lost = botHits(foe, ally, 3000);
    const listed = eng.devBotActor(foe).hostiles().some((t) => t.ref === ally);
    check('...the ally is untargetable for 1s (no damage, off enemy target lists)', near(untg, 1.0, 0.03) && lost === 0 && !listed, f2(untg) + 's, damage taken ' + lost + ', still listed: ' + listed);
    check('...and it is on a 60s cooldown', near(hero.lastStandReady - K.time, 60, 0.002), f2(hero.lastStandReady - K.time) + 's');
    ally.untargetableUntil = 0; ally.hp = ally.maxHp; hero.guardScreened = null;

    // --- 3R Big Lungs ---
    hero.x = 0; hero.z = 0;
    placeBot(foe, 5.6, 0);
    setPlayer(12, {});
    face(foe.x, foe.z);
    await quiet();
    A.castKey('R');
    await sleep();
    const tauntNo = foe.tauntTimer > 0;
    placeBot(foe, 5.6, 0);
    setPlayer(12, { 3: 'R' });
    await quiet();
    A.castKey('R');
    await sleep();
    check('3R Big Lungs: Eyes On Me! reaches a target 5.6m away only with the talent', !tauntNo && foe.tauntTimer > 0, 'without: ' + tauntNo + ', with: ' + (foe.tauntTimer > 0));

    // --- 10R Bouncer's Call ---
    hero.x = 0; hero.z = 0;
    placeBot(foe, 4.0, 0);
    setPlayer(12, { 10: 'R' });
    face(foe.x, foe.z);
    await quiet();
    A.castKey('R');
    await sleep();
    const pullDist = foe.knockbackTimer > 0 ? Math.hypot(foe.knockbackVx, foe.knockbackVz) * foe.knockbackTimer : 0;
    check("10R Bouncer's Call: taunted enemies are dragged 2.5m toward him", foe.tauntTimer > 0 && foe.knockbackVx < 0 && near(pullDist, 2.5, 0.06),
      'taunted ' + (foe.tauntTimer > 0) + ', pull ' + f2(pullDist) + 'm, direction x ' + f2(foe.knockbackVx || 0));
    placeBot(foe, 6, 0);
  }

  function restore() {
    restoreBots();
    prog.level = saved.level;
    prog.items = saved.items;
    prog.talents = saved.talents;
    A.switchHero(saved.heroId);
    const st = eng.getPlayerStats();
    hero.maxHp = st.maxHp; hero.hp = Math.min(st.maxHp, saved.hp);
    hero.maxMp = st.maxMp; hero.mp = Math.min(st.maxMp, saved.mp);
    hero.x = saved.x; hero.z = saved.z;
    hero.cdQ = 0; hero.cdE = 0; hero.cdR = 0;
    hero.guardScreened = null; hero.guardStacks = 0; hero.counterUntil = 0; hero.bgBraceUntil = 0; hero.ccImmuneTimer = 0;
    CC.clear(hero); hero.stunTimer = 0; hero.slowTimer = 0;
    T.aim = null;
    eng.update = saved.update;
  }

  (async () => {
    while (!(eng.devBots && eng.devBots().length)) await sleep();
    await waitGame(1.0);
    try { await runBodyguard(); } catch (e) { check('test crashed', false, String(e && e.stack || e)); }
    restore();
    const fails = results.filter((r) => !r.ok).length;
    statusEl.textContent = fails ? fails + ' FAILED of ' + results.length : 'all ' + results.length + ' passed';
    statusEl.style.color = fails ? '#f87171' : '#4ade80';
    console.log('[TALENTTEST]\n' + results.map((r) => (r.ok ? 'PASS ' : 'FAIL ') + r.name + ' | ' + (r.detail || '')).join('\n'));
  })();
})();
