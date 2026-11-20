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

const DIR = 'assets/characters/';
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
  interact: 'Interact', cheer: 'Yes', pickup: 'PickUp_Table', talk: 'Idle_Talking_Loop',
};
const ONE_SHOTS = new Set(['Interact', 'Yes', 'PickUp_Table']);

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
export async function createCharacter(look) {
  const L = { ...DEFAULT_LOOK, ...look };
  const opts = lookToOpts(L);
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
      const a = mixer.clipAction(clip);
      a.reset().setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = false;
      a.setEffectiveWeight(1).fadeIn(0.15).play();
      if (current) current.fadeOut(0.15);
      oneShot = { action: a, until: clip.duration - 0.2 };
      return;
    }
    if (name === currentName && !restart) { current.timeScale = timeScale; return; }
    const a = mixer.clipAction(clip);
    a.reset().setLoop(THREE.LoopRepeat, Infinity);
    a.timeScale = timeScale;
    a.fadeIn(fade).play();
    if (current && !oneShot) current.fadeOut(fade);
    current = a;
    currentName = name;
  }

  function update(dt) {
    mixer.update(dt);
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
  return { root, mesh: built.mesh, face: built.face, tris: built.tris, play, update, hand, dispose, get clip() { return currentName; } };
}

export function preloadCharacterAssets() {
  return Promise.all([loadClips(), loadHeadBoxes()]);
}
