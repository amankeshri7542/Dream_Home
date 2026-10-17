# Dream Home: guide for Claude

Dream Home is a warm, phone-first 3D home designer for Indian families. You tap
a room to step inside it, and furnish, paint, move and resize it like a game;
then you explore the home in 3D, day or night. An optional AI designer builds a
whole furnished home from four taps. It's live at
https://dream-home-liard-nine.vercel.app (moving to `home.amankeshri.com`).

**Stack:** React 19 · TypeScript (strict) · Vite 7 · React Three Fiber 9 / three
0.180 · Vitest · Playwright (installed Chrome) · one Vercel function for the server ·
furniture modelled in Blender.

## Start here
- **Current work:** [`docs/PLAN-V5.md`](docs/PLAN-V5.md) is the v5 plan, and [`docs/ROADMAP-V5.md`](docs/ROADMAP-V5.md) has progress, decisions and **Resume here**. Read both before changing anything.
- **How the app works today:** `README.md`, plus `docs/ROADMAP-V4.md` (Home → Room studio, doors, designer interiors).

## How we work
- **One phase at a time** (M0b, M1, M2 … as named in the plan or by the owner). Finish everything in it: the build, the tests and every "Done when" item.
- **At the end of a phase:**
  1. Run the full gate (below). Look at any screenshots the tests write, by eye.
  2. Update `docs/ROADMAP-V5.md`: Resume here, Decisions, Log.
  3. **Commit and push to `main`.** Vercel deploys it live.
  4. Check the live site: it loads, and `curl` of an API route answers.
  5. **Stop.** Tell the owner what changed, what was tested and anything they need to click. Wait for their go-ahead before the next phase.
- **Push with the owner's GitHub account:** `gh auth switch -u amankeshri7542`, `git push origin main`, then switch back to the previously active account. Never force-push.
- **Ask the owner only for decisions that are theirs:** money, accounts, legal, or taste with no clear winner. Otherwise choose what serves the plan's principles and write the choice in the roadmap.
- **Never change Vercel settings yourself** (env vars, domains, integrations). Give the owner exact steps.

## The gate
```sh
npm run typecheck
npm run lint
npm test                 # Vitest: domain, editor, scene maths, server
npm run build            # tsc + API bundle + Vite build
npm run check:api        # the committed api/index.js matches server/*.ts
npx playwright test      # browser tests against `npm run dev`
npm run test:preview     # production build + production headers: CSP and API checks
git diff --check
```
- Run a single browser spec with `npx playwright test tests/<name>.spec.ts --reporter=line`.
- Playwright reuses a dev server on :5173 if one is running.

## Rules that always apply
- **`node_modules` is a symlink** to `node_modules.nosync` (the folder syncs to iCloud). After any `npm install`, restore it:
  `rm -rf node_modules.nosync && mv node_modules node_modules.nosync && ln -s node_modules.nosync node_modules`
- **No live AI spend without asking.** Tests always mock `/api/*`. Before any real call to Claude, ask the owner and give the rough cost.
- **Secrets stay on the server.** The browser never talks to Anthropic, KV or Blob directly. Never commit `.env*` (except `.env.example`) or `.claude/`.
- **No runtime requests to other hosts:** no CDNs, map tiles, web fonts or analytics. The Content-Security-Policy (`server/headers.ts`) enforces this; `npm run test:preview` proves it.
- **Phones first** (360, 390, 768 px), then desktop (1280, 1440). No horizontal scroll. Touch targets ≥ 44 px. Every drag has a tap or keyboard alternative. Respect reduced motion.
- **Rendering stays calm:** `frameloop="demand"` with **0 idle frames** in editing views; Build ≤ 90 draw calls; Explore ≤ 160. Animate only while something moves, and only in Explore, Photo or Reel (gated like `src/scene/street/StreetLife.tsx`).
- **Degrade gracefully:** no AI key means the built-in planner; missing browser features get a friendly fallback.

