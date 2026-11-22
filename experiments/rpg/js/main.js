// =====================================================================
// MAIN: boot, camera, click-to-move, HUD, minimap, labels.
// Phase A of Milestone 1 (world + movement). No gathering/saves yet.
// =====================================================================

import * as THREE from 'three';
import { generateSystem, generatePlanet, sampleHeight, worldToCell, cellToWorld, BIOME, WALK_SPEED } from './worldgen.js';
import { findPath, nearestReachable } from './pathfind.js';
import { buildPlanetView } from './render.js';
import { QUIRKS } from '../data/quirks.js';
import { RESOURCE_BY_ID } from './worldgen.js';
import { ITEMS, STARTER_ITEMS } from '../data/items.js';
import { createInventory, addItem, removeAt } from './inventory.js';
import { checkGather, attemptGather, initialNodeState, afterSuccess, ATTEMPT_SECONDS } from './gathering.js';
import { levelForXp, SKILLS } from '../data/skills.js';
import { SFX } from './sfx.js';
import { createUI, itemIconHTML } from './ui.js';
import { createPanels, sellPrice } from './panels.js';
import { permitPrice } from '../data/travel.js';
import { countItem, removeItems, canAdd } from './inventory.js';
import { serialize, deserialize, writeSlot, readSlot, downloadJSON } from './save.js';
import { createMenu } from './menu.js';
import { buildNpcModel } from './npc_models.js';
import { createDialogue } from './dialogue.js';
import { generateAmbientNpcs, quipPool } from './npcs.js';
import { QUARTERMASTER } from '../data/npcs.js';
import { QUESTS, QUEST_BY_ID } from '../data/quests/index.js';
import { questsForPlanet, questPlanetIndex, resolveSlots, fillText, quirkLine, pickEntry, slotRef, journalEntry, questStatus } from './quests.js';
import { freeSlots } from './inventory.js';
import { createCharacter, randomLook, preloadCharacterAssets, createToolMesh, attachToHand } from './player_character.js';
import { createQuirkRuntime, discoverSites, crystalCompass } from './quirk_mechanics.js';
import { loadSettings, QUALITY } from './settings.js';
import { createCreator } from './creator.js';
import { createPause } from './pause.js';
import { startArrival } from './arrival.js';
import { TICK, REGEN, hpOf, weaponOf, totalArmor, hitDamage, armorReduce, combatXp, equipFromInventory, unequip, splitForCrate } from './combat.js';
import { spawnCreatures, updateCreatures, hurtCreature, safeZones, inSafeZone } from './creatures.js';
import { buildCreatureModel } from './creature_models.js';
import { CREATURES } from '../data/creatures.js';
import { SLOTS, SLOT_NAMES } from '../data/equipment.js';

// ---------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 1200);
const cam = { yaw: Math.PI * 0.25, pitch: 0.92, dist: 36, target: new THREE.Vector3() };

// Game mode: 'title' (menus over a live planet), 'creator', 'arrival' (landing), 'play'.
let mode = 'title';
const playing = () => mode === 'play' && !pause.isOpen();
function setMode(m) {
  mode = m;
  document.body.dataset.mode = m;
  player.mesh.visible = m === 'play' || (m === 'arrival' && arrival && arrival.stepped);
}

// Settings (device-level, localStorage)
const settings = loadSettings();
function applySettings(changed) {
  const q = QUALITY[settings.quality];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (renderer.shadowMap.enabled !== q.shadows) {
    renderer.shadowMap.enabled = q.shadows;
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  }
  SFX.setVolume(settings.master, settings.sfx);
  document.getElementById('fps').style.display = settings.showFps ? 'block' : 'none';
  if (changed === 'quality' && mode === 'play') rebuildPlayerModel();
}

// ---------------------------------------------------------------------
// Player: the faceted human (js/player_character.js), built from state.look.
// ---------------------------------------------------------------------
const player = {
  x: 0, z: 0, y: 0, facing: 0,
  path: [], baseSpeed: WALK_SPEED,
  mesh: new THREE.Group(),
  char: null,          // { root, play, update, hand, ... } once built
};
scene.add(player.mesh);
// Movement clip and the ground speed (m/s) its stride matches at timeScale 1, measured from the
// planted foot (tests/_measure_gait.html): Walk 0.96, Jog 2.5, Sprint 3.3.
const GAITS = { jog: { clip: 'Jog_Fwd_Loop', native: 2.5 }, sprint: { clip: 'Sprint_Loop', native: 3.3 } };
let gait = GAITS.sprint; // the jog clip has to play at 1.6x to keep up with 4.4 m/s and looks frantic
let charBuild = 0;
async function rebuildPlayerModel() {
  const token = ++charBuild;
  if (!state.look) state.look = randomLook();
  const look = lookWithArmor(state.look, state.equipment);
  try {
    const c = await createCharacter(look, { cellFrac: QUALITY[settings.quality].cellFrac });
    if (token !== charBuild) { c.dispose(); return; }
    if (player.char) player.char.dispose();
    player.char = c;
    player.mesh.add(c.root);
    if (!attachToHand(c, toolMesh)) player.mesh.add(toolMesh);
    addHelmet(c, state.equipment && state.equipment.head);
    refreshHeldItem();
    c.play('idle', { fade: 0 });
  } catch (e) {
    console.error('Player model failed to build', e);
  }
}

// Armor shows on the drifter: a chestplate becomes a metal vest over the shirt, greaves recolor the
// legs and boots, a helmet is a simple shell on the Head bone.
const ARMOR_TINT = { bismuth: '#b79acb', cobalt: '#3d5fae', tungsten: '#7d848f' };
function lookWithArmor(look, eq) {
  const L = JSON.parse(JSON.stringify(look));
  L.outfit = L.outfit || {}; L.colors = L.colors || {};
  const metal = (id) => id && ITEMS[id] && ARMOR_TINT[ITEMS[id].metal];
  if (eq && metal(eq.body)) { L.outfit.layer = 'vest'; L.colors.layer = metal(eq.body); }
  if (eq && metal(eq.legs)) { L.outfit.pants = 'full'; L.outfit.boots = 'tall'; L.colors.pants = metal(eq.legs); L.colors.boots = '#2a2d34'; }
  return L;
}
function addHelmet(c, id) {
  const def = id && ITEMS[id];
  if (!def) return;
  const head = c.mesh.skeleton.bones.find((b) => b.name === 'Head');
  if (!head) return;
  c.root.updateMatrixWorld(true);
  const ws = head.getWorldScale(new THREE.Vector3()).x, rs = c.root.getWorldScale(new THREE.Vector3()).x;
  const helm = new THREE.Group();
  helm.scale.setScalar(rs / ws);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: ARMOR_TINT[def.metal], metalness: 0.5, roughness: 0.4, flatShading: true }));
  shell.position.set(0, 0.11, -0.005);
  shell.scale.set(1, 0.95, 1.12);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 4, 16), shell.material);
  brim.rotation.x = Math.PI / 2;
  brim.position.set(0, 0.105, 0);
  brim.scale.set(1, 1.12, 1);
  helm.add(shell, brim);
  helm.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  head.add(helm);
}
// The hand shows the gathering tool while gathering, otherwise the equipped weapon (if any).
function refreshHeldItem() {
  if (gathering) return;
  const w = state.equipment && state.equipment.weapon && ITEMS[state.equipment.weapon];
  showTool(w ? w.weaponKind : null, w ? w.color : null);
}

// Hand tool shown while gathering (player_character.js builds and grips it).
const tool = createToolMesh();
const toolMesh = tool.group;
const showTool = (kind, color) => tool.show(kind, color);

// ---------------------------------------------------------------------
// Player state (inventory, skills, credits). Saves come in Phase D.
// ---------------------------------------------------------------------
const state = {
  inventory: createInventory(),
  xp: { mining: 0, foraging: 0 },
  credits: 0,
  bank: {},                 // shared across all lockers: itemId -> qty
  permits: new Set([0]),    // planet indices you may launch to (starter is free)
  visited: new Set(),
  planetIndex: 0,
  playtime: 0,
  quests: {},
  reputation: 0,
  name: 'Drifter',
  look: null,               // character appearance (slider units, see player_character.js)
  discovered: {},           // planetIndex -> [siteId] found by walking near them
  equipment: { weapon: null, head: null, body: null, legs: null },
  hp: null,                 // current health (null = full)
  crate: null,              // salvage crate from your last death: { planetIndex, x, z, items }
  lastSettlement: null,     // where you wake up: { planetIndex, x, z, name }
};
// (starter items are granted in newGame(); stand-in for the Quartermaster)
let gathering = null;
let nodeStates = new Map();
let gameTime = 0;
let foragingRespawnMult = 1;

