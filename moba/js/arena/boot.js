// MOBA 3D arena: Loading screen: loads hero bundles, warms up shaders, starts the loop; selftest hook.
// Classic script (not a module) so the game still works from file://. Loaded in order by arena3d.html;
// top-level let/const/function names are shared across all js/arena/*.js files.
'use strict';

// Map structure models: assets/map/map_bundle.js (base64 GLBs) -> window.MOBA_MAP_TEMPLATES -> engine rebuilds structures.
// Missing bundle or a parse error just leaves the old primitive structures in place.
async function loadMapModels() {
  if (!window.MOBA_MAP_MODELS) await loadScriptAsync('assets/map/map_bundle.js');
  const src = window.MOBA_MAP_MODELS;
  if (!src) return;
  const parseGlb = (b64) => new Promise((resolve) => {
    try {
      gltfLoader.parse(b64ToBuffer(b64), '', (g) => resolve(g.scene), () => resolve(null));
    } catch (e) {
      resolve(null);
    }
  });
  const tmpl = {};
  const [tower, hearth] = await Promise.all([parseGlb(src.towerGlbB64), parseGlb(src.hearthGlbB64)]);
  if (tower) tmpl.tower = tower;
  if (hearth) tmpl.hearth = hearth;
  window.MOBA_MAP_TEMPLATES = tmpl;
  if (phase1Engine && phase1Engine.notifyMapModelsReady) phase1Engine.notifyMapModelsReady();

  // Armor minions (regular + super): skinned idle model + clips
  if (!window.MOBA_MINION_BUNDLE) await loadScriptAsync('assets/map/minion_bundle.js');
  const mb = window.MOBA_MINION_BUNDLE;
  if (mb) {
    try {
      const fbx = (b64) => fbxLoader.parse(b64ToBuffer(b64), '');
      const clip = (b64) => { const f = fbx(b64); return f.animations[0] || null; };
      const build = (pre, attackKeys) => {
        const base = fbx(mb[pre + 'Idle']);
        base.traverse((ch) => { if (ch.isMesh && ch.geometry && !ch.geometry.attributes.normal) ch.geometry.computeVertexNormals(); });
        const t = { fbx: base, tex: loadHeroDiffuseTexture(mb[pre + 'Tex']), clips: { idle: base.animations[0], walk: clip(mb[pre + 'Walk']), death: clip(mb[pre + 'Death']) } };
        Object.keys(attackKeys).forEach((slot) => { t.clips[slot] = clip(mb[attackKeys[slot]]); });
        return t;
      };
      window.MOBA_MINION_TEMPLATES = {
        minion: build('minion', { melee: 'minionMelee', ranged: 'minionRanged' }),
        super: build('super', { melee: 'superAttack' })
      };
      if (phase1Engine && phase1Engine.notifyMinionTemplatesReady) phase1Engine.notifyMinionTemplatesReady();
    } catch (e) {
      console.warn('Minion bundle failed to parse; keeping primitive minions', e);
    }
  }
}

