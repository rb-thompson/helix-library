# Night Moth — Tight, Fun, Worth Looking At

| Field | Value |
| --- | --- |
| **Document** | Craft season — play-feel, HUD, lighting, moth, lamps |
| **Author** | Graphic design + game-dev review of owner-captured frames |
| **Date** | 2026-08-18 |
| **Status** | **Shipped** on `ship-grade/presence` (2026-08-19). Roofs perch; menus share the gold cabinet. |
| **Evidence** | 12 screenshots in `~/Downloads/Night Moth/` (2026-08-18 12:48–12:52) |
| **Audience** | Senior implementers on `ship-grade/presence` |
| **Non-goals** | New abilities, new bosses, new districts, Sketchfab pipeline, genre change |
| **Related** | `src/components/arcade/night-moth/*`, `src/lib/arcade/night-moth/*` |

This is not a feature list. The game already has more verbs than the picture can support. This season makes the existing fantasy **readable, juicy, and honest**.

---

## Evidence log (what the frames actually show)

Frames in capture order. Claims below are only from these pixels plus the current HUD/camera code.

| # | File (time) | Surface | What is on screen |
| --- | --- | --- | --- |
| 1 | 12-48-38 | Title | Moon + painted cloud (good). World underexposed to silhouettes. Helix card in the optical center. Four equal buttons. Body copy is a systems paragraph. Tiny XP telemetry. |
| 2 | 12-48-52 | Field guide (scrolled) | Spec dump. `"Pollen bombLocked · 880 XP"` and `"Helix spiralLocked"` smashed. BOON/BANE/FOE/FRIE pills collide with body. No pictures. Keybind line missing spaces (`M plays.F8`). |
| 3 | 12-49-02 | Cabinet | Only menu that looks like a game. `"HIGH SCORES"` printed twice. Two `0` rows (`N1 · 0:11`, `N1 · 1:05`). Back is a Helix ghost button. |
| 4 | 12-49-14 | Settings | Brightness **2.20 / 2.20**. World still black. Station titles are catalog filenames + `[id].m4a`. Duplicate title lines. `"Game"` / `"Music"` unlabeled as volumes. |
| 5 | 12-49-34 | Play, lamp | **Moth clipped through a blown-out white lamp.** HUD: `UNCERTAIN LIGHT` + `E — DRINK THIS LAMP`. Terminal: `"The grounds are open."` Hint: `CLICK TO LOCK LOOK` while airborne. Three-panel chrome ~¼ of the frame. Wing bar is red at full. |
| 6 | 12-49-50 | Play, court | Moth is two beige rectangles. Court is a dark slab, four dim lamps, a flat blue canal. `"11 true lamps still lit"` is the only objective. |
| 7 | 12-50-16 | Play, moon | Best picture in the set (moon). Wing **19 / 100**, score 199, combo ×4, nectar 0. Dying is a 4 px sliver. Lamp card talks about a light that is not in frame. Hint still `CLICK TO LOCK LOOK`. |
| 8 | 12-51-00 | Play, lamp from above | Lamp silhouette is a martini/desk lamp (good). Court is empty dirt + four posts + hedge. Still `UNCERTAIN LIGHT` on an obviously warm Circulation shade. |
| 9 | 12-51-19 | FX | Gold coin-sparkles. Moth missing from frame. `"Scale dust 0.7"`. Lamp card still 21 m / uncertain. Wing still 19. |
| 10 | 12-51-41 | Play, water/crops | Neon-green strips, neon-blue water, one lamp. Compass still `CIRCULATION COURT`. Friend specks unreadable. |
| 11 | 12-52-22 | Play, Ward | Identical dark boxes, yellow window dots, three leftover gold FX clusters. No moon rim on roofs. No street from this height. |
| 12 | 12-52-31 | Pause | Same Helix modal as title. Full HUD still live underneath. Copy is good (`Still air`). |

### Code facts that match the frames

- Pointer-lock hint is honest: `NightMothHud` shows `"Click to lock look…"` whenever `!snap.pointerLocked`. Frames 5–12 are playing with lock **off**. Drag-look exists; the HUD never upgrades.
- Camera is a hard offset `look * -8.2 + (0, 2.15, 0)` with no occlusion test (`engine.ts` `tickFlight`). That is how the moth ends up inside a lamp in frame 5 and missing in frame 9.
- Lamps are not in `buildingColliders()`. Building brick is solid. Lamps are air. Frame 5 is the result.
- Wing fill is `.nm-bar-fill.is-hp` — red at every value. Full health reads as danger. Critical health is a thinner red line.
- Only four `PointLight`s are enabled (perf pass). Moon is a sky sprite, not a key light on the mesh. Brightness 2.20 cannot invent bounce that was never shaded.

