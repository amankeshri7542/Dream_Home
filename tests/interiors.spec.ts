// M3 designer interiors: furnished rooms stay cheap to draw, idle when
// nothing moves, light up with real lamps at night in Explore, and (with
// DH_SHOTS=1) photograph each room kind at midday and at night.
import { test, expect, type Page } from "@playwright/test";
import { floorForGeometry } from "../src/domain/core";
import { roomFocalWall } from "../src/domain/furniture";
import { deriveWalls, updateRoom } from "../src/domain/model";
import { TEMPLATES, buildTemplate } from "../src/onboarding/templates";
import type { EditResult, Project } from "../src/domain/types";
import { KEY, homeAction, mobile } from "./support/dreamHome";

type Bridge = {
  ready: boolean;
  frame: number;
  waitForIdle: () => Promise<void>;
  renderer: () => { calls: number; triangles: number; programs: number };
  scene: () => { getObjectByName: (n: string) => { userData: Record<string, unknown> } | undefined };
};
const bridge = <T,>(page: Page, read: (dh: Bridge) => T | Promise<T>) =>
  page.evaluate(`(${read.toString()})(window.__dreamHome)`) as Promise<T>;
const ready = (page: Page) =>
  expect.poll(() => bridge(page, (dh) => dh?.ready ?? false), { timeout: 20000 }).toBe(true);
const ok = (r: EditResult): Project => {
  if (!r.ok) throw new Error(r.error);
  return r.project;
};

/** A two-storey Indian modern home with every room kind the designer styles. */
export function designerHome(): Project {
  const t = TEMPLATES.find((x) => x.id === "duplex")!;
  const built = buildTemplate(t, { floors: 2 });
  if (!built.ok) throw new Error(built.error);
  let p: Project = { ...built.project, name: "Designer Home", parking: true, garden: true };
  const upper = p.floors[1];
  const third = upper.rooms.find((r) => r.name === "Bedroom 3")!;
  p = ok(updateRoom(p, upper.id, third.id, { kind: "dining", name: "Dining" }));
  const bath = p.floors[1].rooms.find((r) => r.kind === "bathroom" && !r.attachedTo)!;
  p = ok(updateRoom(p, upper.id, bath.id, { kind: "utility", name: "Pooja room" }));
  return p;
}

async function seedHome(page: Page, project: Project, quality = "balanced") {
  await page.addInitScript(
    ({ fixture, key, quality }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(fixture));
      localStorage.setItem("dream-home.preferences.v1", JSON.stringify({ language: "en", unit: "ft", tourSeen: true, quality, streetLife: false }));
      sessionStorage.setItem("dream-home.session.v1", JSON.stringify({ titleDismissed: true }));
    },
    { fixture: project, key: KEY, quality },
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: project.name, exact: true })).toBeVisible({ timeout: 15000 });
  await ready(page);
}
async function framesOver(page: Page, ms: number) {
  const a = await bridge(page, (dh) => dh.frame);
  await page.waitForTimeout(ms);
  const b = await bridge(page, (dh) => dh.frame);
  return b - a;
}

test("designer interiors stay within the draw-call budget, idle in Build, and light up at night", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize(mobile);
  await seedHome(page, designerHome());
  await bridge(page, (dh) => dh.waitForIdle());
  await page.waitForTimeout(800);
  expect(await framesOver(page, 2000)).toBe(0);
  const build = await bridge(page, (dh) => dh.renderer().calls);
  await homeAction(page, "Explore").click();
  await page.getByRole("button", { name: "Night", exact: true }).click();
  await page.getByRole("radio", { name: /Walk inside/ }).click();
  await page.waitForTimeout(1500);
  await bridge(page, (dh) => dh.waitForIdle());
  await page.waitForTimeout(500);
  const lamps = await bridge(page, (dh) => dh.scene().getObjectByName("interior-lamps")?.userData.lamps ?? 0);
  const night = await bridge(page, (dh) => dh.renderer().calls);
  console.log(`draw calls: build ${build}, explore walk at night ${night}, lamps ${lamps}`);
  expect(build).toBeLessThanOrEqual(90);
  expect(night).toBeLessThanOrEqual(160);
  expect(Number(lamps)).toBeGreaterThan(0);
  // Lamps only change with the hour or the project: no idle frames.
  expect(await framesOver(page, 1500)).toBe(0);
});

