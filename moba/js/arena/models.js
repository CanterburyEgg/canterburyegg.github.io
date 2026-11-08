// MOBA 3D arena: Hero pivot, weapon props, FBX/GLB loading, Mixamo retargeting, animation actions, hero templates, switchHero and drag-and-drop model loading.
// Classic script (not a module) so the game still works from file://. Loaded in order by arena3d.html;
// top-level let/const/function names are shared across all js/arena/*.js files.
'use strict';

// =========================================================
// LOAD THE CUSTOM PIT BRAWLER .GLB MODEL
// =========================================================
const heroPivot = new THREE.Group();
const heroTiltNode = new THREE.Group();
heroPivot.add(heroTiltNode);
scene.add(heroPivot);

// Subtle League champion ground selection circle
const footRing = new THREE.Mesh(
  new THREE.RingGeometry(0.68, 0.78, 40),
  new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
);
footRing.rotation.x = -Math.PI / 2;
footRing.position.y = 0.03;
heroPivot.add(footRing);

// Shield Sphere VFX around Brawler
const shieldSphere = new THREE.Mesh(
  new THREE.SphereGeometry(1.25, 24, 18),
  new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.22, wireframe: false })
);
shieldSphere.position.y = 1.15;
shieldSphere.visible = false;
heroPivot.add(shieldSphere);

let currentModel = null;
let mixer = null;
let unlitHandPaintedMode = false;
let loadedMeshes = [];
let fallbackBrawlerTex = null; // Cached 2K diffuse texture for active hero

// Smooth Mixamo Multi-Clip Action State
const rawClips = { idle: null, run: null, crawl: null, punch: null, punch2: null, kick: null, slide: null, jump: null };
const actions = { idle: null, run: null, crawl: null, punch: null, punch2: null, kick: null, slide: null, jump: null };
let activeAction = null;
let oneShotActive = false;
let dashStyleMode = 'combo'; // 'combo' (Flying Kick E1 -> Slide E2) | 'slide' | 'jump'

// Hand bones on currentModel for 3D weapon prop attachment
let rightHandBone = null;
let leftHandBone = null;

// 3D Heavy Repeating Crossbow Prop (for Coyote Crossbowman)
const crossbowPivot = new THREE.Group();
crossbowPivot.visible = false;
scene.add(crossbowPivot);

// 3D Magician's Star Wand Prop (for Astral Sorceress)
const wandPivot = new THREE.Group();
wandPivot.visible = false;
{
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.024, 0.72, 8),
    new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.35, metalness: 0.65 })
  );
  shaft.rotation.x = Math.PI / 2;
  shaft.position.set(0, 0, 0.28);
  wandPivot.add(shaft);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.036, 0.09, 8),
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.3, metalness: 0.85 })
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0, 0.58);
  wandPivot.add(collar);

  const starHead = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.11, 0),
    new THREE.MeshBasicMaterial({ color: 0xec4899 })
  );
  starHead.position.set(0, 0, 0.68);
  wandPivot.add(starHead);

  const haloRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.016, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  haloRing.position.set(0, 0, 0.68);
  wandPivot.add(haloRing);
}
scene.add(wandPivot);

// Muzzle charge orb on tip of Crossbow (glows during Coyote R Heartseeker charge!)
const muzzleOrb = new THREE.Mesh(
  new THREE.SphereGeometry(0.14, 14, 12),
  new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.9 })
);
muzzleOrb.position.set(0, 0.05, 0.68);
muzzleOrb.visible = false;
crossbowPivot.add(muzzleOrb);

// 3D Hand-Held Grenade Prop (shown in RightHand during E Grenade windup!)
const handGrenadeMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.11, 12, 10),
  new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7, emissive: 0x9f1239, emissiveIntensity: 0.5 })
);
handGrenadeMesh.visible = false;
scene.add(handGrenadeMesh);

