import { describe, expect, it } from "vitest";
import courtyardFixture from "../../tests/fixtures/legacy-v1-courtyard.json";
import compactFixture from "../../tests/fixtures/legacy-v1-compact.json";
import familyFixture from "../../tests/fixtures/legacy-v1-family.json";
const fixtures = {
  courtyard: courtyardFixture,
  compact: compactFixture,
  family: familyFixture,
};
import {
  addBalcony,
  addUnitArea,
  addVerticalSpace,
  balconyBounds,
  componentBounds,
  createPreset,
  deriveFloorVoids,
  deriveWalls,
  floorForGeometry,
  getLimits,
  migrateV1,
  moveRoomToUnit,
  parseProject,
  projectStats,
  removeBalcony,
  removeVerticalSpace,
  renameUnit,
  setFloorCount,
  slabTiles,
  swapRoomUses,
  transformComponent,
  updateBalcony,
  updatePlot,
  updateRoom,
  updateUnitArea,
  updateVerticalSpace,
  validateProject,
} from "./model";
import type { GeometryFloor, Project, Rect, Room } from "./types";
const area = (tiles: Rect[]) => tiles.reduce((sum, r) => sum + r.w * r.d, 0);
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
function empty(): Project {
  return {
    schemaVersion: 2,
    name: "Sketch",
    plot: { width: 2000, depth: 2200, north: 0, road: "south", setback: 100 },
    floors: [
      {
        id: "f0",
        name: "Ground floor",
        elevation: 0,
        height: 300,
        footprint: { x: 500, z: 500, w: 1000, d: 1000 },
        rooms: [],
        balconies: [],
        unitAreas: [],
      },
    ],
    units: [],
    verticalSpaces: [],
    garden: false,
    parking: false,
  };
}
const room = (
  id: string,
  bounds: Rect,
  kind: Room["kind"] = "bedroom",
  unitId: string | null = null,
): Room => ({ id, name: id, kind, bounds, unitId });
function twoFloors(): Project {
  const p = empty();
  p.floors.push({
    ...p.floors[0],
    id: "f1",
    name: "First floor",
    elevation: 300,
    rooms: [],
    balconies: [],
    unitAreas: [],
  });
  p.verticalSpaces = [
    {
      id: "stairs",
      kind: "stairs",
      bounds: { x: 500, z: 500, w: 220, d: 340 },
      floorIds: ["f0", "f1"],
      unitId: null,
    },
  ];
  return p;
}

