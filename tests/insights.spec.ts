// M5 insights: the city picker and compass, the Sunlight sheet (season and
// time of day move the real sun), the Vastu card with a swap fix, the Home
// score ring and a badge celebration, and the city and score on a shared home.
import { mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { COMPASS8, northForFacing } from "../src/domain/compass";
import { createPreset } from "../src/domain/model";
import { setFacing, setLocation } from "../src/domain/place";
import type { EditResult, Project } from "../src/domain/types";
import { vastuReport } from "../src/insights/vastu";
import { enterRoom, homeAction, mobile, noOverflow, seed, stored, undo } from "./support/dreamHome";

type Light = { hour: number; sun: [number, number, number]; windowGlow: number };
type Bridge = { ready: boolean; frame: number; waitForIdle: () => Promise<void>; lighting: () => Light };
const bridge = <T,>(page: Page, read: (dh: Bridge) => T | Promise<T>) =>
  page.evaluate(`(${read.toString()})(window.__dreamHome)`) as Promise<T>;
const ok = (r: EditResult): Project => {
  if (!r.ok) throw new Error(r.error);
  return r.project;
};
async function framesOver(page: Page, ms: number) {
  const a = await bridge(page, (dh) => dh.frame);
  await page.waitForTimeout(ms);
  return (await bridge(page, (dh) => dh.frame)) - a;
}
const shots = !!process.env.DH_SHOTS;
if (shots) mkdirSync("docs/screenshots/insights", { recursive: true });

test("a city by its old name, then which way the home faces, both undoable", async ({ page }) => {
  await page.setViewportSize(mobile);
  const home = createPreset("compact");
  await seed(page, home);
  await homeAction(page, "Outside").click();
  await page.getByRole("toolbar", { name: "Outside tools" }).getByRole("button", { name: "My plot" }).click();
  const sheet = page.getByRole("complementary", { name: "Your plot" });
  const search = sheet.getByRole("searchbox", { name: "Find your city" });
  await search.scrollIntoViewIfNeeded();
  await search.fill("Bangalore");
  await sheet.getByRole("button", { name: /^Bengaluru/ }).click();
  await expect.poll(async () => (await stored(page)).plot.location).toEqual({ city: "Bengaluru", lat: 12.97, lon: 77.59 });
  await expect(page.getByRole("status", { name: "Notifications" })).toContainText("Bengaluru");
  await expect(sheet.getByText("13.0°N, 77.6°E")).toBeVisible();
  // The compass rose: the main door faces east.
  const rose = sheet.getByRole("radiogroup", { name: "Which way does your main door face?" });
  await rose.scrollIntoViewIfNeeded();
  for (const chip of await rose.getByRole("radio").all()) expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await rose.getByRole("radio", { name: "East", exact: true }).click();
  await expect.poll(async () => (await stored(page)).plot.compass).toBe(true);
  expect((await stored(page)).plot.north).toBe(northForFacing(home, "east"));
  await expect(rose.getByRole("radio", { name: "East", exact: true })).toHaveAttribute("aria-checked", "true");
  await noOverflow(page);
  if (shots) await page.screenshot({ path: "docs/screenshots/insights/plot-390.png" });
  await undo(page);
  await expect.poll(async () => (await stored(page)).plot.compass).toBeUndefined();
  await undo(page);
  await expect.poll(async () => (await stored(page)).plot.location).toBeUndefined();
});

test("Sunlight: the season and the time of day move the real sun, then everything goes back", async ({ page }) => {
  const home = ok(setFacing(ok(setLocation(createPreset("family"), { city: "Delhi", lat: 28.61, lon: 77.21 })), "south"));
  await seed(page, home);
  await expect.poll(() => bridge(page, (dh) => dh?.ready ?? false)).toBe(true);
  const before = await bridge(page, (dh) => dh.lighting());
  await page.getByRole("button", { name: "View options" }).first().click();
  await page.getByRole("button", { name: "Sunlight", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Sunlight" });
  await expect(sheet).toContainText("The real sun in Delhi, your home facing south.");
  const time = sheet.getByRole("slider", { name: "Time of day" });
  await time.fill("9");
  await expect(sheet.getByText("9 am", { exact: true })).toBeVisible();
  await sheet.getByRole("radio", { name: "Winter" }).click();
  await expect(sheet).toContainText(/Sunrise 7:(0[5-9]|1[0-4]) am/);
  await expect.poll(() => bridge(page, (dh) => dh.lighting().hour)).toBe(9);
  const winter = await bridge(page, (dh) => dh.lighting().sun);
  await sheet.getByRole("radio", { name: "Summer" }).click();
  await expect(sheet).toContainText("Sunrise 5:2");
  // The same 9 am stands higher in June.
  await expect.poll(async () => (await bridge(page, (dh) => dh.lighting().sun))[1]).toBeGreaterThan(winter[1] + 0.1);
  // Every room on the floor has its phrase; the shortcut buttons move the sun too.
  await expect(sheet.getByRole("list").first().getByRole("listitem")).not.toHaveCount(0);
  await expect(sheet).toContainText(/Morning sun|Afternoon sun|No direct sun|Sun /);
  await sheet.getByRole("button", { name: "Sunset" }).click();
  await expect.poll(() => bridge(page, (dh) => dh.lighting().hour)).toBeGreaterThan(18.5);
  if (shots) await page.screenshot({ path: "docs/screenshots/insights/sunlight-1440.png" });
  // Closing puts the hour back and the scene rests.
  await sheet.getByRole("button", { name: "Close sunlight" }).click();
  await expect.poll(() => bridge(page, (dh) => dh.lighting().hour)).toBe(before.hour);
  await bridge(page, (dh) => dh.waitForIdle());
  await page.waitForTimeout(800);
  expect(await framesOver(page, 2000)).toBe(0);
});

test("Sunlight in a room on a phone: the room comes first and everything fits", async ({ page }) => {
  await page.setViewportSize(mobile);
  const project = createPreset("compact");
  const room = project.floors[0].rooms.find((r) => r.kind === "bedroom")!;
  await seed(page, project);
  await enterRoom(page, room.name);
  await page.getByRole("button", { name: `Sunlight in ${room.name}` }).click();
  const sheet = page.getByRole("dialog", { name: "Sunlight" });
  // No city yet: it says so and offers the picker.
  await expect(sheet).toContainText("Pick your city");
  await expect(sheet.locator(".dh-sun-rooms li").first()).toContainText(room.name);
  await noOverflow(page);
  if (shots) await page.screenshot({ path: "docs/screenshots/insights/sunlight-room-390.png" });
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("complementary", { name: `${room.name} studio` })).toBeVisible();
});

test("Vastu: opt in from the Home score, read the tips, and swap a room; Undo puts it back", async ({ page }) => {
  // A home facing a way where a Vastu swap is on offer.
  const base = createPreset("family");
  const home = COMPASS8.map((f) => ok(setFacing(base, f))).find((p) => vastuReport(p, { withSwaps: true })!.rules.some((r) => r.swap))!;
  const swap = vastuReport(home, { withSwaps: true })!.rules.find((r) => r.swap)!.swap!;
  await seed(page, home);
  const ring = page.getByRole("button", { name: /^Home score \d+\. Home checklist/ });
  await ring.click();
  const card = page.getByRole("dialog", { name: "Home score" });
  const vastu = card.getByRole("region", { name: "Vastu" });
  await vastu.getByRole("switch", { name: /Show Vastu tips/ }).click();
  await expect.poll(async () => (await stored(page)).vastu).toBe(true);
  await expect(vastu).toContainText("/100");
  await expect(vastu).toContainText("Traditional Vastu guidance — tips, not rules.");
  await expect(card.locator(".dh-score-part")).toHaveCount(4);
  if (shots) await page.screenshot({ path: "docs/screenshots/insights/vastu-1440.png" });
  const kindOf = async (id: string) => (await stored(page)).floors.flatMap((f) => f.rooms).find((r) => r.id === id)!.kind;
  const sourceKind = await kindOf(swap.sourceId);
  await vastu.getByRole("button", { name: swap.label }).first().click();
  await expect.poll(() => kindOf(swap.targetId)).toBe(sourceKind);
  await expect(page.getByRole("status", { name: "Notifications" })).toContainText("Swapped!");
  await undo(page);
  await expect.poll(() => kindOf(swap.sourceId)).toBe(sourceKind);
});

test("Home score: a ring with a number, and a regional look earns a badge without getting in the way", async ({ page }) => {
  await page.setViewportSize(mobile);
  await seed(page, createPreset("compact"));
  const ring = page.getByRole("button", { name: /^Home score \d+\. Home checklist/ });
  await expect(ring.locator("svg text")).toHaveText(/^\d+$/);
  // Styled from the first load (its styles once lived only in a lazy chunk): a small ring, not a black disc.
  expect(await ring.locator("svg").evaluate((svg) => [svg.getBoundingClientRect().width, getComputedStyle(svg.querySelector("circle")!).fill])).toEqual([34, "none"]);
  await ring.click();
  const card = page.getByRole("dialog", { name: "Home score" });
  await expect(card.getByRole("heading", { name: /^Home score \d+$/ })).toBeVisible();
  await expect(card.locator(".dh-score-part")).toHaveCount(3);
  await expect(card.getByLabel("Not yet: Regional look", { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "Close home score" }).click();
  // Try a Kerala look.
  await homeAction(page, "Outside").click();
  const style = page.getByRole("button", { name: /House style/ });
  if (await style.isVisible()) await style.click();
  const looks = page.getByRole("group", { name: "Look" });
  await looks.scrollIntoViewIfNeeded();
  await looks.getByRole("button", { name: /^Kerala/ }).click();
  // The look's Undo comes first; the badge waits until it has gone, then never takes focus.
  const badge = page.getByRole("status").filter({ hasText: "Regional look" }).filter({ has: page.getByRole("heading") });
  await expect(page.getByRole("status").filter({ hasText: "Kerala look" }).getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(badge).toHaveCount(0);
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await expect(badge).toContainText("Your home wears a regional Indian look.");
  await expect(badge.getByRole("button", { name: "Nice!" })).not.toBeFocused();
  if (shots) await page.screenshot({ path: "docs/screenshots/insights/badge-390.png" });
  await badge.getByRole("button", { name: "Nice!" }).click();
  await expect(badge).toHaveCount(0);
});

test("a shared home shows its city and its Home score", async ({ page, request }) => {
  const home = { ...ok(setLocation(createPreset("compact"), { city: "Jaipur", lat: 26.91, lon: 75.79 })), name: "Pink City Home" };
  const created = await request.post("/api/share", {
    headers: { "x-dream-device": "device-0123456789abcdef", "content-type": "application/json" },
    data: { project: home, showCity: true },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  await page.goto(`/h/${id}`);
  const card = page.getByRole("region", { name: "Pink City Home" });
  await expect(card).toContainText("Jaipur");
  await expect(card.getByLabel(/^Home score \d+ out of 100$/)).toBeVisible();
  await expect(card).toContainText("Shared with family");
});