// Coyote R Heartseeker Laser Sight Beam on ground/air
const laserSightGeo = new THREE.PlaneGeometry(0.14, 18.0);
laserSightGeo.translate(0, 9.0, 0);
const laserSightMesh = new THREE.Mesh(
  laserSightGeo,
  new THREE.MeshBasicMaterial({ color: 0xf43f5e, side: THREE.DoubleSide, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false })
);
laserSightMesh.rotation.x = -Math.PI / 2;
laserSightMesh.visible = false;
scene.add(laserSightMesh);

const gltfLoader = new GLTFLoader();

// Custom LoadingManager prevents external 'texture.jpg' 404 console spam when parsing FBX buffers on file://
const EMPTY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=';
const fbxManager = new THREE.LoadingManager();
fbxManager.setURLModifier((url) => {
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  return EMPTY_PNG;
});
const fbxLoader = new FBXLoader(fbxManager);

function canonicalMixamoBone(rawName) {
  return rawName.replace(/^.*?(mixamorig\d*:?|:)/i, '');
}

function updateSlotPills() {
  const isCoyote = activeHeroId === 'coyote';
  const pl = (heroKit() && heroKit().pillLabels) || {};
  const slots = [
    ['idle', 'pill-idle', 'Idle'],
    ['run', 'pill-run', 'Run'],
    ['punch', 'pill-punch', isCoyote ? 'Fire' : (pl.punch || 'Punch')],
    ['kick', 'pill-kick', isCoyote ? 'Grenade' : (pl.kick || 'Kick')],
    ['dash', 'pill-dash', isCoyote ? 'Crossbow' : (pl.dash || 'Dash')]
  ];
  slots.forEach(([key, id, label]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const has = key === 'dash'
      ? (isCoyote ? crossbowPivot.children.length > 1 : pl.dashReady ? pl.dashReady() : !!(actions.slide || actions.jump))
      : !!actions[key];
    el.textContent = label + (has ? ' ✓' : ' —');
    el.style.background = has ? 'hsla(142, 65%, 36%, 0.32)' : 'rgba(255,255,255,0.07)';
    el.style.color = has ? '#86efac' : 'var(--text-muted)';
    el.style.border = has ? '1px solid rgba(74,222,128,0.45)' : '1px solid transparent';
  });
}

function classifyClipSlot(filename) {
  const s = (filename || '').toLowerCase();
  if (/slide|tackle|skid/.test(s)) return 'slide';
  if (/jump|leap|vault|hop|dive/.test(s)) return 'jump';
  if (/2h|area|kick|mma|roundhouse|stomp|knee|grenade|toss|throw/.test(s)) return 'kick';
  if (/1h|magic|cast|spell|punch|jab|hook|cross|uppercut|combo|strike|attack|fist|fire|firing|shoot|gun|wand/.test(s)) return 'punch';
  if (/run|sprint|jog|walk|move|locomot/.test(s)) return 'run';
  if (/idle|stand|fight|guard|ready|breath|boxing|brawl|aim/.test(s)) return 'idle';
  if (!rawClips.idle) return 'idle';
  if (!rawClips.run) return 'run';
  if (!rawClips.punch) return 'punch';
  return 'kick';
}

