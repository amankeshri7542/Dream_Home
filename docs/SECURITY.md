# Dream Home: security notes and admin runbook

The full threat model is in [`PLAN-V5.md` §5](PLAN-V5.md). This page covers what's live and what the site owner can do.

## What protects the site today
- **Headers on every response** (`server/headers.ts`, mirrored in `vercel.json`):
  - a strict Content-Security-Policy: our own scripts only, no other hosts, no framing;
  - HSTS, `nosniff`, a referrer policy, a permissions policy, COOP, and `X-Frame-Options`.
  - `npm run test:preview` checks the app runs cleanly under them.
- **One API router** (`server/router.ts`):
  - requests that change something must come from our own pages;
  - request bodies are capped while they're read.
- **Limits** (`server/limiter.ts`):
  - per device, per connection per day (IPv6 counted per /64), and a daily AI budget, all checked and counted in one atomic step;
  - on Vercel, nothing that costs money or stores data runs without the Upstash KV store;
  - `AI_DISABLED=1` switches all AI off.
- **Share links** (`server/share.ts`):
  - links are random 10-character ids;
  - editing needs a 32-byte token that only the sharer's device keeps (stored on the server as a SHA-256 hash, compared in constant time);
  - every shared home is re-validated by the app's own loader, and only the cleaned copy is stored;
  - names lose links, phone numbers and e-mail addresses;
  - the city is hidden unless the sharer chooses to show it;
  - preview pictures must be real JPEGs within size limits and are served sandboxed;
  - the API, link pages and pictures carry `noindex`.
- **Reports:** a home reported from three or more different connections (and by at least 5% of its viewers) is hidden until an admin looks at it.
- **The AI never acts on its own** (`server/design.ts`, `server/planRead.ts`, `server/command.ts`):
  - answers are structured (a strict JSON schema, or a closed set of tools) and checked again on the server and in the app: numbers clamped, lists capped, values from fixed lists, room refs that exist;
  - the AI only proposes; the app's own commands build the home, so every result is a valid, undoable edit, and removing a room, emptying one, a new look or growing the house asks first;
  - system prompts say that text in a picture or in what someone said is data, never instructions.
- **Privacy of plan photos and voice:**
  - a plan photo is redrawn on the phone before it's sent (dropping EXIF and GPS), read in memory and never stored;
  - Talk to your home sends only the words (the browser turns speech into text) and a small description of the home with short refs, not ids; nothing is stored;
  - server logs hold only the route, model, token usage and cost; a failed call logs the error's name. Unit tests check that nothing said or read reaches the logs.
- **The service worker** (`src/pwa/sw.js`):
  - it never caches the API or shared-home pages (`/h/…`), so answers and shared homes are always fresh;
  - it serves only our own origin's files, keeps built files by their content hash and models by their `?v=` version;
  - a new version waits for a tap on *Update*; `/sw.js` is sent with `Cache-Control: no-cache` so a fix reaches everyone on their next visit.

## Limits

Per device (a random id the browser keeps) and per connection (IP, IPv6 per /64) per day; `LIMIT_<KIND>_DEVICE` and `LIMIT_<KIND>_IP` override them (see `.env.example`). AI calls also count against `AI_DAILY_BUDGET_USD` (default 10).

| Kind | Per device | Per connection a day | Costs AI |
|---|---|---|---|
| `home` (AI home designs) | 3 for life | 8 | yes |
| `room` (AI room makeovers) | 10 for life | 30 | yes |
| `plan` (reading a builder's plan) | 1 for life | 3 | yes |
| `command` (Talk to your home) | 15 a day | 60 | yes |
| `share` (making or updating links) | 20 a day | 60 | no |
| `image` (a link's preview picture) | 40 a day | 120 | no |
| `report` | 10 a day | 20 | no |
| `read` (opening shared homes) | — | 600 | no |

**The daily budget is a hard cap.** Each AI call charges its worst case (every allowed token) to the budget in the same atomic step as the limits, so calls running at the same time can't overshoot it; when the call ends, the charge is corrected to what it really cost. When a call fails, the device gets its use back (the person didn't get an answer) and:
- a refusal or cut-off answer counts its real cost, and the connection's use stays taken, so a loop of failing requests from one place still runs into its daily limit;
- a call that never reached the model costs nothing and everything comes back;
- a call cut off by a timeout keeps its worst case charged, since nobody knows what it cost. Every call also has a hard deadline (the stream included), within Vercel's time limit.

Reports and views count IPv6 per /48 (a whole site), so one person's address range is one voice.

## Admin actions
`ADMIN_TOKEN` is a long random secret (at least 32 characters; make one with `openssl rand -base64 32`) set only in Vercel's environment variables. Use it from a terminal; replace `ID` with the 10 characters after `/h/` in the link, and `$ADMIN_TOKEN` with the secret.

```sh
# Hide a shared home (the link shows "This home isn't available")
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://home.amankeshri.com/api/share/ID/hide

# Show it again (also clears its reports)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://home.amankeshri.com/api/share/ID/unhide

# Delete it for good (the home and its picture)
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" https://home.amankeshri.com/api/share/ID
```

Until the new domain is connected, use `https://dream-home-liard-nine.vercel.app` instead.

## Known limits (reviewed 18 Oct 2026)
- **Shared homes need KV even to be read:** if the store is down, links show "This home isn't available" until it's back.
- **No global cap on making links:** limits are per device and per connection. Watch Blob storage, and lower `LIMIT_SHARE_*` if it grows fast.
- **A stopped or hidden share** can still be served from the CDN for about a minute.
- **Running locally:** `npm run dev` listens on your network (so you can open it on your phone). On shared Wi-Fi, don't keep a real `ANTHROPIC_API_KEY` in `.env.local`, or anyone there could use it.
- **`npm audit`:** production dependencies have no known issues. Dev tooling has some (vitest 3, older brace-expansion and source-map-js); they never ship to the browser or the server, and updating vitest is a major upgrade for a later chore.

## If something goes wrong
- **AI costs climbing:** set `AI_DISABLED=1` in Vercel and redeploy. The app keeps working with its built-in planner, "Draw it yourself" for plans and the phone's own answers for talking. Lower `AI_DAILY_BUDGET_USD` or the `LIMIT_*` values (see `.env.example`).
- **A bad release:** roll back in Vercel (Deployments → the previous one → Promote). Installed apps pick it up on their next visit: the service worker is never cached, and the app offers *Update*.
- **A secret leaked:**
  - rotate it where it was issued (the Anthropic console, Upstash, Vercel Blob), update the Vercel variable, and redeploy;
  - for a leaked `ADMIN_TOKEN`, just set a new one.
- **Abuse of sharing:** lower `LIMIT_SHARE_DEVICE` / `LIMIT_SHARE_IP`, and hide or delete the offending links as above.
