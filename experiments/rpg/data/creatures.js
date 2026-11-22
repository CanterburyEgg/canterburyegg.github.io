// =====================================================================
// CREATURES (M2). Phase A ships one family so the combat core has something to fight: the Skarl,
// wolf-like pack hunters (the combat quest's family). The other four (Gallox, Vorm, Dart Fly,
// Grondak) arrive in Phase C with their own models, temperaments and telegraphs.
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
  },
};

// Spawning: packs per planet scale with size; never within this distance of a settlement.
export const SPAWN = { packsPerKm2: 9, minPacks: 4, maxPacks: 30, safeRadius: { outpost: 70, camp: 40 }, respawnSec: 75 };
// Settlements are safe: creatures won't enter or aggro inside these radii.
export const SAFE_ZONE = { outpost: 38, camp: 18 };
