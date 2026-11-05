#!/usr/bin/env node
// How good is plan reading? See eval/README.md.
//
//   npm run planeval                      score what's cached (free)
//   npm run planeval -- --sheets          draw synthetic plan sheets (free)
//   npm run planeval -- --label baseline  also keep the report under that name
//   npm run planeval -- --read --max-usd 5 [--model claude-opus-5-5] [--set plans] [--only id,id]
//                                         read uncached plans with the real AI (PAID)
//
// A paid run needs ANTHROPIC_API_KEY and --max-usd, and refuses to start if its
// worst case is over that. Tests use --read --fake, which never calls the AI.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EVAL = join(ROOT, "eval");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

// The same TypeScript the app and server run, bundled for Node.
const bundle = join(ROOT, "node_modules", ".cache", "planeval", "entry.mjs");
await build({
  absWorkingDir: ROOT,
  entryPoints: ["scripts/planeval/entry.ts"],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["@anthropic-ai/sdk", "@vercel/blob"],
  logLevel: "warning",
});
const lib = await import(pathToFileURL(bundle).href);

/** A fake reading never takes the place of a real one: it's kept apart and scored only with --fake. */
const readingFile = (plan, model) => join(plan.at, "readings", `${model}${flag("fake") ? ".fake" : ""}.json`);
const plotOf = (home) => ({ widthCm: home.plot.width, depthCm: home.plot.depth, road: home.plot.road });
const ROAD_SIDE = { south: "bottom", north: "top", west: "left", east: "right" };
const percent = (v) => `${Math.round(v * 100)}%`;
const cm = (v) => `${Math.round(v)} cm`;

/** The homes every free check runs on: our own, so there's no permission to ask for. */
function ownHomes() {
  const homes = ["compact", "family", "courtyard"].map((id) => ({ id: `preset-${id}`, home: lib.createPreset(id) }));
  for (const template of lib.TEMPLATES.filter((t) => ["bungalow", "villa", "duplex", "courtyard"].includes(t.id))) {
    const built = lib.buildTemplate(template);
    if (built.ok) homes.push({ id: `template-${template.id}`, home: built.project });
  }
  return homes;
}

/** Plans on disk: real ones in eval/plans, generated ones in eval/synthetic. */
function plansIn(set) {
  const dir = join(EVAL, set);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const at = join(dir, e.name);
      const source = readdirSync(at).find((f) => /^plan\.(jpe?g|png|webp|heic)$/i.test(f));
      const meta = existsSync(join(at, "meta.json")) ? JSON.parse(readFileSync(join(at, "meta.json"), "utf8")) : {};
      const truth = existsSync(join(at, "truth.json")) ? lib.parseProject(readFileSync(join(at, "truth.json"), "utf8")) : null;
      return { id: e.name, set, at, source: source && join(at, source), meta, truth };
    });
}

/** Draws our own homes as clean and photographed-looking plan sheets. */
async function drawSheets() {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const { id, home } of ownHomes())
      for (const kind of ["clean", "photo", "hindi"]) {
        const at = join(EVAL, "synthetic", `${id}-${kind}`);
        mkdirSync(at, { recursive: true });
        const { svg, width, height } = lib.planSheetSvg(home, { hindi: kind === "hindi" });
        // "photo": a phone shot of paper: slightly turned, warm, uneven light, a little soft.
        const look =
          kind === "photo"
            ? `<div style="position:absolute;inset:0;background:#c9b9a0"></div>
               <div style="position:absolute;inset:0;transform:perspective(1800px) rotateX(2deg) rotateZ(1.3deg) scale(.95);filter:blur(.35px) contrast(.86) sepia(.14) brightness(.96)">${svg}</div>
               <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 30% 25%,transparent 40%,rgb(50 35 15 / 28%) 100%)"></div>`
            : svg;
        await page.setViewportSize({ width, height });
        await page.setContent(`<!doctype html><html><body style="margin:0;position:relative;width:${width}px;height:${height}px;overflow:hidden">${look}</body></html>`);
        writeFileSync(join(at, "plan.jpg"), await page.screenshot({ type: "jpeg", quality: 88 }));
        writeFileSync(join(at, "truth.json"), JSON.stringify(home));
        writeFileSync(join(at, "meta.json"), JSON.stringify({ kind, permission: "our own generated home", synthetic: true }, null, 2));
        console.log(`[planeval] drew ${id}-${kind} (${width} × ${height})`);
      }
  } finally {
    await browser.close();
  }
}