const ui = createUI({
  onSlotUse(i, shift) {
    const s = state.inventory[i];
    if (!s) return;
    const def = ITEMS[s.id];
    const mode = panels && panels.current && panels.current.kind;
    if (mode === 'bank') { deposit(s.id, shift ? Infinity : 1); return; }
    if (mode === 'shop') { sell(s.id, shift ? Infinity : 1); return; }
    if (shift) { dropSlot(i); return; }
    if (def.kind === 'weapon' || def.kind === 'armor') { equipSlot(i); return; }
    toast(def.kind === 'tool' ? `${def.name}: needs ${SKILLS[def.skill].name} ${def.levelReq}.` : `${def.name}. Sells for ${sellPrice(def)} cr.`);
  },
  onSlotDrop(i) { dropSlot(i); },
});
function equipSlot(i) {
  const r = equipFromInventory(state, i);
  if (!r.ok) { if (r.reason) { SFX.fail(); toast(r.reason); } return; }
  SFX.clank();
  afterGearChange();
}
function unequipSlot(slot) {
  const r = unequip(state, slot);
  if (!r.ok) { if (r.reason) toast(r.reason); return; }
  afterGearChange();
}
function afterGearChange() {
  markDirty();
  refreshUI();
  rebuildPlayerModel(); // armor changes the outfit; the weapon is re-gripped on rebuild
}
function dropSlot(i) {
  const s = removeAt(state.inventory, i);
  if (!s) return;
  toast(`You drop the ${ITEMS[s.id].name}.`);
  ui.renderInventory(state.inventory);
  markDirty();
}
// ---------------------------------------------------------------------
// Bank / shop / travel actions (Phase C)
// ---------------------------------------------------------------------
function deposit(id, qty) {
  const have = countItem(state.inventory, id);
  const n = removeItems(state.inventory, id, Math.min(have, qty));
  if (!n) return;
  state.bank[id] = (state.bank[id] || 0) + n;
  markDirty();
  refreshUI();
  panels.render();
}
function depositAll(filter) {
  for (const s of state.inventory.slice()) {
    if (s && filter(ITEMS[s.id])) deposit(s.id, Infinity);
  }
}
function withdraw(id, qty) {
  let n = 0;
  while (n < qty && (state.bank[id] || 0) > 0 && canAdd(state.inventory, id)) {
    addItem(state.inventory, id, 1);
    state.bank[id]--;
    n++;
  }
  if (!state.bank[id]) delete state.bank[id];
  markDirty();
  if (n < qty && qty !== Infinity) toast('Your inventory is full.');
  else if (qty === Infinity && state.bank[id]) toast('Your inventory is full.');
  refreshUI();
}
function sell(id, qty) {
  const def = ITEMS[id];
  const have = countItem(state.inventory, id);
  const n = removeItems(state.inventory, id, Math.min(have, qty));
  if (!n) return;
  const earned = n * sellPrice(def);
  state.credits += earned;
  markDirty();
  SFX.success();
  toast(`Sold ${n} × ${def.name} for ${earned} cr.`);
  refreshUI();
  panels.render();
}
function buy(id) {
  const def = ITEMS[id];
  if (state.credits < def.value) { toast("You can't afford that."); return; }
  if (!canAdd(state.inventory, id)) { toast('Your inventory is full.'); return; }
  state.credits -= def.value;
  addItem(state.inventory, id, 1);
  markDirty();
  SFX.success();
  toast(`Bought a ${def.name}.`);
  refreshUI();
}
function buyPermit(index) {
  const meta = system.planets[index];
  const price = permitPrice(meta);
  if (state.credits < price) { toast("You can't afford that permit."); return; }
  state.credits -= price;
  state.permits.add(index);
  markDirty();
  SFX.levelUp();
  toast(`Launch permit for ${meta.name} approved. Please keep it somewhere safe. (We won't.)`);
  refreshUI();
}
function launch(index) {
  if (!state.permits.has(index)) return;
  loadPlanet(index);
  toast(`Welcome to ${system.planets[index].name}.`);
  saveNow();
}

const panels = createPanels({
  getState: () => state,
  getSystem: () => system,
  withdraw, depositAll, buy, buyPermit, launch,
  getJournal: () => getJournal(),
});

// ---------------------------------------------------------------------
// Save session (Phase D)
// ---------------------------------------------------------------------
let currentSlot = null;
let lastSaveAt = 0;
let dirty = false;
let saving = false;
const saveStatusEl = document.getElementById('save-status');

function markDirty() { dirty = true; }

function resetState() {
  Object.assign(state, {
    inventory: createInventory(), xp: { mining: 0, foraging: 0 }, credits: 0, bank: {},
    permits: new Set([0]), visited: new Set(), planetIndex: 0, playtime: 0, quests: {}, reputation: 0, name: 'Drifter', look: null, discovered: {},
    equipment: { weapon: null, head: null, body: null, legs: null }, hp: null, crate: null, lastSettlement: null,
  });
}

async function saveNow() {
  if (!currentSlot || !planet || saving) return;
  saving = true;
  try {
    const data = serialize(state, { slotId: currentSlot, seed: system.seed, pos: { x: player.x, z: player.z }, planetName: planet.meta.name });
    await writeSlot(data);
    dirty = false;
    lastSaveAt = performance.now();
  } catch (e) {
    console.error('Save failed', e);
    toast('Save failed. Try exporting your save as a backup.');
  } finally {
    saving = false;
  }
}

function updateSaveStatus(now) {
  if (!saveStatusEl) return;
  if (!currentSlot) { saveStatusEl.textContent = 'Not saving (debug world)'; return; }
  if (!lastSaveAt) { saveStatusEl.textContent = 'Not saved yet'; return; }
  const sec = Math.round((now - lastSaveAt) / 1000);
  saveStatusEl.textContent = sec < 3 ? 'Saved ✓' : `Saved ${sec < 60 ? sec + 's' : Math.round(sec / 60) + 'm'} ago`;
}

// New Game: slot picked -> creator -> random world -> arrival.
let pendingSlot = null;
function newGame(slotId) {
  pendingSlot = slotId;
  setMode('creator');
  creator.show({});
}
function beginNewGame(name, look) {
  resetState();
  state.name = name;
  state.look = look;
  rebuildPlayerModel();
  currentSlot = pendingSlot;
  loadSystem(randomSeed(), 0);
  refreshUI();
  saveNow();
  beginArrival();
}

// Arrival: the lander drops onto the pad while the camera swoops down; click or Esc skips.
let arrival = null;
function beginArrival() {
  const pad = planet.outpost.anchors.pad;
  arrival = startArrival(scene, { x: pad.x, y: sampleHeight(planet, pad.x, pad.z), z: pad.z });
  setMode('arrival');
}
function endArrival() {
  if (arrival && !arrival.done) arrival.skip();
  arrival = null;
  cam.dist = 36; cam.pitch = 0.92;
  setMode('play');
  toast(`Welcome, ${state.name}. Talk to ${QUARTERMASTER.name} at the launch pad for your starter kit.`);
}
function updateArrival(dt) {
  arrival.update(dt);
  const k = arrival.progress, e = 1 - (1 - k) ** 2;
  cam.dist = 120 + (36 - 120) * e;
  cam.pitch = 1.3 + (0.92 - 1.3) * e;
  cam.yaw += dt * 0.12 * (1 - e);
  player.mesh.visible = arrival.stepped;
  if (arrival.done) endArrival();
}

// Title: a slow drift over a showcase planet (changes daily) behind the menus.
function showcaseSeed() {
  const d = new Date();
  return `showcase${d.getFullYear()}${d.getMonth() + 1}${d.getDate()}`;
}
function enterTitle(where = 'title') {
  currentSlot = null;
  setMode('title');
  if (!system || !system.seed.startsWith('showcase')) loadSystem(showcaseSeed(), 0);
  cam.dist = 70; cam.pitch = 0.62;
  cam.target.set(planet.outpost.x, sampleHeight(planet, planet.outpost.x, planet.outpost.z), planet.outpost.z);
  menu.show(where);
}

async function continueGame(slotId) {
  try {
    const raw = await readSlot(slotId);
    const d = deserialize(raw);
    resetState();
    Object.assign(state, {
      inventory: d.inventory, xp: d.xp, credits: d.credits, bank: d.bank,
      permits: d.permits, visited: d.visited, playtime: d.playtime, quests: d.quests, reputation: d.reputation,
      name: d.name, look: d.look || randomLook(), discovered: d.discovered,
      equipment: d.equipment, hp: d.hp, crate: d.crate, lastSettlement: d.lastSettlement,
    });
    rebuildPlayerModel();
    currentSlot = slotId;
    loadSystem(d.seed, d.planetIndex);
    if (d.pos && canStand(d.pos.x, d.pos.z)) {
      player.x = d.pos.x; player.z = d.pos.z;
      player.y = sampleHeight(planet, player.x, player.z);
      cam.target.set(player.x, player.y, player.z);
    }
    refreshUI();
    lastSaveAt = performance.now();
    cam.dist = 36; cam.pitch = 0.92;
    setMode('play');
    if (d.dropped.length) toast(`Some unknown items were removed from this save (${d.dropped.length}).`);
    else toast(`Welcome back, ${state.name}.`);
  } catch (e) {
    alert(`Could not load that save: ${e.message}`);
    enterTitle('load');
  }
}

const menu = createMenu({
  onContinue: continueGame,
  onNewGame: newGame,
  settings,
  onSettingsChange: (s, k) => applySettings(k),
});
const creator = createCreator({
  getCellFrac: () => QUALITY[settings.quality].cellFrac,
  onBegin: beginNewGame,
  onBack: () => enterTitle('new'),
});
function exportSave() {
  if (!planet || !currentSlot) return;
  const data = serialize(state, { slotId: currentSlot, seed: system.seed, pos: { x: player.x, z: player.z }, planetName: planet.meta.name });
  downloadJSON(data, `drifter-${state.name.replace(/\W+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`);
}
const pause = createPause({
  settings,
  onSettingsChange: (s, k) => applySettings(k),
  onSave: async () => { if (!currentSlot) return 'Nothing to save here.'; await saveNow(); return 'Game saved.'; },
  onQuit: async () => { await saveNow(); enterTitle(); },
  onExport: exportSave,
});

document.getElementById('btn-save').addEventListener('click', async () => {
  if (!currentSlot) { toast('This is a debug world. Start a game from the menu to save.'); return; }
  await saveNow();
  toast('Game saved.');
});
document.getElementById('btn-menu').addEventListener('click', async () => {
  await saveNow();
  enterTitle();
});
document.getElementById('btn-journal').addEventListener('click', () => panels.open('journal', null, {}));
document.getElementById('btn-export').addEventListener('click', () => {
  if (!planet) return;
  const data = serialize(state, { slotId: currentSlot || 'export', seed: system.seed, pos: { x: player.x, z: player.z }, planetName: planet.meta.name });
  downloadJSON(data, `drifter-${system.seed}-${new Date().toISOString().slice(0, 10)}.json`);
});
window.addEventListener('beforeunload', () => { if (dirty) saveNow(); });

// ---------------------------------------------------------------------
// NPCs, dialogue & quests (Phase E)
// ---------------------------------------------------------------------
let npcs = [];
let questSlots = {};
const dialogue = createDialogue({ onClose: () => npcs.forEach((n) => { n.talking = false; }) });

function flags() {
  if (!state.quests._flags) state.quests._flags = {};
  return state.quests._flags;
}

function clearNpcs() {
  npcGen++;
  for (const n of npcs) {
    scene.remove(n.group);
    n.labelEl.remove();
    if (n.group.userData.char) n.group.userData.char.dispose();
  }
  npcs = [];
}

function standablePoint(x, z) {
  const c = worldToCell(planet, x, z);
  if (c.gx >= 0 && c.gy >= 0 && c.gx < planet.W && c.gy < planet.H && planet.passable[c.gy * planet.W + c.gx]) return { x, z };
  const t = nearestReachable(planet, c.gx, c.gy, 8);
  return t ? cellToWorld(planet, t.gx, t.gy) : { x, z };
}

