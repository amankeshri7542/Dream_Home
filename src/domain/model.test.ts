import { describe, expect, it } from "vitest";
import {
  addRoom,
  balconyBounds,
  createPreset,
  deriveWalls,
  parseProject,
  projectStats,
  removeRoom,
  setFloorCount,
  slabTiles,
  updatePlot,
  updateRoom,
  validateProject,
} from "./model";
import type { Floor, Rect } from "./types";

const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
const area = (tiles: Rect[]) =>
  tiles.reduce((sum, tile) => sum + tile.w * tile.d, 0);

describe("presets and persistence", () => {
  it.each(["courtyard", "compact", "family"] as const)(
    "%s is valid, deterministic and losslessly serializable",
    (id) => {
      const project = createPreset(id);
      expect(validateProject(project)).toEqual([]);
      expect(createPreset(id)).toEqual(project);
      expect(parseProject(JSON.stringify(project))).toEqual(project);
      expect(deriveWalls(project.floors[0])).toEqual(
        deriveWalls(createPreset(id).floors[0]),
      );
    },
  );
  it("rejects malformed, unsupported and oversized imports without rendering them", () => {
    for (const source of [
      "null",
      "[]",
      "{}",
      "{",
      JSON.stringify({ ...createPreset("compact"), schemaVersion: 2 }),
      " ".repeat(200001),
    ])
      expect(() => parseProject(source)).toThrow();
    const project = createPreset("compact");
    project.floors[0].rooms[0].bounds.w = 1e200;
    expect(() => parseProject(JSON.stringify(project))).toThrow();
    const excess = createPreset("compact");
    excess.floors[0].rooms = Array.from(
      { length: 25 },
      () => excess.floors[0].rooms[0],
    );
    expect(() => parseProject(JSON.stringify(excess))).toThrow();
  });
  it("rejects invalid kinds, duplicate IDs, and misaligned floors", () => {
    const project = createPreset("courtyard");
    project.floors[0].rooms[0].id = project.floors[0].rooms[1].id;
    expect(() => parseProject(JSON.stringify(project))).toThrow(/ID/);
    const wrongKind = JSON.stringify(createPreset("compact")).replace(
      '"kind":"living"',
      '"kind":"unknown"',
    );
    expect(() => parseProject(wrongKind)).toThrow(/room type/);
    const shifted = createPreset("courtyard");
    shifted.floors[1].voids[0].bounds.x += 10;
    expect(validateProject(shifted).join(" ")).toMatch(/align/);
  });
  it("strips unknown imported properties", () => {
    const source = {
      ...createPreset("compact"),
      unwanted: { dangerous: true },
    };
    expect(parseProject(JSON.stringify(source))).not.toHaveProperty("unwanted");
  });
});

