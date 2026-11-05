#!/usr/bin/env node
// The real-look bench: renders one fixed home through ten fixed shots at phone
// settings, with the real photo pipeline, into docs/screenshots/bench/<label>/.
// Eye-level shots also get the live view a walker sees. See eval/look/README.md.
//
//   npm run bench:look                     writes to .../bench/latest (not committed)
//   npm run bench:look -- --label baseline
//   npm run bench:look -- --only 01-eye-living,08-aerial
//
// Starts its own Vite dev server and drives the installed Chrome headless.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const label = option("label") ?? "latest";
const only = option("only")?.split(",");
const OUT = join(ROOT, "docs", "screenshots", "bench", label);
// A phone in portrait, as most people will see it.
const PHONE = { width: 390, height: 844 };

const server = await createServer({ root: ROOT, logLevel: "error", server: { port: 5197, strictPort: false, host: "127.0.0.1" } });
await server.listen();
const base = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:5197/";
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: PHONE, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.error("[bench] page error:", e.stack ?? e.message));
  await page.goto(`${base}scene-lab.html?panel=0&quality=balanced&mode=explore`);
  await page.waitForFunction(() => window.__lab && window.__dreamHome?.ready, null, { timeout: 60000 });
  const shots = (await page.evaluate(() => window.__lab.benchList())).filter((s) => !only || only.includes(s.id));
  mkdirSync(OUT, { recursive: true });
  const done = [];
  for (const shot of shots) {
    const t0 = Date.now();
    await page.evaluate((id) => window.__lab.benchPrepare(id), shot.id);
    if (shot.group === "eye" || shot.group === "night") {
      // What a walker's screen shows, before any careful rendering.
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(OUT, `${shot.id}-live.jpg`), type: "jpeg", quality: 85 });
    }
    const url = await page.evaluate((id) => window.__lab.benchPhoto(id), shot.id);
    writeFileSync(join(OUT, `${shot.id}.jpg`), Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
    const seconds = (Date.now() - t0) / 1000;
    done.push({ ...shot, seconds });
    console.log(`[bench] ${shot.id} (${seconds.toFixed(1)} s)`);
  }
  const commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ label, date: new Date().toISOString().slice(0, 10), commit, home: "lookSample(indian-modern)", shots: done }, null, 2) + "\n");
  console.log(`[bench] ${done.length} shots in docs/screenshots/bench/${label}/. Next: the critic, in eval/look/README.md.`);
} finally {
  await browser.close();
  await server.close();
}
