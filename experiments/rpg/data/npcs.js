// Authored NPCs (non-quest) + ambient townsfolk data. Plain names, no hyphens.

export const QUARTERMASTER = {
  id: 'quartermaster',
  name: 'Quartermaster Bell',
  body: 'humanoid',
  tint: '#4f6a8a',
  accent: '#ffcf4a',
  skin: '#d9b48f',
  scale: 1.05,
  accessories: ['cap', 'clipboard'],
  voice: { pitch: 0.95, wobble: 0.05 },
  // Faceted-human look (character_look.js): a tall, tidy officer in issue blue with a yellow vest.
  human: {
    body: 'male', height: 108, weight: 15, muscle: 0, shoulders: 104, neck: 76, head: 104, hair: 'parted', beard: true,
    face: { jaw: 25, chin: 15, cheeks: 0, brow: 30, nose: 20, width: 10, eyeColor: '#5a3a22', lipColor: '#8a5a50' },
    outfit: { sleeves: 'long', neck: 'crew', hem: 'full', layer: 'vest', pants: 'full', boots: 'tall', gloves: false },
    colors: { skin: '#d9b48f', hair: '#9a9a9a', shirt: '#4f6a8a', layer: '#e0b640', pants: '#3a4a5a', belt: '#2e2620', boots: '#2a2d34', gloves: '#6b5a48' },
  },
  dialogue: {
    entry: [
      { when: { notFlag: 'qm_kit' }, node: 'qm_intro' },
      { when: {}, node: 'qm_after' },
    ],
    nodes: {
      qm_intro: {
        speaker: 'quartermaster',
        lines: [
          'New arrival? Wonderful. The manifest says... {player}. Paperwork first.',
          "Sign here, here, and... there. Congratulations, {player}, you're now legally a drifter.",
        ],
        next: 'qm_kit',
      },
      qm_kit: {
        speaker: 'quartermaster',
        actions: [{ requireFreeSlots: 4, failNode: 'qm_full' }, { giveItems: ['bismuth_pick', 'bismuth_hatchet', 'bismuth_sickle', 'bismuth_machete'] }, { setFlag: 'qm_kit' }],
        lines: [
          'Standard issue: one Bismuth Pick, one Bismuth Hatchet, one Bismuth Sickle.',
          "And a Bismuth Machete. The Skarl out past the fences don't read the safety notices. Click it to wield it.",
          "Please return them in the condition you found them. Which, I'll be honest, was 'questionable.'",
        ],
        next: 'qm_kit_end',
      },
      qm_kit_end: {
        speaker: 'quartermaster',
        lines: ["Rocks get the pick, trees get the hatchet, reeds get the sickle. Anything that stings, buy gloves. Off you go."],
      },
      qm_full: {
        speaker: 'quartermaster',
        lines: ["Your pockets are full. I can't issue equipment into a full inventory. Regulations. Mostly my back."],
      },
      qm_after: {
        speaker: 'quartermaster',
        randomLine: true,
        lines: [
          'Lost your tools? The shop sells replacements. I only do the first set. Budget.',
          "Launch permits are at the pad. Yes, there's a form. There's always a form.",
          'Bismuth chips if you look at it wrong. Swing gently.',
          "If anyone asks, I've been here the whole time and I definitely didn't nap.",
        ],
      },
    },
  },
};

