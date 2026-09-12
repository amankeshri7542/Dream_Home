import { test, expect, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import type { Project } from "../src/domain/types";
const KEY = "dream-home.project.v2";
async function seed(page: Page, project = createPreset("compact")) {
  await page.addInitScript(
    ({ project, key }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(project));
      localStorage.setItem(
        "dream-home.preferences.v1",
        JSON.stringify({ unit: "m" }),
      );
    },
    { project, key: KEY },
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: project.name, exact: true }),
  ).toBeVisible();
  return project;
}
const saved = (page: Page): Promise<Project> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
async function inspectFirst(page: Page) {
  await page.getByRole("button", { name: "Floor plan", exact: true }).click();
  await page.locator(".plan-room").first().locator("rect").first().click();
  await expect(
    page.getByRole("button", { name: "Set aside", exact: true }),
  ).toBeVisible();
}
const trayButton = (page: Page) =>
  page.getByRole("toolbar").getByRole("button", { name: /Room tray/ });
async function planPoint(page: Page, x: number, z: number) {
  return page.locator(".plan-svg").evaluate(
    (el, { x, z }) => {
      const p = new DOMPoint(x, z).matrixTransform(
        (el as SVGSVGElement).getScreenCTM()!,
      );
      return { x: p.x, y: p.y };
    },
    { x, z },
  );
}

test("mobile hero has ample canvas, optional labels, furnishings and focus controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  const canvas = await page.locator(".model-canvas").boundingBox();
  expect(canvas!.height).toBeGreaterThan(450);
  await page.getByRole("button", { name: "Top view of home" }).click();
  await page.getByRole("button", { name: "Focus on the model" }).click();
  expect(
    (await page.locator(".model-canvas").boundingBox())!.height,
  ).toBeGreaterThan(canvas!.height + 90);
  await page.getByRole("button", { name: "Exit focus mode" }).click();
  await page.getByRole("button", { name: "Floor plan", exact: true }).click();
  await expect(page.locator(".room-label")).toHaveCount(0);
  expect(await page.locator("[data-room-details]").count()).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Focus on the model" }).click();
  await expect(page.locator(".home-app")).toHaveClass(/focus-mode/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".home-app")).not.toHaveClass(/focus-mode/);
});

test("room appearance, fixed corner resizing and tray survive reload and restore with undo", async ({
  page,
}) => {
  const project = await seed(page);
  const original = project.floors[0].rooms[0];
  await inspectFirst(page);
  await page.getByText("Room appearance", { exact: true }).click();
  await page
    .getByLabel("Room floor finish", { exact: true })
    .selectOption("stone");
  await page
    .getByRole("button", { name: "Turn furnishings", exact: true })
    .click();
  await page.getByLabel("Fixed corner for room dimensions").selectOption("se");
  await page
    .getByRole("spinbutton", { name: "Room width", exact: true })
    .fill(String((original.bounds.w - 20) / 100));
  await page
    .getByRole("spinbutton", { name: "Room width", exact: true })
    .press("Enter");
  await expect
    .poll(async () => (await saved(page)).floors[0].rooms[0].bounds.x)
    .toBe(original.bounds.x + 20);
  await page.getByRole("button", { name: "Set aside", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Room tray", exact: true }),
  ).toBeVisible();
  const staged = (await saved(page)).stagedRooms![0].room;
  expect(staged.floorFinish).toBe("stone");
  expect(staged.furnishingRotation).toBe(90);
  expect(
    (await saved(page)).floors[0].rooms.some((r) => r.id === original.id),
  ).toBe(false);
  await page.reload();
  await trayButton(page).click();
  await page
    .getByRole("button", {
      name: `Find space for ${original.name}`,
      exact: true,
    })
    .click();
  await expect
    .poll(async () =>
      (await saved(page)).floors[0].rooms.some((r) => r.id === original.id),
    )
    .toBe(true);
  expect(
    (await saved(page)).floors[0].rooms.find((r) => r.id === original.id)
      ?.floorFinish,
  ).toBe("stone");
  await page
    .getByRole("button", { name: "Undo last change", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(page)).stagedRooms?.length)
    .toBe(1);
});

test("mobile tap placement rejects occupied space then restores the piece in its vacant slot", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const project = await seed(page);
  const original = project.floors[0].rooms[0];
  await inspectFirst(page);
  await page.getByRole("button", { name: "Set aside", exact: true }).click();
  await page
    .getByRole("button", {
      name: `Choose position for ${original.name}`,
      exact: true,
    })
    .click();
  const occupied = project.floors[0].rooms[1].bounds;
  const invalid = await planPoint(
    page,
    occupied.x + occupied.w / 2,
    occupied.z + occupied.d / 2,
  );
  await page.mouse.click(invalid.x, invalid.y);
  expect((await saved(page)).stagedRooms).toHaveLength(1);
  const target = await planPoint(
    page,
    original.bounds.x + original.bounds.w / 2,
    original.bounds.z + original.bounds.d / 2,
  );
  await page.mouse.click(target.x, target.y);
  await expect
    .poll(async () => (await saved(page)).stagedRooms?.length ?? 0)
    .toBe(0);
  expect(
    (await saved(page)).floors[0].rooms.find((r) => r.id === original.id)
      ?.bounds,
  ).toEqual(original.bounds);
});

test("room drag to tray and drag back commit only completed gestures", async ({
  page,
}) => {
  const project = await seed(page);
  const room = project.floors[0].rooms[0];
  await page
    .getByRole("toolbar")
    .getByRole("button", { name: "Move", exact: true })
    .click();
  const start = await planPoint(
    page,
    room.bounds.x + room.bounds.w / 2,
    room.bounds.z + room.bounds.d / 2,
  );
  const button = await trayButton(page).boundingBox();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(
    button!.x + button!.width / 2,
    button!.y + button!.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await saved(page)).stagedRooms?.length)
    .toBe(1);
  const grip = page.getByRole("button", {
    name: `Place ${room.name} from tray`,
    exact: true,
  });
  const box = await grip.boundingBox();
  const target = await planPoint(
    page,
    room.bounds.x + room.bounds.w / 2,
    room.bounds.z + room.bounds.d / 2,
  );
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 15 });
  await page.mouse.up();
  await expect
    .poll(async () => (await saved(page)).stagedRooms?.length ?? 0)
    .toBe(0);
  expect(
    (await saved(page)).floors[0].rooms.find((r) => r.id === room.id)?.bounds,
  ).toEqual(room.bounds);
});

test("3D remains reachable after placing a selected room", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const project = await seed(page);
  await inspectFirst(page);
  await page.getByRole("button", { name: "Set aside", exact: true }).click();
  await page
    .getByRole("button", {
      name: `Find space for ${project.floors[0].rooms[0].name}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "See home in 3D", exact: true })
    .click();
  await expect(page.locator(".model-canvas")).toHaveClass(/mode-3d/);
  await expect(
    page.getByRole("button", { name: "Top view of home" }),
  ).toBeVisible();
});
