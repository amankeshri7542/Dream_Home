import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createPreset, balconyBounds } from "../src/domain/model";
import type { Project, Rect } from "../src/domain/types";
import { createBlueprint } from "../src/domain/blueprints";

const KEY = "dream-home.project.v2";
const LEGACY = "dream-home.project.v1";
const saved = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null") as Project,
    KEY,
  );
async function seed(page: Page, project: Project) {
  await page.addInitScript(
    ({ key, project }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(project));
      localStorage.setItem(
        "dream-home.preferences.v1",
        JSON.stringify({ unit: "m" }),
      );
    },
    { key: KEY, project },
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: project.name, exact: true }),
  ).toBeVisible();
}
const tool = (page: Page, name: string) =>
  page
    .getByRole("toolbar", { name: "Building tools" })
    .getByRole("button", { name, exact: true });
async function dragRect(page: Page, from: Rect, dx: number, dz: number) {
  const coords = await page.locator(".plan-svg").evaluate(
    (element, args) => {
      const matrix = (element as SVGSVGElement).getScreenCTM()!;
      const from = new DOMPoint(
        args.from.x + args.from.w / 2,
        args.from.z + args.from.d / 2,
      ).matrixTransform(matrix);
      const to = new DOMPoint(
        args.from.x + args.from.w / 2 + args.dx,
        args.from.z + args.from.d / 2 + args.dz,
      ).matrixTransform(matrix);
      return { x: from.x, y: from.y, tx: to.x, ty: to.y };
    },
    { from, dx, dz },
  );
  await page.mouse.move(coords.x, coords.y);
  await page.mouse.down();
  await page.mouse.move(coords.tx, coords.ty, { steps: 10 });
  await page.mouse.up();
}

test("v1 browser save migrates to v2 while preserving its original recovery copy", async ({
  page,
}) => {
  const original = await readFile(
    "tests/fixtures/legacy-v1-courtyard.json",
    "utf8",
  );
  await page.addInitScript(
    ({ original, key }) => localStorage.setItem(key, original),
    { original, key: LEGACY },
  );
  await page.goto("/");
  await expect.poll(async () => (await saved(page))?.schemaVersion).toBe(2);
  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY)).toBe(
    original,
  );
  const migrated = await saved(page);
  expect(
    migrated.verticalSpaces.some((space) => space.kind === "courtyard"),
  ).toBe(true);
  expect(migrated.floors[1].balconies).toHaveLength(1);
  await page.reload();
  expect(await saved(page)).toEqual(migrated);
});

test("a corrupt v2 save is preserved instead of silently loading a stale v1 file", async ({
  page,
}) => {
  const original = await readFile(
    "tests/fixtures/legacy-v1-courtyard.json",
    "utf8",
  );
  await page.addInitScript(
    ({ original, key, legacy }) => {
      localStorage.setItem(legacy, original);
      localStorage.setItem(key, "{broken-v2");
    },
    { original, key: KEY, legacy: LEGACY },
  );
  await page.goto("/");
  await expect(
    page.getByText(/Your saved file could not be opened/),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    "{broken-v2",
  );
  expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY)).toBe(
    original,
  );
});

test("the unequal bedroom and kitchen in the courtyard home exchange uses without moving walls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const project = createPreset("courtyard"),
    floor = project.floors[0];
  const bedroom = floor.rooms.find((room) => room.kind === "bedroom")!;
  const kitchen = floor.rooms.find((room) => room.kind === "kitchen")!;
  expect(bedroom.bounds.w).not.toBe(kitchen.bounds.w);
  await seed(page, project);
  await tool(page, "Move").click();
  await dragRect(
    page,
    bedroom.bounds,
    kitchen.bounds.x +
      kitchen.bounds.w / 2 -
      bedroom.bounds.x -
      bedroom.bounds.w / 2,
    kitchen.bounds.z +
      kitchen.bounds.d / 2 -
      bedroom.bounds.z -
      bedroom.bounds.d / 2,
  );
  await expect
    .poll(
      async () =>
        (await saved(page)).floors[0].rooms.find((r) => r.id === bedroom.id)
          ?.kind,
    )
    .toBe("kitchen");
  const changed = await saved(page);
  expect(changed.floors[0].rooms.map((r) => r.bounds)).toEqual(
    floor.rooms.map((r) => r.bounds),
  );
  expect(changed.floors[0].rooms.find((r) => r.id === kitchen.id)?.kind).toBe(
    "bedroom",
  );
  await tool(page, "Undo last change").click();
  await expect.poll(() => saved(page)).toEqual(project);
});

