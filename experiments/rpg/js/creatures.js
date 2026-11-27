// =====================================================================
// CREATURE RUNTIME (M2 core). Pure JS (no Three.js): spawning packs on a planet, and the AI that
// wanders, notices you, chases, attacks on the tick, and gives up at its leash. main.js draws them.
// =====================================================================
import { Rng } from './rng.js';
import { CREATURES, SPAWN, SAFE_ZONE } from '../data/creatures.js';
import { creatureStats, TICK } from './combat.js';
import { CELL, cellToWorld } from './worldgen.js';

// Settlement safe circles for a planet: [{ x, z, r }]
export function safeZones(P) {
  return [{ x: P.outpost.x, z: P.outpost.z, r: SAFE_ZONE.outpost }, ...P.camps.map((c) => ({ x: c.x, z: c.z, r: SAFE_ZONE.camp }))];
}
export function inSafeZone(zones, x, z) { return zones.some((s) => Math.hypot(x - s.x, z - s.z) < s.r); }

// Which family lives at a den, weighted by spawnWeight (Phase C: also by biome).
function pickFamily(rng) {
  const fams = Object.entries(CREATURES).filter(([, d]) => (d.spawnWeight || 0) > 0);
  let r = rng.range(0, fams.reduce((s, [, d]) => s + d.spawnWeight, 0));
  for (const [id, d] of fams) { r -= d.spawnWeight; if (r < 0) return id; }
  return fams[fams.length - 1][0];
}

// Packs placed on reachable, open cells, well away from settlements. Deterministic per planet.
export function spawnCreatures(P) {
  const rng = new Rng(P.meta.seed + ':creatures');
  const tier = P.meta.tier;
  const cells = [];
  for (let i = 0; i < P.reach.length; i++) if (P.reach[i] && P.passable[i] && !P.plaza[i] && !P.trail[i]) cells.push(i);
  if (!cells.length) return [];
  const areaKm2 = (cells.length * CELL * CELL) / 1e6;
  const packs = Math.max(SPAWN.minPacks, Math.min(SPAWN.maxPacks, Math.round(areaKm2 * SPAWN.packsPerKm2)));
  const avoid = [{ x: P.outpost.x, z: P.outpost.z, r: SPAWN.safeRadius.outpost }, ...P.camps.map((c) => ({ x: c.x, z: c.z, r: SPAWN.safeRadius.camp }))];
  const out = [];
  const dens = [];
  for (let k = 0; k < packs; k++) {
    let den = null;
    for (let a = 0; a < 40 && !den; a++) {
      const i = rng.pick(cells);
      const { x, z } = cellToWorld(P, i % P.W, (i / P.W) | 0);
      if (avoid.some((s) => Math.hypot(x - s.x, z - s.z) < s.r)) continue;
      if (dens.some((d) => Math.hypot(x - d.x, z - d.z) < 30)) continue;
      den = { x, z };
    }
    if (!den) continue;
    dens.push(den);
    const family = pickFamily(rng);
    const def = CREATURES[family];
    const st = creatureStats(def, tier);
    const n = rng.int(def.pack[0], def.pack[1]);
    for (let m = 0; m < n; m++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(0.5, 3.5);
      out.push({
        id: `cr${k}_${m}`, family, name: st.name, tier, denX: den.x, denZ: den.z,
        x: den.x + Math.cos(a) * r, z: den.z + Math.sin(a) * r, facing: rng.range(0, Math.PI * 2),
        hp: st.hp, maxHp: st.hp, damage: st.damage, xp: st.xp, colors: st.colors, variant: st.variant, scale: m === 0 ? 1.15 : rng.range(0.85, 1.0),
        state: 'idle', timer: rng.range(1, 5), atk: 0, target: null, deadUntil: 0, lastHurt: -99,
      });
    }
  }
  return out;
}

