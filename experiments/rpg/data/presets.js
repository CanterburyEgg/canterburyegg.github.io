// Character creator presets: six frontier archetypes, each a complete look (slider units,
// see js/character_look.js). Names are drafts; veto freely.
export const PRESETS = [
  {
    id: 'prospector', name: 'Prospector', blurb: 'Knows every rock by its first name.',
    look: {
      body: 'male', height: 98, weight: 20, muscle: 35, shoulders: 108, neck: 72, head: 104, hair: 'buzz', beard: true,
      face: { jaw: 40, chin: 20, cheeks: -10, brow: 45, nose: 30, width: 20, eyeColor: '#5a3a22', lipColor: '#8a5a50' },
      outfit: { sleeves: 'elbow', neck: 'crew', hem: 'full', layer: 'vest', pants: 'full', boots: 'tall', gloves: true },
      colors: { skin: '#c79270', hair: '#4a3020', shirt: '#b5835a', layer: '#5a4a3a', pants: '#3a4a5a', belt: '#2e2620', boots: '#3a3028', gloves: '#6b5a48' },
    },
  },
  {
    id: 'botanist', name: 'Botanist', blurb: 'Talks to plants. Some of them talk back.',
    look: {
      body: 'female', height: 96, weight: -30, muscle: -20, bust: 15, lift: 55, shoulders: 96, neck: 82, head: 106, hair: 'long', beard: false,
      face: { jaw: -30, chin: -10, cheeks: 30, brow: -20, nose: -20, width: -10, eyeColor: '#3a5a3a', lipColor: '#b06a66' },
      outfit: { sleeves: 'long', neck: 'scoop', hem: 'full', layer: 'none', pants: 'capri', boots: 'short', gloves: false },
      colors: { skin: '#f1d3b8', hair: '#a8642e', shirt: '#6f8a5a', layer: '#6b4f36', pants: '#c9b79c', belt: '#4a3a2a', boots: '#5a4a3a', gloves: '#6b5a48' },
    },
  },
  {
    id: 'mechanic', name: 'Mechanic', blurb: 'Fixes it with whatever is in reach.',
    look: {
      body: 'female', height: 102, weight: 10, muscle: 45, bust: 0, lift: 50, shoulders: 110, neck: 76, head: 102, hair: 'buns', beard: false,
      face: { jaw: 15, chin: 10, cheeks: 10, brow: 10, nose: 0, width: 10, eyeColor: '#2a2a2a', lipColor: '#8a5a50' },
      outfit: { sleeves: 'tank', neck: 'crew', hem: 'full', layer: 'none', pants: 'full', boots: 'tall', gloves: true },
      colors: { skin: '#8a6248', hair: '#1a120c', shirt: '#d8c070', layer: '#6b4f36', pants: '#3a4a5a', belt: '#2a2d34', boots: '#2a2d34', gloves: '#3a3028' },
    },
  },
  {
    id: 'courier', name: 'Courier', blurb: 'Always early. Never explains how.',
    look: {
      body: 'male', height: 106, weight: -45, muscle: 10, shoulders: 100, neck: 80, head: 102, hair: 'parted', beard: false,
      face: { jaw: -10, chin: 30, cheeks: 40, brow: 0, nose: -10, width: -20, eyeColor: '#6a8aa0', lipColor: '#9a4a44' },
      outfit: { sleeves: 'long', neck: 'turtle', hem: 'full', layer: 'jacket', pants: 'full', boots: 'short', gloves: false },
      colors: { skin: '#e3b38f', hair: '#d8b878', shirt: '#e6e2d8', layer: '#8f5a5a', pants: '#2a2d34', belt: '#2e2620', boots: '#3a2a2a', gloves: '#6b5a48' },
    },
  },
  {
    id: 'hermit', name: 'Hermit', blurb: 'Came out here to be alone. It went well.',
    look: {
      body: 'male', height: 94, weight: 45, muscle: -10, shoulders: 98, neck: 70, head: 108, hair: 'none', beard: true,
      face: { jaw: 20, chin: -20, cheeks: -30, brow: 60, nose: 55, width: 30, eyeColor: '#7a6a4a', lipColor: '#6a3a36' },
      outfit: { sleeves: 'long', neck: 'v', hem: 'full', layer: 'vest', pants: 'full', boots: 'short', gloves: false },
      colors: { skin: '#b98a68', hair: '#9a9a9a', shirt: '#8a6f5a', layer: '#5f7d6e', pants: '#5a4a3a', belt: '#3a3028', boots: '#4a3a2a', gloves: '#6b5a48' },
    },
  },
  {
    id: 'surveyor', name: 'Surveyor', blurb: 'Has a map of the place. It is mostly question marks.',
    look: {
      body: 'female', height: 104, weight: -10, muscle: 15, bust: 35, lift: 60, shoulders: 102, neck: 78, head: 104, hair: 'buzzSoft', beard: false,
      face: { jaw: 0, chin: 15, cheeks: 20, brow: 20, nose: 10, width: 0, eyeColor: '#5a3a22', lipColor: '#a05a5a' },
      outfit: { sleeves: 'short', neck: 'v', hem: 'full', layer: 'jacket', pants: 'full', boots: 'tall', gloves: false },
      colors: { skin: '#5e4030', hair: '#2a1d14', shirt: '#4f6a8a', layer: '#c9b79c', pants: '#5f7d6e', belt: '#2e2620', boots: '#3a3028', gloves: '#6b5a48' },
    },
  },
];
