// Asset Lab: evaluate Quaternius packs against our style.
// Modes: Gallery (original vs flat recolor), Faceted rig (our primitives on the astronaut skeleton), Density test.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { UAL_PATHS, BODY_PATHS, HAIR_PATHS, BEARD_PATH, BROW_PATHS, buildFacetedHuman, headBoxOf } from './faceted_human.js';

const BASE = 'assets/_extracted/';
const PALETTES = {
  'none (pack colors)': null,
  'verdant teal': 0.42, 'rust desert': 0.07, 'violet moor': 0.72, 'mint tundra': 0.4, 'ochre savanna': 0.16, 'magenta fungal': 0.9,
};

// ---------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9d4e0');
scene.fog = new THREE.Fog('#a9d4e0', 120, 400);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(14, 12, 22);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(6, 1, 0);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a3428', 0.9));
const sun = new THREE.DirectionalLight('#fff4e0', 1.8);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 });
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: '#5f9c7a', roughness: 1, flatShading: true }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const loader = new GLTFLoader();
// ---------------------------------------------------------------------
// Human mode
// ---------------------------------------------------------------------
let human = null;     // { root, mixer, action, animName, tris }
let humanClips = null;
let stockMannequin = null;
let headBoxes = null;
const QUICK = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'TreeChopping_Loop', 'Farm_Harvest', 'Fixing_Kneeling', 'Idle_Talking_Loop', 'Sword_Regular_Combo', 'Pistol_Shoot', 'OverhandThrow', 'Consume', 'Dance_Loop'];
const HV = (id) => document.getElementById(id);

async function loadHumanClips() {
  if (humanClips) return humanClips;
  const [a, b] = await Promise.all([load(UAL_PATHS.ual1), load(UAL_PATHS.ual2)]);
  // Drop scale tracks so our build controls (bone scale) aren't overwritten every frame
  humanClips = [...a.animations, ...b.animations]
    .filter((c) => c.name !== 'A_TPose')
    // drop scale tracks + per-bone position tracks (except root/pelvis) so build/neck controls stick
    .map((c) => { const k = c.clone(); k.tracks = k.tracks.filter((t) => !t.name.endsWith('.scale') && !(t.name.endsWith('.position') && !/^(root|pelvis)\./.test(t.name))); return k; })
    .sort((x, y) => x.name.localeCompare(y.name));
  const sel = HV('h-anim');
  sel.innerHTML = '';
  humanClips.forEach((c) => sel.add(new Option(c.name.replace(/_/g, ' '), c.name)));
  const q = HV('h-quick');
  q.innerHTML = '';
  for (const n of QUICK) {
    if (!humanClips.find((c) => c.name === n)) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = n.replace(/_Loop|_Fwd/g, '').replace(/_/g, ' ');
    btn.onclick = () => playHuman(n);
    q.appendChild(btn);
  }
  return humanClips;
}

