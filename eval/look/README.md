# The real-look bench

`PLAN-V5.md` says a screenshot that looks like a game prototype isn't done. This bench makes that testable: one fixed home, ten fixed shots, the real photo pipeline at phone settings (1600 px, 16 samples).

```bash
npm run bench:look
```

| Shots | What they test |
|---|---|
| `01`–`04` eye level | Living room, main bedroom, kitchen, bathroom, each from a corner chosen by eye so it judges the room and not a bad angle |
| `05` eye level | Looking out of a window: what's outside |
| `06`–`07` street | From across the road and from inside the gate, at a person's height |
| `08` aerial | The whole home from above |
| `09` night | The living room by its lamps |
| `10` reel | A frame of the reel's first room |

Eye-level and night shots also get `-live.jpg`, the screen a walker on a phone actually sees (390 × 844, no careful rendering). The photo is the best case and the live view is the everyday one, so judge both.

Runs go to `docs/screenshots/bench/latest/` (not committed). `--label baseline` is kept in git; don't overwrite it without a reason. `--only 01-eye-living,08-aerial` runs just those shots.

The shots come from [`benchShots.ts`](../../src/scene/lab/benchShots.ts). Changing one makes earlier runs incomparable, so change them rarely and say so in the roadmap.

## The critic

A fresh-context judge, in the pattern that worked for the viral builds: pick the better image, name the biggest gap, no flattery. It runs as a Claude Code subagent, so it needs no API key and spends nothing beyond the session.

**Give it the images and references, not your opinion of them.** Put private reference photos in `eval/look-refs/` (not committed; real Indian homes you have permission to use).

The prompt:

> You are a hard-to-impress architectural visualisation art director, judging a phone app for Indian families that designs homes in 3D. Be blunt; nothing here needs protecting. Don't suggest how to build anything.
>
> Read `docs/screenshots/bench/<label>/manifest.json`, then look at every image in that folder, including the `-live` ones. Then look at the reference images: `<paths>`.
>
> 1. For each shot, say in one line whether it would pass as a real photograph or a professional render, and what gives it away first. Compare it with the closest reference and say which is better.
> 2. Rank the ten biggest gaps across all shots, biggest first. A gap is one thing a viewer would notice, not a technique. For each, name the shots that show it and how much fixing it alone would change the overall impression (high, medium or low).
> 3. Name the two or three things that are already good and must not be lost.
>
> Judge only what you can see in the images. Don't guess how they were made.

Save the answer beside the run as `GAPS.md`, and compare with the last run's before calling an improvement done.