// Humanoid NPCs become faceted humans (def.human = look). Builds are queued one at a time so a
// town doesn't freeze the frame; the primitive model stands in until its character is ready.
const NPC_DETAIL = { high: 0.005, medium: 0.007, low: 0.01 };
let npcBuildQueue = [], npcBuilding = false, npcGen = 0;
function queueNpcCharacter(n) {
  npcBuildQueue.push(n);
  if (!npcBuilding) pumpNpcBuilds();
}
async function pumpNpcBuilds() {
  npcBuilding = true;
  while (npcBuildQueue.length) {
    const n = npcBuildQueue.shift();
    if (n.gen !== npcGen) continue;
    try {
      const c = await createCharacter(n.def.human, { cellFrac: NPC_DETAIL[settings.quality] || 0.006 });
      if (n.gen !== npcGen) { c.dispose(); continue; }
      const g = n.group, body = g.userData.body;
      body.visible = false;
      g.scale.setScalar(1); // the character carries its own height
      g.add(c.root);
      c.play('idle', { fade: 0 });
      const h = 1.8 * (n.def.human.height || 100) / 100;
      g.userData.char = c;
      g.userData.headY = h * 0.93;
      g.userData.height = h + 0.15;
    } catch (e) {
      console.error('NPC character failed', n.def.name, e);
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  npcBuilding = false;
}

function spawnNpc(def, x, z, extra) {
  const group = buildNpcModel(def);
  const p = standablePoint(x, z);
  const n = { id: extra.id || def.id, def, group, x: p.x, z: p.z, homeX: p.x, homeZ: p.z, facing: 0, talking: false, t: Math.random() * 10, ...extra };
  if (extra.faceX !== undefined) n.facing = Math.atan2(extra.faceX - p.x, extra.faceZ - p.z);
  group.userData.interact = { type: 'npc', npcId: n.id, name: def.name, verb: 'Talk to', x: p.x, z: p.z, reach: 2.4 };
  scene.add(group);
  const el = document.createElement('div');
  el.className = 'lbl lbl-npc';
  labelsEl.appendChild(el);
  n.labelEl = el;
  n.gen = npcGen;
  npcs.push(n);
  if (def.human) queueNpcCharacter(n);
  return n;
}

function spawnNpcsForPlanet() {
  clearNpcs();
  questSlots = {};
  const o = planet.outpost;
  if (planet.meta.isStarter) {
    const pad = o.anchors.pad;
    const dx = o.x - pad.x, dz = o.z - pad.z, len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    spawnNpc(QUARTERMASTER, pad.x + ux * 2.5 - uz * 4.2, pad.z + uz * 2.5 + ux * 4.2, { id: 'quartermaster', kind: 'qm', faceX: pad.x, faceZ: pad.z });
  }
  for (const q of questsForPlanet(system, state.planetIndex)) {
    const slots = resolveSlots(q, planet);
    questSlots[q.id] = slots;
    for (const [castId, def] of Object.entries(q.cast)) {
      const anchor = def.spawn && def.spawn.anchor === 'outpost.starter.plaza' ? o.anchors.plaza : { x: o.x, z: o.z };
      const off = (def.spawn && def.spawn.offset) || [0, 0, 0];
      spawnNpc(def, anchor.x + off[0], anchor.z + off[2], { id: `${q.id}:${castId}`, kind: 'quest', questId: q.id, castId, faceX: o.x, faceZ: o.z });
    }
  }
  for (const d of generateAmbientNpcs(planet)) {
    spawnNpc(d, d.x, d.z, { id: d.id, kind: 'ambient', role: d.role, wander: d.wander, faceX: d.faceX, faceZ: d.faceZ });
  }
}

function questCtx(q) {
  const qs = state.quests[q.id];
  return { step: qs ? qs.step : 0, flags: flags(), inventory: state.inventory, slots: questSlots[q.id] || (qs && qs.slots) || {} };
}

function npcMarker(n) {
  if (n.kind === 'qm') return flags().qm_kit ? '' : '!';
  if (n.kind !== 'quest') return '';
  const q = QUEST_BY_ID[n.questId];
  const first = Object.keys(q.cast)[0];
  if (n.castId !== first) return '';
  const st = questStatus(state, q.id);
  if (st === 'not_started') return '!';
  if (st === 'started' && pickEntry(q.dialogue.entry, questCtx(q)) === 'return_ready') return '?';
  return '';
}

function speakerFrom(id, q) {
  if (id === 'player') return { name: state.name || 'You' };
  const n = npcs.find((x) => (q ? x.questId === q.id && x.castId === id : x.id === id));
  if (n) return { name: n.def.name, voice: n.def.voice || { pitch: 1 }, model: n.group, robot: n.def.body === 'robot_small' };
  const def = q && q.cast[id];
  return def ? { name: def.name, voice: def.voice, robot: def.body === 'robot_small' } : { name: id };
}

// What this planet actually has, so locals don't talk about lakes that aren't there.
let featureCache = null;
function planetFeatures() {
  if (featureCache && featureCache.planet === planet) return featureCache.f;
  let lake = false;
  for (let i = 0; i < planet.water.length && !lake; i++) if (planet.water[i] && planet.land[i]) lake = true;
  const f = {
    lake,
    bridges: (planet.bridges || []).length > 0,
    tower: planet.outpost.buildings.some((b) => b.kind === 'tower'),
    sweeper: questsForPlanet(system, state.planetIndex).some((q) => q.id === 'a_clean_break'),
  };
  featureCache = { planet, f };
  return f;
}

// Every dialogue can say {player}.
function startDialogue(d) {
  const fill = d.fill || ((x) => x);
  dialogue.start({ ...d, fill: (str) => String(fill(str)).replace(/\{player\}/g, state.name || 'Drifter') });
}

function talkTo(npcId) {
  const n = npcs.find((x) => x.id === npcId);
  if (!n) return;
  SFX.unlock();
  n.talking = true;
  // personal space: step back if we ended up too close
  const gap = Math.hypot(player.x - n.x, player.z - n.z);
  if (gap < 1.3) {
    const ux = gap > 0.01 ? (player.x - n.x) / gap : 1, uz = gap > 0.01 ? (player.z - n.z) / gap : 0;
    const nx = n.x + ux * 1.4, nz = n.z + uz * 1.4;
    if (canStand(nx, nz)) { player.x = nx; player.z = nz; }
  }
  n.facing = Math.atan2(player.x - n.x, player.z - n.z);
  player.facing = Math.atan2(n.x - player.x, n.z - player.z);

  if (n.kind === 'quest') {
    const q = QUEST_BY_ID[n.questId];
    const slots = questSlots[q.id];
    const entries = (q.dialogue.entryByCast && q.dialogue.entryByCast[n.castId]) || q.dialogue.entry;
    startDialogue({
      nodes: q.dialogue.nodes,
      startNode: pickEntry(entries, questCtx(q)),
      speaker: (id) => speakerFrom(id, q),
      fill: (str) => (str === '@quirkLine' ? quirkLine(q, planet, slots) : fillText(str, slots)),
      onAction: (a) => questAction(q, a),
    });
  } else if (n.kind === 'qm') {
    const dlg = QUARTERMASTER.dialogue;
    startDialogue({
      nodes: dlg.nodes,
      startNode: pickEntry(dlg.entry, { flags: flags() }),
      speaker: (id) => speakerFrom(id),
      fill: (str) => str,
      onAction: (a) => qmAction(a),
    });
  } else {
    const pool = quipPool(n.role, planet.meta.quirks, planetFeatures());
    const line = pool[Math.floor(Math.random() * pool.length)];
    const service = n.role === 'shopkeeper' ? 'shop' : n.role === 'clerk' ? 'bank' : null;
    const nodes = {
      start: { speaker: n.id, lines: [line], next: service ? 'opts' : undefined },
      opts: {
        speaker: 'player',
        options: [
          { text: service === 'shop' ? "Let's trade." : 'Open my locker.', actions: [{ openService: service }] },
          { text: 'Goodbye.' },
        ],
      },
    };
    startDialogue({
      nodes, startNode: 'start',
      speaker: (id) => speakerFrom(id),
      fill: (str) => str,
      onAction: (a) => {
        if (a.openService === 'shop') panels.open('shop', { x: n.x, z: n.z }, { title: planet.outpost.shopName, meta: planet.meta });
        if (a.openService === 'bank') panels.open('bank', { x: n.x, z: n.z }, { title: 'Storage Locker' });
      },
    });
  }
}

function giveXp(skill, amount) {
  const before = levelForXp(state.xp[skill] || 0);
  state.xp[skill] = (state.xp[skill] || 0) + amount;
  const after = levelForXp(state.xp[skill]);
  ui.floatText(`+${amount} ${SKILLS[skill].name} XP`, '#9fe8ff', { x: player.x, y: player.y + 2.8, z: player.z });
  if (after > before) { SFX.levelUp(); setTimeout(() => ui.levelUp(SKILLS[skill].name, after), 2600); if (player.char) player.char.play('cheer'); }
}

function applyRewards(r) {
  if (!r) return;
  if (r.reputation) state.reputation += r.reputation;
  for (const x of r.xp || []) giveXp(x.skill, x.amount);
  if (r.credits) {
    state.credits += r.credits;
    ui.floatText(`+${r.credits} cr`, '#ffd77a', { x: player.x, y: player.y + 2.3, z: player.z });
  }
  for (const it of r.items || []) addItem(state.inventory, it.id || it, it.qty || 1);
}

function questAction(q, a) {
  const slots = questSlots[q.id];
  let redirect;
  if (a.startQuest && !state.quests[q.id]) {
    state.quests[q.id] = { step: 0, slots };
    toast(`Quest started: ${q.title}. Press J for your journal.`);
    SFX.success();
  }
  if ('setStep' in a && state.quests[q.id]) state.quests[q.id].step = a.setStep;
  if (a.takeItems) for (const t of a.takeItems) removeItems(state.inventory, slotRef(t.item, slots, 'id'), slotRef(t.qty, slots, 'num'));
  if (a.giveRewards) applyRewards(q.rewards);
  if (a.completeQuest && state.quests[q.id]) {
    state.quests[q.id].done = true;
    SFX.questComplete();
    ui.banner('Quest complete!', `${q.title} · +${q.rewards.reputation || 0} Reputation`);
  }
  if (a.playAnim) {
    const n = npcs.find((x) => x.questId === q.id && x.castId === a.playAnim.cast);
    if (n) n.twitch = 0.6;
  }
  if (a.playSfx && SFX[a.playSfx]) SFX[a.playSfx]();
  refreshUI();
  markDirty();
  return redirect;
}

function qmAction(a) {
  if (a.requireFreeSlots && freeSlots(state.inventory) < a.requireFreeSlots) return a.failNode;
  if (a.giveItems) {
    for (const id of a.giveItems) addItem(state.inventory, id, 1);
    SFX.success();
  }
  if (a.setFlag) flags()[a.setFlag] = true;
  refreshUI();
  markDirty();
  return undefined;
}

function updateNpcs(dt, now) {
  for (const n of npcs) {
    n.t += dt;
    const body = n.group.userData.body;
    // Wandering locals
    if (n.wander && !n.talking) {
      if (n.pause > 0) n.pause -= dt;
      else if (!n.target) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * n.wander.r;
        const p = standablePoint(n.wander.cx + Math.cos(a) * r, n.wander.cz + Math.sin(a) * r);
        n.target = p;
      } else {
        const dx = n.target.x - n.x, dz = n.target.z - n.z, d = Math.hypot(dx, dz);
        if (d < 0.2) { n.target = null; n.pause = 2 + Math.random() * 5; }
        else {
          const sp = Math.min(d, 1.1 * dt);
          n.x += (dx / d) * sp; n.z += (dz / d) * sp;
          n.facing = Math.atan2(dx, dz);
        }
      }
    }
    // Quest animations
    if (n.kind === 'quest' && n.castId === 'dustin') {
      const done = questStatus(state, n.questId) === 'done';
      if (done && !n.talking) {
        const a = n.t * 0.9;
        n.x = n.homeX + Math.cos(a) * 0.9; n.z = n.homeZ + Math.sin(a) * 0.9;
        n.facing = a + Math.PI;
        body.rotation.z = Math.sin(n.t * 8) * 0.05;
      } else {
        const burst = (n.twitch > 0) || (Math.sin(n.t * 2.1) > 0.93);
        if (n.twitch > 0) n.twitch -= dt;
        body.rotation.y = burst ? Math.sin(n.t * 60) * 0.35 : 0;
        body.position.y = burst ? Math.abs(Math.sin(n.t * 40)) * 0.06 : 0;
      }
    } else if (n.group.userData.idle) {
      n.group.userData.idle(body, n.t, !!(n.wander && n.target && !(n.pause > 0) && !n.talking)); // species motion
    } else if (!n.wander || n.pause > 0 || n.talking) {
      body.position.y = Math.sin(n.t * 2 + n.homeX) * 0.02;
    } else {
      body.position.y = Math.abs(Math.sin(n.t * 9)) * 0.05;
    }
    if (n.talking) n.facing = Math.atan2(player.x - n.x, player.z - n.z);
    const y = sampleHeight(planet, n.x, n.z);
    n.group.position.set(n.x, y, n.z);
    let df = n.facing - n.group.rotation.y;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    n.group.rotation.y += df * Math.min(1, dt * 6);
    // faceted humans: walk / talk / idle clips, mouth moves while their line types out
    const ch = n.group.userData.char;
    if (ch) {
      const walking = n.wander && !n.talking && n.target && !(n.pause > 0);
      if (n.talking) ch.play('talk');
      else if (walking) ch.play('walk', { timeScale: 1.1 / 0.96 });
      else ch.play('idle');
      if (ch.face) {
        const sid = dialogue.speakingId();
        const talk = !!n.talking && !!sid && (sid === n.id || sid === n.castId);
        if (talk !== n.faceTalking) { n.faceTalking = talk; ch.face.setTalking(talk); }
      }
      if (Math.hypot(n.x - player.x, n.z - player.z) < 70) ch.update(dt);
    }
    const it = n.group.userData.interact;
    it.x = n.x; it.z = n.z;
    // Label
    const dist = Math.hypot(n.x - player.x, n.z - player.z);
    if (dist > 32) { n.labelEl.style.display = 'none'; continue; }
    const pr = project(n.x, y + n.group.userData.height + 0.35, n.z);
    const marker = npcMarker(n);
    n.labelEl.style.display = 'block';
    n.labelEl.style.left = pr.x + 'px';
    n.labelEl.style.top = pr.y + 'px';
    n.labelEl.innerHTML = (marker ? `<span class="npc-mark">${marker}</span> ` : '') + n.def.name;
  }
}

function getJournal() {
  const sections = [];
  let hiddenCount = 0;
  for (const p of system.planets) {
    const qs = QUESTS.filter((q) => questPlanetIndex(q, system) === p.index);
    if (!qs.length) continue;
    if (!state.visited.has(p.index)) { hiddenCount += qs.length; continue; }
    sections.push({
      planet: p,
      quests: qs.map((q) => (questStatus(state, q.id) === 'not_started' ? { unknown: true } : journalEntry(q, state))),
    });
  }
  const done = QUESTS.filter((q) => questStatus(state, q.id) === 'done').length;
  return { sections, hiddenCount, done, total: QUESTS.length, reputation: state.reputation };
}

function refreshUI() {
  renderGear();
  ui.renderInventory(state.inventory);
  ui.renderSkills(state.xp);
  ui.renderCredits(state.credits, state.reputation);
}

const clickMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.35, 0.55, 24),
  new THREE.MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
);
clickMarker.rotation.x = -Math.PI / 2;
scene.add(clickMarker);
let markerLife = 0;

