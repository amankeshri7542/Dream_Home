import { describe, expect, it } from "vitest";
import { corpus } from "./__fixtures__/corpus";
import { addCatalogRoom, duplicateRoom, resizeBuilding } from "./builder";
import { floorForGeometry } from "./core";
import {
  addBalcony,
  addRoom,
  addVerticalSpace,
  parseProject,
  removeRoom,
  updateBalcony,
  updateRoom,
  updateVerticalSpace,
  validateProjectIssues,
} from "./model";
import {
  addOpening,
  addRoomWindow,
  customizeOpenings,
  ensureRoomDoor,
  listCompatibleWalls,
  moveOpening,
  removeOpening,
  resetOpenings,
  updateOpening,
} from "./openingCommands";
import {
  OPENING_SPECS,
  materializeOpenings,
  openingAt,
  openingSide,
  roomHasPassage,
  snapToWall,
} from "./openings";
import { restoreStagedRoom, setAsideRoom } from "./tray";
import type { EditResult, PlacedOpening, Project, Rect, Room } from "./types";
import { autoOpenings, deriveWallSegments, deriveWalls } from "./walls";

const room = (id: string, bounds: Rect, kind: Room["kind"] = "bedroom"): Room => ({
  id,
  name: id,
  kind,
  bounds,
  unitId: null,
});
function sketch(rooms: Room[] = []): Project {
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
        rooms,
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
const house = () =>
  sketch([
    room("bed", { x: 500, z: 500, w: 400, d: 400 }),
    room("living", { x: 1000, z: 500, w: 500, d: 400 }, "living"),
    room("kitchen", { x: 500, z: 900, w: 1000, d: 600 }, "kitchen"),
  ]);
const ok = (result: EditResult): Project => {
  if (!result.ok) throw new Error(result.error);
  return result.project;
};
const errors = (p: Project) =>
  validateProjectIssues(p).filter((i) => i.severity === "error");
const openingsOf = (p: Project, floor = 0) => p.floors[floor].openings!;
const blank = (p: Project) => ({
  ...p,
  floors: p.floors.map((f) => ({ ...f, openings: [] as PlacedOpening[] })),
});

describe("materialising automatic openings", () => {
  it("always produces a valid explicit list for every corpus project", () => {
    for (const { name, project } of corpus()) {
      let p = project;
      for (const floor of project.floors) {
        const auto = autoOpenings(
          floorForGeometry(project, floor.id),
          project.plot.road,
        );
        const { project: next, idMap } = materializeOpenings(p, floor.id);
        p = next;
        expect(idMap.size, name).toBe(auto.length);
        expect(
          p.floors.find((f) => f.id === floor.id)!.openings!.map((o) => o.center),
        ).toEqual(auto.map((o) => o.center));
      }
      expect(errors(p), name).toEqual([]);
      // The rendered walls are unchanged by materialisation.
      for (const floor of project.floors) {
        const shape = (q: Project) =>
          deriveWalls(floorForGeometry(q, floor.id), q.plot.road).map((w) =>
            w.openings.map(({ kind, offset, width, height, sill }) => ({
              kind,
              offset,
              width,
              height,
              sill,
            })),
          );
        expect(shape(p)).toEqual(shape(project));
      }
      expect(parseProject(JSON.stringify(p))).toStrictEqual(p);
    }
  });
  it("allocates ids in wall order and maps auto ids", () => {
    const { project, idMap } = materializeOpenings(house(), "f0");
    const ids = openingsOf(project).map((o) => o.id);
    expect(ids[0]).toBe("opening");
    expect(ids[1]).toBe("opening-2");
    expect([...idMap.values()]).toEqual(ids);
    expect([...idMap.keys()].every((k) => k.startsWith("auto:"))).toBe(true);
    expect(materializeOpenings(project, "f0").project).toBe(project);
  });
});

describe("explicit opening rules", () => {
  it("snaps a plan point to the nearest wall that accepts the kind", () => {
    const p = blank(house());
    const geo = floorForGeometry(p, "f0");
    const segments = deriveWallSegments(geo);
    expect(
      snapToWall(geo, segments, { x: 1203, z: 520 }, "window", 150, {
        openings: [],
      }),
    ).toMatchObject({ axis: "x", line: 500, center: 1205 });
    // Interior walls never take windows; archways never take outside walls.
    const interior = snapToWall(geo, segments, { x: 905, z: 700 }, "window", 150, {
      openings: [],
      thresholdCm: 30,
    });
    expect(interior).toBeNull();
    expect(
      snapToWall(geo, segments, { x: 700, z: 905 }, "archway", 120, {
        openings: [],
      }),
    ).toMatchObject({ axis: "x", line: 900 });
    // Locked to a wall line, the opening slides to the nearest free spot.
    const taken: PlacedOpening[] = [
      { id: "w", kind: "window", axis: "x", line: 500, center: 1250, width: 150, height: 135, sill: 90 },
    ];
    const slid = snapToWall(geo, segments, { x: 1250, z: 400 }, "window", 150, {
      openings: taken,
      lockLine: { axis: "x", line: 500 },
    })!;
    expect(Math.abs(slid.center - 1250)).toBeGreaterThanOrEqual(170);
  });
  it("adds, moves, updates and removes openings with focus ids", () => {
    let p = ok(customizeOpenings(blank(house()), "f0"));
    const added = addOpening(p, "f0", "window", { x: 1250, z: 510 });
    expect(added.ok && added.focusId).toBe("opening");
    p = ok(added);
    expect(openingsOf(p)[0]).toMatchObject({
      kind: "window",
      axis: "x",
      line: 500,
      center: 1250,
      ...{ width: 150, height: 135, sill: 90 },
    });
    p = ok(moveOpening(p, "f0", "opening", { axis: "x", line: 500, center: 1301 }));
    expect(openingsOf(p)[0].center).toBe(1300);
    p = ok(updateOpening(p, "f0", "opening", { kind: "picture-window" }));
    expect(openingsOf(p)[0]).toMatchObject({
      kind: "picture-window",
      width: 240,
      height: 210,
      sill: 30,
    });
    const door = ok(addOpening(p, "f0", "door", { axis: "x", line: 900, center: 700 }));
    const id = openingsOf(door)[1].id;
    const sliding = ok(updateOpening(door, "f0", id, { kind: "sliding-door" }));
    expect(openingsOf(sliding)[1]).toMatchObject({ kind: "sliding-door", width: 210 });
    const archway = ok(updateOpening(door, "f0", id, { kind: "archway", swing: 1 }));
    expect(openingsOf(archway)[1]).toMatchObject({ kind: "archway", swing: 1 });
    expect(openingsOf(ok(removeOpening(p, "f0", "opening")))).toEqual([]);
  });
  it("rejects windows inside, overlaps, off-grid and out-of-range sizes", () => {
    const p = ok(customizeOpenings(blank(house()), "f0"));
    const interior = addOpening(p, "f0", "window", { axis: "z", line: 900, center: 700 });
    expect(interior.ok).toBe(false);
    if (!interior.ok) {
      expect(interior.error).toBe("Windows go on outside walls.");
      expect(interior.issues?.[0]).toMatchObject({
        code: "opening-placement",
        source: { kind: "opening", floorId: "f0" },
      });
    }
    const one = ok(addOpening(p, "f0", "window", { axis: "x", line: 500, center: 1250 }));
    const clash = addOpening(one, "f0", "window", { axis: "x", line: 500, center: 1330 });
    expect(!clash.ok && clash.issues?.[0].code).toBe("opening-overlap");
    const corner = addOpening(p, "f0", "window", { axis: "x", line: 500, center: 1080 });
    expect(!corner.ok && corner.issues?.[0].code).toBe("opening-margin");
    const narrow = addOpening(p, "f0", "door", { axis: "x", line: 900, center: 700 }, { width: 65 });
    expect(!narrow.ok && narrow.issues?.[0].code).toBe("opening-shape");
    const tall = addOpening(p, "f0", "window", { axis: "x", line: 500, center: 1250 }, { sill: 150, height: 180 });
    expect(!tall.ok && tall.error).toBe("Doors and windows must stay below 2.85 m.");
    const offWall = addOpening(p, "f0", "door", { axis: "x", line: 700, center: 700 });
    expect(!offWall.ok && offWall.issues?.[0].code).toBe("opening-off-wall");
    const offGrid = parseProject(JSON.stringify(p));
    offGrid.floors[0].openings = [
      { id: "o", kind: "door", axis: "x", line: 905, center: 700, width: 90, height: 215, sill: 0 },
    ];
    expect(errors(offGrid).map((i) => i.code)).toContain("opening-shape");
    expect(() =>
      parseProject(
        JSON.stringify({
          ...p,
          floors: [{ ...p.floors[0], openings: [{ id: "x", kind: "porthole" }] }],
        }),
      ),
    ).toThrow("Project contains an invalid opening.");
  });
  it("accepts automatic ids and resets to automatic", () => {
    const p = house();
    const auto = deriveWalls(floorForGeometry(p, "f0"), "south")
      .flatMap((w) => w.openings)
      .find((o) => o.kind === "door")!;
    expect(openingAt(p, "f0", auto.id)?.opening.auto).toBe(true);
    const moved = moveOpening(p, "f0", auto.id, {
      ...openingAt(p, "f0", auto.id)!.opening,
    });
    expect(moved.ok).toBe(true);
    const removed = ok(removeOpening(p, "f0", auto.id));
    expect(openingsOf(removed)).toHaveLength(openingsOf(ok(customizeOpenings(p, "f0"))).length - 1);
    expect(ok(resetOpenings(removed, "f0")).floors[0].openings).toBeUndefined();
    expect(ok(resetOpenings(removed, "f0"))).toStrictEqual(p);
  });
  it("adds a door to a room without one and a window on its longest outside wall", () => {
    const p = ok(customizeOpenings(blank(house()), "f0"));
    const doorResult = ensureRoomDoor(p, "f0", "bed");
    const withDoor = ok(doorResult);
    expect(roomHasPassage(withDoor.floors[0].rooms[0], openingsOf(withDoor))).toBe(true);
    expect(ok(ensureRoomDoor(withDoor, "f0", "bed"))).toBe(withDoor);
    const withWindow = ok(addRoomWindow(withDoor, "f0", "kitchen"));
    const window = openingsOf(withWindow).at(-1)!;
    expect(window).toMatchObject({ kind: "window", width: 150, axis: "x", line: 1500 });
    // Until the homeowner sets the compass, walls are named from the road…
    const labels = listCompatibleWalls(p, "f0", "window").map((w) => w.label);
    expect(labels).toContain("Back wall of bed");
    expect(labels).toContain("Front wall of kitchen");
    // …and then by their true direction.
    const compass = { ...p, plot: { ...p.plot, compass: true, north: 90 } };
    const named = listCompatibleWalls(compass, "f0", "window").map((w) => w.label);
    expect(named).toContain("West wall of bed");
    expect(named).toContain("East wall of kitchen");
    expect(listCompatibleWalls(p, "f0", "archway").map((w) => w.label)).toContain(
      "Between bed and kitchen",
    );
  });
});

describe("reconciling explicit openings through structural edits", () => {
  const perimeter = (o: PlacedOpening, r: Rect) => openingSide(o, r) !== null;
  it("carries a room's doors when it moves or is resized", () => {
    const p = ok(
      customizeOpenings(
        sketch([
          room("bed", { x: 500, z: 500, w: 400, d: 400 }),
          room("living", { x: 1100, z: 500, w: 400, d: 400 }, "living"),
          room("kitchen", { x: 500, z: 900, w: 1000, d: 600 }, "kitchen"),
        ]),
        "f0",
      ),
    );
    const bed = p.floors[0].rooms[0];
    const doors = openingsOf(p).filter(
      (o) => o.kind === "door" && perimeter(o, bed.bounds),
    );
    expect(doors.length).toBeGreaterThan(0);
    for (const bounds of [
      { ...bed.bounds, x: 600 },
      { ...bed.bounds, w: 500 },
    ]) {
      const result = updateRoom(p, "f0", "bed", { bounds });
      const moved = ok(result);
      expect(result.ok && result.notices).toBeUndefined();
      for (const door of doors) {
        const after = openingsOf(moved).find((o) => o.id === door.id)!;
        expect(perimeter(after, bounds)).toBe(true);
      }
      expect(errors(moved)).toEqual([]);
    }
  });
  it("drops orphaned openings with a notice when a room leaves", () => {
    for (const command of [
      (p: Project) => removeRoom(p, "f0", "bed"),
      (p: Project) => setAsideRoom(p, "f0", "bed"),
    ]) {
      const p = ok(customizeOpenings(house(), "f0"));
      const result = command(p);
      const next = ok(result);
      const gone = openingsOf(p).filter(
        (o) => !openingsOf(next).some((n) => n.id === o.id),
      );
      expect(gone.length).toBeGreaterThan(0);
      expect(result.ok && result.notices?.map((n) => n.source?.id)).toEqual(
        gone.map((o) => o.id),
      );
      expect(result.ok && result.notices?.[0]).toMatchObject({
        code: "opening-removed",
        severity: "notice",
      });
      expect(errors(next)).toEqual([]);
    }
  });
  it("gives a new room on a customised floor its own door", () => {
    const base = ok(
      customizeOpenings(sketch([room("kitchen", { x: 500, z: 900, w: 1000, d: 600 }, "kitchen")]), "f0"),
    );
    const withBed = ok(addRoom(base, "f0", "bedroom"));
    const bedId = withBed.floors[0].rooms.at(-1)!.id;
    const trayed = ok(setAsideRoom(withBed, "f0", bedId));
    for (const next of [
      withBed,
      ok(addCatalogRoom(base, "f0", "bathroom", "regular")),
      ok(duplicateRoom(withBed, "f0", bedId)),
      ok(restoreStagedRoom(trayed, bedId, "f0", { position: { x: 900, z: 500 } })),
    ]) {
      const added = next.floors[0].rooms.at(-1)!;
      expect(roomHasPassage(added, openingsOf(next))).toBe(true);
      expect(errors(next)).toEqual([]);
    }
  });
  it("carries outside windows when the building grows", () => {
    const p = ok(customizeOpenings(house(), "f0"));
    const east = openingsOf(p).filter((o) => o.axis === "z" && o.line === 1500);
    expect(east.length).toBeGreaterThan(0);
    const grown = ok(resizeBuilding(p, "f0", { w: 1100, d: 1000 }));
    for (const o of east)
      expect(openingsOf(grown).find((n) => n.id === o.id)).toMatchObject({
        line: 1600,
        center: o.center,
      });
    expect(errors(grown)).toEqual([]);
  });
  it("moves a balcony door with its balcony", () => {
    let p = ok(addBalcony(house(), "f0", { edge: "south", offset: 100, width: 300, depth: 150 }));
    p = ok(customizeOpenings(p, "f0"));
    const within = (o: PlacedOpening, start: number, span: number) =>
      o.center - o.width / 2 >= start && o.center + o.width / 2 <= start + span;
    const door = openingsOf(p).find(
      (o) => o.kind === "door" && o.line === 1500 && within(o, 600, 300),
    )!;
    expect(door).toBeDefined();
    const balcony = p.floors[0].balconies[0];
    const moved = ok(updateBalcony(p, "f0", balcony.id, { offset: 500 }));
    const after = openingsOf(moved).find((o) => o.id === door.id)!;
    expect(after).toMatchObject({ axis: "x", line: 1500 });
    expect(within(after, 1000, 300)).toBe(true);
    expect(errors(moved)).toEqual([]);
    const turned = ok(updateBalcony(p, "f0", balcony.id, { edge: "east", offset: 200 }));
    const side = openingsOf(turned).find((o) => o.id === door.id)!;
    expect(side).toMatchObject({ axis: "z", line: 1500 });
    expect(within(side, 700, 300)).toBe(true);
    expect(errors(turned)).toEqual([]);
  });
  it("carries courtyard openings when the courtyard moves", () => {
    let p = sketch([room("kitchen", { x: 500, z: 900, w: 1000, d: 600 }, "kitchen")]);
    p = ok(
      addVerticalSpace(p, {
        kind: "courtyard",
        bounds: { x: 600, z: 550, w: 200, d: 200 },
        floorIds: ["f0"],
        unitId: null,
      }),
    );
    p = ok(customizeOpenings(p, "f0"));
    const court = p.verticalSpaces[0];
    const around = openingsOf(p).filter((o) => perimeter(o, court.bounds));
    expect(around.length).toBe(4);
    const moved = ok(
      updateVerticalSpace(p, court.id, { bounds: { ...court.bounds, x: 700 } }),
    );
    for (const o of around) {
      const after = openingsOf(moved).find((n) => n.id === o.id)!;
      if (o.axis === "x") expect(after.center).toBe(o.center + 100);
      else expect(after.line).toBe(o.line + 100);
    }
    expect(errors(moved)).toEqual([]);
  });
  it("leaves automatic floors and unrelated edits alone", () => {
    const p = house();
    const next = ok(updateRoom(p, "f0", "bed", { name: "Nursery" }));
    expect(next.floors[0].openings).toBeUndefined();
    const custom = ok(customizeOpenings(p, "f0"));
    const renamed = ok(updateRoom(custom, "f0", "bed", { name: "Nursery" }));
    expect(openingsOf(renamed)).toBe(openingsOf(custom));
    expect(Object.keys(OPENING_SPECS)).toHaveLength(6);
  });
});
