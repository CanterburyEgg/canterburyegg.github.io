// =====================================================================
// PLANET QUIRKS (M1 draft). Each planet rolls 0-3; the starter planet
// rolls at most 1 quirk flagged `gentle`. Mostly atmospheric, with 1-2
// light mechanics. Names are drafts; veto freely.
//
// Fields:
//   nounPhrase  used by quest slot fallbacks ("I think {quirk} got into his gears")
//   sky / fog   palette overrides for the renderer
//   particles   ambient particle preset (null = none)
//   border      forces the planet's landmass border type (null = rolled normally)
//   mechanic    light gameplay effect (null = flavor only)
//   generation  world-gen modifiers (discussed later in the quirk session)
//   excludes    quirks that can't co-occur with this one
// =====================================================================

export const QUIRKS = {
  spore_fog: {
    name: 'Spore Fog',
    nounPhrase: 'the spore fog',
    gentle: false,
    sky: '#9fb59a', fog: { color: '#b7c9a8', density: 0.022 },
    particles: 'drifting_spores',
    border: 'toxic_marsh',
    mechanic: { viewDistanceMult: 0.55, foragingRespawnMult: 0.7 }, // fog hides distant sites until close; spores speed regrowth
    excludes: ['ash_fall'],
  },
  low_gravity: {
    name: 'Low Gravity',
    nounPhrase: 'the low gravity',
    gentle: true,
    sky: null, fog: null,
    particles: 'floating_pebbles',
    border: 'chasm',
    mechanic: { walkSpeedMult: 1.15 },
    excludes: [],
  },
  tidal_shores: {
    name: 'Tidal Shores',
    nounPhrase: 'the tides',
    gentle: false,
    sky: null, fog: null,
    particles: null,
    border: 'sea',
    mechanic: { tideCycleSec: 240 }, // water level visibly rises/falls; shoreline nodes exposed at low tide
    excludes: [],
  },
  endless_dusk: {
    name: 'Endless Dusk',
    nounPhrase: 'the endless dusk',
    gentle: true,
    sky: '#c86b5a', fog: { color: '#6b4a6e', density: 0.012 },
    particles: null,
    border: null,
    mechanic: null, // sun pinned at the horizon: long shadows, warm/purple palette
    excludes: ['twin_moons'],
  },
  twin_moons: {
    name: 'Twin Moons',
    nounPhrase: 'the twin moons',
    gentle: true,
    sky: '#1d2340', fog: { color: '#2a3158', density: 0.010 },
    particles: null,
    border: null,
    mechanic: null, // permanent bright night: two moons, silver light
    excludes: ['endless_dusk'],
  },
  magnetic_storms: {
    name: 'Magnetic Storms',
    nounPhrase: 'the magnetic storms',
    gentle: false,
    sky: '#24304a', fog: { color: '#3a4a6a', density: 0.014 },
    particles: 'aurora_sparks',
    border: 'cliffs',
    mechanic: { storm: { everySec: [150, 240], durationSec: 30, miningSuccessBonus: 0.10, minimapStatic: true } }, // aurora ribbons, flickering lights
    excludes: [],
  },
  ash_fall: {
    name: 'Ash Fall',
    nounPhrase: 'the ash',
    gentle: false,
    sky: '#5a5452', fog: { color: '#77706c', density: 0.020 },
    particles: 'falling_ash',
    border: 'lava',
    mechanic: null,
    excludes: ['spore_fog'],
  },
  singing_crystals: {
    name: 'Singing Crystals',
    nounPhrase: 'the singing crystals',
    gentle: true,
    sky: null, fog: null,
    particles: 'crystal_glints',
    border: null,
    mechanic: { audioCompass: { target: 'undiscovered_site', rangeM: 60 } }, // crystal props hum louder near undiscovered sites
    generation: { miningSiteWeightMult: 1.4 },
    excludes: [],
  },
};

export const QUIRK_ROLLS = { min: 0, max: 3, starterMax: 1, starterGentleOnly: true };

export const BORDER_TYPES = ['sea', 'chasm', 'cliffs', 'lava', 'toxic_marsh'];