// One AI step for all creatures. ctx: { t, dt, player:{x,z,alive}, canStand(x,z), zones, rand }.
// Returns events: [{ type: 'attack', creature, damage }] for the caller to apply.
export function updateCreatures(list, ctx) {
  const ev = [];
  const p = ctx.player;
  const playerSafe = inSafeZone(ctx.zones, p.x, p.z);
  for (const c of list) {
    if (c.state === 'dead') {
      if (ctx.t >= c.deadUntil) { // respawn at the den
        c.state = 'idle'; c.hp = c.maxHp; c.x = c.denX; c.z = c.denZ; c.timer = 2; c.respawned = true;
      }
      continue;
    }
    const def = CREATURES[c.family];
    // ability effects: bleed ticks once a second; stunned creatures do nothing; slowed ones crawl
    if (c.bleed && ctx.t < c.bleed.until) {
      c.bleed.acc = (c.bleed.acc || 0) + ctx.dt;
      if (c.bleed.acc >= 1) { c.bleed.acc -= 1; ev.push({ type: 'bleed', creature: c, damage: c.bleed.perTick }); }
    }
    if (c.stunUntil && ctx.t < c.stunUntil) { c.moving = false; c.lastX = c.x; c.lastZ = c.z; continue; }
    const speedMult = c.slowUntil && ctx.t < c.slowUntil ? c.slowMult : 1;
    const dPlayer = Math.hypot(p.x - c.x, p.z - c.z);
    const dDen = Math.hypot(c.x - c.denX, c.z - c.denZ);
    const provoked = ctx.t - c.lastHurt < 8;
    // notice the player
    if (c.state !== 'chase' && c.state !== 'return' && p.alive && !playerSafe) {
      const sees = def.temperament === 'aggressive' ? dPlayer < def.aggroRadius
        : def.temperament === 'territorial' ? dPlayer < def.aggroRadius * 0.55 : false;
      if (sees || provoked) c.state = 'chase';
    }
    if (c.state === 'chase') {
      if (!p.alive || playerSafe || dDen > def.leash) { c.state = 'return'; }
      else if (dPlayer > def.reach) {
        stepToward(c, p.x, p.z, def.speed * speedMult * ctx.dt, ctx);
        c.atk = Math.min(c.atk, TICK); // first bite comes quickly once in reach
      } else {
        c.facing = Math.atan2(p.x - c.x, p.z - c.z);
        c.atk -= ctx.dt;
        if (c.atk <= 0) {
          c.atk = def.ticks * TICK;
          ev.push({ type: 'attack', creature: c, damage: 1 + Math.floor(ctx.rand() * c.damage) });
        }
      }
    } else if (c.state === 'return') {
      if (dDen < 1.5) { c.state = 'idle'; c.timer = 2; c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.5); }
      else stepToward(c, c.denX, c.denZ, def.speed * 0.8 * speedMult * ctx.dt, ctx);
    } else { // idle wander near the den
      c.timer -= ctx.dt;
      if (c.wanderTo) {
        if (Math.hypot(c.wanderTo.x - c.x, c.wanderTo.z - c.z) < 0.3 || !stepToward(c, c.wanderTo.x, c.wanderTo.z, 1.2 * ctx.dt, ctx)) c.wanderTo = null;
      } else if (c.timer <= 0) {
        const a = ctx.rand() * Math.PI * 2, r = ctx.rand() * 6;
        c.wanderTo = { x: c.denX + Math.cos(a) * r, z: c.denZ + Math.sin(a) * r };
        c.timer = 3 + ctx.rand() * 5;
      }
    }
    c.moving = c.lastX !== undefined && Math.hypot(c.x - c.lastX, c.z - c.lastZ) > 0.0005;
    c.lastX = c.x; c.lastZ = c.z;
  }
  return ev;
}

function stepToward(c, tx, tz, step, ctx) {
  const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
  if (d < 1e-4) return false;
  const k = Math.min(1, step / d), nx = c.x + dx * k, nz = c.z + dz * k;
  c.facing = Math.atan2(dx, dz);
  let moved = false;
  if (!inSafeZone(ctx.zones, nx, c.z) && ctx.canStand(nx, c.z)) { c.x = nx; moved = true; }
  if (!inSafeZone(ctx.zones, c.x, nz) && ctx.canStand(c.x, nz)) { c.z = nz; moved = true; }
  return moved;
}

// Push a creature away along (ux, uz) by up to `dist` meters, stopping at walls and settlements.
export function pushCreature(c, ux, uz, dist, ctx) {
  const steps = Math.ceil(dist / 0.25);
  for (let i = 0; i < steps; i++) {
    const nx = c.x + ux * 0.25, nz = c.z + uz * 0.25;
    if (inSafeZone(ctx.zones, nx, nz) || !ctx.canStand(nx, nz)) break;
    c.x = nx; c.z = nz;
  }
}

// Apply an ability's lasting effects to a creature hit at time t.
export function applyEffects(c, def, t, weaponDamage) {
  if (def.stun) c.stunUntil = Math.max(c.stunUntil || 0, t + def.stun);
  if (def.slow) { c.slowUntil = t + def.slow.sec; c.slowMult = def.slow.mult; }
  if (def.bleed) c.bleed = { until: t + def.bleed.sec, perTick: Math.max(1, Math.round(def.bleed.perSec * weaponDamage)), acc: 0 };
}

// Damage a creature (from the player). Returns true if it died.
export function hurtCreature(c, dmg, t) {
  c.hp -= dmg;
  c.lastHurt = t;
  if (c.state !== 'dead' && c.state !== 'return') c.state = 'chase';
  if (c.hp <= 0) {
    c.hp = 0; c.state = 'dead'; c.diedAt = t; c.deadUntil = t + SPAWN.respawnSec; c.wanderTo = null; c.bleed = null; c.stunUntil = 0; c.slowUntil = 0;
    return true;
  }
  return false;
}
