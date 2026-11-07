/* ==========================================================================
   Storybook Card Game — Shared Card Loader, Deck Storage & Sculpted Renderer
   ========================================================================== */

window.StorybookGameData = (() => {
  'use strict';

  const STUDIO_STORAGE_KEY = 'storybook_card_studio_v1';
  const DECKS_STORAGE_KEY = 'storybook_saved_decks_v1';
  const SYNC_BRIDGE_URL = 'http://127.0.0.1:8787/api/cards';

  // Oak Windmill stays hidden from Deckbuilder & Wish while its design is tentative
  const HIDDEN_CARD_IDS = new Set(['card_mvrkzy6k_fq4hz']);

  const FACTIONS = {
    R: { code: 'R', name: 'Red Velvet Court', short: 'Court', color: 'hsl(347, 65%, 30%)' },
    H: { code: 'H', name: 'Havenhearth', short: 'Hearth', color: 'hsl(37, 78%, 37%)' },
    D: { code: 'D', name: 'Deepbriar', short: 'Briar', color: 'hsl(148, 47%, 26%)' },
    T: { code: 'T', name: 'Twilight Glade', short: 'Glade', color: 'hsl(246, 42%, 38%)' },
    W: { code: 'W', name: "Whimsy's Workshop", short: 'Workshop', color: 'hsl(332, 66%, 52%)' },
    N: { code: 'N', name: 'Neutral', short: 'Neutral', color: 'hsl(32, 13%, 38%)' }
  };

  const TYPE_LABELS = {
    character: 'Character',
    building: 'Building',
    spell: 'Spell',
    hero_active: 'Hero Active',
    hero_passive: 'Hero Passive'
  };

  const DEFAULT_FRAMES = {
    global: '',
    R: './assets/frame-R.jpg',
    H: './assets/frame-H.jpg',
    D: './assets/frame-D.jpg',
    T: '',
    W: '',
    N: ''
  };

  const DEFAULT_ELITE_CROWNS = {
    R: './assets/elite-R.png',
    H: './assets/elite-H.png',
    D: './assets/elite-D.png',
    T: '',
    W: '',
    N: ''
  };

  const DEFAULT_ELITE_SPELL_CROWNS = {
    R: './assets/elite-R-spell.png',
    H: './assets/elite-H-spell.png',
    D: './assets/elite-D-spell.png',
    T: '',
    W: '',
    N: ''
  };

  let svgUid = 1000;

  function escapeHtml(raw) {
    return String(raw ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getSubtypes(cardOrSubtype) {
    const raw = typeof cardOrSubtype === 'string'
      ? cardOrSubtype
      : (cardOrSubtype && cardOrSubtype.subtype) || '';
    if (!raw.trim()) return [];
    return raw
      .split(/[-•,/]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
  }

  function hasSubtype(cardOrObj, tag) {
    const target = String(tag || '').trim().toUpperCase();
    return getSubtypes(cardOrObj).includes(target);
  }

  function parseHeroApCost(cardDef) {
    if (!cardDef || cardDef.type !== 'hero_active') return 0;
    const m = String(cardDef.rulesText || '').match(/\{(\d+)AP\}\s*:/i);
    return m ? parseInt(m[1], 10) : (cardDef.apCost ?? 1);
  }

  function parseBuildingActivation(cardDef) {
    if (!cardDef || cardDef.type !== 'building') return null;
    const txt = String(cardDef.rulesText || '');
    // Activated abilities have {XAP}: (optionally preceded by {#E}) without {End of Turn}/{Start of Turn}
    if (/\{(end|start)\s+of\s+turn:?\}/i.test(txt)) return null;
    const apMatch = txt.match(/^(?:\{(\d+)E\}\s*)?\{(\d+)AP\}\s*:/i);
    if (!apMatch) return null;
    return {
      energyReq: apMatch[1] !== undefined ? parseInt(apMatch[1], 10) : 0,
      apCost: parseInt(apMatch[2], 10)
    };
  }

  // Format rules markup into inline keyword bubbles & sculpted AP/Energy gems
  function formatRulesMarkup(rawText, extraLines = [], highlightNums = null) {
    const SVGs = window.StorybookCardSVGs;
    const lines = [];
    if (rawText && rawText.trim()) {
      rawText.split(/\n+/).forEach(l => {
        if (l.trim()) lines.push({ text: l, isMod: false });
      });
    }
    if (Array.isArray(extraLines)) {
      extraLines.forEach(item => {
        if (!item) return;
        if (typeof item === 'string') {
          lines.push({ text: item, isMod: true, modKind: 'buff' });
        } else if (item.text) {
          lines.push({ text: item.text, isMod: true, modKind: item.kind || 'buff' });
        }
      });
    }
    if (lines.length === 0) return '';

    return lines.map(({ text, isMod, modKind }) => {
      let html = escapeHtml(text);

      // Optional live dynamic replacement (e.g., Stone Soup +X/+X or Poisoned preview)
      if (highlightNums && !isMod && typeof highlightNums.transformLine === 'function') {
        html = highlightNums.transformLine(html);
      }

      html = html.replace(/\(([^()]+)\)/g, '<em class="inline-paren">($1)</em>');
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

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

      html = html.replace(/\{(\d*)AP\}/gi, (_, numStr) => {
        const count = numStr === '' ? 1 : Math.min(6, Math.max(0, Number(numStr)));
        if (!SVGs) return `<span class="inline-ap">◆ ${count} AP</span>`;
        if (count === 0) {
          svgUid += 1;
          return `<span class="inline-ap-group" title="0 AP">${SVGs.apZeroCircle('g0_' + svgUid)}</span>`;
        }
        let gems = '';
        for (let i = 0; i < count; i++) {
          svgUid += 1;
          gems += SVGs.apDiamond('ga_' + svgUid);
        }
        return `<span class="inline-ap-group" title="${count} AP">${gems}</span>`;
      });

      html = html.replace(/\{([+-]?\d+|x|#)?E\}/gi, (_, rawVal) => {
        const val = rawVal ? String(rawVal).toUpperCase() : '';
        if (!SVGs) return `<span class="inline-energy">${val ? val + ' ' : ''}Energy</span>`;
        svgUid += 1;
        return `<span class="inline-energy-gem-wrap">${SVGs.energyGem(val, 'ge_' + svgUid, true)}</span>`;
      });

      html = html.replace(/\{([RHDTW])\}/g, (_, f) => {
        const bg = FACTIONS[f] ? FACTIONS[f].color : '#555';
        return `<span class="inline-pip" style="background:${bg}">${f}</span>`;
      });

      const cls = isMod ? ` class="card-mod-line mod-${escapeHtml(modKind)}"` : '';
      return `<p${cls}>${html}</p>`;
    }).join('');
  }

  // Merge localStorage Card Studio edits with /storybook/cards.json (latest-wins per card)
  async function loadCardDatabase() {
    let localParsed = null;
    let localCards = [];
    let localUpdatedAt = '';
    try {
      const saved = localStorage.getItem(STUDIO_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.cards)) {
          localParsed = parsed;
          localCards = parsed.cards;
          localUpdatedAt = parsed.updatedAt || '';
        }
      }
    } catch (_) {}

    let diskData = null;
    let sourceMode = 'json';
    try {
      const bridgeRes = await fetch(SYNC_BRIDGE_URL, { cache: 'no-store' });
      if (bridgeRes.ok) {
        diskData = await bridgeRes.json();
        sourceMode = 'bridge';
      }
    } catch (_) {}

    if (!diskData) {
      try {
        const res = await fetch('./cards.json', { cache: 'no-store' });
        if (res.ok) {
          diskData = await res.json();
          sourceMode = 'json';
        }
      } catch (_) {
        sourceMode = 'local';
      }
    }

    const diskCards = (diskData && Array.isArray(diskData.cards)) ? diskData.cards : [];
    const maxStamp = arr => arr.reduce((m, c) => (c && c.updatedAt && c.updatedAt > m ? c.updatedAt : m), '');
    const diskStamp = [(diskData && diskData.updatedAt) || '', maxStamp(diskCards)].sort().pop() || '';
    const localStamp = [localUpdatedAt, maxStamp(localCards)].sort().pop() || '';

    let mergedCards = [];
    if (diskCards.length > 0 && localCards.length > 0) {
      const map = new Map();
      diskCards.forEach(c => { if (c && c.id) map.set(c.id, c); });
      localCards.forEach(lc => {
        if (!lc || !lc.id) return;
        const dc = map.get(lc.id);
        if (!dc || String(lc.updatedAt || '') > String(dc.updatedAt || '')) {
          map.set(lc.id, lc);
          sourceMode = 'studio+json';
        }
      });
      mergedCards = Array.from(map.values());
    } else if (diskCards.length > 0) {
      mergedCards = diskCards;
    } else {
      mergedCards = localCards;
    }

    const frameAssets = {
      ...DEFAULT_FRAMES,
      ...(localParsed && localParsed.frameAssets ? localParsed.frameAssets : {}),
      ...(diskStamp >= localStamp && diskData && diskData.frameAssets ? diskData.frameAssets : {})
    };
    const eliteAssets = {
      ...DEFAULT_ELITE_CROWNS,
      ...(localParsed && localParsed.eliteAssets ? localParsed.eliteAssets : {}),
      ...(diskStamp >= localStamp && diskData && diskData.eliteAssets ? diskData.eliteAssets : {})
    };

    const cardMap = new Map();
    const byName = new Map();
    mergedCards.forEach(c => {
      cardMap.set(c.id, c);
      if (c.name) byName.set(c.name.trim().toLowerCase(), c);
    });

    const activeCards = mergedCards.filter(c => !HIDDEN_CARD_IDS.has(c.id));
    const heroes = activeCards.filter(c => c.type === 'hero_active' || c.type === 'hero_passive');
    const collectibles = activeCards.filter(c =>
      c.tier !== 'token' && c.type !== 'hero_active' && c.type !== 'hero_passive'
    );
    const tokens = activeCards.filter(c => c.tier === 'token');

    return {
      allCards: mergedCards,
      activeCards,
      heroes,
      collectibles,
      tokens,
      cardMap,
      byName,
      frameAssets,
      eliteAssets,
      sourceMode
    };
  }

  // Create a full sculpted .tcg-card DOM element from a card definition + optional live instance state
  function renderFullCard(cardDef, db, live = {}) {
    const SVGs = window.StorybookCardSVGs;
    svgUid += 1;
    const uid = 'fc_' + svgUid;

    const c = cardDef;
    const isHero = c.type === 'hero_active' || c.type === 'hero_passive';
    const isElite = !isHero && c.tier === 'elite';

    const effEnergyReq = live.energyReq !== undefined ? live.energyReq : (c.energyReq ?? 0);
    const baseAp = isHero ? parseHeroApCost(c) : (c.apCost ?? 1);
    const effAp = live.apCost !== undefined ? live.apCost : baseAp;
    const baseAtk = c.attack ?? 0;
    const baseHp = c.health ?? 1;
    const effAtk = live.attack !== undefined ? live.attack : baseAtk;
    const effHp = live.health !== undefined ? live.health : baseHp;
    const maxHp = live.maxHealth !== undefined ? live.maxHealth : effHp;
    const effDur = live.durability !== undefined ? live.durability : c.durability;

    const el = document.createElement('div');
    el.className = 'tcg-card';
    if (live.poisoned) el.classList.add('is-poisoned-card');
    if (live.fated) el.classList.add('is-fated-card');
    el.dataset.faction = c.faction;
    el.dataset.cardType = c.type;
    el.dataset.cardTier = isHero ? 'standard' : (c.tier || 'standard');

    const frameAssets = (db && db.frameAssets) || DEFAULT_FRAMES;
    const eliteAssets = (db && db.eliteAssets) || DEFAULT_ELITE_CROWNS;
    const bgAssetUrl = frameAssets[c.faction] || frameAssets.global || DEFAULT_FRAMES[c.faction] || '';

    const trimmedName = (c.name || '').trim();
    const displayTitle = trimmedName || `Untitled ${TYPE_LABELS[c.type]}`;

    // Build Elite Crown HTML
    let eliteHtml = '';
    if (isElite) {
      let crownUrl = eliteAssets[c.faction] || DEFAULT_ELITE_CROWNS[c.faction] || '';
      if (c.type === 'spell' && DEFAULT_ELITE_SPELL_CROWNS[c.faction]) {
        if (!crownUrl || crownUrl === DEFAULT_ELITE_CROWNS[c.faction]) {
          crownUrl = DEFAULT_ELITE_SPELL_CROWNS[c.faction];
        }
      }
      const inner = crownUrl
        ? `<img src="${escapeHtml(crownUrl)}" class="elite-crest-img" alt="">`
        : SVGs.eliteCrest(uid, c.type === 'spell');
      eliteHtml = `<div class="elite-crest-slot">${inner}</div>`;
    }

    // Top-left costs
    let costHtml = '';
    if (!isHero) {
      const apCount = Math.max(0, Math.min(4, Number(effAp)));
      let apInner = '';
      if (apCount === 0) {
        apInner = SVGs.apZeroCircle(uid + '_ap0');
      } else {
        for (let i = 0; i < apCount; i++) {
          apInner += SVGs.apDiamond(`${uid}_ap${i}`);
        }
      }
      const apStateCls = effAp < baseAp ? ' is-cost-reduced' : '';
      costHtml = `
        <div title="Requires ${effEnergyReq} Energy">${SVGs.energyGem(effEnergyReq, uid + '_e')}</div>
        <div class="ap-cluster${apStateCls}" title="Costs ${apCount} AP">${apInner}</div>
      `;
    } else if (c.type === 'hero_active') {
      const apCount = Math.max(0, Math.min(3, Number(effAp)));
      const apInner = apCount === 0
        ? SVGs.apZeroCircle(uid + '_hap0')
        : Array.from({ length: apCount }, (_, i) => SVGs.apDiamond(`${uid}_hap${i}`)).join('');
      costHtml = `<div class="ap-cluster${effAp < baseAp ? ' is-cost-reduced' : ''}">${apInner}</div>`;
    }

    // Top-right faction loyalty
    let loyaltyHtml = '';
    if (c.faction === 'N') {
      loyaltyHtml = '<span class="neutral-badge">Neutral</span>';
    } else {
      const pipCount = isHero ? 1 : (c.pips || 1);
      for (let i = 0; i < pipCount; i++) {
        loyaltyHtml += `<span class="loyalty-pip-slot" title="${escapeHtml(FACTIONS[c.faction]?.name || '')}">${SVGs.factionPip(c.faction, `${uid}_p${i}`)}</span>`;
      }
    }

    // Art HTML
    const artHtml = (c.artUrl && c.artUrl.trim())
      ? `<img class="card-art-img" src="${escapeHtml(c.artUrl.trim())}" alt="${escapeHtml(displayTitle)}" style="object-position: 50% ${c.artPosY ?? 50}%;">`
      : `<div class="art-wireframe-label"><span class="art-wireframe-glyph">${escapeHtml(TYPE_LABELS[c.type])}</span><span class="art-wireframe-sub">${escapeHtml(FACTIONS[c.faction]?.name || 'Neutral')}</span></div>`;

    // Extra dynamic modifier lines (Poisoned, Fate, Woodland Blessing, Royal Favour, etc.)
    const extraLines = Array.isArray(live.extraLines) ? [...live.extraLines] : [];
    const highlightNums = live.stoneSoupBonus > 0 && c.id === 'card_mvua3z8u_lvooq'
      ? {
          transformLine: line => line.replace(
            'Give a Character +1/+1 this turn.',
            `Give a Character <strong class="dyn-stat-inline">+${1 + live.stoneSoupBonus}/+${1 + live.stoneSoupBonus}</strong> this turn.`
          )
        }
      : null;

    const rulesHtml = formatRulesMarkup(c.rulesText || '', extraLines, highlightNums);
    const watermarkHtml = c.faction !== 'N' ? SVGs.factionWatermark(c.faction) : '';

    // Subtype plaque
    const sub = (!isHero && c.subtype) ? c.subtype.trim() : '';
    const subHtml = sub
      ? `<div class="card-bottom-plaque"><span class="type-line-text">${escapeHtml(sub).replace(/\s*-\s*/g, '<span class="subtype-dot" aria-hidden="true">&bull;</span>')}</span></div>`
      : '';
    el.dataset.hasSubtype = sub ? 'true' : 'false';

    // Bottom stat badges
    let leftStatHtml = '';
    let rightStatHtml = '';
    if (c.type === 'character') {
      const atkCls = effAtk > baseAtk ? ' stat-is-buffed' : effAtk < baseAtk ? ' stat-is-debuffed' : '';
      const hpCls = effHp < maxHp
        ? ' stat-is-damaged'
        : maxHp > baseHp
          ? ' stat-is-buffed'
          : maxHp < baseHp
            ? ' stat-is-debuffed'
            : '';
      leftStatHtml = `<div class="stat-medallion-slot stat-slot-left${atkCls}">${SVGs.attackBadge(effAtk, uid + '_atk')}</div>`;
      rightStatHtml = `<div class="stat-medallion-slot stat-slot-right${hpCls}">${SVGs.healthBadge(effHp, uid + '_hp')}</div>`;
    } else if (c.type === 'building') {
      const eOut = Number(c.energyProvided ?? 0);
      if (eOut > 0) {
        leftStatHtml = `<div class="stat-medallion-slot stat-slot-left">${SVGs.buildingEnergyBadge(eOut, uid + '_be')}</div>`;
      }
      if (effDur !== null && effDur !== undefined && String(effDur).trim() !== '') {
        const durCls = Number(effDur) === 0 ? ' stat-is-spent' : '';
        rightStatHtml = `<div class="stat-medallion-slot stat-slot-right${durCls}">${SVGs.buildingCounterBadge(effDur, uid + '_bd')}</div>`;
      }
    }
    el.dataset.hasStats = (leftStatHtml || rightStatHtml) ? 'true' : 'false';

    // State tags atop art frame (Poisoned / Fated)
    let statePills = '';
    if (live.poisoned || live.fated) {
      statePills = `<div class="card-live-tags">
        ${live.poisoned ? '<span class="inline-kw inline-poisoned">Poisoned</span>' : ''}
        ${live.fated ? '<span class="inline-kw inline-fate">Fate</span>' : ''}
      </div>`;
    }

    el.innerHTML = `
      <div class="tcg-card-body">
        <div class="tcg-card-bg-asset" style="background-image:${bgAssetUrl ? `url(&quot;${encodeURI(bgAssetUrl)}&quot;)` : 'none'}"></div>
        <div class="tcg-card-vignette"></div>
        <div class="tcg-card-content">
          <div class="card-art-bezel-wrap">
            <div class="card-art-frame">${artHtml}${statePills}</div>
          </div>
          ${isHero ? '' : `<div class="card-ribbon-slot">${SVGs.nameRibbon(displayTitle, !trimmedName, uid + '_rib', isElite)}</div>`}
          <div class="card-parchment-well">
            <div class="parchment-watermark">${watermarkHtml}</div>
            ${isHero ? `<div class="hero-plaque-head"><span class="hero-plaque-kicker">${c.type === 'hero_active' ? 'Hero Active' : 'Hero Passive'}</span><div class="hero-plaque-title">${escapeHtml(displayTitle)}</div></div>` : ''}
            <div class="card-rules-content">${rulesHtml}</div>
            ${c.flavorText && c.flavorText.trim() ? `<div class="card-flavor-content">${escapeHtml(c.flavorText.trim())}</div>` : ''}
          </div>
          ${subHtml}
        </div>
      </div>
      ${eliteHtml}
      <div class="card-top-hardware">
        <div class="cost-cluster">${costHtml}</div>
        <div class="loyalty-cluster">${loyaltyHtml}</div>
      </div>
      ${leftStatHtml}
      ${rightStatHtml}
    `;

    // Fit title & rules text heuristics (works both attached & offscreen before paint)
    fitCardHeuristics(el, c, extraLines);
    return el;
  }

  function fitCardHeuristics(cardEl, c, extraLines = []) {
    const textEl = cardEl.querySelector('.svg-ribbon-title');
    if (textEl) {
      const len = (c.name || '').length;
      if (len > 26) textEl.setAttribute('font-size', '12.6');
      else if (len > 22) textEl.setAttribute('font-size', '14.0');
      else if (len > 18) textEl.setAttribute('font-size', '15.2');
    }
    const rulesEl = cardEl.querySelector('.card-rules-content');
    if (!rulesEl) return;
    const isHero = c.type === 'hero_active' || c.type === 'hero_passive';
    const extraTxt = extraLines.map(x => (typeof x === 'string' ? x : x.text || '')).join(' ');
    const combined = ((c.rulesText || '') + ' ' + extraTxt)
      .replace(/\{[^}]+\}/g, '12345')
      .replace(/\*\*|\*/g, '');
    const len = combined.length + ((c.flavorText || '').length * 0.9) + (extraLines.length * 26);
    if (isHero) {
      if (len > 240) rulesEl.classList.add('size-sm');
      else if (len > 165) rulesEl.classList.add('size-md');
    } else {
      if (len > 195) rulesEl.classList.add('size-xs');
      else if (len > 145) rulesEl.classList.add('size-sm');
      else if (len > 105) rulesEl.classList.add('size-md');
    }
  }

  function refineAttachedCardFit(cardEl) {
    if (!cardEl) return;
    const textEl = cardEl.querySelector('.svg-ribbon-title');
    if (textEl && typeof textEl.getComputedTextLength === 'function') {
      try {
        textEl.setAttribute('font-size', '16.5');
        const measured = textEl.getComputedTextLength();
        if (measured > 256) {
          textEl.setAttribute('font-size', String(Math.max(11.5, +(16.5 * (256 / measured)).toFixed(2))));
        }
      } catch (_) {}
    }
    const wellEl = cardEl.querySelector('.card-parchment-well');
    const rulesEl = cardEl.querySelector('.card-rules-content');
    if (wellEl && rulesEl && wellEl.clientHeight > 0) {
      const cs = window.getComputedStyle(wellEl);
      const avail = wellEl.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      const sizes = ['', 'size-md', 'size-sm', 'size-xs'];
      for (const sz of sizes) {
        rulesEl.classList.remove('size-md', 'size-sm', 'size-xs');
        if (sz) rulesEl.classList.add(sz);
        if (rulesEl.scrollHeight <= avail + 2) return;
      }
    }
  }

  // Saved Custom Decks (localStorage)
  function loadSavedDecks() {
    try {
      const raw = localStorage.getItem(DECKS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveDecks(decks) {
    try {
      localStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
    } catch (e) {
      console.warn('Could not save decks:', e);
    }
  }

  // deck shape: { id, name, heroIds: [id1, id2], cards: { [cardId]: count }, updatedAt }
  function countDeckCards(deck) {
    if (!deck || !deck.cards) return 0;
    return Object.values(deck.cards).reduce((sum, n) => sum + (Number(n) || 0), 0);
  }

  function isCardLegalForHeroes(cardDef, heroDefs) {
    if (!cardDef || HIDDEN_CARD_IDS.has(cardDef.id)) return false;
    if (cardDef.tier === 'token' || cardDef.type === 'hero_active' || cardDef.type === 'hero_passive') return false;
    if (cardDef.faction === 'N') return true;
    if (!heroDefs || heroDefs.length === 0) return true;
    const allowedFactions = new Set(heroDefs.map(h => h.faction));
    if (!allowedFactions.has(cardDef.faction)) return false;
    if ((cardDef.pips || 1) >= 2) {
      if (heroDefs.length < 2) return false;
      return heroDefs[0].faction === cardDef.faction && heroDefs[1].faction === cardDef.faction;
    }
    return true;
  }

  function validateDeck(deck, db) {
    const errors = [];
    if (!deck) return { valid: false, errors: ['No deck selected.'], total: 0 };

    const heroIds = Array.isArray(deck.heroIds) ? deck.heroIds.filter(Boolean) : [];
    const uniqueHeroes = Array.from(new Set(heroIds));
    if (uniqueHeroes.length !== 2) {
      errors.push('Choose 2 distinct Heroes.');
    }
    const heroDefs = uniqueHeroes
      .map(id => db.cardMap.get(id))
      .filter(h => h && (h.type === 'hero_active' || h.type === 'hero_passive'));
    if (uniqueHeroes.length === 2 && heroDefs.length !== 2) {
      errors.push('One or more chosen Heroes could not be found.');
    }

    let total = 0;
    const entries = Object.entries(deck.cards || {});
    for (const [cardId, rawCount] of entries) {
      const count = Number(rawCount) || 0;
      if (count <= 0) continue;
      total += count;
      const c = db.cardMap.get(cardId);
      if (!c || HIDDEN_CARD_IDS.has(cardId)) {
        errors.push(`Unknown or unavailable card (${cardId}).`);
        continue;
      }
      if (c.tier === 'token' || c.type === 'hero_active' || c.type === 'hero_passive') {
        errors.push(`${c.name} cannot be placed in a main deck.`);
        continue;
      }
      const maxCopies = c.tier === 'elite' ? 1 : 2;
      if (count > maxCopies) {
        errors.push(`${c.name} exceeds its ${maxCopies}× copy limit.`);
      }
      if (heroDefs.length === 2 && !isCardLegalForHeroes(c, heroDefs)) {
        if ((c.pips || 1) >= 2) {
          errors.push(`${c.name} requires a Mono-${FACTIONS[c.faction]?.short || c.faction} Hero loadout.`);
        } else {
          errors.push(`${c.name} belongs to ${FACTIONS[c.faction]?.name || c.faction} (outside chosen Heroes).`);
        }
      }
    }

    if (total !== 25) {
      errors.push(`Deck has ${total}/25 cards.`);
    }

    return {
      valid: errors.length === 0,
      errors,
      total,
      heroDefs,
      factions: heroDefs.map(h => h.faction)
    };
  }

  function expandDeckToCardIds(deck) {
    const list = [];
    for (const [cardId, rawCount] of Object.entries(deck.cards || {})) {
      const n = Number(rawCount) || 0;
      for (let i = 0; i < n; i++) list.push(cardId);
    }
    return list;
  }

  return {
    FACTIONS,
    TYPE_LABELS,
    HIDDEN_CARD_IDS,
    escapeHtml,
    getSubtypes,
    hasSubtype,
    parseHeroApCost,
    parseBuildingActivation,
    formatRulesMarkup,
    loadCardDatabase,
    renderFullCard,
    refineAttachedCardFit,
    loadSavedDecks,
    saveDecks,
    countDeckCards,
    isCardLegalForHeroes,
    validateDeck,
    expandDeckToCardIds
  };
})();