// Preload & parse all 5 v2 Mixamo Hero Bundles + 3D Crossbow + WebGL Shader Compile behind the loading bar
// so there is zero stutter once the Arena is revealed!
async function bootArenaWithLoadingBar() {
  const overlay = document.getElementById('arena-loader-overlay');
  const barFill = document.getElementById('loader-bar-fill');
  const stepTxt = document.getElementById('loader-step-txt');
  const pctTxt = document.getElementById('loader-pct-txt');
  const setProgress = (pct, msg) => {
    if (barFill) barFill.style.width = pct + '%';
    if (pctTxt) pctTxt.textContent = pct + '%';
    if (stepTxt && msg) stepTxt.textContent = msg;
  };
  const setPillState = (id, state) => {
    const el = document.getElementById('ld-pill-' + id);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (state) el.classList.add(state);
  };
  const yieldForPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20)));

  const steps = [];
  Object.values(window.MOBA_HEROES || {}).forEach((k) => {
    if (k.bundle) steps.push({ id: k.id, label: k.bundle.label, src: k.bundle.src, globalKey: k.bundle.globalKey, pStart: k.bundle.pStart, pEnd: k.bundle.pEnd });
  });
  steps.sort((a, b) => a.pStart - b.pStart); // keep the original loading order

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    setPillState(s.id, 'active');
    setProgress(s.pStart, 'Loading ' + (i + 1) + '/' + steps.length + ': ' + s.label + '...');
    await yieldForPaint();

    if (!window[s.globalKey]) {
      await loadScriptAsync(s.src);
    }
    setProgress(Math.round((s.pStart + s.pEnd) * 0.5), 'Rigging ' + s.label + ' Mixamo Skeleton...');
    await yieldForPaint();

    ensureHeroTemplateReady(s.id);
    const stepKit = heroKit(s.id);
    if (stepKit && stepKit.mountProps) {
      await stepKit.mountProps();
    }
    setPillState(s.id, 'done');
    setProgress(s.pEnd, s.label + ' Ready!');
    await yieldForPaint();
  }

  setProgress(94, 'Raising the Castle Towers...');
  await yieldForPaint();
  await loadMapModels();

  setProgress(96, 'Spawning 4v4 Bots & Compiling WebGL Shaders...');
  await yieldForPaint();

  await Promise.all(pendingTexPromises);
  if (phase1Engine) phase1Engine.notifyTemplatesReady();
  switchHero('coyote');

  // Warm up all Three.js materials, textures, and shadow maps behind the curtain so Frame 1 has zero GPU hitch!
  const camY = Math.sin(CAM_PITCH) * camDist;
  const camZOff = Math.cos(CAM_PITCH) * camDist;
  camera.position.set(hero.x, camY, hero.z + camZOff);
  camera.lookAt(hero.x, 0.9, hero.z);
  camera.updateMatrixWorld();
  renderer.compile(scene, camera);
  renderer.render(scene, camera);

  setProgress(100, 'Entering the Coliseum!');
  await yieldForPaint();

  if (overlay) overlay.classList.add('hidden');
  last = performance.now();
  requestAnimationFrame(tick);

  // Refactor safety net: ?selftest (all heroes) or ?selftest=<heroId> runs js/selftest.js
  if (window.__MOBA_TEST) {
    loadScriptAsync('js/selftest.js');
  }
  // Dev: ?mapshot logs a top-down render of the whole map to the console as base64 PNG chunks
  if (/[?&]mapshot/.test(location.search)) {
    const dm = /[?&]shotdelay=(\d+)/.exec(location.search);
    setTimeout(logMapShot, dm ? parseInt(dm[1], 10) * 1000 : 1500);
  }
  // Dev: ?clipscan=<heroId> logs each clip's key moments (contact, kiss/drink, spin) for timing work
  if (/[?&]clipscan=/.test(location.search)) {
    loadScriptAsync('js/clipscan.js').then(() => window.__runClipScan && window.__runClipScan());
  }
  // Dev: ?hero=<id> starts as that hero; &heroshot[=action] logs a close-up (action: punch|kick|slide|run|...)
  const hm = /[?&]hero=([a-z]+)/.exec(location.search);
  if (hm) switchHero(hm[1]);
  const hs = /[?&]heroshot(?:=([a-zA-Z]+))?/.exec(location.search);
  if (hs) {
    const act = hs[1];
    if (act === 'run') { keys.KeyD = true; }
    else if (act === 'Q' || act === 'E' || act === 'R') { setTimeout(() => castKey(act), 600); }
    else if (act === 'lmb') { setTimeout(() => tryAttack(), 600); }
    else if (act && actions[act]) setTimeout(() => fadeToAction(actions[act], 0.05, true, 1.0, 0), 600);
    const dh = /[?&]shotdelay=(\d+)/.exec(location.search);
    setTimeout(() => logHeroShot(), dh ? parseInt(dh[1], 10) * 1000 : (act ? 1000 : 1500));
  }
  // Dev: &botlog=N logs bot kit-cast counts every N seconds (plus any errors)
  const blg = /[?&]botlog=(\d+)/.exec(location.search);
  if (blg) {
    window.addEventListener('error', (e) => console.log('BOTLOG error ' + e.message + ' @' + e.filename + ':' + e.lineno));
    let n = 0;
    const iv = setInterval(() => {
      n++;
      const cb = phase1Engine && phase1Engine.devBots ? phase1Engine.devBots().find((b) => b.heroType === 'coyote') : null;
      const info = cb ? { t: Math.round(phase1Engine.devMatchTime()), x: Math.round(cb.x), z: Math.round(cb.z), lv: cb.level, hp: Math.round(cb.hp), dead: cb.respawnTimer > 0 } : 'no coyote bot';
      console.log('BOTLOG ' + n + ' ' + JSON.stringify(window.__kitBotLog || {}) + ' ' + JSON.stringify(info));
      if (n >= 8) { clearInterval(iv); console.log('BOTLOG done'); }
    }, parseInt(blg[1], 10) * 1000);
  }
  // Dev: &devturret=N destroys the Imp's planted turret N seconds in
  const dtur = /[?&]devturret=(\d+)/.exec(location.search);
  if (dtur) setTimeout(() => {
    const k = window.MOBA_HEROES.imp;
    if (k && k.devDestroyTurret) k.devDestroyTurret();
    console.log('HERODBG turret destroyed, tag=' + (k && k.hudTag ? k.hudTag() : ''));
  }, parseInt(dtur[1], 10) * 1000);
  // Dev: &devdie=N kills the player N seconds in (1.5s respawn) and logs whether they came back
  const dd = /[?&]devdie=(\d+)/.exec(location.search);
  if (dd && phase1Engine) {
    window.addEventListener('error', (e) => console.log('DIEDBG error ' + e.message + ' @' + e.filename + ':' + e.lineno));
    setTimeout(() => {
      const pp = phase1Engine.getPlayerProg();
      hero.hp = 0;
      pp.respawnTimer = 1.5;
      console.log('DIEDBG died ' + JSON.stringify({ x: hero.x, z: hero.z }));
      let n = 0;
      const iv = setInterval(() => {
        n++;
        const done = pp.respawnTimer <= 0 || n >= 12;
        console.log('DIEDBG ' + (done ? 'after ' : 'tick ') + JSON.stringify({ t: +pp.respawnTimer.toFixed(2), hp: Math.round(hero.hp), x: hero.x, z: hero.z, vis: heroPivot.visible }));
        if (done) clearInterval(iv);
      }, 2000);
    }, parseInt(dd[1], 10) * 1000);
  }
}

