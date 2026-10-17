// M3 regional looks and lived-in details: look cards apply and undo, the
// lived-in layer keeps Explore at night within the draw-call budget and Build
// at zero idle frames, its idle motion follows the street-life gate, and the
// View options and Photo studio switches work. DH_SHOTS=1 writes every look by
// day and night, plus lived-in rooms and a Diwali photo, at 390 and 1440.
import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { LOOK_ORDER } from "../src/domain/looks";
import { withStylePreset } from "../src/domain/materials";
import { suggestBalcony } from "../src/domain/openSpaces";
import type { Project, StylePreset } from "../src/domain/types";
import { TEMPLATES, buildTemplate } from "../src/onboarding/templates";
import { KEY, enterRoom, homeAction, mobile, stored } from "./support/dreamHome";

type Obj = { name: string; userData: Record<string, unknown> };
type Bridge = {
  ready: boolean;
  frame: number;
  waitForIdle: () => Promise<void>;
  renderer: () => { calls: number; triangles: number };
  scene: () => { getObjectByName: (n: string) => Obj | undefined };
};
const bridge = <T,>(page: Page, read: (dh: Bridge) => T | Promise<T>) =>
  page.evaluate(`(${read.toString()})(window.__dreamHome)`) as Promise<T>;
const named = (page: Page, name: string) =>
  page.evaluate((n) => {
    const o = (window as unknown as { __dreamHome: Bridge }).__dreamHome.scene().getObjectByName(n);
    return o ? { name: o.name, userData: o.userData } : null;
  }, name);
async function framesOver(page: Page, ms: number) {
  const a = await bridge(page, (dh) => dh.frame);
  await page.waitForTimeout(ms);
  return (await bridge(page, (dh) => dh.frame)) - a;
}

/** A two-storey home with a front balcony, parking and a garden, in a look. */
function lookHome(look: StylePreset = "kerala", name = "Our Lived-in Home"): Project {
  const built = buildTemplate(TEMPLATES.find((t) => t.id === "villa")!, { floors: 2 });
  if (!built.ok) throw new Error(built.error);
  let home: Project = { ...built.project, name, parking: true, garden: true };
  const balcony = suggestBalcony(home, home.floors[1].id, "south", 300, 120);
  if (balcony.ok) home = { ...balcony.project, name };
  return withStylePreset(home, look);
}

async function seedHome(page: Page, project: Project, prefs: Record<string, unknown> = {}) {
  await page.addInitScript(
    ({ fixture, key, prefs }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(fixture));
      localStorage.setItem("dream-home.preferences.v1", JSON.stringify({ language: "en", unit: "ft", tourSeen: true, quality: "balanced", streetLife: false, ...prefs }));
      sessionStorage.setItem("dream-home.session.v1", JSON.stringify({ titleDismissed: true }));
    },
    { fixture: project, key: KEY, prefs },
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: project.name, exact: true })).toBeVisible({ timeout: 15000 });
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false), { timeout: 20000 }).toBe(true);
}
const backToBuilding = (page: Page) => page.getByRole("button", { name: "Back to building" });
async function openLooks(page: Page) {
  await homeAction(page, "Outside").click();
  const style = page.getByRole("button", { name: /House style/ });
  if (await style.isVisible()) await style.click();
  const looks = page.getByRole("group", { name: "Look" });
  await looks.scrollIntoViewIfNeeded();
  return looks;
}

test("look cards show a rendered picture, apply in one tap and undo from the toast", async ({ page }) => {
  await page.setViewportSize(mobile);
  await seedHome(page, lookHome("indian-modern", "Card Home"));
  const looks = await openLooks(page);
  await expect(looks.getByRole("button")).toHaveCount(LOOK_ORDER.length);
  const kerala = looks.getByRole("button", { name: /^Kerala/ });
  await kerala.scrollIntoViewIfNeeded();
  // The card's picture is a real render (a loaded WebP, not the fallback drawing).
  await expect.poll(() => kerala.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(480);
  const box = (await kerala.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(110);
  expect(box.width).toBeGreaterThanOrEqual(96);
  await kerala.click();
  await expect(kerala).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await stored(page))?.style?.preset).toBe("kerala");
  expect((await stored(page)).style?.roof).toEqual({ style: "hip", material: "mangalore", pitch: 30 });
  // "Try it": the toast offers Undo, which brings the old look back.
  const toast = page.getByRole("status").filter({ hasText: "Kerala look" });
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await stored(page))?.style?.preset).toBe("indian-modern");
  await expect(looks.getByRole("button", { name: /^Indian modern/ })).toHaveAttribute("aria-pressed", "true");
});