## Code conventions
- **The domain (`src/domain/`) is pure TypeScript in integer centimetres.**
  - Every edit is a pure function `(Project, …) → EditResult` that ends in `finalizeEdit` (reconcile, then validate).
  - New saved fields must be added to `parseProject` (`src/domain/model.ts`) **and** the whitelists in `src/domain/persist.ts`, or they are silently dropped on load.
- **Edits reach the UI through `run(result, label)` / `commit(project, label)`** from `src/editor/EditorProvider.tsx`. That gives one undo step with a human label. Chain several domain calls into one `run` when they form one user action.
- **The editor reducer is `src/editor/state.ts`.** Rooms open as the hero via `enter-room`; the room tabs map onto modes (`TAB_MODE`).
- **My homes** (`src/homes/`):
  - The open home saves to `dream-home.project.v2` exactly as before.
  - The shelf index lives in `dream-home.homes.v1`, and every home's full copy in IndexedDB.
  - New homes go through `editor.homes.create(project)` (or `addHome` in `src/shell/Dialogs.tsx`, which explains failures), never by overwriting the open home.
- **Text size:** every font size is written as `calc(Npx * var(--dh-text))` (`--dh-text` is 1, 1.18 or 1.36; see `src/ui/styles/textsize.css`). New CSS must follow the same pattern. Check new screens at 320 px in Extra large.
- **Share links** (`src/share/`, `server/share.ts`, `server/og.ts`):
  - `/h/:id` opens `src/share/ViewerApp.tsx`, routed in `src/main.tsx`. It never mounts the editor; Remix writes My homes directly (`src/share/remix.ts`).
  - The server re-validates every shared home with `parseProject` and stores the cleaned copy, gzipped, in private Vercel Blob. Records live in KV. Edit tokens are stored only as SHA-256 hashes.
  - Link-preview robots get `/api/og` through a user-agent rewrite in `vercel.json`.
  - Admin actions are in `docs/SECURITY.md`.
- **Photos** (`src/photo/`):
  - `renderPhoto` (`render.ts`) borrows the live renderer, scene and lights, renders offline into its own targets, and must put back everything it changes. Keep it lazily imported; it pulls in n8ao.
  - Ask for a photo through `makePhoto` in `src/shell/AppShell.tsx`: it sets a job that `PhotoRenderer` runs inside the Canvas. The studio, the share-link picture and (later) the reel all use this path.
  - What each framing shows lives in `photoView` (`src/shell/SceneHost.tsx`); where the camera stands is in `src/photo/framing.ts`. Moods and sizes are in `src/photo/settings.ts`.
  - Tests make tiny photos with `window.__dreamHomePhotoTest = { longEdge, samples, fail }` (see `tests/photo.spec.ts`).
  - Shader uniforms must not use GLSL reserved words (`sample` silently broke a shader once).
- **The reel** (`src/reel/`):
  - Ask for a video through `makeReel` in `src/shell/AppShell.tsx`: it sets a job that `ReelRenderer` films inside the Canvas. Filming (`film.ts`, with mediabunny and the QR encoder) loads only then; the studio is its own lazy chunk.
  - `reelPath` (`path.ts`) is the pure shot list: each shot's view, light and camera move. Filming shows each shot's scene through `setReelScene`, settles, then renders every frame offline with the photo pipeline (`createPipeline` in `src/photo/render.ts`) on the store's clock, never on screen.
  - The music is pure synthesis (`music.ts`), so it is testable and royalty-free.
  - Tests make tiny reels with `window.__dreamHomeReelTest = { width, height, seconds, samples, capture, noVideo }` (see `tests/reel.spec.ts`); `DH_REEL_BENCH=1` times full-quality ones.
- **Insights** (`src/insights/`, compass in `src/domain/compass.ts`):
  - `plot.north` turns plan-up to true north; `plot.compass` says it's real (the homeowner set which way the home faces: `setFacing` in `src/domain/place.ts`). Until then sides are Front/Back/Left/Right (`sideName`).
  - With `plot.location`, `lighting(hour, north, place)` uses the real sun (`solar.ts`, NOAA, IST); the day comes from the editor's `season` as `sunDate`.
  - `sunHours`/`sunTips` (`sun.ts`), `vastuReport` (`vastu.ts`, loaded lazily via `useVastuScore`) and `homeScore` (`score.ts`) are pure. The Home score ring is `src/shell/Checklist.tsx`.
