# Dream Home v5: living roadmap

The full plan is [`docs/PLAN-V5.md`](PLAN-V5.md). This file tracks progress so
work can resume after any interruption. Update it at the end of every phase.

## Resume here
- **Done and shipped (17 Oct 2026):**
  - M0a: server router, limiter, Claude pricing, security headers.
  - M0b: My homes, first screen, text size, sounds, "Keep for later", move-by-link.
  - M1: share links, the viewer, Remix, WhatsApp previews, reports, admin.
- **Next phase: M2.** Photo mode. It also gives share links a render-quality preview picture.
- **Owner actions pending** (sharing and the AI designer are off on the live site until these are done):
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

## Milestones
- [x] **M0a** Server router, limiter, security headers
- [x] **M0b** My homes, settings, copy, first launch, domain hand-off
- [x] **M1** Live link + Remix + WhatsApp preview
- [ ] **M2** Photo mode
- [ ] **M3** Regional looks + lived-in details
- [ ] **M4** "My dream home" reel
- [ ] **M5** Location, real sun, sunlight, Vastu, Home score
- [ ] **M6** Builder's plan → 3D
- [ ] **M7** Talk to your home (voice + chat, Haiku 5.5)
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
