/* ==========================================================================
   Storybook Card Studio — Core Application Logic & Wireframe Renderer
   ========================================================================== */

(() => {
  'use strict';

  const STORAGE_KEY = 'storybook_card_studio_v1';
  const SYNC_BRIDGE_URL = 'http://127.0.0.1:8787/api/cards';
  let bridgeConnected = false;
  let linkedFileHandle = null;

  const FACTIONS = {
    R: { code: 'R', name: 'Red Velvet Court', color: 'hsl(347, 65%, 30%)' },
    H: { code: 'H', name: 'Havenhearth', color: 'hsl(37, 78%, 37%)' },
    D: { code: 'D', name: 'Deepbriar', color: 'hsl(148, 47%, 26%)' },
    T: { code: 'T', name: 'Twilight Glade', color: 'hsl(246, 42%, 38%)' },
    W: { code: 'W', name: "Whimsy's Workshop", color: 'hsl(332, 66%, 52%)' },
    N: { code: 'N', name: 'Neutral', color: 'hsl(32, 13%, 38%)' }
  };

  const TYPE_LABELS = {
    character: 'Character',
    building: 'Building',
    spell: 'Spell',
    hero_active: 'Hero Active',
    hero_passive: 'Hero Passive'
  };

  const TIER_LABELS = {
    standard: '2×',
    elite: '1× Elite',
    token: 'Token'
  };

  const DEFAULT_FRAMES = {
    global: '',
    R: './assets/frame-R.jpg',
    H: './assets/frame-H.jpg',
    D: '',
    T: '',
    W: '',
    N: ''
  };

  const DEFAULT_ELITE_CROWNS = {
    R: './assets/elite-R.png',
    H: './assets/elite-H.png',
    D: '',
    T: '',
    W: '',
    N: ''
  };

  const DEFAULT_ELITE_SPELL_CROWNS = {
    R: './assets/elite-R-spell.png',
    H: './assets/elite-H-spell.png',
    D: '',
    T: '',
    W: '',
    N: ''
  };

  let ribbonUidCounter = 0;

  // Application State
  const state = {
    cards: [],
    frameAssets: { ...DEFAULT_FRAMES },
    eliteAssets: { ...DEFAULT_ELITE_CROWNS },
    currentCard: createBlankCard(),
    activeTab: 'studio',       // 'studio' | 'sheet'
    previewMode: 'card',       // 'card' | 'board'
    libFilterFaction: 'ALL',
    libFilterType: 'ALL',
    libSearch: '',
    sheetFilterFaction: 'ALL',
    selectedIds: new Set()
  };

  function createBlankCard(overrides = {}) {
    const baseType = overrides.type || 'character';
    return {
      id: null,
      name: '',
      type: 'character',       // 'character' | 'building' | 'spell' | 'hero_active' | 'hero_passive'
      faction: 'R',            // 'R' | 'H' | 'D' | 'T' | 'W' | 'N'
      pips: 1,                 // 0 (Neutral), 1, or 2 (Mono-Faction XX)
      tier: 'standard',        // 'standard' | 'elite' | 'token'
      energyReq: 1,
      apCost: 1,
      attack: 2,
      health: 2,
      energyProvided: 1,
      durability: null,        // Optional Counter/HP on Building (renders bottom-right)
      subtype: '',
      rulesText: baseType === 'hero_active' ? '{1AP}: ' : '',
      flavorText: '',
      artUrl: '',
      artPosY: 50,
      artPrompt: '',
      relatedCards: '',
      updatedAt: new Date().toISOString(),
      ...overrides
    };
  }

  function generateId() {
    return 'card_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  // DOM Cache
  const dom = {
    counter: document.getElementById('set-card-counter'),
    syncStatusBtn: document.getElementById('sync-status-btn'),
    tabStudioBtn: document.getElementById('tab-studio-btn'),
    tabSheetBtn: document.getElementById('tab-sheet-btn'),
    studioWorkspace: document.getElementById('studio-workspace'),
    sheetWorkspace: document.getElementById('sheet-workspace'),

    openFramesBtn: document.getElementById('open-frames-modal-btn'),
    closeFramesBtn: document.getElementById('close-frames-modal-btn'),
    saveFramesBtn: document.getElementById('save-frames-btn'),
    framesModal: document.getElementById('frames-modal-backdrop'),

    importBtn: document.getElementById('import-json-btn'),
    importInput: document.getElementById('import-json-input'),
    exportBtn: document.getElementById('export-json-btn'),

    form: document.getElementById('card-editor-form'),
    newCardBtn: document.getElementById('new-card-btn'),
    duplicateCardBtn: document.getElementById('duplicate-card-btn'),
    deleteCardBtn: document.getElementById('delete-card-btn'),
    saveCardBtn: document.getElementById('save-card-btn'),

    typeSelector: document.getElementById('type-selector'),
    factionSelector: document.getElementById('faction-selector'),
    factionBtnNeutral: document.getElementById('faction-btn-neutral'),
    factionNameHint: document.getElementById('faction-name-hint'),
    loyaltyTierRow: document.getElementById('loyalty-tier-row'),
    costsStatsRow: document.getElementById('costs-stats-row'),
    pipsGroup: document.getElementById('pips-field-group'),
    pipsSelector: document.getElementById('pips-selector'),
    pipsZeroBtn: document.getElementById('pips-zero-btn'),
    tierGroup: document.getElementById('tier-field-group'),
    tierSelector: document.getElementById('tier-selector'),

    energyReqGroup: document.getElementById('energy-req-group'),
    apCostGroup: document.getElementById('ap-cost-group'),
    charAttackGroup: document.getElementById('char-attack-group'),
    charHealthGroup: document.getElementById('char-health-group'),
    bldgEnergyGroup: document.getElementById('bldg-energy-group'),
    bldgCounterGroup: document.getElementById('bldg-counter-group'),
    subtypeGroup: document.getElementById('subtype-group'),

    inputEnergyReq: document.getElementById('input-energy-req'),
    inputApCost: document.getElementById('input-ap-cost'),
    inputAttack: document.getElementById('input-attack'),
    inputHealth: document.getElementById('input-health'),
    inputEnergyOut: document.getElementById('input-energy-out'),
    inputDurability: document.getElementById('input-durability'),
    inputName: document.getElementById('input-card-name'),
    inputSubtype: document.getElementById('input-subtype'),
    inputRules: document.getElementById('input-rules-text'),
    inputFlavor: document.getElementById('input-flavor-text'),
    inputArtUrl: document.getElementById('input-art-url'),
    inputArtPosY: document.getElementById('input-art-posy'),
    artPosYVal: document.getElementById('art-posy-val'),
    uploadArtBtn: document.getElementById('upload-local-art-btn'),
    uploadArtInput: document.getElementById('upload-local-art-input'),
    inputArtPrompt: document.getElementById('input-art-prompt'),
    copyPromptBtn: document.getElementById('copy-prompt-btn'),
    inputRelated: document.getElementById('input-related-cards'),

    stageFactionLabel: document.getElementById('stage-faction-label'),
    previewCardBtn: document.getElementById('preview-mode-card-btn'),
    previewBoardBtn: document.getElementById('preview-mode-board-btn'),
    liveCard: document.getElementById('live-tcg-card'),
    liveBoardWrap: document.getElementById('live-board-preview'),
    boardSlotCaption: document.getElementById('board-slot-caption'),
    liveBoardToken: document.getElementById('live-board-token'),
    liveBoardContext: document.getElementById('live-board-context'),
    copyCardJsonBtn: document.getElementById('copy-card-json-btn'),

    libSearchInput: document.getElementById('library-search-input'),
    libFactionFilters: document.getElementById('library-faction-filters'),
    libTypeFilters: document.getElementById('library-type-filters'),
    libList: document.getElementById('library-list'),
    filteredCountLabel: document.getElementById('filtered-count-label'),
    clearLibBtn: document.getElementById('clear-library-btn'),
    bulkBar: document.getElementById('library-bulk-bar'),
    bulkSelectAllCb: document.getElementById('bulk-select-all-cb'),
    bulkSelectedCount: document.getElementById('bulk-selected-count'),
    bulkDeleteBtn: document.getElementById('bulk-delete-btn'),

    matrixTable: document.getElementById('faction-matrix-table'),
    curveBars: document.getElementById('energy-curve-bars'),
    sheetFactionFilters: document.getElementById('sheet-faction-filters'),
    cardSheetGrid: document.getElementById('card-sheet-grid'),

    toast: document.getElementById('studio-toast')
  };

  let toastTimer = null;
  function showToast(msg, undoCallback = null) {
    dom.toast.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    dom.toast.appendChild(span);

    if (typeof undoCallback === 'function') {
      const undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'toast-undo-btn';
      undoBtn.textContent = 'Undo';
      undoBtn.addEventListener('click', () => {
        clearTimeout(toastTimer);
        dom.toast.classList.remove('visible');
        undoCallback();
      });
      dom.toast.appendChild(undoBtn);
    }

    dom.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('visible'), undoCallback ? 6000 : 2300);
  }

  function deleteCardsByIds(idSet, label) {
    const prevCards = structuredClone(state.cards);
    const removedCount = state.cards.filter(c => idSet.has(c.id)).length;
    if (removedCount === 0) return;

    state.cards = state.cards.filter(c => !idSet.has(c.id));
    idSet.forEach(id => state.selectedIds.delete(id));

    if (state.currentCard.id && idSet.has(state.currentCard.id)) {
      state.currentCard = createBlankCard({
        faction: state.currentCard.faction,
        type: state.currentCard.type
      });
    }

    persistState();
    syncFormFromCurrent();
    renderLivePreview();
    renderLibrary();
    renderSheetAndMatrix();

    showToast(label || `Deleted ${removedCount} ${removedCount === 1 ? 'card' : 'cards'}`, () => {
      state.cards = prevCards;
      persistState();
      syncFormFromCurrent();
      renderLivePreview();
      renderLibrary();
      renderSheetAndMatrix();
      showToast('Restored deleted cards');
    });
  }

  // Safe HTML Escaping & Inline Token Parser
  function escapeHtml(raw) {
    return String(raw || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let inlineSvgUid = 0;

  function formatRulesMarkup(rawText) {
    if (!rawText || !rawText.trim()) return '';
    const SVGs = window.StorybookCardSVGs;
    const paragraphs = rawText.split(/\n+/);
    return paragraphs.map(line => {
      let html = escapeHtml(line);
      // Parenthetical reminder text (...) is automatically italicized (including any inline symbols inside)
      html = html.replace(/\(([^()]+)\)/g, '<em class="inline-paren">($1)</em>');
      // Bold (**text**) and Italic (*text*)
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
      // Core & Set 1 Keyword Bubbles: {Debut}, {Farewell}, {Poison}/{Poisoned}, {Safeguard}
      html = html.replace(/\{debut:?\}/gi,
        '<span class="inline-kw inline-debut"><svg class="kw-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0.6 L7.5 4.5 L11.4 6 L7.5 7.5 L6 11.4 L4.5 7.5 L0.6 6 L4.5 4.5 Z" fill="currentColor"/></svg>Debut</span>'
      );
      html = html.replace(/\{farewell:?\}/gi,
        '<span class="inline-kw inline-farewell"><svg class="kw-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0.8 C8.4 3.4 9.8 5.4 9.8 7.6 C9.8 9.8 8.1 11.2 6 11.2 C3.9 11.2 2.2 9.8 2.2 7.6 C2.2 5.4 3.6 3.4 6 0.8 Z M6 4.2 C4.8 5.7 4.3 6.7 4.3 7.7 C4.3 8.7 5.0 9.4 6 9.4 C7.0 9.4 7.7 8.7 7.7 7.7 C7.7 6.7 7.2 5.7 6 4.2 Z" fill="currentColor" fill-rule="evenodd"/></svg>Farewell</span>'
      );
      html = html.replace(/\{start\s+of\s+turn:?\}/gi,
        '<span class="inline-kw inline-start-turn"><svg class="kw-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 8.8 H11 V10.2 H1 Z M3.2 8 C3.2 6.45 4.45 5.2 6 5.2 C7.55 5.2 8.8 6.45 8.8 8 Z M5.3 1.4 H6.7 V3.8 H5.3 Z M2.1 3.1 L3.1 2.1 L4.7 3.7 L3.7 4.7 Z M9.9 3.1 L8.3 4.7 L7.3 3.7 L8.9 2.1 Z" fill="currentColor"/></svg>Start of Turn</span>'
      );
      html = html.replace(/\{end\s+of\s+turn:?\}/gi,
        '<span class="inline-kw inline-end-turn"><svg class="kw-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.2 1.1 C4.3 1.4 2.1 3.8 2.1 6.7 C2.1 9.6 4.5 11.4 7.4 11.1 C8.8 10.9 10.0 10.2 10.8 9.1 C8.5 9.4 6.4 7.8 6.1 5.5 C5.8 3.6 6.6 1.9 7.2 1.1 Z M9.2 2.0 L9.7 3.3 L11.0 3.8 L9.7 4.3 L9.2 5.6 L8.7 4.3 L7.4 3.8 L8.7 3.3 Z" fill="currentColor"/></svg>End of Turn</span>'
      );
      html = html.replace(/\{siege:?\}/gi,
        '<span class="inline-kw inline-siege"><svg class="kw-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.8 1.2 L3.6 1.2 L6 3.6 L8.4 1.2 L10.2 1.2 L10.2 3.0 L7.8 5.4 L9.2 6.8 L10.5 5.5 L11.4 6.4 L9.8 8.0 L11.2 9.4 L9.8 10.8 L8.4 9.4 L6.8 11.0 L5.9 10.1 L7.2 8.8 L6 7.6 L4.8 8.8 L6.1 10.1 L5.2 11.0 L3.6 9.4 L2.2 10.8 L0.8 9.4 L2.2 8.0 L0.6 6.4 L1.5 5.5 L2.8 6.8 L4.2 5.4 L1.8 3.0 Z" fill="currentColor"/></svg>Siege</span>'
      );
      html = html.replace(/\{(poison(?:ed)?):?\}/gi, (_, word) => {
        const label = word.toLowerCase() === 'poison' ? 'Poison' : 'Poisoned';
        return `<span class="inline-kw inline-poisoned"><svg class="kw-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.4 0.9 H7.6 V2.3 L6.9 2.9 V4.2 L10.2 8.2 C10.9 9.1 10.3 10.9 8.9 10.9 H3.1 C1.7 10.9 1.1 9.1 1.8 8.2 L5.1 4.2 V2.9 L4.4 2.3 Z M3.8 6.8 L5.5 4.7 H6.5 L8.2 6.8 Z" fill="currentColor" fill-rule="evenodd"/></svg>${label}</span>`;
      });
      html = html.replace(/\{safeguard:?\}/gi,
        '<span class="inline-kw inline-safeguard"><svg class="kw-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0.8 L10.5 2.4 V5.8 C10.5 8.4 8.6 10.3 6 11.3 C3.4 10.3 1.5 8.4 1.5 5.8 V2.4 Z M6 2.5 L3.2 3.5 V5.7 C3.2 7.4 4.3 8.8 6 9.6 Z" fill="currentColor" fill-rule="evenodd"/></svg>Safeguard</span>'
      );
      html = html.replace(/\{provoke:?\}/gi,
        '<span class="inline-kw inline-provoke"><svg class="kw-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.4 1.3 H3.5 V3.1 H4.9 V1.3 H7.1 V3.1 H8.5 V1.3 H10.6 V6.1 C10.6 8.8 8.6 10.4 6 11.3 C3.4 10.4 1.4 8.8 1.4 6.1 Z M5.3 4.8 H6.7 V6.1 H7.8 V7.3 H6.7 V9.0 H5.3 V7.3 H4.2 V6.1 H5.3 Z" fill="currentColor" fill-rule="evenodd"/></svg>Provoke</span>'
      );
      html = html.replace(/\{swift:?\}/gi,
        '<span class="inline-kw inline-swift"><svg class="kw-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M0.8 2.0 H11.4 L9.2 4.3 H2.2 Z M2.0 5.2 H9.8 L7.7 7.4 H3.3 Z M3.2 8.3 H8.1 L6.0 10.5 H4.4 Z" fill="currentColor"/></svg>Swift</span>'
      );
      html = html.replace(/\{(wards?):?\}/gi, (_, word) => {
        const label = word.toLowerCase() === 'wards' ? 'Wards' : 'Ward';
        return `<span class="inline-kw inline-ward"><svg class="kw-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0.8 C8.87 0.8 11.2 3.13 11.2 6 C11.2 8.87 8.87 11.2 6 11.2 C3.13 11.2 0.8 8.87 0.8 6 C0.8 3.13 3.13 0.8 6 0.8 Z M6 2.4 C4.01 2.4 2.4 4.01 2.4 6 C2.4 7.99 4.01 9.6 6 9.6 C7.99 9.6 9.6 7.99 9.6 6 C9.6 4.01 7.99 2.4 6 2.4 Z M6 3.8 L8.2 6 L6 8.2 L3.8 6 Z" fill="currentColor" fill-rule="evenodd"/></svg>${label}</span>`;
      });
      html = html.replace(/\{devotee:?\}/gi,
        '<span class="inline-kw inline-devotee"><svg class="kw-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0.7 L8.3 3.2 L6 5.3 L3.7 3.2 Z M1.7 9.7 L6 5.6 L10.3 9.7 L8.9 11.1 L6 8.3 L3.1 11.1 Z" fill="currentColor"/></svg>Devotee</span>'
      );
      html = html.replace(/\{kinship:?\}/gi,
        '<span class="inline-kw inline-kinship"><svg class="kw-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.8 1.6 C4.79 1.6 5.6 2.41 5.6 3.4 C5.6 4.39 4.79 5.2 3.8 5.2 C2.81 5.2 2.0 4.39 2.0 3.4 C2.0 2.41 2.81 1.6 3.8 1.6 Z M8.2 1.6 C9.19 1.6 10.0 2.41 10.0 3.4 C10.0 4.39 9.19 5.2 8.2 5.2 C7.21 5.2 6.4 4.39 6.4 3.4 C6.4 2.41 7.21 1.6 8.2 1.6 Z M0.7 10.5 C0.7 7.8 2.0 6.2 3.8 6.2 C4.75 6.2 5.45 6.65 6.0 7.45 C6.55 6.65 7.25 6.2 8.2 6.2 C10.0 6.2 11.3 7.8 11.3 10.5 Z" fill="currentColor"/></svg>Kinship</span>'
      );
      html = html.replace(/\{(fated?):?\}/gi, (_, word) => {
        const label = word.toLowerCase() === 'fated' ? 'Fated' : 'Fate';
        return `<span class="inline-kw inline-fate"><svg class="kw-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M0.6 6 C2.2 2.9 4.1 1.8 6 1.8 C7.9 1.8 9.8 2.9 11.4 6 C9.8 9.1 7.9 10.2 6 10.2 C4.1 10.2 2.2 9.1 0.6 6 Z M6 3.4 C4.56 3.4 3.4 4.56 3.4 6 C3.4 7.44 4.56 8.6 6 8.6 C7.44 8.6 8.6 7.44 8.6 6 C8.6 4.56 7.44 3.4 6 3.4 Z M6 4.5 L7.5 6 L6 7.5 L4.5 6 Z" fill="currentColor" fill-rule="evenodd"/></svg>${label}</span>`;
      });
      // Inline AP symbols: {0AP}, {1AP}, {2AP}, {3AP}, {AP} -> actual sculpted AP gem(s) / 0-AP circle!
      html = html.replace(/\{(\d*)AP\}/gi, (_, numStr) => {
        const count = numStr === '' ? 1 : Math.min(6, Math.max(0, Number(numStr)));
        if (!SVGs) return `<span class="inline-ap">◆ ${count} AP</span>`;
        if (count === 0) {
          inlineSvgUid += 1;
          return `<span class="inline-ap-group" title="0 AP">${SVGs.apZeroCircle('in0_' + inlineSvgUid)}</span>`;
        }
        let gems = '';
        for (let i = 0; i < count; i++) {
          inlineSvgUid += 1;
          gems += SVGs.apDiamond('in_' + inlineSvgUid);
        }
        return `<span class="inline-ap-group" title="${count} AP">${gems}</span>`;
      });
      // Inline Energy Gem symbols: {3E}, {+1E}, {-1E}, {XE}, {#E}, {E} -> actual sculpted Sapphire Energy Gem!
      html = html.replace(/\{([+-]?\d+|x|#)?E\}/gi, (_, rawVal) => {
        const val = rawVal ? String(rawVal).toUpperCase() : '';
        if (!SVGs) return `<span class="inline-energy">${val ? val + ' ' : ''}Energy</span>`;
        inlineSvgUid += 1;
        const title = val ? `${val} Energy` : 'Energy';
        return `<span class="inline-energy-gem-wrap" title="${escapeHtml(title)}">${SVGs.energyGem(val, 'ine_' + inlineSvgUid, true)}</span>`;
      });
      // Inline Faction Pips: {R}, {H}, {D}, {T}, {W}
      html = html.replace(/\{([RHDTW])\}/g, (_, f) => {
        const bg = FACTIONS[f] ? FACTIONS[f].color : '#555';
        return `<span class="inline-pip" style="background:${bg}">${f}</span>`;
      });
      return `<p>${html}</p>`;
    }).join('');
  }

  // Enforce Structural Invariants on Card Model
  function normalizeCardConstraints(card) {
    const isHero = card.type === 'hero_active' || card.type === 'hero_passive';
    if (isHero && card.faction === 'N') {
      card.faction = 'R';
    }
    if (card.type === 'hero_active') {
      card.apCost = 1;
      card.energyReq = 0;
    } else if (card.type === 'hero_passive') {
      card.apCost = 0;
      card.energyReq = 0;
    }
    if (card.faction === 'N') {
      card.pips = 0;
    } else if (isHero) {
      card.pips = 1;
    } else if (card.pips !== 1 && card.pips !== 2) {
      card.pips = 1;
    }
    return card;
  }

  // Populate Form Controls from state.currentCard
  function syncFormFromCurrent() {
    const c = normalizeCardConstraints(state.currentCard);
    const isHero = c.type === 'hero_active' || c.type === 'hero_passive';

    // Segmented Type Buttons
    dom.typeSelector.querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === c.type);
    });

    // Faction Swatches
    dom.factionBtnNeutral.disabled = isHero;
    dom.factionSelector.querySelectorAll('.faction-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.faction === c.faction);
    });
    dom.factionNameHint.textContent = FACTIONS[c.faction]?.name || '';

    // Pips Controls
    const oneTwoBtns = dom.pipsSelector.querySelectorAll('[data-pips="1"], [data-pips="2"]');
    const twoBtn = dom.pipsSelector.querySelector('[data-pips="2"]');
    if (c.faction === 'N') {
      oneTwoBtns.forEach(b => { b.disabled = true; b.classList.remove('active'); });
      dom.pipsZeroBtn.disabled = false;
      dom.pipsZeroBtn.classList.add('active');
    } else if (isHero) {
      dom.pipsZeroBtn.disabled = true;
      dom.pipsZeroBtn.classList.remove('active');
      twoBtn.disabled = true;
      twoBtn.classList.remove('active');
      const oneBtn = dom.pipsSelector.querySelector('[data-pips="1"]');
      oneBtn.disabled = false;
      oneBtn.classList.add('active');
    } else {
      dom.pipsZeroBtn.disabled = true;
      dom.pipsZeroBtn.classList.remove('active');
      oneTwoBtns.forEach(b => {
        b.disabled = false;
        b.classList.toggle('active', Number(b.dataset.pips) === c.pips);
      });
    }

    // Tier & Loyalty Visibility (Hero Actives/Passives don't live on deck cards!)
    if (dom.loyaltyTierRow) dom.loyaltyTierRow.hidden = isHero;
    dom.tierGroup.hidden = isHero;
    dom.tierSelector.querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tier === c.tier);
    });

    // Contextual Numeric Fields (Hero Actives always cost 1 AP; Hero Passives have no cost)
    if (dom.costsStatsRow) dom.costsStatsRow.hidden = isHero;
    dom.energyReqGroup.hidden = isHero;
    dom.apCostGroup.hidden = isHero;
    dom.charAttackGroup.hidden = c.type !== 'character';
    dom.charHealthGroup.hidden = c.type !== 'character';
    dom.bldgEnergyGroup.hidden = c.type !== 'building';
    dom.bldgCounterGroup.hidden = c.type !== 'building';
    dom.subtypeGroup.hidden = isHero;
    if (dom.inputName && dom.inputName.parentElement) {
      dom.inputName.parentElement.style.gridColumn = isHero ? '1 / -1' : 'span 2';
    }

    dom.inputEnergyReq.value = c.energyReq ?? 1;
    dom.inputApCost.value = c.apCost ?? 1;
    dom.inputAttack.value = c.attack ?? 2;
    dom.inputHealth.value = c.health ?? 2;
    dom.inputEnergyOut.value = c.energyProvided ?? 1;
    dom.inputDurability.value = (c.durability !== null && c.durability !== undefined && c.durability !== '') ? c.durability : '';

    dom.inputName.value = c.name || '';
    dom.inputSubtype.value = c.subtype || '';
    dom.inputRules.value = c.rulesText || '';
    dom.inputFlavor.value = c.flavorText || '';
    dom.inputArtUrl.value = c.artUrl || '';
    dom.inputArtPosY.value = c.artPosY ?? 50;
    dom.artPosYVal.textContent = `${c.artPosY ?? 50}%`;
    dom.inputArtPrompt.value = c.artPrompt || '';
    dom.inputRelated.value = c.relatedCards || '';

    // Footer Buttons
    const isSaved = Boolean(c.id && state.cards.some(item => item.id === c.id));
    dom.deleteCardBtn.hidden = !isSaved;
    dom.saveCardBtn.textContent = isSaved ? 'Update Card (⌘S)' : 'Save to Set (⌘S)';
  }

  // Render Any Card Object into a `.tcg-card` DOM Node
  function populateCardDom(cardEl, card) {
    const SVGs = window.StorybookCardSVGs;
    const c = normalizeCardConstraints({ ...card });
    const isHero = c.type === 'hero_active' || c.type === 'hero_passive';
    ribbonUidCounter += 1;
    const uid = ribbonUidCounter;

    const isElite = !isHero && c.tier === 'elite';
    cardEl.dataset.faction = c.faction;
    cardEl.dataset.cardType = c.type;
    cardEl.dataset.cardTier = isHero ? 'standard' : (c.tier || 'standard');

    // Elite Topper Crown (Uses bespoke sculpted per-faction PNG when available; flat-sill variant for Spells)
    const eliteCrestSlot = cardEl.querySelector('.elite-crest-slot');
    if (eliteCrestSlot) {
      if (isElite) {
        eliteCrestSlot.hidden = false;
        let crownUrl = state.eliteAssets[c.faction] || DEFAULT_ELITE_CROWNS[c.faction] || '';
        if (c.type === 'spell' && DEFAULT_ELITE_SPELL_CROWNS[c.faction]) {
          if (!crownUrl || crownUrl === DEFAULT_ELITE_CROWNS[c.faction]) {
            crownUrl = DEFAULT_ELITE_SPELL_CROWNS[c.faction];
          }
        }
        if (crownUrl) {
          eliteCrestSlot.innerHTML = `<img src="${escapeHtml(crownUrl)}" class="elite-crest-img" alt="">`;
        } else {
          eliteCrestSlot.innerHTML = SVGs.eliteCrest(uid, c.type === 'spell');
        }
      } else {
        eliteCrestSlot.hidden = true;
        eliteCrestSlot.innerHTML = '';
      }
    }

    // 1. Faction Material Slab Asset
    const bgLayer = cardEl.querySelector('.tcg-card-bg-asset');
    const bgAssetUrl = state.frameAssets[c.faction] || state.frameAssets.global || DEFAULT_FRAMES[c.faction] || '';
    if (bgLayer) {
      bgLayer.style.backgroundImage = bgAssetUrl ? `url("${encodeURI(bgAssetUrl)}")` : 'none';
    }

    // 2. Top Hardware: 3D Energy Gem + AP Diamonds + Crisp Vector Loyalty Coins
    const costCluster = cardEl.querySelector('.cost-cluster');
    costCluster.innerHTML = '';

    if (!isHero) {
      const eWrap = document.createElement('div');
      eWrap.title = `Requires ${c.energyReq} Energy`;
      eWrap.innerHTML = SVGs.energyGem(c.energyReq ?? 0, uid);
      costCluster.appendChild(eWrap);

      const apWrap = document.createElement('div');
      apWrap.className = 'ap-cluster';
      const apCount = Math.max(0, Math.min(4, Number(c.apCost ?? 1)));
      apWrap.title = `Costs ${apCount} Action Point${apCount === 1 ? '' : 's'}`;
      if (apCount === 0) {
        apWrap.innerHTML = SVGs.apZeroCircle(uid);
      } else {
        let gems = '';
        for (let i = 0; i < apCount; i++) {
          gems += SVGs.apDiamond(`${uid}_${i}`);
        }
        apWrap.innerHTML = gems;
      }
      costCluster.appendChild(apWrap);
    }

    const loyaltyCluster = cardEl.querySelector('.loyalty-cluster');
    loyaltyCluster.innerHTML = '';
    if (c.faction === 'N') {
      loyaltyCluster.innerHTML = '<span class="neutral-badge">Neutral</span>';
    } else {
      const count = isHero ? 1 : (c.pips || 1);
      for (let i = 0; i < count; i++) {
        const pipSlot = document.createElement('span');
        pipSlot.className = 'loyalty-pip-slot';
        pipSlot.title = FACTIONS[c.faction]?.name || '';
        pipSlot.innerHTML = SVGs.factionPip(c.faction, `${uid}_p${i}`);
        loyaltyCluster.appendChild(pipSlot);
      }
    }

    // 3. Name Ribbon on Cards vs Lightweight Plaque Header on Hero Actives/Passives
    const ribbonSlot = cardEl.querySelector('.card-ribbon-slot');
    const heroPlaqueHead = cardEl.querySelector('.hero-plaque-head');
    const trimmedName = (c.name || '').trim();
    const displayTitle = trimmedName || `Untitled ${TYPE_LABELS[c.type]}`;

    if (isHero) {
      ribbonSlot.hidden = true;
      ribbonSlot.innerHTML = '';
      if (heroPlaqueHead) {
        heroPlaqueHead.hidden = false;
        const kicker = c.type === 'hero_active' ? 'Hero Active' : 'Hero Passive';
        heroPlaqueHead.innerHTML = `
          <span class="hero-plaque-kicker">${kicker}</span>
          <div class="hero-plaque-title ${!trimmedName ? 'is-placeholder' : ''}">${escapeHtml(displayTitle)}</div>
        `;
      }
    } else {
      ribbonSlot.hidden = false;
      ribbonSlot.innerHTML = SVGs.nameRibbon(displayTitle, !trimmedName, uid, isElite);
      if (heroPlaqueHead) {
        heroPlaqueHead.hidden = true;
        heroPlaqueHead.innerHTML = '';
      }
    }

    // 4. Sculpted Art Window (Oval / Archway / Landscape / Hero Medallion)
    const artFrame = cardEl.querySelector('.card-art-frame');
    artFrame.innerHTML = '';
    if (c.artUrl && c.artUrl.trim()) {
      const img = document.createElement('img');
      img.className = 'card-art-img';
      img.src = c.artUrl.trim();
      img.alt = displayTitle;
      img.style.objectPosition = `50% ${c.artPosY ?? 50}%`;
      img.onerror = () => {
        artFrame.innerHTML = renderWireframePlaceholderHtml(c, uid);
      };
      artFrame.appendChild(img);
    } else {
      artFrame.innerHTML = renderWireframePlaceholderHtml(c, uid);
    }

    // 5. Parchment Watermark + Rules & Flavor Text
    const watermarkEl = cardEl.querySelector('.parchment-watermark');
    if (watermarkEl) {
      watermarkEl.innerHTML = c.faction !== 'N' ? SVGs.factionWatermark(c.faction) : '';
    }

    const rulesEl = cardEl.querySelector('.card-rules-content');
    const flavorEl = cardEl.querySelector('.card-flavor-content');
    const formattedRules = formatRulesMarkup(c.rulesText);
    if (formattedRules) {
      rulesEl.innerHTML = formattedRules;
    } else if (c.type === 'hero_active') {
      inlineSvgUid += 1;
      const gemHtml = SVGs ? `<span class="inline-ap-group">${SVGs.apDiamond('in_' + inlineSvgUid)}</span>: ` : '';
      rulesEl.innerHTML = `<p>${gemHtml}<span style="color:#7c674d; font-style:italic;">Active ability text...</span></p>`;
    } else {
      const emptyPrompt = c.type === 'hero_passive' ? 'Passive effect text...' : 'Rules text...';
      rulesEl.innerHTML = `<p style="color:#7c674d; font-style:italic;">${emptyPrompt}</p>`;
    }

    if (c.flavorText && c.flavorText.trim()) {
      flavorEl.hidden = false;
      flavorEl.textContent = c.flavorText.trim();
    } else {
      flavorEl.hidden = true;
      flavorEl.textContent = '';
    }

    // 6. Optional Bottom Subtype Plaque (Hidden when Subtype is empty!)
    const plaqueEl = cardEl.querySelector('.card-bottom-plaque');
    const typeText = cardEl.querySelector('.type-line-text');
    const sub = (!isHero && c.subtype) ? c.subtype.trim() : '';
    if (sub) {
      plaqueEl.hidden = false;
      typeText.innerHTML = escapeHtml(sub).replace(/\s*-\s*/g, '<span class="subtype-dot" aria-hidden="true">&bull;</span>');
      cardEl.dataset.hasSubtype = 'true';
    } else {
      plaqueEl.hidden = true;
      typeText.textContent = '';
      cardEl.dataset.hasSubtype = 'false';
    }

    // 7. Protruding Bottom Stat Medallions
    const leftBadge = cardEl.querySelector('.stat-slot-left');
    const rightBadge = cardEl.querySelector('.stat-slot-right');

    if (c.type === 'character') {
      leftBadge.hidden = false;
      rightBadge.hidden = false;
      leftBadge.innerHTML = SVGs.attackBadge(c.attack ?? 0, uid);
      rightBadge.innerHTML = SVGs.healthBadge(c.health ?? 1, uid);
    } else if (c.type === 'building') {
      const eOut = Number(c.energyProvided ?? 0);
      if (eOut > 0) {
        leftBadge.hidden = false;
        leftBadge.innerHTML = SVGs.buildingEnergyBadge(eOut, uid);
      } else {
        leftBadge.hidden = true;
        leftBadge.innerHTML = '';
      }

      const hasCounter = c.durability !== null && c.durability !== undefined && String(c.durability).trim() !== '';
      if (hasCounter) {
        rightBadge.hidden = false;
        rightBadge.innerHTML = SVGs.buildingCounterBadge(c.durability, uid);
      } else {
        rightBadge.hidden = true;
        rightBadge.innerHTML = '';
      }
    } else {
      leftBadge.hidden = true;
      rightBadge.hidden = true;
      leftBadge.innerHTML = '';
      rightBadge.innerHTML = '';
    }

    cardEl.dataset.hasStats = (!leftBadge.hidden || !rightBadge.hidden) ? 'true' : 'false';
    fitCardRibbonTitle(cardEl);
    fitCardRulesText(cardEl, c);
  }

  function fitCardRibbonTitle(cardEl) {
    if (!cardEl) return;
    const textEl = cardEl.querySelector('.svg-ribbon-title');
    if (!textEl) return;

    const baseSize = 16.5;
    const maxArcPx = 256; // Usable inner width of the 324-unit SVG ribbon (x=29..295)
    textEl.setAttribute('font-size', String(baseSize));

    try {
      const measuredPx = textEl.getComputedTextLength();
      if (measuredPx > maxArcPx) {
        const scaled = Math.max(11.5, +(baseSize * (maxArcPx / measuredPx)).toFixed(2));
        textEl.setAttribute('font-size', String(scaled));
      }
    } catch (_) {
      // Element not yet in live SVG layout
    }
  }

  function fitCardRulesText(cardEl, c) {
    if (!cardEl || !c) return;
    const isHero = c.type === 'hero_active' || c.type === 'hero_passive';
    const wellEl = cardEl.querySelector('.card-parchment-well');
    const rulesEl = cardEl.querySelector('.card-rules-content');
    const flavorEl = cardEl.querySelector('.card-flavor-content');
    if (!rulesEl) return;

    rulesEl.classList.remove('size-md', 'size-sm', 'size-xs');
    const sizes = isHero ? ['size-md', 'size-sm'] : ['size-md', 'size-sm', 'size-xs'];

    if (wellEl && wellEl.clientHeight > 0) {
      const cs = window.getComputedStyle(wellEl);
      const padTop = parseFloat(cs.paddingTop) || 0;
      const padBot = parseFloat(cs.paddingBottom) || 0;
      const availH = wellEl.clientHeight - padTop - padBot;

      const getContentH = () => {
        const rH = rulesEl.offsetHeight;
        const fH = (flavorEl && !flavorEl.hidden) ? (flavorEl.offsetHeight + 5) : 0;
        return rH + fH;
      };

      if (getContentH() <= availH + 1) return;
      for (const sz of sizes) {
        rulesEl.classList.add(sz);
        if (getContentH() <= availH + 1) return;
        rulesEl.classList.remove(sz);
      }
      rulesEl.classList.add(sizes[sizes.length - 1]);
      return;
    }

    // Fallback when cardEl is offscreen and not yet laid out
    const cleanRules = (c.rulesText || '')
      .replace(/\{[^}]+\}/g, '12345')
      .replace(/\*\*|\*/g, '');
    const effectiveLen = cleanRules.length + ((c.flavorText || '').length * 0.9);
    if (isHero) {
      if (effectiveLen > 280) rulesEl.classList.add('size-sm');
      else if (effectiveLen > 190) rulesEl.classList.add('size-md');
    } else {
      if (effectiveLen > 235) rulesEl.classList.add('size-xs');
      else if (effectiveLen > 180) rulesEl.classList.add('size-sm');
      else if (effectiveLen > 135) rulesEl.classList.add('size-md');
    }
  }

  function renderWireframePlaceholderHtml(c, uid) {
    const SVGs = window.StorybookCardSVGs;
    const isHero = c.type === 'hero_active' || c.type === 'hero_passive';
    const fName = FACTIONS[c.faction]?.name || 'Neutral';
    const promptNote = (c.artPrompt && c.artPrompt.trim()) ? 'Prompt Saved' : 'Illustration Slot';
    const coinHtml = c.faction !== 'N'
      ? `<div class="art-wireframe-coin">${SVGs.factionPip(c.faction, `ph_${uid}`)}</div>`
      : '';
    if (isHero) {
      return `
        <div class="art-wireframe-label is-hero-placeholder">
          ${coinHtml}
          <span class="art-wireframe-sub">${(c.artPrompt && c.artPrompt.trim()) ? 'Prompt Saved' : 'Ability Icon'}</span>
        </div>
      `;
    }
    return `
      <div class="art-wireframe-label">
        ${coinHtml}
        <span class="art-wireframe-glyph">${TYPE_LABELS[c.type]}</span>
        <span class="art-wireframe-sub">${escapeHtml(fName)} • ${promptNote}</span>
      </div>
    `;
  }

  function createStandaloneCardElement(card) {
    const wrapper = dom.liveCard.cloneNode(true);
    wrapper.removeAttribute('id');
    wrapper.classList.remove('hidden');
    wrapper.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    populateCardDom(wrapper, card);
    return wrapper;
  }

  // Render Live Stage (Full Card + Board Slot Preview)
  function renderLivePreview() {
    const c = normalizeCardConstraints(state.currentCard);
    const fInfo = FACTIONS[c.faction] || FACTIONS.N;
    const isHero = c.type === 'hero_active' || c.type === 'hero_passive';
    const pipDesc = c.faction === 'N'
      ? '0 Pips'
      : c.type === 'hero_active'
        ? 'Hero Active'
        : c.type === 'hero_passive'
          ? 'Hero Passive'
          : c.pips === 2
            ? '2 Pips'
            : '1 Pip';
    dom.stageFactionLabel.textContent = `${fInfo.name} • ${pipDesc}`;
    dom.previewCardBtn.textContent = isHero ? 'Ability Plaque' : 'Full Card';

    populateCardDom(dom.liveCard, c);
    renderBoardSlotPreview(c);

    dom.liveCard.classList.toggle('hidden', state.previewMode !== 'card');
    dom.liveBoardWrap.classList.toggle('hidden', state.previewMode !== 'board');
    dom.previewCardBtn.classList.toggle('active', state.previewMode === 'card');
    dom.previewBoardBtn.classList.toggle('active', state.previewMode === 'board');
  }

  function renderBoardSlotPreview(c) {
    dom.liveBoardWrap.dataset.faction = c.faction;
    const title = (c.name || '').trim() || `Untitled ${TYPE_LABELS[c.type]}`;
    const artHtml = (c.artUrl && c.artUrl.trim())
      ? `<img src="${escapeHtml(c.artUrl.trim())}" class="card-art-img" style="object-position:50% ${c.artPosY ?? 50}%" alt="">`
      : `<span class="art-wireframe-glyph" style="font-size:0.9rem;">${c.faction}</span>`;

    dom.liveBoardToken.className = 'board-token';

    if (c.type === 'character') {
      dom.boardSlotCaption.textContent = 'Central Combat Row — 1 of 6 Character Slots (Non-Overwritable)';
      dom.liveBoardToken.innerHTML = `
        <div class="board-token-art">${artHtml}</div>
        <div class="board-token-name">${escapeHtml(title)}</div>
        <div class="board-token-badges">
          <span class="mini-stat mini-atk">${c.attack ?? 0}</span>
          <span class="mini-stat mini-hp">${c.health ?? 1}</span>
        </div>
      `;
      dom.liveBoardContext.innerHTML = [1, 2, 3, 4, 5, 6].map(i =>
        `<div class="ghost-slot ${i === 3 ? 'active-slot' : ''}">${i === 3 ? 'HERE' : `C${i}`}</div>`
      ).join('');
    } else if (c.type === 'building') {
      dom.boardSlotCaption.textContent = 'Command Row — 1 of 4 Building Slots (2 Left + 2 Right of Hero, Overwritable)';
      dom.liveBoardToken.classList.add('is-building');
      const eOut = Number(c.energyProvided ?? 0);
      const hasCtr = c.durability !== null && c.durability !== undefined && String(c.durability).trim() !== '';
      dom.liveBoardToken.innerHTML = `
        <div class="board-token-art">${artHtml}</div>
        <div class="board-token-name">${escapeHtml(title)}</div>
        <div class="board-token-badges">
          <span>${eOut > 0 ? `<span class="mini-stat mini-en">+${eOut}E</span>` : ''}</span>
          <span>${hasCtr ? `<span class="mini-stat mini-ctr">${escapeHtml(c.durability)}</span>` : ''}</span>
        </div>
      `;
      dom.liveBoardContext.innerHTML = `
        <div class="ghost-slot">B1</div>
        <div class="ghost-slot active-slot">HERE</div>
        <div class="ghost-hero"><span>HERO</span><span>25 HP</span></div>
        <div class="ghost-slot">B3</div>
        <div class="ghost-slot">B4</div>
      `;
    } else if (c.type === 'hero_active' || c.type === 'hero_passive') {
      const SVGs = window.StorybookCardSVGs;
      const isAct = c.type === 'hero_active';
      dom.boardSlotCaption.textContent = isAct
        ? 'Hero Active Medallion — Triggered 1/Turn for 1 AP'
        : 'Hero Passive Medallion — Always-On Faction Passive';
      dom.liveBoardToken.classList.add('is-building');
      inlineSvgUid += 1;
      const actGem = (isAct && SVGs) ? `<span class="inline-ap-group">${SVGs.apDiamond('bd_' + inlineSvgUid)}</span>` : '';
      dom.liveBoardToken.innerHTML = `
        <div class="board-token-art">${artHtml}</div>
        <div class="board-token-name">${escapeHtml(title)}</div>
        <div class="board-token-badges" style="justify-content:center;">
          ${isAct ? actGem : '<span class="mini-stat mini-en">PASSIVE</span>'}
        </div>
      `;
      dom.liveBoardContext.innerHTML = `
        <div class="ghost-slot ${isAct ? 'active-slot' : ''}">ACT</div>
        <div class="ghost-hero"><span>HERO</span><span>25 HP</span></div>
        <div class="ghost-slot ${!isAct ? 'active-slot' : ''}">PAS</div>
      `;
    } else {
      dom.boardSlotCaption.textContent = 'Spell — Cast from Hand (Resolves & Moves to Graveyard)';
      dom.liveBoardToken.innerHTML = `
        <div class="board-token-art">${artHtml}</div>
        <div class="board-token-name">${escapeHtml(title)}</div>
        <div class="board-token-badges" style="justify-content:center;">
          <span class="mini-stat mini-en">Req ${c.energyReq ?? 0} • ${c.apCost ?? 1} AP</span>
        </div>
      `;
      dom.liveBoardContext.innerHTML = `<span class="field-hint">Does not occupy a Character or Building slot</span>`;
    }
  }

  // Render Right-Column Library List
  function renderLibrary() {
    dom.counter.textContent = `${state.cards.length} ${state.cards.length === 1 ? 'Card' : 'Cards'}`;

    const q = state.libSearch.trim().toLowerCase();
    const filtered = state.cards.filter(c => {
      if (state.libFilterFaction !== 'ALL' && c.faction !== state.libFilterFaction) return false;
      if (state.libFilterType === 'token') {
        if (c.tier !== 'token') return false;
      } else if (state.libFilterType === 'hero') {
        if (c.type !== 'hero_active' && c.type !== 'hero_passive') return false;
      } else if (state.libFilterType !== 'ALL' && c.type !== state.libFilterType) {
        return false;
      }
      if (q) {
        const hay = `${c.name} ${c.subtype} ${c.rulesText} ${c.flavorText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Sort Tokens after EVERYTHING else -> then by Faction order -> Energy Req -> Name
    const fOrder = { R: 1, H: 2, D: 3, T: 4, W: 5, N: 6 };
    filtered.sort((a, b) => {
      const ta = a.tier === 'token' ? 1 : 0;
      const tb = b.tier === 'token' ? 1 : 0;
      if (ta !== tb) return ta - tb;
      if (fOrder[a.faction] !== fOrder[b.faction]) return (fOrder[a.faction] || 9) - (fOrder[b.faction] || 9);
      const ea = (a.type === 'hero_active' || a.type === 'hero_passive') ? -1 : (a.energyReq ?? 0);
      const eb = (b.type === 'hero_active' || b.type === 'hero_passive') ? -1 : (b.energyReq ?? 0);
      if (ea !== eb) return ea - eb;
      return (a.name || '').localeCompare(b.name || '');
    });

    // Prune any stale selectedIds
    const validIdSet = new Set(state.cards.map(c => c.id));
    state.selectedIds.forEach(id => {
      if (!validIdSet.has(id)) state.selectedIds.delete(id);
    });

    dom.filteredCountLabel.textContent = `${filtered.length} shown`;
    dom.clearLibBtn.hidden = state.cards.length === 0;
    dom.bulkBar.hidden = filtered.length === 0;
    dom.libList.innerHTML = '';

    // Update bulk selection controls
    const shownSelectedCount = filtered.filter(c => state.selectedIds.has(c.id)).length;
    const totalSelected = state.selectedIds.size;
    dom.bulkSelectAllCb.checked = filtered.length > 0 && shownSelectedCount === filtered.length;
    dom.bulkSelectAllCb.indeterminate = shownSelectedCount > 0 && shownSelectedCount < filtered.length;
    dom.bulkSelectedCount.textContent = totalSelected > 0 ? `${totalSelected} selected` : 'Select shown';
    dom.bulkDeleteBtn.hidden = totalSelected === 0;
    dom.bulkDeleteBtn.textContent = `Delete Selected (${totalSelected})`;
    dom.bulkBar.dataset.shownIds = JSON.stringify(filtered.map(c => c.id));

    if (filtered.length === 0) {
      dom.libList.innerHTML = state.cards.length === 0
        ? '<div class="lib-empty">Your Set 1 library is empty.<br>Design a card on the left and press <strong>Save to Set</strong>, or import a JSON file.</div>'
        : '<div class="lib-empty">No cards match the active filters.</div>';
      return;
    }

    filtered.forEach(c => {
      const isToken = c.tier === 'token';
      const row = document.createElement('div');
      row.className = 'lib-row' + (state.currentCard.id === c.id ? ' selected' : '') + (isToken ? ' is-token' : '');
      const isHero = c.type === 'hero_active' || c.type === 'hero_passive';
      const orbText = c.type === 'hero_active' ? 'A' : c.type === 'hero_passive' ? 'P' : (c.energyReq ?? 0);
      const orbColor = FACTIONS[c.faction]?.color || '#555';
      const pipStr = c.faction === 'N' ? 'N' : c.faction.repeat(isHero ? 1 : (c.pips || 1));
      const isChecked = state.selectedIds.has(c.id);

      let statSummary = '';
      if (c.type === 'character') {
        statSummary = `${c.attack}/${c.health}`;
      } else if (c.type === 'building') {
        const parts = [];
        if ((c.energyProvided ?? 0) > 0) parts.push(`+${c.energyProvided}E`);
        if (c.durability !== null && c.durability !== undefined && c.durability !== '') parts.push(`[${c.durability}]`);
        statSummary = parts.join(' ');
      }

      row.innerHTML = `
        <input type="checkbox" class="lib-row-check" ${isChecked ? 'checked' : ''} aria-label="Select card">
        <div class="lib-cost-orb" style="background:${orbColor}">${orbText}</div>
        <div class="lib-meta">
          <div class="lib-name">${escapeHtml(c.name || `Untitled ${TYPE_LABELS[c.type]}`)}</div>
          <div class="lib-sub">${isToken ? 'TOKEN • ' : ''}${TYPE_LABELS[c.type]}${c.subtype ? ' — ' + escapeHtml(c.subtype.trim().replace(/\s*-\s*/g, ' • ')) : ''}${!isHero ? ` • ${c.apCost ?? 1} AP` : ''}</div>
        </div>
        <div class="lib-badges">
          ${isToken ? '<span class="lib-token-badge">TOKEN</span>' : ''}
          ${statSummary ? `<span>${escapeHtml(statSummary)}</span>` : ''}
          ${!isToken ? `<span>${escapeHtml(pipStr)}</span>` : ''}
        </div>
        <button type="button" class="lib-quick-del" title="Delete card" aria-label="Delete card">&times;</button>
      `;

      const cb = row.querySelector('.lib-row-check');
      cb.addEventListener('click', e => {
        e.stopPropagation();
        if (cb.checked) state.selectedIds.add(c.id);
        else state.selectedIds.delete(c.id);
        renderLibrary();
      });

      const delBtn = row.querySelector('.lib-quick-del');
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        deleteCardsByIds(new Set([c.id]), 'Card deleted');
      });

      row.addEventListener('click', () => {
        state.currentCard = structuredClone(c);
        syncFormFromCurrent();
        renderLivePreview();
        renderLibrary();
      });
      dom.libList.appendChild(row);
    });
  }

  // Render Set Sheet & Analytics Matrix View
  function renderSheetAndMatrix() {
    if (state.activeTab !== 'sheet') return;

    // 1. Faction x Type Matrix
    const factionKeys = ['R', 'H', 'D', 'T', 'W', 'N'];
    let tableHtml = `
      <thead>
        <tr>
          <th>Faction</th>
          <th>Characters</th>
          <th>Buildings</th>
          <th>Spells</th>
          <th>2-Pip (XX)</th>
          <th>Hero Act/Pas</th>
          <th>Tokens</th>
          <th>Collectible Total</th>
        </tr>
      </thead>
      <tbody>
    `;

    factionKeys.forEach(fKey => {
      const fCards = state.cards.filter(c => c.faction === fKey);
      const collectible = fCards.filter(c => c.tier !== 'token' && c.type !== 'hero_active' && c.type !== 'hero_passive');
      const chars = collectible.filter(c => c.type === 'character').length;
      const bldgs = collectible.filter(c => c.type === 'building').length;
      const spells = collectible.filter(c => c.type === 'spell').length;
      const twoPips = collectible.filter(c => c.pips === 2).length;
      const heroes = fCards.filter(c => c.type === 'hero_active' || c.type === 'hero_passive').length;
      const tokens = fCards.filter(c => c.tier === 'token').length;

      tableHtml += `
        <tr>
          <td><span class="faction-swatch swatch-${fKey}" style="margin-right:7px; vertical-align:middle;">${fKey}</span>${FACTIONS[fKey].name}</td>
          <td>${chars}</td>
          <td>${bldgs}</td>
          <td>${spells}</td>
          <td>${fKey === 'N' ? '—' : twoPips}</td>
          <td>${fKey === 'N' ? '—' : heroes}</td>
          <td>${tokens}</td>
          <td><strong>${collectible.length}</strong></td>
        </tr>
      `;
    });
    tableHtml += '</tbody>';
    dom.matrixTable.innerHTML = tableHtml;

    // 2. Energy Curve Histogram (0 to 7+)
    const buckets = [0, 1, 2, 3, 4, 5, 6, 7];
    const counts = buckets.map(b => {
      return state.cards.filter(c => {
        if (c.tier === 'token' || c.type === 'hero_active' || c.type === 'hero_passive') return false;
        const req = Number(c.energyReq ?? 0);
        return b === 7 ? req >= 7 : req === b;
      }).length;
    });
    const maxCount = Math.max(1, ...counts);
    dom.curveBars.innerHTML = buckets.map((b, idx) => {
      const cnt = counts[idx];
      const pct = Math.round((cnt / maxCount) * 78);
      return `
        <div class="curve-col">
          <span class="curve-count">${cnt}</span>
          <div class="curve-bar-fill" style="height:${cnt === 0 ? 3 : Math.max(8, pct)}px; opacity:${cnt === 0 ? 0.2 : 1};"></div>
          <span class="curve-lbl">${b === 7 ? '7+' : b}</span>
        </div>
      `;
    }).join('');

    // 3. Visual Card Sheet Grid
    dom.cardSheetGrid.innerHTML = '';
    const sheetCards = state.cards.filter(c =>
      state.sheetFilterFaction === 'ALL' || c.faction === state.sheetFilterFaction
    );

    if (sheetCards.length === 0) {
      dom.cardSheetGrid.innerHTML = '<div class="lib-empty" style="grid-column:1/-1;">No saved cards in this view yet.</div>';
      return;
    }

    sheetCards.forEach(c => {
      const slot = document.createElement('div');
      slot.className = 'sheet-card-slot';
      const cardNode = createStandaloneCardElement(c);
      slot.appendChild(cardNode);
      slot.addEventListener('click', () => {
        state.currentCard = structuredClone(c);
        switchWorkspaceTab('studio');
        syncFormFromCurrent();
        renderLivePreview();
        renderLibrary();
      });
      dom.cardSheetGrid.appendChild(slot);
      fitCardRibbonTitle(cardNode);
      fitCardRulesText(cardNode, c);
    });
  }

  // Persistence: LocalStorage + Automatic /storybook/cards.json Sync Bridge
  function buildSavePayload() {
    return {
      version: 1,
      game: 'Storybook Card Game',
      updatedAt: new Date().toISOString(),
      frameAssets: state.frameAssets,
      eliteAssets: state.eliteAssets,
      crestAssets: DEFAULT_ELITE_CROWNS,
      cards: state.cards
    };
  }

  function updateSyncPill(mode, detail) {
    if (!dom.syncStatusBtn) return;
    dom.syncStatusBtn.classList.remove('is-synced', 'is-local-only');
    if (mode === 'synced') {
      dom.syncStatusBtn.classList.add('is-synced');
      dom.syncStatusBtn.textContent = detail || '● Synced to cards.json';
      dom.syncStatusBtn.title = 'Automatically writing changes straight to /storybook/cards.json (click to force sync)';
    } else {
      dom.syncStatusBtn.classList.add('is-local-only');
      dom.syncStatusBtn.textContent = detail || '○ Browser Storage (Link cards.json)';
      dom.syncStatusBtn.title = 'Click to link cards.json for direct saving';
    }
  }

  async function syncPayloadToDisk(payload) {
    // 1. Try local Python sync bridge first (zero prompts, works from file:// and localhost)
    try {
      const res = await fetch(SYNC_BRIDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        bridgeConnected = true;
        updateSyncPill('synced', '● Synced to cards.json');
        return true;
      }
    } catch (_) {
      bridgeConnected = false;
    }

    // 2. Fallback: Direct File System Access API handle if user linked one
    if (linkedFileHandle) {
      try {
        const writable = await linkedFileHandle.createWritable();
        await writable.write(JSON.stringify(payload, null, 2) + '\n');
        await writable.close();
        updateSyncPill('synced', '● Linked to cards.json');
        return true;
      } catch (_) {
        linkedFileHandle = null;
      }
    }

    updateSyncPill('local');
    return false;
  }

  function persistState() {
    const payload = buildSavePayload();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('Could not persist to localStorage:', err);
    }
    syncPayloadToDisk(payload);
  }

  async function loadInitialData() {
    let loadedLocal = false;
    let localUpdatedAt = '';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.cards)) {
          state.cards = parsed.cards;
          localUpdatedAt = parsed.updatedAt || '';
          if (parsed.frameAssets) {
            state.frameAssets = { ...state.frameAssets, ...parsed.frameAssets };
          }
          if (parsed.eliteAssets) {
            state.eliteAssets = { ...state.eliteAssets, ...parsed.eliteAssets };
          }
          loadedLocal = true;
        }
      }
    } catch (e) {
      console.warn('Failed reading localStorage:', e);
    }

    // Check live /storybook/cards.json via Sync Bridge (works on file:// too!) or relative ./cards.json
    let diskData = null;
    try {
      const bridgeRes = await fetch(SYNC_BRIDGE_URL, { cache: 'no-store' });
      if (bridgeRes.ok) {
        bridgeConnected = true;
        diskData = await bridgeRes.json();
      }
    } catch (_) {
      bridgeConnected = false;
    }

    if (!diskData) {
      try {
        const res = await fetch('./cards.json', { cache: 'no-store' });
        if (res.ok) {
          diskData = await res.json();
        }
      } catch (_) {
        // Expected on file:// when bridge isn't running
      }
    }

    const diskCards = (diskData && Array.isArray(diskData.cards)) ? diskData.cards : [];
    const diskUpdatedAt = (diskData && diskData.updatedAt) ? diskData.updatedAt : '';

    if (diskCards.length > 0 && (!loadedLocal || state.cards.length === 0 || (diskUpdatedAt && diskUpdatedAt > localUpdatedAt))) {
      // Populate or refresh browser storage when /storybook/cards.json has newer updates
      state.cards = diskCards;
      if (diskData.frameAssets) state.frameAssets = { ...state.frameAssets, ...diskData.frameAssets };
      if (diskData.eliteAssets) state.eliteAssets = { ...state.eliteAssets, ...diskData.eliteAssets };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...buildSavePayload(),
          updatedAt: diskUpdatedAt || new Date().toISOString()
        }));
      } catch (_) {}
    } else if (bridgeConnected && state.cards.length > 0 && (diskCards.length === 0 || localUpdatedAt >= diskUpdatedAt)) {
      // Browser has newer/existing cards that aren't in cards.json yet -> flush straight to /storybook/cards.json!
      await syncPayloadToDisk(buildSavePayload());
    }

    // Load the most recently updated card into the stage on boot
    if (state.cards.length > 0 && !state.currentCard.id) {
      const sortedByRecent = [...state.cards].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      state.currentCard = structuredClone(sortedByRecent[0]);
    }

    updateSyncPill(bridgeConnected ? 'synced' : 'local');
    syncFormFromCurrent();
    renderLivePreview();
    renderLibrary();
  }

  // Save / Duplicate / Delete Operations
  function saveCurrentCard() {
    const c = normalizeCardConstraints(state.currentCard);
    c.updatedAt = new Date().toISOString();

    if (!c.id) {
      c.id = generateId();
      state.cards.push(structuredClone(c));
      showToast('Card added to Set Library');
    } else {
      const idx = state.cards.findIndex(item => item.id === c.id);
      if (idx >= 0) {
        state.cards[idx] = structuredClone(c);
        showToast('Card updated');
      } else {
        state.cards.push(structuredClone(c));
        showToast('Card added to Set Library');
      }
    }

    persistState();
    syncFormFromCurrent();
    renderLibrary();
    renderSheetAndMatrix();
  }

  function switchWorkspaceTab(tab) {
    state.activeTab = tab;
    dom.tabStudioBtn.classList.toggle('active', tab === 'studio');
    dom.tabSheetBtn.classList.toggle('active', tab === 'sheet');
    dom.studioWorkspace.classList.toggle('hidden', tab !== 'studio');
    dom.sheetWorkspace.classList.toggle('hidden', tab !== 'sheet');
    if (tab === 'sheet') {
      renderSheetAndMatrix();
    }
  }

  // Event Wiring
  function bindEvents() {
    // Workspace Tabs
    dom.tabStudioBtn.addEventListener('click', () => switchWorkspaceTab('studio'));

    // Direct cards.json Sync Status / File-Picker Link Button
    if (dom.syncStatusBtn) {
      dom.syncStatusBtn.addEventListener('click', async () => {
        const ok = await syncPayloadToDisk(buildSavePayload());
        if (ok) {
          showToast('Synced directly to /storybook/cards.json');
          return;
        }
        if (typeof window.showSaveFilePicker === 'function') {
          try {
            linkedFileHandle = await window.showSaveFilePicker({
              suggestedName: 'cards.json',
              types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }]
            });
            await syncPayloadToDisk(buildSavePayload());
            showToast('Linked cards.json — future saves write directly!');
            return;
          } catch (_) {
            return;
          }
        }
        showToast('Use Export JSON or start the local sync bridge');
      });
    }
    dom.tabSheetBtn.addEventListener('click', () => switchWorkspaceTab('sheet'));

    // Preview Mode Toggle
    dom.previewCardBtn.addEventListener('click', () => {
      state.previewMode = 'card';
      renderLivePreview();
    });
    dom.previewBoardBtn.addEventListener('click', () => {
      state.previewMode = 'board';
      renderLivePreview();
    });

    // Type Selector
    dom.typeSelector.addEventListener('click', e => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      const nextType = btn.dataset.type;
      const curRules = (state.currentCard.rulesText || '').trim();
      if (nextType === 'hero_active' && !curRules) {
        state.currentCard.rulesText = '{1AP}: ';
      } else if (nextType !== 'hero_active' && curRules === '{1AP}:') {
        state.currentCard.rulesText = '';
      }
      state.currentCard.type = nextType;
      syncFormFromCurrent();
      renderLivePreview();
    });

    // Faction Selector
    dom.factionSelector.addEventListener('click', e => {
      const btn = e.target.closest('[data-faction]');
      if (!btn || btn.disabled) return;
      state.currentCard.faction = btn.dataset.faction;
      if (state.currentCard.faction !== 'N' && state.currentCard.pips === 0) {
        state.currentCard.pips = 1;
      }
      syncFormFromCurrent();
      renderLivePreview();
    });

    // Loyalty Pips Selector
    dom.pipsSelector.addEventListener('click', e => {
      const btn = e.target.closest('[data-pips]');
      if (!btn || btn.disabled) return;
      state.currentCard.pips = Number(btn.dataset.pips);
      syncFormFromCurrent();
      renderLivePreview();
    });

    // Tier Selector
    dom.tierSelector.addEventListener('click', e => {
      const btn = e.target.closest('[data-tier]');
      if (!btn) return;
      state.currentCard.tier = btn.dataset.tier;
      syncFormFromCurrent();
      renderLivePreview();
    });

    // Live Form Inputs
    const bindField = (el, prop, parser = v => v) => {
      el.addEventListener('input', () => {
        state.currentCard[prop] = parser(el.value);
        renderLivePreview();
      });
    };

    const toInt = (val, fallback = 0) => {
      const n = parseInt(val, 10);
      return Number.isNaN(n) ? fallback : n;
    };

    bindField(dom.inputEnergyReq, 'energyReq', v => toInt(v, 0));
    bindField(dom.inputApCost, 'apCost', v => toInt(v, 1));
    bindField(dom.inputAttack, 'attack', v => toInt(v, 0));
    bindField(dom.inputHealth, 'health', v => toInt(v, 1));
    bindField(dom.inputEnergyOut, 'energyProvided', v => toInt(v, 0));
    bindField(dom.inputDurability, 'durability', v => (v.trim() === '' ? null : toInt(v, 1)));
    bindField(dom.inputName, 'name');
    bindField(dom.inputSubtype, 'subtype');
    bindField(dom.inputRules, 'rulesText');
    bindField(dom.inputFlavor, 'flavorText');
    bindField(dom.inputArtUrl, 'artUrl');
    bindField(dom.inputArtPrompt, 'artPrompt');
    bindField(dom.inputRelated, 'relatedCards');

    dom.inputArtPosY.addEventListener('input', () => {
      const val = toInt(dom.inputArtPosY.value, 50);
      state.currentCard.artPosY = val;
      dom.artPosYVal.textContent = `${val}%`;
      renderLivePreview();
    });

    // Inline Markup Insertion Chips
    document.querySelectorAll('.markup-bar .chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ta = dom.inputRules;
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? ta.value.length;
        const wrap = btn.dataset.insertWrap;
        const token = btn.dataset.insert;

        if (wrap) {
          const selected = ta.value.slice(start, end) || 'Keyword';
          const replacement = `${wrap}${selected}${wrap}`;
          ta.setRangeText(replacement, start, end, 'select');
        } else if (token) {
          ta.setRangeText(token, start, end, 'end');
          const selOff = btn.dataset.selectOffset;
          if (selOff) {
            const [sOff, eOff] = selOff.split(',').map(Number);
            ta.setSelectionRange(start + sOff, start + eOff);
          }
        }
        ta.focus();
        state.currentCard.rulesText = ta.value;
        renderLivePreview();
      });
    });

    // Local Image File Preview Loader
    dom.uploadArtBtn.addEventListener('click', () => dom.uploadArtInput.click());
    dom.uploadArtInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        state.currentCard.artUrl = String(ev.target?.result || '');
        dom.inputArtUrl.value = state.currentCard.artUrl;
        renderLivePreview();
      };
      reader.readAsDataURL(file);
      dom.uploadArtInput.value = '';
    });

    // Copy Prompt & Copy Card JSON Helpers
    dom.copyPromptBtn.addEventListener('click', async () => {
      const txt = dom.inputArtPrompt.value.trim();
      if (!txt) {
        showToast('Art prompt is empty');
        return;
      }
      await navigator.clipboard.writeText(txt);
      showToast('Copied Gemini prompt');
    });

    dom.copyCardJsonBtn.addEventListener('click', async () => {
      const snapshot = normalizeCardConstraints({ ...state.currentCard });
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      showToast('Copied single card JSON');
    });

    // Save / New / Duplicate / Delete
    dom.form.addEventListener('submit', e => {
      e.preventDefault();
      saveCurrentCard();
    });

    dom.newCardBtn.addEventListener('click', () => {
      state.currentCard = createBlankCard({
        faction: state.currentCard.faction,
        type: state.currentCard.type
      });
      syncFormFromCurrent();
      renderLivePreview();
      renderLibrary();
      dom.inputName.focus();
    });

    dom.duplicateCardBtn.addEventListener('click', () => {
      const clone = structuredClone(state.currentCard);
      clone.id = generateId();
      clone.updatedAt = new Date().toISOString();
      state.cards.push(clone);
      state.currentCard = structuredClone(clone);
      persistState();
      syncFormFromCurrent();
      renderLivePreview();
      renderLibrary();
      showToast('Duplicated card');
    });

    dom.deleteCardBtn.addEventListener('click', () => {
      const id = state.currentCard.id;
      if (!id) return;
      deleteCardsByIds(new Set([id]), 'Card deleted');
    });

    // Bulk Select, Bulk Delete & Clear All in Set Library
    dom.bulkSelectAllCb.addEventListener('change', () => {
      const shownIds = JSON.parse(dom.bulkBar.dataset.shownIds || '[]');
      if (dom.bulkSelectAllCb.checked) {
        shownIds.forEach(id => state.selectedIds.add(id));
      } else {
        shownIds.forEach(id => state.selectedIds.delete(id));
      }
      renderLibrary();
    });

    dom.bulkDeleteBtn.addEventListener('click', () => {
      if (state.selectedIds.size === 0) return;
      deleteCardsByIds(new Set(state.selectedIds));
    });

    dom.clearLibBtn.addEventListener('click', () => {
      if (state.cards.length === 0) return;
      if (!window.confirm(`Clear all ${state.cards.length} cards from your Set Library?`)) return;
      deleteCardsByIds(new Set(state.cards.map(c => c.id)), `Cleared all ${state.cards.length} cards`);
    });

    // Keyboard Shortcuts (Cmd/Ctrl+S to save, Cmd/Ctrl+B in rules textarea)
    window.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveCurrentCard();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && document.activeElement === dom.inputRules) {
        e.preventDefault();
        const ta = dom.inputRules;
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;
        const selected = ta.value.slice(start, end);
        ta.setRangeText(`**${selected}**`, start, end, 'end');
        state.currentCard.rulesText = ta.value;
        renderLivePreview();
      }
    });

    // Library Search & Filter Pills
    dom.libSearchInput.addEventListener('input', () => {
      state.libSearch = dom.libSearchInput.value;
      renderLibrary();
    });

    dom.libFactionFilters.addEventListener('click', e => {
      const pill = e.target.closest('[data-filter-faction]');
      if (!pill) return;
      state.libFilterFaction = pill.dataset.filterFaction;
      dom.libFactionFilters.querySelectorAll('.filter-pill').forEach(p =>
        p.classList.toggle('active', p === pill)
      );
      renderLibrary();
    });

    dom.libTypeFilters.addEventListener('click', e => {
      const pill = e.target.closest('[data-filter-type]');
      if (!pill) return;
      state.libFilterType = pill.dataset.filterType;
      dom.libTypeFilters.querySelectorAll('.filter-pill').forEach(p =>
        p.classList.toggle('active', p === pill)
      );
      renderLibrary();
    });

    // Sheet Faction Filter Pills
    dom.sheetFactionFilters.addEventListener('click', e => {
      const pill = e.target.closest('[data-sheet-faction]');
      if (!pill) return;
      state.sheetFilterFaction = pill.dataset.sheetFaction;
      dom.sheetFactionFilters.querySelectorAll('.filter-pill').forEach(p =>
        p.classList.toggle('active', p === pill)
      );
      renderSheetAndMatrix();
    });

    // Export & Import JSON
    dom.exportBtn.addEventListener('click', () => {
      const payload = {
        version: 1,
        game: 'Storybook Card Game',
        updatedAt: new Date().toISOString(),
        frameAssets: state.frameAssets,
        eliteAssets: state.eliteAssets,
        cards: state.cards
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cards.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Exported cards.json');
    });

    dom.importBtn.addEventListener('click', () => dom.importInput.click());
    dom.importInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const parsed = JSON.parse(String(ev.target?.result || '{}'));
          const incomingCards = Array.isArray(parsed) ? parsed : parsed.cards;
          if (!Array.isArray(incomingCards)) {
            throw new Error('Invalid JSON structure');
          }
          state.cards = incomingCards.map(raw => normalizeCardConstraints(createBlankCard({
            ...raw,
            id: raw.id || generateId()
          })));
          if (parsed.frameAssets && typeof parsed.frameAssets === 'object') {
            state.frameAssets = { ...state.frameAssets, ...parsed.frameAssets };
          }
          if (parsed.eliteAssets && typeof parsed.eliteAssets === 'object') {
            state.eliteAssets = { ...state.eliteAssets, ...parsed.eliteAssets };
          }
          if (state.cards.length > 0) {
            state.currentCard = structuredClone(state.cards[0]);
          }
          persistState();
          syncFormFromCurrent();
          renderLivePreview();
          renderLibrary();
          renderSheetAndMatrix();
          showToast(`Imported ${state.cards.length} cards`);
        } catch (err) {
          showToast('Import failed: invalid JSON file');
        }
      };
      reader.readAsText(file);
      dom.importInput.value = '';
    });

    // Frame Background Assets Modal
    const frameKeys = ['global', 'R', 'H', 'D', 'T', 'W', 'N'];
    dom.openFramesBtn.addEventListener('click', () => {
      frameKeys.forEach(k => {
        const inp = document.getElementById(`frame-asset-${k}`);
        if (inp) inp.value = state.frameAssets[k] || '';
      });
      dom.framesModal.classList.remove('hidden');
    });

    dom.closeFramesBtn.addEventListener('click', () => dom.framesModal.classList.add('hidden'));
    dom.framesModal.addEventListener('click', e => {
      if (e.target === dom.framesModal) dom.framesModal.classList.add('hidden');
    });

    dom.saveFramesBtn.addEventListener('click', () => {
      frameKeys.forEach(k => {
        const inp = document.getElementById(`frame-asset-${k}`);
        if (inp) state.frameAssets[k] = inp.value.trim();
      });
      persistState();
      renderLivePreview();
      renderSheetAndMatrix();
      dom.framesModal.classList.add('hidden');
      showToast('Frame background assets updated');
    });
  }

  // Boot
  bindEvents();
  loadInitialData();
})();