// ---------------------------------------------------------------------
// World state
// ---------------------------------------------------------------------
let system = null;
let planet = null;
let view = null;
let walkMult = 1;
let quirkRT = null;          // quirk_mechanics runtime for the current planet
let discovered = new Set();  // site ids found on this planet (mirrors state.discovered[planetIndex])
let discoverTimer = 0, chimeTimer = 0;
const labelsEl = document.getElementById('labels');
let labelEls = [];

function randomSeed() {
  const words = ['amber', 'basalt', 'comet', 'drift', 'ember', 'fern', 'gale', 'harbor', 'iris', 'jolt', 'kelp', 'lumen', 'moss', 'nova', 'onyx', 'pebble', 'quill', 'rust', 'sable', 'tide', 'umber', 'vale', 'wisp', 'yarrow', 'zephyr'];
  const w = () => words[Math.floor(Math.random() * words.length)];
  return `${w()}${w()}${Math.floor(Math.random() * 90 + 10)}`;
}

function loadSystem(seed, planetIndex = 0) {
  system = generateSystem(seed);
  document.getElementById('seed-input').value = system.seed;
  const sel = document.getElementById('planet-select');
  sel.innerHTML = '';
  system.planets.forEach((p) => {
    const o = document.createElement('option');
    o.value = p.index;
    o.textContent = `${p.index + 1}. ${p.name} (T${p.tier} ${p.sizeLabel})${p.isStarter ? ' · start' : ''}`;
    sel.appendChild(o);
  });
  loadPlanet(Math.min(planetIndex, system.planets.length - 1));
}

function loadPlanet(index) {
  if (view) view.dispose();
  labelEls.forEach((e) => e.remove());
  labelEls = [];

  const meta = system.planets[index];
  state.planetIndex = index;
  state.visited.add(index);
  state.permits.add(index);
  if (typeof panels !== 'undefined' && panels) panels.close();
  const t0 = performance.now();
  planet = generatePlanet(meta);
  const tGen = performance.now() - t0;
  view = buildPlanetView(scene, planet);
  const tView = performance.now() - t0 - tGen;

  walkMult = meta.quirks.reduce((acc, q) => acc * ((QUIRKS[q].mechanic && QUIRKS[q].mechanic.walkSpeedMult) || 1), 1);
  foragingRespawnMult = meta.quirks.reduce((acc, q) => acc * ((QUIRKS[q].mechanic && QUIRKS[q].mechanic.foragingRespawnMult) || 1), 1);
  gathering = null;
  showTool(null);
  nodeStates = new Map();
  quirkRT = createQuirkRuntime(meta.quirks, Math.random, meta.border);
  discovered = new Set(state.discovered[index] || []);
  state.discovered[index] = [...discovered];
  view.setStorm(0);

  player.x = planet.spawn.x;
  player.z = planet.spawn.z;
  player.y = sampleHeight(planet, player.x, player.z);
  player.path = [];
  pendingInteract = null;
  cam.target.set(player.x, player.y, player.z);

  for (const l of view.labels) {
    const el = document.createElement('div');
    el.className = 'lbl ' + l.cls;
    el.textContent = l.text;
    if (l.tier) el.dataset.tier = l.tier;
    labelsEl.appendChild(el);
    labelEls.push(el);
  }

  document.getElementById('planet-select').value = index;
  updateInfo(meta, tGen, tView);
  spawnNpcsForPlanet();
  spawnCreatureViews();
  buildCrateView();
  checkDiscovery(true);
  buildMinimapBase();
  if (system.seed.startsWith('showcase')) return;
  const url = new URL(window.location.href);
  url.searchParams.set('seed', system.seed);
  url.searchParams.set('planet', index);
  window.history.replaceState(null, '', url);
}

// ---------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------
function updateInfo(meta, tGen, tView) {
  const quirkTxt = meta.quirks.length
    ? meta.quirks.map((q) => `<span class="chip" title="${QUIRKS[q].mechanic ? 'Gameplay modifier' : 'Atmosphere'}">${QUIRKS[q].name}${QUIRKS[q].mechanic ? ' ⚙' : ''}</span>`).join(' ')
    : '<span class="muted">none</span>';
  const resLines = ['mining', 'foraging'].map((skill) => {
    const tiers = planet.resources[skill];
    return `<div><b>${skill === 'mining' ? '⛏️ Mining' : '🌿 Foraging'}</b> ` +
      Object.keys(tiers).map((t) => `<span class="muted">T${t}</span> ${tiers[t].map((id) => RESOURCE_BY_ID[id].name).join(', ')}`).join(' · ') + '</div>';
  }).join('');
  const sites = planet.sites.filter((s) => !s.lone).length;
  const lone = planet.sites.length - sites;
  document.getElementById('planet-info').innerHTML = `
    <div class="pname">${meta.name}</div>
    <div>Tier ${meta.tier} · ${meta.sizeLabel} (${meta.diameter}m, ~${Math.round(meta.crossSec / 6) / 10} min across) · ${meta.landmassCount} landmass${meta.landmassCount > 1 ? 'es' : ''} · border: ${meta.border.replace('_', ' ')}</div>
    <div>Quirks: ${quirkTxt}</div>
    <div>${planet.outpost.name}${planet.camps.length ? ' + ' + planet.camps.map((c) => c.name).join(', ') : ''}</div>
    <div>${sites} sites + ${lone} lone nodes · shop: ${planet.outpost.shopName}</div>
    ${resLines}
    <div class="muted">gen ${tGen.toFixed(0)}ms · build ${tView.toFixed(0)}ms</div>`;
}

