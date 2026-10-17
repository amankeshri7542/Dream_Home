// M6: start from a builder's plan. A photo goes to /api/plan-read (mocked:
// tests never call the AI), the rooms come back onto the 2D plan over the
// photo, the homeowner fixes what's wrong, and "Make it 3D" builds the home.
// Without a reading, "Draw it yourself" starts from the photo and an empty house.
import { mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { mobile, noOverflow, renderedModel, stored } from "./support/dreamHome";

const shots = !!process.env.DH_SHOTS;
if (shots) mkdirSync("docs/screenshots/planread", { recursive: true });

const room = (label: string, kind: string, x: number, y: number, w: number, h: number, confidence = 0.9) => ({ label, kind, x, y, w, h, confidence });
const READING = {
  units: "ft",
  outline: { w: 26, h: 34 },
  outlineBox: { x: 0.12, y: 0.1, w: 0.76, h: 0.8 },
  rooms: [
    room("Living", "living", 0, 0, 0.6, 0.35),
    room("Kitchen", "kitchen", 0.6, 0, 0.4, 0.3),
    room("Dining", "dining", 0.6, 0.3, 0.4, 0.2),
    room("M. Bed", "bedroom", 0, 0.35, 0.6, 0.35),
    room("Toilet", "bathroom", 0.6, 0.5, 0.4, 0.15),
    room("Bed 2", "bedroom", 0, 0.7, 0.6, 0.3),
    room("Pooja", "pooja", 0.6, 0.65, 0.2, 0.15, 0.4),
    room("Store", "utility", 0.8, 0.65, 0.2, 0.15),
  ],
  doors: [],
  stairs: [],
  notes: "",
};

/** First visit: the title screen, with the tour already seen. */
async function firstVisit(page: Page) {
  await page.addInitScript(() => localStorage.setItem("dream-home.preferences.v1", JSON.stringify({ language: "en", unit: "ft", tourSeen: true })));
  await page.goto("/");
}

/** The plan reading API, mocked; records what was sent. */
async function mockReading(page: Page, { left = 1, answer = { ok: true, reading: READING, left: 0 } as unknown } = {}) {
  const sent: { type: string; bytes: number; query: string }[] = [];
  await page.route("**/api/plan-read**", async (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { ok: true, live: true, left } });
    sent.push({ type: req.headers()["content-type"], bytes: req.postDataBuffer()?.length ?? 0, query: new URL(req.url()).search });
    await route.fulfill({ json: answer });
  });
  return sent;
}

