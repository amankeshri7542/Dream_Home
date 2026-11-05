# P1: real at eye level, the working plan

The goals and "done when" lines are in [`COMPETITIVE-V6.md`](COMPETITIVE-V6.md). This is how the owner's "implement it, make it premium" (5 Nov 2026) gets built, in light of what the code does today and the [bench's gaps](screenshots/bench/baseline/GAPS.md).

## Where it stands (6 Nov 2026)

**Paused at the owner's word.** The first stage below is finished; nothing further starts until the owner has given the details of the features they want to add. This plan then gets extended with them.

| Step | State |
|---|---|
| P1.7 Floors | **Done,** bar the owner's eye and the fresh critic. Marble, terrazzo, wood and vitrified are rewritten. Floors sharpen to twice the texture size once you walk in, made between frames so nothing freezes |
| P1.1 World outside | **Done,** bar the same. Neighbouring homes, trees, poles, wires, clouds, and glass you can see through |
| P1.3 Room light | **Done,** bar the same and a real phone. The spike passed the kill rule side by side, so the fallback isn't needed |
| Sheen on polished floors | **Partly.** A soft sheen towards the light is in. A real blurred reflection of the window isn't |
| P1.2 Model on the plan | Not started |
| P1.6 Quiet walk | Not started in the app. A draft small plan is set aside (below) |
| P1.4 Close-up kit | Not started in the app. Draft curtains and remodelled pieces are set aside (below) |
| P1.5 Reel goes inside | Not started |
| Fresh critic against the baseline | Not run. It belongs after the kit, so the judgement is of the whole look |

**Not measured yet:** how any of this runs on a real phone (P0.2). A floor's full light solve took 28–48 ms on the owner's Mac. The limit of 150 ms assumes a phone is about four times slower, which is still a guess.

**Set aside, not in the app:** a git stash called `P1 drafts: curtains, small plan, remodelled furniture`. It holds `src/scene/life/drapes.ts`, `Drapes.tsx`, `src/explore/MiniPlan.tsx` and the Blender edits to the sofa, bed, lamps, fan, side table and plants. None of it has been run, rendered or tested, and the two app parts still need code that doesn't exist yet (`surface` in `patchMaterial`, `requestRoom` in `walkInput`). Restore it with `git stash list`, then `git stash apply`.

## What to add next: the owner's phases (6 Nov 2026)

The owner sent five phases: interior detailing, furniture realism, walk polish, day and night, and product. **Nothing below is built yet.** It starts with Phase 1.1 and 1.2 when the owner says "continue". This section maps each item onto today's code, from a read of the files, so nothing already there is rebuilt.

**Naming:** the owner's numbers are kept as they are (Phase 1 … 5, 1.1, 3.4 …). The v6 items above are always written with their prefix (v6 P1.2 and so on), so the two can't be confused.

### Decisions (6 Nov, night)

The owner handed over ("handle everything from here … build everything"), so the agent went with its recommendations below. Each can be reversed in the morning.
- **D1 gallery: not built.** The owner had ruled it out earlier, and the new prompt itself says to flag a clash like this rather than override it. It waits for the owner's explicit word.
- **D2 "SEO Bot": not built.** It isn't known what it is.
- **D3 false ceilings:** as recommended. On by default for living, dining and bedrooms in Indian modern, Mumbai modern and Bengaluru contemporary; off elsewhere; anyone can switch it per room.
- **D4:** v6 P1.6 goes into Phase 3, and v6 P1.4 into Phase 2. v6 P1.2 and P1.5 come after the owner's phases, if there's time.

### Decisions the owner was asked to make

