// =====================================================================
// PLAYER CHARACTER: the faceted human from the Asset Lab, driven by the game.
//
// A "look" is plain data in slider units (the same ranges as the Asset Lab panel), so it saves
// cleanly and the future character creator can bind sliders straight to it. lookToOpts() turns
// it into buildFacetedHuman() options. Assets come from assets/characters/ (curated, committed;
// see tools/curate_character_assets.py), not the gitignored packs.
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BODY_PATHS, HAIR_PATHS, BEARD_PATH, BROW_PATHS, buildFacetedHuman, headBoxOf } from './faceted_human.js';
import { DEFAULT_LOOK, lookToOpts } from './character_look.js';
export { DEFAULT_LOOK, randomLook, lookToOpts } from './character_look.js';

const DIR = new URL('../assets/characters/', import.meta.url).href; // relative to this module, so any page can load it
const flat = (p) => DIR + encodeURI(p.split('/').pop());
const loader = new GLTFLoader();
const cache = new Map();
const load = (path) => {
  if (!cache.has(path)) cache.set(path, loader.loadAsync(flat(path)));
  return cache.get(path);
};

// Clip names by role. Gathering picks a clip per tool.
export const CLIPS = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop',
  pick: 'TreeChopping_Loop', hatchet: 'TreeChopping_Loop', sickle: 'Farm_Harvest', gloves: 'Fixing_Kneeling',
  // interact: a reach-and-open (the old Interact clip kneels first, then points)
  interact: 'Chest_Open', cheer: 'Yes', pickup: 'PickUp_Table', talk: 'Idle_Talking_Loop',
  guard: 'Sword_Idle', hit: 'Hit_Chest', death: 'Death01', getUp: 'LayToIdle', shoot: 'Pistol_Shoot', aim: 'Pistol_Idle_Loop',
};
// Auto-attack swings per weapon kind (animation audit, Nov 23). Lists alternate swing to swing.
export const ATTACK_CLIPS = {
  machete: ['Sword_Regular_A', 'Sword_Regular_B'], cleaver: ['Sword_Regular_B', 'Sword_Regular_A'],
  maul: ['Sword_Heavy_Combo'], spear: ['Sword_Attack'], fists: ['Punch_Jab', 'Punch_Cross'],
};
const ONE_SHOTS = new Set(['Interact', 'Chest_Open', 'Yes', 'PickUp_Table', 'Sword_Attack', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Heavy_Combo', 'Punch_Jab', 'Punch_Cross', 'Hit_Chest', 'Pistol_Shoot', 'Death01', 'LayToIdle']);

let clipsPromise = null;
function loadClips() {
  if (!clipsPromise) {
    clipsPromise = load('anims.glb').then((g) => {
      const byName = new Map();
      for (const c of g.animations) byName.set(c.name, c);
      return byName;
    });
  }
  return clipsPromise;
}
let headBoxesPromise = null;
function loadHeadBoxes() {
  if (!headBoxesPromise) {
    headBoxesPromise = Promise.all([load(BODY_PATHS.male), load(BODY_PATHS.female)]).then(([m, f]) => ({ male: headBoxOf(m), female: headBoxOf(f) }));
  }
  return headBoxesPromise;
}

// Build a character. Returns { root, mesh, face, play(role|clip, opts), update(dt), hand, dispose() }.
// options.cellFrac: faceting cell size (smaller = more detail; see settings.js QUALITY).
export async function createCharacter(look, { cellFrac = 0.002 } = {}) {
  const L = { ...DEFAULT_LOOK, ...look };
  const opts = lookToOpts(L, cellFrac);
  const bodyKey = L.body === 'female' ? 'female' : 'male';
  const [clips, heads, gltf, hair, beard, brows] = await Promise.all([
    loadClips(), loadHeadBoxes(), load(BODY_PATHS[bodyKey]),
    opts.hair && opts.hair !== 'none' ? Promise.all([].concat(HAIR_PATHS[opts.hair]).map(load)) : null,
    opts.beard ? load(BEARD_PATH) : null,
    load(BROW_PATHS[bodyKey]),
  ]);
  const built = buildFacetedHuman(gltf, opts, { hair, beard, brows }, heads, bodyKey);
  const root = new THREE.Group();
  root.add(built.root);
  const mixer = new THREE.AnimationMixer(built.root);
  const hand = built.mesh.skeleton.bones.find((b) => b.name === 'hand_r') || null;
  let current = null, currentName = null, oneShot = null;

  function play(roleOrClip, { fade = 0.2, timeScale = 1, restart = false } = {}) {
    const name = CLIPS[roleOrClip] || roleOrClip;
    const clip = clips.get(name);
    if (!clip) return;
    if (ONE_SHOTS.has(name)) {
      // hold: stay on the last frame (death) until something else plays
      const hold = name === 'Death01';
      const a = mixer.clipAction(clip);
      const again = oneShot && oneShot.action === a; // re-triggering the same swing: restart in place
      a.reset().setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = hold;
      a.timeScale = timeScale;
      if (again) a.setEffectiveWeight(1).play(); // a fade-in from zero would flash the bind pose
      else a.setEffectiveWeight(1).fadeIn(0.12).play();
      if (oneShot && oneShot.action !== a) oneShot.action.fadeOut(0.12);
      if (current) current.fadeOut(0.12);
      oneShot = { action: a, until: hold ? Infinity : clip.duration / timeScale - 0.15 };
      return;
    }
    if (oneShot && oneShot.until === Infinity) { oneShot.action.fadeOut(fade); oneShot = null; restart = true; } // getting up from a hold
    if (name === currentName && !restart) { current.timeScale = timeScale; return; }
    const a = mixer.clipAction(clip);
    a.reset().setLoop(THREE.LoopRepeat, Infinity);
    a.timeScale = timeScale;
    a.fadeIn(fade).play();
    if (current && current !== a && !oneShot) current.fadeOut(fade); // restarting the same clip must not fade it out
    current = a;
    currentName = name;
  }

  // Lean: an extra forward bend of the spine layered on top of the clip (mining reuses the chop,
  // leaned over so the swing lands on a rock instead of at chest height). Eased in and out.
  const spine = [built.mesh.skeleton.bones.find((b) => b.name === 'spine_01'), built.mesh.skeleton.bones.find((b) => b.name === 'spine_02')].filter(Boolean);
  let lean = 0, leanGoal = 0;
  function setLean(rad) { leanGoal = rad; }
  function update(dt) {
    mixer.update(dt);
    lean += (leanGoal - lean) * Math.min(1, dt * 6);
    if (Math.abs(lean) > 0.001) for (const b of spine) b.rotateX(lean / spine.length);
    if (built.face) built.face.update(dt);
    if (oneShot) {
      oneShot.until -= dt;
      if (oneShot.until <= 0) {
        oneShot.action.fadeOut(0.25);
        if (current) current.reset().fadeIn(0.25).play();
        oneShot = null;
      }
    }
  }

  function dispose() {
    mixer.stopAllAction();
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    root.removeFromParent();
  }

  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  // Jump the current clip to time t (seconds) and pose immediately (dev tools, previews).
  function seek(t) { if (current) { current.time = t; current.weight = 1; current.setEffectiveWeight(1); mixer.update(0); lean = leanGoal; if (Math.abs(lean) > 0.001) for (const b of spine) b.rotateX(lean / spine.length); } }
  const clipDuration = (roleOrClip) => { const c = clips.get(CLIPS[roleOrClip] || roleOrClip); return c ? c.duration : 0; };
  return { root, mesh: built.mesh, face: built.face, tris: built.tris, play, update, seek, clipDuration, setLean, hand, dispose, get clip() { return currentName; } };
}

// Dev tools (animation audit): add clips from another glTF (e.g. the full UAL library) so play()
// can use them by name. Scale and per-bone position tracks are dropped like the curated set.
export async function registerExtraClips(animations) {
  const byName = await loadClips();
  for (const c of animations) {
    if (byName.has(c.name)) continue;
    const k = c.clone();
    k.tracks = k.tracks.filter((t) => !t.name.endsWith('.scale') && !(t.name.endsWith('.position') && !/^(root|pelvis)\./.test(t.name)));
    byName.set(c.name, k);
  }
  return [...byName.keys()];
}

export function preloadCharacterAssets() {
  return Promise.all([loadClips(), loadHeadBoxes()]);
}

// ---------------------------------------------------------------------
// Hand tools: one simple model per tool type. The group's local +Y runs along the handle (grip at
// the origin, head at the top); GRIP rotates that into the hand bone's frame so the head faces the
// swing. Tuned with renders of TreeChopping_Loop.
// ---------------------------------------------------------------------
// Solved with tests/_tool_grip.html (__bestSpin): spin about the handle so the blade edge leads the
// hand at the fastest point of TreeChopping_Loop, with the handle tilted ~45 degrees off the forearm.
export const GRIP = { pos: [0, 0.08, 0], rot: [0, 3.4, 0.8, 'ZYX'] };
// Blades and hafted weapons (solved in tests/_tool_grip.html with __solveGrip + flip): the handle
// crosses the fist and the blade leaves the thumb side, continuing the arm at the strike.
export const BLADE_GRIP = { pos: [0, 0.08, 0], rot: [3.665, 6.021, 4.4506, 'XYZ'], flip: true };
const GRIP_OF = { machete: BLADE_GRIP, cleaver: BLADE_GRIP, maul: BLADE_GRIP, spear: BLADE_GRIP };
const FLIP_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
function applyGrip(inner, g) {
  inner.position.fromArray(g.pos);
  inner.rotation.fromArray(g.rot);
  if (g.flip) inner.quaternion.premultiply(FLIP_Q);
}
const HANDLE_LEN = { pick: 0.62, hatchet: 0.62, sickle: 0.32, machete: 0.16, cleaver: 0.2, maul: 0.75, spear: 1.5 };
export function createToolMesh() {
  const group = new THREE.Group();
  const heads = {};
  const wood = new THREE.MeshStandardMaterial({ color: '#6b4f36', roughness: 0.8, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: '#c9a2e8', metalness: 0.6, roughness: 0.35, flatShading: true });
  const inner = new THREE.Group(); // tool in its own frame (+Y handle, +Z = the striking side)
  let overrideGrip = false; // dev pages can pin a grip
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.62, 6), wood);
  handle.position.y = 0.2;
  inner.add(handle);
  const pick = new THREE.Group();
  for (const side of [-1, 1]) {
    const prong = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 5), metal);
    prong.rotation.x = side * Math.PI / 2; // points along +Z / -Z
    prong.position.z = side * 0.11;
    pick.add(prong);
  }
  pick.position.y = 0.48;
  const hatchet = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.11, 0.15), metal); // blade edge toward +Z
  hatchet.position.set(0, 0.46, 0.08);
  const sickle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 4, 10, Math.PI * 1.1), metal);
  sickle.rotation.y = -Math.PI / 2;
  sickle.position.set(0, 0.26, 0.1); // short handle (see HANDLE_LEN)
  // melee weapons (M2): the blade/head sits past the grip along +Y, edge toward +Z like the tools
  const machete = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.07), metal);
  machete.position.set(0, 0.34, 0.015);
  const cleaver = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.34, 0.16), metal);
  cleaver.position.set(0, 0.3, 0.05);
  const maul = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.24), metal);
  maul.position.set(0, 0.58, 0);
  const spear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.26, 5), metal);
  spear.position.set(0, 1.48, 0);
  Object.assign(heads, { pick, hatchet, sickle, machete, cleaver, maul, spear });
  inner.add(pick, hatchet, sickle, machete, cleaver, maul, spear);
  group.add(inner);
  group.userData.inner = inner;
  applyGrip(inner, GRIP);
  group.visible = false;
  return {
    group,
    show(kind, color) {
      group.visible = !!heads[kind];
      if (!overrideGrip) applyGrip(inner, GRIP_OF[kind] || GRIP); // tools and blades sit differently in the fist
      const len = HANDLE_LEN[kind] || 0.62; // sickles are hand tools, not polearms
      handle.scale.y = len / 0.62;
      handle.position.y = len / 2 - 0.1; // handle runs from just below the grip to its length
      for (const [k, m] of Object.entries(heads)) m.visible = k === kind;
      if (color) metal.color.set(color);
    },
    setGrip(pos, rot) { overrideGrip = true; inner.position.fromArray(pos); inner.rotation.fromArray(rot); },
  };
}
// Parent a tool group to a character's right hand, compensating the armature's unit scale.
export function attachToHand(char, group) {
  if (!char.hand) return false;
  char.root.updateMatrixWorld(true);
  const ws = char.hand.getWorldScale(new THREE.Vector3());
  const rs = char.root.getWorldScale(new THREE.Vector3());
  group.scale.setScalar(rs.x / ws.x);
  char.hand.add(group);
  return true;
}
