# Dream-Home

A mobile-first, browser-local home prototyping sandbox for plot owners. React, TypeScript, Vite and procedural Three.js. No account, backend, AI calls or API keys are needed during use.

## Run

Use Node.js 22.12+ (tested with Node 24).

```sh
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). Production output is `dist/`; `npm run preview` serves it locally after building.

## Use

Choose **Start with my plot**, enter measured sides, choose bedrooms/floors, then select a fitting family, aangan or front-yard starting home. Feet/sq ft are the default; metres and Hindi are available. Recommendations never silently change the requested bedroom or floor counts.

Explore the model with orbit/pan/zoom. **My plot**, **Rooms** and **View** each open one panel. Select rooms in 3D, the list or the floor plan. Change dimensions or nudge a room; enable **Move on plan** for deliberate dragging. Advanced controls include additional floors, balconies, construction stages, cutaway and visibility layers.

**Share** prepares a PNG of all floors with room dimensions. Use native file sharing where supported or download the image. **More** contains editable JSON backup/import, units, history and usage tips. Changes autosave locally; up to 50 edits can be undone. Existing schema-v1 files remain supported. Multiple tabs do not synchronize.

## Architecture

- `src/domain/types.ts`: versioned semantic document, integer centimetres.
- `src/domain/model.ts`: atomic edits, validation, shared walls and geometry.
- `src/domain/starters.ts`: deterministic parameterized recommendations.
- `src/domain/display.ts`: language and display-unit conversion.
- `src/domain/export.ts`: all-floor SVG/PNG handoff.
- `src/useProject.ts`: history, local persistence and recovery.
- `src/components/GuidedStart.tsx`: isolated setup draft.
- `src/components/Scene.tsx` and `Plan.tsx`: shared-document 3D and SVG views.

See [mobile design and research](docs/MOBILE-FIRST.md), [original architecture plan](docs/PLAN.md) and [verification](docs/VERIFICATION.md).

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Browser tests use installed Google Chrome in isolated contexts and start/reuse the dev server.

## Current limits

This is a conceptual prototype for discussion with an architect, not an engineering or regulatory plan. Rectangular plots and axis-aligned spaces; uniform sketch margin; fixed 3m floor height. Guided setup supports 1–3 total bedrooms and 1–2 floors; advanced editing supports up to three floors where an aligned stair shaft exists. Courtyard/stair positions come from the generator. Balconies have a fixed south-facing position. Invalid edits reject instead of rearranging neighbours; automatic openings and leftover circulation do not guarantee an accessible or compliant layout.

No basements, arbitrary plot polygons, custom structural design, independently serviced apartments, cost estimates, detailed interiors or CAD/BIM output. Site planting and parking are schematic. No automatic katha/dhur conversion, local-law verification or solar simulation. Core UI is bilingual; some detailed validation messages and imported custom names remain in their original language.

HTTPS hosting is needed for broadly available native Web Share. This release is not deployed and does not promise offline/PWA operation. Actual low-end Android/iOS performance still needs device testing.
