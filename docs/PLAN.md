# Dream-Home: product and implementation plan

Prepared 11 September 2026. Research and this plan were presented before application implementation. The user authorized proceeding after the report without a separate approval round.

## Product

A consumer home-prototyping sandbox that turns a mental idea into a visual model to discuss with an architect. The model is the central interaction surface. It is not a chatbot, an interior catalogue, CAD/BIM, or a source of structural advice.

The core journey is: open an editable starter, explore the house, configure the plot, isolate a floor, select and edit spaces, inspect the result, save a portable project. Ordinary use is deterministic and local. There are no LLM calls, API keys, accounts, paid assets, model downloads, or server requirements.

## Research

- [Omar's reference](https://x.com/omarsar0/status/2097353640792985816) is an anatomy explorer, with roughly 4,000 structures. Its visible frame and author description emphasize a central model, selective visibility, levels, individual part selection, and contextual details. The author lists React 19, TypeScript, Vite, Three.js/OrbitControls, CSS, Lucide and testing tools. Full video interaction was limited by an X login prompt. Transfer the inspection philosophy, not the medical controls or implementation wholesale.
- [Floorplanner homepage](https://floorplanner.com/) and [live demo](https://floorplanner.com/demo) were accessed. The example house, room properties, dimension lines, metre/feet control, wall-drag hints, room/wall/surface tools, openings, camera recovery and undo/redo were observed. The 2D/3D switch was present, but its transition was not verified. Transfer dimensional editing and an immediately useful starting point; exclude the interior catalogue.
- [Townscaper web demo](https://oskarstalberg.com/Townscaper/) was accessed and interacted with. Clicking a roof added a storey and regenerated its roof and windows immediately. The interface is mostly the 3D world with palette/settings controls. Transfer immediate deterministic feedback and beautiful defaults while retaining explicit dimensions and validation.
- Current [React Three Fiber installation](https://r3f.docs.pmnd.rs/getting-started/installation), [performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance), and event documentation were fetched with Context7. R3F 9 pairs with React 19; demand rendering avoids continuous idle work. Installed React is constrained to the supported 19.2 line because the resolved R3F release excludes 19.3.
- Current [Three.js cleanup guidance](https://threejs.org/manual/#en/cleanup) was fetched with Context7. GPU resources need explicit lifecycles, and repeated primitives should be reused as projects grow.

## First version

Include rectangular plots/floorplates/rooms; north and road metadata; setbacks; 1–3 floors; bedrooms, bathrooms, living, dining, kitchen and utility spaces; aligned stairs and courtyard voids; optional front balconies; schematic garden and open parking; automatic openings; SVG plan and 3D; room movement/resize/name editing; view layers; floor isolation; cutaway; six construction stages; undo/redo; local persistence and JSON import/export.

Defer arbitrary polygons and rotated rooms, basements and vehicle ramps, independently serviced dwelling units, custom room-to-room circulation, freeform walls, user-positioned openings, detailed interiors, terrain, construction documents, pricing, building-code checks and collaboration. An added floor is not a fully designed duplex or apartment scheme.

## Architecture decisions

Use React 19 + TypeScript + Vite, Three.js + React Three Fiber, Drei camera utilities, SVG planning, CSS, and Lucide icons. Use a client-only application; server rendering and a backend do not help the primary spatial task.

Keep four responsibilities separate:

1. A semantic document and pure edit/validation functions.
2. Pure derived geometry: shared walls, openings, slab surfaces and voids.
3. Two projections: SVG floor plan and Three.js scene.
4. Editor state: selection, view settings, history, storage and contextual controls.

Load 3D separately from the shell; render on demand and cap device pixel ratio. Avoid network fonts, textures and model assets. Use WebGL/error fallback with a usable 2D editor.

## Representation

Store schema version 1, plot dimensions, uniform setback, north rotation, road side, and a list of floors. Use integer centimetres and a 10 cm planning grid. Each floor has stable IDs, an explicit rectangular footprint, 3 m elevation increments, rooms, courtyard/stair voids and a balcony flag. Geometry converts to metres only in rendering.

Floorplates are independent of room rectangles. Unassigned space is schematic circulation. A room removal therefore does not shrink the house. Every starter is a factory producing this same schema; there is no renderer switch for villa, bungalow or duplex.

Derive canonical wall segments by grouping collinear room/floorplate/courtyard edges, splitting at endpoints and relevant intersections, and deduplicating. Shared boundaries yield one wall. Derive centred automatic doors/windows; render actual wall pieces around the gaps. Prefer circulation-facing room doors and road-facing ground entrances. Upper balcony openings face the fixed south balcony.

Subtract courtyard rectangles from every slab/roof and staircase holes from intermediate floors. Schematic steps connect existing floors only. Ground supports remain beneath stairs. Roofs close the top stair shaft. Frame/foundation geometry is illustrative; there is no structural solver.

## 2D/3D communication and editing

Both views read the same document and select stable room IDs. Views never maintain independent floor plans. A move or resize produces a snapped candidate, validates minimum dimensions, containment, overlap and reserved voids, then commits one undoable transaction. Invalid edits preserve the previous home and show a reason. Adjacent rooms are not silently resized or pushed.

Changing plot dimensions preserves the current house and rejects changes that would put it outside the setback. Adding a room searches deterministically for free space and fails visibly when no space fits. Camera, isolation, layers and construction stages are separate from saved geometry and its undo history.

## UX and visual direction

One workspace, opening directly into an editable home. A grey-blue canvas, white controls, muted space colours and warm architectural materials keep the house central. A restrained serif provides identity; system sans-serif labels keep runtime self-contained.

Use a compact Plot / Spaces / Layers panel, prominent 2D/3D switch, nearby floor isolation and reset controls, a room inspector on selection and a construction sequence along the bottom. A room list and numeric inputs provide keyboard alternatives to 3D picking and SVG dragging. Desktop is the primary editing surface; narrow screens use a collapsible panel.

## Implementation sequence and acceptance

1. Scaffold TypeScript and the domain, presets and geometry tests.
2. Build the real procedural scene, camera controls and picking.
3. Connect the SVG plan, contextual room edits, validation and history.
4. Add plot/floor/layer/stage controls and local persistence/import/export.
5. Run the application, inspect actual screenshots and interactions, fix issues, run typecheck/lint/tests/build.

Acceptance: a fresh load shows an editable house; room edits stay synchronized; invalid edits do not damage the model; floor/stage/layer controls reveal one consistent house; export/import preserves validated geometry; no runtime external requests are needed; desktop and narrow-screen core controls remain usable.

Source boundaries: `src/domain/types.ts`, `src/domain/model.ts`, `src/domain/model.test.ts`, `src/components/Scene.tsx`, `src/components/Plan.tsx`, `src/App.tsx`, `src/styles.css`, browser tests and project configuration.

## Risks and follow-on architecture

- Never use meshes as the source of truth or create separate geometry systems per building type.
- Test duplicate/partial shared walls, slab holes, room collisions, ID collisions, imported bounds and deterministic output.
- Circulation, door swings and accessibility are schematic, not solved or code checked. Automatic doors can still produce impractical circulation.
- Prevent roof/cutaway combinations from floating roofs above shortened walls. Keep construction-stage visibility distinct from physical state.
- Bound imports before geometry processing. Limit history and project size; preserve local data when a stored document cannot be parsed; report storage failure and offer export.
- Demand rendering, capped DPR and no heavy assets help small projects. Larger polygonal plans will require profiling, batched/instanced repeated geometry and stronger topology tools.
- Future polygon support belongs behind the domain geometry boundary. Future independent units need unit membership, explicit entrances and circulation relationships. Future opening editing needs semantic edge anchors and conflict handling. Do not invent these runtime features prematurely.

## Skills and tools

Applied repository onboarding, implementation planning, frontend design, current-documentation lookup, Karpathy coding guidance, testing, React review, debugging and release-check guidance. Used parallel agents for bounded reference research, domain/geometry work and renderer implementation. Used Context7 for current library docs, the in-app browser for reference/visual inspection, Playwright for actual browser regressions, Vitest for domain tests, TypeScript, ESLint and Vite for verification.

## Rollback and delivery

This was an empty repository with no deployment, database or migrations. Source and lockfile are the application; exported JSON is portable local data. No external service was modified. Future schema migrations must be explicit and preserve export compatibility. The README records running commands, verification and remaining limitations.
