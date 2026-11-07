/* ==========================================================================
   Storybook Card Game — Tactical Lookahead AI, Self-Play Trainer & Deck League
   ========================================================================== */

(function (root, factory) {
  const Engine = (root && root.StorybookEngine) || (typeof require === 'function' ? require('./game-engine.js') : null);
  const Data = (root && root.StorybookGameData) || (typeof require === 'function' ? require('./game-data.js') : null);
  const api = factory(Engine, Data);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.StorybookAI = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, (Engine, Data) => {
  'use strict';

  const { IDS } = Engine;

  // Fast, deterministic 32-bit PRNG for Common Random Numbers (CRN) & lookahead rollouts
  function mulberry32(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Baseline expert heuristic weights (refined further via Self-Play Evolution Strategies)
  const BASELINE_WEIGHTS = {
    myHp: 2.55,
    oppHp: 1.75,
    lowHpDanger: 18.0,
    lethalPressure: 16.0,
    heroWard: 4.4,
    unitPresence: 3.25,
    swarmWidth: 1.15,
    unitAtk: 2.65,
    unitHp: 2.05,
    unitWard: 3.9,
    unitSafeguard: 3.1,
    unitProvoke: 2.8,
    provokeShieldedAlly: 2.15,
    queenBonus: 6.8,
    devoteeEngine: 3.1,
    valentinaPos: 5.5,
    kitThreat: 5.4,
    activeEnergy: 4.4,
    pendingEnergy: 3.8,
    buildingEngine: 4.1,
    handCard: 3.45,
    handFated: 2.8,
    handBuffStats: 1.45,
    handPoisonedFood: 2.5,
    stoneSoupScale: 2.1,
    grimhildeApple: 1.5,
    wishPassThreshold1: 7.2,
    wishPassThreshold2: 5.3
  };

  // Active learned weights (trained via CRN Self-Play Hill-Climbing & Genetic League)
  let LEARNED_WEIGHTS = { ...BASELINE_WEIGHTS };

  function setLearnedWeights(w) {
    if (w && typeof w === 'object') {
      LEARNED_WEIGHTS = { ...BASELINE_WEIGHTS, ...w };
    }
  }

  function getLearnedWeights() {
    return { ...LEARNED_WEIGHTS };
  }

  // =========================================================================
  // 1. Opening Mulligan Intelligence
  // =========================================================================

  function chooseMulligan(state, db, playerIndex, weights = LEARNED_WEIGHTS) {
    const p = state.players[playerIndex];
    if (!p || !Array.isArray(p.hand)) return [];

    const has1DropChar = p.hand.some(inst => {
      const d = db.cardMap.get(inst.cardId);
      return d && d.type === 'character' && Number(d.energyReq) === 1;
    });
    const hasEarlyChar = p.hand.some(inst => {
      const d = db.cardMap.get(inst.cardId);
      return d && d.type === 'character' && Number(d.energyReq) <= 2;
    });

    let keptBuilding = false;
    const replace = [];
    p.hand.forEach((inst, idx) => {
      const def = db.cardMap.get(inst.cardId);
      if (!def) return;
      const eReq = Number(def.energyReq ?? 1);

      // Always toss 4E and 5E cards in opening hand
      if (eReq >= 4) {
        replace.push(idx);
        return;
      }

      // Buildings in opening hand: keep at most 1, and require an early Character for 2E/3E Buildings
      if (def.type === 'building') {
        if (keptBuilding || (eReq >= 2 && !hasEarlyChar)) {
          replace.push(idx);
        } else {
          keptBuilding = true;
        }
        return;
      }

      // 3E cards: toss unless it's Mother Pippin / Palace Halberdier / Bloodkey Baron+Hare AND we already have a 1E or 2E play
      if (eReq === 3) {
        const keepable3 = (
          def.id === IDS.MOTHER_PIPPIN ||
          def.id === IDS.PALACE_HALBERDIER ||
          (def.id === IDS.BLOODKEY_BARON && p.hand.some(x => x.cardId === IDS.HARRIED_HARE))
        );
        if (!keepable3 || !hasEarlyChar) {
          replace.push(idx);
        }
        return;
      }

      // Reactive / conditional 1E-2E spells:
      if (def.id === IDS.POWDERED_ROSE_JOYS) {
        // Toss unless we also hold Ravenous Dowager (Queen) or Belladonna
        const hasDowager = p.hand.some(x => x.cardId === IDS.RAVENOUS_DOWAGER);
        if (!hasDowager) replace.push(idx);
        return;
      }

      if (def.id === IDS.STONE_SOUP) {
        // Keep at most 1 Stone Soup, and only if we have a 1E/2E Character in hand
        const firstSoupIdx = p.hand.findIndex(x => x.cardId === IDS.STONE_SOUP);
        if (!hasEarlyChar || idx !== firstSoupIdx) {
          replace.push(idx);
        }
        return;
      }

      if (def.id === IDS.POTS_AND_PANS) {
        // Keep at most 1 copy in opening hand
        const firstPotsIdx = p.hand.findIndex(x => x.cardId === IDS.POTS_AND_PANS);
        if (idx !== firstPotsIdx) replace.push(idx);
        return;
      }

      if (def.id === IDS.WHETSMITH_APPRENTICE && !has1DropChar) {
        // Whetsmith wants a friendly unit to buff
        replace.push(idx);
        return;
      }
    });

    return replace;
  }

  // =========================================================================
  // 2. Contextual Card & Wish Evaluation (1 -> 2 -> 3 Push-Your-Luck)
  // =========================================================================

  function scoreCardInstanceInContext(state, db, playerIndex, inst, weights = LEARNED_WEIGHTS) {
    const p = state.players[playerIndex];
    const opp = state.players[1 - playerIndex];
    const def = db.cardMap.get(inst.cardId);
    if (!def) return 0;

    const curE = Math.max(Engine.getPlayerEnergy(p, db), p.turnsTaken + 1);
    const eReq = Number(def.energyReq ?? 1);
    const apCost = Engine.getEffectiveApCost(state, playerIndex, inst, db);

    let score = 4.0;

    // Curve fit: penalize cards we won't have the Energy to play for several turns
    if (eReq > curE + 1) {
      score -= (eReq - curE) * 1.6;
    } else if (eReq <= curE) {
      score += 1.2;
    }

    const oppBoardAtk = opp.characters.reduce((s, u) => s + Engine.getUnitAtk(u), 0);
    const myHasProvoke = p.characters.some(u => u.intrinsicProvoke);
    const needProvokeUrgently = !myHasProvoke && opp.characters.length > 0 && (p.hp <= 15 || p.hp <= oppBoardAtk + 6);
    const isWishingOak = state.pending && state.pending.type === 'wish' && state.pending.wishKind === 'wishing_oak';

    if (def.type === 'character') {
      const atk = Number(def.attack ?? 0) + (inst.bonusAtk || 0);
      const hp = Number(def.health ?? 1) + (inst.bonusHp || 0);
      score += (atk * 1.15 + hp * 1.05) / Math.max(1, apCost * 0.85);

      // In Gift of the Wishing Oak (5E+), penalize low-impact 1-Energy drops so the AI pushes its luck for 3E-5E haymakers!
      if (isWishingOak) {
        if (eReq === 1 && def.id !== IDS.HARRIED_HARE) {
          score -= 2.8;
        } else if (eReq >= 3 && eReq <= curE) {
          score += 1.6;
        }
      }

      const hasSwift = Boolean(inst.swift || /\{swift:?\}/i.test(def.rulesText || ''));
      const hasProvoke = Boolean(
        inst.provoke ||
        def.id === IDS.PALACE_HALBERDIER ||
        def.id === IDS.HEDGEROW_MATRON ||
        (/\{provoke:?\}/i.test(def.rulesText || '') && !/(?:give\s+it|gains?|\{end of turn:?\}|\{kinship:?\}|\{debut:?\})[^.\n]*\{provoke:?\}/i.test(def.rulesText || ''))
      );
      const hasSafeguard = Boolean(
        inst.safeguard ||
        def.id === IDS.PALACE_HALBERDIER ||
        (/\{safeguard:?\}/i.test(def.rulesText || '') && !/\{kinship:?\}[^.\n]*\{safeguard:?\}/i.test(def.rulesText || ''))
      );

      if (hasSwift) {
        score += 2.2;
        if (opp.hp <= atk + 3 || opp.characters.some(u => u.curHp <= atk)) score += 2.0;
      }
      if (hasProvoke) {
        score += 2.0;
        if (needProvokeUrgently) score += 4.5;
        else if (p.hp <= 18) score += 1.8;
      }
      if (hasSafeguard) {
        score += 1.8;
      }
      if (inst.doubleDebutFarewell) score += 2.8;
      if (inst.summon22Copy) score += 3.4;
      if (inst.debutWard > 0) score += 2.1;
      if (inst.extraKinships && inst.extraKinships.length > 0) score += 2.8;
      if (inst.extraDevotees && inst.extraDevotees.length > 0) score += 1.8;
      if (inst.apReduction > 0) score += inst.apReduction * 1.6;

      // High-impact specific Characters
      if (def.id === IDS.HEDGEROW_MATRON && eReq <= curE + 1) score += 2.8;
      if (def.id === IDS.PALACE_HALBERDIER && eReq <= curE + 1) score += 2.4;
      if (def.id === IDS.KIT_MERRYWEATHER && eReq <= curE + 1) score += 2.6;
      if (def.id === IDS.MOTHER_PIPPIN && eReq <= curE + 1) score += 2.4;
      if (def.id === IDS.VALENTINA && eReq <= curE + 1) score += 2.6;
      if (def.id === IDS.GRIMHILDE && eReq <= curE + 1) score += 2.2;
      if (def.id === IDS.RAVENOUS_DOWAGER) score += 2.4;
      if (def.id === IDS.GENTLE_WOODSMAN) score += 2.0;
      if (def.id === IDS.SWEET_OLD_SOUL && eReq <= curE + 1) score += 1.8;
      if (def.id === IDS.GRAYBEARD_KNIGHT && p.characters.length >= 1) score += 2.2;
      if (def.id === IDS.HONEYWOOD_SENTRY && p.characters.some(u => (u.subtypes || []).includes('ANIMALFOLK'))) {
        score += 2.1;
      }
    } else if (def.type === 'spell') {
      // Food & Poisoned context (especially for Ravenous Dowager!)
      if (def.id === IDS.EAT_UP_MY_DARLING) {
        if (inst.poisoned) {
          score += opp.characters.length > 0 ? 4.8 : 2.8;
        } else {
          score += p.characters.length > 0 ? 4.2 : 2.5;
        }
      } else if (def.id === IDS.SHOWSTOPPER_GATEAU) {
        if (inst.poisoned) {
          score += (opp.characters.length > 0 && curE >= 3) ? 4.2 : 2.2;
        } else {
          score += (p.characters.length > 0 && curE >= 3) ? 4.4 : 2.4;
        }
      } else if (def.id === IDS.SUPPER_FOR_TWO) {
        if (inst.poisoned) {
          score += (opp.characters.length >= 2 && curE >= 3) ? 4.5 : 2.3;
        } else {
          score += (p.characters.length >= 2 && curE >= 3) ? 4.2 : 2.2;
        }
      } else if (def.id === IDS.HARVEST_BANQUET) {
        if (inst.poisoned) {
          score += opp.characters.length >= 2 ? 4.6 : 2.0;
        } else {
          score += p.characters.length >= 2 ? 4.4 : 2.0;
        }
      } else if (def.id === IDS.STONE_SOUP) {
        const bonus = p.stoneSoupBonus || 0;
        score += 1.5 + bonus * 1.4;
      } else if (def.id === IDS.POWDERED_ROSE_JOYS) {
        const hasQueen = Engine.playerControlsSubtype(p, 'QUEEN', db);
        score += hasQueen ? 4.2 : (p.hp <= 18 ? 2.6 : 1.0);
      } else if (def.id === IDS.FAIREST_OF_THEM_ALL) {
        const spareQueens = curE >= 6;
        const myLost = p.characters.filter(u => !(spareQueens && (u.subtypes || []).includes('QUEEN'))).length;
        score += (opp.characters.length >= 2 && opp.characters.length > myLost) ? 5.2 : 1.8;
      }
    }

    return score;
  }

  function chooseWishOptionOrPass(state, db, weights = LEARNED_WEIGHTS) {
    if (!state.pending || state.pending.type !== 'wish') return 0;
    const { options, stepIndex = 0, playerIndex, wishKind } = state.pending;
    const remainingAfter = options.length - 1 - stepIndex;
    if (remainingAfter <= 0) {
      return stepIndex; // Final card must be claimed
    }

    const currentInst = options[stepIndex];
    const score = scoreCardInstanceInContext(state, db, playerIndex, currentInst, weights);
    let threshold = stepIndex === 0
      ? (weights.wishPassThreshold1 ?? 8.95)
      : (weights.wishPassThreshold2 ?? 6.20);

    // Normalize threshold for Wish pools that grant universal bonuses to every offer:
    // - wishing_oak grants a Woodland Blessing (+2.1..3.4) AND -1 AP (+1.6) to all 3 offers
    // - gentle_woodsman grants a Woodland Blessing (+2.1..3.4) to all 3 offers
    // - royal_favour grants {Devotee} +1/+1 (+1.8) to all 3 offers
    if (wishKind === 'wishing_oak') {
      threshold += stepIndex === 0 ? 5.6 : 4.4;
    } else if (wishKind === 'gentle_woodsman') {
      threshold += stepIndex === 0 ? 3.2 : 2.2;
    } else if (wishKind === 'royal_favour') {
      threshold += stepIndex === 0 ? 2.2 : 1.5;
    }

    // When under heavy board/lethal pressure with no Provoke blocker, raise offer 1 bar for non-Provoke units to dig for a Provoke!
    const p = state.players[playerIndex];
    const opp = state.players[1 - playerIndex];
    const oppBoardAtk = opp.characters.reduce((s, u) => s + Engine.getUnitAtk(u), 0);
    const needProvokeUrgently = !p.characters.some(u => u.intrinsicProvoke) &&
      opp.characters.length > 0 &&
      (p.hp <= 15 || p.hp <= oppBoardAtk + 6);
    if (needProvokeUrgently && stepIndex === 0 && (wishKind === 'wishing_oak' || wishKind === 'gentle_woodsman')) {
      threshold += 1.6;
    }

    return score >= threshold ? stepIndex : 'pass';
  }

  function chooseBuildingOverwriteSlot(state, db) {
    const { playerIndex } = state.pending;
    const p = state.players[playerIndex];
    let bestSlot = 0;
    let lowestVal = Infinity;

    p.buildings.forEach((b, idx) => {
      if (!b) {
        lowestVal = -999;
        bestSlot = idx;
        return;
      }
      let val = 10;
      if (b.charges !== null && b.charges <= 0) {
        val = 1; // Spent building is ideal to overwrite!
      } else if (b.cardId === IDS.PAINTED_TOPIARIES) {
        val = 4;
      } else if (b.cardId === IDS.CROSSROADS_INN || b.cardId === IDS.OLD_CHESTNUT_SMITHY) {
        val = 5 + (b.charges || 0) * 2;
      } else if (b.cardId === IDS.VANITY_MIRROR) {
        val = 6 + (b.charges || 0) * 3;
      } else if (b.cardId === IDS.APPLE_TREE || b.cardId === IDS.GRANNY_THIMBLES_COTTAGE) {
        val = 9;
      }
      if (val < lowestVal) {
        lowestVal = val;
        bestSlot = idx;
      }
    });

    return bestSlot;
  }

  // =========================================================================
  // 3. State Evaluation & Counter-Lethal Threat Estimation
  // =========================================================================

  function evaluatePlayerSide(state, db, player, opp, weights, isMySide = true) {
    let score = 0;

    // 1. Hero HP & Non-linear defensive danger curve (only on own Hero so we don't double-count aggro)
    // Above 20 HP, cushion HP is valued at 50% marginal weight so King Valyn / Crown's Tithe (+1 card = +3.45)
    // is always worth 2 self-damage (-2.55) when floating AP at high health!
    const baseHp = Math.min(20, player.hp);
    const cushionHp = Math.max(0, player.hp - 20);
    score += (baseHp + cushionHp * 0.5) * weights.myHp;
    if (isMySide) {
      if (player.hp <= 12) {
        const deficit = 13 - player.hp;
        score -= (deficit * deficit * 0.22) * (weights.lowHpDanger / 18.0);
      }
      if (player.hp <= 5) {
        score -= (6 - player.hp) * 6.5;
      }
    }
    score += (player.wards || 0) * weights.heroWard;

    // 2. Character Row Evaluation
    const nChars = player.characters.length;
    const isHearth = player.factions.includes('H');
    score += nChars * weights.unitPresence;
    if (isHearth && nChars >= 3) {
      score += (nChars - 2) * (nChars - 1) * 0.55 * weights.swarmWidth;
    }

    let hasQueenOnBoard = false;
    player.characters.forEach((u, idx) => {
      const atk = Engine.getUnitAtk(u);
      const curHp = u.curHp;
      const maxHp = Engine.getUnitMaxHp(u);
      const subs = u.subtypes || [];

      // Prevent temporary buffs (e.g. Stone Soup / Humble Pie) from inflating mid-turn beam scores
      // when they overkill targets or sit on units that have already attacked / cannot attack this turn.
      const permAtk = Math.max(0, u.baseAtk + u.permAtk - (u.tempAtk < 0 ? Math.abs(u.tempAtk) : 0));
      const posTempAtk = Math.max(0, u.tempAtk || 0);
      const readyToSwing = isMySide &&
        (state.phase === 'MAIN1' || state.phase === 'COMBAT') &&
        (state.phase === 'COMBAT' || !state.combatUsedThisTurn) &&
        Engine.isUnitReadyToAttack(u);
      let effectiveTempAtk = 0;
      if (readyToSwing && posTempAtk > 0) {
        const faceOpen = !Engine.isTargetBlockedByProvoke(opp, 'hero');
        const maxEnemyHp = opp.characters.reduce((m, e) => Math.max(m, e.curHp), 0);
        const maxUsefulTotalAtk = faceOpen ? Math.max(opp.hp, maxEnemyHp) : maxEnemyHp;
        const usefulExtraAtk = Math.max(0, Math.min(posTempAtk, maxUsefulTotalAtk - permAtk));
        effectiveTempAtk = usefulExtraAtk * 0.6;
      }

      const permMaxHp = Math.max(1, u.baseHp + u.permHp);
      const survivingEotHp = Math.min(curHp, permMaxHp);
      const maxEnemyAtk = opp.characters.reduce((m, e) => Math.max(m, Engine.getUnitAtk(e)), 0);
      const tempShieldBuffer = (readyToSwing && opp.characters.length > 0)
        ? Math.min(Math.max(0, curHp - survivingEotHp), Math.max(2, maxEnemyAtk)) * 0.85
        : 0;
      if (readyToSwing && (posTempAtk > 0 || curHp > survivingEotHp) && opp.characters.length > 0) {
        // Reward temporary buffs that actually cross a kill-or-survival combat breakpoint on an enemy threat
        const crossesBreakpoint = opp.characters.some(e => {
          const eAtk = Engine.getUnitAtk(e);
          const eHp = e.curHp;
          const couldKillAndSurviveBefore = permAtk >= eHp && survivingEotHp > eAtk;
          const canKillAndSurviveNow = atk >= eHp && curHp > eAtk;
          return !couldKillAndSurviveBefore && canKillAndSurviveNow;
        });
        if (crossesBreakpoint) {
          score += 5.2;
        }
      }

      score += (permAtk + effectiveTempAtk) * weights.unitAtk;
      score += (survivingEotHp + tempShieldBuffer) * weights.unitHp;
      if (survivingEotHp < permMaxHp) score -= 0.25; // slight preference for undamaged units

      if (u.wards > 0) {
        score += u.wards * (weights.unitWard + permAtk * 0.25);
      }
      if (Engine.unitHasSafeguard(player, idx)) {
        score += weights.unitSafeguard + permAtk * 0.35;
      }
      if (u.intrinsicProvoke) {
        score += weights.unitProvoke + survivingEotHp * 0.35;
      } else if (Engine.isTargetBlockedByProvoke(player, 'character', idx)) {
        // Shielded by an adjacent Provoke ally!
        score += weights.provokeShieldedAlly + permAtk * 0.25;
      }

      if (subs.includes('QUEEN')) {
        hasQueenOnBoard = true;
      }

      // Specific engine & Farewell values on board
      if (u.cardId === IDS.KIT_MERRYWEATHER) {
        score += weights.kitThreat;
      } else if (u.cardId === IDS.VALENTINA) {
        // Valentina is a premier recurring End-of-Turn engine (summons a 2/4 Provoke Royal Vanguard every turn)
        score += 4.6;
      } else if (u.cardId === IDS.HARRIED_HARE && !u.dubbedChampion) {
        score += 2.3; // Farewell card draw banked on board
      } else if (u.cardId === IDS.GRAYBEARD_KNIGHT && !u.dubbedChampion) {
        // Farewell +2/+2 banked if there is a right neighbor!
        if (idx < nChars - 1) score += 3.2;
      } else if (
        (u.cardId === IDS.COURT_TRUMPETER ||
          u.cardId === IDS.SIXPENCE_TARTIST ||
          (u.cardId === IDS.LADY_TIRED_OF_WAITING && player.heroes.some(h => h.cardId === IDS.KING_VALYN || h.cardId === IDS.ROSALIND))) &&
        player.turnsTaken <= 5
      ) {
        score += weights.devoteeEngine;
      }

      if (u.dubbedChampion) {
        let dubSiegeVal = 0;
        switch (u.cardId) {
          case IDS.GRIMHILDE: dubSiegeVal += 6.2; break;
          case IDS.HEDGEROW_MATRON: dubSiegeVal += 5.5; break;
          case IDS.MOTHER_PIPPIN: dubSiegeVal += 5.5; break;
          case IDS.RAVENOUS_DOWAGER: dubSiegeVal += 5.2; break;
          case IDS.GENTLE_WOODSMAN: dubSiegeVal += 5.2; break;
          case IDS.BLOODKEY_BARON: dubSiegeVal += (idx > 0 ? 5.0 : 0.4); break;
          case IDS.GRAYBEARD_KNIGHT: dubSiegeVal += (idx > 0 ? 3.2 : 0) + (idx < nChars - 1 ? 3.2 : 0); break;
          case IDS.KIT_MERRYWEATHER: dubSiegeVal += 3.5; break;
          case IDS.HARRIED_HARE: dubSiegeVal += 3.2; break;
          case IDS.SIXPENCE_TARTIST: dubSiegeVal += 2.8; break;
          case IDS.SWEET_OLD_SOUL: dubSiegeVal += 2.8; break;
          case IDS.WHETSMITH_APPRENTICE: dubSiegeVal += (nChars > 1 ? 2.2 : 0); break;
          default: break;
        }
        if (u.siegeExtraFarewells && u.siegeExtraFarewells.length > 0) {
          dubSiegeVal += u.siegeExtraFarewells.length * 5.8;
        }
        if (u.doubleDebutFarewell && dubSiegeVal > 0) {
          dubSiegeVal *= 1.65;
        }
        score += dubSiegeVal;
      }

      if (u.extraFarewells && u.extraFarewells.length > 0) {
        score += u.extraFarewells.length * 4.5; // Showstopper Gateau 2/4 Royal Vanguard banked!
      }
      if (u.extraDevotees && u.extraDevotees.length > 0) {
        score += u.extraDevotees.length * 1.6;
      }
      if (u.extraKinships && u.extraKinships.length > 0 && !u.extraKinshipsFired) {
        score += u.extraKinships.length * 2.5;
      }

      // Velvet Queen Valentina positioning awareness (in case evaluated mid-turn before EOT)
      if (u.cardId === IDS.VALENTINA) {
        if (idx === 0) {
          score += 1.5; // Safe at leftmost slot 0 when no expendable fodder / Farewell ally is on left
        } else {
          const victim = player.characters[idx - 1];
          const victimSurvHp = Math.min(victim.curHp, Math.max(1, victim.baseHp + victim.permHp));
          const vVal = Math.max(0, victim.baseAtk + victim.permAtk) + victimSurvHp;
          const hasBeneficialFarewell = (!victim.dubbedChampion && (victim.cardId === IDS.HARRIED_HARE || victim.cardId === IDS.GRAYBEARD_KNIGHT)) ||
            (victim.extraFarewells && victim.extraFarewells.length > 0);
          if (hasBeneficialFarewell) {
            score += weights.valentinaPos * 1.25;
          } else if (vVal <= 2 && !victim.dubbedChampion && victim.cardId !== IDS.KIT_MERRYWEATHER) {
            // True 1/1 fodder (Rabbit, 1/1 Barnyard Troubadour)
            score += weights.valentinaPos * 0.85;
          } else {
            // Penalize leaving a real combat unit (e.g. 2/3 Turnpike Tollkeep) to be eaten by Valentina!
            score -= (vVal - 1.5) * 1.45;
          }
        }
      }
    });

    if (hasQueenOnBoard && player.factions.includes('R')) {
      score += weights.queenBonus;
    }

    // 3. Infrastructure / Buildings Evaluation
    const activeE = Engine.getPlayerEnergy(player, db);
    const pendingE = Engine.getPendingBuildingEnergy(player, db);
    // Granny Thimble's Cottage benefits up to 7E (4 buildings); Fairest of Them All up to 6E (3 buildings); 5E payoffs up to 5E (2 buildings)
    const hasCottage = player.buildings.some(b => b && b.cardId === IDS.GRANNY_THIMBLES_COTTAGE) ||
      player.hand.some(c => c.cardId === IDS.GRANNY_THIMBLES_COTTAGE) ||
      player.deck.some(c => c.cardId === IDS.GRANNY_THIMBLES_COTTAGE);
    const hasFairest = player.hand.some(c => c.cardId === IDS.FAIREST_OF_THEM_ALL) ||
      player.deck.some(c => c.cardId === IDS.FAIREST_OF_THEM_ALL);
    const hasFiveEPayoff = hasCottage || hasFairest ||
      player.buildings.some(b => b && (b.cardId === IDS.CROSSROADS_INN || b.cardId === IDS.VANITY_MIRROR)) ||
      player.hand.some(c => {
        const d = db.cardMap.get(c.cardId);
        return (d && Number(d.energyReq ?? 1) >= 5) || c.cardId === IDS.CROSSROADS_INN || c.cardId === IDS.VANITY_MIRROR;
      }) ||
      player.deck.some(c => {
        const d = db.cardMap.get(c.cardId);
        return (d && Number(d.energyReq ?? 1) >= 5) || c.cardId === IDS.CROSSROADS_INN || c.cardId === IDS.VANITY_MIRROR;
      });
    const energyCap = hasCottage ? 7 : (hasFairest ? 6 : (hasFiveEPayoff ? 5 : 4));
    const maxUsefulBldgE = hasCottage ? 4 : (hasFairest ? 3 : (hasFiveEPayoff ? 2 : 1));
    const permActiveE = activeE - (player.bonusEnergyTemp || 0);
    const totalProjectedE = Math.min(energyCap, Math.max(3, player.baseEnergy) + Math.max(0, permActiveE - player.baseEnergy) + pendingE);
    const usefulActiveBldgE = Math.min(maxUsefulBldgE, Math.max(0, Math.min(energyCap, permActiveE) - player.baseEnergy));
    const remainingUsefulRamp = Math.max(0, maxUsefulBldgE - usefulActiveBldgE);
    const usefulPendingE = Math.min(remainingUsefulRamp, pendingE);
    score += usefulActiveBldgE * weights.activeEnergy;
    score += usefulPendingE * weights.pendingEnergy;

    // Extra curve-unlock bonus when holding 4E/5E/6E cards in hand and ramping toward them!
    let highCostInHand = 0;
    let devoteeCardsInHand = 0;
    for (const hInst of player.hand) {
      const hDef = db.cardMap.get(hInst.cardId);
      const req = Number(hDef?.energyReq ?? 1);
      if (req >= 4 && totalProjectedE >= req) {
        highCostInHand += (req === 5 ? 1.8 : 1.2);
      } else if (hDef?.id === IDS.FAIREST_OF_THEM_ALL && totalProjectedE >= 6) {
        highCostInHand += 1.6;
      }
      if (hDef?.type === 'character' && req >= 3) {
        devoteeCardsInHand += 1;
      }
    }
    if (usefulActiveBldgE + usefulPendingE > 0) {
      score += Math.min(4.5, highCostInHand * 1.35);
    }

    let seenVanityMirrors = 0;
    let seenTopiaries = 0;
    let seenSmithies = 0;
    let seenInns = 0;
    player.buildings.forEach(b => {
      if (!b) return;
      if (b.cardId === IDS.APPLE_TREE) {
        score += (b.charges || 0) * (weights.buildingEngine * 0.9);
      } else if (b.cardId === IDS.GRANNY_THIMBLES_COTTAGE) {
        if (activeE >= 7) {
          score += weights.buildingEngine * 1.25;
        } else if (activeE >= 5) {
          score += weights.buildingEngine * 0.55;
        } else {
          score += weights.buildingEngine * 0.25;
        }
      } else if (b.cardId === IDS.PAINTED_TOPIARIES) {
        seenTopiaries += 1;
        // Painted Topiaries generates Powdered Rose-Joys on {Devotee}
        if ((devoteeCardsInHand > 0 || player.deck.length >= 4) && player.hand.length < Engine.MAX_HAND) {
          const copyMult = seenTopiaries === 1 ? 1.0 : 0.65;
          score += weights.buildingEngine * 0.95 * copyMult;
        } else {
          score += weights.buildingEngine * (seenTopiaries === 1 ? 0.25 : 0.10);
        }
      } else if (b.cardId === IDS.OLD_CHESTNUT_SMITHY) {
        seenSmithies += 1;
        const mult = seenSmithies === 1 ? 0.85 : 0.35;
        score += (b.charges || 0) * (weights.buildingEngine * mult);
      } else if (b.cardId === IDS.CROSSROADS_INN) {
        seenInns += 1;
        const baseMult = activeE >= 5 ? 1.05 : 0.80;
        const mult = seenInns === 1 ? baseMult : baseMult * 0.55;
        score += (b.charges || 0) * (weights.buildingEngine * mult);
      } else if (b.cardId === IDS.VANITY_MIRROR) {
        if ((b.charges || 0) > 0) {
          seenVanityMirrors += 1;
          // A 2nd simultaneously charged Vanity Mirror cannot both be activated in one turn (2 AP each)
          const mult = seenVanityMirrors === 1 ? 0.95 : 0.20;
          score += (b.charges || 0) * (weights.buildingEngine * mult);
        }
      }
    });

    // Survival pressure curve: losing HP below 18 becomes increasingly dangerous against burst/wide boards
    if (player.hp < 18) {
      const dangerDepth = 18 - player.hp;
      score -= dangerDepth * dangerDepth * 0.14;
    }

    // 4. Hand & Deck Evaluation
    const hLen = player.hand.length;
    // Diminishing returns above 7 cards so the bot doesn't hoard into 10/10 burn
    const effectiveCards = hLen <= 7 ? hLen : 7 + (hLen - 7) * 0.45;
    score += effectiveCards * weights.handCard;

    let soupCountInHand = 0;
    const hasQueenInHand = player.hand.some(c => {
      const cd = db.cardMap.get(c.cardId);
      return cd && Engine.hasSubtype(cd, 'QUEEN');
    });
    const hasBelladonnaHero = Engine.playerHasHero(player, IDS.BELLADONNA);
    const leftFoodIdx = player.hand.findIndex(c => {
      const cd = db.cardMap.get(c.cardId);
      return cd && Engine.hasSubtype(cd, 'FOOD');
    });
    const hasUnpoisonedFoodBehindLeft = leftFoodIdx !== -1 && player.hand.slice(leftFoodIdx + 1).some(c => {
      const cd = db.cardMap.get(c.cardId);
      return cd && Engine.hasSubtype(cd, 'FOOD') && !c.poisoned;
    });
    let totalUnitFoodInHand = 0;
    player.hand.forEach(c => {
      if (c.cardId === IDS.POWDERED_ROSE_JOYS) return;
      const cd = db.cardMap.get(c.cardId);
      if (cd && Engine.hasSubtype(cd, 'FOOD')) totalUnitFoodInHand += 1;
    });
    let seenPoisonedUnitFood = 0;

    player.hand.forEach((inst, hIdx) => {
      const isFated = Engine.isCardEffectivelyFated(state, player.index, inst);
      const isBlockingBelladonna = inst.cardId === IDS.POWDERED_ROSE_JOYS &&
        hasBelladonnaHero &&
        hIdx === leftFoodIdx &&
        hasUnpoisonedFoodBehindLeft;

      if (isFated) {
        if (inst.cardId === IDS.POWDERED_ROSE_JOYS) {
          // Hold Fated Powdered Rose-Joys in hand when healthy & not pushing lethal; reduce hoard bonus when healing, lethal, or blocking Belladonna is active!
          const readyToCashIn = isBlockingBelladonna || (!inst.poisoned && player.hp <= 27) || (inst.poisoned && opp.hp <= 18);
          score += readyToCashIn ? 0.35 : weights.handFated;
          if (isBlockingBelladonna) score -= 2.4;
        } else {
          score += weights.handFated;
        }
      } else if (inst.cardId === IDS.POWDERED_ROSE_JOYS) {
        // Un-Fated Powdered Rose-Joys does not draw a card on cast; discount its raw hand-size value when blocking Belladonna or ready to heal/burn!
        const readyToCashUnfated = isBlockingBelladonna ||
          (!inst.poisoned && (player.hp <= 20 || (!hasQueenInHand && player.hp < player.maxHp))) ||
          (inst.poisoned && opp.hp <= 9);
        if (readyToCashUnfated) {
          score -= isBlockingBelladonna ? 2.4 : 1.6;
        }
      }
      const statBuffs = (inst.bonusAtk || 0) + (inst.bonusHp || 0);
      if (statBuffs > 0) {
        score += statBuffs * weights.handBuffStats;
      }
      if (inst.doubleDebutFarewell) score += 1.6;
      if (inst.summon22Copy) score += 2.0;
      if (inst.provoke) score += 0.9;
      if (inst.safeguard) score += 1.1;
      if (inst.swift) score += 1.0;
      if (inst.debutWard > 0) score += inst.debutWard * 1.0;
      if (inst.extraKinships && inst.extraKinships.length > 0) score += inst.extraKinships.length * 1.4;
      if (inst.apReduction > 0) {
        score += inst.apReduction * 2.0;
      }
      if (inst.poisoned) {
        const d = db.cardMap.get(inst.cardId);
        if (d && Engine.hasSubtype(d, 'FOOD')) {
          if (inst.cardId === IDS.POWDERED_ROSE_JOYS) {
            if (player.hp <= 20 && opp.hp > 9) {
              // At <= 20 HP we need Powdered Rose-Joys un-poisoned to heal ourselves!
              score -= 2.5;
            } else if (hasBelladonnaHero) {
              // Do not pre-poison Powdered Rose-Joys and leave it sitting in hand (which locks Belladonna's leftmost-Food targeting and forfeits healing);
              // Belladonna (0 AP) can poison it on the exact turn we cast it!
              score -= 0.45;
            } else if (opp.hp <= 18) {
              score += 0.35;
            } else {
              score += weights.handPoisonedFood;
            }
          } else {
            seenPoisonedUnitFood += 1;
            const isCheapFood = inst.cardId === IDS.CUREALL_COOKIE || inst.cardId === IDS.HUMBLE_PIE || inst.cardId === IDS.APPLE || inst.cardId === IDS.STONE_SOUP;
            if (!hasBelladonnaHero || (inst.cardId === IDS.APPLE && inst.fated)) {
              score += weights.handPoisonedFood;
            } else if (isCheapFood && totalUnitFoodInHand >= 2 && seenPoisonedUnitFood < totalUnitFoodInHand) {
              // Pre-poisoning a cheap/token Food when holding 2+ Foods sets up a 2-Food turn without locking out 3E-4E haymaker Foods!
              score += weights.handPoisonedFood;
            } else {
              // Under Option 1, keep 3E-4E unit-Foods (Showstopper Gateau, Eat Up My Darling, Supper for Two, Harvest Banquet) and lone Foods un-poisoned at EOT so Belladonna (0 AP) can still poison on demand OR buff allies!
              score -= 0.45;
            }
          }
        }
      }
      if (inst.cardId === IDS.STONE_SOUP) {
        soupCountInHand += 1;
      } else if (inst.cardId === IDS.WISHING_COIN) {
        // Smart reserve value so AI holds Wishing Coin until it unlocks a real tempo swing (+1E curve jump or +1 AP double play)
        score += 7.0;
      }
    });

    if (player.stoneSoupBonus > 0 && isHearth) {
      // Reserve bonus for holding Stone Soup while it scales, capped so a huge Stone Soup (+5/+5..+8/+8) is actually cast for big board swings!
      score += Math.min(4, player.stoneSoupBonus) * 0.55 + soupCountInHand * Math.min(3, player.stoneSoupBonus) * 1.15;
    }

    // Grimhilde Poisoned Fate Apples in deck
    let grimApples = 0;
    let kitFatedInDeck = 0;
    for (const dInst of player.deck) {
      if (dInst.cardId === IDS.APPLE && dInst.poisoned && dInst.fated) {
        grimApples += 1;
      } else if (dInst.fated) {
        kitFatedInDeck += 1;
      }
    }
    score += grimApples * weights.grimhildeApple;
    score += kitFatedInDeck * 2.2;

    // Penalize low-deck / fatigue danger (MTG deck-out rule!) so the AI doesn't frivolously draw when its deck is thin
    const dLen = player.deck.length;
    if (dLen === 0) {
      score -= 55.0;
    } else if (dLen === 1) {
      score -= 22.0;
    } else if (dLen === 2) {
      score -= 11.5;
    } else if (dLen === 3) {
      score -= 6.5;
    } else if (dLen === 4) {
      score -= 3.8;
    } else if (dLen === 5) {
      score -= 2.0;
    } else if (dLen === 6) {
      score -= 0.9;
    }

    return score;
  }

  function evaluateState(state, db, perspectiveIdx, weights = LEARNED_WEIGHTS) {
    if (state.gameOver) {
      return state.gameOver.winner === perspectiveIdx ? 100000 : -100000;
    }

    const me = state.players[perspectiveIdx];
    const opp = state.players[1 - perspectiveIdx];

    const myScore = evaluatePlayerSide(state, db, me, opp, weights, true);
    const oppScore = evaluatePlayerSide(state, db, opp, me, weights, false);

    // Adjust opponent Hero HP weight
    let aggroBonus = (30 - opp.hp) * (weights.oppHp - weights.myHp);
    if (opp.hp <= 6) {
      const nearKill = 7 - opp.hp;
      aggroBonus += (nearKill * nearKill * 0.35) * (weights.lethalPressure / 16.0);
    }

    // Next-Turn Lethal Clock Pressure: if pushing face puts opponent's HP at or below our surviving board Attack
    // while we are safe (or shielded by a Provoke wall), strongly reward setting up the 2-turn kill clock!
    const myBoardAtk = me.characters.reduce((s, u) => s + Engine.getUnitAtk(u), 0);
    const oppBoardAtk = opp.characters.reduce((s, u) => s + Engine.getUnitAtk(u), 0);
    const myProvokeHp = me.characters
      .filter(u => u.intrinsicProvoke)
      .reduce((s, u) => s + u.curHp + (u.wards > 0 ? 3 : 0), 0);
    const safeToClock = (myProvokeHp > oppBoardAtk + 1) || (me.hp > oppBoardAtk + 6 && opp.characters.length <= 2);
    if (safeToClock && myBoardAtk >= 6 && opp.hp <= myBoardAtk) {
      aggroBonus += 13.5 + Math.min(8, myBoardAtk - opp.hp) * 1.1 + (myProvokeHp > oppBoardAtk ? 4.5 : 0);
    }

    return myScore - oppScore + aggroBonus;
  }

  // Estimate immediate counter-lethal, opponent initiative value-trades, and board-presence danger on opponent's turn
  function estimateOpponentCounterThreat(eotState, db, myIdx, weights = LEARNED_WEIGHTS) {
    if (eotState.gameOver) return 0;
    const me = eotState.players[myIdx];
    const opp = eotState.players[1 - myIdx];

    if (opp.characters.length === 0) return 0;

    // All surviving enemy Characters will be ready to attack on opponent's turn
    const readyAtks = opp.characters
      .map(u => Engine.getUnitAtk(u))
      .filter(a => a > 0)
      .sort((a, b) => b - a);

    let penalty = 0;
    const heroShieldedByProvoke = me.characters.some(u => u.intrinsicProvoke);
    const oppIsHearth = opp.factions.includes('H');

    // Estimate potential burst damage opponent can add on their turn (Harvest Banquet on wide boards, Rosalind, Smithy, Eat Up)
    let potentialBurstDmg = 0;
    if (oppIsHearth) {
      if (opp.buildings.some(b => b && b.cardId === IDS.OLD_CHESTNUT_SMITHY && (b.charges || 0) > 0)) {
        potentialBurstDmg += 2;
      }
      if (opp.characters.length >= 3 && opp.hand.length >= 1) {
        // Wide Havenhearth board threatens Harvest Banquet (+2/+1 to all units) or Rosalind + buffs
        potentialBurstDmg += opp.characters.length * 2;
      } else if (opp.characters.length >= 1) {
        potentialBurstDmg += 2; // Rosalind hero power
      }
    } else if (opp.characters.length >= 1 && opp.hand.length >= 1) {
      potentialBurstDmg += 3; // Eat Up, My Darling / Showstopper Gateau
    }

    if (readyAtks.length > 0) {
      if (!heroShieldedByProvoke) {
        // Calculate how much face damage opponent's board already threatens (respecting Hero Wards!)
        const wards = me.wards || 0;
        const asc = [...readyAtks].sort((a, b) => a - b);
        const afterWards = asc.slice(wards);
        const threatenedFaceDmg = afterWards.reduce((a, b) => a + b, 0);
        const burstThreatDmg = threatenedFaceDmg + (afterWards.length > 0 ? potentialBurstDmg : 0);

        if (threatenedFaceDmg >= me.hp) {
          // Guaranteed on-board counter-lethal if we pass this board state!
          penalty += 45000 + (threatenedFaceDmg - me.hp) * 100;
        } else if (burstThreatDmg >= me.hp) {
          // Within opponent's burst-lethal range (e.g. Harvest Banquet / Rosalind / Smithy on a wide board!)
          penalty += 28.0 + (burstThreatDmg - me.hp + 1) * 10.5;
        } else if (me.hp - burstThreatDmg <= 5) {
          penalty += (6 - (me.hp - burstThreatDmg)) * 6.5;
        }
      } else {
        // Even with Provoke, check if opponent's board can blow through all our Provoke HP AND still kill us
        const totalProvokeHp = me.characters
          .filter(u => u.intrinsicProvoke)
          .reduce((sum, u) => sum + u.curHp + (u.wards > 0 ? 3 : 0), 0);
        const totalOppAtk = readyAtks.reduce((a, b) => a + b, 0);
        if (totalOppAtk >= totalProvokeHp + me.hp) {
          penalty += 30000;
        } else if (totalOppAtk + potentialBurstDmg >= totalProvokeHp + me.hp) {
          penalty += 22.0 + (totalOppAtk + potentialBurstDmg - (totalProvokeHp + me.hp) + 1) * 7.5;
        }
      }
    }

    // 1. Initiative & Synergy Tax for leaving enemy Characters alive when passing the turn:
    // Any surviving enemy unit can untap, get buffed (Rosalind / Eat Up / Harvest Banquet / Humble Pie),
    // trigger Kinship/Devotee, or serve as sacrifice fodder for Bloodkey Baron / Valentina.
    const totalProvokeHpAll = heroShieldedByProvoke
      ? me.characters.filter(u => u.intrinsicProvoke).reduce((sum, u) => sum + u.curHp + (u.wards > 0 ? 3 : 0), 0)
      : 0;
    const totalOppAtkAll = readyAtks.reduce((a, b) => a + b, 0);
    const walledByHeavyProvoke = heroShieldedByProvoke && me.hp >= 18 && opp.characters.length <= 2 && totalProvokeHpAll >= totalOppAtkAll + 4;

    opp.characters.forEach((oppU, oppIdx) => {
      const oppAtk = Engine.getUnitAtk(oppU);
      const subs = oppU.subtypes || [];
      const isEngineThreat = subs.includes('QUEEN') ||
        Boolean(oppU.dubbedChampion) ||
        oppU.cardId === IDS.KIT_MERRYWEATHER ||
        oppU.cardId === IDS.COURT_TRUMPETER ||
        oppU.cardId === IDS.SIXPENCE_TARTIST ||
        oppU.cardId === IDS.LADY_TIRED_OF_WAITING ||
        oppU.cardId === IDS.HONEYWOOD_SENTRY;
      const baseTax = 2.35 + oppAtk * 0.85;
      // When our heavy Provoke wall already absorbs a lone non-engine enemy unit, don't over-penalize leaving it to crash into our Provoke!
      penalty += (walledByHeavyProvoke && !isEngineThreat) ? baseTax * 0.35 : baseTax;
      if (subs.includes('QUEEN') || oppU.cardId === IDS.KIT_MERRYWEATHER || oppU.dubbedChampion) {
        penalty += 3.2;
      } else if (isEngineThreat) {
        penalty += 2.2;
      }
      if (Engine.unitHasSafeguard(opp, oppIdx)) {
        penalty += 2.0 + oppAtk * 0.4;
      }
    });
    // Wide-board danger tax: leaving 3+ enemy units alive invites massive AOE buffs (Harvest Banquet),
    // multi-unit Kinship/Flynn & Basker scaling, and unblockable go-wide attacks.
    const oppCount = opp.characters.length;
    if (oppCount >= 2) {
      const wideMult = oppIsHearth ? 1.35 : 1.0;
      const wideBase = oppCount === 2 ? 2.2 : (oppCount === 3 ? 6.5 : 6.5 + (oppCount - 3) * 6.5);
      penalty += wideBase * wideMult;
    }

    // 2. Simulate opponent's best 1-for-1 or free-eat combat trades on their upcoming turn
    // against friendly units that were ALREADY on board (!u.summoningSick) and chose not to trade:
    // (Never penalize newly deployed summoning-sick units here, or the AI will hoard cards in hand when behind on board!)
    const usedOppIndices = new Set();
    const myTargetable = me.characters
      .map((u, idx) => ({
        u,
        idx,
        atk: Engine.getUnitAtk(u),
        hp: u.curHp,
        val: weights.unitPresence + Engine.getUnitAtk(u) * weights.unitAtk + u.curHp * weights.unitHp +
          ((u.subtypes || []).includes('QUEEN') ? 5.5 : 0) +
          (u.cardId === IDS.KIT_MERRYWEATHER ? 4.5 : 0)
      }))
      .filter(item => !item.u.summoningSick && !Engine.isTargetBlockedByProvoke(me, 'character', item.idx))
      .sort((a, b) => b.val - a.val);

    for (const myTarget of myTargetable) {
      if (myTarget.u.wards > 0) continue;
      let bestGainForOpp = 0;
      let chosenOppIdx = -1;

      opp.characters.forEach((oppU, oIdx) => {
        if (usedOppIndices.has(oIdx)) return;
        const oAtk = Engine.getUnitAtk(oppU);
        if (oAtk < myTarget.hp) return; // Cannot single-hit kill myTarget without buffs

        const oHp = oppU.curHp;
        const oSafe = Engine.unitHasSafeguard(opp, oIdx) || oppU.wards > 0;
        const oVal = weights.unitPresence + oAtk * weights.unitAtk + oHp * weights.unitHp;

        let oppLoss = 0;
        if (!oSafe && myTarget.atk > 0) {
          if (myTarget.atk >= oHp) {
            oppLoss = oVal;
          } else {
            oppLoss = myTarget.atk * weights.unitHp;
          }
        }

        // Because the opponent has initiative (and can buff/Safeguard before attacking), even an "even" trade
        // where their smaller/cheaper unit trades into ours is a net win for the opponent (+3.4 initiative swing)
        const netOppGain = (myTarget.val - oppLoss) + 3.4;
        if (netOppGain > bestGainForOpp) {
          bestGainForOpp = netOppGain;
          chosenOppIdx = oIdx;
        }
      });

      if (chosenOppIdx !== -1 && bestGainForOpp > 0) {
        usedOppIndices.add(chosenOppIdx);
        penalty += bestGainForOpp * 0.9;
      }
    }

    return penalty;
  }

  // Evaluate a candidate state by simulating End of Turn (Apple Tree, Granny Cottage, Valentina, temp buff expiry)
  function scoreCandidateTurnState(simState, db, playerIndex, stepCount, weights = LEARNED_WEIGHTS) {
    if (simState.gameOver) {
      return simState.gameOver.winner === playerIndex
        ? 100000 - stepCount * 5
        : -100000 + stepCount * 5;
    }

    const eotClone = Engine.cloneStateForSim(simState);
    const detRng = mulberry32((simState.uidSeq + 17) * 2654435761);
    Engine.endTurn(eotClone, db, detRng);

    // If a pending overwrite_building opened (impossible on EOT, but safe guard), resolve it
    if (eotClone.pending && eotClone.pending.type === 'overwrite_building') {
      Engine.resolveBuildingOverwrite(eotClone, db, chooseBuildingOverwriteSlot(eotClone, db), detRng);
    }

    if (eotClone.gameOver) {
      return eotClone.gameOver.winner === playerIndex
        ? 100000 - stepCount * 5
        : -100000 + stepCount * 5;
    }

    const base = evaluateState(eotClone, db, playerIndex, weights);
    const counterPenalty = estimateOpponentCounterThreat(eotClone, db, playerIndex, weights);
    return base - counterPenalty;
  }

  // =========================================================================
  // 4. Smart Candidate Action Generator & State Deduplication Hash
  // =========================================================================

  function hashSimState(state) {
    const p0 = state.players[0];
    const p1 = state.players[1];
    const fmtPlayer = p => {
      const h = p.hand.map(c => `${c.cardId}:${c.poisoned ? 1 : 0}:${c.fated ? 1 : 0}:${c.bonusAtk}:${c.bonusHp}:${c.apReduction}`).sort().join(',');
      const b = p.buildings.map(x => (x ? `${x.cardId}:${x.charges}:${x.usedThisTurn ? 1 : 0}:${x.energyActive ? 1 : 0}` : '_')).join(',');
      const c = p.characters.map(u => `${u.cardId}:${Engine.getUnitAtk(u)}:${u.curHp}:${u.wards}:${u.intrinsicProvoke ? 1 : 0}:${u.intrinsicSafeguard || u.tempSafeguard ? 1 : 0}:${u.attackedThisTurn ? 1 : 0}:${u.summoningSick ? 1 : 0}:${u.devoteeUsedThisTurn ? 1 : 0}:${u.dubbedChampion ? 1 : 0}:${(u.siegeExtraFarewells || []).length}`).join(',');
      const hr = p.heroes.map(x => (x.usedThisTurn ? 1 : 0)).join('');
      return `${p.hp}:${p.maxHp}|${p.tempAtk}|${p.wards}|${p.heroAttackedThisTurn ? 1 : 0}|${p.ap}|${p.bonusEnergyTemp || 0}|${p.freeHeroPowerCount}|${p.stoneSoupBonus}|${hr}|${b}|${c}|${h}|${p.deck.length}`;
    };
    const pend = state.pending ? `${state.pending.type}:${state.pending.stepIndex || 0}` : '';
    return `${state.activePlayer}#${state.phase}#${state.combatUsedThisTurn ? 1 : 0}#${pend}#${fmtPlayer(p0)}#${fmtPlayer(p1)}`;
  }

  function getStrategicInsertIndices(state, db, playerIndex, def, inst) {
    const p = state.players[playerIndex];
    const len = p.characters.length;
    if (len === 0) return [0];

    const isPositional = (
      def.id === IDS.BLOODKEY_BARON ||
      def.id === IDS.GRAYBEARD_KNIGHT ||
      def.id === IDS.VALENTINA ||
      def.id === IDS.PALACE_HALBERDIER ||
      def.id === IDS.HEDGEROW_MATRON ||
      Boolean(inst.provoke) ||
      /\{provoke:?\}/i.test(def.rulesText || '') ||
      Engine.playerHasHero(p, IDS.FLYNN_BASKER) ||
      p.characters.some(u => u.intrinsicProvoke || u.cardId === IDS.GRAYBEARD_KNIGHT || u.cardId === IDS.VALENTINA)
    );

    if (isPositional || len <= 3) {
      const all = [];
      for (let i = 0; i <= len; i++) all.push(i);
      return all;
    }

    // Otherwise test leftmost (0), center, and rightmost (len)
    return Array.from(new Set([0, Math.floor(len / 2), len]));
  }

  function enumerateCandidateActions(state, db, weights = LEARNED_WEIGHTS) {
    if (state.gameOver) return [];

    // 1. Pending modal resolution (Wish or Building Overwrite)
    if (state.pending) {
      if (state.pending.type === 'wish') {
        const choice = chooseWishOptionOrPass(state, db, weights);
        return [{ kind: 'wish', choice }];
      }
      if (state.pending.type === 'overwrite_building') {
        const slot = chooseBuildingOverwriteSlot(state, db);
        return [{ kind: 'overwrite_building', slot }];
      }
      return [];
    }

    const pIdx = state.activePlayer;
    const p = state.players[pIdx];
    const opp = state.players[1 - pIdx];
    const actions = [];

    // 2. Main Phase 1 & Main Phase 2 Actions (Cards, Hero Powers, Buildings)
    if (state.phase === 'MAIN1' || state.phase === 'MAIN2') {
      const hasQueenOnBoard = Engine.playerControlsSubtype(p, 'QUEEN', db);
      let minPlayableQueenAp = Infinity;
      if (!hasQueenOnBoard && p.characters.length < Engine.MAX_CHARS) {
        for (let i = 0; i < p.hand.length; i++) {
          const cInfo = Engine.getCardPlayInfo(state, db, i);
          if (!cInfo.playable) continue;
          const cDef = db.cardMap.get(p.hand[i].cardId);
          if (cDef && cDef.type === 'character' && Engine.hasSubtype(cDef, 'QUEEN')) {
            minPlayableQueenAp = Math.min(minPlayableQueenAp, cInfo.apCost);
          }
        }
      }

      // A) Hero Powers
      for (let hIdx = 0; hIdx < p.heroes.length; hIdx++) {
        const hInfo = Engine.getHeroPowerInfo(state, db, hIdx);
        if (!hInfo.usable) continue;
        const hDef = db.cardMap.get(p.heroes[hIdx].cardId);
        if (!hDef) continue;

        if (hDef.id === IDS.BELLADONNA) {
          // Only use Belladonna if the leftmost Food in hand is NOT already Poisoned!
          const leftFood = p.hand[hInfo.leftFoodIdx];
          if (leftFood && !leftFood.poisoned) {
            actions.push({ kind: 'hero_power', heroSlotIndex: hIdx, target: null });
          }
        } else if (hDef.id === IDS.KING_VALYN) {
          // If we have enough AP to play a Queen from hand AND use King Valyn this turn, play the Queen first!
          // Otherwise allow King Valyn as long as it cannot self-lethal (p.hp > 2), letting the evaluator weigh digging vs HP.
          const canPlayQueenFirst = !hasQueenOnBoard && (p.ap >= minPlayableQueenAp + hInfo.apCost);
          if (!canPlayQueenFirst && (hasQueenOnBoard || p.hp > 2) && p.hand.length < Engine.MAX_HAND) {
            actions.push({ kind: 'hero_power', heroSlotIndex: hIdx, target: null });
          }
        } else if (hDef.id === IDS.ROSALIND) {
          p.characters.forEach(u => {
            actions.push({ kind: 'hero_power', heroSlotIndex: hIdx, target: { unitUid: u.uid } });
          });
        }
      }

      // B) Building Activations
      for (let bIdx = 0; bIdx < p.buildings.length; bIdx++) {
        const bInfo = Engine.getBuildingActionInfo(state, db, bIdx);
        if (!bInfo.usable) continue;
        const b = p.buildings[bIdx];
        if (b.cardId === IDS.OLD_CHESTNUT_SMITHY) {
          // Activate Smithy in MAIN1 before combat!
          if (state.phase === 'MAIN1' && !state.combatUsedThisTurn) {
            actions.push({ kind: 'activate_building', slotIndex: bIdx, target: null });
          }
        } else if (b.cardId === IDS.CROSSROADS_INN) {
          // Avoid frivolously drawing when deck is thin unless we actually need cards/units
          const needsInnDraw = p.deck.length > 5 || p.hand.length <= 2 || p.characters.length === 0 || opp.characters.length > p.characters.length;
          if (p.deck.length >= 2 && p.hand.length < Engine.MAX_HAND && needsInnDraw) {
            actions.push({ kind: 'activate_building', slotIndex: bIdx, target: null });
          }
        } else if (b.cardId === IDS.APPLE_TREE) {
          if (p.hand.length <= Engine.MAX_HAND - 2 && p.characters.length > 0) {
            actions.push({ kind: 'activate_building', slotIndex: bIdx, target: null });
          }
        } else if (b.cardId === IDS.VANITY_MIRROR) {
          p.characters.forEach(u => {
            actions.push({ kind: 'activate_building', slotIndex: bIdx, target: { unitUid: u.uid } });
          });
        } else if (b.cardId === IDS.GRANNY_THIMBLES_COTTAGE) {
          const curE = Engine.getPlayerEnergy(p, db);
          if (curE >= 7) {
            actions.push({ kind: 'activate_building', slotIndex: bIdx, target: { kind: 'hero', playerIndex: pIdx } });
            p.characters.forEach(u => {
              actions.push({ kind: 'activate_building', slotIndex: bIdx, target: { unitUid: u.uid } });
            });
          } else {
            if ((curE >= 5 && p.hp <= 26) || p.hp <= 18) {
              actions.push({ kind: 'activate_building', slotIndex: bIdx, target: { kind: 'hero', playerIndex: pIdx } });
            }
            p.characters.forEach(u => {
              if (u.curHp < Engine.getUnitMaxHp(u)) {
                actions.push({ kind: 'activate_building', slotIndex: bIdx, target: { unitUid: u.uid } });
              }
            });
          }
        }
      }

      // C) Hand Card Plays (deduplicating identical card instances in hand)
      const seenHandKeys = new Set();
      for (let hIdx = 0; hIdx < p.hand.length; hIdx++) {
        const inst = p.hand[hIdx];
        const handKey = `${inst.cardId}|${inst.poisoned ? 1 : 0}|${inst.fated ? 1 : 0}|${inst.bonusAtk}|${inst.bonusHp}|${inst.apReduction}|${(inst.modLines || []).join(';')}`;
        if (seenHandKeys.has(handKey)) continue;
        seenHandKeys.add(handKey);

        const info = Engine.getCardPlayInfo(state, db, hIdx);
        if (!info.playable) continue;
        const def = db.cardMap.get(inst.cardId);
        if (!def) continue;

        if (def.type === 'character') {
          const insertIndices = getStrategicInsertIndices(state, db, pIdx, def, inst);
          if (def.id === IDS.WHETSMITH_APPRENTICE && p.characters.length > 0) {
            // Pick primary insertion slot + each friendly target
            const primaryIns = insertIndices[insertIndices.length - 1];
            p.characters.forEach(u => {
              actions.push({
                kind: 'play_card',
                handIndex: hIdx,
                cardUid: inst.uid,
                opts: { insertIndex: primaryIns, target: { kind: 'unit', unitUid: u.uid } }
              });
            });
          } else {
            insertIndices.forEach(insIdx => {
              actions.push({
                kind: 'play_card',
                handIndex: hIdx,
                cardUid: inst.uid,
                opts: { insertIndex: insIdx }
              });
            });
          }
          continue;
        }

        if (def.type === 'building') {
          if (!info.isOverwrite) {
            const emptySlot = p.buildings.findIndex(b => b === null);
            actions.push({
              kind: 'play_card',
              handIndex: hIdx,
              cardUid: inst.uid,
              opts: { buildingSlot: emptySlot !== -1 ? emptySlot : 0 }
            });
          } else {
            // Only overwrite if we have a spent 0-charge building
            const spentSlot = p.buildings.findIndex(b => b && b.charges !== null && b.charges <= 0);
            if (spentSlot !== -1) {
              actions.push({
                kind: 'play_card',
                handIndex: hIdx,
                cardUid: inst.uid,
                opts: { buildingSlot: spentSlot }
              });
            }
          }
          continue;
        }

        // Spells
        switch (def.id) {
          case IDS.CROWNS_TITHE: {
            // If we have enough AP to play a Queen from hand AND cast Crown's Tithe this turn, play the Queen first
            // (strictly avoids 2 self-damage and, with Grimhilde, shuffles Poisoned Fate Apples before drawing).
            // Also don't frivolously draw 2 cards when deck is thin (<= 6 cards) unless we are low on cards or behind on board!
            const canPlayQueenFirst = !hasQueenOnBoard && (p.ap >= minPlayableQueenAp + info.apCost);
            const needsTitheDraw = p.deck.length > 6 || p.hand.length <= 2 || p.characters.length === 0 || opp.characters.length > p.characters.length;
            if (p.deck.length >= 3 && p.hand.length <= 8 && !canPlayQueenFirst && needsTitheDraw && (hasQueenOnBoard || p.hp > 2)) {
              actions.push({ kind: 'play_card', handIndex: hIdx, cardUid: inst.uid, opts: {} });
            }
            break;
          }

          case IDS.ROYAL_FAVOUR:
          case IDS.GIFT_OF_WISHING_OAK: {
            if (p.hand.length < Engine.MAX_HAND) {
              actions.push({ kind: 'play_card', handIndex: hIdx, cardUid: inst.uid, opts: {} });
            }
            break;
          }

          case IDS.UNDER_THE_GARDEN_GATE:
          case IDS.FOR_HEARTH_AND_HOLLOW: {
            actions.push({ kind: 'play_card', handIndex: hIdx, cardUid: inst.uid, opts: {} });
            break;
          }

          case IDS.WISHING_COIN: {
            actions.push({
              kind: 'play_card',
              handIndex: hIdx,
              cardUid: inst.uid,
              opts: { target: { mode: 'energy' } }
            });
            actions.push({
              kind: 'play_card',
              handIndex: hIdx,
              cardUid: inst.uid,
              opts: { target: { mode: 'ap' } }
            });
            break;
          }

          case IDS.OFF_WITH_HIS_HEAD:
          case IDS.POTS_AND_PANS: {
            // Target enemy Characters
            opp.characters.forEach(u => {
              actions.push({
                kind: 'play_card',
                handIndex: hIdx,
                cardUid: inst.uid,
                opts: { target: { kind: 'unit', unitUid: u.uid } }
              });
            });
            break;
          }

          case IDS.EAT_UP_MY_DARLING:
          case IDS.SHOWSTOPPER_GATEAU:
          case IDS.HUMBLE_PIE:
          case IDS.APPLE:
          case IDS.STONE_SOUP: {
            // Option 1: Poisoned Food is strictly committed to its reversed (-X/-Y) effect on enemy Characters!
            if (inst.poisoned) {
              opp.characters.forEach(u => {
                actions.push({
                  kind: 'play_card',
                  handIndex: hIdx,
                  cardUid: inst.uid,
                  opts: { target: { kind: 'unit', unitUid: u.uid } }
                });
              });
            } else {
              p.characters.forEach(u => {
                actions.push({
                  kind: 'play_card',
                  handIndex: hIdx,
                  cardUid: inst.uid,
                  opts: { target: { kind: 'unit', unitUid: u.uid } }
                });
              });
            }
            break;
          }

          case IDS.CUREALL_COOKIE: {
            if (inst.poisoned) {
              opp.characters.forEach(u => {
                actions.push({
                  kind: 'play_card',
                  handIndex: hIdx,
                  cardUid: inst.uid,
                  opts: { target: { kind: 'unit', unitUid: u.uid } }
                });
              });
            } else {
              p.characters.forEach(u => {
                if (u.curHp < Engine.getUnitMaxHp(u)) {
                  actions.push({
                    kind: 'play_card',
                    handIndex: hIdx,
                    cardUid: inst.uid,
                    opts: { target: { kind: 'unit', unitUid: u.uid } }
                  });
                }
              });
            }
            break;
          }

          case IDS.SUPPER_FOR_TWO: {
            if (inst.poisoned) {
              if (opp.characters.length === 1) {
                actions.push({
                  kind: 'play_card',
                  handIndex: hIdx,
                  cardUid: inst.uid,
                  opts: { target: { unitUids: [opp.characters[0].uid] } }
                });
              } else if (opp.characters.length >= 2) {
                for (let i = 0; i < opp.characters.length; i++) {
                  for (let j = i + 1; j < opp.characters.length; j++) {
                    actions.push({
                      kind: 'play_card',
                      handIndex: hIdx,
                      cardUid: inst.uid,
                      opts: { target: { unitUids: [opp.characters[i].uid, opp.characters[j].uid] } }
                    });
                  }
                }
              }
            } else {
              if (p.characters.length === 1) {
                actions.push({
                  kind: 'play_card',
                  handIndex: hIdx,
                  cardUid: inst.uid,
                  opts: { target: { unitUids: [p.characters[0].uid] } }
                });
              } else if (p.characters.length >= 2) {
                for (let i = 0; i < p.characters.length; i++) {
                  for (let j = i + 1; j < p.characters.length; j++) {
                    actions.push({
                      kind: 'play_card',
                      handIndex: hIdx,
                      cardUid: inst.uid,
                      opts: { target: { unitUids: [p.characters[i].uid, p.characters[j].uid] } }
                    });
                  }
                }
              }
            }
            break;
          }

          case IDS.DUB_THEE_CHAMPION: {
            p.characters.forEach(u => {
              actions.push({
                kind: 'play_card',
                handIndex: hIdx,
                cardUid: inst.uid,
                opts: { target: { kind: 'unit', unitUid: u.uid } }
              });
            });
            break;
          }

          case IDS.POWDERED_ROSE_JOYS: {
            const fated = Engine.isCardEffectivelyFated(state, pIdx, inst);
            const leftFoodIdx = p.hand.findIndex(c => {
              const cd = db.cardMap.get(c.cardId);
              return cd && Engine.hasSubtype(cd, 'FOOD');
            });
            const isBlockingBelladonna = Engine.playerHasHero(p, IDS.BELLADONNA) &&
              hIdx === leftFoodIdx &&
              p.hand.slice(leftFoodIdx + 1).some(c => {
                const cd = db.cardMap.get(c.cardId);
                return cd && Engine.hasSubtype(cd, 'FOOD') && !c.poisoned;
              });
            // Check if there is any other non-Rose-Joys AP play available this turn
            const hasOtherApPlay = p.hand.some((other, oIdx) => {
              if (oIdx === hIdx || other.cardId === IDS.POWDERED_ROSE_JOYS || other.cardId === IDS.WISHING_COIN) return false;
              const oInfo = Engine.getCardPlayInfo(state, db, oIdx);
              return oInfo.playable && oInfo.apCost > 0;
            }) || p.heroes.some((h, hi) => {
              const hInf = Engine.getHeroPowerInfo(state, db, hi);
              return hInf.usable && hInf.apCost > 0;
            });

            if (inst.poisoned) {
              // Poisoned Powdered Rose-Joys deals 3 damage to enemy Hero
              const canCashBurn = isBlockingBelladonna || (fated
                ? (opp.hp <= 18 || (!hasOtherApPlay && p.deck.length >= 2))
                : (opp.hp <= 9));
              if (canCashBurn) {
                actions.push({
                  kind: 'play_card',
                  handIndex: hIdx,
                  cardUid: inst.uid,
                  opts: { target: { kind: 'hero', playerIndex: opp.index } }
                });
              }
            } else {
              // Un-poisoned Powdered Rose-Joys heals friendly Hero 3 HP
              const canCashHeal = isBlockingBelladonna || (fated
                ? (p.hp <= 27 || (!hasOtherApPlay && p.hand.length <= 2 && p.deck.length >= 2))
                : (p.hp <= 20));
              if (canCashHeal) {
                actions.push({
                  kind: 'play_card',
                  handIndex: hIdx,
                  cardUid: inst.uid,
                  opts: { target: { kind: 'hero', playerIndex: pIdx } }
                });
              }
            }
            break;
          }

          case IDS.HARVEST_BANQUET: {
            if (inst.poisoned) {
              if (opp.characters.length > 0) {
                actions.push({
                  kind: 'play_card',
                  handIndex: hIdx,
                  cardUid: inst.uid,
                  opts: { target: { kind: 'hero', playerIndex: opp.index } }
                });
              }
            } else if (p.characters.length > 0) {
              actions.push({
                kind: 'play_card',
                handIndex: hIdx,
                cardUid: inst.uid,
                opts: { target: { kind: 'hero', playerIndex: pIdx } }
              });
            }
            break;
          }

          case IDS.FAIREST_OF_THEM_ALL: {
            const curE = Engine.getPlayerEnergy(p, db);
            const worthWiping = opp.characters.length >= 2 ||
              (curE >= 6 && hasQueenOnBoard && opp.characters.length >= 1) ||
              (p.characters.length === 0 && opp.characters.some(u => Engine.getUnitAtk(u) + u.curHp >= 8));
            if (worthWiping) {
              actions.push({
                kind: 'play_card',
                handIndex: hIdx,
                cardUid: inst.uid,
                opts: {}
              });
            }
            break;
          }
        }
      }
    }

    // 3. Combat Step Attacks (from MAIN1 if combat unused, or inside COMBAT)
    if ((state.phase === 'MAIN1' && !state.combatUsedThisTurn) || state.phase === 'COMBAT') {
      const readyAttackers = Engine.getReadyAttackers(state);
      const legalTargets = Engine.getLegalCombatTargets(state);

      // If in MAIN1 with ready attackers and holding a free 0-AP un-poisoned Apple/Humble Pie (with no unused Belladonna),
      // cast the 0-AP buff onto our board BEFORE entering Combat!
      const hasUnusedBella = p.heroes.some((h, hi) => h.cardId === IDS.BELLADONNA && Engine.getHeroPowerInfo(state, db, hi).usable);
      const holdingFreePreCombatBuff = state.phase === 'MAIN1' && !hasUnusedBella && p.characters.length > 0 && p.hand.some((c, hi) => {
        if (c.poisoned) return false;
        if (c.cardId !== IDS.APPLE && c.cardId !== IDS.HUMBLE_PIE) return false;
        const cInf = Engine.getCardPlayInfo(state, db, hi);
        return cInf.playable && cInf.apCost === 0;
      });

      if (readyAttackers.length > 0 && legalTargets.length > 0 && !holdingFreePreCombatBuff) {
        // Order ready attackers canonically so we don't explode symmetric permutations:
        // 1. Hero with temporary Attack (e.g. Dub Thee Champion +4/+0 & Ward, or Old Chestnut Smithy +2/+0) first so it is never pruned!
        // 2. Kit Merryweather ({Siege})
        // 3. Units with Safeguard or Ward
        // 4. Lowest Attack to Highest Attack (so 1/1s pop enemy Wards before big hitters swing!)
        const sortedAttackers = [...readyAttackers].sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'hero' ? -1 : 1;
          const uA = p.characters[a.index];
          const uB = p.characters[b.index];
          if (!uA || !uB) return 0;
          const siegeA = (uA.cardId === IDS.KIT_MERRYWEATHER || uA.dubbedChampion) ? 1 : 0;
          const siegeB = (uB.cardId === IDS.KIT_MERRYWEATHER || uB.dubbedChampion) ? 1 : 0;
          if (siegeA !== siegeB) return siegeB - siegeA;
          const safeA = Engine.unitHasSafeguard(p, a.index) ? 1 : 0;
          const safeB = Engine.unitHasSafeguard(p, b.index) ? 1 : 0;
          if (safeA !== safeB) return safeB - safeA;
          return Engine.getUnitAtk(uA) - Engine.getUnitAtk(uB);
        });

        // Allow choosing any distinct attacker type, plus if already in COMBAT, always allow ending Combat
        const attackersToBranch = state.phase === 'COMBAT'
          ? sortedAttackers.slice(0, 3) // Top 3 canonical attackers at this step
          : sortedAttackers.slice(0, 3);

        const seenAtkSignatures = new Set();
        for (const atk of attackersToBranch) {
          let sig = 'hero';
          if (atk.kind === 'character') {
            const u = p.characters[atk.index];
            sig = `${u.cardId}:${Engine.getUnitAtk(u)}:${u.curHp}:${Engine.unitHasSafeguard(p, atk.index) ? 1 : 0}:${u.wards}:${u.dubbedChampion ? 1 : 0}`;
          }
          if (seenAtkSignatures.has(sig)) continue;
          seenAtkSignatures.add(sig);

          for (const tgt of legalTargets) {
            actions.push({
              kind: 'attack',
              attacker: atk.kind === 'hero'
                ? { kind: 'hero', playerIndex: pIdx }
                : { kind: 'character', playerIndex: pIdx, unitUid: atk.unitUid },
              target: tgt.kind === 'hero'
                ? { kind: 'hero', playerIndex: tgt.playerIndex }
                : { kind: 'character', playerIndex: tgt.playerIndex, unitUid: tgt.unitUid }
            });
          }
        }
      }

      if (state.phase === 'COMBAT') {
        actions.push({ kind: 'end_combat' });
      }
    }

    return actions;
  }

  // Execute a single action object on `state` (mutating `state`)
  function applyAction(state, db, action, rng = Math.random) {
    switch (action.kind) {
      case 'wish': {
        const stepIdx = state.pending ? (state.pending.stepIndex || 0) : 0;
        const isFinal = state.pending && state.pending.options
          ? stepIdx >= state.pending.options.length - 1
          : true;
        if (action.choice === 'pass' && !isFinal) {
          const adv = Engine.advanceWish(state);
          return Boolean(adv && adv.ok);
        }
        const idx = Number.isInteger(action.choice) ? action.choice : stepIdx;
        return Engine.resolveWish(state, db, idx, rng);
      }
      case 'overwrite_building':
        return Engine.resolveBuildingOverwrite(state, db, action.slot, rng);
      case 'play_card': {
        const p = state.players[state.activePlayer];
        let hIdx = action.handIndex;
        if (action.cardUid) {
          const byUid = p.hand.findIndex(c => c.uid === action.cardUid);
          if (byUid !== -1) hIdx = byUid;
        }
        return Engine.playCard(state, db, hIdx, action.opts || {}, rng).ok;
      }
      case 'hero_power':
        return Engine.useHeroPower(state, db, action.heroSlotIndex, action.target || null, rng).ok;
      case 'activate_building':
        return Engine.activateBuilding(state, db, action.slotIndex, action.target || null, rng).ok;
      case 'attack':
        return Engine.declareAttack(state, db, action.attacker, action.target, rng).ok;
      case 'end_combat':
        return Engine.endCombatStep(state);
      case 'end_turn':
        return Engine.endTurn(state, db, rng);
      default:
        return false;
    }
  }

  // Auto-resolve any newly opened pending modals (e.g. Wish or 4/4 Building overwrite) during lookahead
  function autoResolvePendingInSim(simState, db, weights, detRng) {
    let guard = 0;
    while (simState.pending && !simState.gameOver && guard < 16) {
      guard += 1;
      if (simState.pending.type === 'wish') {
        const choice = chooseWishOptionOrPass(simState, db, weights);
        const stepIdx = simState.pending.stepIndex || 0;
        const isFinal = simState.pending.options
          ? stepIdx >= simState.pending.options.length - 1
          : true;
        if (choice === 'pass' && !isFinal) {
          const adv = Engine.advanceWish(simState);
          if (!adv || !adv.ok) {
            Engine.resolveWish(simState, db, stepIdx, detRng);
          }
        } else {
          const idx = Number.isInteger(choice) ? choice : stepIdx;
          Engine.resolveWish(simState, db, idx, detRng);
        }
      } else if (simState.pending.type === 'overwrite_building') {
        const slot = chooseBuildingOverwriteSlot(simState, db);
        Engine.resolveBuildingOverwrite(simState, db, slot, detRng);
      } else {
        break;
      }
    }
  }

  // =========================================================================
  // 5. Turn-Sequence Beam Search Lookahead Planner
  // =========================================================================

  function planTurnSequence(state, db, opts = {}) {
    const weights = opts.weights || LEARNED_WEIGHTS;
    const beamWidth = opts.beamWidth || 16;
    const maxDepth = opts.maxDepth || 14;
    const playerIndex = state.activePlayer;

    // If a pending modal is currently open on the real state, return its immediate decision
    if (state.pending) {
      const immediate = enumerateCandidateActions(state, db, weights);
      return {
        bestActions: immediate,
        bestScore: evaluateState(state, db, playerIndex, weights)
      };
    }

    const rootSim = Engine.cloneStateForSim(state);
    const rootEotScore = scoreCandidateTurnState(rootSim, db, playerIndex, 0, weights);

    let bestFinished = {
      actions: [{ kind: 'end_turn' }],
      score: rootEotScore
    };

    let beam = [{
      simState: rootSim,
      actions: [],
      midScore: evaluateState(rootSim, db, playerIndex, weights)
    }];

    const visitedHashes = new Set([hashSimState(rootSim)]);

    for (let depth = 0; depth < maxDepth; depth++) {
      const nextCandidates = [];

      for (const node of beam) {
        if (node.simState.gameOver || node.simState.activePlayer !== playerIndex) continue;

        const legal = enumerateCandidateActions(node.simState, db, weights);
        for (const act of legal) {
          const childSim = Engine.cloneStateForSim(node.simState);
          const detRng = mulberry32((childSim.uidSeq + 31 + depth * 17) * 2654435761);
          const ok = applyAction(childSim, db, act, detRng);
          if (!ok) continue;

          // If the action opened a Wish or Building Overwrite inside lookahead, resolve it
          if (childSim.pending) {
            autoResolvePendingInSim(childSim, db, weights, detRng);
          }

          const childActions = [...node.actions, act];

          // Did this action win/end the game immediately?
          if (childSim.gameOver) {
            const winScore = scoreCandidateTurnState(childSim, db, playerIndex, childActions.length, weights);
            if (winScore > bestFinished.score) {
              bestFinished = { actions: childActions, score: winScore };
            }
            if (childSim.gameOver.winner === playerIndex) {
              return { bestActions: childActions, bestScore: winScore };
            }
            continue;
          }

          const hKey = hashSimState(childSim);
          if (visitedHashes.has(hKey)) continue;
          visitedHashes.add(hKey);

          const usedCoinInPlan = childActions.some(a => a.kind === 'play_card' && a.opts && a.opts.target && a.opts.target.mode);
          const usedBellaInPlan = childActions.some(
            a => a.kind === 'hero_power' && childSim.players[playerIndex].heroes[a.heroSlotIndex]?.cardId === IDS.BELLADONNA
          );
          const usedAppleTreePreCombat = !childSim.combatUsedThisTurn &&
            Engine.getReadyAttackers(childSim).length > 0 &&
            childActions.some(a => a.kind === 'activate_building' && node.simState.players[playerIndex].buildings[a.slotIndex]?.cardId === IDS.APPLE_TREE);
          const playedSwiftPreCombat = !childSim.combatUsedThisTurn &&
            childActions.some(a => a.kind === 'play_card' && childSim.players[playerIndex].characters.some(u => u.intrinsicSwift && !u.attackedThisTurn));
          // Credit unspent ready attackers in MAIN1/COMBAT so the beam doesn't prematurely rush into COMBAT
          // (which locks out playing Swift units, Apple Tree harvests, and combat buffs) just to cash in attacks at depth 0!
          let unspentAttackPotential = 0;
          if (childSim.phase === 'MAIN1' || childSim.phase === 'COMBAT') {
            const cMe = childSim.players[playerIndex];
            for (const u of cMe.characters) {
              if (Engine.isUnitReadyToAttack(u)) {
                unspentAttackPotential += 3.6 + Math.min(8, Engine.getUnitAtk(u)) * 0.7;
              }
            }
            if (Engine.isHeroReadyToAttack(cMe)) {
              unspentAttackPotential += 3.0 + cMe.tempAtk * 0.7;
            }
          }
          const coinBridge = (usedCoinInPlan ? 11.0 : 0) + (usedBellaInPlan ? 4.5 : 0) + (usedAppleTreePreCombat ? 5.5 : 0) + (playedSwiftPreCombat ? 4.5 : 0) + unspentAttackPotential;
          const preCombatReady = !childSim.combatUsedThisTurn && Engine.getReadyAttackers(childSim).length > 0;
          const counterWeight = preCombatReady ? 0.20 : 0.85;
          const midScore = evaluateState(childSim, db, playerIndex, weights) -
            estimateOpponentCounterThreat(childSim, db, playerIndex, weights) * counterWeight + coinBridge;
          nextCandidates.push({
            simState: childSim,
            actions: childActions,
            midScore
          });
        }
      }

      if (nextCandidates.length === 0) break;

      // Keep top `beamWidth` nodes by mid-turn evaluation
      nextCandidates.sort((a, b) => b.midScore - a.midScore);
      beam = nextCandidates.slice(0, beamWidth);

      // Evaluate the top nodes at End of Turn so we track the best complete turn plan
      const checkCount = Math.min(6, beam.length);
      for (let i = 0; i < checkCount; i++) {
        const cand = beam[i];
        const eotScore = scoreCandidateTurnState(cand.simState, db, playerIndex, cand.actions.length, weights);
        if (eotScore > bestFinished.score) {
          bestFinished = {
            actions: [...cand.actions, { kind: 'end_turn' }],
            score: eotScore
          };
        }
      }
    }

    return {
      bestActions: bestFinished.actions,
      bestScore: bestFinished.score
    };
  }

  // Choose the single best next action from the current state (used by UI "AI Move / Hint" & step-by-step bot)
  function chooseNextAction(state, db, opts = {}) {
    if (state.gameOver) return null;
    if (state.phase === 'MULLIGAN') {
      const replaceIndices = chooseMulligan(state, db, state.mulliganStep, opts.weights || LEARNED_WEIGHTS);
      return { kind: 'mulligan', playerIndex: state.mulliganStep, replaceIndices };
    }
    if (state.pending) {
      const list = enumerateCandidateActions(state, db, opts.weights || LEARNED_WEIGHTS);
      return list[0] || null;
    }
    const plan = planTurnSequence(state, db, opts);
    return (plan.bestActions && plan.bestActions[0]) || { kind: 'end_turn' };
  }

  // Human-readable description of an AI action (for UI "AI Hint" toast & logs)
  function describeAction(state, db, action) {
    if (!action) return 'Pass';
    const p = state.players[state.activePlayer];
    switch (action.kind) {
      case 'mulligan':
        return action.replaceIndices.length === 0
          ? 'Keep all opening cards'
          : `Replace card slot(s) ${action.replaceIndices.map(i => i + 1).join(', ')}`;
      case 'wish':
        return action.choice === 'pass'
          ? 'Pass on current Wish offer (Push Your Luck)'
          : `Claim Wish offer #${Number(action.choice) + 1}`;
      case 'overwrite_building':
        return `Replace Building in slot #${Number(action.slot) + 1}`;
      case 'play_card': {
        const inst = p.hand[action.handIndex];
        const def = inst ? db.cardMap.get(inst.cardId) : null;
        const name = def ? def.name : 'card';
        const t = action.opts && action.opts.target;
        let tDesc = '';
        if (t) {
          if (t.mode) {
            tDesc = t.mode === 'ap' ? ' (+1 AP)' : ' (+1 Energy)';
          } else if (t.kind === 'hero') {
            tDesc = ` → ${state.players[t.playerIndex].name}`;
          } else if (t.unitUid) {
            for (const pl of state.players) {
              const u = pl.characters.find(x => x.uid === t.unitUid);
              if (u) tDesc = ` → ${db.cardMap.get(u.cardId)?.name || 'Character'}`;
            }
          }
        }
        const posDesc = (def && def.type === 'character' && action.opts && Number.isInteger(action.opts.insertIndex))
          ? ` (slot #${action.opts.insertIndex + 1})`
          : '';
        return `Play ${name}${posDesc}${tDesc}`;
      }
      case 'hero_power': {
        const hSlot = p.heroes[action.heroSlotIndex];
        const hDef = hSlot ? db.cardMap.get(hSlot.cardId) : null;
        return `Use Hero Power: ${hDef ? hDef.name : 'Hero Power'}`;
      }
      case 'activate_building': {
        const b = p.buildings[action.slotIndex];
        const bDef = b ? db.cardMap.get(b.cardId) : null;
        return `Activate Building: ${bDef ? bDef.name : 'Building'}`;
      }
      case 'attack': {
        let aName = p.name;
        if (action.attacker.kind === 'character') {
          const u = p.characters.find(x => x.uid === action.attacker.unitUid);
          if (u) aName = db.cardMap.get(u.cardId)?.name || 'Character';
        }
        let dName = state.players[1 - state.activePlayer].name;
        if (action.target.kind === 'character') {
          const opp = state.players[1 - state.activePlayer];
          const u = opp.characters.find(x => x.uid === action.target.unitUid);
          if (u) dName = db.cardMap.get(u.cardId)?.name || 'Character';
        }
        return `Attack: ${aName} → ${dName}`;
      }
      case 'end_combat':
        return 'End Combat Step → Main Phase 2';
      case 'end_turn':
        return 'End Turn';
      default:
        return action.kind;
    }
  }

  // =========================================================================
  // 6. Full Match Simulator with Per-Card Telemetry
  // =========================================================================

  function simulateMatch(db, p0Spec, p1Spec, opts = {}) {
    const seed = opts.seed !== undefined ? opts.seed : Math.floor(Math.random() * 0x7fffffff);
    const rng = mulberry32(seed);
    const firstPlayer = opts.firstPlayer === 1 ? 1 : 0;
    const p0Weights = opts.p0Weights || LEARNED_WEIGHTS;
    const p1Weights = opts.p1Weights || LEARNED_WEIGHTS;
    const beamWidth = opts.beamWidth || 12;
    const maxTurns = opts.maxTurns || 60;

    const state = Engine.createMatch(db, p0Spec, p1Spec, {
      firstPlayer,
      rng,
      simMode: true
    });

    // Telemetry tracking per seat: which cards were in deck, drawn, and played
    const telemetry = [0, 1].map(idx => ({
      deckCardIds: [...(idx === 0 ? p0Spec.cardIds : p1Spec.cardIds)],
      drawnCardIds: new Set(),
      playedCardCounts: {},
      firstPlayedTurn: {}
    }));

    // Both players mulligan
    for (let step = 0; step < 2; step++) {
      const mIdx = state.mulliganStep;
      const w = mIdx === 0 ? p0Weights : p1Weights;
      const rep = chooseMulligan(state, db, mIdx, w);
      Engine.submitMulligan(state, db, mIdx, rep, rng);
    }

    // Record initial post-mulligan hands as drawn
    for (let idx = 0; idx < 2; idx++) {
      state.players[idx].hand.forEach(inst => telemetry[idx].drawnCardIds.add(inst.cardId));
    }

    let totalActions = 0;
    let turnSafety = 0;

    while (!state.gameOver && turnSafety < maxTurns) {
      turnSafety += 1;
      const activeIdx = state.activePlayer;
      const w = activeIdx === 0 ? p0Weights : p1Weights;

      // Record current hand cards as drawn
      state.players[activeIdx].hand.forEach(inst => telemetry[activeIdx].drawnCardIds.add(inst.cardId));

      let currentPlan = [];
      let stepSafety = 0;
      while (!state.gameOver && state.activePlayer === activeIdx && stepSafety < 25) {
        stepSafety += 1;
        totalActions += 1;

        if (state.pending) {
          currentPlan = [];
          const pAct = chooseNextAction(state, db, { weights: w, beamWidth });
          if (!pAct || !applyAction(state, db, pAct, rng)) {
            Engine.endTurn(state, db, rng);
            break;
          }
          state.players[activeIdx].hand.forEach(inst => telemetry[activeIdx].drawnCardIds.add(inst.cardId));
          continue;
        }

        if (currentPlan.length === 0) {
          const planObj = planTurnSequence(state, db, { weights: w, beamWidth });
          currentPlan = planObj.bestActions ? [...planObj.bestActions] : [{ kind: 'end_turn' }];
        }

        const nextAct = currentPlan.shift() || { kind: 'end_turn' };
        const prevHandUids = new Set(state.players[activeIdx].hand.map(c => c.uid));

        if (nextAct.kind === 'play_card') {
          const p = state.players[activeIdx];
          let hIdx = nextAct.handIndex;
          if (nextAct.cardUid) {
            const byUid = p.hand.findIndex(c => c.uid === nextAct.cardUid);
            if (byUid !== -1) hIdx = byUid;
          }
          const inst = p.hand[hIdx];
          if (inst) {
            const cid = inst.cardId;
            telemetry[activeIdx].drawnCardIds.add(cid);
            telemetry[activeIdx].playedCardCounts[cid] = (telemetry[activeIdx].playedCardCounts[cid] || 0) + 1;
            if (telemetry[activeIdx].firstPlayedTurn[cid] === undefined) {
              telemetry[activeIdx].firstPlayedTurn[cid] = p.turnsTaken;
            }
          }
        }

        const ok = applyAction(state, db, nextAct, rng);
        if (!ok) {
          const fallbackPlan = planTurnSequence(state, db, { weights: w, beamWidth });
          const fbAct = (fallbackPlan.bestActions && fallbackPlan.bestActions[0]) || { kind: 'end_turn' };
          if (!applyAction(state, db, fbAct, rng)) {
            Engine.endTurn(state, db, rng);
            break;
          }
          currentPlan = (fallbackPlan.bestActions || []).slice(1);
        }

        // Record any newly drawn/Wished cards in hand
        state.players[activeIdx].hand.forEach(inst => telemetry[activeIdx].drawnCardIds.add(inst.cardId));

        // Re-plan if a modal opened or a non-token card was drawn/generated from deck/Hero Power
        if (!state.gameOver && state.activePlayer === activeIdx && nextAct.kind !== 'end_turn') {
          if (state.pending) {
            currentPlan = [];
          } else {
            const drewHiddenCard = state.players[activeIdx].hand.some(c => {
              if (prevHandUids.has(c.uid)) return false;
              const d = db.cardMap.get(c.cardId);
              return d && d.tier !== 'token';
            });
            if (drewHiddenCard) {
              currentPlan = [];
            }
          }
        }
      }
    }

    // If maxTurns reached without KO, tie-break by Hero HP + Board Atk
    let winner = state.gameOver ? state.gameOver.winner : 0;
    let reason = state.gameOver ? state.gameOver.reason : 'Turn limit tiebreaker';
    if (!state.gameOver) {
      const s0 = evaluateState(state, db, 0, BASELINE_WEIGHTS);
      winner = s0 >= 0 ? 0 : 1;
    }

    return {
      winner,
      loser: 1 - winner,
      firstPlayer,
      rounds: state.round,
      p0Turns: state.players[0].turnsTaken,
      p1Turns: state.players[1].turnsTaken,
      p0FinalHp: state.players[0].hp,
      p1FinalHp: state.players[1].hp,
      reason,
      totalActions,
      telemetry
    };
  }

  // =========================================================================
  // 7. Deck Generation, Mutation & Evolutionary League Helpers
  // =========================================================================

  function buildLegalPoolForHeroes(db, heroIds) {
    const heroDefs = heroIds.map(id => db.cardMap.get(id)).filter(Boolean);
    return db.collectibles.filter(c => Data.isCardLegalForHeroes(c, heroDefs));
  }

  function isEnergyRampCard(def) {
    if (!def) return false;
    return def.type === 'building' || def.id === IDS.MOTHER_PIPPIN;
  }

  // Ensure any deck running 4E/5E cards (or 6E Granny Thimble's Cottage) carries at least 3-4 Energy-ramp pieces
  // so decks actually curve into 4E-6E instead of bricking at 3 Base Energy!
  function enforceEnergyRampCurve(db, pool, cardIds, rng = Math.random) {
    const counts = {};
    for (const cid of cardIds) counts[cid] = (counts[cid] || 0) + 1;

    let highCostCount = 0;
    let fiveCostCount = 0;
    let hasGrannyCottage = Boolean(counts[IDS.GRANNY_THIMBLES_COTTAGE]);
    let currentRampCount = 0;

    for (const [cid, qty] of Object.entries(counts)) {
      const def = db.cardMap.get(cid);
      if (!def) continue;
      const req = Number(def.energyReq ?? 1);
      if (req >= 4) highCostCount += qty;
      if (req >= 5) fiveCostCount += qty;
      if (isEnergyRampCard(def)) currentRampCount += qty;
    }

    let minRequiredRamp = 0;
    if (fiveCostCount >= 2) {
      minRequiredRamp = 4;
    } else if (fiveCostCount === 1 || hasGrannyCottage) {
      minRequiredRamp = 3;
    } else if (highCostCount >= 1) {
      minRequiredRamp = 2;
    }

    const rampPool = pool.filter(c => isEnergyRampCard(c));
    let safety = 0;
    while (currentRampCount < minRequiredRamp && safety < 20) {
      safety += 1;
      const availableRamp = rampPool.filter(c => {
        const maxC = c.tier === 'elite' ? 1 : 2;
        return (counts[c.id] || 0) < maxC;
      });
      if (availableRamp.length === 0) break;

      const removableIds = Object.keys(counts).filter(cid => {
        if ((counts[cid] || 0) <= 0) return false;
        const d = db.cardMap.get(cid);
        return d && !isEnergyRampCard(d);
      });
      if (removableIds.length === 0) break;

      const addDef = availableRamp[Math.floor(rng() * availableRamp.length)];
      const remId = removableIds[Math.floor(rng() * removableIds.length)];
      counts[remId] -= 1;
      if (counts[remId] <= 0) delete counts[remId];
      counts[addDef.id] = (counts[addDef.id] || 0) + 1;
      currentRampCount += 1;
    }

    const out = [];
    for (const [cid, qty] of Object.entries(counts)) {
      for (let i = 0; i < qty; i++) out.push(cid);
    }
    return out;
  }

  function createRandomLegalDeckSpec(db, heroIds, name, rng = Math.random) {
    const pool = buildLegalPoolForHeroes(db, heroIds);
    // Build full multi-set of available copies (2x standard, 1x elite)
    const bag = [];
    for (const c of pool) {
      const maxC = c.tier === 'elite' ? 1 : 2;
      for (let i = 0; i < maxC; i++) bag.push(c.id);
    }
    // Shuffle bag and take 25
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = bag[i];
      bag[i] = bag[j];
      bag[j] = tmp;
    }
    const rawIds = bag.slice(0, 25);
    return {
      name,
      heroIds: [...heroIds],
      cardIds: enforceEnergyRampCurve(db, pool, rawIds, rng)
    };
  }

  function mutateDeckSpec(db, parentSpec, newName, mutationCount = 2, rng = Math.random) {
    const pool = buildLegalPoolForHeroes(db, parentSpec.heroIds);
    const counts = {};
    for (const cid of parentSpec.cardIds) {
      counts[cid] = (counts[cid] || 0) + 1;
    }

    for (let m = 0; m < mutationCount; m++) {
      const currentIds = Object.keys(counts).filter(k => counts[k] > 0);
      if (currentIds.length === 0) break;
      const removeId = currentIds[Math.floor(rng() * currentIds.length)];

      // Find legal additions not at copy cap and distinct from removeId
      const addCandidates = pool.filter(c => {
        if (c.id === removeId) return false;
        const maxC = c.tier === 'elite' ? 1 : 2;
        return (counts[c.id] || 0) < maxC;
      });
      if (addCandidates.length === 0) break;

      const addDef = addCandidates[Math.floor(rng() * addCandidates.length)];
      counts[removeId] -= 1;
      if (counts[removeId] <= 0) delete counts[removeId];
      counts[addDef.id] = (counts[addDef.id] || 0) + 1;
    }

    const cardIds = [];
    for (const [cid, qty] of Object.entries(counts)) {
      for (let i = 0; i < qty; i++) cardIds.push(cid);
    }

    return {
      name: newName,
      heroIds: [...parentSpec.heroIds],
      cardIds: enforceEnergyRampCurve(db, pool, cardIds, rng)
    };
  }

  function crossoverDeckSpecs(db, specA, specB, newName, rng = Math.random) {
    const pool = buildLegalPoolForHeroes(db, specA.heroIds);
    const combined = [...specA.cardIds, ...specB.cardIds];
    // Shuffle combined pool so cards present in both parents have 2x probability of selection!
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = combined[i];
      combined[i] = combined[j];
      combined[j] = tmp;
    }

    const counts = {};
    const cardIds = [];
    for (const cid of combined) {
      if (cardIds.length >= 25) break;
      const def = db.cardMap.get(cid);
      if (!def) continue;
      const maxC = def.tier === 'elite' ? 1 : 2;
      if ((counts[cid] || 0) < maxC) {
        counts[cid] = (counts[cid] || 0) + 1;
        cardIds.push(cid);
      }
    }

    // Top up if needed
    for (const c of pool) {
      if (cardIds.length >= 25) break;
      const maxC = c.tier === 'elite' ? 1 : 2;
      while ((counts[c.id] || 0) < maxC && cardIds.length < 25) {
        counts[c.id] = (counts[c.id] || 0) + 1;
        cardIds.push(c.id);
      }
    }

    return mutateDeckSpec(db, { name: newName, heroIds: [...specA.heroIds], cardIds }, newName, 1, rng);
  }

  // =========================================================================
  // 7. Interactive Tabletop AI Step Helper & Evolved Champion Deck Presets
  // =========================================================================

  function stepAI(state, db, weights = LEARNED_WEIGHTS) {
    if (!state || state.gameOver) return { ok: false, action: null };

    if (state.phase === 'MULLIGAN') {
      const step = state.mulliganStep;
      const picks = chooseMulligan(state, db, step, weights);
      Engine.submitMulligan(state, db, step, picks);
      return {
        ok: true,
        action: { kind: 'mulligan', desc: `Mulligan (${picks.length} replaced)` }
      };
    }

    if (state.pending) {
      if (state.pending.type === 'wish') {
        const decision = chooseWishOptionOrPass(state, db, weights);
        const stepIdx = state.pending.stepIndex || 0;
        const isFinal = stepIdx >= (state.pending.options ? state.pending.options.length - 1 : 2);
        if (decision !== 'pass' || isFinal) {
          const idx = Number.isInteger(decision) ? decision : stepIdx;
          const picked = state.pending.options[idx];
          const def = picked ? db.cardMap.get(picked.cardId) : null;
          Engine.resolveWish(state, db, idx);
          return {
            ok: true,
            action: {
              kind: 'wish_take',
              desc: `Claimed ${def ? def.name : 'Wish card'}`,
              cardId: def ? def.id : null,
              cardLive: picked ? { poisoned: Boolean(picked.poisoned), fated: Boolean(picked.fated) } : null
            }
          };
        }
        const adv = Engine.advanceWish(state);
        if (!adv || !adv.ok) {
          const finalPicked = state.pending.options ? state.pending.options[stepIdx] : null;
          const finalDef = finalPicked ? db.cardMap.get(finalPicked.cardId) : null;
          Engine.resolveWish(state, db, stepIdx);
          return {
            ok: true,
            action: {
              kind: 'wish_take',
              desc: `Claimed ${finalDef ? finalDef.name : 'final Wish card'}`,
              cardId: finalDef ? finalDef.id : null,
              cardLive: finalPicked ? { poisoned: Boolean(finalPicked.poisoned), fated: Boolean(finalPicked.fated) } : null
            }
          };
        }
        return {
          ok: true,
          action: { kind: 'wish_pass', desc: 'Passed Wish offer to push luck' }
        };
      }
      if (state.pending.type === 'overwrite_building') {
        const pick = chooseBuildingOverwriteSlot(state, db);
        Engine.resolveBuildingOverwrite(state, db, pick);
        return {
          ok: true,
          action: { kind: 'overwrite_building', desc: 'Resolved Building slot' }
        };
      }
    }

    const opts = (weights && weights.weights) ? weights : { weights: weights || LEARNED_WEIGHTS };
    const act = chooseNextAction(state, db, opts);
    if (!act) {
      Engine.endTurn(state, db);
      return { ok: true, action: { kind: 'end_turn', desc: 'End Turn' } };
    }
    const activeP = state.players[state.activePlayer];
    let cardId = null;
    let cardLive = null;
    if (act.kind === 'play_card' && activeP && activeP.hand[act.handIndex]) {
      const inst = activeP.hand[act.handIndex];
      cardId = inst.cardId;
      cardLive = { poisoned: Boolean(inst.poisoned), fated: Boolean(inst.fated) };
    } else if (act.kind === 'hero_power' && activeP && activeP.heroes[act.heroSlotIndex]) {
      cardId = activeP.heroes[act.heroSlotIndex].cardId;
    } else if (act.kind === 'activate_building' && activeP && activeP.buildings[act.slotIndex]) {
      cardId = activeP.buildings[act.slotIndex].cardId;
    }
    const desc = describeAction(state, db, act);
    const ok = applyAction(state, db, act);
    if (!ok) {
      if (state.phase === 'COMBAT') {
        Engine.endCombatStep(state);
        return { ok: true, action: { kind: 'end_combat', desc: 'End Combat Step' } };
      }
      Engine.endTurn(state, db);
      return { ok: true, action: { kind: 'end_turn', desc: 'End Turn' } };
    }
    return { ok, action: { ...act, desc, cardId, cardLive } };
  }

  const CHAMPION_DECKS = [
    {
      name: '🏆 #1 Havenhearth Pureblood (Mono-H)',
      heroIds: [IDS.ROSALIND, IDS.FLYNN_BASKER],
      cardIds: [
        IDS.BARNYARD_TROUBADOUR, IDS.BARNYARD_TROUBADOUR,
        IDS.TURNPIKE_TOLLKEEP, IDS.TURNPIKE_TOLLKEEP,
        IDS.WHETSMITH_APPRENTICE,
        IDS.CROSSROADS_INN, IDS.CROSSROADS_INN,
        IDS.FEATHERWEIGHT_LANCER, IDS.FEATHERWEIGHT_LANCER,
        IDS.GENTLE_WOODSMAN, IDS.GENTLE_WOODSMAN,
        IDS.SWEET_OLD_SOUL, IDS.SWEET_OLD_SOUL,
        IDS.MOTHER_PIPPIN,
        IDS.OLD_CHESTNUT_SMITHY, IDS.OLD_CHESTNUT_SMITHY,
        IDS.FOR_HEARTH_AND_HOLLOW, IDS.FOR_HEARTH_AND_HOLLOW,
        IDS.GRAYBEARD_KNIGHT, IDS.GRAYBEARD_KNIGHT,
        IDS.HEDGEROW_MATRON, IDS.HEDGEROW_MATRON,
        IDS.KIT_MERRYWEATHER,
        IDS.UNDER_THE_GARDEN_GATE,
        IDS.GIFT_OF_WISHING_OAK
      ]
    },
    {
      name: '🥈 #2 Red Velvet Pureblood (Mono-R)',
      heroIds: [IDS.KING_VALYN, IDS.BELLADONNA],
      cardIds: [
        IDS.COURT_TRUMPETER, IDS.COURT_TRUMPETER,
        IDS.HARRIED_HARE, IDS.HARRIED_HARE,
        IDS.ROYAL_FAVOUR, IDS.ROYAL_FAVOUR,
        IDS.PAINTED_TOPIARIES, IDS.PAINTED_TOPIARIES,
        IDS.RAVENOUS_DOWAGER, IDS.RAVENOUS_DOWAGER,
        IDS.SIXPENCE_TARTIST, IDS.SIXPENCE_TARTIST,
        IDS.VANITY_MIRROR,
        IDS.BLOODKEY_BARON,
        IDS.EAT_UP_MY_DARLING, IDS.EAT_UP_MY_DARLING,
        IDS.FAIREST_OF_THEM_ALL,
        IDS.PALACE_HALBERDIER, IDS.PALACE_HALBERDIER,
        IDS.DUB_THEE_CHAMPION,
        IDS.GRIMHILDE,
        IDS.SHOWSTOPPER_GATEAU,
        IDS.SUPPER_FOR_TWO, IDS.SUPPER_FOR_TWO,
        IDS.VALENTINA
      ]
    },
    {
      name: '🥉 #3 Poisoned Pack (Belladonna + Flynn)',
      heroIds: [IDS.BELLADONNA, IDS.FLYNN_BASKER],
      cardIds: [
        IDS.COURT_TRUMPETER,
        IDS.POWDERED_ROSE_JOYS,
        IDS.ROYAL_FAVOUR,
        IDS.TURNPIKE_TOLLKEEP, IDS.TURNPIKE_TOLLKEEP,
        IDS.WHETSMITH_APPRENTICE, IDS.WHETSMITH_APPRENTICE,
        IDS.CROSSROADS_INN, IDS.CROSSROADS_INN,
        IDS.FEATHERWEIGHT_LANCER,
        IDS.GENTLE_WOODSMAN, IDS.GENTLE_WOODSMAN,
        IDS.LADY_TIRED_OF_WAITING,
        IDS.HARVEST_BANQUET, IDS.HARVEST_BANQUET,
        IDS.MOTHER_PIPPIN,
        IDS.OLD_CHESTNUT_SMITHY,
        IDS.PALACE_HALBERDIER,
        IDS.FOR_HEARTH_AND_HOLLOW, IDS.FOR_HEARTH_AND_HOLLOW,
        IDS.GRIMHILDE,
        IDS.HEDGEROW_MATRON,
        IDS.SUPPER_FOR_TWO,
        IDS.GIFT_OF_WISHING_OAK, IDS.GIFT_OF_WISHING_OAK
      ]
    },
    {
      name: '🏅 #4 Nightshade Briar (Belladonna + Rosalind)',
      heroIds: [IDS.BELLADONNA, IDS.ROSALIND],
      cardIds: [
        IDS.BARNYARD_TROUBADOUR,
        IDS.COURT_TRUMPETER, IDS.COURT_TRUMPETER,
        IDS.POWDERED_ROSE_JOYS,
        IDS.ROYAL_FAVOUR, IDS.ROYAL_FAVOUR,
        IDS.STONE_SOUP, IDS.STONE_SOUP,
        IDS.TURNPIKE_TOLLKEEP,
        IDS.WHETSMITH_APPRENTICE, IDS.WHETSMITH_APPRENTICE,
        IDS.CROSSROADS_INN,
        IDS.FEATHERWEIGHT_LANCER,
        IDS.PAINTED_TOPIARIES, IDS.PAINTED_TOPIARIES,
        IDS.POTS_AND_PANS,
        IDS.RAVENOUS_DOWAGER,
        IDS.SIXPENCE_TARTIST,
        IDS.EAT_UP_MY_DARLING,
        IDS.MOTHER_PIPPIN,
        IDS.OLD_CHESTNUT_SMITHY,
        IDS.GRAYBEARD_KNIGHT,
        IDS.HEDGEROW_MATRON, IDS.HEDGEROW_MATRON,
        IDS.VALENTINA
      ]
    },
    {
      name: '⚔️ #5 Royal Hounds (Valyn + Flynn)',
      heroIds: [IDS.KING_VALYN, IDS.FLYNN_BASKER],
      cardIds: [
        IDS.COURT_TRUMPETER, IDS.COURT_TRUMPETER,
        IDS.HARRIED_HARE,
        IDS.POWDERED_ROSE_JOYS, IDS.POWDERED_ROSE_JOYS,
        IDS.ROYAL_FAVOUR, IDS.ROYAL_FAVOUR,
        IDS.TURNPIKE_TOLLKEEP,
        IDS.WHETSMITH_APPRENTICE,
        IDS.FEATHERWEIGHT_LANCER, IDS.FEATHERWEIGHT_LANCER,
        IDS.LADY_TIRED_OF_WAITING,
        IDS.PAINTED_TOPIARIES,
        IDS.POTS_AND_PANS,
        IDS.RAVENOUS_DOWAGER, IDS.RAVENOUS_DOWAGER,
        IDS.EAT_UP_MY_DARLING,
        IDS.HARVEST_BANQUET,
        IDS.OLD_CHESTNUT_SMITHY,
        IDS.PALACE_HALBERDIER, IDS.PALACE_HALBERDIER,
        IDS.GRAYBEARD_KNIGHT,
        IDS.HEDGEROW_MATRON, IDS.HEDGEROW_MATRON,
        IDS.SHOWSTOPPER_GATEAU
      ]
    },
    {
      name: '⚔️ #6 Crown & Cottager (Valyn + Rosalind)',
      heroIds: [IDS.KING_VALYN, IDS.ROSALIND],
      cardIds: [
        IDS.BARNYARD_TROUBADOUR, IDS.BARNYARD_TROUBADOUR,
        IDS.COURT_TRUMPETER, IDS.COURT_TRUMPETER,
        IDS.ROYAL_FAVOUR,
        IDS.WHETSMITH_APPRENTICE, IDS.WHETSMITH_APPRENTICE,
        IDS.CROSSROADS_INN, IDS.CROSSROADS_INN,
        IDS.FEATHERWEIGHT_LANCER, IDS.FEATHERWEIGHT_LANCER,
        IDS.GENTLE_WOODSMAN,
        IDS.LADY_TIRED_OF_WAITING,
        IDS.PAINTED_TOPIARIES,
        IDS.POTS_AND_PANS,
        IDS.RAVENOUS_DOWAGER,
        IDS.SWEET_OLD_SOUL, IDS.SWEET_OLD_SOUL,
        IDS.BLOODKEY_BARON,
        IDS.OLD_CHESTNUT_SMITHY,
        IDS.PALACE_HALBERDIER,
        IDS.HEDGEROW_MATRON, IDS.HEDGEROW_MATRON,
        IDS.SUPPER_FOR_TWO,
        IDS.VALENTINA
      ]
    }
  ];

  function getPresetDecks() {
    return CHAMPION_DECKS.map(d => ({
      name: d.name,
      heroIds: [...d.heroIds],
      cardIds: [...d.cardIds]
    }));
  }

  return {
    BASELINE_WEIGHTS,
    LEARNED_WEIGHTS,
    CHAMPION_DECKS,
    getPresetDecks,
    getLearnedWeights,
    setLearnedWeights,
    mulberry32,
    chooseMulligan,
    chooseWishOptionOrPass,
    scoreCardInstanceInContext,
    evaluateState,
    planTurnSequence,
    chooseNextAction,
    applyAction,
    describeAction,
    stepAI,
    simulateMatch,
    createRandomLegalDeckSpec,
    mutateDeckSpec,
    crossoverDeckSpecs
  };
});