document.getElementById('planet-select').addEventListener('change', (e) => { loadPlanet(Number(e.target.value)); e.target.blur(); });
function debugWorld(seed) {
  // Debug: explore another seed without touching your save slot.
  if (currentSlot) saveNow();
  currentSlot = null;
  loadSystem(seed, 0);
  toast('Debug world: progress here is not saved.');
}
document.getElementById('btn-go').addEventListener('click', () => debugWorld(document.getElementById('seed-input').value.trim() || randomSeed()));
document.getElementById('btn-random').addEventListener('click', () => debugWorld(randomSeed()));
document.getElementById('seed-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('btn-go').click(); });

// ---------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------
const minimap = document.getElementById('minimap');
const mctx = minimap.getContext('2d');
const mmBase = document.createElement('canvas');

function buildMinimapBase() {
  const P = planet;
  mmBase.width = P.W;
  mmBase.height = P.H;
  const ctx = mmBase.getContext('2d');
  const img = ctx.createImageData(P.W, P.H);
  const pal = view.palette;
  const border = { sea: [40, 90, 130], toxic_marsh: [70, 95, 50], lava: [150, 50, 20], chasm: [14, 12, 20], cliffs: [40, 70, 100] }[P.meta.border];
  const biomeCol = {
    [BIOME.MEADOW]: pal.meadow, [BIOME.GROVE]: pal.grove, [BIOME.SCRUB]: pal.scrub,
    [BIOME.ROCKY]: pal.rocky, [BIOME.SHORE]: pal.shore,
  };
  for (let i = 0; i < P.W * P.H; i++) {
    let r, g, b;
    if (!P.land[i]) [r, g, b] = border;
    else if (P.water[i]) [r, g, b] = [58, 130, 180];
    else if (P.land[i] === 255) [r, g, b] = [138, 122, 98];
    else if (P.plaza[i]) [r, g, b] = [170, 165, 155];
    else if (P.trail[i] && P.walk[i]) [r, g, b] = [150, 128, 96];
    else if (!P.walk[i]) [r, g, b] = [60, 58, 62];
    else {
      const c = biomeCol[P.biome[i]] || pal.meadow;
      const dim = P.reach[i] ? 1 : 0.55;
      [r, g, b] = [c.r * 255 * dim, c.g * 255 * dim, c.b * 255 * dim];
    }
    if (P.blocked[i] && P.land[i] && !P.water[i]) [r, g, b] = [r * 0.55, g * 0.55, b * 0.55];
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // sites
  for (const s of P.sites) {
    if (sporeFog() && !s.lone && !discovered.has(s.id)) continue; // the fog hides what you haven't found
    if (sporeFog() && s.lone) continue;
    const res = RESOURCE_BY_ID[s.resourceId];
    ctx.fillStyle = res.color;
    for (const n of s.nodes) ctx.fillRect(n.gx - 1, n.gy - 1, 3, 3);
  }
  // settlements
  ctx.fillStyle = '#ffffff';
  for (const st of [P.outpost, ...P.camps]) ctx.fillRect(st.gx - 3, st.gy - 3, 7, 7);
}

function drawMinimap() {
  const S = minimap.width;
  mctx.imageSmoothingEnabled = false;
  mctx.clearRect(0, 0, S, S);
  mctx.drawImage(mmBase, 0, 0, S, S);
  const k = S / planet.W;
  const pc = worldToCell(planet, player.x, player.z);
  // view direction (camera looks toward -yaw direction)
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  mctx.strokeStyle = 'rgba(255,255,255,0.7)';
  mctx.lineWidth = 1.5;
  mctx.beginPath();
  mctx.moveTo(pc.gx * k, pc.gy * k);
  mctx.lineTo((pc.gx + fx * 14) * k, (pc.gy + fz * 14) * k);
  mctx.stroke();
  // Singing Crystals: a pulsing cyan arc on the side the humming comes from
  if (quirkRT.compass) {
    const a = quirkRT.compass.angle, pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.008);
    const dirx = Math.sin(a), diry = Math.cos(a);
    mctx.strokeStyle = `rgba(140, 255, 240, ${0.45 + 0.5 * pulse})`;
    mctx.lineWidth = 2;
    mctx.beginPath();
    const r = 9 + pulse * 3, base = Math.atan2(diry, dirx);
    mctx.arc(pc.gx * k, pc.gy * k, r, base - 0.6, base + 0.6);
    mctx.stroke();
  }
  if (state.crate && state.crate.planetIndex === state.planetIndex) {
    const cc = worldToCell(planet, state.crate.x, state.crate.z);
    mctx.fillStyle = '#ffcf4a'; mctx.strokeStyle = '#000';
    mctx.fillRect(cc.gx * k - 3, cc.gy * k - 3, 6, 6); mctx.strokeRect(cc.gx * k - 3, cc.gy * k - 3, 6, 6);
  }
  mctx.fillStyle = '#ffe680';
  mctx.beginPath();
  mctx.arc(pc.gx * k, pc.gy * k, 3.5, 0, Math.PI * 2);
  mctx.fill();
  mctx.strokeStyle = '#000';
  mctx.lineWidth = 1;
  mctx.stroke();
  // Magnetic storm: the minimap fills with static
  if (quirkRT.minimapStatic()) {
    const lvl = quirkRT.stormLevel();
    const img = mctx.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.random() < 0.75 * lvl) { const v = Math.random() * 200; d[i] = v; d[i + 1] = v; d[i + 2] = v + 30; }
    }
    mctx.putImageData(img, 0, 0);
  }
}

minimap.addEventListener('click', (e) => {
  const rect = minimap.getBoundingClientRect();
  const gx = Math.floor(((e.clientX - rect.left) / rect.width) * planet.W);
  const gy = Math.floor(((e.clientY - rect.top) / rect.height) * planet.H);
  if (gathering) stopGathering();
  pendingInteract = null;
  moveToCell(gx, gy);
});

// ---------------------------------------------------------------------
// Movement: WASD (camera-relative) + auto-walk to interact targets
// ---------------------------------------------------------------------
const TOOL_VERB = { pick: 'Mine', hatchet: 'Chop', sickle: 'Cut', gloves: 'Harvest' };
let pendingInteract = null;

function canStand(x, z) {
  const r = 0.35;
  for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
    const c = worldToCell(planet, x + ox, z + oz);
    if (c.gx < 0 || c.gy < 0 || c.gx >= planet.W || c.gy >= planet.H) return false;
    if (!planet.passable[c.gy * planet.W + c.gx]) return false;
  }
  return true;
}

function moveToCell(gx, gy, showMarker = true) {
  const target = nearestReachable(planet, gx, gy, 16);
  if (!target) return false;
  const start = worldToCell(planet, player.x, player.z);
  const path = findPath(planet, start.gx, start.gy, target.gx, target.gy);
  if (!path) return false;
  player.path = path;
  if (showMarker) {
    const w = cellToWorld(planet, target.gx, target.gy);
    clickMarker.position.set(w.x, sampleHeight(planet, w.x, w.z) + 0.08, w.z);
    markerLife = 0.7;
  }
  return true;
}

function updatePlayer(dt) {
  const speed = player.baseSpeed * walkMult;
  // WASD / arrows: direct, camera-relative movement (cancels auto-walk)
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1;
  if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (ix || iz) {
    player.path = [];
    pendingInteract = null;
    if (gathering) stopGathering();
    if (panels.isOpen()) panels.close();
    if (dialogue.isOpen()) dialogue.close();
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);   // camera forward on ground
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);    // camera right
    let dx = fx * iz + rx * ix, dz = fz * iz + rz * ix;
    const len = Math.hypot(dx, dz);
    dx /= len; dz /= len;
    player.facing = Math.atan2(dx, dz);
    const step = speed * dt;
    const nx = player.x + dx * step, nz = player.z + dz * step;
    if (canStand(nx, player.z)) player.x = nx;   // axis-separated so you slide along walls
    if (canStand(player.x, nz)) player.z = nz;
    player.moving = true;
    return;
  }

  // walking to something you clicked: stop once it's comfortably in reach, not on top of it
  if (pendingInteract && player.path.length && Math.hypot(pendingInteract.x - player.x, pendingInteract.z - player.z) <= pendingInteract.reach * 0.75) player.path = [];
  player.moving = player.path.length > 0;
  let remaining = speed * dt;
  while (remaining > 0 && player.path.length) {
    const wp = player.path[0];
    const dx = wp.x - player.x, dz = wp.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.001) { player.path.shift(); continue; }
    player.facing = Math.atan2(dx, dz);
    if (d <= remaining) {
      player.x = wp.x; player.z = wp.z;
      remaining -= d;
      player.path.shift();
    } else {
      player.x += (dx / d) * remaining;
      player.z += (dz / d) * remaining;
      remaining = 0;
    }
  }
  if (!player.path.length && pendingInteract) {
    const t = pendingInteract;
    if (Math.hypot(t.x - player.x, t.z - player.z) <= t.reach + 1.5) {
      player.facing = Math.atan2((t.faceX ?? t.x) - player.x, (t.faceZ ?? t.z) - player.z);
      interact(t);
    }
    pendingInteract = null;
  }
}

// ---------------------------------------------------------------------
// Combat core (M2): creatures, targeting, tick auto-attacks, damage, death and the salvage crate
// ---------------------------------------------------------------------
let creatures = [], zones = [];
const combat = { target: null, atk: 0, lastHitT: -99, repath: 0 };
const gearEl = document.getElementById('gear');
const hpFillEl = document.getElementById('hp-fill'), hpTextEl = document.getElementById('hp-text');
const crateGroup = new THREE.Group();
scene.add(crateGroup);

function curHp() { const m = hpOf(state); if (state.hp == null || state.hp > m) state.hp = m; return state.hp; }

