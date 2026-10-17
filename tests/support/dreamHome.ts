// Shared helpers for the Dream Home end-to-end suite. UI changes should update
// these helpers rather than every call site.
import { expect, type Locator, type Page } from "@playwright/test";
import { createPreset } from "../../src/domain/model";
import type { Project } from "../../src/domain/types";

export const KEY = "dream-home.project.v2";
export const mobile = { width: 390, height: 844 };
/** A selection's action bar ("Living room actions"), not the Home bar. */
export const ROOM_ACTIONS = /^(?!Home actions$).+ actions$/;

export const stored = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null") as Project,
    KEY,
  );

/** Seeds a project and preferences, then waits for the workspace heading. */
export async function seed(
  page: Page,
  fixture: Project = createPreset("courtyard"),
  unit: "ft" | "m" = "ft",
) {
  await page.addInitScript(
    ({ fixture, unit, key }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(fixture));
      localStorage.setItem(
        "dream-home.preferences.v1",
        JSON.stringify({ language: "en", unit, tourSeen: true }),
      );
      sessionStorage.setItem(
        "dream-home.session.v1",
        JSON.stringify({ titleDismissed: true }),
      );
    },
    { fixture, unit, key: KEY },
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: fixture.name, exact: true }),
  ).toBeVisible();
}

/** Opens the app without a saved project, skipping the title screen. */
export async function freshVisit(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "dream-home.session.v1",
      JSON.stringify({ titleDismissed: true }),
    );
    const prefs = JSON.parse(
      localStorage.getItem("dream-home.preferences.v1") ?? "{}",
    );
    localStorage.setItem(
      "dream-home.preferences.v1",
      JSON.stringify({ ...prefs, tourSeen: true }),
    );
  });
  await page.goto("/");
}

/** Something a test can click: a button, or a short path through the UI to one. */
export type Action = { click(): Promise<void>; tap(): Promise<void> };
const action = (run: (how: "click" | "tap") => Promise<void>): Action => ({
  click: () => run("click"),
  tap: () => run("tap"),
});

/** One of the Home bar's big actions (Add room, Outside, Explore, Design with AI). */
export const homeAction = (page: Page, name: string) =>
  page
    .getByRole("toolbar", { name: "Home actions" })
    // "Add room, 2 kept for later" while rooms wait to be placed back.
    .getByRole("button", name === "Add room" ? { name: /^Add room(, \d+ kept for later)?$/ } : { name, exact: true });

/** Back to the Home level: out of a room, or back in from Outside. */
export async function goHome(page: Page) {
  const back = page.getByRole("button", { name: "Back to home", exact: true });
  if (await back.isVisible().catch(() => false)) await back.click();
  const house = page.getByRole("button", { name: "Back to the house", exact: true });
  if (await house.isVisible().catch(() => false)) await house.click();
  await expect(page.getByRole("toolbar", { name: "Home actions" }).first()).toBeVisible();
}

/** A Room Studio tab (Furniture, Colours, Layout, Doors). */
export const roomTab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

/** Opens a room as the hero by tapping its label in the picture. */
export async function enterRoom(page: Page, name: string) {
  await goHome(page);
  const label = page.locator(".scene-room-label").filter({ hasText: name }).first();
  // "All floors" labels only the top floor: step through the floors to find it.
  const floors = page.getByRole("radiogroup", { name: "Visible floor" }).getByRole("radio");
  if (!(await label.isVisible().catch(() => false)))
    for (const floor of await floors.all()) {
      await floor.click();
      if (await label.waitFor({ timeout: 2000 }).then(() => true, () => false)) break;
    }
  await label.click();
  await expect(page.getByRole("complementary", { name: `${name} studio` })).toBeVisible();
}

/** Opens the Add room sheet on one of its sides. */
async function addRoomSheet(page: Page, side: "Add new" | "Your rooms" | "For later", how: "click" | "tap") {
  await goHome(page);
  const add = homeAction(page, "Add room");
  if (how === "tap") await add.tap();
  else await add.click();
  const tab = page.getByRole("tablist", { name: "Rooms" }).getByRole("tab", { name: new RegExp(`^${side}`) });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
}

/**
 * The old building palette's tools, now reached through the Home bar or the
 * room's Layout tab: Add space, Rooms, Tray, My plot, Move, Edit in 2D.
 */
export const tool = (page: Page, name: string): Action =>
  action(async (how) => {
    if (name === "Add space" || name === "Add room") return addRoomSheet(page, "Add new", how);
    if (name === "Rooms") return addRoomSheet(page, "Your rooms", how);
    if (name === "Tray") return addRoomSheet(page, "For later", how);
    if (name === "My plot") {
      await goHome(page);
      await homeAction(page, "Outside").click();
      await page.getByRole("toolbar", { name: "Outside tools" }).getByRole("button", { name: "My plot", exact: true }).click();
      return;
    }
    if (name === "Undo last change") {
      await history(page, "Undo")[how]();
      return;
    }
    // Move and Edit in 2D live in the room's Layout tab.
    const button = await layoutButton(page, name);
    await button[how]();
  });

/** The building palette's panels (My plot, Rooms) or View options. */
export const controls = (page: Page, name: string): Locator | Action =>
  name === "View"
    ? page
        .getByRole("button", { name: /^(Plan v|V)iew options$/ })
        .locator("visible=true")
        .first()
    : tool(page, name);

