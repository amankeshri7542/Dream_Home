# Direct home building — implementation plan

## Audience and goal

A plot owner, including someone with limited confidence using a phone, can create a starting home, add and rearrange rooms, inspect the outside, and share the idea without learning CAD. Preserve the existing identity and procedural editor. English only, including users with an old Hindi preference.

## Decisions

- Keep React/Vite, the versioned centimetre document, pure validated commands, SVG plan and on-demand Three.js renderer. No runtime AI, API calls, asset downloads or additional packages.
- Pointer Events for mouse/touch manipulation: capture one pointer, snap to the planning grid, validate before commit, show placement status, cancel without editing. Blank-area dragging pans a zoomed plan. Every drag operation also has a button/input route.
- One visible building toolbar; context controls appear after selection. Large tap targets (48px target), readable instructions and contrast. Preserve the quiet forest-green/sky-grey identity; the house and highlighted room are the visual signature.
- Catalog choices reuse existing room kinds and editable names. Optional `finish` is validated and preserves old schema-v1 files. Building expansion changes aligned footprints together and must preserve all rooms, voids and plot margins.
- Desktop can view plan and 3D together; phones retain one main model with a controls panel. Advanced floors, balcony, stages, layers, orientation, units, backups and sharing remain available.
- Improve perceived realism through material colors, framed glass, roof coping, entrance detail and lighting, without furniture catalogs or expensive realism effects.

## Implementation order and files

1. Remove translated UI and normalize preferences: App, display helpers, GuidedStart, Controls, SharePlan, export. Keep imported user-defined room names unchanged.
2. Add pure builder commands and optional finish validation: domain/builder, types and model; test atomic placement, swaps, rotation, duplicate, expansion and import.
3. Direct manipulation: Plan and scoped styles, with pointer preview/cancellation, resize handle and pan.
4. App integration: room catalog, size controls, toolbelt, guidance, camera presets and desktop split view. Improve control sizing and avoid overlapping canvas controls.
5. Scene materials and geometry. Preserve cutaway/layer/stage semantics and geometry holes.
6. Regression tests, screenshots, build, source review, commit and push to origin/main (the existing deployment branch).

## Acceptance and verification

- English-only UI even with previous Hindi preferences; compatible saved JSON still opens.
- Add catalog room, move/resize/rotate/duplicate, rejected placement and cancelled gesture are atomic and undoable.
- No drag-only actions; selected room also has size inputs and arrow controls.
- 360px/390px phone and desktop layouts show a rendered house, usable controls and no horizontal overflow. Plan controls do not overlap.
- Desktop split selection updates both views. Exterior finish persists through reload/import/export.
- PNG sharing and backup/recovery regressions remain covered; native OS share delivery is not claimed from a mocked test.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`, `git diff --check` and production smoke test pass before push.

## Scope and rollback

No destructive migrations, cloud data or external services are introduced. Reverting the implementation commit restores the old editor; old code ignores the optional finish field. Plot polygons, basements, arbitrary structural layouts and engineering/code compliance remain outside this change. Physical Android/iOS and testing with older users remain necessary before claiming validated ease of use.

## References

Live baseline inspected at https://dream-home-liard-nine.vercel.app/. MDN Pointer Events documentation fetched through Context7 for pointer capture, `touch-action`, and `pointercancel`. Accessibility approach follows WCAG dragging-movement alternatives and large touch targets; this is not a formal conformance audit.
