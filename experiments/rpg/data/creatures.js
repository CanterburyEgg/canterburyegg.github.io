// =====================================================================
// CREATURES (M2). Five families: the Skarl (wolf-like pack hunters, the combat quest's family),
// Gallox, Vorm, Dart Fly and Grondak. All five are modeled; spawnWeight picks which ones appear
// in the world (0 = not spawned yet; Phase C turns them on as their AI lands).
//
// temperament: 'aggressive' hunts on sight, 'territorial' attacks when you get close or hit it,
//              'skittish' flees and only fights back when cornered.
// Stats are per planet tier (index 0 = tier 1).
// =====================================================================

export const CREATURES = {
  skarl: {
    name: 'Skarl',
    temperament: 'aggressive',
    pack: [2, 3],                 // how many spawn together
    hp: [12, 30, 55, 90],
    damage: [2, 5, 9, 14],        // max hit before armor (tier 1 is gentle: a fresh drifter with a machete wins)
    ticks: 4,                     // attack every 4 ticks (2.4s)
    reach: 1.7,
    speed: 4.6,                   // m/s when chasing (a touch faster than you, so you can't just walk away)
    aggroRadius: 11,
    leash: 26,                    // gives up beyond this distance from its den
    xp: [14, 30, 55, 90],         // Melee XP is per damage dealt; this is a kill bonus
    // [fur, dark, accent] per tier, deliberately far apart so regions read at a glance
    colors: [['#b08a5a', '#5a4430', '#e8d2a8'], ['#5a6f8a', '#2a3448', '#c9d8e8'], ['#5a3f6a', '#24162e', '#6af0d8'], ['#3a3434', '#161212', '#ff6a2a']],
    biomeNames: ['Scrub Skarl', 'Ridge Skarl', 'Dusk Skarl', 'Ash Skarl'],
    // each region's Skarl has its own body quirk (creature_models.js):
    // scrub: scruffy, short-legged, huge ears · ridge: tall mane crest, long legs, pale stripes
    // dusk: swept-back horns, four glowing eyes, twin tails · ash: bone plates down the back, tusks, ember cracks
    variants: ['scrub', 'ridge', 'dusk', 'ash'],
    spawnWeight: 3,
  },
  // Herd grazers. Skittish: they bolt when you get close; if the herd is attacked, the big one
  // charges (line telegraph, Phase C).
  gallox: {
    name: 'Gallox',
    temperament: 'skittish',
    pack: [3, 5],
    hp: [20, 45, 80, 130],
    damage: [3, 6, 11, 17],
    ticks: 5,
    reach: 2.0,
    speed: 5.2,
    aggroRadius: 9,
    leash: 30,
    xp: [16, 34, 62, 100],
    colors: [['#c8a46a', '#6e5232', '#f2e2bc'], ['#8a94a0', '#3e4652', '#e8ecf0'], ['#4a5a8a', '#1e2440', '#9af0ff'], ['#6a5a50', '#2a2220', '#ff8a3a']],
    biomeNames: ['Scrub Gallox', 'Ridge Gallox', 'Dusk Gallox', 'Ash Gallox'],
    // scrub: shaggy fringe, curled horns · ridge: long legs, branching antlers
    // dusk: glowing spots down the back, long drooping ears · ash: stone hump, broad flat horns
    variants: ['scrub', 'ridge', 'dusk', 'ash'],
    spawnWeight: 0,
  },
  // Burrowing ambusher. Territorial: sits in its mound and erupts when you step close (circle
  // telegraph, Phase C), then spits.
  vorm: {
    name: 'Vorm',
    temperament: 'territorial',
    pack: [1, 1],
    hp: [26, 60, 105, 170],
    damage: [4, 8, 13, 20],
    ticks: 4,
    reach: 2.4,
    speed: 2.6,
    aggroRadius: 8,
    leash: 10,
    xp: [22, 46, 84, 135],
    colors: [['#a8805a', '#5a3e28', '#e8c890'], ['#7a8a6a', '#3a4430', '#d8e0c0'], ['#6a3a6a', '#2a142a', '#ff6ad8'], ['#4a3a34', '#1a1210', '#ff5a1a']],
    biomeNames: ['Scrub Vorm', 'Ridge Vorm', 'Dusk Vorm', 'Ash Vorm'],
    // scrub: bristly segments · ridge: stone rings · dusk: glowing lure on a stalk · ash: magma mouth, ember bands
    variants: ['scrub', 'ridge', 'dusk', 'ash'],
    spawnWeight: 0,
  },
  // Flying pests. Aggressive, in swarms, low health; dive attacks (line telegraph, Phase C).
  dart_fly: {
    name: 'Dart Fly',
    temperament: 'aggressive',
    pack: [3, 5],
    hp: [6, 14, 26, 42],
    damage: [2, 4, 7, 11],
    ticks: 3,
    reach: 1.6,
    speed: 5.0,
    aggroRadius: 12,
    leash: 24,
    xp: [8, 16, 30, 48],
    colors: [['#c8b040', '#4a3a18', '#f8f0a0'], ['#4a8a6a', '#1a3a2a', '#c0f0d8'], ['#3a3a6a', '#141428', '#b8ff5a'], ['#5a2a2a', '#1a0c0c', '#ff4a2a']],
    biomeNames: ['Scrub Dart Fly', 'Ridge Dart Fly', 'Dusk Dart Fly', 'Ash Dart Fly'],
    // scrub: banded abdomen · ridge: long wings, trailing streamers · dusk: lantern tail · ash: spiked shell, barbed stinger
    variants: ['scrub', 'ridge', 'dusk', 'ash'],
    spawnWeight: 0,
  },
  // Armored brute. Territorial and slow: a ground slam (big circle telegraph, Phase C), and a
  // soft glowing weak spot on its back.
  grondak: {
    name: 'Grondak',
    temperament: 'territorial',
    pack: [1, 1],
    hp: [40, 90, 160, 260],
    damage: [5, 10, 16, 24],
    ticks: 6,                     // slow, heavy swings (3.6s)
    reach: 2.3,
    speed: 3.2,                   // slower than you: you can always walk away
    aggroRadius: 10,              // territorial: notices you at about half this
    leash: 18,
    xp: [40, 80, 150, 240],
    colors: [['#8a7a5a', '#4a4030', '#ffcf5a'], ['#6a7480', '#2e343c', '#7ae0ff'], ['#5a4a6e', '#221a2e', '#ff7ae0'], ['#3a3636', '#121010', '#ff5a1a']],
    biomeNames: ['Scrub Grondak', 'Ridge Grondak', 'Dusk Grondak', 'Ash Grondak'],
    // scrub: moss and brush on its plates · ridge: crystal spikes on the shoulders
    // dusk: horn crest, glowing eyes · ash: obsidian plates with lava seams
    variants: ['scrub', 'ridge', 'dusk', 'ash'],
    spawnWeight: 1,
  },
};

// Spawning: packs per planet scale with size; never within this distance of a settlement.
export const SPAWN = { packsPerKm2: 9, minPacks: 4, maxPacks: 30, safeRadius: { outpost: 70, camp: 40 }, respawnSec: 75 };
// Settlements are safe: creatures won't enter or aggro inside these radii.
export const SAFE_ZONE = { outpost: 38, camp: 18 };
