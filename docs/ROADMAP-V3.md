# Dream Home v3: living roadmap

This file is updated after every milestone. If work stops (for example because a usage limit is hit), start at **Resume here**.

## Resume here
- **M0–M5 are built, and the full checks pass** (15 Oct 2026): typecheck, lint, 609 unit tests, 89 browser tests (8 screenshot tests skipped unless `DH_SHOTS=1`), and the build.
- **Committed and pushed to `main`** on 15 Oct, at the owner's explicit request.
- **To go live with real AI:**
  1. Add `ANTHROPIC_API_KEY` in Vercel (optionally also KV and `AI_DAILY_BUDGET_USD`).
  2. Make one live test call locally with `.env.local`, once the owner approves the spend.
- **Open items:** none from the review. All six were fixed on 15 Oct (see the progress log).
- **Next ideas:**
  - Payments (Razorpay UPI) for AI packs at about ₹49–99.
  - Login, so credits follow the user.

## Decisions (owner, 14 Oct 2026)
- Push straight to `main`; Vercel deploys from it. (Superseded on 15 Oct: no git or GitHub actions. The owner commits.)
- The AI Designer uses **Claude Opus 5.5** (`claude-opus-5-5`) through a server function. The key never reaches the browser.
- AI free tier: 3 home designs and 10 room makeovers per device. Then an "Unlock more" screen. Login and Razorpay (UPI) come later.
- Indian style is the default for new homes. The diorama styles remain as choices.
- Phones come first in every design decision.

## Milestones
- [x] **M0** Ship the diorama sandbox to `main`, start this log.
- [x] **M1** Bugs:
  - [x] dock "More" menu is clipped, and "All details" does nothing in tool mode (the menu now sits beside the scrolling bar)
  - [x] the 2D plan moves and resizes in one tool, renamed "Edit in 2D": drag the body to move, pull a dot to resize
  - [x] furniture must fit the room kind (no beds in kitchens): `furnitureFitsRoom` / `furnitureMisfit` in `src/domain/furniture.ts`
- [x] **M2** Attached bathroom (en-suite): `Room.attachedTo`, a door rule, "Add attached bathroom", and templates.
- [x] **M3** Indian homes (details in `docs/m3-progress.md`):
  - [x] style presets and bright facades
  - [x] chhajja, rooftop water tank and mumty
  - [x] compound wall and gate (this also makes fence choices finally appear in 3D)
  - [x] car porch, balcony grille and jaali
  - [x] pooja room, tulsi planter and street tree
  - [x] street life: people, dog, cow, scooter, auto-rickshaw, grass. Explore and showcase only.
- [x] **M4** AI Designer:
  - [x] `/api/design` (home + room) and the limiter
  - [x] the brief UI (4 steps)
  - [x] progress and design notes
  - [x] "Make it nice" (Outside is covered by M3's one-tap Looks, so there is no separate AI "Style the outside")
  - [x] the credits chip; when free designs run out, the notes explain it and the built-in planner keeps working. No waitlist form: it would collect contacts that go nowhere until payments exist.
  - [x] vibe → style preset; planner looks use the new Indian facades and garden pieces (tulsi, neem)
- [x] **M5** Mobile usability review, fixes, docs and final checks. No push: the owner asked for no GitHub actions.

## Environment setup (for the AI)
- **Local:** create `.env.local` containing `ANTHROPIC_API_KEY=...`. It is never committed. Then run `npm run dev`; the dev server also serves `/api/*`.
- **Vercel:** in Project → Settings → Environment Variables, add `ANTHROPIC_API_KEY`. For limits that survive restarts, also add an Upstash Redis or Vercel KV integration, which provides `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Optional: `AI_DAILY_BUDGET_USD`, a global daily spend cap.
- **Cost estimate:** one full-home design costs about $0.12–0.20 (₹10–17); a room makeover about ₹2–4.

## Decisions (M4 build, 15 Oct 2026)
- The AI chooses the program, names, Vastu zones, colours, extra pieces and the exterior. The layout engine places the rooms. This means the result is always a valid home, with no repair loop and fewer output tokens, so it's faster and cheaper than having the model draw rectangles.
- There is one function, `api/design.js`: `POST {kind: "home" | "room", brief, variant}` and `GET` for credits. If the AI is offline, busy or out of free uses, the app quietly uses the built-in planner. A free use is only taken when the AI succeeds.

## Progress log
- **2026-10-15 (open items):**
  - Edit in 2D frames the whole floor, clear of the hint and the zoom buttons.
  - The More menu: focus goes to the first item, arrow, Home and End keys move, and Escape closes only the menu and returns focus to the button.
  - The AI brief: one Tab stop per choice group, arrow keys choose, Escape steps back.
  - Captioned tool buttons keep their full name for screen readers ("More actions", "Ground & fence").
  - The Street life switch is saved as a device preference.
  - Street lights line the kerb of Indian streets about every 9 m, clear of gates.
  - The compound wall is plastered in a lighter shade of the house colour, with trim-coloured pillars, so the classic look is no longer heavy maroon.
- **2026-10-15 (M3 + M5):**
  - M3 landed from the helper agent. Asset sizes: exterior.glb 131 KB, interior.glb 237 KB, street.glb 68 KB. Draw calls at 390 px: Build 75, Explore with street life 71. Build stays at 0 idle frames.
  - The phone review found no blockers. P1 fixes:
    - The notes card stays clear of the camera buttons and takes at most a third of the screen.
    - Shortfall notes come first, and step 2 shows a "fits about N bedrooms" hint.
    - Undo while the notes are open closes them, and focus moves to the notes.
    - "Add attached bathroom" is only offered when it fits (a dry run), and a compact 1.5 m bath can be carved from a snug bedroom.
    - The overlap message names both rooms and leads with the room being moved.
    - Sheet titles wrap to two lines.
    - The "Make it nice" result stays in its panel.
    - Plainer wording ("Dream Home's own designer"), 44 px floor chips, and a centred brief sheet on tablets.
- **2026-10-15 (M4):**
  - AI designer working end to end with a mocked API and offline.
  - Unit: 18 engine tests, 7 server tests. Browser: `tests/ai.spec.ts` (4 tests).
  - No live Claude call made yet: no key in `.env.local`, and the owner should approve spend first.
- **2026-10-14:**
  - M0: full checks green (544 unit tests, 75 browser tests, build).
  - Fixed a flaky furniture test by stepping into the room before tapping.
  - Shrank the renderer screenshots from 13 MB to 2.9 MB (PNG to JPEG).
  - Committed and pushed to `main`.
- **2026-10-14 (M1):**
  - Fixed the clipped More menu.
  - "Edit in 2D" now moves and resizes in one tool; `Plan.onMove` reports the gesture kind.
  - Added the furniture/room rule:
    - catalog chips are filtered to fitting pieces;
    - changing a room's use drops pieces that no longer belong (or re-furnishes it automatically);
    - a new `furniture-wrong-room` advisory for old saves.
  - Checks: 547 unit tests, 79 browser tests, build green.
- **2026-10-14 (M2):**
  - Attached bathrooms:
    - `Room.attachedTo` (schema whitelist);
    - door rule in `walls.ts` (`ensuiteHost`, `doorWallFilter`), applied to automatic and custom doors;
    - `addAttachedBathroom` in `src/domain/ensuite.ts`: beside the bedroom, else carved from a roomy bedroom, else after growing the house;
    - link cleanup reconciler in `ensuiteRules.ts`.
  - UI: More → "Add attached bathroom", a button in the room details, and a checklist idea.
  - Villa and duplex templates now include an en-suite.
  - Checks: 552 unit tests, 80 browser tests.