// Humanoids: plain human-ish names. Unique first AND last names within a settlement.
export const FIRST_NAMES = [
  'Odo', 'Mira', 'Tam', 'Juno', 'Pell', 'Rook', 'Ines', 'Bram', 'Sela', 'Hollis', 'Wren', 'Cato', 'Nell', 'Dace', 'Lio', 'Marlo',
  'Yara', 'Fen', 'Gus', 'Teo', 'Ada', 'Orla', 'Quin', 'Abel', 'Bette', 'Cyril', 'Dora', 'Edda', 'Felix', 'Greer', 'Hugo', 'Iris',
  'Jory', 'Kit', 'Lena', 'Milo', 'Nico', 'Opal', 'Percy', 'Rosa', 'Silas', 'Tova', 'Ugo', 'Vera', 'Walt', 'Xan', 'Yves', 'Zelda',
  'Arlo', 'Bea', 'Cass', 'Dex', 'Elsie', 'Flint', 'Gemma', 'Hal', 'Ivo', 'June', 'Knox', 'Lark', 'Mabel', 'Ned', 'Otto', 'Pia',
];
export const LAST_NAMES = [
  'Vance', 'Quill', 'Harrow', 'Moss', 'Teague', 'Brindle', 'Cole', 'Fairweather', 'Pike', 'Rusk', 'Salt', 'Thorne', 'Wick', 'Ashby',
  'Penn', 'Barlow', 'Crane', 'Dunmore', 'Ellery', 'Finch', 'Gale', 'Holt', 'Ingram', 'Jessup', 'Keel', 'Lowry', 'Marsh', 'Nash',
  'Orme', 'Prior', 'Reeve', 'Stroud', 'Tull', 'Upton', 'Voss', 'Wilder', 'Yates', 'Abbot', 'Bligh', 'Carver',
];
// Blob aliens: generated from soft syllables (one or two names).
export const ALIEN_SYLLABLES = { start: ['Zu', 'Bo', 'Qua', 'Lu', 'Mo', 'Ploo', 'Gri', 'Vee', 'Oo', 'Thu', 'Nim', 'Wub', 'Ey', 'Sko'], end: ['zu', 'bo', 'la', 'mi', 'rr', 'pp', 'nk', 'th', 'oo', 'ee', 'l', 'sh'] };
// Small robots: friendly one-word names (real words).
export const ROBOT_NAMES = ['Sprocket', 'Pip', 'Rivet', 'Dot', 'Ferris', 'Widget', 'Spindle', 'Bolt', 'Tinker', 'Button', 'Socket', 'Nib', 'Gasket', 'Coil', 'Ratchet', 'Tuppence'];

export const AMBIENT_TINTS = ['#8a6f5a', '#5f7d6e', '#7a5f8a', '#a0805a', '#5a6f8f', '#8f5a5a', '#6f8a5a', '#9a8a70', '#4f7a8a', '#b07a5a'];
export const AMBIENT_ACCENTS = ['#ffcf4a', '#e8e2cf', '#3fd0ff', '#ff8a6a', '#b8f0c8', '#e0a8ff'];
export const SKINS = ['#e8c9a8', '#d9b48f', '#b98a68', '#8a6248', '#f0d8c0', '#a8c8b8', '#c8b8e0'];

export const ROLE_QUIPS = {
  shopkeeper: [
    'Everything here is gently used. Very gently. Mostly.',
    'Prices are fair. Fair to me, anyway.',
    "If it's shiny, I'll buy it. If it's sticky, we need to talk first.",
    'No refunds on gloves. You know why.',
  ],
  clerk: [
    "Your locker is the same locker on every planet. Don't ask how. Legal won't let me say.",
    'Deposits welcome. Withdrawals tolerated.',
    "I've seen what people keep in these lockers. I've seen things.",
  ],
  local: [
    "You're new. I can tell because you're still clean.",
    "My cousin went to the outer rim once. Came back with a hat. Wouldn't talk about the hat.",
    'Lovely day. Probably. Hard to say with this sky.',
  ],
};

// Lines that mention something specific: only said where that thing exists (see planetFeatures in main.js).
export const FEATURE_QUIPS = {
  lake: ["Don't drink from the lake. Or do. I'm not your supervisor."],
  bridges: ["Watch the bridges. They're fine. I just like saying it."],
  sweeper: ["If you see a small robot sweeping, say hello. He's very polite."],
  tower: ['The relay tower hums a little song at night. Nobody admits to programming it.'],
};

export const QUIRK_QUIPS = {
  spore_fog: ['Mind the spore fog. It gets in your teeth.', "I haven't seen the far ridge in three weeks. I'm told it's still there."],
  low_gravity: ['Tie your boots tight. Last week someone sneezed and ended up on the roof.', 'Everything weighs less here. Except responsibility.'],
  tidal_shores: ['Tide goes out, tide comes in. Keep your stuff above the line.', 'The beach is twice as big at low tide. So is the smell.'],
  endless_dusk: ["Been sunset for eleven years. I've stopped finding it romantic.", 'Your shadow is very long here. Try not to trip on it.'],
  twin_moons: ['Two moons and no sun. You get used to it. I mostly have.', 'The little moon is my favorite. Keep that between us.'],
  magnetic_storms: ['When the sky goes green, hold onto anything metal. Or let go of it. I forget which.', 'Storm season is every season.'],
  ash_fall: ["Ash on everything. My tea's mostly ash at this point.", 'Brush off before you come inside. Please. I beg you.'],
  singing_crystals: ['Hear that humming? Crystals. They get louder when you find something new.', "I tried singing back once. They didn't like it."],
};
