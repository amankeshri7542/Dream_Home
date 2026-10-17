// The AI designer, with /api/design mocked: no real model calls in tests.
import { test, expect, type Page, type Route } from "@playwright/test";
import { createStarter } from "../src/domain/starters";
import type { HomeBrief } from "../src/ai/brief";
import { plannerHomePlan } from "../src/ai/planner";
import { mobile, noOverflow, roomTab, seed, stored, tool, undo } from "./support/dreamHome";

const brief: HomeBrief = {
  plot: { w: 30, d: 50 },
  facing: "north",
  family: "couple",
  bedrooms: 2,
  floors: "auto",
  musts: ["ensuite", "pooja", "parking", "vastu", "balcony"],
  vibe: "colourful",
};
const aiPlan = (name: string) => ({
  ...plannerHomePlan(brief, 1),
  name,
  notes: [`${name}: a sunny home for two.`, "The pooja room sits in the north-east."],
});

/** Mocks the design API; returns the POST bodies it received. */
async function mockApi(page: Page, answer: (body: { kind: string; variant: number }) => object, credits = { home: 3, room: 10 }) {
  const posts: { kind: string; brief: HomeBrief; variant: number }[] = [];
  await page.route("**/api/design", async (route: Route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ json: { ok: true, live: true, ...credits } });
    const body = request.postDataJSON();
    posts.push(body);
    expect(request.headers()["x-dream-device"]).toMatch(/^[a-z0-9-]{16,64}$/);
    await route.fulfill({ json: answer(body) });
  });
  return posts;
}

async function openDesigner(page: Page) {
  await page.setViewportSize(mobile);
  await page.goto("/");
  await page.getByRole("button", { name: /Design my home with AI/ }).click();
  return page.getByRole("dialog", { name: /Your plot/ });
}