/** A button in the selected room's action bar, opening the Layout tab first. */
async function layoutButton(page: Page, name: string) {
  const bar = page.getByRole("toolbar", { name: ROOM_ACTIONS });
  // Not in a room yet (the old palette worked on the whole floor): open the first one.
  const inRoom = await page.locator(".dh-studio").isVisible().catch(() => false);
  if (!inRoom && !(await bar.isVisible().catch(() => false))) {
    await addRoomSheet(page, "Your rooms", "click");
    await page.locator(".room-card").first().click();
  }
  if (!(await bar.isVisible().catch(() => false))) {
    const layout = roomTab(page, "Layout");
    if (await layout.isVisible().catch(() => false)) await layout.click();
  }
  return bar.getByRole("button", { name, exact: true });
}

export const history = (page: Page, name: "Undo" | "Redo") =>
  page
    .getByRole("toolbar", { name: "History" })
    .getByRole("button", { name: `${name} last change`, exact: true });
export const undo = async (page: Page) => history(page, "Undo").click();
export const redo = async (page: Page) => history(page, "Redo").click();

/** A button in the room's action bar (the Layout tab opens if needed). */
export const dock = (page: Page, name: string): Action & { locator: Locator } => {
  const locator = page.getByRole("toolbar", { name: ROOM_ACTIONS }).getByRole("button", { name, exact: true });
  return {
    locator,
    ...action(async (how) => {
      const button = await layoutButton(page, name);
      await button[how]();
    }),
  };
};

/** On phones a selection opens as a compact card; reveal its full details. */
export async function showDetails(page: Page) {
  const button = page.getByRole("button", { name: "Show details", exact: true });
  if (await button.isVisible().catch(() => false)) await button.click();
}

export async function closeDetails(page: Page) {
  for (const name of ["Close view options", "Close details", "Back to home"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return;
    }
  }
}

const floorIndex = (name: string) =>
  name === "Ground floor" ? 0 : Number(name.replace(/\D/g, ""));
export async function chooseFloor(page: Page, name: string) {
  const group = page.getByRole("radiogroup", { name: "Visible floor" });
  if (await group.isVisible().catch(() => false)) {
    await group.getByRole("radio", { name, exact: true }).click();
    return;
  }
  // With the floor plan open on a phone, floors step from the plan header.
  const title = page.locator(".dh-lens-title strong");
  for (let i = 0; i < 9; i++) {
    const current = (await title.textContent()) ?? "";
    if (current === name) return;
    const up = floorIndex(name) > floorIndex(current);
    await page
      .getByRole("button", { name: up ? "Floor above" : "Floor below", exact: true })
      .click();
  }
  await expect(title).toHaveText(name);
}

export async function openPlan(page: Page) {
  if (!(await page.locator(".plan-svg").isVisible().catch(() => false)))
    await page.getByRole("button", { name: "Floor plan", exact: true }).click();
  await expect(page.locator(".plan-svg")).toBeVisible();
}

export async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

export function planPoint(
  page: Page,
  bounds: { x: number; z: number; w: number; d: number },
) {
  return page.locator(".plan-svg").evaluate((element, b) => {
    const point = new DOMPoint(b.x + b.w / 2, b.z + b.d / 2).matrixTransform(
      (element as SVGSVGElement).getScreenCTM()!,
    );
    return { x: point.x, y: point.y };
  }, bounds);
}

/** Waits until a real 3D frame with the home is visible on the canvas. */
export async function renderedModel(page: Page) {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  await expect
    .poll(
      async () => {
        const bridge = await page.evaluate(() => {
          const dh = (window as unknown as { __dreamHome?: { ready?: boolean; modelScreenBounds?: () => { coverage: number } } }).__dreamHome;
          return dh?.ready && dh.modelScreenBounds
            ? dh.modelScreenBounds().coverage
            : null;
        });
        if (bridge !== null) return bridge;
        const png = (await canvas.screenshot()).toString("base64");
        return page.evaluate(async (encoded) => {
          const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
          const bitmap = await createImageBitmap(
            new Blob([bytes], { type: "image/png" }),
          );
          const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = surface.getContext("2d")!;
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          const { data } = context.getImageData(0, 0, surface.width, surface.height);
          let different = 0,
            samples = 0;
          for (let i = 0; i < data.length; i += 64) {
            samples++;
            if (
              Math.max(
                Math.abs(data[i] - data[0]),
                Math.abs(data[i + 1] - data[1]),
                Math.abs(data[i + 2] - data[2]),
              ) > 24
            )
              different++;
          }
          return different / samples;
        }, png);
      },
      { message: "A visible 3D model must render before capture", timeout: 15000 },
    )
    .toBeGreaterThan(0.025);
}

/** Waits until an element stops moving (layout settles after panels change). */
/** Waits until the measured bottom inset matches the bottom bar (it updates on the next frame). */
export async function settledInsets(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const app = document.querySelector<HTMLElement>(".dh-app")!;
        const bottom = document.querySelector<HTMLElement>("[data-inset=bottom]");
        const want = bottom ? innerHeight - bottom.getBoundingClientRect().top : 0;
        return Math.abs(parseFloat(getComputedStyle(app).getPropertyValue("--dh-inset-bottom")) - want) < 2;
      }),
    )
    .toBe(true);
}

export async function stableBox(locator: Locator) {
  let last = "";
  for (let i = 0; i < 20; i++) {
    const box = await locator.boundingBox();
    const key = JSON.stringify(box);
    if (box && key === last) return box;
    last = key;
    await locator.page().waitForTimeout(80);
  }
  return (await locator.boundingBox())!;
}
