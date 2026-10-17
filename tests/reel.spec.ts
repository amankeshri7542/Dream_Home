// M4: the "My dream home" reel. The video studio films a real MP4 (H.264,
// with music), can be cancelled, offers a photo when the browser can't encode
// video, ends with the home's link, and leaves the scene idle afterwards.
// Tests make tiny, short reels through window.__dreamHomeReelTest.
import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import { mobile, noOverflow, seed } from "./support/dreamHome";

type Bridge = { ready: boolean; frame: number; waitForIdle: () => Promise<void> };
const bridge = <T,>(page: Page, read: (dh: Bridge) => T | Promise<T>) =>
  page.evaluate(`(${read.toString()})(window.__dreamHome)`) as Promise<T>;

async function framesOver(page: Page, ms: number) {
  const a = await bridge(page, (dh) => dh.frame);
  await page.waitForTimeout(ms);
  return (await bridge(page, (dh) => dh.frame)) - a;
}

type Hook = { width?: number; height?: number; seconds?: number; samples?: number; capture?: boolean; noVideo?: boolean };
async function reelTest(page: Page, hook: Hook) {
  await page.addInitScript((h) => ((window as unknown as { __dreamHomeReelTest: unknown }).__dreamHomeReelTest = h), hook);
}

async function openStudio(page: Page) {
  await page.getByRole("button", { name: "View options" }).first().click();
  await page.getByRole("button", { name: "Make a video" }).click();
  const studio = page.getByRole("dialog", { name: "Video studio" });
  await expect(studio).toBeVisible();
  return studio;
}

/** The finished video: its first bytes, size and what the browser makes of it. */
const resultVideo = (page: Page) =>
  page.getByRole("dialog", { name: "Video studio" }).locator("video").evaluate(async (video: HTMLVideoElement) => {
    if (video.readyState < 1) await new Promise((r) => video.addEventListener("loadedmetadata", r, { once: true }));
    const bytes = new Uint8Array(await (await fetch(video.src)).arrayBuffer());
    return {
      box: String.fromCharCode(...bytes.slice(4, 8)),
      bytes: bytes.length,
      type: (await (await fetch(video.src)).blob()).type,
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
    };
  });

const stats = (page: Page) =>
  page.evaluate(() => (window as unknown as { __dreamHomeReelStats?: { audio: boolean; shots: string[]; ms: number } }).__dreamHomeReelStats);

test("reel: films a tiny MP4 with music, then the scene goes idle", async ({ page }) => {
  test.setTimeout(120_000);
  await reelTest(page, { width: 180, height: 320, seconds: 1, samples: 1 });
  await seed(page, { ...createPreset("family"), name: "Sharma Niwas" });
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  const studio = await openStudio(page);
  // The title starts as the home's name; the grand tour in golden light.
  await expect(studio.getByRole("textbox", { name: "Title" })).toHaveValue("Sharma Niwas");
  await expect(studio.getByRole("radio", { name: "Grand tour 15 s" })).toHaveAttribute("aria-checked", "true");
  await expect(studio.getByRole("radio", { name: "Golden" })).toHaveAttribute("aria-checked", "true");
  // Diwali brings festive music, until someone picks their own.
  await studio.getByRole("radio", { name: "Diwali" }).click();
  await expect(studio.getByRole("radio", { name: "Festive" })).toHaveAttribute("aria-checked", "true");
  await studio.getByRole("radio", { name: "Golden" }).click();
  await expect(studio.getByRole("radio", { name: "Warm morning" })).toHaveAttribute("aria-checked", "true");
  await studio.getByRole("switch", { name: "Show link at the end" }).click();
  await studio.getByRole("button", { name: "Make my video" }).click();
  await expect(studio.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(studio.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 90_000 });
  const video = await resultVideo(page);
  expect(video).toMatchObject({ box: "ftyp", type: "video/mp4", width: 180, height: 320 });
  expect(video.bytes).toBeGreaterThan(2_000);
  expect(video.duration).toBeGreaterThan(0.8);
  expect(video.duration).toBeLessThan(1.3);
  const filmed = (await stats(page))!;
  expect(filmed.audio).toBe(true);
  // The whole story: outside, the door, the dollhouse, the rooms, night, the end card.
  expect(filmed.shots.slice(0, 3)).toEqual(["establish", "approach", "reveal"]);
  expect(filmed.shots.slice(-2)).toEqual(["night", "end"]);
  expect(filmed.shots.filter((s) => s === "room").length).toBeGreaterThanOrEqual(3);
  await expect(studio.getByText("#DreamHome #MyDreamHome")).toBeVisible();
  // Closing puts everything back: the Home bar, and no frames while idle.
  await studio.getByRole("button", { name: "Close video studio" }).click();
  await expect(page.getByRole("toolbar", { name: "Home actions" }).first()).toBeVisible();
  await bridge(page, (dh) => dh.waitForIdle());
  await page.waitForTimeout(800);
  expect(await framesOver(page, 2000)).toBe(0);
});

