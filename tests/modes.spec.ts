import { test, expect } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import { createStarter } from "../src/domain/starters";
import { TEMPLATES, buildTemplate } from "../src/onboarding/templates";
import { dock, enterRoom, homeAction, mobile, roomTab, seed, stored, tool, undo } from "./support/dreamHome";

function family() {
  const result = createStarter(
    { widthCm: 914, depthCm: 1524, road: "south", marginCm: 60, bedrooms: 2, floors: 1 },
    "family",
  );
  if (!result.ok) throw new Error(result.error);
  return result.project;
}

test("decorate: add furniture, recolour it, paint the walls and undo", async ({ page }) => {
  await page.setViewportSize(mobile);
  const project = family();
  await seed(page, project);
  await tool(page, "Rooms").click();
  const living = project.floors[0].rooms.find((r) => r.kind === "living")!;
  await page.locator(".room-card").filter({ hasText: living.name }).click();
  await page.getByRole("button", { name: `Add floor plant to ${living.name}` }).click();
  await expect
    .poll(async () => (await stored(page)).floors[0].rooms.find((r) => r.id === living.id)?.furniture?.some((f) => f.catalogId === "plant-floor"))
    .toBe(true);
  // The new piece is selected; change the sofa colour instead via the room list.
  await page.getByRole("button", { name: `Back to ${living.name}` }).click();
  const sofa = page.locator(".dh-furniture-chip").filter({ hasText: /sofa|Loveseat/i }).first();
  await sofa.click();
  await page.getByRole("radiogroup", { name: "Colour" }).getByRole("radio", { name: "Navy" }).click();
  await expect
    .poll(async () =>
      (await stored(page)).floors[0].rooms
        .find((r) => r.id === living.id)
        ?.furniture?.some((f) => f.finish === "navy"),
    )
    .toBe(true);
  await page.getByRole("button", { name: `Back to ${living.name}` }).click();
  await roomTab(page, "Colours").click();
  await page.getByRole("radiogroup", { name: "Wall paint" }).getByRole("radio", { name: "Sage" }).click();
  await expect
    .poll(async () => (await stored(page)).floors[0].rooms.find((r) => r.id === living.id)?.wallColor)
    .toBe("sage");
  await undo(page);
  await expect
    .poll(async () => (await stored(page)).floors[0].rooms.find((r) => r.id === living.id)?.wallColor)
    .toBeUndefined();
});

test("doors & windows: restyle, slide, remove and add, then go back to automatic", async ({ page }) => {
  const project = createPreset("compact");
  await seed(page, project);
  const bedroom = project.floors[0].rooms.find((r) => r.kind === "bedroom")!;
  await enterRoom(page, bedroom.name);
  await roomTab(page, "Doors").click();
  await page.getByRole("list", { name: `Doors and windows of ${bedroom.name}` })
    .getByRole("listitem").filter({ hasText: /^Window/ }).first().click();
  await page.getByLabel("Opening style").selectOption("picture-window");
  await expect
    .poll(async () => (await stored(page)).floors[0].openings?.filter((o) => o.kind === "picture-window").length ?? 0)
    .toBe(1);
  const picture = (await stored(page)).floors[0].openings!.find((o) => o.kind === "picture-window")!;
  await page.getByRole("button", { name: "Slide forward" }).click();
  await expect
    .poll(async () => (await stored(page)).floors[0].openings!.find((o) => o.id === picture.id)?.center)
    .not.toBe(picture.center);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect
    .poll(async () => (await stored(page)).floors[0].openings!.some((o) => o.id === picture.id))
    .toBe(false);
  // The freed wall takes a new window (removing returns to the room's Doors tab).
  await page.getByRole("button", { name: /^Window A window/ }).click();
  await page.getByRole("button", { name: "Add window" }).click();
  await expect
    .poll(async () => (await stored(page)).floors[0].openings!.length)
    .toBeGreaterThan(0);
  // The new window opens on its own; back in the room, the Doors tab can reset them all.
  await page.getByRole("button", { name: `Back to ${bedroom.name}` }).click();
  await page.getByRole("button", { name: "Make doors & windows automatic" }).click();
  await page.getByRole("dialog", { name: /automatic/ }).getByRole("button", { name: "Make them automatic" }).click();
  await expect.poll(async () => (await stored(page)).floors[0].openings).toBeUndefined();
});

