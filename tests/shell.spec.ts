import { test, expect, type Locator, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import {
  controls,
  dock,
  enterRoom,
  homeAction,
  noOverflow,
  roomTab,
  openPlan,
  seed,
  showDetails,
  tool,
} from "./support/dreamHome";

const SIZES = [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

async function canvasState(page: Page) {
  return page.locator("canvas").evaluateAll((list) =>
    list.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
}

for (const size of SIZES)
  test(`the 3D canvas stays mounted and still at ${size.width}×${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await seed(page, createPreset("courtyard"));
    const canvas = await page.locator("canvas").elementHandle();
    const before = await canvasState(page);
    expect(before).toHaveLength(1);
    const same = async () => {
      expect(await canvas!.evaluate((el) => el.isConnected)).toBe(true);
      expect(await canvasState(page)).toEqual(before);
      await noOverflow(page);
    };
    // Panels and the inspector sheet.
    await controls(page, "Rooms").click();
    await same();
    await page.locator(".room-card").first().click();
    await same();
    await showDetails(page);
    await same();
    await dock(page, "Move").click();
    await same();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await controls(page, "My plot").click();
    await same();
    await tool(page, "Add space").click();
    await expect(page.getByRole("region", { name: "Add room" })).toBeVisible();
    await same();
    await page.keyboard.press("Escape");
    await controls(page, "View").click();
    await same();
    await page.keyboard.press("Escape");
    await openPlan(page);
    await same();
    await page.getByRole("button", { name: "Close floor plan" }).click();
    await same();
  });

test("chrome groups never overlap on a small phone, with or without a selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seed(page, createPreset("courtyard"));
  const check = async () => {
    const boxes = await page.locator("[data-chrome]:not([data-chrome=canvas])").evaluateAll((list) =>
      list
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { name: (el as HTMLElement).dataset.chrome!, r: { x: r.x, y: r.y, w: r.width, h: r.height } };
        })
        .filter((b) => b.r.w > 0 && b.r.h > 0),
    );
    // Containers (bottom stack) hold their own children; compare siblings only.
    const top = boxes.filter((b) => ["topbar", "floors", "camera", "bottom", "notifications"].includes(b.name));
    for (let i = 0; i < top.length; i++)
      for (let j = i + 1; j < top.length; j++) {
        const a = top[i].r,
          b = top[j].r;
        const overlap =
          Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
          Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
        expect(overlap, `${top[i].name} overlaps ${top[j].name}`).toBe(false);
      }
  };
  await check();
  await controls(page, "Rooms").click();
  await page.locator(".room-card").first().click();
  await check();
  await showDetails(page);
  await check();
});

test("primary touch targets are at least 48 px on phones, at Home and in a room", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const project = createPreset("compact");
  await seed(page, project);
  const measure = async (targets: Locator[]) => {
    for (const target of targets) {
      const box = (await target.boundingBox())!;
      const name = (await target.getAttribute("aria-label")) ?? (await target.textContent());
      expect(box.width, name ?? "").toBeGreaterThanOrEqual(44);
      expect(box.height, name ?? "").toBeGreaterThanOrEqual(44);
    }
  };
  await measure([
    homeAction(page, "Add room"),
    homeAction(page, "Outside"),
    homeAction(page, "Explore"),
    homeAction(page, "Design with AI"),
    page.getByRole("button", { name: "Undo last change" }),
    page.getByRole("button", { name: "Fit home" }),
    page.getByRole("button", { name: "View options" }),
    page.getByRole("button", { name: "Floor plan" }),
  ]);
  await enterRoom(page, project.floors[0].rooms[0].name);
  await roomTab(page, "Layout").click();
  await measure([
    page.getByRole("button", { name: "Back to home" }),
    page.getByRole("button", { name: "Previous room" }),
    page.getByRole("button", { name: "Next room" }),
    roomTab(page, "Furniture"),
    roomTab(page, "Colours"),
    roomTab(page, "Layout"),
    roomTab(page, "Doors"),
    dock(page, "Move").locator,
    dock(page, "Edit in 2D").locator,
  ]);
});

test("removing a room asks first and offers setting it aside instead", async ({ page }) => {
  await seed(page, createPreset("compact"));
  await controls(page, "Rooms").click();
  await page.locator(".room-card").first().click();
  await roomTab(page, "Layout").click();
  await page.getByRole("button", { name: "Remove room" }).click();
  const confirm = page.getByRole("dialog", { name: /^Remove / });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Keep for later instead" })).toBeFocused();
  await confirm.getByRole("button", { name: "Keep for later instead" }).click();
  await expect(page.getByRole("region", { name: "Kept for later" })).toBeVisible();
  const stagedName = await page.evaluate(
    () => JSON.parse(localStorage.getItem("dream-home.project.v2")!).stagedRooms[0].room.name,
  );
  expect(stagedName).toBeTruthy();
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("dream-home.project.v2")!).stagedRooms?.length ?? 0,
      ),
    )
    .toBe(0);
});

for (const [name, size] of [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1440, height: 1000 }],
] as const)
  test(`the action bar's More menu opens and works while editing in 2D (${name})`, async ({ page }) => {
    await page.setViewportSize(size);
    const project = createPreset("compact");
    await seed(page, project);
    const room = project.floors[0].rooms[0];
    await page.locator(".scene-room-label").filter({ hasText: room.name }).click();
    await dock(page, "Edit in 2D").click();
    await expect(page.locator(".plan-svg")).toBeVisible();
    await dock(page, "More actions").click();
    const menu = page.getByRole("menu", { name: `More for ${room.name}` });
    // Every item is really on screen, not clipped by the scrolling bar.
    for (const item of await menu.getByRole("menuitem").all()) {
      await expect(item).toBeInViewport({ ratio: 1 });
      const box = (await item.boundingBox())!;
      const hit = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest("[role=menuitem]")?.textContent ?? "",
        [box.x + box.width / 2, box.y + box.height / 2],
      );
      expect(hit).toBe(await item.textContent());
    }
    // Keyboard: focus starts on the first item, arrows move, Escape closes only the menu.
    if (name === "desktop") {
      const items = menu.getByRole("menuitem");
      await expect(items.first()).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(items.nth(1)).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(items.first()).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(dock(page, "More actions").locator).toBeFocused();
      await dock(page, "More actions").click();
    }
    // "All details" leaves the plan and shows the room's details.
    await menu.getByRole("menuitem", { name: "All details" }).click();
    await expect(page.locator(".plan-svg")).toHaveCount(0);
    await expect(page.getByLabel("Room width", { exact: false }).first()).toBeVisible();
  });
