// M0b: My homes, the one-question first screen, text size, sounds, and moving
// homes to a new address by link.
import { expect, test, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import { moveLink, packHome } from "../src/homes/handoff";
import { enterRoom, freshVisit, goHome, mobile, noOverflow, renderedModel, seed, stored } from "./support/dreamHome";

const shelf = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("dream-home.homes.v1") ?? "null") as { activeId: string; homes: { id: string; name: string }[] },
  );
const more = (page: Page) => page.getByRole("button", { name: "More options", exact: true }).click();

async function buildFromGallery(page: Page, template: RegExp) {
  const gallery = page.getByRole("dialog", { name: "Choose a starting home" });
  await expect(gallery).toBeVisible();
  await gallery.getByRole("radio", { name: template }).click();
  await gallery.getByRole("button", { name: /Build this home/ }).click();
  await expect(gallery).toHaveCount(0);
}

test("the first screen asks one question with two big choices", async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.goto("/");
  const title = page.getByRole("dialog", { name: /Build the home you keep imagining/ });
  await expect(title.getByText("How would you like to start?")).toBeVisible();
  await expect(title.getByRole("button", { name: /^Design it for me/ })).toBeFocused();
  await expect(title.getByRole("button", { name: /^Pick a ready home/ })).toBeVisible();
  await expect(title.getByRole("button", { name: "Just show me a sample home" })).toBeVisible();
  await expect(title.getByRole("button", { name: "Open a saved file" })).toBeVisible();
  // Picking a ready home on a first visit replaces the untouched starter.
  await title.getByRole("button", { name: /^Pick a ready home/ }).click();
  await buildFromGallery(page, /Courtyard home/);
  expect((await shelf(page)).homes).toHaveLength(1);
});

test("new homes join My homes; the old one stays safe and opens again", async ({ page }) => {
  await page.setViewportSize(mobile);
  const first = createPreset("compact");
  await seed(page, first);
  const firstId = (await shelf(page)).activeId;

  // Start another home from More: the first is kept, the new one opens.
  await more(page);
  await page.getByRole("button", { name: "Start a new home", exact: true }).click();
  await buildFromGallery(page, /Courtyard home/);
  const second = await stored(page);
  expect(second.name).not.toBe(first.name);
  const homes = await shelf(page);
  expect(homes.homes.map((h) => h.name)).toEqual([second.name, first.name]);
  // A fresh home starts with its own history: nothing to undo into the old one.
  await expect(page.getByRole("button", { name: "Undo last change", exact: true })).toBeDisabled();

  // My homes lists both, newest first, and opens the first again.
  await more(page);
  await page.getByRole("button", { name: /^My homes \(2\)/ }).click();
  const dialog = page.getByRole("dialog", { name: "My homes" });
  await expect(dialog.getByText("2 of 12 homes kept on this device.", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: `Open ${first.name}` }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: first.name, exact: true })).toBeVisible();
  expect(await stored(page)).toEqual(first);
  expect((await shelf(page)).activeId).toBe(firstId);

  // Everything survives a reload, including the home that isn't open.
  await page.reload();
  await more(page);
  await page.getByRole("button", { name: /^My homes \(2\)/ }).click();
  await dialog.getByRole("button", { name: `Open ${second.name}` }).click();
  await expect(page.getByRole("heading", { name: second.name, exact: true })).toBeVisible();
  expect((await stored(page)).floors).toEqual(second.floors);

  // Deleting asks first, and never touches the open home.
  await more(page);
  await page.getByRole("button", { name: /^My homes/ }).click();
  await dialog.getByRole("button", { name: `Delete ${first.name}` }).click();
  await dialog.getByRole("button", { name: "Keep it" }).click();
  expect((await shelf(page)).homes).toHaveLength(2);
  await dialog.getByRole("button", { name: `Delete ${first.name}` }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(async () => (await shelf(page)).homes.map((h) => h.name)).toEqual([second.name]);
  await expect(dialog.getByRole("button", { name: /^Delete / })).toHaveCount(0);
});

test("returning visitors with several homes see My homes on the first screen", async ({ page }) => {
  await page.setViewportSize(mobile);
  // A real first visit (no test seeding, which would skip the title screen on every load).
  await page.goto("/");
  await page.getByRole("button", { name: "Just show me a sample home" }).click();
  await page.getByRole("dialog", { name: "Quick tour" }).getByRole("button", { name: "Skip tour" }).click();
  await more(page);
  await page.getByRole("button", { name: "Start a new home", exact: true }).click();
  await buildFromGallery(page, /Courtyard home/);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByRole("button", { name: "My homes (2)" }).click();
  await expect(page.getByRole("dialog", { name: "My homes" })).toBeVisible();
});

test("text size makes everything bigger and still fits a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await seed(page);
  const label = page.locator(".dh-homebar .dh-tool-label").first();
  const base = await label.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await more(page);
  await page.getByRole("radiogroup", { name: "Text size" }).getByRole("radio", { name: "Extra large" }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-text", "extra");
  const bigger = await label.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(bigger).toBeGreaterThan(base * 1.3);
  // Bigger targets too.
  const box = (await page.getByRole("button", { name: "More options", exact: true }).boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(55);
  await noOverflow(page);
  await renderedModel(page);
  await enterRoom(page, "Bedroom 1");
  await noOverflow(page);
  await goHome(page);
  // Remembered on this device.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("dream-home.preferences.v1") ?? "{}").textSize)).toBe("extra");
});

test("sounds can be switched off and stay off", async ({ page }) => {
  await seed(page);
  await more(page);
  const sounds = page.getByRole("switch", { name: /Sounds & vibration/ });
  await expect(sounds).toHaveAttribute("aria-checked", "true");
  await sounds.click();
  await expect(sounds).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("dream-home.preferences.v1") ?? "{}").sounds)).toBe(false);
});

test("a home sent from the old address by link joins My homes", async ({ page }) => {
  await page.setViewportSize(mobile);
  const moved = { ...createPreset("courtyard"), name: "Nani’s House" };
  const link = moveLink(await packHome(moved), "");
  await freshVisit(page);
  await renderedModel(page);
  // A real arrival from another site: a full page load with the link.
  await page.goto("about:blank");
  await page.goto(link);
  const ask = page.getByRole("dialog", { name: "Bring this home here" });
  await expect(ask.getByRole("heading", { name: "Bring Nani’s House here?" })).toBeVisible();
  // The home never stays in the address bar.
  expect(new URL(page.url()).hash).toBe("");
  await ask.getByRole("button", { name: "Add to My homes" }).click();
  await expect(page.getByRole("heading", { name: "Nani’s House", exact: true })).toBeVisible();
  expect((await stored(page)).floors).toEqual(moved.floors);
  // The move banner only appears on the old vercel.app address.
  await expect(page.getByRole("region", { name: "Dream Home has a new address" })).toHaveCount(0);
});

test("a broken move link is explained, not opened", async ({ page }) => {
  await freshVisit(page);
  await page.goto("about:blank");
  await page.goto("/#import=g.not-a-real-home");
  await expect(page.getByRole("status", { name: "Notifications" })).toContainText("couldn’t be opened");
  await expect(page.getByRole("dialog", { name: "Bring this home here" })).toHaveCount(0);
});
