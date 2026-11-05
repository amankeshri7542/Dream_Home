# Dream Home v6: beating the floor-plan-to-3D wave

> Strategy and product plan, written 3 Nov 2026. No product code changed, nothing committed, no paid AI calls. Nothing here is approved until the owner says so. What was and wasn't checked is in [§10](#10-sources-and-evidence-limits).

## 1. Executive verdict

**Dream Home is the only real product in this field. Today it would still lose a screenshot contest, and its best features are switched off.**

Every build in the wave is one of three things: a one-off made by a developer with Claude, a kit a developer runs for each home, or an offline film pipeline. Together they prove Opus 5.5 can turn a clean drawing into a convincing house. None lets a stranger on a phone change that house, send it to family, or make another for a few rupees.

**Three problems come first:**

1. **The loop is off.** On the live site `GET /api/design` answers `live: false`, `GET /api/share/…` answers "Sharing isn't switched on yet", and `home.amankeshri.com` returns 404. Plan reading has never run on a real plan, so its accuracy is unknown.
2. **It fails its own real-look test.** `PLAN-V5.md` says a screenshot that looks like a game prototype isn't done. At eye level the ceiling and walls are flat, and a window looks out on beige fog because the world ends at the plinth. From outside the home is a toy on a soil slab. The reel never goes inside at eye level.
3. **Plan reading is the shallowest in the set.** It reads rooms as boxes. Doors are read and thrown away, windows aren't asked for, balconies and parking are dropped, stairs become a note, and only one floor is handled. The kits in the wave measure walls and openings.

**The bet: don't chase Cycles-grade realism. Own the whole minute that nobody else can do.**

> A photo of your builder's plan becomes your home in about a minute, on your phone. You stand inside it in your city's real sun. You say "bedroom ko neela karo" and the wall changes while you stand there. One tap sends the video and link to the family, who can remix it.

The rendering gap needs closing because it decides whether anyone looks. It isn't the moat, though: demos will keep improving and Big Bang Planner is already MIT. The moat is everything after generation, plus a cost structure where photos and reels are made on the phone.

**Top three moves to approve:**

1. **Switch it on and measure (P0).** The owner connects KV, Blob and the domain. Then build a 30-plan accuracy baseline and a fixed real-look bench.
2. **Make eye level believable (P1).** Add a real neighbourhood outside, the home as an architect's model on its own plan from above, on-device room light, and a reel that walks inside.
3. **Make the plan-to-home minute (P2 and P3.1).** Read doors, windows and written sizes, measure on the phone, let the drawing stand up into the house, then change the house by voice from inside it.

---

## 2. Dream Home today

### The pipeline

| Stage | What actually happens | Where |
|---|---|---|
| **Start** | Four taps, then Opus 5.5 proposes and our engine builds (the offline planner is the fallback). Also 8 ready homes, a sample, a builder's plan, a saved file, a plot wizard | [`src/onboarding/`](../src/onboarding/), [`src/ai/`](../src/ai/) |
| **Model** | One `Project` in integer cm. Every edit is a pure function ending in `finalizeEdit`. Rooms and floorplates are rectangles, storeys 3 m | [`src/domain/`](../src/domain/) |
| **Edit** | Home → Room studio (Furniture, Colours, Layout, Doors), Edit in 2D on the same data, one-tap Undo | [`src/shell/`](../src/shell/), [`Plan.tsx`](../src/components/Plan.tsx) |
| **Explore** | Turntable, time of day, street life, lived-in details. Walk with joystick, tap-to-walk, collisions and stairs | [`src/explore/`](../src/explore/), [`src/scene/`](../src/scene/) |
| **Photo** | Offline accumulation on the device: N8AO, Halton jitter, soft shadows, Neutral tone mapping, lamp glow. Phones 1600 px at 16 samples, desktops 2560 px at 40 | [`render.ts`](../src/photo/render.ts) |
| **Reel** | 15 s or 8 s vertical MP4 from the same pipeline, with synthesised music and a QR end card, made on the device | [`src/reel/`](../src/reel/) |
| **Share** | `/h/:id` viewer, WhatsApp cards, Remix into My homes, views and remixes | [`src/share/`](../src/share/), [`server/share.ts`](../server/share.ts) |
| **Extras** | Talk (30 closed tools on Haiku, plus a local matcher), real sun, sunlight per room, opt-in Vastu, Home score, offline PWA | [`src/voice/`](../src/voice/), [`src/insights/`](../src/insights/), [`src/pwa/`](../src/pwa/) |

### Live status on 3 Nov 2026

| Feature | Built | Live for a stranger today |
|---|---|---|
| Build, edit, Explore, Walk | Yes | **Yes** (walked in this review) |
| Photo, Reel, PWA | Yes | Buttons are there. Real-phone checks are still owed from M8 |
| Share links, Remix, WhatsApp cards | Yes | **No.** Needs KV and Blob |
| AI designer | Yes | **No.** Falls back to the built-in planner |
| Plan reading | Yes | **No.** Offers "Draw it yourself". Never run on a real plan |
| Talk | Yes | **Local phrases only** |

### What matters for this plan