// Retarget a Mixamo AnimationClip cleanly onto currentModel's bone names & lock horizontal Hips drift
function prepareClipForModel(sourceClip, model, slot) {
  const clipTw = (heroKit() && heroKit().clipTweaks) || {};
  const nodeByCanon = {};
  let hipsBone = null;
  model.traverse((obj) => {
    if (!obj.name) return;
    const c = canonicalMixamoBone(obj.name);
    if (c && (obj.isBone || !nodeByCanon[c])) nodeByCanon[c] = obj;
    if (c === 'Hips' && (obj.isBone || !hipsBone)) hipsBone = obj;
  });

  const keptTracks = [];
  sourceClip.tracks.forEach((origTrack) => {
    const dot = origTrack.name.lastIndexOf('.');
    if (dot < 0) return;
    const rawNode = origTrack.name.slice(0, dot);
    const prop = origTrack.name.slice(dot + 1);
    const canon = canonicalMixamoBone(rawNode);
    const targetObj = nodeByCanon[canon];
    if (!targetObj) return;

    // Skip finger bones so gauntlets/claws stay crisp without rubber finger curl!
    if (/Thumb|Index|Middle|Ring|Pinky/i.test(canon)) return;

    // Keep body/limb bone rotations + vertical Hips bounce (clamp horizontal root-motion drift)
    if (prop === 'quaternion') {
      const tr = origTrack.clone();
      tr.name = targetObj.name + '.quaternion';
      // For Panther's all-fours prowl ('crawl'), stabilize the zombie-like side-to-side head/neck waggle
      // and lift his gaze slightly forward so he stalks like a feline predator!
      if (clipTw.crawlStabilizeHead && slot === 'crawl' && (canon === 'Head' || canon === 'Neck')) {
        const qVals = tr.values;
        const q0 = new THREE.Quaternion(qVals[0], qVals[1], qVals[2], qVals[3]);
        const qLift = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), canon === 'Head' ? -0.16 : -0.08);
        const qk = new THREE.Quaternion();
        for (let k = 0; k < qVals.length; k += 4) {
          qk.set(qVals[k], qVals[k + 1], qVals[k + 2], qVals[k + 3]);
          qk.slerp(q0, 0.70).multiply(qLift).normalize();
          qVals[k] = qk.x;
          qVals[k + 1] = qk.y;
          qVals[k + 2] = qk.z;
          qVals[k + 3] = qk.w;
        }
      }
      keptTracks.push(tr);
    } else if (prop === 'position' && canon === 'Hips') {
      const tr = origTrack.clone();
      tr.name = targetObj.name + '.position';
      const vals = tr.values;
      const hx = hipsBone ? hipsBone.position.x : vals[0];
      const hy = hipsBone ? hipsBone.position.y : vals[1];
      const hz = hipsBone ? hipsBone.position.z : vals[2];
      const x0 = vals[0] || 0;
      const y0 = vals[1] || 1;
      const z0 = vals[2] || 0;
      const yScale = (hy > 0.01 && hy < 5 && Math.abs(y0) > 10) ? (hy / y0) : 1;
      // Pin Run, Crawl, Slide, and Jump strictly in-place on X/Z while keeping exact vertical Y drop/arc!
      const inPlace = (slot === 'run' || slot === 'crawl' || slot === 'slide' || slot === 'jump');
      const maxSway = inPlace ? 0.0 : (slot === 'idle' ? 0.06 : 0.10);
      const numKeys = Math.max(1, vals.length / 3);
      for (let k = 0; k < vals.length; k += 3) {
        const dx = THREE.MathUtils.clamp((vals[k] - x0) * yScale, -maxSway, maxSway);
        const dz = THREE.MathUtils.clamp((vals[k + 2] - z0) * yScale, -maxSway, maxSway);
        vals[k] = hx + dx;
        let rawY = yScale === 1 ? vals[k + 1] : vals[k + 1] * yScale;
        if (clipTw.crawlBound && slot === 'crawl') {
          // Add a feline bounding suspension wave so he bounds on all fours instead of dragging flat!
          const phase = ((k / 3) / numKeys) * Math.PI * 2;
          rawY += (0.055 + Math.sin(phase) * 0.055) * hy;
        }
        // For Bodyguard's & Panther's E Leap ('jump'), heroPivot.position.y (airborneY) already drives the parabolic leap arc,
        // so clamp any duplicate upward Hips hop while preserving the landing crouch compression!
        vals[k + 1] = (clipTw.jumpClampHips && slot === 'jump') ? Math.min(hy, rawY) : rawY;
        vals[k + 2] = hz + dz;
      }
      keptTracks.push(tr);
    }
  });

  return new THREE.AnimationClip(activeHeroId + '_' + slot, sourceClip.duration, keptTracks);
}

