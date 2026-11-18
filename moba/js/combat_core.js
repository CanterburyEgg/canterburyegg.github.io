// Shared combat core (SHOP_IMPL_PLAN.md Phase 0): one place for damage mitigation, healing and the event bus that
// item passives hook into. Loaded after cc.js, before the hero kits and the engine.
//
//   Combat.hitInfo(attacker, opts)      normalised description of a hit:
//                                       { attacker, src: 'attack' | 'ability', isBasic, isDoT, aoe, castId }
//                                       (src rule, DESIGN_RULES §2: opts.src wins, else basic attacks are Attack damage
//                                       and everything else is Ability damage; units without a kit always hit with Attack)
//   Combat.mitigate(raw, resist, info, target)   damage after Resist (pen / shred / wards plug in here later)
//   Combat.heal(unit, amount, info)     every heal goes through here (anti-heal plugs in here later); returns HP gained
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
    mitigate(raw, resist, info, target) {
      return raw * (100 / (100 + Math.max(0, resist || 0)));
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
