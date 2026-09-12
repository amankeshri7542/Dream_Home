import { describe, expect, it } from "vitest";
import {
  addCatalogRoom,
  duplicateRoom,
  moveRoomSmart,
  resizeBuilding,
  ROOM_CATALOG,
  rotateRoom,
  swapRoomPositions,
} from "./builder";
import { createPreset, parseProject, validateProject } from "./model";
import type { Project, Rect, Room } from "./types";

function empty(): Project {
  const project = createPreset("compact");
  project.floors[0].rooms = [];
  project.verticalSpaces = [];
  project.units = [];
  project.floors[0].unitAreas = [];
  return project;
}
const room = (id: string, bounds: Rect): Room => ({
  id,
  name: id,
  kind: "bedroom",
  unitId: null,
  bounds,
});
const sourceBounds = { x: 250, z: 450, w: 300, d: 300 };

describe("room catalog", () => {
  it.each(ROOM_CATALOG)(
    "adds $label with its semantic kind and custom name",
    (item) => {
      const project = empty(),
        before = JSON.stringify(project);
      const added = addCatalogRoom(project, "floor-0", item.id, "regular");
      expect(added.ok).toBe(true);
      if (!added.ok) return;
      const inserted = added.project.floors[0].rooms[0];
      expect(inserted).toMatchObject({
        name: item.label,
        kind: item.kind,
        bounds: { x: 250, z: 450, w: item.width, d: item.depth },
      });
      expect(validateProject(added.project)).toEqual([]);
      expect(parseProject(JSON.stringify(added.project))).toEqual(
        added.project,
      );
      expect(JSON.stringify(project)).toBe(before);
      expect(addCatalogRoom(project, "floor-0", item.id, "regular")).toEqual(
        added,
      );
    },
  );
  it("supports small and large sizes on the 10 cm grid", () => {
    for (const [size, width, depth] of [
      ["small", 260, 290],
      ["large", 380, 430],
    ] as const) {
      const result = addCatalogRoom(empty(), "floor-0", "bedroom", size);
      expect(result.ok).toBe(true);
      if (result.ok)
        expect(result.project.floors[0].rooms[0].bounds).toMatchObject({
          w: width,
          d: depth,
        });
    }
  });
  it("finds the first free position on the 10 cm grid using obstacle edges", () => {
    const project = empty();
    project.floors[0].rooms = [
      room("blocker", { x: 250, z: 450, w: 130, d: 1100 }),
    ];
    const result = addCatalogRoom(project, "floor-0", "prayer", "small");
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.project.floors[0].rooms[1].bounds).toEqual({
        x: 380,
        z: 450,
        w: 140,
        d: 140,
      });
  });
  it("checks an explicit snapped position instead of silently relocating a failed drop", () => {
    const project = empty();
    const valid = addCatalogRoom(project, "floor-0", "prayer", "regular", {
      x: 317,
      z: 503,
    });
    expect(valid.ok).toBe(true);
    if (valid.ok)
      expect(valid.project.floors[0].rooms[0].bounds).toMatchObject({
        x: 320,
        z: 500,
      });
    const before = JSON.stringify(project);
    expect(
      addCatalogRoom(project, "floor-0", "prayer", "regular", { x: 0, z: 0 })
        .ok,
    ).toBe(false);
    expect(
      addCatalogRoom(project, "floor-0", "prayer", "regular", {
        x: NaN,
        z: 500,
      }).ok,
    ).toBe(false);
    expect(JSON.stringify(project)).toBe(before);
  });
  it("rejects unknown catalog entries, missing floors and completely occupied plans", () => {
    const project = empty();
    expect(addCatalogRoom(project, "floor-0", "unknown", "regular").ok).toBe(
      false,
    );
    expect(addCatalogRoom(project, "missing", "bedroom", "regular").ok).toBe(
      false,
    );
    project.floors[0].rooms = [
      room("full", { ...project.floors[0].footprint }),
    ];
    const before = JSON.stringify(project);
    expect(addCatalogRoom(project, "floor-0", "prayer", "small").ok).toBe(
      false,
    );
    expect(JSON.stringify(project)).toBe(before);
  });
  it("avoids collisions with every imported component ID", () => {
    const project = empty();
    project.floors[0].id = "room-study";
    project.floors[0].rooms = [room("room-study-2", sourceBounds)];
    const result = addCatalogRoom(project, "room-study", "study", "regular");
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.project.floors[0].rooms[1].id).toBe("room-study-3");
  });
  it("handles the maximum plot without an area-sized grid scan", () => {
    const project = empty();
    project.plot = { ...project.plot, width: 10000, depth: 10000 };
    project.floors[0].footprint = { x: 200, z: 200, w: 9600, d: 9600 };
    project.floors[0].rooms = [
      room("wide", { x: 200, z: 200, w: 9600, d: 9000 }),
      room("corner", { x: 200, z: 9200, w: 9000, d: 600 }),
    ];
    for (const item of ROOM_CATALOG) {
      const result = addCatalogRoom(project, "floor-0", item.id, "large");
      expect(result.ok).toBe(true);
      if (result.ok)
        expect(result.project.floors[0].rooms[2].bounds).toMatchObject({
          x: 9200,
          z: 9200,
        });
    }
  });
});

