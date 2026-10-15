// M3 "Indian homes by default": compound wall, Look presets, street life.
import { test, expect, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import { suggestBalcony } from "../src/domain/openSpaces";
import { withStylePreset } from "../src/domain/materials";
import { TEMPLATES, buildTemplate } from "../src/onboarding/templates";
import type { Project } from "../src/domain/types";
import { KEY, mobile, stored } from "./support/dreamHome";

type Obj = { name: string; userData: Record<string, unknown>; children: Obj[] };
type Bridge = {
  ready: boolean;
  frame: number;
  quality: string;
  waitForIdle: () => Promise<void>;
  renderer: () => { calls: number; triangles: number };
  scene: () => Obj & { getObjectByName: (n: string) => Obj | undefined };
};
const bridge = <T,>(page: Page, read: (dh: Bridge) => T | Promise<T>) =>
  page.evaluate(`(${read.toString()})(window.__dreamHome)`) as Promise<T>;
const ready = (page: Page) =>
  expect.poll(() => bridge(page, (dh) => dh?.ready ?? false), { timeout: 20000 }).toBe(true);
const named = (page: Page, name: string) =>
  page.evaluate((n) => {
    const dh = (window as unknown as { __dreamHome: Bridge }).__dreamHome;
    const o = dh.scene().getObjectByName(n);
    return o ? { name: o.name, userData: o.userData } : null;
  }, name);

/** A two-storey Indian modern home with parking, a garden and a balcony. */
function indianHome(id = "villa"): Project {
  const t = TEMPLATES.find((x) => x.id === id)!;
  const r = buildTemplate(t, { floors: 2 });
  if (!r.ok) throw new Error(r.error);
  const look = process.env.DH_LOOK as "indian-classic" | undefined;
  const base = look ? withStylePreset(r.project, look) : r.project;
  const home = { ...base, name: "Our Indian Home", parking: true, garden: true };
  const upper = home.floors[1];
  const b = upper ? suggestBalcony(home, upper.id, "south", 300, 120) : null;
  return b?.ok ? { ...b.project, name: home.name } : home;
}

/** Like `seed`, with a fixed quality tier (auto can resolve to battery headless). */
async function seedHome(page: Page, project: Project, quality = "balanced") {
  await page.addInitScript(
    ({ fixture, key, quality }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(fixture));
      localStorage.setItem("dream-home.preferences.v1", JSON.stringify({ language: "en", unit: "ft", tourSeen: true, quality }));
      sessionStorage.setItem("dream-home.session.v1", JSON.stringify({ titleDismissed: true }));
    },
    { fixture: project, key: KEY, quality },
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: project.name, exact: true })).toBeVisible({ timeout: 15000 });
  await ready(page);
}
const explore = (page: Page) =>
  page.getByRole("navigation", { name: "Modes" }).getByRole("button", { name: "Explore", exact: true });
const backToBuilding = (page: Page) => page.getByRole("button", { name: "Back to building" });
/** Rendered frames over `ms` while nothing is touched. */
async function framesOver(page: Page, ms: number) {
  const a = await bridge(page, (dh) => dh.frame);
  await page.waitForTimeout(ms);
  const b = await bridge(page, (dh) => dh.frame);
  return b - a;
}

test("compound wall with pillars and a gate renders for the Indian look", async ({ page }) => {
  await seedHome(page, indianHome());
  await expect.poll(() => named(page, "boundary-compound-wall")).not.toBeNull();
  const wall = await named(page, "boundary-compound-wall");
  expect(wall!.userData.gates).toBeGreaterThanOrEqual(1);
  expect(wall!.userData.pillars).toBeGreaterThan(8);
  // Old homes (no fence chosen) have no boundary at all.
  await page.evaluate((key) => localStorage.removeItem(key), KEY);
});

test("a chosen boundary renders in 3D (picket fence)", async ({ page }) => {
  await seedHome(page, { ...createPreset("compact"), site: { fence: "picket" } });
  await expect.poll(() => named(page, "boundary-picket")).not.toBeNull();
});

test("choosing a Look persists", async ({ page }) => {
  await page.setViewportSize(mobile);
  await seedHome(page, createPreset("compact"));
  await page.getByRole("navigation", { name: "Modes" }).getByRole("button", { name: "Outside", exact: true }).click();
  const style = page.getByRole("button", { name: /House style/ });
  if (await style.isVisible()) await style.click();
  const card = page.getByRole("group", { name: "Look" }).getByRole("button", { name: /Indian classic/ });
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(110);
  expect(box.width).toBeGreaterThanOrEqual(96);
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await stored(page))?.style?.preset).toBe("indian-classic");
  const saved = await stored(page);
  expect(saved.site?.fence).toBe("compound-wall");
  expect(saved.style?.details?.railing).toBe("jaali");
  await page.reload();
  await expect.poll(async () => (await stored(page))?.style?.preset).toBe("indian-classic");
  // Detail toggles save too.
  await page.getByRole("navigation", { name: "Modes" }).getByRole("button", { name: "Outside", exact: true }).click();
  if (await style.isVisible()) await style.click();
  await page.getByRole("switch", { name: /Water tank/ }).click();
  await expect.poll(async () => (await stored(page))?.style?.details?.waterTank).toBe(false);
});

