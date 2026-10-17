// The v5 M8 usability review's P2 follow-ups: the tour after the build, a
// plain Home score chip, Photo and Video on Home, room markers and a rooms
// list, the home's name in the top bar, Vastu outside Undo, the viewer opened
// up, one way back, tooltips, desktop stacking and framing, and 44 px labels.
import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { homeChecks } from "../src/domain/advice";
import { createPreset } from "../src/domain/model";
import { createStarter } from "../src/domain/starters";
import { goHome, history, homeAction, mobile, noOverflow, renderedModel, seed, stored, undo } from "./support/dreamHome";

const desktop = { width: 1440, height: 900 };
const shots = !!process.env.DH_SHOTS;
if (shots) mkdirSync("docs/screenshots/usability", { recursive: true });
const shot = (page: Page, name: string) => shots && page.screenshot({ path: `docs/screenshots/usability/${name}.png` });
const scoreChip = (page: Page) => page.getByRole("button", { name: /^Home score \d+\. Home checklist/ });
const box = async (locator: Locator) => (await locator.boundingBox())!;
type Bounds = { x: number; y: number; width: number; height: number };
const modelBounds = (page: Page) =>
  page.evaluate(() => (window as unknown as { __dreamHome: { modelScreenBounds: () => Bounds } }).__dreamHome.modelScreenBounds());

/** The sample home ("Just show me a sample home"): crowded labels on a phone. */
function sampleHome() {
  const sample = createStarter({ widthCm: 914, depthCm: 1524, road: "south", marginCm: 60, bedrooms: 2, floors: 1 }, "family");
  if (!sample.ok) throw new Error(sample.error);
  return sample.project;
}

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });
  test("the first-run tour waits until the build and its Ta-da have finished", async ({ page }) => {
    await page.setViewportSize(mobile);
    await page.goto("/");
    await page.getByRole("button", { name: "Just show me a sample home" }).click();
    const reveal = page.locator(".dh-reveal");
    const tour = page.getByRole("dialog", { name: "Quick tour" });
    await expect(reveal).toBeVisible();
    await expect(tour).toHaveCount(0);
    await expect(reveal).toContainText("Ta-da", { timeout: 6000 });
    await expect(tour).toHaveCount(0);
    await expect(tour).toBeVisible({ timeout: 6000 });
    await expect(reveal).toHaveCount(0);
  });
});

test("the Home score chip says what it is and what to do next; done ideas get a tick", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const home = createPreset("compact");
  home.floors[0].rooms = home.floors[0].rooms.filter((r) => r.kind !== "bathroom");
  // One idea already tried: a painted wall.
  home.floors[0].rooms[0] = { ...home.floors[0].rooms[0], wallColor: "eucalyptus" };
  await seed(page, home);
  const chip = scoreChip(page);
  await expect(chip).toContainText("Home score");
  await expect(chip).toContainText("Next: Add a bathroom");
  await noOverflow(page);
  await chip.click();
  const card = page.getByRole("dialog", { name: "Home score" });
  const painted = card.getByRole("listitem").filter({ hasText: "Paint a wall" });
  await expect(painted.locator(".dh-check-mark svg")).toHaveClass(/lucide-check/);
  await card.getByRole("button", { name: "Close home score" }).click();

  // With every essential in place, the next step is the first idea not yet tried.
  const full = createPreset("compact");
  const next = homeChecks(full).quests.find((q) => !q.done)!;
  await page.evaluate((p) => localStorage.setItem("dream-home.project.v2", JSON.stringify(p)), full);
  await page.reload();
  await expect(scoreChip(page)).toContainText(`Next: ${{ furnish: "Furnish a room", paint: "Paint a wall", roof: "Choose a roof", ensuite: "Attach a bathroom", garden: "Plant a tree" }[next.id]}`);
});

for (const size of [mobile, desktop])
  test(`Photo and Video are one labelled tap from Home (${size.width} px)`, async ({ page }) => {
    await page.setViewportSize(size);
    await seed(page, createPreset("family"));
    const group = page.getByRole("group", { name: "Photo and video" });
    const photo = group.getByRole("button", { name: "Photo", exact: true });
    const video = group.getByRole("button", { name: "Video", exact: true });
    await expect(photo).toBeVisible();
    await expect(video).toBeVisible();
    await renderedModel(page);
    await shot(page, `home-${size.width}`);
    for (const b of [await box(photo), await box(video)]) expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
    await photo.click();
    const studio = page.getByRole("dialog", { name: "Photo studio" });
    await expect(studio).toBeVisible();
    await studio.getByRole("button", { name: "Close photo studio" }).click();
    await video.click();
    await expect(page.getByRole("dialog", { name: "Video studio" })).toBeVisible();
  });

