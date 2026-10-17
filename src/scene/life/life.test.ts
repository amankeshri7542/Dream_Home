// M3 lived-in rendering helpers: what shows in which view, where pieces
// stand, the Diwali festoon and wall diyas, and the fan and curtain motion.
import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PORCH } from "../../domain/entrance";
import type { LivedInItem } from "../../domain/livedIn";
import { withStylePreset } from "../../domain/materials";
import { suggestBalcony } from "../../domain/openSpaces";
import type { Project } from "../../domain/types";
import { TEMPLATES, buildTemplate } from "../../onboarding/templates";
import { FLOOR_SURFACE, GROUND_TOP, floorBase } from "../coords";
import { findEntrance } from "../building/geometry/porch";
import { COMPOUND_WALL, fencePlan } from "../props/fence";
import { FAN_TURNS_PER_SECOND, fanMatrix, spinAxis, swayMatrix } from "../props/idleMotion";
import { frontPlanting } from "../props/garden";
import { siteLayout } from "../props/site";
import { frontVehicles, lifeFootprint } from "../../domain/livedIn";
import { BULB_SPACING, festoon, wallDiyas } from "./festive";
import { decorBaseY, shownDecor } from "./LivedIn";

function home(): Project {
  const built = buildTemplate(TEMPLATES.find((t) => t.id === "villa")!, { floors: 2 });
  if (!built.ok) throw new Error(built.error);
  let p: Project = { ...built.project, parking: true, garden: true };
  const balcony = suggestBalcony(p, p.floors[1].id, "south", 300, 120);
  if (balcony.ok) p = balcony.project;
  return withStylePreset(p, "indian-modern");
}
const all = { everyday: true, diwali: true };

describe("shownDecor", () => {
  const p = home();
  const [ground, upper] = p.floors;
  it("shows room pieces only on the furnished floor, outside pieces on every floor shown", () => {
    const items = shownDecor(p, p.floors, { ...all, furnishedFloorId: upper.id, roofVisible: false });
    expect(items.some((i) => i.roomId && i.floorId === upper.id)).toBe(true);
    expect(items.some((i) => i.roomId && i.floorId === ground.id)).toBe(false);
    expect(items.some((i) => !i.roomId && i.floorId === ground.id && i.model === "shoes")).toBe(true);
    // The terrace only with the roof on.
    expect(items.some((i) => i.on === "roof")).toBe(false);
    expect(shownDecor(p, p.floors, { ...all, furnishedFloorId: null, roofVisible: true }).some((i) => i.on === "roof")).toBe(true);
  });
  it("keeps the everyday and Diwali sets apart", () => {
    const everyday = shownDecor(p, p.floors, { everyday: true, diwali: false, furnishedFloorId: ground.id, roofVisible: false });
    const diwali = shownDecor(p, p.floors, { everyday: false, diwali: true, furnishedFloorId: ground.id, roofVisible: false });
    expect(everyday.every((i) => i.set === "everyday")).toBe(true);
    expect(diwali.every((i) => i.set === "diwali")).toBe(true);
    expect(diwali.some((i) => i.model === "string-lights")).toBe(true);
  });
});

describe("decorBaseY", () => {
  const p = home();
  const [ground, upper] = p.floors;
  const item = (on: LivedInItem["on"], y = 0): LivedInItem => ({ id: "t", model: "shoes", set: "everyday", floorId: upper.id, roomId: null, x: 0, z: 0, y, on, rotation: 0 });
  it("stands pieces on their floor, the porch, the garden or the terrace", () => {
    expect(decorBaseY(item("floor", 92), upper)).toBeCloseTo(floorBase(upper) + FLOOR_SURFACE + 0.92);
    expect(decorBaseY(item("porch"), ground)).toBeCloseTo(PORCH.landing.top / 100);
    expect(decorBaseY(item("ground"), ground)).toBeGreaterThan(GROUND_TOP);
    expect(decorBaseY(item("roof"), upper)).toBeGreaterThan(floorBase(upper) + upper.height / 100);
  });
  it("puts the porch landing where the porch is drawn", () => {
    const entrance = findEntrance(p)!;
    const shoes = shownDecor(p, p.floors, { ...all, furnishedFloorId: null, roofVisible: false }).find((i) => i.model === "shoes")!;
    const out = entrance.axis === "x" ? (shoes.z / 100 - entrance.line) * entrance.out : (shoes.x / 100 - entrance.line) * entrance.out;
    expect(out).toBeGreaterThan(PORCH.face / 100);
    expect(out).toBeLessThan((PORCH.face + PORCH.landing.depth) / 100);
  });
});

