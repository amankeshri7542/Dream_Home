import { test, expect, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import type { Project, Rect } from "../src/domain/types";
import { dock, enterRoom, mobile, roomTab, seed, stored, undo } from "./support/dreamHome";

type Point = { x: number; y: number };
type Bridge = {
  ready: boolean;
  waitForIdle: () => Promise<void>;
  camera: () => { azimuth: number };
  projectToScreen: (p: { x: number; z: number; floorId?: string }) => Point;
};
const dh = <T,>(page: Page, fn: (b: Bridge, arg: unknown) => T | Promise<T>, arg?: unknown) =>
  page.evaluate(`(${fn.toString()})(window.__dreamHome, ${JSON.stringify(arg ?? null)})`) as Promise<T>;

const centre = (r: Rect) => ({ x: r.x + r.w / 2, z: r.z + r.d / 2 });
async function screen(page: Page, project: Project, at: { x: number; z: number }) {
  await dh(page, (b) => b.waitForIdle());
  return dh<Point>(page, (b, a) => b.projectToScreen(a as { x: number; z: number; floorId: string }), {
    ...at,
    floorId: project.floors[0].id,
  });
}
/** Presses, drags in small steps and (optionally) releases. */
async function drag(page: Page, from: Point, to: Point, release = true) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
  await page.waitForTimeout(120);
  if (release) await page.mouse.up();
}
const room = (p: Project, kind: string) => p.floors[0].rooms.find((r) => r.kind === kind)!;

async function armMove(page: Page, project: Project, kind: string) {
  const r = room(project, kind);
  await enterRoom(page, r.name);
  await dock(page, "Move").click();
  // The camera widens to the whole floor; let it settle before grabbing.
  await expect(page.getByRole("note")).toBeVisible();
  await dh(page, (b) => b.waitForIdle());
  await page.waitForTimeout(300);
  return r;
}

test("phones move a room right in 3D, with a hint, a ghost and one undo step", async ({ page }) => {
  await page.setViewportSize(mobile);
  const project = createPreset("compact");
  await seed(page, project);
  const living = await armMove(page, project, "living");
  // Phones stay in 3D: no floor plan covering the home, and a hint says what to do.
  await expect(page.locator(".plan-svg")).toHaveCount(0);
  await expect(page.getByRole("note")).toContainText("Drag the glowing piece");
  const from = await screen(page, project, centre(living.bounds));
  const to = await screen(page, project, { x: centre(living.bounds).x + 100, z: centre(living.bounds).z });
  await drag(page, from, to, false);
  const badge = page.locator(".scene-ghost-badge");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("data-status", /valid|snap/);
  expect(await stored(page)).toEqual(project);
  await page.mouse.up();
  await expect(badge).toHaveCount(0);
  await expect.poll(async () => room(await stored(page), "living").bounds.x).toBeGreaterThan(living.bounds.x + 50);
  expect(room(await stored(page), "living").bounds.z).toBe(living.bounds.z);
  await expect(page.getByRole("status", { name: "Notifications" })).toContainText("Moved!");
  await undo(page);
  expect(await stored(page)).toEqual(project);
});

test("dropping a room onto another swaps them; Escape cancels a drag", async ({ page }) => {
  await page.setViewportSize(mobile);
  const project = createPreset("compact");
  await seed(page, project);
  const living = await armMove(page, project, "living");
  const bedroom = room(project, "bedroom");
  const from = await screen(page, project, centre(living.bounds));
  const onto = await screen(page, project, centre(bedroom.bounds));
  // Escape mid-drag leaves everything as it was.
  await drag(page, from, onto, false);
  await expect(page.locator(".scene-ghost-badge")).toContainText(`Swap with ${bedroom.name}`);
  await page.keyboard.press("Escape");
  await expect(page.locator(".scene-ghost-badge")).toHaveCount(0);
  await page.mouse.up();
  expect(await stored(page)).toEqual(project);
  // The Move tool is still armed: drag again and drop to swap.
  await drag(page, from, onto);
  await expect.poll(async () => (await stored(page)).floors[0].rooms.find((r) => r.id === living.id)?.kind).not.toBe("living");
  await undo(page);
  expect(await stored(page)).toEqual(project);
});