test("designs a whole home from four taps, then tries another and undoes it", async ({ page }) => {
  const posts = await mockApi(page, ({ variant }) => ({ ok: true, source: "ai", left: 2 - variant, plan: aiPlan(variant ? "Second Take" : "Sunny Nest") }));
  const sheet = await openDesigner(page);
  await expect(sheet).toBeVisible();
  await sheet.getByRole("radio", { name: "30 × 50 ft" }).click();
  await sheet.getByRole("radio", { name: "North" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: /A couple/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Balcony" }).click();
  await expect(page.getByRole("button", { name: "Balcony" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: /Colourful/ }).click();
  await page.getByLabel("Anything else? (optional)").fill("A swing on the balcony");
  await expect(page.getByText("3 free AI designs left")).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button", { name: "Design my home" }).click();

  await expect(page.getByRole("heading", { name: "Sunny Nest", exact: true })).toBeVisible();
  expect(posts[0]).toMatchObject({ kind: "home", variant: 0, brief: { ...brief, note: "A swing on the balcony" } });
  const notes = page.getByRole("region", { name: "Designed for you" });
  await expect(notes).toBeVisible();
  await expect(notes.getByText("By the AI designer")).toBeVisible();
  await expect(notes.getByText("Sunny Nest: a sunny home for two.")).toBeVisible();

  const first = await stored(page);
  expect(first.name).toBe("Sunny Nest");
  expect(first.plot.north).toBe(180);
  expect(first.floors.length).toBeGreaterThanOrEqual(2);
  expect(first.floors.some((f) => f.balconies.length)).toBe(true);
  const rooms = first.floors.flatMap((f) => f.rooms);
  expect(rooms.some((r) => r.attachedTo)).toBe(true);
  expect(rooms.filter((r) => r.wallColor).length).toBeGreaterThan(3);

  await notes.getByRole("button", { name: "Try another" }).click();
  await expect(page.getByRole("heading", { name: "Second Take", exact: true })).toBeVisible();
  expect(posts[1].variant).toBe(1);
  await expect(page.getByRole("heading", { name: "Designed for you" })).toBeFocused();
  // Undo goes back to the first take; the second take's notes close with it.
  await undo(page);
  await expect(page.getByRole("heading", { name: "Sunny Nest", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Designed for you" })).toHaveCount(0);
});

test("after the free designs, the built-in planner still delivers a home", async ({ page }) => {
  await mockApi(page, () => ({ ok: false, reason: "limit", message: "Used up", left: 0 }), { home: 0, room: 4 });
  await openDesigner(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Free AI designs used")).toBeVisible();
  await page.getByRole("button", { name: "Design my home" }).click();
  const notes = page.getByRole("region", { name: "Designed for you" });
  await expect(notes.getByText("By Dream Home’s own designer")).toBeVisible();
  await notes.getByRole("button", { name: "Show all design notes" }).click();
  await expect(notes.getByText(/used your free AI designs/)).toBeVisible();
  await notes.getByRole("button", { name: "Keep it" }).click();
  await expect(notes).toHaveCount(0);
  const project = await stored(page);
  expect(project.floors.flatMap((f) => f.rooms).some((r) => /pooja/i.test(r.name))).toBe(true);
});

test("works offline: no server, still a finished home", async ({ page }) => {
  await page.route("**/api/design", (route) => route.abort());
  await openDesigner(page);
  await expect(page.getByText("Dream Home’s free designer")).toHaveCount(0);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Dream Home’s free designer")).toBeVisible();
  await page.getByRole("button", { name: "Design my home" }).click();
  await expect(page.getByRole("region", { name: "Designed for you" }).getByText("By Dream Home’s own designer")).toBeVisible();
});

test("“Make it nice” restyles one room as one undoable step", async ({ page }) => {
  await page.setViewportSize(mobile);
  const result = createStarter({ widthCm: 914, depthCm: 1524, road: "south", marginCm: 60, bedrooms: 2, floors: 1 }, "family");
  if (!result.ok) throw new Error(result.error);
  const project = result.project;
  const posts = await mockApi(page, () => ({
    ok: true,
    source: "ai",
    left: 9,
    plan: { paint: "eucalyptus", floor: "terrazzo", fabric: "mustard", wood: "walnut", accent: "terracotta", layout: "fresh", extras: ["plant-floor", "rug-round"], notes: ["Eucalyptus walls and mustard cushions."] },
  }));
  await seed(page, project);
  // Open the living room from "Your rooms"; it becomes the hero, on its Furniture tab.
  await tool(page, "Rooms").click();
  const living = project.floors[0].rooms.find((r) => r.kind === "living")!;
  await page.locator(".room-card").filter({ hasText: living.name }).click();
  await expect(roomTab(page, "Furniture")).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Makeover style").selectOption("colourful");
  await page.getByRole("button", { name: "Make it nice" }).click();
  const room = async () => (await stored(page)).floors[0].rooms.find((r) => r.id === living.id)!;
  await expect.poll(async () => (await room()).wallColor).toBe("eucalyptus");
  expect(posts[0]).toMatchObject({ kind: "room", brief: { kind: "living", vibe: "colourful" } });
  const after = await room();
  expect(after.floorMaterial).toBe("terrazzo");
  expect(after.furniture?.some((i) => i.catalogId === "rug-round")).toBe(true);
  expect(after.furniture?.some((i) => i.finish === "mustard")).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Eucalyptus walls and mustard cushions." }).first()).toBeVisible();
  await undo(page);
  await expect.poll(async () => (await room()).wallColor).toBeUndefined();
});

test("the brief works from the keyboard", async ({ page }) => {
  await page.route("**/api/design", (route) => route.abort());
  const sheet = await openDesigner(page);
  const plot = sheet.getByRole("radiogroup", { name: "Plot size" });
  // One Tab stop per group: the chosen option.
  await expect(plot.getByRole("radio", { name: "30 × 40 ft" })).toHaveAttribute("tabindex", "0");
  await expect(plot.getByRole("radio", { name: "30 × 50 ft" })).toHaveAttribute("tabindex", "-1");
  await plot.getByRole("radio", { name: "30 × 40 ft" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(plot.getByRole("radio", { name: "30 × 50 ft" })).toHaveAttribute("aria-checked", "true");
  await expect(plot.getByRole("radio", { name: "30 × 50 ft" })).toBeFocused();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("dialog", { name: /Who lives here/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /Your plot/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /Your plot/ })).toHaveCount(0);
});

test("a 20 × 40 plot gently says how many bedrooms fit", async ({ page }) => {
  await page.route("**/api/design", (route) => route.abort());
  const sheet = await openDesigner(page);
  await sheet.getByRole("radio", { name: "20 × 40 ft" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: /Joint family/ }).click();
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "More bedrooms" }).click();
  await page.getByRole("radiogroup", { name: "Floors" }).getByRole("radio", { name: "1" }).click();
  await expect(page.getByText(/A 20 × 40 ft plot fits about \d bedroom/)).toBeVisible();
});
