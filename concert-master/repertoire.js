/**
 * CONCERT MASTER — Built-in repertoire (shared by the game and the audit sandbox)
 */

// Setlist order = easiest -> hardest (by computed HARD rating). `wip: true` songs only appear in Rehearsal mode.
// `previewStart` (seconds) overrides the auto-picked looping preview window on Song Select.
export const BUILTIN_REPERTOIRE = [
  {
    id: 'sound-of-guthix',
    composer: 'Adam Bond',
    title: 'The Sound of Guthix',
    ensemble: 'RuneScape 3 · Orchestral Soundtrack',
    url: './audio/sound-of-guthix.ogg',
    sidecarUrl: './audio/sound-of-guthix.cadenza.json?v=cm49',
    previewStart: null,
  },
  {
    id: 'sevens',
    composer: 'Samuel R. Hazo',
    title: 'Sevens',
    ensemble: 'Symphonic Wind Ensemble · Reference Recording',
    url: 'https://s3.amazonaws.com/halleonard-audio/04002326.mp3',
    sidecarUrl: './audio/sevens.cadenza.json?v=cm49',
    previewStart: null,
  },
  {
    id: 'ride',
    composer: 'Samuel R. Hazo',
    title: 'Ride',
    ensemble: 'Symphonic Wind Ensemble · Reference Recording',
    url: 'https://s3.amazonaws.com/halleonard-audio/48007049.mp3',
    sidecarUrl: './audio/ride.cadenza.json?v=cm49',
    previewStart: null,
  },
  {
    id: 'what-we-do',
    composer: 'Michael Manning',
    title: 'What We Do',
    ensemble: 'RuneScape 3 · Orchestral Soundtrack',
    url: './audio/what-we-do.ogg',
    sidecarUrl: './audio/what-we-do.cadenza.json?v=cm49',
    previewStart: null,
  },
  {
    id: 'arabesque',
    composer: 'Samuel R. Hazo',
    title: 'Arabesque',
    ensemble: 'Symphonic Wind Ensemble · Reference Recording',
    url: 'https://s3.amazonaws.com/halleonard-audio/04002784.mp3',
    sidecarUrl: './audio/arabesque.cadenza.json?v=cm49',
    previewStart: null,
  },
  {
    id: 'jupiter',
    composer: 'Gustav Holst',
    title: 'Jupiter, the Bringer of Jollity',
    ensemble: 'United States Air Force Band · Wind Ensemble',
    url: './audio/jupiter.mp3',
    sidecarUrl: './audio/jupiter.cadenza.json?v=cm49',
    previewStart: null,
    wip: true,
  },
  {
    id: 'maslanka4',
    composer: 'David Maslanka',
    title: 'Symphony No. 4',
    ensemble: 'Wind Ensemble & Organ · Complete Performance',
    url: './audio/maslanka-symphony-4.mp3',
    sidecarUrl: './audio/maslanka-symphony-4.cadenza.json?v=cm49',
    previewStart: null,
    wip: true,
  },
];
