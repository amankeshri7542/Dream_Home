// Photo mode: the studio renders a real JPEG of the chosen shape, can be
// cancelled, falls back to a quick picture when the careful render can't run,
// and leaves the scene idle afterwards. Tests make tiny, quick photos through
// window.__dreamHomePhotoTest.
import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import { enterRoom, mobile, noOverflow, seed } from "./support/dreamHome";

type Bridge = { ready: boolean; frame: number; waitForIdle: () => Promise<void> };
const bridge = <T,>(page: Page, read: (dh: Bridge) => T | Promise<T>) =>
  page.evaluate(`(${read.toString()})(window.__dreamHome)`) as Promise<T>;

async function framesOver(page: Page, ms: number) {
  const a = await bridge(page, (dh) => dh.frame);
  await page.waitForTimeout(ms);
  return (await bridge(page, (dh) => dh.frame)) - a;
}

/** Tiny quick photos (and optionally a forced failure) for the whole page. */
async function photoTest(page: Page, hook: { longEdge?: number; samples?: number; fail?: boolean }) {
  await page.addInitScript((h) => ((window as unknown as { __dreamHomePhotoTest: unknown }).__dreamHomePhotoTest = h), hook);
}

async function openStudio(page: Page) {
  await page.getByRole("button", { name: "View options" }).first().click();
  await page.getByRole("button", { name: "Take a photo" }).click();
  const studio = page.getByRole("dialog", { name: "Photo studio" });
  await expect(studio).toBeVisible();
  return studio;
}

/** The result image's pixel size and its first bytes (a JPEG starts FF D8 FF). */
const resultImage = (page: Page) =>
  page.getByRole("img", { name: /^Photo of/ }).evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const bytes = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
    return { width: img.naturalWidth, height: img.naturalHeight, head: [...bytes.slice(0, 3)], type: (await (await fetch(img.src)).blob()).type };
  });

test("photo: renders a JPEG of the chosen shape, then the scene goes idle", async ({ page }) => {
  test.setTimeout(60000);
  await photoTest(page, { longEdge: 320, samples: 4 });
  await seed(page, createPreset("compact"));
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  const studio = await openStudio(page);
  // From Home the whole house is the subject; Room needs a room.
  await expect(studio.getByRole("radio", { name: "Aerial" })).toHaveAttribute("aria-checked", "true");
  await expect(studio.getByRole("radio", { name: "Room" })).toBeDisabled();
  await studio.getByRole("radio", { name: "Square" }).click();
  await studio.getByRole("button", { name: "Take photo" }).click();
  await expect(studio.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 30000 });
  await expect(studio.getByText("quick photo instead")).toHaveCount(0);
  expect(await resultImage(page)).toEqual({ width: 320, height: 320, head: [0xff, 0xd8, 0xff], type: "image/jpeg" });
  // Another shape and mood: a tall story picture.
  await studio.getByRole("button", { name: "Try another mood" }).click();
  await studio.getByRole("radio", { name: "Night", exact: true }).click();
  await studio.getByRole("radio", { name: "Story 9:16" }).click();
  await studio.getByRole("button", { name: "Take photo" }).click();
  await expect(studio.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 30000 });
  expect(await resultImage(page)).toMatchObject({ width: 180, height: 320 });
  // Closing puts everything back: the Home bar, and no frames while idle.
  await studio.getByRole("button", { name: "Close photo studio" }).click();
  await expect(page.getByRole("toolbar", { name: "Home actions" }).first()).toBeVisible();
  await bridge(page, (dh) => dh.waitForIdle());
  await page.waitForTimeout(800);
  expect(await framesOver(page, 2000)).toBe(0);
});

test("photo: Cancel stops a slow photo and the scene goes idle", async ({ page }) => {
  test.setTimeout(60000);
  await photoTest(page, { longEdge: 320, samples: 5000 });
  await seed(page, createPreset("compact"));
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  const studio = await openStudio(page);
  await studio.getByRole("button", { name: "Take photo" }).click();
  await expect(studio.getByText("Developing your photo…")).toBeVisible();
  await studio.getByRole("button", { name: "Cancel" }).click();
  // Back to the choices, nothing kept.
  await expect(studio.getByRole("button", { name: "Take photo" })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Photo of/ })).toHaveCount(0);
  await studio.getByRole("button", { name: "Close photo studio" }).click();
  await bridge(page, (dh) => dh.waitForIdle());
  await page.waitForTimeout(800);
  expect(await framesOver(page, 2000)).toBe(0);
});