test("room labels have a 44 px tap area; crowded rooms become markers that still open the room", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seed(page, sampleHome());
  await renderedModel(page);
  const labels = page.locator(".scene-room-label");
  await expect(labels.first()).toBeVisible();
  // Every visible label (full, name-only or marker) answers a finger 21 px from its middle.
  const reach = await labels.evaluateAll((els) =>
    els
      .filter((el) => getComputedStyle(el).visibility === "visible")
      .map((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2,
          cy = r.top + r.height / 2;
        const hits = [
          [cx, cy - 21],
          [cx, cy + 21],
          [cx - 21, cy],
          [cx + 21, cy],
        ].map(([x, y]) => document.elementFromPoint(x, y)?.closest(".scene-room-label"));
        // Where labels sit close together a neighbour may answer instead; any label is fine there.
        return hits.every((hit) => !!hit);
      }),
  );
  expect(reach.length).toBeGreaterThan(1);
  expect(reach.every(Boolean)).toBe(true);
  const marker = page.locator(".scene-room-label.is-marker").first();
  await expect(marker).toBeVisible();
  const name = (await marker.getAttribute("aria-label"))!.replace(/^Open /, "");
  await marker.click();
  await expect(page.getByRole("complementary", { name: `${name} studio` })).toBeVisible();
});

test("All rooms lists every floor's rooms, so rooms under the top floor are one tap away", async ({ page }) => {
  await page.setViewportSize(desktop);
  const home = createPreset("family");
  await seed(page, home);
  await renderedModel(page);
  const ground = home.floors[0];
  // "All floors" names only the top floor's rooms in the picture.
  await expect(page.locator(".scene-room-label").filter({ hasText: ground.rooms[0].name })).toHaveCount(0);
  await page.getByRole("button", { name: "All rooms" }).click();
  const list = page.getByRole("complementary", { name: "Rooms & spaces" });
  await expect(list.getByRole("heading", { name: "Ground floor" })).toBeVisible();
  await expect(list.getByRole("heading", { name: "Floor 1" })).toBeVisible();
  const room = ground.rooms.find((r) => r.kind === "kitchen")!;
  await list.getByRole("button", { name: new RegExp(`^${room.name}`) }).click();
  await expect(page.getByRole("complementary", { name: `${room.name} studio` })).toBeVisible();
});

test("the home's whole name fits the top bar on phones, with Saved as a dot and Redo only when it can redo", async ({ page }) => {
  await page.setViewportSize(mobile);
  await seed(page, { ...createPreset("compact"), name: "Our Family Home (my version)" });
  const name = page.getByRole("heading", { name: "Our Family Home (my version)", exact: true });
  await expect(name).toBeVisible();
  // Not clamped or cut: all of it is on screen, at 390 px and on a 360 px phone.
  const whole = () => name.evaluate((h) => h.scrollHeight <= h.clientHeight + 1 && h.scrollWidth <= h.clientWidth + 1);
  expect(await whole()).toBe(true);
  await page.setViewportSize({ width: 360, height: 740 });
  await expect.poll(whole).toBe(true);
  await page.setViewportSize(mobile);
  const saved = page.locator(".dh-save.is-saved");
  await expect(saved).toBeVisible();
  expect((await box(saved)).width).toBeLessThan(16);
  await expect(saved).toHaveAttribute("title", "Saved on this device");
  const redo = history(page, "Redo");
  await expect(redo).toBeHidden();
  // A quick change and Undo: now Redo is offered.
  await homeAction(page, "Outside").click();
  const style = page.getByRole("button", { name: /House style/ });
  if (await style.isVisible()) await style.click();
  await page.getByRole("group", { name: "Look" }).getByRole("button", { name: /^Kerala/ }).click();
  await goHome(page);
  await undo(page);
  await expect(redo).toBeVisible();
  await noOverflow(page);
});

