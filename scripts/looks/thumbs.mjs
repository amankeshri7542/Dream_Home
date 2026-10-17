#!/usr/bin/env node
// Look card pictures: renders the sample home in every look with the scene
// lab's render-quality photo hook and writes public/looks/<id>.webp (480 px).
//
//   npm run looks:thumbs              # every look
//   npm run looks:thumbs -- kerala    # just these looks
//
// Starts its own Vite dev server and drives the installed Chrome headless.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "public", "looks");
const only = process.argv.slice(2);

const server = await createServer({ root: ROOT, logLevel: "error", server: { port: 5199, strictPort: false, host: "127.0.0.1" } });
await server.listen();
const base = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:5199/";
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("[looks] page error:", e.message));
  await page.goto(`${base}scene-lab.html?panel=0&quality=beautiful&mode=explore`);
  await page.waitForFunction(() => window.__lab && window.__dreamHome?.ready, null, { timeout: 60000 });
  const looks = only.length ? only : await page.evaluate(() => window.__lab.looks());
  mkdirSync(OUT, { recursive: true });
  for (const look of looks) {
    const t0 = Date.now();
    const url = await page.evaluate((l) => window.__lab.lookThumb(l), look);
    const data = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    if (data.toString("ascii", 8, 12) !== "WEBP") throw new Error(`${look}: not a WebP`);
    writeFileSync(join(OUT, `${look}.webp`), data);
    console.log(`[looks] ${look}.webp ${(data.length / 1024).toFixed(1)} KB (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
} finally {
  await browser.close();
  await server.close();
}