- **Looks and lived-in details:**
  - A look's outside bundle, room palettes, garden and card text live in `src/domain/looks.ts`; card pictures are `public/looks/<id>.webp` (`npm run looks:thumbs`).
  - Lived-in details are derived, never saved: `livedInDecor` (`src/domain/livedIn.ts`) places them, `src/scene/life/LivedIn.tsx` draws them in Explore and Photo only. Their models come from `public/models/life.glb` (sizes in `src/domain/catalog/life.json`).
  - Idle animation goes through the gate in `SceneRoot` and `useIdleTicker` (`src/scene/motion.ts`) and reads the store's shared clock (`store.time()`).
  - GLTFLoader strips `:` from node names; read kit names with `gltfName()` (`src/scene/props/kit.ts`).
- **Feedback:** `feedback.pop() / click() / error() / success()` from `src/ui/feedback.ts` play soft generated sounds and vibration. `run()` already calls them for edits.
- **Server (`server/`):**
  - Every `/api/*` request goes through `server/router.ts`. Handlers take `(request, env, deps)` so tests inject a fake Claude and store.
  - Use the helpers in `server/http.ts` (`json`, `fail`, `readBody` with a cap, `clientIp`, `deviceOf`) and the limiter in `server/limiter.ts` (add a kind to `DEFAULT_RULES`).
  - On Vercel without KV, paid work is refused.
  - After changing `server/` or `src/ai/`, run `npm run build:api` and commit `api/index.js`.
- **Claude API:**
  - Model ids: `claude-opus-5-5` (designer), `claude-sonnet-5-5` (plan reading), `claude-haiku-5-5` (voice).
  - Check current parameters and prices with the `claude-api` skill before relying on memory, and add new models to the price table in `server/claude.ts`.
- **Library docs:** check APIs with the `ctx7` CLI before using a library feature you haven't verified.
- **Tests:**
  - Browser helpers live in `tests/support/dreamHome.ts` (`seed`, `enterRoom`, `roomTab`, `dock`, `homeAction`, `tool`…). When UI changes, update the helpers, not every spec.
  - Mock APIs with `page.route`, as in `tests/ai.spec.ts`.
  - Tests that check rendering use the debug bridge `window.__dreamHome` (`waitForIdle`, `renderer()`, `camera()`).
- **Comments:** short and about *why*, matching the surrounding code. **Copy:** warm, short, plain English ("Keep for later", "Make it nice"), and errors say what to do next.

## Map
| Path | What lives there |
|---|---|
| `src/domain/` | the home model, validation, rooms/doors/furniture commands, materials and looks, advice/checklist |
| `src/editor/` | the reducer, provider (undo/redo, `run`), preferences, selection actions |
| `src/shell/` | app chrome: Home bar, Room Studio (`studio/`), inspectors, dialogs, checklist |
| `src/scene/` | the 3D renderer: camera rig, materials and shader patches, building geometry, props, lighting, effects, debug bridge; `life/` draws lived-in details |
| `src/photo/` | Photo mode: the studio, the offline renderer, framing, moods |
| `src/reel/` | the "My dream home" reel: studio, shot list, filming, compositor, music, QR end card |
| `src/insights/` | cities, the real sun, sunlight per room, Vastu, the Home score and badges; the Sunlight sheet and pickers |
| `src/share/` | share sheet, the `/h/:id` viewer, Remix |
| `src/homes/` | My homes shelf (IndexedDB) and move links |
| `src/ai/` | the AI brief, prompts, strict schemas, built-in planner, plan → home builder |
| `src/onboarding/` | title screen, template gallery, tour |
| `server/` | the API (router, design, limiter, Claude caller, headers); bundled to `api/index.js` |
| `scripts/blender/`, `scripts/assets/` | the Blender furniture kit and asset build (`npm run assets`, needs Blender) |
| `tests/` | Playwright specs (`tests/preview/` runs against the production build) |
| `docs/` | plans, roadmaps, verification notes, screenshots |
