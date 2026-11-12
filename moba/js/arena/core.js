// MOBA 3D arena: Renderer, scene, camera, lights, ground texture and training-alcove walls.
// Classic script (not a module) so the game still works from file://. Loaded in order by arena3d.html;
// top-level let/const/function names are shared across all js/arena/*.js files.
'use strict';

const SFX = window.MOBA ? window.MOBA.Audio : { play() {}, unlock() {} };

// 1 world unit in Three.js = ~1 meter
// Pit Brawler = 2.25 units tall; Coyote Crossbowman = 1.98 units tall (shorter, wirier scavenger!)
let HERO_HEIGHT = 1.98;
let activeHeroId = 'coyote'; // id of the hero the player is controlling

// Active hero's kit from js/heroes/<id>.js (null for heroes not migrated yet)
function heroKit(id) {
  return (window.MOBA_HEROES || {})[id || activeHeroId] || null;
}

const container = document.getElementById('three-container');
const labelLayer = document.getElementById('label-layer');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x132219);
scene.fog = new THREE.FogExp2(0x132219, 0.0075);

// Authentic League of Legends 54-degree long-lens camera!
const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.5, 220);
let camDist = 21.5; // Default MOBA Gameplay Zoom! (Scrollable 5.5 .. 35)
const CAM_PITCH = THREE.MathUtils.degToRad(54);
// Camera lock (Y toggles): locked follows the hero; unlocked pans with the mouse at the screen edge.
// Holding Space snaps back onto the hero while unlocked.
let camLocked = true;
const camFocus = { x: 0, z: 0 };

// Rich Summoner's Rift Sunlight + Sky Fill + Hero Rim Light
const hemiLight = new THREE.HemisphereLight(0xcfe8ff, 0x2a4028, 1.15);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
sunLight.position.set(14, 26, 12);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 2;
sunLight.shadow.camera.far = 70;
const sc = 24;
sunLight.shadow.camera.left = -sc;
sunLight.shadow.camera.right = sc;
sunLight.shadow.camera.top = sc;
sunLight.shadow.camera.bottom = -sc;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.85);
rimLight.position.set(-14, 12, -16);
scene.add(rimLight);