function faceLook() {
  return {
    expression: HV('f-expr').value, eyeColor: HV('c-eyes').value, lipColor: HV('c-lips').value, browColor: HV('c-hair').value,
    eyeSize: +HV('f-eyesize').value / 100, eyeSpacing: +HV('f-eyespace').value / 100, mouthWidth: +HV('f-mouth').value / 100,
  };
}
function humanOpts() {
  return {
    cellFrac: Number(HV('h-cell').value) / 1000,
    height: Number(HV('h-height').value) / 100,
    weight: Number(HV('h-weight').value) / 100 * (Number(HV('h-weight').value) < 0 ? 0.4 : 0.6),
    muscle: Number(HV('h-muscle').value) / 100 * (Number(HV('h-muscle').value) < 0 ? 0.35 : 0.5),
    shoulders: Number(HV('h-shoulders').value) / 100,
    bust: Number(HV('h-bust').value) / 100, bustLift: Number(HV('h-lift').value) / 100,
    headScale: Number(HV('h-head').value) / 100,
    neck: Number(HV('h-neck').value) / 100,
    hair: HV('h-hair').value, beard: HV('h-beard').checked,
    outfit: {
      sleeves: HV('o-sleeves').value, neck: HV('o-neck').value === 'turtle' ? 'crew' : HV('o-neck').value,
      top: HV('o-neck').value === 'turtle' ? 'turtleneck' : 'shirt', hem: HV('o-hem').value, layer: HV('o-layer').value,
      pants: HV('o-pants').value, boots: HV('o-boots').value, gloves: HV('o-gloves').checked,
    },
    faceShape: { jaw: +HV('f-jaw').value / 100, chin: +HV('f-chin').value / 100, cheeks: +HV('f-cheeks').value / 100, brow: +HV('f-brow').value / 100, nose: +HV('f-nose').value / 100, width: +HV('f-width').value / 100 },
    face: faceLook(),
    colors: { skin: HV('c-skin').value, hair: HV('c-hair').value, shirt: HV('c-shirt').value, layer: HV('c-layer').value, pants: HV('c-pants').value, belt: HV('c-belt').value, boots: HV('c-boots').value, gloves: HV('c-gloves').value },
  };
}

async function showHuman() {
  const keepAnim = human ? human.animName : 'Idle_Loop';
  const keepTime = human && human.action ? human.action.time : 0;
  clearContent();
  await loadHumanClips();
  const bodyKey = HV('h-body').value;
  const gltf = await load(BODY_PATHS[bodyKey]);
  const o = humanOpts();
  const human_ = bodyKey !== 'android';
  const [hair, beard, brows] = await Promise.all([
    human_ && o.hair !== 'none' ? Promise.all([].concat(HAIR_PATHS[o.hair]).map(load)) : null,
    human_ && o.beard ? load(BEARD_PATH) : null,
    human_ ? load(BROW_PATHS[bodyKey]) : null,
  ]);
  if (!headBoxes) {
    const [m, f] = await Promise.all([load(BODY_PATHS.male), load(BODY_PATHS.female)]);
    headBoxes = { male: headBoxOf(m), female: headBoxOf(f) };
  }
  const built = buildFacetedHuman(gltf, o, { hair, beard, brows }, headBoxes, bodyKey);
  content.add(built.root);
  const mixer = new THREE.AnimationMixer(built.root);
  mixers.push(mixer);
  human = { ...built, mixer, action: null, animName: keepAnim };
  if (built.face) { mixers.push({ update: (dt) => built.face.update(dt) }); built.face.setTalking(HV('f-talk').checked); }
  HV('h-tris').textContent = `${built.tris} tris`;
  playHuman(keepAnim, keepTime);
  const ref = playerRef();
  ref.position.set(-1.4, 0, 0);
  content.add(ref);
  // stock mannequin for comparison (hidden by default)
  stockMannequin = SkeletonUtils.clone(gltf.scene);
  stockMannequin.position.set(1.4, 0, 0);
  stockMannequin.visible = HV('h-orig').classList.contains('on');
  content.add(stockMannequin);
  const m2 = new THREE.AnimationMixer(stockMannequin);
  m2.clipAction(humanClips.find((c) => c.name === 'Idle_Loop')).play();
  mixers.push(m2);
}

function playHuman(name, time = 0) {
  const clip = humanClips.find((c) => c.name === name) || humanClips.find((c) => c.name === 'Idle_Loop');
  if (!clip || !human) return;
  if (human.action) human.action.fadeOut(0.2);
  human.action = human.mixer.clipAction(clip).reset().fadeIn(0.2).play();
  human.action.time = time;
  human.animName = clip.name;
  HV('h-anim').value = clip.name;
}

