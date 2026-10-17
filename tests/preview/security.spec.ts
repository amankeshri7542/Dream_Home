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
  await reel.getByRole("button", { name: "Make my video" }).click();
  await expect(reel.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 60000 });
  await expect.poll(() => reel.locator("video").evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  await reel.getByRole("button", { name: "Close video studio" }).click();
  // The Sunlight sheet loads lazily, with the city picker and the city list.
  await page.getByRole("button", { name: "Back to building" }).click();
  await page.getByRole("button", { name: "View options" }).first().click();
  await page.getByRole("button", { name: "Sunlight", exact: true }).click();
  const sun = page.getByRole("dialog", { name: "Sunlight" });
  await sun.getByRole("searchbox", { name: "Find your city" }).fill("Madras");
  await sun.getByRole("button", { name: /^Chennai/ }).click();
  await expect(sun).toContainText("The real sun in Chennai");
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

test("starting from a builder's plan works under the policy, and its API holds its line", async ({ page, request }) => {
  // Without an AI key the reading is off, so this never calls Claude.
  const device = { "x-dream-device": "device-0123456789abcdef" };
  expect(await (await request.get("/api/plan-read", { headers: device })).json()).toMatchObject({ ok: true, live: false });
  const notJpeg = await request.post("/api/plan-read", { headers: { ...device, "content-type": "text/plain" }, data: "hello" });
  expect(notJpeg.status()).toBe(415);

  const violations = await watchCsp(page);
  await page.addInitScript(() => localStorage.setItem("dream-home.preferences.v1", JSON.stringify({ language: "en", unit: "ft", tourSeen: true })));
  await page.goto("/");
  await page.getByRole("button", { name: "Upload my builder’s plan" }).click();
  const photo = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(800, 600);
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#fbfaf4";
    g.fillRect(0, 0, 800, 600);
    g.lineWidth = 6;
    g.strokeRect(100, 60, 600, 480);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.getByLabel("Choose a picture of your plan").setInputFiles({ name: "plan.jpg", mimeType: "image/jpeg", buffer: Buffer.from(photo) });
  await expect(page.getByRole("img", { name: "Your plan photo" })).toBeVisible();
  await page.getByRole("button", { name: "Next: my plot" }).click();
  await expect(page.getByText("Plan reading isn’t available right now.")).toBeVisible();
  await page.getByRole("button", { name: "Draw it yourself" }).click();
  // The photo lies under the plan as a blob: image.
  await expect(page.getByRole("region", { name: "Check your plan" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Floor plan" }).locator("image.plan-underlay")).toHaveAttribute("href", /^blob:/);
  await page.waitForTimeout(500);
  expect(violations).toEqual([]);
});

test("talking to your home works under the policy, and its API holds its line", async ({ page, request }) => {
  // Without an AI key the helper is off, so this never calls Claude.
  const device = { "x-dream-device": "device-0123456789abcdef" };
  expect(await (await request.get("/api/command", { headers: device })).json()).toMatchObject({ ok: true, live: false });
  const junk = await request.post("/api/command", { headers: { ...device, "content-type": "application/json" }, data: { text: "hi" } });
  expect(junk.status()).toBe(400);

  const violations = await watchCsp(page);
  await freshVisit(page);
  await renderedModel(page);
  await page.getByRole("button", { name: "Talk to your home" }).first().click();
  const talk = page.getByRole("dialog", { name: "Talk to your home" });
  await talk.getByRole("textbox", { name: "What would you like to change?" }).fill("Make the kitchen bigger");
  await talk.getByRole("button", { name: "Send" }).click();
  await expect(talk).toContainText("Talking to your home isn’t switched on yet.");
  // Answered on the phone: no AI needed.
  await talk.getByRole("textbox", { name: "What would you like to change?" }).fill("night");
  await talk.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status", { name: "Notifications" })).toContainText("Here's your home at night.");
  expect(violations).toEqual([]);
});

test("installable, and it opens offline after one visit (the API is never cached)", async ({ page, context, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Dream Home", short_name: "Dream Home", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).headers()["content-type"]).toBe("image/png");
  const sw = await request.get("/sw.js");
  expect(await sw.text()).toContain('const SHELL = `dh-shell-${VERSION}`');

  const violations = await watchCsp(page);
  await freshVisit(page);
  await renderedModel(page);
  // The worker installs and takes over; the app shell and the models it used are kept.
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.ready).active && !!navigator.serviceWorker.controller), { timeout: 15000 }).toBe(true);
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith("dh-shell-")) && (await (await caches.open("dh-kept-v1")).keys()).some((r) => r.url.includes("/models/"))))
    .toBe(true);
  // What loaded before the worker took over is kept too (the 3D code among it).
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open("dh-kept-v1")).keys()).some((r) => /\/assets\/Scene-[^/]+\.js$/.test(r.url))), { timeout: 30000 })
    .toBe(true);
  await page.waitForTimeout(21_000); // the last list the page sends
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Talk to your home" }).first()).toBeVisible({ timeout: 15000 });
  await renderedModel(page);
  // Never from the cache: the API fails offline.
  expect(await page.evaluate(() => fetch("/api/design", { headers: { "x-dream-device": "device-0123456789abcdef" } }).then(() => "answered", () => "failed"))).toBe("failed");
  await context.setOffline(false);
  expect(violations).toEqual([]);
});
