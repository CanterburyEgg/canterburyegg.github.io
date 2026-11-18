// Item / stat checks in the real game (SHOP_IMPL_PLAN.md). Open arena3d.html?itemtest
// Runs a short list of PASS/FAIL checks against the live engine (no damage baselines), then puts the game back.
// Phase 2: attack speed cap, Ultimate Haste, Tenacity (player + bot), on-hit, bot lifesteal.
// Later phases add their passives here (one check per passive).
(function () {
  'use strict';
  const T = window.__MOBA_TEST;
  if (!T || !T.api) return;
  const A = T.api;
  const eng = A.getEngine();
  const hero = A.hero;
  const I = window.MOBA_ITEMS;
  const Combat = window.MOBA_COMBAT;
  const CC = window.CC;
  if (!eng || !I) return;

  const sleep = () => T.nextFrame();
  const gameNow = () => T.gameTime || 0;
  async function waitGame(sec) { const until = gameNow() + sec; while (gameNow() < until) await sleep(); }
  const items = (ids) => ids.map((id) => I.byId[id]).filter(Boolean);
  const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 0.011 : tol) * Math.max(1, Math.abs(b));
  const f2 = (v) => (Math.round(v * 1000) / 1000).toString();

  // ---- panel ----
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;width:560px;max-height:86vh;overflow:auto;' +
    'background:rgba(10,14,20,0.96);color:#e2e8f0;font:12px/1.45 ui-monospace,Menlo,monospace;padding:12px;border:1px solid #38bdf8;border-radius:8px;';
  panel.innerHTML = '<b style="color:#38bdf8">ITEM TEST</b> <span id="it-status">running… keep this tab visible, hands off</span><div id="it-out" style="margin-top:8px"></div>';
  document.body.appendChild(panel);
  const out = panel.querySelector('#it-out');
  const statusEl = panel.querySelector('#it-status');
  const results = [];
  function section(name) { out.insertAdjacentHTML('beforeend', '<div style="margin-top:8px;color:#fbbf24;font-weight:700">' + name + '</div>'); }
  function check(name, ok, detail) {
    results.push({ name, ok, detail });
    out.insertAdjacentHTML('beforeend', '<div><span style="color:' + (ok ? '#4ade80' : '#f87171') + ';font-weight:700">' +
      (ok ? 'PASS' : 'FAIL') + '</span> ' + name + ' <span style="color:#94a3b8">' + (detail || '') + '</span></div>');
  }

  // ---- freeze the match (only what the checks do changes state), remember everything we touch ----
  const prog = eng.getPlayerProg();
  const saved = { update: eng.update, level: prog.level, items: prog.items.slice(), heroId: A.getActiveHeroId(), hp: hero.hp, mp: hero.mp, x: hero.x, z: hero.z };
  eng.update = function () {};
  const target = A.dummies[1] || A.dummies[0];

  function setPlayer(level, ids) {
    prog.level = level;
    prog.items = items(ids);
    const st = eng.getPlayerStats();
    hero.maxHp = st.maxHp; hero.hp = st.maxHp;
    hero.maxMp = st.maxMp; hero.mp = st.maxMp;
    hero.cdQ = 0; hero.cdE = 0; hero.cdR = 0; hero.atkTimer = 0;
    if (window.KitFx) window.KitFx.charges.reset(hero);
    CC.clear(hero);
    return st;
  }
  function stage() {
    hero.x = target.homeX; hero.z = target.homeZ + 6.0; hero.facing = Math.PI;
    T.aim = { x: target.homeX, z: target.homeZ };
  }

  async function run() {
    A.switchHero('coyote');
    await waitGame(0.3);
    stage();
    await waitGame(0.15);

    // 1. Attack speed cap -------------------------------------------------------------------------------------
    section('1. Attack speed cap (stat attack speed stops at 2.5 attacks/s)');
    const spec = window.MOBA_PHASE1.HERO_SPECS.coyote;
    let st = setPlayer(12, []);
    A.tryAttack();
    const t0 = hero.atkTimer;
    check('Coyote Lv12, no items: normal attack speed', near(t0, spec.atkCd / (1 + st.asPct)), 'interval ' + f2(t0) + 's = ' + f2(1 / t0) + '/s');
    await waitGame(0.8);
    st = setPlayer(12, ['hornets_nest', 'whirling_glaive', 'fencers_slippers']);
    A.tryAttack();
    const t1 = hero.atkTimer;
    const uncapped = (1 + st.asPct) / spec.atkCd;
    check('Coyote Lv12 + 3 attack speed items: capped at 2.5/s', near(1 / t1, 2.5), 'uncapped would be ' + f2(uncapped) + '/s, got ' + f2(1 / t1) + '/s');
    const pst = Object.assign({}, st, { passiveAsPct: 0.36 });
    const tp = Combat.atkInterval(spec.atkCd, pst);
    check('Passive attack speed goes past the cap (+36% of base rate)', near(1 / tp, 2.5 + 0.36 / spec.atkCd), f2(1 / tp) + '/s (expected ' + f2(2.5 + 0.36 / spec.atkCd) + ')');
    const tm = Combat.atkInterval(spec.atkCd, Object.assign({}, st, { passiveAsPct: 5 }));
    check('Absolute ceiling 3.5/s', near(1 / tm, 3.5), f2(1 / tm) + '/s');
    await waitGame(0.8);

    // 2. Ultimate Haste ---------------------------------------------------------------------------------------
    section('2. Ultimate Haste (Brass Astrolabe: +24 Haste, +25 Ultimate Haste)');
    async function quiet() { for (let i = 0; i < 600 && A.isBusy(); i++) await sleep(); }
    // read each cooldown on the frame right after the cast (so no time has ticked off it)
    async function castOne(slot) {
      await quiet();
      hero.mp = hero.maxMp;
      A.castKey(slot);
      for (let i = 0; i < 30 && !(hero['cd' + slot] > 0); i++) await sleep();
      return hero['cd' + slot];
    }
    async function castCds(ids) {
      setPlayer(12, ids);
      stage();
      await waitGame(0.1);
      const e = await castOne('E');
      const r = await castOne('R');
      return { e, r };
    }
    const c0 = await castCds([]);
    await waitGame(1.5);
    const c1 = await castCds(['brass_astrolabe']);
    if (!(c0.e > 0) || !(c0.r > 0)) check('casts fired', false, 'E cd ' + f2(c0.e) + ', R cd ' + f2(c0.r) + ' (a cast did not go off)');
    else {
      check('E cooldown shortened by Haste only (x100/124)', near(c1.e, c0.e * 100 / 124, 0.02), f2(c0.e) + 's -> ' + f2(c1.e) + 's (expected ' + f2(c0.e * 100 / 124) + ')');
      check('R cooldown shortened by Haste + Ultimate Haste (x100/149)', near(c1.r, c0.r * 100 / 149, 0.02), f2(c0.r) + 's -> ' + f2(c1.r) + 's (expected ' + f2(c0.r * 100 / 149) + ')');
    }
    await waitGame(2.0);

    // 3. Tenacity (player) ------------------------------------------------------------------------------------
    section('3. Tenacity (Insulated Sabatons: 25%; every CC incl. slows, not knock-ups)');
    function ccTimes(u) {
      CC.clear(u); u.stunTimer = 0; u.slowTimer = 0; u.tauntTimer = 0;
      CC.apply(u, { stunDur: 1.0 }); const stun = u.stunTimer; CC.clear(u); u.stunTimer = 0;
      CC.apply(u, { slowDur: 2.0, slowPct: 0.3 }); const slow = u.slowTimer; u.slowTimer = 0;
      CC.apply(u, { rootDur: 1.0 }); const root = u.rootTimer; CC.clear(u);
      CC.apply(u, { knockupDur: 0.5 }); const knock = u.knockupTimer; CC.clear(u); u.stunTimer = 0;
      return { stun, slow, root, knock };
    }
    setPlayer(12, []);
    const p0 = ccTimes(hero);
    setPlayer(12, ['insulated_sabatons']);
    const p1 = ccTimes(hero);
    check('Player stun 1.0s -> 0.75s', near(p0.stun, 1.0) && near(p1.stun, 0.75), f2(p0.stun) + ' -> ' + f2(p1.stun));
    check('Player slow 2.0s -> 1.5s', near(p0.slow, 2.0) && near(p1.slow, 1.5), f2(p0.slow) + ' -> ' + f2(p1.slow));
    check('Player root 1.0s -> 0.75s', near(p0.root, 1.0) && near(p1.root, 0.75), f2(p0.root) + ' -> ' + f2(p1.root));
    check('Player knock-up unchanged (0.5s)', near(p1.knock, 0.5), f2(p0.knock) + ' -> ' + f2(p1.knock));
    setPlayer(12, ['insulated_sabatons', 'horn_of_steel_sun']);
    // (Horn of Steel Sun's 20% aura is a Phase 3 passive; this only checks that item Tenacity multiplies)
    const stk = eng.getPlayerStats().tenacity;
    check('Tenacity from items multiplies, never adds past 100%', stk < 1, 'total ' + f2(stk));

    // 4. Bots: tenacity, on-hit, lifesteal --------------------------------------------------------------------
    section('4. Bots (Tenacity, on-hit, lifesteal)');
    const bot = eng.devBots().find((b) => b.team === 1 && b.respawnTimer <= 0 && b.hp > 0);
    if (!bot) check('an enemy bot is alive', false, 'none found (start a match first)');
    else {
      const bSaved = { items: (bot.items || []).slice(), hp: bot.hp, level: bot.level, type: bot.heroType };
      eng.devDuelSetBot(bot, bot.heroType, 12, items(['insulated_sabatons']));
      const b1 = ccTimes(bot);
      check('Bot stun 1.0s -> 0.75s with Insulated Sabatons', near(b1.stun, 0.75), f2(b1.stun));
      check('Bot slow 2.0s -> 1.5s', near(b1.slow, 1.5), f2(b1.slow));

      // on-hit: the player's basic attack (raw 100) on the bot, without / with Hornet Bracers (+15 on-hit)
      eng.devDuelSetBot(bot, bot.heroType, 12, []);
      const hitBot = (ids) => {
        setPlayer(12, ids);
        bot.hp = bot.maxHp; bot.shield = 0;
        eng.dealPlayerDamageToUnit({ kind: 'bot', ref: bot }, 100, { isBasic: true });
        return bot.maxHp - bot.hp;
      };
      const d0 = hitBot([]);
      const d1 = hitBot(['hornet_bracers']);
      check('Player on-hit adds +15 Attack damage to basic attacks', near(d1 / d0, 115 / 100, 0.03), d0 + ' -> ' + d1 + ' damage (expected about x1.15)');

      // bot on the player: on-hit + lifesteal (Hornet Bracers / Bloodletter's Knife)
      const actor = eng.devBotActor(bot);
      const botHits = (ids) => {
        eng.devDuelSetBot(bot, bot.heroType, 12, items(ids));
        setPlayer(12, []);
        bot.hp = bot.maxHp - 600;
        const hp0 = hero.hp, bhp0 = bot.hp;
        actor.damage({ kind: 'player', ref: hero }, 100, { isBasic: true });
        return { dealt: hp0 - hero.hp, healed: bot.hp - bhp0 };
      };
      const h0 = botHits([]);
      const h1 = botHits(['hornet_bracers']);
      check('Bot on-hit adds +15 to its basic attacks', h1.dealt > h0.dealt, h0.dealt + ' -> ' + h1.dealt + ' damage');
      const h2 = botHits(['bloodletters_knife']);
      check('Bot lifesteal heals 10% of damage dealt', h0.healed === 0 && Math.abs(h2.healed - Math.round(h2.dealt * 0.10)) <= 1, 'dealt ' + h2.dealt + ', healed ' + h2.healed);

      eng.devDuelSetBot(bot, bSaved.type, bSaved.level, bSaved.items);
      bot.hp = Math.min(bot.maxHp, bSaved.hp);
      CC.clear(bot); bot.stunTimer = 0; bot.slowTimer = 0;
    }
  }

  function restore() {
    prog.level = saved.level;
    prog.items = saved.items;
    A.switchHero(saved.heroId);
    const st = eng.getPlayerStats();
    hero.maxHp = st.maxHp; hero.hp = Math.min(st.maxHp, saved.hp);
    hero.maxMp = st.maxMp; hero.mp = Math.min(st.maxMp, saved.mp);
    hero.x = saved.x; hero.z = saved.z;
    hero.cdQ = 0; hero.cdE = 0; hero.cdR = 0;
    CC.clear(hero); hero.stunTimer = 0; hero.slowTimer = 0;
    T.aim = null;
    eng.update = saved.update;
  }

  (async () => {
    // let the match finish booting
    while (!(eng.devBots && eng.devBots().length)) await sleep();
    await waitGame(1.0);
    try { await run(); } catch (e) { check('test crashed', false, String(e && e.stack || e)); }
    restore();
    const fails = results.filter((r) => !r.ok).length;
    statusEl.textContent = fails ? fails + ' FAILED of ' + results.length : 'all ' + results.length + ' passed';
    statusEl.style.color = fails ? '#f87171' : '#4ade80';
    console.log('[ITEMTEST]\n' + results.map((r) => (r.ok ? 'PASS ' : 'FAIL ') + r.name + ' | ' + (r.detail || '')).join('\n'));
  })();
})();