function randomizeHuman() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const SK = ['#f1d3b8', '#e3b38f', '#d9a982', '#b98a68', '#8a6248', '#5e4030', '#c7b1a0'];
  const HAIR = ['#2a1d14', '#4a3020', '#7a4a2a', '#b07a3a', '#d8b878', '#9a9a9a', '#e8e2cf', '#7a3a8a', '#3a6a8a', '#a8342a'];
  const CLOTH = ['#4f6a8a', '#8a6f5a', '#5f7d6e', '#7a5f8a', '#a0805a', '#8f5a5a', '#6f8a5a', '#c9b79c', '#3a4a5a', '#b5835a', '#2f6a55', '#d8c070'];
  const DARK = ['#3a3028', '#2e2620', '#4a3a2a', '#2a2d34', '#5a4a3a', '#3a2a2a'];
  HV('c-skin').value = pick(SK); HV('c-hair').value = pick(HAIR);
  HV('c-shirt').value = pick(CLOTH); HV('c-pants').value = pick(CLOTH);
  HV('c-belt').value = pick(DARK); HV('c-boots').value = pick(DARK); HV('c-gloves').value = pick(DARK);
  HV('h-hair').value = pick(['parted', 'parted', 'buzz', 'buzzSoft', 'long', 'buns', 'none']);
  HV('h-weight').value = -70 + Math.floor(Math.random() * 150);
  HV('h-muscle').value = -60 + Math.floor(Math.random() * 140);
  HV('h-beard').checked = Math.random() < 0.25;
  ['f-jaw', 'f-chin', 'f-cheeks', 'f-brow', 'f-nose', 'f-width'].forEach((id) => { HV(id).value = Math.round((Math.random() * 2 - 1) * 70); });
  HV('f-eyesize').value = 85 + Math.floor(Math.random() * 35);
  HV('f-eyespace').value = 90 + Math.floor(Math.random() * 20);
  HV('f-mouth').value = 85 + Math.floor(Math.random() * 35);
  HV('c-eyes').value = pick(['#4a6a8a', '#5a3a22', '#3a5a3a', '#7a6a4a', '#2a2a2a', '#6a8aa0']);
  HV('c-lips').value = pick(['#9a4a44', '#8a5a50', '#b06a66', '#6a3a36', '#a05a5a']);
  HV('o-sleeves').value = pick(['tank', 'short', 'short', 'elbow', 'long', 'long']);
  HV('o-neck').value = pick(['crew', 'crew', 'v', 'scoop', 'turtle']);
  HV('o-hem').value = Math.random() < 0.15 ? 'crop' : 'full';
  HV('o-layer').value = pick(['none', 'none', 'vest', 'jacket']);
  HV('o-pants').value = pick(['full', 'full', 'full', 'capri', 'shorts']);
  HV('o-boots').value = pick(['short', 'tall']);
  HV('o-gloves').checked = Math.random() < 0.3;
  HV('c-layer').value = pick(CLOTH);
  HV('h-body').value = pick(['male', 'female']);
  HV('h-height').value = 92 + Math.floor(Math.random() * 16);
  HV('h-shoulders').value = 92 + Math.floor(Math.random() * 24);
  HV('h-head').value = 100 + Math.floor(Math.random() * 14);
  showHuman();
}

const cache = new Map();
function load(path) {
  if (!cache.has(path)) cache.set(path, loader.loadAsync(BASE + encodeURI(path)));
  return cache.get(path);
}

const content = new THREE.Group();
scene.add(content);
const labelsEl = document.getElementById('labels');
let labels = [];
const mixers = [];
function clearContent() {
  content.clear();
  labels.forEach((l) => l.el.remove());
  labels = [];
  mixers.length = 0;
}
function addLabel(text, obj, y) {
  const el = document.createElement('div');
  el.className = 'lbl';
  el.innerHTML = text;
  labelsEl.appendChild(el);
  labels.push({ el, obj, y });
}

function playerRef() {
  const g = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 10), new THREE.MeshStandardMaterial({ color: '#f2c14e' }));
  cap.position.y = 0.9;
  cap.castShadow = true;
  g.add(cap);
  return g;
}