- **Plan reading:** the schema ([`reading.ts`](../src/planread/reading.ts)) has rooms, doors and stairs. [`fromReading.ts`](../src/planread/fromReading.ts) uses only rooms and overall size. Written room sizes and windows aren't in the schema at all. The confirm screen ([`PlanCheck.tsx`](../src/planread/PlanCheck.tsx)) is the real strength: the photo sits under the live 2D editor, unsure rooms are dashed, every fix can be undone.
- **Reveal:** the construction reveal is five stepped stages. The pieces for something better already exist: [`cutPlane.ts`](../src/scene/materials/cutPlane.ts), wall rise and poché section fill in [`patches.ts`](../src/scene/materials/patches.ts).
- **Light:** sun, hemisphere and a procedural environment map, plus N8AO. There is no bounce light. Night uses a pool of 8 point lights (`LAMP_POOL`).
- **Assets:** 648 KB of GLB for all kits. The 60 interior pieces average 548 triangles (double bed 1,356). Textures are procedural. Door leaves don't move. Trees are blob canopies.
- **Walk:** the HUD covers about a quarter of a phone screen, plus the joystick and a hint. Spawn ignores door swing, so in a landscape window the first view was about one-third door leaf. There is no position on a plan and no measuring. Talk is hidden, and the code assumes no edits in Explore ([`Walkthrough.tsx:109`](../src/explore/Walkthrough.tsx)).
- **Reel:** rooms are dollhouse shots. The best frame today is the door approach with toran and shoes ([`golden-02-approach.jpg`](screenshots/reel/golden-02-approach.jpg)), which nothing in the wave has.
- **Constraints:** 1.5 KB gzip left of the first-load budget, so everything new must be lazy. Build ≤ 90 draw calls, Explore ≤ 160, 0 idle frames while editing, no third-party hosts.
- **Hardening:** 974 unit tests, 142 browser tests and 7 production-header checks at last record, plus a security review, atomic spend limits, and photos and voice never stored.

---

## 3. The wave: competitor matrix