function fadeToAction(nextAction, fadeDur = 0.14, isOneShot = false, timeScale = 1.0, startAt = 0.0) {
  if (!nextAction) return;
  oneShotActive = isOneShot;
  if (nextAction === activeAction && !isOneShot) {
    activeAction.setEffectiveTimeScale(timeScale);
    return;
  }
  activeAction = nextAction;

  // Smoothly fade out every other enabled action (including paused clampWhenFinished one-shots!)
  Object.values(actions).forEach((act) => {
    if (act && act !== nextAction && act.enabled) {
      act.fadeOut(fadeDur);
    }
  });

  const wasEnabled = nextAction.enabled && nextAction.getEffectiveWeight() > 0.02;
  nextAction.enabled = true;
  nextAction.paused = false;
  nextAction.setEffectiveTimeScale(timeScale);
  nextAction.setEffectiveWeight(1);
  if (isOneShot) {
    nextAction.reset();
    nextAction.time = startAt;
    nextAction.setLoop(THREE.LoopOnce, 1);
    nextAction.clampWhenFinished = true;
    nextAction.setEffectiveTimeScale(timeScale);
    nextAction.fadeIn(fadeDur).play();
  } else {
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.clampWhenFinished = false;
    if (!wasEnabled) {
      nextAction.reset();
      nextAction.setEffectiveTimeScale(timeScale);
      nextAction.fadeIn(fadeDur).play();
    } else {
      nextAction.stopFading();
      nextAction.setEffectiveWeight(1);
      nextAction.play();
    }
  }
}

function bindClipToSlot(slot, clip) {
  rawClips[slot] = clip;
  if (!currentModel) return;
  if (!mixer) {
    mixer = new THREE.AnimationMixer(currentModel);
    mixer.addEventListener('finished', () => {
      oneShotActive = false;
      const fallback = actions.idle || actions.run;
      if (fallback) fadeToAction(fallback, 0.14, false, 1.0);
    });
  }
  if (actions[slot]) {
    actions[slot].stop();
    mixer.uncacheAction(actions[slot].getClip(), currentModel);
  }
  const prepared = prepareClipForModel(clip, currentModel, slot);
  if (prepared.tracks.length === 0) return;
  actions[slot] = mixer.clipAction(prepared);
  updateSlotPills();

  if (slot === 'idle' || !activeAction) {
    fadeToAction(actions.idle || actions[slot], 0.12, false, 1.0);
  }
}

function rebuildAllActionsOnCurrentModel() {
  actions.idle = actions.run = actions.crawl = actions.punch = actions.punch2 = actions.kick = actions.slide = actions.jump = null;
  activeAction = null;
  oneShotActive = false;
  ['idle', 'run', 'crawl', 'punch', 'punch2', 'kick', 'slide', 'jump'].forEach((slot) => {
    if (rawClips[slot]) bindClipToSlot(slot, rawClips[slot]);
  });
  updateSlotPills();
}

function cacheFallbackTextureFromGLB(tex) {
  if (!tex || !tex.image || fallbackBrawlerTex) return;
  try {
    const img = tex.image;
    const w = img.width || img.videoWidth || 1024;
    const h = img.height || img.videoHeight || 1024;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const cloned = new THREE.CanvasTexture(c);
    cloned.flipY = true;
    cloned.colorSpace = THREE.SRGBColorSpace;
    cloned.anisotropy = 4;
    fallbackBrawlerTex = cloned;
  } catch (err) {
    console.warn('Could not cache fallback texture:', err);
  }
}

function applyMaterialStyle() {
  loadedMeshes.forEach((m) => {
    if (!m.userData.origMat) m.userData.origMat = m.material;
    const orig = m.userData.origMat;
    if (unlitHandPaintedMode) {
      const map = orig.map || fallbackBrawlerTex;
      m.material = new THREE.MeshLambertMaterial({
        map,
        emissive: 0x221a16,
        emissiveMap: map,
        emissiveIntensity: 0.28
      });
    } else {
      m.material = orig;
    }
  });
}