test("outside: roof, exterior, garden and fence choices persist", async ({ page }) => {
  await seed(page, family());
  await homeAction(page, "Outside").click();
  await page.getByRole("button", { name: "House style" }).click();
  await page.getByRole("button", { name: "Gable", exact: true }).click();
  await expect.poll(async () => (await stored(page)).style?.roof?.style).toBe("gable");
  await page.getByRole("radiogroup", { name: "Outside walls" }).getByRole("radio", { name: "Timber cladding" }).click();
  await expect.poll(async () => (await stored(page)).style?.exterior).toBe("timber");
  expect((await stored(page)).finish).toBe("brick");
  await page.getByRole("button", { name: "Garden", exact: true }).click();
  await page.getByRole("button", { name: "Add shade tree to the garden" }).click();
  await expect
    .poll(async () => (await stored(page)).landscape?.filter((l) => l.kind === "tree-oak").length ?? 0)
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Ground & fence", exact: true }).click();
  await page.getByRole("button", { name: "White picket" }).click();
  await expect.poll(async () => (await stored(page)).site?.fence).toBe("picket");
  const final = await stored(page);
  await page.reload();
  expect(await stored(page)).toEqual(final);
});

test("a full house can grow to fit a new room in one tap", async ({ page }) => {
  const bungalow = buildTemplate(TEMPLATES.find((t) => t.id === "bungalow")!);
  if (!bungalow.ok) throw new Error(bungalow.error);
  await seed(page, bungalow.project);
  const before = await stored(page);
  await homeAction(page, "Add room").click();
  const region = page.getByRole("region", { name: "Add room" });
  await region.locator(".catalog-card").filter({ hasText: "Fits if the house grows" }).first().click();
  const grow = region.getByRole("button", { name: /Grow house & add / });
  await expect(grow).toBeVisible();
  await grow.click();
  await expect
    .poll(async () => (await stored(page)).floors[0].rooms.length)
    .toBe(before.floors[0].rooms.length + 1);
  // The house grew into the garden to make room.
  const after = await stored(page);
  expect(after.floors[0].footprint.w * after.floors[0].footprint.d).toBeGreaterThan(
    before.floors[0].footprint.w * before.floors[0].footprint.d,
  );
});

test("the home checklist reports progress and offers fixes", async ({ page }) => {
  const project = createPreset("compact");
  // Take away the bathroom so a check is open.
  project.floors[0].rooms = project.floors[0].rooms.filter((r) => r.kind !== "bathroom");
  await seed(page, project);
  const pill = page.getByRole("button", { name: /Home checklist, \d+ of \d+ done/ });
  await expect(pill).toBeVisible();
  await pill.click();
  const list = page.getByRole("dialog", { name: "Home checklist" });
  await expect(list).toContainText("There’s a bathroom");
  await expect(list).toContainText("Friendly checks");
  // Adding the missing bathroom completes the list: a celebration invites exploring.
  await list.getByRole("listitem").filter({ hasText: "There’s a bathroom" }).getByRole("button").click();
  const region = page.getByRole("region", { name: "Add room" });
  await region.locator(".catalog-card").filter({ hasText: /^Bathroom/ }).first().click();
  await region.getByRole("button", { name: /^Add bathroom$|Grow house & add bathroom/i }).click();
  const party = page.getByRole("dialog", { name: "Ready to move in!" });
  await expect(party).toBeVisible();
  await expect(party.getByRole("button", { name: "Explore my home" })).toBeFocused();
  await party.getByRole("button", { name: "Explore my home" }).click();
  await expect(page.getByRole("button", { name: "Back to building" })).toBeVisible();
  await expect(party).toHaveCount(0);
});

test("a bedroom gets its own attached bathroom from the action bar, and undo removes it", async ({ page }) => {
  await page.setViewportSize(mobile);
  const project = createPreset("compact");
  await seed(page, project);
  const bedroom = project.floors[0].rooms.find((r) => r.kind === "bedroom")!;
  await enterRoom(page, bedroom.name);
  await dock(page, "More actions").click();
  await page.getByRole("menuitem", { name: "Add attached bathroom" }).click();
  await expect
    .poll(async () => (await stored(page)).floors[0].rooms.find((r) => r.attachedTo === bedroom.id)?.kind)
    .toBe("bathroom");
  await expect(page.getByRole("status", { name: "Notifications" })).toContainText("its own bathroom");
  // The option disappears once the bedroom has one.
  await dock(page, "More actions").click();
  await expect(page.getByRole("menuitem", { name: "Add attached bathroom" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await undo(page);
  await expect.poll(async () => (await stored(page)).floors[0].rooms.some((r) => r.attachedTo)).toBe(false);
});