/** Prepares each photo with the same code the phone runs, in Chrome, and keeps the JPEG. */
async function preparePhotos(plans) {
  const needed = plans.filter((p) => p.source && !existsSync(join(p.at, "prepared.jpg")));
  if (!needed.length) return;
  const { chromium } = await import("@playwright/test");
  const { createServer } = await import("vite");
  const server = await createServer({ root: ROOT, logLevel: "error", server: { port: 5198, strictPort: false, host: "127.0.0.1" } });
  await server.listen();
  const base = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:5198/";
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage();
    await page.route(`${base}__blank`, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>prep</title>" }));
    await page.goto(`${base}__blank`);
    for (const plan of needed) {
      const type = /\.png$/i.test(plan.source) ? "image/png" : /\.webp$/i.test(plan.source) ? "image/webp" : "image/jpeg";
      const b64 = readFileSync(plan.source).toString("base64");
      const out = await page.evaluate(
        async ({ b64, type }) => {
          const { preparePhoto } = await import("/src/planread/image.ts");
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const photo = await preparePhoto(new Blob([bytes], { type }));
          const buffer = new Uint8Array(await photo.blob.arrayBuffer());
          let text = "";
          for (let i = 0; i < buffer.length; i += 0x8000) text += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
          return btoa(text);
        },
        { b64, type },
      );
      writeFileSync(join(plan.at, "prepared.jpg"), Buffer.from(out, "base64"));
      console.log(`[planeval] prepared ${plan.id}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

/** Reads every plan that has no cached reading for this model. Paid unless --fake. */
async function readPlans(plans, model) {
  const fake = flag("fake");
  const fileFor = (plan) => readingFile(plan, model);
  const todo = plans.filter((p) => p.truth && p.source && !existsSync(fileFor(p)));
  if (!todo.length) return console.log("[planeval] nothing to read: every plan has a cached reading for this model.");
  const worst = todo.length * lib.planReadWorstCase(model);
  console.log(`[planeval] ${todo.length} plan(s) to read with ${model}. Worst case $${worst.toFixed(2)}${fake ? " (fake reader: nothing is spent)" : ""}.`);
  if (!fake) {
    const cap = Number(option("max-usd"));
    if (!Number.isFinite(cap) || cap <= 0) throw new Error("A paid run needs --max-usd. No call was made.");
    if (worst > cap) throw new Error(`The worst case ($${worst.toFixed(2)}) is over --max-usd ${cap}. No call was made.`);
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY isn't set. No call was made.");
  }
  await preparePhotos(todo);
  let spent = 0;
  for (const plan of todo) {
    const bytes = new Uint8Array(readFileSync(join(plan.at, "prepared.jpg")));
    let raw, costUsd;
    if (fake) {
      raw = lib.perfectReading(plan.truth);
      costUsd = 0;
    } else {
      const hint = { plot: `${Math.round(plan.truth.plot.width / 30.48)} × ${Math.round(plan.truth.plot.depth / 30.48)} ft`, road: ROAD_SIDE[plan.truth.plot.road] };
      const answer = await lib.callClaude(lib.planReadCall(process.env.ANTHROPIC_API_KEY, model, bytes, hint));
      raw = answer.json;
      costUsd = answer.costUsd;
    }
    spent += costUsd;
    mkdirSync(dirname(fileFor(plan)), { recursive: true });
    writeFileSync(fileFor(plan), JSON.stringify({ model, fake, at: new Date().toISOString(), costUsd, reading: raw }, null, 2));
    console.log(`[planeval] read ${plan.id} ($${costUsd.toFixed(3)})`);
  }
  console.log(`[planeval] spent $${spent.toFixed(2)}.`);
}

const row = (name, s) =>
  `| ${name} | ${percent(s.roomRecall)} | ${percent(s.roomPrecision)} | ${percent(s.typeAccuracy)} | ${cm(s.medianEdgeCm)} | ${percent(s.doorRecall)} | ${percent(s.windowRecall)} | ${percent(s.openRecall)} | ${s.floorsMissing} | ${s.fixes} |`;
const HEADER = "| Plan | Rooms found | Rooms real | Right use | Edge error (median) | Doors | Windows | Open areas kept | Floors missing | Fixes |\n|---|---|---|---|---|---|---|---|---|---|";

function section(title, note, scored) {
  const summary = lib.summarize(scored.map((s) => s.score));
  const yes = (ok) => (ok ? "yes" : "**no**");
  return [
    `## ${title}`,
    note,
    "",
    HEADER,
    ...scored.map((s) => row(s.id, s.score)),
    "",
    `**${summary.plans} plans:** rooms found ${percent(summary.roomRecall)} (target ${percent(lib.TARGETS.roomRecall)}: ${yes(summary.meetsTargets.roomRecall)}) · edge error ${cm(summary.medianEdgeCm)} (target ≤ ${lib.TARGETS.medianEdgeCm} cm: ${yes(summary.meetsTargets.medianEdgeCm)}) · doors ${percent(summary.doorRecall)} (target ${percent(lib.TARGETS.doorRecall)}: ${yes(summary.meetsTargets.doorRecall)}) · done in ≤ 3 fixes ${percent(summary.within3Fixes)} (target ${percent(lib.TARGETS.within3Fixes)}: ${yes(summary.meetsTargets.within3Fixes)}) · windows ${percent(summary.windowRecall)} · open areas ${percent(summary.openRecall)} · floors missing ${summary.floorsMissing}.`,
    "",
  ].join("\n");
}

function scoreReading(raw, truth, aspect = 1) {
  const built = lib.planFromReading(raw, plotOf(truth), aspect);
  if (!built) return null;
  return lib.scoreHome(built.project, truth);
}

async function main() {
  if (flag("sheets")) await drawSheets();
  const model = option("model") ?? lib.PLAN_MODEL;
  const only = option("only")?.split(",");
  const sets = option("set") ? [option("set")] : ["plans", "synthetic"];
  const all = sets.flatMap(plansIn).filter((p) => !only || only.includes(p.id));
  if (flag("read")) await readPlans(all, model);

  const parts = [`# Plan reading report`, "", `Made ${new Date().toISOString().slice(0, 10)} by \`npm run planeval\`. Rooms, edges, doors and windows are compared per floor; "floors missing" are upper floors the reading doesn't cover.`, ""];
  // The ceiling: free, and no real reader can beat it.
  const homes = ownHomes();
  const perfect = homes.map(({ id, home }) => ({ id, score: scoreReading(lib.perfectReading(home), home) })).filter((s) => s.score);
  parts.push(
    section(
      "The ceiling: a flawless reader",
      "Our own homes, read perfectly, through today's `planFromReading`. No AI, no cost. **These are not real plans.** It shows only what the pipeline itself throws away: no real reading can score better than this. Doors and windows flatter it: the truth's are automatic too, so the same engine often puts them in the same place. A real plan's doors are wherever its architect drew them.",
      perfect,
    ),
  );
  const sloppy = homes
    .flatMap(({ id, home }) => [1, 2, 3].map((seed) => ({ id: `${id} #${seed}`, score: scoreReading(lib.sloppyReading(lib.perfectReading(home), 0.03, seed), home) })))
    .filter((s) => s.score);
  parts.push(
    section(
      "A slightly sloppy reader",
      "The same homes with every room edge off by up to 3% of the house (about 30 cm on a 10 m house), to show how a reader's error carries through. The 3% is an assumption, not a measurement of any model.",
      sloppy,
    ),
  );

  for (const set of sets) {
    const plans = plansIn(set).filter((p) => !only || only.includes(p.id));
    const read = plans.flatMap((plan) => {
      const file = readingFile(plan, model);
      if (!plan.truth || !existsSync(file)) return [];
      const cached = JSON.parse(readFileSync(file, "utf8"));
      const jpeg = existsSync(join(plan.at, "prepared.jpg")) ? lib.jpegSize(new Uint8Array(readFileSync(join(plan.at, "prepared.jpg")))) : null;
      const score = scoreReading(cached.reading, plan.truth, jpeg ? jpeg.width / jpeg.height : 1);
      return score ? [{ id: `${plan.id}${cached.fake ? " (fake reader)" : ""}`, score }] : [];
    });
    const unread = plans.filter((p) => p.truth && !existsSync(readingFile(p, model))).length;
    parts.push(
      read.length
        ? section(
            set === "plans" ? `Real plans, read by ${model}` : `Synthetic sheets, read by ${model}`,
            set === "plans" ? "The baseline the plan asks for." : "Drawn by our own code: clean inputs flatter any reader. A smoke test, not the baseline.",
            read,
          )
        : `## ${set === "plans" ? "Real plans" : "Synthetic sheets"}\nNo readings cached for ${model}${unread ? ` (${unread} plan(s) waiting)` : ""}. ${set === "plans" ? "The real baseline needs the owner's plans and approval to spend: see eval/README.md." : "Run `--sheets`, then a paid `--read` if approved."}\n`,
    );
  }
  const report = parts.join("\n");
  mkdirSync(join(EVAL, "reports"), { recursive: true });
  writeFileSync(join(EVAL, "reports", "latest.md"), report);
  if (option("label")) writeFileSync(join(EVAL, "reports", `${option("label")}.md`), report);
  console.log(report);
}

await main();
