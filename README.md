# Dream Home

A warm, playful 3D sandbox for building the home you keep imagining. Pick a
starting home, move rooms like puzzle pieces, place doors and windows, furnish
every room, style the roof and garden — then walk right in and take a photo.
React, TypeScript, Vite, React Three Fiber and Three.js, with furniture modelled
in Blender. No account, backend, runtime AI calls or API keys; everything saves
on your device.

[Open Dream Home](https://dream-home-liard-nine.vercel.app/)

## Run locally

Node.js 22.12+ (verified on Node 24):

```sh
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). `npm run build` creates `dist/`;
`npm run preview` serves it locally. GitHub's `main` branch is the Vercel
deployment source.

> The project lives in an iCloud-synced folder on the author's machine, so
> `node_modules` is a symlink to an un-synced `node_modules.nosync`. If
> `npm install` replaces the symlink, restore it with
> `rm -rf node_modules.nosync && mv node_modules node_modules.nosync && ln -s node_modules.nosync node_modules`.

## Play

1. **Start** — a title screen offers *Continue my home*, *Start a new home*,
   *Try the sample home* and *Open a saved project*. The gallery has eight
   starting homes (cosy bungalow, garden villa, duplex, courtyard home,
   apartment block, shop + home, little market, blank plot) with live 3D
   previews and simple steppers. *Start with my plot* opens the detailed
   wizard for measured plots, 1–8 floors and apartments or shops. A short
   construction reveal and a three-step tour follow (replay it from More).
2. **Build** — tap any room in 3D (or pick it from Rooms) to see a compact
   card and an action bar: Move, Resize, Rotate, Duplicate, Set aside. Press
   **Move** and drag the room right in 3D (grab the floor or its name label;
   with a mouse, just drag the selected room): a ghost shows where it lands,
   dropping it on another room swaps them, and dropping it on the Tray sets it
   aside. *Show details* reveals sizes, finishes, position and use. *Add space* adds rooms,
   balconies, courtyards and stairs; when the house is full it offers
   **Grow house & add** in one tap. The **tray** keeps set-aside rooms safe until
   you place them back. Floors are an elevator on the right.
3. **Doors & windows** — every room lists its doors and windows. Add doors,
   French and sliding doors, archways, windows and picture windows; slide them
   along the wall, resize them, move them to another wall, flip which way a door
   opens, or make the whole floor automatic again.
4. **Decorate** — tap a room and the camera glides inside it. About forty
   pieces of chunky, rounded furniture with real thumbnails: add them to a
   room (they find a free spot), tap a piece and drag it around — even into
   another room — or nudge, turn, copy and recolour it. Paint the walls and choose the floor
   (oak, walnut, herringbone, tile, terrazzo, marble, stone, slate, concrete,
   carpet). *Auto-furnish* and *Empty the room* are one tap.
5. **Outside** — choose the outside walls (plaster, brick, sandstone, stucco,
   render, timber, stone, concrete, charcoal), a flat, gable, hip or shed roof
   with material and steepness, trim and front-door colours. Plant trees,
   shrubs, flower beds, hedges, a pool, paths, patios, lamps and benches; pick
   the ground and a fence.
6. **Explore** — admire the home on a turntable, slide the time of day from
   morning to a glowing night, take a photo to save or share, and walk inside
   with the keyboard, a thumb joystick or tap-to-walk; stairs take you between
   floors.
7. **Share** — a dimensioned plan image per floor, or the whole project as an
   editable JSON backup.

**Never lost:** every change can be undone (with a description of what it
undid), removing a room asks first and offers *Set aside instead*, and the
browser/phone Back button closes the top panel instead of leaving the app.
**Friendly checks:** a Home checklist notices rooms without doors, bedrooms
without windows, missing stairs, kitchen or bathroom — "friendly checks, not
building-code checks". Every starting home passes it; finishing the essentials
celebrates with confetti, then the pill counts "make it yours" ideas to try.

**Accessible:** every drag has a tap, keyboard or number alternative; targets
are 44–48 px; selections are announced to screen readers; reduced-motion
settings turn off camera glides and animations; `?` lists keyboard shortcuts.

## Architecture

- `src/domain/` — the pure model in integer centimetres (schema v2 with optional
  additions for openings, furniture, materials and landscape), validation with
  structured issues (`validate.ts`), a single edit gate (`edit.ts`), walls with
  multiple openings (`walls.ts`), openings/furniture/landscape/materials
  commands, the home checklist (`advice.ts`) and catalogs shared with Blender
  (`catalog/*.json`). Golden snapshot tests lock the automatic layouts.
- `src/history.ts`, `src/useProject.ts` — undo/redo with labels and selection
  restore; local saving and safe recovery of damaged saves.
- `src/editor/` — the UI controller (a pure reducer), shortcuts, spatial maths,
  the gesture state machine and snapping previews.
- `src/shell/`, `src/onboarding/`, `src/explore/`, `src/ui/` — the workspace
  chrome, title/gallery/tour, Explore HUD and walkthrough, design tokens and
  primitives.
- `src/scene/` — renderer v2: perspective camera rig with inset-aware framing,
  procedural sky with time of day, image lighting, shadows, materials, building
  geometry (junctions, openings, cutaway section fill, stairs, roofs, porch),
  GLB furniture and garden props, quality tiers with lazy post-processing, and a
  debug bridge (`window.__dreamHome`) for tests.
- `scripts/blender/` — headless Blender scripts that model the furniture and
  garden kit; `npm run assets` rebuilds `public/models` and `public/thumbs`
  (requires Blender 5.1; the web build never needs Blender).

See [the diorama sandbox design](docs/DIORAMA-SANDBOX.md) and
[verification](docs/VERIFICATION.md). Earlier design notes stay in `docs/` as
history.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Browser tests use installed Google Chrome, run with reduced motion for stable
layouts, and cover mouse, keyboard and native touch.

## Scope

A conceptual sandbox to discuss with an architect. One building, rectangular
aligned floorplates, rectangular rooms, fixed 3 m storeys. Doors, windows,
stairs and checks are illustrative and do not establish structural safety,
access, local-law compliance or cost. Limits: 8 floors, 48 rooms per floor,
32 furniture pieces per room, 120 garden items; imports are bounded to 1 MB.
