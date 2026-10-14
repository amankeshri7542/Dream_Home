// Shared helpers for the Dream Home end-to-end suite. UI changes should update
// these helpers rather than every call site.
import { expect, type Locator, type Page } from "@playwright/test";
import { createPreset } from "../../src/domain/model";
import type { Project } from "../../src/domain/types";

export const KEY = "dream-home.project.v2";
export const mobile = { width: 390, height: 844 };

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

export const tool = (page: Page, name: string) =>
  page
    .getByRole("toolbar", { name: "Building tools" })
    .getByRole("button", { name, exact: true });

/** The building palette's panels (My plot, Rooms) or View options. */
export const controls = (page: Page, name: string): Locator =>
  name === "View"
    ? page
        .getByRole("button", { name: /^(Plan v|V)iew options$/ })
        .locator("visible=true")
        .first()
    : tool(page, name);

export const history = (page: Page, name: "Undo" | "Redo") =>
  page
    .getByRole("toolbar", { name: "History" })
    .getByRole("button", { name: `${name} last change`, exact: true });
export const undo = async (page: Page) => history(page, "Undo").click();
export const redo = async (page: Page) => history(page, "Redo").click();

export const dock = (page: Page, name: string) =>
  page
    .getByRole("toolbar", { name: /actions$/ })
    .getByRole("button", { name, exact: true });

/** On phones a selection opens as a compact card; reveal its full details. */
export async function showDetails(page: Page) {
  const button = page.getByRole("button", { name: "Show details", exact: true });
  if (await button.isVisible().catch(() => false)) await button.click();
}

export async function closeDetails(page: Page) {
  for (const name of ["Close view options", "Close details"]) {
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
