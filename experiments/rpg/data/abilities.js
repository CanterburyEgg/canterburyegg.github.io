// =====================================================================
// ABILITIES (M2 Phase B). Each weapon item has 2-3 abilities on keys 1-4. Abilities are skillshots:
// hold the key to preview the shape on the ground at the mouse, release to fire. Big damage if it
// lands, nothing if it misses.
//
// shape:  line   { length, width }          from you toward the mouse
//         cone   { radius, angle }          from you toward the mouse (angle = full width, radians)
//         circle { radius, range }          centered on the mouse, up to `range` away
//         self   { radius }                 centered on you
//         dash   { length, width }          you travel along the line, hitting what you pass
//         leap   { range, radius }          you jump to the mouse point and land in a circle
// effects: damage (x weapon damage), hits ('first' | 'all'), knockback (m), slow { mult, sec },
//          stun (sec), bleed { perSec (x weapon damage), sec }, shots (rounds used), windup (sec),
//          charge (sec held before release for full power), reveal (sec)
// cd: cooldown in seconds. clip: player animation role or clip name.
// =====================================================================

export const ABILITIES = {
  // ---- machete / cleaver: quick and mobile
  lunge: { name: 'Lunge', icon: '💨', cd: 7, shape: 'dash', length: 5, width: 1.4, damage: 1.6, hits: 'first', windup: 0.05, clip: 'Sword_Attack', blurb: 'Dash forward and cut the first thing in your path.' },
  sweep: { name: 'Sweep', icon: '🌙', cd: 6, shape: 'cone', radius: 3, angle: 2.1, damage: 1.3, hits: 'all', windup: 0.25, clip: 'Sword_Regular_B', blurb: 'A wide cut in front of you.' },
  flurry: { name: 'Flurry', icon: '✂️', cd: 10, shape: 'cone', radius: 2.6, angle: 1.0, damage: 0.9, strikes: 3, hits: 'all', windup: 0.15, clip: 'Sword_Regular_A', blurb: 'Three quick cuts in a narrow cone.' },
  whirl: { name: 'Whirl', icon: '🌀', cd: 11, shape: 'self', radius: 3, damage: 1.5, hits: 'all', windup: 0.3, clip: 'Sword_Regular_C', blurb: 'Spin and cut everything around you.' },
  rend: { name: 'Rend', icon: '🩸', cd: 12, shape: 'cone', radius: 3, angle: 1.4, damage: 0.8, bleed: { perSec: 0.5, sec: 6 }, hits: 'all', windup: 0.25, clip: 'Sword_Regular_B', blurb: 'Open wounds that keep bleeding.' },
  // ---- maul: slow and heavy
  slam: { name: 'Slam', icon: '💥', cd: 9, shape: 'circle', radius: 1.8, range: 3, damage: 2.0, stun: 1.2, hits: 'all', windup: 0.45, clip: 'Sword_Heavy_Combo', blurb: 'Bring it down on a spot and stun what you hit.' },
  shove: { name: 'Shove', icon: '👐', cd: 8, shape: 'cone', radius: 2.6, angle: 1.6, damage: 0.6, knockback: 4, hits: 'all', windup: 0.2, clip: 'Punch_Cross', blurb: 'Knock everything in front of you back.' },
  quake: { name: 'Quake', icon: '🌋', cd: 16, shape: 'circle', radius: 3.6, range: 5, damage: 2.4, slow: { mult: 0.5, sec: 4 }, hits: 'all', windup: 0.8, clip: 'Sword_Heavy_Combo', blurb: 'A big slow slam that cracks the ground and slows.' },
  // ---- spear: reach
  thrust: { name: 'Thrust', icon: '🔱', cd: 6, shape: 'line', length: 5, width: 0.9, damage: 1.6, hits: 'all', windup: 0.25, clip: 'Sword_Attack', blurb: 'A long thrust through everything in line.' },
  vault: { name: 'Vault', icon: '🦘', cd: 12, shape: 'leap', range: 7, radius: 1.8, damage: 1.2, hits: 'all', windup: 0.1, clip: 'NinjaJump_Start', blurb: 'Pole-vault to a spot and land hard.' },
  pin: { name: 'Pin', icon: '📌', cd: 10, shape: 'line', length: 6, width: 0.9, damage: 1.0, slow: { mult: 0.35, sec: 3 }, hits: 'first', windup: 0.2, clip: 'Sword_Attack', blurb: 'Pin the first thing in line and slow it.' },
  // ---- revolver: fast, short range
  quickdraw: { name: 'Quickdraw', icon: '🎯', cd: 6, shape: 'line', length: 11, width: 0.6, damage: 2.4, hits: 'first', shots: 1, windup: 0.05, clip: 'Pistol_Shoot', blurb: 'One fast, heavy shot at the first thing in line.' },
  fan: { name: 'Fan the Hammer', icon: '🪭', cd: 9, shape: 'cone', radius: 9, angle: 0.7, damage: 0.9, strikes: 3, hits: 'all', shots: 3, windup: 0.1, clip: 'Pistol_Shoot', blurb: 'Empty three rounds into a cone.' },
  dive: { name: 'Dive', icon: '🤸', cd: 8, shape: 'dash', length: 5, width: 1.0, damage: 0, hits: 'none', windup: 0, clip: 'Roll', blurb: 'Roll out of trouble.' },
  // ---- rifle: slow, long range
  pierce: { name: 'Piercing Shot', icon: '➖', cd: 8, shape: 'line', length: 18, width: 0.7, damage: 2.2, hits: 'all', shots: 1, windup: 0.3, clip: 'Pistol_Shoot', blurb: 'A round that goes through everything in line.' },
  steady: { name: 'Steady Aim', icon: '🔭', cd: 12, shape: 'line', length: 20, width: 0.5, damage: 4.0, hits: 'first', shots: 1, windup: 0.1, charge: 1.2, clip: 'Pistol_Shoot', blurb: 'Hold to steady for 1.2s, then a very heavy shot.' },
  flare: { name: 'Flare', icon: '🎆', cd: 14, shape: 'circle', radius: 3.5, range: 14, damage: 0.4, slow: { mult: 0.6, sec: 5 }, reveal: 8, hits: 'all', shots: 1, windup: 0.2, clip: 'Pistol_Shoot', blurb: 'A burning flare that slows what it lands on.' },
};

// Abilities by weapon item id (better weapons, different abilities). Unarmed has none.
export const WEAPON_ABILITIES = {
  bismuth_machete: ['lunge', 'sweep'],
  bismuth_maul: ['slam', 'shove'],
  cobalt_machete: ['lunge', 'sweep', 'flurry'],
  cobalt_spear: ['thrust', 'vault', 'pin'],
  tungsten_cleaver: ['whirl', 'rend', 'lunge'],
  tungsten_maul: ['slam', 'quake', 'shove'],
  standard_revolver: ['quickdraw', 'fan', 'dive'],
  standard_rifle: ['pierce', 'steady', 'flare'],
};
