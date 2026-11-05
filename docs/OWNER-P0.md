# P0: what only the owner can do

From [`COMPETITIVE-V6.md`](COMPETITIVE-V6.md). Three jobs, in this order. The phone meter in job 2 works once this work is deployed.

## 1. Switch the loop on (P0.1)

**Done on 5 Nov at your word, except one thing only you can do:**

- **Claim the Redis database by 8 Nov 2026,** or it's deleted and sharing goes off. Open the claim link (it's on the first lines of `.env.production.local` on your Mac, and in the agent's message), sign in to Upstash or create a free account, and press **Claim**. Nothing else changes: same address, same token.
- **Or, for the long run, use Upstash through Vercel instead:** Vercel → Storage → Upstash for Redis → Free, accept the terms, connect it to dream-home. That replaces `KV_REST_API_URL` and `KV_REST_API_TOKEN` itself; then redeploy. Share records in the old database stay behind, so do it before many links are shared.
- **Rotate `ADMIN_TOKEN` when convenient,** as you planned: it was pasted into a chat. Make a new one with the command below, then Vercel → Settings → Environment Variables → `ADMIN_TOKEN` → Edit, and redeploy.

The steps below are how it was done, for reference.

In Vercel, on the Dream Home project:

1. **Storage → connect Upstash Redis (KV).** It adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Limits, the AI budget and share records live here.
2. **Storage → create a Blob store and connect it.** It adds `BLOB_READ_WRITE_TOKEN`. Shared homes and their pictures live here.
3. **Settings → Environment Variables → add `ADMIN_TOKEN`.** Make one in a terminal with the command below. Keep it private.

```bash
openssl rand -base64 32
```

4. **Check `ANTHROPIC_API_KEY` is there.** Leave `AI_DAILY_BUDGET_USD` at 10 for now.
5. **Deployments → Redeploy** the latest one.

Later, once `home.amankeshri.com` is added (Hostinger DNS: CNAME `home` → the value Vercel shows), set `PUBLIC_ORIGIN` and `VITE_PUBLIC_ORIGIN` to it and redeploy. Don't redirect the old address: its banner moves people's homes across.

**Check it worked.** This should answer `"live":true`:

```bash
curl -s -H "x-dream-device: owner-check-0123456789" https://dream-home-liard-nine.vercel.app/api/design
```

Then, on your phone: open the app, tap **Share**, then **Make my link**, and send it to yourself on WhatsApp.

- [ ] The WhatsApp message shows a picture and the home's name.
- [ ] The link opens on a second phone.
- [ ] Remix on that phone puts a copy in its My homes.

After that, send me the word and I'll run the owed live checks (one plan reading at most $0.14, a few voice commands at about $0.001 each).

## 2. Real-phone numbers (P0.2)

Use one **mid-range Android**, the kind your families actually have, on mobile data if you can. If you have an iPhone, repeat what you can on it.

Open this address. A small black box of numbers appears on the left of the screen:

```
https://dream-home-liard-nine.vercel.app/?debug=meter
```

Tap **Just show me a sample home** and then measure these. A screenshot of the box is all I need for the first row.

| Check | How | Write down |
|---|---|---|
| **Walking** | Explore → Walk inside. Hold the joystick forward and walk around for 20 s | "moving" typical and worst, draw calls, quality, the GPU line |
| **Photo** | Tap Photo, choose Aerial, tap Take photo. Time it | Seconds, and whether it says "quick photo instead" |
| **Video** | Tap Video, Grand tour, Make my video. Time it | Seconds, and whether the phone got hot or the app reloaded |
| **Reel in apps** | Share the finished video to WhatsApp and to Instagram | Does it play and post? Is the music there? |
| **Hindi voice** | Tap Talk, switch to हिंदी, say "बेडरूम को नीला करो" (needs the loop on) | Did it hear you? Did the wall change? |
| **Install** | Chrome menu → Install app, or iPhone Share → Add to Home Screen | Does it open from the icon, and open offline in flight mode? |
| **Listen** | Play the video's music | Would you be happy for strangers to hear it? |

Send me the results in any form. They set the budgets for P1.

## 3. Plans for the accuracy baseline (P0.3)

The scorer is built and tested. What it still needs is real plans, and your yes to spend.

- **Plans:** aim for 30. Roughly 10 screenshots of builder PDFs, 10 phone photos of paper plans, 5 hand-drawn, 5 Hindi-labelled or messy. **Use only plans you own or have permission to use**, and tell me whose permission each one has. They stay on this machine and never go into git.
- **Truth:** each plan also needs a hand-drawn copy to score against. It takes a few minutes per plan in the app's *Draw it yourself*. I can draw them from your photos, and you only check them. Steps are in [`eval/README.md`](../eval/README.md).
- **Spend:** a full run on Sonnet 5.5 costs at most **$4.13** (typically ₹120–240), and one comparison on Opus 5.5 at most **$8.25**. Readings are cached, so each plan is paid for once per model.

**Fewer is fine to start:** even 10 real plans would replace guesses with real numbers.
