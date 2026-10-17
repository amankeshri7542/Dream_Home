// M1: share links. A home is shared, opened by someone else in the light
// viewer, remixed into their own My homes, updated and stopped — against the
// real /api/share running on the dev server (in-memory storage there).
import { expect, test, type Page } from "@playwright/test";
import { createPreset } from "../src/domain/model";
import { mobile, renderedModel, seed, stored } from "./support/dreamHome";

const shelf = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("dream-home.homes.v1") ?? "null") as { homes: { name: string }[] });
const openShare = (page: Page) => page.getByRole("button", { name: "Share your home", exact: true }).click();

async function makeLink(page: Page) {
  await openShare(page);
  const sheet = page.getByRole("dialog", { name: "Share your home" });
  await sheet.getByRole("button", { name: "Make my link" }).click();
  const url = sheet.getByRole("textbox", { name: "Your home’s link" });
  await expect(url).toBeVisible({ timeout: 20_000 });
  return { sheet, url: await url.inputValue() };
}

test("share a home, open the link elsewhere, and remix it into your own homes", async ({ page, browser }) => {
  await page.setViewportSize(mobile);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const home = { ...createPreset("compact"), name: "Sharma Niwas" };
  await seed(page, home);
  await renderedModel(page);
  const { sheet, url } = await makeLink(page);
  expect(url).toMatch(/\/h\/[A-Za-z0-9]{10}$/);
  const id = url.split("/h/")[1];
  await expect(sheet.getByText("0 views")).toBeVisible();
  // The link remembers its picture for WhatsApp and friends.
  await expect.poll(async () => (await (await page.request.get(`/api/share/${id}`)).json()).meta.image).toBe(true);
  await sheet.getByRole("button", { name: "Copy", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await expect(page.getByRole("status", { name: "Notifications" })).toContainText("Link copied");
  await expect(sheet.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=See%20our%20dream%20home/);

  // Someone else, with a home of their own, opens the link.
  const friend = await browser.newContext({ viewport: mobile, reducedMotion: "reduce" });
  const visitor = await friend.newPage();
  const theirs = { ...createPreset("courtyard"), name: "Gupta House" };
  await seed(visitor, theirs);
  await visitor.goto(`/h/${id}`);
  await expect(visitor.getByRole("heading", { name: "Sharma Niwas", exact: true })).toBeVisible();
  await renderedModel(visitor);
  // Viewing never touches the visitor's own home.
  expect((await stored(visitor)).name).toBe("Gupta House");
  await visitor.getByRole("button", { name: "Remix this home" }).click();
  await visitor.waitForURL((u) => u.pathname === "/");
  await expect(visitor.getByRole("heading", { name: "Sharma Niwas (my version)", exact: true })).toBeVisible();
  await expect(visitor.getByRole("status", { name: "Notifications" })).toContainText("your own copy of Sharma Niwas");
  const remixed = await stored(visitor);
  expect(remixed.remixOf).toEqual({ id, name: "Sharma Niwas" });
  expect((await shelf(visitor)).homes.map((h) => h.name)).toEqual(["Sharma Niwas (my version)", "Gupta House"]);
  await friend.close();

  // The sharer sees the visit and the remix.
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await openShare(page);
  await expect(sheet.getByText("1 view")).toBeVisible();
  await expect(sheet.getByText("1 remix")).toBeVisible();
});

test("update the link after changes, then stop sharing it", async ({ page }) => {
  await page.setViewportSize(mobile);
  await seed(page, createPreset("compact"));
  const { sheet, url } = await makeLink(page);
  const id = url.split("/h/")[1];
  await expect(sheet.getByText("You’ve changed this home")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close dialog", exact: true }).click();

  // Rename the home, then the sheet offers to update the link.
  await page.getByRole("button", { name: "More options", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Home name" });
  await name.fill("Our New Name");
  await name.press("Enter");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await openShare(page);
  await sheet.getByRole("button", { name: "Update link" }).click();
  await expect(page.getByRole("status", { name: "Notifications" })).toContainText("Link updated");
  await expect.poll(async () => (await (await page.request.get(`/api/share/${id}`)).json()).project.name).toBe("Our New Name");

  // Stopping asks first, then the link no longer opens the home.
  await sheet.getByRole("button", { name: "Stop sharing this link" }).click();
  await sheet.getByRole("button", { name: "Keep sharing" }).click();
  await sheet.getByRole("button", { name: "Stop sharing this link" }).click();
  await sheet.getByRole("group", { name: "Stop sharing?" }).getByRole("button", { name: "Stop sharing" }).click();
  await expect(sheet.getByRole("button", { name: "Make my link" })).toBeVisible();
  expect((await page.request.get(`/api/share/${id}`)).status()).toBe(404);
  await page.goto(`/h/${id}`);
  await expect(page.getByRole("heading", { name: "This home isn’t available" })).toBeVisible();
  await page.getByRole("button", { name: "Design your own home" }).click();
  await page.waitForURL((u) => u.pathname === "/");
});

test("sharing offline explains itself and changes nothing", async ({ page }) => {
  await seed(page, createPreset("compact"));
  await page.route("**/api/share", (route) => route.abort());
  await openShare(page);
  const sheet = page.getByRole("dialog", { name: "Share your home" });
  await sheet.getByRole("button", { name: "Make my link" }).click();
  await expect(sheet.getByRole("alert")).toContainText("offline");
  await expect(sheet.getByRole("button", { name: "Make my link" })).toBeEnabled();
});

test("link previews get a tiny, safe page", async ({ request }) => {
  const created = await request.post("/api/share", {
    headers: { "x-dream-device": "device-0123456789abcdef", "content-type": "application/json" },
    data: { project: { ...createPreset("compact"), name: 'Nest "<b>" call 98765 43210' } },
  });
  const { id } = await created.json();
  const html = await (await request.get(`/api/og?id=${id}`)).text();
  expect(html).toContain('property="og:title" content="Nest &quot;b&quot; call — a home on Dream Home"');
  expect(html).toContain(`/h/${id}`);
  expect(html).not.toMatch(/<b>|98765/);
});

test("a viewer can report a home", async ({ page, request }) => {
  const created = await request.post("/api/share", {
    headers: { "x-dream-device": "device-0123456789abcdef", "content-type": "application/json" },
    data: { project: createPreset("compact") },
  });
  const { id } = await created.json();
  await page.goto(`/h/${id}`);
  await page.getByRole("button", { name: "More about this home" }).click();
  await page.getByRole("button", { name: "Report this home" }).click();
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();
});