describe("canonical documents and legacy migration", () => {
  it("moves a room between separate unit areas atomically and rejects a full target", () => {
    const project = empty();
    project.units = [
      { id: "home-a", name: "Flat A", use: "residential" },
      { id: "home-b", name: "Flat B", use: "residential" },
    ];
    project.floors[0].unitAreas = [
      { unitId: "home-a", bounds: { x: 500, z: 500, w: 400, d: 1000 } },
      { unitId: "home-b", bounds: { x: 1100, z: 500, w: 400, d: 1000 } },
    ];
    project.floors[0].rooms = [
      room("bed", { x: 500, z: 500, w: 300, d: 300 }, "bedroom", "home-a"),
    ];
    const before = structuredClone(project);
    const result = moveRoomToUnit(project, "f0", "bed", "home-b");
    expect(result.ok).toBe(true);
    expect(project).toEqual(before);
    if (result.ok) {
      const moved = result.project.floors[0].rooms[0];
      expect(moved).toMatchObject({
        id: "bed",
        kind: "bedroom",
        unitId: "home-b",
        bounds: { x: 1100, z: 500, w: 300, d: 300 },
      });
      expect(validateProject(result.project)).toEqual([]);
    }
    project.floors[0].rooms.push(
      room("full", { x: 1100, z: 500, w: 400, d: 1000 }, "living", "home-b"),
    );
    const full = structuredClone(project);
    expect(moveRoomToUnit(project, "f0", "bed", "home-b")).toMatchObject({
      ok: false,
    });
    expect(project).toEqual(full);
  });
  it.each(["courtyard", "compact", "family"] as const)(
    "migrates the real %s fixture without changing its layout or room IDs",
    (id) => {
      const raw = JSON.parse(JSON.stringify(fixtures[id]));
      const project = migrateV1(raw);
      expect(project.schemaVersion).toBe(2);
      expect(validateProject(project)).toEqual([]);
      expect(project.plot).toEqual(raw.plot);
      expect(project.name).toBe(raw.name);
      for (const [i, floor] of project.floors.entries()) {
        expect(floor.id).toBe(raw.floors[i].id);
        expect(floor.footprint).toEqual(raw.floors[i].footprint);
        expect(
          floor.rooms.map(({ unitId, ...r }) => {
            expect(unitId).toBe(project.units[0].id);
            return r;
          }),
        ).toEqual(raw.floors[i].rooms);
        expect(
          deriveFloorVoids(project, floor.id).map((v) => [v.kind, v.bounds]),
        ).toEqual(
          raw.floors[i].voids.map((v: { kind: string; bounds: Rect }) => [
            v.kind,
            v.bounds,
          ]),
        );
        expect(floor.balconies.length).toBe(raw.floors[i].balcony ? 1 : 0);
        expect(floor).not.toHaveProperty("voids");
        expect(floor).not.toHaveProperty("balcony");
      }
      expect(parseProject(JSON.stringify(raw))).toEqual(project);
      expect(parseProject(JSON.stringify(project))).toEqual(project);
      expect(migrateV1(raw)).toEqual(project);
      expect(createPreset(id)).toEqual(project);
    },
  );
  it("preserves explicit finishes and leaves legacy missing finish absent", () => {
    const raw = JSON.parse(JSON.stringify(compactFixture));
    delete raw.finish;
    expect(migrateV1(raw)).not.toHaveProperty("finish");
    for (const finish of ["ivory", "brick", "sand"] as const) {
      const p = { ...createPreset("compact"), finish };
      expect(parseProject(JSON.stringify(p))).toEqual(p);
    }
  });
  it("rejects malformed, nonfinite, oversized, unsupported and invalid ownership imports", () => {
    for (const source of [
      "null",
      "[]",
      "{}",
      "{",
      " ".repeat(getLimits().importBytes + 1),
      JSON.stringify({ ...empty(), schemaVersion: 3 }),
    ])
      expect(() => parseProject(source)).toThrow();
    const p = empty();
    p.floors[0].rooms = [room("bad", { x: 500, z: 500, w: 1e200, d: 200 })];
    expect(() => parseProject(JSON.stringify(p))).toThrow();
    p.floors[0].rooms = [
      room("bad", { x: 500, z: 500, w: 200, d: 200 }, "bedroom", "missing"),
    ];
    expect(() => parseProject(JSON.stringify(p))).toThrow(/unit/);
    for (const finish of ["wood", null, {}, 1])
      expect(() =>
        parseProject(JSON.stringify({ ...empty(), finish })),
      ).toThrow(/finish/);
  });
  it("rejects legacy void misalignment and duplicate IDs before collapsing them", () => {
    const raw = JSON.parse(JSON.stringify(courtyardFixture));
    raw.floors[1].voids[0].bounds.x += 10;
    expect(() => migrateV1(raw)).toThrow(/align/);
    raw.floors[1].voids[0].bounds.x -= 10;
    raw.floors[1].voids[0].id = raw.floors[0].voids[0].id;
    expect(() => migrateV1(raw)).toThrow(/IDs/);
  });
  it("accepts 48 rooms but rejects a 49th without increasing resource limits", () => {
    const p = empty();
    p.floors[0].rooms = Array.from({ length: 48 }, (_, i) =>
      room(`r${i}`, {
        x: 500 + (i % 7) * 120,
        z: 500 + Math.floor(i / 7) * 120,
        w: 120,
        d: 120,
      }),
    );
    expect(validateProject(p)).toEqual([]);
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    p.floors[0].rooms.push(
      room("r48", { x: 500 + 6 * 120, z: 500 + 6 * 120, w: 120, d: 120 }),
    );
    expect(() => parseProject(JSON.stringify(p))).toThrow(/floor/);
  });
});

describe("balconies and generic component transforms", () => {
  it.each(["north", "south", "east", "west"] as const)(
    "adds and projects a balcony on the %s edge",
    (edge) => {
      const p = empty(),
        result = addBalcony(p, "f0", {
          edge,
          offset: 200,
          width: 300,
          depth: 150,
        });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const f = result.project.floors[0],
        b = f.balconies[0],
        bounds = balconyBounds(f, b);
      expect(componentBounds(result.project, "f0", b.id)).toEqual(bounds);
      expect(validateProject(result.project)).toEqual([]);
      const walls = deriveWalls(floorForGeometry(result.project, "f0"));
      expect(
        walls.some(
          (w) =>
            w.exterior &&
            w.opening?.kind === "door" &&
            (edge === "north"
              ? w.z === 500
              : edge === "south"
                ? w.z === 1500
                : edge === "west"
                  ? w.x === 500
                  : w.x === 1500),
        ),
      ).toBe(true);
      expect(removeBalcony(result.project, "f0", b.id)).toEqual({
        ok: true,
        project: p,
      });
    },
  );
  it("edits one floor only, rejects overlaps and margin violations atomically", () => {
    const p = twoFloors(),
      added = addBalcony(p, "f1", {
        edge: "south",
        offset: 200,
        width: 300,
        depth: 150,
      });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const id = added.project.floors[1].balconies[0].id,
      before = JSON.stringify(added.project);
    expect(updateBalcony(added.project, "f1", id, { depth: 900 }).ok).toBe(
      false,
    );
    expect(
      addBalcony(added.project, "f1", {
        edge: "south",
        offset: 210,
        width: 300,
        depth: 150,
      }).ok,
    ).toBe(false);
    const moved = transformComponent(
      added.project,
      "f1",
      id,
      { x: 330, z: 800, w: 150, d: 300 },
      "move",
    );
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.project.floors[1].balconies[0].edge).toBe("west");
      expect(moved.project.floors[0]).toEqual(p.floors[0]);
    }
    expect(JSON.stringify(added.project)).toBe(before);
  });
  it("clamps an existing offset when changing to a shorter edge without changing size", () => {
    const p = empty();
    p.floors[0].footprint.d = 600;
    const added = addBalcony(p, "f0", {
      edge: "south",
      offset: 700,
      width: 300,
      depth: 100,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const b = added.project.floors[0].balconies[0],
      changed = updateBalcony(added.project, "f0", b.id, { edge: "west" });
    expect(changed.ok).toBe(true);
    if (changed.ok)
      expect(changed.project.floors[0].balconies[0]).toMatchObject({
        edge: "west",
        offset: 300,
        width: 300,
        depth: 100,
      });
  });
});

