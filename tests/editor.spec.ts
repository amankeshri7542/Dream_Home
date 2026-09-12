import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createPreset } from '../src/domain/model';
import type { Project } from '../src/domain/types';

const KEY = 'dream-home.project.v1';
const mobile = { width: 390, height: 844 };
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null') as Project, KEY);
const controls = (page: Page, name: string) => page.getByRole('navigation', { name: 'Home controls' }).getByRole('button', { name, exact: true });
const undo = async (page: Page) => {
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
};
async function seed(page: Page, fixture = createPreset('courtyard'), unit: 'ft' | 'm' = 'ft') {
  await page.addInitScript(({ fixture, unit, key }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(fixture));
    localStorage.setItem('dream-home.preferences.v1', JSON.stringify({ language: 'en', unit }));
  }, { fixture, unit, key: KEY });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: fixture.name, exact: true })).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
async function renderedModel(page: Page) {
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  // Canvas attachment precedes the first WebGL frame. Inspect screenshot pixels,
  // not the drawing buffer (which is deliberately cleared between demand frames).
  await expect.poll(async () => {
    const png = (await canvas.screenshot()).toString('base64');
    return page.evaluate(async encoded => {
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = surface.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const { data } = context.getImageData(0, 0, surface.width, surface.height);
      let different = 0, samples = 0;
      for (let i = 0; i < data.length; i += 64) {
        samples++;
        if (Math.max(Math.abs(data[i] - data[0]), Math.abs(data[i + 1] - data[1]), Math.abs(data[i + 2] - data[2])) > 24) different++;
      }
      return different / samples;
    }, png);
  }, { message: 'A visible 3D model must replace the blank canvas before capture' }).toBeGreaterThan(.025);
}
async function start(page: Page) {
  await page.getByRole('button', { name: 'Start with my plot', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Start your home' })).toBeVisible();
}
async function importFixture(page: Page, project: Project) {
  await page.locator('input[type=file]').setInputFiles({ name: 'legacy-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
}

for (const [width, depth] of [[20, 40], [30, 50]]) {
  test(`mobile guided ${width} × ${depth} ft keeps requested bedrooms, floors and saved dimensions`, async ({ page }) => {
    await page.setViewportSize(mobile);
    await page.goto('/');
    if (width === 20) {
      await renderedModel(page);
      await page.screenshot({ path: 'test-results/default-390.png' });
    }
    await start(page);
    await page.getByRole('button', { name: `${width} × ${depth} ft`, exact: true }).click();
    await page.getByRole('button', { name: 'Next: my needs', exact: true }).click();
    await page.getByRole('button', { name: '2 bedrooms', exact: true }).click();
    await page.getByRole('button', { name: /Ground floor only/ }).click();
    await page.getByRole('button', { name: 'See my options', exact: true }).click();
    await page.locator('.recommendation:not([disabled])').first().click();
    if (width === 20) await page.screenshot({ path: 'test-results/recommendations-390.png' });
    await page.getByRole('button', { name: 'Make this my starting home', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => (await stored(page)).plot.width).toBe(Math.round(width * 30.48));
    const project = await stored(page);
    expect(project.plot.depth).toBe(Math.round(depth * 30.48));
    expect(project.floors).toHaveLength(1);
    expect(project.floors.flatMap(f => f.rooms).filter(r => r.kind === 'bedroom')).toHaveLength(2);
    await noOverflow(page);
    await page.reload();
    expect(await stored(page)).toEqual(project);
    await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
  });
}

test('cancelling guided setup preserves the current home', async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.goto('/');
  await expect.poll(async () => !!(await stored(page))).toBe(true);
  const before = await stored(page);
  await start(page);
  await page.getByRole('button', { name: '40 × 60 ft', exact: true }).click();
  await page.getByRole('button', { name: 'Next: my needs', exact: true }).click();
  await page.getByRole('button', { name: '3 bedrooms', exact: true }).click();
  await page.getByRole('button', { name: 'Close setup', exact: true }).click();
  expect(await stored(page)).toEqual(before);
});

test('Hindi translates the guided flow, room tools and plan without overflow', async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to Hindi', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await page.getByRole('button', { name: 'मेरे प्लॉट से शुरू करें', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'आपका प्लॉट कितना बड़ा है?' })).toBeVisible();
  await page.getByRole('button', { name: 'अगला: मेरी ज़रूरतें', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'आपके घर में क्या होना चाहिए?' })).toBeVisible();
  await page.getByRole('button', { name: 'मेरे विकल्प देखें', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'एक पसंद से शुरुआत करें।' })).toBeVisible();
  await noOverflow(page);
  await page.getByRole('button', { name: 'सेटअप बंद करें', exact: true }).click();
  await page.getByRole('button', { name: 'नक्शा', exact: true }).click();
  await page.getByRole('navigation', { name: 'घर के कंट्रोल' }).getByRole('button', { name: 'कमरे', exact: true }).click();
  await page.locator('.room-card').filter({ hasText: 'रसोई' }).click();
  await expect(page.getByRole('spinbutton', { name: 'कमरे की चौड़ाई', exact: true })).toBeVisible();
  await expect(page.locator('.plan-svg')).toContainText('सड़क');
  await noOverflow(page);
});

test('feet/metres stay coherent and invalid plot changes preserve the home', async ({ page }) => {
  await page.setViewportSize(mobile);
  await seed(page);
  await controls(page, 'My plot').click();
  const width = page.getByRole('spinbutton', { name: 'Plot width', exact: true });
  await width.fill('65');
  await width.press('Enter');
  await expect.poll(async () => (await stored(page)).plot.width).toBe(1981);
  await page.getByRole('button', { name: 'm', exact: true }).click();
  await expect(width).toHaveValue('19.8');
  const before = await stored(page);
  await width.fill('4');
  await width.press('Enter');
  await expect(page.getByRole('alert')).toContainText(/setback|inside|boundary/i);
  expect(await stored(page)).toEqual(before);
  await expect(width).toHaveValue('19.8');
  await page.getByLabel('Road is on this side').selectOption('east');
  await expect.poll(async () => (await stored(page)).plot.road).toBe('east');
});

test('room list editing updates plan, undo/redo and persisted dimensions', async ({ page }) => {
  await page.setViewportSize(mobile);
  await seed(page, createPreset('courtyard'), 'm');
  await page.getByRole('button', { name: 'Floor plan', exact: true }).click();
  await controls(page, 'Rooms').click();
  await page.locator('.room-card').filter({ hasText: 'Living room' }).click();
  const width = page.getByRole('spinbutton', { name: 'Room width', exact: true });
  await width.fill('4');
  await width.press('Enter');
  await expect(width).toHaveValue('4');
  await expect(page.locator('.plan-room').first()).toContainText('4 × 4.7 m');
  await undo(page);
  await expect(width).toHaveValue('4.5');
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(width).toHaveValue('4');
  await width.fill('9');
  await width.press('Enter');
  await expect(page.getByRole('alert')).toContainText(/overlap/i);
  await expect(width).toHaveValue('4');
  await page.reload();
  expect((await stored(page)).floors[0].rooms[0].bounds.w).toBe(400);
});

test('legacy version-one JSON imports and backup roundtrips; malformed files preserve the home', async ({ page }) => {
  await page.goto('/');
  const legacy = createPreset('compact');
  await importFixture(page, legacy);
  expect(await stored(page)).toEqual(legacy);
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('dream-home.json');
  expect(JSON.parse(await readFile((await download.path())!, 'utf8'))).toEqual(legacy);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByRole('status')).toContainText('not valid JSON');
  expect(await stored(page)).toEqual(legacy);
});