test("street life stays off with reduced motion, and Build stays idle", async ({ page }) => {
  await seedHome(page, indianHome());
  await bridge(page, (dh) => dh.waitForIdle());
  expect(await framesOver(page, 2000)).toBe(0);
  await explore(page).click();
  await expect(backToBuilding(page)).toBeVisible();
  await bridge(page, (dh) => dh.waitForIdle());
  expect(await named(page, "street-life")).toBeNull();
  expect(await framesOver(page, 1000)).toBe(0);
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });
  test("street life animates only in Explore; Build has zero idle frames", async ({ page }) => {
    await page.setViewportSize(mobile);
    await seedHome(page, indianHome());
    await bridge(page, (dh) => dh.waitForIdle());
    await page.waitForTimeout(800);
    expect(await framesOver(page, 2000)).toBe(0);
    const build = await bridge(page, (dh) => dh.renderer().calls);
    await explore(page).click();
    await expect(backToBuilding(page)).toBeVisible();
    await expect.poll(() => named(page, "street-life"), { timeout: 10000 }).not.toBeNull();
    await expect.poll(() => named(page, "street-actors"), { timeout: 10000 }).not.toBeNull();
    // Let the Explore camera glide finish; then only street life draws (~24 fps).
    await bridge(page, (dh) => dh.waitForIdle());
    await page.waitForTimeout(500);
    const frames = await framesOver(page, 1000);
    expect(frames).toBeGreaterThan(12);
    expect(frames).toBeLessThan(40);
    const calls = await bridge(page, (dh) => dh.renderer().calls);
    console.log(`draw calls: build ${build}, explore+street ${calls}`);
    expect(build).toBeLessThanOrEqual(90);
    expect(calls).toBeLessThanOrEqual(160);
    // The View options switch turns it off.
    await backToBuilding(page).click();
    await expect.poll(() => named(page, "street-life")).toBeNull();
    await bridge(page, (dh) => dh.waitForIdle());
    await page.waitForTimeout(600);
    expect(await framesOver(page, 2000)).toBe(0);
    await page.getByRole("button", { name: /^(Plan v|V)iew options$/ }).locator("visible=true").first().click();
    await page.getByRole("switch", { name: /Street life/ }).click();
    await page.keyboard.press("Escape");
    await explore(page).click();
    await expect(backToBuilding(page)).toBeVisible();
    await page.waitForTimeout(500);
    expect(await named(page, "street-life")).toBeNull();
    // The choice is remembered on this device.
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("dream-home.preferences.v1") ?? "{}").streetLife),
    ).toBe(false);
  });
});

const shots = !!process.env.DH_SHOTS;
const SHOT_DIR = "docs/screenshots/indian";
test.describe("screenshots", () => {
  test.skip(!shots, "set DH_SHOTS=1 to capture screenshots");
  test.use({ reducedMotion: "no-preference" });
  for (const vp of [mobile, { width: 1440, height: 900 }])
    for (const hour of ["Golden hour", "Night"] as const)
      test(`indian modern ${vp.width} ${hour}`, async ({ page }) => {
        await page.setViewportSize(vp);
        await seedHome(page, indianHome(process.env.DH_TEMPLATE ?? "villa"), "beautiful");
        await explore(page).click();
        await page.getByRole("button", { name: hour, exact: true }).click();
        await page.mouse.move(vp.width / 2, vp.height * 0.4);
        for (let i = 0; i < Number(process.env.DH_ZOOM ?? 0); i++) await page.mouse.wheel(0, -60);
        await page.waitForTimeout(1500);
        await bridge(page, (dh) => dh.waitForIdle());
        await page.waitForTimeout(1500);
        const tag = hour === "Night" ? "night" : "golden";
        await page.screenshot({ path: `${SHOT_DIR}/home-${vp.width}-${tag}.jpg`, type: "jpeg", quality: 82 });
      });
  for (const vp of [mobile, { width: 1440, height: 900 }])
    test(`street life ${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await seedHome(page, indianHome(), "beautiful");
      await explore(page).click();
      await page.getByRole("button", { name: "Midday", exact: true }).click();
      await page.waitForTimeout(1500);
      await bridge(page, (dh) => dh.waitForIdle());
      // Swing low over the road.
      const c = { x: vp.width / 2, y: vp.height * 0.45 };
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await page.mouse.move(c.x + Number(process.env.DH_DX ?? -0.04) * vp.width, c.y + Number(process.env.DH_DY ?? -0.03) * vp.height, { steps: 8 });
      await page.mouse.up();
      for (let i = 0; i < Number(process.env.DH_ZOOM ?? 2); i++) await page.mouse.wheel(0, -60);
      await page.waitForTimeout(600);
      // Pan toward the road (right-drag trucks the camera).
      await page.mouse.move(c.x, c.y);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(c.x, c.y - Number(process.env.DH_PAN ?? 0.5) * vp.height, { steps: 8 });
      await page.mouse.up({ button: "right" });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${SHOT_DIR}/street-${vp.width}.jpg`, type: "jpeg", quality: 82 });
    });
  for (const vp of [mobile, { width: 1440, height: 900 }])
    test(`look cards ${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await seedHome(page, indianHome());
      await page.getByRole("navigation", { name: "Modes" }).getByRole("button", { name: "Outside", exact: true }).click();
      const style = page.getByRole("button", { name: /House style/ });
      if (await style.isVisible()) await style.click();
      await page.getByRole("group", { name: "Look" }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOT_DIR}/look-cards-${vp.width}.jpg`, type: "jpeg", quality: 82 });
    });
});