---

## Diagnosis (five structural failures)

### 1. The world is unlit, not “too dark in settings”

Frame 4 maxes exposure. Frames 5–12 stay black with emissive stickers. The moon is a photograph pasted on the sky; it does not key the buildings. Lamps are either invisible or a blown bloom. A brightness slider is not a lighting model.

Night games that work are **luminous with a short palette** (warm key, cool fill, one accent). This image has luminosity on the moon plate and on lamp sprites, and nowhere else.

### 2. The HUD is a developer overlay sitting on a visor

Every play frame carries: compass, lamp card, radar, three-panel console (vitals + terminal + arts/radio), and a hint line.

The same fact is said three times. Frame 7: compass `NW · Circulation court`, lamp card `14M · FLY CLOSER`, terminal `Circulation court 14m NW`.

The one fact that should scream — wing 19 — is a 4 px bar. Combo `×1` and `NO CONDITIONS` are empty calories. The arts dock is still teaching Scale dust after 199 points.

This is not “add a better font.” This is **too many truth-tellers, none of them the moth’s body**.

### 3. The core verb is unsupported by the picture

The fantasy is *judge the light*. The HUD says `UNCERTAIN LIGHT` / `Watch the pulse. Color lies.` The model is a white bloom or a 20-pixel martini. Pulse is not readable at play distance. Color is a halo, not a shade. A senior designer will say: **you shipped a reading-the-HUD game and called it a seeing-the-world game.**

### 4. The moth is a cardboard prop that phases

Two beige quads and a box. The silhouette in frame 6 is the only character beat in the set. Frame 5 puts that silhouette *through* the lamp. Frame 9 loses the moth entirely during the only FX beat. There is no translucency, no scale pattern, no antenna read, no contact with the thing you are drinking.

### 5. Menus are the library; play is a greybox

Title, settings, pause = Helix desk cards. Field guide = jammed spec. Cabinet = the one object with game identity, then it lists 0-score runs. The Ward (frame 11) is a field of identical boxes. The court (frames 6, 8) is an empty pad. Water is a flat blue plane. Scale dust is coin sparkles that linger as world clutter.

The systems pass (districts, collision, fauna, events) is under this picture. The camera cannot see it.

---

## What “fun / tight / good to look at” means for *this* game

Do not change the genre. Do not add a skill tree. Do not start a Sketchfab import season.

| Word | Means here | Test (next screenshot must show) |
| --- | --- | --- |
| **Fun** | I see a lamp, I can guess if it is honest, drinking kicks, dusting looks like scales, dying panics me, I want to skim the canal again | A still where a lamp is readable at 15 m without opening the field guide |
| **Tight** | One objective, one prompt, moth never inside geometry, camera never inside a bloom, HUD only speaks when it knows something, lock-look either works or is not required | A 10-second clip with no `CLICK TO LOCK LOOK` while flying, no 0-score cabinet rows |
| **Good to look at** | Moon keys the roofs. Moth has a translucent wing and a thorax. Water holds a reflection. Lamps have a shade, a stem, a pulse. FX is ochre scale, not gold coins | Frame 11 reshot: Ward roofs have a cool rim; windows are warm; moth is in frame |

---

## Plan (ordered by what the next screenshot will prove)

Work is four PRs. Each PR is a reshoot of the same twelve beats. If the reshoot does not change the frame, the PR is not done.

### PR1 — Honesty (camera, lock, collision, HUD lies)

**Why first.** Frame 5 is a ship-blocker. Nothing we paint later survives a moth inside a lamp and a HUD that says “lock look” while you fly.

1. **Lamp colliders.** Treat lamp stems/shades as solid (or at least a 1.2 m exclusion). Drinking is adjacency, not intersection.
2. **Camera collision.** Sphere-cast or step the camera in from `look * -8.2` if the segment hits world or a lamp. Never let the lens enter a bloom. Keep the moth in the lower third, not clipped.
3. **Pointer lock is a first-class path.** On Linux/Chrome, lock often fails. If lock is off, treat drag-look as the real scheme and **change the hint** to “drag to look · click the canvas to lock.” If lock is on, never show the lock hint. The current binary is correct in code and wrong in the captured session because lock stayed off for the whole test.
4. **Stop triple-reporting.** Lamp card XOR terminal XOR compass for distance. Compass keeps heading + region. Lamp card keeps the *one* action (`E drink` / `fly closer`). Terminal keeps events and sips only — not a second compass.
5. **Kill empty calories.** Hide combo when `≤ 1`. Hide `NO CONDITIONS`. Hide nectar `0` or show it as a pip, not a column. Do not teach Scale dust after it has been fired this run.
6. **Cabinet.** Do not write score `0`. Do not show `0` rows.
7. **Critical wing.** Below 30: fill goes bright, visor edge tints, a short pulse. Red is for *low*, not for *any HP*. Full wing is amber/ivory, not danger-red.

