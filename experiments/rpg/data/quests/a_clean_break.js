// =====================================================================
// QUEST TEMPLATE: "A Clean Break"  (Novice, standalone, non-combat)
// ---------------------------------------------------------------------
// Pitch (user): A friendly alien in the starting settlement's cleaning
// robot broke down. It needs <mined material> and <harvested material>
// to fix, and the local market won't get its shipment for another week.
// Find the resources and bring them back for a modest Mining + Foraging
// XP reward, a bit of cash, and a bit of rep.
//
// TEMPLATE CONVENTIONS (first draft of the quest schema; the engine will
// formalize these in Milestone 1):
//   - {slot} tokens in any string are filled at placement time from `slots`.
//   - `cast` members are authored; the engine spawns them at `spawn` anchors.
//   - `steps` is a linear state machine (0 = not started). `journal` text is
//     what the RS-style quest journal shows for the current step.
//   - `dialogue` nodes: { speaker, lines[], options?[], next?, actions?[] }.
//     `entry` picks the first node based on quest step + conditions.
//   - `actions`: startQuest, setStep, takeItems, giveRewards, completeQuest,
//     playAnim, playSfx. Conditions: hasItems, step.
//   - `quirkLines`: optional flavor keyed by planet-quirk tag; falls back to
//     `default` when the planet has none of the listed quirks.
// =====================================================================