describe("copy, rotation and smart movement", () => {
  it("duplicates custom room names and dimensions with a new ID at a free position", () => {
    const project = empty();
    project.floors[0].rooms = [
      { ...room("custom", sourceBounds), name: "Quiet study", kind: "utility" },
    ];
    const before = JSON.stringify(project);
    const copied = duplicateRoom(project, "floor-0", "custom");
    expect(copied.ok).toBe(true);
    if (!copied.ok) return;
    expect(copied.project.floors[0].rooms[1]).toMatchObject({
      name: "Quiet study copy",
      kind: "utility",
      bounds: { w: 300, d: 300 },
    });
    expect(copied.project.floors[0].rooms[1].id).not.toBe("custom");
    expect(validateProject(copied.project)).toEqual([]);
    expect(JSON.stringify(project)).toBe(before);
  });
  it("rejects duplication if no space exists, without changing the original", () => {
    const project = empty();
    project.floors[0].rooms = [
      room("full", { ...project.floors[0].footprint }),
    ];
    const before = JSON.stringify(project);
    expect(duplicateRoom(project, "floor-0", "full").ok).toBe(false);
    expect(JSON.stringify(project)).toBe(before);
  });
  it("rotates width/depth around the existing origin and rejects collisions", () => {
    const project = empty();
    project.floors[0].rooms = [room("a", { ...sourceBounds, w: 200, d: 400 })];
    const rotated = rotateRoom(project, "floor-0", "a");
    expect(rotated.ok).toBe(true);
    if (rotated.ok)
      expect(rotated.project.floors[0].rooms[0].bounds).toEqual({
        ...sourceBounds,
        w: 400,
        d: 200,
      });
    project.floors[0].rooms.push(room("b", { x: 450, z: 450, w: 200, d: 300 }));
    const before = JSON.stringify(project);
    expect(rotateRoom(project, "floor-0", "a").ok).toBe(false);
    expect(JSON.stringify(project)).toBe(before);
  });
  it("performs a regular valid snapped move without moving other rooms", () => {
    const project = empty();
    project.floors[0].rooms = [
      room("a", sourceBounds),
      room("b", { x: 650, z: 450, w: 200, d: 300 }),
    ];
    const moved = moveRoomSmart(project, "floor-0", "a", {
      ...sourceBounds,
      z: 897,
    });
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.project.floors[0].rooms[0].bounds.z).toBe(900);
      expect(moved.project.floors[0].rooms[1]).toEqual(
        project.floors[0].rooms[1],
      );
    }
  });
  it("swaps just the two origins, preserving differing dimensions, names and IDs", () => {
    const project = empty();
    project.floors[0].rooms = [
      room("a", sourceBounds),
      room("b", { x: 650, z: 450, w: 200, d: 300 }),
    ];
    const before = JSON.stringify(project);
    const swapped = swapRoomPositions(project, "floor-0", "a", "b");
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(swapped.project.floors[0].rooms).toEqual([
      room("a", { ...sourceBounds, x: 650 }),
      room("b", { x: 250, z: 450, w: 200, d: 300 }),
    ]);
    expect(swapRoomPositions(project, "floor-0", "a", "b")).toEqual(swapped);
    expect(JSON.stringify(project)).toBe(before);
  });
  it("rejects an overlapping move when its center is outside the other room", () => {
    const project = empty();
    project.floors[0].rooms = [
      room("a", { ...sourceBounds, w: 200 }),
      room("b", { x: 650, z: 450, w: 200, d: 300 }),
    ];
    expect(
      moveRoomSmart(project, "floor-0", "a", {
        ...sourceBounds,
        x: 500,
        w: 200,
      }).ok,
    ).toBe(false);
  });
  it("does not swap a resize, an ambiguous boundary drop or an arrangement that cannot fit", () => {
    const project = empty();
    project.floors[0].rooms = [
      room("a", { ...sourceBounds, w: 400, d: 400 }),
      room("b", { x: 900, z: 450, w: 200, d: 300 }),
    ];
    const before = JSON.stringify(project);
    expect(swapRoomPositions(project, "floor-0", "a", "b").ok).toBe(false);
    expect(
      moveRoomSmart(project, "floor-0", "a", { x: 850, z: 450, w: 300, d: 400 })
        .ok,
    ).toBe(false);
    expect(JSON.stringify(project)).toBe(before);
    project.floors[0].rooms = [
      room("a", { ...sourceBounds, w: 200 }),
      room("b", { x: 650, z: 450, w: 200, d: 300 }),
      room("c", { x: 850, z: 450, w: 200, d: 300 }),
    ];
    expect(
      moveRoomSmart(project, "floor-0", "a", {
        ...sourceBounds,
        x: 750,
        w: 200,
      }).ok,
    ).toBe(false);
    expect(project.floors[0].rooms[0].bounds.x).toBe(250);
  });
});