// Painted map ground: the whole castle map (MOBA_MAP) drawn into one canvas texture laid over the ground plane.
// Grass slopes, a lighter valley, dirt lanes & jungle paths, a cobbled bridge road, stone courtyards,
// the behemoth hollow's earthen floor, and the chasm north of the bridge.
const GROUND_W = window.MOBA_MAP.W + 40;  // world size of the ground plane
const GROUND_H = window.MOBA_MAP.H + 40;
function createGroundTexture() {
  const M = window.MOBA_MAP;
  const PX = 12; // texture pixels per meter
  const c = document.createElement('canvas');
  c.width = Math.round(GROUND_W * PX);
  c.height = Math.round(GROUND_H * PX);
  const g = c.getContext('2d');
  const X = (x) => (x + GROUND_W / 2) * PX;
  const Z = (z) => (z + GROUND_H / 2) * PX;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // Base grass: darker up on the slopes, lighter toward the valley floor
  const grad = g.createLinearGradient(0, Z(M.TOP_Z), 0, Z(M.BOUNDS.maxZ));
  grad.addColorStop(0, '#2c4a2c');
  grad.addColorStop(0.55, '#34572f');
  grad.addColorStop(1, '#4a6f36');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);

  // Painterly grass dabs
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * c.width, y = rnd() * c.height;
    const r = (6 + rnd() * 22) * PX / 10;
    g.fillStyle = rnd() < 0.45 ? 'rgba(98, 146, 70, 0.16)' : 'rgba(20, 42, 22, 0.16)';
    g.beginPath();
    g.ellipse(x, y, r * 1.5, r * 0.8, rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }

  // Path stroke helper (soft edge + core)
  const stroke = (pts, width, edge, core) => {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    [[width + 1.6, edge], [width, core]].forEach(([w, col]) => {
      g.strokeStyle = col;
      g.lineWidth = w * PX;
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))));
      g.stroke();
    });
  };
  // Dirt speckle along a path
  const speckle = (pts, width, col, n) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      for (let k = 0; k < n; k++) {
        const t = rnd();
        const ox = (rnd() - 0.5) * width, oz = (rnd() - 0.5) * width;
        g.fillStyle = col;
        g.beginPath();
        g.arc(X(a.x + (b.x - a.x) * t + ox), Z(a.z + (b.z - a.z) * t + oz), (0.15 + rnd() * 0.35) * PX, 0, Math.PI * 2);
        g.fill();
      }
    }
  };

  // Behemoth hollow floor (earth + moss), slightly larger than the walled triangle
  const H = M.HOLLOW;
  g.fillStyle = '#3d3326';
  g.beginPath();
  g.moveTo(X(-H.halfTop - 1.5), Z(H.top - 0.5));
  g.lineTo(X(H.halfTop + 1.5), Z(H.top - 0.5));
  g.lineTo(X(0), Z(H.tipZ + 3));
  g.closePath();
  g.fill();
  for (let i = 0; i < 240; i++) {
    const t = rnd(), u = rnd() * (1 - t);
    const z = H.top + (H.tipZ - H.top) * t;
    const halfW = H.halfTop * (1 - t);
    g.fillStyle = rnd() < 0.5 ? 'rgba(70, 100, 48, 0.35)' : 'rgba(30, 24, 18, 0.35)';
    g.beginPath();
    g.arc(X((rnd() * 2 - 1) * halfW * 0.9), Z(z + u), (0.4 + rnd() * 1.1) * PX, 0, Math.PI * 2);
    g.fill();
  }

  // Jungle Y path (narrow dirt)
  M.JUNGLE_PATHS.forEach((pts) => {
    stroke(pts, 3.6, 'rgba(70, 58, 40, 0.55)', '#6e5b40');
    speckle(pts, 3.0, 'rgba(48, 38, 26, 0.5)', 60);
  });
  // Bottom lane (wide dirt road)
  stroke(M.LANE_WAYPOINTS.bot, 6.0, 'rgba(78, 64, 44, 0.6)', '#7b6847');
  speckle(M.LANE_WAYPOINTS.bot, 5.0, 'rgba(52, 42, 28, 0.45)', 140);

  // North chasm beyond the bridge (between the castles)
  const railZ = M.TOP_Z - M.BRIDGE_HALF - 0.4;
  const chasm = g.createLinearGradient(0, Z(railZ), 0, Z(railZ - 8));
  chasm.addColorStop(0, '#2a2a28');
  chasm.addColorStop(0.25, '#141517');
  chasm.addColorStop(1, '#0b0c0e');
  g.fillStyle = chasm;
  g.fillRect(X(-M.CASTLE.x0), 0, X(M.CASTLE.x0) - X(-M.CASTLE.x0), Z(railZ));

  // Lookout deck off the bridge's north side: weathered timber planks over the chasm
  const D = M.DECK;
  const deckPath = () => {
    g.beginPath();
    g.moveTo(X(-D.mouthHalf - 0.4), Z(railZ + 0.6));
    g.lineTo(X(-D.backHalf - 0.3), Z(D.backZ - 0.3));
    g.lineTo(X(D.backHalf + 0.3), Z(D.backZ - 0.3));
    g.lineTo(X(D.mouthHalf + 0.4), Z(railZ + 0.6));
    g.closePath();
  };
  g.fillStyle = '#6b4f33';
  deckPath();
  g.fill();
  g.save();
  deckPath();
  g.clip();
  for (let z = D.backZ - 0.3; z < railZ + 0.6; z += 0.55) {
    g.fillStyle = 'rgba(30, 20, 12, 0.55)';
    g.fillRect(X(-D.mouthHalf - 1), Z(z), (D.mouthHalf * 2 + 2) * PX, 0.07 * PX);  // plank seams
    for (let x = -D.mouthHalf - 1; x < D.mouthHalf + 1; x += 2.2 + rnd() * 1.6) {
      g.fillRect(X(x), Z(z), 0.06 * PX, 0.55 * PX);                                  // staggered butt joints
      g.fillStyle = rnd() < 0.5 ? 'rgba(150, 112, 70, 0.18)' : 'rgba(40, 28, 16, 0.18)';
      g.fillRect(X(x + 0.1), Z(z + 0.08), (1.5 + rnd()) * PX, 0.4 * PX);            // plank tone variation
      g.fillStyle = 'rgba(30, 20, 12, 0.55)';
    }
  }
  g.restore();

  // Top lane: cobbled bridge road across the whole span
  const top = M.LANE_WAYPOINTS.top;
  stroke(top, M.BRIDGE_HALF * 2, '#5a554c', '#857b6c');
  for (let x = top[0].x; x < top[top.length - 1].x; x += 0.9) {
    for (let k = -3; k <= 3; k++) {
      g.fillStyle = (Math.floor(x / 0.9) + k) % 2 ? 'rgba(60, 54, 46, 0.35)' : 'rgba(150, 140, 122, 0.25)';
      g.fillRect(X(x), Z(M.TOP_Z + k * 0.9 - 0.4), 0.8 * PX, 0.8 * PX);
    }
  }

  // Castle courtyards: flagstones
  [0, 1].forEach((team) => {
    const s = team === 0 ? -1 : 1;
    const x0 = Math.min(s * M.CASTLE.x0, s * M.CASTLE.x1), x1 = Math.max(s * M.CASTLE.x0, s * M.CASTLE.x1);
    g.fillStyle = '#7a7062';
    g.fillRect(X(x0), Z(M.CASTLE.z0), X(x1) - X(x0), Z(M.CASTLE.z1) - Z(M.CASTLE.z0));
    for (let x = x0; x < x1; x += 1.6) {
      for (let z = M.CASTLE.z0; z < M.CASTLE.z1; z += 1.6) {
        const shade = 0.08 + rnd() * 0.16;
        g.fillStyle = rnd() < 0.5 ? `rgba(40, 34, 28, ${shade})` : `rgba(190, 176, 150, ${shade})`;
        g.fillRect(X(x + 0.06), Z(z + 0.06), 1.48 * PX, 1.48 * PX);
      }
    }
    // dirt ramps out of both gates
    stroke([{ x: s * (M.CASTLE.x0 + 5), z: M.UPPER_GATE_Z }, { x: s * (M.CASTLE.x0 - 2), z: M.UPPER_GATE_Z }], 5.6, '#5a554c', '#857b6c');
    stroke([{ x: s * M.SIDE_GATE_X, z: M.CASTLE.z1 - 5 }, { x: s * M.SIDE_GATE_X, z: M.CASTLE.z1 + 3 }], 5.6, 'rgba(78, 64, 44, 0.6)', '#7b6847');
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_W, GROUND_H),
  new THREE.MeshStandardMaterial({ map: createGroundTexture(), roughness: 0.92, metalness: 0.02 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Stylized 3D Walls & Forest Trees (blocking & rebound targets!)
const obstacles = [];
const wallMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.8, metalness: 0.1 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0xb48a4e, roughness: 0.45, metalness: 0.55 });

function addStonePillarWall(x, z, r) {
  const grp = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 1.08, 2.3, 8), wallMat);
  base.position.y = 1.15;
  base.castShadow = true;
  base.receiveShadow = true;
  grp.add(base);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.0, r * 0.96, 0.24, 8), trimMat);
  cap.position.y = 2.35;
  cap.castShadow = true;
  grp.add(cap);

  grp.position.set(x, 0, z);
  scene.add(grp);
  obstacles.push({ x, z, r });
}

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.9 });
const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x1e4d28, roughness: 0.82 });
const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x2b6937, roughness: 0.78 });

// Order castle training alcove rebound pillars (positions relative to MOBA_MAP.BASE.alcove = the Pit Target dummy;
// keep this geometry rigid so the selftest stays comparable). Full map trees/walls are built by phase1Engine.
const ALCOVE = window.MOBA_MAP.BASE.alcove;
addStonePillarWall(ALCOVE.x - 1.3, ALCOVE.z + 2.7, 0.95);
addStonePillarWall(ALCOVE.x + 4.7, ALCOVE.z + 2.7, 0.95);
