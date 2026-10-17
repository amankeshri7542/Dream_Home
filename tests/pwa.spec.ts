// M8: installing Dream Home. The nudge waits for the second visit (or a first
// share), uses the browser's own prompt where there is one and shows the
// iPhone steps where there isn't, and "Not now" keeps it away. The service
// worker itself only runs in the production build (tests/preview).
import { test, expect, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import { mkdirSync } from "node:fs";
import { mobile, noOverflow, seed } from "./support/dreamHome";

const shots = !!process.env.DH_SHOTS;
if (shots) mkdirSync("docs/screenshots/pwa", { recursive: true });

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const nudge = (page: Page) => page.getByRole("region", { name: "Install Dream Home" });

/** This device has been here before (once). */
const visitedBefore = (page: Page) =>
  page.addInitScript(() => {
    if (!localStorage.getItem("dream-home.visits.v1")) localStorage.setItem("dream-home.visits.v1", JSON.stringify({ visits: 1 }));
  });
/** The browser offers its install prompt, as Chrome on Android does. */
const offerInstall = (page: Page) =>
  page.evaluate(() => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => void ((window as unknown as { __prompted: boolean }).__prompted = true),
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });

test("on the second visit, Chrome's install prompt is one tap away", async ({ page }) => {
  await page.setViewportSize(mobile);
  await visitedBefore(page);
  await seed(page, createPreset("compact"));
  await expect(nudge(page)).toHaveCount(0); // nothing to install with yet
  await offerInstall(page);
  await expect(nudge(page)).toContainText("It opens from your home screen like an app, even offline.");
  await nudge(page).getByRole("button", { name: "Install" }).click();
  expect(await page.evaluate(() => (window as unknown as { __prompted: boolean }).__prompted)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(nudge(page)).toHaveCount(0);
});

test.describe("on an iPhone", () => {
  test.use({ userAgent: IPHONE });

  test("the nudge shows the Add to Home Screen steps, and Not now keeps it away", async ({ page }) => {
    await page.setViewportSize(mobile);
    await visitedBefore(page);
    await seed(page, createPreset("compact"));
    await nudge(page).getByRole("button", { name: "How?" }).click();
    await expect(nudge(page)).toContainText("In Safari, tap Share (the square with an arrow), then “Add to Home Screen”.");
    await noOverflow(page);
    if (shots) await page.screenshot({ path: "docs/screenshots/pwa/nudge-iphone-390.png" });
    await nudge(page).getByRole("button", { name: "Not now" }).click();
    await expect(nudge(page)).toHaveCount(0);
    // Still away on the next visit.
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByRole("heading", { name: createPreset("compact").name })).toBeVisible();
    await expect(nudge(page)).toHaveCount(0);
    // More always has the steps.
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByText("Install Dream Home", { exact: true }).click();
    await expect(page.getByText("In Safari, tap Share")).toBeVisible();
  });

  test("a first share is a good moment to suggest it", async ({ page }) => {
    await seed(page, createPreset("compact"));
    await expect(nudge(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Share your home", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Share your home" });
    await sheet.getByRole("button", { name: "Make my link" }).click();
    await expect(sheet.getByRole("textbox", { name: "Your home’s link" })).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("Escape");
    await expect(nudge(page)).toBeVisible();
  });
});
