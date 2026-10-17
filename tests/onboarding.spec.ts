import { test, expect } from "@playwright/test";
import { KEY, mobile, stored } from "./support/dreamHome";

test("a first visit offers a title screen, a template gallery and a skippable tour", async ({
  page,
}) => {
  await page.setViewportSize(mobile);
  await page.goto("/");
  const title = page.getByRole("dialog", { name: /Build the home you keep imagining/ });
  await expect(title).toBeVisible();
  // The 3D hero is already mounted behind the title card.
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: /^Pick a ready home/ }).click();
  const gallery = page.getByRole("dialog", { name: "Choose a starting home" });
  await expect(gallery).toBeVisible();
  await gallery.getByRole("radio", { name: /Courtyard home/ }).click();
  await gallery.getByRole("button", { name: "More bedrooms" }).click();
  await gallery.getByRole("button", { name: /Build this home/ }).click();
  await expect(gallery).toHaveCount(0);
  const project = await stored(page);
  expect(project.verticalSpaces.some((v) => v.kind === "courtyard")).toBe(true);
  expect(
    project.floors.flatMap((f) => f.rooms).filter((r) => r.kind === "bedroom"),
  ).toHaveLength(4);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  const tour = page.getByRole("dialog", { name: "Quick tour" });
  await expect(tour).toBeVisible();
  await tour.getByRole("button", { name: "Next" }).click();
  await tour.getByRole("button", { name: "Skip tour" }).click();
  await expect(tour).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("dream-home.preferences.v1") ?? "{}"),
    ),
  ).toMatchObject({ tourSeen: true });
  // Reloading in the same session goes straight back to building.
  await page.reload();
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await expect(title).toHaveCount(0);
  await expect(tour).toHaveCount(0);
});

test("returning visitors can continue, and the sample home is one tap away", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Just show me a sample home" }).click();
  const sample = await stored(page);
  expect(sample.floors[0].rooms.length).toBeGreaterThan(2);
  await page.getByRole("dialog", { name: "Quick tour" }).getByRole("button", { name: "Skip tour" }).click();
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByRole("button", { name: "Continue my home" }).click();
  await expect(page.getByRole("heading", { name: sample.name })).toBeVisible();
  expect(await stored(page)).toEqual(sample);
  // The brand button returns to the home screen.
  await page.getByRole("button", { name: "Dream Home — home screen" }).click();
  await expect(page.getByRole("button", { name: "Continue my home" })).toBeVisible();
});

test("a damaged save is explained on the title screen and can be recovered", async ({
  page,
}) => {
  await page.addInitScript((key) => localStorage.setItem(key, "{oops"), KEY);
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("could not be opened");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Recover saved file" }).click();
  expect((await downloading).suggestedFilename()).toBe("dream-home-recovery.json");
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe("{oops");
});
