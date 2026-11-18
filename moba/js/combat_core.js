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
//   Combat.on(evt, fn) / off / emit     event bus: 'hit' { attacker, target, targetObj, raw, dealt, info } fires after
//                                       any damage lands (player, bots, minions, camps, towers)
(function () {
  'use strict';
  const listeners = {};
  const Combat = {
    hitInfo(attacker, opts) {
      const o = opts || {};
      const isBasic = !!o.isBasic;
      return {
        attacker: attacker || null,
        src: o.src === 'attack' || o.src === 'ability' ? o.src : (isBasic ? 'attack' : 'ability'),
        isBasic,
        isDoT: !!o.isDoT,
        aoe: !!o.aoe,
        castId: o.castId || null
      };
    },
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
      for (let i = 0; i < Combat.damageMults.length; i++) dmg *= Combat.damageMults[i](info, target, info && info.attacker);
      return dmg;
    },
    // healing multiplier on a unit (1 = full healing)
    healMult(u, info) {
      return 1;
    },
    heal(u, amount, info) {
      if (!u || !(amount > 0) || !(u.maxHp > 0)) return 0;
      const before = u.hp;
      u.hp = Math.min(u.maxHp, u.hp + amount * Combat.healMult(u, info));
      return Math.max(0, u.hp - before);
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
