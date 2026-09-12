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
