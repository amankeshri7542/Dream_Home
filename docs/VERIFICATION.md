# Dream Home v5 verification — 18 October 2026

v5 (M0a–M8): share links and the viewer, Photo mode, regional looks and lived-in details, the video reel, the real sun with Sunlight, Vastu and the Home score, starting from a builder's plan, Talk to your home, and the installable, offline app. Checks were run locally on macOS (Apple M4) with Node 24 and Google Chrome, then on the live site after each push.

| Command | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npm test` (Vitest) | **974 tests** in 53 files passed |
| `npm run build` | passed |
| `npm run check:api` | passed (`api/index.js` matches `server/*.ts`) |
| `npx playwright test` (Chrome, reduced motion) | **142 passed**, 36 skipped (screenshot and timing runs, `DH_SHOTS=1` / `DH_REEL_BENCH=1`) |
| `npm run test:preview` (production build and headers) | **7 passed**: no CSP violations through every studio and sheet; the bundled API's guards; offline after one visit |
| `git diff --check` | passed |

What v5's checks cover (details per phase in [`ROADMAP-V5.md`](ROADMAP-V5.md)):
- **Never live AI in tests:** every `/api/*` that calls Claude is mocked in browser tests and injected in unit tests. Real calls are made only with the owner's go-ahead.
- **Security:** headers defined once and matched by `vercel.json`; the CSP checked on the production build with every lazy feature opened; same-site checks, body caps, atomic limits and budgets, fail-closed without KV, the kill switch; nothing said or read reaching the logs; every AI answer checked against its schema or tool and the home's refs.
- **Accessibility:** axe (WCAG 2.1 A/AA, serious and critical fail) on Home, every room tab, Outside, Explore, the title screen and gallery, and every v5 sheet (share, viewer, photo, video, talk, the plan's steps and check, sunlight, the Home score with Vastu, My homes, settings) at 390 and 1440 px.
- **Performance:**
  - first-load JS: **228.0 KB gzip, +28.5 KB over v4** (199.5 KB, measured the same way on both builds), within the +30 KB budget; everything else loads on first use;
  - the viewer reaches 3D in about 1.1 s on a warm cache (1.2 s cold) on the Mac; a mid-range phone still needs checking;
  - Build ≤ 90 draw calls with 0 idle frames, Explore ≤ 160 (checked by `interiors.spec.ts` and `indian.spec.ts`).
- **Phones first:** new screens checked at 320 (Extra large text), 360, 390, 768, 1280 and 1440 px, no horizontal scroll, screenshots under `docs/screenshots/` looked at by eye.
- **Independent reviews (M8):** a usability review as three personas (an 8-year-old, a parent, a grandparent) and a security review, each by a fresh subagent. All P0, P1, high and medium findings are fixed; what's left is listed in the roadmap and `SECURITY.md`.

Not verified here (needs the owner's phone or accounts): the reel in WhatsApp and Instagram, the share preview in WhatsApp, Hindi speech on a real phone, installing from Chrome on Android and Safari on iPhone, and the live AI features (they need KV connected and a go-ahead for real calls).

---

# Dream Home v4 verification — 17 October 2026

Room Studio, doors that always work and designer interiors. Checks were run locally on macOS (Apple M4) with Node 24 and Google Chrome. Nothing was committed or pushed.

| Command | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npm test` (Vitest) | **687 tests** in 37 files passed |
| `npx playwright test` (Chrome, reduced motion) | **93 passed**, 12 skipped (screenshot captures, run with `DH_SHOTS=1`) |
| `npm run build` | passed |
| `git diff --check` | passed |

What the new checks cover:
- **Doors:** every starting home (each template × plot × bedroom count) and every AI-planner brief has 0 rooms nobody can reach and 0 doors opening onto a wall or a gap. Before the fix, 83 of 196 had at least one.
- **Room Studio:** tapping a room flies to it and keeps it clear of the tray. The tabs (Furniture, Colours, Layout, Doors), ‹ › stepping, the piece view, Back to home, history that never changes level, moving and Edit in 2D inside a room, the action bar's More menu, and set-aside drops are all exercised. axe scans cover Home, each room tab, Add room, Outside and Explore at 390 and 1440 px.
- **Designer interiors:** draw calls stay at 76–79 in Build with 0 idle frames; the night walk lights the lamps. Screenshots of the bedroom, living room, kitchen, dining room and pooja room at 390 and 1440 px, day and night, are in `docs/screenshots/interiors/` and were inspected by eye.
- **Desktop and phone walkthrough** (1440 × 900 and 375 × 812):
  - Home shows four actions;
  - a room opens in the side panel (desktop) or the tray (phone);
  - all six Layout actions fit;
  - the floor plan docks beside the 3D view;
  - phones show three round buttons instead of six.

---

# Warm diorama sandbox verification — 14 October 2026

Checks were run locally on macOS (Apple M4) with Node 24 and the installed Google Chrome. Nothing was committed or pushed.

## Commands
| Command | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npm test` (Vitest) | **544 tests** in 27 files passed |
| `npm run test:e2e` (Playwright, Chrome, reduced motion) | **75 tests** passed |
| `npm run build` | passed |

The Playwright suite covers:
- shell stability (one canvas mount at 320–1280 px);
- onboarding, and every mode (Build, Doors & windows, Decorate, Outside, Explore);
- direct 3D moving with mouse and real CDP touch: swap, blocked drop, Escape, orbit on empty space, drop on the Tray;
- dragging furniture in Decorate on phone and desktop, including a refused drop with a reason;
- the first-person walk: keyboard, joystick from a standstill, tap-to-walk, and floor buttons;
- photo capture, the checklist and its celebration;
- the legacy plan, tray, blueprint and studio flows;
- axe accessibility scans (WCAG 2.1 A/AA, serious and critical findings fail) of every mode at 390 px and 1440 px, plus the title screen and gallery.

## Child-usability review
An independent review agent walked the whole journey as an 8–12-year-old would, at 360, 390 and 768 px (touch) and at 1280 and 1440 px. It reported one P0, 13 P1 and 12 P2 findings.

**Fixed:**
- **Furniture:** pieces can now be dragged in 3D, and nudges move about 1 ft.
- **Walking:** the controls no longer overflow on phones, and the app can no longer scroll sideways.
- **Garden:** pools and patios shrink to fit small gardens, and the error messages are correct.
- **Add space:** it opens on a room that fits.
- **Checklist:**
  - its hints open the tray or the right catalogue entry;
  - every starting home passes its own checklist (all 277 template variants);
  - an inner bedroom's "Fix it" explains the problem and arms Move.
- **Doors and windows:** narrower windows now fit, and a full wall changes an existing window into the kind asked for.
- **Panels:**
  - a newly selected item starts at the top of its panel;
  - choosing a room in Decorate or Doors & windows zooms the camera into it and opens its panel half-way;
  - labels declutter, and the selected room's label steps aside.
- **Navigation:** More → Start a new home opens the friendly gallery.
- **Wording:** kid-friendly copy in My plot and the menu.
- **Desktop layout:**
  - the action bar fits between the side panels;
  - the camera no longer slides when a panel opens, unless the panel would cover the home.
- **Small details:**
  - the celebration shows only for real progress, at most once per visit;
  - the checklist goal now counts "make it yours" ideas;
  - a peek and a count in the gallery;
  - the tour starts after the reveal;
  - the drag badge stays in view;
  - tray buttons no longer wrap one word per line;
  - home names can use two lines on small phones;
  - a window icon;
  - areas follow the unit setting;
  - messages fade by themselves;
  - a warm light follows the visitor on night walks.

**Still open:**
- quick-add strips in the closed phone sheet;
- moving the camera to a newly added item;
- scenery outside windows while walking;
- a visible label on the picture-quality button.

## Compatibility
- Saves stay at `schemaVersion: 2` with optional additions only.
- 57 golden snapshots lock the automatic walls, openings and furniture of every generated home to their pre-transformation output.
- v1 and v2 fixtures parse unchanged.

**Rollback note:** an older build opening a newer save keeps the rooms and drops the newer optional fields (openings, furniture, materials, garden) when it saves again.

## Render measurements
These are from headless Chrome on an Apple M4 at the Balanced tier, using the sample home. They describe scene complexity, not frame rates on phones.

| View | Draw calls | Triangles |
|---|---|---|
| Build | 51 | 20.5k |
| Explore exterior | 41 | 8.1k |
| Walk inside | 64–72 | 27–29k |

- **Idle:** 0 frames rendered over 2 s.
- **8-floor apartment exterior** (renderer lab, 390×844): 118 calls and about 34k triangles.
- **External requests:** none at the Beautiful tier.
- **Models blocked:** with `models/*.glb` blocked, procedural furniture renders and there are no page errors.

## Bundle (production build, gzip)
| Chunk | Size | Loaded |
|---|---|---|
| App | 167 kB | eagerly |
| 3D vendor (three, R3F, drei) | 237 kB | lazily |
| Scene | 65 kB | lazily |
| Post-processing effects | 164 kB | lazily, never on the Battery tier |
| Walkthrough | 3.3 kB | lazily |
| 3D move and furniture-drag gestures | 4 kB | lazily |
| GLTF loader + meshopt decoder | 19 kB | lazily |

The eager app chunk is above the original ~125 kB goal because of the new openings, furniture, landscape and material domains.

## Visual checks
Screenshots were taken and inspected at:
- 320×640
- 360×740
- 390×844
- 768×1024
- 1280×800
- 1440×900/1000

The flow covered:
1. title and gallery;
2. the construction reveal and tour;
3. selection, the dock and details;
4. 3D Move with ghost, swap, blocked and tray states;
5. each mode;
6. Explore at golden hour and at night;
7. walking upstairs in a two-floor home;
8. a photo;
9. the checklist celebration.

## Not verified
- Physical iOS and Android devices.
- Usability sessions with real children and older users.
- Real OS share delivery.
- Low-end GPU frame rates.
- Architectural or code compliance. All checks in the app are friendly suggestions only.

---

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
