# MOBA Map & Entity Design (living doc, built via /grill-me)

## Visual style (locked)
- **Stylized, hand-painted 3D diorama, matching the heroes.** Terrain: a sculpted heightmap with painted tiling textures (grass, dirt path, stone, cliff) blended by hand-placed masks.
- **Set pieces and units** (towers, core, minions, camps, boss) are generated 3D models in the same painterly style (Hunyuan).
- **Scatter** (trees, rocks, bushes, grass): a small set of models instanced many times.
- **Architecture** (castle walls, gates, bridge): built in code from simple shapes with painted tiling textures, since generators handle huge modular structures poorly.
- **Lighting: warm late afternoon** (golden sun, long soft shadows, lush greens, warm stone). Lighting is all runtime parameters, so **time-of-day presets** (overcast, dusk, ...) can be a setting later. Keep model textures fairly neutrally lit so presets still work.
- **Architecture style: weathered old-world stone.** A sturdy, slightly crooked storybook castle: warm sandstone and gray stone, wooden beams, slate/terracotta roofs, ivy. **Both teams share the architecture**, told apart by team-colored banners.

## Layout (locked)
- **Mirror-symmetric, left vs. right.** Each team's castle sits on a plateau at one end.
- **Top lane:** a long stone bridge from one castle's upper gate to the other's, spanning a gorge.
- **Bottom lane:** the valley floor between the castles' side gates, reached by a gradual downhill.
- **Jungle:** the sloped woods between the lanes. The two jungles are split down the middle by a path from the bridge down to the valley. They should be slightly different from each other; detailed layouts come later.
- **Boss:** in the gorge beside the bridge's midpoint (true "under the bridge" would need a two-floor system; deferred).
- **Elevation:** gentle, look-only, via one `groundHeight(x, z)` function. Gameplay stays flat for now.

## Structures (locked)
Per team, per lane: **T1 tower → T2 tower → gatehouse**, then the **core** in the castle courtyard, plus the **fountain**. This is the current engine skeleton, re-skinned.
- **Tower (×8):** a squat, sturdy round stone watchtower with a **ballista on top that turns to track its target** and fires bolts, with team banners. The ballista is likely a separate piece so it can rotate.
- **Gatehouse (×4):** the castle gate itself (two stone towers flanking a wooden gate with a portcullis). **It doesn't attack.** Destroying it smashes the gate open and empowers that lane's minions. **The T2 tower stands just outside it**, covering the approach and the gate. Built in code with the castle walls (no credit).
- **Core (×2):** the castle's **great hearth**, a massive stone brazier/altar with an **eternal flame in the team's color** that **hurls fireballs**. When destroyed, the flame gutters out. One model; the flame color is code VFX.
- **Fountain:** respawn and heal, built in code.

## Minions (locked)
- **Animated armor:** empty suits of armor marching, glowing in the team color inside.
- **Two bodies:**
  - a **regular armor** for melee and ranged (weapons attached in code like hero props: melee = sword + shield, ranged = crossbow; Coyote's crossbow can stand in at first);
  - a **hulking armor** for the super minion.
- Team color is swapped in code (the glow).

## Jungle camps (locked)
- **3 creature types, shared by both jungles** (each jungle uses the same 3 types in a different layout). Each type is one rigged model reused on both sides; a "pack" camp is 2-3 smaller copies.
  1. **Bristle-backed boars:** a pack of 3, small and fast (low and wide silhouette).
  2. **Moss-and-rubble golem:** alone, big, slow and tanky, built from the castle's fallen stones (big and upright).
  3. **Thorn-wolves / bramble stalkers:** a pair, medium-sized ambushers (lean quadruped).
- **Boss: the gorge behemoth, "a hill that stood up".** A colossal ancient beast of its own species sleeping in the gorge beside the bridge; it **rises out of the moss** when disturbed (more intimidating than a wingless drake, which was considered and dropped). Hippo-like mass and a cavernous jaw lined with stalactite stone tusks, but its own silhouette: **huge gorilla-like front limbs it knuckle-walks on**, lower hindquarters, a **stone carapace that IS the mossy hillside** (moss, ferns, roots, standing ruin pillars), and a **fan-shaped stone frill** behind the head. **Three deep violet eyes per side** and violet light leaking from cracks in its hide (violet is the one glow not used by any hero or team; fallback: cold moonlight silver-white). Slaying it buffs the team (e.g. empowered minions or stats).
- **Rigging:** the boars, wolves and drake are quadrupeds, which Mixamo can't rig, so **we rig them ourselves** (method chosen once we see the models). The golem is a biped and goes through Mixamo.
- Avoid an ent-like camp monster (the treefolk hero owns that look).
