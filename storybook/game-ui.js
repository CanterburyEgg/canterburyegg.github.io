/* ==========================================================================
   Storybook Card Game — Custom Deckbuilder & 2-Handed Tabletop UI Controller
   ========================================================================== */

(() => {
  'use strict';

  const GD = window.StorybookGameData;
  const Engine = window.StorybookEngine;
  const IDS = Engine.IDS;

  // Related Token preview map for #card-hover-inspector
  const CARD_TO_TOKEN_ID = {
    [IDS.SHOWSTOPPER_GATEAU]: IDS.ROYAL_VANGUARD,
    [IDS.VALENTINA]: IDS.ROYAL_VANGUARD,
    [IDS.SIXPENCE_TARTIST]: IDS.HUMBLE_PIE,
    [IDS.GRIMHILDE]: IDS.APPLE,
    [IDS.MOTHER_PIPPIN]: IDS.APPLE_TREE,
    [IDS.APPLE_TREE]: IDS.APPLE,
    [IDS.UNDER_THE_GARDEN_GATE]: IDS.RABBIT,
    [IDS.HEDGEROW_MATRON]: IDS.RABBIT,
    [IDS.SWEET_OLD_SOUL]: IDS.CUREALL_COOKIE
  };

  const ui = {
    db: null,
    screen: 'lobby', // 'lobby' | 'tabletop'

    // Lobby / Deckbuilder state
    decks: [],
    editingDeckId: null,
    seat1DeckId: '',
    seat2DeckId: '',
    firstPlayerPref: 'random', // '0' | '1' | 'random'
    filters: {
      legalOnly: true,
      faction: 'ALL',
      type: 'ALL',
      energy: 'ALL',
      search: ''
    },

    // Tabletop / Match state
    match: null,
    lastMatchSpecs: null, // { p0Spec, p1Spec, firstPlayer }
    mulliganSelections: new Set(),
    action: null, // Current targeting / placement / attack step
    peekEnemyHand: false,
    belladonnaHover: false,
    hoverInsertIdx: null,
    wishPeekingBoard: false,
    inspectingFinalBoard: false,
    logOpen: false,
    sandboxOpen: false,
    sandboxTargetMode: 'active', // 'active' | 'opp'
    sandboxSearch: '',
    toastTimer: null,
    bannerTimer: null
  };

  const $ = id => document.getElementById(id);

  // =========================================================================
  // Initialization & Live Card Studio Sync
  // =========================================================================

  async function init() {
    bindLobbyEvents();
    bindTabletopEvents();
    await reloadDatabase(false);

    ui.decks = GD.loadSavedDecks();
    if (ui.decks.length > 0) {
      ui.editingDeckId = ui.decks[0].id;
    } else {
      createNewDeck(false);
    }
    syncSeatSelections();
    renderLobby();

    // Auto-refresh card stats/text if user edits a card in Card Studio in another tab
    window.addEventListener('storage', ev => {
      if (ev.key === 'storybook_card_studio_v1') {
        reloadDatabase(true);
      }
    });
  }

  async function reloadDatabase(announce = false) {
    ui.db = await GD.loadCardDatabase();
    const countEl = $('db-card-count');
    const syncEl = $('db-sync-pill');
    if (countEl) {
      countEl.textContent = `${ui.db.activeCards.length} Cards · ${ui.db.heroes.length} Heroes`;
    }
    if (syncEl) {
      const labels = {
        bridge: '● Live File Sync',
        'studio+json': '● Studio + Set JSON',
        json: '● cards.json Loaded',
        local: '● Local Studio Cache'
      };
      syncEl.textContent = labels[ui.db.sourceMode] || '● Set 1 Ready';
      syncEl.classList.toggle('is-synced', ui.db.sourceMode === 'bridge' || ui.db.sourceMode === 'studio+json');
    }
    rebuildDynamicFactionFilters();
    if (ui.screen === 'lobby' && ui.decks.length > 0) {
      renderLobby();
    } else if (ui.screen === 'tabletop' && ui.match) {
      renderTabletop();
    }
    if (announce) showToast('Synced latest card stats & text from Card Studio.');
  }

  function rebuildDynamicFactionFilters() {
    const group = $('filter-faction-group');
    if (!group || !ui.db) return;
    const present = new Set(ui.db.collectibles.map(c => c.faction));
    const order = ['R', 'H', 'D', 'T', 'W', 'N'].filter(f => present.has(f));
    if (ui.filters.faction !== 'ALL' && !present.has(ui.filters.faction)) {
      ui.filters.faction = 'ALL';
    }
    group.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = `fpill${ui.filters.faction === 'ALL' ? ' active' : ''}`;
    allBtn.dataset.faction = 'ALL';
    allBtn.textContent = 'All';
    group.appendChild(allBtn);

    order.forEach(code => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `fpill${ui.filters.faction === code ? ' active' : ''}`;
      btn.dataset.faction = code;
      btn.textContent = GD.FACTIONS[code]?.short || code;
      group.appendChild(btn);
    });
  }

  // =========================================================================
  // Deck CRUD & Validation Helpers
  // =========================================================================

  function makeDeckId() {
    return 'deck_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function getActiveDeck() {
    return ui.decks.find(d => d.id === ui.editingDeckId) || null;
  }

  function persistDecks() {
    GD.saveDecks(ui.decks);
  }

  function createNewDeck(shouldRender = true) {
    const defaultHeroes = ui.db && ui.db.heroes.length >= 2
      ? [ui.db.heroes[0].id, ui.db.heroes[1].id]
      : [];
    const n = ui.decks.length + 1;
    const deck = {
      id: makeDeckId(),
      name: `Custom Deck ${n}`,
      heroIds: defaultHeroes,
      cards: {},
      updatedAt: new Date().toISOString()
    };
    ui.decks.unshift(deck);
    ui.editingDeckId = deck.id;
    persistDecks();
    syncSeatSelections();
    if (shouldRender) renderLobby();
  }

  function cloneDeck(sourceDeck) {
    if (!sourceDeck) return;
    const copy = {
      id: makeDeckId(),
      name: `${sourceDeck.name} (Copy)`,
      heroIds: [...(sourceDeck.heroIds || [])],
      cards: { ...(sourceDeck.cards || {}) },
      updatedAt: new Date().toISOString()
    };
    ui.decks.unshift(copy);
    ui.editingDeckId = copy.id;
    persistDecks();
    syncSeatSelections();
    renderLobby();
    showToast(`Cloned "${sourceDeck.name}".`);
  }

  function deleteDeck(deckId) {
    const idx = ui.decks.findIndex(d => d.id === deckId);
    if (idx === -1) return;
    const removed = ui.decks[idx];
    ui.decks.splice(idx, 1);
    if (ui.decks.length === 0) {
      createNewDeck(false);
    } else if (ui.editingDeckId === deckId) {
      ui.editingDeckId = ui.decks[Math.max(0, idx - 1)].id;
    }
    persistDecks();
    syncSeatSelections();
    renderLobby();
    showToast(`Deleted "${removed.name}".`);
  }

  function toggleDeckHero(heroId) {
    const deck = getActiveDeck();
    if (!deck) return;
    if (!Array.isArray(deck.heroIds)) deck.heroIds = [];
    const existingIdx = deck.heroIds.indexOf(heroId);
    if (existingIdx !== -1) {
      deck.heroIds.splice(existingIdx, 1);
    } else if (deck.heroIds.length < 2) {
      deck.heroIds.push(heroId);
    } else {
      // Smoothly replace oldest chosen Hero so 1 click swaps loadouts
      deck.heroIds = [deck.heroIds[1], heroId];
    }
    deck.updatedAt = new Date().toISOString();
    persistDecks();
    syncSeatSelections();
    renderLobby();
  }

  function adjustDeckCard(cardId, delta) {
    const deck = getActiveDeck();
    if (!deck || !ui.db) return;
    const def = ui.db.cardMap.get(cardId);
    if (!def) return;

    const cur = Number(deck.cards[cardId] || 0);
    if (delta > 0) {
      const heroDefs = (deck.heroIds || []).map(id => ui.db.cardMap.get(id)).filter(Boolean);
      if (heroDefs.length < 2) {
        showToast('Pick your 2 Heroes first.');
        return;
      }
      if (!GD.isCardLegalForHeroes(def, heroDefs)) {
        const needMono = (def.pips || 1) >= 2;
        showToast(needMono
          ? `${def.name} requires two ${GD.FACTIONS[def.faction]?.name} Heroes (2-pip loyalty).`
          : `${def.name} isn't in your chosen Heroes' factions.`);
        return;
      }
      const maxCopies = def.tier === 'elite' ? 1 : 2;
      if (cur >= maxCopies) {
        showToast(`${def.name} is already at its ${maxCopies}× copy limit.`);
        return;
      }
      const total = GD.countDeckCards(deck);
      if (total >= 25) {
        showToast('Deck already has 25/25 cards — remove a card first.');
        return;
      }
      deck.cards[cardId] = cur + 1;
    } else if (delta < 0 && cur > 0) {
      if (cur - 1 <= 0) delete deck.cards[cardId];
      else deck.cards[cardId] = cur - 1;
    } else {
      return;
    }

    deck.updatedAt = new Date().toISOString();
    persistDecks();
    syncSeatSelections();
    renderLobby();
  }

  function purgeIllegalCardsFromActiveDeck() {
    const deck = getActiveDeck();
    if (!deck || !ui.db) return;
    const heroDefs = (deck.heroIds || []).map(id => ui.db.cardMap.get(id)).filter(Boolean);
    let removed = 0;
    for (const cid of Object.keys(deck.cards || {})) {
      const c = ui.db.cardMap.get(cid);
      if (!c || !GD.isCardLegalForHeroes(c, heroDefs)) {
        removed += Number(deck.cards[cid] || 0);
        delete deck.cards[cid];
      }
    }
    if (removed > 0) {
      deck.updatedAt = new Date().toISOString();
      persistDecks();
      syncSeatSelections();
      renderLobby();
      showToast(`Removed ${removed} ineligible card${removed === 1 ? '' : 's'}.`);
    }
  }

  function getValidDecks() {
    if (!ui.db) return [];
    return ui.decks.filter(d => GD.validateDeck(d, ui.db).valid);
  }

  function syncSeatSelections() {
    const valid = getValidDecks();
    const validIds = new Set(valid.map(d => d.id));
    if (!validIds.has(ui.seat1DeckId)) {
      ui.seat1DeckId = valid[0]?.id || '';
    }
    if (!validIds.has(ui.seat2DeckId)) {
      ui.seat2DeckId = (valid[1] || valid[0])?.id || '';
    }
  }

  // =========================================================================
  // View 1 Rendering — Custom Deckbuilder & Lobby
  // =========================================================================

  function renderLobby() {
    if (!ui.db) return;
    hideHoverInspector();
    renderMatchSetupPanel();
    renderSavedDecksList();
    renderHeroPicker();
    renderCardPoolGrid();
    renderActiveDeckEditor();
  }

  function renderMatchSetupPanel() {
    const s1 = $('seat1-deck-select');
    const s2 = $('seat2-deck-select');
    const startBtn = $('start-match-btn');
    const hint = $('match-setup-hint');
    const valid = getValidDecks();

    const buildOpts = (selectEl, currentId) => {
      selectEl.innerHTML = '';
      if (valid.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— Complete a 25/25 deck first —';
        selectEl.appendChild(opt);
        selectEl.disabled = true;
        return;
      }
      selectEl.disabled = false;
      valid.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        const hNames = d.heroIds.map(id => ui.db.cardMap.get(id)?.name || '').filter(Boolean).join(' + ');
        opt.textContent = `${d.name} (${hNames})`;
        if (d.id === currentId) opt.selected = true;
        selectEl.appendChild(opt);
      });
    };

    buildOpts(s1, ui.seat1DeckId);
    buildOpts(s2, ui.seat2DeckId);

    const ready = valid.length > 0 && ui.seat1DeckId && ui.seat2DeckId;
    startBtn.disabled = !ready;
    if (ready) {
      const mirror = ui.seat1DeckId === ui.seat2DeckId;
      hint.textContent = mirror
        ? 'Mirror match ready! Build a second 25-card deck anytime to pit different archetypes against each other.'
        : 'Ready! Active player always sits at the bottom with smooth turn-pass perspective.';
    } else {
      const cur = getActiveDeck();
      const cnt = cur ? GD.countDeckCards(cur) : 0;
      hint.textContent = `Add ${Math.max(0, 25 - cnt)} more card${25 - cnt === 1 ? '' : 's'} to finish your first 25-card deck (mirror matches supported).`;
    }
  }

  function renderSavedDecksList() {
    const wrap = $('saved-decks-list');
    wrap.innerHTML = '';

    if (ui.decks.length === 0) {
      wrap.innerHTML = `<div class="empty-decks-box"><span>No saved decks yet.</span></div>`;
      return;
    }

    ui.decks.forEach(d => {
      const check = GD.validateDeck(d, ui.db);
      const item = document.createElement('div');
      item.className = `saved-deck-item${d.id === ui.editingDeckId ? ' is-editing' : ''}`;

      const hasHardIllegal = check.errors.some(e => !e.startsWith('Deck has ') && !e.startsWith('Choose 2'));
      const pillCls = check.valid ? 'is-valid' : hasHardIllegal ? 'is-invalid' : 'is-wip';
      const pillTxt = check.valid ? '25/25 ✓' : hasHardIllegal ? `${check.total}/25 !` : `${check.total}/25`;

      const heroDots = (d.heroIds || []).map(hid => {
        const h = ui.db.cardMap.get(hid);
        if (!h) return '';
        const col = GD.FACTIONS[h.faction]?.color || '#777';
        return `<span class="faction-dot" style="background:${col}"></span><span>${GD.escapeHtml(h.name)}</span>`;
      }).join(' <span style="opacity:.45">·</span> ');

      item.innerHTML = `
        <div class="sdi-top">
          <span class="sdi-name">${GD.escapeHtml(d.name || 'Untitled Deck')}</span>
          <span class="deck-status-pill ${pillCls}">${pillTxt}</span>
        </div>
        <div class="sdi-meta">
          <div class="sdi-heroes">${heroDots || '<em>Pick 2 Heroes</em>'}</div>
          <div class="sdi-actions">
            <button type="button" class="icon-mini-btn js-clone" title="Clone deck">Clone</button>
            ${ui.decks.length > 1 ? '<button type="button" class="icon-mini-btn danger js-del" title="Delete deck">✕</button>' : ''}
          </div>
        </div>
      `;

      item.addEventListener('click', ev => {
        if (ev.target.closest('.js-clone')) {
          ev.stopPropagation();
          cloneDeck(d);
          return;
        }
        if (ev.target.closest('.js-del')) {
          ev.stopPropagation();
          deleteDeck(d.id);
          return;
        }
        ui.editingDeckId = d.id;
        renderLobby();
      });

      wrap.appendChild(item);
    });
  }

  function renderHeroPicker() {
    const grid = $('hero-picker-grid');
    const summary = $('loadout-summary-badge');
    const deck = getActiveDeck();
    grid.innerHTML = '';
    if (!deck) return;

    const pickedIds = deck.heroIds || [];
    const pickedDefs = pickedIds.map(id => ui.db.cardMap.get(id)).filter(Boolean);

    if (pickedDefs.length === 2) {
      if (pickedDefs[0].faction === pickedDefs[1].faction) {
        const fName = GD.FACTIONS[pickedDefs[0].faction]?.name || pickedDefs[0].faction;
        summary.textContent = `Mono-${fName} · Double-Pip Cards Unlocked`;
      } else {
        const n1 = GD.FACTIONS[pickedDefs[0].faction]?.short || pickedDefs[0].faction;
        const n2 = GD.FACTIONS[pickedDefs[1].faction]?.short || pickedDefs[1].faction;
        summary.textContent = `${n1} + ${n2} Dual Loadout (1-Pip Cards)`;
      }
    } else {
      summary.textContent = `Pick ${2 - pickedDefs.length} more Hero${2 - pickedDefs.length === 1 ? '' : 'es'}`;
    }

    ui.db.heroes.forEach(hero => {
      const seatIdx = pickedIds.indexOf(hero.id);
      const isPicked = seatIdx !== -1;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `hero-pick-card${isPicked ? ' is-picked' : ''}`;
      const col = GD.FACTIONS[hero.faction]?.color || '#666';
      const kindLbl = hero.type === 'hero_active'
        ? `Active · ${GD.parseHeroApCost(hero)} AP`
        : 'Passive';

      btn.innerHTML = `
        ${isPicked ? `<span class="hpc-seat-tag">Hero ${seatIdx + 1}</span>` : ''}
        <div class="hpc-avatar-wrap">
          <img class="hpc-avatar" src="${GD.escapeHtml(hero.artUrl || '')}" alt="${GD.escapeHtml(hero.name)}" style="object-position:50% ${hero.artPosY ?? 50}%">
          <span class="hpc-pip" style="background:${col}">${GD.escapeHtml(hero.faction)}</span>
        </div>
        <div class="hpc-body">
          <div class="hpc-title-row">
            <span class="hpc-name">${GD.escapeHtml(hero.name)}</span>
            <span class="hpc-kind">${kindLbl}</span>
          </div>
          <div class="hpc-rules">${GD.formatRulesMarkup(hero.rulesText || '')}</div>
        </div>
      `;

      btn.addEventListener('click', () => toggleDeckHero(hero.id));
      btn.addEventListener('mouseenter', ev => showHoverInspector(hero, null, [], ev.clientX));
      btn.addEventListener('mouseleave', hideHoverInspector);
      grid.appendChild(btn);
    });
  }

  function renderCardPoolGrid() {
    const grid = $('deck-card-grid');
    grid.innerHTML = '';
    const deck = getActiveDeck();
    if (!deck || !ui.db) return;

    if (ui.db.activeCards.length === 0) {
      grid.innerHTML = `
        <div class="empty-decks-box" style="grid-column:1/-1; padding:32px 16px;">
          <strong>Could not auto-fetch <code>cards.json</code> (browser blocked local file fetch).</strong>
          <span>Serve the repo over local HTTP (e.g. <code>python3 -m http.server</code>), or load <code>/storybook/cards.json</code> once below to cache Set 1 locally:</span>
          <button type="button" id="load-fallback-cards-btn" class="btn btn-primary">Load cards.json…</button>
        </div>
      `;
      const btn = $('load-fallback-cards-btn');
      if (btn) btn.addEventListener('click', () => $('fallback-cards-input').click());
      return;
    }

    const heroDefs = (deck.heroIds || []).map(id => ui.db.cardMap.get(id)).filter(Boolean);
    const q = ui.filters.search.trim().toLowerCase();

    const sorted = [...ui.db.collectibles].sort((a, b) => {
      const ea = Number(a.energyReq ?? 0);
      const eb = Number(b.energyReq ?? 0);
      if (ea !== eb) return ea - eb;
      if (a.faction !== b.faction) return a.faction.localeCompare(b.faction);
      const aa = Number(a.apCost ?? 1);
      const ab = Number(b.apCost ?? 1);
      if (aa !== ab) return aa - ab;
      return (a.name || '').localeCompare(b.name || '');
    });

    const filtered = sorted.filter(c => {
      const legal = GD.isCardLegalForHeroes(c, heroDefs);
      if (ui.filters.legalOnly && heroDefs.length === 2 && !legal) return false;
      if (ui.filters.faction !== 'ALL' && c.faction !== ui.filters.faction) return false;
      if (ui.filters.type !== 'ALL' && c.type !== ui.filters.type) return false;
      if (ui.filters.energy !== 'ALL') {
        const e = Number(c.energyReq ?? 0);
        if (ui.filters.energy === '5' ? e < 5 : e !== Number(ui.filters.energy)) return false;
      }
      if (q) {
        const hay = `${c.name} ${c.subtype || ''} ${c.rulesText || ''} ${c.tier || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<p style="grid-column:1/-1; color:var(--ink-muted); padding:24px 0;">No cards match the active filters.</p>`;
      return;
    }

    const totalInDeck = GD.countDeckCards(deck);

    filtered.forEach(def => {
      const qty = Number(deck.cards[def.id] || 0);
      const maxCopies = def.tier === 'elite' ? 1 : 2;
      const legal = heroDefs.length === 2 ? GD.isCardLegalForHeroes(def, heroDefs) : true;

      const tile = document.createElement('div');
      tile.className = 'pool-card-tile';
      if (qty > 0) tile.classList.add('has-copies');
      if (qty >= maxCopies) tile.classList.add('is-maxed');
      if (!legal) tile.classList.add('is-illegal');

      const shell = createScaledCardShell(def, 0.56);
      const stepper = document.createElement('div');
      stepper.className = 'pool-tile-stepper';
      stepper.innerHTML = `
        <button type="button" class="pts-btn js-minus" ${qty <= 0 ? 'disabled' : ''} aria-label="Remove one ${GD.escapeHtml(def.name)}">−</button>
        <span>${qty} / ${maxCopies}${def.tier === 'elite' ? ' ★' : ''}</span>
        <button type="button" class="pts-btn js-plus" ${(!legal || qty >= maxCopies || totalInDeck >= 25) ? 'disabled' : ''} aria-label="Add one ${GD.escapeHtml(def.name)}">+</button>
      `;

      tile.appendChild(shell);
      tile.appendChild(stepper);

      tile.addEventListener('click', ev => {
        if (ev.target.closest('.js-minus')) {
          ev.stopPropagation();
          adjustDeckCard(def.id, -1);
          return;
        }
        if (ev.target.closest('.js-plus')) {
          ev.stopPropagation();
          adjustDeckCard(def.id, +1);
          return;
        }
        adjustDeckCard(def.id, +1);
      });

      tile.addEventListener('contextmenu', ev => {
        ev.preventDefault();
        if (qty > 0) adjustDeckCard(def.id, -1);
      });

      tile.addEventListener('mouseenter', ev => {
        const tok = CARD_TO_TOKEN_ID[def.id];
        if (tok) showHoverInspector(def, null, [], ev.clientX, true);
      });
      tile.addEventListener('mouseleave', hideHoverInspector);

      grid.appendChild(tile);
    });
  }

  function renderActiveDeckEditor() {
    const deck = getActiveDeck();
    if (!deck || !ui.db) return;

    const nameInput = $('deck-name-input');
    if (document.activeElement !== nameInput) {
      nameInput.value = deck.name || '';
    }

    const check = GD.validateDeck(deck, ui.db);
    const badge = $('deck-count-badge');
    const hasHardErr = check.errors.some(e => !e.startsWith('Deck has ') && !e.startsWith('Choose 2'));
    badge.className = `deck-status-pill ${check.valid ? 'is-valid' : hasHardErr ? 'is-invalid' : 'is-wip'}`;
    badge.textContent = check.valid ? '25 / 25 Ready' : `${check.total} / 25`;

    // Energy curve (1..5+) & type breakdown
    const buckets = [0, 0, 0, 0, 0]; // 1,2,3,4,5+
    let nChar = 0, nBldg = 0, nSpell = 0;
    const rows = [];

    for (const [cid, rawQty] of Object.entries(deck.cards || {})) {
      const qty = Number(rawQty) || 0;
      if (qty <= 0) continue;
      const def = ui.db.cardMap.get(cid);
      if (!def) continue;
      const e = Math.max(1, Math.min(5, Number(def.energyReq || 1)));
      buckets[e - 1] += qty;
      if (def.type === 'character') nChar += qty;
      else if (def.type === 'building') nBldg += qty;
      else if (def.type === 'spell') nSpell += qty;
      rows.push({ def, qty });
    }

    const maxBucket = Math.max(6, ...buckets);
    const curveEl = $('energy-curve-bars');
    curveEl.innerHTML = buckets.map((val, idx) => {
      const pct = Math.round((val / maxBucket) * 100);
      return `
        <div class="curve-col" title="${val} card${val === 1 ? '' : 's'} at ${idx === 4 ? '5+' : idx + 1} Energy">
          <span class="curve-val">${val || ''}</span>
          <div class="curve-track"><div class="curve-fill" style="height:${pct}%"></div></div>
          <span class="curve-lbl">${idx === 4 ? '5+' : idx + 1}</span>
        </div>
      `;
    }).join('');

    $('deck-type-breakdown').innerHTML = `${nChar} Char<br>${nBldg} Bldg · ${nSpell} Spell`;

    // Validation banner for illegal cards (e.g. switched from Mono-R to R+H while holding Off With His Head!)
    const valBox = $('deck-validation-box');
    const ruleErrors = check.errors.filter(e => !e.startsWith('Deck has '));
    if (ruleErrors.length > 0) {
      valBox.hidden = false;
      valBox.innerHTML = `
        <div>${ruleErrors.map(GD.escapeHtml).join('<br>')}</div>
        ${hasHardErr ? '<button type="button" id="purge-illegal-btn" class="btn btn-sm">Remove Ineligible Cards</button>' : ''}
      `;
      const pBtn = $('purge-illegal-btn');
      if (pBtn) pBtn.addEventListener('click', purgeIllegalCardsFromActiveDeck);
    } else {
      valBox.hidden = true;
    }

    // Sorted deck rows
    rows.sort((a, b) => {
      const ea = Number(a.def.energyReq ?? 0);
      const eb = Number(b.def.energyReq ?? 0);
      if (ea !== eb) return ea - eb;
      return (a.def.name || '').localeCompare(b.def.name || '');
    });

    const listEl = $('deck-list-scroll');
    listEl.innerHTML = '';
    if (rows.length === 0) {
      listEl.innerHTML = `<div class="empty-decks-box"><span>Click cards in the gallery to add them to your 25-card deck.</span></div>`;
      return;
    }

    const heroDefs = (deck.heroIds || []).map(id => ui.db.cardMap.get(id)).filter(Boolean);
    rows.forEach(({ def, qty }) => {
      const legal = heroDefs.length === 2 ? GD.isCardLegalForHeroes(def, heroDefs) : true;
      const maxCopies = def.tier === 'elite' ? 1 : 2;
      const row = document.createElement('div');
      row.className = `deck-row-item${!legal ? ' is-row-illegal' : ''}`;
      row.style.borderLeftColor = GD.FACTIONS[def.faction]?.color || '#777';

      row.innerHTML = `
        <span class="dri-energy" title="Requires ${def.energyReq} Energy">${def.energyReq}</span>
        ${def.artUrl ? `<img class="dri-thumb" src="${GD.escapeHtml(def.artUrl)}" alt="">` : ''}
        <span class="dri-name">${GD.escapeHtml(def.name)}${def.tier === 'elite' ? ' ★' : ''}</span>
        <span class="dri-ap" title="${def.apCost} AP">${def.apCost}AP</span>
        <div class="dri-controls">
          <button type="button" class="pts-btn js-rminus" aria-label="Remove ${GD.escapeHtml(def.name)}">−</button>
          <span class="dri-qty">×${qty}</span>
          <button type="button" class="pts-btn js-rplus" ${(qty >= maxCopies || check.total >= 25 || !legal) ? 'disabled' : ''} aria-label="Add ${GD.escapeHtml(def.name)}">+</button>
        </div>
      `;

      row.querySelector('.js-rminus').addEventListener('click', () => adjustDeckCard(def.id, -1));
      row.querySelector('.js-rplus').addEventListener('click', () => adjustDeckCard(def.id, +1));
      row.addEventListener('mouseenter', ev => showHoverInspector(def, null, [], ev.clientX));
      row.addEventListener('mouseleave', hideHoverInspector);
      listEl.appendChild(row);
    });
  }

  // =========================================================================
  // Scaled Card Shell & Floating 1.0x Hover Inspector
  // =========================================================================

  function createScaledCardShell(cardDef, scale = 0.55, live = {}) {
    const isHero = cardDef.type === 'hero_active' || cardDef.type === 'hero_passive';
    const shell = document.createElement('div');
    shell.className = `card-scale-shell${isHero ? ' is-hero-shell' : ''}`;
    shell.style.setProperty('--card-scale', String(scale));
    const cardEl = GD.renderFullCard(cardDef, ui.db, live);
    shell.appendChild(cardEl);
    requestAnimationFrame(() => GD.refineAttachedCardFit(cardEl));
    return shell;
  }

  function buildLivePropsForCardInstance(state, ownerIdx, inst) {
    const def = ui.db.cardMap.get(inst.cardId);
    if (!def) return {};
    const fated = Engine.isCardEffectivelyFated(state, ownerIdx, inst);
    const apCost = Engine.getEffectiveApCost(state, ownerIdx, inst, ui.db);
    const atk = (def.attack ?? 0) + (inst.bonusAtk || 0);
    const hp = (def.health ?? 1) + (inst.bonusHp || 0);
    const extra = [...(inst.modLines || [])];
    return {
      apCost,
      attack: atk,
      health: hp,
      maxHealth: hp,
      poisoned: Boolean(inst.poisoned),
      fated,
      stoneSoupBonus: state.players[ownerIdx]?.stoneSoupBonus || 0,
      extraLines: extra
    };
  }

  function showHoverInspector(cardDef, live = null, statusBullets = [], cursorX = 0, tokenOnlyInLobby = false) {
    const box = $('card-hover-inspector');
    if (!box || !cardDef) return;

    // Dock away from pointer so the hovered element/lane is never covered
    const dockLeft = cursorX > window.innerWidth * 0.52;
    box.classList.toggle('dock-left', dockLeft);
    box.classList.toggle('dock-right', !dockLeft);

    box.innerHTML = '';

    if (!tokenOnlyInLobby) {
      const mainCol = document.createElement('div');
      mainCol.className = 'chi-main-col';
      mainCol.appendChild(createScaledCardShell(cardDef, 0.82, live || {}));

      if (statusBullets && statusBullets.length > 0) {
        const sBox = document.createElement('div');
        sBox.className = 'chi-status-box';
        sBox.innerHTML = `<ul>${statusBullets.map(b => `<li>${GD.escapeHtml(b)}</li>`).join('')}</ul>`;
        mainCol.appendChild(sBox);
      }
      box.appendChild(mainCol);
    }

    const tokId = CARD_TO_TOKEN_ID[cardDef.id];
    if (tokId && ui.db.cardMap.has(tokId)) {
      const tokDef = ui.db.cardMap.get(tokId);
      const tokLive = cardDef.id === IDS.GRIMHILDE ? { poisoned: true, fated: true, apCost: 0 } : {};
      const tokCol = document.createElement('div');
      tokCol.className = 'chi-token-col';
      tokCol.innerHTML = `<span class="chi-token-lbl">Related Token</span>`;
      tokCol.appendChild(createScaledCardShell(tokDef, 0.62, tokLive));
      box.appendChild(tokCol);
    }

    box.hidden = false;
  }

  function hideHoverInspector() {
    const box = $('card-hover-inspector');
    if (box) box.hidden = true;
  }

  // =========================================================================
  // Match Launch, Seat Transition & Undo
  // =========================================================================

  function buildMatchSpecFromDeck(deck, seatNumber) {
    return {
      name: `P${seatNumber} · ${deck.name}`,
      heroIds: [...deck.heroIds],
      cardIds: GD.expandDeckToCardIds(deck)
    };
  }

  function launchMatchFromLobby() {
    const d1 = ui.decks.find(d => d.id === ui.seat1DeckId);
    const d2 = ui.decks.find(d => d.id === ui.seat2DeckId);
    if (!d1 || !d2) return;
    if (!GD.validateDeck(d1, ui.db).valid || !GD.validateDeck(d2, ui.db).valid) {
      showToast('Both seats need valid 25-card decks.');
      return;
    }

    const fp = ui.firstPlayerPref === '0'
      ? 0
      : ui.firstPlayerPref === '1'
        ? 1
        : (Math.random() < 0.5 ? 0 : 1);

    startMatchWithSpecs(buildMatchSpecFromDeck(d1, 1), buildMatchSpecFromDeck(d2, 2), fp);
  }

  function startMatchWithSpecs(p0Spec, p1Spec, firstPlayer) {
    ui.lastMatchSpecs = { p0Spec, p1Spec, firstPlayer };
    ui.match = Engine.createMatch(ui.db, p0Spec, p1Spec, { firstPlayer });
    ui.mulliganSelections.clear();
    ui.action = null;
    ui.wishPeekingBoard = false;
    ui.inspectingFinalBoard = false;
    ui.screen = 'tabletop';

    document.body.classList.add('in-tabletop-mode');
    $('lobby-screen').hidden = true;
    $('tabletop-screen').hidden = false;
    hideHoverInspector();
    renderTabletop();
    renderSandboxCardList();
  }

  function exitToLobby() {
    ui.screen = 'lobby';
    ui.action = null;
    ui.logOpen = false;
    ui.sandboxOpen = false;
    document.body.classList.remove('in-tabletop-mode');
    $('tabletop-screen').hidden = true;
    $('mulligan-modal').hidden = true;
    $('wish-modal').hidden = true;
    $('zone-modal').hidden = true;
    $('gameover-modal').hidden = true;
    $('log-drawer').hidden = true;
    $('sandbox-drawer').hidden = true;
    $('lobby-screen').hidden = false;
    hideHoverInspector();
    renderLobby();
  }

  function performUndo() {
    if (!ui.match) return;
    const restored = Engine.undoLastAction(ui.match);
    if (!restored) {
      showToast('Nothing to undo.');
      return;
    }
    ui.match = restored;
    ui.action = null;
    ui.inspectingFinalBoard = false;
    hideHoverInspector();
    renderTabletop();
    showToast('Undid last action.');
  }

  function cancelActiveAction() {
    if (ui.action) {
      ui.action = null;
      ui.hoverInsertIdx = null;
      renderTabletop();
    }
  }

  // =========================================================================
  // View 2 Rendering — 2-Handed Playtest Tabletop
  // =========================================================================

  function renderTabletop() {
    const s = ui.match;
    if (!s || !ui.db) return;

    // During Mulligan, show the player currently mulliganing at the bottom
    const viewIdx = s.phase === 'MULLIGAN' ? s.mulliganStep : s.activePlayer;
    const me = s.players[viewIdx];
    const opp = s.players[1 - viewIdx];

    renderTopMatchBar(s, me);
    renderOpponentHandBar(s, opp);
    renderCommandRow(s, opp, false, $('opp-command-row'));
    renderCharacterLane(s, opp, false, $('opp-char-lane'));
    renderCenterPromptBar(s, me);
    renderCharacterLane(s, me, true, $('friendly-char-lane'));
    renderCommandRow(s, me, true, $('friendly-command-row'));
    renderFriendlyHand(s, me);

    renderMulliganModal(s);
    renderWishModal(s);
    renderGameOverModal(s);
    if (ui.logOpen) renderLogDrawer(s);
    updateSandboxHeaderButtons(s);
  }

  function renderTopMatchBar(s, me) {
    $('round-seat-label').textContent = `Round ${s.round} · ${me.name} (Turn ${me.turnsTaken || 1})`;

    const pMain1 = $('phase-pill-main1');
    const pCombat = $('phase-pill-combat');
    const pMain2 = $('phase-pill-main2');
    pMain1.className = `phase-pill${s.phase === 'MAIN1' ? ' active' : ''}`;
    pCombat.className = `phase-pill${s.phase === 'COMBAT' ? ' active combat-active' : ''}`;
    pMain2.className = `phase-pill${s.phase === 'MAIN2' ? ' active' : ''}`;

    const undoCount = s.undoStack ? s.undoStack.length : 0;
    const undoBtn = $('undo-btn');
    undoBtn.disabled = undoCount === 0;
    undoBtn.textContent = undoCount > 0 ? `↩ Undo (${undoCount})` : '↩ Undo';

    $('peek-hand-btn').classList.toggle('is-toggled', ui.peekEnemyHand);
    $('toggle-log-btn').classList.toggle('is-toggled', ui.logOpen);
    $('toggle-sandbox-btn').classList.toggle('is-toggled', ui.sandboxOpen);

    const endCombatBtn = $('end-combat-btn');
    endCombatBtn.hidden = !(s.phase === 'COMBAT' && !s.pending && !s.gameOver);

    const endTurnBtn = $('end-turn-btn');
    const canEnd = (s.phase === 'MAIN1' || s.phase === 'COMBAT' || s.phase === 'MAIN2') && !s.pending && !s.gameOver;
    endTurnBtn.disabled = !canEnd;

    // Subtle emerald "Done" cue when 0 AP and no ready plays/attacks left
    let anyPlayLeft = false;
    if (canEnd) {
      anyPlayLeft = me.hand.some((_, idx) => Engine.getCardPlayInfo(s, ui.db, idx).playable)
        || me.heroes.some((_, idx) => Engine.getHeroPowerInfo(s, ui.db, idx).usable)
        || me.buildings.some((_, idx) => Engine.getBuildingActionInfo(s, ui.db, idx).usable)
        || ((s.phase === 'MAIN1' && !s.combatUsedThisTurn || s.phase === 'COMBAT') && Engine.getReadyAttackers(s).length > 0);
    }
    endTurnBtn.classList.toggle('all-spent-glow', canEnd && !anyPlayLeft);

    const inspectBtn = $('inspect-gameover-btn');
    inspectBtn.hidden = !(s.gameOver && ui.inspectingFinalBoard);
  }

  function renderOpponentHandBar(s, opp) {
    const oppE = Engine.getPlayerEnergy(opp, ui.db);
    const oppPendingE = Engine.getPendingBuildingEnergy(opp, ui.db);
    const pendingTag = oppPendingE > 0 ? ` (+${oppPendingE}E next)` : '';
    $('opp-seat-chip').innerHTML = `
      <span class="sic-name">${GD.escapeHtml(opp.name)}</span>
      <span class="sic-res" title="Opponent Energy${oppPendingE > 0 ? ` (+${oppPendingE}E comes online on their next turn)` : ''}">${oppE}E${GD.escapeHtml(pendingTag)}</span>
      <span style="opacity:.75;">🂠 ${opp.hand.length}/10</span>
    `;

    const strip = $('opp-cards-strip');
    strip.innerHTML = '';
    if (ui.peekEnemyHand) {
      opp.hand.forEach(inst => {
        const def = ui.db.cardMap.get(inst.cardId);
        if (!def) return;
        const live = buildLivePropsForCardInstance(s, opp.index, inst);
        const wrap = document.createElement('div');
        wrap.className = 'opp-peek-card-wrap';
        wrap.appendChild(createScaledCardShell(def, 0.24, live));
        wrap.addEventListener('mouseenter', ev => {
          const notes = [];
          if (inst.poisoned) notes.push('Poisoned (reverses on opponents)');
          if (live.fated) notes.push('Fate active (0 AP + draw 1 when played)');
          showHoverInspector(def, live, notes, ev.clientX);
        });
        wrap.addEventListener('mouseleave', hideHoverInspector);
        strip.appendChild(wrap);
      });
    } else {
      opp.hand.forEach(() => {
        const back = document.createElement('div');
        back.className = 'card-back-mini';
        strip.appendChild(back);
      });
    }

    const dBtn = $('opp-deck-btn');
    dBtn.textContent = `🂠 ${opp.deck.length}`;
    dBtn.className = `zone-pile-btn${opp.deck.length === 0 ? ' deck-empty' : opp.deck.length <= 3 ? ' deck-low' : ''}`;
    dBtn.onclick = () => openZoneModal(opp, 'deck');

    const gBtn = $('opp-grave-btn');
    gBtn.textContent = `⚰ ${opp.graveyard.length}`;
    gBtn.onclick = () => openZoneModal(opp, 'graveyard');
  }

  function renderCommandRow(s, player, isFriendly, container) {
    container.innerHTML = '';

    // Friendly left side: Resource Crystal Hub
    if (isFriendly) {
      const hub = document.createElement('div');
      hub.className = 'resource-crystal-hub';
      const totalE = Engine.getPlayerEnergy(player, ui.db);
      const pendingE = Engine.getPendingBuildingEnergy(player, ui.db);
      const bldgE = totalE - player.baseEnergy - (player.bonusEnergyTemp || 0);
      const pipCount = Math.max(3, player.maxAp || 0, player.ap || 0);
      let apHtml = '';
      for (let i = 0; i < Math.min(6, pipCount); i++) {
        apHtml += `<span class="ap-gem-pip${i < player.ap ? ' is-lit' : ''}"></span>`;
      }
      const nextETxt = pendingE > 0 ? ` · +${pendingE}E next` : '';
      const soupTxt = player.stoneSoupBonus > 0 ? ` · Soup +${1 + player.stoneSoupBonus}/+${1 + player.stoneSoupBonus}` : '';
      hub.title = `Energy: ${player.baseEnergy} Base + ${bldgE} Active Buildings${player.bonusEnergyTemp ? ` + ${player.bonusEnergyTemp} Temp` : ''} = ${totalE}E${pendingE > 0 ? ` (+${pendingE}E activates at Start of Turn)` : ''}`;
      hub.innerHTML = `
        <div class="energy-orb-big"><span>${totalE}</span></div>
        <div class="res-ap-stack">
          <div class="ap-diamonds-row">${apHtml}</div>
          <span class="res-sub-txt">${player.ap}/${player.maxAp} AP${nextETxt}${soupTxt}</span>
        </div>
      `;
      container.appendChild(hub);
    } else {
      const spacer = document.createElement('div');
      spacer.style.minWidth = '190px';
      container.appendChild(spacer);
    }

    // Center Command Group: [Bldg 0][Bldg 1] — [HeroPwr 0][HERO][HeroPwr 1] — [Bldg 2][Bldg 3]
    const center = document.createElement('div');
    center.className = 'cmd-center-group';

    const leftPair = document.createElement('div');
    leftPair.className = 'bldg-pair';
    leftPair.appendChild(createBuildingSlotEl(s, player, 0, isFriendly));
    leftPair.appendChild(createBuildingSlotEl(s, player, 1, isFriendly));

    const heroCluster = createHeroClusterEl(s, player, isFriendly);

    const rightPair = document.createElement('div');
    rightPair.className = 'bldg-pair';
    rightPair.appendChild(createBuildingSlotEl(s, player, 2, isFriendly));
    rightPair.appendChild(createBuildingSlotEl(s, player, 3, isFriendly));

    center.appendChild(leftPair);
    center.appendChild(heroCluster);
    center.appendChild(rightPair);
    container.appendChild(center);

    // Friendly right side: Deck & Graveyard piles
    if (isFriendly) {
      const piles = document.createElement('div');
      piles.className = 'zone-piles';
      piles.style.minWidth = '205px';
      const dCls = player.deck.length === 0 ? ' deck-empty' : player.deck.length <= 3 ? ' deck-low' : '';
      piles.innerHTML = `
        <button type="button" class="zone-pile-btn${dCls} js-my-deck" title="Deck (${player.deck.length} remaining — empty draw loses! Click to peek in Sandbox)">🂠 ${player.deck.length}</button>
        <button type="button" class="zone-pile-btn js-my-grave" title="Inspect Your Graveyard">⚰ ${player.graveyard.length}</button>
      `;
      piles.querySelector('.js-my-deck').addEventListener('click', () => openZoneModal(player, 'deck'));
      piles.querySelector('.js-my-grave').addEventListener('click', () => openZoneModal(player, 'graveyard'));
      container.appendChild(piles);
    } else {
      const spacer = document.createElement('div');
      spacer.style.minWidth = '190px';
      container.appendChild(spacer);
    }
  }

  function createBuildingSlotEl(s, player, slotIdx, isFriendly) {
    const b = player.buildings[slotIdx];
    const el = document.createElement('div');
    el.className = 'bldg-slot';

    const isPendingOverwrite = s.pending?.type === 'overwrite_building' && s.pending.playerIndex === player.index;
    const isPlacingBldg = isFriendly && ui.action?.mode === 'placing_bldg';
    const placeOverwrite = isPlacingBldg && ui.action.info.isOverwrite;
    const canPlaceHere = (isPlacingBldg && (!b || placeOverwrite)) || isPendingOverwrite;

    if (canPlaceHere) {
      el.classList.add('is-slot-target');
      if (b) el.classList.add('is-overwrite-target');
    }

    if (!b) {
      el.innerHTML = `<span class="bldg-slot-empty-lbl">${canPlaceHere ? '+ Build' : 'Plot'}</span>`;
      if (canPlaceHere) {
        el.addEventListener('click', () => handleBuildingSlotClick(slotIdx, isFriendly, isPendingOverwrite));
      }
      return el;
    }

    const def = ui.db.cardMap.get(b.cardId);
    el.classList.add('is-occupied');

    const actInfo = isFriendly && player.index === s.activePlayer
      ? Engine.getBuildingActionInfo(s, ui.db, slotIdx)
      : { usable: false };

    if (actInfo.usable && !ui.action && !s.pending) {
      el.classList.add('is-activatable');
    }
    if (b.usedThisTurn || b.devoteeUsedThisTurn) {
      el.classList.add('is-used-turn');
    }

    const hasCharges = b.charges !== null && b.charges !== undefined;
    const warming = b.energyActive === false;
    el.innerHTML = `
      ${def?.artUrl ? `<img class="bldg-art" src="${GD.escapeHtml(def.artUrl)}" alt="${GD.escapeHtml(def.name)}" style="object-position:50% ${def.artPosY ?? 50}%">` : ''}
      <span class="bldg-name-strip">${GD.escapeHtml(def?.name || 'Building')}</span>
      ${b.energyProvided > 0 ? `<span class="bldg-e-pip${warming ? ' is-warming' : ''}" title="${warming ? `+${b.energyProvided}E comes online at Start of Turn` : `Active: +${b.energyProvided} Energy`}">${warming ? '⏳' : ''}+${b.energyProvided}E</span>` : ''}
      ${hasCharges ? `<span class="bldg-charge-pip${b.charges <= 0 ? ' is-zero' : ''}">${b.charges}</span>` : ''}
    `;

    el.addEventListener('click', () => handleBuildingSlotClick(slotIdx, isFriendly, isPendingOverwrite));
    el.addEventListener('mouseenter', ev => {
      if (!def) return;
      const notes = [
        warming
          ? `Built this turn — +${b.energyProvided} Energy comes online at your next Start of Turn.`
          : `Active: providing +${b.energyProvided} Energy.`
      ];
      if (hasCharges) {
        notes.push(b.charges > 0 ? `${b.charges} charge counter${b.charges === 1 ? '' : 's'} remaining.` : '0 charges left (ability disabled; keeps +Energy).');
      }
      if (b.usedThisTurn) notes.push('Activated this turn (1/turn limit).');
      if (b.devoteeUsedThisTurn) notes.push('Devotee already triggered this turn.');
      if (isFriendly && actInfo.usable) notes.push(`Click to activate (${actInfo.apCost} AP).`);
      showHoverInspector(def, { durability: b.charges }, notes, ev.clientX);
    });
    el.addEventListener('mouseleave', hideHoverInspector);

    return el;
  }

  function createHeroClusterEl(s, player, isFriendly) {
    const wrap = document.createElement('div');
    wrap.className = 'hero-cluster';

    const pwr0 = player.heroes[0] ? createHeroPowerTileEl(s, player, 0, isFriendly) : null;
    const pwr1 = player.heroes[1] ? createHeroPowerTileEl(s, player, 1, isFriendly) : null;

    // Central 25 HP Hero Medallion featuring split portraits of your 2 chosen Heroes
    const med = document.createElement('div');
    med.className = 'hero-avatar-medallion';

    const h0 = player.heroes[0] ? ui.db.cardMap.get(player.heroes[0].cardId) : null;
    const h1 = player.heroes[1] ? ui.db.cardMap.get(player.heroes[1].cardId) : null;

    // Check readiness & valid targeting states on this Hero
    const canHeroAtk = isFriendly && player.index === s.activePlayer
      && (s.phase === 'MAIN1' && !s.combatUsedThisTurn || s.phase === 'COMBAT')
      && Engine.isHeroReadyToAttack(player)
      && Engine.getLegalCombatTargets(s).length > 0;

    if (canHeroAtk && !ui.action) med.classList.add('is-ready-attacker');
    if (isFriendly && ui.action?.mode === 'combat_attack' && ui.action.attacker.kind === 'hero') {
      med.classList.add('is-selected-attacker');
    }

    const heroTargetedBySpell = (ui.action?.mode === 'target_card')
      && Array.isArray(ui.action.info.targetRule?.validHeroes)
      && ui.action.info.targetRule.validHeroes.includes(player.index);

    const heroTargetedByCombat = !isFriendly && ui.action?.mode === 'combat_attack'
      && ui.action.legalTargets.some(t => t.kind === 'hero' && t.playerIndex === player.index);

    const heroBlockedByProvoke = !isFriendly && ui.action?.mode === 'combat_attack'
      && Engine.isTargetBlockedByProvoke(player, 'hero');

    if (heroTargetedBySpell || heroTargetedByCombat) {
      med.classList.add('is-valid-target');
      if (!isFriendly) med.classList.add('is-enemy-combat-target');
    }
    if (heroBlockedByProvoke) {
      med.classList.add('is-provoke-blocked');
    }

    med.innerHTML = `
      <div class="ham-inner">
        ${h0?.artUrl ? `<img class="ham-half-art" src="${GD.escapeHtml(h0.artUrl)}" alt="">` : '<div class="ham-half-art"></div>'}
        ${h1?.artUrl ? `<img class="ham-half-art" src="${GD.escapeHtml(h1.artUrl)}" alt="">` : '<div class="ham-half-art"></div>'}
      </div>
      ${player.wards > 0 ? '<div class="ward-ring-overlay"></div>' : ''}
      ${player.wards > 0 ? `<span class="ward-count-pill">Ward ×${player.wards}</span>` : ''}
      ${heroBlockedByProvoke ? '<span class="provoke-lock-tag">🛡 Provoke</span>' : ''}
      ${player.tempAtk > 0 ? `<span class="hero-atk-orb" title="${player.tempAtk} Hero Attack this turn">⚔${player.tempAtk}</span>` : ''}
      <span class="hero-hp-orb" title="${player.hp}/${player.maxHp} Hero HP">${player.hp}</span>
    `;

    med.style.cursor = (canHeroAtk || heroTargetedBySpell || heroTargetedByCombat) ? 'pointer' : 'default';
    med.addEventListener('click', () => handleHeroAvatarClick(player, isFriendly));

    if (pwr0) wrap.appendChild(pwr0);
    wrap.appendChild(med);
    if (pwr1) wrap.appendChild(pwr1);
    return wrap;
  }

  function createHeroPowerTileEl(s, player, slotIdx, isFriendly) {
    const slot = player.heroes[slotIdx];
    const def = ui.db.cardMap.get(slot.cardId);
    const tile = document.createElement('div');
    const isPassive = !def || def.type === 'hero_passive';
    tile.className = `hero-power-tile${isPassive ? ' is-passive' : ''}`;

    const info = isFriendly && player.index === s.activePlayer
      ? Engine.getHeroPowerInfo(s, ui.db, slotIdx)
      : { usable: false };

    const effAp = def && !isPassive ? Engine.getEffectiveHeroApCost(player, slot, ui.db) : 0;
    const baseAp = def && !isPassive ? GD.parseHeroApCost(def) : 0;

    if (isFriendly && info.usable && !ui.action && !s.pending) {
      tile.classList.add('is-usable');
    }
    if (!isPassive && slot.usedThisTurn) {
      tile.classList.add('is-spent');
    }
    if (isFriendly && ui.action?.mode === 'target_hero_power' && ui.action.heroSlotIdx === slotIdx) {
      tile.classList.add('is-selected-attacker');
    }

    tile.innerHTML = `
      ${def?.artUrl ? `<img class="hpt-art" src="${GD.escapeHtml(def.artUrl)}" alt="${GD.escapeHtml(def.name)}" style="object-position:50% ${def.artPosY ?? 50}%">` : ''}
      ${isPassive
        ? '<span class="hpt-passive-tag">Passive</span>'
        : `<span class="hpt-ap-badge${effAp < baseAp ? ' is-discounted' : ''}">${effAp} AP</span>`}
      <span class="hpt-name">${GD.escapeHtml(def?.name || 'Hero')}</span>
    `;

    tile.addEventListener('click', () => {
      if (!isFriendly || player.index !== s.activePlayer) return;
      handleHeroPowerClick(slotIdx);
    });

    tile.addEventListener('mouseenter', ev => {
      if (!def) return;
      if (isFriendly && def.id === IDS.BELLADONNA) {
        ui.belladonnaHover = true;
        updateBelladonnaHighlight();
      }
      const notes = [];
      if (isPassive) {
        notes.push('Passive Hero Ability — always active while criteria are met.');
      } else {
        if (slot.usedThisTurn) notes.push('Already used this turn (1/turn).');
        else if (isFriendly && info.usable) notes.push(`Ready — click to activate (${effAp} AP).`);
        else if (isFriendly && info.reason) notes.push(info.reason);
        if (effAp < baseAp) notes.push('Discounted to 0 AP by Lady Tired-of-Waiting!');
      }
      showHoverInspector(def, { apCost: effAp }, notes, ev.clientX);
    });

    tile.addEventListener('mouseleave', () => {
      if (ui.belladonnaHover) {
        ui.belladonnaHover = false;
        updateBelladonnaHighlight();
      }
      hideHoverInspector();
    });

    return tile;
  }

  function renderCharacterLane(s, player, isFriendly, container) {
    container.innerHTML = '';
    const isPlacing = isFriendly && ui.action?.mode === 'placing_char';

    if (player.characters.length === 0 && !isPlacing) {
      container.innerHTML = `<span class="lane-empty-watermark">${isFriendly ? 'Your Character Row (0 / 6)' : 'Enemy Character Row (0 / 6)'}</span>`;
      return;
    }

    if (isPlacing && player.characters.length === 0) {
      container.appendChild(createInsertSlotBtn(0, true, player));
      return;
    }

    for (let i = 0; i < player.characters.length; i++) {
      if (isPlacing) {
        container.appendChild(createInsertSlotBtn(i, false, player));
      }
      container.appendChild(createBoardUnitEl(s, player, player.characters[i], i, isFriendly));
    }
    if (isPlacing) {
      container.appendChild(createInsertSlotBtn(player.characters.length, false, player));
    }
  }

  function createInsertSlotBtn(insertIdx, isEmptyBoard, player) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `insert-slot-btn${isEmptyBoard ? ' is-empty-board-slot' : ''}`;
    btn.innerHTML = isEmptyBoard
      ? `<span>+ Deploy Here</span><span class="insert-idx-lbl">Slot 1 of 6</span>`
      : `<span>+</span><span class="insert-idx-lbl">#${insertIdx + 1}</span>`;

    // Highlight left neighbor for Graybeard / Bloodkey Baron / Valentina when hovering an insertion gap!
    btn.addEventListener('mouseenter', () => {
      const handCard = ui.match?.players[ui.match.activePlayer]?.hand[ui.action?.handIdx];
      const cid = handCard?.cardId;
      if (insertIdx > 0 && (cid === IDS.GRAYBEARD_KNIGHT || cid === IDS.BLOODKEY_BARON || cid === IDS.VALENTINA)) {
        const leftUid = player.characters[insertIdx - 1]?.uid;
        const leftEl = leftUid ? document.querySelector(`[data-unit-uid="${leftUid}"]`) : null;
        if (leftEl) leftEl.classList.add('is-neighbor-preview');
      }
    });
    btn.addEventListener('mouseleave', () => {
      document.querySelectorAll('.board-unit.is-neighbor-preview').forEach(el => el.classList.remove('is-neighbor-preview'));
    });

    btn.addEventListener('click', () => handleInsertSlotChoice(insertIdx));
    return btn;
  }

  function createBoardUnitEl(s, player, unit, idx, isFriendly) {
    const def = ui.db.cardMap.get(unit.cardId);
    const atk = Engine.getUnitAtk(unit);
    const maxHp = Engine.getUnitMaxHp(unit);
    const baseDefAtk = Number(def?.attack ?? unit.baseAtk);
    const baseDefHp = Number(def?.health ?? unit.baseHp);
    const hasSafeguard = Engine.unitHasSafeguard(player, idx);
    const hasFarewell = (unit.extraFarewells && unit.extraFarewells.length > 0)
      || unit.cardId === IDS.HARRIED_HARE
      || unit.cardId === IDS.GRAYBEARD_KNIGHT;
    const hasDevotee = (unit.extraDevotees && unit.extraDevotees.length > 0)
      || unit.cardId === IDS.COURT_TRUMPETER
      || unit.cardId === IDS.SIXPENCE_TARTIST
      || unit.cardId === IDS.LADY_TIRED_OF_WAITING;

    const el = document.createElement('div');
    el.className = 'board-unit';
    el.dataset.faction = def?.faction || 'N';
    el.dataset.unitUid = unit.uid;
    if (unit.intrinsicProvoke) el.classList.add('has-provoke');

    // Ready-to-attack & targeting classes
    const readyAtk = isFriendly && player.index === s.activePlayer
      && (s.phase === 'MAIN1' && !s.combatUsedThisTurn || s.phase === 'COMBAT')
      && Engine.isUnitReadyToAttack(unit)
      && Engine.getLegalCombatTargets(s).length > 0;

    if (readyAtk && !ui.action && !s.pending) el.classList.add('is-ready-attacker');
    if (ui.action?.mode === 'combat_attack' && ui.action.attacker.unitUid === unit.uid) {
      el.classList.add('is-selected-attacker');
    }

    const inSingleTarget = (ui.action?.mode === 'target_card' || ui.action?.mode === 'target_hero_power' || ui.action?.mode === 'target_building')
      && Array.isArray(ui.action.info.targetRule?.validUnits)
      && ui.action.info.targetRule.validUnits.some(v => v.unitUid === unit.uid);

    const inMultiTarget = ui.action?.mode === 'target_multi_card'
      && ui.action.info.targetRule.validUnits.some(v => v.unitUid === unit.uid);

    const isMultiPicked = inMultiTarget && ui.action.pickedUids.includes(unit.uid);

    const inCombatTargets = !isFriendly && ui.action?.mode === 'combat_attack'
      && ui.action.legalTargets.some(t => t.kind === 'character' && t.unitUid === unit.uid);

    const blockedByProvoke = !isFriendly && ui.action?.mode === 'combat_attack'
      && Engine.isTargetBlockedByProvoke(player, 'character', idx);

    if (inSingleTarget || inMultiTarget || inCombatTargets) {
      el.classList.add('is-valid-target');
      if (inCombatTargets) el.classList.add('is-enemy-combat-target');
    }
    if (isMultiPicked) el.classList.add('is-multi-picked');
    if (blockedByProvoke) el.classList.add('is-provoke-blocked');

    // Keyword micro-icons
    let kwHtml = '';
    if (hasSafeguard) kwHtml += `<span class="bu-kw-pip kw-safeguard" title="Safeguard (no damage while attacking Characters)">🛡</span>`;
    if (hasFarewell) kwHtml += `<span class="bu-kw-pip kw-farewell" title="Farewell trigger">💧</span>`;
    if (hasDevotee) kwHtml += `<span class="bu-kw-pip${unit.devoteeUsedThisTurn ? ' kw-devotee-spent' : ''}" title="Devotee (${unit.devoteeUsedThisTurn ? 'used this turn' : 'ready'})">✦</span>`;
    if (unit.cardId === IDS.BLOODKEY_BARON || unit.cardId === IDS.KIT_MERRYWEATHER) {
      kwHtml += `<span class="bu-kw-pip" title="Siege (triggers on attack before combat)">⚔</span>`;
    }
    if (unit.doubleDebutFarewell) {
      kwHtml += `<span class="bu-kw-pip" title="Debut &amp; Farewell trigger twice">2×</span>`;
    }

    const atkCls = atk > baseDefAtk ? ' is-buffed' : atk < baseDefAtk ? ' is-debuffed' : '';
    const hpCls = unit.curHp < maxHp ? ' is-damaged' : maxHp > baseDefHp ? ' is-buffed' : '';
    const sleeping = unit.summoningSick && !unit.intrinsicSwift && !unit.attackedThisTurn;

    el.innerHTML = `
      <div class="bu-inner">
        ${def?.artUrl ? `<img class="bu-art" src="${GD.escapeHtml(def.artUrl)}" alt="${GD.escapeHtml(def.name)}" style="object-position:50% ${def.artPosY ?? 50}%">` : ''}
        <span class="bu-name-ribbon">${GD.escapeHtml(def?.name || 'Character')}</span>
      </div>
      ${unit.intrinsicProvoke ? '<span class="bu-provoke-crest">Provoke</span>' : ''}
      ${blockedByProvoke ? '<span class="provoke-lock-tag">🛡 Guarded</span>' : ''}
      ${unit.wards > 0 ? '<div class="ward-ring-overlay"></div>' : ''}
      ${unit.wards > 0 ? `<span class="ward-count-pill">Ward ×${unit.wards}</span>` : ''}
      ${sleeping ? '<span class="bu-sleep-zzz" title="Summoning sickness">zZz</span>' : ''}
      <div class="bu-kw-stack">${kwHtml}</div>
      <span class="bu-atk-orb${atkCls}">${atk}</span>
      <span class="bu-hp-orb${hpCls}">${unit.curHp}</span>
    `;

    el.addEventListener('click', () => handleBoardUnitClick(player, unit, idx, isFriendly));

    el.addEventListener('mouseenter', ev => {
      if (!def) return;
      const extraLines = [
        ...((unit.templateInst && unit.templateInst.modLines) || []),
        ...(unit.extraFarewells || []).map(f => f.text)
      ];
      const live = {
        attack: atk,
        health: unit.curHp,
        maxHealth: maxHp,
        extraLines
      };
      const notes = [`Position: Slot ${idx + 1} of ${player.characters.length} (${atk}/${unit.curHp}, max ${maxHp} HP)`];
      if (unit.tempAtk || unit.tempPosHp || unit.tempNegHp) {
        notes.push(`Turn modifier: ${unit.tempAtk >= 0 ? '+' : ''}${unit.tempAtk} Atk, +${unit.tempPosHp}/-${unit.tempNegHp} temp HP.`);
      }
      if (unit.wards > 0) notes.push(`Ward ×${unit.wards} (blocks next ${unit.wards} damage hit${unit.wards === 1 ? '' : 's'}).`);
      if (unit.intrinsicProvoke) notes.push('Provoke: shields Hero and non-Provoke immediate left/right neighbors.');
      if (Engine.isTargetBlockedByProvoke(player, 'character', idx)) notes.push('Currently shielded from attacks by an adjacent Provoke ally.');
      if (hasSafeguard) {
        const viaFlynn = !unit.intrinsicSafeguard && !unit.tempSafeguard;
        notes.push(viaFlynn ? 'Safeguard active via Flynn & Basker (2+ allies on each side)!' : 'Safeguard active (0 retaliation when attacking Characters).');
      }
      if (unit.attackedThisTurn) notes.push('Already attacked this turn.');
      else if (sleeping) notes.push('Summoning sickness (ready next turn).');
      showHoverInspector(def, live, notes, ev.clientX);
    });
    el.addEventListener('mouseleave', hideHoverInspector);

    return el;
  }

  function renderCenterPromptBar(s, me) {
    const bar = $('action-prompt-bar');
    bar.innerHTML = '';

    // 1. Mother Pippin 4/4 Building Overwrite Prompt
    if (s.pending?.type === 'overwrite_building') {
      bar.className = 'action-prompt-bar is-active-prompt';
      const txt = document.createElement('span');
      txt.textContent = s.pending.title;
      bar.appendChild(txt);
      if (s.pending.allowSkip) {
        const skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'prompt-mini-btn';
        skipBtn.textContent = 'Keep Current 4 Buildings';
        skipBtn.addEventListener('click', () => {
          Engine.resolveBuildingOverwrite(s, ui.db, 'skip');
          renderTabletop();
        });
        bar.appendChild(skipBtn);
      }
      return;
    }

    // 2. Active Player Targeting / Placement / Combat Step Prompt
    if (ui.action) {
      bar.className = 'action-prompt-bar is-active-prompt';
      let label = '';
      if (ui.action.mode === 'placing_char') {
        const inst = me.hand[ui.action.handIdx];
        const def = ui.db.cardMap.get(inst?.cardId);
        let hint = '';
        if (def?.id === IDS.GRAYBEARD_KNIGHT) hint = ' (gives +3/+2 to left neighbor)';
        else if (def?.id === IDS.BLOODKEY_BARON || def?.id === IDS.VALENTINA) hint = ' (slot #1 avoids left sacrifice)';
        else if (def?.id === IDS.HEDGEROW_MATRON) hint = ' (summons a 1/1 Rabbit on each side)';
        label = `Deploy ${def?.name || 'Character'} — Choose a board position${hint}`;
      } else if (ui.action.mode === 'placing_bldg') {
        const inst = me.hand[ui.action.handIdx];
        const def = ui.db.cardMap.get(inst?.cardId);
        label = ui.action.info.isOverwrite
          ? `4/4 Buildings Full — Choose a Building to overwrite with ${def?.name}`
          : `Build ${def?.name || 'Building'} — Choose a plot beside your Hero`;
      } else if (ui.action.mode === 'combat_attack') {
        label = 'Choose an enemy target to attack (shields show Provoke protection)';
      } else {
        label = ui.action.info?.targetRule?.prompt || 'Choose a target';
      }

      const span = document.createElement('span');
      span.textContent = label;
      bar.appendChild(span);

      // Supper for Two: allow confirming 1 target when 2+ Characters exist!
      if (ui.action.mode === 'target_multi_card' && ui.action.pickedUids.length >= 1) {
        const cBtn = document.createElement('button');
        cBtn.type = 'button';
        cBtn.className = 'prompt-mini-btn confirm';
        cBtn.textContent = `Confirm (${ui.action.pickedUids.length} Target${ui.action.pickedUids.length === 1 ? '' : 's'}) ✓`;
        cBtn.addEventListener('click', () => {
          commitPlayCard(ui.action.handIdx, { target: { unitUids: [...ui.action.pickedUids] } });
        });
        bar.appendChild(cBtn);
      }

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'prompt-mini-btn';
      cancelBtn.textContent = 'Cancel (Esc)';
      cancelBtn.addEventListener('click', cancelActiveAction);
      bar.appendChild(cancelBtn);
      return;
    }

    // 3. Calm Ambient Phase Guidance
    bar.className = 'action-prompt-bar';
    if (s.phase === 'COMBAT') {
      const rem = Engine.getReadyAttackers(s).length;
      bar.textContent = `Combat Step — ${rem} ready attacker${rem === 1 ? '' : 's'} remaining (AP cards locked until Main 2)`;
    } else if (s.phase === 'MAIN2') {
      bar.textContent = 'Main Phase 2 — Spend any remaining AP, then End Turn';
    } else if (s.phase === 'MAIN1') {
      const readyN = Engine.getReadyAttackers(s).length;
      bar.textContent = readyN > 0
        ? `Main Phase 1 — Play cards & abilities, or click a glowing attacker (${readyN} ready) to start Combat`
        : 'Main Phase 1 — Spend AP to play cards, Buildings, and Hero Powers';
    } else if (s.phase === 'GAME_OVER') {
      bar.textContent = `Match Complete — ${s.players[s.gameOver.winner].name} won (${s.gameOver.reason})`;
    }
  }

  function renderFriendlyHand(s, me) {
    const row = $('friendly-hand-row');
    row.innerHTML = '';

    const n = me.hand.length;
    const scale = n >= 9 ? 0.34 : n >= 7 ? 0.37 : 0.4;
    const gap = n >= 9 ? '-10px' : n >= 7 ? '-2px' : '6px';
    row.style.setProperty('--hand-gap', gap);

    const hasBelladonna = Engine.playerHasHero(me, IDS.BELLADONNA);
    const leftFoodIdx = hasBelladonna
      ? me.hand.findIndex(inst => GD.hasSubtype(ui.db.cardMap.get(inst.cardId), 'FOOD'))
      : -1;

    me.hand.forEach((inst, idx) => {
      const def = ui.db.cardMap.get(inst.cardId);
      if (!def) return;
      const live = buildLivePropsForCardInstance(s, me.index, inst);
      const playInfo = s.phase === 'MULLIGAN'
        ? { playable: false, reason: 'Complete mulligan first.' }
        : Engine.getCardPlayInfo(s, ui.db, idx);

      const slot = document.createElement('div');
      slot.className = 'hand-card-slot';
      slot.dataset.handIdx = String(idx);
      if (playInfo.playable && !s.pending) slot.classList.add('is-playable');
      else slot.classList.add('is-unplayable');

      if (ui.action && ui.action.handIdx === idx && (ui.action.mode === 'placing_char' || ui.action.mode === 'placing_bldg' || ui.action.mode === 'target_card' || ui.action.mode === 'target_multi_card')) {
        slot.classList.add('is-selected-hand');
      }

      if (idx === leftFoodIdx) {
        slot.dataset.leftmostFood = 'true';
        const pip = document.createElement('span');
        pip.className = 'outcast-food-pip';
        pip.textContent = inst.poisoned ? 'Left Food (Poisoned)' : 'Belladonna Target';
        slot.appendChild(pip);
      }

      slot.appendChild(createScaledCardShell(def, scale, live));

      slot.addEventListener('click', () => handleHandCardClick(idx));
      slot.addEventListener('mouseenter', ev => {
        const notes = [];
        if (inst.poisoned) notes.push('Poisoned: reverses healing/buffs onto enemy targets (-X/-Y bypasses Ward; reversed heal hits Ward).');
        if (live.fated) notes.push('Fate active: costs 0 AP and draws a card when played!');
        if (inst.apReduction > 0 && !live.fated) notes.push(`Cost reduced by ${inst.apReduction} AP.`);
        if (!playInfo.playable && playInfo.reason) notes.push(playInfo.reason);
        showHoverInspector(def, live, notes, ev.clientX);
      });
      slot.addEventListener('mouseleave', hideHoverInspector);

      row.appendChild(slot);
    });

    updateBelladonnaHighlight();
  }

  function updateBelladonnaHighlight() {
    document.querySelectorAll('.hand-card-slot').forEach(el => {
      el.classList.toggle('is-belladonna-food', ui.belladonnaHover && el.dataset.leftmostFood === 'true');
    });
  }

  // =========================================================================
  // Tabletop Interaction Handlers (State Machine)
  // =========================================================================

  function handleHandCardClick(handIdx) {
    const s = ui.match;
    if (!s || s.phase === 'MULLIGAN' || s.gameOver || s.pending) return;

    // Clicking the already-selected card cancels cleanly
    if (ui.action && ui.action.handIdx === handIdx) {
      cancelActiveAction();
      return;
    }

    const info = Engine.getCardPlayInfo(s, ui.db, handIdx);
    if (!info.playable) {
      showToast(info.reason || 'Cannot play that card right now.');
      return;
    }

    if (info.needsInsertion) {
      ui.action = { mode: 'placing_char', handIdx, info };
      renderTabletop();
      return;
    }

    if (info.needsBuildingSlot) {
      ui.action = { mode: 'placing_bldg', handIdx, info };
      renderTabletop();
      return;
    }

    if (info.targetRule) {
      if (info.targetRule.kind === 'up_to_two_units') {
        ui.action = { mode: 'target_multi_card', handIdx, info, pickedUids: [] };
      } else {
        ui.action = { mode: 'target_card', handIdx, insertIndex: undefined, info };
      }
      renderTabletop();
      return;
    }

    // Untargeted Spell — casts directly (Undo always available!)
    commitPlayCard(handIdx, {});
  }

  function handleInsertSlotChoice(insertIdx) {
    if (!ui.action || ui.action.mode !== 'placing_char') return;
    const { handIdx, info } = ui.action;
    // Whetsmith Apprentice with >=1 ally: pick insertion gap first, then pick ally!
    if (info.targetRule) {
      ui.action = { mode: 'target_card', handIdx, insertIndex: insertIdx, info };
      renderTabletop();
      return;
    }
    commitPlayCard(handIdx, { insertIndex: insertIdx });
  }

  function commitPlayCard(handIdx, opts) {
    const res = Engine.playCard(ui.match, ui.db, handIdx, opts);
    if (!res.ok) {
      showToast(res.reason || 'Could not play card.');
      return;
    }
    ui.action = null;
    hideHoverInspector();
    renderTabletop();
  }

  function handleHeroPowerClick(heroSlotIdx) {
    const s = ui.match;
    if (!s || s.pending || s.gameOver) return;

    if (ui.action?.mode === 'target_hero_power' && ui.action.heroSlotIdx === heroSlotIdx) {
      cancelActiveAction();
      return;
    }

    const info = Engine.getHeroPowerInfo(s, ui.db, heroSlotIdx);
    if (!info.usable) {
      showToast(info.reason || 'Cannot use Hero Power right now.');
      return;
    }

    if (info.targetRule) {
      ui.action = { mode: 'target_hero_power', heroSlotIdx, info };
      renderTabletop();
      return;
    }

    const res = Engine.useHeroPower(s, ui.db, heroSlotIdx);
    if (!res.ok) showToast(res.reason);
    ui.action = null;
    renderTabletop();
  }

  function handleBuildingSlotClick(slotIdx, isFriendly, isPendingOverwrite) {
    const s = ui.match;
    if (!s || s.gameOver) return;

    if (isPendingOverwrite) {
      Engine.resolveBuildingOverwrite(s, ui.db, slotIdx);
      hideHoverInspector();
      renderTabletop();
      return;
    }

    if (!isFriendly) return;

    if (ui.action?.mode === 'placing_bldg') {
      const b = s.players[s.activePlayer].buildings[slotIdx];
      if (b && !ui.action.info.isOverwrite) {
        showToast('Choose one of your open Building plots.');
        return;
      }
      commitPlayCard(ui.action.handIdx, { buildingSlot: slotIdx });
      return;
    }

    if (ui.action?.mode === 'target_building' && ui.action.slotIdx === slotIdx) {
      cancelActiveAction();
      return;
    }

    const info = Engine.getBuildingActionInfo(s, ui.db, slotIdx);
    if (!info.usable) {
      showToast(info.reason || 'Building cannot activate right now.');
      return;
    }

    if (info.targetRule) {
      ui.action = { mode: 'target_building', slotIdx, info };
      renderTabletop();
      return;
    }

    const res = Engine.activateBuilding(s, ui.db, slotIdx);
    if (!res.ok) showToast(res.reason);
    ui.action = null;
    renderTabletop();
  }

  function handleHeroAvatarClick(player, isFriendly) {
    const s = ui.match;
    if (!s || s.pending || s.gameOver) return;

    // 1. Spell targeting Hero (Dub Thee Champion, Powdered Rose-Joys, Harvest Banquet)
    if (ui.action?.mode === 'target_card') {
      const vh = ui.action.info.targetRule?.validHeroes;
      if (Array.isArray(vh) && vh.includes(player.index)) {
        commitPlayCard(ui.action.handIdx, {
          insertIndex: ui.action.insertIndex,
          target: { kind: 'hero', playerIndex: player.index }
        });
        return;
      }
    }

    // 2. Combat targeting Enemy Hero
    if (!isFriendly && ui.action?.mode === 'combat_attack') {
      const res = Engine.declareAttack(s, ui.db, ui.action.attacker, { kind: 'hero', playerIndex: player.index });
      if (!res.ok) {
        showToast(res.reason);
        return;
      }
      ui.action = null;
      renderTabletop();
      return;
    }

    // 3. Selecting Friendly Hero as Attacker (e.g. Old Chestnut Smithy / Dub Thee Champion)
    if (isFriendly && player.index === s.activePlayer) {
      if (ui.action?.mode === 'combat_attack' && ui.action.attacker.kind === 'hero') {
        cancelActiveAction();
        return;
      }
      if ((s.phase === 'MAIN1' && !s.combatUsedThisTurn || s.phase === 'COMBAT') && Engine.isHeroReadyToAttack(player)) {
        const legal = Engine.getLegalCombatTargets(s);
        if (legal.length === 0) {
          showToast('No legal combat targets.');
          return;
        }
        ui.action = { mode: 'combat_attack', attacker: { kind: 'hero', playerIndex: player.index }, legalTargets: legal };
        renderTabletop();
      }
    }
  }

  function handleBoardUnitClick(player, unit, idx, isFriendly) {
    const s = ui.match;
    if (!s || s.pending || s.gameOver) return;

    // 1. Card single-unit or hero-or-unit target
    if (ui.action?.mode === 'target_card') {
      const vu = ui.action.info.targetRule?.validUnits || [];
      if (vu.some(v => v.unitUid === unit.uid)) {
        commitPlayCard(ui.action.handIdx, {
          insertIndex: ui.action.insertIndex,
          target: { kind: 'unit', unitUid: unit.uid }
        });
      } else {
        showToast('Not a valid target for this card.');
      }
      return;
    }

    // 2. Multi-target spell (Supper for Two: 1 or 2 distinct Characters)
    if (ui.action?.mode === 'target_multi_card') {
      const tr = ui.action.info.targetRule;
      if (!tr.validUnits.some(v => v.unitUid === unit.uid)) return;
      const pos = ui.action.pickedUids.indexOf(unit.uid);
      if (pos !== -1) {
        ui.action.pickedUids.splice(pos, 1);
        renderTabletop();
        return;
      }
      ui.action.pickedUids.push(unit.uid);
      if (ui.action.pickedUids.length >= tr.maxTargets) {
        commitPlayCard(ui.action.handIdx, { target: { unitUids: [...ui.action.pickedUids] } });
      } else {
        renderTabletop();
      }
      return;
    }

    // 3. Hero Power target (Rosalind)
    if (ui.action?.mode === 'target_hero_power') {
      const vu = ui.action.info.targetRule?.validUnits || [];
      if (!vu.some(v => v.unitUid === unit.uid)) {
        showToast('Choose a friendly Character.');
        return;
      }
      const res = Engine.useHeroPower(s, ui.db, ui.action.heroSlotIdx, { unitUid: unit.uid });
      if (!res.ok) showToast(res.reason);
      ui.action = null;
      hideHoverInspector();
      renderTabletop();
      return;
    }

    // 4. Building Activation target (Vanity Mirror)
    if (ui.action?.mode === 'target_building') {
      const vu = ui.action.info.targetRule?.validUnits || [];
      if (!vu.some(v => v.unitUid === unit.uid)) {
        showToast('Choose a friendly Character to copy.');
        return;
      }
      const res = Engine.activateBuilding(s, ui.db, ui.action.slotIdx, { unitUid: unit.uid });
      if (!res.ok) showToast(res.reason);
      ui.action = null;
      hideHoverInspector();
      renderTabletop();
      return;
    }

    // 5. Combat target (Enemy Character)
    if (!isFriendly && ui.action?.mode === 'combat_attack') {
      const res = Engine.declareAttack(s, ui.db, ui.action.attacker, {
        kind: 'character',
        playerIndex: player.index,
        unitUid: unit.uid
      });
      if (!res.ok) {
        showToast(res.reason);
        return;
      }
      ui.action = null;
      hideHoverInspector();
      renderTabletop();
      return;
    }

    // 6. Friendly Attacker Selection / Switch
    if (isFriendly && player.index === s.activePlayer) {
      if (ui.action?.mode === 'combat_attack' && ui.action.attacker.unitUid === unit.uid) {
        cancelActiveAction();
        return;
      }
      if (s.phase === 'MAIN2' || (s.phase === 'MAIN1' && s.combatUsedThisTurn)) {
        showToast('Combat Step has already finished this turn.');
        return;
      }
      if (!Engine.isUnitReadyToAttack(unit)) {
        showToast(unit.attackedThisTurn ? 'Already attacked this turn.' : 'Summoning sickness (cannot attack on turn played without Swift).');
        return;
      }
      const legal = Engine.getLegalCombatTargets(s);
      if (legal.length === 0) {
        showToast('No legal combat targets.');
        return;
      }
      ui.action = {
        mode: 'combat_attack',
        attacker: { kind: 'character', playerIndex: player.index, unitUid: unit.uid },
        legalTargets: legal
      };
      renderTabletop();
    }
  }

  // =========================================================================
  // Modals: Selective Mulligan, Wish (1-of-3), Zone Viewer & Game Over
  // =========================================================================

  function renderMulliganModal(s) {
    const modal = $('mulligan-modal');
    if (s.phase !== 'MULLIGAN') {
      modal.hidden = true;
      return;
    }
    modal.hidden = false;
    const p = s.players[s.mulliganStep];
    const goingFirst = s.mulliganStep === s.firstPlayer;
    $('mulligan-title').textContent = `${p.name} — Opening Mulligan (${goingFirst ? 'Going First · 4 Cards' : 'Going Second · 5 Cards'})`;
    $('mulligan-subtitle').textContent = 'Click any cards to shuffle back and replace once. You will also draw +1 card at the start of Turn 1.';

    const btn = $('confirm-mulligan-btn');
    const nRep = ui.mulliganSelections.size;
    btn.textContent = nRep === 0 ? `Keep All ${p.hand.length} Cards` : `Replace ${nRep} Card${nRep === 1 ? '' : 's'}`;

    const row = $('mulligan-cards-row');
    row.innerHTML = '';
    const scale = p.hand.length >= 5 ? 0.58 : 0.64;

    p.hand.forEach((inst, idx) => {
      const def = ui.db.cardMap.get(inst.cardId);
      if (!def) return;
      const replacing = ui.mulliganSelections.has(idx);
      const wrap = document.createElement('div');
      wrap.className = `mulligan-choice${replacing ? ' is-replacing' : ''}`;
      wrap.appendChild(createScaledCardShell(def, scale));
      if (replacing) {
        const sash = document.createElement('div');
        sash.className = 'mulligan-replace-sash';
        sash.textContent = '↻ Replace';
        wrap.appendChild(sash);
      }
      wrap.addEventListener('click', () => {
        if (ui.mulliganSelections.has(idx)) ui.mulliganSelections.delete(idx);
        else ui.mulliganSelections.add(idx);
        renderMulliganModal(s);
      });
      row.appendChild(wrap);
    });
  }

  function renderWishModal(s) {
    const modal = $('wish-modal');
    if (!s.pending || s.pending.type !== 'wish') {
      modal.hidden = true;
      ui.wishPeekingBoard = false;
      return;
    }
    modal.hidden = false;
    modal.classList.toggle('is-peeking-board', ui.wishPeekingBoard);

    const { options, stepIndex = 0, playerIndex, title } = s.pending;
    const total = options.length;
    const remainingAfter = Math.max(0, total - 1 - stepIndex);
    const isFinal = remainingAfter === 0;

    $('wish-title').textContent = title;
    const p = s.players[playerIndex];
    $('wish-subtitle').textContent = ui.wishPeekingBoard
      ? 'Inspecting battlefield — click "Return to Wish" to decide.'
      : p.hand.length >= Engine.MAX_HAND
        ? 'Warning: Your hand is full (10/10) — the card you claim will fizzle!'
        : isFinal
          ? `Final Offer (${stepIndex + 1} of ${total}) — Your fate is sealed! Claim this card (${p.hand.length}/10 in hand).`
          : `Offer ${stepIndex + 1} of ${total} — Claim this card now, or pass it forever to push your luck (${remainingAfter} unseen left).`;

    const peekBtn = $('wish-peek-board-btn');
    peekBtn.textContent = ui.wishPeekingBoard ? '✦ Return to Wish' : '👁 Peek Battlefield';

    const row = $('wish-cards-row');
    row.hidden = ui.wishPeekingBoard;
    row.innerHTML = '';
    if (ui.wishPeekingBoard) return;

    const inst = options[stepIndex];
    const def = inst ? ui.db.cardMap.get(inst.cardId) : null;
    if (!inst || !def) return;

    const stage = document.createElement('div');
    stage.className = 'wish-stage-wrap';

    // 1 -> 2 -> 3 step progress track
    const track = document.createElement('div');
    track.className = 'wish-step-track';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span');
      const cls = i < stepIndex ? ' is-passed' : i === stepIndex ? ' is-current' : '';
      dot.className = `wish-step-dot${cls}`;
      dot.textContent = i === total - 1 && total > 1 ? `Offer ${i + 1} (Final)` : `Offer ${i + 1}`;
      track.appendChild(dot);
    }
    stage.appendChild(track);

    // Single spotlighted card (+ optional related token preview right beside it!)
    const spotRow = document.createElement('div');
    spotRow.className = 'wish-spotlight-row';
    const live = buildLivePropsForCardInstance(s, playerIndex, inst);
    spotRow.appendChild(createScaledCardShell(def, 0.8, live));

    const tokId = CARD_TO_TOKEN_ID[def.id];
    if (tokId && ui.db.cardMap.has(tokId)) {
      const tokDef = ui.db.cardMap.get(tokId);
      const tokLive = def.id === IDS.GRIMHILDE ? { poisoned: true, fated: true, apCost: 0 } : {};
      const tokCol = document.createElement('div');
      tokCol.className = 'chi-token-col';
      tokCol.innerHTML = `<span class="chi-token-lbl">Related Token</span>`;
      tokCol.appendChild(createScaledCardShell(tokDef, 0.56, tokLive));
      spotRow.appendChild(tokCol);
    }
    stage.appendChild(spotRow);

    // Action buttons: Take This Card vs Pass (Push Your Luck)
    const actions = document.createElement('div');
    actions.className = 'wish-action-row';

    const takeBtn = document.createElement('button');
    takeBtn.type = 'button';
    takeBtn.className = 'btn-wish-take';
    takeBtn.textContent = isFinal
      ? `✦ Claim Final Card${inst.poisoned ? ' (Poisoned!)' : ''}`
      : `✦ Take ${def.name}${inst.poisoned ? ' (Poisoned!)' : ''}`;
    takeBtn.addEventListener('click', () => {
      Engine.resolveWish(s, ui.db, stepIndex);
      ui.wishPeekingBoard = false;
      renderTabletop();
    });
    actions.appendChild(takeBtn);

    if (!isFinal) {
      const passBtn = document.createElement('button');
      passBtn.type = 'button';
      passBtn.className = 'btn-wish-pass';
      passBtn.textContent = remainingAfter === 1
        ? 'Pass → Lock In Final Card (Blind)'
        : `Pass → See Offer ${stepIndex + 2} (${remainingAfter} left)`;
      passBtn.addEventListener('click', () => {
        Engine.advanceWish(s);
        renderTabletop();
      });
      actions.appendChild(passBtn);
    }

    stage.appendChild(actions);
    row.appendChild(stage);
  }

  function openZoneModal(player, zoneKind) {
    const modal = $('zone-modal');
    const title = $('zone-modal-title');
    const sub = $('zone-modal-subtitle');
    const grid = $('zone-cards-grid');
    grid.innerHTML = '';

    const list = zoneKind === 'deck' ? player.deck : player.graveyard;
    title.textContent = zoneKind === 'deck'
      ? `${player.name} — Ordered Deck Peek (${list.length})`
      : `${player.name} — Graveyard (${list.length})`;
    sub.textContent = zoneKind === 'deck'
      ? 'Sandbox view from Top (#1 drawn next) to Bottom, including live Kit Merryweather & Grimhilde modifiers.'
      : 'Cards played, destroyed, or discarded this match.';

    if (list.length === 0) {
      grid.innerHTML = `<p style="grid-column:1/-1; opacity:.7;">This zone is empty.</p>`;
    } else {
      list.forEach((inst, i) => {
        const def = ui.db.cardMap.get(inst.cardId);
        if (!def) return;
        const live = buildLivePropsForCardInstance(ui.match, player.index, inst);
        const cell = document.createElement('div');
        cell.className = 'zone-card-item';
        if (zoneKind === 'deck') {
          const b = document.createElement('span');
          b.className = 'zone-order-badge';
          b.textContent = i === 0 ? '#1 (Top Card)' : `#${i + 1}`;
          cell.appendChild(b);
        }
        cell.appendChild(createScaledCardShell(def, 0.48, live));
        grid.appendChild(cell);
      });
    }
    modal.hidden = false;
  }

  function renderGameOverModal(s) {
    const modal = $('gameover-modal');
    if (!s.gameOver || ui.inspectingFinalBoard) {
      modal.hidden = true;
      return;
    }
    modal.hidden = false;
    const winner = s.players[s.gameOver.winner];
    $('gameover-title').textContent = `★ ${winner.name} Wins!`;
    $('gameover-reason').textContent = `${s.gameOver.reason} · Finished on Round ${s.round}`;
    $('gameover-undo-btn').disabled = !(s.undoStack && s.undoStack.length > 0);
  }

  // =========================================================================
  // Drawers: Match Chronicle Log & Playtest God-Mode Sandbox
  // =========================================================================

  function renderLogDrawer(s) {
    const list = $('log-entries-list');
    list.innerHTML = '';
    s.log.forEach(entry => {
      const div = document.createElement('div');
      div.className = `log-entry kind-${entry.kind || 'info'}`;
      div.textContent = entry.text;
      list.appendChild(div);
    });
    list.scrollTop = list.scrollHeight;
  }

  function getSandboxTargetIndex() {
    if (!ui.match) return 0;
    const base = ui.match.phase === 'MULLIGAN' ? ui.match.mulliganStep : ui.match.activePlayer;
    return ui.sandboxTargetMode === 'active' ? base : (1 - base);
  }

  function updateSandboxHeaderButtons(s) {
    if (!ui.sandboxOpen) return;
    const base = s.phase === 'MULLIGAN' ? s.mulliganStep : s.activePlayer;
    $('sb-seat-active-btn').textContent = `Active (${s.players[base].name.split('·')[0].trim()})`;
    $('sb-seat-opp-btn').textContent = `Opponent (${s.players[1 - base].name.split('·')[0].trim()})`;
    $('sb-seat-active-btn').classList.toggle('is-toggled', ui.sandboxTargetMode === 'active');
    $('sb-seat-opp-btn').classList.toggle('is-toggled', ui.sandboxTargetMode === 'opp');
    $('sb-undo-btn').disabled = !(s.undoStack && s.undoStack.length > 0);
  }

  function renderSandboxCardList() {
    const box = $('sb-card-results');
    if (!box || !ui.db) return;
    box.innerHTML = '';
    const q = ui.sandboxSearch.trim().toLowerCase();

    const spawnable = ui.db.activeCards
      .filter(c => c.type !== 'hero_active' && c.type !== 'hero_passive')
      .filter(c => !q || `${c.name} ${c.subtype || ''} ${c.tier}`.toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    spawnable.forEach(def => {
      const row = document.createElement('div');
      row.className = 'sb-spawn-item';
      const tag = def.tier === 'token' ? 'Token' : `${def.energyReq}E`;
      row.innerHTML = `
        <span style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          <strong>${GD.escapeHtml(def.name)}</strong> <span style="opacity:.65">(${tag})</span>
        </span>
        <button type="button" class="table-btn">+ Hand</button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        if (!ui.match) return;
        const tIdx = getSandboxTargetIndex();
        Engine.sandbox.giveCardToHand(ui.match, ui.db, tIdx, def.id, {
          poisoned: $('sb-check-poisoned').checked,
          fated: $('sb-check-fated').checked
        });
        renderTabletop();
        showToast(`Added ${def.name} to ${ui.match.players[tIdx].name}'s hand.`);
      });
      row.addEventListener('mouseenter', ev => showHoverInspector(def, null, [], ev.clientX));
      row.addEventListener('mouseleave', hideHoverInspector);
      box.appendChild(row);
    });
  }

  // =========================================================================
  // Turn Banner & Non-Blocking Toast Feedback
  // =========================================================================

  function showTurnSwapBanner(text) {
    const slot = $('turn-banner-slot');
    slot.innerHTML = `<div class="turn-swap-banner">${GD.escapeHtml(text)}</div>`;
    clearTimeout(ui.bannerTimer);
    ui.bannerTimer = setTimeout(() => { slot.innerHTML = ''; }, 1850);
  }

  function showToast(msg) {
    const slot = $('toast-slot');
    if (!slot || !msg) return;
    slot.innerHTML = `<div class="toast-msg">${GD.escapeHtml(msg)}</div>`;
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => { slot.innerHTML = ''; }, 2400);
  }

  // =========================================================================
  // Event Listeners (Lobby, Tabletop & Keyboard Shortcuts)
  // =========================================================================

  function bindLobbyEvents() {
    $('db-sync-pill').addEventListener('click', () => reloadDatabase(true));
    $('new-deck-btn').addEventListener('click', () => createNewDeck(true));

    $('seat1-deck-select').addEventListener('change', e => {
      ui.seat1DeckId = e.target.value;
      renderMatchSetupPanel();
    });
    $('seat2-deck-select').addEventListener('change', e => {
      ui.seat2DeckId = e.target.value;
      renderMatchSetupPanel();
    });

    ['fp-seat1-btn', 'fp-random-btn', 'fp-seat2-btn'].forEach(id => {
      $(id).addEventListener('click', e => {
        ui.firstPlayerPref = e.currentTarget.dataset.fp;
        ['fp-seat1-btn', 'fp-random-btn', 'fp-seat2-btn'].forEach(other => {
          $(other).classList.toggle('active', other === id);
        });
      });
    });

    $('start-match-btn').addEventListener('click', launchMatchFromLobby);

    $('filter-legal-btn').addEventListener('click', () => {
      ui.filters.legalOnly = !ui.filters.legalOnly;
      $('filter-legal-btn').classList.toggle('active', ui.filters.legalOnly);
      renderCardPoolGrid();
    });

    $('filter-faction-group').addEventListener('click', e => {
      const btn = e.target.closest('[data-faction]');
      if (!btn) return;
      ui.filters.faction = btn.dataset.faction;
      rebuildDynamicFactionFilters();
      renderCardPoolGrid();
    });

    $('filter-type-group').addEventListener('click', e => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      ui.filters.type = btn.dataset.type;
      $('filter-type-group').querySelectorAll('.fpill').forEach(b => b.classList.toggle('active', b === btn));
      renderCardPoolGrid();
    });

    $('filter-energy-group').addEventListener('click', e => {
      const btn = e.target.closest('[data-energy]');
      if (!btn) return;
      ui.filters.energy = btn.dataset.energy;
      $('filter-energy-group').querySelectorAll('.fpill').forEach(b => b.classList.toggle('active', b === btn));
      renderCardPoolGrid();
    });

    $('pool-search-input').addEventListener('input', e => {
      ui.filters.search = e.target.value;
      renderCardPoolGrid();
    });

    $('deck-name-input').addEventListener('input', e => {
      const deck = getActiveDeck();
      if (!deck) return;
      deck.name = e.target.value;
      deck.updatedAt = new Date().toISOString();
      persistDecks();
      renderSavedDecksList();
      renderMatchSetupPanel();
    });

    $('clear-deck-cards-btn').addEventListener('click', () => {
      const deck = getActiveDeck();
      if (!deck) return;
      deck.cards = {};
      deck.updatedAt = new Date().toISOString();
      persistDecks();
      syncSeatSelections();
      renderLobby();
    });

    $('duplicate-active-deck-btn').addEventListener('click', () => cloneDeck(getActiveDeck()));

    // Export / Import Custom Decks JSON
    $('export-decks-btn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ version: 1, decks: ui.decks }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'storybook-decks.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    $('import-decks-btn').addEventListener('click', () => $('import-decks-input').click());
    $('import-decks-input').addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const txt = await file.text();
        const parsed = JSON.parse(txt);
        const list = Array.isArray(parsed) ? parsed : parsed.decks;
        if (!Array.isArray(list)) throw new Error('Invalid deck JSON');
        let added = 0;
        list.forEach(d => {
          if (d && d.heroIds && d.cards) {
            ui.decks.unshift({ ...d, id: makeDeckId(), updatedAt: new Date().toISOString() });
            added += 1;
          }
        });
        if (added > 0) {
          ui.editingDeckId = ui.decks[0].id;
          persistDecks();
          syncSeatSelections();
          renderLobby();
          showToast(`Imported ${added} custom deck${added === 1 ? '' : 's'}.`);
        }
      } catch (_) {
        showToast('Could not parse deck JSON file.');
      }
      e.target.value = '';
    });

    $('fallback-cards-input').addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const txt = await file.text();
        const parsed = JSON.parse(txt);
        if (parsed && Array.isArray(parsed.cards)) {
          localStorage.setItem('storybook_card_studio_v1', JSON.stringify(parsed));
          await reloadDatabase(true);
          const cur = getActiveDeck();
          if (cur && (!cur.heroIds || cur.heroIds.length === 0) && ui.db.heroes.length >= 2) {
            cur.heroIds = [ui.db.heroes[0].id, ui.db.heroes[1].id];
            persistDecks();
            renderLobby();
          }
        }
      } catch (_) {
        showToast('Invalid cards.json file.');
      }
      e.target.value = '';
    });
  }

  function bindTabletopEvents() {
    $('exit-match-btn').addEventListener('click', exitToLobby);
    $('undo-btn').addEventListener('click', performUndo);
    $('sb-undo-btn').addEventListener('click', performUndo);

    $('peek-hand-btn').addEventListener('click', () => {
      ui.peekEnemyHand = !ui.peekEnemyHand;
      renderTabletop();
    });

    $('toggle-log-btn').addEventListener('click', () => {
      ui.logOpen = !ui.logOpen;
      if (ui.logOpen) ui.sandboxOpen = false;
      $('log-drawer').hidden = !ui.logOpen;
      $('sandbox-drawer').hidden = !ui.sandboxOpen;
      renderTabletop();
    });
    $('close-log-btn').addEventListener('click', () => {
      ui.logOpen = false;
      $('log-drawer').hidden = true;
      renderTabletop();
    });

    $('toggle-sandbox-btn').addEventListener('click', () => {
      ui.sandboxOpen = !ui.sandboxOpen;
      if (ui.sandboxOpen) ui.logOpen = false;
      $('sandbox-drawer').hidden = !ui.sandboxOpen;
      $('log-drawer').hidden = !ui.logOpen;
      renderTabletop();
    });
    $('close-sandbox-btn').addEventListener('click', () => {
      ui.sandboxOpen = false;
      $('sandbox-drawer').hidden = true;
      renderTabletop();
    });

    $('end-combat-btn').addEventListener('click', () => {
      if (!ui.match) return;
      ui.action = null;
      Engine.endCombatStep(ui.match);
      renderTabletop();
    });

    $('end-turn-btn').addEventListener('click', () => {
      if (!ui.match) return;
      ui.action = null;
      const prev = ui.match.activePlayer;
      const ok = Engine.endTurn(ui.match, ui.db);
      if (!ok) return;
      hideHoverInspector();
      renderTabletop();
      if (!ui.match.gameOver && ui.match.activePlayer !== prev) {
        const nextP = ui.match.players[ui.match.activePlayer];
        showTurnSwapBanner(`${nextP.name}'s Turn — Turn ${nextP.turnsTaken} (${Engine.getPlayerEnergy(nextP, ui.db)}E · ${nextP.ap} AP)`);
      }
    });

    $('confirm-mulligan-btn').addEventListener('click', () => {
      if (!ui.match) return;
      const step = ui.match.mulliganStep;
      const picks = Array.from(ui.mulliganSelections);
      ui.mulliganSelections.clear();
      Engine.submitMulligan(ui.match, ui.db, step, picks);
      renderTabletop();
      if (ui.match.phase === 'MAIN1') {
        const fp = ui.match.players[ui.match.activePlayer];
        showTurnSwapBanner(`${fp.name} — Turn 1 Begins!`);
      }
    });

    $('wish-peek-board-btn').addEventListener('click', () => {
      ui.wishPeekingBoard = !ui.wishPeekingBoard;
      if (ui.match) renderWishModal(ui.match);
    });

    $('close-zone-modal-btn').addEventListener('click', () => {
      $('zone-modal').hidden = true;
    });
    $('zone-modal').addEventListener('click', e => {
      if (e.target === $('zone-modal')) $('zone-modal').hidden = true;
    });

    // Game Over controls
    $('gameover-undo-btn').addEventListener('click', performUndo);
    $('gameover-inspect-btn').addEventListener('click', () => {
      ui.inspectingFinalBoard = true;
      renderTabletop();
    });
    $('inspect-gameover-btn').addEventListener('click', () => {
      ui.inspectingFinalBoard = false;
      renderTabletop();
    });
    $('gameover-rematch-swap-btn').addEventListener('click', () => {
      if (!ui.lastMatchSpecs) return;
      startMatchWithSpecs(ui.lastMatchSpecs.p0Spec, ui.lastMatchSpecs.p1Spec, 1 - ui.lastMatchSpecs.firstPlayer);
    });
    $('gameover-rematch-same-btn').addEventListener('click', () => {
      if (!ui.lastMatchSpecs) return;
      startMatchWithSpecs(ui.lastMatchSpecs.p0Spec, ui.lastMatchSpecs.p1Spec, ui.lastMatchSpecs.firstPlayer);
    });
    $('gameover-lobby-btn').addEventListener('click', exitToLobby);

    // Sandbox resource buttons
    $('sb-seat-active-btn').addEventListener('click', () => {
      ui.sandboxTargetMode = 'active';
      renderTabletop();
    });
    $('sb-seat-opp-btn').addEventListener('click', () => {
      ui.sandboxTargetMode = 'opp';
      renderTabletop();
    });

    const bindRes = (id, field, delta) => {
      $(id).addEventListener('click', () => {
        if (!ui.match) return;
        Engine.sandbox.adjustResource(ui.match, getSandboxTargetIndex(), field, delta);
        renderTabletop();
      });
    };
    bindRes('sb-ap-minus', 'ap', -1);
    bindRes('sb-ap-plus', 'ap', +1);
    bindRes('sb-ap-plus3', 'ap', +3);
    bindRes('sb-e-minus', 'energy', -1);
    bindRes('sb-e-plus', 'energy', +1);
    bindRes('sb-e-plus3', 'energy', +3);
    bindRes('sb-hp-minus5', 'hp', -5);
    bindRes('sb-hp-minus1', 'hp', -1);
    bindRes('sb-hp-plus1', 'hp', +1);
    bindRes('sb-hp-plus5', 'hp', +5);

    $('sb-hp-reset').addEventListener('click', () => {
      if (!ui.match) return;
      const idx = getSandboxTargetIndex();
      const p = ui.match.players[idx];
      Engine.sandbox.adjustResource(ui.match, idx, 'hp', 25 - p.hp);
      p.maxHp = 25;
      renderTabletop();
    });

    $('sb-force-draw-btn').addEventListener('click', () => {
      if (!ui.match) return;
      Engine.sandbox.forceDraw(ui.match, ui.db, getSandboxTargetIndex());
      renderTabletop();
    });

    $('sb-peek-deck-btn').addEventListener('click', () => {
      if (!ui.match) return;
      openZoneModal(ui.match.players[getSandboxTargetIndex()], 'deck');
    });

    $('sb-spawn-search').addEventListener('input', e => {
      ui.sandboxSearch = e.target.value;
      renderSandboxCardList();
    });

    // Right-click on tabletop cancels active targeting; Escape & Cmd/Ctrl+Z shortcuts
    $('tabletop-screen').addEventListener('contextmenu', e => {
      if (ui.action) {
        e.preventDefault();
        cancelActiveAction();
      }
    });

    window.addEventListener('keydown', e => {
      if (ui.screen !== 'tabletop') return;
      const inInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if (e.key === 'Escape') {
        if (!$('zone-modal').hidden) {
          $('zone-modal').hidden = true;
        } else if (ui.action) {
          cancelActiveAction();
        }
      } else if (!inInput && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        performUndo();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