test("at 320 px with Extra large text, the name gets its own row and the score chip stays clear of Photo and Video", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await seed(page, { ...createPreset("family"), name: "Our Family Home (my version)" });
  // After seed's own script, which writes the preferences on every load.
  await page.addInitScript(() => {
    const prefs = JSON.parse(localStorage.getItem("dream-home.preferences.v1") ?? "{}");
    localStorage.setItem("dream-home.preferences.v1", JSON.stringify({ ...prefs, textSize: "extra" }));
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-text", "extra");
  const name = page.getByRole("heading", { name: "Our Family Home (my version)", exact: true });
  expect(await name.evaluate((h) => h.scrollHeight <= h.clientHeight + 1 && h.scrollWidth <= h.clientWidth + 1)).toBe(true);
  const chip = await box(scoreChip(page));
  const capture = await box(page.getByRole("group", { name: "Photo and video" }));
  expect(chip.x + chip.width).toBeLessThanOrEqual(capture.x);
  await noOverflow(page);
  await renderedModel(page);
  await shot(page, "xl-320");
});

test("Vastu tips are a way of looking, not an edit: Undo leaves them on, and the facing question comes into view", async ({ page }) => {
  await page.setViewportSize(mobile);
  await seed(page, createPreset("family"));
  await scoreChip(page).click();
  const card = page.getByRole("dialog", { name: "Home score" });
  await card.getByRole("switch", { name: /Show Vastu tips/ }).click();
  await expect.poll(async () => (await stored(page)).vastu).toBe(true);
  await expect(history(page, "Undo")).toBeDisabled();
  const question = card.getByRole("radiogroup", { name: "Which way does your main door face?" });
  await expect(question).toBeVisible();
  await shot(page, "vastu-390");
  const q = await box(question),
    c = await box(card);
  expect(q.y).toBeGreaterThanOrEqual(c.y);
  expect(q.y + q.height).toBeLessThanOrEqual(c.y + c.height + 1);
  // Answering is a real change to the home (Undo takes it back); the tips stay on.
  await question.getByRole("radio", { name: "North", exact: true }).click();
  await expect(card).toContainText("/100");
  await undo(page);
  await expect.poll(async () => (await stored(page)).plot.compass).toBeFalsy();
  expect((await stored(page)).vastu).toBe(true);
});

for (const size of [mobile, desktop])
  test(`a shared home opens cut away with its rooms named, and a room's label walks you in (${size.width} px)`, async ({ page, request }) => {
    // A device of its own: a reused dev server keeps counting links per device (20 a day).
    const device = `device-viewer-${size.width}-${Date.now().toString(36)}`;
    const created = await request.post("/api/share", {
      headers: { "x-dream-device": device, "content-type": "application/json" },
      data: { project: { ...createPreset("family"), name: "Sharma Niwas" } },
    });
    expect(created.ok()).toBe(true);
    const { id } = await created.json();
    await page.setViewportSize(size);
    await page.goto(`/h/${id}`);
    await renderedModel(page);
    const labels = page.getByRole("button", { name: /^Walk into / });
    await expect(labels.first()).toBeVisible();
    const card = page.getByRole("region", { name: "Sharma Niwas" });
    if (size === desktop) {
      // Framed in the space beside the card, and big.
      const model = await modelBounds(page);
      const panel = await box(card);
      expect(model.x + model.width / 2).toBeGreaterThan(panel.x + panel.width);
      expect(model.width).toBeGreaterThan(size.width * 0.4);
    }
    await shot(page, `viewer-${size.width}`);
    const label = labels.first();
    const room = (await label.getAttribute("aria-label"))!.replace(/^Walk into /, "");
    await label.click();
    const back = page.getByRole("button", { name: "See the whole home" });
    await expect(back).toBeVisible();
    await expect(page.locator(".dh-walk-hint strong")).toHaveText(room);
    await back.click();
    await expect(card).toBeVisible();
  });

test("every way back says Home, with the same house", async ({ page }) => {
  await page.setViewportSize(mobile);
  await seed(page, createPreset("family"));
  await homeAction(page, "Explore").click();
  const back = page.getByRole("button", { name: "Back to home", exact: true });
  await expect(back).toHaveText("Home");
  await back.click();
  await homeAction(page, "Outside").click();
  await expect(page.getByRole("toolbar", { name: "Outside tools" }).getByRole("button", { name: "Back to home", exact: true })).toHaveText("Home");
});

test("desktop: icon buttons name themselves on hover, and Explore's are labelled", async ({ page }) => {
  await page.setViewportSize(desktop);
  await seed(page, createPreset("family"));
  await page.getByRole("button", { name: "View options" }).hover();
  const tip = page.locator(".dh-tooltip");
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText("View options");
  const t = await box(tip);
  expect(t.x).toBeGreaterThanOrEqual(0);
  expect(t.x + t.width).toBeLessThanOrEqual(desktop.width);
  await page.mouse.move(700, 450);
  await expect(tip).toBeHidden();
  await homeAction(page, "Explore").click();
  for (const [name, text] of [
    ["Take a photo", "Photo"],
    ["Make a video", "Video"],
    ["Picture quality", "Quality"],
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveText(text);
});

test("desktop: the Home score stops above the camera buttons, and Sunlight frames the home beside its panel", async ({ page }) => {
  await page.setViewportSize(desktop);
  await seed(page, createPreset("family"));
  await renderedModel(page);
  await scoreChip(page).click();
  const card = page.getByRole("dialog", { name: "Home score" });
  const hud = page.getByRole("toolbar", { name: "View controls" });
  expect((await box(card)).y + (await box(card)).height).toBeLessThanOrEqual((await box(hud)).y);
  expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/^rgb\(/);
  await card.getByRole("button", { name: "See it" }).click();
  const sheet = page.getByRole("dialog", { name: "Sunlight" });
  await expect(sheet).toBeVisible();
  const panel = sheet.locator(".dh-sun-panel");
  await expect
    .poll(async () => {
      const model = await modelBounds(page);
      return model.x + model.width / 2 < (await box(panel)).x && model.height > desktop.height * 0.4;
    })
    .toBe(true);
});