let heroBones = {};
function installModelObject(model, label, isFBX) {
  if (currentModel) heroTiltNode.remove(currentModel);
  mixer = null;
  loadedMeshes = [];
  rightHandBone = null;
  leftHandBone = null;
  heroBones = {};

  // Reset transform and auto-scale cleanly to HERO_HEIGHT with feet planted at y=0
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = HERO_HEIGHT / Math.max(0.01, size.y);
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);

  const box2 = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  box2.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box2.min.y;

  model.traverse((child) => {
    if (child.name) {
      const c = canonicalMixamoBone(child.name);
      if (c && (child.isBone || !heroBones[c])) heroBones[c] = child;
      if (c === 'RightHand' && (child.isBone || !rightHandBone)) rightHandBone = child;
      if (c === 'LeftHand' && (child.isBone || !leftHandBone)) leftHandBone = child;
    }
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false; // Prevent animated SkinnedMesh culling at screen edges!
      if (child.geometry) {
        child.geometry.computeVertexNormals();
      }

      if (child.userData && child.userData.keepCustomMat) {
        loadedMeshes.push(child);
        return;
      }

      const srcMat = Array.isArray(child.material) ? child.material[0] : child.material;
      if (!isFBX && srcMat && srcMat.map) {
        srcMat.map.colorSpace = THREE.SRGBColorSpace;
        cacheFallbackTextureFromGLB(srcMat.map);
        srcMat.roughness = 0.78;
        srcMat.metalness = 0.12;
        if (srcMat.normalScale) srcMat.normalScale.set(0.45, 0.45);
        child.material = srcMat;
      } else if (isFBX) {
        let useMap = fallbackBrawlerTex || null;
        if (!useMap && srcMat && srcMat.map && srcMat.map.image && srcMat.map.image.src &&
            srcMat.map.image.src.startsWith('blob:')) {
          useMap = srcMat.map;
          useMap.colorSpace = THREE.SRGBColorSpace;
        }
        child.material = new THREE.MeshStandardMaterial({
          map: useMap,
          color: 0xffffff,
          roughness: 0.78,
          metalness: 0.12
        });
      }
      loadedMeshes.push(child);
    }
  });

  applyMaterialStyle();
  currentModel = model;
  heroTiltNode.add(model);
  rebuildAllActionsOnCurrentModel();
  document.getElementById('lbl-model-name').textContent = label;
}

function loadBufferGLB(arrayBuffer, name) {
  gltfLoader.parse(arrayBuffer, '', (gltf) => {
    installModelObject(gltf.scene, name, false);
    if (gltf.animations && gltf.animations.length > 0) {
      bindClipToSlot('idle', gltf.animations[0]);
      if (gltf.animations[1]) bindClipToSlot('run', gltf.animations[1]);
    }
  }, (err) => console.error('GLB parse error:', err));
}

function loadBufferFBX(arrayBuffer, name, explicitSlot = null, silent = false, customLabel = null) {
  try {
    const fbx = fbxLoader.parse(arrayBuffer, '');
    let hasMesh = false;
    fbx.traverse((c) => { if (c.isMesh) hasMesh = true; });
    const slot = explicitSlot || classifyClipSlot(name);

    if (hasMesh) {
      installModelObject(fbx, customLabel || (silent ? 'Mixamo Rigged Hero' : name), true);
      if (fbx.animations && fbx.animations.length > 0) {
        bindClipToSlot(slot, fbx.animations[0]);
      }
    } else if (fbx.animations && fbx.animations.length > 0) {
      bindClipToSlot(slot, fbx.animations[0]);
    }
    if (!silent) {
      spawnFloat(hero.x, 2.7, hero.z, 'LOADED ' + slot.toUpperCase() + ': ' + name, '#86efac');
    }
  } catch (err) {
    console.error('FBX parse error on ' + name + ':', err);
    if (!silent) spawnFloat(hero.x, 2.7, hero.z, 'FBX Load Error (check console)', '#fb7185');
  }
}

function b64ToBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Pre-parsed 3D Hero Templates shared by Player & all 7 4v4 Mixamo Bots!
const heroTemplates = {
  coyote: { fbx: null, tex: null, clips: {} },
  crossbowScene: null
};
Object.keys(window.MOBA_HEROES || {}).forEach((id) => {
  if (!heroTemplates[id]) heroTemplates[id] = { fbx: null, tex: null, clips: {} };
});
let phase1Engine = null;
let isMovingNow = false;

