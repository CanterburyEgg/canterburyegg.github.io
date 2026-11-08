// MOBA 3D arena: Loading screen: loads hero bundles, warms up shaders, starts the loop; selftest hook.
// Classic script (not a module) so the game still works from file://. Loaded in order by arena3d.html;
// top-level let/const/function names are shared across all js/arena/*.js files.
'use strict';

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
    setProgress(s.pStart, 'Loading ' + (i + 1) + '/5: ' + s.label + '...');
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
        hero.rChargeTimer > 0 || hero.dashTimer > 0 || hero.leapTimer > 0 || (hero.qFlurryRemaining || 0) > 0
      ),
      endLingeringZones: () => { if (arena) arena.life = 0; }
    }
  };
}

bootArenaWithLoadingBar();
