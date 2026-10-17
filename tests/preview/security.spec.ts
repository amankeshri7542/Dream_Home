// Runs against the production build with the production headers
// (playwright.preview.config.ts): the app must work under its own
// Content-Security-Policy, and the bundled API must hold its line.
import { expect, test, type Page } from "@playwright/test";
import { SECURITY_HEADERS } from "../../server/headers";
import { createPreset } from "../../src/domain/model";
import { freshVisit, homeAction, renderedModel } from "../support/dreamHome";

/** Collects CSP violations reported by the page and by the console. */
async function watchCsp(page: Page) {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`Refused to load: ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return violations;
}

test("the built app runs cleanly under its Content-Security-Policy", async ({ page }) => {
  const violations = await watchCsp(page);
  const response = await page.goto("/");
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) expect(response?.headers()[key.toLowerCase()]).toBe(value);
  // A first visit opens a furnished home: models (WebAssembly decoder), textures, fonts.
  await freshVisit(page);
  await renderedModel(page);
  // Explore brings in the post-processing effects and street life.
  await homeAction(page, "Explore").click();
  await page.waitForTimeout(2500);
  await renderedModel(page);
  // A photo loads the renderer chunk lazily and shows the result as a blob: image.
  await page.evaluate(() => ((window as unknown as { __dreamHomePhotoTest: unknown }).__dreamHomePhotoTest = { longEdge: 320, samples: 2 }));
  await page.getByRole("button", { name: "Take a photo" }).click();
  const studio = page.getByRole("dialog", { name: "Photo studio" });
  await studio.getByRole("button", { name: "Take photo" }).click();
  await expect(studio.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 30000 });
  await expect(studio.getByText("quick photo instead")).toHaveCount(0);
  await studio.getByRole("button", { name: "Close photo studio" }).click();
  // A reel loads its studio, the filming code and the encoder lazily, and plays back as a blob: video.
  await page.evaluate(() => ((window as unknown as { __dreamHomeReelTest: unknown }).__dreamHomeReelTest = { width: 180, height: 320, seconds: 1, samples: 1 }));
  await page.getByRole("button", { name: "Make a video" }).click();
  const reel = page.getByRole("dialog", { name: "Video studio" });
  await reel.getByRole("switch", { name: "Show link at the end" }).click();
  await reel.getByRole("button", { name: "Make my video" }).click();
  await expect(reel.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 60000 });
  await expect.poll(() => reel.locator("video").evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

test("the bundled API answers with its own guards", async ({ request }) => {
  const missing = await request.get("/api/design");
  expect(missing.status()).toBe(400);
  expect(missing.headers()["cache-control"]).toBe("no-store");
  expect(await missing.json()).toMatchObject({ ok: false, reason: "invalid" });

  const device = { "x-dream-device": "device-0123456789abcdef" };
  const credits = await request.get("/api/design", { headers: device });
  expect(await credits.json()).toMatchObject({ ok: true });

  const forged = await request.post("/api/design", {
    headers: { ...device, origin: "https://evil.example", "content-type": "application/json" },
    data: { kind: "home", brief: {} },
  });
  expect(forged.status()).toBe(403);

  const unknown = await request.get("/api/nothing-here", { headers: device });
  expect(unknown.status()).toBe(404);
});

test("the policy really blocks outside hosts (and the watcher sees it)", async ({ page }) => {
  const violations = await watchCsp(page);
  await freshVisit(page);
  // Blocked by the browser before any request leaves the page.
  await page.evaluate(() => fetch("https://example.com/").catch(() => undefined));
  await expect.poll(() => violations.length).toBeGreaterThan(0);
  expect(violations.join("\n")).toMatch(/connect-src/);
});

test("a share link opens the viewer cleanly under the policy", async ({ page, request }) => {
  const created = await request.post("/api/share", {
    headers: { "x-dream-device": "device-0123456789abcdef", "content-type": "application/json" },
    data: { project: createPreset("compact") },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const violations = await watchCsp(page);
  const response = await page.goto(`/h/${id}`);
  expect(response?.headers()["content-security-policy"]).toBe(SECURITY_HEADERS["Content-Security-Policy"]);
  await expect(page.getByRole("button", { name: "Remix this home" })).toBeVisible();
  await renderedModel(page);
  await page.getByRole("button", { name: "Walk inside" }).click();
  await page.waitForTimeout(1500);
  expect(violations).toEqual([]);
  // Link-preview robots get their own little page from the bundled API.
  const og = await request.get(`/api/og?id=${id}`);
  expect(await og.text()).toContain('property="og:url"');
});
