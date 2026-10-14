> **Superseded** by [the warm diorama sandbox](DIORAMA-SANDBOX.md) (October 2026), which adopted this foundation and went beyond its deferred scope. Kept as history.

# Living blueprint — Gate 1 audit and implementation plan

Status: **awaiting approval; no application code changed.**

Audited 12 September 2026 against local commit `53bc934` and [the live application](https://dream-home-liard-nine.vercel.app/). This document proposes six reviewable phases for Gate 2. It does not authorize pushing or deployment.

## Outcome

Make the home the enduring interaction surface: select a space in 3D, move or resize it with a visible preview, understand what blocks it, and recover without losing work. Rooms, My plot, View, Add space, Tray, and Floor plan become secondary surfaces over a stable viewport. Numeric, button, keyboard, history, export, and recovery workflows remain available.

## 1. Current architecture

The application is a local React 19 / TypeScript / Vite editor with React Three Fiber 9, Drei 10, and Three.js r180 declared dependencies. There is no router, backend, account, runtime generation service, or state-management package. `src/main.tsx` mounts App under StrictMode and loads `styles.css`, then `builder.css`, then `studio.css`. The later styles override earlier layout rules.

| Boundary | Current ownership and flow |
|---|---|
| Document and history | `useProject.ts` owns past/present/future, up to 50 undoable edits, save status, recovery text, and `apply(EditResult)`. Successful commands call `commit`; failed results only set an error. Identical serialized projects do not create history entries. |
| Editor UI | The 2,269-line `App.tsx` owns mode, tool, selected component, panel/dialog, floor/layers, camera intentions, units, tray gesture plumbing, fixed resize corner, messages, keyboard shortcuts, and most inspector markup. |
| Domain | Integer-centimetre rectangular geometry, bounded pure edits, validation, opening/wall/slab derivation. `model.ts` dispatches room, attached balcony, and linked stair/courtyard transforms. Builders and starters create the same document. |
| Selection | `selection.ts` produces a shared `PlanItem` list and resolves selection to a floor. Rooms, balconies, courtyards, and stairs are already selectable. Selecting in the normal tool opens the Rooms inspector and selects its floor. |
| 2D | `Plan.tsx` owns SVG pan/zoom, pointer capture, gesture preview, grid snapping, resize handles, and tray drop preview. Preview and final commit call domain commands. A completed valid gesture commits once. Invalid/cancelled gestures preserve the document. |
| 3D | Lazy `Scene.tsx` owns an orthographic R3F Canvas, scene error boundary/WebGL fallback, floor/stage visibility, landscape, walls, opening details, and picking. It currently selects but does not move/resize spaces. |
| Camera | `CameraControls.tsx` derives projected building/plot/room bounds, fits by both width and height, uses R3F `size`, explicit reset keys, and OrbitControls. Unrelated edits generally preserve orbit if the framing inputs do not change. |
| Room cues | Pure `roomDetails.ts` describes furniture in centimetres. `RoomDetailsPlan.tsx` renders SVG cues; `RoomDetails.tsx` merges 3D geometry by material, preserving room ownership through face ranges for picking. Door-approach scoring chooses deterministic orientations. |
| Tray and resize | `tray.ts` preserves room identity, dimensions, appearance, and source floor while staged; restoration validates explicit placement or finds space. `resize.ts` implements eight opposite-edge/corner anchors and restricts attached balcony handles. |
| Persistence | `parseProject` bounds and validates imported JSON, migrates schema v1 to v2, and copies supported fields. Saves use `dream-home.project.v2`; original v1 storage is retained. A corrupt or empty v2 save does not silently fall back to stale v1. Autosaving is disabled after corrupt boot until a deliberate edit/import; recovery text stays available. |

Schema v2 includes units and their floor areas, canonical vertical spaces shared across floors, balconies attached to building edges, and optional staged rooms/furnishing presentation. Limits include eight floors, 48 rooms per floor, 48 staged rooms, 64 units, eight vertical spaces, four balconies per floor, and a 1 MB import bound. These remain unchanged.

Reading covered the requested source files and four design/verification documents, domain helpers/migration, and all three Playwright suites plus the nine Vitest suites. No repository-local AGENTS.md or CLAUDE.md was found; the supplied Context7 instructions were followed. Historical documents contain earlier release/push instructions; they do not supersede this task's two gates.

## 2. Evidence-backed UX findings

### Canvas collapse and replacement — critical

Measured the live app after dismissing the welcome card, then opening Rooms and selecting Bedroom 1. Heights are CSS pixels, rounded below. Screenshots were captured for each selected state.

Baseline screenshots: [320 px](audits/living-blueprint-gate-1/dream-home-audit-selected-320.png), [390 px](audits/living-blueprint-gate-1/dream-home-audit-selected-390.png), [430 px](audits/living-blueprint-gate-1/dream-home-audit-selected-430.png), [768 px](audits/living-blueprint-gate-1/dream-home-audit-selected-768.png), [1280 px](audits/living-blueprint-gate-1/dream-home-audit-selected-1280.png).

| Viewport | Default Canvas | Selected-room Canvas | Canvas after Move |
|---|---:|---:|---|
| 320 × 740 | 320 × 358 | 320 × 81 | Removed |
| 390 × 844 | 390 × 462 | 390 × 137 | Removed |
| 430 × 932 | 430 × 550 | 430 × 185 | Removed |
| 768 × 1024 | 768 × 628 | 768 × 253 | Removed |
| 1280 × 800 | 1280 × 446 | 960 × 446 | Removed |

At 390 px the inspector removes approximately **325 px** of Canvas height. The selected-room screenshot shows the house squeezed above two permanent tool rows, with a long form below. The same Canvas DOM node survives opening Rooms, but its dimensions change; clicking Move leaves zero Canvas elements at every audited size.

Causes: `App.tsx:550–573` conditionally renders Scene only when mode is not 2D. `beginTool`, Floor plan, tray actions, and catalog completion choose 2D. `styles.css:451–459` gives the mobile inspector a substantial flex share; desktop makes it a 320 px column. Additional offsets in three CSS files reserve space for headers and tool rows. This requires a stable workspace boundary, not another minimum-height patch.

### Selection opens too much — high

`selectRoom` automatically opens the full Rooms panel. Room size, appearance, fixed corner, movement, rotation/duplication, use swap, unit assignment, rename, position, and removal coexist in a long surface. A first selection should reveal name, dimensions, and the next action; details should be deliberate.

### Safe operations exist, but movement semantics conflict with the new brief — high

`moveRoomSmart` swaps two rooms' names/uses when the dragged room's centre lands inside another room. It preserves walls, dimensions, and ownership. Consequently, feeding the same default command into a new 3D ghost would treat some collisions as successful swaps. Physical 3D movement needs a distinct strict intent while preserving the old swap capability.

`validateProject` returns strings and reports room overlap as “overlaps another room.” Linked vertical-space commands already identify a blocking room/floor in some messages, but do not expose IDs for highlighting or actionable recovery. Failed edits appear in a generic inspector error block or toast.

### Camera: preserve the existing strengths

R3F already observes Canvas size; CameraControls reacts to width/height. Plan also uses ResizeObserver. There is no evidence that simply adding a window resize listener solves the issue.

In the unchanged local sample at 390 × 844, Focus increased Canvas height from 462 to 652 px and the camera received the updated size. Zoom stayed at 27.066 because width was limiting. That is mathematically valid, not proof of failed fitting. Tests must inspect projected bounds and centring, not require zoom to increase on every Focus operation. Panel-induced size changes currently trigger the same fitting path and can disturb an orbit.

### Readability and accessibility

Measured primary tool labels are commonly 12 px; bigger/smaller labels are 11 px; navigation labels are 14 px. Most audited primary targets are already 44–48 px or larger, so retain that strength while raising text sizes and reducing simultaneous controls. Existing visible-focus CSS, numeric inputs, keyboard resize, and pointer cancellation are valuable foundations.

Room removal is immediate in `App.tsx:1686–1695`, although undo exists. Promote Set aside as the safe default and confirm true deletion, including staged pieces and linked spaces. Existing motion CSS does not explicitly cover future camera/sheet/ghost animations; OrbitControls currently enables damping.

### Test coverage explains why this shipped

The suite checks default hero height, selected 2D gestures, common 360/390/430 px targets, explicit Fit, focus mode classes, real rendered pixels, export, native touch, tray cancellation, and legacy recovery. It does not assert Canvas identity across editing modes, unchanged dimensions with a selected room at 320/390/430, 3D transform previews, blocker IDs, or a draggable inspector's snaps/focus behavior.

Local baseline rerun: **typecheck, lint, 208 Vitest tests, 41 Playwright tests, and production build passed**. Playwright used isolated contexts in installed Chrome; its reused server was verified to belong to this repository. No code changes were needed. The initial sandbox could not bind the server port; the authorized browser run succeeded outside it.

## 3. Current research and implications

Sources were retrieved during this audit. Context7 resolved the official R3F and Three.js repositories; authoritative browser/accessibility/product guidance was read directly. Current upstream examples can exceed installed versions: implementation must verify APIs against the installed R3F 9 / Three.js r180 packages and must not copy newer WebGPU `Info` fields into WebGL metrics.

| Source | Application to this plan |
|---|---|
| [R3F scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance) | Preserve demand rendering, explicitly invalidate active transitions, reuse materials/geometries, and batch repeated parts. Adaptive resolution needs active-frame samples; idle demand rendering must not be mistaken for poor FPS. |
| [R3F events](https://r3f.docs.pmnd.rs/api/events) | Capture is additive to hit testing, unlike DOM capture. Stop propagation; own one pointer ID; isolate orbit while transforming. Capture/release lives on the event target, not Object3D. |
| [Three.js disposal](https://threejs.org/manual/en/how-to-dispose-of-objects.html), [instancing](https://threejs.org/docs/#api/en/objects/InstancedMesh), [WebGLRenderer](https://threejs.org/docs/#api/en/renderers/WebGLRenderer) | Dispose owned replacement batches; retain shared resources until their owner is finished. Track `renderer.info.render.calls`, triangles, geometries, textures, and programs for this installed WebGL renderer. Instance only where repetition and stable ownership justify it. |
| [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) | Capture a single active pointer; handle cancellation/lost capture and secondary fingers. Scope `touch-action` to manipulation surfaces so inspector content can scroll. |
| [MDN ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) | Observe the element, not just the window; avoid callbacks that change observed layout and create resize loops. Reuse R3F's measured size when sufficient. |
| [WCAG 2.2 dragging](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) | Keyboard alone is insufficient: provide single-pointer alternatives such as tap arrows, numerical entry, Set aside, and automatic Fit. Sheet dragging also needs buttons. |
| [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | AA minimum is 24 CSS px with exceptions, not 44/48. Adopt a stronger product standard: 48 px primary targets, minimum 44 px secondary targets. |
| [WCAG focus visibility](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), [interaction animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | Fixed docks/sheets must not conceal keyboard focus. Respect reduced motion across camera, sheet, ghost return, and damping. Animation-from-interactions is AAA guidance; this is not a claim of formal conformance. |
| [Material bottom sheets](https://m2.material.io/components/sheets-bottom) | Its published standard/expanding-sheet distinction fits a canvas editor: complementary content remains usable alongside the main surface; expansion is deliberate. This is an established M2 pattern reference, not a claim of a new M3 specification. |
| [Sweet Home 3D guide](https://www.sweethome3d.com/users-guide/) | Keep plan/3D synchronized, indicate floor and focus clearly, and make experiments undoable. Borrow principles, not the desktop pane layout or visual design. Floorplanner's demo loaded but did not expose useful text in this audit; no detailed interaction claim relies on it. |

## 4. Assumptions and contested decisions

Confirmed by the brief: local-only operation; persistent 3D; all existing space types, multi-floor semantics, units, history, exports and v1/v2 compatibility; no new account, AI, paid service, external assets, or deployment. The current English interface and custom imported names remain supported.

Proposed design assumptions requiring approval as part of this plan: the snap sizes below, strict physical movement in the new 3D tool, and preserving legacy auto-swap inside the optional plan lens. Physical-phone performance and usability with older first-time users remain unvalidated; viewport emulation is not a substitute.

| Decision | Recommendation and trade-off |
|---|---|
| State ownership | A typed editor reducer/controller owns UI transitions; `useProject` remains the sole document/history owner. Gesture refs own high-frequency pointer state. This avoids a second document store and broad history rewrite. No new state library. |
| Persistent viewport | Mount one lazy Scene at a stable position, independent of panel/tool/plan visibility. Overlay the sheet and plan lens; remove flex allocation and Canvas inset changes caused by inspectors. WebGL-unavailable/context-failure recovery remains an explicit exception with accessible 2D editing. |
| Floor plan | Phone: optional bounded editing lens; desktop: dockable overlay beside the visible model. It never replaces/hides the whole 3D scene. Opening ordinary controls does not refit. Explicitly changing the plan layout can be a fit intention, but never remounts Canvas. |
| Inspector | One non-modal sheet, no scrim for ordinary editing. Hidden, peek, medium, expanded states. Start peek around 88 px; medium around 28% and expanded at most 40% of usable work height, internally scrolling. Cap sizes against viewport/keyboard space. The exposed model area remains larger than the sheet. Detailed settings trade visible form length for sustained model visibility. |
| Camera | Keep orthographic scale and distinct Fit home, Fit plot, Top, Front, and Focus room intentions. Assisted edit uses an elevated angle with visible wall depth, not exact Top. Preserve user orbit on unrelated updates; stable layout means inspector snaps do not alter camera scale. Focus/layout resize fits projected bounds using existing R3F measurements plus an explicit layout revision if needed. |
| Physical move versus use swap | Add a backwards-compatible transform intent/options argument. Existing Plan auto-swap keeps its default semantics and explicit preview wording. New assisted 3D Move uses strict geometry; “Swap room uses” stays available as an explicit inspector action. Preview and commit always receive the same intent. This preserves capability without confusing a blocked physical move with a successful swap. |
| Architectural realism | Derive architectural descriptors from existing building geometry. Keep room dimensions and wall derivation semantics unchanged. Details can show physical thickness without pretending existing stored room rectangles are newly defined clear interior measurements. No schema migration for decorative geometry. |
| Optimization | Keep merged static geometry by material; instance repeated posts/fixtures only after measurement. Use bounded active-interaction DPR adaptation if beneficial. No new post-processing pipeline or package is assumed. |

## 5. Interaction and visual specification

The visual identity remains forest-green controls, ink text, warm architectural surfaces, and ochre selection on the existing sky-grey workspace. The signature is a selected space lifted into a translucent, dimensioned blueprint ghost, with alignment marks connecting it to the building. Avoid new decorative gradients or dashboard cards. Use the existing local/system font stack: restrained display headings, 16 px body text, 15–16 px control labels, and tabular dimension figures. Check actual palette contrast; status includes text and shape, never color alone.

Below a compact approximately 56 px header, Canvas fills the viewport behind the overlays. Small floor/view controls occupy defined safe-area positions. One bottom dock changes with context: general navigation when nothing is selected, space actions when selected, and Done/Cancel plus relevant alternatives during a transform. Navigation remains one labelled action away; do not stack a permanent navigation row, tool row, and camera row. Keep primary actions in one row at 320 px; put secondary actions in a labelled menu.

Selecting a space opens peek with its name, floor and dimensions. Details/Expand, Collapse and Close work by tap and keyboard as well as handle dragging. The handle owns sheet gestures; the body scrolls without moving the sheet. Restore focus to the invoking control when dismissing. Ordinary sheets do not trap focus or set `aria-modal`; genuine confirmations/import/setup dialogs do.

Move starts camera assistance once, then locks orbit for the captured pointer. Convert ray/floor-plane intersection to domain X/Z centimetres, including the plot-centering group offset and floor elevation. Retain the initial grab offset. Show a lightweight ghost and dimension badge; keep the committed building unchanged until release. Use the 10 cm planning grid, adjacent edges and useful centre alignments, excluding self. Start with an 8 CSS px attraction / 12 px release hysteresis, capped at 30 cm; tune against real projected targets. Preserve opposite-edge anchors and domain-valid coordinates when an alignment conflicts with the grid. Tie-break deterministically.

Green means valid; amber means a valid snap or advisory warning; red means blocked. An amber advisory never bypasses a domain error. Validate at most once per animation frame using shared pure operations. On release, revalidate the final candidate against the current document and commit once. If the document, floor, selection, or tool changed mid-gesture, cancel instead of applying a stale preview. On invalid release, animate only the ghost back, then remove it; reduced motion removes it immediately. Cancellation, lost capture, Escape, context loss, and an unrelated second pointer must never commit or replay a drop.

Resize uses eight 48 px screen-space handles, with attached balconies limited to their free sides. Keep the opposite edge/corner fixed, show live width/depth, and offer optional room focus when handles cannot be distinguished. Numerical dimensions, fixed-corner choice, bigger/smaller and direction buttons remain available without dragging. Linked stairs/courtyards validate all served floors atomically; balcony movement remains edge-attached.

On conflict, outline the source and blockers, place “Bedroom 1 is blocked by Kitchen” near the ghost with edge clamping if necessary, and expose contextual recovery: Resize Bedroom 1, Move Kitchen, Set Kitchen aside, and Undo when history exists. A resize suggestion opens a controlled edit, rather than silently choosing a new size. Recovery changes revalidate normally and clear stale feedback. Invalid drops add no undo step, so Undo must explain that it reverses the last successful edit, not the rejected drop. Off-floor blockers identify their floor and provide a deliberate route to inspect it.

## 6. Six implementation phases

Tests accompany each phase; phase 6 is the integrated release audit, not the first verification.

1. **Separate editor orchestration without changing behavior.** Extract UI state/transitions and focused inspectors/shell from App. Keep useProject and domain command ownership intact. Prove selection, floor changes, history, tray and dialogs behave as before. This is independently reviewable as a behavior-preserving refactor.
2. **Deliver the persistent 3D workspace and sheet.** Remove mode-conditioned Scene mounting, introduce the secondary plan lens, replace competing CSS layout rules, unify the dock, and implement accessible snap states. Wire explicit camera layout intentions and reduced motion. Finish when normal panels and selection leave Canvas identity, dimensions, and camera scale unchanged at all target sizes.
3. **Add structured geometry issues and shared transform previews.** Extend failed EditResult with optional structured issues; retain `.error` and string validation APIs. Add strict physical intent, deterministic snapping/preview helpers, and transaction cancellation rules. Route numerical edits and Plan previews through shared validation where applicable; retain legacy plan swaps. Finish when preview/final results agree and blockers are testable without a renderer.
4. **Implement assisted 3D Move/Resize and spatial recovery.** Add ray-plane dragging, visible screen-sized handles, ghost feedback, camera assistance, one-gesture history, snap-back and pointer safety. Integrate tray restoration/Set aside and linked-space/attached-space constraints. Add blocker highlights and recovery actions. Finish with mouse, native touch and keyboard routes tested against saved data.
5. **Build the architectural detail foundation within budget.** Extract current wall/opening details into pure descriptors; improve junctions, doors/windows, slabs/thresholds, stairs/rails, balcony/roof edges, entrance/plot grounding, and existing room cues. Add cheap drafting cues and measured detail levels. Preserve selection ownership through batches/instances, omit hidden detail before generating it, and audit resource lifetimes. Finish with deterministic descriptors, recognizable room types, and reported renderer/bundle deltas.
6. **Complete responsive, accessibility, persistence and performance verification.** Run the full matrix, inspect actual WebGL screenshots, exercise failures/recovery, review the complete diff, and update README/verification documentation. Record unresolved physical-device or usability evidence honestly. No push or deployment follows automatically.

### File-level change map

Existing files are modified unless marked new. Related test edits are grouped to keep this map reviewable; avoid splitting trivial wrappers into separate components.

| Phase | File(s) | Intended change |
|---|---|---|
| 1 | `src/App.tsx` | Reduce to composition, bootstrap and dialogs; remove duplicated transition logic as ownership moves. |
| 1 | `src/editor/useEditorController.ts` **new** | Typed UI reducer/controller, camera intentions, selection/floor/tool transitions; document remains in useProject. |
| 1–3 | `src/useProject.ts` | Preserve history/storage; expose optional structured failure state without changing corrupt-save policy. |
| 1–2 | `src/components/WorkspaceShell.tsx` **new** | Stable viewport host and one overlay stack; coordinate safe areas and explicit layout changes. |
| 1–2 | `src/components/RoomInspector.tsx` **new** | Extract existing room form; progressive disclosure, safe removal, preserve every action. |
| 1–2 | `src/components/ProjectInspector.tsx` **new** | Extract plot/room-list/view controls without losing floor/unit/stage/finish options. |
| 2 | `src/components/ActionDock.tsx` **new** | Contextual labelled actions and reachable navigation/history. |
| 2 | `src/components/InspectorSheet.tsx` **new** | Snap states, pointer/keyboard controls, internal scrolling, focus restoration. |
| 2 | `src/styles.css`, `src/builder.css`, `src/studio.css` | Remove obsolete workspace sizing/overrides; establish scoped layout/touch/type/motion tokens. Retain setup/share styles. |
| 2–4 | `src/components/CameraControls.tsx` | Explicit fit/assist intentions, orbit arbitration, reduced motion and tested projected-bound fitting. |
| 2–5 | `src/components/Scene.tsx` | Always-mounted Canvas integration; scene picking, transient overlays, visibility and detail policy. |
| 2–4 | `src/components/Plan.tsx` | Secondary lens; share preview/feedback helpers; preserve SVG pan/zoom and legacy swaps. |
| 3 | `src/domain/types.ts`, `src/domain/model.ts` | Structured issue types, backward-compatible errors, strict transform intent and shared geometric predicates. |
| 3 | `src/domain/transformPreview.ts` **new** | Pure preview/snap/transaction helpers, deterministic ties and cancellation/staleness behavior. |
| 3–4 | `src/domain/resize.ts`, `src/domain/tray.ts` | Reuse anchored bounds and staging; attach structured issues to relevant failures. |
| 4 | `src/components/SceneInteraction.tsx` **new** | Ray-plane conversion, pointer capture, ghost/handles, bounded active animation and owner picking. |
| 4 | `src/components/ConflictFeedback.tsx` **new** | Object-adjacent status, blocker/action UI and restrained live announcements. |
| 4 | `src/components/SpaceInspector.tsx`, `src/components/RoomTray.tsx` | Preserve linked/attached edits and tap/keyboard tray routes; safe removal and shared feedback. |
| 5 | `src/domain/architecturalDetails.ts` **new** | Deterministic building-derived detail descriptors with owner IDs and detail levels. |
| 5 | `src/components/ArchitecturalDetails.tsx` **new** | Batched/instanced descriptor renderer, predictable picking and explicit disposal ownership. |
| 5 | `src/domain/roomDetails.ts`, `src/components/RoomDetails.tsx` | Improve existing cues and reduce active-gesture detail; preserve shared SVG descriptor contract. |
| 5 | `src/components/sceneMaterials.ts` | Bounded palette/texture reuse and material ownership; no downloaded assets. |
| 1–5 | Existing domain tests; new controller/preview/detail tests | Test behavioral boundaries, anchors, collision IDs, cancellation and descriptor determinism. |
| 2–6 | `tests/studio.spec.ts`, `tests/editor.spec.ts`, `tests/blueprint.spec.ts` | Add persistence-of-Canvas, spatial editing, sheet/accessibility/metrics tests; retain meaningful legacy coverage. |
| 6 | `README.md`, `docs/VERIFICATION.md`, this plan and audit screenshots | Explain final flows, measured results, limitations and deferred interior editing. |

No dependency, deployment configuration, environment variable, backend, or service change is planned. No change to `migration.ts` or `export.ts` is expected; regressions there block delivery rather than justify relaxing compatibility.

## 7. Data-model and detail impact

Keep `Project.schemaVersion = 2` and both save keys unchanged. Selection, sheet state, tool, camera assistance, ghosts, snaps and issues are transient and never serialized into the project.

A failed result remains `{ ok: false, error: string }` with optional `issues`. A geometry issue identifies code, source component, blocker components, affected floors, attempted bounds, message and typed recovery suggestions. Non-geometric/import errors can stay text-only. Preserve `validateProject(): string[]`; use common geometry predicates to avoid two competing definitions of valid placement. Do not infer blocker identities by parsing English text.

Architectural descriptors are a separate derived layer, not persisted furniture or paint. Existing room furnishings remain derived and support the current finish/rotation/visibility fields. Resolve wall junctions as unions/trimmed axis-aligned segments without altering room rectangles. Preserve openings, shared walls, unit boundaries, and slab holes.

Detail priorities:

- First: consistent wall thickness/junctions, window depth/frames/sill/lintel/mullions, door frame/leaf/hinge/handle and selected door-swing/approach cues, slab edges/thresholds, and visible baseboards.
- Next: stair treads/risers/landing/handrail within the existing schematic stair envelope; balcony posts/guardrails; roof/parapet/coping; entrance step/porch and road/driveway/plot boundaries; grounded tree trunks/canopies. Add gutters/downpipes only where the roof form provides a coherent location.
- Existing room cues: bed frame/mattress/pillows/duvet/bedside surface; kitchen cabinet fronts/counter/sink/faucet/hob/handles; bathroom basin/mirror/toilet/shower zone; sofa cushions/table; dining table/chairs/place settings; purposeful utility/shop equipment. Many cues already exist—improve their shape/readability instead of duplicating them. Tiny switches, lights/fans and hardware appear only at a detail level where readable.

Stair and door clearance cues remain illustrative, not building-code validation. Individually editable furniture, paint catalogs, pricing, marketplaces, arbitrary polygons, CAD/BIM, engineering checks and cloud sync are deliberately deferred. A future interior phase can add an explicit item/material schema layer without coupling it to building topology.

## 8. Performance budget and measured baseline

The current build reproduces the recorded asset sizes: main JS **109.01 kB gzip**, lazy Scene **253.72 kB gzip**, main CSS **12.30 kB gzip** (plus 0.32 kB Scene CSS). Scene ceiling is approximately **291.78 kB gzip** (+15%). Do not evade the limit by moving 3D code into the eager bundle; report both eager and total lazy 3D changes.

Read-only renderer measurements at 390 × 844, Chrome, DPR 1, unchanged local code:

| Fixture/view | Draw calls | Triangles | Geometries / textures |
|---|---:|---:|---:|
| Default five-space sample, inside/orbit | 39 | 3,156 | 23 / 5 |
| Compact preset, furnished Top | 34 | 3,664 | 35 / 5 |
| Courtyard preset extended to eight floors, inside | 330 | 30,528 | 144 / 6 |
| Same eight-floor fixture, See outside | 185 | 26,662 | 84 / 6 |

The sample frame counter remained at 2 across a one-second idle interval. These are scene-complexity samples, not mobile FPS guarantees. Historical documentation's 36/96-call examples use different scenes/settings; use named fixtures and matching view settings for Gate 2 comparisons. Fixture measurements used fresh browser contexts and did not replace existing saved projects. The eight-floor check also retained floor-7 selection through Rooms and exited Focus with Escape without page errors.

Budgets/verification:

- Idle: no continuing frame count after controls/animations settle; repeat over at least two seconds.
- Default furnished single floor: target no more than 200 draw calls, hard review threshold 300 including the documented measurement passes. Record triangles, memory and programs alongside calls.
- Camera/drag/sheet: target p95 active frame time at or below 33 ms in a repeatable mobile-sized Chrome trace; pointer-to-feedback below 100 ms. Report device/CPU/DPR and avoid claiming representative physical-phone performance from headless traces alone.
- Preserve `frameloop="demand"`, lazy Scene, shared caches and the current DPR ceiling of 1.5. Try a floor of 1 with hysteresis during active interaction if measurements justify adaptation. Do not run a perpetual sampling loop just to drive a performance monitor.
- During gestures, render the stable building plus lightweight selected-piece proxy, omit small decorative parts, and restore detail once on settle. Do not rebuild every floor's merged furnishings on every pointer event.
- Filter floors/hidden interiors before descriptor generation; retain visible exteriors. Compare closed-roof, isolated-floor and all-floor counts.
- Repeated edit/undo/floor/finish cycles should reach a bounded memory plateau after warm-up. Dispose temporary/obsolete geometry; never dispose shared textures/materials from an individual room cleanup. Test StrictMode mount/cleanup.
- No post-processing stack, external fonts/models/textures, large downloaded assets, or runtime service requests.

## 9. Accessibility and focused verification

Use 48 × 48 px primary pointer targets, at least 44 × 44 secondary targets, 16 px important body text and normally at least 15 px labels. Verify 4.5:1 normal-text contrast and 3:1 UI/focus contrast where applicable. Test zoom/reflow and large text without clipping numerical controls. Keep focus visible above overlays with scroll padding and deliberate focus return. Model selection is mirrored in a semantic Rooms list; do not pretend WebGL meshes alone form an accessible UI.

Announce gesture start, changed validity/blocker, commit and cancellation through a deduplicated polite status region. Do not announce every pointer movement. Reserve alerts for actionable failed operations/storage problems. Reduced motion disables camera interpolation, sheet springing, ghost return animation and nonessential damping while retaining immediate feedback.

Unit/integration tests:

- Strict move into Kitchen returns Bedroom 1 as source, Kitchen as blocker, correct floor/bounds, and leaves original data unchanged. Include multiple blockers, unit bounds, balcony overflow and linked-floor conflicts.
- Legacy auto-swap and explicit use-swap retain names/uses/walls/ownership semantics. Strict move cannot silently swap.
- Preview/final parity for each component and transform intent; 10 cm grid, edge/centre snaps, thresholds/ties/hysteresis, invalid snap rejection and all resize anchors.
- Transaction start/update/end/cancel: one commit on release; zero on cancel/lost capture/stale document; ignore unrelated pointer IDs; no stale tray-drop replay.
- Controller transitions preserve document/history ownership; closing a surface clears relevant feedback and restores sensible selection/focus.
- Architectural and furnishing descriptors are deterministic, bounded, correctly owned and visible at the intended levels. Test wall T/corner junctions, opening preservation, balcony rails and stair landing continuity with focused geometry assertions rather than whole-scene snapshots.
- Retain every v1 fixture, v2 optional-field, JSON round-trip, 1 MB/limit, corrupt-save, storage-failure, tray and multi-floor regression.

Browser tests at **320 × 740, 390 × 844, 430 × 932, 768 × 1024, 1280 × 800**:

- Save the Canvas DOM reference and WebGL context identity. Open Rooms/select, My plot, View, Add space, Move, Resize, Tray and Floor plan; assert the same connected Canvas remains visible. Assert x/y/width/height within 1 CSS px before/after ordinary inspector opening and snaps, and unchanged camera scale.
- Check actual rendered-house bounds/pixels, not just `.model-canvas` size. Peek starts compact; no toolbar intersects another; safe-area padding is honored. Expanded details remain secondary and scroll internally.
- Select real room/furnishing pixels, not solely a DOM label. Move and resize in assisted 3D; test valid snap, invalid drop, visible/textual blocker, return to source, cancellation and each accessible alternative. Project storage/history is the oracle for atomic commits.
- Exercise mouse, native CDP touch, second-pointer cancellation, release outside the object, lost capture, floor/tool changes mid-gesture, and Escape. Assert orbit is disabled only for the owned transform and restored afterward.
- Operate sheet drag snaps and Expand/Collapse/Close entirely by keyboard and tap. Check focus restoration, no focus beneath fixed controls, primary target sizes, large text, safe-area values and reduced-motion camera/sheet behavior. Include on-screen-keyboard/visual-viewport handling where emulation permits; physical iOS/Android remains a separate check.
- Test Fit, Top, Front, Focus room and Focus mode separately. Projected home bounds stay inside the intended clear region; unrelated naming/finish/inspector actions do not reset a user orbit.
- Undo/redo then reload, v1/v2 import/export, shared-space edits across floors, tray transfers, removal confirmation, unit assignment, setup, PNG sharing mocks and corrupt-save recovery remain functional.
- Assert meaningful WebGL pixels, no unexpected page/console/WebGL errors and no external service/asset requests. Distinguish the existing intentional WebGL support-probe context-loss diagnostic from a rendering failure. Use a production-preview pass to exclude Vite HMR traffic.
- Inspect final screenshots: 320 default; 390 selected room; 390 invalid move; 430 expanded details; 768 and 1280 workspace. Save before/after metrics using identical fixtures and settings.

Repository commands, unchanged:

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
git diff --check
```

## 10. Acceptance and rollback

Gate 2 is complete only when the persistent-Canvas and stable-camera assertions pass at all target sizes; room selection opens peek; the model remains visibly dominant; 3D Move/Resize, snapping, invalid return and blocker recovery work for supported components; tap/numeric/keyboard alternatives and atomic history remain intact; v1/v2 and corrupt-save behavior pass unchanged; and measured assets/rendering stay within the stated budgets or an explicitly approved revised budget.

Review the complete diff for accidental scope expansion and scan dependencies/source for credentials, external assets/services, and new runtime network paths. Update documentation to match delivered behavior and explicitly retain the deferred interior/paint boundary. A physical mid-range phone and first-time older-user session are additional evidence needed before making real-device/usability claims.

Each phase should be reviewable separately. Roll back in reverse dependency order; avoid shipping phases 3–4 partially wired together. Phase 1 is behavior-preserving, phase 2 does not alter saved geometry, and all subsequent presentation/issue state is transient. Schema/save keys remain v2-compatible, so reverting UI/rendering code does not require a destructive data migration. Retain baseline fixtures/screenshots and run the legacy suite after any rollback. Do not clear browser storage as a recovery strategy.

Approval requested: proceed with these six phases, including strict physical movement in assisted 3D and preserved legacy use-swap behavior in the optional plan lens. Implementation begins only after approval. No push or deployment is included.
