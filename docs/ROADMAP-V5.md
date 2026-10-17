# Dream Home v5: living roadmap

The full plan is [`docs/PLAN-V5.md`](PLAN-V5.md). This file tracks progress so
work can resume after any interruption. Update it at the end of every phase.

## Resume here
- **Done and shipped (17–18 Oct 2026):**
  - M0a: server router, limiter, Claude pricing, security headers.
  - M0b: My homes, first screen, text size, sounds, "Keep for later", move-by-link.
  - M1: share links, the viewer, Remix, WhatsApp previews, reports, admin.
  - M2: Photo mode (render-quality stills), also used for share-link pictures.
  - M3: six regional looks with new materials and rendered look cards; lived-in details (everyday and Diwali) with idle motion.
  - M4: the "My dream home" reel: a 15 s (or 8 s) vertical MP4 with a title, room names, generated music and an end card with the link and a QR code.
  - M5: a city and the way the home faces give the real sun; the Sunlight sheet (seasons, hour slider, sun per room, tips); opt-in Vastu with swaps; the Home score ring and badges, on the reel's end card and shared homes too.
  - M6: start from a photo of the builder's plan. The AI (Sonnet 5.5) reads it once per device; the homeowner checks the rooms over the faint photo on the 2D plan, fixes them, then "Make it 3D". "Draw it yourself" works with no reading at all.
  - M7: talk to your home. A Talk button (phones: above the Home bar and in the room's header; desktop: the top bar) opens a chat sheet; speak or type in English, Hindi or Hinglish. Haiku 5.5 turns a request into calls from a closed set of 30 tools, run as one undo step; big changes ask first; navigation is answered on the phone without the AI.
- **Next phase: M8.** PWA, usability and security review, docs. First-load budget: about 4 KB gzip left of the +30 KB.
- **Live checks still owed (need KV connected, below, and the owner's go-ahead):** one real plan reading with the sample plan (about ₹4–8; the sample and a one-reading script are ready), and a few real voice commands (about ₹0.1 each).
- **Waiting for the owner's review (not merged):** three small fixes for the balcony that can cost a room its window (found in M3), on branches `claude/vibrant-mestorf-f73f72` (AI builder), `claude/heuristic-zhukovsky-2d08d6` (Add balcony) and `claude/serene-elgamal-3c154b` (checklist).
- **Owner actions pending** (sharing, the AI designer, plan reading and talking are off on the live site until these are done):
  1. Connect **Upstash Redis / Vercel KV** to the project. Limits, the AI budget and share records live there.
  2. Create a **Vercel Blob** store and connect it to the project. Shared homes and pictures live there.
  3. Add `ADMIN_TOKEN`: a long random secret, for hiding or deleting reported homes (`docs/SECURITY.md`).
  4. Redeploy.
  5. Later, when `home.amankeshri.com` works: set `PUBLIC_ORIGIN` and `VITE_PUBLIC_ORIGIN` to it and redeploy.

## Decisions
- **15–17 Oct 2026 (owner):**
  - Features 1, 2, 4, 5, 6, 7, 8 and 10 are in; family voting and the budget estimate are out.
  - English UI only, with Hindi and Hinglish voice.
  - Share links only, no public gallery.
  - Music is generated in the app.
  - AI limits are tight: voice 15 per day, plan reading 1 per device.
  - Vastu is opt-in, as friendly tips.
  - The AI reads plan photos and the user confirms.
  - The domain is `home.amankeshri.com`.
  - "Edit in 2D" keeps its name.
- **17 Oct 2026 (owner):** every phase ends with commit + push to `main`, then a stop for review.
- **17 Oct 2026 (M0a):**
  - **The server fails closed on Vercel without KV.** Live checks found only `ANTHROPIC_API_KEY` set, so limits and the daily budget were per-instance memory and couldn't actually be enforced. Now a deployed server refuses paid AI work (`live: false`, reason `offline`) until KV is connected. The app falls back to its built-in planner, so homeowners are never stuck.
  - **Routing:** one function, `api/index.js`. `vercel.json` rewrites `/api/:route*` → `/api?__route=:route*`, and the router reads `__route` or the path, so it works either way.
  - **Same-site check:** a request that changes something and carries an `Origin` header must come from the same host, `PUBLIC_ORIGIN` or `ALLOWED_ORIGINS`. Requests with no `Origin` (non-browser tools) still face the limits and the budget.
  - **Prices** come from the claude-api skill (Oct 2026):

    | Model | Input / output, $ per million tokens | Cache read |
    |---|---|---|
    | Opus 5.5 | 4 / 20 | 0.20 (was wrongly 0.40) |
    | Sonnet 5.5 | 2 / 10 | — |
    | Haiku 5.5 | 0.10 / 0.50 | — |

    Unknown models are priced high, so the budget errs on the safe side.
  - **Server-side refusal fallback** is sent only to Opus models; Haiku rejects it.
  - **Headers** are defined once in `server/headers.ts`. `vercel.json` must match (unit test), and `vite preview` serves them, so `npm run test:preview` can check the CSP on the real build.

- **17 Oct 2026 (M0b):**
  - **My homes storage:** the open home still saves to `dream-home.project.v2`, so nothing changed for existing users. The shelf index is in `dream-home.homes.v1` (≤ 12 homes) and each home's full copy is in IndexedDB.
  - **Migration:** a device without a shelf gets one holding the home it already has.
  - **The first-visit starter home is replaced, not duplicated,** when someone picks a starting home. Every later new home (gallery, AI, sample, import, plot wizard) is added to My homes with a fresh undo history.
  - **Browsers without IndexedDB** fall back to the old undoable replacement, with a notice.
  - **Text size** uses a codemod: all 347 font sizes became `calc(Npx * var(--dh-text))`. Large and Extra large also raise tap targets to 56 px, let buttons wrap, and make the title card scroll. CSS `zoom` was rejected, as the plan says.
  - **Sounds** are generated with WebAudio (no files), quiet, with vibration on phones. One switch, "Sounds & vibration", on by default.
  - **"Keep for later"** replaces "Set aside" and "tray" in about 45 user-visible strings. The Add room tab is "For later (n)". Internal ids are unchanged, so saves are unaffected.
  - **First screen:** "How would you like to start?" with *Design it for me* and *Pick a ready home*, plus "Just show me a sample home" and "Open a saved file". Returning visitors with more than one home also get *My homes (n)*. *Upload my builder's plan* waits for M6.
  - **Moving homes to the new domain:**
    - The old `*.vercel.app` address offers to move the open home in the URL fragment: gzip, then base64url. A fragment never reaches a server.
    - On arrival the fragment is removed from the address, fully validated with `parseProject`, and decompression is capped at 1 MB (zip-bomb safe).
    - The move stays off until `VITE_PUBLIC_ORIGIN` is set.
  - **`vite:preloadError`:** reloads once (at most once a minute) when a deploy removed old lazy chunks.

- **17 Oct 2026 (M1):**
  - **Storage:**
    - Vercel Blob with **private** access, version 2.8.0, pinned (released more than two weeks earlier, `npm audit` clean). It holds the gzipped shared home and its picture. Every read goes through our routes, so we set every header.
    - KV holds the records: a token hash, name, times, an image flag, hidden, `remixOf`.
    - View and remix counters are de-duplicated per connection (6 h and 24 h).
  - **Server validation:**
    - `schemaVersion` 1 is refused; only homes that `parseProject` accepts are stored, in their normalised form.
    - Names pass through `publicName`, which removes links, e-mail addresses and phone numbers (runs of 8+ digits; "Plot 12 - 2024" survives) and `<` `>`.
    - The city is stripped unless `showCity`.
  - **Reads** are CDN-cacheable (`s-maxage=30, stale-while-revalidate=300`) and never fail because a counter failed.
  - **Link-preview robots** reach `/api/og` through a `has: user-agent` rewrite. The bot list includes WhatsApp/, facebookexternalhit, Twitterbot, TelegramBot and others, and deliberately leaves out in-app-browser tokens (Line, Snapchat, Instagram) so real people never get the bare page.
  - **The preview picture** is a 1200 × 630 JPEG built in the browser: the current 3D view (through the existing photo capture), with the floor plan as fallback, plus the name band. It must stay ≤ 290 KB, and the server checks the JPEG header and size. M2 will swap in a render-quality picture.
  - **Two-step sharing:** *Make my link*, then *Send link* / *Copy* / *WhatsApp*. Phones only open the share sheet straight after a tap, and making the link takes a few seconds.
  - **The viewer** is a separate lazy root (`src/main.tsx`). Both App and ViewerApp are lazy, so link openers never download the editor: viewer 3 KB plus the shared chunks. It renders the Scene directly, as the scene lab does, with Walkthrough and the Joystick for walking.
  - **Remix** writes My homes directly: the visitor's current home is copied to IndexedDB first. It refuses on a full shelf, asks before replacing on one-home browsers, and nudges in-app-browser users to open the link in Chrome or Safari.
  - `plot.location`, `vastu` and `remixOf` were added to the schema and whitelists now, because the server validates shares. New looks wait for M3, and the viewer parses leniently.
  - **Dev fix:** Vite now ignores `node_modules.nosync`. Stray file events there were forcing full page reloads every 30 seconds.

- **17 Oct 2026 (M2):**
  - **Renderer:** n8ao's `N8AOPass` (2.0.1, pinned) draws the scene plus ambient occlusion into half-float targets at the photo's size. Each sample shifts the camera by a sub-pixel Halton offset (clean edges) and moves the sun across a small disc (soft shadows, shadow map re-rendered each sample). A two-target ping-pong shader averages the samples. One final shader adds lamp glow (a bright pass blurred at quarter size), Neutral tone mapping, a gentle warm grade, a vignette and fine grain, then sRGB. Read-back is `readRenderTargetPixelsAsync`; a 2D canvas only adds the mark and encodes the JPEG (0.9).
  - **Sizes:** phones 1600 px long edge with 16 samples and a 2048 shadow map; desktops 2560 px, 40 samples, 4096. Always capped by the GPU's texture limit. On this Mac a phone-size photo takes about 1.5 s and a desktop one about 3 s.
  - **On-screen rendering pauses** (`frameloop "never"`) during the photo, and everything is put back afterwards: render target, auto-clear, tone mapping, clear colour, fog, sun position, shadow map size, frameloop. Tests check for 0 idle frames afterwards.
  - **The renderer and n8ao load only when a photo is taken.** This also took n8ao out of the Scene chunk: 237 KB → 77 KB gzip.
  - **Framing:** Aerial and Front frame the **whole plot** (compound wall, garden, a strip of street), not just the house. Fitting only the house cut the wall off. A few "look at the middle of what you see, step to fill the frame" passes centre the subject and fill at least 87% of the frame for every shape. Tall shapes (Story, Post) look more steeply down and more along the plot, so the home isn't a sliver in empty sky. Room uses the dollhouse focus and leaves street life out (a passing bird was a dark blot at room scale). This view keeps the live camera, including the walker's eyes.
  - **Moods:** Morning 8:30, Noon 12:30, Golden hour 17:15, Night 21:30, Diwali night 21:15 (20:30 was a muddy dusk), each with its own warmth, glow and vignette.
  - **Fallback:** if the careful render can't run (an error, a lost graphics context), the studio offers a quick picture of the live view, cropped to the shape and marked, and says so.
  - **One studio for all entry points** (View options, Explore, the Room studio's camera, the share sheet). The old Explore photo dialog is gone. The chips wrap rather than scroll, so every choice stays in sight.
  - **Share-link pictures** are now a 1200 × 630 aerial golden-hour render (10 samples, no mark), still falling back to the live capture.
  - **Bug found on the way:** a shader uniform called `sample` is a reserved word in WebGL2 shaders, so that shader didn't compile and photos came out flat peach. Renamed `current`.

- **17 Oct 2026 (M3):**
  - **Looks live in one place,** `src/domain/looks.ts`: each look's outside bundle, room palettes (every room use), garden and card text. `materials.ts` keeps the material ids and the commands.
  - **The six regional looks:**

    | Look | Outside | Inside | Garden |
    |---|---|---|---|
    | Kerala | lime plaster on a laterite plinth, Mangalore-tile hip roof, teak doors, trim and lattice | red-oxide floors, teak, brass and cane colours | coconut palms, tulsi, lush planting |
    | Chettinad | glossy egg-white plaster with ochre bands, maroon trim, arched windows | Athangudi tiles (three colour sets), red oxide | neem, tulsi |
    | Rajasthani | golden sandstone, arched windows, sandstone jaali, indigo door | Kota stone, marble, indigo and turmeric | neem, tulsi |
    | Goan | indigo with white bands, white trims, arched windows, Mangalore-tile hip roof, forest-green door | red oxide, blue azulejo kitchens and baths | coconut palms, lush planting |
    | Mumbai modern | grey render with white bands, glass railings, sunshades | vitrified tiles, greige, charcoal | blossom trees |
    | Bengaluru contemporary | exposed brick with concrete bands, terracotta jaali | polished concrete, oak, terrazzo | lush planting |

  - **New materials** with procedural textures (`textures.ts`): floors red oxide, Athangudi ×3, Kota, vitrified, azulejo; walls lime plaster, laterite, egg-white plaster, golden sandstone, indigo, leaf green, grey-and-white, fair-faced concrete, brick-and-concrete, wood slats; Mangalore clay-tile roof; teak and indigo trims; indigo and forest-green doors. Names are generic (places and crafts, no brands).
  - **`Look.roughness` is used now:** the material's roughness factor scales the texture's roughness map to the Look's mean, so the map keeps its variation (veins, joints) and red oxide, marble and egg plaster shine.
  - **Arched windows** are a new regional detail, `style.details.arches` (saved, whitelisted): a stone archivolt with a keystone over a shaded tympanum, replacing the flat lintel and the window's sunshade. A switch sits with the other details.
  - **Jaali colour follows the facade:** teak lattice in Kerala, sandstone in Rajasthan, terracotta in Bengaluru, pale stone otherwise.
  - **Left out of the plan's table** (geometry beyond this phase; each look already reads regional through its materials, roof, arches and jaali): Kerala's wooden window grilles, Chettinad's teak pillars, the Goan balcão seat-porch, and Mumbai's compact furniture.
  - **Look cards** show a real render: `npm run looks:thumbs` photographs the same two-storey sample home in every look with the M2 renderer through the scene lab, in clear morning light (golden light turned every look the same orange), from across the road a third of the way round, without street life, and saves 480 px WebP (11–16 KB each, loaded lazily). A drawing stands in if a picture can't load.
  - **"Try it"** is one tap: the look applies at once and the toast offers Undo (`RunOptions.undoable`).
  - **The AI designer** has the regional looks as styles (same ids as the looks). The built-in planner builds their homes from the look data, so the designer and the cards always agree. A regional home keeps its own outside; for the everyday styles the designer still picks the facade colours. The prompt describes each region's interiors. The output schema is unchanged (its id lists grow with the materials). "Make it nice" offers the home's own regional look next to the four everyday styles.
  - **Lived-in details are derived, never saved:** `livedInDecor(project, floorId, seed)` places them deterministically per floor. Floor pieces keep inside their room, out of every door approach and clear of furniture; table-top pieces stand on free furniture tops; wall pieces hang on clear wall. Each floor gets one sleeping cat and one place for clothes to dry (a roomy balcony, else a utility room); a flat roof's terrace dries clothes too. Outside: shoes beside the door mat, a toran over the door, a scooter and a bicycle along the front on the side away from the car.
  - **The Diwali set** (the Diwali night mood): diyas on the porch, balconies, before the pooja shrine, in the living room and along the front compound wall; a festoon of lights under each floor's road-side ceiling line; a rangoli in front of the step and in the pooja room. It shows whenever the mood is Diwali, even with lived-in details off.
  - **`life.glb`** (23 models, 107 KB, 10,226 triangles; built by `scripts/blender/build_life.py`): per-vertex colour on three materials (matte, steel and brass, flame). The cat's body and each diya flame are separate `<id>:<part>` nodes at their pivots.
  - **Idle motion** costs no extra draw calls for furniture: ceiling fans turn about their hub and curtains lean from the rod by rewriting instance matrices in the existing batches. Curtains shear rather than wave, because their fabric material is shared with sofas and beds, and this keeps the tie-backs on. The cat breathes and flames flicker in their own small batches. The gate is street life's: Explore or Photo (not the title showcase), not the battery tier, not reduced motion, page visible, at 24 fps. Everything reads the scene store's shared clock.
  - **Photos wait for the kit:** the store counts loading assets (`hold()`), and the photo settles until `life.glb` has arrived (up to about ten seconds).
  - **Preference:** `livedIn: "tidy" | "lived-in"`, default lived-in, switched in View options. The Photo studio has its own switch, which starts from it. Share-link viewers see lived-in details too.
  - **Bug found on the way:** three's GLTFLoader strips `:` from node names (the original is in `userData.name`), so street life's legs, arms and wheels had never actually moved. Kits now read names with `gltfName()`, and a test pins it.
  - **Shared homes from a newer app** now also drop finishes this copy doesn't know (not just looks), instead of failing to open.
  - **Single sources of truth moved into the domain:** wall thickness (`WALL_THICKNESS`), the porch's size (`PORCH`) and the main door (`mainDoor`; the 3D porch uses it).
  - **Ids are own keys only:** the material, fence, finish and furniture checks used `id in TABLE`, so names like `constructor` passed validation (also on the server) and could crash the viewer of a shared link. They use `Object.hasOwn` now.
  - **One idle ticker:** street life and lived-in motion share one 24 fps timer in `SceneRoot` (two out-of-step timers nearly doubled the frame rate).
  - **Size:** the editor's first-load chunks grew about 3.4 KB gzip (`shell` +2.8, `App` +0.6, `index` unchanged); the lazy 3D chunk grew 11.5 KB; `life.glb` (107 KB) and the look cards (9 × 11–16 KB) load only when needed.
  - **Found, not fixed (before M3, outside its scope):** an AI design that asks for a balcony can leave one room without a window (the home check then shows "windows"). It happens with the old looks too.

- **17 Oct 2026 (M4):**
  - **Filming takes over the canvas without drawing on screen.** A job reaches `ReelRenderer` inside the Canvas (like photos). It mounts an empty priority frame callback, so R3F never draws to the screen, sets the frameloop to "never" and steps frames itself with R3F's `advance`. The live effects step aside while filming. The reel has its own camera, so the live camera is never touched. Afterwards: frameloop "demand" and 0 idle frames (tested).
  - **One view and light per shot.** Each shot's scene (view, hour, Diwali) goes to the editor through `setReelScene`; filming waits until the canvas shows it, lets it settle (sky, lamps, `life.glb` loading), then draws every frame of the shot. Only the camera and idle life move within a shot, so shadows are drawn once per shot. Shots that share a scene skip the wait (the end card carries on from the night shot).
  - **The renderer core is shared.** `createPipeline` (`src/photo/render.ts`) is the M2 renderer split into build once / sample / finish / read / dispose; photos use it exactly as before (same output). Video frames are drawn with full ambient occlusion (half-resolution on phones) and the photo finish for the shot's light. Close-ups glow less (a porch lamp a metre away flooded the door).
  - **The compositor** is one GL pass: the dissolve from the previous shot's last frame, the end card's dark wash, the words (painted on a 2D canvas, faded by a uniform) and a row flip, so the read-back pixels go straight into the encoder's canvas. That canvas is also the live thumbnail on the progress screen.
  - **Encoding:** mediabunny **1.61.0** (MPL-2.0, pinned, released 18 days earlier; it only reads WebCodecs): MP4 with `fastStart: "in-memory"`, H.264 from the canvas at 30 fps, AAC 128 kbps in one-second chunks alongside the frames. Phones 720 × 1280 at 4.5 Mbps (about 7.7 MB for 15 s); desktops 1080 × 1920 at 6 Mbps (about 10 MB). It checks `canEncodeVideo` (falling back to 720 × 1280), then `canEncodeAudio` (silent video if AAC can't be encoded, and the done screen says so). No H.264 at all: "Take a photo instead". No WebM.
  - **Quality and time:** desktops start at 3 samples a frame and drop one whenever the projected time passes the 30 s budget (measured on steady frames: a shot's first frames compile shaders and draw shadows); phones film 1 sample with half-resolution AO (budget 90 s). Measured on this Mac: the desktop grand tour at full quality (1080 × 1920, 3 samples) in **15–20 s**; the phone settings with the CPU slowed four times in **10–11 s**. A real mid-range Android is the owner's check in M8 (a GPU can't be slowed here).
  - **The shot list** (`reelPath`, pure): establishing aerial turn with the title; a push-in from the street to the front door (toran, shoes, diyas at Diwali); the dollhouse swooping from straight above to 3/4; 2–4 rooms (the biggest living room, kitchen and bedroom, and the pooja room if any) each as the dollhouse hero with a slow dolly and a name card; the night pull-back with glowing windows; the end card. Moves are eased in orbit terms and every shot is checked to keep the camera out of the house. A tall frame fits the plot's width with sky to spare, so aerials sit closer and let the plot's corners go.
  - **Quick 8 s:** establishing, dollhouse, two rooms (living room, main bedroom), end card in the mood's light.
  - **Words:** Fraunces titles and Figtree labels; nothing in the bottom fifth or on the right edge, where Reels, Shorts and Status put their buttons.
  - **Music** is synthesised in code (seeded), so it's unit-tested and sounds the same everywhere: Warm morning (tanpura-like drone, pad, bells in raag Bhupali), Festive (dholak-like drums, plucked strings, handclaps), Calm night (pad, quiet drone, slow bells). Faded in and out, normalised to −1 dBFS. The mood picks the music until someone chooses their own. The owner should give it a listen.
  - **The link at the end:** if the home has a link, the end card shows it with a QR code (qrcode-generator **2.0.4**, MIT, pinned). If not, "Show link at the end" says plainly that it makes one ("anyone with it can see this home in 3D") and the studio makes it like the share sheet does (`publishHome`, now shared, with the share picture). If that fails (offline, or sharing not switched on), the video ends with "Design yours at" the app's address and its QR code.
  - **Sharing:** the done screen's Share copies the caption ("Designed our dream home on Dream Home 🏠 {link} #DreamHome #MyDreamHome") without waiting, then opens the share sheet with the MP4 in the same tap; Save downloads it.
  - **Reduced motion** still gets street life and idle motion in the video: nothing moves on screen, and the reel is a file the person asked for. Filming pauses while the page is hidden and holds a screen wake lock.
  - **Entry points:** Share → Make a video, View options → Make a video, and the Explore camera bar.
  - **Dev fix:** Vite scanned every `.html` under `node_modules.nosync` (it skips only folders named `node_modules`). The QR package ships test pages, so the dependency scan failed and the dev server kept reloading the page to add dependencies. `optimizeDeps.entries` now names our two pages.
  - **Size:** the editor's first load grew about 1.3 KB gzip (`App` +0.6, the shared reel settings 0.65; `index` and `shell` unchanged). The studio (2.6 KB) and the filming code with mediabunny and the QR encoder (71 KB) load only when used.

- **17 Oct 2026 (M5):**
  - **The compass is real only when the homeowner says so.** A new saved flag, `plot.compass` (in `parseProject`, the persist checks, and so on the server), marks `plot.north` as true north. "Which way does your main door face?" (a compass rose of eight big buttons) sets it: `north = door's plan bearing − facing` (the main door's outward side, else the road side). AI homes set it from the brief's facing. Until then walls are named from the road ("Front wall of Bedroom 1", "Left outside wall"), then by the compass ("North-east wall…"). `wallLabel` now takes the plot.
  - **The real sun:** NOAA's equations (`solar.ts`), with India on IST (UTC+5:30) and elsewhere the nearest half hour of solar time. Checked against textbook noon heights for Delhi, Chennai and Mumbai at both solstices and the equinox (±0.5°), noon times with the equation of time (±1.5 min), Delhi's day lengths (13 h 58 m, 10 h 19 m) and a due-east equinox sunrise. Sunrise and sunset use the geometric height at −0.833°: Delhi on 21 December gives 7:09 am and 5:29 pm, matching published times.
  - **Light follows the real sun's height:** with a city, `lighting(hour, north, place)` points the sun truly and picks the sky colours and how much night it is from the stylised hour at which the stylised sun stands as high, on the same side of noon. So 5:15 pm in a Delhi December is dusk with glowing windows, and a June noon is overhead. Without a city nothing changes. The sky map rebuilds per place and day as well as per quarter hour.
  - **Seasons:** Today, Summer (21 June), Monsoon (15 August) and Winter (21 December), held in the editor (not saved). Photos and reels use the same day.
  - **Sun per room** (`sun.ts`): every window on an outside wall, 26 half hours from 6:00 to 19:00 (each judged at its middle); the sun counts above 5° and in front of the window, `cos(height) · cos(bearing − window) > 0.15`. Shading by walls and neighbours is left out, as planned; the live shadows show it. Phrases: "Morning sun 7–11:30 am", "Hot afternoon sun 1–5 pm (west)", "Sun most of the day", "No direct sun". "Hot" means 1½ hours or more after 2 pm through windows facing south-west to north-west. Tips: hot bedrooms and living rooms get "Add curtains" (placed by the furniture planner) or else "Add sunshades" (the chhajja detail); bedrooms without sun get a gentle note.
  - **Without a city** the 3D view keeps the stylised sun, and room sunlight is worked out for the middle of India (Nagpur). The sheet says so and offers the city picker.
  - **The Sunlight sheet** (View options → Sunlight; the sun button in a room's header): the city and facing, season chips, an hour slider from 6 am to 7 pm with Sunrise / Noon / Sunset buttons (the tap alternatives), sunrise and sunset times, every room's phrase (the open room first) and tips. One frame per change, never a loop. Closing puts the hour back.
  - **Cities:** 212 Indian cities with states and old names (Bombay, Madras, Bangalore, Gurgaon, Trivandrum, Vizag…), in their own small chunk. "Use my location" asks only when tapped, rounds to 0.1° and names the nearest city ("Near Pune") within 60 km. The city picker is in the plot sheet ("Where is it?"), the AI brief's first step (optional, kept for "Try another design"), the start wizard and the Sunlight sheet. A shared home shows its city (only when shared with "Show my city").
  - **Vastu** (`vastu.ts`): the plan's twelve rules, weighted (main door, kitchen and main bedroom 3; pooja room, bathrooms and centre 2; the rest 1). A rule passes, half-passes or misses, and rules that don't apply (no pooja room, no stairs) are left out of the score. Zones are ninths of each floor (the middle third is the centre). The main bedroom is the one named main or master, else the biggest bedroom. Pooja, children's and guest rooms are found by name. Bed heads use the bed's back; cooking uses the stove's back (the cook faces it). It needs the facing first, so the card asks for it. A miss may offer "Swap with …" for a room sitting where tradition puts it, on the same floor, never a bathroom, checked to be a valid `swapRoomUses`. It is applied only on a tap, with Undo.
  - **The Home score:** essentials 50, "make it yours" ideas 20, sunlight 15 (every bedroom and living room catching some direct sun), and Vastu 15 when opted in, scaled to 100. The sunlight part uses the September equinox (an average day), so the score doesn't change with the date. The checklist pill became a ring with the number; its popover shows the parts, the checklist (fixes unchanged), sunlight, the Vastu card and the badges.
  - **Badges:** Every room has sunlight, Vastu friendly (75+), Fully furnished (every bedroom, living room and kitchen furnished your way), Regional look, Shared with family. A badge earned while editing gets the confetti and sound in a small card at the top. It waits for any message (and its Undo) and any dialog to go first, never takes focus, closes itself, and doesn't show if it was undone meanwhile. The full "Ready to move in!" card stays for finishing the essentials.
  - **Found on the way:** an idea's "Nice!" message replaced a look's "Undo" message (trying a look also sets a roof). Idea cheers now skip while an Undo message shows.
  - **Shared homes and the reel:** the viewer shows the city (if shared), the Home score and badges ("Shared with family" always), and lights the home with today's real sun. The reel's end card has the score ring and up to two badges.
  - **View options** "North direction" (degrees) and the start wizard's degrees field became "Main door faces" / "Which way does the main door face?", so north is always set the same way.
  - **`roomBearing`/`roomZone`** moved from the AI builder into `src/domain/compass.ts` (the builder re-exports them).
  - **Size:** first-load JS is +24.5 KB gzip over v4 in all (measured by adding up every chunk the editor loads: 194.9 → 219.4 KB). M5's share is about 6.7 KB, after making Vastu's rules and card, the city list and picker, the plot sheet's place section and the Sunlight sheet lazy.
  - **Not done (as planned or for later):** windows shaded by walls and neighbours; photo and reel moods keep their clock hours (with a city, a winter "Golden hour" at 5:15 pm is nearly sunset).

- **17 Oct 2026 (M6):**
  - **Images only.** A PDF is a screenshot (the first step says so). The phone prepares the photo: `createImageBitmap` turns it upright from its EXIF orientation, a canvas redraws it (dropping EXIF and GPS), at most 2000 px on the long edge, as a JPEG stepped from quality 0.85 down to 0.45 until it is ≤ 1.5 MB.
  - **The wire is the raw JPEG** (`POST /api/plan-read`, `content-type: image/jpeg`), not base64 in JSON: a third smaller, and the server reads the JPEG header with the share picture's `jpegSize` (long edge ≤ 2000, short edge ≥ 200) before anything else. Plot size and road side ride in the query, each checked by a strict pattern.
  - **The reading:** Sonnet 5.5 (`PLAN_MODEL` overrides it), an image block plus the strict JSON schema, adaptive thinking at effort `medium`, `max_tokens` 12 000 (thinking and answer share it; only what's used is billed), 55 s timeout. The system prompt says text in the image is data, never instructions. The answer's `outlineBox` is in fractions of the photo and rooms are fractions of that box, as planned.
  - **Server-side refusal fallback is now also sent to Sonnet 5.5** (the claude-api skill lists it for `claude-sonnet-5-5`); Haiku still rejects it.
  - **Limits:** one reading per device for life and three per connection a day (`plan` in the limiter), refunded when the call fails. It is paid work, so a Vercel deployment without KV refuses it (`live: false`) and the app offers "Draw it yourself".
  - **Nothing about the plan is kept or logged.** The usage log holds only the label, model, tokens and cost; a failed call logs only the error's name. A unit test checks that neither the plan's text nor the picture's bytes reach the log.
  - **The sanitiser** (`sanitizeReading`) runs on the server and again in the app: every number clamped to 0–1, at most 30 rooms, 40 doors and 4 stairs, `<` `>` stripped, and a label that clearly names a room (English or Hindi: Pooja, Puja, Mandir, पूजा, Toilet, WC, शौचालय, Rasoi, रसोई, बैठक, शयन…) beats the type the model guessed.
  - **`planFromReading`:**
    - The house takes the drawing's own size when it gives dimensions, else the photo's proportions fitted to 92% of the buildable area; if it is bigger than the plot it is scaled to fit, with a note.
    - It sits centred across the plot and at the back, 60 cm from the edge, away from the road.
    - Rooms snap to the 10 cm grid, the surest and biggest first; an overlap is cut back to the shared edge from the side that loses least; anything under 120 cm is dropped and named in a note.
    - Open areas (parking, porch, balcony, lawn) and stairs aren't rooms: stairs get a note to add a second floor.
    - Names are plain ("Main bedroom", "Bedroom 1", "Pooja room", "Store"); a pooja room is a utility room named so, which is how Vastu finds it.
    - It builds on a one-floor bungalow blueprint and runs `finalizeEdit`, so doors and windows are automatic and every room gets the designer auto layouts. If a room still breaks a rule, it is left out and named; the plan's "best partial result plus issues" became this, so the check screen always opens a valid home.
  - **The road is a side of the drawing** (Bottom, Top, Left, Right), which is how a homeowner sees it; Left and Right swap the plot's width and depth. Plot chips are in feet, as plots are sold. City and facing are set afterwards in the plot sheet, not in these two steps, to keep them short.
  - **The check screen is the existing Edit in 2D lens.** The photo lies under the plan at 55% (rooms at 32% fill), aligned from `outlineBox`. Nudge buttons move it 20 cm, Smaller and Bigger scale it 3%, and it can be hidden. A room the reading was unsure of (below 0.6) is outlined dashed in terracotta, with "Check {room}". Eight big type chips relabel the selected room. Every change is an ordinary edit with Undo. The photo is an object URL for this session only: it is never saved, and leaving that home drops it.
  - **"Make it 3D"** closes the lens, fits the hero camera and runs the construction reveal: "Your plan is in 3D! Tap any room to make it yours." No look is forced; the Looks tab is a tap away.
  - **Entries:** the first screen's "Upload my builder's plan", and on Add room's rooms tab "Have your builder's plan? Start a new home from a photo of it". The plan's "From a plan photo" is named for what it does, since it starts a new home. The open home stays on My homes.
  - **"Draw it yourself"** is always there, and becomes the main button when no reading is left or reading is off. It opens the same check screen over an empty house in the drawing's proportions.
  - **Size:** M6 adds 0.9 KB gzip to the first load (measured the same way on the M5 and M6 builds: 224.7 → 225.6 KB). The two-step sheet (6.3 KB) and the check panel load only when used.
  - **Found on the way (live since M5):** the Home score ring showed as a black disc on a first load. Its styles were only in the lazy Vastu chunk; `Checklist.tsx` now imports `insights.css`, and the score test checks the ring's size and fill.
  - **Not done (for later):** the doors the reading lists are not used yet (automatic doors give every room a working door); stairs and a second floor from the drawing; metres on the plot chips.

- **18 Oct 2026 (M7):**
  - **Haiku 5.5 with tool use**, checked with the claude-api skill: thinking off (allowed at effort high or below), effort `low`, `max_tokens` 600, `tool_choice: auto`. One cache breakpoint on the system prompt caches the tools too, since tools come first. A request is about 4–5k input tokens, mostly cached after the first, plus at most 600 out: roughly $0.0005–0.001 (₹0.05–0.1). `COMMAND_MODEL` overrides the model. Haiku has no server-side fallback, so it isn't asked for.
  - **The tools aren't `strict`.** Strict mode allows at most 20 strict tools, 24 optional parameters and a limited grammar size, and our 30 tools carry long lists (59 furniture pieces, every paint and floor). Instead `cleanAction` (`src/voice/tools.ts`) checks every call on the server: a known tool, only its own fields, the right types, values in range or in their list, and refs that exist in the home that was described. The app checks again before running anything.
  - **The context is small and id-free:** floors `f1…`, rooms `r1…` with name, type, size in the home's unit, and where each sits as seen from the road ("front-left"; plus the compass zone once the facing is set), the open room's furniture, and the selected room. It stays under 3 KB (trimmed in steps on huge homes); the server rebuilds it field by field (`cleanContext`) and refuses anything bigger.
  - **The tool set:** add, remove, resize, rename, change use, swap; paint walls, floor, feature wall; add or remove furniture (up to 3), furnish, empty, "make it nice" (the built-in planner, no second AI call); door, window, attached bathroom; look, outside finish, roof; open a room, home, explore, time of day, sunlight, Vastu, photo, video; undo and redo. They run through the same pure commands the buttons use.
  - **One request, one undo step:** the runner (`runTools.ts`) chains every edit into one project, labelled "Voice: {what you said}", with the reply and an Undo button as the message. It stops at the first edit that can't be done and says why (`friendlyIssue`); edits before it stay. An edit that changes nothing says so ("Bedroom 1 already has a door.").
  - **Asks first** for removing a room, emptying one, a new look, and growing the house when a new or bigger room needs the space ("There isn’t room for that, so I’ll make the house bigger first. OK?"). A resize tries each corner and the middle before asking to grow; a new room "near" another tries each side of it first.
  - **Answered on the phone, without the AI:** undo, redo, night, day, explore, walk inside, Vastu, sunlight, the whole home, and opening a room by its name or what people call it (kitchen, रसोई, किचन, hall, बैठक, pooja, मंदिर…). English, Hinglish and Devanagari, with Hindi replies for Hindi; Devanagari digits work. "Open the bedroom" with three bedrooms asks which.
  - **Speech:** the browser's own recognition, `en-IN` or `hi-IN` from the English / हिंदी switch. Tap to start and stop (easier than holding); the box shows the words as they come, and they're sent when you stop. Without speech recognition (Firefox, in-app browsers) the mic is hidden and the sheet says "Tip: tap the 🎤 on your keyboard to speak." Replies can be read aloud (`speechSynthesis`, off by default). The privacy note shows until it's dismissed or the mic is first used.
  - **Views close the sheet** (night, a room, explore, Vastu), and the reply stays in sight as a message. The photo, video and sunlight studios open in its place. "Show Vastu" opens the Home score (an event the checklist ring listens to). A photo opens the studio; the mood is picked there.
  - **Where the button is:** phones get a round Talk button above the Home bar and a microphone in the room's header; desktop gets "Talk" in the top bar (not also in the room panel). The room header on narrow phones and with bigger text now puts the room's name on its own line, as the extra button left it too little room (it was already tight at 320 px in Extra large).
  - **Limits:** 15 a day per device and 60 per connection (`command`), given back when the call fails; off without a key, with `AI_DISABLED`, or on Vercel without KV (then only the phone's own answers work, and the sheet says so).
  - **Nothing said is kept or logged:** usage and cost only; a failed call logs the error's name. A unit test checks.
  - **Size:** M7 adds 0.6 KB gzip to the first load (225.6 → 226.2 KB, same method). The sheet, the runner and the tool set load on first tap (10.9 KB).

## Milestones
- [x] **M0a** Server router, limiter, security headers
- [x] **M0b** My homes, settings, copy, first launch, domain hand-off
- [x] **M1** Live link + Remix + WhatsApp preview
- [x] **M2** Photo mode
- [x] **M3** Regional looks + lived-in details
- [x] **M4** "My dream home" reel
- [x] **M5** Location, real sun, sunlight, Vastu, Home score
- [x] **M6** Builder's plan → 3D
- [x] **M7** Talk to your home (voice + chat, Haiku 5.5)
- [ ] **M8** PWA, usability and security review, docs

## Log
- **2026-10-17, M0a:**
  - **New server modules:**
    - `server/http.ts`: JSON answers; a streaming body cap; client IP with IPv6 grouped by /64; device id; same-site check.
    - `server/router.ts`.
    - `server/context.ts`: injectable deps, limiter selection, fail-closed, `AI_DISABLED`.
    - `server/headers.ts`.
  - **`server/limiter.ts`** now has:
    - generic kinds (home, room, command, plan, share, report, read) with per-kind rules and `LIMIT_<KIND>_<DEVICE|IP>` env overrides;
    - one **atomic** reserve: an Upstash `EVAL` Lua script, and a single synchronous step in memory;
    - day or lifetime device windows; the budget applies only to AI kinds.
  - **`server/claude.ts`:** per-model pricing including `usage.iterations`; fallback only for Opus; refused, cut-off and unreadable answers are still billed against the budget.
  - **Build and serving:**
    - `api/design.js` is replaced by `api/index.js`;
    - `vercel.json` has the rewrites and security headers;
    - Vite serves `/api/*` from the sources in dev and from the bundle in preview, and preview uses the production headers.
  - **Scripts and docs:** `check:api` and `test:preview` scripts, `.env.example`, `CLAUDE.md`.
  - **Tests:**
    - `server/platform.test.ts` has 21 tests: body cap, IPv6, same-site, routing, fail-closed, kill switch, billed refusals, atomic limits, day windows, the Upstash script wiring, pricing, and headers matching `vercel.json`.
    - `tests/preview/security.spec.ts` has 3 tests: the built app runs with no CSP violations through Home and Explore; the bundled API guards; the CSP really blocks outside hosts.
- **2026-10-17, M0b:**
  - **New modules:**
    - `src/homes/shelf.ts`: the index, migration, add/switch/remove, at most 12 homes.
    - `src/homes/store.ts`: the IndexedDB store, plus a memory fallback.
    - `src/homes/handoff.ts`: pack and unpack homes for move links.
    - `src/shell/MyHomes.tsx` and `homes.css`, and `src/shell/MoveHomes.tsx` (move banner and import prompt).
    - `src/ui/feedback.ts`, `src/ui/styles/textsize.css`.
  - **Changed:**
    - `useProject` (shelf, create/open/remove/read homes) and `EditorProvider` (`homes` API, text size, sounds).
    - The title screen, the More menu (My homes, Text size, Sounds & vibration, "Open a saved file"), and all new-home paths, which now go through `addHome`.
  - **Tests:**
    - Unit: shelf, store, move links (including the zip bomb), edited-time wording, preferences.
    - `tests/homes.spec.ts`, 7 browser tests: the first screen; My homes create/open/reload/delete; My homes on the first screen; Extra large at 320 px with no overflow; the sounds switch; arrival by link; a broken link.
    - Existing specs were updated for the new wording.
- **2026-10-17, M1:**
  - **Server:**
    - `server/share.ts`: create, read, update, delete, picture, stats, view, remix, report, hide and unhide.
    - `server/og.ts`, `server/kv.ts`, `server/blob.ts`, `server/bytes.ts`.
    - The router passes path parts on to handlers.
  - **Client:**
    - `src/share/`: `ShareSheet`, `ViewerApp`, `api`, `links`, `poster`, `remix`, `parse`.
    - The top-bar Share opens the new sheet; plan drawings moved under "More ways to share".
    - `src/ui/BrandMark.tsx` was split out so the viewer doesn't pull in the editor.
  - **Tests:**
    - `server/share.test.ts` (10): create/read/update/delete, token rules, fuzzed invalid homes, size and type caps, cross-site refusal, name cleaning, view and remix counting, reports and admin, JPEG checks, OG escaping, fail-closed without storage, and the helpers.
    - `src/share/share.test.ts` (7).
    - `tests/share.spec.ts` (5 browser tests): the whole share, view and remix loop across two browsers; update and stop; offline; previews; report.
    - `tests/preview/security.spec.ts`: the viewer under the production CSP.
  - **Docs:** `docs/SECURITY.md` (with the admin runbook).
- **2026-10-17, M2:**
  - **New `src/photo/`:**
    - `render.ts`: the offline renderer (AO, jitter, soft sun, averaging, glow, finish shader, restore).
    - `PhotoRenderer.tsx`: runs jobs inside the Canvas; waits for the scene to settle, builds the photo camera, pauses on-screen rendering.
    - `framing.ts`: where the camera stands for each framing and shape.
    - `settings.ts`: moods, shapes, sizes per device, and the test hook.
    - `encode.ts`: JPEG with the Dream Home mark; the cropped quick fallback.
    - `PhotoStudio.tsx` and `photo.css`: the studio.
  - **Changed:** `SceneHost` (what each framing shows), `SceneRoot` (mounts the renderer), `AppShell` (studio, jobs, share pictures), `Hud` and `RoomStudio` (camera buttons). Removed `src/explore/PhotoDialog.tsx` and its CSS.
  - **Tests:**
    - `src/photo/photo.test.ts` (17): Halton, sizes, device quality, aerial poses, and every framing × shape keeps the subject inside, centred and filling the frame.
    - `tests/photo.spec.ts` (4): JPEG of the right shape and 0 idle frames afterwards; Cancel; the quick fallback; the Room camera on a phone with wrapping chips. `DH_SHOTS=1` writes 5 moods × 2 framings × (390, 1440) to `docs/screenshots/photo/`.
    - `tests/explore.spec.ts`: the Explore camera opens the studio.
    - `tests/preview/security.spec.ts`: a full photo renders under the production CSP.
  - **Gate:** typecheck, lint, 753 unit tests, build, `check:api`, 109 browser tests (14 screenshot-only skipped), 4 preview tests, `diff --check`: all green.
- **2026-10-17, M3:**
  - **New domain modules:** `looks.ts` (look bundles, room palettes, gardens, card text), `livedIn.ts` (`livedInDecor`, `frontVehicles`), `entrance.ts` (`mainDoor`, `PORCH`, `outsideBuilding`) and `catalog/life.json`.
  - **New scene modules:** `life/LivedIn.tsx` and `life/festive.ts` (rangoli texture, festoons, wall diyas), `motion.ts` (`usePageVisible`, `useIdleTicker`), `props/idleMotion.ts` (fans and curtains).
  - **Changed:** materials and palette (new ids, nine texture generators, `Look.roughness`), walls (arched hoods), balcony (jaali colour), porch, garden and site (look gardens, front planting, keep-clear zones), fence and site extras (compound-wall heights), kit loading (pivots, `gltfName`, life materials), batches (model per instance), Furniture (fan and curtain motion), StreetLife (shared clock and parts), the store (clock, loading holds), the photo renderer (waits for loading), the photo studio (Lived-in switch), View options (Lived-in switch), the look cards (rendered pictures, Undo), the AI designer, planner, builder and prompt (regional looks), and the lenient share reader.
  - **Assets and scripts:** `public/models/life.glb` with `scripts/blender/build_life.py`, `items/life.py` and `npm run assets -- --step life`; `public/looks/*.webp` with `npm run looks:thumbs` (`scripts/looks/thumbs.mjs`, the lab's `lookThumb`).
  - **Tests:**
    - Unit: `livedIn.test.ts` (10: deterministic, never edits the project, inside rooms, out of door approaches, on the plot, clothes drying, vehicles), `looks.test.ts` (13: ids, palettes for every room use, gardens, round-trips, regional materials, built-in names, arches), `scene/life/life.test.ts` (9), `scene/materials/looks.test.ts` (12), the kit contract for `life.glb` (its 23 models, budget, pivots, and which kits are cut with the section) and for street-life part names, AI regional looks, preferences, and the lenient share reader.
    - Browser: `tests/looks.spec.ts` (4): look cards with real pictures apply and undo; Build idle and within budget while Explore at night with lived-in details stays at 115 draw calls; motion only in Explore and the Tidy switch remembered; the Photo studio's switch and the Diwali set. `DH_SHOTS=1` writes 8 looks × day and night × (390, 1440) to `docs/screenshots/looks/` and lived-in photos to `docs/screenshots/lived-in/`; the M2 photo set was re-shot with the Diwali decorations.
  - **Gate:** typecheck, lint, 837 unit tests, build, `check:api`, 113 browser tests (32 screenshot-only skipped), 4 preview tests, `diff --check`: all green.
- **2026-10-17, M4:**
  - **New `src/reel/`:**
    - `settings.ts`: styles, moods, music, sizes and budgets per device, the caption, the test hook, and a tiny feed for progress.
    - `path.ts`: `reelPath`, `tourRooms`, `shotCamera`, and when the words and the end card's wash show.
    - `music.ts`: the three pieces of music; `qr.ts`: the end card's QR code.
    - `overlay.ts`: the title, room name cards and end card on a 2D canvas.
    - `compositor.ts`: the dissolve, wash, words and row flip in one GL pass.
    - `film.ts` (lazy): scenes, settling, frames, pacing, encoding, wake lock, pause while hidden.
    - `ReelRenderer.tsx` (inside the Canvas), `ReelStudio.tsx` (lazy) and `reel.css`.
  - **Changed:**
    - `src/photo/render.ts`: `createPipeline` (the renderer split for reuse); `renderPhoto` uses it. `framing.ts` exports `frameBox`; `encode.ts` exports `brandMark`; `PhotoStudio` exports `Chips` and `Ring`.
    - `SceneRoot` (filming: effects aside, idle life on the video's clock, no idle ticker), `SceneHost` (reel scenes; a share picture wins over the studio's preview), `AppShell` (`makeReel`, the lazy studio), the overlay `"reel"`, Share sheet / View options / Explore (Make a video), `src/share/publish.ts` (making a link, shared by the share sheet and the studio), `vite.config.ts` (dependency scan entries).
    - Dependencies: `mediabunny` 1.61.0, `qrcode-generator` 2.0.4.
  - **Tests:**
    - Unit: `src/reel/reel.test.ts` (14): deterministic; 15 s and 8 s, shots back to back; the story's order and dissolves; the living room, kitchen, main bedroom and pooja room as heroes; across every template (one and two floors), every road side, AI homes and the presets the camera looks at the plot, stays above ground and never enters the house (or dips below a room's cut); room shots centred; mood lights and night falling; words only in their shots; music length, peak ≤ 0.98 (−1 dBFS), audible, faded, seeded, silence for None, the Bhupali notes; the QR code's size and finder squares; the caption; device quality.
    - Browser: `tests/reel.spec.ts` (5): a 1 s grand tour at 180 × 320 is an MP4 (`ftyp`) the browser plays at the right size and length, with music and every shot, then 0 idle frames; Cancel, then 0 idle frames; no H.264 → "Take a photo instead"; from Share on a phone, chips wrap and fit, the video ends with a newly made link that the share sheet then shows; the studio at 320 px in Extra large. `DH_SHOTS=1` writes each shot's middle frame of a golden and a Diwali grand tour (720 × 1280) to `docs/screenshots/reel/` and the videos to `test-results/`; `DH_REEL_BENCH=1` times full-quality grand tours (desktop, and a phone with the CPU slowed four times).
    - `tests/preview/security.spec.ts`: a reel is filmed and plays under the production CSP.
  - **Gate:** typecheck, lint, 851 unit tests, build, `check:api`, 118 browser tests (36 screenshot- and timing-only skipped), 4 preview tests, `diff --check`: all green.
- **2026-10-17, M5:**
  - **New modules:**
    - `src/domain/compass.ts` (directions, facing, side names, room zones) and `src/domain/place.ts` (`setFacing`, `setLocation`, `withPlace`).
    - `src/insights/`: `cities.json` and `cities.ts`, `solar.ts`, `sun.ts`, `vastu.ts`, `score.ts`, `useVastu.ts`, and the `CityPicker`, `LazyCityPicker`, `FacingPicker`, `PlaceSection`, `SunlightSheet` and `VastuCard` components, with `insights.css`.
  - **Changed:**
    - `timeOfDay.ts` (`lighting` with a place; `paletteHour`), `useProceduralEnv`, `SceneRoot` and `SceneProps.sunDate`; the editor state (`season`, the `"sunlight"` overlay).
    - `Checklist.tsx` (the Home score ring, popover, badges; Undo messages kept), `Celebration.tsx` (the badge variant), `wallLabel` (side names) and its callers.
    - The plot sheet (Where is it?), View options (Sunlight; Main door faces), the room studio header (Sunlight), the AI designer and design notes (city), the start wizard (facing, city), the share viewer (city, real sun, score), the reel's end card (score).
    - `plot.compass` in the model, persist checks and `api/index.js`.
  - **Tests:**
    - Unit: `src/insights/insights.test.ts` (26): solar positions, noon times, day lengths and time zones; the real-sun lighting; the 212 cities; the compass (facing round trips, side names, saving the flag); the city command; sun per room (only lit windows, east mornings, hot west afternoons, north windows in June only, phrases, tips); every Vastu rule on fixture homes and real swaps; the score's parts, its drop with a missing essential, and each badge. `openings.test.ts` now checks road and compass wall names.
    - Browser: `tests/insights.spec.ts` (6): a city by its old name and the facing from the plot sheet, both undone; the Sunlight sheet's season and hour moving the real sun (higher at 9 am in June), Sunset, the hour put back and 0 idle frames; the sheet from a room on a phone, fitting; Vastu opted in from the Home score with a swap and Undo; the score ring, and a Kerala look earning a badge after the look's Undo message; a shared home showing its city and score. `DH_SHOTS=1` writes `docs/screenshots/insights/`. `modes.spec.ts` follows the dialog's new name.
  - **Gate:** typecheck, lint, 877 unit tests, build, `check:api`, 124 browser tests (36 screenshot- and timing-only skipped), 4 preview tests (now also the Sunlight sheet and city search under the CSP), `diff --check`: all green.
- **2026-10-17, M6:**
  - **New `src/planread/`:**
    - `reading.ts` (shared by server and app): the reading's type, limits, strict schema, Indian label table, `sanitizeReading`, the system prompt.
    - `fromReading.ts`: `planFromReading` (reading + plot → a valid home, the photo's place, unsure rooms, notes).
    - `image.ts` (upright, EXIF-free JPEG ≤ 2000 px, ≤ 1.5 MB), `api.ts` (readings left, read), `check.ts` (the check screen's state and the photo's place).
    - `PlanStart.tsx` (lazy: photo, plot and road, reading, Draw it yourself), `PlanCheck.tsx` (lazy: the check panel) and `planread.css`.
  - **New `server/planRead.ts`:** `GET` answers whether reading is live and how many are left; `POST` takes the raw JPEG. Routed at `/api/plan-read`.
  - **Changed:**
    - `server/claude.ts` (an optional image block, a log label and timeout; fallback for Sonnet 5.5), `server/http.ts` (`PLAN_MODEL`), `server/router.ts`, `api/index.js`, `.env.example`.
    - `Plan.tsx` (a photo underlay and dashed unsure rooms), `PlanLens.tsx` (passes them, plus the check panel), `AppShell.tsx` (the plan screen and overlay, adopting the home, the check, Make it 3D), the editor's `"plan"` overlay, the first screen and Add room links.
    - `Checklist.tsx` imports the score ring's styles (the M5 black-ring fix).
  - **Tests:**
    - Unit: `src/planread/planread.test.ts` (9): five synthetic readings (clean, overlapping, rotated with the road on the right, no dimensions, Hindi labels with wrong types) each become a valid home inside the setbacks, rooms on the grid and ≥ 120 cm, with no room lacking a door, no blocked door and no unreachable room (the v4 circulation checks); the photo lands on the house; an oversized drawing is scaled with a note; an empty reading gives a house to draw in; the sanitiser clamps, caps and strips; 22 label cases. `server/planRead.test.ts` (6): Sonnet with the image and schema, answers clamped; one free reading per device, refunded on failure; PNGs, 1.6 MB, 4000 px, 100 px and bad device ids refused without calling Claude; offline without a key, fail-closed on Vercel without KV, off with `AI_DISABLED`; nothing of the plan logged; routing and the same-site check. `platform.test.ts` follows the fallback change.
    - Browser: `tests/planread.spec.ts` (3, with `/api/plan-read` mocked): from the first screen on a phone, a drawn plan photo is sent as a JPEG with the plot and road, the eight rooms come back over the photo, the photo is nudged, the unsure pooja room is checked, retyped and undone, and Make it 3D renders the home on My homes; with the free reading used, Draw it yourself over the photo with no request sent; a failed reading says what to do, Draw it yourself works, from Add room, and the open home stays on the shelf. `insights.spec.ts` checks the score ring is styled on a first load. `DH_SHOTS=1` writes `docs/screenshots/planread/`.
    - `tests/preview/security.spec.ts`: the plan flow under the production CSP (the lazy chunks and the `blob:` photo under the plan) and the bundled `/api/plan-read` answering offline and refusing a non-JPEG.
  - **Gate:** typecheck, lint, 892 unit tests, build, `check:api`, 127 browser tests (36 screenshot- and timing-only skipped), 5 preview tests (now also the plan flow under the CSP), `diff --check`: all green.
- **2026-10-18, M7:**
  - **New `src/voice/`:**
    - `tools.ts` (shared by server and app): the 30 tools and their definitions, `cleanAction`, the context's shape and `cleanContext`, the system prompt.
    - `context.ts` (`buildVoiceContext`, `placeOf`), `local.ts` (`matchLocal`, `speaksHindi`), `runTools.ts` (`runActions`, `confirmText`), `api.ts`.
    - `TalkButton.tsx` (eager, with `talkButton.css`) and `TalkSheet.tsx` (lazy, with `talk.css`).
  - **New `server/command.ts`:** `GET` answers whether talking is on and how many are left today; `POST {text, lang, context}` asks Haiku and returns the checked actions. Routed at `/api/command`.
  - **Changed:**
    - `server/claude.ts` (`callTools`: one tool-use turn, thinking off, cached), `server/context.ts` (`callTools` in `Deps`), `server/http.ts` (`COMMAND_MODEL`), `server/router.ts`, `api/index.js`, `.env.example`.
    - The editor: the `"talk"` overlay and the `talkLang`, `talkSpeak` and `talkNoteSeen` preferences.
    - The shell: `AppShell.tsx` (the lazy sheet; the Talk button above the Home bar on phones), `TopBar.tsx` (Talk on desktop), `RoomStudio.tsx` and `studio.css` (the microphone in a room's header on phones; the name on its own line when narrow), `Checklist.tsx` (opens on "show Vastu"), `icons.ts` (mic, send).
  - **Tests:**
    - Unit: `src/voice/voice.test.ts` (61): every edit tool through its command on a real home (each result valid); destructive tools and growing the house ask first and work on a yes; a request chains into one project and stops at the first failure; views and history; "already so" notes; `cleanAction` keeps good calls and drops 13 kinds of bad ones; `cleanContext` rebuilds and refuses; the context stays under 3 KB and id-free on every starting home; where rooms sit from each road side; the open room's furniture; 27 phrases answered on the phone (English, Hinglish, Devanagari) and 6 left to the AI. `server/command.test.ts` (7): Haiku with the tools, the system prompt and the home, bad calls dropped; at most five actions and a kind answer for none; 15 a day per device, refunded on failure; bad requests refused before spending; offline, fail-closed on Vercel without KV, off with `AI_DISABLED`; nothing said reaches the logs; routing and the same-site check.
    - Browser: `tests/talk.spec.ts` (5, with `/api/command` mocked): on a phone, a typed request resizes the kitchen as one undo step ("Voice: …") and Undo restores it, then Hinglish paints a bedroom; removing a room asks, No changes nothing, Yes removes it; night, opening the kitchen in Hindi and undo are answered without the AI; a fake microphone's words go out in Hindi (`hi-IN`); without speech or the AI, typing still answers and navigation works, fitting at 320 px in Extra large with the room's name on its own line. `DH_SHOTS=1` writes `docs/screenshots/talk/`.
    - `tests/preview/security.spec.ts`: the Talk sheet under the production CSP, and the bundled `/api/command` answering offline and refusing a bad request.
  - **Gate:** typecheck, lint, 960 unit tests, build, `check:api`, 132 browser tests (36 screenshot- and timing-only skipped), 6 preview tests, `diff --check`: all green.
  - **Found in the live check:** on tablets the Talk button stretched into a bar (the tablet rule that widens the Home bar caught it). Fixed in `shell.css`; `talk.spec.ts` now checks it's a 64 px round button above the Home bar at 390 and 768 px.