function renderGear() {
  if (!gearEl) return;
  gearEl.innerHTML = SLOTS.map((sl) => {
    const id = state.equipment[sl], def = id && ITEMS[id];
    const tip = def ? `${def.name}${def.armor ? ` (+${def.armor} armor)` : def.damage ? ` (${def.damage} dmg, ${(def.ticks * TICK).toFixed(1)}s)` : ''}\nClick to unequip` : `${SLOT_NAMES[sl]}: empty\nClick a weapon or armor piece in your inventory to equip it`;
    return `<div class="gear-slot ${def ? 'filled' : ''}" data-slot="${sl}" title="${tip}">${def ? itemIconHTML(def, 1) : `<span class="gear-lbl">${SLOT_NAMES[sl]}</span>`}</div>`;
  }).join('');
  updateHpBar();
}
if (gearEl) gearEl.addEventListener('click', (e) => { const el = e.target.closest('[data-slot]'); if (el) unequipSlot(el.dataset.slot); });
function updateHpBar() {
  if (!hpFillEl) return;
  const m = hpOf(state), h = curHp();
  hpFillEl.style.width = `${Math.max(0, (h / m) * 100)}%`;
  hpFillEl.classList.toggle('low', h / m < 0.3);
  hpTextEl.textContent = `${Math.ceil(h)} / ${m}  ·  armor ${totalArmor(state)}`;
}

function clearCreatures() {
  for (const c of creatures) { scene.remove(c.group); if (c.barEl) c.barEl.remove(); }
  creatures = [];
  combat.target = null;
}
function spawnCreatureViews() {
  clearCreatures();
  zones = safeZones(planet);
  creatures = spawnCreatures(planet);
  for (const c of creatures) {
    c.group = buildCreatureModel(c);
    c.group.userData.interact = { type: 'enemy', creature: c, name: c.name, verb: 'Attack', x: c.x, z: c.z, reach: 2 };
    scene.add(c.group);
  }
}

function startCombat(c) {
  if (c.state === 'dead') return;
  if (gathering) stopGathering();
  pendingInteract = null;
  player.path = [];
  combat.target = c;
  combat.repath = 0;
  refreshHeldItem();
}

function playerReach() { return weaponOf(state).reach + 0.35; }

function updateCombat(dt) {
  const c = combat.target;
  if (c && (c.state === 'dead' || player.dead)) combat.target = null;
  if (!combat.target) return;
  const d = Math.hypot(c.x - player.x, c.z - player.z);
  const steering = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight;
  if (d > playerReach()) {
    if (steering) return; // you're kiting: no auto-chase
    if (d > 40) { combat.target = null; return; }
    // close in: straight line when open, a path when something's in the way
    const step = player.baseSpeed * walkMult * dt;
    const ux = (c.x - player.x) / d, uz = (c.z - player.z) / d;
    const nx = player.x + ux * step, nz = player.z + uz * step;
    let moved = false;
    if (canStand(nx, player.z)) { player.x = nx; moved = true; }
    if (canStand(player.x, nz)) { player.z = nz; moved = true; }
    player.facing = Math.atan2(ux, uz);
    player.moving = true;
    player.combatMove = true;
    if (!moved) { combat.repath -= dt; if (combat.repath <= 0) { combat.repath = 0.6; const cell = worldToCell(planet, c.x, c.z); moveToCell(cell.gx, cell.gy, false); } }
    combat.atk = Math.min(combat.atk, TICK * 0.5);
    return;
  }
  player.facing = Math.atan2(c.x - player.x, c.z - player.z);
  combat.atk -= dt;
  if (combat.atk > 0) return;
  const w = weaponOf(state);
  combat.atk = w.ticks * TICK;
  if (player.char) player.char.play('attack', { timeScale: Math.max(1, 1.6 / (w.ticks * TICK)) });
  SFX.swing('hatchet');
  const dmg = hitDamage(w.damage, levelForXp(state.xp.melee || 0), Math.random);
  const killed = hurtCreature(c, dmg, gameTime);
  ui.floatText(String(dmg), '#ffe680', { x: c.x, y: sampleHeight(planet, c.x, c.z) + (c.group.userData.height || 1) + 0.4, z: c.z });
  const xp = combatXp(dmg);
  addXpQuiet('melee', xp.melee);
  addXpQuiet('vitality', xp.vitality);
  combat.lastHitT = gameTime;
  if (killed) onCreatureKilled(c);
}

// XP without a floating label per hit (a fight would spam them); level-ups still announce.
function addXpQuiet(skill, amount) {
  const before = levelForXp(state.xp[skill] || 0);
  state.xp[skill] = (state.xp[skill] || 0) + amount;
  const after = levelForXp(state.xp[skill]);
  if (after > before) {
    SFX.levelUp();
    ui.levelUp(SKILLS[skill].name, after);
    if (player.char) player.char.play('cheer');
    if (skill === 'vitality') updateHpBar();
  }
  markDirty();
}

function onCreatureKilled(c) {
  combat.target = null;
  addXpQuiet('melee', c.xp);
  ui.floatText(`+${c.xp} Melee XP`, '#9fe8ff', { x: player.x, y: player.y + 2.8, z: player.z });
  SFX.success();
  ui.renderSkills(state.xp);
  // Phase C: creature parts and a small loot roll
}

function onCreatureAttack(c, raw) {
  if (player.dead) return;
  const dmg = armorReduce(raw, totalArmor(state));
  state.hp = curHp() - dmg;
  combat.lastHitT = gameTime;
  ui.floatText(String(dmg), '#ff6a5a', { x: player.x, y: player.y + 2.2, z: player.z });
  SFX.fail();
  if (!combat.target && !gathering && !player.moving) startCombat(c); // auto-retaliate
  if (player.char && Math.random() < 0.35) player.char.play('hit');
  updateHpBar();
  markDirty();
  if (state.hp <= 0) playerDies();
}

// Death: drop your pack in a salvage crate, wake at the last settlement. A second death before you
// recover it means the old crate is gone.
function playerDies() {
  if (player.dead) return;
  player.dead = true;
  combat.target = null;
  if (gathering) stopGathering();
  player.path = [];
  pendingInteract = null;
  if (player.char) player.char.play('death');
  const lost = state.crate && state.crate.items.length;
  const { keep, crate } = splitForCrate(state.inventory);
  state.inventory = keep;
  state.crate = crate.length ? { planetIndex: state.planetIndex, x: player.x, z: player.z, items: crate } : null;
  refreshUI();
  saveNow();
  const fade = document.getElementById('death-fade');
  fade.querySelector('.death-sub').textContent = lost ? 'Your old salvage crate is gone. Your pack is in a new one where you fell.' : crate.length ? 'Your pack is in a salvage crate where you fell. Go get it back.' : '';
  setTimeout(() => fade.classList.add('show'), 1400);
  setTimeout(() => {
    const ls = state.lastSettlement && state.lastSettlement.planetIndex === state.planetIndex ? state.lastSettlement : { x: planet.spawn.x, z: planet.spawn.z, name: planet.outpost.name };
    player.x = ls.x; player.z = ls.z;
    player.y = sampleHeight(planet, player.x, player.z);
    cam.target.set(player.x, player.y, player.z);
    state.hp = hpOf(state);
    player.dead = false;
    if (player.char) player.char.play('idle', { fade: 0.3 });
    buildCrateView();
    updateHpBar();
    fade.classList.remove('show');
    toast(`You come to in ${ls.name || 'town'}, sore but breathing.`);
    markDirty();
  }, 3600);
}

function trackSettlement() {
  // the last settlement you stood in is where you wake up
  for (const z of zones) {
    if (Math.hypot(player.x - z.x, player.z - z.z) < z.r) {
      const name = z === zones[0] ? planet.outpost.name : (planet.camps[zones.indexOf(z) - 1] || {}).name;
      const ls = state.lastSettlement;
      if (!ls || ls.planetIndex !== state.planetIndex || ls.name !== name) {
        const spot = z === zones[0] ? planet.spawn : { x: z.x, z: z.z };
        state.lastSettlement = { planetIndex: state.planetIndex, x: spot.x, z: spot.z, name };
        markDirty();
      }
      return;
    }
  }
}

function buildCrateView() {
  crateGroup.clear();
  const cr = state.crate;
  if (!cr || cr.planetIndex !== state.planetIndex) return;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 0.8, flatShading: true }));
  box.position.y = 0.3;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 0.64), new THREE.MeshStandardMaterial({ color: '#ffcf4a', emissive: '#806010', emissiveIntensity: 0.5 }));
  band.position.y = 0.42;
  const g = new THREE.Group();
  g.add(box, band);
  g.position.set(cr.x, sampleHeight(planet, cr.x, cr.z), cr.z);
  g.rotation.y = 0.4;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.interact = { type: 'crate', name: 'Salvage crate', verb: 'Open', x: cr.x, z: cr.z, reach: 1.8 };
  crateGroup.add(g);
}
function openCrate() {
  const cr = state.crate;
  if (!cr) return;
  const left = [];
  for (const it of cr.items) { if (canAdd(state.inventory, it.id)) addItem(state.inventory, it.id, it.qty); else left.push(it); }
  cr.items = left;
  if (!left.length) { state.crate = null; toast('You recover everything from the salvage crate.'); }
  else toast(`Your pack is full. ${left.length} item${left.length > 1 ? 's' : ''} still in the crate.`);
  SFX.success();
  buildCrateView();
  refreshUI();
  markDirty();
}

