import { describe, expect, it } from "vitest";
import {
  addRoom,
  createPreset,
  parseProject,
  projectStats,
  setFloorCount,
  validateProject,
} from "./model";
import { componentIds } from "./geometry";
import {
  removeStagedRoom,
  restoreStagedRoom,
  rotateStagedRoom,
  setAsideRoom,
  updateStagedRoom,
} from "./tray";
import type { EditResult, Project } from "./types";

function successful(result: EditResult): Project {
  if (!result.ok) throw new Error(result.error);
  return result.project;
}
function sketch(): Project {
  return {
    schemaVersion: 2,
    name: "Puzzle house",
    plot: { width: 1600, depth: 1800, north: 0, road: "south", setback: 100 },
    floors: [
      {
        id: "f0",
        name: "Ground floor",
        elevation: 0,
        height: 300,
        footprint: { x: 300, z: 300, w: 1000, d: 1000 },
        balconies: [],
        unitAreas: [],
        rooms: [
          {
            id: "room-bedroom",
            name: "Main bedroom",
            kind: "bedroom",
            bounds: { x: 300, z: 300, w: 300, d: 400 },
            unitId: null,
            floorFinish: "wood",
            furnishingRotation: 90,
          },
          {
            id: "kitchen",
            name: "Kitchen",
            kind: "kitchen",
            bounds: { x: 700, z: 300, w: 300, d: 300 },
            unitId: null,
          },
        ],
      },
    ],
    units: [],
    verticalSpaces: [],
    garden: false,
    parking: false,
  };
}

describe("room holding tray", () => {
  it("sets a room aside without losing identity, dimensions or appearance", () => {
    const project = sketch(),
      source = project.floors[0].rooms[0];
    const staged = successful(setAsideRoom(project, "f0", source.id));
    expect(staged.floors[0].rooms.map((room) => room.id)).toEqual(["kitchen"]);
    expect(staged.stagedRooms).toEqual([{ room: source, sourceFloorId: "f0" }]);
    expect(project.floors[0].rooms).toHaveLength(2);
    expect(project.stagedRooms).toBeUndefined();
    expect(componentIds(staged).has(source.id)).toBe(true);
    expect(projectStats(staged).bedrooms).toBe(0);
    expect(validateProject(staged)).toEqual([]);
  });

  it("restores the original place exactly when available", () => {
    const original = sketch(),
      staged = successful(setAsideRoom(original, "f0", "room-bedroom"));
    const restored = successful(
      restoreStagedRoom(staged, "room-bedroom", "f0"),
    );
    expect(restored.stagedRooms).toEqual([]);
    expect(
      restored.floors[0].rooms.find((room) => room.id === "room-bedroom"),
    ).toEqual(original.floors[0].rooms[0]);
  });

  it("does not swap or consume a tray room when dropped onto another room", () => {
    const project = successful(setAsideRoom(sketch(), "f0", "room-bedroom")),
      before = structuredClone(project);
    const result = restoreStagedRoom(project, "room-bedroom", "f0", {
      position: { x: 700, z: 300 },
    });
    expect(result.ok).toBe(false);
    expect(project).toEqual(before);
  });

  it("places precisely on the planning grid and preserves the room's size", () => {
    const staged = successful(setAsideRoom(sketch(), "f0", "room-bedroom"));
    const restored = successful(
      restoreStagedRoom(staged, "room-bedroom", "f0", {
        position: { x: 604, z: 705 },
      }),
    );
    expect(restored.floors[0].rooms.at(-1)?.bounds).toEqual({
      x: 600,
      z: 710,
      w: 300,
      d: 400,
    });
  });

  it("finds a different clear place when the original place has been filled", () => {
    let project = successful(setAsideRoom(sketch(), "f0", "room-bedroom"));
    project = successful(addRoom(project, "f0", "bedroom"));
    const newRoom = project.floors[0].rooms.at(-1)!;
    expect(newRoom.id).not.toBe("room-bedroom");
    const restored = successful(
      restoreStagedRoom(project, "room-bedroom", "f0"),
    );
    expect(restored.floors[0].rooms.at(-1)?.bounds).not.toEqual(
      sketch().floors[0].rooms[0].bounds,
    );
    expect(validateProject(restored)).toEqual([]);
  });

  it("rotates and resizes a staged room without changing placed rooms", () => {
    let project = successful(setAsideRoom(sketch(), "f0", "room-bedroom"));
    project = successful(rotateStagedRoom(project, "room-bedroom"));
    expect(project.stagedRooms?.[0].room.bounds).toMatchObject({
      w: 400,
      d: 300,
    });
    project = successful(
      updateStagedRoom(project, "room-bedroom", {
        width: 251,
        depth: 351,
        furnishing: "none",
        floorFinish: "stone",
      }),
    );
    expect(project.stagedRooms?.[0].room).toMatchObject({
      bounds: { w: 250, d: 350 },
      furnishing: "none",
      floorFinish: "stone",
    });
    expect(project.floors[0].rooms).toHaveLength(1);
    expect(updateStagedRoom(project, "room-bedroom", { width: 100 }).ok).toBe(
      false,
    );
  });

  it("keeps room in tray when it cannot fit and allows removal", () => {
    let project = successful(setAsideRoom(sketch(), "f0", "room-bedroom"));
    project = successful(
      updateStagedRoom(project, "room-bedroom", { width: 1600 }),
    );
    expect(restoreStagedRoom(project, "room-bedroom", "f0").ok).toBe(false);
    expect(project.stagedRooms).toHaveLength(1);
    expect(
      successful(removeStagedRoom(project, "room-bedroom")).stagedRooms,
    ).toEqual([]);
    expect(removeStagedRoom(project, "missing").ok).toBe(false);
  });

  it("keeps staged rooms across removal of their original floor", () => {
    let project = createPreset("family");
    const source = project.floors.at(-1)!;
    const room = source.rooms[0];
    project = successful(setAsideRoom(project, source.id, room.id));
    project = successful(setFloorCount(project, 1));
    expect(project.stagedRooms?.[0].room).toEqual(room);
    expect(validateProject(project)).toEqual([]);
    expect(parseProject(JSON.stringify(project))).toEqual(project);
  });

  it("enforces destination unit ownership", () => {
    let project = sketch();
    project.floors[0].rooms = [project.floors[0].rooms[0]];
    project.units = [{ id: "flat-1", name: "Flat 1", use: "residential" }];
    project.floors[0].unitAreas = [
      { unitId: "flat-1", bounds: { x: 300, z: 300, w: 600, d: 1000 } },
    ];
    project.floors[0].rooms[0].unitId = "flat-1";
    project = successful(setAsideRoom(project, "f0", "room-bedroom"));
    expect(
      restoreStagedRoom(project, "room-bedroom", "f0", {
        position: { x: 900, z: 300 },
        unitId: "flat-1",
      }).ok,
    ).toBe(false);
    expect(
      restoreStagedRoom(project, "room-bedroom", "f0", {
        position: { x: 900, z: 300 },
        unitId: null,
      }).ok,
    ).toBe(true);
  });
});

