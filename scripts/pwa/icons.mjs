// The app icons (manifest and iPhone home screen), drawn from the house mark
// in Chrome: `npm run icons`. The PNGs are committed under public/icons.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const TERRACOTTA = "#b5562f",
  PAPER = "#fbf5ec",
  SUN = "#f4bc55";
const house = `<path d="M9 21.5 20 11.5l11 10V32H9Z" fill="${PAPER}"/><path d="M17 32v-7a3 3 0 0 1 6 0v7" fill="${TERRACOTTA}"/><circle cx="29" cy="11" r="3.2" fill="${SUN}"/>`;
/** `rounded`: the tile as in the app; otherwise a full square with the house scaled into the middle. */
const svg = (rounded, scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="100%" height="100%">${
    rounded ? `<rect width="40" height="40" rx="9" fill="${TERRACOTTA}"/>` : `<rect width="40" height="40" fill="${TERRACOTTA}"/>`
  }<g transform="translate(${20 - 20 * scale} ${21 - 21 * scale}) scale(${scale})">${house}</g></svg>`;

const ICONS = [
  // Any: the rounded tile, transparent corners.
  { file: "icon-192.png", size: 192, markup: svg(true, 1) },
  { file: "icon-512.png", size: 512, markup: svg(true, 1) },
  // Maskable: launchers crop to a circle or squircle, so the house sits in the middle 70%.
  { file: "icon-maskable-512.png", size: 512, markup: svg(false, 0.72) },
  // iPhone home screen: a full square (iOS rounds the corners itself).
  { file: "apple-touch-icon.png", size: 180, markup: svg(false, 0.86) },
];

mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${icon.markup}</body></html>`);
  await page.screenshot({ path: `public/icons/${icon.file}`, omitBackground: true, clip: { x: 0, y: 0, width: icon.size, height: icon.size } });
  console.log("wrote", icon.file);
}
await browser.close();