**Reshoot:** frames 5, 7, 9, 12. Pass if moth is never inside a lamp, dying is obvious, pause does not leave a lying hint.

### PR2 — Light (the picture)

**Why second.** Frame 4 already proved the slider is done. Paint with lights that exist.

1. **Moon is a key, not a decal.** A directional (or the existing `moonKey`, raised) aimed from the moon sprite. Cool rim on Ward roofs and moth wing-tops. This is one light. It is allowed.
2. **Ground bounce.** Hemisphere already exists; raise the ground color so dirt/canal read. Contact shadow under the moth (a blob decal or cheap circle) so it sits on the court.
3. **Lamp lighting budget stays at 4**, but the *selected / nearest* lamp always wins a slot, and its intensity is a **pulse**, not a blowout. Shade mesh stays visible; the bloom sprite is a halo, not the lamp.
4. **Water.** Dark glass + a single reflection probe or a planar reflection of the moon and nearest lamp. Fish stay. The canal must not read as a painted bike lane (frames 6, 8, 10).
5. **Ward from above (frame 11).** Moon rim on the top faces. Window emissive stays warm. A slightly darker street/asphalt so the grid reads at altitude. Do not add more buildings.
6. **Exposure default.** After real lighting, default brightness back near `1.2`. 2.20 is a cry for help.

**Reshoot:** frames 1, 6, 8, 10, 11. Pass if a still of the Ward is a *place* at 2.20 and at 1.2.

### PR3 — The moth and the lamps (the toys)

**Why third.** Fun is the toys. The toys are currently cardboard and a bloom.

1. **Moth, not a paper airplane.** Keep the voxel language. Add: translucent wings (double-sided, slight emissive vein), a thorax with a visor glint, antennae that read at the current camera distance, a flap that is visible in a still (asymmetric pose, not a flat T). This is `buildMoth`, not a GLTF season.
2. **Lamps that can be judged at 15 m.** Each kind already has a tell in `catalog.ts`. Push that tell into the **silhouette**: Circulation = warm cone shade; Cage = grid; Furnace = irregular mouth; Wisp = moving core; False moon = too-round disc; Off-beat = amber that *skips*. Pulse is in the shade emissive, not only in a sprite. `UNCERTAIN LIGHT` is for *unknown*, not for “we never taught the model to speak.”
3. **Known vs unknown is a glance.** Unknown = you see the physical tell, HUD stays quiet or says only range. Known-true / known-lure tints the reticle, not a paragraph.
4. **Scale dust is scales.** Ochre flakes with a short life, motion along the shot, no lingering gold clusters (frame 11). Sip FX is a warm inhale into the moth, not a generic burst.
5. **Do not fly through the drink.** Sip plays a 0.3 s hold on the shade; the moth’s head is near the bulb, not inside it.

**Reshoot:** frames 5, 8, 9. Pass if a designer can name Circulation vs Cage from a 15 m still with the HUD cropped out.

### PR4 — Menus and the field guide (the jacket)

**Why last.** Play is the product. Menus should not look like `/services`.

1. **Title.** One primary: Begin flight. Field guide / scores / settings as text links. Kill the systems paragraph; one line: *Not every lamp is Circulation.* Let the moon and a posed moth be the art. XP line can stay, smaller, after the buttons.
2. **Pause.** Dim and mute the play HUD. Same one-primary rule. Keep `Still air`.
3. **Settings.** Label volumes `Game volume` / `Music volume`. Show holding **title**, not filename + youtube id. Fix the smashed hotkey legend.
4. **Field guide.** Pictures. Lamp row with the actual shade. Ability rows with a key chip, a lock state that is not glued to the name (`Helix spiral` / `Locked · 1100 XP`). Space between pill and sentence. This is a jacket insert, not `catalog.ts` printed.
5. **Cabinet.** One `HIGH SCORES` label. No zero rows. Back button in the orange language, not Helix ghost.

**Reshoot:** frames 1–4, 12.

---

## Explicit non-cuts (corners seniors will watch)

Do **not** “fix the look” by:

