// Balance tool B: Duel Arena (bot vs bot, real kits and real brains).
// Open arena3d.html?duel=brawler,coyote   (one matchup)
//   or ?duel=all                          (round-robin of every non-support hero, 1v1)
//   or ?duel=support                      (2v2: [support + partner] vs [hero + partner] for each support)
// Options: &level=6  &build=standard|none|attack|ability|hybrid|tank|support  &trials=6  &partner=coyote
//          &dt=0.033 (game step; bigger = faster, rougher)  &norender
// Each trial puts the teams 6-10m apart (random axis, small reaction/cooldown jitter) in an open spot (no minions, towers or other heroes), fights until one side is
// dead or 45s pass (a draw), then resets. Sides are swapped every trial so the map can't favor anyone.
// Output: an on-screen panel, plus console 'DUEL ROW <json>' / 'DUEL MD <markdown line>' lines, then 'DUEL done'.
(function () {
  'use strict';
  const T = window.__MOBA_TEST;
  if (!T || !T.api) return;
  const A = T.api;
  const eng = A.getEngine();
  const DATA = window.MOBA_PHASE1;
  if (!eng || !eng.devDuelStart) return;

  const qs = new URLSearchParams(location.search);
  const SUPPORTS = ['fairy', 'bodyguard'];
  const allHeroes = Object.values(window.MOBA_HEROES || {}).filter((k) => k.spec)
    .sort((a, b) => ((a.roster && a.roster.order) || 99) - ((b.roster && b.roster.order) || 99)).map((k) => k.id);
  const fighters = allHeroes.filter((h) => !SUPPORTS.includes(h));
  const level = Math.max(1, Math.min(12, Number(qs.get('level') || 6)));
  const build = qs.get('build') || 'standard';
  const TRIALS = Math.max(1, Number(qs.get('trials') || 6));
  const partner = qs.get('partner') || 'coyote';
  const ROUND_MAX = 45;
  const CENTER = { x: 0, z: 27 };   // open ground on the valley path, far from towers and camps
  T.dt = Number(qs.get('dt') || 1 / 30);

  // matchups: [[teamA heroes], [teamB heroes]]
  const arg = qs.get('duel') || 'all';
  let mode = '1v1';
  const matchups = [];
  if (arg === 'all') {
    for (let i = 0; i < fighters.length; i++) for (let j = i + 1; j < fighters.length; j++) matchups.push([[fighters[i]], [fighters[j]]]);
  } else if (arg === 'support') {
    mode = '2v2';
    SUPPORTS.forEach((s) => fighters.forEach((x) => matchups.push([[s, partner], [x, partner]])));
  } else {
    const p = arg.split(',').filter((h) => allHeroes.includes(h));
    if (p.length === 2) matchups.push([[p[0]], [p[1]]]);
    else if (p.length === 4) { mode = '2v2'; matchups.push([[p[0], p[1]], [p[2], p[3]]]); }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const gameNow = () => T.gameTime || 0;
  async function waitGame(sec) { const until = gameNow() + sec; while (gameNow() < until) await sleep(15); }

  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;max-width:820px;max-height:86vh;overflow:auto;' +
    'background:rgba(10,14,20,0.95);color:#e2e8f0;font:12px/1.4 ui-monospace,Menlo,monospace;padding:12px;border:1px solid #f472b6;border-radius:8px;';
  panel.innerHTML = '<b style="color:#f472b6">DUEL ARENA</b> <span id="du-status">starting…</span><pre id="du-out" style="white-space:pre;margin:8px 0 0"></pre>';
  document.body.appendChild(panel);
  const statusEl = panel.querySelector('#du-status');
  const outEl = panel.querySelector('#du-out');

  async function run() {
    await waitGame(0.5);
    eng.devDuelStart(CENTER.x, CENTER.z);
    const bots = eng.devBots();
    const blue = bots.filter((b) => b.team === 0).slice(0, 2);
    const red = bots.filter((b) => b.team === 1).slice(0, 2);
    const rows = [];
    let n = 0;
    const total = matchups.length * TRIALS;
    for (const [teamA, teamB] of matchups) {
      const res = { a: teamA, b: teamB, winsA: 0, winsB: 0, draws: 0, times: [], hpLeft: [] };
      for (let t = 0; t < TRIALS; t++) {
        n++;
        statusEl.textContent = 'trial ' + n + '/' + total + ': ' + teamA.join('+') + ' vs ' + teamB.join('+');
        const aIsBlue = t % 2 === 0; // swap sides every trial
        const blueHeroes = aIsBlue ? teamA : teamB, redHeroes = aIsBlue ? teamB : teamA;
        const inPlay = [];
        // variation so rounds don't replay identically: the fight axis turns, the gap is 6-10m, and each bot gets a
        // short random reaction delay and a small head start / lag on its Q and E cooldowns
        const axis = Math.random() * Math.PI * 2, gap = 6 + Math.random() * 4;
        const place = (list, heroes, side) => heroes.forEach((h, i) => {
          const b = list[i];
          eng.devDuelSetBot(b, h, level, DATA.testBuildItems(h, level, build));
          const lat = heroes.length > 1 ? (i === 0 ? -1.6 : 1.6) : 0;
          const px = CENTER.x + Math.sin(axis) * side * gap / 2 + Math.cos(axis) * lat + (Math.random() - 0.5);
          const pz = CENTER.z + Math.cos(axis) * side * gap / 2 - Math.sin(axis) * lat + (Math.random() - 0.5);
          eng.devDuelResetBot(b, px, pz, Math.atan2(CENTER.x - px, CENTER.z - pz));
          b.atkAnimTimer = Math.random() * 0.4;
          b.cdQ = Math.random() * 1.2;
          b.cdE = Math.random() * 1.2;
          inPlay.push(b);
        });
        place(blue, blueHeroes, -1);
        place(red, redHeroes, 1);
        const start = gameNow();
        let winner = null;
        while (gameNow() - start < ROUND_MAX) {
          await sleep(15);
          inPlay.forEach((b) => { if (b.respawnTimer > 0 && b.respawnTimer < 1e8) b.respawnTimer = 1e9; }); // dead stays dead this round
          const blueUp = inPlay.some((b) => b.team === 0 && b.respawnTimer <= 0);
          const redUp = inPlay.some((b) => b.team === 1 && b.respawnTimer <= 0);
          if (!blueUp || !redUp) { winner = blueUp ? 0 : (redUp ? 1 : -1); break; }
        }
        const dur = gameNow() - start;
        if (winner === null || winner === -1) res.draws++;
        else {
          const aWon = (winner === 0) === aIsBlue;
          if (aWon) res.winsA++; else res.winsB++;
          res.times.push(dur);
          const survivors = inPlay.filter((b) => b.team === winner && b.respawnTimer <= 0);
          res.hpLeft.push(survivors.reduce((s, b) => s + b.hp / b.maxHp, 0) / Math.max(1, survivors.length));
        }
        inPlay.forEach((b) => { b.respawnTimer = 1e9; b.pivot.visible = false; if (b.plate) b.plate.style.display = 'none'; });
        await waitGame(0.6); // let projectiles and zones from the last round die out
      }
      res.avgTime = res.times.length ? res.times.reduce((x, y) => x + y, 0) / res.times.length : null;
      res.avgHpLeft = res.hpLeft.length ? res.hpLeft.reduce((x, y) => x + y, 0) / res.hpLeft.length : null;
      rows.push(res);
      console.log('DUEL ROW ' + JSON.stringify({ a: res.a, b: res.b, winsA: res.winsA, winsB: res.winsB, draws: res.draws, avgTime: res.avgTime, avgHpLeft: res.avgHpLeft }));
    }
    eng.devDuelEnd();
    report(rows);
  }

  function report(rows) {
    const L = [];
    const name = (team) => team.join(' + ');
    L.push('# Duel Arena (' + mode + ', Lv' + level + ', build: ' + build + ', ' + TRIALS + ' trials per matchup, sides swapped each trial)');
    L.push('');
    L.push('| A | B | A wins | B wins | draws | A win % | avg time to kill (s) | winner HP left |');
    L.push('|---|---|---|---|---|---|---|---|');
    rows.forEach((r) => {
      const decided = r.winsA + r.winsB;
      L.push('| ' + name(r.a) + ' | ' + name(r.b) + ' | ' + r.winsA + ' | ' + r.winsB + ' | ' + r.draws + ' | ' +
        (decided ? Math.round(100 * r.winsA / decided) + '%' : '-') + ' | ' + (r.avgTime !== null ? r.avgTime.toFixed(1) : '-') + ' | ' +
        (r.avgHpLeft !== null ? Math.round(100 * r.avgHpLeft) + '%' : '-') + ' |');
    });
    if (mode === '1v1' && rows.length > 1) {
      const hs = fighters.filter((h) => rows.some((r) => r.a[0] === h || r.b[0] === h));
      const cellOf = (h, o) => {
        const r = rows.find((x) => (x.a[0] === h && x.b[0] === o) || (x.a[0] === o && x.b[0] === h));
        if (!r) return '-';
        const w = r.a[0] === h ? r.winsA : r.winsB, l = r.a[0] === h ? r.winsB : r.winsA;
        return (w + l) ? Math.round(100 * w / (w + l)) + '%' : 'draw';
      };
      L.push('');
      L.push('## Win rate grid (row hero vs column hero)');
      L.push('');
      L.push('| | ' + hs.join(' | ') + ' | overall |');
      L.push('|---|' + hs.map(() => '---').join('|') + '|---|');
      hs.forEach((h) => {
        let w = 0, tot = 0;
        rows.forEach((r) => {
          if (r.a[0] === h) { w += r.winsA; tot += r.winsA + r.winsB; }
          if (r.b[0] === h) { w += r.winsB; tot += r.winsA + r.winsB; }
        });
        L.push('| ' + h + ' | ' + hs.map((o) => (o === h ? '-' : cellOf(h, o))).join(' | ') + ' | ' + (tot ? Math.round(100 * w / tot) + '%' : '-') + ' |');
      });
    }
    const text = L.join('\n');
    L.forEach((line) => console.log('DUEL MD ' + line));
    console.log('DUEL done');
    statusEl.textContent = 'done (' + rows.length + ' matchups)';
    statusEl.style.color = '#4ade80';
    outEl.textContent = text;
    const b = document.createElement('button');
    b.textContent = 'Copy markdown';
    b.style.cssText = 'margin-top:8px;background:#1e293b;color:#f472b6;border:1px solid #f472b6;border-radius:4px;padding:4px 8px;cursor:pointer;';
    b.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(text); };
    panel.appendChild(b);
  }

  run();
})();
