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
  await expect(page.getByRole("button", { name: /^Pick a ready home/ })).toBeVisible();
  await audit(page, "title");
  await page.getByRole("button", { name: /^Pick a ready home/ }).click();
  await expect(page.getByRole("dialog", { name: "Choose a starting home" })).toBeVisible();
  await audit(page, "gallery");
});

// M8: every sheet added in v5, on a phone and a desktop.
for (const [name, size] of [
  ["phone", mobile],
  ["desktop", { width: 1440, height: 1000 }],
] as const) {
  test(`v5 sheets pass automated accessibility checks on ${name}`, async ({ page, request }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    const project = createPreset("family");
    await seed(page, project);
    const close = () => page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Share your home", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Share your home" })).toBeVisible();
    await audit(page, "share sheet");
    await close();

    await page.getByRole("button", { name: "Talk to your home" }).first().click();
    await expect(page.getByRole("dialog", { name: "Talk to your home" })).toBeVisible();
    await audit(page, "talk sheet");
    await page.getByRole("button", { name: "Close talk" }).click();

    await page.getByRole("button", { name: /^Home score/ }).click();
    await expect(page.getByRole("dialog", { name: "Home score" })).toBeVisible();
    await audit(page, "home score and Vastu");
    await page.getByRole("button", { name: "Close home score" }).click();

    await page.getByRole("button", { name: "View options" }).first().click();
    await page.getByRole("button", { name: "Sunlight", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Sunlight" })).toBeVisible();
    await audit(page, "sunlight");
    await page.getByRole("button", { name: /^Close/ }).first().click();

    await page.getByRole("button", { name: "More options" }).click();
    await audit(page, "more (settings)");
    await page.getByRole("button", { name: /^My homes/ }).click();
    await audit(page, "my homes");
    await close();

    await homeAction(page, "Explore").click();
    await page.getByRole("button", { name: "Take a photo" }).first().click();
    await expect(page.getByRole("dialog", { name: "Photo studio" })).toBeVisible();
    await audit(page, "photo studio");
    await page.getByRole("button", { name: "Close photo studio" }).click();
    await page.getByRole("button", { name: "Make a video" }).first().click();
    await expect(page.getByRole("dialog", { name: "Video studio" })).toBeVisible();
    await audit(page, "video studio");
    await page.getByRole("button", { name: "Close video studio" }).click();

    // A shared home in the viewer.
    const created = await request.post("/api/share", {
      headers: { "x-dream-device": "device-0123456789abcdef", "content-type": "application/json" },
      data: { project },
    });
    const { id } = await created.json();
    await page.goto(`/h/${id}`);
    await expect(page.getByRole("button", { name: "Remix this home" })).toBeVisible();
    await audit(page, "viewer");
  });

  test(`starting from a builder's plan passes automated accessibility checks on ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.addInitScript(() => localStorage.setItem("dream-home.preferences.v1", JSON.stringify({ language: "en", unit: "ft", tourSeen: true })));
    await page.route("**/api/plan-read**", (route) => route.fulfill({ json: { ok: true, live: false, left: null } }));
    await page.goto("/");
    await page.getByRole("button", { name: "Upload my builder’s plan" }).click();
    await audit(page, "plan: photo step");
    const jpeg = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(800, 600);
      const g = canvas.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, 800, 600);
      g.strokeRect(100, 60, 600, 480);
      return [...new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg" })).arrayBuffer())];
    });
    await page.getByLabel("Choose a picture of your plan").setInputFiles({ name: "plan.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg) });
    await page.getByRole("button", { name: "Next: my plot" }).click();
    await audit(page, "plan: plot step");
    await page.getByRole("button", { name: "Draw it yourself" }).click();
    await expect(page.getByRole("region", { name: "Check your plan" })).toBeVisible();
    await audit(page, "plan: check");
  });
}