// ---------------------------------------------------------------------
// Flat recolor: bake each textured material into vertex colors, flat shaded,
// with optional hue/saturation shift toward a planet palette.
// ---------------------------------------------------------------------
const imgCache = new Map();
function imageData(tex) {
  const img = tex.image;
  if (!img) return null;
  if (imgCache.has(img)) return imgCache.get(img);
  const S = Math.min(256, img.width || 256);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, S, S);
  const d = { S, data: ctx.getImageData(0, 0, S, S).data, flipY: tex.flipY };
  imgCache.set(img, d);
  return d;
}

function flatten(root, hueTarget, hueShift, satMul) {
  const tmp = new THREE.Color();
  const hsl = {};
  root.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.userData.origMaterial || o.material;
    o.userData.origMaterial = src;
    const mats = Array.isArray(src) ? src : [src];
    const m0 = mats[0];
    const geo = o.geometry;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const colors = new Float32Array(pos.count * 3);
    const id = m0.map ? imageData(m0.map) : null;
    const base = m0.color || new THREE.Color(1, 1, 1);
    for (let i = 0; i < pos.count; i++) {
      if (id && uv) {
        let u = uv.getX(i) % 1, v = uv.getY(i) % 1;
        if (u < 0) u += 1;
        if (v < 0) v += 1;
        const px = Math.min(id.S - 1, Math.floor(u * id.S));
        const py = Math.min(id.S - 1, Math.floor((id.flipY ? 1 - v : v) * id.S));
        const k = (py * id.S + px) * 4;
        tmp.setRGB(id.data[k] / 255, id.data[k + 1] / 255, id.data[k + 2] / 255, THREE.SRGBColorSpace);
        tmp.multiply(base);
      } else tmp.copy(base);
      tmp.getHSL(hsl);
      let h = hsl.h;
      if (hueTarget !== null && hsl.s > 0.15) h = hueTarget + (h - 0.33) * 0.35; // pull greens toward the palette hue
      h = (h + hueShift / 360 + 10) % 1;
      tmp.setHSL(h, Math.min(1, hsl.s * satMul), hsl.l);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const cutout = m0.transparent || m0.alphaTest > 0;
    o.material = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.85,
      ...(cutout ? { alphaMap: m0.map, alphaTest: 0.5, side: THREE.DoubleSide } : {}),
    });
    if (o.isSkinnedMesh) o.material.skinning = true;
  });
}
function restore(root) {
  root.traverse((o) => { if (o.isMesh && o.userData.origMaterial) o.material = o.userData.origMaterial; });
}

// ---------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------
let manifest = null;
let style = 'orig';
const packSel = document.getElementById('pack'), catSel = document.getElementById('category');
const palSel = document.getElementById('palette');
Object.keys(PALETTES).forEach((k) => palSel.add(new Option(k, k)));

async function initManifest() {
  manifest = await (await fetch(BASE + 'manifest.json')).json();
  Object.keys(manifest).forEach((p) => packSel.add(new Option(p.replace(/_/g, ' '), p)));
  packSel.value = 'Ultimate_Space_Kit';
  fillCats();
  const dm = document.getElementById('density-model');
  for (const [p, cats] of Object.entries(manifest)) {
    for (const [c, list] of Object.entries(cats)) {
      for (const m of list) if (!m.skinned) dm.add(new Option(`${m.name} (${m.tris} tris)`, m.path));
    }
  }
  // Our current primitive tree as a baseline
  dm.add(new Option('OUR current primitive tree (~30 tris)', '__primitive__'), 0);
  dm.selectedIndex = 0;
}
function fillCats() {
  catSel.innerHTML = '';
  Object.keys(manifest[packSel.value]).forEach((c) => catSel.add(new Option(`${c} (${manifest[packSel.value][c].length})`, c)));
}