describe("atomic editing", () => {
  it("rejects overlaps, void collisions and out-of-bounds moves without changing input", () => {
    const project = createPreset("courtyard"),
      before = JSON.stringify(project);
    const floor = project.floors[0],
      room = floor.rooms[0];
    for (const bounds of [
      floor.rooms[1].bounds,
      floor.voids[0].bounds,
      { ...room.bounds, x: -100 },
    ]) {
      expect(updateRoom(project, floor.id, room.id, { bounds }).ok).toBe(false);
      expect(JSON.stringify(project)).toBe(before);
    }
  });
  it("allows a valid resize, snaps centimetres and preserves stable IDs", () => {
    const project = createPreset("courtyard"),
      floor = project.floors[0],
      room = floor.rooms[0];
    const edited = updateRoom(project, floor.id, room.id, {
      bounds: { ...room.bounds, w: 407 },
    });
    expect(edited.ok).toBe(true);
    if (edited.ok) {
      expect(edited.project.floors[0].rooms[0].bounds.w).toBe(410);
      expect(edited.project.floors[0].rooms[0].id).toBe(room.id);
      expect(project.floors[0].rooms[0].bounds.w).toBe(450);
    }
  });
  it("accepts shared edges but rejects even a 10 cm overlap", () => {
    const project = createPreset("compact"),
      f = project.floors[0];
    f.rooms = [
      {
        id: "a",
        name: "A",
        kind: "bedroom",
        bounds: { x: 250, z: 450, w: 300, d: 300 },
      },
      {
        id: "b",
        name: "B",
        kind: "bedroom",
        bounds: { x: 550, z: 450, w: 300, d: 300 },
      },
    ];
    expect(validateProject(project)).toEqual([]);
    expect(
      updateRoom(project, f.id, "a", {
        bounds: { ...f.rooms[0].bounds, w: 310 },
      }).ok,
    ).toBe(false);
  });
  it("adds into free circulation and supports removing without renumbering rooms", () => {
    const project = createPreset("compact"),
      floor = project.floors[0];
    const removed = removeRoom(project, floor.id, floor.rooms[0].id);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    const added = addRoom(removed.project, floor.id, "bedroom");
    expect(added.ok).toBe(true);
    if (added.ok) {
      expect(validateProject(added.project)).toEqual([]);
      expect(added.project.floors[0].rooms[0].id).toBe(floor.rooms[1].id);
    }
  });
  it("rejects plot changes that would violate setbacks", () => {
    const project = createPreset("courtyard");
    expect(updatePlot(project, { width: 1400 }).ok).toBe(false);
    expect(updatePlot(project, { setback: 400 }).ok).toBe(false);
    expect(updatePlot(project, { north: 90, width: 2000 }).ok).toBe(true);
  });
  it("adds floors with aligned independent geometry and unique IDs", () => {
    const project = createPreset("compact");
    const added = setFloorCount(project, 3);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(validateProject(added.project)).toEqual([]);
    expect(added.project.floors.map((f) => f.elevation)).toEqual([0, 300, 600]);
    expect(added.project.floors[2].voids[0].bounds).toEqual(
      project.floors[0].voids[0].bounds,
    );
    added.project.floors[2].rooms[0].bounds.w = 120;
    expect(project.floors[0].rooms[0].bounds.w).toBe(400);
    expect(setFloorCount(project, 4).ok).toBe(false);
  });
  it("allocates floor and child IDs safely after importing custom IDs", () => {
    const project = createPreset("compact");
    project.floors[0].id = "floor-1";
    project.floors[0].rooms[0].id = "floor-1-2-room-0";
    project.floors[0].voids[0].id = "floor-2";
    const imported = parseProject(JSON.stringify(project));
    const added = setFloorCount(imported, 3);
    expect(added.ok).toBe(true);
    if (added.ok) {
      expect(validateProject(added.project)).toEqual([]);
      expect(added.project.floors[0]).toEqual(imported.floors[0]);
      expect(added.project.floors[1].id).toBe("floor-1-2");
      expect(added.project.floors[1].rooms[0].id).toBe("floor-1-2-room-0-2");
    }
  });
  it("includes balconies in setback validation and rejects clipping atomically", () => {
    const project = createPreset("courtyard"),
      before = JSON.stringify(project);
    expect(balconyBounds(project.floors[1])).toEqual({
      x: 720,
      z: 1900,
      w: 360,
      d: 150,
    });
    // The plate fits a 2100 cm plot with 200 cm setbacks; its balcony does not.
    expect(updatePlot(project, { depth: 2100 })).toEqual({
      ok: false,
      error: expect.stringContaining("balcony"),
    });
    expect(JSON.stringify(project)).toBe(before);
    expect(updatePlot(project, { depth: 2250 }).ok).toBe(true);
  });
});