test("reel: Cancel stops filming and the scene goes idle", async ({ page }) => {
  test.setTimeout(90_000);
  await reelTest(page, { width: 180, height: 320, seconds: 60, samples: 1 });
  await seed(page, createPreset("compact"));
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  const studio = await openStudio(page);
  await studio.getByRole("switch", { name: "Show link at the end" }).click();
  await studio.getByRole("button", { name: "Make my video" }).click();
  // Filming shows its frames as they're made.
  await expect(studio.getByRole("status")).toContainText(/Filming|Walking|Opening/, { timeout: 20_000 });
  await expect(studio.locator(".dh-reel-thumb canvas")).toHaveCount(1);
  await studio.getByRole("button", { name: "Cancel" }).click();
  await expect(studio.getByRole("button", { name: "Make my video" })).toBeVisible();
  await expect(studio.locator("video")).toHaveCount(0);
  await studio.getByRole("button", { name: "Close video studio" }).click();
  await bridge(page, (dh) => dh.waitForIdle());
  await page.waitForTimeout(800);
  expect(await framesOver(page, 2000)).toBe(0);
});

test("reel: a browser that can't encode video is offered a photo instead", async ({ page }) => {
  await reelTest(page, { noVideo: true });
  await seed(page, createPreset("compact"));
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  const studio = await openStudio(page);
  await studio.getByRole("switch", { name: "Show link at the end" }).click();
  await studio.getByRole("button", { name: "Make my video" }).click();
  await expect(studio.getByText("This browser can’t make videos yet.")).toBeVisible({ timeout: 20_000 });
  await studio.getByRole("button", { name: "Take a photo instead" }).click();
  await expect(page.getByRole("dialog", { name: "Photo studio" })).toBeVisible();
});

