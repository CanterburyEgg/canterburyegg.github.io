// =====================================================================
// CHARACTER CREATOR: name + look, with a turntable preview. Controls come from the schema in
// character_look.js (CREATOR_TABS); the look is plain data, so the result drops straight into a save.
// =====================================================================
import * as THREE from 'three';
import { createCharacter } from './player_character.js';
import { CREATOR_TABS, normalizeLook, getPath, setPath, randomLook } from './character_look.js';
import { PRESETS } from '../data/presets.js';

const NAME_IDEAS = ['Rook', 'Juno', 'Tam', 'Wren', 'Cato', 'Ines', 'Marlo', 'Sela', 'Bram', 'Odile', 'Hollis', 'Pell', 'Dace', 'Nell', 'Lio', 'Vesna'];
const EXPRESSIONS = [['neutral', 'Neutral'], ['happy', 'Happy'], ['grin', 'Grin'], ['smug', 'Smug'], ['surprised', 'Surprised'], ['angry', 'Angry']];
// Preview loop: what the drifter does while you fiddle.
const PREVIEW_LOOP = [['idle', 5, false], ['talk', 4, true], ['idle', 3, false], ['cheer', 2.6, false]];
const CAMS = { body: { y: 1.0, dist: 3.6, minD: 1.8, maxD: 5 }, face: { y: 1.6, dist: 1.0, minD: 0.6, maxD: 2.2 } };