describe("procedural geometry", () => {
  it("deduplicates partially shared walls without overlapping segments", () => {
    const floor: Floor = {
      id: "floor",
      name: "Ground",
      elevation: 0,
      height: 300,
      footprint: { x: 0, z: 0, w: 1000, d: 1000 },
      balcony: false,
      voids: [],
      rooms: [
        {
          id: "a",
          name: "A",
          kind: "living",
          bounds: { x: 0, z: 0, w: 400, d: 600 },
        },
        {
          id: "b",
          name: "B",
          kind: "kitchen",
          bounds: { x: 400, z: 200, w: 400, d: 200 },
        },
      ],
    };
    const walls = deriveWalls(floor);
    const shared = walls.filter((w) => w.axis === "z" && w.x === 400);
    expect(
      shared.map((w) => [w.z, w.length]).sort((a, b) => a[0] - b[0]),
    ).toEqual([
      [0, 200],
      [200, 200],
      [400, 200],
    ]);
    for (const [i, a] of walls.entries())
      for (const b of walls.slice(i + 1)) {
        if (a.axis === b.axis && (a.axis === "x" ? a.z === b.z : a.x === b.x)) {
          const aStart = a.axis === "x" ? a.x : a.z,
            bStart = b.axis === "x" ? b.x : b.z;
          expect(aStart < bStart + b.length && aStart + a.length > bStart).toBe(
            false,
          );
        }
      }
    for (const wall of walls)
      if (wall.opening) expect(wall.opening.width).toBeLessThan(wall.length);
  });
  it("subtracts courtyard on ground and staircase only on upper slabs", () => {
    const floor = createPreset("courtyard").floors[0];
    const courtyard = floor.voids.find((v) => v.kind === "courtyard")!.bounds;
    const stairs = floor.voids.find((v) => v.kind === "stairs")!.bounds;
    const ground = slabTiles(floor, false),
      upper = slabTiles(floor, true);
    expect(area(ground)).toBe(
      floor.footprint.w * floor.footprint.d - courtyard.w * courtyard.d,
    );
    expect(area(upper)).toBe(area(ground) - stairs.w * stairs.d);
    expect(
      upper.every((t) => !intersects(t, stairs) && !intersects(t, courtyard)),
    ).toBe(true);
    for (const [i, tile] of upper.entries())
      expect(
        upper.slice(i + 1).every((other) => !intersects(tile, other)),
      ).toBe(true);
  });
  it.each(["south", "north", "east", "west"] as const)(
    "places the ground entrance on the %s road side away from stairs",
    (road) => {
      const floor = createPreset("courtyard").floors[0],
        p = floor.footprint;
      const entrance = deriveWalls(floor, road).find(
        (w) => w.exterior && w.opening?.kind === "door",
      )!;
      expect(entrance).toBeDefined();
      if (road === "south" || road === "north") {
        expect(entrance.axis).toBe("x");
        expect(entrance.z).toBe(road === "south" ? p.z + p.d : p.z);
      } else {
        expect(entrance.axis).toBe("z");
        expect(entrance.x).toBe(road === "east" ? p.x + p.w : p.x);
      }
      const x = entrance.x + (entrance.axis === "x" ? entrance.length / 2 : 0),
        z = entrance.z + (entrance.axis === "z" ? entrance.length / 2 : 0);
      const landing =
        entrance.axis === "x"
          ? { x: x - 55, z: z + (road === "north" ? 0 : -2), w: 110, d: 2 }
          : { x: x + (road === "west" ? 0 : -2), z: z - 55, w: 2, d: 110 };
      expect(floor.voids.every((v) => !intersects(v.bounds, landing))).toBe(
        true,
      );
    },
  );
  it("keeps upper doors within the south balcony regardless of road orientation", () => {
    const floor = createPreset("courtyard").floors[1],
      balcony = balconyBounds(floor);
    const door = deriveWalls(floor, "north").find(
      (w) => w.exterior && w.opening?.kind === "door",
    )!;
    expect(door).toBeDefined();
    expect(door.axis).toBe("x");
    expect(door.z).toBe(balcony.z);
    expect(door.x + door.length / 2 - 55).toBeGreaterThanOrEqual(balcony.x);
    expect(door.x + door.length / 2 + 55).toBeLessThanOrEqual(
      balcony.x + balcony.w,
    );
    expect(
      deriveWalls({ ...floor, balcony: false }).filter(
        (w) => w.exterior && w.opening?.kind === "door",
      ),
    ).toHaveLength(0);
  });
  it("reports area in square metres and coverage independently from floor count", () => {
    const project = createPreset("courtyard"),
      stats = projectStats(project);
    expect(stats.plotArea).toBe(432);
    expect(stats.builtArea).toBeCloseTo(320.64);
    expect(stats.bedrooms).toBe(3);
    expect(stats.coverage).toBeCloseTo((160.32 / 432) * 100);
  });
});