/** A plan-like drawing (outline, room lines, labels) as a JPEG, made in the page. */
async function planPhoto(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(1200, 900);
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#fbfaf4";
    g.fillRect(0, 0, 1200, 900);
    g.strokeStyle = "#222";
    g.lineWidth = 8;
    g.strokeRect(144, 90, 912, 720);
    g.lineWidth = 4;
    for (const [x0, y0, x1, y1] of [
      [691, 90, 691, 810],
      [144, 342, 691, 342],
      [144, 594, 691, 594],
      [691, 306, 1056, 306],
      [691, 450, 1056, 450],
      [691, 558, 1056, 558],
      [874, 558, 874, 666],
      [691, 666, 1056, 666],
    ]) {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
    g.fillStyle = "#222";
    g.font = "28px sans-serif";
    for (const [t, x, y] of [
      ["LIVING", 330, 220],
      ["KITCHEN", 800, 200],
      ["M. BED", 340, 470],
      ["BED 2", 350, 710],
      ["POOJA", 720, 620],
    ] as [string, number, number][])
      g.fillText(t, x, y);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  return Buffer.from(bytes);
}

async function choosePhoto(page: Page) {
  const photo = await planPhoto(page);
  await page.getByLabel("Choose a picture of your plan").setInputFiles({ name: "plan.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.getByRole("img", { name: "Your plan photo" })).toBeVisible();
}

test("from the first screen: a plan photo is read, checked, fixed and made 3D", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize(mobile);
  const sent = await mockReading(page);
  await firstVisit(page);
  await page.getByRole("button", { name: "Upload my builder’s plan" }).click();
  const steps = page.getByRole("dialog", { name: "A photo of your plan" });
  await expect(steps).toContainText("For a PDF, take a screenshot of the page.");
  await choosePhoto(page);
  await noOverflow(page);
  if (shots) await page.screenshot({ path: "docs/screenshots/planread/photo-390.png" });
  await page.getByRole("button", { name: "Next: my plot" }).click();
  await page.getByRole("radio", { name: "30 × 40 ft" }).click();
  await expect(page.getByRole("radio", { name: "Bottom" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Read my plan" }).click();

  // The check: the rooms on the 2D plan, the photo under them, the unsure one dashed.
  const check = page.getByRole("region", { name: "Check your plan" });
  await expect(check).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0].type).toBe("image/jpeg");
  expect(sent[0].bytes).toBeGreaterThan(5_000);
  expect(sent[0].bytes).toBeLessThan(1_500_000);
  expect(sent[0].query).toBe("?plot=30x40ft&road=bottom");
  const plan = page.getByRole("region", { name: "Floor plan" });
  await expect(plan.locator("image.plan-underlay")).toHaveCount(1);
  const home = await stored(page);
  expect(home.name).toBe("Home from my plan");
  expect(home.floors[0].rooms.map((r) => r.name).sort()).toEqual(
    ["Bathroom", "Bedroom 1", "Dining", "Kitchen", "Living room", "Main bedroom", "Pooja room", "Store"].sort(),
  );
  await noOverflow(page);
  if (shots) await page.screenshot({ path: "docs/screenshots/planread/check-390.png" });

  // The tools fold away to give the plan the screen, and come back.
  await check.getByRole("button", { name: "Hide the plan tools" }).click();
  await expect(check.getByRole("group", { name: "Line up the photo" })).toHaveCount(0);
  await check.getByRole("button", { name: "Show the plan tools" }).click();

  // Line the photo up a little.
  const x = Number(await plan.locator("image.plan-underlay").getAttribute("x"));
  await check.getByRole("button", { name: "Move the photo right" }).click();
  await expect.poll(async () => Number(await plan.locator("image.plan-underlay").getAttribute("x"))).toBeCloseTo(x + 20, 5);

  // The pooja room was unsure: check it, and call it a store room instead; Undo brings it back.
  await check.getByRole("button", { name: "Check Pooja room" }).click();
  const types = check.getByRole("group", { name: "What is Pooja room?" });
  await types.getByRole("button", { name: "Study" }).click();
  await expect.poll(async () => (await stored(page)).floors[0].rooms.some((r) => r.name === "Study")).toBe(true);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(async () => (await stored(page)).floors[0].rooms.some((r) => r.name === "Pooja room")).toBe(true);

  // Make it 3D: the plan closes and the home is built.
  await check.getByRole("button", { name: "Make it 3D" }).click();
  await expect(check).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Notifications" })).toContainText("Your plan is in 3D!");
  await renderedModel(page);
  const shelf = await page.evaluate(() => JSON.parse(localStorage.getItem("dream-home.homes.v1") ?? "null") as { homes: { name: string }[] });
  expect(shelf.homes.map((h) => h.name)).toContain("Home from my plan");
});

test("with the free reading used, draw it yourself over the photo", async ({ page }) => {
  test.setTimeout(60_000);
  const sent = await mockReading(page, { left: 0 });
  await firstVisit(page);
  await page.getByRole("button", { name: "Upload my builder’s plan" }).click();
  await choosePhoto(page);
  await page.getByRole("button", { name: "Next: my plot" }).click();
  await expect(page.getByText("Your free plan reading is used.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Read my plan" })).toHaveCount(0);
  await page.getByRole("button", { name: "Draw it yourself" }).click();
  const check = page.getByRole("region", { name: "Check your plan" });
  await expect(check).toContainText("Your photo is under the plan, ready to trace.");
  await expect(page.getByRole("region", { name: "Floor plan" }).locator("image.plan-underlay")).toHaveCount(1);
  expect((await stored(page)).floors[0].rooms).toEqual([]);
  expect(sent).toHaveLength(0);
  if (shots) await page.screenshot({ path: "docs/screenshots/planread/draw-1440.png" });
  // The empty house has one obvious next step.
  await check.getByRole("button", { name: "Add a room" }).click();
  await expect(page.getByRole("region", { name: "Add room" })).toBeVisible();
  // Already tracing a plan: no "start from a plan" link here.
  await expect(page.getByRole("button", { name: /Start a new home from a photo of it/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await check.getByRole("button", { name: "Make it 3D" }).click();
  await expect(check).toHaveCount(0);
});

test("when reading fails, it says so and drawing it yourself still works; also from Add room", async ({ page }) => {
  test.setTimeout(60_000);
  await mockReading(page, { answer: { ok: false, reason: "busy", message: "Couldn’t read the plan this time.", left: 1 } });
  const { seed } = await import("./support/dreamHome");
  const { createPreset } = await import("../src/domain/model");
  await seed(page, createPreset("compact"));
  await page.getByRole("toolbar", { name: "Home actions" }).getByRole("button", { name: /^Add room/ }).click();
  await page.getByRole("button", { name: /Start a new home from a photo of it/ }).click();
  await choosePhoto(page);
  await page.getByRole("button", { name: "Next: my plot" }).click();
  await page.getByRole("button", { name: "Read my plan" }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn’t read the plan this time. You can draw it yourself on the photo.");
  await page.getByRole("button", { name: "Draw it yourself" }).click();
  await expect(page.getByRole("region", { name: "Check your plan" })).toBeVisible();
  // The home that was open is safe on the shelf.
  const shelf = await page.evaluate(() => JSON.parse(localStorage.getItem("dream-home.homes.v1") ?? "null") as { homes: { name: string }[] });
  expect(shelf.homes.map((h) => h.name)).toEqual(expect.arrayContaining(["Home from my plan", createPreset("compact").name]));
});
