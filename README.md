# Dream-Home

A mobile-first home-building sandbox for plot owners. Start with a plot, find a fitting layout, then shape the rooms directly. React, TypeScript, Vite and procedural Three.js; no account, backend, runtime AI calls or API keys.

[Open Dream-Home](https://dream-home-liard-nine.vercel.app/)

## Run locally

Node.js 22.12+ (verified on Node 24):

```sh
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). `npm run build` creates `dist/`; `npm run preview` serves the production build locally. GitHub's `main` branch is the existing Vercel deployment source.

## Build a home

1. Choose **Start with my plot**, enter measured sides, choose bedrooms and floors, then select a family, aangan or front-yard starting home. Feet/sq ft are the default; metres remain available. Recommendations preserve the requested bedroom and floor counts.
2. Use **Add room** for nine room choices with compact, regular and spacious sizes. Rooms are placed in a clear area; when no space fits, adjust the building area in **My plot**. Maximum expansion preserves the sketch margin and existing balconies.
3. Use **Move** to drag a room or swap compatible rooms. Green previews fit; red previews explain the problem. **Resize** gives a large corner handle. Cancelled/invalid drags do not change the project. A zoomed plan can be panned by dragging empty space.
4. Tap **Edit details** for dimension fields, smaller/bigger buttons, position arrows, rotate, duplicate, exact placement and a tap-based swap selector. **Undo** is always available in the building toolbar; redo and backups are in **More**.
5. **View** contains inside/outside/front cameras and ivory, warm brick and sandstone finishes. Advanced floor isolation, balconies, stages, layers, labels and orientation remain available. Desktop also offers **Plan + 3D** side by side.
6. **Share** prepares a PNG of all floors and room dimensions. Use native file sharing where supported, or download the image. Editable JSON remains the backup/import format.

The interface is English only; old language preferences normalize to English. Imported custom names are preserved. Changes save in the current browser. Up to 50 edits can be undone; multiple tabs do not synchronize.

## Architecture

- `src/domain/types.ts`: schema-v1 semantic document in integer centimetres, with optional `finish`.
- `src/domain/model.ts`: atomic edits, validation, shared walls and geometry.
- `src/domain/starters.ts`: deterministic parameterized recommendations.
- `src/domain/builder.ts`: catalog, efficient free-space placement, validated swaps, rotation, duplication and aligned building resizing.
- `src/domain/display.ts` and `export.ts`: units and all-floor PNG handoff.
- `src/useProject.ts`: history, local persistence and unreadable-save recovery.
- `src/components/GuidedStart.tsx` and `RoomCatalog.tsx`: setup and adding rooms.
- `src/components/Scene.tsx` and `Plan.tsx`: shared-document 3D and direct SVG manipulation.

See [the direct-building plan](docs/GAME-LIKE-EDITOR.md), [earlier regional research](docs/MOBILE-FIRST.md) and [verification](docs/VERIFICATION.md).

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Browser tests use installed Google Chrome in isolated contexts. They start or reuse the local development server. Screenshots wait for actual WebGL pixels, rather than only canvas attachment.

## Scope

A visual prototype for discussion with an architect, not an engineering or regulatory plan. Plots and spaces are rectangular and axis-aligned, with a uniform sketch margin and fixed 3m floor height. Guided setup supports 1–3 total bedrooms and 1–2 floors; advanced editing supports up to three floors with an aligned stair shaft. Courtyard/stair positions originate in the starter. Balconies retain a fixed south-facing position.

Room dimensions are preserved when swapping; incompatible swaps reject. Invalid edits leave the document unchanged. Automatic openings and unassigned circulation do not guarantee an accessible or compliant floor plan. Finishes and structural stages are illustrative; materials use procedural colors and geometry, not photorealistic assets.

No basements, arbitrary plot polygons, custom structural design, independently serviced apartments, costs, furniture catalogs or CAD/BIM output. Planting and parking are schematic. No universal katha/dhur conversion, local-law verification or solar simulation. No offline/PWA promise or cloud synchronization. Physical Android/iOS and usability testing with older plot owners remain necessary before claiming device-wide performance or validated ease of use.
