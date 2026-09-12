# Verification

Direct-building revision, 12 September 2026.

- TypeScript and ESLint: passed.
- Vitest: **138 tests passed** (22 model, 84 starter, 28 builder, 4 export).
- Playwright: **21 Chrome browser regressions passed**, using isolated browser contexts.
- Production build: passed. Main JS ~90 KB gzip; lazy Three.js scene ~250 KB gzip; CSS ~10 KB gzip. No new dependencies.
- Runtime dependency audit: zero known vulnerabilities reported by npm.
- Git whitespace/conflict checks and direct source review: passed. No runtime service requests or credentials were introduced. English-only source checked, with old Hindi preferences migrating to English.

Coverage includes guided setup and cancellation, feet/metres, invalid changes, room dimension inputs/history, legacy JSON import/backup/recovery, actual 3D picking/orbit/stages, explicit room movement, valid swaps, invalid drops, primary/secondary pointer cancellation, corner resizing at different zooms, keyboard/tap swap alternatives, catalog/rotation/duplicate, building expansion, finish persistence, desktop split view, phone touch targets and short multi-floor screen layouts.

Additional regressions verify maximum building expansion reserves upper balconies, Fit restores camera scale after zoom, and reading rounded feet measurements at the minimum room size does not invalidate or alter the exact saved measurement.

Reviewed rendered screenshots at 360×740, 390×844 and desktop sizes, plus split view, exterior materials and the actual downloaded plan PNG. Screenshots wait for visible WebGL pixels. PNG signature and dimensions are checked; Web Share is mocked rather than sending a message or opening an uncontrolled OS flow. WebGL-unavailable and storage-unavailable paths remain usable.

Production preview is inspected separately from the development server. Physical Android/iOS testing, usability sessions with older plot owners and real OS share delivery remain outside this verification. These checks do not establish accessibility conformance, low-end GPU performance or architectural/structural correctness.
