// Shared combat core (SHOP_IMPL_PLAN.md Phase 0): one place for damage mitigation, healing and the event bus that
// item passives hook into. Loaded after cc.js, before the hero kits and the engine.
//
//   Combat.hitInfo(attacker, opts)      normalised description of a hit:
//                                       { attacker, src: 'attack' | 'ability', isBasic, isDoT, aoe, castId }
//                                       (src rule, DESIGN_RULES §2: opts.src wins, else basic attacks are Attack damage
//                                       and everything else is Ability damage; units without a kit always hit with Attack)
//   Combat.mitigate(raw, resist, info, target)   damage after Resist (pen / shred / wards plug in here later)
//   Combat.heal(unit, amount, info)     every heal goes through here (anti-heal plugs in here later); returns HP gained
//   Combat.statsOf(unit)                a unit's current stats (set by the engine; null for minions / camps / towers)
//   Combat.atkInterval(baseCd, st, asScale)   seconds between basic attacks: stat attack speed is hard-capped at
//                                       2.5 attacks/s; passive attack speed (st.passiveAsPct, % of the BASE rate) goes on
//                                       top, up to an absolute 3.5/s (DESIGN_RULES §2, SHOP_PLAN 'Attack speed cap')
//   Combat.preHit(target, dealt, info)  mitigated damage a hero unit keeps after Redirect + talent saves
//   Combat.talentOf(unit, tier)         'L' | 'R' | null (set by the engine; player and bots)
//   Combat.on(evt, fn) / off / emit     event bus: 'hit' { attacker, target, targetObj, raw, dealt, info } fires after
//                                       any damage lands (player, bots, minions, camps, towers)
(function () {
  'use strict';
  const listeners = {};
  const Combat = {
    // The cast running right now (set by the engine's cast wrapper while a kit's cast code runs): { id, unit, slot }.
    // Hits made during it are tagged with its id; delayed hits (projectiles, zones, pending strikes) carry the id the
    // kit stored when it created them (KitFx.castId()).
    currentCast: null,
    casts: {}, // id -> { unit, slot, t } for casts that fired (recent ones only)
    nextCastId: 1,
    hitInfo(attacker, opts) {
      const o = opts || {};
      const isBasic = !!o.isBasic;
      const cur = Combat.currentCast;
      return {
        attacker: attacker || null,
        src: o.src === 'attack' || o.src === 'ability' ? o.src : (isBasic ? 'attack' : 'ability'),
        isBasic,
        isDoT: !!o.isDoT,
        aoe: !!o.aoe,
        castId: o.castId || (!isBasic && cur && cur.unit === attacker ? cur.id : null),
        proc: !!o.proc,             // item damage (never triggers other on-hit passives)
        passiveTick: !!o.passiveTick, // a passive's damage over time (e.g. Coyote's bleed): not an ability
        redirected: !!o.redirected,  // damage moved to a Redirect holder (not redirected again)
        structMult: o.structMult > 0 ? o.structMult : 1 // extra damage multiplier vs structures (Imp demolition talents)
      };
    },
    // engine hook (item passives): part of a hero's mitigated damage moved to an ally; returns what the target keeps
    redirectShare(target, dealt, info) { return dealt; },
    // Last step before mitigated damage lands on a hero unit: Redirect, then talent saves (Bodyguard Last Stand).
    // Each save is fn(target, dealt, info) -> what the target keeps (0 = the whole hit was taken elsewhere).
    saves: [],
    preHit(target, dealt, info) {
      let d = Combat.redirectShare(target, dealt, info);
      for (let i = 0; i < Combat.saves.length && d > 0; i++) d = Combat.saves[i](target, d, info);
      return d;
    },
    // engine hook (Spell shield): true = this hit (and its CC) is blocked
    blocks(info, target) { return false; },
    // untargetable (Bodyguard Last Stand): no damage, no CC, dropped from target lists
    untargetable(u) { return !!u && (u.untargetableUntil || 0) > (window.KitFx ? window.KitFx.time : 0); },
    // engine hook: the talent a hero unit has taken at a tier ('L' | 'R'), or null (not taken yet / not reached)
    talentOf(u, tier) { return null; },
    // engine hook: is this a hero unit (player or bot)?
    isHero(u) { return false; },
    // engine hook: is this a structure (tower / gatehouse / hearth)?
    isStructure(u) { return false; },
    // engine hook: can this structure be damaged right now (outer towers first)?
    structureVulnerable(u) { return true; },
    // kit vision (engine reads it): fn(team) -> [{ x, z, r }]
    visionSources: [],
    // hits from minions, camps and towers: plain basic attacks
    unitHitInfo(attacker, isDoT) {
      return { attacker: attacker || null, src: 'attack', isBasic: true, isDoT: !!isDoT, aoe: false, castId: null };
    },
    // engine hook: current stats of a unit (player hero / bot), or null
    statsOf(u) { return null; },
    statOf(u, key) { const st = u ? Combat.statsOf(u) : null; return (st && st[key]) || 0; },
    // engine / item hooks (js/item_passives.js fills these in): % penetration of an attacker for a damage source,
    // and extra damage multipliers (wards, Weakness, Exposed, ...)
    penOf(attacker, src) { return 0; },
    damageMults: [], // fn(info, target, attacker) -> multiplier
    ATK_CAP: 2.5,
    ATK_MAX: 3.5,
    atkInterval(baseCd, st, asScale) {
      const base = baseCd > 0 ? baseCd : 1;
      const asPct = ((st && st.asPct) || 0) * (asScale === undefined ? 1 : asScale);
      const statRate = Math.min(Combat.ATK_CAP, (1 + asPct) / base);
      const rate = Math.min(Combat.ATK_MAX, statRate + ((st && st.passiveAsPct) || 0) / base);
      return 1 / rate;
    },
    // true when stat attack speed is at the cap (shop shows "(max)")
    atkCapped(baseCd, st) {
      return (1 + ((st && st.asPct) || 0)) / (baseCd > 0 ? baseCd : 1) >= Combat.ATK_CAP - 1e-6;
    },
    // Resist after flat shred (target._resShred), then % penetration (reduced by the target's penetration resistance)
    effectiveResist(resist, info, target) {
      const shred = (target && target._resShred) || 0;
      let res = Math.max(0, (resist || 0) - shred);
      const pen = info && info.attacker ? Combat.penOf(info.attacker, info.src) : 0;
      if (pen > 0) res *= 1 - pen * (1 - Math.min(1, Combat.statOf(target, 'penResist')));
      return res;
    },
    mitigate(raw, resist, info, target) {
      let dmg = raw * (100 / (100 + Combat.effectiveResist(resist, info, target)));
      if (info && info.structMult !== 1 && info.structMult > 0 && Combat.isStructure(target)) dmg *= info.structMult;
      for (let i = 0; i < Combat.damageMults.length; i++) dmg *= Combat.damageMults[i](info, target, info && info.attacker);
      return dmg;
    },
    // healing multiplier on a unit (1 = full healing)
    healMult(u, info) {
      return 1;
    },
    // a shield someone gives a unit (info.healer = who): Wellspring makes shields on allies stronger
    shieldAmount(u, amount, info) { return amount * Combat.shieldMult(u, info); },
    shieldMult(u, info) { return 1; },
    heal(u, amount, info) {
      if (!u || !(amount > 0) || !(u.maxHp > 0)) return 0;
      const before = u.hp;
      const amt = amount * Combat.healMult(u, info);
      u.hp = Math.min(u.maxHp, u.hp + amt);
      const gained = Math.max(0, u.hp - before);
      if (amt - gained > 0.01) Combat.emit('overheal', { unit: u, extra: amt - gained, info }); // healing past full HP
      return gained;
    },
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return fn; },
    off(evt, fn) { const l = listeners[evt]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
    emit(evt, payload) {
      const l = listeners[evt];
      if (!l || !l.length) return;
      for (let i = 0; i < l.length; i++) l[i](payload);
    }
  };
  window.MOBA_COMBAT = Combat;
})();
