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
    K.charges.reset(hero);
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

  // ===================================================================================================
  async function runCoyote() {
    section('Coyote: Sniper (L) / Bleeder (R)');
    const C = window.MOBA_COMBAT;
    const tal = window.MOBA_PHASE1.HERO_TALENTS.coyote;
    const names = [3, 7, 10].map((t) => tal[t].L.name + ' / ' + tal[t].R.name);
    check('Talent names filled in', names.every((n) => n.indexOf('TBD') < 0), names.join(', '));

    A.switchHero('coyote');
    await waitGame(0.3);
    const foe = grabBot(1, 0), foe2 = grabBot(1, 1);
    if (!foe || !foe2) { check('bots available', false, 'need two enemy bots'); return; }
    hero.x = 0; hero.z = 0;
    placeBot(foe, 6, 0);
    placeBot(foe2, 30, 30);
    const clearBleed = (b) => { b.bleedStacks = 0; b.bleedTimer = 0; b.bleedBy = null; };

    // shared Bleed cap: bots used to stack to 5
    clearBleed(foe);
    eng.devBotActor(foe2).damage({ kind: 'bot', ref: foe }, 0, { bleedAdd: 3 });
    eng.devBotActor(foe2).damage({ kind: 'bot', ref: foe }, 0, { bleedAdd: 3 });
    check('Bleed from bots caps at 4 stacks (was 5)', foe.bleedStacks === 4 && foe.bleedBy === foe2, 'stacks ' + foe.bleedStacks);
    clearBleed(foe);

    // --- 3L Steady Aim + 10L Through the Trees (both on the Heartseeker) ---
    const heartseeker = () => heroBolts.find((b) => b.isHeartseeker && !b.owner);
    async function chargeShot(talents) {
      setPlayer(12, talents);
      face(foe.x, foe.z);
      await quiet();
      A.castKey('R');
      await sleep();
      const dur = hero.rChargeDur, t0 = hero.rChargeTimer;
      let bolt = null, waited = 0;
      while (!(bolt = heartseeker()) && waited < 3) { await sleep(); waited = gameNow() - startT; }
      return { dur, t0, bolt, life: bolt ? bolt.life : 0, terrain: bolt ? !!bolt.ignoresTerrain : false };
    }
    let startT = gameNow();
    const s0 = await chargeShot({});
    const t0fire = gameNow() - startT;
    await quiet();
    startT = gameNow();
    const s1 = await chargeShot({ 3: 'L' });
    const t1fire = gameNow() - startT;
    check('3L Steady Aim: full charge in 1.5s (was 2.0s)', s0.dur === 2.0 && s1.dur === 1.5 && near(t1fire, 1.5, 0.08) && near(t0fire, 2.0, 0.06),
      'charge ' + s0.dur + 's -> ' + s1.dur + 's; fired after ' + f2(t0fire) + 's -> ' + f2(t1fire) + 's');
    await quiet();
    startT = gameNow();
    const s2 = await chargeShot({ 10: 'L' });
    check('10L Through the Trees: a Perfect Shot flies 40% farther and ignores terrain', s2.terrain && near(s2.life / s0.life, 1.4, 0.05) && !s0.terrain,
      'flight ' + f2(s0.life) + 's -> ' + f2(s2.life) + 's (x' + f2(s2.life / s0.life) + '), ignores terrain: ' + s2.terrain);
    await quiet();
    placeBot(foe, 6, 0);

    // --- 3R Shrapnel ---
    async function grenadeAt(talents, x, z) {
      clearBleed(foe);
      setPlayer(12, talents);
      face(x, z);
      await quiet();
      await sleep(); // let the new aim point reach the game before casting
      A.castKey('E');
      await waitGame(1.0);
      return foe.bleedStacks || 0;
    }
    const bull0 = await grenadeAt({}, foe.x, foe.z);
    const bull1 = await grenadeAt({ 3: 'R' }, foe.x, foe.z);
    const out0 = await grenadeAt({}, foe.x - 1.8, foe.z);
    const out1 = await grenadeAt({ 3: 'R' }, foe.x - 1.8, foe.z);
    check('3R Shrapnel: Bullseye 3 -> 4 Bleed, outer ring 1 -> 2', bull0 === 3 && bull1 === 4 && out0 === 1 && out1 === 2,
      'bullseye ' + bull0 + ' -> ' + bull1 + ', outer ' + out0 + ' -> ' + out1);
    placeBot(foe, 6, 0);
    clearBleed(foe);

    // --- 7R Crippling Bleed ---
    setPlayer(12, {});
    foe.bleedStacks = 4; foe.bleedTimer = 5; foe.bleedBy = hero; foe.slowTimer = 0;
    const m0 = CC.slowMult(foe);
    prog.talents[7] = 'R';
    const m4 = CC.slowMult(foe);
    foe.bleedStacks = 2;
    const m2 = CC.slowMult(foe);
    CC.slow(foe, 1.0, 0.25);
    const mBoth = CC.slowMult(foe);
    check('7R Crippling Bleed: 5% slow per Bleed stack (2 = 10%, 4 = 20%)', m0 === 1 && near(m4, 0.8, 0.001) && near(m2, 0.9, 0.001), 'speed x' + f2(m0) + ' -> x' + f2(m2) + ' (2) / x' + f2(m4) + ' (4)');
    check('...and it stacks with other slows', near(mBoth, 0.75 * 0.9, 0.001), 'x' + f2(mBoth) + ' with a 25% slow');
    clearBleed(foe); CC.clear(foe); foe.slowTimer = 0;

    // --- 7L Watchful Traps ---
    setPlayer(12, {});
    hero.x = 0; hero.z = 0;
    face(5.5, 0);
    await quiet();
    A.castKey('Q');
    await waitGame(1.2);
    placeBot(foe, 8.5, 0);
    foe.stealthTimer = 30;
    const seen0 = eng.isUnitSeenBy(foe, 0);
    prog.talents[7] = 'L';
    const src = C.visionSources.map((fn) => fn(0) || []).reduce((a, l) => a.concat(l), []);
    const seen1 = eng.isUnitSeenBy(foe, 0);
    check('7L Watchful Traps: an armed trap sees 5m around it (spots a stealthed enemy 3m away)', !seen0 && seen1 && src.some((s) => s.r === 5),
      'vision spots ' + src.length + ', stealthed enemy seen: ' + seen0 + ' -> ' + seen1);
    foe.stealthTimer = 0;
    const kit = window.MOBA_HEROES.coyote;
    if (kit.clearState) kit.clearState();

    // --- 10R Plague ---
    setPlayer(12, { 10: 'R' });
    placeBot(foe, 10, 0);
    placeBot(foe2, 13, 0);
    clearBleed(foe2);
    foe.bleedStacks = 3; foe.bleedTimer = 4; foe.bleedBy = hero;
    C.emit('death', { victim: foe, kind: 'bot' });
    const jumped = foe2.bleedStacks || 0;
    placeBot(foe2, 17, 0); clearBleed(foe2);
    C.emit('death', { victim: foe, kind: 'bot' });
    const far = foe2.bleedStacks || 0;
    check('10R Plague: a bleeding enemy dies -> its 3 stacks jump to the nearest enemy within 6m', jumped === 3 && foe2.bleedBy !== foe && far === 0,
      'neighbor 3m away got ' + jumped + ', one 7m away got ' + far);
    clearBleed(foe); clearBleed(foe2);
    placeBot(foe, 6, 0);
  }

  // ===================================================================================================
  async function runScientist() {
    section('Saw Scientist: Butcher (L) / Wrangler (R)');
    const C = window.MOBA_COMBAT;
    const kit = window.MOBA_HEROES.scientist;
    const tal = window.MOBA_PHASE1.HERO_TALENTS.scientist;
    const names = [3, 7, 10].map((t) => tal[t].L.name + ' / ' + tal[t].R.name);
    check('Talent names filled in', names.every((n) => n.indexOf('TBD') < 0), names.join(', '));

    A.switchHero('scientist');
    await waitGame(0.3);
    const foe = grabBot(1, 0);
    if (!foe) { check('bots available', false, 'need an enemy bot'); return; }
    hero.x = 0; hero.z = 0;
    placeBot(foe, 30, 30);
    const sawOff = async () => { if (hero.sawOn) { A.castKey('Q'); await sleep(); } hero.cdQ = 0; };
    // run the saw for `sec` facing (x, z); returns fuel used and the saw hits on foe (dealt per tick)
    async function runSaw(talents, sec, x, z) {
      setPlayer(12, talents);
      hero.mp = 80; // (below full, so refunds aren't capped)
      hero._fuelHp = hero.hp;
      face(x, z);
      await sleep();
      const dealt = [];
      const fn = (e) => { if (e.attacker === hero && e.target === foe && e.info.castId && e.info.castId === hero.sawCastId) dealt.push(e.dealt); };
      C.on('hit', fn);
      const f0 = hero.mp;
      A.castKey('Q');
      await waitGame(sec);
      const used = f0 - hero.mp;
      await sawOff();
      C.off('hit', fn);
      return { used, dealt };
    }

    // --- 3L Overclock ---
    setPlayer(12, {});
    hero.sawOn = true;
    const slow0 = kit.speedMult();
    prog.talents[3] = 'L';
    const slow1 = kit.speedMult();
    hero.sawOn = false;
    const d0 = await runSaw({}, 1.0, -5, 0);
    const d1 = await runSaw({ 3: 'L' }, 1.0, -5, 0);
    check('3L Overclock: no saw slow (x0.75 -> x1), drains 30% more fuel', slow0 === 0.75 && slow1 === 1 && near(d1.used / d0.used, 1.3, 0.04),
      'speed x' + slow0 + ' -> x' + slow1 + ', fuel used in 1s ' + f2(d0.used) + ' -> ' + f2(d1.used));

    // --- 7L Fresh Fuel ---
    placeBot(foe, 1.6, 0);
    const e0 = await runSaw({}, 1.0, foe.x, foe.z);
    placeBot(foe, 1.6, 0);
    const e1 = await runSaw({ 7: 'L' }, 1.0, foe.x, foe.z);
    const refund = e0.used - e1.used;
    check('7L Fresh Fuel: each saw hit on a hero refunds 2 fuel', e1.dealt.length > 0 && Math.abs(refund - 2 * e1.dealt.length) < 0.6,
      e1.dealt.length + ' hits, fuel used ' + f2(e0.used) + ' -> ' + f2(e1.used) + ' (refund ' + f2(refund) + ', expected ' + 2 * e1.dealt.length + ')');

    // --- 10L Butcher's Ramp ---
    placeBot(foe, 1.6, 0);
    const r0 = await runSaw({}, 3.4, foe.x, foe.z);
    placeBot(foe, 1.6, 0);
    const r1 = await runSaw({ 10: 'L' }, 3.4, foe.x, foe.z);
    const ratios = r1.dealt.map((v) => v / r1.dealt[0]);
    const want = r1.dealt.map((v, k) => 1 + Math.min(0.6, 0.08 * k));
    const rampOk = r1.dealt.length >= 9 && ratios.every((q, k) => Math.abs(q - want[k]) < 0.02) && r0.dealt.every((v) => Math.abs(v - r0.dealt[0]) <= 1);
    check("10L Butcher's Ramp: +8% per tick on the same target, capped at +60%", rampOk,
      'ticks x' + ratios.map((q) => q.toFixed(2)).join(' ') + ' (plain saw: ' + r0.dealt.slice(0, 4).join(', ') + '...)');
    placeBot(foe, 30, 30);

    // --- 7R Shock Dose ---
    async function inject(talents) {
      placeBot(foe, 3, 0);
      setPlayer(12, talents);
      await quiet();
      A.castKey('E');
      await waitGame(0.7);
      return { slow: foe.slowTimer || 0, pct: foe.slowPct || 0 };
    }
    const i0 = await inject({});
    const i1 = await inject({ 7: 'R' });
    check('7R Shock Dose: the injection slows enemies within 4m by 30% for 1.5s', i0.slow === 0 && near(i1.pct, 0.30, 0.001) && i1.slow > 1.2 && i1.slow <= 1.5,
      'without: ' + f2(i0.slow) + 's, with: ' + f2(i1.slow) + 's at ' + Math.round(i1.pct * 100) + '%');

    // --- 3R Hang Time + 10R Second Throw (Boomerang Blade) ---
    async function throwBlade(talents, fx) {
      setPlayer(12, talents);
      hero.mp = 100;
      face(fx, 0);
      await sleep();
      A.castKey('R');
      let b = null;
      for (let i = 0; i < 30 && !(b = kit.devBlade()); i++) await sleep();
      return b;
    }
    async function bladeReturn() { for (let i = 0; i < 600 && kit.devBlade(); i++) await sleep(); }
    async function hoverInfo(b) {
      while (b && b.out && !(b.hovering > 0) && kit.devBlade() === b) await sleep();
      const p0 = b.mesh.position.clone();
      await waitGame(0.3);
      return { still: b.mesh.position.distanceTo(p0) < 0.05, hovering: b.hovering > 0 };
    }
    placeBot(foe, 11, 0);
    const b0 = await throwBlade({}, 11);
    const h0 = await hoverInfo(b0);
    await bladeReturn();
    const pct0 = foe.slowPct || 0;
    placeBot(foe, 11, 0);
    const b1 = await throwBlade({ 3: 'R' }, 11);
    const h1 = await hoverInfo(b1);
    await bladeReturn();
    const pct1 = foe.slowPct || 0;
    check('3R Hang Time: the blade hovers 0.5s at its far point, slowing (35%) whoever it touches', !h0.still && h1.still && h1.hovering && near(pct1, 0.35, 0.001),
      'parked without: ' + h0.still + ', with: ' + h1.still + '; slow on a target there ' + Math.round(pct0 * 100) + '% -> ' + Math.round(pct1 * 100) + '%');
    placeBot(foe, 30, 30);

    const s1 = await throwBlade({ 10: 'R' }, 8);
    const full = s1.dmg;
    await bladeReturn();
    const win = (hero.scRethrowUntil || 0) - K.time;
    const cd0 = hero.cdR, mp0 = hero.mp, glow = kit.rEmpowered();
    A.castKey('R');
    let s2 = null;
    for (let i = 0; i < 30 && !(s2 = kit.devBlade()); i++) await sleep();
    const ok2 = !!s2 && s2.second && s2.dmg === Math.round(full * 0.75) && Math.abs(hero.cdR - cd0) < 0.2 && hero.mp >= mp0 - 0.5;
    check('10R Second Throw: a free re-throw within 3s at 75% damage (no fuel, no cooldown)', win > 2.5 && win <= 3 && glow && ok2,
      'window ' + f2(win) + 's, R glows ' + glow + ', damage ' + full + ' -> ' + (s2 && s2.dmg) + ', fuel ' + f2(mp0) + ' -> ' + f2(hero.mp) + ', cd ' + f2(cd0) + ' -> ' + f2(hero.cdR));
    await bladeReturn();
    check('...and the second throw does not open another', !((hero.scRethrowUntil || 0) > K.time), 'window ' + f2(Math.max(0, (hero.scRethrowUntil || 0) - K.time)) + 's');
  }

  // ===================================================================================================
  async function runImp() {
    section('Cannon Imp: Engineer (L) / Demolitionist (R)');
    const kit = window.MOBA_HEROES.imp;
    const tal = window.MOBA_PHASE1.HERO_TALENTS.imp;
    const names = [3, 7, 10].map((t) => tal[t].L.name + ' / ' + tal[t].R.name);
    check('Talent names filled in', names.every((n) => n.indexOf('TBD') < 0), names.join(', '));

    A.switchHero('imp');
    await waitGame(0.3);
    const foe = grabBot(1, 0), foe2 = grabBot(1, 1);
    if (!foe) { check('bots available', false, 'need an enemy bot'); return; }
    placeBot(foe, 30, 30);
    if (foe2) placeBot(foe2, 32, 30);
    const tower = eng.getHostileTargets().find((t) => t.kind === 'structure' && t.ref.kind === 'tower' && t.ref.tier === 1 && t.ref.lane === 'top');
    const towerHp0 = tower ? tower.ref.hp : 0;
    // park enemy minions / camps near the tower (hp 0 while the engine is frozen; put back at the end)
    const parked = [];
    const clearAround = (x, z, r) => eng.getHostileTargets().forEach((t) => {
      if ((t.kind === 'minion' || t.kind === 'camp') && Math.hypot(t.x - x, t.z - z) <= r) { parked.push([t.ref, t.ref.hp]); t.ref.hp = 0; }
    });
    async function plant(talents, x, z, fx, fz) {
      kit.devReset();
      setPlayer(12, talents);
      hero.x = x; hero.z = z;
      face(fx, fz);
      await sleep();
      A.castKey('Q');
      await waitGame(0.6);
      return kit.devTurret();
    }
    const newBolts = (n0) => heroBolts.slice(n0).filter((b) => !b.owner && !b.isHeartseeker);

    // --- 3L Reinforced Plating ---
    const t0 = await plant({}, 0, 0, 3, 0);
    const hp0 = t0 ? t0.maxHp : 0;
    const t1 = await plant({ 3: 'L' }, 0, 0, 3, 0);
    check('3L Reinforced Plating: turret HP +30%', !!t1 && near(t1.maxHp / hp0, 1.3, 0.005), hp0 + ' -> ' + (t1 && t1.maxHp));

    // --- 7L Master Mechanic ---
    async function repairOnce(talents) {
      const t = await plant(talents, 0, 0, 3, 0);
      t.hp = Math.round(t.maxHp * 0.5);
      const before = t.hp;
      hero.x = t.x - 1.2; hero.z = t.z;
      face(t.x, t.z);
      await sleep();
      hero.atkTimer = 0;
      A.tryAttack();
      await waitGame(0.4);
      return { t, healPct: (t.hp - before) / t.maxHp, rapid: (t.rapidUntil || 0) - K.time };
    }
    const m0 = await repairOnce({});
    const m1 = await repairOnce({ 7: 'L' });
    // fire rate: let it shoot at a foe in range and read the reload
    placeBot(foe, m1.t.x + 5, m1.t.z);
    m1.t.shootCd = 0; m1.t.kick = 0;
    for (let i = 0; i < 90 && !(m1.t.kick > 0.9); i++) await sleep();
    const reload = m1.t.shootCd;
    placeBot(foe, 30, 30);
    check('7L Master Mechanic: wrench repairs 24% (was 12%) and the turret fires 20% faster for 3s', near(m0.healPct, 0.12, 0.02) && near(m1.healPct, 0.24, 0.02) && m1.rapid > 2.5 && Math.abs(reload - 1.4 / 1.2) < 0.05,
      'repair ' + Math.round(m0.healPct * 100) + '% -> ' + Math.round(m1.healPct * 100) + '%, reload ' + f2(reload) + 's (was 1.4s)');

    // --- 10L Spare Cannon ---
    setPlayer(12, {});
    const s0 = await plant({}, 0, 0, 3, 0);
    const spd0 = kit.speedMult();
    let n0 = heroBolts.length;
    face(-6, 0); await sleep(); hero.atkTimer = 0; A.tryAttack(); await sleep();
    const shot0 = newBolts(n0).length;
    const s1 = await plant({ 10: 'L' }, 0, 0, 3, 0);
    const spd1 = kit.speedMult();
    n0 = heroBolts.length;
    face(-6, 0); await sleep(); hero.atkTimer = 0; A.tryAttack(); await sleep();
    const b1 = newBolts(n0)[0];
    const want = Math.round(window.MOBA_HEROES.imp.dmg.cannon(eng.getPlayerStats()) * 0.7);
    // ...but next to a damaged turret the wrench comes out
    s1.hp = Math.round(s1.maxHp * 0.5);
    const hpB = s1.hp;
    hero.x = s1.x - 1.2; hero.z = s1.z; face(s1.x, s1.z); await sleep();
    hero.atkTimer = 0;
    n0 = heroBolts.length;
    A.tryAttack();
    await waitGame(0.4);
    const repaired = s1.hp > hpB && newBolts(n0).length === 0;
    check('10L Spare Cannon: turret planted, he still shoots the cannon (70% damage, no +22% speed)', shot0 === 0 && !!b1 && b1.dmg === want && spd0 === 1.22 && spd1 === 1,
      'shots without/with: ' + shot0 + '/' + (b1 ? 1 : 0) + ', damage ' + (b1 && b1.dmg) + ' (expected ' + want + '), speed x' + spd0 + ' -> x' + spd1);
    check('...and swings the wrench to repair a damaged turret next to him', repaired, 'turret ' + hpB + ' -> ' + s1.hp);
    kit.devReset();

    if (!tower) { check('enemy T1 tower found', false, ''); return; }
    const tw = tower.ref;
    const dropOn = (fn) => { tw.hp = tw.maxHp; const h = tw.hp; fn(); return h - tw.hp; };

    // structure multiplier plumbing
    const ref = dropOn(() => eng.dealPlayerDamageToUnit(tower, 400, {}));
    const ref2 = dropOn(() => eng.dealPlayerDamageToUnit(tower, 400, { structMult: 2 }));
    check('structMult: x2 against a structure (heroes unaffected)', Math.abs(ref2 - 2 * ref) <= 1, ref + ' -> ' + ref2);

    // --- 7R Breaching Charge ---
    clearAround(tw.x, tw.z, 16);
    async function breach(talents) {
      kit.devReset();
      setPlayer(12, talents);
      hero.x = tw.x + 2.6; hero.z = tw.z;
      placeBot(foe, tw.x + 4.2, tw.z);
      tw.hp = tw.maxHp;
      const th = tw.hp, fh = foe.hp;
      face(tw.x + 12, tw.z);
      await sleep();
      A.castKey('E');
      await sleep();
      const out = { tower: th - tw.hp, foe: fh - foe.hp };
      await waitGame(0.9);
      return out;
    }
    const raw = Math.round(100 + 0.5 * eng.getPlayerStats().attack);
    const towerWant = dropOn(() => eng.dealPlayerDamageToUnit(tower, raw, { structMult: 2 }));
    const br0 = await breach({});
    const br1 = await breach({ 7: 'R' });
    check('7R Breaching Charge: Blast Hop take-off blast (100 + 50% Attack), doubled vs structures', br0.tower === 0 && br0.foe === 0 && br1.foe > 0 && Math.abs(br1.tower - towerWant) <= 1,
      'enemy hero ' + br0.foe + ' -> ' + br1.foe + ', tower ' + br0.tower + ' -> ' + br1.tower + ' (expected ' + towerWant + ')');
    placeBot(foe, 30, 30);

    // --- 3R Wrecking Ball ---
    async function superballAt(talents) {
      kit.devReset();
      setPlayer(12, talents);
      hero.x = tw.x + 8; hero.z = tw.z;
      face(tw.x, tw.z);
      tw.hp = tw.maxHp;
      const th = tw.hp;
      await sleep();
      A.castKey('R');
      await waitGame(1.4);
      return th - tw.hp;
    }
    const sbRaw = window.MOBA_HEROES.imp.dmg.superball(eng.getPlayerStats(), 12, 2);
    const sbWant = dropOn(() => eng.dealPlayerDamageToUnit(tower, sbRaw, { structMult: 1.5 }));
    const w0 = await superballAt({});
    const w1 = await superballAt({ 3: 'R' });
    check('3R Wrecking Ball: Superball hits structures for +50%', w0 === 0 && Math.abs(w1 - sbWant) <= 1, 'tower damage ' + w0 + ' -> ' + w1 + ' (expected ' + sbWant + ')');

    // --- 10R Siege Mode ---
    async function siegeRun(talents) {
      clearAround(tw.x - 10, tw.z, 12); // nothing else for the turret to shoot
      const t = await plant(talents, tw.x - 11.6, tw.z, tw.x, tw.z);
      tw.hp = tw.maxHp;
      const th = tw.hp;
      t.shootCd = 0;
      let shots = 0;
      const n0 = heroBolts.length;
      for (let k = 0; k < 140; k++) { await sleep(); shots = Math.max(shots, heroBolts.length - n0); }
      return { dist: Math.hypot(t.x - tw.x, t.z - tw.z), drop: th - tw.hp, facing: t.facing, shots };
    }
    const sg0 = await siegeRun({});
    const sg1 = await siegeRun({ 10: 'R' });
    const shotWant = dropOn(() => eng.dealPlayerDamageToUnit(tower, window.MOBA_HEROES.imp.dmg.turretShot(eng.getPlayerStats()), { structMult: 2, isBasic: false, src: 'attack' }));
    check('10R Siege Mode: from ' + f2(sg1.dist) + 'm (past its 8.5m range) the turret shoots the tower for double damage', sg0.drop === 0 && sg1.drop > 0 && sg1.drop % shotWant <= 1,
      'tower damage ' + sg0.drop + ' -> ' + sg1.drop + ' (' + f2(sg1.drop / shotWant) + ' shots of ' + shotWant + '; bolts fired ' + sg0.shots + ' / ' + sg1.shots + ', facing ' + f2(sg1.facing) + ')');
    kit.devReset();
    tw.hp = towerHp0;
    parked.forEach(([u, hp]) => { u.hp = hp; });
  }

  // ===================================================================================================
  async function runSorceress() {
    section('Astral Sorceress: Artillery (L) / Zone Controller (R)');
    const kit = window.MOBA_HEROES.sorceress;
    const tal = window.MOBA_PHASE1.HERO_TALENTS.sorceress;
    const names = [3, 7, 10].map((t) => tal[t].L.name + ' / ' + tal[t].R.name);
    check('Talent names filled in', names.every((n) => n.indexOf('TBD') < 0), names.join(', '));

    A.switchHero('sorceress');
    await waitGame(0.3);
    const foe = grabBot(1, 0);
    if (!foe) { check('bots available', false, 'need an enemy bot'); return; }
    hero.x = 0; hero.z = 0;
    placeBot(foe, 6, 0);
    const clearKit = () => { if (kit.clearState) kit.clearState(); };

    // --- 3L Wide Pillar + 10L Meteor Shower (Q) ---
    async function starfall(talents) {
      setPlayer(12, talents);
      face(foe.x, foe.z);
      await quiet(); await sleep();
      const n0 = sorcPillars.length;
      A.castKey('Q');
      await sleep();
      const made = sorcPillars.slice(n0).map((p) => ({ r: p.r, delay: p.delay, dmg: p.dmg, marks: !!p.marks }));
      await waitGame(1.4);
      return made;
    }
    const q0 = await starfall({});
    const q1 = await starfall({ 3: 'L' });
    check('3L Wide Pillar: Starfall area +15%', q0.length === 1 && near(q1[0].r / q0[0].r, 1.15, 0.001), 'radius ' + f2(q0[0].r) + ' -> ' + f2(q1[0].r));
    const q2 = await starfall({ 10: 'L' });
    const side = q2.slice(1);
    check('10L Meteor Shower: 2 extra pillars 0.4s later at 50% damage', q2.length === 3 && side.every((p) => Math.abs(p.delay - (q2[0].delay + 0.4)) < 0.03 && Math.abs(p.dmg - Math.round(q2[0].dmg * 0.5)) <= 1 && p.marks),
      q2.length + ' pillars; extras: ' + side.map((p) => 'delay ' + f2(p.delay) + ' dmg ' + p.dmg).join(', ') + ' (main ' + q2[0].dmg + ')');

    // --- 7L Stellar Swiftness (E charges) ---
    async function steps(talents) {
      setPlayer(12, talents);
      hero.x = 0; hero.z = 0;
      face(0, 20);
      await quiet(); await sleep();
      let n = 0;
      for (let k = 0; k < 4; k++) {
        const z0 = hero.z;
        A.castKey('E');
        await waitGame(0.35);
        if (hero.z - z0 > 1.5) n++;
      }
      return n;
    }
    const e0 = await steps({});
    const e1 = await steps({ 7: 'L' });
    check('7L Stellar Swiftness: Rift Stride gets a third charge', e0 === 2 && e1 === 3, 'steps in a row ' + e0 + ' -> ' + e1);
    hero.x = 0; hero.z = 0;

    // --- 7R Gravity Mark ---
    placeBot(foe, 6, 0);
    clearKit();
    await starfall({});
    const marked0 = kit.passivePip() !== '';
    const g0 = CC.slowMult(foe);
    prog.talents[7] = 'R';
    const g1 = CC.slowMult(foe);
    check('7R Gravity Mark: a Starmarked enemy is slowed 15%', marked0 && g0 === 1 && near(g1, 0.85, 0.001), 'marked ' + marked0 + ', speed x' + f2(g0) + ' -> x' + f2(g1));
    clearKit();
    const g2 = CC.slowMult(foe);
    check('...and it ends with the mark', g2 === 1, 'speed x' + f2(g2) + ' after the mark is gone');

    // --- 3R Heavy Gravity + 10R Event Horizon (Monolith) ---
    async function monolith(talents, wait) {
      placeBot(foe, 6, 0);
      foe.slowPct = 0;
      setPlayer(12, talents);
      hero.x = 0; hero.z = 0;
      face(foe.x - 2.5, foe.z); // zone center 2.5m short of the foe
      await quiet(); await sleep();
      A.castKey('R');
      await waitGame(wait);
      return { pct: foe.slowPct || 0, slow: foe.slowTimer || 0, stun: foe.stunTimer || 0, kbx: foe.knockbackVx || 0, kb: foe.knockbackTimer || 0 };
    }
    const h0 = await monolith({}, 1.2);
    await waitGame(5);
    const h1 = await monolith({ 3: 'R' }, 1.2);
    check('3R Heavy Gravity: Monolith slow 45% (was the standard 32%)', h0.slow > 0 && h0.pct === 0 && near(h1.pct, 0.45, 0.001), 'slow ' + (h0.pct ? Math.round(h0.pct * 100) : 32) + '% -> ' + Math.round(h1.pct * 100) + '%');
    await waitGame(5);
    const x0 = await monolith({}, 5.7);
    const x1 = await monolith({ 10: 'R' }, 5.7);
    check('10R Event Horizon: when the Monolith ends, enemies inside are pulled to its center and stunned 0.75s', x0.stun === 0 && near(x1.stun, 0.75, 0.03) && x1.kb > 0 && x1.kbx < 0,
      'stun ' + f2(x0.stun) + 's -> ' + f2(x1.stun) + 's, pull toward center: ' + (x1.kbx < 0));
    placeBot(foe, 6, 0);
  }

  // ===================================================================================================
  async function runPanther() {
    section('Panther: Ambusher (L) / Roamer (R)');
    const C = window.MOBA_COMBAT;
    const tal = window.MOBA_PHASE1.HERO_TALENTS.panther;
    const names = [3, 7, 10].map((t) => tal[t].L.name + ' / ' + tal[t].R.name);
    check('Talent names filled in', names.every((n) => n.indexOf('TBD') < 0), names.join(', '));

    A.switchHero('panther');
    await waitGame(0.3);
    const foe = grabBot(1, 0);
    if (!foe) { check('bots available', false, 'need an enemy bot'); return; }
    hero.x = 0; hero.z = 0;
    placeBot(foe, 5, 0);

    // --- 3R Silent Paws ---
    setPlayer(12, {});
    hero.stealthTimer = 5;
    const sp0 = eng.getPlayerStats().spdPct;
    prog.talents[3] = 'R';
    const sp1 = eng.getPlayerStats().spdPct;
    hero.stealthTimer = 0;
    check('3R Silent Paws: unseen move speed +38% (was +28%)', near(sp1 - sp0, 0.10, 0.001), '+' + Math.round(sp0 * 100) + '% -> +' + Math.round(sp1 * 100) + '%');

    // --- 3L Terror ---
    async function pounce(talents) {
      placeBot(foe, 5, 0);
      setPlayer(12, talents);
      hero.x = 0; hero.z = 0;
      hero.stealthTimer = 5; // unseen
      face(foe.x, foe.z);
      await quiet(); await sleep();
      A.castKey('E');
      await waitGame(0.6);
      return foe.fearTimer || 0;
    }
    const f0 = await pounce({});
    const f1 = await pounce({ 3: 'L' });
    check('3L Terror: an unseen pounce fears heroes for 1.3s (was 0.9s)', near(f0, 0.9, 0.03) && near(f1, 1.3, 0.03), 'fear ' + f2(f0) + 's -> ' + f2(f1) + 's');
    hero.x = 0; hero.z = 0;

    // --- 7L Go for the Throat ---
    async function gnashOn(talents, hpPct) {
      placeBot(foe, 1.4, 0);
      foe.hp = Math.round(foe.maxHp * hpPct);
      setPlayer(12, talents);
      hero.x = 0; hero.z = 0;
      face(foe.x, foe.z);
      await quiet(); await sleep();
      const dealt = [];
      const fn = (e) => { if (e.attacker === hero && e.target === foe && e.info.castId) dealt.push(e.dealt); };
      C.on('hit', fn);
      A.castKey('Q');
      await waitGame(0.8);
      C.off('hit', fn);
      return dealt;
    }
    const lo0 = await gnashOn({}, 0.3);
    const lo1 = await gnashOn({ 7: 'L' }, 0.3);
    const hi1 = await gnashOn({ 7: 'L' }, 0.9);
    const ok = lo0.length === 2 && lo1.length === 2 && Math.abs(lo1[1] - Math.round(lo0[1] * 1.35)) <= 1 && Math.abs(lo1[0] - lo0[0]) <= 1 && Math.abs(hi1[1] - lo0[1]) <= 1;
    check('7L Go for the Throat: Gnash +35% on heroes below 40% HP', ok,
      'gnash at 30% HP ' + lo0[1] + ' -> ' + lo1[1] + ' (slash ' + lo0[0] + ' -> ' + lo1[0] + '), at 90% HP ' + hi1[1]);

    // --- 7R Long Night + 10R Shadow Cloak (R) ---
    async function prowl(talents) {
      setPlayer(12, talents);
      CC.slow(hero, 3, 0.5);
      hero.rootTimer = 2;
      await quiet(); await sleep();
      A.castKey('R');
      await sleep();
      const out = { stealth: hero.stealthTimer || 0, slow: hero.slowTimer || 0, root: hero.rootTimer || 0 };
      hero.stealthTimer = 0; CC.clear(hero); hero.slowTimer = 0;
      return out;
    }
    const r0 = await prowl({});
    const r1 = await prowl({ 7: 'R' });
    const r2 = await prowl({ 10: 'R' });
    check('7R Long Night: Nightprowl stealth 9s (was 6s)', near(r0.stealth, 6, 0.02) && near(r1.stealth, 9, 0.02), f2(r0.stealth) + 's -> ' + f2(r1.stealth) + 's');
    check('10R Shadow Cloak: casting Nightprowl clears slows and roots', r0.slow > 0 && r0.root > 0 && r2.slow === 0 && r2.root === 0,
      'without: slow ' + f2(r0.slow) + 's, root ' + f2(r0.root) + 's; with: slow ' + f2(r2.slow) + 's, root ' + f2(r2.root) + 's');

    // --- 10L Killing Spree ---
    setPlayer(12, { 10: 'L' });
    placeBot(foe, 5, 0);
    hero.cdE = 7;
    eng.dealPlayerDamageToUnit({ kind: 'bot', ref: foe }, 100, {});
    C.emit('death', { victim: foe, kind: 'bot' });
    const reset1 = hero.cdE;
    hero.cdE = 7;
    eng.dealPlayerDamageToUnit({ kind: 'bot', ref: foe }, 100, {});
    foe._pnTouch.set(hero, K.time - 3.5);
    C.emit('death', { victim: foe, kind: 'bot' });
    const reset2 = hero.cdE;
    check('10L Killing Spree: a takedown within 3s of her damage resets Pounce', reset1 === 0 && reset2 === 7, 'E cooldown after a takedown: ' + f2(reset1) + 's (3.5s after her hit: ' + f2(reset2) + 's)');
    hero.cdE = 0;
    placeBot(foe, 6, 0);
  }

  // ===================================================================================================
  async function runFairy() {
    section('Little Fairy: Healer (L) / Trickster (R)');
    const kit = window.MOBA_HEROES.fairy;
    const tal = window.MOBA_PHASE1.HERO_TALENTS.fairy;
    const names = [3, 7, 10].map((t) => tal[t].L.name + ' / ' + tal[t].R.name);
    check('Talent names filled in', names.every((n) => n.indexOf('TBD') < 0), names.join(', '));

    A.switchHero('fairy');
    await waitGame(0.3);
    const foe = grabBot(1, 0), ally = grabBot(0, 0);
    if (!foe || !ally) { check('bots available', false, 'need an enemy and an ally bot'); return; }
    hero.x = 0; hero.z = 0;
    placeBot(foe, 4, 0);
    placeBot(ally, -20, 20);

    // --- 3L Fresh Dust ---
    async function dustHeal(talents) {
      placeBot(foe, 30, 30);
      setPlayer(12, talents);
      hero.x = 0; hero.z = 0;
      hero.hp = Math.round(hero.maxHp * 0.4);
      face(0.01, 0.01);
      await quiet(); await sleep();
      const old = new Set(kit.devDust());
      A.castKey('Q');
      for (let i = 0; i < 120 && !kit.devDust().some((p) => !old.has(p)); i++) await sleep();
      const h0 = hero.hp;
      await waitGame(0.9);
      const first = hero.hp - h0;
      await waitGame(1.2);
      const h1 = hero.hp;
      await waitGame(0.9);
      const later = hero.hp - h1;
      return { first, later };
    }
    const fd0 = await dustHeal({});
    const fd1 = await dustHeal({ 3: 'L' });
    check('3L Fresh Dust: a patch heals double for its first second', near(fd1.first / fd0.first, 2, 0.06) && near(fd1.later / fd0.later, 1, 0.06),
      'first 0.9s ' + Math.round(fd0.first) + ' -> ' + Math.round(fd1.first) + ' HP; later ' + Math.round(fd0.later) + ' -> ' + Math.round(fd1.later));

    // --- 7L Quick Pop ---
    async function bubbleDur(talents) {
      setPlayer(12, talents);
      face(5, 0);
      await quiet(); await sleep();
      A.castKey('Q');
      await sleep();
      const b = kit.devBubbles()[kit.devBubbles().length - 1];
      return b ? b.dur : 0;
    }
    const bd0 = await bubbleDur({});
    const bd1 = await bubbleDur({ 7: 'L' });
    check('7L Quick Pop: Pop! Bubble flies 60% faster', near(bd0 / bd1, 1.6, 0.01), 'flight ' + f2(bd0) + 's -> ' + f2(bd1) + 's');
    await waitGame(1.0);

    // --- 3R Hush + 10R Decoy (hop onto an enemy) ---
    async function hopFoe(talents) {
      placeBot(foe, 4, 0);
      setPlayer(12, talents);
      hero.x = 0; hero.z = 0;
      face(foe.x, foe.z);
      await quiet(); await sleep();
      const nd = kit.devDecoys().length;
      A.castKey('E');
      await sleep();
      return { silence: foe.silenceTimer || 0, decoy: kit.devDecoys().slice(nd)[0] || null };
    }
    const h0 = await hopFoe({});
    const h1 = await hopFoe({ 3: 'R' });
    check('3R Hush: hop silence 1.5s (was 1s)', near(h0.silence, 1.0, 0.03) && near(h1.silence, 1.5, 0.03), f2(h0.silence) + 's -> ' + f2(h1.silence) + 's');
    const d0 = h1.decoy;
    const dc = await hopFoe({ 10: 'R' });
    const d = dc.decoy;
    const listed = d && eng.devBotActor(foe).hostiles().some((t) => t.ref === d);
    let shot = false;
    if (d) { const n0 = heroBolts.length; for (let i = 0; i < 90 && !shot; i++) { await sleep(); shot = heroBolts.slice(n0).some((b) => Math.hypot(b.mesh.position.x - d.x, b.mesh.position.z - d.z) < 3 && !b.owner); } }
    const dust0 = kit.devDust().length;
    await waitGame(3.2);
    const gone = d && kit.devDecoys().indexOf(d) < 0;
    const popped = kit.devDust().some((p) => d && Math.hypot(p.x - d.x, p.z - d.z) < 0.1);
    check('10R Decoy: a hop leaves a copy where she was, enemies can hit it, and it throws darts', !d0 && !!d && Math.hypot(d.x, d.z) < 0.1 && listed && shot,
      'decoy ' + (d ? 'at (' + f2(d.x) + ', ' + f2(d.z) + '), ' + d.hp + ' HP' : 'missing') + ', on enemy target list: ' + listed + ', dart thrown: ' + shot);
    check('...and after 3s it pops into a Fairy Dust patch', gone && popped, 'gone ' + gone + ', dust where it stood: ' + popped + ' (patches ' + dust0 + ' -> ' + kit.devDust().length + ')');
    // killed early: same pop
    const dk = (await hopFoe({ 10: 'R' })).decoy;
    if (dk) eng.devBotActor(foe).damage({ kind: 'deployable', ref: dk }, 99999, {});
    await sleep();
    check('...killing it pops it early', !!dk && kit.devDecoys().indexOf(dk) < 0 && kit.devDust().some((p) => Math.hypot(p.x - dk.x, p.z - dk.z) < 0.1), dk ? 'HP ' + dk.hp : 'no decoy');

    // --- 7R Rude Awakening ---
    async function wake(talents) {
      placeBot(foe, 6, 0);
      setPlayer(12, talents);
      foe.sleepTimer = 2; foe.sleepGrace = 0; foe.sleepBy = hero;
      eng.dealPlayerDamageToUnit({ kind: 'bot', ref: foe }, 50, {});
      return { awake: !(foe.sleepTimer > 0), silence: foe.silenceTimer || 0 };
    }
    const w0 = await wake({});
    const w1 = await wake({ 7: 'R' });
    check('7R Rude Awakening: woken from her sleep by damage -> silenced 1s', w0.awake && w1.awake && w0.silence === 0 && near(w1.silence, 1.0, 0.01), 'silence ' + f2(w0.silence) + 's -> ' + f2(w1.silence) + 's');

    // --- 10L Guardian Wings (hop onto an ally) ---
    async function hopAlly(talents) {
      placeBot(ally, 4, 0);
      placeBot(foe, 5.2, 0);
      ally.shield = 0;
      setPlayer(12, talents);
      hero.x = 0; hero.z = 0;
      face(ally.x, ally.z);
      await quiet(); await sleep();
      const fh = foe.hp;
      A.castKey('E');
      await sleep();
      return { shield: ally.shield || 0, foeHit: fh - foe.hp };
    }
    const g0 = await hopAlly({});
    const g1 = await hopAlly({ 10: 'L' });
    const wantSh = Math.round(window.MOBA_HEROES.fairy.dmg.bubbleShield(eng.getPlayerStats(), 12) * 0.5);
    check('10L Guardian Wings: hopping to an ally pops a 50% bubble on them (shield + damage)', g0.shield === 0 && Math.abs(g1.shield - wantSh) <= 1 && g1.foeHit > 0 && g0.foeHit === 0,
      'ally shield ' + g0.shield + ' -> ' + Math.round(g1.shield) + ' (expected ' + wantSh + '), nearby enemy took ' + g0.foeHit + ' -> ' + g1.foeHit);
    ally.shield = 0;
    placeBot(ally, -20, 20);
    placeBot(foe, 6, 0);
  }

  // ===================================================================================================
  async function runBrawler() {
    section('Pit Brawler: Chaser (L) / Bruiser (R)');
    const C = window.MOBA_COMBAT;
    const tal = window.MOBA_PHASE1.HERO_TALENTS.brawler;
    const names = [3, 7, 10].map((t) => tal[t].L.name + ' / ' + tal[t].R.name);
    check('Talent names filled in', names.every((n) => n.indexOf('TBD') < 0), names.join(', '));

    A.switchHero('brawler');
    await waitGame(0.3);
    const foe = grabBot(1, 0);
    if (!foe) { check('bots available', false, 'need an enemy bot'); return; }
    hero.x = 0; hero.z = 0;
    const dropPit = async () => { if (arena) { arena.life = 0; await sleep(); await sleep(); } };
    const fleeing = () => { foe._vx = 3; foe._vz = 0; }; // running away from her (+x)
    // hits she lands on foe during `sec` after `fn`
    async function hitsDuring(fn, sec) {
      let n = 0;
      const h = (e) => { if (e.attacker === hero && e.target === foe) n++; };
      C.on('hit', h);
      fn();
      await waitGame(sec);
      C.off('hit', h);
      return n;
    }

    // --- 3L Short Memory ---
    async function punchTwice(talents, gap) {
      placeBot(foe, 1.3, 0); fleeing();
      setPlayer(12, talents);
      hero.x = 0; hero.z = 0;
      face(foe.x, foe.z);
      await quiet(); await sleep();
      const a = await hitsDuring(() => { hero.atkTimer = 0; A.tryAttack(); }, 0.4);
      await waitGame(gap);
      placeBot(foe, 1.3, 0); fleeing();
      const b = await hitsDuring(() => { hero.atkTimer = 0; A.tryAttack(); }, 0.4);
      return [a, b];
    }
    const sm0 = await punchTwice({}, 4.2);
    await waitGame(6.2); // (let the first run's per-target cooldown run out)
    const sm1 = await punchTwice({ 3: 'L' }, 4.2);
    check("3L Short Memory: Don't Turn Your Back is ready again after 4s (was 6s)", sm0[0] === 2 && sm0[1] === 1 && sm1[0] === 2 && sm1[1] === 2,
      'hits per punch (2 = bonus) 4.2s apart: without ' + sm0.join('/') + ', with ' + sm1.join('/'));

    // --- 3R Second Guard ---
    async function slide(talents) {
      placeBot(foe, 30, 30);
      setPlayer(12, talents);
      hero.shield = 0; hero.eRecast = 3;
      face(5, 0);
      await quiet(); await sleep();
      A.castKey('E');
      await sleep();
      const s = hero.shield || 0;
      await waitGame(0.5);
      return s;
    }
    const g0 = await slide({});
    const g1 = await slide({ 3: 'R' });
    const wantG = Math.round(window.MOBA_HEROES.brawler.dmg.shield(12, 2) * 0.5);
    check('3R Second Guard: Running Slide grants half the collision shield', g0 === 0 && g1 === wantG, 'shield ' + g0 + ' -> ' + g1 + ' (expected ' + wantG + ')');
    hero.shield = 0;

    // --- 7R Second Wind + 10L Drag Back (Roundhouse Kick) ---
    async function kick(talents, run) {
      placeBot(foe, 1.6, 0);
      if (run) fleeing(); else { foe._vx = 0; foe._vz = 0; }
      setPlayer(12, talents);
      hero.x = 0; hero.z = 0;
      hero.hp = Math.round(hero.maxHp * 0.5);
      face(foe.x, foe.z);
      await quiet(); await sleep();
      const h0 = hero.hp;
      A.castKey('Q');
      await waitGame(0.5);
      return { heal: hero.hp - h0, kb: foe.knockbackTimer || 0, kbx: foe.knockbackVx || 0, kbd: Math.hypot(foe.knockbackVx || 0, foe.knockbackVz || 0) * (foe.knockbackTimer || 0) };
    }
    const k0 = await kick({}, false);
    const k1 = await kick({ 7: 'R' }, false);
    check('7R Second Wind: a Roundhouse Kick on a hero heals 8% max HP', k0.heal === 0 && Math.abs(k1.heal - Math.round(hero.maxHp * 0.08)) <= 1, 'heal ' + k0.heal + ' -> ' + Math.round(k1.heal) + ' (expected ' + Math.round(hero.maxHp * 0.08) + ')');
    const d0 = await kick({ 10: 'L' }, false);
    const d1 = await kick({ 10: 'L' }, true);
    const d2 = await kick({}, true);
    check('10L Drag Back: kicking a fleeing target pulls them back toward her', d0.kb === 0 && d2.kb === 0 && d1.kb > 0 && d1.kbx < 0,
      'pull on a standing target ' + f2(d0.kbd) + 'm, on a runner ' + f2(d1.kbd) + 'm toward her (without the talent ' + f2(d2.kbd) + 'm)');

    // --- 7L Shrinking Ring + 10R Home Turf (Pit) ---
    async function pit(talents) {
      await dropPit();
      placeBot(foe, 6, 0);
      setPlayer(12, talents);
      hero.x = 0; hero.z = 0;
      await quiet(); await sleep();
      A.castKey('R');
      await sleep();
      return arena;
    }
    const p0 = await pit({});
    await waitGame(2.75);
    const r0 = p0 ? p0.r : 0;
    const p1 = await pit({ 7: 'L' });
    await waitGame(2.75);
    const r1 = p1 ? p1.r : 0;
    check('7L Shrinking Ring: the Pit is 15% smaller halfway (30% by the end)', near(r0, 4.6, 0.001) && near(r1, 4.6 * (1 - 0.3 * 0.5), 0.03), 'radius after 2.75s ' + f2(r0) + ' -> ' + f2(r1));
    await dropPit();
    setPlayer(12, { 10: 'R' });
    hero.x = 0; hero.z = 0;
    const out = botHits(foe, hero, 400); hero.hp = hero.maxHp;
    await pit({ 10: 'R' });
    const inside = botHits(foe, hero, 400); hero.hp = hero.maxHp;
    check('10R Home Turf: 20% less damage inside her own Pit', Math.abs(inside - Math.round(out * 0.8)) <= 1, 'hit ' + out + ' -> ' + inside + ' (expected ' + Math.round(out * 0.8) + ')');
    await dropPit();
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
    try { await runBodyguard(); } catch (e) { check('Bodyguard test crashed', false, String(e && e.stack || e)); }
    try { await runCoyote(); } catch (e) { check('Coyote test crashed', false, String(e && e.stack || e)); }
    try { await runScientist(); } catch (e) { check('Scientist test crashed', false, String(e && e.stack || e)); }
    try { await runImp(); } catch (e) { check('Imp test crashed', false, String(e && e.stack || e)); }
    try { await runSorceress(); } catch (e) { check('Sorceress test crashed', false, String(e && e.stack || e)); }
    try { await runPanther(); } catch (e) { check('Panther test crashed', false, String(e && e.stack || e)); }
    try { await runFairy(); } catch (e) { check('Fairy test crashed', false, String(e && e.stack || e)); }
    try { await runBrawler(); } catch (e) { check('Brawler test crashed', false, String(e && e.stack || e)); }
    restore();
    const fails = results.filter((r) => !r.ok).length;
    statusEl.textContent = fails ? fails + ' FAILED of ' + results.length : 'all ' + results.length + ' passed';
    statusEl.style.color = fails ? '#f87171' : '#4ade80';
    console.log('[TALENTTEST]\n' + results.map((r) => (r.ok ? 'PASS ' : 'FAIL ') + r.name + ' | ' + (r.detail || '')).join('\n'));
  })();
})();