it("limits tray capacity and preserves every existing piece when full", () => {
  const project = sketch();
  project.stagedRooms = Array.from({ length: 48 }, (_, index) => ({
    sourceFloorId: "removed-floor",
    room: { ...project.floors[0].rooms[0], id: `held-${index}` },
  }));
  expect(validateProject(project)).toEqual([]);
  expect(setAsideRoom(project, "f0", "kitchen").ok).toBe(false);
  expect(project.stagedRooms).toHaveLength(48);
  expect(project.floors[0].rooms).toHaveLength(2);
  const oversized = [
    ...project.stagedRooms,
    {
      ...project.stagedRooms[0],
      room: { ...project.stagedRooms[0].room, id: "held-extra" },
    },
  ];
  expect(() =>
    parseProject(JSON.stringify({ ...project, stagedRooms: oversized })),
  ).toThrow(/48/);
});

describe("backward-compatible room save extensions", () => {
  it("preserves omission for older v2 projects and roundtrips tray and room settings", () => {
    const old = createPreset("compact");
    expect(parseProject(JSON.stringify(old))).toEqual(old);
    expect(parseProject(JSON.stringify(old))).not.toHaveProperty("stagedRooms");
    const staged = successful(setAsideRoom(sketch(), "f0", "room-bedroom"));
    expect(parseProject(JSON.stringify(staged))).toEqual(staged);
  });

  it.each([
    ["furnishingRotation", 45],
    ["floorFinish", "marble"],
    ["furnishing", true],
  ])("rejects invalid %s without silently stripping it", (field, value) => {
    const project = sketch();
    Object.assign(project.floors[0].rooms[0], { [field]: value });
    expect(() => parseProject(JSON.stringify(project))).toThrow(
      /finish|furnishing/,
    );
  });

  it("rejects duplicate room IDs and malformed tray records", () => {
    const project = sketch();
    project.stagedRooms = [
      { room: project.floors[0].rooms[0], sourceFloorId: "f0" },
    ];
    expect(() => parseProject(JSON.stringify(project))).toThrow(/unique/);
    expect(() =>
      parseProject(
        JSON.stringify({ ...sketch(), stagedRooms: [{ room: {} }] }),
      ),
    ).toThrow(/tray/);
    expect(() =>
      parseProject(JSON.stringify({ ...sketch(), stagedRooms: null })),
    ).toThrow(/tray/);
  });
});