test("battery tier keeps the fake night glow (no lamp lights)", async ({ page }) => {
  await page.setViewportSize(mobile);
  await seedHome(page, designerHome(), "battery");
  await homeAction(page, "Explore").click();
  await page.getByRole("button", { name: "Night", exact: true }).click();
  await page.getByRole("radio", { name: /Walk inside/ }).click();
  await page.waitForTimeout(1200);
  expect(await bridge(page, (dh) => dh.scene().getObjectByName("interior-lamps") ?? null)).toBeNull();
});

// ---------------------------------------------------------------------------
// Screenshots (DH_SHOTS=1): the scene lab frames each room in a cut-open
// dollhouse view with full-height walls.
// ---------------------------------------------------------------------------
const shots = !!process.env.DH_SHOTS;
const SHOT_DIR = "docs/screenshots/interiors";
type Lab = {
  useProject: (p: Project) => void;
  setView: (patch: Record<string, unknown>) => void;
  setHour: (h: number) => void;
  setQuality: (q: string) => void;
  camera: (c: Record<string, unknown>) => void;
};
const lab = <T,>(page: Page, run: (l: Lab, arg: unknown) => T, arg?: unknown) =>
  page.evaluate(([fn, a]) => new Function("l", "a", `return (${fn})(l, a)`)((window as unknown as { __lab: Lab }).__lab, a), [run.toString(), arg] as const);

const ROOMS: Array<[string, string]> = [
  ["bedroom", "Bedroom 1"],
  ["living", "Living / dining"],
  ["kitchen", "Kitchen"],
  ["dining", "Dining"],
  ["pooja", "Pooja room"],
];
test.describe("screenshots", () => {
  test.skip(!shots, "set DH_SHOTS=1 to capture screenshots");
  test.use({ reducedMotion: "reduce" });
  for (const vp of [mobile, { width: 1440, height: 900 }])
    for (const [tag, hour] of [
      ["midday", 12.5],
      ["night", 21.5],
    ] as const)
      test(`designer rooms ${vp.width} ${tag}`, async ({ page }) => {
        test.setTimeout(120000);
        await page.setViewportSize(vp);
        await page.goto(`/scene-lab.html?quality=${process.env.DH_QUALITY ?? "beautiful"}&mode=explore&explore=orbit&roof=0&cutaway=1&panel=0&labels=0&hour=${hour}`);
        await ready(page);
        const home = designerHome();
        await lab(page, (l, p) => l.useProject(p as Project), home);
        await page.waitForTimeout(1500);
        for (const [kind, name] of ROOMS) {
          const floor = home.floors.find((f) => f.rooms.some((r) => r.name === name))!;
          const room = floor.rooms.find((r) => r.name === name)!;
          const cut = Number(process.env.DH_CUT ?? 215);
          await lab(page, (l, a) => l.setView({ floor: (a as [string, number])[0], cutHeight: (a as [string, number])[1] }), [floor.id, cut]);
          await page.waitForTimeout(800);
          // Look at the focal wall (behind the bed, sofa or shrine) from across the room.
          const focal = roomFocalWall(room, deriveWalls(floorForGeometry(home, floor.id), home.plot.road)) ?? "north";
          const want = { north: 0, south: 180, west: 90, east: -90 }[focal];
          const now = (await bridge(page, (dh) => (dh as unknown as { camera: () => { azimuth: number } }).camera().azimuth)) * (180 / Math.PI);
          const turn = ((((want - now) % 360) + 540) % 360) - 180;
          await lab(page, (l, a) => l.camera({ type: "orbit", azimuthDeg: a as number, polarDeg: 0 }), turn);
          await page.waitForTimeout(500);
          for (let i = 0; i < 2; i++) {
            await lab(page, (l, a) => l.camera({ type: "fit", subject: "room", floorId: (a as string[])[0], roomId: (a as string[])[1], view: "room", instant: true }), [floor.id, room.id]);
            await page.waitForTimeout(600);
          }
          await lab(page, (l, a) => l.camera({ type: "orbit", azimuthDeg: 0, polarDeg: a as number }), Number(process.env.DH_TILT ?? -8));
          await lab(page, (l, a) => l.camera({ type: "dolly", factor: a as number }), vp.width < 600 ? 0.72 : 0.9);
          await page.waitForTimeout(900);
          await bridge(page, (dh) => dh.waitForIdle());
          await page.waitForTimeout(500);
          await page.screenshot({ path: `${SHOT_DIR}/${kind}-${vp.width}-${tag}.jpg`, type: "jpeg", quality: 82 });
        }
      });
});