let galleryRoots = [];
async function showGallery() {
  clearContent();
  galleryRoots = [];
  const list = manifest[packSel.value][catSel.value];
  const scale = Number(document.getElementById('scale').value) / 100;
  const ref = playerRef();
  ref.position.set(-3, 0, 0);
  content.add(ref);
  addLabel('<b>Player</b> 1.8m', ref, 2.2);
  const cols = Math.ceil(Math.sqrt(list.length * 1.6));
  let x = 0, z = 0, rowDepth = 0, col = 0;
  for (const m of list) {
    const gltf = await load(m.path);
    const root = m.skinned ? SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true);
    root.scale.multiplyScalar(scale);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const w = Math.max(1.5, size.x) + 1.5, d = Math.max(1.5, size.z) + 1.5;
    root.position.set(x + w / 2 - (box.min.x + box.max.x) / 2, -box.min.y, z - (box.min.z + box.max.z) / 2);
    content.add(root);
    galleryRoots.push(root);
    addLabel(`${m.name} <b>${m.tris}</b>`, root, size.y + 0.4);
    if (m.anims.length) {
      const mixer = new THREE.AnimationMixer(root);
      const clip = gltf.animations.find((a) => /^idle$/i.test(a.name)) || gltf.animations.find((a) => /idle/i.test(a.name)) || gltf.animations[0];
      mixer.clipAction(clip).play();
      mixers.push(mixer);
    }
    x += w;
    rowDepth = Math.max(rowDepth, d);
    if (++col >= cols) { col = 0; x = 0; z += rowDepth; rowDepth = 0; }
  }
  applyStyle();
}
function applyStyle() {
  const hue = Number(document.getElementById('hue').value);
  const sat = Number(document.getElementById('sat').value) / 100;
  for (const r of galleryRoots) {
    if (style === 'flat') flatten(r, PALETTES[palSel.value], hue, sat);
    else restore(r);
  }
}

// ---------------------------------------------------------------------
// Faceted rig: our primitive parts parented to the astronaut's bones
// ---------------------------------------------------------------------
const ASTRO = 'Ultimate_Space_Kit/Ultimate Space Kit - March 2023/Characters/GLTF/Astronaut_FinnTheFrog.gltf';
const SKINS = ['#e8c9a8', '#d9b48f', '#b98a68', '#8a6248', '#a8c8b8', '#c8b8e0'];
const TINTS = ['#4f6a8a', '#8a6f5a', '#5f7d6e', '#7a5f8a', '#a0805a', '#8f5a5a'];
const ACCENTS = ['#ffcf4a', '#e8e2cf', '#3fd0ff', '#ff8a6a'];
let rig = null;

function facetMat(c) { return new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.7 }); }

function boneLength(bone) {
  const child = bone.children.find((c) => c.isBone);
  return child ? child.position.length() : 0.3;
}

