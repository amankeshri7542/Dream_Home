import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test, expect, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import { enterRoom, goHome, homeAction, mobile, roomTab, seed } from "./support/dreamHome";

// axe-core is injected as a plain script: its UMD bundle must not go through
// the test transpiler (node_modules is a symlink in this checkout).
const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

type AxeResult = {
  violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[];
};

// Automated accessibility checks for every mode on a phone and a desktop.
// Serious and critical findings fail; the 3D canvas itself is excluded.
async function audit(page: Page, label: string) {
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ content: AXE });
  const results = (await page.evaluate(() =>
    (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<unknown> } }).axe.run(
      { exclude: [["canvas"]] },
      { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } },
    ),
  )) as AxeResult;
  const serious = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(", ")}`);
  expect(serious, `${label} accessibility`).toEqual([]);
}

for (const [name, size] of [
  ["phone", mobile],
  ["desktop", { width: 1440, height: 1000 }],
] as const) {
  test(`home, every room tab, Outside and Explore pass automated accessibility checks on ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    const project = createPreset("compact");
    await seed(page, project);
    await audit(page, "home");
    await enterRoom(page, project.floors[0].rooms[0].name);
    for (const tab of ["Furniture", "Colours", "Layout", "Doors"]) {
      await roomTab(page, tab).click();
      await audit(page, `room ${tab}`);
    }
    await goHome(page);
    await homeAction(page, "Add room").click();
    await audit(page, "add room");
    await goHome(page);
    await homeAction(page, "Outside").click();
    await audit(page, "outside");
    await goHome(page);
    await homeAction(page, "Explore").click();
    await audit(page, "explore");
    await page.getByRole("button", { name: "Back to building" }).click();
  });
}

test("title screen and gallery pass automated accessibility checks", async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Start a new home/ })).toBeVisible();
  await audit(page, "title");
  await page.getByRole("button", { name: /Start a new home/ }).click();
  await expect(page.getByRole("dialog", { name: "Choose a starting home" })).toBeVisible();
  await audit(page, "gallery");
});