- Bumping exposure again. Frame 4 closed that ticket.
- Adding more HUD. The overlay is the problem.
- Adding more entities, arts, or events. The court is empty of *meaning*, not of systems.
- Importing Sketchfab / MagicaVoxel this season. New mesh language on an unlit stage will still look like a blob. Light and silhouette first; hero meshes after these four PRs if the stills still fail.
- Going visor-FPS and hiding the moth. Frame 6 is the only character beat you have.
- Removing collision, height, districts, or the radio. Those are load-bearing. They are just invisible.
- Turning on more than four point lights to “make it pretty.” Moon key + emissive + four pulses is the budget.

---

## Chain of reasoning (three passes)

### Pass A — If we only shipped PR1, is the game more honest?

Yes. The moth stops phasing. The camera stops eating lamps. The dying state is visible. The HUD stops lying about lock and stops repeating the compass. The cabinet stops logging zeroes. A senior will still say it looks like a prototype, but they will not say it is *broken*. Fun requires honesty first; juice on a clipped moth is a lie.

### Pass B — If we ship PR2 without PR3, did we cut the wrong corner?

No. Lighting is the cheapest way to make frame 11 a city and frame 8 a court. Toys (moth/lamp meshes) without light will still photograph as cardboard. The risk is spending PR2 on extra props; the plan forbids that. One moon key, one bounce, one water read, nearest-lamp pulse. If a reviewer asks “where are the new assets?” the answer is “they were not the bottleneck.”

### Pass C — Playability of the full stack

Core loop after all four PRs, as a player:

1. Title is a night and a moth. One button.
2. Click-to-lock *or* drag-look; the hint matches the device.
3. Court is moonlit. A Circulation shade is a cone you can read. You fly to it. You do not enter the bulb. E drinks. The moth inhales. Wing and nectar move. Terminal says the sip line once.
4. A cage is a grid. You do not need the card to distrust it. Click throws ochre scales that die.
5. Wing hits 19: the visor knows. You look for a reading lamp because the *model* is copper and aimed down.
6. Pause hides the chrome. Cabinet has no zeroes.
7. A Ward flyover is roofs with moon on the tin and warm windows, not a black heightfield.

If any PR is skipped, skip **PR4** first (menus), never PR1. If two must ship, **PR1 + PR2**. PR3 is the fun. PR4 is the jacket.

### Pass D — “Would I fail this in a studio playtest?”

I would fail the current build on: (1) player intersecting the interactable, (2) unreadable core verb, (3) critical health as a 4 px bar, (4) HUD as a debug layer, (5) lighting that does not exist. I would not fail it on missing spiders, missing Sketchfab, or missing a sixth ability. The plan is written to clear those five fails and nothing else.

---

## Implementation map (no new frameworks)

| Concern | Touch |
| --- | --- |
| Lamp / camera collision | `engine.ts` `tickFlight`; lamp AABBs next to `nearbyColliders` |
| Pointer-lock copy | `NightMothHud.tsx` hint; optionally a one-shot “click canvas” toast |
| HUD diet | `NightMothHud.tsx`, `.nm-console*` in `globals.css` |
| Wing critical | HUD + `.nm-bar-fill.is-hp` + a `.nm-hud.is-critical` edge |
| Score 0 | `logRun` / `submitScore` guard |
| Moon key + bounce | `engine.ts` constructor lights; maybe `buildSky` only as aim target |
| Water | `habitat.ts` material + a reflection or fake moon sprite in the canal |
| Moth mesh | `buildMoth` in `voxels.ts` |
| Lamp silhouettes | `buildLamp` in `voxels.ts`; pulse already in `animateLamps` |
| Scale dust | `launchDust` / particles color + life; reap leftover sprites |
| Title / pause / settings / guide | `NightMothGame.tsx`, `NightMothRadio.tsx`, `ArcadeCabinet.tsx` |

Verification: `npm test` (rules + prefs + board). Manual: reshoot the twelve beats at `127.0.0.1:4747/arcade/night-moth`. Compare against this document, not against memory.

---

## Open questions (do not block PR1)

- **OQ1.** If pointer lock is chronically denied on this machine, should default look be “hold RMB to look” instead of drag-on-canvas? PR1 can ship the honest hint either way.
- **OQ2.** Third-person distance: keep ~8 m (current) or pull to ~6 m so the moth is a character in every still? Recommend **6.2 m** after camera collision exists.
- **OQ3.** After PR3, is `UNCERTAIN LIGHT` still the default, or do we show the physical name (`Desk lamp`) and keep alignment hidden? Recommend **physical name + hidden alignment** so the model does the judging.

Owner can answer OQ1–OQ3 in passing. They do not gate the honesty PR.
