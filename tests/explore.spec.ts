import { test, expect, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import { mobile, seed } from "./support/dreamHome";
import { VISITOR_RADIUS, furnitureBlockers } from "../src/explore/walkPhysics";

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
  await expect(page.getByRole("button", { name: "Back to home" })).toBeVisible();
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
  await page.getByRole("button", { name: "Back to home" }).click();
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

test("explore: you can't walk through the furniture", async ({ page }) => {
  const project = createPreset("compact");
  await seed(page, project);
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  await explore(page).click();
  await page.getByRole("radio", { name: /Walk inside/ }).click();
  await expect.poll(() => bridge(page, (dh) => dh.camera().fov)).toBe(68);
  const pieces = furnitureBlockers(project, project.floors[0].id);
  expect(pieces.length).toBeGreaterThan(0);
  // Plot centimetres from world metres (the plot is centred on the origin).
  const toPlot = (p: [number, number, number]) => ({ x: (p[0] + project.plot.width / 200) * 100, z: (p[2] + project.plot.depth / 200) * 100 });
  const insideAny = (q: { x: number; z: number }) =>
    pieces.some((s) => {
      const dx = s.bx - s.ax,
        dz = s.bz - s.az;
      const t = Math.max(0, Math.min(1, ((q.x - s.ax) * dx + (q.z - s.az) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(q.x - (s.ax + dx * t), q.z - (s.az + dz * t)) < s.half + VISITOR_RADIUS - 6;
    });
  await page.locator("canvas").first().focus();
  // Walk forward, then turn a little and keep going, sampling where the visitor is.
  for (const turn of ["", "q", "e"]) {
    if (turn) {
      await page.keyboard.down(turn);
      await page.waitForTimeout(350);
      await page.keyboard.up(turn);
    }
    await page.keyboard.down("w");
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(120);
      expect(insideAny(toPlot(await bridge(page, (dh) => dh.camera().position)))).toBe(false);
    }
    await page.keyboard.up("w");
  }
});

test("a quiet walk: the time folds to a sun chip, and the plan takes you to a room", async ({ page }) => {
  await page.setViewportSize(mobile);
  const project = createPreset("compact");
  await seed(page, project);
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  await explore(page).click();
  await page.getByRole("radio", { name: /Walk inside/ }).click();
  await expect.poll(() => bridge(page, (dh) => dh.camera().fov)).toBe(68);
  // The time panel is folded away to a chip while walking; tapping it opens it, Done folds it.
  const chip = page.getByRole("button", { name: /^Time of day: .* Change it$/ });
  await expect(chip).toBeVisible();
  await expect(page.getByRole("slider", { name: "Time of day" })).toHaveCount(0);
  await chip.click();
  await expect(page.getByRole("slider", { name: "Time of day" })).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(chip).toBeVisible();
  // The plan: every room a target of 44 px or more, and a tap goes there.
  const planButton = page.getByRole("button", { name: "Plan", exact: true });
  expect((await planButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await planButton.click();
  const plan = page.getByRole("group", { name: /^Plan of / });
  await expect(plan).toBeVisible();
  const bedroom = project.floors[0].rooms.find((r) => r.kind === "bedroom")!;
  await plan.getByRole("button", { name: `Go to ${bedroom.name}` }).click();
  await expect(plan).toHaveCount(0);
  await expect(page.locator(".dh-walk-hint strong")).toHaveText(new RegExp(bedroom.name));
});

test("at 320 px in Extra large, the walk's controls fit without overlapping", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => {
    const prefs = JSON.parse(localStorage.getItem("dream-home.preferences.v1") ?? "{}");
    localStorage.setItem("dream-home.preferences.v1", JSON.stringify({ ...prefs, textSize: "extra" }));
  });
  await seed(page, createPreset("compact"));
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  await explore(page).click();
  await page.getByRole("radio", { name: /Walk inside/ }).click();
  await expect.poll(() => bridge(page, (dh) => dh.camera().fov)).toBe(68);
  const boxes = await page.evaluate(() =>
    [".dh-joystick", ".dh-walk-tools", ".dh-walk-hint", ".dh-sun-chip", ".dh-walk-floors"]
      .map((sel) => ({ sel, r: document.querySelector(sel)?.getBoundingClientRect() }))
      .filter((b) => b.r && b.r.width > 0)
      .map(({ sel, r }) => ({ sel, x0: r!.left, y0: r!.top, x1: r!.right, y1: r!.bottom })),
  );
  expect(boxes.length).toBeGreaterThanOrEqual(4);
  for (const b of boxes) {
    expect(b.x0, b.sel).toBeGreaterThanOrEqual(-1);
    expect(b.x1, b.sel).toBeLessThanOrEqual(321);
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 2 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 2;
      expect(overlap, `${a.sel} overlaps ${b.sel}`).toBe(false);
    }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("desktop: the mouse can look around, and dragging still works if the browser says no", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, createPreset("compact"));
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  await explore(page).click();
  await page.getByRole("radio", { name: /Walk inside/ }).click();
  await expect.poll(() => bridge(page, (dh) => dh.camera().fov)).toBe(68);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Look with the mouse" }).click();
  await page.keyboard.press("Escape");
  // Drag to look, as before.
  const canvas = page.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  const before = await bridge(page, (dh) => dh.camera().position);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  const after = await bridge(page, (dh) => dh.camera().position);
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(0.1);
  expect(errors).toEqual([]);
});

test.describe("walking with motion on", () => {
  test.use({ reducedMotion: "no-preference" });
  test("running widens the view, the head bobs, and both settle when you stop", async ({ page }) => {
    await seed(page, createPreset("compact"));
    await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
    await explore(page).click();
    await page.getByRole("radio", { name: /Walk inside/ }).click();
    await expect.poll(() => bridge(page, (dh) => dh.camera().fov)).toBe(68);
    await page.locator("canvas").first().focus();
    await page.keyboard.down("Shift");
    await page.keyboard.down("w");
    // While running: a wider view, and the eye height moves with each stride.
    const heights: number[] = [];
    let widest = 68;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(60);
      const cam = await bridge(page, (dh) => dh.camera());
      heights.push(cam.position[1]);
      widest = Math.max(widest, cam.fov);
    }
    await page.keyboard.up("w");
    await page.keyboard.up("Shift");
    expect(widest).toBeGreaterThan(71);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.004);
    // Then it settles exactly, and the scene goes idle again.
    await expect.poll(() => bridge(page, (dh) => dh.camera().fov), { timeout: 5000 }).toBe(68);
    await bridge(page, (dh) => dh.waitForIdle());
  });
});

test("explore: every choice fits a phone and the camera opens the photo studio", async ({ page }) => {
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
  const studio = page.getByRole("dialog", { name: "Photo studio" });
  await expect(studio).toBeVisible();
  // "This view" keeps the explore camera.
  await expect(studio.getByRole("radio", { name: "This view" })).toBeEnabled();
  await studio.getByRole("button", { name: "Close photo studio" }).click();
  await expect(page.getByRole("button", { name: "Back to home" })).toBeVisible();
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

test("the phone meter shows only when asked for, and never wakes an idle scene", async ({ page }) => {
  await seed(page, createPreset("compact"));
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  await expect(page.getByRole("status", { name: "Phone meter" })).toHaveCount(0);
  await page.goto("/?debug=meter");
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  const meter = page.getByRole("status", { name: "Phone meter" });
  await expect(meter).toContainText("draw calls");
  await expect(meter).toContainText("quality");
  // Reading twice a second must not ask for frames.
  await bridge(page, (dh) => dh.waitForIdle());
  await page.waitForTimeout(800);
  const frames = () => page.evaluate(() => (window as unknown as { __dreamHome: { frame: number } }).__dreamHome.frame);
  const before = await frames();
  await page.waitForTimeout(1600);
  expect((await frames()) - before).toBe(0);
  await expect(meter).toContainText("idle");
  // It doesn't catch taps meant for the app.
  expect(await meter.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
});