export function createCreator({ getCellFrac, onBegin, onBack }) {
  const el = document.createElement('section');
  el.id = 'creator';
  el.setAttribute('aria-label', 'Character creator');
  el.innerHTML = `
    <div class="cr-stage">
      <canvas class="cr-canvas"></canvas>
      <div class="cr-building">Tailoring…</div>
      <div class="cr-expr">${EXPRESSIONS.map(([k, l]) => `<button type="button" data-expr="${k}">${l}</button>`).join('')}</div>
      <div class="cr-hint muted">Drag to turn · scroll to zoom</div>
    </div>
    <div class="cr-panel">
      <div class="cr-head">
        <div class="cr-title">Create your drifter</div>
        <label class="cr-name"><span>Name</span><input maxlength="24" spellcheck="false" autocomplete="off" /></label>
      </div>
      <div class="cr-presets">${PRESETS.map((p) => `<button type="button" data-preset="${p.id}" title="${p.blurb}">${p.name}</button>`).join('')}<button type="button" data-act="random" title="Roll a random drifter">🎲 Random</button></div>
      <div class="cr-tabs">${CREATOR_TABS.map((t) => `<button type="button" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
      <div class="cr-controls"></div>
      <div class="cr-foot">
        <button type="button" data-act="back">Back</button>
        <button type="button" data-act="begin" class="primary">Begin</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const canvas = $('.cr-canvas'), controlsEl = $('.cr-controls'), nameIn = $('.cr-name input'), buildingEl = $('.cr-building');

  // ---- preview scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a3428', 1.0));
  const key = new THREE.DirectionalLight('#fff4e0', 2.0);
  key.position.set(2.5, 4, 3.5);
  const rim = new THREE.DirectionalLight('#9fc8ff', 0.9);
  rim.position.set(-3, 2.5, -3);
  scene.add(key, rim);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.82, 0.06, 28), new THREE.MeshStandardMaterial({ color: '#2a3344', roughness: 0.6, flatShading: true }));
  disc.position.y = -0.03;
  scene.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.012, 6, 48), new THREE.MeshBasicMaterial({ color: '#ffd77a' }));
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);
  const turntable = new THREE.Group();
  scene.add(turntable);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const view = { y: CAMS.body.y, dist: CAMS.body.dist, goalY: CAMS.body.y, goalDist: CAMS.body.dist, yaw: 0.35, mode: 'body' };

  let look = normalizeLook(randomLook());
  let tab = CREATOR_TABS[0].id;
  let char = null, token = 0, buildTimer = 0, open = false, raf = 0, last = 0;
  let loopIdx = 0, loopLeft = PREVIEW_LOOP[0][1], expr = 'neutral';

  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', () => { if (open) resize(); });

  async function rebuild() {
    const my = ++token;
    buildingEl.classList.add('show');
    try {
      const c = await createCharacter(look, { cellFrac: getCellFrac() });
      if (my !== token || !open) { c.dispose(); return; }
      if (char) char.dispose();
      char = c;
      turntable.add(c.root);
      const [role] = PREVIEW_LOOP[loopIdx];
      c.play(role === 'cheer' ? 'idle' : role, { fade: 0 });
      if (c.face) { c.face.setExpression(expr); c.face.setTalking(PREVIEW_LOOP[loopIdx][2]); }
    } catch (e) {
      console.error('Creator preview failed', e);
    } finally {
      if (my === token) buildingEl.classList.remove('show');
    }
  }
  function scheduleRebuild(ms = 220) {
    clearTimeout(buildTimer);
    buildTimer = setTimeout(rebuild, ms);
  }

  // ---- controls
  function renderControls() {
    el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const t = CREATOR_TABS.find((x) => x.id === tab);
    view.mode = t.camera;
    view.goalY = CAMS[t.camera].y;
    view.goalDist = CAMS[t.camera].dist;
    controlsEl.innerHTML = t.controls.filter((c) => !c.showIf || c.showIf(look)).map((c) => {
      const v = getPath(look, c.key);
      let input = '';
      if (c.type === 'range') input = `<input type="range" min="${c.min}" max="${c.max}" value="${v}" data-key="${c.key}" />`;
      else if (c.type === 'choice') input = `<div class="cr-seg">${c.options.map(([val, lab]) => `<button type="button" data-key="${c.key}" data-val="${val}" class="${val === v ? 'on' : ''}">${lab}</button>`).join('')}</div>`;
      else if (c.type === 'toggle') input = `<div class="cr-seg"><button type="button" data-key="${c.key}" data-val="false" class="${!v ? 'on' : ''}">Off</button><button type="button" data-key="${c.key}" data-val="true" class="${v ? 'on' : ''}">On</button></div>`;
      else if (c.type === 'color') input = `<div class="cr-swatches">${c.palette.map((hex) => `<button type="button" class="sw ${hex === v ? 'on' : ''}" style="--c:${hex}" data-key="${c.key}" data-val="${hex}" aria-label="${hex}"></button>`).join('')}<label class="sw custom" title="Custom color" style="--c:${v}"><input type="color" value="${v}" data-key="${c.key}" /></label></div>`;
      return `<div class="cr-row ${c.type}"><span class="cr-label">${c.label}</span>${input}</div>`;
    }).join('');
  }
  function setValue(path, raw) {
    const ctl = CREATOR_TABS.flatMap((t) => t.controls).find((c) => c.key === path);
    const v = ctl.type === 'range' ? Number(raw) : ctl.type === 'toggle' ? raw === 'true' || raw === true : raw;
    setPath(look, path, v);
    if (ctl.type !== 'range') renderControls(); // refresh highlights and showIf rows
    scheduleRebuild(ctl.type === 'range' ? 260 : 60);
  }
  controlsEl.addEventListener('input', (e) => {
    const k = e.target.dataset.key;
    if (!k) return;
    if (e.target.type === 'color') { e.target.parentElement.style.setProperty('--c', e.target.value); setPath(look, k, e.target.value); scheduleRebuild(260); return; }
    setValue(k, e.target.value);
  });
  controlsEl.addEventListener('change', (e) => { if (e.target.type === 'color') renderControls(); });
  controlsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-key]');
    if (b) setValue(b.dataset.key, b.dataset.val);
  });
  el.querySelector('.cr-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) { tab = b.dataset.tab; renderControls(); }
  });
  el.querySelector('.cr-presets').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'random') look = normalizeLook(randomLook());
    else look = normalizeLook(JSON.parse(JSON.stringify(PRESETS.find((p) => p.id === b.dataset.preset).look)));
    el.querySelectorAll('.cr-presets button').forEach((x) => x.classList.toggle('on', x === b && !b.dataset.act));
    renderControls();
    scheduleRebuild(30);
  });
  el.querySelector('.cr-expr').addEventListener('click', (e) => {
    const b = e.target.closest('[data-expr]');
    if (!b) return;
    expr = b.dataset.expr;
    el.querySelectorAll('[data-expr]').forEach((x) => x.classList.toggle('on', x === b));
    if (char && char.face) char.face.setExpression(expr);
    if (view.mode !== 'face') { view.goalY = CAMS.face.y; view.goalDist = CAMS.face.dist; view.mode = 'face'; }
  });
  $('[data-act="back"]').addEventListener('click', () => { hide(); onBack(); });
  $('[data-act="begin"]').addEventListener('click', () => {
    const name = nameIn.value.trim() || nameIn.placeholder;
    const result = JSON.parse(JSON.stringify(look));
    hide();
    onBegin(name, result);
  });
  nameIn.addEventListener('keydown', (e) => e.stopPropagation());

  // ---- turntable input
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (drag) { view.yaw += (e.clientX - drag.x) * 0.01; drag.x = e.clientX; } });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const c = CAMS[view.mode];
    view.goalDist = Math.min(c.maxD, Math.max(c.minD, view.goalDist * (1 + Math.sign(e.deltaY) * 0.1)));
  }, { passive: false });

  function frame(now) {
    if (!open) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    view.y += (view.goalY - view.y) * Math.min(1, dt * 5);
    view.dist += (view.goalDist - view.dist) * Math.min(1, dt * 5);
    turntable.rotation.y = view.yaw;
    camera.position.set(0, view.y + view.dist * 0.08, view.dist);
    camera.lookAt(0, view.y, 0);
    if (char) {
      loopLeft -= dt;
      if (loopLeft <= 0) {
        loopIdx = (loopIdx + 1) % PREVIEW_LOOP.length;
        const [role, dur, talking] = PREVIEW_LOOP[loopIdx];
        loopLeft = dur;
        char.play(role);
        if (char.face) char.face.setTalking(talking);
      }
      char.update(dt);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function show({ look: start, name } = {}) {
    look = normalizeLook(start || randomLook());
    nameIn.value = name || '';
    nameIn.placeholder = NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)];
    tab = CREATOR_TABS[0].id;
    expr = 'neutral';
    el.querySelectorAll('.cr-presets button, [data-expr]').forEach((x) => x.classList.remove('on'));
    el.classList.add('show');
    open = true;
    resize();
    renderControls();
    rebuild();
    last = performance.now();
    raf = requestAnimationFrame(frame);
    setTimeout(() => nameIn.focus(), 50);
  }
  function hide() {
    open = false;
    cancelAnimationFrame(raf);
    clearTimeout(buildTimer);
    el.classList.remove('show');
    if (char) { char.dispose(); char = null; }
  }
  return { show, hide, isOpen: () => open, get look() { return look; }, setLook(l) { look = normalizeLook(l); renderControls(); scheduleRebuild(0); }, setTab(t) { tab = t; renderControls(); } };
}