test("photo: when the careful render can't run, a quick photo is offered instead", async ({ page }) => {
  await photoTest(page, { longEdge: 320, samples: 2, fail: true });
  await seed(page, createPreset("compact"));
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  const studio = await openStudio(page);
  await studio.getByRole("radio", { name: "Wide 16:9" }).click();
  await studio.getByRole("button", { name: "Take photo" }).click();
  await expect(studio.getByText("This device made a quick photo instead of a full render.")).toBeVisible({ timeout: 30000 });
  const image = await resultImage(page);
  expect(image.head).toEqual([0xff, 0xd8, 0xff]);
  // Still the shape asked for.
  expect(image.width / image.height).toBeCloseTo(16 / 9, 1);
});

test("photo: the room studio's camera takes a photo of that room on a phone", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize(mobile);
  await photoTest(page, { longEdge: 320, samples: 4 });
  const project = createPreset("compact");
  const room = project.floors[0].rooms[0].name;
  await seed(page, project);
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  await enterRoom(page, room);
  await page.getByRole("button", { name: `Take a photo of ${room}` }).click();
  const studio = page.getByRole("dialog", { name: "Photo studio" });
  await expect(studio.getByRole("radio", { name: "Room" })).toHaveAttribute("aria-checked", "true");
  // Every choice is in sight on a phone: chips wrap, nothing scrolls sideways.
  await noOverflow(page);
  for (const chip of await studio.getByRole("radio").all()) {
    const box = (await chip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(mobile.width);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await studio.getByRole("button", { name: "Take photo" }).click();
  await expect(studio.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 30000 });
  expect(await resultImage(page)).toMatchObject({ width: 256, height: 320 });
  // Closing returns to the room.
  await studio.getByRole("button", { name: "Close photo studio" }).click();
  await expect(page.getByRole("complementary", { name: `${room} studio` })).toBeVisible();
});

// Screenshots (DH_SHOTS=1): every mood, aerial and front, as a phone (Post
// 4:5) and a desktop (Wide 16:9) would take them, to inspect by eye.
const shots = !!process.env.DH_SHOTS;
if (shots) mkdirSync("docs/screenshots/photo", { recursive: true });
for (const device of [
  { name: "390", viewport: mobile, shape: "Post 4:5" },
  { name: "1440", viewport: { width: 1440, height: 900 }, shape: "Wide 16:9" },
])
  test(`photo screenshots at ${device.name}`, async ({ page }) => {
    test.skip(!shots, "set DH_SHOTS=1 to capture screenshots");
    test.setTimeout(240000);
    await page.setViewportSize(device.viewport);
    await photoTest(page, { longEdge: 800, samples: 24 });
    await seed(page, createPreset("family"));
    await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
    const studio = await openStudio(page);
    await studio.getByRole("radio", { name: device.shape }).click();
    for (const framing of ["Aerial", "Front"])
      for (const mood of ["Morning", "Noon", "Golden hour", "Night", "Diwali night"]) {
        await studio.getByRole("radio", { name: framing, exact: true }).click();
        await studio.getByRole("radio", { name: mood, exact: true }).click();
        await studio.getByRole("button", { name: "Take photo" }).click();
        await expect(studio.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 60000 });
        const bytes = await page
          .getByRole("img", { name: /^Photo of/ })
          .evaluate(async (img: HTMLImageElement) => [...new Uint8Array(await (await fetch(img.src)).arrayBuffer())]);
        const file = `${device.name}-${framing.toLowerCase()}-${mood.toLowerCase().replace(/\s+/g, "-")}.jpg`;
        writeFileSync(`docs/screenshots/photo/${file}`, Buffer.from(bytes));
        await studio.getByRole("button", { name: "Try another mood" }).click();
      }
  });
