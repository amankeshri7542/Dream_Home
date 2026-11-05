# Measuring Dream Home

Two checks, so changes are judged by evidence and not by hope. The plan is in [`docs/COMPETITIVE-V6.md`](../docs/COMPETITIVE-V6.md) (P0.3 and P0.4).

## Plan reading: `npm run planeval`

Scores a home built from a reading against the truth.

| Measure | What it means |
|---|---|
| Rooms found | True rooms the result has (overlap ≥ 50%) |
| Rooms real | Rooms in the result that are really there |
| Right use | Found rooms given the right use; a pooja room counts as its own use |
| Edge error | How far a found room's walls are from the truth (median) |
| Doors, Windows | True openings the result has (same wall line, within 60 cm along it) |
| Open areas kept | Balconies, parking, stairs and courtyards |
| Floors missing | Upper floors the reading doesn't cover |
| Fixes | Rooms a homeowner would add, remove, relabel or adjust (any edge over 30 cm out) |

**Where the house sits on its plot doesn't count:** everything is measured from the footprint's corner.

**Read the ceiling's doors, windows and parking with care.** Our own homes' doors and windows are automatic, so the same engine often puts them in the same place, and new homes have parking by default, so that passes by luck. A real plan's doors are wherever its architect drew them.

### Free

```bash
npm run planeval
```

Scores everything already cached, and always reports the **ceiling**: our own homes read flawlessly through today's `planFromReading`. No real reading can beat the ceiling, so it shows what the pipeline itself loses.

```bash
npm run planeval -- --sheets
```

Draws synthetic plan sheets from our own homes (clean, photographed-looking and Hindi-labelled) into `eval/synthetic/`. The home a sheet was drawn from is its exact truth. Clean inputs flatter any reader, so these are a smoke test and never the baseline.

### Paid

**Ask the owner first, and say the cost.** A run reads only plans with no cached reading for that model, then never pays for them again. It refuses to start without `ANTHROPIC_API_KEY`, or if its worst case is over `--max-usd`.

```bash
npm run planeval -- --read --set plans --max-usd 5
```

Worst case per reading: **$0.14** on Sonnet 5.5 (the app's model), **$0.28** on Opus 5.5 (`--model claude-opus-5-5`). So 30 plans cost at most $4.13 and $8.25. The call is built by `planReadCall`, the same code the app's route uses.

### Adding a real plan

Each plan is a folder in `eval/plans/`. Nothing in that folder is committed.

```
eval/plans/<id>/
  plan.jpg      the photo or screenshot, as a homeowner would take it
  truth.json    the plan drawn by hand: see below
  meta.json     {"kind": "clean" | "photo" | "hand" | "hindi", "permission": "whose plan, and who said yes"}
```

**Only use plans you own or have permission to use.**

To make `truth.json`: open the app, choose **Upload my builder's plan**, pick the photo, then **Draw it yourself**. Draw every room over the photo, then More → save a backup file, and save it as `truth.json`.

**The set to aim for (30):** 10 clean screenshots of builder PDFs, 10 phone photos of paper plans, 5 hand-drawn, 5 Hindi-labelled or messy.

## Real look: `npm run bench:look`

Renders one fixed home through ten fixed shots with the real photo pipeline, at phone settings, so every run can be compared with the last. How to use it and how the critic works: [`eval/look/README.md`](look/README.md).
