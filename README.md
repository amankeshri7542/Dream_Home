# Dream-Home

A mobile-first building sandbox for plot owners. Start with measured land, choose a building program, then shape the spaces directly. React, TypeScript, Vite and procedural Three.js; no account, backend, runtime AI calls or API keys.

[Open Dream-Home](https://dream-home-liard-nine.vercel.app/)

## Run locally

Node.js 22.12+ (verified on Node 24):

```sh
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). `npm run build` creates `dist/`; `npm run preview` serves it locally. GitHub's `main` branch is the existing Vercel deployment source.

## Build an idea

1. **Start with my plot**: enter measured sides, then choose Home, Apartments, Shops & market, Shop + home or Blank building. Home defaults include bungalow, villa and duplex. Setup supports 1–8 floors, up to 12 total home bedrooms, or flat/shop counts. Recommendations preserve requested counts and explain when they cannot fit.
2. **Add space**: add a bedroom, kitchen, bathroom, living/dining, utility, study, prayer room, guest room or shop. A separate category adds balconies/verandas, courtyards and stairs. Choose a flat/shop group where relevant; placement finds a clear area.
3. **Move**: drag a space to a valid position. Dropping one room onto another exchanges their uses and names while preserving walls, sizes and ownership. **Resize** provides eight edge/corner handles, arrow-key controls and a closer view for small rooms. Invalid or cancelled gestures leave the plan unchanged. Zoom and pan work on the plan.
4. **Edit details**: use dimension inputs with a choice of fixed corner, bigger/smaller buttons and arrows without dragging. Set a room aside in the **Tray** while making space, then drag it back, tap a clear spot or use automatic Fit. Tray pieces retain their size and appearance in saves and backups. Rooms support rotation, duplication, change of use, an explicit use-swap picker and moving to another group's available space. Balconies have side/slide/width/depth controls. Courtyards and stairs update every connected floor atomically, naming any blocking room.
5. **Rooms**: edit each floor and its named flat/shop boundaries. Add a floor by copying the top floor and extending its stair/courtyard connections. **Undo** reverses an entire edit; redo and editable backups are in **More**.
6. **View**: see inside, outside or the road-facing elevation; try ivory plaster, brick or sandstone. Beds, counters, dining settings and bathroom fixtures make rooms recognizable with names switched off. Choose room floor finishes, turn furnishings or hide them. **Top**, **Focus**, room **Look inside**, Fit home and Fit plot offer different ways to explore. Floor isolation, construction stages, layers and optional names remain available. Desktop **Plan + 3D** shows matching views of the selected floor.
7. **Share**: choose a floor for a PNG with dimensions and unit labels. Native file sharing is available where supported. Download all floors together as an editable JSON project.

The interface is English only. Custom imported names stay intact. Plans save in the current browser; up to 50 edits can be undone. Tabs and devices do not synchronize.

## Architecture

- `src/domain/types.ts`: schema-v2 document in integer centimetres, with units, unit areas, multiple edge-attached balconies and canonical vertical spaces.
- `src/domain/model.ts` and `geometry.ts`: atomic edits, bounded validation, shared wall/opening derivation and slab geometry.
- `src/domain/migration.ts`: validates and migrates v1 files. Browser persistence writes a separate v2 key and preserves the original v1 copy.
- `src/domain/blueprints.ts` and `starters.ts`: deterministic building programs and existing compact home arrangements, producing the same document.
- `src/domain/builder.ts`, `openSpaces.ts` and `selection.ts`: room catalog, free placement and common room/open-space selection.
- `src/domain/export.ts`: escaped, bounded, per-floor SVG/PNG export and whole-project JSON backup.
- `src/useProject.ts`: history, local saving and recovery without silently replacing corrupt saves.
- `src/components/Scene.tsx` and `sceneMaterials.ts`: shared materials, metre-scaled procedural textures, merged wall/window parts, restrained shadows and demand rendering.
- `src/components/Plan.tsx`: SVG gestures preview and commit through the same domain operations.
- `src/domain/tray.ts` and `resize.ts`: persistent staging and anchored resize commands.
- `src/domain/roomDetails.ts`, `RoomDetailsPlan.tsx` and `RoomDetails.tsx`: shared deterministic furnishings, SVG cues and merged 3D detail.
- `src/components/CameraControls.tsx`: visible-building framing and explicit focus; `studio.css` reclaims mobile model space.

See [rooms-as-pieces research and decisions](docs/ROOMS-AS-PIECES.md), [optional AI recommendation](docs/OPTIONAL-AI.md), [blueprint research](docs/BLUEPRINT-EXPANSION.md) and [verification](docs/VERIFICATION.md). Earlier design notes are retained in `docs/` as historical context.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Browser tests use installed Google Chrome in isolated contexts and start or reuse the development server. They cover native touch as well as pointer and keyboard interactions. Visual checks wait for actual WebGL pixels.

## Scope

A conceptual prototype to discuss with an architect. One building, rectangular aligned floorplates, rectangular spaces, a uniform sketch margin and fixed 3 m storeys. Limits: 8 floors, 48 rooms per floor, 48 staged room pieces, 64 units, 8 shared vertical spaces and 4 balconies per floor; imports are bounded to 1 MB.

Room and opening edits preserve non-overlap and unit boundaries. Automatic circulation, doors, windows, stairs and construction stages remain schematic and do not establish structural safety, access, local-law compliance or architectural quality. Materials and daylight are more detailed, but this is not an offline photoreal renderer.

Basements, multiple separate buildings, arbitrary plot polygons, furniture catalogs, costs, CAD/BIM output, cloud sync and an offline/PWA guarantee are outside this version. Katha/dhur conversions vary locally, so setup asks for measured sides. Physical Android/iOS testing and sessions with older plot owners are still needed to assess real-device performance and ease of use.
