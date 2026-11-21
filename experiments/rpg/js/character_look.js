// =====================================================================
// CHARACTER LOOK: appearance as plain data in slider units (the Asset Lab's ranges), so it saves
// cleanly and the future character creator can bind sliders straight to it. Pure JS (testable).
// =====================================================================

export const DEFAULT_LOOK = {
  body: 'male', height: 100, weight: -25, muscle: -20, bust: 20, lift: 55, shoulders: 100, neck: 78, head: 105,
  hair: 'parted', beard: false,
  face: { jaw: 0, chin: 0, cheeks: 0, brow: 0, nose: 0, width: 0, eyeColor: '#4a6a8a', lipColor: '#9a4a44' },
  outfit: { sleeves: 'short', neck: 'crew', hem: 'full', layer: 'none', pants: 'full', boots: 'short', gloves: false },
  colors: { skin: '#d9a982', hair: '#4a3020', shirt: '#4f6a8a', layer: '#6b4f36', pants: '#5a4a3a', belt: '#2e2620', boots: '#3a3028', gloves: '#6b5a48' },
};

// A random but sensible drifter (stand-in until the character creator).
export function randomLook(rand = Math.random) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const CLOTH = ['#4f6a8a', '#8a6f5a', '#5f7d6e', '#7a5f8a', '#a0805a', '#8f5a5a', '#6f8a5a', '#c9b79c', '#3a4a5a', '#b5835a', '#2f6a55', '#d8c070'];
  const DARK = ['#3a3028', '#2e2620', '#4a3a2a', '#2a2d34', '#5a4a3a', '#3a2a2a'];
  const body = pick(['male', 'female']);
  return {
    body, height: int(94, 106), weight: int(-60, 60), muscle: int(-50, 60), bust: int(0, 50), lift: int(45, 70),
    shoulders: int(94, 112), neck: int(70, 85), head: int(100, 110),
    hair: pick(body === 'female' ? ['parted', 'long', 'long', 'buns', 'buzzSoft'] : ['parted', 'parted', 'buzz', 'buzzSoft', 'buns']),
    beard: body === 'male' && rand() < 0.3,
    face: {
      jaw: int(-50, 50), chin: int(-50, 50), cheeks: int(-50, 50), brow: int(-50, 50), nose: int(-50, 50), width: int(-40, 40),
      eyeColor: pick(['#4a6a8a', '#5a3a22', '#3a5a3a', '#7a6a4a', '#2a2a2a', '#6a8aa0']),
      lipColor: pick(['#9a4a44', '#8a5a50', '#b06a66', '#6a3a36', '#a05a5a']),
    },
    outfit: {
      sleeves: pick(['short', 'short', 'elbow', 'long', 'long', 'tank']), neck: pick(['crew', 'crew', 'v', 'scoop', 'turtle']),
      hem: 'full', layer: pick(['none', 'none', 'vest', 'jacket']), pants: pick(['full', 'full', 'full', 'capri']),
      boots: pick(['short', 'tall']), gloves: rand() < 0.3,
    },
    colors: {
      skin: pick(['#f1d3b8', '#e3b38f', '#d9a982', '#b98a68', '#8a6248', '#5e4030', '#c7b1a0']),
      hair: pick(['#2a1d14', '#4a3020', '#7a4a2a', '#b07a3a', '#d8b878', '#9a9a9a', '#a8342a']),
      shirt: pick(CLOTH), layer: pick(CLOTH), pants: pick(CLOTH), belt: pick(DARK), boots: pick(DARK), gloves: pick(DARK),
    },
  };
}