describe("shared vertical spaces and floors", () => {
  it("reports the named blocking room and floor and preserves every source rectangle", () => {
    const p = twoFloors();
    p.floors[1].rooms = [
      {
        ...room("guest", { x: 1000, z: 900, w: 300, d: 300 }),
        name: "Guest room",
      },
    ];
    const before = JSON.stringify(p);
    const failed = transformComponent(
      p,
      "f0",
      "stairs",
      { x: 1000, z: 900, w: 220, d: 340 },
      "move",
    );
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error).toMatch(/First floor: Guest room/);
    expect(JSON.stringify(p)).toBe(before);
    const moved = updateVerticalSpace(p, "stairs", {
      bounds: { x: 750, z: 500, w: 220, d: 340 },
    });
    expect(moved.ok).toBe(true);
    if (moved.ok)
      for (const f of moved.project.floors)
        expect(deriveFloorVoids(moved.project, f.id)[0].bounds.x).toBe(750);
  });
  it("requires roof-reaching courtyards and connected stairs, but permits removing a courtyard", () => {
    const p = twoFloors();
    expect(
      addVerticalSpace(p, {
        kind: "courtyard",
        bounds: { x: 1000, z: 1000, w: 200, d: 200 },
        floorIds: ["f0"],
        unitId: null,
      }).ok,
    ).toBe(false);
    const added = addVerticalSpace(p, {
      kind: "courtyard",
      bounds: { x: 1000, z: 1000, w: 200, d: 200 },
      floorIds: ["f0", "f1"],
      unitId: null,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(removeVerticalSpace(added.project, "stairs").ok).toBe(false);
    const court = added.project.verticalSpaces.find(
      (v) => v.kind === "courtyard",
    )!;
    expect(removeVerticalSpace(added.project, court.id)).toEqual({
      ok: true,
      project: p,
    });
  });
  it("adds up to eight aligned floors with unique IDs and connected cores", () => {
    const p = createPreset("compact"),
      grown = setFloorCount(p, 8);
    expect(grown.ok).toBe(true);
    if (!grown.ok) return;
    expect(validateProject(grown.project)).toEqual([]);
    expect(grown.project.floors.map((f) => f.elevation)).toEqual([
      0, 300, 600, 900, 1200, 1500, 1800, 2100,
    ]);
    expect(grown.project.verticalSpaces[0].floorIds).toHaveLength(8);
    expect(
      grown.project.floors.slice(1).every((f) => !f.balconies.length),
    ).toBe(true);
    expect(setFloorCount(p, 9).ok).toBe(false);
    const reduced = setFloorCount(grown.project, 2);
    expect(reduced.ok).toBe(true);
    if (reduced.ok) expect(validateProject(reduced.project)).toEqual([]);
    expect(setFloorCount(empty(), 2).ok).toBe(false);
  });
  it("rebases copied flat IDs while extending shared stairs", () => {
    const p = twoFloors();
    p.units = [{ id: "flat", name: "Flat 1", use: "residential" }];
    p.floors[1].unitAreas = [
      { unitId: "flat", bounds: { x: 800, z: 500, w: 700, d: 1000 } },
    ];
    p.floors[1].rooms = [
      room("flat-bed", { x: 800, z: 500, w: 300, d: 300 }, "bedroom", "flat"),
    ];
    const grown = setFloorCount(p, 3);
    expect(grown.ok).toBe(true);
    if (grown.ok) {
      expect(grown.project.floors[2].unitAreas[0].unitId).not.toBe("flat");
      expect(validateProject(grown.project)).toEqual([]);
    }
  });
});

describe("unit ownership, wall topology and room-use swaps", () => {
  function grouped() {
    const p = empty();
    p.units = [
      { id: "a", name: "Flat A", use: "residential" },
      { id: "b", name: "Shop B", use: "commercial" },
    ];
    p.floors[0].unitAreas = [
      { unitId: "a", bounds: { x: 500, z: 500, w: 500, d: 1000 } },
      { unitId: "b", bounds: { x: 1000, z: 500, w: 500, d: 1000 } },
    ];
    p.floors[0].rooms = [
      room("bedroom-a", { x: 500, z: 500, w: 500, d: 400 }, "bedroom", "a"),
      room("shop-b", { x: 1000, z: 500, w: 500, d: 500 }, "shop", "b"),
    ];
    return p;
  }
  it("never adds automatic doors through the boundary between private units", () => {
    const p = grouped();
    expect(validateProject(p)).toEqual([]);
    const shared = deriveWalls(floorForGeometry(p, "f0")).filter(
      (w) => w.axis === "z" && w.x === 1000,
    );
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.every((w) => w.opening === undefined)).toBe(true);
  });
  it("swaps use and names while preserving IDs, geometry, unit membership and every wall", () => {
    const p = grouped(),
      walls = deriveWalls(floorForGeometry(p, "f0")),
      swapped = swapRoomUses(p, "f0", "bedroom-a", "shop-b");
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(swapped.project.floors[0].rooms[0]).toEqual({
      ...p.floors[0].rooms[0],
      name: "shop-b",
      kind: "shop",
    });
    expect(deriveWalls(floorForGeometry(swapped.project, "f0"))).toEqual(walls);
  });
  it("constrains edits to their unit and validates unit-area changes", () => {
    const p = grouped();
    expect(
      updateRoom(p, "f0", "bedroom-a", {
        bounds: { x: 950, z: 500, w: 500, d: 400 },
      }).ok,
    ).toBe(false);
    expect(
      updateUnitArea(p, "f0", "a", { x: 500, z: 500, w: 300, d: 1000 }).ok,
    ).toBe(false);
    const renamed = renameUnit(p, "a", "My flat");
    expect(renamed.ok).toBe(true);
    if (renamed.ok) expect(renamed.project.units[0].name).toBe("My flat");
    expect(
      addUnitArea(
        p,
        "f0",
        { name: "Overlap", use: "commercial" },
        { x: 500, z: 500, w: 300, d: 300 },
      ).ok,
    ).toBe(false);
  });
  it("splits partial shared walls into non-overlapping canonical segments", () => {
    const p = empty();
    p.floors[0].rooms = [
      room("a", { x: 500, z: 500, w: 400, d: 600 }),
      room("b", { x: 900, z: 700, w: 400, d: 200 }),
    ];
    const walls = deriveWalls(floorForGeometry(p, "f0"));
    expect(
      walls
        .filter((w) => w.axis === "z" && w.x === 900)
        .map((w) => [w.z, w.length])
        .sort((a, b) => a[0] - b[0]),
    ).toEqual([
      [500, 200],
      [700, 200],
      [900, 200],
    ]);
  });
});

