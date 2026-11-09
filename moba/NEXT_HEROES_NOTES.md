# Remaining 3 Heroes — Concept Notes (paused 2026-11-07)

Status: design interview **complete**. ✅ All 6 concept PNGs generated (2026-11-07) and saved to the paths in the table below. Next step: Hunyuan 3D for the 3 heroes, Tripo for the 3 props, then Mixamo.

Budget for today's 3D quota: 2 fully textured models + 1 untextured model (matches the 3 heroes).

## Existing pipeline (how the 5 finished heroes were built)
1. Concept A-pose image → `assets/<id>/<id>_concept.png` (style reference: [panther_concept.png](assets/panther/panther_concept.png), [coyote_concept.png](assets/coyote/coyote_concept.png) — stylized painterly hand-painted MOBA look, flat gray or white background, front view, strict ~45° A-pose, empty open hands)
2. Hunyuan 3D → `<id>_raw.glb` + `<id>_texture.jpg`
3. `<id>_mixamo.zip` → Mixamo auto-rig → `mixamo/` clips (snake_case)
4. Packed into `assets/<id>/<id>_bundle.js` (`window.<HERO>_MIXAMO = { diffuseDataUrl, ... }`)
5. Registered in the loader list in `arena3d.html` (~line 4850) and specs/talents in `js/phase1_data.js` (`HERO_SPECS`, `HERO_TALENTS` — currently only 5 heroes)
- Props follow Coyote's pattern: `crossbow_prop.png` → `crossbow_3d_prop.glb` → embedded as `crossbowGlbB64`, mounted to a pivot that follows the hand bone (`crossbowPivot` in `arena3d.html`).

## 1. Little Fairy (`fairy`) — Support • Ranged Enchanter
- Petite enchanter, **wingless in the base GLB** (wings added later procedurally in Three.js as translucent planes on the Spine2 bone so Mixamo doesn't weight them to the wrists)
- Small Tinkerbell-style pixie dress in **leaf-and-starlight colors**, cleavage, exposed legs
- Flowing pastel hair
- Tinkerbell-style leaf slippers with tiny glowing pom-poms at the toes
- **Bare-handed** — no wand/prop
- Theme colors from config: `#34d399` (emerald) / `#7dd3fc` (sky)

## 2. Cannon Imp (`cannon`) — Solo • Siege & Salvage
- Scrappy **crimson/copper-skinned devil-imp bombardier**: short, stocky humanoid biped, curved horns, pointed ears, brass blast-goggles on forehead, soot-stained leather bombardier vest + shorts, heavy boots, soot-smudged grin
- **Unarmed and tail-free** (a tail risks Mixamo reading it as a leg)
- Theme colors: `#fb923c` / `#fde047`
- Props (separate, user will build in **Tripo** from concept PNGs):
  - **Siege Cannon** — carried on RightHand; placed on the ground as the Q: Anchor Turret; R: Superball fires from wherever it is
  - **Heavy Wrench** — melee weapon when unburdened

## 3. Saw Scientist (`scientist`) — Jungle • Physical Brawl
- Wiry, unhinged **male Arcane/Zaun-style alchemist-surgeon**: wild spiky hair, glowing green brass surgical goggles, fitted **waist-length** leather butcher/lab vest with rolled sleeves (legs fully unobstructed for Mixamo), glowing emerald potion vials on belt, heavy rubberized gloves and boots
- Empty hands in the A-pose
- Theme colors: `#10b981` / `#f59e0b`
- Prop (Tripo): **Handheld Motorized Chem-Buzzsaw** — brass housing, glowing green chem-vial fuel cell, oversized serrated circular blade up front. The weapon stays in hand; Three.js spawns a detached spinning blade disc for Q: Whirling Buzzsaw and R: Boomerang Blade.

## To generate when the queues are back (6 images)
| # | Image | Save to |
|---|---|---|
| 1 | Little Fairy A-pose | `assets/fairy/fairy_concept.png` |
| 2 | Cannon Imp A-pose | `assets/imp/imp_concept.png` |
| 3 | Saw Scientist A-pose | `assets/scientist/scientist_concept.png` |
| 4 | Siege Cannon prop (3/4 view, gray bg) | `assets/imp/props/cannon_concept.png` |
| 5 | Heavy Wrench prop | `assets/imp/props/wrench_concept.png` |
| 6 | Chem-Buzzsaw prop | `assets/scientist/props/saw_blade_reference.png` |

## Prop implementation decisions (2026-11-07)
- **Siege Cannon:** one rigid Tripo GLB, no disassembly or rig. Carried bazooka-style over the right shoulder at ~60% scale, attached to the RightHand bone the same way `crossbowPivot` works. On Q: Anchor it detaches into the world, drops in front of the Imp, pops to full scale with a smoke puff, turns its whole body toward targets and recoils along the barrel when firing. Swapped for a scrap-pile mesh when destroyed. Q again or walking over the scrap re-attaches it to the hand.
- **Chem-Buzzsaw:** Tripo builds the **blade-less** body (`buzzsaw_body_prop.png`). The sawblade is code-built in Three.js (toothed metal disc made with ExtrudeGeometry, plus an emissive green rune ring). It spins on the gun's hub during attacks, orbits him for Q: Whirling Buzzsaw, and flies out and back for R: Boomerang Blade.
- **Little Fairy wings:** procedural translucent planes on the Spine2 bone.

## Open questions to settle later
- ✅ DECIDED: **Today (2026-11-07): Little Fairy + Saw Scientist** get the 2 fully textured models and are implemented. **Tomorrow: Cannon Imp** gets the untextured model and is finished then.
- Which hero gets the **untextured** model slot today? (Suggestion: Cannon Imp, since its look is mostly solid skin/leather and easy to hand-texture.)
- The 3 new heroes also need `HERO_SPECS` + `HERO_TALENTS` entries in `phase1_data.js` and loader entries in `arena3d.html`.
