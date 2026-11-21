// Ambient townsfolk generation (pure, seeded per planet).
import { Rng } from './rng.js';
import { randomLook } from './character_look.js';
import { FIRST_NAMES, LAST_NAMES, ALIEN_SYLLABLES, ROBOT_NAMES, AMBIENT_TINTS, AMBIENT_ACCENTS, SKINS, ROLE_QUIPS, QUIRK_QUIPS, FEATURE_QUIPS } from '../data/npcs.js';

const ACCESSORY_POOL = { humanoid: ['cap', 'scarf', 'apron', null, null], blob_alien: ['scarf', 'reading_goggles', null], robot_small: ['antenna', 'tiny_bowtie', null] };

function frontOf(b, dist) {
  // building local +z (door side) in world = (-sin rot, cos rot)
  return { x: b.x - Math.sin(b.rot) * (b.d / 2 + dist), z: b.z + Math.cos(b.rot) * (b.d / 2 + dist) };
}

function makeLook(rng) {
  const body = rng.weighted([['humanoid', 5], ['blob_alien', 2], ['robot_small', 1]]);
  const acc = rng.pick(ACCESSORY_POOL[body]);
  return {
    body,
    tint: rng.pick(AMBIENT_TINTS),
    accent: rng.pick(AMBIENT_ACCENTS),
    skin: rng.pick(SKINS),
    scale: body === 'robot_small' ? rng.range(0.7, 0.9) : rng.range(0.9, 1.08),
    accessories: acc ? [acc] : [],
    voice: { pitch: rng.range(0.75, 1.4), wobble: rng.range(0, 0.3), bitcrush: body === 'robot_small' },
  };
}

export function generateAmbientNpcs(P) {
  const rng = new Rng(P.meta.seed + ':npcs');
  // Unique first and last names within the settlement; style depends on body type.
  const used = new Set();
  const fresh = (gen) => {
    for (let k = 0; k < 40; k++) {
      const v = gen();
      if (!used.has(v)) { used.add(v); return v; }
    }
    return gen();
  };
  const alienWord = () => {
    const w = rng.pick(ALIEN_SYLLABLES.start) + (rng.chance(0.7) ? rng.pick(ALIEN_SYLLABLES.end) : '');
    return w[0].toUpperCase() + w.slice(1).toLowerCase();
  };
  const nameFor = (look) => {
    if (look.body === 'robot_small') return fresh(() => rng.pick(ROBOT_NAMES));
    if (look.body === 'blob_alien') return rng.chance(0.5) ? fresh(alienWord) : `${fresh(alienWord)} ${fresh(alienWord)}`;
    return `${fresh(() => rng.pick(FIRST_NAMES))} ${fresh(() => rng.pick(LAST_NAMES))}`;
  };
  // Humanoids get a faceted-human look from their own seeded stream (so names/positions don't shift
  // when the look generator changes). Townsfolk span the whole height range.
  const npc = (base, look) => {
    const d = { ...base, name: nameFor(look), ...look };
    if (look.body === 'humanoid') {
      const lr = new Rng(`${P.meta.seed}:look:${base.id}`);
      d.human = randomLook(() => lr.float());
      d.human.height = 88 + Math.floor(lr.float() * 25);
    }
    return d;
  };
  const out = [];
  const o = P.outpost;
  const shop = o.buildings.find((b) => b.kind === 'shop');
  const locker = o.buildings.find((b) => b.kind === 'locker');
  if (shop) {
    const p = frontOf(shop, 1.4);
    out.push(npc({ id: 'shopkeeper', role: 'shopkeeper', x: p.x, z: p.z, faceX: o.x, faceZ: o.z }, makeLook(rng)));
  }
  if (locker) {
    const p = frontOf(locker, 1.4);
    out.push(npc({ id: 'clerk', role: 'clerk', x: p.x, z: p.z, faceX: o.x, faceZ: o.z }, makeLook(rng)));
  }
  const locals = rng.int(2, 4);
  for (let k = 0; k < locals; k++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(3, 8);
    out.push(npc({
      id: `local${k}`, role: 'local',
      x: o.x + Math.cos(a) * r, z: o.z + Math.sin(a) * r,
      wander: { cx: o.x, cz: o.z, r: 9 },
    }, makeLook(rng)));
  }
  return out;
}

// features: { lake, bridges, sweeper, tower } booleans for this planet; lines about absent things are skipped.
export function quipPool(role, quirks, features = {}) {
  const pool = [...(ROLE_QUIPS[role] || ROLE_QUIPS.local)];
  if (!ROLE_QUIPS[role] || role === 'local') for (const [f, lines] of Object.entries(FEATURE_QUIPS)) if (features[f]) pool.push(...lines);
  for (const q of quirks) if (QUIRK_QUIPS[q]) pool.push(...QUIRK_QUIPS[q], ...QUIRK_QUIPS[q]); // quirk lines weighted up
  return pool;
}
