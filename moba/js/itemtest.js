// Item / stat checks in the real game (SHOP_IMPL_PLAN.md). Open arena3d.html?itemtest
// Runs a short list of PASS/FAIL checks against the live engine (no damage baselines), then puts the game back.
// Phase 2: attack speed cap, Ultimate Haste, Tenacity (player + bot), on-hit, bot lifesteal.
// Phase 3: one check per item passive (batch 1: double epics).
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
  const saved = { update: eng.update, gold: prog.gold, level: prog.level, items: prog.items.slice(), heroId: A.getActiveHeroId(), hp: hero.hp, mp: hero.mp, x: hero.x, z: hero.z };
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

  // ---- Phase 3 helpers ----
  const IPS = window.MOBA_ITEM_PASSIVES;
  const mt = () => eng.devMatchTime();
  const botsSaved = new Map();
  function grabBot(team, idx) {
    const b = eng.devBots().filter((x) => x.team === team)[idx || 0];
    if (b && !botsSaved.has(b)) botsSaved.set(b, { x: b.x, z: b.z, hp: b.hp, level: b.level, items: (b.items || []).slice(), type: b.heroType, rt: b.respawnTimer });
    return b;
  }
  function placeBot(b, x, z, ids) {
    eng.devDuelSetBot(b, b.heroType, 12, items(ids || []));
    b.respawnTimer = 0; b.hp = b.maxHp; b.shield = 0; b.x = x; b.z = z;
    if (b.pivot) { b.pivot.visible = true; b.pivot.position.set(x, 0, z); }
    CC.clear(b); b.stunTimer = 0; b.slowTimer = 0;
    b._ip = null; b._hurtBy = null; b._lastHit = null;
  }
  function restoreBots() {
    botsSaved.forEach((v, b) => {
      eng.devDuelSetBot(b, v.type, v.level, v.items);
      b.x = v.x; b.z = v.z; b.respawnTimer = v.rt; b.hp = Math.min(b.maxHp, v.hp); b.shield = 0;
      if (b.pivot) b.pivot.position.set(b.x, 0, b.z);
      b._ip = null;
    });
  }
  const resOf = (b) => b.resist;
  const expectHit = (raw, res, pen, mult) => Math.max(1, Math.round(raw * 100 / (100 + res * (1 - (pen || 0))) * (mult || 1)));
  function playerHits(b, raw, opts) { b.hp = b.maxHp; b.shield = 0; eng.dealPlayerDamageToUnit({ kind: 'bot', ref: b }, raw, opts || {}); return b.maxHp - b.hp; }

  async function runBatch1() {
    section('5. Batch 1 passives (double epics)');
    const ex = 0, ez = 0; // stage away from the dummies (engine is frozen; positions only matter for range checks)
    const foe = grabBot(1, 0), foe2 = grabBot(1, 1), ally = grabBot(0, 0);
    if (!foe || !foe2 || !ally) { check('bots available', false, 'need 2 enemy bots + 1 ally bot (start a match)'); return; }
    hero.x = ex; hero.z = ez;

    // static stats
    const base = eng.computeUnitStats('coyote', 12, items(['tide_pearl']));
    const cha = eng.computeUnitStats('coyote', 12, items(['brimming_chalice']));
    const plain = eng.computeUnitStats('coyote', 12, []);
    check("Mana engine (Brimming Chalice): +5% bonus Mana as Ability, +25% as HP", cha.ability === Math.round(plain.ability + 800 * 0.05) && cha.maxHp === Math.round(plain.maxHp + 800 * 0.25),
      'Ability ' + plain.ability + ' -> ' + cha.ability + ', HP ' + plain.maxHp + ' -> ' + cha.maxHp + ' (tier 2 for reference: ' + base.ability + ' / ' + base.maxHp + ')');
    const opus = eng.computeUnitStats('coyote', 12, items(['magnum_opus']));
    check('Amplifier (Magnum Opus): +25% total Ability', opus.ability === Math.round((plain.ability + 100) * 1.25), 'Ability ' + opus.ability + ' (expected ' + Math.round((plain.ability + 100) * 1.25) + ')');

    // penetration, penetration resistance, wards
    placeBot(foe, ex, ez + 3, []);
    setPlayer(12, ['bloodletters_knife']);
    const r0 = resOf(foe);
    const dNo = playerHits(foe, 200, { isBasic: false, src: 'attack' });
    setPlayer(12, ['misericorde']);
    const dPen = playerHits(foe, 200, { src: 'attack' });
    check('Attack pen (Misericorde): ignores 30% of Resist on Attack damage', dPen === expectHit(200, r0, 0.30) && dNo === expectHit(200, r0), dNo + ' -> ' + dPen + ' (expected ' + expectHit(200, r0, 0.30) + ')');
    const dPenAb = playerHits(foe, 200, { src: 'ability' });
    check('...but not on Ability damage', dPenAb === expectHit(200, r0), String(dPenAb));
    setPlayer(12, ['unraveling_codex']);
    const dAb = playerHits(foe, 200, { src: 'ability' });
    check('Ability pen (Unraveling Codex): ignores 30% of Resist on Ability damage', dAb === expectHit(200, r0, 0.30), dAb + ' (expected ' + expectHit(200, r0, 0.30) + ')');
    placeBot(foe, ex, ez + 3, ['pavise']);
    setPlayer(12, ['misericorde']);
    const r1 = resOf(foe);
    const dPr = playerHits(foe, 200, { src: 'attack' });
    check('Penetration resistance (Pavise 30%): 30% pen works as 21%', dPr === expectHit(200, r1, 0.21), dPr + ' (expected ' + expectHit(200, r1, 0.21) + ')');
    placeBot(foe, ex, ez + 3, ['tortoise_shell']);
    setPlayer(12, []);
    const r2 = resOf(foe);
    const dW = playerHits(foe, 200, { src: 'attack' });
    const dW2 = playerHits(foe, 200, { src: 'ability' });
    check('Attack ward (Tortoise Shell): 20% less Attack damage', dW === expectHit(200, r2, 0, 0.8) && dW2 === expectHit(200, r2), 'Attack ' + dW + ', Ability ' + dW2 + ' (expected ' + expectHit(200, r2, 0, 0.8) + ' / ' + expectHit(200, r2) + ')');
    placeBot(foe, ex, ez + 3, ['spellbreakers_veil']);
    const r3 = resOf(foe);
    const dV = playerHits(foe, 200, { src: 'ability' });
    check("Ability ward (Spellbreaker's Veil): 20% less Ability damage", dV === expectHit(200, r3, 0, 0.8), dV + ' (expected ' + expectHit(200, r3, 0, 0.8) + ')');

    // Ricochet: a basic attack on foe bounces to foe2 standing 2m away
    placeBot(foe, ex, ez + 3, []); placeBot(foe2, ex + 2, ez + 3, []);
    setPlayer(12, ['hornets_nest']);
    foe2.hp = foe2.maxHp;
    playerHits(foe, 200, { isBasic: true });
    const bounced = foe2.maxHp - foe2.hp;
    check("Ricochet (Hornet's Nest): basic attack bounces for 40% (2 enemies: 2 bounces land on the second)", bounced > 0 && Math.abs(bounced - 2 * expectHit((200 + 22) * 0.4, resOf(foe2))) <= 3, 'bounce damage ' + bounced + ' (expected about ' + 2 * expectHit((200 + 22) * 0.4, resOf(foe2)) + ')');
    foe2.x = ex + 30; if (foe2.pivot) foe2.pivot.position.set(foe2.x, 0, foe2.z);

    // Frenzy: 3 basics on the same target
    setPlayer(12, ['hive_queens_stinger']);
    hero._ip = null;
    for (let i = 0; i < 3; i++) playerHits(foe, 50, { isBasic: true });
    const fz = eng.getPlayerStats();
    check("Frenzy (Hive Queen's Stinger): 3 basics -> +40% attack speed, +20% move speed", near(fz.passiveAsPct, 0.40) && IPS.hasBuff(hero, 'frenzy'), 'passive AS ' + f2(fz.passiveAsPct) + ', move ' + f2(fz.spdPct));

    // Ult follow-up: casting R gives +60 Haste for 6s
    setPlayer(12, ['crescendo']);
    hero._ip = null;
    const hBefore = eng.getPlayerStats().haste;
    window.MOBA_COMBAT.emit('cast', { unit: hero, slot: 'R' });
    const hAfter = eng.getPlayerStats().haste;
    check('Ult follow-up (Crescendo): +60 Haste after casting R', hAfter - hBefore === 60, hBefore + ' -> ' + hAfter);

    // Reset: killing a hero cuts current cooldowns by 30%
    setPlayer(12, ['reapers_orrery']);
    placeBot(foe, ex, ez + 3, []);
    hero.cdE = 10; hero.cdR = 40;
    foe.hp = 50; foe.shield = 0;
    eng.dealPlayerDamageToUnit({ kind: 'bot', ref: foe }, 5000, { isBasic: true });
    check("Reset (Reaper's Orrery): a kill cuts cooldowns by 30%", near(hero.cdE, 7) && near(hero.cdR, 28), 'E 10 -> ' + f2(hero.cdE) + ', R 40 -> ' + f2(hero.cdR));
    placeBot(foe, ex, ez + 3, []);

    // Warmog: out of combat for 6s -> 3% max HP per second
    setPlayer(12, ['old_grizzlys_hide']);
    hero.hp = Math.round(hero.maxHp * 0.5);
    hero._lastHurtAt = mt() - 7;
    const w0 = hero.hp;
    IPS.tick(1.0);
    check("Warmog (Old Grizzly's Hide): 3% max HP/s after 6s out of combat", Math.abs((hero.hp - w0) - hero.maxHp * 0.03) < 1.5, '+' + Math.round(hero.hp - w0) + ' HP in 1s (expected ' + Math.round(hero.maxHp * 0.03) + ')');
    hero._lastHurtAt = mt();
    const w1 = hero.hp; IPS.tick(1.0);
    check('...and nothing while in combat', hero.hp === w1, '+' + Math.round(hero.hp - w1));

    // Mana shield: dropping below 50% HP
    setPlayer(12, ['breakwater']);
    hero._ip = null; hero.shield = 0;
    hero.hp = Math.round(hero.maxHp * 0.52);
    const expSh = Math.round(150 + 0.25 * hero.mp);
    eng.devBotActor(foe).damage({ kind: 'player', ref: hero }, 300, { isBasic: true });
    check('Mana shield (Breakwater): below 50% HP -> shield of 150 + 25% current Mana', Math.abs(hero.shield - expSh) <= 2, 'shield ' + Math.round(hero.shield) + ' (expected ' + expSh + ')');
    hero.shield = 0;

    // Overheal: lifesteal at full HP becomes a shield
    setPlayer(12, ['gluttonous_carver']);
    hero._ip = null; hero.shield = 0;
    const dl = playerHits(foe, 300, { isBasic: true });
    check('Overheal (Gluttonous Carver): lifesteal past full HP becomes a shield', hero.shield > 0 && Math.abs(hero.shield - Math.round(dl * 0.15)) <= 2, 'shield ' + Math.round(hero.shield) + ' from ' + dl + ' damage (15% lifesteal)');
    hero.shield = 0;

    // Redirect: an allied bot next to you takes 12% less; you take that part
    placeBot(ally, ex + 1.5, ez, []);
    setPlayer(12, []);
    const actorF = eng.devBotActor(foe);
    ally.hp = ally.maxHp; actorF.damage({ kind: 'bot', ref: ally }, 300, { isBasic: true });
    const a0 = ally.maxHp - ally.hp;
    setPlayer(12, ['cloak_of_the_oathsworn']);
    ally.hp = ally.maxHp; const hp0 = hero.hp;
    actorF.damage({ kind: 'bot', ref: ally }, 300, { isBasic: true });
    const a1 = ally.maxHp - ally.hp, took = hp0 - hero.hp;
    check('Redirect (Cloak of the Oathsworn): nearby ally takes 12% less, you take it', Math.abs(a1 - a0 * 0.88) <= 2 && took > 0, 'ally ' + a0 + ' -> ' + a1 + ', you took ' + took);
  }

  async function runBatch2() {
    section('6. Batch 2 passives (HP pairs)');
    const ex = 0, ez = 0;
    const foe = grabBot(1, 0), foe2 = grabBot(1, 1), ally = grabBot(0, 0);
    if (!foe || !foe2 || !ally) return;
    hero.x = ex; hero.z = ez;
    placeBot(foe, ex, ez + 3, []); foe2.x = ex + 40;

    // Lifeblood
    setPlayer(12, ['heartwood_amulet']); hero._ip = null;
    hero.hp = Math.round(hero.maxHp * 0.30); const lb0 = hero.hp, mp0 = hero.mp;
    IPS.tick(0.001); IPS.tick(1.0);
    check('Lifeblood (Heartwood Amulet): below 35% HP regen 3%/s, costs 30 Mana/s', Math.abs((hero.hp - lb0) - hero.maxHp * 0.03) < 3 && Math.abs((mp0 - hero.mp) - 30) < 2,
      '+' + Math.round(hero.hp - lb0) + ' HP, -' + Math.round(mp0 - hero.mp) + ' Mana in 1s');

    // Wellspring: heal an ally with info.healer = you
    setPlayer(12, ['wellspring']); hero._ip = null;
    placeBot(ally, ex + 1, ez, []); ally.hp = ally.maxHp - 500;
    hero.mp = hero.maxMp - 100; const wm0 = hero.mp, ah0 = ally.hp;
    window.MOBA_COMBAT.heal(ally, 100, { healer: hero });
    check('Wellspring: your heals on allies +15% and give 15 Mana', Math.round(ally.hp - ah0) === 115 && Math.round(hero.mp - wm0) === 15, 'healed ' + Math.round(ally.hp - ah0) + ', +' + Math.round(hero.mp - wm0) + ' Mana');

    // Cleaver: splash + every-10s bonus
    placeBot(foe, ex, ez + 3, []); placeBot(foe2, ex + 1.2, ez + 3, []);
    setPlayer(12, ['woodsmans_greataxe']); hero._ip = null;
    foe2.hp = foe2.maxHp;
    const c1 = playerHits(foe, 200, { isBasic: true });
    const splash = foe2.maxHp - foe2.hp;
    const c2 = playerHits(foe, 200, { isBasic: true });
    check("Cleaver (Woodsman's Greataxe): splash 40% within 2m", splash > 0 && Math.abs(splash - expectHit(80, resOf(foe2))) <= 2, 'splash ' + splash + ' (expected ' + expectHit(80, resOf(foe2)) + ')');
    check('...and the first basic every 10s adds 3% of your max HP', c1 > c2, 'first hit ' + c1 + ', second ' + c2);
    foe2.x = ex + 40;

    // Weakness: Attack damage stacks (4% each, max 5) for everyone
    placeBot(foe, ex, ez + 3, []);
    setPlayer(12, ['rending_flail']); hero._ip = null;
    for (let i = 0; i < 6; i++) { foe.hp = foe.maxHp; eng.dealPlayerDamageToUnit({ kind: 'bot', ref: foe }, 50, { isBasic: true }); }
    const stacks = foe._weak ? foe._weak.n : 0;
    setPlayer(12, []);
    const wHit = playerHits(foe, 200, { src: 'attack' });
    check('Weakness (Rending Flail): 5 stacks = +20% Attack damage taken, from anyone', stacks === 5 && Math.abs(wHit - expectHit(200, resOf(foe), 0, 1.2)) <= 1, stacks + ' stacks, hit ' + wHit + ' (expected ' + expectHit(200, resOf(foe), 0, 1.2) + ')');
    foe._weak = null;

    // Frost-touched
    setPlayer(12, ['hoarfrost_staff']); hero._ip = null;
    CC.clear(foe); foe.slowTimer = 0; foe.slowPct = 0;
    playerHits(foe, 100, { src: 'ability' });
    check('Frost-touched (Hoarfrost Staff): Ability damage slows 25% for 1.5s', near(foe.slowTimer, 1.5) && near(foe.slowPct, 0.25), 'slow ' + f2(foe.slowPct) + ' for ' + f2(foe.slowTimer) + 's');
    foe.slowTimer = 0;

    // Immolate
    setPlayer(12, ['wildfire_totem']); hero._ip = null;
    placeBot(foe, ex, ez + 2, []);
    const ih0 = foe.hp; IPS.tick(1.01);
    const burn = ih0 - foe.hp;
    check('Immolate (Wildfire Totem): enemies within 3m burn for 15 + 1.5% bonus HP per second', burn > 0 && Math.abs(burn - expectHit(15 + 0.015 * 420, resOf(foe))) <= 1, 'burn ' + burn + ' (expected ' + expectHit(15 + 0.015 * 420, resOf(foe)) + ')');

    // Adaptive guard: Attack + Ability damage within 3s
    setPlayer(12, ['chameleon_hide']); hero._ip = null; hero.shield = 0;
    const fa = eng.devBotActor(foe);
    const ag0 = eng.getPlayerStats().resist;
    fa.damage({ kind: 'player', ref: hero }, 50, { isBasic: true });
    fa.damage({ kind: 'player', ref: hero }, 50, { src: 'ability' });
    const agSh = hero.shield, ag1 = eng.getPlayerStats().resist;
    check('Adaptive guard (Chameleon Hide): Attack + Ability damage -> shield 100 + 8% max HP, +30 Resist', Math.abs(agSh - (100 + 0.08 * hero.maxHp)) <= 2 && near(ag1 - ag0, 30, 0.02), 'shield ' + Math.round(agSh) + ', Resist ' + ag0 + ' -> ' + f2(ag1));
    hero.shield = 0;

    // Wither: their abilities hitting you weaken them
    setPlayer(12, ['withering_hauberk']); hero._ip = null; foe._ip = null;
    const wa0 = foe.unitStats.attack;
    fa.damage({ kind: 'player', ref: hero }, 50, { src: 'ability' });
    fa.damage({ kind: 'player', ref: hero }, 50, { src: 'ability' });
    eng.devBots(); // (bot stats refresh each frame; apply now)
    const wst = window.MOBA_ITEM_PASSIVES.applyDynamic(foe, Object.assign({}, foe.baseStats));
    check('Wither (Withering Hauberk): 2 ability hits -> attacker loses 10% Attack and Ability', near(wst.attack, wa0 * 0.90, 0.01), 'Attack ' + wa0 + ' -> ' + f2(wst.attack));
    foe._ip = null; foe._wither = null;

    // Bulwark breaker
    setPlayer(12, []);
    placeBot(foe, ex, ez + 3, []);
    const bb0 = playerHits(foe, 100, { isBasic: true });
    setPlayer(12, ['ogre_knuckles']);
    const bb1 = playerHits(foe, 100, { isBasic: true });
    check('Bulwark breaker (Ogre Knuckles): basics deal +2.5% of target max HP', Math.abs((bb1 - bb0) - expectHit(foe.maxHp * 0.025, resOf(foe))) <= 2, bb0 + ' -> ' + bb1 + ' (bonus expected ' + expectHit(foe.maxHp * 0.025, resOf(foe)) + ')');

    // Last stand
    setPlayer(12, ['death_grip']); hero._ip = null;
    hero.hp = Math.round(hero.maxHp * 0.3);
    const ls = eng.getPlayerStats().passiveAsPct; const lh0 = hero.hp;
    playerHits(foe, 50, { isBasic: true });
    check('Last stand (Death Grip): below 40% HP +35% attack speed, basics heal 2% max HP', near(ls, 0.35) && Math.abs((hero.hp - lh0) - hero.maxHp * 0.02) < 2, 'AS +' + f2(ls) + ', healed ' + Math.round(hero.hp - lh0));

    // Exposed
    setPlayer(12, ['inquisitors_plate']); hero._ip = null;
    placeBot(foe, ex, ez + 3, []);
    eng.dealPlayerDamageToUnit({ kind: 'bot', ref: foe }, 0, { stunDur: 0.5 });
    setPlayer(12, []);
    const exH = playerHits(foe, 200, { src: 'ability' });
    check("Exposed (Inquisitor's Plate): your hard CC makes them take 10% more damage", Math.abs(exH - expectHit(200, resOf(foe), 0, 1.1)) <= 1, exH + ' (expected ' + expectHit(200, resOf(foe), 0, 1.1) + ')');
    foe._exposedUntil = 0; CC.clear(foe); foe.stunTimer = 0;

    // Battle rhythm
    setPlayer(12, ['bell_cuirass']); hero._ip = null;
    hero.cdQ = 0; hero.cdE = 5;
    fa.damage({ kind: 'player', ref: hero }, 50, { isBasic: true });
    fa.damage({ kind: 'player', ref: hero }, 50, { isBasic: true });
    check('Battle rhythm (Bell Cuirass): enemy hero hits cut cooldowns 0.5s (once per second)', near(hero.cdE, 4.5), 'E 5 -> ' + f2(hero.cdE) + ' after 2 quick hits');
  }

  async function runBatch3to6() {
    const ex = 0, ez = 0;
    const foe = grabBot(1, 0), foe2 = grabBot(1, 1), ally = grabBot(0, 0);
    if (!foe || !foe2 || !ally) return;
    const C = window.MOBA_COMBAT;
    const fa = eng.devBotActor(foe);
    hero.x = ex; hero.z = ez;
    placeBot(foe, ex, ez + 3, []); foe2.x = ex + 40;
    const castR = (slot) => C.emit('cast', { unit: hero, slot: slot || 'Q' });
    const fresh = (ids) => { setPlayer(12, ids); hero._ip = null; hero.shield = 0; placeBot(foe, ex, ez + 3, []); };
    const bonus = (ids, raw, opts, before) => { fresh(ids); if (before) before(); return playerHits(foe, raw, opts); };

    section('7. Batch 3 passives (Mana pairs)');
    let b0 = bonus([], 100, { isBasic: true });
    let mpA; let b1 = bonus(['sapphire_kopis'], 100, { isBasic: true }, () => { mpA = hero.mp; });
    check('Mana-forged (Sapphire Kopis): basics on heroes spend 25 Mana for bonus damage', b1 > b0 && Math.round(mpA - hero.mp) === 25, b0 + ' -> ' + b1 + ', -' + Math.round(mpA - hero.mp) + ' Mana');
    fresh(['spirit_saber']); hero.mp = hero.maxMp - 100; hero.cdQ = 4; hero.cdE = 4; const em0 = hero.mp;
    playerHits(foe, 50, { isBasic: true });
    check('Essence (Spirit Saber): basics on heroes +12 Mana and -0.3s cooldowns', Math.round(hero.mp - em0) === 12 && near(hero.cdE, 3.7), '+' + Math.round(hero.mp - em0) + ' Mana, E 4 -> ' + f2(hero.cdE));
    fresh(['supernova']);
    check('Overcharge (Supernova): abilities cost 25% more Mana', near(IPS.manaCostMult(hero), 1.25), 'cost x' + f2(IPS.manaCostMult(hero)));
    const ocBase = playerHits(foe, 100, { src: 'ability' });
    castR('E');
    const ocHit = playerHits(foe, 100, { src: 'ability' });
    const ocAgain = playerHits(foe, 100, { src: 'ability' });
    check('...and deal 3x the extra Mana as bonus damage, once per target per cast', ocHit > ocBase && ocAgain === ocBase, ocBase + ' -> ' + ocHit + ' (second hit of the cast ' + ocAgain + ')');
    fresh(['harvest_moon']); hero.mp = 0;
    foe.hp = 30; eng.dealPlayerDamageToUnit({ kind: 'bot', ref: foe }, 5000, { src: 'ability' });
    check('Soul harvest (Harvest Moon): a hero dying to your Ability damage refunds 8% max Mana', Math.abs(hero.mp - hero.maxMp * 0.08) < 1.5, '+' + Math.round(hero.mp) + ' Mana (expected ' + Math.round(hero.maxMp * 0.08) + ')');
    placeBot(foe, ex, ez + 3, []);
    fresh(['temple_censer']); placeBot(ally, ex + 2, ez, []);
    const wa = IPS.applyDynamic(ally, Object.assign({}, ally.baseStats)).resist - ally.baseStats.resist;
    const self = eng.getPlayerStats().resist - eng.computeUnitStats('coyote', 12, items(['temple_censer'])).resist;
    check('Ward aura (Temple Censer): you and allies within 6m get +15 Resist', wa === 15 && self === 15, 'ally +' + wa + ', you +' + self);
    fresh(['thistle_shroud']);
    fa.damage({ kind: 'player', ref: hero }, 50, { isBasic: true });
    foe.hp = foe.maxHp - 500; const ah0 = foe.hp; C.heal(foe, 100);
    check('Barbed ward (Thistle Shroud): enemies who hit you get 40% anti-heal', Math.round(foe.hp - ah0) === 60, 'their 100 heal -> ' + Math.round(foe.hp - ah0));
    fresh(['rusted_chakram']);
    playerHits(foe, 50, { isBasic: true });
    foe.hp = foe.maxHp - 500; const ah1 = foe.hp; C.heal(foe, 100);
    check('Wounding strikes (Rusted Chakram): basics apply 40% anti-heal', Math.round(foe.hp - ah1) === 60, 'their 100 heal -> ' + Math.round(foe.hp - ah1));
    fresh(['moonlit_anklet']); hero.mp = 0;
    playerHits(foe, 50, { isBasic: true });
    check('Mana tap (Moonlit Anklet): basics restore Mana (10 vs heroes)', Math.round(hero.mp) === 10, '+' + Math.round(hero.mp));
    fresh(['prayer_wheel']);
    castR('Q'); castR('E'); castR('Q');
    check('Momentum (Prayer Wheel): each cast -6% Mana costs (3 casts = -18%)', near(IPS.manaCostMult(hero), 0.82), 'cost x' + f2(IPS.manaCostMult(hero)));
    fresh(['calm_waters']);
    const fs1 = eng.getPlayerStats().haste; hero.mp = hero.maxMp * 0.3; const fs0 = eng.getPlayerStats().haste;
    check('Flow state (Calm Waters): +20 Haste above 50% Mana', fs1 - fs0 === 20, 'full ' + fs1 + ', low ' + fs0);

    section('8. Batch 4 passives (Attack pairs)');
    b0 = bonus(['sigiled_saber'], 100, { isBasic: true });
    b1 = bonus(['twin_scales'], 100, { isBasic: true });
    const lo = Math.min(eng.getPlayerStats().attack, eng.getPlayerStats().ability);
    check('Equilibrium (Twin Scales): hits add 25% of your lower stat', b1 > b0, b0 + ' -> ' + b1 + ' (lower stat ' + lo + ')');
    fresh(['rimed_pauldrons']); foe.slowTimer = 0;
    fa.damage({ kind: 'player', ref: hero }, 50, { isBasic: true });
    const fbAs = IPS.applyDynamic(foe, Object.assign({}, foe.baseStats)).asPct - foe.baseStats.asPct;
    check('Frostbite plate (Rimed Pauldrons): attackers -20% attack speed, -10% move speed for 2s', near(foe.slowPct, 0.10) && near(fbAs, -0.20), 'slow ' + f2(foe.slowPct) + ', AS ' + f2(fbAs));
    foe._ip = null;
    fresh(['vendetta']);
    const g0 = eng.getPlayerStats().attack;
    for (let i = 0; i < 3; i++) playerHits(foe, 50, { isBasic: true });
    const g1 = eng.getPlayerStats().attack;
    check('Grudge (Vendetta): +4% Attack per hit on the same hero', near(g1, g0 * 1.12, 0.01), g0 + ' -> ' + f2(g1) + ' after 3 hits');
    fresh(['hawks_reach']);
    check("Longshot (Hawk's Reach): ranged +15% range", near(eng.getPlayerStats().rangePct, 0.15), 'range +' + f2(eng.getPlayerStats().rangePct));
    fresh(['whirling_glaive']);
    for (let i = 0; i < 4; i++) playerHits(foe, 50, { isBasic: true });
    check('Wind-up (Whirling Glaive): +6% attack speed per basic (4 hits = +24%)', near(eng.getPlayerStats().passiveAsPct, 0.24), '+' + f2(eng.getPlayerStats().passiveAsPct));
    fresh(['tempered_edge']); castR('Q');
    const te1 = playerHits(foe, 100, { src: 'ability' }), te2 = playerHits(foe, 100, { src: 'ability' });
    check("Tempered spells (Tempered Edge): each cast's first hit adds 40% of Attack", te1 > te2, 'first ' + te1 + ', second ' + te2);
    fresh(['vipers_kiss']);
    hero._ip = null; IPS.passivesOf(hero); hero._ip.by.ambush = { unseenAt: mt() };
    const am1 = playerHits(foe, 100, { isBasic: true }), am2 = playerHits(foe, 100, { isBasic: true });
    check("Ambush (Viper's Kiss): first hit after being unseen deals bonus damage (8s cooldown)", am1 > am2, 'first ' + am1 + ', second ' + am2);

    section('9. Batch 5 passives (Ability pairs)');
    fresh(['lunar_halo']);
    const ls0 = hero.hp;
    fa.damage({ kind: 'player', ref: hero }, 200, { src: 'ability', stunDur: 1 });
    const blockedDmg = ls0 - hero.hp, blockedStun = hero.stunTimer || 0;
    fa.damage({ kind: 'player', ref: hero }, 200, { src: 'ability' });
    check('Spell shield (Lunar Halo): blocks the next enemy ability, CC included', blockedDmg === 0 && blockedStun === 0 && hero.hp < ls0, 'first: ' + blockedDmg + ' dmg / ' + f2(blockedStun) + 's stun; second hit landed');
    CC.clear(hero); hero.stunTimer = 0;
    fresh(['stone_litany']);
    const bc0 = eng.getPlayerStats().resist; castR('Q'); castR('E');
    check('Bulwark casting (Stone Litany): +8 Resist per cast (2 casts = +16)', eng.getPlayerStats().resist - bc0 === 16, '+' + (eng.getPlayerStats().resist - bc0));
    b0 = bonus(['witchs_thimble'], 100, { isBasic: true });
    b1 = bonus(['hex_needle'], 100, { isBasic: true });
    check('Hexed strikes (Hex Needle): basics add 15 + 15% Ability', b1 > b0, b0 + ' -> ' + b1);
    fresh(['lightning_distaff']); placeBot(foe2, ex + 2, ez + 3, []);
    for (let i = 0; i < 5; i++) playerHits(foe, 10, { isBasic: true });
    foe2.hp = foe2.maxHp; playerHits(foe, 10, { isBasic: true });
    check('Static charge (Lightning Distaff): 6th basic releases chain lightning to nearby enemies', foe2.hp < foe2.maxHp, 'nearby enemy took ' + (foe2.maxHp - foe2.hp));
    foe2.x = ex + 40;
    fresh(['tuning_fork']);
    let cad = [];
    ['Q', 'E', 'R'].forEach((sl) => { castR(sl); cad.push(playerHits(foe, 50, { src: 'ability' })); });
    check('Spell cadence (Tuning Fork): 3 different abilities within 4s = bonus damage', cad[2] > cad[0], 'hits ' + cad.join(', '));
    fresh(['infinity_scrolls']);
    const ac0 = eng.getPlayerStats().ability;
    for (let i = 0; i < 5; i++) { castR('Q'); playerHits(foe, 10, { src: 'ability' }); playerHits(foe, 10, { src: 'ability' }); }
    check('Accumulation (Infinity Scrolls): every 5 casts that hit a hero = +4 Ability', eng.getPlayerStats().ability - ac0 === 4, '+' + (eng.getPlayerStats().ability - ac0) + ' after 5 casts (10 hits)');

    section('10. Batch 6 passives (Resist + attack speed / Haste pairs)');
    fresh(['rebound_buckler']);
    fa.damage({ kind: 'player', ref: hero }, 400, { isBasic: true });
    const rs = hero._ip.by.retort ? hero._ip.by.retort.stored : 0;
    const rt1 = playerHits(foe, 100, { isBasic: true }), rt2 = playerHits(foe, 100, { isBasic: true });
    check('Retort (Rebound Buckler): 25% of damage your Resist blocked is added to your next basic', rs > 0 && rt1 > rt2, 'stored ' + Math.round(rs) + ', next hit ' + rt1 + ' vs ' + rt2);
    fresh(['bloodspike_plate']);
    const sp0 = eng.getPlayerStats().resist;
    for (let i = 0; i < 3; i++) playerHits(foe, 10, { isBasic: true });
    check('Siphon plating (Bloodspike Plate): 3 basics on a hero = +9 Resist for you', eng.getPlayerStats().resist - sp0 === 9, '+' + (eng.getPlayerStats().resist - sp0));
    fresh(['horn_of_steel_sun']); placeBot(ally, ex + 2, ez, []);
    const stn = IPS.applyDynamic(ally, Object.assign({}, ally.baseStats)).tenacity || 0;
    check('Steadfast aura (Horn of Steel Sun): allies within 6m get 20% Tenacity', near(stn, 0.20), 'ally Tenacity ' + f2(stn));
    fresh(['broken_chains']); hero.cdQ = 5; hero.cdE = 5;
    fa.damage({ kind: 'player', ref: hero }, 10, { src: 'ability', stunDur: 0.5 });
    check('Shrug off (Broken Chains): being hard-CC\'d cuts basic cooldowns by 2s', near(hero.cdQ, 3) && near(hero.cdE, 3), 'Q/E 5 -> ' + f2(hero.cdQ) + ' / ' + f2(hero.cdE));
    CC.clear(hero); hero.stunTimer = 0;
    fresh(['hair_trigger']); hero.atkTimer = 0.5; castR('Q');
    check('Snap-back (Hair Trigger): casting resets your basic attack timer', hero.atkTimer === 0, 'attack timer ' + f2(hero.atkTimer));
    fresh(['dancing_rapier']); castR('Q');
    check('Battle tempo (Dancing Rapier): casting gives +30% attack speed', near(eng.getPlayerStats().passiveAsPct, 0.30), '+' + f2(eng.getPlayerStats().passiveAsPct));
  }

  async function runFixes() {
    section('11. Follow-up fixes (real stat swap, bot mana, cast tagging, ...)');
    const ex = 0, ez = 0;
    const C = window.MOBA_COMBAT;
    const foe = grabBot(1, 0), foe2 = grabBot(1, 1), foe3 = grabBot(1, 2), ally = grabBot(0, 0);
    if (!foe || !foe2 || !foe3 || !ally) return;
    const fa = eng.devBotActor(foe);
    const fresh = (ids) => { setPlayer(12, ids); hero._ip = null; hero.shield = 0; placeBot(foe, ex, ez + 3, []); foe2.x = ex + 40; foe3.x = ex - 40; };

    // Crossover: the kit really reads the stronger stat while it's ready
    fresh(['mirror_blade']);
    const H = window.MOBA_HEROES.coyote;
    const seen = [];
    const origG = H.dmg.grenadeOuter;
    H.dmg.grenadeOuter = function (st) { seen.push(st.ability); return origG.apply(this, arguments); };
    const plainSt = eng.getPlayerStats();
    stage(); await waitGame(0.1);
    async function castE() {
      for (let i = 0; i < 600 && A.isBusy(); i++) await sleep();
      hero.cdE = 0; hero.mp = hero.maxMp; A.castKey('E');
      await waitGame(1.6);
    }
    IPS.passivesOf(hero); IPS.crossoverReady(hero);
    await castE();
    hero._ip.by.crossover = Object.assign(hero._ip.by.crossover || {}, { readyAt: mt() + 999 }); // spent
    await castE();
    H.dmg.grenadeOuter = origG;
    check('Crossover (Mirror Blade): a cast while ready scales off your stronger stat', seen.length >= 2 && seen[0] === Math.max(plainSt.attack, plainSt.ability) && seen[seen.length - 1] === plainSt.ability,
      'grenade saw Ability ' + seen.join(' -> ') + ' (Attack ' + plainSt.attack + ', Ability ' + plainSt.ability + ')');
    fresh(['mirror_blade']); hero._ip = null;
    IPS.passivesOf(hero); IPS.tick(0.01);
    const wasReady = IPS.crossoverReady(hero);
    playerHits(foe, 50, { src: 'ability' });
    check('...and your first weaker-type hit spends it (5s)', wasReady && !IPS.crossoverReady(hero), 'ready ' + wasReady + ' -> ' + IPS.crossoverReady(hero));
    stage(); hero.x = ex; hero.z = ez;

    // Bot mana
    placeBot(foe, ex, ez + 3, []);
    const kit = window.MOBA_HEROES[foe.heroType];
    const cost = (window.MOBA_PHASE1.HERO_SPECS[foe.heroType].mpCosts || {}).E || 0;
    if (kit && kit.castFor && cost > 0 && !window.MOBA_PHASE1.HERO_SPECS[foe.heroType].resource) {
      foe.cdE = 0; foe.mp = 0;
      kit.castFor(fa, 'E');
      const blocked = !(foe.cdE > 0);
      foe.cdE = 0; foe.mp = foe.unitStats.maxMp;
      kit.castFor(fa, 'E');
      check('Bots pay mana for casts and can\'t cast without it', blocked && foe.cdE > 0 && Math.round(foe.unitStats.maxMp - foe.mp) === cost,
        foe.heroType + ' E: no mana -> ' + (blocked ? 'no cast' : 'CAST') + '; full -> cast, -' + Math.round(foe.unitStats.maxMp - foe.mp) + ' (cost ' + cost + ')');
    } else check('Bots pay mana for casts', true, '(skipped: ' + foe.heroType + ' has no E mana cost)');
    placeBot(foe, ex, ez + 3, []);

    // Cast tagging: hits carry the cast id
    C.currentCast = { id: 4242, unit: hero, slot: 'Q' };
    const tagged = C.hitInfo(hero, { src: 'ability' }).castId;
    C.currentCast = null;
    check('Hits during a cast carry its cast id', tagged === 4242, 'castId ' + tagged);
    fresh(['tempered_edge']);
    C.emit('cast', { unit: hero, slot: 'Q', castId: 777 });
    C.emit('cast', { unit: hero, slot: 'E', castId: 778 });
    const t1 = playerHits(foe, 100, { src: 'ability', castId: 777 }), t2 = playerHits(foe, 100, { src: 'ability', castId: 777 }), t3 = playerHits(foe, 100, { src: 'ability', castId: 778 });
    check("Tempered spells uses the hit's own cast (Q's late hit isn't credited to E)", t1 > t2 && t3 > t2, 'Q first ' + t1 + ', Q again ' + t2 + ', E first ' + t3);

    // Ricochet: an enemy can be hit twice by one attack
    fresh(['hornets_nest']); placeBot(foe2, ex + 2, ez + 3, []);
    foe2.hp = foe2.maxHp;
    playerHits(foe, 200, { isBasic: true });
    const one = expectHit(222 * 0.4, resOf(foe2));
    check('Ricochet: with 2 enemies, bounces go back and forth (each hit at most twice)', Math.abs((foe2.maxHp - foe2.hp) - 2 * one) <= 3, 'second enemy took ' + (foe2.maxHp - foe2.hp) + ' (2 bounces = ' + 2 * one + ')');

    // Weakness decays one stack at a time
    fresh(['rending_flail']);
    for (let i = 0; i < 5; i++) playerHits(foe, 20, { isBasic: true });
    foe._weak.t = mt() - 5.5;
    setPlayer(12, []);
    const wk = playerHits(foe, 200, { src: 'attack' });
    check('Weakness: stacks fall off one per second after 4s (5.5s later: 3 left)', Math.abs(wk - expectHit(200, resOf(foe), 0, 1.12)) <= 1, wk + ' (expected ' + expectHit(200, resOf(foe), 0, 1.12) + ')');
    foe._weak = null;

    // Static charge chains enemy to enemy
    fresh(['lightning_distaff']); placeBot(foe2, ex + 3, ez + 3, []); placeBot(foe3, ex + 6, ez + 3, []);
    for (let i = 0; i < 5; i++) playerHits(foe, 10, { isBasic: true });
    foe3.hp = foe3.maxHp; playerHits(foe, 10, { isBasic: true });
    check('Static charge: the chain jumps enemy to enemy (6m away via the middle one)', foe3.hp < foe3.maxHp, 'far enemy took ' + (foe3.maxHp - foe3.hp));
    foe2.x = ex + 40; foe3.x = ex - 40;

    // Frostbite plate on a non-hero attacker
    fresh(['rimed_pauldrons']);
    const minion = { x: ex, z: ez + 1, hp: 300, maxHp: 300, atkCd: 0, spd: 3 };
    C.emit('hit', { attacker: minion, target: hero, targetObj: { kind: 'player', ref: hero }, raw: 20, dealt: 10, info: C.unitHitInfo(minion) });
    check('Frostbite plate slows any attacker (a minion attacks 20% slower)', near(IPS.atkTimeMult(minion), 1.25), 'attack time x' + f2(IPS.atkTimeMult(minion)));

    // Exposed from any hard CC (a root)
    fresh(['inquisitors_plate']);
    CC.apply(foe, { rootDur: 0.5 }, { x: hero.x, z: hero.z, unit: hero });
    setPlayer(12, []);
    const exr = playerHits(foe, 200, { src: 'ability' });
    check('Exposed from any hard CC (root)', Math.abs(exr - expectHit(200, resOf(foe), 0, 1.1)) <= 1, exr + ' (expected ' + expectHit(200, resOf(foe), 0, 1.1) + ')');
    foe._exposedUntil = 0; CC.clear(foe);

    // Spell shield pops on damage-over-time and effect-only ability hits too
    fresh(['lunar_halo']);
    fa.damage({ kind: 'player', ref: hero }, 0, { src: 'ability', isDoT: true, rootDur: 1 });
    check('Spell shield: an effect-only / DoT ability hit pops it (no root)', !(hero.rootTimer > 0) && !IPS.hasBuff(hero, 'x') && hero._ip.by.spellShield.readyAt > mt(), 'root ' + f2(hero.rootTimer || 0));
    CC.clear(hero);

    // Soul harvest: only when your ability hit was the killing blow
    fresh(['harvest_moon']); hero.mp = 0;
    playerHits(foe, 50, { src: 'ability' });
    foe._lastHit = { by: null, info: C.unitHitInfo(null), t: mt() }; // a minion landed the last hit
    C.emit('death', { victim: foe, kind: 'bot' });
    check('Soul harvest: no refund when someone else lands the killing blow', hero.mp === 0, '+' + Math.round(hero.mp) + ' Mana');
    placeBot(foe, ex, ez + 3, []);

    // Lifeblood stops at full HP
    fresh(['heartwood_amulet']);
    hero.hp = Math.round(hero.maxHp * 0.3); IPS.tick(0.01);
    hero.hp = hero.maxHp; const lm = hero.mp; IPS.tick(1.0);
    check('Lifeblood stops once you are at full HP (no mana drain)', Math.round(lm - hero.mp) === 0, '-' + Math.round(lm - hero.mp) + ' Mana');

    // Wellspring on shields
    fresh(['wellspring']); placeBot(ally, ex + 1, ez, []);
    check('Wellspring: shields you give allies are 15% stronger', Math.round(C.shieldAmount(ally, 100, { healer: hero })) === 115, String(Math.round(C.shieldAmount(ally, 100, { healer: hero }))));

    // Longshot: ranged only
    check("Longshot (Hawk's Reach): ranged heroes only", I.byId.hawks_reach.rangedOnly === true, 'rangedOnly ' + I.byId.hawks_reach.rangedOnly);
  }

  async function runShop() {
    section('12. Shop (recipe pricing, buying rules, sell, undo)');
    const SH = window.MOBA_SHOP_UI;
    const F = window.MOBA_MAP.BASE.fountain;
    A.switchHero('coyote'); await waitGame(0.2);
    setPlayer(12, []); SH.reset();
    hero.x = F.x; hero.z = F.z;
    prog.gold = 20000;
    const ids = () => prog.items.map((o) => o.id).join(', ') || '(none)';
    let g = prog.gold;
    SH.buy('hatchet');
    check('Buy a component (Hatchet 350g)', g - prog.gold === 350 && ids() === 'hatchet', ids() + ', paid ' + (g - prog.gold));
    g = prog.gold; SH.buy('bloodletters_knife');
    check("Recipe pricing: Bloodletter's Knife with a Hatchet in hand costs 600g and uses it up", g - prog.gold === 600 && ids() === 'bloodletters_knife', ids() + ', paid ' + (g - prog.gold));
    g = prog.gold; SH.buy('misericorde');
    check('Epic from its tier-2 item: 1,650g (both Hatchets bought on the way)', g - prog.gold === 1650 && ids() === 'misericorde', ids() + ', paid ' + (g - prog.gold));
    g = prog.gold; SH.buy('gluttonous_carver');
    check('Only one epic per line (Gluttonous Carver refused)', g === prog.gold && ids() === 'misericorde', ids());
    g = prog.gold; SH.buy('bloodletters_knife');
    check('Tier-2 of a line you already finished is refused', g === prog.gold, ids());
    g = prog.gold; SH.sell(0);
    check('Sell refunds 70% (Misericorde: 1,820g)', prog.gold - g === 1820 && ids() === '(none)', '+' + (prog.gold - g));
    g = prog.gold; SH.undo();
    check('Undo a sale: item back, refund taken back', ids() === 'misericorde' && g - prog.gold === 1820, ids());
    g = prog.gold; SH.undo();
    check('Undo a purchase: full refund and the parts come back', ids() === 'bloodletters_knife' && prog.gold - g === 1650, ids() + ', +' + (prog.gold - g));
    SH.tick(); hero.x = F.x + 30; SH.tick(); hero.x = F.x; SH.tick();
    check('Leaving the fountain locks purchases in (no more undo)', SH.undoCount() === 0, 'undo stack ' + SH.undoCount());
    prog.items = []; SH.reset();
    SH.buy('footwraps'); SH.buy('fencers_slippers');
    const b1 = ids(); g = prog.gold; SH.buy('footwraps');
    check('Boots: upgrade replaces the basic pair; a second pair is refused', b1 === 'fencers_slippers' && g === prog.gold, b1);
    prog.items = []; SH.reset();
    ['hatchet', 'inkwell', 'metronome', 'iron_collar'].forEach((id) => SH.buy(id));
    g = prog.gold; SH.buy('garnet_brooch');
    check('4 item slots', prog.items.length === 4 && g === prog.gold, prog.items.length + ' items');
    prog.items = []; SH.reset();
    A.switchHero('brawler'); await waitGame(0.2);
    g = prog.gold; SH.buy('hawks_reach');
    check("Longshot (Hawk's Reach) refused for a melee hero", g === prog.gold && prog.items.length === 0, ids());
    A.switchHero('coyote'); await waitGame(0.2);
    prog.items = []; SH.reset();
    setPlayer(12, ['hornets_nest', 'whirling_glaive', 'fencers_slippers']);
    check('Attack speed at the cap shows (max)', window.MOBA_COMBAT.atkCapped(window.MOBA_PHASE1.HERO_SPECS.coyote.atkCd, eng.getPlayerStats()), 'capped');
    prog.items = []; SH.reset(); prog.gold = saved.gold;
  }

  function restore() {
    restoreBots();
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
    try { await run(); await runBatch1(); await runBatch2(); await runBatch3to6(); await runFixes(); await runShop(); } catch (e) { check('test crashed', false, String(e && e.stack || e)); }
    restore();
    const fails = results.filter((r) => !r.ok).length;
    statusEl.textContent = fails ? fails + ' FAILED of ' + results.length : 'all ' + results.length + ' passed';
    statusEl.style.color = fails ? '#f87171' : '#4ade80';
    console.log('[ITEMTEST]\n' + results.map((r) => (r.ok ? 'PASS ' : 'FAIL ') + r.name + ' | ' + (r.detail || '')).join('\n'));
  })();
})();