const pendingTexPromises = [];
function loadHeroDiffuseTexture(dataUrl) {
  let tex = null;
  const p = new Promise((resolve) => {
    tex = new THREE.TextureLoader().load(dataUrl, () => resolve(), undefined, () => resolve());
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  pendingTexPromises.push(p);
  return tex;
}

function parseCoyoteBundle(bundle, targetTmpl) {
  if (!bundle || targetTmpl.fbx) return targetTmpl.fbx;
  targetTmpl.tex = loadHeroDiffuseTexture(bundle.diffuseDataUrl);
  const idleFbx = fbxLoader.parse(b64ToBuffer(bundle.idleFbxB64), '');
  idleFbx.traverse((ch) => {
    if (ch.isMesh && ch.geometry && !ch.geometry.attributes.normal) {
      ch.geometry.computeVertexNormals();
    }
  });
  targetTmpl.fbx = idleFbx;
  if (idleFbx.animations[0]) targetTmpl.clips.idle = idleFbx.animations[0];
  const runFbx = fbxLoader.parse(b64ToBuffer(bundle.runFbxB64), '');
  if (runFbx.animations[0]) targetTmpl.clips.run = runFbx.animations[0];
  const fireFbx = fbxLoader.parse(b64ToBuffer(bundle.fireFbxB64), '');
  if (fireFbx.animations[0]) targetTmpl.clips.punch = fireFbx.animations[0];
  const grenFbx = fbxLoader.parse(b64ToBuffer(bundle.grenadeFbxB64), '');
  if (grenFbx.animations[0]) targetTmpl.clips.kick = grenFbx.animations[0];
  return idleFbx;
}

// Lazily parse a hero's FBX template on demand so startup only parses what is needed immediately!
const HERO_BUNDLE_PARSERS = {
  coyote: () => parseCoyoteBundle(window.COYOTE_MIXAMO, heroTemplates.coyote)
};
Object.values(window.MOBA_HEROES || {}).forEach((k) => {
  if (k.parseBundle && k.bundle) HERO_BUNDLE_PARSERS[k.id] = () => k.parseBundle(window[k.bundle.globalKey], heroTemplates[k.id]);
});
function ensureHeroTemplateReady(heroId) {
  const parse = HERO_BUNDLE_PARSERS[heroId];
  if (!parse) return null;
  if (!heroTemplates[heroId].fbx) parse();
  return heroTemplates[heroId];
}

function loadScriptAsync(src) {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

let crossbowMounted = false;
function mountCoyoteCrossbowProp() {
  if (crossbowMounted || !window.COYOTE_MIXAMO || !window.COYOTE_MIXAMO.crossbowGlbB64) return Promise.resolve();
  crossbowMounted = true;
  return new Promise((resolve) => {
    gltfLoader.parse(b64ToBuffer(window.COYOTE_MIXAMO.crossbowGlbB64), '', (gltf) => {
      const bowScene = gltf.scene;
      bowScene.traverse((ch) => {
        if (ch.isMesh) {
          ch.castShadow = true;
          ch.receiveShadow = true;
          ch.frustumCulled = false;
          if (ch.material && ch.material.map) {
            ch.material.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
      });
      // Cache clean unrotated clone for Coyote Bots before rotating player's bowScene:
      heroTemplates.crossbowScene = bowScene.clone(true);
      if (phase1Engine) phase1Engine.notifyTemplatesReady();

      // Raw GLB has +X = barrel tip (+0.50), -X = buttstock (-0.50), +Y = top sights, +-Z = horizontal bow prod.
      // Rotate Y by -90 deg so +X barrel points along +Z (Three.js lookAt direction!) and shift grip to origin:
      bowScene.rotation.y = -Math.PI / 2;
      bowScene.position.set(0, -0.14, 0.24);
      crossbowPivot.scale.setScalar(0.88);
      crossbowPivot.add(bowScene);
      updateSlotPills();
      resolve();
    }, () => resolve());
  });
}

const HERO_UI_META = {
  coyote: {
    height: 1.98,
    modelLabel: 'Coyote Crossbowman (Mixamo + 3D Crossbow)',
    glyph: 'C',
    color: '#f59e0b',
    name: 'Coyote Crossbowman (3D)',
    role: 'Carry • Ranged Physical Bleed Marksman',
    passive: 'Serrated Bolts',
    lmb: 'Bleed Bolt',
    q: '3-Bolt Fan',
    e: 'Grenade',
    r: 'Heartseeker',
    banner: '<b>1/2/3/4</b> Hero &bull; <b>LMB</b> Bleed Bolt &bull; <b>Q</b> Fan Volley &bull; <b>E</b> Shrapnel Grenade (2x Bullseye) &bull; <b>R</b> Heartseeker &bull; <b>P</b> Shop &bull; <b>F</b> Ward &bull; <b>B</b> Recall',
    tooltips: {
      P: {
        title: 'Passive • Serrated Broadheads',
        meta: 'Innate Bleed',
        body: 'Crossbow bolts apply <b>Serrated Bleed</b> for 4.5s (stacks up to <b>4x</b>; 5x with Lv7 Talent), dealing physical damage over time and priming targets for <b>R: Heartseeker</b> detonation.',
        talentLevels: [3, 7]
      },
      LMB: {
        title: 'LMB • Repeating Crossbow',
        meta: '0 MP • 1.05s Base ATK',
        body: 'Fires a high-velocity quarrel for <b>100% Physical ATK</b> and applies <b>1 stack of Serrated Bleed</b>.'
      },
      Q: {
        title: 'Q • 3-Bolt Fan Volley',
        meta: '40 MP • 7.5s / 6.5s / 5.5s CD (Lv 1/6/9)',
        body: 'Fires a tight spread of <b>3 serrated bolts</b> in a cone, each dealing <b>Physical Damage</b> and applying <b>1 stack of Bleed</b>.',
        talentLevels: [3, 10]
      },
      E: {
        title: 'E • Shrapnel Grenade',
        meta: '55 MP • 11.0s / 9.8s / 8.5s CD (Lv 1/6/9)',
        body: 'Lobs an explosive black-powder grenade to the target zone. Enemies caught in the <b>inner Bullseye</b> take <b>2x Physical Damage</b> and <b>+2 Bleed stacks</b> (outer ring applies 1 stack).',
        talentLevels: [7]
      },
      R: {
        title: 'R • Heartseeker Piercer',
        meta: '90 MP • 42s / 36s / 30s CD (Lv 4/8/12)',
        body: 'Channel for up to 2.0s (press <b>R</b> again to release early), aiming a long-range sniper laser that pierces all enemies and <b>detonates all active Bleed stacks</b> for massive bonus physical burst.',
        talentLevels: [10]
      }
    }
  },
};
Object.values(window.MOBA_HEROES || {}).forEach((k) => {
  if (k.ui) HERO_UI_META[k.id] = k.ui;
});

// Switch cleanly between all 5 3D Heroes ('coyote' | 'brawler' | 'sorceress' | 'bodyguard' | 'panther')!
function switchHero(heroId) {
  if (!HERO_UI_META[heroId]) heroId = 'coyote';
  activeHeroId = heroId;
  const meta = HERO_UI_META[heroId];
  HERO_HEIGHT = meta.height;

  rawClips.idle = rawClips.run = rawClips.crawl = rawClips.punch = rawClips.punch2 = rawClips.kick = rawClips.slide = rawClips.jump = null;

  ensureHeroTemplateReady(heroId);
  const tmpl = heroTemplates[heroId] || heroTemplates.coyote;
  if (tmpl && tmpl.fbx) {
    fallbackBrawlerTex = tmpl.tex;
    const cloned = SkeletonUtils.clone(tmpl.fbx);
    installModelObject(cloned, meta.modelLabel, true);
    ['idle', 'run', 'crawl', 'punch', 'punch2', 'kick', 'slide', 'jump'].forEach((slot) => {
      if (tmpl.clips[slot]) bindClipToSlot(slot, tmpl.clips[slot]);
    });
  }

  crossbowPivot.visible = (heroId === 'coyote');
  wandPivot.visible = false;
  laserSightMesh.visible = false;
  muzzleOrb.visible = false;
  handGrenadeMesh.visible = false;

  if (phase1Engine) phase1Engine.notifyHeroSwitched();

  // Reset combat timers & update HUD
  const st = phase1Engine ? phase1Engine.getPlayerStats() : { maxHp: 750, maxMp: 350, atk: 55, fant: 0, armor: 20, fResist: 18 };
  hero.maxHp = st.maxHp;
  hero.hp = hero.maxHp;
  hero.maxMp = st.maxMp || 350;
  hero.mp = hero.maxMp;
  hero.shield = 0;
  hero.rShieldTimer = 0;
  hero.peakPhysiqueTimer = 0;
  hero.atkTimer = 0;
  hero.cdQ = 0; hero.cdE = 0; hero.cdR = 0;
  hero.qArmed = false; hero.eRecast = 0; hero.dashTimer = 0;
  hero.punchAnim = 0; hero.kickAnim = 0; hero.grenadeAnim = 0;
  hero.rChargeTimer = 0;
  hero.basicCombo = 0;
  hero.comboResetTimer = 0;
  hero.qTempoStacks = 0;
  hero.qTempoTimer = 0;
  hero.eSpeedBuffTimer = 0;
  hero.leapTimer = 0;
  hero.stealthTimer = 0;
  hero.stealthExitTimer = 0;
  hero.unseenLingerTimer = 0;
  hero.qFlurryRemaining = 0;
  hero.qFlurryTimer = 0;

  ['coyote', 'brawler', 'sorceress', 'bodyguard', 'panther'].forEach((id) => {
    const btn = document.getElementById('btn-hero-' + id);
    if (btn) btn.classList.toggle('toggled', id === heroId);
  });

  document.getElementById('hud3d-glyph').textContent = meta.glyph;
  document.getElementById('hud3d-glyph').style.color = meta.color;
  document.getElementById('hud3d-name').textContent = meta.name;
  document.getElementById('hud3d-role').textContent = meta.role;
  document.getElementById('hud3d-atk').textContent = 'ATK ' + st.atk;
  document.getElementById('hud3d-fant').textContent = 'FANT ' + (st.fant || 0);

  const passLbl = document.getElementById('lbl3d-passive');
  if (passLbl) passLbl.textContent = meta.passive || 'Passive';
  document.getElementById('lbl3d-lmb').textContent = meta.lmb;
  document.getElementById('lbl3d-q').textContent = meta.q;
  document.getElementById('lbl3d-e').textContent = meta.e;
  document.getElementById('lbl3d-r').textContent = meta.r;

  const specs = window.MOBA_PHASE1 && window.MOBA_PHASE1.HERO_SPECS[heroId];
  const mpCosts = (specs && specs.mpCosts) || { Q: 40, E: 55, R: 90 };
  document.getElementById('mp3d-q').textContent = mpCosts.Q;
  document.getElementById('mp3d-e').textContent = mpCosts.E;
  document.getElementById('mp3d-r').textContent = mpCosts.R;

  document.getElementById('drop-banner').innerHTML = meta.banner;

  updateSlotPills();
}

// Multi-File Drag-and-Drop or Picker (.FBX + .GLB)!
function handleFilesBatch(fileList) {
  if (!fileList || fileList.length === 0) return;
  const files = Array.from(fileList).sort((a, b) => b.size - a.size);
  Promise.all(files.map((file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve({ name: file.name, buf: ev.target.result });
    reader.readAsArrayBuffer(file);
  }))).then((loaded) => {
    loaded.forEach(({ name, buf }) => {
      if (/\.fbx$/i.test(name)) loadBufferFBX(buf, name);
      else loadBufferGLB(buf, name);
    });
  });
}
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files) handleFilesBatch(e.dataTransfer.files);
});
document.getElementById('file-glb-picker').addEventListener('change', (e) => {
  if (e.target.files) handleFilesBatch(e.target.files);
});