| # | Question | Why | Recommendation |
|---|---|---|---|
| D1 | **Reopen the public gallery?** Phase 5 asks for `/gallery`. | The owner ruled it out: "Share links only, no public gallery" (ROADMAP Decisions, 15–17 Oct), "Not in scope: … a public gallery" (PLAN-V5), "this plan doesn't reopen them" (COMPETITIVE-V6). Share pages are deliberately `noindex`, the copy promises "Anyone with the link can see this home", and the server keeps no index of shares at all. | **Keep it out until there's a reason.** If it's wanted: opt-in per home (off by default), a list the owner curates (one KV key), a new name (the ready-made homes screen is already called "gallery" in the app), and a `/gallery` rewrite in `vercel.json`. |
| D2 | **What is "SEO Bot"?** | Nothing in the repo or docs by that name. There's no SEO work at all: no robots.txt, no sitemap, no structured data. | Tell me what it is. Indexing only makes sense for the landing page and a gallery, never for private share links. |
| D3 | **Which homes get a false ceiling by default?** The prompt says "default true for Indian-style looks". | A POP false ceiling with cove light is a modern, urban Indian finish. Kerala, Chettinad and Goan homes traditionally have timber or plain ceilings. | **On by default** for living, dining and bedrooms in Indian modern, Mumbai modern and Bengaluru contemporary. **Off** in kitchens, bathrooms and the traditional looks (Indian classic, Kerala, Chettinad, Rajasthani, Goan), and in homes with no Look. Anyone can switch it per room. |
| D4 | **Where do the unfinished v6 items go?** v6 P1.2 (model on the plan) and P1.5 (reel goes inside) aren't in the new list. v6 P1.6 (quiet walk) and v6 P1.4 (close-up kit) overlap Phases 3 and 2. | They were the owner's plan until now. | Merge v6 P1.6 into Phase 3 and v6 P1.4 into Phase 2. Do v6 P1.2 and P1.5 after Phase 4, before Phase 5. |