function logHeroShot() {
  console.log('HERODBG ' + JSON.stringify({ kickAnim: hero.kickAnim, oneShot: oneShotActive, act: activeAction && activeAction.getClip().name, t: activeAction && +activeAction.time.toFixed(2), ts: activeAction && activeAction.getEffectiveTimeScale(), cdQ: hero.cdQ }));
  const cam = new THREE.PerspectiveCamera(35, renderer.domElement.width / renderer.domElement.height, 0.1, 200);
  const yaw = heroPivot.rotation.y;
  // &shotbone=<Bone>[&shotdist=m]: three close-ups (front / side / back-ish) around one bone, side by side
  const sb = /[?&]shotbone=([A-Za-z0-9]+)/.exec(location.search);
  if (sb && heroBones[sb[1]]) {
    const sd = /[?&]shotdist=([\d.]+)/.exec(location.search);
    const dist = sd ? parseFloat(sd[1]) : 0.9;
    const p = heroBones[sb[1]].getWorldPosition(new THREE.Vector3());
    const w = renderer.domElement.width, h = renderer.domElement.height;
    const out = document.createElement('canvas');
    out.width = w * 3; out.height = h;
    const g2 = out.getContext('2d');
    [0.5, Math.PI / 2 + 0.6, -0.9].forEach((a, i) => {
      cam.position.set(p.x + Math.sin(yaw + a) * dist, p.y + dist * 0.35, p.z + Math.cos(yaw + a) * dist);
      cam.lookAt(p);
      renderer.render(scene, cam);
      g2.drawImage(renderer.domElement, i * w, 0);
    });
    const data2 = out.toDataURL('image/png').split(',')[1];
    for (let i = 0; i < data2.length; i += 30000) console.log('RENDERPNG ' + String(i / 30000).padStart(4, '0') + ' ' + data2.slice(i, i + 30000));
    console.log('RENDEREND');
    return;
  }
  // 3/4 front view of the hero
  cam.position.set(hero.x + Math.sin(yaw + 0.6) * 5.5, 2.4, hero.z + Math.cos(yaw + 0.6) * 5.5);
  cam.lookAt(hero.x, 1.0, hero.z);
  renderer.render(scene, cam);
  const data = renderer.domElement.toDataURL('image/png').split(',')[1];
  const CH = 30000;
  for (let i = 0; i < data.length; i += CH) console.log('RENDERPNG ' + String(i / CH).padStart(4, '0') + ' ' + data.slice(i, i + CH));
  console.log('RENDEREND');
}