test('actual 3D picking, orbit and construction views render without service requests', async ({ page }) => {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().startsWith('http') && new URL(r.url()).hostname !== 'localhost') external.push(r.url()); });
  await seed(page);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.getByLabel('Visible floor').selectOption('floor-0');
  await controls(page, 'View').click();
  await page.getByRole('switch', { name: 'Room names', exact: true }).click();
  await page.getByRole('button', { name: 'Close controls', exact: true }).click();
  const label = page.locator('.scene-room-label').filter({ hasText: 'Kitchen' });
  await expect(label).toBeVisible();
  await canvas.screenshot();
  const labelBox = (await label.boundingBox())!;
  await page.mouse.click(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
  await expect(page.getByRole('spinbutton', { name: 'Room width', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Kitchen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close controls', exact: true }).click();
  const box = (await canvas.boundingBox())!;
  const before = await canvas.screenshot();
  await page.mouse.move(box.x + box.width * .65, box.y + box.height * .65);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .8, box.y + box.height * .55, { steps: 8 });
  await page.mouse.up();
  expect(before.equals(await canvas.screenshot())).toBe(false);
  await page.mouse.wheel(0, -150);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await page.getByLabel('Visible floor').selectOption('all');
  await controls(page, 'View').click();
  await page.getByText('How a home takes shape', { exact: true }).click();
  const stages = page.getByRole('group', { name: 'Construction stage' });
  await stages.getByRole('button', { name: /Roof/ }).click();
  await expect(page.getByRole('switch', { name: 'Show the roof', exact: true })).toHaveAttribute('aria-checked', 'true');
  const roof = await canvas.screenshot();
  await stages.getByRole('button', { name: /Frame/ }).click();
  expect(roof.equals(await canvas.screenshot())).toBe(false);
  await page.getByText('More view controls', { exact: true }).click();
  await page.getByRole('switch', { name: 'Walls', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Walls', exact: true })).toHaveAttribute('aria-checked', 'false');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('mobile plan taps never move rooms; explicit dragging commits after pointer release', async ({ page }) => {
  await page.setViewportSize(mobile);
  const fixture = createPreset('courtyard');
  fixture.floors[0].rooms[0].bounds.w = 350;
  await seed(page, fixture, 'm');
  await page.getByRole('button', { name: 'Floor plan', exact: true }).click();
  const rect = page.locator('.plan-room').first().locator('rect');
  await rect.click();
  await expect(page.getByRole('spinbutton', { name: 'Room width', exact: true })).toBeVisible();
  expect((await stored(page)).floors[0].rooms[0].bounds).toEqual(fixture.floors[0].rooms[0].bounds);
  await page.getByRole('button', { name: 'Close controls', exact: true }).click();
  async function dragRoom(commit: boolean) {
    const box = (await rect.boundingBox())!;
    const scale = await page.locator('.plan-svg').evaluate(el => (el as SVGSVGElement).getScreenCTM()!.a);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.locator('.home-app')).not.toHaveClass(/panel-open/);
    await page.mouse.move(box.x + box.width / 2 + 80 * scale, box.y + box.height / 2, { steps: 4 });
    await expect(page.locator('.home-app')).not.toHaveClass(/panel-open/);
    await page.mouse.up();
    if (commit) await expect.poll(async () => (await stored(page)).floors[0].rooms[0].bounds.x).toBe(fixture.floors[0].rooms[0].bounds.x + 80);
  }
  await dragRoom(false);
  expect((await stored(page)).floors[0].rooms[0].bounds.x).toBe(fixture.floors[0].rooms[0].bounds.x);
  await page.getByRole('button', { name: 'Move rooms', exact: true }).click();
  await dragRoom(true);
  await undo(page);
  expect((await stored(page)).floors[0].rooms[0].bounds.x).toBe(fixture.floors[0].rooms[0].bounds.x);
});

test('key mobile controls are 44px and remain within 360, 390 and 430px screens', async ({ page }) => {
  await page.goto('/');
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    if (width === 360) {
      await renderedModel(page);
      await page.screenshot({ path: 'test-results/default-360.png' });
    }
    await noOverflow(page);
    for (const button of [controls(page, 'My plot'), controls(page, 'Rooms'), controls(page, 'View'), page.getByRole('button', { name: 'Reset view', exact: true }), page.getByRole('button', { name: 'Share home plan', exact: true })]) {
      const box = (await button.boundingBox())!;
      expect(box.width, `${await button.getAttribute('aria-label')} width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${await button.getAttribute('aria-label')} height`).toBeGreaterThanOrEqual(44);
    }
  }
  await page.getByRole('button', { name: 'Floor plan', exact: true }).click();
  const svg = page.locator('.plan-svg');
  const original = await svg.getAttribute('viewBox');
  await page.getByRole('button', { name: 'Zoom in on plan', exact: true }).click();
  await expect(svg).not.toHaveAttribute('viewBox', original!);
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect(svg).toHaveAttribute('viewBox', original!);
  async function controlsDoNotOverlap() {
    const movement = (await page.getByRole('button', { name: 'Move rooms', exact: true }).boundingBox())!;
    for (const tool of await page.locator('.plan-tools button').all()) {
      const box = (await tool.boundingBox())!;
      const overlap = Math.min(movement.x + movement.width, box.x + box.width) > Math.max(movement.x, box.x) && Math.min(movement.y + movement.height, box.y + box.height) > Math.max(movement.y, box.y);
      expect(overlap, 'Plan zoom controls must not cover the Move rooms action').toBe(false);
    }
  }
  await controlsDoNotOverlap();
  await controls(page, 'Rooms').click();
  await noOverflow(page);
  await controlsDoNotOverlap();
  await page.screenshot({ path: 'test-results/workspace-mobile.png' });
});

test('PNG export is a real image and native sharing is safely mocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { (window as unknown as { sharedPlan: { count: number; type?: string } }).sharedPlan = { count: data.files?.length ?? 0, type: data.files?.[0].type }; } });
  });
  await page.goto('/');
  await renderedModel(page);
  await page.screenshot({ path: 'test-results/default-desktop.png' });
  await page.getByRole('button', { name: 'Share home plan', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Preview of the exported home plans' })).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download plan image', exact: true }).click();
  const file = await readFile((await (await downloading).path())!);
  await writeFile('test-results/review-plan.png', file);
  expect(file.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  expect(file.readUInt32BE(16)).toBeGreaterThan(500);
  expect(file.readUInt32BE(20)).toBeGreaterThan(500);
  await page.getByRole('button', { name: 'Share plan', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { sharedPlan: unknown }).sharedPlan)).toEqual({ count: 1, type: 'image/png' });
});

test('corrupt storage stays intact and storage failures leave editing available', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dream-home.project.v1', 'invalid-saved-data'));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('saved file could not be opened');
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe('invalid-saved-data');
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  const recovering = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Recover saved file', exact: true }).click();
  const recovery = await recovering;
  expect(await readFile((await recovery.path())!, 'utf8')).toBe('invalid-saved-data');
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe('invalid-saved-data');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
  await controls(page, 'My plot').click();
  const width = page.getByRole('spinbutton', { name: 'Plot width', exact: true });
  await width.fill('40');
  await width.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Saving is unavailable');
  await expect(width).toHaveValue('40');
  await page.getByRole('button', { name: 'Floor plan', exact: true }).click();
  await expect(page.locator('.plan-svg')).toBeVisible();
});

test('WebGL fallback leaves the 2D plan editable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      return type === 'webgl2' ? null : Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.getByText('3D isn’t available in this browser', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Floor plan', exact: true }).click();
  await expect(page.locator('.plan-svg')).toBeVisible();
  await controls(page, 'Rooms').click();
  await page.locator('.room-card').first().click();
  await expect(page.getByRole('spinbutton', { name: 'Room width', exact: true })).toBeVisible();
});