test("reel: from Share on a phone, the video ends with the home's new link", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(mobile);
  await reelTest(page, { width: 180, height: 320, seconds: 1, samples: 1 });
  await seed(page, { ...createPreset("compact"), name: "Gupta House" });
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  await page.getByRole("button", { name: "Share your home", exact: true }).click();
  await page.getByRole("dialog", { name: "Share your home" }).getByRole("button", { name: "Make a video" }).click();
  const studio = page.getByRole("dialog", { name: "Video studio" });
  await expect(studio).toBeVisible();
  // Every choice is in sight on a phone: chips wrap, nothing scrolls sideways.
  await noOverflow(page);
  for (const chip of await studio.getByRole("radio").all()) {
    const box = (await chip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(mobile.width);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await expect(studio.getByText("Makes a link: anyone with it can see this home in 3D")).toBeVisible();
  await studio.getByRole("radio", { name: "Quick 8 s" }).click();
  await studio.getByRole("button", { name: "Make my video" }).click();
  await expect(studio.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 90_000 });
  expect((await stats(page))!.shots).toEqual(["establish", "reveal", "room", "room", "end"]);
  // The link was made (and remembered), and the caption carries it.
  const links = await page.evaluate(() => JSON.parse(localStorage.getItem("dream-home.shares.v1") ?? "{}") as Record<string, { id: string }>);
  const id = Object.values(links)[0]?.id;
  expect(id).toMatch(/^[A-Za-z0-9]{10}$/);
  await expect(studio.getByText(new RegExp(`/h/${id} #DreamHome`))).toBeVisible();
  await noOverflow(page);
  // Back in the share sheet, the same link.
  await studio.getByRole("button", { name: "Close video studio" }).click();
  await page.getByRole("button", { name: "Share your home", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Your home’s link" })).toHaveValue(new RegExp(`/h/${id}$`));
});

test("reel: the studio fits a small phone in Extra large text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await seed(page, createPreset("compact"));
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await page.getByRole("radiogroup", { name: "Text size" }).getByRole("radio", { name: "Extra large" }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-text", "extra");
  await page.getByRole("button", { name: "Share your home", exact: true }).click();
  await page.getByRole("dialog", { name: "Share your home" }).getByRole("button", { name: "Make a video" }).click();
  const studio = page.getByRole("dialog", { name: "Video studio" });
  await expect(studio).toBeVisible();
  await noOverflow(page);
  // Big targets, and the panel scrolls to its button.
  for (const chip of await studio.getByRole("radio").all()) expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const make = studio.getByRole("button", { name: "Make my video" });
  await make.scrollIntoViewIfNeeded();
  await expect(make).toBeInViewport();
  expect((await make.boundingBox())!.height).toBeGreaterThanOrEqual(55);
  if (process.env.DH_SHOTS) await page.screenshot({ path: "docs/screenshots/reel/studio-320-extra.png" });
});

// Screenshots (DH_SHOTS=1): a full grand tour at phone size, each shot's
// middle frame written to docs/screenshots/reel/ to inspect by eye (and the
// video to test-results/, to watch).
const shots = !!process.env.DH_SHOTS;
for (const mood of ["Golden", "Diwali"])
  test(`reel frames: ${mood.toLowerCase()} grand tour`, async ({ page }) => {
    test.skip(!shots, "set DH_SHOTS=1 to capture screenshots");
    test.setTimeout(300_000);
    mkdirSync("docs/screenshots/reel", { recursive: true });
    mkdirSync("test-results", { recursive: true });
    await reelTest(page, { width: 720, height: 1280, samples: 2, capture: true });
    await seed(page, { ...createPreset("family"), name: "Sharma Niwas" });
    await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
    const studio = await openStudio(page);
    await studio.getByRole("radio", { name: mood, exact: true }).click();
    await studio.getByRole("switch", { name: "Show link at the end" }).click();
    await studio.getByRole("button", { name: "Make my video" }).click();
    await expect(studio.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 280_000 });
    const frames = await page.evaluate(() => (window as unknown as { __dreamHomeReelFrames: { kind: string; jpeg: string }[] }).__dreamHomeReelFrames);
    expect(frames.length).toBeGreaterThanOrEqual(6);
    frames.forEach((f, i) =>
      writeFileSync(`docs/screenshots/reel/${mood.toLowerCase()}-${String(i + 1).padStart(2, "0")}-${f.kind}.jpg`, Buffer.from(f.jpeg.split(",")[1], "base64")),
    );
    const bytes = await studio.locator("video").evaluate(async (v: HTMLVideoElement) => [...new Uint8Array(await (await fetch(v.src)).arrayBuffer())]);
    writeFileSync(`test-results/reel-${mood.toLowerCase()}.mp4`, Buffer.from(bytes));
    console.log(`${mood} grand tour at 720 × 1280:`, JSON.stringify(await stats(page)));
  });

// How long a full-quality grand tour takes (DH_REEL_BENCH=1): a desktop at
// 1080 × 1920, and a phone at 720 × 1280 with the CPU slowed four times (the
// GPU can't be slowed here, so a real mid-range phone is the owner's check).
const bench = !!process.env.DH_REEL_BENCH;
for (const device of ["desktop", "phone"] as const)
  test(`reel timing: grand tour on a ${device}`, async ({ page }) => {
    test.skip(!bench, "set DH_REEL_BENCH=1 to time full-quality reels");
    test.setTimeout(400_000);
    if (device === "phone") {
      await page.setViewportSize(mobile);
      await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    await reelTest(page, {});
    await seed(page, { ...createPreset("family"), name: "Sharma Niwas" });
    await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false), { timeout: 60_000 }).toBe(true);
    await page.getByRole("button", { name: "Share your home", exact: true }).click();
    await page.getByRole("dialog", { name: "Share your home" }).getByRole("button", { name: "Make a video" }).click();
    const studio = page.getByRole("dialog", { name: "Video studio" });
    await studio.getByRole("switch", { name: "Show link at the end" }).click();
    await studio.getByRole("button", { name: "Make my video" }).click();
    await expect(studio.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 380_000 });
    const filmed = (await stats(page))!;
    const video = await resultVideo(page);
    console.log(`grand tour on a ${device}:`, JSON.stringify({ ...filmed, bytes: video.bytes, duration: video.duration }));
    expect(video.box).toBe("ftyp");
    expect(filmed.ms).toBeLessThan(device === "phone" ? 90_000 : 30_000);
  });
