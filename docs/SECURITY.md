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

## Admin actions
`ADMIN_TOKEN` is a long random secret set only in Vercel's environment variables. Use it from a terminal; replace `ID` with the 10 characters after `/h/` in the link, and `$ADMIN_TOKEN` with the secret.

```sh
# Hide a shared home (the link shows "This home isn't available")
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://home.amankeshri.com/api/share/ID/hide

# Show it again (also clears its reports)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://home.amankeshri.com/api/share/ID/unhide

# Delete it for good (the home and its picture)
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" https://home.amankeshri.com/api/share/ID
```

Until the new domain is connected, use `https://dream-home-liard-nine.vercel.app` instead.

## If something goes wrong
- **AI costs climbing:** set `AI_DISABLED=1` in Vercel and redeploy. The app keeps working with its built-in planner. Lower `AI_DAILY_BUDGET_USD` or the `LIMIT_*` values (see `.env.example`).
- **A secret leaked:**
  - rotate it where it was issued (the Anthropic console, Upstash, Vercel Blob), update the Vercel variable, and redeploy;
  - for a leaked `ADMIN_TOKEN`, just set a new one.
- **Abuse of sharing:** lower `LIMIT_SHARE_DEVICE` / `LIMIT_SHARE_IP`, and hide or delete the offending links as above.
