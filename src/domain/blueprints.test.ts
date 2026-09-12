import { describe, expect, it } from "vitest";
import {
  createBlueprint,
  recommendBlueprints,
  type BlueprintRequest,
} from "./blueprints";
import { parseProject, validateProject } from "./model";
const request = (patch: Partial<BlueprintRequest> = {}): BlueprintRequest => ({
  widthCm: 2400,
  depthCm: 3000,
  marginCm: 100,
  road: "south",
  kind: "home",
  floors: 2,
  bedrooms: 6,
  unitsPerFloor: 2,
  bedroomsPerUnit: 2,
  shopsPerFloor: 4,
  ...patch,
});
const overlap = (
  a: { x: number; z: number; w: number; d: number },
  b: { x: number; z: number; w: number; d: number },
) => a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
describe("deterministic building blueprints", () => {
  it.each(["home", "apartments", "market", "mixed", "blank"] as const)(
    "creates a valid canonical %s with exact floors and ownership",
    (kind) => {
      const input = request({ kind, floors: 3 });
      const before = JSON.stringify(input);
      const result = createBlueprint(input);
      expect(result.ok, result.ok ? "" : result.error).toBe(true);
      if (!result.ok) return;
      expect(JSON.stringify(input)).toBe(before);
      expect(createBlueprint(input)).toEqual(result);
      expect(result.project.floors).toHaveLength(3);
      expect(validateProject(result.project)).toEqual([]);
      expect(parseProject(JSON.stringify(result.project))).toEqual(
        result.project,
      );
      const p = result.project;
      for (const floor of p.floors) {
        for (const area of floor.unitAreas)
          expect(p.units.some((u) => u.id === area.unitId)).toBe(true);
        for (const room of floor.rooms)
          expect(floor.unitAreas.some((a) => a.unitId === room.unitId)).toBe(
            true,
          );
        for (let i = 0; i < floor.unitAreas.length; i++)
          for (let j = i + 1; j < floor.unitAreas.length; j++)
            expect(
              overlap(floor.unitAreas[i].bounds, floor.unitAreas[j].bounds),
            ).toBe(false);
      }
      expect(p.verticalSpaces.filter((v) => v.kind === "stairs")).toHaveLength(
        1,
      );
      if (kind === "home")
        expect(
          p.floors.flatMap((f) => f.rooms).filter((r) => r.kind === "bedroom"),
        ).toHaveLength(6);
      if (kind === "apartments") {
        expect(p.units).toHaveLength(6);
        expect(
          p.floors.flatMap((f) => f.rooms).filter((r) => r.kind === "bedroom"),
        ).toHaveLength(12);
      }
      if (kind === "market") {
        expect(p.units).toHaveLength(12);
        expect(
          p.floors.flatMap((f) => f.rooms).every((r) => r.kind === "shop"),
        ).toBe(true);
      }
      if (kind === "mixed") {
        expect(p.units.filter((u) => u.use === "commercial")).toHaveLength(4);
        expect(p.units.filter((u) => u.use === "residential")).toHaveLength(4);
      }
      if (kind === "blank") {
        expect(p.units).toEqual([]);
        expect(p.floors.flatMap((f) => f.rooms)).toEqual([]);
      }
    },
  );
  it("supports zero bedrooms and twelve bedrooms without changing the count", () => {
    for (const bedrooms of [0, 12]) {
      const result = createBlueprint(request({ bedrooms, floors: 4 }));
      expect(result.ok).toBe(true);
      if (result.ok)
        expect(
          result.project.floors
            .flatMap((f) => f.rooms)
            .filter((r) => r.kind === "bedroom"),
        ).toHaveLength(bedrooms);
    }
  });
  it("supports eight floors, four flats with four bedrooms each and eight shops", () => {
    for (const kind of ["apartments", "market"] as const) {
      const result = createBlueprint(
        request({
          kind,
          widthCm: 4000,
          depthCm: 4000,
          floors: 8,
          unitsPerFloor: 4,
          bedroomsPerUnit: 4,
          shopsPerFloor: 8,
        }),
      );
      expect(result.ok, result.ok ? "" : result.error).toBe(true);
      if (result.ok) {
        expect(result.project.floors).toHaveLength(8);
        expect(result.project.units).toHaveLength(
          kind === "apartments" ? 32 : 64,
        );
        expect(
          Math.max(...result.project.floors.map((f) => f.rooms.length)),
        ).toBeLessThanOrEqual(48);
      }
    }
  });
  it("uses one canonical aligned courtyard and keeps public core outside units", () => {
    const result = createBlueprint(
      request({ kind: "apartments", courtyard: true }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.project.verticalSpaces.filter((v) => v.kind === "courtyard"),
    ).toHaveLength(1);
    for (const v of result.project.verticalSpaces) {
      expect(v.floorIds).toEqual(["floor-0", "floor-1"]);
      expect(v.unitId).toBeNull();
      for (const floor of result.project.floors)
        for (const a of floor.unitAreas)
          expect(overlap(v.bounds, a.bounds)).toBe(false);
    }
  });
  it.each(["north", "south", "east", "west"] as const)(
    "keeps %s road geometry valid and preserves plot precision",
    (road) => {
      const result = createBlueprint(
        request({
          kind: "market",
          road,
          widthCm: 2407,
          depthCm: 3003,
          north: 123,
        }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.project.plot).toMatchObject({
          width: 2407,
          depth: 3003,
          north: 123,
          road,
        });
        expect(validateProject(result.project)).toEqual([]);
      }
    },
  );
  it("rejects overfull plots and invalid counts rather than reducing the program", () => {
    const result = createBlueprint(
      request({
        kind: "apartments",
        widthCm: 600,
        depthCm: 800,
        unitsPerFloor: 4,
        bedroomsPerUnit: 4,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain("counts have not been reduced");
    for (const patch of [
      { floors: 9 },
      { bedrooms: 13 },
      { shopsPerFloor: 9 },
      { unitsPerFloor: 5 },
      { widthCm: NaN },
      { north: 360 },
    ])
      expect(createBlueprint(request(patch)).ok).toBe(false);
  });
  it("offers a one-floor mixed building with shops and one home", () => {
    const result = createBlueprint(
      request({
        kind: "mixed",
        floors: 1,
        shopsPerFloor: 2,
        widthCm: 4000,
        depthCm: 4000,
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.project.units.filter((u) => u.use === "residential"),
      ).toHaveLength(1);
      expect(
        result.project.units.filter((u) => u.use === "commercial"),
      ).toHaveLength(2);
    }
  });
  it("retains the proven narrow two-bedroom home and explains both preview variants", () => {
    const input = request({
      kind: "home",
      widthCm: Math.round(20 * 30.48),
      depthCm: Math.round(40 * 30.48),
      marginCm: 60,
      bedrooms: 2,
      floors: 1,
    });
    expect(createBlueprint(input).ok).toBe(true);
    const options = recommendBlueprints(input);
    expect(options[0].project).not.toBeNull();
    expect(options.every((o) => o.reason.length > 0)).toBe(true);
  });
});