test("an empty current save is retained for recovery", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, ""), KEY);
  await page.goto("/");
  await expect(
    page.getByText(/Your saved file could not be opened/),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe("");
});

test("balcony and courtyard support direct movement, tap controls, undo and reload on a small phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const project = createPreset("courtyard");
  project.floors.forEach((floor) => {
    floor.rooms = [];
  });
  await seed(page, project);
  await page.getByRole("button", { name: "Floor plan", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Home controls" })
    .getByRole("button", { name: "Rooms", exact: true })
    .click();
  await page.getByLabel("Editing floor").selectOption(project.floors[1].id);
  await page.getByRole("button", { name: /Balcony 1/ }).click();
  await expect(page.getByLabel("Balcony width", { exact: true })).toBeVisible();
  // The sample has only one metre of side clearance; reduce depth explicitly.
  await page.getByLabel("Balcony depth", { exact: true }).fill("0.9");
  await page.getByLabel("Balcony depth", { exact: true }).press("Enter");
  await page
    .getByRole("group", { name: "Balcony side" })
    .getByRole("button", { name: "Right", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(page)).floors[1].balconies[0].edge)
    .toBe("east");
  await page
    .getByRole("button", { name: "Slide forward", exact: true })
    .click();
  const beforeDrag = await saved(page);
  await tool(page, "Move").click();
  const balcony = beforeDrag.floors[1].balconies[0];
  await dragRect(page, balconyBounds(beforeDrag.floors[1], balcony), 0, 100);
  await expect
    .poll(async () => (await saved(page)).floors[1].balconies[0].offset)
    .toBe(balcony.offset + 100);
  await tool(page, "Undo last change").click();
  await expect.poll(() => saved(page)).toEqual(beforeDrag);
  const courtyard = beforeDrag.verticalSpaces.find(
    (space) => space.kind === "courtyard",
  )!;
  await dragRect(page, courtyard.bounds, 100, 0);
  await expect
    .poll(
      async () =>
        (await saved(page)).verticalSpaces.find(
          (space) => space.id === courtyard.id,
        )?.bounds.x,
    )
    .toBe(courtyard.bounds.x + 100);
  await page.getByRole("button", { name: /Courtyard Edit details/ }).click();
  await expect(
    page.getByText(
      /Moving or resizing it updates every affected floor together/,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Move space left", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await saved(page)).verticalSpaces.find(
          (space) => space.id === courtyard.id,
        )?.bounds.x,
    )
    .toBe(courtyard.bounds.x + 90);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const final = await saved(page);
  await page.reload();
  expect(await saved(page)).toEqual(final);
});

test("a room can move into another flat with its size and use preserved", async ({
  page,
}) => {
  const result = createBlueprint({
    kind: "apartments",
    widthCm: 2400,
    depthCm: 3000,
    marginCm: 100,
    road: "south",
    floors: 1,
    bedrooms: 2,
    unitsPerFloor: 2,
    bedroomsPerUnit: 2,
    shopsPerFloor: 2,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const project = result.project,
    floor = project.floors[0];
  const targetId = floor.unitAreas[1].unitId;
  const source = floor.rooms[0];
  floor.rooms = floor.rooms.filter((room) => room.unitId !== targetId);
  await seed(page, project);
  await page
    .getByRole("navigation", { name: "Home controls" })
    .getByRole("button", { name: "Rooms", exact: true })
    .click();
  await page.locator(".room-card").first().click();
  await page
    .getByLabel("Move room to group", { exact: true })
    .selectOption(targetId);
  await expect
    .poll(
      async () =>
        (await saved(page)).floors[0].rooms.find(
          (room) => room.id === source.id,
        )?.unitId,
    )
    .toBe(targetId);
  const moved = (await saved(page)).floors[0].rooms.find(
    (room) => room.id === source.id,
  )!;
  expect(moved.bounds.w).toBe(source.bounds.w);
  expect(moved.bounds.d).toBe(source.bounds.d);
  expect(moved.kind).toBe(source.kind);
  expect(moved.bounds.x).not.toBe(source.bounds.x);
});

test("native touch can move a courtyard without panning the page", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    const project = createPreset("courtyard");
    project.floors.forEach((floor) => {
      floor.rooms = [];
    });
    await seed(page, project);
    await tool(page, "Move").tap();
    const space = project.verticalSpaces.find(
      (item) => item.kind === "courtyard",
    )!;
    const points = await page
      .locator(".plan-svg")
      .evaluate((element, bounds) => {
        const matrix = (element as SVGSVGElement).getScreenCTM()!;
        const start = new DOMPoint(
          bounds.x + bounds.w / 2,
          bounds.z + bounds.d / 2,
        ).matrixTransform(matrix);
        const end = new DOMPoint(
          bounds.x + bounds.w / 2 + 150,
          bounds.z + bounds.d / 2,
        ).matrixTransform(matrix);
        return {
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y },
        };
      }, space.bounds);
    const session = await context.newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [points.start],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [points.end],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(
        async () =>
          (await saved(page)).verticalSpaces.find(
            (item) => item.id === space.id,
          )?.bounds.x,
      )
      .toBe(space.bounds.x + 150);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  } finally {
    await context.close();
  }
});