function buildFacetedParts(root) {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const skin = pick(SKINS), tint = pick(TINTS), accent = pick(ACCENTS), pants = new THREE.Color(tint).offsetHSL(0, -0.1, -0.12);
  const parts = [];
  const add = (bone, mesh) => { mesh.castShadow = true; bone.add(mesh); parts.push(mesh); };
  const limb = (bone, r, color, sides = 6) => {
    const L = boneLength(bone);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, L, sides), facetMat(color));
    m.position.y = L / 2;
    add(bone, m);
  };
  const bones = {};
  // GLTFLoader strips '.' from node names (UpperArm.L -> UpperArmL); index both forms.
  root.traverse((o) => { if (o.isBone) { bones[o.name] = o; bones[o.name.replace(/[.\s]/g, '')] = o; } });
  const B = (n) => bones[n] || bones[n.replace(/[.\s]/g, '')];
  const unit = boneLength(bones.Torso || bones.Body) || 0.5; // scale parts to the rig
  const R = unit * 0.32;
  if (B('Hips')) { const m = new THREE.Mesh(new THREE.BoxGeometry(R * 2.4, R * 1.4, R * 1.6), facetMat(pants)); add(bones.Hips, m); }
  if (bones.Abdomen) limb(bones.Abdomen, R * 1.15, tint, 7);
  if (bones.Torso) {
    const L = boneLength(bones.Torso);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.35, R * 1.15, L, 7), facetMat(tint));
    m.position.y = L / 2;
    add(bones.Torso, m);
  }
  if (bones.Head) {
    const hr = R * 1.25;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(hr, 1), facetMat(skin));
    head.position.y = hr * 0.9;
    add(bones.Head, head);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.13, 6, 5), facetMat('#14161c'));
      eye.position.set(s * hr * 0.38, hr * 1.0, hr * 0.88);
      add(bones.Head, eye);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.95, hr * 1.02, hr * 0.45, 8), facetMat(accent));
    cap.position.y = hr * 1.65;
    add(bones.Head, cap);
  }
  for (const side of ['L', 'R']) {
    const ua = B('UpperArm.' + side), la = B('LowerArm.' + side), ul = B('UpperLeg.' + side), ll = B('LowerLeg.' + side), ft = B('Foot.' + side);
    if (ua) limb(ua, R * 0.5, tint);
    if (la) {
      // Lower arm has finger bones as children (no hand bone): fixed length + a faceted mitten hand
      const L = (boneLength(ua) || 0.5) * 0.8;
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.36, R * 0.42, L, 6), facetMat(skin));
      fore.position.y = L / 2;
      add(la, fore);
      const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.55, 0), facetMat(skin));
      hand.position.y = L + R * 0.35;
      add(la, hand);
    }
    if (ul) limb(ul, R * 0.62, pants);
    if (ll) {
      const L = boneLength(ul) || 0.4;
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.45, R * 0.52, L, 6), facetMat(pants));
      shin.position.y = L / 2;
      add(ll, shin);
    }
    if (ft) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(R * 0.9, R * 0.5, R * 1.6), facetMat('#3a3028'));
      f.position.set(0, R * 0.1, R * 0.4);
      add(ft, f);
    }
  }
  return parts;
}

async function showRig() {
  clearContent();
  const gltf = await load(ASTRO);
  const root = SkeletonUtils.clone(gltf.scene);
  const box = new THREE.Box3().setFromObject(root);
  const h = box.getSize(new THREE.Vector3()).y;
  root.scale.multiplyScalar(1.8 / h);
  content.add(root);
  const origMeshes = [];
  root.traverse((o) => { if (o.isMesh) { origMeshes.push(o); o.visible = false; } });
  const parts = buildFacetedParts(root);
  const mixer = new THREE.AnimationMixer(root);
  mixers.push(mixer);
  rig = { root, gltf, mixer, origMeshes, parts, action: null };
  const ref = playerRef();
  ref.position.set(-2, 0, 0);
  content.add(ref);
  // a stock astronaut for comparison
  const stock = SkeletonUtils.clone(gltf.scene);
  stock.scale.copy(root.scale);
  stock.position.set(2.2, 0, 0);
  content.add(stock);
  const m2 = new THREE.AnimationMixer(stock);
  m2.clipAction(gltf.animations.find((a) => a.name === 'Idle')).play();
  mixers.push(m2);
  addLabel('<b>Faceted</b> (ours, on their skeleton)', root, 2.3);
  addLabel('Stock astronaut', stock, 2.3);
  addLabel('Player capsule', ref, 2.2);
  const animsEl = document.getElementById('anims');
  animsEl.innerHTML = '';
  for (const clip of gltf.animations) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = clip.name;
    b.onclick = () => playRig(clip.name, b);
    animsEl.appendChild(b);
  }
  playRig('Walk', animsEl.querySelector('button:nth-child(' + (gltf.animations.findIndex((a) => a.name === 'Walk') + 1) + ')'));
  controls.target.set(0, 1, 0);
  camera.position.set(3, 2.4, 6);
}
function playRig(name, btn) {
  const clip = rig.gltf.animations.find((a) => a.name === name);
  if (!clip) return;
  if (rig.action) rig.action.fadeOut(0.2);
  rig.action = rig.mixer.clipAction(clip).reset().fadeIn(0.2).play();
  document.querySelectorAll('#anims button').forEach((b) => b.classList.toggle('on', b === btn));
}

