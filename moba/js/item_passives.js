// Item passives (SHOP_IMPL_PLAN.md Phase 3). Each epic's passive id (js/items.js) maps to a definition here.
// Works for every hero unit (the player and bots) through a small engine adapter (setEngine, called by the engine).
//
// A definition can have:
//   static(st, p, items)            stats that only depend on what you own (Mana engine, Amplifier); runs in computeUnitStats
//   dynamic(u, st, p, S)            per-frame stat changes from stacks / buffs / auras; S = this unit's state for the passive
//   aura(holder, ally, st, p)       stat changes an ally (holder included) gets while within p.range of the holder
//   hitDealt(e, p, S) / hitTaken(e, p, S)   after a hit lands (e = Combat 'hit' event; e.info.proc = item damage)
//   pen(src, p)                     % penetration for a damage source ('attack' | 'ability')
//   takenMult(info, p, S)           damage multiplier on hits you take (wards)
//   cast(u, slot, p, S)             after you cast an ability (Q / E / R)
//   kill(u, e, p, S, role)          a hero died: role 'killer' or 'assist'
//   tick(u, dt, p, S)
// Item damage (procs) goes through E.proc(attacker, targetObj, amount, src) with info.proc = true, so procs never
// trigger other on-hit passives.
window.MOBA_ITEM_PASSIVES = (function () {
  'use strict';
  const Combat = window.MOBA_COMBAT;
  let E = null; // engine adapter
  const now = () => (E ? E.now() : 0);

  // ---- per-unit bookkeeping ----
  function state(u) { return u._ip || (u._ip = { by: {}, buffs: [], items: null, list: [] }); }
  function passivesOf(u) {
    const items = E ? E.itemsOf(u) : null;
    const s = state(u);
    if (s.items !== items || s.n !== (items ? items.length : 0)) {
      s.items = items; s.n = items ? items.length : 0;
      s.list = (items || []).filter((it) => it && it.passive && DEFS[it.passive.id]).map((it) => ({ id: it.passive.id, def: DEFS[it.passive.id], p: it.passive.params || {} }));
    }
    return s.list;
  }
  function S(u, id) { const s = state(u); return s.by[id] || (s.by[id] = {}); }
  function each(u, fnName, cb) {
    if (!u) return;
    const list = passivesOf(u);
    for (let i = 0; i < list.length; i++) if (list[i].def[fnName]) cb(list[i]);
  }
  // timed stat buff on a unit: { key, amount, until, tag } (one per tag: re-adding refreshes it)
  function buff(u, tag, stats, dur) {
    const s = state(u);
    const b = s.buffs.find((x) => x.tag === tag);
    if (b) { b.stats = stats; b.until = now() + dur; } else s.buffs.push({ tag, stats, until: now() + dur });
  }
  // multiplicative timed change (Wither: Attack x0.95 per stack)
  function multBuff(u, tag, mult, dur) {
    const s = state(u);
    const b = s.buffs.find((x) => x.tag === tag);
    if (b) { b.mult = mult; b.stats = {}; b.until = now() + dur; } else s.buffs.push({ tag, stats: {}, mult, until: now() + dur });
  }
  // Weakness stacks right now: all of them for 4s after the last refresh, then one falls off per second
  function weakStacks(t) {
    const w = t && t._weak;
    if (!w) return 0;
    const late = now() - w.t - w.dur;
    return late <= 0 ? w.n : Math.max(0, w.n - Math.ceil(late / WEAK_DECAY));
  }
  const WEAK_DECAY = 1;
  const bonusHp = (u) => (E.itemsOf(u) || []).reduce((a, it) => a + ((it.stats && it.stats.maxHp) || 0), 0);
  const HARD = { minion: true, camp: true };
  function hasBuff(u, tag) { const b = state(u).buffs.find((x) => x.tag === tag); return !!(b && b.until > now()); }
  // item shield: adds to the unit's shield and takes back whatever is left of it when it expires
  function addShield(u, amount, dur, tag) {
    if (!(amount > 0)) return;
    const s = state(u);
    s.shields = s.shields || {};
    const old = s.shields[tag];
    if (old) u.shield = Math.max(0, (u.shield || 0) - Math.min(u.shield || 0, old.left));
    u.shield = (u.shield || 0) + amount;
    s.shields[tag] = { left: amount, until: now() + dur };
  }
  function tickShields(u) {
    const s = state(u);
    if (!s.shields) return;
    for (const tag in s.shields) {
      const sh = s.shields[tag];
      sh.left = Math.min(sh.left, u.shield || 0); // damage soaks the shield; never take back more than is left
      if (now() >= sh.until) { u.shield = Math.max(0, (u.shield || 0) - sh.left); delete s.shields[tag]; }
    }
  }
  const since = (t) => (typeof t === 'number' ? t : -1e9); // a timestamp, or 'long ago' if never set
  const pctHp = (u) => (u.maxHp > 0 ? u.hp / u.maxHp : 1);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // ================= definitions =================
  const DEFS = {
    // ---- Batch 1: double epics ----
    warmog: {
      tick(u, dt, p) { if (now() - since(u._lastHurtAt) >= p.delay && u.hp < u.maxHp && u.hp > 0) Combat.heal(u, u.maxHp * p.pctPerSec * dt, { item: true }); }
    },
    redirect: {}, // handled in redirectShare (needs the hit before it lands)
    manaEngine: {
      static(st, p, items) {
        const bonusMana = items.reduce((a, it) => a + ((it.stats && it.stats.maxMp) || 0), 0);
        st.ability += bonusMana * p.abilityPerBonusMana;
        st.maxHp += bonusMana * p.hpPerBonusMana;
      }
    },
    manaShield: {
      hitTaken(e, p, s) {
        const u = e.target;
        if (u.hp <= 0 || pctHp(u) >= p.hpPct || now() < (s.readyAt || 0)) return;
        s.readyAt = now() + p.cd;
        addShield(u, p.base + p.manaPct * E.mana(u), p.dur, 'manaShield');
        E.fx(u, 'MANA SHIELD', '#38bdf8');
      }
    },
    overheal: {
      // lifesteal healing past full HP becomes a shield (Combat 'overheal' event below), drained 5s out of combat
      tick(u, dt, p, s) {
        const sh = state(u).shields && state(u).shields.overheal;
        if (sh && now() - since(u._lastCombatAt) >= p.drainAfter) sh.until = now();
      }
    },
    attackPen: { pen(src, p) { return src === 'attack' ? p.pen : 0; } },
    abilityPen: { pen(src, p) { return src === 'ability' ? p.pen : 0; } },
    amplifier: { static(st, p) { st.ability *= 1 + p.abilityMult; }, order: 9 },
    attackWard: { takenMult(info, p) { return info.src === 'attack' ? 1 - p.cut : 1; } },
    abilityWard: { takenMult(info, p) { return info.src === 'ability' ? 1 - p.cut : 1; } },
    ricochet: {
      hitDealt(e, p) {
        if (!e.info.isBasic || e.info.proc || !(e.raw > 0)) return;
        const a = e.attacker;
        const amount = e.raw * p.pct;
        const hits = new Map([[e.target, 1]]); // the attack's own target counts once
        let from = e.target;
        for (let n = 0; n < p.bounces; n++) {
          // bounce to the nearest other enemy that hasn't been hit twice by this attack (can come back to one hit once)
          const next = E.enemiesOf(a).filter((t) => t.ref !== from && (hits.get(t.ref) || 0) < p.maxPerTarget && t.kind !== 'structure' && dist(t, from) <= p.range)
            .sort((x, y) => dist(x, from) - dist(y, from))[0];
          if (!next) break;
          hits.set(next.ref, (hits.get(next.ref) || 0) + 1);
          E.proc(a, next, amount, 'attack', { color: '#facc15' });
          E.zap(from, next.ref, 0xfacc15);
          from = next.ref;
        }
      }
    },
    frenzy: {
      hitDealt(e, p, s) {
        if (!e.info.isBasic || e.info.proc) return;
        const t = now();
        if (s.target !== e.target || t - (s.first || 0) > p.window) { s.target = e.target; s.first = t; s.count = 0; }
        s.count++;
        if (s.count >= p.hits && t >= (s.readyAt || 0)) {
          s.readyAt = t + p.cd; s.count = 0;
          buff(e.attacker, 'frenzy', { passiveAsPct: p.asPct, spdPct: p.spdPct }, p.dur);
          E.fx(e.attacker, 'FRENZY', '#facc15');
        }
      }
    },
    reset: {
      kill(u, e, p, s, role) {
        const pct = role === 'killer' ? p.killPct : p.assistPct;
        if (window.KitFx) window.KitFx.reduceCooldowns(u, { pct, ult: true });
        E.fx(u, role === 'killer' ? 'RESET -30%' : 'RESET -15%', '#a78bfa');
      }
    },
    ultFollowUp: {
      cast(u, slot, p) { if (slot === 'R') buff(u, 'ultFollowUp', { haste: p.haste }, p.dur); }
    },

    // ---- Batch 2: HP pairs ----
    lifeblood: {
      tick(u, dt, p, s) {
        const t = now();
        if (!s.until && pctHp(u) < p.hpPct && t >= (s.readyAt || 0) && E.mana(u) >= E.maxMana(u) * p.stopManaPct) {
          s.until = t + p.dur; s.readyAt = t + p.cd;
          E.fx(u, 'LIFEBLOOD', '#f43f5e');
        }
        if (s.until) {
          if (t >= s.until || u.hp >= u.maxHp || E.mana(u) < E.maxMana(u) * p.stopManaPct) { s.until = 0; return; }
          Combat.heal(u, u.maxHp * p.healPctPerSec * dt, { item: true });
          E.spendMana(u, p.manaPerSec * dt);
        }
      }
    },
    wellspring: {}, // Combat.healMult below (heals on allies) + mana per heal
    cleaver: {
      hitDealt(e, p, s) {
        if (!e.info.isBasic || e.info.proc || !(e.raw > 0)) return;
        const a = e.attacker;
        E.enemiesOf(a).forEach((t) => {
          if (t.ref !== e.target && t.kind !== 'structure' && dist(t, e.target) <= p.splashR) E.proc(a, t, e.raw * p.splashPct, 'attack', { color: '#fbbf24' });
        });
        if (now() >= (s.readyAt || 0)) {
          s.readyAt = now() + p.every;
          E.proc(a, e.targetObj, a.maxHp * p.bonusPctMaxHp, 'attack', { color: '#fbbf24' });
        }
      }
    },
    weakness: {
      hitDealt(e, p) {
        if (e.info.src !== 'attack' || e.info.proc || !e.target) return;
        const n = weakStacks(e.target);
        e.target._weak = { n: Math.min(p.maxStacks, n + 1), t: now(), per: p.perStack, dur: p.dur };
      }
    },
    frostTouched: {
      hitDealt(e, p) {
        if (e.info.src !== 'ability' || e.info.proc || e.targetObj.kind === 'structure' || !(e.dealt > 0)) return;
        window.CC.slow(e.target, p.dur, e.info.aoe ? p.aoeSlow : p.slow);
      }
    },
    immolate: {
      tick(u, dt, p, s) {
        s.t = (s.t || 0) + dt;
        if (s.t < 1) return;
        s.t -= 1;
        const dmg = p.base + p.bonusHpPct * bonusHp(u);
        E.enemiesOf(u).forEach((t) => { if (t.kind !== 'structure' && dist(t, u) <= p.range + (t.r || 0.5)) E.proc(u, t, dmg, 'ability', { isDoT: true, aoe: true, color: '#fb923c' }); });
      }
    },
    adaptiveGuard: {
      hitTaken(e, p, s) {
        if (e.info.proc || !(e.dealt > 0)) return;
        const t = now();
        if (e.info.src === 'attack') s.atkAt = t; else s.abAt = t;
        if (t < (s.readyAt || 0) || t - since(s.atkAt) > p.window || t - since(s.abAt) > p.window) return;
        s.readyAt = t + p.cd; s.resUntil = t + p.resistDur;
        addShield(e.target, p.shieldBase + p.shieldPctHp * e.target.maxHp, p.resistDur, 'adaptiveGuard');
        E.fx(e.target, 'ADAPTIVE GUARD', '#a3e635');
      },
      dynamic(u, st, p, s) { const left = since(s.resUntil) - now(); if (left > 0) st.resist += p.resist * (left / p.resistDur); }
    },
    wither: {
      hitTaken(e, p) {
        const a = e.attacker;
        if (!a || e.info.src !== 'ability' || e.info.proc || e.info.isDoT || !E.isHero(a)) return;
        const w = a._wither && now() - a._wither.t <= p.dur ? a._wither.n : 0;
        const n = Math.min(p.maxStacks, w + 1);
        a._wither = { n, t: now() };
        const m = 1 - p.perStack * n;
        multBuff(a, 'wither', { attack: m, ability: m }, p.dur);
      }
    },
    bulwarkBreaker: {
      hitDealt(e, p) {
        if (!e.info.isBasic || e.info.proc || e.targetObj.kind === 'structure' || !(e.target.maxHp > 0)) return;
        let dmg = e.target.maxHp * p.pctMaxHp;
        if (HARD[e.targetObj.kind]) dmg = Math.min(dmg, p.monsterCap);
        E.proc(e.attacker, e.targetObj, dmg, 'attack', { color: '#f97316' });
      }
    },
    lastStand: {
      dynamic(u, st, p) { if (pctHp(u) < p.hpPct) st.passiveAsPct = (st.passiveAsPct || 0) + p.asPct; },
      hitDealt(e, p) {
        if (!e.info.isBasic || e.info.proc || pctHp(e.attacker) >= p.hpPct) return;
        Combat.heal(e.attacker, e.attacker.maxHp * p.healPctMaxHp, { item: true });
      }
    },
    exposed: {}, // CC hook below: hard CC from the holder marks the target
    battleRhythm: {
      hitTaken(e, p, s) {
        const a = e.attacker;
        if (!a || !E.isHero(a) || e.info.isDoT || e.info.proc || now() < (s.readyAt || 0)) return;
        s.readyAt = now() + p.icd;
        if (window.KitFx) window.KitFx.reduceCooldowns(e.target, { seconds: p.cdCut });
      }
    },

    // ---- Batch 3: Mana pairs ----
    manaForged: {
      hitDealt(e, p) {
        const a = e.attacker;
        if (!e.info.isBasic || e.info.proc || !E.isHero(e.target) || E.mana(a) < E.maxMana(a) * p.stopManaPct) return;
        E.spendMana(a, p.cost);
        E.proc(a, e.targetObj, p.base + p.maxManaPct * E.maxMana(a), 'attack', { color: '#60a5fa' });
      }
    },
    essence: {
      hitDealt(e, p) {
        if (!e.info.isBasic || e.info.proc || !E.isHero(e.target)) return;
        E.addMana(e.attacker, p.mana);
        if (window.KitFx) window.KitFx.reduceCooldowns(e.attacker, { seconds: p.cdCut });
      }
    },
    overcharge: {
      manaMult(p) { return 1 + p.extraCost; },
      cast(u, slot, p, s, id) { castRec(s, id).extra = E.manaCost(u, slot) * p.extraCost; },
      hitDealt(e, p, s) {
        const c = hitCast(e, s);
        if (!c || !(c.extra > 0) || c.hit.has(e.target)) return;
        c.hit.add(e.target);
        E.proc(e.attacker, e.targetObj, c.extra * p.dmgPerExtraMana, 'ability', { color: '#818cf8' });
      }
    },
    soulHarvest: {}, // death hook below
    wardAura: { aura(h, ally, st, p) { st.resist += p.resist; } },
    barbedWard: {
      hitTaken(e, p) {
        const a = e.attacker;
        if (!a || e.info.proc || e.info.isDoT) return;
        a._antiHealUntil = now() + p.dur; a._antiHealPct = p.antiHeal;
      }
    },
    woundingStrikes: {
      hitDealt(e, p) {
        if (!e.info.isBasic || e.info.proc || e.targetObj.kind === 'structure') return;
        e.target._antiHealUntil = now() + p.dur; e.target._antiHealPct = p.antiHeal;
      }
    },
    manaTap: {
      hitDealt(e, p) { if (e.info.isBasic && !e.info.proc) E.addMana(e.attacker, E.isHero(e.target) ? p.heroMana : p.mana); }
    },
    momentum: {
      manaMult(p, s) { return now() - since(s.last) <= p.dropAfter ? 1 - p.perStack * (s.n || 0) : 1; },
      cast(u, slot, p, s) {
        if (now() - since(s.last) > p.dropAfter) s.n = 0;
        s.n = Math.min(p.maxStacks, (s.n || 0) + 1); s.last = now();
      }
    },
    flowState: { dynamic(u, st, p) { if (E.mana(u) >= E.maxMana(u) * p.manaPct) st.haste += p.haste; } },

    // ---- Batch 4: Attack pairs ----
    equilibrium: {
      cast(u, slot, p, s, id) { castRec(s, id); },
      hitDealt(e, p, s) {
        if (e.info.proc || e.info.passiveTick || !(e.dealt > 0)) return;
        if (!e.info.isBasic) {
          const c = hitCast(e, s);
          if (!c || c.hit.has(e.target)) return;
          c.hit.add(e.target);
        }
        const st = Combat.statsOf(e.attacker);
        if (!st) return;
        E.proc(e.attacker, e.targetObj, p.pctOfLower * Math.min(st.attack, st.ability), e.info.src, { color: '#e879f9' });
      }
    },
    crossover: {
      // While ready, casts and basic attacks run with the weaker of Attack / Ability raised to the stronger one
      // (engine wrapper sets u._crossoverOn; dynamic() below does the swap). The first hit of your weaker damage
      // type spends it (5s cooldown).
      dynamic(u, st, p, s) {
        if (!u._crossoverOn) return;
        const hi = Math.max(st.attack, st.ability);
        st.attack = hi; st.ability = hi;
      },
      hitDealt(e, p, s) {
        if (e.info.proc || e.info.passiveTick || now() < (s.readyAt || 0)) return;
        const st = Combat.statsOf(e.attacker);
        if (!st || e.info.src !== s.weak) return;
        s.readyAt = now() + p.cd;
        E.fx(e.attacker, 'CROSSOVER', '#e879f9');
      },
      tick(u, dt, p, s) {
        // which type is weaker, judged without the swap
        const b = E.baseStats(u);
        if (b) s.weak = b.attack < b.ability ? 'attack' : 'ability';
      }
    },
    frostbitePlate: {
      hitTaken(e, p) {
        const a = e.attacker;
        if (!a || e.info.proc || e.info.isDoT || !(a.hp > 0)) return;
        if (a.spd !== undefined || E.isHero(a)) window.CC.slow(a, p.dur, p.spdSlow);
        if (E.isHero(a)) buff(a, 'frostbite', { asPct: -p.asSlow }, p.dur);
        else { a._asSlowUntil = now() + p.dur; a._asSlowPct = p.asSlow; }
      }
    },
    grudge: {
      hitDealt(e, p, s) {
        if (e.info.proc || !E.isHero(e.target)) return;
        if (s.target !== e.target || now() - since(s.last) > p.dropAfter) { s.target = e.target; s.n = 0; }
        s.n = Math.min(p.maxStacks, (s.n || 0) + 1); s.last = now();
      },
      dynamic(u, st, p, s) { if (s.n && now() - since(s.last) <= p.dropAfter) st.attack *= 1 + p.perStack * s.n; }
    },
    longshot: {
      dynamic(u, st, p) { if (E.isRanged(u)) st.rangePct = (st.rangePct || 0) + p.rangePct; }
    },
    windUp: {
      hitDealt(e, p, s) {
        if (!e.info.isBasic || e.info.proc) return;
        if (now() - since(s.last) > p.dropAfter) s.n = 0;
        s.n = Math.min(p.maxStacks, (s.n || 0) + 1); s.last = now();
      },
      dynamic(u, st, p, s) { if (s.n && now() - since(s.last) <= p.dropAfter) st.passiveAsPct = (st.passiveAsPct || 0) + p.perStack * s.n; }
    },
    temperedSpells: {
      cast(u, slot, p, s, id) { castRec(s, id); },
      hitDealt(e, p, s) {
        const c = hitCast(e, s);
        if (!c || c.used) return;
        c.used = true;
        const st = Combat.statsOf(e.attacker);
        if (st) E.proc(e.attacker, e.targetObj, p.pctAttack * st.attack, 'attack', { color: '#fca5a5' });
      }
    },
    ambush: {
      tick(u, dt, p, s) { if (E.isUnseen(u)) s.unseenAt = now(); },
      hitDealt(e, p, s) {
        const a = e.attacker;
        if (e.info.proc || now() < (s.readyAt || 0)) return;
        if (!E.isUnseen(a) && now() - since(s.unseenAt) > p.grace) return;
        s.readyAt = now() + p.cd;
        const st = Combat.statsOf(a);
        E.proc(a, e.targetObj, p.base + p.pctAttack * ((st && st.attack) || 0), 'attack', { color: '#a3e635' });
        E.fx(a, 'AMBUSH', '#a3e635');
      }
    },

    // ---- Batch 5: Ability pairs ----
    spellShield: {}, // Combat.blocks below
    bulwarkCasting: {
      cast(u, slot, p, s) {
        s.stacks = (s.stacks || []).filter((t) => t > now());
        if (s.stacks.length >= p.maxStacks) s.stacks.shift();
        s.stacks.push(now() + p.dur);
      },
      dynamic(u, st, p, s) { if (s.stacks) st.resist += p.resist * s.stacks.filter((t) => t > now()).length; }
    },
    hexedStrikes: {
      hitDealt(e, p) {
        if (!e.info.isBasic || e.info.proc) return;
        const st = Combat.statsOf(e.attacker);
        E.proc(e.attacker, e.targetObj, p.base + p.pctAbility * ((st && st.ability) || 0), 'ability', { color: '#c084fc' });
      }
    },
    staticCharge: {
      hitDealt(e, p, s) {
        if (!e.info.isBasic || e.info.proc) return;
        s.n = (s.n || 0) + 1;
        if (s.n <= p.hits) return;
        s.n = 0;
        const a = e.attacker, st = Combat.statsOf(a);
        const dmg = p.base + p.pctAbility * ((st && st.ability) || 0);
        E.proc(a, e.targetObj, dmg, 'ability', { color: '#38bdf8' });
        const done = new Set([e.target]);
        let from = e.target;
        for (let n = 0; n < p.jumps; n++) {
          const next = E.enemiesOf(a).filter((t) => !done.has(t.ref) && t.kind !== 'structure' && dist(t, from) <= p.range)
            .sort((x, y) => dist(x, from) - dist(y, from))[0];
          if (!next) break;
          done.add(next.ref);
          E.proc(a, next, dmg, 'ability', { color: '#38bdf8', aoe: true });
          E.zap(from, next.ref, 0x38bdf8);
          from = next.ref;
        }
      }
    },
    spellCadence: {
      cast(u, slot, p, s, id) { castRec(s, id).slot = slot; },
      hitDealt(e, p, s) {
        const c = hitCast(e, s);
        if (!c || !c.slot) return;
        const t = now();
        s.per = s.per || new Map();
        const rec = s.per.get(e.target) || { slots: {}, readyAt: 0 };
        rec.slots[c.slot] = t;
        s.per.set(e.target, rec);
        const recent = Object.keys(rec.slots).filter((k) => t - rec.slots[k] <= p.window);
        if (recent.length >= p.abilities && t >= rec.readyAt) {
          rec.readyAt = t + p.cd; rec.slots = {};
          const st = Combat.statsOf(e.attacker);
          E.proc(e.attacker, e.targetObj, p.base + p.pctAbility * ((st && st.ability) || 0), 'ability', { color: '#f0abfc' });
          E.fx(e.target, 'CADENCE', '#f0abfc');
        }
      }
    },
    accumulation: {
      cast(u, slot, p, s, id) { castRec(s, id); },
      hitDealt(e, p, s) {
        const c = hitCast(e, s);
        if (!c || c.counted) return;
        if (!E.isHero(e.target) && e.targetObj.kind !== 'camp') return;
        c.counted = true;
        s.count = (s.count || 0) + 1;
        if (s.count % p.every === 0) s.bonus = Math.min(p.cap, (s.bonus || 0) + p.ability);
      },
      dynamic(u, st, p, s) { if (s.bonus) st.ability += s.bonus; }
    },

    // ---- Batch 6: Resist + attack speed / Haste pairs ----
    retort: {
      hitTaken(e, p, s) {
        if (e.info.proc || !(e.raw > 0)) return;
        const res = Math.max(0, E.resistOf(e.target));
        const prevented = e.raw - e.raw * 100 / (100 + res);
        s.stored = Math.min(p.capBase + p.capPerResist * res, (s.stored || 0) + prevented * p.storePct);
        if (!s.lastAtk) s.lastAtk = now();
      },
      hitDealt(e, p, s) {
        if (!e.info.isBasic || e.info.proc) return;
        s.lastAtk = now();
        if (s.stored > 0) { const amt = s.stored; s.stored = 0; E.proc(e.attacker, e.targetObj, amt, 'attack', { color: '#fde68a' }); }
      },
      tick(u, dt, p, s) { if (s.stored > 0 && now() - since(s.lastAtk) > p.dropAfter) { s.stored = 0; s.lastAtk = 0; } }
    },
    siphonPlating: {
      hitDealt(e, p, s) {
        if (!e.info.isBasic || e.info.proc || !E.isHero(e.target)) return;
        s.on = s.on || new Map();
        const cur = s.on.get(e.target);
        const n = cur && cur.until > now() ? cur.n : 0;
        s.on.set(e.target, { n: Math.min(p.maxStacks, n + 1), until: now() + p.dur, per: p.steal });
      },
      dynamic(u, st, p, s) {
        if (!s.on) return;
        let total = 0;
        s.on.forEach((v, t) => { if (v.until > now()) total += v.n; else s.on.delete(t); });
        st.resist += p.steal * total;
      }
    },
    steadfastAura: { aura(h, ally, st, p) { st.tenacity = 1 - (1 - (st.tenacity || 0)) * (1 - p.tenacity); } },
    shrugOff: {}, // CC hook below
    snapBack: { cast(u, slot) { E.resetAttack(u); } },
    battleTempo: { cast(u, slot, p) { buff(u, 'battleTempo', { passiveAsPct: p.asPct }, p.dur); } }
  };
  // ---- once-per-cast bookkeeping: each passive keeps a small record per cast id (s.casts) ----
  function castRec(s, id) {
    s.casts = s.casts || new Map();
    let c = s.casts.get(id);
    if (!c) {
      c = { hit: new Set(), t: now() };
      s.casts.set(id, c);
      s.lastId = id;
      if (s.casts.size > 12) s.casts.delete(s.casts.keys().next().value); // keep recent casts only
    }
    return c;
  }
  // the cast record an ability hit belongs to (its cast id; untagged hits fall back to your latest cast within 3s)
  function hitCast(e, s) {
    // a hit tagged with a cast id came from that cast (abilities that count as basic attacks too); untagged ones only
    // count if they're Ability damage
    if (e.info.proc || e.info.passiveTick || !s.casts) return null;
    if (!e.info.castId && (e.info.src !== 'ability' || e.info.isBasic)) return null;
    const id = e.info.castId || (s.lastId && now() - s.casts.get(s.lastId).t <= CAST_WINDOW ? s.lastId : null);
    return id ? s.casts.get(id) || null : null;
  }
  const CAST_WINDOW = 3;

  // ---- static stats (computeUnitStats): Mana engine before Amplifier ----
  function applyStatic(st, items) {
    const list = (items || []).filter((it) => it && it.passive && DEFS[it.passive.id] && DEFS[it.passive.id].static)
      .sort((a, b) => (DEFS[a.passive.id].order || 0) - (DEFS[b.passive.id].order || 0));
    list.forEach((it) => DEFS[it.passive.id].static(st, it.passive.params || {}, items));
    return st;
  }

  // ---- dynamic stats: buffs, stacks, auras (getPlayerStats / bot refresh every frame) ----
  function applyDynamic(u, st) {
    if (!E) return st;
    const s = state(u);
    const t = now();
    s.buffs = s.buffs.filter((b) => b.until > t);
    const mult = {};
    s.buffs.forEach((b) => {
      for (const k in b.stats) st[k] = (st[k] || 0) + b.stats[k];
      if (b.mult) for (const k in b.mult) mult[k] = (mult[k] || 1) * b.mult[k];
    });
    for (const k in mult) st[k] = (st[k] || 0) * mult[k];
    each(u, 'dynamic', (x) => x.def.dynamic(u, st, x.p, S(u, x.id)));
    // auras from allied holders (the holder counts too)
    E.heroes().forEach((h) => {
      if (E.team(h) !== E.team(u)) return;
      each(h, 'aura', (x) => { if (dist(h, u) <= (x.p.range || 6)) x.def.aura(h, u, st, x.p); });
    });
    return st;
  }

  // ---- engine hooks ----
  Combat.penOf = function (attacker, src) {
    let pen = 0;
    each(attacker, 'pen', (x) => { pen += x.def.pen(src, x.p); });
    return Math.min(0.9, pen);
  };
  Combat.damageMults.push(function (info, target) {
    let m = 1;
    if (target && target._weak && info && info.src === 'attack') {
      const n = weakStacks(target);
      if (n > 0) m *= 1 + target._weak.per * n; else target._weak = null;
    }
    if (target && target._exposedUntil > now()) m *= 1 + target._exposedAmp;
    each(target, 'takenMult', (x) => { m *= x.def.takenMult(info, x.p, S(target, x.id)); });
    return m;
  });
  // Redirect (Cloak of the Oathsworn): an allied hero within range of a holder keeps (1 - share) of the damage; the
  // holder takes the rest (after the holder's own Resist). Called by the engine on mitigated damage to hero units.
  Combat.redirectShare = function (target, dealt, info) {
    if (!E || !(dealt > 0) || (info && info.redirected) || !E.isHero(target)) return dealt;
    let kept = dealt;
    E.heroes().forEach((h) => {
      if (h === target || h.hp <= 0 || E.team(h) !== E.team(target)) return;
      const x = passivesOf(h).find((y) => y.id === 'redirect');
      if (!x || dist(h, target) > x.p.range) return;
      const part = dealt * x.p.share;
      kept -= part;
      E.redirectTo(h, part); // the holder takes it as a hit (their own Resist applies)
    });
    return Math.max(0, kept);
  };

  // Wellspring: your heals on allies are stronger and give you a little mana (info.healer = who's healing)
  Combat.healMult = function (u, info) {
    let m = 1;
    const h = info && info.healer;
    if (h && h !== u && E) {
      const x = passivesOf(h).find((y) => y.id === 'wellspring');
      if (x) {
        m *= 1 + x.p.power;
        const s = S(h, 'wellspring');
        if (now() >= (s.readyAt || 0)) { s.readyAt = now() + x.p.icd; E.addMana(h, x.p.mana); }
      }
    }
    if (u._antiHealUntil > now()) m *= 1 - (u._antiHealPct || 0);
    return m;
  };
  Combat.shieldMult = function (u, info) {
    const h = info && info.healer;
    if (!h || h === u || !E) return 1;
    const x = passivesOf(h).find((y) => y.id === 'wellspring');
    if (!x) return 1;
    const s = S(h, 'wellspring');
    if (now() >= (s.readyAt || 0)) { s.readyAt = now() + x.p.icd; E.addMana(h, x.p.mana); }
    return 1 + x.p.power;
  };
  // Frostbite plate on minions / monsters / towers: their attack timers run longer
  function atkTimeMult(u) { return u && u._asSlowUntil > now() ? 1 / (1 - (u._asSlowPct || 0)) : 1; }
  // hard CC landed (js/cc.js calls CC.onHard(target, sourceUnit)): Exposed marks the target
  window.CC.onHard = function (target, src) {
    if (!E || !target || !src) return;
    const x = passivesOf(src).find((y) => y.id === 'exposed');
    if (x && src && E.team(src) !== (E.isHero(target) ? E.team(target) : target.team)) {
      target._exposedUntil = now() + x.p.dur; target._exposedAmp = x.p.amp;
    }
    // Shrug off: being hard-CC'd cuts your basic ability cooldowns
    const so = passivesOf(target).find((y) => y.id === 'shrugOff');
    if (so) {
      const s = S(target, 'shrugOff');
      if (now() >= (s.readyAt || 0)) { s.readyAt = now() + so.p.icd; if (window.KitFx) window.KitFx.reduceCooldowns(target, { seconds: so.p.cdCut }); }
    }
    Combat.emit('cc', { target, src });
  };
  // Spell shield: blocks the next enemy ability (damage and CC) that would hit a holder
  Combat.blocks = function (info, target) {
    if (!E || !target || !info || info.src !== 'ability' || info.proc || info.passiveTick || info.redirected || !info.attacker || !E.isHero(info.attacker)) return false;
    if (E.team(info.attacker) === E.team(target)) return false;
    const x = passivesOf(target).find((y) => y.id === 'spellShield');
    if (!x) return false;
    const s = S(target, 'spellShield');
    if (now() < (s.readyAt || 0)) return false;
    s.readyAt = now() + x.p.cd;
    E.fx(target, 'SPELL SHIELD', '#93c5fd');
    return true;
  };
  // Mana cost multiplier for a cast (Overcharge, Momentum)
  function manaCostMult(u) {
    let m = 1;
    each(u, 'manaMult', (x) => { m *= x.def.manaMult(x.p, S(u, x.id)); });
    return m;
  }
  // Soul harvest: anything that dies to your Ability damage refunds mana
  Combat.on('death', (e) => {
    const v = e.victim;
    // the hit that brought them to 0 HP was yours, and it was Ability damage
    if (!E || !v || !v._lastHit || !v._lastHit.by || v._lastHit.info.src !== 'ability') return;
    const h = v._lastHit.by;
    const x = passivesOf(h).find((y) => y.id === 'soulHarvest');
    if (!x) return;
    const max = E.maxMana(h);
    if (E.isHero(v)) { E.addMana(h, max * x.p.hero); return; }
    const s = S(h, 'soulHarvest');
    if (now() - since(s.winAt) > x.p.smallCapWindow) { s.winAt = now(); s.got = 0; }
    const want = max * (e.kind === 'camp' ? x.p.monster : x.p.minion);
    const give = Math.min(want, max * x.p.smallCapPct - (s.got || 0));
    if (give > 0) { s.got = (s.got || 0) + give; E.addMana(h, give); }
  });

  // remember who hit whom (kills / assists, out-of-combat timers), then run the hit passives
  Combat.on('hit', (e) => {
    if (!E) return;
    const t = now();
    const a = e.attacker, v = e.target;
    if (v && e.dealt > 0) {
      v._lastHurtAt = t;
      v._lastHit = { by: a || null, info: e.info, t }; // the latest hit, whoever landed it (Soul harvest: the killing blow)
      if (a && E.isHero(a)) { v._lastHeroHit = { by: a, t }; (v._hurtBy = v._hurtBy || new Map()).set(a, t); }
    }
    if (a && E.isHero(a) && v && E.isHero(v)) { a._lastCombatAt = t; v._lastCombatAt = t; }
    if (a) each(a, 'hitDealt', (x) => x.def.hitDealt(e, x.p, S(a, x.id)));
    if (v && E.isHero(v)) each(v, 'hitTaken', (x) => x.def.hitTaken(e, x.p, S(v, x.id)));
  });
  // overheal: lifesteal past full HP
  Combat.on('overheal', (e) => {
    const x = passivesOf(e.unit).find((y) => y.id === 'overheal');
    if (!x || !e.info || !e.info.vamp) return;
    const s = state(e.unit);
    const cur = (s.shields && s.shields.overheal) ? s.shields.overheal.left : 0;
    const cap = x.p.capBase + x.p.capPctHp * e.unit.maxHp;
    const add = Math.min(e.extra, cap - cur);
    if (add > 0) addShield(e.unit, cur + add, 600, 'overheal');
  });
  // a unit died (engine emits 'death' with the victim); hero deaths pay out kill / assist passives
  Combat.on('death', (e) => {
    if (!E) return;
    const v = e.victim;
    const t = now();
    if (!v || !E.isHero(v)) return;
    const last = v._lastHeroHit && t - v._lastHeroHit.t <= 10 ? v._lastHeroHit.by : null;
    const killer = e.killer || last;
    if (killer) each(killer, 'kill', (x) => x.def.kill(killer, e, x.p, S(killer, x.id), 'killer'));
    if (v._hurtBy) v._hurtBy.forEach((when, h) => {
      if (h !== killer && t - when <= 10 && E.team(h) !== E.team(v)) each(h, 'kill', (x) => x.def.kill(h, e, x.p, S(h, x.id), 'assist'));
    });
    v._hurtBy = null; v._lastHeroHit = null;
  });
  Combat.on('cast', (e) => {
    if (!e.unit) return;
    if (!e.castId) e.castId = Combat.nextCastId++;
    each(e.unit, 'cast', (x) => x.def.cast(e.unit, e.slot, x.p, S(e.unit, x.id), e.castId));
  });

  function tick(dt) {
    if (!E) return;
    E.heroes().forEach((u) => {
      tickShields(u);
      if (u.hp > 0) each(u, 'tick', (x) => x.def.tick(u, dt, x.p, S(u, x.id)));
    });
  }

  return {
    DEFS,
    setEngine(adapter) { E = adapter; },
    applyStatic, applyDynamic, tick, passivesOf, buff, hasBuff, addShield, manaCostMult, atkTimeMult,
    crossoverReady(u) { const x = passivesOf(u).find((y) => y.id === 'crossover'); return !!x && now() >= (S(u, 'crossover').readyAt || 0); },
    has(u, id) { return passivesOf(u).some((x) => x.id === id); }
  };
})();
