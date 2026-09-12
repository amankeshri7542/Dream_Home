import { describe, expect, it } from "vitest";
import {
  createStarter,
  recommendHomes,
  type HomeStyle,
  type StarterRequest,
} from "./starters";
import {
  parseProject,
  projectStats,
  setFloorCount,
  updatePlot,
  validateProject,
} from "./model";

const request = (widthFt = 30, depthFt = 50): StarterRequest => ({
  widthCm: Math.round(widthFt * 30.48),
  depthCm: Math.round(depthFt * 30.48),
  road: "south",
  marginCm: 60,
  bedrooms: 2,
  floors: 1,
});
const styles: HomeStyle[] = ["family", "courtyard", "open"];
const plots = [
  [20, 40],
  [30, 40],
  [30, 50],
  [40, 60],
];

describe("bounded starter generation", () => {
  for (const [width, depth] of plots)
    for (const bedrooms of [1, 2, 3] as const)
      for (const floors of [1, 2] as const)
        for (const style of styles) {
          it(`${width}×${depth} ft / ${bedrooms} bedrooms / ${floors} floors / ${style} validates or explains inability to fit`, () => {
            const input = { ...request(width, depth), bedrooms, floors };
            const before = JSON.stringify(input);
            const result = createStarter(input, style);
            expect(createStarter(input, style)).toEqual(result);
            expect(JSON.stringify(input)).toBe(before);
            if (!result.ok) {
              expect(result.error).toMatch(/cannot fit/);
              return;
            }
            const p = result.project;
            expect(validateProject(p)).toEqual([]);
            expect(parseProject(JSON.stringify(p))).toEqual(p);
            expect(p.plot.width).toBe(input.widthCm);
            expect(p.plot.depth).toBe(input.depthCm);
            expect(p.floors).toHaveLength(floors);
            expect(projectStats(p).bedrooms).toBe(bedrooms);
            expect(p.floors[0].rooms.some((r) => r.kind === "bedroom")).toBe(
              true,
            );
            expect(p.floors[0].rooms.some((r) => r.kind === "kitchen")).toBe(
              true,
            );
            expect(p.floors[0].rooms.some((r) => r.kind === "living")).toBe(
              true,
            );
            for (const floor of p.floors) {
              expect(floor.rooms.some((r) => r.kind === "bathroom")).toBe(true);
              expect(floor.balcony).toBe(false);
              expect(
                floor.voids.filter((v) => v.kind === "stairs"),
              ).toHaveLength(floors === 1 ? 0 : 1);
              expect(
                floor.voids.filter((v) => v.kind === "courtyard"),
              ).toHaveLength(style === "courtyard" ? 1 : 0);
              for (const room of floor.rooms.filter(
                (r) => r.kind === "bedroom",
              )) {
                expect(
                  Math.min(room.bounds.w, room.bounds.d),
                ).toBeGreaterThanOrEqual(270);
                expect(room.bounds.w * room.bounds.d).toBeGreaterThanOrEqual(
                  270 * 270,
                );
              }
            }
          });
        }
  it("offers the required 30×50 two-bedroom family arrangement and a 40×60 aangan", () => {
    expect(createStarter(request(), "family").ok).toBe(true);
    expect(
      createStarter({ ...request(40, 60), bedrooms: 3, floors: 2 }, "courtyard")
        .ok,
    ).toBe(true);
    const recommendations = recommendHomes(request());
    expect(recommendations.map((r) => r.id)).toEqual(styles);
    expect(recommendations[0].project).not.toBeNull();
    expect(recommendations.every((r) => r.reason.length > 0)).toBe(true);
  });
  it('uses generous rooms and leaves excess land outside the default floorplate', () => {
    const result = createStarter(request(), 'family');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const floor = result.project.floors[0];
    const plateArea = floor.footprint.w * floor.footprint.d;
    const assigned = [...floor.rooms, ...floor.voids].reduce((sum, space) => sum + space.bounds.w * space.bounds.d, 0);
    expect(1 - assigned / plateArea).toBeLessThanOrEqual(0.4);
    expect(floor.rooms.find(r => r.kind === 'living')!.bounds.d).toBeGreaterThanOrEqual(300);
    expect(floor.rooms.filter(r => r.kind === 'bedroom').every(r => r.bounds.d >= 300 && r.bounds.d <= 400)).toBe(true);
    expect(floor.footprint.d).toBeLessThan(result.project.plot.depth - 2 * result.project.plot.setback - 200);
  });
  it('caps oversized plots rather than producing a huge blank interior', () => {
    const result = createStarter({ ...request(), widthCm: 10000, depthCm: 10000 }, 'family');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const floor = result.project.floors[0];
    const roomArea = floor.rooms.reduce((sum, r) => sum + r.bounds.w * r.bounds.d, 0);
    expect(1 - roomArea / (floor.footprint.w * floor.footprint.d)).toBeLessThan(0.4);
    expect(floor.footprint.d).toBeLessThanOrEqual(1100);
  });
  it('the open option keeps a meaningfully larger front yard after footprint capping', () => {
    const family = createStarter(request(), 'family');
    const open = createStarter(request(), 'open');
    expect(family.ok && open.ok).toBe(true);
    if (!family.ok || !open.ok) return;
    const a = family.project.floors[0].footprint, b = open.project.floors[0].footprint;
    expect(a.z + a.d - b.z - b.d).toBeGreaterThanOrEqual(240);
  });
  it("supports narrow 20 ft frontage without reducing exact requested needs", () => {
    expect(
      createStarter({ ...request(20, 40), bedrooms: 2 }, "family").ok,
    ).toBe(true);
    expect(
      createStarter({ ...request(20, 40), bedrooms: 3, floors: 2 }, "family")
        .ok,
    ).toBe(true);
    const cannotFit = createStarter(
      { ...request(20, 40), bedrooms: 3 },
      "family",
    );
    expect(cannotFit.ok).toBe(false);
    if (!cannotFit.ok)
      expect(cannotFit.error).toContain("3 bedrooms on 1 floor");
  });
  it.each(["south", "north", "east", "west"] as const)(
    "reserves the open strip against the %s road",
    (road) => {
      const result = createStarter({ ...request(40, 60), road }, "open");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const p = result.project,
        f = p.floors[0].footprint;
      const margin =
        road === "south"
          ? p.plot.depth - f.z - f.d
          : road === "north"
            ? f.z
            : road === "east"
              ? p.plot.width - f.x - f.w
              : f.x;
      expect(margin).toBeGreaterThanOrEqual(300);
      expect(p.garden).toBe(true);
      expect(p.parking).toBe(false);
      expect(validateProject(p)).toEqual([]);
    },
  );
  it("rejects invalid inputs before geometry generation", () => {
    for (const patch of [
      { widthCm: NaN },
      { depthCm: 399 },
      { widthCm: 10001 },
      { marginCm: 61 },
      { marginCm: -10 },
      { marginCm: 5000 },
    ]) {
      expect(createStarter({ ...request(), ...patch }, "family").ok).toBe(
        false,
      );
    }
  });
  it("retains integer-centimetre plot precision independently of the room grid", () => {
    const result = createStarter(request(), "family");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.plot.width).toBe(914);
    expect(result.project.plot.depth).toBe(1524);
    const expanded = updatePlot(result.project, { width: 927, depth: 1541 });
    expect(expanded.ok).toBe(true);
    if (expanded.ok)
      expect(expanded.project.plot).toMatchObject({ width: 927, depth: 1541 });
    for (const floor of result.project.floors)
      for (const room of floor.rooms)
        expect(Object.values(room.bounds).every((n) => n % 10 === 0)).toBe(
          true,
        );
  });
  it("rejects adding a floor to a stair-free home without modifying it", () => {
    const result = createStarter(request(), "family");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const before = JSON.stringify(result.project);
    const added = setFloorCount(result.project, 2);
    expect(added.ok).toBe(false);
    if (!added.ok) expect(added.error).toMatch(/staircase/);
    expect(JSON.stringify(result.project)).toBe(before);
  });
});