test("lived-in details keep Build idle, and Explore at night within the draw-call budget", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize(mobile);
  await seedHome(page, lookHome());
  await bridge(page, (dh) => dh.waitForIdle());
  await page.waitForTimeout(800);
  // Build never shows (or loads) lived-in details, and renders nothing while idle.
  expect(await named(page, "lived-in")).toBeNull();
  expect(await framesOver(page, 2000)).toBe(0);
  const build = await bridge(page, (dh) => dh.renderer().calls);
  await homeAction(page, "Explore").click();
  await expect(backToBuilding(page)).toBeVisible();
  await page.getByRole("button", { name: "Night", exact: true }).click();
  await expect.poll(() => named(page, "lived-in"), { timeout: 15000 }).not.toBeNull();
  await expect.poll(() => named(page, "lived-in:life"), { timeout: 15000 }).not.toBeNull();
  await bridge(page, (dh) => dh.waitForIdle());
  await page.waitForTimeout(600);
  const night = await bridge(page, (dh) => dh.renderer().calls);
  console.log(`draw calls: build ${build}, explore at night with lived-in ${night}`);
  expect(build).toBeLessThanOrEqual(90);
  expect(night).toBeLessThanOrEqual(160);
  // Reduced motion (this suite's default): the details show, nothing moves.
  expect(await framesOver(page, 1200)).toBe(0);
  // The walk inside the furnished floor stays in budget too.
  await page.getByRole("radio", { name: /Walk inside/ }).click();
  await page.waitForTimeout(1500);
  await bridge(page, (dh) => dh.waitForIdle());
  expect(await bridge(page, (dh) => dh.renderer().calls)).toBeLessThanOrEqual(160);
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });
  test("fans, curtains, the cat and diyas move only in Explore; Build has zero idle frames", async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(mobile);
    await seedHome(page, lookHome());
    await bridge(page, (dh) => dh.waitForIdle());
    await page.waitForTimeout(800);
    expect(await framesOver(page, 2000)).toBe(0);
    await homeAction(page, "Explore").click();
    await expect(backToBuilding(page)).toBeVisible();
    await expect.poll(() => named(page, "lived-in:life"), { timeout: 15000 }).not.toBeNull();
    await bridge(page, (dh) => dh.waitForIdle());
    await page.waitForTimeout(500);
    // Idle motion ticks at ~24 fps.
    const frames = await framesOver(page, 1000);
    expect(frames).toBeGreaterThan(12);
    expect(frames).toBeLessThan(40);
    await backToBuilding(page).click();
    await expect.poll(() => named(page, "lived-in")).toBeNull();
    await bridge(page, (dh) => dh.waitForIdle());
    await page.waitForTimeout(600);
    expect(await framesOver(page, 2000)).toBe(0);
    // Tidy (View options): no details and no motion in Explore; remembered on this device.
    await page.getByRole("button", { name: /^(Plan v|V)iew options$/ }).locator("visible=true").first().click();
    await page.getByRole("switch", { name: /Lived-in details/ }).click();
    await page.keyboard.press("Escape");
    await homeAction(page, "Explore").click();
    await expect(backToBuilding(page)).toBeVisible();
    await bridge(page, (dh) => dh.waitForIdle());
    await page.waitForTimeout(500);
    expect(await named(page, "lived-in")).toBeNull();
    expect(await framesOver(page, 1000)).toBe(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("dream-home.preferences.v1") ?? "{}").livedIn)).toBe("tidy");
  });
});

test("the Photo studio has its own lived-in switch, and Diwali night brings diyas, lights and rangoli", async ({ page }) => {
  test.setTimeout(60000);
  await seedHome(page, lookHome("indian-modern", "Diwali Home"), { livedIn: "tidy" });
  await page.getByRole("button", { name: "View options" }).first().click();
  await page.getByRole("button", { name: "Take a photo" }).click();
  const studio = page.getByRole("dialog", { name: "Photo studio" });
  const lived = studio.getByRole("switch", { name: /Lived-in details/ });
  // It starts from the View options choice (tidy here).
  await expect(lived).toHaveAttribute("aria-checked", "false");
  await studio.getByRole("radio", { name: "Front", exact: true }).click();
  await studio.getByRole("radio", { name: "Diwali night", exact: true }).click();
  await expect.poll(() => named(page, "lived-in:bulbs"), { timeout: 15000 }).not.toBeNull();
  await expect.poll(() => named(page, "lived-in:rangoli")).not.toBeNull();
  // Everyday details join in when switched on.
  const before = (await named(page, "lived-in"))!.userData.pieces as number;
  await lived.click();
  await expect.poll(async () => ((await named(page, "lived-in"))?.userData.pieces as number) ?? 0).toBeGreaterThan(before);
  // Another mood: no Diwali set.
  await studio.getByRole("radio", { name: "Golden hour", exact: true }).click();
  await expect.poll(() => named(page, "lived-in:bulbs")).toBeNull();
});

