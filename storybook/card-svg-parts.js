/* ==========================================================================
   Storybook Card Studio — Sculpted 3D SVG Gems, Ribbons, Pips & Medallions
   ========================================================================== */

window.StorybookCardSVGs = (() => {
  'use strict';

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Intricate Heraldic Faction Signet Medallions & Woodcut Watermarks (viewBox 0 0 48 48)
  function renderEmblemR(uid) {
    return `
      <defs>
        <linearGradient id="r-crown-${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff6cc"/>
          <stop offset="45%" stop-color="#ecc05f"/>
          <stop offset="100%" stop-color="#9e6b18"/>
        </linearGradient>
        <radialGradient id="r-ruby-${uid}" cx="38%" cy="32%" r="65%">
          <stop offset="0%" stop-color="#ff9eb0"/>
          <stop offset="42%" stop-color="#e0193b"/>
          <stop offset="100%" stop-color="#590413"/>
        </radialGradient>
      </defs>
      <!-- Subtle Drop Shadow -->
      <g transform="translate(0, 1.4)" fill="#240309" opacity="0.65">
        <path d="M 12.2,32.6 Q 24,29.6 35.8,32.6 L 35.0,35.8 Q 24,32.8 13.0,35.8 Z"/>
        <path d="M 11.8,30.8 C 11.4,26.5 10.8,21.8 11.2,17.0 C 13.2,21.2 15.0,22.8 16.4,22.6 C 16.8,20.0 17.0,17.2 17.4,14.8 C 18.8,19.4 20.4,20.8 21.8,20.2 L 22.4,14.6 L 20.3,12.3 L 24,8.0 L 27.7,12.3 L 25.6,14.6 L 26.2,20.2 C 27.6,20.8 29.2,19.4 30.6,14.8 C 31.0,17.2 31.2,20.0 31.6,22.6 C 33.0,22.8 34.8,21.2 36.8,17.0 C 37.2,21.8 36.6,26.5 36.2,30.8 Q 24,27.8 11.8,30.8 Z"/>
      </g>
      <!-- Arched Sovereign Circlet Band + Garnet Studs -->
      <path d="M 12.2,32.6 Q 24,29.6 35.8,32.6 L 35.0,35.8 Q 24,32.8 13.0,35.8 Z"
            fill="url(#r-crown-${uid})" stroke="#291204" stroke-width="1.15" stroke-linejoin="round"/>
      <circle cx="17.2" cy="33.4" r="1.05" fill="#9e0e28" stroke="#291204" stroke-width="0.6"/>
      <circle cx="24.0" cy="32.6" r="1.15" fill="#d9183b" stroke="#291204" stroke-width="0.6"/>
      <circle cx="30.8" cy="33.4" r="1.05" fill="#9e0e28" stroke="#291204" stroke-width="0.6"/>
      <!-- Baroque Gothic Crown with Filigree Lancet Cutouts & Diamond Fleur Apex -->
      <path fill-rule="evenodd"
            d="M 11.8,30.8 C 11.4,26.5 10.8,21.8 11.2,17.0 C 13.2,21.2 15.0,22.8 16.4,22.6 C 16.8,20.0 17.0,17.2 17.4,14.8 C 18.8,19.4 20.4,20.8 21.8,20.2 L 22.4,14.6 L 20.3,12.3 L 24,8.0 L 27.7,12.3 L 25.6,14.6 L 26.2,20.2 C 27.6,20.8 29.2,19.4 30.6,14.8 C 31.0,17.2 31.2,20.0 31.6,22.6 C 33.0,22.8 34.8,21.2 36.8,17.0 C 37.2,21.8 36.6,26.5 36.2,30.8 Q 24,27.8 11.8,30.8 Z
               M 15.6,24.3 C 14.5,26.2 14.9,28.1 16.8,28.3 C 18.1,27.5 17.9,25.6 15.6,24.3 Z
               M 32.4,24.3 C 30.1,25.6 29.9,27.5 31.2,28.3 C 33.1,28.1 33.5,26.2 32.4,24.3 Z"
            fill="url(#r-crown-${uid})" stroke="#291204" stroke-width="1.2" stroke-linejoin="round"/>
      <!-- Left-Side Sculpted Metallic Highlight -->
      <path d="M 24,8.6 L 20.9,12.2 L 22.8,14.4 L 22.2,20.5 L 24,17.2 Z" fill="#ffffff" opacity="0.34"/>
      <!-- Spire Tip Finial Pearls -->
      <circle cx="11.0" cy="15.8" r="1.3" fill="#fff5cc" stroke="#291204" stroke-width="0.9"/>
      <circle cx="17.4" cy="13.8" r="1.05" fill="#fff5cc" stroke="#291204" stroke-width="0.85"/>
      <circle cx="30.6" cy="13.8" r="1.05" fill="#fff5cc" stroke="#291204" stroke-width="0.85"/>
      <circle cx="37.0" cy="15.8" r="1.3" fill="#fff5cc" stroke="#291204" stroke-width="0.9"/>
      <!-- Central Faceted Magic-Mirror Ruby Cabochon -->
      <polygon points="24,17.2 28.0,22.9 24,28.0 20.0,22.9" fill="#36040d" stroke="#fff0b3" stroke-width="0.95" stroke-linejoin="round"/>
      <polygon points="24,18.5 26.8,22.9 24,26.7 21.2,22.9" fill="url(#r-ruby-${uid})"/>
      <polygon points="24,18.9 25.5,22.2 24,23.0 22.5,22.2" fill="#ffffff" opacity="0.55"/>
    `;
  }

  function renderEmblemH(uid) {
    return `
      <defs>
        <linearGradient id="h-stone-${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff4c4"/>
          <stop offset="50%" stop-color="#e6b655"/>
          <stop offset="100%" stop-color="#8f5b12"/>
        </linearGradient>
        <linearGradient id="h-fire-${uid}" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#e8620c"/>
          <stop offset="55%" stop-color="#ffae24"/>
          <stop offset="100%" stop-color="#fff5a8"/>
        </linearGradient>
      </defs>
      <!-- Recessed Dark Hearth Alcove -->
      <path d="M 16.2,33.6 L 16.2,22.8 C 16.2,17.0 19.6,13.8 24,13.8 C 28.4,13.8 31.8,17.0 31.8,22.8 L 31.8,33.6 Z"
            fill="#240f02"/>
      <!-- Carved Masonry Hearth-Arch -->
      <path fill-rule="evenodd"
            d="M 12.4,33.6 L 12.4,22.6 C 12.4,14.5 17.4,10.0 24,10.0 C 30.6,10.0 35.6,14.5 35.6,22.6 L 35.6,33.6 Z
               M 16.4,33.6 L 16.4,22.8 C 16.4,17.2 19.7,14.0 24,14.0 C 28.3,14.0 31.6,17.2 31.6,22.8 L 31.6,33.6 Z"
            fill="url(#h-stone-${uid})" stroke="#291403" stroke-width="1.2" stroke-linejoin="round"/>
      <!-- Etched Stone Voussoir Joints -->
      <g stroke="#3b1d05" stroke-width="1.0" stroke-linecap="round">
        <line x1="12.6" y1="28.0" x2="16.2" y2="28.0"/>
        <line x1="12.6" y1="22.6" x2="16.2" y2="22.6"/>
        <line x1="31.8" y1="28.0" x2="35.4" y2="28.0"/>
        <line x1="31.8" y1="22.6" x2="35.4" y2="22.6"/>
        <line x1="14.3" y1="15.8" x2="17.5" y2="18.1"/>
        <line x1="33.7" y1="15.8" x2="30.5" y2="18.1"/>
      </g>
      <!-- Proud Trapezoidal Keystone at 12 o'clock -->
      <polygon points="20.9,8.5 27.1,8.5 25.9,14.8 22.1,14.8"
               fill="url(#h-stone-${uid})" stroke="#291403" stroke-width="1.2" stroke-linejoin="round"/>
      <polygon points="21.5,9.1 26.5,9.1 25.8,11.2 22.2,11.2" fill="#ffffff" opacity="0.28"/>
      <!-- Crossed Kindling Logs Inside Hearth -->
      <g stroke="#240f02" stroke-width="3.2" stroke-linecap="round">
        <line x1="18.2" y1="32.7" x2="29.4" y2="30.1"/>
        <line x1="29.8" y1="32.7" x2="18.6" y2="30.1"/>
      </g>
      <g stroke="#c78332" stroke-width="1.7" stroke-linecap="round">
        <line x1="18.2" y1="32.7" x2="29.4" y2="30.1"/>
        <line x1="29.8" y1="32.7" x2="18.6" y2="30.1"/>
      </g>
      <!-- Three-Tongue Dancing Hearthfire + Ivory Heart-Ember + Twin Sparks -->
      <path d="M 24,15.8 C 26.2,19.2 27.1,21.7 26.3,24.1 C 27.9,23.3 29.1,21.7 29.1,20.0 C 30.7,22.7 30.5,26.7 28.1,29.3 C 26.8,30.7 25.4,31.3 24,31.3 C 22.6,31.3 21.2,30.7 19.9,29.3 C 17.5,26.7 17.3,22.7 18.9,20.0 C 18.9,21.7 20.1,23.3 21.7,24.1 C 20.9,21.7 21.8,19.2 24,15.8 Z"
            fill="url(#h-fire-${uid})" stroke="#291102" stroke-width="1.05" stroke-linejoin="round"/>
      <path d="M 24,22.0 C 25.8,24.8 26.7,26.8 26.1,28.8 C 25.6,30.1 24.8,30.8 24,30.8 C 23.2,30.8 22.4,30.1 21.9,28.8 C 21.3,26.8 22.2,24.8 24,22.0 Z"
            fill="#fffce6"/>
      <polygon points="20.2,16.8 21.0,18.0 20.2,19.2 19.4,18.0" fill="#ffe89c"/>
      <polygon points="27.8,16.8 28.6,18.0 27.8,19.2 27.0,18.0" fill="#ffe89c"/>
      <!-- Stepped Hearthstone Threshold Plinth -->
      <polygon points="12.2,33.5 35.8,33.5 35.0,36.3 13.0,36.3"
               fill="url(#h-stone-${uid})" stroke="#291403" stroke-width="1.2" stroke-linejoin="round"/>
    `;
  }

  function renderEmblemD(uid) {
    return `
      <defs>
        <linearGradient id="d-vine-${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#e3f5c4"/>
          <stop offset="50%" stop-color="#9ec468"/>
          <stop offset="100%" stop-color="#426320"/>
        </linearGradient>
        <radialGradient id="d-gem-${uid}" cx="38%" cy="32%" r="65%">
          <stop offset="0%" stop-color="#b8ffcf"/>
          <stop offset="45%" stop-color="#19b35c"/>
          <stop offset="100%" stop-color="#063b1c"/>
        </radialGradient>
      </defs>
      <path fill-rule="evenodd"
            d="M 24,8.2 C 32.5,11.5 37.2,18.2 36.2,26.2 C 35.4,32.5 30.5,37.2 24,38.5 C 17.5,37.2 12.6,32.5 11.8,26.2 C 10.8,18.2 15.5,11.5 24,8.2 Z
               M 24,13.6 C 18.4,16.2 15.6,20.8 16.2,26.0 C 16.8,30.2 19.8,33.2 24,34.2 C 28.2,33.2 31.2,30.2 31.8,26.0 C 32.4,20.8 29.6,16.2 24,13.6 Z"
            fill="url(#d-vine-${uid})" stroke="#13290e" stroke-width="1.2" stroke-linejoin="round"/>
      <g fill="url(#d-vine-${uid})" stroke="#13290e" stroke-width="1.05" stroke-linejoin="round">
        <polygon points="12.5,19.5 7.8,16.2 14.2,15.8"/>
        <polygon points="35.5,19.5 40.2,16.2 33.8,15.8"/>
        <polygon points="12.2,28.5 7.6,31.2 14.0,31.8"/>
        <polygon points="35.8,28.5 40.4,31.2 34.0,31.8"/>
        <polygon points="24,8.2 21.4,13.2 24,11.8 26.6,13.2"/>
      </g>
      <path d="M 24,17.2 C 27.2,21.2 28.8,23.8 28.8,26.6 C 28.8,29.5 26.7,31.5 24,31.5 C 21.3,31.5 19.2,29.5 19.2,26.6 C 19.2,23.8 20.8,21.2 24,17.2 Z"
            fill="#0a2614" stroke="#dff5be" stroke-width="0.95"/>
      <path d="M 24,18.8 C 26.5,22.0 27.6,24.2 27.6,26.5 C 27.6,28.7 26.0,30.2 24,30.2 C 22.0,30.2 20.4,28.7 20.4,26.5 C 20.4,24.2 21.5,22.0 24,18.8 Z"
            fill="url(#d-gem-${uid})"/>
      <ellipse cx="22.5" cy="24.8" rx="1.2" ry="2.2" transform="rotate(-18 22.5 24.8)" fill="#ffffff" opacity="0.55"/>
    `;
  }

  function renderEmblemT(uid) {
    return `
      <defs>
        <linearGradient id="t-moon-${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="48%" stop-color="#d4dcff"/>
          <stop offset="100%" stop-color="#7c87cc"/>
        </linearGradient>
        <radialGradient id="t-star-${uid}" cx="40%" cy="38%" r="62%">
          <stop offset="0%" stop-color="#fff8d6"/>
          <stop offset="55%" stop-color="#e3b8ff"/>
          <stop offset="100%" stop-color="#7d4bc4"/>
        </radialGradient>
      </defs>
      <path d="M 28.2,9.2 C 18.4,9.2 10.8,16.2 10.8,25.2 C 10.8,33.8 18.0,39.8 27.6,39.0 C 20.8,36.8 17.2,31.4 17.2,24.8 C 17.2,18.2 21.4,12.4 28.2,9.2 Z"
            fill="url(#t-moon-${uid})" stroke="#161238" stroke-width="1.25" stroke-linejoin="round"/>
      <path d="M 23.2,13.2 C 17.2,15.8 14.0,20.2 14.0,25.2 C 14.0,30.2 17.2,34.4 22.8,36.6"
            fill="none" stroke="#5b64a8" stroke-width="0.95" stroke-linecap="round"/>
      <polygon points="30.5,12.2 32.4,18.6 38.8,20.5 32.4,22.4 30.5,28.8 28.6,22.4 22.2,20.5 28.6,18.6"
               fill="url(#t-star-${uid})" stroke="#161238" stroke-width="1.1" stroke-linejoin="round"/>
      <circle cx="30.5" cy="20.5" r="2.1" fill="#ffffff" opacity="0.85"/>
      <polygon points="24.5,29.2 25.5,31.5 27.8,32.5 25.5,33.5 24.5,35.8 23.5,33.5 21.2,32.5 23.5,31.5"
               fill="#fff4cc" stroke="#161238" stroke-width="0.7" stroke-linejoin="round"/>
    `;
  }

  function renderEmblemW(uid) {
    return `
      <defs>
        <linearGradient id="w-brass-${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff5c8"/>
          <stop offset="50%" stop-color="#edb958"/>
          <stop offset="100%" stop-color="#8c5411"/>
        </linearGradient>
        <radialGradient id="w-quartz-${uid}" cx="36%" cy="32%" r="65%">
          <stop offset="0%" stop-color="#ffd6ec"/>
          <stop offset="45%" stop-color="#ff4da6"/>
          <stop offset="100%" stop-color="#7d0b44"/>
        </radialGradient>
      </defs>
      <circle cx="24" cy="21" r="10.2" fill="none" stroke="#ffd88a" stroke-width="2.2" stroke-dasharray="3.1 2.2" opacity="0.55"/>
      <path fill-rule="evenodd"
            d="M 16.6,10.5 C 12.6,10.5 9.8,13.4 9.8,17.2 C 9.8,21.0 12.8,23.8 17.0,23.8 L 21.6,23.8 L 21.6,38.8 L 26.4,38.8 L 26.4,35.6 L 31.6,35.6 L 31.6,32.4 L 28.4,32.4 L 28.4,30.2 L 31.6,30.2 L 31.6,27.2 L 26.4,27.2 L 26.4,23.8 L 31.0,23.8 C 35.2,23.8 38.2,21.0 38.2,17.2 C 38.2,13.4 35.4,10.5 31.4,10.5 C 28.2,10.5 25.6,12.2 24,14.8 C 22.4,12.2 19.8,10.5 16.6,10.5 Z
               M 16.5,14.2 C 18.4,14.2 19.8,15.5 19.8,17.2 C 19.8,18.9 18.4,20.2 16.5,20.2 C 14.6,20.2 13.2,18.9 13.2,17.2 C 13.2,15.5 14.6,14.2 16.5,14.2 Z
               M 31.5,14.2 C 33.4,14.2 34.8,15.5 34.8,17.2 C 34.8,18.9 33.4,20.2 31.5,20.2 C 29.6,20.2 28.2,18.9 28.2,17.2 C 28.2,15.5 29.6,14.2 31.5,14.2 Z"
            fill="url(#w-brass-${uid})" stroke="#2e0c1d" stroke-width="1.2" stroke-linejoin="round"/>
      <polygon points="24,16.5 27.6,20.6 24,24.8 20.4,20.6" fill="#3b0720" stroke="#fff2ba" stroke-width="0.9"/>
      <polygon points="24,17.7 26.5,20.6 24,23.6 21.5,20.6" fill="url(#w-quartz-${uid})"/>
    `;
  }

  const FACTION_META = {
    R: {
      bg1: '#9e1732',
      bg2: '#380510',
      fg: '#ffe294',
      render: renderEmblemR,
      watermark: `
        <path fill-rule="evenodd" d="M 12.2,32.6 Q 24,29.6 35.8,32.6 L 35.0,35.8 Q 24,32.8 13.0,35.8 Z"/>
        <path fill-rule="evenodd" d="M 11.8,30.8 C 11.4,26.5 10.8,21.8 11.2,17.0 C 13.2,21.2 15.0,22.8 16.4,22.6 C 16.8,20.0 17.0,17.2 17.4,14.8 C 18.8,19.4 20.4,20.8 21.8,20.2 L 22.4,14.6 L 20.3,12.3 L 24,8.0 L 27.7,12.3 L 25.6,14.6 L 26.2,20.2 C 27.6,20.8 29.2,19.4 30.6,14.8 C 31.0,17.2 31.2,20.0 31.6,22.6 C 33.0,22.8 34.8,21.2 36.8,17.0 C 37.2,21.8 36.6,26.5 36.2,30.8 Q 24,27.8 11.8,30.8 Z M 24,17.0 L 28.0,22.9 L 24,28.0 L 20.0,22.9 Z M 15.6,24.3 C 14.5,26.2 14.9,28.1 16.8,28.3 C 18.1,27.5 17.9,25.6 15.6,24.3 Z M 32.4,24.3 C 30.1,25.6 29.9,27.5 31.2,28.3 C 33.1,28.1 33.5,26.2 32.4,24.3 Z"/>
        <polygon points="24,19.2 26.2,22.9 24,26.0 21.8,22.9"/>
        <circle cx="11.0" cy="15.6" r="1.4"/>
        <circle cx="17.4" cy="13.6" r="1.15"/>
        <circle cx="30.6" cy="13.6" r="1.15"/>
        <circle cx="37.0" cy="15.6" r="1.4"/>
      `
    },
    H: {
      bg1: '#ba6e12',
      bg2: '#472303',
      fg: '#fff0b8',
      render: renderEmblemH,
      watermark: `
        <path fill-rule="evenodd" d="M 12.4,32.8 L 12.4,22.6 C 12.4,14.5 17.4,10.0 24,10.0 C 30.6,10.0 35.6,14.5 35.6,22.6 L 35.6,32.8 Z M 16.4,32.8 L 16.4,22.8 C 16.4,17.2 19.7,14.0 24,14.0 C 28.3,14.0 31.6,17.2 31.6,22.8 L 31.6,32.8 Z"/>
        <polygon points="20.8,8.2 27.2,8.2 26.0,14.8 22.0,14.8"/>
        <polygon points="12.0,34.0 36.0,34.0 35.0,36.6 13.0,36.6"/>
        <path fill-rule="evenodd" d="M 24,16.0 C 26.2,19.3 27.1,21.7 26.3,24.1 C 27.9,23.3 29.1,21.7 29.1,20.0 C 30.7,22.7 30.5,26.7 28.1,29.3 C 26.8,30.7 25.4,31.3 24,31.3 C 22.6,31.3 21.2,30.7 19.9,29.3 C 17.5,26.7 17.3,22.7 18.9,20.0 C 18.9,21.7 20.1,23.3 21.7,24.1 C 20.9,21.7 21.8,19.3 24,16.0 Z M 24,22.4 C 25.6,25.0 26.4,26.9 25.9,28.7 C 25.4,29.9 24.7,30.5 24,30.5 C 23.3,30.5 22.6,29.9 22.1,28.7 C 21.6,26.9 22.4,25.0 24,22.4 Z"/>
      `
    },
    D: {
      bg1: '#266942',
      bg2: '#0e301c',
      fg: '#d8f0b8',
      render: renderEmblemD,
      path: `<path fill-rule="evenodd" d="M 24,8.2 C 32.5,11.5 37.2,18.2 36.2,26.2 C 35.4,32.5 30.5,37.2 24,38.5 C 17.5,37.2 12.6,32.5 11.8,26.2 C 10.8,18.2 15.5,11.5 24,8.2 Z M 24,13.6 C 18.4,16.2 15.6,20.8 16.2,26.0 C 16.8,30.2 19.8,33.2 24,34.2 C 28.2,33.2 31.2,30.2 31.8,26.0 C 32.4,20.8 29.6,16.2 24,13.6 Z M 24,18.0 C 26.8,21.5 28.2,24.0 28.2,26.6 C 28.2,29.2 26.3,31.0 24,31.0 C 21.7,31.0 19.8,29.2 19.8,26.6 C 19.8,24.0 21.2,21.5 24,18.0 Z" />`
    },
    T: {
      bg1: '#4d43a3',
      bg2: '#1e194d',
      fg: '#e6e8ff',
      render: renderEmblemT,
      path: `<path d="M 28.2,9.2 C 18.4,9.2 10.8,16.2 10.8,25.2 C 10.8,33.8 18.0,39.8 27.6,39.0 C 20.8,36.8 17.2,31.4 17.2,24.8 C 17.2,18.2 21.4,12.4 28.2,9.2 Z M 30.5,12.2 L 32.4,18.6 L 38.8,20.5 L 32.4,22.4 L 30.5,28.8 L 28.6,22.4 L 22.2,20.5 L 28.6,18.6 Z" />`
    },
    W: {
      bg1: '#df418b',
      bg2: '#6b123c',
      fg: '#ffe6f2',
      render: renderEmblemW,
      path: `<path d="M 17,12 C 12.8,12 9.8,15.2 9.8,19.2 C 9.8,23.2 13.2,26.2 17.5,26.2 L 21,26.2 L 21,40 L 27,40 L 27,36.5 L 32.2,36.5 L 32.2,32.5 L 27,32.5 L 27,26.2 L 30.5,26.2 C 34.8,26.2 38.2,23.2 38.2,19.2 C 38.2,15.2 35.2,12 31,12 C 27.8,12 25.4,13.8 24,16.4 C 22.6,13.8 20.2,12 17,12 Z M 17,16.6 C 18.8,16.6 20.2,17.9 20.2,19.5 C 20.2,21.1 18.8,22.4 17,22.4 C 15.2,22.4 13.8,21.1 13.8,19.5 C 13.8,17.9 15.2,16.6 17,16.6 Z M 31,16.6 C 32.8,16.6 34.2,17.9 34.2,19.5 C 34.2,21.1 32.8,22.4 31,22.4 C 29.2,22.4 27.8,21.1 27.8,19.5 C 27.8,17.9 29.2,16.6 31,16.6 Z" fill-rule="evenodd"/>`
    }
  };

  // Crisp Top-Right Faction Loyalty Signet Coin SVG (viewBox 0 0 48 48)
  function factionPip(code, uid) {
    const g = FACTION_META[code];
    if (!g) return '';
    const innerArt = g.render
      ? g.render(uid)
      : `<g fill="${g.fg}" stroke="#241104" stroke-width="1.2" stroke-linejoin="round">${g.path}</g>`;
    return `
      <svg class="svg-loyalty-coin" viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <radialGradient id="fp-bg-${uid}" cx="35%" cy="28%" r="72%">
            <stop offset="0%" stop-color="${g.bg1}"/>
            <stop offset="100%" stop-color="${g.bg2}"/>
          </radialGradient>
          <linearGradient id="fp-rim-${uid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fff3bf"/>
            <stop offset="48%" stop-color="#d4a446"/>
            <stop offset="100%" stop-color="#593908"/>
          </linearGradient>
        </defs>
        <!-- Signet Outer Gold Bezel + Cardinal Rivets -->
        <circle cx="24" cy="24" r="22.2" fill="url(#fp-rim-${uid})" stroke="#241203" stroke-width="2"/>
        <circle cx="24" cy="24" r="19.6" fill="none" stroke="#5e3c09" stroke-width="0.8" opacity="0.7"/>
        <circle cx="24" cy="24" r="18.2" fill="url(#fp-bg-${uid})" stroke="#241003" stroke-width="1.35"/>
        <circle cx="24" cy="3.6" r="1.05" fill="#fff4c2" stroke="#3b2205" stroke-width="0.5"/>
        <circle cx="44.4" cy="24" r="1.05" fill="#fff4c2" stroke="#3b2205" stroke-width="0.5"/>
        <circle cx="24" cy="44.4" r="1.05" fill="#fff4c2" stroke="#3b2205" stroke-width="0.5"/>
        <circle cx="3.6" cy="24" r="1.05" fill="#fff4c2" stroke="#3b2205" stroke-width="0.5"/>
        <!-- Upper Enamel Specular Rim -->
        <path d="M 10,16 A 16.5,16.5 0 0,1 38,16" fill="none" stroke="#ffffff" stroke-width="1.1" opacity="0.22" stroke-linecap="round"/>
        ${innerArt}
      </svg>
    `;
  }

  // Clean Engraved Woodcut Watermark SVG for Parchment Text Box
  function factionWatermark(code) {
    const g = FACTION_META[code];
    if (!g) return '';
    const content = g.watermark || g.path;
    return `
      <svg class="svg-watermark-glyph" viewBox="0 0 48 48" aria-hidden="true">
        <g fill="#4a3319">
          ${content}
        </g>
      </svg>
    `;
  }

  // 1. Top-Left (and Inline Rules Text) Faceted Sapphire-Brass Energy Threshold Gem
  function energyGem(val, uid, isInline = false) {
    const strVal = val === null || val === undefined ? '' : String(val);
    const cls = isInline ? 'svg-inline-energy-gem' : 'svg-gem svg-energy-gem';
    let textMarkup = '';
    if (!isInline) {
      textMarkup = `<text x="32" y="43" text-anchor="middle" class="svg-stat-num">${esc(strVal)}</text>`;
    } else if (strVal.length === 1) {
      textMarkup = `<text x="32" y="45" text-anchor="middle" class="svg-stat-num" style="font-size:35px; stroke-width:5.4px;">${esc(strVal)}</text>`;
    } else if (strVal.length > 1) {
      textMarkup = `<text x="32" y="43" text-anchor="middle" class="svg-stat-num" style="font-size:26px; stroke-width:4.8px;">${esc(strVal)}</text>`;
    }
    return `
      <svg class="${cls}" viewBox="0 0 64 68" aria-hidden="true">
        <defs>
          <linearGradient id="eg-gold-${uid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fae199"/>
            <stop offset="45%" stop-color="#c69235"/>
            <stop offset="100%" stop-color="#5e3e0c"/>
          </linearGradient>
          <radialGradient id="eg-sapphire-${uid}" cx="38%" cy="30%" r="68%">
            <stop offset="0%" stop-color="#7ce8ff"/>
            <stop offset="38%" stop-color="#1d8fe1"/>
            <stop offset="82%" stop-color="#0f3c78"/>
            <stop offset="100%" stop-color="#081e42"/>
          </radialGradient>
        </defs>
        <polygon points="32,2 59,17 59,51 32,66 5,51 5,17" fill="url(#eg-gold-${uid})" stroke="#2a1905" stroke-width="2.5"/>
        <polygon points="32,9 52,21 52,47 32,59 12,47 12,21" fill="url(#eg-sapphire-${uid})" stroke="#092147" stroke-width="1.8"/>
        <polygon points="32,9 52,21 32,34 12,21" fill="#ffffff" opacity="0.22"/>
        <polygon points="23,16 32,12 37,17 27,22" fill="#ffffff" opacity="0.52"/>
        ${textMarkup}
      </svg>
    `;
  }

  // 2. Left-Rail Action Point (AP) Sculpted Gold-Bezel Amber Diamond Gem
  function apDiamond(uid) {
    return `
      <svg class="svg-ap-pip" viewBox="0 0 26 30" aria-hidden="true">
        <defs>
          <linearGradient id="ap-gold-${uid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fae39c"/>
            <stop offset="50%" stop-color="#c69133"/>
            <stop offset="100%" stop-color="#593908"/>
          </linearGradient>
          <radialGradient id="ap-amber-${uid}" cx="38%" cy="32%" r="68%">
            <stop offset="0%" stop-color="#fff7c2"/>
            <stop offset="38%" stop-color="#f79e19"/>
            <stop offset="85%" stop-color="#9c3f05"/>
            <stop offset="100%" stop-color="#4d1b02"/>
          </radialGradient>
        </defs>
        <polygon points="13,1.5 24.5,15 13,28.5 1.5,15" fill="url(#ap-gold-${uid})" stroke="#211103" stroke-width="2" stroke-linejoin="round"/>
        <polygon points="13,5.2 21,15 13,24.8 5,15" fill="url(#ap-amber-${uid})" stroke="#4f2003" stroke-width="1.1" stroke-linejoin="round"/>
        <polygon points="13,5.2 21,15 13,15" fill="#ffffff" opacity="0.28"/>
        <polygon points="9.5,11.5 13,7 15,10.5 11,13.5" fill="#ffffff" opacity="0.5"/>
      </svg>
    `;
  }

  // 2b. Pokemon-Style 0-AP Recessed Dark-Grey Fading Circle
  function apZeroCircle(uid) {
    return `
      <svg class="svg-ap-zero-orb" viewBox="0 0 28 28" aria-hidden="true">
        <defs>
          <radialGradient id="ap-zero-grad-${uid}" cx="58%" cy="62%" r="65%" fx="62%" fy="66%">
            <stop offset="0%" stop-color="#7a7f87" stop-opacity="0.48"/>
            <stop offset="52%" stop-color="#43474f" stop-opacity="0.78"/>
            <stop offset="86%" stop-color="#23262b" stop-opacity="0.94"/>
            <stop offset="100%" stop-color="#141619" stop-opacity="0.98"/>
          </radialGradient>
        </defs>
        <!-- Subtle Recessed Outer Rim Highlight + Dark Charcoal Fading Socket -->
        <circle cx="14" cy="14" r="11.8" fill="none" stroke="rgba(255, 240, 205, 0.28)" stroke-width="1.4"/>
        <circle cx="14" cy="14" r="11" fill="url(#ap-zero-grad-${uid})" stroke="#16181c" stroke-width="1.5"/>
        <!-- Inner Top-Left Recessed Shadow Crescent (Pokemon 0-Energy Dimple Feel) -->
        <path d="M 6.2,17.5 A 9.5,9.5 0 0,1 19.5,6.2 A 10.2,10.2 0 0,0 6.2,17.5 Z" fill="#0d0e11" opacity="0.45"/>
      </svg>
    `;
  }

  // 3. Hearthstone-Style Curved Vellum Name Scroll Ribbon (with Elite Banner Augment!)
  function nameRibbon(title, isPlaceholder, uid, isElite = false) {
    const pathId = `ribbon-arc-${uid}`;
    const len = (title || '').length;
    let fontSize = 16.5;
    if (len > 28) fontSize = 12.2;
    else if (len > 22) fontSize = 13.6;
    else if (len > 17) fontSize = 15;

    const eliteDefs = isElite ? `
      <linearGradient id="rib-gold-${uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fff4bf"/>
        <stop offset="45%" stop-color="#e3ad42"/>
        <stop offset="100%" stop-color="#784b08"/>
      </linearGradient>
      <radialGradient id="rib-gem-${uid}" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#fff9d6"/>
        <stop offset="45%" stop-color="#f59e0b"/>
        <stop offset="100%" stop-color="#7c2d12"/>
      </radialGradient>
    ` : '';

    const tailFill = isElite ? `url(#rib-gold-${uid})` : `url(#rib-fold-${uid})`;
    const mainStroke = isElite ? `url(#rib-gold-${uid})` : '#2c1c0b';
    const mainStrokeWidth = isElite ? '3.1' : '2.3';

    const eliteOrnaments = isElite ? `
      <!-- Outer Dark Outline Behind Gold Trim for Crisp Contrast -->
      <path d="M 21,15 Q 162,2 303,15 L 298,43 Q 162,30 26,43 Z"
            fill="none" stroke="#241304" stroke-width="5.0" stroke-linejoin="round"/>
    ` : '';

    return `
      <svg class="svg-name-ribbon" viewBox="0 0 324 56" aria-hidden="true">
        <defs>
          <linearGradient id="rib-paper-${uid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${isElite ? '#fffbf0' : '#fff8e8'}"/>
            <stop offset="55%" stop-color="${isElite ? '#f7e6c4' : '#f2e1be'}"/>
            <stop offset="100%" stop-color="${isElite ? '#e3c488' : '#dcc192'}"/>
          </linearGradient>
          <linearGradient id="rib-fold-${uid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#b5925b"/>
            <stop offset="100%" stop-color="#7c5d30"/>
          </linearGradient>
          ${eliteDefs}
          <path id="${pathId}" d="M 28,36 Q 162,22 296,36" />
        </defs>
        <path d="M 6,24 L 28,16 L 30,43 L 8,49 L 15,36 Z" fill="${tailFill}" stroke="#241304" stroke-width="2" stroke-linejoin="round"/>
        <path d="M 318,24 L 296,16 L 294,43 L 316,49 L 309,36 Z" fill="${tailFill}" stroke="#241304" stroke-width="2" stroke-linejoin="round"/>
        <polygon points="22,40 33,45 31,36" fill="#3b2610"/>
        <polygon points="302,40 291,45 293,36" fill="#3b2610"/>
        ${eliteOrnaments}
        <path d="M 21,15 Q 162,2 303,15 L 298,43 Q 162,30 26,43 Z"
              fill="url(#rib-paper-${uid})" stroke="${mainStroke}" stroke-width="${mainStrokeWidth}" stroke-linejoin="round"/>
        <path d="M 25,18.5 Q 162,6 299,18.5 L 295,39.5 Q 162,27 29,39.5 Z"
              fill="none" stroke="${isElite ? '#b88228' : '#9e7840'}" stroke-width="${isElite ? '1.25' : '1'}" opacity="0.72"/>
        <text class="svg-ribbon-title ${isPlaceholder ? 'is-placeholder' : ''}" font-size="${fontSize}">
          <textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${esc(title)}</textPath>
        </text>
      </svg>
    `;
  }

  // 3b. Sculpted Elite Frame Crown / Winged Sun-Diadem Topper (Perches atop the Art Bezel!)
  function eliteCrest(uid, isSpell = false) {
    const leftWing = isSpell
      ? 'M 66,28 C 48,28 26,29 6,31 C 14,24 25,21 38,21 C 28,18 19,19 12,24 C 22,15 36,14 50,17 Z'
      : 'M 66,26 C 48,25 28,30 8,42 C 15,31 25,24 38,22 C 28,20 19,22 12,28 C 22,17 36,14 50,17 Z';
    const rightWing = isSpell
      ? 'M 66,28 C 84,28 106,29 126,31 C 118,24 107,21 94,21 C 104,18 113,19 120,24 C 110,15 96,14 82,17 Z'
      : 'M 66,26 C 84,25 104,30 124,42 C 117,31 107,24 94,22 C 104,20 113,22 120,28 C 110,17 96,14 82,17 Z';
    const baseRim = isSpell
      ? 'M 36,27 L 96,27 L 93,32 L 39,32 Z'
      : 'M 38,27 Q 66,21 94,27 L 91,32 Q 66,26.5 41,32 Z';
    return `
      <svg class="svg-elite-crest" viewBox="0 0 132 50" aria-hidden="true">
        <defs>
          <linearGradient id="ec-gold-${uid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fff7cc"/>
            <stop offset="45%" stop-color="#e6b043"/>
            <stop offset="100%" stop-color="#784908"/>
          </linearGradient>
          <linearGradient id="ec-wing-${uid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fae39c"/>
            <stop offset="55%" stop-color="#c98e2b"/>
            <stop offset="100%" stop-color="#5e3906"/>
          </linearGradient>
          <radialGradient id="ec-gem-${uid}" cx="36%" cy="32%" r="65%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="32%" stop-color="#ffe27a"/>
            <stop offset="78%" stop-color="#e07b08"/>
            <stop offset="100%" stop-color="#6e2902"/>
          </radialGradient>
        </defs>
        <!-- Sweeping Baroque Filigree Wings -->
        <path d="${leftWing}"
              fill="url(#ec-wing-${uid})" stroke="#241203" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="${rightWing}"
              fill="url(#ec-wing-${uid})" stroke="#241203" stroke-width="1.8" stroke-linejoin="round"/>
        <!-- Central 5-Ray Storybook Sovereign Crest -->
        <path d="M 42,27 L 38,14 L 50,19 L 54,7 L 61,16 L 66,2.5 L 71,16 L 78,7 L 82,19 L 94,14 L 90,27 Q 66,22 42,27 Z"
              fill="url(#ec-gold-${uid})" stroke="#241203" stroke-width="1.9" stroke-linejoin="round"/>
        <!-- Diadem Base Rim -->
        <path d="${baseRim}"
              fill="url(#ec-gold-${uid})" stroke="#241203" stroke-width="1.6" stroke-linejoin="round"/>
        <!-- Flanking Pearl Studs -->
        <circle cx="48" cy="24.5" r="2.1" fill="#fff6cf" stroke="#241203" stroke-width="1"/>
        <circle cx="84" cy="24.5" r="2.1" fill="#fff6cf" stroke="#241203" stroke-width="1"/>
        <!-- Central Faceted Sun-Diamond Jewel -->
        <polygon points="66,11.5 74.5,22 66,32.5 57.5,22" fill="#2b1403" stroke="#fff3bd" stroke-width="1.2" stroke-linejoin="round"/>
        <polygon points="66,13.8 72.5,22 66,30.2 59.5,22" fill="url(#ec-gem-${uid})"/>
        <polygon points="66,14.4 70.2,21.2 66,22.4 62.2,20.5" fill="#ffffff" opacity="0.65"/>
      </svg>
    `;
  }

  // 4. Unified Full-Shape Character Attack Badge (Faceted Amber-Gold Barbed Battle-Crest — Sibling to Blood-Drop!)
  function attackBadge(val, uid) {
    return `
      <svg class="svg-gem svg-stat-badge" viewBox="0 0 68 72" aria-hidden="true">
        <defs>
          <radialGradient id="atk-amber-${uid}" cx="36%" cy="34%" r="66%">
            <stop offset="0%" stop-color="#fff3b0"/>
            <stop offset="35%" stop-color="#f29b18"/>
            <stop offset="82%" stop-color="#9c4505"/>
            <stop offset="100%" stop-color="#4f1e02"/>
          </radialGradient>
          <linearGradient id="atk-gold-${uid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fae199"/>
            <stop offset="55%" stop-color="#be892d"/>
            <stop offset="100%" stop-color="#5c3b09"/>
          </linearGradient>
        </defs>
        <!-- Unified Full-Shape 3-Pointed Broadhead Battle-Crest with Plump Round Base -->
        <path d="M 34,4 C 40,15 49,20 61,20 C 57,28 59,36 59,45 C 59,59 48,68 34,68 C 20,68 9,59 9,45 C 9,36 11,28 7,20 C 19,20 28,15 34,4 Z"
              fill="url(#atk-gold-${uid})" stroke="#261405" stroke-width="2.4" stroke-linejoin="round"/>
        <!-- Inner Faceted Fiery Amber Gem -->
        <path d="M 34,11 C 39,19 46,23 55,23.5 C 52.5,30 54,37 54,45 C 54,56 45,63 34,63 C 23,63 14,56 14,45 C 14,37 15.5,30 13,23.5 C 22,23 29,19 34,11 Z"
              fill="url(#atk-amber-${uid})" stroke="#592603" stroke-width="1.6" stroke-linejoin="round"/>
        <!-- Facet Gleam & Specular Highlight Matching Blood-Drop -->
        <path d="M 34,11 C 39,19 46,23 55,23.5 L 34,36 L 13,23.5 C 22,23 29,19 34,11 Z" fill="#ffffff" opacity="0.2"/>
        <ellipse cx="25" cy="37" rx="5" ry="8.5" transform="rotate(-22 25 37)" fill="#ffffff" opacity="0.42"/>
        <text x="34" y="51" text-anchor="middle" class="svg-stat-num">${esc(val)}</text>
      </svg>
    `;
  }

  // 5. Unified Full-Shape Character Health Badge (Faceted Ruby Blood-Drop)
  function healthBadge(val, uid) {
    return `
      <svg class="svg-gem svg-stat-badge" viewBox="0 0 68 72" aria-hidden="true">
        <defs>
          <radialGradient id="hp-ruby-${uid}" cx="36%" cy="34%" r="65%">
            <stop offset="0%" stop-color="#ff8fa3"/>
            <stop offset="35%" stop-color="#dc1f3c"/>
            <stop offset="82%" stop-color="#7c091b"/>
            <stop offset="100%" stop-color="#42030d"/>
          </radialGradient>
          <linearGradient id="hp-gold-${uid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fae199"/>
            <stop offset="55%" stop-color="#be892d"/>
            <stop offset="100%" stop-color="#5c3b09"/>
          </linearGradient>
        </defs>
        <path d="M 34,5 C 46,20 60,30 60,45 C 60,59 48,68 34,68 C 20,68 8,59 8,45 C 8,30 22,20 34,5 Z"
              fill="url(#hp-gold-${uid})" stroke="#261405" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M 34,11 C 44,24 55,32 55,45 C 55,56 45,63 34,63 C 23,63 13,56 13,45 C 13,32 24,24 34,11 Z"
              fill="url(#hp-ruby-${uid})" stroke="#47040e" stroke-width="1.6"/>
        <ellipse cx="25" cy="36" rx="5" ry="9" transform="rotate(-22 25 36)" fill="#ffffff" opacity="0.42"/>
        <text x="34" y="51" text-anchor="middle" class="svg-stat-num">${esc(val)}</text>
      </svg>
    `;
  }

  // 6. Unified Full-Shape Building +Energy Crystal Badge
  function buildingEnergyBadge(val, uid) {
    return `
      <svg class="svg-gem svg-stat-badge" viewBox="0 0 68 72" aria-hidden="true">
        <defs>
          <radialGradient id="be-glow-${uid}" cx="38%" cy="32%" r="65%">
            <stop offset="0%" stop-color="#a8f2ff"/>
            <stop offset="40%" stop-color="#1ca0eb"/>
            <stop offset="85%" stop-color="#0d4482"/>
            <stop offset="100%" stop-color="#072145"/>
          </radialGradient>
          <linearGradient id="be-gold-${uid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fae199"/>
            <stop offset="55%" stop-color="#be892d"/>
            <stop offset="100%" stop-color="#5c3b09"/>
          </linearGradient>
        </defs>
        <polygon points="34,5 59,22 59,51 34,68 9,51 9,22"
                 fill="url(#be-gold-${uid})" stroke="#261405" stroke-width="2.4" stroke-linejoin="round"/>
        <polygon points="34,11 54,25 54,48 34,62 14,48 14,25"
                 fill="url(#be-glow-${uid})" stroke="#082854" stroke-width="1.6" stroke-linejoin="round"/>
        <polygon points="34,11 54,25 34,36 14,25" fill="#ffffff" opacity="0.24"/>
        <text x="34" y="47" text-anchor="middle" class="svg-stat-num" font-size="23">+${esc(val)}</text>
      </svg>
    `;
  }

  // 7. Unified Full-Shape Building Counter / Bastion Shield Badge
  function buildingCounterBadge(val, uid) {
    return `
      <svg class="svg-gem svg-stat-badge" viewBox="0 0 68 72" aria-hidden="true">
        <defs>
          <radialGradient id="bc-stone-${uid}" cx="36%" cy="32%" r="68%">
            <stop offset="0%" stop-color="#b5c7d9"/>
            <stop offset="45%" stop-color="#566b80"/>
            <stop offset="100%" stop-color="#222d38"/>
          </radialGradient>
          <linearGradient id="bc-gold-${uid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fae199"/>
            <stop offset="55%" stop-color="#be892d"/>
            <stop offset="100%" stop-color="#5c3b09"/>
          </linearGradient>
        </defs>
        <path d="M 10,12 L 58,12 L 58,39 C 58,54 46,64 34,68 C 22,64 10,54 10,39 Z"
              fill="url(#bc-gold-${uid})" stroke="#261405" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M 15,17 L 53,17 L 53,39 C 53,51 43,59 34,63 C 25,59 15,51 15,39 Z"
              fill="url(#bc-stone-${uid})" stroke="#1c252e" stroke-width="1.6"/>
        <ellipse cx="25" cy="28" rx="4.5" ry="7" transform="rotate(-20 25 28)" fill="#ffffff" opacity="0.32"/>
        <text x="34" y="49" text-anchor="middle" class="svg-stat-num">${esc(val)}</text>
      </svg>
    `;
  }

  return {
    factionPip,
    factionWatermark,
    energyGem,
    apDiamond,
    apZeroCircle,
    nameRibbon,
    eliteCrest,
    attackBadge,
    healthBadge,
    buildingEnergyBadge,
    buildingCounterBadge
  };
})();
