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

// Procedural Painted Summoner's Rift Grass & Courtyard Texture
function createGroundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');

  const grad = g.createRadialGradient(512, 512, 80, 512, 512, 620);
  grad.addColorStop(0, '#365c37');
  grad.addColorStop(0.6, '#29482b');
  grad.addColorStop(1, '#1b331e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 1024);

  // Painterly grass brush dabs
  for (let i = 0; i < 900; i++) {
    const x = (i * 173) % 1024;
    const y = (i * 389) % 1024;
    const r = 8 + (i % 7) * 5;
    g.fillStyle = i % 3 === 0 ? 'rgba(82, 134, 68, 0.22)' : 'rgba(22, 46, 24, 0.20)';
    g.beginPath();
    g.ellipse(x, y, r * 1.4, r * 0.8, (i % 5) * 0.6, 0, Math.PI * 2);
    g.fill();
  }

  // Central Painted Cobblestone Pit Ring
  const stoneGrad = g.createRadialGradient(512, 512, 20, 512, 512, 270);
  stoneGrad.addColorStop(0, '#625749');
  stoneGrad.addColorStop(0.82, '#4d4439');
  stoneGrad.addColorStop(1, 'rgba(77, 68, 57, 0)');
  g.fillStyle = stoneGrad;
  g.beginPath();
  g.arc(512, 512, 275, 0, Math.PI * 2);
  g.fill();

  g.strokeStyle = 'rgba(214, 180, 112, 0.42)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(512, 512, 220, 0, Math.PI * 2);
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.anisotropy = 4;
  return tex;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(168, 116),
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

// Order Base Training Alcove Rebound Pillars (Full 4v4 Map Trees/Pillars are built by phase1Engine)
addStonePillarWall(-51.5, -10.5, 0.95);
addStonePillarWall(-45.5, -10.5, 0.95);