test("a blocked drop explains why and changes nothing", async ({ page }) => {
  await page.setViewportSize(mobile);
  const project = createPreset("compact");
  await seed(page, project);
  const living = await armMove(page, project, "living");
  const kitchen = room(project, "kitchen");
  const from = await screen(page, project, centre(living.bounds));
  // Half way onto the kitchen: an overlap, not a swap.
  const to = await screen(page, project, { x: kitchen.bounds.x - 50, z: centre(living.bounds).z + 60 });
  await drag(page, from, to, false);
  await expect(page.locator(".scene-ghost-badge")).toHaveAttribute("data-status", "blocked");
  await expect(page.locator(".scene-ghost-badge")).toContainText(`Bumps into ${kitchen.name}`);
  await page.mouse.up();
  expect(await stored(page)).toEqual(project);
  await expect(page.getByRole("status", { name: "Notifications" })).toContainText(/bumps into/i);
});

test("dragging empty space still turns the view while Move is armed", async ({ page }) => {
  await page.setViewportSize(mobile);
  const project = createPreset("compact");
  await seed(page, project);
  await armMove(page, project, "living");
  const before = await dh<{ azimuth: number }>(page, (b) => b.camera());
  // Open sky above the diorama: no piece to grab there.
  const from = { x: 150, y: 200 };
  await drag(page, from, { x: from.x + 120, y: from.y });
  await dh(page, (b) => b.waitForIdle());
  const after = await dh<{ azimuth: number }>(page, (b) => b.camera());
  expect(Math.abs(after.azimuth - before.azimuth)).toBeGreaterThan(0.1);
  expect(await stored(page)).toEqual(project);
});

test("on a desktop the selected room can be dragged with the mouse directly", async ({ page }) => {
  const project = createPreset("compact");
  await seed(page, project);
  const living = room(project, "living");
  await page.locator(".scene-room-label").filter({ hasText: living.name }).click();
  await roomTab(page, "Layout").click();
  await expect(page.getByRole("toolbar", { name: `${living.name} actions` })).toBeVisible();
  const from = await screen(page, project, centre(living.bounds));
  const to = await screen(page, project, { x: centre(living.bounds).x + 100, z: centre(living.bounds).z });
  await drag(page, from, to);
  await expect.poll(async () => room(await stored(page), "living").bounds.x).toBeGreaterThan(living.bounds.x + 50);
  await undo(page);
  expect(await stored(page)).toEqual(project);
});

test("a finger drag moves the room on a touch phone", async ({ browser }) => {
  const context = await browser.newContext({ viewport: mobile, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    const project = createPreset("compact");
    await seed(page, project);
    const living = room(project, "living");
    await page.locator(".scene-room-label").filter({ hasText: living.name }).tap();
    await roomTab(page, "Layout").tap();
    await page.getByRole("toolbar", { name: `${living.name} actions` }).getByRole("button", { name: "Move", exact: true }).tap();
    await expect(page.getByRole("note")).toBeVisible();
    await page.waitForTimeout(300);
    const from = await screen(page, project, centre(living.bounds));
    const to = await screen(page, project, { x: centre(living.bounds).x + 100, z: centre(living.bounds).z });
    const session = await context.newCDPSession(page);
    const touch = (type: string, p?: Point) =>
      session.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [],
      });
    await touch("touchStart", from);
    for (let i = 1; i <= 10; i++)
      await touch("touchMove", { x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 });
    await page.waitForTimeout(120);
    await touch("touchEnd");
    await expect.poll(async () => room(await stored(page), "living").bounds.x).toBeGreaterThan(living.bounds.x + 50);
    // The page itself never scrolled.
    expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  } finally {
    await context.close();
  }
});

test("dragging a room from 3D onto the Tray sets it aside", async ({ page }) => {
  const project = createPreset("compact");
  await seed(page, project);
  const bedroom = room(project, "bedroom");
  await enterRoom(page, bedroom.name);
  await dock(page, "Move").click();
  await expect(page.getByRole("note")).toBeVisible();
  await dh(page, (b) => b.waitForIdle());
  await page.waitForTimeout(300);
  const from = await screen(page, project, centre(bedroom.bounds));
  const tray = (await dock(page, "Keep for later").locator.boundingBox())!;
  await drag(page, from, { x: tray.x + tray.width / 2, y: tray.y + tray.height / 2 }, false);
  await expect(page.locator(".scene-ghost-badge")).toContainText(`Keep ${bedroom.name} for later`);
  await page.mouse.up();
  await expect.poll(async () => (await stored(page)).stagedRooms?.length ?? 0).toBe(1);
  await expect(page.getByRole("status", { name: "Notifications" })).toContainText("kept for later");
  await undo(page);
  expect(await stored(page)).toEqual(project);
});
