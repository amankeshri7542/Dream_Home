// Runs against the production build with the production headers
// (playwright.preview.config.ts): the app must work under its own
// Content-Security-Policy, and the bundled API must hold its line.
import { expect, test, type Page } from "@playwright/test";
import { SECURITY_HEADERS } from "../../server/headers";
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