test("the open-space catalog adds a courtyard and exposes its resize and remove controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const project = createPreset("compact");
  project.floors[0].rooms = [];
  await seed(page, project);
  await tool(page, "Add space").click();
  const dialog = page.getByRole("dialog", { name: "Add space", exact: true });
  await dialog
    .getByRole("button", { name: "Balconies & open spaces", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: /^Courtyard Open to the sky/ })
    .click();
  await dialog
    .getByRole("button", { name: "Add courtyard", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await saved(page)).verticalSpaces.filter(
          (space) => space.kind === "courtyard",
        ).length,
    )
    .toBe(1);
  await page.getByRole("button", { name: /Courtyard Edit details/ }).click();
  await expect(
    page.getByLabel("Courtyard width", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/courtyard-controls-mobile.png" });
  await page
    .getByRole("button", { name: "Remove courtyard", exact: true })
    .click();
  await expect.poll(() => saved(page)).toEqual(project);
});

test("a back balcony resizes outward from its visible corner", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const project = createPreset("courtyard"),
    floor = project.floors[1];
  floor.balconies[0].edge = "north";
  await seed(page, project);
  await page
    .getByRole("navigation", { name: "Home controls" })
    .getByRole("button", { name: "Rooms", exact: true })
    .click();
  await page.getByLabel("Editing floor").selectOption(floor.id);
  await page.getByRole("button", { name: /Balcony 1/ }).click();
  await page.getByRole("button", { name: "Resize space", exact: true }).click();
  const handle = page.locator(".plan-resize-handle");
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!;
  const scale = await page
    .locator(".plan-svg")
    .evaluate((element) => (element as SVGSVGElement).getScreenCTM()!.a);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 50 * scale,
    box.y + box.height / 2 - 50 * scale,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await saved(page)).floors[1].balconies[0].depth)
    .toBe(200);
  expect((await saved(page)).floors[1].balconies[0].width).toBe(410);
});