Evidence: **R** repo read · **L** live demo opened · **P** post text and counts only (videos couldn't be watched) · **A** article read · **W** web search only. Views are from 3 Nov 2026. Two posts went up within the last two days, so their counts mean little.

### What each one is

| Build | Ev. | Input | Pipeline | Iteration pattern | Optimised for | Spread |
|---|---|---|---|---|---|---|
| **Chris** @everestchris6 | P | Plan + builder's photos | Agent writes a Three.js site | Builder and fresh-context critic per room, screenshot vs photo, loop until ours wins | Agency pitch | 320k views |
| **floorplan-tours** (found on the way) | R, L | Builder's published plan + photos | One engine, one traced data file per plan | Local critic renders | Acting on Chris's pitch: 2 demos, private leads and outreach files | 0 stars |
| **@aiparabellum** | P, A | 3 architect sheets | One Python script, `blender -b` | Inspects own renders, fixed 17 failed cuts, then a review round | Measured proof | 21 views |
| **@saj_adib** | P | Floor plan | Not stated | Not stated | Tour UX: a blue dot tracks you on the plan | 61 views |
| **Casa Serra** (and Casa Larga) | R, L | An invented house | three.js + GSAP + Lenis, geometry in code, CC0 scans | About 70 prompts over two weeks, rooms scored from recordings. One prompt and about an hour gets a first checkpoint | Studio landing page | 170k views, 378 stars |
| **Big Bang Planner** | R, L | Plan + one real measurement + photos | Claude writes `house.js` in metres, fixed engine | Shows a dimensioned plan, asks for real measurements, one change at a time | Renovation tool for people with Claude | 21k views, 8 stars |
| **@techartist_** | P | Sketch | Three.js + TSL | Not stated | Pure morph: lines, massing, detail, home | 334k views |
| **@Solvaix** (two posts) | P | None; drafted from a grid | One HTML file with fake CAD; a cut-open house with pipes and wires | Not stated; the second is rough by its own account | Spectacle of process | 51k and 2k views |
| **Higgsfield-like** | W | Plan image | Image model makes 3D stills, a video model (Kling, Veo) animates them | Regenerate shots | A pretty clip, cheaply | No dedicated product found |
| **openhouse-3d** | R | 31–34 listing photos | Camera solving, procedural `bpy`, Cycles, film | Photo-by-photo audit, route and flicker checks | Film quality and honest comparison | 58 stars |
| **floorplan-3d-skill** | R | Plan image | Skill writes `plan.json`, R3F, rule-based decor, optional Blender bake | Redraws the plan beside the source, schema self-check, pixel measuring | Best-looking result in the set | 0 stars |
| **@mher_ai** | P, L | Photos of own flat | Three.js simulator on EC2 | Not stated | "My flat is a game" | 131k views (2025) |

### What you can do after generation

| Build | Edit after generation | Phone | Share | Cost per home | Production readiness |
|---|---|---|---|---|---|
| Chris | Ask the agent | Unknown | Static site | Not published; many critic loops | Prompt only |
| floorplan-tours | Swap listed finishes | Yes, recently fixed | Static site | Agent time per plan | Small engine; no tests seen |
| @aiparabellum | Ask the agent | No (Blender) | Files | **$6.29, 14 m 44 s** (Claude Code's own estimate) | Massing model by its own account |
| @saj_adib | Unknown | Unknown | Video | Unknown | Unknown |
| Casa Serra | Code | Runs at 13 MB, best on a laptop, clip fallback | Link | About two weeks of prompting | Marked work in progress; uses CDNs |
| Big Bang Planner | Ask Claude; wall-height slider | Touch controls | Artifact or static host | One Claude session | Clean personal kit; loads three.js from a CDN; no server or limits |
| @techartist_ | Unknown | Unknown | Video | Unknown | Demo |
| @Solvaix | None shown | Unknown | Video | Unknown | Demo |
| Higgsfield-like | Regenerate; not to scale | App | Video | Credits per clip | Not a model of the home |
| openhouse-3d | Edit Python | No | Film | **About 7.5–9 h render** for 66–80 s (estimate from 17 s a frame) | Strong for a film pipeline: tests, resumable renders, checksums |
| floorplan-3d-skill | Edit JSON, reread | Vertical video only | Video, local site | Read 2 min; bake **30–50 min** on a GTX 1050 Ti; film 6 min | Careful, but the tour route is rewritten for each plan |
| @mher_ai | Code | Unknown | Link | Unknown | Demo; boxy |
| **Dream Home** | **Everything, one-tap Undo, voice** | **Designed for it** | **Link, card, Remix (once on)** | **AI ≤ $0.37 a design, ≤ $0.14 a plan reading, about $0.001 a voice command. Photo and reel on the device** | **Tests, CSP, limits, offline, security review** |

Dream Home's costs are worst cases from `worstCaseUsd` in [`server/claude.ts`](../server/claude.ts). Storage and hosting are extra.

### Common patterns

1. **The drawing becomes the building.** Casa Serra, techartist and Solvaix all spread on this. The best version is a real model cut at about 1.2 m, seen through a long lens, with the cut rising.
2. **Walking is the promise.** Chris's post sold a walk, and saj_adib's dot makes one legible.
3. **A data file and a fixed engine.** Big Bang Planner, floorplan-3d-skill and floorplan-tours all converged on this. Dream Home's domain is the same idea taken much further, with validation and editing.
4. **Measure, don't guess.** The accurate reads take scale from written dimensions and measure pixels. floorplan-3d-skill's log shows one clean sheet read wrongly by Opus 4.6 without the skill (7 m 21 s) and correctly by Opus 5.5 with it (2 m 1 s). Its author credits the model version most, then the scale-first instructions. Dream Home reads with Sonnet 5.5, so this needs testing rather than assuming.
5. **A separate critic.** A fresh-context judge works when it has a named reference. openhouse-3d found that a photo-by-photo audit surfaced real problems and "make it more realistic" didn't.
6. **Lighting beats textures.** floorplan-3d-skill's log is the best evidence available. The renderer change gave the biggest lift, scanned textures barely mattered from above, and eye level still looked like a game until bounce light was added.

### Reality check on the category

- **Labour per home.** Claude's own price is low, but somebody runs an agent, checks it and hosts the result. That's a service, not a product.
- **Clean inputs flatter them.** The measured wins came from architect sheets or synthetic drawings. floorplan-3d-skill says plainly that real photographed plans are still untested. No one has shown a phone photo of a stamped Indian builder's plan.
- **The prettiest video isn't the free experience.** floorplan-3d-skill's hero frame isn't in its own film. Casa Serra showed this review a loading fallback before any 3D appeared.
- **The business claim is thin.** $5k–$10k per plan comes from one post with no source. Sending builders their own scraped plans unasked carries copyright risk.
- **Bakes and edits don't mix.** A 30-minute bake is invalid after one moved door. That is why the wave stays static.

The adjacent threat is ordinary products. Planner 5D already sells an editable 3D model from a plan photo, and CapCut's Dreamina does plan-to-video. Those deserve a separate look; they weren't in this brief.

---

## 4. Honest scorecard

Scores out of 5 are this review's judgement.

| Dimension | Dream Home | Best in wave | Today's winner | Why |
|---|---|---|---|---|
| Plan extraction reliability | **Unmeasured**; ~2 by design | ~4 on clean sheets (floorplan-3d-skill, aiparabellum) | **Wave** | Boxes only, nothing checked against the drawing |
| Accuracy theatre | 2 | 5 (Casa Serra) | **Wave** | We overlay the photo but show no dimensions, score or drawing that becomes the model |
| Walkable wow | 3 | 4.5 (floorplan-3d-skill film, Casa Serra) | **Wave** | Ours is free and on any phone, but flat, with fog outside and no entrance moment |
| Material and lighting realism | 2.5 | 4.5 realtime, 5 offline | **Wave** | No bounce light; procedural surfaces |
| Furniture fidelity | 2.5 | 4 (floorplan-3d-skill, openhouse-3d) | **Wave** | About 550 triangles a piece reads chunky close up |
| Edit after generation | **5** | 2 (Big Bang Planner, by chat) | **Dream Home** | No one else has a validated editor |
| 2D ↔ 3D sync | 4 | 3 (Big Bang Planner, saj_adib) | **Dream Home** | Same data both ways; we lack the walking dot and measure tool |
| Mobile UX | 4.5 | 3 (Big Bang Planner) | **Dream Home** | Built for it; the walk HUD needs quieting |
| Share and viral | **5 designed, 0 live** | 2 | **Nobody until P0.1** | Remix and cards exist but are off |
| Cost per home | **5** | 2–3 | **Dream Home** | At most $0.37 of AI per design, and renders on the user's phone |
| Production hardening | **5** | 3 (openhouse-3d, for film) | **Dream Home** | No one else serves untrusted strangers |
| Indian family depth | **5** | 0 | **Dream Home** | Pooja room, Vastu, real sun, Hindi voice, regional looks, toran and shoes |

**Frames that would beat us in a thread today:** floorplan-3d-skill's blue-hour model on a drawing and its eye-level living room; Casa Serra's half plan, half home; openhouse-3d's photo beside its render; techartist's four-stage morph; Big Bang Planner's measuring overlay.

**Our frames worth posting today:** the toran-and-shoes door approach, the Diwali aerial with diyas and rangoli, and the room with a cat and pressure cooker. They're warm and specific, but they don't yet read as real.

---

## 5. The winning stack, mapped onto Dream Home

| Stage | Already here | Missing | Move |
|---|---|---|---|
| Strong plan parse | Sonnet reading, sanitiser, Indian labels, confirm screen | Written sizes, windows, door use, measuring, multi-floor, any accuracy number | P0.3, P2.1–P2.4 |
| Structured data | `Project`, validation, `finalizeEdit`, `parseProject` on the server | Nothing. This is the best in the set | Keep it |
| Hybrid Three + Blender | Blender kits at build time, R3F at runtime, offline photo and reel | Eye-level light, close-up kit | P1.3, P1.4 |
| Photo-guided materials | Nothing | Colours from the family's real things | P3.3 (on-device, palette only) |
| Interactive 2D ↔ 3D | `Plan.tsx`, the lens, shared data | Position on plan while walking, edit from inside | P1.6, P3.1 |
| Measure and export | PNG plan with room sizes, JSON backup | Tape measure, contractor sheet | P3.4 |

---

## 6. The beat-the-wave plan

### One composition

All of this serves one continuous minute, not more panels:

1. Take a photo of the builder's plan.
2. Lines trace over the photo. Rooms name themselves, including "Pooja room". A plain score says how well it matched.
3. Tap *Make it 3D*. The drawing stands up and the walls rise out of the sheet.
4. The camera drops to the gate and goes through the door, past the toran and the shoes.
5. You stand in your living room at 5:15 pm in your own city. The sun is real and the fan is turning.
6. Say "bedroom ko neela karo" and the wall changes. One tap makes a reel with your link, and the family remixes it.

A developer can stage steps 1–4 for one house. No one else can give a stranger steps 5 and 6.

**A simple rule for the look:** from above, it's an architect's model on your plan. At eye or street level, it's a real neighbourhood.

### Build order

Sizes are rough estimates of agent work: **S** about a day, **M** a few days, **L** a week or more, mostly looking and re-rendering.

| # | Item | Outcome | Size | Risk |
|---|---|---|---|---|
| 1 | P0.1–P0.2 | Loop live, real-phone numbers | Owner | Low |
| 2 | P0.3–P0.5 | Plan baseline, real-look bench, loop counters | M | Low |
| 3 | P1.7, P1.1, P1.2, P1.6 | Floors that read as floors, real world outside, model on the plan, quiet walk with blue dot | M | Low |
| 4 | P1.3 | Room light, starting with a 3-day spike | L | **High** |
| 5 | P1.4, P1.5 | Close-up kit, reel goes inside | L | Medium |
| 6 | P2.1–P2.4 | Reading v2, phone measuring, honest check screen | L | Medium |
| 7 | P2.6 | The drawing stands up | M | Medium |
| 8 | P3.1 | Change it while standing in it | M | Medium |
| 9 | P3.2–P3.4, P2.5 | Sun you stand in, match my things, measure, second look if earned | M | Low |
| 10 | P4 | Manual builder pilots | Owner | Legal |

Why this order: being switched off and looking like a toy both hurt most and are cheapest to start on. Room light gets its spike early because the close-up kit and reel depend on knowing whether it works. Reading v2 waits for the baseline so its gain can be proved.

### P0: Switch on and measure

**Status (3 Nov 2026):** the tools are built, and two things are waiting on the owner. Steps for the owner are in [`OWNER-P0.md`](OWNER-P0.md).

| Item | State |
|---|---|
| P0.1 Turn the loop on | Live since 5 Nov (KV, Blob, admin token). The owner must claim the Redis database by 8 Nov |
| P0.2 Real-phone numbers | Meter and steps ready; waiting on the owner and a deploy |
| P0.3 Plan accuracy baseline | Scorer built and tested. Free ceiling in [`eval/reports/`](../eval/reports/ceiling-2026-11-03.md). **The real baseline needs plans and approval to spend** |
| P0.4 Real-look bench | Done: [`baseline`](screenshots/bench/baseline/) and its [ranked gaps](screenshots/bench/baseline/GAPS.md) |
| P0.5 Private loop counters | Done; starts counting once P0.1 is done and this is deployed |

**What the baselines already changed:**
- **Daylight first.** The critic's top gap is that windows don't light rooms: this backs doing P1.3 early.
- **Floors moved up.** It rated floors a high-impact gap, and they are cheap to fix without any download, so they became P1.7.
- **Reading loses more than rooms.** Even a flawless reading of our own homes keeps on average only 29% of balconies, parking, stairs and courtyards (what survives is parking, which is on by default), and 3 of the 7 homes lose an upper floor. Room edges up to 3% off drop plans done in ≤ 3 fixes from 100% to 76%, and move many doors and windows (doors 79% → 64%, windows 86% → 52%, though the 3% is an assumed error, not a measured one). That supports P2.1 and P2.3. These homes aren't real plans, so read this as what the pipeline drops, not as accuracy.
- **A real bug.** "Living / dining" reads as Dining (see P2.1).

**P0.1 Turn the loop on** · Owner · Low risk
- **You see:** links, Remix, WhatsApp cards, AI design, plan reading and Talk all work.
- **Build on:** the setup in the README's Owner setup section. No code.
- **Done when:** `/api/design` says `live: true`, a link made on one phone opens on another, and the WhatsApp card shows.

**P0.2 Real-phone numbers** · Owner, with exact steps prepared · Low risk
- **You see:** nothing new. The plan stops guessing.
- **Build on:** the checks owed from M8, plus Walk frame rate and photo and reel times on one mid-range Android.
- **Done when:** numbers are in the roadmap. They set the budgets for P1.

**P0.3 Plan accuracy baseline** · M · Low risk
- **You see:** nothing yet. We learn how good reading really is.
- **Build on:** 30 permissioned plans (clean, phone photos, hand-drawn, Hindi-labelled). Truth is drawn by hand with *Draw it yourself*, which already saves a `Project`. A local script scores cached readings through `sanitizeReading` and `planFromReading`. Plan images stay out of git.
- **Measures:** room recall, type accuracy, median edge error in cm, door recall, and fixes needed per plan.
- **Beats:** nobody in the wave has published results on real photographed plans. This becomes our proof.
- **Cost:** at most $4.13 per full re-read, about ₹120–240 by the roadmap's typical figure. **Ask before spending.**
- **Done when:** one baseline report exists and later runs reuse cached readings.

**P0.4 Real-look bench** · S · Low risk
- **You see:** nothing directly. It's the acceptance test for P1.
- **Build on:** `DH_SHOTS` with a fixed 10-shot set: 5 at eye level, 2 from the street, 1 aerial, 1 night, 1 reel frame. Review beside private reference photos of real Indian homes.
- **How to judge:** a fresh-context critic picks the better image and names the biggest gap. This runs as Claude Code subagents, so it needs no API key.
- **Don't copy:** critic loops per customer. Use them on our assets, not on each user's home.
- **Done when:** the bench runs with one command and gives a ranked gap list.

**P0.5 Private loop counters** · S · Low risk
- **You see:** the owner gets daily totals: homes shared, opens, remixes.
- **Build on:** KV counters as in `server/share.ts`, with no personal data and no scripts, as PLAN-V5 asks.
- **Done when:** remixes per share can be read daily.

### P1: Real at eye level

**Status (6 Nov 2026):** P1.7, P1.1 and P1.3 are built. P1 is paused while the owner's new phases are merged in. See [`PLAN-P1.md`](PLAN-P1.md).

**P1.1 The world doesn't end at the wall** · S–M · Low risk
- **You see:** in Walk, street-level Photo and Reel, windows look out on neighbouring homes, trees and sky instead of fog. Home and Room keep the clean plinth.
- **Build on:** [`Ground.tsx`](../src/scene/environment/Ground.tsx), [`SkyDome.tsx`](../src/scene/environment/SkyDome.tsx), `street.glb`. A few batched low-detail neighbours, added to the street kit and gated like `StreetLife`.
- **Beats:** the single biggest giveaway compared with floorplan-3d-skill's window views.
- **Don't copy:** its famous skyline backdrop. An ordinary Indian street is more believable here and more personal.
- **Done when:** the bench's window shot wins against today's, Explore stays ≤ 160 draw calls, and Build is unchanged.

**P1.2 The model on your plan** · S · Low risk · Owner's eye
- **You see:** aerial photos, reel openings and share pictures show the home as an architect's model standing on its own drawn plan, with room names and sizes, on a desk, in soft light. A *Plan to home* photo framing splits the frame half drawing, half home.
- **Build on:** [`buildPlanSvg`](../src/domain/export.ts) as a texture, [`framing.ts`](../src/photo/framing.ts), a screen-space tilt-shift in the final shader (M2 ruled out jittered depth of field, so don't use that).
- **Beats:** floorplan-3d-skill's hero and Casa Serra's half-plan frame, with the customer's own home. It turns the diorama from a weakness into an identity.
- **Don't copy:** Casa Serra's stencil look. Keep our warm type.
- **Done when:** the aerial beats today's on the bench and photo time is unchanged.

**P1.3 Room light (the main technical bet)** · L · **High risk**
- **You see:** corners darken softly, the ceiling takes colour from the floor, window light falls off across the room, and every lamp lights its room at night. Walls stop looking uniformly flat.
- **Build on:** a pure module in a Worker takes the project, sun and lamps and computes a small light grid per room. Rooms are axis-aligned boxes with rectangular openings, so sky, sun and one or two bounces can use closed-form rectangle maths rather than ray tracing. A permanent shader patch in [`patches.ts`](../src/scene/materials/patches.ts) reads that grid by world position and normal. Nudging the lookup along the normal keeps light from leaking through walls. No second UV set is needed, so walls and batched furniture both get it. Photo and reel inherit it because they use the live scene.
- **Don't copy (rejected):** per-home Blender bakes (30–50 min, invalid after any edit, server cost). Browser path tracing (floorplan-3d-skill measured 3.7 s a sample, 47 hours a film; stills only). three's `ProgressiveLightMap` (present in 0.180, but it wants unique per-object UVs and our geometry is merged by material with tiling UVs).
- **Beats:** edits stay live. No one with a bake can move a wall and keep the light.
- **Kill rule:** after a 3-day spike on one living room, if it doesn't clearly win the side-by-side or costs too much on the P0.2 phone, stop. Fall back to hand-tuned room ambience and window-light patches.
- **Done when:** the bench's eye-level shots win, draw calls don't change, Build keeps 0 idle frames, it works offline, and it recomputes only on edit or hour change.

**P1.4 Close-up kit** · L · Medium risk
- **You see:** soft cushions and bedding, bevelled edges, real leaf trees, believable bathroom and kitchen pieces, and doors that swing as you approach.
- **Build on:** the `life.glb` pattern: a new lazy kit for Walk, Photo and Reel, about 25 pieces, same ids and footprints so the domain doesn't change. [`scripts/blender/`](../scripts/blender/) already models and bakes AO. Add about 10 scanned CC0 floor and wall sets, self-hosted, only where nothing regional is lost. Athangudi and red oxide stay ours.
- **Budget:** about 5 MB in all, loaded on first use and cached by the service worker. The battery tier keeps today's kit. Casa Serra needs 13 MB on phones.
- **Beats:** openhouse-3d's lesson that sharp-edged boxes and blob trees are the biggest tells, applied within a phone budget.
- **Don't copy:** whole-house texture sets or 135 MB asset downloads.
- **Done when:** the bench's close-ups win, Explore stays ≤ 160 draw calls, and first entry to Walk on the P0.2 phone is acceptable.

**P1.5 The reel goes inside** · M · Medium risk
- **You see:** after the dollhouse reveal, the camera walks through a door into the living room and on to a bedroom at eye level.
- **Build on:** a new `walk` shot in [`path.ts`](../src/reel/path.ts), still pure and deterministic. The route comes from `deriveWalls` and door centres. Adopt floorplan-3d-skill's rules as tests: eye height 1.6 m, no head bob, ≤ 1.06 m/s, 0.55 m/s through doors, ≤ 35° a second of turning, one sweep per room.
- **Beats:** its 80 s film needs a route written for each plan. Ours routes itself for every home.
- **Don't copy:** an 80 s runtime. Keep 15 s, and keep the dollhouse cutaway because it's ours.
- **Done when:** tests prove clearance and speed limits on all starter homes, and phone filming stays under 90 s.

**P1.6 A quiet walk with a blue dot** · S · Low risk
- **You see:** the time panel folds to a small sun chip while walking. You enter at the front door, never behind a door leaf. A small plan shows a dot for where you are; tap a room to go there.
- **Build on:** [`ExploreHud.tsx`](../src/explore/ExploreHud.tsx), `walkSpawn`, and a lazy small plan drawn as SVG, updated by direct DOM writes so React doesn't re-render. It also goes in the viewer.
- **Beats:** saj_adib's whole idea, but it also gives grandparents a tap alternative to the joystick.
- **Don't copy:** an always-on map. It folds away.
- **Done when:** at 320 px with Extra large text nothing overlaps, targets are ≥ 44 px, and the plan adds no draw calls.

**P1.7 Floors that read as floors** · S–M · Low risk
- **You see:** marble with soft veins instead of a contour map, terrazzo that sits quietly under the room instead of confetti, wood without the patchwork, and a floor that holds a soft reflection of the window.
- **Build on:** the procedural generators in [`textures.ts`](../src/scene/materials/textures.ts) and `Look.roughness`. Nothing to download, so it's free on phones and works offline. Scanned sets (P1.4) can come later only if the bench says these aren't enough. Athangudi and red oxide stay ours.
- **Beats:** nothing in the wave has Indian floors. The bench's third-biggest gap.
- **Don't copy:** whole-house scan libraries.
- **Done when:** the bench's 01, 03, 09 and 10 beat the baseline on floors, and draw calls are unchanged. Check chip size and veining against real Indian photos once `eval/look-refs/` has some.

### P2: The plan-to-home minute

**P2.1 Reading v2** · M · Medium risk
- **You see:** the first draft already has doors, windows, balcony and parking, and room sizes as written on the plan.
- **Build on:** extend `READING_SCHEMA` with each room's written size, windows, door type and swing, and open areas. Add sanitiser cases to the existing tests. Run the eval on Sonnet 5.5 and once on Opus 5.5 (at most $0.28 a reading, about double), and move up only if the gain is clear.
- **Beats:** catches up with `plan.json` and Big Bang Planner, while the output stays validated and editable.
- **Don't copy:** a long agent session per plan. One call, then pure code.
- **First fix, found by the P0 scorer:** a label naming two rooms reads as the wrong one. `kindFromLabel` turns "Living / dining" into Dining, because dining comes first in `LABELS`, so such a home has no living room.
- **Done when:** the eval shows gains over the baseline, at a cost per reading the owner accepts.

**P2.2 The phone measures the drawing** · M · Medium risk
- **You see:** rooms snap to the drawn walls, usually before you touch anything.
- **Build on:** a pure `src/planread/measure.ts`: find strong wall lines from dark-pixel profiles on the prepared photo, snap room edges to them, take scale from written sizes, and work out how many drawn walls the result explains. Lazy, no new dependency.
- **Beats:** it matches the skill's pixel-measuring advantage at no AI cost, and the photo needn't leave the phone for this step.
- **Don't copy:** running Python on a server for each plan. On-device is free and keeps the privacy promise simple (server-side code execution wasn't priced).
- **Done when:** median edge error beats the baseline. Starting targets: room recall ≥ 95%, median edge error ≤ 15 cm when sizes are written, door recall ≥ 80%, and 80% of plans needing ≤ 3 fixes.

**P2.3 The whole plan becomes the home** · M · Medium risk
- **You see:** doors and windows where the plan has them; balcony, porch and parking; stairs and an upper floor from a second photo. An optional "longest wall" field, where your measurement wins over the drawing.
- **Build on:** `planFromReading` writes `Floor.openings`, balconies, `parking` and `verticalSpaces` through `finalizeEdit`, falling back to automatic openings when a drawn door fails validation.
- **Limits:** stay with rectangular rooms. L-shaped rooms split, ducts and cut-outs become courtyards or a note. Revisit only if the eval shows many plans fail because of this.
- **Beats:** Big Bang Planner's best rule, applied in one tap and not through a chat.
- **Don't copy:** free-form wall lists. Our rooms stay the source of truth, so every home stays valid and editable.
- **Done when:** results are always valid and the eval's door recall reaches target.

**P2.4 An honest check screen** · S · Low risk
- **You see:** "We read 9 rooms and 7 doors. 92% of your plan's walls line up." Toggle between your photo and our redraw. Written sizes are shown on the rooms.
- **Build on:** [`PlanCheck.tsx`](../src/planread/PlanCheck.tsx), the P2.2 score, the existing `underlay`.
- **Beats:** real accuracy, shown plainly. The wave's versions are staged on one chosen house.
- **Don't copy:** terminal recordings as proof of accuracy.
- **Done when:** the number is computed, never decorative, and each low-scoring room has one obvious fix.

**P2.5 A second look, only if it earns it** · S · Low risk · Paid
- **You see:** on a poor score only, "Taking a second look…" and better rooms.
- **Build on:** one more Sonnet call with photo and redraw, returning corrections as data through the same sanitiser. Uses the existing `reserve` and `settle`. At most $0.14 more.
- **Don't copy:** open-ended critic loops per home.
- **Done when:** the eval shows a clear gain on low-scoring plans. If it doesn't, don't ship it.

**P2.6 The drawing stands up** · M · Medium risk
- **You see:** a plan sheet in ink. The walls rise out of it, materials sweep across, the roof settles, and the camera drops to the gate and through the door. Under 6 s, tap to skip. Viewers of a link see a 3 s version the first time. Reels can open with it.
- **Build on:** a long-lens overhead camera, a continuous `setCutHeight` rise replacing the stepped `constructionReveal` ([`AppShell.tsx`](../src/shell/AppShell.tsx)), the poché fill as the ink, one line overlay from `deriveWalls`, a permanent sweep uniform in `patches.ts` so nothing recompiles, then a hand-off to `Walkthrough`.
- **Beats:** Casa Serra's best idea, on your own plan, on a phone, in seconds rather than two weeks. It works for every home because the drawing is generated.
- **Don't copy:** scroll-driving. Our app isn't a scrolling page, and grandparents shouldn't have to find the gesture. It's time-driven with a skip.
- **Done when:** one continuous shot, budgets hold, reduced motion gets a short dissolve, 0 idle frames afterwards, and it films correctly in the reel.

### P3: Moats only Dream Home can deepen

**P3.1 Change it while standing in it** · M · Medium risk · **The signature moment**
- **You see:** walking in a bedroom, you say or type "paint this room blue". The wall changes while the camera stays still, with a big Undo. Also tap a wall to repaint it.
- **Build on:** Talk in Explore (hidden by `!explore` in [`AppShell.tsx`](../src/shell/AppShell.tsx)), `selected` set from `Walkthrough`'s `onStatus`, [`runActions`](../src/voice/runTools.ts), and keeping the walker in place when the project updates (the "set up once" assumption goes). Add paint phrases to `matchLocal`, so the headline demo needs no AI and works offline. The viewer stays read-only until Remix.
- **Beats:** everyone. No baked or static tour can do this.
- **Don't copy:** asking an agent to regenerate the site for each change.
- **Done when:** in English, Hindi and Hinglish, the room changes without a camera jump, one Undo reverts it, and Explore stays ≤ 160 draw calls.

**P3.2 Sun you can stand in** · S–M · Low risk
- **You see:** a sun chip while walking lets you slide to 4 pm in May and feel the west bedroom's heat, with the existing tip beside it.
- **Build on:** [`solar.ts`](../src/insights/solar.ts), the `sun.ts` phrases, season chips, and Room light if P1.3 survives.
- **Beats:** the wave's light is decorative. Ours answers a question families actually ask before building.
- **Don't copy:** one flattering hour. Show the hot afternoon too.
- **Done when:** one frame per change, closing restores the hour, and it works offline.

**P3.3 Match my real things** · M · Low risk
- **You see:** "Match my sofa" or "Match this paint card": take a photo and pick the nearest paint or fabric.
- **Build on:** on-device colour clusters, mapped to the nearest `WALL_PAINTS` and finish ids. The photo never leaves the phone. Palette only; no custom textures in saved homes, since that breaks the share size limit.
- **Beats:** the useful part of photo-matching, at no AI cost.
- **Don't copy:** rebuilding a room to match photos until the critic is happy.
- **Done when:** one undoable step, with a friendly fallback.

**P3.4 Measure and hand over** · S–M · Low risk
- **You see:** "Will the sofa fit?": tap two points. A contractor sheet lists the plan with room sizes, paints and floors.
- **Build on:** `buildPlanSvg`, `rayToPlot`, the existing share sheet. Keep the existing "illustrative" wording. No costs (the owner ruled out the estimate).
- **Beats:** matches Big Bang Planner's measuring for families who have no Claude account.
- **Don't copy:** anything that looks like a construction document.
- **Done when:** the tape is reachable by tap, and the sheet prints cleanly.

### P4: Builder and realtor lead generation (only after P0–P2 show evidence)

**P4.1 Manual pilots, not a SaaS** · Owner · Legal risk
- **The idea:** an Indian small builder or contractor gets a same-day walkable link for one plan. A buyer can remix finishes, which is what Chris's pitch promises and only we can actually do.
- **Price evidence:** vendor asking prices in India run from about ₹5,000–32,000 per flat to ₹10,000–1,00,000 per unit, and ₹50,000–2,40,000+ a minute for animation. They're asking prices, not market data. The $5k–$10k claim shouldn't be assumed here. Start with 3–5 pilots at ₹2,000–5,000 per plan to test willingness.
- **Build on:** existing links plus a small builder tier: name and a `wa.me` button. No lead capture, so no personal data is stored. `publicName` strips phone numbers to stop phishing, so this tier must be issued by the owner via `ADMIN_TOKEN`, not self-served.
- **Don't copy:** scraping builder sites or sending them their own plans unasked.
- **Done when:** three pilots report whether they'd pay again. Only then consider self-serve.

### What not to copy, and non-goals

| Tempting thing | Why not | Instead |
|---|---|---|
| Scroll-driven landing page | Our product is the app, on phones, for grandparents | Time-driven with skip (P2.6) |
| 13–39 MB of textures | Jio phones, offline-first | About 5 MB lazily, by tier (P1.4) |
| Critic loop per user | Cost scales with each home; slow | At dev time on our assets (P0.4) |
| Blender or Cycles per home | Server cost, minutes to hours, invalid after an edit | On-device light (P1.3) |
| MEP pipes and wires | We have no such data; false authority on a safety matter | Stay "illustrative" |
| Fake CAD screen | Theatre for developers | Edit in 2D |
| Working taps and fridge doors, jump physics | Novelty | Doors and lamps only |
| Famous skyline views | Not their home | An ordinary street, real sun |
| CDN three.js, web fonts, one-file HTML | Breaks our CSP and offline promise | Keep the current build |
| Migrating to WebGPU and TSL now | Our patches rely on `onBeforeCompile`, and phone support needs care | Revisit later, with evidence |

**Non-goals for v6:**
- BIM, IFC or construction documents.
- Photorealism that needs an offline bake for each home.
- Generative video as the main output (not to scale, not editable).
- Arbitrary polygon rooms, unless the eval forces the question.
- Family voting, budget estimates, a public gallery or a Hindi UI. The owner ruled these out, and this plan doesn't reopen them.

---

## 7. Owner decisions

Only these need the owner. Everything else above is a recommendation to proceed with.

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Connect KV, Blob, `ADMIN_TOKEN` and the domain** (accounts, money) | Do this first. Nothing viral can happen before it |
| 2 | **AI budget.** The default $10 a day covers, at worst case, 27 AI designs or 72 plan readings before the app falls back gracefully. A viral day would hit it | Keep $10 for a soft launch, watch P0.5, raise it with data. Approve up to about $5 per Sonnet eval run, one Opus comparison at up to $8.25, and the owed live checks |
| 3 | **Plan reading limit.** One per device blocks a second-floor photo | One plan per device, up to 3 floors: about $0.41 a home at worst |
| 4 | **Taste: model on the plan** for aerial shots vs today's beige | Model on the plan. See both on the bench, then choose |
| 5 | **Legal:** permission for the 30 eval plans, and any builder pilot (architectural copyright, advertising and data rules) | Use your own or permissioned plans only. Get a short legal read before P4 |
| 6 | **Business:** whether to run P4 pilots, at what price, and whether plan readings could be paid | Decide after P2, on evidence |

---

## 8. Risks

| Risk | What happens | Response |
|---|---|---|
| Room light doesn't work | Eye level stays game-like | Kill rule in P1.3. P1.1 and P1.4 still lift it |
| Phone GPUs struggle | Walk stutters | P0.2 sets budgets. Tiers keep today's look on weak phones |
| Real plans defeat reading | Too many fixes | The eval shows it early. The check screen and *Draw it yourself* remain the safety net |
| Rectangular rooms limit fidelity | Odd plans look wrong | Split rooms and notes. Reconsider only on eval evidence |
| A viral spike hits the budget | AI features pause | Atomic cap and planner fallback exist. Sharing and viewing need no AI |
| A clone appears | Big Bang Planner is MIT, so anyone can add a walk and measuring | Our lead is editing, phones, the loop and India depth. Measure it and keep shipping |
| Scope creep | v6 becomes a dashboard | Each item must serve the one composition or be cut |

---

## 9. Suggested "Resume here" blurb

Not applied to `docs/ROADMAP-V5.md`. Paste when the owner approves:

```markdown
- **Next direction (proposed 3 Nov 2026):** `docs/COMPETITIVE-V6.md` compares Dream Home with the viral floor-plan-to-3D builds and sets out v6.
  - **Verdict:** we win on editing, phones, cost, hardening and India depth, but lose on eye-level realism and plan fidelity, and sharing and AI are off on the live site.
  - **Order:** P0 switch on and measure (KV, Blob, domain, 30-plan accuracy baseline, real-look bench); P1 real at eye level (world outside, model on the plan, room light with a 3-day kill rule, close-up kit, reel goes inside, quiet walk with blue dot); P2 the plan-to-home minute (reading v2, phone measuring, honest check screen, the drawing stands up); P3 change it while standing in it, then the other moats; P4 manual builder pilots only on evidence.
  - **Waiting on the owner:** KV, Blob, `ADMIN_TOKEN` and the domain; approval for eval runs (about $5 on Sonnet, one Opus comparison up to $8.25); permission for the eval plans.
```

---

## 10. Sources and evidence limits

**Limits of this review:**
- The pasted research held only the links. The "patterns", "brutal reality check", Higgsfield and business sections it refers to weren't included, so those parts here were rebuilt from primary sources.
- X videos couldn't be watched. Post text and counts came through a public reader (`api.fxtwitter.com`). Where a table says "not stated", that's about the post text; the video may show more.
- Higgsfield: no dedicated floor-plan product was found, only tutorials for a stills-then-video workflow.
- Vendor prices are asking prices from vendor pages. Chris's $5k–$10k is a single unverified post.
- The openhouse-3d render time is an estimate from one measured frame time.
- Dream Home's reading accuracy, phone performance and real AI output are unmeasured: no paid calls were made and no real phone was used. Scores are judgement, not measurement. Live status was checked on 3 Nov 2026 with unpaid status requests only.
- Sizes, room-light behaviour and accuracy targets are estimates or proposals, not results.
- Prices were checked with the `claude-api` skill (its table is cached from 6 Oct 2026) and match `server/claude.ts`.

**Posts:** [Chris](https://x.com/everestchris6/status/2110036224320884998) · [Samnang Aing](https://x.com/SammmAing/status/2109708195031900310) · [aiparabellum](https://x.com/aiparabellum/status/2117572515073585476) · [saj_adib](https://x.com/saj_adib/status/2117324737252819094) · [techartist_](https://x.com/techartist_/status/2102503719762018434) · [Solvaix apartment](https://x.com/Solvaix/status/2111880621954081240) · [Solvaix cutaway](https://x.com/Solvaix/status/2116239616025968832) · [mher_ai](https://x.com/mher_ai/status/1970868085491220691) · [Juan Macías](https://x.com/juanmacias/status/2114770148519502081)

**Repos and demos:** [Casa Serra](https://github.com/Sam1983Aing/casa-serra) ([live](https://sam1983aing.github.io/casa-serra/)) · [Casa Larga](https://github.com/Sam1983Aing/casa-larga) · [Big Bang Planner](https://github.com/darkspock/bigbangplanner) ([site](https://juanmacias.com/bigbangplanner/)) · [floorplan-3d-skill](https://github.com/cdt2019/floorplan-3d-skill) · [openhouse-3d](https://github.com/yunfanye/openhouse-3d) ([page](https://yunfanye.github.io/openhouse-3d/)) · [floorplan-tours](https://github.com/Adamruns/floorplan-tours) ([live](https://adamruns.github.io/floorplan-tours/)) · [mher.ai](https://mher.ai)

**Articles:** [aiparabellum's measured Blender test](https://aiparabellum.com/claude-blender-floor-plan-to-3d-model-tested/) · [Higgsfield Nano Banana Pro tutorial notes](https://lilys.ai/en/notes/nano-banana-pro-20251128/nano-banana-pro-architecture-interior-ai) · [plan-to-video workflow guide](https://www.besthub.dev/articles/how-ai-turns-a-2d-floor-plan-into-a-3d-walkthrough-video-2655b0b5ede6) · [Dreamina plan to video](https://dreamina.capcut.com/seedance/floor-plan-to-video) · [Planner 5D notes](https://usethisai.pages.dev/interior-designer/planner-5d)

**India pricing (vendor pages):** [Construction Estimator India](https://constructionestimatorindia.com/?p=17092) · [Peninsular Artworks](https://peninsularartworks.com/blogs/3d-architectural-rendering-cost-in-india-2026-pricing-guide) · [IndiaMART listings](https://m.indiamart.com/impcat/architectural-walk-through.html) · [3D Labz](https://www.3dlabz.com/architectural/3d-walkthrough-animation-cost-india.html)
