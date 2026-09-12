# Rooms-as-pieces release verification — 12 September 2026

- Typecheck, ESLint and production build: passed.
- Vitest: **208 tests passed** across 9 files.
- Playwright: **41 tests passed** in Chrome, including a real CDP touch stream in a phone context for tray placement and top-left resizing.
- Production preview on port 4176: furnished top view, set aside/automatic restore, return to 3D, Focus and desktop Plan + 3D all passed. No page errors or horizontal overflow. Tested 360×740 touch context and 1440×1000 desktop; broader browser suite covers 390 and 430 px widths too.
- Actual screenshots inspected: furnished mobile orbit/top, compact room tray, full-screen Focus, linked desktop views, all room kinds and an eight-floor building.
- Final phone Focus canvas measured 548 px tall at 360×740. Default 390 px house footprint projects within x=23.4–366.6 px; outer road/plot can be cropped by Fit home. Fit plot is explicit.
- Render measurements from an isolated development browser: compact furnished top view **36 draw calls / 3,824 triangles**; eight-floor exterior **96 calls / 27,018 triangles**, with no furnishings rendered behind closed floors/roof. These are scene-complexity measurements, not guarantees of frame rate on physical phones.
- Rendered-bed picking opened the correct bedroom inspector. Shared detail tests cover all seven room kinds, bounds, minimum room sizes, doorway clearances, four orientations and finishes.
- Tray/resize regressions cover 48-piece capacity, invalid occupied placement, source-floor removal, group restoration, JSON/reload/undo, optional-v2 backward compatibility, all eight anchored handles, balcony attachment, touch cancellation and no stale-drop replay.
- Release diff/whitespace and sensitive-file review: passed. No dependencies, credentials, server endpoints or runtime AI calls were added.
- Final build assets: main JS approximately **344.50 kB / 109.01 kB gzip**, lazy 3D chunk **931.24 kB / 253.72 kB gzip**, main CSS **60.62 kB / 12.30 kB gzip**.

Remaining limits: physical Android/iOS device testing and observed sessions with older users are still needed. This is an interactive conceptual model, not an offline photoreal render or arbitrary-shape CAD editor. Rooms remain rectangular; furniture is illustrative and not individually draggable. AI remains an optional proposal in `OPTIONAL-AI.md`.

---

# Verification

Blueprint expansion, 12 September 2026.

- TypeScript and ESLint: passed.
- Vitest: **159 tests passed** (24 model, 84 starter, 29 builder, 15 building-program, 3 open-space, 4 export).
- Playwright: **33 Chrome browser tests passed** in isolated contexts, including native touch input.
- Production build: passed. Main JavaScript ~101 KB gzip; lazy Three.js scene ~253 KB gzip; CSS ~11 KB gzip. No dependency changes or runtime service requests.
- Built production bundle smoke-tested separately on a 390×844 touch viewport: editing, brick rendering, eight floor choices, v2 saving and upper-floor image export passed with no page errors or overflow.
- Git whitespace/conflict checks and source review: passed. No credentials, external endpoints or runtime AI integration added.

New coverage includes real v1 fixtures and geometry-preserving migration; retaining corrupt and empty v2 saves; unequal bedroom/kitchen use swaps; balcony edge/slide/drag/outward-corner resizing; shared courtyard drag/nudge/undo/reload; adding and removing open spaces; moving rooms between disjoint unit areas; invalid edits remaining atomic; shared stair links and floor copying; door separation between private units; and exact program counts for larger homes, apartments and markets.

Existing coverage retains feet/metres, history, JSON backup/import, guided setup cancellation, picking/orbit/stages, pointer cancellation, catalog/rotation/duplication, building expansion, camera Fit, rounded dimensions, unavailable WebGL/storage paths and export. PNG signature and dimensions are checked. Native Web Share is mocked; tests do not send messages.

Rendered UI inspected at 360×740, 390×844 and desktop dimensions, including the actual eight-floor apartment app in mobile, split and per-floor export views. No horizontal overflow or page errors in that eight-floor inspection. A separate synthetic eight-floor / 384-room / 32-balcony Scene exercise recorded 224 exterior draw calls and 18,210 triangles, with 111 calls for an isolated top floor. Desktop JavaScript render submission averaged ~1.72 ms across 45 frames; this is not a phone frame-rate or GPU measurement.

Physical Android/iOS testing, usability sessions with older plot owners, real OS share delivery and architectural review remain outside this verification. These checks do not establish accessibility conformance, low-end phone performance or construction correctness.
