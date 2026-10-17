# Dream Home v5: living roadmap

The full plan is [`docs/PLAN-V5.md`](PLAN-V5.md). This file tracks progress so
work can resume after any interruption. Update it at the end of every phase.

## Resume here
- **M0a is done and shipped** (17 Oct 2026): the server router, limiter, Claude pricing and security headers.
- **Next phase: M0b.** My homes, text size and sounds, "Keep for later" copy, first launch, "Move my homes" domain hand-off, `vite:preloadError` reload.
- **Owner action pending:** connect **Upstash Redis / Vercel KV** to the Vercel project. Until then the live site's AI designer is switched off on purpose and the built-in planner is used (see Decisions).

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

## Milestones
- [x] **M0a** Server router, limiter, security headers
- [ ] **M0b** My homes, settings, copy, first launch, domain hand-off
- [ ] **M1** Live link + Remix + WhatsApp preview
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
