# Dream Home

A warm, playful 3D sandbox for building the home you keep imagining. Pick a
starting home, move rooms like puzzle pieces, place doors and windows, furnish
every room, style the roof and garden — then walk right in and take a photo.
React, TypeScript, Vite, React Three Fiber and Three.js, with furniture modelled
in Blender. No account; everything saves on your device. An optional **AI
designer** (Claude Opus 5.5 through one small server function) designs a whole
furnished home from four taps; without it, a built-in planner does the same job
offline.

[Open Dream Home](https://dream-home-liard-nine.vercel.app/)

## Run locally

Node.js 22.12+ (verified on Node 24):

```sh
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). `npm run build` creates `dist/`;
`npm run preview` serves it locally. GitHub's `main` branch is the Vercel
deployment source.

### The AI designer (optional)

Copy `.env.example` to `.env.local` (never committed), set
`ANTHROPIC_API_KEY=...` and run `npm run dev`: the dev server also serves
`/api/*` from `server/*.ts`. Without a key the app uses its built-in planner.

On Vercel, set the same variables in Project → Settings → Environment
Variables. **A deployed site needs the Upstash Redis / Vercel KV integration**
(`KV_REST_API_URL`, `KV_REST_API_TOKEN`): without it the server refuses AI work,
because per-instance memory can't enforce the per-device limits or the daily
budget (`AI_DAILY_BUDGET_USD`, default 10). `AI_DISABLED=1` switches every AI
feature off at once. `.env.example` lists every variable and limit.

After changing `server/` or `src/ai/`, run `npm run build:api` to regenerate the
committed `api/index.js` (`npm run build` does it too; `npm run check:api`
fails if it's stale).

> The project lives in an iCloud-synced folder on the author's machine, so
> `node_modules` is a symlink to an un-synced `node_modules.nosync`. If
> `npm install` replaces the symlink, restore it with
> `rm -rf node_modules.nosync && mv node_modules node_modules.nosync && ln -s node_modules.nosync node_modules`.

## Play

1. **Design with AI** — *Design my home with AI* asks four one-thumb questions
   (plot and facing, who lives here, must-haves such as an attached bathroom,
   pooja room, parking or Vastu, and a style) and returns a complete, furnished,
   styled home with short design notes, *Try another* and *Keep it*. Inside
   a room, *Make it nice* restyles just that room. 3 free home designs and 10 room
   makeovers per device; after that (or offline) the built-in planner steps in.
   The AI only proposes; the app's own layout engine builds, so the result is
   always a valid, editable home.
2. **Start** — a first visit asks one question with two big choices: *Design
   it for me* (the AI designer) or *Pick a ready home*, plus *Just show me a
   sample home* and *Open a saved file*. Returning visitors get *Continue my
   home* and **My homes**: up to 12 homes kept on the device, each with a mini
   plan, opened or deleted in a tap. Starting, importing or AI-designing a home
   adds it to My homes; the home you were working on stays safe. The gallery has eight
   starting homes (cosy bungalow, garden villa, duplex, courtyard home,
   apartment block, shop + home, little market, blank plot) with live 3D
   previews and simple steppers. *Start with my plot* opens the detailed
   wizard for measured plots, 1–8 floors and apartments or shops. A short
   construction reveal and a three-step tour follow (replay it from More).
3. **Home** — the 3D home is the hero, with four big actions: **Add room**,
   **Outside**, **Explore** and **✨ AI design**. Add room is one sheet with
   three sides: *Add new* (rooms, balconies, courtyards and stairs; when the
   house is full it offers **Grow house & add** in one tap), *Your rooms* and
   *Set aside* (rooms waiting to be placed back). The floor plan, view presets
   and *Fit home* sit at the right edge; phones pinch to zoom.
4. **Step into a room** — tap any room, or its name in the picture, and it
   becomes the hero: the camera flies in, the walls around it drop to low
   plinths, its neighbours fade and it glows. ‹ › (or a swipe on its header)
   steps to the next room; the house button goes back home. Its tray has four
   tabs:
   - **Furniture** — about sixty pieces of chunky, rounded furniture with real
     thumbnails, *Make it nice*, *Auto-furnish* and *Empty the room*. Tap a
     piece to nudge, turn, copy, recolour or move it to another room, or drag
     it — even into another room.
   - **Colours** — wall paint, an accent wall and the floor (oak, walnut,
     herringbone, tile, terrazzo, marble, stone, slate, concrete, carpet).
   - **Layout** — Move (drag the room right in 3D; drop it on another room to
     swap, or on *Set aside*), Edit in 2D (drag to move, pull a dot to resize),
     Rotate, Duplicate, Set aside and More (*Add attached bathroom*, Remove),
     plus exact sizes, position and use.
   - **Doors** — every door and window: add doors, French and sliding doors,
     archways, windows and picture windows; slide, resize, move or flip them,
     or make the floor automatic again. Every door is checked to open into a
     room or a real passage, and every room can be reached from the front
     door or the stairs.
5. **Designer interiors** — new and automatically furnished rooms come
   designed: a bed against a feature wall with a headboard panel, bedside
   lamps, a wardrobe, a rug and curtains; a sofa facing a TV on a fluted
   panel with a coffee table, armchair and dining set; a kitchen with wall
   cabinets, a backsplash and a chimney; a pooja shrine with a diya and mat.
   Colours are coordinated with the home's look, and lamps really light the
   rooms at night.
6. **Outside** — choose the outside walls (plaster, brick, sandstone, stucco,
   render, timber, stone, concrete, charcoal, lime plaster, laterite, egg-white
   plaster, golden sandstone, fair-faced concrete, wood slats and more), a flat,
   gable, hip or shed roof with material (including Mangalore clay tiles) and
   steepness, trim and front-door colours. One-tap **Looks**, each shown as a
   rendered card: Indian modern and Indian classic, six **regional homes**
   (Kerala, Chettinad, Rajasthani, Goan, Mumbai modern, Bengaluru contemporary)
   and the original Diorama. A look sets the outside (with chhajja sunshades or
   arched windows, a rooftop water tank, grille or jaali balconies, a compound
   wall with a gate and a car porch), coordinated rooms (red-oxide, Athangudi,
   Kota stone, vitrified or azulejo floors) and the garden (coconut palms, neem,
   a tulsi planter, lush front planting). Tapping a look tries it; the toast
   offers Undo. Explore shows a lively Indian street (people, a cow, a dog, a scooter,
   an auto-rickshaw and street lights), switchable in View options. Plant trees,
   shrubs, flower beds, hedges, a pool, paths, patios, lamps and benches; pick
   the ground and a fence.
7. **Explore** — admire the home on a turntable, slide the time of day from
   morning to a glowing night, and walk inside with the keyboard, a thumb
   joystick or tap-to-walk; stairs take you between floors. **Lived-in
   details** make it feel like home: shoes by the door, chai and the newspaper
   on the coffee table, a pressure cooker on the hob, a sleeping cat, clothes
   drying on the balcony or terrace, a scooter out front, a toran over the door;
   ceiling fans turn and curtains sway. They are never saved, so editing stays
   tidy, and they can be switched off in View options.
8. **Photo** — the camera (View options, Explore, a room's header, or Share)
   opens the **Photo studio**: pick *This view, Room, Front* or *Aerial*, a
   mood (*Morning, Noon, Golden hour, Night, Diwali night*) and a shape
   (*Story 9:16, Square, Post 4:5, Wide 16:9*), lived-in details on or off
   (Diwali night adds diyas, string lights and a rangoli), then *Take photo*. A few
   seconds later you get a render-quality picture with soft shadows, ambient
   occlusion, clean edges and glowing lamps, ready to *Share* or *Save*, with
   an optional small Dream Home mark. Devices that can't make the full render
   get a quick picture of the view instead.
9. **Share** — *Make my link* gives a short link (`/h/…`) anyone can open on
   any phone to see the home turning in golden light, walk inside it, and
   **Remix this home** into their own My homes (their own home stays safe).
   WhatsApp and other apps show a rendered golden-hour picture and the home's
   name. The
   sharer sees views and remixes, can *Update link* after changes and *Stop
   sharing* at any time; the city and name are private unless chosen. Plan
   images per floor and a JSON backup are under *More ways to share*.

**Never lost:** every change can be undone (with a description of what it
undid), removing a room asks first and offers *Keep for later instead*, and the
browser/phone Back button closes the top panel instead of leaving the app.
**Friendly checks:** a Home checklist notices rooms without doors, bedrooms
without windows, missing stairs, kitchen or bathroom — "friendly checks, not
building-code checks". Every starting home passes it; finishing the essentials
celebrates with confetti, then the pill counts "make it yours" ideas to try.

**Accessible:** every drag has a tap, keyboard or number alternative; targets
are 44–48 px; selections are announced to screen readers; reduced-motion
settings turn off camera glides and animations; `?` lists keyboard shortcuts.
**Text size** (More → Normal, Large, Extra large) scales every word and grows
buttons to 56 px for easier reading and tapping, and soft generated **sounds
and vibration** confirm each change (switchable in More).

## Architecture

- `src/domain/` — the pure model in integer centimetres (schema v2 with optional
  additions for openings, furniture, materials and landscape), validation with
  structured issues (`validate.ts`), a single edit gate (`edit.ts`), walls with
  multiple openings (`walls.ts`), openings/furniture/landscape/materials
  commands, the home checklist (`advice.ts`) and catalogs shared with Blender
  (`catalog/*.json`). Golden snapshot tests lock the automatic layouts.
- `src/history.ts`, `src/useProject.ts` — undo/redo with labels and selection
  restore; local saving and safe recovery of damaged saves.
- `src/editor/` — the UI controller (a pure reducer), shortcuts, spatial maths,
  the gesture state machine and snapping previews.
- `src/shell/`, `src/onboarding/`, `src/explore/`, `src/ui/` — the workspace
  chrome, title/gallery/tour, Explore HUD and walkthrough, design tokens and
  primitives.
- `src/ai/`, `server/`, `api/` — the AI designer: brief validation, strict JSON
  schemas built from the catalogs, prompts, the built-in planner, the engine that
  turns a plan into a valid home (`buildHome.ts`), the mobile-first brief UI;
  the server: one router (`server/router.ts`) for every `/api/*` route, with
  same-site checks, capped request bodies, atomic per-device/IP limits and a
  daily spend cap (`server/limiter.ts`), and the site's security headers
  (`server/headers.ts`, mirrored in `vercel.json`). `scripts/build-api.mjs`
  bundles it into the one Vercel function `api/index.js`.
- `src/scene/` — renderer v2: perspective camera rig with inset-aware framing,
  procedural sky with time of day, image lighting, shadows, materials, building
  geometry (junctions, openings, cutaway section fill, stairs, roofs, porch),
  GLB furniture and garden props, quality tiers with lazy post-processing, and a
  debug bridge (`window.__dreamHome`) for tests.
- `scripts/blender/` — headless Blender scripts that model the furniture,
  garden, street and lived-in kits; `npm run assets` rebuilds `public/models`
  and `public/thumbs` (`-- --step life` just the lived-in kit; requires Blender
  5.1; the web build never needs Blender). `npm run looks:thumbs` renders the
  look cards in `public/looks` with the scene lab.

See [the diorama sandbox design](docs/DIORAMA-SANDBOX.md) and
[verification](docs/VERIFICATION.md). Earlier design notes stay in `docs/` as
history.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run check:api
npm run test:e2e
npm run test:preview
```

`test:preview` builds the app and serves it with the production headers, then
checks the Content-Security-Policy has no violations and the bundled API holds
its guards.

Browser tests use installed Google Chrome, run with reduced motion for stable
layouts, and cover mouse, keyboard and native touch.

## Scope

A conceptual sandbox to discuss with an architect. One building, rectangular
aligned floorplates, rectangular rooms, fixed 3 m storeys. Doors, windows,
stairs and checks are illustrative and do not establish structural safety,
access, local-law compliance or cost. Limits: 8 floors, 48 rooms per floor,
32 furniture pieces per room, 120 garden items; imports are bounded to 1 MB.