// Slider units -> buildFacetedHuman options (mirrors the Asset Lab's humanOpts()).
export function lookToOpts(look, cellFrac = 0.002) {
  const L = { ...DEFAULT_LOOK, ...look };
  const face = { ...DEFAULT_LOOK.face, ...(L.face || {}) };
  const outfit = { ...DEFAULT_LOOK.outfit, ...(L.outfit || {}) };
  const turtle = outfit.neck === 'turtle';
  return {
    cellFrac,
    height: L.height / 100,
    weight: (L.weight / 100) * (L.weight < 0 ? 0.4 : 0.6),
    muscle: (L.muscle / 100) * (L.muscle < 0 ? 0.35 : 0.5),
    shoulders: L.shoulders / 100,
    bust: L.bust / 100, bustLift: L.lift / 100,
    headScale: L.head / 100,
    neck: L.neck / 100,
    hair: L.hair, beard: L.beard,
    outfit: { ...outfit, neck: turtle ? 'crew' : outfit.neck, top: turtle ? 'turtleneck' : 'shirt' },
    faceShape: { jaw: face.jaw / 100, chin: face.chin / 100, cheeks: face.cheeks / 100, brow: face.brow / 100, nose: face.nose / 100, width: face.width / 100 },
    face: { expression: 'neutral', eyeColor: face.eyeColor, lipColor: face.lipColor, browColor: (L.colors || DEFAULT_LOOK.colors).hair },
    colors: { ...DEFAULT_LOOK.colors, ...(L.colors || {}) },
  };
}

// ---------------------------------------------------------------------
// Creator schema: every control the character creator shows, by tab. `key` is a path into the
// look ('face.jaw'). Ranges match the Asset Lab. showIf hides controls that do nothing for a look.
// ---------------------------------------------------------------------
export const SKIN_TONES = ['#f6dcc6', '#f1d3b8', '#e3b38f', '#d9a982', '#c79270', '#b98a68', '#9a6c4c', '#8a6248', '#6e4a34', '#5e4030', '#47301f', '#c7b1a0'];
export const HAIR_COLORS = ['#1a120c', '#2a1d14', '#4a3020', '#7a4a2a', '#a8642e', '#b07a3a', '#d8b878', '#e8e2cf', '#9a9a9a', '#a8342a', '#7a3a8a', '#3a6a8a'];
export const CLOTH_COLORS = ['#4f6a8a', '#3a4a5a', '#2f6a55', '#5f7d6e', '#6f8a5a', '#a0805a', '#b5835a', '#c9b79c', '#d8c070', '#8f5a5a', '#7a5f8a', '#8a6f5a', '#e6e2d8', '#2a2d34'];
export const DARK_COLORS = ['#2a2d34', '#2e2620', '#3a3028', '#3a2a2a', '#4a3a2a', '#5a4a3a', '#6b5a48', '#6b4f36'];
export const EYE_COLORS = ['#4a6a8a', '#6a8aa0', '#3a5a3a', '#5a7a4a', '#5a3a22', '#7a6a4a', '#2a2a2a', '#8a6a9a'];
export const LIP_COLORS = ['#9a4a44', '#b06a66', '#a05a5a', '#8a5a50', '#6a3a36', '#c0807a'];

