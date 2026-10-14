import { describe, expect, it } from "vitest";
import { corpus } from "./__fixtures__/corpus";
import { floorForGeometry } from "./core";
import {
  autoOpenings,
  deriveWallSegments,
  deriveWalls,
  segmentAt,
  wallPieces,
  wallSideRooms,
  wallStart,
} from "./walls";
import type { Wall, WallOpening } from "./types";

const opening = (offset: number, width: number, sill = 0, height = 210): WallOpening => ({
  id: `o-${offset}`,
  kind: sill ? "window" : "door",
  offset,
  width,
  sill,
  height,
  auto: false,
});
const area = (w: Pick<Wall, "length" | "openings">, h: number) =>
  wallPieces(w, h).reduce((sum, p) => sum + p.length * p.height, 0);

describe("wall pieces", () => {
  it("tiles a solid wall", () => {
    expect(wallPieces({ length: 400, openings: [] }, 300)).toEqual([
      { start: 0, length: 400, bottom: 0, height: 300 },
    ]);
  });
  it("leaves exactly the opening areas uncovered for 1 and 3 openings", () => {
    const one = { length: 400, openings: [opening(200, 90)] };
    expect(area(one, 300)).toBe(400 * 300 - 90 * 210);
    const three = {
      length: 900,
      openings: [opening(700, 120, 90, 135), opening(150, 90), opening(420, 150, 90, 135)],
    };
    expect(area(three, 300)).toBe(900 * 300 - 90 * 210 - 2 * 0 - 120 * 135 - 150 * 135);
    const starts = wallPieces(three, 300).map((p) => p.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
  it("clamps openings to a low cutaway height and to the wall ends", () => {
    const cut = wallPieces({ length: 300, openings: [opening(150, 120, 90, 135)] }, 62);
    // Below a 0.62 m cut only the sill piece and the piers remain.
    expect(cut.every((p) => p.bottom + p.height <= 62)).toBe(true);
    expect(area({ length: 300, openings: [opening(150, 120, 90, 135)] }, 62)).toBe(300 * 62);
    const edge = wallPieces({ length: 200, openings: [opening(20, 100)] }, 300);
    expect(edge[0].start).toBe(0);
    expect(area({ length: 200, openings: [opening(20, 100)] }, 300)).toBe(
      200 * 300 - 70 * 210,
    );
  });
});

describe("derived walls", () => {
  it("attaches each automatic opening to the segment that contains it", () => {
    for (const { project } of corpus().slice(0, 12))
      for (const floor of project.floors) {
        const geometry = floorForGeometry(project, floor.id);
        const segments = deriveWallSegments(geometry);
        const auto = autoOpenings(geometry, project.plot.road, segments);
        const walls = deriveWalls(geometry, project.plot.road);
        expect(walls.flatMap((w) => w.openings)).toHaveLength(auto.length);
        for (const o of auto) {
          const wall = segmentAt(segments, o.axis, o.line, o.center)!;
          expect(wall.id).toBe(o.wallId);
          expect(o.center - wallStart(wall)).toBe(wall.length / 2);
        }
      }
  });
  it("explicit floor openings replace the automatic ones", () => {
    const { project } = corpus()[0];
    const floor = floorForGeometry(project, project.floors[0].id);
    const wall = deriveWallSegments(floor).find((w) => w.exterior && w.length >= 300)!;
    const custom = {
      ...floor,
      openings: [
        {
          id: "win-a",
          kind: "window" as const,
          axis: wall.axis,
          line: wall.axis === "x" ? wall.z : wall.x,
          center: wallStart(wall) + 80,
          width: 100,
          height: 120,
          sill: 90,
        },
        {
          id: "win-b",
          kind: "picture-window" as const,
          axis: wall.axis,
          line: wall.axis === "x" ? wall.z : wall.x,
          center: wallStart(wall) + wall.length - 90,
          width: 120,
          height: 180,
          sill: 40,
        },
      ],
    };
    const walls = deriveWalls(custom, project.plot.road);
    const target = walls.find((w) => w.id === wall.id)!;
    expect(target.openings.map((o) => o.id)).toEqual(["win-a", "win-b"]);
    expect(target.openings.every((o) => !o.auto)).toBe(true);
    expect(walls.flatMap((w) => w.openings)).toHaveLength(2);
  });
  it("reports the rooms on each side of an interior wall", () => {
    let checked = 0;
    for (const { project } of corpus())
      for (const f of project.floors) {
        const floor = floorForGeometry(project, f.id);
        for (const wall of deriveWallSegments(floor)) {
          const [plus, minus] = wallSideRooms(floor, wall);
          if (plus && minus) {
            expect(plus).not.toBe(minus);
            checked++;
          }
          if (wall.exterior) expect(plus === null || minus === null).toBe(true);
        }
      }
    expect(checked).toBeGreaterThan(10);
  });
});