describe("Diwali pieces", () => {
  it("festoons sag between hooks and keep a steady bulb spacing", () => {
    const bulbs = festoon(3.3);
    expect(bulbs[0]).toEqual({ x: -1.65, y: -0 });
    expect(bulbs.at(-1)!.x).toBeCloseTo(1.65);
    expect(Math.min(...bulbs.map((b) => b.y))).toBeLessThan(-0.05);
    expect(Math.max(...bulbs.map((b) => b.y))).toBeLessThanOrEqual(0);
    const gaps = bulbs.slice(1).map((b, i) => b.x - bulbs[i].x);
    for (const g of gaps) expect(g).toBeCloseTo(BULB_SPACING, 1);
  });
  it("line the road-side compound wall with diyas: on the pillar caps and along the coping", () => {
    const p = home();
    const layout = siteLayout(p, findEntrance(p));
    const lamps = wallDiyas(fencePlan(p, layout), p.plot.road, p.plot);
    expect(lamps.length).toBeGreaterThan(6);
    const roadZ = p.plot.depth / 100;
    for (const [, y, z] of lamps) {
      expect(Math.abs(z - roadZ)).toBeLessThan(0.3);
      expect([COMPOUND_WALL.coping, COMPOUND_WALL.pillarCap]).toContain(y);
    }
    // No compound wall, no wall diyas.
    expect(wallDiyas(fencePlan({ ...p, site: { fence: "picket" } }, layout), p.plot.road, p.plot)).toEqual([]);
  });
});

describe("front planting", () => {
  it("leaves room for the scooter and bicycle in lush looks", () => {
    for (const look of ["kerala", "goan", "bengaluru-contemporary"] as const)
      for (const parking of [true, false]) {
        const p = withStylePreset({ ...home(), parking }, look);
        const vehicles = frontVehicles(p).map(lifeFootprint);
        expect(vehicles.length, look).toBeGreaterThan(0);
        for (const plant of frontPlanting(p, siteLayout(p, findEntrance(p))))
          for (const v of vehicles) {
            const r = 0.26;
            const apart = plant.x + r <= v.x / 100 || plant.x - r >= (v.x + v.w) / 100 || plant.z + r <= v.z / 100 || plant.z - r >= (v.z + v.d) / 100;
            expect(apart, `${look}: a ${plant.model} in the ${parking ? "parked" : "open"} drive`).toBe(true);
          }
      }
  });
});

describe("idle motion", () => {
  /** Three blades round a hub at (0.3, -0.2): a fan off its box centre, like the kit's. */
  function fan(): BufferGeometry {
    const pts: number[] = [];
    for (let k = 0; k < 3; k++)
      for (const [r, y] of [[0.2, 0.1], [0.6, 0.1], [0.6, 0.12]]) {
        const a = (k * 2 * Math.PI) / 3;
        pts.push(0.3 + Math.cos(a) * r, y, -0.2 + Math.sin(a) * r);
      }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
    return g;
  }
  it("finds a fan's hub and turns the fan about it", () => {
    const hub = spinAxis([{ geometry: fan() }]);
    expect(hub[0]).toBeCloseTo(0.3);
    expect(hub[1]).toBeCloseTo(-0.2);
    const base = new Matrix4().makeTranslation(2, 2.45, 1);
    const at = (t: number) => new Vector3(hub[0], 0, hub[1]).applyMatrix4(fanMatrix(base, hub, t, new Matrix4()));
    // The hub never moves; a blade tip comes round once per turn.
    expect(at(0.37).distanceTo(at(0))).toBeLessThan(1e-9);
    const tip = (t: number) => new Vector3(hub[0] + 0.6, 0, hub[1]).applyMatrix4(fanMatrix(base, hub, t, new Matrix4()));
    expect(tip(1 / FAN_TURNS_PER_SECOND).distanceTo(tip(0))).toBeLessThan(1e-6);
    expect(tip(0.5 / FAN_TURNS_PER_SECOND).distanceTo(tip(0))).toBeCloseTo(1.2, 5);
  });
  it("sways a curtain's hem into the room while its rod stays put", () => {
    const base = new Matrix4().makeTranslation(1, 0, 1);
    for (const t of [0, 0.7, 1.9, 3.3]) {
      const m = swayMatrix(base, 2.5, t, 0.4, new Matrix4());
      const rod = new Vector3(0.5, 2.5, 0).applyMatrix4(m);
      const hem = new Vector3(0.5, 0, 0).applyMatrix4(m);
      expect(rod.distanceTo(new Vector3(1.5, 2.5, 1))).toBeLessThan(1e-9);
      // Into the room (+z), at most ~3 cm, never into the wall.
      expect(hem.z - 1).toBeGreaterThanOrEqual(0);
      expect(hem.z - 1).toBeLessThanOrEqual(0.031);
    }
  });
});
