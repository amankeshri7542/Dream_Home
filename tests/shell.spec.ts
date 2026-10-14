import { test, expect, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import {
  controls,
  dock,
  noOverflow,
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
    await expect(page.getByRole("region", { name: "Add space" })).toBeVisible();
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

test("primary touch targets are at least 48 px on phones", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seed(page, createPreset("compact"));
  const targets = [
    tool(page, "Add space"),
    tool(page, "Move"),
    tool(page, "Resize"),
    tool(page, "Rooms"),
    page.getByRole("button", { name: "Undo last change" }),
    page.getByRole("button", { name: "Fit home" }),
    page.getByRole("button", { name: "View options" }),
    page.getByRole("button", { name: "Floor plan" }),
  ];
  for (const target of targets) {
    const box = (await target.boundingBox())!;
    expect(box.width, await target.textContent()).toBeGreaterThanOrEqual(44);
    expect(box.height, await target.textContent()).toBeGreaterThanOrEqual(48);
  }
});

test("removing a room asks first and offers setting it aside instead", async ({ page }) => {
  await seed(page, createPreset("compact"));
  await controls(page, "Rooms").click();
  await page.locator(".room-card").first().click();
  await page.getByRole("button", { name: "Remove room" }).click();
  const confirm = page.getByRole("dialog", { name: /^Remove / });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Set aside instead" })).toBeFocused();
  await confirm.getByRole("button", { name: "Set aside instead" }).click();
  await expect(page.getByRole("region", { name: "Room tray" })).toBeVisible();
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
