// =====================================================================
// QUIRK MECHANICS (M1): the gameplay side of planet quirks. Pure JS (no DOM, no Three.js) so it
// can be tested headlessly; main.js reads the results and the renderer shows them.
//
//   Spore Fog        shorter view distance: sites must be found up close before they show
//                    on labels/minimap (discovery radius shrinks).
//   Magnetic Storms  a storm rolls in every few minutes for ~30s: +Mining success, minimap static.
//   Singing Crystals the crystals hum toward the nearest undiscovered site within range.
//   Tidal Shores     the sea rises and falls; shoreline nodes below the tide line can only be
//                    worked when the water is out.
//   Low Gravity      +walk speed (applied in main.js via walkSpeedMult).
// =====================================================================
import { QUIRKS } from '../data/quirks.js';

export const DISCOVER_RADIUS = 22;   // m: walk this close to a site to discover it
export const TIDE_AMPLITUDE = 0.6;   // m above/below mean sea level

export function quirkMechanics(quirkIds) {
  const m = {};
  for (const id of quirkIds) Object.assign(m, (QUIRKS[id] && QUIRKS[id].mechanic) || {});
  return m;
}

// rand: () => [0,1). Returns a runtime with update(dt) -> list of events.
// border: the planet's border type; tides only run where there is a sea to move.
export function createQuirkRuntime(quirkIds, rand = Math.random, border = 'sea') {
  const mech = quirkMechanics(quirkIds);
  if (border !== 'sea') delete mech.tideCycleSec;
  const storm = mech.storm || null;
  const tide = mech.tideCycleSec ? { cycle: mech.tideCycleSec } : null;
  const nextGap = () => storm.everySec[0] + rand() * (storm.everySec[1] - storm.everySec[0]);
  const rt = {
    mech,
    t: 0,
    viewMult: mech.viewDistanceMult || 1,
    discoverRadius: DISCOVER_RADIUS * (mech.viewDistanceMult || 1),
    storm: storm ? { active: false, nextAt: nextGap() * 0.5, endsAt: 0 } : null,
    tide,
    // Mining success bonus right now (Magnetic Storms).
    miningBonus() { return rt.storm && rt.storm.active ? storm.miningSuccessBonus || 0 : 0; },
    minimapStatic() { return !!(rt.storm && rt.storm.active && storm.minimapStatic); },
    // Storm intensity 0..1 with a short ramp in/out, for visuals.
    stormLevel() {
      if (!rt.storm || !rt.storm.active) return 0;
      const left = rt.storm.endsAt - rt.t, into = storm.durationSec - left;
      return Math.max(0, Math.min(1, into / 3, left / 3));
    },
    // Tide: -1 (low) .. 1 (high). Starts at mean level, rising.
    tideLevel() { return rt.tide ? Math.sin((rt.t / rt.tide.cycle) * Math.PI * 2) : 0; },
    seaOffset() { return rt.tideLevel() * TIDE_AMPLITUDE; },
    tidePhase() {
      if (!rt.tide) return null;
      const lv = rt.tideLevel(), rising = Math.cos((rt.t / rt.tide.cycle) * Math.PI * 2) > 0;
      if (lv > 0.7) return 'high';
      if (lv < -0.7) return 'low';
      return rising ? 'rising' : 'ebbing';
    },
    // A node is underwater when the sea is above its ground (only matters on tidal planets).
    isSubmerged(groundY, seaY = 0) { return !!rt.tide && groundY < seaY + rt.seaOffset(); },
    update(dt) {
      rt.t += dt;
      const events = [];
      if (rt.storm) {
        const s = rt.storm;
        if (!s.active && rt.t >= s.nextAt) { s.active = true; s.endsAt = rt.t + storm.durationSec; events.push('stormStart'); }
        else if (s.active && rt.t >= s.endsAt) { s.active = false; s.nextAt = rt.t + nextGap(); events.push('stormEnd'); }
      }
      if (rt.tide) {
        const ph = rt.tidePhase();
        if (ph !== rt._lastTide) { if (rt._lastTide) events.push('tide:' + ph); rt._lastTide = ph; }
      }
      return events;
    },
  };
  return rt;
}

// Sites newly within the discovery radius. discovered: Set of site ids (mutated).
export function discoverSites(sites, x, z, radius, discovered) {
  const found = [];
  for (const s of sites) {
    if (s.lone || discovered.has(s.id)) continue;
    if (Math.hypot(s.x - x, s.z - z) <= radius) { discovered.add(s.id); found.push(s); }
  }
  return found;
}

// Singing Crystals: nearest undiscovered (non-lone) site within range, with distance and bearing.
export function crystalCompass(sites, x, z, rangeM, discovered) {
  let best = null;
  for (const s of sites) {
    if (s.lone || discovered.has(s.id)) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d <= rangeM && (!best || d < best.d)) best = { site: s, d, angle: Math.atan2(s.x - x, s.z - z) };
  }
  return best;
}
