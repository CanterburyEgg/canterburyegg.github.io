// =====================================================================
// ALIEN SPECIES: who lives out here besides humans and small robots. Data only (names, palettes,
// voices, weights); the bodies are built from primitives in js/alien_models.js.
// Species names are plain words; individual names follow each species' own naming rule.
// =====================================================================

export const SPECIES = {
  blob_alien: {
    name: 'Dollop', blurb: 'Round, friendly, mostly eyes.',
    tints: ['#8a6f5a', '#5f7d6e', '#7a5f8a', '#a0805a', '#5a6f8f', '#6f8a5a', '#4f7a8a'],
    accents: ['#ffcf4a', '#e8e2cf', '#ff8a6a', '#b8f0c8'],
    voice: { pitch: [0.9, 1.4], wobble: [0.1, 0.3] },
    names: { kind: 'syllables', start: ['Zu', 'Bo', 'Qua', 'Lu', 'Mo', 'Ploo', 'Gri', 'Vee', 'Oo', 'Thu', 'Nim', 'Wub', 'Ey', 'Sko'], end: ['zu', 'bo', 'la', 'mi', 'rr', 'pp', 'nk', 'th', 'oo', 'ee', 'l', 'sh'], twoPart: 0.5 },
    scale: [0.9, 1.08], accessories: ['scarf', 'reading_goggles', null],
  },
  strider: {
    name: 'Strider', blurb: 'Tall, slow and patient. Sees over every fence.',
    tints: ['#c9b79c', '#a0907a', '#8aa0a8', '#b8a0c0', '#9ab08a'],
    accents: ['#3fd0ff', '#ffcf4a', '#ff8a6a'],
    voice: { pitch: [0.55, 0.75], wobble: [0, 0.1] },
    names: { kind: 'syllables', start: ['Ae', 'Ith', 'Ul', 'Ora', 'Ven', 'Sae', 'Thal', 'Eru'], end: ['leth', 'un', 'ari', 'os', 'iel', 'aan', 'eth'], twoPart: 0 },
    scale: [0.95, 1.12], accessories: ['scarf', null, null],
  },
  glimmer: {
    name: 'Glimmer', blurb: 'Floating bells of light. They drift when they think.',
    tints: ['#9fe8ff', '#e0a8ff', '#b8f0c8', '#ffc2d8', '#ffe39a'],
    accents: ['#ffffff', '#3fd0ff', '#ffcf4a'],
    voice: { pitch: [1.45, 1.8], wobble: [0.25, 0.5] },
    names: { kind: 'syllables', start: ['Lu', 'Mi', 'Oo', 'Wi', 'Ae', 'Ni', 'Shi', 'Ve'], end: ['mi', 'lu', 'si', 'ae', 'vi', 'nn', 'oo'], twoPart: 0 },
    scale: [0.85, 1.1], accessories: [null],
  },
  skitter: {
    name: 'Skitter', blurb: 'Six legs, four eyes, strong opinions about rocks.',
    tints: ['#6a7a4a', '#8a5a3a', '#4a5a6a', '#7a4a5a', '#5a6a5a'],
    accents: ['#ffcf4a', '#ff8a6a', '#b8f0c8'],
    voice: { pitch: [1.15, 1.4], wobble: [0, 0.15], bitcrush: true },
    names: { kind: 'syllables', start: ['Kr', 'Tch', 'Zz', 'Ks', 'Tk', 'Skr', 'Pt'], end: ['ix', 'ik', 'ek', 'ak', 'iss', 'tt'], twoPart: 0.35 },
    scale: [0.85, 1.05], accessories: ['antenna', null],
  },
  facet: {
    name: 'Facet', blurb: 'Living crystal. Hums when pleased, chimes when not.',
    tints: ['#7ef0e0', '#c9a2e8', '#8fd0ff', '#f0b8d0', '#d8e8f0'],
    accents: ['#ffffff', '#ffcf4a', '#3fd0ff'],
    voice: { pitch: [1.15, 1.35], wobble: [0, 0.05] },
    names: { kind: 'list', list: ['Beryl', 'Mica', 'Galena', 'Opal', 'Jasper', 'Quartz', 'Garnet', 'Agate', 'Topaz', 'Spinel', 'Zircon', 'Onyx', 'Iolite', 'Calcite'] },
    scale: [0.9, 1.08], accessories: [null],
  },
  morel: {
    name: 'Morel', blurb: 'Walking mushrooms. Slow to anger, quick to spore.',
    tints: ['#c99a5b', '#a86a86', '#d8c8a8', '#8a5a4a', '#e0a070'],
    accents: ['#f4f1ea', '#ffcf4a', '#b8f0c8'],
    voice: { pitch: [0.75, 0.95], wobble: [0.05, 0.2] },
    names: { kind: 'list', list: ['Truffle', 'Button', 'Inkcap', 'Chanterelle', 'Porcini', 'Enoki', 'Puffball', 'Shiitake', 'Oyster', 'Maitake', 'Bolete', 'Russula'] },
    scale: [0.75, 1.0], accessories: ['scarf', null, null],
  },
  murmur: {
    name: 'Murmur', blurb: 'A swarm of tiny lights wearing one borrowed suit.',
    tints: ['#5a6f8f', '#8f5a5a', '#4f7a8a', '#6a6a7a', '#7a6a4a'],
    accents: ['#ffe680', '#9fe8ff', '#b8f0c8', '#ff9ab8'],
    voice: { pitch: [1.0, 1.3], wobble: [0.4, 0.6] },
    names: { kind: 'list', list: ['Several', 'Plenty', 'Dozen', 'Throng', 'Bunch', 'Handful', 'Quorum', 'Flock', 'Gaggle', 'Smattering'] },
    scale: [0.95, 1.05], accessories: ['scarf', null],
  },
};

export const ALIEN_IDS = Object.keys(SPECIES);
export const isAlien = (body) => !!SPECIES[body];
// How many alien species a settlement draws from (the rest of the town is humans and robots).
export const SPECIES_PER_PLANET = [2, 3];