// ---------------------------------------------------------------------
// Density test
// ---------------------------------------------------------------------
let densityShadows = true;
async function showDensity() {
  clearContent();
  const path = document.getElementById('density-model').value;
  const count = Number(document.getElementById('density-count').value);
  document.getElementById('density-n').textContent = count;
  let pieces = [];
  if (path === '__primitive__') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.2, 6), facetMat('#5a4636'));
    trunk.position.y = 1.1;
    const can = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), facetMat('#2f6a55'));
    can.position.y = 2.9;
    pieces = [trunk, can];
    pieces.forEach((p) => p.updateMatrix());
  } else {
    const gltf = await load(path);
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { if (o.isMesh) pieces.push(o); });
  }
  const rng = () => Math.random();
  const area = Math.sqrt(count) * 9;
  const xforms = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Matrix4();
    const s = 0.8 + rng() * 0.5;
    m.compose(new THREE.Vector3((rng() - 0.5) * area, 0, (rng() - 0.5) * area), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6.28, 0)), new THREE.Vector3(s, s, s));
    xforms.push(m);
  }
  let tris = 0;
  for (const p of pieces) {
    const inst = new THREE.InstancedMesh(p.geometry, p.material, count);
    const local = p.matrixWorld && path !== '__primitive__' ? p.matrixWorld : p.matrix;
    xforms.forEach((m, i) => inst.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(m, local)));
    inst.castShadow = densityShadows;
    inst.receiveShadow = true;
    content.add(inst);
    tris += (p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count) / 3 * count;
  }
  densityTris = tris;
  controls.target.set(0, 2, 0);
  camera.position.set(area * 0.35, area * 0.25, area * 0.45);
}
let densityTris = 0;

// ---------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------
let mode = 'gallery';
function setMode(m) {
  mode = m;
  ['human', 'gallery', 'rig', 'density'].forEach((k) => {
    document.getElementById('mode-' + k).classList.toggle('on', k === m);
    document.getElementById(k + '-ui').style.display = k === m ? 'block' : 'none';
  });
  if (m === 'human') { controls.target.set(0, 1, 0); camera.position.set(1.6, 1.7, 4.2); human = null; showHuman(); }
  if (m === 'gallery') { controls.target.set(6, 1, 0); camera.position.set(14, 12, 22); showGallery(); }
  if (m === 'rig') showRig();
  if (m === 'density') showDensity();
}
document.getElementById('mode-human').onclick = () => setMode('human');
document.getElementById('mode-gallery').onclick = () => setMode('gallery');
['h-body', 'h-cell', 'h-height', 'h-weight', 'h-muscle', 'h-bust', 'h-lift', 'h-shoulders', 'h-neck', 'h-head', 'h-hair', 'h-beard', 'o-sleeves', 'o-neck', 'o-hem', 'o-layer', 'o-pants', 'o-boots', 'o-gloves', 'c-skin', 'c-hair', 'c-shirt', 'c-layer', 'c-pants', 'c-belt', 'c-boots', 'c-gloves']
  .forEach((id) => { HV(id).onchange = () => showHuman(); });