// ---------------------------------------------------------------------------
// Screenshots (DH_SHOTS=1)
// ---------------------------------------------------------------------------
const shots = !!process.env.DH_SHOTS;
const LOOKS_DIR = "docs/screenshots/looks";
const LIFE_DIR = "docs/screenshots/lived-in";
test.describe("screenshots", () => {
  test.skip(!shots, "set DH_SHOTS=1 to capture screenshots");
  test.use({ reducedMotion: "no-preference" });
  test.beforeAll(() => {
    mkdirSync(LOOKS_DIR, { recursive: true });
    mkdirSync(LIFE_DIR, { recursive: true });
  });
  const looks = (process.env.DH_LOOKS?.split(",") as StylePreset[] | undefined) ?? LOOK_ORDER.filter((l) => l !== "diorama");
  for (const vp of [mobile, { width: 1440, height: 900 }])
    for (const look of looks)
      test(`look ${look} ${vp.width}`, async ({ page }) => {
        test.setTimeout(90000);
        await page.setViewportSize(vp);
        await seedHome(page, lookHome(look, "Look Home"), { quality: "beautiful" });
        await homeAction(page, "Explore").click();
        await expect(backToBuilding(page)).toBeVisible();
        for (const hour of ["Golden hour", "Night"] as const) {
          await page.getByRole("button", { name: hour, exact: true }).click();
          await page.waitForTimeout(1500);
          await bridge(page, (dh) => dh.waitForIdle());
          await page.waitForTimeout(1200);
          await page.screenshot({ path: `${LOOKS_DIR}/${look}-${vp.width}-${hour === "Night" ? "night" : "day"}.jpg`, type: "jpeg", quality: 82 });
        }
      });
  for (const vp of [mobile, { width: 1440, height: 900 }])
    test(`lived-in rooms and a Diwali photo ${vp.width}`, async ({ page }) => {
      test.setTimeout(180000);
      await page.setViewportSize(vp);
      await page.addInitScript(() => ((window as unknown as { __dreamHomePhotoTest: unknown }).__dreamHomePhotoTest = { longEdge: 1200, samples: 24 }));
      await seedHome(page, lookHome("kerala", "Lived-in Home"), { quality: "beautiful" });
      // Explore by day, then walking into the living room.
      await homeAction(page, "Explore").click();
      await page.getByRole("button", { name: "Golden hour", exact: true }).click();
      await page.waitForTimeout(1500);
      await bridge(page, (dh) => dh.waitForIdle());
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${LIFE_DIR}/explore-${vp.width}.jpg`, type: "jpeg", quality: 82 });
      // Render-quality photos: the ground floor opened up, and the front at Diwali.
      await page.getByRole("button", { name: /Take a photo|Photo/ }).first().click();
      const studio = page.getByRole("dialog", { name: "Photo studio" });
      for (const [framing, mood, file] of [
        ["Aerial", "Golden hour", "aerial-golden"],
        ["Front", "Diwali night", "front-diwali"],
        ["Aerial", "Diwali night", "aerial-diwali"],
      ] as const) {
        await studio.getByRole("radio", { name: framing, exact: true }).click();
        await studio.getByRole("radio", { name: mood, exact: true }).click();
        await studio.getByRole("button", { name: "Take photo" }).click();
        await expect(studio.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 90000 });
        const bytes = await page
          .getByRole("img", { name: /^Photo of/ })
          .evaluate(async (img: HTMLImageElement) => [...new Uint8Array(await (await fetch(img.src)).arrayBuffer())]);
        writeFileSync(`${LIFE_DIR}/${file}-${vp.width}.jpg`, Buffer.from(bytes));
        await studio.getByRole("button", { name: "Try another mood" }).click();
      }
      await studio.getByRole("button", { name: "Close photo studio" }).click();
      // Each room up close, as the Room camera frames it (the photo's size
      // doesn't depend on the window, so once is enough).
      if (vp.width < 1280) return;
      await backToBuilding(page).click();
      for (const room of ["Living / dining", "Kitchen", "Bedroom 1"]) {
        await enterRoom(page, room);
        await page.getByRole("button", { name: `Take a photo of ${room}` }).click();
        await expect(studio.getByRole("radio", { name: "Room" })).toHaveAttribute("aria-checked", "true");
        await studio.getByRole("radio", { name: "Morning", exact: true }).click();
        await studio.getByRole("button", { name: "Take photo" }).click();
        await expect(studio.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 90000 });
        const bytes = await page
          .getByRole("img", { name: /^Photo of/ })
          .evaluate(async (img: HTMLImageElement) => [...new Uint8Array(await (await fetch(img.src)).arrayBuffer())]);
        writeFileSync(`${LIFE_DIR}/room-${room.split(" ")[0].toLowerCase()}-${vp.width}.jpg`, Buffer.from(bytes));
        await studio.getByRole("button", { name: "Close photo studio" }).click();
      }
    });
});
