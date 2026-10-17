import { test, expect, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import { mobile, seed } from "./support/dreamHome";

type Bridge = {
  ready: boolean;
  canvasMounts: number;
  waitForIdle: () => Promise<void>;
  camera: () => { position: [number, number, number]; fov: number; distance: number };
  lighting: () => { hour: number; windowGlow: number };
};

const bridge = <T,>(page: Page, read: (dh: Bridge) => T | Promise<T>) =>
  page.evaluate(
    `(${read.toString()})(window.__dreamHome)`,
  ) as Promise<T>;

const explore = (page: Page) =>
  page.getByRole("toolbar", { name: "Home actions" }).getByRole("button", { name: "Explore", exact: true });

test("explore: time of day, turntable and back to building keep one canvas", async ({ page }) => {
  await seed(page, createPreset("compact"));
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  await explore(page).click();
  await expect(page.getByRole("button", { name: "Back to building" })).toBeVisible();
  // Night makes the windows glow.
  await page.getByRole("button", { name: "Night", exact: true }).click();
  await expect.poll(() => bridge(page, (dh) => dh.lighting().hour)).toBe(21.5);
  expect(await bridge(page, (dh) => dh.lighting().windowGlow)).toBeGreaterThan(0.4);
  const slider = page.getByRole("slider", { name: "Time of day" });
  await expect(slider).toHaveAttribute("aria-valuetext", /Night/);
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "Night, 5:00 am");
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "Morning, 8:00 am");
  // The turntable is a radio choice; reduced motion keeps it still but selectable.
  await page.getByRole("radio", { name: /Turntable/ }).click();
  await expect(page.getByRole("radio", { name: /Turntable/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Back to building" }).click();
  await expect(page.getByRole("toolbar", { name: "Home actions" }).first()).toBeVisible();
  expect(await bridge(page, (dh) => dh.canvasMounts)).toBe(1);
});

test("explore: walk inside with the keyboard and announce the room", async ({ page }) => {
  await seed(page, createPreset("compact"));
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  await explore(page).click();
  const orbit = await bridge(page, (dh) => dh.camera());
  await page.getByRole("radio", { name: /Walk inside/ }).click();
  // First person: a wide lens at eye height inside the home.
  await expect.poll(() => bridge(page, (dh) => dh.camera().fov)).toBe(68);
  const start = await bridge(page, (dh) => dh.camera().position);
  expect(start[1]).toBeGreaterThan(1.5);
  expect(start[1]).toBeLessThan(2.2);
  await expect(page.locator(".dh-walk-hint strong")).not.toBeEmpty();
  await page.locator("canvas").first().focus();
  await page.keyboard.down("w");
  await page.waitForTimeout(700);
  await page.keyboard.up("w");
  await expect
    .poll(async () => {
      const now = await bridge(page, (dh) => dh.camera().position);
      return Math.hypot(now[0] - start[0], now[2] - start[2]);
    })
    .toBeGreaterThan(0.2);
  // Leaving the walk restores the orbit camera exactly.
  await page.getByRole("radio", { name: /Look around/ }).click();
  await expect.poll(() => bridge(page, (dh) => dh.camera().fov)).toBe(orbit.fov);
});

test("explore: a photo opens a save dialog on phones", async ({ page }) => {
  await page.setViewportSize(mobile);
  await seed(page, createPreset("compact"));
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  await explore(page).click();
  // Every Explore choice fits on a phone without sideways scrolling.
  for (const name of ["Morning", "Midday", "Golden hour", "Night"]) {
    const box = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(mobile.width);
  }
  for (const name of [/Look around/, /Turntable/, /Walk inside/]) {
    const box = (await page.getByRole("radio", { name }).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(mobile.width);
  }
  await page.getByRole("button", { name: "Take a photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Your photo" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: /^Photo of/ })).toHaveJSProperty("complete", true);
  expect(await dialog.getByRole("img", { name: /^Photo of/ }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(300);
  await expect(dialog.getByRole("button", { name: "Save photo" })).toBeVisible();
});

test("explore: the joystick walks from a standstill and floor buttons climb the stairs", async ({ page }) => {
  await page.setViewportSize(mobile);
  const project = createPreset("family");
  await seed(page, project);
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  await explore(page).click();
  await page.getByRole("radio", { name: /Walk inside/ }).click();
  await expect.poll(() => bridge(page, (dh) => dh.camera().fov)).toBe(68);
  await page.waitForTimeout(300);
  const start = await bridge(page, (dh) => dh.camera().position);
  // Push the thumb stick forward and hold it.
  const stick = (await page.getByRole("application", { name: /Walk joystick/ }).boundingBox())!;
  const cx = stick.x + stick.width / 2,
    cy = stick.y + stick.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 40, { steps: 4 });
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect
    .poll(async () => {
      const now = await bridge(page, (dh) => dh.camera().position);
      return Math.hypot(now[0] - start[0], now[2] - start[2]);
    })
    .toBeGreaterThan(0.2);
  // Floors: down is not possible on the ground floor; up climbs one storey.
  const status = page.locator(".dh-walk-hint strong");
  await expect(status).toContainText(project.floors[0].name);
  await expect(page.getByRole("button", { name: "Down a floor" })).toBeDisabled();
  await page.getByRole("button", { name: "Up a floor" }).click();
  await expect(status).toContainText(project.floors[1].name);
  const upstairs = await bridge(page, (dh) => dh.camera().position);
  expect(upstairs[1]).toBeGreaterThan(start[1] + 2.5);
  await expect(page.getByRole("button", { name: "Up a floor" })).toBeDisabled();
});

test("explore: tapping the floor ahead walks there", async ({ page }) => {
  await seed(page, createPreset("compact"));
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  await explore(page).click();
  await page.getByRole("radio", { name: /Walk inside/ }).click();
  await expect.poll(() => bridge(page, (dh) => dh.camera().fov)).toBe(68);
  await page.waitForTimeout(300);
  const start = await bridge(page, (dh) => dh.camera().position);
  const size = page.viewportSize()!;
  // Just below the middle of the screen is the floor a little way ahead.
  await page.mouse.click(size.width / 2, size.height * 0.62);
  await expect
    .poll(async () => {
      const now = await bridge(page, (dh) => dh.camera().position);
      return Math.hypot(now[0] - start[0], now[2] - start[2]);
    }, { timeout: 8000 })
    .toBeGreaterThan(0.3);
});