export default {
  id: 'a_clean_break',
  title: 'A Clean Break',
  tier: 'novice',
  series: null,
  reputation: 1,

  // ---- Placement (quests adapt to the world, never the reverse) ----
  placement: {
    planet: 'starter',            // must be the spawn planet
    anchor: 'outpost.starter',    // the starter outpost
    preferences: [],              // no soft preferences; always placeable
  },

  // ---- Setting slots (filled by the seed) ----
  slots: {
    outpost:   { from: 'outpost.name',                   fallback: 'the outpost' },
    planet:    { from: 'planet.name',                    fallback: 'this rock' },
    ore:       { from: 'planet.resources.mining.tier1',  fallback: 'Bismuth Ore' },
    fiber:     { from: 'planet.resources.foraging.tier1', fallback: 'Bristle Reed' },
    oreQty:    { value: 4 },
    fiberQty:  { value: 3 },
    market:    { from: 'outpost.shop.name',              fallback: 'the Exchange' },
    quirk:     { from: 'planet.quirks[0].nounPhrase',    fallback: 'the weather' },
  },

  // ---- Authored ensemble ----
  cast: {
    zuzu: {
      name: 'Madame Zuzu Prell',
      body: 'blob_alien',
      tint: '#8ee3c8',
      accent: '#f7a8d8',
      scale: 1.0,
      accessories: ['floral_apron', 'reading_goggles'],
      voice: { kind: 'blip', pitch: 1.35, wobble: 0.25 },  // bubbly, warbly
      spawn: { anchor: 'outpost.starter.plaza', offset: [2.5, 0, 1.0] },
      personality: 'Relentlessly cheerful retiree with six arms and opinions about grout. Treats her robot like a beloved grandchild.',
    },
    dustin: {
      name: 'Dustin',
      body: 'robot_small',
      tint: '#d9dde3',
      accent: '#ffcf4a',
      scale: 0.6,
      accessories: ['mop_attachment', 'tiny_bowtie'],
      voice: { kind: 'blip', pitch: 0.7, wobble: 0.0, bitcrush: true },
      spawn: { anchor: 'outpost.starter.plaza', offset: [3.6, 0, 0.4] },
      idleAnim: { before: 'broken_twitch', after: 'happy_sweep' },
      personality: 'A cleaning robot with the soul of a butler. Currently stuck repeating one word.',
      interactable: true,
    },
  },

  // ---- Steps & journal ----
  steps: [
    {
      id: 0,
      journal:
        'I can start this quest by speaking to Madame Zuzu Prell in the plaza of {outpost}.\n' +
        'There are no requirements.',
    },
    {
      id: 1,
      journal:
        "Madame Zuzu's cleaning robot, Dustin, has broken down, and {market} won't have parts for another week.\n" +
        'I should gather {oreQty} {ore} and {fiberQty} {fiber} and bring them back to her.',
      objectives: [
        { kind: 'haveItem', item: '{ore}',   qty: '{oreQty}' },
        { kind: 'haveItem', item: '{fiber}', qty: '{fiberQty}' },
      ],
    },
    {
      id: 2,
      journal:
        'I brought Madame Zuzu the parts and Dustin is back to full sparkle.\n' +
        'QUEST COMPLETE!',
    },
  ],

  // ---- Rewards ----
  rewards: {
    reputation: 1,
    xp: [
      { skill: 'mining',     amount: 150 },
      { skill: 'foraging',   amount: 150 },
    ],
    credits: 75,
    items: [],
    unlocks: [],
  },

  // ---- Planet-quirk flavor (optional, graceful fallback) ----
  quirkLines: {
    spore_fog:   "Ever since the spore fog rolled in, he's been gargling every hour. I think something finally took root.",
    low_gravity: "He hit a bump in the plaza and drifted onto the roof for two days. He hasn't been right since.",
    tidal:       'He tried to mop the tide back out. Bless him, he really believed he could.',
    default:     "I think {quirk} finally got into his gears. Poor dear's been through so much.",
  },

  // ---- Dialogue ----
  dialogue: {
    entry: [
      { when: { step: 0 },                                    node: 'intro' },
      { when: { step: 1, hasItems: ['{ore}x{oreQty}', '{fiber}x{fiberQty}'] }, node: 'return_ready' },
      { when: { step: 1 },                                    node: 'reminder' },
      { when: { step: 2 },                                    node: 'after' },
    ],

    // Clicking DUSTIN directly
    entryByCast: {
      dustin: [
        { when: { step: 0 }, node: 'dustin_broken' },
        { when: { step: 1 }, node: 'dustin_broken' },
        { when: { step: 2 }, node: 'dustin_fixed' },
      ],
    },

    nodes: {
      // ---------------- Step 0: Intro ----------------
      intro: {
        speaker: 'zuzu',
        lines: [
          "Oh! A new face! Hello, hello, welcome to {outpost}! Mind the floor, it hasn't been mopped in three days and I'm SO embarrassed.",
        ],
        next: 'intro_2',
      },
      intro_2: {
        speaker: 'dustin',
        lines: ['SPARKLE. SPARKLE. SPARKLE. SPAR-', '*bonk*'],
        actions: [{ playAnim: { cast: 'dustin', anim: 'broken_twitch' } }, { playSfx: 'clank' }],
        next: 'intro_3',
      },
      intro_3: {
        speaker: 'zuzu',
        lines: [
          'That\'s Dustin. Short for Dustbin, but he hates that. He\'s been walking into that same pillar since Tuesday.',
          '@quirkLine',   // engine substitutes the matching quirkLines entry
        ],
        next: 'intro_options',
      },
      intro_options: {
        speaker: 'player',
        options: [
          { text: 'What does he need to get fixed?', next: 'intro_need' },
          { text: "Have you tried turning him off and on again?", next: 'intro_offon' },
          { text: "Sorry, I'm busy.", next: 'intro_decline' },
        ],
      },
      intro_offon: {
        speaker: 'zuzu',
        lines: [
          "Dear, I have six arms. I tried turning him off and on again with all of them at once.",
          'He just said "sparkle" in a deeper voice.',
        ],
        next: 'intro_need',
      },
      intro_need: {
        speaker: 'zuzu',
        lines: [
          "His scrubber housing is cracked and his brush roll is threadbare. I'd need {oreQty} {ore} to patch the housing, and {fiberQty} {fiber} to re-bristle him.",
          "Normally I'd just pop over to {market}, but they say their shipment's been delayed a WEEK. A week! The dust will have unionized by then.",
        ],
        next: 'intro_ask',
      },
      intro_ask: {
        speaker: 'zuzu',
        lines: ["You look like the outdoorsy type. Could you possibly find some for me? I'd make it worth your while!"],
        next: 'intro_accept_options',
      },
      intro_accept_options: {
        speaker: 'player',
        options: [
          { text: "Sure, I'll find the parts.", next: 'intro_accept' },
          { text: 'Not right now.', next: 'intro_decline' },
        ],
      },
      intro_accept: {
        speaker: 'zuzu',
        lines: [
          'Oh, you absolute treasure! {ore} turns up in the rocky bits around here, and {fiber} grows wild just outside the walls.',
          "Dustin, say thank you to the nice drifter.",
        ],
        actions: [{ startQuest: true }, { setStep: 1 }],
        next: 'intro_accept_dustin',
      },
      intro_accept_dustin: {
        speaker: 'dustin',
        lines: ['SPARKLE.'],
        next: 'intro_accept_end',
      },
      intro_accept_end: {
        speaker: 'zuzu',
        lines: ["He means it from the bottom of his little heart. Probably."],
      },
      intro_decline: {
        speaker: 'zuzu',
        lines: ["Oh, of course, of course. Dustin and I will just be here. Bonking."],
        actions: [{ playAnim: { cast: 'dustin', anim: 'broken_twitch' } }, { playSfx: 'clank' }],
      },

      // ---------------- Step 1: Reminder (missing items) ----------------
      reminder: {
        speaker: 'zuzu',
        lines: [
          "Any luck, dear? Remember: {oreQty} {ore} and {fiberQty} {fiber}.",
          "No rush! He's only walked into the pillar forty more times since you left.",
        ],
      },

      // ---------------- Step 1: Turn-in ----------------
      return_ready: {
        speaker: 'zuzu',
        lines: ["Is that {ore}? And {fiber}! Oh, you've done it! Hand them over, hand them over!"],
        actions: [
          { takeItems: [{ item: '{ore}', qty: '{oreQty}' }, { item: '{fiber}', qty: '{fiberQty}' }] },
        ],
        next: 'repair',
      },
      repair: {
        speaker: 'narrator',
        lines: [
          "Madame Zuzu rolls up all six sleeves and disappears into Dustin's chassis up to her elbows. All of her elbows.",
          '*clank* *whirr* *a short, polite scream*',
        ],
        actions: [{ playSfx: 'repair' }],
        next: 'repair_done',
      },
      repair_done: {
        speaker: 'dustin',
        lines: [
          'SYSTEMS NOMINAL. GOOD AFTERNOON, MADAME.',
          'SCANNING VISITOR... SCANNING... OH DEAR. YOUR BOOTS.',
        ],
        actions: [{ playAnim: { cast: 'dustin', anim: 'happy_sweep' } }],
        next: 'repair_boots',
      },
      repair_boots: {
        speaker: 'narrator',
        lines: ['Dustin zips across the plaza and scrubs your boots to a mirror shine before you can object.'],
        next: 'reward',
      },
      reward: {
        speaker: 'zuzu',
        lines: [
          "Listen to him! Good as new! Here, take this for your trouble. It isn't much, but I insist.",
          "And if anyone in {outpost} gives you grief, you tell them Zuzu vouches for you.",
        ],
        actions: [{ setStep: 2 }, { giveRewards: true }, { completeQuest: true }],
      },

      // ---------------- Step 2: After ----------------
      after: {
        speaker: 'zuzu',
        lines: [
          "Dustin hasn't hit that pillar once since you helped. Well, once. But he apologized to it.",
        ],
      },

      // ---------------- Dustin direct-click ----------------
      dustin_broken: {
        speaker: 'dustin',
        lines: ['SPARKLE. SPARKLE. SPARK-', '*bonk*'],
        actions: [{ playAnim: { cast: 'dustin', anim: 'broken_twitch' } }, { playSfx: 'clank' }],
      },
      dustin_fixed: {
        speaker: 'dustin',
        lines: [
          'GREETINGS, BOOT FRIEND. YOUR FOOTWEAR REMAINS AT 94% SPARKLE.',
          'I AM ALLOWING IT.',
        ],
      },
    },
  },
};