describe("slabs, statistics and plot edits", () => {
  it("subtracts courtyards on every slab and stairs only when requested", () => {
    const p = createPreset("courtyard"),
      floor: GeometryFloor = floorForGeometry(p, p.floors[0].id),
      court = floor.voids.find((v) => v.kind === "courtyard")!.bounds,
      stairs = floor.voids.find((v) => v.kind === "stairs")!.bounds;
    const ground = slabTiles(floor, false),
      upper = slabTiles(floor, true);
    expect(area(ground)).toBe(
      floor.footprint.w * floor.footprint.d - court.w * court.d,
    );
    expect(area(upper)).toBe(area(ground) - stairs.w * stairs.d);
    expect(upper.every((t) => !overlap(t, court) && !overlap(t, stairs))).toBe(
      true,
    );
    for (const [i, t] of upper.entries())
      expect(upper.slice(i + 1).every((o) => !overlap(t, o))).toBe(true);
    expect(projectStats(p)).toMatchObject({
      plotArea: 432,
      builtArea: 320.64,
      bedrooms: 3,
    });
  });
  it("rejects plot shrinkage through balconies and preserves centimetre plot precision", () => {
    const p = createPreset("courtyard");
    expect(updatePlot(p, { depth: 2100 }).ok).toBe(false);
    const moved = updatePlot(p, { width: 2003, depth: 2507 });
    expect(moved.ok).toBe(true);
    if (moved.ok)
      expect(moved.project.plot).toMatchObject({ width: 2003, depth: 2507 });
  });
});