function logMapShot() {
  const M = window.MOBA_MAP;
  const m = /[?&]mapshot=([-\d.]+),([-\d.]+),([\d.]+)/.exec(location.search); // optional cx,cz,halfWidth
  const cx = m ? parseFloat(m[1]) : 0, cz = m ? parseFloat(m[2]) : 0;
  const halfW = m ? parseFloat(m[3]) : M.W / 2 + 2;
  const aspect = renderer.domElement.width / renderer.domElement.height;
  const halfH = halfW / aspect;
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 400);
  cam.position.set(cx, 150, cz);
  cam.up.set(0, 0, -1);
  cam.lookAt(cx, 0, cz);
  renderer.render(scene, cam);
  const data = renderer.domElement.toDataURL('image/png').split(',')[1];
  const CH = 30000;
  for (let i = 0; i < data.length; i += CH) console.log('RENDERPNG ' + String(i / CH).padStart(4, '0') + ' ' + data.slice(i, i + CH));
  console.log('RENDEREND');
}


// =========================================================
// SELFTEST HOOK (only exists when the URL contains ?selftest)
// Keep this API stable during the refactor so selftest.js never changes.
// =========================================================
if (/[?&]selftest/.test(location.search)) {
  window.__MOBA_TEST = {
    aim: null,
    gameTime: 0, // seconds of simulated game time (sum of tick dt), frame-rate independent
    noRender: /[?&]norender/.test(location.search), // headless runs: skip drawing, keep logic
    onDummyDamage: null,
    api: {
      hero,
      dummies,
      switchHero,
      castKey,
      tryAttack,
      getEngine: () => phase1Engine,
      getActiveHeroId: () => activeHeroId,
      isBusy: () => !!(
        arena || sorcMonolith || pendingStrike || pendingGrenadeThrow || pendingSorcBolt || pendingSorcUlt ||
        heroBolts.length || heroGrenades.length || sorcPillars.length ||
        hero.rChargeTimer > 0 || hero.dashTimer > 0 || hero.leapTimer > 0 || (hero.qFlurryRemaining || 0) > 0 ||
        Object.values(window.MOBA_HEROES || {}).some((k) => k.isBusy && k.isBusy())
      ),
      endLingeringZones: () => { if (arena) arena.life = 0; }
    }
  };
}

bootArenaWithLoadingBar();