function updateCreatureViews(dt) {
  const ev = updateCreatures(creatures, { t: gameTime, dt, player: { x: player.x, z: player.z, alive: !player.dead }, canStand, zones, rand: Math.random });
  for (const e of ev) if (e.type === 'attack') onCreatureAttack(e.creature, e.damage);
  for (const c of creatures) {
    const g = c.group;
    if (c.respawned) { c.respawned = false; g.visible = true; }
    if (c.state === 'dead' && gameTime - c.diedAt > 2.5) g.visible = false;
    const y = sampleHeight(planet, c.x, c.z);
    g.position.set(c.x, y, c.z);
    let df = c.facing - g.rotation.y;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    g.rotation.y += df * Math.min(1, dt * 10);
    const near = Math.hypot(c.x - player.x, c.z - player.z) < 60;
    if (near && g.userData.animate) g.userData.animate(gameTime, c.moving, c.state === 'chase' && Math.hypot(c.x - player.x, c.z - player.z) < 2.2, c.state === 'dead');
    g.userData.interact.x = c.x; g.userData.interact.z = c.z;
    // health bar over hurt or targeted creatures
    const show = near && c.state !== 'dead' && (c.hp < c.maxHp || combat.target === c);
    if (show) {
      if (!c.barEl) { c.barEl = document.createElement('div'); c.barEl.className = 'hpbar'; c.barEl.innerHTML = '<div></div>'; labelsEl.appendChild(c.barEl); }
      const pr = project(c.x, y + (g.userData.height || 1) + 0.25, c.z);
      c.barEl.style.display = 'block';
      c.barEl.style.left = pr.x + 'px'; c.barEl.style.top = pr.y + 'px';
      c.barEl.firstChild.style.width = `${(c.hp / c.maxHp) * 100}%`;
      c.barEl.classList.toggle('target', combat.target === c);
    } else if (c.barEl) c.barEl.style.display = 'none';
  }
  // out-of-combat regeneration
  if (!player.dead && gameTime - combat.lastHitT > REGEN.delaySec && curHp() < hpOf(state)) {
    state.hp = Math.min(hpOf(state), state.hp + REGEN.perSec * dt);
    updateHpBar();
  }
  trackSettlement();
}

// ---------------------------------------------------------------------
// Quirk mechanics (see quirk_mechanics.js)
// ---------------------------------------------------------------------
const quirkStatusEl = document.getElementById('quirk-status');
const sporeFog = () => planet.meta.quirks.includes('spore_fog');
function nodeSubmerged(node) { return quirkRT.isSubmerged(sampleHeight(planet, node.x, node.z) - 0.05); }

function checkDiscovery(silent = false) {
  const found = discoverSites(planet.sites, player.x, player.z, quirkRT.discoverRadius, discovered);
  if (!found.length) return;
  state.discovered[state.planetIndex] = [...discovered];
  markDirty();
  if (sporeFog()) buildMinimapBase();
  if (silent) return;
  for (const s of found) ui.floatText(`Discovered: ${s.name}`, '#b8f5a0', { x: player.x, y: player.y + 3.3, z: player.z });
}

const STORM_START = ['A magnetic storm rolls in. Your pick hums like it knows something.', 'Static crawls over everything. The rocks seem to want to come apart.'];
const TIDE_MSG = { low: 'The tide is out. The shoreline is open for business.', rising: 'The tide is turning. Shore nodes will be underwater soon.', high: 'High tide. The shoreline is underwater.' };
function updateQuirks(dt) {
  for (const ev of quirkRT.update(dt)) {
    if (ev === 'stormStart') { toast(STORM_START[Math.floor(Math.random() * STORM_START.length)]); SFX.storm(); }
    else if (ev === 'stormEnd') toast('The storm passes. Your minimap stops sulking.');
    else if (ev.startsWith('tide:') && TIDE_MSG[ev.slice(5)]) toast(TIDE_MSG[ev.slice(5)]);
  }
  view.setStorm(quirkRT.stormLevel());
  view.setSeaOffset(quirkRT.seaOffset());
  discoverTimer -= dt;
  if (discoverTimer <= 0) { discoverTimer = 0.5; checkDiscovery(); }
  // Singing Crystals: chime faster and louder as you near an undiscovered site, panned toward it
  const ac = quirkRT.mech.audioCompass;
  quirkRT.compass = ac ? crystalCompass(planet.sites, player.x, player.z, ac.rangeM, discovered) : null;
  if (quirkRT.compass) {
    const k = 1 - quirkRT.compass.d / ac.rangeM;
    chimeTimer -= dt;
    if (chimeTimer <= 0) {
      chimeTimer = 1.8 - 1.3 * k;
      // pan = how far right of the camera's view the site lies (camera right = (cos yaw, -sin yaw))
      SFX.chime(0.012 + 0.05 * k, Math.sin(quirkRT.compass.angle - cam.yaw));
    }
  }
  // status pill under the minimap
  const bits = [];
  if (quirkRT.storm) bits.push(quirkRT.storm.active ? '⚡ Magnetic storm: +Mining' : '');
  if (quirkRT.tide) bits.push(`🌊 Tide: ${quirkRT.tidePhase()}`);
  if (quirkRT.compass) bits.push(`🎵 The crystals hum ${quirkRT.compass.d < 35 ? 'loudly' : 'softly'}`);
  const txt = bits.filter(Boolean).join(' · ');
  if (quirkStatusEl.textContent !== txt) { quirkStatusEl.textContent = txt; quirkStatusEl.style.display = txt ? 'block' : 'none'; }
}

// Pick the player's clip from what they're doing: gathering (per tool), moving, or idle.
let cheerAfterSwing = false;
function updatePlayerAnimation(dt) {
  const c = player.char;
  if (!c) return;
  if (cheerAfterSwing && !gathering) { cheerAfterSwing = false; c.play('cheer'); }
  if (player.dead) { c.update(dt); return; }
  if (gathering) c.play(gathering.res.tool, { timeScale: gathering.res.tool === 'gloves' ? 1 : 0.9 });
  else if (combat.target && !player.moving) c.play('guard');
  else if (player.moving || player.combatMove) c.play(gait.clip, { timeScale: Math.min(1.6, (player.baseSpeed * walkMult) / gait.native) });
  else c.play('idle');
  c.update(dt);
}

// ---------------------------------------------------------------------
// Interaction (Phase B fills these in: gathering, locker, shop, pad)
// ---------------------------------------------------------------------
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg) {
  if (mode !== 'play' && mode !== 'arrival') return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastTimer = 2.4;
}

const GATHER_VERB = { pick: 'mine', hatchet: 'chop', sickle: 'cut', gloves: 'harvest' };
const SPENT_MSG = {
  pick: 'There is nothing left to mine here for now.',
  hatchet: 'Only a stump remains. It will grow back.',
  sickle: 'It has been cut back to the roots.',
  gloves: 'Nothing left to harvest here yet.',
};
const DEPLETE_MSG = { pick: 'The vein runs dry.', hatchet: 'The tree comes down.', sickle: 'You clear the patch.', gloves: 'You pick it clean.' };

function interact(t) {
  if (t.type === 'node') return startGathering(t);
  if (t.type === 'npc') return talkTo(t.npcId);
  if (t.type === 'crate') return openCrate();
  const src = { x: t.x, z: t.z };
  if (player.char && ['locker', 'camp_locker', 'shop', 'pad'].includes(t.kind)) player.char.play('interact');
  if (t.kind === 'locker' || t.kind === 'camp_locker') return panels.open('bank', src, { title: t.kind === 'camp_locker' ? 'Camp Locker' : 'Storage Locker' });
  if (t.kind === 'shop') return panels.open('shop', src, { title: t.name, meta: planet.meta });
  if (t.kind === 'pad') return panels.open('starmap', src, {});
  const FLAVOR = {
    beacon: `${t.name}. A humming beacon marks the plaza.`,
    house: 'Nobody answers. Someone inside is definitely pretending not to be home.',
    workshop: 'A sign on the bench reads DO NOT TOUCH. A smaller sign under it reads THAT ONE EITHER.',
    tower: 'The relay tower hums. A sticker reads: "Signal not guaranteed past the fern line."',
    shed: 'The door is jammed. Something inside rattles when you push, then politely stops.',
    tent: `${t.name}. A note pinned to the flap says "back soon (maybe)." The ink has faded a lot.`,
  };
  toast(FLAVOR[t.kind] || `${t.verb} ${t.name}.`);
}

function nodeStateFor(node, res) {
  let st = nodeStates.get(node.id);
  if (!st) {
    st = { ...initialNodeState(res, Math.random), res };
    nodeStates.set(node.id, st);
  }
  return st;
}

function stopGathering(msg) {
  gathering = null;
  showTool(null);
  refreshHeldItem();
  if (msg) toast(msg);
}

function startGathering(t) {
  SFX.unlock();
  const res = t.resource;
  const st = nodeStateFor(t.node, res);
  if (st.depletedUntil > gameTime) { toast(SPENT_MSG[res.tool]); return; }
  if (nodeSubmerged(t.node)) { SFX.fail(); toast(`The tide is in. The ${res.node} is underwater for now.`); return; }
  const chk = checkGather(state, res);
  if (!chk.ok) { SFX.fail(); toast(chk.reason); return; }
  gathering = { t, res, tool: chk.tool, timer: ATTEMPT_SECONDS };
  showTool(res.tool, chk.tool.color);
  toast(`You begin to ${GATHER_VERB[res.tool]} the ${res.node}.`);
}

function updateGathering(dt) {
  const g = gathering;
  if (!g) return;
  g.timer -= dt;
  if (g.timer > 0) return;
  g.timer += ATTEMPT_SECONDS;

  const st = nodeStateFor(g.t.node, g.res);
  if (st.depletedUntil > gameTime) return stopGathering();
  if (nodeSubmerged(g.t.node)) return stopGathering(`The tide comes in over the ${g.res.node}.`);
  const chk = checkGather(state, g.res);
  if (!chk.ok) { SFX.fail(); return stopGathering(chk.reason); }
  g.tool = chk.tool;
  SFX.swing(g.res.tool);
  const bonus = g.res.skill === 'mining' ? quirkRT.miningBonus() : 0;
  if (!attemptGather(state, g.res, g.tool, Math.random, bonus)) return;

  const skill = g.res.skill;
  addItem(state.inventory, g.res.id, 1);
  markDirty();
  const before = levelForXp(state.xp[skill]);
  state.xp[skill] += g.res.xp;
  const after = levelForXp(state.xp[skill]);
  SFX.success();
  const head = { x: player.x, y: player.y + 2.3, z: player.z };
  ui.floatText(`+1 ${g.res.name}`, '#ffe680', head);
  ui.floatText(`+${g.res.xp} ${SKILLS[skill].name} XP`, '#9fe8ff', { ...head, y: head.y + 0.5 });
  if (after > before) { SFX.levelUp(); ui.levelUp(SKILLS[skill].name, after); cheerAfterSwing = true; }
  ui.renderInventory(state.inventory);
  ui.renderSkills(state.xp);

  if (afterSuccess(st, g.res, Math.random)) {
    const mult = skill === 'foraging' ? foragingRespawnMult : 1;
    st.depletedUntil = gameTime + g.res.respawnSec * mult;
    view.setNodeDepleted(g.t.node.id, true);
    SFX.deplete();
    stopGathering(DEPLETE_MSG[g.res.tool]);
  }
}

