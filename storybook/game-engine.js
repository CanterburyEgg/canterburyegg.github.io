/* ==========================================================================
   Storybook Card Game — Deterministic Rules, Combat & Set 1 Card Engine
   ========================================================================== */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.StorybookEngine = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  // Canonical Set 1 Card IDs from /storybook/cards.json
  const IDS = {
    // Heroes (4)
    KING_VALYN: 'card_mvrdweu3_tffta',
    BELLADONNA: 'card_mvrecr9y_ejwp5',
    ROSALIND: 'card_mvree65s_0b7nf',
    FLYNN_BASKER: 'card_mvrehrld_xsd6w',

    // Red Velvet Court Collectible (20)
    OFF_WITH_HIS_HEAD: 'card_mvrhemm3_shcv5',
    CROWNS_TITHE: 'card_mvrhepzb_uh9ml',
    ROYAL_FAVOUR: 'card_mvrhmr5k_zdo17',
    EAT_UP_MY_DARLING: 'card_mvrhqoq9_hevyn',
    DUB_THEE_CHAMPION: 'card_mvridm7s_tq9zo',
    SUPPER_FOR_TWO: 'card_mvrjdrhq_s3zpe',
    SHOWSTOPPER_GATEAU: 'card_mvrjkp2l_fldzs',
    SIXPENCE_TARTIST: 'card_mvrjs6yo_7ityt',
    VANITY_MIRROR: 'card_mvrl4zqm_2es2l',
    COURT_TRUMPETER: 'card_mvrlon9p_9f5ec',
    HARRIED_HARE: 'card_mvrlp86k_0zurb',
    PALACE_HALBERDIER: 'card_mvrlqoga_r4xfg',
    RAVENOUS_DOWAGER: 'card_mvrltf84_63deu',
    GRIMHILDE: 'card_mvrm8s4w_yl17w',
    VALENTINA: 'card_mvrmdayy_71u8x',
    FAIREST_OF_THEM_ALL: 'card_mvrmfgsc_w8zmw',
    LADY_TIRED_OF_WAITING: 'card_mvrn0r4k_xbj7d',
    POWDERED_ROSE_JOYS: 'card_mvrr6xhe_863ug',
    PAINTED_TOPIARIES: 'card_mvrrbe1g_th6hb',
    BLOODKEY_BARON: 'card_mvrreqsj_fb440',

    // Havenhearth Collectible (20)
    MOTHER_PIPPIN: 'card_mvu91ysb_n31tf',
    GENTLE_WOODSMAN: 'card_mvu98w44_4w32a',
    GRAYBEARD_KNIGHT: 'card_mvu9qeuj_9159i',
    HARVEST_BANQUET: 'card_mvu9ro10_lxwsc',
    FEATHERWEIGHT_LANCER: 'card_mvu9z0mn_lncuu',
    STONE_SOUP: 'card_mvua3z8u_lvooq',
    TURNPIKE_TOLLKEEP: 'card_mvua8iwo_9p8rl',
    BARNYARD_TROUBADOUR: 'card_mvua8m73_dgs2d',
    WHETSMITH_APPRENTICE: 'card_mvuacgfm_tj74n',
    CROSSROADS_INN: 'card_mvuag3ss_ksiou',
    UNDER_THE_GARDEN_GATE: 'card_mvub5nrb_jr92d',
    HEDGEROW_MATRON: 'card_mvub7lnm_zc6eo',
    SWEET_OLD_SOUL: 'card_mvub9om9_90zba',
    HONEYWOOD_SENTRY: 'card_mvubeg8t_aufxf',
    GIFT_OF_WISHING_OAK: 'card_mvubf9tu_8fzbh',
    OLD_CHESTNUT_SMITHY: 'card_mvubxz0x_fwouj',
    FOR_HEARTH_AND_HOLLOW: 'card_mvuc1r51_affx1',
    POTS_AND_PANS: 'card_mvuc56wm_yam76',
    KIT_MERRYWEATHER: 'card_mvufxmei_c0d6f',
    GRANNY_THIMBLES_COTTAGE: 'card_mvug1oqe_xmd98',

    // Tokens (7)
    ROYAL_VANGUARD: 'card_mvrjlj56_hloy2',
    HUMBLE_PIE: 'card_mvrjsv6q_0x4k5',
    APPLE: 'card_mvrm7dum_5vanl',
    APPLE_TREE: 'card_mvuaxugh_zr4wy',
    RABBIT: 'card_mvub5qp5_3gqyh',
    CUREALL_COOKIE: 'card_mvub9r9e_8kkl1',
    WISHING_COIN: 'card_mvucoin0_boon1',

    // Hidden tentative Neutral
    OAK_WINDMILL: 'card_mvrkzy6k_fq4hz'
  };

  const MAX_HAND = 10;
  const MAX_CHARS = 6;
  const MAX_BLDGS = 4;
  const HERO_STARTING_HP = 30;
  const UNDO_STACK_CAP = 30;

  // 8 Woodland Blessings with smart-filtering rules
  const WOODLAND_BLESSINGS = [
    {
      id: 'double_triggers',
      eligible: (def, inst) => /\{(debut|farewell):?\}/i.test(def.rulesText || '') && !(inst && inst.doubleDebutFarewell),
      apply: inst => {
        inst.doubleDebutFarewell = true;
        inst.modLines.push('This Character\'s {Debut} and {Farewell} abilities trigger twice.');
      }
    },
    {
      id: 'summon_22_copy',
      eligible: (def, inst) => !(inst && inst.summon22Copy),
      apply: inst => {
        inst.summon22Copy = true;
        inst.modLines.push('When you play this Character, summon a 2/2 copy of it.');
      }
    },
    {
      id: 'buff_2_2',
      eligible: () => true,
      apply: inst => {
        inst.bonusAtk += 2;
        inst.bonusHp += 2;
        inst.modLines.push('Woodland Blessing: +2/+2.');
      }
    },
    {
      id: 'provoke_1_2',
      eligible: (def, inst) => !/\{provoke:?\}/i.test(def.rulesText || '') && !(inst && inst.provoke),
      apply: inst => {
        inst.bonusAtk += 1;
        inst.bonusHp += 2;
        inst.provoke = true;
        inst.modLines.push('{Provoke} *(+1/+2)*');
      }
    },
    {
      id: 'safeguard_2_1',
      eligible: (def, inst) => !/\{safeguard:?\}/i.test(def.rulesText || '') && !(inst && inst.safeguard),
      apply: inst => {
        inst.bonusAtk += 2;
        inst.bonusHp += 1;
        inst.safeguard = true;
        inst.modLines.push('{Safeguard} *(+2/+1)*');
      }
    },
    {
      id: 'swift_1_0',
      eligible: (def, inst) => !/\{swift:?\}/i.test(def.rulesText || '') && !(inst && inst.swift),
      apply: inst => {
        inst.bonusAtk += 1;
        inst.swift = true;
        inst.modLines.push('{Swift} *(+1/+0)*');
      }
    },
    {
      id: 'kinship_3_3',
      eligible: def => getSubtypes(def).length > 0,
      apply: inst => {
        inst.extraKinships.push({ atk: 3, hp: 3, text: '{Kinship} Give this Character +3/+3.' });
        inst.modLines.push('{Kinship} Give this Character +3/+3.');
      }
    },
    {
      id: 'ward_1_1',
      eligible: () => true,
      apply: inst => {
        inst.bonusAtk += 1;
        inst.bonusHp += 1;
        inst.debutWard += 1;
        inst.modLines.push('{Debut} Give this Character a {Ward}. *(+1/+1)*');
      }
    }
  ];

  // Utility helpers
  function getSubtypes(defOrSub) {
    const raw = typeof defOrSub === 'string' ? defOrSub : (defOrSub && defOrSub.subtype) || '';
    if (!raw.trim()) return [];
    return raw.split(/[-•,/]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
  }

  function hasSubtype(defOrSub, tag) {
    return getSubtypes(defOrSub).includes(String(tag || '').trim().toUpperCase());
  }

  function shuffleInPlace(arr, rng = Math.random) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function nextUid(state, prefix = 'id') {
    state.uidSeq = (state.uidSeq || 0) + 1;
    return `${prefix}_${state.uidSeq}`;
  }

  function logEvent(state, msg, kind = 'info') {
    if (state.simMode) return;
    state.log.push({
      seq: (state.logSeq = (state.logSeq || 0) + 1),
      turn: state.round,
      activePlayer: state.activePlayer,
      kind,
      text: msg
    });
    if (state.log.length > 250) state.log.shift();
  }

  function cloneCardInstFast(c) {
    return {
      uid: c.uid,
      cardId: c.cardId,
      owner: c.owner,
      bonusAtk: c.bonusAtk,
      bonusHp: c.bonusHp,
      apReduction: c.apReduction,
      poisoned: c.poisoned,
      fated: c.fated,
      provoke: c.provoke,
      safeguard: c.safeguard,
      swift: c.swift,
      doubleDebutFarewell: c.doubleDebutFarewell,
      summon22Copy: c.summon22Copy,
      debutWard: c.debutWard,
      extraDevotees: c.extraDevotees && c.extraDevotees.length ? c.extraDevotees.map(x => ({ ...x })) : [],
      extraKinships: c.extraKinships && c.extraKinships.length ? c.extraKinships.map(x => ({ ...x })) : [],
      modLines: c.modLines && c.modLines.length ? c.modLines.slice() : []
    };
  }

  function cloneUnitFast(u) {
    return {
      uid: u.uid,
      cardId: u.cardId,
      owner: u.owner,
      subtypes: u.subtypes,
      energyReq: u.energyReq,
      baseAtk: u.baseAtk,
      baseHp: u.baseHp,
      permAtk: u.permAtk,
      permHp: u.permHp,
      tempAtk: u.tempAtk,
      tempPosHp: u.tempPosHp,
      tempNegHp: u.tempNegHp,
      curHp: u.curHp,
      wards: u.wards,
      summoningSick: u.summoningSick,
      attackedThisTurn: u.attackedThisTurn,
      intrinsicProvoke: u.intrinsicProvoke,
      intrinsicSafeguard: u.intrinsicSafeguard,
      tempSafeguard: u.tempSafeguard,
      intrinsicSwift: u.intrinsicSwift,
      doubleDebutFarewell: u.doubleDebutFarewell,
      summon22Copy: u.summon22Copy,
      debutWard: u.debutWard,
      extraDevotees: u.extraDevotees && u.extraDevotees.length ? u.extraDevotees.map(x => ({ ...x })) : [],
      extraKinships: u.extraKinships && u.extraKinships.length ? u.extraKinships.map(x => ({ ...x })) : [],
      extraFarewells: u.extraFarewells && u.extraFarewells.length ? u.extraFarewells.map(x => ({ ...x })) : [],
      siegeExtraFarewells: u.siegeExtraFarewells && u.siegeExtraFarewells.length ? u.siegeExtraFarewells.map(x => ({ ...x })) : [],
      dubbedChampion: Boolean(u.dubbedChampion),
      devoteeUsedThisTurn: u.devoteeUsedThisTurn,
      intrinsicKinshipFired: u.intrinsicKinshipFired,
      extraKinshipsFired: u.extraKinshipsFired,
      markedDead: Boolean(u.markedDead),
      templateInst: u.summon22Copy && u.templateInst ? cloneCardInstFast(u.templateInst) : u.templateInst
    };
  }

  function cloneStateForSim(state) {
    return {
      simMode: true,
      uidSeq: state.uidSeq,
      logSeq: state.logSeq,
      round: state.round,
      firstPlayer: state.firstPlayer,
      activePlayer: state.activePlayer,
      phase: state.phase,
      combatUsedThisTurn: state.combatUsedThisTurn,
      mulliganStep: state.mulliganStep,
      players: state.players.map(p => ({
        index: p.index,
        name: p.name,
        factions: p.factions.slice(),
        isMonoFaction: p.isMonoFaction,
        heroes: p.heroes.map(h => ({ cardId: h.cardId, usedThisTurn: h.usedThisTurn })),
        hp: p.hp,
        maxHp: p.maxHp,
        tempAtk: p.tempAtk,
        wards: p.wards,
        heroAttackedThisTurn: p.heroAttackedThisTurn,
        turnsTaken: p.turnsTaken,
        baseEnergy: p.baseEnergy,
        bonusEnergyTemp: p.bonusEnergyTemp,
        ap: p.ap,
        maxAp: p.maxAp,
        freeHeroPowerCount: p.freeHeroPowerCount,
        stoneSoupBonus: p.stoneSoupBonus,
        mulliganDone: p.mulliganDone,
        deck: p.deck.map(cloneCardInstFast),
        hand: p.hand.map(cloneCardInstFast),
        graveyard: p.graveyard.slice(),
        buildings: p.buildings.map(b => (b ? { ...b } : null)),
        characters: p.characters.map(cloneUnitFast)
      })),
      pending: state.pending
        ? {
            ...state.pending,
            options: state.pending.options ? state.pending.options.map(cloneCardInstFast) : undefined
          }
        : null,
      effectQueue: state.effectQueue.length > 0 ? JSON.parse(JSON.stringify(state.effectQueue)) : [],
      gameOver: state.gameOver ? { ...state.gameOver } : null,
      log: [],
      undoStack: []
    };
  }

  function cloneGameState(state) {
    const copy = { ...state, undoStack: [] };
    return JSON.parse(JSON.stringify(copy));
  }

  function pushUndo(state) {
    if (state.simMode) return;
    if (!state.undoStack) state.undoStack = [];
    const snap = cloneGameState(state);
    state.undoStack.push(snap);
    if (state.undoStack.length > UNDO_STACK_CAP) {
      state.undoStack.shift();
    }
  }

  function undoLastAction(state) {
    if (!state.undoStack || state.undoStack.length === 0) return null;
    const prevStack = state.undoStack.slice(0, -1);
    const restored = state.undoStack[state.undoStack.length - 1];
    restored.undoStack = prevStack;
    return restored;
  }

  // Create a card instance (lives in deck, hand, Wish, or graveyard)
  function createCardInstance(state, cardId, owner) {
    return {
      uid: nextUid(state, 'card'),
      cardId,
      owner,
      bonusAtk: 0,
      bonusHp: 0,
      apReduction: 0,
      poisoned: false,
      fated: false,
      provoke: false,
      safeguard: false,
      swift: false,
      doubleDebutFarewell: false,
      summon22Copy: false,
      debutWard: 0,
      extraDevotees: [],
      extraKinships: [],
      modLines: []
    };
  }

  function cloneCardInstance(state, src, ownerOverride) {
    const cloned = JSON.parse(JSON.stringify(src));
    cloned.uid = nextUid(state, 'card');
    if (ownerOverride !== undefined) cloned.owner = ownerOverride;
    return cloned;
  }

  // Create a new match from two validated deck specifications
  // deckSpec: { name, heroIds: [id1, id2], cardIds: [25 cardIds] }
  function createMatch(db, p0Spec, p1Spec, opts = {}) {
    const rng = opts.rng || Math.random;
    const firstPlayer = opts.firstPlayer === 1 ? 1 : 0;

    const state = {
      simMode: Boolean(opts.simMode),
      uidSeq: 0,
      logSeq: 0,
      round: 1,
      firstPlayer,
      activePlayer: firstPlayer,
      phase: 'MULLIGAN', // 'MULLIGAN' | 'MAIN1' | 'COMBAT' | 'MAIN2' | 'GAME_OVER'
      combatUsedThisTurn: false,
      mulliganStep: firstPlayer, // firstPlayer mulligans 4, then secondPlayer mulligans 5
      players: [],
      pending: null,     // { type: 'wish' | 'overwrite_building', ... }
      effectQueue: [],
      gameOver: null,    // { winner: 0|1, loser: 0|1, reason: string }
      log: [],
      undoStack: []
    };

    const specs = [p0Spec, p1Spec];
    for (let idx = 0; idx < 2; idx++) {
      const spec = specs[idx];
      const heroDefs = spec.heroIds.map(id => db.cardMap.get(id)).filter(Boolean);
      const factions = Array.from(new Set(heroDefs.map(h => h.faction)));
      const deckInsts = spec.cardIds.map(cid => createCardInstance(state, cid, idx));
      shuffleInPlace(deckInsts, rng);

      const openingCount = idx === firstPlayer ? 4 : 5;
      const openingHand = deckInsts.splice(0, openingCount);

      state.players.push({
        index: idx,
        name: spec.name || `Player ${idx + 1}`,
        factions,
        isMonoFaction: heroDefs.length === 2 && heroDefs[0].faction === heroDefs[1].faction,
        heroes: heroDefs.map(h => ({
          cardId: h.id,
          usedThisTurn: false
        })),
        hp: HERO_STARTING_HP,
        maxHp: HERO_STARTING_HP,
        tempAtk: 0,
        wards: 0,
        heroAttackedThisTurn: false,
        turnsTaken: 0,
        baseEnergy: 0,
        bonusEnergyTemp: 0,
        ap: 0,
        maxAp: 0,
        freeHeroPowerCount: 0,
        stoneSoupBonus: 0,
        mulliganDone: false,
        deck: deckInsts,
        hand: openingHand,
        graveyard: [],
        buildings: [null, null, null, null],
        characters: []
      });
    }

    logEvent(state, `Match begins! ${state.players[firstPlayer].name} goes first (4-card mulligan); ${state.players[1 - firstPlayer].name} goes second (5-card mulligan).`, 'turn');

    if (opts.skipMulligan) {
      submitMulligan(state, db, firstPlayer, [], rng);
      submitMulligan(state, db, 1 - firstPlayer, [], rng);
    }

    return state;
  }

  // Selective once-per-game mulligan: replaced indices aren't immediately redrawn unless deck < count
  function submitMulligan(state, db, playerIndex, replaceIndices = [], rng = Math.random) {
    if (state.phase !== 'MULLIGAN' || state.mulliganStep !== playerIndex) return false;
    const p = state.players[playerIndex];
    if (p.mulliganDone) return false;

    const idxSet = new Set(
      (replaceIndices || [])
        .map(Number)
        .filter(i => Number.isInteger(i) && i >= 0 && i < p.hand.length)
    );

    if (idxSet.size > 0) {
      const setAside = [];
      const kept = [];
      p.hand.forEach((inst, i) => {
        if (idxSet.has(i)) setAside.push(inst);
        else kept.push(inst);
      });

      const drawCount = Math.min(setAside.length, p.deck.length);
      const replacements = p.deck.splice(0, drawCount);
      // Put set-aside cards back into deck and shuffle
      p.deck.push(...setAside);
      shuffleInPlace(p.deck, rng);
      // If deck was somehow smaller than drawCount, fill remainder
      while (replacements.length < setAside.length && p.deck.length > 0) {
        replacements.push(p.deck.shift());
      }
      p.hand = [...kept, ...replacements];
      logEvent(state, `${p.name} replaced ${setAside.length} card${setAside.length === 1 ? '' : 's'} in the mulligan.`);
    } else {
      logEvent(state, `${p.name} kept their opening hand.`);
    }

    p.mulliganDone = true;
    const other = 1 - playerIndex;
    if (!state.players[other].mulliganDone) {
      state.mulliganStep = other;
    } else {
      const secondIdx = 1 - state.firstPlayer;
      if (db.cardMap && db.cardMap.has(IDS.WISHING_COIN)) {
        addInstanceToHand(
          state,
          db,
          secondIdx,
          createCardInstance(state, IDS.WISHING_COIN, secondIdx),
          'Going Second'
        );
      }
      startTurn(state, db, state.firstPlayer, rng);
    }
    return true;
  }

  // Computed stats & threshold helpers
  // Buildings do NOT provide their +Energy on the turn they enter play — it comes online at {Start of Turn}!
  function getPlayerEnergy(player, db) {
    let bldgE = 0;
    for (const b of player.buildings) {
      if (!b || b.energyActive === false) continue;
      const def = db.cardMap.get(b.cardId);
      bldgE += Number(def?.energyProvided ?? b.energyProvided ?? 0);
    }
    return player.baseEnergy + (player.bonusEnergyTemp || 0) + bldgE;
  }

  function getPendingBuildingEnergy(player, db) {
    let pendingE = 0;
    for (const b of player.buildings) {
      if (!b || b.energyActive !== false) continue;
      const def = db.cardMap.get(b.cardId);
      pendingE += Number(def?.energyProvided ?? b.energyProvided ?? 0);
    }
    return pendingE;
  }

  function playerControlsSubtype(player, tag, db) {
    return player.characters.some(u => {
      const def = db.cardMap.get(u.cardId);
      return def && hasSubtype(def, tag);
    });
  }

  function playerHasHero(player, heroCardId) {
    return player.heroes.some(h => h.cardId === heroCardId);
  }

  function isCardEffectivelyFated(state, playerIndex, inst) {
    if (!inst) return false;
    if (inst.fated) return true;
    if (inst.cardId === IDS.POWDERED_ROSE_JOYS) {
      const p = state.players[playerIndex];
      // Queen check uses stored unit subtypes
      return p.characters.some(u => (u.subtypes || []).includes('QUEEN'));
    }
    return false;
  }

  function getEffectiveApCost(state, playerIndex, inst, db) {
    const def = db.cardMap.get(inst.cardId);
    if (!def) return 0;
    if (isCardEffectivelyFated(state, playerIndex, inst)) return 0;
    const base = Number(def.apCost ?? 1);
    return Math.max(0, base - (inst.apReduction || 0));
  }

  function getEffectiveHeroApCost(player, heroSlot, db) {
    const def = db.cardMap.get(heroSlot.cardId);
    if (!def || def.type !== 'hero_active') return 0;
    const m = String(def.rulesText || '').match(/\{(\d+)AP\}\s*:/i);
    const base = m ? parseInt(m[1], 10) : Number(def.apCost ?? 1);
    if (base > 0 && player.freeHeroPowerCount > 0) return 0;
    return base;
  }

  function getUnitAtk(unit) {
    return Math.max(0, unit.baseAtk + unit.permAtk + unit.tempAtk);
  }

  function getUnitMaxHp(unit) {
    return unit.baseHp + unit.permHp + unit.tempPosHp - unit.tempNegHp;
  }

  function unitHasSafeguard(player, unitIdx) {
    const u = player.characters[unitIdx];
    if (!u) return false;
    if (u.intrinsicSafeguard || u.tempSafeguard) return true;
    if (playerHasHero(player, IDS.FLYNN_BASKER)) {
      const leftCount = unitIdx;
      const rightCount = player.characters.length - 1 - unitIdx;
      if (leftCount >= 2 && rightCount >= 2) return true;
    }
    return false;
  }

  function isTargetBlockedByProvoke(defPlayer, targetKind, targetIdx = -1) {
    if (targetKind === 'hero') {
      return defPlayer.characters.some(u => u.intrinsicProvoke);
    }
    if (targetKind === 'character') {
      const target = defPlayer.characters[targetIdx];
      if (!target) return true;
      if (target.intrinsicProvoke) return false;
      const left = targetIdx > 0 ? defPlayer.characters[targetIdx - 1] : null;
      const right = targetIdx < defPlayer.characters.length - 1 ? defPlayer.characters[targetIdx + 1] : null;
      return Boolean((left && left.intrinsicProvoke) || (right && right.intrinsicProvoke));
    }
    return false;
  }

  function getLegalCombatTargets(state) {
    const opp = state.players[1 - state.activePlayer];
    const targets = [];
    if (!isTargetBlockedByProvoke(opp, 'hero')) {
      targets.push({ kind: 'hero', playerIndex: opp.index });
    }
    opp.characters.forEach((u, idx) => {
      if (!isTargetBlockedByProvoke(opp, 'character', idx)) {
        targets.push({ kind: 'character', playerIndex: opp.index, unitUid: u.uid, index: idx });
      }
    });
    return targets;
  }

  function isUnitReadyToAttack(unit) {
    if (!unit || unit.attackedThisTurn) return false;
    if (unit.summoningSick && !unit.intrinsicSwift) return false;
    return getUnitAtk(unit) > 0;
  }

  function isHeroReadyToAttack(player) {
    return !player.heroAttackedThisTurn && player.tempAtk > 0;
  }

  function getReadyAttackers(state) {
    const p = state.players[state.activePlayer];
    const legal = getLegalCombatTargets(state);
    if (legal.length === 0) return [];
    const list = [];
    if (isHeroReadyToAttack(p)) {
      list.push({ kind: 'hero', playerIndex: p.index });
    }
    p.characters.forEach((u, idx) => {
      if (isUnitReadyToAttack(u)) {
        list.push({ kind: 'character', playerIndex: p.index, unitUid: u.uid, index: idx });
      }
    });
    return list;
  }

  // Turn transitions
  function startTurn(state, db, playerIndex, rng = Math.random) {
    if (state.gameOver) return;
    state.activePlayer = playerIndex;
    if (playerIndex === state.firstPlayer && state.players[playerIndex].turnsTaken > 0) {
      state.round += 1;
    }

    const p = state.players[playerIndex];
    p.turnsTaken += 1;
    const scale = Math.min(3, p.turnsTaken);
    p.baseEnergy = scale;
    p.bonusEnergyTemp = 0;
    p.maxAp = scale;
    p.ap = scale;
    p.freeHeroPowerCount = 0;
    p.tempAtk = 0;
    p.heroAttackedThisTurn = false;
    p.heroes.forEach(h => { h.usedThisTurn = false; });
    p.buildings.forEach(b => {
      if (b) {
        b.usedThisTurn = false;
        b.energyActive = true;
      }
    });
    p.characters.forEach(u => {
      u.summoningSick = false;
      u.attackedThisTurn = false;
      u.devoteeUsedThisTurn = false;
      u.tempSafeguard = false;
    });

    state.phase = 'MAIN1';
    state.combatUsedThisTurn = false;

    logEvent(state, `— ${p.name}'s Turn ${p.turnsTaken} (${getPlayerEnergy(p, db)}E, ${p.ap} AP) —`, 'turn');

    // Start-of-turn +1 card draw (MTG-style empty deck loss)
    drawCard(state, db, playerIndex);

    // Queue any {Start of Turn} triggers if future/custom cards use it
    drainQueue(state, db, rng);
  }

  function endCombatStep(state) {
    if (state.gameOver || state.pending) return false;
    if (state.phase !== 'COMBAT') return false;
    state.phase = 'MAIN2';
    logEvent(state, `${state.players[state.activePlayer].name} enters Main Phase 2.`);
    return true;
  }

  function endTurn(state, db, rng = Math.random) {
    if (state.gameOver || state.pending) return false;
    if (state.phase !== 'MAIN1' && state.phase !== 'COMBAT' && state.phase !== 'MAIN2') return false;

    pushUndo(state);
    const pIdx = state.activePlayer;
    const p = state.players[pIdx];

    // Queue {End of Turn} triggers cleanly: Characters (snapshot UIDs left-to-right)
    p.characters.forEach(u => {
      if (u.cardId === IDS.VALENTINA) {
        state.effectQueue.push({ op: 'eot_valentina', playerIndex: pIdx, unitUid: u.uid });
      }
    });

    state.effectQueue.push({ op: 'cleanup_and_pass', playerIndex: pIdx });
    drainQueue(state, db, rng);
    return true;
  }

  function cleanupTempBuffsForBothSides(state, db) {
    for (const pl of state.players) {
      pl.tempAtk = 0;
      pl.bonusEnergyTemp = 0;
      pl.freeHeroPowerCount = 0;
      pl.buildings.forEach(b => { if (b) b.devoteeUsedThisTurn = false; });
      for (const u of pl.characters) {
        u.tempAtk = 0;
        u.tempSafeguard = false;
        u.devoteeUsedThisTurn = false;
        // 1. Restore any temporary -HP shrink first
        if (u.tempNegHp > 0) {
          const restore = u.tempNegHp;
          u.tempNegHp = 0;
          u.curHp += restore;
        }
        // 2. Expire temporary +HP cushion (Hearthstone style: clamp curHp <= newMaxHp)
        if (u.tempPosHp > 0) {
          u.tempPosHp = 0;
          const newMax = getUnitMaxHp(u);
          if (u.curHp > newMax) u.curHp = newMax;
        }
      }
    }
    reapDeaths(state, db);
  }

  // Win/Loss helper
  function declareGameOver(state, winnerIdx, reason) {
    if (state.gameOver) return;
    state.gameOver = {
      winner: winnerIdx,
      loser: 1 - winnerIdx,
      reason
    };
    state.phase = 'GAME_OVER';
    state.pending = null;
    state.effectQueue = [];
    logEvent(state, `★ ${state.players[winnerIdx].name} wins! (${reason})`, 'win');
  }

  function checkHeroDeaths(state) {
    if (state.gameOver) return true;
    const p0Dead = state.players[0].hp <= 0;
    const p1Dead = state.players[1].hp <= 0;
    if (p0Dead && p1Dead) {
      // Active player caused simultaneous self+enemy KO -> opponent wins (or active loses)
      const loser = state.activePlayer;
      declareGameOver(state, 1 - loser, `Both Heroes fell to 0 HP simultaneously`);
      return true;
    }
    if (p0Dead) {
      declareGameOver(state, 1, `${state.players[0].name} fell to 0 HP`);
      return true;
    }
    if (p1Dead) {
      declareGameOver(state, 0, `${state.players[1].name} fell to 0 HP`);
      return true;
    }
    return false;
  }

  // Draw & Hand generation rules
  function addInstanceToHand(state, db, playerIndex, inst, sourceLabel = '') {
    const p = state.players[playerIndex];
    const def = db.cardMap.get(inst.cardId);
    const name = def ? def.name : inst.cardId;
    inst.owner = playerIndex;
    if (p.hand.length >= MAX_HAND) {
      logEvent(state, `${p.name}'s hand is full (10/10) — ${name}${sourceLabel ? ` from ${sourceLabel}` : ''} burned!`, 'warn');
      return false;
    }
    p.hand.push(inst);
    return true;
  }

  function drawCard(state, db, playerIndex) {
    if (state.gameOver) return null;
    const p = state.players[playerIndex];
    if (p.deck.length === 0) {
      declareGameOver(state, 1 - playerIndex, `${p.name} attempted to draw from an empty deck`);
      return null;
    }
    const inst = p.deck.shift();
    const def = db.cardMap.get(inst.cardId);
    if (p.hand.length >= MAX_HAND) {
      p.graveyard.push(inst);
      logEvent(state, `${p.name} overdrew at 10/10 — ${def ? def.name : 'a card'} burned!`, 'warn');
      return null;
    }
    p.hand.push(inst);
    logEvent(state, `${p.name} drew a card.`);
    return inst;
  }

  function drawFilteredCharacter(state, db, playerIndex, sourceName) {
    if (state.gameOver) return null;
    const p = state.players[playerIndex];
    if (p.deck.length === 0) {
      declareGameOver(state, 1 - playerIndex, `${p.name} attempted to draw from an empty deck (${sourceName})`);
      return null;
    }
    const idx = p.deck.findIndex(inst => {
      const def = db.cardMap.get(inst.cardId);
      return def && def.type === 'character';
    });
    if (idx === -1) {
      logEvent(state, `${sourceName}: ${p.name} has no Characters left in deck.`);
      return null;
    }
    const [inst] = p.deck.splice(idx, 1);
    const def = db.cardMap.get(inst.cardId);
    if (p.hand.length >= MAX_HAND) {
      p.graveyard.push(inst);
      logEvent(state, `${p.name} overdrew ${def ? def.name : 'a Character'} from ${sourceName} (10/10 hand)!`, 'warn');
      return null;
    }
    p.hand.push(inst);
    logEvent(state, `${p.name} drew a Character with ${sourceName}.`);
    return inst;
  }

  // Damage, Healing & Stat Modifiers
  function dealDamageToHero(state, targetPlayerIndex, amount, sourceLabel = '') {
    if (amount <= 0 || state.gameOver) return 0;
    const p = state.players[targetPlayerIndex];
    if (p.wards > 0) {
      p.wards -= 1;
      logEvent(state, `${p.name}'s Ward blocked ${amount} damage${sourceLabel ? ` from ${sourceLabel}` : ''}!`);
      return 0;
    }
    p.hp -= amount;
    logEvent(state, `${p.name} took ${amount} damage${sourceLabel ? ` from ${sourceLabel}` : ''} (${p.hp} HP).`, 'dmg');
    checkHeroDeaths(state);
    return amount;
  }

  function healHero(state, targetPlayerIndex, amount, sourceLabel = '') {
    if (amount <= 0 || state.gameOver) return 0;
    const p = state.players[targetPlayerIndex];
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    const healed = p.hp - before;
    logEvent(state, `${p.name} healed ${healed} HP${sourceLabel ? ` from ${sourceLabel}` : ''} (${p.hp}/${p.maxHp}).`, 'heal');
    return healed;
  }

  function dealDamageToUnit(state, db, unit, amount, sourceLabel = '', autoReap = true) {
    if (!unit || amount <= 0 || state.gameOver) return 0;
    const def = db.cardMap.get(unit.cardId);
    const name = def ? def.name : 'Character';
    if (unit.wards > 0) {
      unit.wards -= 1;
      logEvent(state, `${name}'s Ward blocked ${amount} damage${sourceLabel ? ` from ${sourceLabel}` : ''}!`);
      return 0;
    }
    unit.curHp -= amount;
    logEvent(state, `${name} took ${amount} damage${sourceLabel ? ` from ${sourceLabel}` : ''} (${unit.curHp}/${getUnitMaxHp(unit)}).`, 'dmg');
    if (autoReap) reapDeaths(state, db);
    return amount;
  }

  function healUnit(state, db, unit, amount, sourceLabel = '') {
    if (!unit || amount <= 0 || state.gameOver) return 0;
    const def = db.cardMap.get(unit.cardId);
    const maxHp = getUnitMaxHp(unit);
    const before = unit.curHp;
    unit.curHp = Math.min(maxHp, unit.curHp + amount);
    const healed = unit.curHp - before;
    logEvent(state, `${def ? def.name : 'Character'} healed ${healed} HP${sourceLabel ? ` from ${sourceLabel}` : ''} (${unit.curHp}/${maxHp}).`, 'heal');
    return healed;
  }

  function applyStatMod(state, db, unit, dAtk, dHp, isTemp = false, sourceLabel = '', autoReap = true) {
    if (!unit || state.gameOver) return;
    const def = db.cardMap.get(unit.cardId);
    const name = def ? def.name : 'Character';

    if (isTemp) {
      unit.tempAtk += dAtk;
      if (dHp > 0) {
        unit.tempPosHp += dHp;
        unit.curHp += dHp;
      } else if (dHp < 0) {
        const mag = Math.abs(dHp);
        unit.tempNegHp += mag;
        unit.curHp -= mag;
      }
    } else {
      unit.permAtk += dAtk;
      unit.permHp += dHp;
      unit.curHp += dHp;
    }

    const fmt = n => (n >= 0 ? `+${n}` : `${n}`);
    logEvent(
      state,
      `${name} got ${fmt(dAtk)}/${fmt(dHp)}${isTemp ? ' this turn' : ''}${sourceLabel ? ` (${sourceLabel})` : ''} → ${getUnitAtk(unit)}/${unit.curHp}.`,
      dHp < 0 || dAtk < 0 ? 'dmg' : 'buff'
    );
    if (autoReap) reapDeaths(state, db);
  }

  function killUnit(state, db, unit, sourceLabel = '', autoReap = true) {
    if (!unit) return;
    unit.markedDead = true;
    const def = db.cardMap.get(unit.cardId);
    logEvent(state, `${def ? def.name : 'Character'} was destroyed${sourceLabel ? ` by ${sourceLabel}` : ''}!`, 'dmg');
    if (autoReap) reapDeaths(state, db);
  }

  function findUnitLocation(state, unitUid) {
    for (let pIdx = 0; pIdx < 2; pIdx++) {
      const idx = state.players[pIdx].characters.findIndex(u => u.uid === unitUid);
      if (idx !== -1) {
        return { playerIndex: pIdx, index: idx, unit: state.players[pIdx].characters[idx] };
      }
    }
    return null;
  }

  // Reap all Characters with curHp <= 0 or markedDead, preserving neighbor & slot snapshots for Farewell
  function reapDeaths(state, db) {
    if (state.gameOver) return;
    const order = [state.activePlayer, 1 - state.activePlayer];
    const farewellRecords = [];

    for (const pIdx of order) {
      const p = state.players[pIdx];
      const deadIndices = new Set();
      p.characters.forEach((u, i) => {
        if (u.markedDead || u.curHp <= 0) deadIndices.add(i);
      });
      if (deadIndices.size === 0) continue;

      p.characters.forEach((u, i) => {
        if (!deadIndices.has(i)) return;
        // Find nearest surviving ally to the left so Farewell summons spawn in the exact vacated spot
        let leftSurvivorUid = null;
        for (let k = i - 1; k >= 0; k--) {
          if (!deadIndices.has(k)) {
            leftSurvivorUid = p.characters[k].uid;
            break;
          }
        }
        const rightNeighbor = i < p.characters.length - 1 ? p.characters[i + 1] : null;
        farewellRecords.push({
          playerIndex: pIdx,
          unit: u,
          leftSurvivorUid,
          rightNeighborUid: rightNeighbor ? rightNeighbor.uid : null
        });
      });

      p.characters = p.characters.filter((u, i) => {
        if (!deadIndices.has(i)) return true;
        const def = db.cardMap.get(u.cardId);
        // Store dead card reference in graveyard
        const gyEntry = createCardInstance(state, u.cardId, pIdx);
        p.graveyard.push(gyEntry);
        if (!u.markedDead) {
          logEvent(state, `${def ? def.name : 'Character'} died.`, 'dmg');
        }
        return false;
      });
    }

    if (farewellRecords.length > 0) {
      // Queue Farewells at the FRONT of effectQueue in exact death order so nested Farewells stay deterministic
      const steps = [];
      for (const rec of farewellRecords) {
        const times = rec.unit.doubleDebutFarewell ? 2 : 1;
        for (let t = 0; t < times; t++) {
          steps.push({
            op: 'run_farewell',
            playerIndex: rec.playerIndex,
            unit: rec.unit,
            leftSurvivorUid: rec.leftSurvivorUid,
            rightNeighborUid: rec.rightNeighborUid
          });
        }
      }
      state.effectQueue.unshift(...steps);
    }
  }

  // Board Character Construction & Summon Placement Law
  function buildUnitFromCardInstance(state, db, playerIndex, inst, override22 = false) {
    const def = db.cardMap.get(inst.cardId);
    const rawRules = def ? (def.rulesText || '') : '';
    const baseAtk = override22 ? 2 : (Number(def?.attack ?? 0) + (inst.bonusAtk || 0));
    const baseHp = Math.max(1, override22 ? 2 : (Number(def?.health ?? 1) + (inst.bonusHp || 0)));

    // Note Honeywood Sentry says "{Kinship} This gains {Safeguard}" and Valentina says "...summon a 2/4 Royal Vanguard. Give it {Provoke}."
    // Only grant intrinsic keywords when they are standalone unit keywords (or from Woodland Blessings on `inst`), not conditional/token grants!
    const hasPlainProvoke = Boolean(
      inst.provoke ||
      def?.id === IDS.PALACE_HALBERDIER ||
      (/\{provoke:?\}/i.test(rawRules) && !/(?:give\s+it|gains?|\{end of turn:?\}|\{kinship:?\}|\{debut:?\})[^.\n]*\{provoke:?\}/i.test(rawRules))
    );
    const hasPlainSafeguard = Boolean(
      inst.safeguard ||
      (def?.id === IDS.PALACE_HALBERDIER) ||
      (/\{safeguard:?\}/i.test(rawRules) && !/\{kinship:?\}[^.\n]*\{safeguard:?\}/i.test(rawRules))
    );
    const hasPlainSwift = Boolean(inst.swift || /\{swift:?\}/i.test(rawRules));

    return {
      uid: nextUid(state, 'unit'),
      cardId: inst.cardId,
      owner: playerIndex,
      subtypes: getSubtypes(def),
      energyReq: Number(def?.energyReq ?? 1),
      baseAtk,
      baseHp,
      permAtk: 0,
      permHp: 0,
      tempAtk: 0,
      tempPosHp: 0,
      tempNegHp: 0,
      curHp: baseHp,
      wards: 0,
      summoningSick: true,
      attackedThisTurn: false,
      intrinsicProvoke: hasPlainProvoke,
      intrinsicSafeguard: hasPlainSafeguard,
      tempSafeguard: false,
      intrinsicSwift: hasPlainSwift,
      doubleDebutFarewell: Boolean(inst.doubleDebutFarewell),
      summon22Copy: Boolean(inst.summon22Copy),
      debutWard: Number(inst.debutWard || 0),
      extraDevotees: inst.extraDevotees && inst.extraDevotees.length ? inst.extraDevotees.map(x => ({ ...x })) : [],
      extraKinships: inst.extraKinships && inst.extraKinships.length ? inst.extraKinships.map(x => ({ ...x })) : [],
      extraFarewells: [],
      siegeExtraFarewells: [],
      dubbedChampion: false,
      devoteeUsedThisTurn: false,
      intrinsicKinshipFired: false,
      extraKinshipsFired: false,
      templateInst: inst.summon22Copy ? cloneCardInstFast(inst) : inst
    };
  }

  function insertSummonedUnit(state, db, playerIndex, unit, insertIndex) {
    const p = state.players[playerIndex];
    if (p.characters.length >= MAX_CHARS) return false;
    const clamped = Math.max(0, Math.min(p.characters.length, insertIndex));
    p.characters.splice(clamped, 0, unit);
    return true;
  }

  function summonTokenCharacter(state, db, playerIndex, tokenCardId, placement, extraSetup = null) {
    const p = state.players[playerIndex];
    if (p.characters.length >= MAX_CHARS) return null;
    const inst = createCardInstance(state, tokenCardId, playerIndex);
    const unit = buildUnitFromCardInstance(state, db, playerIndex, inst, false);
    if (typeof extraSetup === 'function') extraSetup(unit);

    let insertIdx = p.characters.length; // Default: far right (Spells / Buildings)
    if (placement && placement.mode === 'left_of_uid') {
      const anchorIdx = p.characters.findIndex(u => u.uid === placement.uid);
      insertIdx = anchorIdx !== -1 ? anchorIdx : 0;
    } else if (placement && placement.mode === 'right_of_uid') {
      const anchorIdx = p.characters.findIndex(u => u.uid === placement.uid);
      insertIdx = anchorIdx !== -1 ? anchorIdx + 1 : p.characters.length;
    } else if (placement && placement.mode === 'after_left_survivor') {
      if (!placement.leftUid) {
        insertIdx = 0;
      } else {
        const leftIdx = p.characters.findIndex(u => u.uid === placement.leftUid);
        insertIdx = leftIdx !== -1 ? leftIdx + 1 : 0;
      }
    } else if (placement && typeof placement.index === 'number') {
      insertIdx = placement.index;
    }

    insertSummonedUnit(state, db, playerIndex, unit, insertIdx);
    const def = db.cardMap.get(tokenCardId);
    logEvent(state, `${p.name} summoned ${def ? def.name : 'a token'} (${getUnitAtk(unit)}/${unit.curHp}).`);
    checkKinships(state, db, playerIndex);
    return unit;
  }

  function summonExactBoardCopy(state, db, playerIndex, sourceUnit, insertIdxOverride = null) {
    const p = state.players[playerIndex];
    if (p.characters.length >= MAX_CHARS || !sourceUnit) return null;
    const copy = cloneUnitFast(sourceUnit);
    copy.uid = nextUid(state, 'unit');
    copy.owner = playerIndex;
    copy.summoningSick = true;
    copy.attackedThisTurn = false;
    copy.devoteeUsedThisTurn = false;
    // A newly summoned Character gets its own fresh Kinship tracking unless already intrinsic on Honeywood
    const insertIdx = insertIdxOverride !== null ? insertIdxOverride : p.characters.length;
    insertSummonedUnit(state, db, playerIndex, copy, insertIdx);
    const def = db.cardMap.get(copy.cardId);
    logEvent(state, `${p.name} summoned an exact copy of ${def ? def.name : 'Character'} (${getUnitAtk(copy)}/${copy.curHp}).`);
    checkKinships(state, db, playerIndex);
    return copy;
  }

  // {Kinship}: fires once per Character as soon as another friendly Character shares any subtype
  function checkKinships(state, db, playerIndex) {
    if (state.gameOver) return;
    const p = state.players[playerIndex];
    for (const u of p.characters) {
      const mySubs = u.subtypes || [];
      if (mySubs.length === 0) continue;
      const hasKin = p.characters.some(other =>
        other.uid !== u.uid && (other.subtypes || []).some(s => mySubs.includes(s))
      );
      if (!hasKin) continue;

      if (!u.intrinsicKinshipFired) {
        if (u.cardId === IDS.BARNYARD_TROUBADOUR) {
          u.intrinsicKinshipFired = true;
          state.effectQueue.push({ op: 'kinship_troubadour', playerIndex, unitUid: u.uid });
        } else if (u.cardId === IDS.HONEYWOOD_SENTRY) {
          u.intrinsicKinshipFired = true;
          u.intrinsicSafeguard = true;
          logEvent(state, `Honeywood Sentry's Kinship triggered — gained Safeguard!`, 'buff');
        } else {
          u.intrinsicKinshipFired = true;
        }
      }

      if (!u.extraKinshipsFired && u.extraKinships && u.extraKinships.length > 0) {
        u.extraKinshipsFired = true;
        for (const ek of u.extraKinships) {
          applyStatMod(state, db, u, ek.atk || 3, ek.hp || 3, false, 'Kinship');
        }
      }
    }
  }

  // {Devotee}: fires first time each turn you PLAY a Character with strictly higher energyReq
  function triggerDevoteesForPlayedCharacter(state, db, playerIndex, playedUnitUid, playedEnergyReq) {
    const p = state.players[playerIndex];

    // 1. Buildings (e.g. Painted Topiaries 2E)
    for (const b of p.buildings) {
      if (!b || b.devoteeUsedThisTurn) continue;
      const bDef = db.cardMap.get(b.cardId);
      const bEReq = Number(bDef?.energyReq ?? 0);
      if (playedEnergyReq <= bEReq) continue;

      if (b.cardId === IDS.PAINTED_TOPIARIES) {
        b.devoteeUsedThisTurn = true;
        logEvent(state, `Painted Topiaries {Devotee} triggered — added Powdered Rose-Joys!`);
        addInstanceToHand(state, db, playerIndex, createCardInstance(state, IDS.POWDERED_ROSE_JOYS, playerIndex), 'Painted Topiaries');
      }
    }

    // 2. Friendly Characters (excluding the Character that was just played!)
    for (const u of [...p.characters]) {
      if (u.uid === playedUnitUid || u.devoteeUsedThisTurn) continue;
      const uDef = db.cardMap.get(u.cardId);
      const uEReq = Number(uDef?.energyReq ?? u.energyReq ?? 0);
      if (playedEnergyReq <= uEReq) continue;

      const hasIntrinsic = (
        u.cardId === IDS.COURT_TRUMPETER ||
        u.cardId === IDS.SIXPENCE_TARTIST ||
        u.cardId === IDS.LADY_TIRED_OF_WAITING
      );
      const hasExtra = u.extraDevotees && u.extraDevotees.length > 0;
      if (!hasIntrinsic && !hasExtra) continue;

      u.devoteeUsedThisTurn = true;
      if (u.cardId === IDS.COURT_TRUMPETER) {
        applyStatMod(state, db, u, 1, 1, false, 'Devotee');
      } else if (u.cardId === IDS.SIXPENCE_TARTIST) {
        logEvent(state, `Sixpence Tartist {Devotee} triggered — added Humble Pie!`);
        addInstanceToHand(state, db, playerIndex, createCardInstance(state, IDS.HUMBLE_PIE, playerIndex), 'Sixpence Tartist');
      } else if (u.cardId === IDS.LADY_TIRED_OF_WAITING) {
        p.freeHeroPowerCount += 1;
        logEvent(state, `Lady Tired-of-Waiting {Devotee} triggered — next Hero Power costs 0 AP!`, 'buff');
      }

      if (hasExtra) {
        for (const ed of u.extraDevotees) {
          applyStatMod(state, db, u, ed.atk || 1, ed.hp || 1, false, 'Royal Favour Devotee');
        }
      }
    }
  }

  // Wish & Random Generation Pool Builder
  // Standard = 2x weight, Elite = 1x weight; player's Hero factions + Neutrals (including 2-pip cards of those factions)
  function buildGenerationPool(state, db, playerIndex, filterFn, excludeCardId = null) {
    const p = state.players[playerIndex];
    const allowedFactions = new Set([...p.factions, 'N']);
    const candidates = db.collectibles.filter(def => {
      if (def.id === excludeCardId) return false;
      if (!allowedFactions.has(def.faction)) return false;
      return filterFn(def);
    });
    // Fallback across all collectible cards only if a custom faction has 0 matches
    if (candidates.length > 0) return candidates;
    return db.collectibles.filter(def => def.id !== excludeCardId && filterFn(def));
  }

  function pickWeightedRandom(candidates, count, rng = Math.random) {
    const pool = [...candidates];
    const chosen = [];
    while (chosen.length < count && pool.length > 0) {
      const weights = pool.map(c => (c.tier === 'elite' ? 1 : 2));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let roll = rng() * totalWeight;
      let pickIdx = 0;
      for (let i = 0; i < pool.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
          pickIdx = i;
          break;
        }
      }
      chosen.push(pool[pickIdx]);
      pool.splice(pickIdx, 1);
    }
    return chosen;
  }

  function applyRandomWoodlandBlessing(inst, def, rng = Math.random, usedBlessingIds = null) {
    if (!inst || !def) return null;
    let eligible = WOODLAND_BLESSINGS.filter(b => b.eligible(def, inst) && (!usedBlessingIds || !usedBlessingIds.has(b.id)));
    if (eligible.length === 0) {
      eligible = WOODLAND_BLESSINGS.filter(b => b.eligible(def, inst));
    }
    if (eligible.length === 0) return null;
    const chosenB = eligible[Math.floor(rng() * eligible.length)];
    if (usedBlessingIds) usedBlessingIds.add(chosenB.id);
    chosenB.apply(inst);
    return chosenB;
  }

  function openWish(state, db, playerIndex, wishKind, sourceCardId, rng = Math.random) {
    let candidates = [];
    let title = 'Make a Wish';

    if (wishKind === 'royal_favour') {
      title = 'Royal Favour — Wish for a 2-Energy Character';
      candidates = buildGenerationPool(
        state, db, playerIndex,
        c => c.type === 'character' && Number(c.energyReq) === 2,
        sourceCardId
      );
    } else if (wishKind === 'ravenous_dowager') {
      title = 'Ravenous Dowager — Wish for a Food (one is Poisoned)';
      candidates = buildGenerationPool(
        state, db, playerIndex,
        c => hasSubtype(c, 'FOOD'),
        sourceCardId
      );
    } else if (wishKind === 'gentle_woodsman') {
      title = 'Gentle Woodsman — Wish for a Blessed Animalfolk';
      candidates = buildGenerationPool(
        state, db, playerIndex,
        c => c.type === 'character' && hasSubtype(c, 'ANIMALFOLK'),
        sourceCardId
      );
    } else if (wishKind === 'wishing_oak') {
      title = 'Gift of the Wishing Oak — Wish for a Blessed Character (-1 AP)';
      candidates = buildGenerationPool(
        state, db, playerIndex,
        c => c.type === 'character',
        sourceCardId
      );
    }

    const defs = pickWeightedRandom(candidates, 3, rng);
    if (defs.length === 0) {
      logEvent(state, `Wish found no matching cards.`);
      return;
    }

    const options = defs.map(d => createCardInstance(state, d.id, playerIndex));

    if (wishKind === 'royal_favour') {
      options.forEach(inst => {
        inst.extraDevotees.push({ atk: 1, hp: 1, text: '{Devotee}: This Character gets +1/+1.' });
        inst.modLines.push('{Devotee} This Character gets +1/+1.');
      });
    } else if (wishKind === 'ravenous_dowager') {
      const poisonIdx = Math.floor(rng() * options.length);
      options[poisonIdx].poisoned = true;
    } else if (wishKind === 'gentle_woodsman') {
      const usedBlessingIds = new Set();
      options.forEach(inst => {
        const def = db.cardMap.get(inst.cardId);
        applyRandomWoodlandBlessing(inst, def, rng, usedBlessingIds);
      });
    } else if (wishKind === 'wishing_oak') {
      // Guarantee 3 distinct smart-filtered Woodland Blessings across the 3 choices, plus -1 AP
      const usedBlessingIds = new Set();
      options.forEach(inst => {
        const def = db.cardMap.get(inst.cardId);
        applyRandomWoodlandBlessing(inst, def, rng, usedBlessingIds);
        inst.apReduction = (inst.apReduction || 0) + 1;
        inst.modLines.push('Costs {1AP} less.');
      });
    }

    state.pending = {
      type: 'wish',
      wishKind,
      playerIndex,
      title,
      options,
      stepIndex: 0
    };
  }

  // Sequential Push-Your-Luck Wish: inspect 1 card at a time; Take current card OR Pass permanently to next!
  function advanceWish(state) {
    if (!state.pending || state.pending.type !== 'wish') return false;
    const { playerIndex, options, stepIndex } = state.pending;
    if (stepIndex + 1 >= options.length) return false;
    state.pending.stepIndex = stepIndex + 1;
    logEvent(state, `${state.players[playerIndex].name} passed on Wish offer ${stepIndex + 1} of ${options.length}…`);
    return true;
  }

  function resolveWish(state, db, optionIndex, rng = Math.random) {
    if (!state.pending || state.pending.type !== 'wish') return false;
    if (optionIndex === 'pass') return advanceWish(state);

    const { playerIndex, options, stepIndex } = state.pending;
    const idx = Number.isInteger(optionIndex) ? optionIndex : (stepIndex || 0);
    // Enforce sequential push-your-luck: only the currently revealed offer can be taken!
    if (idx !== (stepIndex || 0) || idx < 0 || idx >= options.length) return false;

    const chosen = options[idx];
    const def = db.cardMap.get(chosen.cardId);
    state.pending = null;

    const added = addInstanceToHand(state, db, playerIndex, chosen, 'Wish');
    if (added) {
      logEvent(state, `${state.players[playerIndex].name} Wished for ${def ? def.name : 'a card'} (offer ${idx + 1}/${options.length})${chosen.poisoned ? ' — Poisoned!' : ''}.`, 'buff');
    }

    drainQueue(state, db, rng);
    return true;
  }

  // Building creation & Mother Pippin planting
  function createBuildingEntity(state, db, playerIndex, cardId) {
    const def = db.cardMap.get(cardId);
    const hasCharges = def && def.durability !== null && def.durability !== undefined && String(def.durability).trim() !== '';
    return {
      uid: nextUid(state, 'bldg'),
      cardId,
      owner: playerIndex,
      energyProvided: Number(def?.energyProvided ?? 1),
      energyActive: false, // +Energy activates at {Start of Turn}!
      charges: hasCharges ? Number(def.durability) : null,
      usedThisTurn: false,
      devoteeUsedThisTurn: false
    };
  }

  function plantBuildingToken(state, db, playerIndex, tokenCardId) {
    const p = state.players[playerIndex];
    const emptyIdx = p.buildings.findIndex(b => b === null);
    if (emptyIdx !== -1) {
      p.buildings[emptyIdx] = createBuildingEntity(state, db, playerIndex, tokenCardId);
      const def = db.cardMap.get(tokenCardId);
      logEvent(state, `${p.name} planted ${def ? def.name : 'a Building'} (+${p.buildings[emptyIdx].energyProvided}E starting next turn).`, 'buff');
      return;
    }
    // 4/4 full: let player pick a Building slot to overwrite (or skip planting)
    const def = db.cardMap.get(tokenCardId);
    state.pending = {
      type: 'overwrite_building',
      playerIndex,
      tokenCardId,
      allowSkip: true,
      title: `Building Slots Full (4/4) — Choose a Building to replace with ${def ? def.name : 'Apple Tree'}, or keep your 4.`
    };
  }

  function resolveBuildingOverwrite(state, db, slotIndexOrSkip, rng = Math.random) {
    if (!state.pending || state.pending.type !== 'overwrite_building') return false;
    const { playerIndex, tokenCardId, allowSkip } = state.pending;
    const p = state.players[playerIndex];

    if (slotIndexOrSkip === 'skip' && allowSkip) {
      state.pending = null;
      logEvent(state, `${p.name} kept their existing 4 Buildings.`);
      drainQueue(state, db, rng);
      return true;
    }

    const slot = Number(slotIndexOrSkip);
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_BLDGS) return false;
    const old = p.buildings[slot];
    const oldDef = old ? db.cardMap.get(old.cardId) : null;
    if (old) p.graveyard.push(createCardInstance(state, old.cardId, playerIndex));

    p.buildings[slot] = createBuildingEntity(state, db, playerIndex, tokenCardId);
    const newDef = db.cardMap.get(tokenCardId);
    state.pending = null;
    logEvent(state, `${p.name} replaced ${oldDef ? oldDef.name : 'Building'} with ${newDef ? newDef.name : 'Building'}.`, 'buff');
    drainQueue(state, db, rng);
    return true;
  }

  // Kit Merryweather helper
  function triggerKitMerryweather(state, db, playerIndex) {
    const p = state.players[playerIndex];
    const target = p.deck.find(inst => {
      const d = db.cardMap.get(inst.cardId);
      return d && d.type === 'character' && (Number(d.energyReq) === 1 || Number(d.energyReq) === 2);
    });
    if (!target) {
      logEvent(state, `Kit Merryweather found no {1E} or {2E} Characters left in ${p.name}'s deck.`);
      return;
    }
    target.bonusAtk += 1;
    target.bonusHp += 1;
    target.fated = true;
    logEvent(state, `Kit Merryweather gave ${p.name}'s top {1E}/{2E} deck Character +1/+1 and {Fate}!`, 'buff');
  }

  // Continuation Queue Runner
  function drainQueue(state, db, rng = Math.random) {
    while (!state.gameOver && !state.pending && state.effectQueue.length > 0) {
      const step = state.effectQueue.shift();

      switch (step.op) {
        case 'fate_draw': {
          logEvent(state, `{Fate} triggered — drawing a card!`);
          drawCard(state, db, step.playerIndex);
          break;
        }

        case 'trigger_devotees': {
          triggerDevoteesForPlayedCharacter(state, db, step.playerIndex, step.unitUid, step.playedEnergyReq);
          break;
        }

        case 'run_debut': {
          const loc = findUnitLocation(state, step.unitUid);
          const unit = loc ? loc.unit : step.unitSnapshot;
          if (!unit) break;
          runUnitDebut(state, db, step.playerIndex, unit, loc ? loc.index : -1, step.targetSpec, rng);
          break;
        }

        case 'debut_ward': {
          const loc = findUnitLocation(state, step.unitUid);
          if (loc) {
            loc.unit.wards += 1;
            const d = db.cardMap.get(loc.unit.cardId);
            logEvent(state, `${d ? d.name : 'Character'} gained a Ward from Woodland Blessing!`, 'buff');
          }
          break;
        }

        case 'summon_22_copy': {
          const loc = findUnitLocation(state, step.unitUid);
          const p = state.players[step.playerIndex];
          if (p.characters.length < MAX_CHARS && step.templateInst) {
            const copyUnit = buildUnitFromCardInstance(state, db, step.playerIndex, step.templateInst, true);
            const idx = loc ? loc.index + 1 : p.characters.length;
            insertSummonedUnit(state, db, step.playerIndex, copyUnit, idx);
            const d = db.cardMap.get(copyUnit.cardId);
            logEvent(state, `Woodland Blessing summoned a 2/2 copy of ${d ? d.name : 'Character'}!`, 'buff');
            checkKinships(state, db, step.playerIndex);
          }
          break;
        }

        case 'check_kinships': {
          checkKinships(state, db, step.playerIndex);
          break;
        }

        case 'kinship_troubadour': {
          logEvent(state, `Barnyard Troubadour's {Kinship} triggered!`);
          drawFilteredCharacter(state, db, step.playerIndex, 'Barnyard Troubadour');
          break;
        }

        case 'open_wish': {
          openWish(state, db, step.playerIndex, step.wishKind, step.sourceCardId, rng);
          break;
        }

        case 'run_farewell': {
          const u = step.unit;
          if (!u.dubbedChampion) {
            if (u.cardId === IDS.HARRIED_HARE) {
              logEvent(state, `Harried Hare {Farewell} — drawing a card!`);
              drawCard(state, db, step.playerIndex);
            } else if (u.cardId === IDS.GRAYBEARD_KNIGHT) {
              if (step.rightNeighborUid) {
                const rLoc = findUnitLocation(state, step.rightNeighborUid);
                if (rLoc && rLoc.playerIndex === step.playerIndex) {
                  applyStatMod(state, db, rLoc.unit, 2, 2, false, 'Graybeard Knight-Errant Farewell');
                }
              }
            }
          }
          if (u.extraFarewells && u.extraFarewells.length > 0) {
            for (const ef of u.extraFarewells) {
              if (ef.kind === 'summon_vanguard') {
                summonTokenCharacter(state, db, step.playerIndex, IDS.ROYAL_VANGUARD, {
                  mode: 'after_left_survivor',
                  leftUid: step.leftSurvivorUid
                });
              }
            }
          }
          break;
        }

        case 'eot_apple_tree': {
          const p = state.players[step.playerIndex];
          if (p.buildings.some(b => b && b.uid === step.bldgUid)) {
            logEvent(state, `Apple Tree added an Apple to ${p.name}'s hand.`);
            addInstanceToHand(state, db, step.playerIndex, createCardInstance(state, IDS.APPLE, step.playerIndex), 'Apple Tree');
          }
          break;
        }

        case 'eot_granny_cottage': {
          const p = state.players[step.playerIndex];
          if (!p.buildings.some(b => b && b.uid === step.bldgUid)) break;
          if (getPlayerEnergy(p, db) < 6) break;

          const damaged = [];
          if (p.hp < p.maxHp) damaged.push({ kind: 'hero' });
          p.characters.forEach(u => {
            if (u.curHp < getUnitMaxHp(u)) damaged.push({ kind: 'unit', unit: u });
          });

          if (damaged.length > 0) {
            const pick = damaged[Math.floor(rng() * damaged.length)];
            if (pick.kind === 'hero') {
              healHero(state, step.playerIndex, 6, "Granny Thimble's Cottage");
            } else {
              healUnit(state, db, pick.unit, 6, "Granny Thimble's Cottage");
            }
          } else {
            logEvent(state, `Granny Thimble's Cottage ({6E}) — everyone healthy, drawing a card!`);
            drawCard(state, db, step.playerIndex);
          }
          break;
        }

        case 'eot_valentina': {
          const loc = findUnitLocation(state, step.unitUid);
          if (!loc || loc.playerIndex !== step.playerIndex) break;
          if (loc.index === 0) break; // Leftmost slot 0 = safe opt-out!

          const p = state.players[step.playerIndex];
          const victim = p.characters[loc.index - 1];
          const vDef = db.cardMap.get(victim.cardId);
          // Capture victim neighbors before removal
          let leftSurv = loc.index - 2 >= 0 ? p.characters[loc.index - 2].uid : null;
          const rightNeighborUid = loc.unit.uid; // Valentina herself!

          p.characters.splice(loc.index - 1, 1);
          p.graveyard.push(createCardInstance(state, victim.cardId, step.playerIndex));
          logEvent(state, `Velvet Queen Valentina sacrificed ${vDef ? vDef.name : 'her left neighbor'}!`, 'dmg');

          // Summon 2/4 Royal Vanguard with {Provoke} immediately to Valentina's RIGHT
          summonTokenCharacter(
            state, db, step.playerIndex, IDS.ROYAL_VANGUARD,
            { mode: 'right_of_uid', uid: loc.unit.uid },
            vg => { vg.intrinsicProvoke = true; }
          );

          // Now run victim's Farewell triggers (e.g. Harried Hare draw, Graybeard buffing Valentina!)
          const times = victim.doubleDebutFarewell ? 2 : 1;
          const fSteps = [];
          for (let t = 0; t < times; t++) {
            fSteps.push({
              op: 'run_farewell',
              playerIndex: step.playerIndex,
              unit: victim,
              leftSurvivorUid: leftSurv,
              rightNeighborUid
            });
          }
          state.effectQueue.unshift(...fSteps);
          break;
        }

        case 'cleanup_and_pass': {
          cleanupTempBuffsForBothSides(state, db);
          if (!state.gameOver) {
            startTurn(state, db, 1 - step.playerIndex, rng);
          }
          break;
        }

        case 'check_combat_exhausted': {
          if (state.phase === 'COMBAT' && getReadyAttackers(state).length === 0) {
            state.phase = 'MAIN2';
            logEvent(state, `All attackers finished — entering Main Phase 2.`);
          }
          break;
        }
      }
    }
  }

  // Character {Debut} handlers
  function runUnitDebut(state, db, playerIndex, unit, currentIdx, targetSpec, rng = Math.random) {
    switch (unit.cardId) {
      case IDS.SIXPENCE_TARTIST: {
        logEvent(state, `Sixpence Tartist {Debut} — added Humble Pie!`);
        addInstanceToHand(state, db, playerIndex, createCardInstance(state, IDS.HUMBLE_PIE, playerIndex), 'Sixpence Tartist');
        break;
      }
      case IDS.RAVENOUS_DOWAGER: {
        openWish(state, db, playerIndex, 'ravenous_dowager', unit.cardId, rng);
        break;
      }
      case IDS.GRIMHILDE: {
        const p = state.players[playerIndex];
        for (let i = 0; i < 4; i++) {
          const apple = createCardInstance(state, IDS.APPLE, playerIndex);
          apple.poisoned = true;
          apple.fated = true;
          p.deck.push(apple);
        }
        shuffleInPlace(p.deck, rng);
        logEvent(state, `Grimhilde shuffled 4 {Poisoned} {Fate} Apples into ${p.name}'s deck!`, 'buff');
        break;
      }
      case IDS.MOTHER_PIPPIN: {
        plantBuildingToken(state, db, playerIndex, IDS.APPLE_TREE);
        break;
      }
      case IDS.GENTLE_WOODSMAN: {
        openWish(state, db, playerIndex, 'gentle_woodsman', unit.cardId, rng);
        break;
      }
      case IDS.BLOODKEY_BARON: {
        const p = state.players[playerIndex];
        const bLoc = findUnitLocation(state, unit.uid);
        const bIdx = bLoc ? bLoc.index : currentIdx;
        if (bIdx > 0 && p.characters[bIdx - 1]) {
          const victim = p.characters[bIdx - 1];
          const vDef = db.cardMap.get(victim.cardId);
          const leftSurv = bIdx - 2 >= 0 ? p.characters[bIdx - 2].uid : null;
          const rightUid = unit.uid;

          p.characters.splice(bIdx - 1, 1);
          p.graveyard.push(createCardInstance(state, victim.cardId, playerIndex));
          logEvent(state, `Bloodkey Baron {Debut} sacrificed ${vDef ? vDef.name : 'his left neighbor'} to deal 2 damage to all enemy Characters!`, 'dmg');

          // Deal 2 damage to all enemy Characters simultaneously, then reap deaths
          const opp = state.players[1 - playerIndex];
          for (const enemy of [...opp.characters]) {
            dealDamageToUnit(state, db, enemy, 2, 'Bloodkey Baron', false);
          }
          reapDeaths(state, db);

          // Queue victim's Farewell triggers (e.g. Harried Hare draw, Graybeard buffing Baron!)
          const times = victim.doubleDebutFarewell ? 2 : 1;
          const fSteps = [];
          for (let t = 0; t < times; t++) {
            fSteps.push({
              op: 'run_farewell',
              playerIndex,
              unit: victim,
              leftSurvivorUid: leftSurv,
              rightNeighborUid: rightUid
            });
          }
          state.effectQueue.unshift(...fSteps);
        }
        break;
      }
      case IDS.GRAYBEARD_KNIGHT: {
        const p = state.players[playerIndex];
        const gLoc = findUnitLocation(state, unit.uid);
        const gIdx = gLoc ? gLoc.index : currentIdx;
        if (gIdx > 0 && p.characters[gIdx - 1]) {
          applyStatMod(state, db, p.characters[gIdx - 1], 2, 2, false, 'Graybeard Knight-Errant Debut');
        }
        break;
      }
      case IDS.WHETSMITH_APPRENTICE: {
        if (targetSpec && targetSpec.unitUid && targetSpec.unitUid !== unit.uid) {
          const tLoc = findUnitLocation(state, targetSpec.unitUid);
          if (tLoc && tLoc.playerIndex === playerIndex) {
            applyStatMod(state, db, tLoc.unit, 2, 1, true, 'Whetsmith Apprentice');
          }
        }
        break;
      }
      case IDS.HEDGEROW_MATRON: {
        // Two-unit Character summons flank one on either side: [Left Rabbit] [Hedgerow Matron] [Right Rabbit]
        summonTokenCharacter(state, db, playerIndex, IDS.RABBIT, { mode: 'left_of_uid', uid: unit.uid });
        summonTokenCharacter(state, db, playerIndex, IDS.RABBIT, { mode: 'right_of_uid', uid: unit.uid });
        break;
      }
      case IDS.SWEET_OLD_SOUL: {
        logEvent(state, `Sweet Old Soul {Debut} — added Cureall Cookie!`);
        addInstanceToHand(state, db, playerIndex, createCardInstance(state, IDS.CUREALL_COOKIE, playerIndex), 'Sweet Old Soul');
        break;
      }
      case IDS.KIT_MERRYWEATHER: {
        unit.wards += 1;
        logEvent(state, `Kit Merryweather {Debut} — gained a Ward!`, 'buff');
        triggerKitMerryweather(state, db, playerIndex);
        break;
      }
    }
  }

  // Playability & Target Requirement Introspection (powers both strict validation AND crisp UI highlights!)
  function getCardPlayInfo(state, db, handIndex) {
    if (state.gameOver || state.pending) return { playable: false, reason: 'Resolve current prompt first.' };
    if (state.phase !== 'MAIN1' && state.phase !== 'MAIN2') {
      return { playable: false, reason: 'Finish Combat before playing cards.' };
    }

    const pIdx = state.activePlayer;
    const p = state.players[pIdx];
    const opp = state.players[1 - pIdx];
    const inst = p.hand[handIndex];
    if (!inst) return { playable: false, reason: 'Card not in hand.' };

    const def = db.cardMap.get(inst.cardId);
    if (!def) return { playable: false, reason: 'Unknown card.' };

    const curE = getPlayerEnergy(p, db);
    const reqE = Number(def.energyReq ?? 0);
    if (curE < reqE) {
      return { playable: false, reason: `Requires ${reqE} Energy (you have ${curE}E).` };
    }

    const apCost = getEffectiveApCost(state, pIdx, inst, db);
    if (p.ap < apCost) {
      return { playable: false, reason: `Costs ${apCost} AP (you have ${p.ap} AP).` };
    }

    if (def.type === 'character') {
      if (p.characters.length >= MAX_CHARS) {
        return { playable: false, reason: 'Character row is full (6/6).' };
      }
      // Whetsmith Apprentice needs a friendly ally target ONLY if >=1 ally exists
      if (def.id === IDS.WHETSMITH_APPRENTICE && p.characters.length > 0) {
        return {
          playable: true,
          apCost,
          needsInsertion: true,
          targetRule: {
            kind: 'single_unit',
            optional: false,
            validUnits: p.characters.map(u => ({ playerIndex: pIdx, unitUid: u.uid })),
            prompt: 'Choose a friendly Character to get +2/+1 this turn.'
          }
        };
      }
      return { playable: true, apCost, needsInsertion: true, targetRule: null };
    }

    if (def.type === 'building') {
      const hasEmpty = p.buildings.some(b => b === null);
      return {
        playable: true,
        apCost,
        needsBuildingSlot: true,
        isOverwrite: !hasEmpty,
        targetRule: null
      };
    }

    // Spells — check valid target availability per card
    const allUnits = [
      ...p.characters.map(u => ({ playerIndex: pIdx, unitUid: u.uid })),
      ...opp.characters.map(u => ({ playerIndex: opp.index, unitUid: u.uid }))
    ];
    const friendlyUnits = p.characters.map(u => ({ playerIndex: pIdx, unitUid: u.uid }));
    const enemyUnits = opp.characters.map(u => ({ playerIndex: opp.index, unitUid: u.uid }));

    switch (def.id) {
      case IDS.CROWNS_TITHE:
      case IDS.ROYAL_FAVOUR:
      case IDS.GIFT_OF_WISHING_OAK:
        return { playable: true, apCost, targetRule: null };

      case IDS.WISHING_COIN:
        return {
          playable: true,
          apCost,
          targetRule: {
            kind: 'choice_mode',
            modes: ['ap', 'energy'],
            prompt: `${def.name} — Choose one for this turn:`
          }
        };

      case IDS.UNDER_THE_GARDEN_GATE: {
        // Playable if there is empty board space OR at least 1 friendly Animalfolk to receive +1/+1
        const hasAnim = p.characters.some(u => (u.subtypes || []).includes('ANIMALFOLK'));
        if (p.characters.length >= MAX_CHARS && !hasAnim) {
          return { playable: false, reason: 'Board is full (6/6) with no Animalfolk to buff.' };
        }
        return { playable: true, apCost, targetRule: null };
      }

      case IDS.OFF_WITH_HIS_HEAD:
      case IDS.EAT_UP_MY_DARLING:
      case IDS.SHOWSTOPPER_GATEAU:
      case IDS.HUMBLE_PIE:
      case IDS.APPLE:
      case IDS.STONE_SOUP:
      case IDS.CUREALL_COOKIE:
      case IDS.POTS_AND_PANS: {
        if (allUnits.length === 0) {
          return { playable: false, reason: 'Requires a Character on the board.' };
        }
        return {
          playable: true,
          apCost,
          targetRule: {
            kind: 'single_unit',
            validUnits: allUnits,
            prompt: inst.poisoned
              ? `Choose a Character (${def.name} is Poisoned — reverses buffs/heals into -X/-Y or damage!).`
              : `Choose a Character for ${def.name}.`
          }
        };
      }

      case IDS.SUPPER_FOR_TWO: {
        if (allUnits.length === 0) {
          return { playable: false, reason: 'Requires at least one Character on the board.' };
        }
        return {
          playable: true,
          apCost,
          targetRule: {
            kind: 'up_to_two_units',
            maxTargets: Math.min(2, allUnits.length),
            validUnits: allUnits,
            prompt: inst.poisoned
              ? 'Choose up to 2 Characters (Poisoned — gives -2/-2!).'
              : 'Choose up to 2 Characters to get +2/+2.'
          }
        };
      }

      case IDS.DUB_THEE_CHAMPION: {
        if (friendlyUnits.length === 0) {
          return { playable: false, reason: 'Requires a friendly Character.' };
        }
        return {
          playable: true,
          apCost,
          targetRule: {
            kind: 'single_unit',
            validUnits: friendlyUnits,
            prompt: 'Choose a friendly Character (gains a Ward; replaces Debut & Farewell with Siege).'
          }
        };
      }

      case IDS.POWDERED_ROSE_JOYS:
      case IDS.HARVEST_BANQUET: {
        return {
          playable: true,
          apCost,
          targetRule: {
            kind: 'any_hero',
            validHeroes: [pIdx, opp.index],
            prompt: inst.poisoned
              ? `Choose a Hero (${def.name} is Poisoned — reverses effect!).`
              : `Choose a Hero for ${def.name}.`
          }
        };
      }

      case IDS.FAIREST_OF_THEM_ALL: {
        const hasKillable = opp.characters.length > 0
          || p.characters.some(u => !(u.subtypes || []).includes('QUEEN'));
        if (!hasKillable) {
          return { playable: false, reason: 'Requires at least one non-Queen or enemy Character on the board.' };
        }
        return {
          playable: true,
          apCost,
          targetRule: null
        };
      }

      case IDS.FOR_HEARTH_AND_HOLLOW: {
        const hasCharInHand = p.hand.some((c, idx) => idx !== handIndex && db.cardMap.get(c.cardId)?.type === 'character');
        if (!hasCharInHand) {
          return { playable: false, reason: 'Requires a Character in your hand.' };
        }
        return {
          playable: true,
          apCost,
          targetRule: null
        };
      }

      default:
        return { playable: true, apCost, targetRule: null };
    }
  }

  // Play a card from the active player's hand
  // opts: { insertIndex, buildingSlot, target: { kind:'hero', playerIndex } | { kind:'unit', unitUid } | { unitUids: [...] } }
  function playCard(state, db, handIndex, opts = {}, rng = Math.random) {
    const info = getCardPlayInfo(state, db, handIndex);
    if (!info.playable) return { ok: false, reason: info.reason };

    const pIdx = state.activePlayer;
    const p = state.players[pIdx];
    const inst = p.hand[handIndex];
    const def = db.cardMap.get(inst.cardId);

    // Validate required targets BEFORE mutating state
    if (info.targetRule) {
      const tr = info.targetRule;
      if (tr.kind === 'single_unit') {
        const uid = opts.target && (opts.target.unitUid || opts.unitUid);
        if (!uid || !tr.validUnits.some(v => v.unitUid === uid)) {
          return { ok: false, reason: 'Invalid target Character.' };
        }
      } else if (tr.kind === 'up_to_two_units') {
        const uids = Array.from(new Set((opts.target && opts.target.unitUids) || []));
        if (uids.length < 1 || uids.length > 2 || !uids.every(id => tr.validUnits.some(v => v.unitUid === id))) {
          return { ok: false, reason: 'Choose 1 or 2 valid distinct Characters.' };
        }
      } else if (tr.kind === 'friendly_hero_or_unit') {
        const t = opts.target;
        const okHero = t && t.kind === 'hero' && tr.validHeroes.includes(t.playerIndex);
        const okUnit = t && t.kind === 'unit' && tr.validUnits.some(v => v.unitUid === t.unitUid);
        if (!okHero && !okUnit) return { ok: false, reason: 'Choose yourself or a friendly Character.' };
      } else if (tr.kind === 'any_hero') {
        const t = opts.target;
        if (!t || t.kind !== 'hero' || !tr.validHeroes.includes(t.playerIndex)) {
          return { ok: false, reason: 'Choose a valid Hero.' };
        }
      } else if (tr.kind === 'choice_mode') {
        const mode = (opts.target && opts.target.mode) || opts.mode;
        if (!mode || !tr.modes.includes(mode)) {
          return { ok: false, reason: 'Choose +1 AP or +1 Energy.' };
        }
      }
    }

    if (def.type === 'building' && info.isOverwrite) {
      const slot = opts.buildingSlot;
      if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_BLDGS) {
        return { ok: false, reason: 'Choose which of your 4 Buildings to overwrite.' };
      }
    }

    pushUndo(state);

    // Compute Fate BEFORE removing/resolving (matters for Powdered Rose-Joys checking Queen!)
    const wasFated = isCardEffectivelyFated(state, pIdx, inst);
    const apCost = info.apCost;

    // Pay AP and remove from hand
    p.ap -= apCost;
    p.hand.splice(handIndex, 1);

    if (def.type === 'character') {
      const insertIdx = Number.isInteger(opts.insertIndex)
        ? Math.max(0, Math.min(p.characters.length, opts.insertIndex))
        : p.characters.length;
      const unit = buildUnitFromCardInstance(state, db, pIdx, inst, false);
      insertSummonedUnit(state, db, pIdx, unit, insertIdx);

      // Stone Soup "everywhere" aura: triggers strictly when you PLAY a {1E} or {2E} Character from hand!
      const playedEReq = Number(def.energyReq ?? unit.energyReq ?? 0);
      if (playedEReq === 1 || playedEReq === 2) {
        p.stoneSoupBonus += 1;
      }

      logEvent(state, `${p.name} played ${def.name} (${getUnitAtk(unit)}/${unit.curHp}) for ${apCost} AP.`);

      // Queue exact resolution order:
      // 1. {Fate} "When played: Draw a card"
      if (wasFated) {
        state.effectQueue.push({ op: 'fate_draw', playerIndex: pIdx });
      }
      // 2. {Devotee} triggers on existing allies/buildings
      state.effectQueue.push({
        op: 'trigger_devotees',
        playerIndex: pIdx,
        unitUid: unit.uid,
        playedEnergyReq: Number(def.energyReq ?? 0)
      });
      // 3. {Debut} (twice if Woodland Blessing #1!)
      const debutTimes = unit.doubleDebutFarewell ? 2 : 1;
      for (let t = 0; t < debutTimes; t++) {
        state.effectQueue.push({
          op: 'run_debut',
          playerIndex: pIdx,
          unitUid: unit.uid,
          unitSnapshot: unit,
          targetSpec: opts.target || null
        });
        for (let w = 0; w < unit.debutWard; w++) {
          state.effectQueue.push({ op: 'debut_ward', playerIndex: pIdx, unitUid: unit.uid });
        }
      }
      // 4. Woodland Blessing #2 ("When you play this Character, summon a 2/2 copy of it")
      if (unit.summon22Copy) {
        state.effectQueue.push({
          op: 'summon_22_copy',
          playerIndex: pIdx,
          unitUid: unit.uid,
          templateInst: unit.templateInst
        });
      }
      // 5. {Kinship} check across friendly row
      state.effectQueue.push({ op: 'check_kinships', playerIndex: pIdx });

      drainQueue(state, db, rng);
      return { ok: true };
    }

    if (def.type === 'building') {
      let slot = opts.buildingSlot;
      if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_BLDGS) {
        slot = p.buildings.findIndex(b => b === null);
      }
      if (p.buildings[slot]) {
        const old = p.buildings[slot];
        const oldDef = db.cardMap.get(old.cardId);
        p.graveyard.push(createCardInstance(state, old.cardId, pIdx));
        logEvent(state, `${p.name} scrapped ${oldDef ? oldDef.name : 'a Building'}.`);
      }
      p.buildings[slot] = createBuildingEntity(state, db, pIdx, def.id);
      logEvent(state, `${p.name} built ${def.name} (+${p.buildings[slot].energyProvided}E starting next turn) for ${apCost} AP.`);
      if (wasFated) {
        state.effectQueue.push({ op: 'fate_draw', playerIndex: pIdx });
      }
      drainQueue(state, db, rng);
      return { ok: true };
    }

    // Spell resolution
    logEvent(state, `${p.name} cast ${def.name}${inst.poisoned ? ' (Poisoned)' : ''} for ${apCost} AP.`);
    p.graveyard.push(inst);

    // If Fated ("When played: Draw a card"), queue draw after spell effect (or execute cleanly!)
    resolveSpellEffect(state, db, pIdx, inst, def, opts.target, rng);
    if (wasFated && !state.gameOver) {
      state.effectQueue.push({ op: 'fate_draw', playerIndex: pIdx });
    }
    drainQueue(state, db, rng);
    return { ok: true };
  }

  function resolveSpellEffect(state, db, casterIdx, inst, def, target, rng = Math.random) {
    const p = state.players[casterIdx];
    const poisoned = Boolean(inst.poisoned);

    const applyFoodStat = (loc, atkAmt, hpAmt, isTemp, onFriendlyExtra = null) => {
      if (!loc) return;
      const isEnemy = loc.playerIndex !== casterIdx;
      if (poisoned) {
        applyStatMod(state, db, loc.unit, -atkAmt, -hpAmt, isTemp, `Poisoned ${def.name}`);
      } else {
        applyStatMod(state, db, loc.unit, atkAmt, hpAmt, isTemp, def.name);
        if (!isEnemy && typeof onFriendlyExtra === 'function' && loc.unit.curHp > 0 && !loc.unit.markedDead) {
          onFriendlyExtra(loc.unit);
        }
      }
    };

    switch (def.id) {
      case IDS.OFF_WITH_HIS_HEAD: {
        const loc = findUnitLocation(state, target.unitUid);
        if (loc) killUnit(state, db, loc.unit, def.name);
        break;
      }

      case IDS.CROWNS_TITHE: {
        drawCard(state, db, casterIdx);
        if (!state.gameOver) drawCard(state, db, casterIdx);
        if (!state.gameOver && !playerControlsSubtype(p, 'QUEEN', db)) {
          dealDamageToHero(state, casterIdx, 2, "Crown's Tithe");
        }
        break;
      }

      case IDS.ROYAL_FAVOUR: {
        openWish(state, db, casterIdx, 'royal_favour', def.id, rng);
        break;
      }

      case IDS.WISHING_COIN: {
        const mode = (target && target.mode) || 'energy';
        if (mode === 'ap') {
          p.ap += 1;
          logEvent(state, `${p.name} gained +1 AP this turn (${def.name})!`, 'buff');
        } else {
          p.bonusEnergyTemp = (p.bonusEnergyTemp || 0) + 1;
          logEvent(state, `${p.name} gained +1 Energy this turn (${def.name})!`, 'buff');
        }
        break;
      }

      case IDS.EAT_UP_MY_DARLING: {
        const loc = findUnitLocation(state, target.unitUid);
        applyFoodStat(loc, 3, 3, false, unit => {
          unit.intrinsicProvoke = true;
          logEvent(state, `${db.cardMap.get(unit.cardId)?.name || 'Character'} gained {Provoke}!`, 'buff');
        });
        break;
      }

      case IDS.DUB_THEE_CHAMPION: {
        const loc = findUnitLocation(state, target && target.unitUid);
        if (loc && loc.playerIndex === casterIdx) {
          const u = loc.unit;
          u.wards += 1;
          u.dubbedChampion = true;
          if (u.extraFarewells && u.extraFarewells.length > 0) {
            u.siegeExtraFarewells = [...(u.siegeExtraFarewells || []), ...u.extraFarewells];
            u.extraFarewells = [];
          }
          if (!u.templateInst) u.templateInst = createCardInstance(state, u.cardId, casterIdx);
          if (!u.templateInst.modLines) u.templateInst.modLines = [];
          if (!u.templateInst.modLines.includes('Dubbed Champion: {Debut} & {Farewell} are now {Siege}!')) {
            u.templateInst.modLines.push('Dubbed Champion: {Debut} & {Farewell} are now {Siege}!');
          }
          const uDef = db.cardMap.get(u.cardId);
          logEvent(state, `${uDef ? uDef.name : 'Character'} was Dubbed Champion — gained a {Ward} and replaced {Debut}/{Farewell} with {Siege}!`, 'buff');
        }
        break;
      }

      case IDS.SUPPER_FOR_TWO: {
        const uids = Array.from(new Set(target.unitUids || []));
        // Apply mods then reap simultaneously so two deaths resolve neatly
        for (const uid of uids) {
          const loc = findUnitLocation(state, uid);
          if (!loc) continue;
          if (poisoned) {
            applyStatMod(state, db, loc.unit, -2, -2, false, `Poisoned ${def.name}`, false);
          } else {
            applyStatMod(state, db, loc.unit, 2, 2, false, def.name, false);
          }
        }
        reapDeaths(state, db);
        break;
      }

      case IDS.SHOWSTOPPER_GATEAU: {
        const loc = findUnitLocation(state, target.unitUid);
        applyFoodStat(loc, 2, 4, false, unit => {
          unit.extraFarewells.push({
            kind: 'summon_vanguard',
            text: '{Farewell}: Summon a 2/4 Royal Vanguard.'
          });
          logEvent(state, `${db.cardMap.get(unit.cardId)?.name || 'Character'} gained "{Farewell}: Summon a 2/4 Royal Vanguard."`, 'buff');
        });
        break;
      }

      case IDS.HUMBLE_PIE: {
        const loc = findUnitLocation(state, target.unitUid);
        applyFoodStat(loc, 2, 1, true);
        break;
      }

      case IDS.APPLE: {
        const loc = findUnitLocation(state, target.unitUid);
        applyFoodStat(loc, 1, 2, false);
        break;
      }

      case IDS.FAIREST_OF_THEM_ALL: {
        const spareQueens = getPlayerEnergy(p, db) >= 6;
        for (const pl of state.players) {
          for (const u of pl.characters) {
            const isFriendlyQueen = spareQueens && pl.index === casterIdx && (u.subtypes || []).includes('QUEEN');
            if (!isFriendlyQueen) {
              u.markedDead = true;
            }
          }
        }
        logEvent(
          state,
          spareQueens
            ? `Fairest of Them All {6E} destroyed all Characters except ${p.name}'s Queens!`
            : `Fairest of Them All destroyed all Characters!`,
          'dmg'
        );
        reapDeaths(state, db);
        break;
      }

      case IDS.POWDERED_ROSE_JOYS: {
        const tIdx = target.playerIndex;
        if (poisoned) {
          dealDamageToHero(state, tIdx, 3, `Poisoned ${def.name}`);
        } else {
          healHero(state, tIdx, 3, def.name);
        }
        break;
      }

      case IDS.HARVEST_BANQUET: {
        const tIdx = target.playerIndex;
        const tPlayer = state.players[tIdx];
        for (const u of tPlayer.characters) {
          if (poisoned) {
            applyStatMod(state, db, u, -2, -1, true, `Poisoned ${def.name}`, false);
          } else {
            applyStatMod(state, db, u, 2, 1, true, def.name, false);
          }
        }
        reapDeaths(state, db);
        break;
      }

      case IDS.STONE_SOUP: {
        const amt = 1 + (p.stoneSoupBonus || 0);
        const loc = findUnitLocation(state, target.unitUid);
        applyFoodStat(loc, amt, amt, true);
        break;
      }

      case IDS.UNDER_THE_GARDEN_GATE: {
        let summoned = 0;
        for (let i = 0; i < 6; i++) {
          if (p.characters.length < MAX_CHARS) {
            summonTokenCharacter(state, db, casterIdx, IDS.RABBIT, null);
            summoned += 1;
          }
        }
        const overflow = 6 - summoned;
        for (let i = 0; i < overflow; i++) {
          const anims = p.characters.filter(u => (u.subtypes || []).includes('ANIMALFOLK'));
          if (anims.length === 0) break;
          const pick = anims[Math.floor(rng() * anims.length)];
          applyStatMod(state, db, pick, 1, 1, false, 'Under the Garden Gate');
        }
        break;
      }

      case IDS.CUREALL_COOKIE: {
        const loc = findUnitLocation(state, target.unitUid);
        if (loc) {
          if (poisoned) {
            dealDamageToUnit(state, db, loc.unit, 3, `Poisoned ${def.name}`);
          } else {
            healUnit(state, db, loc.unit, 3, def.name);
          }
        }
        break;
      }

      case IDS.GIFT_OF_WISHING_OAK: {
        openWish(state, db, casterIdx, 'wishing_oak', def.id, rng);
        state.effectQueue.unshift({
          op: 'open_wish',
          playerIndex: casterIdx,
          wishKind: 'wishing_oak',
          sourceCardId: def.id
        });
        break;
      }

      case IDS.FOR_HEARTH_AND_HOLLOW: {
        let blessedCount = 0;
        for (const hInst of p.hand) {
          const hDef = db.cardMap.get(hInst.cardId);
          if (hDef && hDef.type === 'character') {
            applyRandomWoodlandBlessing(hInst, hDef, rng, null);
            blessedCount += 1;
          }
        }
        logEvent(
          state,
          `${p.name} gave ${blessedCount} Character${blessedCount === 1 ? '' : 's'} in hand a Woodland Blessing!`,
          'buff'
        );
        break;
      }

      case IDS.POTS_AND_PANS: {
        const loc1 = findUnitLocation(state, target.unitUid);
        if (loc1) {
          dealDamageToUnit(state, db, loc1.unit, 2, def.name);
        }
        if (!state.gameOver && p.characters.length >= 4) {
          const loc2 = findUnitLocation(state, target.unitUid);
          if (loc2 && loc2.unit.curHp > 0) {
            logEvent(state, `Pots and Pans! strikes again (4+ Characters)!`);
            dealDamageToUnit(state, db, loc2.unit, 2, def.name);
          }
        }
        break;
      }
    }
  }

  // Hero Power introspection & activation
  function getHeroPowerInfo(state, db, heroSlotIndex) {
    if (state.gameOver || state.pending) return { usable: false, reason: 'Resolve current prompt first.' };
    if (state.phase !== 'MAIN1' && state.phase !== 'MAIN2') {
      return { usable: false, reason: 'Cannot use Hero Powers mid-combat.' };
    }

    const pIdx = state.activePlayer;
    const p = state.players[pIdx];
    const slot = p.heroes[heroSlotIndex];
    if (!slot) return { usable: false, reason: 'Invalid Hero Power.' };

    const def = db.cardMap.get(slot.cardId);
    if (!def || def.type !== 'hero_active') {
      return { usable: false, reason: 'Passive Hero ability (always active).' };
    }
    if (slot.usedThisTurn) {
      return { usable: false, reason: 'Already used this turn.' };
    }

    const apCost = getEffectiveHeroApCost(p, slot, db);
    if (p.ap < apCost) {
      return { usable: false, reason: `Costs ${apCost} AP (you have ${p.ap} AP).` };
    }

    if (def.id === IDS.BELLADONNA) {
      const leftFoodIdx = p.hand.findIndex(inst => hasSubtype(db.cardMap.get(inst.cardId), 'FOOD'));
      if (leftFoodIdx === -1) {
        return { usable: false, reason: 'No Food cards in your hand.' };
      }
      return { usable: true, apCost, targetRule: null, leftFoodIdx };
    }

    if (def.id === IDS.ROSALIND) {
      if (p.characters.length === 0) {
        return { usable: false, reason: 'Requires a friendly Character.' };
      }
      return {
        usable: true,
        apCost,
        targetRule: {
          kind: 'single_unit',
          validUnits: p.characters.map(u => ({ playerIndex: pIdx, unitUid: u.uid })),
          prompt: 'Choose a friendly Character (+2/+1 this turn; permanent on Animalfolk!).'
        }
      };
    }

    return { usable: true, apCost, targetRule: null };
  }

  function useHeroPower(state, db, heroSlotIndex, target = null, rng = Math.random) {
    const info = getHeroPowerInfo(state, db, heroSlotIndex);
    if (!info.usable) return { ok: false, reason: info.reason };

    const pIdx = state.activePlayer;
    const p = state.players[pIdx];
    const slot = p.heroes[heroSlotIndex];
    const def = db.cardMap.get(slot.cardId);

    if (info.targetRule) {
      const uid = target && target.unitUid;
      if (!uid || !info.targetRule.validUnits.some(v => v.unitUid === uid)) {
        return { ok: false, reason: 'Choose a valid friendly Character.' };
      }
    }

    pushUndo(state);

    // Check base AP > 0 before consuming Lady Tired-of-Waiting discount!
    const m = String(def.rulesText || '').match(/\{(\d+)AP\}\s*:/i);
    const baseAp = m ? parseInt(m[1], 10) : Number(def.apCost ?? 1);
    if (baseAp > 0 && p.freeHeroPowerCount > 0) {
      p.freeHeroPowerCount -= 1;
    } else {
      p.ap -= info.apCost;
    }
    slot.usedThisTurn = true;

    switch (def.id) {
      case IDS.KING_VALYN: {
        logEvent(state, `${p.name} activated King Valyn (${info.apCost} AP).`);
        const edicts = buildGenerationPool(state, db, pIdx, c => hasSubtype(c, 'EDICT'));
        const [picked] = pickWeightedRandom(edicts, 1, rng);
        if (picked) {
          const added = addInstanceToHand(state, db, pIdx, createCardInstance(state, picked.id, pIdx), 'King Valyn');
          if (added) logEvent(state, `King Valyn decreed a random Edict!`);
        }
        if (!playerControlsSubtype(p, 'QUEEN', db)) {
          dealDamageToHero(state, pIdx, 2, 'King Valyn');
        }
        break;
      }

      case IDS.BELLADONNA: {
        const foodInst = p.hand[info.leftFoodIdx];
        const fDef = db.cardMap.get(foodInst.cardId);
        const already = foodInst.poisoned;
        foodInst.poisoned = true;
        logEvent(
          state,
          already
            ? `${p.name} used Belladonna — left-most Food (${fDef?.name || 'Food'}) was already {Poisoned}!`
            : `${p.name} used Belladonna — {Poisoned} ${fDef?.name || 'Food'}!`,
          'buff'
        );
        break;
      }

      case IDS.ROSALIND: {
        const loc = findUnitLocation(state, target.unitUid);
        if (loc && loc.playerIndex === pIdx) {
          const isAnim = (loc.unit.subtypes || []).includes('ANIMALFOLK');
          applyStatMod(state, db, loc.unit, 2, 1, !isAnim, isAnim ? 'Rosalind — Animalfolk keeps it!' : 'Rosalind');
        }
        break;
      }
    }

    drainQueue(state, db, rng);
    return { ok: true };
  }

  // Building Activated Abilities (1/turn per Building, usable same turn built; 0 charges disables ability)
  function getBuildingActionInfo(state, db, slotIndex) {
    if (state.gameOver || state.pending) return { usable: false, reason: 'Resolve current prompt first.' };
    if (state.phase !== 'MAIN1' && state.phase !== 'MAIN2') {
      return { usable: false, reason: 'Cannot activate Buildings mid-combat.' };
    }

    const pIdx = state.activePlayer;
    const p = state.players[pIdx];
    const b = p.buildings[slotIndex];
    if (!b) return { usable: false, reason: 'Empty Building slot.' };

    if (b.charges !== null && b.charges <= 0) {
      return { usable: false, reason: '0 charges remaining (still provides +Energy).' };
    }
    if (b.usedThisTurn) {
      return { usable: false, reason: 'Buildings can activate once per turn.' };
    }

    if (b.cardId === IDS.VANITY_MIRROR) {
      const curE = getPlayerEnergy(p, db);
      if (curE < 5) return { usable: false, reason: `Requires 5 Energy (you have ${curE}E).` };
      if (p.ap < 2) return { usable: false, reason: `Costs 2 AP (you have ${p.ap} AP).` };
      if (p.characters.length === 0) return { usable: false, reason: 'Requires a friendly Character to copy.' };
      if (p.characters.length >= MAX_CHARS) return { usable: false, reason: 'Character row is full (6/6).' };
      return {
        usable: true,
        apCost: 2,
        targetRule: {
          kind: 'single_unit',
          validUnits: p.characters.map(u => ({ playerIndex: pIdx, unitUid: u.uid })),
          prompt: 'Choose a friendly Character for Vanity Mirror to copy.'
        }
      };
    }

    if (b.cardId === IDS.CROSSROADS_INN) {
      if (p.ap < 1) return { usable: false, reason: `Costs 1 AP (you have ${p.ap} AP).` };
      return { usable: true, apCost: 1, targetRule: null };
    }

    if (b.cardId === IDS.GRANNY_THIMBLES_COTTAGE) {
      if (p.ap < 1) return { usable: false, reason: `Costs 1 AP (you have ${p.ap} AP).` };
      const curE = getPlayerEnergy(p, db);
      const opp = state.players[1 - pIdx];
      const allUnits = [
        ...p.characters.map(u => ({ playerIndex: pIdx, unitUid: u.uid })),
        ...opp.characters.map(u => ({ playerIndex: opp.index, unitUid: u.uid }))
      ];
      return {
        usable: true,
        apCost: 1,
        targetRule: {
          kind: 'any_hero_or_unit',
          validHeroes: [pIdx, opp.index],
          validUnits: allUnits,
          prompt: curE >= 7
            ? "Choose a Hero or Character to get +4 Health (Granny Thimble's Cottage {7E})."
            : `Choose a Hero or Character to heal ${curE >= 5 ? 4 : 2} (Granny Thimble's Cottage).`
        }
      };
    }

    if (b.cardId === IDS.APPLE_TREE) {
      if (p.ap < 1) return { usable: false, reason: `Costs 1 AP (you have ${p.ap} AP).` };
      return { usable: true, apCost: 1, targetRule: null };
    }

    if (b.cardId === IDS.OLD_CHESTNUT_SMITHY) {
      return { usable: true, apCost: 0, targetRule: null };
    }

    return { usable: false, reason: 'Passive/triggered Building (no manual activation).' };
  }

  function activateBuilding(state, db, slotIndex, target = null, rng = Math.random) {
    const info = getBuildingActionInfo(state, db, slotIndex);
    if (!info.usable) return { ok: false, reason: info.reason };

    const pIdx = state.activePlayer;
    const p = state.players[pIdx];
    const b = p.buildings[slotIndex];

    if (info.targetRule) {
      if (info.targetRule.kind === 'any_hero_or_unit') {
        const okHero = target && target.kind === 'hero' && info.targetRule.validHeroes.includes(target.playerIndex);
        const uid = target && target.unitUid;
        const okUnit = Boolean(uid && info.targetRule.validUnits.some(v => v.unitUid === uid));
        if (!okHero && !okUnit) {
          return { ok: false, reason: 'Choose a valid Hero or Character.' };
        }
      } else {
        const uid = target && target.unitUid;
        if (!uid || !info.targetRule.validUnits.some(v => v.unitUid === uid)) {
          return { ok: false, reason: 'Choose a valid friendly Character.' };
        }
      }
    }

    pushUndo(state);
    p.ap -= info.apCost;
    b.usedThisTurn = true;
    if (b.charges !== null) b.charges = Math.max(0, b.charges - 1);

    if (b.cardId === IDS.VANITY_MIRROR) {
      const loc = findUnitLocation(state, target.unitUid);
      if (loc && loc.playerIndex === pIdx) {
        logEvent(state, `${p.name} activated Vanity Mirror!`);
        summonExactBoardCopy(state, db, pIdx, loc.unit, null);
      }
    } else if (b.cardId === IDS.CROSSROADS_INN) {
      logEvent(state, `${p.name} activated Crossroads Inn!`);
      const drawn = drawFilteredCharacter(state, db, pIdx, 'Crossroads Inn');
      if (drawn && getPlayerEnergy(p, db) >= 5) {
        const dDef = db.cardMap.get(drawn.cardId);
        applyRandomWoodlandBlessing(drawn, dDef, rng, null);
        logEvent(state, `Crossroads Inn ({5E}) gave the drawn Character a Woodland Blessing!`, 'buff');
      }
    } else if (b.cardId === IDS.GRANNY_THIMBLES_COTTAGE) {
      const curE = getPlayerEnergy(p, db);
      if (curE >= 7) {
        if (target.kind === 'hero') {
          const tP = state.players[target.playerIndex];
          tP.maxHp += 4;
          tP.hp += 4;
          logEvent(state, `${tP.name} gained +4 Health from Granny Thimble's Cottage ({7E}) (${tP.hp}/${tP.maxHp})!`, 'buff');
        } else {
          const loc = findUnitLocation(state, target.unitUid);
          if (loc) applyStatMod(state, db, loc.unit, 0, 4, false, "Granny Thimble's Cottage {7E}");
        }
      } else {
        const healAmt = curE >= 5 ? 4 : 2;
        if (target.kind === 'hero') {
          healHero(state, target.playerIndex, healAmt, "Granny Thimble's Cottage");
        } else {
          const loc = findUnitLocation(state, target.unitUid);
          if (loc) healUnit(state, db, loc.unit, healAmt, "Granny Thimble's Cottage");
        }
      }
    } else if (b.cardId === IDS.APPLE_TREE) {
      logEvent(state, `${p.name} harvested Apple Tree — added two Apples to hand!`, 'buff');
      addInstanceToHand(state, db, pIdx, createCardInstance(state, IDS.APPLE, pIdx), 'Apple Tree');
      addInstanceToHand(state, db, pIdx, createCardInstance(state, IDS.APPLE, pIdx), 'Apple Tree');
    } else if (b.cardId === IDS.OLD_CHESTNUT_SMITHY) {
      p.tempAtk += 2;
      logEvent(state, `${p.name} forged at Old Chestnut Smithy — Hero gained +2/+0 this turn!`, 'buff');
    }

    drainQueue(state, db, rng);
    return { ok: true };
  }

  // Combat Step & Character Strike Execution
  function executeCharacterStrike(state, db, attackerUid, targetSpec, opts = {}) {
    const rng = opts.rng || Math.random;
    const aLoc = findUnitLocation(state, attackerUid);
    if (!aLoc) return;
    const atkPlayer = state.players[aLoc.playerIndex];
    const attacker = aLoc.unit;
    const aDef = db.cardMap.get(attacker.cardId);
    const aName = aDef ? aDef.name : 'Character';

    if (!opts.isBonusSpellStrike) {
      attacker.attackedThisTurn = true;
    }

    // 1. Pre-combat {Siege} triggers!
    if (attacker.cardId === IDS.KIT_MERRYWEATHER) {
      triggerKitMerryweather(state, db, aLoc.playerIndex);
    }
    if (attacker.dubbedChampion) {
      const times = attacker.doubleDebutFarewell ? 2 : 1;
      for (let t = 0; t < times; t++) {
        const curLoc = findUnitLocation(state, attacker.uid);
        if (!curLoc || curLoc.unit.curHp <= 0 || curLoc.unit.markedDead) break;
        const u = curLoc.unit;
        const pIdx = curLoc.playerIndex;
        const p = state.players[pIdx];

        if (u.debutWard > 0) {
          u.wards += u.debutWard;
          logEvent(state, `${aName} {Siege} — gained ${u.debutWard} Ward!`, 'buff');
        }
        let defaultAllyTarget = null;
        if (u.cardId === IDS.WHETSMITH_APPRENTICE) {
          const otherAlly = p.characters.find(x => x.uid !== u.uid);
          if (otherAlly) defaultAllyTarget = { unitUid: otherAlly.uid };
        }
        runUnitDebut(state, db, pIdx, u, curLoc.index, defaultAllyTarget, rng);

        const afterDebutLoc = findUnitLocation(state, u.uid);
        if (u.cardId === IDS.HARRIED_HARE) {
          logEvent(state, `Harried Hare {Siege} — drawing a card!`);
          drawCard(state, db, pIdx);
        } else if (u.cardId === IDS.GRAYBEARD_KNIGHT && afterDebutLoc) {
          const rUnit = p.characters[afterDebutLoc.index + 1];
          if (rUnit) {
            applyStatMod(state, db, rUnit, 2, 2, false, 'Graybeard Knight-Errant Siege');
          }
        }
        if (u.siegeExtraFarewells && u.siegeExtraFarewells.length > 0 && afterDebutLoc) {
          for (const ef of u.siegeExtraFarewells) {
            if (ef.kind === 'summon_vanguard') {
              summonTokenCharacter(state, db, pIdx, IDS.ROYAL_VANGUARD, {
                mode: 'right_of_uid',
                uid: u.uid
              });
            }
          }
        }
      }
    }

    // Re-verify attacker & target still alive after Siege
    const aAfter = findUnitLocation(state, attacker.uid);
    if (!aAfter || aAfter.unit.curHp <= 0 || aAfter.unit.markedDead) return;
    const atkDmg = getUnitAtk(aAfter.unit);

    if (targetSpec.kind === 'hero') {
      logEvent(state, `${aName} (${atkDmg}) attacked ${state.players[targetSpec.playerIndex].name}!`, 'combat');
      dealDamageToHero(state, targetSpec.playerIndex, atkDmg, aName);
      return;
    }

    const dLoc = findUnitLocation(state, targetSpec.unitUid);
    if (!dLoc || dLoc.unit.curHp <= 0 || dLoc.unit.markedDead) return;
    const dDef = db.cardMap.get(dLoc.unit.cardId);
    const dName = dDef ? dDef.name : 'Character';
    const defRetaliation = getUnitAtk(dLoc.unit);
    const hasSafe = unitHasSafeguard(state.players[aAfter.playerIndex], aAfter.index);

    logEvent(state, `${aName} (${atkDmg}) attacked ${dName} (${defRetaliation}/${dLoc.unit.curHp})${hasSafe ? ' with Safeguard' : ''}!`, 'combat');

    // Simultaneous combat damage (reap once after both take damage!)
    dealDamageToUnit(state, db, dLoc.unit, atkDmg, aName, false);
    if (!hasSafe && defRetaliation > 0) {
      dealDamageToUnit(state, db, aAfter.unit, defRetaliation, dName, false);
    }
    reapDeaths(state, db);
  }

  // Declare a normal Combat Step attack (attackerSpec: { kind: 'hero' } | { kind: 'character', unitUid })
  // targetSpec: { kind: 'hero', playerIndex } | { kind: 'character', playerIndex, unitUid }
  function declareAttack(state, db, attackerSpec, targetSpec, rng = Math.random) {
    if (state.gameOver || state.pending) return { ok: false, reason: 'Resolve current prompt first.' };
    if (state.phase === 'MAIN2' || (state.phase === 'MAIN1' && state.combatUsedThisTurn)) {
      return { ok: false, reason: 'Combat Step has already finished this turn.' };
    }
    if (state.phase !== 'MAIN1' && state.phase !== 'COMBAT') {
      return { ok: false, reason: 'Cannot attack right now.' };
    }

    const pIdx = state.activePlayer;
    const p = state.players[pIdx];
    const oppIdx = 1 - pIdx;
    const opp = state.players[oppIdx];

    // Validate attacker readiness
    let atkUnit = null;
    if (attackerSpec.kind === 'hero') {
      if (!isHeroReadyToAttack(p)) return { ok: false, reason: 'Your Hero cannot attack right now.' };
    } else if (attackerSpec.kind === 'character') {
      const loc = findUnitLocation(state, attackerSpec.unitUid);
      if (!loc || loc.playerIndex !== pIdx) return { ok: false, reason: 'Invalid attacker.' };
      if (!isUnitReadyToAttack(loc.unit)) {
        return { ok: false, reason: loc.unit.attackedThisTurn ? 'Already attacked this turn.' : 'Summoning sickness (cannot attack on turn played without Swift).' };
      }
      atkUnit = loc.unit;
    } else {
      return { ok: false, reason: 'Invalid attacker.' };
    }

    // Validate target & Provoke
    if (targetSpec.kind === 'hero') {
      if (targetSpec.playerIndex !== oppIdx) return { ok: false, reason: 'Can only attack the opposing Hero.' };
      if (isTargetBlockedByProvoke(opp, 'hero')) {
        return { ok: false, reason: 'Blocked by an enemy Character with Provoke!' };
      }
    } else if (targetSpec.kind === 'character') {
      const dLoc = findUnitLocation(state, targetSpec.unitUid);
      if (!dLoc || dLoc.playerIndex !== oppIdx) return { ok: false, reason: 'Can only attack enemy Characters.' };
      if (isTargetBlockedByProvoke(opp, 'character', dLoc.index)) {
        return { ok: false, reason: 'That ally is shielded by an adjacent Character with Provoke!' };
      }
    } else {
      return { ok: false, reason: 'Invalid attack target.' };
    }

    pushUndo(state);

    // Smart auto-entry from Main 1 -> Combat Step
    if (state.phase === 'MAIN1') {
      state.phase = 'COMBAT';
      state.combatUsedThisTurn = true;
      logEvent(state, `${p.name} entered Combat Step.`, 'combat');
    }

    if (attackerSpec.kind === 'hero') {
      p.heroAttackedThisTurn = true;
      const heroAtk = p.tempAtk;
      if (targetSpec.kind === 'hero') {
        logEvent(state, `${p.name} (${heroAtk} Atk) struck ${opp.name}!`, 'combat');
        dealDamageToHero(state, oppIdx, heroAtk, p.name);
      } else {
        const dLoc = findUnitLocation(state, targetSpec.unitUid);
        const dDef = db.cardMap.get(dLoc.unit.cardId);
        const retal = getUnitAtk(dLoc.unit);
        logEvent(state, `${p.name} (${heroAtk} Atk) struck ${dDef ? dDef.name : 'Character'} (${retal}/${dLoc.unit.curHp})!`, 'combat');
        dealDamageToUnit(state, db, dLoc.unit, heroAtk, p.name, false);
        if (retal > 0) {
          dealDamageToHero(state, pIdx, retal, dDef ? dDef.name : 'Character');
        }
        reapDeaths(state, db);
      }
    } else {
      executeCharacterStrike(state, db, atkUnit.uid, targetSpec, { rng });
    }

    // Queue automatic transition to Main 2 if no ready attackers remain after deaths/Farewells
    state.effectQueue.push({ op: 'check_combat_exhausted' });
    drainQueue(state, db, rng);
    return { ok: true };
  }

  // Sandbox / Playtest God-Mode Helpers
  const sandbox = {
    giveCardToHand(state, db, playerIndex, cardId, mods = {}) {
      pushUndo(state);
      const inst = createCardInstance(state, cardId, playerIndex);
      if (mods.poisoned) inst.poisoned = true;
      if (mods.fated) inst.fated = true;
      addInstanceToHand(state, db, playerIndex, inst, 'Sandbox');
      const def = db.cardMap.get(cardId);
      logEvent(state, `[Sandbox] Added ${def ? def.name : cardId} to ${state.players[playerIndex].name}'s hand.`);
    },
    adjustResource(state, playerIndex, field, delta) {
      pushUndo(state);
      const p = state.players[playerIndex];
      if (field === 'ap') {
        p.ap = Math.max(0, p.ap + delta);
        logEvent(state, `[Sandbox] ${p.name} AP → ${p.ap}.`);
      } else if (field === 'energy') {
        p.bonusEnergyTemp = Math.max(-10, (p.bonusEnergyTemp || 0) + delta);
        logEvent(state, `[Sandbox] ${p.name} Temp Energy ${delta >= 0 ? '+' : ''}${delta}.`);
      } else if (field === 'hp') {
        p.hp = Math.max(1, p.hp + delta);
        if (p.hp > p.maxHp) p.maxHp = p.hp;
        logEvent(state, `[Sandbox] ${p.name} HP → ${p.hp}.`);
      }
    },
    forceDraw(state, db, playerIndex) {
      pushUndo(state);
      logEvent(state, `[Sandbox] Forced draw for ${state.players[playerIndex].name}.`);
      drawCard(state, db, playerIndex);
    }
  };

  return {
    IDS,
    MAX_HAND,
    MAX_CHARS,
    MAX_BLDGS,
    HERO_STARTING_HP,
    WOODLAND_BLESSINGS,
    getSubtypes,
    hasSubtype,
    createCardInstance,
    cloneCardInstance,
    createMatch,
    submitMulligan,
    getPlayerEnergy,
    getPendingBuildingEnergy,
    playerControlsSubtype,
    playerHasHero,
    isCardEffectivelyFated,
    getEffectiveApCost,
    getEffectiveHeroApCost,
    getUnitAtk,
    getUnitMaxHp,
    unitHasSafeguard,
    isTargetBlockedByProvoke,
    getLegalCombatTargets,
    isUnitReadyToAttack,
    isHeroReadyToAttack,
    getReadyAttackers,
    getCardPlayInfo,
    playCard,
    getHeroPowerInfo,
    useHeroPower,
    getBuildingActionInfo,
    activateBuilding,
    declareAttack,
    endCombatStep,
    endTurn,
    advanceWish,
    resolveWish,
    resolveBuildingOverwrite,
    cloneStateForSim,
    undoLastAction,
    sandbox
  };
});
