// =====================================================================
// SKILLS & XP CURVE (data). Engine reads this; tune numbers here only.
// =====================================================================

export const MAX_LEVEL = 50;

// RS-shaped exponential curve compressed to 50:
// XP to go from level L to L+1 = BASE * GROWTH^(L-1).
// With BASE 50 / GROWTH 1.13: L10 ≈ 770 XP, L25 ≈ 6.8k, L50 ≈ 152k total.
// Pace (tests/gathering_check.mjs sim, pure skilling incl. bank trips): see test output.
export const XP_CURVE = { base: 50, growth: 1.13 };

export function xpForLevel(level) {
  // Total XP required to *reach* `level` (level 1 = 0 XP).
  let total = 0;
  for (let l = 1; l < level; l++) total += XP_CURVE.base * Math.pow(XP_CURVE.growth, l - 1);
  return Math.round(total);
}

export function levelForXp(xp) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

// Gathering success per tick (RS-classic):
// chance = clamp(base + (playerLevel - nodeLevel) * perLevel + toolTier * perTool, min, max)
export const GATHER_ROLL = { base: 0.30, perLevel: 0.025, perTool: 0.08, min: 0.15, max: 0.92 };
export const TICK_SECONDS = 0.6;
export const TICKS_PER_ATTEMPT = 4; // RS-style: one gather roll every 4 ticks (2.4s)

export const SKILLS = {
  mining:   { name: 'Mining',   icon: '⛏️', kind: 'gathering', tools: ['pick'],   milestone: 1 },
  foraging: { name: 'Foraging', icon: '🌿', kind: 'gathering', tools: ['hatchet', 'sickle', 'gloves'], milestone: 1 },
  hunting:  { name: 'Hunting',  icon: '🏹', kind: 'gathering', tools: [],  milestone: 'post-combat' },
  // Milestone 2 combat (Defense is folded into armor stats)
  melee:    { name: 'Melee',    icon: '🗡️', kind: 'combat', milestone: 2, shown: true },
  ranged:   { name: 'Ranged',   icon: '🎯', kind: 'combat', milestone: 2, shown: true },
  vitality: { name: 'Vitality', icon: '❤️', kind: 'combat', milestone: 2, shown: true },
};
export const shownSkill = (s) => s.shown ?? s.milestone === 1;