function updateRespawns() {
  for (const [id, st] of nodeStates) {
    if (st.depletedUntil && gameTime >= st.depletedUntil) {
      Object.assign(st, initialNodeState(st.res, Math.random));
      st.depletedUntil = 0;
      view.setNodeDepleted(id, false);
    }
  }
}

function startInteract(t) {
  if (player.dead) return;
  if (t.type === 'enemy') { startCombat(t.creature); return; }
  combat.target = null;
  if (gathering) stopGathering();
  pendingInteract = t;
  if (Math.hypot(t.x - player.x, t.z - player.z) <= t.reach) {
    player.path = [];
    return;
  }
  const c = worldToCell(planet, t.x, t.z);
  if (!moveToCell(c.gx, c.gy, false)) { pendingInteract = null; toast("Can't reach that."); }
}

const pickRay = new THREE.Raycaster();
function pickInteractable(cx, cy) {
  ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  pickRay.setFromCamera(ndc, camera);
  const targets = view.nodeMeshes.concat(view.interactables, npcs.map((n) => n.group), creatures.filter((c) => c.state !== 'dead').map((c) => c.group), crateGroup.children);
  const hits = pickRay.intersectObjects(targets, true);
  for (const h of hits) {
    if (h.object.isInstancedMesh && h.object.userData.nodes) {
      const node = h.object.userData.nodes[h.instanceId];
      const res = RESOURCE_BY_ID[h.object.userData.resourceId];
      if (!node || !res) continue;
      return { type: 'node', node, resource: res, name: res.name, verb: TOOL_VERB[res.tool] || 'Gather', x: node.x, z: node.z, reach: 1.6 };
    }
    let o = h.object;
    while (o && !o.userData.interact) o = o.parent;
    if (o) return o.userData.interact;
  }
  return null;
}

// ---------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const keys = {};
let leftDown = null;
let rightDrag = false;

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (mode === 'arrival') { endArrival(); return; }
  if (!playing()) return;
  if (e.button === 0) leftDown = { x: e.clientX, y: e.clientY };
  if (e.button === 2 || e.button === 1) rightDrag = true;
});
window.addEventListener('pointerup', (e) => {
  if (e.button === 0 && leftDown) {
    const moved = Math.hypot(e.clientX - leftDown.x, e.clientY - leftDown.y);
    leftDown = null;
    if (moved < 6 && e.target === renderer.domElement) {
      const t = pickInteractable(e.clientX, e.clientY);
      if (t) startInteract(t);
    }
  }
  if (e.button === 2 || e.button === 1) rightDrag = false;
});
const hoverEl = document.getElementById('hover-tip');
let hoverPending = null;
window.addEventListener('pointermove', (e) => {
  if (!playing()) return;
  if (!rightDrag && e.target === renderer.domElement) hoverPending = { x: e.clientX, y: e.clientY };
  if (rightDrag) {
    const sens = settings.camSens / 100;
    cam.yaw -= e.movementX * 0.006 * sens;
    cam.pitch = Math.min(1.35, Math.max(0.45, cam.pitch + e.movementY * 0.004 * sens));
  }
});
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!playing()) return;
  cam.dist = Math.min(90, Math.max(12, cam.dist * (1 + Math.sign(e.deltaY) * 0.1)));
}, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'F3') { e.preventDefault(); document.body.classList.toggle('debug-hud'); return; }
  if (mode === 'arrival' && (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter')) { endArrival(); return; }
  if (mode !== 'play') return;
  if (pause.isOpen()) { if (e.code === 'Escape') pause.hide(); return; }
  if (dialogue.keydown(e.code)) { e.preventDefault(); return; }
  if (e.code === 'Escape' && !panels.isOpen()) { for (const k in keys) keys[k] = false; pause.show(); return; }
  if (e.code === 'KeyJ') { if (panels.current && panels.current.kind === 'journal') panels.close(); else panels.open('journal', null, {}); return; }
  keys[e.code] = true;
  if (e.code === 'Escape' && panels.isOpen()) { panels.close(); return; }
  const m = /^Digit([1-4])$/.exec(e.code);
  if (m) useAbility(Number(m[1]));
});

function useAbility(slot) {
  const el = document.querySelector(`.hot-slot[data-slot="${slot}"]`);
  if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  toast(`Ability ${slot}: no weapon equipped yet`);
}
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

function clickTerrain(cx, cy) {
  ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(view.terrain, false);
  if (!hits.length) return;
  const p = hits[0].point;
  const c = worldToCell(planet, p.x, p.z);
  moveToCell(c.gx, c.gy);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------
const tmpV = new THREE.Vector3();
const projV = new THREE.Vector3();
function project(x, y, z) {
  projV.set(x, y, z).project(camera);
  return { x: (projV.x * 0.5 + 0.5) * window.innerWidth, y: (-projV.y * 0.5 + 0.5) * window.innerHeight };
}

function updateLabels() {
  const maxD = Math.max(45, cam.dist * 1.6) * quirkRT.viewMult;
  const fog = sporeFog();
  for (let k = 0; k < view.labels.length; k++) {
    const l = view.labels[k];
    const el = labelEls[k];
    if (fog && l.siteId && !discovered.has(l.siteId)) { el.style.display = 'none'; continue; }
    const d = Math.hypot(l.x - cam.target.x, l.z - cam.target.z);
    if (d > maxD) { el.style.display = 'none'; continue; }
    tmpV.set(l.x, l.y, l.z).project(camera);
    if (tmpV.z > 1 || tmpV.z < -1) { el.style.display = 'none'; continue; }
    el.style.display = 'block';
    el.style.left = ((tmpV.x * 0.5 + 0.5) * window.innerWidth).toFixed(1) + 'px';
    el.style.top = ((-tmpV.y * 0.5 + 0.5) * window.innerHeight).toFixed(1) + 'px';
    el.style.opacity = String(Math.min(1, (maxD - d) / 12));
  }
}

// ---------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------
let last = performance.now();
let fpsAcc = 0, fpsFrames = 0;
const fpsEl = document.getElementById('fps');

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!planet || !view) { requestAnimationFrame(tick); return; }
  if (mode === 'play') state.playtime += dt;
  if (currentSlot && !saving && ((dirty && now - lastSaveAt > 5000) || now - lastSaveAt > 30000)) saveNow();
  updateSaveStatus(now);

  gameTime += dt;
  if (panels.isOpen() && panels.current.source) {
    const src = panels.current.source;
    if (Math.hypot(src.x - player.x, src.z - player.z) > 9) panels.close();
  }
  if (mode === 'play') updateQuirks(dt);
  else { view.setStorm(0); }
  updateGathering(dt);
  updateNpcs(dt, now);
  updateRespawns();

  if (keys.KeyQ) cam.yaw += 1.6 * dt * settings.camSens / 100;
  if (keys.KeyE) cam.yaw -= 1.6 * dt * settings.camSens / 100;

  if (hoverPending) {
    const t = pickInteractable(hoverPending.x, hoverPending.y);
    if (t) {
      hoverEl.textContent = `${t.verb} ${t.name}`;
      hoverEl.style.left = hoverPending.x + 14 + 'px';
      hoverEl.style.top = hoverPending.y + 14 + 'px';
      hoverEl.style.display = 'block';
      renderer.domElement.style.cursor = 'pointer';
    } else {
      hoverEl.style.display = 'none';
      renderer.domElement.style.cursor = 'default';
    }
    hoverPending = null;
  }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.remove('show'); }

  player.combatMove = false;
  if (mode === 'play' && !pause.isOpen() && !player.dead) { updatePlayer(dt); updateCombat(dt); }
  if (mode === 'play') updateCreatureViews(dt);
  if (mode === 'arrival') updateArrival(dt);
  player.y = sampleHeight(planet, player.x, player.z);
  player.mesh.position.set(player.x, player.y, player.z);
  let diff = player.facing - player.mesh.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  player.mesh.rotation.y += diff * Math.min(1, dt * 14);
  updatePlayerAnimation(dt);

  if (mode === 'title' || mode === 'creator') cam.yaw += dt * 0.04; // slow title drift around the outpost
  else cam.target.lerp(tmpV.set(player.x, player.y, player.z), Math.min(1, dt * 6));
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    cam.target.y + Math.sin(cam.pitch) * cam.dist,
    cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist
  );
  camera.lookAt(cam.target.x, cam.target.y + 0.8, cam.target.z);

  if (markerLife > 0) {
    markerLife -= dt;
    clickMarker.material.opacity = Math.max(0, markerLife / 0.7);
    clickMarker.scale.setScalar(1 + (0.7 - markerLife) * 0.8);
  }

  view.update(dt, mode === 'play' || mode === 'arrival' ? player : { x: cam.target.x, y: cam.target.y, z: cam.target.z });
  if (mode !== 'creator') renderer.render(scene, camera); // the creator has its own preview
  if (mode === 'play') {
    updateLabels();
    ui.update(dt, project);
    dialogue.update(dt);
    drawMinimap();
  }

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc > 0.5) { fpsEl.textContent = `${Math.round(fpsFrames / fpsAcc)} fps`; fpsAcc = 0; fpsFrames = 0; }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
refreshUI();
// Test hook for headless checks (tests/ and render scripts).
window.__game = {
  player, cam, state, keys, rebuildPlayerModel, startInteract, loadPlanet, menu, creator, pause, endArrival,
  get mode() { return mode; }, get creatures() { return creatures; }, combat, playerDies, startCombat, setGait(k) { gait = GAITS[k]; }, get npcs() { return npcs; }, talkTo,
  get system() { return system; }, get quirkRT() { return quirkRT; }, get view() { return view; },
  get planet() { return planet; }, get gathering() { return gathering; },
  nearestNode(skill, tool) {
    let best = null;
    for (const s of planet.sites) {
      const res = RESOURCE_BY_ID[s.resourceId];
      if ((skill && res.skill !== skill) || (tool && res.tool !== tool)) continue;
      for (const node of s.nodes) {
        const d = Math.hypot(node.x - player.x, node.z - player.z);
        if (!best || d < best.d) best = { d, t: { type: 'node', node, resource: res, name: res.name, verb: 'Gather', x: node.x, z: node.z, reach: 1.6 } };
      }
    }
    return best && best.t;
  },
};
preloadCharacterAssets().catch((e) => console.error('Character assets failed to load', e));
applySettings();
enterTitle();
requestAnimationFrame(tick);
