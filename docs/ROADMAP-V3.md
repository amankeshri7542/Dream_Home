# Dream Home v3: living roadmap

This file is updated after every milestone. If work stops (for example because a usage limit is hit), start at **Resume here**.

## Resume here
- **Current milestone:** M3, Indian homes.
- **Next action:** add bright facades to `EXTERIOR_FINISHES` (`src/domain/materials.ts`) and `FACADE_LOOKS` (`src/scene/materials/palette.ts`), then add `ProjectStyle.preset` / `ProjectStyle.details`.

## Decisions (owner, 14 Oct 2026)
- Push straight to `main`. Vercel deploys from it.
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
- [ ] **M3** Indian homes:
  - [ ] style presets and bright facades
  - [ ] chhajja, rooftop water tank and mumty
  - [ ] compound wall and gate (this also makes fence choices finally appear in 3D)
  - [ ] car porch, balcony grille and jaali
  - [ ] pooja room, tulsi planter and street tree
  - [ ] street life: people, dog, cow, scooter, auto-rickshaw, grass. Explore and showcase only.
- [ ] **M4** AI Designer:
  - [ ] `/api/design-home`, `/api/design-room` and the limiter
  - [ ] the brief UI (4 steps)
  - [ ] progress and design notes
  - [ ] "Make it nice" and "Style the outside"
  - [ ] the credits chip and the unlock sheet
- [ ] **M5** Mobile usability review and fixes, docs, final checks, push.

## Environment setup (for the AI)
- **Local:** create `.env.local` containing `ANTHROPIC_API_KEY=...`. It is never committed. Then run `npm run dev`; the dev server also serves `/api/*`.
- **Vercel:** in Project → Settings → Environment Variables, add `ANTHROPIC_API_KEY`. For limits that survive restarts, also add an Upstash Redis or Vercel KV integration, which provides `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Optional: `AI_DAILY_BUDGET_USD`, a global daily spend cap.
- **Cost estimate:** one full-home design costs about $0.12–0.20 (₹10–17); a room makeover about ₹2–4.

## Progress log
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