const T2 = (look) => look.body === 'female';
export const CREATOR_TABS = [
  { id: 'body', label: 'Body', camera: 'body', controls: [
    { key: 'body', label: 'Body type', type: 'choice', options: [['male', 'Type 1'], ['female', 'Type 2']] },
    { key: 'height', label: 'Height', type: 'range', min: 88, max: 112 },
    { key: 'weight', label: 'Weight', type: 'range', min: -100, max: 100 },
    { key: 'muscle', label: 'Muscle', type: 'range', min: -100, max: 100 },
    { key: 'shoulders', label: 'Shoulders', type: 'range', min: 88, max: 125 },
    { key: 'bust', label: 'Bust', type: 'range', min: -100, max: 100, showIf: T2 },
    { key: 'lift', label: 'Lift', type: 'range', min: 0, max: 100, showIf: T2 },
    { key: 'neck', label: 'Neck', type: 'range', min: 50, max: 110 },
    { key: 'head', label: 'Head size', type: 'range', min: 88, max: 125 },
  ] },
  { id: 'face', label: 'Face', camera: 'face', controls: [
    { key: 'face.jaw', label: 'Jaw', type: 'range', min: -100, max: 100 },
    { key: 'face.chin', label: 'Chin', type: 'range', min: -100, max: 100 },
    { key: 'face.cheeks', label: 'Cheekbones', type: 'range', min: -100, max: 100 },
    { key: 'face.brow', label: 'Brow ridge', type: 'range', min: -100, max: 100 },
    { key: 'face.nose', label: 'Nose', type: 'range', min: -100, max: 100 },
    { key: 'face.width', label: 'Face width', type: 'range', min: -100, max: 100 },
    { key: 'face.eyeColor', label: 'Eyes', type: 'color', palette: EYE_COLORS },
    { key: 'face.lipColor', label: 'Lips', type: 'color', palette: LIP_COLORS },
  ] },
  { id: 'hair', label: 'Hair', camera: 'face', controls: [
    { key: 'hair', label: 'Style', type: 'choice', options: [['parted', 'Parted'], ['buzz', 'Buzzed'], ['buzzSoft', 'Soft buzz'], ['long', 'Long'], ['buns', 'Buns'], ['none', 'Bald']] },
    { key: 'beard', label: 'Beard', type: 'toggle' },
    { key: 'colors.hair', label: 'Color', type: 'color', palette: HAIR_COLORS },
  ] },
  { id: 'outfit', label: 'Outfit', camera: 'body', controls: [
    { key: 'outfit.sleeves', label: 'Sleeves', type: 'choice', options: [['tank', 'Tank'], ['short', 'Short'], ['elbow', 'Elbow'], ['long', 'Long']] },
    { key: 'outfit.neck', label: 'Neckline', type: 'choice', options: [['crew', 'Crew'], ['v', 'V'], ['scoop', 'Scoop'], ['turtle', 'Turtle']] },
    { key: 'outfit.hem', label: 'Hem', type: 'choice', options: [['full', 'Full'], ['crop', 'Cropped']] },
    { key: 'outfit.layer', label: 'Layer', type: 'choice', options: [['none', 'None'], ['vest', 'Vest'], ['jacket', 'Jacket']] },
    { key: 'outfit.pants', label: 'Pants', type: 'choice', options: [['shorts', 'Shorts'], ['capri', 'Capri'], ['full', 'Full']] },
    { key: 'outfit.boots', label: 'Boots', type: 'choice', options: [['short', 'Short'], ['tall', 'Tall']] },
    { key: 'outfit.gloves', label: 'Gloves', type: 'toggle' },
  ] },
  { id: 'colors', label: 'Colors', camera: 'body', controls: [
    { key: 'colors.skin', label: 'Skin', type: 'color', palette: SKIN_TONES },
    { key: 'colors.shirt', label: 'Shirt', type: 'color', palette: CLOTH_COLORS },
    { key: 'colors.layer', label: 'Vest / jacket', type: 'color', palette: CLOTH_COLORS, showIf: (l) => (l.outfit || {}).layer !== 'none' },
    { key: 'colors.pants', label: 'Pants', type: 'color', palette: CLOTH_COLORS },
    { key: 'colors.belt', label: 'Belt', type: 'color', palette: DARK_COLORS },
    { key: 'colors.boots', label: 'Boots', type: 'color', palette: DARK_COLORS },
    { key: 'colors.gloves', label: 'Gloves', type: 'color', palette: DARK_COLORS, showIf: (l) => !!(l.outfit || {}).gloves },
  ] },
];

// Full look with every field present (defaults filled), deep-copied.
export function normalizeLook(look = {}) {
  return {
    ...DEFAULT_LOOK, ...look,
    face: { ...DEFAULT_LOOK.face, ...(look.face || {}) },
    outfit: { ...DEFAULT_LOOK.outfit, ...(look.outfit || {}) },
    colors: { ...DEFAULT_LOOK.colors, ...(look.colors || {}) },
  };
}
export function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
export function setPath(obj, path, v) {
  const ks = path.split('.');
  let o = obj;
  for (const k of ks.slice(0, -1)) o = o[k] || (o[k] = {});
  o[ks[ks.length - 1]] = v;
}