describe("building dimensions and finish persistence", () => {
  it("resizes all aligned floorplates while keeping origins and contents unchanged", () => {
    const project = createPreset("courtyard"),
      before = JSON.stringify(project);
    const result = resizeBuilding(project, project.floors[1].id, {
      w: 1257,
      d: 1453,
    });
    expect(result.ok).toBe(true);
    if (result.ok)
      for (const [i, floor] of result.project.floors.entries()) {
        expect(floor.footprint).toEqual({
          ...project.floors[i].footprint,
          w: 1260,
          d: 1450,
        });
        expect(floor.rooms).toEqual(project.floors[i].rooms);
        expect(result.project.verticalSpaces).toEqual(project.verticalSpaces);
      }
    expect(JSON.stringify(project)).toBe(before);
  });
  it("rejects shrinking through any floor room or void and expansion past setbacks", () => {
    const project = createPreset("courtyard"),
      before = JSON.stringify(project);
    for (const size of [
      { w: 1000, d: 1400 },
      { w: 1200, d: 1300 },
      { w: 1800, d: 1400 },
      { w: NaN, d: 1400 },
    ])
      expect(resizeBuilding(project, "floor-0", size).ok).toBe(false);
    expect(JSON.stringify(project)).toBe(before);
    expect(resizeBuilding(project, "unknown", { w: 1200, d: 1400 }).ok).toBe(
      false,
    );
  });
  it.each(["ivory", "brick", "sand"] as const)(
    "round-trips the optional %s finish",
    (finish) => {
      const project = { ...createPreset("compact"), finish };
      expect(validateProject(project)).toEqual([]);
      expect(parseProject(JSON.stringify(project))).toEqual(project);
    },
  );
  it("preserves missing finish on legacy projects and rejects any other value", () => {
    const legacy = createPreset("compact");
    expect(parseProject(JSON.stringify(legacy))).not.toHaveProperty("finish");
    expect(parseProject(JSON.stringify(legacy))).toEqual(legacy);
    for (const finish of ["wood", "", null, 1, {}, ["brick"]])
      expect(() => parseProject(JSON.stringify({ ...legacy, finish }))).toThrow(
        /finish/,
      );
  });
});