HV('h-anim').onchange = (e) => playHuman(e.target.value);
// Face look changes redraw the face texture without rebuilding; structure sliders rebuild.
['f-expr', 'c-eyes', 'c-lips', 'f-eyesize', 'f-eyespace', 'f-mouth'].forEach((id) => {
  HV(id).onchange = () => { if (human && human.face) { human.face.setLook(faceLook()); human.face.setExpression(HV('f-expr').value); } };
});
HV('f-talk').onchange = () => { if (human && human.face) human.face.setTalking(HV('f-talk').checked); };
['f-jaw', 'f-chin', 'f-cheeks', 'f-brow', 'f-nose', 'f-width'].forEach((id) => { HV(id).onchange = () => showHuman(); });
HV('h-random').onclick = () => randomizeHuman();
HV('h-orig').onclick = (e) => { e.target.classList.toggle('on'); if (stockMannequin) stockMannequin.visible = e.target.classList.contains('on'); };
document.getElementById('mode-rig').onclick = () => setMode('rig');
document.getElementById('mode-density').onclick = () => setMode('density');
packSel.onchange = () => { fillCats(); showGallery(); };
catSel.onchange = () => showGallery();
document.getElementById('scale').onchange = () => showGallery();
document.getElementById('style-orig').onclick = () => { style = 'orig'; document.getElementById('style-orig').classList.add('on'); document.getElementById('style-flat').classList.remove('on'); applyStyle(); };
document.getElementById('style-flat').onclick = () => { style = 'flat'; document.getElementById('style-flat').classList.add('on'); document.getElementById('style-orig').classList.remove('on'); applyStyle(); };
['palette', 'hue', 'sat'].forEach((id) => { document.getElementById(id).onchange = () => { if (style === 'flat') applyStyle(); }; });
document.getElementById('rig-show-orig').onclick = (e) => {
  const on = !e.target.classList.contains('on');
  e.target.classList.toggle('on', on);
  rig.origMeshes.forEach((m) => { m.visible = on; });
  rig.parts.forEach((p) => { p.visible = !on; });
};
document.getElementById('rig-reroll').onclick = () => { rig.parts.forEach((p) => p.parent.remove(p)); rig.parts = buildFacetedParts(rig.root); };
document.getElementById('density-model').onchange = () => showDensity();
document.getElementById('density-count').oninput = (e) => { document.getElementById('density-n').textContent = e.target.value; };
document.getElementById('density-count').onchange = () => showDensity();
document.getElementById('density-shadows').onclick = (e) => { densityShadows = !densityShadows; e.target.classList.toggle('on', densityShadows); showDensity(); };

// ---------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------
const clock = new THREE.Clock();
const statsEl = document.getElementById('stats');
let fpsT = 0, fpsN = 0, fps = 0;
const v = new THREE.Vector3();
function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  mixers.forEach((m) => m.update(dt));
  controls.update();
  renderer.render(scene, camera);
  for (const l of labels) {
    l.obj.getWorldPosition(v);
    v.y += l.y;
    v.project(camera);
    const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
    l.el.style.display = vis ? 'block' : 'none';
    l.el.style.left = ((v.x + 1) / 2) * innerWidth + 'px';
    l.el.style.top = ((1 - v.y) / 2) * innerHeight + 'px';
  }
  fpsT += dt; fpsN++;
  if (fpsT > 0.5) { fps = Math.round(fpsN / fpsT); fpsT = 0; fpsN = 0; }
  const info = renderer.info.render;
  statsEl.textContent = `${fps} fps · ${(info.triangles / 1e6).toFixed(2)}M tris drawn · ${info.calls} draw calls${mode === 'density' ? ` · scene ${(densityTris / 1e6).toFixed(1)}M tris` : ''}`;
  requestAnimationFrame(tick);
}
initManifest().then(() => setMode('human'));
tick();

// Test hook for headless renders (scratch/shoot.py)
window.__lab = { faceDebug: (on) => human && human.face && human.face.setLook({ debugLines: on }), jaw: (v) => human && human.face && human.face.debugJaw(v), viseme: (n) => human && human.face && human.face.debugViseme(n), setFace: (e, talk) => { if (human && human.face) { human.face.setExpression(e); human.face.setTalking(!!talk); } }, camera, controls, scene, setMode, showHuman: () => showHuman(), playHuman: (n, t) => playHuman(n, t), HV, get human() { return human; } };
