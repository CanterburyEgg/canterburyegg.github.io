// Procedural names. Plain words, no hyphens (see _agents/rules/naming_style.md).

const START = ['Ka', 'Ve', 'Or', 'Ta', 'Mi', 'Su', 'Ny', 'Bre', 'Ul', 'Co', 'Ash', 'Pe', 'Quo', 'Rhe', 'Se', 'Tam', 'Vo', 'Ze', 'Ha', 'Du', 'Lo', 'Gri'];
const MIDDLE = ['', '', '', 'ra', 'li', 'no', 'va', 'the', 'mo', 'ri', 'sa', 'du'];
const END = ['s', 'n', 'th', 'x', 'ra', 'ne', 'dor', 'vel', 'mar', 'ka', 'ris', 'on', 'ia', 'us'];

export function planetName(rng) {
  const s = rng.pick(START) + rng.pick(MIDDLE) + rng.pick(END);
  return s[0].toUpperCase() + s.slice(1);
}

export function outpostName(rng, planet) {
  return `${planet} ${rng.pick(['Landing', 'Post', 'Station', 'Crossing', 'Reach', 'Rest'])}`;
}

export function campName(rng) {
  return `${rng.pick(['Dry', 'Lone', 'Windy', 'Low', 'Far', 'Quiet', 'Rusty', 'Little'])} Camp`;
}

export function shopName(rng) {
  return rng.pick(['Corner Supply', 'Honest Goods', 'The Exchange', 'Odds and Ends', 'Frontier Provisions', 'Secondhand Supply']);
}

const DIRS = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];

// dx, dz in world space; north = -z.
export function compassWord(dx, dz) {
  const ang = Math.atan2(dx, -dz); // 0 = north, clockwise
  const k = Math.round(((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return DIRS[k];
}

const SITE_SUFFIX = {
  pick: ['Quarry', 'Dig'],
  hatchet: ['Grove', 'Woods'],
  sickle: ['Thicket', 'Beds'],
  gloves: ['Hollow', 'Patch'],
};
const UNIQUE_PREFIX = ['Far', 'Old', 'Little', 'Upper', 'Lower', 'Hidden'];

export function siteName(rng, resource, dx, dz, used) {
  const base = resource.name.replace(/ (Ore|Log)$/, '');
  const suffix = rng.pick(SITE_SUFFIX[resource.tool] || ['Site']);
  let name = `${compassWord(dx, dz)} ${base} ${suffix}`;
  let k = 0;
  while (used.has(name) && k < UNIQUE_PREFIX.length) {
    name = `${UNIQUE_PREFIX[k]} ${compassWord(dx, dz)} ${base} ${suffix}`;
    k++;
  }
  used.add(name);
  return name;
}