Smaller adjustments, flagged here rather than made silently:
- **Pointer lock (3.5)** only in Walk, never in "Look around" (that's an orbit, and lock would break it). It turns on from a click on a "Use mouse to look" control, not on entering Explore: browsers only allow it from a click, and a click on the scene already means "walk here".
- **No extra fill light (Phase 4).** A shadowless fill shines through walls; that's why it's off indoors now. Interior warmth comes from the room light instead (below).
- **AO (Phase 4) already exists.** Screen-space AO (N8AO) runs on the balanced and beautiful tiers and in every photo. The battery tier uses AO strips, and room light now darkens corners on its own. So Phase 4 only checks the "corners darker" acceptance and tunes it, rather than adding a pass.
- **Head bob (3.1) is for live walking only.** The reel keeps no head bob, as v6 P1.5 says. Bob is off with reduced motion. The browser tests run with reduced motion on, so its maths gets a unit test instead.

### How each phase maps onto the code

**Phase 1: interior detailing**

| Item | What exists | What's new | Files |
|---|---|---|---|
| 1.1 Layered materials | Floor (`Room.floorMaterial`, 17 materials) and walls (`Room.wallColor`, 12 paints, accent wall) are separate already, with Look palettes. **No ceiling material:** a room's ceiling is the next slab, and in Walk a single `WalkCeiling` in one fixed white | A ceiling finish per room. Floor grout that starts from the room's own walls, as a tiler lays it, instead of from world zero. Paint with a little roller-scale variation. Sheen tuned: stone glossy, wood and cement matte | `domain/types.ts`, `materials.ts`, `looks.ts`, `persist.ts`, `share/parse.ts`; `scene/building/geometry/floors.ts`, `materials/textures.ts` and `palette.ts`; the Walk ceiling; `roomlight/input.ts`; `shell/studio/DecoratePanels.tsx` |
| 1.2 False ceiling | Nothing. The nearest are the pendant light, ceiling fan and the room light's fallback tube light | `Room.falseCeiling`, a cove light, downlights and a centre mount | as 1.1, plus a new `scene/building/geometry/ceiling.ts` |
| 1.3 Trim | **Mostly there:** 8 cm skirting, 2 cm reveal linings at full wall depth, 7 cm architraves, inside sills (3 cm thick, 3.5 cm proud), window frames 7 cm deep, lintels, thresholds. All merged per floor | Crown moulding where there's a false ceiling. Door architraves 4–5 cm deep instead of 2 cm, and deeper inside sills (10 cm) | `scene/building/geometry/walls.ts` |
| 1.4 Flooring | Done in v6 P1.7 (above) | Grout alignment and sheen, folded into 1.1 | — |

**Phase 2: furniture and props.** This is v6 P1.4 with the owner's additions.
- **Cloth and wood surfaces:** generated weave and grain maps (no downloads), applied by slot in `parseKit` through a new `surface` option in `patchMaterial`.
- **Slight asymmetry:** in the Blender kit (cushions off-centre, one leg different), so it costs nothing at run time.
- **Soft rug and furniture shadows:** gradient-alpha planes in the existing AO material.
- **Curtains, three plant species, soft clutter:** in `src/scene/life/`, as asked. The stashed drafts are the start.
- **Collision bounds:** already in the catalog (`blocksWalk`), so Phase 3.4 needs no new data.
- **Outside:** compound wall, gate, driveway and garden all exist (`props/fence.ts`, `site.ts`, `Plot.tsx`). The work is replacing the toy picket gate the critic named and the blob plants.

**Phase 3: walk polish**

| Item | Where it goes | Watch out for |
|---|---|---|
| 3.1 Head bob | `Walkthrough.tsx` `useFrame`: distance from `moved` (line ≈248), applied to the camera only, never to `pos` | Keep asking for frames until it settles, then stop (the idle tests) |
| 3.2 Acceleration ramp | A pure `ramp()` in `walkPhysics.ts`, with unit tests; used at the speed line (≈214) | The same idle rule |
| 3.3 Sprint FOV punch | Inside `useFrame`; it snaps back to exactly 68 | `explore.spec.ts` expects FOV 68. The exit restore is separate, so they don't fight. A photo taken mid-sprint uses the base FOV |
| 3.4 Furniture colliders | `buildColliders(project, floorId, blockers)` already takes rectangles. Feed it `blocksWalk` pieces (quarter-turn only, so axis-aligned) via `resolveFurniture` and `furnitureFootprint` | Solid pieces, not outlines, so nobody spawns inside a bed. Spawn, Walk into a room, and tap-to-walk must still work. The bench's hand-picked corners skip unsticking |
| 3.5 Pointer lock | Desktop Walk only, from an explicit control; Esc releases; `movementX/Y` with today's sensitivity | Headless browsers can't lock: the fallback is today's drag |
| 3.6 Turn micro-offset | `useFrame`, from the change in yaw since last frame (drag changes yaw outside the frame) | Off with reduced motion |
| 3.7 Tests | `walkPhysics.test.ts` (ramp, solid furniture, unstick edges); the spec that already presses W stays | — |
| v6 P1.6 merged in | The sun chip, front-door entry, small plan with a blue dot, tap a room to go there (draft in the stash) | ≥ 44 px targets, 320 px with Extra large text |

**Phase 4: day and night**
- **A date scrubber.** Today the date is one of four seasons, only in the Sunlight sheet, and the Explore slider is hour only. Add a continuous day-of-year control beside the hour, in the Sunlight sheet and the Explore time panel. `sunDate` is already derived in `SceneHost`; it becomes a real value. The environment map rebuilds once per day value, so the hour and day are debounced.
- **Interior warmth:** cooler daylight in the morning, warm lamplight in the evening (about 6500 K to 2700 K). Room light already takes the sky's colour; this adds a colour temperature to the lamps and the cove, and the white balance stops undoing all of it. Uses `solar.ts`, no new sun maths.
- **Acceptance:** 6 am to 8 pm visibly moves the light and its warmth (a bench strip of 6 hours), and corners are darker than open floor (sampled in the room-light grid).

**Phase 5: product**
- **Share link first open: a real gap found.** Nothing shows until the share data arrives; only then does the 3D start to download. PLAN-V5 promised the poster at once. Fix: show the poster from its known address straight away, start the data fetch and the 3D chunk together, and add a time-to-3D check to `share.spec.ts`. Remix is already the main button.
- **Gallery:** waiting on D1 and D2.
- **The no-key planner:** it already places rooms, honours Vastu zones when asked, and undoes any step that breaks a home essential. It has no adjacency rules beyond the attached bathroom, and it never scores itself with `vastuReport`. Add adjacency preferences (kitchen near dining, bedrooms away from the entrance, pooja facing east or north-east), a proportion check (no 24 ft × 9 ft corridors, the critic's note), and keep the best-scoring variant. Tests set a minimum Vastu and proportion score on the ten test briefs. No AI involved.
- **Before and after:**
  - **Live:** an Empty / Furnished toggle (press and hold on phones) in the viewer and Explore. It flips `furnishings` and `livedIn`: one flag, no second render, so it stays within 160 draw calls.
  - **Photo:** a "Before and after" picture made of two offline renders joined half and half, the same mechanism as v6 P1.2's half-plan framing.

### Progress on the owner's phases

| Phase | State |
|---|---|
| 1.1 Layered materials | **Done (6 Nov):** `Room.ceiling` (4 finishes, from the Look by default), floor tiles laid from each room's inner corner, roller-scale paint variation, sheen tuned, and the Colours tab shows the Look's choices |
| 1.2 False ceiling | **Done (6 Nov):** `Room.falseCeiling` (D3 defaults); band, step, cove lip and glow, downlights, rose and crown moulding, in the room light too. Night walk draw calls fell from 143 to 104, because the old fake pools and lamp pool give way to room light |

### Order of work

As the owner set it, with the gate and a report after each phase:
1. **1.1 and 1.2,** below.
2. 3.1, 3.2 and 3.3.
3. 3.4.
4. 1.3, plus 1.4 (grout and sheen).
5. Phase 2.
6. 3.5, 3.6 and v6 P1.6.
7. Phase 4.
8. v6 P1.2 and P1.5 (if D4 is agreed).
9. Phase 5.

### Phase 1.1 in detail: a ceiling of its own, floors laid properly, walls with life

1. **The model.**
   - A new saved field `Room.ceiling?: CeilingFinishId`, absent meaning "from the Look".
   - The finishes, in `materials.ts`, each with a 2D-plan colour:
     - `white-plaster` (today's `#f4f0e8`, the default)
     - `ivory-pop` (smooth POP, `#f1e9da`)
     - `teak-panel` (Kerala and Chettinad)
     - `board-concrete` (Bengaluru contemporary)
   - The resolver `roomCeiling(room, look)` and the setter `setRoomCeiling(project, floorId, roomId, id | "auto")` go through `editRoom` → `finalizeEdit`, labelled "Ceiling: Teak panels".
   - The id is added to the `persist.ts` check (line ≈189) and copy (≈251), `registerValidation`, the lenient share parser, and the `schema.test.ts` key list. `parseProject` needs nothing more: it spreads `copyRoomExtras`.
2. **Looks.** Each Look palette gets a `ceiling`. Teak in Kerala and Chettinad living rooms, board concrete in Bengaluru contemporary, ivory POP elsewhere.
3. **Drawing it.** The Walk ceiling becomes per room: one merged mesh with each room's colour and its own texture family, still one draw call. The room light uses each room's ceiling colour, so a teak ceiling warms the walls below it.
4. **Floors.** Each room's floor UVs start a whole tile at the room's inner edge, centred on the room as a tiler would, so grout lines meet the skirting cleanly instead of at random. Tile sizes stay as v6 P1.7 set them. Sheen: marble, vitrified, red oxide and Athangudi keep a soft reflection; kota and limestone are honed; wood, carpet and concrete are matte.
5. **Walls.** The paint texture gets roller-scale variation (±2–3 % over a metre or so) on top of its grain, so a wall in even light isn't one flat colour.
6. **UI.** The room's Colours tab: "Walls & floor" becomes "Walls, floor & ceiling", with a Ceiling row of swatches. The paint and floor swatches also show the Look's choice as selected (today they show the default, a small bug found while mapping).
7. **Tests:**
   - Unit: the resolver per Look; set, undo and redo; save and load; the share parser drops an unknown id; floor UVs start a whole tile at a room's edge.
   - Browser: choose a ceiling, see it stored and undo it, at 360 and 390 px and with Extra large text.
   - Build ≤ 90 and Explore ≤ 160 draw calls are unchanged.
8. **Done when:** the bench's living room and bedroom show the room's own ceiling and clean grout lines.

### Phase 1.2 in detail: a false ceiling with cove light

1. **The model.** A new saved field `Room.falseCeiling?: boolean`, absent meaning "from the Look" (D3).
   - Resolver: `roomFalseCeiling(room, look)`.
   - Setter: `setRoomFalseCeiling`, through `finalizeEdit`, labelled "False ceiling on" or "False ceiling off".
   - Saving: added to `persist.ts`, validation and the share parser, as in 1.1.
2. **The shape** (pure, in `scene/building/geometry/ceiling.ts`). The usual Indian POP ceiling:
   - **Bulkhead:** a band 18 cm below the slab, 45–60 cm wide (narrower in small rooms) round the room.
   - **Centre:** the middle stays at slab height, so there's a step.
   - **Cove:** a 3 cm lip with a warm LED strip (`#ffd9a0`) on top, lighting the upper ceiling.
   - **Downlights:** recessed in the band, about every 1.2 m.
   - **Mount:** a ceiling rose at the centre for the fan, pendant or a chandelier.
   - **Fit:**
     - Any side where a door, window or curtain rod would reach above the band's underside skips that stretch.
     - Pieces mounted on the ceiling (fan, pendant) keep their clearance; checked against `mountY`.
     - Rooms under 2.4 m in either direction get only a plain drop ceiling, with no centre step.
3. **Drawing it.**
   - The band, lip and rose join the per-floor Walk ceiling mesh.
   - The LED strip and downlight discs are one more emissive mesh: +1 draw call while walking (143 → 144 measured at night), none in Build.
   - Dollhouse views never show ceilings, so Home, Room and Build don't change.
4. **Light.** Room light learns two new sources:
   - the cove, as thin strips glowing up on to the centre;
   - the downlights, as small spots pointing down.

   Both come on when the lamps do, with the warmth from Phase 4 later. The room's box uses the centre height; the band is close enough to the slab not to matter for the bounce.
5. **Crown moulding** (from 1.3) runs where the walls meet the band: a small cove-profile cornice in the joinery bucket, so no new draw call.
6. **UI.** A switch in the Colours tab: "False ceiling with cove light", with a one-line hint "Seen when you walk inside". It's undoable; a voice tool can come later.
7. **Tests:**
   - Unit:
     - the band stays inside the room and clears every opening's head;
     - a small room gets a plain drop;
     - the default follows the Look, and switching it saves and undoes;
     - the room light gets the cove and downlight sources only when the lamps are on.
   - Browser: switch it on, walk in at night, find the cove mesh; draw calls ≤ 160; Build idle at 0 frames.
8. **Done when** (the owner's acceptance test): on the bench, a furnished living room at golden hour and at night, with the false ceiling, cove light, skirting and door trim, reads as finished. Judged by eye, then by the fresh critic after Phase 2.

## Why today's rooms look like a game

Reading the renderer, not the pictures:

1. **Nothing lights a room but flat ambient.** Inside, a wall gets the hemisphere light, a blurred sky map and, if it's lucky, the sun through the window. So every wall is the same khaki, the ceiling has no gradient, and corners only darken through screen-space AO. This is gaps 1 and 7, and it's why colours look muddy.
2. **Furniture has no surface.** Kit pieces are one colour per slot with baked AO, so wood, cloth and steel differ only in roughness.
3. **The floor textures are noise iso-lines at 256 px,** repeating every 1.2 m.
4. **Windows look at nothing,** because the world stops at the plinth.
5. **Night windows glow from every side,** because the glow is on the glass itself.

## Build order

Each step is committed, pushed and checked against the bench. The steps not marked done above are still the plan unless the owner's new features change the order.

| Step | What | How | Kill or fallback |
|---|---|---|---|
| **P1.7** | Floors | New marble, terrazzo, wood and vitrified generators: slab-by-slab, veins that drift rather than close into contours, muted chips, longer tiles. Floors get twice the texture size | Keep the old generator for any floor that doesn't win |
| **P1.1** | World outside | A pure `neighbourhood` module (seeded by the plot) makes neighbouring homes, compound walls, trees, poles and wires, and the road running on past the plot. Merged into a few draw calls. Shown at eye and street level; Home and Room keep the clean plinth | Fewer houses if draw calls or triangles are over budget |
| **P1.3** | Room light | See below | The plan's kill rule: hand-tuned room ambience |
| **P1.2** | Model on the plan | The home's own drawing (`buildPlanSvg`) on the plinth, plus a *Plan to home* framing and a screen-space tilt-shift | Owner's eye |
| **P1.6** | Quiet walk | Sun chip, door entry, small plan with a blue dot, tap a room to go there | |
| **P1.4** | Close-up kit | Cloth and wood detail in the shader first, because it lifts every piece at no download cost. Then remodel the worst offenders in Blender, add curtains and swinging doors | Keep the old kit on the battery tier |
| **P1.5** | Reel goes inside | A pure `walk` shot in `path.ts`, with the speed and clearance rules as tests | Keep today's reel if phones can't film it in 90 s |

Then a fresh-context critic judges the new bench against the baseline.

## Room light

**The idea:** a room is a box with rectangular openings, so light in it can be worked out exactly rather than ray traced. It costs one texture lookup per pixel and recomputes only when the home or the hour changes.

**The module** (`src/scene/roomlight/`: `solve.ts` and `input.ts` are pure, `uniforms.ts` holds the shader, `RoomLight.tsx` keeps it in step):

1. **Surfaces.** Each room's six faces are cut into patches. Each patch knows its colour (`facePaint`, the floor material, the ceiling).
2. **Light in.** Each window sees sky and the ground outside. Direct sun through a window is projected onto the floor and walls, and those lit areas become sources.
3. **Bounces.** Two or three gathering passes between patches, using the exact form factor for two rectangles' corners. Open doors pass light to the next room. So a ceiling takes colour from the floor, and a sunlit floor warms the whole room.
4. **Lamps.** At night, each lamp is a small source in its room, and `interiorLamps` no longer needs its cap of one per room for this.
5. **The grid.** For each cell, sum the *irradiance vector* over every source (Lambert's closed form for a polygon) into an **ambient cube**: the exact light on a surface facing each axis, which is what walls, floors and ceilings are. So the window side of a sofa is brighter than its back, the wall holding the window stays darker than the wall facing it, and a corner darkens by itself. The first try stored one colour and a direction instead, and it put a false halo round every window. Cells inside walls copy the nearest room's value, so a lookup nudged along the normal can't leak light through a wall.
6. **A photographer's exposure and white balance.** Each room moves towards a target brightness within limits, so a small-windowed room is still dimmer than a bright one, and half of the light's colour is neutralised, so golden hour is warm rather than orange.

**The shader:** one permanent patch reads two half-float 3D textures (the cube, a warm-to-cool value and an inside mask), and replaces the ambient light inside rooms. Fragments outside rooms (alpha 0) keep today's sky light, so facades don't change. No recompiles, no extra draw calls. The grid switches off on the battery tier, and where the home is open from above (Home, Room, cutaway), because those views keep the model look.

**Soft reflections:** the same direction gives polished floors a soft sheen towards the window (done). A small uniform list of window rectangles could give marble a real blurred reflection (not done).

**Windows from inside:** by day the glass lifts what's beyond it, as a window does when a room is exposed for its walls. At night it's dark. From outside, it glows as before.

**Kill rule (from the plan):** if the living-room spike doesn't clearly beat the baseline side by side, or the compute time is unacceptable, stop and fall back. The owner's phone numbers (P0.2) aren't in yet, so the limits for now are: full recompute ≤ 150 ms on this Mac (a phone is roughly 4× slower), no new draw calls and 0 idle frames in editing views. These get re-checked when the numbers arrive. **Result:** it clearly beat the baseline on the first try and solves in 28–48 ms, so it stays.

## Rules that stay

- ≤ 160 draw calls in Explore, ≤ 90 in Build, 0 idle frames in editing views.
- No runtime requests to other hosts. Everything is generated or self-hosted.
- Regional detail is kept: toran, chappals, tulsi, Athangudi, red oxide.
- Everything new degrades: battery tier keeps today's look, and photos and reels inherit whatever the live scene has.
- **No paid AI** in any of this.
