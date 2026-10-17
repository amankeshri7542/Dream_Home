import { test, expect, type Page } from "@playwright/test";
import { floorForGeometry } from "../src/domain/core";
import { resolveFurniture } from "../src/domain/furniture";
import { createPreset, deriveWalls } from "../src/domain/model";
import type { Project } from "../src/domain/types";
import { mobile, seed, stored, undo } from "./support/dreamHome";

type Point = { x: number; y: number };
const toScreen = async (page: Page, at: { x: number; z: number; y: number }) => {
  await page.waitForFunction(() => (window as unknown as { __dreamHome?: { ready?: boolean } }).__dreamHome?.ready === true);
  await page.evaluate(() => (window as unknown as { __dreamHome: { waitForIdle: () => Promise<void> } }).__dreamHome.waitForIdle());
  return page.evaluate(
    (a) => (window as unknown as { __dreamHome: { projectToScreen: (p: unknown) => Point } }).__dreamHome.projectToScreen(a),
    at,
  );
};
async function drag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
  await page.waitForTimeout(120);
}
function bedOf(project: Project) {
  const floor = project.floors[0];
  const room = floor.rooms.find((r) => r.kind === "bedroom")!;
  const items = resolveFurniture(room, deriveWalls(floorForGeometry(project, floor.id), project.plot.road));
  return { room, bed: items.find((i) => i.catalogId.startsWith("bed"))! };
}
// Bed tops are about 45 cm above the floor surface (floor base 15 cm).
const TOP = 60;

for (const [name, size] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["phone", mobile],
] as const)
  test(`decorate: tap a bed and drag it across the room (${name})`, async ({ page }) => {
    await page.setViewportSize(size);
    const project = createPreset("compact");
    await seed(page, project);
    const { room, bed } = bedOf(project);
    const centre = { x: room.bounds.x + bed.x, z: room.bounds.z + bed.z, y: TOP };
    // Tap the room to step inside: the camera glides in and its label steps aside.
    await page.locator(".scene-room-label").filter({ hasText: room.name }).click();
    await expect(page.locator(".scene-room-label").filter({ hasText: room.name })).toHaveCount(0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/decorate-room-${name}.png` });
    await page.mouse.click(...(Object.values(await toScreen(page, centre)) as [number, number]));
    await expect(page.locator(".dh-inspector-title").first()).toContainText("bed");
    await expect(page.getByText("Drag it in the picture")).toBeVisible();
    await page.waitForTimeout(300);
    const from = await toScreen(page, centre);
    const to = await toScreen(page, { ...centre, x: centre.x - 80 });
    await drag(page, from, to);
    await expect(page.locator(".scene-ghost-badge")).toHaveText("Drop it here");
    await page.mouse.up();
    await expect
      .poll(async () => {
        const b = (await stored(page)).floors[0].rooms.find((r) => r.id === room.id)!.furniture;
        return b?.find((i) => i.catalogId === bed.catalogId)?.x;
      })
      .toBeLessThan(bed.x - 50);
    // Still selected, so it can be dragged again; one undo puts it back.
    await expect(page.locator(".dh-inspector-title").first()).toContainText("bed");
    await undo(page);
    expect(await stored(page)).toEqual(project);
  });

test("decorate: a bed dragged onto other furniture is refused with a reason", async ({ page }) => {
  const project = createPreset("compact");
  await seed(page, project);
  const { room, bed } = bedOf(project);
  const centre = { x: room.bounds.x + bed.x, z: room.bounds.z + bed.z, y: TOP };
  await page.locator(".scene-room-label").filter({ hasText: room.name }).click();
  await expect(page.locator(".scene-room-label").filter({ hasText: room.name })).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.mouse.click(...(Object.values(await toScreen(page, centre)) as [number, number]));
  await expect(page.locator(".dh-inspector-title").first()).toContainText("bed");
  await page.waitForTimeout(300);
  const from = await toScreen(page, centre);
  // Far outside the house: no room there.
  const to = await toScreen(page, { ...centre, x: centre.x + 600 });
  await drag(page, from, to);
  await expect(page.locator(".scene-ghost-badge")).toHaveAttribute("data-status", "blocked");
  await page.mouse.up();
  expect(await stored(page)).toEqual(project);
});

test("decorate: a kitchen's catalog never offers beds", async ({ page }) => {
  await page.setViewportSize(mobile);
  const project = createPreset("compact");
  await seed(page, project);
  const kitchen = project.floors[0].rooms.find((r) => r.kind === "kitchen")!;
  await page.locator(".scene-room-label").filter({ hasText: kitchen.name }).click();
  const chips = page.getByRole("radiogroup", { name: "Furniture categories" });
  await expect(chips).toBeVisible();
  await expect(chips.getByRole("radio", { name: "Beds" })).toHaveCount(0);
  for (const chip of await chips.getByRole("radio").all()) {
    await chip.click();
    await expect(page.getByRole("button", { name: /^Add (double|single) bed/ })).toHaveCount(0);
  }
});
